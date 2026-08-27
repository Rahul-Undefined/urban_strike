/* ===== v12.0 - THE INTEL BLUR IS A CONTRACT, NOT A VIBE (brief item 10) =====

   The feature's whole promise is "approximate": the map must help you hunt a
   block, never a head. That promise is three numbers and one behaviour, and
   this gate holds all four:

     1. ERROR BAND — every reported point sits 3..15 m from the truth. Below
        3 is a pinpoint wearing a costume; above 15 is misdirection.
     2. COARSENESS — reports from nearby true positions collapse toward cell
        geometry: moving 2 m must not move the blob 2 m in lockstep.
     3. WANDER STABILITY — inside one roll window the offset holds (the blob
        names a place); across windows it changes (the blob cannot be
        triangulated by averaging).
     4. DETERMINISM — same injected rand, same answers. Math.random lives in
        server.js, not here; a gate that flakes teaches nothing.

   Pure module test: node tools/verify-intel.js */
const Intel = require('../server/lib/intel');
let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  PASS  ' + msg); } else { fail++; console.log('  FAIL  ' + msg); } }
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const dist = (ax, az, x, z) => Math.sqrt((ax - x) ** 2 + (az - z) ** 2);

console.log('--- 1. error band, everywhere on the map ---');
{
  const rand = lcg(7), st = {};
  let min = Infinity, max = 0, n = 0;
  for (let x = -95; x <= 95; x += 7.3) for (let z = -95; z <= 95; z += 7.3) {
    const a = Intel.approxOne('p' + (n++), x, z, 1000, st, rand);
    const d = dist(a.x, a.z, x, z);
    if (d < min) min = d; if (d > max) max = d;
  }
  ok(min >= Intel.MIN_ERR - 0.06, 'no report closer than MIN_ERR (worst: ' + min.toFixed(2) + ' m over ' + n + ' points)');
  ok(max <= Intel.MAX_ERR + 0.06, 'no report further than MAX_ERR (worst: ' + max.toFixed(2) + ' m)');
}

console.log('--- 2. coarseness: the blob names a cell, not a heading ---');
{
  /* Walk a player 1 m at a time inside one cell with a FROZEN wander offset:
     the report must stay glued to cell geometry (same offset, same cell =>
     near-identical output) rather than sliding with the player. */
  const rand = lcg(11), st = {};
  const first = Intel.approxOne('w', 1.0, 1.0, 1000, st, rand);
  let moved = 0;
  for (let step = 1; step <= 4; step++) {
    const a = Intel.approxOne('w', 1.0 + step, 1.0, 1000, st, rand);  // same roll window
    moved = Math.max(moved, dist(a.x, a.z, first.x, first.z));
  }
  ok(moved < Intel.CELL * 0.75,
    'four 1 m true-steps moved the blob ' + moved.toFixed(2) + ' m — cell-bound, not tracking (allowing error-clamp drift)');
}

console.log('--- 3. wander: stable within a window, different across windows ---');
{
  const rand = lcg(23), st = {};
  const a1 = Intel.approxOne('s', 40, 40, 0, st, rand);
  const a2 = Intel.approxOne('s', 40, 40, Intel.ROLL_MS - 1, st, rand);
  ok(a1.x === a2.x && a1.z === a2.z, 'same position, same window: identical report (no per-tick shimmer)');
  const a3 = Intel.approxOne('s', 40, 40, Intel.ROLL_MS + 1, st, rand);
  ok(a1.x !== a3.x || a1.z !== a3.z, 'across the roll boundary the offset re-rolls (cannot be averaged out)');
  ok(dist(a3.x, a3.z, 40, 40) >= Intel.MIN_ERR - 0.06 && dist(a3.x, a3.z, 40, 40) <= Intel.MAX_ERR + 0.06,
    'the re-rolled offset still respects the band');
}

console.log('--- 4. the list: living players only, determinism ---');
{
  const players = [
    { id: 'a', team: 'a', dead: false, connected: true, pos: [10, 1, 10] },
    { id: 'b', team: 'b', dead: true,  connected: true, pos: [20, 1, 20] },   // dead: out
    { id: 'c', team: 'b', dead: false, connected: false, pos: [30, 1, 30] },  // gone: out
    { id: 'd', team: null, dead: false, connected: true, pos: [40, 1, 40] }   // ffa shape
  ];
  const l1 = Intel.intelList(players, 500, {}, lcg(5));
  ok(l1.length === 2 && l1[0].i === 'a' && l1[1].i === 'd', 'dead and disconnected players emit no blob');
  ok(l1[1].t === null, 'ffa players carry a null team — the client treats everyone as hostile');
  const l2 = Intel.intelList(players, 500, {}, lcg(5));
  ok(JSON.stringify(l1) === JSON.stringify(l2), 'same seed, same list — deterministic under injected rand');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
