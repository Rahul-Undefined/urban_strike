/* _instrument.js — THROWAWAY. Not a gate. No budgets, no exit code.
   Underscore prefix = helper, same convention as tools/_shadow.js.

   WHY THIS EXISTS

   CLAUDE-CODE-HANDOFF.md section 5: three root-cause theories for the 21
   unclimbable flights have been proposed and all three were wrong. Stop
   theorising. Log the ACTUAL blocking collider at the moment each step-up is
   refused, and print a frequency table.

   WHAT IT ADDS BEYOND THE BRIEF

   The brief says "port climber() from verify-climb.js". Before trusting any
   number that walker produces, this runs TWO walkers over every flight:

     GATE — climber() copied verbatim from tools/verify-climb.js.
     REAL — a faithful port of controller.js moveAxis + sweepAxis + unstick.

   They are not the same physics. verify-climb's walker iterates colliders one
   at a time in array order and auto-steps against each collider's own top;
   the shipping resolver (v8.1) sweeps ALL overlapping colliders and takes the
   most restrictive correction with rise measured against the MAXIMUM top. That
   array-order dependence is the exact defect the v8.1 rewrite removed. The
   gate also has no SIDE_TOL start-side test on vertical moves and never calls
   unstick().

   If the two walkers disagree on a flight, the 20/68 figure describes physics
   the browser does not run. That is measured here, not asserted.

   Run: node tools/_instrument.js [-v]
*/
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const VERBOSE = process.argv.indexOf("-v") >= 0;

/* ---------- sandbox: copied verbatim from tools/verify-climb.js ---------- */
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
/* Identical to public/index.html. HANDOFF section 4. */
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

/* Refusal reasons, shared by both walkers. */
const AIRBORNE = "airborne";        // not grounded when the wall was hit
const RISE = "rise>step";           // ledge too tall for the auto-step
const CROWN = "crown-blocked";      // rise OK, but the lifted capsule overlaps something
const SHEER = "sheer";              // no top at all / rise <= 0 — a plain wall

/* =====================================================================
   WALKER A — GATE. climber() verbatim from tools/verify-climb.js, with
   the refusal path instrumented. The physics is byte-for-byte the gate's;
   only the logging is added.
   ===================================================================== */
function climberGate(cols) {
  let pos = { x: 0, y: 0, z: 0 }, grounded = false;
  let log = [];
  function overlapIdx(cx, cy, cz) {
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (cx - R < c[3] && cx + R > c[0] && cy - HY < c[4] && cy + HY > c[1] && cz - R < c[5] && cz + R > c[2]) return i;
    }
    return -1;
  }
  function moveAxis(axis, delta) {
    if (delta === 0) return;
    const v = [pos.x, pos.y, pos.z];
    v[axis] += delta;
    for (let ci = 0; ci < cols.length; ci++) {
      const c = cols[ci];
      if (!(v[0] - R < c[3] && v[0] + R > c[0] && v[1] - HY < c[4] && v[1] + HY > c[1] && v[2] - R < c[5] && v[2] + R > c[2])) continue;
      if (axis === 1) {
        if (delta < 0) { v[1] = c[4] + HY + 0.001; grounded = true; }
        else v[1] = c[1] - HY - 0.001;
      } else {
        const footY = v[1] - HY, rise = c[4] - footY;
        if (grounded && rise > 0 && rise <= STEP) {
          const ny = v[1] + rise + 0.02;
          const bi = overlapIdx(v[0], ny, v[2]);
          if (bi < 0) { v[1] = ny; continue; }
          log.push({ why: CROWN, wall: ci, blocker: bi, x: v[0], y: v[1], z: v[2], ny: ny, rise: rise });
        } else {
          log.push({
            why: !grounded ? AIRBORNE : (rise <= 0 ? SHEER : RISE),
            wall: ci, blocker: -1, x: v[0], y: v[1], z: v[2], ny: -1, rise: rise
          });
        }
        if (delta > 0) v[axis] = c[axis] - R - 0.001;
        else v[axis] = c[axis + 3] + R + 0.001;
      }
    }
    pos = { x: v[0], y: v[1], z: v[2] };
  }
  return {
    walk(sx, sy, sz, dx, dz, ticks) {
      pos = { x: sx, y: sy, z: sz }; grounded = false; log = [];
      let peak = sy, velY = 0, velH = 0;
      const dt = 1 / 60, speed = MV.walk;
      for (let i = 0; i < ticks; i++) {
        const acc = (grounded ? MV.accel : MV.airAccel) * dt;
        velH += Math.max(-acc, Math.min(acc, speed - velH));
        velY -= MV.gravity * dt;
        if (velY < -30) velY = -30;
        moveAxis(0, dx * velH * dt);
        moveAxis(2, dz * velH * dt);
        grounded = false;
        moveAxis(1, velY * dt);
        if (grounded) velY = 0;
        if (pos.y > peak) peak = pos.y;
      }
      return { peak: peak - HY, x: pos.x, z: pos.z, log: log };
    }
  };
}

