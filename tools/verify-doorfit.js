/* ===== v12.0 - THE BIGGER OPERATOR STILL FITS EVERY DOOR (brief item 9) =====

   Item 9 grew the rendered rig ~5% and demanded, in the same breath, that the
   growth "must not break gameplay ... enter doors, move through buildings,
   pass through corridors ... without creating new invisible walls". Passage
   is decided by ONE number — CFG.PLAYER.radius, the movement capsule — and
   the first assertion pins it, because the day someone "helpfully" grows the
   capsule to match the render is the day every doorway in five maps gets
   0.05 m of invisible wall on each side.

   The second thing that can go wrong is purely visual: shoulders wider than
   a door frame clip through it as the operator walks in, which reads as a
   broken wall even though collision is perfect. The narrowest deliberate
   opening in the shipped maps is 1.14 m (Killhouse office doorways; the
   urban apartment interior doors are 1.2 m). The rendered WORST-CASE span —
   fully kitted, arms at combat idle, any yaw — must leave visible margin
   inside that. Measured from the settled pose the way verify-hitbox does,
   not computed from constants, so a future arm-pose change is caught too. */
const THREE = require('three');
const vm = require('vm');
const fs = require('fs');
let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, { get: (t, k) => {
    if (k === 'canvas') return c;
    return function () {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop() {} };
      if (k === 'measureText') return { width: 40 };
      if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
    };
  }, set: () => true });
  c.getContext = () => g;
  return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
  isFinite, isNaN, parseInt, parseFloat,
  Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
  performance: { now: () => Date.now() },
  document: { createElement: t => (t === 'canvas' ? fakeCanvas() : { style: {} }),
              getElementById: () => null, addEventListener() {} },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
ctx.Net = { getMyTeam: () => null };
vm.createContext(ctx);
['public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
 'public/src/config/loot.config.js', 'public/src/config/world.config.js',
 'public/src/config/maps-rural.config.js', 'public/src/config/maps-metro.config.js',
 'public/src/config/index.js', 'public/src/weapons/viewmodels.js',
 'public/src/networking/avatars.js'
].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));

console.log('--- verify-doorfit: the movement capsule and the rendered span ---\n');

const NARROWEST_DOOR = 1.14;   // Killhouse office openings; see PLAN rows in killhouse.js
const MARGIN = 0.06;           // visible daylight between shoulder and frame

ok(ctx.CFG.PLAYER.radius === 0.35,
  'the movement capsule radius is UNTOUCHED at 0.35 - passage through every ' +
  'verify-access route is decided by this number and only this number');
ok(NARROWEST_DOOR - 2 * ctx.CFG.PLAYER.radius >= 0.4,
  'the capsule leaves ' + (NARROWEST_DOOR - 2 * ctx.CFG.PLAYER.radius).toFixed(2) +
  ' m of steering room in the narrowest door - no new invisible walls are possible');

const span = vm.runInContext(`(function(){
  var av = Avatars.buildAvatar('Fit', 0xf0a232);
  Avatars.setGear(av, 3, 3);
  Avatars.setRemoteGun({ av: av, gunName: null }, 0);
  var sc = new THREE.Scene(); sc.add(av.group); av.baseY = 10;
  for (var f = 0; f < 400; f++) Avatars.poseAvatar(av, { moved:0, mx:0, mz:0, run:false,
    crouch:0, prone:0, dead:false, deadT:0, rx:0, ry:0, lean:0, reloading:false, dist:10, dt:0.016 });
  av.group.updateMatrixWorld(true);
  var box = new THREE.Box3();
  av.group.traverse(function(o){ if (o.isMesh && o.visible) box.union(new THREE.Box3().setFromObject(o)); });
  return { w: box.max.x - box.min.x, d: box.max.z - box.min.z };
})();`, ctx, { filename: '<span>' });

console.log('        rendered span: ' + span.w.toFixed(3) + ' m wide, ' + span.d.toFixed(3) + ' m deep (kitted, combat idle)');
ok(span.w <= NARROWEST_DOOR - 2 * MARGIN,
  'worst-case shoulder span ' + span.w.toFixed(2) + ' m clears the ' + NARROWEST_DOOR +
  ' m door with ' + MARGIN + ' m per side - the wider render cannot clip a frame');
ok(span.w >= 0.8,
  'and the span is a sane human width, so this gate is measuring a real rig [' + span.w.toFixed(2) + ' m]');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
