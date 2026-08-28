/* ===== v12.0 - APPROXIMATE ENEMY INTEL (brief item 10) =====

   Host toggle `enemyIntel`. When ON, the server broadcasts a coarse position
   blob for every LIVING player every INTERVAL_MS, and the full map (M) draws
   the hostile ones as area circles. The whole point is what it does NOT say:

     - QUANTIZE to a CELL m grid: the blob names a neighbourhood, not a spot.
     - A per-player WANDER offset inside the cell, re-rolled every ROLL_MS,
       so the blob drifts rather than tracking — watching it move tells you
       "that block", never a heading you could pre-fire.
     - The reported point is clamped to lie 3..15 m from the truth (MIN_ERR /
       MAX_ERR). Never closer — a cell-centre coincidence must not become a
       pinpoint — and never further, or the intel is a lie instead of a blur.

   Pure functions over (players, nowMs, state): no sockets, no timers, no
   randomness source of its own (caller injects), so tools/verify-intel.js can
   assert the anti-pinpoint contract deterministically. server.js owns the
   cadence and the setting gate; this file owns the fuzz. */
(function () {
  /* ===== v13.0 - THE BAND IS DERIVED FROM CFG.MATCH.INTEL (brief item 2) =====
     v12 shipped 3-15 m; the v13 brief widens the promise to "somewhere within
     a 50-meter area". radiusM is the PLAYER-FACING circle; the server's
     ceiling is radiusM - 5 so the true position is inside the drawn circle by
     construction, with margin, not on average. The floor rises with the
     promise (10 m) — a 50 m circle centred 3 m off the target is a wallhack
     with a wide hat. Cell scales with the radius (60%) so the quantization
     stays the dominant blur and the wander stays inside the cell's reach.
     Everything below is still pure and injectable; only the numbers moved. */
  var _CFG = null;
  try { _CFG = require('../public/src/config/index.js'); } catch (e) { _CFG = null; }
  var _I = (_CFG && _CFG.MATCH && _CFG.MATCH.INTEL) || { radiusM: 50, minErr: 10 };
  var RADIUS_M = _I.radiusM;              // what the map draws; the promise
  var CELL = Math.round(RADIUS_M * 0.6);  // 30 m at the shipped radius
  var MIN_ERR = _I.minErr;                // never a pinpoint in a costume
  var MAX_ERR = RADIUS_M - 5;             // the promise is true BY CONSTRUCTION
  var ROLL_MS = 5000;     // wander offset lifetime
  var INTERVAL_MS = 2000; // broadcast cadence (server.js reads this)

  /* One player's approximate point. `st` is the per-room wander state:
     { [id]: { ox, oz, until } }. `rand` is injected for determinism in gates. */
  function approxOne(id, x, z, nowMs, st, rand) {
    var w = st[id];
    if (!w || nowMs >= w.until) {
      var ang = rand() * Math.PI * 2;
      var mag = 2 + rand() * (CELL * 0.45 - 2);      // wander stays inside the cell's reach
      w = st[id] = { ox: Math.cos(ang) * mag, oz: Math.sin(ang) * mag, until: nowMs + ROLL_MS };
    }
    // cell centre + wander
    var ax = (Math.floor(x / CELL) + 0.5) * CELL + w.ox;
    var az = (Math.floor(z / CELL) + 0.5) * CELL + w.oz;
    // clamp the ERROR, not the point: honest blur band
    var dx = ax - x, dz = az - z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.001) { dx = MIN_ERR; dz = 0; d = MIN_ERR; }
    if (d < MIN_ERR) { var k1 = MIN_ERR / d; ax = x + dx * k1; az = z + dz * k1; }
    else if (d > MAX_ERR) { var k2 = MAX_ERR / d; ax = x + dx * k2; az = z + dz * k2; }
    return { x: Math.round(ax * 10) / 10, z: Math.round(az * 10) / 10 };
  }

  /* The broadcast list: every living, connected, non-spectating player.
     Team rides along so the client can filter hostiles; the RECIPIENT side
     never needs a per-recipient payload — your own team's blob tells your
     enemies nothing they were not already being told about you, and tells
     you nothing (you can see your squad exactly, minimap, since v9.5). */
  function intelList(players, nowMs, st, rand) {
    var out = [];
    players.forEach(function (p) {
      if (!p || p.dead || p.connected === false || !p.pos) return;
      var a = approxOne(p.id, p.pos[0], p.pos[2], nowMs, st, rand);
      out.push({ i: p.id, t: p.team || null, x: a.x, z: a.z });
    });
    return out;
  }

  var api = { approxOne: approxOne, intelList: intelList,
              CELL: CELL, MIN_ERR: MIN_ERR, MAX_ERR: MAX_ERR, RADIUS_M: RADIUS_M,
              ROLL_MS: ROLL_MS, INTERVAL_MS: INTERVAL_MS };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.Intel = api;
})();
