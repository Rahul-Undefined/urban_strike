/* verify-v29 — the v2.9 gameplay rules. Part A is MODULE-level (no server):
   the hunter, the loot grants, the damage pipeline, each driven with a fake
   room so every branch is deterministic. Part B is LIVE against a running
   server (npm start): prone damage, the vest, the helmet across a death,
   the kick, and a returning operator's side.

   Run: node tools/verify-v29.js        (server on :3000 for part B)
        node tools/verify-v29.js --offline   (part A only) */
'use strict';
const CFG = require('../public/src/config/index.js');
const OFFLINE = process.argv.includes('--offline');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- fake io / room ---------------- */
function fakeIo(log) {
  const to = () => ({ emit: (ev, d) => log.push([ev, d]) });
  return { to, emit: (ev, d) => log.push([ev, d]) };
}
function player(id, team, x, z) {
  return { id, name: id, team, alive: true, connected: true, pos: [x, 0.95, z], hp: 100, armorLvl: 0, armorDur: 0,
           helmLvl: 0, helmDur: 0, helmStops: 0, shieldHp: 0, shieldLvl: 0, kills: 0, deaths: 0, assists: 0, damage: 0,
           streak: 0, rd: {}, att: {}, exW: {}, lastShotAt: {}, history: [], protUntil: 0, hunters: 1 };
}

console.log('--- A1. config ---');
ok(CFG.MOVE.walk === 5.0 && CFG.MOVE.sprint === 7.6, 'walk 5.0, sprint 7.6');
ok(CFG.GEAR.adrenaline.mult === 1.22 && CFG.MOVE.sprint * CFG.GEAR.adrenaline.mult > 6.7 * 1.30, 'adrenaline still out-runs the old adrenaline [' + (CFG.MOVE.sprint * CFG.GEAR.adrenaline.mult).toFixed(2) + ' m/s]');
ok([1, 2, 3].every(l => CFG.ARMOR[l].absorb === 1.0), 'every vest absorbs 100% until spent');
ok([1, 2, 3].every(l => CFG.HELMET[l].sniperStops === l), 'H1/H2/H3 stop 1/2/3 sniper rounds');
ok(CFG.GEAR.shield.sniperHits === 2 && CFG.GEAR.shield2.sniperHits === 5 && CFG.GEAR.shield2.hp > CFG.GEAR.shield.hp,
  'shield L1 takes 2 sniper rounds, L2 takes 5 and has more hp');
ok(CFG.GEAR.shield.speed < 1 && CFG.GEAR.shield2.speed < CFG.GEAR.shield.speed, 'both shields slow, L2 slower');
ok(CFG.LOOT_ITEMS.shield2 && CFG.LOOT_ITEMS.shield2.drop && CFG.AIRDROP.exoticPool.indexOf('shield2') >= 0, 'L2 shield is crate-only and in the crate pool');
ok(CFG.LOOT_ITEMS.visor2 && CFG.LOOT_ITEMS.visor2.drop && CFG.AIRDROP.exoticPool.indexOf('visor2') >= 0, 'L2 visor is crate-only and in the crate pool');
ok(!CFG.lootAllowed('ffa', 'killhouse', 'visor2') && CFG.lootAllowed('ffa', 'kasbah', 'visor2'), 'L2 visor never in a Killhouse crate');
ok(CFG.MOVE.proneDmg === 0.5 && CFG.MOVE.proneRange === 0.5 && CFG.MOVE.proneFog > 1, 'prone: half damage, half range, closer fog');
const H = CFG.GEAR.hunter;
ok(H.lifeSec === 20 && H.oneShot && H.ghost && H.speed > CFG.GEAR.drone.hunt && H.speed > CFG.GEAR.drone.dive, 'hunter: 20 s, one-shot, through walls, faster than the strike drone hunts or dives [' + H.speed + ' vs ' + CFG.GEAR.drone.hunt + '/' + CFG.GEAR.drone.dive + ']');

