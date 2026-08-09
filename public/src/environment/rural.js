/* environment/rural.js — HOLLOW RIDGE.  v9.0

   A full redesign, not a widening. The old rural was a flat 220 m field whose
   "hills" were low plinths: nothing to climb, nothing to hold, and almost no
   reason to look up. This is 300 m across with real vertical structure, built
   to the same helper contract as Urban so every mode, every weapon, the bots
   and every validator work here unchanged.

   WHY IT IS SHAPED LIKE THIS

   Terrain is stepped terraces joined by real stair flights rather than sloped
   meshes. Three reasons, all load-bearing:

     1. The movement controller resolves against axis-aligned boxes. A sloped
        mesh needs a different collision path, and a second collision path is a
        second set of bugs.
     2. `stairFlight` registers with the validators. verify-climb and
        verify-access walk a real capsule up every registered flight, so a
        mountain built from flights is PROVEN climbable rather than hoped to
        be. A ramp mesh is invisible to both.
     3. Terraces give snipers flat ground to stand and go prone on, and give
        the people below hard edges to break line of sight against. A smooth
        slope gives neither.

   THE PLACES

   RIDGE (north-west)    the high ground. Four terraces to +30 m, switchbacks
                         on two separate faces so it can be contested from
                         either side, a through-cave at mid height, and a
                         summit shelf with a wall to shoot over.
   FALLS (north)         the ridge sheds water down three walkable shelves.
                         The fastest way off the ridge, if you are brave.
   LAKE (north-east)     open water, jetty, boathouse, stilt platform. Wadeable
                         at the rim, so it is a risky flank and not a wall.
   VILLAGE (south-west)  mud houses on lanes, walled yards, a well. The only
                         close-quarters fighting on the map.
   FARM / MILL (south-east) barn, silo, windmill, fields cut by hedgerows so
                         the long sightlines are broken.
   QUARRY (east)         a pit: the one place where the high ground is outside.

   Everything is Box / Cylinder / Cone, so StaticMerge still absorbs the map. */

