/* verify-outbreak.js — v10.13

   WHY THIS GATE EXISTS

   Outbreak has three properties that a play session cannot check, because
   reaching them takes an hour and one of them takes a perfect run:

     1. THE CURVE IS MONOTONIC AND BOUNDED. Health must never stop climbing,
        speed must never reach a sprint, and no wave may be arithmetically
        impossible. Rahul asked for "very tough at a time but not impossible" —
        the difference is a number, and it is checked here.
     2. WAVE 100 ENDS THE RUN. There is an end, and nobody is going to sit
        through 99 waves to find out whether the 100th resolves.
     3. IT IS COMPLETELY SEPARATE FROM THE PVP MODES. No PvP mode may acquire
        wave behaviour and no outbreak mode may acquire a team.

   The module is exercised directly, so the thing under test is shipping code. */
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

const CFG = require('../public/src/config/index.js');
const sent = [];
let T = 0; const now = () => T;
const ended = [];
const Z = require('../server/lib/zombies.js')({
  io: { to: () => ({ emit: (ev, d) => sent.push({ ev, d }) }) },
  now, applyDamage: () => {}, pushLobby: () => {},
  endMatch: (r, w, why) => ended.push(why),
  mapData: () => ({ SPAWNS: [[0, 0, 0], [20, 20, 0], [-20, -20, 0]] })
});

console.log('--- the curve climbs, and stops where it must ---');
let okHp = true, okCount = true;
for (let w = 2; w <= Z.MAX_WAVE; w++) {
  if (Z.waveHp(w) < Z.waveHp(w - 1)) okHp = false;
  if (Z.waveSize(w) < Z.waveSize(w - 1)) okCount = false;
}
ok(okHp, 'health never decreases across all ' + Z.MAX_WAVE + ' waves');
ok(okCount, 'wave size never decreases');
ok(Z.waveHp(Z.MAX_WAVE) > Z.waveHp(1) * 10,
  'a wave-100 body is an order of magnitude tougher than a wave-1 body [' +
  Z.waveHp(1) + ' -> ' + Z.waveHp(Z.MAX_WAVE) + ']');

/* THE DANGEROUS DIAL. A zombie faster than a sprinting player removes the
   option of backing off, and the mode stops being winnable by skill. */
const sprint = (CFG.MOVE.sprintMul || 1.5);
let topSpeed = 0;
for (let w = 1; w <= Z.MAX_WAVE; w++) topSpeed = Math.max(topSpeed, Z.waveSpeed(w));
ok(topSpeed < 1.0,
  'the fastest zombie is still slower than a walking player [' + topSpeed.toFixed(2) + ' x]');
ok(topSpeed * 1.45 < sprint,
  'and a RUNNER at 1.45x is still slower than a sprint [' +
  (topSpeed * 1.45).toFixed(2) + ' vs ' + sprint + ']');

/* Bounded, or a late wave asks the server to tick hundreds of actors. */
ok(Z.waveSize(Z.MAX_WAVE) <= 120, 'wave size is capped [' + Z.waveSize(Z.MAX_WAVE) + ']');
ok(Z.MAX_CONCURRENT <= 40,
  'and concurrency is capped independently [' + Z.MAX_CONCURRENT + ' at once]');
ok(Z.waveDamage(Z.MAX_WAVE) < CFG.PLAYER.hp,
  'even a wave-100 hit is not a one-shot kill [' + Z.waveDamage(Z.MAX_WAVE).toFixed(0) +
  ' vs ' + CFG.PLAYER.hp + ' hp]');

console.log('\n--- the tiers cover every wave ---');
let tiersOk = true, seen = {};
for (let w = 1; w <= Z.MAX_WAVE; w++) {
  const t = Z.tierFor(w);
  if (!t || typeof t !== 'string') tiersOk = false;
  seen[t] = 1;
}
ok(tiersOk, 'every wave from 1 to ' + Z.MAX_WAVE + ' resolves to a named tier');
ok(Object.keys(seen).length >= 5,
  'and there are enough tiers to mark progress [' + Object.keys(seen).join(', ') + ']');

console.log('\n--- wave 100 ends the run ---');
{
  const room = { code: 'R', state: 'playing', settings: { mode: 'zsolo', map: 'urban' }, players: new Map() };
  room.players.set('h', { id: 'h', bot: false, alive: true, out: false, pos: [0, 0.9, 0] });
  Z.begin(room);
  room.zomb.wave = Z.MAX_WAVE;      // stand at the last wave, cleared
  room.zomb.phase = 'cooldown';
  room.zomb.nextAt = 0;
  room.zomb.alive = []; room.zomb.pending = 0;
  T = 1;
  ended.length = 0;
  Z.tick(room, 1 / 15);
  ok(ended.indexOf('cleared') >= 0,
    'clearing wave ' + Z.MAX_WAVE + ' finishes the match as a WIN, not a loss');
  ok(sent.some(m => m.d && m.d.why === 'cleared'),
    'and the clients are told, so the closing line can be shown');
}

console.log('\n--- the last player down ends it ---');
{
  const room = { code: 'R2', state: 'playing', settings: { mode: 'zsqd', map: 'urban' }, players: new Map() };
  room.players.set('h', { id: 'h', bot: false, alive: false, out: true, pos: [0, 0.9, 0] });
  Z.begin(room); ended.length = 0;
  Z.tick(room, 1 / 15);
  ok(ended.indexOf('overrun') >= 0, 'no living humans ends the run');
}

console.log('\n--- outbreak is separate from the PvP modes ---');
const outbreak = Object.keys(CFG.MODES).filter(m => CFG.MODES[m].outbreak);
ok(outbreak.length >= 2, 'there is more than one outbreak mode [' + outbreak.join(', ') + ']');
outbreak.forEach(m => {
  ok(CFG.MODES[m].cat === 'zomb', m + ': sits in its own category, not among the PvP lists');
  ok(CFG.MODES[m].lives === 1, m + ': is one life');
  ok(CFG.MODES[m].teams === false, m + ': has no sides — the dead are not a team you join');
  ok(CFG.MODES[m].maxPlayers >= 1 && CFG.MODES[m].maxPlayers <= 15,
    m + ': seats 1 to 15 [' + CFG.MODES[m].maxPlayers + ']');
});
Object.keys(CFG.MODES).filter(m => !CFG.MODES[m].outbreak).forEach(m => {
  if (CFG.MODES[m].cat === 'zomb') { fail++; console.log('  FAIL  ' + m + ' is in the zomb category but not flagged outbreak'); }
});
ok(CFG.modesInCat('zomb').length === outbreak.length,
  'the Outbreak category contains exactly the outbreak modes');
ok(CFG.ALL_MODE_CATS.some(c => c.id === 'zomb'), 'and the category itself is registered');

/* A solo outbreak must be startable alone — the whole mode is pointless if it
   needs a second person, and every PvP mode on this build needs two. */
ok(CFG.MODES.zsolo && CFG.MODES.zsolo.maxPlayers === 1,
  'Outbreak Solo seats exactly one, so the game is playable alone again');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
