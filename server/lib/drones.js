/* drones.js — the v9.4 Strike Drone, server-authoritative end to end.

   WHY THE SERVER OWNS THIS COMPLETELY

   Mines are server-authoritative and grenades are not: a grenade's damage is
   claimed by the thrower's client because the thrower is watching it and any
   disagreement is invisible. A drone is the opposite. It flies for up to
   twenty seconds, picks its own target, and can be shot down by a THIRD player
   who is not its owner and not its victim. Three clients would each simulate a
   different flight and disagree about who died — so the flight, the targeting,
   the health and the detonation all live here, and clients are told what
   happened rather than asked.

   THE LIFECYCLE, and why each phase exists

     climb   Straight up to cruise altitude. Gives the owner a moment of
             commitment they cannot take back, and gets the drone above the
             rooftops so it is not immediately eaten by a wall.
     hunt    Flies at a randomly chosen enemy. Random is what Rahul asked for
             and it is also what keeps the weapon from being a sniper rifle:
             you cannot aim it, so it is area pressure rather than execution.
     lock    A short hover directly above the victim. This is the ONLY reason
             the weapon is fair — it is when the victim's warning fires, and it
             is the window in which anybody can shoot it down.
     dive    Fast, committed, lethal on arrival.

   It can be destroyed in every phase after `armSec`, and a destroyed drone
   detonates harmlessly in the air. That is the whole counter-play and it is
   why the damage number is allowed to be lethal.
*/

