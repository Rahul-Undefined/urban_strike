/* VEHICLES — v2.13. The client half of server/lib/vehicles.js.

   Rahul: "vehicles PUBG style mei road pe khade rahenge, usko lekar drive kar
   sakte hai." Urban only: motorbike, auto rickshaw, sedan, city bus, tank.

   WHAT THIS FILE DOES
     models   five vehicles built from boxes and cylinders, each MERGED to one
              mesh per material (5-7 draw calls a vehicle, not 60).
     driving  the driver's client simulates its own vehicle against the world
              (World.fits for the hull, World.rayHit for the ground) and
              reports the pose 20 times a second — the same division of labour
              as walking in this game. Everyone else sees it through the
              snapshot, interpolated.
     riding   a seated player is carried at the seat; their avatar is hidden
              and a seated figure is shown at the wheel instead.
     camera   a chase camera on the mouse, pulled in when a wall is behind it.
     damage   a local shot whose ray meets a hull before it meets a wall is
              reported ('vehHit'); a driver who runs into a player reports the
              ram ('vehRam'). The server decides what each is worth.

   Frames: a vehicle's facing is `ry` with forward = (sin ry, -cos ry) — the
   same convention as a player's. Models are built nose toward -Z. */
var Vehicles = (function () {
  var V = (typeof CFG !== 'undefined' && CFG.VEHICLES) || null;
  var TYPES = V ? Object.keys(V.types) : [];
  var scene = null;
  var list = {};
  var mine = null;
  var mySeat = -1;
  var mountedAt = 0;
  var riders = {};
  var lastRy = 0;
  var mats = null;
  var sendAt = 0;
  var ramAt = {};
  var hudEl = null;
  var promptEl = null;
  var nearest = null;
  var useAt = 0;
  var hornAt = 0;
  var dryToldAt = 0;
  var puffs = [];
  /* a rider's position is reported so that the head of their hit box sits where
     the seated figure's head is drawn (figure head: seat + 1.02; hit box head:
     centre + 0.81) */
  var SEAT_UP = 0.22;

  /* ------------------------------------------------------------ models */
  function lam(color) { return new THREE.MeshLambertMaterial({ color: color }); }
  function M() {
    if (mats) return mats;
    mats = { glass: lam(0x16222e), tyre: lam(0x141414), rim: lam(0x8d939a), trim: lam(0x23272c), chrome: lam(0x8b949c),
             seat: lam(0x3a2f28), olive: lam(0x4d5a37), oliveD: lam(0x38422a), track: lam(0x1b1b19),
             yellow: lam(0xe2b21f), green: lam(0x1f7a46), white: lam(0xe8e6e0), figure: lam(0x2c3038), skin: lam(0xb98a64),
             beam: new THREE.MeshBasicMaterial({ color: 0xfff0c2, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
             smoke: new THREE.MeshBasicMaterial({ color: 0x1d1d1f, transparent: true, opacity: 0.55, depthWrite: false }),
             flame: new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
             head: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), tail: new THREE.MeshBasicMaterial({ color: 0xd22a22 }),
             amber: new THREE.MeshBasicMaterial({ color: 0xffb84a }), paint: {} };
    return mats;
  }
  function paintOf(color) { var mm = M(); return mm.paint[color] || (mm.paint[color] = lam(color)); }
  function Kit() { this.parts = []; }
  Kit.prototype.box = function (mat, wid, hgt, dep, px, py, pz, rotX) {
    this.parts.push({ mat: mat, geo: new THREE.BoxGeometry(wid, hgt, dep), x: px, y: py, z: pz, rx: rotX || 0, rz: 0 });
    return this;
  };
  /* a side silhouette, [metres along the body (nose is negative), height] going
     round once, extruded across the width — a bonnet that slopes and a
     windscreen that leans cost one shape instead of a dozen boxes. A point may
     be ['arc', centreZ, centreY, radius] for a wheel arch cut into the sill. */
  Kit.prototype.profile = function (mat, pts, wid, cx) {
    var shape = new THREE.Shape();
    for (var k = 0; k < pts.length; k++) {
      var pt = pts[k];
      if (pt[0] === 'arc') { shape.lineTo(pt[1] + pt[3], pt[2]); shape.absarc(pt[1], pt[2], pt[3], 0, Math.PI, false); }
      else if (k === 0) shape.moveTo(pt[0], pt[1]);
      else shape.lineTo(pt[0], pt[1]);
    }
    var geo = new THREE.ExtrudeGeometry(shape, { depth: wid, bevelEnabled: false, curveSegments: 8 });
    /* shape x -> vehicle z, shape depth -> vehicle -x: a quarter turn about y */
    this.parts.push({ mat: mat, geo: geo, x: (cx || 0) + wid / 2, y: 0, z: 0, rx: 0, ry: -Math.PI / 2, rz: 0 });
    return this;
  };
  /* axis: 'x' an axle, 'z' a barrel or pipe, 'y' upright */
  Kit.prototype.cyl = function (mat, radius, len, px, py, pz, axis, seg) {
    this.parts.push({ mat: mat, geo: new THREE.CylinderGeometry(radius, radius, len, seg || 14), x: px, y: py, z: pz,
                      rx: axis === 'z' ? Math.PI / 2 : 0, rz: axis === 'x' ? Math.PI / 2 : 0 });
    return this;
  };
  /* a headlight beam: a cone of light from the lamp, opening toward the nose,
     and its pool on the road */
  Kit.prototype.beam = function (px, py, pz, len, spread) {
    this.parts.push({ mat: M().beam, geo: new THREE.ConeGeometry(spread, len, 18, 1, true), x: px, y: py - 0.25, z: pz - len / 2, rx: Math.PI / 2, rz: 0 });
    var pool = new THREE.CircleGeometry(spread * 1.05, 26);
    pool.scale(1, 2.1, 1);                                   // a long oval thrown down the road, not a disc
    this.parts.push({ mat: M().beam, geo: pool, x: px, y: 0.07, z: pz - len * 0.62, rx: -Math.PI / 2, rz: 0 });
    return this;
  };
  Kit.prototype.wheel = function (px, pz, radius, wid) {
    this.cyl(M().tyre, radius, wid, px, radius, pz, 'x', 16);
    this.cyl(M().rim, radius * 0.5, wid + 0.03, px, radius, pz, 'x', 10);
    this.cyl(M().trim, radius * 0.16, wid + 0.05, px, radius, pz, 'x', 6);
    return this;
  };
  Kit.prototype.merge = function () {
    var keys = [];
    var bins = [];
    this.parts.forEach(function (part) {
      var geo = part.geo.index ? part.geo.toNonIndexed() : part.geo;
      var mtx = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(part.rx, part.ry || 0, part.rz));
      mtx.setPosition(part.x, part.y, part.z);
      if (geo.applyMatrix4) geo.applyMatrix4(mtx); else geo.applyMatrix(mtx);
      var slot = keys.indexOf(part.mat);
      if (slot < 0) { slot = keys.length; keys.push(part.mat); bins.push({ pos: [], nrm: [] }); }
      var posArr = geo.attributes.position.array;
      var nrmArr = geo.attributes.normal.array;
      var bin = bins[slot];
      for (var k = 0; k < posArr.length; k++) { bin.pos.push(posArr[k]); bin.nrm.push(nrmArr[k]); }
      if (geo !== part.geo && geo.dispose) geo.dispose();
      if (part.geo.dispose) part.geo.dispose();
    });
    var group = new THREE.Group();
    keys.forEach(function (mat, slot) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bins[slot].pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(bins[slot].nrm, 3));
      var mesh = new THREE.Mesh(geo, mat);
      if (mat === M().beam) { mesh.visible = false; mesh.renderOrder = 3; group.userData.beams = mesh; }
      else mesh.castShadow = true;
      group.add(mesh);
    });
    return group;
  };

  function buildCar(kit, paint) {
    var mm = M();
    /* lower body: bumper to beltline, wheel arches cut into the sill */
    kit.profile(paint, [[2.2, 0.36], ['arc', 1.4, 0.36, 0.44], ['arc', -1.4, 0.36, 0.44], [-2.2, 0.36], [-2.2, 0.7], [-2.12, 0.86],
                        [-0.98, 0.99], [1.58, 1.0], [2.14, 0.95], [2.2, 0.7]], 1.86, 0);
    /* glasshouse: one block of glass with a leaning windscreen and rear screen... */
    kit.profile(mm.glass, [[1.62, 0.99], [-1.0, 0.98], [-0.36, 1.43], [0.96, 1.43]], 1.6, 0);
    /* ...under a painted roof, between painted pillars */
    kit.box(paint, 1.64, 0.07, 1.4, 0, 1.455, 0.3);
    kit.box(paint, 0.06, 0.78, 0.07, 0.8, 1.2, -0.68, 0.948).box(paint, 0.06, 0.78, 0.07, -0.8, 1.2, -0.68, 0.948);    // A pillars
    kit.box(paint, 0.06, 0.8, 0.09, 0.8, 1.2, 1.29, -0.972).box(paint, 0.06, 0.8, 0.09, -0.8, 1.2, 1.29, -0.972);      // C pillars
    kit.box(paint, 0.06, 0.46, 0.1, 0.8, 1.21, 0.24).box(paint, 0.06, 0.46, 0.1, -0.8, 1.21, 0.24);                    // B pillars
    kit.box(mm.trim, 1.62, 0.03, 0.04, 0, 0.995, -0.99);                                                                 // scuttle
    kit.box(mm.trim, 1.92, 0.22, 0.14, 0, 0.47, -2.2).box(mm.trim, 1.92, 0.22, 0.14, 0, 0.47, 2.2);                     // bumpers
    kit.box(mm.trim, 1.0, 0.16, 0.04, 0, 0.72, -2.2);                                                                    // grille
    kit.box(mm.head, 0.36, 0.14, 0.05, 0.68, 0.74, -2.2).box(mm.head, 0.36, 0.14, 0.05, -0.68, 0.74, -2.2);
    kit.box(mm.tail, 0.4, 0.13, 0.05, 0.66, 0.78, 2.2).box(mm.tail, 0.4, 0.13, 0.05, -0.66, 0.78, 2.2);
    kit.box(mm.amber, 0.12, 0.1, 0.05, 0.9, 0.6, -2.2).box(mm.amber, 0.12, 0.1, 0.05, -0.9, 0.6, -2.2);                 // indicators
    kit.box(mm.white, 0.44, 0.11, 0.03, 0, 0.5, -2.28).box(mm.white, 0.44, 0.11, 0.03, 0, 0.56, 2.28);                  // plates
    kit.box(paint, 0.16, 0.1, 0.1, 1.0, 1.04, -0.78).box(paint, 0.16, 0.1, 0.1, -1.0, 1.04, -0.78);                     // mirrors
    kit.box(mm.trim, 0.03, 0.1, 2.3, 0.935, 0.42, 0).box(mm.trim, 0.03, 0.1, 2.3, -0.935, 0.42, 0);                     // sills
    kit.box(mm.trim, 0.012, 0.56, 0.02, 0.935, 0.72, 0.24).box(mm.trim, 0.012, 0.56, 0.02, -0.935, 0.72, 0.24);         // door shut lines
    kit.box(mm.trim, 0.012, 0.56, 0.02, 0.935, 0.72, -0.9).box(mm.trim, 0.012, 0.56, 0.02, -0.935, 0.72, -0.9);
    kit.box(mm.chrome, 0.02, 0.03, 0.14, 0.94, 0.86, -0.05).box(mm.chrome, 0.02, 0.03, 0.14, 0.94, 0.86, 0.72);          // handles
    kit.box(mm.chrome, 0.02, 0.03, 0.14, -0.94, 0.86, -0.05).box(mm.chrome, 0.02, 0.03, 0.14, -0.94, 0.86, 0.72);
    kit.cyl(mm.chrome, 0.045, 0.3, 0.55, 0.36, 2.2, 'z', 8);                                                             // exhaust
    kit.box(mm.trim, 1.5, 0.3, 3.6, 0, 0.33, 0);                                                                         // floor pan (so the arches are not see-through)
    kit.wheel(0.84, -1.4, 0.36, 0.24).wheel(-0.84, -1.4, 0.36, 0.24).wheel(0.84, 1.4, 0.36, 0.24).wheel(-0.84, 1.4, 0.36, 0.24);
  }
  function buildBike(kit, paint) {
    var mm = M();
    kit.cyl(mm.tyre, 0.34, 0.14, 0, 0.34, -0.74, 'x', 18).cyl(mm.rim, 0.2, 0.16, 0, 0.34, -0.74, 'x', 10);
    kit.cyl(mm.tyre, 0.34, 0.16, 0, 0.34, 0.74, 'x', 18).cyl(mm.rim, 0.2, 0.18, 0, 0.34, 0.74, 'x', 10);
    kit.box(mm.trim, 0.1, 0.1, 1.3, 0, 0.52, 0);                        // frame
    kit.box(mm.chrome, 0.3, 0.3, 0.42, 0, 0.5, 0.02);                   // engine
    kit.box(paint, 0.34, 0.26, 0.56, 0, 0.84, -0.22);                   // tank
    kit.box(mm.seat, 0.3, 0.1, 0.72, 0, 0.82, 0.42);                    // seat
    kit.box(paint, 0.16, 0.05, 0.5, 0, 0.72, -0.74).box(paint, 0.18, 0.05, 0.5, 0, 0.74, 0.76);         // mudguards
    kit.box(mm.chrome, 0.07, 0.78, 0.07, 0.1, 0.7, -0.8, 0.42).box(mm.chrome, 0.07, 0.78, 0.07, -0.1, 0.7, -0.8, 0.42);   // forks
    kit.box(mm.trim, 0.72, 0.05, 0.05, 0, 1.08, -0.62);                 // bars
    kit.box(mm.trim, 0.08, 0.08, 0.05, 0.32, 1.16, -0.6).box(mm.trim, 0.08, 0.08, 0.05, -0.32, 1.16, -0.6);
    kit.box(mm.head, 0.2, 0.2, 0.08, 0, 0.94, -0.88);
    kit.box(mm.tail, 0.14, 0.08, 0.05, 0, 0.8, 0.98);
    kit.cyl(mm.chrome, 0.06, 0.95, 0.2, 0.4, 0.5, 'z', 8);              // exhaust
    kit.box(mm.white, 0.2, 0.1, 0.02, 0, 0.6, 1.0);
  }
  function buildAuto(kit) {
    var mm = M();
    kit.cyl(mm.tyre, 0.26, 0.14, 0, 0.26, -1.05, 'x', 14).cyl(mm.rim, 0.14, 0.16, 0, 0.26, -1.05, 'x', 8);
    kit.wheel(0.6, 0.85, 0.26, 0.16).wheel(-0.6, 0.85, 0.26, 0.16);
    kit.box(mm.green, 1.4, 0.55, 1.65, 0, 0.6, 0.55);                   // rear tub
    kit.box(mm.green, 0.9, 0.5, 0.9, 0, 0.56, -0.74);                   // nose
    kit.box(mm.yellow, 0.82, 0.1, 0.72, 0, 0.86, -0.8);                 // nose cap
    kit.box(mm.glass, 1.18, 0.74, 0.05, 0, 1.28, -0.5, -0.24);          // windscreen
    kit.box(mm.yellow, 1.44, 0.1, 2.05, 0, 1.76, 0.25);                 // canopy
    kit.box(mm.yellow, 1.4, 0.9, 0.06, 0, 1.28, 1.36);                  // back panel
    kit.box(mm.glass, 0.8, 0.34, 0.07, 0, 1.42, 1.37);
    kit.box(mm.trim, 0.06, 0.95, 0.06, 0.67, 1.26, -0.34).box(mm.trim, 0.06, 0.95, 0.06, -0.67, 1.26, -0.34);
    kit.box(mm.seat, 1.2, 0.12, 0.5, 0, 0.92, 0.95).box(mm.seat, 1.2, 0.5, 0.1, 0, 1.16, 1.26);          // bench
    kit.box(mm.seat, 0.5, 0.1, 0.4, 0, 0.9, -0.1);                      // driver's seat
    kit.box(mm.trim, 0.6, 0.05, 0.05, 0, 1.05, -0.5);                   // bars
    kit.box(mm.head, 0.2, 0.16, 0.05, 0, 0.7, -1.2);
    kit.box(mm.tail, 0.16, 0.1, 0.05, 0.55, 0.72, 1.39).box(mm.tail, 0.16, 0.1, 0.05, -0.55, 0.72, 1.39);
    kit.box(mm.trim, 1.44, 0.08, 0.1, 0, 0.36, 1.38);
    kit.box(mm.white, 0.36, 0.1, 0.02, 0, 0.5, 1.41);
  }
  function buildBus(kit, paint) {
    var mm = M();
    /* body with a raked nose and wheel arches, as one silhouette */
    kit.profile(paint, [[5.2, 0.62], ['arc', 3.45, 0.62, 0.62], ['arc', -3.4, 0.62, 0.62], [-5.05, 0.62], [-5.25, 0.9], [-5.25, 1.45], [-4.95, 2.72],
                        [-4.6, 2.86], [5.05, 2.86], [5.2, 2.6]], 2.56, 0);
    kit.box(mm.white, 2.5, 0.1, 9.6, 0, 2.9, 0.2);                       // roof skin
    kit.box(mm.white, 1.4, 0.24, 2.2, 0, 3.02, 1.5);                     // AC unit
    kit.box(mm.white, 2.6, 0.13, 10.1, 0, 1.48, 0.02);                   // waist stripe
    /* window band both sides: glass, then posts over it */
    kit.box(mm.glass, 2.6, 0.82, 8.9, 0, 2.14, 0.35);
    for (var win = -4; win <= 4; win++) kit.box(paint, 2.62, 0.84, 0.11, 0, 2.14, win * 1.0 + 0.35);
    kit.box(mm.glass, 2.3, 1.22, 0.05, 0, 2.06, -5.11, 0.232);           // windscreen, raked with the nose
    kit.box(mm.glass, 1.8, 0.7, 0.05, 0, 2.2, 5.14, -0.09);
    kit.box(mm.amber, 1.5, 0.2, 0.05, 0, 2.7, -4.99, 0.232);             // destination board
    kit.box(mm.trim, 0.04, 1.9, 0.95, -1.3, 1.6, -3.95).box(mm.trim, 0.04, 1.9, 0.95, -1.3, 1.6, 1.2);   // doors (kerb side)
    kit.box(mm.glass, 0.05, 0.9, 0.7, -1.3, 2.0, -3.95).box(mm.glass, 0.05, 0.9, 0.7, -1.3, 2.0, 1.2);
    kit.box(mm.trim, 2.62, 0.3, 0.16, 0, 0.74, -5.26).box(mm.trim, 2.62, 0.3, 0.16, 0, 0.74, 5.2);       // bumpers
    kit.box(mm.head, 0.36, 0.2, 0.05, 0.9, 1.05, -5.27).box(mm.head, 0.36, 0.2, 0.05, -0.9, 1.05, -5.27);
    kit.box(mm.tail, 0.3, 0.24, 0.05, 0.95, 1.1, 5.21).box(mm.tail, 0.3, 0.24, 0.05, -0.95, 1.1, 5.21);
    kit.box(mm.trim, 0.2, 0.34, 0.1, 1.46, 2.25, -5.0).box(mm.trim, 0.2, 0.34, 0.1, -1.46, 2.25, -5.0);  // mirrors
    kit.box(mm.white, 0.5, 0.13, 0.03, 0, 0.78, -5.35);
    kit.box(mm.trim, 2.2, 0.4, 9.4, 0, 0.6, 0);                          // floor pan
    kit.wheel(1.13, -3.4, 0.52, 0.3).wheel(-1.13, -3.4, 0.52, 0.3);
    kit.wheel(1.13, 3.45, 0.52, 0.3).wheel(-1.13, 3.45, 0.52, 0.3).wheel(1.13, 3.12, 0.52, 0.12).wheel(-1.13, 3.12, 0.52, 0.12);
  }
  function buildTank(kit) {
    var mm = M();
    kit.box(mm.track, 0.62, 0.9, 6.2, 1.39, 0.45, 0).box(mm.track, 0.62, 0.9, 6.2, -1.39, 0.45, 0);     // tracks
    for (var wz = -2.4; wz <= 2.41; wz += 0.96) {
      kit.cyl(mm.oliveD, 0.36, 0.68, 1.39, 0.4, wz, 'x', 12).cyl(mm.oliveD, 0.36, 0.68, -1.39, 0.4, wz, 'x', 12);
    }
    kit.box(mm.olive, 2.2, 0.8, 5.9, 0, 1.0, 0);                        // hull
    kit.box(mm.olive, 3.4, 0.1, 6.0, 0, 0.96, 0.05);                    // track guards
    kit.box(mm.olive, 2.2, 0.52, 1.3, 0, 1.22, -2.62, 0.52);            // glacis
    kit.box(mm.oliveD, 2.0, 0.3, 1.5, 0, 1.5, 2.1);                     // engine deck
    kit.box(mm.trim, 0.5, 0.04, 1.1, 0.5, 1.67, 2.1).box(mm.trim, 0.5, 0.04, 1.1, -0.5, 1.67, 2.1);     // grilles
    kit.box(mm.olive, 2.0, 0.7, 2.5, 0, 1.78, 0.1);                     // turret
    kit.box(mm.olive, 1.6, 0.56, 0.7, 0, 1.76, -1.4, 0.35);             // turret nose
    kit.box(mm.oliveD, 0.9, 0.5, 0.6, 0, 1.8, 1.55);                    // bustle
    kit.cyl(mm.oliveD, 0.11, 3.7, 0, 1.84, -3.3, 'z', 12);              // gun
    kit.cyl(mm.trim, 0.17, 0.36, 0, 1.84, -5.0, 'z', 12);               // muzzle brake
    kit.cyl(mm.oliveD, 0.2, 0.5, 0, 1.84, -1.85, 'z', 10);              // mantlet
    kit.cyl(mm.oliveD, 0.36, 0.12, 0.5, 2.19, 0.45, 'y', 14);           // commander's hatch
    kit.cyl(mm.oliveD, 0.3, 0.1, -0.5, 2.18, -0.2, 'y', 14);
    kit.box(mm.trim, 0.08, 0.14, 0.7, 0.5, 2.36, 0.2);                  // roof MG
    kit.cyl(mm.trim, 0.015, 1.6, -0.8, 2.9, 1.1, 'y', 6);               // aerial
    kit.box(mm.head, 0.2, 0.14, 0.05, 0.85, 1.2, -3.05).box(mm.head, 0.2, 0.14, 0.05, -0.85, 1.2, -3.05);
    kit.box(mm.tail, 0.2, 0.1, 0.05, 0.9, 1.2, 2.98).box(mm.tail, 0.2, 0.1, 0.05, -0.9, 1.2, 2.98);
    kit.cyl(mm.trim, 0.09, 0.5, 0.95, 1.5, 2.95, 'z', 8).cyl(mm.trim, 0.09, 0.5, -0.95, 1.5, 2.95, 'z', 8);   // exhausts
  }
  function buildModel(type, color) {
    var kit = new Kit();
    var paint = paintOf(color);
    if (type === 'car') buildCar(kit, paint);
    else if (type === 'bike') buildBike(kit, paint);
    else if (type === 'auto') buildAuto(kit);
    else if (type === 'bus') buildBus(kit, paint);
    else buildTank(kit);
    var lamps = { car: [[0.68, 0.74, -2.2], [-0.68, 0.74, -2.2]], bike: [[0, 0.94, -0.92]], auto: [[0, 0.7, -1.22]],
                  bus: [[0.9, 1.05, -5.27], [-0.9, 1.05, -5.27]], tank: [[0.85, 1.2, -3.05], [-0.85, 1.2, -3.05]] }[type] || [];
    for (var lk = 0; lk < lamps.length; lk++) kit.beam(lamps[lk][0], lamps[lk][1], lamps[lk][2], type === 'bike' || type === 'auto' ? 9 : 12, type === 'bike' ? 1.5 : 1.9);
    var group = kit.merge();
    group.rotation.order = 'YXZ';   // heading, then pitch and roll in the vehicle's own frame
    /* a seated figure per seat — shown only while that seat is taken (the rider's
       own avatar is hidden: a standing rig would poke through the roof) */
    var spec = V.types[type];
    group.userData.figures = [];
    if (!spec.sealed) {
      for (var seat = 0; seat < spec.seatsAt.length; seat++) {
        var fig = new Kit();
        var off = spec.seatsAt[seat];
        fig.box(M().figure, 0.44, 0.5, 0.26, off[0], spec.seatY + 0.6, -off[1]);              // torso
        fig.box(M().skin, 0.23, 0.24, 0.23, off[0], spec.seatY + 0.99, -off[1]);              // head
        if (!spec.sill) fig.box(M().figure, 0.25, 0.09, 0.25, off[0], spec.seatY + 1.15, -off[1]);   // helmet/cap on the open ones
        fig.box(M().figure, 0.4, 0.14, 0.42, off[0], spec.seatY + 0.36, -off[1] - 0.2);       // thighs
        if (seat === 0) { fig.box(M().figure, 0.1, 0.1, 0.4, off[0] - 0.2, spec.seatY + 0.72, -off[1] - 0.26); fig.box(M().figure, 0.1, 0.1, 0.4, off[0] + 0.2, spec.seatY + 0.72, -off[1] - 0.26); }   // arms to the wheel
        var figure = fig.merge();
        figure.visible = false;
        group.add(figure);
        group.userData.figures.push(figure);
      }
    }
    return group;
  }

  /* ------------------------------------------------------------ state */
  function init(sceneRef) {
    reset();
    scene = sceneRef;
  }
  function drop(veh) {
    if (!veh) return;
    if (veh.group) {
      if (veh.group.parent) veh.group.parent.remove(veh.group);
      veh.group.traverse(function (obj) { if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose(); });
    }
    if (mine === veh) unmount();
    delete list[veh.id];
  }
  function reset() {
    for (var id in list) drop(list[id]);
    list = {};
    mine = null;
    mySeat = -1;
    nearest = null;
    riders = {};
    for (var pk = 0; pk < puffs.length; pk++) if (puffs[pk].mesh.parent) puffs[pk].mesh.parent.remove(puffs[pk].mesh);
    puffs = [];
    engine(false, 0, 1);
    showHud(false);
    showPrompt(null);
  }
  function ensure(id, typeIdx) {
    var veh = list[id];
    if (veh) return veh;
    var type = TYPES[typeIdx] || 'car';
    var spec = V.types[type];
    var pal = (spec.paints && spec.paints.length) ? spec.paints : V.paints;
    var group = buildModel(type, pal[id % pal.length]);
    if (scene) scene.add(group);
    veh = list[id] = { id: id, type: type, T: spec, group: group, x: 0, y: 0, z: 0, ry: 0, sp: 0, hp: spec.hp, seats: [],
                       tx: 0, ty: 0, tz: 0, tr: 0, fresh: true, fuel: 100, lit: 0, roll: 0, tilt: 0, pry: 0, psp: 0, puffAt: 0 };
    return veh;
  }
  /* the snapshot: { f: full?, v: [[id, type, x, y, z, ry, speed, hp]...], s: { id: seats } } */
  function sync(pkt) {
    if (!pkt || !V || !scene || !pkt.v) return;
    var seen = {};
    for (var i = 0; i < pkt.v.length; i++) {
      var row = pkt.v[i];
      var veh = ensure(row[0], row[1]);
      seen[row[0]] = 1;
      veh.hp = row[7];
      if (mine === veh && mySeat === 0) continue;             // I am driving it: my simulation is the truth
      if (row[8] !== undefined) veh.fuel = row[8];
      veh.lit = row[9] ? 1 : 0;
      veh.tx = row[2]; veh.ty = row[3]; veh.tz = row[4]; veh.tr = row[5]; veh.sp = row[6];
      if (veh.fresh) { veh.x = veh.tx; veh.y = veh.ty; veh.z = veh.tz; veh.ry = veh.tr; veh.fresh = false; place(veh); }
    }
    if (pkt.f) {
      for (var id in list) {
        if (!seen[id]) { drop(list[id]); continue; }
        list[id].seats = (pkt.s && pkt.s[id]) || [];
      }
      reconcileSeat();
    }
  }
  function myId() { return (typeof Net !== 'undefined' && Net.getMyId) ? Net.getMyId() : null; }
  function reconcileSeat() {
    var me = myId();
    if (!mine || !me) return;
    if (performance.now() - mountedAt < 1200) return;         // the seat message may still be in flight
    if (mine.seats.indexOf(me) < 0) unmount();
  }
  function onSeat(msg) {
    var veh = msg && list[msg.id];
    if (!veh) return;
    veh.seats = msg.seats || [];
    var me = myId();
    var at = me ? veh.seats.indexOf(me) : -1;
    if (at >= 0) { if (mine !== veh) mount(veh, at); else mySeat = at; }
    else if (mine === veh && performance.now() - mountedAt > 400) unmount();
  }
  function onBoom(msg) {
    var veh = msg && list[msg.id];
    try {
      if (msg && msg.p) {
        var at = new THREE.Vector3(msg.p[0], msg.p[1] + 1, msg.p[2]);
        if (typeof FX !== 'undefined') {
          if (FX.explosion) FX.explosion(at, 7);
          if (FX.groundFire) FX.groundFire(new THREE.Vector3(msg.p[0], msg.p[1] + 0.1, msg.p[2]), 2.6, 7);   // the wreck burns for a while
        }
        if (typeof AudioSys !== 'undefined' && AudioSys.explosion) AudioSys.explosion(at, true);
      }
    } catch (err) { /* the effect is cosmetic */ }
    if (veh) drop(veh);
  }
  /* somebody's horn (mine was already played when I pressed the key) */
  function onHorn(msg) {
    var veh = msg && list[msg.id];
    if (!veh || msg.by === myId()) return;
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleHorn) AudioSys.vehicleHorn(new THREE.Vector3(veh.x, veh.y + 1, veh.z), veh.type); } catch (err) { /* cosmetic */ }
  }
  function horn() {
    if (!mine || mySeat !== 0) return;
    var nowT = performance.now();
    if (nowT - hornAt < 450) return;
    hornAt = nowT;
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleHorn) AudioSys.vehicleHorn(null, mine.type); } catch (err) { /* cosmetic */ }
    if (typeof Net !== 'undefined' && Net.emitVeh) Net.emitVeh('vehHorn', {});
  }
  function lights() {
    if (!mine || mySeat !== 0) return;
    mine.lit = mine.lit ? 0 : 1;
    sendAt = 0;                                   // tell the room on the next frame
    if (typeof AudioSys !== 'undefined' && AudioSys.uiClick) AudioSys.uiClick();
  }

  /* ------------------------------------------------------------ geometry */
  function wrap(ang) { while (ang > Math.PI) ang -= 6.283185307; while (ang < -Math.PI) ang += 6.283185307; return ang; }
  function place(veh) {
    /* the height you SEE eases over a kerb; the height that collides is exact */
    veh.yv = (veh.yv === undefined || Math.abs(veh.y - veh.yv) > 1.5) ? veh.y : veh.yv + (veh.y - veh.yv) * 0.3;
    veh.group.position.set(veh.x, veh.yv, veh.z);
    veh.group.rotation.y = -veh.ry;
    veh.group.rotation.z = veh.roll || 0;
    veh.group.rotation.x = veh.tilt || 0;
  }
  /* the body leans: a bike into the turn, everything else away from it; the nose
     lifts under power and dips on the brakes. Looks only — never collision. */
  function lean(veh, yawRate, accel, dt) {
    var bikeK = veh.type === 'bike' ? -0.19 : 0.012;
    var wantRoll = Math.max(-0.5, Math.min(0.5, yawRate * Math.abs(veh.sp) * bikeK * (veh.type === 'bike' ? 0.09 : 1)));
    if (veh.type !== 'bike') wantRoll = Math.max(-0.07, Math.min(0.07, wantRoll));
    var wantTilt = veh.type === 'bike' ? 0 : Math.max(-0.035, Math.min(0.035, accel * 0.0022));
    var kk = Math.min(1, dt * 7);
    veh.roll += (wantRoll - veh.roll) * kk;
    veh.tilt += (wantTilt - veh.tilt) * kk;
  }
  /* a hull that has taken a beating smokes, then burns — the warning to get out */
  function smoke(veh, nowT) {
    var frac = veh.hp / veh.T.hp;
    if (frac >= V.smokeAt || nowT < veh.puffAt || !scene) return;
    var burning = frac < V.fireAt;
    veh.puffAt = nowT + (burning ? 90 : 190);
    if (puffs.length >= 40) return;
    if (!smoke.geo) smoke.geo = new THREE.SphereGeometry(0.34, 6, 5);
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    var fwd = veh.type === 'tank' ? -veh.T.len * 0.3 : veh.T.len * 0.32;      // the engine: up front, at the back on the tank
    var mesh = new THREE.Mesh(smoke.geo, (burning && Math.random() < 0.45) ? M().flame : M().smoke);
    mesh.position.set(veh.x + sn * fwd + (Math.random() - 0.5) * 0.5, veh.y + veh.T.hgt * 0.62, veh.z - cs * fwd + (Math.random() - 0.5) * 0.5);
    scene.add(mesh);
    puffs.push({ mesh: mesh, born: nowT, life: burning ? 900 : 1500, vy: 1.4 + Math.random() * 0.9, grow: 0.9 + Math.random() * 0.8 });
  }
  function agePuffs(dt, nowT) {
    for (var k = puffs.length - 1; k >= 0; k--) {
      var puff = puffs[k];
      var age = (nowT - puff.born) / puff.life;
      if (age >= 1) { scene.remove(puff.mesh); puffs.splice(k, 1); continue; }
      puff.mesh.position.y += puff.vy * dt;
      var sc = (0.5 + age * puff.grow * 2.2) * (age > 0.7 ? (1 - age) / 0.3 : 1);
      puff.mesh.scale.set(sc, sc, sc);
    }
  }
  function seatPos(veh, seat) {
    var off = veh.T.seatsAt[seat] || veh.T.seatsAt[0];
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    return { x: veh.x + cs * off[0] + sn * off[1], y: veh.y + veh.T.seatY, z: veh.z + sn * off[0] - cs * off[1] };
  }
  /* does the hull fit here? sampled along its length against the world and the other vehicles */
  /* the hull as a row of circles along its length (a capsule chain) */
  function samples(spec, px, pz, ry) {
    var sn = Math.sin(ry);
    var cs = Math.cos(ry);
    var count = Math.max(2, Math.ceil(spec.len / (spec.r * 1.6)));
    var half = spec.len / 2 - spec.r * 0.9;
    var out = [];
    for (var k = 0; k < count; k++) {
      var along = -half + (2 * half) * k / (count - 1);
      out.push(px + sn * along, pz - cs * along);
    }
    return out;
  }
  /* does the hull fit here? against the world (boxes from 0.5 m up, so a kerb is
     not a wall) and against every other vehicle, circle to circle */
  function hullFree(veh, px, py, pz, ry, worldOnly) {
    var spec = veh.T;
    var mineS = samples(spec, px, pz, ry);
    var lift = 0.5;
    var hh = (spec.hgt * 0.85 - lift) / 2;
    for (var k = 0; k < mineS.length; k += 2) if (!World.fits(mineS[k], py + lift + hh, mineS[k + 1], spec.r, hh, spec.r)) return false;
    if (worldOnly) return true;
    for (var id in list) {
      var other = list[id];
      if (other === veh || Math.abs(other.y - py) > 2.5) continue;
      var reach = (spec.len + other.T.len) / 2 + 1;
      if (Math.abs(other.x - px) > reach || Math.abs(other.z - pz) > reach) continue;
      var theirs = samples(other.T, other.x, other.z, other.ry);
      var rr = (spec.r + other.T.r) * 0.92;
      for (var a = 0; a < mineS.length; a += 2) for (var b = 0; b < theirs.length; b += 2) {
        var dx = mineS[a] - theirs[b];
        var dz = mineS[a + 1] - theirs[b + 1];
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
    return true;
  }
  var _from = null;
  var _down = null;
  function groundUnder(px, py, pz) {
    if (!_from) { _from = new THREE.Vector3(); _down = new THREE.Vector3(0, -1, 0); }
    _from.set(px, py + 1.3, pz);
    var hit = World.rayHit(_from, _down, 5);
    return hit && hit.point ? hit.point.y : null;
  }

  /* ------------------------------------------------------------ riding */
  function mounted() { return !!mine; }
  function mount(veh, seat) {
    mine = veh; mySeat = seat; mountedAt = performance.now(); lastRy = veh.ry;
    if (typeof PlayerCtl !== 'undefined') { PlayerCtl.yaw = veh.ry; PlayerCtl.pitch = -0.12; }
    if (typeof Weapons !== 'undefined' && Weapons.setTrigger) Weapons.setTrigger(false);
    if (seat === 0) veh.lit = 1;                  // the driver's lamps come on with the engine; L switches them
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleDoor) AudioSys.vehicleDoor(null); } catch (err) { /* cosmetic */ }
    showPrompt(null);
    showHud(true);
  }
  function unmount() {
    if (mine && mySeat === 0) { mine.lit = 0; mine.sp = 0; }
    mine = null; mySeat = -1;
    engine(false, 0, 1);
    showHud(false);
  }
  function exitSpot(veh) {
    var spec = veh.T;
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    var side = spec.wid / 2 + 0.85;
    var tries = [[side, 0], [-side, 0], [side, 1.2], [-side, 1.2], [side, -1.2], [-side, -1.2], [0, -(spec.len / 2 + 1.0)], [0, spec.len / 2 + 1.0]];
    for (var k = 0; k < tries.length; k++) {
      var px = veh.x + cs * tries[k][0] + sn * tries[k][1];
      var pz = veh.z + sn * tries[k][0] - cs * tries[k][1];
      var gy = groundUnder(px, veh.y, pz);
      if (gy === null || Math.abs(gy - veh.y) > 1.2) continue;
      if (World.fits(px, gy + CFG.PLAYER.standH / 2 + 0.08, pz, 0.36, CFG.PLAYER.standH / 2, 0.36)) return { x: px, y: gy, z: pz };
    }
    return null;
  }
  function use() {
    if (!V || typeof Net === 'undefined' || !Net.emitVeh) return;
    var nowT = performance.now();
    if (nowT - useAt < 350) return;
    useAt = nowT;
    if (mine) {
      if (Math.abs(mine.sp) > 6 && mySeat === 0) { if (typeof UI !== 'undefined') UI.toast('Slow down to get out'); return; }
      var spot = exitSpot(mine);
      if (!spot) { if (typeof UI !== 'undefined') UI.toast('No room to get out here'); return; }
      Net.emitVeh('vehExit', {});
      var pos = PlayerCtl.pos;
      pos.x = spot.x; pos.y = spot.y + CFG.PLAYER.standH / 2 + 0.02; pos.z = spot.z;
      unmount();
      return;
    }
    if (!nearest || !PlayerCtl.alive) return;
    var target = nearest;
    Net.emitVeh('vehEnter', { id: target.id }, function (res) {
      if (res && res.ok) { if (list[target.id]) mount(list[target.id], res.seat); }
      else if (res && res.err && typeof UI !== 'undefined') UI.toast(res.err);
    });
  }
  /* called INSTEAD of PlayerCtl.update while seated */
  function drive(dt, input) {
    var veh = mine;
    if (!veh) return;
    if (!PlayerCtl.alive) { unmount(); return; }
    if (mySeat === 0) {
      var spec = veh.T;
      var throttle = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
      var steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      /* petrol: burned by the throttle, a little by rolling; an empty tank is an
         engine that will not pull (the brakes still work) */
      if (veh.fuel > 0) {
        veh.fuel = Math.max(0, veh.fuel - spec.burn * (throttle !== 0 ? 1 : (Math.abs(veh.sp) > 0.5 ? V.idleBurn : 0.04)) * dt);
        if (veh.fuel <= 0 && typeof UI !== 'undefined') UI.toast('OUT OF PETROL');
      } else {
        if (throttle !== 0 && Math.sign(throttle) === Math.sign(veh.sp || throttle)) {
          if (performance.now() - dryToldAt > 4000) { dryToldAt = performance.now(); if (typeof UI !== 'undefined') UI.toast('No petrol \u2014 the engine is dead'); }
          throttle = 0;
        }
      }
      var spBefore = veh.sp;
      var ryBefore = veh.ry;
      if (throttle > 0) veh.sp += (veh.sp < 0 ? spec.brake : spec.accel) * dt;
      else if (throttle < 0) veh.sp -= (veh.sp > 0 ? spec.brake : spec.accel * 0.7) * dt;
      else veh.sp -= Math.sign(veh.sp) * Math.min(Math.abs(veh.sp), 3.2 * dt);
      if (input.jump) veh.sp -= Math.sign(veh.sp) * Math.min(Math.abs(veh.sp), spec.brake * 1.5 * dt);   // handbrake
      veh.sp = Math.max(-spec.rev, Math.min(spec.max, veh.sp));
      var grip = Math.min(1, Math.abs(veh.sp) / 5) * (veh.sp >= 0 ? 1 : -1);
      if (spec.pivot && Math.abs(veh.sp) < 1.2) grip = 0.7;                       // a tank turns on the spot
      /* somebody drove into it (two drivers, one gap): let it pull clear of other
         vehicles — the world is still solid */
      var wedged = !hullFree(veh, veh.x, veh.y, veh.z, veh.ry);
      var newRy = wrap(veh.ry + steer * spec.turn * grip * dt * (1 - 0.35 * Math.min(1, Math.abs(veh.sp) / spec.max)));
      if (newRy !== veh.ry && hullFree(veh, veh.x, veh.y, veh.z, newRy, wedged)) veh.ry = newRy;
      var sn = Math.sin(veh.ry);
      var cs = Math.cos(veh.ry);
      var stepLen = veh.sp * dt;
      var nx = veh.x + sn * stepLen;
      var nz = veh.z - cs * stepLen;
      var ext = (CFG.MAPS[World.builtMap] || {}).ext;
      if (ext) { nx = Math.max(ext.x0 + 2, Math.min(ext.x1 - 2, nx)); nz = Math.max(ext.z0 + 2, Math.min(ext.z1 - 2, nz)); }
      /* a move is the whole pose or nothing: where it would stand, at the HEIGHT
         it would stand there (up a kerb, down off a dock), must be free. Checking
         the ground after the move let a bike mount a kerb into the underside of
         a stair (verify-vehicles caught it). */
      var heightAt = function (px, pz) {
        var gy = groundUnder(px, veh.y, pz);
        if (gy === null) return veh.y;
        if (gy > veh.y + 0.5) return null;                                       // too high to mount: that is a wall
        return gy < veh.y ? Math.max(gy, veh.y - Math.max(0.15, 9 * dt)) : gy;   // down no faster than it falls
      };
      var attempt = function (px, pz) {
        var ny = heightAt(px, pz);
        if (ny === null || !hullFree(veh, px, ny, pz, veh.ry, wedged)) return false;
        veh.x = px; veh.z = pz; veh.y = ny;
        return true;
      };
      if (stepLen !== 0) {
        if (!attempt(nx, nz)) {
          var scrub = Math.max(0, 1 - 3.5 * dt);                                  // sliding along a wall bleeds speed, it does not stop dead
          if (attempt(nx, veh.z)) veh.sp *= scrub;
          else if (attempt(veh.x, nz)) veh.sp *= scrub;
          else veh.sp = -veh.sp * 0.22;                                           // square on: stop and bounce a little
        }
      } else attempt(veh.x, veh.z);                                               // parked on a slope or still falling: settle
      lean(veh, wrap(veh.ry - ryBefore) / Math.max(dt, 1e-3), (veh.sp - spBefore) / Math.max(dt, 1e-3), dt);
      place(veh);
      var nowT = performance.now();
      if (nowT - sendAt > 48) {
        sendAt = nowT;
        Net.emitVeh('veh', { id: veh.id, p: [veh.x, veh.y, veh.z], ry: veh.ry, sp: veh.sp, f: Math.round(veh.fuel * 10) / 10, l: veh.lit ? 1 : 0 });
      }
      rams(veh, nowT);
    }
    /* the camera turns with the vehicle; the mouse looks around on top of that */
    PlayerCtl.yaw = PlayerCtl.yaw + wrap(veh.ry - lastRy); lastRy = veh.ry;
    var at = seatPos(veh, mySeat);
    var pos = PlayerCtl.pos;
    pos.x = at.x; pos.y = at.y + SEAT_UP; pos.z = at.z;
    var vel = PlayerCtl.vel;
    if (vel) { vel.x = 0; vel.y = 0; vel.z = 0; }
    engine(mySeat === 0 && veh.fuel > 0, veh.sp, veh.T.max, !!veh.T.big);
  }
  function rams(veh, nowT) {
    if (Math.abs(veh.sp) < V.ramMin || !Net.eachRemote) return;
    var spec = veh.T;
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    Net.eachRemote(function (id, rem) {
      if (!rem || !rem.alive || !rem.renderPos) return;
      var dx = rem.renderPos.x - veh.x;
      var dz = rem.renderPos.z - veh.z;
      var side = dx * cs + dz * sn;
      var along = dx * sn - dz * cs;
      if (Math.abs(side) > spec.wid / 2 + 0.45 || Math.abs(along) > spec.len / 2 + 0.5 || Math.abs(rem.renderPos.y - veh.y) > 2.6) return;
      if (nowT - (ramAt[id] || 0) < 900) return;
      ramAt[id] = nowT;
      Net.emitVeh('vehRam', { id: veh.id, victim: id });
    });
  }
  /* a ray against every hull but my own: { t, point, id, sealed } for the nearest, or null.
     Hulls are oriented boxes; the ray is taken into each one's frame. */
  function rayHit(origin, dir, maxDist) {
    if (!V) return null;
    var best = null;
    var bestT = maxDist;
    for (var id in list) {
      var veh = list[id];
      if (veh === mine) continue;
      var sn = Math.sin(veh.ry);
      var cs = Math.cos(veh.ry);
      var ox = origin.x - veh.x;
      var oz = origin.z - veh.z;
      if (ox * ox + oz * oz > (maxDist + veh.T.len) * (maxDist + veh.T.len)) continue;
      var lo = [ox * cs + oz * sn, origin.y - veh.y, ox * sn - oz * cs];
      var ld = [dir.x * cs + dir.z * sn, dir.y, dir.x * sn - dir.z * cs];
      var mn = [-veh.T.wid / 2, 0.15, -veh.T.len / 2];
      var mx = [veh.T.wid / 2, veh.T.hgt, veh.T.len / 2];
      var t0 = 0;
      var t1 = bestT;
      var hitIt = true;
      for (var ax = 0; ax < 3; ax++) {
        if (Math.abs(ld[ax]) < 1e-7) { if (lo[ax] < mn[ax] || lo[ax] > mx[ax]) { hitIt = false; break; } continue; }
        var ta = (mn[ax] - lo[ax]) / ld[ax];
        var tb = (mx[ax] - lo[ax]) / ld[ax];
        if (ta > tb) { var swapT = ta; ta = tb; tb = swapT; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { hitIt = false; break; }
      }
      if (hitIt && t0 < bestT) { bestT = t0; best = veh; }
    }
    if (!best) return null;
    return { t: bestT, id: best.id, sealed: !!best.T.sealed, sillY: best.y + (best.T.sill || 0),
             point: new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT) };
  }
  /* rounds that met a hull this shot, told to the server once per vehicle */
  function report(id, weapon, count) {
    if (typeof Net !== 'undefined' && Net.emitVeh) Net.emitVeh('vehHit', { id: id, w: weapon, n: count || 1 });
  }

  /* ------------------------------------------------------------ per frame */
  function freeSeat(veh) {
    for (var k = 0; k < veh.T.seats; k++) if (!veh.seats || !veh.seats[k]) return k;
    return -1;
  }
  /* net.js asks before it shows a remote avatar; system.js before it lets a round through a hull */
  function isRider(pid) { return riders[pid] !== undefined; }
  function riderOf(pid) { var vid = riders[pid]; return vid === undefined ? null : (list[vid] || null); }
  function update(dt) {
    if (!V || !scene) return;
    var blend = Math.min(1, dt * 10);
    var nowT = performance.now();
    agePuffs(dt, nowT);
    var best = null;
    var bestD = 1e9;
    var pos = (typeof PlayerCtl !== 'undefined') ? PlayerCtl.pos : null;
    riders = {};
    for (var id in list) {
      var veh = list[id];
      if (!(veh === mine && mySeat === 0)) {
        veh.x += (veh.tx - veh.x) * blend; veh.y += (veh.ty - veh.y) * blend; veh.z += (veh.tz - veh.z) * blend;
        veh.ry = wrap(veh.ry + wrap(veh.tr - veh.ry) * blend);
        lean(veh, wrap(veh.ry - veh.pry) / Math.max(dt, 1e-3), (veh.sp - veh.psp) / Math.max(dt, 1e-3), dt);
        veh.pry = veh.ry; veh.psp = veh.sp;
        place(veh);
      }
      var beams = veh.group.userData.beams;
      if (beams && beams.visible !== !!veh.lit) beams.visible = !!veh.lit;
      smoke(veh, nowT);
      var figs = veh.group.userData.figures || [];
      for (var fk = 0; fk < figs.length; fk++) figs[fk].visible = !!(veh.seats && veh.seats[fk]);
      if (veh.seats) for (var sk = 0; sk < veh.seats.length; sk++) if (veh.seats[sk]) riders[veh.seats[sk]] = veh.id;
      if (!mine && pos && freeSeat(veh) >= 0) {
        var gap = Math.hypot(veh.x - pos.x, veh.z - pos.z) - veh.T.len / 2;
        if (gap < V.enterDist && Math.abs(veh.y - (pos.y - 0.96)) < 3 && gap < bestD) { bestD = gap; best = veh; }
      }
    }
    nearest = (!mine && typeof PlayerCtl !== 'undefined' && PlayerCtl.alive) ? best : null;
    showPrompt(nearest);
    if (mine) hud(mine);
  }
  function camera(cam) {
    if (!mine || !cam || typeof PlayerCtl === 'undefined') return;
    var spec = mine.T;
    var yaw = PlayerCtl.yaw;
    var pitch = Math.max(-0.95, Math.min(0.35, PlayerCtl.pitch));
    var cp = Math.cos(pitch);
    var fx = Math.sin(yaw) * cp;
    var fy = Math.sin(pitch);
    var fz = -Math.cos(yaw) * cp;
    var px = mine.x;
    var py = (mine.yv === undefined ? mine.y : mine.yv) + spec.hgt + 0.7;
    var pz = mine.z;
    var boom = spec.boom;
    try {
      var hit = World.rayHit(new THREE.Vector3(px, py, pz), new THREE.Vector3(-fx, -fy, -fz), boom);
      if (hit && hit.point) boom = Math.max(1.6, Math.hypot(hit.point.x - px, hit.point.y - py, hit.point.z - pz) - 0.35);
    } catch (err) { /* keep the full boom */ }
    cam.position.set(px - fx * boom, Math.max(mine.y + 0.6, py - fy * boom), pz - fz * boom);
    cam.rotation.x = pitch; cam.rotation.z = 0;
  }

  /* ------------------------------------------------------------ HUD, sound */
  function dom() {
    if (hudEl || typeof document === 'undefined' || !document.body || !document.createElement) return;
    var css = document.createElement('style');
    css.textContent =
      '#veh-hud{position:fixed;right:26px;bottom:150px;z-index:40;display:none;min-width:190px;padding:12px 16px;background:rgba(10,14,20,.72);' +
      'border-left:3px solid #f0b23c;color:#e9edf2;font-family:Rajdhani,Arial,sans-serif;pointer-events:none}' +
      '#veh-hud .vn{font-size:13px;letter-spacing:.18em;color:#f0b23c;text-transform:uppercase}' +
      '#veh-hud .vs{font-size:46px;font-weight:700;line-height:1}#veh-hud .vs i{font-size:13px;font-style:normal;letter-spacing:.14em;color:#9aa6b2;margin-left:6px}' +
      '#veh-hud .vl{display:flex;align-items:center;gap:8px;margin-top:6px}#veh-hud .vl em{font-style:normal;font-size:10px;letter-spacing:.16em;color:#9aa6b2;width:50px}' +
      '#veh-hud .vb{flex:1;height:6px;background:rgba(255,255,255,.14)}#veh-hud .vb span{display:block;height:100%;background:#6fd08c}' +
      '#veh-hud .vk{margin-top:8px}' +
      '#veh-hud .vk{font-size:12px;color:#9aa6b2;letter-spacing:.06em}' +
      '#veh-prompt{position:fixed;left:50%;bottom:24%;transform:translateX(-50%);z-index:40;display:none;padding:8px 16px;background:rgba(10,14,20,.78);' +
      'border:1px solid rgba(240,178,60,.6);color:#e9edf2;font:600 15px Rajdhani,Arial,sans-serif;letter-spacing:.1em;pointer-events:none}' +
      '#veh-prompt b{color:#f0b23c}';
    document.head.appendChild(css);
    hudEl = document.createElement('div');
    hudEl.id = 'veh-hud';
    hudEl.innerHTML = '<div class="vn"></div><div class="vs"><b>0</b><i>KM/H</i></div>' +
      '<div class="vl"><em>HULL</em><div class="vb"><span></span></div></div>' +
      '<div class="vl"><em>PETROL</em><div class="vb"><span></span></div></div><div class="vk"></div>';
    document.body.appendChild(hudEl);
    promptEl = document.createElement('div');
    promptEl.id = 'veh-prompt';
    document.body.appendChild(promptEl);
  }
  function keyName() { return String(V.useKey || 'KeyN').replace('Key', ''); }
  function showHud(on) { dom(); if (hudEl) hudEl.style.display = on ? 'block' : 'none'; }
  function showPrompt(veh) {
    dom();
    if (!promptEl) return;
    if (!veh) { if (promptEl.style.display !== 'none') promptEl.style.display = 'none'; return; }
    var seat = freeSeat(veh);
    var text = keyName() + ' — ' + (seat === 0 ? 'DRIVE' : 'RIDE') + ' <b>' + veh.T.label.toUpperCase() + '</b>';
    if (promptEl.innerHTML !== text) promptEl.innerHTML = text;
    promptEl.style.display = 'block';
  }
  function hud(veh) {
    if (!hudEl) return;
    var kids = hudEl.children;
    kids[0].textContent = veh.T.label + (mySeat === 0 ? '' : ' \u00b7 passenger');
    kids[1].firstChild.textContent = String(Math.round(Math.abs(veh.sp) * 3.6));
    var frac = Math.max(0, Math.min(1, veh.hp / veh.T.hp));
    var bar = kids[2].lastChild.firstChild;
    bar.style.width = (frac * 100).toFixed(0) + '%';
    bar.style.background = frac > 0.5 ? '#6fd08c' : frac > 0.25 ? '#f0b23c' : '#e2513f';
    var fuel = Math.max(0, Math.min(1, veh.fuel / 100));
    var fbar = kids[3].lastChild.firstChild;
    fbar.style.width = (fuel * 100).toFixed(0) + '%';
    fbar.style.background = fuel > 0.25 ? '#e9c46a' : '#e2513f';
    var hint = mySeat === 0 ? 'W/S drive \u00b7 A/D steer \u00b7 SPACE brake \u00b7 H horn \u00b7 L lights \u00b7 ' + keyName() + ' out' : keyName() + ' get out';
    if (frac < V.fireAt) hint = 'ON FIRE \u2014 GET OUT (' + keyName() + ')';
    if (kids[4].textContent !== hint) kids[4].textContent = hint;
  }
  /* the engine note is the game's own audio bus (volume slider, mute) */
  function engine(on, speed, top, deep) {
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleEngine) AudioSys.vehicleEngine(!!on, Math.min(1, Math.abs(speed) / (top || 1)), !!deep); } catch (err) { /* no sound is not a reason to stop driving */ }
  }
  return { init: init, reset: reset, sync: sync, onSeat: onSeat, onBoom: onBoom, update: update, drive: drive, mounted: mounted,
           camera: camera, use: use, horn: horn, lights: lights, onHorn: onHorn, rayHit: rayHit, report: report, isRider: isRider, riderOf: riderOf,
           driving: function () { return !!mine && mySeat === 0; },
           _list: function () { return list; }, _build: buildModel, _mount: mount, _hullFree: hullFree, _exitSpot: exitSpot };
})();
if (typeof window !== 'undefined') window.Vehicles = Vehicles;
