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
  var CELL = 14;          // quantization grid, metres
  var MIN_ERR = 3;        // reported point is never closer than this to truth
  var MAX_ERR = 15;       // ...and never further: honest blur, not misdirection
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
              CELL: CELL, MIN_ERR: MIN_ERR, MAX_ERR: MAX_ERR,
              ROLL_MS: ROLL_MS, INTERVAL_MS: INTERVAL_MS };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.Intel = api;
})();
