/* verify-protect.js — v1.0v
   The riders are untouchable while the machine flies; an EMP fells it; a
   blast destroys enemy mines and spares your own; the Strike Key arms its
   finder on Urban and reaches the whole map. All with the real server modules
   and stub rooms. */
const fs = require('fs'), path = require('path');
const CFG = require('../public/src/config/index.js');
const Bots = require('../server/lib/bots.js')({});
let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }
const half = CFG.PLAYER.standH / 2;
let T0 = 9000000;
const emitted = [];
const io = { to: id => ({ emit: (ev, d) => emitted.push({ to: id, ev, d }) }) };
const mk = (id, x, y, z, team) => ({ id, name: id, alive: true, hp: 100, pos: [x, y, z], team: team || null, armorLvl: 0, armorDur: 0, kills: 0, deaths: 0, streak: 0, lastShotAt: {} });

console.log('--- the riders are untouchable while it flies ---');
{
  const Combat = require('../server/lib/combat.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server/lib/combat.js'), 'utf8');
  ok(/function riderShielded\(room, victim, weapon\)/.test(src) && /if \(riderShielded\(room, victim, weapon\)\) return;/.test(src), 'applyDamage returns before anything for a listed rider of an airborne machine');
  ok(/RIDER_PASS = \{ helidown: 1, helifall: 1, zone: 1 \}/.test(src), 'only the machine\'s own end, a fall and the zone bleed pass the shield');
  const sys = fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8');
  ok(/Heli\.isRiderId\(hit\.id\)/.test(sys) && /riderTarget/.test(sys), 'the client reads a shot at a rider as a shot at the hull (spark, no hitmarker)');
}

console.log('--- an EMP fells it ---');
{
  const H = CFG.HELI;
  const Heli = require('../server/lib/heli.js')({ io, now: () => T0, applyDamage: (room, v, dmg, by, w) => { v.alive = false; v.killedBy = w; v.by = by; },
    modeInfo: () => ({ teams: false }), pathFrom: (wp, f) => Bots.pathFrom(wp, f) });
  const room = { code: 'E', state: 'playing', settings: { map: 'urban', mode: 'ffa' }, players: new Map() };
  Heli.start(room); room.heli.seed = 12345;
  const pilot = mk('P', H.pad[0] + 3, half + H.padY, H.pad[1]); room.players.set('P', pilot);
  const b = Heli.board(room, pilot); pilot.pos = b.seat.slice();
  T0 += H.boardSec * 1000 + 100; Heli.tick(room);
  const P = Heli.pathFor(room.heli.seed);
  T0 += (H.climbSec + 10) * 1000; const pp = CFG.heliPoseAt(H, P, (T0 - room.heli.t0) / 1000); pilot.pos = [pp.x, pp.y + H.cabinFloor + half, pp.z]; Heli.tick(room);
  ok(room.heli.state === 'flying', 'airborne with a pilot');
  const far = mk('F', pp.x + 150, half, pp.z); room.players.set('F', far);
  ok(!Heli.emp(room, far).ok, 'an EMP 150 m away does not reach it');
  const near = mk('N', pp.x + 30, half, pp.z + 20); room.players.set('N', near);
  const r = Heli.emp(room, near);
  ok(r.ok && r.n === 1 && !pilot.alive && pilot.killedBy === 'helidown' && pilot.by === 'N', 'an EMP within range fells it: the pilot dies, tagged helidown, credited to the EMP user');
  ok(room.heli.state === 'gone' && emitted.some(e => e.ev === 'heliBoom'), 'the machine is gone and the room saw it burn');
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok(/const hr = Heli\.emp\(room, p\);/.test(srv) && /if \(hr\.ok && !mr\.ok\)/.test(srv), 'useEmp fells the machine even when there are no enemy mines to clear, and spends the charge');
}

