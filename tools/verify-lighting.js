/* ===== v12.0 - PER-MAP LIGHTING ACTUALLY APPLIES, IN EVERY BUILD ORDER =====

   WHY THIS GATE EXISTS
   --------------------
   lighting() used to select render overrides via `World.builtMap || 'urban'`,
   and builtMap is null at the only moment that line runs (reset() clears it
   before, assignment happens after). Result: Metro's NIGHT override was dead
   code — every map built with urban daylight — and nothing red-flagged it,
   because no gate ever asked "did the map get ITS OWN sky". This one asks,
   for a sequence of builds in both directions, plus the two v12.0 repair
   surfaces (relight idempotence, reset clearing the stale sky).

   Uses REAL three (same harness as verify-fingerprint): light objects, Color,
   FogExp2 are the genuine articles, so a census here is the browser's census. */
let THREE; try { THREE = require("three"); } catch (e) { console.log("SKIP (three unavailable)"); process.exit(0); }
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  PASS  ' + msg); } else { fail++; console.log('  FAIL  ' + msg); } }

function fakeCanvas(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==="canvas")return c;return function(){if(k==="createLinearGradient"||k==="createRadialGradient")return{addColorStop:function(){}};if(k==="measureText")return{width:10};if(k==="getImageData")return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==="canvas"?fakeCanvas():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
["public/src/config/weapons.config.js","public/src/config/gameplay.config.js","public/src/config/loot.config.js",
 "public/src/config/world.config.js","public/src/config/maps-rural.config.js","public/src/config/maps-metro.config.js","public/src/config/maps-killhouse.config.js","public/src/config/maps-sunsetrow.config.js","public/src/config/maps-small.config.js","public/src/config/maps-medium.config.js",
 "public/src/config/districts.config.js","public/src/config/index.js","public/src/environment/merge.js",
 "public/src/environment/world.js","public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js",
 "public/src/environment/metro.js","public/src/environment/killhouse.js","public/src/environment/sunsetrow.js","public/src/environment/smallmaps.js","public/src/environment/medium.js","public/src/environment/access.js"]
 .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

const CFG = ctx.CFG;
function census(scene){
  let lights=0, hemi=null, sun=null;
  scene.traverse(o=>{ if(o.isLight){ lights++; if(o.isHemisphereLight)hemi=o; if(o.isDirectionalLight)sun=o; }});
  return { lights, hemi, sun, bg: scene.background, fog: scene.fog,
           reg: ctx.World.lightCount ? ctx.World.lightCount() : -1 };
}
function build(map){ vm.runInContext(`World.buildMap(__s,"${map}")`, Object.assign(ctx,{__s:ctx.__s})); return census(ctx.__s); }
function expected(map){
  const R = Object.assign({}, CFG.RENDER, (CFG.MAPS[map]||{}).render || {});
  return R;
}
function checkMap(tag, map, c){
  const R = expected(map);
  ok(c.bg && c.bg.getHex() === new THREE.Color(R.sky).getHex(),
    tag+': background is the map\'s own sky (#'+(c.bg?c.bg.getHexString():'none')+' vs #'+new THREE.Color(R.sky).getHexString()+')');
  ok(c.fog && Math.abs(c.fog.density - R.fogDensity) < 1e-9,
    tag+': fog density is the map\'s own ('+(c.fog?c.fog.density:'none')+')');
  ok(!!c.hemi && c.hemi.color.getHex() === new THREE.Color(R.hemiSky).getHex(),
    tag+': hemisphere colour matches the map');
  ok(!!c.sun && Math.abs(c.sun.intensity - R.sunIntensity) < 1e-9,
    tag+': sun intensity matches the map');
  ok(c.lights >= 3, tag+': core light rig present ('+c.lights+' lights)');
  ok(c.reg === c.lights, tag+': the light registry matches the graph census ('+c.reg+'/'+c.lights+') — relight() and the sentinel depend on it');
}

console.log('--- sequence builds get each map\'s OWN lighting (the dead-override bug) ---');
ctx.__s = new THREE.Scene();
checkMap('urban first', 'urban', build('urban'));
const m = build('metro');
checkMap('metro after urban', 'metro', m);
ok(m.bg.getHex() !== new THREE.Color(CFG.RENDER.sky).getHex(),
  'metro NIGHT is actually different from urban daylight — the override is alive');
checkMap('urban after metro', 'urban', build('urban'));
checkMap('killhouse', 'killhouse', build('killhouse'));

console.log('--- relight(): idempotent, and repairs a de-lit world ---');
const before = census(ctx.__s);
vm.runInContext('World.relight(World.builtMap)', ctx);
const after = census(ctx.__s);
ok(after.lights === before.lights, 'relight on a healthy scene is a no-op by census ('+before.lights+' -> '+after.lights+')');
// simulate the field failure: strip every light, keep the meshes
vm.runInContext(`(function(){ var kill=[]; __s.traverse(function(o){ if(o.isLight) kill.push(o); }); kill.forEach(function(o){ (o.parent||__s).remove(o); }); })()`, ctx);
ok(census(ctx.__s).lights === 0, 'test rig de-lit the world (the screenshot state)');
vm.runInContext('World.relight(World.builtMap)', ctx);
const healed = census(ctx.__s);
checkMap('after relight repair', ctx.World.builtMap, healed);

console.log('--- reset() clears the stale sky ---');
vm.runInContext('World.reset()', ctx);
ok(ctx.__s.background === null && ctx.__s.fog === null,
  'a reset scene carries no background/fog — a failed rebuild cannot inherit the previous map\'s look');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
