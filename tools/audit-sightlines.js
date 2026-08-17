/* audit-sightlines - how far can you actually SEE, and how far can you actually
   SHOOT, on each map?

   Written for handoff item 9.3: "Metro sniper fog: snipers reach 999 m but night
   fog leaves a 250 m target ~97% obscured, so a miss reads as 'the bullet didn't
   reach'. Confirm the symptom before changing the atmosphere."

   Confirmed, and the magnitude was overstated - which is exactly why the
   handoff said to confirm it. The 97% figure is correct arithmetic for 250 m,
   but MEASURED, Metro's longest genuinely clear line between two spawn points
   is 173.7 m. There are no 250 m sightlines on that map to be obscured. At the
   real worst case the target is 82% obscured, not 97%.

   That is still a gap worth knowing about - Urban's longest clear line is
   188 m at 43% obscured, so a maximum-range shot on Metro is roughly twice as
   hard to read as the same shot on Urban. Whether that is a bug or the point of
   a night map is a look-at-it decision, and NOTHING HERE CHANGES THE
   ATMOSPHERE. It reports, so the decision can be made against numbers by
   somebody who has seen the game.

   The fog model is THREE.FogExp2, applied in world.js: a fragment at distance d
   keeps exp(-(density*d)^2) of its colour.

   Run: node tools/audit-sightlines.js */

let THREE=require('three');
const vm=require('vm'),fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
function fc(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==='canvas')return c;return function(){if(k==='createLinearGradient'||k==='createRadialGradient')return{addColorStop(){}};if(k==='measureText')return{width:10};if(k==='getImageData')return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,Int32Array,Infinity,isFinite,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==='canvas'?fc():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval,AudioSys:{step(){}}};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
['public/src/config/weapons.config.js','public/src/config/gameplay.config.js','public/src/config/loot.config.js','public/src/config/world.config.js','public/src/config/maps-rural.config.js','public/src/config/maps-metro.config.js','public/src/config/districts.config.js','public/src/config/index.js','public/src/environment/merge.js','public/src/environment/world.js','public/src/environment/districts-south.js','public/src/environment/districts-north.js','public/src/environment/districts-outer.js','public/src/environment/deco.js','public/src/environment/rural.js','public/src/environment/metro.js','public/src/environment/access.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f}));
const CFG=require(path.join(ROOT,'public/src/config/index.js'));

/* FogExp2: the proportion of a fragment's own colour that survives at range d.
   1.0 is perfectly clear, 0.0 is the fog colour and nothing else. */
function vis(d, k) { return Math.exp(-Math.pow(k * d, 2)); }
function fogFor(map) {
  const ov = (CFG.MAPS[map] || {}).render;
  return (ov && ov.fogDensity !== undefined) ? ov.fogDensity : CFG.RENDER.fogDensity;
}
console.log('map     spawns  longest CLEAR line   fog density   visibility there   obscured');
for(const map of ['metro','urban','rural']){
 ctx.__m=map;vm.runInContext('World.reset(); World.buildMap(new THREE.Scene(), __m);',ctx);
 const W=ctx.World;
 const S=(map==='metro'?CFG.MAPS_METRO.SPAWNS:map==='rural'?CFG.MAPS_RURAL.SPAWNS:CFG.SPAWNS);
 /* Highest surface under a point, so an eye sits on the deck a spawn is on
    rather than at an assumed height. */
 const cols = W._colliders();
 function groundAt(x, z) {
   let best = 0;
   for (const c of cols) {
     if (x <= c[0] || x >= c[3] || z <= c[2] || z >= c[5]) continue;
     if (c[4] > best && c[4] < 30) best = c[4];
   }
   return best;
 }
 let longest=0,pair=null,over150=0,n=0;
 for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
   /* SPAWNS entries are [x, z, rotationY, tag] - NOT [x, y, z]. The first cut
      of this tool read index 1 as a height and index 2 as a z, so it was
      measuring distances to a rotation in radians and reporting them as metres.
      Caught because Urban's "longest line" came back ending at z = 1.5707963,
      which is pi/2. Exactly the failure mode section 4.4 warns about: a number
      that looks plausible until you read what it is. Eye height is taken from
      the ground under each spawn instead. */
   const ay = groundAt(S[i][0], S[i][1]) + 1.6, by = groundAt(S[j][0], S[j][1]) + 1.6;
   const a=new THREE.Vector3(S[i][0],ay,S[i][1]);
   const b=new THREE.Vector3(S[j][0],by,S[j][1]);
   const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z); n++;
   if(!W.losBlocked(a,b)){ if(d>longest){longest=d;pair=[S[i],S[j]];} if(d>150)over150++; }
 }
 const k = fogFor(map);
 const v = vis(longest, k);
 console.log(map.padEnd(8) + String(S.length).padStart(5) + '   ' +
   (longest.toFixed(1) + ' m').padStart(14) + '   ' + k.toFixed(4).padStart(9) + '   ' +
   v.toFixed(3).padStart(14) + '   ' + ((1 - v) * 100).toFixed(0).padStart(6) + '%');
 console.log('         ' + n + ' spawn pairs tested, ' + over150 + ' clear lines over 150 m' +
   (pair ? '   longest between (' + pair[0][0] + ',' + pair[0][1] + ') and (' + pair[1][0] + ',' + pair[1][1] + ')' : ''));
 /* The weapon side of the same question. A range far past what the map can
    show is not a bug by itself - falloff still shapes the damage - but it is
    why "the bullet didn't reach" is the natural reading of a miss. */
 const longRanged = Object.keys(CFG.WEAPONS).filter(w => (CFG.WEAPONS[w].range || 0) > longest * 1.5);
 if (longRanged.length) console.log('         ' + longRanged.length +
   ' weapons out-range the longest sightline (' + longRanged.slice(0, 6).join(', ') + ')');
 console.log('');
}

console.log('visibility by distance, for reference:');
console.log('dist      day (' + CFG.RENDER.fogDensity.toFixed(4) + ')   metro night (' + fogFor('metro').toFixed(4) + ')');
[50, 100, 150, 175, 200, 250].forEach(d => {
  console.log(String(d).padStart(4) + ' m' + vis(d, CFG.RENDER.fogDensity).toFixed(3).padStart(13) +
    vis(d, fogFor('metro')).toFixed(3).padStart(18));
});
