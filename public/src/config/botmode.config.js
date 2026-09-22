/* ============================================================================
   BOT MODE (v14.0) — the separated namespace.

   Everything bot-mode-specific lives HERE: the three modes' identities, the
   difficulty profiles, the wave ladder, the weapon pool, and the Blacksite
   map's points. The multiplayer game never reads this file's guts; the bot
   driver and bot UI read nothing else. Two deliberate seams cross the wall,
   both one-way and both named where they happen:
   - the three mode entries and the map entry are registered into CFG.MODES /
     CFG.MAPS (menu + room integration — the brief's allowance), flagged
     `botmode` / `botOnly` so every picker and server guard can hold the line;
   - the weapon pool is folded into CFG.WEAPONS tagged pool:'botmode', so the
     PROVEN combat validation path (fireRateOk, server damage, lag-comp)
     covers these guns with zero new combat code — reuse of the exact kind
     the brief permits. Multiplayer loot tables and loadouts are explicit id
     lists and never name a bm_ id; bot-mode loadouts never name a
     multiplayer id. Isolation by construction, asserted by verify-botmode.

   DIFFICULTY is intelligence, not stats: reaction, aim envelope, detection,
   decision cadence, aggression, cover/flank/grenade propensity, sprint
   repositioning. HP and damage are identical at every tier, by rule.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== "undefined" ? self : this, function () {

  var DIFFICULTY = {
    /* reactMs: sighting -> first shot. aimErr: radians of aim scatter on top
       of the weapon's own spread. detect: metres. decideMs: replan cadence.
       aggr 0..1: push vs hold. coverPct/flankPct/nadePct: propensities the
       driver rolls against. sprint: whether repositions use sprint speed. */
    easy:     { label: 'EASY',   reactMs: 850, aimErr: 0.085, detect: 26, decideMs: 950, aggr: 0.35, coverPct: 0.10, flankPct: 0.00, nadePct: 0.02, sprint: false },
    medium:   { label: 'MEDIUM', reactMs: 420, aimErr: 0.042, detect: 40, decideMs: 520, aggr: 0.60, coverPct: 0.45, flankPct: 0.25, nadePct: 0.10, sprint: true  },
    hard:     { label: 'HARD',   reactMs: 200, aimErr: 0.020, detect: 56, decideMs: 260, aggr: 0.85, coverPct: 0.75, flankPct: 0.50, nadePct: 0.22, sprint: true  },
    /* battle stage 4 only — never offered in the lobby */
    hardplus: { label: 'HARD+',  reactMs: 150, aimErr: 0.015, detect: 62, decideMs: 200, aggr: 0.95, coverPct: 0.80, flankPct: 0.60, nadePct: 0.28, sprint: true  }
  };

  /* The wave ladder for BATTLE: seconds into the 15-minute match, target
     ACTIVE bot count, and the tier the new pressure arrives at. 5-10-15-20,
     smarter as it grows — the brief's numbers verbatim. */
  var WAVES = [
    { at:   0, count:  5, diff: 'easy'     },
    { at: 210, count: 10, diff: 'medium'   },
    { at: 450, count: 15, diff: 'hard'     },
    { at: 690, count: 20, diff: 'hardplus' }
  ];

  /* The pool. Same schema as CFG.WEAPONS so the server-side damage math,
     cadence gate and reload numbers work unchanged; pool:'botmode' is the
     tag every filter keys on. TTK tuned a touch gentler than multiplayer —
     bots outnumber you and the fun is the fight, not the ambush. */
  var WEAPONS_BOTMODE = {
    bm_carbine: { key: 1, label: 'VK Carbine',  type: 'auto',   dmg: 50, rpm: 560, mag: 30, reserve: 150, reload: 2.1, spread: 0.016, ads: 0.006, range: 42, head: 1.6, legs: 0.72, speed: 0.95, recoil: 0.010, drift: 0.45, adsFov: 50, trc: 0x8fd0ff, pool: 'botmode' },
    bm_smg:     { key: 2, label: 'Rook SMG',    type: 'auto',   dmg: 30, rpm: 820, mag: 34, reserve: 170, reload: 1.8, spread: 0.024, ads: 0.010, range: 24, head: 1.7, legs: 0.75, speed: 1.00, recoil: 0.008, drift: 0.6, adsFov: 55, trc: 0xa8ff9e, pool: 'botmode' },
    bm_scatter: { key: 3, label: 'Ward 12',     type: 'pump',   dmg: 11, pellets: 8, rpm: 68, mag: 6, reserve: 30, reload: 2.6, spread: 0.05, ads: 0.03, range: 13, head: 1.3, legs: 0.8, speed: 0.93, recoil: 0.03, drift: 0.3, adsFov: 60, trc: 0xffc36e, pool: 'botmode' },
    bm_marksman:{ key: 4, label: 'Longeye DMR', type: 'semi',   dmg: 55, rpm: 150, mag: 12, reserve: 48, reload: 2.4, spread: 0.006, ads: 0.0022, range: 70, head: 1.8, legs: 0.7, speed: 0.9, recoil: 0.02, drift: 0.35, adsFov: 34, trc: 0xffe9a8, pool: 'botmode' },
    bm_side:    { key: 5, label: 'P9 Side',     type: 'semi',   dmg: 30, rpm: 380, mag: 15, reserve: 60, reload: 1.5, spread: 0.02, ads: 0.011, range: 22, head: 1.7, legs: 0.75, speed: 1.02, recoil: 0.011, drift: 0.5, adsFov: 58, trc: 0xd8d8d8, pool: 'botmode' }
  };

  /* Loadout table the driver deals from — primary + secondary + ideal
     ranges for the weapon-switch hysteresis (same mechanic the v12 engine
     proved, different pool). */
  /* SAME KEY SHAPE as the engine's own LOADOUTS table (w/ideal/rateMul/weight/
     w2/ideal2/rateMul2) — the v12 weapon-switch hysteresis reads these fields
     by name, and a second shape would mean a second code path. */
  var LOADOUTS_BOTMODE = [
    { w: 'bm_carbine',  ideal: 26, rateMul: 1.00, weight: 15, w2: 'bm_side',    ideal2: 12, rateMul2: 1.10 },
    { w: 'bm_smg',      ideal: 13, rateMul: 0.78, weight: 12, w2: 'bm_scatter', ideal2: 8,  rateMul2: 2.00 },
    { w: 'bm_marksman', ideal: 44, rateMul: 1.55, weight: 8,  w2: 'bm_smg',     ideal2: 13, rateMul2: 0.78 },
    { w: 'bm_scatter',  ideal: 8,  rateMul: 2.00, weight: 7,  w2: 'bm_side',    ideal2: 12, rateMul2: 1.10 }
  ];

  var BOTMODE = {
    MAP: 'blacksite',
    MINUTES: 15,                       // locked; the lobby offers nothing else
    HUMAN_TEAM: 'a', BOT_TEAM: 'b',
    DIFFICULTY: DIFFICULTY,
    WAVES: WAVES,
    LOADOUTS: LOADOUTS_BOTMODE,
    COUNTS: { bm_solo: 8, bm_team: 10 } // fixed enemy counts outside BATTLE
  };

  /* Blacksite's points. Humans spawn in the south compound gate ('a');
     bots draw from the ring ('b'). Every point below sits on a surface the
     builder in environment/blacksite.js actually creates — and
     tools/verify-spawn-geometry.js holds that true forever. */
  var MAPS_BLACKSITE = {
    SPAWNS: [
      /* human pocket — south gate yard */
      [-6, -38, 0, 'a'], [0, -38, 0, 'a'], [6, -38, 0, 'a'], [-12, -36, 0, 'a'],
      [12, -36, 0, 'a'], [-3, -34, 0, 'a'], [3, -34, 0, 'a'], [9, -33, 0, 'a'],
      /* bot ring — north, east, west, plus interior re-entry points */
      [-40, 34, 3.1416, 'b'], [-20, 37, 3.1416, 'b'], [0, 38, 3.1416, 'b'],
      [20, 37, 3.1416, 'b'], [40, 34, 3.1416, 'b'],
      [-46, 10, 1.5708, 'b'], [-46, -12, 1.5708, 'b'],
      [46, 10, -1.5708, 'b'], [46, -12, -1.5708, 'b'],
      [-30, 0, 1.5708, 'n'], [30, 0, -1.5708, 'n'],
      [-36, -30, 0.7854, 'n'], [36, -30, -0.7854, 'n'], [0, 20, 3.1416, 'n']
    ],
    LOOT_POINTS: [
      /* warehouse interior — the s-tier risk */
      [-6, 0.55, 2, 's'], [6, 0.55, -2, 's'], [0, 3.55, 5, 's'],
      /* warehouse roof — worth the climb */
      [-5, 6.75, 0, 'h'], [5, 6.75, 3, 'h'],
      /* shed clusters */
      [-36, 0.55, 24, 'g'], [-30, 0.55, 30, 'g'], [-40, 0.55, 16, 'h'],
      [36, 0.55, -24, 'g'], [30, 0.55, -30, 'g'], [40, 0.55, -16, 'h'],
      /* container maze */
      [30, 0.55, 22, 'g'], [36, 0.55, 28, 'g'], [26, 0.55, 30, 's'],
      /* open yard crates */
      [-28, 0.55, -22, 'g'], [-34, 0.55, -14, 'g'], [-22, 0.55, -30, 'g'],
      /* gate approaches */
      [-14, 0.55, -24, 'g'], [14, 0.55, -24, 'g'], [0, 0.55, -14, 'g']
    ]
  };

  return { BOTMODE: BOTMODE, WEAPONS_BOTMODE: WEAPONS_BOTMODE, MAPS_BLACKSITE: MAPS_BLACKSITE };
});
