(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  var LOOT_ITEMS = {
    bandage:  { kind: 'heal', heal: 25, rar: 'c', label: 'Bandage' },
    health:   { kind: 'heal', heal: 50, rar: 'c', label: 'Health Pack' },
    energy:   { kind: 'heal', heal: 15, rar: 'c', label: 'Energy Drink' },
    painkill: { kind: 'heal', heal: 20, rar: 'c', label: 'Painkillers' },
    medkit:   { kind: 'heal', heal: 75, rar: 'r', label: 'Med Kit' },
    ammo:     { kind: 'ammo', rar: 'c', label: 'Ammo Cache' },
    mine:     { kind: 'gear', g: 'mine', n: 2, rar: 'c', label: 'AP Mines \u00d72' },
    molotov:  { kind: 'gear', g: 'molotov', n: 1, rar: 'c', label: 'Molotov' },
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
    [-12, 0.55, -24, 'g'],
    // ---- V4.2 districts ----
    [-58.5, 5.05, -90, 'h'],   // hangar mezzanine
    [-50, 0.55, -88, 'g'],     // hangar floor
    [-27, 7.75, -86, 's'],     // terminal roof
    [-13.5, 7.45, -85, 'h'],   // control tower
    [-70, 0.55, -80, 'g'],     // apron
    [-40, 0.55, -92, 'g'],     // runway edge
    [40, 1.67, -78.6, 'h'],    // rail platform
    [37, 5.4, -92, 'h'],       // station roof
    [74, 5.1, -86, 's'],       // footbridge deck
    [57, 1.85, -88.1, 'h'],    // flatcar
    [0, 0.55, -74, 'g'],       // north gate
    [84.5, 5.75, -22, 'h'],    // container 2-stack top
    [78, 3.15, -38, 'h'],      // container 1-stack top
    [88, 0.55, -10, 'g'],      // cargo lane
    [78, 4.6, 53, 'h'],        // ticket office roof
    [85, 0.55, 38, 'g'],       // under canopy
    [-88, 8.05, -10, 's'],     // constrW slab 2
    [-86, 4.45, -14, 'h'],     // constrW slab 1
    [-90, 0.55, 8, 'g'],       // constrW ground
    [-30, 7.65, 87, 'h'],      // apartment A roof
    [24, 7.65, 87, 'h'],       // apartment B roof
    [-36, 4.1, 90, 'h'],       // apartment A floor 2
    [30, 4.1, 90, 'h'],        // apartment B floor 2
    [-3, 0.55, 88, 'g'],       // courtyard
    [2, 0.55, 74, 'g']         // south gate
  ];

  var AIRDROP = {
    periodSec: 150, fallSec: 4,
    points: [[0, -30], [-20, 8], [24, 40], [-40, -6], [0, -48], [46, 26],
      [-37, -86], [87.7, -18], [0, 86], [-88, 10]],
    // crate contents: one legendary weapon, L3 vest, med kit, one strong attachment
    weaponPool: ['wpn_awm', 'wpn_m249'],
    attPool: ['att_supp', 'att_x4', 'att_comp', 'att_quick']
  };

  return { LOOT_ITEMS: LOOT_ITEMS, LOOT_WEIGHTS: LOOT_WEIGHTS, LOOT_RESPAWN: LOOT_RESPAWN, LOOT_POINTS: LOOT_POINTS, AIRDROP: AIRDROP };
});
