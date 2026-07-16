/* Headless structural test for the weapon-equip render pipeline.
   Loads the REAL weapons.js (and network.js) under a stubbed THREE and drives
   init -> grant -> switch -> respawn, asserting the viewmodel registry is
   complete and exactly one model is visible at every step.
   Run: node verify-models.js */
const vm = require('vm');
const fs = require('fs');
const CFG = require('./public/js/shared-config.js');

let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label); } }

// ---- minimal THREE stub (structure only, no rendering) ----
function Vec(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
Vec.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
Vec.prototype.clone = function () { return new Vec(this.x, this.y, this.z); };
Vec.prototype.copy = function (o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; };
['add', 'sub', 'multiplyScalar', 'addScaledVector', 'normalize', 'applyQuaternion', 'setScalar'].forEach(fn => { Vec.prototype[fn] = function () { return this; }; });
function Obj() { this.children = []; this.position = new Vec(); this.rotation = new Vec(); this.scale = new Vec(1, 1, 1); this.userData = {}; this.visible = true; this.castShadow = false; }
Obj.prototype.add = function (c) { this.children.push(c); return this; };
Obj.prototype.remove = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return this; };
Obj.prototype.getWorldQuaternion = function (q) { return q; };
Obj.prototype.getWorldDirection = function (v) { return v; };
function Klass() { return function () { }; }
const THREE = {
  Group: Obj, Sprite: Obj,
  Mesh: function () { Obj.call(this); }, Vector3: Vec,
  BoxGeometry: Klass(), CylinderGeometry: Klass(), SphereGeometry: Klass(), PlaneGeometry: Klass(),
  MeshLambertMaterial: Klass(), MeshBasicMaterial: Klass(), SpriteMaterial: Klass(),
  CanvasTexture: Klass(), Color: Klass(), Quaternion: Klass(), Raycaster: Klass(),
  DoubleSide: 2, AdditiveBlending: 2
};
THREE.Mesh.prototype = Object.create(Obj.prototype);

const noop = () => { };
const proxyNoop = new Proxy({}, { get: () => noop });
const ctx = {
  CFG, THREE, console,
  UI: { setWeapon: noop, setAttachments: noop, setCooking: noop, setReloading: noop, toast: noop },
  AudioSys: proxyNoop, FX: proxyNoop, Net: proxyNoop, World: proxyNoop, Minimap: proxyNoop, Game: proxyNoop,
  Pickups: proxyNoop, PlayerCtl: { alive: true, pos: new Vec(), vel: new Vec(), yaw: 0, pitch: 0, moveState: 0, grounded: true, crouch: false },
  Input: {}, performance: { now: () => Date.now() },
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect: noop, fillRect: noop, fillText: noop, strokeText: noop, measureText: () => ({ width: 10 }) }) }), addEventListener: noop },
  window: {}, io: noop, setInterval: () => 0, setTimeout: () => 0, location: {}
};
vm.createContext(ctx);

console.log('--- weapons.js: viewmodel registry + equip pipeline ---');
vm.runInContext(fs.readFileSync('./public/js/weapons.js', 'utf8'), ctx);
const W = ctx.Weapons;
const cam = new Obj();
W.init(cam, new Obj());
const rig = cam.children[0];
const visibles = () => rig.children.filter(c => c.visible);

ok(rig.children.length === CFG.WEAPON_ORDER.length,
  'viewmodel registry complete: ' + rig.children.length + '/' + CFG.WEAPON_ORDER.length + ' weapons have models');
ok(visibles().length === 1 && W.currentName() === 'ak47', 'spawn default: exactly one visible model (ak47)');

W.matchReset();
const exclusives = CFG.WEAPON_ORDER.filter(n => CFG.WEAPONS[n].ex);
exclusives.forEach(n => {
  W.applyGrant({ t: 'weapon', w: n });
  ok(W.currentName() === n && visibles().length === 1,
    'pickup grant equips ' + n + ' with exactly one visible model');
});
W.resetLoadout(); // respawn path
ok(visibles().length === 1 && W.currentName() === exclusives[exclusives.length - 1],
  'respawn restores the equipped exclusive with a visible model');
for (let k = 1; k <= 9; k++) W.selectByKey(k === 9 ? 9 : k);
ok(visibles().length === 1, 'rapid weapon switching never leaves zero or multiple visible models');

console.log('--- network.js: loads + third-person gun factory present ---');
let netOk = true;
try { vm.runInContext(fs.readFileSync('./public/js/network.js', 'utf8'), ctx); } catch (e) { netOk = false; console.log('   load error: ' + e.message); }
ok(netOk, 'network.js evaluates cleanly with third-person weapon factory');
const netSrc = fs.readFileSync('./public/js/network.js', 'utf8');
ok(/setRemoteGun\(r, st\.wp\)/.test(netSrc), 'snapshot ingestion applies wp to the avatar (root cause #2 wired)');
ok(/gunName: null/.test(netSrc) && /setRemoteGun\(r, 0\)/.test(netSrc), 'new remotes never spawn empty-handed');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
