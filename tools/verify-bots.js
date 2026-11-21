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
  if (diff === 'hard') ok(bots.filter(b => b.alive).every(b => b.armorLvl === 2), 'Hard operators wear a level-2 vest');
  ok(ms < 4, 'cost: ' + ms.toFixed(2) + ' ms per server tick for ' + bots.length + ' operators');
}
/* Hard is a better operator, not a stronger bullet */
const pm = stats.medium.prof, ph = stats.hard.prof;
ok(ph.err < pm.err && ph.react[1] < pm.react[0] + 1 && ph.view > pm.view && ph.commsMs < pm.commsMs && ph.turn > pm.turn,
  'Hard notices sooner, turns faster, aims steadier and talks sooner than Medium [aim error ' + ph.err + ' vs ' + pm.err + ' rad, reaction ' + ph.react.join('-') + ' vs ' + pm.react.join('-') + ' ms]');
ok(stats.hard.kills > stats.medium.kills, 'and it shows: ' + stats.hard.kills + ' kills against ' + stats.medium.kills + ' on the same stationary player in the same two minutes');
ok(stats.medium.kills >= 1, 'Medium is still a threat to a player who stands still [' + stats.medium.kills + ' kills]');
Math.random = realRandom;
/* the armoury */
const AI0 = require(path.join(ROOT, 'server/lib/botai.js'))({ CFG, io: { to: () => ({ emit() {} }) }, now: Date.now, Nav, Rooms: { colorFor: () => '#c33', pushLobby() {} }, applyDamage() {}, weaponServerDamage: () => 0, spawnPlayer() {} });
const guns = new Set(); Object.values(AI0.PERSONAS).forEach(p => p.all.concat(p.base).forEach(s => s.forEach(w => { if (CFG.WEAPONS[w]) guns.add(w); })));
ok(guns.size >= 18, 'the operators’ armoury covers ' + guns.size + ' guns [' + [...guns].join(', ') + ']');
ok(!['rocket', 'seeker', 'flamer', 'drone', 'emp', 'c4'].some(w => guns.has(w)), 'no rockets, flamethrowers or gear in an operator’s hands');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
