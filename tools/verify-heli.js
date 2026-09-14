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
const rider = mk('R', H.pad[0], H.padY + H.cabinFloor + half, H.pad[1]);
const bystander = mk('B', H.pad[0] + 12, half, H.pad[1]);
room.players.set('R', rider); room.players.set('B', bystander);
Srv.tick(room);
ok(room.heli.state === 'pad' && room.heli.boardSince === T0, 'a player in the cabin starts the boarding count');
T0 += H.boardSec * 1000 - 200; Srv.tick(room);
ok(room.heli.state === 'pad', 'not yet');
T0 += 400; Srv.tick(room);
ok(room.heli.state === 'flying' && room.heli.riders.length === 1 && room.heli.riders[0] === 'R', 'three seconds aboard: airborne with the one rider');
const tOff = room.heli.t0;
// mid-flight: the rider rides (position follows the pose); the bystander stays on the ground
function ride(q) { const p = CFG.heliPoseAt(H, P, (T0 - tOff) / 1000); q.pos = [p.x, p.y + H.cabinFloor + half, p.z]; }
T0 += (H.climbSec + 8) * 1000; ride(rider); Srv.tick(room);
ok(room.heli.state === 'flying' && room.heli.riders.length === 1 && rider.alive, 'mid-flight the seated rider is aboard and alive');
// a shot from the ground
const shooter = mk('S', 0, half, 0); room.players.set('S', shooter);
const r1 = Srv.hit(room, shooter, 'ak47');
ok(r1.ok && r1.dmg === dmg('ak47') && room.heli.hp === H.hp - dmg('ak47'), 'a rifle hit takes class damage off the hull');
ok(emitted.some(e => e.ev === 'heliHp'), 'and the room is told the health');
ok(!Srv.hit(room, rider, 'ak47').ok, 'a rider cannot shoot the machine he is in');
const far = mk('F', 400, half, 400); room.players.set('F', far);
ok(!Srv.hit(room, far, 'ak47').ok, 'a shot from 400 m away is refused');
// the rider leaves the cabin in the air: dead, credited to the last shooter
rider.pos = [rider.pos[0] + 6, rider.pos[1] - 3, rider.pos[2]];
T0 += 200; Srv.tick(room);
ok(!rider.alive && killed.length === 1 && killed[0].w === 'helifall' && killed[0].by === 'S', 'a rider outside the cabin in the air has fallen: dead, tagged helifall, credited to the shooter who hit the machine');
ok(room.heli.state === 'landed', 'with nobody aboard the machine goes home');
// a fresh flight with two riders, shot down
T0 += 20000; room.heli.state = 'pad'; room.heli.t0 = T0; room.heli.hp = H.hp; room.heli.riders = []; room.heli.boardSince = 0;
const r2 = mk('R2', H.pad[0] + 0.5, H.padY + H.cabinFloor + half, H.pad[1]), r3 = mk('R3', H.pad[0] - 0.5, H.padY + H.cabinFloor + half, H.pad[1] + 0.4);
room.players.set('R2', r2); room.players.set('R3', r3);
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
ok(room.heli.respawnAt >= T0 + H.respawnSec * 1000 - 1, 'it comes back ' + H.respawnSec + ' s later');
T0 = room.heli.respawnAt - 1000; Srv.tick(room);
ok(room.heli.state === 'gone', 'not a second early');
T0 = room.heli.respawnAt + 1; Srv.tick(room);
ok(room.heli.state === 'pad' && room.heli.hp === H.hp && room.heli.riders.length === 0, 'and it is back on the pad, full health, empty');

console.log('--- the wiring ---');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok(/Heli\.tick\(room\)/.test(srv) && /Heli\.reset\(room\)/.test(srv) && /heli: heliSnap/.test(srv) && /socket\.on\('hitHeli'/.test(srv), 'server ticks, resets, ships and takes hits');
ok((srv.match(/heli: Heli\.snapshot\(room\)/g) || []).length >= 4, 'every reconnect door carries the state');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
ok(/src\/environment\/heli\.js/.test(html) && /id="heli-hud"/.test(html), 'the client has the module and the health bar');
const game = fs.readFileSync(path.join(__dirname, '..', 'public/src/core/game.js'), 'utf8');
ok(/function platformProbe/.test(game) && /Heli\.floorAt\(pos, halfY\)/.test(game) && /Heli\.bail\(\)/.test(game), 'the controller gets the cabin floor and Space bails');
const wsys = fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8');
ok(/Heli\.rayHit\(o, d, reach\)/.test(wsys) && /Net\.hitHeli\(current/.test(wsys), 'the hitscan tests the fuselage first and reports the weapon');
const outer = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/districts-outer.js'), 'utf8');
ok(/CFG\.HELI\.pad/.test(outer), 'the pad is built from the same config');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
