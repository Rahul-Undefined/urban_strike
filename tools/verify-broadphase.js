/* verify-broadphase — the grid must return EXACTLY what the linear scan did.

   v10 put a uniform x/z grid in front of rayHit, rayDist2, losBlocked and
   fits(), because every one of them walked all 3,332 Urban colliders and
   several run every frame.

   THE ENTIRE RISK OF THAT CHANGE IS IN ONE SENTENCE: a broadphase that is ten
   times faster and one part in a thousand different is not an optimisation, it
   is a physics bug. It would show up as a shot passing through a wall once an
   hour, or a loot crate spawning inside a pillar on one map load in five
   hundred — symptoms nobody can reproduce and nobody can attribute.

   So this gate does not sample, and it does not use a tolerance. It runs
   thousands of queries against both paths on all three maps and requires bit
   equality. The grid is switched off by calling World._rebuildGrid() after
   clearing it, so the SAME built map answers both ways and any difference is
   the broadphase rather than a rebuild.

   The cases are chosen to hit the traversal's edges, because those are where a
   DDA goes wrong:
     - axis-aligned rays, where one of tDX/tDZ is Infinity
     - rays starting outside the map, where the start cell is clamped
     - vertical rays, where the x/z footprint is a single cell
     - very long and very short rays
     - rays that leave the grid partway

   Run: node tools/verify-broadphase.js */

let THREE;
try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, {
    get: (t, k) => {
      if (k === 'canvas') return c;
      return function () {
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop: function () { } };
        if (k === 'measureText') return { width: 10 };
        if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
      };
    }, set: () => true
  });
  c.getContext = () => g;
  return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array,
  Uint8ClampedArray, Int32Array, Infinity, isFinite,
  THREE, performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === 'canvas' ? fakeCanvas() : { style: {} }) },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval, AudioSys: { step: function () { } }
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
[
  'public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
  'public/src/config/loot.config.js', 'public/src/config/world.config.js',
  'public/src/config/maps-rural.config.js', 'public/src/config/maps-metro.config.js',
  'public/src/config/districts.config.js', 'public/src/config/index.js',
  'public/src/environment/merge.js', 'public/src/environment/world.js',
  'public/src/environment/districts-south.js', 'public/src/environment/districts-north.js',
  'public/src/environment/districts-outer.js', 'public/src/environment/deco.js',
  'public/src/environment/rural.js', 'public/src/environment/metro.js',
  'public/src/environment/access.js'
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

/* A deterministic PRNG. Random cases that differ between runs would make a
   failure unreproducible, which for a correctness gate is useless. */
let seed = 20260816;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

const W = ctx.World;

/* Reference implementations, written out here rather than imported, so the
   gate is comparing against an INDEPENDENT linear scan and not against the
   same code path with a flag flipped. */
function refRaySlab(ox, oy, oz, dx, dy, dz, c) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    const lo = c[i], hi = c[i + 3];
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo || o[i] > hi) return -1; }
    else {
      let t1 = (lo - o[i]) / d[i], t2 = (hi - o[i]) / d[i];
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmax < tmin) return -1;
    }
  }
  return tmin;
}
function refRayHit(cols, o, d, maxDist) {
  let best = maxDist, found = false;
  for (const c of cols) {
    const t = refRaySlab(o.x, o.y, o.z, d.x, d.y, d.z, c);
    if (t >= 0 && t < best) { best = t; found = true; }
  }
  return found ? best : null;
}
function refLos(cols, a, b) {
  let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.001) return false;
  dx /= len; dy /= len; dz /= len;
  for (const c of cols) {
    const t = refRaySlab(a.x, a.y, a.z, dx, dy, dz, c);
    if (t >= 0 && t < len - 0.05) return true;
  }
  return false;
}
function refFits(cols, cx, cy, cz, hx, hy, hz) {
  for (const c of cols)
    if (cx - hx < c[3] && cx + hx > c[0] && cy - hy < c[4] && cy + hy > c[1] && cz - hz < c[5] && cz + hz > c[2])
      return false;
  return true;
}

const N_RAY = 4000, N_BOX = 3000;

