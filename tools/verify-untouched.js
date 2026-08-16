/* UNTOUCHED GATE (v9.1) — proves that Metro work changed NOTHING else.
   ---------------------------------------------------------------------------
   Why this exists. The Metro rebuild edits one environment file and one map
   config, but it also has to add lift rows to gameplay.config.js, which is a
   SHARED file. HANDOFF failure shape #3 is "a shared helper is edited for one
   caller" — World.BOUND at 100 cost rural two thirds of its loot. There is no
   gate in this project that says "urban is bit-for-bit what it was", so an
   accidental edit to a shared config would be caught only by whichever urban
   gate happened to notice, or by nobody.

   This gate takes a fingerprint of every map that is NOT being worked on and
   fails if a single number moves. It is deliberately dumb: it does not know
   what is correct, only what is unchanged.

   Baselines were recorded from v9.0 BEFORE any Metro work began.
   To re-record after a DELIBERATE change to urban or rural:
       node tools/verify-untouched.js --record
   and paste the printed block over BASELINE. Re-recording is a decision, not
   a convenience: write the reason into the commit, the same way a budget rise
   is written into verify-batch.js. */

let THREE; try { THREE = require("three"); } catch (e) { console.log("SKIP"); process.exit(0); }
const vm = require("vm"), fs = require("fs");

function fakeCanvas(){const c={width:0,height:0,style:{}};const g=new Proxy({},{get:(t,k)=>{if(k==="canvas")return c;return function(){if(k==="createLinearGradient"||k==="createRadialGradient")return{addColorStop:function(){}};if(k==="measureText")return{width:10};if(k==="getImageData")return{data:new Uint8ClampedArray(4)};};},set:()=>true});c.getContext=()=>g;return c;}
const ctx={console,Math,Date,JSON,Object,Array,Float32Array,Uint32Array,Uint16Array,Uint8ClampedArray,THREE,performance:{now:()=>Date.now()},document:{createElement:t=>(t==="canvas"?fakeCanvas():{style:{}})},navigator:{},setTimeout,setInterval,clearTimeout,clearInterval};
ctx.self=ctx;ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);

/* Keep this list identical to index.html — see the v8.9 note in verify-lifts.js
   for what happens when it drifts. */
["public/src/config/weapons.config.js","public/src/config/gameplay.config.js",
 "public/src/config/loot.config.js","public/src/config/world.config.js",
 "public/src/config/maps-rural.config.js","public/src/config/maps-metro.config.js",
 "public/src/config/districts.config.js","public/src/config/index.js",
 "public/src/environment/merge.js","public/src/environment/world.js",
 "public/src/environment/districts-south.js","public/src/environment/districts-north.js",
 "public/src/environment/districts-outer.js","public/src/environment/deco.js",
 "public/src/environment/rural.js","public/src/environment/metro.js",
 "public/src/environment/access.js"
].forEach(f => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));

/* A checksum over every collider number, not just the count. A collider that
   MOVED but did not disappear leaves the count identical; this does not. */
