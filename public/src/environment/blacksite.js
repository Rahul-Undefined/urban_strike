/* ============================================================================
   BLACKSITE (v14.0) — the bot-mode-only map. environment/blacksite.js

   Designed around the brief's list, deliberately: MULTIPLE COMBAT AREAS (four
   quadrants with different characters), INDOOR (warehouse ground floor, CQB),
   OUTDOOR (yard, streets), BUILDINGS (warehouse + four sheds), ROOFTOPS
   (warehouse roof via an exterior staircase — real verticality with a
   parapet), COVER (crates, drums, containers, the parapet), FLANKING ROUTES
   (the container maze NE and the shed alley NW both bypass the centre),
   CHOKE POINTS (the three warehouse doorways, the maze exits), OPEN COMBAT
   (SW yard with low crates only), LOOT AREAS (interior s-tier, roof h-tier —
   risk priced into placement), SPAWN AREAS (human gate pocket south, bot
   ring north/east/west so pressure arrives from the map, not from behind).

   Geometry rules inherited from ten maps of scar tissue: every walkable
   surface is an explicit slab with a collider; stairs are stairFlight (the
   bots' planClimb and the movement controller both already understand its
   tread rhythm); wall thickness 0.24 so the spawn-geometry gate's body test
   means what it says; no rotated colliders — the Killhouse class stays dead.
   Everything here is deterministic: no rnd() in structure, scatter only in
   the decorative pass.
   ========================================================================= */
