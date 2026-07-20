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

  var MOVE = {
    walk: 4.4, sprint: 6.7, crouch: 2.15, prone: 1.05, adsMult: 0.6,
    jump: 5.7, gravity: 15.5, accel: 42, airAccel: 9, step: 0.42,
    leanAngle: 0.19, leanShift: 0.42
  };

  var SPAWNS = [
    [-32, -28, Math.PI * 0.5, 'a'], [-30, 26, Math.PI, 'a'], [-12, 38, Math.PI, 'a'],
    [-44, 2, -Math.PI * 0.5, 'a'], [-58, 8, 0, 'a'], [-14, -60, Math.PI, 'a'],
    [32, -30, -Math.PI * 0.5, 'b'], [34, 28, -Math.PI * 0.5, 'b'], [22, -14, 0, 'b'],
    [60, 2, -Math.PI * 0.5, 'b'], [19, 58, 0, 'b'], [17.5, -60, Math.PI, 'b'],
    [2, 44, Math.PI, 'n'], [-2, -44, Math.PI, 'n'],
    // V4.2 districts
    [-70, -80, Math.PI, 'a'], [-86, 6, Math.PI * 0.5, 'a'], [-24, 90, 0, 'a'],
    [40, -84, Math.PI, 'b'], [88, -16, -Math.PI * 0.5, 'b'], [94.5, 58.5, -Math.PI * 0.5, 'b'],
    [0, -92, Math.PI, 'n'], [24, 90, 0, 'n']
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
    timeOptions: [5, 10, 15, 0],
    respawnDelay: 3,
    defaultMode: 'ffa',
    pickupRadius: 1.25,
    spawnProtect: 2.5,   // seconds of spawn protection (ends early if you attack)
    assistWindow: 8,     // seconds — damage within this window before a kill counts as assist
    assistMinDmg: 25
  };

  return { PLAYER: PLAYER, ARMOR: ARMOR, MOVE: MOVE, SPAWNS: SPAWNS, NET: NET, MATCH: MATCH };
});
