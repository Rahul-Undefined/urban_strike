/* Executes the FULL client world-build chain (config -> merge -> world ->
   all districts -> deco) inside node with REAL three@0.128, stubbing only
   the 2D canvas API. Any runtime crash here is the same crash a browser
   hits at the BUILDING SECTOR 7 loading step. */
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, {
    get: (t, k) => {
      if (k === "canvas") return c;
      return function () {
        if (k === "createLinearGradient" || k === "createRadialGradient") return { addColorStop: function () {} };
        if (k === "measureText") return { width: 10 };
        if (k === "getImageData") return { data: new Uint8ClampedArray(4) };
      };
    },
    set: () => true
  });
  c.getContext = () => g;
  return c;
}

const ctx = {
  console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray,
  THREE,
  performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === "canvas" ? fakeCanvas() : { style: {} }) },
  navigator: {},
  setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

const files = [
  "public/src/config/weapons.config.js",
  "public/src/config/gameplay.config.js",
  "public/src/config/loot.config.js",
  "public/src/config/world.config.js",
  "public/src/config/index.js",
  "public/src/environment/merge.js",
  "public/src/environment/world.js",
  "public/src/environment/districts-south.js",
  "public/src/environment/districts-north.js",
  "public/src/environment/districts-outer.js",
  "public/src/environment/deco.js",
  "public/src/environment/rural.js",
  "public/src/environment/metro.js",
  "public/src/environment/access.js"
];
for (const f of files) {
  try { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); }
  catch (e) { console.log("LOAD CRASH in " + f + ":\n" + e.stack); process.exit(1); }
}
console.log("all modules evaluated; CFG keys: " + Object.keys(ctx.CFG).length);

try {
  const result = vm.runInContext(`
    (function () {
      var scene = new THREE.Scene();
      World.build(scene);
      var meshes = 0, sprites = 0, lines = 0, other = 0;
      scene.traverse(function (o) {
        if (o.isMesh) meshes++; else if (o.isSprite) sprites++;
        else if (o.isLine) lines++; else if (o !== scene) other++;
      });
      return { children: scene.children.length, meshes: meshes, sprites: sprites,
               lines: lines, other: other, colliders: World.colliders.length };
    })();
  `, ctx, { filename: "<build-run>" });
  console.log("URBAN BUILD OK: " + JSON.stringify(result));
  if (result.colliders < 1000) { console.log("SUSPICIOUS: urban collider count too low"); process.exit(1); }
  const rural = vm.runInContext(`
    (function () {
      var scene2 = new THREE.Scene();
      // intentionally rebuild on a fresh scene after reset: exercises disposal
      World.reset();
      World.buildMap(scene2, "rural");
      var meshes = 0;
      scene2.traverse(function (o) { if (o.isMesh) meshes++; });
      return { map: World.builtMap, meshes: meshes, colliders: World.colliders.length };
    })();
  `, ctx, { filename: "<rural-run>" });
  console.log("RURAL BUILD OK: " + JSON.stringify(rural));
  ctx.__m3 = "metro";
  const metro = vm.runInContext(`(function(){var sc=new THREE.Scene();World.reset();World.buildMap(sc,__m3);
    var g=null;for(var i=0;i<sc.children.length;i++)if(sc.children[i].isGroup)g=sc.children[i];
    var m=0;g.traverse(function(o){if(o.isMesh)m++;});
    return {map:World.builtMap,meshes:m,colliders:World._colliders().length};})();`, ctx, { filename: "<metro>" });
  console.log("METRO BUILD OK: " + JSON.stringify(metro));
  if (metro.map !== "metro" || metro.colliders < 50) { console.log("metro build unhealthy"); process.exit(1); }
  if (rural.map !== "rural" || rural.colliders < 300) { console.log("rural build unhealthy"); process.exit(1); }

  /* ---- coplanar-ground gate (added v4.8) -------------------------------
     Two large horizontal surfaces whose top faces share the same Y AND whose
     footprints overlap will z-fight for the whole screen at range. Rural
     shipped this way in v4.7 because _initPart1 laid the Urban ground (top
     y=0) under the rural grass (top y=0). Fail the build if it comes back. */
  ctx.CFG.RENDER.mergeStatic = false;   // keep source meshes addressable
  for (const map of ["urban", "rural", "metro"]) {
    ctx.__m = map;
    const bad = vm.runInContext(`
      (function () {
        var sc = new THREE.Scene();
        World.reset(); World.buildMap(sc, __m);
        var grp = null;
        for (var i = 0; i < sc.children.length; i++) if (sc.children[i].isGroup) grp = sc.children[i];
        var bb = new THREE.Box3(), planes = [];
        grp.traverse(function (o) {
          if (!o.isMesh) return;
          bb.setFromObject(o);
          var a = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
          if (a < 200) return;                                  // only big slabs
          if (bb.max.y - bb.min.y > 4) return;                  // only flat ones
          planes.push({ y: bb.max.y, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z,
                        a: a, mat: o.material.uuid });
        });
        var hits = [];
        for (var i = 0; i < planes.length; i++) for (var j = i + 1; j < planes.length; j++) {
          var p = planes[i], q = planes[j];
          if (p.mat === q.mat) continue;   // identical pixels either way — invisible
          if (Math.abs(p.y - q.y) > 0.004) continue;            // 4mm tolerance
          var ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
          var oz = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0);
          if (ox > 1 && oz > 1) hits.push("y=" + p.y.toFixed(3) + " " + Math.round(ox*oz) + "m2 A[" +
            p.x0.toFixed(0)+","+p.x1.toFixed(0)+"/"+p.z0.toFixed(0)+","+p.z1.toFixed(0) + "] B[" +
            q.x0.toFixed(0)+","+q.x1.toFixed(0)+"/"+q.z0.toFixed(0)+","+q.z1.toFixed(0) + "]");
        }
        return hits;
      })();
    `, ctx, { filename: "<coplanar-" + map + ">" });
    if (bad.length) {
      console.log("COPLANAR GROUND on " + map + " (" + bad.length + "): " + bad.slice(0, 6).join(" | "));
      process.exit(1);
    }
    console.log("coplanar-ground gate PASS: " + map);
  }
  console.log("verify-build: PASS (both maps, reset path exercised, no coplanar ground)");
} catch (e) {
  console.log("BUILD CRASH:\n" + (e.stack || e));
  process.exit(1);
}
