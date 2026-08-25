/* verify-zfight — surfaces that share a plane and will flicker.

   Rahul's image 14 reports orange/grey flicker on a roof. Flicker is two
   surfaces at identical depth with the GPU picking a different winner each
   frame, and it is invisible to every other gate in this project.

   This codebase has been burned here before. v7.5 attacked z-fighting with a
   polygon-offset material; Rural rendered fully black in the browser while
   every headless gate passed. The lesson written down then was that geometric
   separation beats shader features — so this gate looks for the geometry and
   does not touch a material.

   Everything visible is a box, but by the time a scene exists those boxes have
   been merged into ~90 batches and the individual faces are gone. World's
   _recordBoxes() hook captures them at emit time instead.

   A pair is flagged when two boxes share a face plane within 12 mm, overlap on
   that plane by more than 0.8 m2, and carry DIFFERENT colours — same-coloured
   surfaces can fight all they like and nobody sees it.

   Budgets are ratchets. They may fall, never rise.

   Run: node tools/verify-zfight.js [-v] */
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP"); process.exit(0); }
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
/* District names come from the same registry the map signs are built from, so a
   gate line and a signboard in a screenshot say the identical string. */
const DIST = require(path.join(ROOT, "public/src/config/districts.config.js"));

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, { get: (t, k) => { if (k === "canvas") return c; return function () {
    if (k === "createLinearGradient" || k === "createRadialGradient") return { addColorStop: function () {} };
    if (k === "measureText") return { width: 10 };
    if (k === "getImageData") return { data: new Uint8ClampedArray(4) }; }; }, set: () => true });
  c.getContext = () => g; return c;
}
const ctx = { console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray,
  THREE, performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === "canvas" ? fakeCanvas() : { style: {} }) },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval, AudioSys: { step: function () {} } };
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["public/src/config/weapons.config.js","public/src/config/gameplay.config.js","public/src/config/loot.config.js",
 "public/src/config/world.config.js","public/src/config/maps-rural.config.js","public/src/config/maps-metro.config.js","public/src/config/maps-killhouse.config.js","public/src/config/maps-sunsetrow.config.js","public/src/config/maps-small.config.js","public/src/config/maps-medium.config.js",
 "public/src/config/districts.config.js", "public/src/config/index.js","public/src/environment/merge.js","public/src/environment/world.js",
 "public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js",
 "public/src/environment/metro.js","public/src/environment/killhouse.js","public/src/environment/sunsetrow.js","public/src/environment/smallmaps.js","public/src/environment/access.js"]
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));


let pass = 0, fail = 0;
const VERBOSE = process.argv.indexOf("-v") !== -1;
function ok(c, label) {
  if (c) { pass++; if (VERBOSE) console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label); }
}

ctx.__m = "urban";   // Urban only, by instruction — Metro and Rural are paused
const boxes = vm.runInContext(`(function(){
  var sc = new THREE.Scene(); World.reset(); World._recordBoxes(true);
  World.buildMap(sc, __m);
  var b = World._boxes().slice(); World._recordBoxes(false); return b;
})();`, ctx);

const EPS = 0.012, MIN_AREA = 0.8, ROOF = 2.5;
console.log(`\n--- [urban] ${boxes.length} surfaces ---`);

/* v9.14: ROTATED PIECES ARE EXCLUDED, for the same reason verify-props excludes
   them. Index 8 marks a box placed with a rotY, and such a box is recorded as
   its axis-aligned bounding box. The min and max faces of that AABB are not
   surfaces that exist — the real faces are at an angle inside it — so asking
   whether two of them are coplanar is asking about geometry that was never
   built. Westbrook's elliptical bowl made this unmissable: 44 turf tiles all
   report the same AABB top face and none of them share a real plane.
   Everything axis-aligned is still compared exactly as before. */
const flat = boxes.filter(b => !b[8]);

