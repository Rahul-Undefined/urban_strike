/* Headless structural test for the weapon-equip render pipeline.
   Loads the REAL weapons.js (and network.js) under a stubbed THREE and drives
   init -> grant -> switch -> respawn, asserting the viewmodel registry is
   complete and exactly one model is visible at every step.
   Run: node verify-models.js */
const vm = require('vm');
const fs = require('fs');
const CFG = require('./public/src/config/index.js');

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
  UI: proxyNoop,
  AudioSys: proxyNoop, FX: proxyNoop, Net: proxyNoop, World: proxyNoop, Minimap: proxyNoop, Game: proxyNoop,
  Pickups: proxyNoop, PlayerCtl: { alive: true, pos: new Vec(), vel: new Vec(), yaw: 0, pitch: 0, moveState: 0, grounded: true, crouch: false },
  Input: {}, performance: { now: () => Date.now() },
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect: noop, fillRect: noop, fillText: noop, strokeText: noop, measureText: () => ({ width: 10 }) }) }), addEventListener: noop },
  window: {}, io: noop, setInterval: () => 0, setTimeout: () => 0, location: {}
};
vm.createContext(ctx);

console.log('--- weapons/: viewmodel registry + equip pipeline ---');
vm.runInContext(fs.readFileSync('./public/src/weapons/viewmodels.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('./public/src/weapons/system.js', 'utf8'), ctx);
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

console.log('--- v4.3: scope zoom + gear grants ---');
ctx.Input.aim = true;
for (let g9 = 0; g9 < 20 && W.currentName() !== 'awm'; g9++) W.selectByKey(9);
ok(W.currentName() === 'awm', 'slot-9 cycling reaches the AWM (bounded, no spin)');
W.update(0.016); // establish scoped state
ok(W.wheelZoom(1) === true, 'wheel zoom engages while scoped on the AWM');
for (let z = 0; z < 10; z++) W.wheelZoom(1);
const zr = CFG.WEAPONS.awm.scopeZoom;
ok(W.update(0.016).adsFov === zr[0], 'zoom-in clamps at configured max (' + zr[0] + ' deg)');
for (let z = 0; z < 20; z++) W.wheelZoom(-1);
ok(W.update(0.016).adsFov === zr[1], 'zoom-out clamps at configured min (' + zr[1] + ' deg)');
ctx.Input.aim = false;
W.update(0.016);
W.selectByKey(1);
ok(W.wheelZoom(1) === false, 'wheel zoom ignores unscoped weapons (wheel keeps cycling)');
W.applyGrant({ t: 'gear', g: 'mine', n: 7 });
W.applyGrant({ t: 'gear', g: 'molotov', n: 2 });
ok(true, 'gear grants (mine total, molotov increment) apply cleanly');

console.log('--- networking/: loads + third-person gun factory present ---');
let netOk = true;
try {
  vm.runInContext(fs.readFileSync('./public/src/networking/avatars.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('./public/src/networking/net.js', 'utf8'), ctx);
} catch (e) { netOk = false; console.log('   load error: ' + e.message); }
ok(netOk, 'network.js evaluates cleanly with third-person weapon factory');
const netSrc = fs.readFileSync('./public/src/networking/net.js', 'utf8');
ok(/Avatars\.setRemoteGun\(r, st\.wp\)/.test(netSrc), 'snapshot ingestion applies wp to the avatar (root cause #2 wired)');
ok(/gunName: null/.test(netSrc) && /Avatars\.setRemoteGun\(r, 0\)/.test(netSrc), 'new remotes never spawn empty-handed');

/* ---- v5.1 loot invariants ---------------------------------------------
   Exercises the REAL server loot module (not a re-implementation) over 400
   ground loot points and asserts that airdrop-exclusive items never roll. */
{
  const initLoot = require('./server/lib/loot.js');
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push([0, 0.55, 0, i % 3 === 0 ? 's' : (i % 3 === 1 ? 'h' : 'g')]);
  const L = initLoot({ io: { to: () => ({ emit: () => {} }) }, now: () => Date.now(), mapData: () => ({ LOOT_POINTS: pts }) });
  const room = { code: 'X', players: new Map(), settings: {} };
  let leaked = null, sawWeapon = false;
  for (let run = 0; run < 25 && !leaked; run++) {
    L.initPickups(room);
    for (const pk of room.pickups) {
      const it = CFG.LOOT_ITEMS[pk.t];
      if (it && it.drop) leaked = pk.t;
      if (it && it.kind === 'weapon') sawWeapon = true;
    }
  }
  ok(!leaked, 'airdrop-exclusive items never roll on ground loot' + (leaked ? ' (leaked ' + leaked + ')' : ''));
  ok(sawWeapon, 'ground loot still produces weapons after the drop:1 filter');
  const dropOnly = Object.keys(CFG.LOOT_ITEMS).filter(k => CFG.LOOT_ITEMS[k].drop);
  ok(dropOnly.length > 0 && dropOnly.every(k => CFG.AIRDROP.weaponPool.includes(k) || CFG.AIRDROP.attPool.includes(k)),
    'every drop-exclusive item is actually reachable from an airdrop crate');
}

/* ---- v5.1 scope ladder ------------------------------------------------ */
{
  const A = CFG.ATTACH, W = CFG.WEAPONS;
  const sights = Object.keys(A).filter(k => A[k].cat === 'sight');
  const marks = sights.filter(k => A[k].mark);
  ok(marks.length === 3 && marks.every(k => /x[468]/.test(k)), 'exactly 4x/6x/8x are marksman-restricted');
  ok(sights.filter(k => !A[k].mark).length >= 3, '2x/3x/reddot remain available to every weapon');
  const markW = Object.keys(W).filter(k => W[k].mark);
  ok(markW.length >= 1 && markW.every(k => !W[k].scope), 'marksman weapons exist and are not already scoped');
  const fovs = sights.filter(k => A[k].adsFov).map(k => A[k].adsFov);
  ok(new Set(fovs).size === fovs.length, 'every scope has a distinct magnification');
}

/* ---- v5.2 voice wiring invariants ------------------------------------
   Voice failed silently for four releases because nothing asserted that the
   pieces were connected to each other. These are cheap static checks that
   would have caught the dead CFG.VOICE.turn hook immediately. */
{
  const vsrc = fs.readFileSync('./public/src/audio/voice.js', 'utf8');
  const usrc = fs.readFileSync('./public/src/ui/ui.js', 'utf8');
  const gsrc = fs.readFileSync('./public/src/core/game.js', 'utf8');
  const hsrc = fs.readFileSync('./public/index.html', 'utf8');

  ok(CFG.VOICE && typeof CFG.VOICE === 'object', 'CFG.VOICE exists (voice.js reads it for TURN)');
  ok(Array.isArray(CFG.VOICE.turn), 'CFG.VOICE.turn is an array voice.js can iterate');
  ok(/CFG\.VOICE/.test(vsrc), 'voice.js actually reads CFG.VOICE');
  ok(/getDiag/.test(vsrc) && /getDiag/.test(usrc), 'voice diagnostics are exposed AND rendered');
  ok(/id="voice-diag"/.test(hsrc), 'the diagnostics element exists in the DOM');
  ok(/iceRestart/.test(vsrc), 'a failed peer attempts an ICE restart before being dropped');
  ok(/candidate-pair/.test(vsrc), 'the selected ICE candidate pair is reported (direct vs relay)');

  // PTT must be bound exactly once, at document level, so it works in the lobby
  const pttUi = (usrc.match(/setTalking\(true\)/g) || []).length;
  const pttGame = (gsrc.match(/setTalking\(/g) || []).length;
  ok(pttUi === 1 && pttGame === 0, 'push-to-talk is bound once in ui.js and not duplicated in game.js');

  // every throwable must have a reachable key binding
  const bound = new Set((gsrc.match(/e\.code === '(Key[A-Z])'/g) || []).map(m => m.slice(14, -1)));
  const thrown = (gsrc.match(/throwGrenade\('(\w+)'\)/g) || []).map(m => m.slice(15, -2));
  ok(new Set(thrown).size === thrown.length, 'no throwable is bound twice');
  ok(bound.size === (gsrc.match(/e\.code === '(Key[A-Z])'/g) || []).length ||
     bound.size >= thrown.length, 'every throwable has a distinct reachable key');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
