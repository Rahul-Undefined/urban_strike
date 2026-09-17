/* verify-heli.js — v1.0l
   The helicopter is a state machine on the server clock plus a pose function;
   both are pure, so: the route stays over the map, the pose climbs/cruises/
   descends, damage is by weapon class and no class makes it a five-round kill,
   boarding takes three seconds, riders who leave the cabin in the air die and
   the last shooter is credited, shooting it down kills the riders and credits
   the shooter, and it comes back five minutes after take-off. */
const fs = require('fs'), path = require('path');
const CFG = require('../public/src/config/index.js');
const Bots = require('../server/lib/bots.js')({});
let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }
const H = CFG.HELI;
/* a route to reason about the pose with (the gate rolls its own like the server) */
const P = Bots.pathFrom(CFG.heliRoute(H, 12345).waypoints, CFG.heliRoute(H, 12345).fillet);

console.log('--- the route wanders and the flight is endless ---');
{
  let onMap = true, minLen = 99, distinct = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const R = CFG.heliRoute(H, seed), W = R.waypoints;
    if (W.length !== H.routeN + 2) minLen = Math.min(minLen, W.length);
    for (const p of W) if (Math.abs(p[0]) > 110 || Math.abs(p[1]) > 110) onMap = false;
    distinct.add(W.slice(2, 6).map(p => Math.round(p[0]) + ',' + Math.round(p[1])).join('|'));
  }
  ok(minLen === 99, 'every seed makes a ' + (H.routeN + 2) + '-point route');
  ok(onMap, 'no waypoint leaves the map');
  ok(distinct.size > 350, 'the route is different almost every match (' + distinct.size + ' distinct of 400) — not a fixed path');
  ok(Math.hypot(P.at(0).x - H.pad[0], P.at(0).z - H.pad[1]) < 0.5, 'the route passes over the pad it starts from');
  // endless cruise: the pose keeps moving long past the old ~52 s flight, and never leaves altitude
  const tOld = H.climbSec + P.length / H.speed + H.landSec;
  let allCruise = true, moved = 0, prev = null;
  for (let t = tOld + 5; t < tOld + 5 + P.length / H.speed; t += 1) { const q = CFG.heliPoseAt(H, P, t); if (q.phase !== 'cruise' || Math.abs(q.y - H.alt) > 1e-6) allCruise = false; if (prev) moved += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q; }
  ok(allCruise, 'well past the old flight time every sample is still cruising at altitude — the loop never ends on its own');
  ok(moved > P.length * 0.9, 'and over the next lap it travels a full loop again (' + moved.toFixed(0) + ' m)');
  // the return leg brings it home
  const from = CFG.heliPoseAt(H, P, H.climbSec + 30);
  const r0 = CFG.heliReturnPose(H, from, 0.1), rEnd = CFG.heliReturnPose(H, from, 999);
  ok(r0.phase === 'return' && rEnd.phase === 'down' && Math.abs(rEnd.x - H.pad[0]) < 0.5 && Math.abs(rEnd.z - H.pad[1]) < 0.5, 'the return leg flies it back to the pad and sets it down');
  let maxDy = 0; for (let t = 0; t < H.climbSec + 6; t += 0.1) maxDy = Math.max(maxDy, Math.abs(CFG.heliPoseAt(H, P, t + 0.1).y - CFG.heliPoseAt(H, P, t).y));
  ok(maxDy < 1.2, 'the climb is smooth (' + maxDy.toFixed(2) + ' m/0.1 s)');
}

console.log('--- damage: the v1.0x table ---');
const dmg = w => CFG.heliDamageFor(H, CFG.WEAPONS, w);
ok(H.hp === 5000, 'the hull has 5000 points');
ok(dmg('akm') === 15 && dmg('m4a1') === 12 && dmg('awm') === 20 && dmg('sniper') === 20 && dmg('shotgun') === 0 && dmg('aa12') === 0, 'AKM 15, M4 12, snipers 20, shotguns 0 — per shot');
ok(dmg('knife') === 0 && dmg('bow') === 0 && dmg('drone') === 0 && dmg('emp') === 0 && dmg('c4') === 0, 'knives, bows, drones, EMP and C4 do nothing to the hull');
ok(dmg('rocket') === 2500 && dmg('seeker') === 2500 && Math.ceil(H.hp / dmg('rocket')) === 2, 'the RPG-L and the SEEKER each take half the hull: two and it is down');
ok(Math.ceil(H.hp / dmg('akm')) >= 300, 'an AKM alone needs ' + Math.ceil(H.hp / dmg('akm')) + ' rounds — a squad can wear it down, one rifle cannot swat it');
ok(CFG.LOOT_ITEMS.wpn_rocket && CFG.LOOT_ITEMS.wpn_rocket.rar === 'l' && (CFG.AIRDROP.exoticPool || []).indexOf('wpn_rocket') >= 0, 'the launcher is legendary crate loot (the airdrop exotic pool)');
ok(CFG.WEAPONS.rocket.mag === 1 && CFG.WEAPONS.rocket.reserve === 2, 'one round loaded, two spare: a kill costs the crate and every shot');

