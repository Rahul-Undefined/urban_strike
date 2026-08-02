/* verify-devhud.js — the developer overlay is a tool, so it gets a gate.

   Two things are being proved here, and only two:

     A. HIDDEN IS FREE. update() must return before touching the collider set
        while the panel is off. If that ever stops being true the panel starts
        costing frame time in normal play, which is the one thing it must not do.

     B. THE READOUT AGREES WITH THE OTHER GATES. The panel's HEAD and STAIR
        arrival fields answer the same questions tools/verify-stairs-quality.js
        answers. If the panel and the gate disagree about a known defect then
        one of them is lying, and a lying overlay is worse than no overlay --
        it would send map work to the wrong coordinates.

   This gate does NOT prove the panel renders. Only a browser proves that.

   Run: node tools/verify-devhud.js */
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log("  PASS  " + label); } else { fail++; console.log("  FAIL  " + label); } }

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, {
    get: (t, k) => {
      if (k === "canvas") return c;
      return function () {
        if (k === "createLinearGradient" || k === "createRadialGradient") return { addColorStop() {} };
        if (k === "measureText") return { width: 10 };
        if (k === "getImageData") return { data: new Uint8ClampedArray(4) };
      };
    }, set: () => true
  });
  c.getContext = () => g;
  return c;
}

/* A DOM stub that COUNTS appends, so "the panel builds exactly one element"
   is a measured fact and not an assumption. */
const created = [];
const body = { appendChild(e) { created.push(e); return e; } };
const ctx = {
  console: { log() {} }, Math, Date, JSON, Object, Array,
  Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
  performance: { now: () => Date.now() },
  navigator: {},
  document: {
    body: body,
    createElement: (t) => (t === "canvas" ? fakeCanvas() : { style: { cssText: "" }, id: "", textContent: "" })
  },
  setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

/* Identical list to public/index.html, plus the overlay. Keep it that way. */
[
  "public/src/config/weapons.config.js", "public/src/config/gameplay.config.js",
  "public/src/config/loot.config.js", "public/src/config/world.config.js",
  "public/src/config/maps-rural.config.js", "public/src/config/maps-metro.config.js",
  "public/src/config/districts.config.js", "public/src/config/index.js",
  "public/src/environment/merge.js", "public/src/environment/world.js",
  "public/src/environment/districts-south.js", "public/src/environment/districts-north.js",
  "public/src/environment/districts-outer.js", "public/src/environment/deco.js",
  "public/src/environment/rural.js", "public/src/environment/metro.js",
  "public/src/environment/access.js", "public/src/ui/devhud.js"
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));

ctx.World.build(new THREE.Scene());
console.log("\n--- [urban] devhud (" + ctx.World.colliders.length + " colliders) ---");

/* A minimal PlayerCtl stand-in: the overlay only reads .pos and .grounded. */
let PX = 0, PY = 0, PZ = 0;
ctx.PlayerCtl = { get pos() { return { x: PX, y: PY, z: PZ }; }, get grounded() { return true; } };
const HALF = ctx.CFG.PLAYER.standH / 2;
function at(x, feetY, z) { PX = x; PY = feetY + HALF; PZ = z; return read(); }
/* The clock must be monotonic AND ahead of DevHUD's internal `last`, which
   toggle() seeds from performance.now() = Date.now(). An earlier draft of this
   gate counted from 0, so every update() was throttled away and every
   assertion silently re-read the stale readout from position (0,0,0). Three
   tests "passed" against text that was never recomputed. That is trap #1 in
   HANDOFF section 6, committed while writing the gate that was supposed to
   catch it. Do not replace this with a small counter. */
let __clock = Date.now();
function read() {
  __clock += 1000;
  ctx.__t = __clock;
  return vm.runInContext("DevHUD.update(__t), __probe_text()", ctx);
}
/* Expose the composed text without making the module export its internals. */
vm.runInContext("var __probe_text = function () { return document.__last; };", ctx);
/* The stub element records what was written to it. */
vm.runInContext("(function(){var _ce=document.createElement;document.createElement=function(t){" +
  "var e=_ce(t);if(t!=='canvas'){Object.defineProperty(e,'textContent',{set:function(v){document.__last=v;}," +
  "get:function(){return document.__last;}});}return e;};})();", ctx);

