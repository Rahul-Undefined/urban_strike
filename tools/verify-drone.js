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
ok(S.hp <= weakest * 2,
  'the weakest weapon downs a drone in two hits [drone ' + S.hp + ' hp, weakest shot ' + weakest + ']');
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

console.log('\n--- not in bot modes ---');
/* The rule lives in server.js as a CFG.botsAllowed check, so assert the
   predicate covers exactly the modes it should. A drone in Strike Team would
   trivialise a mode whose whole point is practising your aim. */
['bots', 'co1', 'co2', 'co3', 'co4', 'co6', 'co10'].forEach(m =>
  ok(CFG.botsAllowed(m), m + ': is a bot mode, so drones are refused there'));
['ffa', 't2', 't5', 't10', 'sq2', 'sq4', 'ls', 'lsq2', 'lsq4'].forEach(m =>
  ok(!CFG.botsAllowed(m), m + ': drones are available'));
ok(!!CFG.LOOT_ITEMS.drone && CFG.LOOT_ITEMS.drone.kind === 'gear',
  'drones can be looted as gear');
ok((CFG.AIRDROP.exoticPool || []).indexOf('drone') >= 0,
  'and they appear in airdrop crates');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
