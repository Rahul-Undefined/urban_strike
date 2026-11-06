/* gen-urbansmall2-points — v2.11. Urban Small 2's EXTRA loot and drop points
   (Rahul: "loot spots badha dena h, drop badha dena h").

   The base tables are Urban Small's, turned a quarter (config/index.js). This
   adds points read back from the BUILT, turned geometry — never typed:
     ROOM LOOT   ground-floor floor inside a building (a roof or slab 2.3-14 m
                 overhead, walls near), on a floor with clearance for the item;
     STREET LOOT open ground with a clear sky, every ~24 m;
     DROPS       a clear 2.1 m landing disc under an open sky, 30 m apart.
   Every point is at least 6 m (room loot) / 24 m (street loot) / 30 m (drops) from every existing
   point, and passes the same support / clearance / landing tests verify-map
   applies.

   Run: node tools/gen-urbansmall2-points.js [--write] */
'use strict';
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
ctx.__sc = new THREE.Scene(); vm.runInContext('World.buildMap(__sc, "urbansmall2")', ctx);
const cols = ctx.World._colliders();
/* the base tables, turned (exactly what config/index.js builds) */
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const S = CFG.MAPS_URBANSMALL;
const baseLoot = S.LOOT_POINTS.map(p => [p[2], p[1], -p[0], p[3]]);
const baseAir = S.AIRDROP_POINTS.map(p => [p[1], -p[0]]);
const LIM = 102;

function overlap(x, y, z, hx, hy, hz, c) { return x + hx > c[0] + 0.02 && x - hx < c[3] - 0.02 && y + hy > c[1] + 0.02 && y - hy < c[4] - 0.02 && z + hz > c[2] + 0.02 && z - hz < c[5] - 0.02; }
function supportAt(x, y, z) { for (const c of cols) if (x >= c[0] - 0.05 && x <= c[3] + 0.05 && z >= c[2] - 0.05 && z <= c[5] + 0.05 && c[4] >= y - 0.85 && c[4] <= y - 0.30) return true; return false; }
function itemClear(x, y, z) { for (const c of cols) if (overlap(x, y + 0.2, z, 0.45, 0.3, 0.45, c)) return false; return true; }
function standClear(x, z) { for (const c of cols) if (c[4] > 0.35 && overlap(x, 0.95, z, 0.45, 0.86, 0.45, c)) return false; return true; }
function overhead(x, z) { for (const c of cols) if (x >= c[0] && x <= c[3] && z >= c[2] && z <= c[5] && c[1] >= 2.3 && c[1] <= 14) return true; return false; }
function skyClear(x, z, r) { for (const c of cols) if (c[4] > 0.5 && x + r > c[0] && x - r < c[3] && z + r > c[2] && z - r < c[5]) return false; return true; }
function landingClear(x, z) { for (const c of cols) if (overlap(x, 1.2, z, 1.05, 0.95, 1.05, c)) return false; return true; }
/* walls on two or more sides within 6 m: a room, not an underpass or an awning */
function enclosed(x, z) {
  let sides = 0;
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => {
    for (let t = 0.6; t <= 6; t += 0.4) {
      const px = x + d[0] * t, pz = z + d[1] * t;
      if (cols.some(c => c[1] < 1.2 && c[4] > 2.0 && px >= c[0] && px <= c[3] && pz >= c[2] && pz <= c[5])) { sides++; break; }
    }
  });
  return sides >= 3;
}

const loot = [], air = [];
const farLoot = (x, y, z, d) => baseLoot.concat(loot).every(q => Math.hypot(q[0] - x, q[2] - z) >= d || Math.abs(q[1] - y) > 1.5);
for (let x = -LIM; x <= LIM; x += 2) for (let z = -LIM; z <= LIM; z += 2) {
  const y = 0.55;
  if (!supportAt(x, y, z) || !itemClear(x, y, z) || !standClear(x, z)) continue;
  if (overhead(x, z)) {
    if (enclosed(x, z) && farLoot(x, y, z, 6)) loot.push([x, y, z, 'h']);
  } else if (skyClear(x, z, 0.8) && farLoot(x, y, z, 24)) loot.push([x, y, z, 'h']);
}
for (let x = -96; x <= 96; x += 4) for (let z = -96; z <= 96; z += 4) {
  if (!landingClear(x, z) || !skyClear(x, z, 2.4) || !supportAt(x, 1.35 - 0.8, z) && !cols.some(c => x >= c[0] && x <= c[3] && z >= c[2] && z <= c[5] && c[4] >= -0.1 && c[4] <= 0.3)) continue;
  if (baseAir.concat(air).every(q => Math.hypot(q[0] - x, q[1] - z) >= 30)) air.push([x, z]);
}
const indoor = loot.filter(l => overhead(l[0], l[2])).length;
console.log('EXTRA LOOT: ' + loot.length + ' (' + indoor + ' in rooms, ' + (loot.length - indoor) + ' on the street) on top of ' + baseLoot.length);
console.log('EXTRA DROPS: ' + air.length + ' on top of ' + baseAir.length);
if (WRITE) {
  const fmt = (arr, per) => arr.map((r, i) => (i % per === 0 ? '\n      ' : ' ') + JSON.stringify(r).replace(/,/g, ', ') + ',').join('').replace(/,$/, '');
  fs.writeFileSync(path.join(ROOT, 'public/src/config/maps-urbansmall2.config.js'), `(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* URBAN SMALL 2 — v2.11. The EXTRA points, GENERATED by
     tools/gen-urbansmall2-points.js --write from the built, turned geometry.
     config/index.js adds them to Urban Small's own tables, turned a quarter.
     Do not hand-edit: change the map, re-run the generator, verify-map proves it.
     LOOT_POINTS [x, y, z, class]: ground-floor rooms (6 m apart) and open
       street (16 m apart), every one 6 m+ from Urban Small's own points.
     AIRDROP_POINTS [x, z]: a clear landing disc under an open sky, 30 m apart. */
  var MAPS_URBANSMALL2_EXTRA = {
    LOOT_POINTS: [${fmt(loot, 4)}
    ],
    AIRDROP_POINTS: [${fmt(air, 6)}
    ],
    SPAWNS: []
  };
  return { MAPS_URBANSMALL2_EXTRA: MAPS_URBANSMALL2_EXTRA };
});
`);
  console.log('wrote public/src/config/maps-urbansmall2.config.js');
}