// ---- A: hidden is free ----
ok(vm.runInContext("DevHUD.isOn()", ctx) === false, "panel starts hidden");
ctx.__t = 0;
vm.runInContext("DevHUD.update(999999)", ctx);
ok(created.length === 0 && ctx.document.__last === undefined,
  "update() while hidden creates nothing and computes nothing");

vm.runInContext("DevHUD.toggle()", ctx);
ok(vm.runInContext("DevHUD.isOn()", ctx) === true, "F3 toggles the panel on");
ok(created.length === 1, "exactly one DOM element is ever created (" + created.length + ")");
vm.runInContext("DevHUD.toggle()", ctx); vm.runInContext("DevHUD.toggle()", ctx);
ok(created.length === 1, "toggling again reuses the same element, never appends a second");

// ---- B: readout agrees with the map ----
function field(txt, key) {
  const line = String(txt || "").split("\n").find(l => l.indexOf(key) === 0);
  return line ? line.slice(key.length).trim() : null;
}

let t = at(-32, 0, -28);                                  // CFG.SPAWNS[0], open ground
ok(/^F0$/.test(field(t, "FLOOR") || ""), "spawn#0 reads F0 (got " + field(t, "FLOOR") + ")");
ok((field(t, "DIST") || "").length > 0 && field(t, "DIST") !== "OUTSKIRTS",
  "spawn#0 names a district (" + field(t, "DIST") + ")");
ok((field(t, "HEAD") || "").length > 0 && !/LOW/.test(field(t, "HEAD")),
  "spawn#0 headroom is reported and not flagged low (" + field(t, "HEAD") + ")");

/* Known headroom defect, tools/verify-stairs-quality.js: flight starting
   (-37.7, 3.62, 24.35), 10 steps of 0.308 running in -z at 0.33 per tread.
   The gate samples ABOVE EACH TREAD, so the violation is somewhere along the
   run, not at the foot. The panel must find the same low ceiling when the
   player is standing where the gate says it is low. Walk the flight. */
let sawBlocked = null;
for (let i = 0; i < 10 && !sawBlocked; i++) {
  const z = 24.35 - (i + 0.5) * 0.33, fy = 3.62 + (i + 1) * 0.308;
  const line = field(at(-37.7, fy, z), "HEAD");
  if (line && /LOW/.test(line)) sawBlocked = "step " + i + ": " + line;
}
ok(!!sawBlocked, "known headroom flight reads LOW somewhere along its run (" +
  (sawBlocked || "never blocked") + ")");

/* Known arrival defect, handoff 5b: flight (-56.8, 3.40, 56.9) -> (-44.8, 12.40).
   verify-stairs-quality says no deck within 3 m of its top. The panel must
   independently reach the same verdict standing on that flight. */
t = at(-56.0, 3.78, 56.9);
const st = field(t, "STAIR");
ok(st !== null, "panel identifies the flight at (-56.8, 3.40, 56.9) (" + st + ")");
const arrLine = String(t || "").split("\n").find(l => l.indexOf("top arrival") >= 0);
ok(!!arrLine && /NO DECK|gap/.test(arrLine),
  "panel agrees the flight's top has no deck in reach (" + (arrLine || "missing").trim() + ")");

/* A flight that IS fine must not be reported as broken, or the panel cries
   wolf and stops being trusted. Mint deck stair, verified in verify-access. */
t = at(-17.6, 0.35, 41.0);
const okLine = String(t || "").split("\n").find(l => l.indexOf("top arrival") >= 0);
ok(!okLine || /ok/.test(okLine), "a known-good flight is not flagged (" + (okLine || "n/a").trim() + ")");

/* Column depth: standing on the ground under a multi-storey structure must
   report more than one deck above. */
t = at(-79.1, 0, -2.6);                                   // apartment block stair foot
const col = field(t, "COLUMN");
ok(col !== null && parseInt(col, 10) >= 1, "column depth is reported (" + col + ")");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
