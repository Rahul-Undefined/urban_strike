/* verify-train.js — v1.0e
   The train is deterministic geometry in motion, so it is provable without a
   browser: (1) the loop closes and every corner is a real curve; (2) the
   schedule dwells, runs, brakes and comes back to the same stop; (3) NOTHING
   STATIC STANDS IN ITS WAY — the whole four-car envelope swept along the loop
   touches only ballast and the footbridge overhead; (4) the controller rides
   it: a player on a coach floor is carried, held in by the walls, free at the
   doors and on the roof, and a player beside it on the road is left alone. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const THREE = require('three');
let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, { get: (t, k) => {
    if (k === 'canvas') return c;
    return function () {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop() {} };
      if (k === 'measureText') return { width: 10 };
      if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
    };
  }, set: () => true });
  c.getContext = () => g;
  return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error, isFinite, isNaN, parseInt, parseFloat,
  Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
  performance: { now: () => Date.now() },
  document: { createElement: t => (t === 'canvas' ? fakeCanvas() : { style: {} }), getElementById: () => null, addEventListener() {} },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
ctx.AudioSys = { step() {}, land() {}, jump() {} };
ctx.FX = { shake() {}, damageFlash() {} };
ctx.UI = { toast() {} };
vm.createContext(ctx);
const bsrc = fs.readFileSync(path.join(ROOT, 'server/lib/bots.js'), 'utf8');
const files = [...bsrc.matchAll(/'(public\/src\/[^']+\.js)'/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
['public/src/environment/train.js', 'public/src/player/controller.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));

const CFG = ctx.CFG, T = CFG.TRAIN.urban;

console.log('--- the loop ---');
const P = vm.runInContext('World.trainPath(CFG.TRAIN.urban)', ctx);
ok(P.length > 700 && P.length < 900, 'the Urban loop is ~800 m [' + P.length.toFixed(1) + ']');
const a0 = P.at(0), aL = P.at(P.length - 1e-6);
ok(Math.hypot(a0.x - aL.x, a0.z - aL.z) < 0.05, 'the loop closes on itself');
let maxTurn = 0;
for (let s = 0; s < P.length; s += 0.5) {
  const q0 = P.at(s), q1 = P.at(s + 0.5);
  let d = q1.yaw - q0.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  maxTurn = Math.max(maxTurn, Math.abs(d));
}
ok(maxTurn < 0.5 / (T.fillet * 0.9), 'no corner is sharper than the fillet radius allows (max ' + (maxTurn * 180 / Math.PI).toFixed(1) + ' deg per 0.5 m)');
const sSt = P.sAtWaypoint(T.stationAt) + T.stopOffset;
const head = P.at(sSt);
ok(Math.abs(head.z + 88) < 0.05 && head.x > 66 && head.x < 76, 'the head stops on Track 2 at the east end of the island platform, short of the footbridge [' + head.x.toFixed(1) + ', ' + head.z.toFixed(1) + ']');
const tail = P.at(sSt - 3 * 12 - 11 - 3 * 0.9);
ok(tail.x > 22 && Math.abs(tail.z + 88) < 0.05, 'and the last coach stands at the platform (x 26..68) [tail x ' + tail.x.toFixed(1) + ']');

console.log('--- the schedule ---');
vm.runInContext('var __sc = new THREE.Scene(); World.reset(); World.buildMap(__sc, "urban"); Net = { getMatch: function () { return { startedAt: 1000, serverOffset: 0 }; } }; Train.init(__sc, "urban");', ctx);
const S = vm.runInContext('Train.schedule()', ctx);
ok(S && S.D === T.dwellSec && S.T > S.D, 'schedule: dwell ' + S.D + ' s, cycle ' + S.T.toFixed(1) + ' s');
function headAt(tSec) {
  return vm.runInContext('(function(){ Date.now = function(){ return 1000 + ' + Math.round(tSec * 1000) + '; }; Train.update(0.016); return Train.head(); })()', ctx);
}
const h0 = headAt(0.1), h1 = headAt(T.dwellSec - 0.1), h2 = headAt(T.dwellSec + 5), hEnd = headAt(S.T - 0.05), hNext = headAt(S.T + 0.5);
ok(h0.v === 0 && Math.abs(h0.s - h1.s) < 1e-6, 'the train stands still through the dwell');
ok(h2.v > 0 && h2.s > h1.s, 'and moves after it');
ok(Math.abs(hEnd.s - (S.s0 + P.length)) < 1.0 && hEnd.v < 0.6, 'one cycle later it has done the whole loop and is stopping at the station again [' + (hEnd.s - S.s0 - P.length).toFixed(2) + ' m]');
ok(hNext.v === 0, 'and dwells again');
let vmax = 0;
for (let t = 0; t < S.T; t += 0.5) vmax = Math.max(vmax, headAt(t).v);
ok(Math.abs(vmax - T.speed) < 0.01, 'cruise speed is the configured ' + T.speed + ' m/s');

console.log('--- nothing stands in its way ---');
const Bots = require('../server/lib/bots.js')({});
const cols = Bots.buildColliders('urban');
const HALF_W = 1.5, HEIGHT = 4.1, offs = [5.5, 11 + 0.9 + 6, 11 + 0.9 + 12 + 0.9 + 6, 11 + 0.9 + 24 + 1.8 + 6];
/* colliders bucketed on a 10 m grid so 400 poses x 4 cars x ~175 footprint
   points stay cheap; the footprint is the ORIENTED car rectangle, sampled, not
   its axis-aligned bound — a bound flags sheds a cornering coach clears. */
