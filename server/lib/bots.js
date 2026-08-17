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
const stairCache = Object.create(null);

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
    const built = vm.runInContext(
      `(function(){ var s = new THREE.Scene(); World.reset(); World.buildMap(s, ${JSON.stringify(mapId)});
         return { c: World.colliders.map(function(c){ return [c[0],c[1],c[2],c[3],c[4],c[5]]; }),
                  s: World._stairs().map(function(f){ return {
                    sx: f.sx, sy: f.sy, sz: f.sz, dirX: f.dirX, dirZ: f.dirZ,
                    topY: f.topY, endX: f.endX, endZ: f.endZ }; }) }; })();`,
      ctx, { filename: '<bot-colliders>' });
    cols = built.c;
    /* v9.2: the STAIR REGISTRY comes out with the colliders. World already
       records every flight it builds — base, top, direction, end point — and
       verify-climb walks that same list with a real capsule. Bots reuse it
       rather than trying to discover stairs by bumping into geometry, which is
       what the first cut did and why only one bot in twelve ever got off the
       street. See planClimb() for what it is used for. */
    stairCache[mapId] = built.s || [];
  } catch (e) {
    /* Geometry is an OPTIMISATION for the bots, not a requirement. If three is
       missing in production the match must still run — bots simply lose wall
       awareness rather than the mode failing to start. Logged loudly because
       silently dumb bots would be blamed on the AI. */
    console.error('[UrbanStrike] bot colliders unavailable, bots will ignore walls:', e.message);
    cols = [];
    stairCache[mapId] = [];
  }
  colliderCache[mapId] = cols;
  if (!stairCache[mapId]) stairCache[mapId] = [];
  return cols;
}

function stairsFor(mapId) {
  if (!stairCache[mapId]) buildColliders(mapId);
  return stairCache[mapId] || [];
}

/* ---- CLIMB PLANNING ------------------------------------------------------

   The first cut of v9.2 gave bots a body and then sent them at an elevated
   waypoint in a straight line. They walked into the wall under it, wedged,
   repathed, and did it again: one bot in twelve gained more than a metre of
   height in a full minute. Vertical movement worked perfectly and was almost
   never used, which is the worst kind of half-feature — it looks like the
   physics is broken when the physics is fine.

   The missing piece is not pathfinding, it is knowing WHERE THE STAIRS ARE.
   World records every flight it builds and verify-climb already walks that
   list with a real capsule, so the data is present and independently proven.
   A climb is a chain over that list: from the height I am at, find a flight
   whose base I can stand at, take it, and repeat from its top until I am near
   the height I want.

   This is a breadth-first search over at most 68 flights (urban), so it is
   cheap enough to run on a repath and needs no navmesh, no caching and no
   precomputation. It returns WAYPOINTS, not a route: the bot still walks to
   each one with the ordinary movement code, which means a flight blocked by a
   crate or a closed-off landing simply fails the way any other walk fails, and
   the stuck detector picks a different plan. */
/* A chain is only valid if each link is WALKABLE, not merely reachable in
   height. The first cut checked only that the next flight's base was within
   2.2 m vertically and 45 m horizontally, and cheerfully produced routes like
   "climb the tower at (-48,-52) to 7 m, then walk to the garage stair at
   (-59,-18)" — 40 m apart, at altitude, through open air. The bot walked to
   the first staircase, climbed nothing, and wandered off.

   FIRST_HOP is generous because walking to the foot of the first staircase
   happens on the ground where there is a floor everywhere. HOP is tight because
   every later hop happens at height, where "walk from the top of that flight to
   the bottom of this one" is only true if they belong to the same structure.
   Nine metres is about a landing plus a corridor; the switchback fire escapes
   this was built for stack their flights within three. */
const CLIMB_REACH = 2.2;        // vertical slack between a flight top and the next base
const FIRST_HOP = 50;           // ground-level walk to the first staircase
const HOP = 14;                 // at-altitude walk between flights of one structure
const ARRIVE = 34;              // the last flight must actually land near the target

function planClimb(mapId, fromX, fromY, fromZ, toX, toY, toZ) {
  const flights = stairsFor(mapId);
  if (!flights.length) return null;
  if (toY - fromY < 1.2) return null;                 // no climb needed

  const start = { x: fromX, y: fromY, z: fromZ, via: null, prev: null, depth: 0 };
  const seen = new Array(flights.length).fill(false);
  const queue = [start];
  let bestNode = null, bestScore = Infinity;

  /* Score, not "first match". A chain that ends at the right height but on the
     far side of the map is worse than one that ends slightly low but at the
     target — so height error and arrival distance are weighed together. */
  function score(n) {
    return Math.abs(n.y - toY) * 3 + Math.hypot(n.x - toX, n.z - toZ);
  }

  for (let head = 0; head < queue.length && head < 300; head++) {
    const node = queue[head];
    if (node.via) {
      const sc = score(node);
      if (sc < bestScore) { bestScore = sc; bestNode = node; }
    }
    if (node.depth >= 6) continue;                    // a stair chain, not an odyssey
    const maxHop = node.via ? HOP : FIRST_HOP;
    for (let i = 0; i < flights.length; i++) {
      if (seen[i]) continue;
      const f = flights[i];
      if (Math.abs(f.sy - node.y) > CLIMB_REACH) continue;      // cannot stand at this base
      if (f.topY <= node.y + 0.4) continue;                     // not a way up
      if (Math.hypot(f.sx - node.x, f.sz - node.z) > maxHop) continue;
      seen[i] = true;
      queue.push({ x: f.endX, y: f.topY, z: f.endZ, via: f, prev: node, depth: node.depth + 1 });
    }
  }
  /* Refuse to return a plan that does not actually help. Sending a bot up a
     staircase on the wrong side of the map is worse than leaving it on the
     street, because it looks purposeful and achieves nothing. */
  if (!bestNode || !bestNode.via) return null;
  if (Math.hypot(bestNode.x - toX, bestNode.z - toZ) > ARRIVE) return null;
  if (bestNode.y < fromY + 1.0) return null;

  const out = [];
  for (let n = bestNode; n && n.via; n = n.prev) {
    /* Two waypoints per flight: stand at the foot, then walk to the head. One
       waypoint at the top would let the bot cut the corner and walk into the
       side of the staircase. */
    out.unshift([n.via.endX, n.via.endZ, n.via.topY]);
    out.unshift([n.via.sx, n.via.sz, n.via.sy]);
  }
  out.push([toX, toZ, toY]);
  return out;
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

/* v9.2 — BOTS GET A BODY.

   Everything below this comment was rewritten because of one missing line: in
   v8.38 `bot.pos[1]` was never assigned ANYWHERE. Bots slid around in x/z at
   whatever height they spawned at, forever. They could not take a stair, a
   ramp, a lift or a roof, could not fall off a ledge, and on Metro City — a map
   whose whole identity is three vertical layers — they stood in the street
   while humans shot down at them from the fire escapes.

   A bot now runs the same shape of physics a human client does: find the
   surface under the feet, step up anything within MOVE.step, fall under gravity
   when there is nothing there, and refuse a move only when the BODY would
   intersect geometry. That single change is what makes stairs work; there is no
   stair-specific code anywhere in this file, and there should not be. A stair
   is just a series of 0.32 m rises, which is under the 0.42 m step limit, so a
   bot walks up it for the same reason a player does.

   THE HEIGHTS ARE THE PLAYER'S, NOT A BOT'S. standH/crouchH/proneH and
   MOVE.step/walk/sprint all come from CFG. A bot that used its own numbers
   would drift from the human collision model the first time either changed,
   and then bots would clip through things players cannot. */

/* pos[1] IS THE CAPSULE CENTRE, NOT THE FEET.

   This cost the first cut of v9.2 an entire pass. spawnPlayer writes
   `[x, 0.95, z]` and the human controller keeps `pos.y = surfaceTop + halfY`
   (player/controller.js) — 0.95 is half of standH plus float, not a height
   above the floor. Bot physics written against feet therefore had every bot
   sitting 0.9 m into the ground, `groundAt` looked for surfaces below its own
   knees, and NO bot could climb anything: the probe went from one climber in
   twelve to zero, which is how the mistake surfaced.

   Everything below converts once, at the edge: helpers take explicit feet
   because that is the honest input for a ground query, and the tick converts
   centre to feet and back. Mixing the two conventions inside one function is
   what produced the bug in the first place. */
function bodyH(bot) {
  return bot.crouch === 2 ? CFG.PLAYER.proneH
       : bot.crouch === 1 ? CFG.PLAYER.crouchH
       : CFG.PLAYER.standH;
}
function halfH(bot) { return bodyH(bot) / 2; }
function feetOf(bot) { return bot.pos[1] - halfH(bot); }

/* The highest surface a bot standing at (x, z) with its feet at `feetY` could
   be supported by. `feetY + step` is the ceiling on what counts: a surface
   higher than that is a wall to walk into, not a step to walk up, and that one
   comparison is the whole of the stair-climbing logic. */
function groundAt(cols, x, z, feetY, r) {
  let best = null;
  const reach = feetY + CFG.MOVE.step + 0.02;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (x <= c[0] - r || x >= c[3] + r || z <= c[2] - r || z >= c[5] + r) continue;
    const top = c[4];
    if (top > reach) continue;
    if (best === null || top > best) best = top;
  }
  return best;
}

