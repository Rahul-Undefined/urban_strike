(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* KILLHOUSE — rebuilt to Rahul's layout, v10.20.

     He sent a top-down plan and asked for it exactly. It is a PORTRAIT
     shoot-house: 40 m wide, 68 m deep, a checkered floor, and a scatter of thin
     partition walls at assorted angles with a handful of solid blocks.

     WHAT CHANGED FROM THE OLD KILLHOUSE, AND WHY THE OLD ONE WAS WRONG.
     v10.10 built a LANDSCAPE warehouse full of shipping containers, 58 x 34.
     That was off-brief in the most basic way: a killhouse IS a close-quarters
     TRAINING FACILITY — bare partitions, numbered doorways, target
     silhouettes — not a storage building. Rahul's plan is the correct reading
     of the name and the old one is replaced rather than adjusted.

     IT IS NOT MIRRORED. Every other small map on this roster is, deliberately,
     so neither spawn gets the better opening. This one follows the plan he
     drew, which is asymmetric. The mitigation is the SHAPE: spawns sit at the
     two short ends, 62 m apart, and the walls between them are dense enough
     that neither end can be seen from the other. If a side turns out to feel
     stronger in play, that is a real risk of following the drawing and the fix
     is to move spawns, not to mirror the map behind his back.

     PORTRAIT CHANGES THE LANES. The old map ran three lanes east-west. This one
     runs north-south, and the fight is a push down the length of the building
     through rooms, which is what the plan describes. */
  var MAPS_KILLHOUSE = {
    LOOT_POINTS: [
      /* North third — the approach from the A end. */
      [-13, 0.55, -27, "g"], [7, 0.55, -25, "g"], [-15, 0.55, -21, "g"],
      [-2, 0.55, -17, "s"], [8, 0.55, -19, "g"], [-14, 0.55, -16, "g"],
      [-10, 0.55, -13, "g"], [5, 0.55, -9, "g"], [-1, 0.55, -11, "g"],

      /* Middle — the contested centre of the house. */
      [-2, 0.55, -2, "s"], [8, 0.55, 0, "s"], [-10, 0.55, -7, "g"],
      [-9, 0.55, 4, "g"], [3, 0.55, 3, "g"], [-16, 0.55, 7, "g"],
      [-10, 0.55, 8, "g"], [9, 0.55, 10, "g"],

      /* South third — the approach from the B end. */
      [-4, 0.55, 12, "g"], [1, 0.55, 17, "s"], [-13, 0.55, 17, "g"],
      [-18, 0.55, 20, "g"], [-11, 0.55, 24, "g"], [6, 0.55, 26, "g"],
      [-1, 0.55, 29, "g"], [12, 0.55, 22, "g"], [14, 0.55, -8, "g"],

      /* Elevated: the solid blocks are the only things worth climbing, and a
         crate step is provided at each. No stairs anywhere on this map. */
      [-2, 3.15, -17, "h"], [1, 3.15, 17, "h"],
      /* v10.20: this was typed at 2.35 assuming the bottom crate run stood as
         tall as the solid blocks. It does not — crateRun caps at 1.22, so the
         point floated 1.1 m over it and verify-map said so. Sat on the real
         lid: 1.22 + 0.55 support clearance. */
      [-1, 1.77, 29, "h"]
    ],

    /* SPAWNS — [x, z, facing, side]. North end is 'a', south end is 'b'.
       62 m apart on a map whose longest clear line is far shorter than that,
       so neither end can see the other at the moment of spawning. The two
       'n' tiles are for free-for-all, where there are no sides to keep apart. */
    SPAWNS: [
      [-12, -31, 3.1416, "a"], [-6, -31.5, 3.1416, "a"], [0, -31.5, 3.1416, "a"],
      [6, -31.5, 3.1416, "a"], [12, -31, 3.1416, "a"],
      [-9, -29, 3.1416, "a"], [9, -29, 3.1416, "a"],
      [-12, 31, 0, "b"], [-6, 31.5, 0, "b"], [0, 31.5, 0, "b"],
      [6, 31.5, 0, "b"], [12, 31, 0, "b"],
      [-9, 29, 0, "b"], [9, 29, 0, "b"],
      [-17, 0, 1.5708, "n"], [17, 0, -1.5708, "n"]
    ],

    /* AIRDROP_POINTS — open floor, nothing overhead. Computed against the
       built geometry rather than typed: v10.14 typed Freightyard's three times
       and was wrong three times. */
    AIRDROP_POINTS: [
      [0, -6], [0, 6], [-6, -22], [6, 22], [13, -14], [-16, 13]
    ]
  };

  return { MAPS_KILLHOUSE: MAPS_KILLHOUSE };
});
