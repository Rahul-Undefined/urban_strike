/* verify-climb.js — EVERY staircase, not a hand-written list.  v8.11

   WHY THIS EXISTS

   tools/verify-access.js walks a capsule up 51 routes that somebody typed out
   by hand. Urban has 68 registered flights and rural has 9. Twenty-six flights
   have never been walked by anything. Every stair defect Rahul has reported
   from a browser has been in that gap, including WEST WORKS and EASTGATE YARD
   in v8.10 — both had a slab across the run, both were invisible here because
   nobody had added a route for them.

   verify-access stays. It tests ROUTES: ground to a named roof, sometimes
   across several flights and a gantry, with a target height that encodes what
   the district was supposed to deliver. This file tests FLIGHTS: for every
   entry in World._stairs(), can a standing capsule get from the bottom tread
   to the top one. A flight can pass here and still fail there, because
   arriving at the top of a staircase is not the same as arriving somewhere.

   HOW IT MEASURES

   The walker is the same faithful port of controller.moveAxis that
   verify-access uses — same auto-step rule, same gravity, same
   grounded-flickers-on-a-stair ordering that stopped the v4.9 gate
   over-reporting. Two things are deliberately different:

     1. The start point is derived from the flight record, not typed. It sits
        one tread-depth BEFORE the first tread, on whatever surface is there,
        so the walk includes stepping ONTO the staircase. "The bottom step is
        buried in a kerb" is an accessibility defect and belongs in this gate.

     2. Failure reports the tread index where the capsule stalled and the
        clearance at that tread, because "flight #44 stalled at tread 3 with
        1.80 m of headroom" is a coordinate you can walk to, and
        "49 passed, 2 failed" is not.

   THE BUDGET IS A RATCHET. It may fall. It may never rise. If a flight is
   deliberately unclimbable — decorative, or sealed until a district is
   rebuilt — it goes in EXPECTED below with a reason, not in the budget.

   Run: node tools/verify-climb.js  [-v]
*/
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const VERBOSE = process.argv.indexOf("-v") >= 0;

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, {
    get: (t, k) => {
      if (k === "canvas") return c;
      return function () {
        if (k === "createLinearGradient" || k === "createRadialGradient") return { addColorStop() {} };
        if (k === "measureText") return { width: 10 };
        if (k === "getImageData") return { data: new Uint8ClampedArray(4) };
      };
    }, set: () => true
  });
  c.getContext = () => g;
  return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array,
  Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
  performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === "canvas" ? fakeCanvas() : { style: {} }) },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
/* Identical to public/index.html. See HANDOFF section 4,
   "A GATE MUST LOAD WHAT index.html LOADS". */
