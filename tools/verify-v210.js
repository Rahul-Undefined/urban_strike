/* verify-v210 — v2.10: Kasbah's quarters, colours, house numbers and map plan;
   the Killhouse's mirrored layout; the stronger Visor L2. Offline (builds the
   maps with real three, the way server/lib/bots.js does).

   Run: node tools/verify-v210.js */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }

function build(map) {
  const ctx = { console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
    performance: { now: () => Date.now() },
    document: { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {}, width: 10, data: new Uint8ClampedArray(4) }) }), style: {} }) },
    navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval };
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  const bsrc = fs.readFileSync(path.join(ROOT, 'server/lib/bots.js'), 'utf8');
  const files = [...bsrc.matchAll(/'(public\/src\/[^']+\.js)'/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/config/districts.config.js'), 'utf8'), ctx);
  ctx.__sc = new THREE.Scene(); vm.runInContext('World.buildMap(__sc, "' + map + '")', ctx);
  return ctx;
}

console.log('--- Kasbah ---');
const K = build('kasbah'), W = K.World, P = W.mapPlan, CFG = K.CFG;
const H = W.KASBAH.houses;
ok(H.length >= 100, 'every building with a door is numbered [' + H.length + ']');
ok(H.every((h, i) => h.n === i + 1) && new Set(H.map(h => h.label)).size === H.length, 'numbers run 01..' + H.length + ' with no gap or repeat');
ok(H.filter(h => h.n < 10).every(h => h.label.length === 2 && h.label[0] === '0'), 'one-digit numbers are written 01..09');
let plates = null; K.__sc.traverse(o => { if (o.name === 'kasbahHouseNumbers') plates = o; });
ok(plates && plates.geometry.index.count / 6 === H.length, 'one plate per house, in ONE mesh (one draw call) [' + (plates ? plates.geometry.index.count / 6 : 0) + ']');
/* every plate sits on its house's main door face, just outside the wall, above the door */
let badPlate = 0;
if (plates) {
  const pa = plates.geometry.attributes.position.array;
  H.forEach((h, i) => {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 4; k++) { cx += pa[(i * 4 + k) * 3]; cy += pa[(i * 4 + k) * 3 + 1]; cz += pa[(i * 4 + k) * 3 + 2]; }
    cx /= 4; cy /= 4; cz /= 4;
    const out = (cx - h.door[0]) * h.door[2] + (cz - h.door[1]) * h.door[3];
    const along = Math.hypot(cx - h.door[0] - h.door[2] * out, cz - h.door[1] - h.door[3] * out);
    if (!(out > 0.03 && out < 0.15 && cy - h.y0 > 2.0 && cy - h.y0 < 3.8 && along < 2.4)) badPlate++;
  });
}
ok(badPlate === 0, 'every plate is on its house\u2019s main door face, outside the wall, at door-head height [' + badPlate + ' off]');
const quarters = [...new Set(H.map(h => h.d))];
ok(quarters.length === 9, 'houses stand in all nine quarters [' + quarters.join(',') + ']');
const byQ = {}; H.forEach(h => { (byQ[h.d] = byQ[h.d] || []).push(h.n); });
ok(Object.values(byQ).every(ns => ns[ns.length - 1] - ns[0] === ns.length - 1), 'each quarter owns one unbroken block of numbers');
const hexBy = {}; H.forEach(h => { (hexBy[h.d] = hexBy[h.d] || new Set()).add(h.hex); });
const allHex = new Set(H.map(h => h.hex));
ok(allHex.size >= 25, 'the houses are painted in ' + allHex.size + ' colours (was 7 sandy tones)');
const pal = W.KASBAH.districts;
/* a quarter's dominant colour is not another quarter's dominant colour */
const dom = {}; Object.keys(byQ).forEach(q => { const c = {}; H.filter(h => h.d === q).forEach(h => { c[h.hex] = (c[h.hex] || 0) + 1; }); dom[q] = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; });
ok(new Set(Object.values(dom)).size === Object.keys(dom).length, 'every quarter has its own dominant colour [' + Object.keys(dom).map(q => q + ':' + Number(dom[q]).toString(16)).join(' ') + ']');
ok(P && P.districts.length === 9 && P.blocks.length >= H.length && P.houses.length === H.length && P.roads.length >= 20,
  'the M-map plan: 9 quarters, ' + (P ? P.roads.length : 0) + ' streets, ' + (P ? P.blocks.length : 0) + ' footprints, ' + (P ? P.houses.length : 0) + ' numbers');
