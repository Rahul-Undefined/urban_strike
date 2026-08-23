/* FLOATING PROP GATE (v9.1)

   THE BUG THIS EXISTS FOR
   -----------------------
   v8.20 shrank Metro's four towers from six 4 m floors to two 3.4 m floors —
   roof deck top 24.25 m down to 7.05 m — and rewrote the tower body, the
   skybridges and every loot height to match. It missed the rooftop prop block.
   Sixteen solid colliders (AC units, vent stacks, trim walls) stayed at
   24.25-26.75 m, hanging 17.3 m above the roofs they belonged to, for three
   releases.

   Every existing gate was green:
     verify-arch    — its floating test looks for STANDABLE DECKS with nothing
                      beneath. These are props, not decks, so it saw nothing.
     verify-batch   — they are inside the draw and triangle budget wherever
                      they sit; height is not a cost.
     verify-map     — no loot point was under them.
     verify-lifts   — no lift stop was near them.
     verify-climb   — not a staircase.
   Nothing in the suite asked "is this object above the thing it stands on".
   That is HANDOFF sec.0 failure shape 1 exactly: a gate passes and the browser
   disagrees, because no gate ever looked at the thing the player sees.

   In play the consequence was worse than a floating box. All four tower roofs
   — the map's primary elevated fighting positions — were completely BARE,
   because their cover was 18 m overhead. A sniper on any roof owned the entire
   deck with nothing to flank through.

   WHAT IT MEASURES
   ----------------
   For every compact solid collider whose underside sits above MIN_Y, find the
   highest solid beneath its footprint (widened by PAD so a cantilevered stair
   tread finds the tread below it). If nothing is within VOID metres, the prop
   is hanging in open air.

   Three exclusions, each earned during construction of this gate:
     PAD    — without it, every stair tread in the project reads as floating
              (771 false positives on urban alone).
     MAX_A  — decks and spans wider than this are verify-arch's job; that gate
              already judges whether a walkable surface is supported.
     embedded — a prop that INTERSECTS a solid is held by it. The mall water
              tanks pass through the roof slab rather than resting on it; they
              are seated, not floating.

   BUDGETS ARE RATCHETS (HANDOFF sec.4). All three maps measure zero today.
   They may fall, never rise. If a map genuinely needs a suspended object —
   a hanging sign, a gantry, a cable car — model its support, or raise the
   budget by the minimum in its own commit with the reason written HERE.
*/
let THREE; try { THREE = require("three"); } catch (e) { console.log("SKIP (three unavailable)"); process.exit(0); }
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

function fakeCanvas(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==="canvas")return c;return function(){if(k==="createLinearGradient"||k==="createRadialGradient")return{addColorStop:function(){}};if(k==="measureText")return{width:10};if(k==="getImageData")return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==="canvas"?fakeCanvas():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);

/* Keep this list identical to index.html — see the v8.9 note in verify-lifts. */
["public/src/config/weapons.config.js","public/src/config/gameplay.config.js","public/src/config/loot.config.js",
 "public/src/config/world.config.js","public/src/config/maps-rural.config.js","public/src/config/maps-metro.config.js","public/src/config/maps-killhouse.config.js","public/src/config/maps-sunsetrow.config.js",
 "public/src/config/districts.config.js","public/src/config/index.js","public/src/environment/merge.js",
 "public/src/environment/world.js","public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js","public/src/environment/rural.js",
 "public/src/environment/metro.js","public/src/environment/killhouse.js","public/src/environment/sunsetrow.js","public/src/environment/access.js"]
 .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

const VOID  = 3.0;   // metres of open air beneath a prop before it is "floating"
const MIN_Y = 1.2;   // ground-adjacent props are never floating
const MAX_A = 25;    // m2 — larger footprints are decks/spans, judged by verify-arch
const PAD   = 0.6;   // horizontal reach when looking for support (stair treads cantilever)

function floaters(map) {
  vm.runInContext(`World.reset&&World.isBuilt()&&World.reset();World.buildMap(__s,"${map}");`,
    Object.assign(ctx, { __s: new THREE.Scene() }));
  const cols = ctx.World._colliders().slice();
  const out = [];
  for (const c of cols) {
    const bot = c[1];
    if (bot < MIN_Y) continue;
    if ((c[3] - c[0]) * (c[5] - c[2]) > MAX_A) continue;
    let best = -1e9, embedded = false;
    for (const o of cols) {
      if (o === c) continue;
      const ox = Math.min(o[3], c[3] + PAD) - Math.max(o[0], c[0] - PAD);
      const oz = Math.min(o[5], c[5] + PAD) - Math.max(o[2], c[2] - PAD);
      if (ox <= 0.05 || oz <= 0.05) continue;
      if (o[1] < c[4] - 0.02 && o[4] > bot + 0.02) { embedded = true; break; }  // held by intersection
      if (o[4] > bot + 0.02) continue;
      if (o[4] > best) best = o[4];
    }
    if (embedded) continue;
    const gap = bot - (best > -1e8 ? best : 0);
    if (gap > VOID) out.push({ bot, gap, x: (c[0] + c[3]) / 2, z: (c[2] + c[5]) / 2 });
  }
  return out;
}

/* ---- RATCHETS. May fall, never rise. Reason required, written above. ---- */
const BUDGET = { urban: 0, rural: 0, metro: 0, killhouse: 0, sunsetrow: 0 };

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  PASS  " + m)) : (fail++, console.log("  FAIL  " + m)); };

for (const map of ["urban", "rural", "metro", "killhouse", "sunsetrow"]) {
  console.log("\n--- [" + map + "] floating props ---");
  const f = floaters(map);
  ok(f.length <= BUDGET[map],
    map + ": " + f.length + " props hang in open air (budget " + BUDGET[map] + ")");
  f.slice(0, 20).forEach(p => console.log("        FLOATING  underside=" + p.bot.toFixed(2) +
    "m  void=" + p.gap.toFixed(2) + "m  at (" + p.x.toFixed(1) + ", " + p.z.toFixed(1) + ")"));
  if (f.length) console.log("        -> seat it on the surface it belongs to, or model its support.");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
