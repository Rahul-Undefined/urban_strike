/* COVER GATE (v5.0)
   Grids the playable area and measures, for every cell, the distance to the
   nearest piece of usable cover — a collider whose top sits between 0.5m and
   3.5m (crouch-height to standing-height obstruction). Cells further than
   MAXD from any cover are "dead ground": you can be shot there with nothing to
   break line of sight. Prints an ASCII map and the worst clusters so map work
   is driven by data instead of by eyeballing screenshots. Run with `--report`
   for the map; with no flag it asserts and exits non-zero. */
let THREE; try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm"), fs = require("fs");

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, {
    get: (t, k) => {
      if (k === "canvas") return c;
      return function () {
        if (k === "createLinearGradient" || k === "createRadialGradient") return { addColorStop: function () {} };
        if (k === "measureText") return { width: 10 };
        if (k === "getImageData") return { data: new Uint8ClampedArray(4) };
      };
    }, set: () => true
  });
  c.getContext = () => g; return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray,
  THREE, performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === "canvas" ? fakeCanvas() : { style: {} }) },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
[
  "public/src/config/weapons.config.js", "public/src/config/gameplay.config.js",
  "public/src/config/loot.config.js", "public/src/config/world.config.js",
  "public/src/config/index.js", "public/src/environment/merge.js",
  "public/src/environment/world.js", "public/src/environment/districts-south.js",
  "public/src/environment/districts-north.js", "public/src/environment/districts-outer.js",
  "public/src/environment/deco.js", "public/src/environment/rural.js", "public/src/environment/metro.js",
  "public/src/environment/access.js"
].forEach(f => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));

const BOUND = 100, CELL = 4, MAXD = 14;   // metres
const REPORT = process.argv.includes("--report");

function analyse(map) {
  ctx.__m = map;
  vm.runInContext(`World.reset && World.isBuilt() && World.reset(); World.buildMap(__sc, __m);`,
    Object.assign(ctx, { __sc: new THREE.Scene() }));
  const cols = ctx.World._colliders();
  // usable cover: something that blocks a standing or crouching body
  const cover = cols.filter(c => c[4] >= 0.5 && c[4] <= 3.5 && (c[3] - c[0]) < 30 && (c[5] - c[2]) < 30);
  const n = Math.floor((BOUND * 2) / CELL);
  const grid = [], dead = [];
  for (let iz = 0; iz < n; iz++) {
    const row = [];
    for (let ix = 0; ix < n; ix++) {
      const x = -BOUND + (ix + 0.5) * CELL, z = -BOUND + (iz + 0.5) * CELL;
      let best = 1e9;
      for (const c of cover) {
        const dx = Math.max(c[0] - x, 0, x - c[3]);
        const dz = Math.max(c[2] - z, 0, z - c[5]);
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < best) { best = d; if (best < 1) break; }
      }
      row.push(best);
      if (best > MAXD) dead.push({ x: Math.round(x), z: Math.round(z), d: +best.toFixed(1) });
    }
    grid.push(row);
  }
  return { cols, cover, grid, dead, n };
}

function render(map, r) {
  console.log(`\n=== [${map}] cover map  (cell ${CELL}m, '.' <6m  ':' <10m  '-' <${MAXD}m  '#' DEAD)  x -> east, z v south`);
  for (let iz = 0; iz < r.n; iz++) {
    let line = "";
    for (let ix = 0; ix < r.n; ix++) {
      const d = r.grid[iz][ix];
      line += d < 6 ? "." : d < 10 ? ":" : d <= MAXD ? "-" : "#";
    }
    console.log("  " + line);
  }
}

let fail = 0;
for (const map of ["urban", "rural"]) {
  const r = analyse(map);
  const pct = (r.dead.length / (r.n * r.n) * 100).toFixed(1);
  console.log(`[${map}] cover pieces=${r.cover.length}  dead cells=${r.dead.length}/${r.n * r.n} (${pct}%)  worst=${r.dead.length ? Math.max(...r.dead.map(d => d.d)) : 0}m`);
  if (REPORT) {
    render(map, r);
    const worst = r.dead.slice().sort((a, b) => b.d - a.d).slice(0, 14);
    console.log("  worst dead ground:", worst.map(d => `(${d.x},${d.z})@${d.d}m`).join(" "));
  }
  if (r.dead.length / (r.n * r.n) > 0.06) { console.log(`  FAIL ${map}: more than 6% of the map is dead ground`); fail++; }
  else console.log(`  PASS ${map}: dead ground within budget`);
}
process.exit(REPORT ? 0 : (fail ? 1 : 0));
