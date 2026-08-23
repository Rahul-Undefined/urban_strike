/* verify-nuke.js — v10.10

   WHY THIS GATE EXISTS

   The killhouse nuke is the most attractive thing in this game to fake and the
   easiest to get subtly wrong. Four rules have to hold at once and three of
   them are invisible in normal play:

     1. It is killhouse-only. A streak on Urban must award nothing.
     2. It costs five kills and dying resets it — including dying while the
        target map is open, which is the entire point of the reward.
     3. It never hurts the caller or his team, and that is re-checked on EVERY
        damage tick, because players move during the ten seconds.
     4. A client that asks for a strike it did not earn gets nothing.

   Rule 3 is the one a play session will not catch: a teammate who happens not
   to walk into the circle proves nothing. Rule 4 cannot be tested by playing
   at all.

   This runs the REAL server/lib/nuke.js against fake io/applyDamage, so the
   thing under test is shipping code and not a description of it. */
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

const sent = [];
const io = { to: (id) => ({ emit: (ev, d) => sent.push({ id, ev, d }) }) };
let T = 1000; const now = () => T;
const dmg = [];
const applyDamage = (room, q, amount, by, src) => {
  dmg.push({ v: q.id, amount, by, src });
  q.hp -= amount; if (q.hp <= 0) q.alive = false;
};
const Nuke = require('../server/lib/nuke.js')({ io, now, applyDamage });
const CFG = require('../public/src/config/index.js');

const mkRoom = (map, mode) => ({ code: 'R', state: 'playing', settings: { map, mode: mode || 'ffa' }, players: new Map() });
const mkP = (id, team, x, z, hp) => ({ id, name: id, team: team || null, alive: true, out: false, hp: hp || 100, streak: 0, pos: [x || 0, 0.96, z || 0] });

console.log('--- the award is killhouse-only and costs five ---');
let room = mkRoom('killhouse'); const a = mkP('A'); room.players.set('A', a);
for (let i = 0; i < 4; i++) { a.streak++; Nuke.onKill(room, a); }
ok(!a.nukeArmed, 'four kills in a row does not arm it');
a.streak++; Nuke.onKill(room, a);
ok(a.nukeArmed === true, 'the fifth does');
ok(sent.filter(m => m.ev === 'nukeReady').every(m => m.id === 'A'),
  'nukeReady goes to the earner alone, never the room');

const urban = mkRoom('urban'); const u = mkP('U'); urban.players.set('U', u);
for (let i = 0; i < 9; i++) { u.streak++; Nuke.onKill(urban, u); }
ok(!u.nukeArmed, 'nine kills on urban arms nothing — the guard is on the MAP');

/* v10.12: the guard reads CFG.MAPS[map].smallMap, not a map name. Every small
   map must get the killstreak automatically — a name check would have given
   Sunset Row the whole rule set EXCEPT this, which is the kind of gap nobody
   reports because nothing looks broken, it just never happens. */
Object.keys(CFG.MAPS).filter(m => CFG.MAPS[m].smallMap).forEach(m => {
  const r = mkRoom(m); const q = mkP('S_' + m); r.players.set(q.id, q);
  for (let i = 0; i < 5; i++) { q.streak++; Nuke.onKill(r, q); }
  ok(q.nukeArmed === true, m + ': is flagged smallMap, so it gets the killstreak');
  Nuke.requestStrike(r, q, 9999, 9999);
  const B = CFG.MAPS[m].bound;
  ok(r.nukes.length === 1 && Math.abs(r.nukes[0].x) <= B,
    m + ': clamps to its OWN bound [' + B + '], not a hardcoded one');
});
Object.keys(CFG.MAPS).filter(m => !CFG.MAPS[m].smallMap).forEach(m => {
  const r = mkRoom(m); const q = mkP('B_' + m); r.players.set(q.id, q);
  for (let i = 0; i < 9; i++) { q.streak++; Nuke.onKill(r, q); }
  ok(!q.nukeArmed, m + ': is a full-size map and gets no killstreak');
});

console.log('\n--- dying loses it, which is the whole reward ---');
sent.length = 0;
Nuke.clearArmed(room, a, 'died');
ok(a.nukeArmed === false, 'death clears the armed flag');
ok(sent.some(m => m.ev === 'nukeLost'), 'and the client is told, so the banner clears');
Nuke.requestStrike(room, a, 0, 0);
ok(!room.nukes || !room.nukes.length, 'a strike sent after dying is refused');

