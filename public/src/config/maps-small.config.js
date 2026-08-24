(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* THREE MORE SMALL MAPS. v10.14.

     Replacing Outbreak, which came out because it shipped broken. Rahul asked
     what small maps are worth adding, so the choice is explained rather than
     assumed.

     The existing two:
       KILLHOUSE   indoor box, three parallel lanes, cover scattered along them
       SUNSET ROW  two enterable houses either end of an open street

     A third and fourth in either of those shapes would play the same and stop
     being chosen. So each of these is a SHAPE the roster does not have yet:

       FREIGHTYARD   4-WAY ROTATIONAL symmetry, not mirrored. No lanes and no
                     ends — you can be shot from any compass point at any time.
                     The classic tiny-map scrum. Smallest map in the game.
       BAZAAR        NO STRAIGHT LINES. Winding alleys and stalls, so almost
                     every engagement starts inside 12 m around a corner. The
                     opposite of a sightline map.
       SUBSTATION    A RING around a sunken central pit. The middle is a place
                     you can see across but not walk across, which makes
                     rotation the whole game — commit to a direction and you
                     cannot cheaply change your mind.

     All three: humans only, 8 players, the small-map rule set via `smallMap`,
     no stairs (verify-climb is still red on 21 flights elsewhere). */

  /* FREIGHTYARD — 38 x 38 m, four-way rotational. */
  var MAPS_FREIGHTYARD = {
    LOOT_POINTS: [
      [0, 0.55, 0, "s"], [0, 3.15, 0, "s"],
      [-9, 0.55, -9, "g"], [9, 0.55, 9, "g"], [-9, 0.55, 9, "g"], [9, 0.55, -9, "g"],
      [-14, 3.15, 0, "h"], [14, 3.15, 0, "h"], [0, 3.15, -14, "h"], [0, 3.15, 14, "h"],
      [-15, 0.55, -6, "g"], [15, 0.55, 6, "g"], [-15, 0.55, 6, "g"], [15, 0.55, -6, "g"],
      [-6, 0.55, -15, "g"], [6, 0.55, 15, "g"], [-6, 0.55, 15, "g"], [6, 0.55, -15, "g"],
      [-4, 0.55, 0, "g"], [4, 0.55, 0, "g"], [0, 0.55, -4, "g"], [0, 0.55, 4, "g"],
      [-16, 0.55, -16, "h"], [16, 0.55, 16, "h"], [-16, 0.55, 16, "h"], [16, 0.55, -16, "h"]
    ],
    /* Four spawn clusters, one per corner, all facing the centre. Rotational
       symmetry means there is no "your end" — the spawn you get is the corner
       you get, and every corner is the same corner turned 90 degrees. */
    SPAWNS: [
      [-16.5, -16.5, 0.785], [-13.5, -17.5, 0.785], [-17.5, -13.5, 0.785],
      [16.5, 16.5, -2.356], [13.5, 17.5, -2.356], [17.5, 13.5, -2.356],
      [-16.5, 16.5, 2.356], [-13.5, 17.5, 2.356], [-17.5, 13.5, 2.356],
      [16.5, -16.5, -0.785], [13.5, -17.5, -0.785], [17.5, -13.5, -0.785]
    ],
    /* v10.14: the first pass put one on the centre stack and four on the
       container ends — verify-map refused all five. On a four-way map the OPEN
       ground is the diagonals, because the containers sit on the axes. */
    /* v10.14: the diagonals were clear until the density pass put tyre stacks
       on them. Pulled out to radius 12, still on the open diagonals and still
       away from the axis containers. A drop needs more clearance than a loot
       point, so each of these is validated as a DROP, not reused from the loot
       generator. */
    /* v10.14: three guesses at these, and each time the density pass had put
       something where I assumed open ground — tyres on the diagonals at 6,
       drums at 13. Computed from the built colliders instead of typed, which
       is what tools/gen-points.js exists for and what section 4.4 of the
       handoff says every time. These four sit in the clear ring between the
       centre stack and the container line. */
    AIRDROP_POINTS: [[3, 7], [-7, 3], [-3, -7], [7, -3]]
  };

  /* BAZAAR — 54 x 40 m of alleys. */
  var MAPS_BAZAAR = {
    LOOT_POINTS: [
      [0, 0.55, 0, "s"], [-19, 0.55, 0, "s"], [19, 0.55, 0, "s"],
      [-9, 0.55, -6, "g"], [9, 0.55, 6, "g"], [-9, 0.55, 6, "g"], [9, 0.55, -6, "g"],
      [0, 0.55, -13, "g"], [0, 0.55, 13, "g"],
      [-15, 0.55, -13, "g"], [15, 0.55, 13, "g"], [-15, 0.55, 13, "g"], [15, 0.55, -13, "g"],
      [-24, 0.55, -8, "g"], [24, 0.55, 8, "g"], [-24, 0.55, 8, "g"], [24, 0.55, -8, "g"],
      /* v10.14: these four were placed on the stall AWNINGS at 2.15. An awning
         is non-colliding on purpose — it breaks sight from above without
         becoming cover — so there was nothing under them and verify-map called
         them floaters. Correctly: it is not loot on a roof if the roof is not
         there. Moved to the stall COUNTERS, which are solid at 0.96. */
      [-8, 1.51, -12, "h"], [8, 1.51, 12, "h"], [-8, 1.51, 12, "h"], [8, 1.51, -12, "h"],
      [-19, 0.55, -17, "h"], [19, 0.55, 17, "h"], [-19, 0.55, 17, "h"], [19, 0.55, -17, "h"],
      [-12, 0.55, 0, "g"], [12, 0.55, 0, "g"]
    ],
    SPAWNS: [
      [-25.5, -12, 1.5708], [-25.5, -4, 1.5708], [-25.5, 4, 1.5708], [-25.5, 12, 1.5708],
      [25.5, -12, -1.5708], [25.5, -4, -1.5708], [25.5, 4, -1.5708], [25.5, 12, -1.5708],
      [-9, -18, 0], [9, -18, 0], [-9, 18, 3.1416], [9, 18, 3.1416]
    ],
    /* v10.14: [-3,-19] was inside the perimeter fence. A crate needs more
       clearance than a loot point does, so the generator's LOOT suggestions
       cannot be reused wholesale for drops — each one is validated as a drop. */
    AIRDROP_POINTS: [[3, 9], [-15, 17], [15, -7], [17, 11]]
  };

  /* SUBSTATION — 46 x 46 m ring around a pit. */
  var MAPS_SUBSTATION = {
    LOOT_POINTS: [
      /* Nothing in the pit itself. It is a hazard to shoot across, not a
         reason to climb into a hole with one exit. */
      [-17, 0.55, 0, "s"], [17, 0.55, 0, "s"], [0, 0.55, -17, "s"], [0, 0.55, 17, "s"],
      [-13, 0.55, -13, "g"], [13, 0.55, 13, "g"], [-13, 0.55, 13, "g"], [13, 0.55, -13, "g"],
      [-20, 0.55, -8, "g"], [20, 0.55, 8, "g"], [-20, 0.55, 8, "g"], [20, 0.55, -8, "g"],
      [-8, 0.55, -20, "g"], [8, 0.55, 20, "g"], [-8, 0.55, 20, "g"], [8, 0.55, -20, "g"],
      /* v10.14: placed at 2.75 on nothing. The transformers are at radius 15,
         not 21, and their tops are 2.42 — I typed the ring radius and the
         wrong height. Sat on the real transformer lids instead. */
      [-15, 2.97, 0, "h"], [15, 2.97, 0, "h"], [0, 2.97, -15, "h"], [0, 2.97, 15, "h"],
      [-19, 0.55, -19, "h"], [19, 0.55, 19, "h"], [-19, 0.55, 19, "h"], [19, 0.55, -19, "h"]
    ],
    SPAWNS: [
      [-21.5, -14, 1.5708], [-21.5, 0, 1.5708], [-21.5, 14, 1.5708],
      [21.5, -14, -1.5708], [21.5, 0, -1.5708], [21.5, 14, -1.5708],
      [-14, -21.5, 0], [0, -21.5, 0], [14, -21.5, 0],
      [-14, 21.5, 3.1416], [0, 21.5, 3.1416], [14, 21.5, 3.1416]
    ],
    /* v10.14: two of these sat on the pit railing posts — 6 cm cylinders that
       a loot point clears and a crate does not. */
    AIRDROP_POINTS: [[-5, -15], [13, -7], [-15, 11], [11, 11]]
  };

  return { MAPS_FREIGHTYARD: MAPS_FREIGHTYARD, MAPS_BAZAAR: MAPS_BAZAAR,
           MAPS_SUBSTATION: MAPS_SUBSTATION };
});
