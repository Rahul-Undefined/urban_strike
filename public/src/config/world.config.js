(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  var COLORS = ['#f0a232', '#4fa3e0', '#63d968', '#e2503c', '#c778e8',
    '#40c8c0', '#e8d040', '#e878a8', '#90a8ff', '#a8e070'];

  /* v8.34 TEN TEAMS, NOT TWO.

     Everything up to here assumed exactly 'a' and 'b'. Squad play needs up to
     ten, so the table is extended rather than replaced: a and b keep AMBER and
     COBALT so every existing 2-team mode, saved room and test reads exactly as
     it did. Colours track CFG.COLORS in the same order, so a squad's colour on
     the minimap, on the nameplate and on the scoreboard is one value. */
  var TEAMS = {
    a: { name: 'AMBER',   color: '#f0a232' },
    b: { name: 'COBALT',  color: '#4fa3e0' },
    c: { name: 'VERDANT', color: '#63d968' },
    d: { name: 'CRIMSON', color: '#e2503c' },
    e: { name: 'ORCHID',  color: '#c778e8' },
    f: { name: 'TEAL',    color: '#40c8c0' },
    g: { name: 'SAFFRON', color: '#e8d040' },
    h: { name: 'ROSE',    color: '#e878a8' },
    i: { name: 'AZURE',   color: '#90a8ff' },
    j: { name: 'LIME',    color: '#a8e070' }
  };
  var TEAM_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

  /* v8.37 MODES, GROUPED.

     Ten flat entries in one dropdown had become a wall of text. They are now
     picked in two steps — CATEGORY then VARIANT — which is what MODE_CATS below
     describes. The flat table stays exactly as it is because it is
     server-authoritative and every gate reads it; the grouping is a view over
     it, not a replacement for it.

     `lives` turns a mode into an elimination match. Absent or 0 means the
     normal kill/clock rules apply. */
  /* ===== v1.0d - BOT MODE IS GONE. Rahul, twice: "remove the bot mode
     completely from the game." Every bots-versus-players product — the v8.38
     Overrun/Strike Team modes behind the v10.9 kill switch, the v14.0 Bot Mode
     (bm_solo/bm_team/bm_battle on Blacksite) and seat backfill — is removed
     from MODES, MAPS, the picker, the server and the tests. server/lib/bots.js
     survives ONLY as the headless collider harness the geometry gates and the
     intel/hazard line-of-sight checks read; it fields nothing. Do not bring
     it back. */


  var MODES = {
    /* v10.9 ROOM CAP 20 -> 15. Rahul asked for this to reduce load. The
       disconnect it was aimed at turned out to be a client-side GPU leak
       (see avatars.js v10.9), not server pressure — but the cap is kept for
       the reason it actually helps: five fewer remote avatars is five fewer
       rigs to skin, pose and draw on every client, every frame.

       Every mode that could reach 20 is re-shaped below. A mode whose
       teamCount x squadSize exceeds the cap cannot fill, so the shape changes,
       not just the ceiling. */
    ffa:  { label: 'Free For All',      vlabel: 'Free For All',  cat: 'ffa',    teams: false, teamCount: 0,  maxPlayers: 15 },
    t2:   { label: '2 vs 2',            vlabel: '2 vs 2',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 4 },
    t3:   { label: '3 vs 3',            vlabel: '3 vs 3',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 6 },
    t4:   { label: '4 vs 4',            vlabel: '4 vs 4',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 8 },
    t5:   { label: '5 vs 5',            vlabel: '5 vs 5',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 10 },
    t6:   { label: '6 vs 6',            vlabel: '6 vs 6',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 12 },
    t8:   { label: '7 vs 7',            vlabel: '7 vs 7',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 14 },
    /* v10.9: 10 vs 10 needed 20 and the cap is 15, so the ladder now tops out at
       t8 = 7 vs 7. This id is HIDDEN rather than deleted: mode ids are
       server-authoritative, every gate reads this table, and a saved room
       setting may still name it. Hidden keeps all of that valid while taking
       it out of the picker. It is capped to match t8 so a stale reference
       cannot open a 20-slot room. */
    t10:  { label: '7 vs 7',            vlabel: '7 vs 7',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 14, hidden: true },
    sq2:  { label: 'Squads \u00b7 7 \u00d7 2', vlabel: '7 squads of 2', cat: 'squads', teams: true, squads: true, teamCount: 7, squadSize: 2, maxPlayers: 14 },
    sq4:  { label: 'Squads \u00b7 5 \u00d7 3',  vlabel: '5 squads of 3',  cat: 'squads', teams: true, squads: true, teamCount: 5,  squadSize: 3, maxPlayers: 15 },

    /* LAST STAND. One life. No respawn, no clock — the match ends when one
       operator, or one squad, is the only thing left breathing.

       Camping is answered by the map rather than by a timer: pressing M shows
       where everyone is, so hiding buys you position, not safety. That is why
       these carry minutes 0 and killTarget 0 and still always terminate — the
       end condition is elimination, which cannot stall while anyone is alive. */
    ls:   { label: 'Last Stand \u00b7 Solo', vlabel: 'Solo \u00b7 every operator for themselves',
            cat: 'last', teams: false, teamCount: 0, maxPlayers: 15, lives: 1,
            /* v15.0 (fix 3): exact contacts on the M map are opt-in per mode now,
               so Solo carries the flag its own anti-camping design relies on. */
            fullMapContacts: true },
    /* v9.4 `fullMapContacts` — the escape hatch the v9.2 gate said to use.
       Hiding contacts on the full map is right for Team Battle and Squads,
       where the map is a free intel screen in a match that never pauses. Last
       Stand is the exception BY DESIGN: its whole anti-camping answer is that
       pressing M shows where everyone is, so hiding buys you position and not
       safety. Marking the two squad variants restores that without a special
       case wired into minimap.js. Solo is already free-for-all shaped. */
    lsq2: { label: 'Last Stand \u00b7 Squads 7 \u00d7 2', vlabel: '7 squads of 2',
            cat: 'last', teams: true, squads: true, teamCount: 7, squadSize: 2, maxPlayers: 14, lives: 1, fullMapContacts: true },
    lsq4: { label: 'Last Stand \u00b7 Squads 5 \u00d7 3',  vlabel: '5 squads of 3',
            cat: 'last', teams: true, squads: true, teamCount: 5,  squadSize: 3, maxPlayers: 15, lives: 1, fullMapContacts: true }
  };

  /* ===== v11.0 - ARENA MAPS (small + medium) — the one predicate every
     per-map tuning reads: spawn protection, the nuke, the mine ration, the
     redeploy ladder, the big-map-only loot. */
  function isArena(mapId) {
    var m = MAPS[mapId];
    return !!(m && (m.arena || m.smallMap));
  }

  function spawnProtectFor(mapId) {
    var m = MAPS[mapId];
    var G = (typeof MATCH !== 'undefined') ? MATCH : null;
    var base = G ? G.spawnProtect : 2.5;
    var small = G && G.spawnProtectSmall !== undefined ? G.spawnProtectSmall : 1.0;
    return isArena(mapId) ? small : base;
  }

  var MODE_CATS = [
    { id: 'ffa',    label: 'Free For All',
      blurb: 'Fifteen operators. No sides. Highest count when the clock dies.' },
    { id: 'team',   label: 'Team Battle',
      blurb: 'Two sides, your pick of size. First team to the kill target.' },
    { id: 'squads', label: 'Squads',
      blurb: 'Many small squads, one sector. Your squad\u2019s kills are your score.' },
    { id: 'last',   label: 'Last Stand',
      blurb: 'One life. No respawn. No clock. Last one breathing wins.' }
  ];
  /* v10.9: `hidden` takes a mode out of the PICKER without taking it out of
     the table. Deleting a mode id breaks every gate that reads MODES, the
     server guards that switch on it, and any saved room setting naming it.
     Hiding is reversible in one word, which is the whole point. */
  function modesInCat(catId) {
    return Object.keys(MODES).filter(function (m) { return MODES[m].cat === catId && !MODES[m].hidden; });
  }
  /* v10.9: a CATEGORY with no visible modes must not appear either, or the
     welcome screen still offers "Overrun" and "Strike Team" and picking one
     lands on an empty variant list. Derived from MODES rather than listed by
     hand, so it can never disagree with which modes are actually hidden. */
  var VISIBLE_CATS = MODE_CATS.filter(function (c) { return modesInCat(c.id).length > 0; });
  function livesFor(modeId) { return (MODES[modeId] && MODES[modeId].lives) || 0; }
  function isElimination(modeId) { return livesFor(modeId) > 0; }

  /* THE single source of truth for which sides are in play. Server and client
     both call this; nothing anywhere else is allowed to hardcode 'a'/'b'. */
  function activeTeams(modeId) {
    var m = MODES[modeId];
    if (!m || !m.teams) return [];
    return TEAM_IDS.slice(0, Math.max(2, Math.min(TEAM_IDS.length, m.teamCount || 2)));
  }
  // Map registry — rural flips ready:true when its build + data land
  /* v8.18 PER-MAP LIGHTING.

     RENDER was global, so every map inherited Urban's dusk. Metro City is
     specified as a NIGHT map and there was no mechanism to express that at
     all — lighting() read CFG.RENDER directly and nothing per-map could reach
     it.

     A map may now carry a `render` object; lighting() shallow-merges it over
     CFG.RENDER. Omit a key and the global value stands, so this cannot break
     Urban or Rural by existing. IMPORTANT: this changes light COLOURS and
     INTENSITIES only, never the light COUNT — the 7-light budget in
     verify-batch is untouched, which is the whole reason it is done this way
     rather than by adding street lamps. */
  var NIGHT = {
    sky: 0x0a0f1c, fogColor: 0x0a0f1c, fogDensity: 0.0075,
    hemiSky: 0x3a4a68, hemiGround: 0x101720, hemiIntensity: 0.55,
    ambColor: 0x2a3550, ambIntensity: 0.42,
    sunColor: 0x9fc0ff, sunIntensity: 0.38          // moonlight, not sun
  };

  var MAPS = {
    /* v15.0 (fix 4): 100 -> 120. The outer ring (districts-outer.js _buildPart6)
       adds four districts and four control towers around the old perimeter. */
    urban: { label: 'Urban', ready: true, bound: 120 },
    /* v15.0 (fix 14): RURAL REMOVED. Rahul: "it is of no use now, remove it
       completely." Builder, config table, script tags, harness lists and gate
       budgets all deleted in the same commit — the entry is not hidden, it is
       gone, so a stale room setting naming it falls to urban at makeRoom. */
    metro: { label: 'Metro City', ready: true, render: NIGHT },
    /* v10.10 KILLHOUSE. Indoor 58 x 34 m warehouse, humans only.
       `bound` 32 puts the out-of-bounds ring just outside the 29 m wall, so a
       player shoved into the wall is not also shoved out of the world.
       `maxPlayers` caps EVERY mode on this map at 8 regardless of what the mode
       table allows: 15 operators in this footprint is not a fight. Read by the
       lobby alongside the mode cap, lower of the two wins. */
    /* v10.20: rebuilt to Rahul's plan — PORTRAIT, 40 x 68 m. bound 38 puts the
       out-of-bounds ring just outside the 34 m end walls. maxPlayers 10 rather
       than 8: the old landscape map was 58 x 34 and this one has nearly twice
       the floor, so it carries two more without becoming a blender. */
    /* v15.0 (fixes 11/12): 52 x 88 m, bound 48 (ring just outside the 44 m end
       walls), 15 players — the deck in the middle is what makes fifteen a fight
       rather than a blender. */
    killhouse: { label: 'Killhouse', ready: true, bound: 48, maxPlayers: 15, indoor: true, smallMap: true },
    /* v10.12 SUNSET ROW. Two houses across a street, 64 x 40 m. Same rule set
       as killhouse — 8 players, nuke killstreak, visor in the crate pool, no
       sniper or RPG on the floor — but a different SHAPE: rooms and a street
       rather than three parallel lanes. `smallMap: true` is what carries the
       shared rules, so a third small map inherits them by setting one flag
       instead of by someone remembering four separate places. */
    sunsetrow: { label: 'Sunset Row', ready: true, bound: 46, maxPlayers: 15, smallMap: true },   /* v15.0 (fix 12): 64 x 84 m */
    /* v10.14: three more small maps, replacing Outbreak. Each is a SHAPE the
       roster did not have — see maps-small.config.js for why these three.
       All carry `smallMap`, which is what grants the nuke killstreak, the
       8-player cap and the crate-only visor without anyone remembering four
       separate places. */
    /* v15.0 (fix 12): every small map grew for a 15-player room — an outer
       ring of the same vocabulary around each untouched core. Bounds sit just
       outside the new fences (HX + 4). */
    freightyard: { label: 'Freightyard', ready: true, bound: 38, maxPlayers: 15, smallMap: true },
    bazaar:      { label: 'Bazaar',      ready: true, bound: 46, maxPlayers: 15, smallMap: true },
    substation:  { label: 'Substation',  ready: true, bound: 40, maxPlayers: 15, smallMap: true },
    /* v10.21 MEDIUM TIER. `arena: true` without `smallMap` — they carry the
       arena RULES (nuke killstreak, 1 s spawn protection, crate visor) at a
       size where a sniper is a real weapon rather than a liability. Twelve
       players: between the arenas' 8-10 and the theatres' 15. */
    riverside:   { label: 'Riverside',   ready: true, bound: 66, maxPlayers: 12, arena: true },
    airfield:    { label: 'Airfield',    ready: true, bound: 70, maxPlayers: 12, arena: true },
    /* v14.0 BLACKSITE — the bot-mode-only map. `botOnly` is enforced
       server-side at create/updateSettings (a non-bot mode asking for it is
       coerced away) and client-side in the map picker; the three bm_ modes
       mapLock to it, so the pairing is exclusive in BOTH directions. Arena
       rules at theatre-ish size; maxPlayers 24 seats 4 humans plus the
       BATTLE ceiling of 20 machines. */
  };

  /* v8.25: alwaysShowPlayers. Rahul asked for player locations on the map and
     got the radar's detection rule instead — enemies only when they had just
     fired or were already close. In a 2-4 player deathmatch on a 200 m map
     that means an empty dial almost all the time, which reads as broken
     rather than as stealth. One flag, read by BOTH the dial and the full map,
     so the two can never disagree about whether a contact is shown. Set it
     false to go back to detection-gated enemies. */
  var MINIMAP = { alwaysShowPlayers: true, proximity: 18 };   // meters at which an enemy pings the minimap without firing
  // V4.1 stylized dusk -- all scene lighting/atmosphere lives here, not in source.
  /* ===== v15.0 (fix 13) - A CLEARER AFTERNOON =====
     Rahul: the urban colours were "outdated". The old dusk was one grey-blue
     (sky = fog = 0x2b3348) that flattened every facade into the same value.
     This is a bright late afternoon: a saturated sky, a lighter haze that
     lets the 240 m map read to its far wall (density 0.0040 -> 0.0030), a
     warm high sun and cool blue fill so shadows have colour instead of mud.
     Light COUNT is untouched — colours and intensities only, the same rule
     the per-map NIGHT override follows. Metro keeps its night. */
  var RENDER = {
    mergeStatic: true,   // collapse static geometry into per-material meshes
    sky: 0x4d6ea6, fogColor: 0x7d95bd, fogDensity: 0.0030,
    hemiSky: 0xd6e6ff, hemiGround: 0x5a4632, hemiIntensity: 0.95,
    ambColor: 0x4c5a74, ambIntensity: 0.30,
    sunColor: 0xffd39a, sunIntensity: 1.45, sunPos: [70, 82, 34],
    lampGlow: 0xffb25a, lampPool: 0.26   // streetlight halo color + ground-pool strength
    // lampPool raised 0.16 -> 0.26 in v7.5: it now carries the street lighting
    // that two point lights used to provide, at zero shading cost.
  };

  /* ===== v1.0e - THE TRAIN =====
     Rahul: "add a moving train across the boundary of the map so that if a
     player gets in the train it can travel from one place to another... it
     stops at the station for 3 seconds then again moves to take the whole leap
     across the map. Train compartments should allow players to get in and
     shoot as well."

     One loop per map that has one. `waypoints` is the centreline as a closed
     polyline; every corner is filleted with an arc of radius `fillet` by
     World.trainPath(), which also gives the loop its arc length. The schedule
     is DETERMINISTIC in match time — position = f(serverNow - startedAt) — so
     every client and the server compute the same train with no traffic: the
     train leaves the station `dwellSec` after the match starts, runs the loop at
     `speed`, slows over `brakeM` into the station, dwells, and goes again.
     `stationAt` is the waypoint index the stop is measured from (the train's
     head stops `stopOffset` m past it). The rails are laid by
     districts-outer.js from the same path, so track and train cannot disagree.

     Urban's loop: the ring boulevard at ±103 (the old wall line), with a
     detour through SECTOR 7 CENTRAL — an S-bend off the north side onto Track
     2 (the freight road, z -88.0, beside the island platform), east along the
     platforms and under the footbridge, back out to the east side. */
  var TRAIN = {
    urban: {
      waypoints: [[-103, -103], [-6, -103], [9, -88], [103, -88], [103, 103], [-103, 103]],
      fillet: 8, speed: 8.0, dwellSec: 3, brakeM: 24, accelM: 30,
      stationAt: 2, stopOffset: 62,          // waypoint 2 is (9,-88): the HEAD stops at x ~74, so all three coaches stand along the island platform (x 26..68)
      floor: 1.05, roof: 3.75,               // coach floor (platform height) and roof walking surface
      cars: 4                                 // locomotive + 3 coaches
    }
  };

  /* v1.0f: THE SCHEDULE IS SHARED. The server kills whoever the moving train
     hits, so it must place the train exactly where every client draws it —
     the same two pure functions, called with the same match time. */
  function trainSchedule(cfg, length, stationS) {
    var L = length, v = cfg.speed, A = Math.min(cfg.accelM || 30, L / 4), B = Math.min(cfg.brakeM || 24, L / 4), D = cfg.dwellSec || 3;
    var tA = 2 * A / v, tB = 2 * B / v, tC = (L - A - B) / v;
    return { L: L, v: v, A: A, B: B, D: D, tA: tA, tB: tB, tC: tC, T: D + tA + tC + tB, s0: stationS };
  }
  function trainHeadAt(S, tMatch) {
    var tau = ((tMatch % S.T) + S.T) % S.T, s, vv;
    if (tau < S.D) { s = 0; vv = 0; }
    else if (tau < S.D + S.tA) { var a = (tau - S.D) / S.tA; s = S.A * a * a; vv = S.v * a; }
    else if (tau < S.D + S.tA + S.tC) { s = S.A + S.v * (tau - S.D - S.tA); vv = S.v; }
    else { var b = (tau - S.D - S.tA - S.tC) / S.tB; s = S.A + S.v * S.tC + S.B * (2 * b - b * b); vv = S.v * (1 - b); }
    return { s: S.s0 + s, v: vv };
  }
  /* The train's car layout, shared too: [length, offset of each car's centre behind the head]. */
  function trainCars(cfg) {
    var n = Math.max(2, cfg.cars || 4), LOCO = 11.0, CL = 12.0, GAP = 0.9, off = 0, out = [];
    for (var i = 0; i < n; i++) { var L = i === 0 ? LOCO : CL; off += L / 2; out.push({ L: L, off: off, coach: i > 0 }); off += L / 2 + GAP; }
    return out;
  }

  return { COLORS: COLORS, TEAMS: TEAMS, TEAM_IDS: TEAM_IDS, MODES: MODES, activeTeams: activeTeams, TRAIN: TRAIN,
    trainSchedule: trainSchedule, trainHeadAt: trainHeadAt, trainCars: trainCars,
    spawnProtectFor: spawnProtectFor, isArena: isArena,
    MODE_CATS: VISIBLE_CATS, ALL_MODE_CATS: MODE_CATS, modesInCat: modesInCat, livesFor: livesFor, isElimination: isElimination,
    MINIMAP: MINIMAP, RENDER: RENDER, MAPS: MAPS };
});
