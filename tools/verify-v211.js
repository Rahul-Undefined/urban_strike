/* verify-v211 — URBAN SMALL 2 (v2.11). Offline, real three (as bots.js).

   1. THE TURN IS EXACT: every Urban Small 2 collider is an Urban Small
      collider turned (x, z) -> (z, -x) — box for box, nothing added or lost.
   2. THE MESHES TURNED WITH THEM: a downward ray onto Urban Small 2 hits the
      same roof height the colliders say, at the same rate Urban Small does at
      the un-turned spots.
   3. THE STATION MOVED: the railway station hall (Urban Small x 32..52,
      z -75.4..-67) stands on the WEST edge now.
   4. THE TABLES: spawns, loot, drops and lifts are Urban Small's turned, and
      there is more loot and more drops.
   5. THE LOOK IS ITS OWN AND DOES NOT LEAK: Urban Small 2 is built with the
      realistic set; Urban Small built afterwards uses its own colour skins.
   6. THE DISTRICTS turned with it: the dial names the place you stand.

   Run: node tools/verify-v211.js */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
function harness() {
  const ctx = { console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
    performance: { now: () => Date.now() },
    document: { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {}, width: 10, data: new Uint8ClampedArray(4) }) }), style: {} }) },
    navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval };
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  const bsrc = fs.readFileSync(path.join(ROOT, 'server/lib/bots.js'), 'utf8');
  const files = [...bsrc.matchAll(/'(public\/src\/[^']+\.js)'/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/config/districts.config.js'), 'utf8'), ctx);
  return ctx;
}
function build(ctx, map) { ctx.__sc = new THREE.Scene(); vm.runInContext('World.reset && World.isBuilt() && World.reset(); World.buildMap(__sc, "' + map + '")', ctx); ctx.__sc.updateMatrixWorld(true); return ctx; }
const key = c => c.slice(0, 6).map(v => v.toFixed(2)).join(',');

const A = build(harness(), 'urbansmall'), B = build(harness(), 'urbansmall2');
const ca = A.World._colliders(), cb = B.World._colliders();
console.log('--- 1. the turn ---');
const bag = new Map();
ca.forEach(c => { const r = [c[2], c[1], -c[3], c[5], c[4], -c[0]]; const k = key(r); bag.set(k, (bag.get(k) || 0) + 1); });
let miss = 0; cb.forEach(c => { const k = key(c); if (!bag.get(k)) miss++; else bag.set(k, bag.get(k) - 1); });
ok(ca.length === cb.length && miss === 0, 'all ' + cb.length + ' colliders are Urban Small\u2019s, each turned a quarter [' + miss + ' do not match]');
ok(B.World.builtMap === 'urbansmall2', 'the map reports itself as urbansmall2');
const sa = A.World._stairs(), sb = B.World._stairs();
ok(sa.length === sb.length && sa.every((f, i) => Math.abs(sb[i].sx - f.sz) < 1e-6 && Math.abs(sb[i].sz + f.sx) < 1e-6 && sb[i].dirX === f.dirZ && sb[i].dirZ === -f.dirX),
  'every stair record turned with its flight [' + sb.length + ']');
const shA = A.World.minimapShapes, shB = B.World.minimapShapes;
ok(shA.length === shB.length && shA.every((r, i) => Math.abs(shB[i][0] - r[1]) < 1e-6 && Math.abs(shB[i][3] + r[0]) < 1e-6), 'the minimap layer turned with them');

