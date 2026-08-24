/* NUKE KILLSTREAK — small maps only (killhouse, sunsetrow). v10.10, v10.12.

   Rahul: five kills in a row earns a nuke. The player picks an area on the
   map, it falls for ten seconds, anything inside dies, no friendly fire. If he
   is killed WHILE choosing, the nuke is lost.

   ===== WHY EVERY DECISION BELOW IS MADE ON THE SERVER =====

   A killstreak reward is the single most attractive thing on this map to fake.
   The client is told when it has one and is asked where to put it; it is never
   asked WHETHER it has one. `armed` lives here, the strike coordinates are
   re-validated here, and the damage is applied here on a server tick. A client
   that sends nukeStrike without having earned it gets nothing back.

   ===== THE "KILLED WHILE AIMING" RULE IS THE WHOLE DESIGN =====

   The reward is not "you earned a nuke", it is "you earned a nuke AND you have
   to survive long enough to place it". That makes the ten seconds after the
   fifth kill the most dangerous of the match, which is the point.

   Implemented as one rule in one place: clearArmed() on death. There is no
   separate "is he aiming" flag to fall out of sync, because aiming is a client
   overlay with no server state — the server only knows armed / not armed, and
   dying clears it whether he had the map open or not.

   ===== SMALL MAPS ONLY =====

   Guarded on CFG.MAPS[map].smallMap at every entry point, not just at the
   award. A player who earns a nuke and then the room switches to Urban must
   not keep it.

   ===== FRIENDLY FIRE =====

   Refused for teammates AND for the caller. Checked per damage tick rather
   than once at launch, because players move during the ten seconds and a
   teammate who walks in at second seven must be as safe as one standing there
   at second zero. */
const CFG = require('../../public/src/config/index.js');

