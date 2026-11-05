/* KASBAH — v2.8. Registers World._buildKasbah, same contract as every builder.

   Rahul: "remove these maps ... instead add another 'urban small' type map with
   a different world and name it something different, with good architecture,
   style and design; core gameplay remains the same."

   THE WORLD. A walled sandstone old town, 200 x 200 m inside a 12 m rampart.
   Whitewash, ochre, rose and sand facades; blue doors and shutters; terracotta
   cornices; flat roof terraces with parapets, reached by masonry stairs that
   climb the outside of the houses (the way they do in every real medina).
   Nothing here looks like Urban: no asphalt, no glass towers, no containers.

   THE PLAN (north is -z):

        +--------------------- N gate ---------------------+
        |  MEDINA (NW)        | N avenue |   CITADEL (NE)    |
        |  tall houses,       |          |   3 m plinth,     |
        |  a well court       |          |   the keep (7.6)  |
        W gate ----------- SOUK SQUARE (fountain) ------ E gate
        |  GARDEN + TANNERY   | S avenue |   CARAVANSERAI    |
        |  (SW) pool, pits    |          |   (SE) roof ring  |
        +--------------------- S gate ---------------------+

   Four 12 m avenues meet at a 60 m souk square. Row houses line every avenue
   (the "strips"), a 4 m ring alley separates them from the four quarters, and
   a 3 m lane runs inside the rampart. Every quarter has a high place —
   medina tall-house roofs (7.6), the keep roof (7.6), the tannery terraces
   (7.6), the caravanserai's continuous roof ring (5.0) — so neither half of
   the map owns the high ground.

   CORE GAMEPLAY IS URBAN SMALL'S. Not an arena: full loot rules, crates every
   minute, 2.5 s spawn protection, the 50 m frag. Points live in
   config/maps-kasbah.config.js, GENERATED from this geometry by
   tools/gen-kasbah-points.js and proved by verify-map.

   STAIRS ARE THE CONTRACT. Every flight is straight, outside, open to the sky:
   rise <= 0.31 m, tread 0.50 m (the run/rise rule in world.js stairFlight:
   a tread deeper than the 0.35 m capsule radius never lets the auto-step see
   two treads up). verify-climb walks every one of them with budget 0.

   EVERY BOX GOES THROUGH segx() — v10.11 shipped walls with x0 > x1. */
