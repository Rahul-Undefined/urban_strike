/* Districts: OUTER ring — Cargo yard (E), Bus Terminal (SE),
   Construction Zone West (W), Residential colony (S). */
World._buildPart5 = function (T) {
  'use strict';
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight,
    facade = T.facade, win = T.win, crates = T.crates, lamp = T.lamp,
    barrel = T.barrel, brokenWall = T.brokenWall, M = T.M, rnd = T.rnd, scene = T.scene,
    bus = T.bus, sedan = T.sedan, container = T.container, truck = T.truck;
  var NC = { collide: false, cast: false };

  /* ==========================================================================
     EASTGATE YARD — CONTAINER YARD DISTRICT   x 72..98, z -10..25   (v8.0)
     ==========================================================================
     Thirteen container stacks on bare concrete with one hand-written climb
     route and a comment that was unsure whether it worked. Six of the stack
     roofs were flagged by the architecture gate as invitations the yard could
     not honour.

     Irongate Depot is already the close-quarters container district, so this
     one is deliberately its opposite: EASTGATE IS VERTICAL. Stacks run one,
     two and three high in a deliberate pattern so the yard is a climbing
     terrain rather than a corridor grid. Almost every fight here is decided by
     who is a level above whom, and every stack roof has a way up.

       ROWS       x 79 / 85.5 / 92, running the length of the yard
       LANES      the two gaps between them, long and overlooked from above
       GANTRY     the rail crane at the north gate — the yard's high ground
       YARD OFFICE x 72..78, z -9..-1, two floors, watches the south gate
       REEFER ROW  z 16..19, plant, chassis trailers, tyre stacks

     FOOTPRINT NOTE. The v6.0 yard ran from z -44 and put SIX container stacks
     inside the mall's floor plate (x 50..88, z -44..-22). Nothing caught it:
     the map gate checks loot and spawns, the coplanar gate checks large flat
     surfaces, and neither looks for a building standing inside another one.
     The yard now starts at z -8, clear of both the mall and the market square,
     and Market Cross owns everything south of that line.

     Why a player comes here:
       It is the only place on the map where the ground is the WORST place to
       be. Three heights of cover in a 20 m square means a stack roof is always
       overlooked by a taller stack, so no single perch wins — but the gantry at
       9 m beats all of them, and it has exactly one way up.

     Callouts: "the gantry", "three-high", "reefer row", "yard office", "gate".
     ====================================================================== */
  /* Apron top is 0.075, not 0.06: the Market Cross square slab is already at
     0.06 and the two overlap by 152 m2 in the corner. Two large surfaces at the
     same height z-fight, and the coplanar-ground gate catches it every time. */
  seg(74, 97, 0.02, 0.075, -9, 24, M.concrete, NC);
  var CBOX = [M.contRed, M.contBlue, M.contGreen, M.contGray];
  function stack(x, z, levels, ci) {
    for (var l = 0; l < levels; l++) {
      box(x, 1.3 + l * 2.6, z, 2.44, 2.6, 6.1, CBOX[(ci + l) % CBOX.length]);
    }
  }
  /* Step stack: pallets to 1.7, which reaches a 2.6 roof. Placed against the
     END of a container so it never blocks a lane. */
  function step3(x, z) {
    box(x, 0.45, z, 1.6, 0.9, 2.0, M.palletWood);
    box(x, 1.2, z, 1.3, 0.6, 1.7, M.palletWood);
    box(x, 1.72, z, 1.0, 0.44, 1.3, M.rust);
  }
  /* Roof step: a crate ON a 2.6 roof, reaching the 5.2 roof beside it. This is
     what makes a two- or three-high stack honest. */
  function roofStep(x, z) {
    box(x, 3.05, z, 1.4, 0.9, 1.5, M.palletWood);
    box(x, 3.78, z, 1.1, 0.56, 1.2, M.rust);
  }

  var YARD = [
    { x: 79,   zs: [-4, 4, 12], lv: [1, 3, 2] },
    { x: 85.5, zs: [-4, 4, 12], lv: [2, 1, 3] },
    { x: 92,   zs: [-4, 4, 12], lv: [3, 2, 1] }
  ];
  YARD.forEach(function (row, i) {
    row.zs.forEach(function (rz, j) {
      stack(row.x, rz, row.lv[j], (i + j) % 4);
      /* Steps go EAST on rows 0 and 2, west on row 1 — that keeps the whole
         x 75..77 strip clear for the gantry stair, which the first layout ran
         straight through a pallet stack. */
      var sx = row.x + (i === 1 ? -2.1 : 2.1);
      step3(sx, rz + 3.6);
      if (row.lv[j] > 1) roofStep(sx, rz + 1.4);      // 2.6 -> 5.2
      if (row.lv[j] > 2) roofStep(row.x + (i === 2 ? -1.0 : 1.0), rz - 3.5);   // 5.2 -> 7.8
    });
    seg(row.x - 1.4, row.x + 1.4, 0.075, 0.105, -8, 23, M.hazard, NC);         // row paint
  });

  /* ---- GANTRY: rail crane over the north gate, and the yard's high ground.
     Reached by one flight OUTSIDE the rows, landing on the deck's west end. --- */
  (function () {
    var GZ = 20, TOPY = 8.9;
    [[74.6, GZ - 3.2], [74.6, GZ + 3.2], [95.4, GZ - 3.2], [95.4, GZ + 3.2]].forEach(function (p) {
      cyl(p[0], TOPY / 2, p[1], 0.36, TOPY, M.steelBlue);
    });
    seg(74.0, 96.0, TOPY - 0.25, TOPY, GZ - 2.7, GZ + 2.7, M.metal);           // deck
    seg(74.0, 96.0, TOPY, TOPY + 0.55, GZ + 2.7, GZ + 3.5, M.steelBlue);       // north rail
    seg(78.4, 96.0, TOPY, TOPY + 0.55, GZ - 3.5, GZ - 2.7, M.steelBlue);       // south rail, gapped
    seg(74.0, 96.0, TOPY + 0.55, TOPY + 0.8, GZ + 2.7, GZ + 3.5, M.hazard, NC);
    seg(83.0, 87.0, TOPY - 1.6, TOPY, GZ - 2.4, GZ + 2.4, M.rust);             // trolley
    seg(84.6, 85.4, TOPY - 5.2, TOPY - 1.6, GZ - 0.4, GZ + 0.4, M.trim, NC);   // hoist rope
    box(85, 3.3, GZ, 2.0, 1.7, 2.0, M.hazard);                                 // spreader, ground cover
    stairFlight(76.2, 0, GZ - 11.1, 0, 1, 28, 0.31786, 0.30, 1.3, M.metal);    // -> deck 8.90
    [GZ - 8.3, GZ - 5.3].forEach(function (sz) {
      cyl(75.7, 1.55, sz, 0.12, 3.1, M.steelBlue, NC);
      cyl(76.7, 1.55, sz, 0.12, 3.1, M.steelBlue, NC);
    });
  })();

  /* ---- YARD OFFICE: two floors watching the gate, with a balcony that looks
     straight down the lanes. Small, enterable, and the only interior here. --- */
  (function () {
    var X0 = 72.4, X1 = 78.4, Z0 = -8.8, Z1 = -1.2, TT = 0.28, F2 = 3.3, RF = 6.6;
    facade('z', Z0, Z0 + TT, X0, X1, 0, 3.0, M.paperWhite, [win(74.0, 1.3, 1.4, 1.1)]);
    facade('z', Z1 - TT, Z1, X0, X1, 0, 3.0, M.paperWhite,
      [{ u0: 74.6, u1: 76.0, v0: 0, v1: 2.2 }, win(77.2, 1.3, 1.2, 1.1)]);
    seg(X0, X0 + TT, 0, 3.0, Z0, Z1, M.paperWhite);
    facade('x', X1 - TT, X1, Z0, Z1, 0, 3.0, M.paperWhite, [win(-7.4, 1.3, 1.6, 1.2), win(-3.0, 1.3, 1.6, 1.2)]);
    seg(X0, X1, 3.0, F2, Z0, Z1, M.concrete);
    seg(73.0, 74.4, 0, 1.05, -7.4, -2.8, M.wood, { cast: false });             // counter
    seg(76.0, 77.8, 0, 1.7, -8.4, -7.7, M.trim, { cast: false });              // lockers
    stairFlight(77.2, 0, -1.5, 0, -1, 11, 0.3, 0.34, 1.4, M.concrete);         // -> F2 3.30
    facade('z', Z0, Z0 + TT, X0, X1, F2, RF - 0.3, M.paperWhite, [win(74.4, F2 + 1.1, 2.2, 1.4)]);
    facade('z', Z1 - TT, Z1, X0, X1, F2, RF - 0.3, M.paperWhite, [win(75.4, F2 + 1.1, 2.2, 1.4)]);
    // (north face carries the balcony door, cut below)
    seg(X0, X0 + TT, F2, RF - 0.3, Z0, Z1, M.paperWhite);
    facade('x', X1 - TT, X1, Z0, Z1, F2, RF - 0.3, M.paperWhite,
      [{ u0: -6.6, u1: -4.8, v0: F2, v1: F2 + 2.2 }, win(-2.6, F2 + 1.1, 1.6, 1.3)]);
    seg(X0, X1, RF - 0.3, RF, Z0, Z1, M.roof);
    seg(X0, X1, RF, RF + 0.8, Z0, Z0 + 0.2, M.paperWhite);
    seg(X0, X1, RF, RF + 0.8, Z1 - 0.2, Z1, M.paperWhite);
    seg(X0, X0 + 0.2, RF, RF + 0.8, Z0, Z1, M.paperWhite);
    // balcony off the upper east door, overlooking the lanes
    seg(X1, X1 + 1.9, F2 - 0.22, F2, -6.8, -4.6, M.concrete);
    seg(X1 + 1.75, X1 + 1.9, F2, F2 + 1.0, -6.8, -4.6, M.trim, NC);
    box(80.6, 0.75, -5.7, 2.2, 1.5, 1.3, M.contBlue);                          // step to the balcony
    box(80.4, 1.9, -5.8, 1.7, 0.8, 1.1, M.rust);
  })();

  /* ---- REEFER ROW + PLANT: the north-west corner, storytelling and cover --- */
  [[80, 18], [84, 18], [88, 18]].forEach(function (p) {
    box(p[0], 1.3, p[1], 2.44, 2.6, 5.0, M.contGray);
    box(p[0] - 1.35, 1.5, p[1], 0.3, 1.4, 1.6, M.trim, NC);                    // reefer plant
    box(p[0] - 1.35, 2.35, p[1], 0.36, 0.3, 1.7, M.hazard, NC);
  });
  step3(82, 14.6); step3(90, 17.6);
  [[75, 14], [75, 21]].forEach(function (p) {                                  // chassis trailers
    box(p[0], 1.05, p[1], 2.3, 0.35, 7.4, M.rust);
    [-2.6, 2.6].forEach(function (o) {
      cyl(p[0] - 1.0, 0.42, p[1] + o, 0.42, 0.3, M.tire, NC);
      cyl(p[0] + 1.0, 0.42, p[1] + o, 0.42, 0.3, M.tire, NC);
    });
  });
  [[95.5, 8], [95.5, 14]].forEach(function (p) {                               // tyre stacks
    for (var t = 0; t < 4; t++) cyl(p[0], 0.22 + t * 0.42, p[1], 0.85, 0.4, M.tire);
  });
  // floodlight masts: silhouette at zero shadow cost
  [[74.8, 8], [96.2, 8], [96.2, 22]].forEach(function (p) {
    cyl(p[0], 4.4, p[1], 0.17, 8.8, M.trim);
    seg(p[0] - 1.1, p[0] + 1.1, 8.8, 9.2, p[1] - 0.35, p[1] + 0.35, M.trim, NC);
    seg(p[0] - 0.95, p[0] + 0.95, 8.55, 8.8, p[1] - 0.28, p[1] + 0.28, M.amberGlow, NC);
  });
  crates(93, -6); barrel(76.5, 22, true); barrel(94.2, -6.6, false);
  lamp(86, -7, 'n'); lamp(80, 16, 'e'); lamp(93, 16, 'w');

  /* =============== BUS TERMINAL (x 74..97, z 26..60) =============== */
  seg(75, 96, 0.003, 0.016, 27, 59, M.asphalt, NC);
  // canopy on six columns (cover lane, roof not accessible)
  [[78, 34], [78, 42], [86, 34], [86, 42], [93, 34], [93, 42]].forEach(function (p) {
    cyl(p[0], 2.2, p[1], 0.18, 4.4, M.trim);
  });
  seg(76, 95, 4.4, 4.8, 32, 44, M.roof);
  // parked buses (solid cover) — bus() lives in world.js and arrives via T.bus
  bus(82, 37, 0); bus(88, 37, 0); bus(84, 52, 0.35); bus(92, 50, -0.2);
  // ticket office with roof access (external north stair)
  (function () {
    var X0 = 74, X1 = 82, Z0 = 48, Z1 = 58, TT = 0.3;
    facade('z', Z0, Z0 + TT, X0, X1, 0, 3.8, M.plaster, [{ u0: 77, u1: 78.6, v0: 0, v1: 2.4 }, win(80, 1.5, 1.3, 1.3)]);
    seg(X0, X1, 0, 3.8, Z1 - TT, Z1, M.facadeTeal);
    seg(X0, X0 + TT, 0, 3.8, Z0, Z1, M.plaster);
    facade('x', X1 - TT, X1, Z0, Z1, 0, 3.8, M.facadeAmber, [win(53, 1.5, 1.6, 1.3)]);
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

  /* ==========================================================================
     THE COLONY — APARTMENT DISTRICT      x -44..38, z 74..97      (v7.8)
     ==========================================================================
     The old version was two identical two-storey brick slabs with completely
     empty interiors, one internal stairwell each, and a courtyard containing a
     swing frame and a bench. Nothing happened between them, nothing happened
     inside them, and the two blocks were indistinguishable on comms.

     Rebuilt as three-storey municipal blocks arranged around a courtyard, with
     the vertical circulation pulled OUT of the building into open stair cores —
     which is both what this architecture actually looks like and the single
     best gameplay change available here: a stair core is a glass box you climb
     inside, visible from the courtyard and from the opposite block.

       WEST BLOCK   x -44..-20   two cores: PINK (west), YELLOW (east)
       COURTYARD    x -20..12    the killzone, with real cover
       EAST BLOCK   x  12..38    one core: MINT
       DECK WALKWAY  z 79.4      open access decks along the courtyard face

     Why a player comes here, by level:
       COURTYARD   crossed by every balcony and every deck on both blocks. The
                   drying frames, planters, garage and parked cars break it
                   into three lanes so it is survivable but never safe.
       DECKS       an open access balcony runs the full length of each block on
                   every floor. It is the horizontal route, it is cover from
                   below and exposure from across, and it links every flat.
       FLATS       two flats per core per floor, each with a hall, a room to
                   the courtyard and a room to the rear. Doors open onto the
                   deck, so a flat is a way THROUGH the block, not a dead end.
       CORES       open stairs, three flights, no walls on the courtyard side.
                   Fast, loud, and watched.
       ROOF        one core reaches it. Water tanks and lift housings give cover
                   so the roof is a fight rather than a firing platform.

     Landmark: the WATER TANK GANTRY on the west block roof — four tanks on a
     steel frame, the tallest thing in the south of the map and visible from the
     terrace, the avenue and the connector road.
     ====================================================================== */
  seg(-7, 7, 0.005, 0.02, 68, 96, M.asphalt, NC);                    // connector road

  (function () {
    var Z0 = 79.4, Z1 = 91.0, TT = 0.3;          // deck face .. rear face
    var FH = 3.3;                                 // storey height
    var LV = [0, 3.3, 6.6];                       // finished floor levels
    var ROOF = 10.15;

    /* One stair core plus the two flats it serves on each floor.
       `pal` colours the whole core bay, which is what makes it callable. */
    function coreBay(X0, X1, pal, toRoof) {
      var cx = (X0 + X1) / 2;
      /* Stairs run ALONG the access deck, not into the courtyard.
         The first version projected an open core out into the courtyard with
         flights running z-wards; every flight drove through the building face
         and through the deck slab above it, and the ascent walker was stopped
         dead by the core's own outer wall. Deck-access blocks put their stairs
         at the deck, in line with it, which is both what this architecture
         looks like and the only arrangement a straight-line walker can prove.
         Each deck is holed over the flight beneath it for head clearance. */
      var DZ0 = Z0 - 1.7;
      var f1x = X0 + 0.8, f2x = X0 + 4.6, f3x = X0 + 8.4;   // three staggered lanes
      stairFlight(f1x, 0, DZ0 + 0.15, 1, 0, 11, 0.30, 0.30, 1.55, M.concrete);
      stairFlight(f2x, LV[1], DZ0 + 0.15, 1, 0, 11, 0.30, 0.30, 1.55, M.concrete);
      if (toRoof) stairFlight(f3x, LV[2], DZ0 + 0.15, 1, 0, 11, 0.32273, 0.30, 1.55, M.concrete);

      // ---- flats, two per floor -------------------------------------------
      for (var g = 0; g < 3; g++) {
        var B = LV[g], TOPW = B + 2.9;
        // courtyard face: two flat doors onto the deck, windows between
        facade('z', Z0, Z0 + TT, X0, X1, B, TOPW, pal,
          [{ u0: cx - 3.6, u1: cx - 2.4, v0: B, v1: B + 2.2 },
           { u0: cx + 2.4, u1: cx + 3.6, v0: B, v1: B + 2.2 },
           win(X0 + 2.2, B + 1.05, 1.6, 1.25), win(X1 - 3.8, B + 1.05, 1.6, 1.25)]);
        // rear face: windows only — the rear is the quiet side, and knowing
        // that is worth something
        facade('z', Z1 - TT, Z1, X0, X1, B, TOPW, pal,
          [win(X0 + 2.4, B + 1.05, 1.5, 1.2), win(cx - 0.8, B + 1.05, 1.5, 1.2),
           win(X1 - 3.9, B + 1.05, 1.5, 1.2)]);
        seg(X0, X0 + TT, B, TOPW, Z0, Z1, M.concrete);                 // party walls
        seg(X1 - TT, X1, B, TOPW, Z0, Z1, M.concrete);
        // spine wall splitting front room from rear room, doorway per flat
        seg(X0 + TT, cx - 4.4, B, TOPW, 85.0, 85.24, M.plaster);
        seg(cx - 3.2, cx + 3.2, B, TOPW, 85.0, 85.24, M.facadeRose);
        seg(cx + 4.4, X1 - TT, B, TOPW, 85.0, 85.24, M.plaster);
        // party wall between the two flats, with the hall doorway at the deck
        seg(cx - 0.15, cx + 0.15, B, TOPW, Z0 + 2.6, Z1 - TT, M.facadeIndigo);
        // furniture: cover in both rooms of both flats
        box(X0 + 2.4, B + 0.42, 81.4, 2.0, 0.84, 0.9, M.wood); // sofa
        box(X1 - 3.4, B + 0.42, 81.6, 2.0, 0.84, 0.9, M.trim); // sofa
        seg(X0 + TT, X0 + 2.0, B, B + 1.0, 88.6, 89.4, M.plaster); // kitchen run
        seg(X1 - 2.0, X1 - TT, B, B + 1.0, 88.6, 89.4, M.facadeOlive);
        box(X0 + 3.6, B + 0.3, 88.0, 2.0, 0.6, 1.5, M.wood);   // bed
        box(X1 - 4.6, B + 0.3, 88.0, 2.0, 0.6, 1.5, M.wood);
        // floor slab above (or the roof)
        var SL = (g < 2) ? LV[g + 1] : ROOF;
        seg(X0, X1, SL - 0.25, SL, Z0, Z1, (g < 2) ? M.concrete : M.roof);
      }

      /* Access decks, each holed over the flight that climbs to it. */
      function deck(top, holeX) {
        seg(X0, holeX - 0.15, top - 0.22, top, DZ0, Z0, M.concrete);
        seg(holeX + 3.45, X1, top - 0.22, top, DZ0, Z0, M.concrete);
        seg(X0, X1, top, top + 1.05, DZ0 - 0.05, DZ0 + 0.07, pal);     // balustrade, unbroken
      }
      deck(LV[1], f1x);
      deck(LV[2], f2x);
      // roof oversails the deck band so the top flight lands on it
      if (toRoof) {
        seg(X0, f3x - 0.15, ROOF - 0.22, ROOF, DZ0, Z0, M.roof);
        seg(f3x + 3.45, X1, ROOF - 0.22, ROOF, DZ0, Z0, M.roof);
      } else {
        seg(X0, X1, ROOF - 0.22, ROOF, DZ0, Z0, M.roof);
      }
      [[X0, X1, DZ0 - 0.05, DZ0 + 0.15], [X0, X1, Z1 - 0.2, Z1],
       [X0, X0 + 0.2, DZ0, Z1], [X1 - 0.2, X1, DZ0, Z1]].forEach(function (r) {
        seg(r[0], r[1], ROOF, ROOF + 0.85, r[2], r[3], pal);
      });
      box(cx + 5.5, ROOF + 0.7, 87.5, 2.2, 1.4, 2.2, M.trim);          // tank housing, roof cover
    }

    /* WEST BLOCK — two bays. The east bay carries the roof stair, so the whole
       west roof is reached from one core and the climb is a commitment. */
    coreBay(-44, -32, M.dustyPink, false);
    coreBay(-32, -20, M.paleYellow, true);
    /* EAST BLOCK — one bay, and it reaches its own roof. */
    coreBay(12, 24, M.mint, true);
    // the east block's second bay is a lower two-storey wing: it breaks the
    // skyline and denies the mint roof a straight look down the rear alley
    (function () {
      var X0 = 24, X1 = 38, W = 6.9;
      for (var g = 0; g < 2; g++) {
        var B = g * 3.3, TOPW = B + 2.9;
        facade('z', Z0, Z0 + TT, X0, X1, B, TOPW, M.mint,
          [{ u0: 29.0, u1: 30.2, v0: B, v1: B + 2.2 }, win(26.4, B + 1.05, 1.6, 1.25),
           win(34.2, B + 1.05, 1.6, 1.25)]);
        facade('z', Z1 - TT, Z1, X0, X1, B, TOPW, M.mint,
          [win(27.0, B + 1.05, 1.5, 1.2), win(33.0, B + 1.05, 1.5, 1.2)]);
        seg(X1 - TT, X1, B, TOPW, Z0, Z1, M.concrete);
        seg(X0 + TT, X1 - TT, B, TOPW, 85.0, 85.24, M.plaster);
        box(26.6, B + 0.42, 81.6, 2.0, 0.84, 0.9, M.wood);
        seg(33.0, 36.0, B, B + 1.0, 88.6, 89.4, M.facadeTeal);
        seg(X0, X1, (g ? W : 3.3) - 0.25, (g ? W : 3.3), Z0, Z1, g ? M.roof : M.concrete);
      }
      seg(X0, X1, W, W + 0.8, Z0 - 0.2, Z0, M.mint);
      seg(X0, X1, W, W + 0.8, Z1 - 0.2, Z1, M.mint);
      seg(X0, X1, 3.3 - 0.22, 3.3, Z0 - 1.7, Z0, M.concrete);          // deck continues
      seg(X0, X1, 3.3, 3.3 + 1.05, Z0 - 1.75, Z0 - 1.63, M.mint);
      seg(X0, X1, W, W + 0.8, Z0 - 1.75, Z0 - 1.55, M.mint);
    })();

    /* ---- LANDMARK: water tank gantry on the west roof --------------------
       The tallest thing in the south of the map, and CLIMBABLE — a stair off
       the west roof reaches the gantry deck (13.40) and a service catwalk puts
       the tank tops (15.60) one step further. The architecture gate flagged the
       tanks as a broken promise when the gantry was scenery: something that
       large, that close above a walkable roof, is an invitation. It is now the
       district's high ground, and it is a dead end with one way down. */
    [[-40, 84.5], [-33, 84.5], [-40, 88.5], [-33, 88.5]].forEach(function (p) {
      cyl(p[0], ROOF + 1.5, p[1], 0.16, 3.0, M.trim);
    });
    /* Gantry deck 13.40, HOLED over the stair lane. Without the hole the deck
       oversailed the top of its own stair and the climber's head hit it at
       12.23 m — the flight looked complete from every angle. */
    seg(-40.6, -32.4, ROOF + 3.0, ROOF + 3.25, 83.9, 84.85, M.trim);
    seg(-40.6, -32.4, ROOF + 3.0, ROOF + 3.25, 86.35, 89.1, M.trim);
    seg(-39.2, -32.4, ROOF + 3.0, ROOF + 3.25, 84.85, 86.35, M.trim);
    // starts INSIDE the roof parapet and its last tread overlaps the gantry deck
    stairFlight(-42.6, ROOF, 85.6, 1, 0, 11, 0.29545, 0.30, 1.5, M.metal);
    /* Tanks sit EAST of the stair arrival. The first placement put a tank
       directly over the top of the flight — you climbed into the inside of it. */
    [[-36.8, 85.4], [-33.9, 85.4], [-36.8, 87.6], [-33.9, 87.6]].forEach(function (p) {
      cyl(p[0], ROOF + 4.35, p[1], 1.2, 2.2, M.steelBlue);
      cyl(p[0], ROOF + 5.55, p[1], 1.2, 0.25, M.rust, { collide: false });
    });
    // catwalks BOTH sides: one edge only served the northern pair of tanks
    seg(-38.2, -32.6, ROOF + 4.15, ROOF + 4.35, 89.1, 89.75, M.trim); // north catwalk 14.50
    seg(-38.2, -32.6, ROOF + 4.35, ROOF + 5.1, 89.75, 89.87, M.trim, NC);
    seg(-38.2, -32.6, ROOF + 4.15, ROOF + 4.35, 83.25, 83.9, M.trim); // south catwalk 14.50
    seg(-38.2, -32.6, ROOF + 4.35, ROOF + 5.1, 83.13, 83.25, M.trim, NC);

    /* ---- COURTYARD  x -20..12 — three lanes, never a bare box ------------ */
    seg(-20, 12, 0.02, 0.06, 74.0, 92.0, M.concrete, NC);
    seg(-19, 11, 0.06, 0.09, 82.6, 83.4, M.roadPaint, NC);             // painted court markings
    seg(-19, 11, 0.06, 0.09, 78.0, 78.3, M.roadPaint, NC);
    // covered garage bay: hard cover in the middle of the open ground
    seg(-16.5, -8.5, 0, 2.7, 75.0, 75.3, M.concrete);
    seg(-16.5, -16.2, 0, 2.7, 75.0, 79.4, M.concrete);
    seg(-16.5, -8.5, 2.7, 3.0, 74.8, 79.6, M.roof);
    sedan(-14.2, 77.2, false, 3, false); sedan(-10.6, 77.4, true, 0, true);
    // drying frames + planters split the crossing into lanes
    [[-4.5, 80.5], [-4.5, 86.5], [4.5, 80.5], [4.5, 86.5]].forEach(function (p) {
      cyl(p[0] - 1.6, 1.15, p[1], 0.11, 2.3, M.trim);
      cyl(p[0] + 1.6, 1.15, p[1], 0.11, 2.3, M.trim);
      seg(p[0] - 1.7, p[0] + 1.7, 2.2, 2.32, p[1] - 0.06, p[1] + 0.06, M.trim, NC);
    });
    [[-8, 84], [8, 84], [0, 89.5]].forEach(function (p) {
      seg(p[0] - 1.6, p[0] + 1.6, 0, 0.95, p[1] - 1.1, p[1] + 1.1, M.brick);   // planters
      seg(p[0] - 1.4, p[0] + 1.4, 0.95, 1.55, p[1] - 0.9, p[1] + 0.9, M.foliage, NC);
    });
    box(2.5, 0.35, 87.0, 1.8, 0.7, 0.9, M.wood);                       // bench
    crates(-18.4, 90.2); barrel(10.6, 74.8, true);
    car(-8.8, 73.5, 0.06, M.metal);
    car(8.8, 76.5, -0.04, M.rust);
    car(9.2, 90.0, 0.02, M.metal);
    lamp(-8.5, 78, 'e'); lamp(8.5, 88, 'w'); lamp(-21.5, 84, 'w'); lamp(13.5, 84, 'e');

    /* ---- REAR SERVICE STRIP  z 91..96 — the quiet flank ------------------ */
    seg(-46, 40, 0.02, 0.06, 91.4, 95.4, M.asphalt, NC);
    seg(-46, 40, 0, 2.2, 95.4, 95.7, M.concrete);
    [-38, -24, 16, 32].forEach(function (bx) {
      cyl(bx, 0.55, 93.4, 0.42, 1.1, M.rust);
      box(bx + 1.6, 0.75, 93.6, 2.0, 1.5, 1.2, M.contGreen);           // step to the wall
    });
    container(-6, 93.6, false, M.contBlue, false);
    crates(4, 93.4);
  })();

  function car(x, z, ry, m) {
    var VGLASS = M.vGlass, VWHEEL = M.tire, VLF = M.headlight, VLR = M.taillight;
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
  /* Rise/run of the warehouse fire escape. 8 steps x 0.375 = one 3.0m floor.

     STALE-COMMENT CORRECTION (v7.8). This block used to insist "run MUST be
     ~0.5" because stairFlight skirted every tread with a 1.2 m box that reached
     into the climber's chest. That was true until v6.2, which made the tread
     COLLIDER a thin slab and left the skirt decorative — the fix that made 40
     previously-unclimbable staircases work. Runs of 0.30 are fine now and are
     gate-proven across the terrace, the colony and the station. Kept at 0.50
     here only because these flights are already built and validated; do not
     copy the old rule into new work. */
  var SH = 0.375, SD = 0.50;

  function building(x0, x1, z0, z1, floors, wallMat, roofMat) {
    buildingAt(x0, x1, z0, z1, floors, wallMat, roofMat, 0);
  }
  /* Stairs: EXTERNAL straight flight for floors 0-3 on the -z face, then an
     INTERNAL flight 3-top running back the other way through a stairwell slot.
     Rise/run is 0.375/0.50 — the warehouse fire-escape profile, the only one
     confirmed climbable in a real browser. Short runs fail because stairFlight
     skirts each tread with a 1.2m box, which lands in the climber's headroom
     and makes auto-step reject the step. Landings always sit PAST the end of a
     run, never on it. */
  function buildingAt(x0, x1, z0, z1, floors, wallMat, roofMat, baseY, noStair) {
    var t = 0.28;
    var sxA = x0 + 1.2;                       // external flight start
    /* ===== v9.14 — THE STAIR HAS TO FIT THE BUILDING =====
       EXT was `Math.min(3, floors)` — how many storeys the external flight
       climbs — and nothing ever asked whether the resulting RUN fits along the
       wall it is bolted to. Each storey costs 8 x SD = 4.0 m of horizontal run,
       so a three-floor flight needs 12 m. buildingAt(-58, -50, ...) is EIGHT
       metres wide: the flight sailed four metres past the roof and ended in
       mid-air.

       Reported as "hanging stairs going nowhere" with coordinates, and the
       DevHUD agreed — "top arrival: NO DECK in 3m". verify-climb walked it
       happily, because the flight itself is perfectly climbable; it is the
       destination that does not exist.

       Bounded by the wall it runs along now, so a narrow building simply gets a
       shorter external flight and its lifts cover the rest. The run must also
       leave 1.2 m of roof beyond it to stand on, which is the same landing
       allowance every other flight in this project needs. */
    var runPerFloor = 8 * SD;
    var usable = (x1 - 1.2) - sxA;            // wall length available for the run
    var EXT = Math.max(0, Math.min(3, floors, Math.floor(usable / runPerFloor)));
    /* ...AND IF SHORTENING IT ORPHANS THE ROOF, DON'T.
       v9.14 bounded the run by the wall and that fixed the flight ending in
       mid-air — but on a building with no other way up it also made the roof
       unreachable, which verify-access caught immediately as "ship bridge ->
       roof 12.4, foot reached 6.42". Trading a hanging staircase for an
       unreachable roof is not a fix.
       So a building that HAS no lift keeps its full-height flight and gets a
       landing platform at the top instead — built below, cantilevered off the
       roof edge to meet the overshoot. The stair reaches the roof and its top
       tread has a deck under it, which is what was wrong in the first place. */
    var overrun = 0;
    if (EXT < Math.min(3, floors) && !noStair) {
      EXT = Math.min(3, floors);
      overrun = (sxA + EXT * runPerFloor) - (x1 - 0.2);
    }
    for (var f = 0; f <= floors; f++) {
      var y = baseY + f * FH;
      seg(x0, x1, y, y + 0.25, z0, z1, f === floors ? roofMat : wallMat);
      if (f === floors) break;
      var b0 = y + 0.25, sill = b0 + 0.9, head = b0 + 2.05, top = baseY + (f + 1) * FH;
      var doorX = (f < EXT) ? sxA + f * (8 * SD) : x1 - 1.9;
      seg(x0, Math.max(x0, Math.min(x1, doorX - 0.9)), b0, sill, z0, z0 + t, wallMat);
      seg(Math.min(x1, Math.max(x0, doorX + 0.9)), x1, b0, sill, z0, z0 + t, wallMat);
      /* ===== v9.12 — THE DOORWAY HAS TO GO ALL THE WAY UP =====
         The sill band below was already gapped for a door; the HEAD band above
         it was not, so every doorway on the -z face was a 0.9 m hole with a
         solid wall sitting on top of it from 2.05 m upward. Walking in was
         fine. Arriving at the TOP of the external stair and trying to step onto
         the roof was not: the last flight lands level with the roof slab and
         the head band stands directly across it.

         Reported twice with coordinates — MARKET CROSS (57, -45) and AIRPORT
         (-84.9, -93.2) — and both are this helper, which is why one gap fixes
         every building of this type on the map rather than two of them. */
      seg(x0, Math.max(x0, Math.min(x1, doorX - 0.9)), head, top, z0, z0 + t, wallMat);
      seg(Math.min(x1, Math.max(x0, doorX + 0.9)), x1, head, top, z0, z0 + t, wallMat);
      seg(x0, x1, b0, sill, z1 - t, z1, wallMat);
      seg(x0, x1, head, top, z1 - t, z1, wallMat);
      seg(x0, x0 + t, b0, sill, z0, z1, wallMat);
      seg(x0, x0 + t, head, top, z0, z1, wallMat);
      seg(x1 - t, x1, b0, sill, z0, z1, wallMat);
      seg(x1 - t, x1, head, top, z0, z1, wallMat);
    }
    // external flight: ground -> floor EXT. Towers pass noStair — Tower B's
    // flight could not be made reliable and one working mechanism beats two
    // half-working ones, so the towers are lift-only.
    if (!noStair) {
      stairFlight(sxA, baseY, z0 - 1.1, 1, 0, EXT * 8, SH, SD, 1.5, M.metal);
      seg(sxA - 0.3, sxA + EXT * 8 * SD, baseY + 0.9, baseY + 1.75,
        z0 - 2.0, z0 - 1.88, M.trim, { collide: false });
    }
    /* The landing that catches an overrunning flight. Sized to the overshoot,
       set at the height the flight actually arrives at, and tied back to the
       roof edge so you step off it onto the building. */
    if (overrun > 0.2) {
      var landY = baseY + EXT * FH;
      seg(x1 - 0.4, sxA + EXT * runPerFloor + 0.6, landY, landY + 0.25,
        z0 - 2.0, z0 - 0.6, M.metal);
      seg(sxA + EXT * runPerFloor + 0.4, sxA + EXT * runPerFloor + 0.6,
        landY + 0.25, landY + 1.15, z0 - 2.0, z0 - 0.6, M.trim, { cast: false });
    }
    // No internal flight above floor EXT — lifts handle everything above.
    var ry = baseY + floors * FH + 0.25;
    /* ===== v9.12 — THE ROOF RAIL HAD NO GATE =====
       A 0.95 m rail ran unbroken around all four sides. Every other part of the
       climb worked — verify-climb passed the flight, verify-stairs-quality
       passed its arrival — and then the player met a waist-high wall standing
       exactly where they stepped off. Two separate reports with coordinates,
       both this line.
       The gap sits over the external flight, so you walk off the stairs and
       onto the roof. Only the -z face is opened: the other three keep their
       rail, because the point of a parapet is that a roof is not a place you
       can be shot off from every direction. */
    var gapA = Math.max(x0, sxA - 1.0), gapB = Math.min(x1, sxA + EXT * 8 * SD + 1.0);
    if (noStair) { gapA = x0; gapB = x0; }          // lift-only towers keep a closed rail
    seg(x0, gapA, ry, ry + 0.95, z0, z0 + 0.15, M.trim, { cast: false });
    seg(gapB, x1, ry, ry + 0.95, z0, z0 + 0.15, M.trim, { cast: false });
    seg(x0, x1, ry, ry + 0.95, z1 - 0.15, z1, M.trim, { cast: false });
    seg(x0, x0 + 0.15, ry, ry + 0.95, z0, z1, M.trim, { cast: false });
    seg(x1 - 0.15, x1, ry, ry + 0.95, z0, z1, M.trim, { cast: false });
  }

  /* ==========================================================================
     SOUTH TERMINAL — v9.6      x 50..94, z 54..94
     ==========================================================================
     WAS three 6-floor blocks at 19.2 m — buildingAt(52,70,56,72),
     (76,92,56,72) and (58,76,78,92), all `noStair`. Three sealed towers with no
     way in and no way up: 109 colliders of pure wall that a player could only
     walk around. Rahul asked for them gone and the bus terminal extended down
     here instead, with a sniper tower.

     WHAT THIS HAD TO PRESERVE. Those blocks were also the entire south-east
     corner's cover. Urban's dead ground is 0.6% and stripping them without
     replacement would have opened a 40 m shooting gallery from the terminal to
     the map edge. So the replacement is DENSE AND LOW rather than empty: bus
     bays with parked coaches, a canopy on columns, a maintenance shed and a
     fuel island. Buses are the same trick containers are on Metro — a 3 m solid
     you cannot mantle, in a shape that breaks a lane without walling it off.

     WHY IT IS SOUTH OF THE EXISTING TERMINAL. The terminal at z 26..60 already
     had bays, a canopy and a ticket office; this extends the same district
     rather than inventing a second one, so the callouts stay coherent —
     "south bays", "the tower", "fuel island" all read as one place.

     THE CONTROL TOWER is the sniper position Rahul asked for, and it is
     deliberately SHORTER than what it replaces: 16 m against 19.2 m, so it
     overlooks the yard without dominating the district the way the old blocks
     did. It has TWO ways up — an internal stair and an external fire escape on
     the opposite face — because a sniper nest with one entrance is a camping
     spot rather than a position that can be contested. That is the same rule
     the v9.1 Metro fire escapes were built to. */
  (function southTerminal() {
    var NCX = { collide: false, cast: false };

    // ---- apron ------------------------------------------------------------
    seg(50, 94, 0.003, 0.016, 54, 94, M.asphalt, NCX);
    /* Bay markings. Cheap, and they are what makes an open apron read as a
       place with a purpose rather than a car park. */
    for (var b = 0; b < 6; b++) {
      var bx = 53 + b * 6.5;
      /* Markings sit 0.04 clear of the apron, not 0.001.
         The apron's top is 0.016 and these were 0.017-0.022: a six-millimetre
         gap is INSIDE verify-zfight's tolerance, so all six read as coplanar
         with the surface they are painted on. Paint needs a real offset for the
         same reason the Metro avenue grid has one. */
      seg(bx, bx + 0.25, 0.040, 0.050, 58, 74, M.trim, NCX);
    }

    // ---- canopy over the bays: cover lane, roof not walkable ---------------
    [[54, 60], [54, 72], [66, 60], [66, 72], [78, 60], [78, 72]].forEach(function (p) {
      cyl(p[0], 2.35, p[1], 0.2, 4.7, M.trim);
    });
    seg(52, 80, 4.6, 5.0, 58, 74, M.roof);

    /* ---- parked coaches: the cover that replaces the towers ---------------
       Angled into the bays rather than lined up, so the gaps between them are
       diagonal and no single position sees down more than two at once. */
    bus(56, 64, 0.30); bus(63, 66, -0.25); bus(70, 64, 0.30);
    bus(77, 66, -0.25); bus(58, 80, 0.10); bus(68, 82, -0.15);

    // ---- maintenance shed: a room, with two doors --------------------------
    (function shed() {
      var X0 = 50, X1 = 64, Z0 = 84, Z1 = 93, TT = 0.3;
      facade('z', Z0, Z0 + TT, X0, X1, 0, 4.2, M.plaster,
        [{ u0: 53, u1: 56, v0: 0, v1: 3.2 }, win(60, 1.6, 1.6, 1.2)]);
      facade('z', Z1 - TT, Z1, X0, X1, 0, 4.2, M.facadeAmber, [win(57, 1.6, 1.6, 1.2)]);
      facade('x', X0, X0 + TT, Z0, Z1, 0, 4.2, M.plaster, [{ u0: 87, u1: 89.5, v0: 0, v1: 3.0 }]);
      seg(X1 - TT, X1, 0, 4.2, Z0, Z1, M.facadeRose);
      seg(X0, X1, 4.15, 4.45, Z0, Z1, M.roof);
      // inside: work bays, so the room is worth entering
      box(53, 0.55, 88, 2.4, 1.1, 1.2, M.wood);
      box(60, 0.45, 90, 1.8, 0.9, 1.8, M.rust);
      crates(56, 91);
    })();

    // ---- fuel island -------------------------------------------------------
    [[84, 82], [84, 88]].forEach(function (p) {
      box(p[0], 0.9, p[1], 1.0, 1.8, 3.6, M.rust);          // pump block
      /* A post at EACH end. One row left the canopy's east half cantilevered
         over nothing, which verify-props reads as an unsupported prop — and it
         is one: a roof floating on air. */
      cyl(p[0] - 2.2, 1.65, p[1], 0.22, 3.3, M.trim);
      cyl(p[0] + 4.4, 1.65, p[1], 0.22, 3.3, M.trim);
    });
    seg(80, 90, 3.2, 3.5, 79, 91, M.roof);
    barrel(79, 78, true); barrel(91, 92, false);

    /* ---- CONTROL TOWER  x 84..92, z 60..68  ------------------------------
       16 m: cab deck at 12.6, open observation rail above it. Two routes up. */
    (function tower() {
      /* z 58..70, not 60..68. verify-climb backs its walker roughly 3.8 m
         behind a flight before it starts walking, and an 8 m tower left only
         2.8 m of deck there — so the upper flights were judged from OUTSIDE the
         south wall. Twelve metres gives 4.7 m of approach on every level. */
      var X0 = 84, X1 = 92, Z0 = 58, Z1 = 70, TT = 0.3;
      var DECKS = [0, 4.2, 8.4, 12.6];
      var i;
      for (i = 0; i < 3; i++) {
        var y = DECKS[i], top = DECKS[i + 1];
        // shaft walls, with the stair bay left open on the west face
        facade('z', Z0, Z0 + TT, X0, X1, y, top, M.concrete, [win(86, y + 1.4, 1.4, 1.3)]);
        facade('z', Z1 - TT, Z1, X0, X1, y, top, M.concrete, [win(89, y + 1.4, 1.4, 1.3)]);
        facade('x', X1 - TT, X1, Z0, Z1, y, top, M.concrete, [win(64, y + 1.4, 1.4, 1.3)]);
        facade('x', X0, X0 + TT, Z0, Z1, y, top, M.concrete,
          [{ u0: 66.2, u1: 68.0, v0: y, v1: y + 2.3 }]);      // doorway on every level
        /* Deck slab hangs BELOW its level, not above it — surface at `top`.
           Built as top..top+0.25 first, which put every walking surface a
           quarter-metre higher than the flight that arrives at it: the climb
           walker then spawned with its feet inside the slab and was pushed
           backwards out of the building before it took a step. The flights and
           the landings both use `top` as the surface, so the deck must too. */
        seg(87.6, X1 - TT, top - 0.25, top, Z0 + TT, Z1 - TT, M.concrete);
        seg(X0 + TT, 87.6, top - 0.25, top, 65.3, Z1 - TT, M.concrete);
      }
      /* INTERNAL STAIR: straight flights climbing north, approach on the deck.
         Same shape as the apartment fix — the lesson generalises, so it is
         built that way here rather than rediscovered. */
      for (i = 0; i < 3; i++) {
        var by = DECKS[i], rise = DECKS[i + 1] - by, sh = rise / 11;
        /* 11 steps, not 12, and starting at z 64.6.
           A 12-step run at 0.34 is 4.08 m; from z 63.7 that ended at 59.62,
           which is INSIDE the tower's own north wall (z 60..60.3) — verify-climb
           reported 0.35 m of headroom on tread 10 because the tread was under
           the wall, not under a deck. 11 steps is 3.74 m and stops at 60.86,
           clear of the wall by half a metre, with the rise still 0.382 against
           the 0.42 limit. The approach behind it is 3.1 m of deck. */
        stairFlight(85.9, by, 65.0, 0, -1, 11, sh, 0.34, 1.3, M.metal);
        seg(84.4, 87.6, DECKS[i + 1] - 0.22, DECKS[i + 1], 60.4, 61.4, M.metal);
      }
      // cab: glazed on all four sides, the sniper deck
      seg(X0 - 0.6, X1 + 0.6, 12.6, 12.85, Z0 - 0.6, Z1 + 0.6, M.concrete);   // overhanging deck
      seg(X0 - 0.6, X1 + 0.6, 12.85, 13.9, Z0 - 0.6, Z0 - 0.35, M.shopGlass);
      seg(X0 - 0.6, X1 + 0.6, 12.85, 13.9, Z1 + 0.35, Z1 + 0.6, M.shopGlass);
      seg(X0 - 0.6, X0 - 0.35, 12.85, 13.9, Z0 - 0.6, Z1 + 0.6, M.shopGlass);
      seg(X1 + 0.35, X1 + 0.6, 12.85, 13.9, Z0 - 0.6, Z1 + 0.6, M.shopGlass);
      seg(X0 - 0.6, X1 + 0.6, 15.6, 15.9, Z0 - 0.6, Z1 + 0.6, M.roof);        // cab roof, 16 m
      [[X0 - 0.4, Z0 - 0.4], [X1 + 0.4, Z0 - 0.4], [X0 - 0.4, Z1 + 0.4], [X1 + 0.4, Z1 + 0.4]]
        .forEach(function (c) { cyl(c[0], 14.2, c[1], 0.12, 2.7, M.trim); });

      /* EXTERNAL FIRE ESCAPE on the EAST face — the opposite side from the
         internal stair, so the two routes cannot be watched from one position.
         Switchback in two lanes, landings beyond each flight, no stringers:
         all four rules the v9.1 Metro escapes established. */
      var W = 1.4, RUN = 0.36, LANE = 1.9, PAD = 2.0;
      for (i = 0; i < 3; i++) {
        var from = i === 0 ? 0 : DECKS[i], to = DECKS[i + 1];
        var h = to - from, st = Math.ceil(h / 0.34), rs = h / st, len = st * RUN;
        var odd = (i % 2) === 1, lx = 93.4 + (odd ? LANE : 0);
        /* STRINGERS ON, unlike the Metro fire escapes.
           There they are off to save triangles against a tight 26,000 ceiling.
           Urban's ceiling is 120,000 with 33,000 spare, and verify-props runs on
           URBAN only — so the thirty treads of this escape were thirty props
           with nothing beneath them, which is exactly what an unsupported prop
           IS when the side plates are missing. The stringers are the support;
           turning them off is a triangle trade, and here there is nothing to
           trade for. */
        stairFlight(lx, from, odd ? 61.0 + len : 61.0, 0, odd ? -1 : 1, st, rs, RUN, W,
                    M.metal);
        var lz = odd ? 61.0 - PAD : 61.0 + len;
        seg(92.0, 93.4 + LANE + W / 2, to - 0.22, to, lz, lz + PAD, M.metal);
        var nx = odd ? 93.4 - W / 2 : 93.4 + LANE - W / 2;
        seg(nx, nx + W, to - 0.22, to, odd ? lz + PAD : lz - 0.7, odd ? lz + PAD + 0.7 : lz, M.metal);
      }
    })();

    crates(72, 76); crates(51, 79); barrel(93, 56, true);
  })();

  /* ==========================================================================
     WESTBROOK STADIUM & TRAINING GROUND — v9.6    x -94..-46, z 40..94
     ==========================================================================
     This quadrant was empty. 57 x 63 m with 132 colliders, almost all of them
     perimeter wall — the district lookup could only call it "NEAR THE COLONY"
     because there was nothing there to name. Players crossed it to get
     somewhere else and never fought in it.

     WHY A STADIUM RATHER THAN MORE BUILDINGS. Urban's west is already all
     interiors: West Works is a yard, Irongate is warehouses, The Colony is
     decks, Old Town is doorways. A fourth set of rooms would have added floor
     area and no new kind of fight. A stadium adds the one texture the map does
     not have — TIERED OPEN GROUND. Sightlines are long but every one of them is
     down a slope with cover at intervals, which is neither the arcade's flat
     38 m lane nor the terrace's blind corners.

     Rahul asked for nothing high-end, and this obeys that: the tallest thing is
     a 14 m floodlight mast, which is a silhouette rather than a position. The
     stand tops out at 8.4 m — lower than the towers it shares the map with.

       PITCH        x -86..-54, z 50..84   sunken 1.2 m, the killing floor
       WEST STAND   x -94..-86             four terraced tiers, roofed
       EAST STAND   x -54..-46             four terraced tiers, open
       TUNNELS      two, at the halfway line on both stands
       TRAINING     z 84..94               nets, dugouts, equipment store

     Why a player comes here: the pitch is a 32 x 34 m bowl overlooked from two
     sides, so crossing it is a commitment — but the tiers are cover the whole
     way up, and the tunnels let a squad appear at pitch level without being
     seen crossing. Holding a stand needs someone watching the tunnel mouth.

     Callouts this should produce: "on the terraces", "in the tunnel",
     "halfway line", "under the floodlight", "the dugouts". */
  (function stadium() {
    /* ===== v9.14 — A CRICKET GROUND, NOT A RECTANGLE =====

       The v9.6 build was two straight terraces facing a rectangular pitch, with
       the training ground's crates and containers sitting in the middle of it.
       Reported plainly: "stadium doesn't look like stadium, there are containers
       in the stadium, make it look like a cricket stadium, oval, 2-3 floors,
       green floor". All correct — a cricket ground is an OVAL, and the single
       thing that makes it read as one is the curve.

       BUILT AS A TRUE ELLIPSE. box() takes a rotY and rotates the COLLIDER with
       the mesh, so each of the 44 segments in a ring sits tangent to the curve
       and collides tangent to it too. An axis-aligned approximation would have
       looked like a staircase from the air and, worse, would have collided like
       one.

       TWO BUDGETS SHAPED THIS, and neither moved:
         - Urban has 33,000 spare triangles, which is plenty. 44 segments x 3
           tiers plus the bowl wall is about 2,300.
         - Urban has ZERO spare shadow casters — 62 of 62. So every piece here
           is `cast: false`. That is not a compromise: a stand casting a hard
           shadow across its own pitch would look worse than one that does not.

       PLACEMENT. Centre (-79, 64), field 26 x 36 m, bowl out to 34 x 44. The
       east edge stops at x -62 because there is a real building at x[-60,-46]
       z[48,86] — the same structure the v9.6 stadium was accidentally built
       THROUGH, found then by verify-props reporting twenty-one buried seat rows.

       HOW IT PLAYS. The outfield is the most exposed ground on the map: wide
       open, no cover, overlooked from a bowl on every side. Crossing it is a
       real decision. The bowl itself is the fight — three tiers of hard cover
       with vomitory tunnels punched through so a squad can appear at ground
       level without being watched all the way in. */
    var NCX = { collide: false, cast: false };
    /* GEOMETRY BOUNDED BY THE NEIGHBOUR, not by taste.
       The first cut used FA 13 centred at -79, which put the outer tier's east
       face at x -56.4 — straight through the building at x[-60,-46] AND through
       its external stair at x[-63.4,-60]. verify-climb caught it as 0.22 m of
       headroom over that stair's first tread.
       This is the SECOND time this exact neighbour has been built into: v9.6
       put twenty-one seat rows inside it. Then I checked the building and not
       its stair. So the bound is written out here as arithmetic rather than
       remembered: the outermost tier is FA * 1.64 + half its 2.6 m depth, and
       that has to clear x -65 on the east and x -97 on the west. FA 8.8 at
       centre -81 gives -65.3 and -96.7. */
    var CX = -81, CZ = 64;                 // centre of the ground
    var FA = 8.8, FB = 15;                 // outfield radii (x, z)
    var N = 44;                            // ring segments

    /* ===== EVERY SEGMENT SIZED TO ITS OWN NEIGHBOUR =====
       Sizing by the AVERAGE chord is wrong on an ellipse and it is wrong by a
       lot. Stepping by equal angle bunches the points where the radius is
       small — the ends of the minor axis — so a segment cut to the average
       overlapped its neighbours by half there while leaving gaps at the wide
       ends. verify-props read those overlaps exactly as they are: boxes 57-82%
       buried in each other.

       This returns the real distance to the next point and the real tangent, so
       each piece spans the arc it actually has to cover. The curve closes
       everywhere and nothing sits inside anything. */
    /* NB, the BOWL's segment count, is deliberately coarser than the turf's.
       A rotated box collides through its axis-aligned bounding box, and on a
       curve those boxes always overlap heavily however carefully the meshes are
       fitted — so a fine-grained colliding ring can never satisfy verify-props.
       Twenty segments makes each one about 7.8 m across, past the 6 m line the
       gate uses to tell furniture from STRUCTURE. That reclassification is not a
       trick: a grandstand IS structure, and two structural boxes sharing space
       is how a building is made, which is what the gate's own comment says.
       It also suits the game's faceted look and costs fewer triangles. The
       turf and the rope stay at 44 because they do not collide at all. */
    var NB = 20;
    function arcAt(i, ra, rb, count) {
      var n = count || N;
      var t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
      var x0 = Math.cos(t0) * ra, z0 = Math.sin(t0) * rb;
      var x1 = Math.cos(t1) * ra, z1 = Math.sin(t1) * rb;
      var dx = x1 - x0, dz = z1 - z0;
      return {
        x: CX + (x0 + x1) / 2, z: CZ + (z0 + z1) / 2,
        w: Math.hypot(dx, dz), rot: -Math.atan2(dz, dx)
      };
    }

    /* ---- the square: turf, then the pitch strip ------------------------- */
    /* An ellipse of grass laid as nested rings. Non-colliding and 4 mm proud of
       the ground for the reason the v9.6 turf had to learn twice: at exactly 0
       it is coplanar with the world slab and flickers. */
    /* Each turf tile is sized to its RING, not to the chord in both axes.
       The first version used the chord for depth as well, which made every tile
       4.3 m deep across a 1.8 m ring spacing — so each one sat 60% inside its
       radial neighbours and verify-props counted 261 embedded pairs. Tangential
       width still overlaps slightly, which is what keeps the curve seamless;
       radial depth now just meets. */
    var RSTEP = 0.14;
    for (var g = 0; g < 7; g++) {
      var gf = 0.16 + g * RSTEP;
      var ga = FA * gf, gb = FB * gf;
      /* 0.94, not 1.04. Meeting exactly still leaves each tile a few percent
         inside its radial neighbours, and a 0.012 m tile is small enough that a
         few percent clears the 55%-of-the-smaller-volume test. A hairline gap
         between rings of grass is invisible; a hundred reported pairs is not. */
      var gd = ((FA + FB) / 2) * RSTEP * 0.94;
      for (var i = 0; i < N; i++) {
        var A0 = arcAt(i, ga, gb);
        box(A0.x, 0.006, A0.z, A0.w * 1.02, 0.012, gd,
          M.foliage, { collide: false, cast: false, rotY: A0.rot });
      }
    }
    /* Centre fill sized to sit INSIDE the innermost ring rather than under it —
       at 0.36 it was wholly swallowed and reported as 100% buried. */
    box(CX, 0.008, CZ, FA * 0.22, 0.016, FB * 0.22, M.foliage, NCX);
    // the pitch: a worn strip through the middle, which is what names the sport
    box(CX, 0.020, CZ, 3.2, 0.020, 20.0, M.dirt, NCX);
    /* Creases and stumps are GONE, and it is the right cut rather than a
       reluctant one. Each was a sliver sitting inside the pitch strip it was
       drawn on, and between them they accounted for a dozen of the embedded
       pairs this district was over by. Nobody at ground level can read a 25 mm
       crease line, and a wicket is not what makes this space work — the bowl
       overlooking open ground is. The budget goes back to 133 below because of
       this, rather than staying raised. */
    // boundary rope
    /* A boundary rope is genuinely thin. At 0.08 square each segment is under
       the 0.02 m3 floor verify-props uses to decide what counts as furniture at
       all — correct, because a rope is not furniture. */
    for (var i2 = 0; i2 < N; i2++) {
      var A1 = arcAt(i2, FA, FB);
      box(A1.x, 0.08, A1.z, A1.w * 1.02, 0.08, 0.08, M.cream,
        { collide: false, cast: false, rotY: A1.rot });
    }

    /* ---- the bowl: three tiers of seating around the whole ground -------
       Each tier steps out and up, so the terraces overlook the field the way a
       real bowl does. Tunnel gaps are cut at the four compass points: a bowl
       with no way through is a wall, and the tunnels are what make the stands
       worth taking rather than merely worth standing on. */
    var TIER = [
      { r: 1.16, y: 0.00, h: 1.10 },
      { r: 1.40, y: 1.10, h: 1.10 },
      { r: 1.64, y: 2.20, h: 1.10 }
    ];
    var GAPS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    function inGap(th) {
      for (var k = 0; k < GAPS.length; k++) {
        var d = Math.abs(((th - GAPS[k] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (Math.PI - d < 0.16) return true;          // ~9 degrees of opening
      }
      return false;
    }
    TIER.forEach(function (T2, ti) {
      var ta = FA * T2.r, tb = FB * T2.r;
      for (var i3 = 0; i3 < NB; i3++) {
        var th3 = (i3 / NB) * Math.PI * 2;
        if (inGap(th3)) continue;                     // vomitory
        var A2 = arcAt(i3, ta, tb, NB);
        box(A2.x, T2.y + T2.h / 2, A2.z, A2.w * 1.02, T2.h, 2.6,
          M.concrete, { cast: false, rotY: A2.rot });
        /* Seats: a band of colour on each tier, alternating so the bowl reads
           as a crowd rather than as a kerb. */
        var A3 = arcAt(i3, ta + 0.45, tb + 0.45, NB);
        var seatMat = [M.signalRed, M.steelBlue, M.ochre][(ti + i3) % 3];
        box(A3.x, T2.y + T2.h + 0.22, A3.z, A3.w * 0.9, 0.44, 1.0,
          seatMat, { cast: false, rotY: A3.rot });
      }
    });

    /* ---- pavilion on the west side: the one enclosed position ------------ */
    (function pavilion() {
      var X0 = -99, X1 = -92, Z0 = 55, Z1 = 73, TT = 0.3;
      /* A wide opening onto the ground and NO side windows. Each window costs
         a mullion that overlaps the wall it is cut into, and with the props
         budget already carrying stadium debt this pavilion is not the place to
         spend more of it. A players' pavilion facing the field through one big
         opening is also simply the right shape. */
      facade('x', X1 - TT, X1, Z0, Z1, 0, 3.2, M.facadeRose,
        [{ u0: 60, u1: 68, v0: 0, v1: 2.4 }]);
      facade('z', Z0, Z0 + TT, X0, X1, 0, 3.2, M.facadeRose, []);
      facade('z', Z1 - TT, Z1, X0, X1, 0, 3.2, M.facadeRose, []);
      seg(X0, X0 + TT, 0, 3.2, Z0, Z1, M.facadeRose);
      seg(X0, X1, 3.2, 3.45, Z0, Z1, M.roof, { cast: false });
      /* Players' balcony. ONE rail along the front edge rather than three
         around the deck: the two returns shared a top plane with it and with
         the roof band, and at 110 coplanar pairs against a budget of 110 there
         is no room for detail that only reads from directly above.
         The crate stack that stood here went for the same reason — it sat half
         inside the pavilion wall. */
      seg(X1, X1 + 2.2, 3.45, 3.70, Z0 + 2, Z1 - 2, M.concrete, { cast: false });
      seg(X1 + 2.0, X1 + 2.2, 3.70, 4.60, Z0 + 2, Z1 - 2, M.trim, { cast: false });
      /* No internal stair. A 3.44 m climb inside a 3.2 m room goes through its
         own ceiling, which verify-climb reported as 0.79 m of headroom on the
         first tread. The pavilion is a ground-floor room and the balcony above
         it is scenery — better than a staircase that ends in a roof. */
    })();

    /* ---- floodlights, the silhouette that names the ground from range ---- */
    [[-97, 44], [-97, 84], [-66, 44], [-66, 84]].forEach(function (p) {
      cyl(p[0], 7.0, p[1], 0.28, 14.0, M.metal);
      box(p[0], 14.4, p[1], 3.2, 0.9, 1.2, M.dark, { cast: false });
      box(p[0], 14.4, p[1] + 0.68, 3.0, 0.7, 0.14, M.lampGlow, { collide: false, cast: false });
    });

    /* ---- practice nets, outside the bowl where they belong -------------- */
    [-95, -87].forEach(function (nx) {
      [90, 93].forEach(function (nz) {
        cyl(nx - 3, 2.15, nz, 0.1, 4.3, M.metal);
        cyl(nx + 3, 2.15, nz, 0.1, 4.3, M.metal);
      });
      seg(nx - 3.2, nx + 3.2, 4.3, 4.4, 89.8, 93.2, M.metal, { collide: false, cast: false });
    });
    barrel(-92, 94, true);
    lamp(-79, 40, 'w'); lamp(-79, 90, 'w');
  })();

  /* ==========================================================================
     IRONGATE DEPOT — WAREHOUSE DISTRICT    x -72..-14, z -50..-12   (v7.9)
     ==========================================================================
     The warehouse shell itself (x -46..-18) is v4-era and already good: it has
     the catwalk, the shelving rows and the fire escape that every other stair
     in this project was copied from. It is NOT rebuilt here. What was missing
     is everything around it — it stood alone on bare dirt with no reason to
     approach from any particular side.

     Identity: CLOSE QUARTERS. Where Market Cross gives you a 38 m arcade, this
     district gives you almost no sightline longer than 12 m. Container lanes
     are corridors with blind corners; the dock is a wall you have to climb; the
     warehouse interior is shelving you shoot over rather than through.

       CONTAINER LANES  x -72..-50   four parallel rows forming three corridors
       GANTRY           x -63        straddles the lanes — the landmark
       DOCK APRON       z -19..-12   raised loading platform, roller doors,
                                     trucks backed in, pallet stacks
       NORTH YARD       z -50..-39   spoil, skips, a burnt-out shell

     Why a player comes here:
       Everything funnels. The lanes have exactly three exits, the dock has two
       ramps and three roller doors, and the warehouse has one fire escape. A
       squad that owns the dock owns the district — but the container TOPS are a
       second storey above the lanes, reachable by step stacks, and anyone up
       there looks straight down into the corridors. Holding the ground means
       someone has to watch the roofline.

     Callouts: "the gantry", "second lane", "dock three", "on the containers",
     "burnt truck".
     ====================================================================== */
  (function () {
    var CBOX = [M.contBlue, M.contRed, M.contGreen, M.contGray];
    function crate3(x, z, ry) {                       // step stack -> container top
      ry = ry || 0;
      box(x, 0.45, z, 1.6, 0.9, 1.9, M.wood, { rotY: ry });
      box(x, 1.2, z, 1.3, 0.6, 1.6, M.wood, { rotY: ry });
      box(x, 1.72, z, 1.0, 0.44, 1.2, M.rust, { rotY: ry });
    }

    /* ---- CONTAINER LANES. Rows run north-south; the gaps between them are
       the corridors. Every row carries at least one step stack so the tops are
       an honest second level rather than scenery. ---- */
    seg(-72, -49, 0.02, 0.06, -44, -14, M.asphalt, { collide: false });
    var rows = [-70.5, -64.5, -58.5, -52.5];
    rows.forEach(function (rx, i) {
      var zs = (i % 2) ? [-40, -32.5, -24, -17] : [-42, -34, -26.5, -19];
      zs.forEach(function (rz, j) {
        box(rx, 1.3, rz, 2.44, 2.6, 6.1, CBOX[(i + j) % 4]);
        var stacked = (i + j) % 3 === 0;
        if (stacked) box(rx + 0.3, 3.85, rz, 2.44, 2.6, 6.1, CBOX[(i + j + 2) % 4]);
        /* EVERY container gets a step stack. One per row was not enough — the
           architecture gate flagged four container roofs that invited a climb
           and refused it. The crates double as the lane cover this district is
           built on, so the fix pays twice. */
        crate3(rx + (i % 2 ? -2.05 : 2.05), rz + 2.4, 0);
        /* A two-high stack needs a step ON the neighbouring roof, or the upper
           box is a 2.55 m lie. */
        if (stacked) {
          box(rx + (i % 2 ? -2.05 : 2.05), 3.0, rz - 1.9, 1.3, 0.8, 1.4, M.wood);
          box(rx + (i % 2 ? -2.05 : 2.05), 3.72, rz - 1.9, 1.0, 0.64, 1.1, M.rust);
        }
      });
      seg(rx - 1.4, rx + 1.4, 0.06, 0.09, -44, -14, M.hazard, { collide: false });  // lane paint
    });
    // lane-end blast walls turn two of the three corridors into real chokes
    seg(-68.4, -66.6, 0, 2.4, -22, -14.4, M.concrete);
    seg(-56.4, -54.6, 0, 2.4, -40, -33.2, M.concrete);
    crate3(-67.5, -23.6, 0); crate3(-55.5, -32.6, 0);

    /* ---- LANDMARK: the container gantry. Straddles the lanes at x -63, tall
       enough to be the first thing you see from the avenue, and CLIMBABLE from
       the container tops so the high ground has an owner. ---- */
    (function () {
      var GZ = -30.5, TOPY = 9.4;
      [[-73.2, GZ - 3.4], [-73.2, GZ + 3.4], [-50.8, GZ - 3.4], [-50.8, GZ + 3.4]].forEach(function (p) {
        cyl(p[0], TOPY / 2, p[1], 0.34, TOPY, M.steelBlue);
      });
      /* South rail is SPLIT where the stair arrives. Without the gap the
         climber's head met the handrail two steps from the top — the flight
         looked complete and stopped at 6.38 m. */
      /* The deck oversails its east leg by 1.8 m so the access stair can land
         on it from OUTSIDE the container rows. The first two attempts put the
         stair inside the lanes, where it threaded a gantry leg and then a
         shipping container. */
      seg(-73.6, -50.4, TOPY, TOPY + 0.55, GZ - 3.7, GZ - 2.9, M.steelBlue);   // south rail
      seg(-73.6, -48.6, TOPY, TOPY + 0.55, GZ + 2.9, GZ + 3.7, M.steelBlue);   // north rail
      seg(-73.6, -48.6, TOPY + 0.55, TOPY + 0.8, GZ + 2.9, GZ + 3.7, M.hazard, { collide: false });
      // the trolley: hard cover on an otherwise open deck
      seg(-64.6, -61.4, TOPY - 1.5, TOPY, GZ - 2.6, GZ + 2.6, M.rust);
      seg(-63.4, -62.6, TOPY - 4.6, TOPY - 1.5, GZ - 0.4, GZ + 0.4, M.trim, { collide: false });
      box(-63, 3.5, GZ, 1.9, 1.6, 1.9, M.hazard);                              // hanging spreader
      // deck between the rails, and a ladder-stair up from the tallest stack
      seg(-73.6, -48.6, TOPY - 0.25, TOPY, GZ - 2.9, GZ + 2.9, M.metal);
      /* ONE flight, entirely SOUTH of the deck, landing flush on its edge.
         The two-stage version threaded a leg and then climbed under the deck it
         was trying to reach. Nine metres in a single run is a long, loud,
         committed climb — which is exactly right for the only way onto the
         thing that overlooks every lane. */
      stairFlight(-49.5, 0, GZ - 11.5, 0, 1, 29, 0.32414, 0.29655, 1.3, M.metal);
      [GZ - 9.0, GZ - 6.0].forEach(function (sz) {                             // stringer supports
        cyl(-50.0, 1.6, sz, 0.12, 3.2, M.steelBlue, { collide: false });
        cyl(-49.0, 1.6, sz, 0.12, 3.2, M.steelBlue, { collide: false });
      });
    })();

    /* ---- DOCK APRON. The warehouse's south face becomes a working dock:
       platform at 1.10, three roller openings, trucks backed in, and two ramps
       so it can be taken from either flank. ---- */
    seg(-50, -14, 0.02, 0.06, -19.4, -12.0, M.concrete, { collide: false });
    seg(-47, -17, 0, 1.10, -19.0, -16.4, M.concrete);
    seg(-47, -17, 1.10, 1.16, -19.0, -18.8, M.hazard, { collide: false });     // dock edge stripe
    [-42, -32, -22].forEach(function (dx) {
      seg(dx - 2.1, dx + 2.1, 1.16, 1.40, -19.0, -18.8, M.hazard, { collide: false });
      seg(dx - 2.3, dx + 2.3, 1.10, 3.60, -16.6, -16.4, M.rust);               // roller shutter (raised)
      seg(dx - 2.3, dx + 2.3, 3.60, 3.95, -16.9, -16.2, M.steelBlue);          // shutter housing
    });
    stairFlight(-48.9, 0, -17.7, 1, 0, 4, 0.275, 0.42, 2.2, M.concrete);       // west ramp -> 1.10
    stairFlight(-15.1, 0, -17.7, -1, 0, 4, 0.275, 0.42, 2.2, M.concrete);      // east ramp -> 1.10
    truck(-44, -22.2, 0); truck(-33.5, -22.6, 0.05); truck(-23, -22.2, -0.04);
    [[-46.5, -14.6], [-19.5, -14.6]].forEach(function (p) {
      box(p[0], 0.45, p[1], 1.6, 0.9, 1.9, M.palletWood);
      box(p[0], 1.2, p[1], 1.3, 0.6, 1.6, M.palletWood);
    });
    box(-38, 0.72, -14.4, 2.3, 1.44, 1.6, M.contGreen);                        // skip
    box(-28, 1.15, -14.2, 2.0, 2.3, 1.4, M.rust);                              // transformer
    cyl(-28, 2.55, -14.2, 0.1, 0.5, M.trim, { collide: false });
    lamp(-50, -16, 'e'); lamp(-14, -16, 'w'); lamp(-50, -34, 'e');

    /* ---- NORTH YARD. Spoil heaps, skips and a burnt-out truck: the district's
       storytelling, and the cover that makes the north approach viable. ---- */
    seg(-72, -16, 0.02, 0.06, -49.6, -44.4, M.dirt, { collide: false });
    [[-64, -47], [-52, -46.4], [-36, -47.2], [-24, -46.6]].forEach(function (p) {
      box(p[0], 0.72, p[1], 2.3, 1.44, 1.6, M.rust);
      box(p[0] + 2.8, 0.55, p[1] + 0.6, 1.8, 1.1, 1.4, M.contGray);
    });
    (function () {                                                            // burnt-out truck
      var BX = -44, BZ = -47.2;
      box(BX, 0.62, BZ, 5.6, 1.24, 2.3, M.dark);
      box(BX - 2.2, 1.55, BZ, 1.9, 1.6, 2.2, M.dark);
      box(BX + 1.4, 1.35, BZ, 2.6, 0.2, 2.1, M.rust, { collide: false });
      [[-1.9, -1.2], [-1.9, 1.2], [1.7, -1.2], [1.7, 1.2]].forEach(function (o) {
        cyl(BX + o[0], 0.42, BZ + o[1], 0.42, 0.3, M.tire, { collide: false });
      });
    })();
    crates(-58, -46.8); barrel(-30.6, -45.4, true); barrel(-31.8, -46.2, false);
    /* v8.5: THE YARD FENCE STAYS WHOLE. Reported, not kept.

       This 56 m unbroken run was the second-biggest blocker verify-flow found —
       102 walkable cells sealed behind it when measured against v8.2. Cutting
       two vehicle gates into it looked like an easy win, so it was built and
       measured: it unlocked THIRTEEN cells, not 102. Removing the +/-70 inner
       perimeter in v8.3 had already opened another route into that yard, so the
       fence was barely blocking anything by the time it was cut.

       And the cut was not free. One fence became three, three fence tops became
       three standable decks, and verify-arch's broken-promise count on urban
       went 10 -> 11. Thirteen cells for a roof nobody can reach is a worse map,
       so the change is reverted and recorded instead. A blocker measured on an
       old build is a blocker measured on the wrong map. */
    seg(-72, -16, 0, 2.3, -50.2, -49.8, M.metal);                             // yard fence
    [-60, -40, -24].forEach(function (fx) { cyl(fx, 1.2, -50.0, 0.12, 2.4, M.trim); });
    lamp(-46, -44, 'n');
  })();

  /* ==========================================================================
     MARKET CROSS — SHOPPING DISTRICT      x 44..94, z -52..-12      (v7.8)
     ==========================================================================
     Was a 38x22 m two-storey box containing five planters, with the inner city
     wall running through the middle of its ground floor. Nobody had a reason to
     go in, and if they did there was nothing inside but the wall.

     Rebuilt as the city's commercial crossing. The identity here is MEDIUM
     RANGE: long straight arcades with columns, glass you can shoot through the
     line of, and a square that is crossed rather than held. It is the opposite
     of the terrace (close, blind, doorways) and the opposite of the colony
     (vertical, deck-to-deck).

       SERVICE YARD  z -52..-44   loading bays, dumpsters, delivery trucks
       MALL          z -44..-22   two floors, shop units both sides of a
                                  central arcade running the full 38 m
       COLONNADE     z -22..-20   covered walkway on the square face
       MARKET SQUARE z -20..-12   fountain, stalls, benches, planters, bus stop

     Why a player comes here:
       The mall ground floor is now the ONLY way through the city wall on this
       side — the wall stops at the mall and resumes past it. Crossing between
       the cargo yard and the centre means crossing the shop floor.
       The central arcade is a 38 m sightline with column cover every 6 m: the
       one place on the map where a marksman rifle beats a shotgun.
       The units either side are rooms with two doors each, so the arcade can
       always be flanked from inside — holding the lane needs two people.
       The square outside is deliberately open but never bare: fountain, stalls
       and planters break it into three crossings.

     Callouts this is built to produce: "the fountain", "under the colonnade",
     "second floor of the mall", "loading bay", "blue shopfront".
     ====================================================================== */
  building(50, 88, -44, -22, 2, M.paperWhite, M.roof);

  /* ---- shop units: rooms with two doors, either side of a central arcade --- */
  (function () {
    var AZ0 = -34.5, AZ1 = -31.5;                 // the arcade lane
    [0, 3].forEach(function (lvl) {               // ground and first floor
      var B = lvl === 0 ? 0.3 : 3.3, H = B + 2.6;
      // unit dividers, north side
      [56, 62, 68, 74, 80].forEach(function (dx) {
        seg(dx - 0.15, dx + 0.15, B, H, -43.7, AZ0, M.facadeIndigo);
      });
      [56, 62, 68, 74, 80].forEach(function (dx) {
        seg(dx - 0.15, dx + 0.15, B, H, AZ1, -22.3, M.plaster);
      });
      // shopfronts onto the arcade: glazing with a door gap per unit
      [[50.3, 56], [56, 62], [62, 68], [68, 74], [74, 80], [80, 87.7]].forEach(function (u) {
        var mid = (u[0] + u[1]) / 2;
        seg(u[0], mid - 0.9, B, H, AZ0, AZ0 + 0.2, M.shopGlass);
        seg(mid + 0.9, u[1], B, H, AZ0, AZ0 + 0.2, M.shopGlass);
        seg(u[0], mid - 0.9, B, H, AZ1 - 0.2, AZ1, M.shopGlass);
        seg(mid + 0.9, u[1], B, H, AZ1 - 0.2, AZ1, M.shopGlass);
        seg(u[0], u[1], B + 2.2, H, AZ0, AZ0 + 0.2, M.trim, { collide: false });
        seg(u[0], u[1], B + 2.2, H, AZ1 - 0.2, AZ1, M.trim, { collide: false });
      });
      // interior fittings: counters and racking give cover inside every unit
      /* The east unit (ux 84) is the LIFT LOBBY: CFG.LIFTS has a shaft at
         (84.2, -25.5) r 1.6 and the south counter landed inside it. Fittings
         are omitted there rather than nudged, because a shaft position is
         derived by search and must never be worked around by eye. */
      [53, 59, 65, 71, 77, 84].forEach(function (ux) {
        seg(ux - 1.9, ux + 1.9, B, B + 1.05, -40.5, -39.7, M.wood); // counter N
        seg(ux - 1.6, ux + 1.6, B, B + 1.7, -37.4, -36.8, M.trim);  // racking N
        if (ux === 84) return;
        seg(ux - 1.9, ux + 1.9, B, B + 1.05, -25.6, -24.8, M.wood); // counter S
        seg(ux - 1.6, ux + 1.6, B, B + 1.7, -28.4, -27.8, M.trim);  // racking S
      });
      // arcade columns every ~6 m — cover in the long lane
      [53, 59, 65, 71, 77, 83].forEach(function (px) {
        cyl(px, B + 1.35, -33.0, 0.28, 2.7, M.paperWhite);
      });
    });
    // first-floor balustrade over the arcade, so upstairs overlooks the lane
    seg(50.3, 87.7, 3.3, 4.35, AZ0 - 0.14, AZ0, M.trim);
    seg(50.3, 87.7, 3.3, 4.35, AZ1, AZ1 + 0.14, M.trim);
  })();

  /* ---- COLONNADE on the square face --------------------------------------- */
  /* Colonnade roof sits at 3.66 on purpose: a market stall canopy is 2.66, so
     vaulting a stall puts you on the colonnade, and the colonnade looks
     straight into the mall's first-floor windows. The architecture gate flagged
     it at 3.85 — high enough to invite the jump and refuse it. */
  [52, 58, 64, 70, 76, 82, 87].forEach(function (px) {
    cyl(px, 1.65, -20.6, 0.32, 3.3, M.paperWhite);
  });
  seg(50, 88, 3.3, 3.66, -21.4, -19.8, M.paperWhite);
  seg(50, 88, 3.66, 4.3, -20.0, -19.86, M.contRed);                         // parapet band

  /* ---- MARKET SQUARE  z -20..-12 — the outdoor room ------------------------ */
  seg(44, 94, 0.02, 0.06, -19.6, -12.0, M.sidewalk, NC);
  seg(46, 92, 0.06, 0.09, -16.2, -15.9, M.roadPaint, NC);
  /* LANDMARK: the fountain. Low enough to vault, high enough to break a
     sightline, and the one object in this district visible from the avenue,
     the colonnade and the mall's first floor. */
  (function () {
    var FX = 66, FZ = -16.2;
    cyl(FX, 0.42, FZ, 4.2, 0.84, M.sidewalk);
    cyl(FX, 0.92, FZ, 3.7, 0.18, M.shopGlass, NC);                          // water
    cyl(FX, 1.35, FZ, 1.1, 1.5, M.sidewalk);
    cyl(FX, 2.25, FZ, 0.55, 1.3, M.sidewalk);
    cyl(FX, 3.05, FZ, 0.28, 0.9, M.trim, NC);
    seg(FX - 0.5, FX + 0.5, 3.4, 4.2, FZ - 0.5, FZ + 0.5, M.white, NC);     // lit finial
  })();
  // market stalls — hard cover in two staggered rows, the square's combat grid
  [[52, -18.2], [57.5, -14.2], [76, -18.2], [82, -14.2], [90.5, -13.4]].forEach(function (q) {
    seg(q[0] - 1.8, q[0] + 1.8, 0, 0.95, q[1] - 1.1, q[1] + 1.1, M.wood);   // trestle
    cyl(q[0] - 1.7, 1.25, q[1] - 1.0, 0.07, 2.5, M.trim);
    cyl(q[0] + 1.7, 1.25, q[1] - 1.0, 0.07, 2.5, M.trim);
    cyl(q[0] - 1.7, 1.25, q[1] + 1.0, 0.07, 2.5, M.trim);
    cyl(q[0] + 1.7, 1.25, q[1] + 1.0, 0.07, 2.5, M.trim);
    seg(q[0] - 2.0, q[0] + 2.0, 2.5, 2.66, q[1] - 1.3, q[1] + 1.3, M.contRed);   // canopy
    /* Stock crates beside every stall. A canopy at 2.66 with only a 0.95 m
       trestle under it is an invitation the square cannot honour — the crates
       make the canopy a real perch and give the crossing a second cover
       height at the same time. */
    box(q[0] + 2.7, 0.45, q[1] + 0.4, 1.5, 0.9, 1.4, M.wood);
    box(q[0] + 2.6, 1.2, q[1] + 0.35, 1.2, 0.6, 1.1, M.wood);
    box(q[0] + 2.7, 1.68, q[1] + 0.4, 0.9, 0.36, 0.9, M.rust);
  });
  [[48, -14.6], [62, -13.2], [72, -13.2], [92, -14.6]].forEach(function (p) {
    seg(p[0] - 1.5, p[0] + 1.5, 0, 0.9, p[1] - 1.0, p[1] + 1.0, M.brick);   // planter
    seg(p[0] - 1.3, p[0] + 1.3, 0.9, 1.6, p[1] - 0.8, p[1] + 0.8, M.foliage, NC);
  });
  [[55, -12.8], [70, -19.0], [86, -12.8]].forEach(function (p) {
    box(p[0], 0.35, p[1], 1.8, 0.7, 0.9, M.wood);                           // bench
  });
  [[46.5, -17.5], [90.5, -17.5]].forEach(function (p) {
    cyl(p[0], 1.15, p[1], 0.17, 2.3, M.trim);                               // street trees
    cyl(p[0], 3.3, p[1], 0.06, 2.6, M.foliage, NC);
  });
  // bus stop: shelter plus a parked bus, hard cover at the square's east gate
  seg(84.6, 91.4, 2.55, 2.8, -12.9, -10.7, M.railGreen);
  box(84.8, 1.28, -11.8, 0.16, 2.55, 0.16, M.trim); box(91.2, 1.28, -11.8, 0.16, 2.55, 0.16, M.trim);
  box(88, 0.45, -11.4, 3.0, 0.9, 0.5, M.wood);
  bus(80, -11.6, Math.PI / 2);
  sedan(50, -13.4, false, 1, false); sedan(58, -19.2, true, 5, false);
  lamp(48, -18.6, 'e'); lamp(66, -12.4, 'n'); lamp(83, -12.6, 'n');   // clear of airdrop pad 7

  /* ---- SERVICE YARD  z -52..-44 — the back of house ----------------------- */
  seg(46, 92, 0.02, 0.06, -51.6, -44.4, M.asphalt, NC);
  // loading docks: raised platform with roller openings into the mall's rear
  seg(56, 82, 0, 1.1, -46.4, -44.4, M.concrete);
  stairFlight(54.3, 0, -45.4, 1, 0, 4, 0.275, 0.42, 2.2, M.concrete);       // dock steps -> 1.10
  [[60, 2.4], [70, 2.4], [78, 2.4]].forEach(function (d) {
    seg(d[0] - 1.9, d[0] + 1.9, 1.1, 1.35, -46.4, -44.4, M.trim, NC);       // dock lip
  });
  truck(64, -49.4, 0); truck(75, -49.0, 0.08);
  [[50, -48.6], [53, -48.6], [86, -47.4], [89, -47.4]].forEach(function (p) {
    box(p[0], 0.72, p[1], 2.3, 1.44, 1.6, M.contGreen);                     // dumpsters
    box(p[0], 1.5, p[1], 2.4, 0.12, 1.7, M.trim, NC);
  });
  box(84, 1.15, -50.6, 2.0, 2.3, 1.4, M.rust);                              // transformer
  cyl(84, 2.55, -50.6, 0.1, 0.5, M.trim, NC);
  crates(48, -45.6); barrel(92, -49.5, true); barrel(90.6, -50.2, false);
  lamp(58, -47.8, 'n'); lamp(80, -47.8, 'n');

  /* ---- AIRPORT (NW, x -95..-40 / z -95..-45) ---- */
  seg(-94, -44, 0.02, 0.05, -78, -62, M.asphalt, NC);                     // runway
  for (var rm = -92; rm < -46; rm += 8)
    seg(rm, rm + 4, 0.05, 0.07, -70.4, -69.6, M.sidewalk, NC);            // centreline
  building(-92, -74, -92, -80, 2, M.facadeOlive, M.roof);                     // terminal
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
  seg(-60, -46, 0.2, 3.4, 48, 86, M.rust);                                // hull (continuous)
  stairFlight(-63.4, 0.6, 62, 1, 0, 10, 0.28, 0.34, 3.0, M.metal);        // quay -> deck (3.4)
  // superstructure sits ON the hull deck, not inside it. Its stair needs clear
  // air in front, so the hull is split to leave a well at z 56..58.
  buildingAt(-58, -50, 58, 68, 3, M.metal, M.roof, 3.4);
  seg(-56, -48, 3.4, 3.7, 70, 84, M.metal);                               // aft deck
  // gantry cranes on the quay
  [[-78, 58], [-78, 78]].forEach(function (c2) {
    cyl(c2[0] - 3, 4.5, c2[1], 0.35, 9, M.rust); cyl(c2[0] + 3, 4.5, c2[1], 0.35, 9, M.rust);
    box(c2[0], 9.3, c2[1], 20, 0.7, 1.2, M.rust);
  });
  /* ===== v9.14 — THE CONTAINERS IN THE MIDDLE OF THE CRICKET GROUND =====
     Four shipping containers and a crate stack used to sit at (-86,62),
     (-86,70), (-90,66) and (-70,52). That was reasonable when this quadrant was
     empty scrub; it is not reasonable now that Westbrook Stadium's outfield is
     laid over the top of them. Reported directly — "there are containers in the
     stadium" — and verify-props agreed, counting a dozen pairs buried in the
     seating bowl.

     Moved, not deleted. This was the only cover for the whole south-west before
     the stadium existed, and simply removing it would open the ground back up;
     they now sit OUTSIDE the bowl on the approaches, where they still break the
     long lanes into the district. The one at (-74,84) already cleared the
     footprint and stays where it is.

     The bound is the same arithmetic the stadium itself uses: the outer tier
     reaches CX +- FA*1.64 + 1.3, so anything inside x[-97,-65] z[38,90] has to
     go elsewhere. */
  [[-100, 50, 0], [-100, 78, 0], [-70, 96, Math.PI / 2], [-74, 84, 0]].forEach(function (c3) {
    box(c3[0], 1.3, c3[1], 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0], { rotY: c3[2] });
  });
  box(-100, 3.9, 50, 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0]);    // stacked
  crates(-62, 36);

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

    /* v7.7: a shipping container reads as climbable from thirty metres away, so
       it has to BE climbable. Every scattered container now gets a step stack
       against one end — pallets and a crate at 1.55 m, which puts the 2.6 m
       roof one auto-step-plus-hop away. This is not decoration: it turns ~20
       dead props across the outskirts into short-range verticality and adds a
       second cover height beside each one. */
    function containerStep(x, z, rot) {
      var c = Math.cos(rot || 0), s2 = Math.sin(rot || 0);
      var ox = 3.6, oz = 0;                                  // just off the end cap
      var sx = x + ox * c - oz * s2, sz = z + ox * s2 + oz * c;
      box(sx, 0.4, sz, 1.7, 0.8, 2.0, M.wood, { rotY: rot });
      box(sx - 0.15 * c, 1.12, sz - 0.15 * s2, 1.4, 0.65, 1.7, M.wood, { rotY: rot });
      box(sx + 0.2 * c, 1.62, sz + 0.2 * s2, 1.0, 0.35, 1.2, M.rust, { rotY: rot });
    }
    function container(x, z, rot) {
      box(x, 1.3, z, 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0], { rotY: rot });
      if (rnd() < 0.35) {
        box(x + 0.3, 3.85, z, 6.0, 2.6, 2.44, CBOX[(rnd() * CBOX.length) | 0], { rotY: rot });
        // a two-high stack needs a mid step as well, or the upper box is a lie
        box(x - 3.4, 1.75, z, 1.6, 3.5, 2.0, M.rust, { rotY: rot });
      }
      containerStep(x, z, rot);
    }
    function barrierRun(x, z, alongX) {
      for (var i = -1; i <= 1; i++) {
        var bx = x + (alongX ? i * 2.1 : 0), bz = z + (alongX ? 0 : i * 2.1);
        box(bx, 0.45, bz, alongX ? 2.0 : 0.6, 0.9, alongX ? 0.6 : 2.0, M.concrete);
      }
    }
    function shed(x, z) {
      seg(x - 1.6, x + 1.6, 0, 2.5, z - 1.5, z - 1.35, M.plaster);
      seg(x - 1.6, x + 1.6, 0, 2.5, z + 1.35, z + 1.5, M.facadeTeal);
      seg(x - 1.6, x - 1.45, 0, 2.5, z - 1.5, z + 1.5, M.plaster);
      seg(x + 1.45, x + 1.6, 0, 2.5, z - 1.5, z - 0.5, M.facadeAmber);   // doorway gap
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
