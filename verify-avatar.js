/* AVATAR GATE (v7.9)
   ---------------------------------------------------------------------------
   Nothing in this project has ever budgeted the PLAYER. The map is measured to
   the draw call, but ten remote avatars were quietly costing more than the
   entire Urban map: seven boxes each plus a weapon, and — the real problem —
   THREE brand-new materials per avatar instance, so a ten-player lobby minted
   thirty body materials that could never share a batch.

   Avatars cannot be static-merged: they move every frame. So the only levers
   are part count, material sharing, and hiding what cannot be seen. This gate
   holds all three, and it asserts the rig is actually articulated — a joint
   hierarchy is what separates walking from scissoring, and it is invisible in
   any screenshot.

   Run: node verify-avatar.js
*/
let THREE;
try { THREE = require("three"); } catch (e) { console.log("SKIP: npm install first"); process.exit(0); }
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const CFG = require(path.join(__dirname, "public/src/config/index.js"));

let pass = 0, fail = 0;
function ok(c, label) {
  if (c) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label); }
}

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, {
    get: (t, k) => {
      if (k === "canvas") return c;
      return function () {
        if (k === "createLinearGradient" || k === "createRadialGradient") return { addColorStop: function () {} };
        if (k === "measureText") return { width: 40 };
        if (k === "getImageData") return { data: new Uint8ClampedArray(4) };
      };
    }, set: () => true
  });
  c.getContext = () => g;
  return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array, Float32Array, Uint8ClampedArray,
  THREE, CFG, performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === "canvas" ? fakeCanvas() : { style: {} }) },
  navigator: {}, setTimeout, setInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("public/src/networking/avatars.js", "utf8"), ctx, { filename: "avatars.js" });

/* Ten players, ten distinct colours — the worst realistic case for a full
   free-for-all lobby. */
const COLORS = ["#e8563e", "#63d968", "#3f8dff", "#f0a232", "#b06fd8",
                "#e8d040", "#3ed0c8", "#ff8fb0", "#8fb4ff", "#c9b98f"];
/* matsBody counts MESH materials only. The name tag and hp bar carry a
   per-player canvas texture by definition — those two sprite materials cannot
   be shared and are not a defect. */
const AV_BUDGET = { partsBase: 13, partsKitted: 16, matsBody: 18, perLobbyDraws: 200 };

const built = COLORS.map((c, i) => vm.runInContext(
  `Avatars.buildAvatar("Op${i}", "${c}")`, ctx));

function census(av) {
  let meshes = 0, sprites = 0, groups = 0, visible = 0;
  const mats = new Set();
  av.group.traverse(o => {
    if (o.isSprite) { sprites++; return; }
    if (o.isMesh) {
      meshes++;
      if (o.material) mats.add(o.material.uuid);
      let vis = o.visible, p = o.parent;
      while (vis && p) { vis = p.visible; p = p.parent; }
      if (vis) visible++;
      return;
    }
    if (o.isGroup) groups++;
  });
  return { meshes, sprites, groups, visible, mats };
}

console.log("\n--- avatar rig ---");
const a0 = census(built[0]);
console.log("        " + a0.meshes + " meshes, " + a0.groups + " joint groups, " +
  a0.sprites + " sprites, " + a0.visible + " visible unequipped");

ok(a0.visible <= AV_BUDGET.partsBase,
  "unequipped avatar is " + a0.visible + " visible parts (budget " + AV_BUDGET.partsBase + ")");

// equip everything and re-measure
vm.runInContext("Avatars.setGear(__A, 3, 3)", Object.assign(ctx, { __A: built[0] }));
const a1 = census(built[0]);
console.log("        fully kitted: " + a1.visible + " visible parts");
ok(a1.visible <= AV_BUDGET.partsKitted,
  "fully kitted avatar is " + a1.visible + " visible parts (budget " + AV_BUDGET.partsKitted + ")");
