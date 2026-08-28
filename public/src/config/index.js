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
      require('./maps-rural.config.js'),
      require('./maps-metro.config.js'),
      require('./maps-killhouse.config.js'),
      require('./maps-sunsetrow.config.js'),
      require('./maps-small.config.js'),
      require('./maps-medium.config.js'),
      require('./botmode.config.js')
    ]);
  } else {
    root.CFG = factory(root.__CFG_PARTS || []);
  }
})(typeof self !== 'undefined' ? self : this, function (parts) {
  var C = {};
  parts.forEach(function (p) { for (var k in p) C[k] = p[k]; });
  /* v14.0 BOT MODE seam: the pool rides CFG.WEAPONS so the proven combat
     path (fireRateOk, server damage, lag-comp) covers it with zero new
     combat code; pool:'botmode' is what every multiplayer-side filter
     excludes on. The fold is additive — a bm_ id can never collide with a
     multiplayer id by naming convention, asserted in verify-botmode. */
  if (C.WEAPONS_BOTMODE && C.WEAPONS) {
    for (var bw in C.WEAPONS_BOTMODE) {
      C.WEAPONS[bw] = C.WEAPONS_BOTMODE[bw];
      /* WEAPON_ORDER is the WIRE FORMAT (wp is an index into it) — bm ids are
         APPENDED so every existing index keeps its meaning forever. */
      if (C.WEAPON_ORDER && C.WEAPON_ORDER.indexOf(bw) === -1) C.WEAPON_ORDER.push(bw);
    }
  }
  /* v14.0: the pool's LOOT ITEMS live in loot.config.js beside every other
     weapon entry (wpn_bm_*, with player-facing labels) — authored there, not
     synthesized here. The walls in server/lib/loot.js key on
     CFG.WEAPONS[w].pool, so no per-entry tag is needed. */
  return C;
});