console.log('--- A2. the damage pipeline (combat.js) ---');
{
  const log = [];
  const rooms = new Map();
  const Combat = require('../server/lib/combat.js')({ io: fakeIo(log), rooms, now: Date.now,
    modeInfo: () => ({ teams: false }), endMatch() {}, pushLobby() {}, lastStandOnLeave() {}, onKill() {} });
  const apply = Combat.applyDamage || Combat;
  const room = { code: 'X', settings: { mode: 'ffa', map: 'urban' }, players: new Map(), teamKills: null };
  const A = player('A', null, 0, 0), V = player('V', null, 5, 0);
  room.players.set('A', A); room.players.set('V', V);
  /* vest: full absorption until spent */
  V.armorLvl = 2; V.armorDur = CFG.ARMOR[2].dur;
  apply(room, V, 50, 'A', 'ak47', false, false);
  ok(V.hp === 100 && V.armorDur === CFG.ARMOR[2].dur - 50, 'a vest takes the whole AK round while it has durability [hp ' + V.hp + ', du ' + V.armorDur + ']');
  apply(room, V, 50, 'A', 'ak47', false, false);
  ok(V.armorLvl === 0 && V.hp === 100 - (100 - CFG.ARMOR[2].dur), 'the round that empties it carries only the overflow to health [hp ' + V.hp + ']');
  /* helmet: sniper headshots stopped H-level times */
  V.hp = 100; V.helmLvl = 2; V.helmDur = CFG.HELMET[2].dur; V.helmStops = 2;
  apply(room, V, 200, 'A', 'sniper', true, false);
  ok(V.hp === 100 && V.helmStops === 1 && V.helmLvl === 2, 'H2: the first sniper headshot is stopped dead');
  apply(room, V, 200, 'A', 'sniper', true, false);
  ok(V.hp === 100 && V.helmStops === 0 && V.helmLvl === 0, 'H2: the second is stopped and the helmet breaks');
  apply(room, V, 200, 'A', 'sniper', true, false);
  ok(!V.alive || V.hp <= 0, 'the third, with no helmet, kills');
  /* shield L1: 2 sniper rounds; L2: 5 */
  for (const [lv, N] of [[1, 2], [2, 5]]) {
    const W = player('W' + lv, null, 6, 0); room.players.set(W.id, W);
    W.shieldLvl = lv; W.shieldHp = (lv === 2 ? CFG.GEAR.shield2 : CFG.GEAR.shield).hp;
    for (let i = 1; i < N; i++) apply(room, W, 100, 'A', 'sniper', false, false);
    ok(W.shieldHp > 0 && W.hp === 100, 'shield L' + lv + ': ' + (N - 1) + ' sniper round(s) absorbed whole, it still stands');
    apply(room, W, 100, 'A', 'sniper', false, false);
    ok(W.shieldHp === 0 && W.shieldLvl === 0 && W.hp === 50, 'shield L' + lv + ': round ' + N + ' breaks it and half lands [hp ' + W.hp + ']');
  }
  /* prone: half damage, falloff from half range */
  const stand = Combat.weaponServerDamage('ak47', 'body', 1, 10, false), prone = Combat.weaponServerDamage('ak47', 'body', 1, 10, true);
  ok(stand === 50 && prone === 25, 'prone AK round at 10 m: 25, standing 50 [' + prone + ' / ' + stand + ']');
  const farS = Combat.weaponServerDamage('ak47', 'body', 1, 40, false), farP = Combat.weaponServerDamage('ak47', 'body', 1, 40, true);
  ok(farS === 50 && farP < 25, 'at 40 m a prone round is already falling off (half range) [' + farP.toFixed(1) + ']');
  ok(Combat.weaponServerDamage('knife', 'body', 1, 1, true) === CFG.WEAPONS.knife.dmg, 'the knife is not a gun — prone does not halve it');
}