World._buildRural = function (T) {
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight;
  var M = T.M, rnd = T.rnd, scene = T.scene;

  /* ---------------- materials ---------------- */
  function L(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function grassMat() {
    var c = document.createElement("canvas"); c.width = 128; c.height = 128;
    var g = c.getContext("2d");
    g.fillStyle = "#3f6b34"; g.fillRect(0, 0, 128, 128);
    for (var gi = 0; gi < 900; gi++) {
      g.fillStyle = ["#48793b", "#365f2c", "#54874a", "#2e5426"][(Math.random() * 4) | 0];
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(48, 48);
    return new THREE.MeshLambertMaterial({ map: t });
  }

  var GRASS = grassMat();
  var LEAF1 = L(0x2f4a30), LEAF2 = L(0x3a5c3a), LEAF3 = L(0x46683c);
  var BARK1 = L(0x4a3a28), BARK2 = L(0x6b5a44);
  var ROADMAT = new THREE.MeshLambertMaterial({ map: (M.dirt && M.dirt.map) || null });
  var ROCK = L(0x6d716b), ROCKD = L(0x565b55), SCREE = L(0x7d8179);
  var LOG = L(0x5a4630), CROP = L(0x4f7a3a), HAY = L(0xb9973f);
  var MUD = L(0x9b7a55), MUDD = L(0x7d5f40), THATCH = L(0xa8894a), CLAY = L(0x8a5a3c);
  var WATER = new THREE.MeshLambertMaterial({ color: 0x2c6f8f, transparent: true, opacity: 0.72 });
  var FOAM = new THREE.MeshLambertMaterial({ color: 0xcfe6ef, transparent: true, opacity: 0.5 });
  var NCOL = { collide: false };
  var NCAST = { cast: false };
  var NBOTH = { collide: false, cast: false };

  /* Map half-extent. Everything is authored against this, so widening later is
     one number rather than a hunt. */
  var HALF = 150;

  /* ================= BASE TERRAIN ================= */
  seg(-HALF, HALF, -1.6, -0.45, -HALF, HALF, M.dirt, NCAST);   // sub-floor / river bed

  /* Grass cut as rectangles around the water rather than one slab with holes,
     because a slab with holes is a slab with z-fighting. */
  seg(-HALF, HALF, -0.45, 0, -HALF, 40, GRASS, NCAST);
  seg(-HALF, HALF, -0.45, 0, 54, HALF, GRASS, NCAST);
  seg(-HALF, 62, -0.44, 0.005, -96, -40, GRASS, NCAST);
  seg(126, HALF, -0.44, 0.005, -96, -40, GRASS, NCAST);

  seg(-HALF, HALF, -0.2, -0.14, 40, 54, WATER, NBOTH);         // river
  seg(62, 126, -0.26, -0.14, -96, -40, WATER, NBOTH);          // lake

  /* ================= ROADS ================= */
  function road(x0, x1, z0, z1) { seg(x0, x1, 0.04, 0.09, z0, z1, ROADMAT, NBOTH); }
  road(-4, 4, -HALF, HALF);
  road(-HALF, -4, -4, 4); road(4, HALF, -4, 4);
  road(-108, -30, -70, -63);
  road(58, 130, -38, -32);
  road(-96, -40, 86, 92);
  road(40, 118, 74, 80);

  /* ================= THE RIDGE (north-west) =================
     Four terraces to +30 m. Two independent stair routes, because a single
     route means whoever holds the top holds it forever, and that is a queue
     rather than a fight. */
  var RX0 = -142, RX1 = -46, RZ0 = -142, RZ1 = -34;

  seg(RX0, RX1, -0.4, 6, RZ0, RZ1, ROCK);          // tier 1  +6
  seg(RX0, -60, -0.4, 13, RZ0, -48, ROCK);         // tier 2  +13
  seg(RX0, -76, -0.4, 21, RZ0, -62, ROCKD);        // tier 3  +21
  seg(RX0, -96, -0.4, 29.4, RZ0, -84, ROCKD);      // summit  +29.4 (= what the flight delivers)

  /* Route A — south face. 0.3 m risers against a 0.42 m auto-step, so every
     tread is walkable without jumping. Split into short flights: a validator
     walks each one, and short flights fail loudly instead of stalling silently
     halfway up a long one. */
  /* Each flight starts on open ground (or the tier below) and ends ON the tier
     above. The first pass put them INSIDE the mountain's own footprint, so the
     walker spawned buried in rock and never reached tread one. */
  stairFlight(-70, 0, -21.6, 0, -1, 20, 0.30, 0.62, 7, M.dirt);    // ground -> t1 (+6.0)
  stairFlight(-47, 6, -70, -1, 0, 24, 0.30, 0.60, 6, M.dirt);      // t1 -> t2 (+7.2)
  stairFlight(-61, 13, -100, -1, 0, 27, 0.30, 0.58, 6, M.dirt);    // t2 -> t3 (+8.1)
  stairFlight(-120, 21, -67.2, 0, -1, 30, 0.30, 0.56, 6, M.dirt);  // t3 -> summit

  /* Route B — east face. Longer, far more exposed, skips a tier. */
  stairFlight(-100, 0, -21.6, 0, -1, 20, 0.30, 0.62, 6, M.dirt);   // ground -> t1
  stairFlight(-47, 6, -110, -1, 0, 24, 0.30, 0.60, 6, M.dirt);     // t1 -> t2
  stairFlight(-61, 13, -134, -1, 0, 27, 0.30, 0.58, 6, M.dirt);    // t2 -> t3

  /* THE CAVE — a through-route at tier 2 so the ridge is not solid, and cover
     for anyone crossing beneath the summit guns. */
  seg(-120, -84, 13, 13.4, -60, -44, ROCKD, NCAST);
  seg(-120, -84, 6, 13, -62, -60, ROCKD);
  seg(-120, -84, 6, 13, -44, -42, ROCKD);
  cyl(-112, 9.4, -52, 0.5, 6.8, ROCK);
  cyl(-96, 9.4, -52, 0.5, 6.8, ROCK);

  /* Summit furniture: a wind-break to shoot over, and a cairn. Prone behind it,
     standing over it — which is why a sniper perch gets a lip and not a cliff. */
  seg(-134, -100, 29.4, 30.5, -100, -99, ROCKD);
  seg(-134, -133, 29.4, 30.5, -140, -99, ROCKD);
  cyl(-118, 30.8, -112, 1.5, 2.8, SCREE);
  cyl(-118, 32.6, -112, 0.9, 1.4, SCREE);

  for (var s1 = 0; s1 < 44; s1++) {
    cyl(RX0 + rnd() * (RX1 - RX0), 0.35, RZ1 + rnd() * 9, 0.5 + rnd() * 1.4, 0.7 + rnd() * 1.2, SCREE, NCOL);
  }

  /* ================= THE FALLS (ridge -> lake) ================= */
  function shelf(x0, x1, z0, z1, top) {
    seg(x0, x1, -0.4, top, z0, z1, ROCKD);
    seg(x0 + 0.6, x1 - 0.6, top, top + 0.05, z0 + 0.4, z1 - 0.4, WATER, NBOTH);
  }
  shelf(-44, -26, -100, -86, 21);
  shelf(-26, -8, -96, -80, 13);
  shelf(-8, 10, -92, -74, 6);

  seg(-27, -25, 13, 21, -96, -86, WATER, NBOTH);
  seg(-9, -7, 6, 13, -92, -80, WATER, NBOTH);
  seg(9, 11, 0, 6, -88, -74, WATER, NBOTH);
  for (var f1 = 0; f1 < 20; f1++) {
    cyl(-26 + rnd() * 2, 12 + rnd() * 9, -92 + rnd() * 6, 0.5 + rnd(), 1.2, FOAM, NBOTH);
    cyl(10 + rnd() * 2, 1 + rnd() * 5, -84 + rnd() * 8, 0.5 + rnd(), 1.2, FOAM, NBOTH);
  }
  seg(10, 62, -0.2, -0.14, -80, -72, WATER, NBOTH);           // outflow to the lake

  /* ================= THE LAKE (north-east) ================= */
  seg(62, 126, -0.42, -0.3, -96, -90, GRASS, NCAST);          // wadeable rim
  seg(62, 126, -0.42, -0.3, -46, -40, GRASS, NCAST);

  seg(70, 74, 0, 0.9, -60, -40, M.wood);                      // jetty
  seg(70, 92, 0, 0.9, -62, -60, M.wood);
  seg(88, 104, 0, 4.6, -40, -28, M.wood);                     // boathouse
  seg(88.4, 103.6, 4.6, 5.0, -39.6, -28.4, M.wood, NCAST);
  seg(92, 100, 0.9, 3.4, -40.2, -39.8, M.wood, NBOTH);
  /* The boathouse deck step used to sit here. It climbed 1.8 m AWAY from the
     building and landed on nothing — verify-stairs-quality caught it as a
     flight with no arrival, which is exactly what it was. The boathouse floor
     is at ground level and needs no steps. */

  var STX = 106, STZ = -70;                                   // stilt platform
  cyl(STX - 3, 1.6, STZ - 3, 0.3, 3.2, LOG);
  cyl(STX + 3, 1.6, STZ - 3, 0.3, 3.2, LOG);
  cyl(STX - 3, 1.6, STZ + 3, 0.3, 3.2, LOG);
  cyl(STX + 3, 1.6, STZ + 3, 0.3, 3.2, LOG);
  seg(STX - 4, STX + 4, 3.2, 3.5, STZ - 4, STZ + 4, M.wood);
  seg(STX - 4, STX + 4, 3.5, 4.4, STZ - 4, STZ - 3.6, M.wood);
  stairFlight(STX + 10, 0, STZ, -1, 0, 12, 0.3, 0.5, 2.4, M.wood);

  for (var r1 = 0; r1 < 80; r1++) {
    var ra = rnd() * Math.PI * 2, rr = 26 + rnd() * 6;
    var rx = 94 + Math.cos(ra) * rr, rz = -68 + Math.sin(ra) * rr * 0.85;
    if (rx < 62 || rx > 126) continue;
    cyl(rx, 0.7, rz, 0.1, 1.4, LEAF3, NBOTH);
  }

  /* ================= RIVER CROSSINGS ================= */
  function bridge(x0, x1) {
    seg(x0, x1, 0.6, 0.86, 38, 56, M.wood);
    seg(x0, x1, 0.86, 1.75, 38, 38.4, M.wood, NCOL);
    seg(x0, x1, 0.86, 1.75, 55.6, 56, M.wood, NCOL);
    cyl(x0 + 1, 0.3, 41, 0.28, 1.2, LOG); cyl(x1 - 1, 0.3, 41, 0.28, 1.2, LOG);
    cyl(x0 + 1, 0.3, 53, 0.28, 1.2, LOG); cyl(x1 - 1, 0.3, 53, 0.28, 1.2, LOG);
    stairFlight(x0 + 0.5, 0, 36.6, 0, -1, 2, 0.3, 0.7, 5, M.wood);
    stairFlight(x0 + 0.5, 0, 57.4, 0, 1, 2, 0.3, 0.7, 5, M.wood);
  }
  bridge(-8, 8); bridge(-92, -76); bridge(84, 100);
  for (var fd = 0; fd < 7; fd++) cyl(40 + fd * 2.2, 0.1, 41 + fd * 1.9, 1.1, 0.5, ROCK);

  /* ================= MUD VILLAGE (south-west) ================= */
  function mudHouse(cx, cz, w, d, tall) {
    var h = tall ? 4.6 : 3.3, hw = w / 2, hd = d / 2;
    seg(cx - hw, cx + hw, 0, h, cz - hd, cz - hd + 0.45, MUD);
    seg(cx - hw, cx + hw, 0, h, cz + hd - 0.45, cz + hd, MUD);
    seg(cx - hw, cx - hw + 0.45, 0, h, cz - hd, cz + hd, MUDD);
    seg(cx + hw - 0.45, cx + hw, 0, h, cz - hd, cz + hd, MUDD);
    seg(cx - 0.9, cx + 0.9, 0, 2.2, cz + hd - 0.5, cz + hd + 0.05, MUD, NBOTH);   // doorway
    seg(cx - hw - 0.5, cx + hw + 0.5, h, h + 0.55, cz - hd - 0.5, cz + hd + 0.5, THATCH, NCAST);
    seg(cx - hw - 0.2, cx + hw + 0.2, h + 0.55, h + 1.1, cz - 1.2, cz + 1.2, THATCH, NCAST);
    seg(cx - hw - 0.02, cx - hw + 0.47, 1.5, 2.3, cz - 1.4, cz - 0.4, CLAY, NBOTH);
    if (tall) stairFlight(cx + hw + 9.0, 0, cz, -1, 0, 17, 0.3, 0.5, 2.2, M.wood);
  }
  function yardWall(x0, x1, z0, z1) { seg(x0, x1, 0, 1.35, z0, z1, MUDD); }

  mudHouse(-96, 74, 11, 9, true);
  mudHouse(-78, 80, 9, 8, false);
  mudHouse(-60, 72, 10, 9, true);
  mudHouse(-96, 100, 9, 8, false);
  mudHouse(-74, 104, 12, 10, true);
  mudHouse(-52, 96, 9, 9, false);
  mudHouse(-114, 90, 10, 8, false);
  mudHouse(-36, 84, 9, 8, true);

  yardWall(-104, -86, 84, 84.5); yardWall(-104, -103.5, 84, 96);
  yardWall(-70, -50, 86, 86.5);  yardWall(-70, -69.5, 62, 86);
  yardWall(-44, -26, 92, 92.5);  yardWall(-26.5, -26, 76, 92);
  yardWall(-124, -106, 68, 68.5);

  cyl(-84, 0.75, 90, 2.1, 1.5, ROCK);                          // the well
  cyl(-84, 2.9, 90, 0.16, 2.8, LOG);
  cyl(-84, 4.3, 90, 1.4, 0.3, M.wood, NCOL);

  for (var vv = 0; vv < 14; vv++) {
    cyl(-118 + rnd() * 84, 0.55, 64 + rnd() * 44, 0.6 + rnd() * 0.3, 1.1, HAY);
  }
  seg(-90, -86, 0, 1.1, 60, 64, M.wood);
  cyl(-90, 0.5, 60.5, 0.55, 0.2, LOG); cyl(-86, 0.5, 60.5, 0.55, 0.2, LOG);

  /* ================= FARM + MILL (south-east) ================= */
  var BX = 74, BZ = 92;
  seg(BX - 8, BX + 8, 0, 6.2, BZ - 10, BZ - 9.4, CLAY);
  seg(BX - 8, BX - 7.4, 0, 6.2, BZ - 10, BZ + 10, CLAY);
  seg(BX + 7.4, BX + 8, 0, 6.2, BZ - 10, BZ + 10, CLAY);
  seg(BX - 8, BX + 8, 4.2, 6.2, BZ + 9.4, BZ + 10, CLAY);
  seg(BX - 8.4, BX + 8.4, 6.2, 6.8, BZ - 10.4, BZ + 10.4, M.wood, NCAST);
  seg(BX - 7.4, BX + 1, 3.0, 3.3, BZ - 9.4, BZ + 1, M.wood);
  stairFlight(BX + 7.1, 0, BZ - 4, -1, 0, 11, 0.3, 0.55, 2.6, M.wood);
  for (var hb = 0; hb < 9; hb++) {
    seg(BX - 6 + hb * 1.4, BX - 5 + hb * 1.4, 3.3, 4.1, BZ - 8 + (hb % 3) * 2, BZ - 7 + (hb % 3) * 2, HAY);
  }

  cyl(94, 5.5, 88, 4.2, 11, M.concrete);                       // silo
  cyl(94, 11.3, 88, 4.4, 0.6, M.metal, NCOL);
  stairFlight(114.4, 0, 88, -1, 0, 38, 0.3, 0.42, 1.8, M.metal);
  seg(89.6, 98.4, 11.0, 11.3, 83.6, 92.4, M.metal);

  var WX = 118, WZ = 52;                                       // windmill
  cyl(WX, 6, WZ, 3.4, 12, MUD);
  cyl(WX, 12.4, WZ, 3.6, 0.8, THATCH, NCOL);
  stairFlight(WX, 0, WZ + 20.4, 0, -1, 42, 0.3, 0.4, 1.8, M.wood);
  seg(WX - 3.6, WX + 3.6, 12.0, 12.3, WZ - 3.6, WZ + 3.6, M.wood);
  seg(WX - 0.5, WX + 0.5, 9.5, 17.5, WZ - 4.1, WZ - 3.9, M.wood, NBOTH);
  seg(WX - 0.5, WX + 0.5, 1.5, 9.5, WZ - 4.1, WZ - 3.9, M.wood, NBOTH);
  seg(WX - 8, WX - 0.5, 9.0, 10.0, WZ - 4.1, WZ - 3.9, M.wood, NBOTH);
  seg(WX + 0.5, WX + 8, 9.0, 10.0, WZ - 4.1, WZ - 3.9, M.wood, NBOTH);

  for (var fx = 0; fx < 5; fx++) {                             // fields + hedgerows
    seg(30 + fx * 16, 42 + fx * 16, 0, 0.5, 100, 138, CROP, NCOL);
    seg(30 + fx * 16, 30.6 + fx * 16, 0, 1.6, 100, 138, LEAF2, NCOL);
  }
  seg(24, 130, 0, 1.5, 66, 66.6, LEAF1, NCOL);
  seg(24, 130, 0, 1.5, 98, 98.6, LEAF1, NCOL);

  /* ================= QUARRY (east) ================= */
  /* Spoil heaps rather than a walled pit. A 3.2 m lip with stairs cut through
     it is a box you fall into; heaps give the same broken, quarried feel while
     staying walkable from every side. */
  seg(96, 138, -0.4, 0.02, 2, 34, ROCKD, NCAST);
  seg(96, 138, 0, 1.4, 0, 1.4, ROCK);
  seg(96, 138, 0, 1.4, 34.6, 36, ROCK);
  seg(94, 95.4, 0, 1.4, 0, 36, ROCK);
  for (var qb = 0; qb < 16; qb++) {
    var qx = 100 + rnd() * 32, qz = 5 + rnd() * 26;
    seg(qx, qx + 1.6 + rnd() * 2, 0, 0.8 + rnd() * 1.6, qz, qz + 1.6 + rnd() * 2, ROCK);
  }

  /* ================= LOGGING CAMP (north, mid) ================= */
  function logPile(cx, cz, ew) {
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j <= i; j++) {
        var yy = 0.45 + (2 - i) * 0.82, off = (j - i / 2) * 0.9;
        box(cx + (ew ? 0 : off), yy, cz + (ew ? off : 0), ew ? 5 : 0.8, 0.8, ew ? 0.8 : 5, LOG);
      }
    }
  }
  logPile(18, -46, 0); logPile(26, -50, 1); logPile(12, -56, 0); logPile(30, -40, 1);
  seg(6, 22, 0, 3.4, -66, -58, M.wood);
  seg(5.6, 22.4, 3.4, 3.8, -66.4, -57.6, M.metal, NCAST);
  seg(10, 18, 0, 2.3, -58.4, -58, M.wood, NBOTH);
  for (var st = 0; st < 18; st++) cyl(4 + rnd() * 34, 0.3, -70 + rnd() * 34, 0.6, 0.6, LOG);

  /* STAIR APPROACHES RUN FROM OUTSIDE THE PLATFORM THEY SERVE.

     `World._stairwells()` punches a hole through any floor a flight passes
     through — correct behaviour, and what stops Urban's staircases being capped
     by their own landings. The first pass here started every flight directly
     above the deck it climbed to, so the cutter ate the deck: watchtower
     platforms, the barn loft and the silo top all built fine and then vanished
     from the collider set, which reads in game as falling straight through a
     solid-looking floor.

     Every flight below therefore starts far enough out that its run ENDS at the
     platform edge rather than crossing it. run = steps * stepDepth. */

  /* ================= WATCHTOWERS ================= */
  function tower(bx, bz) {
    cyl(bx - 2, 2.4, bz - 2, 0.24, 4.8, LOG); cyl(bx + 2, 2.4, bz - 2, 0.24, 4.8, LOG);
    cyl(bx - 2, 2.4, bz + 2, 0.24, 4.8, LOG); cyl(bx + 2, 2.4, bz + 2, 0.24, 4.8, LOG);
    seg(bx - 2.6, bx + 2.6, 4.8, 5.1, bz - 2.6, bz + 2.6, M.wood);
    seg(bx - 2.6, bx + 2.6, 5.1, 6.0, bz - 2.6, bz - 2.2, M.wood, NCOL);
    seg(bx - 2.6, bx + 2.6, 5.1, 6.0, bz + 2.2, bz + 2.6, M.wood, NCOL);
    seg(bx - 2.8, bx + 2.8, 6.6, 7.0, bz - 2.8, bz + 2.8, M.wood, NCAST);
    stairFlight(bx + 11.1, 0, bz, -1, 0, 17, 0.3, 0.5, 2.2, M.wood);
  }
  tower(-30, -30); tower(46, 18); tower(-24, 118); tower(120, -20);

  /* ================= SCATTERED ROCK COVER ================= */
  function boulder(x, z, s) {
    cyl(x, s * 0.5, z, s * 0.9, s, ROCK);
    cyl(x + s * 0.5, s * 0.35, z - s * 0.4, s * 0.55, s * 0.7, ROCKD, NCOL);
  }
  var BOULDERS = [
    [-20, -18, 1.6], [-14, 20, 1.3], [22, -12, 1.8], [58, 40, 1.5],
    [-40, 40, 1.4], [70, 10, 1.7], [-58, 24, 1.5], [34, 66, 1.6],
    [-120, 20, 1.9], [-118, -12, 1.5], [110, 100, 1.7], [-8, -110, 1.6],
    [46, -100, 1.4], [130, 120, 1.8], [-132, 118, 1.6], [86, 130, 1.5]
  ];
  for (var bi = 0; bi < BOULDERS.length; bi++) boulder(BOULDERS[bi][0], BOULDERS[bi][1], BOULDERS[bi][2]);

  /* ================= FIELD COVER =================
     Thinning the treeline to fit the triangle budget left a third of the map
     with nothing to hide behind — 32% dead ground against a 6% budget, which in
     a shooter means a third of the map is a killing floor with no counterplay.

     The answer is boxes, not more trees. A tree is three or four primitives
     including cones; a drystone wall segment is one box at twelve triangles.
     Walls and outcrops also make BETTER cover than trunks: you can crouch
     behind them, break line of sight along them, and they channel movement
     instead of just interrupting it. */
  function drystone(x, z, len, ew, h) {
    h = h || 1.15;
    if (ew) seg(x - len / 2, x + len / 2, 0, h, z - 0.35, z + 0.35, ROCK);
    else seg(x - 0.35, x + 0.35, 0, h, z - len / 2, z + len / 2, ROCK);
  }
  function outcrop(x, z, s2) {
    seg(x - s2, x + s2 * 0.6, 0, s2 * 1.1, z - s2 * 0.7, z + s2, ROCK);
    seg(x - s2 * 0.4, x + s2, 0, s2 * 0.7, z - s2, z + s2 * 0.5, ROCKD);
  }
  /* Deterministic scatter across the open ground, skipping anything already
     built. Walls run along one axis so they read as field boundaries rather
     than random blocks. */
  for (var cw = 0; cw < 80; cw++) {
    var cx2 = -142 + rnd() * 284, cz2 = -142 + rnd() * 284;
    if (blocked(cx2, cz2) || onStairCorridor(cx2, cz2)) continue;
    if (rnd() < 0.62) drystone(cx2, cz2, 20 + rnd() * 22, rnd() < 0.5, 0.95 + rnd() * 0.6);
    else outcrop(cx2, cz2, 1.6 + rnd() * 1.6);
  }
  /* COVER ON THE RIDGE ITSELF. The terraces were excluded from the scatter
     because `blocked` guards the whole mountain footprint, which left four
     large flat shelves with nothing on them — the worst dead ground on the map
     and, worse, a sniper perch with no cover for the sniper. Outcrops are
     placed per tier at that tier's height so they sit ON the shelf. */
  /* KEEP-CLEAR CORRIDORS. Random scatter plus fixed staircases is a fragile
     pairing: any change upstream shifts the RNG stream, a rock lands on a stair
     mouth, and a route that passed yesterday is blocked today with nothing in
     the diff to explain it. The stair corridors are therefore excluded
     explicitly rather than left to luck. */
  function onStairCorridor(x, z) {
    if (z > -72 && z < -60 && x > -126 && x < -114) return true;   // t3 -> summit
    if (x > -50 && x < -40 && z > -76 && z < -64) return true;     // t1 -> t2 (A)
    if (x > -64 && x < -54 && z > -106 && z < -94) return true;    // t2 -> t3 (A)
    if (x > -50 && x < -40 && z > -116 && z < -104) return true;   // t1 -> t2 (B)
    if (x > -64 && x < -54 && z > -140 && z < -128) return true;   // t2 -> t3 (B)
    if (x > -76 && x < -64 && z > -28 && z < -14) return true;     // ground -> t1 (A)
    if (x > -106 && x < -94 && z > -28 && z < -14) return true;    // ground -> t1 (B)
    return false;
  }
  function tierRocks(x0, x1, z0, z1, top, n) {
    for (var i = 0; i < n; i++) {
      var rx2 = x0 + rnd() * (x1 - x0), rz2 = z0 + rnd() * (z1 - z0);
      if (onStairCorridor(rx2, rz2)) continue;
      var sc = 0.9 + rnd() * 1.3;
      seg(rx2 - sc, rx2 + sc * 0.7, top, top + sc * 1.15, rz2 - sc * 0.7, rz2 + sc, ROCK);
      if (rnd() < 0.5) seg(rx2 - sc * 0.5, rx2 + sc, top, top + sc * 0.7, rz2 - sc, rz2 + sc * 0.4, ROCKD);
    }
  }
  tierRocks(-140, -50, -140, -38, 6, 12);      // tier 1
  tierRocks(-140, -64, -140, -52, 13, 9);     // tier 2
  tierRocks(-140, -80, -140, -66, 21, 7);     // tier 3
  tierRocks(-140, -100, -140, -88, 29.4, 5);   // summit

  /* RIVERBANKS AND ROAD VERGES.

     `blocked` bans cover on the river band and both roads, which is right — you
     do not want a wall in the middle of a ford. But that banned band is 26 m
     wide running the full width of the map, plus two 12 m road corridors, and
     between them they were most of the remaining dead ground: long open lanes
     with nothing to break line of sight.

     Cover goes on the BANKS and the VERGES instead: beside the water, beside
     the road, never on them. That keeps the crossings open and readable while
     giving anyone moving along them something to duck behind. */
  for (var rb = -140; rb < 140; rb += 30) {
    if (Math.abs(rb) > 8) {
      drystone(rb, 36.5, 22 + rnd() * 8, true, 1.1);     // north bank
      drystone(rb + 5, 57.5, 22 + rnd() * 8, true, 1.1); // south bank
    }
    if (Math.abs(rb) > 10 && !blocked(rb, 8.5)) drystone(rb, 8.5, 20 + rnd() * 8, true, 1.05);
    if (Math.abs(rb) > 10 && !blocked(rb, -8.5)) drystone(rb, -8.5, 20 + rnd() * 8, true, 1.05);
    if (Math.abs(rb) > 10 && !blocked(8.5, rb)) drystone(8.5, rb, 20 + rnd() * 8, false, 1.05);
    if (Math.abs(rb) > 10 && !blocked(-8.5, rb)) drystone(-8.5, rb, 20 + rnd() * 8, false, 1.05);
  }

  /* Hedgerow grid through the widest empty quarters — the north-east flats and
     the south-central meadow, which were the two worst dead zones. */
  for (var hx = -30; hx < 60; hx += 26) {
    if (!blocked(hx, -20)) drystone(hx, -20, 24, true, 1.1);
    if (!blocked(hx, 16)) drystone(hx, 16, 24, true, 1.1);
  }
  for (var hz = -30; hz < 30; hz += 26) {
    if (!blocked(52, hz)) drystone(52, hz, 24, false, 1.1);
    if (!blocked(-40, hz)) drystone(-40, hz, 24, false, 1.1);
  }

  /* ================= TREES =================
     Trunks collide, canopies never do — hard cover versus concealment. */
  function blocked(x, z) {
    if (Math.abs(x) < 6 && Math.abs(z) < HALF) return true;
    if (Math.abs(z) < 6 && Math.abs(x) < HALF) return true;
    if (z > 34 && z < 60) return true;
    if (x > 56 && x < 132 && z > -102 && z < -34) return true;
    if (x > RX0 - 4 && x < RX1 + 6 && z > RZ0 - 4 && z < RZ1 + 8) return true;
    if (x > -46 && x < 14 && z > -104 && z < -70) return true;
    if (x > -126 && x < -28 && z > 56 && z < 114) return true;
    if (x > 60 && x < 106 && z > 78 && z < 106) return true;
    if (x > 108 && x < 128 && z > 42 && z < 62) return true;
    if (x > 92 && x < 140 && z > -2 && z < 38) return true;
    if (x > 2 && x < 36 && z > -72 && z < -36) return true;
    if (x > 24 && x < 132 && z > 96 && z < 140) return true;
    return false;
  }
  function cone(x, y, z, r, h, mat) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    m.position.set(x, y, z); m.castShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m);
  }
  function tree(x, z, s, kind) {
    kind = (kind === undefined) ? (rnd() * 5) | 0 : kind;
    var bark = [BARK1, BARK2, M.wood][(rnd() * 3) | 0];
    if (kind === 0) {
      cyl(x, 1.2 * s, z, 0.2 * s, 2.4 * s, bark);
      cone(x, 3.5 * s, z, 1.5 * s, 2.3 * s, LEAF1);
      cone(x, 4.6 * s, z, 1.05 * s, 1.8 * s, LEAF2);
    } else if (kind === 1) {
      cyl(x, 2.3 * s, z, 0.17 * s, 4.6 * s, bark);
      cone(x, 5.2 * s, z, 1.15 * s, 1.9 * s, LEAF1);
      cone(x, 6.1 * s, z, 0.9 * s, 1.6 * s, LEAF2);
      cone(x, 6.9 * s, z, 0.6 * s, 1.2 * s, LEAF1);
    } else if (kind === 2) {
      cyl(x, 1.05 * s, z, 0.24 * s, 2.1 * s, bark);
      cyl(x, 2.9 * s, z, 1.75 * s, 1.7 * s, LEAF2, NCOL);
      cyl(x, 4.0 * s, z, 1.15 * s, 1.0 * s, LEAF1, NCOL);
    } else if (kind === 3) {
      cyl(x, 0.85 * s, z, 0.34 * s, 1.7 * s, bark);
      cyl(x - 0.7 * s, 2.5 * s, z + 0.3 * s, 1.35 * s, 1.5 * s, LEAF1, NCOL);
      cyl(x + 0.75 * s, 2.7 * s, z - 0.35 * s, 1.2 * s, 1.4 * s, LEAF2, NCOL);
      cyl(x, 3.5 * s, z, 1.0 * s, 1.2 * s, LEAF1, NCOL);
    } else {
      cyl(x, 1.7 * s, z, 0.22 * s, 3.4 * s, BARK2);
      box(x + 0.9 * s, 2.9 * s, z, 1.9 * s, 0.16 * s, 0.16 * s, BARK2, { rotY: 0.5, collide: false });
      box(x - 0.8 * s, 2.3 * s, z + 0.4 * s, 1.6 * s, 0.14 * s, 0.14 * s, BARK2, { rotY: 2.2, collide: false });
      box(x, 3.3 * s, z - 0.7 * s, 0.14 * s, 0.14 * s, 1.5 * s, BARK2, { collide: false });
    }
  }
  function belt(x0, x1, z0, z1, n) {
    for (var i = 0; i < n; i++) {
      var x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (blocked(x, z)) continue;
      tree(x, z, 0.85 + rnd() * 0.7);
    }
  }
  belt(-146, -60, 10, 60, 24);
  belt(-30, 30, -140, -100, 20);
  belt(30, 100, -140, -104, 18);
  belt(-146, -60, 112, 146, 18);
  belt(-20, 40, 60, 96, 16);
  belt(120, 146, -20, 80, 14);
  belt(40, 90, -30, 30, 13);
  belt(-60, -10, -28, 20, 12);
  belt(60, 130, 104, 146, 14);

  /* ================= PERIMETER =================
     A treeline rather than an invisible wall: the edge of the world should look
     like somewhere you would not bother going, not like a bug. */
  for (var pw = -HALF + 4; pw < HALF - 4; pw += 9.5) {   // v9.0: halved, it is scenery
    tree(pw + rnd() * 2, -HALF + 2 + rnd() * 3, 1.1 + rnd() * 0.5, 1);
    tree(pw + rnd() * 2, HALF - 2 - rnd() * 3, 1.1 + rnd() * 0.5, 1);
    tree(-HALF + 2 + rnd() * 3, pw + rnd() * 2, 1.1 + rnd() * 0.5, 1);
    tree(HALF - 2 - rnd() * 3, pw + rnd() * 2, 1.1 + rnd() * 0.5, 1);
  }
};
