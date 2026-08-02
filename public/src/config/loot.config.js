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
    helm_1:     { kind: 'helm', l: 1, rar: 'c' },
    helm_2:     { kind: 'helm', l: 2, rar: 'r' },
    helm_3:     { kind: 'helm', l: 3, rar: 'l' },
    att_x3:     { kind: 'att', a: 'x3', rar: 'r' },
    att_x4:     { kind: 'att', a: 'x4', rar: 'l' },
    att_x6:     { kind: 'att', a: 'x6', rar: 'l' },
    att_x8:     { kind: 'att', a: 'x8', rar: 'l', drop: 1 },
    wpn_sniper: { kind: 'weapon', w: 'sniper', rar: 'r' },
    wpn_rocket: { kind: 'weapon', w: 'rocket', rar: 'l' },
    wpn_scarh: { kind: 'weapon', w: 'scarh', rar: 'r' },
    wpn_mk14:  { kind: 'weapon', w: 'mk14', rar: 'r' },
    wpn_p90:   { kind: 'weapon', w: 'p90', rar: 'r' },
    wpn_m249:  { kind: 'weapon', w: 'm249', rar: 'l' },
    wpn_awm:   { kind: 'weapon', w: 'awm', rar: 'l' },
    // drop:1 = NEVER rolls on a ground loot point; airdrop crates only.
    wpn_aa12:  { kind: 'weapon', w: 'aa12', rar: 'l', drop: 1 }
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
    /* --- OLD TOWN TERRACE (rebuilt v7.8) -------------------------------
       Loot y is support-top + 0.55. Six houses, and entering any of them has
       to pay: one upstairs in each, one on each terrace roof run, one behind
       the shop counter. Nothing on the street — the street is the risk. */
    [-32.0, 4.00, 60.5, 'h'],  // brick house, upstairs back bedroom
    [-23.0, 4.00, 55.8, 'h'],  // cream house W, upstairs front
    [-14.5, 4.00, 60.5, 'h'],  // ochre house, upstairs (roof stair house)
    [-14.5, 7.20, 56.5, 's'],  // west terrace roof run
    [13.5, 4.00, 55.8, 'h'],   // sage house, upstairs front
    [21.5, 4.00, 60.5, 'h'],   // cream house E, upstairs back
    [16.0, 7.20, 61.5, 's'],   // east terrace roof run
    [29.0, 1.60, 56.4, 'h'],   // corner shop, behind the counter
    [27.5, 4.60, 60.5, 'h'],   // shop stockroom
    [28.0, 8.45, 55.5, 's'],   // shop roof terrace — district high ground
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
    /* --- RAILWAY DISTRICT (rebuilt v7.6) -------------------------------
       Loot y is always support-top + 0.55. Every level of the district is
       rewarded, so climbing and entering both pay: concourse -> upper floor ->
       roof, platform -> canopy, shed floor -> shed roof. */
    [46, 1.60, -84.4, 'h'],    // island platform deck
    [42, 1.65, -80.6, 's'],    // INSIDE the walkable coach — signature spot
    [36, 4.41, -85.4, 's'],    // canopy deck (drop from the footbridge)
    [30, 1.60, -77.0, 'h'],    // side platform
    [36, 1.60, -71.0, 'h'],    // station concourse
    [46, 5.50, -71.0, 'h'],    // station upper floor
    [38, 8.80, -71.0, 's'],    // station roof
    [76, 5.15, -84.0, 'h'],    // footbridge deck
    [28.5, 1.55, -94.6, 'h'],  // engine shed workbench
    [36, 4.55, -93.0, 's'],    // engine shed roof
    [57, 0.55, -93.0, 'h'],    // maintenance hut
    [61, 0.55, -70.5, 'h'],    // forecourt taxi shelter
    [0, 0.55, -74, 'g'],       // north gate
    [85.5, 5.75, 12, 'h'],    // container 2-stack top
    [79, 3.15, -4, 'h'],      // container 1-stack top
    [88, 0.55, -10, 'g'],      // cargo lane
    [78, 4.6, 53, 'h'],        // ticket office roof
    [85, 0.55, 38, 'g'],       // under canopy
    [-88, 8.05, -10, 's'],     // constrW slab 2
    [-86, 4.45, -14, 'h'],     // constrW slab 1
    [-90, 0.55, 8, 'g'],       // constrW ground
    /* --- THE COLONY (rebuilt v7.8) --------------------------------------
       Three floors x three cores. Loot climbs with you: ground flats are the
       cheap pickup, the top floor and the roof are the ones worth the stair
       core. Nothing on the deck itself — the deck is the exposed route. */
    [-41.6, 0.55, 81.4, 'h'],  // pink core, ground flat
    [-41.6, 3.85, 88.0, 'h'],  // pink core, first floor rear room
    [-41.6, 7.15, 81.4, 's'],  // pink core, top floor
    [-29.6, 0.55, 81.4, 'h'],  // yellow core, ground flat
    [-29.6, 7.15, 88.0, 'h'],  // yellow core, top floor rear
    [-36.0, 10.70, 86.0, 's'], // WEST ROOF — under the water tank gantry
    [14.4, 0.55, 81.6, 'h'],   // mint core, ground flat
    [14.4, 3.85, 88.0, 'h'],   // mint core, first floor rear
    [21.4, 7.15, 81.6, 'h'],   // mint core, top floor
    [18.0, 10.70, 87.5, 's'],  // EAST ROOF
    [26.6, 3.85, 81.6, 'h'],   // low wing, upper flat
    [-12.5, 3.55, 77.2, 'h'],  // garage roof, courtyard hard cover
    /* --- MARKET CROSS (rebuilt v7.8) ------------------------------------
       The arcade is the risk, the units are the reward. Two per floor either
       side, plus the roof and the loading dock. */
    [53, 0.85, -38.5, 'h'],    // mall unit, ground NW (on the counter)
    [71, 0.85, -38.5, 'h'],    // mall unit, ground NE
    [59, 0.85, -26.6, 'h'],    // mall unit, ground SW
    [84, 0.55, -24.0, 's'],    // lift lobby, ground
    [53, 3.85, -38.5, 'h'],    // mall unit, first floor NW
    [77, 3.85, -26.6, 'h'],    // mall unit, first floor SE
    [66, 6.80, -33.0, 's'],    // MALL ROOF — reached by the external flight
    [69, 1.65, -45.4, 'h'],    // loading dock
    [66, 1.47, -16.2, 'g'],    // the fountain
    /* --- IRONGATE DEPOT (new v7.9) ---------------------------------------
       Ground loot sits in the lanes where you have to walk a corridor to get
       it. The container tops and the crane deck are the paid-for positions. */
    [-67.5, 0.55, -28.0, 'h'],   // second lane, mid corridor
    [-61.5, 0.55, -21.0, 'h'],   // third lane
    [-55.5, 0.55, -36.0, 'h'],   // fourth lane, behind the blast wall
    [-70.5, 3.15, -32.5, 's'],   // container top, west row
    [-58.5, 3.15, -26.5, 'h'],   // container top, east row
    [-63.0, 9.95, -30.5, 's'],   // CRANE DECK — nine metres of committed climb
    [-32.0, 1.65, -17.7, 'h'],   // loading dock, centre bay
    [-44.0, 1.65, -17.7, 'h'],   // loading dock, west bay
    [-44.0, 0.55, -47.2, 'g'],   // north yard, the burnt-out truck
    /* --- EASTGATE YARD (rebuilt v8.0) ------------------------------------
       Three heights, three rewards. The ground pickup is the cheapest, the
       three-high roof costs a climb, and the gantry costs a 28-step commitment
       with one way down. */
    [79, 8.35, 4, 's'],        // three-high roof, west row
    [92, 8.35, -4, 's'],       // three-high roof, east row
    [82.2, 0.63, 8, 'h'],      // west lane, ground
    [88.7, 0.63, 0, 'h'],      // east lane, ground
    [85, 9.45, 20, 's'],       // GANTRY DECK
    [75.4, 0.55, -5.0, 'h'],   // yard office, ground
    [75.4, 3.85, -5.0, 'h'],   // yard office, upper
    [84, 3.15, 18, 'h'],       // reefer row roof
    [-3, 0.55, 88, 'g'],       // courtyard
    [2, 0.55, 74, 'g'],        // south gate
    // v6.0 district rooftops — the payoff for the climb (validator-proven)
    [61, 18.80, 64, "s"],
    [84, 18.80, 64, "s"],
    [67, 18.80, 85, "h"],
    [69, 6.80, -33, "h"],
    [-83, 6.80, -86, "h"],
    [-54, 13.20, 63, "s"],
    // v4.7 accessibility roofs (validator-proven)
    [-12, 4.85, 38, "h"],
    [-32, 9.7, -28, "s"],
    [-24, 9.7, -24, "h"],

    /* ---- v8.8 INTERIOR LOOT PASS ------------------------------------------
       130 hand-placed points across a 200 m map with nine districts, most of
       them outdoors, made going inside a building unrewarding. These 157 were
       generated by tools/gen-loot.js from the finished collider set, not placed
       by hand: every one sits on a real surface at support-top + 0.55, which is
       verify-map's own support rule, and every one is INDOORS — a ceiling
       between 2 and 6 m overhead. A loot point on an open roof is a sniper
       nest, not a room.

       Capped at 22 per district. Uncapped, one multi-floor block in the
       south-east produced 101 of 244 and would have been the only place worth
       looting. Regenerate with: node tools/gen-loot.js
       ---------------------------------------------------------------------- */
    // AIRPORT (20)
    [-90.8, 0.8, -90.8, 'h'],
    [-90.8, 0.8, -84.8, 'h'],
    [-86.3, 0.8, -87.8, 'h'],
    [-86.3, 0.8, -81.8, 'h'],
    [-81.8, 0.8, -90.8, 'h'],
    [-81.8, 0.8, -84.8, 'h'],
    [-77.3, 0.8, -87.8, 'h'],
    [-77.3, 0.8, -81.8, 'h'],
    [-90.8, 3.8, -90.8, 'h'],
    [-90.8, 3.8, -84.8, 'h'],
    [-86.3, 3.8, -87.8, 'h'],
    [-86.3, 3.8, -81.8, 'h'],
    [-81.8, 3.8, -90.8, 'h'],
    [-81.8, 3.8, -84.8, 'h'],
    [-77.3, 3.8, -87.8, 'h'],
    [-77.3, 3.8, -81.8, 'h'],
    [-32.8, 4.15, -90.8, 'h'],
    [-32.8, 4.15, -84.8, 'h'],
    [-26.6, 4.15, -90.8, 'h'],
    [-26.6, 4.15, -84.8, 'h'],
    // BUS TERMINAL (13)
    [77.2, 0.8, 57.2, 'h'],
    [85.2, 0.8, 57.2, 'h'],
    [85.2, 3.8, 57.2, 'h'],
    [77.2, 6.8, 57.2, 'h'],
    [85.2, 6.8, 57.2, 'h'],
    [77.2, 9.8, 57.2, 'h'],
    [85.2, 9.8, 57.2, 'h'],
    [77.2, 12.8, 57.2, 'h'],
    [85.2, 12.8, 57.2, 'h'],
    [77.2, 15.8, 57.2, 'h'],
    [85.2, 15.8, 57.2, 'h'],
    [82, 2.52, 33.8, 'h'],
    [88, 2.52, 33.8, 'h'],
    // CIVIC CENTRE (6)
    [25.5, 4.2, -32.3, 'h'],
    [25.5, 4.2, -26.3, 'h'],
    [33.2, 4.2, -26.3, 'h'],
    [25.5, 7.6, -32.3, 'h'],
    [25.5, 7.6, -26.3, 'h'],
    [33.2, 7.6, -32.3, 'h'],
    // CONSTRUCTION SITE (5)
    [-11.8, 4.05, -62.8, 'h'],
    [-5.3, 4.05, -65.8, 'h'],
    [-5.3, 4.05, -59.8, 'h'],
    [7.7, 4.05, -65.8, 'h'],
    [7.7, 4.05, -59.8, 'h'],
    // DEPOT B (2)
    [53.6, 4.8, -10.5, 'h'],
    [65, 4.8, -10.5, 'h'],
    // IRONGATE DEPOT (6)
    [-44.4, 4.6, -35.2, 'h'],
    [-44.4, 4.6, -22.6, 'h'],
    [-21.4, 3.75, -21.7, 'h'],
    [-64.5, 3.15, -31.3, 'h'],
    [-58.2, 5.7, -32.8, 'h'],
    [-33.5, 3.75, -22.6, 'h'],
    // MARKET CROSS (8)
    [51.2, 0.8, -26.3, 'h'],
    [60.7, 0.8, -42.8, 'h'],
    [70.2, 0.8, -26.3, 'h'],
    [51.2, 3.8, -26.3, 'h'],
    [60.7, 3.8, -42.8, 'h'],
    [60.7, 3.8, -26.3, 'h'],
    [70.2, 3.8, -42.8, 'h'],
    [70.2, 3.8, -26.3, 'h'],
    // NEAR BUS TERMINAL (22)
    [57.7, 0.8, 61.2, 'h'],
    [66.7, 0.8, 61.2, 'h'],
    [62.2, 3.8, 65.2, 'h'],
    [57.7, 6.8, 69.2, 'h'],
    [57.7, 9.8, 61.2, 'h'],
    [66.7, 9.8, 61.2, 'h'],
    [62.2, 12.8, 65.2, 'h'],
    [62.2, 15.8, 57.2, 'h'],
    [77.2, 0.8, 65.2, 'h'],
    [89.2, 0.8, 69.2, 'h'],
    [85.2, 3.8, 69.2, 'h'],
    [85.2, 6.8, 65.2, 'h'],
    [81.2, 9.8, 69.2, 'h'],
    [77.2, 12.8, 65.2, 'h'],
    [89.2, 12.8, 69.2, 'h'],
    [85.2, 15.8, 65.2, 'h'],
    [68.2, 0.8, 86.2, 'h'],
    [68.2, 3.8, 86.2, 'h'],
    [68.2, 6.8, 79.2, 'h'],
    [68.2, 9.8, 79.2, 'h'],
    [63.7, 12.8, 82.7, 'h'],
    [63.7, 15.8, 82.7, 'h'],
    // NEAR CIVIC CENTRE (9)
    [53.2, 0.8, 57.2, 'h'],
    [53.2, 3.8, 57.2, 'h'],
    [53.2, 6.8, 57.2, 'h'],
    [53.2, 9.8, 57.2, 'h'],
    [53.2, 12.8, 57.2, 'h'],
    [53.2, 15.8, 57.2, 'h'],
    [-34, 4, 22.5, 'h'],
    [-28, 4, 22.5, 'h'],
    [-25, 4, 28.5, 'h'],
    // NEAR THE COLONY (22)
    [53.2, 0.8, 65.2, 'h'],
    [53.2, 3.8, 65.2, 'h'],
    [53.2, 6.8, 65.2, 'h'],
    [53.2, 12.8, 65.2, 'h'],
    [53.2, 15.8, 65.2, 'h'],
    [59.2, 0.8, 79.2, 'h'],
    [63.7, 0.8, 89.7, 'h'],
    [59.2, 3.8, 79.2, 'h'],
    [59.2, 3.8, 86.2, 'h'],
    [59.2, 6.8, 79.2, 'h'],
    [59.2, 6.8, 86.2, 'h'],
    [63.7, 6.8, 89.7, 'h'],
    [59.2, 9.8, 86.2, 'h'],
    [63.7, 9.8, 89.7, 'h'],
    [59.2, 12.8, 86.2, 'h'],
    [63.7, 12.8, 89.7, 'h'],
    [59.2, 15.8, 79.2, 'h'],
    [63.7, 15.8, 89.7, 'h'],
    [-56.8, 4.2, 59.2, 'h'],
    [-56.8, 4.2, 65.2, 'h'],
    [-56.8, 7.2, 65.2, 'h'],
    [-56.8, 10.2, 59.2, 'h'],
    // OLD TOWN TERRACE (5)
    [-31.1, 0.55, 56.2, 'h'],
    [-17.6, 4, 54.2, 'h'],
    [-34.8, 4, 54.2, 'h'],
    [19.2, 4, 54.2, 'h'],
    [28.8, 4.6, 54.2, 'h'],
    // SECTOR 7 CENTRAL (13)
    [76.2, 0.71, -88.8, 'h'],
    [76.2, 0.71, -81.2, 'h'],
    [43.2, 1.6, -74.2, 'h'],
    [43.2, 1.6, -68.2, 'h'],
    [48.2, 1.6, -74.2, 'h'],
    [48.2, 1.6, -68.2, 'h'],
    [27.2, 1.6, -85, 'h'],
    [37.7, 1.6, -85, 'h'],
    [33.2, 5.5, -74.2, 'h'],
    [33.2, 5.5, -68.2, 'h'],
    [37.6, 5.5, -71.2, 'h'],
    [41.9, 5.5, -74.2, 'h'],
    [64.2, 0.67, -91.4, 'h'],
    // THE COLONY (22)
    [25.2, 3.85, 86.6, 'h'],
    [32.2, 3.85, 80.6, 'h'],
    [32.2, 3.85, 86.6, 'h'],
    [-42.8, 3.85, 80.6, 'h'],
    [-36.8, 3.85, 80.6, 'h'],
    [-36.8, 3.85, 86.6, 'h'],
    [-42.8, 7.15, 86.6, 'h'],
    [-36.8, 7.15, 83.6, 'h'],
    [-36.8, 7.15, 89.6, 'h'],
    [-30.8, 3.85, 80.6, 'h'],
    [-30.8, 3.85, 86.6, 'h'],
    [-24.8, 3.85, 80.6, 'h'],
    [-24.8, 3.85, 86.6, 'h'],
    [-30.8, 7.15, 80.6, 'h'],
    [-24.8, 7.15, 80.6, 'h'],
    [-24.8, 7.15, 89.6, 'h'],
    [13.2, 3.85, 80.6, 'h'],
    [19.2, 3.85, 80.6, 'h'],
    [19.2, 3.85, 89.6, 'h'],
    [13.2, 7.15, 80.6, 'h'],
    [13.2, 7.15, 86.6, 'h'],
    [19.2, 7.15, 86.6, 'h'],
    // WEST WORKS (4)
    [-92.8, 4.45, -12.8, 'h'],
    [-92.8, 4.45, -4.8, 'h'],
    [-89.3, 4.45, -8.8, 'h'],
    [-85.8, 4.45, -4.8, 'h'],
  ];

  var AIRDROP = {
    periodSec: 150, fallSec: 4,
    points: [[0, -30], [-20, 8], [24, 40], [-40, -6], [0, -48], [46, 26],
      [-37, -86], [87.7, -18], [0, 86], [-88, 10]],
    // crate contents: one legendary weapon, L3 vest, med kit, one strong attachment
    weaponPool: ['wpn_aa12', 'wpn_awm', 'wpn_m249'],
    attPool: ['att_supp', 'att_x4', 'att_x6', 'att_x8', 'att_comp', 'att_quick']
  };

  return { LOOT_ITEMS: LOOT_ITEMS, LOOT_WEIGHTS: LOOT_WEIGHTS, LOOT_RESPAWN: LOOT_RESPAWN, LOOT_POINTS: LOOT_POINTS, AIRDROP: AIRDROP };
});
