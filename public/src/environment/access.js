/* V4.7 Urban accessibility pass — converts two decorative roofs into playable
   positions. Heights are DERIVED from the collider set (garage top 4.30,
   warehouse top 9.15), not guessed; the map validator proves the roof loot
   points rest on real geometry. Metal stairs = metal footsteps. */
World._buildAccess = function (T) {
  var seg = T.seg, box = T.box, stairFlight = T.stairFlight, M = T.M;

  /* ===== v10 - THE "WEIRD BIG STEPS" WERE NEVER THE STEPS =====

     Reported three times now. v9.15 reshaped the TREADS (0.31x0.50 to
     0.24x0.39) and Rahul still sent Recording_110108 frame 09: "a huge solid
     grey wedge against a building, with barely visible treads on top". The
     treads were fine after v9.15. The thing in the photograph is what was
     UNDER them.

     Each flight carried three stacked solid slabs - 1.50 m, 2.95 m and 4.30 m
     tall - as an under-skirt. Three blocks of increasing height beside a stair
     do not read as a support for the stair; they read as a second, giant,
     three-step staircase, which is exactly what "weird big steps" describes.
     Nine of them across the garage and warehouse flights.

     They are also redundant. stairFlight has emitted proper stringers since
     v8.4 - thin plates inset within the tread width that fill the wedge under
     the flight - so these predate the generator having its own support and
     nobody removed them when it gained one.

     Replaced with a raking stringer: a run of thin plates that follow the tread
     line down, which is what the underside of a real external stair looks like.
     Purely visual. All of it is collide:false and cast:false, so it cannot
     affect climbing and cannot touch Urban's zero shadow-caster headroom
     (HANDOFF section 7). */
  function rake(x0, x1, z0, z1, yTop, yBase, along) {
    /* `along` is the axis the flight runs down: 'x' or 'z'. The plate steps
       down in N slices so the underside follows the treads instead of forming
       a solid wedge. Eight slices is enough to read as a rake at play distance
       and is a fraction of the volume the three slabs occupied. */
    var N = 8, i, t0, t1, yt;
    for (i = 0; i < N; i++) {
      t0 = i / N; t1 = (i + 1) / N;
      yt = yBase + (yTop - yBase) * (1 - t0);
      if (along === 'x') {
        seg(x0 + (x1 - x0) * t0, x0 + (x1 - x0) * t1, yt - 0.16, yt,
          z0, z1, M.metal, { collide: false, cast: false });
      } else {
        seg(x0, x1, yt - 0.16, yt,
          z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1, M.metal, { collide: false, cast: false });
      }
    }
  }


  /* ---- GARAGE (roof slab x[-16.5,-7.5] z[34,42], top 4.30) ---- */
  // exterior stair up the west face, landing bridges onto the roof edge
  /* ===== v9.15 — STEPS THAT LOOK LIKE STEPS =====
     Reported twice with coordinates: "weird big steps, make it real". 0.31 of
     rise on a 0.50 run is a 1.4 m-wide slab taller than a kerb, and next to the
     under-skirt panels it reads as a stack of blocks.

     18 steps of 0.241 x 0.389 instead of 14 of 0.310 x 0.500. The FOOTPRINT IS
     IDENTICAL — 18 x 0.389 = 7.0 m, exactly what 14 x 0.500 covered — and the
     total climb is unchanged at 4.34 m, so the landing, the skirts and the roof
     edge all still meet it. Nothing around the stair had to move.

     0.389 is as shallow as the run can go: it must clear the 0.35 m player
     radius, the number this project paid for in v8.13 when a shorter run let
     the capsule straddle the tread two ahead. Rise 0.241 is well under the
     0.42 auto-step.

     v9.13 attempted this and changed the wrong staircases — the buildingAt fire
     escapes, which are a different generator with a different profile — and
     left loot floating on their treads. These are the two that were actually
     reported, and they carry no loot. */
  stairFlight(-17.6, 0, 41.5, 0, -1, 18, 0.2411, 0.389, 1.4, M.metal);
  rake(-18.3, -16.9, 34.5, 41.6, 4.30, 0, 'z');
  seg(-18.3, -16.4, 4.3, 4.45, 33.6, 35.4, M.metal);            // landing
  seg(-18.4, -18.3, 4.45, 5.35, 33.5, 35.5, M.metal);           // landing outer rail
  // roof edge rails (west rail leaves a gap at the landing)
  seg(-16.5, -7.5, 4.3, 5.2, 33.9, 34.0, M.trim);
  seg(-16.5, -7.5, 4.3, 5.2, 41.9, 42.0, M.trim);
  seg(-7.6, -7.5, 4.3, 5.2, 34, 42, M.trim);
  seg(-16.5, -16.4, 4.3, 5.2, 35.6, 42, M.trim);

  /* ---- WAREHOUSE (roof x[-46,-18] z[-37,-19], top 9.15) ---- */
  // two-flight fire escape on the south face with a mid landing
  stairFlight(-19.0, 0, -17.3, -1, 0, 19, 0.2447, 0.395, 1.4, M.metal);   // 19 x 0.395 = 7.5 m, as before
  rake(-26.6, -19.1, -18.0, -16.6, 4.65, 0, 'x');
  seg(-28.4, -26.4, 4.65, 4.8, -18.2, -16.4, M.metal);          // mid landing
  seg(-28.5, -26.3, 4.8, 5.7, -16.5, -16.4, M.metal);           // mid landing rail
  stairFlight(-28.6, 4.65, -17.3, -1, 0, 19, 0.2368, 0.395, 1.4, M.metal); // 19 x 0.395 = 7.5 m, as before
  rake(-36.2, -28.7, -18.0, -16.6, 9.15, 4.65, 'x');
  seg(-37.8, -35.6, 9.15, 9.3, -19.5, -16.6, M.metal);          // top landing onto the roof
  seg(-37.9, -35.5, 9.3, 10.2, -16.7, -16.6, M.metal);          // top landing rail
  // roof edge rails (south rail gapped at the entry)
  seg(-46, -18, 9.15, 10.05, -37.0, -36.9, M.trim);
  seg(-46, -45.9, 9.15, 10.05, -37, -19, M.trim);
  seg(-18.1, -18, 9.15, 10.05, -37, -19, M.trim);
  seg(-46, -37.9, 9.15, 10.05, -19.1, -19, M.trim);
  seg(-35.5, -18, 9.15, 10.05, -19.1, -19, M.trim);

  /* roof furniture — the payoff for climbing */
  box(-14, 4.75, 36.5, 1.4, 0.9, 1.1, M.metal);
  box(-10.5, 4.62, 40, 1.0, 0.65, 0.9, M.metal);
  box(-40, 9.75, -30, 1.6, 1.2, 1.2, M.metal);
  box(-26, 9.6, -33, 1.1, 0.9, 1.0, M.metal);
  box(-33, 9.55, -22, 0.9, 0.8, 0.9, M.metal);
};
