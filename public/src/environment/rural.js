/* RURAL map — dense forest, dirt roads, terraced hills, rivers with wooden
   bridges, cabins, barns, watchtowers, farm, village, logging area.
   Same +-100 bounds and helper contract as Urban; rivers are walkable 0.4m
   recesses (fords) crossed dry via bridges. All static geometry funnels
   through T.seg/T.box/T.cyl so colliders, minimap capture, surface tags,
   and the StaticMerge pass work unchanged. */
World._buildRural = function (T) {
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight;
  var M = T.M, rnd = T.rnd, scene = T.scene;

  // ---- local palette (Lambert only, so StaticMerge absorbs everything) ----
  function L(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function grassMat() {
    var c = document.createElement("canvas"); c.width = 128; c.height = 128;
    var g = c.getContext("2d");
    g.fillStyle = "#4a6339"; g.fillRect(0, 0, 128, 128);
    for (var gi = 0; gi < 900; gi++) {
      g.fillStyle = ["#3e5731", "#557242", "#42603a", "#5d7a48"][gi & 3];
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2 + Math.random() * 3);
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // uvScale() in world.js already tiles every 2m; repeat=4 -> one tile per
    // 0.5m. The old value (48) meant ~24 tiles per metre, which mip-collapsed
    // to flat paint at any distance and shimmered under motion.
    t.repeat.set(4, 4);
    t.anisotropy = 8;   // clamped to hardware max by three on upload
    return new THREE.MeshLambertMaterial({ map: t });
  }
  var GRASS = grassMat(), LEAF1 = L(0x2f4a30), LEAF2 = L(0x3a5c3a);
  var BARK1 = L(0x4a3a28), BARK2 = L(0x6b5a44);   // trunk variety
  // No polygonOffset: depth bias on a ground-level slab at grazing angles is
  // what blanked this map in-browser before. Clearance is geometric instead
  // (roads sit 4cm above the grass top, see below).
  var ROADMAT = new THREE.MeshLambertMaterial({ map: (M.dirt && M.dirt.map) || null });
  var ROCK = L(0x6d716b), LOG = L(0x5a4630), CROP = L(0x4f7a3a);
  var WATER = new THREE.MeshLambertMaterial({ color: 0x2c6f8f, transparent: true, opacity: 0.75 });

  /* ================= TERRAIN ================= */
  // base slab (doubles as river floor), then grass top everywhere EXCEPT rivers
  seg(-110, 110, -1, -0.4, -110, 110, M.dirt, { cast: false });
  // river A: east-west band z[36,48]; river B: north-south x[50,60] down to A
  seg(-110, 50, -0.4, 0, -110, 36, GRASS, { cast: false });   // NW grass
  seg(60, 110, -0.4, 0, -110, 36, GRASS, { cast: false });    // NE grass
  seg(-110, 110, -0.4, 0, 48, 110, GRASS, { cast: false });   // S grass
  // water surfaces (visual only)
  seg(-110, 110, -0.14, -0.1, 36, 48, WATER, { collide: false, cast: false });
  seg(50, 60, -0.14, -0.1, -110, 36, WATER, { collide: false, cast: false });

  // dirt roads (visual strips). Bottom at 0.04 = 4cm of clear air above the
  // grass top (y=0). At near=0.08/far=320 the 24-bit depth step only reaches
  // 4cm past ~230m, which is beyond the fogged-out distance — so no fight.
  seg(-3.5, 3.5, 0.04, 0.09, -100, 100, ROADMAT, { collide: false, cast: false });
  seg(-100, -3.5, 0.04, 0.09, -3.5, 3.5, ROADMAT, { collide: false, cast: false });
  seg(3.5, 100, 0.04, 0.09, -3.5, 3.5, ROADMAT, { collide: false, cast: false });

  /* ================= BRIDGES (wood = metal-free footsteps) ================= */
  function bridge(x0, x1, z0, z1) {
    seg(x0, x1, 0.02, 0.28, z0, z1, M.wood);                       // deck
    seg(x0, x0 + 0.12, 0.28, 1.15, z0, z1, M.wood);                // rails
    seg(x1 - 0.12, x1, 0.28, 1.15, z0, z1, M.wood);
    cyl(x0 + 0.3, -0.2, z0 + 1, 0.14, 1.0, M.wood);
    cyl(x1 - 0.3, -0.2, z1 - 1, 0.14, 1.0, M.wood);
  }
  bridge(-5, 5, 35, 49);          // main road over river A
  bridge(-49, -41, 35, 49);       // west crossing
  function bridgeEW(z0, z1, x0, x1) {
    seg(x0, x1, 0.02, 0.28, z0, z1, M.wood);
    seg(x0, x1, 0.28, 1.15, z0, z0 + 0.12, M.wood);
    seg(x0, x1, 0.28, 1.15, z1 - 0.12, z1, M.wood);
  }
  bridgeEW(-24, -16, 49, 61);     // east crossing over river B

  /* ================= HILLS (terraced, ramp access) ================= */
  // NW hill: three tiers, watchtower on the summit
  seg(-84, -42, 0, 1.2, -80, -38, GRASS);
  seg(-76, -48, 1.2, 2.4, -72, -44, GRASS);
  seg(-70, -54, 2.4, 3.6, -66, -50, GRASS);
  stairFlight(-62, 0, -36.6, 0, -1, 4, 0.3, 0.55, 6, M.dirt);     // ground -> t1
  stairFlight(-62, 1.2, -42.6, 0, -1, 4, 0.3, 0.55, 5, M.dirt);   // t1 -> t2
  stairFlight(-62, 2.4, -48.6, 0, -1, 4, 0.3, 0.55, 4, M.dirt);   // t2 -> t3
  // SE hill: two tiers
  seg(48, 80, 0, 1.1, 48, 80, GRASS);
  seg(54, 74, 1.1, 2.2, 54, 74, GRASS);
  stairFlight(64, -0.4, 46.05, 0, 1, 5, 0.3, 0.55, 6, M.dirt);   // starts on the ford floor
  stairFlight(64, 1.1, 52.6, 0, 1, 4, 0.28, 0.55, 5, M.dirt);

  /* ================= WATCHTOWERS ================= */
  function tower(bx, bz, baseY) {
    var platY = baseY + 3.9;
    [-1.6, 1.6].forEach(function (dx) {
      [-1.6, 1.6].forEach(function (dz) {
        cyl(bx + dx, baseY + (platY - baseY) / 2 + 0.15, bz + dz, 0.13, platY - baseY + 0.3, M.wood);
      });
    });
    seg(bx - 2.3, bx + 2.3, platY, platY + 0.3, bz - 2.3, bz + 2.3, M.wood);      // platform
    seg(bx - 2.3, bx + 2.3, platY + 0.3, platY + 1.25, bz - 2.3, bz - 2.18, M.wood); // rails (3 sides; stair side open)
    seg(bx - 2.3, bx + 2.3, platY + 0.3, platY + 1.25, bz + 2.18, bz + 2.3, M.wood);
    seg(bx - 2.3, bx - 2.18, platY + 0.3, platY + 1.25, bz - 2.3, bz + 2.3, M.wood);
    seg(bx - 2.5, bx + 2.5, platY + 2.9, platY + 3.15, bz - 2.5, bz + 2.5, M.wood, { collide: false }); // roof
    // stair climbs TOWARD the deck; posts + stringer kill the floating-tread look
    stairFlight(bx + 8.85, baseY, bz, -1, 0, 13, 0.3, 0.5, 1.4, M.wood);
    seg(bx + 6.7, bx + 8.85, baseY, baseY + 1.35, bz - 0.7, bz + 0.7, M.wood, { collide: false });
    seg(bx + 4.5, bx + 6.7, baseY, baseY + 2.65, bz - 0.7, bz + 0.7, M.wood, { collide: false });
    seg(bx + 2.35, bx + 4.5, baseY, baseY + 3.9, bz - 0.7, bz + 0.7, M.wood, { collide: false });
  }
  tower(-64.5, -58, 3.6); // NW summit — the long sniping lane (stair base kept on t3, x<=-54)
  tower(40, 26, 0);       // village overwatch, west bank (was inside river B)
  tower(-38, 30, 0);      // river approach

  /* ================= CABIN / BARN BUILDERS ================= */
  function cabin(cx, cz, w, d) {
    var hw = w / 2, hd = d / 2, t = 0.22, H = 2.6;
    seg(cx - hw, cx + hw, 0, 0.15, cz - hd, cz + hd, M.wood);                    // floor
    // front wall (z-) with door gap
    seg(cx - hw, cx - 0.6, 0.15, H, cz - hd, cz - hd + t, M.wood);
    seg(cx + 0.6, cx + hw, 0.15, H, cz - hd, cz - hd + t, M.wood);
    seg(cx - 0.6, cx + 0.6, 2.2, H, cz - hd, cz - hd + t, M.wood);
    seg(cx - hw, cx + hw, 0.15, H, cz + hd - t, cz + hd, M.wood);                // back
    // side walls with one window gap each
    [[cx - hw, cx - hw + t], [cx + hw - t, cx + hw]].forEach(function (xx) {
      seg(xx[0], xx[1], 0.15, H, cz - hd, cz - 0.7, M.wood);
      seg(xx[0], xx[1], 0.15, H, cz + 0.7, cz + hd, M.wood);
      seg(xx[0], xx[1], 0.15, 1.1, cz - 0.7, cz + 0.7, M.wood);
      seg(xx[0], xx[1], 1.9, H, cz - 0.7, cz + 0.7, M.wood);
    });
    seg(cx - hw - 0.3, cx + hw + 0.3, H, H + 0.25, cz - hd - 0.3, cz + hd + 0.3, M.wood); // roof
  }
  function barn(cx, cz) { // 10 wide x 13 deep, open south front, rear loft + stair
    var hw = 5, hd = 6.5, H = 5, t = 0.25;
    seg(cx - hw, cx + hw, 0, 0.15, cz - hd, cz + hd, M.wood);
    seg(cx - hw, cx + hw, 0.15, H, cz + hd - t, cz + hd, M.wood);                // back
    seg(cx - hw, cx - hw + t, 0.15, H, cz - hd, cz + hd, M.wood);                // sides
    seg(cx + hw - t, cx + hw, 0.15, H, cz - hd, cz + hd, M.wood);
    cyl(cx - hw + 0.3, 2.5, cz - hd + 0.3, 0.16, 5, M.wood);                     // front posts
    cyl(cx + hw - 0.3, 2.5, cz - hd + 0.3, 0.16, 5, M.wood);
    seg(cx - hw - 0.4, cx + hw + 0.4, H, H + 0.35, cz - hd - 0.4, cz + hd + 0.4, M.rust); // roof
    seg(cx - hw, cx + hw, 2.35, 2.55, cz, cz + hd, M.wood);                      // rear loft
    seg(cx - hw, cx + hw, 2.55, 3.4, cz - 0.1, cz, M.wood, { collide: true });   // loft rail
    stairFlight(cx - hw + 0.9, 0.15, cz - 0.6, 0, 1, 8, 0.3, 0.5, 1.3, M.wood);  // loft stair
  }

  /* ================= VILLAGE (center-east) ================= */
  cabin(24, -8, 5, 6); cabin(33, -9, 5.5, 6); cabin(42, -6, 5, 6.5);
  cabin(27, 7, 5, 6); cabin(38, 8, 6, 6);
  cyl(31, 0.55, 1, 0.9, 1.1, ROCK);                                              // well
  seg(20, 46, 0, 0.9, 12.9, 13, M.wood);                                          // village fence bits
  seg(19.9, 20, 0, 0.9, -13, 13, M.wood);

  /* ================= FARM (south-west) ================= */
  cabin(-64, 66, 7, 8);                                                           // farmhouse
  barn(-52, 74);
  cyl(-44, 3.5, 63, 2.2, 7, M.rust);                                              // silo
  seg(-44 - 2.2, -44 + 2.2, 7, 7.35, 63 - 2.2, 63 + 2.2, M.rust, { collide: false });
  for (var cr = 0; cr < 5; cr++)                                                  // crop rows
    seg(-70, -50, 0, 0.28, 56 + cr * 1.6, 56.9 + cr * 1.6, CROP, { collide: false });
  seg(-72, -40, 0, 0.9, 52, 52.1, M.wood);                                        // farm fence
  seg(-72, -71.9, 0, 0.9, 52, 86, M.wood);

  /* ================= LOGGING AREA (north-east) ================= */
  function logPile(cx, cz, ry) {
    var rows = [[3, 0.28], [2, 0.83], [1, 1.38]];
    rows.forEach(function (r) {
      for (var i = 0; i < r[0]; i++)
        box(cx + (i - (r[0] - 1) / 2) * 0.6, r[1], cz, 0.55, 0.55, 4.2, LOG, { rotY: ry });
    });
  }
  logPile(55, -70, 0.3); logPile(63, -62, 1.8); logPile(70, -74, 0.1);
  // sawmill: open shed
  cyl(56, 1.6, -57, 0.15, 3.2, M.wood); cyl(64, 1.6, -57, 0.15, 3.2, M.wood);
  cyl(56, 1.6, -51, 0.15, 3.2, M.wood); cyl(64, 1.6, -51, 0.15, 3.2, M.wood);
  seg(55, 65, 3.2, 3.5, -58, -50, M.rust, { collide: false });
  for (var st = 0; st < 8; st++)
    cyl(46 + rnd() * 36, 0.25, -84 + rnd() * 30, 0.38, 0.5, LOG);                 // stumps
  cabin(75, -60, 5, 6);                                                            // logger cabin

  /* ================= ROCKS (hard cover) ================= */
  var rocks = [[-15, -53], [12, -72], [38, 40], [-66, 52], [80, -20], [-30, 32],
               [8, 52], [88, 84], [-90, 82], [-12, 14], [26, 30], [34, 66], [86, -46], [-88, -18]];
  rocks.forEach(function (r) {
    box(r[0], 0.7, r[1], 1.6 + rnd() * 1.2, 1.4 + rnd() * 1.2, 1.4 + rnd(), ROCK, { rotY: rnd() * 3.14 });
    box(r[0] + 1.1, 0.4, r[1] + 0.7, 0.9, 0.8, 0.9, ROCK, { rotY: rnd() * 3.14 });
  });

  /* ================= FOREST ================= */
  var blockedRects = [
    [-4.5, 4.5, -101, 101], [-101, 101, -4.5, 4.5],          // roads
    [-101, 101, 34, 50], [48, 62, -101, 50],                  // rivers + banks
    [18, 50, -16, 18], [-80, -36, 50, 90],                    // village, farm
    [42, 90, -90, -46],                                       // logging
    [-86, -40, -82, -36], [46, 82, 46, 82],                   // hills
    [33, 51, 19, 33]                                          // relocated village watchtower
  ];
  var blockedDiscs = [];                                       // filled from data below
  function blocked(x, z) {
    for (var i = 0; i < blockedRects.length; i++) {
      var r = blockedRects[i];
      if (x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3]) return true;
    }
    for (var j = 0; j < blockedDiscs.length; j++) {
      var d = blockedDiscs[j];
      var dx = x - d[0], dz = z - d[1];
      if (dx * dx + dz * dz < d[2] * d[2]) return true;
    }
    return false;
  }
  // keep trees off spawns, airdrops, loot, towers, rocks
  (CFG.MAPS_RURAL ? CFG.MAPS_RURAL.SPAWNS : []).forEach(function (s) { blockedDiscs.push([s[0], s[1], 3.2]); });
  (CFG.MAPS_RURAL ? CFG.MAPS_RURAL.AIRDROP_POINTS : []).forEach(function (a) { blockedDiscs.push([a[0], a[1], 6]); });
  (CFG.MAPS_RURAL ? CFG.MAPS_RURAL.LOOT_POINTS : []).forEach(function (p) { blockedDiscs.push([p[0], p[2], 1.4]); });
  [[-62, -58], [50, 8], [-38, 30]].forEach(function (t2) { blockedDiscs.push([t2[0], t2[1], 5.5]); });
  rocks.forEach(function (r) { blockedDiscs.push([r[0], r[1], 2.6]); });

  function cone(x, y, z, r, h, mat) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
  }
  /* Five tree silhouettes instead of one. Trunks collide (hard cover),
     canopies never do (concealment only) — same contract as before, just more
     shapes. Box/Cylinder/Cone only, so StaticMerge still absorbs every piece. */
  var NCOL = { collide: false };
  function tree(x, z, s, kind) {
    kind = (kind === undefined) ? (rnd() * 5) | 0 : kind;
    var bark = [BARK1, BARK2, M.wood][(rnd() * 3) | 0];
    if (kind === 0) {                                  // classic conifer
      cyl(x, 1.2 * s, z, 0.2 * s, 2.4 * s, bark);
      cone(x, 3.5 * s, z, 1.5 * s, 2.3 * s, LEAF1);
      cone(x, 4.6 * s, z, 1.05 * s, 1.8 * s, LEAF2);
    } else if (kind === 1) {                           // tall bare-trunked pine
      cyl(x, 2.3 * s, z, 0.17 * s, 4.6 * s, bark);
      cone(x, 5.2 * s, z, 1.15 * s, 1.9 * s, LEAF1);
      cone(x, 6.1 * s, z, 0.9 * s, 1.6 * s, LEAF2);
      cone(x, 6.9 * s, z, 0.6 * s, 1.2 * s, LEAF1);
    } else if (kind === 2) {                           // broadleaf, rounded crown
      cyl(x, 1.05 * s, z, 0.24 * s, 2.1 * s, bark);
      cyl(x, 2.9 * s, z, 1.75 * s, 1.7 * s, LEAF2, NCOL);
      cyl(x, 4.0 * s, z, 1.15 * s, 1.0 * s, LEAF1, NCOL);
    } else if (kind === 3) {                           // squat oak, lumpy crown
      cyl(x, 0.85 * s, z, 0.34 * s, 1.7 * s, bark);
      cyl(x - 0.7 * s, 2.5 * s, z + 0.3 * s, 1.35 * s, 1.5 * s, LEAF1, NCOL);
      cyl(x + 0.75 * s, 2.7 * s, z - 0.35 * s, 1.2 * s, 1.4 * s, LEAF2, NCOL);
      cyl(x, 3.5 * s, z, 1.0 * s, 1.2 * s, LEAF1, NCOL);
    } else {                                           // dead snag, bare branches
      cyl(x, 1.7 * s, z, 0.22 * s, 3.4 * s, BARK2);
      box(x + 0.9 * s, 2.9 * s, z, 1.9 * s, 0.16 * s, 0.16 * s, BARK2, { rotY: 0.5, collide: false });
      box(x - 0.8 * s, 2.3 * s, z + 0.4 * s, 1.6 * s, 0.14 * s, 0.14 * s, BARK2, { rotY: 2.2, collide: false });
      box(x, 3.3 * s, z - 0.7 * s, 0.14 * s, 0.14 * s, 1.5 * s, BARK2, { collide: false });
    }
  }
  function belt(x0, x1, z0, z1, n) {
    var placed = 0, tries = 0;
    while (placed < n && tries < n * 14) {
      tries++;
      var x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (blocked(x, z)) continue;
      tree(x, z, 0.85 + rnd() * 0.55);
      placed++;
    }
  }
  belt(-98, -62, -34, 48, 26);      // west forest
  belt(-58, 16, -98, -50, 26);      // north forest
  belt(8, 44, 20, 96, 18);          // south-center woods
  belt(64, 98, -40, 40, 16);        // east woods
  belt(-98, -84, 50, 96, 8);        // far SW fringe
  belt(-34, 4, 52, 96, 12);         // south meadow copses
  belt(8, 44, -44, -12, 12);        // mid clusters
  // bushes: concealment, no collision. Now clustered into hides of 2-4 rather
  // than lone cones, and three sizes, so they read as real undergrowth.
  for (var bu = 0; bu < 78; bu++) {
    var bx2 = -96 + rnd() * 192, bz2 = -96 + rnd() * 192;
    if (blocked(bx2, bz2)) continue;
    var clump = 1 + ((rnd() * 3) | 0);
    for (var cb = 0; cb < clump; cb++) {
      var sc = 0.7 + rnd() * 0.8;
      cone(bx2 + (rnd() - 0.5) * 2.6, 0.5 * sc, bz2 + (rnd() - 0.5) * 2.6,
        0.9 * sc, 1.1 * sc, rnd() < 0.5 ? LEAF1 : LEAF2);
    }
  }

  /* =============== RURAL COVER PASS (v5.0) ===============
     Same data-driven approach as the Urban outskirts pass: walk a grid, ask the
     LIVE collider set whether that ground already has body-blocking cover, and
     only fill what is genuinely exposed. Rural pieces are hard cover (you can
     shoot from behind them), unlike bushes which only conceal. */
  (function ruralCover() {
    var cols = World.colliders;
    function hasCoverNear(x, z, rad) {
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        if (c[4] < 0.5 || c[4] > 3.5) continue;
        if (c[3] - c[0] > 30 || c[5] - c[2] > 30) continue;
        var dx = Math.max(c[0] - x, 0, x - c[3]);
        var dz = Math.max(c[2] - z, 0, z - c[5]);
        if (dx * dx + dz * dz < rad * rad) return true;
      }
      return false;
    }
    function boulders(x, z) {
      box(x, 0.75, z, 1.7 + rnd() * 1.1, 1.5 + rnd(), 1.5 + rnd(), ROCK, { rotY: rnd() * 3.14 });
      box(x + 1.2, 0.45, z - 0.8, 1.0, 0.9, 1.0, ROCK, { rotY: rnd() * 3.14 });
    }
    function haystack(x, z) {
      cyl(x, 0.85, z, 1.25, 1.7, CROP);
      if (rnd() < 0.5) cyl(x + 2.6, 0.85, z + 0.6, 1.25, 1.7, CROP);
    }
    function logPile(x, z) {
      for (var i = 0; i < 3; i++)
        box(x, 0.3 + i * 0.52, z + (i & 1) * 0.3, 0.52, 0.52, 4.4, LOG, { rotY: rnd() * 0.5 });
    }
    function stoneWall(x, z, alongX) {
      seg(x - (alongX ? 3.2 : 0.3), x + (alongX ? 3.2 : 0.3), 0, 1.05,
        z - (alongX ? 0.3 : 3.2), z + (alongX ? 0.3 : 3.2), ROCK);
    }
    function blind(x, z) {            // hunting blind: 3 walls, open front
      seg(x - 1.3, x + 1.3, 0, 1.45, z + 1.15, z + 1.3, M.wood);
      seg(x - 1.3, x - 1.15, 0, 1.45, z - 1.3, z + 1.3, M.wood);
      seg(x + 1.15, x + 1.3, 0, 1.45, z - 1.3, z + 1.3, M.wood);
      seg(x - 1.5, x + 1.5, 2.05, 2.2, z - 1.5, z + 1.5, M.wood, { collide: false });
      cyl(x - 1.2, 1.02, z - 1.2, 0.09, 2.05, M.wood, { collide: false });
      cyl(x + 1.2, 1.02, z - 1.2, 0.09, 2.05, M.wood, { collide: false });
    }
    function shack(x, z) {            // tiny stone hut you can stand inside
      seg(x - 2.1, x + 2.1, 0, 2.35, z - 2.0, z - 1.85, ROCK);
      seg(x - 2.1, x + 2.1, 0, 2.35, z + 1.85, z + 2.0, ROCK);
      seg(x - 2.1, x - 1.95, 0, 2.35, z - 2.0, z + 2.0, ROCK);
      seg(x + 1.95, x + 2.1, 0, 2.35, z - 2.0, z + 0.6, ROCK);   // doorway
      seg(x - 2.35, x + 2.35, 2.35, 2.6, z - 2.25, z + 2.25, M.wood, { collide: false });
    }
    var kinds = [boulders, haystack, logPile, blind, shack, stoneWall, boulders, logPile];
    var placed = 0;
    for (var gx = -94; gx <= 94 && placed < 96; gx += 7) {
      for (var gz = -94; gz <= 94 && placed < 96; gz += 7) {
        var x = gx + (rnd() - 0.5) * 4.5, z = gz + (rnd() - 0.5) * 4.5;
        if (blocked(x, z)) continue;                 // roads, rivers, village, farm...
        if (hasCoverNear(x, z, 11)) continue;
        var k = kinds[(rnd() * kinds.length) | 0];
        if (k === stoneWall) stoneWall(x, z, rnd() < 0.5);
        else k(x, z);
        placed++;
      }
    }
  })();
  // fallen trees: long logs as low cover
  [[-24, -34, 0.4], [18, 62, 1.2], [-8, -78, 2.2], [72, 30, 0.9]].forEach(function (f) {
    box(f[0], 0.3, f[1], 0.5, 0.5, 5.2, LOG, { rotY: f[2] });
  });

  /* ================= PERIMETER ================= */
  seg(-101, 101, 0, 3, -103, -101, ROCK);
  seg(-101, 101, 0, 3, 101, 103, ROCK);
  seg(-103, -101, 0, 3, -101, 101, ROCK);
  seg(101, 103, 0, 3, -101, 101, ROCK);
};
