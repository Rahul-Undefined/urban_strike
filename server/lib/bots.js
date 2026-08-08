/* server/lib/bots.js — v8.38 TRAINING BOTS

   WHY BOTS LIVE ON THE SERVER, AS REAL PLAYERS

   The obvious shortcut is to fake bots on the client: cheap, no netcode, and
   completely wrong. This game is server-authoritative — the server owns
   positions, damage, spawns and hit validation. A client-side bot would not
   appear in a snapshot, could not be shot through the normal damage path, would
   not show on the scoreboard, the minimap or the killfeed, and would desync the
   instant a second human joined.

   So a bot is simply a player object with `bot: true` and no socket. It is
   spawned by spawnPlayer, damaged by applyDamage, serialised into snapshots,
   and rendered by the existing avatar code. THE CLIENT NEEDS NO CHANGES AT ALL
   to see and fight them, which is also why they cannot drift out of sync with
   how humans behave — there is only one implementation of "a player".

   THE HARD PART IS LINE OF SIGHT

   The server has no wall geometry. `mapData` carries spawns and loot points;
   every collider is built by the CLIENT's world module. Bots that cannot see
   walls shoot through them, which reads as broken instantly.

   So the colliders are built here, once per map, by running the real world
   builder in a vm exactly the way tools/verify-*.js do, and cached. It costs
   about a second the first time a bot match starts on a given map and nothing
   thereafter. Approximating the geometry was the alternative and it would have
   been a worse game. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CFG = require('../../public/src/config/index.js');

const ROOT = path.join(__dirname, '..', '..');
const colliderCache = Object.create(null);

/* ---------------------------------------------------------------- geometry */

function buildColliders(mapId) {
  if (colliderCache[mapId]) return colliderCache[mapId];
  let cols = [];
  try {
    const THREE = require('three');
    const ctx = {
      console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
      isFinite, isNaN, parseInt, parseFloat, THREE,
      Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray,
      performance: { now: () => Date.now() },
      document: { createElement: () => ({ getContext: () => new Proxy({}, {
        get: () => () => ({ addColorStop() {} }) }), style: {} }),
        getElementById: () => null, addEventListener() {} },
      navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
    };
    ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    [
      'public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
      'public/src/config/loot.config.js', 'public/src/config/world.config.js',
      'public/src/config/maps-rural.config.js', 'public/src/config/maps-metro.config.js',
      'public/src/config/index.js', 'public/src/environment/merge.js',
      'public/src/environment/world.js', 'public/src/environment/districts-south.js',
      'public/src/environment/districts-north.js', 'public/src/environment/districts-outer.js',
      'public/src/environment/deco.js', 'public/src/environment/rural.js',
      'public/src/environment/metro.js', 'public/src/environment/access.js'
    ].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
    cols = vm.runInContext(
      `(function(){ var s = new THREE.Scene(); World.reset(); World.buildMap(s, ${JSON.stringify(mapId)});
         return World.colliders.map(function(c){ return [c[0],c[1],c[2],c[3],c[4],c[5]]; }); })();`,
      ctx, { filename: '<bot-colliders>' });
  } catch (e) {
    /* Geometry is an OPTIMISATION for the bots, not a requirement. If three is
       missing in production the match must still run — bots simply lose wall
       awareness rather than the mode failing to start. Logged loudly because
       silently dumb bots would be blamed on the AI. */
    console.error('[UrbanStrike] bot colliders unavailable, bots will ignore walls:', e.message);
    cols = [];
  }
  colliderCache[mapId] = cols;
  return cols;
}

/* Segment vs axis-aligned box, slab method. Chest height is sampled rather than
   the full capsule: a bot that needs a clear line to your ankles would refuse
   to shoot at anything behind a kerb. */
function segmentBlocked(cols, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    let t0 = 0, t1 = 1, ok = true;
    for (let a = 0; a < 3; a++) {
      const o = a === 0 ? ax : a === 1 ? ay : az;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      const lo = c[a], hi = c[a + 3];
      if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let n = (lo - o) / d, f = (hi - o) / d;
      if (n > f) { const tmp = n; n = f; f = tmp; }
      if (n > t0) t0 = n;
      if (f < t1) t1 = f;
      if (t0 > t1) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/* A step is blocked only by geometry that overlaps the BODY, between
   step-height and head-height.

   The first version tested `y > c[1] - 0.1 && y < c[4] + 1.2`, which matched
   the ground slab — a collider like everything else — from every position on
   the map. Every candidate step came back blocked and the bots stood still
   forever while otherwise behaving perfectly, which is exactly the kind of
   fault that reads as "the AI is broken" when the AI was fine.

   `y` is the capsule CENTRE, so feet sit at y - standH/2. Anything whose top is
   below feet + step height is walked over, not into. */
function insideAny(cols, x, y, z, r) {
  const feet = y - CFG.PLAYER.standH / 2;
  const lo = feet + 0.45;                     // ignore kerbs a player would step up
  const hi = y + CFG.PLAYER.standH / 2;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c[4] <= lo || c[1] >= hi) continue;   // entirely underfoot or overhead
    if (x > c[0] - r && x < c[3] + r && z > c[2] - r && z < c[5] + r) return true;
  }
  return false;
}

