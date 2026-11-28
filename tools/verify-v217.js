/* verify-v217 — THE RULES RAHUL SENT BACK AFTER v2.16 (27 Nov).

   "1. when the car is getting hit by the train or anything, only the driver is
       getting killed not the entire team
    2. when car is blasted, driver is pushed out of the car
    3. player cannot throw bombs from inside the car
    4. Only in bot mode, bombs should be 8 at once and 10 mines, hunter drone
       should be active in the mode ("It is broken, just fix it")
    5. Bot mode should be available in killhouse as well
    6. urban big map bot should be 20-25 at a given time, urban small maximum
       12, killhouse 6-8
    8. In train, a similar N option to onboard"            (8 is verify-train's)

   Every section here runs the REAL module. The v2.13 vehicle gate passed for
   four releases with point 2 broken, because its fake applyDamage killed
   whoever it was handed; the real one refuses a team-mate's damage and a
   spawn-protected victim. So: real combat.js, real vehicles.js, real
   hazards.js, real drones.js, real mines.js — on a room made of plain objects.

   A. A wrecked vehicle kills everyone aboard — whoever wrecked it.
   B. A train wrecks the vehicle on its line, with everyone in it.
   C. Grenades from a seat: the keys, and the wiring (the throw itself is run
      in verify-client, where the whole client is loaded).
   D. The Bot Ops kit: 8 frags, 10 mines — Bot Ops only.
   E. The hunter drone launches in Bot Ops and hunts AI operators.
   F. Bot Ops on Killhouse; how many operators each map keeps.

   Run: node tools/verify-v217.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const Bots = require(path.join(ROOT, 'server/lib/bots.js'))({});
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }

/* one fake match with the real modules wired the way server.js wires them */
function match(mode, map) {
  const clock = { t: 5e6 }, ev = [];
  const now = () => clock.t;
  const io = { to: () => ({ emit: (e, d) => ev.push([e, d]) }) };
  const modeInfo = (r) => CFG.MODES[r.settings.mode] || {};
  const room = { code: 'V217', state: 'playing', settings: { mode: mode, map: map || 'urban' }, players: new Map(), teamKills: { a: 0, b: 0, c: 0, d: 0 }, startedAt: clock.t };
  let Veh = null;
  const Combat = require(path.join(ROOT, 'server/lib/combat.js'))({ io, now, modeInfo, lootAdd: () => {}, scheduleRespawn: () => {}, endMatch: () => {},
    Nuke: { onKill() {} }, Rooms: { colorFor: () => '#fff' }, pushLobby: () => {}, spawnPlayer: () => {}, Mines: { clear() {} }, Drones: { onOwnerDeath() {} }, Hazards: {},
    vehShield: (r, v) => (Veh ? Veh.shields(r, v) : false), onKillStreak: () => {}, onDeathClearStreakReward: () => {} });
  Veh = require(path.join(ROOT, 'server/lib/vehicles.js'))({ CFG, io, now, modeInfo, applyDamage: (...a) => Combat.applyDamage(...a) });
  const add = (id, team, x, z, extra) => {
    const p = Object.assign({ id, name: id, alive: true, hp: 100, team: team || null, pos: [x || 0, 1, z || 0], kills: 0, deaths: 0, streak: 0,
      armorLvl: 0, armorDur: 0, shieldHp: 0, lastShotAt: {}, history: [], rd: {}, assists: 0, connected: true }, extra || {});
    room.players.set(id, p); return p;
  };
  const deaths = () => ev.filter(e => e[0] === 'death').map(e => e[1]);
  return { room, clock, ev, now, io, modeInfo, Combat, Veh, add, deaths };
}
/* seat people in a vehicle: they have to be standing beside it to get in */
function seat(M, v, people) { return people.map(p => { p.pos = [v.x + 1.2, v.y + 1, v.z]; return M.Veh.enter(M.room, p, { id: v.id }); }); }

