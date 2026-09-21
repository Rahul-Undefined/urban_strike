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
    /* v15.0 (fixes 11/12): every point scaled with the building (x 1.3, z 1.294);
       the centre-block point became the DECK point (0, 3.15, 0); the two flanking
       container-corridor roofs and the ground under the deck were added. Proved
       by verify-map against the rebuilt geometry. */
    LOOT_POINTS: [
      [-16.9, 0.55, -34.9, "g"], [9.1, 0.55, -32.4, "g"], [-19.5, 0.55, -27.2, "g"], [-2.6, 0.55, -22.0, "s"], [10.4, 0.55, -24.6, "g"], [-18.2, 0.55, -20.7, "g"], [-13.0, 0.55, -16.8, "g"], [6.5, 0.55, -11.6, "g"], [-1.3, 0.55, -14.2, "g"],
      [10.4, 0.55, 0.0, "s"], [-13.0, 0.55, -9.1, "g"], [-11.7, 0.55, 5.2, "g"], [3.9, 0.55, 3.9, "g"], [-20.8, 0.55, 9.1, "g"], [-13.0, 0.55, 10.4, "g"], [11.7, 0.55, 12.9, "g"],
      [-5.2, 0.55, 15.5, "g"], [1.3, 0.55, 22.0, "s"], [-16.9, 0.55, 22.0, "g"], [-23.4, 0.55, 25.9, "g"], [-14.3, 0.55, 31.1, "g"], [7.8, 0.55, 33.6, "g"], [-1.3, 0.55, 37.5, "g"], [15.6, 0.55, 28.5, "g"], [18.2, 0.55, -10.4, "g"],
      /* elevated: block roofs, crate run, the deck, the corridor roofs, under the deck */
      [-2.6, 3.15, -22.0, "h"], [1.3, 3.15, 22.0, "h"], [-1.3, 1.77, 37.5, "h"],
      [0, 3.15, 0, "s"], [-17, 3.15, 0, "h"], [19, 3.15, 0, "h"], [-6.4, 0.55, -7.8, "g"], [6.4, 0.55, 7.8, "g"]
    ],
    /* SPAWNS — [x, z, facing, side]. North end 'a', south end 'b'; nine tiles a
       side for the 15-player cap, four neutrals on the long walls for FFA. */
    SPAWNS: [
      [-15.6, -40.1, 3.1416, "a"], [-7.8, -40.8, 3.1416, "a"], [0.0, -40.8, 3.1416, "a"], [7.8, -40.8, 3.1416, "a"], [15.6, -40.1, 3.1416, "a"], [-11.7, -37.5, 3.1416, "a"], [11.7, -37.5, 3.1416, "a"], [-15.6, 40.1, 0, "b"], [-7.8, 40.8, 0, "b"],
      [0.0, 40.8, 0, "b"], [7.8, 40.8, 0, "b"], [15.6, 40.1, 0, "b"], [-11.7, 37.5, 0, "b"], [11.7, 37.5, 0, "b"], [-18, -41, 3.1416, "a"], [18, -41, 3.1416, "a"], [-18, 41, 0, "b"], [18, 41, 0, "b"],
      [-23, 0, 1.5708, "n"], [24, 0, -1.5708, "n"], [-23, -21, 1.5708, "n"], [24, 16, -1.5708, "n"]
    ],
    /* AIRDROP_POINTS — open floor, nothing overhead, clear of the deck. */
    AIRDROP_POINTS: [
      [0, -14], [0, 14], [-7.8, -28.5], [7.8, 28.5], [16.9, -18.1], [-20.8, 16.8]
    ]
  };

  return { MAPS_KILLHOUSE: MAPS_KILLHOUSE };
});
