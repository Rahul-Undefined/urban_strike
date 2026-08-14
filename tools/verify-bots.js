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
/* v9.2: this asserted the literal line `const feet = y - CFG.PLAYER.standH / 2`.
   The rule it protects is real — the ground slab is a collider like any other,
   and a body test that counts it makes every bot a statue — but the assertion
   was pinned to one expression in one function. The physics layer was rewritten
   for vertical movement and the line moved, so a correct refactor turned it red
   while the actual defect stayed just as detectable. Tested by behaviour now. */
{
  const R = CFG.PLAYER.radius, H = CFG.PLAYER.standH;
  const open = [[-6, 0, -6], [12, 0, 30], [-30, 0, 12]];
  let freeSpots = 0;
  open.forEach(pt => {
    const g = Bots.groundAt(cols, pt[0], pt[2], pt[1] + 0.5, R);
    if (g === null) return;
    if (!Bots.bodyBlocked(cols, pt[0], g, pt[2], R, H)) freeSpots++;
  });
  ok(freeSpots > 0,
    'a bot standing on open ground is not reported as inside the ground slab [' +
    freeSpots + '/' + open.length + ']');

  /* The step limit IS the stair-climbing rule. A surface within MOVE.step of
     the feet must be offered as ground; one above it must not be. */
  const probe = [[0, 0, 0]];
  let stepOk = true;
  probe.forEach(pt => {
    const lowReach = Bots.groundAt([[pt[0] - 2, 0, pt[2] - 2, pt[0] + 2, 0.30, pt[2] + 2]],
      pt[0], pt[2], 0, R);
    const highReach = Bots.groundAt([[pt[0] - 2, 0, pt[2] - 2, pt[0] + 2, 1.40, pt[2] + 2]],
      pt[0], pt[2], 0, R);
    if (lowReach !== 0.30 || highReach !== null) stepOk = false;
  });
  ok(stepOk, 'a 0.30 m rise is walkable ground and a 1.40 m rise is not (MOVE.step ' +
    CFG.MOVE.step + ')');
}
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
/* v9.2: this asserted the LITERAL source text `.practice) return`. Adding a
   second bot-bearing mode family (Strike Team) turned it red for being correct,
   which is the failure mode of a gate that pins an implementation instead of a
   rule. It now checks that the guard calls the shared predicate, and the
   behaviour assertions below check what that predicate actually does. */
ok(/CFG\.botsAllowed\(room\.settings\.mode\)\) return/.test(srv),
  'addBots refuses to run in any mode CFG.botsAllowed rejects');
/* Strip comments before checking ORDER — the explanation above the guard
   mentions botCount, and matching prose would make this assert nothing. */
const srvCode = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const addIdx = srvCode.indexOf('function addBots');
const guardIdx = srvCode.indexOf('CFG.botsAllowed(room.settings.mode)) return', addIdx);
const countIdx = srvCode.indexOf('room.settings.botCount', addIdx);
ok(guardIdx > -1 && countIdx > -1 && guardIdx < countIdx,
  'the mode guard runs BEFORE botCount is even read');
ok(/function tick[\s\S]{0,300}CFG\.botsAllowed\(room\.settings\.mode\)\) return/.test(srv),
  'the bot tick also bails immediately for rooms with no bots');
Object.keys(CFG.MODES).forEach(m => {
  const practice = !!CFG.MODES[m].practice;
  ok(practice === (CFG.MODES[m].cat === 'practice'),
    'mode ' + m + ': the practice flag and the practice category agree');
  ok(!!CFG.MODES[m].vsBots === (CFG.MODES[m].cat === 'coop'),
    'mode ' + m + ': the vsBots flag and the coop category agree');
  ok(CFG.botsAllowed(m) === !!(CFG.MODES[m].practice || CFG.MODES[m].vsBots),
    'mode ' + m + ': botsAllowed matches the flags exactly');
});
/* The two bot families must not blur into each other. Overrun is a free-for-all
   range; Strike Team is a team match. If either ever inherited the other's
   shape, bots would either shoot each other or refuse to shoot the player. */
ok(CFG.MODES.bots.teams === false && !CFG.MODES.bots.vsBots,
  'Overrun stays free-for-all shaped and is not a vsBots mode');