(function () {
  if (typeof World === 'undefined') return;

  World._buildBlacksite = function (T) {
    var M = T.M, box = T.box, seg = T.seg, cyl = T.cyl, stairFlight = T.stairFlight;
    var NCAST = { cast: false }, NBOTH = { cast: false, collide: false };
    var HX = 50, HZ = 42;

    /* ---- ground: cracked concrete pad with painted bay lines ---- */
    seg(-HX, HX, -0.40, 0, -HZ, HZ, M.concrete, NCAST);
    for (var lx = -40; lx <= 40; lx += 20) {
      seg(lx - 0.18, lx + 0.18, 0.004, 0.010, -HZ + 6, HZ - 6, M.roadPaint, NBOTH);
    }

    /* =====================================================================
       CENTRE — the warehouse. 26 x 18 footprint, 6 m walls, three doorways
       (N, S, E), a mezzanine over the west half at y 3.0 reached by an
       interior flight, and a full roof at y 6.0 reached by an exterior
       flight on the west face. The doorways are the map's choke points; the
       roof is its high ground; the mezzanine is the indoor half-level that
       makes interior fights vertical.
       ==================================================================== */
    var W = 13, D = 9, WH = 6.0, TK = 0.24;
    // long walls (N/S) with centred 3 m doorways
    [-1, 1].forEach(function (sz) {
      var z = sz * D;
      box(-(W + 1.5) / 2 - 0.75, WH / 2, z, W - 1.5, WH, TK, M.plaster);      // west segment
      box((W + 1.5) / 2 + 0.75, WH / 2, z, W - 1.5, WH, TK, M.plaster);       // east segment
      box(0, WH - 0.6, z, 3.0, 1.2, TK, M.plaster);                            // door lintel
    });
    // west wall solid, east wall with doorway
    box(-W, WH / 2, 0, TK, WH, D * 2, M.plaster);
    box(W, WH / 2, -(D + 1.5) / 2 - 0.75, TK, WH, D - 1.5, M.plaster);
    box(W, WH / 2, (D + 1.5) / 2 + 0.75, TK, WH, D - 1.5, M.plaster);
    box(W, WH - 0.6, 0, TK, 1.2, 3.0, M.plaster);
    // roof slab (walkable) + parapet
    seg(-W - 0.4, W + 0.4, WH, WH + 0.22, -D - 0.4, D + 0.4, M.roof, NCAST);
    [-1, 1].forEach(function (sz) {
      box(0, WH + 0.47, sz * (D + 0.28), (W + 0.4) * 2, 0.5, 0.24, M.plaster);
    });
    [-1, 1].forEach(function (sx) {
      box(sx * (W + 0.28), WH + 0.47, 0, 0.24, 0.5, (D + 0.4) * 2, M.plaster);
    });
    // mezzanine over the west half, with a guard rail lip
    seg(-W + 0.3, -2.5, 3.0, 3.22, -D + 0.3, D - 0.3, M.wood, NCAST);
    box(-2.4, 3.55, 0, 0.16, 0.7, (D - 0.3) * 2, M.wood);
    // interior flight up to the mezzanine (south-east corner of the floor)
    stairFlight(-4.2, 0, -D + 1.6, -1, 0, 10, 0.30, 0.34, 1.6, M.metal);
    // exterior flight to the roof, hugging the west face
    stairFlight(-W - 1.4, 0, 5.6, 0, -1, 20, 0.30, 0.34, 1.8, M.metal);
    // crate cover inside — the CQB is about these
    box(4, 0.65, -3, 2.2, 1.3, 2.2, M.cargoWood);
    box(-5, 0.65, 4, 2.2, 1.3, 2.2, M.cargoWood);
    box(7, 0.55, 4.5, 1.6, 1.1, 1.6, M.cargoWood);

    /* =====================================================================
       NW — shed alley. Two sheds and drum clusters make a covered flank
       route along the west edge; the alley between them is a knife fight.
       ==================================================================== */
    T.shedLike = null; // (kept explicit: sheds composed from boxes for collider truth)
    [[-36, 22], [-28, 32]].forEach(function (c) {
      var sx = c[0], sz = c[1];
      box(sx, 1.6, sz - 4, 10, 3.2, TK, M.metal);
      box(sx - 5, 1.6, sz, TK, 3.2, 8, M.metal);
      box(sx + 5, 1.6, sz, TK, 3.2, 8, M.metal);
      box(sx - 2.6, 1.6, sz + 4, 4.8, 3.2, TK, M.metal);   // doorway on the north face, east side open
      seg(sx - 5.3, sx + 5.3, 3.2, 3.4, sz - 4.3, sz + 4.3, M.roof, NCAST);
    });
    cyl(-40, 0.6, 14, 0.5, 1.2, M.drum); cyl(-38.7, 0.6, 14.6, 0.5, 1.2, M.drum);
    cyl(-39.4, 1.7, 14.3, 0.5, 1.2, M.drum);

    /* =====================================================================
       NE — container maze. Six containers, mixed alignment (axis-aligned
       colliders — rotation only in 90 degree steps), two ways in, two out:
       the flank route that bypasses the warehouse east door.
       ==================================================================== */
    [[26, 18, 8, 2.6], [34, 18, 8, 2.6], [30, 26, 2.6, 8],
     [38, 30, 8, 2.6], [24, 32, 8, 2.6], [42, 22, 2.6, 8]].forEach(function (c) {
      box(c[0], 1.3, c[1], c[2], 2.6, c[3], M.contBlue);
    });

    /* =====================================================================
       SW — the open yard. Low crates only: fights here are about angles and
       the marksman earns its keep. The human gate pocket is south of it.
       ==================================================================== */
    [[-28, -22], [-34, -14], [-22, -30], [-30, -30], [-20, -18]].forEach(function (c) {
      box(c[0], 0.55, c[1], 2.4, 1.10, 2.4, M.cargoWood);
    });

    /* SE — fuel point: hard cover at the east approach */
    box(34, 1.0, -22, 6, 2.0, 3, M.metal);
    cyl(30, 0.6, -28, 0.5, 1.2, M.drum); cyl(31.4, 0.6, -27.2, 0.5, 1.2, M.drum);

    /* south gate — the human spawn pocket reads as an entrance, not a void */
    box(-16, 1.5, -40, 10, 3.0, 0.5, M.plaster);
    box(16, 1.5, -40, 10, 3.0, 0.5, M.plaster);

    /* perimeter fence + decorative scatter (non-colliding) */
    if (T.fence) T.fence(HX, HZ, 4.0, M.metal);
    if (T.scatter) T.scatter(16, HX * 2, HZ * 2, [[-15, 15, -11, 11]]);
  };
})();
