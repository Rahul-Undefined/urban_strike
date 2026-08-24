/* Remote-player presentation: avatar bodies, name tags, hp bars, and the
   per-weapon third-person models applied from snapshot wp indices. Pure
   rendering — no sockets, no interpolation, no game state. */
var Avatars = (function () {
  'use strict';

  /* ===== v10.9 - GEOMETRY IS SHARED, NOT MINTED PER MESH =====

     THE LEAK. Rahul: "one person drops at a time and after he refreshes the
     browser and again joins". One client at a time, recoverable by reload, is
     a client-side resource exhaustion — not the server, which would have
     dropped everybody together.

     Two call sites built `new THREE.BoxGeometry` on every invocation and
     nothing in this file ever called `dispose()` — the word appeared ZERO
     times in 651 lines, while four other client files use it correctly. So:

       setRemoteGun()  every weapon switch by any remote player tore down the
                       old gun with h.remove() and built a new one. Removing an
                       Object3D from a parent does NOT free its GPU buffers;
                       three.js requires an explicit dispose. 6-15 geometries
                       orphaned per switch, per remote player, forever.

       removeRemote()  a leaver's 13 body geometries and two canvas textures
                       were abandoned the same way.

     A rejoin arrives under a NEW socket id, so every other client builds a
     fresh avatar and strands the old one. That is why it cascades: each drop
     makes every surviving browser heavier and the next drop likelier.

     THE FIX IS NOT "call dispose in more places". Geometry here is immutable —
     nothing in this file reads or writes `.geometry` after construction, and
     every box size is a literal. So a box of a given size is built ONCE and
     shared by every mesh that needs it. Allocation stops being per-event and
     becomes per-distinct-size: bounded at a few hundred for the life of the
     page, no matter how long the match runs or how often anyone swaps.

     What is still per-avatar, and therefore still must be disposed, is the two
     CanvasTextures (name tag, hp bar) and their SpriteMaterials. See
     disposeAvatar() at the foot of this file.

     DO NOT dispose anything reachable from here. AVM, RGM and accentCache are
     module-level and shared; freeing one turns every other operator black. */
  /* v10.10: shared by every avatar's visor silhouette. Sized to the standing
     capsule rather than the body mesh — a blob that reads at 40 m through three
     walls is more useful than an accurate outline nobody can resolve. */
  var XRAY_GEO = new THREE.BoxGeometry(0.62, 1.86, 0.42);
  var XRAY_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4d4d, transparent: true, opacity: 0.42,
    depthTest: false, depthWrite: false
  });

  var geoCache = {};
  function boxGeo(w, h, d) {
    var k = w + '|' + h + '|' + d;
    return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d));
  }

  function nameTag(text, color) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.font = 'bold 34px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(10,12,16,0.6)';
    var w = g.measureText(text).width + 26;
    g.fillRect(128 - w / 2, 8, w, 46);
    g.fillStyle = color;
    g.fillText(text, 128, 42);
    var t = new THREE.CanvasTexture(c);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(1.7, 0.42, 1);
    return s;
  }

  // ---------- third-person weapon models ----------
  var RGM = {
    dark: new THREE.MeshLambertMaterial({ color: 0x23262c }),
    steel: new THREE.MeshLambertMaterial({ color: 0x54595f }),
    wood: new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
    tan: new THREE.MeshLambertMaterial({ color: 0x4a4438 }),
    green: new THREE.MeshLambertMaterial({ color: 0x36402e })
  };
  function rgBox(g, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(boxGeo(w, h, d), m);
    b.position.set(x, y, z); g.add(b); return b;
  }
  function buildRemoteGun(name) {
    var w = CFG.WEAPONS[name] || CFG.WEAPONS.ak47;
    var g = new THREE.Group();
    if (w.type === 'melee') {
      rgBox(g, 0, 0, -0.12, 0.02, 0.05, 0.26, RGM.steel);
      rgBox(g, 0, -0.02, 0.04, 0.035, 0.06, 0.1, RGM.wood);
      return g;
    }
    if (name === 'pistol') {
      rgBox(g, 0, 0, -0.08, 0.05, 0.07, 0.22, RGM.dark);
      rgBox(g, 0, -0.07, 0.02, 0.045, 0.1, 0.06, RGM.dark);
      return g;
    }
    if (w.type === 'rocket') {
      rgBox(g, 0, 0.02, -0.1, 0.11, 0.11, 0.85, RGM.green);
      rgBox(g, 0, 0.02, -0.55, 0.13, 0.13, 0.1, RGM.dark);
      return g;
    }
    var LEN = { sniper: 0.9, awm: 0.98, mk14: 0.82, m249: 0.78, shotgun: 0.68, scarh: 0.66, ak47: 0.64, m4a1: 0.64, uzi: 0.4, p90: 0.44, aa12: 0.62 };
    var len = LEN[name] || 0.62;
    var bodyM = (name === 'ak47' || name === 'mk14') ? RGM.wood
      : (name === 'm249' || name === 'sniper') ? RGM.green
      : (name === 'scarh' || name === 'awm') ? RGM.tan : RGM.dark;
    rgBox(g, 0, 0, -len * 0.28, 0.07, 0.095, len, bodyM);                    // body
    rgBox(g, 0, 0.005, -len * 0.78, 0.03, 0.035, len * 0.5, RGM.dark);       // barrel
    var magB = rgBox(g, 0, -0.1, -0.06, 0.05, 0.13, 0.07, RGM.dark);         // magazine
    rgBox(g, 0, -0.02, 0.2, 0.05, 0.08, 0.16, bodyM);                        // stock
    if (w.scope) rgBox(g, 0, 0.085, -0.12, 0.045, 0.05, 0.2, RGM.dark);      // scope
    if (name === 'm249') rgBox(g, 0, -0.08, 0.02, 0.1, 0.12, 0.12, RGM.green); // belt box
    if (name === 'shotgun') rgBox(g, 0, -0.045, -0.34, 0.05, 0.05, 0.16, RGM.wood); // pump
    if (name === 'aa12') rgBox(g, 0, -0.1, -0.08, 0.11, 0.11, 0.11, RGM.steel);     // drum mag
    if (name === 'p90') { magB.visible = false; rgBox(g, 0, 0.075, -0.05, 0.05, 0.03, 0.26, RGM.steel); } // top mag
    return g;
  }
  // Swap the avatar's held model whenever the snapshot weapon index changes.
  function setRemoteGun(r, wpIdx) {
    var name = CFG.WEAPON_ORDER[wpIdx] || 'ak47';
    if (r.gunName === name) return;
    r.gunName = name;
    var h = r.av.gun;
    while (h.children.length) h.remove(h.children[0]);
    h.add(buildRemoteGun(name));
  }

  /* ==========================================================================
     TACTICAL OPERATOR RIG (v7.9)
     ==========================================================================
     The old avatar was seven boxes with a 0.30 m cube for a head on a 0.70 m
     torso — cartoon proportions next to a city that now has brick courses and
     shop counters. It also minted THREE new materials per avatar instance, so
     ten players cost thirty materials and ~140 draw calls: more than the entire
     Urban map.

     What changed:

     MATERIALS ARE SHARED. Every body material is module-level and built once.
     The only per-player material is the identity accent, cached by colour, so
     ten players sharing two team colours cost two accent materials, not thirty.

     REAL JOINTS. Limbs hang from nested Groups placed at the hip, knee,
     shoulder and elbow, so a thigh rotates about the hip instead of scissoring
     about its own centre. Groups are free — this costs zero draw calls and is
     the difference between walking and swimming.

     CROUCH BENDS THE KNEES. It used to be `group.scale.y = 0.72`, which
     squashed the head too. Crouch and prone are now poses, not scaling.

     EQUIPMENT IS MODULAR. Helmet, vest and backpack are built once per avatar
     and toggled with `.visible`. Three.js skips invisible objects entirely, so
     an unequipped player pays nothing for gear they are not wearing, and new
     equipment slots in the same way without a second character model.

     Budget: 12 parts unequipped, 15 fully kitted, plus the weapon group and two
     sprites. Small parts hide beyond 30 m where they cannot be resolved.
     ====================================================================== */
  var AVM = {
    skin:    new THREE.MeshLambertMaterial({ color: 0x9c8468 }),
    /* v8.17: was 0x4c5344, a realistic olive that Rahul could not pick out
       against asphalt, dirt and the green foliage — see his screenshot of six
       operators standing in the open that read as scenery. The rig now wears
       the player's IDENTITY ACCENT on shirt and trousers instead (see
       buildAvatar), so this is only the fallback for anything unaccented.
       Kept bright rather than realistic: readability beats camouflage in a
       4-player arena where you are supposed to find each other. */
    /* v8.23: TROUSERS ARE BACK TO A DARK NEUTRAL.

       v8.17 put the identity accent on shirt AND trousers to make players
       findable. It worked too well — Rahul's screenshot shows a featureless
       yellow slab, because arms, torso and legs were all one flat colour and
       nothing cast a readable edge against anything else. A silhouette needs
       internal contrast to look like a person rather than a crate.

       Torso keeps the accent, so team identity still reads at range. Legs go
       dark, which restores the waist line and the arm edges. Bright above,
       dark below is also the standard way this is done. */
    fatigue: new THREE.MeshLambertMaterial({ color: 0x2f3540 }),   // trousers
    webbing: new THREE.MeshLambertMaterial({ color: 0x2a2e26 }),   // boots, gloves, straps
    vest:    new THREE.MeshLambertMaterial({ color: 0x3a3f34 }),
    helmet:  new THREE.MeshLambertMaterial({ color: 0x33382e }),
    visor:   new THREE.MeshLambertMaterial({ color: 0x14181c }),
    pack:    new THREE.MeshLambertMaterial({ color: 0x40453a })
  };
  /* One material per DISTINCT colour, not one per player. */
  var accentCache = {};
  function accentMat(hex) {
    var k = String(hex);
    if (!accentCache[k]) accentCache[k] = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
    return accentCache[k];
  }

  function joint(parent, x, y, z) {
    var j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  }
  function part(parent, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(boxGeo(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    parent.add(b);
    return b;
  }

  /* v8.15 SILHOUETTE SCALE. Rahul: "the player body is very small, very tough
     to notice". The rig measures correctly against CFG.PLAYER.standH — this is
     not a bug, it is a readability problem. A realistically-proportioned
     operator at 60 m on a 200 m map is a few pixels.

     Scaled mostly in X and Z. Broadening the silhouette is what makes a target
     resolvable at range; height barely helps and growing Y pushes the feet
     through the floor, because the group origin sits at the capsule centre and
     the network pins it there. Y gets a token 1.04 so the head still reads
     above cover. Y stayed at 1.00 in the end: 1.04 measurably pushed the feet
     0.04 m through the floor at every stance, for no readability gain.

     THIS DOES NOT CHANGE THE HITBOX. Hit detection uses the CFG.PLAYER capsule,
     which is independent of the visual rig, so aim stays honest — the model is
     easier to SEE, not easier to hit. */
  /* v9.10: y 1.22 -> 1.301, tracking CFG.PLAYER.standH from 1.8 to 1.92 by the
     same 1.0667. The rig is proportioned against the capsule, so scaling one
     without the other is how a model ends up floating or with its head through
     the ceiling. x and z are UNCHANGED — a taller operator, not a wider one. */
  var RIG = { x: 1.52, y: 1.301, z: 1.52 };

  /* Growing Y is only safe with a matching lift. The group origin is pinned by
     the network to the CAPSULE CENTRE, and the legs hang half the stance height
     below it, so scaling Y by s drops the feet by half*(s-1) and buries them.
     poseAvatar adds that lift back, using the same half-height the capsule
     itself uses: 0.90 standing, 0.60 crouched, 0.35 prone. */
  var RIG_LIFT = RIG.y - 1;

  function buildAvatar(name, colorHex) {
    var accent = accentMat(colorHex);
    var g = new THREE.Group();
    g.scale.set(RIG.x, RIG.y, RIG.z);
    var detail = [];              // parts hidden at distance

    /* ---- lower body. Origin sits at the hip, as before, so camera height,
       name tag and hp bar offsets are unchanged. ---- */
    var hipL = joint(g, -0.115, -0.02, 0);
    var hipR = joint(g, 0.115, -0.02, 0);
    [hipL, hipR].forEach(function (hip) {
      part(hip, 0, -0.21, 0, 0.155, 0.42, 0.175, AVM.fatigue);     // thigh
      var knee = joint(hip, 0, -0.42, 0);
      part(knee, 0, -0.20, 0, 0.135, 0.40, 0.155, AVM.fatigue);    // shin
      var boot = part(knee, 0, -0.43, 0.025, 0.155, 0.14, 0.245, AVM.webbing);
      detail.push(boot);
      hip.knee = knee;
    });

    /* ---- torso ---- */
    var spine = joint(g, 0, 0.02, 0);
    part(spine, 0, 0.12, 0, 0.34, 0.24, 0.22, accent);             // abdomen
    var chest = part(spine, 0, 0.40, 0, 0.42, 0.32, 0.25, accent);
    /* Identity colour lives on the SLEEVES, not on separate patch meshes. Two
       fewer parts per player, and a coloured upper arm reads at twice the
       distance a shoulder patch does. */

    /* ---- head + neck.
       v8.32: there was a 0.079 m gap between the top of the chest and the
       bottom of the head with NOTHING in it, so the head read as a box
       balanced on the shoulders. Rahul: "it is like a square box on top of the
       body without the neck."

       A short neck now bridges that gap, overlapping both ends slightly so
       there is no seam. The head itself was 0.296 wide but 0.312 DEEP — deeper
       than it was wide, which is what made it read as a crate rather than a
       head. It is now slightly taller and slightly shallower, so the
       proportions read as a person while the silhouette stays exactly as wide.
       Nothing here shrinks the body: width is untouched, and total height goes
       UP by 0.031 m, which the hitbox follows (see HEAD below). ---- */
    var neck = joint(spine, 0, 0.625, 0);
    part(neck, 0, -0.030, 0, 0.115, 0.085, 0.115, AVM.skin);        // neck
    var headMesh = part(neck, 0, 0.118, 0, 0.195, 0.235, 0.185, AVM.skin);   // head

    /* ---- arms ---- */
    function buildArm(sx) {
      var sh = joint(spine, sx * 0.245, 0.495, 0);
      part(sh, 0, -0.145, 0, 0.115, 0.29, 0.13, accent);                // upper arm = team colour
      var el = joint(sh, 0, -0.29, 0);
      part(el, 0, -0.14, 0, 0.10, 0.30, 0.115, AVM.webbing);            // forearm + glove
      sh.elbow = el;
      return sh;
    }
    var armL = buildArm(-1), armR = buildArm(1);

    /* ---- modular equipment: built once, toggled by .visible ---- */
    /* Equipment is deliberately ONE mesh each plus a single accent band. Every
       extra greeble multiplies by the player count, and a mag pouch is not
       resolvable at the range you actually see other players. */
    var vest = part(spine, 0, 0.39, -0.02, 0.445, 0.30, 0.30, AVM.vest);
    vest.visible = false;
    var helmet = part(neck, 0, 0.185, 0.005, 0.235, 0.145, 0.25, AVM.helmet);
    part(helmet, 0, 0.03, 0.13, 0.17, 0.06, 0.02, accent);              // team band
    helmet.visible = false;
    var pack = part(spine, 0, 0.34, 0.19, 0.30, 0.34, 0.14, AVM.pack);
    pack.visible = false;

    /* ---- weapon holder, parented to the RIGHT HAND so it follows the arm ---
       v8.32: was (0, -0.28, -0.06), which hung the weapon a full forearm below
       the elbow. Combined with the forward shoulder rotation and the rig's
       non-uniform scale that threw it 0.79 m clear of the chest. */
    var gun = new THREE.Group();
    gun.position.set(0, -0.12, 0.10);
    armR.elbow.add(gun);

    /* v8.16: NAMEPLATE AND HP BAR GO IN A COUNTER-ROTATED HOLDER.

       They used to be direct children of the group. Prone rotates the group
       ~83 degrees about X, which swung the tag from 1.16 m above the head to
       roughly the same distance out IN FRONT of the body at ground level —
       so it read as "the name tag vanished" when it had actually been laid
       flat on the floor with the player.

       A holder at the group origin, counter-rotated by exactly the group's own
       rotation, cancels it for its children while leaving the body posed. Its
       inverse scale also undoes the RIG stretch, so a 1.52x-wide operator does
       not get a 1.52x-wide smeared nameplate. */
    var tagHolder = new THREE.Group();
    tagHolder.scale.set(1 / RIG.x, 1 / RIG.y, 1 / RIG.z);
    g.add(tagHolder);
    var tag = nameTag(name, colorHex);
    tag.position.y = 1.16 * RIG.y; tagHolder.add(tag);
    var hc = document.createElement('canvas'); hc.width = 128; hc.height = 18;
    var htx = new THREE.CanvasTexture(hc);
    var hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: htx, depthTest: false, transparent: true }));
    hs.scale.set(0.92, 0.13, 1);
    hs.position.y = 0.98 * RIG.y; hs.visible = false; tagHolder.add(hs);
    var hb = { sprite: hs, canvas: hc, ctx: hc.getContext('2d'), tex: htx };

    /* ===== v10.10 RECON VISOR SILHOUETTE ===== (placed correctly in v10.12)

       A single box drawn with depthTest OFF and a high renderOrder, so it
       paints over whatever is in front of it. Hidden by default; Net toggles it
       when the local player is wearing a visor.

       WHY IT IS PARENTED TO tagHolder AND NOT TO g.

       v10.10 added it straight to `g` with `position.y = RIG.y * 0.95`. That
       was wrong twice over, and wrong in a way nothing would have reported:

         g.scale is (1.52, 1.301, 1.52). A child of g is scaled by that, so the
         0.62 x 1.86 x 0.42 box rendered at 0.94 x 2.42 x 0.64 — a marker half a
         metre taller than the operator it marks.

         Local position is scaled too, so y = RIG.y * 0.95 = 1.236 landed at
         1.236 * 1.301 = 1.61 above the group origin — floating over the head
         rather than on the body.

       And because g is ROTATED for prone (~83 degrees about X), the box would
       have swung out flat in front of a prone player, marking empty floor.

       tagHolder already solves all three. It carries the inverse RIG scale and
       is counter-rotated every frame by poseAvatar, which is exactly why the
       nameplate and hp bar live there. Its children work in world units, so
       -0.27 is the standing group lift (halfNow * RIG_LIFT = 0.9 * 0.301) put
       back, landing the box on the capsule centre.

       WHY A SEPARATE MESH RATHER THAN RE-MATERIALISING THE BODY. v10.9 made
       every avatar material SHARED across all players — that was the fix for
       the disconnect leak. Setting depthTest = false on a body material to show
       one player through a wall sets it on EVERY player, including the ones you
       are meant to have to find.

       Geometry and material are module-level and shared, so this costs one mesh
       per avatar and nothing per frame. disposeAvatar must NOT free them; it
       names the four resources it owns and this is not among them. */
    var xray = new THREE.Mesh(XRAY_GEO, XRAY_MAT);
    xray.position.y = -(0.9 * RIG_LIFT);
    xray.visible = false;
    xray.renderOrder = 9998;
    xray.matrixAutoUpdate = false; xray.updateMatrix();
    tagHolder.add(xray);

    return {
      group: g, gun: gun, head: neck, headMesh: headMesh, torso: chest, spine: spine, hb: hb, tag: tag,
      xray: xray,
      tagHolder: tagHolder,
      hipL: hipL, hipR: hipR, armL: armL, armR: armR,
      helmet: helmet, vest: vest, pack: pack, detail: detail,
      legL: hipL, legR: hipR,                       // back-compat aliases
      phase: 0, breath: 0
    };
  }

  /* ---- equipment from network state. Called only when a tier changes. ---- */
  function setGear(av, helmLvl, armorLvl) {
    var h = helmLvl > 0, v = armorLvl > 0;
    if (av.helmet.visible !== h) av.helmet.visible = h;
    if (av.vest.visible !== v) av.vest.visible = v;
    /* The pack mesh is built and wired but stays hidden: no item grants it yet,
       and a backpack nobody picked up is decoration that multiplies by ten.
       The slot is here so a real backpack item is a one-line change, not a
       second character model. */
  }

  /* ==========================================================================
     POSE. One call per visible remote per frame. Everything here is a Group
     rotation or position — no geometry is rebuilt, no material is touched.
     s = { moved, run, crouch, prone, dead, deadT, rx, lean, dist, dt }
     ====================================================================== */
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function angDiff(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* s = { moved, mx, mz, run, crouch, prone, dead, deadT, rx, ry, lean,
           reloading, dist, dt }
     mx/mz are the LOCAL movement direction (already rotated into the avatar's
     own frame by the caller), which is what makes strafing readable. Nothing
     here is networked: direction, turn rate and stride are all derived from
     interpolated position and yaw. */
  function poseAvatar(av, s) {
    var k = Math.min(1, s.dt * 10);
    var kSlow = Math.min(1, s.dt * 5.5);

    var showDetail = s.dist < 30;
    if (av.detailShown !== showDetail) {
      av.detailShown = showDetail;
      for (var i = 0; i < av.detail.length; i++) av.detail[i].visible = showDetail;
    }

    if (s.dead) {
      /* Three stages rather than one topple: the knees give, the spine folds,
         then the body rolls. Arms trail instead of staying welded to the gun. */
      /* v8.26: collapse compressed 0.85s -> 0.50s.

         Rahul wants a body gone 0.80s after the kill. The old fall took 0.85s
         on its own, so at that window the corpse would have been deleted
         mid-topple — you would see it start to fall and get cut off, which
         looks like a rendering fault rather than a fast kill.

         Shortening the fall keeps the sequence whole inside the budget:
         0.50s to go down, a short beat, then the fade in net.js finishes at
         0.80s. Same three stages, same shapes, just quicker. */
      var t = Math.min(1, s.deadT / 0.50);
      var e = t * t * (3 - 2 * t);
      var late = Math.max(0, (t - 0.35) / 0.65);
      av.hipL.rotation.x = e * 1.2; av.hipR.rotation.x = e * 1.0;
      av.hipL.knee.rotation.x = -e * 2.0; av.hipR.knee.rotation.x = -e * 1.7;
      av.spine.rotation.x = e * 0.62; av.spine.rotation.z = late * 0.25;
      av.spine.position.y = 0.02 - e * 0.18;
      av.armL.rotation.x = -e * 1.0; av.armR.rotation.x = -e * 0.75;
      av.armL.rotation.z = e * 0.62; av.armR.rotation.z = -e * 0.55;
      av.armL.elbow.rotation.x = -0.62 * (1 - late);
      av.armR.elbow.rotation.x = -0.75 * (1 - late);
      av.head.rotation.x = e * 0.45;
      av.group.rotation.z = e * 1.52;
      av.group.rotation.x = late * 0.22;
      /* v8.21 THE CORPSE WAS FALLING THROUGH THE WORLD.

         This line used to read `av.group.position.y -= e * 0.32`, a
         subtraction applied EVERY FRAME. Over the 0.85 s collapse that is
         roughly fifty frames each taking up to another 0.32 m, so the body
         sank about sixteen metres into the ground inside a second. Rahul saw
         a player "just vanish" and assumed there was no death animation at
         all — there was a three-stage one, it was simply happening underground
         after the first few frames.

         Now absolute: settle 0.32 m from wherever the network says the body
         is, and stay there. */
      var restY = (typeof av.baseY === 'number' && isFinite(av.baseY)) ? av.baseY : av.group.position.y;
      av.group.position.y = restY - e * 0.32;

      /* The name stays up over the body while it lies there — a marker for who
         died and where, readable across the fight, which is what makes a kill
         legible to everyone else. It fades with the corpse. */
      if (av.tagHolder) {
        av.tagHolder.rotation.x = -av.group.rotation.x;
        av.tagHolder.rotation.z = -av.group.rotation.z;
        av.tagHolder.position.y = 0.55 * e;
      }
      if (av.tag) { av.tag.visible = true; av.tag.material.depthTest = false; }
      if (av.hb && av.hb.sprite) av.hb.sprite.visible = false;
      return;
    }

    // ---------- stance ----------
    /* Stance blends seed at ZERO (standing), not at the current target. Seeding
       at the target made the first frame snap straight into the pose, so a
       player who spawned crouched popped into it — and it made "prone is slower
       than crouch" untestable because both reached 1 immediately. */
    var crouchT = s.crouch ? 1 : 0, proneT = s.prone ? 1 : 0;
    if (av.cT === undefined) { av.cT = 0; av.pT = 0; }
    av.cT = lerp(av.cT, crouchT, k);
    /* Prone uses a SLOWER blend than crouch on purpose. Dropping flat is a
       commitment in this game and it should look like one — going down and
       getting up both read as a real transition rather than a snap. */
    av.pT = lerp(av.pT, proneT, kSlow);
    var c = av.cT, p = av.pT;

    /* Crouch bend retuned in v8.15. The old figures left the feet 0.17 m under
       the floor once the double-counted drop was removed, because the legs
       were only compressing to 0.74 m while the capsule centre sits at 0.60.
       The legs have to fold enough to meet the centre the network dictates,
       not the other way round. Measured, not guessed: feet land at -0.01. */
    var hipCrouch = c * 1.32 + p * 0.30;
    var kneeCrouch = -c * 2.05 - p * 0.45;
    /* v8.15 STANCE HEIGHT WAS DOUBLE-COUNTED.

       net.js:343 sets av.baseY = renderPos.y, and renderPos.y is the CAPSULE
       CENTRE. controller.js reassigns halfY = halfH() on every stance change
       (lines 31, 210, 215), so the centre ALREADY drops when a player crouches
       or goes prone: 0.90 standing, 0.60 crouched, 0.35 prone.

       This function then subtracted the drop a second time. Measured on the
       real rig, feet relative to the ground:

           stand   -0.04    (about right)
           crouch  -0.14    (buried)
           prone   -0.46    (more than half the body underground)

       A prone body is 0.70 m thick. Sunk 0.46, only the weapon — carried
       forward and above the torso — still cleared the floor, which is exactly
       what Rahul filmed: "it vanishes, only the gunshots are visible."

       The network carries the whole vertical story. Do not re-apply it here.
       The spine offsets below are POSTURE inside the body and stay, but the
       crouch figure was tuned against the double-counted position, so it is
       retuned to sit the feet on the floor. */
    av.spine.position.y = 0.02 - c * 0.12 - p * 0.30;
    av.spine.rotation.x = c * 0.22 + p * 0.10;
    /* v8.35 PRONE WAS LYING BACKWARDS.

       Rotation about X maps +Y -> (0, cos, sin) and +Z -> (0, -sin, cos). The
       rig's forward is +Z (the boot toe is offset +0.025 in Z and the rifle is
       carried at +Z). So laying a body face-down with the head forward needs
       the head to travel +Y -> +Z, which is sin = +1, which is a POSITIVE
       rotation.

       It was negative. Measured on the real rig, prone put the head at
       z -0.54 and the feet at z +1.01: the operator was laid out on their BACK,
       feet-first, crawling backwards. The belly faced the sky, and because the
       arms were still posed for standing they swung upward with it, leaving the
       rifle pointing at the clouds 0.49 m above the body.

       One character. Everything downstream follows, including hit detection —
       v8.32 made the head box read the rendered head's world position, so a
       correctly-rotated body carries its own hitbox with it for free. */
    av.group.rotation.x = p * (Math.PI / 2) * 0.92;
    /* NaN GUARD. baseY is written by net.js every frame, but poseAvatar can
       run before the first renderPos exists — a fresh join, a respawn, a
       dropped snapshot. `undefined - p * 0.55` is NaN, Three.js skips an
       object with a NaN matrix entirely, and NaN is STICKY because baseY is
       only ever read. The avatar goes invisible AND stops moving, forever,
       while the local frame keeps rendering. That is the "frozen player"
       report, and it only ever bites remote avatars, which is why it was
       invisible in single-player testing. */
    /* Lift by half the stance height times the rig's Y growth, so the feet
       stay planted whether standing, crouched or flat. Same half-heights the
       capsule uses. */
    var halfNow = 0.9 - c * 0.30 - p * 0.55;
    if (typeof av.baseY === 'number' && isFinite(av.baseY))
      av.group.position.y = av.baseY + halfNow * RIG_LIFT;
    if (av.tagHolder) { av.tagHolder.rotation.x = -av.group.rotation.x; av.tagHolder.rotation.z = 0; av.tagHolder.position.y = 0; }

    // ---------- locomotion ----------
    var speed = s.moved / Math.max(0.0001, s.dt);
    var fwd = s.mz || 0, side = s.mx || 0;          // local, -1..1
    av.phase += s.moved * (s.run ? 2.5 : 3.1);
    var amp = s.moved > 0.0005 ? Math.min(1, speed / (s.run ? 7.0 : 4.2)) : 0;
    av.amp = lerp(av.amp === undefined ? 0 : av.amp, amp, k * 0.8);
    av.fwd = lerp(av.fwd === undefined ? 0 : av.fwd, fwd, k);
    av.side = lerp(av.side === undefined ? 0 : av.side, side, k);
    var A = av.amp * (1 - c * 0.45) * (1 - p * 0.8);

    var sw = Math.sin(av.phase), swb = Math.sin(av.phase + Math.PI);
    /* STRAFING. A soldier moving sideways does not swing their legs fore-and-aft
       — they step out and cross over. Forward swing scales with how much of the
       motion is forward; the sideways component opens the hips instead. */
    var fA = A * Math.abs(av.fwd), sA = A * Math.abs(av.side);
    var backing = av.fwd < -0.25 ? -1 : 1;
    av.hipL.rotation.x = hipCrouch + sw * 0.62 * fA * backing;
    av.hipR.rotation.x = hipCrouch + swb * 0.62 * fA * backing;
    av.hipL.rotation.z = -av.side * 0.10 - Math.max(0, sw) * 0.26 * sA;
    av.hipR.rotation.z = -av.side * 0.10 + Math.max(0, swb) * 0.26 * sA;
    av.hipL.knee.rotation.x = kneeCrouch - Math.max(0, -sw) * (1.0 * fA + 0.55 * sA) - 0.06;
    av.hipR.knee.rotation.x = kneeCrouch - Math.max(0, -swb) * (1.0 * fA + 0.55 * sA) - 0.06;

    /* TURNING. Yaw rate leans the torso into the turn and counter-rotates the
       shoulders slightly, which is most of what stops a strafing player from
       looking like they are on rails. */
    var yawRate = 0;
    if (av.lastRy !== undefined) yawRate = angDiff(av.lastRy, s.ry) / Math.max(0.0001, s.dt);
    av.lastRy = s.ry;
    av.turn = lerp(av.turn === undefined ? 0 : av.turn, Math.max(-2.6, Math.min(2.6, yawRate)), k * 0.7);
    var turnLean = Math.max(-0.16, Math.min(0.16, av.turn * 0.075));

    // ---------- upper body ----------
    av.breath += s.dt * (s.run ? 2.9 : 1.6);
    var br = Math.sin(av.breath) * (0.012 + av.amp * 0.010);
    var aim = -s.rx * 0.62;
    var bob = Math.sin(av.phase * 2) * 0.012 * A;
    av.spine.position.y += bob;
    av.spine.rotation.y = -turnLean * 0.9 + av.side * 0.12;
    av.spine.rotation.z = turnLean + av.side * 0.06;

    /* RELOAD. The support hand drops to the magazine well and comes back, the
       weapon tips down, and the head follows it — read at a glance, and it is
       the only tell that a defender is briefly harmless. */
    var rl = s.reloading ? 1 : 0;
    av.rT = lerp(av.rT === undefined ? rl : av.rT, rl, Math.min(1, s.dt * 7));
    var R = av.rT;
    var pump = Math.sin(av.breath * 3.4) * 0.5 + 0.5;

    /* v8.21 WEAPON IS CARRIED, NOT CARRIED AROUND.

       Rahul: "it is always in one position standing gun down... while shooting
       as well the avatar figure is holding the gun down."

       He was right and the numbers show why. The right arm sat at -0.62 rad,
       about 35 degrees forward of hanging — a low-ready at best, and from any
       distance it reads as a man walking about with a rifle by his knee. The
       weapon is welded to armR.elbow, so the arm angle IS the gun angle;
       nothing else could lift it.

       Raised to a chest carry: shoulders driven further forward, elbows folded
       harder to bring the stock in rather than pushing the muzzle out, and the
       support arm crossed further so both hands read as on the weapon. `aim`
       still adds on top when a remote player is ADS, so scoping is still a
       visible change in silhouette rather than the new resting pose. */
    /* v8.32 THE WEAPON WAS BEING CARRIED AT ARM'S LENGTH.

       v8.21 fixed "standing gun down" by driving the shoulders to -1.18 rad and
       folding the elbows to -1.02. The intent in that commit was to "bring the
       stock in rather than pushing the muzzle out". Measured, it did the
       opposite: the weapon ended up 0.79 m in FRONT of the chest and 0.13 m
       ABOVE it, which on screen reads as arms thrust up in a V with the rifle
       floating detached beside the body.

       The cause is not the angles alone. RIG scales X and Z by 1.52 but Y by
       only 1.22, so a limb rotated toward horizontal is stretched 1.52x while
       the same limb hanging down is stretched 1.22x. Rotating the shoulder
       forward therefore does not just swing the arm — it LENGTHENS it by 25%.
       Angles alone could not bring the weapon closer than 0.56 m; the mount
       offset had to move with them.

       Solved together rather than guessed: shoulder -0.40, elbow -1.10, and the
       weapon remounted from (0,-0.28,-0.06) to (0,-0.12,+0.10). Result is the
       weapon at 0.36 m forward and 0.62 m up — chest height, close to the body,
       and 0.22 m from the elbow, comfortably inside a forearm's reach so the
       hands read as being ON it. `aim` still adds on top for ADS. */
    /* v8.35 PRONE NEEDS ITS OWN ARM POSE.

       Correcting the body rotation is only half of it. A standing carry rotated
       83 degrees puts the arms wherever the torso throws them — with the old
       backwards rotation that was straight up, and even with the corrected one
       it would drive the rifle down into the ground, because the arms hang
       along local -Y and local -Y now points backwards and down.

       Prone shoulders have to reach the other way. Solved numerically against
       the corrected body rather than guessed: shoulder -1.90 and elbow +0.20
       relative to the standing pose put the weapon at z +0.65 — forward of the
       head — and y -0.12, which is 0.23 m above the deck. Reach from the elbow
       stays 0.21 m, well inside a forearm, so the hands still read as on it.

       Blended by `p`, so the transition in and out of prone is the same smooth
       lerp every other stance uses. */
    var proneArm = p * 1.90, proneElbow = p * 0.20;
    av.armR.rotation.x = -0.40 + aim + swb * 0.16 * fA + br - R * 0.16 - proneArm;
    av.armR.rotation.z = -0.20;
    av.armR.elbow.rotation.x = -1.10 - R * 0.18 + proneElbow;
    av.armL.rotation.x = -0.58 + aim + sw * 0.16 * fA + br + R * (0.55 + pump * 0.35) - proneArm;
    av.armL.rotation.z = 0.34 - R * 0.30;
    av.armL.elbow.rotation.x = -1.24 - R * (0.45 + pump * 0.30) + proneElbow;
    /* v8.35: the weapon counter-rotates by exactly the body's prone rotation,
       so the barrel stays level with the WORLD while the operator lies flat.
       Solved numerically at -1.45 rad and then written as the negated body
       rotation, because that is what it physically is — if the 0.92 lie-flat
       factor is ever retuned the barrel follows instead of silently drifting
       back into the dirt. Without this the muzzle buried 0.76 m underground. */
    av.gun.rotation.x = R * 0.42 - p * (Math.PI / 2) * 0.92;
    av.gun.rotation.z = R * 0.18;

    av.torso.scale.z = 1 + br * 1.4;
    av.head.rotation.x = -s.rx * 0.5 + R * 0.18;
    av.head.rotation.y = -av.side * 0.10;
    av.group.rotation.z = -s.lean * 0.18;
  }

  /* v8.31 THE TEAM-MODE BUG. THIS ONE LINE.

     `myTeam` is declared `var myTeam = null` INSIDE the Net IIFE in net.js.
     It was never visible here, so reading it bare threw ReferenceError.

     It only ever fired for an ALLY, because of short-circuit evaluation:
       ally ? (myTeam ? ...) : '#e8563e'
     With `ally` false the expression resolves to the enemy colour and never
     touches `myTeam`. In FFA `myTeam` is null, so `ally` is ALWAYS false and
     the branch is unreachable — which is exactly why free-for-all was flawless
     while every team match broke. The first time a teammate's bar needed
     drawing (hbDrawn starts at -1 against dispHp 100, so the very first frame
     they are visible) this threw.

     The throw landed inside Net.updateRemotes(), which the render loop calls
     BEFORE FX.update, Pickups.update, Minimap.update, the match clock and the
     team score. Before v8.30 it also skipped renderer.render() outright: the
     black screen. v8.30's error boundary let the frame render, which turned the
     fatal into the visible symptom that finally identified it — muzzle flashes
     and tracers that never age out, a clock frozen at 10:00, and a team score
     stuck at 0-0.

     minimap.js already did this correctly: `var myTeam = Net.getMyTeam();`. */
  function drawHpBar(r, ally) {
    var g = r.av.hb.ctx, W = 128, H = 18;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,14,0.78)';
    g.fillRect(0, 2, W, H - 4);
    var frac = Math.max(0, Math.min(1, r.dispHp / CFG.PLAYER.hp));
    var mt = (typeof Net !== 'undefined' && Net.getMyTeam) ? Net.getMyTeam() : null;
    var allyColor = (mt && CFG.TEAMS[mt]) ? CFG.TEAMS[mt].color : '#63d968';
    g.fillStyle = ally ? allyColor : '#e8563e';
    g.fillRect(2, 4, (W - 4) * frac, H - 8);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 3, W - 2, H - 6);
    r.av.hb.tex.needsUpdate = true;
  }

  /* v8.32: the half-extent of the RENDERED head, derived from the very numbers
     the head mesh is built from above (0.195 x 0.235 x 0.185) times RIG. Hit
     detection imports this instead of keeping its own copy, so resizing the
     head resizes the box that protects it. A little generosity is deliberate:
     rounding UP never makes a visible head unhittable. */
  var HEAD_HALF = {
    x: (0.195 * RIG.x) / 2 + 0.02,
    y: (0.235 * RIG.y) / 2 + 0.02,
    z: (0.185 * RIG.z) / 2 + 0.02
  };

  /* ===== v10.9 - FREE WHAT IS ACTUALLY PER-AVATAR =====

     With geometry shared (see boxGeo at the head of this file) an avatar owns
     exactly four disposable things: a 256x64 name-tag CanvasTexture, a 128x18
     hp-bar CanvasTexture, and the SpriteMaterial wrapping each. Nothing else
     here is unique to one player.

     This is deliberately NOT a generic scene-graph walk that disposes every
     geometry and material it finds. Such a walk is the obvious implementation
     and it is wrong in this file: it would free AVM.skin, AVM.fatigue, the
     RGM gun materials and the cached accent the moment ANY player left, and
     every remaining operator would render black. Naming the four owned
     resources explicitly is what makes that impossible.

     Called from net.js removeRemote(). Safe to call twice. */
  function disposeAvatar(av) {
    if (!av || av.disposed) return;
    av.disposed = true;
    var owned = [av.tag, av.hb && av.hb.sprite];
    for (var i = 0; i < owned.length; i++) {
      var s = owned[i];
      if (!s || !s.material) continue;
      if (s.material.map) s.material.map.dispose();
      s.material.dispose();
      if (s.parent) s.parent.remove(s);
    }
    if (av.hb) { av.hb.canvas = null; av.hb.ctx = null; av.hb.tex = null; }
  }

  return {
    RIG: RIG,                      // v8.19: hit detection must use these too
    HEAD_HALF: HEAD_HALF,          // v8.32: and the head box comes from here
    buildAvatar: buildAvatar,
    disposeAvatar: disposeAvatar,
    setRemoteGun: setRemoteGun,
    drawHpBar: drawHpBar,
    setGear: setGear,
    poseAvatar: poseAvatar,
    XRAY_MAT: XRAY_MAT
  };
})();
