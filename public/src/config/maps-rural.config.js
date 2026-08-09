(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {
  /* Rural map data — HOLLOW RIDGE (v9.0).

     Loot classes match Urban semantics: g ground scavenge, h elevated,
     s signature (armour-3 / legendary anchors). Support y = collider top + 0.55,
     which verify-map enforces by walking down from each point until it finds
     geometry — so every y below is derived from what the builder actually puts
     there, not guessed.

     SPAWN LAYOUT. Side a holds the west and the ridge approach; side b holds
     the east, lake and farm. Neutrals sit on the road spine and the river line.
     The two sides are deliberately NOT mirror images — the ridge gives a a
     height advantage, the quarry and windmill give b two answers to it, and the
     village sits between them as the close-quarters prize. */
  var MAPS_RURAL = {
    LOOT_POINTS: [
      [-118, 33.85, -112, "s"], [-110, 29.95, -120, "s"], [-104, 21.55, -96, "h"], [-86, 21.55, -74, "h"], [-90, 13.95, -56, "h"],
      [-70, 13.55, -60, "h"], [-102, 13.95, -52, "h"], [-66, 6.55, -44, "h"], [-100, 6.55, -40, "h"], [-52, 6.55, -50, "h"],
      [-36, 21.55, -94, "s"], [-18, 13.55, -88, "h"], [0, 6.55, -84, "h"], [106, 4.05, -70, "s"], [96, 0.55, -34, "h"],
      [72, 1.45, -50, "g"], [80, 1.45, -61, "g"], [68, 0.55, -92, "g"], [120, 0.55, -44, "g"], [-96, 0.55, 78, "g"],
      [-78, 0.55, 84, "g"], [-60, 0.55, 76, "g"], [-96, 0.55, 104, "g"], [-74, 0.55, 108, "g"], [-52, 0.55, 100, "g"],
      [-114, 0.55, 94, "g"], [-36, 0.55, 88, "g"], [-84, 4.85, 90, "g"], [-96, 6.25, 74, "s"], [-74, 6.25, 104, "h"],
      [-36, 6.25, 84, "h"], [74, 3.85, 88, "h"], [94, 11.85, 88, "s"], [118, 12.85, 52, "s"], [66, 0.55, 96, "g"],
      [82, 0.55, 96, "g"], [88, 0.55, 78, "g"], [100, 0.55, 68, "g"], [56, 0.55, 84, "g"], [104, 0.57, 10, "g"],
      [120, 0.57, 24, "g"], [132, 0.57, 14, "g"], [112, 0.57, 30, "g"], [18, 3.04, -46, "h"], [26, 3.04, -50, "h"],
      [14, 0.56, -62, "g"], [30, 0.56, -66, "g"], [8, 0.56, -40, "g"], [-30, 7.55, -30, "s"], [46, 7.55, 18, "s"],
      [-24, 7.55, 118, "s"], [120, 7.55, -20, "s"], [0, 1.41, 46, "h"], [-84, 1.41, 46, "h"], [92, 1.41, 46, "h"],
      [46, 0.9, 47, "g"], [-20, 2.15, -18, "g"], [22, 2.35, -12, "g"], [58, 2.05, 40, "g"], [-40, 1.95, 40, "g"],
      [70, 2.25, 10, "g"], [-58, 2.05, 24, "g"], [34, 2.15, 66, "g"], [-120, 2.45, 20, "g"], [110, 2.25, 100, "g"],
      [-8, 2.15, -110, "g"], [46, 1.95, -100, "g"], [130, 2.35, 120, "g"], [-132, 2.15, 118, "g"], [86, 2.05, 130, "g"],
      [-14, 1.85, 20, "g"], [140, 0.56, -80, "g"], [-140, 0.55, -20, "g"], [20, 0.55, 120, "g"]
    ],
    SPAWNS: [
      // side a — west, ridge approach, west village
      [-138, -20, 1.57, "a"], [-126, 40, 1.2, "a"], [-140, 96, 0.9, "a"],
      [-64, -20, 0.6, "a"], [-30, -128, 2.6, "a"], [-96, 20, 1.2, "a"],
      [-108, 120, 2.2, "a"], [-128, -20, 1.3, "a"], [-64, 126, 2.4, "a"],
      [-44, 12, 1.1, "a"],
      // side b — east, lake, farm, quarry
      [138, -14, 4.71, "b"], [128, 26, 3.6, "b"], [60, 118, 3.4, "b"],
      [138, 100, 3.8, "b"], [44, -60, 3.6, "b"], [140, -60, 4.2, "b"],
      [70, 26, 3.4, "b"], [34, -132, 2.9, "b"], [110, 132, 3.5, "b"],
      [128, -108, 4.4, "b"],
      // neutral — spine, river line, centre
      [24, -92, 3.14, "n"], [0, 24, 0, "n"], [-20, 70, 0, "n"],
      [20, -24, 0, "n"], [88, 24, 4.7, "n"], [-80, 60, 1.6, "n"],
      [40, 100, 3.0, "n"], [-4, 130, 3.14, "n"]
    ],
    /* v9.0: WATER_ZONES exist so the cover validator can tell "nobody built
       cover here" apart from "cover is impossible here". You cannot put a wall
       in a lake. Without this the river and lake read as 11% dead ground and
       the only way to pass would be to raise the budget, which would hide real
       dead ground on the land at the same time. Declared as [x0,z0,x1,z1]. */
    WATER_ZONES: [
      [-150, 40, 150, 54],       // the river, bank to bank
      [62, -96, 126, -40]        // the lake
    ],
    AIRDROP_POINTS: [
      [0, -60], [-34, 30], [34, 78], [0, 92],
      [-100, -30], [100, 24], [-40, -128], [56, -44],
      [-118, 100], [120, 88], [92, -66], [-24, -108]
    ]
  };
  return { MAPS_RURAL: MAPS_RURAL };
});