const cell = 10, grid = new Map();
for (const c of cols) {
  if (c[3] - c[0] > 200 || c[4] <= 0.2 || c[1] >= HEIGHT) continue;   // ground, ballast/rails/paint, overhead
  for (let gx = Math.floor(c[0] / cell); gx <= Math.floor(c[3] / cell); gx++)
    for (let gz = Math.floor(c[2] / cell); gz <= Math.floor(c[5] / cell); gz++) {
      const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
    }
}
const hits = new Map();
for (let s = 0; s < P.length; s += 2.0) {
  for (const o of offs) {
    const q = P.at(s - o), cs = Math.cos(q.yaw), sn = Math.sin(q.yaw);
    for (let lx = -6; lx <= 6; lx += 0.5) for (let lz = -HALF_W; lz <= HALF_W; lz += 0.5) {
      const x = q.x + lx * cs - lz * sn, z = q.z + lx * sn + lz * cs;
      const list = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell));
      if (!list) continue;
      for (const c of list) if (x >= c[0] && x <= c[3] && z >= c[2] && z <= c[5]) hits.set(c.join(','), c);
    }
  }
}
ok(hits.size === 0, 'the swept four-car envelope meets no static collider along the loop [' + hits.size + ']');
[...hits.values()].slice(0, 6).forEach(c => console.log('        in the way: ' + JSON.stringify(c.slice(0, 6).map(v => +v.toFixed(2)))));
const bridge = cols.find(c => Math.abs(c[0] - 75.2) < 0.1 && c[1] > 4.3 && c[5] > -80);
ok(!!bridge && bridge[1] >= 4.3, 'the footbridge deck clears the roof [' + (bridge ? bridge[1].toFixed(2) : 'missing') + ' m]');

