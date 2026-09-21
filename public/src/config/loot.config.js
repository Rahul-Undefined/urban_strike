(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  /* ===== v2.0 - A LIGHTER FLOOR, EXCLUSIVE CRATES =====
     Rahul: "remove the unnecessary drops and loot points ... keep them in the
     house not in open field. Keep the ones which can be important like the
     shield, ammo, health kit, mags, vests, remove all others. Make more drop
     points for the loot on the entire map, keep exclusive items only on the
     loots. Remove the loot box from the map in 60 seconds."

     THE FLOOR (interior and roof points only, ~130 of the old 437):
       heals (bandage / health pack / med kit), ammo, vests L1-L3, helmets
       H1-H3, the extended mag, AP mines, molotov, EMP, the ballistic shield.
     THE CRATE (every 60 s, somewhere on the whole map, gone 60 s after it
     lands): EVERY weapon in the game — nothing spawns a gun on the floor any
     more; you fight with your kit or you take a crate — plus the drone, the
     visor, C4, the 8x/6x/4x, the suppressor, an L3 vest and an H3 helmet.
     Rarity still decides how often a floor point rolls a thing; `drop: 1`
     decides that it rolls ONLY in a crate; `retired: 1` keeps an id resolving
     (viewmodels, WEAPON_ORDER indices) without ever spawning. */
  var LOOT_ITEMS = {
    bandage:  { kind: 'heal', heal: 25, rar: 'c', label: 'Bandage' },
    health:   { kind: 'heal', heal: 50, rar: 'c', label: 'Health Pack' },
    medkit:   { kind: 'heal', heal: 75, rar: 'r', label: 'Med Kit' },
    energy:   { kind: 'heal', heal: 15, rar: 'c', label: 'Energy Drink', retired: 1 },   /* v2.0: gone from the floor */
    painkill: { kind: 'heal', heal: 20, rar: 'c', label: 'Painkillers', retired: 1 },    /* v2.0: gone from the floor */
    ammo:     { kind: 'ammo', rar: 'c', label: 'Ammo Cache' },
    mine:     { kind: 'gear', g: 'mine', n: 2, rar: 'c', label: 'AP Mines \u00d72' },
    molotov:  { kind: 'gear', g: 'molotov', n: 1, rar: 'c', label: 'Molotov' },
    armor1:   { kind: 'armor', lvl: 1, rar: 'c', label: 'L1 Vest' },
    armor2:   { kind: 'armor', lvl: 2, rar: 'r', label: 'L2 Vest' },
    armor3:   { kind: 'armor', lvl: 3, rar: 'l', label: 'L3 Vest' },
    helm_1:     { kind: 'helm', l: 1, rar: 'c' },
    helm_2:     { kind: 'helm', l: 2, rar: 'r' },
    helm_3:     { kind: 'helm', l: 3, rar: 'l' },
    att_extmag: { kind: 'att', a: 'extmag', rar: 'c' },
    /* sights, muzzle and the quickdraw: crate-only exclusives now */
    att_reddot: { kind: 'att', a: 'reddot', rar: 'c', drop: 1 },
    att_flashh: { kind: 'att', a: 'flashh', rar: 'c', drop: 1 },
    att_x2:     { kind: 'att', a: 'x2', rar: 'r', drop: 1 },
    att_quick:  { kind: 'att', a: 'quick', rar: 'r', drop: 1 },
    att_comp:   { kind: 'att', a: 'comp', rar: 'r', drop: 1 },
    att_supp:   { kind: 'att', a: 'supp', rar: 'r', drop: 1 },
    att_x3:     { kind: 'att', a: 'x3', rar: 'r', drop: 1 },
    att_x4:     { kind: 'att', a: 'x4', rar: 'l', drop: 1 },
    att_x6:     { kind: 'att', a: 'x6', rar: 'l', drop: 1 },
    att_x8:     { kind: 'att', a: 'x8', rar: 'l', drop: 1 },
    /* ===== v2.0: EVERY WEAPON IS CRATE-ONLY (Rahul: no weapons on the floor).
       The ids stay (WEAPON_ORDER is the wire format; viewmodels resolve by id).
       The four v10.9 retirements stay retired. */
    wpn_sniper: { kind: 'weapon', w: 'sniper', rar: 'r', retired: 1 },
    wpn_kar98:  { kind: 'weapon', w: 'kar98', rar: 'r', drop: 1 },
    wpn_rocket: { kind: 'weapon', w: 'rocket', rar: 'l', drop: 1 },
    wpn_seeker: { kind: 'weapon', w: 'seeker', rar: 'l', drop: 1 },
    wpn_scarh: { kind: 'weapon', w: 'scarh', rar: 'c', drop: 1 },
    wpn_mk14:  { kind: 'weapon', w: 'mk14', rar: 'r', drop: 1 },
    wpn_p90:   { kind: 'weapon', w: 'p90', rar: 'c', drop: 1 },
    wpn_m249:  { kind: 'weapon', w: 'm249', rar: 'l', drop: 1 },
    wpn_awm:   { kind: 'weapon', w: 'awm', rar: 'l', drop: 1 },
    wpn_aa12:  { kind: 'weapon', w: 'aa12', rar: 'l', drop: 1 },
    wpn_aug:    { kind: 'weapon', w: 'aug', rar: 'c', drop: 1 },
    wpn_akm:    { kind: 'weapon', w: 'akm', rar: 'c', drop: 1 },
    wpn_ump9:   { kind: 'weapon', w: 'ump9', rar: 'c', drop: 1 },
    wpn_mp5:    { kind: 'weapon', w: 'mp5', rar: 'c', drop: 1 },
    wpn_garand: { kind: 'weapon', w: 'garand', rar: 'r', retired: 1 },
    wpn_famas:  { kind: 'weapon', w: 'famas', rar: 'l', drop: 1 },
    wpn_vector: { kind: 'weapon', w: 'vector', rar: 'l', drop: 1 },
    wpn_k98w:   { kind: 'weapon', w: 'k98w', rar: 'l', retired: 1 },
    wpn_bow:    { kind: 'weapon', w: 'bow', rar: 'l', retired: 1 },
    arrows:     { kind: 'ammo', w: 'bow', amount: 15, rar: 'c', label: 'Quiver', retired: 1 },
    wpn_flamer: { kind: 'weapon', w: 'flamer', rar: 'l', bigOnly: 1, drop: 1, label: 'Flamethrower' },
    /* crate-only gear */
    drone:      { kind: 'gear', g: 'drone', n: 1, rar: 'l', drop: 1, label: 'Strike Drone' },
    visor:      { kind: 'gear', g: 'visor', n: 1, rar: 'l', drop: 1, label: 'Recon Visor' },
    c4:         { kind: 'gear', g: 'c4', n: 1, rar: 'l', drop: 1, bigOnly: 1, label: 'C4 Charge' },
    /* floor gear */
    emp:        { kind: 'gear', g: 'emp', n: 1, rar: 'l', label: 'EMP Charge' },
    shield:     { kind: 'gear', g: 'shield', n: 1, rar: 'l', bigOnly: 1, label: 'Ballistic Shield' }
    /* v2.0: strike_key and remote (the kill-streak strikes) are DELETED, not retired. */
  };
  // Spawn-point classes: g ground (no longer used on Urban), h elevated/interior, s signature.

  /* v2.0: with no weapons on the floor the common tier is heals, ammo, L1/H1,
     the mag, mines and a molotov; rare is L2/H2 and the med kit; legendary is
     L3/H3, the EMP and the shield. Interior points pay better than before
     because there are fewer of them. `empty` is higher: a sparser floor is the
     point. */
  var LOOT_WEIGHTS = {
    g: { empty: 0.30, c: 0.55, r: 0.12, l: 0.03 },
    h: { empty: 0.18, c: 0.48, r: 0.26, l: 0.08 },
    s: { empty: 0.00, c: 0.10, r: 0.55, l: 0.35 }
  };

  var LOOT_RESPAWN = { c: 25, r: 50, l: 120 };
  // [x, y, z, class] — y is item hover height on its floor.

  var LOOT_POINTS = [
    /* ---- the old city: 133 interior / roof / signature points kept from the
       v1.1.2 table (every open-field 'g' point removed; 'h' thinned to one per
       9 m). Every one was probed by verify-map at its measured surface. ---- */
    [32, 11.1, -30, "s"], [0, 7.45, -62, "s"], [60, 10.75, 2, "s"], [-30, 7.25, 26, "s"],
    [-14.5, 7.2, 56.5, "s"], [16, 7.2, 61.5, "s"], [28, 8.45, 55.5, "s"], [-27, 7.75, -86, "s"],
    [42, 1.65, -80.6, "s"], [36, 4.41, -85.4, "s"], [44, 12.1, -71, "s"], [36, 4.55, -93, "s"],
    [-88, 8.05, -10, "s"], [-41.6, 7.15, 81.4, "s"], [-36, 10.7, 86, "s"], [18, 10.7, 87.5, "s"],
    [84, 0.55, -24, "s"], [66, 6.8, -33, "s"], [-63, 9.95, -30.5, "s"], [79, 8.35, 4, "s"],
    [92, 8.35, -4, "s"], [85, 9.45, 20, "s"], [-54, 6.55, 62, "s"], [-32, 9.7, -28, "s"],
    [88, 13.4, 64, "s"], [0, 21.8, -112.6, "s"], [30, 21.8, 112.6, "s"], [111.4, 21.8, 0, "s"],
    [-111.4, 21.8, 12, "s"], [-156, 0.55, -44, "s"], [-156, 0.55, 0, "s"], [-149, 0.55, 80, "s"],
    [-44, 4.6, -28, "h"], [34, 7.6, -27, "h"], [33, 4.2, -33, "h"], [60, 4.85, -8, "h"],
    [0, 4.05, -62, "h"], [-32, 4, 60.5, "h"], [-14.5, 4, 60.5, "h"], [13.5, 4, 55.8, "h"],
    [21.5, 4, 60.5, "h"], [-31, 4, 27, "h"], [47, -2, -18, "h"], [27, 0.72, 25.2, "h"],
    [-60, 0.55, -5, "h"], [-58.5, 5.05, -90, "h"], [-13.5, 7.45, -85, "h"], [30, 1.6, -77, "h"],
    [46, 5.5, -71, "h"], [38, 8.8, -71, "h"], [76, 5.15, -84, "h"], [28.5, 1.55, -94.6, "h"],
    [57, 0.55, -93, "h"], [61, 0.55, -70.5, "h"], [79, 3.15, -4, "h"], [-86, 4.45, -14, "h"],
    [-41.6, 0.55, 81.4, "h"], [-41.6, 3.85, 88, "h"], [-29.6, 0.55, 81.4, "h"], [-29.6, 7.15, 88, "h"],
    [14.4, 0.55, 81.6, "h"], [14.4, 3.85, 88, "h"], [21.4, 7.15, 81.6, "h"], [26.6, 3.85, 81.6, "h"],
    [-12.5, 3.55, 77.2, "h"], [53, 0.85, -38.5, "h"], [71, 0.85, -38.5, "h"], [59, 0.85, -26.6, "h"],
    [77, 3.85, -26.6, "h"], [-67.5, 0.55, -28, "h"], [-61.5, 0.55, -21, "h"], [-55.5, 0.55, -36, "h"],
    [-58.5, 3.15, -26.5, "h"], [-32, 1.65, -17.7, "h"], [-44, 1.65, -17.7, "h"], [82.2, 0.63, 8, "h"],
    [88.7, 0.63, 0, "h"], [75.4, 0.55, -5, "h"], [84, 3.15, 18, "h"], [-83, 6.8, -86, "h"],
    [-12, 4.85, 38, "h"], [-90.8, 0.8, -90.8, "h"], [-86.3, 0.8, -81.8, "h"], [-81.8, 0.8, -90.8, "h"],
    [-77.3, 0.8, -81.8, "h"], [-81.8, 3.8, -90.8, "h"], [-77.3, 3.8, -81.8, "h"], [-32.8, 4.15, -90.8, "h"],
    [77.2, 0.8, 57.2, "h"], [82, 2.52, 33.8, "h"], [25.5, 4.2, -26.3, "h"], [25.5, 7.6, -30, "h"],
    [-11.8, 4.05, -62.8, "h"], [-21.4, 3.75, -21.7, "h"], [-58.2, 5.7, -32.8, "h"], [70.2, 0.8, -26.3, "h"],
    [51.2, 3.8, -26.3, "h"], [60.7, 3.8, -26.3, "h"], [57.7, 0.8, 61.2, "h"], [66.7, 0.8, 61.2, "h"],
    [89.2, 0.8, 69.2, "h"], [68.2, 0.8, 86.2, "h"], [59.2, 0.8, 79.2, "h"], [-56.8, 3.55, 59.2, "h"],
    [-52, 0.55, 64, "h"], [-31.1, 0.55, 56.2, "h"], [28.8, 4.6, 54.2, "h"], [76.2, 0.71, -88.8, "h"],
    [43.2, 1.6, -68.2, "h"], [33.2, 5.5, -74.2, "h"], [-30.8, 3.85, 80.6, "h"], [13.2, 7.15, 86.6, "h"],
    [-92.8, 4.45, -4.8, "h"], [56, 0.55, 91, "h"], [86, 3.99, 62, "h"], [86, 8.19, 62, "h"],
    [2, 4.75, -109.6, "h"], [2, 8.95, -109.6, "h"], [32, 4.75, 115.6, "h"], [32, 8.95, 115.6, "h"],
    [113.4, 4.75, 3, "h"], [113.4, 8.95, 3, "h"], [-113.4, 4.75, 15, "h"], [-113.4, 8.95, 15, "h"],
    [-87.2, 5.75, -116.4, "h"], [14.8, 5.75, -116.4, "h"], [-113.5, 3.8, 79, "h"], [-154, 7.45, -85, "h"],
    [-134, 7.45, -87, "h"], [-156, 7.45, -16, "h"], [-130, 4.15, 0, "h"], [-158, 7.45, 46, "h"],
    [-149, 7.45, 70, "h"],
    /* ---- v2.0: THE NEW DISTRICTS — generated against the built map by
       tools/gen-points.js (interior floors and roofs only), appended below. ---- */
    // cannery
    [-216, 0.7, -186, "h"], [-208.5, 7.45, -178.5, "h"], [-190, 0.7, -187, "h"], [-167, 0.7, -185, "h"],
    [-217, 0.7, -147, "h"], [-210.5, 7.45, -140.5, "h"], [-183, 0.7, -147, "h"], [-133, 0.7, -186, "h"],
    [-135, 0.7, -146, "h"], [-126.5, 4.15, -138.5, "h"],
    // northridge
    [-99, 0.7, -186, "h"], [-75, 0.7, -185, "h"], [11, 0.7, -186, "h"], [19.5, 10.75, -178.5, "h"],
    [46, 0.7, -187, "h"], [-96, 0.7, -146, "h"], [-71, 0.7, -146, "h"], [-66.5, 4.15, -140.5, "h"],
    [-41, 0.7, -147, "h"], [-14, 0.7, -146, "h"], [13, 0.7, -147, "h"], [21.5, 7.45, -138.5, "h"],
    [47, 0.7, -147, "h"],
    // refinery
    [76, 0.7, -146, "h"], [100, 0.7, -148, "h"], [103.5, 4.15, -140.5, "h"], [129, 0.7, -186, "h"],
    [156, 0.7, -185, "h"], [130, 0.7, -146, "h"], [139.5, 10.75, -138.5, "h"], [158, 0.7, -147, "h"],
    [186, 0.7, -148, "h"],
    // quarry
    [-215, 0.7, 146, "h"], [-206.5, 7.45, 153.5, "h"], [-187, 0.7, 148, "h"], [-162, 0.7, 147, "h"],
    [-135, 0.7, 146, "h"], [-126.5, 7.45, 153.5, "h"], [-136, 0.7, 186, "h"], [-188, 0.7, 186, "h"],
    // commons
    [-100, 0.7, 146, "h"], [-92.5, 10.75, 153.5, "h"], [-76, 0.7, 145, "h"], [-43, 0.7, 146, "h"],
    [-14, 0.7, 147, "h"], [-6.5, 7.45, 155.5, "h"], [13, 0.7, 146, "h"], [47, 0.7, 145, "h"],
    [-44, 0.7, 185, "h"], [-36.5, 4.15, 191.5, "h"], [13, 0.7, 186, "h"], [47, 0.7, 187, "h"],
    // southport
    [75, 0.7, 146, "h"], [83.5, 7.45, 153.5, "h"], [99, 0.7, 148, "h"], [129, 0.7, 146, "h"],
    [156, 0.7, 146, "h"], [163.5, 7.45, 153.5, "h"], [186, 0.7, 147, "h"], [130, 0.7, 186, "h"],
    [158, 0.7, 185, "h"], [163.5, 4.15, 191.5, "h"],
    // gasworks
    [146, 0.7, -114, "h"], [147, 0.7, -86, "h"], [189, 0.7, -113, "h"], [195.5, 7.45, -104.5, "h"],
    [146, 0.7, -42, "h"], [172, 0.7, -40, "h"], [147, 0.7, -14, "h"], [155.5, 7.45, -6.5, "h"],
    [186, 0.7, -42, "h"],
    // terraces
    [145, 0.7, 17, "h"], [145, 0.7, 39, "h"], [151.5, 7.45, 45.5, "h"], [145, 0.7, 77, "h"],
    [145, 0.7, 99, "h"], [170, 0.7, 17, "h"], [177.5, 10.75, 23.5, "h"], [170, 0.7, 78, "h"],
    [171, 0.7, 106, "h"],
    // foundry
    [-232, 0.7, -114, "h"], [-216.5, 7.45, -106.5, "h"], [-238, 0.7, -87, "h"], [-201, 0.7, -114, "h"],
    [-203, 0.7, -86, "h"], [-196.5, 4.15, -78.5, "h"], [-242, 0.7, -42, "h"], [-216, 0.7, -40, "h"],
    [-241, 0.7, -14, "h"], [-232.5, 7.45, -6.5, "h"], [-203, 0.7, -42, "h"],
    // westfield
    [-241, 0.7, 18, "h"], [-214, 0.7, 17, "h"], [-206.5, 7.45, 23.5, "h"], [-242, 0.7, 42, "h"],
    [-216, 0.7, 43, "h"], [-241, 0.7, 78, "h"], [-232.5, 7.45, 85.5, "h"], [-214, 0.7, 79, "h"],
    [-246, 0.7, 107, "h"],
    // tower
    [-254, 4.75, -191, "h"], [-254, 8.95, -191, "h"], [-256, 21.8, -194, "s"], [198, 4.75, -191, "h"],
    [198, 8.95, -191, "h"], [196, 21.8, -194, "s"], [198, 4.75, 197, "h"], [198, 8.95, 197, "h"],
    [196, 21.8, 194, "s"], [-258, 4.75, 197, "h"], [-258, 8.95, 197, "h"], [-256, 21.8, 194, "s"],
  ];

  var AIRDROP = {
    /* v2.0 (Rahul): a crate every 60 s; its items AND the crate itself are gone
       60 s after it lands (client disposes the box; server expires the items). */
    periodSec: 60, fallSec: 4, itemTtlSec: 60, crateTtlSec: 60,
    /* drop points across the WHOLE 500 x 440 map — open asphalt or plazas,
       nothing overhead: the old core, the ring boulevard, every new district
       and the four corners. verify-map proves each has clear sky. */
    points: [
      // the core
      [0, -30], [-20, 8], [24, 40], [-40, -6], [0, -48], [46, 26], [-37, -86], [87.7, -18], [0, 86], [-88, 10],
      // the ring boulevard
      [-60, -102], [60, 102], [102, -60], [-102, 60],
      // the western reach
      [-146, -34], [-146, 34], [-170, -80], [-170, 80],
      // v2.0: the outer city — plazas, cross streets, the perimeter boulevard
      [-30, -197], [197, 0], [-257, 0], [-230, -166], [-150, -166], [-60, -166],
      [30, -166], [170, -166], [-230, 166], [-60, 166], [30, 166], [110, 166],
      [166, -60], [166, 60], [-226, -60], [-226, 60], [-230, -210], [110, -210],
      [-230, 210], [110, 210], [210, -120], [210, 120], [-270, -120], [-270, 120],
      [100, -170], [86, 180], [170, -70], [190, 60],
    ],
    /* v2.0: NO guaranteed filler. `count` draws, without replacement, from
       `exoticPool` alone — what a crate is now for. Weapons sit in the pool
       twice as often as gear so a crate is usually worth a gun. */
    count: 5,
    exoticPool: ['wpn_kar98', 'wpn_awm', 'wpn_scarh', 'wpn_akm', 'wpn_aug', 'wpn_mk14', 'wpn_p90', 'wpn_ump9', 'wpn_mp5',
      'wpn_m249', 'wpn_vector', 'wpn_famas', 'wpn_aa12', 'wpn_rocket', 'wpn_rocket', 'wpn_seeker', 'wpn_flamer',
      'drone', 'drone', 'visor', 'c4', 'emp', 'shield', 'armor3', 'helm_3',
      'att_x8', 'att_x6', 'att_x4', 'att_supp', 'att_quick', 'att_comp', 'att_reddot'],
    /* kept for old readers; loot.js draws from exoticPool only */
    weaponPool: ['wpn_aa12', 'wpn_awm', 'wpn_m249', 'wpn_vector'],
    attPool: ['att_supp', 'att_x4', 'att_x6', 'att_x8', 'att_comp', 'att_quick'],
    extraCount: 0
  };

  return { LOOT_ITEMS: LOOT_ITEMS, LOOT_WEIGHTS: LOOT_WEIGHTS, LOOT_RESPAWN: LOOT_RESPAWN, LOOT_POINTS: LOOT_POINTS, AIRDROP: AIRDROP };
});
