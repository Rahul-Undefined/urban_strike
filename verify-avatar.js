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
/* v8.32: partsBase 13 -> 14, partsKitted 16 -> 17. RAISED DELIBERATELY, BY
   EXACTLY ONE, for the neck mesh.

   This project treats budgets as ratchets that fall and never rise, so this
   needs justifying rather than quietly editing. The head sat 0.079 m clear of
   the shoulders with nothing between it — Rahul: "it is like a square box on
   top of the body without the neck." Closing that gap needs one mesh. It
   shares AVM.skin with the head, so it adds no new material, and the cost is
   one draw call per VISIBLE avatar — at most ten in a full lobby, against a
   perLobbyDraws budget of 200 that is unchanged and still enforced below.

   One mesh, one reason, recorded. If a later change needs part fifteen, it
   needs its own line here saying why. */
const AV_BUDGET = { partsBase: 14, partsKitted: 17, matsBody: 18, perLobbyDraws: 200,
  /* v8.33: the cap is 20 now, so there is a budget for 20. Set from the first
     measured run and treated as a ratchet from here — it may fall, never rise. */
  perLobbyDraws20: 400, matsBody20: 30 };

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

/* v8.33 THE CAP IS NOW 20, SO MEASURE 20.

   Raising CFG.MODES to twenty players without re-measuring would have been a
   guess dressed as a decision. Two things make twenty affordable rather than
   simply double: every body material is module-level and shared, so avatar
   COUNT does not multiply materials; and anything past 30 m sheds its detail
   parts. The honest worst case is still every operator visible and kitted at
   close range, so that is what is billed here.

   The material budget matters more than the draw budget at this size — if
   twenty avatars started minting twenty accent materials the shading cost
   would climb far faster than the draw count. */
const built20 = [];
for (let i = 0; i < 20; i++) {
  built20.push(vm.runInContext(
    `Avatars.buildAvatar("Op20_${i}", "${COLORS[i % COLORS.length]}")`, ctx));
}
built20.forEach(a => { ctx.__A = a; vm.runInContext("Avatars.setGear(__A, 3, 3)", ctx); });
let draws20 = 0;
const mats20 = new Set();
built20.forEach(a => {
  const c = census(a);
  draws20 += c.visible + c.sprites;
  a.group.traverse(o => { if (o.isMesh && o.material) mats20.add(o.material.uuid); });
});
console.log("        20 kitted avatars visible at once = " + draws20 + " draw calls, " +
  mats20.size + " distinct materials");
ok(draws20 <= AV_BUDGET.perLobbyDraws20,
  "twenty-player lobby costs " + draws20 + " draw calls (budget " + AV_BUDGET.perLobbyDraws20 + ")");
ok(mats20.size <= AV_BUDGET.matsBody20,
  "twenty avatars share " + mats20.size + " materials (budget " + AV_BUDGET.matsBody20 +
  ") — sharing holds at double the player count");

