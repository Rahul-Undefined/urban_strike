/* Headless map validator. Loads the REAL environment modules under a stubbed
   THREE, builds the world, and mathematically checks against the collider set:
     1. every LOOT_POINT rests on real geometry (support top within tolerance)
     2. every SPAWN has ground beneath and no solid intersecting the capsule
     3. every AIRDROP point has a clear landing disc
     4. everything sits inside the playable bounds
   Run: node tools/verify-map.js */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + label); } }

// ---- stub THREE (structure only) ----
function Vec(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
Vec.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
Vec.prototype.clone = function () { return new Vec(this.x, this.y, this.z); };
Vec.prototype.copy = function (o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; };
['add', 'sub', 'multiplyScalar', 'addScaledVector', 'normalize', 'applyQuaternion', 'setScalar', 'translateZ']
  .forEach(fn => { Vec.prototype[fn] = function () { return this; }; });
function Obj() {
  this.children = []; this.position = new Vec(); this.rotation = new Vec();
  this.scale = new Vec(1, 1, 1); this.userData = {}; this.visible = true;
  this.castShadow = false; this.receiveShadow = false; this.material = {}; this.up = new Vec();
}
Obj.prototype.add = function (c) { this.children.push(c); return this; };
Obj.prototype.remove = function () { return this; };
Obj.prototype.translateZ = function () { return this; };
Obj.prototype.lookAt = function () { return this; };
Obj.prototype.updateMatrix = function () { return this; };
Obj.prototype.updateMatrixWorld = function () { return this; };
Obj.prototype.getWorldPosition = function (v) { return v || new Vec(); };
Obj.prototype.traverse = function (fn) { fn(this); this.children.forEach(function (c) { if (c.traverse) c.traverse(fn); else fn(c); }); };
Obj.prototype.getWorldQuaternion = function (q) { return q; };
Obj.prototype.getWorldDirection = function (v) { return v || new Vec(); };
function K() { return function () { return new Obj(); }; }
const gctx = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
  fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  fill() {}, arc() {}, fillText() {}, strokeText() {}, clearRect() {},
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
  measureText() { return { width: 10 }; }
};
const THREE = {
  Group: Obj, Sprite: Obj, Mesh: function () { Obj.call(this); }, Line: function () { Obj.call(this); },
  Vector3: Vec, Color: K(), FogExp2: K(), Fog: K(),
  HemisphereLight: function () { Obj.call(this); }, AmbientLight: function () { Obj.call(this); },
  DirectionalLight: function () { const o = new Obj(); o.target = new Obj(); o.shadow = { camera: {}, mapSize: new Vec() }; return o; },
  PointLight: function () { Obj.call(this); },
  BoxGeometry: K(), CylinderGeometry: K(), SphereGeometry: K(), PlaneGeometry: K(), ConeGeometry: K(),
  CircleGeometry: K(), RingGeometry: K(), TorusGeometry: K(), EdgesGeometry: K(), LineSegments: function () { Obj.call(this); },
  BufferGeometry: function () { this.setFromPoints = () => this; },
  MeshLambertMaterial: K(), MeshBasicMaterial: K(), SpriteMaterial: K(), LineBasicMaterial: K(),
  CanvasTexture: function () { this.wrapS = this.wrapT = 0; this.repeat = new Vec(1, 1); },
  RepeatWrapping: 1000, DoubleSide: 2, AdditiveBlending: 2, PCFSoftShadowMap: 1
};
THREE.Mesh.prototype = Object.create(Obj.prototype);
THREE.Line.prototype = Object.create(Obj.prototype);

const ctx = {
  CFG, THREE, console, Math, performance: { now: () => 0 },
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => gctx }) },
  window: {}
};
vm.createContext(ctx);
['environment/world.js', 'environment/districts-south.js', 'environment/districts-north.js',
 'environment/districts-outer.js', 'environment/deco.js'].forEach(f => {
  const p = path.join(ROOT, 'public/src', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
});
const scene = new Obj();
ctx.World.build(scene);
const cols = ctx.World._colliders();
console.log('world built headlessly: ' + cols.length + ' colliders');

const WALL = ctx.World.BOUND || 70; // playable half-extent (world exports BOUND after V4.2)

function supportAt(x, y, z) {
  // a collider top within [y-0.85, y-0.30] that contains (x,z)
  for (const c of cols) {
    if (x >= c[0] - 0.05 && x <= c[3] + 0.05 && z >= c[2] - 0.05 && z <= c[5] + 0.05) {
      if (c[4] >= y - 0.85 && c[4] <= y - 0.30) return true;
    }
  }
  return false;
}
function boxOverlap(cx, cy, cz, hx, hy, hz, c) {
  return cx + hx > c[0] + 0.02 && cx - hx < c[3] - 0.02 &&
         cy + hy > c[1] + 0.02 && cy - hy < c[4] - 0.02 &&
         cz + hz > c[2] + 0.02 && cz - hz < c[5] - 0.02;
}
function standingClear(x, z) {
  let ground = false;
  for (const c of cols) {
    if (c[4] > 0.35 && boxOverlap(x, 0.95, z, 0.34, 0.86, 0.34, c)) return 'inside solid';
    if (x >= c[0] && x <= c[3] && z >= c[2] && z <= c[5] && c[4] >= -0.06 && c[4] <= 0.35) ground = true;
  }
  return ground ? null : 'no ground beneath';
}

console.log('--- loot points (' + CFG.LOOT_POINTS.length + ') ---');
CFG.LOOT_POINTS.forEach((p, i) => {
  ok(Math.abs(p[0]) < WALL && Math.abs(p[2]) < WALL, 'loot#' + i + ' [' + p + '] inside bounds');
  ok(supportAt(p[0], p[1], p[2]), 'loot#' + i + ' [' + p + '] floats (no support at y=' + p[1] + ')');
});
console.log('--- spawns (' + CFG.SPAWNS.length + ') ---');
CFG.SPAWNS.forEach((s, i) => {
  ok(Math.abs(s[0]) < WALL && Math.abs(s[1]) < WALL, 'spawn#' + i + ' [' + s[0] + ',' + s[1] + '] inside bounds');
  const bad = standingClear(s[0], s[1]);
  ok(!bad, 'spawn#' + i + ' [' + s[0] + ',' + s[1] + '] ' + bad);
});
console.log('--- airdrop points (' + CFG.AIRDROP.points.length + ') ---');
CFG.AIRDROP.points.forEach((p, i) => {
  let blocked = null;
  for (const c of cols) {
    if (boxOverlap(p[0], 1.2, p[1], 1.05, 0.95, 1.05, c)) { blocked = c; break; }
  }
  ok(!blocked, 'airdrop#' + i + ' [' + p + '] landing blocked by [' + blocked + ']');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
