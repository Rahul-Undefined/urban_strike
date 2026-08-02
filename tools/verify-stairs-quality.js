/* verify-stairs-quality — does a staircase look and feel designed?

   verify-access already asks the only question it was built to ask: can a
   capsule get from the bottom to the top. It answers 49/51, and Rahul's
   screenshots still show staircases that are wrong. The gate was never lying —
   it was measuring the wrong property.

   This one measures the rest of it, per flight, from the registry world.js
   fills in at construction time (World._stairs()):

     SUPPORT    is there anything under the flight's base, or does it start in
                mid-air? This is the "floating stairs" defect from images
                4, 10 and 13.
     RISE       a step taller than the auto-step limit cannot be walked up.
     WIDTH      a flight under 1.0 m is a ladder, not a staircase.
     HEADROOM   clearance above the treads along the whole run.
     LANDING    is there somewhere to stand at the top, or does the flight end
                at a wall or a ledge?

   Budgets are RATCHETS set to what the map measured on the day the gate was
   written. They may fall, never rise. A number going up means a district pass
   made a staircase worse.

   Run: node tools/verify-stairs-quality.js [-v] */

let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const CFG = require(path.join(ROOT, "public/src/config/index.js"));

let pass = 0, fail = 0;
const VERBOSE = process.argv.indexOf("-v") !== -1;
function ok(c, label) {
  if (c) { pass++; if (VERBOSE) console.log("  PASS  " + label); }
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
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval, AudioSys: { step: function () {} }
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
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

const STEP = CFG.MOVE.step;              // 0.42 — the auto-step limit
const MIN_WIDTH = 1.0;
const HEAD = 1.9;                        // a standing player plus a little
const PR = CFG.PLAYER.radius;

/* Ratchets, measured 2026-08-02 against v8.2. Lower is better; never raise one
   to go green — a number that will not come down is a district that needs work,
   and that is the point of recording it.

   urban.floating = 9 is REAL, not detector noise. It is one multi-storey
   stairwell around x 24.6/26.8, z -34.1/-36.1 where the flights stack directly
   on top of one another with no landing slab between them, plus one flight at
   (13.7, 3.50, -62.2). Each flight therefore begins on nothing but the last
   tread of the flight below. The stringers added in v8.2 fill the wedge under
   every flight from its own start level upward, so the staircase no longer
   reads as hanging in mid-air — but the stairwell still has no landings, and
   that is district geometry, not something this generator can invent safely.
   Auto-generating a landing here would mean querying colliders during the
   build, which makes the result depend on district build ORDER — the exact
   class of non-determinism the v7.8 PRNG fix existed to remove. */
const BUDGET = {
  urban: { floating: 9, rise: 0, narrow: 6, headroom: 5, landing: 5 },
  rural: { floating: 0, rise: 0, narrow: 2, headroom: 1, landing: 2 },
  metro: { floating: 0, rise: 0, narrow: 4, headroom: 3, landing: 6 }
};

function build(map) {
  ctx.__m = map;
  return vm.runInContext(`(function(){
    var sc = new THREE.Scene(); World.reset(); World.buildMap(sc, __m);
    return { c: World._colliders().map(function(x){return [x[0],x[1],x[2],x[3],x[4],x[5]];}),
             s: World._stairs().map(function(x){return JSON.parse(JSON.stringify(x));}) };
  })();`, ctx);
}

// Highest collider top strictly below `y` covering (x,z). null if nothing under.
function topUnder(cols, x, z, y, skip) {
  let best = null;
  for (const c of cols) {
    if (skip && skip(c)) continue;
    if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
    if (c[4] > y + 0.02) continue;
    if (best === null || c[4] > best) best = c[4];
  }
  return best;
}
// Lowest collider bottom strictly above `y` covering (x,z).
function bottomAbove(cols, x, z, y, skip) {
  let best = null;
  for (const c of cols) {
    if (skip && skip(c)) continue;
    if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
    if (c[1] < y + 0.02) continue;
    if (best === null || c[1] < best) best = c[1];
  }
  return best;
}
function standable(cols, x, z, y) {
  // a surface within +/-0.45 of y, with room to stand on it
  for (const c of cols) {
    if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
    if (Math.abs(c[4] - y) > 0.45) continue;
    if (bottomAbove(cols, x, z, c[4] + 0.05) === null) return true;
    if (bottomAbove(cols, x, z, c[4] + 0.05) - c[4] >= HEAD) return true;
  }
  return false;
}

for (const map of ["urban", "rural", "metro"]) {
  const { c: cols, s: flights } = build(map);
  console.log(`\n--- [${map}] ${flights.length} flights ---`);
  const bad = { floating: [], rise: [], narrow: [], headroom: [], landing: [] };

  for (const f of flights) {
    const midX = f.sx + f.dirX * f.steps * f.stepD * 0.5;
    const midZ = f.sz + f.dirZ * f.steps * f.stepD * 0.5;

    /* SUPPORT — sample at the flight's FIRST tread, not its midpoint.
       A switchback stairwell cantilevers each flight out over the void of the
       one below; the midpoint is legitimately over open air, and the stringers
       now fill the wedge from the flight's own start level upward. What
       actually matters is whether that start level is standing on anything.
       Sampling the midpoint flagged ten perfectly sound stairwell flights. */
    let supported = false;
    for (let t = 0; t <= 4 && !supported; t++) {
      // sample across the first tread's footprint, not one corner of it: a
      // switchback flight begins within centimetres of the landing below and a
      // single point can miss it through a 4 cm seam.
      const px = f.sx + f.dirX * (t / 4) * f.stepD + (f.dirX ? 0 : (t - 2) * f.width / 5);
      const pz = f.sz + f.dirZ * (t / 4) * f.stepD + (f.dirZ ? 0 : (t - 2) * f.width / 5);
      const u = topUnder(cols, px, pz, f.baseY + 0.05,
        c => c[4] > f.baseY + 0.05 && c[1] < f.topY);
      if (u !== null && f.baseY - u <= 1.2) supported = true;
    }
    if (!supported) bad.floating.push(f);

    if (f.stepH > STEP + 0.001) bad.rise.push(f);
    if (f.width < MIN_WIDTH) bad.narrow.push(f);

    // HEADROOM — sample along the run, above each tread.
    let low = false;
    for (let i = 0; i < f.steps; i++) {
      const x = f.sx + f.dirX * (i + 0.5) * f.stepD;
      const z = f.sz + f.dirZ * (i + 0.5) * f.stepD;
      const treadTop = f.sy + (i + 1) * f.stepH;
      const ceil = bottomAbove(cols, x, z, treadTop + 0.05, c => c[1] < treadTop + 0.05);
      if (ceil !== null && ceil - treadTop < HEAD) { low = true; break; }
    }
    if (low) bad.headroom.push(f);

    /* LANDING — somewhere to stand at the top. Checked as a ring around the
       top tread rather than straight ahead: a switchback turns 90 degrees at
       the landing, so "directly forward" is a wall by design. */
    let land = false;
    for (let a = 0; a < 8 && !land; a++) {
      const th = (a / 8) * Math.PI * 2;
      const lx = f.endX + Math.cos(th) * (PR + 0.5);
      const lz = f.endZ + Math.sin(th) * (PR + 0.5);
      if (standable(cols, lx, lz, f.topY)) land = true;
    }
    if (!land) bad.landing.push(f);
  }

  const B = BUDGET[map];
  for (const k of ["floating", "rise", "narrow", "headroom", "landing"]) {
    ok(bad[k].length <= B[k], `${map}: ${bad[k].length} flights fail ${k} (budget ${B[k]})`);
    if (VERBOSE || bad[k].length > B[k]) {
      bad[k].slice(0, 6).forEach(f => console.log(
        `        ${k}  start (${f.sx.toFixed(1)}, ${f.sy.toFixed(2)}, ${f.sz.toFixed(1)}) ` +
        `-> top ${f.topY.toFixed(2)}  ${f.steps} steps  rise ${f.stepH.toFixed(3)} run ${f.stepD.toFixed(2)} w ${f.width}`));
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
