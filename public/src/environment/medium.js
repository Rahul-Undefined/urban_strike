/* RIVERSIDE AND AIRFIELD — the medium tier. v10.21.
   Registers World._buildRiverside and World._buildAirfield.

   ~120 m across: long enough that a bolt-action has real work, short enough
   that the walk between fights is seconds. The roster had nothing between the
   70 m arenas and the 200 m theatres.

   Every mirrored X pair goes through segx() — v10.11 shipped three walls with
   x0 > x1 and negative width because seg() does not sort its arguments.
   NO STAIRS: verify-climb is still red on 21 flights elsewhere. Roofs are
   reached by crate chains of 0.31 m rises, inside the 0.42 m auto-step. */
(function () {
  if (typeof World === 'undefined') return;

  function kit(T) {
    var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, rnd = T.rnd;
    var NCAST = { cast: false }, NBOTH = { cast: false, collide: false };
    function segx(xa, xb, y0, y1, z0, z1, mat, o) {
      return seg(Math.min(xa, xb), Math.max(xa, xb), y0, y1, z0, z1, mat, o);
    }
    function boxx(cx, cy, cz, w, h, d, mat, o) {
      return box(cx, cy, cz, Math.abs(w), h, Math.abs(d), mat, o);
    }
    /* A shed with four walls, a doorway on one side and windows on another.
       The interior is what gives a medium map its close-quarters half. */
    function shed(cx, cz, w, d, h, mat, doorSide) {
      var hw = w / 2, hd = d / 2, TH = 0.24;
      // north and south
      if (doorSide !== 'n') segx(cx - hw, cx + hw, 0, h, cz - hd, cz - hd + TH, mat);
      else {
        segx(cx - hw, cx - 1.4, 0, h, cz - hd, cz - hd + TH, mat);
        segx(cx + 1.4, cx + hw, 0, h, cz - hd, cz - hd + TH, mat);
        segx(cx - 1.4, cx + 1.4, 2.3, h, cz - hd, cz - hd + TH, mat);
      }
      if (doorSide !== 's') segx(cx - hw, cx + hw, 0, h, cz + hd - TH, cz + hd, mat);
      else {
        segx(cx - hw, cx - 1.4, 0, h, cz + hd - TH, cz + hd, mat);
        segx(cx + 1.4, cx + hw, 0, h, cz + hd - TH, cz + hd, mat);
        segx(cx - 1.4, cx + 1.4, 2.3, h, cz + hd - TH, cz + hd, mat);
      }
      segx(cx - hw, cx - hw + TH, 0, h, cz - hd, cz + hd, mat);
      segx(cx + hw - TH, cx + hw, 0, h, cz - hd, cz + hd, mat);
      segx(cx - hw - 0.4, cx + hw + 0.4, h, h + 0.3, cz - hd - 0.4, cz + hd + 0.4, M.roof, NCAST);
      // windows you can shoot through, non-colliding
      [-hd * 0.45, hd * 0.45].forEach(function (wz) {
        boxx(cx - hw + 0.12, 1.7, cz + wz, 0.08, 1.0, 1.4, M.shopGlass, NBOTH);
        boxx(cx + hw - 0.12, 1.7, cz + wz, 0.08, 1.0, 1.4, M.shopGlass, NBOTH);
      });
      // a crate chain to the roof, on the outside
      boxx(cx + hw + 0.8, 0.155, cz, 1.3, 0.31, 1.3, M.palletBase);
      boxx(cx + hw + 0.1, 0.62, cz, 1.3, 1.24, 1.3, M.cargoWood);
      boxx(cx + hw + 0.1, 1.86, cz, 1.3, 1.24, 1.3, M.palletWood);
      if (h > 3.2) boxx(cx + hw + 0.1, 3.1, cz, 1.3, 1.24, 1.3, M.cargoWood);
    }
    function container(cx, cz, rot, mat, baseY) {
      var L = 6.06, W = 2.44, H = 2.60, B = baseY || 0, o = rot ? { rotY: rot } : undefined;
      boxx(cx, B + H / 2, cz, L, H, W, mat, o);
      boxx(cx, B + 1.9, cz, L * 0.72, 0.5, W + 0.02, M.rust, NBOTH);
    }
    function drums(cx, cz, n) {
      for (var d = 0; d < n; d++) {
        var dx = cx + (rnd() - 0.5) * 2.2, dz = cz + (rnd() - 0.5) * 2.2;
        cyl(dx, 0.44, dz, 0.30, 0.88, rnd() < 0.4 ? M.rust : (rnd() < 0.5 ? M.hazard : M.railGreen));
      }
    }
    function fence(HX, HZ, h, mat) {
      seg(-HX - 0.4, HX + 0.4, 0, h, -HZ - 0.4, -HZ, mat);
      seg(-HX - 0.4, HX + 0.4, 0, h, HZ, HZ + 0.4, mat);
      segx(-HX, -(HX + 0.4), 0, h, -HZ, HZ, mat);
      segx(HX, HX + 0.4, 0, h, -HZ, HZ, mat);
      for (var t = -HZ + 3; t <= HZ - 3; t += 4) {
        segx(-HX, -HX + 0.12, 0.2, h + 0.3, t - 0.08, t + 0.08, M.steelBlue, NBOTH);
        segx(HX - 0.12, HX, 0.2, h + 0.3, t - 0.08, t + 0.08, M.steelBlue, NBOTH);
      }
    }
    function scatter(n, rx, rz, keep) {
      for (var i = 0; i < n; i++) {
        var px = (rnd() - 0.5) * rx, pz = (rnd() - 0.5) * rz;
        var cw = 0.5 + rnd() * 0.6, cd = 0.4 + rnd() * 0.5, bad = false;
        for (var k = 0; k < keep.length; k++) {
          var r = keep[k];
          if (px + cw / 2 > r[0] && px - cw / 2 < r[1] && pz + cd / 2 > r[2] && pz - cd / 2 < r[3]) { bad = true; break; }
        }
        if (!bad) box(px, 0.13, pz, cw, 0.26, cd, M.cargoWood, NCAST);
      }
    }
    return { seg: seg, segx: segx, box: boxx, cyl: cyl, M: M, rnd: rnd,
             NCAST: NCAST, NBOTH: NBOTH, shed: shed, container: container,
             drums: drums, fence: fence, scatter: scatter };
  }

  /* ================= RIVERSIDE — 120 x 88 =================
     A canal down the middle with three crossings. The water is the long lane
     and the banks are buildings you fight inside, so the map asks one question
     over and over: cross here and now, or walk to a better crossing and give
     up the tempo. Every crossing is a decision with a cost, which is the thing
     a purely open medium map never manages to create. */
  World._buildRiverside = function (T) {
    var K = kit(T), M = K.M, HX = 60, HZ = 44;
    var BANK = 7;                       // canal half-width

    K.seg(-HX, HX, -0.40, 0, -HZ, HZ, M.dirt, K.NCAST);
    /* Banks as two slabs either side of the water rather than one slab with a
       hole — rural's grass carries the same note: a slab with a hole is a slab
       with z-fighting. */
    K.segx(-HX, -BANK, -0.005, 0.02, -HZ, HZ, M.asphalt, K.NCAST);
    K.segx(BANK, HX, -0.005, 0.02, -HZ, HZ, M.asphalt, K.NCAST);
    /* The canal: below grade, wadeable, and slow to cross. It is cover from
       fire across the map and a trap once someone is above you. */
    K.seg(-BANK, BANK, -1.30, -1.10, -HZ, HZ, M.dirt, K.NCAST);
    K.seg(-BANK, BANK, -0.55, -0.42, -HZ, HZ, M.glowPool, K.NBOTH);
    [-1, 1].forEach(function (s) {
      K.segx(s * BANK, s * (BANK + 0.5), -1.30, 0.10, -HZ, HZ, M.concrete);
      // quay railings, non-colliding, so the edge reads before you fall in
      for (var rz = -HZ + 2; rz < HZ; rz += 3) {
        K.cyl(s * (BANK + 0.9), 0.55, rz, 0.06, 1.10, M.hazard, K.NCAST);
      }
    });

    /* THREE CROSSINGS, deliberately unequal. */
    // north bridge — narrow, walled, the safe one
    K.box(0, 0.10, -26, 2 * BANK + 2, 0.20, 6, M.concrete);
    [-1, 1].forEach(function (s) {
      K.box(0, 0.75, -26 + s * 3.2, 2 * BANK + 2, 1.30, 0.4, M.concrete);
    });
    // centre ford — wide, open, fast, and visible from both banks
    K.box(0, -0.35, 0, 2 * BANK + 2, 0.55, 10, M.sidewalk);
    // south bridge — wide with container cover on the deck
    K.box(0, 0.10, 26, 2 * BANK + 2, 0.20, 7, M.concrete);
    K.container(-3, 26, 1.5708, M.contBlue);
    K.container(3.5, 26, 1.5708, M.contRed);

    /* Banks: warehouses and yards, mirrored in FORM but offset in POSITION so
       neither side is a copy of the other. */
    [-1, 1].forEach(function (s) {
      K.shed(s * 40, s * -24, 14, 11, 3.4, M.brick, s > 0 ? 'n' : 's');
      K.shed(s * 46, s * 8, 11, 13, 3.2, M.plaster, s > 0 ? 's' : 'n');
      K.shed(s * 26, s * -6, 10, 9, 3.0, M.cream, s > 0 ? 'n' : 's');
      K.container(s * 32, s * 20, 0, s > 0 ? M.contGreen : M.contGray);
      K.container(s * 32, s * 23, 0, M.contRed);
      K.container(s * 32, s * 21.5, 0, M.contBlue, 2.60);
      K.drums(s * 20, s * 30, 5);
      K.drums(s * 52, s * -34, 4);
      K.box(s * 14, 0.55, s * -34, 6, 1.10, 1.6, M.cargoWood);
      K.box(s * 18, 0.45, s * 12, 1.4, 0.90, 5.0, M.plaster);
      // lamp posts down the quay
      [-34, -16, 2, 20, 38].forEach(function (lz) {
        K.cyl(s * (BANK + 2.2), 2.6, lz, 0.11, 5.2, M.metal, K.NCAST);
        K.box(s * (BANK + 2.2), 5.0, lz, 0.5, 0.2, 0.9, M.lampGlow, K.NBOTH);
      });
    });

    K.fence(HX, HZ, 4.0, M.metal);
    K.scatter(18, 100, 74, [[-BANK - 2, BANK + 2, -HZ, HZ],
                            [-HX, -52, -40, 40], [52, HX, -40, 40]]);
  };

  /* ================= AIRFIELD — 128 x 96 =================
     An open apron ringed by hangars. The most deliberately lopsided map here:
     the apron is the longest clear line in the game outside Rural, and the
     hangar interiors are tighter than Killhouse. A sniper owns the middle and
     cannot hold it, because everything worth taking is indoors. */
  World._buildAirfield = function (T) {
    var K = kit(T), M = K.M, HX = 64, HZ = 48;

    K.seg(-HX, HX, -0.40, 0, -HZ, HZ, M.concrete, K.NCAST);
    /* Apron markings: a centreline, taxiway edges and bay numbers. This is the
       whole visual identity of the map — an open slab with no paint reads as
       nothing at all. */
    for (var cl = -HX + 4; cl < HX; cl += 8) {
      K.seg(cl, cl + 4.5, 0.004, 0.010, -0.35, 0.35, M.roadPaintY, K.NBOTH);
    }
    [-20, 20].forEach(function (tz) {
      K.seg(-HX + 6, HX - 6, 0.004, 0.010, tz - 0.2, tz + 0.2, M.roadPaint, K.NBOTH);
    });
    for (var bx = -48; bx <= 48; bx += 16) {
      [-1, 1].forEach(function (s) {
        K.seg(bx - 3, bx + 3, 0.004, 0.010, s * 26 - 0.25, s * 26 + 0.25, M.roadPaintY, K.NBOTH);
        K.seg(bx - 0.25, bx + 0.25, 0.004, 0.010, s * 26 - 3, s * 26 + 3, M.roadPaintY, K.NBOTH);
      });
    }

    /* Four hangars, two each side. Big doorways facing the apron, so a fight
       inside is always one step from a fight outside. */
    [-1, 1].forEach(function (s) {
      [-40, 40].forEach(function (hx2) {
        var cz = s * 32;
        K.shed(hx2, cz, 22, 16, 5.5, M.metal, s > 0 ? 'n' : 's');
        // roof ribs, non-colliding
        for (var r = -9; r <= 9; r += 3) {
          K.box(hx2 + r, 5.75, cz, 0.2, 0.16, 16.4, M.steelBlue, K.NBOTH);
        }
        K.drums(hx2 - 13, cz, 4);
      });
      // terminal block on the centre line of each side
      K.shed(0, s * 38, 16, 10, 4.0, M.cream, s > 0 ? 'n' : 's');
      // container stacks at the apron edge — the only cover in the open
      K.container(s * 28, -3, 1.5708, M.contBlue);
      K.container(s * 28, 3, 1.5708, M.contGreen);
      K.container(s * 28, 0, 1.5708, M.contGray, 2.60);
      K.box(s * 14, 0.55, s * 14, 5, 1.10, 2.2, M.cargoWood);
      K.box(s * 46, 0.45, 0, 1.4, 0.90, 8, M.plaster);
      // approach lights down the perimeter road
      [-40, -20, 0, 20, 40].forEach(function (lz) {
        K.cyl(s * (HX - 3), 2.4, lz, 0.10, 4.8, M.metal, K.NCAST);
        K.box(s * (HX - 3), 4.6, lz, 0.5, 0.2, 0.9, M.amberGlow, K.NBOTH);
      });
    });

    /* A wrecked airframe on the apron: the one silhouette that says airfield,
       and the only cover in the middle third. */
    K.box(0, 1.5, 0, 3.2, 3.0, 14, M.busRoof);
    K.box(0, 2.2, -3, 22, 0.5, 3.2, M.busRoof, K.NCAST);
    K.box(0, 1.6, 6.5, 2.6, 2.2, 4.0, M.metal, K.NCAST);
    K.cyl(0, 0.55, -4.5, 0.55, 1.10, M.tire, K.NCAST);

    K.fence(HX, HZ, 4.5, M.metal);
    K.scatter(20, 108, 80, [[-24, 24, -12, 12],
                            [-HX, -56, -44, 44], [56, HX, -44, 44]]);
  };
})();