/* =====================================================================
   WALKER B — REAL. Faithful port of public/src/player/controller.js:
   sweepAxis + moveAxis + unstick, with the same call order as update().
   Constants come from CFG, never hardcoded.
   ===================================================================== */
const EPS = 0.001, SIDE_TOL = 0.06;
function climberReal(cols) {
  let pos = { x: 0, y: 0, z: 0 }, grounded = false, velY = 0;
  let log = [];
  const hx = R, hy = HY, hz = R;

  function overlapIdx(cx, cy, cz) {
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (cx - hx < c[3] && cx + hx > c[0] && cy - hy < c[4] && cy + hy > c[1] && cz - hz < c[5] && cz + hz > c[2]) return i;
    }
    return -1;
  }
  /* Most restrictive correction across EVERY overlapping box, plus the
     maximum top among them. This is the v8.1 semantic the gate lacks. */
  function sweepAxis(v, axis, delta, startY) {
    const half = axis === 1 ? hy : (axis === 0 ? hx : hz);
    let hit = false, best = 0, top = -Infinity, topIdx = -1, first = -1;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!(v[0] - hx < c[3] && v[0] + hx > c[0] &&
            v[1] - hy < c[4] && v[1] + hy > c[1] &&
            v[2] - hz < c[5] && v[2] + hz > c[2])) continue;
      let cand;
      if (delta > 0) {
        if (axis === 1 && startY + hy > c[1] + SIDE_TOL) continue;
        cand = c[axis] - half - EPS;
        if (!hit || cand < best) best = cand;
      } else {
        if (axis === 1 && startY - hy < c[4] - SIDE_TOL) continue;
        cand = c[axis + 3] + half + EPS;
        if (!hit || cand > best) best = cand;
      }
      if (c[4] > top) { top = c[4]; topIdx = i; }
      if (first < 0) first = i;
      hit = true;
    }
    return hit ? { pos: best, top: top, topIdx: topIdx, first: first } : null;
  }
  function moveAxis(axis, delta) {
    if (delta === 0) return;
    const startY = pos.y;
    const v = [pos.x, pos.y, pos.z];
    v[axis] += delta;
    if (axis === 1) {
      const rv = sweepAxis(v, 1, delta, startY);
      if (rv) {
        if (delta < 0) { grounded = true; v[1] = rv.pos; }
        else v[1] = Math.max(startY, rv.pos);
        velY = 0;
      }
      pos = { x: v[0], y: v[1], z: v[2] };
      return;
    }
    const rh = sweepAxis(v, axis, delta, startY);
    if (!rh) { pos = { x: v[0], y: v[1], z: v[2] }; return; }
    if (grounded && rh.top > -Infinity) {
      const rise = rh.top - (v[1] - hy);
      if (rise > 0 && rise <= MV.step) {
        const ny = v[1] + rise + 0.02;
        const bi = overlapIdx(v[0], ny, v[2]);
        if (bi < 0) { pos = { x: v[0], y: ny, z: v[2] }; return; }
        log.push({ why: CROWN, wall: rh.topIdx, blocker: bi, x: v[0], y: v[1], z: v[2], ny: ny, rise: rise });
      } else {
        log.push({ why: rise <= 0 ? SHEER : RISE, wall: rh.topIdx, blocker: -1, x: v[0], y: v[1], z: v[2], ny: -1, rise: rise });
      }
    } else {
      log.push({ why: grounded ? SHEER : AIRBORNE, wall: rh.first, blocker: -1, x: v[0], y: v[1], z: v[2], ny: -1, rise: 0 });
    }
    v[axis] = rh.pos;
    pos = { x: v[0], y: v[1], z: v[2] };
  }
  function unstick() {
    for (let p = 0; p < 4; p++) {
      const idx = overlapIdx(pos.x, pos.y, pos.z);
      if (idx < 0) return;
      const c = cols[idx];
      const up = c[4] - (pos.y - hy);
      const xp = c[3] - (pos.x - hx), xn = (pos.x + hx) - c[0];
      const zp = c[5] - (pos.z - hz), zn = (pos.z + hz) - c[2];
      const best = Math.min(up, xp, xn, zp, zn);
      if (best === up) { pos.y = c[4] + hy + EPS; velY = 0; grounded = true; }
      else if (best === xp) pos.x = c[3] + hx + EPS;
      else if (best === xn) pos.x = c[0] - hx - EPS;
      else if (best === zp) pos.z = c[5] + hz + EPS;
      else pos.z = c[2] - hz - EPS;
    }
  }
  return {
    walk(sx, sy, sz, dx, dz, ticks) {
      pos = { x: sx, y: sy, z: sz }; grounded = false; velY = 0; log = [];
      let peak = sy, velX = 0, velZ = 0;
      const dt = 1 / 60, speed = MV.walk;
      const wx = dx * speed, wz = dz * speed;
      for (let i = 0; i < ticks; i++) {
        const accel = grounded ? MV.accel : MV.airAccel;
        velX += Math.max(-accel * dt, Math.min(accel * dt, wx - velX));
        velZ += Math.max(-accel * dt, Math.min(accel * dt, wz - velZ));
        velY -= MV.gravity * dt;
        if (velY < -30) velY = -30;
        moveAxis(0, velX * dt);
        moveAxis(2, velZ * dt);
        grounded = false;
        moveAxis(1, velY * dt);
        unstick();
        if (pos.y > peak) peak = pos.y;
      }
      return { peak: peak - HY, x: pos.x, z: pos.z, log: log };
    }
  };
}

