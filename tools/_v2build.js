const vm=require('vm'),fs=require('fs');const THREE=require('three');
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>({getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){},width:10,data:new Uint8ClampedArray(4)})}),style:{}}),getElementById:()=>null,addEventListener(){}},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
const bsrc=fs.readFileSync('server/lib/bots.js','utf8');const files=[...bsrc.matchAll(/'(public\/src\/[^']+\.js)'/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i);
for(const f of files) vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
ctx.__sc=new THREE.Scene(); const t0=Date.now(); vm.runInContext('World.buildMap(__sc, "urban")',ctx);
let tris=0,meshes=0; ctx.__sc.traverse(o=>{if(o.isMesh){meshes++; const g=o.geometry; tris+= g.index? g.index.count/3 : g.attributes.position.count/3;}});
const V=ctx.World.V2; const kinds={}; V.buildings.forEach(b=>kinds[b.kind]=(kinds[b.kind]||0)+1);
console.log('built',Date.now()-t0,'ms colliders',ctx.World._colliders().length,'meshes',meshes,'tris',Math.round(tris),'buildings',V.buildings.length,JSON.stringify(kinds),'buses',V.buses.length);