ok(P.districts.every(d => Array.isArray(d.lab)), 'every quarter has a label anchor (names never sit on a number)');
const C2 = require(path.join(ROOT, 'public/src/config/index.js'));
ok(JSON.stringify(C2.MAPS_KASBAH.DISTRICTS.map(d => d.name)) === JSON.stringify(pal.map(d => d.name)), 'the config\u2019s quarters are the builder\u2019s (generated, not typed)');
ok(K.DISTRICTS.nameAt(0, 0, 'kasbah') === 'SOUK SQUARE' && K.DISTRICTS.nameAt(-60, -60, 'kasbah') === 'BLUE MEDINA' && K.DISTRICTS.nameAt(63, 63, 'kasbah') === 'CARAVANSERAI',
  'the dial names the quarter you stand in [' + K.DISTRICTS.nameAt(-60, -60, 'kasbah') + ']');
ok(C2.MAPS_KASBAH.LOOT_POINTS.length >= 250 && C2.MAPS_KASBAH.AIRDROP_POINTS.length >= 28,
  'more loot and drop points [' + C2.MAPS_KASBAH.LOOT_POINTS.length + ' loot (was 155), ' + C2.MAPS_KASBAH.AIRDROP_POINTS.length + ' drops (was 19)]');
const render = C2.MAPS.kasbah.render;
const yellowness = c => { const r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255; return (r + g) / 2 - b; };
ok(yellowness(render.fogColor) < 10 && yellowness(render.sunColor) < 40, 'the light is no longer amber [fog ' + yellowness(render.fogColor) + ', sun ' + yellowness(render.sunColor) + ']');
/* another map built after Kasbah must not inherit its plan */
vm.runInContext('World.reset && World.reset(); World.buildMap(__sc, "killhouse")', K);
ok(K.World.mapPlan === null, 'a map built after Kasbah does not inherit its plan');

console.log('--- Killhouse ---');
const src = fs.readFileSync(path.join(ROOT, 'public/src/environment/killhouse.js'), 'utf8');
const plan = JSON.parse('[' + src.slice(src.indexOf('var PLAN = [') + 12, src.indexOf('];', src.indexOf('var PLAN = ['))).replace(/\/\*[\s\S]*?\*\//g, '').replace(/'/g, '"') + ']');
const walls = plan.filter(p => p[4] === 'w');
ok(walls.length <= 12, 'partitions cut 23 -> ' + walls.length);
ok(plan.every(p => plan.some(q => Math.abs(q[0] + p[0]) < 1e-6 && Math.abs(q[1] + p[1]) < 1e-6 && q[2] === p[2] && q[3] === p[3] && q[4] === p[4])),
  'the plan is point-symmetric: every piece at (x,z) has its twin at (-x,-z)');
const KC = C2.MAPS_KILLHOUSE;
ok(C2.MAPS && /PART_H = 3\.5/.test(src), 'partition height unchanged (3.5 m)');
ok(KC.SPAWNS.filter(s => s[3] === 'a').length === KC.SPAWNS.filter(s => s[3] === 'b').length, 'both sides spawn the same number of ways');

console.log('--- Visor L2 ---');
const V = C2.GEAR.visor2;
ok(V.range === 80 && V.coneDeg === 120 && V.head === true && V.radar === true, 'Visor L2: 80 m, 120 deg cone, head, radar');
const sys = fs.readFileSync(path.join(ROOT, 'public/src/weapons/system.js'), 'utf8');
ok(/V\.head && r\.headPos/.test(sys), 'the steered round goes to the head mesh castRay tests');
const mm = fs.readFileSync(path.join(ROOT, 'public/src/ui/minimap.js'), 'utf8');
ok((mm.match(/visor2On/g) || []).length >= 3, 'the dial and the M map both show enemies while it is worn');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