ok(a1.visible > a0.visible, "equipment actually appears when helmet/armor are set");
vm.runInContext("Avatars.setGear(__A, 0, 0)", ctx);
const a2 = census(built[0]);
ok(a2.visible === a0.visible, "equipment fully hides again when unequipped");

/* Material sharing is the whole point. Ten avatars must not mint ten sets. */
const all = new Set();
built.forEach(av => census(av).mats.forEach(m => all.add(m)));
console.log("        10 avatars -> " + all.size + " distinct BODY materials (+2 sprites each)");
ok(all.size <= AV_BUDGET.matsBody,
  "ten avatars share " + all.size + " body materials (budget " + AV_BUDGET.matsBody + ")");

/* Two players on the same team share a colour, so they must share the accent. */
const twins = [vm.runInContext(`Avatars.buildAvatar("T1", "#3f8dff")`, ctx),
               vm.runInContext(`Avatars.buildAvatar("T2", "#3f8dff")`, ctx)];
const t1 = census(twins[0]).mats, t2 = census(twins[1]).mats;
let shared = 0; t1.forEach(m => { if (t2.has(m)) shared++; });
ok(shared >= t1.size - 2,
  "same-colour avatars share their body AND accent materials (" + shared + "/" + t1.size + ")");

/* Articulation: a thigh must hang from a hip joint and a shin from a knee, or
   limbs rotate about their own centres and the walk reads as scissoring. */
const av = built[0];
ok(!!(av.hipL && av.hipR && av.armL && av.armR), "rig exposes hip and shoulder joints");
ok(!!(av.hipL.knee && av.hipR.knee), "rig exposes knee joints");
ok(!!(av.armL.elbow && av.armR.elbow), "rig exposes elbow joints");
ok(av.gun.parent === av.armR.elbow, "weapon is parented to the right hand, not the torso");
ok(av.helmet.parent === av.head, "helmet is parented to the head joint");

/* Pose must never scale the body to fake a crouch, and must reach the target. */
const S = (o) => Object.assign({ moved: 0, mx: 0, mz: 1, run: false, crouch: false,
  prone: false, dead: false, deadT: 0, rx: 0, ry: 0, lean: 0, reloading: false,
  dist: 5, dt: 1 / 60 }, o);
