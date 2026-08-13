/* gen-loot — propose new loot points on surfaces that already exist.

   Rahul: "buldings mei loot bahot hona chahiye taki rewarding lage ... bahot kam
   loots points hai." Urban has 130 points across a 200 m map with nine
   districts, and most of them are outdoors.

   Loot placed by hand floats, and verify-map catches that as a hard failure —
   so this does not guess. It walks the finished collider set, finds surfaces a
   player can actually stand on INSIDE a building, and emits points that satisfy
   verify-map's own support rule by construction:

       a collider top must sit between y-0.85 and y-0.30

   so every generated point is at surface + 0.55, exactly the convention the
   hand-placed points already use.

   INDOORS is the interesting part. A loot point on an open rooftop is a sniper
   nest, not a room. A surface counts as interior when something else covers it
   between 2.0 m and 6.0 m above — a ceiling. That is also what makes the loot
   rewarding: you have to go inside for it.

   Run: node tools/gen-loot.js  > proposed.txt */

let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP"); process.exit(0); }
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const CFG = require(path.join(ROOT, "public/src/config/index.js"));
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
 "public/src/config/world.config.js","public/src/config/maps-rural.config.js","public/src/config/maps-metro.config.js",
 "public/src/config/districts.config.js","public/src/config/index.js","public/src/environment/merge.js",
 "public/src/environment/world.js","public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js",
 "public/src/environment/metro.js","public/src/environment/access.js"]
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

/* v9.1: map is now an argument. It was hardcoded to urban, so Metro's loot
   could never be regenerated from measured geometry — which is why its points
   still described the pre-v8.20 24 m towers.
   Run: node tools/gen-loot.js [urban|rural|metro] */
ctx.__m = process.argv[2] || "urban";
const cols = vm.runInContext(`(function(){var sc=new THREE.Scene();World.reset();World.buildMap(sc,__m);
  return World._colliders().map(function(c){return [c[0],c[1],c[2],c[3],c[4],c[5]];});})();`, ctx);

const R = CFG.PLAYER.radius, PH = CFG.PLAYER.standH;
const existing = CFG.LOOT_POINTS.map(p => [p[0], p[1], p[2]]);

function supportAt(x, y, z) {
  for (const c of cols)
    if (x >= c[0] - 0.05 && x <= c[3] + 0.05 && z >= c[2] - 0.05 && z <= c[5] + 0.05)
      if (c[4] >= y - 0.85 && c[4] <= y - 0.30) return true;
  return false;
}
function blocked(x, y, z, h) {           // is the standing volume free?
  for (const c of cols) {
    if (x - R >= c[3] || x + R <= c[0] || z - R >= c[5] || z + R <= c[2]) continue;
    if (c[1] < y + h && c[4] > y + 0.06) return true;
  }
  return false;
}
function ceilingOver(x, y, z) {
  for (const c of cols) {
    if (x >= c[3] || x <= c[0] || z >= c[5] || z <= c[2]) continue;
    if (c[1] > y + 1.9 && c[1] < y + 6.0) return true;
  }
  return false;
}

const MIN_SEP = 5.0;
const picked = [];
function tooClose(x, y, z) {
  for (const p of existing) if (Math.hypot(p[0] - x, p[2] - z) < MIN_SEP && Math.abs(p[1] - y) < 2.0) return true;
  for (const p of picked) if (Math.hypot(p[0] - x, p[2] - z) < MIN_SEP && Math.abs(p[1] - y) < 2.0) return true;
  return false;
}

// candidate surfaces: floors and decks big enough to be a room
const decks = cols.filter(c => (c[3] - c[0]) * (c[5] - c[2]) >= 4.0 && c[4] > -0.5 && c[4] < 26);
decks.sort((a, b) => (b[3] - b[0]) * (b[5] - b[2]) - (a[3] - a[0]) * (a[5] - a[2]));

for (const c of decks) {
  const y = c[4] + 0.55;
  const stepX = Math.max(3.0, (c[3] - c[0]) / 4), stepZ = Math.max(3.0, (c[5] - c[2]) / 4);
  for (let x = c[0] + 1.2; x <= c[3] - 1.2; x += stepX) {
    for (let z = c[2] + 1.2; z <= c[5] - 1.2; z += stepZ) {
      if (!ceilingOver(x, c[4], z)) continue;          // outdoors — skip
      if (!supportAt(x, y, z)) continue;
      if (blocked(x, c[4] + 0.05, z, PH)) continue;    // no room to stand
      if (tooClose(x, y, z)) continue;
      picked.push([Math.round(x * 10) / 10, Math.round(y * 100) / 100, Math.round(z * 10) / 10]);
    }
  }
}

/* Cap per district. Without it one tall multi-floor block in the south-east
   produced 101 of 244 points — that is one building, not "loot in every room".
   The cap keeps the distribution even so no district is the obvious farm. */
const PER_DISTRICT = 22;
const byD = {};
picked.forEach(p => { const n = DIST.nameAt(p[0], p[2]); (byD[n] = byD[n] || []).push(p); });
Object.keys(byD).forEach(n => {
  const l = byD[n];
  if (l.length <= PER_DISTRICT) return;
  // keep an even spread rather than the first N, which would all be one floor
  const stride = l.length / PER_DISTRICT, out = [];
  for (let i = 0; i < PER_DISTRICT; i++) out.push(l[Math.floor(i * stride)]);
  byD[n] = out;
});
let total = 0; Object.keys(byD).forEach(n => total += byD[n].length);
console.log("// generated by tools/gen-loot.js — interior surfaces, support-validated");
console.log("// existing " + existing.length + ", proposed " + total + " (capped from " + picked.length + ")");
Object.keys(byD).sort().forEach(n => {
  console.log("    // " + n + " (" + byD[n].length + ")");
  byD[n].forEach(p => console.log(`    [${p[0]}, ${p[1]}, ${p[2]}, 'h'],`));
});
