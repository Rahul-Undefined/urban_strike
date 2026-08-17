/* verify-attach — an attachment must land on a weapon that HAS that part.

   Written for the v10 defect "the knife has a suppressor on it", found by
   Rahul from a screenshot of a knife on the ground with a black cylinder on
   the point of the blade.

   The bug was not in the knife. dress() fitted the muzzle can to whatever
   model happened to be current, anchored to that model's measured
   `userData.muzzleZ`. Every model has a muzzleZ, because it is computed as the
   frontmost point of the geometry — on a rifle that is the bore, on a knife it
   is the tip. Nothing crashed and nothing was undefined, so no gate saw it.
   The bow, the drone and the RPG were all wearing suppressors too; only the
   knife had been photographed.

   THE INVARIANT, not the implementation: after dress(), a weapon whose type
   has no barrel carries no parts. Stated that way this survives a rewrite of
   how dress() decides — if someone replaces the type check with a name list or
   a flag on the model, this still passes as long as the RULE holds.

   Run: node tools/verify-attach.js */

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

/* Same trimmed THREE the model gates run against — see HANDOFF §4.5. It has no
   Float32BufferAttribute, no Box3 and no Group.traverse, and viewmodels.js is
   written to survive that deliberately. */
function Vec(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
Vec.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
Vec.prototype.clone = function () { return new Vec(this.x, this.y, this.z); };
Vec.prototype.copy = function (o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; };
['add', 'sub', 'multiplyScalar', 'addScaledVector', 'normalize', 'applyQuaternion', 'setScalar']
  .forEach(fn => { Vec.prototype[fn] = function () { return this; }; });
function Obj() {
  this.children = []; this.position = new Vec(); this.rotation = new Vec();
  this.scale = new Vec(1, 1, 1); this.userData = {}; this.visible = true; this.castShadow = false;
}
Obj.prototype.add = function (c) { this.children.push(c); return this; };
Obj.prototype.remove = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return this; };
function Klass() { return function () { }; }
const THREE = {
  Group: Obj, Sprite: Obj, Mesh: function () { Obj.call(this); }, Vector3: Vec,
  BoxGeometry: Klass(), CylinderGeometry: Klass(), SphereGeometry: Klass(), PlaneGeometry: Klass(),
  MeshLambertMaterial: Klass(), MeshBasicMaterial: Klass(), SpriteMaterial: Klass(),
  CanvasTexture: Klass(), Color: Klass(), Quaternion: Klass(), Raycaster: Klass(),
  DoubleSide: 2, AdditiveBlending: 2
};
THREE.Mesh.prototype = Object.create(Obj.prototype);