console.log('--- the machine, on the server ---');
let T0 = 5000000, killed = [], emitted = [];
const io = { to: id => ({ emit: (ev, d) => emitted.push({ to: id, ev, d }) }) };
const Srv = require('../server/lib/heli.js')({ io, now: () => T0, applyDamage: (room, v, dmg2, by, w) => { v.alive = false; killed.push({ id: v.id, by, w }); },
  modeInfo: () => ({ teams: false }), pathFrom: (wp, fillet) => Bots.pathFrom(wp, fillet) });
const room = { code: 'H', state: 'playing', settings: { map: 'urban', mode: 'ffa' }, players: new Map() };
const half = CFG.PLAYER.standH / 2;
const mk = (id, x, y, z) => ({ id, name: id, alive: true, pos: [x, y, z] });
ok(Srv.start(room) && room.heli.state === 'pad' && room.heli.hp === H.hp, 'start() puts a full-health helicopter on the pad');
room.heli.seed = 12345;   /* pin the room's route to the P this gate reasons with, so poses line up */
ok(Srv.start({ settings: { map: 'metro' } }) === null, 'not on Metro');
/* v1.0m: boarding is Z near the machine — the server seats the player */
const rider = mk('R', H.pad[0] + 4, half, H.pad[1] + 1);
const bystander = mk('B', H.pad[0] + 12, half, H.pad[1]);
room.players.set('R', rider); room.players.set('B', bystander);
Srv.tick(room);
ok(room.heli.state === 'pad' && !room.heli.boardSince && room.heli.riders.length === 0, 'standing on the pad boards nobody — boarding is an act');
ok(!Srv.board(room, bystander).ok, 'Z from 12 m away is refused');
const b1 = Srv.board(room, rider);
ok(b1.ok && b1.aboard && room.heli.riders[0] === 'R' && room.heli.boardSince === T0, 'Z near the machine boards: seated, listed, the lift-off count starts');
ok(Math.hypot(rider.pos[0] - H.pad[0], rider.pos[2] - H.pad[1]) < 1.5 && Math.abs(rider.pos[1] - (H.padY + H.cabinFloor + half + 0.03)) < 0.01 && rider.justSpawned, 'the server put the rider in the cabin at a seat and flagged the teleport');
ok(emitted.some(e => e.ev === 'heliSeat' && e.to === 'R' && e.d.aboard), 'and told the rider where they sit');
const b2 = Srv.board(room, rider);
ok(b2.ok && !b2.aboard && room.heli.riders.length === 0 && !room.heli.boardSince, 'Z again steps off: unlisted, beside the pad, the count cancelled');
Srv.board(room, rider);
T0 += H.boardSec * 1000 - 200; Srv.tick(room);
ok(room.heli.state === 'pad', 'not yet');
T0 += 400; Srv.tick(room);
room.heli.seed = 12345; room.heli.trail = [];   /* the lift-off re-rolled the seed; pin it to the P this section reasons with */
ok(room.heli.state === 'flying' && room.heli.riders.length === 1 && room.heli.riders[0] === 'R', 'three seconds after boarding: airborne with the one rider');
const tOff = room.heli.t0;
// mid-flight: the rider rides (position follows the pose); the bystander stays on the ground
function ride(q) { const p = CFG.heliPoseAt(H, P, (T0 - tOff) / 1000); q.pos = [p.x, p.y + H.cabinFloor + half, p.z]; }
T0 += (H.climbSec + 8) * 1000; ride(rider); Srv.tick(room);
ok(room.heli.state === 'flying' && room.heli.riders.length === 1 && rider.alive, 'mid-flight the seated rider is aboard and alive');
/* v1.0m: a rider whose reported position trails the machine by a network delay is NOT a faller */
{ const p = CFG.heliPoseAt(H, P, (T0 - tOff) / 1000); const back = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
  rider.pos = [p.x + Math.cos(p.yaw) * -2.6, p.y + H.cabinFloor + half - 0.6, p.z + Math.sin(p.yaw) * -2.6];   // 2.6 m behind, 0.6 m low: 150 ms of lag at speed
  Srv.tick(room);
  ok(rider.alive && room.heli.riders.length === 1, 'a rider trailing 2.6 m behind and 0.6 m below the seat (network lag) stays aboard'); ride(rider); }
