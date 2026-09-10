/* KILLHOUSE — Rahul's plan, built. v10.20.
   Registers World._buildKillhouse, same contract as the other map builders.

   HE SENT A TOP-DOWN DRAWING AND ASKED FOR IT EXACTLY.

   40 m wide, 68 m deep, portrait. A checkered training floor, a scatter of thin
   partition walls at assorted angles, a few solid blocks. That is a CQB
   SHOOT-HOUSE, which is what the word killhouse means — and it is a better
   reading of the name than v10.10's landscape warehouse full of shipping
   containers, which is replaced rather than adjusted.

   ===== THE LAYOUT IS A TABLE, ON PURPose =====

   Every wall below is one row of PLAN, in metres, read off his drawing:

       [x, z, len, rot, kind]

   x, z    centre of the piece.        x is -20..20, z is -34..34
   len     length in metres
   rot     radians. 0 runs along X (east-west), 1.5708 runs along Z
   kind    'w' partition, 'b' solid block, 'c' crate stack

   It is a table rather than a hundred hand-written box() calls because the
   drawing is a small image and I am interpreting it. If a wall is in the wrong
   place, Rahul can say "row 12 is too far left" and that is a one-line change
   instead of a rebuild. The numbers ARE the design document.

   ===== DESIGN LANGUAGE =====

   A training house, not a warehouse. Bare concrete with a painted inspection
   grid — his drawing shows a checkerboard and that IS the grid, so it is drawn
   rather than implied. Unpainted breeze-block partitions at 2.4 m: high enough
   that nothing is seen over, low enough that the roof volume stays open.
   Numbered doorways, target silhouettes on stands, hazard tape at the corners,
   an observation catwalk overhead that cannot be reached.

   NO STAIRS. Same as every small map on this roster; verify-climb is still red
   on 21 flights elsewhere. The two solid blocks are climbable by a crate step.

   EVERY MIRRORED X PAIR GOES THROUGH segx() — v10.11 shipped three walls with
   x0 > x1 and negative width because seg() does not sort its arguments. */