/* Would the BODY intersect anything standing here? Feet are given explicitly
   rather than derived from a capsule centre, because the caller already knows
   where the feet are going and deriving it twice is how the two drift apart.

   The 0.05 lift off the floor is deliberate: a surface the bot is standing ON
   has its top exactly at feet level, and without the margin every bot would
   report itself stuck inside the ground. */
function bodyBlocked(cols, x, feetY, z, r, h, ignoreUpTo) {
  /* `ignoreUpTo` is what makes a STAIRCASE walkable rather than a wall, and
     leaving it out cost a full debugging pass. A flight is a run of 0.32 m
     treads about 0.40 m apart, so the tread AHEAD of the bot always overlaps
     the body volume — top above the feet, bottom below the head. A body test
     that counts it reports every staircase in the game as solid, which is
     precisely what happened: plans were built, bots walked to the foot of the
     stairs, and then stood there. Twenty-two climb plans produced zero metres
     of height.

     Anything within one auto-step above where the feet will land is something
     the bot steps ONTO next frame, not into. v8.38's flat-plane check had the
     same idea as a bare `feet + 0.45`; this restores it against the resolved
     landing height instead of the old height. */
  const lo = feetY + (ignoreUpTo === undefined ? 0.05 : ignoreUpTo), hi = feetY + h;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c[4] <= lo || c[1] >= hi) continue;
    if (x > c[0] - r && x < c[3] + r && z > c[2] - r && z < c[5] + r) return true;
  }
  return false;
}

/* Kept for the older call shape used by verify-bots: capsule centre in, body
   test out. Delegates so there is still only one implementation. */
function insideAny(cols, x, y, z, r) {
  return bodyBlocked(cols, x, y - CFG.PLAYER.standH / 2, z, r, CFG.PLAYER.standH);
}

/* ---------------------------------------------------------------- skill */

/* Four rungs. The numbers move TOGETHER rather than one master multiplier,
   because difficulty is not one axis: a recruit is slow to notice you and
   sprays; extreme sees further, reacts before you finish peeking, and puts
   rounds where it aims. Extreme is deliberately unfair on reaction time — it is
   meant to be the wall you practise against, not a fair duel.

   ===== v9.4 — THE LADDER NOW SPANS TWO GENERATIONS OF AI =====

   Rahul: "when choosed lower difficulty the bot should be functioning like
   v9.0 where they will not get to the roof, just fight when person are near
   ... but higher difficulty should have the ability to get in the roof, fight
   like a human, spawn anywhere, kill anywhere, use any guns, crawl or crouch."

   So difficulty is no longer only a set of numbers — it selects a BEHAVIOUR
   GENERATION. Three new dials do that, and they only appear on the rungs that
   need them:

     groundOnly  Recruit only. Refuses climb plans outright, so a recruit lives
                 on the street exactly as every bot did before v9.2. Not a low
                 `verticality` roll — a hard switch, because "occasionally
                 climbs" is not what v9.0 felt like.
     oneWeapon   Recruit only. Pins the loadout to the AK-47, which is the
                 single rifle v8.38 hardcoded. A recruit lobby should look like
                 the old game.
     leash       How far a bot will travel from where it stands to go looking
                 for trouble. Recruit 34 m is "fights when someone comes near";
                 Regular 70 m is a district; Veteran and Extreme have no leash
                 at all and hunt the whole map.

   Everything else — posture, sprint, grenades, mines, stairs, the full weapon
   table — stays on the probability dials, so the ladder is a smooth ramp from
   "the bots you already knew" to "plays like a person".

   v9.2 added the dials for the new abilities, on the same principle. A recruit
   almost never crouches to shoot, rarely sprints, and will not use a grenade;
   an extreme takes cover posture constantly, sprints between fights and cooks
   frags at your position. `verticality` is how willing a bot is to leave the
   street for a stair — recruits fight where they spawn, veterans take the high
   ground. */
