/* Districts: OUTER ring — Cargo yard (E), Bus Terminal (SE),
   Construction Zone West (W), Residential colony (S). */
World._buildPart5 = function (T) {
  'use strict';
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight,
    facade = T.facade, win = T.win, crates = T.crates, lamp = T.lamp,
    barrel = T.barrel, brokenWall = T.brokenWall, M = T.M, rnd = T.rnd;
  var NC = { collide: false, cast: false };

  /* =============== CARGO / CONTAINER YARD (x 74..97, z -44..8) =============== */
  seg(75, 96, 0.003, 0.016, -43, 7, M.concrete, NC);
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
    box(x, 1.5, z, 2.5, 3.0, 7.4, M.amberGlow, { rotY: ry || 0 });
    box(x, 2.1, z, 2.56, 0.8, 6.6, M.dark, { rotY: ry || 0, collide: false });
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
    box(x, 0.62, z, 1.8, 1.15, 4.2, m, { rotY: ry });
    box(x, 1.32, z + 0.1, 1.7, 0.62, 2.3, M.dark, { rotY: ry, collide: false });
  }
  car(-8.8, 79, 0.06, M.metal || M.metal);
  car(8.8, 82, -0.04, M.rust);
  car(9.2, 90, 0.02, M.metal);
  lamp(-8.5, 84, 'e'); lamp(8.5, 92, 'w');
};
