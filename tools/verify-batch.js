/* BATCHING GATE (v7.5)
   ---------------------------------------------------------------------------
   Urban shipped 233 meshes where 55 were needed. The waste was never geometry;
   it was three specific architectural mistakes that are easy to reintroduce one
   prop at a time and impossible to see in a screenshot:

     1. a static mesh built with `new THREE.Mesh` and never marked
        matrixAutoUpdate = false  -> StaticMerge skips it entirely  (was 121)
     2. MeshBasicMaterial used for unlit surfaces                    (was  55)
        -> StaticMerge only accepts MeshLambertMaterial
     3. props parented to a THREE.Group                              (was  10)
        -> Group children are not scene children, so the merger never sees them
     4. materials minted inside a per-call builder function
        -> identical paint cannot share a batch and lands as a singleton

   This gate asserts the invariants rather than a mesh-count ceiling, so it
   keeps working as districts add content. It also PRINTS the draw-call count
   for every map, which is the number to watch during the visual pass.

   Run: node tools/verify-batch.js  [-v]
*/
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label); }
}

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
  THREE, performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === "canvas" ? fakeCanvas() : { style: {} }) },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

const FILES = [
  "public/src/config/weapons.config.js", "public/src/config/gameplay.config.js",
  "public/src/config/loot.config.js", "public/src/config/world.config.js",
  "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js",
  "public/src/config/districts.config.js", "public/src/config/index.js", "public/src/environment/merge.js",
  "public/src/environment/world.js", "public/src/environment/districts-south.js",
  "public/src/environment/districts-north.js", "public/src/environment/districts-outer.js",
  "public/src/environment/deco.js", "public/src/environment/rural.js",
  "public/src/environment/metro.js", "public/src/environment/access.js"
];
for (const f of FILES) {
  try { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); }
  catch (e) { console.log("LOAD CRASH in " + f + ":\n" + e.stack); process.exit(1); }
}

/* Budgets are generous headroom, not targets. They exist to catch a return to
   the pre-v7.5 architecture (Urban was 233), never to cap legitimate content.
   If a district pass pushes a map over, investigate WHY before raising it:
   the cause is almost always one of the four mistakes listed at the top. */
/* Draw calls were the only thing budgeted until v7.9, and they were the wrong
   number to watch. A shadow-casting batch is submitted TWICE per frame — once
   into the 2048^2 directional shadow map and once into the main pass — so
   Urban's "81 draw calls" was really 134 geometry submissions, and 54.8k of its
   64.3k triangles were being rasterised twice. Shadow casters and triangles are
   now budgeted alongside draw calls, because those are what actually cost
   frames on the hardware this game has to run on. */
/* v9.0 RURAL BUDGETS RAISED — DELIBERATELY, AND ONLY RURAL.

   These are ratchets, so raising one needs a reason on the record rather than a
   quiet edit. The old rural numbers were set against a nearly empty 220 m field
   whose "hills" were low plinths. Hollow Ridge is a 300 m map — roughly 1.9x
   the area — carrying a four-tier mountain, a waterfall, a lake with structures
   on it, a mud village, a farm with a silo and windmill, a quarry and a logging
   camp.

   Measured after thinning the treeline by half: 53,271 triangles and 22 shadow
   casters. Set with headroom at 70,000 / 26, which is still well BELOW urban's
   real cost of 81,660 triangles and 57 casters — so rural remains the cheaper
   map to render, as it should be. Draw calls did not move: 32, unchanged
   budget of 40, because StaticMerge still collapses the map into the same
   handful of batches no matter how much geometry goes in.

   Urban and metro budgets are untouched. */
const BUDGET = { urban: 115, rural: 40, metro: 45 };
const CAST_BUDGET = { urban: 62, rural: 26, metro: 22 };
const TRI_BUDGET = { urban: 120000, rural: 70000, metro: 26000 };
/* v9.0: rural 200 -> 215. Hollow Ridge is 1.9x the area of the old map and
   its cover is drystone walls, which the minimap draws as shapes. Measured at
   210. Urban's 320 is untouched. */
