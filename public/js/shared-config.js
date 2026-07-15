/* UrbanStrike shared configuration — THE balance file.
   Loaded by the browser (window.CFG) AND by the Node server (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.CFG = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  var WEAPONS = {
    // Base loadout (keys 1-8) — every player always carries these.
    ak47:    { label: 'AK-47',    type: 'auto',  key: 1, dmg: 33, head: 2.4, rpm: 600, mag: 30, reserve: 120, reload: 2.5, spread: 0.022, ads: 0.006,  recoil: 0.030, drift: 0.55, range: 80,  speed: 0.93, adsFov: 55 },
    m4a1:    { label: 'M4A1',     type: 'auto',  key: 2, dmg: 26, head: 2.2, rpm: 780, mag: 30, reserve: 150, reload: 2.2, spread: 0.017, ads: 0.0045, recoil: 0.021, drift: 0.35, range: 85,  speed: 0.95, adsFov: 55 },
    sniper:  { label: 'AWM-S',    type: 'bolt',  key: 3, dmg: 95, head: 2.5, rpm: 34,  mag: 5,  reserve: 20,  reload: 3.4, spread: 0.09,  ads: 0.0006, recoil: 0.090, drift: 0.2, range: 220, speed: 0.88, adsFov: 16, scope: true, boltTime: 1.25 },
    uzi:     { label: 'Uzi',      type: 'auto',  key: 4, dmg: 18, head: 1.8, rpm: 950, mag: 32, reserve: 160, reload: 1.8, spread: 0.030, ads: 0.016,  recoil: 0.013, drift: 0.8, range: 38,  speed: 1.02, adsFov: 62 },
    shotgun: { label: 'Pump 870', type: 'pump',  key: 5, dmg: 11, head: 1.5, rpm: 68,  mag: 6,  reserve: 30,  reload: 0.55, pellets: 8, spread: 0.05, ads: 0.035, recoil: 0.075, drift: 0.3, range: 20, speed: 0.94, adsFov: 60, shellReload: true },
    pistol:  { label: 'P-9',      type: 'semi',  key: 6, dmg: 24, head: 2.2, rpm: 420, mag: 12, reserve: 72,  reload: 1.5, spread: 0.012, ads: 0.005,  recoil: 0.015, drift: 0.3, range: 55,  speed: 1.05, adsFov: 60 },
    rocket:  { label: 'RPG-L',    type: 'rocket',key: 7, dmg: 120, radius: 6.5, rpm: 30, mag: 1, reserve: 2, reload: 3.6, spread: 0.008, ads: 0.004, recoil: 0.120, drift: 0.2, range: 300, speed: 0.85, adsFov: 58, projSpeed: 30 },
    knife:   { label: 'Knife',    type: 'melee', key: 8, dmg: 55, head: 1.0, rpm: 82,  mag: 0,  reserve: 0,   reload: 0,   spread: 0, ads: 0, recoil: 0.01, drift: 0, range: 2.3, speed: 1.08, adsFov: 70 },
    // Exclusive loot weapons (key 9) — found on the map / in airdrops only.
    scarh:   { label: 'SCAR-H',   type: 'auto',  key: 9, ex: 1, dmg: 38, head: 2.3, rpm: 560, mag: 25, reserve: 100, reload: 2.4, spread: 0.020, ads: 0.005, recoil: 0.034, drift: 0.45, range: 90, speed: 0.92, adsFov: 55 },
    mk14:    { label: 'MK14 EBR', type: 'semi',  key: 9, ex: 1, dmg: 46, head: 2.3, rpm: 340, mag: 20, reserve: 80,  reload: 2.6, spread: 0.014, ads: 0.002, recoil: 0.045, drift: 0.3, range: 120, speed: 0.92, adsFov: 38 },
    p90:     { label: 'P90',      type: 'auto',  key: 9, ex: 1, dmg: 16, head: 1.8, rpm: 1000, mag: 50, reserve: 150, reload: 2.3, spread: 0.026, ads: 0.012, recoil: 0.011, drift: 0.75, range: 42, speed: 1.05, adsFov: 62 },
    m249:    { label: 'M249',     type: 'auto',  key: 9, ex: 1, dmg: 28, head: 2.0, rpm: 720, mag: 100, reserve: 200, reload: 4.6, spread: 0.030, ads: 0.009, recoil: 0.026, drift: 0.7, range: 75, speed: 0.84, adsFov: 58 },
    awm:     { label: 'AWM',      type: 'bolt',  key: 9, ex: 1, dmg: 118, head: 2.5, rpm: 30, mag: 5, reserve: 15, reload: 3.6, spread: 0.09, ads: 0.0005, recoil: 0.100, drift: 0.2, range: 240, speed: 0.86, adsFov: 14, scope: true, boltTime: 1.35 }
  };
  var WEAPON_ORDER = ['ak47', 'm4a1', 'sniper', 'uzi', 'shotgun', 'pistol', 'rocket', 'knife',
    'scarh', 'mk14', 'p90', 'm249', 'awm'];

  var THROWS = {
    frag:  { label: 'Frag',  dmg: 110, radius: 7.0, fuse: 2.8, count: 2, throwVel: 16, cook: true },
    smoke: { label: 'Smoke', dur: 12, radius: 5.5, fuse: 1.4, count: 1, throwVel: 14 },
    flash: { label: 'Flash', radius: 15, blind: 3.2, fuse: 1.4, count: 1, throwVel: 16 }
  };

  var PLAYER = {
    hp: 100,
    standH: 1.8, crouchH: 1.2, radius: 0.35,
    eyeStand: 0.72, eyeCrouch: 0.42,
    headR: 0.19
  };

  var ARMOR = {
    1: { label: 'L1', absorb: 0.45, dur: 60,  color: '#9aa3ad' },
    2: { label: 'L2', absorb: 0.58, dur: 110, color: '#4fa3e0' },
    3: { label: 'L3', absorb: 0.70, dur: 180, color: '#f0c040' }
  };

  // Attachments — auto-equipped on pickup into one of three slots (cat).
  var ATTACH = {
    reddot: { cat: 'sight',  label: 'Red Dot',       spreadMult: 0.85 },
    x2:     { cat: 'sight',  label: '2x Scope',      adsFov: 40, spreadMult: 0.9 },
    x4:     { cat: 'sight',  label: '4x Scope',      adsFov: 22, spreadMult: 0.9 },
    extmag: { cat: 'mag',    label: 'Ext. Mag',      magMult: 1.4 },
    quick:  { cat: 'mag',    label: 'Quickdraw Mag', reloadMult: 0.72 },
    supp:   { cat: 'muzzle', label: 'Suppressor',    quiet: 1, noFlash: 1, detectMs: 1200 },
    flashh: { cat: 'muzzle', label: 'Flash Hider',   noFlash: 1 },
    comp:   { cat: 'muzzle', label: 'Compensator',   recoilMult: 0.8 }
  };

  var MOVE = {
    walk: 4.4, sprint: 6.7, crouch: 2.15, adsMult: 0.6,
    jump: 5.7, gravity: 15.5, accel: 42, airAccel: 9, step: 0.42,
    leanAngle: 0.19, leanShift: 0.42
  };

  var SPAWNS = [
    [-32, -28, Math.PI * 0.5, 'a'], [-30, 26, Math.PI, 'a'], [-12, 38, Math.PI, 'a'],
    [-44, 2, -Math.PI * 0.5, 'a'], [-58, 8, 0, 'a'], [-14, -60, Math.PI, 'a'],
    [32, -30, -Math.PI * 0.5, 'b'], [34, 28, -Math.PI * 0.5, 'b'], [22, -14, 0, 'b'],
    [60, 2, -Math.PI * 0.5, 'b'], [19, 58, 0, 'b'], [17.5, -60, Math.PI, 'b'],
    [2, 44, Math.PI, 'n'], [-2, -44, Math.PI, 'n']
  ];

  /* ---------------- DYNAMIC LOOT ---------------- */
  // Item catalogue. kind: heal | ammo | armor | att | weapon. rar: c | r | l.
  var LOOT_ITEMS = {
    bandage:  { kind: 'heal', heal: 25, rar: 'c', label: 'Bandage' },
    health:   { kind: 'heal', heal: 50, rar: 'c', label: 'Health Pack' },
    energy:   { kind: 'heal', heal: 15, rar: 'c', label: 'Energy Drink' },
    painkill: { kind: 'heal', heal: 20, rar: 'c', label: 'Painkillers' },
    medkit:   { kind: 'heal', heal: 75, rar: 'r', label: 'Med Kit' },
    ammo:     { kind: 'ammo', rar: 'c', label: 'Ammo Cache' },
    armor1:   { kind: 'armor', lvl: 1, rar: 'c', label: 'L1 Vest' },
    armor2:   { kind: 'armor', lvl: 2, rar: 'r', label: 'L2 Vest' },
    armor3:   { kind: 'armor', lvl: 3, rar: 'l', label: 'L3 Vest' },
    att_reddot: { kind: 'att', a: 'reddot', rar: 'c' },
    att_extmag: { kind: 'att', a: 'extmag', rar: 'c' },
    att_flashh: { kind: 'att', a: 'flashh', rar: 'c' },
    att_x2:     { kind: 'att', a: 'x2', rar: 'r' },
    att_quick:  { kind: 'att', a: 'quick', rar: 'r' },
    att_comp:   { kind: 'att', a: 'comp', rar: 'r' },
    att_supp:   { kind: 'att', a: 'supp', rar: 'r' },
    att_x4:     { kind: 'att', a: 'x4', rar: 'l' },
    wpn_scarh: { kind: 'weapon', w: 'scarh', rar: 'r' },
    wpn_mk14:  { kind: 'weapon', w: 'mk14', rar: 'r' },
    wpn_p90:   { kind: 'weapon', w: 'p90', rar: 'r' },
    wpn_m249:  { kind: 'weapon', w: 'm249', rar: 'l' },
    wpn_awm:   { kind: 'weapon', w: 'awm', rar: 'l' }
  };
  // Spawn-point classes: g ground, h elevated/interior-notable, s signature.
  var LOOT_WEIGHTS = {
    g: { empty: 0.25, c: 0.55, r: 0.17, l: 0.03 },
    h: { empty: 0.10, c: 0.42, r: 0.36, l: 0.12 },
    s: { empty: 0.00, c: 0.00, r: 0.55, l: 0.45 }
  };
  var LOOT_RESPAWN = { c: 20, r: 45, l: 120 };
  // [x, y, z, class] — y is item hover height on its floor.
  var LOOT_POINTS = [
    // signature spots — always rare or legendary
    [32, 11.1, -30, 's'],      // apartment roof
    [0, 7.45, -62, 's'],       // construction slab 2
    [60, 10.75, 2, 's'],       // Depot B roof
    [-30, 7.25, 26, 's'],      // office roof
    // elevated / interior
    [-44, 4.6, -28, 'h'],      // warehouse catwalk
    [34, 7.6, -27, 'h'],       // apartment floor 2
    [33, 4.2, -33, 'h'],       // apartment floor 1
    [60, 4.85, -8, 'h'],       // Depot mezzanine
    [0, 4.05, -62, 'h'],       // construction slab 1
    [-3, 7.05, 58.5, 'h'],     // row-house mid roof
    [-27, 4.15, 60, 'h'],      // row house W floor 2
    [17, 4.15, 56, 'h'],       // row house E floor 2
    [-31, 4.0, 27, 'h'],       // office floor 2
    [47, -2.0, -18, 'h'],      // tunnel mid
    [27, 0.72, 25.2, 'h'],     // open container SE
    [-60, 0.55, -5, 'h'],      // bunker interior
    // ground
    [0, 0.55, -1.8, 'g'], [4.6, 0.6, -12, 'g'], [8, 0.55, -14, 'g'],
    [-10, 0.6, 36.5, 'g'], [-12, 0.55, 32, 'g'], [-30, 0.6, 18, 'g'],
    [-32, 0.55, 29, 'g'], [-38, 0.55, -24, 'g'], [-26, 0.55, -33, 'g'],
    [36, 0.55, -27, 'g'], [65, 0.55, 3, 'g'], [56, 0.55, -9, 'g'],
    [50, 0.55, -4, 'g'], [-27, 0.55, 60, 'g'], [-5, 0.55, 56, 'g'],
    [16.5, 0.55, 57.5, 'g'], [8, 0.55, 58, 'g'], [-58, 0.72, -14, 'g'],
    [-63, 0.55, 4, 'g'], [38, 0.55, 32, 'g'], [40, 0.55, 38, 'g'],
    [-2, 0.55, -55, 'g'], [2, 0.55, -68.5, 'g'], [44, 0.55, -30, 'g'],
    [2, 0.55, 44, 'g'], [-2, 0.55, -44, 'g'], [-44, 0.55, 6, 'g'],
    [22, 0.55, -20, 'g'], [12, 0.55, 3, 'g'], [-24, 0.55, 15, 'g'],
    [-12, 0.55, -24, 'g']
  ];

  var AIRDROP = {
    periodSec: 150, fallSec: 4,
    points: [[0, -30], [-20, 8], [24, 40], [-40, -6], [8, -52], [46, 26]],
    // crate contents: one legendary weapon, L3 vest, med kit, one strong attachment
    weaponPool: ['wpn_awm', 'wpn_m249'],
    attPool: ['att_supp', 'att_x4', 'att_comp', 'att_quick']
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
    clientRate: 20, snapRate: 15, interpDelay: 120,
    hitTolerance: 4.0, historyMs: 1200
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

  return { WEAPONS: WEAPONS, WEAPON_ORDER: WEAPON_ORDER, THROWS: THROWS, PLAYER: PLAYER,
    ARMOR: ARMOR, ATTACH: ATTACH, MOVE: MOVE, SPAWNS: SPAWNS,
    LOOT_ITEMS: LOOT_ITEMS, LOOT_WEIGHTS: LOOT_WEIGHTS, LOOT_RESPAWN: LOOT_RESPAWN,
    LOOT_POINTS: LOOT_POINTS, AIRDROP: AIRDROP,
    COLORS: COLORS, TEAMS: TEAMS, MODES: MODES, NET: NET, MATCH: MATCH };
});