/* ------------------------------------------------------------------ A */
console.log('--- A. a wrecked vehicle kills everyone aboard ---');
{
  /* the report: Bot Ops, one side of humans, a team-mate (or the driver's own
     squad) shooting at the car — and a passenger who had just spawned */
  const M = match('bom'); M.Veh.start(M.room);
  const car = M.room.veh.list.find(v => v.type === 'car');
  const D = M.add('D', 'a'), P = M.add('P', 'a', 0, 0, { protUntil: M.clock.t + 8000 }), Q = M.add('Q', 'a'), mate = M.add('MATE', 'a', car.x + 20, car.z);
  const got = seat(M, car, [D, P, Q]);
  ok(got.every(g => g.ok) && car.seats.filter(Boolean).length === 3, 'three of one side sit in a sedan (driver + two passengers)');
  /* the real bullets: a team-mate empties a rifle into the hull */
  let shots = 0;
  while (M.room.veh.list.indexOf(car) >= 0 && shots < 400) { M.clock.t += 200; M.Veh.hit(M.room, mate, { id: car.id, w: 'ak47' }); shots++; }
  const dd = M.deaths();
  ok(M.room.veh.list.indexOf(car) < 0 && M.ev.some(e => e[0] === 'vehBoom' && e[1].id === car.id), 'a TEAM-MATE\'s bullets blow it up (' + shots + ' rounds of AK into ' + CFG.VEHICLES.types.car.hp + ' hull)');
  ok(!D.alive && !P.alive && !Q.alive, 'and all three die with it — the driver is not thrown clear, the passengers are not left standing [' + [D, P, Q].map(p => p.id + (p.alive ? ' ALIVE' : ' dead')).join(', ') + ']');
  ok(!P.alive, 'spawn protection does not save a rider from their own vehicle blowing up');
  ok(dd.length === 3 && dd.every(d => d.weapon === 'vehicle'), 'three deaths on the wire, each tagged "vehicle" [' + dd.map(d => d.weapon).join(', ') + ']');
  ok(mate.kills === 0 && dd.every(d => d.killerId !== 'MATE'), 'the team-mate who did it is credited with nothing (no kills for wrecking your own side) [kills ' + mate.kills + ']');
  ok(D.deaths === 1 && P.deaths === 1 && Q.deaths === 1, 'each rider is charged exactly one death');
}
{
  /* an enemy does it: the kills are theirs, in a team mode and in free-for-all */
  const M = match('t2'); M.Veh.start(M.room);
  const car = M.room.veh.list.find(v => v.type === 'car');
  const D = M.add('D', 'a'), P = M.add('P', 'a'), foe = M.add('FOE', 'b', car.x + 25, car.z);
  seat(M, car, [D, P]);
  M.Veh.wreck(M.room, car, foe);
  ok(!D.alive && !P.alive && foe.kills === 2 && M.room.teamKills.b === 2, 'an ENEMY who wrecks it is credited with every rider: 2 kills, 2 points for their side [kills ' + foe.kills + ', side ' + M.room.teamKills.b + ']');
  ok(M.deaths().every(d => d.killerId === 'FOE' && d.weapon === 'vehicle'), 'and the kill feed names them');
  const F = match('ffa'); F.Veh.start(F.room);
  const bus = F.room.veh.list.find(v => v.type === 'bus') || F.room.veh.list.find(v => v.type === 'car');
  const riders = ['R1', 'R2', 'R3', 'R4'].map(id => F.add(id, null)), gun = F.add('GUN', null, bus.x + 30, bus.z);
  seat(F, bus, riders);
  let n = 0; while (F.room.veh.list.indexOf(bus) >= 0 && n < 900) { F.clock.t += 200; F.Veh.hit(F.room, gun, { id: bus.id, w: 'ak47' }); n++; }
  ok(riders.every(r => !r.alive) && gun.kills === 4, 'free-for-all: a ' + bus.type + ' with four aboard, shot to pieces — four dead, four kills [' + gun.kills + ']');
  /* the tank is the one exception that was always there: its crew dies with it too */
  const T = match('ffa'); T.Veh.start(T.room);
  const tank = T.room.veh.list.find(v => v.type === 'tank');
  if (tank) { const c1 = T.add('C1', null), c2 = T.add('C2', null), rk = T.add('RK', null, tank.x + 30, tank.z); seat(T, tank, [c1, c2]); T.Veh.wreck(T.room, tank, rk); ok(!c1.alive && !c2.alive, 'a tank\'s crew, behind armour for everything else, dies when the tank itself goes'); }
  else ok(false, 'a tank is parked on Urban in free-for-all');
  const src = read('server/lib/vehicles.js');
  ok(/q\.protUntil = 0;/.test(src) && /enemy \? by\.id : pid/.test(src) && /wreck: destroy/.test(src), 'destroy() clears protection and charges the death to the rider when no enemy did it; exported as wreck for the train');
}

