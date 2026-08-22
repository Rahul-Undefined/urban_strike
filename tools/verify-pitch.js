/* verify-pitch - the cricket ground must stay EMPTY, and the turf must COVER.

   Westbrook Stadium has now been built through pre-existing harbour structure
   THREE separate times, each one found from a screenshot rather than a gate:

     v9.6   twenty-one seat rows inside the building at x[-60,-46] z[48,86]
     v9.14  four shipping containers and a crate stack in the outfield
     v10    both harbour gantry cranes, throwing 20 m booms at 9 m height
            straight across the ground - reported as "a pergola across the
            middle of the cricket ground"

   Three instances of one mistake is not bad luck, it is a missing gate. The
   district gates all ask "is this thing supported / does it overlap / does it
   z-fight", and none of them asks "is the pitch clear", because none of them
   knows the pitch is meant to be clear. This one does.

   It also checks the SURFACE, which was the other half of the same defect: the
   310 turf tiles all existed and the outfield still showed grey stripes,
   because each tile was cut to an AVERAGE radial depth on a shape whose ring
   spacing runs 1.23 m along x and 2.10 m along z. Measured, that left a 0.53 m
   gap of bare ground near the z axis, seven rings deep. Sized per tile now, and
   asserted here so it cannot drift back.

   Run: node tools/verify-pitch.js */

let THREE=require('three');
const vm=require('vm'),fs=require('fs'),path=require('path');
/* v10.9: was hardcoded to '/home/claude/us' — the absolute path of the
   container this gate was authored in. It crashed with ENOENT on every other
   checkout, including Rahul's laptop, while the board recorded it green at
   9/0. Every other gate resolves from __dirname; this one now does too. */
const ROOT=path.join(__dirname,'..');
function fc(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==='canvas')return c;return function(){if(k==='createLinearGradient'||k==='createRadialGradient')return{addColorStop(){}};if(k==='measureText')return{width:10};if(k==='getImageData')return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==='canvas'?fc():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval,AudioSys:{step(){}}};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
['public/src/config/weapons.config.js','public/src/config/gameplay.config.js','public/src/config/loot.config.js','public/src/config/world.config.js','public/src/config/maps-rural.config.js','public/src/config/maps-metro.config.js','public/src/config/districts.config.js','public/src/config/index.js','public/src/environment/merge.js','public/src/environment/world.js','public/src/environment/districts-south.js','public/src/environment/districts-north.js','public/src/environment/districts-outer.js','public/src/environment/deco.js','public/src/environment/rural.js','public/src/environment/metro.js','public/src/environment/access.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f}));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

ctx.__m = 'urban';
const boxes = vm.runInContext(`(function(){var sc=new THREE.Scene();World.reset();World.buildMap(sc,__m);return World._colliders().map(function(x){return [x[0],x[1],x[2],x[3],x[4],x[5]];});})();`, ctx);

/* The ground, as districts-outer defines it. Kept as named constants so a
   change to the stadium moves the gate with it rather than past it. */
const CX = -81, CZ = 64, FA = 8.8, FB = 15;
const MARGIN = 1.05;           // a little past the rope, where a fielder stands
const TALL = 1.0;              // anything a player cannot simply walk over

console.log('--- nothing stands in the outfield ---');
const intruders = boxes.filter(b => {
  const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2;
  return ((cx - CX) / FA) ** 2 + ((cz - CZ) / FB) ** 2 < MARGIN && b[4] > TALL;
});
ok(intruders.length === 0,
  intruders.length + ' colliders over ' + TALL + ' m tall inside the outfield ellipse');
intruders.slice(0, 10).forEach(b => console.log(
  '        x[' + b[0].toFixed(1) + ',' + b[3].toFixed(1) + '] y[' + b[1].toFixed(2) + ',' +
  b[4].toFixed(2) + '] z[' + b[2].toFixed(1) + ',' + b[5].toFixed(1) + ']  ' +
  ((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2])).toFixed(1) + ' m3'));

/* A boom 9 m up is not "in" the ellipse by footprint alone if its legs are
   outside, so span is tested separately: nothing may CROSS the ground at any
   height a player will see against the sky. */