// a shot from the ground
const shooter = mk('S', 0, half, 0); room.players.set('S', shooter);
const r0 = Srv.hit(room, shooter, 'akm');
ok(r0.ok && r0.dmg === 15 && room.heli.hp === H.hp - 15, 'an AKM round chips 15 off the hull');
const r1 = Srv.hit(room, shooter, 'rocket');
ok(r1.ok && r1.dmg === 2500 && room.heli.hp === H.hp - 15 - 2500, 'a rocket takes 2500 off the hull');
ok(!Srv.hit(room, shooter, 'rocket').ok, 'a second rocket claim inside the launcher\'s cycle is refused');
T0 += 2000;
ok(emitted.some(e => e.ev === 'heliHp'), 'and the room is told the health');
ok(!Srv.hit(room, rider, 'rocket').ok, 'a rider cannot rocket the machine he is in');
const far = mk('F', 400, half, 400); room.players.set('F', far);
ok(!Srv.hit(room, far, 'ak47').ok, 'a shot from 400 m away is refused');
/* v1.0p/q: position disagreement is NOT a fall. A rider trailing the machine
   along its own recent path stays aboard; only a JUMP (bail) or a client far
   from EVERY recent position for two ticks ends the ride. */
{ const p = CFG.heliPoseAt(H, P, (T0 - tOff) / 1000); rider.pos = [p.x - 9.5, p.y + H.cabinFloor + half - 4, p.z]; }   // 9.5 m behind, 4 m low
T0 += 200; Srv.tick(room);
ok(rider.alive && room.heli.riders.length === 1, 'a rider 9.5 m behind and 4 m below the seat (lag, skew) stays aboard and alive');
ride(rider);
{ const p = CFG.heliPoseAt(H, P, (T0 - tOff) / 1000); rider.pos = [p.x + 40, p.y + H.cabinFloor + half - 14, p.z + 40]; }   // 56 m off and 14 m down: not riding
T0 += 70; Srv.tick(room);
ok(rider.alive && room.heli.riders.length === 1, 'one tick that far away is not yet a fall');
T0 += 70; Srv.tick(room);
ok(!rider.alive && killed.length === 1 && killed[0].w === 'helifall' && killed[0].by === 'S', 'two ticks that far away: dead, tagged helifall, credited to the shooter who hit the machine');
ok(room.heli.state === 'returning', 'with nobody aboard the machine heads home');
/* the jump: the rider says so and dies at once */
{
  T0 += 20000; room.heli.state = 'pad'; room.heli.t0 = T0; room.heli.hp = H.hp; room.heli.riders = []; room.heli.boardSince = 0; room.heli.boardedAt = {}; room.heli.outCount = {};
  const jumper = mk('JMP', H.pad[0] + 3, half + H.padY, H.pad[1]); room.players.set('JMP', jumper);
  const bj = Srv.board(room, jumper); jumper.pos = bj.seat.slice();
  T0 += H.boardSec * 1000 + 100; Srv.tick(room);
  ok(room.heli.state === 'flying', 'a new flight');
  ok(!Srv.bail(room, jumper).ok, 'bailing at 0.1 s (still on the pad) is refused — too low to matter');
  T0 += 6000; const pj = CFG.heliPoseAt(H, P, 6.1); jumper.pos = [pj.x, pj.y + H.cabinFloor + half, pj.z];
  killed = [];
  const bb = Srv.bail(room, jumper);
  ok(bb.ok && !jumper.alive && killed.length === 1 && killed[0].w === 'helifall' && killed[0].by === 'JMP', 'a rider who jumps at altitude dies at once, tagged helifall (nobody hit the machine: no credit)');
  ok(room.heli.riders.length === 0 && room.heli.state === 'returning', 'and the empty machine heads home');
}
/* v1.0o: THE BOARDING RACE. A state update with the OLD position lands right
   after the server seated the rider (the client had already sent it). The
   rider must survive the tick and the lift-off must still happen. */
{
  T0 += 20000; room.heli.state = 'pad'; room.heli.t0 = T0; room.heli.hp = H.hp; room.heli.riders = []; room.heli.boardSince = 0; room.heli.boardedAt = {};
  const late = mk('L', H.pad[0] + 4, half + H.padY, H.pad[1]); room.players.set('L', late);
  const bl = Srv.board(room, late);
  late.pos = [H.pad[0] + 4, half + H.padY, H.pad[1]];              // the stale update overwrites the seat
  T0 += 70; Srv.tick(room);
  ok(bl.ok && room.heli.riders.indexOf('L') >= 0 && room.heli.boardSince > 0, 'a stale position right after boarding does not unseat the rider (boarding grace)');
  late.pos = bl.seat.slice();                                        // the client sat down
  T0 += H.boardSec * 1000; Srv.tick(room);
  ok(room.heli.state === 'flying' && room.heli.riders[0] === 'L', 'and the lift-off happens on time');
  T0 += 1000; late.pos = [H.pad[0] + 4, half + H.padY, H.pad[1]];   // a second stale update during the first second of the climb
  Srv.tick(room);
  ok(late.alive && room.heli.riders.length === 1, 'the fall test waits out the climb\'s first seconds — no phantom fall');
  const heliCl = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/heli.js'), 'utf8');
  ok(/Net\.heliBail\(\)/.test(heliCl) && /lock: rider/.test(heliCl), 'the client reports its jump and locks a listed rider to the floor across frame hitches');
  ok(/socket\.on\('heliBail'/.test(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')), 'the server takes the jump');
  const pL = CFG.heliPoseAt(H, P, (T0 - room.heli.t0) / 1000); late.pos = [pL.x, pL.y + H.cabinFloor + half, pL.z];
  room.heli.state = 'landed'; room.heli.riders = []; room.heli.t0 = T0; room.heli.emptySince = T0; room.heli.flightStart = T0 - 60000;
}
// a fresh flight with two riders, shot down
T0 += 20000; room.heli.state = 'pad'; room.heli.t0 = T0; room.heli.hp = H.hp; room.heli.riders = []; room.heli.boardSince = 0;
const r2 = mk('R2', H.pad[0] + 3, half, H.pad[1]), r3 = mk('R3', H.pad[0] - 3, half, H.pad[1] + 2);
room.players.set('R2', r2); room.players.set('R3', r3);
Srv.board(room, r2); Srv.board(room, r3);
Srv.tick(room); T0 += H.boardSec * 1000 + 100; Srv.tick(room);
ok(room.heli.state === 'flying' && room.heli.riders.length === 2, 'two riders take off together');
const tOff2 = room.heli.t0;
const P2 = Srv.pathFor(room.heli.seed);   /* the route this flight actually rolled */
T0 += (H.climbSec + 10) * 1000;
[r2, r3].forEach(q => { const p = CFG.heliPoseAt(H, P2, (T0 - tOff2) / 1000); q.pos = [p.x, p.y + H.cabinFloor + half, p.z]; });
Srv.tick(room);
killed = [];
let res = null, hits = 0;
while (room.heli.state === 'flying' && hits < 20) { T0 += 2000; res = Srv.hit(room, shooter, 'rocket'); hits++; }
ok(res && res.destroyed && res.n === 2 && hits === 2, 'two rockets bring it down with both riders [' + hits + ' hits]');
ok(killed.length === 2 && killed.every(k => k.w === 'helidown' && k.by === 'S'), 'both riders die, credited to the shooter, tagged helidown');
ok(room.heli.state === 'gone' && emitted.some(e => e.ev === 'heliBoom'), 'the machine is gone and the room saw it burn');
ok(room.heli.respawnAt >= T0 + H.respawnSec * 1000 - 1 && H.respawnSec === 180, 'it comes back ' + H.respawnSec + ' s later — every three minutes');
T0 = room.heli.respawnAt - 1000; Srv.tick(room);
ok(room.heli.state === 'gone', 'not a second early');
T0 = room.heli.respawnAt + 1; Srv.tick(room);
ok(room.heli.state === 'pad' && room.heli.hp === H.hp && room.heli.riders.length === 0, 'and it is back on the pad, full health, empty');

console.log('--- the client, in the order the game really runs ---');
/* v1.0n: net.js applies matchStart.heli, THEN Game.onMatchStart rebuilds the
   map (Heli.init). Build 13 lost the state in that rebuild and the machine
   vanished. Load the real client module and run that order. */
{
  const vm = require('vm'), THREE = require('three');
  function fakeCanvas() { const c = { width: 0, height: 0, style: {} }; const g = new Proxy({}, { get: (t, k) => { if (k === 'canvas') return c; return function () { if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop() {} }; if (k === 'measureText') return { width: 10 }; if (k === 'getImageData') return { data: new Uint8ClampedArray(4) }; }; }, set: () => true }); c.getContext = () => g; return c; }
  const els = {};
  const cx = { console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error, isFinite, isNaN, parseInt, parseFloat, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
    performance: { now: () => Date.now() },
    document: { createElement: t => (t === 'canvas' ? fakeCanvas() : { style: {}, classList: { add() {}, remove() {}, toggle() {} } }), getElementById: id => (els[id] = els[id] || { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, textContent: '' }), addEventListener() {} },
    navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval };
  cx.self = cx; cx.window = cx; cx.globalThis = cx; vm.createContext(cx);
  const bsrc = fs.readFileSync(path.join(__dirname, '..', 'server/lib/bots.js'), 'utf8');
  const files = [...bsrc.matchAll(/'(public\/src\/[^']+\.js)'/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), cx, { filename: f }));
  ['public/src/environment/train.js', 'public/src/environment/heli.js', 'public/src/player/controller.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), cx, { filename: f }));
  const r = vm.runInContext(`(function(){
    var sc = new THREE.Scene(); World.reset(); World.buildMap(sc, 'urban');
    Net = { getMatch: function(){ return { startedAt: 1000, serverOffset: 0 }; }, getMyId: function(){ return 'me'; }, boardHeli: function(idx, cb){ (typeof idx === 'function' ? idx : cb)({ ok: true, aboard: true }); } };
    UI = { toast: function(){}, setHeliHud: function(){}, announce: function(){} }; AudioSys = {};
    Heli.set({ idx: 0, state: 'pad', t0: Date.now(), hp: 5000, riders: [], respawnAt: 0 });   // matchStart.heli, applied by net.js first
    Heli.init(sc, 'urban');                                                          // Game.onMatchStart -> buildWorld -> Heli.init
    Heli.init(sc, 'urban');                                                          // a watchdog rebuild does it again
    Heli.update(0.016);
    var act = Heli.active(), pose = Heli.pose();
    PlayerCtl.alive = true; PlayerCtl.spawnAt([CFG.HELI.pad[0] + 3, CFG.PLAYER.standH / 2 + 0.3, CFG.HELI.pad[1]], 0);
    Heli.update(0.016);
    var near = Heli.canBoard(), boarded = Heli.board();
    var far = (function(){ PlayerCtl.spawnAt([CFG.HELI.pad[0] + 30, 1, CFG.HELI.pad[1]], 0); Heli.update(0.016); return Heli.canBoard(); })();
    Heli.set({ idx: 0, state: 'gone', t0: Date.now(), hp: 0, riders: [], respawnAt: Date.now() + 100000 }); Heli.update(0.016);
    var goneActive = Heli.active();
    return { act: act, pose: pose, near: near, boarded: boarded, far: far, goneActive: goneActive };
  })()`, cx);
  ok(r.act === true && r.pose && Math.abs(r.pose.x - H.pad[0]) < 0.01, 'the machine is on the pad after the map rebuild that follows matchStart');
  /* v1.0s: the hull must never swallow a shot between a rider and the ground */
  const rr = vm.runInContext(`(function(){
    Heli.set({ idx: 0, state: 'flying', t0: Date.now() - 20000, hp: 5000, riders: ['me'], seed: 12345 }); Heli.update(0.016);
    var p = Heli.pose();
    // a rider at the seat aims down at a target 40 m ahead on the ground
    var seat = new THREE.Vector3(p.x, p.y + CFG.HELI.cabinFloor + 1.6, p.z);
    var tgt = new THREE.Vector3(p.x + Math.cos(p.yaw) * 40, 1.0, p.z + Math.sin(p.yaw) * 40);
    var dir = tgt.clone().sub(seat).normalize();
    var fromInside = Heli.rayHit(seat, dir, 400);
    // a ground shooter aims up at the seat through the open side — someone ELSE rides (v1.0y: my own hull is never tested)
    Heli.set({ idx: 0, state: 'flying', t0: Date.now() - 20000, hp: 5000, riders: ['other'], seed: 12345 }); Heli.update(0.016); p = Heli.pose();
    seat = new THREE.Vector3(p.x, p.y + CFG.HELI.cabinFloor + 1.6, p.z);
    var g = new THREE.Vector3(p.x - Math.sin(p.yaw) * 30, 1.6, p.z + Math.cos(p.yaw) * 30);
    var up = seat.clone().sub(g).normalize();
    var fromGround = Heli.rayHit(g, up, 400);
    return { fromInside: fromInside, fromGroundHitsHull: !!fromGround, hullT: fromGround ? fromGround.t : null, dist: g.distanceTo(seat) };
  })()`, cx);
  ok(rr.fromInside === null, 'a rider\'s ray from inside the cabin meets no hull (the box test is skipped from inside)');
  /* v1.0u: the hull covers the riders except through the open door band */
  const rd = vm.runInContext(`(function(){
    Heli.set({ idx: 0, state: 'flying', t0: Date.now() - 20000, hp: 5000, riders: ['other'], seed: 12345 }); Heli.update(0.016);
    var p = Heli.pose(), cs = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    var seat = new THREE.Vector3(p.x, p.y + CFG.HELI.cabinFloor + 1.6, p.z);
    // from the side, at rail-to-roof height: enters through the door band
    var side = new THREE.Vector3(p.x - sn * 30, seat.y + 1.0, p.z + cs * 30);
    var a = Heli.rayHit(side, seat.clone().sub(side).normalize(), 400);
    // from straight below: enters through the floor
    var below = new THREE.Vector3(p.x, p.y - 25, p.z);
    var b = Heli.rayHit(below, seat.clone().sub(below).normalize(), 400);
    // the seat lookup for a listed rider
    Heli.set({ idx: 0, state: 'flying', t0: Date.now() - 20000, hp: 5000, riders: ['A', 'B'], seed: 12345 }); Heli.update(0.016);
    var sA = Heli.seatFor('A'), sB = Heli.seatFor('B'), sZ = Heli.seatFor('nobody');
    var p2 = Heli.pose();
    return { sideOpening: a ? a.opening : null, belowOpening: b ? b.opening : null, seats: sA && sB && !sZ, seatDist: sA ? Math.hypot(sA.x - p2.x, sA.z - p2.z) : null, seatY: sA ? sA.y - p2.y : null, apart: sA && sB ? sA.distanceTo(sB) : null };
  })()`, cx);
  ok(rd.sideOpening === true, 'a shot from the side at rail-to-roof height enters through the open door band — the rider can be hit');
  ok(rd.belowOpening === false, 'a shot from below meets the floor — blocked (tough, not impossible)');
  ok(rd.seats && rd.seatDist < 1.2 && Math.abs(rd.seatY - CFG.HELI.cabinFloor) < 1e-6 && rd.apart > 1.5, 'listed riders are placed at cabin seats (inside, at floor height, apart); an unlisted player has none');
  ok(/hh\.opening/.test(fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8')), 'the hitscan lets a player hit through the hull only via an opening');
  ok(/Heli\.seatFor\(id, seatTmp\)/.test(fs.readFileSync(path.join(__dirname, '..', 'public/src/networking/net.js'), 'utf8')), 'remote riders are drawn at their seats, not at the lagging snapshot');
  ok(rr.fromGroundHitsHull === true && rr.hullT < rr.dist, 'a ground shooter\'s ray does meet the hull before the seat (' + (rr.hullT || 0).toFixed(1) + ' m of ' + rr.dist.toFixed(1) + ')...');
  const wsys2 = fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8');
  ok(/hit\.type === 'player' && hh\.opening && !riderTarget/.test(wsys2), '...but the hitscan lets a PLAYER hit through an opening beat the hull (a rider excepted — v1.0v); the rider\'s own hull is excluded inside Heli.rayHit (v1.0y)');
  ok(!/hit\.remote/.test(wsys2), 'the dead `hit.remote` exemption is gone');
  ok(r.near === true && r.boarded === true, 'near the pad the client offers boarding and Z boards');
  ok(r.far === false, '30 m away it does not');
  ok(r.goneActive === false, 'when the server says gone, the machine is gone (the board counts down)');
}

console.log('--- Q lands it, Z flies it again, it goes after unload ---');
{
  const room2 = { code: 'Q', state: 'playing', settings: { map: 'urban', mode: 'ffa' }, players: new Map() };
  Srv.start(room2); room2.heli.seed = 12345;
  const pilot = mk('P1', H.pad[0] + 3, half + H.padY, H.pad[1]); room2.players.set('P1', pilot);
  const bp = Srv.board(room2, pilot); pilot.pos = bp.seat.slice();
  T0 += H.boardSec * 1000 + 100; Srv.tick(room2);
  ok(room2.heli.state === 'flying', 'boarded and airborne');
  // fly a while, staying seated
  const Pq = Srv.pathFor(room2.heli.seed);
  for (let k = 0; k < 8; k++) { T0 += 5000; const p = CFG.heliPoseAt(H, Pq, (T0 - room2.heli.t0) / 1000); pilot.pos = [p.x, p.y + H.cabinFloor + half, p.z]; Srv.tick(room2); }
  ok(room2.heli.state === 'flying' && pilot.alive, '40 s later still flying with the pilot aboard — no auto-landing');
  // Q: land
  const lr = Srv.land(room2, pilot);
  ok(lr.ok && room2.heli.state === 'returning', 'Q turns it for the pad (returning)');
  // fly the return home
  let guard = 0;
  while (room2.heli.state === 'returning' && guard++ < 200) { T0 += 300; const rp = CFG.heliReturnPose(H, room2.heli.from, (T0 - room2.heli.t0) / 1000); pilot.pos = [rp.x, rp.y + H.cabinFloor + half, rp.z]; Srv.tick(room2); }
  ok(room2.heli.state === 'landed' && pilot.alive, 'it lands at the pad with the pilot alive');
  ok(room2.heli.refuelUntil > T0 && !Srv.board(room2, pilot).ok, 'v1.0x: it is refuelling — Z is refused until the tank is full');
  T0 = room2.heli.refuelUntil + 100; Srv.tick(room2);
  // Z aboard the refuelled machine: fly again
  const rl = Srv.board(room2, pilot);
  ok(rl.ok && rl.relaunch, 'Z aboard the landed machine arms another lift-off (not a step-off)');
  T0 += H.boardSec * 1000 + 100; Srv.tick(room2);
  ok(room2.heli.state === 'flying' && room2.heli.riders.indexOf('P1') >= 0, 'and it flies again with the same pilot');
  // land once more, step off, and let it leave
  Srv.land(room2, pilot); guard = 0;
  while (room2.heli.state === 'returning' && guard++ < 200) { T0 += 300; const rp = CFG.heliReturnPose(H, room2.heli.from, (T0 - room2.heli.t0) / 1000); pilot.pos = [rp.x, rp.y + H.cabinFloor + half, rp.z]; Srv.tick(room2); }
  ok(room2.heli.state === 'landed', 'landed again');
  pilot.pos = [H.pad[0] + 30, half, H.pad[1]]; Srv.tick(room2);       // pilot walks away
  T0 += (H.unloadSec + 1) * 1000; Srv.tick(room2);
  ok(room2.heli.state === 'landed' && room2.heli.refuelUntil > T0, 'v1.0x: nobody re-boards — the machine STAYS on its pad, refuelling (' + Math.ceil((room2.heli.refuelUntil - T0) / 1000) + ' s left)');
  pilot.pos = [H.pad[0] + 2, half + H.padY, H.pad[1]];
  ok(!Srv.board(room2, pilot).ok && /Refuelling/.test(Srv.board(room2, pilot).err || ''), 'boarding during the refuel is refused with the time left');
}

console.log('--- two machines, fuel, refuel (v1.0x) ---');
{
  let killedX = [];
  const SrvX = require('../server/lib/heli.js')({ io, now: () => T0, applyDamage: (room, v) => { v.alive = false; killedX.push(v.id); }, modeInfo: () => ({ teams: false }), pathFrom: (wp, fillet) => Bots.pathFrom(wp, fillet) });
  const rx = { code: 'X', state: 'playing', settings: { map: 'urban', mode: 'ffa' }, players: new Map() };
  SrvX.start(rx);
  ok(rx.helis.length === 2 && rx.helis[0].state === 'pad' && rx.helis[1].state === 'gone' && !rx.helis[1].respawnAt && rx.heli === rx.helis[0], 'two pads: machine A on pad A, machine B not yet scheduled; room.heli is machine A');
  ok(Math.hypot(H.pads[1][0] - H.pads[0][0], H.pads[1][1] - H.pads[0][1]) > 30, 'pad B is well clear of pad A (' + Math.hypot(H.pads[1][0] - H.pads[0][0], H.pads[1][1] - H.pads[0][1]).toFixed(0) + ' m)');
  const pil = mk('PX', H.pads[0][0] + 3, half + H.padY, H.pads[0][1]); rx.players.set('PX', pil);
  const bx = SrvX.board(rx, pil); pil.pos = bx.seat.slice();
  T0 += H.boardSec * 1000 + 100; SrvX.tick(rx);
  ok(rx.helis[0].state === 'flying' && rx.helis[1].respawnAt === T0 + H.secondSpawnSec * 1000, 'the first lift-off books machine B for pad B in ' + H.secondSpawnSec + ' s');
  const PX = SrvX.pathFor(rx.helis[0].seed, rx.helis[0].pad), cfgA = Object.assign({}, H, { pad: rx.helis[0].pad });
  const ride = () => { const q = CFG.heliPoseAt(cfgA, PX, (T0 - rx.helis[0].t0) / 1000); pil.pos = [q.x, q.y + H.cabinFloor + half, q.z]; };
  T0 += H.secondSpawnSec * 1000 + 100; ride(); SrvX.tick(rx);
  ok(rx.helis[1].state === 'pad', 'two minutes later machine B sits on pad B for the other side');
  let steps = 0; while (rx.helis[0].state === 'flying' && steps++ < 200) { T0 += 5000; ride(); SrvX.tick(rx); }
  const flew = (T0 - rx.helis[0].flightStart) / 1000;
  ok(rx.helis[0].state === 'returning' && flew >= H.fuelSec && flew < H.fuelSec + 6, 'after ' + H.fuelSec + ' s of fuel the machine turns for home on its own [' + flew.toFixed(0) + ' s]');
  let g2 = 0; while (rx.helis[0].state === 'returning' && g2++ < 300) { T0 += 300; const rp = CFG.heliReturnPose(cfgA, rx.helis[0].from, (T0 - rx.helis[0].t0) / 1000); pil.pos = [rp.x, rp.y + H.cabinFloor + half, rp.z]; SrvX.tick(rx); }
  ok(rx.helis[0].state === 'landed' && pil.alive && rx.helis[0].refuelUntil - T0 > H.refuelSec * 1000 - 500, 'it lands with the pilot alive and starts a ' + H.refuelSec + ' s refuel');
  ok(!SrvX.board(rx, pil).ok, 'it cannot lift during the refuel');
  T0 = rx.helis[0].refuelUntil + 50; SrvX.tick(rx);
  const rb = SrvX.board(rx, pil);
  ok(rb.ok && rb.relaunch, 'refuelled, Z aboard lifts it again');
  T0 += H.boardSec * 1000 + 100; SrvX.tick(rx);
  ok(rx.helis[0].state === 'flying', 'and it is airborne again for another tank');
  // machine B can be flown by someone else, independently, and its hit is its own
  const other = mk('OX', H.pads[1][0] + 3, half + H.padY, H.pads[1][1]); rx.players.set('OX', other);
  const bb = SrvX.board(rx, other, 1);
  ok(bb.ok && bb.idx === 1, 'a player at pad B boards machine B');
  other.pos = bb.seat.slice(); T0 += H.boardSec * 1000 + 100; SrvX.tick(rx);
  ok(rx.helis[1].state === 'flying' && rx.helis[0].state === 'flying', 'both machines fly at once');
  const gnd = mk('G', 0, half, 0); rx.players.set('G', gnd);
  const h1 = SrvX.hit(rx, gnd, 'rocket', 1);
  ok(h1.ok && h1.idx === 1 && rx.helis[1].hp === H.hp - 2500 && rx.helis[0].hp === H.hp, 'a rocket named at machine B takes half of B, none of A');
  /* v1.0y: AIR TO AIR — the pilot of A shoots B: 2x */
  const before = rx.helis[1].hp;
  const a2a = SrvX.hit(rx, pil, 'akm', 1);
  ok(a2a.ok && a2a.a2a === true && a2a.dmg === 30 && rx.helis[1].hp === before - 30, 'the pilot of A hitting B with an AKM does 30 — twice the 15 from the ground');
  ok(!SrvX.hit(rx, pil, 'akm', 0).ok, 'and still cannot hit the machine he rides');
  const g2x = SrvX.hit(rx, gnd, 'akm', 1);
  ok(g2x.ok && !g2x.a2a && g2x.dmg === 15, 'a ground shooter stays at 1x');
  const heliCl2 = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/heli.js'), 'utf8');
  ok(/if \(list\[i\]\.isRiding\(\)\) continue; var h = list\[i\]\.rayHit/.test(heliCl2), 'the client ray test skips only the machine I ride, so my rounds reach the other one');
  ok(!/Heli\.active\(\) && !\(Heli\.isRiding && Heli\.isRiding\(\)\)/.test(fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8')), 'the hitscan no longer refuses to test hulls for a rider');
}

console.log('--- the wiring ---');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok(/Heli\.tick\(room\)/.test(srv) && /Heli\.reset\(room\)/.test(srv) && /heli: heliSnap/.test(srv) && /socket\.on\('hitHeli'/.test(srv) && /socket\.on\('boardHeli'/.test(srv) && /socket\.on\('heliLand'/.test(srv), 'server ticks, resets, ships, takes hits, boards and lands');

const heliC = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/heli.js'), 'utf8');
ok(/NEXT HELICOPTER IN/.test(heliC) && /PRESS Z TO BOARD|press Z to board/i.test(heliC) && /function buildSign/.test(heliC), 'the pad has a board with the live countdown and the Z prompt');

ok((srv.match(/heli: Heli\.snapshot\(room\)/g) || []).length >= 4, 'every reconnect door carries the state');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
ok(/src\/environment\/heli\.js/.test(html) && /id="heli-hud"/.test(html), 'the client has the module and the health bar');
const game = fs.readFileSync(path.join(__dirname, '..', 'public/src/core/game.js'), 'utf8');
ok(/function platformProbe/.test(game) && /Heli\.floorAt\(pos, halfY\)/.test(game) && /Heli\.bail\(\)/.test(game), 'the controller gets the cabin floor and Space bails');
ok(/Heli\.canBoard\(\)\) \{ Heli\.board\(\)/.test(game), 'Z near the machine boards it before anything else');
ok(/KeyQ.*Heli\.landRequest\(\)/.test(game), 'Q aboard the flying helicopter brings it down');
const heliSrvSrc = fs.readFileSync(path.join(__dirname, '..', 'server/lib/heli.js'), 'utf8');
ok(!/toast[^\n]*is airborne \\u00b7/.test(heliSrvSrc) && !/bringing the helicopter down/.test(heliSrvSrc) && !/Z to fly again/.test(heliSrvSrc), 'no room-wide popups for boarding, lift-off or landing (v1.0u)');
ok(!/boarded the helicopter/.test(fs.readFileSync(path.join(__dirname, '..', 'public/src/networking/net.js'), 'utf8')), 'the boarding notice is state only, never a toast');
const wsys = fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8');
ok(/Heli\.rayHit\(o, d, reach\)/.test(wsys) && /Net\.hitHeli\(current, hh\.idx/.test(wsys), 'a gun round that meets the fuselage reports its weapon and machine (v1.0x: guns chip the hull)');
ok(/Heli\.rayHit\(p\.pos, dir, step \+ 0\.6\)/.test(wsys) && /Net\.hitHeli\(p\.kind === 'seeker' \? 'seeker' : 'rocket', hhR\.idx/.test(wsys), 'a flying rocket or seeker that meets the fuselage detonates there and reports itself');
ok(/Heli\.lockTarget\(o, w\.lockRange/.test(wsys) && /p\.kind === 'seeker' && p\.lockIdx !== undefined/.test(wsys), 'the SEEKER locks the nearest airborne machine at launch and steers at its current pose');
const outer = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/districts-outer.js'), 'utf8');
ok(/CFG\.HELI\.pad/.test(outer), 'the pad is built from the same config');
/* v1.0o: the hints and the death screen name the right machine */
const trainC = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/train.js'), 'utf8');
ok(/PlayerCtl\.platformSrc === 'train'/.test(trainC) && /PlayerCtl\.platformSrc === 'heli'/.test(heliC) && /r\.src = 'heli'/.test(game), 'the train hint fires on the train\'s floor only, the helicopter hint on the helicopter\'s');
const uiC = fs.readFileSync(path.join(__dirname, '..', 'public/src/ui/ui.js'), 'utf8');
ok(/Run over by the train\./.test(uiC) && /Bled out outside the zone\./.test(uiC) && /You fell from the helicopter\./.test(uiC) && /Shot down with the helicopter by/.test(uiC), 'the death screen names train, zone and helicopter deaths — not "explosives"');
ok(/ASSET_STAMP = /.test(srv) && /createHash\('sha1'\)/.test(srv) && /'\?v=' \+ ASSET_STAMP/.test(srv), 'asset URLs carry a content hash, so a deploy can never serve a stale client');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