console.log('--- A3. the hunter (drones.js) ---');
{
  const log = [], dmgLog = [];
  let T = 1e6;
  const Drones = require('../server/lib/drones.js')({ io: fakeIo(log), now: () => T, CFG, modeInfo: () => ({ teams: false }),
    applyDamage: (room, v, dmg, by, w, head, pb) => { dmgLog.push({ v: v.id, dmg, w, pb }); if (pb) { v.hp = 0; v.alive = false; } },
    colliders: () => [[-1000, -10, -1000, 1000, 1000, 1000]], segmentBlocked: () => true,   /* EVERYTHING blocks sight */
    onDroneBounty() {} });
  const room = { code: 'H', settings: { mode: 'ffa', map: 'urban' }, players: new Map() };
  const O = player('O', null, 0, 0), E1 = player('E1', null, 220, 0), E2 = player('E2', null, -180, 40);
  [O, E1, E2].forEach(p => room.players.set(p.id, p));
  const r = Drones.launch(room, O, 'hunter');
  ok(r && r.ok, 'the hunter launches');
  const t0 = T;
  for (let i = 0; i < 20 * 15 && (E1.alive || E2.alive); i++) { T += 66; Drones.tick(room, 0.066); }
  ok(!E1.alive && !E2.alive, 'it killed BOTH enemies — 220 m and 180 m away, with every line of sight blocked [' + ((T - t0) / 1000).toFixed(1) + ' s]');
  ok(dmgLog.length === 2 && dmgLog.every(x => x.pb && x.w === 'hunter'), 'one shot each, applied as a kill that skips shield / helmet / vest');
  for (let i = 0; i < 25 * 15; i++) { T += 66; Drones.tick(room, 0.066); }
  ok(!(room.drones || []).some(d => d.kind === 'hunter'), 'and it is gone after its 20 s');
}

console.log('--- A4. pickups (loot.js) ---');
{
  const log = [];
  let T = 5e6;
  const Loot = require('../server/lib/loot.js')({ io: fakeIo(log), now: () => T, mapData: () => ({ LOOT_POINTS: [], AIRDROP_POINTS: [] }), CFG });
  const room = { code: 'L', settings: { mode: 'ffa', map: 'urban' }, players: new Map(), pickups: [] };
  const P = player('P', null, 0, 0); room.players.set('P', P);
  let id = 1;
  const drop = t => room.pickups.push({ id: id++, t, pos: [0, 0.95, 0], active: true });
  const grants = () => log.filter(e => e[0] === 'grant').map(e => e[1]);
  drop('adrenaline'); Loot.tryCollect(room, P);
  const g = grants().pop();
  ok(g && g.g === 'adrenaline' && g.auto === 1 && P.adrenalineUntil > T, 'adrenaline starts the moment it is picked up [' + JSON.stringify(g) + ']');
  const until1 = P.adrenalineUntil; T += 5000;
  drop('adrenaline'); Loot.tryCollect(room, P);
  ok(P.adrenalineUntil > until1, 'a second one while it runs extends it');
  drop('helm_2'); Loot.tryCollect(room, P);
  ok(P.helmLvl === 2 && P.helmStops === 2 && grants().some(x => x.t === 'helm' && x.l === 2), 'an H2 is worn with 2 sniper stops and the client is told');
  P.helmLvl = 0; P.helmStops = 0; P.helmDur = 0;   // what spawnPlayer does now
  drop('helm_1'); Loot.tryCollect(room, P);
  ok(P.helmLvl === 1, 'after a death a LOWER helmet is picked up again (the "helmet pick nahi hota" bug)');
  drop('shield2'); Loot.tryCollect(room, P);
  ok(P.shieldLvl === 2 && P.shieldHp === CFG.GEAR.shield2.hp, 'the L2 shield is worn at its own hp');
  drop('visor2'); Loot.tryCollect(room, P);
  ok(P.visor2 === true && grants().some(x => x.g === 'visor2'), 'the L2 visor is granted');
  const v = log.filter(e => e[0] === 'vitals').pop();
  ok(v && v[1].hl === 1 && v[1].shl === 2, 'vitals carry the helmet and the shield level for the HUD');
}

if (OFFLINE) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

/* ---------------- B. LIVE ---------------- */
const io = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
function client() { return io(URL, { transports: ['websocket'], forceNew: true }); }
function connect(s) { return new Promise(r => s.on('connect', r)); }
function emitAck(s, ev, d) { return new Promise(r => s.emit(ev, d, r)); }