const MM_BUDGET = { urban: 320, rural: 215, metro: 260 };
/* Urban ran 10 lights before v7.5 (3 scene + 7 point). Three point lights were
   removed: two street lamps and one open-air construction work light, all
   replaced by emissive geometry. The four that remain light ENCLOSED volumes
   (warehouse, apartment, sunken tunnel, depot roof) that no emissive prop can
   fake. Budget is set at the current count on purpose: adding a point light to
   Urban should be a deliberate decision, not a drift. */
const LIGHT_BUDGET = { urban: 7, rural: 6, metro: 6 };

const VERBOSE = process.argv.indexOf("-v") !== -1;

for (const map of ["urban", "rural", "metro"]) {
  console.log("\n--- [" + map + "] batching ---");
  ctx.__m = map;
  const r = vm.runInContext(`
    (function () {
      var sc = new THREE.Scene();
      World.reset(); World.buildMap(sc, __m);
      var root = sc;
      for (var i = 0; i < sc.children.length; i++) if (sc.children[i].isGroup) root = sc.children[i];

      var merged = 0, loose = [], lights = 0, sprites = 0, tris = 0;
      var dynamicStatics = [], basicMats = [], groupMeshes = [], nonWhitelisted = [];
      var res = {};

      var casters = 0, castTris = 0;
      root.traverse(function (o) {
        if (o.isLight) { lights++; return; }
        if (o.isSprite) { sprites++; return; }
        if (!o.isMesh) return;
        var g = o.geometry;
        var t = (g && g.index) ? g.index.count / 3 : 0;
        tris += t;
        if (o.castShadow) { casters++; castTris += t; }

        // a mesh whose parent is a Group (not the scene root) is invisible to StaticMerge
        if (o.parent && o.parent !== root && o.parent.isGroup) {
          groupMeshes.push([o.position.x | 0, o.position.y | 0, o.position.z | 0]);
        }
        var isMerged = g && g.type === "BufferGeometry" && !g.parameters;
        if (isMerged) { merged++; return; }

        loose.push({
          geo: g && g.type,
          mt: o.material && o.material.type,
          col: (o.material && o.material.color) ? "#" + o.material.color.getHexString() : "-",
          p: [Math.round(o.position.x), Math.round(o.position.y), Math.round(o.position.z)]
        });
        if (o.matrixAutoUpdate !== false) {
          dynamicStatics.push([o.position.x | 0, o.position.y | 0, o.position.z | 0]);
        }
        if (o.material && o.material.type === "MeshBasicMaterial") {
          basicMats.push([o.position.x | 0, o.position.y | 0, o.position.z | 0]);
        }
        if (g && ["BoxGeometry", "CylinderGeometry", "ConeGeometry"].indexOf(g.type) === -1) {
          nonWhitelisted.push(g.type + "@" + [o.position.x | 0, o.position.z | 0].join(","));
        }
      });

      /* Ground-decal orientation. A wide, paper-thin cylinder is a ground decal
         (crater scorch, light pool, manhole). Standing one on its edge turns it
         into a several-metre wall — which is exactly what happened when the
         crater disc was converted from CircleGeometry (needs rotating flat) to
         CylinderGeometry (already flat) without dropping the old rotation.
         Every gate passed; the browser showed a 6.2 m black slab. Checked on
         the PRE-merge scene, where source rotations are still readable. */
      var edgeOn = [];
      var sc2 = new THREE.Scene();
      var keep = CFG.RENDER.mergeStatic;
      CFG.RENDER.mergeStatic = false;
      World.reset(); World.buildMap(sc2, __m);
      CFG.RENDER.mergeStatic = keep;
      var root2 = sc2;
      for (var q = 0; q < sc2.children.length; q++) if (sc2.children[q].isGroup) root2 = sc2.children[q];
      root2.traverse(function (o) {
        if (!o.isMesh || !o.geometry || o.geometry.type !== "CylinderGeometry") return;
        var pr = o.geometry.parameters; if (!pr) return;
        var rad = Math.max(pr.radiusTop || 0, pr.radiusBottom || 0);
        if (!(pr.height < 0.05 && rad > 0.8)) return;          // only wide, paper-thin discs
        var upright = Math.abs(Math.cos(o.rotation.x)) * Math.abs(Math.cos(o.rotation.z));
        if (upright < 0.9) edgeOn.push([o.position.x | 0, o.position.y | 0, o.position.z | 0]);
      });
      res.edgeOn = edgeOn;
      res.casters = casters; res.castTris = Math.round(castTris);
      var mm = (World.minimapShapes || []).map(function (q) {
        return (q[2] - q[0]) * (q[3] - q[1]);
      }).sort(function (a, b) { return a - b; });
      res.mmShapes = mm.length;
      res.mmMedian = mm.length ? mm[Math.floor(mm.length / 2)] : 0;
      res.merged = merged; res.loose = loose; res.lights = lights; res.sprites = sprites;
      res.tris = Math.round(tris); res.dynamicStatics = dynamicStatics;
      res.basicMats = basicMats; res.groupMeshes = groupMeshes;
      res.nonWhitelisted = nonWhitelisted;
      return res;
    })();
  `, ctx, { filename: "<batch-" + map + ">" });

  const draws = r.merged + r.loose.length;
  const subs = draws + r.casters;          // main pass + shadow pass
  console.log("        " + r.merged + " merged batches + " + r.loose.length +
    " loose = " + draws + " draw calls | " + r.tris + " tris | " + r.lights + " lights");
  console.log("        shadow pass: " + r.casters + " casters, " + r.castTris +
    " tris  ->  " + subs + " geometry submissions per frame");

  ok(draws <= BUDGET[map], map + ": " + draws + " draw calls within budget of " + BUDGET[map]);
  ok(r.casters <= CAST_BUDGET[map],
    map + ": " + r.casters + " shadow casters within budget of " + CAST_BUDGET[map]);
  ok(r.tris <= TRI_BUDGET[map],
    map + ": " + r.tris + " triangles within budget of " + TRI_BUDGET[map]);
  ok(r.dynamicStatics.length === 0,
    map + ": every static mesh is marked matrixAutoUpdate=false" +
    (r.dynamicStatics.length ? " (" + r.dynamicStatics.length + " missed, e.g. " +
      JSON.stringify(r.dynamicStatics.slice(0, 3)) + ")" : ""));
  ok(r.basicMats.length === 0,
    map + ": no MeshBasicMaterial in static geometry (use a Lambert with emissive)" +
    (r.basicMats.length ? " (" + r.basicMats.length + " found, e.g. " +
      JSON.stringify(r.basicMats.slice(0, 3)) + ")" : ""));
  ok(r.groupMeshes.length === 0,
    map + ": no static mesh hidden inside a THREE.Group" +
    (r.groupMeshes.length ? " (" + r.groupMeshes.length + " found, e.g. " +
      JSON.stringify(r.groupMeshes.slice(0, 3)) + ")" : ""));
  ok(r.nonWhitelisted.length <= 2,
    map + ": loose meshes use merge-whitelisted geometry" +
    (r.nonWhitelisted.length ? " (" + r.nonWhitelisted.slice(0, 4).join(", ") + ")" : ""));
  ok(r.sprites === 0,
    map + ": no per-object sprites (sprites never batch; use THREE.Points)" +
    (r.sprites ? " (" + r.sprites + " found)" : ""));
  ok(r.lights <= LIGHT_BUDGET[map],
    map + ": " + r.lights + " lights within budget of " + LIGHT_BUDGET[map]);
  /* Minimap legibility. Urban reached 1,100 captured shapes with a median area
     of 0.9 m2 before v8.0 — every crate and bollard drawn at a wall's visual
     weight. A map you cannot read is worse than no map. */
  ok(r.mmShapes <= MM_BUDGET[map],
    map + ": " + r.mmShapes + " minimap shapes (budget " + MM_BUDGET[map] +
    ", median " + r.mmMedian.toFixed(1) + " m2)");
  ok(r.mmMedian >= 3.5,
    map + ": minimap median footprint is " + r.mmMedian.toFixed(1) + " m2 (props filtered out)");

  ok(r.edgeOn.length === 0,
    map + ": no thin wide disc is standing on its edge" +
    (r.edgeOn.length ? " (" + r.edgeOn.length + " found, e.g. " +
      JSON.stringify(r.edgeOn.slice(0, 3)) + ")" : ""));

  if (VERBOSE && r.loose.length) {
    console.log("        remaining loose meshes (each is one unavoidable draw call):");
    const by = {};
    r.loose.forEach(l => { const k = l.mt + " " + l.col + " " + l.geo; (by[k] = by[k] || []).push(l.p); });
    Object.keys(by).sort((a, b) => by[b].length - by[a].length)
      .forEach(k => console.log("          " + String(by[k].length).padStart(3) + "  " + k));
  }
}


