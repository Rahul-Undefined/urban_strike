/* Weapons — everything the player holds and throws.
   Data-driven from CFG.WEAPONS / CFG.THROWS (edit shared-config.js to balance). */
var Weapons = (function () {
  var camera = null, scene = null;
  var rig = null;                 // viewmodel root, parented to the camera
  var models = {};                // weaponName -> THREE.Group
  var current = 'ak47';
  var ammo = {};                  // name -> {mag, reserve}
  var throwsLeft = { frag: 2, smoke: 1, flash: 1 };
  var nextFireAt = 0, reloadUntil = 0, boltUntil = 0, switchUntil = 0;
  var reloadingShell = false;
  var triggerDown = false, semiQueued = false;
  var kick = 0, meleeAnim = 0;
  var pumpAnim = 0, slideAnim = 0, recoilAccum = 0, reloadStartAt = 0, reloadDur = 0;
  var atts = { sight: null, muzzle: null, mag: null };   // equipped attachments by slot
  var owned = {};                                        // weapon name -> true
  var cooking = null;                                    // { end, beeped } while holding a live frag
  var BASE_WEAPONS = CFG.WEAPON_ORDER.filter(function (n) { return !CFG.WEAPONS[n].ex; });

  // Effective stats = base weapon modified by equipped attachments.
  function eff(name) {
    var w = CFG.WEAPONS[name];
    var e = { dmg: w.dmg, mag: w.mag, reload: w.reload, spread: w.spread, ads: w.ads,
      recoil: w.recoil, drift: w.drift || 0, adsFov: w.adsFov, speed: w.speed,
      quiet: false, noFlash: false, detectMs: 3500 };
    var s = atts.sight && CFG.ATTACH[atts.sight];
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
  }
  var projectiles = [];           // rockets + grenades (local sim on every client)
  var tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function part(g, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); g.add(b); return b;
  }

  function buildModels() {
    var gunmetal = mat(0x2b2f34), dark = mat(0x1e2126), wood = mat(0x6b4a2a), tan = mat(0x4a4438),
      green = mat(0x36402e), steel = mat(0x54595f), blade = mat(0xb9bfc6), brass = mat(0xb08a3a);
    function cylPart(g, x, y, z, r, len, m, alongZ) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
      if (alongZ !== false) c.rotation.x = Math.PI / 2;
      c.position.set(x, y, z); g.add(c); return c;
    }
    // Shared long-gun chassis; each weapon customizes on top. Returns group
    // with userData.mag (and .magHome) for the reload animation.
    function rifleBase(bodyM, len, hasStock) {
      var g = new THREE.Group();
      part(g, 0, 0, -0.08, 0.062, 0.085, 0.34, gunmetal);              // receiver
      cylPart(g, 0, 0.005, -len * 0.62, 0.017, len * 0.62, dark);      // barrel
      part(g, 0, -0.015, -len * 0.34, 0.06, 0.06, len * 0.34, bodyM);  // handguard
      part(g, 0, -0.09, 0.06, 0.05, 0.11, 0.06, gunmetal);             // grip
      if (hasStock) { part(g, 0, -0.005, 0.2, 0.045, 0.075, 0.22, bodyM); part(g, 0, -0.03, 0.31, 0.05, 0.11, 0.035, bodyM); }
      part(g, 0, 0.052, -len * 0.86, 0.016, 0.04, 0.016, gunmetal);    // front post
      part(g, 0, 0.052, 0.04, 0.05, 0.022, 0.03, gunmetal);            // rear sight
      part(g, 0.036, 0.028, -0.02, 0.018, 0.018, 0.05, steel);         // charging handle
      var magG = new THREE.Group(); magG.position.set(0, -0.115, -0.15); g.add(magG);
      g.userData.mag = magG; g.userData.magHome = magG.position.clone();
      return g;
    }
    models.ak47 = (function () {
      var g = rifleBase(wood, 0.74, true);
      var m1 = part(g.userData.mag, 0, 0, 0, 0.042, 0.13, 0.07, gunmetal); m1.rotation.x = 0.18;
      var m2 = part(g.userData.mag, 0, -0.1, 0.028, 0.042, 0.1, 0.065, gunmetal); m2.rotation.x = 0.45; // curved mag
      part(g, 0, 0.02, -0.66, 0.03, 0.035, 0.06, steel);               // gas block
      return g;
    })();
    models.m4a1 = (function () {
      var g = rifleBase(tan, 0.7, true);
      part(g.userData.mag, 0, -0.05, 0, 0.042, 0.15, 0.062, dark);
      part(g, 0, 0.075, -0.02, 0.035, 0.05, 0.16, gunmetal);           // carry handle
      cylPart(g, 0, 0.005, -0.74, 0.022, 0.06, steel);                 // flash hider
      for (var i = 0; i < 3; i++) part(g, 0.033, -0.015, -0.32 - i * 0.07, 0.006, 0.03, 0.03, dark); // rail vents
      return g;
    })();
    models.sniper = (function () {
      var g = rifleBase(green, 1.0, true);
      part(g.userData.mag, 0, -0.04, 0, 0.045, 0.1, 0.075, dark);
      cylPart(g, 0, 0.088, -0.16, 0.03, 0.24, dark);                   // scope tube
      cylPart(g, 0, 0.088, -0.29, 0.036, 0.03, gunmetal);              // objective
      cylPart(g, 0, 0.088, -0.03, 0.034, 0.03, gunmetal);              // eyepiece
      part(g, 0, 0.062, -0.1, 0.016, 0.026, 0.02, steel);              // mount F
      part(g, 0, 0.062, -0.22, 0.016, 0.026, 0.02, steel);             // mount R
      var bh = cylPart(g, 0.05, 0.01, 0.02, 0.011, 0.07, steel, false); bh.rotation.z = 0.9; // bolt handle
      part(g, 0.028, -0.05, -0.78, 0.012, 0.1, 0.012, steel);          // bipod legs (folded)
      part(g, -0.028, -0.05, -0.78, 0.012, 0.1, 0.012, steel);
      return g;
    })();
    models.uzi = (function () {
      var g = new THREE.Group();
      part(g, 0, 0, -0.1, 0.07, 0.09, 0.3, gunmetal);                  // boxy receiver
      cylPart(g, 0, 0.01, -0.32, 0.016, 0.16, dark);                   // stub barrel
      part(g, 0, -0.09, 0.02, 0.05, 0.1, 0.055, gunmetal);             // grip
      var magG = new THREE.Group(); magG.position.set(0, -0.17, 0.02); g.add(magG);
      part(magG, 0, 0, 0, 0.04, 0.12, 0.045, dark);                    // mag-in-grip
      g.userData.mag = magG; g.userData.magHome = magG.position.clone();
      part(g, 0, 0.005, 0.13, 0.05, 0.02, 0.14, steel);                // folded stock top bar
      part(g, 0, 0.05, -0.3, 0.014, 0.03, 0.014, gunmetal);            // front sight
      part(g, 0, 0.05, 0.03, 0.04, 0.02, 0.02, gunmetal);              // rear sight
      return g;
    })();
    models.shotgun = (function () {
      var g = new THREE.Group();
      part(g, 0, 0, -0.02, 0.06, 0.085, 0.3, gunmetal);                // receiver
      cylPart(g, 0, 0.012, -0.5, 0.019, 0.62, dark);                   // barrel
      cylPart(g, 0, -0.032, -0.48, 0.016, 0.55, steel);                // mag tube
      part(g, 0, -0.005, 0.21, 0.05, 0.085, 0.24, wood);               // stock
      part(g, 0, -0.09, 0.08, 0.05, 0.1, 0.05, wood);                  // grip base
      var pump = new THREE.Group(); pump.position.set(0, -0.03, -0.34); g.add(pump);
      part(pump, 0, 0, 0, 0.055, 0.05, 0.16, wood);                    // pump forend
      g.userData.pump = pump; g.userData.pumpHome = pump.position.clone();
      part(g, 0, 0.055, -0.72, 0.012, 0.02, 0.012, brass);             // bead sight
      return g;
    })();
    models.pistol = (function () {
      var g = new THREE.Group();
      part(g, 0, -0.025, -0.1, 0.042, 0.05, 0.24, gunmetal);           // frame
      var slide = new THREE.Group(); slide.position.set(0, 0.012, -0.1); g.add(slide);
      part(slide, 0, 0, 0, 0.044, 0.045, 0.26, dark);                  // slide
      part(slide, 0, 0.028, 0.1, 0.012, 0.012, 0.02, dark);            // rear sight
      part(slide, 0, 0.028, -0.11, 0.008, 0.012, 0.01, dark);          // front sight
      g.userData.slide = slide; g.userData.slideHome = slide.position.clone();
      part(g, 0, -0.09, 0.03, 0.042, 0.12, 0.055, gunmetal);           // grip
      part(g, 0, -0.055, -0.055, 0.01, 0.008, 0.07, steel);            // trigger guard
      var magG = new THREE.Group(); magG.position.set(0, -0.15, 0.03); g.add(magG);
      part(magG, 0, 0, 0, 0.034, 0.03, 0.045, steel);
      g.userData.mag = magG; g.userData.magHome = magG.position.clone();
      return g;
    })();
    models.rocket = (function () {
      var g = new THREE.Group();
      cylPart(g, 0, 0, -0.2, 0.075, 0.95, green);                      // tube
      var flare = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.14, 10), green);
      flare.rotation.x = Math.PI / 2; flare.position.set(0, 0, 0.32); g.add(flare); // venturi
      var tip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.055, 0.16, 10), mat(0x7a2f22));
      tip.rotation.x = -Math.PI / 2; tip.position.set(0, 0, -0.72); g.add(tip);     // loaded warhead
      part(g, 0, -0.12, 0.02, 0.05, 0.12, 0.06, gunmetal);             // grip
      part(g, 0, -0.12, -0.14, 0.045, 0.1, 0.05, gunmetal);            // fore grip
      part(g, 0, 0.11, -0.08, 0.035, 0.07, 0.1, steel);                // sight box
      return g;
    })();
    models.knife = (function () {
      var g = new THREE.Group();
      part(g, 0, -0.02, -0.17, 0.014, 0.048, 0.24, blade);             // blade
      part(g, 0, 0.004, -0.19, 0.006, 0.012, 0.2, steel);              // edge bevel
      part(g, 0, -0.02, -0.045, 0.05, 0.06, 0.018, gunmetal);          // guard
      part(g, 0, -0.03, 0.02, 0.03, 0.05, 0.11, wood);                 // handle
      part(g, 0, -0.03, 0.075, 0.034, 0.054, 0.014, steel);            // pommel
      return g;
    })();
    // ---- exclusive loot weapons (key 9) ----
    models.scarh = (function () {
      var g = rifleBase(tan, 0.78, true);
      part(g.userData.mag, 0, -0.05, 0, 0.042, 0.15, 0.062, gunmetal);
      part(g, 0, 0.07, -0.06, 0.032, 0.03, 0.3, dark);                 // top rail
      cylPart(g, 0, 0.005, -0.82, 0.02, 0.05, steel);                  // muzzle brake
      return g;
    })();
    models.mk14 = (function () {
      var g = rifleBase(wood, 0.88, true);
      part(g.userData.mag, 0, -0.05, 0, 0.045, 0.14, 0.07, gunmetal);
      part(g, 0, 0.068, -0.05, 0.03, 0.026, 0.22, dark);               // receiver rail
      cylPart(g, 0, 0.09, -0.12, 0.024, 0.14, dark);                   // DMR optic tube
      cylPart(g, 0, 0.005, -0.92, 0.02, 0.06, steel);                  // brake
      return g;
    })();
    models.p90 = (function () {                                         // bullpup — custom chassis
      var g = new THREE.Group();
      part(g, 0, -0.01, 0.02, 0.07, 0.1, 0.42, tan);                   // polymer shell
      part(g, 0, -0.075, -0.1, 0.05, 0.06, 0.14, tan);                 // front grip loop
      part(g, 0, -0.075, 0.12, 0.05, 0.07, 0.1, tan);                  // rear grip loop
      cylPart(g, 0, 0.01, -0.32, 0.016, 0.22, dark);                   // stub barrel
      part(g, 0, 0.066, 0.06, 0.05, 0.03, 0.05, gunmetal);             // sight block
      var magG = new THREE.Group(); magG.position.set(0, 0.052, -0.03); g.add(magG);
      part(magG, 0, 0, 0, 0.05, 0.026, 0.3, steel);                    // top-mounted mag
      g.userData.mag = magG; g.userData.magHome = magG.position.clone();
      return g;
    })();
    models.m249 = (function () {
      var g = rifleBase(green, 0.8, true);
      cylPart(g, 0, 0.005, -0.46, 0.024, 0.46, dark);                  // heavy barrel shroud
      part(g, 0, 0.07, 0, 0.03, 0.04, 0.18, gunmetal);                 // feed tray cover
      part(g.userData.mag, 0, -0.03, 0.02, 0.075, 0.12, 0.11, green);  // belt box
      part(g, 0.03, -0.05, -0.62, 0.012, 0.12, 0.012, steel);          // bipod legs
      part(g, -0.03, -0.05, -0.62, 0.012, 0.12, 0.012, steel);
      return g;
    })();
    models.awm = (function () {
      var g = rifleBase(tan, 1.05, true);
      part(g.userData.mag, 0, -0.04, 0, 0.045, 0.1, 0.075, dark);
      cylPart(g, 0, 0.088, -0.16, 0.032, 0.26, dark);                  // scope tube
      cylPart(g, 0, 0.088, -0.31, 0.038, 0.03, gunmetal);              // objective
      cylPart(g, 0, 0.088, -0.02, 0.036, 0.03, gunmetal);              // eyepiece
      part(g, 0, 0.062, -0.1, 0.016, 0.026, 0.02, steel);
      part(g, 0, 0.062, -0.24, 0.016, 0.026, 0.02, steel);
      var bh = cylPart(g, 0.05, 0.01, 0.02, 0.011, 0.07, steel, false); bh.rotation.z = 0.9;
      cylPart(g, 0, 0.005, -1.1, 0.024, 0.08, steel);                  // brake
      return g;
    })();
    // Registry invariant: EVERY weapon in CFG.WEAPON_ORDER must have a
    // viewmodel. Any future config addition gets a generic rifle instead of
    // invisible hands — an unknown-but-equipped weapon cannot render as nothing.
    CFG.WEAPON_ORDER.forEach(function (n) {
      if (!models[n]) {
        var g = rifleBase(gunmetal, 0.7, true);
        part(g.userData.mag, 0, -0.05, 0, 0.042, 0.14, 0.06, dark);
        models[n] = g;
      }
    });
    for (var k in models) { models[k].visible = false; rig.add(models[k]); }
  }

  function init(cam, sc) {
    camera = cam; scene = sc;
    rig = new THREE.Group();
    rig.position.set(0.26, -0.22, -0.5);
    camera.add(rig);
    buildModels();
    resetLoadout();
  }

  // Full reset at match start: back to the base 8, no attachments.
  function matchReset() {
    owned = {};
    BASE_WEAPONS.forEach(function (n) { owned[n] = true; });
    atts = { sight: null, muzzle: null, mag: null };
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
    throwsLeft = { frag: CFG.THROWS.frag.count, smoke: CFG.THROWS.smoke.count, flash: CFG.THROWS.flash.count };
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
      if (a) a.reserve = Math.min(CFG.WEAPONS[d.w].reserve, a.reserve + Math.ceil(CFG.WEAPONS[d.w].reserve * 0.5));
      UI.toast(CFG.WEAPONS[d.w].label + ' ammo');
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
    }
    refreshHud();
  }

  function setWeapon(name, instant) {
    if (!CFG.WEAPONS[name] || !owned[name]) return;
    if (name === current && !instant) return;
    if (models[current]) models[current].visible = false;
    current = name;
    if (models[current]) models[current].visible = true;
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
    var P = CFG.PLAYER;
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      var c = r.renderPos;
      var halfH = r.crouch ? P.crouchH / 2 : P.standH / 2;
      var eyeY = c.y + (r.crouch ? P.eyeCrouch : P.eyeStand);
      var tHead = rayBox(o, d, c.x, eyeY + 0.04, c.z, P.headR, P.headR, P.headR);
      var tBody = rayBox(o, d, c.x, c.y, c.z, P.radius, halfH, P.radius);
      var part = null, t = -1;
      if (tHead >= 0 && (tBody < 0 || tHead <= tBody)) { t = tHead; part = 'head'; }
      else if (tBody >= 0) { t = tBody; part = 'body'; }
      if (t >= 0 && t < best) {
        best = t;
        hit = { type: 'player', t: t, id: id, part: part, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), vp: [c.x, c.y, c.z] };
      }
    });
    return hit;
  }

  function fireHitscan(w) {
    var pellets = w.pellets || 1;
    var E = eff(current);
    var aiming = Input.aim && w.type !== 'melee';
    var spread = aiming ? E.ads : E.spread;
    if (PlayerCtl.moveState === 2) spread *= 2.6;
    else if (PlayerCtl.moveState === 1) spread *= 1.5;
    if (!PlayerCtl.grounded) spread *= 2.2;
    if (PlayerCtl.crouch) spread *= 0.75;

    var o = camera.position.clone();
    var mz = muzzleWorld(tmpV2).clone();
    var perVictim = {};
    for (var i = 0; i < pellets; i++) {
      var d = rayDir(spread, new THREE.Vector3());
      var hit = castRay(o, d, 400);
      var end = hit ? hit.point : o.clone().addScaledVector(d, 120);
      FX.tracer(mz, end);
      if (hit && hit.type === 'world') { FX.impact(hit.point); AudioSys.impact(hit.point); }
      if (hit && hit.type === 'player') {
        FX.bloodPuff(hit.point);
        AudioSys.flesh(hit.point);
        var pv = perVictim[hit.id] || (perVictim[hit.id] = { pellets: 0, part: 'body', vp: hit.vp });
        pv.pellets++;
        if (hit.part === 'head') pv.part = 'head';
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
    PlayerCtl.pitch += EF.recoil * (0.9 + Math.random() * 0.25);
    PlayerCtl.yaw += ((Math.random() - 0.5) + EF.drift * 0.5 * Math.sin(recoilAccum * 24)) * EF.recoil * 0.5;

    if (w.type === 'melee') fireMelee(w);
    else if (w.type === 'rocket') { AudioSys.shot('rocket', null); fireRocket(w); }
    else {
      AudioSys.shot(current, null, { supp: EF.quiet });
      fireHitscan(w);
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
    var c = type === 'frag' ? 0x3a4a34 : type === 'smoke' ? 0x777d84 : 0x8a8258;
    var m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(c));
    m.castShadow = true;
    return m;
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
    }
    p.mesh.position.copy(p.pos);
  }

  function detonate(p) {
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
      var dmg = maxDmg * (1 - d / radius);
      if (World.losBlocked(center.clone().add(new THREE.Vector3(0, 0.25, 0)), r.renderPos)) dmg *= 0.25;
      if (dmg > 1) Net.sendHit({ victim: id, w: weaponName, dmg: dmg, part: 'body', vp: [r.renderPos.x, r.renderPos.y, r.renderPos.z] });
    });
    // self-damage
    var sd = PlayerCtl.pos.distanceTo(center);
    if (PlayerCtl.alive && sd < radius) {
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

    // recoil recovery: after the burst ends, walk ~55% of accumulated kick back down
    if (recoilAccum > 0.0001 && t > nextFireAt + 90) {
      var rec = Math.min(recoilAccum, dt * 0.4);
      PlayerCtl.pitch -= rec * 0.55;
      recoilAccum -= rec;
    }

    // viewmodel motion
    var aiming = Input.aim && PlayerCtl.alive && w.type !== 'melee';
    var scoped = aiming && w.scope;
    var tx = aiming ? 0 : 0.26;
    var ty = aiming ? -0.115 : -0.22;
    var tz = aiming ? -0.34 : -0.5;
    if (isReloading()) { ty -= 0.1; }
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
    if (PlayerCtl.crouch) chS *= 0.75;
    var crossGap = Math.max(3, Math.min(46, 5 + chS * 1300));
    return { aiming: aiming, scoped: scoped, adsFov: E.adsFov, speedMult: w.speed, crossGap: crossGap };
  }

  return {
    init: init,
    update: update,
    resetLoadout: resetLoadout,
    matchReset: matchReset,
    applyGrant: applyGrant,
    startCook: startCook,
    releaseCook: releaseCook,
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
