(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  /* ===== v9.10 — A TALLER OPERATOR =====
     standH 1.8 -> 1.92. A 1.8 m capsule in a world of 2.2 m doorways and 4 m
     storeys reads as a slightly small person in a slightly large city.

     1.92 IS MEASURED, NOT CHOSEN. The tightest doorway on any map is 2.10 m and
     verify-stairs-quality requires standH + 0.02 of headroom over every flight;
     1.92 leaves 0.18 m of door clearance and keeps every existing staircase
     legal. Anything taller starts failing flights that are correct.

     EVERY DERIVED HEIGHT MOVES BY THE SAME 1.0667. Crouch, prone and the three
     eye offsets are scaled together so the proportions are unchanged — a
     hand-tuned eye height against a scaled body is how a camera ends up inside
     a forehead. The avatar RIG in networking/avatars.js is scaled by the same
     factor in the same version; the two must move together or the visible model
     and the hit capsule disagree, which is exactly what verify-hitbox caught
     when only one of them was changed.

     BOTS INHERIT ALL OF IT. server/lib/bots.js reads CFG.PLAYER for bodyH() and
     for its eye heights, so bot stature tracks the player automatically and
     cannot drift. */
  var PLAYER = {
    hp: 100,
    standH: 1.92, crouchH: 1.28, proneH: 0.75, radius: 0.35,
    eyeStand: 0.768, eyeCrouch: 0.448, eyeProne: 0.192,
    headR: 0.203
  };

  var ARMOR = {
    1: { label: 'L1', absorb: 0.45, dur: 60,  color: '#9aa3ad' },
    2: { label: 'L2', absorb: 0.58, dur: 110, color: '#4fa3e0' },
    3: { label: 'L3', absorb: 0.70, dur: 180, color: '#f0c040' }
  };

  // Attachments — auto-equipped on pickup into one of three slots (cat).

  // v4.9 out-of-combat regeneration (server-authoritative, applied in the
  // snapshot tick). delaySec = quiet time required after the LAST hit taken.
  var REGEN = { enabled: true, delaySec: 7, perSec: 6, maxFrac: 1.0 };

  // v5.0 recoil recovery. recover = fraction of applied kick handed back after
  // a burst (1 = perfect return to centre); settleSec = how long that takes.
  /* LIFTS (v6.1). Vertical access without auto-step. Each entry is a shaft:
     stand inside radius r of (x,z) at any listed floor height and press Z to
     ride to the next stop, wrapping to the ground at the top. Movement is
     already client-authoritative, so this needs no server support and cannot
     desync anything the server cares about. Stops are DERIVED from the building
     floor heights, never hand-typed. */
  /* HELMET (v6.1) — own slot, own durability, mirroring ARMOR. Applies ONLY to
     head damage: absorb is the fraction of the headshot bonus removed, and each
     hit spends durability. A helmet does nothing against body or leg shots. */
  var HELMET = {
    1: { label: 'H1', absorb: 0.35, dur: 55,  color: '#8a949e' },
    2: { label: 'H2', absorb: 0.55, dur: 95,  color: '#4fa3e0' },
    3: { label: 'H3', absorb: 0.70, dur: 150, color: '#f0c040' }
  };

  /* v9.6: the three shafts at (54,58), (78,60) and (60,80) are GONE with the
     buildings they served. They were the only access to the SE high-rise
     cluster, which the South Terminal replaced — leaving them would have put
     three lift triggers in an open bus yard, each riding to a nineteen-metre
     stop with no floor at the top. verify-lifts caught exactly that: 20 stops
     reporting NO FLOOR. The control tower uses stairs, twice over, so nothing
     here needs a lift. */
  var LIFTS = [  // tower A  // tower B  // tower C
    { map: 'urban', x: 84.2, z: -25.5, r: 1.6, stops: [0.25, 3.25, 6.25] },                            // mall
    { map: 'urban', x: -76.2, z: -81.9, r: 1.6, stops: [0.25, 3.25, 6.25] },                           // airport terminal
    /* --- Metro City. Shaft positions DERIVED by searching each structure for
       a spot valid at all stops, never chosen by eye.

       v8.20: the four Financial District towers dropped from six 4 m floors to
       two 3.4 m storeys, so their shafts were still calling at 12.25, 16.25,
       20.25 and 24.25 — stops in open sky above a 7.05 m roof. verify-lifts
       went 98/0 to 74/24 the moment the towers shrank, which is the gate doing
       exactly its job. Stops now match the floors that exist: ground, floor 1,
       roof. The stair is the primary route in these blocks; the lift stays as
       a second way up, because a two-storey building with one route is a
       camping spot rather than a fight. --- */
    { map: 'metro', x: -53, z: -53, r: 1.6, stops: [0.25, 3.65, 7.05] },  // NW tower
    { map: 'metro', x: 39, z: -53, r: 1.6, stops: [0.25, 3.65, 7.05] },   // NE tower
    { map: 'metro', x: -53, z: 39, r: 1.6, stops: [0.25, 3.65, 7.05] },   // SW tower
    { map: 'metro', x: 39, z: 39, r: 1.6, stops: [0.25, 3.65, 7.05] },    // SE tower
    { map: 'metro', x: -89, z: -17, r: 1.6, stops: [0.3, 3.5, 6.7, 9.9, 13.1] },                       // parking garage
    { map: 'metro', x: 60, z: 14, r: 1.6, stops: [0.25, 4.25, 8.25, 12.25] },                          // shopping mall
    { map: 'metro', x: -92, z: 16.5, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                 // residential NW
    { map: 'metro', x: -92, z: 44, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                   // residential SW
    { map: 'metro', x: -60, z: 16, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                   // residential NE
    { map: 'metro', x: -60, z: 69, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                   // residential SE
    // --- phase 4: three widely separated street<->subway shafts, so descending
    // at one and surfacing at another is a genuine map-crossing flank ---
    /* v9.10: four shafts serving the new service tunnels. Without these the
       tunnels exist and nobody can reach their far ends — the whole point is
       surfacing INSIDE a district you did not walk to. Each sits in a shaft
       chamber built at the tunnel end in metro.js; verify-lifts proves every
       stop has a floor. */
    { map: 'metro', x: 78, z: -38, r: 1.6, stops: [0, -5.75] },                                        // cargo terminal shaft
    { map: 'metro', x: -95, z: 12, r: 1.6, stops: [0, -5.75] },                                        // park strip shaft
    { map: 'metro', x: -6, z: 72, r: 1.6, stops: [0, -5.75] },                                         // market street shaft
    { map: 'metro', x: -6, z: -92, r: 1.6, stops: [0, -5.75] },                                        // rail yard shaft
    { map: 'metro', x: -20, z: -80, r: 1.6, stops: [0, -5.75] },                                       // ticket hall exit
    { map: 'metro', x: -20, z: -48, r: 1.6, stops: [0, -5.75] },                                       // west service exit
    { map: 'metro', x: -6, z: -20, r: 1.6, stops: [0, -5.75] },                                        // south tunnel exit
    { map: 'metro', x: 60, z: -86, r: 1.6, stops: [0.3, 4.5, 8.7, 12.9, 17.1, 21.3] },                 // construction tower
    { map: 'metro', x: 89, z: -54.5, r: 1.6, stops: [0, 30.3] }                                        // tower crane
  ];


  var RECOIL = { recover: 0.9, settleSec: 0.35, delayMs: 90 };

  var MOVE = {
    walk: 4.4, sprint: 6.7, crouch: 2.15, prone: 1.05, adsMult: 0.6,
    jump: 5.7, gravity: 15.5, accel: 42, airAccel: 9, step: 0.42,
    leanAngle: 0.19, leanShift: 0.42
  };

  var SPAWNS = [
    [-32, -28, Math.PI * 0.5, 'a'], [-30, 26, Math.PI, 'a'], [-12, 38, Math.PI, 'a'],
    [-44, 2, -Math.PI * 0.5, 'a'], [-58, 8, 0, 'a'], [-14, -60, Math.PI, 'a'],
    // v7.8: spawn 10 was [19,58], which the rebuilt terrace now encloses; moved to the street
    [32, -30, -Math.PI * 0.5, 'b'], [34, 28, -Math.PI * 0.5, 'b'], [22, -14, 0, 'b'],
    [60, 2, -Math.PI * 0.5, 'b'], [21.5, 50.0, Math.PI, 'b'], [17.5, -60, Math.PI, 'b'],
    [2, 44, Math.PI, 'n'], [-2, -44, Math.PI, 'n'],
    // V4.2 districts
    [-70, -80, Math.PI, 'a'], [-86, 6, Math.PI * 0.5, 'a'], [-24, 90, 0, 'a'],
    [28, -68, Math.PI, 'b'], [88, -16, -Math.PI * 0.5, 'b'], [94.5, 58.5, -Math.PI * 0.5, 'b'],   // v7.6: was [40,-84], now inside the island platform; moved to the station forecourt
    [0, -92, Math.PI, 'n'], [6, 86, Math.PI, 'n'],

    /* ---- v9.7: generated by tools/gen-points.js, not typed ------------------
       22 spawns for up to 20 humans PLUS up to 19 bots meant a Strike Team
       match had fewer tiles than bodies, which is half of why bots stacked
       before the v9.6 crowding fix. These are all NEUTRAL: the hand-placed a/b
       spawns above still encode "teams start on their own side", and pickSpawn
       maximises distance from enemies, so a team naturally takes the neutrals
       nearest itself. Tagging the new ones by half-map produced a 20:4 split on
       Metro, which would have handed one side three times the choice. Every one
       is proved by verify-map. */
    [81, -84, 2.37, "n"], [81, -72, 2.3, "n"], [75, -60, 2.25, "n"], [54, 81, 0.59, "n"],
    [-75, -36, -2.02, "n"], [-75, 48, -1, "n"], [69, -81, 2.44, "n"], [66, -51, 2.23, "n"],
    [-63, 48, -0.92, "n"], [57, 69, 0.69, "n"], [66, -69, 2.38, "n"], [-84, -45, -2.06, "n"],
    [-45, 60, -0.64, "n"], [42, 81, 0.48, "n"], [57, 57, 0.79, "n"], [-66, -45, -2.17, "n"],
    [66, 39, 1.04, "n"], [78, -48, 2.12, "n"], [-9, 0, -1.57, "n"], [-84, -27, -1.88, "n"],
    [-84, 39, -1.14, "n"], [78, 30, 1.2, "n"]
  ];

  /* ---------------- DYNAMIC LOOT ---------------- */
  // Item catalogue. kind: heal | ammo | armor | att | weapon. rar: c | r | l.

  var NET = {
    clientRate: 20, snapRate: 15, interpDelay: 120,
    hitTolerance: 4.0, historyMs: 1200,
    detectMs: 3500        // ms an unsuppressed shot pings the minimap
  };

  var MATCH = {
    defaultKills: 15,
    /* v8.30: 0 = UNLIMITED. The match ignores the kill count entirely and
       runs until the clock expires, so players can keep fighting instead of
       the round ending under them.

       SAFETY: this is only survivable because every entry in timeOptions is
       greater than zero, so an unlimited-kills match still has exactly one
       guaranteed way to end. If a "no time limit" option is ever added, the
       two must be mutually exclusive or a match could never finish — test.js
       asserts this pairing so it cannot be broken by accident. */
    killOptions: [5, 10, 15, 20, 30, 0],
    defaultMinutes: 10,
    timeOptions: [5, 10, 15, 30, 60],
    startCountdown: 5,    // seconds between the host pressing START and the match beginning
    respawnDelay: 3,
    defaultMode: 'ffa',
    pickupRadius: 1.25,
    spawnProtect: 2.5,   // seconds of spawn protection (ends early if you attack)
    assistWindow: 8,     // seconds — damage within this window before a kill counts as assist
    assistMinDmg: 25
  };

  return { HELMET: HELMET, LIFTS: LIFTS, RECOIL: RECOIL, REGEN: REGEN, PLAYER: PLAYER, ARMOR: ARMOR, MOVE: MOVE, SPAWNS: SPAWNS, NET: NET, MATCH: MATCH };
});
