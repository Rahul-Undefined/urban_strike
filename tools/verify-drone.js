/* verify-drone — the strike drone's rules, asserted by flying one.

   THE DESIGN THIS PROTECTS

   The request was a drone that finds an enemy on its own and kills them,
   guaranteed. What shipped is a drone that finds an enemy on its own and kills
   them UNLESS SOMEBODY ANSWERS IT. That difference is the entire balance of the
   weapon and it lives in four properties, all of which are easy to erase with a
   well-meaning tweak:

     1. It can be shot down, and a destroyed drone harms nobody.
     2. Its target is warned before the dive.
     3. It never selects a team-mate.
     4. It does not exist in bot modes.

   Raise its health and it stops being answerable. Delete the lock phase and the
   warning never lands. Drop the side check and it becomes a squad-wipe. Let it
   into Strike Team and it trivialises the mode. So each is a test.

   The flight is driven for real against the actual module — a config-only gate
   would pass a drone that never reaches its target.

   Run: node tools/verify-drone.js */

const path = require('path');
const CFG = require(path.join(__dirname, '..', 'public/src/config/index.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

let T = 0;
const emitted = [];
const damaged = [];
const io = { to: (who) => ({ emit: (ev, d) => emitted.push({ who, ev, d }) }) };
const Drones = require(path.join(__dirname, '..', 'server/lib/drones.js'))({
  io, now: () => T, CFG,
  applyDamage: (room, victim, dmg, by, w) => { damaged.push({ v: victim.id, dmg, by, w }); },
  modeInfo: (room) => ({ teams: !!CFG.MODES[room.settings.mode].teams })
});

function mkRoom(mode) {
  return { code: 'D', state: 'playing', players: new Map(), settings: { mode, map: 'urban' }, drones: [] };
}
function mkP(id, team, x, z, extra) {
  return Object.assign({ id, team, alive: true, hp: 100, pos: [x, 0.95, z],
    drones: CFG.GEAR.drone.start, protUntil: 0 }, extra || {});
}
function fly(room, seconds) {
  const dt = 1 / 20;
  for (let i = 0; i < seconds * 20; i++) { T += dt * 1000; Drones.tick(room, dt); }
}

console.log('--- config sanity ---');
const S = CFG.GEAR.drone;
ok(S.start === 2, 'a player carries two drones [' + S.start + ']');
ok(S.maxCarry > S.start, 'more can be looted [max ' + S.maxCarry + ']');
ok(S.dmg >= CFG.PLAYER.hp, 'a connecting drone is lethal [' + S.dmg + ' vs ' + CFG.PLAYER.hp + ' hp]');
ok(S.radius < CFG.THROWS.frag.radius,
  'its blast is tighter than a frag [' + S.radius + ' vs ' + CFG.THROWS.frag.radius + ']');
/* ANSWERABLE. Every weapon in the game must kill a drone inside one short
   burst, or "shoot it down" is advice rather than counter-play. */
/* Gear slots are excluded: the drone itself now occupies a weapon slot so it
   can be scrolled to, and it deals no damage — including it made "the weakest
   weapon" zero and the assertion meaningless. */
const weakest = Math.min.apply(null, CFG.WEAPON_ORDER
  .filter(w => CFG.WEAPONS[w].type !== 'melee' && !CFG.WEAPONS[w].radius && !CFG.WEAPONS[w].gear)
  .map(w => CFG.WEAPONS[w].dmg * (CFG.WEAPONS[w].pellets || 1)));
/* v1.0z (Rahul: "shooting it down thoda competitive karo"): 45 -> 110 hp. The
   old rule — two hits from the weakest gun — is exactly the tap-kill he asked
   to lose. The new bar: a full magazine of the weakest gun still downs it. */
ok(S.hp > weakest * 2 && S.hp <= weakest * 4,
  'a drone takes three or four hits from the weakest gun — a burst, not a tap, and not a chore [drone ' + S.hp + ' hp, weakest shot ' + weakest + ']');
ok(S.lockSec > 0, 'there is a lock phase, which is when the warning lands');
ok(S.armSec > 0, 'it cannot be shot down before it clears the launcher');
ok(S.maxLifeSec > 0 && S.maxLifeSec < 60, 'it never loiters forever [' + S.maxLifeSec + 's]');

console.log('\n--- it will not launch into an empty sky ---');
{
  const room = mkRoom('ffa');
  const a = mkP('A', null, 0, 0);
  room.players.set('A', a);
  const r = Drones.launch(room, a);
  ok(!r.ok, 'a launch with no valid target is refused [' + (r.err || '') + ']');
  ok(a.drones === CFG.GEAR.drone.start, 'and the drone is NOT spent [' + a.drones + ' left]');
}

console.log('\n--- it hunts, warns, and kills ---');
{
  emitted.length = 0; damaged.length = 0;
  const room = mkRoom('ffa');
  const a = mkP('A', null, 0, 0), b = mkP('B', null, 60, 60);
  room.players.set('A', a); room.players.set('B', b);
  const r = Drones.launch(room, a);
  ok(r.ok, 'launch accepted with an enemy on the map');
  ok(a.drones === CFG.GEAR.drone.start - 1, 'one drone spent [' + a.drones + ' left]');
  fly(room, 20);
  const warns = emitted.filter(e => e.ev === 'droneWarn' && e.who === 'B');
  ok(warns.length > 0, 'the target was warned before it landed [' + warns.length + ' warnings]');
  const hit = damaged.filter(x => x.v === 'B');
  ok(hit.length > 0, 'the target was hit');
  ok(hit.length && hit[0].dmg >= CFG.PLAYER.hp, 'and the hit was lethal [' + (hit[0] || {}).dmg + ']');
  ok(hit.length && hit[0].by === 'A', 'the kill is credited to the launcher');
  ok(room.drones.length === 0, 'the drone is gone after it detonates');
}

console.log('\n--- shooting it down harms nobody ---');
{
  emitted.length = 0; damaged.length = 0;
  const room = mkRoom('ffa');
  const a = mkP('A', null, 0, 0), b = mkP('B', null, 40, 0);
  room.players.set('A', a); room.players.set('B', b);
  Drones.launch(room, a);
  T += CFG.GEAR.drone.armSec * 1000 + 50;         // let it arm
  fly(room, 1);
  const id = room.drones[0] && room.drones[0].id;
  ok(!!id, 'a drone is airborne to shoot at');
  const res = Drones.damage(room, id, CFG.GEAR.drone.hp + 10, 'B');
  ok(res && res.destroyed, 'it can be destroyed in flight');
  ok(damaged.length === 0, 'a destroyed drone damages NOBODY [' + damaged.length + ' hits]');
  const boom = emitted.filter(e => e.ev === 'droneBoom');
  ok(boom.length === 1 && boom[0].d.lethal === false, 'the airburst is flagged non-lethal');
  ok(room.drones.length === 0, 'and it is removed');
}

console.log('\n--- it cannot be aimed at a team-mate ---');
{
  const room = mkRoom('t5');
  const a = mkP('A', 'a', 0, 0);
  room.players.set('A', a);
  room.players.set('A2', mkP('A2', 'a', 5, 5));
  room.players.set('A3', mkP('A3', 'a', -5, 5));
  ok(Drones.candidates(room, a).length === 0, 'a squad with no enemies offers no targets');
  ok(!Drones.launch(room, a).ok, 'so the launch is refused rather than hunting a friend');
  room.players.set('B', mkP('B', 'b', 50, 50));
  const pool = Drones.candidates(room, a);
  ok(pool.length === 1 && pool[0].id === 'B', 'with an enemy present, only the enemy is a target');
}

console.log('\n--- friendly fire on detonation ---');
{
  damaged.length = 0;
  const room = mkRoom('t5');
  const a = mkP('A', 'a', 0, 0);
  const friend = mkP('A2', 'a', 50, 50);     // standing right next to the victim
  const foe = mkP('B', 'b', 50, 50);
  room.players.set('A', a); room.players.set('A2', friend); room.players.set('B', foe);
  Drones.launch(room, a);
  fly(room, 20);
  const hitFoe = damaged.some(x => x.v === 'B');
  const hitFriend = damaged.some(x => x.v === 'A2');
  ok(hitFoe, 'the enemy standing at the impact point is hit');
  ok(!hitFriend, 'the TEAM-MATE standing at the same point is not');
}

console.log('\n--- no bot mode exists to refuse drones ---');
/* v1.0d: Bot Mode was removed at Rahul's request. The old rule ("a drone in
   Strike Team would trivialise the mode") has nothing left to guard; what
   remains to assert is that drones are available in every mode that exists
   and that no bot-fielding mode or helper can come back unnoticed. */
ok(!CFG.botsAllowed && !CFG.backfillAllowed, 'the bot-mode predicates are gone from CFG');
ok(Object.keys(CFG.MODES).every(m => !CFG.MODES[m].botmode && !CFG.MODES[m].vsBots && !CFG.MODES[m].practice),
  'no mode fields bots, so a drone is refused nowhere');
ok(!!CFG.LOOT_ITEMS.drone && CFG.LOOT_ITEMS.drone.kind === 'gear',
  'drones can be looted as gear');
ok((CFG.AIRDROP.exoticPool || []).indexOf('drone') >= 0,
  'and they appear in airdrop crates');

/* ===== v2.3 - THE HUNTER (same module, kind 'hunter') ===== */
console.log('--- the hunter drone ---');
{
  /* a harness with ONE wall: a collider slab at x 10, z -5..5, 0..3 m — the LOS the hunter respects */
  const wallCols = [[9.7, 0, -8, 10.3, 14, 8, 0]];   // 14 m tall: the hunter at 9 m cannot see over it
  const seg = (cols, ax, ay, az, bx, by, bz) => {   // a tiny segment-vs-AABB test, enough for one slab
    for (const c of cols) { let t0 = 0, t1 = 1; const d = [bx - ax, by - ay, bz - az], o = [ax, ay, az]; let hit = true;
      for (let k = 0; k < 3; k++) { const lo = c[k], hi = c[k + 3]; if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo || o[k] > hi) { hit = false; break; } continue; } let ta = (lo - o[k]) / d[k], tb = (hi - o[k]) / d[k]; if (ta > tb) { const q = ta; ta = tb; tb = q; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { hit = false; break; } }
      if (hit) return true; } return false; };
  const DronesH = require(path.join(__dirname, '..', 'server/lib/drones.js'))({
    io, now: () => T, CFG, applyDamage: (room, victim, dmg, by, w) => { damaged.push({ v: victim.id, dmg, by, w }); },
    modeInfo: (room) => ({ teams: !!CFG.MODES[room.settings.mode].teams }),
    colliders: () => wallCols, segmentBlocked: seg
  });
  const H = CFG.GEAR.hunter;
  const room = mkRoom('ffa');
  const a = mkP('A', null, 0, 0, { hunters: 1, drones: 0 }), b = mkP('B', null, 0, 20);   // B 20 m south, open ground; A has no strike drone
  room.players.set('A', a); room.players.set('B', b);
  ok(DronesH.launch(room, a).ok === false, 'with no strike drones the plain launch is refused (the hunter stock is separate)');
  const r = DronesH.launch(room, a, 'hunter');
  ok(r.ok && r.left === 0 && room.drones.length === 1 && room.drones[0].kind === 'hunter', 'a hunter launches from the hunter stock, not the drone stock [' + JSON.stringify(r) + ']');
  damaged.length = 0; emitted.length = 0;
  const flyH = (sec) => { const dt = 1 / 20; for (let i = 0; i < sec * 20; i++) { T += dt * 1000; DronesH.tick(room, dt); } };
  flyH(6);
  const fires = emitted.filter(e => e.ev === 'droneFire').length, dmgB = damaged.filter(x => x.v === 'B' && x.w === 'hunter').reduce((s, x) => s + x.dmg, 0);
  ok(fires >= 6 && dmgB >= 3 * H.dmg, 'in six seconds over open ground it has fired ' + fires + ' times and done ' + dmgB + ' to B (tag hunter, credited to A)');
  ok(damaged.every(x => x.by === 'A' && x.w === 'hunter'), 'every hit is the owner\'s kill, tagged hunter');
  const d = room.drones[0];
  ok(Math.abs(d.pos[1] - H.cruiseY) < 0.5 && Math.hypot(d.pos[0] - b.pos[0], d.pos[2] - b.pos[2]) <= H.standoff + 2, 'it holds cruise height and stands off ~' + H.standoff + ' m [' + d.pos.map(v => v.toFixed(1)).join(',') + ']');
  ok(emitted.some(e => e.ev === 'droneWarn' && e.who === 'B' && e.d.k === 'hunter'), 'B was warned when it acquired them');
  /* v2.7: behind the wall it HUNTS. B moves to x 20 (the 14 m slab at x 10
     between); the hunter holds fire while the line is blocked, closes past
     the slab, and fires once it has the line — a wall is cover, not an escape. */
  b.pos = [20, 0.95, 0]; d.pos = [0, H.cruiseY, 0]; d.lastSeen = T; damaged.length = 0; emitted.length = 0;
  flyH(0.4);
  ok(damaged.length === 0 && d.target === 'B', 'with the wall between them it holds fire but keeps the target [' + damaged.length + ' hits, target ' + d.target + ']');
  flyH(4);
  ok(d.pos[0] > 10.3 && damaged.length > 0, 'it flies past the slab and opens fire once it has the line [x ' + d.pos[0].toFixed(1) + ', ' + damaged.length + ' hits]');
  /* v2.7: a ROOF is different — close in and still blind for loseSec, it drops the target and shuns them for 6 s */
  const roof = [15, 3, -6, 25, 4, 6, 0];
  wallCols.push(roof); d.pos = [20, H.cruiseY, 0]; d.lastSeen = T; damaged.length = 0;
  flyH(H.loseSec + 1);
  ok(damaged.length === 0 && d.target === null && d.shun && d.shun.B, 'under a roof at close range: no fire, target dropped after loseSec and shunned [' + damaged.length + ' hits]');
  wallCols.pop();
  /* the bounty: B shoots it down and is granted a HUNTER, not a strike drone */
  b.hunters = 0; b.drones = 0; T += 100;
  const res = DronesH.damage(room, d.id, 999, 'B');
  ok(res && res.destroyed && b.hunters === 1 && b.drones === 0, 'shot down: B is granted a hunter (not a strike drone) [hunters ' + b.hunters + ', drones ' + b.drones + ']');
  ok(emitted.some(e => e.ev === 'grant' && e.who === 'B' && e.d.g === 'hunter'), 'and told so with a hunter grant');
  /* lifetime: a fresh one over an empty map self-destructs at lifeSec, harming nobody */
  a.hunters = 1; damaged.length = 0; emitted.length = 0;
  const r2 = DronesH.launch(room, a, 'hunter'); room.players.delete('B');
  ok(r2.ok, 'a hunter launches even with nobody in sight (it patrols)');
  flyH(H.lifeSec + 1);
  ok(room.drones.length === 0 && damaged.length === 0 && emitted.some(e => e.ev === 'droneBoom' && e.d.lethal === false), 'lifeSec later it is gone, harmlessly');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
