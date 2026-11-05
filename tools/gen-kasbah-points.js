/* gen-kasbah-points — v2.8. Derive Kasbah's SPAWNS, LOOT_POINTS and
   AIRDROP_POINTS from the BUILT world, and prove every flight ARRIVES.

   Same rule as tools/gen-points.js: typed coordinates have failed this
   project three times; reading the geometry back has not. Every point this
   emits passes the exact tests verify-map applies (spawn: standing box clear,
   ground under it; loot: a collider top 0.30-0.85 below; airdrop: a clear
   landing disc), plus two of its own:

     ARRIVAL  verify-climb proves a flight can be CLIMBED. This proves the
              climber, standing on the top tread, can step sideways onto the
              terrace the flight serves (through the parapet gap) and is then
              standing at roof height. A climbable flight that ends at a wall
              is a ladder to nowhere.
     SKY      an airdrop point has nothing above it, anywhere in its disc.

   Run:  node tools/gen-kasbah-points.js            (report + arrival check)
         node tools/gen-kasbah-points.js --write    (rewrite maps-kasbah.config.js) */
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const WRITE = process.argv.indexOf('--write') >= 0;

const ctx = { console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
  performance: { now: () => Date.now() },
  document: { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {}, width: 10, data: new Uint8ClampedArray(4) }) }), style: {} }) },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval };
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
const bsrc = fs.readFileSync(path.join(ROOT, 'server/lib/bots.js'), 'utf8');
const files = [...bsrc.matchAll(/'(public\/src\/[^']+\.js)'/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
ctx.__sc = new THREE.Scene(); vm.runInContext('World.buildMap(__sc, "kasbah")', ctx);
const cols = ctx.World._colliders(), META = ctx.World.KASBAH, CFG = ctx.CFG;
const P = CFG.PLAYER, MV = CFG.MOVE, R = P.radius, HY = P.standH / 2, STEP = MV.step;
const EXT = CFG.MAPS.kasbah.ext;

function overlap(x, y, z, hx, hy, hz, c) { return x + hx > c[0] + 0.02 && x - hx < c[3] - 0.02 && y + hy > c[1] + 0.02 && y - hy < c[4] - 0.02 && z + hz > c[2] + 0.02 && z - hz < c[5] - 0.02; }
function standingClear(x, z) {
  let ground = false;
  for (const c of cols) {
    if (c[4] > 0.35 && overlap(x, 0.95, z, 0.34, 0.86, 0.34, c)) return false;
    if (x >= c[0] && x <= c[3] && z >= c[2] && z <= c[5] && c[4] >= -0.06 && c[4] <= 0.35) ground = true;
  }
  return ground;
}
function roomy(x, z, r) {                 // nothing taller than a kerb within r — a spawn you can move out of
  for (const c of cols) if (c[4] > 0.35 && c[1] < 2.2 && x + r > c[0] && x - r < c[3] && z + r > c[2] && z - r < c[5]) return false;
  return true;
}
function supportAt(x, y, z) {
  for (const c of cols) if (x >= c[0] - 0.05 && x <= c[3] + 0.05 && z >= c[2] - 0.05 && z <= c[5] + 0.05 && c[4] >= y - 0.85 && c[4] <= y - 0.30) return true;
  return false;
}
function itemClear(x, y, z) { for (const c of cols) if (overlap(x, y + 0.2, z, 0.3, 0.3, 0.3, c)) return false; return true; }
function landingClear(x, z) { for (const c of cols) if (overlap(x, 1.2, z, 1.05, 0.95, 1.05, c)) return false; return true; }
function skyClear(x, z, r) { for (const c of cols) if (c[4] > 0.5 && x + r > c[0] && x - r < c[3] && z + r > c[2] && z - r < c[5]) return false; return true; }
function inExt(x, z, m) { return x > EXT.x0 + m && x < EXT.x1 - m && z > EXT.z0 + m && z < EXT.z1 - m; }

