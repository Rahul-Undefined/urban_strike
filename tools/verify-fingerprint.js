/* MAP FINGERPRINT GATE (v9.1)

   WHY THIS EXISTS
   ---------------
   Metro City is being rebuilt. Every other gate in this project answers the
   question "is the map correct?". None of them answers "did I change a map I
   was not supposed to touch?" — because until now no gate compared a map
   against a recorded previous state.

   HANDOFF sec.0 failure shape 3 is "a shared helper is edited for one caller".
   Metro shares seg/box/cyl/stairFlight/_stairwells/StaticMerge with Urban and
   Rural, and it shares CFG.LIFTS and tools/verify-batch budgets with Urban.
   An innocent-looking edit to any of those changes Urban silently, and Urban's
   own gates would still pass because Urban is still internally consistent —
   just different.

   WHAT IT DOES
   ------------
   Rebuilds urban and rural exactly as the browser does and asserts six numbers
   plus a collider-geometry hash are IDENTICAL to the recorded baseline. The
   hash covers every collider's six coordinates, so moving one wall by 1 cm
   fails this gate.

   Metro is DELIBERATELY NOT ASSERTED — it is the map under construction. Its
   figures are printed each run so the rebuild's cost is visible.

   IF THIS GOES RED
   ----------------
   You changed Urban or Rural. Do not update the baseline to make it pass —
   that is exactly the "never weaken a validator" rule in HANDOFF sec.4. Find the
   edit. The only legitimate reason to move a baseline is a deliberate,
   documented change to that map, in its own commit, with the reason written
   here.

   BASELINE RECORDED: v9.0 as shipped (urban-strike-v9_0-4), before any Metro
   rebuild work. Verified against a clean extract of that artifact.
*/
let THREE; try { THREE = require("three"); } catch (e) { console.log("SKIP (three unavailable)"); process.exit(0); }
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

function fakeCanvas(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==="canvas")return c;return function(){if(k==="createLinearGradient"||k==="createRadialGradient")return{addColorStop:function(){}};if(k==="measureText")return{width:10};if(k==="getImageData")return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==="canvas"?fakeCanvas():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);

/* Keep this list identical to index.html — see the v8.9 note in verify-lifts. */
["public/src/config/weapons.config.js","public/src/config/gameplay.config.js","public/src/config/loot.config.js",
 "public/src/config/world.config.js","public/src/config/maps-rural.config.js","public/src/config/maps-metro.config.js",
 "public/src/config/districts.config.js","public/src/config/index.js","public/src/environment/merge.js",
 "public/src/environment/world.js","public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js",
 "public/src/environment/metro.js","public/src/environment/access.js"]
 .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

function fingerprint(map) {
  const scene = new THREE.Scene();
  vm.runInContext(`World.reset&&World.isBuilt()&&World.reset();World.buildMap(__s,"${map}");`,
    Object.assign(ctx, { __s: scene }));
  const cols = ctx.World._colliders();
  let draws = 0, tris = 0, casters = 0, lights = 0;
  scene.traverse(o => {
    if (o.isLight) lights++;
    if (o.isMesh) {
      draws++; if (o.castShadow) casters++;
      const g = o.geometry;
      if (g && g.index) tris += g.index.count / 3;
      else if (g && g.attributes && g.attributes.position) tris += g.attributes.position.count / 3;
    }
  });
  /* TWO hashes, because one is not enough.

     colSig — every collider, every coordinate, rounded to 1 cm, in build order.

     meshSig — every RENDERED mesh: world position and bounding box. The first
     cut of this gate hashed colliders only, and the proof-of-failure test moved
     an urban runway marking (a `NC` non-colliding seg) by 1 cm and the gate
     stayed GREEN. Non-colliding geometry is most of the decorative surface of
     both finished maps; a gate blind to it would have let Metro work silently
     repaint Urban. Both hashes are asserted. */
  let colSig = 0;
  for (const c of cols) for (let i = 0; i < 7; i++) colSig = (colSig * 31 + Math.round((c[i] || 0) * 100)) | 0;

  let meshSig = 0;
  const acc = v => { meshSig = (meshSig * 31 + Math.round((v || 0) * 100)) | 0; };
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    acc(o.position.x); acc(o.position.y); acc(o.position.z);
    acc(o.rotation.x); acc(o.rotation.y); acc(o.rotation.z);
    acc(o.scale.x); acc(o.scale.y); acc(o.scale.z);
    const g = o.geometry;
    if (g) {
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      if (b) { acc(b.min.x); acc(b.min.y); acc(b.min.z); acc(b.max.x); acc(b.max.y); acc(b.max.z); }
    }
  });

  return { colliders: cols.length, draws, tris: Math.round(tris), casters, lights,
           bound: ctx.World.BOUND, colSig, meshSig };
}

/* ---- BASELINE — v9.0 as shipped. Do not edit to make a build pass. ---- */
const BASELINE = {
  /* v9.10: draws 103->108, casters 57->62, meshSig moved — 22 Urban facades
     recoloured. `colliders` and `tris` are UNCHANGED, which is what tells you
     this was materials and not geometry. Casters now sit exactly on their
     budget of 62; the next shadow-casting material has to free a batch first.
     v9.7: colSig only. The Civic apartment's roof bulkhead was split to open
     the stairwell exit — one wall became a shorter wall, so the checksum moves
     while the collider count and triangle total do not. That pattern is worth
     recognising: a changed sum with unchanged counts means geometry MOVED
     rather than appeared.
     v9.6: re-recorded with verify-untouched, same decision and same reasons —
     the SE high-rise cluster became the South Terminal, the vacant SW became
     Westbrook Stadium, and the Civic apartment staircase was rebuilt. See the
     note above BASELINE in tools/verify-untouched.js. */
  urban: { colliders: 3282, draws: 108, tris: 87396, casters: 62, lights: 7, bound: 100, colSig: 812696814, meshSig: -663657193 },
  rural: { colliders: 1066, draws: 32, tris: 54467, casters: 22, lights: 3, bound: 150, colSig: -956236117, meshSig: -2029443105 }
};

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  PASS  " + m)) : (fail++, console.log("  FAIL  " + m)); };

Object.keys(BASELINE).forEach(map => {
  console.log("\n--- [" + map + "] fingerprint (must be unchanged) ---");
  const now = fingerprint(map), was = BASELINE[map];
  Object.keys(was).forEach(k => {
    ok(now[k] === was[k], map + ": " + k + " = " + now[k] + (now[k] === was[k] ? "" : "  EXPECTED " + was[k]));
  });
});

/* Metro is the map under construction — reported, never asserted. */
console.log("\n--- [metro] current figures (informational, not asserted) ---");
const m = fingerprint("metro");
console.log("        colliders=" + m.colliders + "  draws=" + m.draws + "  tris=" + m.tris +
            "  casters=" + m.casters + "  lights=" + m.lights + "  bound=" + m.bound);
console.log("        budgets: draws<=45  tris<=26000  casters<=22  lights<=6   (tools/verify-batch.js)");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
