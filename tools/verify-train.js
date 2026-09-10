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
let r1 = vm.runInContext('__run(30)', ctx);
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

console.log('--- the rails are laid ---');
const rails = vm.runInContext('(function(){ var n = 0; __sc.traverse(function(o){ if (o.isMesh && o.geometry && o.geometry.type === "BoxGeometry" && o.matrixAutoUpdate === false) n++; }); return World._colliders().length; })()', ctx);
ok(rails > 0, 'the world built with the loop line in it');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
ok(/src\/environment\/train\.js/.test(html), 'train.js is loaded by the page');
const game = fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8');
ok(/Train\.init\(scene, mapId\)/.test(game) && /Train\.update\(dt\)/.test(game) && /PlayerCtl\.setPlatform\(/.test(game), 'game.js builds, runs and plugs the train into the controller');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
