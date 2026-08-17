/* prof-rays — what the v10 broadphase actually bought.

   Correctness is proven by tools/verify-broadphase.js. This is the other half:
   whether the grid is worth having at all. Reported as a throughput figure and
   as a per-frame cost, because "3x faster" means nothing without knowing what
   the frame budget was being spent on.

   Run: node tools/prof-rays.js [map] */
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP'); process.exit(0); }
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function fakeCanvas(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==='canvas')return c;return function(){if(k==='createLinearGradient'||k==='createRadialGradient')return{addColorStop(){}};if(k==='measureText')return{width:10};if(k==='getImageData')return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,Int32Array,Infinity,isFinite,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==='canvas'?fakeCanvas():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval,AudioSys:{step(){}}};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
['public/src/config/weapons.config.js','public/src/config/gameplay.config.js','public/src/config/loot.config.js','public/src/config/world.config.js','public/src/config/maps-rural.config.js','public/src/config/maps-metro.config.js','public/src/config/districts.config.js','public/src/config/index.js','public/src/environment/merge.js','public/src/environment/world.js','public/src/environment/districts-south.js','public/src/environment/districts-north.js','public/src/environment/districts-outer.js','public/src/environment/deco.js','public/src/environment/rural.js','public/src/environment/metro.js','public/src/environment/access.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f}));

const MAP = process.argv[2] || 'urban';
ctx.__m = MAP;
vm.runInContext('World.reset(); World.buildMap(new THREE.Scene(), __m);', ctx);
const W = ctx.World;
const cols = W._colliders();
const st = W._gridStats();
console.log(MAP + ': ' + cols.length + ' colliders, grid ' + st.cells + ' cells, avg bucket ' + st.avg.toFixed(1) + '\n');

let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const N = 20000;
const origins = [], dirs = [];
for (let i = 0; i < N; i++) {
  origins.push(new THREE.Vector3(-90 + rnd() * 180, 0.5 + rnd() * 10, -90 + rnd() * 180));
  const th = rnd() * Math.PI * 2;
  dirs.push(new THREE.Vector3(Math.cos(th), (rnd() - 0.5) * 0.3, Math.sin(th)));
}
function bench(label, fn) {
  fn(200);                                 // warm
  const t0 = process.hrtime.bigint();
  fn(N);
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  console.log('  ' + label.padEnd(26) + ms.toFixed(1).padStart(8) + ' ms for ' + N +
    '   (' + (ms * 1000 / N).toFixed(2) + ' us each)');
  return ms;
}
console.log('rayHit, 140 m (the remote-shot tracer cast):');
const a = bench('with grid', n => { for (let i = 0; i < n; i++) W.rayHit(origins[i], dirs[i], 140); });
W._colliders().__x = 0;                    // no-op, keeps the array live
// force the linear path by clearing the grid
vm.runInContext('World._forceLinear && World._forceLinear();', ctx);
const hasForce = typeof W._forceLinear === 'function';
if (hasForce) {
  const b = bench('linear scan', n => { for (let i = 0; i < n; i++) W.rayHit(origins[i], dirs[i], 140); });
  console.log('\n  speedup: ' + (b / a).toFixed(1) + 'x');
  console.log('  a single 140 m cast went from ' + (b * 1000 / N).toFixed(2) + ' us to ' + (a * 1000 / N).toFixed(2) + ' us');
  vm.runInContext('World._rebuildGrid();', ctx);
} else {
  console.log('\n  (World._forceLinear not exposed; grid figure only)');
}