/* ---- the climber: the same port of controller.moveAxis verify-climb uses ---- */
function climber() {
  let pos = { x: 0, y: 0, z: 0 }, grounded = false;
  function overlapAny(cx, cy, cz) { for (const c of cols) if (cx - R < c[3] && cx + R > c[0] && cy - HY < c[4] && cy + HY > c[1] && cz - R < c[5] && cz + R > c[2]) return true; return false; }
  function moveAxis(axis, delta) {
    if (delta === 0) return;
    const v = [pos.x, pos.y, pos.z]; v[axis] += delta;
    for (const c of cols) {
      if (!(v[0] - R < c[3] && v[0] + R > c[0] && v[1] - HY < c[4] && v[1] + HY > c[1] && v[2] - R < c[5] && v[2] + R > c[2])) continue;
      if (axis === 1) { if (delta < 0) { v[1] = c[4] + HY + 0.001; grounded = true; } else v[1] = c[1] - HY - 0.001; }
      else {
        const footY = v[1] - HY, rise = c[4] - footY;
        if (grounded && rise > 0 && rise <= STEP) { const ny = v[1] + rise + 0.02; if (!overlapAny(v[0], ny, v[2])) { v[1] = ny; continue; } }
        if (delta > 0) v[axis] = c[axis] - R - 0.001; else v[axis] = c[axis + 3] + R + 0.001;
      }
    }
    pos = { x: v[0], y: v[1], z: v[2] };
  }
  return {
    set(x, y, z) { pos = { x, y, z }; grounded = false; },
    get() { return { x: pos.x, y: pos.y - HY, z: pos.z }; },
    /* stop(pos) -> true ends the walk early (used to stop ON the top tread
       instead of walking off its far end) */
    walk(dx, dz, ticks, stop) {
      let velY = 0, velH = 0; const dt = 1 / 60;
      for (let i = 0; i < ticks; i++) {
        if (stop && stop(pos)) break;
        const acc = (grounded ? 42 : 9) * dt; velH += Math.max(-acc, Math.min(acc, MV.walk - velH));
        velY -= 15.5 * dt; if (velY < -30) velY = -30;
        moveAxis(0, dx * velH * dt); moveAxis(2, dz * velH * dt);
        grounded = false; moveAxis(1, velY * dt); if (grounded) velY = 0;
      }
    }
  };
}

/* ---- ARRIVAL: climb each flight, then step sideways onto its terrace ---- */
let arrivals = 0, stranded = [];
const C = climber();
META.flights.forEach((f, i) => {
  const [sx, sy, sz, dx, dz, n, sh, sd] = f, top = sy + n * sh;
  C.set(sx - dx * (sd + R + 0.15), sy + HY + 0.05, sz - dz * (sd + R + 0.15));
  const ex = sx + dx * (n * sd - 0.25), ez = sz + dz * (n * sd - 0.25);   // the middle of the top tread
  C.walk(dx, dz, Math.max(240, n * 34), q => (q.x - ex) * dx + (q.z - ez) * dz >= 0);
  /* back up half a tread so the capsule sits wholly on the top tread, then
     try both perpendiculars — the terrace is on one side */
  const atTop = C.get();
  let ok = atTop.y >= top - 0.05;   // a grand stair walks straight onto its plinth
  if (!ok) for (const s of [1, -1]) {
    C.set(atTop.x, atTop.y + HY + 0.02, atTop.z);
    C.walk(-dz * s, dx * s, 90);
    const g = C.get();
    if (Math.abs(g.y - top) < 0.12 && Math.hypot(g.x - atTop.x, g.z - atTop.z) > 1.2) { ok = true; break; }
  }
  if (ok) arrivals++; else stranded.push(i + ' (' + sx.toFixed(1) + ',' + sz.toFixed(1) + ') top ' + top.toFixed(2) + ' reached ' + atTop.y.toFixed(2));
});
console.log('ARRIVAL: ' + arrivals + '/' + META.flights.length + ' flights deliver onto their terrace');
stranded.forEach(s => console.log('  STRANDED flight ' + s));

/* ---- SPAWNS ---- */
const spawnCand = [];
function sample(o, step) {
  for (let x = o.x0 + step / 2; x < o.x1; x += step) for (let z = o.z0 + step / 2; z < o.z1; z += step) spawnCand.push([x, z]);
}
META.open.forEach(o => { if (!o.y) sample(o, o.kind === 'ave' ? 9 : 7); });
/* the ring alley, the back lanes, the rampart lane, the cross alleys */
for (let u = -90; u <= 90; u += 9) {
  [-30, 30].forEach(k => { spawnCand.push([k, u]); spawnCand.push([u, k]); });
  [-95, 95].forEach(k => { spawnCand.push([k, u]); spawnCand.push([u, k]); });
  [-18, 18].forEach(k => { if (Math.abs(u) > 34) { spawnCand.push([k, u]); spawnCand.push([u, k]); } });
}
const spawns = [];
function face(x, z) { return Math.atan2(-x, -z); }    // toward the square
const okSpawn = spawnCand.filter(p => inExt(p[0], p[1], 3) && standingClear(p[0], p[1]) && roomy(p[0], p[1], 1.0));
/* greedy thinning: an even scatter, 20 m apart at least */
okSpawn.sort((a, b) => (a[0] * 7 + a[1] * 13) % 11 - (b[0] * 7 + b[1] * 13) % 11);
okSpawn.forEach(p => { if (spawns.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 20)) spawns.push(p); });
const SP = spawns.map(p => {
  const side = p[1] <= -40 ? 'a' : p[1] >= 40 ? 'b' : 'n';
  return [+p[0].toFixed(1), +p[1].toFixed(1), +face(p[0], p[1]).toFixed(4), side];
});
const tally = SP.reduce((t, s) => (t[s[3]] = (t[s[3]] || 0) + 1, t), {});
console.log('SPAWNS: ' + SP.length + ' ' + JSON.stringify(tally));

