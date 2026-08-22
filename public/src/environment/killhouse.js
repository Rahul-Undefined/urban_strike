/* KILLHOUSE — indoor close-quarters warehouse. v10.10.
   Registers World._buildKillhouse, matching the World._buildRural contract:
   the dispatcher hands us { seg, box, cyl, stairFlight, M, rnd, scene,
   addCollider } and we build into the disposable world group.

   WHY THIS MAP EXISTS. Urban and Metro are 200 m maps. Two players can spend a
   minute not finding each other, which is the wrong experience for a lobby of
   four. Nothing here is further than 40 m from anything else.

   NO STAIRS. Not one. `stairFlight` is in the contract and is deliberately
   unused. verify-climb is still red on 21 flights across two maps, verify-arch
   on 39 roofs, and sections 4.6 and 4.7 of the handoff are both about stair
   fixes creating new defects. Importing that on a map's first day is the wrong
   trade. Container tops are reached by a 0.55 m crate step then a 0.62 m
   pallet step, both inside the 0.42 m auto-step... no: both are climbed as TWO
   0.31 m steps each, which is inside it. Verified by verify-climb finding zero
   flights here to fail on, and by the step chain being built from ordinary
   boxes the controller already handles.

   MIRRORED ABOUT x=0, EXACTLY. Every prop is emitted by a helper that places
   it twice, at +x and -x, with the same dimensions. A close-quarters map that
   is not symmetric hands one spawn the better opening, and the opening is most
   of a match this size. The mirror is structural, not a convention someone has
   to remember: see `pair()`.

   BUDGET. Metro sits at 41 of 45 draw calls and 25,708 of 26,000 triangles.
   This map targets under 40 calls and under 30k triangles by reusing the
   existing M.* palette — every colour here already exists on another map, so
   the merge pass folds them into batches that are already paid for. Not one
   new material is created. */
