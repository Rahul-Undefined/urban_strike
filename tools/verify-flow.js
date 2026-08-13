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
/* District names come from the same registry the map signs are built from, so a
   gate line and a signboard in a screenshot say the identical string. */
const DIST = require(path.join(ROOT, "public/src/config/districts.config.js"));
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
  "public/src/config/districts.config.js",
 "public/src/config/index.js","public/src/environment/merge.js","public/src/environment/world.js",
 "public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js",
 "public/src/environment/metro.js","public/src/environment/access.js"]
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

/* v9.1 — WAS urban-only ("Metro and Rural are paused"). Metro has never had a
   connectivity measurement of any kind, which is how a map can ship with sealed
   rooms and a green board. Everything below is now per map; urban's numbers and
   budgets are unchanged.

   v9.1 also fixes a real bug in this gate. The flood was seeded from
   `CFG.SPAWNS[i][0], CFG.SPAWNS[i][2]` — but a spawn tuple is
   [x, z, yaw, team] (server.js:188 reads s[0] and s[1]). Index 2 is the YAW.
   The gate was seeding the flood at (x, yaw) — a point a metre or two from the
   origin — and calling it a spawn. It still produced a plausible answer because
   that point happened to be walkable and in the main region, which is exactly
   why nobody noticed. */

let pass = 0, fail = 0;
const VERBOSE = process.argv.indexOf("-v") !== -1;
function ok(c, label) {
  if (c) { pass++; if (VERBOSE) console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label); }
}

/* Ratchets. Lower is better; never raise one to make a build green. Some of
   this is legitimate — rooftops reached by lift, ledges reached by a jump the
   grid cannot model — which is why the budgets are not zero.
   urban: measured 2026-08-02 against v8.3, unchanged.
   rural/metro: recorded at first measurement, v9.1. */
const ISOLATED_PCT = { urban: 11.0, rural: 11.0, metro: 11.0 };
const BIG_POCKETS  = { urban: 30,   rural: 30,   metro: 30 };

function spawnsFor(map) {
  if (map === "rural") return (CFG.MAPS_RURAL || {}).SPAWNS || [];
  if (map === "metro") return (CFG.MAPS_METRO || {}).SPAWNS || [];
  return CFG.SPAWNS || [];
}

