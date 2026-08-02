/* verify-flow — is the city connected, or is it a set of sealed pockets?

   Rahul's images 6, 7 and 19 all say the same thing: walls that block movement
   without earning it. "Does this wall improve gameplay" is a judgement call, but
   "can a player standing here reach that ground at all" is not, and it turns out
   to be the measurable half of the question.

   The gate rasterises Urban's walkable ground at 1 m, floods from a spawn, and
   reports what cannot be reached. It found the legacy inner perimeter at +/-70
   that v8.3 removed, and it holds the line afterwards.

   A note on what this does NOT measure: the +/-70 ring had gates at all four
   avenue crossings plus the station hall, the service gate and the mall, so
   removing it only gained 371 reachable cells. It was costing detour and visual
   segmentation, not access. Connectivity is the objective floor, not the whole
   of map flow — do not read a green here as "the map flows well".

   Run: node tools/verify-flow.js [-v] */
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP"); process.exit(0); }
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const CFG = require(path.join(ROOT, "public/src/config/index.js"));

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
 "public/src/config/index.js","public/src/environment/merge.js","public/src/environment/world.js",
 "public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js",
 "public/src/environment/metro.js","public/src/environment/access.js"]
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

ctx.__m = "urban";   // Urban only, by instruction — Metro and Rural are paused
const cols = vm.runInContext(`(function(){var sc=new THREE.Scene();World.reset();World.buildMap(sc,__m);
  return World._colliders().map(function(c){return [c[0],c[1],c[2],c[3],c[4],c[5]];});})();`, ctx);

const R = CFG.PLAYER.radius, PH = CFG.PLAYER.standH, STEP = CFG.MOVE.step;
const CELL = 1.0, BOUND = 100, N = (BOUND * 2) / CELL;

// spatial index so this finishes this decade
const BUCKET = 8, BN = Math.ceil((BOUND * 2) / BUCKET);
const grid = new Array(BN * BN); for (let i = 0; i < grid.length; i++) grid[i] = [];
function bidx(x, z) { return Math.min(BN - 1, Math.max(0, Math.floor((x + BOUND) / BUCKET))) * BN
                           + Math.min(BN - 1, Math.max(0, Math.floor((z + BOUND) / BUCKET))); }
cols.forEach((c, i) => {
  const x0 = Math.floor((c[0] + BOUND) / BUCKET), x1 = Math.floor((c[3] + BOUND) / BUCKET);
  const z0 = Math.floor((c[2] + BOUND) / BUCKET), z1 = Math.floor((c[5] + BOUND) / BUCKET);
  for (let a = Math.max(0, x0); a <= Math.min(BN - 1, x1); a++)
    for (let b = Math.max(0, z0); b <= Math.min(BN - 1, z1); b++) grid[a * BN + b].push(i);
});
function near(x, z) { return grid[bidx(x, z)]; }

// ground height a player can stand on at (x,z), or null
function standY(x, z, excl) {
  const cand = near(x, z);
  let best = null;
  for (const i of cand) {
    if (excl !== undefined && i === excl) continue;
    const c = cols[i];
    if (x - R <= c[0] || x + R >= c[3] || z - R <= c[2] || z + R >= c[5]) {
      if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
    }
    if (c[4] < -0.6 || c[4] > 1.6) continue;      // ground-level surfaces only
    if (best === null || c[4] > best) best = c[4];
  }
  if (best === null) return null;
  // headroom: nothing intruding between feet and head
  for (const i of cand) {
    if (excl !== undefined && i === excl) continue;
    const c = cols[i];
    if (x - R >= c[3] || x + R <= c[0] || z - R >= c[5] || z + R <= c[2]) continue;
    if (c[1] < best + PH - 0.05 && c[4] > best + 0.05) return null;
  }
  return best;
}

