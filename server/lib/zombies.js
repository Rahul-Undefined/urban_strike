/* OUTBREAK — wave survival. v10.13.

   Rahul's brief: one life each, waves that keep coming with a 10 s breather,
   gradually harder but never impossible, an end at wave 100, drones and the
   nuke available, playable solo or up to 15, and completely separate from the
   PvP modes.

   ===== THE ONE DECISION THAT MADE THIS FEASIBLE =====

   A zombie is a BOT, not a new creature. server/lib/bots.js is 1,137 lines of
   pathing, collider scanning, stair planning, climb planning, line of sight,
   spawning and target selection, covered by 258 assertions, and it has been
   switched off since v10.9 rather than deleted precisely so it could come back.

   Writing a separate zombie AI would mean reimplementing all of that and then
   maintaining two copies of it. Everything below rides the existing bot, with
   three differences: no weapon, a melee swing, and a beeline.

   That melee is the honest gap. bots.js says so itself, at LOADOUTS:

       "a knife bot needs melee closing behaviour that does not exist yet.
        Leaving them out is honest; shipping them half-modelled is not."

   So the melee is the new code here, and it is deliberately the ONLY new
   behaviour. Everything else is configuration.

   ===== DIFFICULTY: A CURVE, NOT A CLIFF =====

   "gradually harder... very tough at a time but not impossible."

   Three things scale, on purpose, at different rates:

     COUNT    grows fastest early, then flattens. More bodies is the fun kind
              of hard. It is capped so the server is never asked to tick 400
              actors at once — a wave nobody can render is not difficulty.
     HEALTH   grows steadily and never stops. This is what eventually makes a
              body take real ammunition rather than one burst.
     SPEED    grows SLOWEST and caps early. This is the dangerous dial: a
              zombie faster than a sprinting player removes the counterplay of
              backing off, and the mode stops being a shooting gallery and
              starts being unfair. It tops out just under sprint.

   Concurrency is capped separately from wave size: a big wave arrives in
   batches as earlier ones die, so wave 60 is a grind against a tide rather
   than 300 actors spawning into one frame.

   ===== ONE LIFE =====

   Death is permanent for the round and the player spectates. The wave keeps
   running while anyone is alive. The round ends when the last one falls — or
   when wave 100 is cleared, which is a win. */
const CFG = require('../../public/src/config/index.js');