/* ------------------------------------------------------------------ B */
console.log('--- B. a train wrecks the vehicle on its line, with everyone in it ---');
{
  const M = match('t2'); M.Veh.start(M.room);
  const H = require(path.join(ROOT, 'server/lib/hazards.js'))({ io: M.io, now: M.now, applyDamage: (...a) => M.Combat.applyDamage(...a), modeInfo: M.modeInfo,
    colliders: () => [], trainPath: (m) => Bots.trainPath(m), pathFrom: (wp, f) => Bots.pathFrom(wp, f),
    vehList: (room) => (room.veh ? room.veh.list : null), vehWreck: (room, v, cause) => M.Veh.wreck(room, v, null, cause) });
  const P = Bots.trainPath('urban'), L = M.room.veh.list;
  /* six on the rails, spread round the loop; six parked 7 m to the side of the same places */
  const on = [], off = [], crews = [];
  const types = ['car', 'bike', 'auto', 'bus', 'tank', 'bike'];
  const pick = (t, used) => L.find(v => v.type === t && used.indexOf(v) < 0) || L.find(v => used.indexOf(v) < 0 && v.type === 'car');
  const used = [];
  for (let k = 0; k < 6; k++) {
    const s = 140 + k * (P.length / 6), a = P.at(s), v = pick(types[k], used); used.push(v);
    v.x = a.x; v.z = a.z; v.y = 0; v.ry = a.yaw + Math.PI / 2; on.push(v);
    const crew = [M.add('ON' + k + 'a', 'a'), M.add('ON' + k + 'b', 'a')].slice(0, CFG.VEHICLES.types[v.type].seats);
    seat(M, v, crew); crew.forEach(p => { p.pos = [v.x, 1, v.z]; }); crews.push(crew);
  }
  for (let k = 0; k < 6; k++) {
    const s = 140 + k * (P.length / 6), a = P.at(s), v = pick('car', used); used.push(v);
    v.x = a.x - Math.sin(a.yaw) * 7; v.z = a.z + Math.cos(a.yaw) * 7; v.y = 0; v.ry = a.yaw + Math.PI / 2; off.push(v);
    const p = M.add('OFF' + k, 'b'); seat(M, v, [p]); p.pos = [v.x, 1, v.z]; crews.push([p]);
  }
  const seated = on.every((v, k) => v.seats.filter(Boolean).length === crews[k].length);
  /* a lap and a bit, at the server's own tick */
  const lapSec = 110; let wreckedAt = [];
  for (let t = 0; t < lapSec * 15; t++) {
    M.clock.t += 1000 / 15; H.tickTrain(M.room);
    on.forEach((v, k) => { if (wreckedAt[k] === undefined && L.indexOf(v) < 0) wreckedAt[k] = t / 15; });
    /* the off-line crews keep reporting where they sit, as a live client would */
  }
  const gone = on.filter(v => L.indexOf(v) < 0).length, crewDead = crews.slice(0, 6).every(c => c.every(p => !p.alive));
  ok(seated && gone === 6, 'six vehicles left on the rails round the loop (' + on.map(v => v.type).join(', ') + '): every one is wrecked within a lap [' + gone + '/6, at ' + wreckedAt.map(t => t === undefined ? '—' : t.toFixed(0) + ' s').join(', ') + ']');
  ok(crewDead, 'and EVERYONE in them dies — driver and passenger both, not only whoever was under the wheels [' + crews.slice(0, 6).map(c => c.filter(p => !p.alive).length + '/' + c.length).join(' ') + ']');
  const dd = M.deaths().filter(d => /^ON/.test(d.victimId));
  ok(dd.length === crews.slice(0, 6).reduce((n, c) => n + c.length, 0) && dd.every(d => d.weapon === 'train'), 'each death is tagged "train" (' + dd.length + ' of them), so the train rule scores it');
  ok(off.every(v => L.indexOf(v) >= 0) && crews.slice(6).every(c => c[0].alive), 'six parked 7 m to the side of the same places are untouched, and so are the people in them');
  ok(M.ev.filter(e => e[0] === 'vehBoom').length === 6, 'six explosions told to the room — one a vehicle');
  /* a standing train wrecks nothing: park one on the line right at a halt and tick only while the train stands */
  const M2 = match('ffa'); M2.Veh.start(M2.room);
  const H2 = require(path.join(ROOT, 'server/lib/hazards.js'))({ io: M2.io, now: M2.now, applyDamage: (...a) => M2.Combat.applyDamage(...a), modeInfo: M2.modeInfo,
    colliders: () => [], trainPath: (m) => Bots.trainPath(m), pathFrom: (wp, f) => Bots.pathFrom(wp, f),
    vehList: (room) => (room.veh ? room.veh.list : null), vehWreck: (room, v, cause) => M2.Veh.wreck(room, v, null, cause) });
  const src = read('server/lib/hazards.js');
  ok(/h\.v >= 1\.0 && CFG\.VEHICLES/.test(src) && /v\.y > FLOOR - 0\.25\) continue;/.test(src), 'only a MOVING train does it (1 m/s and up), and only to a vehicle at rail level');
  M2.clock.t += 500; H2.tickTrain(M2.room);
  ok(M2.room.veh.list.length === CFG.VEHICLES.count && M2.ev.filter(e => e[0] === 'vehBoom').length === 0, 'with nothing on the line, a tick of four trains wrecks nothing (' + M2.room.veh.list.length + ' parked)');
  ok(/vehList: \(room\) =>/.test(read('server.js')) && /vehWreck: \(room, v, cause\) => Vehicles\.wreck\(room, v, null, cause\)/.test(read('server.js')), 'server.js hands the trains the vehicle list and the wreck');
}

