(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* SUNSET ROW — suburban street. v10.12.

     64 x 40 m. The second small map, and deliberately NOT a second killhouse.

     WHY THE SHAPE IS DIFFERENT. Killhouse is cover-in-lanes: you pick a lane
     and push down it, and every piece of cover is something you stand behind.
     Sunset Row is rooms-and-a-street: two enterable houses facing each other
     across a road, with side yards running around the outside. That gives
     three real choices every life instead of one — hold your house and shoot
     from a window, push the street behind the bus, or flank through a yard.

     Two small maps with the same structure means one of them stops being
     picked. Enterable buildings are the cheapest way to make the fight
     genuinely different, because a room changes what a duel IS rather than
     just where it happens.

     NO STAIRS, NO SECOND STOREY. Same call as killhouse and the same reason:
     verify-climb is red on 21 flights across urban and rural. Roofs are not
     climbable, so a single storey costs nothing.

     MIRRORED ABOUT x=0 so neither house is the better spawn.

     LOOT CLASSES:
       g  ground scavenge — street, yards, garden paths
       h  elevated / interior-notable — inside the houses and the sheds
       s  signature — the bus and the two porches, the three places worth
          contesting
     Support y = collider top + 0.55, validator-enforced. Floor loot is 0.55.
     The bus roof cap tops out at 3.20, so its loot sits at 3.75 — the first
     draft used 3.65 off a guessed roof height and verify-map refused it. */
  var MAPS_SUNSETROW = {
    LOOT_POINTS: [
      /* ---- the street: the middle, and the most dangerous ground ---- */
      [0, 3.75, 0, "s"],
      [0, 0.55, -7, "g"], [0, 0.55, 7, "g"],
      [-4, 0.55, -11, "g"], [4, 0.55, 11, "g"],
      [-4, 0.55, 11, "g"], [4, 0.55, -11, "g"],

      /* ---- house interiors: worth entering, which is the point of them ---- */
      [-22, 0.55, -4, "h"], [22, 0.55, 4, "h"],
      [-22, 0.55, 4, "h"], [22, 0.55, -4, "h"],
      [-26, 0.55, 0, "h"], [26, 0.55, 0, "h"],
      [-18, 0.55, -6, "h"], [18, 0.55, 6, "h"],

      /* ---- porches: the doorway you have to cross to get in ---- */
      [-14.5, 0.55, 0, "s"], [14.5, 0.55, 0, "s"],

      /* ---- side yards: the flank route, paid for with distance ---- */
      [-20, 0.55, -15, "g"], [20, 0.55, 15, "g"],
      [-20, 0.55, 15, "g"], [20, 0.55, -15, "g"],
      [-10, 0.55, -16, "g"], [10, 0.55, 16, "g"],
      [-10, 0.55, 16, "g"], [10, 0.55, -16, "g"],

      /* ---- garden sheds ---- */
      [-28, 0.55, -15, "h"], [28, 0.55, 15, "h"],
      [-28, 0.55, 15, "h"], [28, 0.55, -15, "h"],

      /* ---- behind the houses, near spawn: arm up, do not camp ---- */
      [-30, 0.55, -6, "g"], [30, 0.55, 6, "g"],
      [-30, 0.55, 6, "g"], [30, 0.55, -6, "g"]
    ],

    /* SPAWNS — [x, z, facing]. Both sets sit BEHIND their own house, so the
       house is between a spawning player and the street. On a map this size
       that is the whole anti-spawn-camping design: there is no line from the
       enemy half to any spawn tile that does not pass through a building.

       Facing is toward the map centre in every case. */
    SPAWNS: [
      /* ===== v10.15 - SPAWNS ARE TEAM-TAGGED =====
         Rahul: "in teams match, spawn location should be team specific,
         everyone from the team should spawn in the same location or side."

         The mechanism already existed — spawnFor() filters on `s[3]` against
         the player's team — but none of the small maps carried the tag, so
         the filter matched nothing, fell through to the full set (the v8.27
         never-return-empty guard) and both teams spawned anywhere.

         'a' west, 'b' east, 'n' for the neutral ends used by free-for-all,
         where there are no sides to keep apart. */
      // west — team A, behind House A
      /* v10.12: z +/-8 was inside the garden walls behind each house
         (x 26..31, z 8.1..8.4). verify-map caught all four. Pulled to +/-6.5,
         which clears the wall and still fans five operators across the pocket
         so an eight-player lobby does not stack on one tile. */
      [-30.5, -6.5, 1.5708, "a"], [-30.5, -3.2, 1.5708, "a"], [-30.5, 0, 1.5708, "a"],
      [-30.5, 3.2, 1.5708, "a"], [-30.5, 6.5, 1.5708, "a"],
      [-29.0, -12, 1.5708, "a"], [-29.0, 12, 1.5708, "a"],
      // east — team B, behind House B
      [30.5, -6.5, -1.5708, "b"], [30.5, -3.2, -1.5708, "b"], [30.5, 0, -1.5708, "b"],
      [30.5, 3.2, -1.5708, "b"], [30.5, 6.5, -1.5708, "b"],
      [29.0, -12, -1.5708, "b"], [29.0, 12, -1.5708, "b"],
      // neutral yard ends, used by free-for-all
      [0, -17.5, 0, "n"], [0, 17.5, 3.1416, "n"]
    ],

    /* AIRDROP_POINTS — [x, z]. Open sky only: nothing under a roof, nothing
       on the bus. A crate that lands inside geometry is a crate nobody can
       reach, which is the mistake killhouse made on its first build — and
       which this map repeated on its own first build: one landed on the parked
       car, one on a garden wall and one on the postbox. Moved to open ground.
       Three misses out of six on a hand-placed list is the argument for
       generating them, not eyeballing them. */
    AIRDROP_POINTS: [
      [0, -17], [0, 17], [-5.5, 3.0], [5.5, -3.0], [-24, -12.5], [24, 12.5]
    ]
  };

  return { MAPS_SUNSETROW: MAPS_SUNSETROW };
});