/* ===== v10.12 - CHURN LEAKS NOTHING =====

   Rahul: "keep ensuring that no bugs are left in the game and specially from
   the avatar side."

   This file already proves avatars SHARE their materials. It did not prove
   they RELEASE what they own, and that is the half that caused the
   30/60-minute disconnects in v10.9 — nothing in avatars.js called dispose at
   all, and the leak was invisible until a match ran long enough.

   So: 200 full lifecycles, each one build -> six weapon swaps -> gear on ->
   gear off -> hp bar -> dispose -> dispose again. Counts what is still alive
   afterwards.

   The three numbers mean different things:
     geometry   must be BOUNDED, not zero. It is shared and deliberately never
                freed — one per distinct box size, reused forever.
     textures   must be ZERO. Two CanvasTextures per avatar are genuinely
                per-player and disposeAvatar owns them.
     materials  must be ZERO, same reason.

   Double dispose is called on purpose. removeRemote and the leaveRoom sweep
   can both reach the same avatar, and a second call must be a no-op rather
   than a crash or a double-free. */
{
  const before = vm.runInContext(`(function () {
    var g = 0, t = 0, m = 0;
    var OG = THREE.BoxGeometry, OT = THREE.CanvasTexture, OM = THREE.SpriteMaterial;
    THREE.BoxGeometry = function (w, h, d) { g++; return new OG(w, h, d); };
    THREE.CanvasTexture = function (c) { t++; var x = new OT(c); var od = x.dispose.bind(x);
      x.dispose = function () { t--; od(); }; return x; };
    THREE.SpriteMaterial = function (o) { m++; var x = new OM(o); var od = x.dispose.bind(x);
      x.dispose = function () { m--; od(); }; return x; };
    for (var i = 0; i < 200; i++) {
      var r = { av: Avatars.buildAvatar('P' + i, '#3f8dff'), gunName: null };
      for (var w = 0; w < 6; w++) Avatars.setRemoteGun(r, w % CFG.WEAPON_ORDER.length);
      Avatars.setGear(r.av, 1, 2); Avatars.setGear(r.av, 0, 0);
      Avatars.drawHpBar(r, 55, true, 'a');
      Avatars.disposeAvatar(r.av);
      Avatars.disposeAvatar(r.av);
    }
    THREE.BoxGeometry = OG; THREE.CanvasTexture = OT; THREE.SpriteMaterial = OM;
    return { g: g, t: t, m: m };
  })()`, ctx);

  console.log("\n--- v10.12: 200 join/swap/gear/leave cycles leak nothing ---");
  ok(before.t === 0,
    "every per-avatar CanvasTexture is released [" + before.t + " still alive]");
  ok(before.m === 0,
    "every per-avatar SpriteMaterial is released [" + before.m + " still alive]");
  ok(before.g > 0 && before.g < 120,
    "geometry stays bounded and shared, not freed [" + before.g + " for 200 avatars]");
}

/* ===== v10.12 - EVERY WORLD-SIZED CHILD MUST CANCEL THE RIG SCALE =====

   buildAvatar sets g.scale to RIG (1.52, 1.301, 1.52) so the operator is
   taller than the raw rig. Every child of g inherits that, in BOTH its
   dimensions and its local position, and g is additionally rotated ~83 degrees
   about X when prone.

   Body parts are meant to inherit it — that is the point. Anything measured in
   WORLD units is not: a nameplate, an hp bar, a marker. Those live under
   tagHolder, which carries the inverse scale and is counter-rotated each frame
   by poseAvatar.

   The v10.10 recon visor silhouette was added straight to g. It rendered
   0.94 x 2.42 instead of 0.62 x 1.86, floated 1.61 m up instead of sitting on
   the body, and would have swung out flat in front of a prone player. Nothing
   caught it: it is not a leak, not a material, not a collider, and every
   existing avatar assertion passed.

   So: no direct child of g may be a Sprite or carry a depthTest:false
   material. Those are the two signatures of a screen-space or world-space
   overlay, and both belong under tagHolder. */
{
  const av = vm.runInContext(`Avatars.buildAvatar("Scale", "#3f8dff")`, ctx);
  const RIG = vm.runInContext(`Avatars.RIG`, ctx);
  const strays = [];
  (av.group.children || []).forEach((c) => {
    if (c === av.tagHolder) return;
    const m = c.material;
    if (c.isSprite || (m && m.depthTest === false)) {
      strays.push(c.type + (c.name ? ":" + c.name : ""));
    }
  });
  ok(strays.length === 0,
    "no world-sized overlay is a direct child of the RIG-scaled group" +
    (strays.length ? " — found " + strays.join(", ") : ""));

  const th = av.tagHolder;
  ok(th && Math.abs(th.scale.x - 1 / RIG.x) < 1e-6 &&
     Math.abs(th.scale.y - 1 / RIG.y) < 1e-6 &&
     Math.abs(th.scale.z - 1 / RIG.z) < 1e-6,
    "tagHolder still carries the exact inverse RIG scale");

  /* The visor silhouette specifically: right parent, right size once the
     inverse scale is applied, and off until a visor is picked up. */
  ok(!!av.xray, "the recon visor silhouette exists");
  ok(av.xray && av.xray.parent === th,
    "and hangs off tagHolder, not off the scaled group");
  ok(av.xray && av.xray.visible === false,
    "and is hidden until Net.setVisor turns it on");
  if (av.xray && av.xray.geometry && av.xray.geometry.parameters) {
    const gp = av.xray.geometry.parameters;
    ok(gp.height > 1.6 && gp.height < 2.1,
      "its height is operator-sized in WORLD units [" + gp.height.toFixed(2) + " m]");
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
