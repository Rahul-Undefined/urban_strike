/* Districts: NORTH band (z -96..-72) — Airport (west) + Railway Station (east).
   Uses the shared T build contract from environment/world.js. All stairs reuse
   the proven <=0.36 rise pattern; the headless validator polices placement. */
World._buildPart4 = function (T) {
  'use strict';
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight,
    facade = T.facade, win = T.win, crates = T.crates, lamp = T.lamp,
    barrel = T.barrel, M = T.M, rnd = T.rnd, scene = T.scene;
  var NC = { collide: false, cast: false };

  /* =============== AIRPORT (x -96..-14, z -96..-74) =============== */
  // apron + runway surface
  seg(-94, -16, 0.004, 0.02, -96, -76, M.concrete, NC);
  for (var rx = -88; rx <= -26; rx += 6) {
    seg(rx, rx + 2.6, 0.022, 0.032, -86.3, -85.7, M.white, NC); // runway centerline
  }
  seg(-92, -22, 0.022, 0.03, -79.3, -78.9, M.white, NC);        // apron edge line

  // --- hangar: open south face, mezzanine + stairs inside ---
  (function () {
    var X0 = -62, X1 = -40, Z0 = -96, Z1 = -78, H = 9, TT = 0.6;
    seg(X0, X1, 0, H, Z0, Z0 + TT, M.metal);        // north
    seg(X0, X0 + TT, 0, H, Z0, Z1, M.metal);        // west
    seg(X1 - TT, X1, 0, H, Z0, Z1, M.metal);        // east
    seg(X0, -56, 0, H, Z1 - TT, Z1, M.metal);       // south L
    seg(-46, X1, 0, H, Z1 - TT, Z1, M.metal);       // south R (door gap x -56..-46)
    seg(X0, X1, H, H + 0.5, Z0, Z1, M.roof);                        // roof
    // mezzanine along the west wall + access stairs
    seg(-61.4, -56, 4.2, 4.5, -95.4, -86, M.metal);
    stairFlight(-60.2, 0, -81.7, 0, -1, 13, 0.346, 0.33, 1.3, M.metal);
    seg(-56.1, -56, 4.5, 5.4, -95.4, -86, M.trim, NC);                            // mezz rail
    crates(-46, -92); crates(-52, -84);
    box(-44.5, 1.1, -90, 2.2, 2.2, 3.4, M.rust);                       // service truck block
    barrel(-58.5, -80.5, true);
  })();

  // --- terminal: 2 floors, internal stairs, roof with parapet ---
  (function () {
    var X0 = -34, X1 = -20, Z0 = -92, Z1 = -80, TT = 0.3;
    // floor-1 walls with front door (south) + windows
    facade('z', Z1 - TT, Z1, X0, X1, 0, 3.4, M.plaster,
      [{ u0: -28.4, u1: -26.6, v0: 0, v1: 2.3 }, win(-32, 1.3, 1.3, 1.2), win(-23.5, 1.3, 1.3, 1.2)]);
    facade('z', Z0, Z0 + TT, X0, X1, 0, 3.4, M.plaster, [win(-30, 1.3, 1.4, 1.2), win(-24, 1.3, 1.4, 1.2)]);
    seg(X0, X0 + TT, 0, 3.4, Z0, Z1, M.plaster);
    seg(X1 - TT, X1, 0, 3.4, Z0, Z1, M.plaster);
    // floor-2 slab with stair hole along the east wall
    seg(X0, -21.6, 3.4, 3.6, Z0, Z1, M.concrete);
    seg(-21.6, X1, 3.4, 3.6, Z0, -85, M.concrete);
    seg(-21.6, X1, 3.4, 3.6, -81, Z1, M.concrete);
    // floor-2 walls + windows
    facade('z', Z1 - TT, Z1, X0, X1, 3.6, 6.9, M.plaster, [win(-31, 4.9, 1.3, 1.2), win(-27, 4.9, 1.3, 1.2), win(-23, 4.9, 1.3, 1.2)]);
    facade('z', Z0, Z0 + TT, X0, X1, 3.6, 6.9, M.plaster, [win(-29, 4.9, 1.4, 1.2)]);
    seg(X0, X0 + TT, 3.6, 6.9, Z0, Z1, M.plaster);
    seg(X1 - TT, X1, 3.6, 6.9, Z0, Z1, M.plaster);
    // roof with stair hole + parapet
    seg(X0, -21.6, 6.9, 7.2, Z0, Z1, M.roof);
    seg(-21.6, X1, 6.9, 7.2, Z0, -88.4, M.concrete);
    seg(-21.6, X1, 6.9, 7.2, -84.6, Z1, M.roof);
    seg(X0, X1, 7.2, 8.0, Z0, Z0 + 0.22, M.plaster);
    seg(X0, X1, 7.2, 8.0, Z1 - 0.22, Z1, M.plaster);
    seg(X0, X0 + 0.22, 7.2, 8.0, Z0, Z1, M.plaster);
    // internal stairs (east lane): ground -> F2 -> roof
    stairFlight(-20.9, 0, -81.0, 0, -1, 11, 0.327, 0.33, 1.2, M.concrete);
    stairFlight(-20.9, 3.6, -84.8, 0, -1, 10, 0.33, 0.33, 1.2, M.concrete);
    box(-27, 7.55, -84, 1.6, 0.8, 1.2, M.metal, { collide: true });     // roof AC
  })();

  // --- control tower with external switchback stairs ---
  (function () {
    // platform on four legs
    seg(-15.3, -11.7, 6.6, 6.9, -86.8, -83.2, M.metal);
    [[-15.1, -86.6], [-11.9, -86.6], [-15.1, -83.4], [-11.9, -83.4]].forEach(function (p) {
      seg(p[0] - 0.14, p[0] + 0.14, 0, 6.6, p[1] - 0.14, p[1] + 0.14, M.trim);
    });
    // cabin: low walls, open windows
    seg(-15.3, -11.7, 6.9, 8.0, -86.8, -86.6, M.plaster);
    seg(-15.3, -11.7, 6.9, 8.0, -83.4, -83.2, M.plaster);
    seg(-15.3, -15.1, 6.9, 8.0, -86.8, -83.2, M.plaster);
    seg(-11.9, -11.7, 6.9, 8.0, -86.8, -83.2, M.plaster);
    // switchback stairs from the south (lane x -14.15..-12.95)
    stairFlight(-13.55, 0, -76.0, 0, -1, 12, 0.29, 0.33, 1.2, M.metal);
    seg(-14.2, -12.9, 3.48, 3.7, -81.6, -80.0, M.metal);            // landing
    stairFlight(-13.55, 3.7, -80.3, 0, -1, 10, 0.32, 0.33, 1.2, M.metal);
    // arrival lands flush on the platform south edge (top 6.9)
    lamp(-18, -78, 'n');
  })();

  /* =============== RAILWAY STATION (x 16..96, z -96..-72) =============== */
  // ballast + rails (rails visual only)
  seg(18, 94, 0, 0.14, -89.4, -86.8, M.dirt);
  seg(18, 94, 0, 0.14, -84.6, -82.0, M.dirt);
  [[-88.9], [-87.3], [-84.1], [-82.5]].forEach(function (rz) {
    seg(18, 94, 0.14, 0.24, rz[0] - 0.09, rz[0] + 0.09, M.metal, NC);
  });
  // passenger platform + end ramp steps
  seg(22, 64, 0, 1.12, -80.6, -76.6, M.concrete);
  stairFlight(23, 0, -76.5, 0, -1, 4, 0.28, 0.33, 2.4, M.concrete);
  stairFlight(63, 0, -76.5, 0, -1, 4, 0.28, 0.33, 2.4, M.concrete);
  // parked train: loco + boxcars (cover) + climbable flatcar
  box(26, 1.75, -88.1, 6.4, 3.5, 2.8, M.rust);
  box(30.1, 2.3, -88.1, 1.4, 1.0, 2.4, M.dark);
  box(37.5, 1.7, -88.1, 7.4, 3.4, 2.7, M.metal || M.metal);
  box(47.5, 1.7, -88.1, 7.4, 3.4, 2.7, M.rust);
  box(57, 0.65, -88.1, 7.2, 1.3, 2.6, M.wood);                                    // flatcar (jump on)
  // station house: tall single hall + roof access via east external stair
  (function () {
    var X0 = 30, X1 = 44, Z0 = -96, Z1 = -88, TT = 0.3;
    facade('z', Z1 - TT, Z1, X0, X1, 0, 4.6, M.brick,
      [{ u0: 36, u1: 38, v0: 0, v1: 2.6 }, win(32.4, 1.7, 1.5, 1.5), win(41, 1.7, 1.5, 1.5)]);
    facade('z', Z0, Z0 + TT, X0, X1, 0, 4.6, M.brick, [win(35, 1.7, 1.6, 1.4), win(40, 1.7, 1.6, 1.4)]);
    seg(X0, X0 + TT, 0, 4.6, Z0, Z1, M.brick);
    seg(X1 - TT, X1, 0, 4.6, Z0, Z1, M.brick);
    seg(X0, X1, 4.6, 4.85, Z0, Z1, M.roof);                          // roof
    seg(X0, X1, 4.85, 5.6, Z0, Z0 + 0.2, M.brick);                                 // parapets
    seg(X0, X1, 4.85, 5.6, Z1 - 0.2, Z1, M.brick);
    seg(X0, X0 + 0.2, 4.85, 5.6, Z0, Z1, M.brick);
    seg(X1 - 0.2, X1, 4.85, 5.6, Z0, -93.6, M.concrete);
    seg(X1 - 0.2, X1, 4.85, 5.6, -92.3, Z1, M.brick);                              // east parapet gap
    stairFlight(44.7, 0, -88.4, 0, -1, 14, 0.329, 0.33, 1.2, M.metal);
    seg(44.05, 45.35, 4.6, 4.85, -93.7, -92.3, M.metal);             // arrival, flush with roof
    box(33, 5.35, -92, 1.5, 1.0, 1.4, M.metal);                          // roof water tank base
    cyl(33, 6.35, -92, 0.9, 1.0, M.metal);
  })();
  // sniper footbridge over both tracks at x 74
  stairFlight(74, 0, -75.8, 0, -1, 13, 0.331, 0.33, 1.5, M.metal);
  stairFlight(74, 0, -96.2, 0, 1, 13, 0.331, 0.33, 1.5, M.metal);
  seg(73.2, 74.8, 4.3, 4.55, -91.9, -80.2, M.metal);
  seg(73.2, 73.32, 4.55, 5.5, -91.9, -80.2, M.trim);
  seg(74.68, 74.8, 4.55, 5.5, -91.9, -80.2, M.trim);
  lamp(68, -78, 'n'); lamp(24, -81.5, 'n');
  crates(88, -78); barrel(84, -77, false);
};
