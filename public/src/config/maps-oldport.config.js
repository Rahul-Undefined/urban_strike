(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { var r = factory(); for (var k in r) root[k] = r[k]; }
}(typeof self !== "undefined" ? self : this, function () {
  /* OLD PORT — v2.11. The Urban Small weight class on a different continent:
     160 x 160, eight players, a whitewashed harbour town (oldport.js has the
     plan). Loot sits on the streets and the piazza, not inside the houses —
     the house is where you go to hold it. The quay is the open ground: fast
     to cross, nothing to hide behind but the crate stacks. Random airdrops
     (v2.8) use the map's extent; AIRDROP_POINTS is the fallback only. */
  var MAPS_OLDPORT = {
    LOOT_POINTS: [
      /* the piazza — contested */
      [0, 0.55, 0, "s"], [-8, 0.55, 10, "g"], [8, 0.55, 10, "g"], [0, 0.55, 22, "h"],
      /* the main crossing, north and south of the piazza */
      [0, 0.55, -34, "g"], [0, 0.55, 36, "g"], [-20, 0.55, -8, "g"], [20, 0.55, -8, "g"],
      /* the four blocks' lanes */
      [-42, 0.55, -36, "g"], [-42, 0.55, -30, "h"], [-54, 0.55, -42, "g"], [-30, 0.55, -42, "s"],
      [42, 0.55, -48, "g"], [42, 0.55, -54, "h"], [54, 0.55, -42, "g"], [30, 0.55, -42, "s"],
      [-42, 0.55, 26, "g"], [-42, 0.55, 32, "h"], [-54, 0.55, 20, "g"], [-30, 0.55, 20, "s"],
      [42, 0.55, 14, "g"], [42, 0.55, 8, "h"], [54, 0.55, 20, "g"], [30, 0.55, 20, "s"],
      /* the north street under the terrace */
      [-56, 0.55, -56, "g"], [-22, 0.55, -58, "g"], [28, 0.55, -58, "g"], [56, 0.55, -56, "g"],
      /* the quay — open, so it pays */
      [-54, 0.55, 70, "s"], [-20, 0.55, 60, "g"], [0, 0.55, 64, "h"], [20, 0.55, 58, "g"], [60, 0.55, 70, "s"],
      /* the sides */
      [-72, 0.55, 0, "g"], [72, 0.55, 0, "g"], [-72, 0.55, 40, "h"], [72, 0.55, -40, "h"]
    ],
    /* [x, z, yaw, side]: side "a" is the town (north), "b" the quay (south), "n" either — team modes split north/south */
    SPAWNS: [
      [-72, -72, 0.8, "a"], [72, -72, -0.8, "a"], [0, -74, 0, "a"], [-72, -20, 1.2, "a"], [30, -72, -0.4, "a"], [72, -40, -1.2, "a"],
      [-72, 72, 2.4, "b"], [72, 72, -2.4, "b"], [0, 72, 3.14, "b"], [72, 44, -1.9, "b"], [-30, 72, 2.8, "b"], [-72, 40, 1.9, "b"],
      [-74, 0, 1.57, "n"], [74, 0, -1.57, "n"]
    ],
    AIRDROP_POINTS: [[0, 0], [-42, -42], [42, -42], [-42, 20], [42, 20], [0, 64], [-54, 70], [60, 70]]
  };
  return { MAPS_OLDPORT: MAPS_OLDPORT };
}));
