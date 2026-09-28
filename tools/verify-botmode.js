/* ============================================================================
   VERIFY-BOTMODE (v14.0) — the separated system's own gate.

   Four families of assertion, matching how the wall was built:

   1. THE FENCE — three modes exist, flagged botmode+vsBots, locked to
      Blacksite, in a category ALL_MODE_CATS does not contain (so the
      multiplayer picker cannot list them, armed or not), and NOT hidden
      (hidden bot-fielding modes are refused at create since v13 — these are
      product and must seat rooms).
   2. THE POOL WALLS, both directions — every bot-mode loadout weapon carries
      pool:'botmode'; the legacy engine's loadout table names zero of them;
      no multiplayer weapon wears the tag.
   3. DIFFICULTY IS INTELLIGENCE — the brief's rule as arithmetic: reaction
      falls, aim tightens, detection grows, cover rises across
      easy→medium→hard→hardplus, while dmgMul is pinned at exactly 1.0 and
      moveMul never exceeds 1.0. Hard is a smarter opponent, never a
      stronger one, and this gate is what keeps that sentence true.
   4. THE BATTLE LADDER, pure — stageFor() is arithmetic precisely so 5-10-
      15-20 with rising tiers is provable without waiting fifteen minutes.

   Plus the seams as source text: the engine's _bmSkill hook, the tick's
   botmode admission, addBots' explicit-options path, the server's
   start/end/teardown wiring, and the loot walls — a driver nobody calls is
   a driver, and these asserts are what notice the unplugging.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };

const CFG = require('../public/src/config/index.js');
const BotMode = require('../server/lib/botmode.js')({ CFG, io: null, now: Date.now, Bots: null });

console.log('--- 1. the fence ---');
{
  const bm = ['bm_solo', 'bm_team', 'bm_battle'];
  ok(bm.every(m => CFG.MODES[m]), 'the three bot modes exist');
  ok(bm.every(m => CFG.MODES[m].botmode && CFG.MODES[m].vsBots),
    'each is flagged botmode (the driver key) and vsBots (side dealing + legacy accounting)');
  ok(bm.every(m => CFG.MODES[m].mapLock === 'blacksite'),
    'each locks to Blacksite — the v12 coercion machinery drags the room there');
  ok(bm.every(m => !CFG.MODES[m].hidden),
    'none is hidden — hidden bot-fielding modes are refused at create, and these are product');
  ok(CFG.ALL_MODE_CATS.indexOf('botmode') === -1,
    'the botmode category is absent from ALL_MODE_CATS: the multiplayer picker cannot list it');
  ok(bm.every(m => CFG.humanSideOf(m) === 'a' && CFG.botSideOf(m) === 'b'),
    'humans deal to side a, machines to side b — inherited from the v9.2 rule via vsBots');
  const map = CFG.MAPS.blacksite;
  ok(!!map && map.botOnly === true && map.ready === true,
    'Blacksite exists, ready, and is botOnly — the server refuses it to every other mode');
  ok(map.maxPlayers >= 24,
    'Blacksite seats BATTLE\'s ceiling: 20 machines plus a human team [' + map.maxPlayers + ']');
  ok(CFG.MATCH.timeOptions.length === 1 && CFG.MATCH.timeOptions[0] === 15 && CFG.BOTMODE.MINUTES === 15,
    'fifteen minutes is the only duration, globally and in the namespace');
}

console.log('--- 2. the pool walls, both directions ---');
{
  const pool = Object.keys(CFG.WEAPONS).filter(k => CFG.WEAPONS[k].pool === 'botmode');
  ok(pool.length >= 5, 'the bot-mode pool exists in CFG.WEAPONS [' + pool.join(', ') + ']');
  ok(pool.every(k => k.indexOf('bm_') === 0),
    'every pooled weapon wears the bm_ prefix — collision with a multiplayer id is impossible by naming');
  const lo = CFG.BOTMODE.LOADOUTS;
  ok(lo.length >= 3 && lo.every(l => CFG.WEAPONS[l.w] && CFG.WEAPONS[l.w].pool === 'botmode'
      && CFG.WEAPONS[l.w2] && CFG.WEAPONS[l.w2].pool === 'botmode'),
    'every bot-mode loadout draws BOTH slots from the pool, nothing else');
  /* the other direction: the legacy table and the multiplayer guns */
  const botsSrc = fs.readFileSync(path.join(__dirname, '..', 'server/lib/bots.js'), 'utf8');
  ok(!/LOADOUTS = \[[\s\S]*?bm_[\s\S]*?\];/.test(botsSrc.slice(botsSrc.indexOf('LOADOUTS = ['), botsSrc.indexOf('];', botsSrc.indexOf('LOADOUTS = [')))),
    'the LEGACY loadout table names zero bm_ weapons');
  const mpTagged = Object.keys(CFG.WEAPONS).filter(k => k.indexOf('bm_') !== 0 && CFG.WEAPONS[k].pool === 'botmode');
  ok(mpTagged.length === 0, 'no multiplayer weapon wears the botmode tag [' + mpTagged.join(', ') + ']');
}