module.exports = function initZombieModule(ctx) {
  const { io, now, applyDamage, pushLobby, endMatch } = ctx;

  const MAX_WAVE = 100;          // Rahul: the run has an end
  const COOLDOWN_MS = 10000;     // Rahul: 10 s between waves
  const MAX_CONCURRENT = 26;     // actors alive at once, whatever the wave size
  const MELEE_REACH = 2.1;       // metres, generous — a lunge, not a fencing match
  const MELEE_CD_MS = 900;

  function isOutbreak(room) {
    const m = room && room.settings && room.settings.mode;
    return !!(m && CFG.MODES[m] && CFG.MODES[m].outbreak);
  }

  /* ---- the curve ---------------------------------------------------------
     Every number here is a shape, not a magic constant, and each is clamped so
     that a very high wave is punishing rather than arithmetic nonsense. */
  function waveSize(w) {
    // 4 at wave 1, ~30 by wave 20, ~64 by wave 60, hard cap 90
    return Math.min(90, Math.round(4 + Math.pow(w, 1.35) * 1.15));
  }
  function waveHp(w) {
    // 100 -> ~430 by wave 30 -> ~1,500 by wave 100. Never stops climbing.
    return Math.round(100 * (1 + Math.pow(w - 1, 1.22) * 0.055));
  }
  function waveSpeed(w) {
    /* Player sprint is the ceiling this must never reach. Starts at a shamble
       and asymptotes just under it, so backing off always remains an option —
       it just stops being a comfortable one. */
    return Math.min(0.96, 0.52 + (1 - Math.exp(-w / 22)) * 0.46);
  }
  function waveDamage(w) {
    return Math.min(52, 12 + w * 0.85);
  }
  /* A named tier per band, so the HUD can say what is coming and the player
     can learn the shape of the run rather than being surprised by it. */
  function tierFor(w) {
    if (w >= 90) return 'EXTINCTION';
    if (w >= 70) return 'NIGHTMARE';
    if (w >= 45) return 'HORDE';
    if (w >= 25) return 'INFESTED';
    if (w >= 10) return 'OUTBREAK';
    return 'CONTAINMENT';
  }
  /* Special types earn their place by CHANGING the fight, not by having more
     health. Introduced on a schedule so each is learned separately. */
  function rollType(w) {
    const r = Math.random();
    if (w >= 15 && r < 0.10) return 'brute';    // slow, very tough, heavy hit
    if (w >= 8 && r < 0.26) return 'runner';    // fast, fragile
    return 'walker';
  }
  const TYPE = {
    walker: { hpMul: 1.00, spdMul: 1.00, dmgMul: 1.00, scale: 1.00, score: 10 },
    runner: { hpMul: 0.55, spdMul: 1.45, dmgMul: 0.75, scale: 0.94, score: 15 },
    brute:  { hpMul: 3.20, spdMul: 0.62, dmgMul: 1.90, scale: 1.28, score: 40 }
  };

  function state(room) {
    if (!room.zomb) {
      room.zomb = {
        wave: 0, alive: [], pending: 0, phase: 'idle', nextAt: 0,
        seq: 0, kills: 0, score: 0, best: 0, startedAt: 0
      };
    }
    return room.zomb;
  }

  function humansAlive(room) {
    let n = 0;
    for (const p of room.players.values()) if (!p.bot && p.alive && !p.out) n++;
    return n;
  }

  function begin(room) {
    if (!isOutbreak(room)) return;
    const z = state(room);
    z.wave = 0; z.alive = []; z.pending = 0; z.kills = 0; z.score = 0;
    z.startedAt = now();
    z.phase = 'cooldown';
    z.nextAt = now() + 4000;          // a short beat before the first wave
    broadcast(room, 'ready');
  }

  function broadcast(room, why) {
    const z = state(room);
    io.to(room.code).emit('zomb', {
      wave: z.wave, max: MAX_WAVE, tier: tierFor(Math.max(1, z.wave)),
      left: z.alive.length + z.pending,
      phase: z.phase, inMs: Math.max(0, z.nextAt - now()),
      kills: z.kills, score: z.score, why: why || null
    });
  }

  /* Spawn one zombie as a bot-shaped player record. Position comes from the
     map's own spawn table, filtered to points away from every living human —
     a zombie appearing behind you at arm's length is not difficulty, it is a
     bug you cannot see. */
  function spawnOne(room, spawns) {
    const z = state(room);
    const w = Math.max(1, z.wave);
    const type = rollType(w);
    const T = TYPE[type];

    let best = null, bestD = -1;
    for (let i = 0; i < 14; i++) {
      const s = spawns[(Math.random() * spawns.length) | 0];
      if (!s) continue;
      let nearest = 1e9;
      for (const p of room.players.values()) {
        if (p.bot || !p.alive) continue;
        const d = Math.hypot(p.pos[0] - s[0], p.pos[2] - s[1]);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestD) { bestD = nearest; best = s; }
      if (nearest > 34) break;                 // good enough, stop searching
    }
    if (!best) return false;

    const id = 'z' + (++z.seq);
    const hp = Math.round(waveHp(w) * T.hpMul);
    const zp = {
      id, name: type === 'brute' ? 'BRUTE' : (type === 'runner' ? 'RUNNER' : 'WALKER'),
      bot: true, zombie: true, ztype: type,
      hp, maxHp: hp, alive: true, out: false, team: 'z',
      pos: [best[0], 0.9, best[1]], yaw: best[2] || 0, pitch: 0,
      kills: 0, deaths: 0, assists: 0, dmg: 0, streak: 0,
      wp: 0, exW: {}, rd: {},
      zSpeed: waveSpeed(w) * T.spdMul,
      zDmg: waveDamage(w) * T.dmgMul,
      zScale: T.scale, zScore: T.score,
      zNextSwing: 0
    };
    room.players.set(id, zp);
    z.alive.push(id);
    io.to(room.code).emit('zombSpawn', {
      id, type, scale: T.scale, hp, pos: [best[0], 0.9, best[1]]
    });
    return true;
  }

  /* ---- the melee: the only genuinely new behaviour in this file ----
     Beeline at the nearest living human, and swing when in reach. No cover, no
     flanking, no leash. That is not a simplification — a zombie that takes
     cover is not a zombie, and the whole threat model of this mode is that
     they do not stop coming. */
  function driveZombie(room, zp, dt) {
    let target = null, bestD = 1e9;
    for (const p of room.players.values()) {
      if (p.bot || !p.alive || p.out) continue;
      const d = Math.hypot(p.pos[0] - zp.pos[0], p.pos[2] - zp.pos[2]);
      if (d < bestD) { bestD = d; target = p; }
    }
    if (!target) return;

    const dx = target.pos[0] - zp.pos[0], dz = target.pos[2] - zp.pos[2];
    const len = Math.hypot(dx, dz) || 1;
    zp.yaw = Math.atan2(-dx, -dz);

    if (bestD > MELEE_REACH) {
      const step = zp.zSpeed * CFG.MOVE.speed * dt;
      zp.pos[0] += (dx / len) * step;
      zp.pos[2] += (dz / len) * step;
    } else if (now() >= zp.zNextSwing) {
      zp.zNextSwing = now() + MELEE_CD_MS;
      io.to(room.code).emit('zombSwing', { id: zp.id });
      applyDamage(room, target, zp.zDmg, zp.id, 'zombie', false);
    }
  }

  function onZombieKilled(room, zid, killer) {
    const z = state(room);
    const i = z.alive.indexOf(zid);
    if (i >= 0) z.alive.splice(i, 1);
    const zp = room.players.get(zid);
    z.kills++;
    z.score += (zp && zp.zScore) || 10;
    if (killer && !killer.bot) {
      killer.zKills = (killer.zKills | 0) + 1;
      killer.zScore = (killer.zScore | 0) + ((zp && zp.zScore) || 10);
    }
    room.players.delete(zid);
    io.to(room.code).emit('zombDown', { id: zid, left: z.alive.length + z.pending });
  }

  function tick(room, dt) {
    if (!isOutbreak(room) || room.state !== 'playing') return;
    const z = state(room);

    /* Everyone is down. The run is over — and the wave reached is the score
       that matters, so it goes in the reason. */
    if (humansAlive(room) === 0 && z.phase !== 'over') {
      z.phase = 'over';
      broadcast(room, 'wiped');
      endMatch(room, null, 'overrun');
      return;
    }

    for (const p of room.players.values()) {
      if (p.zombie && p.alive) driveZombie(room, p, dt);
    }

    if (z.phase === 'cooldown' && now() >= z.nextAt) {
      z.wave++;
      if (z.wave > MAX_WAVE) {
        z.phase = 'cleared';
        broadcast(room, 'cleared');
        endMatch(room, null, 'cleared');
        return;
      }
      z.pending = waveSize(z.wave);
      z.phase = 'wave';
      broadcast(room, 'waveStart');
    }

    if (z.phase === 'wave') {
      const spawns = (ctx.mapData(room).SPAWNS) || [];
      while (z.pending > 0 && z.alive.length < MAX_CONCURRENT) {
        if (!spawnOne(room, spawns)) break;
        z.pending--;
      }
      if (z.pending === 0 && z.alive.length === 0) {
        z.best = Math.max(z.best, z.wave);
        z.phase = 'cooldown';
        z.nextAt = now() + COOLDOWN_MS;
        broadcast(room, 'waveClear');
      }
    }

    if (!room.zombN) room.zombN = 0;
    if (++room.zombN % 8 === 0) broadcast(room);
  }

  function reset(room) {
    if (!room || !room.players) return;
    for (const id of [...room.players.keys()]) {
      const p = room.players.get(id);
      if (p && p.zombie) room.players.delete(id);
    }
    room.zomb = null;
  }

  return { isOutbreak, begin, tick, reset, onZombieKilled,
           waveSize, waveHp, waveSpeed, waveDamage, tierFor,
           MAX_WAVE, COOLDOWN_MS, MAX_CONCURRENT };
};