(function () {
  if (typeof World === 'undefined') return;

  World._buildKasbah = function (T) {
    var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, rnd = T.rnd, stairFlight = T.stairFlight;
    var NCAST = { cast: false }, NBOTH = { cast: false, collide: false }, NCOL = { collide: false };
    /* Read back by tools/gen-kasbah-points.js: every room floor, roof terrace,
       street and open court, so the points are derived, never typed. */
    var META = World.KASBAH = { rooms: [], roofs: [], open: [], flights: [] };

    function segx(xa, xb, y0, y1, za, zb, mat, o) {
      var x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return null;
      return seg(x0, x1, y0, y1, z0, z1, mat, o);
    }
    function pick(a) { return a[Math.floor(rnd() * a.length) % a.length]; }

    var WALLS = [M.paperWhite, M.cream, M.paleYellow, M.ochre, M.dustyPink, M.paperWhite, M.cream];
    var ACCENT = [M.doorPaint, M.mint, M.doorPaint, M.terracotta, M.maroon];
    var RUGS = [M.maroon, M.terracotta, M.doorPaint, M.mint, M.ochre];

    /* ============ A LOCAL FRAME ============
       A house is written once, in local coordinates: lx 0..W, lz 0..D, its
       FRONT (stair side) on local south (lz = D). r turns it a quarter at a
       time; the front then faces  r0 +z,  r1 -x,  r2 -z,  r3 +x. World
       footprint: r even  x ox..ox+W, z oz..oz+D;  r odd  x ox..ox+D, z oz..oz+W.
       Quarter turns keep every box axis-aligned, so colliders stay exact. */
    function frame(ox, oz, r, W, D) {
      function P(lx, lz) {
        if (r === 0) return [ox + lx, oz + lz];
        if (r === 1) return [ox + (D - lz), oz + lx];
        if (r === 2) return [ox + (W - lx), oz + (D - lz)];
        return [ox + lz, oz + (W - lx)];
      }
      function V(dx, dz) {
        if (r === 0) return [dx, dz];
        if (r === 1) return [-dz, dx];
        if (r === 2) return [-dx, -dz];
        return [dz, -dx];
      }
      return {
        P: P,
        seg: function (lx0, lx1, y0, y1, lz0, lz1, mat, o) {
          var pa = P(lx0, lz0);
          var pb = P(lx1, lz1);
          return segx(pa[0], pb[0], y0, y1, pa[1], pb[1], mat, o);
        },
        cyl: function (lx, y, lz, rr, h, mat, o) { var a = P(lx, lz); return cyl(a[0], y, a[1], rr, h, mat, o); },
        stair: function (lx, y, lz, ldx, ldz, n, sh, sd, w, mat, o) {
          var a = P(lx, lz), v = V(ldx, ldz);
          stairFlight(a[0], y, a[1], v[0], v[1], n, sh, sd, w, mat, o);
          META.flights.push([a[0], y, a[1], v[0], v[1], n, sh, sd]);
        }
      };
    }

    /* A wall with holes, greedy-merged into as few boxes as the holes allow.
       plane 'z': local lz in [c0,c1], runs along lx (u). plane 'x': local lx in
       [c0,c1], runs along lz (u). Openings {u0,u1,v0,v1} are real holes —
       doors you walk through, windows you shoot through. */
    function wall(F, plane, c0, c1, u0, u1, v0, v1, mat, openings, o) {
      openings = openings || [];
      var us = [u0, u1], vs = [v0, v1];
      openings.forEach(function (q) { us.push(q.u0, q.u1); vs.push(q.v0, q.v1); });
      function prep(arr, lo, hi) {
        arr = arr.map(function (v) { return Math.min(hi, Math.max(lo, v)); }).sort(function (a, b) { return a - b; });
        var out = [];
        arr.forEach(function (v) { if (!out.length || v - out[out.length - 1] > 1e-4) out.push(v); });
        return out;
      }
      us = prep(us, u0, u1); vs = prep(vs, v0, v1);
      function open(uc, vc) {
        for (var i = 0; i < openings.length; i++) {
          var q = openings[i];
          if (uc > q.u0 && uc < q.u1 && vc > q.v0 && vc < q.v1) return true;
        }
        return false;
      }
      for (var vi = 0; vi < vs.length - 1; vi++) {
        var va = vs[vi], vb = vs[vi + 1], vc = (va + vb) / 2, runStart = null;
        for (var ui = 0; ui <= us.length - 1; ui++) {
          var solid = ui < us.length - 1 && !open((us[ui] + us[ui + 1]) / 2, vc);
          if (solid && runStart === null) runStart = us[ui];
          if (!solid && runStart !== null) {
            if (plane === 'z') F.seg(runStart, us[ui], va, vb, c0, c1, mat, o);
            else F.seg(c0, c1, va, vb, runStart, us[ui], mat, o);
            runStart = null;
          }
        }
      }
    }

    /* ============ THE HOUSE ============
       o.H        roof-terrace height above o.y0 (4.2 one storey, 7.6 tall)
       o.doors    [[side, u], ...]  side n/s/w/e, u along that side (local)
       o.stair    an exterior flight on the front (local south) climbing +lx
       o.pent     a rooftop room (door onto the terrace, windows to the street)
       o.shop     the front is an open shop with an awning
       A tall house (H > 6) has its ground room under a 3.8 m ceiling and a
       SEALED upper storey: painted shutters, no openings, no access — the
       storey is architecture, the terrace on top is the gameplay. */
    var DW = 1.9, DH = 2.9, TW = 0.35, SL = 0.30;
    function house(ox, oz, r, W, D, o) {
      o = o || {};
      var F = frame(ox, oz, r, W, D);
      var y0 = o.y0 || 0, H = o.H || 4.2, top = y0 + H, tall = H > 6;
      var mat = o.mat || pick(WALLS), acc = o.acc || pick(ACCENT);
      var roofMat = o.roofMat || M.stair;
      var ceil = tall ? y0 + 3.8 : top;            // ground-room ceiling (slab top)
      var doors = o.doors || [['n', W / 2]];
      var stairRun = 0, stairEnd = 0;
      if (o.stair) {
        /* rise <= 0.36 on 0.50 treads, and the flight must fit the front.
           A plot too short for its height gets no flight, not a steep one. */
        var n = Math.max(Math.ceil(H / 0.36), Math.round(H / 0.30));
        if (0.55 + n * 0.5 > W) n = Math.ceil(H / 0.36);
        if (0.55 + n * 0.5 > W) o.stair = false;
        else { stairRun = n * 0.5; stairEnd = 0.35 + stairRun; }
      }
      function ops(side, len) {
        var out = [];
        doors.forEach(function (d) {
          if (d[0] === side) out.push({ u0: d[1] - DW / 2, u1: d[1] + DW / 2, v0: y0 - 0.1, v1: y0 + DH });
        });
        if (o.shop && side === 's') out.push({ u0: len * 0.5 - 2.2, u1: len * 0.5 + 2.2, v0: y0 - 0.1, v1: y0 + DH });
        if (o.windows !== false && !(o.stair && side === 's')) {
          var k = Math.max(1, Math.floor((len - 1.5) / 3.4));
          for (var i = 0; i < k; i++) {
            var u = 0.9 + (len - 1.8) * (i + 0.5) / k;
            var clash = out.some(function (q) { return u + 0.7 > q.u0 - 0.45 && u - 0.7 < q.u1 + 0.45; });
            if (!clash && u - 0.6 > 0.5 && u + 0.6 < len - 0.5) out.push({ u0: u - 0.6, u1: u + 0.6, v0: y0 + 1.35, v1: y0 + 2.25 });
          }
        }
        return out;
      }
      /* walls: north and south run the full width, west and east fit between */
      var wTop = ceil - SL;
      wall(F, 'z', 0, TW, 0, W, y0, wTop, mat, ops('n', W));
      wall(F, 'z', D - TW, D, 0, W, y0, wTop, mat, ops('s', W));
      wall(F, 'x', 0, TW, TW, D - TW, y0, wTop, mat, ops('w', D).map(function (q) { return q; }));
      wall(F, 'x', W - TW, W, TW, D - TW, y0, wTop, mat, ops('e', D));
      F.seg(0, W, ceil - SL, ceil, 0, D, roofMat);                       // ceiling / roof slab
      if (tall) {
        /* the sealed upper storey: four solid walls and the roof on top */
        F.seg(0, W, ceil, top - SL, 0, TW, mat);
        F.seg(0, W, ceil, top - SL, D - TW, D, mat);
        F.seg(0, TW, ceil, top - SL, TW, D - TW, mat);
        F.seg(W - TW, W, ceil, top - SL, TW, D - TW, mat);
        F.seg(0, W, top - SL, top, 0, D, roofMat);
        /* painted shutters on the sealed storey, every face, paint only */
        [['n', W], ['s', W], ['w', D], ['e', D]].forEach(function (sd) {
          var len = sd[1], k = Math.max(1, Math.floor((len - 1.5) / 3.4));
          for (var i = 0; i < k; i++) {
            var u = 0.9 + (len - 1.8) * (i + 0.5) / k, v0 = ceil + 0.9, v1 = ceil + 2.3;
            if (o.stair && sd[0] === 's') continue;
            if (sd[0] === 'n') F.seg(u - 0.55, u + 0.55, v0, v1, -0.06, 0, acc, NBOTH);
            if (sd[0] === 's') F.seg(u - 0.55, u + 0.55, v0, v1, D, D + 0.06, acc, NBOTH);
            if (sd[0] === 'w') F.seg(-0.06, 0, v0, v1, u - 0.55, u + 0.55, acc, NBOTH);
            if (sd[0] === 'e') F.seg(W, W + 0.06, v0, v1, u - 0.55, u + 0.55, acc, NBOTH);
          }
        });
      }
      /* cornice: a terracotta band just under the roof edge, paint only */
      F.seg(-0.08, W + 0.08, top - 0.5, top - 0.36, -0.08, 0, M.terracotta, NBOTH);
      F.seg(-0.08, W + 0.08, top - 0.5, top - 0.36, D, D + 0.08, M.terracotta, NBOTH);
      F.seg(-0.08, 0, top - 0.5, top - 0.36, 0, D, M.terracotta, NBOTH);
      F.seg(W, W + 0.08, top - 0.5, top - 0.36, 0, D, M.terracotta, NBOTH);
      /* door frames: blue lintel paint over each doorway, outside face */
      doors.forEach(function (d) {
        var u = d[1], la = DH + 0.02, lb = DH + 0.32;
        if (d[0] === 'n') F.seg(u - DW / 2 - 0.15, u + DW / 2 + 0.15, y0 + la, y0 + lb, -0.05, 0, acc, NBOTH);
        if (d[0] === 's') F.seg(u - DW / 2 - 0.15, u + DW / 2 + 0.15, y0 + la, y0 + lb, D, D + 0.05, acc, NBOTH);
        if (d[0] === 'w') F.seg(-0.05, 0, y0 + la, y0 + lb, u - DW / 2 - 0.15, u + DW / 2 + 0.15, acc, NBOTH);
        if (d[0] === 'e') F.seg(W, W + 0.05, y0 + la, y0 + lb, u - DW / 2 - 0.15, u + DW / 2 + 0.15, acc, NBOTH);
      });

      /* parapet, 1.05 m: waist-high cover on the terrace, gaps where a stair
         or a bridge arrives. gaps: {side: [[u0,u1],...]} */
      var gaps = o.gaps || {};
      if (o.stair) (gaps.s = gaps.s || []).push([stairEnd - 2.2, stairEnd + 0.4]);
      var hasPent = !!(o.pent && W >= 9 && D >= 7);
      var PW = Math.min(5.2, W * 0.45), PD = Math.min(4.4, D * 0.55);
      if (hasPent) { (gaps.n = gaps.n || []).push([W - PW - 0.01, W + 0.01]); (gaps.e = gaps.e || []).push([-0.01, PD + 0.01]); }
      var PH = 1.05, PT = 0.28;
      function parapet(side) {
        if (o.noParapet && o.noParapet.indexOf(side) >= 0) return;
        var g = (gaps[side] || []).map(function (q) { return { u0: q[0], u1: q[1], v0: top - 0.1, v1: top + PH + 0.1 }; });
        if (side === 'n') wall(F, 'z', 0, PT, 0, W, top, top + PH, mat, g);
        if (side === 's') wall(F, 'z', D - PT, D, 0, W, top, top + PH, mat, g);
        if (side === 'w') wall(F, 'x', 0, PT, PT, D - PT, top, top + PH, mat, g);
        if (side === 'e') wall(F, 'x', W - PT, W, PT, D - PT, top, top + PH, mat, g);
      }
      ['n', 's', 'w', 'e'].forEach(parapet);

      /* the exterior flight: front lane, climbing +lx to the terrace */
      if (o.stair) {
        var nn = Math.round(stairRun / 0.5);
        F.stair(0.35, y0, D + 0.85, 1, 0, nn, H / nn, 0.5, 1.4, M.stair, { landing: false });
        /* a waist rail on the open side of the top half */
        F.seg(0.35 + stairRun * 0.5, stairEnd, top + 0.05, top + 0.12, D + 1.5, D + 1.56, M.wood, NBOTH);
      }
      /* the rooftop room: on the BACK half of the terrace, never on the
         stair's arrival. Door faces the terrace, windows face the street. */
      var pent = null;
      if (hasPent) {
        var pw = PW, pd = PD, px0 = W - pw, ph = 3.2;
        var pmat = mat;
        var pops = function (len, door) {
          var out = [];
          if (door) out.push({ u0: len / 2 - DW / 2, u1: len / 2 + DW / 2, v0: top - 0.1, v1: top + DH });
          else out.push({ u0: len / 2 - 0.6, u1: len / 2 + 0.6, v0: top + 1.3, v1: top + 2.2 });
          return out;
        };
        /* the room's outer walls sit ON the house's outer walls; the parapet
           on those two edges is replaced by them */
        wall(F, 'z', 0, TW, px0, W, top, top + ph, pmat, pops(pw, false).map(function (q) { q.u0 += px0; q.u1 += px0; return q; }));
        wall(F, 'z', pd - TW, pd, px0, W, top, top + ph, pmat, pops(pw, true).map(function (q) { q.u0 += px0; q.u1 += px0; return q; }));
        wall(F, 'x', px0, px0 + TW, TW, pd - TW, top, top + ph, pmat, [{ u0: pd / 2 - 0.6, u1: pd / 2 + 0.6, v0: top + 1.3, v1: top + 2.2 }]);
        wall(F, 'x', W - TW, W, TW, pd - TW, top, top + ph, pmat, [{ u0: pd / 2 - 0.6, u1: pd / 2 + 0.6, v0: top + 1.3, v1: top + 2.2 }]);
        F.seg(px0 - 0.1, W, top + ph, top + ph + 0.22, -0.05, pd + 0.1, M.terracotta);
        var pc = F.P(px0 + pw / 2, pd / 2);
        pent = { x: pc[0], z: pc[1], y: top };
        META.rooms.push({ x: pc[0], z: pc[1], y: top, kind: 'pent' });
      }
      /* interior: a rug, a low table, two pots — paint and a little cover */
      var ic = F.P(W / 2, D / 2), rugC = pick(RUGS);
      F.seg(W * 0.3, W * 0.7, y0 + 0.006, y0 + 0.014, D * 0.3, D * 0.7, rugC, NBOTH);
      F.seg(W * 0.42, W * 0.58, y0, y0 + 0.5, D * 0.42, D * 0.58, M.wood);
      F.cyl(0.85, y0 + 0.4, 0.85, 0.32, 0.8, M.terracotta);
      F.cyl(W - 0.85, y0 + 0.4, D - 0.85, 0.32, 0.8, M.terracotta);
      META.rooms.push({ x: ic[0], z: ic[1], y: y0, kind: tall ? 'tall' : 'room', offX: F.P(W * 0.25, D * 0.5) });
      /* terrace furniture: a water tank on a stand in the back corner */
      if (!o.pent && !o.bare && W >= 8) {
        F.cyl(W - 1.1, top + 0.75, 1.1, 0.62, 1.5, M.paperWhite);
      }
      var rc = F.P(o.pent ? W * 0.3 : W * 0.45, D * 0.55);
      META.roofs.push({ x: rc[0], z: rc[1], y: top, reach: !!o.stair || !!o.reach });
      return { F: F, top: top, pent: pent };
    }

    /* ============ PROPS ============ */
    function palm(x, z, h) {
      h = h || (6 + rnd() * 2.5);
      cyl(x, h / 2, z, 0.24, h, M.wood);
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2 + rnd() * 0.3;
        box(x + Math.cos(a) * 1.2, h + 0.1, z + Math.sin(a) * 1.2, 2.6, 0.12, 0.7, M.foliage, { rotY: -a, collide: false });
      }
      box(x, h + 0.25, z, 0.7, 0.5, 0.7, M.foliage, NBOTH);
    }
    function cart(x, z, rot) {
      var o = rot ? { rotY: rot } : undefined;
      box(x, 0.85, z, 2.6, 0.7, 1.4, M.wood, o);
      cyl(x - 0.7 * Math.cos(rot || 0), 0.45, z + 0.7 * Math.sin(rot || 0), 0.45, 0.2, M.dark, NBOTH);
      box(x, 1.32, z, 2.4, 0.3, 1.2, pick([M.ochre, M.terracotta, M.paleYellow]), rot ? { rotY: rot, collide: false } : NBOTH);
    }
    function jars(x, z, n, y) {
      y = y || 0;
      for (var i = 0; i < n; i++) cyl(x + (i % 3) * 0.75, y + 0.45, z + Math.floor(i / 3) * 0.75, 0.32, 0.9, i % 2 ? M.terracotta : M.ochre);
    }
    function crates(x, z, y) {
      y = y || 0;
      box(x, y + 0.55, z, 1.2, 1.1, 1.2, M.cargoWood);
      box(x + 1.3, y + 0.45, z + 0.2, 1.0, 0.9, 1.0, M.palletWood);
    }
    function stall(x, z, alongX) {
      var w = alongX ? 3.2 : 1.3, d = alongX ? 1.3 : 3.2;
      box(x, 0.55, z, w, 1.1, d, M.wood);
      box(x, 1.13, z, w + 0.1, 0.06, d + 0.1, pick(RUGS), NBOTH);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        cyl(x + s[0] * (w / 2 + 0.25), 1.35, z + s[1] * (d / 2 + 0.25), 0.05, 2.7, M.wood, NCOL);
      });
      box(x, 2.72, z, w + 0.9, 0.08, d + 0.9, pick([M.maroon, M.mint, M.ochre, M.doorPaint, M.dustyPink]), NCOL);
    }
    function overlay(x0, x1, z0, z1, y, mat) { segx(x0, x1, y, y + 0.006, z0, z1, mat, NBOTH); }

    /* ============ GROUND, STREETS, THE RAMPART ============ */
    var B = 97;                                         // inner face of the rampart
    seg(-100, 100, -0.40, 0, -100, 100, M.seatSand, NCAST);
    /* streets: packed earth (minimap brown). N/S at y .004, E/W at .010 and
       the square paving at .016 — three heights, so no two overlays ever
       share a plane. */
    overlay(-6, 6, -B, -30, 0.004, M.dirt); overlay(-6, 6, 30, B, 0.004, M.dirt);
    overlay(-B, -30, -6, 6, 0.010, M.dirt); overlay(30, B, -6, 6, 0.010, M.dirt);
    overlay(-30, 30, -30, 30, 0.016, M.sidewalk);
    [-1, 1].forEach(function (s) {
      /* the ring alley: N/S runs at x +/-28..32, E/W runs at z +/-28..32 */
      overlay(s * 28, s * 32, 32, 94, 0.004, M.dirt); overlay(s * 28, s * 32, -94, -32, 0.004, M.dirt);
      overlay(32, 94, s * 28, s * 32, 0.010, M.dirt); overlay(-94, -32, s * 28, s * 32, 0.010, M.dirt);
    });
    META.open.push({ kind: 'square', x0: -30, x1: 30, z0: -30, z1: 30 });
    META.open.push({ kind: 'ave', x0: -6, x1: 6, z0: -B, z1: -30 }, { kind: 'ave', x0: -6, x1: 6, z0: 30, z1: B },
                   { kind: 'ave', x0: -B, x1: -30, z0: -6, z1: 6 }, { kind: 'ave', x0: 30, x1: B, z0: -6, z1: 6 });

    /* the rampart: 12 m sandstone, a terracotta band, merlons on top */
    var RH = 12;
    seg(-99.5, 99.5, 0, RH, -99.5, -B, M.ochre); seg(-99.5, 99.5, 0, RH, B, 99.5, M.ochre);
    seg(-99.5, -B, 0, RH, -B, B, M.ochre); seg(B, 99.5, 0, RH, -B, B, M.ochre);
    seg(-B, B, RH - 1.1, RH - 0.8, -B, -B + 0.08, M.terracotta, NBOTH); seg(-B, B, RH - 1.1, RH - 0.8, B - 0.08, B, M.terracotta, NBOTH);
    seg(-B, -B + 0.08, RH - 1.1, RH - 0.8, -B + 0.08, B - 0.08, M.terracotta, NBOTH); seg(B - 0.08, B, RH - 1.1, RH - 0.8, -B + 0.08, B - 0.08, M.terracotta, NBOTH);
    for (var m = -96; m <= 96; m += 4) {
      seg(m - 0.9, m + 0.9, RH, RH + 1.3, -99.3, -97.2, M.ochre, NBOTH); seg(m - 0.9, m + 0.9, RH, RH + 1.3, 97.2, 99.3, M.ochre, NBOTH);
      seg(-99.3, -97.2, RH, RH + 1.3, m - 0.9, m + 0.9, M.ochre, NBOTH); seg(97.2, 99.3, RH, RH + 1.3, m - 0.9, m + 0.9, M.ochre, NBOTH);
    }
    /* buttresses: cover along the rampart lane (the lane stays 2 m clear) */
    [-80, -60, -42, 42, 60, 80].forEach(function (u) {
      seg(u - 0.7, u + 0.7, 0, 7, -B, -B + 1.0, M.ochre); seg(u - 0.7, u + 0.7, 0, 7, B - 1.0, B, M.ochre);
      seg(-B, -B + 1.0, 0, 7, u - 0.7, u + 0.7, M.ochre); seg(B - 1.0, B, 0, 7, u - 0.7, u + 0.7, M.ochre);
    });
    /* corner bastions — landmarks you navigate by, not places you climb */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      segx(c[0] * B, c[0] * 91, 0, 15, c[1] * B, c[1] * 91, M.ochre);
      segx(c[0] * B, c[0] * 90.6, 15, 15.4, c[1] * B, c[1] * 90.6, M.terracotta, NCAST);
    });
    /* the four gates: a great blue door between two pylons, an arch over */
    function gate(ax) {             // ax: 'n','s','w','e'
      var s = (ax === 'n' || ax === 'w') ? -1 : 1;
      if (ax === 'n' || ax === 's') {
        segx(-7.2, -4.4, 0, 14, s * B, s * (B - 2.6), M.ochre); segx(4.4, 7.2, 0, 14, s * B, s * (B - 2.6), M.ochre);
        segx(-4.4, 4.4, 7.2, 9.6, s * B, s * (B - 2.2), M.ochre);
        segx(-4.4, 4.4, 0, 7.2, s * B, s * (B - 0.18), M.doorPaint, NCAST);
        segx(-7.4, 7.4, 13.6, 14.2, s * (B + 0.1), s * (B - 2.8), M.terracotta, NCAST);
      } else {
        segx(s * B, s * (B - 2.6), 0, 14, -7.2, -4.4, M.ochre); segx(s * B, s * (B - 2.6), 0, 14, 4.4, 7.2, M.ochre);
        segx(s * B, s * (B - 2.2), 7.2, 9.6, -4.4, 4.4, M.ochre);
        segx(s * B, s * (B - 0.18), 0, 7.2, -4.4, 4.4, M.doorPaint, NCAST);
        segx(s * (B + 0.1), s * (B - 2.8), 13.6, 14.2, -7.4, 7.4, M.terracotta, NCAST);
      }
    }
    ['n', 's', 'w', 'e'].forEach(gate);

    /* ============ THE SOUK SQUARE ============ */
    /* the fountain: an eight-metre basin, a column, a bowl */
    cyl(0, 0.4, 0, 3.4, 0.8, M.paperWhite);
    cyl(0, 0.83, 0, 3.05, 0.04, M.steelBlue, NBOTH);
    cyl(0, 2.1, 0, 0.42, 2.6, M.ochre);
    cyl(0, 3.45, 0, 1.25, 0.28, M.paperWhite, NCAST);
    [[-10, -10], [10, -10], [-10, 10], [10, 10]].forEach(function (p) { palm(p[0], p[1], 7.5); });
    /* the stalls: a ring of eight, leaving the four avenue mouths open */
    [[-17, -12, 1], [-12, -17, 0], [17, -12, 1], [12, -17, 0], [-17, 12, 1], [-12, 17, 0], [17, 12, 1], [12, 17, 0]]
      .forEach(function (s) { stall(s[0], s[1], !s[2]); });
    /* screen walls across the four axes, 9 m out: break the avenue-to-avenue
       lines without closing the square */
    function screen(x, z, alongX) {
      if (alongX) { seg(x - 3.4, x + 3.4, 0, 2.6, z - 0.25, z + 0.25, M.paperWhite); seg(x - 3.6, x + 3.6, 2.6, 2.85, z - 0.35, z + 0.35, M.terracotta); }
      else { seg(x - 0.25, x + 0.25, 0, 2.6, z - 3.4, z + 3.4, M.paperWhite); seg(x - 0.35, x + 0.35, 2.6, 2.85, z - 3.6, z + 3.6, M.terracotta); }
    }
    screen(0, -9.5, true); screen(0, 9.5, true); screen(-9.5, 0, false); screen(9.5, 0, false);
    /* the four arches at the avenue mouths */
    function arch(ax) {
      var s = (ax === 'n' || ax === 'w') ? -1 : 1;
      if (ax === 'n' || ax === 's') {
        segx(-6.2, -3.8, 0, 6.6, s * 29, s * 31, M.ochre); segx(3.8, 6.2, 0, 6.6, s * 29, s * 31, M.ochre);
        segx(-3.8, 3.8, 4.8, 6.6, s * 29.2, s * 30.8, M.ochre);
        segx(-6.4, 6.4, 6.6, 7.0, s * 28.8, s * 31.2, M.terracotta, NCAST);
      } else {
        segx(s * 29, s * 31, 0, 6.6, -6.2, -3.8, M.ochre); segx(s * 29, s * 31, 0, 6.6, 3.8, 6.2, M.ochre);
        segx(s * 29.2, s * 30.8, 4.8, 6.6, -3.8, 3.8, M.ochre);
        segx(s * 28.8, s * 31.2, 6.6, 7.0, -6.4, 6.4, M.terracotta, NCAST);
      }
    }
    ['n', 's', 'w', 'e'].forEach(arch);
    /* kiosks in the square's corners: one-storey shops with terraces */
    house(-29, -29, 0, 10, 7.4, { stair: true, doors: [['n', 7.2], ['e', 3.7]], shop: false, mat: M.paperWhite });
    house(19, -29, 0, 10, 7.4, { stair: true, doors: [['n', 7.2], ['w', 3.7]], mat: M.cream });
    house(-29, 20, 2, 10, 7.4, { stair: true, doors: [['n', 7.2], ['e', 3.7]], mat: M.paleYellow });
    house(19, 20, 2, 10, 7.4, { stair: true, doors: [['n', 7.2], ['w', 3.7]], mat: M.dustyPink });

    /* ============ THE STRIPS: ROW HOUSES ALONG THE AVENUES ============
       Each strip is two rows: one fronting the avenue (stairs on the avenue
       side), one fronting the ring alley, a 3 m back lane between them, and
       3.5 m cross alleys between houses. */
    function strip(axis, s) {
      /* axis 'ns': x in s*[6,28], z along 32..94 (both halves of the avenue);
         axis 'ew': z in s*[6,28], x along 32..94. Both halves (+/-) of the run. */
      [-1, 1].forEach(function (h) {
        var lens = h * s > 0 ? [11, 10, 12, 11.5] : [12, 11, 10, 11.5];
        var u = 33;
        lens.forEach(function (L, i) {
          var u0 = u, u1 = u + L; u = u1 + 3.6;
          var tallF = (i === 1 || i === 3) && ((h + s + (axis === 'ns' ? 0 : 1)) & 1) === 0;
          var tallB = i === 2;
          if (axis === 'ns') {
            var zA = h > 0 ? u0 : -u1;               // strip run along z
            /* front row: x s*[7.6, 16.4], front faces the avenue (toward x=0) */
            if (s < 0) house(-16.4, zA, 3, L, 8.8, { stair: !tallF || i === 3, H: tallF ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]], pent: !tallF && i % 2 === 0 });
            else house(7.6, zA, 1, L, 8.8, { stair: !tallF || i === 3, H: tallF ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]], pent: !tallF && i % 2 === 0 });
            /* back row: x s*[19.4, 26.4], front faces the ring alley */
            if (s < 0) house(-27.9, zA, 1, L, 7.0, { stair: i % 2 === 1, H: tallB ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]] });
            else house(20.9, zA, 3, L, 7.0, { stair: i % 2 === 1, H: tallB ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]] });
          } else {
            var xA = h > 0 ? u0 : -u1;
            if (s < 0) house(xA, -16.4, 0, L, 8.8, { stair: !tallF || i === 3, H: tallF ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]], pent: !tallF && i % 2 === 0 });
            else house(xA, 7.6, 2, L, 8.8, { stair: !tallF || i === 3, H: tallF ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]], pent: !tallF && i % 2 === 0 });
            if (s < 0) house(xA, -27.9, 2, L, 7.0, { stair: i % 2 === 1, H: tallB ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]] });
            else house(xA, 20.9, 0, L, 7.0, { stair: i % 2 === 1, H: tallB ? 7.6 : 4.2, doors: [['s', L - 1.6], ['n', L / 2]] });
          }
        });
      });
    }
    strip('ns', -1); strip('ns', 1); strip('ew', -1); strip('ew', 1);
    /* avenue dressing: palms on the kerb line, carts and jars as cover */
    [-1, 1].forEach(function (s) {
      [40, 58, 76].forEach(function (u, i) {
        palm(-5.2, s * u); palm(5.2, s * (u + 7)); palm(s * u, -5.2); palm(s * (u + 7), 5.2);
        if (i !== 1) { cart(s * 2.2, s * (u + 4), 0); cart(s * (u + 4), -2.2, Math.PI / 2); }
        else { jars(-1.2, s * (u + 3), 4); jars(s * (u + 3), 0.6, 4); }
      });
    });

    /* ============ NW — THE MEDINA ============
       x -94..-32, z -94..-32. A tight grid of tall and short houses around a
       small well court, alleys 3.5-4 m. The densest quarter. */
    (function () {
      var cols = [[-90.5, -78], [-74.5, -62], [-58.5, -46], [-42.5, -32.5]];
      var rows = [[-90.5, -78.5], [-75, -63.5], [-60, -48.5], [-45, -33]];
      rows.forEach(function (rw, ri) {
        cols.forEach(function (cl, ci) {
          if ((ri === 1 || ri === 2) && (ci === 1 || ci === 2)) return;    // the well court
          var W = cl[1] - cl[0], D = rw[1] - rw[0] - 1.8;
          var tall = (ri + ci) % 3 === 0;
          var r = (ci < 2) ? 0 : 0;
          house(cl[0], rw[0], r, W, D, { stair: true, H: tall ? 7.6 : 4.2, pent: !tall && (ri + ci) % 2 === 1,
            doors: [['n', W / 2], ['e', D / 2]] });
        });
      });
      /* the well court, x -74.5..-46, z -75..-48.5: a well, two palms, benches */
      META.open.push({ kind: 'court', x0: -73.5, x1: -47, z0: -74, z1: -49.5 });
      overlay(-74.5, -46, -75, -48.5, 0.004, M.sidewalk);
      cyl(-60, 0.5, -62, 1.4, 1.0, M.paperWhite);
      box(-60, 2.4, -62, 3.0, 0.2, 0.3, M.wood, NCOL);
      cyl(-61.4, 1.5, -62, 0.1, 2.0, M.wood, NCOL); cyl(-58.6, 1.5, -62, 0.1, 2.0, M.wood, NCOL);
      palm(-68, -55); palm(-52, -69);
      box(-68, 0.25, -69, 3.0, 0.5, 0.7, M.ochre); box(-52, 0.25, -55, 3.0, 0.5, 0.7, M.ochre);
      jars(-72, -51, 5); crates(-50, -72);
    })();

    /* ============ NE — THE CITADEL ============
       A 36 x 36 m plinth, 3 m high, x 50..86, z -86..-50; two grand stairs
       (west and south); the keep on top (roof 7.6); barracks; cannon on the
       corners. Below it, stables and a ruined wall to fight round. */
    (function () {
      var PX0 = 50, PX1 = 86, PZ0 = -86, PZ1 = -50, PY = 3.0;
      seg(PX0, PX1, 0, PY, PZ0, PZ1, M.ochre);
      seg(PX0 - 0.3, PX1 + 0.3, 0, 0.6, PZ0 - 0.3, PZ1 + 0.3, M.seatSand, NCAST);          // base course
      seg(PX0 - 0.08, PX1 + 0.08, PY - 0.35, PY - 0.2, PZ0 - 0.08, PZ1 + 0.08, M.terracotta, NBOTH);
      /* grand stairs: 10 x 0.30, 0.50 treads, 4 m wide */
      stairFlight(PX0 - 5.0, 0, -68, 1, 0, 10, 0.30, 0.5, 4.0, M.stair, { landing: false });
      META.flights.push([PX0 - 5.0, 0, -68, 1, 0, 10, 0.30, 0.5]);
      stairFlight(68, 0, PZ1 + 5.0, 0, -1, 10, 0.30, 0.5, 4.0, M.stair, { landing: false });
      META.flights.push([68, 0, PZ1 + 5.0, 0, -1, 10, 0.30, 0.5]);
      /* crenellated parapet with the two stair gaps */
      function crenel(x0, x1, z0, z1) {
        seg(x0, x1, PY, PY + 1.0, z0, z1, M.ochre);
        var alongX = (x1 - x0) > (z1 - z0), L = alongX ? x1 - x0 : z1 - z0;
        for (var t = 0.8; t < L - 0.5; t += 2.4) {
          if (alongX) seg(x0 + t, x0 + t + 1.0, PY + 1.0, PY + 1.6, z0, z1, M.ochre, NBOTH);
          else seg(x0, x1, PY + 1.0, PY + 1.6, z0 + t, z0 + t + 1.0, M.ochre, NBOTH);
        }
      }
      crenel(PX0, PX1, PZ0, PZ0 + 0.4);                       // north
      crenel(PX0, 65.6, PZ1 - 0.4, PZ1); crenel(70.4, PX1, PZ1 - 0.4, PZ1);   // south, gap at x 68
      crenel(PX0, PX0 + 0.4, PZ0 + 0.4, -70.4); crenel(PX0, PX0 + 0.4, -65.6, PZ1 - 0.4);   // west, gap at z -68
      crenel(PX1 - 0.4, PX1, PZ0 + 0.4, PZ1 - 0.4);           // east
      overlay(PX0 + 0.4, PX1 - 0.4, PZ0 + 0.4, PZ1 - 0.4, PY + 0.004, M.sidewalk);
      META.open.push({ kind: 'plinth', x0: PX0 + 1.5, x1: PX1 - 1.5, z0: PZ0 + 1.5, z1: PZ1 - 1.5, y: PY });
      /* THE KEEP: 14 x 12, on the plinth, front (stair) facing south */
      house(60, -76, 0, 14, 11, { y0: PY, H: 4.6, stair: true, mat: M.ochre, acc: M.doorPaint,
        doors: [['n', 7], ['w', 5.5], ['e', 5.5]], windows: true });
      /* keep merlons on its parapet top, paint */
      for (var kx = 60.6; kx < 73.6; kx += 2.2) { seg(kx, kx + 0.9, PY + 4.6 + 1.05, PY + 4.6 + 1.5, -76, -75.72, M.ochre, NBOTH); }
      /* barracks along the north edge, and the armoury on the east */
      house(52, -84, 0, 13, 6.5, { y0: PY, H: 3.8, doors: [['s', 6.5], ['e', 3.2]], mat: M.cream, bare: true });
      house(77, -72, 1, 12, 6.5, { y0: PY, H: 3.8, doors: [['s', 6], ['n', 6]], mat: M.paleYellow, bare: true });
      /* cannon on the plinth corners: barrel + carriage, cover */
      [[53, -53, 1], [83, -53, 1], [53, -82, -1], [83, -82, -1]].forEach(function (c) {
        box(c[0], PY + 0.45, c[1], 1.6, 0.9, 1.1, M.wood);
        box(c[0], PY + 1.05, c[1] + c[2] * 0.5, 0.5, 0.5, 2.4, M.dark, NCOL);
      });
      crates(56, -60, PY); jars(78, -58, 4, PY); crates(55, -70, PY);
      /* below: stables (open front), a ruined wall, palms, a dry trough */
      house(34, -92, 0, 14, 8, { H: 4.2, shop: true, doors: [['n', 7]], mat: M.paleYellow });
      seg(34, 46, 0, 2.2, -64, -63.4, M.ochre); seg(34, 34.6, 0, 1.6, -63.4, -56, M.ochre);
      seg(40, 46, 0, 1.2, -46, -45.4, M.ochre);
      palm(38, -72); palm(44, -52); palm(88, -40); palm(54, -40); palm(72, -40);
      box(40, 0.4, -78, 4.0, 0.8, 1.0, M.paperWhite);
      cart(88, -60, Math.PI / 2); crates(86, -44);
      /* the lanes behind the plinth (north and east of it): a broken wall,
         stacked crates and jars, so the long run under the rampart is not a
         shooting gallery (verify-cover's worst cell there was 35 m) */
      seg(60, 66, 0, 1.2, -92, -91.4, M.ochre); crates(72, -92.5); jars(83, -93.5, 3);
      seg(90, 90.6, 0, 1.4, -88, -80, M.ochre); crates(92.5, -74); seg(88.5, 94, 0, 1.1, -68, -67.4, M.ochre);
      META.open.push({ kind: 'yard', x0: 34, x1: 48, z0: -80, z1: -66 }, { kind: 'yard', x0: 52, x1: 92, z0: -46, z1: -36 });
    })();

    /* ============ SE — THE CARAVANSERAI ============
       A courtyard ring, x 38..88, z 40..90: four wings 7 m deep, one storey
       of 5.0 m with rooms off the courtyard; a gate through each wing,
       bridged at roof level, so the roof is ONE continuous ring. Two flights
       up from the courtyard. */
    (function () {
      var X0 = 38, X1 = 88, Z0 = 40, Z1 = 90, Dp = 7, H = 5.0, CM = M.paleYellow;
      var GX = 63, GZ = 65, GH = 2.2;       // gate centres, half-width
      function wing(x0, x1, z0, z1, doorsAt, doorSide) {
        /* hollow wing: outer wall with windows, inner wall with one door per
           room, cross walls midway between doors */
        var F = frame(0, 0, 0, 1, 1);
        var alongX = (x1 - x0) > (z1 - z0);
        function wl(xa, xb, za, zb, openings) {
          var w = (xb - xa) > (zb - za);
          wall(F, w ? 'z' : 'x', w ? za : xa, w ? zb : xb, w ? xa : za, w ? xb : zb, 0, H - SL, CM, openings);
        }
        var outer = [], inner = [];
        doorsAt.forEach(function (c, t) {
          inner.push({ u0: c - DW / 2, u1: c + DW / 2, v0: -0.1, v1: DH });
          outer.push({ u0: c - 0.6, u1: c + 0.6, v0: 1.35, v1: 2.25 });
          if (t > 0) {
            var cw = (c + doorsAt[t - 1]) / 2;
            if (alongX) seg(cw - 0.15, cw + 0.15, 0, H - SL, z0 + TW, z1 - TW, CM);
            else seg(x0 + TW, x1 - TW, 0, H - SL, cw - 0.15, cw + 0.15, CM);
          }
          var rc = alongX ? [c, (z0 + z1) / 2] : [(x0 + x1) / 2, c];
          META.rooms.push({ x: rc[0] + (alongX ? 1.6 : 0), z: rc[1] + (alongX ? 0 : 1.6), y: 0, kind: 'room' });
          F.seg(rc[0] - 1.1, rc[0] + 1.1, 0.006, 0.014, rc[1] - 1.1, rc[1] + 1.1, pick(RUGS), NBOTH);
        });
        if (alongX) {
          wl(x0, x1, doorSide < 0 ? z0 : z1 - TW, doorSide < 0 ? z0 + TW : z1, inner);
          wl(x0, x1, doorSide < 0 ? z1 - TW : z0, doorSide < 0 ? z1 : z0 + TW, outer);
          seg(x0, x0 + TW, 0, H - SL, z0 + TW, z1 - TW, CM); seg(x1 - TW, x1, 0, H - SL, z0 + TW, z1 - TW, CM);
        } else {
          wl(doorSide < 0 ? x0 : x1 - TW, doorSide < 0 ? x0 + TW : x1, z0, z1, inner);
          wl(doorSide < 0 ? x1 - TW : x0, doorSide < 0 ? x1 : x0 + TW, z0, z1, outer);
          seg(x0 + TW, x1 - TW, 0, H - SL, z0, z0 + TW, CM); seg(x0 + TW, x1 - TW, 0, H - SL, z1 - TW, z1, CM);
        }
        seg(x0, x1, H - SL, H, z0, z1, M.stair);
        segx(x0 - 0.08, x1 + 0.08, H - 0.5, H - 0.36, z0 - 0.08, z1 + 0.08, M.terracotta, NBOTH);
      }
      /* corner blocks: solid, roofed at H — the ring stays continuous */
      [[X0, X0 + Dp, Z0, Z0 + Dp], [X1 - Dp, X1, Z0, Z0 + Dp], [X0, X0 + Dp, Z1 - Dp, Z1], [X1 - Dp, X1, Z1 - Dp, Z1]]
        .forEach(function (c) { seg(c[0], c[1], 0, H, c[2], c[3], CM); });
      /* the wings between them. Doors face the courtyard and stay clear of
         the two flights (A on the north-west run x 46.6..55.1, B on the
         south-east run x 70.9..79.4). */
      wing(X0 + Dp, GX - GH, Z0, Z0 + Dp, [57.8], 1); wing(GX + GH, X1 - Dp, Z0, Z0 + Dp, [69.5, 76.5], 1);
      wing(X0 + Dp, GX - GH, Z1 - Dp, Z1, [49.5, 56.5], -1); wing(GX + GH, X1 - Dp, Z1 - Dp, Z1, [68.0], -1);
      wing(X0, X0 + Dp, Z0 + Dp, GZ - GH, [51.5, 58.5], 1); wing(X0, X0 + Dp, GZ + GH, Z1 - Dp, [71.5, 78.5], 1);
      wing(X1 - Dp, X1, Z0 + Dp, GZ - GH, [51.5, 58.5], -1); wing(X1 - Dp, X1, GZ + GH, Z1 - Dp, [71.5, 78.5], -1);
      /* the gates' bridges: roof slab over each gap, an arch band under it */
      seg(GX - GH, GX + GH, H - SL - 0.8, H, Z0, Z0 + Dp, CM); seg(GX - GH, GX + GH, H - SL - 0.8, H, Z1 - Dp, Z1, CM);
      seg(X0, X0 + Dp, H - SL - 0.8, H, GZ - GH, GZ + GH, CM); seg(X1 - Dp, X1, H - SL - 0.8, H, GZ - GH, GZ + GH, CM);
      /* roof parapets: outer edge all round, inner edge with stair gaps */
      var PH = 1.05;
      seg(X0, X1, H, H + PH, Z0, Z0 + 0.28, CM); seg(X0, X1, H, H + PH, Z1 - 0.28, Z1, CM);
      seg(X0, X0 + 0.28, H, H + PH, Z0 + 0.28, Z1 - 0.28, CM); seg(X1 - 0.28, X1, H, H + PH, Z0 + 0.28, Z1 - 0.28, CM);
      /* inner parapet: north inner edge has the gap where flight A arrives
         (x 53.0..55.6), south inner edge where flight B arrives (x 70.4..73.0) */
      seg(X0 + Dp, 53.0, H, H + PH, Z0 + Dp - 0.28, Z0 + Dp, CM); seg(55.6, X1 - Dp, H, H + PH, Z0 + Dp - 0.28, Z0 + Dp, CM);
      seg(X0 + Dp, 70.4, H, H + PH, Z1 - Dp, Z1 - Dp + 0.28, CM); seg(73.0, X1 - Dp, H, H + PH, Z1 - Dp, Z1 - Dp + 0.28, CM);
      seg(X0 + Dp - 0.28, X0 + Dp, H, H + PH, Z0 + Dp, Z1 - Dp, CM); seg(X1 - Dp, X1 - Dp + 0.28, H, H + PH, Z0 + Dp, Z1 - Dp, CM);
      /* the two flights: 17 x 0.294 on 0.50 treads, against the inner faces */
      stairFlight(46.6, 0, Z0 + Dp + 0.85, 1, 0, 17, H / 17, 0.5, 1.4, M.stair, { landing: false });
      META.flights.push([46.6, 0, Z0 + Dp + 0.85, 1, 0, 17, H / 17, 0.5]);
      stairFlight(79.4, 0, Z1 - Dp - 0.85, -1, 0, 17, H / 17, 0.5, 1.4, M.stair, { landing: false });
      META.flights.push([79.4, 0, Z1 - Dp - 0.85, -1, 0, 17, H / 17, 0.5]);
      [[X0 + 3.5, Z0 + 3.5], [X1 - 3.5, Z0 + 3.5], [X0 + 3.5, Z1 - 3.5], [X1 - 3.5, Z1 - 3.5], [GX, Z0 + 3.5], [GX, Z1 - 3.5],
       [X0 + 3.5, GZ], [X1 - 3.5, GZ]].forEach(function (p) { META.roofs.push({ x: p[0], z: p[1], y: H, reach: true }); });
      /* the courtyard: a long trough, carts, bales, two palms */
      META.open.push({ kind: 'court', x0: X0 + Dp + 2.5, x1: X1 - Dp - 2.5, z0: Z0 + Dp + 2.5, z1: Z1 - Dp - 2.5 });
      overlay(X0 + Dp, X1 - Dp, Z0 + Dp, Z1 - Dp, 0.004, M.sidewalk);
      seg(57, 69, 0, 0.75, 64, 66, M.paperWhite); seg(57.3, 68.7, 0.752, 0.758, 64.3, 65.7, M.steelBlue, NBOTH);
      cart(52, 56, 0.3); cart(74, 74, -0.4); crates(70, 54); crates(54, 76); jars(76, 56, 4);
      palm(55, 66); palm(71, 64);
      box(64, 0.6, 76, 2.4, 1.2, 1.2, M.paleYellow); box(64, 0.6, 54, 2.4, 1.2, 1.2, M.paleYellow);
      /* outside the ring: the yard by the rampart, the camel posts */
      palm(36, 94.5 - 2); palm(92, 36); palm(92, 70);
    })();

    /* ============ SW — THE GARDEN AND THE TANNERY ============ */
    (function () {
      /* THE GARDEN: x -92..-36, z 36..56 — turf, a long pool, palms, a pavilion */
      overlay(-92, -36, 36, 56, 0.004, M.sage);
      META.open.push({ kind: 'garden', x0: -90, x1: -38, z0: 37, z1: 55 });
      /* the pool: a rim you can crouch behind, shallow water you can walk in */
      seg(-80, -46, 0, 0.5, 43, 43.4, M.paperWhite); seg(-80, -46, 0, 0.5, 48.6, 49, M.paperWhite);
      seg(-80, -79.6, 0, 0.5, 43.4, 48.6, M.paperWhite); seg(-46.4, -46, 0, 0.5, 43.4, 48.6, M.paperWhite);
      overlay(-79.6, -46.4, 43.4, 48.6, 0.012, M.steelBlue);
      for (var px = -76; px <= -50; px += 6.5) { palm(px, 39.5, 6.5); palm(px + 3.2, 52.5, 7); }
      /* the pavilion: four piers, a green roof, a bench */
      [[-90, 41], [-84, 41], [-90, 51], [-84, 51]].forEach(function (p) { seg(p[0] - 0.35, p[0] + 0.35, 0, 3.8, p[1] - 0.35, p[1] + 0.35, M.paperWhite); });
      seg(-90.8, -83.2, 3.8, 4.15, 40.2, 51.8, M.mint, NCAST);
      seg(-91.0, -83.0, 4.15, 4.35, 40.0, 52.0, M.terracotta, NCAST);
      box(-87, 0.25, 46, 1.0, 0.5, 4.0, M.wood);
      /* the hammam: a long bath-house on the garden's south edge, a dome-ish
         stack on its roof (stepped cylinders), one flight up */
      house(-74, 58, 2, 16, 10, { H: 4.2, stair: true, mat: M.paperWhite, acc: M.mint, doors: [['n', 8], ['e', 5]], bare: true });
      cyl(-66, 4.2 + 0.6, 63, 2.6, 1.2, M.paperWhite, NCAST);
      cyl(-66, 4.2 + 1.5, 63, 1.8, 0.6, M.paperWhite, NBOTH);
      cyl(-66, 4.2 + 2.0, 63, 0.9, 0.4, M.mint, NBOTH);
      /* THE TANNERY: x -90..-56, z 72..90 — a low-walled yard of dye pits,
         gaps north (x -78..-74), east (z 79..83) and south (x -79..-73) */
      seg(-90, -78, 0, 1.2, 72, 72.4, M.ochre); seg(-74, -56, 0, 1.2, 72, 72.4, M.ochre);
      seg(-90, -79, 0, 1.2, 89.6, 90, M.ochre); seg(-73, -56, 0, 1.2, 89.6, 90, M.ochre);
      seg(-90, -89.6, 0, 1.2, 72.4, 89.6, M.ochre);
      seg(-56.4, -56, 0, 1.2, 72.4, 79, M.ochre); seg(-56.4, -56, 0, 1.2, 83, 89.6, M.ochre);
      META.open.push({ kind: 'pits', x0: -88, x1: -58, z0: 74, z1: 88 });
      var DYES = [M.maroon, M.ochre, M.mint, M.doorPaint, M.dustyPink, M.paleYellow, M.terracotta];
      for (var vx = -85; vx <= -61; vx += 6) {
        for (var vz = 76.5; vz <= 86.5; vz += 5) {
          cyl(vx, 0.45, vz, 1.35, 0.9, M.seatSand);
          cyl(vx, 0.92, vz, 1.1, 0.03, DYES[Math.floor(rnd() * DYES.length) % DYES.length], NBOTH);
        }
      }
      /* tannery houses with terraces over the pits — the viewing roofs */
      house(-52, 62, 3, 14, 9, { H: 7.6, stair: true, mat: M.dustyPink, doors: [['s', 12], ['n', 7]] });
      house(-52, 79, 3, 12, 9, { H: 4.2, stair: true, pent: true, mat: M.cream, doors: [['s', 10.4], ['n', 6]] });
      house(-38, 62, 1, 12, 6, { H: 4.2, stair: true, mat: M.paleYellow, doors: [['s', 10.4], ['n', 6]] });
      house(-38, 77, 1, 14, 6, { H: 7.6, stair: true, mat: M.ochre, doors: [['s', 12.4], ['n', 7]] });
      jars(-90, 60, 6); crates(-55.5, 60);
    })();

    /* ============ THE RAMPART LANE: a little cover where it opens out ============ */
    crates(-88, 0 - 14); crates(88, 14); crates(14, -88); crates(-14, 88);
    jars(-88, 18, 3); jars(86, -20, 3);
  };
})();