function checksum(cols) {
  let h = 2166136261 >>> 0;
  for (const c of cols) {
    for (let i = 0; i < 7; i++) {
      const v = Math.round((+c[i] || 0) * 1000);
      h ^= (v & 0xffffffff); h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

function fingerprint(map) {
  ctx.__m = map;
  const r = vm.runInContext(`
    (function () {
      var sc = new THREE.Scene();
      World.reset(); World.buildMap(sc, __m);
      var root = sc;
      for (var i = 0; i < sc.children.length; i++) if (sc.children[i].isGroup) root = sc.children[i];
      var merged = 0, loose = 0, lights = 0, tris = 0, casters = 0;
      root.traverse(function (o) {
        if (o.isLight) { lights++; return; }
        if (!o.isMesh) return;
        var g = o.geometry;
        tris += (g && g.index) ? g.index.count / 3 : 0;
        if (o.castShadow) casters++;
        if (g && g.type === "BufferGeometry" && !g.parameters) merged++; else loose++;
      });
      return { draws: merged + loose, tris: Math.round(tris), lights: lights,
               casters: casters, mm: (World.minimapShapes || []).length,
               bound: World.BOUND, cols: World._colliders() };
    })();
  `, ctx, { filename: "<fp-" + map + ">" });
  return { colliders: r.cols.length, sum: checksum(r.cols), draws: r.draws,
           tris: r.tris, casters: r.casters, lights: r.lights,
           minimap: r.mm, bound: r.bound };
}

/* Map data counts come straight from CFG, so a loot point deleted from the
   wrong config file is caught even if the geometry is identical.
   Urban does NOT live in a MAPS_URBAN object — it keeps the legacy top-level
   keys, and server.js:40 falls through to them. Reading MAPS_URBAN here would
   have fingerprinted an empty object and passed forever. */
function dataFingerprint(key) {
  const C = ctx.CFG;
  const d = key === "urban"
    ? { LOOT_POINTS: C.LOOT_POINTS, SPAWNS: C.SPAWNS, AIRDROP_POINTS: (C.AIRDROP || {}).points }
    : (C[key] || {});
  return { loot: (d.LOOT_POINTS || []).length,
           spawns: (d.SPAWNS || []).length,
           airdrops: (d.AIRDROP_POINTS || []).length };
}
function urbanLifts() {
  return (ctx.CFG.LIFTS || []).filter(l => (l.map || "urban") === "urban")
    .map(l => [l.x, l.z, l.r, (l.stops || []).join("/")].join(":")).join(" | ");
}

// ---------------------------------------------------------------------------
/* ===== BASELINE RE-RECORDED FOR v9.15 — a decision, not a convenience =====
   Two staircases reshaped and one roof re-reached.
     - The garage and warehouse fire escapes in access.js went from 0.31 rise on
       a 0.50 run to roughly 0.24 on 0.39. Reported twice as "weird big steps,
       make it real". The FOOTPRINT AND TOTAL CLIMB ARE UNCHANGED — more, smaller
       treads over the same ground — so every landing, skirt and roof edge around
       them still meets. v9.13 attempted this and changed the wrong generator.
     - buildingAt's external flight no longer trades a hanging staircase for an
       unreachable roof: where shortening it would orphan the top, it keeps its
       full height and gets a landing platform sized to the overshoot.
   Recorded with: node tools/verify-untouched.js --record */
const BASELINE = {
  urban: {"colliders":3334,"sum":1751341313,"draws":112,"tris":92088,"casters":62,"lights":7,"minimap":236,"bound":100},
  rural: {"colliders":1066,"sum":1837205283,"draws":32,"tris":54467,"casters":22,"lights":3,"minimap":210,"bound":150},
  urbanData: {"loot":363,"spawns":44,"airdrops":10},
  ruralData: {"loot":164,"spawns":50,"airdrops":12},
  urbanLifts: "84.2:-25.5:1.6:0.25/3.25/6.25 | -76.2:-81.9:1.6:0.25/3.25/6.25"
};
// ---------------------------------------------------------------------------

const actual = {
  urban: fingerprint("urban"),
  rural: fingerprint("rural"),
  urbanData: dataFingerprint("urban"),
  ruralData: dataFingerprint("MAPS_RURAL"),
  urbanLifts: urbanLifts()
};

if (process.argv.indexOf("--record") !== -1) {
  console.log("const BASELINE = {");
  console.log("  urban: " + JSON.stringify(actual.urban) + ",");
  console.log("  rural: " + JSON.stringify(actual.rural) + ",");
  console.log("  urbanData: " + JSON.stringify(actual.urbanData) + ",");
  console.log("  ruralData: " + JSON.stringify(actual.ruralData) + ",");
  console.log("  urbanLifts: " + JSON.stringify(actual.urbanLifts));
  console.log("};");
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  PASS  " + m)) : (fail++, console.log("  FAIL  " + m)); };

["urban", "rural"].forEach(map => {
  console.log("\n--- [" + map + "] untouched ---");
  const a = actual[map], b = BASELINE[map];
  Object.keys(b).forEach(k => {
    ok(a[k] === b[k], map + ": " + k + " unchanged (" + a[k] +
      (a[k] === b[k] ? "" : " — BASELINE " + b[k]) + ")");
  });
});

console.log("\n--- shared config untouched ---");
["urbanData", "ruralData"].forEach(k => {
  const a = actual[k], b = BASELINE[k];
  Object.keys(b).forEach(f =>
    ok(a[f] === b[f], k + "." + f + " unchanged (" + a[f] +
      (a[f] === b[f] ? "" : " — BASELINE " + b[f]) + ")"));
});
ok(actual.urbanLifts === BASELINE.urbanLifts,
  "urban lift shafts unchanged (" + (actual.urbanLifts.split("|").length) + " shafts)");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