/* ---------- classification helpers ---------- */
function dims(c) { return [c[3] - c[0], c[4] - c[1], c[5] - c[2]]; }
function fmtCol(c) {
  const d = dims(c);
  return `${d[0].toFixed(2)}x${d[1].toFixed(2)}x${d[2].toFixed(2)} ` +
    `x[${c[0].toFixed(2)},${c[3].toFixed(2)}] y[${c[1].toFixed(2)},${c[4].toFixed(2)}] z[${c[2].toFixed(2)},${c[5].toFixed(2)}]`;
}
/* Is this collider one of the flight's own treads? A tread is a thin slab
   inside the run footprint whose top matches sy + n*stepH. */
function isOwnTread(c, f) {
  const top = c[4];
  const n = (top - f.sy) / f.stepH;
  if (Math.abs(n - Math.round(n)) > 0.02) return false;
  if (Math.round(n) < 1 || Math.round(n) > f.steps) return false;
  const lo = Math.min(f.sx, f.endX) - 1.2, hi = Math.max(f.sx, f.endX) + 1.2;
  const lo2 = Math.min(f.sz, f.endZ) - 1.2, hi2 = Math.max(f.sz, f.endZ) + 1.2;
  const mx = (c[0] + c[3]) / 2, mz = (c[2] + c[5]) / 2;
  return mx >= lo && mx <= hi && mz >= lo2 && mz <= hi2;
}
/* Shape class from dimensions — the vocabulary for the frequency table. */
function shapeOf(c) {
  const [w, h, d] = dims(c);
  const foot = w * d, thin = Math.min(w, d);
  if (h <= 0.35) return foot >= 6 ? "slab(floor)" : "slab(tread/lip)";
  if (h >= 2.4 && thin <= 0.6) return "wall(tall-thin)";
  if (h > 0.35 && h < 1.4 && thin <= 0.6) return "parapet/kerb";
  if (h >= 1.4 && h < 2.4 && thin <= 0.6) return "wall(mid)";
  if (foot < 1.5) return "prop/post";
  return "solid(block)";
}

/* ---------- run ---------- */
const maps = ["urban", "rural"];
const allRefusals = [];
const disagreements = [];
const summary = [];

