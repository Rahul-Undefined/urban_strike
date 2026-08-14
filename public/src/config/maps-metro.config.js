(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* Metro City map data — PHASE 1 (Financial District + Central Plaza only).
     Loot classes match Urban/Rural semantics: g ground scavenge, h elevated,
     s signature. Support y = collider top + 0.55 (validator-enforced).
     Remaining districts (mall, metro, garage, construction, residential) land in
     later phases; their loot/spawn/airdrop points are added with them so the
     validator never judges points for geometry that does not exist yet. */
  var MAPS_METRO = {
    LOOT_POINTS: [
      // Central Plaza — open, contested, deliberately exposed
      [0, 0.55, 0, "g"], [-8, 0.55, 6, "g"], [9, 0.55, -5, "g"],
      [-6, 0.55, -9, "g"], [7, 0.55, 8, "g"], [0, 0.55, 14, "g"],
      [-14, 0.55, 0, "g"], [14, 0.55, 2, "g"],
      // Financial District street level
      [-44, 0.55, -44, "g"], [-30, 0.55, -52, "g"], [44, 0.55, -44, "g"],
      [30, 0.55, -52, "g"], [-44, 0.55, 44, "g"], [44, 0.55, 44, "g"],
      [-52, 0.55, 30, "g"], [52, 0.55, -30, "g"],
      // tower roofs (24.25 + 0.55) — the payoff for taking a lift
      [-46, 7.60, -46, "s"], [46, 7.60, -46, "s"],
      [-46, 7.60, 46, "h"], [46, 7.60, 46, "h"],
      // tower mid-floors
      [-46, 4.20, -46, "h"], [46, 4.20, 46, "h"],
      [46, 4.20, -46, "h"], [-46, 4.20, 46, "h"],
      // skybridge decks (16.25 + 0.55) — contested crossings
      [0, 7.85, -46, "h"], [0, 7.85, 46, "h"],
      [-46, 7.85, 0, "h"], [46, 7.85, 0, "h"],
      // parking garage decks
      [-80, 0.85, -10, "g"], [-72, 4.05, 6, "g"], [-84, 7.25, -4, "g"],
      [-70, 10.45, 10, "h"], [-78, 13.65, 0, "s"], [-86, 13.65, 12, "h"],
      // shopping mall — three CQB floors + roof
      [70, 0.80, 20, "g"], [84, 0.80, 36, "g"], [76, 4.80, 28, "h"],
      [66, 4.80, 40, "g"], [88, 8.80, 20, "h"], [72, 8.80, 34, "h"],
      [80, 12.80, 30, "s"],
      // residential block — interiors, balconies and roofs
      [-84, 0.80, 24, "g"], [-52, 0.80, 24, "g"], [-84, 0.80, 52, "g"],
      [-52, 0.80, 76, "g"], [-84, 7.20, 24, "h"], [-52, 7.20, 76, "h"],
      [-84, 13.60, 24, "h"], [-52, 13.60, 76, "s"],
      // courtyard and alleys
      [-74, 0.55, 38, "g"], [-66, 0.55, 8, "g"], [-50, 0.55, 68, "g"],
      // underground: ticket hall, platforms, service corridors, running tunnel
      [-16, -5.20, -72, "g"], [16, -5.20, -72, "g"], [0, -5.20, -66, "h"],
      [-10, -4.15, -46, "h"], [10, -4.15, -46, "h"],
      [-16, -5.20, -44, "g"], [16, -5.20, -44, "g"],
      [-17, -5.20, -33, "s"], [0, -5.20, -10, "g"], [0, -5.20, 14, "g"],
      // construction site: open floor plates, ascending value
      [64, 0.85, -70, "g"], [78, 5.05, -66, "g"], [70, 9.25, -78, "h"],
      [82, 13.45, -70, "h"], [66, 17.65, -66, "h"], [76, 21.85, -74, "s"],
      // crane platform — highest position on the map, two routes in
      [92, 30.85, -52, "s"],

      /* ---- v9.1: THE FOUR EDGE DISTRICTS ----------------------------------
         The rim of this map was bare pavement until v9.1 and carried no loot at
         all, so a player pushed to the edge had no reason to be there and
         nothing to pick up on the way back. Heights are surface + 0.55, the
         same convention as every point above, and verify-map proves each one
         sits on a collider whose top is between y-0.85 and y-0.30.

         Ground points are 0.55 because the districts are laid on the y 0
         pavement. The container roofs are the one elevated set: those stacks
         top out at 2.20 m and ship with their own pallet step, so 2.75 is a
         reward for a climb rather than a point only a lift can reach. */
      // rail yard — between the sidings and along the hut line
      [-70, 0.55, -92, "g"], [-40, 0.55, -92, "g"], [0, 0.55, -92, "g"],
      [40, 0.55, -92, "g"], [70, 0.55, -92, "g"],
      [-65, 0.55, -86, "g"], [-10, 0.55, -86, "g"], [45, 0.55, -86, "g"],
      // cargo terminal — aisles, then the climbable stack roofs
      [89, 0.55, -70, "g"], [89, 0.55, -20, "g"], [93.3, 0.55, 20, "g"],
      [89, 0.55, 60, "g"], [93.3, 0.55, 84, "g"],
      [87, 3.15, -38.8, "h"], [95.4, 3.15, -55.2, "h"], [91.2, 3.15, -3, "s"],
      // bus depot and market street
      [-60, 0.55, 82, "g"], [-30, 0.55, 82, "g"], [10, 0.55, 84, "g"],
      [40, 0.55, 84, "g"], [70, 0.55, 84, "g"],
      [1, 1.60, 88.2, "g"], [32, 1.60, 88.2, "g"], [64, 1.60, 88.2, "h"],
      // park strip — open ground, and the bandstand plinth
      [-93, 0.55, -50, "g"], [-93, 0.55, -10, "g"], [-96, 0.55, 60, "g"],
      [-93, 0.55, 80, "g"], [-92, 1.15, 22, "h"],

      /* ---- v9.1: FIRE-ESCAPE LANDINGS -------------------------------------
         Every lift-only building gained an external stair, and a stair with
         nothing on it is a corridor. These sit on the landings themselves, so
         the climb pays on the way up rather than only at the top. Landing tops
         equal the floor tops they serve, which is why these heights match the
         interior points of the same buildings. */
      /* Landing positions were PROBED, not typed. The first cut guessed them
         from the floor heights and nine of nine elevated points floated: a
         landing's z depends on its flight's step COUNT, which is
         ceil(riseToNextFloor / 0.34) and therefore differs per building and
         even between the first flight and the rest of the same stair. Each
         coordinate below was read back out of the built collider set. */
      [-58, 4.05, -12.5, "h"], [-58, 7.25, -19, "h"],       // garage escape
      [-58, 13.65, -19, "s"],
      [55, 4.80, 20.3, "h"], [55, 8.80, 12.9, "h"],         // mall escape
      [55, 12.80, 20.3, "s"],
      [-66.5, 4.00, 25.5, "h"], [-66.5, 10.40, 25.5, "h"],  // residential A
      [-34.5, 4.00, 21.5, "h"], [-34.5, 10.40, 73.1, "h"],  // residential C / D
      [54.5, 5.05, -79.3, "h"], [54.5, 17.65, -87.1, "s"],  // construction escape

      /* ---- v9.5: DENSITY. -------------------------------------------------
         The four edge districts were built in v9.1 and furnished in v9.3, but
         they carried 8 loot points between them — so the rim was somewhere to
         fight and nowhere to loot, and players kept funnelling back to the
         centre. These fill it out on open ground at y 0.55, the same
         convention as every ground point above, and verify-map proves each one
         stands on a real surface rather than in the air or inside a wagon.

         Spacing is roughly 14-18 m: close enough that a street is worth
         running, far enough that one player cannot stand still and hold four
         markers at once. */
      // rail yard — the aisles between the sidings
      [-84, 0.55, -92, "g"], [-56, 0.55, -92, "g"], [-28, 0.55, -92, "g"],
      [14, 0.55, -92, "g"], [56, 0.55, -92, "g"], [84, 0.55, -92, "g"],
      [-70, 0.55, -86, "g"], [-24, 0.55, -86, "g"], [30, 0.55, -86, "g"],
      // cargo terminal — the aisles, plus the gantry bases
      [89, 0.55, -76, "g"], [93.3, 0.55, -60, "g"], [89, 0.55, -44, "g"],
      [93.3, 0.55, -28, "g"], [89, 0.55, -8, "g"], [93.3, 0.55, 8, "g"],
      [89, 0.55, 30, "g"], [93.3, 0.55, 50, "g"], [89, 0.55, 72, "g"],
      // bus depot and market street
      [-86, 0.55, 84, "g"], [-68, 0.55, 84, "g"], [-50, 0.55, 84, "g"],
      [-32, 0.55, 82, "g"], [6, 0.55, 84, "g"], [24, 0.55, 84, "g"],
      [52, 0.55, 84, "g"], [78, 0.55, 84, "g"], [90, 0.55, 72, "g"],
      // park strip
      [-93, 0.55, -66, "g"], [-93, 0.55, -34, "g"], [-88, 0.55, -22, "g"],
      [-93, 0.55, 4, "g"], [-88, 0.55, 36, "g"], [-93, 0.55, 48, "g"],
      [-88, 0.55, 70, "g"],
      // the avenues themselves — the connective tissue between districts
      [-60, 0.55, -40, "g"], [-60, 0.55, 40, "g"], [0, 0.55, -40, "g"],
      [0, 0.55, 44, "g"], [60, 0.55, -30, "g"], [60, 0.55, 62, "g"],
      [-30, 0.55, 0, "g"], [30, 0.55, 0, "g"], [-30, 0.55, -60, "g"],
      [30, 0.55, 60, "g"], [-16, 0.55, 30, "g"], [16, 0.55, -30, "g"]
    ],
    SPAWNS: [
      [-70, -70, 0.78, "a"], [-78, -58, 0.78, "a"], [-58, -78, 0.78, "a"],
      [-70, 70, -0.78, "a"], [-78, 58, -0.78, "a"], [-58, 78, -0.78, "a"],
      [-86, 0, 0, "a"], [-52, -22, 0.4, "a"], [-30, 24, -0.4, "a"],
      /* v9.1: WAS [-20,-86], [20,-86], [0,-86]. The north edge was bare
         pavement when these were placed; it is now the rail yard, and two of
         the three sat inside a permanent-way hut or a sleeper stack. Moved
         south onto the station deck (the slab over the subway spine, top y 0,
         x -24..24) which is open ground with cover on three sides. */
      [-20, -76, 1.57, "a"], [20, -86, 1.57, "a"], [8, -76, 1.57, "a"],
      [74, -66, 2.36, "b"], [78, -58, 2.36, "b"], [50, -78, 2.36, "b"],
      [70, 70, -2.36, "b"], [78, 58, -2.36, "b"], [58, 78, -2.36, "b"],
      [86, 0, 3.14, "b"], [70, -20, 2.7, "b"], [70, 20, -2.7, "b"],
      /* v9.1: [-20,86] was inside the new bus depot's back wall (x -96..-20,
         z 85..86). Moved east into the market street approach. */
      [-14, 86, -1.57, "b"], [20, 86, -1.57, "b"], [0, 86, -1.57, "b"]
    ],
    /* v8.18: WAS `AIRDROPS`. Every consumer reads AIRDROP_POINTS — rural uses
       it, the urban fallback in server.js builds it, and server/lib/loot.js:117
       does `const pts = mapData(room).AIRDROP_POINTS`. On metro that was
       undefined and the first airdrop tick killed the match, which is the
       "load error" Rahul hit every time he picked Metro City. */
    AIRDROP_POINTS: [
      [0, 22], [-46, -46], [46, -46], [-46, 46], [46, 46],
      [0, -60], [0, 60], [-60, 0], [60, 0], [26, 26]
    ]
  };
  return { MAPS_METRO: MAPS_METRO };
});
