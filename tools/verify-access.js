/* ASCENT GATE (v4.9)
   Replays the real controller collision model (public/src/player/controller.js
   moveAxis + auto-step) against World.colliders and walks a standing capsule up
   every staircase in both maps. Proves the stairs are actually CLIMBABLE, which
   no previous gate checked — verify-map only proves loot rests on geometry, and
   the build gate only proves the scene constructs without crashing.

   Why this exists: v4.7 added "stepped stringer support walls" under each flight
   to kill a floating-tread look. They shipped WITH colliders, so every 0.31m
   tread sat buried inside a solid 1.3-1.5m wall. Auto-step is 0.42m, so no stair
   in either map could be climbed standing. Fixed in v4.9 by making the stringers
   decorative; this gate stops it happening again. */
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
  "public/src/environment/deco.js", "public/src/environment/rural.js",
  "public/src/environment/access.js"
].forEach(f => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));

const P = ctx.CFG.PLAYER, MV = ctx.CFG.MOVE;
const R = P.radius, HY = P.standH / 2, STEP = MV.step;

/* --- faithful port of controller.moveAxis (standing stance, no crouch) --- */
function climber(cols) {
  let pos = { x: 0, y: 0, z: 0 }, grounded = false;
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
        if (delta > 0) v[axis] = c[axis] - R - 0.001;
        else v[axis] = c[axis + 3] + R + 0.001;
      }
    }
    pos = { x: v[0], y: v[1], z: v[2] };
  }
  return {
    walk(sx, sy, sz, dx, dz, ticks) {
      pos = { x: sx, y: sy, z: sz }; grounded = false;
      let peak = sy;
      for (let i = 0; i < ticks; i++) {
        grounded = false;
        moveAxis(1, -0.30);              // gravity settle onto whatever is underfoot
        moveAxis(0, dx * 0.10);
        moveAxis(2, dz * 0.10);
        if (pos.y > peak) peak = pos.y;
      }
      return { y: pos.y - HY, peak: peak - HY, x: pos.x, z: pos.z };  // report FOOT height
    }
  };
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  PASS  " + msg); } else { fail++; console.log("  FAIL  " + msg); } }

function run(map, cases) {
  ctx.__m = map;
  vm.runInContext(`World.reset && World.isBuilt() && World.reset(); World.buildMap(__sc, __m);`,
    Object.assign(ctx, { __sc: new THREE.Scene() }));
  const cols = ctx.World._colliders();
  const C = climber(cols);
  console.log(`\n--- [${map}] stair ascent (${cols.length} colliders) ---`);
  for (const t of cases) {
    const r = C.walk(t.x, t.y + HY + 0.05, t.z, t.dx, t.dz, t.ticks || 220);
    ok(r.peak >= t.top - 0.12,
      `${t.name}: foot reached ${r.peak.toFixed(2)}m (need >= ${t.top.toFixed(2)}m)`);
  }
}

run("urban", [
  { name: "garage fire escape -> roof 4.30", x: -17.6, y: 0, z: 42.6, dx: 0, dz: -1, top: 4.30 },
  { name: "warehouse fire escape -> roof 9.15", x: -18.2, y: 0, z: -17.3, dx: -1, dz: 0, top: 9.15, ticks: 340 }
]);

run("rural", [
  { name: "watchtower NW summit -> deck 7.50", x: -54.9, y: 3.6, z: -58, dx: -1, dz: 0, top: 7.50 },
  { name: "watchtower village -> deck 3.90", x: 49.6, y: 0, z: 26, dx: -1, dz: 0, top: 3.90 },
  { name: "watchtower river -> deck 3.90", x: -28.6, y: 0, z: 30, dx: -1, dz: 0, top: 3.90 },
  { name: "NW terrace stair -> t1 1.20", x: -62, y: 0, z: -35.6, dx: 0, dz: -1, top: 1.20 },
  { name: "SE terrace stair -> t1 1.10", x: 64, y: 0, z: 45.6, dx: 0, dz: 1, top: 1.10 }
]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
