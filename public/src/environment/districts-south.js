/* District: south expansion (construction site, row houses, rail yard,
   office roof access). Receives shared build helpers via the T contract
   from environment/world.js — the template for future V4.2 districts. */
World._buildPart3 = function (T) {
  var seg = T.seg, box = T.box, cyl = T.cyl, stairFlight = T.stairFlight, facade = T.facade, win = T.win;
  var container = T.container, crates = T.crates, brokenWall = T.brokenWall, lamp = T.lamp, barrel = T.barrel;
  var M = T.M, rnd = T.rnd, scene = T.scene;

  /* ===== SUNKEN TUNNEL  x[45.4,48.6] z[-28,-9], floor -2.55 ===== */
  (function () {
    seg(45.4, 48.6, -2.85, -2.55, -28, -9, M.concrete);      // floor
    seg(45.1, 45.4, -2.85, 0, -28, -9, M.concrete);          // west wall
    seg(48.6, 48.9, -2.85, 0, -28, -9, M.concrete);          // east wall
    stairFlight(47, -2.55, -24.66, 0, -1, 9, 0.284, 0.36, 3.0, M.concrete); // north portal
    stairFlight(47, -2.55, -12.34, 0, 1, 9, 0.284, 0.36, 3.0, M.concrete);  // south portal
    seg(45.2, 48.8, -0.08, 0.24, -23, -13, M.concrete);      // roof (walk over it)
    [-21, -18, -15].forEach(function (z) {                    // support ribs
      seg(45.4, 48.6, -0.45, -0.08, z - 0.15, z + 0.15, M.trim);
    });
    var tl = new THREE.PointLight(0xffb35c, 0.85, 15, 1.5);
    tl.position.set(47, -1.05, -18); scene.add(tl);
    World.flickers.push(tl);
    barrel(44.3, -26.5, true); barrel(49.8, -10.2, true);    // portal markers
  })();

  /* ===== CONSTRUCTION SITE  x[-20,20] z[-70,-52] ===== */
  (function () {
    seg(-21, 21, 0.004, 0.016, -71, -51, M.concrete, { collide: false, cast: false }); // slab pad
    // skeleton building: 8 columns, 2 open slabs (no walls) — long sightlines
    [-12, -4, 4, 12].forEach(function (x) {
      [-66, -58].forEach(function (z) {
        seg(x - 0.25, x + 0.25, 0, 6.9, z - 0.25, z + 0.25, M.concrete);
      });
    });
    seg(-13, 13, 3.2, 3.5, -67, -57, M.concrete);   // slab 1
    seg(-13, 13, 6.6, 6.9, -67, -57, M.concrete);   // slab 2 — open sniper deck
    // exterior scaffold stairs on east edge (lane x[13.05,14.35])
    stairFlight(13.7, 0, -56.6, 0, -1, 11, 0.291, 0.34, 1.3, M.metal);       // ground -> slab 1
    stairFlight(13.7, 3.5, -62.2, 0, -1, 10, 0.34, 0.34, 1.3, M.metal);      // slab 1 -> slab 2
    seg(14.36, 14.44, 0.9, 7.4, -66, -56.4, M.trim);                          // scaffold sheeting (fall guard)
    // cover on the decks
    box(-8, 7.35, -62, 0.9, 0.9, 0.9, M.wood); box(-7.8, 8.1, -62.1, 0.65, 0.6, 0.65, M.wood);
    box(6, 7.35, -60, 0.9, 0.9, 0.9, M.wood);
    box(0, 7.35, -64, 0.9, 0.9, 0.9, M.wood);
    seg(-6, -2, 3.5, 4.15, -59, -58.2, M.dirt);                               // cement bags on slab 1
    // tower crane
    seg(-17.5, -14.5, 0, 2.4, -65.5, -62.5, M.concrete);
    [[-16.8, -64.8], [-15.2, -64.8], [-16.8, -63.2], [-15.2, -63.2]].forEach(function (p) {
      seg(p[0] - 0.09, p[0] + 0.09, 2.4, 15, p[1] - 0.09, p[1] + 0.09, M.rust);
    });
    box(-8, 14.8, -64, 19, 0.55, 0.7, M.rust, { collide: false });            // jib
    box(-20.5, 14.8, -64, 6.5, 0.55, 0.7, M.rust, { collide: false });        // counter-jib
    box(-2, 12.2, -64, 0.06, 4.6, 0.06, M.dark, { collide: false });          // hook cable
    // site props
    box(-19, 0.55, -55, 1.3, 1.1, 1.5, M.rust); cyl(-19, 1.55, -55, 0.62, 1.0, M.metal); // mixer
    box(8, 0.42, -68.4, 4, 0.84, 0.95, M.metal);                              // pipe stack
    crates(-6, -53.5); crates(10, -55.8);
    box(19, 1.1, -66, 1.1, 2.2, 1.1, M.contBlue); box(19, 1.1, -64.5, 1.1, 2.2, 1.1, M.contBlue); // porta booths
    // site fencing with entrance gaps
    [[-21, -13], [-9, 3], [7, 21]].forEach(function (r) { seg(r[0], r[1], 0, 1.9, -51.66, -51.58, M.metal); });
    [[-70, -63], [-59, -51.6]].forEach(function (r) { seg(-21.06, -20.98, 0, 1.9, r[0], r[1], M.metal); });
    [[-70, -64], [-58, -51.6]].forEach(function (r) { seg(20.98, 21.06, 0, 1.9, r[0], r[1], M.metal); });
    lamp(0, -50.2, 's');
    var cl = new THREE.PointLight(0xcfe0ff, 0.7, 22, 1.7);
    cl.position.set(0, 8.6, -62); scene.add(cl);
  })();

  /* ===== DEPOT B  x[52,68] z[-12,16]  h10 — big east warehouse ===== */
  (function () {
    var X0 = 52, X1 = 68, Z0 = -12, Z1 = 16, TT = 0.35, TOP = 9.9;
    facade('x', X0, X0 + TT, Z0, Z1, 0, TOP, M.metal, [
      { u0: -6, u1: 0, v0: 0, v1: 4.5 }, { u0: 8, u1: 12, v0: 0, v1: 3 },
      win(-10, 6, 2, 1.6), win(3, 6, 2, 1.6), win(13, 6, 2, 1.6)
    ]);
    facade('x', X1 - TT, X1, Z0, Z1, 0, TOP, M.metal, [win(-9, 6, 2, 1.6), win(-1, 6, 2, 1.6), win(7, 6, 2, 1.6)]);
    facade('z', Z0, Z0 + TT, X0, X1, 0, TOP, M.metal, [{ u0: 56, u1: 58, v0: 0, v1: 2.6 }, win(53, 6, 2, 1.6), win(61, 6, 2, 1.6)]);
    facade('z', Z1 - TT, Z1, X0, X1, 0, TOP, M.metal, [win(55, 6, 2, 1.6), win(63, 6, 2, 1.6)]);
    seg(X0, X1, TOP, TOP + 0.3, Z0, Z1, M.roof);
    // roof parapet with a gap where the exterior stair arrives
    seg(X0, 65.5, 10.2, 10.75, 15.78, Z1, M.metal);
    seg(X0, X1, 10.2, 10.75, Z0, Z0 + 0.22, M.metal);
    seg(X0, X0 + 0.22, 10.2, 10.75, Z0, Z1, M.metal);
    seg(X1 - 0.22, X1, 10.2, 10.75, Z0, Z1, M.metal);
    // mezzanine along north half + rail + stair
    seg(52.35, 67.65, 4.0, 4.25, -11.65, -4, M.metal);
    seg(52.35, 67.65, 4.25, 5.25, -4.06, -3.98, M.trim);
    stairFlight(53, 0, 0.82, 0, -1, 13, 0.308, 0.34, 1.2, M.metal);
    // tall pallet racks (3 rows)
    [4, 8, 12].forEach(function (z) {
      seg(54, 62, 0, 1.15, z - 0.5, z + 0.5, M.wood);
      seg(54, 62, 2.0, 2.15, z - 0.5, z + 0.5, M.wood);
      seg(54, 62, 3.1, 3.25, z - 0.5, z + 0.5, M.wood);
      seg(54, 54.15, 1.15, 3.1, z - 0.5, z + 0.5, M.trim);
      seg(61.85, 62, 1.15, 3.1, z - 0.5, z + 0.5, M.trim);
    });
    crates(65, -9); barrel(66.5, 14.6, true); barrel(53.6, 14.8, false);
    // exterior stair to the roof (south face) — the long-climb sniper perch
    stairFlight(53.2, 0, 16.9, 1, 0, 17, 0.3, 0.33, 1.2, M.metal);
    seg(58.8, 60.4, 5.1, 5.35, 16.3, 17.55, M.metal);
    stairFlight(60.4, 5.35, 16.9, 1, 0, 16, 0.303, 0.33, 1.2, M.metal);
    seg(65.6, 67.6, 10.2, 10.45, 16.1, 17.55, M.metal);
    seg(59.55, 59.65, 0, 5.1, 17.4, 17.5, M.trim); // landing support post
    // roof cover
    box(56, 10.72, 2, 2, 1.05, 1.6, M.metal); box(63, 10.68, -6, 1.8, 0.95, 1.5, M.rust);
    var dl = new THREE.PointLight(0xffb35c, 1.0, 26, 1.5);
    dl.position.set(60, 7.4, 2); scene.add(dl);
    World.flickers.push(dl);
    lamp(50.4, 10, 'e');
  })();

  /* ===== ROW HOUSES (south)  z[54,63], three houses ===== */
  function rowHouse(cx, roofAccess) {
    var X0 = cx - 5, X1 = cx + 5, Z0 = 54, Z1 = 63, TT = 0.28;
    var floors = [[0, 3.35], [3.35, 6.5]];
    for (var f = 0; f < 2; f++) {
      var base = f * 3.35, top = (f === 0) ? 3.35 : 6.2;
      var front = [win(cx - 3.9, base + 1.05, 1.3, 1.15), win(cx + 2.6, base + 1.05, 1.3, 1.15)];
      if (f === 0) front.push({ u0: cx - 0.65, u1: cx + 0.65, v0: 0, v1: 2.25 });
      else front.push({ u0: cx - 0.65, u1: cx + 0.65, v0: 3.4, v1: 5.65 }); // balcony door
      facade('z', Z0, Z0 + TT, X0, X1, base, top, M.brick, front);
      var back = (f === 0)
        ? [{ u0: cx + 2.2, u1: cx + 3.4, v0: 0, v1: 2.25 }]
        : [win(cx - 3.5, base + 1.05, 1.3, 1.15), win(cx + 1.2, base + 1.05, 1.3, 1.15)];
      facade('z', Z1 - TT, Z1, X0, X1, base, top, M.brick, back);
      facade('x', X0, X0 + TT, Z0, Z1, base, top, M.plaster, [win(56.2, base + 1.05, 1.3, 1.15)]);
      facade('x', X1 - TT, X1, Z0, Z1, base, top, M.plaster, [win(59.5, base + 1.05, 1.3, 1.15)]);
    }
    // floor-2 slab with a hole over the stair lane (x[cx+3.5, inner-east], z[57.9,60.9])
    seg(X0 + TT, cx + 3.5, 3.35, 3.6, Z0 + TT, Z1 - TT, M.concrete);
    seg(cx + 3.5, X1 - TT, 3.35, 3.6, Z0 + TT, 57.9, M.concrete);
    seg(cx + 3.5, X1 - TT, 3.35, 3.6, 60.9, Z1 - TT, M.concrete);
    stairFlight(cx + 4.14, 0, 61.6, 0, -1, 10, 0.335, 0.34, 1.2, M.concrete);
    if (roofAccess) {
      seg(X0, cx + 3.5, 6.2, 6.5, Z0, Z1, M.roof);
      seg(cx + 3.5, X1, 6.2, 6.5, Z0, 57.9, M.roof);
      seg(cx + 3.5, X1, 6.2, 6.5, 60.9, Z1, M.roof);
      stairFlight(cx + 4.14, 3.6, 61.6, 0, -1, 9, 0.322, 0.34, 1.2, M.concrete);
      seg(X0, X1, 6.5, 7.4, Z0, Z0 + 0.22, M.brick);   // parapet — mid-range sniper spot
      seg(X0, X1, 6.5, 7.4, Z1 - 0.22, Z1, M.brick);
      seg(X0, X0 + 0.22, 6.5, 7.4, Z0, Z1, M.brick);
      seg(X1 - 0.22, X1, 6.5, 7.4, Z0, Z1, M.brick);
      seg(cx + 3.3, cx + 4.9, 6.5, 7.6, 60.9, 61.12, M.brick); // stair-head lip
    } else {
      seg(X0, X1, 6.2, 6.5, Z0, Z1, M.roof);
      seg(X0, X1, 6.5, 7.0, Z0, Z0 + 0.22, M.brick);
      seg(X0, X1, 6.5, 7.0, Z1 - 0.22, Z1, M.brick);
    }
    // front balcony off the floor-2 door
    seg(cx - 1.5, cx + 1.5, 3.35, 3.55, 52.55, Z0 + 0.05, M.concrete);
    seg(cx - 1.5, cx + 1.5, 3.55, 4.5, 52.5, 52.62, M.trim);
    seg(cx - 1.5, cx - 1.38, 3.55, 4.5, 52.5, Z0, M.trim);
    seg(cx + 1.38, cx + 1.5, 3.55, 4.5, 52.5, Z0, M.trim);
    box(cx - 3, 0.45, 61, 0.9, 0.9, 0.9, M.wood);
    seg(cx - 3.4, cx - 1.9, 3.6, 4.32, 55.4, 56.2, M.wood); // upstairs table
  }
  rowHouse(-25, true);
  rowHouse(-3, true);
  rowHouse(19, true);   // every roof is climbable now
  // alley clutter between houses
  box(-14, 0.75, 56.5, 2.2, 1.5, 1.3, M.contGreen);
  brokenWall(-11, 61, true);
  box(8, 0.75, 55.5, 2.2, 1.5, 1.3, M.contGreen);
  crates(11, 61);
  lamp(-3, 50.6, 's');

  /* ===== RAIL YARD (west)  x[-70,-52] ===== */
  (function () {
    // half-buried bunker with firing slits
    facade('x', -54.3, -54, -8, -2, 0, 2.7, M.concrete, [{ u0: -6.4, u1: -5.2, v0: 0, v1: 2.1 }]);
    facade('z', -8, -7.7, -66, -54.3, 0, 2.7, M.concrete, [
      { u0: -63, u1: -61.5, v0: 1.2, v1: 1.7 }, { u0: -58, u1: -56.5, v0: 1.2, v1: 1.7 }
    ]);
    facade('z', -2.3, -2, -66, -54.3, 0, 2.7, M.concrete, []);
    facade('x', -66, -65.7, -8, -2, 0, 2.7, M.concrete, []);
    seg(-66, -54, 2.7, 2.95, -8, -2, M.roof);
    // containers
    container(-60, 14, false, M.contRed, false);
    box(-60, 3.9, 14, 6.1, 2.6, 2.44, M.contGray);
    container(-66, 8, true, M.contGray, false);
    container(-58, -14, false, M.contBlue, true); // open — enterable
    box(-68, 0.6, 4, 1.2, 1.2, 1.6, M.rust);      // buffer stops
    box(-68, 0.6, -12, 1.2, 1.2, 1.6, M.rust);
    barrel(-55.5, 12.5, true); crates(-63, -18);
    brokenWall(-52, 30, false);
    lamp(-58, 2, 'e');
  })();

  /* ===== OFFICE ROOF ACCESS (west fire-escape) ===== */
  (function () {
    stairFlight(-37.7, 0, 29.9, 0, -1, 12, 0.284, 0.33, 1.2, M.metal);      // ground -> landing
    seg(-38.35, -37.05, 3.4, 3.62, 24.35, 26.0, M.metal);                    // switchback landing
    stairFlight(-37.7, 3.62, 24.35, 0, -1, 10, 0.308, 0.33, 1.2, M.metal);  // landing -> roof height
    seg(-38.35, -36.75, 6.7, 6.92, 20.85, 22.3, M.metal);                    // arrival platform onto roof
    seg(-38.28, -38.16, 0, 3.4, 25.1, 25.3, M.trim);                         // support post
    seg(-37, -36.75, 6.7, 7.55, 22.6, 31, M.plaster);                        // west parapet (gap at arrival)
    seg(-23.25, -23, 6.7, 7.55, 21, 31, M.plaster);                          // east parapet
    box(-30, 7.15, 27.6, 1.8, 0.9, 1.4, M.metal);                            // roof AC cover
    box(-25.6, 7.1, 29, 1.4, 0.8, 1.2, M.rust);
  })();
};
