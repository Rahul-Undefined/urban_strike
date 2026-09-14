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
const H = CFG.HELI, P = Bots.trainPath('urban', 'heli');

console.log('--- the route and the pose ---');
ok(!!P && P.length > 400, 'the route is a filleted loop over the city [' + (P ? P.length.toFixed(0) : 0) + ' m]');
let onMap = true;
for (let s = 0; s < P.length; s += 2) { const q = P.at(s); if (Math.abs(q.x) > 118 || Math.abs(q.z) > 118) onMap = false; }
ok(onMap, 'every point of the route is over the map');
const q0 = P.at(0);
ok(Math.hypot(q0.x - H.pad[0], q0.z - H.pad[1]) < 0.5, 'the route begins and ends over the pad');
const tCruise = P.length / H.speed, tTotal = H.climbSec + tCruise + H.landSec;
const pa = CFG.heliPoseAt(H, P, 0), pb = CFG.heliPoseAt(H, P, H.climbSec), pc = CFG.heliPoseAt(H, P, H.climbSec + tCruise / 2), pd = CFG.heliPoseAt(H, P, tTotal + 1);
ok(pa.phase === 'climb' && Math.abs(pa.y - H.padY) < 1e-6 && pa.x === H.pad[0], 'at take-off it sits on the pad');
ok(pb.phase === 'cruise' && Math.abs(pb.y - H.alt) < 1e-6, 'after the climb it is at altitude ' + H.alt);
ok(pc.phase === 'cruise' && Math.hypot(pc.x - H.pad[0], pc.z - H.pad[1]) > 60, 'mid-flight it is far from the pad [' + Math.hypot(pc.x - H.pad[0], pc.z - H.pad[1]).toFixed(0) + ' m]');
ok(pd.phase === 'down' && Math.abs(pd.y - H.padY) < 1e-6, 'after the descent it is on the pad again');
let maxDy = 0; for (let t = 0; t < tTotal; t += 0.1) { maxDy = Math.max(maxDy, Math.abs(CFG.heliPoseAt(H, P, t + 0.1).y - CFG.heliPoseAt(H, P, t).y)); }
ok(maxDy < 1.2, 'no vertical step exceeds 1.2 m per 0.1 s — the climb and descent are smooth [' + maxDy.toFixed(2) + ']');
ok(tTotal > 30 && tTotal < 120, 'a flight takes ' + tTotal.toFixed(0) + ' s');

console.log('--- damage by class ---');
const dmg = w => CFG.heliDamageFor(H, CFG.WEAPONS, w);
ok(dmg('ak47') >= 45 && Math.ceil(H.hp / dmg('ak47')) >= 15, 'an AK needs ' + Math.ceil(H.hp / dmg('ak47')) + ' hits — a magazine and a half, not five rounds');
ok(dmg('awm') < dmg('ak47') && Math.ceil(H.hp / dmg('awm')) >= 25, 'a sniper round does less than a rifle round (' + dmg('awm') + ' vs ' + dmg('ak47') + '): ' + Math.ceil(H.hp / dmg('awm')) + ' hits');
ok(dmg('rocket') === H.rocketDmg && Math.ceil(H.hp / dmg('rocket')) >= 5, 'a rocket does ' + dmg('rocket') + ': ' + Math.ceil(H.hp / dmg('rocket')) + ' to bring it down');
ok(dmg('knife') === 0 && dmg('drone') === 0 && dmg('emp') === 0, 'knives, drones and the EMP do nothing to it');
ok(Object.keys(CFG.WEAPONS).every(w => dmg(w) * 5 < H.hp), 'no weapon in the game downs it in five hits');

console.log('--- the machine, on the server ---');
let T0 = 5000000, killed = [], emitted = [];
const io = { to: id => ({ emit: (ev, d) => emitted.push({ to: id, ev, d }) }) };
const Srv = require('../server/lib/heli.js')({ io, now: () => T0, applyDamage: (room, v, dmg2, by, w) => { v.alive = false; killed.push({ id: v.id, by, w }); },
  modeInfo: () => ({ teams: false }), trainPath: (m, which) => Bots.trainPath(m, which) });
const room = { code: 'H', state: 'playing', settings: { map: 'urban', mode: 'ffa' }, players: new Map() };
const half = CFG.PLAYER.standH / 2;
const mk = (id, x, y, z) => ({ id, name: id, alive: true, pos: [x, y, z] });
ok(Srv.start(room) && room.heli.state === 'pad' && room.heli.hp === H.hp, 'start() puts a full-health helicopter on the pad');
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
const r1 = Srv.hit(room, shooter, 'ak47');
ok(r1.ok && r1.dmg === dmg('ak47') && room.heli.hp === H.hp - dmg('ak47'), 'a rifle hit takes class damage off the hull');
ok(emitted.some(e => e.ev === 'heliHp'), 'and the room is told the health');
ok(!Srv.hit(room, rider, 'ak47').ok, 'a rider cannot shoot the machine he is in');
const far = mk('F', 400, half, 400); room.players.set('F', far);
ok(!Srv.hit(room, far, 'ak47').ok, 'a shot from 400 m away is refused');
/* v1.0p: position disagreement is NOT a fall. 700 ms of lag+skew at cruise, or a
   4 m gap mid-climb, keeps the rider aboard; only the rider's own JUMP (bail),
   or a client 12 m below / 25 m away for two ticks, ends the ride. */
