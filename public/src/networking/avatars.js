/* Remote-player presentation: avatar bodies, name tags, hp bars, and the
   per-weapon third-person models applied from snapshot wp indices. Pure
   rendering — no sockets, no interpolation, no game state. */
var Avatars = (function () {
  'use strict';
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
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
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
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
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
  var RIG = { x: 1.52, y: 1.22, z: 1.52 };

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

    /* ---- head. 0.21 wide against a 0.42 chest: roughly seven and a half
       heads tall, which is what makes a body read as a person. ---- */
    var neck = joint(spine, 0, 0.625, 0);
    part(neck, 0, 0.105, 0, 0.195, 0.21, 0.205, AVM.skin);

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

    /* ---- weapon holder, parented to the RIGHT HAND so it follows the arm --- */
    var gun = new THREE.Group();
    gun.position.set(0, -0.28, -0.06);
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

    return {
      group: g, gun: gun, head: neck, torso: chest, spine: spine, hb: hb, tag: tag,
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
      var t = Math.min(1, s.deadT / 0.85);
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
    av.group.rotation.x = -p * (Math.PI / 2) * 0.92;
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
    av.armR.rotation.x = -1.18 + aim + swb * 0.16 * fA + br - R * 0.16;
    av.armR.rotation.z = -0.20;
    av.armR.elbow.rotation.x = -1.02 - R * 0.18;
    av.armL.rotation.x = -1.34 + aim + sw * 0.16 * fA + br + R * (0.55 + pump * 0.35);
    av.armL.rotation.z = 0.40 - R * 0.30;
    av.armL.elbow.rotation.x = -0.94 - R * (0.45 + pump * 0.30);
    av.gun.rotation.x = R * 0.42;
    av.gun.rotation.z = R * 0.18;

    av.torso.scale.z = 1 + br * 1.4;
    av.head.rotation.x = -s.rx * 0.5 + R * 0.18;
    av.head.rotation.y = -av.side * 0.10;
    av.group.rotation.z = -s.lean * 0.18;
  }

  function drawHpBar(r, ally) {
    var g = r.av.hb.ctx, W = 128, H = 18;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,14,0.78)';
    g.fillRect(0, 2, W, H - 4);
    var frac = Math.max(0, Math.min(1, r.dispHp / CFG.PLAYER.hp));
    g.fillStyle = ally ? (myTeam ? CFG.TEAMS[myTeam].color : '#63d968') : '#e8563e';
    g.fillRect(2, 4, (W - 4) * frac, H - 8);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 3, W - 2, H - 6);
    r.av.hb.tex.needsUpdate = true;
  }

  return {
    RIG: RIG,                      // v8.19: hit detection must use these too
    buildAvatar: buildAvatar,
    setRemoteGun: setRemoteGun,
    drawHpBar: drawHpBar,
    setGear: setGear,
    poseAvatar: poseAvatar
  };
})();
