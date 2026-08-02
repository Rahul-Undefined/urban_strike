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
      [92, 30.85, -52, "s"]
    ],
    SPAWNS: [
      [-70, -70, 0.78, "a"], [-78, -58, 0.78, "a"], [-58, -78, 0.78, "a"],
      [-70, 70, -0.78, "a"], [-78, 58, -0.78, "a"], [-58, 78, -0.78, "a"],
      [-86, 0, 0, "a"], [-52, -22, 0.4, "a"], [-30, 24, -0.4, "a"],
      [-20, -86, 1.57, "a"], [20, -86, 1.57, "a"], [0, -86, 1.57, "a"],
      [74, -66, 2.36, "b"], [78, -58, 2.36, "b"], [50, -78, 2.36, "b"],
      [70, 70, -2.36, "b"], [78, 58, -2.36, "b"], [58, 78, -2.36, "b"],
      [86, 0, 3.14, "b"], [70, -20, 2.7, "b"], [70, 20, -2.7, "b"],
      [-20, 86, -1.57, "b"], [20, 86, -1.57, "b"], [0, 86, -1.57, "b"]
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
