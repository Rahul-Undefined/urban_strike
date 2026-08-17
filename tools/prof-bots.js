/* prof-bots — what does a bot tick actually cost, at the 99th percentile?

   HANDOFF §2 records the v9.13 lag diagnosis: bot AI measured 1.08 ms against
   a 66.7 ms budget, so bots were cleared and the real cause turned out to be
   respawn teleports being interpolated. That was a correct diagnosis of THAT
   symptom. It is not a clearance of bots in general, because it measured a
   MEAN. A mean of 1.08 ms is consistent with a tick that costs 0.4 ms most of
   the time and 40 ms occasionally, and a 40 ms spike inside a 66.7 ms tick is
   exactly what a player describes as "lag in bot mode".

   So this reports the distribution, not the average, and it reports it per
   phase so a spike can be attributed rather than guessed at.

   Run: node tools/prof-bots.js [map] [bots] [ticks] */

const path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

const MAP = process.argv[2] || 'urban';
const NBOTS = parseInt(process.argv[3] || '12', 10);
const TICKS = parseInt(process.argv[4] || '600', 10);

/* --------------------------------------------------- fake room plumbing */
let clock = Date.now();
const now = () => clock;

/* Copied from server.js mapData() deliberately — a profiler that resolves the
   map differently from the server is measuring a different game. */
function mapPoints(mapId) {
  if (mapId === 'rural' && CFG.MAPS_RURAL) return CFG.MAPS_RURAL;
  if (mapId === 'metro' && CFG.MAPS_METRO) return CFG.MAPS_METRO;
  return { LOOT_POINTS: CFG.LOOT_POINTS, SPAWNS: CFG.SPAWNS, AIRDROP_POINTS: CFG.AIRDROP.points };
}

const md = mapPoints(MAP);

function spawnPlayer(room, p) {
  const S = md.SPAWNS.length ? md.SPAWNS[(Math.random() * md.SPAWNS.length) | 0] : [0, 0.95, 0];
  p.pos = [S[0], S[1] !== undefined ? S[1] : 0.95, S[2]];
  p.alive = true; p.hp = CFG.PLAYER.hp;
}

const Bots = require(path.join(ROOT, 'server/lib/bots.js'))({
  io: { to: () => ({ emit: () => { } }), emit: () => { } },
  now, mapData: () => md,
  spawnPlayer,
  pushLobby: () => { }, endMatch: () => { },
  modeInfo: () => ({ teams: false, bots: true }),
  botShoot: () => { }
});

const cols = Bots.buildColliders(MAP);
console.log('map ' + MAP + '  colliders ' + cols.length + '  bots ' + NBOTS + '  ticks ' + TICKS);
console.log('tick budget at snapRate ' + CFG.NET.snapRate + ' = ' + (1000 / CFG.NET.snapRate).toFixed(1) + ' ms\n');

/* Build a room by hand in the shape bots.tick expects. */
const room = {
  id: 'PROF', state: 'playing',
  settings: { mode: 'bots', map: MAP, bots: NBOTS, difficulty: 'regular', backfill: false },
  players: new Map(), teams: false
};

let joinOrder = 0;
function addBot(i) {
  const b = {
    id: 'b' + i, bot: true, name: 'BOT' + i, joinOrder: joinOrder++,
    pos: [0, 0.95, 0], ry: 0, rx: 0, mv: 0, crouch: 0, alive: true,
    hp: CFG.PLAYER.hp, team: i % 2, kills: 0, deaths: 0,
    mines: 0, nades: 2, respawnAt: 0, out: false,
    ai: { cols, vy: 0, target: null, plan: null, wanderTo: null, repath: 0, seenAt: 0 }
  };
  spawnPlayer(room, b);
  room.players.set(b.id, b);
  return b;
}
for (let i = 0; i < NBOTS; i++) addBot(i);
// one human, so enemiesOf has a non-bot to consider
const human = {
  id: 'H', bot: false, name: 'YOU', joinOrder: joinOrder++,
  pos: [0, 0.95, 0], ry: 0, rx: 0, mv: 0, crouch: 0, alive: true,
  hp: 100, team: 0, kills: 0, deaths: 0
};
spawnPlayer(room, human);
room.players.set('H', human);

/* --------------------------------------------------------------- measure */
const dt = 1 / CFG.NET.snapRate;
const samples = [];

// warm-up: let JIT settle and let bots acquire targets/plans
for (let i = 0; i < 60; i++) { clock += 1000 * dt; Bots.tick(room, dt); }

for (let i = 0; i < TICKS; i++) {
  clock += 1000 * dt;
  // keep the human moving so line-of-sight results churn
  human.pos[0] = Math.sin(i / 23) * 40;
  human.pos[2] = Math.cos(i / 31) * 40;
  const t0 = process.hrtime.bigint();
  Bots.tick(room, dt);
  const t1 = process.hrtime.bigint();
  samples.push(Number(t1 - t0) / 1e6);
}

samples.sort((a, b) => a - b);
const pct = p => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
const budget = 1000 / CFG.NET.snapRate;

console.log('  mean   ' + mean.toFixed(2) + ' ms');
console.log('  p50    ' + pct(0.50).toFixed(2) + ' ms');
console.log('  p90    ' + pct(0.90).toFixed(2) + ' ms');
console.log('  p99    ' + pct(0.99).toFixed(2) + ' ms');
console.log('  max    ' + samples[samples.length - 1].toFixed(2) + ' ms');
console.log('  over budget: ' + samples.filter(s => s > budget).length + ' / ' + samples.length +
  ' ticks  (budget ' + budget.toFixed(1) + ' ms)');
console.log('  >25% of budget: ' + samples.filter(s => s > budget * 0.25).length + ' / ' + samples.length);
