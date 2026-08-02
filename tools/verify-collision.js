/* verify-collision — the resolver gate.

   Every other gate in this project checks the MAP. This one checks the code
   that moves the player through it, because that is where the v8.0 "player
   under the world" report came from and no existing gate could have caught it.

   The failure it exists to prevent: a rising move resolved the player to a
   collider's UNDERSIDE with no check that they had ever been below it. Urban
   has eleven slabs of 3x3 m or larger whose bottom face sits at y = 0.00, so
   that snap placed the player at y = -0.90 — beneath the map, and far above
   the old y < -8 failsafe, which therefore never fired.

   Two halves:
     A. Synthetic scenarios against hand-built collider sets. Each one is a
        named defect from the v8.0 resolver.
     B. A sweep over the real maps: every ground-crossing slab is driven with
        the exact motion that used to break, plus a seeded random walk from
        every spawn point.

   Run: node tools/verify-collision.js  [-v] */

let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

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
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval,
  AudioSys: { step: function () {} }               // controller calls this on footsteps
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
  "public/src/environment/metro.js", "public/src/environment/access.js",
  "public/src/player/controller.js"
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

const CFG = require(path.join(ROOT, "public/src/config/index.js"));
const R = CFG.PLAYER.radius;
const HALF = CFG.PLAYER.standH / 2;
const STEP = CFG.MOVE.step;

/* ---- harness -------------------------------------------------------- */

// Replace the world's collider list with a hand-built set.
function setColliders(list) {
  vm.runInContext("World.reset();", ctx);
  ctx.__cols = list;
  vm.runInContext("(function(){ var c = World.colliders; for (var i=0;i<__cols.length;i++) c.push(__cols[i]); })();", ctx);
}

function buildMap(map) {
  ctx.__m = map;
  vm.runInContext("(function(){ var sc = new THREE.Scene(); World.reset(); World.buildMap(sc, __m); })();", ctx);
}

function spawn(x, y, z) {
  ctx.__p = [x, y, z];
  vm.runInContext("PlayerCtl.spawnAt(__p, 0);", ctx);
}

function P() { return vm.runInContext("({x:PlayerCtl.pos.x,y:PlayerCtl.pos.y,z:PlayerCtl.pos.z})", ctx); }
function setVel(x, y, z) { ctx.__v = [x, y, z]; vm.runInContext("PlayerCtl.vel.set(__v[0],__v[1],__v[2]);", ctx); }
function moveAxis(a, d) { ctx.__a = a; ctx.__d = d; vm.runInContext("PlayerCtl._probe.moveAxis(__a, __d);", ctx); }
function setGrounded(g) { ctx.__g = g; vm.runInContext("PlayerCtl._probe.setGrounded(__g);", ctx); }
function voidY() { return vm.runInContext("PlayerCtl._probe.voidY()", ctx); }
function step(input, dt) {
  ctx.__in = input; ctx.__dt = dt || 1 / 60;
  vm.runInContext("PlayerCtl.update(__dt, __in, 1, false);", ctx);
}
function blank() {
  return { fwd: false, back: false, left: false, right: false, sprint: false, jump: false, crouch: false, leanL: false, leanR: false };
}

function insideAny(p, cols, hy) {
  hy = hy === undefined ? HALF : hy;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (p.x - R < c[3] && p.x + R > c[0] && p.y - hy < c[4] && p.y + hy > c[1] && p.z - R < c[5] && p.z + R > c[2]) return i;
  }
  return -1;
}

function realColliders() {
  return vm.runInContext("World._colliders().map(function(c){return [c[0],c[1],c[2],c[3],c[4],c[5]];});", ctx);
}

/* ---- A. synthetic defect scenarios ----------------------------------- */

console.log("\n--- A: resolver defects (synthetic) ---");

// A ground plate everything else sits on.
const GROUND = [-40, -0.4, -40, 40, 0, 40, 0];

// 1. THE FILMED BUG. A slab whose bottom face is exactly the ground line.
//    Old resolver: rising against it -> y = c[1] - HALF = -0.90, under the map.
{
  setColliders([GROUND.slice(), [-6, 0, -6, 6, 1.2, 6, 0]]);
  spawn(0, HALF, 0);                       // feet on the ground, inside the slab's footprint
  const start = P().y;
  setVel(0, 5, 0);
  setGrounded(false);
  moveAxis(1, 0.5);                        // rise
  const after = P();
  ok(after.y >= start - 0.002,
    `rising into a ground-line slab never ends below start (start ${start.toFixed(2)} -> ${after.y.toFixed(2)})`);
  ok(after.y - HALF > -0.5,
    `feet stay above the ground line (feet ${(after.y - HALF).toFixed(2)})`);
}