function scanPlane(faceIdx, oA, oB, label) {
  const boxes = flat;          // v9.14: rotated pieces excluded, see above
  const m = new Map();
  boxes.forEach((b, i) => {
    const k = Math.round(b[faceIdx] / EPS);
    for (const kk of [k - 1, k, k + 1]) { if (!m.has(kk)) m.set(kk, []); m.get(kk).push(i); }
  });
  const seen = new Set(), hits = [];
  for (const [, list] of m) {
    for (let a = 0; a < list.length; a++) for (let c = a + 1; c < list.length; c++) {
      const i = list[a], j = list[c];
      const key = i < j ? i + "_" + j : j + "_" + i;
      if (seen.has(key)) continue; seen.add(key);
      const A = boxes[i], B = boxes[j];
      if (Math.abs(A[faceIdx] - B[faceIdx]) > EPS) continue;
      if (A[6] === B[6]) continue;
      const o1 = Math.min(A[oA + 3], B[oA + 3]) - Math.max(A[oA], B[oA]);
      const o2 = Math.min(A[oB + 3], B[oB + 3]) - Math.max(A[oB], B[oB]);
      if (o1 <= 0.05 || o2 <= 0.05 || o1 * o2 < MIN_AREA) continue;
      hits.push({ area: o1 * o2, plane: A[faceIdx], gap: Math.abs(A[faceIdx] - B[faceIdx]),
        ylo: Math.max(A[1], B[1]), yhi: Math.min(A[4], B[4]),
        x: (Math.max(A[0], B[0]) + Math.min(A[3], B[3])) / 2,
        z: (Math.max(A[2], B[2]) + Math.min(A[5], B[5])) / 2 });
    }
  }
  hits.sort((p, q) => q.area - p.area);
  const high = hits.filter(h => h.ylo > ROOF);
  console.log(`        ${label}: ${hits.length} coplanar pairs (${high.length} above y ${ROOF})`);
  if (VERBOSE || high.length) high.slice(0, 8).forEach(h => console.log(
    `          plane ${h.plane.toFixed(3)}  gap ${h.gap.toFixed(4)}m  ${h.area.toFixed(1)} m2  ` +
    `[${DIST.nameAt(h.x, h.z)}] at (${h.x.toFixed(1)}, ${h.z.toFixed(1)}) y[${h.ylo.toFixed(1)},${h.yhi.toFixed(1)}]`));
  return { all: hits.length, high: high.length };
}

const r = {
  top: scanPlane(4, 0, 2, "horizontal tops"),
  west: scanPlane(0, 1, 2, "west faces"),
  east: scanPlane(3, 1, 2, "east faces"),
  north: scanPlane(2, 0, 1, "north faces"),
  south: scanPlane(5, 0, 1, "south faces")
};
const totalHigh = r.top.high + r.west.high + r.east.high + r.north.high + r.south.high;
const totalAll = r.top.all + r.west.all + r.east.all + r.north.all + r.south.all;

/* Ratchets measured 2026-08-02 against v8.3.

   ROOF_PAIRS is the one that matters — Rahul filmed flicker on a roof, and
   surfaces above head height are the ones a player watches from a distance
   where depth precision is worst. The rest are mostly road markings sitting
   5-20 mm above asphalt, which is a real coplanarity but reads as paint.

   v8.5 RAISED THESE from 40/92 to 46/110, and that is not a regression — it is
   the gate finally seeing the map. The comparison used to be on material COLOUR,
   and almost every material in this codebase is L({ map: canvasTex(...) }) with
   no explicit colour, so concrete, brick, metal, sidewalk, plaster and asphalt
   all reported #ffffff. Every coplanar pair between two textured surfaces was
   being skipped as "same colour". Comparing material identity instead exposed
   18 pairs the gate had been blind to. A budget is only as honest as the
   measurement under it.

   The v8.2 stringer regression was re-tested under the corrected comparison and
   still nets ZERO added pairs, so that fix stands.

   v8.4 tightened these from 46/98 to 40/92. The six that went away were mine:
   the v8.2 stringers hung 9 cm plates on the OUTSIDE of each tread, which for
   any staircase built flush to a wall put the plate inside the wall. An A/B
   build with stringers disabled isolated it exactly — 6 pairs, all above roof
   height. Insetting the plates removed all six. Rahul reported this from the
   browser before the gate did, because the gate's budget had been set AFTER the
   stringers already existed and so had baked the regression in as normal.

   The remaining 92 are NOT FIXED, deliberately. Nudging geometry apart is a rendering change
   whose only proof is a browser, and shipping a rendering change validated by
   headless gates alone is exactly what produced the v7.5 all-black Rural. These
   are enumerated with coordinates so the fix can go out as a build where it is
   the ONLY change and Rahul can confirm it with his eyes. */
/* v9.14 raised these to 50/115 and then PUT THEM BACK, same session, once the
   real cause was found. The excess was never the ellipse: it was four shipping
   containers the new outfield had been laid on top of, plus a pavilion carrying
   side windows and balcony returns it did not need. With the containers moved
   and the pavilion simplified the counts are 45 and 107 — under the numbers
   this file has held since v8.5.
   Left at 46/110 rather than tightened to 45/107, because the one spare pair is
   Urban's existing slack and not something the stadium earned. */
const ROOF_PAIRS = 46, ALL_PAIRS = 110;
ok(totalHigh <= ROOF_PAIRS, `urban: ${totalHigh} coplanar pairs above roof height (budget ${ROOF_PAIRS})`);
ok(totalAll <= ALL_PAIRS, `urban: ${totalAll} coplanar pairs total (budget ${ALL_PAIRS})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
