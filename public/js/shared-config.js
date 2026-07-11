/* UrbanStrike shared configuration.
   Loaded by the browser (as window.CFG) AND by the Node server (require).
   This is THE balance file — edit numbers here to tune the game. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.CFG = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  var WEAPONS = {
    // dmg: per bullet | head: headshot multiplier | rpm: rounds per minute
    // spread: hip-fire cone (radians) | ads: aim-down-sights cone | recoil: camera kick per shot
    // range: full-damage distance (m), falls to 45% beyond | speed: movement multiplier
    ak47:    { label: 'AK-47',     type: 'auto',  key: 1, dmg: 33, head: 2.4, rpm: 600, mag: 30, reserve: 120, reload: 2.5, spread: 0.022, ads: 0.006,  recoil: 0.030, range: 80,  speed: 0.93, adsFov: 55 },
    m4a1:    { label: 'M4A1',      type: 'auto',  key: 2, dmg: 26, head: 2.2, rpm: 780, mag: 30, reserve: 150, reload: 2.2, spread: 0.017, ads: 0.0045, recoil: 0.021, range: 85,  speed: 0.95, adsFov: 55 },
    sniper:  { label: 'AWM-S',     type: 'bolt',  key: 3, dmg: 95, head: 2.5, rpm: 34,  mag: 5,  reserve: 20,  reload: 3.4, spread: 0.09,  ads: 0.0006, recoil: 0.090, range: 220, speed: 0.88, adsFov: 16, scope: true, boltTime: 1.25 },
    uzi:     { label: 'Uzi',       type: 'auto',  key: 4, dmg: 18, head: 1.8, rpm: 950, mag: 32, reserve: 160, reload: 1.8, spread: 0.030, ads: 0.016,  recoil: 0.013, range: 38,  speed: 1.02, adsFov: 62 },
    shotgun: { label: 'Pump 870',  type: 'pump',  key: 5, dmg: 11, head: 1.5, rpm: 68,  mag: 6,  reserve: 30,  reload: 0.55, pellets: 8, spread: 0.05, ads: 0.035, recoil: 0.075, range: 20, speed: 0.94, adsFov: 60, shellReload: true },
    pistol:  { label: 'P-9',       type: 'semi',  key: 6, dmg: 24, head: 2.2, rpm: 420, mag: 12, reserve: 72,  reload: 1.5, spread: 0.012, ads: 0.005,  recoil: 0.015, range: 55,  speed: 1.05, adsFov: 60 },
    rocket:  { label: 'RPG-L',     type: 'rocket',key: 7, dmg: 120, radius: 6.5, rpm: 30, mag: 1, reserve: 2, reload: 3.6, spread: 0.008, ads: 0.004, recoil: 0.120, range: 300, speed: 0.85, adsFov: 58, projSpeed: 30 },
    knife:   { label: 'Knife',     type: 'melee', key: 8, dmg: 55, head: 1.0, rpm: 82,  mag: 0,  reserve: 0,   reload: 0,   spread: 0, ads: 0, recoil: 0.01, range: 2.3, speed: 1.08, adsFov: 70 }
  };
  var WEAPON_ORDER = ['ak47', 'm4a1', 'sniper', 'uzi', 'shotgun', 'pistol', 'rocket', 'knife'];

  var THROWS = {
    frag:  { label: 'Frag',  dmg: 110, radius: 7.0, fuse: 2.8, count: 2, throwVel: 16 },
    smoke: { label: 'Smoke', dur: 12, radius: 5.5, fuse: 1.4, count: 1, throwVel: 14 },
    flash: { label: 'Flash', radius: 15, blind: 3.2, fuse: 1.4, count: 1, throwVel: 16 }
  };

  var PLAYER = {
    hp: 100, armor: 50,
    standH: 1.8, crouchH: 1.2, radius: 0.35,
    eyeStand: 0.72,   // eye offset above collider CENTER when standing
    eyeCrouch: 0.42,
    headR: 0.19,      // head hitbox half-size
    armorAbsorb: 0.62 // fraction of damage soaked by armor while armor > 0
  };

  var MOVE = {
    walk: 4.4, sprint: 6.7, crouch: 2.15, adsMult: 0.6,
    jump: 5.7, gravity: 15.5, accel: 42, airAccel: 9, step: 0.42,
    leanAngle: 0.19, leanShift: 0.42
  };

  // Spawn points: [x, z, facingYaw]. y computed from ground.
  var SPAWNS = [
    [-32, -28, Math.PI * 0.5],   // warehouse interior
    [32, -30, -Math.PI * 0.5],   // apartment ground floor
    [-30, 26, Math.PI],          // office ground floor
    [-12, 38, Math.PI],          // garage
    [34, 28, -Math.PI * 0.5],    // container yard
    [22, -14, 0],                // NE alley
    [-44, 2, -Math.PI * 0.5],    // west road
    [2, 44, Math.PI]             // south road
  ];

  var COLORS = ['#f0a232', '#4fa3e0', '#63d968', '#e2503c'];

  var NET = {
    clientRate: 20,    // Hz — client sends its state
    snapRate: 15,      // Hz — server broadcasts snapshots
    interpDelay: 120,  // ms — remote players rendered this far in the past
    hitTolerance: 4.0, // m  — server accepts a claimed victim position within this distance of recent history
    historyMs: 1200    // ms of position history kept per player for lag-compensation checks
  };

  var MATCH = {
    defaultKills: 10,
    killOptions: [5, 10, 15, 20],
    defaultMinutes: 10,
    timeOptions: [5, 10, 15, 0], // 0 = no time limit
    respawnDelay: 3,
    maxPlayers: 4
  };

  return { WEAPONS: WEAPONS, WEAPON_ORDER: WEAPON_ORDER, THROWS: THROWS, PLAYER: PLAYER, MOVE: MOVE, SPAWNS: SPAWNS, COLORS: COLORS, NET: NET, MATCH: MATCH };
});