/* ---------------------------------------------------------------- skill */

/* Four rungs. The numbers move TOGETHER rather than one master multiplier,
   because difficulty is not one axis: a recruit is slow to notice you and
   sprays; extreme sees further, reacts before you finish peeking, and puts
   rounds where it aims. Extreme is deliberately unfair on reaction time — it is
   meant to be the wall you practise against, not a fair duel. */
const SKILLS = {
  recruit: { label: 'Recruit', react: 950, aimErr: 0.34, fireMs: 700, range: 40, burst: 2, headPct: 0.02, moveMul: 0.72, dmgMul: 0.65 },
  regular: { label: 'Regular', react: 580, aimErr: 0.19, fireMs: 460, range: 60, burst: 3, headPct: 0.06, moveMul: 0.88, dmgMul: 0.85 },
  veteran: { label: 'Veteran', react: 300, aimErr: 0.10, fireMs: 280, range: 85, burst: 4, headPct: 0.14, moveMul: 1.0, dmgMul: 1.0 },
  extreme: { label: 'Extreme', react: 120, aimErr: 0.045, fireMs: 170, range: 130, burst: 6, headPct: 0.28, moveMul: 1.12, dmgMul: 1.0 }
};
const SKILL_IDS = ['recruit', 'regular', 'veteran', 'extreme'];

const CALLSIGNS = ['VIPER', 'ECHO', 'RAVEN', 'HALO', 'NOMAD', 'ONYX', 'FLINT', 'ZULU',
  'KILO', 'ROOK', 'SABLE', 'TALON', 'VECTOR', 'WRAITH', 'CINDER', 'DRIFT',
  'GHOST', 'HAVOC', 'IRON'];

