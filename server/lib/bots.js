/* server/lib/bots.js — THE HEADLESS GEOMETRY HARNESS (and nothing else).

   v1.0d: BOT MODE IS GONE. Rahul, twice: "remove the bot mode completely from
   the game". Every bots-versus-players product left with it — the v8.38
   Overrun / Strike Team modes, the v10.9 backfill, the v14.0 Bot Mode with its
   Blacksite map, wave director and bm_ weapon pool — and so did the AI that
   drove them (ticks, aim, posture, loadouts, callsigns).

   What this file still is, and why it keeps its name: every geometry gate
   under tools/ and several server systems (the Intel line-of-sight check,
   hazards.js's "can the fire see him" / "is he under a roof", the spawn
   picker's ground probe) build the map headlessly through buildColliders()
   and read the world through the helpers below. Thirty files require
   './server/lib/bots.js' by path. Renaming the file would be thirty edits for
   no behaviour; deleting the AI is the behaviour Rahul asked for.

   The factory signature is unchanged (`require(...)(ctx)`) so every existing
   caller keeps working; the ctx it is handed is ignored.

   Do not put a bot back in here. */
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
    /* ===== v14.0 - THE HARNESS LOADS THE WHOLE WORLD, NOT A 2023 MEMORY =====
       This list was frozen when rural and metro were the only away maps.
       Every map added since — killhouse, sunsetrow, the three smalls, the two
       mediums, now blacksite — was MISSING, so buildMap's lookup found no
       builder inside the vm and silently fell back to URBAN. Nothing noticed
       for versions because legacy bot modes were urban-locked; it surfaced
       the day verify-spawn-geometry judged "riverside" spawns against what
       were actually urban's colliders. The list is now complete and ordered
       by dependency: all config parts (index.js LAST — it reduces the parts),
       then merge/world/districts/deco, then every map builder, then access. */
    [
      'public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
      'public/src/config/loot.config.js', 'public/src/config/world.config.js',
      'public/src/config/maps-metro.config.js',
      'public/src/config/maps-killhouse.config.js', 'public/src/config/maps-sunsetrow.config.js',
      'public/src/config/maps-small.config.js', 'public/src/config/maps-medium.config.js',
      'public/src/config/index.js', 'public/src/environment/merge.js',
      'public/src/environment/world.js', 'public/src/environment/districts-south.js',
      'public/src/environment/districts-north.js', 'public/src/environment/districts-outer.js',
      'public/src/environment/deco.js', 'public/src/environment/metro.js', 'public/src/environment/killhouse.js',
      'public/src/environment/sunsetrow.js', 'public/src/environment/smallmaps.js',
      'public/src/environment/medium.js', 'public/src/environment/access.js'
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
    console.error('[UrbanStrike] headless collider build failed:', e.message);
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

module.exports = function initGeometryHarness(ctx) {
  /* v1.0d: no bots. The factory shape survives for the thirty callers; every
     former product verb is gone rather than stubbed, so a call site that still
     expects one fails loudly at load instead of silently fielding nothing. */
  return { buildColliders, stairsFor, planClimb, segmentBlocked, groundAt, bodyBlocked };
};
