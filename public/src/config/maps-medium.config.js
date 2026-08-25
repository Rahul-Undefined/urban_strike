(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* TWO MEDIUM MAPS. v10.21.

     Rahul: "add a few more medium sized maps as well with same game dynamics
     like the small maps, like the guns options and all that."

     THE GAP THEY FILL. The roster was bimodal — five arenas under 70 m across
     where a sniper is a liability, and three 200 m theatres where an SMG never
     gets a fight. Nothing sat between. These are ~120 m: long enough that a
     bolt-action has real work, short enough that the walk between fights is
     measured in seconds.

     SAME DYNAMICS AS THE SMALL MAPS, which is what he asked for and what
     `arena: true` carries — nuke killstreak, 1 s spawn protection, recon visor
     in the crate pool. What they do NOT copy is the small-map weapon
     restriction: killhouse and sunsetrow keep snipers and rockets off the
     floor because nothing there is beyond 40 m. At 120 m that restriction
     would be removing the weapon the map exists to justify, so the full
     armoury spawns here.

     TWELVE PLAYERS. Between the arenas' 8-10 and the theatres' 15.

       RIVERSIDE   120 x 88. A canal down the middle with three crossings.
                   The water is the long lane; the banks are buildings you
                   fight inside. Every crossing is a decision with a cost.
       AIRFIELD    128 x 96. An open apron ringed by hangars. The most
                   deliberately lopsided map on the roster: the apron is the
                   longest clear line in the game outside Rural, and the hangar
                   interiors are tighter than Killhouse. */

  var MAPS_RIVERSIDE = {
    LOOT_POINTS: [
      /* West bank — buildings and yard */
      [-48, 0.55, -30, "g"], [-42, 0.55, -14, "g"], [-50, 0.55, 4, "g"],
      [-44, 0.55, 20, "g"], [-38, 0.55, 32, "g"], [-30, 0.55, -34, "g"],
      [-26, 0.55, -6, "s"], [-32, 0.55, 12, "g"], [-22, 0.55, 28, "g"],
      [-52, 0.55, -20, "h"], [-52, 0.55, 26, "h"],
      /* The crossings — contested, and the only loot worth the risk */
      [-26, 0.55, -20, "s"], [0, 0.55, 0, "s"], [26, 0.55, 20, "s"],
      [-2, 0.55, -26, "g"], [2, 0.55, 26, "g"],
      /* East bank */
      [48, 0.55, 30, "g"], [42, 0.55, 14, "g"], [50, 0.55, -4, "g"],
      [44, 0.55, -20, "g"], [38, 0.55, -32, "g"], [30, 0.55, 34, "g"],
      [26, 0.55, 6, "s"], [32, 0.55, -12, "g"], [22, 0.55, -28, "g"],
      [52, 0.55, 20, "h"], [52, 0.55, -26, "h"],
      /* v10.21: these four were typed. Measured against the built colliders,
         [-40,-24] and [40,24] have NOTHING under them — the sheds sit at
         [-40,-24] only in my head; the builder puts them elsewhere — and the
         crate runs at z +/-34 top out at 1.10, not 2.35. Roofs are reachable
         and worth loot, but the point has to sit on a measured surface, so
         these move to the crate lids that actually exist. */
      [-14, 1.65, 34, "h"], [14, 1.65, -34, "h"]
    ],
    SPAWNS: [
      [-56, -24, 1.5708, "a"], [-56, -8, 1.5708, "a"], [-56, 8, 1.5708, "a"],
      [-56, 24, 1.5708, "a"], [-52, -32, 1.5708, "a"], [-52, 32, 1.5708, "a"],
      [56, 24, -1.5708, "b"], [56, 8, -1.5708, "b"], [56, -8, -1.5708, "b"],
      [56, -24, -1.5708, "b"], [52, 32, -1.5708, "b"], [52, -32, -1.5708, "b"],
      [-18, -40, 0, "n"], [18, -40, 0, "n"], [-18, 40, 3.1416, "n"], [18, 40, 3.1416, "n"]
    ],
    /* v10.21: computed from the built geometry, not typed. [-34,26] and its
       mirror landed on the quay railings. */
    AIRDROP_POINTS: [[6, 0], [-10, 4], [-11, -14], [21, 9], [0, 18], [12, -16], [-16, 21]]
  };

  var MAPS_AIRFIELD = {
    LOOT_POINTS: [
      /* Apron — exposed by design. Good loot, no cover to collect it from. */
      [0, 0.55, 0, "s"], [-16, 0.55, -10, "g"], [16, 0.55, 10, "g"],
      [-16, 0.55, 10, "g"], [16, 0.55, -10, "g"],
      /* North hangars */
      [-40, 0.55, -32, "s"], [-24, 0.55, -36, "g"], [-46, 0.55, -22, "g"],
      [0, 0.55, -36, "g"], [10, 0.55, -30, "g"],
      [40, 0.55, -32, "s"], [24, 0.55, -36, "g"], [46, 0.55, -22, "g"],
      /* South hangars and terminal */
      [-40, 0.55, 32, "s"], [-24, 0.55, 36, "g"], [-46, 0.55, 22, "g"],
      [0, 0.55, 36, "g"], [10, 0.55, 30, "g"],
      [40, 0.55, 32, "s"], [24, 0.55, 36, "g"], [46, 0.55, 22, "g"],
      /* Perimeter service road */
      [-56, 0.55, 0, "g"], [56, 0.55, 0, "g"],
      [-56, 0.55, -40, "h"], [56, 0.55, 40, "h"],
      [-56, 0.55, 40, "h"], [56, 0.55, -40, "h"],
      /* Measured: the stacked containers at the apron edge top out at 5.20. */
      [-28, 5.75, 0, "h"], [28, 5.75, 0, "h"]
    ],
    SPAWNS: [
      [-60, -28, 1.5708, "a"], [-60, -10, 1.5708, "a"], [-60, 10, 1.5708, "a"],
      [-60, 28, 1.5708, "a"], [-56, -40, 1.5708, "a"], [-56, 40, 1.5708, "a"],
      [60, 28, -1.5708, "b"], [60, 10, -1.5708, "b"], [60, -10, -1.5708, "b"],
      [60, -28, -1.5708, "b"], [56, 40, -1.5708, "b"], [56, -40, -1.5708, "b"],
      [-20, -44, 0, "n"], [20, -44, 0, "n"], [-20, 44, 3.1416, "n"], [20, 44, 3.1416, "n"]
    ],
    /* v10.21: computed. [0,0] was on the wrecked airframe and [0,+/-44] on the
       terminal blocks — three of seven typed drops were inside geometry. */
    AIRDROP_POINTS: [[6, 0], [-10, 4], [-9, -12], [24, 0], [0, 18], [12, -16], [-26, 11]]
  };

  return { MAPS_RIVERSIDE: MAPS_RIVERSIDE, MAPS_AIRFIELD: MAPS_AIRFIELD };
});
