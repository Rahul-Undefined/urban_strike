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
      require('./maps-kasbah.config.js'),  /* v2.8: sunsetrow, small and medium tables removed with their maps */
      require('./maps-urbansmall2.config.js')   /* v2.11 */
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
  /* ===== v2.3 - THE FRAG'S REACH PER MAP (Rahul): 50 m / 20 m kill radius on
     Urban and Urban Small; 40% of that (20 m / 8 m) on every arena — "the map
     is small, it is not fun." Client blast damage and the FX ring read this. */
  C.ARENA_BLAST = 0.4;
  C.fragSpecFor = function (mapId) {
    var F = C.THROWS.frag, k = (C.isArena && C.isArena(mapId)) ? C.ARENA_BLAST : 1;
    if (k === 1) return F;
    var out = {}; for (var key in F) out[key] = F[key];
    out.radius = F.radius * k; out.killRadius = F.killRadius * k; out.selfRadius = F.selfRadius * k; out.fxRadius = Math.max(4, F.fxRadius * k);
    return out;
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
    /* ===== v2.11 - URBAN SMALL 2's TABLES =====
       Urban Small's, turned the same quarter the world is turned —
       (x, z) -> (z, -x), facing + 90 deg — plus the EXTRA points generated
       from the turned geometry (tools/gen-urbansmall2-points.js ->
       config/maps-urbansmall2.config.js). */
    var X2 = C.MAPS_URBANSMALL2_EXTRA || { LOOT_POINTS: [], AIRDROP_POINTS: [], SPAWNS: [] };
    var S = C.MAPS_URBANSMALL;
    C.MAPS_URBANSMALL2 = {
      SPAWNS: S.SPAWNS.map(function (s) { return [s[1], -s[0], s[2] + Math.PI / 2, s[3]]; }).concat(X2.SPAWNS || []),
      LOOT_POINTS: S.LOOT_POINTS.map(function (p) { return [p[2], p[1], -p[0], p[3]]; }).concat(X2.LOOT_POINTS || []),
      AIRDROP_POINTS: S.AIRDROP_POINTS.map(function (p) { return [p[1], -p[0]]; }).concat(X2.AIRDROP_POINTS || [])
    };
  })();
  /* ===== v2.5 - WHICH DURATIONS A ROOM MAY PICK =====
     The one resolver both server clamps (rooms.js create, server.js
     updateSettings) and the lobby select read. A zone mode is ALWAYS the
     default 15 — its circle schedule is cut to that clock. Otherwise a
     `longMatch` map (Urban, Urban Small) offers the whole MATCH.timeOptions
     list (15, 30); every arena offers the default only. */
  /* v2.8: 10 joins. A zone mode is still ALWAYS the default 15; a longMatch
     map (Urban, Urban Small, Kasbah) offers the whole list (10, 15, 30); every
     other map (the Killhouse) offers everything up to the default (10, 15). */
  C.timeOptionsFor = function (modeId, mapId) {
    var M = C.MATCH || {}, def = M.defaultMinutes || 15, all = M.timeOptions || [def];
    var mode = C.MODES && C.MODES[modeId], map = C.MAPS && C.MAPS[mapId];
    if (mode && mode.zone) return [def];
    if (map && map.longMatch) return all.slice();
    return all.filter(function (n) { return n <= def; });
  };
  /* ===== v2.8 - PER-LIFE FRAGS AND MINES ON THE SMALL MAPS =====
     Rahul: "max 1 frag and 3 mines in the small maps, every new life." Small
     maps are the arenas (isArena) — after the v2.8 roster that is the
     Killhouse; Urban Small and Kasbah are theatres and keep their stock.
     One resolver per number, read by the client's loadout, the server's
     spawn refill and the server's pickup cap, so the three can never disagree. */
  C.fragCountFor = function (mapId) {
    var F = C.THROWS.frag;
    return (C.isArena && C.isArena(mapId) && F.countArena !== undefined) ? F.countArena : F.count;
  };
  C.mineStartFor = function (mapId) {
    var G = C.GEAR.mine;
    return (C.isArena && C.isArena(mapId) && G.startArena !== undefined) ? G.startArena : G.start;
  };
  C.mineCapFor = function (mapId) {
    var G = C.GEAR.mine;
    return (C.isArena && C.isArena(mapId) && G.maxCarryArena !== undefined) ? G.maxCarryArena : G.maxCarry;
  };
  /* ===== v2.8 - ASSAULT: WHICH GUNS A MODE ALLOWS =====
     gunAllowed(mode, w) is false only for a FIREARM outside ASSAULT_GUNS in an
     assault mode. Melee, throwables, gear slots and every non-assault mode
     answer true, so this can be asked of anything without a special case. */
  C.isAssault = function (modeId) { return !!(C.MODES && C.MODES[modeId] && C.MODES[modeId].assault); };
  C.gunAllowed = function (modeId, w) {
    if (!C.isAssault(modeId)) return true;
    var W = C.WEAPONS && C.WEAPONS[w];
    if (!W) return true;                                   // frag, molotov, zone, drone blast...
    if (W.type === 'melee' || W.gear) return true;         // the knife; drone / EMP / C4 slots
    return (C.ASSAULT_GUNS || []).indexOf(w) >= 0;
  };
  /* A loot item a room may roll or draw. Weapons in an assault room must be
     assault rifles; everything else is decided by the existing rules. */
  C.lootAllowed = function (modeId, mapId, t) {
    var it = C.LOOT_ITEMS && C.LOOT_ITEMS[t];
    if (!it) return false;
    if (it.kind === 'weapon' && !C.gunAllowed(modeId, it.w)) return false;
    var mm = C.MAPS && C.MAPS[mapId];
    if (mm && mm.crateExclude && mm.crateExclude.indexOf(t) >= 0) return false;
    return true;
  };
  /* ===== v2.8 - PER-MAP RADAR (the Killhouse) =====
     { alwaysShowPlayers, proximity } — the map's own `radar` over MINIMAP. */
  C.radarFor = function (mapId) {
    var base = C.MINIMAP || {}, ov = (C.MAPS && C.MAPS[mapId] && C.MAPS[mapId].radar) || null;
    if (!ov) return base;
    var out = {}, k;
    for (k in base) out[k] = base[k];
    for (k in ov) out[k] = ov[k];
    return out;
  };
  return C;
});