for (const map of maps) {
  ctx.__m = map; ctx.__sc = new THREE.Scene();
  vm.runInContext("World.reset && World.isBuilt() && World.reset(); World.buildMap(__sc, __m);", ctx);
  const cols = ctx.World._colliders();
  const flights = ctx.World._stairs().slice();
  const DIST = ctx.DISTRICTS;
  const G = climberGate(cols), Rw = climberReal(cols);

  console.log(`\n=== [${map}] ${flights.length} flights, ${cols.length} colliders ===`);

  for (let i = 0; i < flights.length; i++) {
    const f = flights[i];
    const sx = f.sx - f.dirX * (f.stepD + R + 0.15);
    const sz = f.sz - f.dirZ * (f.stepD + R + 0.15);
    const ticks = Math.max(240, f.steps * 34);
    const sy = f.sy + HY + 0.05;

    const rg = G.walk(sx, sy, sz, f.dirX, f.dirZ, ticks);
    const rr = Rw.walk(sx, sy, sz, f.dirX, f.dirZ, ticks);
    const okG = rg.peak >= f.topY - STEP;
    const okR = rr.peak >= f.topY - STEP;
    const where = DIST ? DIST.nameAt(f.sx, f.sz) : "";

    /* THIRD WALK — from a start the player could actually occupy.
       verify-climb backs the capsule off by stepD + radius + 0.15 without
       checking that the resulting box is empty. Where a wall sits just behind
       the flight the capsule spawns INSIDE it, and the resolver ejects it to
       the far side of that wall, after which nothing can climb. That is a
       harness artifact, not a map defect. Slide the start forward toward the
       first tread until the capsule is clear, then walk again. */
    const back = f.stepD + R + 0.15;
    let clearOff = null;
    for (let o = back; o >= 0; o -= 0.05) {
      const tx = f.sx - f.dirX * o, tz = f.sz - f.dirZ * o;
      let hitAny = false;
      for (const c of cols) {
        if (tx - R < c[3] && tx + R > c[0] && sy - HY < c[4] && sy + HY > c[1] && tz - R < c[5] && tz + R > c[2]) { hitAny = true; break; }
      }
      if (!hitAny) { clearOff = o; break; }
    }
    let okC = okR, peakC = rr.peak, moved = false;
    if (clearOff === null) {
      /* No standing position anywhere along the approach. That is a real map
         defect (the stair foot is walled in), not a harness artifact — but it
         still has to be REPORTED, or it hides inside the ordinary failures. */
      moved = true;
    } else if (Math.abs(clearOff - back) > 1e-9) {
      moved = true;
      const cx2 = f.sx - f.dirX * clearOff, cz2 = f.sz - f.dirZ * clearOff;
      const rc = Rw.walk(cx2, sy, cz2, f.dirX, f.dirZ, ticks);
      okC = rc.peak >= f.topY - STEP; peakC = rc.peak;
    }

    summary.push({ map, i, where, okG, okR, okC, moved, clearOff, back, peakG: rg.peak, peakR: rr.peak, peakC, topY: f.topY, f });
    if (okG !== okR) disagreements.push({ map, i, where, okG, okR, peakG: rg.peak, peakR: rr.peak, topY: f.topY, f });

    /* Only mine refusals from flights the REAL walker cannot climb — those
       are the ones a player actually cannot use. */
    if (okR) continue;
    for (const e of rr.log) {
      const blk = e.blocker >= 0 ? cols[e.blocker] : null;
      const wall = e.wall >= 0 ? cols[e.wall] : null;
      allRefusals.push({
        map, flight: i, where, why: e.why,
        blocker: blk, wall: wall,
        ownTreadB: blk ? isOwnTread(blk, f) : false,
        ownTreadW: wall ? isOwnTread(wall, f) : false,
        shapeB: blk ? shapeOf(blk) : null,
        shapeW: wall ? shapeOf(wall) : null,
        x: e.x, y: e.y, z: e.z, rise: e.rise
      });
    }
  }
}

/* ---------- report 1: does the gate measure the game? ---------- */
console.log("\n\n########## 1. GATE vs REAL WALKER ##########");
const gBad = summary.filter(s => !s.okG).length;
const rBad = summary.filter(s => !s.okR).length;
console.log(`gate walker : ${gBad} unclimbable`);
console.log(`real walker : ${rBad} unclimbable`);
console.log(`disagreements: ${disagreements.length}`);
for (const d of disagreements) {
  console.log(`  [${d.map}] #${d.i} [${d.where}]  gate=${d.okG ? "PASS" : "FAIL"} real=${d.okR ? "PASS" : "FAIL"}  ` +
    `peak gate ${d.peakG.toFixed(2)} real ${d.peakR.toFixed(2)} need ${(d.topY - STEP).toFixed(2)}`);
}

