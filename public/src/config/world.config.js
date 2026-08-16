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
  var MODES = {
    ffa:  { label: 'Free For All',      vlabel: 'Free For All',  cat: 'ffa',    teams: false, teamCount: 0,  maxPlayers: 20 },
    t2:   { label: '2 vs 2',            vlabel: '2 vs 2',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 4 },
    t3:   { label: '3 vs 3',            vlabel: '3 vs 3',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 6 },
    t4:   { label: '4 vs 4',            vlabel: '4 vs 4',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 8 },
    t5:   { label: '5 vs 5',            vlabel: '5 vs 5',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 10 },
    t6:   { label: '6 vs 6',            vlabel: '6 vs 6',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 12 },
    t8:   { label: '8 vs 8',            vlabel: '8 vs 8',        cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 16 },
    t10:  { label: '10 vs 10',          vlabel: '10 vs 10',      cat: 'team',   teams: true,  teamCount: 2,  maxPlayers: 20 },
    sq2:  { label: 'Squads \u00b7 10 \u00d7 2', vlabel: '10 squads of 2', cat: 'squads', teams: true, squads: true, teamCount: 10, squadSize: 2, maxPlayers: 20 },
    sq4:  { label: 'Squads \u00b7 5 \u00d7 4',  vlabel: '5 squads of 4',  cat: 'squads', teams: true, squads: true, teamCount: 5,  squadSize: 4, maxPlayers: 20 },

    /* LAST STAND. One life. No respawn, no clock — the match ends when one
       operator, or one squad, is the only thing left breathing.

       Camping is answered by the map rather than by a timer: pressing M shows
       where everyone is, so hiding buys you position, not safety. That is why
       these carry minutes 0 and killTarget 0 and still always terminate — the
       end condition is elimination, which cannot stall while anyone is alive. */
    ls:   { label: 'Last Stand \u00b7 Solo', vlabel: 'Solo \u00b7 every operator for themselves',
            cat: 'last', teams: false, teamCount: 0, maxPlayers: 20, lives: 1 },
    /* v9.4 `fullMapContacts` — the escape hatch the v9.2 gate said to use.
       Hiding contacts on the full map is right for Team Battle and Squads,
       where the map is a free intel screen in a match that never pauses. Last
       Stand is the exception BY DESIGN: its whole anti-camping answer is that
       pressing M shows where everyone is, so hiding buys you position and not
       safety. Marking the two squad variants restores that without a special
       case wired into minimap.js. Solo is already free-for-all shaped. */
    lsq2: { label: 'Last Stand \u00b7 Squads 10 \u00d7 2', vlabel: '10 squads of 2',
            cat: 'last', teams: true, squads: true, teamCount: 10, squadSize: 2, maxPlayers: 20, lives: 1, fullMapContacts: true },
    /* v8.38 TRAINING. One human, up to nineteen bots, on any difficulty. It is
       free-for-all shaped so every bot is hostile — a practice room where half
       the room is on your side teaches you nothing. Startable solo, which is
       the whole point: no waiting for a lobby to fill. */
    /* v8.39: renamed from "Training". Rahul played it and it stopped being
       practice — calling it Training undersold it and told players to skip it.
       The internal id stays `practice` on purpose: it is what every guard, gate
       and settings check reads, and renaming a live identifier to improve a
       label is how you break three things to fix a word. */
    bots: { label: 'Overrun', vlabel: 'One operator against the sector',
            cat: 'practice', teams: false, teamCount: 0, maxPlayers: 20, practice: true },
    lsq4: { label: 'Last Stand \u00b7 Squads 5 \u00d7 4',  vlabel: '5 squads of 4',
            cat: 'last', teams: true, squads: true, teamCount: 5,  squadSize: 4, maxPlayers: 20, lives: 1, fullMapContacts: true },

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
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 1,  vsBots: true },
    co2:  { label: 'Strike Team \u00b7 Duo',     vlabel: '2 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 2,  vsBots: true },
    co3:  { label: 'Strike Team \u00b7 Trio',    vlabel: '3 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 3,  vsBots: true },
    co4:  { label: 'Strike Team \u00b7 Squad',   vlabel: '4 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 4,  vsBots: true },
    co6:  { label: 'Strike Team \u00b7 Section', vlabel: '6 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 6,  vsBots: true },
    co10: { label: 'Strike Team \u00b7 Platoon', vlabel: '10 operators vs the machines',
            cat: 'coop', teams: true, teamCount: 2, maxPlayers: 10, vsBots: true }
  };

  /* THE single source of truth for "does this mode put bots in the room".
     The server guard and tools/verify-bots.js both read this, so the gate can
     never drift from the rule it checks — the previous gate asserted the
     literal source text `.practice) return`, which meant adding a second bot
     mode turned it red for being correct. */
  function botsAllowed(modeId) {
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
  function backfillAllowed(modeId) {
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
      blurb: 'Twenty operators. No sides. Highest count when the clock dies.' },
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
  function modesInCat(catId) {
    return Object.keys(MODES).filter(function (m) { return MODES[m].cat === catId; });
  }
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
    MODE_CATS: MODE_CATS, modesInCat: modesInCat, livesFor: livesFor, isElimination: isElimination,
    botsAllowed: botsAllowed, backfillAllowed: backfillAllowed,
    humanSideOf: humanSideOf, botSideOf: botSideOf,
    MINIMAP: MINIMAP, RENDER: RENDER, MAPS: MAPS };
});
