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
  "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js","public/src/config/maps-killhouse.config.js","public/src/config/maps-sunsetrow.config.js","public/src/config/maps-small.config.js",
  "public/src/config/districts.config.js", "public/src/config/index.js", "public/src/environment/merge.js",
  "public/src/environment/world.js", "public/src/environment/districts-south.js",
  "public/src/environment/districts-north.js", "public/src/environment/districts-outer.js",
  "public/src/environment/deco.js", "public/src/environment/rural.js", "public/src/environment/metro.js",
  /* v10.12: killhouse and sunsetrow were MISSING from this list while both were
     in the map loop above. buildMap fell through to the urban path for each, so
     this gate measured urban twice and printed the result under their names —
     the 0.2% dead-ground figure reported for killhouse in v10.10 was urban's.
     Section 4.1 again, in its worst form: not a gate that never looked, a gate
     that looked at the wrong thing and said so confidently. */
  "public/src/environment/killhouse.js","public/src/environment/sunsetrow.js","public/src/environment/smallmaps.js",
  "public/src/environment/access.js"
].forEach(f => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));

/* v10.12: BOUND is now PER MAP, and CELL scales with it.

   It was a flat 100 for every map, which was fine while every map was 200 m
   across. killhouse is 58 x 34 and sunsetrow 64 x 40, so a 100 m grid spent
   about 97% of its samples on empty space outside the building and reported
   88% dead ground with a worst gap of 108 m — on a map where nothing is more
   than 58 m from anything. Nonsense numbers, confidently printed.

   CELL shrinks with the map so a small map still gets a meaningful sample
   count instead of a handful of coarse cells. MAXD — the distance at which
   ground counts as uncovered — shrinks too: 14 m of open ground is a normal
   street on urban and half the width of killhouse. */
const CELL_BIG = 4, MAXD_BIG = 14;
function gridFor(map) {
  const B = (require('../public/src/config/index.js').MAPS[map] || {}).bound || 100;
  if (B > 60) return { BOUND: B, CELL: CELL_BIG, MAXD: MAXD_BIG };
  return { BOUND: B, CELL: 1.5, MAXD: 7 };
}
const REPORT = process.argv.includes("--report");

/* True when some collider top sits at a plausible standing height under (x,z).
   Ground slabs sit a little below 0 and floors a little above it; anything in
   this band is somewhere a player can be. */
function walkableAt(cols, x, z) {
  for (const c of cols) {
    if (x < c[0] || x > c[3] || z < c[2] || z > c[5]) continue;
    if (c[4] >= -0.6 && c[4] <= 1.2) return true;
  }
  return false;
}

function analyse(map) {
  const { BOUND, CELL, MAXD } = gridFor(map);
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
      /* v10.12: A CELL WITH NO FLOOR UNDER IT IS NOT DEAD GROUND, IT IS NOT
         GROUND. The grid is square and derived from `bound`, but killhouse is
         58 x 34 inside a bound of 32 and sunsetrow 64 x 40 inside 34 — so
         roughly half of every small map's grid fell outside the building, had
         no floor, was counted as land, and was counted as uncovered. That
         produced 32% dead ground on a map whose real figure is a fraction of
         it.

         This never mattered while every map filled its bound. It matters the
         moment a map does not, and the honest test is the one already implied
         by the word "ground": is there a walkable surface here at all. */
      if (!walkableAt(cols, x, z)) { row.push(-1); skipped.n++; continue; }
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
for (const map of ["urban", "rural", "metro", "killhouse", "sunsetrow", "freightyard", "bazaar", "substation"]) {
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
  /* v10.12: RURAL IS NOW RED AT 28.6% AND THE BUDGET IS NOT MOVING.

   BOUND was a flat 100 for every map. Rural's bound is 150, so this gate has
   only ever sampled the middle 44% of it — the outer ring, which is the most
   open ground on the map, was never measured. Fixing BOUND to be per-map
   doubled the honest figure from 14.7% to 28.6%.

   The map did not get worse; the instrument got better. Raising the budget to
   28.6% would make the number go green and make the gate useless, and this
   project's own rule is that ratchets fall and never rise. So rural stays red
   as a DOCUMENTED red alongside verify-access, verify-arch and verify-climb,
   and the fix is cover in rural's outer ring, not a bigger number here. */
const DEAD_BUDGET = { urban: 0.06, rural: 0.15, metro: 0.06, killhouse: 0.02,
    /* v10.12: set from the honest measurement, not guessed ahead of it.
       sunsetrow reads 0.9% and killhouse 0.0%, so 0.02 is a real ratchet on
       both rather than slack. */
    sunsetrow: 0.02 };
  const budget = DEAD_BUDGET[map] !== undefined ? DEAD_BUDGET[map] : 0.06;
  const landCells = r.n * r.n - r.skipped;   // v9.0: match the figure printed above
  if (r.dead.length / landCells > budget) {
    console.log(`  FAIL ${map}: ${(r.dead.length / landCells * 100).toFixed(1)}% dead ground exceeds budget of ${(budget * 100).toFixed(0)}%`);
    fail++;
  }
  else console.log(`  PASS ${map}: dead ground within budget`);
}
process.exit(REPORT ? 0 : (fail ? 1 : 0));
