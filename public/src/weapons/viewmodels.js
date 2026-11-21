/* First-person weapon model factory (render-only, no gameplay logic).
   Contract: WeaponModels.build() -> { weaponName: THREE.Group } for every
   entry in CFG.WEAPON_ORDER — completeness enforced by the fallback loop. */
var WeaponModels = (function () {
  'use strict';
  /* ===== v2.16 - A FINISH, NOT A PAINT COLOUR =====
     Rahul: "Gun ke skins ko update karo, bahot outdated dikhta hai, sab mei ek
     texture lao, shine lao." Every part of every weapon was MeshLambert in one
     flat colour — a painted block. The parts are the same; what covers them is
     now one of five FINISHES, shared by all the weapons, so the whole armoury
     reads as one set:
       metal  brushed steel: fine streaks along the part, scratches, bright
              worn edges; a tight highlight and a reflection of the sky
       poly   moulded polymer: stipple, a softer edge, a dull sheen
       wood   grain and a knot under varnish
       cloth  a weave, for the glove and the sleeve
       skin   for the wrist
     Each is a 128 px texture painted once and MULTIPLIED by the part's own
     colour, so the palette below still decides what is black, tan or wood.
     The shine is two things: Phong's highlight from the map's own sun, and a
     32 px sky-and-ground cube that every finish reflects a little of — it is
     what makes a flat steel face change as the gun moves. No file is loaded.
     Headless (the model gates, which have no canvas) it is plain Lambert, as
     before: the finish is paint, and nothing measures paint. */
  var FIN = {
    metal: { shin: 96, spec: 0x6e747a, refl: 0.13, lift: 1.08 },
    poly:  { shin: 20, spec: 0x2c3036, refl: 0.05, lift: 1.10 },
    wood:  { shin: 42, spec: 0x5c4a36, refl: 0.07, lift: 1.06 },
    cloth: { shin: 5,  spec: 0x0c0c0c, refl: 0,    lift: 1.0 },
    skin:  { shin: 12, spec: 0x2a1c14, refl: 0,    lift: 1.05 }
  };
  var TEX = null, ENV = null;
  function rnd(seed) { var v = seed >>> 0; return function () { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; }; }
  function sheet(kind) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var g = cv.getContext('2d'), r = rnd(kind.length * 977 + kind.charCodeAt(0)), i, y;
    if (kind === 'metal') {
      g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, 128, 128);
      for (i = 0; i < 240; i++) { y = r() * 128; g.fillStyle = (r() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (0.03 + r() * 0.09).toFixed(3) + ')'; g.fillRect(r() * 40 - 20, y, 60 + r() * 110, 1); }
      for (i = 0; i < 5; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.18 + r() * 0.25).toFixed(2) + ')'; g.lineWidth = 0.7; g.beginPath(); var sx = r() * 128, sy = r() * 128; g.moveTo(sx, sy); g.lineTo(sx + (r() - 0.5) * 70, sy + (r() - 0.5) * 16); g.stroke(); }
      var shade = g.createLinearGradient(0, 0, 0, 128); shade.addColorStop(0, 'rgba(255,255,255,0.10)'); shade.addColorStop(0.55, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.20)');
      g.fillStyle = shade; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.strokeRect(1, 1, 126, 126);          // the worn edge
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 3; g.strokeRect(5, 5, 118, 118);
    } else if (kind === 'poly') {
      g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, 128, 128);
      for (i = 0; i < 1500; i++) { g.fillStyle = (r() < 0.55 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (0.05 + r() * 0.10).toFixed(3) + ')'; g.fillRect(r() * 128, r() * 128, 1.4, 1.4); }
      g.strokeStyle = 'rgba(255,255,255,0.42)'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
    } else if (kind === 'wood') {
      g.fillStyle = '#d2c6b8'; g.fillRect(0, 0, 128, 128);
      for (i = 0; i < 46; i++) {
        y = r() * 128; var amp = 1 + r() * 3, ph = r() * 6.28;
        g.strokeStyle = 'rgba(40,20,8,' + (0.10 + r() * 0.26).toFixed(2) + ')'; g.lineWidth = 0.6 + r() * 1.6; g.beginPath();
        for (var x = 0; x <= 128; x += 8) { var yy = y + Math.sin(x / 21 + ph) * amp; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
        g.stroke();
      }
      g.strokeStyle = 'rgba(40,20,8,0.35)';
      for (i = 0; i < 4; i++) { g.lineWidth = 1; g.beginPath(); g.ellipse(86, 44, 5 + i * 4, 2.5 + i * 2, 0.1, 0, 6.283); g.stroke(); }
      g.strokeStyle = 'rgba(255,240,215,0.30)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 125, 125);
    } else if (kind === 'cloth') {
      g.fillStyle = '#d2d2d2'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 1;
      for (i = 0; i < 128; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i + 1.5); g.lineTo(128, i + 1.5); g.stroke(); }
      for (i = 0; i < 900; i++) { g.fillStyle = (r() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (0.03 + r() * 0.06).toFixed(3) + ')'; g.fillRect(r() * 128, r() * 128, 2, 1); }
      var fold = g.createLinearGradient(0, 0, 128, 0); fold.addColorStop(0, 'rgba(0,0,0,0.16)'); fold.addColorStop(0.3, 'rgba(0,0,0,0)'); fold.addColorStop(0.62, 'rgba(0,0,0,0.10)'); fold.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = fold; g.fillRect(0, 0, 128, 128);                                                    // a sleeve is round: darker toward its edges
    } else {
      g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, 128, 128);
      for (i = 0; i < 300; i++) { g.fillStyle = 'rgba(90,40,20,' + (0.03 + r() * 0.05).toFixed(3) + ')'; g.fillRect(r() * 128, r() * 128, 2, 2); }
    }
    return new THREE.CanvasTexture(cv);
  }
  /* what the finishes reflect: bright sky above, a pale horizon, dark ground */
  function sky() {
    var faces = [];
    for (var f = 0; f < 6; f++) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 32;
      var g = cv.getContext('2d');
      if (f === 2) g.fillStyle = '#9db4cc';
      else if (f === 3) g.fillStyle = '#14120e';
      else { var gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#8fa9c4'); gr.addColorStop(0.4, '#d9d8cf'); gr.addColorStop(0.5, '#f6f3e8'); gr.addColorStop(0.58, '#3c382f'); gr.addColorStop(1, '#14120e'); g.fillStyle = gr; }
      g.fillRect(0, 0, 32, 32);
      faces.push(cv);
    }
    var t = new THREE.CubeTexture(faces); t.needsUpdate = true;
    return t;
  }
  function finishes() {
    if (TEX) return;
    TEX = {};
    if (typeof document === 'undefined' || !document.createElement || !THREE.CanvasTexture || !THREE.CubeTexture || !THREE.MeshPhongMaterial) return;
    try {
      for (var k in FIN) TEX[k] = sheet(k);
      ENV = sky();
    } catch (err) { TEX = {}; ENV = null; }        // no 2D canvas: the weapons are still there, in flat paint
  }
  function mat(c, kind) {
    finishes();
    kind = kind || 'metal';
    var F = FIN[kind];
    if (!TEX[kind]) return new THREE.MeshLambertMaterial({ color: c });
    var m = new THREE.MeshPhongMaterial({ color: c, map: TEX[kind], shininess: F.shin, specular: F.spec });
    m.color.multiplyScalar(F.lift);                 // the sheet darkens a little; give the palette back its value
    if (ENV && F.refl) { m.envMap = ENV; m.combine = THREE.AddOperation; m.reflectivity = F.refl; }
    return m;
  }
  function part(g, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); g.add(b); return b;
  }

  var DRESS = { glove: null, pad: null, cuff: null, sleeve: null, fold: null, skin: null };
  var GREY = (typeof THREE !== 'undefined' && THREE.Color) ? new THREE.Color(0x6a6e72) : null;
  /* v2.16: the sleeve takes the player's side colour (the avatar's forearm is
     that colour at 0.84) and the wrist their callsign's skin */
  function setDress(teamColor, skinHex) {
    try {
      /* the avatar's forearm is the side colour at 0.84; a sleeve a hand's breadth from the lens is greyed and darkened a little more, or it is the brightest thing on screen */
      if (DRESS.sleeve && DRESS.sleeve.color && DRESS.sleeve.color.set) { DRESS.sleeve.color.set(teamColor); DRESS.sleeve.color.lerp(GREY, 0.28); DRESS.sleeve.color.multiplyScalar(0.68); }
      if (DRESS.fold && DRESS.fold.color && DRESS.fold.color.copy && DRESS.sleeve && DRESS.sleeve.color) { DRESS.fold.color.copy(DRESS.sleeve.color); DRESS.fold.color.multiplyScalar(0.62); }   // the creases and the seam: the same cloth, in its own shadow
      if (skinHex !== undefined && DRESS.skin && DRESS.skin.color && DRESS.skin.color.set) DRESS.skin.color.set(skinHex);
    } catch (err) { /* paint */ }
  }
  function build() {
    var models = {};
    var gunmetal = mat(0x2b2f34), dark = mat(0x1e2126), wood = mat(0x6b4a2a, 'wood'), tan = mat(0x4a4438, 'poly'),
      green = mat(0x36402e, 'poly'), steel = mat(0x54595f), blade = mat(0xb9bfc6), brass = mat(0xb08a3a),
      NEONRED = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
    function cylPart(g, x, y, z, r, len, m, alongZ) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m);
      if (alongZ !== false) c.rotation.x = Math.PI / 2;
      c.position.set(x, y, z); g.add(c); return c;
    }
    /* v2.16 - the same small furniture for the guns that are NOT on the rifle
       chassis. o: gz/gy = trigger guard (z of its middle, y of its floor),
       port = [y, z, len] on a receiver of half-width hw, ring = [y, z, r] at
       the muzzle, butt = [y, z, w, h]. Left AND right where a side shows. */
    function kit(g, o) {
      if (o.gz !== undefined) {
        part(g, 0, o.gy, o.gz, 0.012, 0.006, 0.076, dark);
        part(g, 0, o.gy + 0.013, o.gz - 0.038, 0.012, 0.03, 0.006, dark);
        part(g, 0, o.gy + 0.016, o.gz + 0.012, 0.008, 0.024, 0.008, steel).rotation.x = -0.3;
      }
      if (o.port) {
        part(g, o.hw + 0.0015, o.port[0], o.port[1], 0.004, 0.028, o.port[2], dark);
        part(g, o.hw + 0.0025, o.port[0] - 0.002, o.port[1] - 0.012, 0.004, 0.018, o.port[2] * 0.55, steel);
        part(g, -(o.hw + 0.001), o.port[0] + 0.006, o.port[1], 0.003, 0.004, o.port[2] * 2.2, dark);     // the seam, on the side that shows
        cylPart(g, -(o.hw + 0.001), o.port[0] - 0.03, o.port[1] + o.port[2] * 0.8, 0.0055, 0.005, steel, false).rotation.z = Math.PI / 2;
        cylPart(g, -(o.hw + 0.001), o.port[0] - 0.03, o.port[1] - o.port[2] * 0.9, 0.0055, 0.005, steel, false).rotation.z = Math.PI / 2;
      }
      if (o.ring) cylPart(g, 0, o.ring[0], o.ring[1], o.ring[2], 0.016, steel);
      if (o.butt) part(g, 0, o.butt[0], o.butt[1], o.butt[2], o.butt[3], 0.012, dark);
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
      /* v2.16: what a rifle has that a box does not. Eleven weapons share this
         chassis, so the furniture is fitted once, here — small parts, and after
         bake() below they cost nothing (one mesh per finish, however many). */
      part(g, 0.0325, 0.006, -0.085, 0.004, 0.034, 0.10, dark);        // ejection port
      part(g, 0.0335, 0.004, -0.10, 0.004, 0.022, 0.055, steel);       // the bolt, seen through it
      cylPart(g, 0.032, -0.026, 0.015, 0.006, 0.006, steel, false).rotation.z = Math.PI / 2;   // receiver pins
      cylPart(g, 0.032, -0.026, -0.19, 0.006, 0.006, steel, false).rotation.z = Math.PI / 2;
      part(g, 0, -0.072, 0.012, 0.012, 0.006, 0.085, dark);            // trigger guard, bottom
      part(g, 0, -0.057, -0.03, 0.012, 0.036, 0.006, dark);            // ... and front
      part(g, 0, -0.054, 0.024, 0.008, 0.028, 0.008, steel).rotation.x = -0.3;                // trigger
      for (var v = 0; v < 3; v++) {                                    // handguard vents, both sides
        part(g, 0.0305, -0.004, -len * (0.24 + v * 0.085), 0.003, 0.014, len * 0.05, dark);
        part(g, -0.0305, -0.004, -len * (0.24 + v * 0.085), 0.003, 0.014, len * 0.05, dark);
      }
      part(g, 0, -0.015, -len * 0.515, 0.066, 0.066, 0.016, steel);    // handguard cap
      cylPart(g, 0, 0.005, -len * 0.925, 0.021, 0.02, steel);          // muzzle crown
      part(g, 0, 0.034, -len * 0.86, 0.026, 0.012, 0.03, gunmetal);    // front sight base
      part(g, 0, 0.048, -0.08, 0.05, 0.008, 0.20, dark);               // top cover rib
      if (hasStock) {
        part(g, 0, -0.03, 0.331, 0.054, 0.118, 0.012, dark);           // butt plate
        cylPart(g, 0, -0.085, 0.27, 0.007, 0.05, steel, false).rotation.z = Math.PI / 2;      // sling swivel
      }
      part(g, 0, -0.148, 0.065, 0.054, 0.008, 0.064, dark);            // grip cap
      /* ... and the LEFT side, which is the one the player looks at all match */
      cylPart(g, -0.032, -0.026, 0.015, 0.006, 0.006, steel, false).rotation.z = Math.PI / 2;  // the same two pins, through
      cylPart(g, -0.032, -0.026, -0.19, 0.006, 0.006, steel, false).rotation.z = Math.PI / 2;
      part(g, -0.0325, -0.012, 0.035, 0.004, 0.012, 0.038, steel).rotation.x = 0.5;            // fire selector
      part(g, -0.0325, 0.012, -0.10, 0.003, 0.004, 0.22, dark);        // the seam between upper and lower
      part(g, -0.0325, -0.03, -0.115, 0.005, 0.018, 0.022, steel);     // magazine catch
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
      kit(g, { gz: -0.035, gy: -0.064, hw: 0.035, port: [0.012, -0.10, 0.08], ring: [0.01, -0.39, 0.02] });
      part(g, 0, 0.047, -0.13, 0.05, 0.006, 0.26, dark);               // top cover
      part(g, 0, 0.056, -0.12, 0.022, 0.014, 0.045, steel);            // cocking knob
      part(g, 0.027, -0.09, 0.02, 0.004, 0.085, 0.045, tan); part(g, -0.027, -0.09, 0.02, 0.004, 0.085, 0.045, tan);   // grip panels
      part(g, 0, 0.005, 0.205, 0.05, 0.07, 0.012, steel);              // stock butt
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
      for (var pr = 0; pr < 4; pr++) { part(pump, 0.0285, 0, -0.054 + pr * 0.036, 0.003, 0.04, 0.012, dark); part(pump, -0.0285, 0, -0.054 + pr * 0.036, 0.003, 0.04, 0.012, dark); }   // its grooves
      g.userData.pump = pump; g.userData.pumpHome = pump.position.clone();
      part(g, 0, 0.055, -0.72, 0.012, 0.02, 0.012, brass);             // bead sight
      kit(g, { gz: 0.0, gy: -0.06, hw: 0.03, port: [0.008, -0.04, 0.09], butt: [-0.005, 0.336, 0.054, 0.092] });
      part(g, 0, -0.012, -0.74, 0.03, 0.07, 0.014, steel);             // the clamp that holds barrel and tube together
      cylPart(g, 0, -0.032, -0.76, 0.019, 0.012, steel);               // magazine tube cap
      part(g, 0, 0.044, -0.02, 0.02, 0.006, 0.26, dark);               // receiver rib
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
      kit(g, { gz: 0.03, gy: -0.064, hw: 0.035, port: [0.01, -0.06, 0.10], ring: [0.02, -0.76, 0.026], butt: [-0.005, 0.306, 0.054, 0.088] });
      part(g, 0, 0.08, -0.13, 0.03, 0.026, 0.02, gunmetal);            // rear sight block
      cylPart(mag, 0, 0, 0, 0.022, 0.166, steel);                      // drum hub
      return g;
    })();
    models.pistol = (function () {
      var g = new THREE.Group();
      part(g, 0, -0.025, -0.1, 0.042, 0.05, 0.24, gunmetal);           // frame
      var slide = new THREE.Group(); slide.position.set(0, 0.012, -0.1); g.add(slide);
      part(slide, 0, 0, 0, 0.044, 0.045, 0.26, dark);                  // slide
      part(slide, 0, 0.028, 0.1, 0.012, 0.012, 0.02, dark);            // rear sight
      part(slide, 0, 0.028, -0.11, 0.008, 0.012, 0.01, dark);          // front sight
      for (var sr = 0; sr < 5; sr++) { part(slide, 0.0225, 0.002, 0.115 - sr * 0.011, 0.002, 0.034, 0.005, steel); part(slide, -0.0225, 0.002, 0.115 - sr * 0.011, 0.002, 0.034, 0.005, steel); }   // slide serrations
      part(slide, 0.0225, 0.008, -0.01, 0.002, 0.016, 0.05, steel);    // ejection port
      part(slide, 0, 0.0235, 0, 0.012, 0.003, 0.2, gunmetal);          // sight rib
      cylPart(slide, 0, 0.004, -0.126, 0.010, 0.008, steel);           // the barrel, in the slide's mouth
      g.userData.slide = slide; g.userData.slideHome = slide.position.clone();
      part(g, 0, -0.09, 0.03, 0.042, 0.12, 0.055, gunmetal);           // grip
      part(g, 0, -0.055, -0.055, 0.01, 0.008, 0.07, steel);            // trigger guard
      part(g, 0, -0.045, -0.09, 0.01, 0.028, 0.008, steel);            // ... its front
      part(g, 0, -0.042, -0.04, 0.008, 0.022, 0.008, steel).rotation.x = -0.3;   // trigger
      part(g, 0, 0.016, 0.036, 0.010, 0.02, 0.012, steel);             // hammer
      part(g, 0.022, -0.09, 0.03, 0.004, 0.10, 0.044, tan); part(g, -0.022, -0.09, 0.03, 0.004, 0.10, 0.044, tan);   // grip panels
      part(g, 0, -0.052, -0.17, 0.03, 0.012, 0.07, dark);              // accessory rail
      part(g, -0.0225, -0.02, -0.02, 0.003, 0.008, 0.03, steel);       // slide stop, on the side that shows
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
      kit(g, { ring: [0.01, -0.42, 0.02], butt: [-0.01, 0.236, 0.074, 0.104] });
      part(g, 0, 0.085, 0.06, 0.03, 0.012, 0.09, dark);                // optic rail
      part(g, 0.036, -0.02, -0.06, 0.003, 0.05, 0.10, dark); part(g, -0.036, -0.02, -0.06, 0.003, 0.05, 0.10, dark);   // side recess
      part(g, -0.036, 0.012, 0.10, 0.003, 0.004, 0.2, dark);           // shell seam
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
      /* v9.9: the integral optic is GONE, for the same reason the attachment
         optics went in v9.7. A 0.26 m tube sitting 0.085 above the receiver is
         directly in the sight line — reported as "a scope of no use that blocks
         the shooting". The AUG's real distinguishing features are its bullpup
         layout and its handling, and it keeps both: the magazine behind the
         grip, the short overall length, and the tighter hip spread and lower
         adsFov in weapons.config.js. Its identity was never the tube.
         A low, flat rail stands in for it — visible, and nowhere near the
         centre of the screen. */
      part(g, 0, 0.052, -0.10, 0.026, 0.018, 0.22, dark);              // low rail
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
      kit(g, { gz: 0.0, gy: -0.062, hw: 0.029, port: [0.012, -0.05, 0.08], ring: [0.01, -0.44, 0.019] });
      part(g, -0.0335, 0.02, -0.12, 0.014, 0.014, 0.03, steel);        // charging handle, left
      part(g, 0, 0.076, -0.22, 0.012, 0.016, 0.012, dark);             // front sight
      part(g, 0, 0.076, -0.02, 0.026, 0.016, 0.014, dark);             // rear sight
      part(g, 0, -0.04, -0.2, 0.05, 0.03, 0.10, dark);                 // handguard underside
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
      kit(g, { gz: 0.01, gy: -0.062, hw: 0.025, port: [0.012, -0.05, 0.08], ring: [0.008, -0.42, 0.018], butt: [-0.005, 0.296, 0.046, 0.085] });
      cylPart(g, -0.03, 0.03, -0.24, 0.007, 0.03, steel, false).rotation.z = Math.PI / 2;      // cocking handle, forward on the left
      part(g, 0.024, -0.055, -0.2, 0.003, 0.02, 0.10, gunmetal); part(g, -0.024, -0.055, -0.2, 0.003, 0.02, 0.10, gunmetal);   // handguard slots
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
      kit(g, { gz: 0.02, gy: -0.06, hw: 0.0275, port: [0.03, -0.03, 0.07], ring: [0.02, -0.33, 0.018], butt: [0.02, 0.266, 0.05, 0.085] });
      part(g, 0, 0.095, -0.17, 0.012, 0.018, 0.012, dark);             // flip sights on the rail
      part(g, 0, 0.095, 0.05, 0.024, 0.018, 0.012, dark);
      part(g, 0, -0.04, -0.14, 0.05, 0.05, 0.06, gunmetal);            // the lower housing ahead of the magazine
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

    /* v15.0 (fix 1): the EMP charge. A palm-sized breaching charge held flat
       like the drone tray — a dark case, a cyan induction coil on top and a
       status LED — so the slot reads as "a device, not a gun" at a glance. */
    models.emp = (function () {
      var g = new THREE.Group();
      var CYAN = new THREE.MeshLambertMaterial({ color: 0x0b1a1e, emissive: 0x51d0e8 });
      part(g, 0, -0.05, -0.12, 0.18, 0.06, 0.24, gunmetal);           // case
      part(g, 0, -0.015, -0.12, 0.16, 0.012, 0.22, dark);             // lid seam
      cylPart(g, 0, 0.0, -0.12, 0.055, 0.02, CYAN, false);            // induction coil
      cylPart(g, 0, 0.0, -0.12, 0.028, 0.026, dark, false);           // coil hub
      part(g, 0.06, 0.0, -0.01, 0.03, 0.012, 0.03, NEONRED);          // arming LED
      part(g, -0.06, -0.005, -0.01, 0.04, 0.014, 0.05, steel);        // trigger key
      part(g, 0, -0.10, -0.12, 0.10, 0.04, 0.10, dark);               // battery pack
      return g;
    })();

    /* v1.0b: the flamethrower — a fuel tank slung under a fat barrel, a pilot
       flame at the nozzle, a hose back to the tank. Reads as fire before it is
       fired. */
    models.flamer = (function () {
      var g = new THREE.Group();
      var PILOT = new THREE.MeshLambertMaterial({ color: 0x3a1600, emissive: 0xff7a1a });
      part(g, 0, -0.06, -0.40, 0.11, 0.11, 0.62, gunmetal);           // barrel
      cylPart(g, 0, -0.06, -0.74, 0.07, 0.10, steel, true);           // nozzle bell
      part(g, 0, -0.06, -0.82, 0.05, 0.05, 0.06, PILOT);              // pilot flame
      part(g, 0, -0.20, -0.20, 0.16, 0.16, 0.40, dark);               // fuel tank
      part(g, 0.05, -0.12, -0.08, 0.04, 0.04, 0.30, steel);           // hose
      part(g, 0, -0.16, 0.05, 0.05, 0.10, 0.16, dark);                // grip
      part(g, 0, -0.03, -0.20, 0.06, 0.05, 0.14, steel);              // valve block
      return g;
    })();
    /* v1.0b: the C4 charge — a brick with a detonator and a red LED, held flat
       like the EMP. */
    models.c4 = (function () {
      var g = new THREE.Group();
      part(g, 0, -0.05, -0.12, 0.16, 0.06, 0.24, new THREE.MeshLambertMaterial({ color: 0xc9b98a }));   // the block
      part(g, 0, -0.01, -0.12, 0.10, 0.02, 0.10, dark);               // detonator
      part(g, 0.03, 0.0, -0.10, 0.02, 0.02, 0.02, NEONRED);           // LED
      part(g, 0, -0.10, -0.12, 0.10, 0.04, 0.10, dark);               // pack
      return g;
    })();
    /* v1.0x: the SEEKER-9 — the launcher's silhouette with a boxy lock unit on
       top and an amber lens, so the hand knows which tube it holds. */
    models.seeker = (function () {
      var g = models.rocket.clone();
      var box = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.16), new THREE.MeshLambertMaterial({ color: 0x2c3138 }));
      box.position.set(0, 0.11, -0.05); g.add(box);
      var lens = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.11, -0.14); g.add(lens);
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
    /* ===== v9.12 — WHERE EACH GUN'S MUZZLE ACTUALLY IS =====
       Reported as "a weird nozzle at the front of every gun". The muzzle
       attachment was placed at a HARDCODED z of -0.72, which is right for
       nothing: an UZI's barrel ends around -0.30 so its compensator floated in
       mid-air ahead of the gun, and a Kar98's runs past -0.90 so its suppressor
       sat buried inside the barrel.

       One number cannot fit twenty-five weapons of different lengths. Each
       model is measured once, here, and the forward-most point of its geometry
       becomes its muzzle anchor. A new weapon gets a correct anchor for free,
       which is the only version of this that stays correct. */
    /* ===== v9.13 — HANDS ON THE WEAPON =====
       Rahul asked for hands, with reference images. Every gun until now floated
       unheld in the corner of the screen, which is the single thing that most
       reads as "unfinished" in a first-person shooter — the reference shots he
       sent are all hands first, gun second.

       Fitted here, once, for EVERY weapon rather than modelled into each of the
       twenty-five: a trigger hand at the grip and a support hand forward on the
       handguard, positioned from the model's OWN measured length. A hand drawn
       at a fixed offset would sit on the magazine of a short SMG and halfway
       down the barrel of a bolt rifle — the same mistake the muzzle attachment
       made until v9.12, and the reason both are measured now.

       Knuckles and a thumb rather than a plain box: at viewmodel distance the
       silhouette is all the player reads, and an unbroken cuboid reads as a
       block of wood. Skipped for the bow, which is drawn already nocked and
       whose own limbs occupy those positions. */
    /* ===== v2.16 - A GLOVED HAND ON A SLEEVED ARM =====
       Rahul: "hand jo usko pakra hai usko bhi sahi se graphics enhance karo aur
       avatar kya dress pehna hai woh hand ke cloths pe dikhna chahiye."
       The hand was four boxes of bare skin with a block on top, and it ended
       at the wrist: nothing said whose it was. It is now what the operator in
       avatars.js wears, piece for piece — a dark glove with a pad of kit
       fabric on the back and four separate fingers closed round the weapon, a
       band of skin at the wrist, the shirt's cuff in kit fabric, and the
       SLEEVE, in the colour of the player's side, running off the bottom of
       the screen. setDress() colours the sleeve and the skin for whoever is
       playing (game.js calls it from the roster). Same place on each weapon as
       v9.13 put it; only what is drawn there changed. */
    DRESS.glove = mat(0x2a261f, 'cloth'); DRESS.pad = mat(0x5a4f37, 'cloth'); DRESS.cuff = mat(0x5a4f37, 'cloth');
    DRESS.sleeve = mat(0x8a3a2c, 'cloth'); DRESS.fold = mat(0x56241b, 'cloth'); DRESS.skin = mat(0xb98a63, 'skin');
    /* a tube from `from` along the unit direction (dx, dy, dz), `len` long */
    function limb(g, from, dx, dy, dz, len, r0, r1, m) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 10), m);
      c.position.set(from[0] + dx * len / 2, from[1] + dy * len / 2, from[2] + dz * len / 2);
      c.rotation.order = 'YXZ'; c.rotation.y = Math.atan2(dx, dz); c.rotation.x = Math.acos(Math.max(-1, Math.min(1, dy)));
      g.add(c);
      return [from[0] + dx * len, from[1] + dy * len, from[2] + dz * len];
    }
    /* side: +1 the trigger hand (its back faces right), -1 the support hand */
    function hand(g, x, y, z, rot, side) {
      side = side || 1;
      var h = new THREE.Group(), k;
      h.position.set(x, y, z);
      if (rot) h.rotation.z = rot;
      part(h, 0, 0, 0, 0.074, 0.092, 0.108, DRESS.glove);                              // palm
      part(h, side * 0.040, 0.006, -0.004, 0.012, 0.062, 0.074, DRESS.pad);            // the pad on the back of the hand
      for (k = 0; k < 4; k++) {                                                        // four fingers, closed round the weapon
        part(h, -side * 0.004, 0.032 - k * 0.0225, -0.066, 0.070, 0.019, 0.034, DRESS.glove);
        part(h, -side * 0.043, 0.032 - k * 0.0225, -0.040, 0.018, 0.019, 0.052, DRESS.glove);
      }
      part(h, side * 0.034, 0.045, -0.060, 0.016, 0.014, 0.040, DRESS.pad);            // knuckle guard
      var th = part(h, -side * 0.040, 0.046, 0.004, 0.026, 0.028, 0.070, DRESS.glove); th.rotation.y = side * 0.25;   // thumb
      /* wrist, cuff and sleeve leave the heel of the hand back and down toward the player */
      var dx = side > 0 ? 0.26 : -0.62, dy = side > 0 ? -0.40 : -0.36, dz = side > 0 ? 0.88 : 0.70, n = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx /= n; dy /= n; dz /= n;
      var at = limb(h, [side * 0.004, -0.018, 0.046], dx, dy, dz, 0.040, 0.030, 0.031, DRESS.skin);
      at = limb(h, at, dx, dy, dz, 0.040, 0.037, 0.039, DRESS.cuff);
      /* a sleeve, not a pipe: it widens toward the elbow, creases twice where
         cloth bunches, and carries the elbow pad the avatar wears */
      at = limb(h, at, dx, dy, dz, 0.150, 0.038, 0.043, DRESS.sleeve);
      at = limb(h, at, dx, dy, dz, 0.012, 0.0455, 0.0455, DRESS.fold);
      at = limb(h, at, dx, dy, dz, 0.130, 0.043, 0.048, DRESS.sleeve);
      at = limb(h, at, dx, dy, dz, 0.012, 0.0505, 0.0505, DRESS.fold);
      at = limb(h, at, dx, dy, dz, 0.080, 0.054, 0.056, DRESS.pad);
      limb(h, at, dx, dy, dz, 0.216, 0.051, 0.056, DRESS.sleeve);
      g.add(h);
      return h;
    }

    /* Bounds computed by WALKING THE CHILDREN, not with THREE.Box3.
       Box3 is a convenience class and is absent from the trimmed THREE the
       model gates run against — exactly the trap Float32BufferAttribute set in
       v9.5, where the geometry was right and the DEPENDENCY was not. Positions
       and the box sizes are all this needs, and both are on every part. */
    Object.keys(models).forEach(function (n) {
      var m = models[n], minZ = Infinity, minY = Infinity, maxY = -Infinity;
      /* Walked with an explicit stack rather than Group.traverse: the model
         gates run against a trimmed THREE whose Group has children but no
         traverse, and a helper that only works in a browser is a helper the
         gates cannot check. */
      var stack = (m.children || []).slice(), o;
      while (stack.length) {
        o = stack.pop();
        if (o.children && o.children.length) stack.push.apply(stack, o.children);
        (function (o) {
        if (!o.geometry || !o.geometry.parameters) return;
        var p = o.geometry.parameters;
        var hz = (p.depth !== undefined ? p.depth : (p.height || 0)) / 2;
        var hy = (p.height !== undefined ? p.height : 0) / 2;
        if (o.rotation && Math.abs(o.rotation.x) > 1) { var t = hz; hz = hy; hy = t; }
        minZ = Math.min(minZ, o.position.z - hz);
        minY = Math.min(minY, o.position.y - hy);
        maxY = Math.max(maxY, o.position.y + hy);
        })(o);
      }
      m.userData.muzzleZ = isFinite(minZ) ? minZ : -0.7;
      m.userData.muzzleY = (isFinite(minY) && isFinite(maxY)) ? (minY + maxY) / 2 : 0.005;

      /* v10 — THE MODEL CARRIES ITS OWN TYPE.

         Rahul, from a screenshot: a knife lying on the ground with a black
         cylinder on its tip. dress() fitted the muzzle can to whatever model
         was current, with no test for whether that model has a barrel. The
         knife measures a muzzleZ like everything else — the loop above cannot
         tell a blade tip from a bore — so the suppressor anchored to the point
         of the blade and looked, correctly, insane. The bow, the drone and the
         RPG had the same bug; nobody had happened to screenshot those.

         The type is stamped ON THE MODEL rather than passed in by the caller.
         A parameter is something a future call site can forget to pass —
         there are two today and a third would silently reintroduce this. A
         model that knows what it is cannot be dressed wrongly by anyone. */
      var wdef = (typeof CFG !== 'undefined' && CFG.WEAPONS && CFG.WEAPONS[n]) || null;
      m.userData.wname = n;
      m.userData.wtype = wdef ? wdef.type : 'auto';

      /* Both hands are placed from this weapon's measured length: the trigger
         hand just behind the receiver, the support hand two thirds of the way
         out along the barrel — which is where a person actually holds one. */
      if (n === 'bow' || n === 'drone' || n === 'knife' || n === 'emp' || n === 'c4') return;
      var muz = m.userData.muzzleZ, mid = m.userData.muzzleY;
      hand(m, 0.005, mid - 0.10, Math.min(-0.02, muz * 0.18), 0, 1);             // trigger hand
      hand(m, -0.010, mid - 0.085, Math.max(muz + 0.14, muz * 0.62), 0.22, -1);  // support hand
    });
    /* ===== v2.16 - ONE MESH PER FINISH =====
       A weapon was a Mesh per part: twelve for an AK, twenty with its hands —
       twenty draw calls for one object, every frame, and the new hands and
       furniture would have made it sixty. After everything is fitted and
       measured, the parts that never move are folded together by material:
       an AK in the hand is now about ten draws. What MOVES is left alone —
       the magazine (reload), a pump, a slide — and so is anything fitted
       later (attachments carry userData.att and are added after this).
       Headless (the model gates) geometry has no attributes and nothing is
       folded, so every gate still sees the parts it measures. */
    function bake(m, inner) {
      if (!m.updateMatrixWorld || !THREE.BufferGeometry || !THREE.Matrix3 || !THREE.Matrix4 || !THREE.BufferAttribute) return;
      var keep = inner ? [] : [m.userData.mag, m.userData.pump, m.userData.slide], sets = {}, order = [], gone = [];
      /* a moving group (magazine, pump, slide) is folded too, in ITS OWN
         space: it still moves as one piece, and a five-rib slide is one draw */
      if (!inner) keep.forEach(function (kp) { if (kp && kp.children && kp.children.length > 1) bake(kp, true); });
      m.updateMatrixWorld(true);
      var inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
      if (!inv.invert) return;
      inv.copy(m.matrixWorld).invert();
      (function walk(o) {
        for (var i = 0; i < o.children.length; i++) {
          var c = o.children[i];
          if (keep.indexOf(c) >= 0) continue;
          var a = c.geometry && c.geometry.attributes;
          if (c.isMesh && a && a.position && a.normal && a.uv && c.material && c.material.uuid && !c.children.length) {
            if (!sets[c.material.uuid]) { sets[c.material.uuid] = { mat: c.material, list: [] }; order.push(c.material.uuid); }
            sets[c.material.uuid].list.push(c); gone.push(c);
          } else if (c.children && c.children.length) walk(c);
        }
      })(m);
      if (gone.length < 2) return;
      var v = new THREE.Vector3(), nm = new THREE.Matrix3();
      order.forEach(function (id) {
        var S = sets[id], P = [], N = [], U = [], I = [], base = 0;
        S.list.forEach(function (c) {
          var g = c.geometry, p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, k;
          rel.multiplyMatrices(inv, c.matrixWorld);
          nm.getNormalMatrix(rel);
          for (k = 0; k < p.count; k++) {
            v.fromBufferAttribute(p, k).applyMatrix4(rel); P.push(v.x, v.y, v.z);
            v.fromBufferAttribute(n, k).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
            U.push(u.getX(k), u.getY(k));
          }
          if (g.index) for (k = 0; k < g.index.count; k++) I.push(g.index.getX(k) + base);
          else for (k = 0; k < p.count; k++) I.push(base + k);
          base += p.count;
        });
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2));
        geo.setIndex(new THREE.BufferAttribute(new (base > 65535 ? Uint32Array : Uint16Array)(I), 1));
        var one = new THREE.Mesh(geo, S.mat);
        one.userData.baked = S.list.length;
        m.add(one);
      });
      gone.forEach(function (c) { if (c.parent) c.parent.remove(c); if (c.geometry.dispose) c.geometry.dispose(); });
      for (var q = m.children.length - 1; q >= 0; q--) { var e = m.children[q]; if (!e.isMesh && keep.indexOf(e) < 0 && e.children && !e.children.length) m.remove(e); }   // the emptied hand groups
    }
    Object.keys(models).forEach(function (n) { try { bake(models[n]); } catch (err) { /* it stays as separate parts, which is how it has always drawn */ } });
    /* (v2.16: the v14 alias()/dup()/stubCopy() helpers were deleted here — every
       weapon has had a model of its own since v1.0x and nothing called them.) */
    /* assignments stay spelled out — verify-models proves per-weapon
       viewmodels by reading THIS source for `models.<id> =`. */


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

    /* v10 — ONLY A FIREARM WEARS FIREARM PARTS.
       auto / bolt / semi have a barrel and a magazine well. melee, bow, drone
       and rocket have neither, and every part below anchors to a measured
       muzzleZ that, on those four, is not a muzzle at all. Read from the type
       rather than a name list so a weapon added later is covered by declaring
       its type, which weapons.config.js already requires. */
    var wt = g.userData.wtype;
    var isGun = (wt === 'auto' || wt === 'bolt' || wt === 'semi');
    if (!isGun) return;

    /* SIGHT: NOT MODELLED. Deliberately.
       v9.5 fitted a physical optic to answer "the red dot doesn't affect
       anything on the gun". It did affect it — and that turned out to be the
       problem: a tube and riser sitting at eye level in front of the receiver
       occludes the centre of the screen, which is precisely where you are
       looking when you aim. Rahul: "remove the scope design from the guns it
       ruining the view, keep it as before."

       Correct call, and worth recording why: on a first-person viewmodel the
       weapon occupies the lower-right of the frame and anything mounted ON TOP
       of it grows into the sight line. A rifle's own iron sights are modelled
       low and thin for the same reason.

       The sight's MECHANICAL effect is untouched — eff() still applies
       spreadMult and adsFov, the HUD still shows the attachment, and picking one
       up still changes how the gun shoots. Only the mesh is gone.

       If a visible optic is ever wanted again, it belongs BELOW the barrel line
       or as a change to the reticle rather than as geometry in front of the
       camera. */

    /* MUZZLE. A suppressor is long and fat; a compensator is short and ported.
       Both read instantly from the corner of the eye, which is the point. */
    var muName = atts.muzzle, muDef = muName && A[muName];
    if (muDef) {
      var supp = !!muDef.quiet;
      var can = new THREE.Mesh(
        new THREE.CylinderGeometry(supp ? 0.032 : 0.028, supp ? 0.032 : 0.03,
          supp ? 0.20 : 0.08, 10), mat(supp ? 0x1c2024 : 0x3a4149));
      /* Anchored to THIS gun's measured muzzle, not to a constant. The can
         sits just beyond the barrel end and the ports just behind it, so a
         short SMG and a long bolt rifle both look like the part was fitted
         rather than floated. */
      var mz = (g.userData.muzzleZ !== undefined ? g.userData.muzzleZ : -0.70);
      var my = (g.userData.muzzleY !== undefined ? g.userData.muzzleY : 0.005);
      can.rotation.x = Math.PI / 2;
      can.position.set(0, my, mz - (supp ? 0.10 : 0.04));
      can.userData.att = true; g.add(can);
      if (!supp) {
        var port = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.05), mat(0x2a3037));
        port.position.set(0, my + 0.023, mz + 0.02); port.userData.att = true; g.add(port);
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

  return { build: build, dress: dress, setDress: setDress, _fin: FIN, _dress: DRESS };
})();