function buildWalk(excl) {
  const w = new Int8Array(N * N), h = new Float32Array(N * N);
  for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
    const x = -BOUND + (ix + 0.5) * CELL, z = -BOUND + (iz + 0.5) * CELL;
    const y = standY(x, z, excl);
    if (y !== null) { w[ix * N + iz] = 1; h[ix * N + iz] = y; }
  }
  return { w, h };
}
function flood(w, h, sx, sz) {
  const seen = new Int8Array(N * N), q = [sx * N + sz];
  if (!w[q[0]]) return { seen, n: 0 };
  seen[q[0]] = 1; let n = 1;
  while (q.length) {
    const k = q.pop(), ix = (k / N) | 0, iz = k % N;
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= N || jz >= N) continue;
      const j = jx * N + jz;
      if (seen[j] || !w[j]) continue;
      if (Math.abs(h[j] - h[k]) > STEP) continue;   // can't step that high
      seen[j] = 1; n++; q.push(j);
    }
  }
  return { seen, n };
}


let pass = 0, fail = 0;
const VERBOSE = process.argv.indexOf("-v") !== -1;
function ok(c, label) {
  if (c) { pass++; if (VERBOSE) console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label); }
}

const base = buildWalk();
let sx = 0, sz = 0, seeded = false;
for (const sp of CFG.SPAWNS) {
  const ix = Math.floor((sp[0] + BOUND) / CELL), iz = Math.floor((sp[2] + BOUND) / CELL);
  if (base.w[ix * N + iz]) { sx = ix; sz = iz; seeded = true; break; }
}
ok(seeded, "a spawn point stands on walkable ground");
const b0 = flood(base.w, base.h, sx, sz);
let total = 0; for (let i = 0; i < base.w.length; i++) if (base.w[i]) total++;
const isolated = total - b0.n;
const pct = (isolated / total) * 100;

console.log(`\n--- [urban] flow ---`);
console.log(`        ${total} walkable cells | ${b0.n} reachable from spawn | ${isolated} isolated (${pct.toFixed(1)}%)`);

/* Enumerate the isolated pockets so the district pass has somewhere to go.
   A pocket bigger than ~40 cells is a room, yard or rooftop a player can see
   and cannot enter — those are the ones worth a human looking at. */
const claimed = new Int8Array(N * N);
for (let i = 0; i < b0.seen.length; i++) if (b0.seen[i]) claimed[i] = 1;
const pockets = [];
for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
  const k = ix * N + iz;
  if (!base.w[k] || claimed[k]) continue;
  const f = flood(base.w, base.h, ix, iz);
  let cx = 0, cz = 0, n = 0, y = 0;
  for (let j = 0; j < f.seen.length; j++) if (f.seen[j]) {
    claimed[j] = 1;
    cx += -BOUND + (((j / N) | 0) + 0.5) * CELL; cz += -BOUND + ((j % N) + 0.5) * CELL;
    y += base.h[j]; n++;
  }
  if (n) pockets.push({ n: n, x: cx / n, z: cz / n, y: y / n });
}
pockets.sort((a, b) => b.n - a.n);
const big = pockets.filter(p => p.n >= 40);
console.log(`        ${pockets.length} isolated pockets, ${big.length} of 40+ cells`);
big.slice(0, 12).forEach(p => console.log(
  `        pocket ${String(p.n).padStart(4)} cells around (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) at y ${p.y.toFixed(1)}`));

/* Ratchets, measured 2026-08-02 against v8.3. Lower is better; never raise one
   to make a build green. Some of this is legitimate — rooftops reached by lift,
   ledges reached by a jump the grid cannot model — which is why the budget is
   not zero. It should still come down every district pass. */
const ISOLATED_PCT = 11.0;
const BIG_POCKETS = 30;
ok(pct <= ISOLATED_PCT, `urban: ${pct.toFixed(1)}% of walkable ground unreachable from spawn (budget ${ISOLATED_PCT}%)`);
ok(big.length <= BIG_POCKETS, `urban: ${big.length} isolated pockets of 40+ cells (budget ${BIG_POCKETS})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