/* ===== v10 - DISTRICT SIGNS SHARE ONE ATLAS =====

   districtSigns() in world.js built a CanvasTexture and a MeshLambertMaterial
   PER DISTRICT. A unique material cannot batch, so fifteen signposts held
   fifteen of Urban's 112 draw calls - 13% of the budget, on a map with three
   calls of headroom against its 115 ceiling and ZERO shadow-caster headroom.

   Metro fixed this in v9.5 and Urban did not get it until v10. This asserts the
   shape of the fix rather than the count, so it survives a district being added
   or removed: however many signs there are, they share ONE material. */
(function signAtlas() {
  const src = fs.readFileSync(path.join(ROOT, 'public/src/environment/world.js'), 'utf8');
  const raw = src.slice(src.indexOf('function districtSigns()'),
                        src.indexOf('/* ===== PERIMETER + SKYLINE ====='));
  /* COMMENTS STRIPPED FIRST. The first cut of this gate went red on its own
     documentation: the comments in districtSigns explain WHY it must not use
     Float32BufferAttribute or DoubleSide, and naming a thing to forbid it made
     the "is it forbidden" regex match. A gate that reads prose is testing the
     wrong artefact - it would also pass a file that did the wrong thing under a
     different name. */
  const fn = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(fn.length > 200, 'districtSigns() is still present');
  const mats = (fn.match(/new THREE\.Mesh[A-Za-z]*Material/g) || []).length;
  ok(mats <= 1, 'districtSigns builds at most ONE material [' + mats + ']');
  const texes = (fn.match(/new THREE\.CanvasTexture|canvasTex\(/g) || []).length;
  ok(texes <= 1, 'and at most ONE texture [' + texes + ']');
  ok(!/for[\s\S]{0,400}new THREE\.MeshLambertMaterial/.test(fn),
    'no material is constructed inside the per-sign loop');
  /* The trimmed THREE the map gates run against has no Float32BufferAttribute -
     using it crashes verify-map while the render gates pass. */
  ok(!/Float32BufferAttribute/.test(fn),
    'the atlas uses BufferAttribute, not the Float32BufferAttribute subclass');
  ok(/BufferAttribute\(new Float32Array/.test(fn),
    'geometry is built with BufferAttribute + Float32Array');
  /* A DoubleSide quad shows its texture mirrored from behind, so every board
     read backwards from one approach. Two quads, opposite winding. */
  ok(!/DoubleSide/.test(fn), 'boards are not DoubleSide (that mirrors the text)');
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
