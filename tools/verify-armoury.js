/* verify-armoury — the damage table is a CONTRACT, not a pile of numbers.

   weapons.config.js opens with four damage classes and the shots-to-kill each
   one produces. That table is the reason the game is learnable: a player who
   knows "assault = two body shots" must not have to relearn it per gun. v9.3
   added nine weapons at once, which is exactly the pass where a stray 52 or a
   mistyped head multiplier stops being noticeable by reading.

   So this asserts the CLASSES, not individual numbers. A weapon may be added
   freely; it may not invent a fifth breakpoint.

   It also checks the things a new weapon silently forgets: a WEAPON_ORDER slot
   (or it cannot be synced), a viewmodel (or it renders as hands), a loot entry
   (or it can never be found), and — for anything loot-only — that it is not
   also in the spawn loadout.

   Run: node tools/verify-armoury.js */

const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

const W = CFG.WEAPONS;
const HP = CFG.PLAYER.hp;
const body = k => W[k].dmg * (W[k].pellets || 1);
const stk = k => Math.ceil(HP / body(k));

console.log('--- damage classes ---');
/* The class a weapon belongs to is declared by its body damage. Every weapon
   must land on one of these, and its headshot must produce the shots-to-kill
   the class promises. */
const CLASSES = {
  sniper:   { body: [100, 115], headKills: 1, bodyShots: 1 },
  marksman: { body: [55, 55],   headKills: 2, bodyShots: 2 },
  assault:  { body: [50, 50],   headKills: 2, bodyShots: 2 },
  smg:      { body: [30, 30],   headKills: 2, bodyShots: 4 }
};
function classOf(k) {
  const b = body(k);
  for (const c in CLASSES) {
    const r = CLASSES[c].body;
    if (b >= r[0] - 0.001 && b <= r[1] + 0.001) return c;
  }
  return null;
}

/* Weapons that are deliberately outside the class system, each with the reason
   recorded here so "it is an exception" always comes with "and why". */
const EXEMPT = {
  rocket:  'explosive — area damage with its own falloff model',
  knife:   'melee — no range, no ammo, balanced by having to touch the target',
  shotgun: 'pellet spread — 80 at point blank by design, see weapons.config.js',
  aa12:    'pellet spread — 60 per trigger pull, sustained rather than punchy',
  bow:     'projectile — 90 body is deliberately NOT a one-shot, see weapons.config.js',
  /* v9.5: the drone is a CARRIED SLOT, not a firearm. It occupies a weapon slot
     so scrolling, the viewmodel registry and the `wp` sync field all work for
     free, but it fires nothing — tryFire() intercepts it and calls the launcher.
     Its damage lives in CFG.GEAR.drone where the server reads it, so testing it
     against a firearm damage class would be testing the wrong number. */
  drone:   'gear slot — launches a drone, fires no round; damage lives in CFG.GEAR.drone'
};

Object.keys(W).forEach(k => {
  if (EXEMPT[k]) { pass++; console.log('  PASS  ' + k + ' is a documented exception: ' + EXEMPT[k]); return; }
  const c = classOf(k);
  ok(c !== null, k + ' lands on a declared damage class [body ' + body(k).toFixed(1) + ']');
  if (!c) return;
  ok(stk(k) === CLASSES[c].bodyShots,
    k + ' (' + c + ') kills in ' + CLASSES[c].bodyShots + ' body shots [' + stk(k) + ']');
  const head = body(k) * (W[k].head || 1);
  ok(Math.ceil(HP / head) === CLASSES[c].headKills,
    k + ' (' + c + ') kills in ' + CLASSES[c].headKills + ' head shot(s) [' +
    head.toFixed(1) + ' per hit]');
});

console.log('\n--- the shotgun rule (v9.3) ---');
/* Rahul asked for 80 on the first shot and 20 on the second. The value of that
   is that it is DETERMINISTIC: no full-pattern hit ever kills outright, and no
   full-pattern hit ever fails to set up the follow-up. */
const sg = body('shotgun');
ok(sg > 75 && sg < 85, 'M870 full pattern takes ~80% of a healthy target [' + sg.toFixed(1) + ']');
ok(sg < HP, 'M870 never one-shots a healthy body — the kill is always the second shell');
ok(HP - sg > 15 && HP - sg < 25, 'the survivor is left on ~20 HP [' + (HP - sg).toFixed(1) + ']');
ok(Math.ceil(HP / body('aa12')) === 2, 'AA-12 also kills in two trigger pulls');

console.log('\n--- the one-shot monopoly ---');
const snipers = Object.keys(W).filter(k => W[k].scope === true);
ok(snipers.length >= 3, 'the sniper class exists [' + snipers.join(', ') + ']');
Object.keys(W).forEach(k => {
  if (snipers.indexOf(k) >= 0 || W[k].radius || W[k].type === 'melee') return;
  ok(body(k) < HP, k + ' cannot one-shot a healthy body [' + body(k).toFixed(1) + ']');
});

console.log('\n--- every weapon is reachable ---');
const vmsrc = fs.readFileSync(path.join(ROOT, 'public/src/weapons/viewmodels.js'), 'utf8');
const lootW = Object.keys(CFG.LOOT_ITEMS)
  .filter(k => CFG.LOOT_ITEMS[k].kind === 'weapon')
  .map(k => CFG.LOOT_ITEMS[k].w);
