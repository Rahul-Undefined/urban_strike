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
    ak47:    { label: 'AK-47',     type: 'auto',  key: 1, dmg: 33, head: 2.4, rpm: 600, mag: 30, reserve: 120, reload: 2.5, spread: 0.022, ads: 0.006,  recoil: 0.030, drift: 0.55, range: 80,  speed: 0.93, adsFov: 55 },
    m4a1:    { label: 'M4A1',      type: 'auto',  key: 2, dmg: 26, head: 2.2, rpm: 780, mag: 30, reserve: 150, reload: 2.2, spread: 0.017, ads: 0.0045, recoil: 0.021, drift: 0.35, range: 85,  speed: 0.95, adsFov: 55 },
    sniper:  { label: 'AWM-S',     type: 'bolt',  key: 3, dmg: 95, head: 2.5, rpm: 34,  mag: 5,  reserve: 20,  reload: 3.4, spread: 0.09,  ads: 0.0006, recoil: 0.090, drift: 0.2, range: 220, speed: 0.88, adsFov: 16, scope: true, boltTime: 1.25 },
    uzi:     { label: 'Uzi',       type: 'auto',  key: 4, dmg: 18, head: 1.8, rpm: 950, mag: 32, reserve: 160, reload: 1.8, spread: 0.030, ads: 0.016,  recoil: 0.013, drift: 0.8, range: 38,  speed: 1.02, adsFov: 62 },
    shotgun: { label: 'Pump 870',  type: 'pump',  key: 5, dmg: 11, head: 1.5, rpm: 68,  mag: 6,  reserve: 30,  reload: 0.55, pellets: 8, spread: 0.05, ads: 0.035, recoil: 0.075, drift: 0.3, range: 20, speed: 0.94, adsFov: 60, shellReload: true },
    pistol:  { label: 'P-9',       type: 'semi',  key: 6, dmg: 24, head: 2.2, rpm: 420, mag: 12, reserve: 72,  reload: 1.5, spread: 0.012, ads: 0.005,  recoil: 0.015, drift: 0.3, range: 55,  speed: 1.05, adsFov: 60 },
    rocket:  { label: 'RPG-L',     type: 'rocket',key: 7, dmg: 120, radius: 6.5, rpm: 30, mag: 1, reserve: 2, reload: 3.6, spread: 0.008, ads: 0.004, recoil: 0.120, drift: 0.2, range: 300, speed: 0.85, adsFov: 58, projSpeed: 30 },
    knife:   { label: 'Knife',     type: 'melee', key: 8, dmg: 55, head: 1.0, rpm: 82,  mag: 0,  reserve: 0,   reload: 0,   spread: 0, ads: 0, recoil: 0.01, drift: 0, range: 2.3, speed: 1.08, adsFov: 70 }
  };
  var WEAPON_ORDER = ['ak47', 'm4a1', 'sniper', 'uzi', 'shotgun', 'pistol', 'rocket', 'knife'];

  var THROWS = {
    frag:  { label: 'Frag',  dmg: 110, radius: 7.0, fuse: 2.8, count: 2, throwVel: 16 },
    smoke: { label: 'Smoke', dur: 12, radius: 5.5, fuse: 1.4, count: 1, throwVel: 14 },
    flash: { label: 'Flash', radius: 15, blind: 3.2, fuse: 1.4, count: 1, throwVel: 16 }
  };

  var PLAYER = {
    hp: 100,
    standH: 1.8, crouchH: 1.2, radius: 0.35,
    eyeStand: 0.72,   // eye offset above collider CENTER when standing
    eyeCrouch: 0.42,
    headR: 0.19       // head hitbox half-size
  };

  // PUBG-style armor: pick up vests on the map. absorb = share of damage the
  // vest soaks; dur = how much soaked damage breaks it. Players spawn bare.
  var ARMOR = {
    1: { label: 'L1', absorb: 0.45, dur: 60,  color: '#9aa3ad' },
    2: { label: 'L2', absorb: 0.58, dur: 110, color: '#4fa3e0' },
    3: { label: 'L3', absorb: 0.70, dur: 180, color: '#f0c040' }
  };

  var MOVE = {
    walk: 4.4, sprint: 6.7, crouch: 2.15, adsMult: 0.6,
    jump: 5.7, gravity: 15.5, accel: 42, airAccel: 9, step: 0.42,
    leanAngle: 0.19, leanShift: 0.42
  };

  // Spawn points: [x, z, facingYaw, side]. side: 'a' | 'b' | 'n' (neutral).
  // FFA uses all; team modes prefer own side + neutral.
  var SPAWNS = [
    [-32, -28, Math.PI * 0.5, 'a'],   // warehouse interior
    [-30, 26, Math.PI, 'a'],          // office ground floor
    [-12, 38, Math.PI, 'a'],          // garage
    [-44, 2, -Math.PI * 0.5, 'a'],    // west road
    [-58, 8, 0, 'a'],                 // rail yard
    [-14, -60, Math.PI, 'a'],         // construction west
    [32, -30, -Math.PI * 0.5, 'b'],   // apartment ground floor
    [34, 28, -Math.PI * 0.5, 'b'],    // container yard
    [22, -14, 0, 'b'],                // NE alley
    [60, 2, -Math.PI * 0.5, 'b'],     // Depot B interior
    [19, 58, 0, 'b'],                 // row house east
    [17.5, -60, Math.PI, 'b'],        // construction east
    [2, 44, Math.PI, 'n'],            // south road
    [-2, -44, Math.PI, 'n']           // north road
  ];

  // Pickup spots: [type, x, y, z]. type: 'health' | 'armor1' | 'armor2' | 'armor3'
  var PICKUP_SPOTS = [
    ['health', 0, 0.55, -1.8],        // crossroads — risky
    ['health', -44, 4.6, -28],        // warehouse catwalk
    ['health', 34, 7.6, -27],         // apartment 2nd floor
    ['health', 0, 4.05, -62],         // construction slab 1
    ['health', 8, 0.55, 58],          // row-house alley
    ['health', 60, 4.85, -8],         // Depot B mezzanine
    ['armor1', -10, 0.6, 36.5],       // garage
    ['armor1', -30, 0.6, 18],         // alley B
    ['armor1', 27, 0.72, 25.2],       // inside open container
    ['armor1', 4.6, 0.6, -12],        // crossroads wreck
    ['armor2', -20.5, 0.6, -21],      // warehouse office room
    ['armor2', 66, 0.6, 13],          // Depot B far corner
    ['armor3', 32, 11.1, -30]         // apartment ROOF — the prize, only one
  ];
  var PICKUPS = {
    health: { heal: 50, respawn: 20 },
    armor1: { lvl: 1, respawn: 25 },
    armor2: { lvl: 2, respawn: 45 },
    armor3: { lvl: 3, respawn: 90 }
  };

  var COLORS = ['#f0a232', '#4fa3e0', '#63d968', '#e2503c', '#c778e8',
    '#40c8c0', '#e8d040', '#e878a8', '#90a8ff', '#a8e070'];

  var TEAMS = {
    a: { name: 'AMBER', color: '#f0a232' },
    b: { name: 'COBALT', color: '#4fa3e0' }
  };

  var MODES = {
    ffa: { label: 'Free For All', teams: false, maxPlayers: 10 },
    t3:  { label: '3 vs 3',       teams: true,  maxPlayers: 6 },
    t5:  { label: '5 vs 5',       teams: true,  maxPlayers: 10 }
  };

  var NET = {
    clientRate: 20,    // Hz — client sends its state
    snapRate: 15,      // Hz — server broadcasts snapshots
    interpDelay: 120,  // ms — remote players rendered this far in the past
    hitTolerance: 4.0, // m  — server accepts a claimed victim position within this distance of recent history
    historyMs: 1200    // ms of position history kept per player for lag-compensation checks
  };

  var MATCH = {
    defaultKills: 15,
    killOptions: [5, 10, 15, 20, 30],
    defaultMinutes: 10,
    timeOptions: [5, 10, 15, 0], // 0 = no time limit
    respawnDelay: 3,
    defaultMode: 'ffa',
    pickupRadius: 1.25
  };

  return { WEAPONS: WEAPONS, WEAPON_ORDER: WEAPON_ORDER, THROWS: THROWS, PLAYER: PLAYER,
    ARMOR: ARMOR, MOVE: MOVE, SPAWNS: SPAWNS, PICKUP_SPOTS: PICKUP_SPOTS, PICKUPS: PICKUPS,
    COLORS: COLORS, TEAMS: TEAMS, MODES: MODES, NET: NET, MATCH: MATCH };
});
