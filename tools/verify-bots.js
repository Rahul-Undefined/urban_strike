/* verify-bots.js — v8.38

   WHY THIS GATE EXISTS

   Two bugs during the build, both of which passed every other check:

   1. Bots stood perfectly still. The collision test counted the GROUND SLAB —
      a collider like any other — as an obstacle, so every candidate step was
      blocked from every position on the map. The AI was fine; the geometry
      test was not. It reads as "the bots are broken", which is the most
      expensive kind of wrong.

   2. Bots were missing from the matchStart roster because they were added
      AFTER the payload was built.

   Both are structural and cheap to assert. */

const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

console.log('--- verify-bots: geometry, ordering, difficulty ladder ---\n');

const CFG = require('../public/src/config/index.js');
const Bots = require('../server/lib/bots.js')({
  io: null, now: Date.now, mapData: () => ({}), spawnPlayer: () => {},
  pushLobby: () => {}, endMatch: () => {}, modeInfo: () => ({ teams: false }), botShoot: () => {}
});

/* ---- the map geometry bots reason about ---- */
const cols = Bots.buildColliders('urban');
ok(cols.length > 500, 'urban colliders are built for bot line-of-sight [' + cols.length + ']');
ok(cols.every(c => c.length >= 6 && c.every(n => isFinite(n))), 'every collider is a finite AABB');

/* THE GROUND-SLAB TRAP. A player standing in the open must be able to step in
   every direction. If this fails the bots are statues again. */
const srv = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'bots.js'), 'utf8');
ok(/const feet = y - CFG\.PLAYER\.standH \/ 2/.test(srv),
  'the block test derives feet from the capsule centre, not the raw y');
ok(/c\[4\] <= lo \|\| c\[1\] >= hi/.test(srv),
  'geometry underfoot or overhead is skipped, so the ground cannot block a step');

/* ---- line of sight actually discriminates ---- */
const clear = Bots.segmentBlocked(cols, 0, 400, 0, 10, 400, 10);   // far above the city
ok(clear === false, 'a line through open sky is not blocked');
let anyBlocked = false;
for (let i = 0; i < cols.length && !anyBlocked; i++) {
  const c = cols[i];
  const cx = (c[0] + c[3]) / 2, cy = (c[1] + c[4]) / 2, cz = (c[2] + c[5]) / 2;
  if (Bots.segmentBlocked(cols, cx - 40, cy, cz, cx + 40, cy, cz)) anyBlocked = true;
}
ok(anyBlocked, 'a line driven through solid geometry IS blocked (bots cannot shoot through walls)');

/* ---- ordering: bots must exist before the roster is sent ---- */
const s = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const iAdd = s.indexOf('Bots.addBots(room)');
const iEmit = s.indexOf("emit('matchStart'");
ok(iAdd > -1 && iEmit > -1 && iAdd < iEmit,
  'bots are added BEFORE the matchStart payload is built');
ok(/Bots\.removeBots/.test(s), 'bots are stripped when a match ends');
ok(/Bots\.tick\(/.test(s), 'bots are ticked from the server loop');
ok(/bot: !!p\.bot/.test(fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'rooms.js'), 'utf8')),
  'the roster payload flags which players are bots');

/* ---- difficulty is a ladder, not a single knob ---- */
const S = Bots.SKILLS, ids = Bots.SKILL_IDS;
ok(ids.join(',') === 'recruit,regular,veteran,extreme', 'four rungs in order [' + ids.join(',') + ']');
for (let i = 1; i < ids.length; i++) {
  const a = S[ids[i - 1]], b = S[ids[i]];
  ok(b.react < a.react, ids[i] + ' reacts faster than ' + ids[i - 1] + ' [' + b.react + ' < ' + a.react + ']');
  ok(b.aimErr < a.aimErr, ids[i] + ' aims tighter than ' + ids[i - 1]);
  ok(b.range >= a.range, ids[i] + ' sees at least as far as ' + ids[i - 1]);
}
ok(S.extreme.react <= 150, 'Extreme reacts inside 150ms — it is meant to be a wall to practise against');

/* ---- three must survive a production install ---- */
const pkg = require('../package.json');
ok(!!pkg.dependencies.three,
  'three is a RUNTIME dependency — bots build colliders at run time, and ' +
  '`npm install --production` skips devDependencies');
ok(!(pkg.devDependencies || {}).three, 'three is not left duplicated in devDependencies');

/* ---- BOT SETTINGS MUST NOT LEAK INTO OTHER MODES ----

   `botCount` is a room setting and it persists when the mode changes. A host
   who configured Training with six bots and then switched to 5 vs 5 got six
   bots injected into their team match. Confirmed live, not theorised.

   The guard is on the MODE rather than on the count, because the count is
   remembered deliberately — flipping back to Training should restore the
   host's choice instead of silently resetting it. */
ok(/\(CFG\.MODES\[room\.settings\.mode\] \|\| \{\}\)\.practice\) return/.test(srv),
  'addBots refuses to run outside a practice mode');
/* Strip comments before checking ORDER — the explanation above the guard
   mentions botCount, and matching prose would make this assert nothing. */
const srvCode = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const addIdx = srvCode.indexOf('function addBots');
const guardIdx = srvCode.indexOf('.practice) return', addIdx);
const countIdx = srvCode.indexOf('room.settings.botCount', addIdx);
ok(guardIdx > -1 && countIdx > -1 && guardIdx < countIdx,
  'the mode guard runs BEFORE botCount is even read');
ok(/function tick[\s\S]{0,240}\.practice\) return/.test(srv),
  'the bot tick also bails immediately for non-practice rooms');
Object.keys(CFG.MODES).forEach(m => {
  const practice = !!CFG.MODES[m].practice;
  ok(practice === (CFG.MODES[m].cat === 'practice'),
    'mode ' + m + ': the practice flag and the practice category agree');
});

/* ---- the mode itself ---- */
ok(CFG.MODES.bots && CFG.MODES.bots.cat === 'practice', 'Training mode is registered in its own category');
ok(CFG.MODES.bots.teams === false, 'Training is free-for-all shaped: every bot is hostile');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