console.log('--- a blast destroys enemy mines, spares your own ---');
{
  const Mines = require('../server/lib/mines.js')({ io, now: () => T0, applyDamage: () => {}, modeInfo: () => ({ teams: true }) });
  const room = { code: 'M', state: 'playing', settings: { map: 'urban', mode: 't4' }, players: new Map(),
    mines: [{ id: 1, owner: 'A', team: 'red', x: 10, y: 0, z: 10 }, { id: 2, owner: 'B', team: 'blue', x: 11, y: 0, z: 10 }, { id: 3, owner: 'C', team: 'red', x: 12, y: 0, z: 10 }, { id: 4, owner: 'B', team: 'blue', x: 40, y: 0, z: 40 }] };
  const A = mk('A', 0, half, 0, 'red'); room.players.set('A', A);
  const r = Mines.blast(room, A, [10.5, 0.5, 10], 6.5);
  const left = room.mines.map(m => m.id).sort();
  ok(r.ok && r.cleared === 1 && left.join(',') === '1,3,4', 'a red frag at (10,10) destroys the blue mine there, spares A\'s own and a red team-mate\'s, and the blue mine 40 m away [' + left.join(',') + ']');
  ok(emitted.some(e => e.ev === 'empBlast' && e.d.blast && e.d.mines.length === 1), 'the room sees the mine go');
  const sys = fs.readFileSync(path.join(__dirname, '..', 'public/src/weapons/system.js'), 'utf8');
  ok(/if \(p\.mine && Net\.blast\) Net\.blast\(/.test(sys) && /socket\.on\('blast'/.test(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')), 'the thrower reports the detonation; the server takes it');
}

console.log('--- v2.0: no kill-streak strikes ---');
{
  ok(!CFG.LOOT_ITEMS.strike_key && !CFG.LOOT_ITEMS.remote, 'the Strike Key and the Strike Remote are not loot');
  ok(!CFG.GEAR.rocket && !CFG.GEAR.remote && !CFG.GEAR.heli, 'no rocket ladder, remote or air-strike gear in the config');
  ok(!fs.existsSync(path.join(__dirname, '..', 'server/lib/nuke.js')) && !fs.existsSync(path.join(__dirname, '..', 'server/lib/rocket.js')), 'nuke.js and rocket.js are deleted, not disabled');
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok(!/socket\.on\('(nukeStrike|launchRocket|callStrike)'/.test(srv), 'the server has no strike handlers');
  const game = fs.readFileSync(path.join(__dirname, '..', 'public/src/core/game.js'), 'utf8');
  ok(!/KeyN' && UI\.(nukeToggleAim|rocketLaunch)/.test(game) && !/strikeHold/.test(game), 'N and hold-Z do nothing on the client');
}

console.log('--- a train death scores for the opposition (v1.0w) ---');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'server/lib/combat.js'), 'utf8');
  ok(/if \(weapon === 'train' && teams && victim\.team\)/.test(src) && /sides\.length === 2\) credit = sides\[0\] === victim\.team \? sides\[1\] : sides\[0\]/.test(src), 'two sides: the other side gets the point');
  ok(/victim\.lastHitByTeam && victim\.lastHitByTeam !== victim\.team && now\(\) - \(victim\.lastHitAt \|\| 0\) < 15000/.test(src), 'squads: the side that last hurt the victim within 15 s, else nobody');
  ok(/victim\.lastHitByTeam = attacker\.team/.test(src), 'every hit remembers the attacker\'s side');
  ok(/if \(attacker && attackerId !== victim\.id\) \{/.test(src), 'individual modes: a death and no kill, as before');
  ok(CFG.respawnDelayFor('killhouse', 60) === 5 && CFG.MATCH.respawnLadder.length === 1, 'the redeploy is a flat 5 s everywhere (v1.0w)');
  /* v1.1.1 (Rahul: "train kills are giving 3 points"): the credit block had been
     pasted at three sites; ONE death is ONE point, and no popup — the feed row
     carries "+1 SIDE". Run the real applyDamage. */
  {
    const ev = [];
    const ctx2 = { io: { to: () => ({ emit: (e, d) => ev.push([e, d]) }) }, now: Date.now, modeInfo: (r) => CFG.MODES[r.settings.mode] || {}, lootAdd: () => {}, scheduleRespawn: () => {}, endMatch: () => {}, Nuke: { onKill() {} }, Rooms: { colorFor: () => '#fff' }, pushLobby: () => {}, spawnPlayer: () => {}, Mines: { clear() {} }, Drones: { onOwnerDeath() {} }, Hazards: {} };
    const Combat = require('../server/lib/combat.js')(ctx2);
    const rm = { code: 'T', state: 'playing', settings: { mode: 't4', map: 'urban' }, players: new Map(), teamKills: { a: 0, b: 0 }, startedAt: Date.now() - 60000 };
    const v = { id: 'V', name: 'V', alive: true, hp: 100, team: 'a', pos: [0, 1, 0], kills: 0, deaths: 0, streak: 0, armorLvl: 0, armorDur: 0, shieldHp: 0, lastShotAt: {}, history: [] };
    rm.players.set('V', v);
    Combat.applyDamage(rm, v, 999, v.id, 'train', false, true);
    const death = (ev.find(e => e[0] === 'death') || [])[1];
    ok(rm.teamKills.b === 1 && rm.teamKills.a === 0, 'one train death is exactly ONE point for the other side [' + JSON.stringify(rm.teamKills) + ']');
    ok(ev.filter(e => e[0] === 'toast').length === 0, 'and raises no popup');
    ok(death && death.credit === 'COBALT' && death.weapon === 'train', 'the death event names the credited side for the kill feed [' + (death && death.credit) + ']');
    ok((fs.readFileSync(path.join(__dirname, '..', 'server/lib/combat.js'), 'utf8').match(/weapon === 'train' && teams && victim\.team/g) || []).length === 1, 'the credit block exists once');
    ok(!/toast[^\n]*run over by the train|toast[^\n]*jumped from the moving train/.test(fs.readFileSync(path.join(__dirname, '..', 'server/lib/hazards.js'), 'utf8')), 'the train\'s own kill toasts are gone');
  }
}

console.log('--- the lag: moving groups merged ---');
{
  const w = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/world.js'), 'utf8');
  ok(/function mergeGroup\(g, skip\)/.test(w), 'World.mergeGroup exists');
  ok(/World\.mergeGroup\(g\)/.test(fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/train.js'), 'utf8')), 'every train car is merged after build');
  ok(/World\.mergeGroup\(fuselage/.test(fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/heli.js'), 'utf8')), 'the helicopter fuselage is merged (rotors kept spinning)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