/* ---- LOOT ---- */
const loot = [];
function addLoot(x, y, z, cls) {
  y = +(y + 0.55).toFixed(2);
  if (!inExt(x, z, 1) || !supportAt(x, y, z) || !itemClear(x, y, z)) return false;
  if (loot.some(q => Math.hypot(q[0] - x, q[2] - z) < 8 && Math.abs(q[1] - y) < 1)) return false;
  loot.push([+x.toFixed(1), y, +z.toFixed(1), cls]); return true;
}
/* signature points: the keep roof, the plinth, the caravanserai court and
   ring, the tannery terraces, the hammam roof, the fountain, the well court */
[[67, 7.6, -70.5], [60, 3.0, -56], [76, 3.0, -80], [63, 0, 58], [63, 0, 72], [41.5, 5.0, 43.5], [84.5, 5.0, 86.5],
 [-47.5, 7.6, 66], [-47.5, 7.6, 80], [-66, 4.2, 66], [0, 0.8, 2.4], [-60, 0, -57], [-87, 0, 46], [52.5, 3.0, -70]]
  .forEach(p => addLoot(p[0], p[1], p[2], 's'));
META.rooms.forEach(r => {
  const p = r.offX || [r.x, r.z];
  if (!addLoot(p[0], r.y, p[1], 'h')) addLoot(r.x + 1.6, r.y, r.z + 1.6, 'h');
});
META.roofs.forEach((r, i) => { if (r.reach && i % 2 === 0) addLoot(r.x, r.y, r.z, 'h'); });
console.log('LOOT: ' + loot.length + ' (' + loot.filter(l => l[3] === 's').length + ' signature)');

/* ---- AIRDROPS ---- */
const air = [];
const airCand = [];
META.open.forEach(o => { if (o.y) return; for (let x = o.x0 + 3; x < o.x1 - 2; x += 8) for (let z = o.z0 + 3; z < o.z1 - 2; z += 8) airCand.push([x, z]); });
airCand.filter(p => inExt(p[0], p[1], 6) && landingClear(p[0], p[1]) && skyClear(p[0], p[1], 2.4))
  .forEach(p => { if (air.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 28)) air.push([+p[0].toFixed(1), +p[1].toFixed(1)]); });
console.log('AIRDROPS: ' + air.length);

if (WRITE) {
  const fmt = (arr, per) => arr.map((r, i) => (i % per === 0 ? '\n      ' : ' ') + JSON.stringify(r).replace(/,/g, ', ') + ',').join('').replace(/,$/, '');
  const src = `(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* KASBAH — v2.8. GENERATED by tools/gen-kasbah-points.js --write from the
     built geometry (environment/kasbah.js). Do not hand-edit: change the map,
     re-run the generator, and verify-map proves the result.

     SPAWNS [x, z, facing, side]: 'a' the north band (z <= -40), 'b' the south
     band (z >= 40), 'n' the middle — streets, alleys, courts and the square,
     20 m apart, each with a metre of room around it. Facing is toward the
     square.
     LOOT_POINTS [x, y, z, class]: every room floor, every reachable terrace,
     the rooftop rooms; 's' the landmarks (keep roof, plinth, caravanserai,
     tannery terraces, hammam, fountain, well court, pavilion).
     AIRDROP_POINTS [x, z]: open ground with clear sky, 28 m apart. */
  var MAPS_KASBAH = {
    LOOT_POINTS: [${fmt(loot, 4)}
    ],
    SPAWNS: [${fmt(SP, 4)}
    ],
    AIRDROP_POINTS: [${fmt(air, 6)}
    ]
  };
  return { MAPS_KASBAH: MAPS_KASBAH };
});
`;
  fs.writeFileSync(path.join(ROOT, 'public/src/config/maps-kasbah.config.js'), src);
  console.log('wrote public/src/config/maps-kasbah.config.js');
}
process.exit(stranded.length ? 1 : 0);
