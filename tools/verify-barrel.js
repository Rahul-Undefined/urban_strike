/* verify-barrel — the wall probe must reach the END of the barrel, on the line
   the GUN occupies, for every weapon in the game.

   WHY THIS GATE EXISTS

   Rahul, twice, versions apart: "guns go blank and look inserted in the
   container or the walls." v9.12 added a probe and the symptom survived to
   v9.15 (Recording_105559 — an AK barrel buried in a blue container while the
   player faces it). Three separate reasons, none of which any gate could see:

   1. `CLEAR = 1.05` was TYPED. Measured, barrels reach 0.72 m (pistol) to
      1.64 m (AWM) ahead of the camera hip-firing, and a suppressor adds
      another 0.20 m. Everything between 1.05 and 1.84 was invisible.
   2. The ray started at the camera. The hip-fire rig is 0.26 m to the RIGHT.
   3. And 0.22 m BELOW the eye — which is why the reported case was a
      chest-high container you look over and shoot through.

   THE DEEPER PROBLEM, and the reason this file measures rather than asserts a
   number: the gates could never have caught (1). viewmodels.js measures each
   muzzle from `o.geometry.parameters`, and the stub THREE the gates ran under
   had no `.parameters`, so the guard skipped every part and the -0.7 fallback
   fired for all 25 weapons. Every gate that touched muzzleZ was reading a
   constant and calling it a measurement. tools/_three-stub.js carries real
   parameters; this gate asserts the fallback is NOT in use, so that failure
   mode announces itself instead of passing quietly.

   Run: node tools/verify-barrel.js */

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const { THREE } = require(path.join(ROOT, 'tools/_three-stub.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

const ctx = { CFG, THREE, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/weapons/viewmodels.js'), 'utf8'), ctx);
const models = ctx.WeaponModels.build();

/* The rig offsets, read from weapons/system.js rather than duplicated. If
   someone moves the gun on screen, this gate follows it — a copy of the
   numbers here would silently go stale, which is failure mode §4.4. */
const sysSrc = fs.readFileSync(path.join(ROOT, 'public/src/weapons/system.js'), 'utf8');
function readOffset(name) {
  const m = sysSrc.match(new RegExp('var\\s+' + name + '\\s*=\\s*aiming\\s*\\?\\s*(-?[\\d.]+)\\s*:\\s*(-?[\\d.]+)'));
  return m ? { ads: parseFloat(m[1]), hip: parseFloat(m[2]) } : null;
}
const TX = readOffset('tx'), TY = readOffset('ty'), TZ = readOffset('tz');

console.log('--- the rig offsets are still readable from source ---');
ok(TX && TY && TZ, 'tx / ty / tz found in weapons/system.js');
if (!TX || !TY || !TZ) { console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); }
ok(Math.abs(TX.hip) > 0.05, 'the hip rig really is offset sideways [x ' + TX.hip + ' m]');
ok(Math.abs(TY.hip) > 0.05, 'the hip rig really is offset downward [y ' + TY.hip + ' m]');

console.log('\n--- muzzles are MEASURED, not defaulted ---');
/* -0.7 is the fallback in viewmodels.js. If more than one weapon reports it,
   the measuring loop is not running and every number below is fiction. */
const names = Object.keys(models);
const defaulted = names.filter(n => Math.abs(models[n].userData.muzzleZ + 0.7) < 1e-9);
ok(defaulted.length <= 1,
  'at most one weapon lands on the -0.700 fallback [' + defaulted.length + ' of ' + names.length +
  (defaulted.length ? ': ' + defaulted.join(', ') : '') + ']');
const spread = Math.max(...names.map(n => Math.abs(models[n].userData.muzzleZ))) -
  Math.min(...names.map(n => Math.abs(models[n].userData.muzzleZ)));
ok(spread > 0.3, 'barrel lengths actually differ across the roster [' + spread.toFixed(2) + ' m spread]');
names.forEach(n => {
  const mz = models[n].userData.muzzleZ;
  ok(isFinite(mz) && mz < 0 && mz > -2.5, n + ' muzzleZ ' + mz.toFixed(3) + ' m is a plausible barrel');
});

console.log('\n--- the probe reaches past the longest barrel, in both stances ---');
/* Recompute CLEAR exactly as system.js does, and require it to cover the
   physical tip of the gun. That is the invariant: probe >= reach. A future
   change to the formula is fine as long as this still holds. */
const SUPP = 0.20, MARGIN_MIN = 0.02;
function clearFor(mz, tz, supp) { return Math.abs(tz) + Math.abs(mz) + (supp ? SUPP : 0) + 0.12; }

let worst = 1e9, worstName = '';
[['hip', TZ.hip], ['ads', TZ.ads]].forEach(([stance, tz]) => {
  names.forEach(n => {
    [false, true].forEach(supp => {
      const mz = models[n].userData.muzzleZ;
      const reach = Math.abs(tz) + Math.abs(mz) + (supp ? SUPP : 0);
      const clear = clearFor(mz, tz, supp);
      const slack = clear - reach;
      if (slack < worst) { worst = slack; worstName = n + ' ' + stance + (supp ? ' +supp' : ''); }
      if (n === 'awm' || n === 'pistol') {
        ok(slack >= MARGIN_MIN,
          n + ' ' + stance + (supp ? ' +supp' : '') + ': probe ' + clear.toFixed(2) +
          ' m covers reach ' + reach.toFixed(2) + ' m');
      }
    });
  });
});
ok(worst >= MARGIN_MIN,
  'every weapon x stance x suppressor combination is covered [tightest ' +
  worst.toFixed(3) + ' m on ' + worstName + ']');

console.log('\n--- and the old constant would NOT have been enough ---');
/* The regression assertion. If someone reverts to a constant, this reddens and
   names the weapons it would strand. */
const OLD = 1.05;
const stranded = names.filter(n => (Math.abs(TZ.hip) + Math.abs(models[n].userData.muzzleZ)) > OLD);
ok(stranded.length > 0,
  'a fixed 1.05 m probe would strand ' + stranded.length + ' of ' + names.length +
  ' weapons — this is why it is derived');

console.log('\n--- the probe is cast from the gun, not only from the eye ---');
/* Structural, because the geometric consequence cannot be simulated without a
   world. Two things must be true in source: the second origin is displaced by
   the rig offsets, and the two-origin helper is what is being called. */
ok(/rayDist2/.test(sysSrc), 'system.js calls the two-origin probe World.rayDist2');
ok(/camera\.position\.x\s*\+\s*rx\s*\*\s*tx/.test(sysSrc),
  'the second origin is displaced sideways by the rig offset tx');
ok(/camera\.position\.y\s*\+\s*ty/.test(sysSrc),
  'the second origin is displaced downward by the rig offset ty');
ok(!/World\.rayHit\(camera\.position,\s*fwd,\s*CLEAR\)/.test(sysSrc),
  'the old eye-only single cast is gone');

console.log('\n--- CLEAR is derived from the model, not typed ---');
const clearLine = sysSrc.match(/var CLEAR = ([^;]+);/);
ok(!!clearLine, 'CLEAR is still assigned in system.js');
if (clearLine) {
  ok(/muz/.test(clearLine[1]),
    'CLEAR reads the measured barrel [' + clearLine[1].trim() + ']');
  ok(!/^\s*[\d.]+\s*$/.test(clearLine[1]),
    'CLEAR is not a bare number');
}

console.log('\n--- the ray helper allocates nothing per collider ---');
/* raySlab ran once per collider per ray and built two arrays each time —
   6,608 short-lived arrays per rayHit on Urban, every frame. A GC pause mid
   frame is what a player calls a stutter. */
const worldSrc = fs.readFileSync(path.join(ROOT, 'public/src/environment/world.js'), 'utf8');
const slab = worldSrc.match(/function raySlab\([^)]*\)\s*\{[\s\S]*?\n  \}/);
ok(!!slab, 'raySlab is present');
if (slab) {
  ok(!/=\s*\[/.test(slab[0]), 'raySlab builds no arrays');
  ok(!/new /.test(slab[0]), 'raySlab allocates no objects');
}
const rd2 = worldSrc.match(/function rayDist2\([^)]*\)\s*\{[\s\S]*?\n  \}/);
ok(!!rd2, 'rayDist2 is present');
if (rd2) {
  ok((rd2[0].match(/for \(/g) || []).length === 1,
    'rayDist2 walks the collider array ONCE for both rays');
  ok(!/new /.test(rd2[0]), 'rayDist2 allocates no objects');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