module.exports = function initNukeModule(ctx) {
  const { io, now, applyDamage } = ctx;

  /* Tuning. Kept together and named so a change is a decision, not a stray
     number edited mid-file. */
  const REQ_STREAK = 5;      // consecutive kills, no deaths between
  /* v10.15: 11 -> 17 m. Rahul: "range should be a good amount that opponent
     gets trapped on those area". At 11 m on a 58 x 34 m map a strike covered
     about one lane and a walk sideways left it; 17 m covers a lane and both
     its approaches, so getting clear means committing to a direction and
     running, which is the decision the strike is supposed to force. It is
     still well under half the map — Freightyard, the smallest at 38 m across,
     keeps two clear corners. */
  const RADIUS = 17.0;
  const DURATION = 10.0;     // seconds, per Rahul
  const TICK_MS = 500;       // damage evaluations per strike: 20
  const TICK_DMG = 55;       // two ticks kills a full-health player, so a
                             // sprint out of the edge in the first half-second
                             // survives and standing in it does not
  /* v10.12: keyed on the `smallMap` FLAG, not on a map name. Sunset Row landed
     with the same rule set as killhouse, and a name check would have given it
     no killstreak while every other small-map rule applied — the silent kind of
     inconsistency nobody reports because nothing looks broken, it just never
     happens. A third small map now inherits this by setting one flag. */
  function isSmallMap(room) {
    const m = room && room.settings && room.settings.map;
    return !!(m && CFG.MAPS[m] && CFG.MAPS[m].smallMap);
  }

  /* Called from combat.js after a kill is credited. `attacker.streak` already
     exists and is already reset on death by combat.js — this rides that
     counter rather than adding a second one that could disagree with it. */
  function onKill(room, attacker) {
    if (!isSmallMap(room) || !attacker || attacker.bot) return;
    if (attacker.nukeArmed) return;                    // one at a time
    if ((attacker.streak | 0) < REQ_STREAK) return;
    attacker.nukeArmed = true;
    io.to(attacker.id).emit('nukeReady', {
      radius: RADIUS, duration: DURATION, streak: attacker.streak
    });
  }

  /* Called from combat.js when a player dies, and from the disconnect path.
     Silent when nothing was armed so it is safe to call unconditionally. */
  function clearArmed(room, p, reason) {
    if (!p || !p.nukeArmed) return;
    p.nukeArmed = false;
    io.to(p.id).emit('nukeLost', { reason: reason || 'died' });
  }

  /* ===== v10.15 - THE STRIKE PICKS ITS OWN GROUND =====

     Rahul: "there is no option to select the area... when user press N, it
     starts to rain nuke on an area automatically for 10 seconds."

     The v10.10 design opened the full map and asked for a click. That was
     wrong twice over. It never worked — the targeting mode was reachable only
     through a map overlay that a player in a firefight has no reason to open,
     and pressing N appeared to do nothing. And even working, it asks somebody
     to stop playing, read a top-down map and aim on it, which is the opposite
     of what a killstreak reward should feel like.

     So the server aims it. It scans candidate centres and picks the one
     covering the MOST living enemies — which is what a player would have tried
     to do with the map anyway, done instantly and without leaving the fight.

     Candidates are every enemy's position plus the midpoint of every enemy
     pair. A cluster of two or three produces a midpoint that covers all of
     them and no single position does; scanning pairs is what finds it. With
     one enemy the answer is simply where he is. */
  function bestTarget(room, p) {
    const foes = [];
    for (const q of room.players.values()) {
      if (!q.alive || q.out || q.id === p.id) continue;
      if (q.team && p.team && q.team === p.team) continue;
      foes.push(q);
    }
    if (!foes.length) return null;

    const cands = [];
    for (const f of foes) cands.push([f.pos[0], f.pos[2]]);
    for (let i = 0; i < foes.length; i++) {
      for (let j = i + 1; j < foes.length; j++) {
        cands.push([(foes[i].pos[0] + foes[j].pos[0]) / 2,
                    (foes[i].pos[2] + foes[j].pos[2]) / 2]);
      }
    }
    const r2 = RADIUS * RADIUS;
    let best = cands[0], bestN = -1;
    for (const c of cands) {
      let n = 0;
      for (const f of foes) {
        const dx = f.pos[0] - c[0], dz = f.pos[2] - c[1];
        if (dx * dx + dz * dz <= r2) n++;
      }
      /* Ties break toward the centre of the map rather than toward whichever
         enemy happened to be first in the player list — a strike on the middle
         cuts more rotations than one on the edge. */
      if (n > bestN || (n === bestN && (c[0] * c[0] + c[1] * c[1]) <
                                       (best[0] * best[0] + best[1] * best[1]))) {
        bestN = n; best = c;
      }
    }
    return { x: best[0], z: best[1], covered: bestN };
  }

  /* A strike request. The client sends NOTHING but the request; where it lands
     is decided here. */
  function requestStrike(room, p, x, z) {
    if (!isSmallMap(room)) return;
    if (!p || !p.nukeArmed || !p.alive || p.out) return;
    if (room.state !== 'playing') return;
    /* v10.15: coordinates from the client are ignored entirely. The server
       aims. If nobody is alive to aim at, the strike lands on the caller's
       forward arc rather than being refused — a spent killstreak that produces
       nothing would read as the button being broken again. */
    const aim = bestTarget(room, p);
    if (aim) { x = aim.x; z = aim.z; }
    else {
      const yaw = +p.yaw || 0;
      x = p.pos[0] - Math.sin(yaw) * (RADIUS * 0.9);
      z = p.pos[2] - Math.cos(yaw) * (RADIUS * 0.9);
    }

    /* Clamp into the building rather than rejecting. A click one metre outside
       the wall is a near-miss on a small map, not an exploit, and refusing it
       silently would read as the button being broken. */
    const B = (CFG.MAPS[room.settings.map] && CFG.MAPS[room.settings.map].bound) || 32;
    x = Math.max(-B, Math.min(B, x));
    z = Math.max(-B, Math.min(B, z));

    p.nukeArmed = false;                    // spent before anything can throw
    const endsAt = now() + DURATION * 1000;
    room.nukes = room.nukes || [];
    room.nukes.push({
      x, z, r: RADIUS, by: p.id, team: p.team || null,
      endsAt, nextTick: now(), byName: p.name
    });
    io.to(room.code).emit('nukeIncoming', {
      x, z, r: RADIUS, duration: DURATION, by: p.id, byName: p.name,
      team: p.team || null, covered: aim ? aim.covered : 0
    });
  }

  /* Driven from the match loop. Damage is applied through applyDamage() rather
     than by writing hp directly, so a nuke kill goes through the same armour,
     kill-feed, assist and win-condition path as a bullet. A second damage
     route is a second set of rules to keep in sync, and this project has been
     bitten by that before. */
  function tick(room) {
    if (!room || !room.nukes || !room.nukes.length) return;
    const t = now();
    for (let i = room.nukes.length - 1; i >= 0; i--) {
      const n = room.nukes[i];
      if (t >= n.endsAt) {
        room.nukes.splice(i, 1);
        io.to(room.code).emit('nukeEnd', { by: n.by });
        continue;
      }
      if (t < n.nextTick) continue;
      n.nextTick = t + TICK_MS;
      const r2 = n.r * n.r;
      for (const q of room.players.values()) {
        if (!q.alive || q.out) continue;
        if (q.id === n.by) continue;                        // never the caller
        if (n.team && q.team && q.team === n.team) continue; // never a teammate
        const dx = q.pos[0] - n.x, dz = q.pos[2] - n.z;
        if (dx * dx + dz * dz > r2) continue;
        applyDamage(room, q, TICK_DMG, n.by, 'nuke', false);
      }
    }
  }

  /* Match end and map change must not leave a strike running into the next
     round, and must not leave anyone holding an award they cannot spend. */
  function reset(room) {
    if (!room) return;
    if (room.nukes && room.nukes.length) io.to(room.code).emit('nukeEnd', { by: null });
    room.nukes = [];
    if (room.players) for (const q of room.players.values()) q.nukeArmed = false;
  }

  return { onKill, clearArmed, requestStrike, tick, reset,
           REQ_STREAK, RADIUS, DURATION };
};