module.exports = function initBotsModule(ctx) {
  const { io, now, mapData, spawnPlayer, pushLobby, endMatch, modeInfo } = ctx;

  function skillOf(room) {
    return SKILLS[(room.settings && room.settings.botSkill)] || SKILLS.regular;
  }

  /* ---- lifecycle ---- */

  function addBots(room) {
    const want = Math.max(0, Math.min(19, (room.settings.botCount | 0)));
    if (!want) return;
    const cols = buildColliders(room.settings.map || 'urban');
    const teams = modeInfo(room).teams;
    const ids = CFG.activeTeams(room.settings.mode);
    const names = CALLSIGNS.slice().sort(() => Math.random() - 0.5);
    /* Bots join the side with fewest members so a human is never alone against
       a stacked team purely by join order. */
    for (let i = 0; i < want; i++) {
      const id = 'bot:' + room.code + ':' + i;
      let team = null;
      if (teams) {
        const count = {};
        ids.forEach(t => { count[t] = 0; });
        for (const q of room.players.values()) if (q.team) count[q.team] = (count[q.team] || 0) + 1;
        team = ids.slice().sort((x, y) => count[x] - count[y])[0];
      }
      const p = {
        id, name: names[i % names.length] + '-' + (i + 1), bot: true, connected: true,
        color: team ? CFG.TEAMS[team].color : CFG.COLORS[(i + 1) % CFG.COLORS.length],
        team, joinOrder: 10000 + i,
        kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, bestStreak: 0, ping: 0, ready: true,
        hp: CFG.PLAYER.hp, armorLvl: 0, armorDur: 0, helmLvl: 0, helmDur: 0, alive: false,
        protUntil: 0, att: { sight: null, muzzle: null, mag: null }, exW: {}, rd: {},
        pos: [0, 0.95, 0], ry: 0, rx: 0, crouch: 0, mv: 0, wp: 0, ln: 0,
        lastShotAt: {}, history: [], respawnAt: 0, out: false,
        ai: { cols, target: null, seenAt: 0, nextFire: 0, wanderTo: null, repath: 0 }
      };
      room.players.set(id, p);
    }
  }

  /* Bots exist only for the duration of a match. Leaving them in the lobby
     would let them count toward the ready gate and the player cap, and a host
     who lowered the bot count would be stuck with the old ones. */
  function removeBots(room) {
    if (!room || !room.players) return;
    for (const [id, p] of [...room.players.entries()]) if (p.bot) room.players.delete(id);
  }

  function anyHumans(room) {
    for (const p of room.players.values()) if (!p.bot && p.connected !== false) return true;
    return false;
  }

  /* ---- per-tick AI ---- */

  function enemiesOf(room, bot) {
    const teams = modeInfo(room).teams;
    const out = [];
    for (const q of room.players.values()) {
      if (q.id === bot.id || !q.alive || q.out) continue;
      if (teams && q.team && bot.team && q.team === bot.team) continue;
      out.push(q);
    }
    return out;
  }

  function tick(room, dt) {
    if (!room || room.state !== 'playing') return;
    const S = skillOf(room);
    const t = now();
    const spawns = (mapData(room).SPAWNS) || [];

    for (const bot of room.players.values()) {
      if (!bot.bot) continue;
      if (!bot.alive) {
        /* Respawn on the same clock a human gets, unless the mode says one life. */
        if (!bot.out && t >= bot.respawnAt) spawnPlayer(room, bot);
        continue;
      }
      const ai = bot.ai;
      const cols = ai.cols;

      // --- acquire ---
      const foes = enemiesOf(room, bot);
      let best = null, bestD = Infinity;
      for (let i = 0; i < foes.length; i++) {
        const q = foes[i];
        const dx = q.pos[0] - bot.pos[0], dz = q.pos[2] - bot.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > S.range || d >= bestD) continue;
        if (cols.length && segmentBlocked(cols, bot.pos[0], bot.pos[1] + 0.45, bot.pos[2],
                                          q.pos[0], q.pos[1] + 0.45, q.pos[2])) continue;
        best = q; bestD = d;
      }
      if (best && ai.target !== best.id) { ai.target = best.id; ai.seenAt = t; }
      if (!best) ai.target = null;

      // --- aim + move ---
      let wantX = 0, wantZ = 0;
      if (best) {
        const dx = best.pos[0] - bot.pos[0], dz = best.pos[2] - bot.pos[2];
        /* Face the target. Yaw here matches what a human client sends, so the
           avatar code turns them the same way it turns anyone else. */
        bot.ry = Math.atan2(-dx, -dz);
        bot.rx = Math.max(-0.5, Math.min(0.5, -(best.pos[1] - bot.pos[1]) / Math.max(1, bestD)));
        bot.mv = 1;
        /* Close to about half their range, then strafe rather than walk into
           point-blank, which is what made early passes feel like bowling pins. */
        const want = S.range * 0.35;
        const sign = bestD > want ? 1 : -0.35;
        wantX = (dx / (bestD || 1)) * sign;
        wantZ = (dz / (bestD || 1)) * sign;
        const px = -wantZ, pz = wantX;                       // strafe component
        const bob = Math.sin(t / 900 + bot.joinOrder) * 0.8;
        wantX += px * bob; wantZ += pz * bob;
      } else {
        // --- wander toward a spawn point, which is the only map graph we have ---
        if (!ai.wanderTo || t > ai.repath) {
          const s = spawns[(Math.random() * spawns.length) | 0];
          if (s) ai.wanderTo = [s[0], s[1]];
          ai.repath = t + 6000 + Math.random() * 4000;
        }
        if (ai.wanderTo) {
          const dx = ai.wanderTo[0] - bot.pos[0], dz = ai.wanderTo[1] - bot.pos[2];
          const d = Math.hypot(dx, dz);
          if (d < 3) { ai.wanderTo = null; }
          else { wantX = dx / d; wantZ = dz / d; bot.ry = Math.atan2(-dx, -dz); bot.mv = 1; }
        }
      }

      const speed = CFG.MOVE.walk * S.moveMul * dt;
      if (wantX || wantZ) {
        const m = Math.hypot(wantX, wantZ) || 1;
        const nx = bot.pos[0] + (wantX / m) * speed;
        const nz = bot.pos[2] + (wantZ / m) * speed;
        /* No pathfinding — a blocked step is simply not taken, and the strafe
           bob shakes them loose. Cheap, and it keeps bots off walls without a
           navmesh this map does not have. */
        if (!insideAny(cols, nx, bot.pos[1], nz, CFG.PLAYER.radius)) {
          bot.pos[0] = nx; bot.pos[2] = nz;
        } else if (!insideAny(cols, nx, bot.pos[1], bot.pos[2], CFG.PLAYER.radius)) {
          bot.pos[0] = nx;
        } else if (!insideAny(cols, bot.pos[0], bot.pos[1], nz, CFG.PLAYER.radius)) {
          bot.pos[2] = nz;
        }
      } else bot.mv = 0;

      // --- fire ---
      if (!best) continue;
      if (t - ai.seenAt < S.react) continue;                 // reaction time
      if (t < ai.nextFire) continue;
      if (best.protUntil && t < best.protUntil) continue;    // respect spawn protection
      ai.nextFire = t + S.fireMs;

      /* Hit resolution is a probability rather than a simulated bullet. A bot
         that raycast every shot would need the full weapon model — spread,
         recoil, drop, penetration — reimplemented server-side and kept in sync
         with the client's forever. This produces the same felt outcome and has
         one number to tune. Falls off with range so extreme is not a laser at
         130 m. */
      const fall = Math.max(0.25, 1 - (bestD / S.range) * 0.75);
      const pHit = Math.max(0.05, Math.min(0.95, (1 - S.aimErr) * fall));
      if (Math.random() > pHit) continue;
      const part = Math.random() < S.headPct ? 'head' : (Math.random() < 0.18 ? 'legs' : 'body');
      ctx.botShoot(room, bot, best, part, S.dmgMul);
    }
  }

  return { addBots, removeBots, tick, anyHumans, SKILLS, SKILL_IDS, buildColliders, segmentBlocked };
};