/* ---------- report 1b: does the START POINT create the failure? ---------- */
console.log("\n\n########## 1b. START-POINT ARTIFACTS ##########");
const spawnStuck = summary.filter(s => s.moved);
console.log(`flights whose nominal start box is NOT empty: ${spawnStuck.length}`);
const rescued = spawnStuck.filter(s => !s.okR && s.okC);
console.log(`of those, flights that CLIMB once started from a legal position: ${rescued.length}`);
for (const s of spawnStuck) {
  console.log(`  [${s.map}] #${String(s.i).padEnd(3)} [${String(s.where).padEnd(18).slice(0, 18)}] ` +
    `back-off ${s.back.toFixed(2)} -> ${s.clearOff === null ? "NO CLEAR START" : s.clearOff.toFixed(2)}  ` +
    `real ${s.okR ? "PASS" : "FAIL"} (${s.peakR.toFixed(2)})  from-clear ${s.okC ? "PASS" : "FAIL"} (${s.peakC.toFixed(2)})  ` +
    `need ${(s.topY - STEP).toFixed(2)}${!s.okR && s.okC ? "   <== HARNESS ARTIFACT" : ""}`);
}
const trulyBad = summary.filter(s => !s.okC);
console.log(`\nTRUE unclimbable count (real physics, legal start): ${trulyBad.length}`);
for (const s of trulyBad) {
  const f = s.f;
  console.log(`  [${s.map}] #${String(s.i).padEnd(3)} [${String(s.where).padEnd(18).slice(0, 18)}] reached ${s.peakC.toFixed(2)} need ${(s.topY - STEP).toFixed(2)}` +
    `${s.clearOff === null ? "   *** FOOT IS WALLED IN — no legal standing position on the approach ***" : ""}`);
  console.log(`         flight: start (${f.sx.toFixed(2)}, ${f.sy.toFixed(2)}, ${f.sz.toFixed(2)}) dir (${f.dirX},${f.dirZ}) ` +
    `${f.steps} steps x ${f.stepH.toFixed(3)} rise / ${f.stepD.toFixed(3)} run, width ${f.width.toFixed(2)}, ` +
    `topY ${f.topY.toFixed(2)}, end (${f.endX.toFixed(2)}, ${f.endZ.toFixed(2)})`);
}

/* ---------- report 2: refusal reason frequency ---------- */
console.log("\n\n########## 2. WHY STEP-UPS ARE REFUSED (real walker) ##########");
const byWhy = {};
for (const r of allRefusals) byWhy[r.why] = (byWhy[r.why] || 0) + 1;
for (const k of Object.keys(byWhy).sort((a, b) => byWhy[b] - byWhy[a]))
  console.log(`  ${String(byWhy[k]).padStart(7)}  ${k}`);

/* ---------- report 3: the blocking collider frequency table ---------- */
console.log("\n\n########## 3. WHAT BLOCKS THE LIFTED CAPSULE (crown-blocked only) ##########");
const crown = allRefusals.filter(r => r.why === CROWN);
console.log(`crown-blocked refusals: ${crown.length}\n`);
const byBlk = new Map();
for (const r of crown) {
  const c = r.blocker;
  const key = `${r.map}|${r.where}|${c.slice(0, 6).map(n => n.toFixed(2)).join(",")}`;
  if (!byBlk.has(key)) byBlk.set(key, { n: 0, r, flights: new Set() });
  const e = byBlk.get(key); e.n++; e.flights.add(r.flight);
}
const rows = [...byBlk.values()].sort((a, b) => b.n - a.n);
console.log("  hits  flights  district              shape             own-tread  collider");
for (const e of rows.slice(0, 30)) {
  const r = e.r;
  console.log(`  ${String(e.n).padStart(4)}  ${String(e.flights.size).padStart(7)}  ${String(r.where).padEnd(20).slice(0, 20)}  ` +
    `${String(r.shapeB).padEnd(16)}  ${r.ownTreadB ? "YES      " : "no       "}  ${fmtCol(r.blocker)}`);
}

