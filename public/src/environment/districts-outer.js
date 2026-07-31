/* Districts: OUTER ring — Cargo yard (E), Bus Terminal (SE),
   Construction Zone West (W), Residential colony (S). */
World._buildPart5 = function (T) {
  'use strict';
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight,
    facade = T.facade, win = T.win, crates = T.crates, lamp = T.lamp,
    barrel = T.barrel, brokenWall = T.brokenWall, M = T.M, rnd = T.rnd, scene = T.scene;
  var NC = { collide: false, cast: false };

  /* =============== CARGO / CONTAINER YARD (x 74..97, z -44..8) =============== */
  seg(75, 96, 0.003, 0.016, -43, -7, M.concrete, NC);   // stops at the avenue edge (z=-7)
  var CBOX = [M.contRed, M.contBlue || M.metal, M.contGreen, M.rust];
  function stack(x, z, levels, ci) {
    for (var l = 0; l < levels; l++) {
      box(x, 1.3 + l * 2.6, z, 2.44, 2.6, 6.1, CBOX[(ci + l) % CBOX.length]);
    }
  }
  stack(78, -38, 1, 0); stack(78, -30, 2, 1); stack(78, -22, 1, 2); stack(78, -14, 2, 3); stack(78, -6, 1, 0);
  stack(84.5, -38, 2, 2); stack(84.5, -30, 1, 3); stack(84.5, -22, 2, 0); stack(84.5, -14, 1, 1);
  stack(91, -34, 1, 1); stack(91, -26, 2, 2); stack(91, -18, 1, 3); stack(91, -10, 2, 0);
  // climb route onto the 2-high at (84.5,-22): step blocks 0.9 -> 1.8 -> 2.6 -> 5.2
  box(87.1, 0.45, -25.4, 1.4, 0.9, 1.4, M.wood);
  box(86.6, 0.9, -23.6, 1.4, 1.8, 1.4, M.wood);
  // (from the 1.8 block jump to the 2.6 roof of the single at (84.5,-30)? no — onto (84.5,-22) L1 top)
  // gantry crane frame over the yard entrance
  seg(75.6, 76.4, 0, 8, -0.4, 0.4, M.trim);
  seg(94.6, 95.4, 0, 8, -0.4, 0.4, M.trim);
  seg(75.6, 95.4, 8, 8.9, -0.6, 0.6, M.rust);
  box(84, 7.4, 0, 1.6, 1.2, 1.6, M.dark, NC);                          // trolley
  crates(93, 3); barrel(76.5, -42, true); lamp(86, 6, 'n');

  /* =============== BUS TERMINAL (x 74..97, z 26..60) =============== */
  seg(75, 96, 0.003, 0.016, 27, 59, M.asphalt, NC);
  // canopy on six columns (cover lane, roof not accessible)
  [[78, 34], [78, 42], [86, 34], [86, 42], [93, 34], [93, 42]].forEach(function (p) {
    cyl(p[0], 2.2, p[1], 0.18, 4.4, M.trim);
  });
  seg(76, 95, 4.4, 4.8, 32, 44, M.roof);
  // parked buses (solid cover)
  function bus(x, z, ry) {
    var VGLASS = new THREE.MeshBasicMaterial({ color: 0x151d26 });
    var VWHEEL = new THREE.MeshLambertMaterial({ color: 0x101214 });
    var VLF = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    var VLR = new THREE.MeshBasicMaterial({ color: 0xff5040 });
    var VBUS = new THREE.MeshLambertMaterial({ color: 0x2e5f8a });
    var VROOF = new THREE.MeshLambertMaterial({ color: 0xd8dde2 });
    var RY = ry, CC = Math.cos(RY), SS = Math.sin(RY);
    function OFF(dx, dz) { return [x + dx * CC - dz * SS, z + dx * SS + dz * CC]; }
    box(x, 1.32, z, 2.45, 1.3, 8.9, VBUS, { rotY: RY });
    box(x, 1.78, z, 2.5, 0.42, 7.6, VGLASS, { rotY: RY, collide: false });
    box(x, 2.68, z, 2.3, 0.1, 8.7, VROOF, { rotY: RY, collide: false });
    var LAT = 1.05, LZF = 3.1;
    [[LAT, LZF], [-LAT, LZF], [LAT, -LZF], [-LAT, -LZF]].forEach(function (wf) {
      var wp = OFF(wf[0], wf[1]);
      var wm = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10), VWHEEL);
      wm.position.set(wp[0], 0.31, wp[1]);
      wm.rotation.set(0, RY, Math.PI / 2);
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      scene.add(wm);
    });
    [OFF(LAT, 0), OFF(-LAT, 0)].forEach(function (wp) {
      var wm = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10), VWHEEL);
      wm.position.set(wp[0], 0.31, wp[1]);
      wm.rotation.set(0, RY, Math.PI / 2);
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      scene.add(wm);
    });
    var lf = OFF(0, 4.5); box(lf[0], 0.9, lf[1], 2.1, 0.16, 0.06, VLF, { rotY: RY, collide: false });
    var lr = OFF(0, -4.5); box(lr[0], 0.9, lr[1], 2.1, 0.14, 0.06, VLR, { rotY: RY, collide: false });
  }
  bus(82, 37, 0); bus(88, 37, 0); bus(84, 52, 0.35); bus(92, 50, -0.2);
  // ticket office with roof access (external north stair)
  (function () {
    var X0 = 74, X1 = 82, Z0 = 48, Z1 = 58, TT = 0.3;
    facade('z', Z0, Z0 + TT, X0, X1, 0, 3.8, M.plaster, [{ u0: 77, u1: 78.6, v0: 0, v1: 2.4 }, win(80, 1.5, 1.3, 1.3)]);
    seg(X0, X1, 0, 3.8, Z1 - TT, Z1, M.plaster);
    seg(X0, X0 + TT, 0, 3.8, Z0, Z1, M.plaster);
    facade('x', X1 - TT, X1, Z0, Z1, 0, 3.8, M.plaster, [win(53, 1.5, 1.6, 1.3)]);
    seg(X0, X1, 3.8, 4.05, Z0, 58.66, M.roof);                       // roof extends over stair top
    stairFlight(75.4, 0, 58.7, 1, 0, 12, 0.317, 0.33, 1.2, M.metal);
  })();
  lamp(90, 58, 'w');

  /* =============== CONSTRUCTION ZONE WEST (x -97..-74, z -26..18) =============== */
  seg(-96, -75, 0.002, 0.012, -25, 17, M.dirt, NC);
  // slab tower: two levels on columns, zigzag stairs
  [[-93, -17], [-93, -3], [-81, -17], [-81, -3], [-87, -10]].forEach(function (p) {
    seg(p[0] - 0.35, p[0] + 0.35, 0, 7.1, p[1] - 0.35, p[1] + 0.35, M.concrete);
  });
  seg(-94, -80, 3.5, 3.9, -18, -2, M.concrete);                                    // slab 1
  seg(-94, -83, 7.1, 7.5, -16, -4, M.concrete);                                    // slab 2
  stairFlight(-79.1, 0, -2.6, 0, -1, 12, 0.325, 0.33, 1.2, M.concrete);            // ground -> slab1 (flush 3.9)
  stairFlight(-92.9, 3.9, -5.4, 0, -1, 11, 0.327, 0.33, 1.2, M.concrete);          // slab1 -> slab2 (flush 7.5)
  seg(-94, -83, 7.5, 8.3, -16, -15.8, M.trim, NC);                                 // slab2 edge rail (north)
  // crane
  box(-77, 0.9, 12, 3.4, 1.8, 3.4, M.concrete);
  seg(-77.5, -76.5, 1.8, 12.5, 11.5, 12.5, M.rust);
  seg(-90, -70, 12.5, 13.3, 11.4, 12.6, M.rust, NC);
  // materials + fence with gaps
  crates(-90, 12); crates(-76, -20);
  box(-84, 0.42, 14, 4, 0.84, 1.2, M.wood);                                        // lumber pile
  cyl(-79, 0.5, 4, 0.45, 1.0, M.metal); cyl(-79, 0.5, 5.1, 0.45, 1.0, M.metal); // pipes
  box(-75.6, 1.15, -12, 1.1, 2.3, 1.5, M.trim);                       // porta-cabin
  seg(-96, -88, 1.0, 2.1, 17.4, 17.55, M.trim, { cast: false });
  seg(-82, -75, 1.0, 2.1, 17.4, 17.55, M.trim, { cast: false });
  seg(-96, -90, 1.0, 2.1, -25.55, -25.4, M.trim, { cast: false });

  /* =============== RESIDENTIAL COLONY (z 76..97) =============== */
  seg(-7, 7, 0.005, 0.02, 68, 96, M.asphalt, NC);                                  // south connector road
  function apartment(X0, X1) {
    var Z0 = 80, Z1 = 94, TT = 0.3;
    var lane0 = X1 - 1.75, lane1 = X1 - 0.35;                                      // internal stair lane (east)
    // floor-1 walls: front door + windows (south face), windows elsewhere
    facade('z', Z0, Z0 + TT, X0, X1, 0, 3.35, M.brick,
      [{ u0: (X0 + X1) / 2 - 0.9, u1: (X0 + X1) / 2 + 0.9, v0: 0, v1: 2.35 },
       win(X0 + 3.4, 1.4, 1.4, 1.2), win(X1 - 4.4, 1.4, 1.4, 1.2)]);
    facade('z', Z1 - TT, Z1, X0, X1, 0, 3.35, M.brick, [win(X0 + 5, 1.4, 1.5, 1.2), win(X1 - 6, 1.4, 1.5, 1.2)]);
    seg(X0, X0 + TT, 0, 3.35, Z0, Z1, M.brick);
    seg(X1 - TT, X1, 0, 3.35, Z0, Z1, M.brick);
    // F2 slab with stair hole over the lane
    seg(X0, lane0 - 0.1, 3.35, 3.55, Z0, Z1, M.concrete);
    seg(lane0 - 0.1, X1, 3.35, 3.55, Z0, 80.7, M.concrete);
    seg(lane0 - 0.1, X1, 3.35, 3.55, 85.0, Z1, M.concrete);
    // F2 walls: balcony door front-center + windows
    facade('z', Z0, Z0 + TT, X0, X1, 3.55, 6.85, M.brick,
      [{ u0: (X0 + X1) / 2 - 0.7, u1: (X0 + X1) / 2 + 0.7, v0: 3.6, v1: 5.85 },
       win(X0 + 3.4, 4.7, 1.4, 1.15), win(X1 - 4.4, 4.7, 1.4, 1.15)]);
    facade('z', Z1 - TT, Z1, X0, X1, 3.55, 6.85, M.brick, [win(X0 + 5, 4.7, 1.5, 1.15), win(X1 - 6, 4.7, 1.5, 1.15)]);
    seg(X0, X0 + TT, 3.55, 6.85, Z0, Z1, M.brick);
    seg(X1 - TT, X1, 3.55, 6.85, Z0, Z1, M.brick);
    // balcony (front, F2)
    seg((X0 + X1) / 2 - 1.5, (X0 + X1) / 2 + 1.5, 3.5, 3.7, 78.6, Z0 + 0.05, M.concrete);
    seg((X0 + X1) / 2 - 1.5, (X0 + X1) / 2 + 1.5, 3.7, 4.6, 78.55, 78.67, M.trim);
    // roof with stair hole + parapet
    seg(X0, lane0 - 0.1, 6.85, 7.1, Z0, Z1, M.roof);
    seg(lane0 - 0.1, X1, 6.85, 7.1, Z0, 84.9, M.concrete);
    seg(lane0 - 0.1, X1, 6.85, 7.1, 89.2, Z1, M.roof);
    seg(X0, X1, 7.1, 7.9, Z0, Z0 + 0.22, M.brick);
    seg(X0, X1, 7.1, 7.9, Z1 - 0.22, Z1, M.brick);
    seg(X0, X0 + 0.22, 7.1, 7.9, Z0, Z1, M.brick);
    seg(X1 - 0.22, X1, 7.1, 7.9, Z0, Z1, M.brick);
    // internal stairs: ground -> F2 -> roof (east lane)
    stairFlight((lane0 + lane1) / 2, 0, 81.0, 0, 1, 11, 0.323, 0.33, 1.3, M.concrete);
    stairFlight((lane0 + lane1) / 2, 3.55, 85.2, 0, 1, 11, 0.323, 0.33, 1.3, M.concrete);
    // roof water tank
    cyl(X0 + 3, 7.9, 91, 1.0, 1.6, M.trim);
  }
  apartment(-42, -18);
  apartment(12, 36);
  // courtyard between blocks: playground + parked cars
  box(-14, 0.6, 86, 0.14, 1.2, 0.14, M.trim); box(-11, 0.6, 86, 0.14, 1.2, 0.14, M.trim);
  seg(-14, -11, 1.15, 1.28, 85.9, 86.1, M.trim, NC);                                // swing frame
  box(-12.5, 0.35, 88.5, 1.6, 0.7, 0.9, M.wood, NC);                   // bench
  function car(x, z, ry, m) {
    var VGLASS = new THREE.MeshBasicMaterial({ color: 0x151d26 });
    var VWHEEL = new THREE.MeshLambertMaterial({ color: 0x101214 });
    var VLF = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    var VLR = new THREE.MeshBasicMaterial({ color: 0xff5040 });
    var RY = ry, CC = Math.cos(ry), SS = Math.sin(ry);
    function OFF(dx, dz) { return [x + dx * CC - dz * SS, z + dx * SS + dz * CC]; }
    box(x, 0.55, z, 1.86, 0.62, 4.15, m, { rotY: ry });
    box(x, 1.06, z, 1.68, 0.44, 2.05, VGLASS, { rotY: ry, collide: false });
    box(x, 1.31, z, 1.72, 0.08, 2.1, m, { rotY: ry, collide: false });
    var LAT = 0.88, LZF = 1.35;
    [[LAT, LZF], [-LAT, LZF], [LAT, -LZF], [-LAT, -LZF]].forEach(function (wf) {
      var wp = OFF(wf[0], wf[1]);
      var wm = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10), VWHEEL);
      wm.position.set(wp[0], 0.31, wp[1]);
      wm.rotation.set(0, RY, Math.PI / 2);
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      scene.add(wm);
    });
    var lf = OFF(0, 2.12); box(lf[0], 0.62, lf[1], 1.5, 0.14, 0.06, VLF, { rotY: ry, collide: false });
    var lr = OFF(0, -2.12); box(lr[0], 0.62, lr[1], 1.5, 0.12, 0.06, VLR, { rotY: ry, collide: false });
  }
  car(-8.8, 79, 0.06, M.metal || M.metal);
  car(8.8, 82, -0.04, M.rust);
  car(9.2, 90, 0.02, M.metal);
  lamp(-8.5, 84, 'e'); lamp(8.5, 92, 'w');

  /* ==================================================================
     V6.0 DISTRICTS — airport (NW), harbour (SW), mall (E), towers (SE).
     Everything multi-storey is built by ONE parameterised helper so the
     stair geometry is identical everywhere and provable by the ascent gate.
     Floors are solid slabs; access is an EXTERNAL straight flight along the
     -z face (the same pattern as the warehouse fire escape, the only stair
     design in this project with a passing gate history), with a doorway gap
     punched in the wall at every floor level the stair passes.
     ================================================================== */
  var FH = 3.0;          // floor height
  var SH = 0.30, SD = 0.30;   // stair rise / run: 10 steps per floor

  function building(x0, x1, z0, z1, floors, wallMat, roofMat) {
    var t = 0.28;
    var stairX = x0 + 1.2;                       // where the external flight starts
    for (var f = 0; f <= floors; f++) {
      var y = f * FH;
      seg(x0, x1, y, y + 0.25, z0, z1, f === floors ? roofMat : wallMat);   // slab / roof
      if (f === floors) break;
      var b0 = y + 0.25, sill = b0 + 0.9, head = b0 + 2.05, top = (f + 1) * FH;
      var doorX = stairX + f * (10 * SD);        // where the flight is at this level
      // -z face: lower band split around the doorway, upper band continuous
      seg(x0, Math.min(x1, doorX - 0.85), b0, sill, z0, z0 + t, wallMat);
      seg(Math.min(x1, doorX + 0.85), x1, b0, sill, z0, z0 + t, wallMat);
      seg(x0, x1, head, top, z0, z0 + t, wallMat);
      seg(x0, x1, b0, sill, z1 - t, z1, wallMat);      // +z face
      seg(x0, x1, head, top, z1 - t, z1, wallMat);
      seg(x0, x0 + t, b0, sill, z0, z1, wallMat);      // -x face
      seg(x0, x0 + t, head, top, z0, z1, wallMat);
      seg(x1 - t, x1, b0, sill, z0, z1, wallMat);      // +x face
      seg(x1 - t, x1, head, top, z0, z1, wallMat);
      // corner posts (full height, so the window band reads as a band)
      [[x0, x0 + t], [x1 - t, x1]].forEach(function (cx) {
        [[z0, z0 + t], [z1 - t, z1]].forEach(function (cz) {
          seg(cx[0], cx[1], b0, top, cz[0], cz[1], wallMat);
        });
      });
    }
    /* One continuous external flight along the -z face. NO landings: the flight
       already passes every floor level, and a landing box placed on the run sits
       on top of the treads and walls the climb off — the exact bug that made the
       station house roof unreachable. You step sideways through the doorway gap
       instead, a 0.25m rise from tread to slab, well inside the 0.42m auto-step. */
    stairFlight(stairX, 0, z0 - 1.0, 1, 0, floors * 10, SH, SD, 1.5, M.metal);
    // outer handrail runs the whole flight, clear of the treads
    seg(stairX - 0.3, stairX + floors * 10 * SD, 0.9, 1.75, z0 - 1.9, z0 - 1.78, M.trim, { collide: false });
    // roof parapet
    var ry = floors * FH + 0.25;
    seg(x0, x1, ry, ry + 0.95, z0, z0 + 0.15, M.trim, { cast: false });
    seg(x0, x1, ry, ry + 0.95, z1 - 0.15, z1, M.trim, { cast: false });
    seg(x0, x0 + 0.15, ry, ry + 0.95, z0, z1, M.trim, { cast: false });
    seg(x1 - 0.15, x1, ry, ry + 0.95, z0, z1, M.trim, { cast: false });
  }

  /* ---- HIGH-RISE CLUSTER (SE, x 52..94 / z 50..92) ---- */
  building(52, 70, 56, 72, 6, M.concrete, M.roof);      // 6 floors, 18m
  building(74, 92, 52, 68, 7, M.plaster, M.roof);       // 7 floors, 21m
  building(58, 76, 78, 92, 6, M.brick, M.roof);         // 6 floors
  crates(72, 74); crates(50, 62); barrel(93, 72, true); barrel(56, 90, false);

  /* ---- MALL (E, x 46..92 / z -46..-20) — two big floors ---- */
  building(50, 88, -44, -22, 2, M.plaster, M.roof);
  // atrium planters + shopfront stalls as interior cover on the ground floor
  [[58, -38], [68, -30], [78, -38], [62, -26], [80, -26]].forEach(function (q) {
    box(q[0], 0.55, q[1], 2.4, 1.1, 2.4, M.sidewalk);
  });
  [[54, -26], [84, -40]].forEach(function (q) { crates(q[0], q[1]); });

  /* ---- AIRPORT (NW, x -95..-40 / z -95..-45) ---- */
  seg(-94, -44, 0.02, 0.05, -78, -62, M.asphalt, NC);                     // runway
  for (var rm = -92; rm < -46; rm += 8)
    seg(rm, rm + 4, 0.05, 0.07, -70.4, -69.6, M.sidewalk, NC);            // centreline
  building(-92, -74, -92, -80, 2, M.plaster, M.roof);                     // terminal
  // hangars: open-fronted sheds
  [[-68, -94], [-56, -94]].forEach(function (h) {
    seg(h[0], h[0] + 10, 0, 6.2, h[1], h[1] + 0.3, M.metal);
    seg(h[0], h[0] + 0.3, 0, 6.2, h[1], h[1] + 12, M.metal);
    seg(h[0] + 9.7, h[0] + 10, 0, 6.2, h[1], h[1] + 12, M.metal);
    seg(h[0] - 0.4, h[0] + 10.4, 6.2, 6.5, h[1] - 0.4, h[1] + 12.4, M.roof, { collide: false });
  });
  // parked aircraft (fuselage + wings + tail) — hard cover on the apron
  [[-84, -56], [-62, -52]].forEach(function (a2) {
    box(a2[0], 2.3, a2[1], 3.0, 3.0, 15, M.metal);                        // fuselage
    box(a2[0], 2.1, a2[1], 20, 0.5, 2.6, M.metal);                        // wings
    box(a2[0], 4.2, a2[1] + 6.4, 0.4, 3.4, 3.0, M.metal);                 // tail fin
    cyl(a2[0] - 5, 1.4, a2[1] - 1, 0.9, 2.6, M.dark);                     // engines
    cyl(a2[0] + 5, 1.4, a2[1] - 1, 0.9, 2.6, M.dark);
  });
  barrel(-90, -60, true); barrel(-88, -58, false); crates(-72, -50);

  /* ---- SHIP HARBOUR (SW, x -95..-44 / z 46..94) ---- */
  seg(-94, -60, 0, 0.6, 50, 90, M.concrete);                              // quay deck
  seg(-60, -44, -0.4, -0.36, 46, 94, M.metal, { collide: false, cast: false }); // water
  // docked ship: hull + superstructure with an external stair to the bridge
  seg(-60, -46, 0.2, 3.4, 54, 86, M.rust);                                // hull
  building(-58, -50, 58, 68, 3, M.metal, M.roof);                         // superstructure
  seg(-56, -48, 3.4, 3.7, 70, 84, M.metal);                               // aft deck
  // gantry cranes on the quay
  [[-78, 58], [-78, 78]].forEach(function (c2) {
    cyl(c2[0] - 3, 4.5, c2[1], 0.35, 9, M.rust); cyl(c2[0] + 3, 4.5, c2[1], 0.35, 9, M.rust);
    box(c2[0], 9.3, c2[1], 20, 0.7, 1.2, M.rust);
  });
  [[-86, 62, 0], [-86, 70, 0], [-90, 66, Math.PI / 2], [-74, 84, 0]].forEach(function (c3) {
    box(c3[0], 1.3, c3[1], 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0], { rotY: c3[2] });
  });
  box(-86, 3.9, 62, 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0]);     // stacked
  crates(-70, 52);

  /* =============== OUTSKIRTS COVER PASS (v5.0) ===============
     tools/verify-cover.js measured 23.6% of Urban as dead ground (no cover
     within 14m), worst point 56m, almost all of it in the ring beyond +-45.
     Rather than hand-placing props off a screenshot, this walks a grid, asks
     the LIVE collider set whether that spot already has cover, and only fills
     genuinely empty ground. Self-correcting: if the map gains content later,
     this pass automatically places less. */
  (function outskirts() {
    var cols = World.colliders;
    function hasCoverNear(x, z, rad) {
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        if (c[4] < 0.5 || c[4] > 3.5) continue;                 // not body-blocking
        if (c[3] - c[0] > 30 || c[5] - c[2] > 30) continue;     // ground slab, not cover
        var dx = Math.max(c[0] - x, 0, x - c[3]);
        var dz = Math.max(c[2] - z, 0, z - c[5]);
        if (dx * dx + dz * dz < rad * rad) return true;
      }
      return false;
    }
    function onRoad(x, z) {   // keep the avenues and alleys clear
      return (Math.abs(x) < 10 && Math.abs(z) < 100) || (Math.abs(z) < 10 && Math.abs(x) < 100)
          || (x > 18 && x < 26 && z > -52 && z < -6) || (x > -52 && x < -6 && z > 14 && z < 22);
    }

    function container(x, z, rot) {
      box(x, 1.3, z, 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0], { rotY: rot });
      if (rnd() < 0.35) box(x + 0.3, 3.85, z, 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0], { rotY: rot });
    }
    function barrierRun(x, z, alongX) {
      for (var i = -1; i <= 1; i++) {
        var bx = x + (alongX ? i * 2.1 : 0), bz = z + (alongX ? 0 : i * 2.1);
        box(bx, 0.45, bz, alongX ? 2.0 : 0.6, 0.9, alongX ? 0.6 : 2.0, M.concrete);
      }
    }
    function shed(x, z) {
      seg(x - 1.6, x + 1.6, 0, 2.5, z - 1.5, z - 1.35, M.plaster);
      seg(x - 1.6, x + 1.6, 0, 2.5, z + 1.35, z + 1.5, M.plaster);
      seg(x - 1.6, x - 1.45, 0, 2.5, z - 1.5, z + 1.5, M.plaster);
      seg(x + 1.45, x + 1.6, 0, 2.5, z - 1.5, z - 0.5, M.plaster);   // doorway gap
      seg(x - 1.8, x + 1.8, 2.5, 2.72, z - 1.7, z + 1.7, M.roof, { collide: false });
    }
    function pylon(x, z) {
      box(x, 1.55, z, 0.5, 3.1, 0.5, M.metal);
      box(x, 1.1, z, 1.9, 0.22, 0.22, M.metal, { collide: false });
      box(x, 2.4, z, 1.5, 0.2, 0.2, M.metal, { collide: false });
    }
    function planter(x, z) {
      box(x, 0.42, z, 2.2, 0.84, 2.2, M.sidewalk);
      box(x, 1.15, z, 1.4, 0.7, 1.4, M.dark, { collide: false });
    }
    function rubblePile(x, z) {
      for (var i = 0; i < 5; i++)
        box(x + (rnd() - 0.5) * 2.6, 0.35 + rnd() * 0.5, z + (rnd() - 0.5) * 2.6,
          0.7 + rnd() * 0.9, 0.7 + rnd() * 0.9, 0.7 + rnd() * 0.9, M.concrete, { rotY: rnd() * 3.14 });
    }

    var kinds = [container, barrierRun, shed, pylon, planter, rubblePile, crates, brokenWall];
    var placed = 0;
    for (var gx = -94; gx <= 94 && placed < 110; gx += 7) {
      for (var gz = -94; gz <= 94 && placed < 110; gz += 7) {
        var x = gx + (rnd() - 0.5) * 4.5, z = gz + (rnd() - 0.5) * 4.5;
        if (onRoad(x, z)) continue;
        if (hasCoverNear(x, z, 11)) continue;
        var k = kinds[(rnd() * kinds.length) | 0];
        if (k === container) container(x, z, rnd() < 0.5 ? 0 : Math.PI / 2);
        else if (k === barrierRun) barrierRun(x, z, rnd() < 0.5);
        else if (k === brokenWall) brokenWall(x, z, rnd() < 0.5);
        else k(x, z);
        placed++;
      }
    }
  })();
};