const SKILLS = {
  recruit: { label: 'Recruit', react: 950, aimErr: 0.34, fireMs: 700, range: 40, burst: 2, headPct: 0.02, moveMul: 0.72, dmgMul: 0.65,
             crouchPct: 0.00, pronePct: 0.00, sprintPct: 0.00, nadePct: 0.00, minePct: 0.00, verticality: 0.00, nadeCdMs: 99000,
             groundOnly: true, oneWeapon: 'ak47', leash: 34 },
  regular: { label: 'Regular', react: 580, aimErr: 0.19, fireMs: 460, range: 60, burst: 3, headPct: 0.06, moveMul: 0.88, dmgMul: 0.85,
             crouchPct: 0.18, pronePct: 0.00, sprintPct: 0.25, nadePct: 0.10, minePct: 0.05, verticality: 0.12, nadeCdMs: 18000,
             leash: 70 },
  /* v9.7: VETERAN AND EXTREME SHARPENED.
     Reported as "very easy in the veteran mode as well", and the arithmetic
     agreed. Measured time-to-kill on the old numbers, AK-class weapon:
         veteran   22 m 0.7 s | 40 m 1.6 s | 60 m 4.1 s
     Inside knife range it was fine; past 30 m it stopped being a fight because
     TWO penalties multiplied — the range falloff AND the loadout-fit penalty
     (see the note at the hit roll). A bot that cannot threaten you at 40 m is a
     bot you simply walk away from.
     Reaction and rate come down, aim error comes down, and the falloff itself
     is gentler below. Recruit and regular are UNCHANGED: the bottom of the
     ladder is meant to be the pre-v9.2 experience. */
  veteran: { label: 'Veteran', react: 240, aimErr: 0.075, fireMs: 235, range: 95, burst: 5, headPct: 0.17, moveMul: 1.02, dmgMul: 1.0,
             crouchPct: 0.42, pronePct: 0.08, sprintPct: 0.60, nadePct: 0.40, minePct: 0.16, verticality: 0.70, nadeCdMs: 10000 },
  extreme: { label: 'Extreme', react: 95, aimErr: 0.030, fireMs: 145, range: 140, burst: 7, headPct: 0.32, moveMul: 1.15, dmgMul: 1.0,
             crouchPct: 0.55, pronePct: 0.12, sprintPct: 0.80, nadePct: 0.62, minePct: 0.26, verticality: 0.95, nadeCdMs: 6500 }
};
const SKILL_IDS = ['recruit', 'regular', 'veteran', 'extreme'];

/* BOT LOADOUTS.

   v8.38 hardcoded `const w = 'ak47'` in botShoot and never set `bot.wp`, so
   every bot on every difficulty carried the same rifle and the client rendered
   the same model in all of their hands. Now each bot draws a loadout, `wp` is
   the index into CFG.WEAPON_ORDER so the existing avatar code renders the right
   weapon with no client change, and botShoot resolves damage through the real
   weapon table.

   `ideal` is the range the bot tries to hold. It is what stops a shotgun bot
   plinking from 60 m and a sniper walking into your face — the same engagement
   logic reads it for every weapon, so adding one here is all it takes.
   `rateMul` scales the skill's fire interval: a bolt-action cannot cycle at an
   SMG's cadence and would otherwise out-DPS everything at extreme.

   Rocket and knife are deliberately absent. A rocket bot is a one-shot kill
   with splash the probability model does not simulate, and a knife bot needs
   melee closing behaviour that does not exist yet. Leaving them out is honest;
   shipping them half-modelled is not. */