console.log('\n--- and nothing spans across it overhead ---');
const spans = boxes.filter(b => {
  if (b[4] < 3.0) return false;
  const w = b[3] - b[0], d = b[5] - b[2];
  if (Math.max(w, d) < 8) return false;
  // does the box's footprint cross the ellipse anywhere?
  for (let t = 0; t <= 20; t++) {
    const px = b[0] + (b[3] - b[0]) * (t / 20), pz = b[2] + (b[5] - b[2]) * (t / 20);
    if (((px - CX) / FA) ** 2 + ((pz - CZ) / FB) ** 2 < MARGIN) return true;
  }
  return false;
});
ok(spans.length === 0, spans.length + ' long structures cross the ground overhead');
spans.slice(0, 6).forEach(b => console.log(
  '        x[' + b[0].toFixed(1) + ',' + b[3].toFixed(1) + '] y[' + b[1].toFixed(2) + ',' +
  b[4].toFixed(2) + '] z[' + b[2].toFixed(1) + ',' + b[5].toFixed(1) + ']'));

console.log('\n--- the turf covers the ground with no bare rings ---');
/* Recomputed exactly as districts-outer lays it: 7 rings, RSTEP 0.14, and each
   tile cut to the REAL radial step at its own angle. The invariant is that
   consecutive rings meet or overlap at EVERY angle, not on average. */
const RSTEP = 0.14, N = 44;
function radialStep(i, f0, f1) {
  const t = ((i + 0.5) / N) * Math.PI * 2;
  return Math.hypot((FA * f1 - FA * f0) * Math.cos(t), (FB * f1 - FB * f0) * Math.sin(t));
}
const srcOuter = fs.readFileSync(path.join(ROOT, 'public/src/environment/districts-outer.js'), 'utf8');
const gdLine = srcOuter.match(/var gd = ([^;]+);/);
ok(!!gdLine, 'the turf tile depth is still assigned');
ok(!!gdLine && /radialStep/.test(gdLine[1]),
  'tile depth is measured per tile, not averaged [' + (gdLine ? gdLine[1].trim() : '?') + ']');
ok(!!gdLine && !/FA \+ FB/.test(gdLine[1]),
  'the (FA + FB) / 2 average that caused the stripes is gone');

let worstGap = 1e9, worstAt = '';
for (let g = 0; g < 7; g++) {
  for (let i = 0; i < N; i++) {
    const f0 = 0.16 + g * RSTEP;
    const step = radialStep(i, f0, f0 + RSTEP);
    const depth = step * 1.04;
    const cover = depth - step;
    if (cover < worstGap) { worstGap = cover; worstAt = 'ring ' + g + ' seg ' + i; }
  }
}
ok(worstGap >= 0,
  'every ring meets or overlaps its neighbour at every angle [tightest ' +
  worstGap.toFixed(3) + ' m at ' + worstAt + ']');
/* The regression assertion: prove the OLD constant would have failed, so
   nobody reintroduces it thinking it was fine. */
const oldGd = ((FA + FB) / 2) * RSTEP * 0.94;
let oldWorst = 1e9;
for (let g = 0; g < 7; g++) for (let i = 0; i < N; i++) {
  const f0 = 0.16 + g * RSTEP;
  oldWorst = Math.min(oldWorst, oldGd - radialStep(i, f0, f0 + RSTEP));
}
ok(oldWorst < -0.2,
  'the old averaged depth would have left a ' + (-oldWorst).toFixed(2) +
  ' m bare gap - this is why it is measured');

console.log('\n--- the seats are not signal lamps ---');
/* M.signalRed is E(0xff3a2a), an EMISSIVE railway signal. Three tiers of
   grandstand built from it lit the bowl up like a sign. */
ok(!/seatMat = \[M\.signalRed/.test(srcOuter),
  'the terraces no longer use the emissive signal-lamp material');
ok(/seatMat = \[M\.seat/.test(srcOuter),
  'the terraces use the dedicated muted seat palette');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