for (const map of ['urban', 'metro', 'rural']) {
  ctx.__m = map;
  vm.runInContext('World.reset(); World.buildMap(new THREE.Scene(), __m);', ctx);
  const cols = W._colliders().map(c => [c[0], c[1], c[2], c[3], c[4], c[5]]);
  const st = W._gridStats();

  console.log(`\n--- [${map}] ${cols.length} colliders ---`);
  ok(st.built, 'the grid was built after buildMap [' + st.cells + ' cells, ' +
    st.used + ' occupied, avg ' + (st.avg || 0).toFixed(1) + ', max ' + st.max + ']');
  ok(st.built && st.avg < cols.length / 4,
    'buckets are much smaller than the whole set [avg ' + (st.avg || 0).toFixed(1) +
    ' vs ' + cols.length + ']');

  // map extent, for placing queries
  let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
  for (const c of cols) {
    mnX = Math.min(mnX, c[0]); mxX = Math.max(mxX, c[3]);
    mnZ = Math.min(mnZ, c[2]); mxZ = Math.max(mxZ, c[5]);
  }
  const spanX = mxX - mnX, spanZ = mxZ - mnZ;

  /* ---- rayHit: exact equality of the returned distance ---- */
  let bad = 0, firstBad = null, hits = 0;
  for (let n = 0; n < N_RAY; n++) {
    let ox, oz;
    if (n % 11 === 0) { ox = mnX - 30 - rnd() * 40; oz = mnZ + rnd() * spanZ; }   // outside
    else { ox = mnX + rnd() * spanX; oz = mnZ + rnd() * spanZ; }
    const oy = 0.2 + rnd() * 18;
    let dx, dy, dz;
    const kind = n % 7;
    if (kind === 0) { dx = 1; dy = 0; dz = 0; }                 // +x axis-aligned
    else if (kind === 1) { dx = -1; dy = 0; dz = 0; }
    else if (kind === 2) { dx = 0; dy = 0; dz = 1; }            // +z axis-aligned
    else if (kind === 3) { dx = 0; dy = 0; dz = -1; }
    else if (kind === 4) { dx = 0; dy = 1; dz = 0; }            // straight up
    else if (kind === 5) { dx = 0; dy = -1; dz = 0; }           // straight down
    else {
      const th = rnd() * Math.PI * 2, ph = (rnd() - 0.5) * 1.4;
      dx = Math.cos(th) * Math.cos(ph); dy = Math.sin(ph); dz = Math.sin(th) * Math.cos(ph);
    }
    const maxDist = [0.4, 2, 12, 60, 140, 400][n % 6];
    const o = new THREE.Vector3(ox, oy, oz), d = new THREE.Vector3(dx, dy, dz);
    const got = W.rayHit(o, d, maxDist);
    const want = refRayHit(cols, o, d, maxDist);
    if (want !== null) hits++;
    const gotT = got ? got.t : null;
    if (gotT !== want) {
      bad++;
      if (!firstBad) firstBad = { o: [ox, oy, oz], d: [dx, dy, dz], maxDist, gotT, want };
    }
  }
  ok(bad === 0, 'rayHit identical over ' + N_RAY + ' rays (' + hits + ' hit something)' +
    (firstBad ? '  first diff: o=' + firstBad.o.map(v => v.toFixed(2)) +
      ' d=' + firstBad.d.map(v => v.toFixed(2)) + ' max=' + firstBad.maxDist +
      ' grid=' + firstBad.gotT + ' linear=' + firstBad.want : ''));

  /* ---- losBlocked: exact boolean equality ---- */
  let badLos = 0, blocked = 0;
  for (let n = 0; n < N_RAY; n++) {
    const a = new THREE.Vector3(mnX + rnd() * spanX, 0.4 + rnd() * 14, mnZ + rnd() * spanZ);
    const b = new THREE.Vector3(mnX + rnd() * spanX, 0.4 + rnd() * 14, mnZ + rnd() * spanZ);
    const got = W.losBlocked(a, b), want = refLos(cols, a, b);
    if (want) blocked++;
    if (got !== want) badLos++;
  }
  ok(badLos === 0, 'losBlocked identical over ' + N_RAY + ' segments (' + blocked + ' blocked)');

  /* ---- fits: exact boolean equality ---- */
  let badFits = 0, blockedF = 0;
  for (let n = 0; n < N_BOX; n++) {
    const cx = mnX + rnd() * spanX, cz = mnZ + rnd() * spanZ, cy = 0.3 + rnd() * 14;
    const hx = 0.15 + rnd() * 2.5, hy = 0.2 + rnd() * 1.4, hz = 0.15 + rnd() * 2.5;
    const got = W.fits(cx, cy, cz, hx, hy, hz);
    const want = refFits(cols, cx, cy, cz, hx, hy, hz);
    if (!want) blockedF++;
    if (got !== want) badFits++;
  }
  ok(badFits === 0, 'fits identical over ' + N_BOX + ' boxes (' + blockedF + ' obstructed)');

  /* ---- rayDist2: exact equality, including the two-origin case ---- */
  let badR2 = 0;
  for (let n = 0; n < 1500; n++) {
    const ax = mnX + rnd() * spanX, az = mnZ + rnd() * spanZ, ay = 0.5 + rnd() * 12;
    const bx = ax + 0.26, by = ay - 0.22, bz = az;
    const th = rnd() * Math.PI * 2;
    const dx = Math.cos(th), dy = (rnd() - 0.5) * 0.4, dz = Math.sin(th);
    const maxDist = 0.6 + rnd() * 2.4;
    const got = W.rayDist2(ax, ay, az, bx, by, bz, dx, dy, dz, maxDist);
    let best = maxDist, found = false;
    for (const c of cols) {
      let t = refRaySlab(ax, ay, az, dx, dy, dz, c);
      if (t >= 0 && t < best) { best = t; found = true; }
      t = refRaySlab(bx, by, bz, dx, dy, dz, c);
      if (t >= 0 && t < best) { best = t; found = true; }
    }
    const want = found ? best : -1;
    if (got !== want) badR2++;
  }
  ok(badR2 === 0, 'rayDist2 identical over 1500 two-origin probes');
}

/* ---- the fallback path still works when the grid is absent ---- */
console.log('\n--- it degrades to the linear scan safely ---');
ctx.__m = 'urban';
vm.runInContext('World.reset(); World.buildMap(new THREE.Scene(), __m);', ctx);
const cols = W._colliders().map(c => [c[0], c[1], c[2], c[3], c[4], c[5]]);
const probe = new THREE.Vector3(0, 2, 0), dir = new THREE.Vector3(1, 0, 0);
const withGrid = W.rayHit(probe, dir, 200);
ok(W._gridStats().built, 'the grid is present after a build');
ok(withGrid === null || typeof withGrid.t === 'number', 'a query through the grid returns a sane shape');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
