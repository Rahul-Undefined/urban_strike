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
    wpn_scarh: { kind: 'weapon', w: 'scarh', rar: 'c' },
    wpn_mk14:  { kind: 'weapon', w: 'mk14', rar: 'r' },
    wpn_p90:   { kind: 'weapon', w: 'p90', rar: 'c' },
    wpn_m249:  { kind: 'weapon', w: 'm249', rar: 'l' },
    wpn_awm:   { kind: 'weapon', w: 'awm', rar: 'l' },
    // drop:1 = NEVER rolls on a ground loot point; airdrop crates only.
    wpn_aa12:  { kind: 'weapon', w: 'aa12', rar: 'l', drop: 1 },

    /* ===================== v9.3 — THE ARMOURY IN THE LOOT POOL =============

       Rarity here is a STATEMENT ABOUT SUPPLY, not about power. All nine are
       balanced against the same four damage classes as everything else, so
       nothing below is stronger than what already existed — what rarity buys
       is how often you get to choose your fight.

       'r' (rare) for the class workhorses: the AUG, AKM, UMP-9 and MP5 are
       sidegrades to guns already in the pool, so making them scarce would just
       thin out the rare tier without adding variety.

       'l' (legendary) for the four that change how a fight plays rather than
       how it is won — the Vector's 1100 rpm, the FAMAS's burst rate, the two
       war rifles' reach, and the bow.

       The BOW is legendary and `drop: 0` (ground-eligible) on purpose. It is
       the only silent weapon in the game and putting it airdrop-only would mean
       most matches never see one, which is a waste of the one genuinely novel
       thing in this pass. */
    wpn_aug:    { kind: 'weapon', w: 'aug', rar: 'c' },
    wpn_akm:    { kind: 'weapon', w: 'akm', rar: 'c' },
    wpn_ump9:   { kind: 'weapon', w: 'ump9', rar: 'c' },
    wpn_mp5:    { kind: 'weapon', w: 'mp5', rar: 'c' },
    wpn_garand: { kind: 'weapon', w: 'garand', rar: 'r' },
    wpn_famas:  { kind: 'weapon', w: 'famas', rar: 'l' },
    wpn_vector: { kind: 'weapon', w: 'vector', rar: 'l' },
    wpn_k98w:   { kind: 'weapon', w: 'k98w', rar: 'l' },
    wpn_bow:    { kind: 'weapon', w: 'bow', rar: 'l' },

    /* ARROWS — 30 live, and why they are their own pickup.

       Rahul: "add bow and arrow with 30 shots live available in loot system."
       The bow ships with 1 nocked + 29 in reserve = 30 shots, so a bow found on
       the ground is a full 30 without needing anything else. This resupply
       exists so the weapon is not a one-match-one-quiver novelty: a quiver
       tops the reserve back up the way an Ammo Cache tops up a magazine.

       It is `kind: 'ammo'` with a weapon filter rather than a new pickup kind,
       so it flows through the existing collect path — a new kind would need
       server handling, client handling, an icon and a HUD line, and would be
       four places to get wrong for something the ammo system already does. */
    arrows:     { kind: 'ammo', w: 'bow', amount: 15, rar: 'c', label: 'Quiver' },
    /* v9.5: DROP-ONLY. Rahul: "Keep drone as a drop loot only."
       `drop: 1` means it never rolls on a ground point and can only come out of
       an airdrop crate — which is the right home for it. A drone found while
       running a street is free pressure with no cost; a drone that required
       someone to contest a crate is a reward. It also fixes the count problem:
       two per player was already a lot in a twenty-player match, and making it
       ground-lootable would have put six or seven in the air at once. */
    drone:      { kind: 'gear', g: 'drone', n: 1, rar: 'l', drop: 1, label: 'Strike Drone' }
  };
  // Spawn-point classes: g ground, h elevated/interior-notable, s signature.

  /* ===== v9.5 — GUNS ON THE GROUND =====

     Rahul, twice: "guns on the ground, there should be good amt of loots on
     the ground."

     Two things caused the shortage and only one of them was the weights.

     FIRST, THE COMMON TIER HELD NO WEAPONS AT ALL. It was bandages, ammo and
     armour, so a ground point rolling 'common' — the majority of them — could
     never produce a gun. A gun needed a rare or legendary roll, which on a
     ground point was 20% combined, and most of THOSE are attachments and
     vests. Across Metro's 61 ground points that worked out at roughly six
     weapons on the whole map. So the six workhorse loot guns (SCAR-H, P90,
     AUG, AKM, UMP-9, MP5) moved to common. None of them is stronger than what
     a player already spawns with — they are sidegrades — so making them plentiful
     changes availability, not power. Rare and legendary keep the guns that
     actually change a fight: the LMG, the snipers, the Vector, the bow.

     SECOND, A QUARTER OF GROUND POINTS WERE EMPTY. An empty pickup point is
     not a balancing tool, it is a player walking to a marker and finding
     nothing. Cut to 8% — enough that the map is not uniformly stocked, low
     enough that running a street is worth it.

     Elevated points get MORE weight on rare, not more volume: climbing to a
     roof should pay better than walking, which is the whole argument for the
     v9.1 stairs. */
  var LOOT_WEIGHTS = {
    g: { empty: 0.08, c: 0.62, r: 0.25, l: 0.05 },
    h: { empty: 0.04, c: 0.40, r: 0.42, l: 0.14 },
    s: { empty: 0.00, c: 0.00, r: 0.55, l: 0.45 }
  };

  var LOOT_RESPAWN = { c: 20, r: 45, l: 120 };
  // [x, y, z, class] — y is item hover height on its floor.

  var LOOT_POINTS = [

    /* v9.6: 50 points removed. They sat on the roofs and upper floors of the
       three SE high-rise blocks at y up to 18.8, which the South Terminal
       replaced — verify-map reported them as floating because that is exactly
       what they were once the buildings came down. The terminal's own points
       are added below at measured heights. */
    [32, 11.1, -30, "s"], [0, 7.45, -62, "s"], [60, 10.75, 2, "s"], [-30, 7.25, 26, "s"],
    [-44, 4.6, -28, "h"], [34, 7.6, -27, "h"], [33, 4.2, -33, "h"], [60, 4.85, -8, "h"],
    [0, 4.05, -62, "h"], [-32.0, 4.00, 60.5, "h"], [-23.0, 4.00, 55.8, "h"], [-14.5, 4.00, 60.5, "h"],
    [-14.5, 7.20, 56.5, "s"], [13.5, 4.00, 55.8, "h"], [21.5, 4.00, 60.5, "h"], [16.0, 7.20, 61.5, "s"],
    [29.0, 1.60, 56.4, "h"], [27.5, 4.60, 60.5, "h"], [28.0, 8.45, 55.5, "s"], [-31, 4.0, 27, "h"],
    [47, -2.0, -18, "h"], [27, 0.72, 25.2, "h"], [-60, 0.55, -5, "h"], [0, 0.55, -1.8, "g"],
    [4.6, 0.6, -12, "g"], [8, 0.55, -14, "g"], [-10, 0.6, 36.5, "g"], [-12, 0.55, 32, "g"],
    [-30, 0.6, 18, "g"], [-32, 0.55, 29, "g"], [-38, 0.55, -24, "g"], [-26, 0.55, -33, "g"],
    [36, 0.55, -27, "g"], [65, 0.55, 3, "g"], [56, 0.55, -9, "g"], [50, 0.55, -4, "g"],
    [-27, 0.55, 60, "g"], [-5, 0.55, 56, "g"], [16.5, 0.55, 57.5, "g"], [8, 0.55, 58, "g"],
    [-58, 0.72, -14, "g"], [-63, 0.55, 4, "g"], [38, 0.55, 32, "g"], [40, 0.55, 38, "g"],
    [-2, 0.55, -55, "g"], [2, 0.55, -68.5, "g"], [44, 0.55, -30, "g"], [2, 0.55, 44, "g"],
    [-2, 0.55, -44, "g"], [-44, 0.55, 6, "g"], [22, 0.55, -20, "g"], [12, 0.55, 3, "g"],
    [-24, 0.55, 15, "g"], [-12, 0.55, -24, "g"], [-58.5, 5.05, -90, "h"], [-50, 0.55, -88, "g"],
    [-27, 7.75, -86, "s"], [-13.5, 7.45, -85, "h"], [-70, 0.55, -80, "g"], [-40, 0.55, -92, "g"],
    [46, 1.60, -84.4, "h"], [42, 1.65, -80.6, "s"], [36, 4.41, -85.4, "s"], [30, 1.60, -77.0, "h"],
    [36, 1.60, -71.0, "h"], [46, 5.50, -71.0, "h"], [38, 8.80, -71.0, "s"], [76, 5.15, -84.0, "h"],
    [28.5, 1.55, -94.6, "h"], [36, 4.55, -93.0, "s"], [57, 0.55, -93.0, "h"], [61, 0.55, -70.5, "h"],
    [0, 0.55, -74, "g"], [85.5, 5.75, 12, "h"], [79, 3.15, -4, "h"], [88, 0.55, -10, "g"],
    [85, 0.55, 38, "g"], [-88, 8.05, -10, "s"], [-86, 4.45, -14, "h"], [-90, 0.55, 8, "g"],
    [-41.6, 0.55, 81.4, "h"], [-41.6, 3.85, 88.0, "h"], [-41.6, 7.15, 81.4, "s"], [-29.6, 0.55, 81.4, "h"],
    [-29.6, 7.15, 88.0, "h"], [-36.0, 10.70, 86.0, "s"], [14.4, 0.55, 81.6, "h"], [14.4, 3.85, 88.0, "h"],
    [21.4, 7.15, 81.6, "h"], [18.0, 10.70, 87.5, "s"], [26.6, 3.85, 81.6, "h"], [-12.5, 3.55, 77.2, "h"],
    [53, 0.85, -38.5, "h"], [71, 0.85, -38.5, "h"], [59, 0.85, -26.6, "h"], [84, 0.55, -24.0, "s"],
    [53, 3.85, -38.5, "h"], [77, 3.85, -26.6, "h"], [66, 6.80, -33.0, "s"], [69, 1.65, -45.4, "h"],
    [66, 1.47, -16.2, "g"], [-67.5, 0.55, -28.0, "h"], [-61.5, 0.55, -21.0, "h"], [-55.5, 0.55, -36.0, "h"],
    [-70.5, 3.15, -32.5, "s"], [-58.5, 3.15, -26.5, "h"], [-63.0, 9.95, -30.5, "s"], [-32.0, 1.65, -17.7, "h"],
    [-44.0, 1.65, -17.7, "h"], [-44.0, 0.55, -47.2, "g"], [79, 8.35, 4, "s"], [92, 8.35, -4, "s"],
    [82.2, 0.63, 8, "h"], [88.7, 0.63, 0, "h"], [85, 9.45, 20, "s"], [75.4, 0.55, -5.0, "h"],
    [75.4, 3.85, -5.0, "h"], [84, 3.15, 18, "h"], [-3, 0.55, 88, "g"], [2, 0.55, 74, "g"],
    [69, 6.80, -33, "h"], [-83, 6.80, -86, "h"], [-54, 13.20, 63, "s"], [-12, 4.85, 38, "h"],
    [-32, 9.7, -28, "s"], [-24, 9.7, -24, "h"], [-90.8, 0.8, -90.8, "h"], [-90.8, 0.8, -84.8, "h"],
    [-86.3, 0.8, -87.8, "h"], [-86.3, 0.8, -81.8, "h"], [-81.8, 0.8, -90.8, "h"], [-81.8, 0.8, -84.8, "h"],
    [-77.3, 0.8, -87.8, "h"], [-77.3, 0.8, -81.8, "h"], [-90.8, 3.8, -90.8, "h"], [-90.8, 3.8, -84.8, "h"],
    [-86.3, 3.8, -87.8, "h"], [-86.3, 3.8, -81.8, "h"], [-81.8, 3.8, -90.8, "h"], [-81.8, 3.8, -84.8, "h"],
    [-77.3, 3.8, -87.8, "h"], [-77.3, 3.8, -81.8, "h"], [-32.8, 4.15, -90.8, "h"], [-32.8, 4.15, -84.8, "h"],
    [-26.6, 4.15, -90.8, "h"], [-26.6, 4.15, -84.8, "h"], [77.2, 0.8, 57.2, "h"], [85.2, 0.8, 57.2, "h"],
    [82, 2.52, 33.8, "h"], [88, 2.52, 33.8, "h"], [25.5, 4.2, -30.0, "h"], [25.5, 4.2, -26.3, "h"],
    [33.2, 4.2, -26.3, "h"], [25.5, 7.6, -30.0, "h"], [25.5, 7.6, -26.3, "h"], [33.2, 7.6, -32.3, "h"],
    [-11.8, 4.05, -62.8, "h"], [-5.3, 4.05, -65.8, "h"], [-5.3, 4.05, -59.8, "h"], [7.7, 4.05, -65.8, "h"],
    [7.7, 4.05, -59.8, "h"], [53.6, 4.8, -10.5, "h"], [65, 4.8, -10.5, "h"], [-44.4, 4.6, -35.2, "h"],
    [-44.4, 4.6, -22.6, "h"], [-21.4, 3.75, -21.7, "h"], [-64.5, 3.15, -31.3, "h"], [-58.2, 5.7, -32.8, "h"],
    [-33.5, 3.75, -22.6, "h"], [51.2, 0.8, -26.3, "h"], [60.7, 0.8, -42.8, "h"], [70.2, 0.8, -26.3, "h"],
    [51.2, 3.8, -26.3, "h"], [60.7, 3.8, -42.8, "h"], [60.7, 3.8, -26.3, "h"], [70.2, 3.8, -42.8, "h"],
    [70.2, 3.8, -26.3, "h"], [57.7, 0.8, 61.2, "h"], [66.7, 0.8, 61.2, "h"], [77.2, 0.8, 65.2, "h"],
    [89.2, 0.8, 69.2, "h"], [68.2, 0.8, 86.2, "h"], [53.2, 0.8, 57.2, "h"], [-34, 4, 22.5, "h"],
    [-28, 4, 22.5, "h"], [-25, 4, 28.5, "h"], [53.2, 0.8, 65.2, "h"], [59.2, 0.8, 79.2, "h"],
    [63.7, 0.8, 89.7, "h"], [-56.8, 4.2, 59.2, "h"], [-56.8, 4.2, 65.2, "h"], [-56.8, 7.2, 65.2, "h"],
    [-56.8, 10.2, 59.2, "h"], [-31.1, 0.55, 56.2, "h"], [-17.6, 4, 54.2, "h"], [-34.8, 4, 54.2, "h"],
    [19.2, 4, 54.2, "h"], [28.8, 4.6, 54.2, "h"], [76.2, 0.71, -88.8, "h"], [76.2, 0.71, -81.2, "h"],
    [43.2, 1.6, -74.2, "h"], [43.2, 1.6, -68.2, "h"], [48.2, 1.6, -74.2, "h"], [48.2, 1.6, -68.2, "h"],
    [27.2, 1.6, -85, "h"], [37.7, 1.6, -85, "h"], [33.2, 5.5, -74.2, "h"], [33.2, 5.5, -68.2, "h"],
    [37.6, 5.5, -71.2, "h"], [41.9, 5.5, -74.2, "h"], [64.2, 0.67, -91.4, "h"], [25.2, 3.85, 86.6, "h"],
    [32.2, 3.85, 80.6, "h"], [32.2, 3.85, 86.6, "h"], [-42.8, 3.85, 80.6, "h"], [-36.8, 3.85, 80.6, "h"],
    [-36.8, 3.85, 86.6, "h"], [-42.8, 7.15, 86.6, "h"], [-36.8, 7.15, 83.6, "h"], [-36.8, 7.15, 89.6, "h"],
    [-30.8, 3.85, 80.6, "h"], [-30.8, 3.85, 86.6, "h"], [-24.8, 3.85, 80.6, "h"], [-24.8, 3.85, 86.6, "h"],
    [-30.8, 7.15, 80.6, "h"], [-24.8, 7.15, 80.6, "h"], [-24.8, 7.15, 89.6, "h"], [13.2, 3.85, 80.6, "h"],
    [19.2, 3.85, 80.6, "h"], [19.2, 3.85, 89.6, "h"], [13.2, 7.15, 80.6, "h"], [13.2, 7.15, 86.6, "h"],
    [19.2, 7.15, 86.6, "h"], [-92.8, 4.45, -12.8, "h"], [-92.8, 4.45, -4.8, "h"], [-89.3, 4.45, -8.8, "h"],
    [-85.8, 4.45, -4.8, "h"]
  ,
    /* ---- v9.6: SOUTH TERMINAL and WESTBROOK STADIUM ---------------------
       The three demolished SE blocks took 50 points with them, and the vacant
       south-west never had any. These restock both quarters at MEASURED
       surfaces — ground at 0.55, the control tower's decks at 4.75/8.95/13.15
       (deck surface + 0.55), the stadium terraces at their tier tops. Every
       one is PROBED out of the built collider set, not typed from the drawing.
       The first cut calculated them from the design intent — deck surface plus
       0.55 — and six of six elevated points floated, because the control
       tower's decks land at 3.44/7.64/11.84 rather than the 4.20/8.40/12.60 the
       plan said, and the stadium terraces top out at 0.7 per tier rather than
       the nominal riser height. Exactly the mistake v9.3 recorded on Metro and
       wrote a note about; the note did not stop it happening again, so the
       numbers below now come from a probe. */
    // South Terminal — apron, bays, shed, fuel island
    [55, 0.55, 62, "g"], [62, 0.55, 68, "g"], [70, 0.55, 62, "g"],
    [76, 0.55, 70, "g"], [58, 0.55, 76, "g"], [66, 0.55, 78, "g"],
    [53, 0.55, 88, "g"], [60, 0.55, 90, "g"], [56, 0.55, 91, "h"],
    [84, 0.55, 85, "g"], [88, 0.55, 79, "g"], [80, 0.55, 92, "g"],
    // control tower — the climb pays on every deck, and the cab is a signature
    [86, 3.99, 62, "h"], [86, 8.19, 62, "h"], [88, 13.40, 64, "s"],
    // Westbrook Stadium — pitch, terraces, tunnels, training ground
    [-80, 1.15, 56, "g"], [-80, 1.15, 78, "g"], [-76, 1.15, 67, "g"],
    [-84, 1.15, 67, "g"], [-92, 1.95, 74, "h"],
    
    [-95, 0.55, 67, "g"], [-64, 0.55, 67, "g"],
    [-88, 0.55, 91, "g"], [-79, 0.55, 91, "g"], [-70, 0.55, 91, "g"],
    [-66, 0.55, 91, "g"], [-92, 0.55, 91, "g"], [-84, 0.55, 92, "g"],

    /* ---- v9.7: generated by tools/gen-points.js, not typed ------------------
       Ground loot filling the gaps between the hand-placed points, each found
       by building the map and reading the surface underneath — the same two
       tests verify-map applies, so nothing here floats or sits inside a wall. */
    [-64, 0.55, 32, "g"], [-72, 0.55, 30, "g"], [-82, 0.55, -56, "g"], [-58, 0.55, 28, "g"],
    [-84, 0.55, 32, "g"], [-74, 0.55, -56, "g"], [-58, 0.55, 36, "g"], [60, 0.55, 26, "g"],
    [-64, 0.55, -58, "g"], [-78, 0.55, 26, "g"], [-68, 0.55, 38, "g"], [-54, 0.55, -66, "g"],
    [-68, 0.55, 24, "g"], [-84, 0.55, -48, "g"], [62, 0.55, 38, "g"], [-76, 0.55, 36, "g"],
    [-46, 0.55, -68, "g"], [-50, 0.55, 40, "g"], [-32, 0.55, -64, "g"], [82, 0.55, -62, "g"],
    [6, 0.55, 22, "g"], [32, 0.55, 6, "g"], [-78, 0.55, -62, "g"], [-74, 0.55, 20, "g"],
    [24, 0.55, -50, "g"], [44, 0.55, 14, "g"], [54, 0.55, 20, "g"], [-54, 0.55, 22, "g"],
    [30, 0.55, -2, "g"], [66, 0.55, 22, "g"], [0, 0.55, 18, "g"], [38, 0.55, 10, "g"],
    [-50, 0.55, 32, "g"], [-18, 0.55, -4, "g"], [-70, 0.55, -62, "g"], [-62, 0.55, 42, "g"],
    [-26, 0.55, -52, "g"], [38, 0.55, -50, "g"], [-38, 0.55, -68, "g"], [10, 0.55, 28, "g"],
    [18, 0.55, -46, "g"], [66, 0.55, 44, "g"], [56, 0.55, 32, "g"], [-6, 0.55, 14, "g"],
    [-26, 0.55, -2, "g"], [-60, 0.55, -52, "g"], [-84, 0.55, 40, "g"], [-76, 0.55, -48, "g"],
    [66, 0.55, 30, "g"], [34, 0.68, -8, "g"], [-20, 0.55, -48, "g"], [-56, 0.55, -58, "g"],
    [-62, 0.55, -66, "g"], [6, 0.55, -30, "g"], [-62, 0.55, 20, "g"], [-84, 0.55, -66, "g"],
    [-66, 0.55, -48, "g"], [18, 0.55, 38, "g"], [82, 0.55, -54, "g"], [74, 0.55, -62, "g"],
    [56, 0.55, 42, "g"], [-84, 0.55, -40, "g"], [14, 0.55, -40, "g"], [12, 0.55, -84, "g"],
    [26, 0.55, 10, "g"], [-84, 0.55, 22, "g"], [-56, 0.55, -74, "g"], [46, 0.55, -52, "g"],
    [-26, 0.55, -68, "g"], [12, 0.55, 18, "g"], [-42, 0.55, -62, "g"], [-32, 0.55, -56, "g"],
    [-42, 0.55, 40, "g"], [-14, 0.55, 4, "g"], [30, 0.55, -54, "g"], [-26, 0.55, -60, "g"],
    [-72, 0.55, 44, "g"], [22, 0.55, -58, "g"], [-42, 0.55, -74, "g"], [-84, 0.55, -28, "g"],
    [24, 0.55, -6, "g"], [26, 0.55, 40, "g"], [56, 0.55, -56, "g"], [-12, 0.55, -10, "g"],
    [70, 0.55, 16, "g"], [-46, 0.55, 46, "g"], [-72, 0.55, -12, "g"], [2, 0.55, 30, "g"],
    [-76, 0.55, 8, "g"], [-28, 0.55, 42, "g"],
    /* v9.14: replacing four points the Westbrook rebuild swallowed, plus
       fill. Generated from the REBUILT geometry with tools/gen-points.js. */
    [40, 0.55, 68, "g"], [44, 0.55, 74, "g"], [-38, 0.55, -6, "g"], [-42, 0.55, 68, "g"],
    [42, 0.55, 52, "g"], [-14, 0.55, -36, "g"], [20, 0.55, -70, "g"], [-48, 0.55, -6, "g"]
  ];

  var AIRDROP = {
    periodSec: 150, fallSec: 4,
    points: [[0, -30], [-20, 8], [24, 40], [-40, -6], [0, -48], [46, 26],
      [-37, -86], [87.7, -18], [0, 86], [-88, 10]],
    // crate contents: one legendary weapon, L3 vest, med kit, one strong attachment
    /* v9.3: the crate pool gains the three loot weapons that most change how a
       fight plays rather than how it is won — the fastest gun in the game, the
       longest iron sight, and the only silent one. */
    weaponPool: ['wpn_aa12', 'wpn_awm', 'wpn_m249', 'wpn_vector', 'wpn_k98w', 'wpn_bow'],
    attPool: ['att_supp', 'att_x4', 'att_x6', 'att_x8', 'att_comp', 'att_quick'],
    /* v9.4: SIX ITEMS, NOT FOUR.
       The crate was one weapon, an L3 vest, a med kit and an attachment — a
       fixed four that the second player to reach it always found half-looted
       and never worth contesting. Six with two RANDOM slots means the crate is
       worth fighting over and worth watching land, because nobody knows what is
       in it until it opens.

       The two extra draws come from `exoticPool`: the things that are otherwise
       hard to find. `wpn_bow` and the drones are here because a crate is the
       right place for the rarest tools in the game, and a helmet because
       surviving a headshot is what turns a crate into a comeback rather than a
       consolation. */
    extraCount: 2,
    exoticPool: ['wpn_bow', 'drone', 'drone', 'helm_3', 'wpn_rocket', 'molotov', 'medkit', 'att_x8']
  };

  return { LOOT_ITEMS: LOOT_ITEMS, LOOT_WEIGHTS: LOOT_WEIGHTS, LOOT_RESPAWN: LOOT_RESPAWN, LOOT_POINTS: LOOT_POINTS, AIRDROP: AIRDROP };
});
