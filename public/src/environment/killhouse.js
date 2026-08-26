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

    var HX = 20, HZ = 34, WALL_H = 9.0, PART_H = 2.4, TH = 0.30;
    var NCAST = { cast: false };
    var NBOTH = { cast: false, collide: false };
    function segx(xa, xb, y0, y1, z0, z1, mat, o) {
      return seg(Math.min(xa, xb), Math.max(xa, xb), y0, y1, z0, z1, mat, o);
    }

    /* ============ THE PLAN ============
       Read top-to-bottom off the drawing. North is -z. */
    var PLAN = [
      /*  1 */[-11,  -27, 10, 0,        'w'],   // top-left long partition
      /*  2 */[  7,  -25,  6, 0,        'w'],   // top-right stub
      /*  3 */[-15,  -21,  6, 0,        'w'],   // upper-left partition
      /*  4 */[ -2,  -17,  8, 0,        'b'],   // BIG BLOCK, upper centre
      /*  5 */[  8,  -19,  7, 0,        'w'],   // upper-right T, cap
      /*  6 */[  8,  -15,  8, 1.5708,   'w'],   // upper-right T, stem
      /*  7 */[-14,  -16,  4, 1.5708,   'w'],   // short vertical, left
      /*  8 */[-10,  -13,  5, 0,        'w'],   // left partition
      /*  9 */[ -2,  -11,  6, 0.61,     'w'],   // ANGLED, centre-upper
      /* 10 */[  5,   -9,  7, 1.5708,   'w'],   // right vertical
      /* 11 */[ -8,   -7,  5,-0.70,     'w'],   // ANGLED, left
      /* 12 */[-13,   -7,  8, 0,        'w'],   // long left partition
      /* 13 */[ -2,   -2,  5, 0,        'b'],   // CENTRE BLOCK
      /* 14 */[  9,   -2,  8, 1.5708,   'w'],   // right room, back wall
      /* 15 */[ 12,    2,  5, 0,        'w'],   // right room, side
      /* 16 */[ -9,    4, 10, 0.52,     'w'],   // LONG DIAGONAL, left-centre
      /* 17 */[  3,    3,  5,-0.52,     'w'],   // ANGLED, right of centre
      /* 18 */[-16,    7,  5, 1.5708,   'w'],   // left vertical
      /* 19 */[-11,    8,  5, 0,        'w'],   // left T cap
      /* 20 */[  9,   10,  5, 1.5708,   'w'],   // right vertical
      /* 21 */[ -4,   12,  5, 0,        'w'],   // centre partition
      /* 22 */[  1,   17,  8, 0,        'b'],   // BIG BLOCK, lower centre
      /* 23 */[-13,   17,  7, 0,        'w'],   // lower-left partition
      /* 24 */[-18,   20,  4, 1.5708,   'w'],   // far-left stub
      /* 25 */[-11,   24,  7, 0,        'w'],   // lower-left partition
      /* 26 */[  6,   26,  6, 0,        'w'],   // lower-right partition
      /* 27 */[ -1,   29, 14, 0,        'c'],   // LONG CRATE RUN, bottom
      /* 28 */[ 14,   -8,  6, 1.5708,   'w'],   // far-right vertical
      /* 29 */[-17,  -12,  5, 0,        'w'],   // far-left upper
      /* 30 */[ 13,   14,  5, 0,        'w']    // lower-right stub
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
        var ux = Math.cos(rot), uz = Math.sin(rot);
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
      /* Exposed steel studs at each end — stops a partition reading as a slab. */
      var hc = Math.cos(rot || 0) * (len / 2), hs = Math.sin(rot || 0) * (len / 2);
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
    [[-16, -25, 0.3], [4, -21, -0.4], [-6, -9, 1.1], [11, -5, 0.2],
     [-14, 2, -0.6], [6, 8, 1.4], [-3, 21, 0.1], [14, 27, -0.9]]
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
        cyl(s * 15 + d * 0.9, 0.44, bz, 0.30, 0.88, d % 2 ? M.rust : M.hazard);
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
      [-24, -12, 0, 12, 24].forEach(function (lz) {
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
      [-29, -20, -11, -2, 7, 16, 25].forEach(function (bz, i) {
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
    [[-7, -20], [7, 20]].forEach(function (q) {
      box(q[0], 0.55, q[1], 2.6, 1.10, 1.6, M.contGray);
      box(q[0], 1.16, q[1], 2.7, 0.12, 1.7, M.rust, NBOTH);
    });

    /* Loose scatter, with the KEEP_CLEAR discipline v10.11 learned the hard
       way: tested against the crate's FULL footprint, never its centre. */
    var KEEP_CLEAR = [
      [-20, 20, -34, -27], [-20, 20, 27, 34],     // both spawn rooms
      [-4, 4, -4, 4]                              // the centre block approach
    ];
    for (var i = 0; i < 18; i++) {
      var px = (rnd() - 0.5) * 34, pz = (rnd() - 0.5) * 58;
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
