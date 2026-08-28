/* ============================================================================
   VERIFY-SPAWN-GEOMETRY (v13.1 audit, brief sections 5/6)

   verify-spawns covers spawn RULES (protection, arena picks); this covers
   spawn PHYSICS. Collision truth is the AABB list the bots module builds
   from the REAL world code, so a spawn intersecting that list is a player
   born inside a wall, and a spawn with no ground in reach is a player born
   falling. Both have happened here twice already — v7.6 (station spawn
   swallowed by the island platform) and v7.8 (spawn 10 enclosed by the
   rebuilt terrace) — each found by a person, each fixed by moving the point.
   This gate makes the third occurrence a red build instead of a bug report.

   Uses the SAME primitives the server's own AI movement uses — buildColliders,
   groundAt, bodyBlocked — so "inside a wall" here is exactly what the game
   means by it. bodyBlocked gets the stair allowance movement gets: a spawn on
   a kerb or tread is legal ground, not a wall.
   ========================================================================= */
'use strict';
process.env.US_BOTS = '1';   // arm the engine so buildColliders is reachable
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };

const CFG = require('../public/src/config/index.js');
const Bots = require('../server/lib/bots.js')({
  io: null, now: Date.now, mapData: () => ({}), spawnPlayer: () => {},
  pushLobby: () => {}, endMatch: () => {}, modeInfo: () => ({ teams: false }), botShoot: () => {}
});

const R = CFG.PLAYER.radius, H = 1.7;
function spawnsFor(mapId) {
  /* the same resolution server.js mapData performs, made generic: a map with
     its own CFG.MAPS_<ID> block owns its spawns; only urban uses the root
     list. The first cut hard-coded three names and graded airfield's bound
     against URBAN's spawn list — 20 phantom violations from a tool bug. */
  const own = CFG['MAPS_' + String(mapId).toUpperCase()];
  return (own && own.SPAWNS) || CFG.SPAWNS;
}

Object.keys(CFG.MAPS).filter(m => CFG.MAPS[m].ready !== false).forEach(mapId => {
  console.log('--- ' + mapId + ' ---');
  let cols = null;
  try { cols = Bots.buildColliders(mapId); } catch (e) {}
  ok(Array.isArray(cols) && cols.length > 0, mapId + ': colliders built from the real world code [' + (cols ? cols.length : 0) + ']');
  if (!cols || !cols.length) return;
  const spawns = spawnsFor(mapId) || [];
  ok(spawns.length >= 8, mapId + ': has a real spawn set [' + spawns.length + ']');
  const bound = (CFG.MAPS[mapId] || {}).bound || 100;
  const inWall = [], noGround = [], oob = [];
  spawns.forEach((s, i) => {
    const x = s[0], z = s[1];
    if (Math.abs(x) > bound || Math.abs(z) > bound) { oob.push(i); return; }
    const g = Bots.groundAt(cols, x, z, 3.0, R);
    if (g === null || g === undefined || g < -0.5) { noGround.push(i + '@' + x + ',' + z); return; }
    if (Bots.bodyBlocked(cols, x, g + 0.03, z, R, H, CFG.MOVE.step + 0.03)) inWall.push(i + '@' + x + ',' + z);
  });
  ok(oob.length === 0, mapId + ': every spawn inside the map bound [' + spawns.length + ' checked]' + (oob.length ? ' OUTSIDE: ' + oob.join(' ') : ''));
  ok(noGround.length === 0, mapId + ': every spawn has ground in reach — nobody is born falling' + (noGround.length ? ' AIRBORNE: ' + noGround.join(' ') : ''));
  ok(inWall.length === 0, mapId + ': no spawn intersects geometry — the v7.6/v7.8 class is a red build now' + (inWall.length ? ' INSIDE: ' + inWall.join(' ') : ''));
});

console.log('--- the SERVER RESOLVER serves each map its OWN tables (v14.0) ---');
/* The live server shipped a hand-appended if-chain that never learned
   Blacksite, so a Bot Mode room got URBAN's spawns and loot — the human
   spawned over the void 42 m off the pad, found by the first human session
   on video. These assertions make the CLASS impossible to reship:
   the resolver must be the generic naming-convention lookup, every ready
   map must export its table, and every table must fit its own bound. */
{
  const srv = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  const body = srv.slice(srv.indexOf('function mapData'), srv.indexOf('}', srv.indexOf('return { LOOT_POINTS')));
  ok(body.indexOf("CFG['MAPS_' + String(m).toUpperCase()]") !== -1,
    'server mapData resolves by naming convention, not by a hand-grown list');
  ok(!/m === '(?!urban)/.test(body),
    'no per-map if-chain remains in the resolver — the class is dead, not trimmed');
  for (const k in CFG.MAPS) {
    if (CFG.MAPS[k].ready === false) continue;
    const bound = CFG.MAPS[k].bound;
    const t = k === 'urban'
      ? { SPAWNS: CFG.SPAWNS, LOOT_POINTS: CFG.LOOT_POINTS }
      : CFG['MAPS_' + k.toUpperCase()];
    ok(!!(t && t.SPAWNS && t.SPAWNS.length && t.LOOT_POINTS && t.LOOT_POINTS.length),
      k + ': exports its own SPAWNS and LOOT_POINTS for the resolver to find');
    if (!t || !t.SPAWNS) continue;
    const sOut = t.SPAWNS.filter(q => Math.abs(q[0]) > bound + 2 || Math.abs(q[2]) > bound + 2).length;
    const lOut = (t.LOOT_POINTS || []).filter(q => Math.abs(q[0]) > bound + 2 || Math.abs(q[2]) > bound + 2).length;
    ok(sOut === 0 && lOut === 0,
      k + ': every spawn and loot point fits inside its own bound of ' + bound +
      (sOut + lOut ? ' [' + sOut + ' spawns, ' + lOut + ' loot outside]' : ''));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
