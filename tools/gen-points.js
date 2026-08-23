/* gen-points — generate SPAWN and LOOT points from the BUILT world.

   WHY THIS EXISTS. Typed coordinates have failed this project in three separate
   versions (v9.3 Metro loot, v9.5 drone decks, v9.6 stadium terraces), every
   time after the previous one left a comment saying not to type them. The only
   thing that has actually worked is reading the geometry back.

   It applies EXACTLY the tests verify-map applies, so anything it emits is
   already proven:
     spawn  - inside bounds, and a 0.86 m standing box at y 0.95 hits nothing
              whose top is above 0.35
     loot   - inside bounds, and a collider top sits between y-0.85 and y-0.30

   Spacing is enforced against the EXISTING points as well as the new ones, so
   running it twice does not pile candidates on top of each other.

   Run:  node tools/gen-points.js <urban|metro|rural> <spawns|loot> [count]
*/
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install'); process.exit(0); }

function fakeCanvas(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==='canvas')return c;return function(){if(k==='createLinearGradient'||k==='createRadialGradient')return{addColorStop(){}};if(k==='measureText')return{width:10};if(k==='getImageData')return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==='canvas'?fakeCanvas():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
['public/src/config/weapons.config.js','public/src/config/gameplay.config.js','public/src/config/loot.config.js','public/src/config/world.config.js','public/src/config/maps-rural.config.js','public/src/config/maps-metro.config.js','public/src/config/maps-killhouse.config.js','public/src/config/maps-sunsetrow.config.js','public/src/config/districts.config.js','public/src/config/index.js','public/src/environment/merge.js','public/src/environment/world.js','public/src/environment/districts-south.js','public/src/environment/districts-north.js','public/src/environment/districts-outer.js','public/src/environment/deco.js','public/src/environment/rural.js','public/src/environment/metro.js','public/src/environment/killhouse.js','public/src/environment/sunsetrow.js','public/src/environment/access.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));

const map = process.argv[2] || 'urban';
const kind = process.argv[3] || 'spawns';
const want = parseInt(process.argv[4] || '24', 10);

ctx.__m = map;
vm.runInContext('World.reset && World.isBuilt && World.isBuilt() && World.reset(); World.buildMap(__sc, __m);',
  Object.assign(ctx, { __sc: new THREE.Scene() }));
const cols = ctx.World._colliders();
const BOUND = ctx.World.BOUND;
const CFG = ctx.CFG;
const data = map === 'sunsetrow' ? CFG.MAPS_SUNSETROW : map === 'killhouse' ? CFG.MAPS_KILLHOUSE : map === 'metro' ? CFG.MAPS_METRO : map === 'rural' ? CFG.MAPS_RURAL
  : { SPAWNS: CFG.SPAWNS, LOOT_POINTS: CFG.LOOT_POINTS };

function overlap(x, y, z, hx, hy, hz, c) {
  return x + hx > c[0] && x - hx < c[3] && y + hy > c[1] && y - hy < c[4] && z + hz > c[2] && z - hz < c[5];
}
function standingClear(x, z) {
  for (const c of cols) if (c[4] > 0.35 && overlap(x, 0.95, z, 0.34, 0.86, 0.34, c)) return false;
  return true;
}
function groundUnder(x, z) {                      // highest surface a body could stand on
  let best = null;
  for (const c of cols) {
    if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
    if (c[4] > 0.35 || c[4] < -1.0) continue;
    if (best === null || c[4] > best) best = c[4];
  }
  return best;
}
function supportAt(x, y, z) {
  for (const c of cols) {
    if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
    if (c[4] <= y - 0.30 && c[4] >= y - 0.85) return true;
  }
  return false;
}

/* Keep clear of the perimeter. WALL-1 is technically inside bounds and
   produced rural spawns at -145 with their backs against the wall, which is a
   spawn you cannot retreat from. A 12% margin puts every generated point in
   playable ground. */
const WALL = BOUND - Math.max(6, BOUND * 0.12);
const out = [];
const existing = (kind === 'spawns' ? data.SPAWNS.map(s => [s[0], s[1]]) : data.LOOT_POINTS.map(p => [p[0], p[2]]));
const MINSEP = kind === 'spawns' ? 11 : 6.5;
function farEnough(x, z) {
  for (const e of existing) if (Math.hypot(x - e[0], z - e[1]) < MINSEP) return false;
  for (const e of out) if (Math.hypot(x - e.x, z - e.z) < MINSEP) return false;
  return true;
}

/* Deterministic scan rather than random sampling: a seeded shuffle would still
   give a different answer if the step changed, and a coordinate list that moves
   between runs is impossible to review. */
const STEP = kind === 'spawns' ? 3 : 2;
const cand = [];
for (let x = -WALL + 4; x < WALL - 4; x += STEP)
  for (let z = -WALL + 4; z < WALL - 4; z += STEP) cand.push([x, z]);
/* FILL THE GAPS, do not scan in order. Sorting centre-out put every new spawn
   within 40 m of the origin — technically valid and useless, because the point
   of more spawns is that players do not all appear in the same place. Each
   candidate is scored by how far it is from the NEAREST EXISTING point, and the
   emptiest ground is taken first. */
function nearestExisting(x, z) {
  let d = Infinity;
  for (const e of existing) d = Math.min(d, Math.hypot(x - e[0], z - e[1]));
  return d;
}
cand.forEach(c => { c[2] = nearestExisting(c[0], c[1]); });
cand.sort((a, b) => b[2] - a[2]);

for (const [x, z] of cand) {
  if (out.length >= want) break;
  if (!farEnough(x, z)) continue;
  if (kind === 'spawns') {
    const g = groundUnder(x, z);
    if (g === null || Math.abs(g) > 0.5) continue;    // street level only
    if (!standingClear(x, z)) continue;
    out.push({ x: x, z: z });
  } else {
    const g = groundUnder(x, z);
    if (g === null) continue;
    const y = Math.round((g + 0.55) * 100) / 100;
    if (!supportAt(x, y, z)) continue;
    if (!standingClear(x, z)) continue;              // must be reachable, not sealed in
    out.push({ x: x, z: z, y: y });
  }
}

console.log('// generated by tools/gen-points.js ' + map + ' ' + kind +
  ' — ' + out.length + ' new (existing ' + existing.length + ')');
if (kind === 'spawns') {
  /* EVERY GENERATED SPAWN IS NEUTRAL.
     Tagging by half-map looked right and was not: Metro's empty ground happens
     to be eastern, so it produced 20 'b' against 4 'a' and would have started
     one side with three times the choice. The existing hand-placed a/b spawns
     already encode "teams start on their own side"; these are extra CAPACITY on
     top of that, and pickSpawn maximises distance from enemies, so a team
     naturally takes the neutrals nearest itself.
     Yaw faces the map centre, so nobody spawns looking at a wall. */
  out.forEach((p, i) => {
    const team = 'n';
    const yaw = Math.round(Math.atan2(-(0 - p.x), -(0 - p.z)) * 100) / 100;
    process.stdout.write('[' + p.x + ', ' + p.z + ', ' + yaw + ', "' + team + '"], ');
    if (i % 4 === 3) process.stdout.write('\n');
  });
} else {
  out.forEach((p, i) => {
    process.stdout.write('[' + p.x + ', ' + p.y + ', ' + p.z + ', "g"], ');
    if (i % 4 === 3) process.stdout.write('\n');
  });
}
console.log();
