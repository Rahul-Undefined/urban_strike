/* gen-vehicle-spots — v2.13. Where vehicles are parked on Urban.

   "Vehicles PUBG style mei road pe khade rahenge" — so they are parked ON THE
   ROADS, read from the map itself and never typed:
     * the road planes the builder laid (World.minimapGround, kind 'road' — the
       same rectangles the minimap draws), 7 m or wider and 20 m or longer;
     * at the kerb: a hull's half-width plus a step in from the road's edge,
       along the road, on the left of its direction of travel (so the two
       kerbs of one road face opposite ways);
     * every cell of the bay walkable in the map's walk graph (botnav.js), under
       open sky, and the hull box of the largest vehicle the bay may hold
       intersecting no collider;
     * clear of the railway: the hull of the largest vehicle the bay may hold
       never inside the body of a passing coach, anywhere round the loop (see
       v2.17 below);
     * 26 m or more from the next spot.
   A bay is "long" when a bus or a tank fits and the road is 8 m or wider.

   ===== v2.17 - THE RAILWAY RULE NEVER RAN =====
   The v2.13 rule was "7 m or more from the railway's own path". It read the
   path object for points and made a polyline of them, then skipped every
   stretch 90 m or longer as "not a real segment" — and on a 2 km loop nearly
   every straight is longer than that. So the rule tested almost nothing: 28
   bays ended up within 5 m of the rails, one of them (-20, -103.65) 0.5 m from
   the centre line, IN Sector 7 Central. A train drove through whatever was
   parked there, every lap, for four releases; nobody was hurt because a train
   only killed people. From v2.17 a train wrecks the vehicle it hits, so that
   bay became an explosion at the station every time something was dealt to it.
   Now the rails are read the way the trains read them (path.at, every half
   metre), and a bay is refused when the hull of the largest vehicle it may
   hold comes within RAIL_GAP of a coach body anywhere on the loop — on a
   curve a 12 m coach swings 1.3 m wider than on a straight, which is what
   caught the second bay (100.35, -87). The 26 kerb bays that run ALONGSIDE
   the line on the ring road stay: a bus there is 0.85 m clear of a passing
   coach, a tank 0.45 m.
   The test is applied to the bays ALREADY PICKED, not to the candidates, so
   every other bay is exactly where it was.

   Run: node tools/gen-vehicle-spots.js [--write] */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const Bots = require(path.join(ROOT, 'server/lib/bots.js'))({});
const Nav = require(path.join(ROOT, 'server/lib/botnav.js'))({ CFG, Bots });
const WRITE = process.argv.indexOf('--write') >= 0;
const out = {};

