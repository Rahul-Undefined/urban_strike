(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  var PLAYER = {
    hp: 100,
    standH: 1.8, crouchH: 1.2, proneH: 0.7, radius: 0.35,
    eyeStand: 0.72, eyeCrouch: 0.42, eyeProne: 0.18,
    headR: 0.19
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
  /* VOICE. voice.js has always read CFG.VOICE.turn — but CFG.VOICE was never
     defined anywhere, so the TURN hook was dead code and the mesh has always
     been STUN-only. STUN alone cannot connect two peers that are both behind
     symmetric NAT / CGNAT, which is common on Indian mobile and broadband.
     Put TURN credentials in `turn` (array, one entry per URL) to fix that.
     Free tiers exist (e.g. Metered Open Relay, Twilio, Xirsys); self-hosting
     coturn also works. `debug: true` shows the live per-peer diagnostics panel. */
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

  var LIFTS = [
    { map: 'urban', x: 54.0, z: 58.0, r: 1.6, stops: [0.25, 3.25, 6.25, 9.25, 12.25, 15.25, 18.25] },  // tower A
    { map: 'urban', x: 78.0, z: 60.0, r: 1.6, stops: [0.25, 3.25, 6.25, 9.25, 12.25, 15.25, 18.25] },  // tower B
    { map: 'urban', x: 60.0, z: 80.0, r: 1.6, stops: [0.25, 3.25, 6.25, 9.25, 12.25, 15.25, 18.25] },  // tower C
    { map: 'urban', x: 84.2, z: -25.5, r: 1.6, stops: [0.25, 3.25, 6.25] },                            // mall
    { map: 'urban', x: -76.2, z: -81.9, r: 1.6, stops: [0.25, 3.25, 6.25] },                           // airport terminal
    // --- Metro City (v7.1). Every shaft position DERIVED by searching each
    // structure for a spot valid at all stops, never chosen by eye. ---
    { map: 'metro', x: -53, z: -53, r: 1.6, stops: [0.25, 4.25, 8.25, 12.25, 16.25, 20.25, 24.25] },  // NW tower
    { map: 'metro', x: 39, z: -53, r: 1.6, stops: [0.25, 4.25, 8.25, 12.25, 16.25, 20.25, 24.25] },   // NE tower
    { map: 'metro', x: -53, z: 39, r: 1.6, stops: [0.25, 4.25, 8.25, 12.25, 16.25, 20.25, 24.25] },   // SW tower
    { map: 'metro', x: 39, z: 39, r: 1.6, stops: [0.25, 4.25, 8.25, 12.25, 16.25, 20.25, 24.25] },    // SE tower
    { map: 'metro', x: -89, z: -17, r: 1.6, stops: [0.3, 3.5, 6.7, 9.9, 13.1] },                       // parking garage
    { map: 'metro', x: 60, z: 14, r: 1.6, stops: [0.25, 4.25, 8.25, 12.25] },                          // shopping mall
    { map: 'metro', x: -92, z: 16.5, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                 // residential NW
    { map: 'metro', x: -92, z: 44, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                   // residential SW
    { map: 'metro', x: -60, z: 16, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                   // residential NE
    { map: 'metro', x: -60, z: 69, r: 1.6, stops: [0.25, 3.45, 6.65, 9.85, 13.05] },                   // residential SE
    // --- phase 4: three widely separated street<->subway shafts, so descending
    // at one and surfacing at another is a genuine map-crossing flank ---
    { map: 'metro', x: -20, z: -80, r: 1.6, stops: [0, -5.75] },                                       // ticket hall exit
    { map: 'metro', x: -20, z: -48, r: 1.6, stops: [0, -5.75] },                                       // west service exit
    { map: 'metro', x: -6, z: -20, r: 1.6, stops: [0, -5.75] },                                        // south tunnel exit
    { map: 'metro', x: 60, z: -86, r: 1.6, stops: [0.3, 4.5, 8.7, 12.9, 17.1, 21.3] },                 // construction tower
    { map: 'metro', x: 89, z: -54.5, r: 1.6, stops: [0, 30.3] }                                        // tower crane
  ];

  var VOICE = {
    turn: [],            // e.g. { urls: 'turn:host:80', username: 'u', credential: 'p' }
    debug: true,
    iceRestart: true     // retry a failed peer once with an ICE restart
  };

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
    [0, -92, Math.PI, 'n'], [6, 86, Math.PI, 'n']
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
    killOptions: [5, 10, 15, 20, 30],
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

  return { HELMET: HELMET, LIFTS: LIFTS, VOICE: VOICE, RECOIL: RECOIL, REGEN: REGEN, PLAYER: PLAYER, ARMOR: ARMOR, MOVE: MOVE, SPAWNS: SPAWNS, NET: NET, MATCH: MATCH };
});
