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
    return models;
  }

  return { build: build };
})();
