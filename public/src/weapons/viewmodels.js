/* First-person weapon model factory (render-only, no gameplay logic).
   Contract: WeaponModels.build() -> { weaponName: THREE.Group } for every
   entry in CFG.WEAPON_ORDER — completeness enforced by the fallback loop. */
var WeaponModels = (function () {
  'use strict';
  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function part(g, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); g.add(b); return b;
  }

  function build() {
    var models = {};
    var gunmetal = mat(0x2b2f34), dark = mat(0x1e2126), wood = mat(0x6b4a2a), tan = mat(0x4a4438),
      green = mat(0x36402e), steel = mat(0x54595f), blade = mat(0xb9bfc6), brass = mat(0xb08a3a),
      NEONRED = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
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
    /* v8.33 Kar98 — deliberately reads as a different rifle to the AWM-S at a
       glance: full wooden furniture instead of green polymer, a shorter and
       fatter scope sat lower on the receiver, a straight bolt handle rather
       than a swept one, and no bipod. Same chassis helper, so it costs the
       same handful of boxes as every other long gun. */
    models.kar98 = (function () {
      var g = rifleBase(wood, 1.06, true);
      part(g.userData.mag, 0, -0.02, 0, 0.042, 0.06, 0.07, gunmetal);   // internal box mag
      cylPart(g, 0, 0.074, -0.17, 0.026, 0.19, dark);                   // scope tube (shorter)
      cylPart(g, 0, 0.074, -0.27, 0.031, 0.028, brass);                 // objective, brass ring
      cylPart(g, 0, 0.074, -0.07, 0.030, 0.028, gunmetal);              // eyepiece
      part(g, 0, 0.050, -0.12, 0.015, 0.024, 0.02, steel);              // mount F
      part(g, 0, 0.050, -0.22, 0.015, 0.024, 0.02, steel);              // mount R
      var kh = cylPart(g, 0.048, 0.005, 0.03, 0.010, 0.08, steel, false); // straight bolt handle
      part(g, 0.048, -0.03, 0.03, 0.018, 0.018, 0.018, steel);          // bolt knob
      part(g, 0, -0.03, -0.62, 0.055, 0.045, 0.30, wood);               // long wooden forend
      part(g, 0, 0.028, -0.90, 0.020, 0.030, 0.05, gunmetal);           // hooded front sight
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
    models.aa12 = (function () {                                       // airdrop-exclusive auto shotgun
      var g = new THREE.Group();
      part(g, 0, 0, -0.04, 0.07, 0.1, 0.34, dark);                     // boxy receiver
      cylPart(g, 0, 0.02, -0.52, 0.021, 0.5, gunmetal);                // barrel
      part(g, 0, 0.055, -0.3, 0.03, 0.02, 0.4, steel);                 // top rail
      var mag = new THREE.Group(); mag.position.set(0, -0.11, -0.1); g.add(mag);
      cylPart(mag, 0, 0, 0, 0.055, 0.16, gunmetal);                    // drum magazine
      g.userData.mag = mag; g.userData.magHome = mag.position.clone();
      part(g, 0, -0.09, 0.09, 0.05, 0.1, 0.05, dark);                  // grip
      part(g, 0, -0.005, 0.2, 0.05, 0.08, 0.2, dark);                  // stock
      part(g, 0, -0.04, -0.33, 0.05, 0.045, 0.14, steel);              // forend
      part(g, 0, 0.085, -0.46, 0.012, 0.024, 0.012, gunmetal);         // front sight
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
    /* ===================== v9.3 — THE ARMOURY EXPANSION =====================
       Nine new weapons. There IS a generic-rifle fallback below, so a missing
       model here would not crash — it would be worse than that: every new gun
       would silently render as the same grey rifle and nobody would notice
       until a screenshot. verify-models asserts an explicit entry per weapon
       for exactly that reason.

       Each one is built to be recognisable at a glance in first person, because
       that is the only place a viewmodel is ever seen: distinct silhouette,
       distinct magazine position, distinct furniture colour. Triangle cost is
       tiny (a viewmodel is one weapon on screen, not 20 avatars) but the parts
       are still kept to the shared palette so no new material is created. */
    models.aug = (function () {                                        // bullpup, integral optic
      var g = new THREE.Group();
      part(g, 0, -0.005, 0.04, 0.066, 0.1, 0.44, green);               // one-piece shell
      cylPart(g, 0, 0.012, -0.34, 0.017, 0.34, dark);                  // barrel
      part(g, 0, -0.075, -0.12, 0.05, 0.09, 0.07, green);              // forward grip
      cylPart(g, 0, 0.085, -0.02, 0.03, 0.26, gunmetal);               // integral scope tube
      cylPart(g, 0, 0.085, -0.16, 0.034, 0.028, steel);                // objective
      var magA = new THREE.Group(); magA.position.set(0, -0.1, 0.16); g.add(magA);
      part(magA, 0, 0, 0, 0.044, 0.13, 0.06, tan);                     // mag behind the grip
      g.userData.mag = magA; g.userData.magHome = magA.position.clone();
      part(g, 0, -0.06, 0.05, 0.05, 0.06, 0.06, green);                // trigger group
      return g;
    })();
    models.famas = (function () {                                      // bullpup, tall carry handle
      var g = new THREE.Group();
      part(g, 0, 0, 0.05, 0.06, 0.1, 0.46, dark);                      // shell
      cylPart(g, 0, 0.01, -0.36, 0.015, 0.32, gunmetal);               // long thin barrel
      part(g, 0, 0.088, -0.06, 0.022, 0.055, 0.36, dark);              // full-length carry handle
      part(g, 0, -0.075, -0.06, 0.045, 0.08, 0.06, dark);              // fore grip
      var magF = new THREE.Group(); magF.position.set(0, -0.1, 0.18); g.add(magF);
      part(magF, 0, 0, 0, 0.04, 0.12, 0.055, gunmetal);
      g.userData.mag = magF; g.userData.magHome = magF.position.clone();
      part(g, 0, 0.05, -0.5, 0.014, 0.05, 0.014, steel);               // bipod stub
      return g;
    })();
    models.akm = (function () {                                        // heavier AK, slanted brake
      var g = rifleBase(wood, 0.78, true);
      var a1 = part(g.userData.mag, 0, 0, 0, 0.044, 0.14, 0.072, gunmetal); a1.rotation.x = 0.2;
      var a2 = part(g.userData.mag, 0, -0.11, 0.03, 0.044, 0.1, 0.066, gunmetal); a2.rotation.x = 0.48;
      var brake = cylPart(g, 0, 0.006, -0.82, 0.026, 0.1, steel); brake.rotation.z = 0.22;
      part(g, 0, 0.048, -0.3, 0.022, 0.03, 0.1, wood);                 // upper handguard
      return g;
    })();
    models.k98w = (function () {                                       // WWII bolt rifle, all wood
      var g = rifleBase(wood, 1.0, true);
      part(g, 0, -0.02, -0.3, 0.058, 0.07, 0.52, wood);                // full-length stock
      part(g.userData.mag, 0, -0.02, 0, 0.05, 0.05, 0.09, wood);       // internal box mag bulge
      var bolt = cylPart(g, 0.055, 0.03, 0.03, 0.012, 0.1, steel, false); bolt.rotation.z = 1.15;
      cylPart(g, 0.055, 0.03, -0.02, 0.014, 0.05, steel);              // bolt body
      part(g, 0, 0.058, -0.86, 0.014, 0.045, 0.02, gunmetal);          // hooded front sight
      part(g, 0, 0.05, -0.12, 0.03, 0.024, 0.06, gunmetal);            // tangent rear sight
      cylPart(g, 0, -0.045, -0.62, 0.012, 0.16, steel);                // cleaning rod
      return g;
    })();
    models.garand = (function () {                                     // WWII semi-auto
      var g = rifleBase(wood, 0.98, true);
      part(g, 0, -0.02, -0.28, 0.056, 0.066, 0.48, wood);              // stock
      part(g.userData.mag, 0, -0.01, 0, 0.048, 0.045, 0.08, wood);     // en-bloc clip well
      cylPart(g, 0, -0.05, -0.5, 0.014, 0.3, steel);                   // op rod
      part(g, 0, 0.055, -0.84, 0.016, 0.042, 0.018, gunmetal);         // front sight wings
      part(g, 0, 0.05, -0.08, 0.032, 0.028, 0.05, gunmetal);           // aperture rear
      return g;
    })();
    models.ump9 = (function () {                                       // boxy polymer SMG
      var g = new THREE.Group();
      part(g, 0, 0, -0.04, 0.058, 0.09, 0.32, tan);                    // squared receiver
      cylPart(g, 0, 0.01, -0.34, 0.015, 0.22, dark);                   // short barrel
      part(g, 0, -0.085, 0.04, 0.048, 0.1, 0.055, dark);               // pistol grip
      var magU = new THREE.Group(); magU.position.set(0, -0.11, -0.11); g.add(magU);
      part(magU, 0, 0, 0, 0.04, 0.15, 0.055, tan);                     // straight stick mag
      g.userData.mag = magU; g.userData.magHome = magU.position.clone();
      part(g, 0, 0.058, -0.12, 0.03, 0.022, 0.24, dark);               // top rail
      part(g, 0, -0.01, 0.16, 0.04, 0.05, 0.18, dark);                 // folding stock arm
      part(g, 0, -0.02, 0.26, 0.05, 0.08, 0.03, dark);                 // stock plate
      return g;
    })();
    models.mp5 = (function () {                                        // slim, tri-lug, curved mag
      var g = new THREE.Group();
      part(g, 0, 0, -0.06, 0.05, 0.082, 0.34, dark);                   // receiver
      cylPart(g, 0, 0.008, -0.32, 0.014, 0.22, gunmetal);              // barrel shroud
      part(g, 0, -0.055, -0.2, 0.045, 0.055, 0.16, dark);              // handguard
      part(g, 0, -0.085, 0.05, 0.045, 0.1, 0.055, dark);               // grip
      var magM = new THREE.Group(); magM.position.set(0, -0.11, -0.1); g.add(magM);
      var c1 = part(magM, 0, 0, 0, 0.038, 0.15, 0.05, gunmetal); c1.rotation.x = 0.12;
      g.userData.mag = magM; g.userData.magHome = magM.position.clone();
      cylPart(g, 0, 0.056, -0.26, 0.019, 0.05, gunmetal);              // hooded front sight
      cylPart(g, 0, 0.056, 0.02, 0.021, 0.04, gunmetal);               // drum rear sight
      part(g, 0, -0.005, 0.19, 0.04, 0.05, 0.2, dark);                 // retractable stock
      return g;
    })();
    models.vector = (function () {                                     // angular, tall mag
      var g = new THREE.Group();
      part(g, 0, 0.01, -0.02, 0.055, 0.11, 0.3, dark);                 // slanted body
      cylPart(g, 0, 0.02, -0.26, 0.014, 0.16, gunmetal);               // stubby barrel
      part(g, 0, -0.08, 0.06, 0.046, 0.1, 0.05, dark);                 // grip
      var magV = new THREE.Group(); magV.position.set(0, -0.14, -0.02); g.add(magV);
      part(magV, 0, 0, 0, 0.036, 0.2, 0.05, gunmetal);                 // very long mag
      g.userData.mag = magV; g.userData.magHome = magV.position.clone();
      part(g, 0, 0.075, -0.06, 0.03, 0.024, 0.26, dark);               // rail
      part(g, 0, 0.02, 0.18, 0.045, 0.06, 0.16, dark);                 // folding stock
      return g;
    })();
    models.bow = (function () {                                        // recurve — no receiver at all
      var g = new THREE.Group();
      /* A bow has no barrel and no magazine, so nothing from rifleBase applies.
         The riser sits vertically in front of the hand and the limbs sweep away
         from it, which reads instantly as "not a gun" in the corner of the eye
         — the point of the silhouette. */
      part(g, 0, 0, -0.16, 0.03, 0.26, 0.05, wood);                    // riser
      part(g, 0, 0.055, -0.2, 0.022, 0.07, 0.04, dark);                // sight window
      var upper = part(g, 0, 0.30, -0.2, 0.02, 0.34, 0.035, wood);     // upper limb
      upper.rotation.x = -0.28;
      var lower = part(g, 0, -0.30, -0.2, 0.02, 0.34, 0.035, wood);    // lower limb
      lower.rotation.x = 0.28;
      cylPart(g, 0, 0.46, -0.24, 0.012, 0.05, steel);                  // upper tip
      cylPart(g, 0, -0.46, -0.24, 0.012, 0.05, steel);                 // lower tip
      var stringG = new THREE.Group(); g.add(stringG);
      var st1 = cylPart(stringG, 0, 0.23, -0.12, 0.004, 0.48, blade, false); st1.rotation.x = 0.26;
      var st2 = cylPart(stringG, 0, -0.23, -0.12, 0.004, 0.48, blade, false); st2.rotation.x = -0.26;
      /* The nocked arrow is the ammo indicator: it rides the `mag` slot, so the
         existing reload animation pulls it back and releases it without any
         bow-specific animation code. */
      var arrow = new THREE.Group(); arrow.position.set(0, 0, 0); g.add(arrow);
      cylPart(arrow, 0, 0, -0.34, 0.006, 0.72, wood);                  // shaft
      part(arrow, 0, 0, -0.68, 0.012, 0.012, 0.05, blade);             // head
      part(arrow, 0.014, 0, -0.02, 0.002, 0.03, 0.06, brass);          // fletching
      part(arrow, -0.014, 0, -0.02, 0.002, 0.03, 0.06, brass);
      g.userData.mag = arrow; g.userData.magHome = arrow.position.clone();
      return g;
    })();
    /* v9.5: the carried drone. Held flat in front of the operator like a
       launch tray, so it reads as "about to be thrown into the sky" rather than
       as a weapon being aimed. Rotors are static geometry — it is not spinning
       until it leaves your hands. */
    models.drone = (function () {
      var g = new THREE.Group();
      part(g, 0, -0.04, -0.10, 0.30, 0.07, 0.30, gunmetal);          // body
      [[0.20, 0.20], [-0.20, 0.20], [0.20, -0.20], [-0.20, -0.20]].forEach(function (o) {
        var arm = part(g, o[0] * 0.5, -0.04, -0.10 + o[1] * 0.5, 0.18, 0.03, 0.05, dark);
        arm.rotation.y = Math.atan2(o[1], o[0]);
        cylPart(g, o[0], -0.005, -0.10 + o[1], 0.13, 0.012, steel, false);
      });
      part(g, 0, 0.01, -0.10, 0.06, 0.03, 0.06, NEONRED);            // status light
      part(g, 0, -0.10, -0.10, 0.10, 0.05, 0.10, dark);              // payload pod
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
    return models;
  }

  /* ===================== v9.5 — ATTACHMENTS YOU CAN SEE =====================

     Rahul: "red dot sight when looted doesn't effect anything on the gun, it
     still does the default layout ... when extended mag is looted, it doesn't
     extend the bullets."

     The mechanics were already there — eff() has applied spreadMult, adsFov,
     magMult and reloadMult since v5.1, and startReload/finishReload read the
     effective magazine. What was missing is that NOTHING CHANGED ON SCREEN. You
     looted a red dot, the toast said "Red Dot equipped", and then you looked
     down the same iron sights at the same gun. A modifier the player cannot see
     is a modifier the player does not believe in, and the natural conclusion is
     that the pickup is broken.

     So attachments are now physical. Every fitted part is tagged
     `userData.att = true` and stripped before refitting, because a player who
     swaps a 2x for a 4x must not end up wearing both.

     THE MAGAZINE IS THE INTERESTING ONE. Every viewmodel already exposes its
     magazine group as `userData.mag` so the reload animation can pull it out —
     that same handle is reused here to stretch it. No model needs a second
     magazine mesh and no model needs editing. */
  function dress(g, atts) {
    if (!g) return;
    // strip anything fitted last time, and undo the magazine stretch
    for (var i = g.children.length - 1; i >= 0; i--) {
      if (g.children[i].userData && g.children[i].userData.att) g.remove(g.children[i]);
    }
    var magG = g.userData.mag;
    if (magG && magG.userData && magG.userData.baseScaleY !== undefined) {
      magG.scale.y = magG.userData.baseScaleY;
      magG.position.y = magG.userData.baseY;
    }
    if (!atts) return;
    var A = (typeof CFG !== 'undefined' && CFG.ATTACH) || {};

    /* SIGHT. A red dot is a small tube with a bright lens; magnified optics get
       a longer body and a bigger objective, scaled off the attachment's own
       adsFov so a 8x visibly outsizes a 2x without a per-scope model. */
    var sName = atts.sight, sDef = sName && A[sName];
    if (sDef) {
      var mag = sDef.adsFov ? Math.max(1, 52 / sDef.adsFov) : 1;   // 1 for a red dot
      var scoped = !!sDef.adsFov;
      var body = new THREE.Mesh(
        new THREE.CylinderGeometry(scoped ? 0.028 : 0.024, scoped ? 0.028 : 0.024,
          scoped ? Math.min(0.30, 0.13 + mag * 0.022) : 0.075, 10), mat(0x15181c));
      body.rotation.x = Math.PI / 2;
      body.position.set(0, 0.085, scoped ? -0.10 : -0.02);
      body.userData.att = true; g.add(body);
      // objective lens, larger with magnification
      var lensR = scoped ? Math.min(0.05, 0.026 + mag * 0.004) : 0.019;
      var lens = new THREE.Mesh(new THREE.CylinderGeometry(lensR, lensR, 0.012, 10),
        new THREE.MeshBasicMaterial({ color: scoped ? 0x2a4a66 : 0xff3a2a }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.085, scoped ? -0.24 : -0.056);
      lens.userData.att = true; g.add(lens);
      // riser so the optic sits above the receiver rather than inside it
      var riser = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.05), mat(0x22262b));
      riser.position.set(0, 0.055, scoped ? -0.06 : -0.02);
      riser.userData.att = true; g.add(riser);
    }

    /* MUZZLE. A suppressor is long and fat; a compensator is short and ported.
       Both read instantly from the corner of the eye, which is the point. */
    var muName = atts.muzzle, muDef = muName && A[muName];
    if (muDef) {
      var supp = !!muDef.quiet;
      var can = new THREE.Mesh(
        new THREE.CylinderGeometry(supp ? 0.032 : 0.028, supp ? 0.032 : 0.03,
          supp ? 0.20 : 0.08, 10), mat(supp ? 0x1c2024 : 0x3a4149));
      can.rotation.x = Math.PI / 2;
      can.position.set(0, 0.005, supp ? -0.78 : -0.72);
      can.userData.att = true; g.add(can);
      if (!supp) {
        var port = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.05), mat(0x2a3037));
        port.position.set(0, 0.028, -0.72); port.userData.att = true; g.add(port);
      }
    }

    /* MAGAZINE. Stretched, not replaced — see the note above. The anchor is
       cached the first time so repeated swaps cannot compound the offset, which
       is how a magazine ends up hanging a metre below the gun. */
    var mDef = atts.mag && A[atts.mag];
    if (mDef && magG && mDef.magMult && mDef.magMult > 1) {
      if (magG.userData.baseScaleY === undefined) {
        magG.userData.baseScaleY = magG.scale.y;
        magG.userData.baseY = magG.position.y;
      }
      var k = Math.min(1.9, mDef.magMult);
      magG.scale.y = magG.userData.baseScaleY * k;
      // drop it so it grows DOWNWARD out of the well instead of through it
      magG.position.y = magG.userData.baseY - (k - 1) * 0.055;
    }
  }

  return { build: build, dress: dress };
})();