console.log('--- riding it ---');
vm.runInContext(`
  PlayerCtl.setPlatform(Train.floorAt);
  var __inp = { fwd:false, back:false, left:false, right:false, sprint:false, jump:false, crouch:false, leanL:false, leanR:false };
  function __run(frames, inp) { for (var i = 0; i < frames; i++) PlayerCtl.update(1/60, inp || __inp, 1, false); return { x: PlayerCtl.pos.x, y: PlayerCtl.pos.y, z: PlayerCtl.pos.z, grounded: PlayerCtl.grounded, onPlat: PlayerCtl.onPlatform }; }
`, ctx);
// freeze the train mid-cruise: pick a time where v = cruise on the north straight
const tCruise = T.dwellSec + S.tA + 8;
let cars = vm.runInContext('(function(){ Date.now = function(){ return 1000 + ' + Math.round(tCruise * 1000) + '; }; Train.update(0.016); return Train.cars().map(function(c){ return { x:c.x, z:c.z, yaw:c.yaw, vx:c.vx, vz:c.vz, coach:c.coach }; }); })()', ctx);
const coach = cars[1];
ok(coach.coach && Math.hypot(coach.vx, coach.vz) > 7, 'a coach is moving at cruise [' + Math.hypot(coach.vx, coach.vz).toFixed(1) + ' m/s]');
// a player standing on the coach floor rides with it
vm.runInContext('PlayerCtl.alive = true; PlayerCtl.spawnAt([' + coach.x + ', ' + (T.floor + CFG.PLAYER.standH / 2 + 0.02) + ', ' + coach.z + '], 0);', ctx);
const before = vm.runInContext('({x: PlayerCtl.pos.x, z: PlayerCtl.pos.z})', ctx);
let r1 = null;
for (let f = 1; f <= 30; f++) {                                  // the train advances each frame; the carry is rigid, not a velocity
  vm.runInContext('Date.now = function(){ return 1000 + ' + Math.round((tCruise + f / 60) * 1000) + '; }; Train.update(1/60);', ctx);
  r1 = vm.runInContext('__run(1)', ctx);
}
const carried = Math.hypot(r1.x - before.x, r1.z - before.z);
ok(r1.onPlat && r1.grounded, 'standing on the coach floor counts as grounded on the platform');
ok(Math.abs(r1.y - (T.floor + CFG.PLAYER.standH / 2)) < 0.05, 'the rider stands at floor height [' + r1.y.toFixed(2) + ']');
ok(carried > 0.5 * 30 / 60 * 7 && carried < 30 / 60 * 9, 'half a second on board carried the rider ' + carried.toFixed(2) + ' m with the train');
// walking sideways into the wall is held inside
const cs = Math.cos(coach.yaw), sn = Math.sin(coach.yaw);
vm.runInContext('PlayerCtl.pos.set(' + (coach.x + 0.5 * cs) + ', PlayerCtl.pos.y, ' + (coach.z + 0.5 * sn) + ');', ctx);
vm.runInContext('__inp2 = { fwd:false, back:false, left:false, right:true, sprint:false, jump:false, crouch:false, leanL:false, leanR:false }; PlayerCtl.yaw = ' + (-coach.yaw) + ';', ctx);
let r2 = vm.runInContext('__run(90, __inp2)', ctx);
let cars2 = vm.runInContext('Train.cars().map(function(c){ return { x:c.x, z:c.z, yaw:c.yaw }; })', ctx);
const c2 = cars2[1], lz = -(r2.x - c2.x) * Math.sin(c2.yaw) + (r2.z - c2.z) * Math.cos(c2.yaw);
ok(r2.onPlat && Math.abs(lz) <= HALF_W - 0.2 + 0.05, 'a second of walking at the wall mid-coach keeps the rider inside [lateral ' + lz.toFixed(2) + ' m]');
// beside the train on the road: not grabbed
vm.runInContext('PlayerCtl.spawnAt([' + (coach.x - 2.6 * sn) + ', ' + (CFG.PLAYER.standH / 2 + 0.02) + ', ' + (coach.z + 2.6 * cs) + '], 0);', ctx);
let r3 = vm.runInContext('__run(20)', ctx);
ok(!r3.onPlat, 'a player standing 2.6 m beside the coach on the road is not grabbed');
// on the roof: rides
vm.runInContext('PlayerCtl.spawnAt([' + coach.x + ', ' + (T.roof + CFG.PLAYER.standH / 2 + 0.02) + ', ' + coach.z + '], 0);', ctx);
let r4 = vm.runInContext('__run(20)', ctx);
ok(r4.onPlat && Math.abs(r4.y - (T.roof + CFG.PLAYER.standH / 2)) < 0.05, 'the roof is rideable [' + r4.y.toFixed(2) + ']');

