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
  /* ===== v2.2 - URBAN SMALL's tables are URBAN's, filtered to the core =====
     Everything inside |x|,|z| <= 106 (the ring boulevard is the edge road; the
     wall stands at 108). Derived here, not hand-copied, so a change to Urban's
     core loot or spawns reaches Urban Small automatically. The server's
     mapData() picks this up by the MAPS_<ID> convention. */
  (function () {
    var LIM = 106, inCore = function (x, z) { return Math.abs(x) <= LIM && Math.abs(z) <= LIM; };
    C.MAPS_URBANSMALL = {
      SPAWNS: (C.SPAWNS || []).filter(function (s) { return inCore(s[0], s[1]); }),
      LOOT_POINTS: (C.LOOT_POINTS || []).filter(function (p) { return inCore(p[0], p[2]); }),
      AIRDROP_POINTS: ((C.AIRDROP && C.AIRDROP.points) || []).filter(function (p) { return inCore(p[0], p[1]); })
    };
  })();
  return C;
});