console.log('\n--- an unearned strike is refused ---');
const cheat = mkP('C'); room.players.set('C', cheat);
Nuke.requestStrike(room, cheat, 0, 0);
ok(!room.nukes || !room.nukes.length, 'a player who never earned one gets nothing back');
const dead = mkP('D'); dead.alive = false; dead.nukeArmed = true; room.players.set('D', dead);
Nuke.requestStrike(room, dead, 0, 0);
ok(!room.nukes || !room.nukes.length, 'nor does a dead player holding a stale flag');

console.log('\n--- friendly fire is refused, per tick ---');
room = mkRoom('killhouse');
const caller = mkP('K', 'a', 0, 0), mate = mkP('M', 'a', 1, 1),
      foe = mkP('F', 'b', 2, 2, 100000), far = mkP('X', 'b', 28, 15);
[caller, mate, foe, far].forEach(p => room.players.set(p.id, p));
caller.streak = 5; Nuke.onKill(room, caller);
Nuke.requestStrike(room, caller, 0, 0);
ok(room.nukes.length === 1, 'the strike registers');
ok(caller.nukeArmed === false, 'and is spent at launch, so it cannot be fired twice');
T += 600; dmg.length = 0; Nuke.tick(room);
ok(!dmg.some(d => d.v === 'K'), 'the caller is never damaged by his own strike');
ok(!dmg.some(d => d.v === 'M'), 'a TEAMMATE standing in it is never damaged');
ok(dmg.some(d => d.v === 'F'), 'an enemy standing in it IS');
ok(!dmg.some(d => d.v === 'X'), 'an enemy outside the radius is not');

/* The teammate STARTS outside and walks in. A launch-time check would have
   already decided he was safe and would pass this by accident; only a per-tick
   check passes it for the right reason. */
mate.pos = [0, 0.96, 0];
T += 600; dmg.length = 0; Nuke.tick(room);
ok(!dmg.some(d => d.v === 'M'), 'a teammate who walks in MID-STRIKE is still safe');
ok(dmg.some(d => d.v === 'F'), 'and the enemy is still being hit at the same moment');

console.log('\n--- it runs for its stated duration and stops ---');
let ticked = 0;
for (let i = 0; i < 60; i++) { T += 500; dmg.length = 0; Nuke.tick(room); if (dmg.length) ticked++; }
ok(room.nukes.length === 0, 'the strike expires on its own');
ok(ticked > 0 && ticked <= Math.ceil(Nuke.DURATION * 2) + 1,
  'damage ticks are bounded by the duration [' + ticked + ' over ' + Nuke.DURATION + 's]');
T += 500; dmg.length = 0; Nuke.tick(room);
ok(dmg.length === 0, 'and nothing is damaged after it ends');

console.log('\n--- a click past the wall is clamped, not dropped ---');
room = mkRoom('killhouse'); const g = mkP('G'); room.players.set('G', g);
g.streak = 5; Nuke.onKill(room, g); Nuke.requestStrike(room, g, 9999, -9999);
const B = CFG.MAPS.killhouse.bound;
ok(room.nukes.length === 1, 'it still fires — a near-miss on a small map is not an exploit');
ok(Math.abs(room.nukes[0].x) <= B && Math.abs(room.nukes[0].z) <= B,
  'and lands inside the map bound [' + B + ']');

console.log('\n--- nothing survives the whistle ---');
g.nukeArmed = true;
Nuke.reset(room);
ok(room.nukes.length === 0, 'no strike runs into the next round');
ok(g.nukeArmed === false, 'and no award is carried across a match boundary');

console.log('\n--- the recon visor is configured as drop-only, per life ---');
const v = CFG.LOOT_ITEMS.visor;
ok(!!v && v.kind === 'gear' && v.g === 'visor', 'the visor exists as a gear item');
ok(v.drop === 1, 'it is airdrop-only — a floor spawn would mean someone has it from the first minute');
ok(v.rar === 'l', 'at legendary rarity');
const initSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
ok(/p\.visor = false;/.test(initSrc) &&
   initSrc.indexOf('p.visor = false;') < initSrc.indexOf('p.drones = 0;'),
  'it is cleared in spawnPlayer BEFORE the per-match block — per LIFE, not per match');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
