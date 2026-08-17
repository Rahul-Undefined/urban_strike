/* Weapons — everything the player holds and throws.
   Data-driven from CFG.WEAPONS / CFG.THROWS (edit shared-config.js to balance). */
var Weapons = (function () {
  var camera = null, scene = null;
  var rig = null;                 // viewmodel root, parented to the camera
  var models = {};                // weaponName -> THREE.Group
  var current = 'ak47';
  var ammo = {};                  // name -> {mag, reserve}
  var throwsLeft = { frag: 2, smoke: 1, flash: 1 };
  var droneCount = 0;                                    // v9.4, set by the server grant
  var nextFireAt = 0, reloadUntil = 0, boltUntil = 0, switchUntil = 0;
  var reloadingShell = false;
  var triggerDown = false, semiQueued = false;
  var kick = 0, meleeAnim = 0;
  var pumpAnim = 0, slideAnim = 0, recoilAccum = 0, reloadStartAt = 0, reloadDur = 0;
  var recPitch = 0, recYaw = 0;      // exact un-recovered recoil, in radians
  var atts = { sight: null, muzzle: null, mag: null };   // equipped attachments by slot
  var mineCount = 0;                                     // server-authoritative mirror
  var fires = [];                                        // my molotov burn areas
  var bullets = [];                                      // simulated sniper rounds (travel + drop)
  var zoomFov = null, lastScoped = false;                // sniper wheel-zoom state
  var owned = {};                                        // weapon name -> true
  var cooking = null;                                    // { end, beeped } while holding a live frag
  var BASE_WEAPONS = CFG.WEAPON_ORDER.filter(function (n) { return !CFG.WEAPONS[n].ex; });

  // Effective stats = base weapon modified by equipped attachments.
  function eff(name) {
    var w = CFG.WEAPONS[name];
    var e = { dmg: w.dmg, mag: w.mag, reload: w.reload, spread: w.spread, ads: w.ads,
      recoil: w.recoil, drift: w.drift || 0, adsFov: w.adsFov, speed: w.speed,
      quiet: false, noFlash: false, detectMs: CFG.NET.detectMs };
    var s = atts.sight && CFG.ATTACH[atts.sight];
    // v5.1: 4x/6x/8x are marksman-only (CFG.ATTACH[..].mark vs CFG.WEAPONS[..].mark).
    // The scope stays in your kit and works the moment you switch to a marksman
    // rifle — it just does nothing on an SMG.
    if (s && s.mark && !w.mark) s = null;
    if (s && !w.scope && w.type !== 'melee') {
      if (s.spreadMult) { e.spread *= s.spreadMult; e.ads *= s.spreadMult; }
      if (s.adsFov && w.type !== 'rocket') e.adsFov = s.adsFov;
    }
    var m = atts.mag && CFG.ATTACH[atts.mag];
    if (m && w.mag > 0) {
      if (m.magMult) e.mag = Math.round(w.mag * m.magMult);
      if (m.reloadMult) e.reload = w.reload * m.reloadMult;
    }
    var mu = atts.muzzle && CFG.ATTACH[atts.muzzle];
    if (mu && w.type !== 'melee' && w.type !== 'rocket') {
      if (mu.recoilMult) { e.recoil *= mu.recoilMult; e.drift *= mu.recoilMult; }
      if (mu.quiet) { e.quiet = true; e.detectMs = mu.detectMs || 1500; }
      if (mu.noFlash) e.noFlash = true;
    }
    return e;
  }
  function refreshHud() {
    var w = CFG.WEAPONS[current], a = ammo[current];
    UI.setWeapon(w.label, a.mag, a.reserve, throwsLeft);
    UI.setAttachments(atts);
    UI.setGear(mineCount, throwsLeft.molotov);
  }
  var projectiles = [];           // rockets + grenades (local sim on every client)
  var _vmDir = new THREE.Vector3();   // v9.12: reused for the viewmodel wall probe
  var tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function init(cam, sc) {
    camera = cam; scene = sc;
    rig = new THREE.Group();
    rig.position.set(0.26, -0.22, -0.5);
    camera.add(rig);
    models = WeaponModels.build();
    for (var k in models) { models[k].visible = false; rig.add(models[k]); }
    resetLoadout();
  }

  // Full reset at match start: back to the base 8, no attachments.
  /* v8.30 THE MISSING ONE-LINER THAT KILLED THREE GRENADES AND THE ROCKET.

     grenadeMesh() and spawnRocket() both called `mat(colour)`. That helper is
     defined privately inside pickups.js and viewmodels.js — two other IIFEs —
     so from in here it was simply an undefined identifier. Every call threw
     ReferenceError.

     Molotov survived only because its branch builds materials inline and
     returns BEFORE reaching the shared line, which is why "same function,
     works for one type and not the others" looked impossible: the bug was one
     level down, in the mesh builder, not in throwGrenade().

     The throw crashed inside hurl() before Net.sendThrow(), so the grenade
     never reached the server either, and the count had already been
     decremented — you heard the pin, lost the grenade, and saw nothing. */
  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }

  function matchReset() {
    owned = {};
    BASE_WEAPONS.forEach(function (n) { owned[n] = true; });
    atts = { sight: null, muzzle: null, mag: null };
    mineCount = CFG.GEAR.mine.start;
    /* v9.4: drones are per-MATCH. The server decides the real number (zero in
       bot modes) and corrects this on the first grant; starting at the config
       value keeps the HUD honest for the first second. */
    droneCount = 0;                 // v9.5: crate loot only, nobody spawns with one
    owned.drone = false;
    fires = [];
    cooking = null;
    UI.setAttachments(atts);
  }
  // Per-spawn refill: keep exclusives + attachments earned this match.
  function resetLoadout() {
    if (!owned.ak47) matchReset();
    for (var n in owned) {
      var w = CFG.WEAPONS[n];
      ammo[n] = { mag: eff(n).mag, reserve: w.reserve };
    }
    throwsLeft = { frag: CFG.THROWS.frag.count, smoke: CFG.THROWS.smoke.count, flash: CFG.THROWS.flash.count, molotov: CFG.THROWS.molotov.count };
    cooking = null; UI.setCooking(false, 0);
    setWeapon(owned[current] ? current : 'ak47', true);
  }
  // ---- loot grants (called by Net on server 'grant') ----
  function applyGrant(d) {
    if (d.t === 'weapon') {
      owned[d.w] = true;
      ammo[d.w] = { mag: eff(d.w).mag, reserve: CFG.WEAPONS[d.w].reserve };
      setWeapon(d.w, true);
      UI.toast(CFG.WEAPONS[d.w].label + ' acquired');
    } else if (d.t === 'ammoFor') {
      var a = ammo[d.w];
      /* v9.3: honour an explicit amount when the pickup states one (a Quiver is
         15 arrows, not "half a reserve"), and fall back to the old proportional
         top-up otherwise. If the player does not own the weapon the pickup is
         for, resupply what they DO carry rather than doing nothing — a pickup
         that visibly disappears and grants nothing reads as a lost item. */
      var bump = d.amount > 0 ? d.amount : Math.ceil(CFG.WEAPONS[d.w].reserve * 0.5);
      if (a) {
        a.reserve = Math.min(CFG.WEAPONS[d.w].reserve, a.reserve + bump);
        UI.toast(CFG.WEAPONS[d.w].label + ' ammo  +' + bump);
      } else {
        for (var q in owned) {
          var qw = CFG.WEAPONS[q];
          if (qw.reserve > 0 && ammo[q]) ammo[q].reserve = Math.min(qw.reserve, ammo[q].reserve + Math.ceil(qw.reserve * 0.25));
        }
        UI.toast('Ammo resupplied');
      }
    } else if (d.t === 'ammo') {
      for (var n in owned) {
        var w = CFG.WEAPONS[n];
        if (w.reserve > 0 && ammo[n]) ammo[n].reserve = Math.min(w.reserve, ammo[n].reserve + Math.ceil(w.reserve * 0.4));
      }
      UI.toast('Ammo resupplied');
    } else if (d.t === 'att') {
      var def = CFG.ATTACH[d.a];
      if (!def) return;
      atts[def.cat] = d.a;
      UI.toast(def.label + ' equipped');
      UI.setAttachments(atts);
      /* v9.5: FIT IT TO THE GUN AND UPDATE THE HUD IMMEDIATELY.
         Neither happened before. The optic was invisible, so a red dot looked
         like it had done nothing; and the magazine counter kept showing the old
         capacity until the next reload, so an extended mag looked like it had
         done nothing either. Both were true modifiers with no feedback, which
         is indistinguishable from a broken pickup.

         The rounds ALREADY in the gun are not topped up — that would be a free
         reload — but the cap moves at once, so the counter reads 30/90 -> 42
         on the next reload and the player can see why. */
      if (models[current]) WeaponModels.dress(models[current], atts);
      refreshHud();
    } else if (d.t === 'gear') {
      if (d.g === 'mine') { mineCount = d.n; UI.toast('AP Mines: ' + d.n); }
      else if (d.g === 'drone') {
        droneCount = d.n;
        /* The slot APPEARS when you pick one up, so scrolling reaches it. */
        owned.drone = droneCount > 0;
        if (owned.drone) ammo.drone = ammo.drone || { mag: 0, reserve: 0 };
        UI.toast('Strike Drone \u00b7 ' + d.n + ' carried');
      }
      else if (d.g === 'molotov') {
        throwsLeft.molotov = Math.min(CFG.THROWS.molotov.maxCarry, throwsLeft.molotov + d.n);
        UI.toast('Molotov +' + d.n);
      }
    }
    refreshHud();
  }

  function setWeapon(name, instant) {
    if (!CFG.WEAPONS[name] || !owned[name]) return;
    if (name === current && !instant) return;
    if (models[current]) models[current].visible = false;
    current = name;
    zoomFov = null;
    if (models[current]) { models[current].visible = true; WeaponModels.dress(models[current], atts); }
    reloadUntil = 0; reloadingShell = false; boltUntil = 0;
    switchUntil = instant ? 0 : performance.now() + 380;
    UI.setWeapon(CFG.WEAPONS[name].label, ammo[name].mag, ammo[name].reserve, throwsLeft);
    if (!instant) AudioSys.magIn(null);
  }
  function selectByKey(k) {
    if (k === 9) { // cycle through owned exclusives
      var ex = CFG.WEAPON_ORDER.filter(function (n) { return CFG.WEAPONS[n].ex && owned[n]; });
      if (!ex.length) return;
      var j = (ex.indexOf(current) + 1) % ex.length;
      setWeapon(ex[j]);
      return;
    }
    for (var i = 0; i < CFG.WEAPON_ORDER.length; i++) {
      var n = CFG.WEAPON_ORDER[i];
      if (CFG.WEAPONS[n].key === k && owned[n]) { setWeapon(n); return; }
    }
  }
  function cycle(dir) {
    var i = CFG.WEAPON_ORDER.indexOf(current);
    for (var step = 0; step < CFG.WEAPON_ORDER.length; step++) {
      i = (i + dir + CFG.WEAPON_ORDER.length) % CFG.WEAPON_ORDER.length;
      if (owned[CFG.WEAPON_ORDER[i]]) { setWeapon(CFG.WEAPON_ORDER[i]); return; }
    }
  }

  /* v9.5: one implementation, two callers — the T key and a left click while
     the drone slot is selected. */
  function launchDrone() {
    if (!PlayerCtl.alive) return;
    if (droneCount <= 0) { UI.toast('No drones \u2014 find one in an airdrop'); return; }
    Net.launchDrone(function (res) {
      if (res && res.ok) {
        droneCount = res.left;
        UI.toast('Drone away \u00b7 ' + res.left + ' left');
        /* Out of drones means out of the slot: holding an empty launcher you
           cannot use is worse than being put back on your rifle. */
        if (droneCount <= 0) {
          owned.drone = false;
          if (current === 'drone') cycle(1);
        }
      } else UI.toast((res && res.err) || 'Cannot launch drone');
      refreshHud();
    });
  }

  function startReload() {
    var w = CFG.WEAPONS[current], a = ammo[current], E = eff(current);
    if (w.type === 'melee' || a.mag >= E.mag || a.reserve <= 0 || isReloading()) return;
    reloadStartAt = performance.now();
    reloadDur = E.reload * 1000;
    if (w.shellReload) { reloadingShell = true; reloadUntil = reloadStartAt + reloadDur; }
    else { reloadUntil = reloadStartAt + reloadDur; AudioSys.reload(current, null); }
    UI.setReloading(true);
  }
  function isReloading() { return performance.now() < reloadUntil; }

  function finishReload() {
    var w = CFG.WEAPONS[current], a = ammo[current], E = eff(current);
    if (w.shellReload) {
      if (a.mag < E.mag && a.reserve > 0) { a.mag++; a.reserve--; AudioSys.shellIn(null); }
      if (a.mag < E.mag && a.reserve > 0 && reloadingShell) {
        reloadStartAt = performance.now();
        reloadUntil = reloadStartAt + E.reload * 1000; // next shell
      } else { reloadingShell = false; UI.setReloading(false); }
    } else {
      var need = E.mag - a.mag, take = Math.min(need, a.reserve);
      a.mag += take; a.reserve -= take;
      UI.setReloading(false);
    }
    UI.setWeapon(w.label, a.mag, a.reserve, throwsLeft);
  }

  // ---------- firing ----------
  function muzzleWorld(out) {
    out.set(0.24, -0.15, -0.6).applyQuaternion(camera.getWorldQuaternion(tmpQ)).add(camera.position);
    return out;
  }
  function rayDir(spread, out) {
    camera.getWorldDirection(out);
    if (spread > 0) {
      out.x += (Math.random() - 0.5) * 2 * spread;
      out.y += (Math.random() - 0.5) * 2 * spread;
      out.z += (Math.random() - 0.5) * 2 * spread;
      out.normalize();
    }
    return out;
  }
  function rayBox(o, d, cx, cy, cz, hx, hy, hz) {
    var tmin = 0, tmax = Infinity;
    var lo = [cx - hx, cy - hy, cz - hz], hi = [cx + hx, cy + hy, cz + hz];
    var oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (var i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < lo[i] || oo[i] > hi[i]) return -1; }
      else {
        var t1 = (lo[i] - oo[i]) / dd[i], t2 = (hi[i] - oo[i]) / dd[i];
        if (t1 > t2) { var t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmax < tmin) return -1;
      }
    }
    return tmin;
  }
  // One hitscan ray: returns {type:'world'|'player', t, point, id?, part?}
  function castRay(o, d, maxDist) {
    var wh = World.rayHit(o, d, maxDist);
    var best = wh ? wh.t : maxDist;
    var hit = wh ? { type: 'world', t: wh.t, point: wh.point } : null;
    /* v9.4 DRONES ARE SHOOTABLE, and this is where that has to happen — a
       separate "shoot at drones" path would drift from the real weapon model
       the first time spread or falloff changed. They are tested BEFORE players
       so a drone hovering in front of somebody eats the round, which is the
       correct outcome and also the one that makes shooting one down feel like a
       decision rather than an accident.

       Sphere-vs-ray, because a drone is small and roughly round; the box test
       used for bodies would make the rotors count as a hit surface and turn a
       0.42 m target into a 0.9 m one. */
    if (typeof Pickups !== 'undefined' && Pickups.droneTargets) {
      Pickups.droneTargets().forEach(function (dr) {
        var ox = dr.pos.x - o.x, oy = dr.pos.y - o.y, oz = dr.pos.z - o.z;
        var proj = ox * d.x + oy * d.y + oz * d.z;
        if (proj <= 0 || proj > best) return;
        var px = o.x + d.x * proj, py = o.y + d.y * proj, pz = o.z + d.z * proj;
        var dx = px - dr.pos.x, dy = py - dr.pos.y, dz = pz - dr.pos.z;
        if (dx * dx + dy * dy + dz * dz > dr.r * dr.r) return;
        best = proj;
        hit = { type: 'drone', t: proj, id: dr.id, point: new THREE.Vector3(px, py, pz) };
      });
    }
    var P = CFG.PLAYER;
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      var c = r.renderPos;
      /* v8.19 HIT BOXES FOLLOW THE RENDERED RIG.

         v8.16 scaled the avatar 1.52x wide and 1.22x tall so remote players
         were findable at range, and the changelog claimed "the hitbox does not
         change... the model is easier to SEE, not easier to hit". That was
         wrong, and it broke headshots outright.

         The head box is centred on eyeStand + 0.04 = 0.76 above the capsule
         centre with a half-extent of 0.19. Scaling the model 1.22x put the
         RENDERED head centre at 0.93 — an offset of 0.17, which is almost the
         entire half-extent. Aiming at the middle of a head you can see landed
         on the very top edge of the box it was supposed to hit, and a few
         pixels high missed it completely and fell through to the body. Width
         was worse: shots at visible shoulders passed outside a 0.35 box on a
         0.53-wide model.

         A hitbox that disagrees with the model is a lie told to the player, so
         the boxes now carry the same RIG factors the renderer does. MOVEMENT
         collision is untouched — CFG.PLAYER.radius still drives the capsule in
         controller.js, so nobody's ability to fit through a door changed. Only
         what a bullet can strike. */
      var RG = (typeof Avatars !== 'undefined' && Avatars.RIG) ? Avatars.RIG : { x: 1, y: 1, z: 1 };
      var halfH = (r.prone ? P.proneH / 2 : r.crouch ? P.crouchH / 2 : P.standH / 2) * RG.y;

      /* v8.32 THE HEAD BOX NOW READS THE HEAD, INSTEAD OF RECALCULATING IT.

         v8.19 scaled the boxes by RIG, which fixed the size but left the head
         box POSITION derived from CFG.PLAYER.eyeHeight while the rendered head
         comes from the rig's joint chain (spine 0.02 -> neck +0.625 -> head
         +0.118, all scaled, plus RIG_LIFT). Two independent chains that happen
         to agree prone and diverge everywhere else. Measured against the real
         castRay, firing 11 rays up a visible head: standing returned 4 clean
         misses out of 11 and crouching returned 8. Bullets went through heads.

         net.js now caches the world position of the actual head mesh once per
         frame in r.headPos, so there is ONE source of truth and the two cannot
         drift again. It also fixes prone for free, because a rotated body
         carries its head with it and the cache follows.

         The fallback keeps the old maths for the first frame before a cache
         exists, so a remote is never unhittable. */
      var HH = (typeof Avatars !== 'undefined' && Avatars.HEAD_HALF)
        ? Avatars.HEAD_HALF : { x: P.headR * RG.x, y: P.headR * RG.y, z: P.headR * RG.z };
      var hp = r.headPos;
      var hx = hp ? hp.x : c.x;
      var hy = hp ? hp.y : (c.y + (r.prone ? P.eyeProne : r.crouch ? P.eyeCrouch : P.eyeStand) * RG.y + 0.04 * RG.y);
      var hz = hp ? hp.z : c.z;
      var tHead = rayBox(o, d, hx, hy, hz, HH.x, HH.y, HH.z);
      var tBody = rayBox(o, d, c.x, c.y, c.z, P.radius * RG.x, halfH, P.radius * RG.z);
      var part = null, t = -1;
      /* v8.32: the BODY box is 0.53 half-deep against a torso that is only 0.19
         half-deep — nearly three times the model, inherited from the movement
         capsule. A ray aimed at the head therefore entered the body box before
         it reached the much smaller head box, and `tHead <= tBody` handed the
         shot to the body. Four of eleven rays fired straight down a visible
         head came back 'body' for that reason alone.

         The head box is tight and sits exactly on the rendered head, so if a
         ray passes through it the player HIT THE HEAD, whichever box the ray
         technically entered first. Classification now follows the head box;
         the impact distance still uses the nearest real intersection so the
         effect spawns where the bullet actually landed.

         This does NOT widen the head box. Shots into the shoulders still hit
         only the body box and still read as body. */
      if (tHead >= 0) {
        part = 'head';
        t = (tBody >= 0 && tBody < tHead) ? tBody : tHead;
      } else if (tBody >= 0) {
        t = tBody;
        part = (o.y + d.y * tBody) < (c.y - halfH * 0.25) ? 'legs' : 'body';
      }
      if (t >= 0 && t < best) {
        best = t;
        hit = { type: 'player', t: t, id: id, part: part, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), vp: [c.x, c.y, c.z] };
      }
    });
    return hit;
  }

  function fireBullet(w) {
    var E2 = eff(current);
    var sp = (Input.aim ? E2.ads : E2.spread) * (PlayerCtl.prone ? 0.4 : PlayerCtl.crouch ? 0.6 : 1);
    var d2 = rayDir(sp, new THREE.Vector3());
    bullets.push({ pos: camera.position.clone(), vel: d2.multiplyScalar(w.bulletSpeed),
      drop: w.bulletDrop, life: 0, w: current, trc: w.trc || 0xffe2b0 });
    var mzB = muzzleWorld(tmpV2).clone();
    if (!E2.noFlash) FX.muzzle(mzB, true);
    Net.sendShoot({ w: current, o: [mzB.x, mzB.y, mzB.z], dir: [0, 0, 0], sup: E2.quiet ? 1 : 0 });
  }

  function fireHitscan(w) {
    var pellets = w.pellets || 1;
    var E = eff(current);
    var aiming = Input.aim && w.type !== 'melee';
    var spread = aiming ? E.ads : E.spread;
    if (PlayerCtl.moveState === 2) spread *= 2.6;
    else if (PlayerCtl.moveState === 1) spread *= 1.5;
    if (!PlayerCtl.grounded) spread *= 2.2;
    if (PlayerCtl.prone) spread *= 0.55;
    else if (PlayerCtl.crouch) spread *= 0.75;

    var o = camera.position.clone();
    var mz = muzzleWorld(tmpV2).clone();
    var perVictim = {};
    for (var i = 0; i < pellets; i++) {
      var d = rayDir(spread, new THREE.Vector3());
      var hit = castRay(o, d, 400);
      var end = hit ? hit.point : o.clone().addScaledVector(d, 120);
      FX.tracer(mz, end, w.trc);
      if (hit && hit.type === 'drone') {
        FX.impact(hit.point); AudioSys.impact(hit.point);
        Net.droneHit(hit.id, CFG.WEAPONS[current].dmg);
      }
      if (hit && hit.type === 'world') { FX.impact(hit.point); AudioSys.impact(hit.point); }
      if (hit && hit.type === 'player') {
        FX.bloodPuff(hit.point);
        AudioSys.flesh(hit.point);
        var pv = perVictim[hit.id] || (perVictim[hit.id] = { pellets: 0, part: 'legs', vp: hit.vp });
        pv.pellets++;
        if (hit.part === 'head') pv.part = 'head';
        else if (hit.part === 'body' && pv.part === 'legs') pv.part = 'body';
      }
    }
    for (var id in perVictim) {
      var pv2 = perVictim[id];
      Net.sendHit({ victim: id, w: current, part: pv2.part, pellets: pv2.pellets, vp: pv2.vp });
    }
    if (!E.noFlash) FX.muzzle(mz, true);
    Net.sendShoot({ w: current, o: [mz.x, mz.y, mz.z], dir: [0, 0, 0], sup: E.quiet ? 1 : 0 });
  }

  function fireMelee(w) {
    var o = camera.position.clone();
    var d = camera.getWorldDirection(new THREE.Vector3());
    var hit = castRay(o, d, w.range);
    meleeAnim = 1;
    AudioSys.shot('knife', null);
    if (hit && hit.type === 'player') {
      FX.bloodPuff(hit.point);
      AudioSys.flesh(hit.point);
      Net.sendHit({ victim: hit.id, w: 'knife', part: 'body', pellets: 1, vp: hit.vp });
    } else if (hit) { FX.impact(hit.point); }
  }

  function fireRocket(w) {
    var o = muzzleWorld(new THREE.Vector3()).clone();
    var E2 = eff(current);
    var d = rayDir(Input.aim ? E2.ads : E2.spread, new THREE.Vector3());
    var v = d.multiplyScalar(w.projSpeed);
    spawnRocket(o, v, true);
    Net.sendProj({ type: 'rocket', o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    FX.muzzle(o, true);
    FX.shake(0.25);
  }

  function tryFire() {
    var w = CFG.WEAPONS[current], a = ammo[current];
    var t = performance.now();
    if (t < nextFireAt || t < switchUntil || t < boltUntil || !PlayerCtl.alive) return;
    /* v9.5: the drone slot launches instead of firing. Intercepted here, before
       any ammo, spread or recoil logic, because none of it applies — it has no
       magazine and no bullet. The cooldown stops a held mouse button emptying
       the whole stock in one frame. */
    if (w.type === 'drone') {
      nextFireAt = t + 700;
      launchDrone();
      return;
    }
    if (isReloading()) {
      if (w.shellReload && a.mag > 0) { reloadUntil = 0; reloadingShell = false; UI.setReloading(false); } // pump: interrupt shell reload
      else return;
    }
    if (w.type !== 'melee') {
      if (a.mag <= 0) {
        AudioSys.dryFire(current);
        if (a.reserve > 0) startReload();
        nextFireAt = t + 250;
        return;
      }
      a.mag--;
    }
    nextFireAt = t + 60000 / w.rpm;
    kick = 1;
    var EF = eff(current);
    // Pattern recoil: vertical kick + horizontal drift that wanders as a burst grows.
    recoilAccum += EF.recoil;
    // Record the EXACT kick applied so recovery can hand back the same amount.
    // Previously recoilAccum only tracked EF.recoil while the pitch actually
    // moved by ~1.025x that, and recovery returned 55% of the tracked figure —
    // so ~47% of every burst's climb was permanent, and yaw drift was never
    // returned at all. That is the "never recovers to centre" bug.
    var kp = EF.recoil * (0.9 + Math.random() * 0.25);
    var ky = ((Math.random() - 0.5) + EF.drift * 0.5 * Math.sin(recoilAccum * 24)) * EF.recoil * 0.5;
    PlayerCtl.pitch += kp; recPitch += kp;
    PlayerCtl.yaw += ky;   recYaw += ky;

    if (w.type === 'melee') fireMelee(w);
    else if (w.type === 'rocket') { AudioSys.shot('rocket', null); fireRocket(w); }
    else {
      AudioSys.shot(current, null, { supp: EF.quiet });
      if (w.bullet) fireBullet(w); else fireHitscan(w);
      // brass ejection from the port, thrown to the shooter's right
      var ep = tmpV.set(0.3, -0.16, -0.35).applyQuaternion(camera.getWorldQuaternion(tmpQ)).add(camera.position);
      var right = new THREE.Vector3(1, 0, 0).applyQuaternion(tmpQ);
      FX.shell(ep, right, PlayerCtl.pos.y - 0.93);
      if (w.type === 'bolt') { boltUntil = t + w.boltTime * 1000; setTimeout(function () { AudioSys.bolt(null); }, 260); }
      if (w.type === 'pump') { pumpAnim = 1; setTimeout(function () { AudioSys.bolt(null); }, 130); }
      if (current === 'pistol') slideAnim = 1;
    }
    UI.setWeapon(w.label, a.mag, a.reserve, throwsLeft);
    if (w.type !== 'melee' && a.mag === 0 && a.reserve > 0) setTimeout(startReload, w.type === 'pump' ? 400 : 220);
  }

  // ---------- throwables ----------
  function hurl(type, fuse) {
    var o = camera.position.clone();
    var d = camera.getWorldDirection(new THREE.Vector3());
    var spec = CFG.THROWS[type];
    var v = d.multiplyScalar(spec.throwVel).add(new THREE.Vector3(0, 2.6, 0));
    v.x += PlayerCtl.vel.x * 0.4; v.z += PlayerCtl.vel.z * 0.4;
    spawnGrenade(type, o, v, true, fuse);
    Net.sendThrow({ type: type, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z], f: fuse });
    AudioSys.whoosh(null);
    refreshHud();
  }
  function throwGrenade(type) {
    if (!PlayerCtl.alive || throwsLeft[type] <= 0 || cooking) return;
    if (type === 'frag' && CFG.THROWS.frag.cook) { startCook(); return; }
    throwsLeft[type]--;
    AudioSys.pinPull(null);
    hurl(type, undefined);
  }
  // Hold G to cook a frag — release to throw with the remaining fuse.
  // Hold it too long and it detonates in your hands.
  function startCook() {
    if (!PlayerCtl.alive || cooking || throwsLeft.frag <= 0) return;
    throwsLeft.frag--;
    cooking = { end: performance.now() + CFG.THROWS.frag.fuse * 1000, beeped: 99 };
    AudioSys.pinPull(null);
    UI.setCooking(true, 1);
    refreshHud();
  }
  function releaseCook() {
    if (!cooking) return;
    var remain = Math.max(0.12, (cooking.end - performance.now()) / 1000);
    cooking = null;
    UI.setCooking(false, 0);
    hurl('frag', remain);
  }

  function grenadeMesh(type) {
    if (type === 'molotov') {
      var mg = new THREE.Group();
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.2, 8),
        new THREE.MeshLambertMaterial({ color: 0x2e5b34, transparent: true, opacity: 0.9 }));
      mg.add(body);
      var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.08, 8),
        new THREE.MeshLambertMaterial({ color: 0x2e5b34 }));
      neck.position.y = 0.13; mg.add(neck);
      var rag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xff9a3a }));
      rag.position.y = 0.2; mg.add(rag);
      return mg;
    }
    var c = type === 'frag' ? 0x3a4a34 : type === 'smoke' ? 0x777d84 : 0x8a8258;
    var m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(c));
    m.castShadow = true;
    return m;
  }
  function igniteFire(p) {
    var spec = CFG.THROWS.molotov;
    FX.groundFire(p.pos, spec.radius, spec.burnSec);
    AudioSys.fireCrackle(p.pos, spec.burnSec);
    if (!p.mine) return; // damage authority stays with the thrower (same model as frags)
    var best = null, bd = 1.3;
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      var d2 = r.renderPos.distanceTo(p.pos);
      if (d2 < bd) { bd = d2; best = { id: id, r: r }; }
    });
    if (best) Net.sendHit({ victim: best.id, w: 'molotov', part: 'body', pellets: 1,
      dmg: spec.dmg, vp: [best.r.renderPos.x, best.r.renderPos.y, best.r.renderPos.z] });
    fires.push({ pos: p.pos.clone(), until: performance.now() + spec.burnSec * 1000, next: 0 });
  }

  function spawnGrenade(type, o, v, mine, fuseOverride) {
    var m = grenadeMesh(type);
    m.position.copy(o); scene.add(m);
    var fuse = (typeof fuseOverride === 'number') ? fuseOverride : CFG.THROWS[type].fuse + 0.35;
    projectiles.push({ kind: 'nade', type: type, pos: o.clone(), vel: v.clone(), fuse: fuse, mesh: m, mine: mine });
  }
  function spawnRocket(o, v, mine) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), mat(0x4a4438));
    body.rotation.x = Math.PI / 2; g.add(body);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x7a2f22));
    tip.position.z = -0.28; g.add(tip);
    g.position.copy(o); g.lookAt(o.clone().add(v));
    scene.add(g);
    projectiles.push({ kind: 'rocket', pos: o.clone(), vel: v.clone(), mesh: g, mine: mine, life: 0 });
  }

  function resolveGrenade(p, dt) {
    p.vel.y -= 12 * dt;
    p.pos.addScaledVector(p.vel, dt);
    var h = 0.11, cs = World.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (!(p.pos.x - h < c[3] && p.pos.x + h > c[0] && p.pos.y - h < c[4] && p.pos.y + h > c[1] && p.pos.z - h < c[5] && p.pos.z + h > c[2])) continue;
      var pen = [
        c[3] - (p.pos.x - h), (p.pos.x + h) - c[0],
        c[4] - (p.pos.y - h), (p.pos.y + h) - c[1],
        c[5] - (p.pos.z - h), (p.pos.z + h) - c[2]
      ];
      var m = 0; for (var j = 1; j < 6; j++) if (pen[j] < pen[m]) m = j;
      var axis = m >> 1, sign = (m % 2 === 0) ? 1 : -1;
      if (axis === 0) { p.pos.x += pen[m] * sign; p.vel.x *= -0.42; p.vel.y *= 0.75; p.vel.z *= 0.75; }
      if (axis === 1) { p.pos.y += pen[m] * sign; p.vel.y *= -0.38; p.vel.x *= 0.7; p.vel.z *= 0.7; }
      if (axis === 2) { p.pos.z += pen[m] * sign; p.vel.z *= -0.42; p.vel.x *= 0.75; p.vel.y *= 0.75; }
      if (p.vel.lengthSq() > 3) AudioSys.bounce(p.pos);
      /* v9.4 FRAGS DETONATE ON CONTACT.
         Rahul: "grenade shot should be instant as soon as dropped and when
         dropped it should do 100% damage to the area."
         A 2.8 s fuse meant a frag bounced around a room, gave everyone in it a
         second and a half to leave, and usually killed nobody — the throw felt
         like a suggestion. With `impact` it goes off where it lands, which is
         where the thrower aimed it.

         Cooking still works and is now the ONLY way to airburst: hold G and it
         detonates in flight at the end of the cook. That is a skill the weapon
         gains rather than a behaviour it loses. */
      if (p.type && CFG.THROWS[p.type] && CFG.THROWS[p.type].impact && p.fuse > 0.02) {
        p.fuse = 0;
      }
    }
    p.mesh.position.copy(p.pos);
  }

  function detonate(p) {
    if (p.type === 'molotov') { igniteFire(p); return; }
    var pos = p.pos;
    if (p.type === 'frag' || p.kind === 'rocket') {
      var spec = p.kind === 'rocket' ? { dmg: CFG.WEAPONS.rocket.dmg, radius: CFG.WEAPONS.rocket.radius } : CFG.THROWS.frag;
      FX.explosion(pos, spec.radius);
      AudioSys.explosion(pos.distanceTo(camera.position) < 3 ? null : pos, true);
      if (p.mine) explosionDamage(pos, spec.radius, spec.dmg, p.kind === 'rocket' ? 'rocket' : 'frag');
      selfExplosionFeedback(pos, spec.radius);
    } else if (p.type === 'smoke') {
      FX.smokeCloud(pos, CFG.THROWS.smoke.dur);
      AudioSys.impact(pos);
    } else if (p.type === 'flash') {
      FX.explosion(pos, 1.2);
      AudioSys.shot('pistol', pos);
      flashCheck(pos);
    }
  }
  function explosionDamage(center, radius, maxDmg, weaponName) {
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      var d = r.renderPos.distanceTo(center);
      if (d > radius) return;
      /* v9.4 FULL DAMAGE ACROSS THE RADIUS.
         The linear falloff meant a frag landing at a player's feet killed them
         and the same frag two metres away did 70 — so the difference between a
         great throw and an average one was invisible, and the weapon read as
         weak. Rahul asked for 100% inside the radius, and that is a coherent
         design: the skill moves entirely into WHERE it lands, and the 7 m
         circle becomes a place you must not be standing.

         Line of sight still matters — a wall between you and the blast keeps
         the 0.25 multiplier, so cover is the counter-play rather than distance.
         Falloff is retained for the ROCKET, which is a direct-fire weapon with
         its own aiming skill and does not need the same treatment. */
      var flat = CFG.THROWS[weaponName] && CFG.THROWS[weaponName].flatDamage;
      var dmg = flat ? maxDmg : maxDmg * (1 - d / radius);
      if (World.losBlocked(center.clone().add(new THREE.Vector3(0, 0.25, 0)), r.renderPos)) dmg *= 0.25;
      if (dmg > 1) Net.sendHit({ victim: id, w: weaponName, dmg: dmg, part: 'body', vp: [r.renderPos.x, r.renderPos.y, r.renderPos.z] });
    });
    // self-damage
    var sd = PlayerCtl.pos.distanceTo(center);
    if (PlayerCtl.alive && sd < radius) {
      /* Self-damage keeps the falloff even when the weapon is flat. Standing at
         the edge of your own frag should hurt, not delete you — a flat 100 here
         would make every close throw a suicide and nobody would ever use it. */
      var dmg2 = maxDmg * (1 - sd / radius);
      if (World.losBlocked(center.clone().add(new THREE.Vector3(0, 0.25, 0)), PlayerCtl.pos)) dmg2 *= 0.25;
      if (dmg2 > 1) Net.sendHit({ victim: Net.myId(), w: weaponName, dmg: dmg2, part: 'body', vp: [PlayerCtl.pos.x, PlayerCtl.pos.y, PlayerCtl.pos.z] });
    }
  }
  function selfExplosionFeedback(pos, radius) {
    var d = camera.position.distanceTo(pos);
    if (d < radius * 2) FX.shake(0.5 * (1 - d / (radius * 2)));
  }
  function flashCheck(pos) {
    var spec = CFG.THROWS.flash;
    var d = camera.position.distanceTo(pos);
    if (d > spec.radius || !PlayerCtl.alive) return;
    if (World.losBlocked(pos, camera.position)) return;
    var toBlast = pos.clone().sub(camera.position).normalize();
    var fwd = camera.getWorldDirection(tmpV);
    var facing = fwd.dot(toBlast);
    var base = 1 - d / spec.radius;
    var intensity = base * (facing > 0.1 ? 1 : 0.3);
    FX.flashbang(Math.min(1, intensity * 1.4));
  }

  function updateProjectiles(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      if (p.kind === 'nade') {
        resolveGrenade(p, dt);
        if (p.type === 'molotov') { // shatters on first surface contact
          if (p.prevVy !== undefined && p.prevVy < -0.5 && p.vel.y > p.prevVy + 0.4) p.fuse = 0;
          p.prevVy = p.vel.y;
        }
        p.fuse -= dt;
        if (p.fuse <= 0) { detonate(p); scene.remove(p.mesh); projectiles.splice(i, 1); }
      } else { // rocket
        p.life += dt;
        var step = p.vel.length() * dt;
        var dir = tmpV.copy(p.vel).normalize();
        var wh = World.rayHit(p.pos, dir, step + 0.15);
        var hitPlayer = false;
        Net.eachRemote(function (id, r) {
          if (hitPlayer || !r.alive) return;
          if (r.renderPos.distanceTo(p.pos) < 0.85) hitPlayer = true;
        });
        if (wh || hitPlayer || p.life > 6) {
          if (wh) p.pos.copy(wh.point).addScaledVector(dir, -0.05);
          detonate(p); scene.remove(p.mesh); projectiles.splice(i, 1);
        } else {
          p.pos.addScaledVector(dir, step);
          p.mesh.position.copy(p.pos);
        }
      }
    }
  }

  // ---------- per-frame ----------
  function update(dt) {
    var w = CFG.WEAPONS[current];
    var E = eff(current);
    var t = performance.now();

    if (reloadUntil > 0 && t >= reloadUntil) { reloadUntil = 0; finishReload(); }

    // simulated sniper rounds: per-frame segment march with gravity drop
    for (var bi = bullets.length - 1; bi >= 0; bi--) {
      var BL = bullets[bi];
      BL.life += dt;
      if (BL.life > 2.2) { bullets.splice(bi, 1); continue; }
      var stepLen = Math.max(0.001, BL.vel.length() * dt);
      var bdir = BL.vel.clone().multiplyScalar(1 / BL.vel.length());
      var bhit = castRay(BL.pos, bdir, stepLen);
      var bend = BL.pos.clone().addScaledVector(bdir, bhit ? bhit.t : stepLen);
      FX.tracer(BL.pos, bend, BL.trc);
      if (bhit) {
        if (bhit.type === 'drone') {
          FX.impact(bhit.point); AudioSys.impact(bhit.point);
          Net.droneHit(bhit.id, CFG.WEAPONS[BL.w].dmg);
        } else if (bhit.type === 'player') {
          FX.bloodPuff(bhit.point);
          AudioSys.flesh(bhit.point);
          Net.sendHit({ victim: bhit.id, w: BL.w, part: bhit.part, pellets: 1, vp: bhit.vp });
        } else {
          FX.impact(bhit.point);
          AudioSys.impact(bhit.point);
        }
        bullets.splice(bi, 1);
        continue;
      }
      BL.pos.copy(bend);
      BL.vel.y -= BL.drop * dt;
    }

    // molotov ground fire — periodic burn ticks, server-clamped like frag damage
    var spec = CFG.THROWS.molotov;
    for (var fi = fires.length - 1; fi >= 0; fi--) {
      var F = fires[fi];
      if (t > F.until) { fires.splice(fi, 1); continue; }
      if (t < F.next) continue;
      F.next = t + spec.tickSec * 1000;
      var tickDmg = Math.ceil(spec.burnDps * spec.tickSec);
      var R2 = spec.radius * spec.radius;
      Net.eachRemote(function (id, r) {
        if (!r.alive) return;
        var dx = r.renderPos.x - F.pos.x, dz = r.renderPos.z - F.pos.z;
        if (dx * dx + dz * dz <= R2 && Math.abs(r.renderPos.y - F.pos.y) < 2.2)
          Net.sendHit({ victim: id, w: 'molotov', part: 'body', pellets: 1, dmg: tickDmg,
            vp: [r.renderPos.x, r.renderPos.y, r.renderPos.z] });
      });
      var sdx = PlayerCtl.pos.x - F.pos.x, sdz = PlayerCtl.pos.z - F.pos.z;
      if (PlayerCtl.alive && sdx * sdx + sdz * sdz <= R2 && Math.abs(PlayerCtl.pos.y - F.pos.y) < 2.2)
        Net.sendHit({ victim: Net.myId(), w: 'molotov', part: 'body', pellets: 1, dmg: tickDmg,
          vp: [PlayerCtl.pos.x, PlayerCtl.pos.y, PlayerCtl.pos.z] });
    }

    // grenade cooking
    if (cooking) {
      var leftS = (cooking.end - t) / 1000;
      UI.setCooking(true, Math.max(0, leftS / CFG.THROWS.frag.fuse));
      var sec = Math.ceil(leftS);
      if (sec < cooking.beeped) { cooking.beeped = sec; if (sec > 0) AudioSys.uiClick(); }
      if (leftS <= 0) { // cooked too long — it goes off in your hands
        cooking = null;
        UI.setCooking(false, 0);
        var o = camera.position.clone();
        spawnGrenade('frag', o, new THREE.Vector3(0, 0.4, 0), true, 0.02);
        Net.sendThrow({ type: 'frag', o: [o.x, o.y, o.z], v: [0, 0.4, 0], f: 0.02 });
      }
    }

    if (triggerDown && (w.type === 'auto')) tryFire();
    if (semiQueued) { semiQueued = false; tryFire(); }

    /* Recoil recovery: once the burst ends, hand back CFG.RECOIL.recover of the
       exact kick that was applied — vertical and horizontal — over roughly
       CFG.RECOIL.settleSec. A small residual is intentional so long sprays still
       cost you something; set recover to 1 for a full return to centre. */
    var RC = CFG.RECOIL || { recover: 0.9, settleSec: 0.35, delayMs: 90 };
    if (t > nextFireAt + RC.delayMs && (recPitch !== 0 || recYaw !== 0)) {
      var f = Math.min(1, dt / RC.settleSec);
      var dp = recPitch * f, dy = recYaw * f;
      PlayerCtl.pitch -= dp * RC.recover;
      PlayerCtl.yaw -= dy * RC.recover;
      recPitch -= dp; recYaw -= dy;
      if (Math.abs(recPitch) < 1e-5) recPitch = 0;
      if (Math.abs(recYaw) < 1e-5) recYaw = 0;
      recoilAccum = Math.max(0, recoilAccum - recoilAccum * f);
    }

    // viewmodel motion
    var aiming = Input.aim && PlayerCtl.alive && w.type !== 'melee';
    var scoped = aiming && w.scope;
    var tx = aiming ? 0 : 0.26;
    var ty = aiming ? -0.115 : -0.22;
    var tz = aiming ? -0.34 : -0.5;
    /* ===== v9.12 — DRAWING A BOW DOES NOT BLIND YOU =====
       Reported: "when bow is locked to shoot, it doesn't let the player see
       where to shoot." Correct — every other weapon centres on the screen when
       aimed, because you look down its sights. A bow has no sights and its
       riser is a vertical plank: centring it puts a solid board across the
       middle of the view, which is what the screenshot shows.

       An archer looks PAST the riser, not through it. So the bow shifts left
       and drops when drawn, the way a real anchor point works, leaving the
       aim point clear. The crosshair is unchanged, so where you shoot is
       exactly where you shot before — only the obstruction moves. */
    if (aiming && w.type === 'bow') { tx = -0.20; ty = -0.30; tz = -0.46; }
    if (isReloading()) { ty -= 0.1; }

    /* ===== v9.12 — THE GUN STOPS GOING THROUGH WALLS =====
       Reported as "guns go blank and look inserted in the container or the
       walls", with a screenshot of an MP5 buried in a shipping container.

       The viewmodel is drawn half a metre in front of the camera and has never
       been tested against the world, so standing against anything put the
       barrel inside it — and because the model is drawn after the wall, the
       visible result is a gun that appears to be embedded in geometry.

       The standard fix, and the one every shooter uses: cast a short ray along
       the view direction and, if something is closer than the muzzle, pull the
       weapon back and down toward the chest. It reads as bringing the gun in
       tight against cover, which is what a person does, rather than as the
       weapon clipping. Aim is untouched — the ray that decides where bullets
       go is a separate cast from the camera, so what you hit does not change. */
    /* ===== v10 — THE PROBE NOW MEASURES THE RIGHT LINE, AND ALL OF IT =====
       Still happening in v9.15. Confirmed from Recording_105559: the AK's
       barrel buried in a blue container while the player faces it. The v9.12
       probe above was right in principle and wrong in all three of its
       specifics.

       ONE — IT WAS TOO SHORT. `CLEAR = 1.05` was a typed number, and the
       barrels were never measured. Measured for real (tools/verify-barrel.js):
       the rig sits at z -0.5 hip-firing and muzzleZ runs from -0.22 on the
       pistol to -1.14 on the AWM, so reach is 0.72 m to 1.64 m — and a
       suppressor adds another 0.20 m on top, for 1.84 m. Every wall between
       1.05 m and 1.84 m was invisible to the probe. A constant could not have
       been right for both the pistol and the AWM anyway: one number is either
       too short for the rifle or shoves the pistol back off walls it is
       nowhere near.

       Worth recording WHY the number was never caught: the gates measure
       muzzleZ under a trimmed THREE whose geometries carry no `.parameters`,
       so the measuring loop in viewmodels.js skipped every part and returned
       its -0.7 fallback for all 25 weapons. The gates were reading a constant
       and reporting it as a measurement. tools/_three-stub.js exists to stop
       that recurring.

       TWO — IT POINTED AT THE WRONG PLACE. The cast started at
       `camera.position` and the hip-fire rig is 0.26 m to the RIGHT of it.
       Strafing along a wall on your right put the whole gun inside the wall
       while the ray sailed down the corridor beside it.

       THREE — AND AT THE WRONG HEIGHT. The rig is also 0.22 m BELOW the eye.
       A chest-high container is the exact case in the recording: you look over
       the top of it, the eye ray passes clean above, and the gun is inside it.
       This is why the reported symptom was a container rather than a wall.

       So: two rays, from the eye and from the gun, in a single pass over the
       colliders (World.rayDist2). Two rays cost what one cost before, because
       the array walk is the expensive part and it is now shared.

       Aim is untouched, exactly as in v9.12 — the ray that decides where
       bullets go is a separate cast from the camera in fire(). Moving the
       viewmodel cannot move a shot. */
    var wallT = 1;
    if (World.isBuilt && World.isBuilt() && World.rayDist2) {
      var mdlNow = models[current];
      /* Derived, not typed. |muzzleZ| is this weapon's barrel measured from
         the geometry it is actually built from, |tz| is where the rig sits
         this frame, SUPP is the length a fitted can adds beyond the bore, and
         0.12 is honest margin so the gun stops just short rather than exactly
         flush. A weapon added later is covered without touching this line. */
      var muz = (mdlNow && mdlNow.userData.muzzleZ !== undefined) ? Math.abs(mdlNow.userData.muzzleZ) : 0.70;
      var SUPP = (atts && atts.muzzle) ? 0.20 : 0;
      var CLEAR = Math.abs(tz) + muz + SUPP + 0.12;

      var fwd = camera.getWorldDirection(_vmDir);
      /* Right-hand vector from the view direction. The world's up is +y, so
         right = forward x up, which for a y-up world reduces to this. No
         allocation and no trig — the camera's own basis would need a matrix
         read to get at. */
      var rl = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z) || 1;
      var rx = -fwd.z / rl, rz = fwd.x / rl;

      var gx = camera.position.x + rx * tx;
      var gy = camera.position.y + ty;
      var gz = camera.position.z + rz * tx;

      var d = World.rayDist2(
        camera.position.x, camera.position.y, camera.position.z,
        gx, gy, gz,
        fwd.x, fwd.y, fwd.z, CLEAR);
      if (d >= 0) wallT = Math.max(0, Math.min(1, d / CLEAR));
    }
    if (wallT < 1) {
      /* Fully pressed against a surface the gun sits at the chest; at arm's
         length it is untouched, and it moves smoothly between the two. */
      var press = 1 - wallT;
      tx += (aiming ? 0.10 : 0.06) * press;
      ty -= 0.16 * press;
      tz += 0.30 * press;
    }

    var lerp = Math.min(1, dt * 10);
    rig.position.x += (tx - rig.position.x) * lerp;
    rig.position.y += (ty - rig.position.y) * lerp;
    rig.position.z += (tz + kick * 0.09 - rig.position.z) * lerp;
    rig.rotation.x = -kick * 0.06 + (isReloading() ? -0.42 : 0) + meleeAnim * -0.9;
    rig.rotation.z = meleeAnim * 0.4;
    kick *= Math.pow(0.02, dt);
    meleeAnim *= Math.pow(0.003, dt);
    pumpAnim *= Math.pow(0.004, dt);
    slideAnim *= Math.pow(0.001, dt);
    rig.visible = PlayerCtl.alive && !scoped;

    // part animations on the active model
    var mdl = models[current];
    if (mdl) {
      if (mdl.userData.mag) {
        var off = 0;
        if (isReloading() && !CFG.WEAPONS[current].shellReload && reloadDur > 0) {
          var ph = (t - reloadStartAt) / reloadDur; // 0..1: mag drops out, pauses, seats back
          off = ph < 0.38 ? Math.min(1, ph / 0.3) : (ph < 0.56 ? 1 : Math.max(0, 1 - (ph - 0.56) / 0.3));
        }
        mdl.userData.mag.position.y = mdl.userData.magHome.y - 0.15 * off;
        mdl.userData.mag.rotation.x = -0.35 * off;
      }
      if (mdl.userData.pump) mdl.userData.pump.position.z = mdl.userData.pumpHome.z + 0.1 * pumpAnim;
      if (mdl.userData.slide) mdl.userData.slide.position.z = mdl.userData.slideHome.z + 0.06 * slideAnim;
    }

    updateProjectiles(dt);
    // dynamic crosshair gap from current effective spread + stance
    var chS = aiming ? E.ads : E.spread;
    if (PlayerCtl.moveState === 2) chS *= 2.6; else if (PlayerCtl.moveState === 1) chS *= 1.5;
    if (!PlayerCtl.grounded) chS *= 2.2;
    if (PlayerCtl.prone) chS *= 0.55;
    else if (PlayerCtl.crouch) chS *= 0.75;
    var crossGap = Math.max(3, Math.min(46, 5 + chS * 1300));
    if (scoped && w.sway) {
      var swA = w.sway * (PlayerCtl.prone ? 0.15 : PlayerCtl.crouch ? 0.45 : 1);
      var swT = t * 0.0011;
      camera.rotation.x += (Math.sin(swT * 2.1) + Math.sin(swT * 3.7) * 0.5) * swA;
      camera.rotation.y += (Math.sin(swT * 1.7 + 1.3) + Math.sin(swT * 2.9) * 0.5) * swA;
    }
    lastScoped = scoped;
    return { aiming: aiming, scoped: scoped, adsFov: (scoped && zoomFov) ? zoomFov : E.adsFov, speedMult: w.speed, crossGap: crossGap };
  }

  return {
    init: init,
    update: update,
    isReloading: isReloading,   // v7.9: remote players now play a reload pose
    resetLoadout: resetLoadout,
    matchReset: matchReset,
    applyGrant: applyGrant,
    startCook: startCook,
    releaseCook: releaseCook,
    wheelZoom: function (dir) {
      var w = CFG.WEAPONS[current];
      if (!w.scope || !w.scopeZoom || !lastScoped) return false;
      zoomFov = Math.max(w.scopeZoom[0], Math.min(w.scopeZoom[1], (zoomFov || w.adsFov) - dir * 3));
      return true;
    },
    placeMine: function () {
      if (!PlayerCtl.alive) return;
      if (mineCount <= 0) { UI.toast('No mines left'); return; }
      Net.placeMine({ p: [PlayerCtl.pos.x, PlayerCtl.pos.y, PlayerCtl.pos.z] }, function (res) {
        if (res && res.ok) { mineCount = res.left; UI.toast('Mine armed \u00b7 ' + res.left + ' left'); }
        else UI.toast((res && res.err) || 'Cannot place mine');
        refreshHud();
      });
    },
    /* v9.4 STRIKE DRONE — the client's only job is to ASK. Everything about the
       flight, the target and the kill is decided on the server, because a drone
       outlives the moment its owner is watching it and a third player can shoot
       it down; see server/lib/drones.js. */
    launchDrone: launchDrone,
    droneCount: function () { return droneCount; },
    getDetectMs: function () { return eff(current).detectMs; },
    selectByKey: selectByKey,
    cycle: cycle,
    startReload: startReload,
    throwGrenade: throwGrenade,
    spawnGrenade: spawnGrenade,
    spawnRocket: spawnRocket,
    setTrigger: function (down) { triggerDown = down; if (down && CFG.WEAPONS[current].type !== 'auto') semiQueued = true; },
    currentName: function () { return current; },
    isBoltCycling: function () { return performance.now() < boltUntil; }
  };
})();