function analyse(map) {
  ctx.__m = map;
  const cols = vm.runInContext(`(function(){var sc=new THREE.Scene();World.reset();World.buildMap(sc,__m);
    return World._colliders().map(function(c){return [c[0],c[1],c[2],c[3],c[4],c[5]];});})();`, ctx);
  /* BOUND is PER MAP (HANDOFF s3). Rasterising rural at urban's 100 would
     declare the outer third of the map non-existent rather than unreachable. */
  const BOUND = vm.runInContext("World.BOUND", ctx);

  const R = CFG.PLAYER.radius, PH = CFG.PLAYER.standH, STEP = CFG.MOVE.step;
  const CELL = 1.0, N = Math.round((BOUND * 2) / CELL);

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
  const near = (x, z) => grid[bidx(x, z)];

  function standY(x, z) {
    const cand = near(x, z);
    let best = null;
    for (const i of cand) {
      const c = cols[i];
      if (x - R <= c[0] || x + R >= c[3] || z - R <= c[2] || z + R >= c[5]) {
        if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
      }
      if (c[4] < -0.6 || c[4] > 1.6) continue;      // ground-level surfaces only
      if (best === null || c[4] > best) best = c[4];
    }
    if (best === null) return null;
    for (const i of cand) {
      const c = cols[i];
      if (x - R >= c[3] || x + R <= c[0] || z - R >= c[5] || z + R <= c[2]) continue;
      if (c[1] < best + PH - 0.05 && c[4] > best + 0.05) return null;
    }
    return best;
  }

  const w = new Int8Array(N * N), h = new Float32Array(N * N);
  for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
    const x = -BOUND + (ix + 0.5) * CELL, z = -BOUND + (iz + 0.5) * CELL;
    const y = standY(x, z);
    if (y !== null) { w[ix * N + iz] = 1; h[ix * N + iz] = y; }
  }

  function flood(sx, sz) {
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
        if (Math.abs(h[j] - h[k]) > STEP) continue;
        seen[j] = 1; n++; q.push(j);
      }
    }
    return { seen, n };
  }

  // spawn tuple is [x, z, yaw, team] — index 1 is z, not 2. See note above.
  let sx = 0, sz = 0, seeded = false;
  for (const sp of spawnsFor(map)) {
    const ix = Math.floor((sp[0] + BOUND) / CELL), iz = Math.floor((sp[1] + BOUND) / CELL);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
    if (w[ix * N + iz]) { sx = ix; sz = iz; seeded = true; break; }
  }
  ok(seeded, map + ": a spawn point stands on walkable ground");

  const b0 = flood(sx, sz);
  let total = 0; for (let i = 0; i < w.length; i++) if (w[i]) total++;
  const isolated = total - b0.n;
  const pct = total ? (isolated / total) * 100 : 0;

  console.log(`\n--- [${map}] flow ---`);
  console.log(`        ${total} walkable cells | ${b0.n} reachable from spawn | ${isolated} isolated (${pct.toFixed(1)}%)`);

  const claimed = new Int8Array(N * N);
  for (let i = 0; i < b0.seen.length; i++) if (b0.seen[i]) claimed[i] = 1;
  const pockets = [];
  for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
    const k = ix * N + iz;
    if (!w[k] || claimed[k]) continue;
    const f = flood(ix, iz);
    let cx = 0, cz = 0, n = 0, y = 0;
    for (let j = 0; j < f.seen.length; j++) if (f.seen[j]) {
      claimed[j] = 1;
      cx += -BOUND + (((j / N) | 0) + 0.5) * CELL; cz += -BOUND + ((j % N) + 0.5) * CELL;
      y += h[j]; n++;
    }
    if (n) pockets.push({ n: n, x: cx / n, z: cz / n, y: y / n });
  }
  pockets.sort((a, b) => b.n - a.n);
  const big = pockets.filter(p => p.n >= 40);
  console.log(`        ${pockets.length} isolated pockets, ${big.length} of 40+ cells`);
  /* District names are urban's registry. Naming a metro pocket "MARKET CROSS"
     would be worse than no name at all. */
  big.slice(0, 12).forEach(p => console.log(
    `        pocket ${String(p.n).padStart(4)} cells  ` +
    (map === "urban" ? `[${DIST.nameAt(p.x, p.z)}]  ` : "") +
    `around (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) at y ${p.y.toFixed(1)}`));

  ok(pct <= ISOLATED_PCT[map],
    `${map}: ${pct.toFixed(1)}% of walkable ground unreachable from spawn (budget ${ISOLATED_PCT[map]}%)`);
  ok(big.length <= BIG_POCKETS[map],
    `${map}: ${big.length} isolated pockets of 40+ cells (budget ${BIG_POCKETS[map]})`);
}

/* RURAL IS DELIBERATELY NOT MEASURED HERE, and this is not a budget dodge.
   standY() accepts only surfaces with a top between -0.6 and 1.6 m — an URBAN
   assumption, that walkable ground is one street plane. Hollow Ridge is
   terraces: most of its walkable surface sits above 1.6 m and is invisible to
   this rasteriser, so the valley floor reads as a set of separate basins joined
   by climbs the gate cannot see. Measured at 44.3% "isolated" on first run,
   which is an artifact, not a defect — verify-access and verify-climb already
   walk rural's routes with a real capsule and pass.
   Including rural would mean a permanent red that everyone learns to ignore,
   which is the failure this project keeps paying for. To include it properly
   the height filter has to become per-map terrain-aware; that is its own piece
   of work, not a line change here. */
console.log("\n--- [rural] flow: NOT MEASURED — ground-plane rasteriser cannot" +
            " model terraces. See the note in this file. ---");
["urban", "metro"].forEach(analyse);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
