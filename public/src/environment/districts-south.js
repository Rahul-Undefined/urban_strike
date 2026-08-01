/* District: south expansion (construction site, row houses, rail yard,
   office roof access). Receives shared build helpers via the T contract
   from environment/world.js — the template for future V4.2 districts. */
World._buildPart3 = function (T) {
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight, facade = T.facade, win = T.win;
  var container = T.container, crates = T.crates, brokenWall = T.brokenWall, lamp = T.lamp, barrel = T.barrel;
  var M = T.M, rnd = T.rnd, scene = T.scene, emissive = T.emissive;
  var sedan = T.sedan, van = T.van;

  /* ===== SUNKEN TUNNEL  x[45.4,48.6] z[-28,-9], floor -2.55 ===== */
  (function () {
    seg(45.4, 48.6, -2.85, -2.55, -28, -9, M.concrete);      // floor
    seg(45.1, 45.4, -2.85, 0, -28, -9, M.concrete);          // west wall
    seg(48.6, 48.9, -2.85, 0, -28, -9, M.concrete);          // east wall
    stairFlight(47, -2.55, -24.66, 0, -1, 9, 0.284, 0.36, 3.0, M.concrete); // north portal
    stairFlight(47, -2.55, -12.34, 0, 1, 9, 0.284, 0.36, 3.0, M.concrete);  // south portal
    seg(45.2, 48.8, -0.08, 0.24, -23, -13, M.concrete);      // roof (walk over it)
    [-21, -18, -15].forEach(function (z) {                    // support ribs
      seg(45.4, 48.6, -0.45, -0.08, z - 0.15, z + 0.15, M.trim);
    });
    var tl = new THREE.PointLight(0xffb35c, 0.85, 15, 1.5);
    tl.position.set(47, -1.05, -18); scene.add(tl);
    World.flickers.push(tl);
    barrel(44.3, -26.5, true); barrel(49.8, -10.2, true);    // portal markers
  })();

  /* ===== CONSTRUCTION SITE  x[-20,20] z[-70,-52] ===== */
  (function () {
    // Slab pad, split at the avenue edges (x=+-7). Overlapping the asphalt gave
    // two coplanar-within-4mm surfaces that z-fight past ~73m.
    seg(-21, -7, 0.004, 0.016, -71, -51, M.concrete, { collide: false, cast: false });
    seg(7, 21, 0.004, 0.016, -71, -51, M.concrete, { collide: false, cast: false });
    // skeleton building: 8 columns, 2 open slabs (no walls) — long sightlines
    [-12, -4, 4, 12].forEach(function (x) {
      [-66, -58].forEach(function (z) {
        seg(x - 0.25, x + 0.25, 0, 6.9, z - 0.25, z + 0.25, M.concrete);
      });
    });
    seg(-13, 13, 3.2, 3.5, -67, -57, M.concrete);   // slab 1
    seg(-13, 13, 6.6, 6.9, -67, -57, M.concrete);   // slab 2 — open sniper deck
    // exterior scaffold stairs on east edge (lane x[13.05,14.35])
    stairFlight(13.7, 0, -56.6, 0, -1, 11, 0.291, 0.34, 1.3, M.metal);       // ground -> slab 1
    stairFlight(13.7, 3.5, -62.2, 0, -1, 10, 0.34, 0.34, 1.3, M.metal);      // slab 1 -> slab 2
    seg(14.36, 14.44, 0.9, 7.4, -66, -56.4, M.trim);                          // scaffold sheeting (fall guard)
    // cover on the decks
    box(-8, 7.35, -62, 0.9, 0.9, 0.9, M.wood); box(-7.8, 8.1, -62.1, 0.65, 0.6, 0.65, M.wood);
    box(6, 7.35, -60, 0.9, 0.9, 0.9, M.wood);
    box(0, 7.35, -64, 0.9, 0.9, 0.9, M.wood);
    seg(-6, -2, 3.5, 4.15, -59, -58.2, M.dirt);                               // cement bags on slab 1
    // tower crane
    seg(-17.5, -14.5, 0, 2.4, -65.5, -62.5, M.concrete);
    [[-16.8, -64.8], [-15.2, -64.8], [-16.8, -63.2], [-15.2, -63.2]].forEach(function (p) {
      seg(p[0] - 0.09, p[0] + 0.09, 2.4, 15, p[1] - 0.09, p[1] + 0.09, M.rust);
    });
    box(-8, 14.8, -64, 19, 0.55, 0.7, M.rust, { collide: false });            // jib
    box(-20.5, 14.8, -64, 6.5, 0.55, 0.7, M.rust, { collide: false });        // counter-jib
    box(-2, 12.2, -64, 0.06, 4.6, 0.06, M.dark, { collide: false });          // hook cable
    // site props
    box(-19, 0.55, -55, 1.3, 1.1, 1.5, M.rust); cyl(-19, 1.55, -55, 0.62, 1.0, M.metal); // mixer
    box(8, 0.42, -68.4, 4, 0.84, 0.95, M.metal);                              // pipe stack
    crates(-6, -53.5); crates(10, -55.8);
    box(19, 1.1, -66, 1.1, 2.2, 1.1, M.contBlue); box(19, 1.1, -64.5, 1.1, 2.2, 1.1, M.contBlue); // porta booths
    // site fencing with entrance gaps
    [[-21, -13], [-9, 3], [7, 21]].forEach(function (r) { seg(r[0], r[1], 0, 1.9, -51.66, -51.58, M.metal); });
    [[-70, -63], [-59, -51.6]].forEach(function (r) { seg(-21.06, -20.98, 0, 1.9, r[0], r[1], M.metal); });
    [[-70, -64], [-58, -51.6]].forEach(function (r) { seg(20.98, 21.06, 0, 1.9, r[0], r[1], M.metal); });
    lamp(0, -50.2, 's');
    /* v7.5: the cool work-light PointLight here lit an OPEN-AIR deck that the
       sun and hemisphere already reach. Replaced with two emissive flood
       panels on a mast — same read (a lit construction site at dusk), one
       shared material, zero per-fragment shading cost. The two interior point
       lights on this map (tunnel, depot roof) were deliberately KEPT: they
       light enclosed volumes that no emissive prop can fake. */
    cyl(-2.4, 4.4, -61.6, 0.11, 8.8, M.trim, { collide: false });
    box(-2.4, 8.7, -61.0, 1.5, 0.42, 0.16, M.white, { collide: false, cast: false });
    box(-2.4, 8.2, -61.0, 1.5, 0.42, 0.16, M.white, { collide: false, cast: false });
    box(-2.4, 8.45, -61.25, 1.7, 1.2, 0.3, M.trim, { collide: false, cast: false });
  })();

  /* ===== DEPOT B  x[52,68] z[-12,16]  h10 — big east warehouse ===== */
  (function () {
    var X0 = 52, X1 = 68, Z0 = -12, Z1 = 16, TT = 0.35, TOP = 9.9;
    facade('x', X0, X0 + TT, Z0, Z1, 0, TOP, M.metal, [
      { u0: -6, u1: 0, v0: 0, v1: 4.5 }, { u0: 8, u1: 12, v0: 0, v1: 3 },
      win(-10, 6, 2, 1.6), win(3, 6, 2, 1.6), win(13, 6, 2, 1.6)
    ]);
    facade('x', X1 - TT, X1, Z0, Z1, 0, TOP, M.metal, [win(-9, 6, 2, 1.6), win(-1, 6, 2, 1.6), win(7, 6, 2, 1.6)]);
    facade('z', Z0, Z0 + TT, X0, X1, 0, TOP, M.metal, [{ u0: 56, u1: 58, v0: 0, v1: 2.6 }, win(53, 6, 2, 1.6), win(61, 6, 2, 1.6)]);
    facade('z', Z1 - TT, Z1, X0, X1, 0, TOP, M.metal, [win(55, 6, 2, 1.6), win(63, 6, 2, 1.6)]);
    seg(X0, X1, TOP, TOP + 0.3, Z0, Z1, M.roof);
    // roof parapet with a gap where the exterior stair arrives
    seg(X0, 65.5, 10.2, 10.75, 15.78, Z1, M.metal);
    seg(X0, X1, 10.2, 10.75, Z0, Z0 + 0.22, M.metal);
    seg(X0, X0 + 0.22, 10.2, 10.75, Z0, Z1, M.metal);
    seg(X1 - 0.22, X1, 10.2, 10.75, Z0, Z1, M.metal);
    // mezzanine along north half + rail + stair
    seg(52.35, 67.65, 4.0, 4.25, -11.65, -4, M.metal);
    seg(52.35, 67.65, 4.25, 5.25, -4.06, -3.98, M.trim);
    stairFlight(53, 0, 0.82, 0, -1, 13, 0.308, 0.34, 1.2, M.metal);
    // tall pallet racks (3 rows)
    [4, 8, 12].forEach(function (z) {
      seg(54, 62, 0, 1.15, z - 0.5, z + 0.5, M.wood);
      seg(54, 62, 2.0, 2.15, z - 0.5, z + 0.5, M.wood);
      seg(54, 62, 3.1, 3.25, z - 0.5, z + 0.5, M.wood);
      seg(54, 54.15, 1.15, 3.1, z - 0.5, z + 0.5, M.trim);
      seg(61.85, 62, 1.15, 3.1, z - 0.5, z + 0.5, M.trim);
    });
    crates(65, -9); barrel(66.5, 14.6, true); barrel(53.6, 14.8, false);
    // exterior stair to the roof (south face) — the long-climb sniper perch
    stairFlight(53.2, 0, 16.9, 1, 0, 17, 0.3, 0.33, 1.2, M.metal);
    seg(58.8, 60.4, 5.1, 5.35, 16.3, 17.55, M.metal);
    stairFlight(60.4, 5.35, 16.9, 1, 0, 16, 0.303, 0.33, 1.2, M.metal);
    seg(65.6, 67.6, 10.2, 10.45, 16.1, 17.55, M.metal);
    seg(59.55, 59.65, 0, 5.1, 17.4, 17.5, M.trim); // landing support post
    // roof cover
    box(56, 10.72, 2, 2, 1.05, 1.6, M.metal); box(63, 10.68, -6, 1.8, 0.95, 1.5, M.rust);
    var dl = new THREE.PointLight(0xffb35c, 1.0, 26, 1.5);
    dl.position.set(60, 7.4, 2); scene.add(dl);
    World.flickers.push(dl);
    lamp(50.4, 10, 'e');
  })();

  /* ==========================================================================
     OLD TOWN TERRACE — RESIDENTIAL DISTRICT    x -36..34, z 50..68   (v7.8)
     ==========================================================================
     Replaces three identical detached boxes, one of which (cx -3, x -8..2) was
     built ON TOP OF the north-south avenue. Their interiors were a crate and a
     table; there was one way in; and all three roofs sat at the same height
     with nothing to do on them.

     Rebuilt as two TERRACES either side of the avenue, which is how this kind
     of street actually works and which fixes the road conflict by construction:

       WEST TERRACE   x -36..-10   three houses, party walls shared
       AVENUE         x  -9..9     left clear
       EAST TERRACE   x  10..34    two houses + the corner shop

     Why a player comes here, by level:
       STREET (z 50..53)  long lane along the terrace front, covered by every
                          front window. Crossing it is a decision.
       INTERIOR           each house has a FRONT door and a BACK door and a
                          partition wall between front room and kitchen. Going
                          through a house is the safe way to cross the street,
                          and it is a room-to-room fight if it is contested.
       ALLEY (z 64..68)   parallel route behind the whole terrace, reached from
                          any back door. Bins, walls and a broken fence for
                          cover. This is the flank.
       UPSTAIRS           two bedrooms per house, windows onto BOTH the street
                          and the alley — the only place you can watch both
                          routes at once, which is why it is worth the climb.
       ROOF               eaves are level across each terrace, so the roof is a
                          continuous run from one end to the other. Only ONE
                          house per terrace has a stair to it, so the run is a
                          commitment, not a free perch, and the way down is
                          where people will wait for you.

     Colour does the callout work: brick, cream, ochre and sage across six
     houses. "Second floor of the ochre house" is a sentence a player can say.
     ====================================================================== */
  (function () {
    var Z0 = 53, Z1 = 64, TT = 0.28;
    var GF = 3.2, SLAB = 3.45, F2 = 6.4, ROOF = 6.65;   // eaves level across a terrace
    var MID = 58.6;                                     // front room / kitchen partition

    /* One house. `pal` is the render colour, `roofStair` decides whether this
       house is the one that reaches the roof run. */
    function house(X0, X1, pal, roofStair, chimney) {
      var cx = (X0 + X1) / 2;
      var eLane0 = X1 - 2.0, eLane1 = X1 - 0.3;         // ground -> F2 stairwell
      var wLane0 = X0 + 0.3, wLane1 = X0 + 2.0;         // F2 -> roof stairwell

      // ---- ground floor: brick plinth, render above, front + back doors ----
      facade('z', Z0, Z0 + TT, X0, X1, 0, 1.0, M.brick,
        [{ u0: cx - 0.75, u1: cx + 0.75, v0: 0, v1: 2.25 }, win(X0 + 2.6, 1.15, 1.6, 1.25)]);
      facade('z', Z0, Z0 + TT, X0, X1, 1.0, GF, pal,
        [{ u0: cx - 0.75, u1: cx + 0.75, v0: 0, v1: 2.25 }, win(X0 + 2.6, 1.15, 1.6, 1.25)]);
      facade('z', Z1 - TT, Z1, X0, X1, 0, GF, pal,
        [{ u0: X1 - 3.0, u1: X1 - 1.6, v0: 0, v1: 2.2 }, win(X0 + 2.2, 1.15, 1.4, 1.15)]);
      seg(X0, X0 + TT, 0, GF, Z0, Z1, M.brick);         // party walls
      seg(X1 - TT, X1, 0, GF, Z0, Z1, M.brick);
      // painted door reveals — the cheapest way to make a doorway read as a door
      seg(cx - 0.85, cx - 0.75, 0, 2.35, Z0 - 0.04, Z0 + TT, M.doorPaint, { collide: false });
      seg(cx + 0.75, cx + 0.85, 0, 2.35, Z0 - 0.04, Z0 + TT, M.doorPaint, { collide: false });
      seg(cx - 0.85, cx + 0.85, 2.25, 2.35, Z0 - 0.04, Z0 + TT, M.doorPaint, { collide: false });

      /* Interior partition with a doorway: front room | kitchen. It stops
         short of the east stair lane — the first version ran it to the party
         wall and walled the staircase off at the bottom. The ascent gate found
         all three houses; nothing about it was visible in the geometry. */
      seg(X0 + TT, cx - 0.9, 0, GF, MID, MID + 0.22, M.plaster);
      seg(cx + 0.9, eLane0 - 0.15, 0, GF, MID, MID + 0.22, M.plaster);

      // ---- furniture: cover first, decoration second ----
      box(X0 + 1.9, 0.42, 55.4, 2.1, 0.84, 0.95, M.wood);    // sofa, front room
      box(cx + 1.6, 0.34, 56.0, 1.1, 0.68, 1.1, M.trim);     // armchair
      seg(X0 + TT, X0 + 1.5, 0, 0.92, MID - 2.4, MID - 0.4, M.wood); // sideboard
      seg(X0 + TT, X1 - 2.4, 0.9, 1.02, 61.4, 62.3, M.plaster); // kitchen counter
      box(cx + 0.4, 0.38, 60.2, 1.5, 0.76, 0.95, M.wood);    // kitchen table
      box(X1 - 3.2, 0.85, 62.6, 0.7, 1.7, 0.7, M.white);     // fridge

      // ---- first floor ----
      seg(X0, eLane0 - 0.1, GF, SLAB, Z0, Z1, M.concrete);
      seg(eLane0 - 0.1, X1, GF, SLAB, Z0, MID, M.concrete);
      seg(eLane0 - 0.1, X1, GF, SLAB, 62.9, Z1, M.concrete);
      stairFlight((eLane0 + eLane1) / 2, 0, 62.7, 0, -1, 11, 0.3136, 0.34, 1.5, M.concrete);

      facade('z', Z0, Z0 + TT, X0, X1, SLAB, F2, pal,
        [win(X0 + 2.6, SLAB + 1.05, 1.5, 1.3), win(X1 - 4.0, SLAB + 1.05, 1.5, 1.3)]);
      facade('z', Z1 - TT, Z1, X0, X1, SLAB, F2, pal,
        [win(X0 + 2.4, SLAB + 1.05, 1.5, 1.3), win(X1 - 3.6, SLAB + 1.05, 1.5, 1.3)]);
      seg(X0, X0 + TT, SLAB, F2, Z0, Z1, M.brick);
      seg(X1 - TT, X1, SLAB, F2, Z0, Z1, M.brick);
      // two bedrooms with a landing doorway
      seg(roofStair ? wLane1 + 0.15 : X0 + TT, cx - 0.9, SLAB, F2, MID, MID + 0.22, M.plaster);
      seg(cx + 0.9, eLane0 - 0.1, SLAB, F2, MID, MID + 0.22, M.plaster);
      box(X0 + 2.0, SLAB + 0.28, 55.6, 2.0, 0.56, 1.5, M.wood); // bed
      box(roofStair ? X0 + 2.6 : X0 + 0.9, SLAB + 0.95, 61.0, 0.7, 1.9, 1.4, M.wood);  // wardrobe, clear of the roof stair
      box(cx + 1.4, SLAB + 0.38, 61.6, 1.3, 0.76, 0.8, M.trim); // desk

      // ---- roof ----
      if (roofStair) {
        seg(wLane0 + 1.8, X1, F2, ROOF, Z0, Z1, M.terracotta);
        seg(X0, wLane0 + 1.8, F2, ROOF, Z0, 58.4, M.terracotta);
        seg(X0, wLane0 + 1.8, F2, ROOF, 62.4, Z1, M.terracotta);
        stairFlight((wLane0 + wLane1) / 2, SLAB, 58.5, 0, 1, 10, 0.32, 0.34, 1.5, M.concrete);
        seg(wLane0 - 0.1, wLane1 + 0.1, ROOF, ROOF + 1.0, 61.9, 62.1, M.brick);  // stairhead lip
      } else {
        seg(X0, X1, F2, ROOF, Z0, Z1, M.terracotta);
      }
      // parapets on the STREET and ALLEY faces only — the party-wall ends are
      // left open so the terrace roof is one continuous run.
      seg(X0, X1, ROOF, ROOF + 0.75, Z0, Z0 + 0.22, M.brick);
      seg(X0, X1, ROOF, ROOF + 0.75, Z1 - 0.22, Z1, M.brick);
      if (chimney) {
        seg(cx - 0.7, cx + 0.7, ROOF, ROOF + 2.1, 58.2, 59.6, M.brick);
        seg(cx - 0.85, cx + 0.85, ROOF + 2.1, ROOF + 2.35, 58.05, 59.75, M.trim, { collide: false });
      }
      // front garden wall — waist-high cover on the street side
      seg(X0 + 0.4, X1 - 0.4, 0, 1.0, 51.0, 51.3, M.brick);
      seg(cx - 0.9, cx + 0.9, 0, 1.0, 51.0, 51.3, M.brick, { collide: false });  // gate gap filler (visual)
    }

    // WEST TERRACE — roof reached from the easternmost house
    house(-36.0, -27.4, M.brick, false, true);
    house(-27.4, -18.8, M.cream, false, false);
    house(-18.8, -10.0, M.ochre, true, true);
    // EAST TERRACE — roof reached from the westernmost house
    house(10.0, 18.0, M.sage, true, true);
    house(18.0, 25.0, M.cream, false, false);

    /* ---- THE CORNER SHOP  x 25..34 — the district landmark ----------------
       Taller than the terrace, glazed at street level, with a projecting lit
       sign and a chimney stack that is visible from the avenue and the rail
       approach. Its roof terrace is the east terrace's high ground and it is
       reached only from inside the shop. */
    (function () {
      var X0 = 25, X1 = 34, TR = 7.9;
      facade('z', Z0, Z0 + TT, X0, X1, 0, 1.0, M.brick,
        [{ u0: 26.2, u1: 27.8, v0: 0, v1: 2.35 }, { u0: 29.0, u1: 32.8, v0: 0, v1: 2.5 }]);
      facade('z', Z0, Z0 + TT, X0, X1, 1.0, GF + 0.6, M.terracotta,
        [{ u0: 26.2, u1: 27.8, v0: 0, v1: 2.35 }, { u0: 29.0, u1: 32.8, v0: 0, v1: 2.5 }]);
      seg(29.0, 32.8, 0.4, 2.5, Z0 + 0.06, Z0 + 0.14, M.carGlass, { collide: false });  // shopfront glazing
      facade('z', Z1 - TT, Z1, X0, X1, 0, GF + 0.6, M.brick,
        [{ u0: 30.0, u1: 31.4, v0: 0, v1: 2.2 }, win(27.0, 1.2, 1.4, 1.15)]);
      seg(X0, X0 + TT, 0, GF + 0.6, Z0, Z1, M.brick);
      seg(X1 - TT, X1, 0, GF + 0.6, Z0, Z1, M.brick);
      // shop interior: counter, shelving runs, stock — cover in three lanes
      seg(26.0, 32.4, 0, 1.05, 56.0, 56.9, M.wood);          // serving counter
      seg(26.4, 31.0, 0, 1.75, 58.8, 59.5, M.trim);          // shelving A
      seg(27.6, 31.5, 0, 1.75, 61.0, 61.7, M.trim);          // shelving B, clear of the stair lane
      crates(26.2, 62.6); barrel(29.6, 62.8, false);
      // first floor: stockroom + office, reached from the shop floor
      /* Two flights, OPPOSITE ends of the building. The first version stacked
         them in overlapping lanes and the upper treads clipped the climber's
         head on the lower flight — the ascent walker stalled at 2.90 m with
         nothing visibly in the way. Separate lanes, no interaction. */
      seg(X0, 27.6, GF + 0.6, GF + 0.85, Z0, Z1, M.concrete);
      seg(27.6, 31.6, GF + 0.6, GF + 0.85, Z0, Z1, M.concrete);
      seg(31.6, X1, GF + 0.6, GF + 0.85, Z0, 58.1, M.concrete);
      seg(31.6, X1, GF + 0.6, GF + 0.85, 62.6, Z1, M.concrete);
      stairFlight(32.55, 0, 62.4, 0, -1, 12, 0.3208, 0.34, 1.4, M.concrete);
      facade('z', Z0, Z0 + TT, X0, X1, GF + 0.85, TR - 0.3, M.terracotta,
        [win(27.0, 4.9, 1.6, 1.4), win(31.0, 4.9, 1.6, 1.4)]);
      facade('z', Z1 - TT, Z1, X0, X1, GF + 0.85, TR - 0.3, M.terracotta, [win(28.5, 4.9, 1.6, 1.4)]);
      seg(X0, X0 + TT, GF + 0.85, TR - 0.3, Z0, Z1, M.brick);
      seg(X1 - TT, X1, GF + 0.85, TR - 0.3, Z0, Z1, M.brick);
      seg(28.0, 30.8, GF + 0.85, GF + 2.4, 60.0, 60.9, M.trim); // stockroom racking
      box(28.6, GF + 1.25, 55.4, 1.6, 0.8, 1.0, M.wood);     // office desk
      // roof terrace, reached from the stockroom
      seg(27.6, X1, TR - 0.3, TR, Z0, Z1, M.roof);
      seg(X0, 27.6, TR - 0.3, TR, Z0, 58.2, M.roof);
      seg(X0, 27.6, TR - 0.3, TR, 62.7, Z1, M.roof);
      stairFlight(26.6, GF + 0.85, 58.4, 0, 1, 12, 0.3208, 0.34, 1.4, M.concrete);
      seg(25.6, 27.8, TR, TR + 1.0, 62.7, 62.9, M.brick);            // stairhead lip
      [[X0, X1, Z0, Z0 + 0.24], [X0, X1, Z1 - 0.24, Z1],
       [X1 - 0.24, X1, Z0, Z1]].forEach(function (r) {
        seg(r[0], r[1], TR, TR + 0.9, r[2], r[3], M.brick);
      });
      // the west parapet is left open: the shop roof steps down onto the
      // terrace roof (6.65), so the whole east block is one connected run.
      seg(24.6, X0 + 0.4, ROOF, TR, Z0 + 0.6, Z1 - 0.6, M.brick);    // the step itself
      // projecting sign + awning + stack: the silhouette that names this place
      seg(28.4, 33.2, 3.0, 4.2, 51.9, 52.1, M.railGreen);
      seg(28.6, 33.0, 3.15, 4.05, 51.8, 51.9, emissive(0xffd48a), { collide: false });
      seg(28.8, 33.4, 2.35, 2.55, 51.6, Z0, M.railGreen, { collide: false });   // awning
      seg(31.6, 33.2, TR, TR + 3.1, 54.8, 56.4, M.brick);                        // chimney stack
      seg(31.4, 33.4, TR + 3.1, TR + 3.4, 54.6, 56.6, M.trim, { collide: false });
      lamp(24, 51.4, 'w');
    })();

    /* ---- THE BACK ALLEY  z 64..68 — the flank route --------------------- */
    seg(-38, 36, 0.02, 0.06, 64.2, 67.6, M.asphalt, { collide: false });
    seg(-38, 36, 0, 2.1, 67.6, 67.9, M.brick);                       // alley boundary wall
    [-30, -14, 14, 28].forEach(function (bx) {
      cyl(bx, 0.55, 66.2, 0.42, 1.1, M.rust);                        // bins
      cyl(bx + 1.1, 0.5, 66.4, 0.38, 1.0, M.trim);
    });
    brokenWall(-22, 66.4, true);
    crates(4.5, 66.0); barrel(-6.5, 66.2, true);
    box(20.5, 0.75, 66.0, 2.2, 1.5, 1.3, M.contGreen);               // step to the alley wall
    box(-33.5, 0.75, 66.0, 2.2, 1.5, 1.3, M.contBlue);
    lamp(-20, 65.0, 'n'); lamp(16, 65.0, 'n');

    /* ---- THE STREET  z 50..53 ------------------------------------------- */
    seg(-38, 36, 0.02, 0.06, 48.6, 51.0, M.asphalt, { collide: false });
    seg(-38, 36, 0.06, 0.10, 49.7, 49.9, M.roadPaintY, { collide: false });
    sedan(-30, 49.6, false, 0, false); sedan(-15, 49.8, true, 2, false);
    sedan(13, 49.6, false, 4, false); van(-2, 50.2, false);
    lamp(-24, 51.6, 's'); lamp(6, 51.6, 's');
    [-33, -12, 8, 22].forEach(function (tx) {
      cyl(tx, 1.1, 50.2, 0.16, 2.2, M.trim);
      cyl(tx, 3.1, 50.2, 0.05, 2.4, M.foliage, { collide: false });
    });
  })();

  /* ===== RAIL YARD (west)  x[-70,-52] ===== */
  (function () {
    // half-buried bunker with firing slits
    facade('x', -54.3, -54, -8, -2, 0, 2.7, M.concrete, [{ u0: -6.4, u1: -5.2, v0: 0, v1: 2.1 }]);
    facade('z', -8, -7.7, -66, -54.3, 0, 2.7, M.concrete, [
      { u0: -63, u1: -61.5, v0: 1.2, v1: 1.7 }, { u0: -58, u1: -56.5, v0: 1.2, v1: 1.7 }
    ]);
    facade('z', -2.3, -2, -66, -54.3, 0, 2.7, M.concrete, []);
    facade('x', -66, -65.7, -8, -2, 0, 2.7, M.concrete, []);
    seg(-66, -54, 2.7, 2.95, -8, -2, M.roof);
    // containers
    container(-60, 14, false, M.contRed, false);
    box(-60, 3.9, 14, 6.1, 2.6, 2.44, M.contGray);
    container(-66, 8, true, M.contGray, false);
    container(-58, -14, false, M.contBlue, true); // open — enterable
    box(-68, 0.6, 4, 1.2, 1.2, 1.6, M.rust);      // buffer stops
    box(-68, 0.6, -12, 1.2, 1.2, 1.6, M.rust);
    barrel(-55.5, 12.5, true); crates(-63, -18);
    brokenWall(-52, 30, false);
    lamp(-58, 2, 'e');
  })();

  /* ===== OFFICE ROOF ACCESS (west fire-escape) ===== */
  (function () {
    stairFlight(-37.7, 0, 29.9, 0, -1, 12, 0.284, 0.33, 1.2, M.metal);      // ground -> landing
    seg(-38.35, -37.05, 3.4, 3.62, 24.35, 26.0, M.metal);                    // switchback landing
    stairFlight(-37.7, 3.62, 24.35, 0, -1, 10, 0.308, 0.33, 1.2, M.metal);  // landing -> roof height
    seg(-38.35, -36.75, 6.7, 6.92, 20.85, 22.3, M.metal);                    // arrival platform onto roof
    seg(-38.28, -38.16, 0, 3.4, 25.1, 25.3, M.trim);                         // support post
    seg(-37, -36.75, 6.7, 7.55, 22.6, 31, M.plaster);                        // west parapet (gap at arrival)
    seg(-23.25, -23, 6.7, 7.55, 21, 31, M.plaster);                          // east parapet
    box(-30, 7.15, 27.6, 1.8, 0.9, 1.4, M.metal);                            // roof AC cover
    box(-25.6, 7.1, 29, 1.4, 0.8, 1.2, M.rust);
  })();
};
