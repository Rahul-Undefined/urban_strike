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
  /* ===== v10.9 - BOT MODES ARE OFF =====

     Rahul: "Remove the bot mode as it is lagging... removing the bot means
     removing every trace of it, from the welcome screen, mode selection
     screen, everywhere" and "will think of it later and add back later".

     That last clause is why this is a SWITCH and not a deletion. Deleting the
     bot modes would mean unpicking 281 references in server/lib/bots.js, 49 in
     server.js, 31 in ui.js and 65 assertions in test.js, then putting all of
     it back later from memory. This project has a documented failure mode for
     exactly that shape of change (HANDOFF section 4.3, "a shared helper edited
     for one caller", and 4.6, "fixing one defect by creating another").

     Every bot control in the UI already asks botsAllowed() or
     backfillAllowed() whether to render, and the mode picker already filters
     on `hidden`. So one flag closes all of it: the Overrun and Strike Team
     categories vanish from mode selection, the bot-count and difficulty
     sliders vanish from the lobby, the backfill row vanishes from every human
     mode, and bots.js returns before spawning anything.

     TO BRING BOTS BACK: return true from the function below. Nothing else.

     The gates still exercise the bot engine — tools/verify-bots.js re-enables
     it for its own run (see the head of that file), because the engine is
     retained and must not be allowed to rot while it is switched off.

     Read through `globalThis` rather than naming `process` directly. This file
     is loaded by the BROWSER as well as by node, and `process` does not exist
     there — a bare read is a ReferenceError swallowed by a try/catch, which is
     the same "check the field you are reading actually exists" mistake listed
     in HANDOFF section 6. tools/verify-scope.js caught it. */
  /* ===== v13.0 - BOTS ARE OFF AGAIN (brief items 1 and 4) =====
     "Remove bot mode completely from the game for now" — the same sentence,
     with the same "for now", that v10.9 answered. This is the THIRD flip of
     this switch (v10.9 off, v12.0 on, v13.0 off), which is precisely why it
     stays a switch: the v10.9 costing above (281 refs in bots.js, 49 in
     server.js, 31 in ui.js, 65 test assertions) has now been validated
     twice — v12 re-armed everything with one line, and v13 disarms it with
     one line. Restored to the env-read form so the shipped default is OFF
     while tools/verify-bots.js can still arm the retained engine for its own
     run (US_BOTS=1), exactly as v10.9 designed. What "completely" means and
     gets, mechanically: the two bot categories and all seven modes vanish
     from the picker (hidden), the bot-count/difficulty/backfill rows vanish
     from the lobby (they ask botsAllowed()/backfillAllowed()), backfill
     returns to impossible, addBots() returns before spawning, the bot tick
     returns on its first line, and test.js phases 11/12/14 print their SKIP
     notes again. Zero user-facing traces, zero hot-path cost; the engine
     stays so the fourth flip is also one line. */
  var BOTS_ENABLED = (function () {
    var g = (typeof globalThis !== 'undefined') ? globalThis : null;
    var env = g && g.process && g.process.env;
    return !!(env && env.US_BOTS === '1');
  })();

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
            cat: 'last', teams: false, teamCount: 0, maxPlayers: 15, lives: 1 },
    /* v9.4 `fullMapContacts` — the escape hatch the v9.2 gate said to use.
       Hiding contacts on the full map is right for Team Battle and Squads,
       where the map is a free intel screen in a match that never pauses. Last
       Stand is the exception BY DESIGN: its whole anti-camping answer is that
       pressing M shows where everyone is, so hiding buys you position and not
       safety. Marking the two squad variants restores that without a special
       case wired into minimap.js. Solo is already free-for-all shaped. */
    lsq2: { label: 'Last Stand \u00b7 Squads 7 \u00d7 2', vlabel: '7 squads of 2',
            cat: 'last', teams: true, squads: true, teamCount: 7, squadSize: 2, maxPlayers: 14, lives: 1, fullMapContacts: true },
    /* v8.38 TRAINING. One human, up to nineteen bots, on any difficulty. It is
       free-for-all shaped so every bot is hostile — a practice room where half
       the room is on your side teaches you nothing. Startable solo, which is
       the whole point: no waiting for a lobby to fill. */
    /* v8.39: renamed from "Training". Rahul played it and it stopped being
       practice — calling it Training undersold it and told players to skip it.
       The internal id stays `practice` on purpose: it is what every guard, gate
       and settings check reads, and renaming a live identifier to improve a
       label is how you break three things to fix a word. */
    bots: { label: 'Bot Match \u00b7 Overrun', vlabel: 'You against the machines \u2014 they fight like players',
            cat: 'practice', teams: false, teamCount: 0, maxPlayers: 15, practice: true, hidden: !BOTS_ENABLED,
            mapLock: 'urban' },   // v12.0 (item 7): bot modes exist on Urban only
    lsq4: { label: 'Last Stand \u00b7 Squads 5 \u00d7 3',  vlabel: '5 squads of 3',
            cat: 'last', teams: true, squads: true, teamCount: 5,  squadSize: 3, maxPlayers: 15, lives: 1, fullMapContacts: true },

    /* v9.2 STRIKE TEAM — humans on one side, bots on the other.

       Overrun (`bots`) is free-for-all shaped: every bot is hostile to
       everybody, and only one human belongs in the room. That is a practice
       range. These are the opposite shape — every human on side A, every bot on
       side B — and the ordinary team rules (friendly fire off, team kill
       target, shared score) apply unchanged, because these ARE ordinary team
       modes that happen to fill one side with bots.

       `vsBots` is what turns bot spawning on, NOT the `practice` flag. Keeping
       them separate matters: `practice` means "free-for-all range, one human",
       and several guards read it for exactly that. Overloading it to also mean
       "this mode has bots" would have made Strike Team inherit Overrun's FFA
       shape, so bots would shoot each other and friendly fire would be on.

       maxPlayers is the HUMAN squad size; the room cap counts humans only, so
       bots arriving at match start cannot lock a team-mate out of a free slot. */
    co1:  { label: 'Strike Team \u00b7 Solo',    vlabel: '1 operator vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 1,  vsBots: true, hidden: !BOTS_ENABLED,
            mapLock: 'urban' },
    co2:  { label: 'Strike Team \u00b7 Duo',     vlabel: '2 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 2,  vsBots: true, hidden: !BOTS_ENABLED,
            mapLock: 'urban' },
    co3:  { label: 'Strike Team \u00b7 Trio',    vlabel: '3 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 3,  vsBots: true, hidden: !BOTS_ENABLED,
            mapLock: 'urban' },
    co4:  { label: 'Strike Team \u00b7 Squad',   vlabel: '4 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 4,  vsBots: true, hidden: !BOTS_ENABLED,
            mapLock: 'urban' },
    co6:  { label: 'Strike Team \u00b7 Section', vlabel: '6 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 6,  vsBots: true, hidden: !BOTS_ENABLED,
            mapLock: 'urban' },
    co10: { label: 'Strike Team \u00b7 Platoon', vlabel: '10 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 10, vsBots: true, hidden: !BOTS_ENABLED,
            mapLock: 'urban' },
    /* ===== v14.0 BOT MODE — three modes, one wall (brief items 1/5/12) =====
       Registered here because rooms, teams, snapshots and scoreboards are the
       shared utilities the brief permits — but the entries are FENCED:
       cat 'botmode' is deliberately NOT in ALL_MODE_CATS, so the multiplayer
       picker cannot list them even with every switch armed; `botmode: true`
       is what the dedicated UI, the bot driver and the server guards key on;
       `vsBots: true` keeps the LEGACY dormant engine's own accounting honest
       (verify-bots separates legacy seven from these three); mapLock rides
       the v12 coercion machinery unchanged. All are humans-vs-machines team
       games: humans are side 'a', bots side 'b', so the grouped scoreboards
       and team damage rules work without one new line. */
    bm_solo:   { label: 'Bot Mode \u00b7 Solo',   vlabel: 'Solo vs Bots',   cat: 'botmode', teams: true, teamCount: 2, maxPlayers: 21, botmode: true, vsBots: true, mapLock: 'blacksite' },
    bm_team:   { label: 'Bot Mode \u00b7 Team',   vlabel: 'Team vs Bots',   cat: 'botmode', teams: true, teamCount: 2, maxPlayers: 24, botmode: true, vsBots: true, mapLock: 'blacksite' },
    bm_battle: { label: 'Bot Mode \u00b7 Battle', vlabel: 'Battle Waves',   cat: 'botmode', teams: true, teamCount: 2, maxPlayers: 24, botmode: true, vsBots: true, mapLock: 'blacksite' },
  };

  /* THE single source of truth for "does this mode put bots in the room".
     The server guard and tools/verify-bots.js both read this, so the gate can
     never drift from the rule it checks — the previous gate asserted the
     literal source text `.practice) return`, which meant adding a second bot
     mode turned it red for being correct. */
  function botsAllowed(modeId) {
    if (!BOTS_ENABLED) return false;          // v10.9 kill switch, see top
    var m = MODES[modeId];
    return !!(m && (m.practice || m.vsBots));
  }

  /* ===== v9.11 — BOT BACKFILL =====

     `botsAllowed` answers "does this MODE put bots in the room" and it stays
     exactly as it was: Overrun and Strike Team, nothing else. That guard is
     load-bearing — it is what stops a stale `botCount` from a Training session
     leaking six bots into a 5v5, which is a real defect this project shipped in
     v8.38 and fixed in v8.38.1.

     Backfill is a SEPARATE question with a separate answer: "may the host ask
     for empty slots to be filled." It is opt-in per room, it applies to the
     human-vs-human modes only, and it is bounded by maxPlayers rather than by
     the bot slider. Two questions, two predicates — because collapsing them
     into one is precisely how the v8.38 leak happened.

     WHY IT MATTERS MORE THAN IT SOUNDS. Team Battle 10v10, Squads 5x4 and Last
     Stand 20-player need ten to twenty humans to exist at all. Without backfill
     most of the mode list is unplayable unless you can assemble a crowd, which
     is a content graveyard rather than a feature set. */
  /* v10.15: spawn protection is per MAP, not global. Read through this
     everywhere rather than touching CFG.MATCH.spawnProtect directly, so a
     sixth small map inherits the shorter timer by carrying `smallMap` and
     nothing else. */
  /* v10.21: `arena` is the RULE SET — nuke killstreak, short spawn protection,
     recon visor in the crate pool. `smallMap` is a SIZE classifier and always
     implies it. They were the same flag until medium maps arrived and needed
     the rules without the size, which is the point at which a flag named after
     one of its two meanings stops being usable. */
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

  function backfillAllowed(modeId) {
    if (!BOTS_ENABLED) return false;          // v10.9 kill switch, see top
    var m = MODES[modeId];
    if (!m) return false;
    if (m.practice || m.vsBots) return false;      // these already field bots
    return true;
  }
  /* Which side humans take when the mode fills the other with bots. Null for
     every other mode, so a caller cannot accidentally pin a normal match to one
     team. */
  function humanSideOf(modeId) {
    var m = MODES[modeId];
    return (m && m.vsBots) ? 'a' : null;
  }
  function botSideOf(modeId) {
    var m = MODES[modeId];
    return (m && m.vsBots) ? 'b' : null;
  }

  /* The two-step picker. Order here is the order shown. */
  var MODE_CATS = [
    { id: 'ffa',    label: 'Free For All',
      blurb: 'Fifteen operators. No sides. Highest count when the clock dies.' },
    { id: 'team',   label: 'Team Battle',
      blurb: 'Two sides, your pick of size. First team to the kill target.' },
    { id: 'squads', label: 'Squads',
      blurb: 'Many small squads, one sector. Your squad\u2019s kills are your score.' },
    { id: 'last',   label: 'Last Stand',
      blurb: 'One life. No respawn. No clock. Last one breathing wins.' },
    { id: 'practice', label: 'Overrun',
      blurb: 'You against the sector. Choose how many come for you, and how mean they are.' },
    { id: 'coop',   label: 'Strike Team',
      blurb: 'You and your squad against the machines. Pick your size and how mean they are.' }
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
    urban: { label: 'Urban', ready: true },
    rural: { label: 'Rural', ready: true, bound: 150 },
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
    killhouse: { label: 'Killhouse', ready: true, bound: 38, maxPlayers: 10, indoor: true, smallMap: true },
    /* v10.12 SUNSET ROW. Two houses across a street, 64 x 40 m. Same rule set
       as killhouse — 8 players, nuke killstreak, visor in the crate pool, no
       sniper or RPG on the floor — but a different SHAPE: rooms and a street
       rather than three parallel lanes. `smallMap: true` is what carries the
       shared rules, so a third small map inherits them by setting one flag
       instead of by someone remembering four separate places. */
    sunsetrow: { label: 'Sunset Row', ready: true, bound: 34, maxPlayers: 8, smallMap: true },
    /* v10.14: three more small maps, replacing Outbreak. Each is a SHAPE the
       roster did not have — see maps-small.config.js for why these three.
       All carry `smallMap`, which is what grants the nuke killstreak, the
       8-player cap and the crate-only visor without anyone remembering four
       separate places. */
    freightyard: { label: 'Freightyard', ready: true, bound: 21, maxPlayers: 8, smallMap: true },
    bazaar:      { label: 'Bazaar',      ready: true, bound: 29, maxPlayers: 8, smallMap: true },
    substation:  { label: 'Substation',  ready: true, bound: 25, maxPlayers: 8, smallMap: true },
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
    blacksite:   { label: 'Blacksite',   ready: true, bound: 52, maxPlayers: 24, arena: true, botOnly: true },
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
  var RENDER = {
    mergeStatic: true,   // collapse static geometry into per-material meshes
    sky: 0x2b3348, fogColor: 0x2b3348, fogDensity: 0.0040,
    hemiSky: 0xb8c8e2, hemiGround: 0x33291c, hemiIntensity: 0.82,
    ambColor: 0x3c4658, ambIntensity: 0.34,
    sunColor: 0xffa860, sunIntensity: 1.28, sunPos: [70, 82, 34],
    lampGlow: 0xffb25a, lampPool: 0.26   // streetlight halo color + ground-pool strength
    // lampPool raised 0.16 -> 0.26 in v7.5: it now carries the street lighting
    // that two point lights used to provide, at zero shading cost.
  };

  return { COLORS: COLORS, TEAMS: TEAMS, TEAM_IDS: TEAM_IDS, MODES: MODES, activeTeams: activeTeams,
    spawnProtectFor: spawnProtectFor, isArena: isArena,
    MODE_CATS: VISIBLE_CATS, ALL_MODE_CATS: MODE_CATS, BOTS_ENABLED: BOTS_ENABLED, modesInCat: modesInCat, livesFor: livesFor, isElimination: isElimination,
    botsAllowed: botsAllowed, backfillAllowed: backfillAllowed,
    humanSideOf: humanSideOf, botSideOf: botSideOf,
    MINIMAP: MINIMAP, RENDER: RENDER, MAPS: MAPS };
});
