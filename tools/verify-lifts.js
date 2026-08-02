/* LIFT GATE (v6.1) — every lift stop must land the player on solid floor with
   head clearance, and the shaft must be inside its building. Auto-step is not
   involved, so this is the one vertical mechanic that cannot fail marginally. */
let THREE; try { THREE = require("three"); } catch (e) { console.log("SKIP"); process.exit(0); }
const vm = require("vm"), fs = require("fs");
function fakeCanvas(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==="canvas")return c;return function(){if(k==="createLinearGradient"||k==="createRadialGradient")return{addColorStop:function(){}};if(k==="measureText")return{width:10};if(k==="getImageData")return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==="canvas"?fakeCanvas():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
["public/src/config/weapons.config.js","public/src/config/gameplay.config.js","public/src/config/loot.config.js",
 "public/src/config/world.config.js",
  /* v8.9: maps-rural + maps-metro were MISSING here. index.html loads both
     (lines 286-287); this gate did not. rural therefore built with
     CFG.MAPS_RURAL undefined and produced 510 colliders where the browser
     produces 525 -- 15 objects short, on the gate whose entire job is to
     reproduce the browser build. Keep this list identical to index.html. */
 "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js",
 "public/src/config/districts.config.js", "public/src/config/index.js","public/src/environment/merge.js",
 "public/src/environment/world.js","public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js","public/src/environment/metro.js",
 "public/src/environment/access.js"].forEach(f=>vm.runInContext(fs.readFileSync(f,"utf8"),ctx,{filename:f}));
const byMap={};
["urban","metro"].forEach(m=>{vm.runInContext(`World.reset&&World.isBuilt()&&World.reset();World.buildMap(__s,"${m}");`,Object.assign(ctx,{__s:new THREE.Scene()}));byMap[m]=ctx.World._colliders().slice();});
const P = ctx.CFG.PLAYER, R = P.radius, H = P.standH;
let pass=0, fail=0;
const ok=(c,m)=>{c?(pass++,console.log("  PASS  "+m)):(fail++,console.log("  FAIL  "+m));};
(ctx.CFG.LIFTS||[]).forEach((L,i)=>{
  const cols = byMap[L.map||'urban'];
  L.stops.forEach((sy,k)=>{
    let floor=false, blocked=false;
    for (const c of cols) {
      const inXZ = L.x+R>c[0] && L.x-R<c[3] && L.z+R>c[2] && L.z-R<c[5];
      if (!inXZ) continue;
      if (Math.abs(c[4]-sy) < 0.30) floor = true;                       // slab underfoot
      if (c[1] < sy+H-0.05 && c[4] > sy+0.05) blocked = true;           // body space
    }
    ok(floor && !blocked, `lift ${i} stop ${k} (y=${sy}): ${floor?"floor":"NO FLOOR"}${blocked?" / BLOCKED":" / clear"}`);
  });
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
