/* Districts: NORTH band (z -96..-72) — Airport (west) + Railway Station (east).
   Uses the shared T build contract from environment/world.js. All stairs reuse
   the proven <=0.36 rise pattern; the headless validator polices placement. */
World._buildPart4 = function (T) {
  'use strict';
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight,
    facade = T.facade, win = T.win, crates = T.crates, lamp = T.lamp,
    barrel = T.barrel, container = T.container, M = T.M, rnd = T.rnd, scene = T.scene,
    sedan = T.sedan, van = T.van;
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
    facade('z', Z0, Z0 + TT, X0, X1, 0, 3.4, M.facadeTeal, [win(-30, 1.3, 1.4, 1.2), win(-24, 1.3, 1.4, 1.2)]);
    seg(X0, X0 + TT, 0, 3.4, Z0, Z1, M.plaster);
    seg(X1 - TT, X1, 0, 3.4, Z0, Z1, M.facadeAmber);
    // floor-2 slab with stair hole along the east wall
    seg(X0, -21.6, 3.4, 3.6, Z0, Z1, M.concrete);
    seg(-21.6, X1, 3.4, 3.6, Z0, -85, M.concrete);
    seg(-21.6, X1, 3.4, 3.6, -81, Z1, M.concrete);
    // floor-2 walls + windows
    facade('z', Z1 - TT, Z1, X0, X1, 3.6, 6.9, M.plaster, [win(-31, 4.9, 1.3, 1.2), win(-27, 4.9, 1.3, 1.2), win(-23, 4.9, 1.3, 1.2)]);
    facade('z', Z0, Z0 + TT, X0, X1, 3.6, 6.9, M.facadeRose, [win(-29, 4.9, 1.4, 1.2)]);
    seg(X0, X0 + TT, 3.6, 6.9, Z0, Z1, M.plaster);
    seg(X1 - TT, X1, 3.6, 6.9, Z0, Z1, M.facadeIndigo);
    // roof with stair hole + parapet
    seg(X0, -21.6, 6.9, 7.2, Z0, Z1, M.roof);
    seg(-21.6, X1, 6.9, 7.2, Z0, -88.4, M.concrete);
    seg(-21.6, X1, 6.9, 7.2, -84.6, Z1, M.roof);
    seg(X0, X1, 7.2, 8.0, Z0, Z0 + 0.22, M.plaster);
    seg(X0, X1, 7.2, 8.0, Z1 - 0.22, Z1, M.facadeOlive);
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
    seg(-15.3, -11.7, 6.9, 8.0, -86.8, -86.6, M.facadeTeal);
    seg(-15.3, -11.7, 6.9, 8.0, -83.4, -83.2, M.plaster);
    seg(-15.3, -15.1, 6.9, 8.0, -86.8, -83.2, M.facadeAmber);
    seg(-11.9, -11.7, 6.9, 8.0, -86.8, -83.2, M.plaster);
    // switchback stairs from the south (lane x -14.15..-12.95)
    stairFlight(-13.55, 0, -76.0, 0, -1, 12, 0.29, 0.33, 1.2, M.metal);
    seg(-14.2, -12.9, 3.48, 3.7, -81.6, -80.0, M.metal);            // landing
    stairFlight(-13.55, 3.7, -80.3, 0, -1, 10, 0.32, 0.33, 1.2, M.metal);
    // arrival lands flush on the platform south edge (top 6.9)
    lamp(-18, -78, 'n');
  })();

  /* ==========================================================================
     SECTOR 7 CENTRAL — RAILWAY DISTRICT      x 18..94, z -96..-64   (v7.6)
     ==========================================================================
     The old layout was three separate mistakes stacked on each other: the
     station house sat NORTH of the tracks with its south wall driven 1.4 m
     into the ballast; the passenger platform sat on the far SOUTH side, two
     tracks away; and the parked train was on the north freight road, so it
     was neither boardable nor next to anything. Nothing about it read as a
     station, and 30 m of the band was bare ballast nobody had a reason to
     cross.

     Rebuilt as a real station, laid out north to south:

       z -96.0 .. -90.0   FREIGHT YARD   engine shed, maintenance hut,
                                          container road, water tower (landmark)
       z -90.0 .. -86.4   TRACK 2        freight road
       z -86.2 .. -82.6   ISLAND PLATFORM (x 26..68) + half canopy
       z -82.4 .. -78.8   TRACK 1        passenger road, express parked on it
       z -78.6 .. -75.4   SIDE PLATFORM  (x 24..70)
       z -75.4 .. -64.0   STATION HALL (3 levels) + forecourt

     Why a player comes here, by level:
       GROUND   forecourt -> hall -> north doors -> side platform. One clean
                spine, always contested, always has an exit.
       TRAIN    the middle coach is WALKABLE with its floor at platform height
                and doors on both sides, so the train is a covered crossing
                between the two platforms rather than a wall. Short sightlines,
                two exits per side, brutal at close range.
       BRIDGE   the footbridge at x 76 crosses everything at 4.6 m. Its
                parapets are GAPPED, so standing on it is exposed from the
                station roof and both platforms — it is a fast route, not a
                nest.
       ROOFS    hall roof (8.25) sees the forecourt and the side platform but
                the canopy blocks the island platform, and the engine shed roof
                (4.0) looks straight back at the hall roof. Neither dominates.

     Callouts this layout is designed to produce: "water tower", "the coach",
     "green canopy", "shed roof", "hall roof", "footbridge".
     ====================================================================== */

  var RAIL = {
    T2: -88.2,          // freight road centreline
    T1: -80.6,          // passenger road centreline
    ISL_N: -86.2, ISL_S: -82.6,   // island platform faces
    SID_N: -78.6, SID_S: -75.4,   // side platform faces
    PLAT: 1.05                    // both platform decks
  };

  // ---- permanent way: ballast beds + rails -------------------------------
  function railRoad(cz) {
    seg(18, 94, 0, 0.16, cz - 1.8, cz + 1.8, M.dirt);                       // ballast
    [cz - 0.72, cz + 0.72].forEach(function (rz) {
      seg(18, 94, 0.16, 0.26, rz - 0.075, rz + 0.075, M.metal, NC);         // rail
    });
    for (var sx = 19; sx < 94; sx += 2.4) {                                  // sleepers
      seg(sx, sx + 0.55, 0.12, 0.18, cz - 1.35, cz + 1.35, M.wood, NC);
    }
  }
  railRoad(RAIL.T2);
  railRoad(RAIL.T1);

  /* ---- ISLAND PLATFORM (x 26..68) ---------------------------------------
     Ramps start clear of the deck footprint and the last tread lands flush on
     top of it — the failure that made the v5.3 platform unclimbable. */
  seg(26, 68, 0, RAIL.PLAT, RAIL.ISL_N, RAIL.ISL_S, M.concrete);
  seg(26, 68, RAIL.PLAT, RAIL.PLAT + 0.04, RAIL.ISL_N, RAIL.ISL_N + 0.35, M.white, NC);  // safety line
  seg(26, 68, RAIL.PLAT, RAIL.PLAT + 0.04, RAIL.ISL_S - 0.35, RAIL.ISL_S, M.white, NC);
  stairFlight(24.32, 0, -84.4, 1, 0, 4, 0.2625, 0.42, 2.4, M.concrete);      // west ramp -> x 26.0
  stairFlight(69.68, 0, -84.4, -1, 0, 4, 0.2625, 0.42, 2.4, M.concrete);     // east ramp -> x 68.0

  /* Half canopy over the NORTH lane only. Covering the whole deck would make
     the platform a tunnel; covering half splits it into a shaded lane and an
     exposed lane, and denies the hall roof a clean look at the north side. */
  [30, 38, 46, 54, 62].forEach(function (cx) {
    cyl(cx, RAIL.PLAT + 1.28, RAIL.ISL_N + 0.7, 0.14, 2.55, M.railGreen);
  });
  seg(27, 63.7, 3.62, 3.86, RAIL.ISL_N, RAIL.ISL_N + 2.0, M.railGreen);     // canopy deck (walkable)
  /* Two WIDE bays reach almost to the platform's south edge. They are the only
     two places you can cross from the canopy onto the train roofs (loco 3.80,
     coach 3.77) — deliberate, contested crossings rather than a continuous
     roof-run, and the reason the train roofs are not fake architecture. */
  seg(27, 33, 3.62, 3.86, RAIL.ISL_N + 2.0, RAIL.ISL_S - 0.2, M.railGreen);
  seg(44, 52, 3.62, 3.86, RAIL.ISL_N + 2.0, RAIL.ISL_S - 0.2, M.railGreen);
  [30, 48].forEach(function (cx) {
    cyl(cx, RAIL.PLAT + 1.28, RAIL.ISL_S - 0.55, 0.14, 2.55, M.railGreen);
  });
  seg(27, 63.7, 3.86, 4.34, RAIL.ISL_N - 0.06, RAIL.ISL_N + 0.06, M.railGreen, NC); // north fascia
  /* The canopy is a real perch, so it gets a real way up: a maintenance stair
     at its east end, entirely OUTSIDE the canopy footprint so there is no
     headroom conflict. Nothing in this map is allowed to look climbable and
     not be — and nothing is allowed to be a perch without counterplay. From
     3.86 you are wide open to the footbridge (4.60) and the hall roof (8.25),
     and a 1.6 m hop lands you on the coach roof at 3.77. */
  stairFlight(67.0, RAIL.PLAT, -85.2, -1, 0, 10, 0.281, 0.34, 1.2, M.railGreen);
  seg(63.4, 67.2, 3.86, 4.34, RAIL.ISL_N - 0.06, RAIL.ISL_N + 0.06, M.railGreen, NC);
  // platform furniture — cover that also reads as a station
  [32, 44, 58].forEach(function (bx) {
    box(bx, RAIL.PLAT + 0.32, -84.4, 1.9, 0.62, 0.8, M.wood);                // bench
  });
  [35, 51, 64].forEach(function (bx) {
    box(bx, RAIL.PLAT + 0.55, RAIL.ISL_S - 0.9, 1.5, 1.1, 1.0, M.rust);      // luggage trolley
  });
  box(46, RAIL.PLAT + 2.2, RAIL.ISL_N + 0.55, 3.2, 0.9, 0.14, M.dark, NC);   // departure board
  box(46, RAIL.PLAT + 2.2, RAIL.ISL_N + 0.62, 2.9, 0.62, 0.04, M.amberGlow, NC);

  /* ---- SIDE PLATFORM (x 24..70) ---------------------------------------- */
  seg(24, 70, 0, RAIL.PLAT, RAIL.SID_N, RAIL.SID_S, M.concrete);
  seg(24, 70, RAIL.PLAT, RAIL.PLAT + 0.04, RAIL.SID_N, RAIL.SID_N + 0.35, M.white, NC);
  stairFlight(22.32, 0, -77.0, 1, 0, 4, 0.2625, 0.42, 2.4, M.concrete);      // west ramp -> x 24.0
  stairFlight(71.68, 0, -77.0, -1, 0, 4, 0.2625, 0.42, 2.4, M.concrete);     // east ramp -> x 70.0
  [28, 62].forEach(function (bx) {
    box(bx, RAIL.PLAT + 0.32, -77.0, 1.9, 0.62, 0.8, M.wood);
  });
  crates(66, -77.3); barrel(58.5, -76.4, false);

  /* ---- THE EXPRESS: parked on track 1, spanning platform to platform -----
     Deliberately 4.0 m wide so the body meets BOTH platform faces with no
     gap. The middle coach has a walkable interior at deck height (1.05) with
     doors on both sides: the train is a crossing, not a wall. */
  (function () {
    var N = RAIL.ISL_S, S = RAIL.SID_N;          // -82.6 .. -78.6
    var FL = RAIL.PLAT;                          // interior floor top
    function bogies(x0, x1) {
      [x0 + 1.6, x1 - 1.6].forEach(function (bx) {
        box(bx, 0.42, RAIL.T1, 2.2, 0.52, 2.4, M.dark, { collide: false });
      });
    }
    // locomotive (solid)
    box(25.5, 2.05, RAIL.T1, 9.0, 3.5, 3.4, M.dark);
    box(29.4, 3.95, RAIL.T1, 2.6, 0.35, 2.9, M.dark, { collide: false });
    box(21.6, 1.35, RAIL.T1, 1.4, 0.5, 3.0, M.signalRed, { collide: false });
    bogies(21, 30);

    // WALKABLE COACH  x 34..50
    var X0 = 34, X1 = 50, TT = 0.22;
    seg(X0, X1, 0.3, FL, N, S, M.maroon);                              // underframe
    seg(X0, X1, FL, FL + 0.05, N, S, M.wood);                          // floor
    // long walls with two door gaps a side; windows above the doors
    [[N, N + TT], [S - TT, S]].forEach(function (w) {
      [[X0, 37.6], [39.4, 43.6], [45.4, X1]].forEach(function (r) {
        seg(r[0], r[1], FL, FL + 2.5, w[0], w[1], M.maroon);
      });
      [[37.6, 39.4], [43.6, 45.4]].forEach(function (d) {              // over-door panel
        seg(d[0], d[1], FL + 2.05, FL + 2.5, w[0], w[1], M.maroon);
      });
      [[35.2, 36.8], [40.6, 42.4], [46.4, 48.0]].forEach(function (q) {  // windows
        seg(q[0], q[1], FL + 1.35, FL + 2.05, w[0] - 0.03, w[1] + 0.03, M.carGlass, NC);
      });
    });
    seg(X0, X0 + TT, FL, FL + 2.5, N, S, M.maroon);                    // ends
    seg(X1 - TT, X1, FL, FL + 2.5, N, S, M.maroon);
    seg(X0, X1, FL + 2.5, FL + 2.72, N, S, M.metal);                   // roof
    bogies(X0, X1);
    // second coach (solid cover, breaks the platform into segments)
    seg(50, 67, 0.3, FL + 2.5, N, S, M.maroon);   // butts coach 1 so the roofs connect
    seg(50, 67, FL + 2.5, FL + 2.72, N, S, M.metal);
    [[54.5, 56.1], [58.2, 59.8], [62.0, 63.6], [65.0, 66.6]].forEach(function (q) {
      seg(q[0], q[1], FL + 1.35, FL + 2.05, N - 0.03, N + 0.05, M.carGlass, NC);
      seg(q[0], q[1], FL + 1.35, FL + 2.05, S - 0.05, S + 0.03, M.carGlass, NC);
    });
    bogies(53, 67);   // bogies stay under the body, not at the coupling
  })();

  /* ---- STATION HALL  x 32..52, z -75.4..-67.0 ---------------------------
     Three levels. The concourse floor is at PLATFORM height, so the north
     doors open straight onto the side platform and the south entrance climbs
     from the forecourt — which is how a real station resolves the same 1 m.
     F1 1.05 | F2 4.95 | roof 8.25. */
  (function () {
    var X0 = 32, X1 = 52, Z0 = -75.4, Z1 = -67.0, TT = 0.3;
    var F1 = RAIL.PLAT, F2 = 4.95, RF = 8.25;

    seg(X0, X1, 0, F1, Z0, Z1, M.concrete);                            // raised concourse slab
    stairFlight(42, 0, -65.32, 0, -1, 4, 0.2625, 0.42, 5.0, M.concrete);   // forecourt -> concourse

    // ground walls: brick plinth, cream above. North wall has the platform doors.
    function band(zc0, zc1, plane, u0, u1, openings) {
      facade(plane, zc0, zc1, u0, u1, F1, F1 + 1.15, M.brick, openings);
      facade(plane, zc0, zc1, u0, u1, F1 + 1.15, F1 + 2.9, M.cream, openings);
    }
    band(Z0, Z0 + TT, 'z', X0, X1,
      [{ u0: 39.5, u1: 44.5, v0: F1, v1: F1 + 2.5 }, win(34.5, F1 + 1.2, 2.0, 1.4), win(47.5, F1 + 1.2, 2.0, 1.4)]);
    band(Z1 - TT, Z1, 'z', X0, X1,
      [{ u0: 39.5, u1: 44.5, v0: F1, v1: F1 + 2.5 }, win(34.5, F1 + 1.2, 2.0, 1.4), win(47.5, F1 + 1.2, 2.0, 1.4)]);
    band(X0, X0 + TT, 'x', Z0, Z1, [win(-73.5, F1 + 1.2, 1.8, 1.4), win(-70.0, F1 + 1.2, 1.8, 1.4)]);
    band(X1 - TT, X1, 'x', Z0, Z1, [win(-73.5, F1 + 1.2, 1.8, 1.4), win(-70.0, F1 + 1.2, 1.8, 1.4)]);
    seg(X0, X1, F1 + 2.9, F1 + 3.1, Z0, Z1, M.railGreen, { collide: false }); // string course

    /* F2 slab, holed over the EAST stair lane (x 49.4..51.6). */
    seg(X0, 49.4, F2 - 0.3, F2, Z0, Z1, M.concrete);
    seg(51.6, X1, F2 - 0.3, F2, Z0, Z1, M.concrete);
    seg(49.4, 51.6, F2 - 0.3, F2, Z0, -73.6, M.concrete);
    seg(49.4, 51.6, F2 - 0.3, F2, -68.8, Z1, M.concrete);
    /* Flight starts at z -69.0, not -68.0: at -68.0 there was only 0.7 m of
       standing room between the bottom tread and the south wall, so the ascent
       walker was squeezed against the wall and pushed back out of the hall. */
    stairFlight(50.5, F1, -69.0, 0, -1, 13, 0.30, 0.34, 1.8, M.concrete);  // F1 -> F2 (4.95)

    // F2 walls: long window bands both sides — this is the floor that rewards climbing
    facade('z', Z0, Z0 + TT, X0, X1, F2, F2 + 3.0, M.cream,
      [win(34, F2 + 0.8, 4.0, 1.7), win(40, F2 + 0.8, 4.0, 1.7), win(46, F2 + 0.8, 4.0, 1.7)]);
    facade('z', Z1 - TT, Z1, X0, X1, F2, F2 + 3.0, M.cream,
      [win(34, F2 + 0.8, 4.0, 1.7), win(46, F2 + 0.8, 4.0, 1.7)]);
    facade('x', X0, X0 + TT, Z0, Z1, F2, F2 + 3.0, M.cream, [win(-74, F2 + 0.8, 2.4, 1.6), win(-70, F2 + 0.8, 2.4, 1.6)]);
    facade('x', X1 - TT, X1, Z0, Z1, F2, F2 + 3.0, M.cream, [win(-74, F2 + 0.8, 2.4, 1.6), win(-70, F2 + 0.8, 2.4, 1.6)]);

    /* roof, holed over the WEST stair lane (x 32.4..34.6) */
    seg(34.6, X1, RF - 0.3, RF, Z0, Z1, M.roof);
    seg(X0, 34.6, RF - 0.3, RF, Z0, -72.6, M.roof);
    seg(X0, 34.6, RF - 0.3, RF, -68.5, Z1, M.roof);
    stairFlight(33.5, F2, -72.6, 0, 1, 11, 0.30, 0.34, 1.8, M.concrete);   // F2 -> roof (8.25)

    // parapet, gapped on the north face so the roof cannot camp the platform safely
    seg(X0, X1, RF, RF + 0.85, Z1 - 0.22, Z1, M.cream);
    seg(X0, 38, RF, RF + 0.85, Z0, Z0 + 0.22, M.cream);
    seg(46, X1, RF, RF + 0.85, Z0, Z0 + 0.22, M.cream);
    seg(X0, X0 + 0.22, RF, RF + 0.85, Z0, Z1, M.cream);
    seg(X1 - 0.22, X1, RF, RF + 0.85, Z0, Z1, M.cream);
    // clock gable — the landmark you navigate the whole district by
    box(42, RF + 1.5, Z1 - 0.35, 3.4, 1.3, 0.3, M.cream);
    cyl(42, RF + 1.5, Z1 - 0.55, 1.0, 0.16, M.white, { collide: false });
    box(33.6, RF + 0.9, -74.2, 1.4, 1.8, 1.4, M.metal);                 // stairhead housing
    lamp(30, -71, 'e'); lamp(54, -71, 'w');
  })();

  /* ---- FORECOURT  z -75.4..-64 ------------------------------------------
     Was open dirt nobody crossed. Now the district's south approach: apron,
     taxi rank, shelter, and a lane west toward the avenue. */
  seg(22, 72, 0.02, 0.06, -75.4, -66.0, M.concrete, NC);
  seg(16, 72, 0.02, 0.055, -66.0, -63.6, M.asphalt, NC);                 // approach lane
  seg(22, 72, 0.06, 0.10, -66.2, -66.0, M.roadPaintY, NC);
  box(58, 1.35, -70.5, 0.16, 2.7, 0.16, M.trim); box(64, 1.35, -70.5, 0.16, 2.7, 0.16, M.trim);
  seg(57.6, 64.4, 2.7, 2.95, -71.6, -69.4, M.railGreen);                 // taxi shelter roof
  box(61, 0.45, -70.4, 3.4, 0.9, 0.5, M.wood);                           // shelter bench
  box(56.4, 0.9, -70.5, 1.2, 1.8, 2.2, M.sidewalk);                      // planter: step to the shelter roof
  sedan(56, -73.5, false, 1, false); sedan(66, -72.6, true, 3, false);
  van(26, -71.5, false);
  [[24, -68], [70, -68]].forEach(function (p) { cyl(p[0], 1.6, p[1], 0.13, 3.2, M.trim); });
  lamp(24, -70, 'e'); lamp(70, -70, 'w');

  /* ---- FREIGHT YARD  z -96..-90 ----------------------------------------- */
  seg(18, 94, 0.02, 0.055, -96, -90.2, M.concrete, NC);

  // engine shed (enterable, open south face, roof reachable by the west stair)
  (function () {
    var X0 = 26, X1 = 46, Z0 = -95.6, Z1 = -90.2, TT = 0.3, H = 3.7;
    seg(X0, X1, 0, H, Z0, Z0 + TT, M.steelBlue);                          // north
    seg(X0, X0 + TT, 0, H, Z0, Z1, M.steelBlue);                          // west
    seg(X1 - TT, X1, 0, H, Z0, Z1, M.steelBlue);                          // east
    seg(X0, 30, 0, H, Z1 - TT, Z1, M.steelBlue);                          // south, two door bays
    seg(35, 39, 0, H, Z1 - TT, Z1, M.steelBlue);
    seg(44, X1, 0, H, Z1 - TT, Z1, M.steelBlue);
    seg(X0, X1, H, H + 0.3, Z0, Z1, M.roof);                              // roof top = 4.0
    seg(X0, X1, H + 0.3, H + 0.75, Z0, Z0 + 0.2, M.rust, NC);             // ridge trim
    // inside: inspection pit lip, spare bogies, work bench
    seg(31, 43, 0, 0.22, -94.4, -91.6, M.dark, NC);
    box(33, 0.55, -93.0, 2.4, 1.1, 1.6, M.rust); box(41, 0.55, -92.2, 2.4, 1.1, 1.6, M.rust);
    box(28.5, 0.5, -94.6, 3.0, 1.0, 0.9, M.wood);
    crates(37, -94.6);
    // west stair to the roof + an arrival bridge that is clear of the last tread
    stairFlight(24.95, 0, -90.6, 0, -1, 13, 0.3077, 0.34, 1.5, M.metal);
    seg(24.2, 26.4, 3.85, 4.0, -95.6, -95.02, M.metal);
    seg(24.2, 26.4, 4.0, 4.75, -95.68, -95.6, M.trim, NC);                // fall guard
  })();

  // maintenance hut (brick, one room, loot)
  (function () {
    var X0 = 52, X1 = 62, Z0 = -95.4, Z1 = -90.8, TT = 0.28;
    facade('z', Z1 - TT, Z1, X0, X1, 0, 3.1, M.brick,
      [{ u0: 55.5, u1: 57.5, v0: 0, v1: 2.3 }, win(59.4, 1.5, 1.5, 1.2)]);
    facade('z', Z0, Z0 + TT, X0, X1, 0, 3.1, M.brick, [win(54.5, 1.5, 1.5, 1.2), win(59, 1.5, 1.5, 1.2)]);
    seg(X0, X0 + TT, 0, 3.1, Z0, Z1, M.brick);
    seg(X1 - TT, X1, 0, 3.1, Z0, Z1, M.brick);
    seg(X0 - 0.25, X1 + 0.25, 3.1, 3.4, Z0 - 0.25, Z1 + 0.25, M.railGreen);
    box(53.6, 0.55, -94.4, 1.2, 1.1, 1.6, M.metal); box(60.4, 0.5, -93.2, 1.6, 1.0, 1.2, M.rust);
    barrel(63.5, -92.5, false);
  })();

  // container road + permanent-way spoil
  /* Containers stay WEST of x 70: the footbridge stair lane is x 75.2..76.8 and
     a container roof at 2.6 m sat straight across the north flight. */
  container(66, -94.0, false, M.contRed, false);
  container(66, -91.4, false, M.contBlue, true);
  container(72, -94.0, false, M.contGreen, false);
  box(82, 0.45, -94.4, 5.0, 0.9, 1.4, M.wood);                            // sleeper stack
  box(82, 1.15, -94.4, 4.4, 0.5, 1.2, M.wood);
  // step stacks so the container roofs (2.60) are honestly reachable
  box(70.4, 0.45, -94.0, 1.6, 0.9, 2.0, M.wood); box(70.3, 1.2, -94.0, 1.3, 0.6, 1.7, M.wood);
  box(70.4, 1.72, -94.0, 1.0, 0.44, 1.3, M.rust);
  box(62.6, 0.45, -91.4, 1.6, 0.9, 2.0, M.wood); box(62.7, 1.2, -91.4, 1.3, 0.6, 1.7, M.wood);
  box(62.6, 1.72, -91.4, 1.0, 0.44, 1.3, M.rust);
  crates(88, -92.4); barrel(86.5, -95, true);

  /* Water tower — the district landmark, visible from the whole east half.
     Deliberately NOT climbable and deliberately has no ladder geometry, so it
     never reads as an access route it cannot honour. */
  [[84.6, -93.4], [88.4, -93.4], [84.6, -89.9], [88.4, -89.9]].forEach(function (p) {
    cyl(p[0], 3.1, p[1], 0.17, 6.2, M.rust);
  });
  seg(84.2, 88.8, 6.2, 6.45, -93.8, -89.5, M.rust);
  cyl(86.5, 8.1, -91.6, 2.5, 3.3, M.steelBlue);
  cyl(86.5, 9.95, -91.6, 2.5, 0.4, M.rust, { collide: false });
  box(86.5, 6.6, -91.6, 0.5, 0.5, 0.5, M.dark, { collide: false });

  /* ---- FOOTBRIDGE at x 76: crosses both roads at 4.6 --------------------
     Gapped parapets. A bridge you can be shot on is a route; a bridge you
     cannot be shot on is a sniper nest. */
  (function () {
    var CX = 76, DK = 4.6, W = 1.6;
    stairFlight(CX, 0, -73.0, 0, -1, 16, 0.2875, 0.34, W, M.metal);        // south -> z -78.44
    stairFlight(CX, 0, -96.4, 0, 1, 16, 0.2875, 0.34, W, M.metal);         // north -> z -90.96
    seg(CX - W / 2, CX + W / 2, DK - 0.25, DK, -91.0, -78.44, M.metal);
    // parapets with two deliberate gaps each side
    [[-91.0, -88.4], [-86.0, -83.0], [-80.6, -78.44]].forEach(function (r) {
      seg(CX - W / 2, CX - W / 2 + 0.12, DK, DK + 0.95, r[0], r[1], M.railGreen, NC);
      seg(CX + W / 2 - 0.12, CX + W / 2, DK, DK + 0.95, r[0], r[1], M.railGreen, NC);
    });
    lamp(79.5, -84.5, 'w');
  })();

  /* ---- signal gantry over track 1 — storytelling that is also a landmark */
  cyl(71.5, 2.6, -79.3, 0.16, 5.2, M.trim);
  seg(69.6, 73.4, 5.2, 5.45, -79.5, -79.1, M.trim);
  box(70.4, 4.55, -79.3, 0.45, 1.3, 0.45, M.dark, { collide: false });
  box(70.4, 4.9, -79.05, 0.3, 0.3, 0.06, M.signalRed, { collide: false });
  box(70.4, 4.4, -79.05, 0.3, 0.3, 0.06, M.signalGreen, { collide: false });
  box(72.6, 4.55, -79.3, 0.45, 1.3, 0.45, M.dark, { collide: false });
  box(72.6, 4.9, -79.05, 0.3, 0.3, 0.06, M.signalGreen, { collide: false });

  lamp(30, -87.4, 'n'); lamp(58, -87.4, 'n'); lamp(44, -77.2, 's'); lamp(34, -91.4, 'n');
};