for (const map of CFG.VEHICLES.maps) {
  const nav = Nav.buildSync(map), cols = Bots.buildColliders(map);
  /* v2.13's reading of the railway, KEPT ON PURPOSE though it tests almost nothing (header, v2.17): it decides
     which candidates exist, the seeded shuffle runs over them, and changing either would move every bay. */
  const oldRail = [];
  (function walk(o, depth) {
    if (!o || depth > 4) return;
    if (Array.isArray(o)) { if (o.length >= 2 && typeof o[0] === 'number' && typeof o[1] === 'number') { oldRail.push(o.length >= 3 ? [o[0], o[2]] : [o[0], o[1]]); return; } o.forEach(x => walk(x, depth + 1)); return; }
    if (typeof o === 'object') { if (typeof o.x === 'number' && typeof o.z === 'number') { oldRail.push([o.x, o.z]); return; } Object.keys(o).forEach(k => walk(o[k], depth + 1)); }
  })(Bots.trainPath(map), 0);
  const segDist = (px, pz, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz || 1; let t = ((px - a[0]) * vx + (pz - a[1]) * vz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t); };
  const nearRailV213 = (x, z) => {
    for (let i = 0; i + 1 < oldRail.length; i++) if (Math.hypot(oldRail[i + 1][0] - oldRail[i][0], oldRail[i + 1][1] - oldRail[i][1]) < 90 && segDist(x, z, oldRail[i], oldRail[i + 1]) < 7) return true;
    if (oldRail.length > 2 && Math.hypot(oldRail[0][0] - oldRail[oldRail.length - 1][0], oldRail[0][1] - oldRail[oldRail.length - 1][1]) < 90 && segDist(x, z, oldRail[oldRail.length - 1], oldRail[0]) < 7) return true;
    return false;
  };
  /* the railway, as the trains themselves read it: a pose every half metre round the loop */
  const P = Bots.trainPath(map), rail = [];
  if (P && P.at) for (let sd = 0; sd < P.length; sd += 0.5) { const a = P.at(sd); rail.push([a.x, a.z, Math.cos(a.yaw), Math.sin(a.yaw)]); }
  const TR = (CFG.TRAIN && CFG.TRAIN[map]) || {}, COACH_HALF_L = 6.0, COACH_HALF_W = 1.5, RAIL_GAP = 0.35;
  /* would a coach body, anywhere on the loop, come within RAIL_GAP of this hull? */
  const railSweeps = (x, z, ry, L, W) => {
    if (!rail.length) return false;
    const fx = Math.sin(ry), fz = -Math.cos(ry), rx = Math.cos(ry), rz = Math.sin(ry), reach = Math.hypot(L, W) / 2 + COACH_HALF_L + COACH_HALF_W + 1;
    const pts = [];
    for (let a = -L / 2; a <= L / 2 + 1e-6; a += L / Math.max(2, Math.ceil(L / 0.4))) for (let b = -W / 2; b <= W / 2 + 1e-6; b += W / Math.max(2, Math.ceil(W / 0.4))) pts.push([x + fx * a + rx * b, z + fz * a + rz * b]);
    for (const c of rail) {
      if (Math.abs(c[0] - x) > reach || Math.abs(c[1] - z) > reach) continue;
      for (const q of pts) {
        const dx = q[0] - c[0], dz = q[1] - c[1], lx = dx * c[2] + dz * c[3], lz = -dx * c[3] + dz * c[2];
        if (Math.abs(lx) <= COACH_HALF_L + RAIL_GAP && Math.abs(lz) <= COACH_HALF_W + RAIL_GAP) return true;
      }
    }
    return false;
  };
  const railDist = (x, z) => { let b = 1e9; for (const c of rail) b = Math.min(b, Math.hypot(c[0] - x, c[1] - z)); return b; };
  const at = (x, z, h) => Nav.nodeAt(nav, x, z, h, 0.3);
  const bayClear = (x, z, h, ax, L, W) => {
    for (let a = -L / 2; a <= L / 2 + 1e-6; a += 0.5) for (let b = -W / 2; b <= W / 2 + 1e-6; b += 0.5) {
      const px = ax ? x + a : x + b, pz = ax ? z + b : z + a;
      if (at(px, pz, h) < 0) return false;
    }
    return true;
  };
  const hullClear = (x, y, z, ax, L, W, H) => {
    const hx = (ax ? L : W) / 2, hz = (ax ? W : L) / 2;
    for (const c of cols) if (x + hx > c[0] && x - hx < c[3] && z + hz > c[2] && z - hz < c[5] && y + H > c[1] + 0.02 && y + 0.45 < c[4] - 0.02) return false;
    return true;
  };
  const roads = Bots.groundFor(map).filter(r => r[4] === 'road').map(r => ({ x0: r[0], z0: r[1], x1: r[2], z1: r[3] }))
    .filter(r => Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 7 && Math.max(r.x1 - r.x0, r.z1 - r.z0) >= 20);
  const cand = [];
  for (const r of roads) {
    const ax = (r.x1 - r.x0) >= (r.z1 - r.z0);                 // true: the road runs along x
    const wide = ax ? r.z1 - r.z0 : r.x1 - r.x0, a0 = ax ? r.x0 : r.z0, a1 = ax ? r.x1 : r.z1;
    for (const side of [0, 1]) {                               // 0: the low kerb, 1: the high kerb
      for (let a = a0 + 8; a <= a1 - 8; a += 3) {
        const tryAt = (inset, L, W, H) => {
          const k = side ? (ax ? r.z1 : r.x1) - inset : (ax ? r.z0 : r.x0) + inset;
          const x = ax ? a : k, z = ax ? k : a;
          const n = Nav.nearest(nav, x, z, 0.1, 0.6, 0.5); if (n < 0 || !nav.reach[n]) return null;
          const h = nav.nh[n];
          if (h > 0.6 || h < -0.3 || Nav.roofed(nav, x, h, z) || nearRailV213(x, z)) return null;
          if (!bayClear(x, z, h, ax, L + 0.6, W + 0.4) || !hullClear(x, h, z, ax, L + 0.4, W + 0.3, H)) return null;
          return { x, y: h, z };
        };
        const small = tryAt(1.75, 4.6, 2.0, 1.9); if (!small) continue;
        const long = wide >= 8 ? tryAt(2.35, 10.8, 3.5, 3.2) : null;
        const c = long || small;
        /* left-hand traffic: the low kerb of an x road faces +x, the high kerb -x; the low kerb of a z road faces -z, the high +z */
        const ry = ax ? (side ? -Math.PI / 2 : Math.PI / 2) : (side ? Math.PI : 0);
        cand.push({ x: c.x, y: c.y, z: c.z, ax, ry, big: !!long, wide, score: (long ? 3 : 0) + Math.min(wide, 14) * 0.05 });
      }
    }
  }
  /* an even scatter: big bays first so the buses and the tank have somewhere */
  const picked = [];
  let seed = 4219; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const take = (c, gap) => { if (picked.every(q => Math.hypot(q.x - c.x, q.z - c.z) >= gap)) picked.push(c); };
  /* shuffled (seeded) so the picks are spread over the city, not swept from one corner */
  for (let i = cand.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
  cand.filter(c => c.big).forEach(c => { if (picked.filter(q => q.big).length < 30) take(c, 50); });
  cand.forEach(c => { if (picked.length < 90) take(c, 26); });
  /* v2.17: the railway rule, on the bays already picked (see the header) */
  const VT = CFG.VEHICLES.types, bigL = Math.max(VT.bus.len, VT.tank.len), bigW = Math.max(VT.bus.wid, VT.tank.wid);
  const refused = picked.filter(c => railSweeps(c.x, c.z, c.ry, c.big ? bigL : VT.car.len, c.big ? bigW : VT.car.wid));
  refused.forEach(c => { picked.splice(picked.indexOf(c), 1); console.log(map + ': bay refused, a train would hit what is parked there: (' + c.x.toFixed(2) + ', ' + c.z.toFixed(2) + ') ' + railDist(c.x, c.z).toFixed(1) + ' m from the centre line'); });
  out[map] = picked.map(c => [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), +c.ry.toFixed(4), c.big ? 1 : 0]);
  const q = [0, 0, 0, 0]; picked.forEach(c => { q[(c.x >= 0 ? 1 : 0) + (c.z >= 0 ? 2 : 0)]++; });
  console.log(map + ': ' + roads.length + ' roads, ' + cand.length + ' candidate bays -> ' + picked.length + ' spots (' + picked.filter(c => c.big).length + ' long enough for a bus or tank) | by quarter NW/NE/SW/SE ' + q.join('/') + ' | rail points read ' + rail.length);
}
if (WRITE) {
  const body = Object.keys(out).map(m => '    ' + m + ': [' + out[m].map((s, i) => (i % 4 === 0 ? '\n      ' : ' ') + JSON.stringify(s).replace(/,/g, ', ') + ',').join('').replace(/,$/, '') + '\n    ]').join(',\n');
  fs.writeFileSync(path.join(ROOT, 'public/src/config/vehicle-spots.config.js'), `(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* VEHICLE PARKING SPOTS — v2.13. GENERATED by tools/gen-vehicle-spots.js --write
     from the map's walk graph and proved against its colliders. Do not
     hand-edit: change the map, re-run the generator.
     [x, y, z, facing, long bay (1 = a bus or tank fits)] */
  var VEHICLE_SPOTS = {
${body}
  };
  return { VEHICLE_SPOTS: VEHICLE_SPOTS };
});
`);
  console.log('wrote public/src/config/vehicle-spots.config.js');
}
