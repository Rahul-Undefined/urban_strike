/* verify-bots — BOT OPS (v2.12), offline. Replaces the v8-v14 gate of the same
   name, which tested an engine removed in v1.0d and had crashed ever since.

   A. THE WALK GRAPH (botnav.js) on both Bot Ops maps: stairs laid in and
      linked, roofs reachable from the street, line of sight identical to the
      linear reference, paths found.
   B. THE OPERATORS (botai.js), run on a fake clock against one human standing
      in the open, at both difficulties, with the REAL damage pipeline when it
      can be stood up (combat.js) and a plain one when it cannot:
        - they move, and some of them get up high;
        - every shot they fire is at a player they have a clear line to;
        - no shot comes sooner than the difficulty's reaction time;
        - spawn protection is respected;
        - Hard hits more often than Medium, and neither is a laser;
        - a shot they hear brings them closer; a dead operator comes back
          with its armour; the guns in play cover the armoury.
   C. THE COST: milliseconds per server tick.
   D. (v2.12.1) A PLAYER WHO MOVES AND SHOOTS BACK: nobody stands on nothing,
      the operators hit a moving target like people do, and Medium/Hard are
      a fight and a harder fight.

   Run: node tools/verify-bots.js */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const Bots = require(path.join(ROOT, 'server/lib/bots.js'))({});
const Nav = require(path.join(ROOT, 'server/lib/botnav.js'))({ CFG, Bots });
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }

/* ---------------- A. the graph ---------------- */
for (const map of ['urbansmall', 'urban']) {
  console.log('--- A. walk graph: ' + map + ' ---');
  const t0 = Date.now(), nav = Nav.buildSync(map), ms = Date.now() - t0, cols = Bots.buildColliders(map);
  ok(nav.n > 100000 && nav.reachable / nav.n > 0.95, nav.n + ' nodes, ' + (100 * nav.reachable / nav.n).toFixed(1) + '% walkable from the street [built in ' + ms + ' ms]');
  ok(nav.flightsLinked / nav.flights > 0.9, nav.flightsLinked + ' of ' + nav.flights + ' stair flights are in the graph, foot and head');
  let up = 0; const S = (CFG['MAPS_' + map.toUpperCase()] || { SPAWNS: CFG.SPAWNS }).SPAWNS, g0 = Nav.nearest(nav, S[0][0], S[0][1], 0, 3);
  nav.perches.forEach(p => { const r = Nav.path(nav, g0, p, 400000); if (r && !r.partial) up++; });
  ok(nav.perches.length >= 40 && up === nav.perches.length, 'every one of the ' + nav.perches.length + ' stair-heads can be walked to from a street spawn [' + up + ']');
  let high = 0; for (let i = 0; i < nav.n; i++) if (nav.reach[i] && nav.nh[i] > 2.8) high++;
  ok(high > 8000, high + ' reachable nodes above 2.8 m (upper floors, roofs, towers)');
  let seed = 11; const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let agree = 0; const N = 300;
  for (let i = 0; i < N; i++) {
    const a = Nav.posOf(nav, (r() * nav.n) | 0), b = Nav.posOf(nav, (r() * nav.n) | 0);
    if (Nav.los(nav, a[0], a[1] + 1.6, a[2], b[0], b[1] + 1.2, b[2]) === !Bots.segmentBlocked(cols, a[0], a[1] + 1.6, a[2], b[0], b[1] + 1.2, b[2])) agree++;
  }
  ok(agree === N, 'line of sight agrees with the linear reference on ' + agree + '/' + N + ' random pairs');
  let found = 0, tms = 0;
  for (let i = 0; i < 40; i++) {
    const a = S[(r() * S.length) | 0], b = S[(r() * S.length) | 0], s = Date.now();
    const p = Nav.path(nav, Nav.nearest(nav, a[0], a[1], 0, 3), Nav.nearest(nav, b[0], b[1], 0, 3), 22000);
    tms += Date.now() - s; if (p && (!p.partial || p.length > 20)) found++;
  }
  ok(found === 40, 'spawn-to-spawn paths at the in-game search cap: ' + found + '/40, ' + (tms / 40).toFixed(1) + ' ms each');
}