// 2. ORDER DEPENDENCE. Two boxes meeting at a corner. The old resolver pushed
//    out of one and into the other depending on array order.
{
  const A = [2, 0, -8, 10, 3, 0, 0];
  const B = [-8, 0, 0, 2, 3, 8, 0];
  for (const order of [[GROUND.slice(), A, B], [GROUND.slice(), B, A]]) {
    setColliders(order);
    spawn(0.2, HALF, -0.6);
    setGrounded(true);
    let worst = -1;
    for (let i = 0; i < 90; i++) {
      setVel(3.5, 0, 3.5);
      moveAxis(0, 3.5 / 60);
      moveAxis(2, 3.5 / 60);
      const idx = insideAny(P(), order);
      if (idx >= 0) worst = idx;
    }
    ok(worst < 0, `corner squeeze resolves identically regardless of collider order (order ${order === undefined ? "" : ""}${order[1] === A ? "A,B" : "B,A"})`);
  }
}

// 3. AUTO-STEP. The old version `continue`d and skipped horizontal resolution,
//    so the step could finish inside the ledge it stepped over.
{
  const curb = [1, 0, -6, 9, STEP - 0.05, 6, 0];
  const cols = [GROUND.slice(), curb];
  setColliders(cols);
  spawn(0, HALF, 0);
  setGrounded(true);
  for (let i = 0; i < 60; i++) { setVel(3, 0, 0); moveAxis(0, 3 / 60); }
  const p = P();
  ok(insideAny(p, cols) < 0, "auto-step finishes outside the ledge, not inside it");
  ok(p.y - HALF >= curb[4] - 0.05, `auto-step actually climbed the curb (feet ${(p.y - HALF).toFixed(2)} vs top ${curb[4].toFixed(2)})`);
}

// 4. A wall taller than the step must stop the player, not launch them onto it.
{
  const wall = [1, 0, -6, 9, 3, 6, 0];
  const cols = [GROUND.slice(), wall];
  setColliders(cols);
  spawn(0, HALF, 0);
  setGrounded(true);
  for (let i = 0; i < 60; i++) { setVel(4, 0, 0); moveAxis(0, 4 / 60); }
  const p = P();
  ok(p.x + R <= wall[0] + 0.01, `a 3m wall blocks rather than boosts (x ${p.x.toFixed(2)})`);
  ok(p.y - HALF < 0.2, "falling does not snap the player onto a wall top they were never above");
}

// 5. unstick never pushes the player downward out of geometry.
{
  const slab = [-6, 0, -6, 6, 1.2, 6, 0];
  setColliders([GROUND.slice(), slab]);
  spawn(0, 0.55, 0);                      // deliberately embedded in the slab
  const before = P().y;
  vm.runInContext("PlayerCtl._probe.unstick();", ctx);
  const after = P().y;
  ok(after >= before, `unstick resolves upward, never down (${before.toFixed(2)} -> ${after.toFixed(2)})`);
}

// 6. The void plane is derived from the map, not hard-coded.
{
  setColliders([GROUND.slice(), [-2, -6.4, -2, 2, -5.5, 2, 0]]);   // a Metro-like sunken floor
  spawn(0, HALF, 0);
  ok(voidY() < -6.4, `void plane sits below the lowest collider (${voidY().toFixed(2)} < -6.40)`);
}

/* ---- B. the real maps ------------------------------------------------ */

/* Perimeter-probe budget — a RATCHET, set to the counts measured on the day the
   gate was written. It may fall, never rise. Close a hole with a boundary wall,
   never by widening this number.

   All three maps leak: the walkable ground simply stops on some bearings and
   nothing walls it off. This is a second, independent route to "player ends up
   under the world", separate from the resolver defect this gate was built for,
   and I cannot tell from the 3:28 footage which of the two Rahul actually hit.
   Both are now survivable — the failsafe returns the player to their last safe
   footing instead of stranding them — but survivable is not sealed.

   Sealing Urban is the first item of the map-flow pass, where perimeter
   geometry can be added and re-validated against verify-arch, verify-cover and
   the triangle budget in one go. Rural and Metro are paused by instruction. */
const ESCAPE_BUDGET = { urban: 8, rural: 6, metro: 8 };
const MAPS = ["urban", "rural", "metro"];