Object.keys(W).forEach(k => {
  ok(CFG.WEAPON_ORDER.indexOf(k) >= 0, k + ' has a WEAPON_ORDER slot (so `wp` can name it)');
  ok(new RegExp('models\\.' + k + '\\s*=').test(vmsrc), k + ' has an explicit viewmodel');
  /* A loot-only weapon absent from every loot table can never be obtained —
     that direction is a hard error.

     The reverse is NOT. This gate originally failed a base weapon that also
     appears as loot, on the reasoning that picking up a gun you already spawn
     with is a wasted pickup. The AWM-S proves that wrong: it is key 3 in the
     base loadout AND `wpn_sniper` in the loot table, deliberately, because the
     weapon grant refills magazine and reserve — so a spare AWM-S on the ground
     is a sniper ammo cache. That is a design choice from v8.16, not an
     oversight, and asserting against it would have been a gate telling the game
     it was wrong. Recorded instead of enforced. */
  if (W[k].gear) {
    /* Gear slots are granted by a GEAR pickup, not a weapon pickup, so they are
       correctly absent from the weapon loot table. */
    ok(!!CFG.LOOT_ITEMS[k] && CFG.LOOT_ITEMS[k].kind === 'gear',
      k + ' is a gear slot and has a gear pickup');
  } else if (W[k].ex) ok(lootW.indexOf(k) >= 0, k + ' is loot-only and IS in the loot table');
  else if (lootW.indexOf(k) >= 0) {
    pass++; console.log('  PASS  ' + k + ' is a spawn weapon that also drops as loot (acts as a resupply)');
  }
});
ok(CFG.WEAPON_ORDER.length === Object.keys(W).length,
  'WEAPON_ORDER and the weapon table are the same size [' +
  CFG.WEAPON_ORDER.length + ' vs ' + Object.keys(W).length + ']');
ok(new Set(CFG.WEAPON_ORDER).size === CFG.WEAPON_ORDER.length,
  'no weapon appears twice in WEAPON_ORDER');

console.log('\n--- travelling projectiles carry the keys their code reads ---');
/* v9.9. The bow shipped in v9.3 with `projSpeed` and `drop` — the ROCKET's
   field names — while the travelling-bullet path reads `bulletSpeed` and
   `bulletDrop`. It received undefined, its velocity became NaN, and the weapon
   silently did nothing for six versions. No crash, no error, no gate.
   Two names for one concept is the cause, so both spellings are checked
   against the path each weapon actually takes. */
Object.keys(W).forEach(k => {
  const w = W[k];
  if (w.bullet) {
    ok(typeof w.bulletSpeed === 'number' && w.bulletSpeed > 0,
      k + ' is a travelling bullet and has bulletSpeed [' + w.bulletSpeed + ']');
    ok(typeof w.bulletDrop === 'number',
      k + ' has bulletDrop [' + w.bulletDrop + ']');
    ok(w.projSpeed === undefined,
      k + ' does NOT use the rocket spelling projSpeed');
  }
  if (w.type === 'rocket') {
    ok(typeof w.projSpeed === 'number' && w.projSpeed > 0,
      k + ' is a rocket and has projSpeed [' + w.projSpeed + ']');
  }
});

console.log('\n--- the bow (v9.3) ---');
const bow = W.bow;
ok(!!bow, 'the bow exists');
ok(bow.mag + bow.reserve === 30, 'a bow carries 30 shots [' +
  bow.mag + ' nocked + ' + bow.reserve + ' in reserve]');
ok(bow.bullet === true, 'arrows travel — the bow is not hitscan');
ok(bow.quiet === 1, 'the bow is silent, so firing does not put the shooter on the radar');
ok(body('bow') < HP, 'a bow hit does NOT one-shot a healthy target [' + body('bow') + ']');
ok(body('bow') * bow.head >= HP, 'a bow headshot does kill [' + (body('bow') * bow.head) + ']');
const quiver = CFG.LOOT_ITEMS.arrows;
ok(quiver && quiver.kind === 'ammo' && quiver.w === 'bow',
  'a Quiver exists and resupplies the bow specifically');
ok(quiver.amount > 0 && quiver.amount <= bow.reserve,
  'a Quiver holds a sane number of arrows [' + quiver.amount + ']');

console.log('\n--- the v9.3 additions are actually in the pool ---');
['aug', 'famas', 'akm', 'k98w', 'garand', 'ump9', 'mp5', 'vector', 'bow'].forEach(k => {
  ok(!!W[k], k + ' is in the weapon table');
  ok(lootW.indexOf(k) >= 0, k + ' can be found in the loot system');
});
/* The airdrop pool must reference real loot ids, or a crate rolls undefined. */
CFG.AIRDROP.weaponPool.forEach(id => {
  ok(!!CFG.LOOT_ITEMS[id], 'airdrop weapon "' + id + '" is a real loot item');
  ok(CFG.LOOT_ITEMS[id].kind === 'weapon', 'airdrop entry "' + id + '" is a weapon');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
