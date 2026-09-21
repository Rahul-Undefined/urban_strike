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
      [-16, 0.55, -16, "h"], [16, 0.55, 16, "h"], [-16, 0.55, 16, "h"], [16, 0.55, -16, "h"],
      /* v15.0 (fix 12): the outer ring — sheds, container rows, the fence lane. */
      [0, 0.55, -28, "h"], [28, 0.55, 0, "h"], [0, 0.55, 28, "h"], [-28, 0.55, 0, "h"],
      [-24, 0.55, -24, "g"], [24, 0.55, 24, "g"], [-24, 0.55, 24, "g"], [24, 0.55, -24, "g"],
      [-31, 0.55, -10, "g"], [31, 0.55, 10, "g"], [-31, 0.55, 10, "g"], [31, 0.55, -10, "g"],
      [-10, 0.55, -31, "g"], [10, 0.55, 31, "g"], [-10, 0.55, 31, "g"], [10, 0.55, -31, "g"],
      [-22, 0.55, 8, "g"], [22, 0.55, -8, "g"], [8, 0.55, 22, "g"], [-8, 0.55, -22, "g"]
    ],
    /* Four spawn clusters, one per corner, all facing the centre. Rotational
       symmetry means there is no "your end" — the spawn you get is the corner
       you get, and every corner is the same corner turned 90 degrees. */
    SPAWNS: [
      /* v10.15: team-tagged. spawnFor() filters `s[3]` against the player's
         team; without the tag it matched nothing and both sides spawned
         anywhere (see maps-killhouse.config.js for the full note).

         FREIGHTYARD is four-way rotational, so there is no natural west and
         east — the split is by DIAGONAL: the two -x corners are 'a', the two
         +x corners are 'b'. That keeps each side's three tiles adjacent, which
         is what "the same side of the map" means on a map with no ends. */
      [-16.5, -16.5, 0.785, "a"], [-13.5, -17.5, 0.785, "a"], [-17.5, -13.5, 0.785, "a"],
      [16.5, 16.5, -2.356, "b"], [13.5, 17.5, -2.356, "b"], [17.5, 13.5, -2.356, "b"],
      [-16.5, 16.5, 2.356, "a"], [-13.5, 17.5, 2.356, "a"], [-17.5, 13.5, 2.356, "a"],
      [16.5, -16.5, -0.785, "b"], [13.5, -17.5, -0.785, "b"], [17.5, -13.5, -0.785, "b"],
      /* v15.0: outer-ring tiles for the 15-player cap, same diagonal split. */
      [-31, -31, 0.785, "a"], [-31, 31, 2.356, "a"], [-31, -19, 1.2, "a"], [-31, 19, 1.9, "a"],
      [31, 31, -2.356, "b"], [31, -31, -0.785, "b"], [31, 19, -1.9, "b"], [31, -19, -1.2, "b"],
      [0, -32, 0, "n"], [0, 32, 3.1416, "n"]
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
    AIRDROP_POINTS: [[3, 7], [-7, 3], [-3, -7], [7, -3],
      [30, 22], [-22, 30], [-30, -22], [22, -30]]   /* v15.0: the outer ring, between the bays */
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
      [-12, 0.55, 0, "g"], [12, 0.55, 0, "g"],
      /* v15.0 (fix 12): the souks, the caravanserai, the produce market. */
      [-35, 0.55, -20, "g"], [35, 0.55, 20, "g"], [-35, 0.55, 20, "g"], [35, 0.55, -20, "g"],
      [-35, 0.55, 0, "s"], [35, 0.55, 0, "s"],
      [-35, 0.55, -10, "g"], [35, 0.55, 10, "g"], [-35, 0.55, 10, "g"], [35, 0.55, -10, "g"],
      [-6, 0.55, -27.3, "h"], [6, 0.55, -27.3, "h"], [0, 0.55, -25, "s"],
      [0, 0.55, 28, "g"], [-9, 0.55, 28, "g"], [9, 0.55, 28, "g"], [-22, 0.55, 28, "g"], [22, 0.55, 28, "g"],
      [-30, 0.55, -24, "g"], [30, 0.55, 24, "g"], [-30, 0.55, 24, "g"], [30, 0.55, -24, "g"]
    ],
    SPAWNS: [
      /* v10.15: team-tagged, west 'a' and east 'b'. The four alley-mouth
         spawns in the middle stay 'n' — they are for free-for-all, where
         there are no sides to keep apart. */
      [-25.5, -12, 1.5708, "a"], [-25.5, -4, 1.5708, "a"], [-25.5, 4, 1.5708, "a"], [-25.5, 12, 1.5708, "a"],
      [25.5, -12, -1.5708, "b"], [25.5, -4, -1.5708, "b"], [25.5, 4, -1.5708, "b"], [25.5, 12, -1.5708, "b"],
      [-9, -18, 0, "n"], [9, -18, 0, "n"], [-9, 18, 3.1416, "n"], [9, 18, 3.1416, "n"],
      /* v15.0: the souk ends, west 'a' and east 'b', for the 15-player cap. */
      [-40, -26, 1.5708, "a"], [-40, 26, 1.5708, "a"], [-40, -18, 1.5708, "a"], [-40, 18, 1.5708, "a"],
      [40, -26, -1.5708, "b"], [40, 26, -1.5708, "b"], [40, -18, -1.5708, "b"], [40, 18, -1.5708, "b"]
    ],
    /* v10.14: [-3,-19] was inside the perimeter fence. A crate needs more
       clearance than a loot point does, so the generator's LOOT suggestions
       cannot be reused wholesale for drops — each one is validated as a drop. */
    AIRDROP_POINTS: [[3, 9], [-15, 17], [15, -7], [17, 11],
      [-28, -24], [28, 24], [-28, 24], [28, -24]]   /* v15.0: the open corners outside the core */
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
      [-19, 0.55, -19, "h"], [19, 0.55, 19, "h"], [-19, 0.55, 19, "h"], [19, 0.55, -19, "h"],
      /* v15.0 (fix 12): the switchyard ring — control buildings on the diagonals,
         the bays, the ground between. */
      [-28, 0.55, -28, "s"], [28, 0.55, 28, "s"], [-28, 0.55, 28, "s"], [28, 0.55, -28, "s"],
      [-30, 0.55, 0, "g"], [30, 0.55, 0, "g"], [0, 0.55, -30, "g"], [0, 0.55, 30, "g"],
      [-33, 0.55, -14, "g"], [33, 0.55, 14, "g"], [-33, 0.55, 14, "g"], [33, 0.55, -14, "g"],
      [-14, 0.55, -33, "g"], [14, 0.55, 33, "g"], [-14, 0.55, 33, "g"], [14, 0.55, -33, "g"],
      [-26, 0.55, 14, "g"], [26, 0.55, -14, "g"], [14, 0.55, 26, "g"], [-14, 0.55, -26, "g"]
    ],
    SPAWNS: [
      /* v10.15: team-tagged. On a ring map west and east are opposite arcs,
         which is as separated as this shape allows; the north and south arcs
         are 'n' for free-for-all. */
      [-21.5, -14, 1.5708, "a"], [-21.5, 0, 1.5708, "a"], [-21.5, 14, 1.5708, "a"],
      [21.5, -14, -1.5708, "b"], [21.5, 0, -1.5708, "b"], [21.5, 14, -1.5708, "b"],
      [-14, -21.5, 0, "n"], [0, -21.5, 0, "n"], [14, -21.5, 0, "n"],
      [-14, 21.5, 3.1416, "n"], [0, 21.5, 3.1416, "n"], [14, 21.5, 3.1416, "n"],
      /* v15.0: outer-ring tiles, west arc 'a' and east arc 'b'. */
      [-34, -22, 1.5708, "a"], [-34, -8, 1.5708, "a"], [-34, 8, 1.5708, "a"], [-34, 22, 1.5708, "a"],
      [34, -22, -1.5708, "b"], [34, -8, -1.5708, "b"], [34, 8, -1.5708, "b"], [34, 22, -1.5708, "b"]
    ],
    /* v10.14: two of these sat on the pit railing posts — 6 cm cylinders that
       a loot point clears and a crate does not. */
    AIRDROP_POINTS: [[-5, -15], [13, -7], [-15, 11], [11, 11],
      [-26, 14], [26, -14], [14, 26], [-14, -26]]   /* v15.0: the switchyard ring */
  };

  return { MAPS_FREIGHTYARD: MAPS_FREIGHTYARD, MAPS_BAZAAR: MAPS_BAZAAR,
           MAPS_SUBSTATION: MAPS_SUBSTATION };
});