for (const map of MAPS) {
  console.log(`\n--- B: ${map} ---`);
  buildMap(map);
  const cols = realColliders();

  // B1. Every ground-crossing slab, driven with the motion that used to break.
  const traps = cols.filter(c => {
    const w = c[3] - c[0], d = c[5] - c[2];
    return c[1] < 0.35 && c[4] > 0.35 && w >= 2 && d >= 2;
  });
  let worstFeet = Infinity, offender = null;
  for (const c of traps) {
    const cx = (c[0] + c[3]) / 2, cz = (c[2] + c[5]) / 2;
    spawn(cx, c[1] + HALF, cz);
    const start = vm.runInContext("PlayerCtl.pos.y", ctx);
    setVel(0, 6, 0);
    setGrounded(false);
    moveAxis(1, 0.6);
    const p = P();
    if (p.y < start - 0.01) { offender = c; }
    const feet = p.y - HALF;
    if (feet < worstFeet) worstFeet = feet;
  }
  ok(offender === null,
    `${map}: no ground-crossing slab (${traps.length} tested) can push a rising player downward` +
    (offender ? ` — x[${offender[0].toFixed(1)},${offender[3].toFixed(1)}] z[${offender[2].toFixed(1)},${offender[5].toFixed(1)}]` : ""));

  // B2. Seeded random walk from every spawn. This is the end-to-end check: it
  //     is the shape of what Rahul was doing when he filmed the bug.
  const spawns = map === "urban" ? CFG.SPAWNS
    : map === "rural" ? CFG.MAPS_RURAL.SPAWNS
      : CFG.MAPS_METRO.SPAWNS;
  let seed = 0x5f3759df;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  let stuck = 0, frames = 0;
  spawn(spawns[0][0], spawns[0][1], spawns[0][2]);
  for (const sp of spawns) {
    spawn(sp[0], sp[1], sp[2]);
    const input = blank();
    for (let f = 0; f < 260; f++) {
      if (f % 18 === 0) {
        input.fwd = rnd() < 0.62; input.back = rnd() < 0.16;
        input.left = rnd() < 0.3; input.right = rnd() < 0.3;
        input.sprint = rnd() < 0.4; input.crouch = rnd() < 0.12;
      }
      input.jump = rnd() < 0.09;
      vm.runInContext("PlayerCtl.yaw += " + ((rnd() - 0.5) * 0.5).toFixed(4) + ";", ctx);
      step(input, 1 / 60);
      frames++;
      const p = P();
      if (insideAny(p, cols, vm.runInContext("PlayerCtl._probe.halfY()", ctx)) >= 0) stuck++;
    }
  }

  /* Two different failures, deliberately budgeted differently.

     STUCK is a resolver property and must be zero on every map — if a frame
     ends inside geometry, the code that moves the player is wrong.

     ESCAPES is a MAP property: can the player walk off the edge of the ground
     plate into open air? That must NOT be measured by the random walk. It was
     at first, and the moment an unrelated spawn fix nudged the walk by half a
     metre the count dropped from 2 to 0 while the hole was still there — a
     gate that passes because the fuzz stopped finding the bug is worse than
     no gate. The perimeter probe below is deterministic: it drives the player
     outward from every compass bearing and asks whether anything stops them. */
  ok(stuck === 0, `${map}: 0 frames ending inside geometry across ${frames} frames (got ${stuck})`);

  /* Find, for each bearing, the outermost point that still has solid ground
     under it, then start the player just inside that and sprint outward. This
     asks the real question — "is the edge of the walkable world walled?" —
     without assuming the ground is a single plate. Urban's floor is tiled from
     several slabs, so probing one slab's rim only ever found seams. */
  const groundTops = cols.filter(c => c[4] > -0.6 && c[4] < 1.2 && (c[3] - c[0]) * (c[5] - c[2]) >= 60);
  function supported(x, z) {
    for (const c of groundTops) if (x > c[0] && x < c[3] && z > c[2] && z < c[5]) return c[4];
    return null;
  }
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  groundTops.forEach(c => { bx0 = Math.min(bx0, c[0]); bx1 = Math.max(bx1, c[3]); bz0 = Math.min(bz0, c[2]); bz1 = Math.max(bz1, c[5]); });
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
  const reach = Math.max(bx1 - bx0, bz1 - bz0);

  let escapes = 0, probed = 0;
  const BEARINGS = 48;
  for (let b = 0; b < BEARINGS; b++) {
    const ang = (b / BEARINGS) * Math.PI * 2;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    // march outward to find the last supported metre on this bearing
    let last = -1, lastTop = 0;
    for (let d = 4; d < reach; d += 1) {
      const t = supported(cx + dx * d, cz + dz * d);
      if (t !== null) { last = d; lastTop = t; }
    }
    if (last < 12) continue;                       // no meaningful run of ground here
    probed++;
    const sx = cx + dx * (last - 5), sz = cz + dz * (last - 5);
    const startTop = supported(sx, sz);
    if (startTop === null) { probed--; continue; }
    spawn(sx, startTop + HALF + 0.05, sz);
    const input = blank(); input.fwd = true; input.sprint = true;
    ctx.__yaw = Math.atan2(dz, dx);
    vm.runInContext("PlayerCtl.yaw = __yaw;", ctx);
    for (let f = 0; f < 300; f++) step(input, 1 / 60);
    const p = P();
    if (p.y - HALF < startTop - 1.5) escapes++;
  }
  ok(escapes <= ESCAPE_BUDGET[map],
    `${map}: ${escapes}/${probed} bearings walk off the world edge (budget ${ESCAPE_BUDGET[map]})`);
  if (escapes > 0) console.log(`        note: walkable ground ends without a boundary wall — map defect, not resolver`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
