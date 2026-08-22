(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* KILLHOUSE — indoor close-quarters warehouse. v10.9.

     A single roofed building, 58 x 34 m, no exterior. Every sightline is under
     40 m by construction, which is the whole design: this map exists because
     Urban and Metro are 200 m maps where two people can spend a minute not
     finding each other.

     HUMANS ONLY. Bots are switched off (world.config.js BOTS_ENABLED) and this
     map was designed after that decision, so nothing here assumes an AI
     opponent. There is no bot navigation data and none is needed.

     MIRRORED ABOUT x=0. Team A spawns west, team B east, and every piece of
     cover on one side has a twin on the other. A close-quarters map that is not
     symmetric hands one spawn the better opening, and on a 58 m map the opening
     is most of the match.

     LOOT CLASSES match Urban/Rural/Metro semantics:
       g  ground scavenge — the common floor pickups
       h  elevated — on top of a container or a rack shelf, costs you a climb
       s  signature — the contested centre, and the two rack ends
     Support y = collider top + 0.55, validator-enforced. Container tops are at
     2.60 so their loot sits at 3.15; rack shelf 2 is at 2.20 so its loot sits
     at 2.75.

     NO SNIPER OR RPG ON THE FLOOR. Both reach the airdrop pool only. A
     100-damage one-shot rifle available at spawn on a map where nothing is
     further than 40 m defines every match; earning it from a crate does not.
     Enforced in loot.config.js, not here — this file only says WHERE loot goes,
     never WHAT it is. */
  var MAPS_KILLHOUSE = {
    LOOT_POINTS: [
      /* ---- central stack: the contested middle. Deliberately exposed from
         all three lanes, which is what makes holding it a decision. ---- */
      [0, 0.55, 0, "s"], [0, 3.15, 0, "s"],
      [-4, 0.55, -3, "g"], [4, 0.55, 3, "g"],
      [-4, 0.55, 3, "g"], [4, 0.55, -3, "g"],

      /* ---- north lane: container alley ---- */
      [-17, 0.55, -11, "g"], [17, 0.55, -11, "g"],
      [-17, 3.15, -11, "h"], [17, 3.15, -11, "h"],
      [-9, 0.55, -13, "g"], [9, 0.55, -13, "g"],
      [-24, 0.55, -9, "g"], [24, 0.55, -9, "g"],

      /* ---- south lane: pallet yard and the wreck ---- */
      [-17, 0.55, 11, "g"], [17, 0.55, 11, "g"],
      [-17, 3.15, 11, "h"], [17, 3.15, 11, "h"],
      [-9, 0.55, 13, "g"], [9, 0.55, 13, "g"],
      [-24, 0.55, 9, "g"], [24, 0.55, 9, "g"],

      /* ---- mid lane: shelving racks. Shelf 2 loot is the reward for
         exposing yourself in the open middle. ---- */
      [-11, 0.55, 0, "g"], [11, 0.55, 0, "g"],
      [-11, 2.75, 0, "s"], [11, 2.75, 0, "s"],

      /* ---- spawn approaches: enough to arm on, never enough to camp ---- */
      [-25, 0.55, 0, "g"], [25, 0.55, 0, "g"],
      [-22, 0.55, -4, "g"], [22, 0.55, 4, "g"],
      [-22, 0.55, 4, "g"], [22, 0.55, -4, "g"],

      /* ---- corners: the long way round, paid for with distance ---- */
      [-26, 0.55, -14, "h"], [26, 0.55, 14, "h"],
      [-26, 0.55, 14, "h"], [26, 0.55, -14, "h"]
    ],

    /* SPAWNS — [x, z, facing]. Mirrored, both ends, fanned across the width so
       an eight-player lobby does not stack four operators on one tile. Facing
       is toward the centre in every case: spawning with your back to the fight
       is a death you did not choose.

       All seven per side sit behind the spawn-side container line, so nothing
       on the opposing spawn can see them at the moment they appear. */
    SPAWNS: [
      // west — team A
      [-26.5, -12, 1.5708], [-26.5, -6, 1.5708], [-26.5, 0, 1.5708],
      [-26.5, 6, 1.5708], [-26.5, 12, 1.5708],
      [-24.0, -13.5, 1.5708], [-24.0, 13.5, 1.5708],
      // east — team B
      [26.5, -12, -1.5708], [26.5, -6, -1.5708], [26.5, 0, -1.5708],
      [26.5, 6, -1.5708], [26.5, 12, -1.5708],
      [24.0, -13.5, -1.5708], [24.0, 13.5, -1.5708],
      // neutral north/south entries, used by free-for-all
      [0, -14.5, 0], [0, 14.5, 3.1416]
    ],

    /* AIRDROP_POINTS — [x, z]. Four, all in open floor with no roof truss
       overhead, so a crate cannot land inside geometry. The centre is
       v10.10: the first pass put one ON the central stack and two ON the
       shelving racks. verify-map refused all three — a crate that lands inside
       geometry is a crate nobody can reach. Moved to the open floor between the
       lanes, which is contested for the right reason: you have to cross to it. */
    AIRDROP_POINTS: [
      [0, 7.5], [0, -6.5], [-14, 6.5], [14, 6.5], [-14, -6.5], [14, -6.5]
    ]
  };

  return { MAPS_KILLHOUSE: MAPS_KILLHOUSE };
});
