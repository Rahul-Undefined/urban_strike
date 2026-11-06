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

    /* ===== v2.10 - EVERY QUARTER HAS ITS OWN COLOUR =====
       Rahul: "map bahot yellow sided hai, usko thora colourful karo ghar, like
       every area is somewhat different colour." The shared palette (M) is
       Urban's — muted sands and creams — so Kasbah gets its own wall colours,
       made once and cached on World (materials survive World.reset; only
       geometry is disposed). One palette per DISTRICT, picked by where the
       house stands, so a quarter reads as one place and its neighbour as
       another: the Blue Medina is blue and white, Spice Row saffron and
       paprika, Lantern Lane lilac and turquoise, and so on. ~30 colours cost
       ~30 draw calls (Kasbah 29 -> ~65; Urban is 109). */
    var PALC = World._kasbahPal || (World._kasbahPal = {});
    function pm(hex) { return PALC[hex] || (PALC[hex] = new THREE.MeshLambertMaterial({ color: hex })); }
    /* The districts. ORDER MATTERS only where rectangles touch: first match
       wins. The same list is written to config (gen-kasbah-points) so
       DISTRICTS.nameAt, the minimap label and the gates all name the same
       place. tint is the M-map wash; walls/acc the house palette. */
    var DISTRICTS_K = [
      { id: 'souk',   name: 'SOUK SQUARE',     x0: -30, x1: 30,  z0: -30, z1: 30,  tint: '#e9c46a',
        walls: [0xf0ece4, 0x46b7b0, 0xe07a5f, 0xf2c14e], acc: [0x1f5fb0, 0xa8322a] },
      { id: 'spice',  name: 'SPICE ROW',       x0: -30, x1: 30,  z0: -97, z1: -30, tint: '#e08a2e',
        walls: [0xe0a030, 0xd9732e, 0xc94f2c, 0xe8c66a], acc: [0x1f5fb0, 0x2e7d4f] },
      { id: 'lantern', name: 'LANTERN LANE',   x0: -30, x1: 30,  z0: 30,  z1: 97,  tint: '#9b7fd1',
        walls: [0x8e72c4, 0x5fb7b0, 0xd9798a, 0xeae3f0], acc: [0xe0b030, 0x1f5fb0] },
      { id: 'weavers', name: 'WEAVERS ROW',    x0: -97, x1: -30, z0: -30, z1: 30,  tint: '#3e9b8f',
        walls: [0x3e9b8f, 0xe7e2d6, 0x7fbf6a, 0xd8b04a], acc: [0xa8322a, 0x1f5fb0] },
      { id: 'copper', name: 'COPPER STREET',   x0: 30,  x1: 97,  z0: -30, z1: 30,  tint: '#c0613d',
        walls: [0xb85a3a, 0xc97b4f, 0xa0482f, 0xd89a6a], acc: [0x2a8f8a, 0x1f5fb0] },
      { id: 'medina', name: 'BLUE MEDINA',     x0: -97, x1: -30, z0: -97, z1: -30, tint: '#3f7fc8',
        walls: [0x3f7fc8, 0x6fa6dc, 0xe9edf2, 0x2f6db0], acc: [0xf2f2f2, 0xe0b030] },
      { id: 'citadel', name: 'THE CITADEL',    x0: 30,  x1: 97,  z0: -97, z1: -30, tint: '#b4643f',
        walls: [0xb4643f, 0xc98a5a, 0xa65438], acc: [0x2f4a5c, 0xe0b030] },
      { id: 'caravan', name: 'CARAVANSERAI',   x0: 30,  x1: 97,  z0: 30,  z1: 97,  tint: '#d98a8a',
        walls: [0xd98a8a, 0xe0a59b, 0xc96f6f], acc: [0x1f5fb0, 0x2e7d4f] },
      { id: 'tannery', name: 'TANNERY GARDENS', x0: -97, x1: -30, z0: 30, z1: 97,  tint: '#5aa36b',
        walls: [0x5aa36b, 0x3f8f8a, 0xe9e4d8, 0xd9b44a], acc: [0xa8322a, 0x1f5fb0] }
    ];
    /* where each name is printed on the M map: in open ground, never over a
       house number — the strip names run ALONG their avenue */
    var LAB = { souk: [0, -18, 0], spice: [0, -62, -Math.PI / 2], lantern: [0, 64, -Math.PI / 2], weavers: [-64, 0, 0],
                copper: [64, 0, 0], medina: [-61, -64, 0], citadel: [67, -54.5, 0], caravan: [63, 65, 0], tannery: [-63, 39, 0] };
    META.districts = DISTRICTS_K.map(function (d) { return { id: d.id, name: d.name, x0: d.x0, x1: d.x1, z0: d.z0, z1: d.z1, tint: d.tint, lab: LAB[d.id] }; });
    function districtAt(x, z) {
      for (var i = 0; i < DISTRICTS_K.length; i++) {
        var d = DISTRICTS_K[i];
        if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
      }
      var best = DISTRICTS_K[0], bd = 1e9;
      DISTRICTS_K.forEach(function (d) {
        var dx = Math.max(d.x0 - x, 0, x - d.x1), dz = Math.max(d.z0 - z, 0, z - d.z1);
        if (dx + dz < bd) { bd = dx + dz; best = d; }
      });
      return best;
    }
    var dCount = {};
    function districtMat(x, z, tall) {
      var d = districtAt(x, z), k = dCount[d.id] = (dCount[d.id] || 0) + 1;
      var w = d.walls[(k + (tall ? 1 : 0)) % d.walls.length];
      return { d: d, wall: pm(w), hex: w, acc: pm(d.acc[k % d.acc.length]) };
    }
    /* Every building with a front door, for the house numbers and the M map:
       { x0,z0,x1,z1 footprint, cx,cz, door [x, z, nx, nz], y0, hex, d } */
    var HOUSES = META.houses = [];
    var BLOCKS = META.blocks = [];     // other footprints for the map (plinth, wings, landmarks)
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
      /* v2.10: the district's palette unless the caller fixed a material */
      var c0 = F.P(0, 0), c1 = F.P(W, D);
      var DM = districtMat((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (o.H || 4.2) > 6);
      var mat = o.mat || DM.wall, acc = o.acc || DM.acc;
      var hexOf = o.mat ? (o.mat.color ? o.mat.color.getHex() : 0xcccccc) : DM.hex;
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
      /* v2.10: register the house and its MAIN door (doors[0]) for the number
         plate and the M map. The plate goes on the outside face, so the door
         point is on the wall face and the normal points out. */
      if (!o.noNumber && doors.length) {
        var md = doors[0], dl, dn;
        if (md[0] === 'n') { dl = [md[1], 0]; dn = [0, -1]; }
        else if (md[0] === 's') { dl = [md[1], D]; dn = [0, 1]; }
        else if (md[0] === 'w') { dl = [0, md[1]]; dn = [-1, 0]; }
        else { dl = [W, md[1]]; dn = [1, 0]; }
        var dw = F.P(dl[0], dl[1]), nv = (function () {
          var a = F.P(dl[0] + dn[0], dl[1] + dn[1]); return [a[0] - dw[0], a[1] - dw[1]];
        })();
        HOUSES.push({ x0: Math.min(c0[0], c1[0]), x1: Math.max(c0[0], c1[0]), z0: Math.min(c0[1], c1[1]), z1: Math.max(c0[1], c1[1]),
          cx: (c0[0] + c1[0]) / 2, cz: (c0[1] + c1[1]) / 2, door: [dw[0], dw[1], nv[0], nv[1]], y0: y0, hex: hexOf, d: DM.d.id, kind: o.kind || 'house' });
      }
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
    /* v2.10: the rampart, gates, plinth and fort walls in RED EARTH (pise, the
       Marrakech wall colour) instead of yellow ochre; the arches a lighter clay */
    var EARTH = pm(0xb4643f), EARTH2 = pm(0xc98a5a);
    seg(-100, 100, -0.40, 0, -100, 100, pm(0xb3aa9a), NCAST);
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
    seg(-99.5, 99.5, 0, RH, -99.5, -B, EARTH); seg(-99.5, 99.5, 0, RH, B, 99.5, EARTH);
    seg(-99.5, -B, 0, RH, -B, B, EARTH); seg(B, 99.5, 0, RH, -B, B, EARTH);
    seg(-B, B, RH - 1.1, RH - 0.8, -B, -B + 0.08, M.terracotta, NBOTH); seg(-B, B, RH - 1.1, RH - 0.8, B - 0.08, B, M.terracotta, NBOTH);
    seg(-B, -B + 0.08, RH - 1.1, RH - 0.8, -B + 0.08, B - 0.08, M.terracotta, NBOTH); seg(B - 0.08, B, RH - 1.1, RH - 0.8, -B + 0.08, B - 0.08, M.terracotta, NBOTH);
    for (var m = -96; m <= 96; m += 4) {
      seg(m - 0.9, m + 0.9, RH, RH + 1.3, -99.3, -97.2, EARTH, NBOTH); seg(m - 0.9, m + 0.9, RH, RH + 1.3, 97.2, 99.3, EARTH, NBOTH);
      seg(-99.3, -97.2, RH, RH + 1.3, m - 0.9, m + 0.9, EARTH, NBOTH); seg(97.2, 99.3, RH, RH + 1.3, m - 0.9, m + 0.9, EARTH, NBOTH);
    }
    /* buttresses: cover along the rampart lane (the lane stays 2 m clear) */
    [-80, -60, -42, 42, 60, 80].forEach(function (u) {
      seg(u - 0.7, u + 0.7, 0, 7, -B, -B + 1.0, EARTH); seg(u - 0.7, u + 0.7, 0, 7, B - 1.0, B, EARTH);
      seg(-B, -B + 1.0, 0, 7, u - 0.7, u + 0.7, EARTH); seg(B - 1.0, B, 0, 7, u - 0.7, u + 0.7, EARTH);
    });
    /* corner bastions — landmarks you navigate by, not places you climb */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      segx(c[0] * B, c[0] * 91, 0, 15, c[1] * B, c[1] * 91, EARTH);
      BLOCKS.push([Math.min(c[0] * B, c[0] * 91), Math.min(c[1] * B, c[1] * 91), Math.max(c[0] * B, c[0] * 91), Math.max(c[1] * B, c[1] * 91), '#8e4a30']);
      segx(c[0] * B, c[0] * 90.6, 15, 15.4, c[1] * B, c[1] * 90.6, M.terracotta, NCAST);
    });
    /* the four gates: a great blue door between two pylons, an arch over */
    function gate(ax) {             // ax: 'n','s','w','e'
      var s = (ax === 'n' || ax === 'w') ? -1 : 1;
      if (ax === 'n' || ax === 's') {
        segx(-7.2, -4.4, 0, 14, s * B, s * (B - 2.6), EARTH); segx(4.4, 7.2, 0, 14, s * B, s * (B - 2.6), EARTH);
        segx(-4.4, 4.4, 7.2, 9.6, s * B, s * (B - 2.2), EARTH);
        segx(-4.4, 4.4, 0, 7.2, s * B, s * (B - 0.18), M.doorPaint, NCAST);
        segx(-7.4, 7.4, 13.6, 14.2, s * (B + 0.1), s * (B - 2.8), M.terracotta, NCAST);
      } else {
        segx(s * B, s * (B - 2.6), 0, 14, -7.2, -4.4, EARTH); segx(s * B, s * (B - 2.6), 0, 14, 4.4, 7.2, EARTH);
        segx(s * B, s * (B - 2.2), 7.2, 9.6, -4.4, 4.4, EARTH);
        segx(s * B, s * (B - 0.18), 0, 7.2, -4.4, 4.4, M.doorPaint, NCAST);
        segx(s * (B + 0.1), s * (B - 2.8), 13.6, 14.2, -7.4, 7.4, M.terracotta, NCAST);
      }
    }
    ['n', 's', 'w', 'e'].forEach(gate);

    /* ============ THE SOUK SQUARE ============ */
    /* the fountain: an eight-metre basin, a column, a bowl */
    cyl(0, 0.4, 0, 3.4, 0.8, M.paperWhite);
    cyl(0, 0.83, 0, 3.05, 0.04, M.steelBlue, NBOTH);
    cyl(0, 2.1, 0, 0.42, 2.6, EARTH2);
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
        segx(-6.2, -3.8, 0, 6.6, s * 29, s * 31, EARTH2); segx(3.8, 6.2, 0, 6.6, s * 29, s * 31, EARTH2);
        segx(-3.8, 3.8, 4.8, 6.6, s * 29.2, s * 30.8, EARTH2);
        segx(-6.4, 6.4, 6.6, 7.0, s * 28.8, s * 31.2, M.terracotta, NCAST);
      } else {
        segx(s * 29, s * 31, 0, 6.6, -6.2, -3.8, EARTH2); segx(s * 29, s * 31, 0, 6.6, 3.8, 6.2, EARTH2);
        segx(s * 29.2, s * 30.8, 4.8, 6.6, -3.8, 3.8, EARTH2);
        segx(s * 28.8, s * 31.2, 6.6, 7.0, -6.4, 6.4, M.terracotta, NCAST);
      }
    }
    ['n', 's', 'w', 'e'].forEach(arch);
    /* kiosks in the square's corners: one-storey shops with terraces */
    house(-29, -29, 0, 10, 7.4, { stair: true, doors: [['n', 7.2], ['e', 3.7]], shop: false });
    house(19, -29, 0, 10, 7.4, { stair: true, doors: [['n', 7.2], ['w', 3.7]] });
    house(-29, 20, 2, 10, 7.4, { stair: true, doors: [['n', 7.2], ['e', 3.7]] });
    house(19, 20, 2, 10, 7.4, { stair: true, doors: [['n', 7.2], ['w', 3.7]] });

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
      seg(PX0, PX1, 0, PY, PZ0, PZ1, EARTH);
      BLOCKS.push([PX0, PZ0, PX1, PZ1, '#8e4a30']);   /* v2.10: the plinth on the M map (its houses draw over it) */
      seg(PX0 - 0.3, PX1 + 0.3, 0, 0.6, PZ0 - 0.3, PZ1 + 0.3, pm(0x8e5a40), NCAST);          // base course
      seg(PX0 - 0.08, PX1 + 0.08, PY - 0.35, PY - 0.2, PZ0 - 0.08, PZ1 + 0.08, M.terracotta, NBOTH);
      /* grand stairs: 10 x 0.30, 0.50 treads, 4 m wide */
      stairFlight(PX0 - 5.0, 0, -68, 1, 0, 10, 0.30, 0.5, 4.0, M.stair, { landing: false });
      META.flights.push([PX0 - 5.0, 0, -68, 1, 0, 10, 0.30, 0.5]);
      stairFlight(68, 0, PZ1 + 5.0, 0, -1, 10, 0.30, 0.5, 4.0, M.stair, { landing: false });
      META.flights.push([68, 0, PZ1 + 5.0, 0, -1, 10, 0.30, 0.5]);
      /* crenellated parapet with the two stair gaps */
      function crenel(x0, x1, z0, z1) {
        seg(x0, x1, PY, PY + 1.0, z0, z1, EARTH);
        var alongX = (x1 - x0) > (z1 - z0), L = alongX ? x1 - x0 : z1 - z0;
        for (var t = 0.8; t < L - 0.5; t += 2.4) {
          if (alongX) seg(x0 + t, x0 + t + 1.0, PY + 1.0, PY + 1.6, z0, z1, EARTH, NBOTH);
          else seg(x0, x1, PY + 1.0, PY + 1.6, z0 + t, z0 + t + 1.0, EARTH, NBOTH);
        }
      }
      crenel(PX0, PX1, PZ0, PZ0 + 0.4);                       // north
      crenel(PX0, 65.6, PZ1 - 0.4, PZ1); crenel(70.4, PX1, PZ1 - 0.4, PZ1);   // south, gap at x 68
      crenel(PX0, PX0 + 0.4, PZ0 + 0.4, -70.4); crenel(PX0, PX0 + 0.4, -65.6, PZ1 - 0.4);   // west, gap at z -68
      crenel(PX1 - 0.4, PX1, PZ0 + 0.4, PZ1 - 0.4);           // east
      overlay(PX0 + 0.4, PX1 - 0.4, PZ0 + 0.4, PZ1 - 0.4, PY + 0.004, M.sidewalk);
      META.open.push({ kind: 'plinth', x0: PX0 + 1.5, x1: PX1 - 1.5, z0: PZ0 + 1.5, z1: PZ1 - 1.5, y: PY });
      /* THE KEEP: 14 x 12, on the plinth, front (stair) facing south */
      house(60, -76, 0, 14, 11, { y0: PY, H: 4.6, stair: true, mat: pm(0xa65438), acc: pm(0x2f4a5c), kind: 'keep',
        doors: [['n', 7], ['w', 5.5], ['e', 5.5]], windows: true });
      /* keep merlons on its parapet top, paint */
      for (var kx = 60.6; kx < 73.6; kx += 2.2) { seg(kx, kx + 0.9, PY + 4.6 + 1.05, PY + 4.6 + 1.5, -76, -75.72, EARTH, NBOTH); }
      /* barracks along the north edge, and the armoury on the east */
      house(52, -84, 0, 13, 6.5, { y0: PY, H: 3.8, doors: [['s', 6.5], ['e', 3.2]], kind: 'barracks', bare: true });
      house(77, -72, 1, 12, 6.5, { y0: PY, H: 3.8, doors: [['s', 6], ['n', 6]], kind: 'armoury', bare: true });
      /* cannon on the plinth corners: barrel + carriage, cover */
      [[53, -53, 1], [83, -53, 1], [53, -82, -1], [83, -82, -1]].forEach(function (c) {
        box(c[0], PY + 0.45, c[1], 1.6, 0.9, 1.1, M.wood);
        box(c[0], PY + 1.05, c[1] + c[2] * 0.5, 0.5, 0.5, 2.4, M.dark, NCOL);
      });
      crates(56, -60, PY); jars(78, -58, 4, PY); crates(55, -70, PY);
      /* below: stables (open front), a ruined wall, palms, a dry trough */
      house(34, -92, 0, 14, 8, { H: 4.2, shop: true, doors: [['n', 7]], kind: 'stables' });
      seg(34, 46, 0, 2.2, -64, -63.4, EARTH); seg(34, 34.6, 0, 1.6, -63.4, -56, EARTH);
      seg(40, 46, 0, 1.2, -46, -45.4, EARTH);
      palm(38, -72); palm(44, -52); palm(88, -40); palm(54, -40); palm(72, -40);
      box(40, 0.4, -78, 4.0, 0.8, 1.0, M.paperWhite);
      cart(88, -60, Math.PI / 2); crates(86, -44);
      /* the lanes behind the plinth (north and east of it): a broken wall,
         stacked crates and jars, so the long run under the rampart is not a
         shooting gallery (verify-cover's worst cell there was 35 m) */
      seg(60, 66, 0, 1.2, -92, -91.4, EARTH); crates(72, -92.5); jars(83, -93.5, 3);
      seg(90, 90.6, 0, 1.4, -88, -80, EARTH); crates(92.5, -74); seg(88.5, 94, 0, 1.1, -68, -67.4, EARTH);
      META.open.push({ kind: 'yard', x0: 34, x1: 48, z0: -80, z1: -66 }, { kind: 'yard', x0: 52, x1: 92, z0: -46, z1: -36 });
    })();

    /* ============ SE — THE CARAVANSERAI ============
       A courtyard ring, x 38..88, z 40..90: four wings 7 m deep, one storey
       of 5.0 m with rooms off the courtyard; a gate through each wing,
       bridged at roof level, so the roof is ONE continuous ring. Two flights
       up from the courtyard. */
    (function () {
      var X0 = 38, X1 = 88, Z0 = 40, Z1 = 90, Dp = 7, H = 5.0, CM = pm(0xd98a8a);
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
          /* v2.10: each caravanserai room is numbered too — plate over its
             courtyard door, its own footprint on the M map */
          var rx0, rx1, rz0, rz1, door;
          if (alongX) {
            rx0 = t > 0 ? (c + doorsAt[t - 1]) / 2 : x0; rx1 = t < doorsAt.length - 1 ? (c + doorsAt[t + 1]) / 2 : x1; rz0 = z0; rz1 = z1;
            door = doorSide > 0 ? [c, z1, 0, 1] : [c, z0, 0, -1];
          } else {
            rz0 = t > 0 ? (c + doorsAt[t - 1]) / 2 : z0; rz1 = t < doorsAt.length - 1 ? (c + doorsAt[t + 1]) / 2 : z1; rx0 = x0; rx1 = x1;
            door = doorSide > 0 ? [x1, c, 1, 0] : [x0, c, -1, 0];
          }
          HOUSES.push({ x0: rx0, x1: rx1, z0: rz0, z1: rz1, cx: (rx0 + rx1) / 2, cz: (rz0 + rz1) / 2, door: door, y0: 0, hex: 0xd98a8a, d: 'caravan', kind: 'room' });
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
        .forEach(function (c) { seg(c[0], c[1], 0, H, c[2], c[3], CM); BLOCKS.push([c[0], c[2], c[1], c[3], '#b86f6f']); });
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
      house(-74, 58, 2, 16, 10, { H: 4.2, stair: true, mat: pm(0xf0ece4), acc: pm(0x2a8f8a), kind: 'hammam', doors: [['n', 8], ['e', 5]], bare: true });
      cyl(-66, 4.2 + 0.6, 63, 2.6, 1.2, M.paperWhite, NCAST);
      cyl(-66, 4.2 + 1.5, 63, 1.8, 0.6, M.paperWhite, NBOTH);
      cyl(-66, 4.2 + 2.0, 63, 0.9, 0.4, M.mint, NBOTH);
      /* THE TANNERY: x -90..-56, z 72..90 — a low-walled yard of dye pits,
         gaps north (x -78..-74), east (z 79..83) and south (x -79..-73) */
      seg(-90, -78, 0, 1.2, 72, 72.4, EARTH); seg(-74, -56, 0, 1.2, 72, 72.4, EARTH);
      seg(-90, -79, 0, 1.2, 89.6, 90, EARTH); seg(-73, -56, 0, 1.2, 89.6, 90, EARTH);
      seg(-90, -89.6, 0, 1.2, 72.4, 89.6, EARTH);
      seg(-56.4, -56, 0, 1.2, 72.4, 79, EARTH); seg(-56.4, -56, 0, 1.2, 83, 89.6, EARTH);
      META.open.push({ kind: 'pits', x0: -88, x1: -58, z0: 74, z1: 88 });
      var DYES = [M.maroon, M.ochre, M.mint, M.doorPaint, M.dustyPink, M.paleYellow, M.terracotta];
      for (var vx = -85; vx <= -61; vx += 6) {
        for (var vz = 76.5; vz <= 86.5; vz += 5) {
          cyl(vx, 0.45, vz, 1.35, 0.9, M.seatSand);
          cyl(vx, 0.92, vz, 1.1, 0.03, DYES[Math.floor(rnd() * DYES.length) % DYES.length], NBOTH);
        }
      }
      /* tannery houses with terraces over the pits — the viewing roofs */
      house(-52, 62, 3, 14, 9, { H: 7.6, stair: true, doors: [['s', 12], ['n', 7]] });
      house(-52, 79, 3, 12, 9, { H: 4.2, stair: true, pent: true, doors: [['s', 10.4], ['n', 6]] });
      house(-38, 62, 1, 12, 6, { H: 4.2, stair: true, doors: [['s', 10.4], ['n', 6]] });
      house(-38, 77, 1, 14, 6, { H: 7.6, stair: true, doors: [['s', 12.4], ['n', 7]] });
      jars(-90, 60, 6); crates(-55.5, 60);
    })();

    /* ============ THE RAMPART LANE: a little cover where it opens out ============ */
    crates(-88, 0 - 14); crates(88, 14); crates(14, -88); crates(-14, 88);
    jars(-88, 18, 3); jars(86, -20, 3);

    /* ===== v2.10 - EVERY HOUSE HAS A NUMBER =====
       Rahul: "every room on the map should have a number 01, jaise normal ghar
       mei hota h, aur harr ghar ke main gate ke upar ache se show ho ... player
       bolega ghar number 23 ke samne enemy hai, toh big map open kare toh
       waha ghar number 23 dhunda ja sake."
       Numbering runs DISTRICT BY DISTRICT (the order of DISTRICTS_K), and
       inside a district in rows north to south, west to east — so a quarter
       owns a block of numbers (Souk 01-04, Spice Row 05-...), and a number
       tells you the quarter before you open the map. Caravanserai rooms are
       numbered with their quarter. The SAME number is drawn over the main door
       (a blue zellige tile, white digits, readable across a street) and on
       the house's footprint on the M map and the dial. */
    var dOrder = {}; DISTRICTS_K.forEach(function (d, i) { dOrder[d.id] = i; });
    HOUSES.sort(function (a, b) {
      if (dOrder[a.d] !== dOrder[b.d]) return dOrder[a.d] - dOrder[b.d];
      var ra = Math.round(a.cz / 9), rb = Math.round(b.cz / 9);
      if (ra !== rb) return ra - rb;
      return a.cx - b.cx;
    });
    HOUSES.forEach(function (h, i) { h.n = i + 1; h.label = (h.n < 10 ? '0' : '') + h.n; });

    /* the plates: one atlas texture, one merged mesh, one draw call */
    var COLS = 16, ROWS = 8, CW = 128, CH = 64;
    var numMat = World._kasbahNumMat;
    if (!numMat) {
      var cv = document.createElement('canvas'); cv.width = COLS * CW; cv.height = ROWS * CH;
      var g = cv.getContext('2d');
      for (var ci = 0; ci < COLS * ROWS; ci++) {
        var gx = (ci % COLS) * CW, gy = Math.floor(ci / COLS) * CH, lab = (ci + 1 < 10 ? '0' : '') + (ci + 1);
        g.fillStyle = '#f4efe2'; g.fillRect(gx, gy, CW, CH);                 // white glazed rim
        g.fillStyle = '#1d4f9c'; g.fillRect(gx + 5, gy + 5, CW - 10, CH - 10);   // zellige blue
        g.strokeStyle = '#e0b030'; g.lineWidth = 3; g.strokeRect(gx + 9, gy + 9, CW - 18, CH - 18);
        g.fillStyle = '#ffffff'; g.font = 'bold 44px Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(lab, gx + CW / 2, gy + CH / 2 + 2);
      }
      var tex = new THREE.CanvasTexture(cv);
      if (THREE.LinearMipmapLinearFilter) tex.minFilter = THREE.LinearMipmapLinearFilter;
      numMat = World._kasbahNumMat = new THREE.MeshBasicMaterial({ map: tex });
    }
    var pos = [], uv = [], nrm = [], idx = [];
    HOUSES.forEach(function (h) {
      if (h.n > COLS * ROWS) return;
      var nx = h.door[2], nz = h.door[3], tx = -nz, tz = nx;          // outward normal, wall tangent
      var tall = h.kind === 'barracks' || h.kind === 'armoury';      // 3.8 m walls: the plate sits beside the door
      var cx = h.door[0] + nx * 0.07, cz = h.door[1] + nz * 0.07, cy = h.y0 + 3.46;
      if (tall) { cx += tx * (DW / 2 + 0.75); cz += tz * (DW / 2 + 0.75); cy = h.y0 + 2.2; }
      var hw = 0.44, hh = 0.22, base = pos.length / 3;
      /* corners: left-bottom, right-bottom, right-top, left-top as seen from outside */
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (k) {
        pos.push(cx - tx * hw * k[0], cy + hh * k[1], cz - tz * hw * k[0]);
        nrm.push(nx, 0, nz);
      });
      var ci2 = h.n - 1, u0 = (ci2 % COLS) / COLS, u1 = u0 + 1 / COLS;
      var v1 = 1 - Math.floor(ci2 / COLS) / ROWS, v0 = v1 - 1 / ROWS;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      /* a dark backing board, so the tile reads as fixed to the wall */
      segx(cx - tx * (hw + 0.05) - nx * 0.05, cx + tx * (hw + 0.05) - nx * 0.02, cy - hh - 0.05, cy + hh + 0.05,
           cz - tz * (hw + 0.05) - nz * 0.05, cz + tz * (hw + 0.05) - nz * 0.02, M.dark, NBOTH);
    });
    /* the gate harness (tools/_three-stub.js) has no BufferAttribute — the
       plates are paint, so a stub build simply goes without them */
    if (idx.length && THREE.Float32BufferAttribute) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      var plates = new THREE.Mesh(geo, numMat);
      plates.name = 'kasbahHouseNumbers'; plates.matrixAutoUpdate = false; plates.updateMatrix();
      plates.userData.noMerge = true;
      T.scene.add(plates);
    }

    /* ===== v2.10 - THE PLAN THE MAPS ARE DRAWN FROM =====
       Rahul: "mini map and big map ko ache se design karo, taki waha area bhi
       dikhe, roads sahi se aaye, kyunki bahot congested hai." The generic bake
       draws every collider that crosses chest height — on Kasbah that is every
       window jamb, crate, jar and cart: noise. Kasbah hands minimap.js a PLAN
       instead: quarters as colour washes with names, streets as streets,
       every house as one solid footprint in its own wall colour with its
       number, and the landmarks by name. */
    function hx(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
    World.mapPlan = {
      bg: '#2a2620',
      districts: META.districts,
      roads: [
        [-6, -B, 6, -30], [-6, 30, 6, B], [-B, -6, -30, 6], [30, -6, B, 6],              // the four avenues
        [-32, -94, -28, -30], [28, -94, 32, -30], [-32, 30, -28, 94], [28, 30, 32, 94],  // ring alley N/S runs
        [-94, -32, -30, -28], [30, -32, 94, -28], [-94, 28, -30, 32], [30, 28, 94, 32],  // ring alley E/W runs
        [-19.4, -94, -16.3, -30], [16.3, -94, 19.4, -30], [-19.4, 30, -16.3, 94], [16.3, 30, 19.4, 94],   // back lanes
        [-94, -19.4, -30, -16.3], [30, -19.4, 94, -16.3], [-94, 16.3, -30, 19.4], [30, 16.3, 94, 19.4],
        [-B, -B, B, -94], [-B, 94, B, B], [-B, -94, -94, 94], [94, -94, B, 94]             // the rampart lane
      ],
      plazas: [[-30, -30, 30, 30], [-74.5, -75, -46, -48.5], [45, 47, 81, 83], [50, -86, 86, -50]],
      green: [[-92, 36, -36, 56]],
      water: [[-79.6, 43.4, -46.4, 48.6], [-3.1, -3.1, 3.1, 3.1]],
      walls: [[-99.5, -99.5, 99.5, -B], [-99.5, B, 99.5, 99.5], [-99.5, -B, -B, B], [B, -B, 99.5, B]],
      blocks: META.blocks.concat(HOUSES.map(function (h) { return [h.x0, h.z0, h.x1, h.z1, hx(h.hex)]; })),
      houses: HOUSES.map(function (h) { return { n: h.n, label: h.label, x: h.cx, z: h.cz, d: h.d }; }),
      labels: [
        { t: 'FOUNTAIN', x: 0, z: 5.5 }, { t: 'THE KEEP', x: 67, z: -79 }, { t: 'WELL', x: -60, z: -58.5 },
        { t: 'HAMMAM', x: -66, z: 70.5 }, { t: 'DYE PITS', x: -73, z: 81.5 }, { t: 'POOL', x: -63, z: 46 },
        { t: 'PAVILION', x: -87, z: 53.8 },
        { t: 'N GATE', x: 0, z: -92 }, { t: 'S GATE', x: 0, z: 92 }, { t: 'W GATE', x: -91, z: 0 }, { t: 'E GATE', x: 91, z: 0 }
      ]
    };
  };
})();