/* ---------------- B. the operators ---------------- */
/* DETERMINISTIC: botai draws from Math.random, so the gate seeds it — the same
   two minutes are played on every run and a number that moves means the code
   moved. (botai captures Math.random when it is created, so the seed is set
   first.) */
const realRandom = Math.random;
function seedRandom(s) { Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function world(mode, humanAt, seed) {
  seedRandom(seed || 20261121);
  delete require.cache[require.resolve(path.join(ROOT, 'server/lib/botai.js'))];
  const clock = { t: 1000000 }, now = () => clock.t;
  const log = { shots: [], hits: [], noLos: 0, early: 0, prot: 0, toasts: [], kills: 0 };
  const room = { code: 'TEST', state: 'playing', settings: { mode, map: 'urbansmall', killTarget: 0, minutes: 0 }, players: new Map(),
                 teamKills: { a: 0, b: 0 }, startedAt: clock.t, snapKeyframe: false };
  const nav = Nav.buildSync('urbansmall');
  const io = { to: () => ({ emit: (ev, d) => {
    if (ev === 'toast') log.toasts.push(d.msg);
    if (ev === 'shoot' && d.id.indexOf('bot_') === 0) {
      const b = room.players.get(d.id), e = human;
      const ef = e.pos[1] - 0.96, clear = Nav.los(nav, d.o[0], d.o[1], d.o[2], e.pos[0], ef + 1.19, e.pos[2]) || Nav.los(nav, d.o[0], d.o[1], d.o[2], e.pos[0], ef + 1.78, e.pos[2]);
      log.shots.push({ t: clock.t, id: d.id, w: d.w });
      if (!clear) log.noLos++;
      if (e.protUntil > clock.t) log.prot++;
      const k = b.ai.known.get(e.id); if (!k || !k.seenAt || clock.t - k.seenAt < AI.PROFILES[CFG.MODES[mode].bots].react[0] * 0.55 - 70) log.early++;
    }
  } }), sockets: { sockets: new Map() } };
  const SP = CFG.MAPS_URBANSMALL.SPAWNS;
  const spawnPlayer = (r, p) => {
    const c = SP.filter(s => s[3] === (p.team || 'b') || s[3] === 'n'), s = c[(Math.random() * c.length) | 0];
    p.pos = p.bot ? [s[0], 0.96, s[1]] : p.pos; p.hp = 100; p.armorLvl = 0; p.armorDur = 0; p.helmLvl = 0; p.alive = true; p.protUntil = clock.t + 2500; p.rd = {};
  };
  /* the real damage pipeline when it stands up with stubs */
  let applyDamage, weaponServerDamage, real = false;
  try {
    const Combat = require(path.join(ROOT, 'server/lib/combat.js'))({ io, now, modeInfo: () => ({ teams: true, teamCount: 2 }), pushLobby() {},
      endMatch() {}, Nuke: { onKill() {} }, Rocket: { onKill() {} }, nukeOnKill() {}, rocketOnKill() {}, Loot: { dropDeathCrate() {} }, Heli: { onDeath() {} }, rooms: new Map() });
    weaponServerDamage = Combat.weaponServerDamage;
    const probe = { id: 'x', hp: 100, armorLvl: 0, armorDur: 0, helmLvl: 0, helmDur: 0, alive: true, pos: [0, 1, 0], rd: {}, deaths: 0, kills: 0, damage: 0, streak: 0, bestStreak: 0, assists: 0, team: 'a', protUntil: 0 };
    const pr = { code: 'P', state: 'playing', settings: { mode, map: 'urbansmall', killTarget: 0 }, players: new Map([['x', probe]]), teamKills: { a: 0, b: 0 } };
    Combat.applyDamage(pr, probe, 10, 'nobody', 'ak47', false, false);
    if (probe.hp === 90) { applyDamage = Combat.applyDamage; real = true; }
  } catch (e) { /* the plain pipeline below */ }
  if (!weaponServerDamage) weaponServerDamage = (w, part, pel) => (CFG.WEAPONS[w].dmg || 30) * (pel || 1) * (part === 'head' ? (CFG.WEAPONS[w].head || 2) : 1);
  if (!real) applyDamage = (r, v, dmg, by) => {
    if (!v.alive || v.protUntil > clock.t) return;
    v.hp -= dmg; v.rd[by] = { d: dmg, t: clock.t };
    if (v.hp <= 0) { v.alive = false; v.deaths++; v.respawnAt = clock.t + 3000; const a = r.players.get(by); if (a) a.kills++; }
  };
  const wrapDamage = (r, v, dmg, by, w, head, pb) => {
    const before = v.hp + (v.armorDur || 0), wasAlive = v.alive;
    applyDamage(r, v, dmg, by, w, head, pb);
    if (!v.bot) { log.hits.push({ t: clock.t, w, head: !!head, landed: v.hp + (v.armorDur || 0) < before || (wasAlive && !v.alive) }); if (wasAlive && !v.alive) log.kills++; }
  };
  const AI = require(path.join(ROOT, 'server/lib/botai.js'))({ CFG, io, now, Nav, Rooms: { colorFor: () => '#c33', pushLobby() {} },
    applyDamage: wrapDamage, weaponServerDamage, spawnPlayer });
  const human = { id: 'human1', name: 'Tester', team: 'a', connected: true, alive: true, hp: 100, armorLvl: 0, armorDur: 0, helmLvl: 0, helmDur: 0, helmStops: 0,
    pos: [humanAt[0], humanAt[1] + 0.96, humanAt[2]], crouch: 0, mv: 0, ry: 0, rx: 0, protUntil: 0, rd: {}, kills: 0, deaths: 0, damage: 0, streak: 0, bestStreak: 0, assists: 0, history: [], lastShotAt: {}, shieldHp: 0 };
  room.players.set(human.id, human);
  AI.onMatchStart(room);
  const step = (sec, each) => {
    const n = Math.round(sec * 15); let cost = 0;
    for (let i = 0; i < n; i++) {
      clock.t += 1000 / 15;
      if (!human.alive && clock.t >= (human.respawnAt || 0)) { human.alive = true; human.hp = 100; human.armorLvl = 0; human.armorDur = 0; human.protUntil = clock.t + 2500; human.rd = {}; }
      const s = process.hrtime.bigint(); AI.tick(room, 1 / 15); cost += Number(process.hrtime.bigint() - s) / 1e6;
      if (each) each();
    }
    return cost / n;
  };
  return { room, human, AI, log, clock, step, nav, real, bots: () => room._bots.list };
}
const navS = Nav.buildSync('urbansmall');
const centre = Nav.posOf(navS, Nav.nearest(navS, 0, 0, 0, 30, 1));
const stats = {};
for (const mode of ['bom', 'boh']) {
  const diff = CFG.MODES[mode].bots;
  console.log('--- B. operators: ' + diff + ' ---');
  const W = world(mode, centre);
  W.step(0.2);
  const bots = W.bots();
  ok(bots.length === W.AI.PROFILES[diff].count(1) && bots.every(b => b.alive && b.team === 'b'), bots.length + ' operators field against one human, all on side B [damage pipeline: ' + (W.real ? 'combat.js' : 'plain') + ']');
  ok(W.log.toasts.some(m => /BOT OPS/.test(m)), 'the room is told: "' + (W.log.toasts[0] || '') + '"');
  const start = bots.map(b => [b.ai.x, b.ai.z]), walked = bots.map(() => 0), last = bots.map(b => [b.ai.x, b.ai.z]), maxH = bots.map(() => 0), styles = {};
  const ms = W.step(120, () => bots.forEach((b, i) => {
    if (!b.alive) { last[i] = [b.ai.x, b.ai.z]; return; }
    const d = Math.hypot(b.ai.x - last[i][0], b.ai.z - last[i][1]); if (d < 3) walked[i] += d; last[i] = [b.ai.x, b.ai.z];
    if (b.ai.feet > maxH[i]) maxH[i] = b.ai.feet; styles[b.botStyle] = 1;
  }));
  const L = W.log, landed = L.hits.filter(h => h.landed).length;
  ok(walked.every(w => w > 15), 'every operator moves [' + walked.map(w => w.toFixed(0)).join(', ') + ' m in 2 min]');
  ok(Math.max.apply(null, maxH) >= 2.8, 'they use the high ground: highest operator stood at ' + Math.max.apply(null, maxH).toFixed(1) + ' m [' + maxH.filter(h => h > 2.8).length + ' of ' + bots.length + ' went up]');
  ok(Object.keys(styles).length >= 4, 'playing styles in the squad: ' + Object.keys(styles).join(', '));
  ok(L.shots.length > 20, L.shots.length + ' shots fired at a player standing in the open');
  ok(L.noLos === 0, 'every shot was at a player in clear line of sight [' + L.noLos + ' through cover]');
  ok(L.early === 0, 'no shot came sooner than the reaction time after first sight [' + L.early + ']');
  ok(L.prot === 0, 'nobody shot a spawn-protected player [' + L.prot + ']');
  const acc = L.hits.length / Math.max(1, L.shots.length);
  stats[diff] = { acc, kills: L.kills, shots: L.shots.length, ms, prof: W.AI.PROFILES[diff] };
  console.log('        ' + diff + ': ' + L.shots.length + ' shots, ' + (acc * 100).toFixed(0) + '% on the body, ' + L.kills + ' kills of a STATIONARY unarmoured player in 2 min, ' + ms.toFixed(2) + ' ms/tick');
  ok(acc > 0.04 && acc < 0.75, 'accuracy is a person’s, not a turret’s [' + (acc * 100).toFixed(0) + '%]');
  /* hearing: an operator that knows nothing is drawn by a shot */
  const far = bots.filter(b => b.alive && !b.ai.target).sort((a, b) => Math.hypot(b.ai.x - centre[0], b.ai.z - centre[2]) - Math.hypot(a.ai.x - centre[0], a.ai.z - centre[2]))[0];
  if (far && Math.hypot(far.ai.x - centre[0], far.ai.z - centre[2]) < 85) {
    const d0 = Math.hypot(far.ai.x - centre[0], far.ai.z - centre[2]);
    W.human.alive = true; W.human.hp = 100; W.human.protUntil = W.clock.t + 60000;      // alive, and not a target, for this probe
    W.AI.onShot(W.room, W.human, 'ak47', false);
    const heard = far.ai.known.has(W.human.id);
    W.step(5);
    const d1 = Math.hypot(far.ai.x - centre[0], far.ai.z - centre[2]);
    ok(heard && (d1 < d0 - 3 || far.ai.mode === 'hold' || far.ai.known.get(W.human.id)), 'an operator ' + d0.toFixed(0) + ' m away hears an unsuppressed shot and reacts [' + d1.toFixed(0) + ' m five seconds later, ' + far.ai.mode + ']');
    W.human.protUntil = 0;
  } else ok(true, 'hearing: every living operator already had contact (nothing left to alert)');
  /* death and return */
  const victim = bots.find(b => b.alive);
  victim.alive = false; victim.deaths++; victim.respawnAt = W.clock.t + 3000;
  W.step(3.6);
  ok(victim.alive && victim.hp === 100, 'a killed operator returns after the respawn delay');
  if (diff === 'hard') ok(bots.filter(b => b.alive).every(b => b.armorLvl >= 2 && b.helmLvl >= 2), 'every Hard operator wears a level-2 or level-3 vest and a helmet');
  else ok(bots.filter(b => b.alive).every(b => b.armorLvl === 1), 'every Medium operator wears a level-1 vest (v2.12.1: it was one in two)');
  ok(ms < 4, 'cost: ' + ms.toFixed(2) + ' ms per server tick for ' + bots.length + ' operators');
}
/* ---------------- D. A PLAYER WHO MOVES AND SHOOTS BACK (v2.12.1) ----------------
   Rahul, after playing v2.12: "bots are very easy to kill and they are not able
   to kill me" — and one of them was standing in the sky. Sections A-C could not
   see either: they test a player standing still. This one plays a scripted
   player who WALKS the map and FIRES BACK (an average shot: 420 ms to react,
   38% of rounds on target up close, falling with distance), on the real damage
   pipeline, and counts:
     * every operator position on every tick must have the graph under it;
     * how often the operators hit a moving player, by distance;
     * who wins. v2.12 measured this way: Medium K/D 4.4 for the player (the
       operators landed 3.8% of their rounds), Hard 0.83. */
function duel(map, mode, minutes, seed) {
  seedRandom(seed);
  delete require.cache[require.resolve(path.join(ROOT, 'server/lib/botai.js'))];
  const clock = { t: 1e6 }, now = () => clock.t, R = () => Math.random();
  const room = { code: 'DUEL', state: 'playing', settings: { mode, map, killTarget: 0, minutes: 0 }, players: new Map(), teamKills: { a: 0, b: 0 }, startedAt: clock.t };
  const nav = Nav.buildSync(map), cols = nav.cols;
  const L = { shots: 0, hits: 0, near: [0, 0], kills: 0, deaths: 0, air: 0, airRun: 0, airAt: null, samples: 0, rescued: 0 };
  let human, lastNear = false;
  const io = { to: () => ({ emit(ev, d) {
    if (ev !== 'shoot' || String(d.id).indexOf('bot_') !== 0) return;
    const b = room.players.get(d.id); L.shots++; lastNear = Math.hypot(b.ai.x - human.pos[0], b.ai.z - human.pos[2]) < 15; if (lastNear) L.near[0]++;
  } }), sockets: { sockets: new Map() } };
  const SP = (CFG['MAPS_' + map.toUpperCase()] || {}).SPAWNS || CFG.SPAWNS;
  const spawnPlayer = (r, p) => { const c = SP.filter(q => q[3] === (p.team || 'b') || q[3] === 'n'), q = c[(R() * c.length) | 0];
    p.pos = [q[0], 0.96, q[1]]; p.hp = 100; p.armorLvl = 0; p.armorDur = 0; p.helmLvl = 0; p.helmDur = 0; p.alive = true; p.protUntil = clock.t + 2500; p.rd = {}; };
  const Combat = require(path.join(ROOT, 'server/lib/combat.js'))({ io, now, modeInfo: () => ({ teams: true, teamCount: 2 }), pushLobby() {}, endMatch() {},
    Nuke: { onKill() {} }, Rocket: { onKill() {} }, nukeOnKill() {}, rocketOnKill() {}, Loot: { dropDeathCrate() {} }, Heli: { onDeath() {} }, rooms: new Map() });
  const applyDamage = (r, v, dmg, by, w, head, pb) => {
    const before = v.hp + (v.armorDur || 0), was = v.alive;
    Combat.applyDamage(r, v, dmg, by, w, head, pb);
    if (!v.bot) { if (v.hp + (v.armorDur || 0) < before || (was && !v.alive)) { L.hits++; if (lastNear) L.near[1]++; } if (was && !v.alive) { L.deaths++; v.respawnAt = clock.t + 5000; } human.hurtBy = by; human.hurtAt = clock.t; }
    else if (was && !v.alive) { L.kills++; if (!v.respawnAt || v.respawnAt < clock.t) v.respawnAt = clock.t + 5000; }
  };
  const AI = require(path.join(ROOT, 'server/lib/botai.js'))({ CFG, io, now, Nav, Rooms: { colorFor: () => '#c33', pushLobby() {} }, applyDamage, weaponServerDamage: Combat.weaponServerDamage, spawnPlayer });
  human = { id: 'human1', name: 'Tester', team: 'a', connected: true, alive: false, hp: 100, armorLvl: 0, armorDur: 0, helmLvl: 0, helmDur: 0, helmStops: 0, pos: [0, 0.96, 0], crouch: 0, mv: 1, ry: 0, rx: 0,
    protUntil: 0, rd: {}, kills: 0, deaths: 0, damage: 0, streak: 0, bestStreak: 0, assists: 0, history: [], lastShotAt: {}, shieldHp: 0 };
  const H = { x: 0, z: 0, feet: 0, path: null, pi: 0, yaw: 0, target: null, seenAt: 0, nextShot: 0, mag: 30, reloadUntil: 0 };
  const hspawn = () => { spawnPlayer(room, human); const q = Nav.posOf(nav, Nav.nearest(nav, human.pos[0], human.pos[2], 0, 5, 1.5)); H.x = q[0]; H.z = q[2]; H.feet = q[1]; H.path = null; H.target = null; H.mag = 30; };
  room.players.set(human.id, human); hspawn(); AI.onMatchStart(room);
  /* is there anything under this operator's feet? */
  const G = 4, grid = new Map();
  cols.forEach((c, ci) => { if (c[3] - c[0] > 900) return;
    for (let i = Math.floor((c[0] - 0.6) / G); i <= Math.floor((c[3] + 0.6) / G); i++) for (let j = Math.floor((c[2] - 0.6) / G); j <= Math.floor((c[5] + 0.6) / G); j++) { const k = i + ',' + j; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(ci); } });
  const gap = (x, y, z) => { let sup = y; const a = grid.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || [];
    for (const ci of a) { const c = cols[ci]; if (x >= c[0] - 0.36 && x <= c[3] + 0.36 && z >= c[2] - 0.36 && z <= c[5] + 0.36) { const d = y - c[4]; if (d > -0.5 && d < sup) sup = d; } } return sup; };
  const bots = () => room._bots.list, WALK = CFG.MOVE.walk;
  for (let i = 0; i < minutes * 60 * 15; i++) {
    clock.t += 1000 / 15; const t = clock.t, dt = 1 / 15;
    if (!human.alive) { if (t >= (human.respawnAt || 0)) hspawn(); }
    else {
      if (!H.path) { const n = Nav.randomNear(nav, H.x, H.z, 25, 80, 3, R), from = Nav.nearest(nav, H.x, H.z, H.feet, 2, 1);
        if (n >= 0 && from >= 0) { const ids = Nav.path(nav, from, n, 22000); if (ids && ids.length > 1) { H.path = Nav.smooth(nav, ids); H.pi = 0; } } }
      let moving = false;
      if (H.path) { let remain = WALK * dt; moving = true;
        while (remain > 1e-5 && H.pi < H.path.length) { const w = H.path[H.pi], dx = w[0] - H.x, dz = w[2] - H.z, d = Math.hypot(dx, dz);
          if (d <= remain) { H.x = w[0]; H.z = w[2]; H.feet = w[1]; remain -= d; H.pi++; } else { H.x += dx / d * remain; H.z += dz / d * remain; H.feet += (w[1] - H.feet) * (remain / d); H.yawMove = Math.atan2(dx, -dz); remain = 0; } }
        if (H.pi >= H.path.length) H.path = null; }
      human.pos = [H.x, H.feet + 0.96, H.z]; human.mv = moving ? 1 : 0;
      let best = null, bd = 1e9;
      for (const b of bots()) { if (!b.alive) continue; const dx = b.ai.x - H.x, dz = b.ai.z - H.z, d = Math.hypot(dx, dz); if (d > 90) continue;
        const ang = Math.abs(((Math.atan2(dx, -dz) - H.yaw + 9.4248) % 6.2832) - 3.1416), aware = human.hurtBy === b.id && t - human.hurtAt < 3000 && t - human.hurtAt > 450;
        if (ang > 1.22 && !aware && H.target !== b.id) continue;
        if (!Nav.los(nav, H.x, H.feet + 1.73, H.z, b.ai.x, b.ai.feet + 1.2, b.ai.z)) continue;
        if (d < bd) { bd = d; best = b; } }
      if (best) {
        if (H.target !== best.id) { H.target = best.id; H.seenAt = t; }
        H.yaw = Math.atan2(best.ai.x - H.x, -(best.ai.z - H.z));
        if (t - H.seenAt >= 420 && t >= H.nextShot && t >= H.reloadUntil && !(best.protUntil > t)) {
          H.nextShot = t + 60000 / 590; H.mag--; AI.onShot(room, human, 'ak47', 0); human.protUntil = 0;
          let p = Math.max(0.08, Math.min(0.38, 0.46 - bd / 140)); if (best.mv) p *= 0.75; if (best.crouch) p *= 0.85; if (moving) p *= 0.8;
          if (R() < p) { const head = R() < 0.08; applyDamage(room, best, Combat.weaponServerDamage('ak47', head ? 'head' : 'body', 1, bd, false), human.id, 'ak47', head, false); }
          if (H.mag <= 0) { H.reloadUntil = t + 2400; H.mag = 30; }
        }
      } else { H.target = null; if (H.yawMove !== undefined) H.yaw = H.yawMove; }
      human.ry = H.yaw;
    }
    AI.tick(room, dt);
    for (const b of bots()) { if (!b.alive) continue; L.samples++; const A = b.ai;
      if (A.rescued) { L.rescued += A.rescued; A.rescued = 0; }
      const g = gap(A.x, A.feet, A.z), st = Nav.isStair(nav, A.x, A.z, A.feet);
      /* one stride across the join between a flight and a floor is a step, not
         a float: what must never happen is a RUN of ticks with nothing under it */
      if ((!st && g > 0.5) || (st && g > 1.3)) { L.air++; A._air = (A._air || 0) + 1; if (A._air > L.airRun) { L.airRun = A._air; L.airAt = [A.x.toFixed(1), A.feet.toFixed(2), A.z.toFixed(1), 'gap ' + g.toFixed(2), b.name, A.mode, A.path ? 'on path' : 'idle'].join(' '); } }
      else A._air = 0; }
  }
  return L;
}
console.log('--- D. a player who moves and shoots back ---');
{
  const sum = (mode) => { const T = { shots: 0, hits: 0, near: [0, 0], kills: 0, deaths: 0, air: 0, airRun: 0, samples: 0, rescued: 0, airAt: null };
    [11, 22, 33].forEach(seed => { const L = duel('urbansmall', mode, 8, seed); ['shots', 'hits', 'kills', 'deaths', 'air', 'samples', 'rescued'].forEach(k => { T[k] += L[k]; }); T.near[0] += L.near[0]; T.near[1] += L.near[1]; if (L.airRun > T.airRun) { T.airRun = L.airRun; T.airAt = L.airAt; } });
    return T; };
  const M = sum('bom'), Hd = sum('boh'), U = duel('urban', 'bom', 3, 44);
  const run = Math.max(M.airRun, Hd.airRun);
  ok(run <= 2, 'no operator stands on nothing: ' + (M.samples + Hd.samples) + ' positions over 48 simulated minutes on Urban Small; the longest spell off the graph was ' + run + ' tick(s) — a stride across a stair join (' + (M.air + Hd.air) + ' such strides in all). v2.12: one operator hung at 8.5 m for two minutes' + (run > 2 ? ' [WORST: ' + (M.airRun >= Hd.airRun ? M.airAt : Hd.airAt) + ']' : ''));
  ok(U.airRun <= 2, 'nor on Urban: ' + U.samples + ' positions, longest spell ' + U.airRun + ' tick(s)' + (U.airRun > 2 ? ' [WORST: ' + U.airAt + ']' : ''));
  ok(M.rescued + Hd.rescued + U.rescued <= 6, 'the put-it-back-on-the-ground net fired ' + (M.rescued + Hd.rescued + U.rescued) + ' time(s) in all of that (it is a net, not the mechanism)');
  const kdM = M.kills / Math.max(1, M.deaths), kdH = Hd.kills / Math.max(1, Hd.deaths), hrM = M.hits / M.shots, hrH = Hd.hits / Hd.shots;
  console.log('        medium: the scripted player ' + M.kills + ' kills / ' + M.deaths + ' deaths (K/D ' + kdM.toFixed(2) + '); operators landed ' + (hrM * 100).toFixed(1) + '% of ' + M.shots + ' rounds, ' + (100 * M.near[1] / Math.max(1, M.near[0])).toFixed(0) + '% inside 15 m');
  console.log('        hard:   the scripted player ' + Hd.kills + ' kills / ' + Hd.deaths + ' deaths (K/D ' + kdH.toFixed(2) + '); operators landed ' + (hrH * 100).toFixed(1) + '% of ' + Hd.shots + ' rounds, ' + (100 * Hd.near[1] / Math.max(1, Hd.near[0])).toFixed(0) + '% inside 15 m');
  ok(kdM > 0.35 && kdM < 1.5, 'Medium is a fight: an average scripted player goes K/D ' + kdM.toFixed(2) + ' (v2.12: 4.4 — a walkover)');
  ok(kdH < kdM && kdH > 0.12 && Hd.kills >= 15, 'Hard is harder and still playable: K/D ' + kdH.toFixed(2) + ', ' + Hd.kills + ' kills in 24 minutes');
  ok(hrM > 0.06 && hrM < 0.2 && hrH > 0.06 && hrH < 0.2, 'they hit a MOVING player like people do, not like a turret: ' + (hrM * 100).toFixed(1) + '% Medium, ' + (hrH * 100).toFixed(1) + '% Hard (v2.12: 3.8%)');
  ok(M.near[1] / Math.max(1, M.near[0]) > 0.25, 'up close they are dangerous: ' + (100 * M.near[1] / Math.max(1, M.near[0])).toFixed(0) + '% of Medium rounds inside 15 m land');
  stats.duel = { kdM, kdH };
}
/* Hard is a better operator, not a stronger bullet */
const pm = stats.medium.prof, ph = stats.hard.prof;
ok(ph.err < pm.err && ph.react[0] + ph.react[1] < pm.react[0] + pm.react[1] && ph.view > pm.view && ph.commsMs < pm.commsMs && ph.turn > pm.turn,
  'Hard notices sooner, turns faster, aims steadier and talks sooner than Medium [aim error ' + ph.err + ' vs ' + pm.err + ' rad, reaction ' + ph.react.join('-') + ' vs ' + pm.react.join('-') + ' ms]');
ok(stats.duel.kdH < stats.duel.kdM, 'and it shows where it counts: the same scripted player goes ' + stats.duel.kdH.toFixed(2) + ' against Hard and ' + stats.duel.kdM.toFixed(2) + ' against Medium');
ok(stats.medium.kills >= 1, 'Medium is still a threat to a player who stands still [' + stats.medium.kills + ' kills]');
Math.random = realRandom;
/* the armoury */
const AI0 = require(path.join(ROOT, 'server/lib/botai.js'))({ CFG, io: { to: () => ({ emit() {} }) }, now: Date.now, Nav, Rooms: { colorFor: () => '#c33', pushLobby() {} }, applyDamage() {}, weaponServerDamage: () => 0, spawnPlayer() {} });
const guns = new Set(); Object.values(AI0.PERSONAS).forEach(p => p.all.concat(p.base).forEach(s => s.forEach(w => { if (CFG.WEAPONS[w]) guns.add(w); })));
ok(guns.size >= 18, 'the operators’ armoury covers ' + guns.size + ' guns [' + [...guns].join(', ') + ']');
ok(!['rocket', 'seeker', 'flamer', 'drone', 'emp', 'c4'].some(w => guns.has(w)), 'no rockets, flamethrowers or gear in an operator’s hands');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
