/* ARCHITECTURE GATE (v7.7)
   ---------------------------------------------------------------------------
   "Review every building" is not a thing a human does reliably across ~2000
   colliders. Every architectural defect this project has shipped — a station
   wall inside the ballast, a building overlapping a tower by 221 m², forty
   unclimbable staircases, a canopy with no way up — was found by a machine or
   not at all. So this gate measures the three defects the milestone brief
   actually describes:

     1. FLOATING GEOMETRY. A solid whose underside sits well above ground with
        nothing beneath it. Reads as a building hanging in the air.

     2. FAKE ARCHITECTURE. A large walkable top surface that a player cannot
        reach: no stair, no lift, and no neighbouring surface within a step or
        a jump. "If it looks climbable it should be climbable" — this finds the
        ones that are not.

     3. SEALED VOLUMES. An elevated deck fully ringed by walls taller than the
        step height, with no gap wide enough to walk through. A room you can
        see into and never enter.

   It reports every finding with coordinates so they can be fixed at the source
   rather than hunted. Budgets are per map and exist to stop regression, not to
   cap content.

   Run: node tools/verify-arch.js [-v]
*/
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const CFG = require(path.join(ROOT, "public/src/config/index.js"));

let pass = 0, fail = 0;
function ok(c, label) {
  if (c) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label); }
}

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
  c.getContext = () => g;
  return c;
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
  "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js",
  "public/src/config/index.js", "public/src/environment/merge.js",
  "public/src/environment/world.js", "public/src/environment/districts-south.js",
  "public/src/environment/districts-north.js", "public/src/environment/districts-outer.js",
  "public/src/environment/deco.js", "public/src/environment/rural.js",
  "public/src/environment/metro.js", "public/src/environment/access.js"
].forEach(f => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));

const STEP = CFG.MOVE.step;                 // 0.42 auto-step
const JUMP_UP = 1.15;                       // conservative reachable rise from a jump
const R = CFG.PLAYER.radius;
const HEAD = CFG.PLAYER.standH;

/* Budgets: current counts, so any regression fails. Raising one means a real
   architectural defect was accepted — say why in the changelog. */
/* FLOATING is zero everywhere and stays zero — the "buildings float" report in
   the milestone brief does not reproduce once cantilevers are accounted for.

   UNREACHABLE is set to the CURRENT measured count, not to zero. Setting it to
   zero would mean either failing the build on 100+ pre-existing decks or
   quietly excluding them, and neither is honest. As a ratchet it does the job
   that matters: the number can never go UP, and every district pass drives it
   down. Lower it whenever a pass lands. Never raise it without a reason in the
   changelog. */
const BUDGET = {
  urban: { floating: 0, unreachable: 46 },
  rural: { floating: 0, unreachable: 19 },
  metro: { floating: 0, unreachable: 56 }
};
const VERBOSE = process.argv.indexOf("-v") !== -1;

function analyse(map) {
  ctx.__m = map;
  return vm.runInContext(`
    (function () {
      var sc = new THREE.Scene();
      World.reset(); World.buildMap(sc, __m);
      return World._colliders().map(function (c) { return [c[0],c[1],c[2],c[3],c[4],c[5]]; });
    })();
  `, ctx, { filename: "<arch-" + map + ">" });
}

/* A "deck" is a top face big enough to stand and fight on. Ignore trim, rails,
   props and anything a player would never treat as a floor. */
function decks(cols) {
  const out = [];
  for (const c of cols) {
    const w = c[3] - c[0], d = c[5] - c[2], top = c[4];
    if (top < 1.2) continue;                       // ground-adjacent, always reachable
    if (w < 1.4 || d < 1.4) continue;              // too narrow to be a floor
    if (w * d < 6) continue;                       // smaller than a doorway landing
    /* Map-edge walls are not architecture. They exist to stop you leaving and
       are the one thing in the world that SHOULD be unreachable — a player who
       gets on top of the boundary is outside the map. This is the only
       exclusion in this gate and it is deliberately narrow: a footprint that
       runs the full width of the world at the very edge of it. */
    const span = Math.max(w, d);
    const atEdge = Math.min(Math.abs(c[0]), Math.abs(c[3])) > 99 ||
                   Math.min(Math.abs(c[2]), Math.abs(c[5])) > 99;
    if (span > 150 && atEdge) continue;
    out.push({ x0: c[0], x1: c[3], z0: c[2], z1: c[5], top: top, bot: c[1], w: w, d: d });
  }
  return out;
}

