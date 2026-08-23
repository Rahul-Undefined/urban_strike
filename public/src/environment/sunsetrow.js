/* SUNSET ROW — two houses facing each other across a street. v10.12.
   Registers World._buildSunsetRow, same contract as _buildKillhouse.

   THE SHAPE IS THE POINT. Killhouse is cover-in-lanes; this is
   rooms-and-a-street. The houses are enterable volumes at the ends rather than
   obstacles in a corridor, so a fight here is decided by who holds an interior
   and who is brave enough to cross the open middle. Building a second
   three-lane box would have given Rahul two maps that play the same.

   NO STAIRS, NO CLIMBABLE ROOFS. verify-climb is red on 21 flights across
   urban and rural and handoff sections 4.6/4.7 are both about stair fixes
   creating fresh defects. Single storey, roofs sealed.

   EVERY MIRRORED X PAIR GOES THROUGH segx(). v10.11 shipped three walls with
   x0 > x1 and negative width because seg() does not sort its arguments and
   `s` is -1 on one side. That is now a documented rule and a gate
   (verify-collision), and this file obeys it from its first line. */
(function () {
  if (typeof World === 'undefined') return;

  World._buildSunsetRow = function (T) {
    var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, rnd = T.rnd;

    var HX = 32, HZ = 20;               // 64 x 40 m
    var NCAST = { cast: false };
    var NBOTH = { cast: false, collide: false };

    function pair(f) { f(1); f(-1); }
    /* seg() with its X pair normalised — see the header. */
    function segx(xa, xb, y0, y1, z0, z1, mat, opts) {
      return seg(Math.min(xa, xb), Math.max(xa, xb), y0, y1, z0, z1, mat, opts);
    }
    function boxx(cx, cy, cz, w, h, d, mat, opts) {
      return box(cx, cy, cz, Math.abs(w), h, Math.abs(d), mat, opts);
    }

    /* ================= GROUND ================= */
    seg(-HX, HX, -0.40, 0, -HZ, HZ, M.dirt, NCAST);
    // lawns either side of the road
    segx(-HX, -7.2, -0.005, 0.01, -HZ, HZ, M.foliage, NCAST);
    segx(7.2, HX, -0.005, 0.01, -HZ, HZ, M.foliage, NCAST);
    // the road itself
    seg(-7.2, 7.2, 0, 0.012, -HZ, HZ, M.asphalt, NCAST);
    seg(-7.4, -7.2, 0.012, 0.14, -HZ, HZ, M.sidewalk);
    seg(7.2, 7.4, 0.012, 0.14, -HZ, HZ, M.sidewalk);
    // centre line, dashed
    for (var ml = -HZ + 2; ml < HZ - 1; ml += 4) {
      seg(-0.14, 0.14, 0.013, 0.019, ml, ml + 2.2, M.roadPaintY, NBOTH);
    }

    /* ================= A HOUSE =================
       Single storey, four rooms, two doorways, windows you can shoot through.
       Walls are 0.18 m so a doorway reads as a doorway and not a slot.

       Doorways are 1.4 m wide — deliberately wider than killhouse's 1.2 m.
       v10.11 shipped a killhouse doorway with a 0.69 m walkable gap against a
       0.70 m player capsule because a scatter crate landed in it. Nothing
       scatters indoors here, and the extra 0.2 m is margin against the same
       class of mistake. */
    function house(s) {
      var cx = s * 22.5;                 // house centre
      var W = 13, D = 18, H = 3.2, TW = 0.18;
      var x0 = cx - W / 2, x1 = cx + W / 2, z0 = -D / 2, z1 = D / 2;

      // long walls (north and south), solid
      segx(x0, x1, 0, H, z0, z0 + TW, M.brick);
      segx(x0, x1, 0, H, z1 - TW, z1, M.brick);

      /* Street-facing wall: two window bays and a central doorway.
         `inner` is the edge nearer the street, which flips with s. */
      var inner = cx - s * (W / 2), outer = cx + s * (W / 2);
      segx(inner, inner + s * TW, 0, H, z0, -3.2, M.brick);
      segx(inner, inner + s * TW, 0, H, 3.2, z1, M.brick);
      segx(inner, inner + s * TW, 0, H, -3.2, -0.7, M.brick);   // pier
      segx(inner, inner + s * TW, 0, H, 0.7, 3.2, M.brick);     // pier
      segx(inner, inner + s * TW, 2.2, H, -0.7, 0.7, M.brick);  // door header

      // back wall with a second doorway, so the house is not a dead end
      segx(outer, outer - s * TW, 0, H, z0, -1.6, M.brick);
      segx(outer, outer - s * TW, 0, H, 1.6, z1, M.brick);
      segx(outer, outer - s * TW, 2.2, H, -1.6, 1.6, M.brick);

      /* Interior partitions. Two of them, offset, so the inside is four rooms
         with a dogleg rather than a hall you can clear from the doorway. */
      segx(cx - s * 1.2, cx - s * 1.2 - s * TW, 0, H, z0 + TW, -2.4, M.plaster);
      segx(cx - s * 1.2, cx - s * 1.2 - s * TW, 0, H, 2.4, z1 - TW, M.plaster);
      segx(x0 + 1.0, x1 - 1.0, 0, H, -0.09, 0.09, M.plaster, NCAST);

      // roof, sealed and not climbable
      segx(x0 - 0.5, x1 + 0.5, H, H + 0.3, z0 - 0.5, z1 + 0.5, M.terracotta, NCAST);
      segx(x0 - 0.5, x1 + 0.5, H + 0.3, H + 0.55, z0 + 1.5, z1 - 1.5, M.roof, NCAST);

      /* Windows: glass in the gaps, non-colliding so you can shoot and see
         through but not walk through — the frame below is what stops you. */
      [-6.2, -4.6, 4.6, 6.2].forEach(function (wz) {
        boxx(inner + s * 0.09, 1.75, wz, 0.10, 1.05, 1.3, M.shopGlass, NBOTH);
        boxx(inner + s * 0.09, 1.12, wz, 0.16, 0.16, 1.42, M.trim, NCAST);
      });
      // window sills you can vault — 1.1 m, inside the 0.42 m step from a crate
      [-6.2, -4.6, 4.6, 6.2].forEach(function (wz) {
        boxx(inner + s * 0.02, 1.05, wz, 0.30, 0.10, 1.42, M.plaster, NCAST);
      });

      // furniture: something to break line of sight indoors
      boxx(cx - s * 4.2, 0.38, -5.0, 1.9, 0.76, 0.9, M.wood);
      boxx(cx - s * 4.2, 0.30, 5.4, 1.1, 0.60, 1.9, M.cargoWood);
      boxx(cx + s * 3.4, 0.45, -4.2, 0.9, 0.90, 1.8, M.paleYellow);
      boxx(cx + s * 3.6, 0.36, 5.0, 1.7, 0.72, 0.9, M.wood);
      cyl(cx + s * 1.0, 0.55, 0, 0.30, 1.10, M.terracotta, NCAST);

      /* Porch: a slab and two posts. Reads as a front door from across the
         street, which is what tells you where the entrance is. */
      boxx(inner + s * 0.9, 0.09, 0, 1.8, 0.18, 3.2, M.concrete);
      pair(function (q) {
        boxx(inner + s * 1.6, 1.3, q * 1.3, 0.16, 2.6, 0.16, M.wood, NCAST);
      });
      boxx(inner + s * 1.1, 2.7, 0, 2.2, 0.16, 3.4, M.roof, NCAST);
    }
    pair(house);

    /* ================= YARDS ================= */
    /* Garden walls. Low enough to shoot over standing, high enough to break a
       sprint — the most useful cover height there is. */
    pair(function (s) {
      segx(s * 9.5, s * 16.5, 0, 1.05, -HZ + 2.6, -HZ + 2.9, M.brick);
      segx(s * 9.5, s * 16.5, 0, 1.05, HZ - 2.9, HZ - 2.6, M.brick);
      segx(s * 26, s * 31, 0, 1.05, -8.4, -8.1, M.brick);
      segx(s * 26, s * 31, 0, 1.05, 8.1, 8.4, M.brick);
      // hedges: same job, different silhouette, so the yards are not identical
      boxx(s * 20, 0.55, -14.5, 5.4, 1.10, 0.9, M.foliage, NCAST);
      boxx(s * 20, 0.55, 14.5, 5.4, 1.10, 0.9, M.foliage, NCAST);
    });

    /* Sheds in the far corners: the only hard cover on the flank routes, so
       going the long way round is a real option and not just a slower death. */
    pair(function (s) {
      [-1, 1].forEach(function (q) {
        var sx = s * 28.5, sz = q * 16.5;
        boxx(sx, 1.1, sz, 4.0, 2.2, 3.0, M.metal);
        boxx(sx, 2.28, sz, 4.4, 0.16, 3.4, M.rust, NCAST);
      });
    });

    /* ================= THE STREET ================= */
    /* The bus is the centre of the map. Long enough to break the street into
       two halves, so crossing is a choice of side rather than one open sprint. */
    (function bus() {
      boxx(0, 1.55, 0, 2.5, 2.4, 11.0, M.busBody);
      boxx(0, 2.82, 0, 2.6, 0.16, 11.2, M.busRoof, NCAST);
      [-4.2, -1.4, 1.4, 4.2].forEach(function (wz) {
        boxx(1.27, 1.85, wz, 0.06, 0.95, 2.2, M.vGlass, NBOTH);
        boxx(-1.27, 1.85, wz, 0.06, 0.95, 2.2, M.vGlass, NBOTH);
      });
      [-4.0, 4.0].forEach(function (wz) {
        cyl(1.25, 0.42, wz, 0.42, 0.28, M.tire, NCAST);
        cyl(-1.25, 0.42, wz, 0.42, 0.28, M.tire, NCAST);
      });
    })();

    // a car at each end of the street, angled, so the road is not a rifle range
    function car(cx, cz, rot, paint) {
      var o = { rotY: rot };
      boxx(cx, 0.62, cz, 4.3, 0.80, 1.85, paint, o);
      boxx(cx - 0.15, 1.30, cz, 2.2, 0.60, 1.7, M.carGlass, { rotY: rot, cast: false });
      cyl(cx - 1.4, 0.32, cz - 0.9, 0.32, 0.24, M.tire, NCAST);
      cyl(cx - 1.4, 0.32, cz + 0.9, 0.32, 0.24, M.tire, NCAST);
      cyl(cx + 1.4, 0.32, cz - 0.9, 0.32, 0.24, M.tire, NCAST);
      cyl(cx + 1.4, 0.32, cz + 0.9, 0.32, 0.24, M.tire, NCAST);
    }
    car(-3.6, -12.5, 0.20, M.carPaint[1]);
    car(3.6, 12.5, Math.PI - 0.20, M.carPaint[4]);

    /* Street furniture. Lamps, bins and a hydrant — small, cheap, and what
       stops a road reading as a grey strip. */
    pair(function (s) {
      [-15, 0, 15].forEach(function (lz) {
        cyl(s * 7.9, 2.4, lz, 0.10, 4.8, M.metal, NCAST);
        boxx(s * 7.9, 4.85, lz, 0.5, 0.18, 0.9, M.lampGlow, NBOTH);
      });
      boxx(s * 8.6, 0.45, -6.5, 0.8, 0.90, 0.8, M.railGreen);
      boxx(s * 8.6, 0.45, 6.5, 0.8, 0.90, 0.8, M.railGreen);
      cyl(s * 8.4, 0.35, 11.5, 0.16, 0.70, M.signalRed, NCAST);
    });

    /* ================= PERIMETER ================= */
    /* A solid fence, not a wall of nothing. verify-collision asserts zero
       escapes on this map for the same reason as killhouse: the boundary is
       geometry, not an invisible rule. */
    seg(-HX - 0.4, HX + 0.4, 0, 3.0, -HZ - 0.4, -HZ, M.metal);
    seg(-HX - 0.4, HX + 0.4, 0, 3.0, HZ, HZ + 0.4, M.metal);
    pair(function (s) { segx(s * HX, s * (HX + 0.4), 0, 3.0, -HZ, HZ, M.metal); });
    for (var fx = -HX + 2; fx <= HX - 2; fx += 3.0) {
      seg(fx - 0.08, fx + 0.08, 0.2, 3.2, -HZ - 0.02, -HZ + 0.12, M.steelBlue, NBOTH);
      seg(fx - 0.08, fx + 0.08, 0.2, 3.2, HZ - 0.12, HZ + 0.02, M.steelBlue, NBOTH);
    }

    /* ===== v10.12 DENSITY PASS =====
       First build measured 130 colliders, 32 draws and 3,064 triangles against
       budgets of 45 and 26,000. A suburban street at that density is two boxes
       and a bus. Everything below reuses materials ALREADY emitted above, so
       the merge pass folds it into batches that are already paid for and the
       draw count barely moves — triangles were the cheap axis with 23,000
       spare, exactly as on killhouse. */

    /* Chimneys, gutters and porch rails: the details that make a box read as a
       house from across the street. */
    pair(function (s) {
      var cx = s * 22.5;
      boxx(cx + s * 3.5, 4.2, -5.5, 1.1, 2.0, 1.1, M.brick, NCAST);
      boxx(cx + s * 3.5, 5.28, -5.5, 1.3, 0.16, 1.3, M.dark, NCAST);
      [-9.4, 9.4].forEach(function (gz) {
        boxx(cx, 3.16, gz, 13.6, 0.14, 0.18, M.trim, NBOTH);
      });
      // porch rails
      [-1.5, 1.5].forEach(function (rz) {
        boxx(cx - s * 15.6, 0.62, rz, 1.9, 0.10, 0.10, M.wood, NBOTH);
      });
      // mailbox and a path from the porch to the pavement
      cyl(cx - s * 6.5, 0.55, -2.2, 0.07, 1.10, M.metal, NCAST);
      boxx(cx - s * 6.5, 1.18, -2.2, 0.42, 0.30, 0.30, M.railGreen, NCAST);
      segx(cx - s * 6.2, cx - s * 14.6, 0.006, 0.016, -0.9, 0.9, M.concrete, NBOTH);
    });

    /* Driveway and carport at the outer end of each house — gives the back
       doorway somewhere to lead and puts cover on the flank approach. */
    pair(function (s) {
      var dx = s * 29.5;
      segx(dx - s * 3.4, dx + s * 2.2, 0.006, 0.016, -3.4, 3.4, M.concrete, NBOTH);
      [-3.0, 3.0].forEach(function (pz) {
        boxx(dx, 1.25, pz, 0.16, 2.5, 0.16, M.metal, NCAST);
      });
      boxx(dx, 2.6, 0, 3.0, 0.16, 6.6, M.rust, NCAST);
      boxx(dx, 0.45, 2.4, 1.1, 0.90, 1.1, M.cargoWood);
    });

    /* Trees and bushes. Two-part trunks and canopies, non-casting: urban has
       zero caster headroom and this map should not learn that habit late. */
    function tree(cx, cz, h) {
      cyl(cx, h * 0.42, cz, 0.20, h * 0.84, M.wood, NCAST);
      cyl(cx, h * 0.95, cz, 1.45, h * 0.55, M.foliage, NCAST);
      /* v10.12: the canopy highlight was M.sage and the second bin M.maroon,
         and the kerb line M.roadPaint. Three materials this map did not
         otherwise use, and the draw count went 32 -> 42 against a budget of 45
         for three shades nobody would name. Swapped for palette entries already
         present here — the merge pass folds them into batches that exist. A new
         material is the expensive thing on this axis; geometry is not. */
      cyl(cx, h * 1.28, cz, 1.05, h * 0.42, M.foliage, NBOTH);
    }
    pair(function (s) {
      tree(s * 12.5, -17.0, 3.4); tree(s * 12.5, 17.0, 3.2);
      tree(s * 31.0, -17.5, 3.0); tree(s * 31.0, 17.5, 3.1);
      [-11.5, -3.5, 3.5, 11.5].forEach(function (bz) {
        boxx(s * 8.9, 0.42, bz, 1.0, 0.85, 1.6, M.foliage, NCAST);
      });
    });

    /* Power poles and a wire run down the street. Sagging in three segments,
       non-colliding — they give the eye something at mid-height, which is what
       an open street otherwise lacks. Anchored on real poles, unlike the urban
       cable run that was cut in v10.10 for having no measured anchors. */
    pair(function (s) {
      [-16, 0, 16].forEach(function (pz) {
        cyl(s * 8.6, 3.3, pz, 0.16, 6.6, M.wood, NCAST);
        boxx(s * 8.6, 6.2, pz, 1.7, 0.12, 0.12, M.wood, NBOTH);
      });
      for (var w = 0; w < 6; w++) {
        var t0 = w / 6, t1 = (w + 1) / 6;
        var za = -16 + 32 * t0, zb = -16 + 32 * t1;
        var ya = 6.1 - Math.sin((t0 * 2 % 1) * Math.PI) * 0.5;
        var yb = 6.1 - Math.sin((t1 * 2 % 1) * Math.PI) * 0.5;
        boxx(s * 8.6, (ya + yb) / 2, (za + zb) / 2, 0.06, 0.06, Math.abs(zb - za), M.dark, NBOTH);
      }
    });

    /* Kerbside clutter: bins, a bench, a hydrant, road markings at the ends. */
    pair(function (s) {
      boxx(s * 8.5, 0.50, -16.5, 0.7, 1.00, 0.7, M.steelBlue);
      boxx(s * 8.5, 0.50, 16.5, 0.7, 1.00, 0.7, M.railGreen);
      boxx(s * 9.6, 0.45, 0, 0.5, 0.10, 1.9, M.wood, NCAST);
      [-0.7, 0.7].forEach(function (bz) {
        boxx(s * 9.6, 0.22, bz, 0.4, 0.44, 0.12, M.metal, NBOTH);
      });
      segx(s * 7.5, s * 7.5 + s * 0.16, 0.014, 0.02, -HZ + 1, HZ - 1, M.roadPaintY, NBOTH);
    });

    /* Loose scatter, with the same KEEP_CLEAR discipline killhouse learned the
       hard way in v10.11 — tested against the full footprint, not the centre. */
    var KEEP_CLEAR = [
      [-17.5, -14.5, -1.4, 1.4], [14.5, 17.5, -1.4, 1.4],   // porch doorways
      [-30.5, -27.5, -2.4, 2.4], [27.5, 30.5, -2.4, 2.4],   // back doorways
      [-29.5, -15.5, -9.5, 9.5], [15.5, 29.5, -9.5, 9.5],   // house interiors
      [-7.6, 7.6, -20, 20],                                  // the whole road
      [-32, -28, -14, 14], [28, 32, -14, 14]                 // spawn pockets
    ];
    function clearOf(px, pz, hw, hd) {
      for (var k = 0; k < KEEP_CLEAR.length; k++) {
        var r = KEEP_CLEAR[k];
        if (px + hw > r[0] && px - hw < r[1] && pz + hd > r[2] && pz - hd < r[3]) return false;
      }
      return true;
    }
    for (var i = 0; i < 16; i++) {
      var px = (rnd() - 0.5) * 58, pz = (rnd() - 0.5) * 36;
      var cw = 0.5 + rnd() * 0.6, cd = 0.4 + rnd() * 0.5;
      if (!clearOf(px, pz, cw / 2, cd / 2)) continue;
      box(px, 0.13, pz, cw, 0.26, cd, M.cargoWood, NCAST);
    }
  };
})();
