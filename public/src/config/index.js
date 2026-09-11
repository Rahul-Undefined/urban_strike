/* Merges the config parts into the single CFG contract.
   Browser: parts register into __CFG_PARTS via their UMD wrappers (load them
   before this file). Node: this file requires them directly. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory([
      require('./weapons.config.js'),
      require('./gameplay.config.js'),
      require('./loot.config.js'),
      require('./world.config.js'),
      require('./maps-metro.config.js'),
      require('./maps-killhouse.config.js'),
      require('./maps-sunsetrow.config.js'),
      require('./maps-small.config.js'),
      require('./maps-medium.config.js')
    ]);
  } else {
    root.CFG = factory(root.__CFG_PARTS || []);
  }
})(typeof self !== 'undefined' ? self : this, function (parts) {
  var C = {};
  parts.forEach(function (p) { for (var k in p) C[k] = p[k]; });
  /* ===== v1.0d - THE ARENA REDEPLOY LADDER, resolved after the fold =====
     Lives here because it needs MATCH (gameplay.config) AND isArena
     (world.config), which are separate parts on both platforms. Arenas climb
     MATCH.respawnLadder by death bucket; every other map returns the flat
     MATCH.respawnDelay. See gameplay.config.js for the numbers. */
  C.respawnDelayFor = function (mapId, deaths) {
    var flat = (C.MATCH && C.MATCH.respawnDelay) || 5;
    if (!(C.isArena && C.isArena(mapId))) return flat;
    var L = C.MATCH && C.MATCH.respawnLadder;
    if (!L || !L.length) return flat;
    var d = Math.max(1, deaths | 0);
    for (var i = 0; i < L.length; i++) if (d <= L[i][0]) return L[i][1];
    return L[L.length - 1][1];
  };
  /* ===== v1.0d - THE ARENA REDEPLOY LADDER, resolved after the fold =====
     Lives here because it needs MATCH (gameplay.config) AND isArena
     (world.config), which are separate parts on both platforms. Arenas climb
     MATCH.respawnLadder by death bucket; every other map returns the flat
     MATCH.respawnDelay. See gameplay.config.js for the numbers. */
  C.respawnDelayFor = function (mapId, deaths) {
    var flat = (C.MATCH && C.MATCH.respawnDelay) || 5;
    if (!(C.isArena && C.isArena(mapId))) return flat;
    var L = C.MATCH && C.MATCH.respawnLadder;
    if (!L || !L.length) return flat;
    var d = Math.max(1, deaths | 0);
    for (var i = 0; i < L.length; i++) if (d <= L[i][0]) return L[i][1];
    return L[L.length - 1][1];
  };
  return C;
});