console.log('--- 2. the meshes ---');
function rayRate(ctx, pts) {
  const cols = ctx.World._colliders(), meshes = []; ctx.__sc.traverse(o => { if (o.isMesh) meshes.push(o); });
  const rc = new THREE.Raycaster(); let hit = 0;
  pts.forEach(p => {
    let top = -1e9; for (const q of cols) if (p[0] >= q[0] && p[0] <= q[3] && p[1] >= q[2] && p[1] <= q[5] && q[4] > top && q[4] < 55) top = q[4];
    rc.set(new THREE.Vector3(p[0], 60, p[1]), new THREE.Vector3(0, -1, 0));
    const h = rc.intersectObjects(meshes, false).filter(h => h.point.y < 55);
    if (h.length && (Math.abs(h[0].point.y - top) < 0.6 || h[0].point.y > top)) hit++;
  });
  return hit;
}
const ptsA = [];
for (let i = 0; i < ca.length && ptsA.length < 120; i += 9) { const k = ca[i]; if (k[3] - k[0] >= 3 && k[5] - k[2] >= 3 && k[4] >= 0.5) ptsA.push([(k[0] + k[3]) / 2, (k[2] + k[5]) / 2]); }
const ptsB = ptsA.map(p => [p[1], -p[0]]);
const hA = rayRate(A, ptsA), hB = rayRate(B, ptsB);
ok(hB === hA && hB >= ptsA.length * 0.7, 'a ray hits the mesh roof where the collider roof is at ' + hB + '/' + ptsB.length + ' turned spots (Urban Small: ' + hA + '/' + ptsA.length + ')');

console.log('--- 3. the station moved ---');
const inBox = (cs, x0, x1, z0, z1) => cs.filter(c => c[0] >= x0 && c[3] <= x1 && c[2] >= z0 && c[5] <= z1 && c[4] > 3).length;
const hallA = inBox(ca, 31, 53, -76, -66), hallB = inBox(cb, -76, -66, -53, -31);
ok(hallA > 10 && hallB === hallA, 'the station hall\u2019s ' + hallA + ' raised boxes stand on the WEST edge now (x -76..-66), none left on the north edge [' + inBox(cb, 31, 53, -76, -66) + ']');

console.log('--- 4. the tables ---');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const T1 = CFG.MAPS_URBANSMALL, T2 = CFG.MAPS_URBANSMALL2;
ok(T2.SPAWNS.length === T1.SPAWNS.length && T1.SPAWNS.every((s, i) => T2.SPAWNS[i][0] === s[1] && T2.SPAWNS[i][1] === -s[0] && T2.SPAWNS[i][3] === s[3]), 'spawns are Urban Small\u2019s, turned, sides kept');
ok(T2.LOOT_POINTS.length >= T1.LOOT_POINTS.length + 60, 'more loot: ' + T2.LOOT_POINTS.length + ' points (Urban Small ' + T1.LOOT_POINTS.length + ')');
ok(T2.AIRDROP_POINTS.length >= T1.AIRDROP_POINTS.length + 15, 'more drops: ' + T2.AIRDROP_POINTS.length + ' points (Urban Small ' + T1.AIRDROP_POINTS.length + ')');
const L1 = CFG.LIFTS.filter(l => l.map === 'urban'), L2 = CFG.LIFTS.filter(l => l.map === 'urbansmall2');
ok(L2.length === L1.length && L1.every((l, i) => L2[i].x === l.z && L2[i].z === -l.x), 'both lifts turned with their towers');
ok(CFG.MAPS.urbansmall2.longMatch && !CFG.isArena('urbansmall2') && CFG.timeOptionsFor('ffa', 'urbansmall2').join(',') === '10,15,30', 'a theatre: full loot rules, 10 / 15 / 30 minutes');

console.log('--- 5. the look ---');
let mats2 = new Set(), mats1 = new Set();
B.__sc.traverse(o => { if (o.isMesh && o.material) mats2.add(o.material.uuid); });
const R = B.World._us2Mats;
ok(R && Object.values(R).some(m => mats2.has(m.uuid)), 'Urban Small 2 is built in the realistic set (' + Object.values(R).filter(m => mats2.has(m.uuid)).length + ' of its materials in use)');
build(B, 'urbansmall');
B.__sc.traverse(o => { if (o.isMesh && o.material) mats1.add(o.material.uuid); });
ok(!Object.values(R).some(m => mats1.has(m.uuid)), 'Urban Small built AFTER it uses its own colour skins — the restyle does not leak');

console.log('--- 6. the districts ---');
const nm = (x, z, m) => A.DISTRICTS.nameAt(x, z, m);
const probe = [[40, -70], [-60, -85], [80, -20], [-20, 40]];
ok(probe.every(p => nm(p[0], p[1], 'urbansmall') === nm(p[1], -p[0], 'urbansmall2')), 'the dial names the same place at the turned spot [' + nm(40, -70, 'urbansmall') + ' -> ' + nm(-70, -40, 'urbansmall2') + ']');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