console.log('--- 3. difficulty is intelligence, never stats ---');
{
  const P = BotMode.PROFILES;
  const order = ['easy', 'medium', 'hard', 'hardplus'];
  ok(order.every(k => P[k]), 'all four profiles exist (hardplus is the wave director\'s alone)');
  const dec = f => order.every((k, i) => i === 0 || P[k][f] < P[order[i - 1]][f]);
  const inc = f => order.every((k, i) => i === 0 || P[k][f] > P[order[i - 1]][f]);
  const nondec = f => order.every((k, i) => i === 0 || P[k][f] >= P[order[i - 1]][f]);
  ok(dec('react'), 'reaction time strictly FALLS up the ladder [' + order.map(k => P[k].react).join(' > ') + ' ms]');
  ok(dec('aimErr'), 'aim scatter strictly TIGHTENS [' + order.map(k => P[k].aimErr).join(' > ') + ']');
  ok(inc('range'), 'detection/engagement range strictly GROWS [' + order.map(k => P[k].range).join(' < ') + ' m]');
  ok(nondec('coverPct') && nondec('sprintPct') && nondec('nadePct'),
    'cover, sprint repositioning and grenade use never regress up the ladder');
  ok(order.every(k => P[k].dmgMul === 1.0),
    'dmgMul is EXACTLY 1.0 at every tier — hard is smarter, never stronger, by pinned rule');
  ok(order.every(k => P[k].moveMul <= 1.0),
    'moveMul never exceeds 1.0 — no superhuman legs at any tier');
}

console.log('--- 4. the battle ladder, as arithmetic ---');
{
  const s = BotMode.stageFor;
  const w = CFG.BOTMODE.WAVES;
  ok(w.length === 4 && w.map(x => x.count).join(',') === '5,10,15,20',
    'the ladder is 5-10-15-20, the brief\'s numbers verbatim');
  ok(w.every((x, i) => i === 0 || x.at > w[i - 1].at) && w[w.length - 1].at < 15 * 60,
    'stages are strictly later and the last lands inside the 15-minute match [' + w.map(x => x.at).join('s, ') + 's]');
  ok(s(0).count === 5 && s(w[1].at - 1).count === 5, 'stage 1 holds five hostiles until the second wave');
  ok(s(w[1].at).count === 10 && s(w[2].at).count === 15 && s(w[3].at).count === 20,
    'each boundary lifts the active count exactly on time');
  ok(s(899).count === 20 && s(899).diff === 'hardplus',
    'the final minute is twenty machines at the top tier');
  const tiers = ['easy', 'medium', 'hard', 'hardplus'];
  ok(w.every((x, i) => x.diff === tiers[i]),
    'difficulty climbs a tier with every wave — pressure, not just population');
}

console.log('--- 4b. the loot wall, exercised against the REAL loot module ---');
{
  const initLoot = require('../server/lib/loot.js');
  const pts = [];
  for (let i = 0; i < 300; i++) pts.push([0, 0.55, 0, i % 3 === 0 ? 's' : (i % 3 === 1 ? 'h' : 'g')]);
  const L = initLoot({ io: { to: () => ({ emit: () => {} }) }, now: () => Date.now(), mapData: () => ({ LOOT_POINTS: pts }) });
  function rollWeapons(mode) {
    const room = { code: 'X', players: new Map(), settings: { mode: mode } };
    const seen = new Set();
    for (let run = 0; run < 20; run++) {
      L.initPickups(room);
      room.pickups.forEach(pk => {
        const it = CFG.LOOT_ITEMS[pk.t];
        if (it && it.kind === 'weapon') seen.add(pk.t);
      });
    }
    return [...seen];
  }
  const bm = rollWeapons('bm_solo');
  ok(bm.length >= 3 && bm.every(t => t.indexOf('wpn_bm_') === 0),
    'a bot-mode room rolls ONLY pool weapons across 20 floors [' + bm.join(', ') + ']');
  const mp = rollWeapons('ffa');
  ok(mp.length >= 3 && mp.every(t => t.indexOf('wpn_bm_') !== 0),
    'a multiplayer room rolls ZERO pool weapons across 20 floors [' + mp.length + ' kinds, none bm]');
}

console.log('--- 5. the seams, as source ---');
{
  const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const bots = R('server/lib/bots.js'), srv = R('server.js'), loot = R('server/lib/loot.js');
  ok(bots.indexOf('room._bmSkill') !== -1, 'the engine reads room._bmSkill — one skill seam, two products');
  ok(/botmode\)\) return;\s*\/\* v14\.0/.test(bots) || bots.indexOf('botmode rooms tick regardless') !== -1,
    'the tick admits botmode rooms regardless of the legacy switch');
  ok(bots.indexOf('opts.loadouts || LOADOUTS') !== -1, 'addBots takes explicit loadouts — the driver hands it the pool');
  ok(srv.indexOf('BotMode.onMatchStart(room)') !== -1 && srv.indexOf('BotMode.onMatchEnd(room)') !== -1,
    'the server wires match start and end into the driver');
  ok(srv.indexOf('room.bmTimer') !== -1 && /destroyRoomIfEmpty[\s\S]{0,600}bmTimer/.test(srv),
    'the wave timer dies in the room teardown — the v13.1 rule holds for the new clock');
  ok(srv.indexOf("room.settings.bmDiff = s.bmDiff") !== -1,
    'the lobby difficulty setting is clamped server-side to easy/medium/hard');
  ok((loot.match(/pool === 'botmode'/g) || []).length >= 2,
    'both loot doors (ground rolls and airdrops) filter by the pool tag');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