(async function live() {
  console.log('--- B1. prone shooter, live ---');
  {
    const A = client(), B = client(); await Promise.all([connect(A), connect(B)]);
    const spawns = { A: [], B: [] }, dmgB = [];
    A.on('spawn', d => { if (d.id === A.id) spawns.A.push(d); });
    B.on('spawn', d => { if (d.id === B.id) spawns.B.push(d); });
    B.on('damaged', d => dmgB.push(d));
    const res = await emitAck(A, 'createRoom', { name: 'PA', settings: { backfill: false, minutes: 10, killTarget: 0, map: 'urban' } });
    await emitAck(B, 'joinRoom', { name: 'PB', code: res.code });
    A.emit('setReady', { v: true }); B.emit('setReady', { v: true }); await wait(300); A.emit('startMatch');
    for (let i = 0; i < 80 && !(spawns.A.length && spawns.B.length); i++) await wait(100);
    const bp = spawns.B[0].pos.slice(), ap = spawns.A[0].pos.slice();
    let cr = 0;
    const ha = setInterval(() => A.emit('st', { p: ap, ry: 0, rx: 0, cr, mv: 0, ln: 0, wp: 0, ping: 20 }), 50);
    const hb = setInterval(() => B.emit('st', { p: bp, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }), 50);
    await wait((CFG.spawnProtectFor('urban') + 0.6) * 1000);
    const dist = Math.hypot(ap[0] - bp[0], ap[2] - bp[2]);
    A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bp }); await wait(400);
    const standDmg = dmgB.length ? dmgB[dmgB.length - 1].dmg : -1;
    cr = 2; await wait(300);
    A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bp }); await wait(400);
    const proneDmg = dmgB.length > 1 ? dmgB[dmgB.length - 1].dmg : -1;
    ok(standDmg > 0 && proneDmg > 0 && proneDmg <= Math.ceil(standDmg / 2), 'a prone shooter deals half or less of the same standing shot [' + proneDmg + ' vs ' + standDmg + ' at ' + dist.toFixed(0) + ' m]');
    clearInterval(ha); clearInterval(hb); A.disconnect(); B.disconnect();
  }

  console.log('--- B2. host kick, live ---');
  {
    const A = client(), B = client(); await Promise.all([connect(A), connect(B)]);
    let kicked = null, lobby = null;
    B.on('kicked', d => { kicked = d; });
    A.on('lobby', d => { lobby = d; });
    const res = await emitAck(A, 'createRoom', { name: 'Host', settings: { backfill: false } });
    await emitAck(B, 'joinRoom', { name: 'Guest', code: res.code });
    await wait(300);
    const notHost = await emitAck(B, 'kickPlayer', { id: A.id });
    ok(notHost && !notHost.ok, 'a non-host cannot kick');
    const r = await emitAck(A, 'kickPlayer', { id: B.id });
    await wait(300);
    ok(r && r.ok && kicked && kicked.by === 'Host', 'the host removes a player and the player is told who did it');
    ok(lobby && lobby.players.length === 1, 'the staging area is left with the host alone');
    const self = await emitAck(A, 'kickPlayer', { id: A.id });
    ok(self && !self.ok, 'the host cannot kick himself');
    A.disconnect(); B.disconnect();
  }

  console.log('--- B3. a returning operator keeps their side, live ---');
  {
    const names = ['Alfa', 'Bravo', 'Charlie', 'Delta'];
    const S = names.map(() => client()); await Promise.all(S.map(connect));
    let lobby = null; S[0].on('lobby', d => { lobby = d; });
    const res = await emitAck(S[0], 'createRoom', { name: names[0], settings: { backfill: false, mode: 't2' } });
    for (let i = 1; i < 4; i++) await emitAck(S[i], 'joinRoom', { name: names[i], code: res.code });
    await wait(400);
    const sideOf = n => (lobby.players.find(p => p.name === n) || {}).team;
    const before = {}; names.forEach(n => { before[n] = sideOf(n); });
    ok(new Set(Object.values(before)).size === 2, 'four operators on two sides [' + JSON.stringify(before) + ']');
    S[1].disconnect(); await wait(400);
    ok(['Alfa', 'Charlie', 'Delta'].every(n => sideOf(n) === before[n]), 'one leaving the staging area moves NOBODY else');
    let cur = S[1];
    for (let k = 0; k < 3; k++) {
      cur = client(); await connect(cur);
      await emitAck(cur, 'joinRoom', { name: 'Bravo', code: res.code }); await wait(350);
      ok(sideOf('Bravo') === before.Bravo, 'Bravo rejoins (time ' + (k + 1) + ') on his own side [' + sideOf('Bravo') + ']');
      if (k < 2) { cur.disconnect(); await wait(350); }
    }
    S.forEach(s => s.disconnect()); cur.disconnect();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