[
  "public/src/config/weapons.config.js", "public/src/config/gameplay.config.js",
  "public/src/config/loot.config.js", "public/src/config/world.config.js",
  "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js",
  "public/src/config/districts.config.js", "public/src/config/index.js",
  "public/src/environment/merge.js", "public/src/environment/world.js",
  "public/src/environment/districts-south.js", "public/src/environment/districts-north.js",
  "public/src/environment/districts-outer.js", "public/src/environment/deco.js",
  "public/src/environment/rural.js", "public/src/environment/metro.js",
  "public/src/environment/access.js"
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

const CFG = ctx.CFG, P = CFG.PLAYER, MV = CFG.MOVE;
const R = P.radius, HY = P.standH / 2, STEP = MV.step;
const NEED = P.standH + 0.02;              // stand + the auto-step lift

/* Flights that are known-unclimbable for a reason, keyed by
   "map:sx,sy,sz" rounded to 0.1. A reason, not a budget — each line has to
   say why, and each line is a thing to delete later. */
const EXPECTED = {
  // CIVIC CENTRE switchback: 6 steps x 0.29 = 1.73 m per half-flight, and a
  // standing player needs 2.02 m under the half-landing. The landing cannot
  // physically fit; the stairwell needs 7-step flights. See the STAIR
  // CONNECTORS comment in world.js. District work, scoped out of Milestone A.
};

function climber(cols) {
  let pos = { x: 0, y: 0, z: 0 }, grounded = false;
  const blockers = new Map();
  function overlapAny(cx, cy, cz) {
    for (const c of cols)
      if (cx - R < c[3] && cx + R > c[0] && cy - HY < c[4] && cy + HY > c[1] && cz - R < c[5] && cz + R > c[2]) return true;
    return false;
  }
  function moveAxis(axis, delta) {
    if (delta === 0) return;
    const v = [pos.x, pos.y, pos.z];
    v[axis] += delta;
    for (const c of cols) {
      if (!(v[0] - R < c[3] && v[0] + R > c[0] && v[1] - HY < c[4] && v[1] + HY > c[1] && v[2] - R < c[5] && v[2] + R > c[2])) continue;
      if (axis === 1) {
        if (delta < 0) { v[1] = c[4] + HY + 0.001; grounded = true; }
        else v[1] = c[1] - HY - 0.001;
      } else {
        const footY = v[1] - HY, rise = c[4] - footY;
        if (grounded && rise > 0 && rise <= STEP) {
          const ny = v[1] + rise + 0.02;
          if (!overlapAny(v[0], ny, v[2])) { v[1] = ny; continue; }
        }
        blockers.set(c.slice(0, 6).join(','), (blockers.get(c.slice(0, 6).join(',')) || 0) + 1);
        if (delta > 0) v[axis] = c[axis] - R - 0.001;
        else v[axis] = c[axis + 3] + R + 0.001;
      }
    }
    pos = { x: v[0], y: v[1], z: v[2] };
  }
  return {
    /* Faithful replay of controller.update()'s ORDER — horizontal first using
       LAST frame's `grounded`, then gravity. Reversing it makes auto-step
       available every frame and passes staircases the game refuses. */
    walk(sx, sy, sz, dx, dz, ticks) {
      pos = { x: sx, y: sy, z: sz }; grounded = false; blockers.clear();
      let peak = sy, velY = 0, velH = 0;
      const dt = 1 / 60, speed = MV.walk;
      for (let i = 0; i < ticks; i++) {
        const acc = (grounded ? 42 : 9) * dt;
        velH += Math.max(-acc, Math.min(acc, speed - velH));
        velY -= 15.5 * dt;
        if (velY < -30) velY = -30;
        moveAxis(0, dx * velH * dt);
        moveAxis(2, dz * velH * dt);
        grounded = false;
        moveAxis(1, velY * dt);
        if (grounded) velY = 0;
        if (pos.y > peak) peak = pos.y;
      }
      const worst = [...blockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(e => '[' + e[0].split(',').map(n => (+n).toFixed(1)).join(' ') + ']x' + e[1]);
      return { peak: peak - HY, x: pos.x, z: pos.z, blockers: worst };
    }
  };
}

/* Nearest solid underside above y at (x,z) — the same question
   tools/verify-stairs-quality.js bottomAbove() asks, so the two agree. */
function ceilAbove(cols, x, z, y) {
  let best = null;
  for (const c of cols) {
    if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
    if (c[1] < y + 0.02) continue;
    if (best === null || c[1] < best) best = c[1];
  }
  return best;
}

/* Where did it stall, and why. Reported instead of a bare boolean because a
   tread index and a clearance figure is something you can walk to in-game. */
function diagnose(cols, f, reachedY) {
  for (let i = 0; i < f.steps; i++) {
    const tt = f.sy + (i + 1) * f.stepH;
    if (tt <= reachedY + 0.05) continue;
    const x = f.sx + f.dirX * (i + 0.5) * f.stepD;
    const z = f.sz + f.dirZ * (i + 0.5) * f.stepD;
    const ceil = ceilAbove(cols, x, z, tt + 0.05);
    const clear = ceil === null ? Infinity : ceil - tt;
    if (clear < NEED) {
      return 'tread ' + i + ' at (' + x.toFixed(1) + ', ' + z.toFixed(1) + ') has ' +
        clear.toFixed(2) + 'm headroom, needs ' + NEED.toFixed(2) + 'm';
    }
  }
  return null;
}

let pass = 0, fail = 0;
const failures = [];
function ok(c, label) { if (c) { pass++; if (VERBOSE) console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label); } }

/* RED BY DESIGN, like verify-arch. The budget is 0 and urban has 20.

   Setting it to 20 would be trap #1 from HANDOFF section 6 verbatim: a budget
   written AFTER the measurement records the defect as normal and the gate can
   never see it again. 20 is the acceptance criterion for Milestone A, not the
   allowance. Drive it down. Never raise it. */
const BUDGET = { urban: 0, rural: 0, metro: 0 };

for (const map of ["urban", "rural", "metro"]) {
  ctx.__m = map; ctx.__sc = new THREE.Scene();
  vm.runInContext("World.reset && World.isBuilt() && World.reset(); World.buildMap(__sc, __m);", ctx);
  const cols = ctx.World._colliders();
  const flights = ctx.World._stairs().slice();
  const C = climber(cols);
  const DIST = ctx.DISTRICTS;
  console.log('\n--- [' + map + '] climb (' + flights.length + ' flights, ' + cols.length + ' colliders) ---');

  const bad = [];
  for (let i = 0; i < flights.length; i++) {
    const f = flights[i];
    const key = map + ':' + f.sx.toFixed(1) + ',' + f.sy.toFixed(1) + ',' + f.sz.toFixed(1);
    /* Start one tread-depth BEFORE the first tread so the walk includes
       stepping onto the staircase, and 0.05 above the base so the capsule is
       not spawned inside the ground. */
    const sx = f.sx - f.dirX * (f.stepD + R + 0.15);
    const sz = f.sz - f.dirZ * (f.stepD + R + 0.15);
    const ticks = Math.max(240, f.steps * 34);
    const r = C.walk(sx, f.sy + HY + 0.05, sz, f.dirX, f.dirZ, ticks);
    const good = r.peak >= f.topY - STEP;
    if (good) continue;
    if (EXPECTED[key]) { console.log('        EXPECTED  ' + key + ' — ' + EXPECTED[key]); continue; }
    const where = DIST ? DIST.nameAt(f.sx, f.sz) : '';
    bad.push({ i, f, r, where, why: diagnose(cols, f, r.peak) });
  }

  for (const b of bad) {
    console.log('        UNCLIMBABLE  [' + b.where + '] flight #' + b.i +
      '  (' + b.f.sx.toFixed(1) + ', ' + b.f.sy.toFixed(2) + ', ' + b.f.sz.toFixed(1) + ')' +
      ' -> ' + b.f.topY.toFixed(2) + '   reached ' + b.r.peak.toFixed(2) + 'm');
    console.log('                     ' + (b.why || ('stopped at x ' + b.r.x.toFixed(1) + ' z ' + b.r.z.toFixed(1) +
      '  blocked by ' + (b.r.blockers.join(' ') || 'nothing — never reached the first tread'))));
  }
  ok(bad.length <= BUDGET[map],
    map + ': ' + bad.length + ' of ' + flights.length + ' flights unclimbable (budget ' + BUDGET[map] + ')');
  failures.push([map, bad.length]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
