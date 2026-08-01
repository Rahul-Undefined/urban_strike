const THREE=require("three"),vm=require("vm"),fs=require("fs");
function fc(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==="canvas")return c;return function(){if(k==="createLinearGradient"||k==="createRadialGradient")return{addColorStop:function(){}};if(k==="measureText")return{width:10};if(k==="getImageData")return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==="canvas"?fc():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
["public/src/config/weapons.config.js","public/src/config/gameplay.config.js","public/src/config/loot.config.js","public/src/config/world.config.js","public/src/config/maps-rural.config.js","public/src/config/maps-metro.config.js","public/src/config/index.js","public/src/environment/merge.js","public/src/environment/world.js","public/src/environment/districts-south.js","public/src/environment/districts-north.js","public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js","public/src/environment/metro.js","public/src/environment/access.js"].forEach(f=>vm.runInContext(fs.readFileSync(f,"utf8"),ctx,{filename:f}));
for (const map of ["urban","rural","metro"]) {
  ctx.__m = map;
  const r = vm.runInContext(`(function(){
    var sc=new THREE.Scene();World.reset();World.buildMap(sc,__m);
    var root=sc;for(var i=0;i<sc.children.length;i++)if(sc.children[i].isGroup)root=sc.children[i];
    var draws=0,casters=0,tris=0,castTris=0,recv=0;
    root.traverse(function(o){ if(!o.isMesh)return; draws++;
      var t=(o.geometry&&o.geometry.index)?o.geometry.index.count/3:0; tris+=t;
      if(o.castShadow){casters++;castTris+=t;}
      if(o.receiveShadow)recv++; });
    return {draws:draws,casters:casters,tris:Math.round(tris),castTris:Math.round(castTris),recv:recv};
  })();`, ctx, {filename:"<s>"});
  console.log(`[${map}] draws=${r.draws} shadowCasters=${r.casters} recv=${r.recv} tris=${r.tris} shadowPassTris=${r.castTris}`);
  console.log(`        per-frame geometry submissions = ${r.draws + r.casters} (main + shadow pass)`);
}
