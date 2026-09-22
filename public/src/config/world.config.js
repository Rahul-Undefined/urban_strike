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
            cat: 'last', teams: true, squads: true, teamCount: 5,  squadSize: 3, maxPlayers: 15, lives: 1, fullMapContacts: true },

    /* ===== v1.0j - URBAN ZONE =====
       Rahul: "make the map gradually smaller as time passes; whoever camps
       outside the zone loses 10% life every second and dies in 10 s; the last
       minutes are close fights like the small maps; the drop always lands in
       the safe zone; the safe zone is random every match; a separate mode so
       the current gameplay is not hampered; the train runs as usual; the M
       map shows danger red and safe green. Take ideas from PUBG."
       One life (the Last Stand rules do the elimination and the win), Urban
       only (`mapLock`), the clock's fixed 15 minutes shaped by ZONE below. */
    /* v1.0u (Rahul: "not one-kill eliminated — keep unlimited respawn, the
       circle still shrinks"): the zone modes RESPAWN like FFA/Squads; the
       circle is the pressure, kills are the score, the clock ends it. Respawns
       land inside the circle (server pickSpawn asks the zone). */
    zone: { label: 'Urban Zone \u00b7 Solo', vlabel: 'Solo \u00b7 respawns \u00b7 the circle closes',
            cat: 'zone', teams: false, teamCount: 0, maxPlayers: 15, zone: true, mapLock: 'urban', fullMapContacts: false },
    /* v1.0l (Rahul: "Urban Zone should have the option to join as a team as
       well — solo or as a team, rest of the gameplay the same"): squad
       variants, the Last Stand squad shapes with the circle. One life each;
       a squad wins when it is the last side breathing. */
    zsq2: { label: 'Urban Zone \u00b7 Duos 7 \u00d7 2', vlabel: '7 squads of 2 \u00b7 respawns',
            cat: 'zone', teams: true, squads: true, teamCount: 7, squadSize: 2, maxPlayers: 14, zone: true, mapLock: 'urban', fullMapContacts: false },
    zsq3: { label: 'Urban Zone \u00b7 Squads 5 \u00d7 3', vlabel: '5 squads of 3 \u00b7 respawns',
            cat: 'zone', teams: true, squads: true, teamCount: 5, squadSize: 3, maxPlayers: 15, zone: true, mapLock: 'urban', fullMapContacts: false }
  };

  /* ===== v1.0j - THE ZONE SCHEDULE =====
     Shared by server (damage) and client (walls, map, HUD), like the train:
     the server rolls the circles once at match start and sends them; both sides
     then read the same pure function against the same match clock.
       minutes 0-2   the whole map is safe
       minutes 2-12  ten phases: each minute holds `holdSec` with the next
                     circle shown, then shrinks into it over the rest
       minutes 12-15 the final circle stands: a small-map-sized fight
     Radii step geometrically from r0 (covers the 240 m square's corners) to
     rFinal (a Bazaar-sized arena). Centres walk from the map centre toward a
     final centre rolled inside ±finalCenterMax, each circle nested in the last. */
  var ZONE = {
    fullMinutes: 2, shrinkPhases: 10, holdSec: 30, phaseSec: 60,
    /* v2.0: r0 covers the 500 x 440 map's corners from its centre (-30, 0);
       the final circle stays Bazaar-sized. zoneSchedule reads the map's true
       extent (MAPS.urban.ext), so the circles clamp to the real walls. */
    r0: 335, rFinal: 42, finalCenterMax: 110, boundPad: 2,
    dmgPct: 10, tickSec: 1, wallHeight: 40   /* v1.0u: 60 -> 40, less transparent overdraw in the small final circle */
  };
  function zoneCircleAt(sched, tSec) {
    var C = sched.circles, F = sched.fullSec, P = sched.phaseSec, H = sched.holdSec;
    if (tSec < F) return { cx: C[0].cx, cz: C[0].cz, r: C[0].r, phase: 0, next: C[1] || null, shrinking: false, holdLeft: F - tSec };
    var k = Math.floor((tSec - F) / P);
    if (k >= C.length - 1) { var L = C[C.length - 1]; return { cx: L.cx, cz: L.cz, r: L.r, phase: C.length - 1, next: null, shrinking: false, holdLeft: 0 }; }
    var a = C[k], b = C[k + 1], u = tSec - F - k * P;
    if (u < H) return { cx: a.cx, cz: a.cz, r: a.r, phase: k, next: b, shrinking: false, holdLeft: H - u };
    var f = Math.min(1, (u - H) / (P - H));
    return { cx: a.cx + (b.cx - a.cx) * f, cz: a.cz + (b.cz - a.cz) * f, r: a.r + (b.r - a.r) * f, phase: k, next: b, shrinking: true, holdLeft: 0 };
  }
  /* Roll a schedule. `rnd` is Math.random on the server; the client never rolls. */
  function zoneSchedule(rnd, bound) {
    var Z = ZONE, n = Z.shrinkPhases;
    /* v2.0: the playable box — MAPS.urban.ext when present, else the +/-bound square */
    var E = (typeof MAPS !== 'undefined' && MAPS.urban && MAPS.urban.ext) || null;
    var X0 = E ? E.x0 : -(bound || 120), X1 = E ? E.x1 : (bound || 120), Z0 = E ? E.z0 : -(bound || 120), Z1 = E ? E.z1 : (bound || 120);
    var mx = (X0 + X1) / 2, mz = (Z0 + Z1) / 2;
    var circles = [{ cx: mx, cz: mz, r: Z.r0 }];
    var fa = rnd() * Math.PI * 2, fd = Math.sqrt(rnd()) * Z.finalCenterMax;
    var fx = mx + Math.cos(fa) * fd, fz = mz + Math.sin(fa) * fd;
    var pad = Z.boundPad;
    for (var k = 1; k <= n; k++) {
      var prev = circles[k - 1];
      var r = Z.r0 * Math.pow(Z.rFinal / Z.r0, k / n);
      var t = k / n;
      var cx = mx + (fx - mx) * t + (rnd() - 0.5) * 2 * (prev.r - r) * 0.35;
      var cz = mz + (fz - mz) * t + (rnd() - 0.5) * 2 * (prev.r - r) * 0.35;
      /* Two constraints, both convex: nest inside the previous circle, and stay
         on the map once the circle fits inside it. Alternating projections
         converge on a centre that satisfies both (the previous circle is
         itself on the map, so the intersection is never empty). */
      for (var it = 0; it < 40; it++) {
        var dx = cx - prev.cx, dz = cz - prev.cz, d = Math.sqrt(dx * dx + dz * dz), maxD = Math.max(0, prev.r - r);
        if (d > maxD && d > 1e-9) { cx = prev.cx + dx / d * maxD; cz = prev.cz + dz / d * maxD; }
        if (r < (X1 - X0) / 2 - pad) cx = Math.max(X0 + pad + r, Math.min(X1 - pad - r, cx));
        if (r < (Z1 - Z0) / 2 - pad) cz = Math.max(Z0 + pad + r, Math.min(Z1 - pad - r, cz));
      }
      /* last word to the nesting, a centimetre inside — the bound has 2 m of pad */
      var ddx = cx - prev.cx, ddz = cz - prev.cz, dd = Math.sqrt(ddx * ddx + ddz * ddz), mD = Math.max(0, prev.r - r - 0.01);
      if (dd > mD && dd > 1e-9) { cx = prev.cx + ddx / dd * mD; cz = prev.cz + ddz / dd * mD; }
      circles.push({ cx: cx, cz: cz, r: r });
    }
    return { circles: circles, fullSec: Z.fullMinutes * 60, phaseSec: Z.phaseSec, holdSec: Z.holdSec };
  }
  function zoneInside(c, x, z) { var dx = x - c.cx, dz = z - c.cz; return dx * dx + dz * dz <= c.r * c.r; }

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
      blurb: 'One life. No respawn. No clock. Last one breathing wins.' },
    { id: 'zone',   label: 'Urban Zone',
      blurb: 'The circle closes minute by minute. Outside it you bleed. Respawns inside it. Urban only.' }
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
    /* v1.1 (Rahul: "make the map bigger from the stadium side, one side only"):
       `ext` is the true playable extent — the west runs to -180 (the WESTERN
       REACH: three new districts and the second train's new west boulevard);
       the other three sides stay at 120. `bound` (120) remains the core square
       every symmetric system reads (zone circles, helicopter routes, spawns
       in the core). */
    /* ===== v2.0 - URBAN GROWS 100 m ON EVERY SIDE (Rahul: "bigger on all
       sides by adding more districts"). `ext` is the true playable extent:
       x -280..220, z -220..220 (500 x 440 m). Twelve new districts fill the
       band between the old wall line (x -180/120, z +/-120) and the new wall;
       the perimeter boulevard just inside the wall carries the one fast train.
       `bound` (120) remains the core square the spawn balancer and the old
       symmetric readers use; anything that needs the whole map reads `ext`
       (server st bounds, minimap, zone, helicopter route, gates). */
    urban: { label: 'Urban', ready: true, bound: 120, ext: { x0: -280, x1: 220, z0: -220, z1: 220 } },
    /* v15.0 (fix 14): RURAL REMOVED. Rahul: "it is of no use now, remove it
       completely." Builder, config table, script tags, harness lists and gate
       budgets all deleted in the same commit — the entry is not hidden, it is
       gone, so a stale room setting naming it falls to urban at makeRoom. */
    /* ===== v2.0 - METRO CITY REMOVED. Rahul: "nobody plays that" — the
       builder (1,300 lines), its config table, districts, lifts, script tags,
       harness lists and gate budgets are all gone in one commit, so a stale room
       setting naming it falls to urban at makeRoom exactly as rural does. */
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
      /* ===== v2.1 - FOUR TRAINS, ONE TRACK, THROUGH SECTOR 7 CENTRAL =====
         Rahul: "it circles around the map but does not go to Sector 7 Central
         — it should, and go back circling. Four trains all going the same
         direction, every train starts from one station, same speed, so they
         never collide; one track for all four."
         THE LOOP (clockwise): the west and south perimeter straights as in
         v2.0, then from the north-west corner east along the perimeter to
         x -60, SOUTH down the x -60 rail corridor (through the inner avenue
         and North Yards to the old ring boulevard), east along the ring at
         z -103.2, the v1.0 jog into SECTOR 7 CENTRAL at z -88 (the platform
         at x 26..68, head stopping short of the footbridge — the original,
         gate-proven geometry), on east to x 103.2, NORTH up the x 103.2
         corridor back to the perimeter, east to the north-east corner and on
         round. ~2.1 km a lap. Four stops — SECTOR 7 CENTRAL, EASTBANK HALT,
         SOUTH COMMONS HALT, WESTFIELD HALT — and four trains: train k starts
         its match at stop k (TRAINS below, `startStop`), so at every instant
         all four are at the same phase of different legs; the shortest leg is
         ~400 m and a train is 50 m, so they cannot meet (verify-train sweeps
         a whole lap of all four). */
      waypoints: [[-270, -210], [-60, -210], [-60, -103.2], [-6, -103.2], [9, -88], [103.2, -88], [103.2, -210], [210, -210], [210, 210], [-270, 210]],
      fillet: 14, speed: 30.0, dwellSec: 3, brakeM: 75, accelM: 95,
      /* at: the waypoint whose following straight holds the HEAD stop; offset
         along it. Sector 7: head at x ~74.8 (as v1.0: 66..76). The halts: the
         train is centred on the 52 m deck (half a train is 24.85 m). */
      stops: [{ at: 4, offset: 60 }, { at: 7, offset: 220.85 }, { at: 8, offset: 250.85 }, { at: 9, offset: 220.85 }],
      stations: [
        { id: 'east',  name: 'EASTBANK HALT',      side: 'E', c: 0 },
        { id: 'south', name: 'SOUTH COMMONS HALT', side: 'S', c: -30 },
        { id: 'west',  name: 'WESTFIELD HALT',     side: 'W', c: 0 }
      ],
      stationAt: 4, stopOffset: 60,           // kept for readers of the old field; `stops` is what runs
      floor: 1.05, roof: 3.75,               // coach floor (platform height) and roof walking surface
      cars: 4                                 // locomotive + 3 coaches
    }
  };

  /* ===== v1.0l - THE HELICOPTER (Urban only) =====
     Rahul: "an area where a helicopter is; someone boards, it starts and the
     player can shoot players below; opponents shooting it bring its health
     down and destroy it — instant kill; it flies over the map with the player
     in it; a new one respawns every 5 minutes at the same place if used; real
     looking, natural physics, players don't fall out on their own; not every
     gun damages it — snipers little, assault rifles well — not five rounds and
     down, fun to bring down; a player who falls out dies and the opponent gets
     the point; the helicopter comes back to its place."
     THE PAD is open ground by the airport. Boarding is standing in the cabin
     on the pad for `boardSec`; then it climbs for `climbSec`, flies `route`
     (a filleted loop over the city, World.trainPath again) at `alt` and
     `speed`, comes back over the pad, descends for `landSec`, unloads, and is
     gone until `respawnSec` after take-off. Everything about where it is is a
     pure function of the server's take-off time — the train's pattern. Damage
     is by weapon class: `dmgClass` scales a weapon's body damage; rockets are
     a flat number. Falling out (jumping while airborne) is death, credited to
     whoever hit the helicopter last within `creditSec`. */
  var HELI = {
    /* ===== v2.0 (Rahul): HIGHER, EVERYWHERE, AND IT CRASHES WHEN DRY =====
       alt 32 -> 80 m: a rider is a hard target from the ground and the ground
       is a hard target from the cabin. The route now wanders the WHOLE 500 x
       440 map (`routeBox` = MAPS.urban.ext inset by routeInset) at 22 m/s.
       FUEL: 120 s. At fuelWarnSec left every rider hears the low-fuel siren
       and the room is told; at zero the machine CRASHES — no auto-return —
       falls for crashSec and every rider dies (tag 'helidown', no killer).
       The pad refuel (v1.0x) stays for a machine a rider LANDS with Q. */
    pad: [-73, -68], padY: 0.3, cabinFloor: 0.6, alt: 80, speed: 22, returnSpeed: 24,
    pads: [[-73, -68], [-31, -66]], secondSpawnSec: 120, fuelSec: 120, fuelWarnSec: 30, crashSec: 3.2, refuelSec: 60,
    fillet: 40, routeN: 22, legMin: 90, legMax: 240, routeInset: 24,
    boardSec: 3, climbSec: 10, landSec: 10, unloadSec: 8, respawnSec: 180, creditSec: 10,
    hp: 4000,
    dmgType: { auto: 12, semi: 12, bolt: 20, shotgun: 0, melee: 0, bow: 0, drone: 0, emp: 0, c4: 0, rocket: 0 },
    dmgWeapon: { akm: 15, ak47: 15, scarh: 15, m249: 15, m4a1: 12, aug: 12, famas: 12, uzi: 8, p90: 8, ump9: 8, mp5: 8, vector: 8, pistol: 5, shotgun: 0, aa12: 0, flamer: 6, mk14: 20, garand: 20, sniper: 20, kar98: 20, awm: 20, k98w: 20 },
    /* two RPG-L hits and it is down (2000 on 4000); the RPG-L now steers itself
       at a machine within WEAPONS.rocket.lockRange (weapons.config.js) */
    rocketPct: 0.5, rocketDmg: 2000,
    airToAirMult: 2, empRange: 80
  };
  /* a small deterministic PRNG (mulberry32) so server and clients roll the
     same route from the same seed */
  function heliRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* the wandering loop for one flight — v2.0: over a BOX (the map's true
     extent inset by routeInset), not a square about the origin, so the route
     reaches every district of the asymmetric 500 x 440 map */
  function routeBox(cfg) {
    var E = (typeof MAPS !== 'undefined' && MAPS.urban && MAPS.urban.ext) || { x0: -120, x1: 120, z0: -120, z1: 120 };
    var m = cfg.routeInset || 24;
    return { x0: E.x0 + m, x1: E.x1 - m, z0: E.z0 + m, z1: E.z1 - m };
  }
  function heliRoute(cfg, seed) {
    var r = heliRng(seed), P = cfg.pad, B = routeBox(cfg), N = cfg.routeN || 18;
    function inBox(x, z, pad) { pad = pad || 0; return x >= B.x0 - pad && x <= B.x1 + pad && z >= B.z0 - pad && z <= B.z1 + pad; }
    // the straight through the pad: both 40 m helper points must stay over the MAP
    // ...and the first leg heads INTO the city (toward the box centre)
    var cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    var toC = Math.atan2(cz - P[1], cx - P[0]), ang0, u, tries0 = 0;
    do { ang0 = toC + (r() - 0.5) * (140 * Math.PI / 180); u = [Math.cos(ang0), Math.sin(ang0)]; tries0++; }
    while (tries0 < 400 && (!inBox(P[0] + u[0] * 40, P[1] + u[1] * 40, 16) || !inBox(P[0] - u[0] * 40, P[1] - u[1] * 40, 16)));
    var pts = [[P[0], P[1]], [P[0] + u[0] * 40, P[1] + u[1] * 40]];
    var guard = 0, stuck = 0;
    while (pts.length < N + 1 && guard++ < 60000) {
      var prev = pts[pts.length - 1], prev2 = pts[pts.length - 2];
      var d = cfg.legMin + r() * (cfg.legMax - cfg.legMin), a = r() * Math.PI * 2;
      var nx = prev[0] + Math.cos(a) * d, nz = prev[1] + Math.sin(a) * d;
      var okPt = inBox(nx, nz, 0);
      if (okPt) {
        // no hairpins: the turn at `prev` must be under 110 degrees
        var v1 = [prev[0] - prev2[0], prev[1] - prev2[1]], v2 = [nx - prev[0], nz - prev[1]];
        var cosT = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]));
        if (cosT < Math.cos(110 * Math.PI / 180)) okPt = false;
      }
      if (!okPt) { if (++stuck > 300 && pts.length > 2) { pts.pop(); stuck = 0; } continue; }   // boxed in: back up one point
      stuck = 0;
      pts.push([nx, nz]);
    }
    // close: the last point must approach the pad from the far side of the first leg, collinear with the pad
    pts.push([P[0] - u[0] * 40, P[1] - u[1] * 40]);
    return { waypoints: pts, fillet: cfg.fillet };
  }
  /* pose along the flight: t = seconds since take-off; the loop is flown
     ROUND AND ROUND (path.at wraps) until a rider lands it — v1.0q.
     phase: 'climb' | 'cruise' */
  function heliPoseAt(cfg, path, t) {
    var P = cfg.pad;
    if (t < cfg.climbSec) { var f = t / cfg.climbSec; var q0 = path.at(0); return { x: P[0], z: P[1], y: cfg.padY + (cfg.alt - cfg.padY) * (f * f * (3 - 2 * f)), yaw: q0.yaw, phase: 'climb', s: 0 }; }
    var u2 = t - cfg.climbSec;
    var q = path.at(u2 * cfg.speed);
    return { x: q.x, z: q.z, y: cfg.alt, yaw: q.yaw, phase: 'cruise', s: u2 * cfg.speed };
  }
  /* the return leg: from a frozen pose straight back to the pad at returnSpeed,
     then the descent. t = seconds since Q was pressed. phase: 'return' |
     'descend' | 'down' */
  function heliReturnPose(cfg, from, t) {
    var P = cfg.pad, dx = P[0] - from.x, dz = P[1] - from.z, d = Math.hypot(dx, dz);
    var yaw = d > 0.5 ? Math.atan2(dz, dx) : from.yaw, tTravel = d / (cfg.returnSpeed || 16);
    if (t < tTravel) { var f = t / tTravel; return { x: from.x + dx * f, z: from.z + dz * f, y: from.y, yaw: yaw, phase: 'return', s: 0, left: tTravel - t + cfg.landSec }; }
    var g = (t - tTravel) / cfg.landSec;
    if (g < 1) return { x: P[0], z: P[1], y: cfg.alt - (cfg.alt - cfg.padY) * (g * g * (3 - 2 * g)), yaw: yaw, phase: 'descend', s: 0, left: cfg.landSec * (1 - g) };
    return { x: P[0], z: P[1], y: cfg.padY, yaw: yaw, phase: 'down', s: 0, left: 0 };
  }
  /* v2.0: the crash — from a frozen pose, straight down with a slow spin and
     a drift along its heading, hitting the ground at crashSec. phase: 'crash' |
     'wreck'. y is clamped at padY so the wreck sits on the ground. */
  function heliCrashPose(cfg, from, t) {
    var D = cfg.crashSec || 3, f = Math.min(1, Math.max(0, t / D));
    var drift = 18 * f, yaw = from.yaw + f * 2.4;
    var y = Math.max(cfg.padY, from.y - (from.y - cfg.padY) * (f * f));
    return { x: from.x + Math.cos(from.yaw) * drift, z: from.z + Math.sin(from.yaw) * drift, y: y, yaw: yaw, phase: f < 1 ? 'crash' : 'wreck', s: 0, roll: f * 0.9 };
  }
  function heliDamageFor(cfg, weapons, w) {
    var def = weapons[w];
    if (!def) return 0;
    if (def.type === 'rocket') return Math.round(cfg.hp * (cfg.rocketPct || 0.5));
    if (cfg.dmgWeapon && cfg.dmgWeapon[w] !== undefined) return cfg.dmgWeapon[w];
    var k = cfg.dmgType ? cfg.dmgType[def.type] : undefined;
    return k === undefined ? 0 : k;
  }

  /* v2.1: FOUR trains on the one loop. Each entry is the same track; `startStop`
     is the stop it begins its match at, and trainOffset() turns that into the
     schedule phase (the departure time of stop k on the shared schedule). */
  var TRAINS = { urban: [0, 1, 2, 3].map(function (k) { var c = Object.create(TRAIN.urban); c.startStop = k; c.idx = k; return c; }) };
  /* the phase (seconds) a train's clock is advanced by: stop k's departure time
     on the schedule S (CFG.trainSchedule), or a plain tOffset for old readers */
  function trainOffset(cfg, S) {
    if (cfg && typeof cfg.startStop === 'number' && S && S.legs && S.legs.length) return S.legs[cfg.startStop % S.legs.length].tD;
    return (cfg && cfg.tOffset) || 0;
  }

  /* v1.0f: THE SCHEDULE IS SHARED. The server kills whoever the moving train
     hits, so it must place the train exactly where every client draws it —
     the same two pure functions, called with the same match time. */
  /* v1.0l: MANY STOPS. `stopsS` is the list of head positions (arc length) at
     which the train dwells, in loop order; the schedule is a chain of legs
     (dwell, accelerate, cruise, brake) from each stop to the next, the last leg
     wrapping round to the first. A leg shorter than accel+brake becomes a
     triangle profile that peaks below cruise. Lap time is the sum. A single
     number in `stopsS` is the old one-station schedule. */
  function trainSchedule(cfg, length, stopsS) {
    var L = length, v = cfg.speed, D = cfg.dwellSec || 3;
    var list = Array.isArray(stopsS) ? stopsS.slice() : [stopsS];
    list = list.map(function (x) { return ((x % L) + L) % L; }).sort(function (a, b) { return a - b; });
    var legs = [], t = 0;
    for (var i = 0; i < list.length; i++) {
      var s0 = list[i], s1 = list[(i + 1) % list.length];
      var dist = i === list.length - 1 ? (s1 + L - s0) : (s1 - s0);
      if (dist <= 0) dist += L;
      var A = Math.min(cfg.accelM || 30, dist / 2), B = Math.min(cfg.brakeM || 24, dist / 2);
      var vp = v;
      if (A + B > dist) { A = dist / 2; B = dist / 2; }
      if (dist < (cfg.accelM || 30) + (cfg.brakeM || 24)) vp = v * Math.sqrt(dist / ((cfg.accelM || 30) + (cfg.brakeM || 24)));   // triangle: peak below cruise
      var tA = 2 * A / vp, tB = 2 * B / vp, tC = Math.max(0, dist - A - B) / vp;
      legs.push({ s0: s0, dist: dist, A: A, B: B, vp: vp, tD: t, tA: tA, tB: tB, tC: tC, dur: D + tA + tC + tB });
      t += D + tA + tC + tB;
    }
    return { L: L, v: v, D: D, T: t, legs: legs, s0: list[0], stops: list };
  }
  function trainHeadAt(S, tMatch) {
    var tau = ((tMatch % S.T) + S.T) % S.T;
    var g = S.legs[0];
    for (var i = 0; i < S.legs.length; i++) { if (tau < S.legs[i].tD + S.legs[i].dur) { g = S.legs[i]; break; } }
    var u = tau - g.tD, s, vv;
    if (u < S.D) { s = 0; vv = 0; }
    else if (u < S.D + g.tA) { var a = (u - S.D) / g.tA; s = g.A * a * a; vv = g.vp * a; }
    else if (u < S.D + g.tA + g.tC) { s = g.A + g.vp * (u - S.D - g.tA); vv = g.vp; }
    else { var b = Math.min(1, (u - S.D - g.tA - g.tC) / g.tB); s = g.A + g.vp * g.tC + g.B * (2 * b - b * b); vv = g.vp * (1 - b); }
    return { s: g.s0 + s, v: vv, leg: g };
  }
  /* the head positions of every stop for a path: [s...] */
  function trainStops(cfg, path) {
    var stops = cfg.stops || [{ at: cfg.stationAt || 0, offset: cfg.stopOffset || 0 }];
    return stops.map(function (st) { return path.sAtWaypoint(st.at) + st.offset; });
  }
  /* The train's car layout, shared too: [length, offset of each car's centre behind the head]. */
  function trainCars(cfg) {
    var n = Math.max(2, cfg.cars || 4), LOCO = 11.0, CL = 12.0, GAP = 0.9, off = 0, out = [];
    for (var i = 0; i < n; i++) { var L = i === 0 ? LOCO : CL; off += L / 2; out.push({ L: L, off: off, coach: i > 0 }); off += L / 2 + GAP; }
    return out;
  }

  return { COLORS: COLORS, TEAMS: TEAMS, TEAM_IDS: TEAM_IDS, MODES: MODES, activeTeams: activeTeams, TRAIN: TRAIN, TRAINS: TRAINS, trainOffset: trainOffset,
    trainSchedule: trainSchedule, trainHeadAt: trainHeadAt, trainCars: trainCars, trainStops: trainStops,
    ZONE: ZONE, zoneSchedule: zoneSchedule, zoneCircleAt: zoneCircleAt, zoneInside: zoneInside,
    HELI: HELI, heliPoseAt: heliPoseAt, heliReturnPose: heliReturnPose, heliCrashPose: heliCrashPose, heliRoute: heliRoute, heliRouteBox: routeBox, heliDamageFor: heliDamageFor,
    spawnProtectFor: spawnProtectFor, isArena: isArena,
    MODE_CATS: VISIBLE_CATS, ALL_MODE_CATS: MODE_CATS, modesInCat: modesInCat, livesFor: livesFor, isElimination: isElimination,
    MINIMAP: MINIMAP, RENDER: RENDER, MAPS: MAPS };
});