/* ------------------------------------------------------------------ C */
console.log('--- C. grenades from a seat ---');
{
  const g = read('public/src/core/game.js'), s = read('public/src/weapons/system.js'), html = read('public/index.html'), v = read('public/src/vehicles/vehicles.js');
  const riding = g.slice(g.indexOf('if (riding) {'), g.indexOf('if (riding) {') + 1800);
  ok(/Vehicles\.canFire\(\) && e\.code === 'KeyG'\) Weapons\.startCook\(\);/.test(riding) && /Vehicles\.canFire\(\) && e\.code === 'KeyF'\) Weapons\.throwGrenade\('flash'\);/.test(riding),
    'seated in an open vehicle: G cooks a frag, F throws a flash (the tank\'s sealed crew does neither)');
  ok(/if \(e\.code === 'KeyG'\) Weapons\.releaseCook\(\)/.test(g) || /KeyG[^\n]*releaseCook/.test(g), 'releasing G throws it, seated or not');
  ok(/var veh = myVehicle\(\);\s*\n\s*var o = veh \? Vehicles\.muzzle\(new THREE\.Vector3\(\), d\) : camera\.position\.clone\(\);/.test(s), 'the grenade leaves from the rider, not from the chase camera');
  ok(/if \(veh\) \{ v\.x \+= Math\.sin\(veh\.ry\) \* \(veh\.sp \|\| 0\); v\.z -= Math\.cos\(veh\.ry\) \* \(veh\.sp \|\| 0\); \}/.test(s), 'and it keeps the vehicle\'s speed');
  ok(/G frag/.test(v) && /CLICK fire &#183; G frag/.test(html), 'the seat\'s hint line and the field manual both say G frag');
  /* H, B and L must still be horn, radio and lights at the wheel */
  ok(/if \(e\.code === 'KeyH'\) Vehicles\.horn\(\);/.test(riding) && /KeyL'\) Vehicles\.lights\(\)/.test(riding), 'H is still the horn and L the lights — no molotov or smoke from the seat');
}

/* ------------------------------------------------------------------ D */
console.log('--- D. the Bot Ops kit: 8 frags and 10 mines, Bot Ops only ---');
{
  const maps = ['urban', 'urbansmall', 'killhouse'];
  ok(['bom', 'boh'].every(m => maps.every(mp => CFG.fragCountFor(mp, m) === 8)), 'Bot Ops, every map: 8 frags a life [' + maps.map(mp => CFG.fragCountFor(mp, 'bom')).join(', ') + ']');
  ok(['bom', 'boh'].every(m => maps.every(mp => CFG.mineStartFor(mp, m) === 10 && CFG.mineCapFor(mp, m) >= 10)), 'Bot Ops, every map: 10 mines a life, and room to carry them [' + maps.map(mp => CFG.mineStartFor(mp, 'bom') + '/' + CFG.mineCapFor(mp, 'bom')).join(', ') + ']');
  const others = Object.keys(CFG.MODES).filter(m => !CFG.MODES[m].bots);
  const same = others.every(m => Object.keys(CFG.MAPS).every(mp => CFG.fragCountFor(mp, m) === CFG.fragCountFor(mp) && CFG.mineStartFor(mp, m) === CFG.mineStartFor(mp) && CFG.mineCapFor(mp, m) === CFG.mineCapFor(mp)));
  ok(same && CFG.fragCountFor('killhouse', 'ffa') === CFG.THROWS.frag.countArena && CFG.mineStartFor('urban', 'ffa') === CFG.GEAR.mine.start,
    'the other ' + others.length + ' modes are exactly as they were [frags urban ' + CFG.fragCountFor('urban', 'ffa') + ' / killhouse ' + CFG.fragCountFor('killhouse', 'ffa') + ', mines urban ' + CFG.mineStartFor('urban', 'ffa') + ' / killhouse ' + CFG.mineStartFor('killhouse', 'ffa') + ']');
  const Mines = require(path.join(ROOT, 'server/lib/mines.js'))({ io: { to: () => ({ emit() {} }) }, now: () => 1, applyDamage: () => {}, modeInfo: (r) => CFG.MODES[r.settings.mode] || {} });
  const lives = (mode, map) => { const p = {}; return [1, 2, 3, 4].map(() => Mines.refillFor({ settings: { mode, map } }, p)); };
  ok(maps.every(mp => lives('bom', mp).join() === '10,10,10,10'), 'the server hands a Bot Ops player 10 mines on every respawn, on all three maps');
  ok(lives('ffa', 'urban').join() === [1, 2, 3, 4].map(() => CFG.GEAR.mine.start).join() && lives('ffa', 'killhouse')[0] === CFG.GEAR.mine.startArena, 'and anyone else what they always got');
  const sv = read('server.js'), sy = read('public/src/weapons/system.js');
  ok((sv.match(/CFG\.fragCountFor\(room\.settings\.map \|\| 'urban', room\.settings\.mode\)/g) || []).length === 2 && /CFG\.mineStartFor\(room\.settings\.map \|\| 'urban', room\.settings\.mode\)/.test(sv),
    'the server counts thrown frags against the MODE\'s number (the ninth is not relayed) and stocks mines by it');
  ok((sy.match(/CFG\.fragCountFor\(loadoutMap\(\), loadoutMode\(\)\)/g) || []).length === 2 && /CFG\.mineStartFor\(loadoutMap\(\), loadoutMode\(\)\)/.test(sy), 'the client\'s belt shows the same numbers');
  ok(/mineCapFor\(room\.settings\.map \|\| 'urban', room\.settings\.mode\)/.test(read('server/lib/loot.js')), 'a crate\'s mines do not bounce off the old carry limit');
}

/* ------------------------------------------------------------------ E */
console.log('--- E. the hunter drone in Bot Ops ---');
{
  const sv = read('server.js'), a = sv.indexOf("socket.on('launchHunter'"), body = sv.slice(a, sv.indexOf("socket.on('launchDrone'", a));
  ok(a > 0 && !/Not in this mode/.test(body) && !/modeInfo\(room\)\.bots\) return/.test(body) && /ack\(Drones\.launch\(room, p, 'hunter'\)\);/.test(body), 'the server no longer answers "Not in this mode" to a hunter launched in Bot Ops');
  const M = match('bom', 'urbansmall');
  const Drones = require(path.join(ROOT, 'server/lib/drones.js'))({ io: M.io, now: M.now, applyDamage: (...a2) => M.Combat.applyDamage(...a2), modeInfo: M.modeInfo, CFG,
    colliders: (m) => Bots.buildColliders(m), segmentBlocked: (...a2) => Bots.segmentBlocked(...a2), onDroneBounty: () => {} });
  const me = M.add('ME', 'a', 0, 0, { hunters: 1 }), mate = M.add('MATE', 'a', 4, 0);
  const b1 = M.add('BOT1', 'b', 26, 8, { bot: true }), b2 = M.add('BOT2', 'b', -34, -12, { bot: true });
  const empty = Drones.launch(M.room, mate, 'hunter'), go = Drones.launch(M.room, me, 'hunter');
  ok(empty.ok === false && /No hunter/.test(empty.err), 'without one in stock the answer is the ordinary "No hunter drones left"');
  ok(go.ok === true && go.left === 0 && M.ev.some(e => e[0] === 'droneLaunch' && e[1].k === 'hunter'), 'with one from a crate, it launches');
  let tk = 0; while (tk < CFG.GEAR.hunter.lifeSec * 15 + 30 && (b1.alive || b2.alive)) { M.clock.t += 1000 / 15; Drones.tick(M.room, 1 / 15); tk++; }
  const hd = M.deaths().filter(d => d.weapon === 'hunter');
  ok(!b1.alive && !b2.alive && hd.length === 2, 'and it hunts the AI operators: both dead inside its ' + CFG.GEAR.hunter.lifeSec + ' s life [' + (tk / 15).toFixed(1) + ' s]');
  ok(me.kills === 2 && hd.every(d => d.killerId === 'ME') && M.room.teamKills.a === 2, 'the kills are the owner\'s and score for the human side [' + me.kills + ' kills, side ' + M.room.teamKills.a + ']');
  ok(mate.alive && me.alive, 'it never turns on the owner or a team-mate');
}