/* ---------- report 3b: what the auto-step judged TOO TALL ---------- */
console.log("\n\n########## 3b. WHAT THE AUTO-STEP JUDGED TOO TALL (rise>step) ##########");
const tall = allRefusals.filter(r => r.why === RISE && r.wall);
console.log(`rise>step refusals with a known ledge: ${tall.length}\n`);
const byTall = new Map();
for (const r of tall) {
  const c = r.wall;
  const key = `${r.map}|${r.where}|${c.slice(0, 6).map(n => n.toFixed(2)).join(",")}`;
  if (!byTall.has(key)) byTall.set(key, { n: 0, r, flights: new Set(), rise: [] });
  const e = byTall.get(key); e.n++; e.flights.add(r.flight); e.rise.push(r.rise);
}
console.log("  hits  flights  district              shape             own-tread  rise    collider");
for (const e of [...byTall.values()].sort((a, b) => b.n - a.n).slice(0, 30)) {
  const r = e.r, mr = e.rise.reduce((a, b) => a + b, 0) / e.rise.length;
  console.log(`  ${String(e.n).padStart(4)}  ${String(e.flights.size).padStart(7)}  ${String(r.where).padEnd(20).slice(0, 20)}  ` +
    `${String(r.shapeW).padEnd(16)}  ${r.ownTreadW ? "YES      " : "no       "}  ${mr.toFixed(2)}  ${fmtCol(r.wall)}`);
}

/* ---------- report 4: grouped by shape ---------- */
console.log("\n\n########## 4. BLOCKER SHAPE CLASSES ##########");
const byShape = {};
for (const r of crown) {
  const k = r.ownTreadB ? `${r.shapeB} [OWN TREAD]` : r.shapeB;
  byShape[k] = (byShape[k] || 0) + 1;
}
for (const k of Object.keys(byShape).sort((a, b) => byShape[b] - byShape[a]))
  console.log(`  ${String(byShape[k]).padStart(7)}  ${k}`);

/* ---------- report 5: per-flight dominant cause ---------- */
console.log("\n\n########## 5. PER-FLIGHT DOMINANT CAUSE ##########");
const byFlight = new Map();
for (const r of allRefusals) {
  const k = `${r.map}#${r.flight}`;
  if (!byFlight.has(k)) byFlight.set(k, { where: r.where, why: {}, blk: new Map() });
  const e = byFlight.get(k);
  e.why[r.why] = (e.why[r.why] || 0) + 1;
  if (r.why === CROWN && r.blocker) {
    const bk = r.blocker.slice(0, 6).map(n => n.toFixed(2)).join(",");
    if (!e.blk.has(bk)) e.blk.set(bk, { n: 0, r });
    e.blk.get(bk).n++;
  }
}
for (const [k, e] of byFlight) {
  const whyStr = Object.keys(e.why).sort((a, b) => e.why[b] - e.why[a]).map(w => `${w}x${e.why[w]}`).join(" ");
  const top = [...e.blk.values()].sort((a, b) => b.n - a.n)[0];
  console.log(`  ${k.padEnd(12)} [${String(e.where).padEnd(18).slice(0, 18)}] ${whyStr}`);
  if (top) console.log(`               top blocker: ${top.r.shapeB}${top.r.ownTreadB ? " [OWN TREAD]" : ""}  ${fmtCol(top.r.blocker)}  x${top.n}`);
}

/* ---------- report 6: raw trace for one flight ----------
   node tools/_instrument.js --flight urban#16   → every refusal, in order,
   deduped by (why, blocker, rounded position) so a 369-tick stall prints once. */
const fi = process.argv.indexOf("--flight");
if (fi > 0 && process.argv[fi + 1]) {
  const want = process.argv[fi + 1];
  console.log(`\n\n########## 6. RAW TRACE ${want} ##########`);
  const seen = new Set();
  let n = 0;
  for (const r of allRefusals) {
    if (`${r.map}#${r.flight}` !== want) continue;
    const k = `${r.why}|${r.blocker ? r.blocker.slice(0, 6).join(",") : "-"}|${r.wall ? r.wall.slice(0, 6).join(",") : "-"}|` +
      `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.z.toFixed(1)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ${String(++n).padStart(3)}. ${r.why.padEnd(14)} capsule (${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)})  rise=${r.rise.toFixed(3)}`);
    if (r.wall) console.log(`       ledge   ${r.shapeW.padEnd(16)} ${fmtCol(r.wall)}`);
    if (r.blocker) console.log(`       crown   ${r.shapeB.padEnd(16)} ${fmtCol(r.blocker)}`);
  }
  console.log(`  (${n} distinct refusal states)`);
}

if (VERBOSE) {
  console.log("\n\n########## 7. RAW (first 80) ##########");
  for (const r of allRefusals.slice(0, 80))
    console.log(`  [${r.map}#${r.flight}] ${r.why} at (${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)}) rise=${r.rise.toFixed(3)}` +
      (r.blocker ? `  blk ${fmtCol(r.blocker)} ${r.shapeB}${r.ownTreadB ? " OWN" : ""}` : ""));
}