console.log('--- v1.0f: corners, walls, and what the train does to a bystander ---');
{
  /* A rider through a whole corner. Find a time when coach 1 is entering the
     first ring corner after the station straight (the east exit), then run the
     controller frame by frame with the train advancing each frame. */
  function poseAt(tSec) { return vm.runInContext('(function(){ Date.now = function(){ return 1000 + ' + Math.round(tSec * 1000) + '; }; Train.update(1/60); return Train.cars().map(function(c){ return { x:c.x, z:c.z, yaw:c.yaw, coach:c.coach, L:c.L }; }); })()', ctx); }
  let tCorner = null;
  for (let t = T.dwellSec + 2; t < S.T; t += 0.25) {
    const cs0 = poseAt(t)[1];
    if (cs0.x > 96 && cs0.z < -84) { tCorner = t; break; }          // coach 1 arriving at the east exit curve
  }
  ok(tCorner !== null, 'coach 1 reaches the east exit corner at t=' + (tCorner || 0).toFixed(2) + ' s');
  const c0 = poseAt(tCorner)[1];
  // seat the rider 3 m forward of the coach centre, 0.9 m off the aisle
  const sx0 = c0.x + Math.cos(c0.yaw) * 3 - Math.sin(c0.yaw) * 0.9, sz0 = c0.z + Math.sin(c0.yaw) * 3 + Math.cos(c0.yaw) * 0.9;
  vm.runInContext('PlayerCtl.alive = true; PlayerCtl.spawnAt([' + sx0 + ', ' + (T.floor + CFG.PLAYER.standH / 2 + 0.02) + ', ' + sz0 + '], 0);', ctx);
  let maxLz = 0, maxLx = 0, offCount = 0, yawTurned = 0, prevYaw = c0.yaw;
  for (let f = 1; f <= 60 * 6; f++) {                             // six seconds: the whole 90-degree corner at 8 m/s
    const cars = poseAt(tCorner + f / 60);
    const r = vm.runInContext('__run(1)', ctx);
    const c = cars[1];
    const lx = (r.x - c.x) * Math.cos(c.yaw) + (r.z - c.z) * Math.sin(c.yaw), lz = -(r.x - c.x) * Math.sin(c.yaw) + (r.z - c.z) * Math.cos(c.yaw);
    maxLz = Math.max(maxLz, Math.abs(lz)); maxLx = Math.max(maxLx, Math.abs(lx));
    if (!r.onPlat) offCount++;
    let d = c.yaw - prevYaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; yawTurned += Math.abs(d); prevYaw = c.yaw;
  }
  ok(yawTurned > Math.PI / 2 - 0.2, 'the coach turned through the corner (' + (yawTurned * 180 / Math.PI).toFixed(0) + ' deg)');
  ok(offCount === 0, 'the rider stayed aboard every one of the 360 frames [' + offCount + ' off]');
  ok(maxLz <= HALF_W - 0.2 + 0.05, 'and never drifted into the wall [max lateral ' + maxLz.toFixed(2) + ' m]');
  ok(maxLx <= 3.6, 'nor slid along the coach [max along ' + maxLx.toFixed(2) + ' m from the seat 3.0]');

  /* The walls: a player on the road walks into a STOPPED coach's side, mid-coach — held out. */
  const tStop = 0.5;                                              // dwell: the train stands at the platform
  const carsStop = poseAt(tStop), cc = carsStop[1];
  const outX = cc.x - Math.sin(cc.yaw) * (HALF_W + 0.9), outZ = cc.z + Math.cos(cc.yaw) * (HALF_W + 0.9);   // 0.9 m outside the +lz face, mid-coach
  vm.runInContext('PlayerCtl.spawnAt([' + outX + ', ' + (CFG.PLAYER.standH / 2 + 0.02) + ', ' + outZ + '], ' + cc.yaw + ');', ctx);   // forward = (sin yaw, -cos yaw): yaw = car heading walks toward -lz, i.e. INTO the coach side
  vm.runInContext('__inpF = { fwd:true, back:false, left:false, right:false, sprint:false, jump:false, crouch:false, leanL:false, leanR:false };', ctx);
  for (let f = 0; f < 120; f++) { poseAt(tStop); vm.runInContext('__run(1, __inpF)', ctx); }
  const rW = vm.runInContext('({x: PlayerCtl.pos.x, z: PlayerCtl.pos.z, y: PlayerCtl.pos.y})', ctx);
  const lzW = -(rW.x - cc.x) * Math.sin(cc.yaw) + (rW.z - cc.z) * Math.cos(cc.yaw);
  ok(Math.abs(lzW) >= HALF_W + 0.3 && rW.y < 1.5, 'two seconds of walking into the coach side leaves the player outside it, on the road [lateral ' + lzW.toFixed(2) + ' m]');
  /* ...and the same walk at a DOOR climbs aboard. */
  const doorLx = cc.L / 2 - 1.7;
  const dX = cc.x + Math.cos(cc.yaw) * doorLx - Math.sin(cc.yaw) * (HALF_W + 0.9), dZ = cc.z + Math.sin(cc.yaw) * doorLx + Math.cos(cc.yaw) * (HALF_W + 0.9);
  vm.runInContext('PlayerCtl.spawnAt([' + dX + ', ' + (CFG.PLAYER.standH / 2 + 0.02) + ', ' + dZ + '], ' + cc.yaw + ');', ctx);
  for (let f = 0; f < 25; f++) { poseAt(tStop); vm.runInContext('__run(1, __inpF)', ctx); }   // ~2.3 m: through the door to the aisle (120 frames walks straight out of the far door, correctly)
  const rD = vm.runInContext('({x: PlayerCtl.pos.x, z: PlayerCtl.pos.z, y: PlayerCtl.pos.y, onPlat: PlayerCtl.onPlatform})', ctx);
  ok(rD.onPlat && Math.abs(rD.y - (T.floor + CFG.PLAYER.standH / 2)) < 0.1, 'the same walk at a door boards the coach [y ' + rD.y.toFixed(2) + ']');

  /* v1.0i: the walls hold AIRBORNE riders too. A rider mid-coach who jumps and
     strafes at the wall for two seconds is still inside; a player on the road
     who jumps at the wall (not a door) never gets in. */
  {
    const cj = poseAt(tStop)[1];
    vm.runInContext('PlayerCtl.spawnAt([' + cj.x + ', ' + (T.floor + CFG.PLAYER.standH / 2 + 0.02) + ', ' + cj.z + '], ' + cj.yaw + ');', ctx);
    vm.runInContext('__inpJ = { fwd:true, back:false, left:false, right:false, sprint:false, jump:true, crouch:false, leanL:false, leanR:false };', ctx);
    let maxLz = 0, maxTop = 0, offFrames = 0;
    for (let f = 0; f < 120; f++) {
      poseAt(tStop);
      const r = vm.runInContext('__run(1, __inpJ)', ctx);
      const lz = -(r.x - cj.x) * Math.sin(cj.yaw) + (r.z - cj.z) * Math.cos(cj.yaw);
      maxLz = Math.max(maxLz, Math.abs(lz)); maxTop = Math.max(maxTop, r.y + CFG.PLAYER.standH / 2);
      if (!r.onPlat) offFrames++;
    }
    ok(maxLz <= HALF_W - 0.2 + 0.05, 'jumping and strafing at the wall for two seconds keeps the rider inside [max lateral ' + maxLz.toFixed(2) + ' m]');
    ok(maxTop <= T.roof - 0.15 + 0.05, 'and the roof is a ceiling — the head never leaves the coach [top ' + maxTop.toFixed(2) + ' m, roof ' + T.roof + ']');
    ok(offFrames === 0, 'the airborne rider still counts as aboard every frame [' + offFrames + ' off]');
    // from the road, jumping INTO the side of the coach (not a door)
    const oX = cj.x - Math.sin(cj.yaw) * (HALF_W + 0.9), oZ = cj.z + Math.cos(cj.yaw) * (HALF_W + 0.9);
    vm.runInContext('PlayerCtl.spawnAt([' + oX + ', ' + (CFG.PLAYER.standH / 2 + 0.02) + ', ' + oZ + '], ' + cj.yaw + ');', ctx);
    let inside = 0;
    for (let f = 0; f < 180; f++) {
      poseAt(tStop);
      const r = vm.runInContext('__run(1, __inpJ)', ctx);
      const lz = -(r.x - cj.x) * Math.sin(cj.yaw) + (r.z - cj.z) * Math.cos(cj.yaw);
      if (Math.abs(lz) < HALF_W - 0.25 && r.y - CFG.PLAYER.standH / 2 > 0.5) inside++;
    }
    ok(inside === 0, 'three seconds of jumping at the coach side from the road never gets inside [' + inside + ' frames inside]');
  }

  /* The server: a bystander in the path of a moving car dies; a rider and a platform bystander do not. */
  const H = require('../server/lib/hazards.js')({ io: { to: () => ({ emit() {} }) }, now: () => Date.now(),   // late-bound: poseAt() re-mocks Date.now per call
    applyDamage: (room, v, dmg, by, w, hs, pb) => { v.alive = false; v.killedBy = w; },
    modeInfo: () => ({ teams: false }), colliders: () => [], trainPath: (m) => Bots.trainPath(m) });
  const tMove = T.dwellSec + S.tA + 6;
  const carsM = poseAt(tMove), cm = carsM[2];                      // poseAt first: it sets the mocked clock the room's startedAt is derived from
  const room = { code: 'R', settings: { map: 'urban' }, startedAt: Date.now() - tMove * 1000, players: new Map() };
  const under = { id: 'U', name: 'U', alive: true, pos: [cm.x, CFG.PLAYER.standH / 2, cm.z] };                         // on the road, inside the car body
  const rider = { id: 'V', name: 'V', alive: true, pos: [cm.x, T.floor + CFG.PLAYER.standH / 2, cm.z] };              // on the floor
  const beside = { id: 'W', name: 'W', alive: true, pos: [cm.x - Math.sin(cm.yaw) * 2.4, CFG.PLAYER.standH / 2, cm.z + Math.cos(cm.yaw) * 2.4] };   // 2.4 m off the side
  [under, rider, beside].forEach(q => room.players.set(q.id, q));
  H.tickTrain(room);
  ok(!under.alive && under.killedBy === 'train', 'a player standing in the path of the moving train is killed, tagged train');
  ok(rider.alive && beside.alive, 'the rider on the floor and the bystander beside the track live');
  poseAt(0.5); room.startedAt = Date.now() - 0.5 * 1000;          // dwelling (clock set by poseAt first)
  const under2 = { id: 'U2', name: 'U2', alive: true, pos: [carsStop[2].x, CFG.PLAYER.standH / 2, carsStop[2].z] };
  room.players.set('U2', under2); room.trainSched = null; H.tickTrain(room);
  ok(under2.alive, 'a standing train kills nobody');

  /* v1.0g: leaving a MOVING train is fatal; leaving at the stop is not. */
  {
    const cj = poseAt(tMove)[2];
    const roomJ = { code: 'J', settings: { map: 'urban' }, startedAt: Date.now() - tMove * 1000, players: new Map() };
    const jumper = { id: 'J1', name: 'J1', alive: true, pos: [cj.x, T.floor + CFG.PLAYER.standH / 2, cj.z] };            // riding
    const stayer = { id: 'J2', name: 'J2', alive: true, pos: [cj.x + 2, T.floor + CFG.PLAYER.standH / 2, cj.z] };       // riding, stays
    const never = { id: 'J3', name: 'J3', alive: true, pos: [cj.x - Math.sin(cj.yaw) * 3.2, CFG.PLAYER.standH / 2, cj.z + Math.cos(cj.yaw) * 3.2] };   // never aboard, 3.2 m off the side
    [jumper, stayer, never].forEach(q => roomJ.players.set(q.id, q));
    H.tickTrain(roomJ);
    ok(jumper.alive && stayer.alive && never.alive && jumper.trainAboardAt > 0, 'tick 1: two riders are seen aboard, nobody dies');
    // 0.3 s later the jumper is on the road 3.2 m beside the (advanced) train; the stayer moved with it
    roomJ.startedAt -= 300;
    const cj2 = poseAt(tMove + 0.3)[2];
    jumper.pos = [cj2.x - Math.sin(cj2.yaw) * 3.2, CFG.PLAYER.standH / 2, cj2.z + Math.cos(cj2.yaw) * 3.2];
    stayer.pos = [cj2.x + 2, T.floor + CFG.PLAYER.standH / 2, cj2.z];
    H.tickTrain(roomJ);
    ok(!jumper.alive && jumper.killedBy === 'train', 'a rider who is on the road 0.3 s after being aboard a moving train is killed, tagged train');
    ok(stayer.alive && never.alive, 'the rider who stayed aboard and the bystander who was never aboard live');
    // at the station stop the same step off is safe
    const cs2 = poseAt(0.5)[2];
    const roomS = { code: 'S', settings: { map: 'urban' }, startedAt: Date.now() - 0.5 * 1000, players: new Map() };
    const leaver = { id: 'S1', name: 'S1', alive: true, pos: [cs2.x, T.floor + CFG.PLAYER.standH / 2, cs2.z] };
    roomS.players.set('S1', leaver); H.tickTrain(roomS);
    leaver.pos = [cs2.x - Math.sin(cs2.yaw) * 3.2, CFG.PLAYER.standH / 2, cs2.z + Math.cos(cs2.yaw) * 3.2];
    roomS.startedAt -= 300; H.tickTrain(roomS);
    ok(leaver.alive, 'stepping off at the station stop is safe');
    // stepping onto the platform deck (1.05 m) while the train still creeps is not "ground level"
    poseAt(tMove);
    const roomP = { code: 'P', settings: { map: 'urban' }, startedAt: Date.now() - tMove * 1000, players: new Map() };
    const platformer = { id: 'P1', name: 'P1', alive: true, pos: [cj.x, T.floor + CFG.PLAYER.standH / 2, cj.z] };
    roomP.players.set('P1', platformer); H.tickTrain(roomP);
    roomP.startedAt -= 300;
    platformer.pos = [cj2.x - Math.sin(cj2.yaw) * 3.2, 1.05 + CFG.PLAYER.standH / 2, cj2.z + Math.cos(cj2.yaw) * 3.2];
    H.tickTrain(roomP);
    ok(platformer.alive, 'a rider who steps onto a platform-height deck is not treated as having jumped');
    const hz = fs.readFileSync(path.join(ROOT, 'server/lib/hazards.js'), 'utf8');
    ok(/jumped from the moving train/.test(hz) && /t - q\.trainAboardAt < 1200 && feet < 0\.45/.test(hz), 'the rule is server-side: seen aboard within 1.2 s, train over 2 m/s, now at ground level');
  }
}

console.log('--- the rails are laid ---');
const rails = vm.runInContext('(function(){ var n = 0; __sc.traverse(function(o){ if (o.isMesh && o.geometry && o.geometry.type === "BoxGeometry" && o.matrixAutoUpdate === false) n++; }); return World._colliders().length; })()', ctx);
ok(rails > 0, 'the world built with the loop line in it');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
ok(/src\/environment\/train\.js/.test(html), 'train.js is loaded by the page');
const game = fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8');
ok(/Train\.init\(scene, mapId\)/.test(game) && /Train\.update\(dt\)/.test(game) && /PlayerCtl\.setPlatform\(/.test(game), 'game.js builds, runs and plugs the train into the controller');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