ctx.__S = S({});
av.baseY = 0;
for (let i = 0; i < 90; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const standHip = av.hipL.rotation.x, standScale = av.group.scale.y;
ctx.__S = S({ crouch: true });
for (let i = 0; i < 90; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
console.log("        crouch: hip " + standHip.toFixed(2) + " -> " + av.hipL.rotation.x.toFixed(2) +
  ", knee " + av.hipL.knee.rotation.x.toFixed(2) + ", scale.y " + av.group.scale.y.toFixed(2));
ok(av.hipL.rotation.x > standHip + 0.5, "crouch bends the hips");
ok(av.hipL.knee.rotation.x < -0.8, "crouch bends the knees");
/* v8.16: this compared scale.y to 1, which was right while the rig had no
   scale of its own. The rig now carries a deliberate, CONSTANT silhouette
   scale (RIG in avatars.js) so remote players are resolvable at range. The
   assertion's real intent — crouch must be a POSE, never a squash — is
   preserved and made stricter: scale.y must not move between standing and
   crouching, whatever its resting value is. Do not relax this to a range. */
ok(Math.abs(av.group.scale.y - standScale) < 0.001 && standScale > 0.5,
  "crouch never squashes the model with scale.y (constant at " +
  standScale.toFixed(2) + ")");

/* Walking must be driven by distance moved, not by the wall clock: a stopped
   player has to stop moving their legs. */
ctx.__S = S({ moved: 0.06, dist: 5 });
for (let i = 0; i < 40; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const walkPhase = av.phase;
ctx.__S = S({ moved: 0, dist: 5 });
for (let i = 0; i < 40; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
ok(av.phase === walkPhase, "stride phase advances with distance, not with time");
ok(Math.abs(av.amp) < 0.05, "leg swing damps to rest when the player stops");

/* STRAFING must not look like walking. Moving sideways opens the hips rather
   than swinging the legs fore-and-aft. */
ctx.__S = S({ moved: 0.06, mx: 0, mz: 1 });
for (let i = 0; i < 60; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const fwdHipZ = Math.abs(av.hipL.rotation.z);
ctx.__S = S({ moved: 0.06, mx: 1, mz: 0 });
for (let i = 0; i < 60; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const sideHipZ = Math.abs(av.hipL.rotation.z);
console.log("        strafe: hip roll " + fwdHipZ.toFixed(3) + " forward -> " + sideHipZ.toFixed(3) + " sideways");
ok(sideHipZ > fwdHipZ + 0.05, "strafing opens the hips instead of reusing the walk cycle");

/* TURNING leans the torso into the turn. */
ctx.__S = S({ moved: 0.02, ry: 0 });
for (let i = 0; i < 30; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const straightRoll = av.spine.rotation.z;
for (let i = 0; i < 30; i++) {
  ctx.__S = S({ moved: 0.02, ry: i * 0.06 });
  vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
}
ok(Math.abs(av.spine.rotation.z - straightRoll) > 0.02, "yaw rate leans the torso into a turn");

/* RELOAD drives the support arm, and settles back when it ends. */
ctx.__S = S({ reloading: false });
for (let i = 0; i < 60; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const idleGun = av.gun.rotation.x;
ctx.__S = S({ reloading: true });
for (let i = 0; i < 60; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
console.log("        reload: gun pitch " + idleGun.toFixed(3) + " -> " + av.gun.rotation.x.toFixed(3));
ok(av.gun.rotation.x > idleGun + 0.2, "reload tips the weapon down");
ctx.__S = S({ reloading: false });
for (let i = 0; i < 90; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
ok(Math.abs(av.gun.rotation.x - idleGun) < 0.02, "weapon returns to carry when the reload ends");

/* PRONE must be a transition, not a snap: slower than crouch by design. */
const fresh = vm.runInContext(`Avatars.buildAvatar("P","#3f8dff")`, ctx);
ctx.__A = fresh; fresh.baseY = 0;
ctx.__S = S({ prone: true });
for (let i = 0; i < 6; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const proneEarly = Math.abs(fresh.group.rotation.x);
const fresh2 = vm.runInContext(`Avatars.buildAvatar("C","#3f8dff")`, ctx);
ctx.__A = fresh2; fresh2.baseY = 0;
ctx.__S = S({ crouch: true });
for (let i = 0; i < 6; i++) vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const crouchEarly = fresh2.cT;
ok(proneEarly / (Math.PI / 2 * 0.92) < crouchEarly,
  "going prone blends slower than crouching (it is a commitment)");
ctx.__A = av;

/* Distance LOD */
ctx.__S = S({ dist: 60 });
vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const far = census(av).visible;
ctx.__S = S({ dist: 5 });
vm.runInContext("Avatars.poseAvatar(__A, __S)", ctx);
const near = census(av).visible;
console.log("        LOD: " + near + " parts near, " + far + " parts at 60 m");
ok(far < near, "small parts drop out beyond 30 m");

/* Worst realistic case: a ten-player lobby, all visible, all kitted. */
built.forEach(a => { ctx.__A = a; vm.runInContext("Avatars.setGear(__A, 3, 3)", ctx); });
let lobbyDraws = 0;
built.forEach(a => { const c = census(a); lobbyDraws += c.visible + c.sprites; });
console.log("        10 kitted avatars visible at once = " + lobbyDraws + " draw calls");
ok(lobbyDraws <= AV_BUDGET.perLobbyDraws,
  "ten-player lobby costs " + lobbyDraws + " draw calls (budget " + AV_BUDGET.perLobbyDraws + ")");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
