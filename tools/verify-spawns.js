/* verify-spawns.js — v10.15

   WHY THIS GATE EXISTS

   Rahul, after playing: "in teams match, spawn location should be team
   specific, everyone from the team should spawn in the same location or side
   rather than anywhere in the map."

   The mechanism was already there. spawnFor() filters candidates on `s[3]`
   against the player's team. None of the five small maps carried the tag, so
   the filter matched zero candidates — and the v8.27 guard, which exists so an
   empty candidate list can never crash the match, correctly fell back to the
   FULL spawn set.

   That is the dangerous shape: a safety net doing its job perfectly while
   quietly turning team spawns off. No error, no warning, no crash. The only
   symptom is a player noticing they keep appearing behind the enemy.

   So this asserts the tags exist and separate, on every map. */
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

const path = require('path');
const CFG = require(path.join(__dirname, '..', 'public/src/config/index.js'));

function spawnsFor(map) {
  if (map === 'urban') return CFG.SPAWNS;
  const key = 'MAPS_' + map.toUpperCase();
  return (CFG[key] && CFG[key].SPAWNS) || null;
}

const MAPS = Object.keys(CFG.MAPS);
console.log('--- every map tags its spawns by side ---');
MAPS.forEach(map => {
  const sp = spawnsFor(map);
  if (!sp) { fail++; console.log('  FAIL  ' + map + ': no spawn table found'); return; }
  const counts = {};
  sp.forEach(s => { const t = s[3] || '(untagged)'; counts[t] = (counts[t] || 0) + 1; });

  ok(!counts['(untagged)'],
    map + ': every spawn carries a side tag' +
    (counts['(untagged)'] ? ' — ' + counts['(untagged)'] + ' untagged' : ' [' +
      Object.keys(counts).map(k => k + ':' + counts[k]).join(' ') + ']'));

  /* Both sides must have enough tiles that a full team is not stacked on one.
     The cap is 8 on a small map, so 3 is the floor at which the crowding
     score in spawnFor() has anywhere to move a player to. */
  const floor = CFG.isArena(map) ? 3 : 4;
  ok((counts.a || 0) >= floor && (counts.b || 0) >= floor,
    map + ': both sides have at least ' + floor + ' tiles [a:' +
    (counts.a || 0) + ' b:' + (counts.b || 0) + ']');
});

console.log('\n--- the two sides are actually apart ---');
/* A tag that does not separate is decoration. The nearest 'a' tile to the
   nearest 'b' tile must be further apart than a player can cross in the spawn
   protection window, or team spawns achieve nothing. */
MAPS.forEach(map => {
  const sp = spawnsFor(map);
  if (!sp) return;
  const A = sp.filter(s => s[3] === 'a'), B = sp.filter(s => s[3] === 'b');
  if (!A.length || !B.length) return;
  let nearest = 1e9;
  A.forEach(a => B.forEach(b => {
    nearest = Math.min(nearest, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }));
  const prot = CFG.spawnProtectFor(map);
  /* CFG.MOVE has `walk` and `sprint` in m/s. The first draft of this line read
     `CFG.MOVE.speed * CFG.MOVE.sprintMul`, neither of which exists — it
     produced NaN, and `nearest > NaN` is false, so every map "failed" on a
     threshold that was not a number. Section 6: check the field you are
     reading actually exists AND what type it is. Seventh instance, this time
     in a gate rather than in the game. */
  const reach = CFG.MOVE.sprint * prot;
  ok(nearest > reach,
    map + ': the sides are ' + nearest.toFixed(0) + ' m apart, further than a ' +
    prot + 's sprint (' + reach.toFixed(0) + ' m)');
});

console.log('\n--- spawn protection is short on the small maps ---');
/* 2.5 s of untouchable operator is most of the time it takes to cross a 58 m
   map, which is why Rahul read a spawning player as a frozen body. */
/* v10.21: keyed on isArena, not smallMap. The two were the same flag until the
   medium tier arrived and needed the arena RULES without the arena SIZE. A gate
   still testing `smallMap` here would have demanded 2.5 s protection on a map
   deliberately given 1 s, and reported the intended behaviour as a defect. */
MAPS.forEach(map => {
  const p = CFG.spawnProtectFor(map);
  if (CFG.isArena(map)) {
    ok(p <= 1.0, map + ': arena rules, protection is ' + p + 's');
  } else {
    ok(p >= 2.0, map + ': full-size theatre, protection stays ' + p + 's');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