module.exports = function initDroneModule(ctx) {
  const { io, now, applyDamage, modeInfo, CFG } = ctx;

  function spec() { return CFG.GEAR.drone; }

  /* Valid targets: alive, not the owner, and NEVER a team-mate. The side check
     is done here rather than in applyDamage so a drone does not merely fail to
     hurt a friend — it never chooses one in the first place, so it does not
     waste itself flying at somebody it cannot damage. */
  function candidates(room, owner) {
    const teams = modeInfo(room).teams;
    const out = [];
    for (const p of room.players.values()) {
      if (!p.alive || p.id === owner.id) continue;
      if (teams && p.team && owner.team && p.team === owner.team) continue;
      if (p.protUntil && now() < p.protUntil) continue;
      out.push(p);
    }
    return out;
  }

  function launch(room, owner) {
    const S = spec();
    if (!room.drones) room.drones = [];
    if ((owner.drones | 0) <= 0) return { ok: false, err: 'No drones left' };
    if (!owner.alive) return { ok: false, err: 'Cannot launch while down' };
    /* Refuse the launch when there is nobody to hunt, and DO NOT spend the
       drone. A drone that flies out over an empty map and self-destructs looks
       exactly like a bug. */
    if (!candidates(room, owner).length) return { ok: false, err: 'No targets in the air picture' };

    owner.drones--;
    const d = {
      id: room.nextDroneId = (room.nextDroneId || 1) + 1,
      owner: owner.id, team: owner.team || null,
      pos: [owner.pos[0], owner.pos[1] + 1.2, owner.pos[2]],
      hp: S.hp, phase: 'climb', target: null,
      born: now(), lockAt: 0
    };
    room.drones.push(d);
    io.to(room.code).emit('droneLaunch', {
      id: d.id, owner: d.owner, team: d.team, p: d.pos.slice()
    });
    return { ok: true, left: owner.drones };
  }

  function boom(room, d, lethal) {
    const S = spec();
    io.to(room.code).emit('droneBoom', { id: d.id, p: d.pos.slice(), lethal: !!lethal });
    if (lethal) {
      const teams = modeInfo(room).teams;
      for (const q of room.players.values()) {
        if (!q.alive) continue;
        /* No friendly fire, including the owner's own squad — a drone that can
           clip a team-mate is a drone nobody dares launch indoors. The owner
           IS damageable, because standing under your own drive is a mistake
           the game should be allowed to punish. */
        if (teams && q.team && d.team && q.team === d.team && q.id !== d.owner) continue;
        const dx = q.pos[0] - d.pos[0], dy = q.pos[1] - d.pos[1], dz = q.pos[2] - d.pos[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > S.radius) continue;
        applyDamage(room, q, S.dmg, d.owner, 'drone', false, true);
      }
    }
    const i = room.drones.indexOf(d);
    if (i >= 0) room.drones.splice(i, 1);
  }

  /* Anybody may shoot a drone down, including its own team. The client reports
     the hit the same way it reports a hit on a player; the server owns the
     health so two people shooting the same drone cannot both claim the kill. */
  function damage(room, droneId, amount, byId) {
    if (!room.drones) return null;
    const d = room.drones.find(x => x.id === droneId);
    if (!d) return null;
    const S = spec();
    if (now() - d.born < S.armSec * 1000) return null;   // still in the launch tube
    d.hp -= amount;
    io.to(room.code).emit('droneHit', { id: d.id, hp: Math.max(0, d.hp) });
    if (d.hp <= 0) {
      /* Destroyed in the air: it detonates where it is and harms NOBODY. That
         is the reward for noticing it, and it is what lets the payload be
         lethal without the weapon being oppressive. */
      boom(room, d, false);
      const shooter = room.players.get(byId);
      if (shooter) io.to(byId).emit('droneKilled', { id: droneId });
      return { destroyed: true };
    }
    return { destroyed: false, hp: d.hp };
  }

  function tick(room, dt) {
    if (!room.drones || !room.drones.length) return;
    const S = spec();
    const t = now();
    for (let i = room.drones.length - 1; i >= 0; i--) {
      const d = room.drones[i];

      if (t - d.born > S.maxLifeSec * 1000) { boom(room, d, false); continue; }

      /* Re-acquire whenever the target dies or disconnects. Without this a
         drone whose victim is killed by someone else circles forever. */
      let tgt = d.target ? room.players.get(d.target) : null;
      if (!tgt || !tgt.alive) {
        const pool = candidates(room, room.players.get(d.owner) || { id: d.owner, team: d.team });
        if (!pool.length) { boom(room, d, false); continue; }
        tgt = pool[(Math.random() * pool.length) | 0];
        d.target = tgt.id;
        if (d.phase === 'lock') d.phase = 'hunt';
      }

      if (d.phase === 'climb') {
        d.pos[1] += S.climbSpeed * dt;
        if (d.pos[1] >= S.cruiseY) { d.pos[1] = S.cruiseY; d.phase = 'hunt'; }
      } else if (d.phase === 'hunt') {
        const dx = tgt.pos[0] - d.pos[0], dz = tgt.pos[2] - d.pos[2];
        const dist = Math.hypot(dx, dz);
        if (dist < 1.6) { d.phase = 'lock'; d.lockAt = t; }
        else {
          const step = Math.min(dist, S.hunt * dt);
          d.pos[0] += (dx / dist) * step;
          d.pos[2] += (dz / dist) * step;
        }
        /* Warn the victim while it is still crossing, not when it is overhead.
           The whole design rests on the target getting time to react. */
        if (dist < S.warnRadius) io.to(tgt.id).emit('droneWarn', { id: d.id, d: Math.round(dist) });
      } else if (d.phase === 'lock') {
        io.to(tgt.id).emit('droneWarn', { id: d.id, d: 0 });
        if (t - d.lockAt > S.lockSec * 1000) d.phase = 'dive';
      } else if (d.phase === 'dive') {
        const dx = tgt.pos[0] - d.pos[0], dy = tgt.pos[1] - d.pos[1], dz = tgt.pos[2] - d.pos[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        const step = S.dive * dt;
        if (dist <= step + 0.6) { d.pos = [tgt.pos[0], tgt.pos[1], tgt.pos[2]]; boom(room, d, true); continue; }
        d.pos[0] += (dx / dist) * step;
        d.pos[1] += (dy / dist) * step;
        d.pos[2] += (dz / dist) * step;
      }
    }
  }

  /* Serialised into the normal snapshot so clients render and can shoot at
     them without a second channel. Deliberately terse: this runs every tick. */
  function snapshot(room) {
    if (!room.drones || !room.drones.length) return undefined;
    return room.drones.map(d => ({
      i: d.id, o: d.owner, tm: d.team,
      p: [Math.round(d.pos[0] * 100) / 100, Math.round(d.pos[1] * 100) / 100, Math.round(d.pos[2] * 100) / 100],
      h: Math.max(0, Math.round(d.hp)), f: d.phase
    }));
  }

  function reset(room) { room.drones = []; }

  return { launch, damage, tick, snapshot, reset, candidates };
};