(function () {
  if (typeof World === 'undefined') return;

  World._buildKillhouse = function (T) {
    var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, rnd = T.rnd;
    var addCollider = T.addCollider;

    /* ===== v15.0 (fixes 11 + 12) — THE HOUSE GROWS AND THE MAZE OPENS =====
       Rahul: "we need to reimagine the killhouse map as it has many walls zig
       zag which sometimes makes it confusing, remove some middle ones and add
       something else that attracts the gameplay" — and, for every small map,
       "make the maps playable for 15 players at least."

       40 x 68 -> 52 x 88 m (x 1.3, z 1.294), every PLAN row scaled with it so
       his drawing is still the drawing, just bigger. GONE: the four angled
       partitions (rows 9, 11, 16, 17 — the zig-zag, and the source of both
       v10.22/v11.0 phantom-wall bugs), the centre block (13) and the centre
       partition (21). IN THEIR PLACE: THE DECK — a 12 x 9 m platform at 2.6 m
       on pillars, open underneath, climbed by two crate stairs at opposite
       corners, railed on the halves away from the stairs; two open-ended
       container corridors flank it. High ground that can be seen from every
       lane and shot at from the roofs of both blocks is what the middle of a
       shoot-house needed: a REASON to cross it, not a puzzle to solve in it.
       Cap 10 -> 15 (world.config.js), bound 38 -> 48. */
    var HX = 26, HZ = 44, WALL_H = 9.0, PART_H = 2.4, TH = 0.30;
    var NCAST = { cast: false };
    var NBOTH = { cast: false, collide: false };
    function segx(xa, xb, y0, y1, z0, z1, mat, o) {
      return seg(Math.min(xa, xb), Math.max(xa, xb), y0, y1, z0, z1, mat, o);
    }

    /* ============ THE PLAN ============
       Read top-to-bottom off the drawing. North is -z. */
    var PLAN = [
      /* v15.0: the v10.20 table scaled x 1.3 / z 1.294; rows 9, 11, 13, 16, 17
         and 21 removed (see the header). Row numbers kept so "row 12 is too
         far left" still means the same thing it did on his drawing. */
      /*  1 */[-14.3, -34.9, 13.0, 0,      'w'],   // top-left long partition
      /*  2 */[  9.1, -32.4,  7.8, 0,      'w'],   // top-right stub
      /*  3 */[-19.5, -27.2,  7.8, 0,      'w'],   // upper-left partition
      /*  4 */[ -2.6, -22.0, 10.4, 0,      'b'],   // BIG BLOCK, upper centre
      /*  5 */[ 10.4, -24.6,  9.1, 0,      'w'],   // upper-right T, cap
      /*  6 */[ 10.4, -19.4, 10.4, 1.5708, 'w'],   // upper-right T, stem
      /*  7 */[-18.2, -20.7,  5.2, 1.5708, 'w'],   // short vertical, left
      /*  8 */[-13.0, -16.8,  6.5, 0,      'w'],   // left partition
      /* 10 */[  6.5, -11.6,  9.1, 1.5708, 'w'],   // right vertical
      /* 12 */[-16.9,  -9.1, 10.4, 0,      'w'],   // long left partition
      /* 14 */[ 11.7,  -2.6, 10.4, 1.5708, 'w'],   // right room, back wall
      /* 15 */[ 15.6,   2.6,  6.5, 0,      'w'],   // right room, side
      /* 18 */[-20.8,   9.1,  6.5, 1.5708, 'w'],   // left vertical
      /* 19 */[-14.3,  10.4,  6.5, 0,      'w'],   // left T cap
      /* 20 */[ 11.7,  12.9,  6.5, 1.5708, 'w'],   // right vertical
      /* 22 */[  1.3,  22.0, 10.4, 0,      'b'],   // BIG BLOCK, lower centre
      /* 23 */[-16.9,  22.0,  9.1, 0,      'w'],   // lower-left partition
      /* 24 */[-23.4,  25.9,  5.2, 1.5708, 'w'],   // far-left stub
      /* 25 */[-14.3,  31.1,  9.1, 0,      'w'],   // lower-left partition
      /* 26 */[  7.8,  33.6,  7.8, 0,      'w'],   // lower-right partition
      /* 27 */[ -1.3,  37.5, 18.2, 0,      'c'],   // LONG CRATE RUN, bottom
      /* 28 */[ 18.2, -10.4,  7.8, 1.5708, 'w'],   // far-right vertical
      /* 29 */[-22.1, -15.5,  6.5, 0,      'w'],   // far-left upper
      /* 30 */[ 16.9,  18.1,  6.5, 0,      'w']    // lower-right stub
    ];

    /* ============ SHELL ============ */
    seg(-HX, HX, -0.40, 0, -HZ, HZ, M.concrete, NCAST);

    /* The inspection grid. His drawing's checkerboard is not decoration — a
       real shoot-house floor is gridded so instructors can call positions. Two
       tones, 4 m squares, drawn as thin overlay slabs rather than a texture
       because this engine has none. Non-colliding and non-casting: it is paint. */
    for (var gx = -HX; gx < HX; gx += 4) {
      for (var gz = -HZ; gz < HZ; gz += 4) {
        if (((gx / 4) + (gz / 4)) % 2 === 0) continue;
        seg(gx, gx + 4, 0.004, 0.010, gz, gz + 4, M.sidewalk, NBOTH);
      }
    }
    /* Grid line numbers along the west wall and letters along the north, as
       hazard-yellow ticks. Cheap, and they are what make it read as a facility
       rather than a room with walls in it. */
    for (var tz = -HZ + 4; tz < HZ; tz += 8) {
      seg(-HX + 0.1, -HX + 1.4, 0.011, 0.016, tz - 0.15, tz + 0.15, M.roadPaintY, NBOTH);
    }
    for (var tx = -HX + 4; tx < HX; tx += 8) {
      seg(tx - 0.15, tx + 0.15, 0.011, 0.016, -HZ + 0.1, -HZ + 1.4, M.roadPaintY, NBOTH);
    }

    /* Perimeter. Corrugated steel outside, ribbed, with the roof high enough
       that the partitions read as partitions and not as corridors. */
    seg(-HX - 0.4, HX + 0.4, 0, WALL_H, -HZ - 0.4, -HZ, M.metal);
    seg(-HX - 0.4, HX + 0.4, 0, WALL_H, HZ, HZ + 0.4, M.metal);
    segx(-HX, -(HX + 0.4), 0, WALL_H, -HZ, HZ, M.metal);
    segx(HX, HX + 0.4, 0, WALL_H, -HZ, HZ, M.metal);
    for (var rz = -HZ + 2; rz <= HZ - 2; rz += 3.2) {
      segx(-HX, -HX + 0.14, 0.2, WALL_H - 0.3, rz - 0.09, rz + 0.09, M.steelBlue, NBOTH);
      segx(HX - 0.14, HX, 0.2, WALL_H - 0.3, rz - 0.09, rz + 0.09, M.steelBlue, NBOTH);
    }

    /* Roof, trusses and skylights. The light bands are what let you read the
       partition maze from inside it. */
    seg(-HX, HX, WALL_H, WALL_H + 0.35, -HZ, HZ, M.dark, NCAST);
    for (var trz = -HZ + 4; trz <= HZ - 4; trz += 5.5) {
      seg(-HX, HX, WALL_H - 0.75, WALL_H - 0.55, trz - 0.16, trz + 0.16, M.steelBlue, NBOTH);
      seg(-7, 7, WALL_H - 0.02, WALL_H + 0.02, trz - 1.6, trz + 1.6, M.paperWhite, NBOTH);
    }

    /* Observation catwalk down both long sides, 6 m up. Non-colliding — this
       map is flat by design and a reachable gallery would change it. It exists
       so the eye has something between the partitions and the roof. */
    [-1, 1].forEach(function (s) {
      seg(s * (HX - 2.2) - 0.5, s * (HX - 2.2) + 0.5, 6.0, 6.12, -HZ + 3, HZ - 3, M.steelBlue, NBOTH);
      for (var pz = -HZ + 4; pz < HZ - 3; pz += 4) {
        seg(s * (HX - 2.2) - 0.05, s * (HX - 2.2) + 0.05, 6.12, 7.0, pz - 0.05, pz + 0.05, M.metal, NBOTH);
      }
      seg(s * (HX - 2.2) - 0.05, s * (HX - 2.2) + 0.05, 6.9, 7.0, -HZ + 3, HZ - 3, M.metal, NBOTH);
    });

    /* ============ THE PLAN, BUILT ============ */
    function partition(cx, cz, len, rot) {
      var o = rot ? { rotY: rot } : undefined;
      /* ===== v10.22 - AN ANGLED WALL COLLIDED AS ITS BOUNDING BOX =====

         Rahul: "in the middle of the killhouse map there is a bug that treats
         the area as a wall but it doesn't show and player can't pass."

         Measured: PLAN row 16 is a 10 m wall at 0.52 rad. Rotated, its AABB is
         **8.8 x 5.2 m** — so an 8.8 by 5.2 metre invisible block sat in the
         middle of the map while the visible wall was a thin diagonal line.
         All four angled rows did it; row 16 was simply the biggest.

         The handoff names this exactly: "a rotated box collides through its
         AABB, which is not its shape." I wrote four rotated walls anyway.

         The fix separates the two jobs. The VISUAL stays one rotated box with
         collision off. The COLLISION becomes a chain of short axis-aligned
         colliders stepped along the centreline — each one's own AABB is close
         to its own shape, so the union follows the diagonal instead of
         swallowing the rectangle around it. Step is half the thickness so the
         boxes overlap and leave no gap to squeeze through.

         Axis-aligned walls are unaffected: their AABB IS their shape, so they
         keep the single collider they always had. */
      if (rot) {
        box(cx, PART_H / 2, cz, len, PART_H, TH,
            M.plaster, { rotY: rot, collide: false });
        /* ===== v11.0 - THE CHAIN RAN DOWN THE WRONG DIAGONAL =====

           v10.22 built this chain along (cos rot, +sin rot). A three.js rotY
           maps the box's length axis to (cos rot, -sin rot) — rotation about Y
           is x' = x cos + z sin, z' = -x sin + z cos, so local +X lands at
           world (cos, -sin). The sign error MIRRORED every angled chain in z:
           the drawn wall ran one diagonal with NO collision on it, and a
           phantom wall ran the opposite diagonal through open floor.

           Rahul's four reported block points — (4.85, 2.66), (2.50, 4.00),
           (-3.73, -11.44), (-0.00, -10.38) — all sit 0.62-0.63 m
           (capsule radius 0.35 + collider half 0.15 + skin) perpendicular to
           the MIRRORED lines of PLAN rows 17 and 9, on both sides: players
           walking into the phantom from either direction. Measured before this
           edit, gated after it — verify-collision now probes all four
           coordinates as free ground and drives the resolver INTO each drawn
           diagonal to prove the visible wall finally collides. */
        var ux = Math.cos(rot), uz = -Math.sin(rot);
        var half = TH / 2, step = TH * 0.5;
        for (var t = -len / 2; t <= len / 2 + 0.001; t += step) {
          var px = cx + ux * t, pz = cz + uz * t;
          addCollider(px - half, 0, pz - half, px + half, PART_H, pz + half);
        }
      } else {
        box(cx, PART_H / 2, cz, len, PART_H, TH, M.plaster, o);
      }
      box(cx, PART_H - 0.22, cz, len, 0.12, TH + 0.02,
          M.roadPaintY, rot ? { rotY: rot, cast: false, collide: false } : NBOTH);
      /* Exposed steel studs at each end — stops a partition reading as a slab.
         v11.0: -sin, same rotY convention as the collider chain above. The +sin
         version put the end studs of every angled row off in open floor,
         mirrored from the wall they were meant to cap. */
      var hc = Math.cos(rot || 0) * (len / 2), hs = -Math.sin(rot || 0) * (len / 2);
      [-1, 1].forEach(function (e) {
        box(cx + e * hc, PART_H / 2, cz + e * hs, 0.16, PART_H + 0.06, TH + 0.06, M.metal, NCAST);
      });
    }
    function solidBlock(cx, cz, len) {
      box(cx, 1.30, cz, len, 2.60, 4.2, M.contGray);
      box(cx, 1.95, cz, len * 0.8, 0.5, 4.24, M.rust, NBOTH);
      /* The crate step. Two 0.31 m rises then a 0.62 m — every one inside the
         0.42 m auto-step, which is how the roof is reached without stairs. */
      box(cx - len / 2 - 0.7, 0.155, cz, 1.3, 0.31, 1.3, M.palletBase);
      box(cx - len / 2 + 0.3, 0.62, cz, 1.3, 1.24, 1.3, M.cargoWood);
      box(cx - len / 2 + 0.3, 1.86, cz, 1.3, 1.24, 1.3, M.palletWood);
    }
    function crateRun(cx, cz, len) {
      for (var u = -len / 2 + 1; u < len / 2; u += 2.0) {
        box(cx + u, 0.55, cz, 1.8, 1.10, 1.6, (u | 0) % 2 ? M.cargoWood : M.palletWood);
      }
      box(cx, 1.22, cz, len, 0.14, 1.7, M.palletBase, NCAST);
    }

    PLAN.forEach(function (p) {
      var x = p[0], z = p[1], len = p[2], rot = p[3], kind = p[4];
      if (kind === 'b') solidBlock(x, z, len);
      else if (kind === 'c') crateRun(x, z, len);
      else partition(x, z, len, rot);
    });

    /* ============ THE DECK (v15.0) ============
       12 x 9 m platform, walking surface at 2.60, on six pillars, open
       beneath: 2.35 m of headroom under the slab (a standing operator plus the
       auto-step needs 2.34). Two crate stairs at opposite corners — six
       0.40 m rises inside the 0.42 m auto-step, the same climb every small map
       uses for its roofs — so there are exactly two ways up and both are
       visible from the lanes. Rails on the halves the stairs do not use, so a
       deck-holder is exposed on the side the climbers arrive from. */
    var DX = 6, DZ = 4.5, DT = 2.60;
    seg(-DX, DX, DT - 0.25, DT, -DZ, DZ, M.steelBlue);                       // the slab
    seg(-DX - 0.2, DX + 0.2, DT - 0.34, DT - 0.25, -DZ - 0.2, DZ + 0.2, M.rust, NBOTH);  // edge lip, paint
    [[-DX + 0.4, -DZ + 0.4], [DX - 0.4, -DZ + 0.4], [-DX + 0.4, DZ - 0.4], [DX - 0.4, DZ - 0.4],
     [0, -DZ + 0.4], [0, DZ - 0.4]].forEach(function (c) {
      box(c[0], (DT - 0.25) / 2, c[1], 0.6, DT - 0.25, 0.6, M.concrete);
    });
    /* rails: west and east short edges, plus the long-edge halves away from
       each stair's arrival. Waist-high, so the deck is cover and not a box. */
    seg(-DX, -DX + 0.16, DT, DT + 0.95, -DZ, DZ, M.steelBlue);
    seg(DX - 0.16, DX, DT, DT + 0.95, -DZ, DZ, M.steelBlue);
    seg(0.5, DX, DT, DT + 0.95, -DZ, -DZ + 0.16, M.steelBlue);               // north edge, east half (stair A arrives west)
    seg(-DX, -0.5, DT, DT + 0.95, DZ - 0.16, DZ, M.steelBlue);               // south edge, west half (stair B arrives east)
    /* crate stairs: stair A climbs SOUTH onto the north edge at x -4.6;
       stair B climbs NORTH onto the south edge at x +4.6. Tops 0.40 .. 2.40,
       then the 0.20 step onto the slab. */
    function crateStair(cx, cz0, dir) {
      for (var k = 0; k < 6; k++) {
        var top = 0.40 * (k + 1), cz = cz0 + dir * k * 1.0;
        box(cx, top / 2, cz, 1.4, top, 1.2, k % 2 ? M.cargoWood : M.palletWood);
      }
    }
    crateStair(-4.6, -DZ - 5.6, 1);      // z -10.1 .. -5.1, arriving at the north edge (-4.5)
    crateStair(4.6, DZ + 5.6, -1);       // z  10.1 ..  5.1, arriving at the south edge (4.5)
    /* under the deck: two low walls the ground fight can use, offset so
       neither lines up with a pillar. */
    box(-2.0, 0.55, -1.6, 4.0, 1.10, 0.4, M.plaster);
    box(2.0, 0.55, 1.6, 4.0, 1.10, 0.4, M.plaster);
    box(-2.0, 1.16, -1.6, 4.1, 0.12, 0.42, M.roadPaintY, NBOTH);
    box(2.0, 1.16, 1.6, 4.1, 0.12, 0.42, M.roadPaintY, NBOTH);

    /* ============ CONTAINER CORRIDORS (v15.0) ============
       Two open-ended containers flanking the deck along z: a roofed run you can
       cross the middle in without being seen from the deck. Long sides and a
       roof, no ends. Their roofs are the answer to a deck-holder, and a crate
       step at each puts a player up there in two moves. */
    function corridor(cx) {
      var L = 8.0, W = 2.44, H = 2.60;
      seg(cx - W / 2, cx - W / 2 + 0.12, 0, H, -L / 2, L / 2, M.contGreen);
      seg(cx + W / 2 - 0.12, cx + W / 2, 0, H, -L / 2, L / 2, M.contGreen);
      seg(cx - W / 2, cx + W / 2, H - 0.12, H, -L / 2, L / 2, M.contGreen);
      box(cx, 1.9, 0, W + 0.02, 0.5, L * 0.72, M.rust, NBOTH);
      var sx2 = cx + (cx > 0 ? 1 : -1) * (W / 2 + 0.75);
      box(sx2, 0.155, L / 2 - 0.7, 1.3, 0.31, 1.3, M.palletBase);
      box(sx2, 0.62, L / 2 + 0.7, 1.3, 1.24, 1.3, M.cargoWood);
      box(sx2, 1.86, L / 2 + 0.7, 1.3, 1.24, 1.3, M.palletWood);
    }
    corridor(-17); corridor(19);

    /* ============ FACILITY DRESSING ============ */
    /* Target silhouettes on stands: the single most recognisable object in a
       shoot-house. Non-colliding so they never become cover. */
    function target(cx, cz, ry) {
      var o = { rotY: ry, cast: false, collide: false };
      box(cx, 0.85, cz, 0.52, 1.10, 0.05, M.dark, o);
      box(cx, 1.52, cz, 0.30, 0.30, 0.05, M.dark, o);
      box(cx, 0.15, cz, 0.60, 0.08, 0.50, M.metal, { cast: false });
      cyl(cx, 0.45, cz, 0.04, 0.70, M.metal, NCAST);
    }
    [[-20.8, -32.4, 0.3], [5.2, -27.2, -0.4], [-7.8, -11.6, 1.1], [14.3, -6.5, 0.2],
     [-18.2, 2.6, -0.6], [7.8, 10.4, 1.4], [-3.9, 27.2, 0.1], [18.2, 34.9, -0.9]]
      .forEach(function (t) { target(t[0], t[1], t[2]); });

    /* Ammo crates and a weapons bench at each end — the working furniture of a
       training house, and cover in the two spawn rooms. */
    [-1, 1].forEach(function (s) {
      var bz = s * (HZ - 5);
      box(0, 0.45, bz, 3.6, 0.90, 0.9, M.wood);
      box(0, 0.95, bz, 3.4, 0.10, 0.8, M.cargoWood, NCAST);
      box(-6, 0.35, bz, 1.2, 0.70, 1.2, M.railGreen);
      box(6, 0.35, bz, 1.2, 0.70, 1.2, M.railGreen);
      for (var d = 0; d < 3; d++) {
        cyl(s * 19.5 + d * 0.9, 0.44, bz, 0.30, 0.88, d % 2 ? M.rust : M.hazard);
      }
    });

    /* Hazard chevrons at the four corners and bay lamps down the walls. */
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        for (var c = 0; c < 4; c++) {
          seg(sx * (HX - 4.5) - 0.5, sx * (HX - 4.5) + 0.5, 0.012, 0.018,
              sz * (HZ - 2 - c * 1.3) - 0.5, sz * (HZ - 2 - c * 1.3) + 0.5, M.hazard, NBOTH);
        }
      });
      [-31, -15.5, 0, 15.5, 31].forEach(function (lz) {
        box(sx * (HX - 0.6), 6.4, lz, 0.5, 0.28, 1.0, M.amberGlow, NBOTH);
      });
    });

    /* ============ FILLING THE DEAD GROUND ============
       First build measured 3.3% dead ground against a 2% budget. The map grew
       from 1,972 m2 to 2,720 and swapped shipping containers for thin
       partitions, which cover far less floor per piece — so the shortfall is
       real, not a budget that needs relaxing.

       Everything below is COVER, not decoration: low barriers, crate pairs and
       drum clusters along the long walls and in the corners, which is where a
       partition maze leaves gaps and where his drawing shows small blocks
       anyway. Materials are all already emitted above, so the merge pass folds
       them into batches that are paid for. */
    [-1, 1].forEach(function (s) {
      [-37.5, -26, -14.2, -2.6, 9, 20.7, 32.4].forEach(function (bz, i) {
        /* Alternating barrier and crate pair, set off the wall so there is a
           gap to move behind rather than a sealed edge. */
        if (i % 2 === 0) {
          box(s * (HX - 3.4), 0.55, bz, 0.6, 1.10, 3.2, M.plaster);
          box(s * (HX - 3.4), 1.16, bz, 0.7, 0.12, 3.3, M.roadPaintY, NBOTH);
        } else {
          box(s * (HX - 3.0), 0.45, bz - 0.9, 1.5, 0.90, 1.3, M.cargoWood);
          box(s * (HX - 3.0), 0.35, bz + 0.9, 1.3, 0.70, 1.2, M.palletWood);
        }
      });
      /* Corner clusters — the four spots a lane map always forgets. */
      [-1, 1].forEach(function (sz) {
        var cx = s * (HX - 6), cz = sz * (HZ - 8);
        cyl(cx, 0.44, cz, 0.30, 0.88, M.rust);
        cyl(cx + 0.8, 0.44, cz + 0.7, 0.30, 0.88, M.hazard);
        box(cx - 1.0, 0.40, cz + 0.6, 1.4, 0.80, 1.2, M.cargoWood);
      });
    });
    /* Two mid-floor islands where the plan leaves the widest open runs. */
    [[-9.1, -25.9], [9.1, 25.9]].forEach(function (q) {
      box(q[0], 0.55, q[1], 2.6, 1.10, 1.6, M.contGray);
      box(q[0], 1.16, q[1], 2.7, 0.12, 1.7, M.rust, NBOTH);
    });

    /* ============ v11.0 ORIENTATION LANGUAGE ============
       Rahul: the map "feels like a puzzle". The maze is the point of a
       shoot-house, so the walls stay — what was missing is a way to KNOW WHERE
       YOU ARE inside it and to say so to a team-mate. Everything below is
       paint and trim: collide:false, cast:false, every material already in the
       batch list, so cover, dead ground and the collider set are untouched and
       only meshSig moves (rebaselined in verify-fingerprint with this note).

       Four devices, each of which is a WORD a player can use on comms:
         - the long walls are colour-banded: WEST is steel-blue, EAST is rust.
         - the end walls differ: NORTH white band, SOUTH hazard band.
         - three lanes of floor chevrons run spawn-to-spawn, so "left lane /
           centre / right lane" is legible at a glance.
         - each solid block gets hazard corner brackets and each spawn room a
           painted muster disc, so "on the block" and "at spawn" read too. */
    segx(-HX, -(HX - 0.18), 2.2, 2.55, -HZ + 0.5, HZ - 0.5, M.steelBlue, NBOTH); // WEST band
    segx(HX - 0.18, HX, 2.2, 2.55, -HZ + 0.5, HZ - 0.5, M.rust, NBOTH);          // EAST band
    seg(-HX + 0.5, HX - 0.5, 2.2, 2.55, -HZ, -HZ + 0.18, M.paperWhite, NBOTH);   // NORTH band
    seg(-HX + 0.5, HX - 0.5, 2.2, 2.55, HZ - 0.18, HZ, M.hazard, NBOTH);         // SOUTH band

    /* Lane chevrons: two short strokes in a V, pointing outward from centre so
       both spawns read them as "toward the enemy". Painted, never cover. */
    function chevron(cx, cz, dir) {
      var o1 = { rotY: dir * 0.6, cast: false, collide: false };
      var o2 = { rotY: -dir * 0.6, cast: false, collide: false };
      box(cx - 0.42, 0.012, cz - dir * 0.18, 1.05, 0.012, 0.16, M.roadPaintY, o1);
      box(cx + 0.42, 0.012, cz - dir * 0.18, 1.05, 0.012, 0.16, M.roadPaintY, o2);
    }
    [-15.6, 0, 15.6].forEach(function (lx) {
      for (var cz2 = 10.4; cz2 <= 31.1; cz2 += 10.4) {
        chevron(lx, -cz2, -1);
        chevron(lx, cz2, 1);
      }
    });

    /* Hazard corner brackets around each solid block's footprint. */
    function brackets(cx, cz, len) {
      var hx2 = len / 2 + 0.55, hz2 = 4.2 / 2 + 0.55, L = 1.0, W = 0.16;
      [-1, 1].forEach(function (sx2) {
        [-1, 1].forEach(function (sz2) {
          box(cx + sx2 * (hx2 - L / 2), 0.014, cz + sz2 * hz2, L, 0.012, W, M.hazard, NBOTH);
          box(cx + sx2 * hx2, 0.014, cz + sz2 * (hz2 - L / 2), W, 0.012, L, M.hazard, NBOTH);
        });
      });
    }
    brackets(-2.6, -22.0, 10.4); brackets(1.3, 22.0, 10.4);

    /* Muster pads: blue on the north spawn floor, rust on the south, matching
       the wall band you are facing when you leave it. Boxes, not cyl(): cyl()
       hard-sets castShadow=true and ignores the option (measured here — one
       disc cost the caster budget +1; recorded in the handoff, not fixed, as
       fixing cyl would move every map's recorded caster count at once). */
    box(0, 0.008, -(HZ - 9), 4.2, 0.014, 4.2, M.steelBlue, NBOTH);
    box(0, 0.008, (HZ - 9), 4.2, 0.014, 4.2, M.rust, NBOTH);

    /* Loose scatter, with the KEEP_CLEAR discipline v10.11 learned the hard
       way: tested against the crate's FULL footprint, never its centre. */
    var KEEP_CLEAR = [
      [-26, 26, -44, -35], [-26, 26, 35, 44],     // both spawn rooms
      [-8, 8, -11, 11],                           // the deck, its stairs and the ground beneath
      [-19, -15, -6, 6], [17, 21, -6, 6]          // the corridors and their crate steps
    ];
    for (var i = 0; i < 24; i++) {
      var px = (rnd() - 0.5) * 46, pz = (rnd() - 0.5) * 78;
      var cw = 0.5 + rnd() * 0.5, cd = 0.4 + rnd() * 0.4, blocked = false;
      for (var k = 0; k < KEEP_CLEAR.length; k++) {
        var r = KEEP_CLEAR[k];
        if (px + cw / 2 > r[0] && px - cw / 2 < r[1] &&
            pz + cd / 2 > r[2] && pz - cd / 2 < r[3]) { blocked = true; break; }
      }
      if (!blocked) box(px, 0.13, pz, cw, 0.26, cd, M.cargoWood, NCAST);
    }
  };
})();
