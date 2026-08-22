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
  /* v8.9: maps-rural + maps-metro were MISSING here. index.html loads both
     (lines 286-287); this gate did not. rural therefore built with
     CFG.MAPS_RURAL undefined and produced 510 colliders where the browser
     produces 525 -- 15 objects short, on the gate whose entire job is to
     reproduce the browser build. Keep this list identical to index.html. */
  "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js","public/src/config/maps-killhouse.config.js",
  "public/src/config/districts.config.js", "public/src/config/index.js", "public/src/environment/merge.js",
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
  const _C = require('../public/src/config/index.js');
  const MAPDATA = { rural: (_C.MAPS_RURAL || {}), metro: (_C.MAPS_METRO || {}) }[map] || {};
  const WATER = MAPDATA.WATER_ZONES || [];
  const n = Math.floor((BOUND * 2) / CELL);
  const grid = [], dead = [], skipped = { n: 0 };
  for (let iz = 0; iz < n; iz++) {
    const row = [];
    for (let ix = 0; ix < n; ix++) {
      const x = -BOUND + (ix + 0.5) * CELL, z = -BOUND + (iz + 0.5) * CELL;
      /* v9.0: open water is dead ground BY DEFINITION and counting it as a
         cover failure would force the budget up until it stopped catching real
         dead ground on land. Rural declares its river and lake; maps without
         water declare nothing and behave exactly as before. */
      if (WATER.some(w => x >= w[0] && x <= w[2] && z >= w[1] && z <= w[3])) { row.push(-1); skipped.n++; continue; }
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
  return { cols, cover, grid, dead, n, skipped: skipped.n };
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
/* v9.1: metro ADDED. A metro budget of 0.06 has sat in DEAD_BUDGET below since
   v9.0, but metro was never in this loop, so the budget was never applied to
   anything. Metro had no dead-ground measurement of any kind — the gate that
   exists to prove a map is fightable had never looked at it. */
for (const map of ["urban", "rural", "metro", "killhouse"]) {
  const r = analyse(map);
  const land = r.n * r.n - r.skipped;
  const pct = (r.dead.length / land * 100).toFixed(1);
  console.log(`[${map}] cover pieces=${r.cover.length}  dead cells=${r.dead.length}/${land} land (${pct}%)` +
    (r.skipped ? `  [${r.skipped} water cells excluded]` : '') +
    `  worst=${r.dead.length ? Math.max(...r.dead.map(d => d.d)) : 0}m`);
  if (REPORT) {
    render(map, r);
    const worst = r.dead.slice().sort((a, b) => b.d - a.d).slice(0, 14);
    console.log("  worst dead ground:", worst.map(d => `(${d.x},${d.z})@${d.d}m`).join(" "));
  }
  /* v9.0: the dead-ground budget is PER MAP, because 6% was measured against a
     dense city and does not transfer to open country.

     Urban sits at 0.6% — it is buildings, and buildings are cover. Rural is a
     valley: a 64x56 m lake, a river the full width of the map, ploughed fields
     and road corridors are all deliberately open, and no amount of drystone
     wall makes water into cover. Holding Hollow Ridge to Urban's figure would
     mean filling the lake in.

     14% is the measured figure after the field cover, riverbank walls, road
     verges and ridge outcrops added in v9.0 — down from 32% on the first pass,
     which WAS a real problem and was fixed rather than excused. The budget is a
     ratchet from here: it may fall, never rise. */
  /* v10.10: killhouse ADDED to the loop. Metro shipped 19.2% dead ground
     because this gate only ran on urban — handoff section 4.1. A new map that
     is not in this list is a new map nobody has measured.

     Its budget is 0.02, tighter than every other map, and that is deliberate:
     an indoor 58 x 34 m room with no exterior has nowhere for dead ground to
     legitimately hide. On a 200 m outdoor map a rooftop or a river accounts for
     a few percent honestly; here, dead ground means a corner of the floor that
     no cover overlooks, which is a design fault. */
  const DEAD_BUDGET = { urban: 0.06, rural: 0.15, metro: 0.06, killhouse: 0.02 };
  const budget = DEAD_BUDGET[map] !== undefined ? DEAD_BUDGET[map] : 0.06;
  const landCells = r.n * r.n - r.skipped;   // v9.0: match the figure printed above
  if (r.dead.length / landCells > budget) {
    console.log(`  FAIL ${map}: ${(r.dead.length / landCells * 100).toFixed(1)}% dead ground exceeds budget of ${(budget * 100).toFixed(0)}%`);
    fail++;
  }
  else console.log(`  PASS ${map}: dead ground within budget`);
}
process.exit(REPORT ? 0 : (fail ? 1 : 0));