(function () {
  if (typeof World === 'undefined') return;

  World._buildKillhouse = function (T) {
    var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, rnd = T.rnd;

    /* HALF-EXTENTS. The building is 58 x 34 m of interior floor. BOUND is set
       to 32 by CFG.MAPS so the out-of-bounds ring sits just outside the wall
       and a player cannot be pushed through it into nothing. */
    var HX = 29, HZ = 17, WALL_H = 9.0;

    var NCAST = { cast: false };
    var NCOL = { collide: false };
    var NBOTH = { cast: false, collide: false };

    /* pair(f) runs a builder at +x and at -x. Everything structural goes
       through this, so the map cannot drift out of symmetry through an edit
       that only remembers one side. Centre-line objects call the builder
       directly instead of through pair(). */
    function pair(f) { f(1); f(-1); }

    /* ================= SHELL ================= */

    /* Floor. Two slabs rather than one: the centre strip is a different tone
       so the middle of the map reads as a place from across the building,
       which is what stops a big empty rectangle feeling like a corridor. */
    seg(-HX, HX, -0.40, 0, -HZ, HZ, M.concrete, NCAST);
    seg(-10, 10, -0.005, 0.006, -HZ, HZ, M.sidewalk, NBOTH);

    /* Painted lane markings. Purely visual — zero colliders, zero shadows.
       These do the same job the district floor tints do on Metro: they tell
       you which lane you are in without a single extra wall. */
    function stripe(x0, x1, z0, z1) {
      seg(x0, x1, 0.006, 0.014, z0, z1, M.roadPaintY, NBOTH);
    }
    stripe(-HX + 1, HX - 1, -6.15, -5.95);
    stripe(-HX + 1, HX - 1, 5.95, 6.15);
    pair(function (s) {
      stripe(s * 12.9, s * 13.1, -HZ + 1, HZ - 1);
      // hazard chevrons at the spawn thresholds
      for (var i = 0; i < 6; i++) {
        seg(s * 22 - 0.5, s * 22 + 0.5, 0.006, 0.014,
          -7.5 + i * 2.6, -7.5 + i * 2.6 + 1.1, M.hazard, NBOTH);
      }
    });

    /* Walls. Corrugation is faked with vertical ribs at 1.5 m rather than
       modelled: 40 ribs a side would be 40 boxes for a texture effect. These
       are non-colliding and non-casting, so they cost triangles only. */
    seg(-HX - 0.4, HX + 0.4, 0, WALL_H, -HZ - 0.4, -HZ, M.metal);
    seg(-HX - 0.4, HX + 0.4, 0, WALL_H, HZ, HZ + 0.4, M.metal);
    pair(function (s) {
      seg(s * HX, s * (HX + 0.4), 0, WALL_H, -HZ, HZ, M.metal);
    });
    for (var rx = -HX + 2; rx <= HX - 2; rx += 3.2) {
      seg(rx - 0.09, rx + 0.09, 0.2, WALL_H - 0.3, -HZ - 0.02, -HZ + 0.14, M.steelBlue, NBOTH);
      seg(rx - 0.09, rx + 0.09, 0.2, WALL_H - 0.3, HZ - 0.14, HZ + 0.02, M.steelBlue, NBOTH);
    }

    /* Roof trusses and skylights. The skylights are what make the interior
       readable: lighting() gives a hemisphere and one sun, and without a
       reason for light to fall in bands the floor reads flat. Panels are
       emissive-free — they are pale material catching the hemisphere, which
       costs nothing and does not add a light source. */
    seg(-HX, HX, WALL_H, WALL_H + 0.35, -HZ, HZ, M.dark, NCAST);
    for (var tz = -HZ + 3; tz <= HZ - 3; tz += 4.5) {
      seg(-HX, HX, WALL_H - 0.75, WALL_H - 0.55, tz - 0.16, tz + 0.16, M.steelBlue, NBOTH);
      seg(-8.5, 8.5, WALL_H - 0.02, WALL_H + 0.02, tz - 1.5, tz + 1.5, M.paperWhite, NBOTH);
    }
    pair(function (s) {
      for (var tx = 4; tx <= HX - 3; tx += 6) {
        seg(s * tx - 0.14, s * tx + 0.14, WALL_H - 3.4, WALL_H - 0.6, -HZ + 1, -HZ + 1.3, M.steelBlue, NBOTH);
        seg(s * tx - 0.14, s * tx + 0.14, WALL_H - 3.4, WALL_H - 0.6, HZ - 1.3, HZ - 1, M.steelBlue, NBOTH);
      }
    });

    /* Wall-mounted bay lamps. Non-colliding, non-casting; the glow material is
       already in the palette so this is triangles only. */
    pair(function (s) {
      [-11, 0, 11].forEach(function (lz) {
        box(s * (HX - 0.6), 6.4, lz, 0.5, 0.28, 1.0, M.amberGlow, NBOTH);
      });
    });

    /* ================= PROPS ================= */

    /* A shipping container. Ribbed sides, recessed door end, and a 0.31 m
       double step at one end so the roof is reachable without a stair. */
    function container(cx, cz, rot, mat, withSteps, baseY) {
      var L = 6.06, W = 2.44, H = 2.60, B = baseY || 0;
      var o = rot ? { rotY: rot } : undefined;
      box(cx, B + H / 2, cz, L, H, W, mat, o);
      // corner castings
      var hx = L / 2 - 0.16, hz = W / 2 - 0.16;
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) {
        var px = cx + c[0] * hx * Math.cos(rot || 0) - c[1] * hz * Math.sin(rot || 0);
        var pz = cz + c[0] * hx * Math.sin(rot || 0) + c[1] * hz * Math.cos(rot || 0);
        box(px, B + H - 0.08, pz, 0.3, 0.16, 0.3, M.dark, NBOTH);
        box(px, B + 0.08, pz, 0.3, 0.16, 0.3, M.dark, NBOTH);
      });
      // rust streaks
      box(cx, B + 1.9, cz, L * 0.72, 0.5, W + 0.02, M.rust, NBOTH);
      if (withSteps) {
        var sx = cx + (L / 2 + 0.5) * Math.cos(rot || 0);
        var sz = cz + (L / 2 + 0.5) * Math.sin(rot || 0);
        box(sx, 0.155, sz, 1.3, 0.31, 1.3, M.cargoWood);
        var s2x = cx + (L / 2 - 0.35) * Math.cos(rot || 0);
        var s2z = cz + (L / 2 - 0.35) * Math.sin(rot || 0);
        box(s2x, 0.465, s2z, 1.2, 0.93, 1.2, M.palletBase);
        box(s2x, 1.245, s2z, 1.2, 0.63, 1.2, M.palletWood);
        box(s2x, 1.87, s2z, 1.2, 0.62, 1.2, M.cargoWood);
      }
    }

    /* Container alley, north lane, and the south twin. Rotations are small so
       the sides are not a flat wall of parallel boxes — a lane you can read at
       a glance is a lane you can fight in. */
    pair(function (s) {
      container(s * 17, -11, 0, s > 0 ? M.contBlue : M.contRed, true);
      container(s * 24, -9.2, 0.14 * s, M.contGray, false);
      container(s * 17, 11, 0, s > 0 ? M.contGreen : M.contBlue, true);
      container(s * 24, 9.2, -0.14 * s, M.contRed, false);
    });

    /* Steel shelving racks in the mid lane. Two shelves, open underneath, so
       they block sight without blocking movement — the single most useful
       shape in a close-quarters map. Shelf 2 top is 2.20; its loot point sits
       at 2.75 per the config. */
    function rack(cx, cz, len) {
      var H1 = 1.10, H2 = 2.20, D = 1.1;
      box(cx, H1, cz, len, 0.12, D, M.steelBlue);
      box(cx, H2, cz, len, 0.12, D, M.steelBlue);
      for (var u = -len / 2 + 0.2; u <= len / 2 - 0.2; u += 2.2) {
        box(cx + u, 1.25, cz - D / 2 + 0.08, 0.14, 2.5, 0.14, M.metal, NCAST);
        box(cx + u, 1.25, cz + D / 2 - 0.08, 0.14, 2.5, 0.14, M.metal, NCAST);
      }
      // crates on the shelves — cover you can shoot over from the right angle
      box(cx - len / 4, 1.52, cz, 1.5, 0.72, 0.9, M.cargoWood, NCAST);
      box(cx + len / 4, 2.62, cz, 1.2, 0.72, 0.9, M.palletWood, NCAST);
    }
    pair(function (s) { rack(s * 11, 0, 6.4); });

    /* The central stack. Highest-value ground on the map: visible from all
       three lanes, which is what makes holding it a decision rather than a
       default. Climbable on two sides only, so it can be contested. */
    box(0, 0.60, 0, 3.6, 1.20, 3.6, M.cargoWood);
    box(0, 1.65, 0, 2.6, 0.90, 2.6, M.palletWood);
    box(0, 2.45, 0, 1.8, 0.70, 1.8, M.contGray);
    pair(function (s) {
      box(s * 2.6, 0.155, 0, 1.4, 0.31, 1.8, M.palletBase);
      box(s * 2.6, 0.62, 0, 1.4, 0.62, 1.8, M.cargoWood);
    });

    /* Pallet stacks. Slatted, so they read as pallets rather than brown boxes.
       Slats are non-colliding: the stack collides as one block, which is what
       the player expects and what keeps the collider count sane. */
    function pallets(cx, cz, layers) {
      box(cx, layers * 0.16, cz, 1.2, layers * 0.32, 1.0, M.palletBase);
      for (var L2 = 0; L2 < layers; L2++) {
        for (var sl = -2; sl <= 2; sl++) {
          box(cx + sl * 0.26, L2 * 0.32 + 0.28, cz, 0.16, 0.05, 1.02, M.palletWood, NBOTH);
        }
      }
    }
    pair(function (s) {
      pallets(s * 9, -13.2, 4); pallets(s * 10.6, -13.2, 3);
      pallets(s * 9, 13.2, 3); pallets(s * 21, 4.4, 5);
      pallets(s * 21, -4.4, 4);
    });

    /* Oil drums. Cylinders with a rim band, in loose clusters. */
    function drums(cx, cz, n) {
      for (var d = 0; d < n; d++) {
        var dx = cx + (rnd() - 0.5) * 1.9, dz = cz + (rnd() - 0.5) * 1.9;
        var mm = rnd() < 0.4 ? M.rust : (rnd() < 0.5 ? M.hazard : M.railGreen);
        cyl(dx, 0.44, dz, 0.30, 0.88, mm);
        cyl(dx, 0.62, dz, 0.315, 0.06, M.dark, NBOTH);
        cyl(dx, 0.26, dz, 0.315, 0.06, M.dark, NBOTH);
      }
    }
    pair(function (s) { drums(s * 6.5, -9.5, 3); drums(s * 20, 13.5, 4); });

    /* Forklift, west bay. One per side. Enough shapes to be recognisable at a
       glance and no more — a silhouette is what matters at 30 m indoors. */
    function forklift(cx, cz, rot) {
      var o = { rotY: rot };
      box(cx, 0.72, cz, 2.1, 0.90, 1.25, M.hazard, o);
      box(cx, 1.42, cz + 0.25, 0.95, 0.55, 0.9, M.dark, { rotY: rot, cast: false });
      box(cx, 2.05, cz, 1.05, 0.08, 1.0, M.metal, { rotY: rot, cast: false });
      pair(function (q) {
        box(cx + q * 0.45, 1.55, cz - 0.5, 0.07, 1.0, 0.07, M.metal, NBOTH);
      });
      // mast and forks
      box(cx + 1.15 * Math.cos(rot), 1.35, cz + 1.15 * Math.sin(rot), 0.14, 2.70, 1.0, M.steelBlue, o);
      box(cx + 1.5 * Math.cos(rot), 0.10, cz + 1.5 * Math.sin(rot), 0.9, 0.08, 0.75, M.metal, NCAST);
      cyl(cx - 0.7, 0.32, cz - 0.55, 0.32, 0.26, M.tire, NCAST);
      cyl(cx - 0.7, 0.32, cz + 0.55, 0.32, 0.26, M.tire, NCAST);
      cyl(cx + 0.8, 0.26, cz - 0.5, 0.26, 0.22, M.tire, NCAST);
      cyl(cx + 0.8, 0.26, cz + 0.5, 0.26, 0.22, M.tire, NCAST);
    }
    pair(function (s) { forklift(s * 13.5, -14.2, s > 0 ? 0.3 : Math.PI - 0.3); });

    /* ===== v10.10 DENSITY PASS =====
       First build measured 140 colliders, 33 draws, 8,004 triangles against
       budgets of 45 and 26,000. A warehouse at that density reads as a car
       park with boxes in it. Everything below reuses materials ALREADY emitted
       above, so the merge pass folds it into batches that are already paid for
       and the draw count barely moves — triangles are the cheap axis here and
       there were 18,000 spare. */

    /* Stacked second tier on the inner containers. Gives the alley a real
       ceiling and turns the container tops from a flat shelf into cover. */
    pair(function (s) {
      container(s * 17, -11, 0, M.contGray, false, 2.60);
      container(s * 17, 11, 0, M.contRed, false, 2.60);
    });

    /* Wall shelving down both long walls: racking, stock and roll-up doors.
       Depth 0.9 so it eats almost no floor, but it stops the walls reading as
       two blank steel sheets. */
    pair(function (s) {
      [-13, -4.5, 4.5, 13].forEach(function (wz) {
        box(s * (HX - 0.55), 1.05, wz, 0.9, 0.10, 3.2, M.steelBlue, NCAST);
        box(s * (HX - 0.55), 2.10, wz, 0.9, 0.10, 3.2, M.steelBlue, NCAST);
        box(s * (HX - 0.55), 1.45, wz - 0.8, 0.8, 0.70, 1.2, M.cargoWood, NCAST);
        box(s * (HX - 0.55), 2.50, wz + 0.8, 0.8, 0.70, 1.2, M.palletWood, NCAST);
        box(s * (HX - 0.5), 1.6, wz, 0.06, 3.1, 3.3, M.metal, NBOTH);
      });
      // roll-up loading doors on the end walls
      [-9, 9].forEach(function (dz) {
        box(s * (HX - 0.06), 2.1, dz, 0.10, 4.2, 4.4, M.rust, NBOTH);
        for (var sl = 0; sl < 9; sl++) {
          box(s * (HX - 0.14), 0.25 + sl * 0.46, dz, 0.06, 0.36, 4.3, M.dark, NBOTH);
        }
      });
    });

    /* Roof-level gantry rail and hanging chain hoist over the centre line.
       Non-colliding: it is 7 m up and exists to give the eye something between
       the floor and the roof, which is what makes an interior feel tall. */
    seg(-20, 20, 7.0, 7.30, -0.35, 0.35, M.steelBlue, NBOTH);
    pair(function (s) {
      box(s * 8, 6.1, 0, 0.5, 1.5, 0.5, M.hazard, NBOTH);
      for (var ch = 0; ch < 5; ch++) {
        box(s * 8, 5.0 - ch * 0.28, 0, 0.07, 0.2, 0.07, M.dark, NBOTH);
      }
    });

    /* Floor clutter with weight: tyre stacks, cable reels, a spill of crates.
       Tyre stacks are the classic warehouse silhouette and read instantly. */
    function tyres(cx, cz, n) {
      for (var t = 0; t < n; t++) cyl(cx, 0.13 + t * 0.24, cz, 0.52, 0.24, M.tire, t ? NCAST : undefined);
    }
    function reel(cx, cz) {
      cyl(cx, 0.62, cz, 0.62, 0.14, M.palletWood, { rotY: 0 });
      cyl(cx, 0.62, cz, 0.44, 0.62, M.dark, NBOTH);
      cyl(cx, 0.62, cz, 0.62, 0.14, M.palletWood, NBOTH);
    }
    pair(function (s) {
      tyres(s * 3.6, -14.4, 4); tyres(s * 20.5, -13.2, 3);
      reel(s * 14.5, 8.5); reel(s * 4.2, 14.6);
      pallets(s * 26, -13, 3); pallets(s * 26, 13, 4);
      drums(s * 12, 3.2, 3);
    });

    /* Stripped car body, south lane. Cover you can crouch behind and shoot
       over standing, which is the most useful cover height there is. */
    function wreck(cx, cz, rot) {
      var o = { rotY: rot };
      /* M.carPaint is an ARRAY of six paint materials, not a material. Passing
         the array made `mat.map` truthy — Array.prototype.map is a function —
         so box() ran the texture UV pass on it and three.js would have read the
         array as a multi-material. Sixth instance of the mistake in section 6
         of the handoff: check the field exists AND what type it is. Caught by
         verify-map, which is what that gate is for. */
      box(cx, 0.55, cz, 4.0, 0.70, 1.75, M.carPaint[rot > 1 ? 3 : 0], o);
      box(cx - 0.2, 1.18, cz, 2.1, 0.60, 1.6, M.carGlass, { rotY: rot, cast: false });
      box(cx, 0.22, cz, 4.1, 0.16, 1.8, M.dark, { rotY: rot, cast: false, collide: false });
      cyl(cx - 1.3, 0.30, cz - 0.85, 0.30, 0.22, M.tire, NCAST);
      cyl(cx - 1.3, 0.30, cz + 0.85, 0.30, 0.22, M.tire, NCAST);
      cyl(cx + 1.3, 0.30, cz + 0.85, 0.30, 0.22, M.tire, NCAST);
    }
    pair(function (s) { wreck(s * 6.5, 10.5, s > 0 ? 0.22 : Math.PI - 0.22); });

    /* Site office. A closed cabin with a doorway and windows — the only fully
       enclosed volume on the map, which makes it the one place a fight can be
       decided by who enters first. Deliberately small and deliberately not
       climbable: a roof here would overlook the whole south lane. */
    function office(cx, cz, s) {
      var W = 5.2, D = 3.8, H = 2.9, hw = W / 2, hd = D / 2;
      seg(cx - hw, cx + hw, 0, H, cz - hd, cz - hd + 0.16, M.cream);
      seg(cx - hw, cx + hw, 0, H, cz + hd - 0.16, cz + hd, M.cream);
      seg(cx + s * (hw - 0.16), cx + s * hw, 0, H, cz - hd, cz + hd, M.cream);
      // doorway wall: two piers and a header, leaving a 1.2 m opening
      seg(cx - s * hw, cx - s * (hw - 0.16), 0, H, cz - hd, cz - 0.6, M.cream);
      seg(cx - s * hw, cx - s * (hw - 0.16), 0, H, cz + 0.6, cz + hd, M.cream);
      seg(cx - s * hw, cx - s * (hw - 0.16), 2.1, H, cz - 0.6, cz + 0.6, M.cream);
      seg(cx - hw, cx + hw, H, H + 0.18, cz - hd, cz + hd, M.roof, NCAST);
      // windows
      box(cx, 1.8, cz - hd + 0.06, W * 0.6, 0.9, 0.06, M.shopGlass, NBOTH);
      box(cx, 1.8, cz + hd - 0.06, W * 0.6, 0.9, 0.06, M.shopGlass, NBOTH);
      box(cx, 0.75, cz, 1.6, 0.06, 0.8, M.wood, NCAST);
    }
    pair(function (s) { office(s * 23.5, 0, s); });

    /* Loose scatter. Seeded from rnd(), which world.reset() reseeds, so this
       is identical on every build — the v7.8 rule. */
    for (var i = 0; i < 14; i++) {
      var px = (rnd() - 0.5) * 46, pz = (rnd() - 0.5) * 28;
      if (Math.abs(px) < 5 && Math.abs(pz) < 5) continue;
      box(px, 0.12, pz, 0.5 + rnd() * 0.5, 0.24, 0.4 + rnd() * 0.4, M.cargoWood, NCAST);
    }
    pair(function (s) {
      cyl(s * 27, 1.1, -15, 0.22, 2.2, M.metal, NCAST);
      cyl(s * 27, 1.1, 15, 0.22, 2.2, M.metal, NCAST);
    });
  };
})();
