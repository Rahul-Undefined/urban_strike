/* FREIGHTYARD, BAZAAR AND SUBSTATION. v10.14.
   Three small maps, each a shape the roster did not have. See the header of
   maps-small.config.js for why these three and not three more warehouses.

   EVERY MIRRORED X PAIR GOES THROUGH segx(). v10.11 shipped three walls with
   x0 > x1 and negative width because seg() does not sort its arguments and the
   mirror sign is -1 on one side. That is now a rule and a gate. */
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
    /* A shipping container with corner castings, a rust band and an optional
       crate step to its roof. Lifted from killhouse.js, which proved the
       shape; kept local so a change here cannot reach that map. */
    function container(cx, cz, rot, mat, steps, baseY) {
      var L = 6.06, W = 2.44, H = 2.60, B = baseY || 0;
      var o = rot ? { rotY: rot } : undefined;
      boxx(cx, B + H / 2, cz, L, H, W, mat, o);
      boxx(cx, B + 1.9, cz, L * 0.72, 0.5, W + 0.02, M.rust, NBOTH);
      var hx = L / 2 - 0.16, hz = W / 2 - 0.16, c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (q) {
        var px = cx + q[0] * hx * c - q[1] * hz * sn, pz = cz + q[0] * hx * sn + q[1] * hz * c;
        boxx(px, B + H - 0.08, pz, 0.3, 0.16, 0.3, M.dark, NBOTH);
        boxx(px, B + 0.08, pz, 0.3, 0.16, 0.3, M.dark, NBOTH);
      });
      if (steps) {
        var sx = cx + (L / 2 - 0.35) * c, sz = cz + (L / 2 - 0.35) * sn;
        boxx(sx, 0.155, sz, 1.2, 0.31, 1.2, M.palletBase);
        boxx(sx, 0.62, sz, 1.2, 0.62, 1.2, M.cargoWood);
        boxx(sx, 1.245, sz, 1.2, 0.63, 1.2, M.palletWood);
        boxx(sx, 1.87, sz, 1.2, 0.62, 1.2, M.cargoWood);
      }
    }
    function pallets(cx, cz, n) {
      boxx(cx, n * 0.16, cz, 1.2, n * 0.32, 1.0, M.palletBase);
      for (var L2 = 0; L2 < n; L2++) for (var sl = -2; sl <= 2; sl++) {
        boxx(cx + sl * 0.26, L2 * 0.32 + 0.28, cz, 0.16, 0.05, 1.02, M.palletWood, NBOTH);
      }
    }
    function drums(cx, cz, n) {
      for (var d = 0; d < n; d++) {
        var dx = cx + (rnd() - 0.5) * 1.9, dz = cz + (rnd() - 0.5) * 1.9;
        var mm = rnd() < 0.4 ? M.rust : (rnd() < 0.5 ? M.hazard : M.railGreen);
        cyl(dx, 0.44, dz, 0.30, 0.88, mm);
        cyl(dx, 0.62, dz, 0.315, 0.06, M.dark, NBOTH);
      }
    }
    /* A perimeter that is geometry, not a rule. verify-collision asserts zero
       escapes on every small map. */
    function fence(HX, HZ, h, mat) {
      seg(-HX - 0.4, HX + 0.4, 0, h, -HZ - 0.4, -HZ, mat);
      seg(-HX - 0.4, HX + 0.4, 0, h, HZ, HZ + 0.4, mat);
      segx(-HX, -(HX + 0.4), 0, h, -HZ, HZ, mat);
      segx(HX, HX + 0.4, 0, h, -HZ, HZ, mat);
    }
    /* Scatter that keeps out of doorways and spawns. killhouse learned this
       the hard way in v10.11: a 0.24 m crate in a doorway left a 0.69 m gap
       against a 0.70 m player. Tested against the FULL footprint, never the
       centre. */
    function scatter(n, rx, rz, keep) {
      for (var i = 0; i < n; i++) {
        var px = (rnd() - 0.5) * rx, pz = (rnd() - 0.5) * rz;
        var cw = 0.5 + rnd() * 0.55, cd = 0.4 + rnd() * 0.45, blocked = false;
        for (var k = 0; k < keep.length; k++) {
          var r = keep[k];
          if (px + cw / 2 > r[0] && px - cw / 2 < r[1] &&
              pz + cd / 2 > r[2] && pz - cd / 2 < r[3]) { blocked = true; break; }
        }
        if (!blocked) box(px, 0.13, pz, cw, 0.26, cd, M.cargoWood, NCAST);
      }
    }
    return { seg: seg, segx: segx, box: boxx, cyl: cyl, M: M, rnd: rnd,
             NCAST: NCAST, NBOTH: NBOTH, container: container, pallets: pallets,
             drums: drums, fence: fence, scatter: scatter };
  }

  /* ================= FREIGHTYARD =================
     38 x 38 m, FOUR-WAY ROTATIONAL. Not mirrored: the whole map is one quarter
     turned four times, so there is no front, no back and no "your end". You
     can be shot from any compass point at any moment, which is the entire
     appeal and the reason it is the smallest map in the game. */
  World._buildFreightyard = function (T) {
    var K = kit(T), M = K.M, HX = 19, HZ = 19;
    /* quad() emits at 0, 90, 180 and 270 degrees. Rotational symmetry is
       structural here for the same reason killhouse's mirror is: an edit that
       only remembers one quarter cannot drift the map out of balance. */
    function quad(f) {
      for (var i = 0; i < 4; i++) {
        var a = i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
        f(function (x, z) { return [x * c - z * s, x * s + z * c]; }, a, i);
      }
    }
    K.seg(-HX, HX, -0.40, 0, -HZ, HZ, M.asphalt, K.NCAST);
    K.seg(-6, 6, -0.005, 0.008, -HZ, HZ, M.concrete, K.NBOTH);
    K.seg(-HX, HX, -0.005, 0.008, -6, 6, M.concrete, K.NBOTH);
    K.fence(HX, HZ, 4.2, M.metal);

    var PAINT = [M.contBlue, M.contRed, M.contGreen, M.contGray];
    quad(function (R, a, i) {
      var p = R(14, 0);   K.container(p[0], p[1], a, PAINT[i], true);
      var q = R(9, 9);    K.container(q[0], q[1], a + Math.PI / 2, PAINT[(i + 1) % 4], false);
      var r = R(16.5, 8); K.container(r[0], r[1], a, M.contGray, false, 2.60);
      var s2 = R(6.5, 15); K.pallets(s2[0], s2[1], 4);
      var t = R(17, 15);  K.drums(t[0], t[1], 3);
    });
    /* The centre stack. On a map with no ends, the only fixed reference point
       is the middle, so it is the one piece of terrain worth naming. */
    K.box(0, 0.60, 0, 3.4, 1.20, 3.4, M.cargoWood);
    K.box(0, 1.60, 0, 2.4, 0.80, 2.4, M.palletWood);
    K.box(0, 2.35, 0, 1.6, 0.70, 1.6, M.contGray);
    quad(function (R) {
      var p = R(2.6, 0);
      K.box(p[0], 0.155, p[1], 1.5, 0.31, 1.5, M.palletBase);
      K.box(p[0], 0.62, p[1], 1.4, 0.62, 1.4, M.cargoWood);
    });
    quad(function (R) {
      var p = R(18, 0);
      K.cyl(p[0], 2.6, p[1], 0.14, 5.2, M.metal, K.NCAST);
      K.box(p[0], 5.0, p[1], 0.5, 0.2, 0.9, M.amberGlow, K.NBOTH);
    });
    /* v10.14 density. First build measured 74 colliders, 19 draws, 4,144 tris
       against budgets of 45 and 26,000 — a container yard that read as five
       boxes. Everything below reuses materials already emitted, so the merge
       pass folds it into batches already paid for; triangles were the cheap
       axis and 22,000 were spare. */
    quad(function (R, a, i) {
      var p = R(11.5, 5.5);  K.container(p[0], p[1], a + 0.22, PAINT[(i + 2) % 4], false);
      var q = R(3.5, 17);    K.pallets(q[0], q[1], 5);
      var r = R(13, 13);     K.drums(r[0], r[1], 4);
      // tyre stacks and a cable reel: the classic yard silhouette
      var t = R(7.5, 7.5);
      for (var k = 0; k < 4; k++) K.cyl(t[0], 0.13 + k * 0.24, t[1], 0.52, 0.24, M.tire, k ? K.NCAST : undefined);
      var u = R(18, 3);
      K.cyl(u[0], 0.62, u[1], 0.62, 0.14, M.palletWood);
      K.cyl(u[0], 0.62, u[1], 0.44, 0.62, M.dark, K.NBOTH);
      // painted bay numbers on the deck
      var v = R(0, 12);
      K.seg(v[0] - 1.2, v[0] + 1.2, 0.009, 0.014, v[1] - 0.18, v[1] + 0.18, M.roadPaintY, K.NBOTH);
    });
    // gantry rail over the centre, non-colliding: height the eye needs
    K.seg(-14, 14, 5.4, 5.7, -0.3, 0.3, M.steelBlue, K.NBOTH);
    K.seg(-0.3, 0.3, 5.4, 5.7, -14, 14, M.steelBlue, K.NBOTH);
    K.scatter(14, 32, 32, [[-5, 5, -5, 5], [-19, -12, -19, -12], [12, 19, 12, 19],
                           [-19, -12, 12, 19], [12, 19, -19, -12]]);
  };

  /* ================= BAZAAR =================
     54 x 40 m. NO STRAIGHT LINES. Stalls and screens stagger the alleys so
     almost every fight starts inside 12 m around a corner — the opposite of a
     sightline map, and the shape neither existing small map has. */
  World._buildBazaar = function (T) {
    var K = kit(T), M = K.M, HX = 27, HZ = 20;
    function pair(f) { f(1); f(-1); }
    K.seg(-HX, HX, -0.40, 0, -HZ, HZ, M.dirt, K.NCAST);
    K.seg(-HX, HX, -0.005, 0.008, -7, 7, M.sidewalk, K.NBOTH);
    K.fence(HX, HZ, 5.0, M.plaster);

    /* A stall: counter, four posts, a fabric awning. The awning is the reason
       this map reads as a market rather than a maze — non-colliding, so it
       breaks sight from above without becoming cover. */
    function stall(cx, cz, rot, cloth) {
      var o = { rotY: rot };
      K.box(cx, 0.48, cz, 2.6, 0.96, 1.1, M.wood, o);
      K.box(cx, 1.00, cz, 2.4, 0.12, 0.95, M.cargoWood, { rotY: rot, cast: false });
      [-1.1, 1.1].forEach(function (u) {
        [-0.5, 0.5].forEach(function (v) {
          K.box(cx + u, 1.25, cz + v, 0.09, 2.5, 0.09, M.wood, K.NCAST);
        });
      });
      K.box(cx, 2.55, cz, 3.0, 0.10, 2.0, cloth, K.NBOTH);
      K.box(cx, 2.32, cz - 1.0, 3.0, 0.42, 0.08, cloth, K.NBOTH);
      // goods on the counter
      K.box(cx - 0.7, 1.16, cz, 0.5, 0.20, 0.5, M.ochre, K.NBOTH);
      K.box(cx + 0.7, 1.18, cz, 0.45, 0.24, 0.45, M.maroon, K.NBOTH);
    }
    var CLOTH = [M.dustyPink, M.mint, M.terracotta, M.paleYellow, M.sage];
    /* Screens: short staggered walls that make the alleys wind. Placed off the
       grid on purpose — a symmetric maze reads as a corridor. */
    pair(function (s) {
      K.segx(s * 4, s * 12, 0, 2.6, -8.2, -7.9, M.plaster);
      K.segx(s * 9, s * 17, 0, 2.6, 7.9, 8.2, M.plaster);
      K.segx(s * 16.9, s * 17.2, 0, 2.6, -16, -8, M.plaster);
      K.segx(s * 11.9, s * 12.2, 0, 2.6, 8, 16, M.plaster);
      K.segx(s * 21, s * 27, 0, 2.6, -0.15, 0.15, M.plaster);
      stall(s * 8, -12, 0.12 * s, CLOTH[0]);
      stall(s * 15, -4, 1.5708, CLOTH[1]);
      stall(s * 15, 4, 1.5708, CLOTH[2]);
      stall(s * 8, 12, -0.12 * s, CLOTH[3]);
      stall(s * 22, -11, 0, CLOTH[4]);
      stall(s * 22, 11, 0, CLOTH[1]);
      K.pallets(s * 19, -17, 3);
      K.pallets(s * 19, 17, 4);
      K.drums(s * 5, -17, 3);
      K.cyl(s * 24, 2.4, 0, 0.16, 4.8, M.wood, K.NCAST);
    });
    /* The well at the centre: the one open square on the map, and the only
       place a long shot exists. */
    K.cyl(0, 0.55, 0, 1.8, 1.10, M.brick);
    K.cyl(0, 1.14, 0, 1.9, 0.10, M.trim, K.NCAST);
    [-1.6, 1.6].forEach(function (u) {
      K.box(u, 1.9, 0, 0.14, 1.6, 0.14, M.wood, K.NCAST);
    });
    K.box(0, 2.75, 0, 3.6, 0.14, 1.2, M.roof, K.NCAST);
    /* v10.14 density. Rugs, hanging lanterns, crates and roof-level cloth
       runs. The cloth spans between screens are what sell an alley as covered
       without closing it — non-colliding, so they change the light and not the
       fight. */
    pair(function (s2) {
      [-14, -5, 5, 14].forEach(function (rz) {
        K.seg(s2 * 3, s2 * 11, 0.008, 0.013, rz - 1.1, rz + 1.1,
              rz > 0 ? M.maroon : M.ochre, K.NBOTH);
      });
      [-16, -6, 6, 16].forEach(function (lz) {
        K.cyl(s2 * 13, 3.1, lz, 0.05, 0.9, M.dark, K.NBOTH);
        K.box(s2 * 13, 2.5, lz, 0.28, 0.34, 0.28, M.amberGlow, K.NBOTH);
      });
      K.box(s2 * 20, 0.42, -4, 1.1, 0.84, 1.1, M.cargoWood);
      K.box(s2 * 20, 0.42, 4, 1.1, 0.84, 1.1, M.cargoWood);
      K.box(s2 * 6, 0.34, -18, 1.5, 0.68, 0.9, M.wood);
      K.box(s2 * 6, 0.34, 18, 1.5, 0.68, 0.9, M.wood);
      // cloth strung between the screens, at roof height
      K.seg(s2 * 4, s2 * 17, 4.2, 4.3, -1.2, 1.2, s2 > 0 ? M.dustyPink : M.mint, K.NBOTH);
      K.seg(s2 * 6, s2 * 15, 4.4, 4.5, -13.2, -10.8, M.paleYellow, K.NBOTH);
      K.seg(s2 * 6, s2 * 15, 4.4, 4.5, 10.8, 13.2, M.sage, K.NBOTH);
    });
    K.scatter(16, 46, 32, [[-5, 5, -5, 5], [-27, -22, -14, 14], [22, 27, -14, 14]]);
  };

  /* ================= SUBSTATION =================
     46 x 46 m RING around a sunken pit. The middle is visible but not
     walkable, so every rotation is a real commitment — you cannot cut the
     corner, and changing your mind costs the long way round. No other map on
     the roster asks that question. */
  World._buildSubstation = function (T) {
    var K = kit(T), M = K.M, HX = 23, HZ = 23, PIT = 7.5;
    function quad(f) {
      for (var i = 0; i < 4; i++) {
        var a = i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
        f(function (x, z) { return [x * c - z * s, x * s + z * c]; }, a, i);
      }
    }
    /* Floor is emitted as four slabs around the hole rather than one slab with
       a hole in it — rural's grass carries the same note: a slab with a hole
       is a slab with z-fighting. */
    K.seg(-HX, HX, -0.40, 0, -HZ, -PIT, M.concrete, K.NCAST);
    K.seg(-HX, HX, -0.40, 0, PIT, HZ, M.concrete, K.NCAST);
    K.seg(-HX, -PIT, -0.40, 0, -PIT, PIT, M.concrete, K.NCAST);
    K.seg(PIT, HX, -0.40, 0, -PIT, PIT, M.concrete, K.NCAST);
    // the pit floor, well below, and its walls
    K.seg(-PIT, PIT, -3.20, -3.0, -PIT, PIT, M.dark, K.NCAST);
    /* v10.14: these two were named `a` and `b`. `b` is on verify-undeclared's
       watch list — it is a name that has previously leaked across IIFEs in
       this codebase — and a local that shadows a watched global is exactly as
       hard to read as the leak the watch exists to catch. Named for what they
       are instead. */
    quad(function (R) {
      var edgeL = R(-PIT, -PIT), edgeR = R(PIT, -PIT);
      var zEdge = Math.min(edgeL[1], edgeR[1]);
      K.segx(edgeL[0], edgeR[0], -3.0, 0.10, zEdge - 0.18, zEdge + 0.02, M.steelBlue);
    });
    // railing so the edge reads before you walk off it
    quad(function (R) {
      for (var u = -PIT + 1; u <= PIT - 1; u += 2.2) {
        var p = R(u, -PIT - 0.5);
        K.cyl(p[0], 0.55, p[1], 0.06, 1.10, M.hazard, K.NCAST);
      }
    });
    K.fence(HX, HZ, 5.5, M.metal);

    /* Transformers, cable drums and switchgear on the ring. Each quarter gets
       the same furniture turned 90 degrees, so no direction of rotation is
       easier than another. */
    quad(function (R, a, i) {
      var p = R(0, -15);
      K.box(p[0], 1.15, p[1], 3.4, 2.30, 2.4, M.steelBlue, { rotY: a });
      K.box(p[0], 2.42, p[1], 3.8, 0.24, 2.8, M.dark, { rotY: a, cast: false });
      var q = R(-14, -14);
      K.box(q[0], 0.85, q[1], 2.2, 1.70, 2.2, M.metal, { rotY: a });
      var r = R(10.5, -18.5);
      K.pallets(r[0], r[1], 4);
      var s2 = R(18.5, -10);
      K.drums(s2[0], s2[1], 4);
      var t = R(-19, 6);
      K.container(t[0], t[1], a + Math.PI / 2, i % 2 ? M.contGreen : M.contBlue, true);
      // pylons: tall, non-colliding, the vertical the eye needs
      var u2 = R(21, 21);
      K.cyl(u2[0], 3.6, u2[1], 0.18, 7.2, M.metal, K.NCAST);
      K.box(u2[0], 6.6, u2[1], 2.4, 0.14, 0.14, M.metal, K.NBOTH);
    });
    /* v10.14 density. Cable trays, insulators, warning boards and a catwalk
       ring over the pit. The catwalk is non-colliding on purpose — this map is
       flat by design and a walkable ring over the hole would remove the
       commitment that the pit exists to create. */
    quad(function (R, a, i) {
      var p = R(-8, -18);  K.box(p[0], 0.55, p[1], 2.6, 1.10, 1.0, M.railGreen, { rotY: a });
      var q = R(8, -18);   K.drums(q[0], q[1], 3);
      var r = R(-18, -8);  K.pallets(r[0], r[1], 3);
      // insulator stacks on the transformers
      var t = R(0, -15);
      [-1.0, 0, 1.0].forEach(function (u) {
        K.cyl(t[0] + u * Math.cos(a), 2.9, t[1] + u * Math.sin(a), 0.16, 0.9, M.paperWhite, K.NCAST);
      });
      // cable tray running the ring at waist height, non-colliding
      var c1 = R(-PIT - 2.4, -PIT - 2.4), c2 = R(PIT + 2.4, -PIT - 2.4);
      K.box((c1[0] + c2[0]) / 2, 1.05, (c1[1] + c2[1]) / 2,
            Math.abs(c2[0] - c1[0]) || 0.3, 0.14, Math.abs(c2[1] - c1[1]) || 0.3,
            M.trim, K.NBOTH);
      // catwalk ring over the pit
      var w1 = R(-PIT, -PIT + 1.2), w2 = R(PIT, -PIT + 1.2);
      K.box((w1[0] + w2[0]) / 2, 3.6, (w1[1] + w2[1]) / 2,
            Math.abs(w2[0] - w1[0]) || 0.9, 0.12, Math.abs(w2[1] - w1[1]) || 0.9,
            M.steelBlue, K.NBOTH);
      // hazard board
      var b = R(-14, -20.5);
      K.box(b[0], 1.5, b[1], 1.2, 0.9, 0.08, M.hazard, K.NCAST);
    });
    K.scatter(14, 40, 40,
      [[-9, 9, -9, 9], [-23, -18, -6, 6], [18, 23, -6, 6],
       [-6, 6, -23, -18], [-6, 6, 18, 23]]);
  };
})();