const ctx = { CFG, THREE, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/weapons/viewmodels.js'), 'utf8'), ctx);
const WM = ctx.WeaponModels;
const models = WM.build();

/* Which types have the hardware. A weapon added later inherits the right
   answer by declaring its type, which weapons.config.js already demands. */
const HAS_BARREL = { auto: 1, bolt: 1, semi: 1 };

// count parts dress() fitted, and whether the magazine was stretched
function fitted(g) { return g.children.filter(c => c.userData && c.userData.att).length; }
function magStretch(g) {
  const m = g.userData.mag;
  if (!m || m.userData.baseScaleY === undefined) return 1;
  return m.scale.y / m.userData.baseScaleY;
}

/* Every muzzle attachment in the config, so this does not go stale if a third
   one is added. */
const MUZZLES = Object.keys(CFG.ATTACH).filter(k => CFG.ATTACH[k].cat === 'muzzle');
const MAGS = Object.keys(CFG.ATTACH).filter(k => CFG.ATTACH[k].cat === 'mag');
const SIGHTS = Object.keys(CFG.ATTACH).filter(k => CFG.ATTACH[k].cat === 'sight');

console.log('--- the config still has attachments to fit ---');
ok(MUZZLES.length > 0, 'at least one muzzle attachment exists [' + MUZZLES.join(', ') + ']');
ok(MAGS.length > 0, 'at least one magazine attachment exists [' + MAGS.join(', ') + ']');

console.log('\n--- every model declares what it is ---');
Object.keys(models).forEach(n => {
  const t = models[n].userData.wtype;
  ok(t === (CFG.WEAPONS[n] && CFG.WEAPONS[n].type),
    n + ' carries its config type on the model [' + t + ']');
});

console.log('\n--- a weapon with no barrel wears no muzzle ---');
/* The full cross product: every weapon x every muzzle. The original bug needed
   exactly one combination to be looked at to be obvious, and nobody had. */
Object.keys(models).forEach(n => {
  const type = CFG.WEAPONS[n].type;
  if (HAS_BARREL[type]) return;
  MUZZLES.forEach(mu => {
    WM.dress(models[n], { muzzle: mu });
    ok(fitted(models[n]) === 0,
      n + ' (' + type + ') fits nothing when a ' + mu + ' is equipped');
  });
});

console.log('\n--- a weapon with no magazine well is not stretched ---');
Object.keys(models).forEach(n => {
  const type = CFG.WEAPONS[n].type;
  if (HAS_BARREL[type]) return;
  MAGS.forEach(mg => {
    WM.dress(models[n], { mag: mg });
    ok(Math.abs(magStretch(models[n]) - 1) < 1e-9,
      n + ' (' + type + ') is not stretched by a ' + mg);
  });
});

console.log('\n--- and a real gun still gets its parts ---');
/* The other half of the invariant. A fix that suppresses the knife by
   suppressing everything is not a fix, and this is the assertion that would
   catch it. */
const gunNames = Object.keys(models).filter(n => HAS_BARREL[CFG.WEAPONS[n].type]);
ok(gunNames.length >= 5, 'there are ' + gunNames.length + ' firearms to check');
gunNames.forEach(n => {
  WM.dress(models[n], { muzzle: MUZZLES[0] });
  ok(fitted(models[n]) > 0, n + ' still fits a ' + MUZZLES[0]);
});

console.log('\n--- refitting does not compound ---');
/* A player who swaps a suppressor for a compensator must not wear both, and a
   player who swaps magazines twice must not end up with one hanging a metre
   below the gun. Both have happened. */
/* Compared against a FRESH model wearing the same final attachment, not
   against a fixed number. Muzzles legitimately differ in part count — a
   suppressor is one can, a compensator is a can plus ports — so asserting
   "<= the first one" pins an implementation detail and reddens for a correct
   change. The rule is that swapping leaves you wearing exactly what a clean
   fit would have produced. */
const swapGun = gunNames[0];
const last = MUZZLES[(6 - 1) % MUZZLES.length];
const clean = WM.build()[swapGun];
WM.dress(clean, { muzzle: last });
const expect = fitted(clean);

const g = models[swapGun];
for (let i = 0; i < 6; i++) WM.dress(g, { muzzle: MUZZLES[i % MUZZLES.length] });
ok(fitted(g) === expect,
  swapGun + ' wears one ' + last + ' after six swaps, not six [' + fitted(g) + ' parts, clean fit ' + expect + ']');

/* And the reverse: taking everything off leaves the gun as it was built. A
   strip that misses one part shows up as a suppressor that cannot be removed. */
const stripped = models[gunNames[1]];
WM.dress(stripped, { muzzle: MUZZLES[0] });
WM.dress(stripped, {});
ok(fitted(stripped) === 0, gunNames[1] + ' is bare again after the muzzle is dropped');

if (MAGS.length) {
  const big = MAGS.map(k => CFG.ATTACH[k]).filter(d => d.magMult > 1)[0];
  const bigK = MAGS.filter(k => CFG.ATTACH[k].magMult > 1)[0];
  if (big) {
    const h = models[gunNames[0]];
    WM.dress(h, { mag: bigK });
    const s1 = magStretch(h), y1 = h.userData.mag.position.y;
    for (let i = 0; i < 5; i++) WM.dress(h, { mag: bigK });
    ok(Math.abs(magStretch(h) - s1) < 1e-9 && Math.abs(h.userData.mag.position.y - y1) < 1e-9,
      'the magazine stretch is idempotent over six refits [x' + s1.toFixed(2) + ']');
    WM.dress(h, {});
    ok(Math.abs(magStretch(h) - 1) < 1e-9, 'and unequipping returns it to stock');
  }
}

console.log('\n--- a sight is mechanical only, never geometry ---');
/* HANDOFF §6: "anything mounted on top of a viewmodel grows into the sight
   line. Two separate scopes had to be removed for this." This is the gate that
   stops a third one being added. */
gunNames.slice(0, 4).forEach(n => {
  WM.dress(models[n], {});
  const bare = fitted(models[n]);
  SIGHTS.forEach(s => {
    WM.dress(models[n], { sight: s });
    ok(fitted(models[n]) === bare, n + ' grows no mesh from a ' + s);
  });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
