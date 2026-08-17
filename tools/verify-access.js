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
  /* v8.9: maps-rural + maps-metro were MISSING here. index.html loads both
     (lines 286-287); this gate did not. rural therefore built with
     CFG.MAPS_RURAL undefined and produced 510 colliders where the browser
     produces 525 -- 15 objects short, on the gate whose entire job is to
     reproduce the browser build. Keep this list identical to index.html. */
  "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js",
  "public/src/config/districts.config.js", "public/src/config/index.js", "public/src/environment/merge.js",
  "public/src/environment/world.js", "public/src/environment/districts-south.js",
  "public/src/environment/districts-north.js", "public/src/environment/districts-outer.js",
  "public/src/environment/deco.js", "public/src/environment/rural.js", "public/src/environment/metro.js",
  "public/src/environment/access.js"
].forEach(f => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));

const P = ctx.CFG.PLAYER, MV = ctx.CFG.MOVE;
const R = P.radius, HY = P.standH / 2, STEP = MV.step;

/* --- faithful port of controller.moveAxis (standing stance, no crouch) --- */
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
        blockers.set(c.join(','), (blockers.get(c.join(',')) || 0) + 1);
        if (delta > 0) v[axis] = c[axis] - R - 0.001;
        else v[axis] = c[axis + 3] + R + 0.001;
      }
    }
    pos = { x: v[0], y: v[1], z: v[2] };
  }
  return {
    /* Faithful replay of controller.update()'s ORDER, which matters enormously:
         moveAxis(0/2, horizontal)   <- uses LAST frame's `grounded`
         grounded = false
         moveAxis(1, vel.y * dt)     <- sets `grounded` for the NEXT frame
       The first version of this gate ran gravity FIRST, so `grounded` was always
       true when moving horizontally and auto-step always fired. The real player
       is airborne for a frame or more after each step-up (auto-step lifts them
       rise+0.02 clear, and the next vertical move only falls gravity*dt), so
       auto-step is NOT available every frame. That made this gate pass six
       staircases the real game cannot climb. */
    /* v10 — OPTIONAL WAYPOINTS, so a SWITCHBACK can be tested.

       This walker took one fixed heading and held it for a tick count, which
       is right for a straight flight and cannot express a stair that turns. It
       reported the ship bridge unreachable the moment that building got the
       switchback it needs — the gate was pinning the IMPLEMENTATION (a
       straight flight) rather than the INVARIANT (a player can get from the
       deck to the roof). HANDOFF §4.2 says which way to fix that: change the
       gate to test the rule.

       The first attempt expressed the route as headings with tick counts and
       the walker sailed 20 m past the building, because a tick count is a
       DURATION and what the route actually needs is a DESTINATION. Tuning the
       ticks would have worked and would have gone stale the first time a
       tread moved — failure mode §4.4, numbers typed instead of measured.

       So a route is a list of [x, z] waypoints. The walker steers at each in
       turn and advances when it gets within STEP_TO metres, which is what a
       player climbing a switchback does and what a bot's climb plan already
       does (see planClimb in server/lib/bots.js). Capsule physics are
       untouched; only the steering changed. Cases with a plain dx/dz still run
       through the original single-heading path, byte for byte. */
    walkRoute(sx, sy, sz, route, ticks) {
      pos = { x: sx, y: sy, z: sz }; grounded = false; blockers.clear();
      let peak = sy, velY = 0, velH = 0, wp = 0;
      const dt = 1 / 60, speed = 4.4, STEP_TO = 0.75;
      for (let i = 0; i < ticks; i++) {
        let dx = 0, dz = 0;
        if (wp < route.length) {
          const tx = route[wp][0] - pos.x, tz = route[wp][1] - pos.z;
          const d = Math.hypot(tx, tz);
          if (d < STEP_TO) { wp++; }
          else { dx = tx / d; dz = tz / d; }
        }
        const acc = (grounded ? 42 : 9) * dt;
        velH += Math.max(-acc, Math.min(acc, speed - velH));
        velY -= 15.5 * dt;                       // MV.gravity
        if (velY < -30) velY = -30;
        moveAxis(0, dx * velH * dt);
        moveAxis(2, dz * velH * dt);
        grounded = false;
        moveAxis(1, velY * dt);
        if (grounded) velY = 0;
        if (pos.y > peak) peak = pos.y;
      }
      const rTop = [...blockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(e => '[' + e[0].split(',').map(n => (+n).toFixed(1)).join(' ') + ']x' + e[1]);
      return { y: pos.y - HY, peak: peak - HY, x: pos.x, z: pos.z, blockers: rTop, wp: wp };
    },
    walk(sx, sy, sz, dx, dz, ticks) {
      pos = { x: sx, y: sy, z: sz }; grounded = false; blockers.clear();
      let peak = sy, velY = 0, velH = 0;
      const dt = 1 / 60, speed = 4.4;            // MV.walk
      for (let i = 0; i < ticks; i++) {
        // MV.accel 42 grounded / MV.airAccel 9 airborne. On a stair `grounded`
        // flickers, so a real player accelerates far slower than a constant
        // walk speed — the second reason the first gate over-reported success.
        const acc = (grounded ? 42 : 9) * dt;
        velH += Math.max(-acc, Math.min(acc, speed - velH));
        velY -= 15.5 * dt;                       // MV.gravity
        if (velY < -30) velY = -30;
        moveAxis(0, dx * velH * dt);
        moveAxis(2, dz * velH * dt);
        grounded = false;
        moveAxis(1, velY * dt);
        if (grounded) velY = 0;
        if (pos.y > peak) peak = pos.y;
      }
      const top3 = [...blockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(e => '[' + e[0].split(',').map(n => (+n).toFixed(1)).join(' ') + ']x' + e[1]);
      return { y: pos.y - HY, peak: peak - HY, x: pos.x, z: pos.z, blockers: top3 };
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
    const r = t.route ? C.walkRoute(t.x, t.y + HY + 0.05, t.z, t.route, t.ticks || 900)
                      : C.walk(t.x, t.y + HY + 0.05, t.z, t.dx, t.dz, t.ticks || 220);
    const good = r.peak >= t.top - 0.12;
    ok(good, `${t.name}: foot reached ${r.peak.toFixed(2)}m (need >= ${t.top.toFixed(2)}m)`);
    if (!good) console.log('        stopped at x=' + r.x.toFixed(1) + ' z=' + r.z.toFixed(1)
      + '  blocked by: ' + (r.blockers.join(' ') || 'nothing (never reached a stair)'));
  }
}

run("urban", [
  { name: "garage fire escape -> roof 4.30", x: -17.6, y: 0, z: 42.6, dx: 0, dz: -1, top: 4.30 },
  { name: "warehouse fire escape -> roof 9.15", x: -18.2, y: 0, z: -17.3, dx: -1, dz: 0, top: 9.15, ticks: 340 },
  /* RAILWAY DISTRICT — rebuilt v7.6. Every route into and up this district is
     gated: both platform ramps at both ends, the three station levels, the
     engine shed roof and both footbridge approaches. */
  { name: "island platform west ramp -> 1.05", x: 23.0, y: 0, z: -84.4, dx: 1, dz: 0, top: 1.05 },
  { name: "island platform east ramp -> 1.05", x: 71.0, y: 0, z: -84.4, dx: -1, dz: 0, top: 1.05 },
  { name: "side platform west ramp -> 1.05", x: 21.0, y: 0, z: -77.0, dx: 1, dz: 0, top: 1.05 },
  { name: "side platform east ramp -> 1.05", x: 73.0, y: 0, z: -77.0, dx: -1, dz: 0, top: 1.05 },
  { name: "station forecourt steps -> concourse 1.05", x: 42, y: 0, z: -64.2, dx: 0, dz: -1, top: 1.05 },
  // start clear of the south wall: the capsule radius reached into it at z -67.4
  { name: "station concourse -> upper floor 4.95", x: 50.5, y: 1.05, z: -68.0, dx: 0, dz: -1, top: 4.95, ticks: 400 },
  { name: "station upper floor -> roof 8.25", x: 33.5, y: 4.95, z: -73.2, dx: 0, dz: 1, top: 8.25, ticks: 400 },
  { name: "platform -> canopy deck 3.86", x: 68.5, y: 1.05, z: -85.2, dx: -1, dz: 0, top: 3.86, ticks: 400 },
  { name: "engine shed west stair -> roof 4.00", x: 24.95, y: 0, z: -89.9, dx: 0, dz: -1, top: 4.00, ticks: 400 },
  { name: "footbridge south stair -> deck 4.60", x: 76, y: 0, z: -72.4, dx: 0, dz: -1, top: 4.60, ticks: 400 },
  { name: "footbridge north stair -> deck 4.60", x: 76, y: 0, z: -97.0, dx: 0, dz: 1, top: 4.60, ticks: 400 },
  // v6.0 districts — every multi-storey building's external flight
  // interior / district stairs — never gate-tested before v6.2
  { name: "warehouse interior -> 3.81", x: -37.4, y: 0, z: -35.95, dx: -1, dz: 0, top: 3.81 },
  { name: "south office -> 3.20", x: -35.95, y: 0, z: 30.2, dx: 0, dz: -1, top: 3.20 },
  { name: "east block -> 5.72", x: 40, y: 0, z: 32.0, dx: 0, dz: 1, top: 5.72, ticks: 400 },
  { name: "south shop -> 3.20", x: 13.7, y: 0, z: -55.5, dx: 0, dz: -1, top: 3.20 },
  { name: "shop row A -> 4.00", x: 53, y: 0, z: 1.9, dx: 0, dz: -1, top: 4.00 },
  { name: "shop row B -> 5.10", x: 52.1, y: 0, z: 16.9, dx: 1, dz: 0, top: 5.10, ticks: 400 },
  { name: "west apartments -> 3.41", x: -37.7, y: 0, z: 31.0, dx: 0, dz: -1, top: 3.41 },
  { name: "north depot -> 4.50", x: -60.2, y: 0, z: -80.6, dx: 0, dz: -1, top: 4.50 },
  { name: "north block A -> 3.60", x: -20.9, y: 0, z: -79.4, dx: 0, dz: -1, top: 3.60 },
  { name: "north block B -> 3.48", x: -13.55, y: 0, z: -74.9, dx: 0, dz: -1, top: 3.48 },
  { name: "cargo office -> 3.90", x: -79.1, y: 0, z: -1.5, dx: 0, dz: -1, top: 3.90 },
  { name: "mall (2f) -> roof 6.0", x: 50.4, y: 0, z: -45.0, dx: 1, dz: 0, top: 6.0, ticks: 400 },
  { name: "airport terminal (2f) -> roof 6.0", x: -91.6, y: 0, z: -93.0, dx: 1, dz: 0, top: 6.0, ticks: 400 },
  { name: "quay -> ship deck 3.40", x: -64.4, y: 0.6, z: 62.0, dx: 1, dz: 0, top: 3.40, ticks: 400 },
  /* v10: the ship's superstructure is 8 m wide and its three-storey stair does
     not fit as a straight run - see buildingAt in districts-outer.js. It is a
     three-leg switchback now, so the route turns at each landing, which is what
     a player actually does. Reaching 12.4 m still means what it always meant:
     the bridge roof is accessible. The waypoints are the LANDING CENTRES, read
     off the generator rather than typed by eye - lane A is z0-1.1 = 56.9, lane
     B is z0-2.65 = 55.35, and the turns are at x -52.0 and -56.0. */
  { name: "ship bridge (3f) -> roof 12.4 (switchback)", x: -58.4, y: 3.4, z: 57.0, top: 12.4,
    ticks: 1200,
    route: [[-51.35, 56.9],     // up leg A, onto the clear pad of landing 1
            [-51.35, 55.35],    // across the pad into lane B (no treads above)
            [-57.3, 55.35],     // up leg B, onto the clear pad of landing 2
            [-57.3, 56.9],      // across into lane A, clear of leg C's first tread
            [-52.0, 56.9],      // up leg C to roof level
            [-52.0, 60.0]] },   // and step onto the roof itself   // and step onto the roof itself   // and step onto the roof itself    // leg C: +x in lane A, up to 12.4

  /* OLD TOWN TERRACE — rebuilt v7.8. The three houses this replaced had
     staircases that were NEVER gate-tested; they happened to work. Every
     flight in the new district is registered. */
  { name: "ochre house ground -> floor 2 (3.45)", x: -11.15, y: 0, z: 63.1, dx: 0, dz: -1, top: 3.45, ticks: 400 },
  { name: "ochre house floor 2 -> roof run (6.65)", x: -17.65, y: 3.45, z: 57.8, dx: 0, dz: 1, top: 6.65, ticks: 400 },
  { name: "sage house ground -> floor 2 (3.45)", x: 16.85, y: 0, z: 63.1, dx: 0, dz: -1, top: 3.45, ticks: 400 },
  { name: "sage house floor 2 -> roof run (6.65)", x: 11.15, y: 3.45, z: 57.8, dx: 0, dz: 1, top: 6.65, ticks: 400 },
  { name: "corner shop ground -> stockroom (4.05)", x: 32.55, y: 0, z: 63.1, dx: 0, dz: -1, top: 4.05, ticks: 400 },
  { name: "corner shop stockroom -> roof terrace (7.9)", x: 26.6, y: 4.05, z: 57.7, dx: 0, dz: 1, top: 7.90, ticks: 400 },

  /* THE COLONY — rebuilt v7.8. Open stair cores, three flights each. The two
     blocks this replaced had one internal stairwell apiece and neither was
     ever gate-tested. */
  { name: "pink deck stair ground -> level 1 (3.30)", x: -43.6, y: 0, z: 78.5, dx: 1, dz: 0, top: 3.30, ticks: 400 },
  { name: "pink deck stair level 1 -> level 2 (6.60)", x: -39.8, y: 3.30, z: 78.5, dx: 1, dz: 0, top: 6.60, ticks: 400 },
  { name: "yellow deck stair level 2 -> roof (10.15)", x: -24.4, y: 6.60, z: 78.5, dx: 1, dz: 0, top: 10.15, ticks: 400 },
  { name: "mint deck stair ground -> level 1 (3.30)", x: 12.4, y: 0, z: 78.5, dx: 1, dz: 0, top: 3.30, ticks: 400 },
  { name: "mint deck stair level 2 -> roof (10.15)", x: 19.6, y: 6.60, z: 78.5, dx: 1, dz: 0, top: 10.15, ticks: 400 },
  { name: "west roof -> water tank gantry (13.40)", x: -43.4, y: 10.15, z: 85.6, dx: 1, dz: 0, top: 13.40, ticks: 400 },

  /* MARKET CROSS — rebuilt v7.8. The mall's external flight predates this work
     and was already gated; the loading dock steps are new. */
  { name: "service yard -> loading dock (1.10)", x: 53.0, y: 0, z: -45.4, dx: 1, dz: 0, top: 1.10 },

  /* IRONGATE DEPOT — new v7.9. The warehouse shell and its fire escape are
     v4-era and already gated above; these are the district's new routes. */
  { name: "depot dock west ramp (1.10)", x: -50.2, y: 0, z: -17.7, dx: 1, dz: 0, top: 1.10 },
  { name: "depot dock east ramp (1.10)", x: -13.8, y: 0, z: -17.7, dx: -1, dz: 0, top: 1.10 },
  { name: "gantry ground -> crane deck (9.40)", x: -49.5, y: 0, z: -42.6, dx: 0, dz: 1, top: 9.40, ticks: 600 },

  /* EASTGATE YARD — rebuilt v8.0 */
  { name: "yard gantry ground -> deck (8.90)", x: 76.2, y: 0, z: 7.4, dx: 0, dz: 1, top: 8.90, ticks: 600 },
  { name: "yard office ground -> floor 2 (3.30)", x: 77.2, y: 0, z: -1.9, dx: 0, dz: -1, top: 3.30, ticks: 400 }
]);

run("rural", [
  /* v9.0: the five entries here used to name landmarks on the OLD rural map —
     terraces and towers that Hollow Ridge does not have. They were passing on
     geometry that no longer existed and then failing when it was replaced,
     which is a stale test rather than a broken map. Replaced with the routes
     that actually matter now: both ridge faces tier by tier, and every
     structure a player can get on top of. */
  { name: "rural ridge A: ground -> t1 6.0",  x: -70, y: 0,  z: -20.8, dx: 0,  dz: -1, top: 6.00 },
  { name: "rural ridge A: t1 -> t2 13.0",     x: -46.2, y: 6,  z: -70,  dx: -1, dz: 0,  top: 13.00 },
  { name: "rural ridge A: t2 -> t3 21.0",     x: -60.2, y: 13, z: -100, dx: -1, dz: 0,  top: 21.00 },
  { name: "rural ridge A: t3 -> summit 29.4", x: -120, y: 21, z: -66.4, dx: 0, dz: -1, top: 29.40 },
  { name: "rural ridge B: ground -> t1 6.0",  x: -100, y: 0,  z: -20.8, dx: 0,  dz: -1, top: 6.00 },
  { name: "rural watchtower -> deck 5.10",    x: -18.4, y: 0,  z: -30,  dx: -1, dz: 0,  top: 5.10 },
  { name: "rural silo -> top 11.00",          x: 114.9, y: 0,  z: 88,   dx: -1, dz: 0,  top: 11.00 },
  { name: "rural windmill -> deck 12.00",     x: 118, y: 0, z: 71.2, dx: 0, dz: -1, top: 12.00 },
  { name: "rural barn -> loft 3.00",          x: 80.9,  y: 0,  z: 88,   dx: -1, dz: 0,  top: 3.00 },
  { name: "rural stilt -> platform 3.30",     x: 116.5, y: 0,  z: -70,  dx: -1, dz: 0,  top: 3.30 }
]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