const LOADOUTS = [
  { w: 'ak47',    ideal: 22, rateMul: 1.00, weight: 16 },
  { w: 'm4a1',    ideal: 24, rateMul: 0.95, weight: 14 },
  { w: 'scarh',   ideal: 26, rateMul: 1.05, weight: 10 },
  { w: 'm249',    ideal: 20, rateMul: 0.90, weight: 6 },
  { w: 'mk14',    ideal: 38, rateMul: 1.60, weight: 8 },
  { w: 'uzi',     ideal: 12, rateMul: 0.75, weight: 8 },
  { w: 'p90',     ideal: 13, rateMul: 0.75, weight: 8 },
  { w: 'shotgun', ideal: 8,  rateMul: 2.10, weight: 7 },
  { w: 'aa12',    ideal: 9,  rateMul: 1.30, weight: 4 },
  { w: 'sniper',  ideal: 62, rateMul: 3.20, weight: 7 },
  { w: 'kar98',   ideal: 66, rateMul: 3.60, weight: 5 },
  { w: 'awm',     ideal: 74, rateMul: 3.80, weight: 3 },
  { w: 'pistol',  ideal: 14, rateMul: 1.10, weight: 4 }
];
const LOADOUT_TOTAL = LOADOUTS.reduce((a, l) => a + l.weight, 0);
function pickLoadout() {
  let r = Math.random() * LOADOUT_TOTAL;
  for (const l of LOADOUTS) { r -= l.weight; if (r <= 0) return l; }
  return LOADOUTS[0];
}

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
    /* v8.38.1 BOT SETTINGS LEAKED ACROSS MODES.

       `botCount` is a room setting and it PERSISTS when the mode changes. A
       host who set up Training with six bots and then switched to 5 vs 5 got
       six bots injected into their team match — confirmed live, not theorised.

       The guard is on the MODE, not on the count, because the count is
       remembered on purpose: flipping back to Training should restore the
       host's choice rather than silently reset it to zero. */
    /* v9.2: the guard is CFG.botsAllowed, not a literal `.practice` read, so
       Strike Team (vsBots) gets bots too and there is exactly one place that
       decides which modes have them. */
    /* v9.11: two doors into this function, and they must stay separate.
       BACKFILL is the host asking for empty slots to be filled in a normal
       human mode; it is bounded by maxPlayers and ignores `botCount` entirely,
       which is what keeps the v8.38.1 leak fixed — a stale count from a
       Training session still injects nothing into a 5v5. */
    const backfill = !CFG.botsAllowed(room.settings.mode) &&
                     CFG.backfillAllowed(room.settings.mode) &&
                     !!room.settings.backfill;
    if (!backfill && !CFG.botsAllowed(room.settings.mode)) return;
    const botSide = CFG.botSideOf(room.settings.mode);
    /* Strike Team defaults its bot count to the size of the human squad, so a
       host who never touches the slider still gets a fair-shaped fight. They
       can still raise or lower it — a duo that wants six machines is allowed. */
    let want = Math.max(0, Math.min(19, (room.settings.botCount | 0)));
    if (backfill) {
      /* Fill to the mode's own seat count, minus whoever is already here.
         A 10v10 with three humans becomes three humans and seventeen bots; a
         full room gets none. Capped at 19 for the same reason every other bot
         path is: beyond that the snapshot and the AI tick both start to hurt. */
      let humans = 0;
      for (const q of room.players.values()) if (!q.bot) humans++;
      const seats = (modeInfo(room).maxPlayers || CFG.MODES[room.settings.mode].maxPlayers || 8);
      want = Math.max(0, Math.min(19, seats - humans));
    } else if (botSide) {
      let humans = 0;
      for (const q of room.players.values()) if (!q.bot) humans++;
      if (!room.settings.botCount) want = Math.max(1, humans);
    }
    if (!want) return;
    const S = skillOf(room);
    const cols = buildColliders(room.settings.map || 'urban');
    const teams = modeInfo(room).teams;
    const ids = CFG.activeTeams(room.settings.mode);
    const names = CALLSIGNS.slice().sort(() => Math.random() - 0.5);
    /* Bots join the side with fewest members so a human is never alone against
       a stacked team purely by join order. */
    for (let i = 0; i < want; i++) {
      const id = 'bot:' + room.code + ':' + i;
      let team = null;
      if (botSide) {
        /* Every bot on the machine side. Balancing by headcount here would put
           bots on the human team as soon as the humans outnumbered them, which
           is the one thing this mode must never do. */
        team = botSide;
      } else if (teams) {
        const count = {};
        ids.forEach(t => { count[t] = 0; });
        for (const q of room.players.values()) if (q.team) count[q.team] = (count[q.team] || 0) + 1;
        team = ids.slice().sort((x, y) => count[x] - count[y])[0];
      }
      /* v9.4: a recruit carries the one rifle v8.38 hardcoded, so a recruit
         lobby looks like the game before the armoury existed. */
      const kit = S.oneWeapon
        ? (LOADOUTS.find(l => l.w === S.oneWeapon) || LOADOUTS[0])
        : pickLoadout();
      const p = {
        id, name: names[i % names.length] + '-' + (i + 1), bot: true, connected: true,
        color: team ? CFG.TEAMS[team].color : CFG.COLORS[(i + 1) % CFG.COLORS.length],
        team, joinOrder: 10000 + i,
        kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, bestStreak: 0, ping: 0, ready: true,
        hp: CFG.PLAYER.hp, armorLvl: 0, armorDur: 0, helmLvl: 0, helmDur: 0, alive: false,
        protUntil: 0, att: { sight: null, muzzle: null, mag: null }, exW: {}, rd: {},
        pos: [0, 0.95, 0], ry: 0, rx: 0, crouch: 0, mv: 0, ln: 0,
        /* wp is the index into CFG.WEAPON_ORDER, which is exactly what a human
           client sends, so the avatar renders the right weapon in the bot's
           hands with no client change at all. */
        wp: Math.max(0, CFG.WEAPON_ORDER.indexOf(kit.w)),
        mines: CFG.GEAR.mine.start, nades: CFG.THROWS.frag.count, lastMolo: {},
        lastShotAt: {}, history: [], respawnAt: 0, out: false,
        ai: { cols, kit, target: null, seenAt: 0, nextFire: 0, wanderTo: null, repath: 0,
              vy: 0, plan: null, planAge: 0, planApex: 0, posture: 0,
              freeUntil: 0, freeDir: 1, stuckHits: 0, highSeek: 0, postureUntil: 0, nextNade: 0, nextMine: 0,
              stuckFor: 0, lastX: 0, lastZ: 0, sprint: false }
      };
      room.players.set(id, p);
    }
  }

  /* Bots exist only for the duration of a match. Leaving them in the lobby
     would let them count toward the ready gate and the player cap, and a host
     who lowered the bot count would be stuck with the old ones. */
  /* ===== v9.11 — A HUMAN ALWAYS BEATS A BOT FOR A SEAT =====
     A backfilled room is FULL by definition, so without this a player who has
     the room code cannot get in — the feature that makes modes playable would
     make them unjoinable. One bot leaves, from the largest side so the teams
     stay balanced, and the arriving human takes the slot.
     Returns true if room was made. */
  function yieldSeat(room) {
    if (!room || !room.players) return false;
    if (!room.settings || !room.settings.backfill) return false;
    if (!CFG.backfillAllowed(room.settings.mode)) return false;
    const bots = [...room.players.values()].filter(p => p.bot);
    if (!bots.length) return false;
    /* Prefer a DEAD bot if there is one: removing a live bot mid-firefight
       makes a body vanish in front of somebody. */
    const count = {};
    bots.forEach(b => { count[b.team || '_'] = (count[b.team || '_'] || 0) + 1; });
    bots.sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? 1 : -1;
      return (count[b.team || '_'] || 0) - (count[a.team || '_'] || 0);
    });
    const victim = bots[0];
    room.players.delete(victim.id);
    io.to(room.code).emit('playerLeft', { id: victim.id, name: victim.name });
    return true;
  }

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

  /* ---- posture ----------------------------------------------------------

     A posture change is not free: standing up out of prone in the middle of a
     firefight is a decision, and a bot that re-rolled its stance every tick
     would strobe between crouch and stand sixty times a second. So a posture is
     committed to for a period and only reconsidered when that expires.

     Prone is deliberately rare and reserved for long-range weapons. A prone bot
     at 8 m is a free kill, and a bot that goes prone in a doorway looks broken
     rather than tactical. */
  function setStance(bot, want) {
    if (bot.crouch === want) return;
    /* Keep the FEET where they are. The capsule centre has to move by the
       change in half-height or a bot that crouches sinks into the floor and one
       that stands up pops through the ceiling — the human controller does the
       same correction at player/controller.js `pos.y += (h - halfY)`. */
    const before = halfH(bot);
    bot.crouch = want;
    bot.pos[1] += halfH(bot) - before;
  }

  function choosePosture(bot, S, dist, hasTarget, t) {
    const ai = bot.ai;
    if (t < ai.postureUntil) return;
    ai.postureUntil = t + 900 + Math.random() * 2200;
    if (!hasTarget) {
      /* Moving between fights: stand. Crouch-walking the whole map is what made
         the first pass look like the bots were injured. */
      setStance(bot, 0);
      return;
    }
    const r = Math.random();
    if (dist > 45 && r < S.pronePct) { setStance(bot, 2); return; }
    if (r < S.crouchPct) { setStance(bot, 1); return; }
    setStance(bot, 0);
  }

  /* ---- movement ---------------------------------------------------------

     One attempt along the desired vector, then each axis alone if that fails.
     What is new in v9.2 is that every attempt is resolved VERTICALLY as well:
     `groundAt` decides what the feet would rest on, and a move is legal when
     the rise is inside MOVE.step and the body fits. Falling is a separate
     integration afterwards so a bot walking off a roof arcs down instead of
     teleporting to the pavement. */
  function tryMove(bot, cols, nx, nz, h) {
    const r = CFG.PLAYER.radius;
    const feet = feetOf(bot);
    const g = groundAt(cols, nx, nz, feet, r);
    /* No ground within step reach means a DROP, not a wall — walking off a
       ledge is allowed and gravity deals with it. Refusing it would pin bots to
       the rooftops they just climbed onto. */
    const landing = (g === null) ? feet : g;
    if (landing - feet > CFG.MOVE.step + 0.001) return false;
    if (bodyBlocked(cols, nx, landing, nz, r, h, CFG.MOVE.step + 0.03)) return false;
    bot.pos[0] = nx; bot.pos[2] = nz;
    if (g !== null && g > feet) { bot.pos[1] = g + halfH(bot); bot.ai.vy = 0; }
    return true;
  }

  function applyGravity(bot, cols, dt) {
    const r = CFG.PLAYER.radius, ai = bot.ai, hh = halfH(bot);
    const feet = feetOf(bot);
    const g = groundAt(cols, bot.pos[0], bot.pos[2], feet, r);
    if (g !== null && feet - g < 0.02 && feet - g > -0.06) {
      ai.vy = 0; bot.pos[1] = g + hh; return;
    }
    ai.vy -= CFG.MOVE.gravity * dt;
    const nFeet = feet + ai.vy * dt;
    /* Search downward from the CURRENT foot height for the surface being fallen
       onto, otherwise a fast fall steps straight past a thin roof slab in one
       frame and the bot drops through the building. */
    let land = null;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (bot.pos[0] <= c[0] - r || bot.pos[0] >= c[3] + r) continue;
      if (bot.pos[2] <= c[2] - r || bot.pos[2] >= c[5] + r) continue;
      if (c[4] > feet + 0.02 || c[4] < nFeet) continue;
      if (land === null || c[4] > land) land = c[4];
    }
    if (land !== null) { bot.pos[1] = land + hh; ai.vy = 0; }
    else bot.pos[1] = Math.max(hh, nFeet + hh);
    if (bot.pos[1] <= hh) { bot.pos[1] = hh; ai.vy = 0; }
  }

  /* ---- throwables -------------------------------------------------------

     A frag is simulated on the server with the SAME constants the client uses
     to draw it (CFG.THROWS.frag.throwVel, gravity 12 in weapons/system.js), and
     the `throw` event is emitted so every client renders the arc through the
     existing projectile code. Damage is applied server-side at the end of the
     fuse.

     It has to work this way round. A human's grenade damage arrives as a `hit`
     claim from the thrower's client; a bot has no client, so nothing would ever
     claim it. Reusing the visual event and owning the damage here keeps one
     grenade model on screen and one source of truth for who got hurt. */
  function throwFrag(room, bot, target) {
    const F = CFG.THROWS.frag;
    const ai = bot.ai;
    const ox = bot.pos[0], oy = bot.pos[1] + 0.5, oz = bot.pos[2];
    const dx = target.pos[0] - ox, dz = target.pos[2] - oz;
    const d = Math.hypot(dx, dz) || 1;
    /* Aim high enough to arc. Not a ballistics solution — a bot that computed
       the exact launch angle would land every frag on your head, which is not
       fun and not the difficulty dial we want to move. */
    const up = Math.min(0.75, 0.22 + d / 90);
    const flat = Math.sqrt(Math.max(0.05, 1 - up * up));
    const vx = (dx / d) * F.throwVel * flat;
    const vz = (dz / d) * F.throwVel * flat;
    const vy = F.throwVel * up;
    io.to(room.code).emit('throw', { id: bot.id, type: 'frag', o: [ox, oy, oz], v: [vx, vy, vz] });

    /* Integrate the same arc the client draws, and STOP AT FIRST GROUND
       CONTACT — v9.4 made frags impact-detonated, so a bot whose grenade kept
       bouncing for the full fuse would blow it up somewhere the players watching
       the projectile never saw it land. */
    let px = ox, py = oy, pz = oz, wx = vx, wy = vy, wz = vz;
    const step = 1 / 60;
    let flight = 0;
    for (let i = 0; i < Math.ceil(F.fuse * 60); i++) {
      wy -= 12 * step;
      px += wx * step; py += wy * step; pz += wz * step;
      flight += step;
      if (py <= 0.12) { py = 0.12; break; }
    }
    ai.pendingNade = { x: px, y: py, z: pz, at: now() + flight * 1000 };
  }

  function resolveNades(room, t) {
    for (const bot of room.players.values()) {
      const ai = bot.ai;
      if (!bot.bot || !ai || !ai.pendingNade || t < ai.pendingNade.at) continue;
      const n = ai.pendingNade; ai.pendingNade = null;
      const F = CFG.THROWS.frag;
      const teams = modeInfo(room).teams;
      for (const q of room.players.values()) {
        if (!q.alive) continue;
        if (teams && q.team && bot.team && q.team === bot.team && q.id !== bot.id) continue;
        const dx = q.pos[0] - n.x, dy = q.pos[1] - n.y, dz = q.pos[2] - n.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > F.radius) continue;
        /* Flat inside the radius for everyone but the thrower, matching the
           human path exactly — a bot's grenade and a player's grenade must not
           be different weapons. */
        const own = q.id === bot.id;
        const dmg = Math.round(F.flatDamage && !own ? F.dmg : F.dmg * (1 - dist / F.radius));
        if (dmg > 0) ctx.botExplode(room, bot, q, dmg, 'frag', dmg >= F.dmg - 0.5);
      }
    }
  }

  /* ---- per-tick AI ---- */

  function tick(room, dt) {
    if (!room || room.state !== 'playing') return;
    /* v9.11: backfilled rooms tick too. The guard still refuses a mode that
       has no bots in it at all, which is the rule it was written for. */
    if (!CFG.botsAllowed(room.settings.mode) &&
        !(room.settings.backfill && CFG.backfillAllowed(room.settings.mode))) return;

    const S = skillOf(room);
    const t = now();
    const spawns = (mapData(room).SPAWNS) || [];

    resolveNades(room, t);

    for (const bot of room.players.values()) {
      if (!bot.bot) continue;
      if (!bot.alive) {
        /* Respawn on the same clock a human gets, unless the mode says one life. */
        if (!bot.out && t >= bot.respawnAt) {
          spawnPlayer(room, bot);
          bot.ai.vy = 0; bot.crouch = 0; bot.ai.pendingNade = null;
          bot.ai.plan = null; bot.ai.wanderTo = null; bot.ai.repath = 0;
          bot.mines = CFG.GEAR.mine.start; bot.nades = CFG.THROWS.frag.count;
        }
        continue;
      }
      const ai = bot.ai;
      const cols = ai.cols;
      const kit = ai.kit || LOADOUTS[0];

      /* Elevated loot doubles as the map's list of "places that are up" — it is
         the only registry of reachable height this project has. Cached per room
         and keyed by map so a map change cannot serve stale coordinates. */
      const mdNow = mapData(room);
      const mapKeyNow = room.settings.map || 'urban';
      if (!room._highLoot || room._highLootMap !== mapKeyNow) {
        room._highLoot = ((mdNow.LOOT_POINTS) || []).filter(l => l[1] > 1.7);
        room._highLootMap = mapKeyNow;
      }
      const high = room._highLoot;

      // --- acquire ---
      const foes = enemiesOf(room, bot);
      let best = null, bestD = Infinity;
      for (let i = 0; i < foes.length; i++) {
        const q = foes[i];
        const dx = q.pos[0] - bot.pos[0], dz = q.pos[2] - bot.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > S.range || d >= bestD) continue;
        /* Eye height now follows posture, so a prone bot genuinely cannot see
           over the crate a standing one shoots across. */
        const eye = bot.crouch === 2 ? CFG.PLAYER.eyeProne
                  : bot.crouch === 1 ? CFG.PLAYER.eyeCrouch : CFG.PLAYER.eyeStand;
        if (cols.length && segmentBlocked(cols, bot.pos[0], feetOf(bot) + eye + 0.9, bot.pos[2],
                                          q.pos[0], q.pos[1], q.pos[2])) continue;
        best = q; bestD = d;
      }
      if (best && ai.target !== best.id) { ai.target = best.id; ai.seenAt = t; }
      if (!best) ai.target = null;

      choosePosture(bot, S, bestD, !!best, t);

      // --- aim + move ---
      let wantX = 0, wantZ = 0;
      ai.sprint = false;
      if (best) {
        const dx = best.pos[0] - bot.pos[0], dz = best.pos[2] - bot.pos[2];
        bot.ry = Math.atan2(-dx, -dz);
        bot.rx = Math.max(-0.6, Math.min(0.6, -(best.pos[1] - bot.pos[1]) / Math.max(1, bestD)));
        bot.mv = 1;
        /* Hold the loadout's ideal range instead of a fixed fraction of the
           skill's sight range. A shotgun closes, a sniper backs off, and the
           same three lines do both. */
        const want = kit.ideal;
        const sign = bestD > want * 1.15 ? 1 : (bestD < want * 0.7 ? -1 : -0.2);
        wantX = (dx / (bestD || 1)) * sign;
        wantZ = (dz / (bestD || 1)) * sign;
        const px = -wantZ, pz = wantX;                       // strafe component
        const bob = Math.sin(t / 900 + bot.joinOrder) * 0.8;
        wantX += px * bob; wantZ += pz * bob;
        if (bestD > want * 2 && Math.random() < S.sprintPct) ai.sprint = true;

        /* ===== v9.7: TAKE THE HIGH GROUND ON PURPOSE =====
           Climb plans were only ever made while WANDERING, so a bot that could
           see anybody never went upstairs — and in a match it can almost always
           see somebody. Result: three of twelve bots left the street in a
           minute and the highest anything reached was 4.4 m, on a map built
           around fire escapes.

           A bot that spots an enemy at range now rolls its verticality and, if
           it wins, goes looking for a roof NEAR THAT ENEMY rather than walking
           at them down the street. That is what a person does, and it is the
           behaviour Rahul asked for: "getting top of the building and going to
           the roof and killing humans from there."

           Only beyond 1.6x the weapon's ideal range — closing distance is
           correct when the fight is already close, and a shotgun bot should
           never break off to find stairs. */
        if (!ai.plan && bestD > want * 1.6 && t > (ai.highSeek || 0) &&
            !S.groundOnly && high.length && Math.random() < S.verticality) {
          ai.highSeek = t + 12000;
          let plan = null;
          for (let a = 0; a < 5 && !plan; a++) {
            /* Pick elevated ground near the TARGET, not near the bot — the
               point is to look down on them. */
            const near = high.filter(l =>
              Math.hypot(l[0] - best.pos[0], l[2] - best.pos[2]) < 55);
            const pool = near.length ? near : high;
            const l = pool[(Math.random() * pool.length) | 0];
            plan = planClimb(room.settings.map || 'urban',
              bot.pos[0], feetOf(bot), bot.pos[2], l[0], l[1] - 0.55, l[2]);
          }
          if (plan) { ai.plan = plan; ai.planAge = 0; ai.planApex = feetOf(bot); }
        }
        /* While a climb is running, WALK THE PLAN and keep shooting. Aim is
           already set above, so the bot fires at the enemy the whole way up. */
        if (ai.plan && ai.plan.length) {
          const wp = ai.plan[0];
          const gx = wp[0] - bot.pos[0], gz = wp[1] - bot.pos[2];
          const gd = Math.hypot(gx, gz);
          if (gd < 0.9 && Math.abs(feetOf(bot) - wp[2]) < 0.8) {
            ai.plan.shift();
            if (!ai.plan.length) ai.plan = null;
          } else if (feetOf(bot) < ai.planApex - 2.6) {
            ai.plan = null;                                  // fell off
          } else {
            wantX = gx / (gd || 1); wantZ = gz / (gd || 1);
            ai.sprint = false;                               // never sprint a staircase
          }
        }
      } else {
        /* --- wander ---
           Spawn points are still the only map graph available, but v9.2 also
           lets a bot pick a LOOT point, which is the one list that describes
           the insides of buildings and the tops of things. That is what gets
           bots off the street and onto roofs without a navmesh: walk toward a
           point that happens to be up a staircase, and the step logic does the
           rest. `verticality` decides how often they bother. */
        if ((!ai.wanderTo && !ai.plan) || t > ai.repath) {
          const md = mapData(room);
          /* Cached per room AND KEYED BY MAP. The first cut keyed it on the
             room alone, which is wrong for the one thing a room outlives: its
             map. Host plays a Strike Team match on Urban, returns to the lobby,
             switches to Metro City, plays again — and every bot would still be
             planning climbs toward Urban's rooftop coordinates, on a map where
             they mean nothing. No crash, no gate failure, just bots that
             quietly stop using stairs after the first map change.
             The filter is cheap; caching it is only worth doing if the cache
             cannot go stale. */
          ai.plan = null; ai.wanderTo = null;
          /* groundOnly is a HARD refusal, not a low roll. A recruit that
             climbs one time in ten still surprises a player who has learned
             that recruits stay on the street, and "mostly like v9.0" is not
             what was asked for. */
          if (!S.groundOnly && high.length && Math.random() < S.verticality) {
            /* PICK FROM THE ELEVATED POINTS, AND TRY A FEW.
               The first cut rolled `verticality`, then chose from ALL loot and
               asked for a climb. Most loot is on the pavement and most elevated
               loot has no stair route at all (container roofs, wagon tops, the
               crane), so the compound odds worked out at roughly one climb plan
               per bot per ninety seconds — measured, not estimated: a lone
               extreme bot produced zero in a ninety-second probe.
               Rolling verticality is a decision to go up. Once it is made, look
               only at points that are up, and try four before giving up. */
            let plan = null;
            for (let a = 0; a < 4 && !plan; a++) {
              const l = high[(Math.random() * high.length) | 0];
              plan = planClimb(room.settings.map || 'urban',
                bot.pos[0], feetOf(bot), bot.pos[2], l[0], l[1] - 0.55, l[2]);
            }
            if (plan) ai.plan = plan;
            else {
              const sp = spawns[(Math.random() * spawns.length) | 0];
              if (sp) ai.wanderTo = [sp[0], sp[1]];
            }
          } else {
            /* LEASH. A recruit picks only from spawn points within 34 m, so it
               patrols where it stands and fights whoever comes to it — the v9.0
               shape. Veteran and Extreme have no leash and roam the whole map.
               Falling back to the unfiltered list matters: on a big map a tight
               leash can match nothing, and a bot with no destination is a
               statue. */
            let pool = spawns;
            if (S.leash) {
              const near = spawns.filter(sp2 => {
                const dx2 = sp2[0] - bot.pos[0], dz2 = sp2[1] - bot.pos[2];
                return Math.hypot(dx2, dz2) < S.leash;
              });
              if (near.length) pool = near;
            }
            const sp = pool[(Math.random() * pool.length) | 0];
            if (sp) ai.wanderTo = [sp[0], sp[1]];
          }
          /* A climb is a longer errand than a stroll, so it gets longer before
             the plan is torn up and re-rolled. */
          ai.repath = t + (ai.plan ? 16000 : 6000) + Math.random() * 4000;
          ai.planAge = 0; ai.planApex = feetOf(bot);
        }
        /* Follow the plan one waypoint at a time. A waypoint is reached on
           HORIZONTAL distance plus a loose height check: arriving at the foot
           of a flight means standing near it, not landing on a exact point. */
        ai.planAge = (ai.planAge || 0) + dt;
        ai.planApex = Math.max(ai.planApex || 0, feetOf(bot));
        if (ai.plan && ai.plan.length) {
          const wp = ai.plan[0];
          const dx = wp[0] - bot.pos[0], dz = wp[1] - bot.pos[2];
          const d = Math.hypot(dx, dz);
          /* Waypoint heights come from the stair registry and are FEET
             heights; comparing them to pos[1] would be off by half a body.

             The radius is TIGHT on purpose. At 1.8 m a bot ticked off "I am at
             the foot of the next flight" while still standing on the previous
             flight's top step, then set off diagonally for the waypoint after
             it — straight over the open side of a 1.6 m staircase. Traced: up
             to 3.76 m, two waypoints consumed in one second, then a fall back
             to the street and a permanent shuffle at the bottom. A waypoint on
             a staircase has to mean standing ON it. */
          if (d < 0.9 && Math.abs(feetOf(bot) - wp[2]) < 0.8) {
            ai.plan.shift();
            if (!ai.plan.length) ai.plan = null;
          } else if (feetOf(bot) < ai.planApex - 2.6) {
            /* FELL OFF — measured against the highest point this plan reached,
               not against the waypoint. Comparing to the waypoint height voided
               a plan the moment it was made: the first waypoint of a chain is
               the foot of a staircase that may itself sit several metres up, so
               a bot standing on the street was 'below its waypoint' before it
               had taken a step. Every plan in a forty-second probe was thrown
               away that way. Losing 2.6 m of ground you had already gained is
               unambiguous. */
            ai.plan = null; ai.wanderTo = null; ai.repath = 0;
          } else {
            wantX = dx / (d || 1); wantZ = dz / (d || 1);
            bot.ry = Math.atan2(-dx, -dz); bot.mv = 1;
            /* Never sprint on a staircase. Sprinting up 0.32 m treads with a
               per-tick step longer than the tread depth makes a bot skim the
               nosings and stutter; walking is also what a player does here. */
            if (d > 12 && Math.abs(bot.pos[1] - wp[2]) < 0.6 && Math.random() < S.sprintPct)
              ai.sprint = true;
          }
        } else if (ai.wanderTo) {
          const dx = ai.wanderTo[0] - bot.pos[0], dz = ai.wanderTo[1] - bot.pos[2];
          const d = Math.hypot(dx, dz);
          if (d < 3) { ai.wanderTo = null; }
          else {
            wantX = dx / d; wantZ = dz / d;
            bot.ry = Math.atan2(-dx, -dz); bot.mv = 1;
            if (Math.random() < S.sprintPct) ai.sprint = true;
          }
        }
      }

      /* Speed follows posture and sprint, from the human MOVE table. A prone
         bot crawling at 1.05 m/s is using the same number the player does. */
      let base = bot.crouch === 2 ? CFG.MOVE.prone
               : bot.crouch === 1 ? CFG.MOVE.crouch
               : (ai.sprint ? CFG.MOVE.sprint : CFG.MOVE.walk);
      const speed = base * S.moveMul * dt;
      bot.mv = (wantX || wantZ) ? (ai.sprint && !bot.crouch ? 2 : 1) : 0;

      /* The shove overrides whatever the AI wanted this tick. Perpendicular to
         the last heading, so it slides ALONG the surface it is caught on rather
         than reversing into the same corner. */
      if (ai.freeUntil && t < ai.freeUntil) {
        const px = -wantZ || Math.cos(bot.ry), pz = wantX || Math.sin(bot.ry);
        const pm = Math.hypot(px, pz) || 1;
        wantX = (px / pm) * ai.freeDir; wantZ = (pz / pm) * ai.freeDir;
        ai.sprint = false;
      }
      const h = bodyH(bot);
      if (wantX || wantZ) {
        const m = Math.hypot(wantX, wantZ) || 1;
        const nx = bot.pos[0] + (wantX / m) * speed;
        const nz = bot.pos[2] + (wantZ / m) * speed;
        const moved = tryMove(bot, cols, nx, nz, h)
                   || tryMove(bot, cols, nx, bot.pos[2], h)
                   || tryMove(bot, cols, bot.pos[0], nz, h);
        /* STUCK DETECTION. Without vertical movement a blocked bot simply
           jittered against a wall forever and the strafe bob eventually shook
           it loose. Now that bots enter buildings they can wedge in a doorway
           or a stairwell corner, where the bob is not enough. If almost nothing
           has been covered for two seconds, throw the path away and pick
           somewhere else — cheap, and it cannot deadlock. */
        /* STUCK DETECTION IS A CHECKPOINT, NOT A PER-TICK DELTA.
           The per-tick version compared movement THIS FRAME against the speed
           this frame, so a bot oscillating between two points 0.07 m apart —
           which is exactly what one does when it is wedged against a corner and
           its strafe bob reverses each tick — read as moving every single
           frame and never tripped. Traced: a bot frozen at (-57.0, -18.1) for
           thirty seconds with stuckFor sitting at 0.0.
           Net displacement from a checkpoint cannot be fooled that way. */
        /* v9.7: STUCK BOTS NOW SHAKE THEMSELVES FREE.
           Reported as bots "getting stuck on the stairs or in the wall". The
           v9.2 checkpoint detected it correctly and then did the only thing it
           could — throw the path away and pick a new destination. If the bot is
           WEDGED, the new destination is behind the same corner and it wedges
           again immediately, which is why they looked frozen rather than
           confused.
           Detecting it is not enough; the bot has to move differently. On a
           stuck verdict it now commits to a PERPENDICULAR shove for 0.8 s,
           ignoring its target entirely — which is what a player does when they
           clip a doorframe. The threshold is 1.4 m over 1.2 s: at walk speed
           that is a third of the ground it should have covered, low enough not
           to fire on a bot merely turning a corner. */
        ai.stuckFor += dt;
        if (ai.stuckFor >= 1.2) {
          const net = Math.hypot(bot.pos[0] - ai.lastX, bot.pos[2] - ai.lastZ);
          if (net < 1.4) {
            ai.wanderTo = null; ai.plan = null; ai.repath = 0;
            ai.freeUntil = t + 800;
            ai.freeDir = Math.random() < 0.5 ? 1 : -1;
            ai.stuckHits = (ai.stuckHits || 0) + 1;
            /* Three shoves and still nowhere: the bot is in geometry no
               sidestep escapes. Respawning it is honest — a bot standing in a
               wall for a whole match is worse than one that reappears. */
            if (ai.stuckHits >= 3) {
              ai.stuckHits = 0;
              spawnPlayer(room, bot);
              ai.vy = 0; ai.plan = null; ai.wanderTo = null; ai.freeUntil = 0;
            }
          } else ai.stuckHits = 0;
          ai.lastX = bot.pos[0]; ai.lastZ = bot.pos[2]; ai.stuckFor = 0;
        }
      }
      applyGravity(bot, cols, dt);

      // --- fire ---
      if (!best) continue;
      if (t - ai.seenAt < S.react) continue;                 // reaction time
      if (best.protUntil && t < best.protUntil) continue;    // respect spawn protection

      /* GRENADE. Thrown at a target that is holding still-ish at a range where
         a frag is the right answer — too close and the bot kills itself, too
         far and it lands nowhere near. */
      if (bot.nades > 0 && t > ai.nextNade && bestD > 11 && bestD < 34
          && Math.random() < S.nadePct) {
        bot.nades--;
        ai.nextNade = t + S.nadeCdMs;
        throwFrag(room, bot, best);
      }

      /* MINE. Dropped as area denial while backing off, not thrown at anyone —
         which is exactly how a player uses them. Placement goes through the
         same Mines.place the human path uses, so arming delay, friendly-fire
         rules and the client's minePlaced event all come along unchanged. */
      if ((bot.mines | 0) > 0 && t > ai.nextMine && bestD < kit.ideal * 0.8
          && Math.random() < S.minePct) {
        ai.nextMine = t + 9000 + Math.random() * 9000;
        ctx.botPlaceMine(room, bot, [bot.pos[0], bot.pos[1], bot.pos[2]]);
      }

      if (t < ai.nextFire) continue;
      ai.nextFire = t + Math.round(S.fireMs * kit.rateMul);

      /* ===== v10 - A BOT'S SHOT IS NOW SEEN AND HEARD =====

         Until now botShoot() applied damage and broadcast NOTHING. Bots fired
         with no muzzle flash, no tracer, no gunshot and no minimap ping: your
         health dropped and there was no cause anywhere on screen. Grep for
         emit('shoot') and the only sender was the human socket handler.

         That is not lag, but it is INDISTINGUISHABLE FROM LAG to whoever is
         playing - damage from nowhere is exactly what a desync feels like, and
         "lag, specially in bot mode" is how it was reported. Worth stating
         plainly because the v9.13 investigation measured the server tick, found
         it clean, and stopped; measured again in v10 it is still clean (mean
         1.08 ms, p99 5.08 ms against a 66.7 ms budget, tools/prof-bots.js), so
         the tick was never the thing.

         IT GOES HERE, NOT IN botShoot(). botShoot is only reached when the hit
         roll succeeds, so putting the event there would make a bot audible only
         when it hits you - which is worse than silence, because then every shot
         you hear has already landed.

         RANGE-GATED, one recipient at a time. v9.8 cut outbound traffic by 87%
         and a blanket broadcast would hand a chunk of that back: twelve bots at
         this cadence is roughly 96 events a second, times every client. Almost
         all of it is waste - a shot 200 m away on the far side of Urban draws a
         tracer nobody can see and plays a sound nobody can hear. Sending only
         to players within earshot keeps the cost proportional to what is
         actually happening near each person. */
      if (ctx.botFired) ctx.botFired(room, bot, kit.w);

      /* Hit resolution is a probability rather than a simulated bullet. A bot
         that raycast every shot would need the full weapon model — spread,
         recoil, drop, penetration — reimplemented server-side and kept in sync
         with the client's forever. This produces the same felt outcome and has
         one number to tune. Falls off with range so extreme is not a laser at
         130 m.

         v9.2 folds the loadout in: accuracy peaks at the weapon's ideal range
         and decays either side of it, so a shotgun bot really is lethal in a
         corridor and useless across the plaza, without a second code path. */
      /* v9.7: BOTH PENALTIES SOFTENED, because they MULTIPLY.
         `fall` and `fit` were each reasonable alone and together they collapsed
         everything past 30 m: a veteran at 40 m landed 32% of its shots for a
         1.6 s kill, and at 60 m one shot in eight. The two were also double-
         counting the same idea — that distance is hard — since a weapon's ideal
         range and the skill's sight range both grow with distance.
         0.55 falloff and a 0.45 floor on fit keep a shotgun bot useless across
         a plaza without making a rifle bot harmless at the far end of a street. */
      const fall = Math.max(0.35, 1 - (bestD / S.range) * 0.55);
      const off = Math.abs(bestD - kit.ideal) / Math.max(16, kit.ideal);
      const fit = Math.max(0.45, 1 - off * 0.38);
      const posture = bot.crouch ? 1.12 : 1;                 // steadier when set
      const pHit = Math.max(0.05, Math.min(0.95, (1 - S.aimErr) * fall * fit * posture));
      if (Math.random() > pHit) continue;
      const part = Math.random() < S.headPct ? 'head' : (Math.random() < 0.18 ? 'legs' : 'body');
      ctx.botShoot(room, bot, best, part, S.dmgMul, kit.w);
    }
  }

  return { addBots, removeBots, yieldSeat, tick, anyHumans, SKILLS, SKILL_IDS, LOADOUTS,
           buildColliders, stairsFor, planClimb, segmentBlocked, groundAt, bodyBlocked };
};
