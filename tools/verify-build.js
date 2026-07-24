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
  if (rural.map !== "rural" || rural.colliders < 300) { console.log("rural build unhealthy"); process.exit(1); }
  console.log("verify-build: PASS (both maps, reset path exercised)");
} catch (e) {
  console.log("BUILD CRASH:\n" + (e.stack || e));
  process.exit(1);
}
