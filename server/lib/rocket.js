/* ===== v1.0b - THE ROCKET LADDER (big maps) =====

   Rahul: "In the big map add a rocket option: when a player kills 5 without
   dying it shows ROCKET LAUNCH ACTIVATED, press N and the rocket is launched
   and falls on an opponent randomly, just like the drone but instant, not
   delayed. Take reference from the small-map nuke. First after 5 kills, then
   7, then 10 kills without dying — otherwise it is easy and not challenging."

   Same architecture as server/lib/nuke.js, for the same reasons (a killstreak
   reward is the most attractive thing in the game to fake): `armed` lives
   here, the target is picked here, the damage is applied here. The client is
   told WHEN it has one and asked WHETHER to fire it; never whether it has one.

   THE LADDER. `p.rocketIdx` counts rockets earned THIS LIFE. The streak needed
   for rocket k is GEAR.rocket.ladder[k] (5, 7, 10), then `step` more for every
   rocket past the ladder (15, 20, ...). Death resets the index with the streak
   combat.js already zeroes, so the first rocket of every life costs five.

   INSTANT, RANDOM. The target is a uniformly random hostile who is alive; the
   strike lands on their position NOW — pointBlank through vest, helmet and
   shield — and anyone else hostile within `splash` takes `splashDmg`. No
   target alive: refused and KEPT, same courtesy the drone shows.

   BIG MAPS ONLY, mirror-image of nuke.js's arena guard: keyed on !isArena so
   the two rewards can never both be live on one map, and so N means exactly
   one thing wherever a player stands. */
const CFG = require('../../public/src/config/index.js');

module.exports = function initRocketModule(ctx) {
  const { io, now, applyDamage, modeInfo } = ctx;

  function spec() { return CFG.GEAR.rocket || { ladder: [5, 7, 10], step: 5, splash: 6, splashDmg: 60 }; }
  function isBigMap(room) {
    const m = room && room.settings && room.settings.map;
    return !!(m && !(CFG.isArena && CFG.isArena(m)));
  }
  function needFor(idx) {
    const S = spec(), L = S.ladder || [5, 7, 10];
    if (idx < L.length) return L[idx];
    return L[L.length - 1] + (idx - L.length + 1) * (S.step || 5);
  }

  /* Called from combat.js on every kill credited to `attacker` (through
     server.js's onKillStreak seam, beside the nuke). */
  function onKill(room, attacker) {
    if (!isBigMap(room) || !attacker || attacker.bot) return;
    if (attacker.rocketArmed) return;                      // one at a time
    const idx = attacker.rocketIdx | 0;
    if ((attacker.streak | 0) < needFor(idx)) return;
    attacker.rocketArmed = true;
    attacker.rocketIdx = idx + 1;
    io.to(attacker.id).emit('rocketReady', { streak: attacker.streak, next: needFor(idx + 1), n: idx + 1 });
  }

  /* On death and on match end. Silent when nothing was armed. */
  function clearArmed(room, p, reason) {
    if (!p) return;
    p.rocketIdx = 0;
    if (!p.rocketArmed) return;
    p.rocketArmed = false;
    io.to(p.id).emit('rocketLost', { reason: reason || 'died' });
  }

  function candidates(room, p) {
    const teams = modeInfo(room).teams;
    const out = [];
    for (const q of room.players.values()) {
      if (!q.alive || q.out || q.id === p.id) continue;
      if (teams && q.team && p.team && q.team === p.team) continue;
      out.push(q);
    }
    return out;
  }

  function launch(room, p) {
    if (!p || !p.alive) return { ok: false, err: 'Not alive' };
    if (!isBigMap(room)) return { ok: false, err: 'No rocket support over this map' };
    if (!p.rocketArmed) return { ok: false, err: 'No rocket armed' };
    const list = candidates(room, p);
    if (!list.length) return { ok: false, err: 'No targets on the ground' };
    const S = spec();
    const target = list[Math.floor(Math.random() * list.length)];
    const at = target.pos.slice();
    p.rocketArmed = false;
    /* Tell the room where it lands BEFORE the damage, so the explosion and the
       kill feed arrive in the order a witness would see them. */
    io.to(room.code).emit('rocketStrike', { by: p.id, byName: p.name, x: at[0], y: at[1], z: at[2], r: S.splash });
    applyDamage(room, target, 999, p.id, 'rocketstrike', false, true);
    for (const q of list) {
      if (q === target || !q.alive) continue;
      const dx = q.pos[0] - at[0], dy = q.pos[1] - at[1], dz = q.pos[2] - at[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > S.splash) continue;
      applyDamage(room, q, S.splashDmg, p.id, 'rocketstrike', false, false);
    }
    return { ok: true, at: at, next: needFor(p.rocketIdx | 0) };
  }

  function reset(room) {
    for (const q of room.players.values()) { q.rocketArmed = false; q.rocketIdx = 0; }
  }

  return { onKill, clearArmed, launch, reset, needFor, isBigMap };
};
