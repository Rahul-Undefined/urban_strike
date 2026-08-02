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
  urban: { floating: 9, rise: 0, narrow: 6, headroom: 5, arrival: 6 },
  rural: { floating: 0, rise: 0, narrow: 2, headroom: 1, arrival: 0 },
  metro: { floating: 0, rise: 0, narrow: 4, headroom: 3, arrival: 0 }
};

/* ARRIVAL replaced LANDING in v8.4 and the numbers are not comparable.

   The old check asked "is there something to stand on near the top", which the
   flight's own last tread satisfied — so it passed everywhere while Rahul was
   reporting staircases that reach a roof and stop short of it. The new check
   demands a real destination: a surface of 1 m2 or more that is NOT part of
   this flight, within a step of the top, or the foot of another flight.

   Setting the threshold honestly took two attempts. At a 4 m2 deck minimum it
   reported 23 urban failures; most of those flights arrive at a switchback
   landing of about 1.4 m2, so 17 of the 23 were the gate's fault, not the map's.
   Dropping the minimum to 1 m2 and excluding the flight's own footprint leaves
   6, and those 6 are real. */

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
  /* Real decks: top faces big enough to be a floor, roof or landing. A tread is
     never one of these, which is what makes the arrival test meaningful. */
  const decks = cols.filter(c => (c[3] - c[0]) * (c[5] - c[2]) >= 1.0)
    .map(c => ({ x0: c[0], x1: c[3], z0: c[2], z1: c[5], y: c[4] }));
  console.log(`\n--- [${map}] ${flights.length} flights ---`);
  const bad = { floating: [], rise: [], narrow: [], headroom: [], arrival: [] };

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

    /* ARRIVAL — does this flight actually GET you anywhere?

       The v8.3 version asked only "is there something to stand on near the
       top", which the flight's own last tread satisfied, so it passed
       everywhere while Rahul was reporting stairs that reach a roof and stop
       short of it. Two separate failures were hiding behind that:

         - the flight ends near a deck but not close enough to step across
           (his items 2 and 4: "gap between the stairs and the wall which
           doesn't let the player go to the roof")
         - the flight ends where the NEXT flight should begin, and doesn't
           (his item 6: the construction-site gap between first and second)

       So a flight must arrive at either a real deck — a surface of 4 m2 or
       more that is not part of this flight — or at the foot of another
       flight. Anything else is a staircase to nowhere. */
    let arrived = false, nearMiss = null;
    // this flight's own swept footprint — its treads must not count as arrival
    const fx0 = Math.min(f.sx, f.endX) - f.width / 2 - 0.05, fx1 = Math.max(f.sx, f.endX) + f.width / 2 + 0.05;
    const fz0 = Math.min(f.sz, f.endZ) - f.width / 2 - 0.05, fz1 = Math.max(f.sz, f.endZ) + f.width / 2 + 0.05;
    for (const d of decks) {
      const dcx = (d.x0 + d.x1) / 2, dcz = (d.z0 + d.z1) / 2;
      if (dcx > fx0 && dcx < fx1 && dcz > fz0 && dcz < fz1 &&
          d.y > f.baseY - 0.1 && d.y < f.topY + 0.1) continue;   // part of this flight
      const dx = Math.max(d.x0 - f.endX, 0, f.endX - d.x1);
      const dz = Math.max(d.z0 - f.endZ, 0, f.endZ - d.z1);
      const gap = Math.hypot(dx, dz), rise = d.y - f.topY;
      if (gap > 3.0 || rise < -1.2 || rise > 3.0) continue;
      if (gap <= PR + 0.6 && rise <= STEP + 0.02 && rise > -1.2) { arrived = true; break; }
      if (!nearMiss || gap < nearMiss.gap) nearMiss = { gap: gap, rise: rise, y: d.y };
    }
    if (!arrived) {
      for (const g of flights) {
        if (g === f) continue;
        const gap = Math.hypot(g.sx - f.endX, g.sz - f.endZ), rise = g.sy - f.topY;
        if (gap <= 2.0 && Math.abs(rise) <= STEP + 0.02) { arrived = true; break; }
        if (gap <= 3.0 && Math.abs(rise) <= 3.0 && (!nearMiss || gap < nearMiss.gap))
          nearMiss = { gap: gap, rise: rise, y: g.sy };
      }
    }
    if (!arrived) { f._miss = nearMiss; bad.arrival.push(f); }
  }

  const B = BUDGET[map];
  for (const k of ["floating", "rise", "narrow", "headroom", "arrival"]) {
    ok(bad[k].length <= B[k], `${map}: ${bad[k].length} flights fail ${k} (budget ${B[k]})`);
    if (VERBOSE || bad[k].length > B[k]) {
      bad[k].slice(0, 8).forEach(f => console.log(
        `        ${k}  start (${f.sx.toFixed(1)}, ${f.sy.toFixed(2)}, ${f.sz.toFixed(1)}) ` +
        `-> top (${f.endX.toFixed(1)}, ${f.topY.toFixed(2)}, ${f.endZ.toFixed(1)})  ${f.steps} steps` +
        (f._miss ? `  nearest deck ${f._miss.gap.toFixed(2)}m away, ${f._miss.rise >= 0 ? "+" : ""}${f._miss.rise.toFixed(2)}m up` : "")));
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
