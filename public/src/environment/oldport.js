/* OLD PORT — v2.11. Registers World._buildOldPort.
   Rahul: "another Urban Small type map with a different world, a different
   name, different architecture, style and design; the core gameplay stays."

   160 x 160 m, eight players, the Urban Small weight class on a different
   continent: a whitewashed harbour town. Four blocks of plaster houses in
   cream, ochre, terracotta and dusty pink on a tight street grid, a piazza
   with a fountain at the centre, a belfry you cannot climb, a quay along the
   south edge with bollards, nets and crate stacks, and a long customs shed
   whose roof watches the whole waterfront. Lanes are 7 m, houses are hollow
   with a doorway and shuttered windows you can shoot through, and every roof
   is reached by a crate stair (0.40 m rises, inside the 0.42 m auto-step).

   Seeded layout: the grid and the house footprints are fixed by the numbers
   below; only the paint and the clutter use rnd(), and rnd() is the seeded
   one the builder hands in, so the server's colliders match the client's.

   NO STAIRS — same as every small map on the roster. Every mirrored x pair
   goes through segx(). */
(function () {
  if (typeof World === 'undefined') return;

  World._buildOldPort = function (T) {
    var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, rnd = T.rnd;
    var NCAST = { cast: false }, NBOTH = { cast: false, collide: false };
    function segx(xa, xb, y0, y1, z0, z1, mat, o) { return seg(Math.min(xa, xb), Math.max(xa, xb), y0, y1, z0, z1, mat, o); }
    function boxx(cx, cy, cz, w, h, d, mat, o) { return box(cx, cy, cz, Math.abs(w), h, Math.abs(d), mat, o); }
    var HX = 80, HZ = 80, TH = 0.26;
    var PAINT = [M.cream, M.plaster, M.ochre, M.terracotta, M.dustyPink, M.paleYellow, M.cream, M.plaster];
    function paint() { return PAINT[Math.floor(rnd() * PAINT.length)]; }

    /* ---------- ground, quay, perimeter ---------- */
    seg(-HX, HX, -0.40, 0, -HZ, HZ, M.dirt, NCAST);
    seg(-HX, HX, -0.005, 0.02, -HZ, 52, M.sidewalk, NCAST);                 // the town: flagstones
    seg(-HX, HX, -0.005, 0.03, 52, HZ, M.concrete, NCAST);                  // the quay: poured concrete
    seg(-HX, HX, 0.03, 0.06, 55.5, 56.5, M.roadPaintY, NBOTH);              // quay edge line
    // the sea wall: a low parapet at the water line, a taller wall behind it on three sides
    seg(-HX, HX, 0, 1.1, HZ - 1.2, HZ, M.concrete);
    seg(-HX, HX, 0, 7, -HZ, -HZ + 0.6, M.plaster);
    segx(-HX, -HX + 0.6, 0, 7, -HZ, HZ, M.plaster);
    segx(HX - 0.6, HX, 0, 7, -HZ, HZ, M.plaster);
    for (var pz = -HZ + 10; pz < HZ - 4; pz += 14) {                        // buttresses on the long walls
      segx(-HX + 0.6, -HX + 1.4, 0, 5, pz - 0.5, pz + 0.5, M.ochre, NCAST);
      segx(HX - 1.4, HX - 0.6, 0, 5, pz - 0.5, pz + 0.5, M.ochre, NCAST);
    }

    /* ---------- a house: hollow shell, doorway, shutters, crate chain ---------- */
    function house(cx, cz, w, d, h, door, mat) {
      var hw = w / 2, hd = d / 2;
      mat = mat || paint();
      function wall(side) {
        if (side === 'n') {
          if (door === 'n') { segx(cx - hw, cx - 1.1, 0, h, cz - hd, cz - hd + TH, mat); segx(cx + 1.1, cx + hw, 0, h, cz - hd, cz - hd + TH, mat); segx(cx - 1.1, cx + 1.1, 2.3, h, cz - hd, cz - hd + TH, mat); }
          else segx(cx - hw, cx + hw, 0, h, cz - hd, cz - hd + TH, mat);
        } else if (side === 's') {
          if (door === 's') { segx(cx - hw, cx - 1.1, 0, h, cz + hd - TH, cz + hd, mat); segx(cx + 1.1, cx + hw, 0, h, cz + hd - TH, cz + hd, mat); segx(cx - 1.1, cx + 1.1, 2.3, h, cz + hd - TH, cz + hd, mat); }
          else segx(cx - hw, cx + hw, 0, h, cz + hd - TH, cz + hd, mat);
        } else if (side === 'w') {
          if (door === 'w') { seg(cx - hw, cx - hw + TH, 0, h, cz - hd, cz - 1.1, mat); seg(cx - hw, cx - hw + TH, 0, h, cz + 1.1, cz + hd, mat); seg(cx - hw, cx - hw + TH, 2.3, h, cz - 1.1, cz + 1.1, mat); }
          else seg(cx - hw, cx - hw + TH, 0, h, cz - hd, cz + hd, mat);
        } else {
          if (door === 'e') { seg(cx + hw - TH, cx + hw, 0, h, cz - hd, cz - 1.1, mat); seg(cx + hw - TH, cx + hw, 0, h, cz + 1.1, cz + hd, mat); seg(cx + hw - TH, cx + hw, 2.3, h, cz - 1.1, cz + 1.1, mat); }
          else seg(cx + hw - TH, cx + hw, 0, h, cz - hd, cz + hd, mat);
        }
      }
      wall('n'); wall('s'); wall('w'); wall('e');
      // terracotta roof slab with a lip
      seg(cx - hw - 0.3, cx + hw + 0.3, h, h + 0.28, cz - hd - 0.3, cz + hd + 0.3, M.terracotta, NCAST);
      seg(cx - hw - 0.3, cx + hw + 0.3, h + 0.28, h + 0.7, cz - hd - 0.3, cz - hd, M.terracotta, NCAST);
      // shutters and window slots you can shoot through (non-colliding paint)
      var wy = Math.min(h - 1.2, 2.2);
      [-0.3, 0.3].forEach(function (f) {
        boxx(cx + f * w, wy, cz - hd + 0.06, 1.1, 1.2, 0.06, M.shopGlass, NBOTH);
        boxx(cx + f * w, wy, cz + hd - 0.06, 1.1, 1.2, 0.06, M.shopGlass, NBOTH);
        boxx(cx + f * w - 0.75, wy, cz - hd + 0.05, 0.3, 1.3, 0.04, M.sage, NBOTH);
        boxx(cx + f * w + 0.75, wy, cz - hd + 0.05, 0.3, 1.3, 0.04, M.sage, NBOTH);
      });
      // the crate stair up the east face: 0.40 rises (inside the 0.42 auto-step),
      // solid columns, running north along the wall and wrapping to a second
      // column beside the first when the wall runs out
      var RISE = 0.40, PITCH = 0.56, perCol = Math.max(3, Math.floor((d - 1) / PITCH));
      var n = Math.ceil((h + 0.28) / RISE), i;
      for (i = 0; i < n; i++) {
        var top = Math.min(RISE * (i + 1), h + 0.28), col = Math.floor(i / perCol), k = i % perCol;
        var zz = col % 2 === 0 ? cz + hd - 0.5 - k * PITCH : cz - hd + 0.5 + k * PITCH;
        boxx(cx + hw + 0.9 + col * 1.25, top / 2, zz, 1.2, top, 0.55, i % 2 ? M.cargoWood : M.palletWood);
      }
    }

    /* ---------- the blocks ---------- */
    // four blocks around the piazza; streets at x = +-10 (the main crossing) and the lanes between houses
    var blocks = [
      // [cx, cz] of block, then houses [dx, dz, w, d, h, door]
      { x: -42, z: -42, hs: [[-10, -10, 12, 10, 5.2, 'e'], [8, -12, 11, 9, 4.6, 'w'], [-9, 8, 10, 11, 6.2, 'n'], [9, 9, 12, 10, 4.3, 'n']] },
      { x: 42, z: -42, hs: [[-10, -10, 11, 11, 4.9, 'e'], [9, -11, 12, 9, 5.8, 's'], [-10, 9, 12, 10, 4.2, 'n'], [9, 9, 10, 11, 6.5, 'w']] },
      { x: -42, z: 20, hs: [[-10, -11, 12, 10, 4.5, 's'], [9, -10, 10, 11, 5.6, 'w'], [-9, 10, 11, 9, 6.0, 'e'], [9, 10, 12, 10, 4.0, 'n']] },
      { x: 42, z: 20, hs: [[-9, -11, 10, 10, 5.4, 'e'], [9, -10, 12, 11, 4.4, 'n'], [-10, 10, 12, 10, 4.8, 'e'], [9, 10, 11, 9, 6.3, 's']] }
    ];
    blocks.forEach(function (b) {
      b.hs.forEach(function (h) { house(b.x + h[0], b.z + h[1], h[2], h[3], h[4], h[5]); });
      // a low garden wall and a tree in the block's middle gap
      segx(b.x - 3, b.x + 3, 0, 1.0, b.z - 0.4, b.z + 0.4, M.plaster);
      cyl(b.x, 1.8, b.z + 3.5, 0.22, 3.6, M.dirt, NCAST);
      cyl(b.x, 4.4, b.z + 3.5, 2.2, 2.6, M.foliage, NBOTH);
    });

    // the north row: a terrace of five narrow houses facing the top street
    for (var tx = -56; tx <= 56; tx += 28) house(tx, -66, 11, 9, 4.6 + (tx % 56 === 0 ? 1.4 : 0), 's');
    // the belfry: a solid tower on the piazza's north edge, too tall to climb, a landmark from anywhere
    boxx(0, 7, -14, 5, 14, 5, M.ochre); boxx(0, 14.6, -14, 5.8, 1.2, 5.8, M.terracotta, NCAST);
    boxx(0, 11.8, -11.6, 1.4, 1.8, 0.1, M.dark, NBOTH); boxx(0, 11.8, -16.4, 1.4, 1.8, 0.1, M.dark, NBOTH);

    /* ---------- the piazza ---------- */
    seg(-16, 16, 0.02, 0.05, -4, 16, M.sidewalk, NBOTH);                    // a lighter paving inset (paint, no step)
    cyl(0, 0.35, 6, 3.2, 0.7, M.concrete);                                  // fountain basin — low cover in the open
    cyl(0, 1.3, 6, 0.5, 1.6, M.concrete, NCAST); cyl(0, 2.2, 6, 1.1, 0.2, M.concrete, NCAST);
    seg(-3.0, 3.0, 0.7, 0.72, 2.9, 9.1, M.glowPool, NBOTH);
    [[-11, 2], [11, 2], [-11, 12], [11, 12]].forEach(function (p) {          // benches
      boxx(p[0], 0.25, p[1], 2.2, 0.5, 0.6, M.sage); boxx(p[0], 0.7, p[1] - 0.25, 2.2, 0.4, 0.1, M.sage, NBOTH);
    });
    // market stalls along the piazza's south side: a counter you can crouch behind, an awning you can see under
    for (var mx = -12; mx <= 12; mx += 8) {
      boxx(mx, 0.5, 19, 3.6, 1.0, 1.1, M.cargoWood);
      cyl(mx - 1.6, 1.3, 18.4, 0.05, 2.6, M.metal, NBOTH); cyl(mx + 1.6, 1.3, 18.4, 0.05, 2.6, M.metal, NBOTH);
      boxx(mx, 2.65, 19.2, 4.0, 0.08, 2.2, mx % 16 === 0 ? M.maroon : M.sage, NBOTH);
    }

    /* ---------- the quay ---------- */
    // the customs shed: long, low, a doorway each end, its roof the best seat on the waterfront
    house(0, 44, 30, 8, 4.0, 'w', M.plaster);
    seg(-14.7, 14.7, 0, 4.0, 40.2, 40.5, M.plaster);   // a second doorway cut is not needed; the east chain climbs it
    // bollards along the water
    for (var bx = -70; bx <= 70; bx += 10) { cyl(bx, 0.45, 76.5, 0.28, 0.9, M.metal); }
    // crate stacks and nets: cover on the open concrete
    [[-58, 60], [-30, 66], [-6, 62], [22, 68], [46, 60], [66, 66]].forEach(function (p, i) {
      boxx(p[0], 0.62, p[1], 2.4, 1.24, 2.4, i % 2 ? M.cargoWood : M.palletWood);
      if (i % 3 === 0) boxx(p[0] + 1.3, 0.62, p[1] + 2.6, 2.4, 1.24, 2.4, M.cargoWood);
      if (i % 3 === 1) boxx(p[0], 1.86, p[1], 2.4, 1.24, 2.4, M.palletWood);
      cyl(p[0] - 2.8, 0.44, p[1] - 1.2, 0.30, 0.88, i % 2 ? M.rust : M.railGreen);
    });
    // a moored barge hull against the sea wall, climbable from the quay by two crates
    boxx(40, 1.1, 73.5, 22, 2.2, 5.2, M.steelBlue);
    boxx(40, 2.35, 73.5, 20, 0.3, 4.6, M.dark, NCAST);
    boxx(28.5, 0.155, 70.4, 1.3, 0.31, 1.3, M.palletBase); boxx(28.5, 0.62, 69.0, 1.3, 1.24, 1.3, M.cargoWood); boxx(28.5, 1.86, 70.4, 1.3, 1.24, 1.3, M.palletWood);
    // a fish market canopy on the west quay
    for (var cx2 = -66; cx2 <= -42; cx2 += 8) { cyl(cx2, 1.6, 58, 0.08, 3.2, M.metal, NBOTH); cyl(cx2, 1.6, 66, 0.08, 3.2, M.metal, NBOTH); }
    boxx(-54, 3.25, 62, 28, 0.1, 9, M.maroon, NBOTH);
    boxx(-54, 0.5, 62, 20, 1.0, 1.0, M.concrete);                           // the long counter under it

    /* ---------- streets: lamps, planters, a parked van ---------- */
    [[-20, -20], [20, -20], [-20, 36], [20, 36], [-62, 0], [62, 0], [0, 56], [-62, -56], [62, -56]].forEach(function (p) {
      cyl(p[0], 2.2, p[1], 0.07, 4.4, M.metal, NCAST); boxx(p[0], 4.5, p[1], 0.5, 0.3, 0.5, M.lampGlow, NBOTH);
    });
    [[-24, 0], [24, 0], [-24, 48], [24, 48]].forEach(function (p) {
      boxx(p[0], 0.4, p[1], 1.6, 0.8, 1.6, M.terracotta); cyl(p[0], 1.3, p[1], 0.9, 1.0, M.foliage, NBOTH);
    });
    boxx(-30, 1.1, -58, 4.4, 2.2, 2.0, M.vanBody); boxx(-30, 1.7, -58, 3.0, 0.8, 2.04, M.carGlass, NBOTH);
    // hazard tape on the sea wall corners, the one thing on this map that is not sun-bleached
    seg(-HX, -HX + 6, 1.1, 1.25, HZ - 1.2, HZ, M.hazard, NBOTH); seg(HX - 6, HX, 1.1, 1.25, HZ - 1.2, HZ, M.hazard, NBOTH);
  };
})();