/* ------------------------------------------------------------------ F */
console.log('--- F. Bot Ops on Killhouse, and how many operators a map keeps ---');
{
  ok(['bom', 'boh'].every(m => ['urbansmall', 'urban', 'killhouse'].every(mp => CFG.MODES[m].mapAllow.indexOf(mp) >= 0)), 'both Bot Ops modes offer Urban Small, Urban and Killhouse');
  const row = (mp) => [1, 2, 3, 4, 5, 6, 7, 8].map(h => CFG.botCountFor(mp, h));
  const U = row('urban'), S = row('urbansmall'), K = row('killhouse');
  ok(U[0] === 20 && Math.max.apply(null, U) === 25 && U.every((n, i) => i === 0 || n >= U[i - 1]), 'Urban keeps 20 on the map for one player, up to 25 [' + U.join(' ') + ']');
  ok(S[0] === 8 && Math.max.apply(null, S) === 12, 'Urban Small 8, never more than 12 [' + S.join(' ') + ']');
  ok(K[0] === 6 && Math.max.apply(null, K) === 8, 'Killhouse 6 to 8 [' + K.join(' ') + ']');
  ok(/CFG\.botCountFor\(room\.settings\.map \|\| 'urban', Math\.max\(1, humans\(room\)\.length\)\)/.test(read('server/lib/botai.js')), 'the bot director reads that table');
  ok(/PATHS_PER_TICK = 2/.test(read('server/lib/botai.js')), 'and with 25 of them, route searches are rationed to two a tick (the rest wait a tick)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