rider.pos = [rider.pos[0] - 9.5, rider.pos[1] - 4, rider.pos[2]];        // 9.5 m behind and 4 m low: bad lag, not a fall
T0 += 200; Srv.tick(room);
ok(rider.alive && room.heli.riders.length === 1, 'a rider 9.5 m behind and 4 m below the seat (lag, skew) stays aboard and alive');
ride(rider);
rider.pos = [rider.pos[0] + 30, rider.pos[1] - 14, rider.pos[2]];        // 30 m off and 14 m down: the client stopped riding without saying so
T0 += 70; Srv.tick(room);
ok(rider.alive && room.heli.riders.length === 1, 'one tick that far away is not yet a fall');
T0 += 70; Srv.tick(room);
ok(!rider.alive && killed.length === 1 && killed[0].w === 'helifall' && killed[0].by === 'S', 'two ticks that far away: dead, tagged helifall, credited to the shooter who hit the machine');
ok(room.heli.state === 'landed', 'with nobody aboard the machine goes home');
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
  ok(room.heli.riders.length === 0 && room.heli.state === 'landed', 'and the empty machine goes home');
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
T0 += (H.climbSec + 10) * 1000;
[r2, r3].forEach(q => { const p = CFG.heliPoseAt(H, P, (T0 - tOff2) / 1000); q.pos = [p.x, p.y + H.cabinFloor + half, p.z]; });
Srv.tick(room);
killed = [];
let res = null, hits = 0;
while (room.heli.state === 'flying' && hits < 200) { res = Srv.hit(room, shooter, 'ak47'); hits++; }
ok(res && res.destroyed && res.n === 2, 'enough rifle hits bring it down with both riders [' + hits + ' hits]');
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
    Net = { getMatch: function(){ return { startedAt: 1000, serverOffset: 0 }; }, getMyId: function(){ return 'me'; }, boardHeli: function(cb){ cb({ ok: true, aboard: true }); } };
    UI = { toast: function(){}, setHeliHud: function(){}, announce: function(){} }; AudioSys = {};
    Heli.set({ state: 'pad', t0: Date.now(), hp: 900, riders: [], respawnAt: 0 });   // matchStart.heli, applied by net.js first
    Heli.init(sc, 'urban');                                                          // Game.onMatchStart -> buildWorld -> Heli.init
    Heli.init(sc, 'urban');                                                          // a watchdog rebuild does it again
    Heli.update(0.016);
    var act = Heli.active(), pose = Heli.pose();
    PlayerCtl.alive = true; PlayerCtl.spawnAt([CFG.HELI.pad[0] + 3, CFG.PLAYER.standH / 2 + 0.3, CFG.HELI.pad[1]], 0);
    Heli.update(0.016);
    var near = Heli.canBoard(), boarded = Heli.board();
    var far = (function(){ PlayerCtl.spawnAt([CFG.HELI.pad[0] + 30, 1, CFG.HELI.pad[1]], 0); Heli.update(0.016); return Heli.canBoard(); })();
    Heli.set({ state: 'gone', t0: Date.now(), hp: 0, riders: [], respawnAt: Date.now() + 100000 }); Heli.update(0.016);
    var goneActive = Heli.active();
    return { act: act, pose: pose, near: near, boarded: boarded, far: far, goneActive: goneActive };
  })()`, cx);
  ok(r.act === true && r.pose && Math.abs(r.pose.x - H.pad[0]) < 0.01, 'the machine is on the pad after the map rebuild that follows matchStart');
  ok(r.near === true && r.boarded === true, 'near the pad the client offers boarding and Z boards');
  ok(r.far === false, '30 m away it does not');
  ok(r.goneActive === false, 'when the server says gone, the machine is gone (the board counts down)');
}

console.log('--- the wiring ---');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok(/Heli\.tick\(room\)/.test(srv) && /Heli\.reset\(room\)/.test(srv) && /heli: heliSnap/.test(srv) && /socket\.on\('hitHeli'/.test(srv) && /socket\.on\('boardHeli'/.test(srv), 'server ticks, resets, ships, takes hits and boards');
const heliC = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/heli.js'), 'utf8');
ok(/NEXT HELICOPTER IN/.test(heliC) && /PRESS Z TO BOARD|press Z to board/i.test(heliC) && /function buildSign/.test(heliC), 'the pad has a board with the live countdown and the Z prompt');

ok((srv.match(/heli: Heli\.snapshot\(room\)/g) || []).length >= 4, 'every reconnect door carries the state');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
ok(/src\/environment\/heli\.js/.test(html) && /id="heli-hud"/.test(html), 'the client has the module and the health bar');
const game = fs.readFileSync(path.join(__dirname, '..', 'public/src/core/game.js'), 'utf8');
ok(/function platformProbe/.test(game) && /Heli\.floorAt\(pos, halfY\)/.test(game) && /Heli\.bail\(\)/.test(game), 'the controller gets the cabin floor and Space bails');
ok(/Heli\.canBoard\(\)\) \{ Heli\.board\(\)/.test(game), 'Z near the machine boards it before anything else');
const wsys = fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8');
ok(/Heli\.rayHit\(o, d, reach\)/.test(wsys) && /Net\.hitHeli\(current/.test(wsys), 'the hitscan tests the fuselage first and reports the weapon');
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