['co1', 'co2', 'co3', 'co4', 'co6', 'co10'].forEach(m => {
  ok(CFG.MODES[m] && CFG.MODES[m].teams === true && CFG.MODES[m].teamCount === 2,
    m + ': Strike Team is a two-sided team mode');
  ok(!CFG.MODES[m].practice, m + ': Strike Team is NOT flagged practice');
  ok(CFG.humanSideOf(m) === 'a' && CFG.botSideOf(m) === 'b',
    m + ': humans take side a, bots take side b');
});
[1, 2, 3, 4, 6, 10].forEach(n => {
  const id = 'co' + n;
  ok(CFG.MODES[id] && CFG.MODES[id].maxPlayers === n,
    id + ': room caps at ' + n + ' human operators');
});
CFG.MODE_CATS.forEach(c => {
  ok(CFG.modesInCat(c.id).length > 0, 'category ' + c.id + ' has at least one mode');
});
ok(CFG.MODE_CATS.some(c => c.id === 'coop'), 'Strike Team appears in the mode picker');

/* ---- v9.2 capability: a bot has to be able to do what a player can ---- */
const bsrc = srv;
ok(/function groundAt\(/.test(bsrc) && /function bodyBlocked\(/.test(bsrc),
  'bots resolve a ground height and a body volume, not a flat plane');
ok(/bot\.pos\[1\] = /.test(bsrc),
  'bots actually assign their own Y — the v8.38 defect that pinned them to the street');
ok(/function applyGravity\(/.test(bsrc), 'bots fall under gravity');
ok(/CFG\.MOVE\.sprint/.test(bsrc), 'bots can sprint');
ok(/CFG\.MOVE\.crouch/.test(bsrc) && /CFG\.MOVE\.prone/.test(bsrc),
  'bots move at crouch and prone speeds');
ok(/function choosePosture\(/.test(bsrc), 'bots choose a stance');
ok(/function throwFrag\(/.test(bsrc), 'bots throw frags');
ok(/botPlaceMine/.test(bsrc), 'bots place mines');
ok(Bots.LOADOUTS && Bots.LOADOUTS.length >= 8,
  'bots draw from a loadout table rather than one hardcoded rifle [' +
  (Bots.LOADOUTS || []).length + ']');
Bots.LOADOUTS.forEach(l => {
  ok(!!CFG.WEAPONS[l.w], 'loadout weapon ' + l.w + ' exists in the weapon table');
  ok(CFG.WEAPON_ORDER.indexOf(l.w) >= 0,
    'loadout weapon ' + l.w + ' has a WEAPON_ORDER index the client can render');
});
['recruit', 'regular', 'veteran', 'extreme'].forEach(k => {
  const S = Bots.SKILLS[k];
  ['crouchPct', 'pronePct', 'sprintPct', 'nadePct', 'minePct', 'verticality'].forEach(f => {
    ok(typeof S[f] === 'number' && S[f] >= 0 && S[f] <= 1,
      k + '.' + f + ' is a probability');
  });
});

/* ---- the mode itself ---- */
ok(CFG.MODES.bots && CFG.MODES.bots.cat === 'practice', 'Training mode is registered in its own category');
ok(CFG.MODES.bots.teams === false, 'Training is free-for-all shaped: every bot is hostile');

/* ---- v9.2 BEHAVIOURAL PROBE ----------------------------------------------

   Every assertion above reads source or config. None of them would have caught
   the four defects that actually shipped in the first cut of this pass, all of
   which were only visible by RUNNING the AI:

     1. pos[1] is the capsule CENTRE, not the feet. Physics written against
        feet buried every bot 0.9 m in the ground and no bot could climb.
     2. The body test counted the next stair tread as a wall, so a staircase
        was solid. Plans were built, bots walked to the foot of the stairs and
        stood there.
     3. Waypoint acceptance at 1.8 m let a bot tick off the next flight while
        still on the previous one, cut the corner, and fall off the side.
     4. Stuck detection compared per-tick movement to per-tick speed, so a bot
        oscillating between two points 7 cm apart read as moving every frame
        and never tripped. One sat frozen for thirty seconds at stuckFor 0.0.

   So this drives the real tick against real Metro geometry and asserts on what
   the bots DID. It is slower than the rest of this file put together and it is
   the only part that could have failed on any of the above. */
{
  let T = 0;
  const md = { SPAWNS: CFG.MAPS_METRO.SPAWNS, LOOT_POINTS: CFG.MAPS_METRO.LOOT_POINTS };
  const thrown = [];
  let mineCalls = 0;
  const P = require(path.join(__dirname, '..', 'server', 'lib', 'bots.js'))({
    io: { to: () => ({ emit: (ev, d) => { if (ev === 'throw') thrown.push(d); } }) },
    now: () => T,
    mapData: () => md,
    spawnPlayer: (r, p) => {
      const sp = md.SPAWNS[(Math.random() * md.SPAWNS.length) | 0];
      p.pos = [sp[0], 0.95, sp[1]]; p.alive = true; p.hp = 100;
    },
    pushLobby: () => {}, endMatch: () => {},
    modeInfo: () => ({ teams: true }),
    botShoot: () => {}, botExplode: () => {},
    botPlaceMine: (r, b) => { mineCalls++; b.mines--; return { ok: true }; }
  });
  /* v9.4: the probe runs on EXTREME, not veteran. Difficulty now selects a
     behaviour generation — a recruit is pinned to the street by design — so a
     mid-rung probe was measuring a tier whose climbing is deliberately
     occasional, and it flaked between 4.5 m and 2.85 m run to run. The tier
     that is REQUIRED to climb is the one worth asserting on, and the recruit
     contract is asserted separately below. */
  const room = { code: 'PROBE', state: 'playing', players: new Map(),
    settings: { mode: 'co4', map: 'metro', botCount: 12, botSkill: 'extreme' } };
  room.players.set('H1', { id: 'H1', name: 'HUMAN', bot: false, connected: true, team: 'a',
    joinOrder: 0, alive: true, hp: 100, pos: [0, 0.95, 0], ry: 0, rx: 0, crouch: 0,
    mv: 0, wp: 0, ln: 0, protUntil: 0, out: false, armorLvl: 0, armorDur: 0 });
  P.addBots(room);

  const weapons = new Set(), sides = new Set();
  for (const b of room.players.values()) {
    if (!b.bot) continue;
    weapons.add(CFG.WEAPON_ORDER[b.wp]); sides.add(b.team);
    b.alive = false; b.respawnAt = 0;
  }
  ok(sides.size === 1 && sides.has('b'), 'every Strike Team bot is on the machine side');
  ok(weapons.size >= 3,
    'bots carry a spread of weapons, not one rifle [' + weapons.size + ' distinct]');

  const startY = {}, maxY = {}, stances = new Set(), gaits = new Set();
  const dt = 1 / 30;
  for (let i = 0; i < 60 * 30; i++) {
    T += dt * 1000;
    const H = room.players.get('H1');
    H.pos[0] = Math.sin(T / 9000) * 40; H.pos[2] = Math.cos(T / 7000) * 40;
    P.tick(room, dt);
    for (const b of room.players.values()) {
      if (!b.bot || !b.alive) continue;
      if (startY[b.id] === undefined) startY[b.id] = b.pos[1];
      maxY[b.id] = Math.max(maxY[b.id] === undefined ? -99 : maxY[b.id], b.pos[1]);
      stances.add(b.crouch); gaits.add(b.mv);
    }
  }
  const climbed = Object.keys(maxY).filter(k => maxY[k] - (startY[k] || 0) > 1.0).length;
  const peak = Math.max(...Object.values(maxY));

  ok(climbed >= 1,
    'bots leave the street: ' + climbed + ' of ' + Object.keys(maxY).length +
    ' gained more than a metre of height in 60 s');
  ok(peak > 3.0, 'a bot reached an upper floor or roof [peak y ' + peak.toFixed(2) + ']');
  ok(stances.has(0) && stances.has(1), 'bots stand and crouch [' + [...stances].sort().join(',') + ']');
  ok(gaits.has(1) && gaits.has(2), 'bots walk and sprint [' + [...gaits].sort().join(',') + ']');
  ok(thrown.length > 0, 'bots threw ' + thrown.length + ' frag(s)');
  ok(thrown.every(d => d.type === 'frag' && d.o && d.v && d.o.every(isFinite) && d.v.every(isFinite)),
    'every thrown frag carries a finite origin and velocity the client can render');
  ok(mineCalls > 0, 'bots placed ' + mineCalls + ' mine(s)');

  /* ---- v9.4 THE DIFFICULTY LADDER IS A CONTRACT ----
     Rahul asked for the bottom rung to behave like v9.0 — street level, one
     rifle, fights what comes to it — and the top rung to play like a person.
     Those are opposite behaviours from one code path, so both ends are pinned
     here: a change that makes recruits climb is as much a regression as one
     that stops extremes climbing. */
  {
    const R = Bots.SKILLS.recruit, X = Bots.SKILLS.extreme;
    ok(R.groundOnly === true, 'a recruit is ground-only — the v9.0 behaviour');
    ok(!X.groundOnly, 'an extreme is not ground-only');
    ok(R.oneWeapon === 'ak47', 'a recruit carries the single rifle v8.38 hardcoded');
    ok(!X.oneWeapon, 'an extreme draws from the whole loadout table');
    ok(typeof R.leash === 'number' && R.leash < 50,
      'a recruit is leashed near where it stands [' + R.leash + 'm]');
    ok(!X.leash, 'an extreme hunts the whole map');
    ok(X.verticality > R.verticality && X.crouchPct > R.crouchPct &&
       X.sprintPct > R.sprintPct && X.nadePct > R.nadePct,
      'every capability dial rises from recruit to extreme');

    /* And the ground-only rule is BEHAVIOURAL, not just a flag: run a recruit
       lobby and assert nothing left the street. */
    const rRoom = { code: 'PROBE2', state: 'playing', players: new Map(),
      settings: { mode: 'co4', map: 'metro', botCount: 8, botSkill: 'recruit' } };
    rRoom.players.set('H2', { id: 'H2', name: 'H', bot: false, connected: true, team: 'a',
      joinOrder: 0, alive: true, hp: 100, pos: [0, 0.95, 0], ry: 0, rx: 0, crouch: 0,
      mv: 0, wp: 0, ln: 0, protUntil: 0, out: false, armorLvl: 0, armorDur: 0 });
    P.addBots(rRoom);
    const rWeapons = new Set();
    for (const b of rRoom.players.values()) {
      if (!b.bot) continue;
      rWeapons.add(CFG.WEAPON_ORDER[b.wp]); b.alive = false; b.respawnAt = 0;
    }
    ok(rWeapons.size === 1 && rWeapons.has('ak47'),
      'every recruit carries the AK-47 and nothing else [' + [...rWeapons].join(',') + ']');
    let rPeak = -99;
    for (let i = 0; i < 40 * 30; i++) {
      T += dt * 1000;
      const H2 = rRoom.players.get('H2');
      H2.pos[0] = Math.sin(T / 9000) * 30; H2.pos[2] = Math.cos(T / 7000) * 30;
      P.tick(rRoom, dt);
      for (const b of rRoom.players.values()) if (b.bot && b.alive) rPeak = Math.max(rPeak, b.pos[1]);
    }
    ok(rPeak < 3.0, 'no recruit left the street in 40 s [peak y ' + rPeak.toFixed(2) + ']');
  }

  let bad = 0, underground = 0;
  for (const b of room.players.values()) {
    if (!b.bot) continue;
    if (b.pos.some(v => !isFinite(v))) bad++;
    if (b.pos[1] < -8) underground++;
  }
  ok(bad === 0, 'no bot ended with a non-finite position');
  ok(underground === 0, 'no bot fell through the world');
}

/* ---- v9.0 REGRESSION -----------------------------------------------------

   v9.2 changed the bot guard from a literal `.practice` read to
   CFG.botsAllowed, added a second bot-bearing mode family, and rewrote the
   movement layer. Each of those could have quietly broken behaviour that has
   worked since v8.38. These assert the OLD behaviour still holds, by running
   it — not by reading source, because the source is exactly what changed. */
{
  let T2 = 0;
  const md2 = { SPAWNS: CFG.SPAWNS, LOOT_POINTS: CFG.LOOT_POINTS };
  const mk = (mode, count) => ({ code: 'R', state: 'playing', players: new Map(),
    settings: { mode, map: 'urban', botCount: count, botSkill: 'regular' } });
  const make = (teams, onShoot) => require(path.join(__dirname, '..', 'server', 'lib', 'bots.js'))({
    io: { to: () => ({ emit: () => {} }) }, now: () => T2, mapData: () => md2,
    spawnPlayer: (r, p) => {
      const sp = md2.SPAWNS[(Math.random() * md2.SPAWNS.length) | 0];
      p.pos = [sp[0], 0.95, sp[1]]; p.alive = true; p.hp = 100;
    },
    pushLobby: () => {}, endMatch: () => {},
    modeInfo: (r) => ({ teams: teams === undefined ? !!CFG.MODES[r.settings.mode].teams : teams }),
    botShoot: onShoot || (() => {}), botExplode: () => {},
    botPlaceMine: (r, b) => { b.mines--; return { ok: true }; }
  });

  const P2 = make();

  /* Overrun is FREE-FOR-ALL SHAPED. If it ever inherited Strike Team's sides,
     the bots would stop being hostile to each other and the practice range
     would become a team match nobody asked for. */
  const ov = mk('bots', 6); P2.addBots(ov);
  const ovBots = [...ov.players.values()];
  ok(ovBots.length === 6, 'Overrun still spawns the requested bot count [' + ovBots.length + ']');
  ok(ovBots.every(b => b.team === null || b.team === undefined),
    'Overrun bots still take NO side — the mode is free-for-all shaped');

  /* v8.38.1: botCount PERSISTS across a mode change, so a host who set up six
     bots and switched to 5v5 got six bots in their team match. The guard is on
     the mode, and it has to survive the v9.2 rewrite of that guard. */
  ['t2', 't5', 't10', 'sq2', 'sq4', 'ffa', 'ls', 'lsq2', 'lsq4'].forEach(m => {
    const r = mk(m, 6);
    P2.addBots(r);
    ok(r.players.size === 0,
      m + ': a stale botCount of 6 injects ZERO bots (the v8.38.1 leak stays fixed)');
  });

  /* Strike Team with no explicit count matches the squad. */
  const st = mk('co4', 0);
  st.players.set('H', { id: 'H', bot: false, team: 'a', joinOrder: 0, alive: true, pos: [0, 0.95, 0] });
  P2.addBots(st);
  const stBots = [...st.players.values()].filter(p => p.bot);
  ok(stBots.length === 1, 'Strike Team with one operator fields one machine [' + stBots.length + ']');
  ok(stBots.every(b => b.team === 'b'), 'and it is on side B');

  /* removeBots must leave humans alone — it runs on every return to lobby. */
  P2.removeBots(st);
  ok(st.players.size === 1 && !st.players.get('H').bot,
    'removeBots clears the machines and leaves the operator [' + st.players.size + ' left]');

  /* The tick must be a safe no-op in a mode with no bots. A human player has no
     `ai` object at all, so a tick that forgot to bail would dereference it. */
  const t5 = mk('t5', 6);
  t5.players.set('H', { id: 'H', bot: false, team: 'a', joinOrder: 0, alive: true, pos: [0, 0.95, 0] });
  let threw = null;
  try { for (let i = 0; i < 60; i++) { T2 += 33; P2.tick(t5, 1 / 30); } } catch (e) { threw = e.message; }
  ok(threw === null, 'ticking a non-bot room is a safe no-op [' + (threw || 'no throw') + ']');

  /* And Overrun bots really do fight each other, which is the entire point of
     the practice range. */
  let shots = 0;
  const P3 = make(false, () => { shots++; });
  const ffa = mk('bots', 4); P3.addBots(ffa);
  for (const b of ffa.players.values()) { b.alive = true; b.pos = [Math.random() * 8, 0.95, Math.random() * 8]; }
  for (let i = 0; i < 60 * 20; i++) { T2 += 33; P3.tick(ffa, 1 / 30); }
  ok(shots > 0, 'Overrun bots still engage each other [' + shots + ' shots]');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