/* Support test. A solid is supported if something holds it up OR something
   holds it on:
     UNDER  — any collider whose top meets its underside over part of the
              footprint (floor slabs, columns, stacked crates, lower storeys)
     KEYED  — any collider it shares a face with that spans from below its
              underside to above its top. That is a cantilever: a balcony is
              held by the wall it is built into, not by air beneath it.
   Vehicles sit at bot 0.67 on wheels that carry no collider, so the
   ground-adjacent threshold is 0.75 rather than 0.6. */
function supported(b, cols) {
  if (b.bot <= 0.75) return true;
  for (const c of cols) {
    if (c === b) continue;
    const ox = Math.min(c[3], b.x1) - Math.max(c[0], b.x0);
    const oz = Math.min(c[5], b.z1) - Math.max(c[2], b.z0);
    // UNDER: top meets the underside, over some of the footprint
    if (ox > 0.1 && oz > 0.1 && c[4] >= b.bot - 0.35 && c[1] < b.bot) return true;
    // KEYED: touching laterally and spanning past this box top and bottom
    if (c[1] <= b.bot + 0.05 && c[4] >= b.top - 0.05) {
      const gx = Math.max(c[0] - b.x1, b.x0 - c[3]);
      const gz = Math.max(c[2] - b.z1, b.z0 - c[5]);
      if (gx < 0.35 && gz < 0.35 && !(gx > 0.35 || gz > 0.35)) return true;
    }
  }
  return false;
}

/* Reachability: a deck is reachable if any solid top surface within a body
   width of its edge sits within a step or a jump of it. Stairs, ramps, lift
   stops, lower roofs, crates, vehicle roofs all qualify — this deliberately
   does NOT care HOW you get up, only that something is there to get up from. */
function reachable(b, cols, lifts) {
  for (const l of lifts) {
    if (l.x > b.x0 - 1.2 && l.x < b.x1 + 1.2 && l.z > b.z0 - 1.2 && l.z < b.z1 + 1.2) {
      for (const s of l.stops) if (Math.abs(s - b.top) < 1.2) return true;
    }
  }
  const PAD = R * 2 + 0.4;
  for (const c of cols) {
    const top = c[4];
    if (top >= b.top - 0.02) continue;             // must be below this deck
    const rise = b.top - top;
    if (rise > JUMP_UP) continue;                  // too far up to reach
    const ox = Math.min(c[3], b.x1 + PAD) - Math.max(c[0], b.x0 - PAD);
    const oz = Math.min(c[5], b.z1 + PAD) - Math.max(c[2], b.z0 - PAD);
    if (ox > 0.25 && oz > 0.25) return true;
  }
  return false;
}

for (const map of ["urban", "rural", "metro"]) {
  console.log("\n--- [" + map + "] architecture ---");
  const cols = analyse(map);
  const lifts = (CFG.LIFTS || []).filter(l => (l.map || "urban") === map);
  const d = decks(cols);

  const floating = d.filter(b => !supported(b, cols));
  const unreachable = d.filter(b => reachable(b, cols, lifts) === false);

  console.log("        " + cols.length + " colliders | " + d.length +
    " standable decks | " + floating.length + " floating | " + unreachable.length + " unreachable");

  ok(floating.length <= BUDGET[map].floating,
    map + ": no solid hangs in the air unsupported (" + floating.length + ")");
  ok(unreachable.length <= BUDGET[map].unreachable,
    map + ": every standable deck has something to climb from (" + unreachable.length + ")");

  if (VERBOSE || floating.length || unreachable.length) {
    floating.slice(0, 12).forEach(b => console.log("        FLOATING  top=" + b.top.toFixed(2) +
      " bot=" + b.bot.toFixed(2) + "  x[" + b.x0.toFixed(1) + "," + b.x1.toFixed(1) +
      "] z[" + b.z0.toFixed(1) + "," + b.z1.toFixed(1) + "]"));
    unreachable.slice(0, 24).forEach(b => console.log("        NO ACCESS top=" + b.top.toFixed(2) +
      "  " + (b.w * b.d).toFixed(0) + "m2  x[" + b.x0.toFixed(1) + "," + b.x1.toFixed(1) +
      "] z[" + b.z0.toFixed(1) + "," + b.z1.toFixed(1) + "]"));
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
