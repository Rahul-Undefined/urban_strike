/* verify-v218 — EXPLOSIVES AND THE HULL, AND THE BLAST (v2.18).

   Rahul, answering "should grenades, mines and C4 wreck vehicles too?":
   "yes grenads damage the car too but doesnt damage the player inside the car,
    4 granade blasts the car with the players inside it."

   A. THE RULE, on the real vehicle + combat modules: how many frags each hull
      takes, that the people aboard are untouched until the last one, who is
      credited, and how close a frag has to be.
   B. MINES AND C4, on the real mines.js and hazards.js.
   C. THE WIRING in server.js and the client (read; the handlers live inside
      the server's connection closure).
   L. LIVE (only when a server answers on :3000): three sockets — a driver in a
      sedan, a thrower, and the thrower's four frags; then explosions that
      were never thrown.

   D. THE BLAST, headless: what it is built of, that nothing in it is NaN (a
      mine's used to be), one pooled lamp, the quality tiers, the clean-up.
   What v2.18's pictures LOOK like (the blast, the vehicles, getting in) is
   judged in the browser; the models and the boarding are measured in
   verify-vehicles.js and verify-rider.js.

   Run: node tools/verify-v218.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const Bots = require(path.join(ROOT, 'server/lib/bots.js'))({});
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
const V = CFG.VEHICLES, B = V.blast;

function match(mode, map) {
  const clock = { t: 5e6 }, ev = [];
  const now = () => clock.t;
  const io = { to: () => ({ emit: (e, d) => ev.push([e, d]) }) };
  const modeInfo = (r) => CFG.MODES[r.settings.mode] || {};
  const room = { code: 'V218', state: 'playing', settings: { mode: mode, map: map || 'urban' }, players: new Map(), teamKills: { a: 0, b: 0, c: 0, d: 0 }, startedAt: clock.t };
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
function seat(M, v, people) { return people.map(p => { p.pos = [v.x + 1.2, v.y + 1, v.z]; const r = M.Veh.enter(M.room, p, { id: v.id }); p.pos = [v.x, v.y + 0.9, v.z]; return r; }); }
/* a point `d` metres out from the hull's SIDE, at the height of its middle */
function beside(v, d) { const T = V.types[v.type], rx = Math.cos(v.ry), rz = Math.sin(v.ry); return [v.x + rx * (T.wid / 2 + d), v.y + T.hgt / 2, v.z + rz * (T.wid / 2 + d)]; }

/* ------------------------------------------------------------------ A */
console.log('--- A. frags and the hull ---');
{
  ok(B && B.reach === 5 && B.frag * 4 >= V.types.car.hp && B.frag * 3 < V.types.car.hp, 'the number is a quarter of a sedan: ' + B.frag + ' off the hull a frag, ' + V.types.car.hp + ' in a sedan — three leave it standing, the fourth does not');
  const want = { bike: 2, auto: 3, car: 4, bus: 9, tank: 26 }, got = {}, safe = {}, dead = {};
  Object.keys(want).forEach(type => {
    const M = match('ffa'); M.Veh.start(M.room);
    const v = M.room.veh.list.find(x => x.type === type), T = V.types[type];
    const crew = []; for (let k = 0; k < T.seats; k++) crew.push(M.add('R' + k, null));
    seat(M, v, crew);
    const thrower = M.add('T', null, v.x + 40, v.z);
    let n = 0, untouched = true;
    while (M.room.veh.list.indexOf(v) >= 0 && n < 60) {
      if (!crew.every(p => p.alive && p.hp === 100)) untouched = false;
      M.Veh.blastAt(M.room, thrower, beside(v, 1.0), 'frag'); n++;
    }
    got[type] = n; safe[type] = untouched; dead[type] = crew.every(p => !p.alive) && thrower.kills === crew.length;
  });
  ok(Object.keys(want).every(t => got[t] === want[t]), 'frags to wreck, by hull: ' + Object.keys(want).map(t => t + ' ' + got[t]).join(', ') + ' — the sedan is FOUR');
  ok(Object.keys(want).every(t => safe[t]), 'until the last one, nobody aboard has lost a point of health, in any of the five');
  ok(Object.keys(want).every(t => dead[t]), 'on the last one everyone aboard dies, and the thrower has a kill for each (2 + 3 + 4 + 6 + 2)');
}
{
  /* how close */
  const M = match('ffa'); M.Veh.start(M.room);
  const car = M.room.veh.list.find(x => x.type === 'car'), T = V.types.car, th = M.add('T', null, car.x + 40, car.z);
  const hp0 = car.hp;
  const hits = (pos) => { const h = car.hp; M.Veh.blastAt(M.room, th, pos, 'frag'); return car.hp < h; };
  const far = hits(beside(car, 5.6)), near = hits(beside(car, 4.4));
  const nose = [car.x + Math.sin(car.ry) * (T.len / 2 + 4.4), car.y + 0.5, car.z - Math.cos(car.ry) * (T.len / 2 + 4.4)], noseFar = [car.x + Math.sin(car.ry) * (T.len / 2 + 5.6), car.y + 0.5, car.z - Math.cos(car.ry) * (T.len / 2 + 5.6)];
  const up = hits([car.x, car.y + T.hgt + 5.6, car.z]), ahead = hits(nose), aheadFar = hits(noseFar);
  ok(!far && near && ahead && !aheadFar && !up, 'it has to go off within ' + B.reach + ' m of the HULL: 4.4 m off the door or the bumper counts, 5.6 m does not, nor 5.6 m overhead');
  ok(Math.abs(M.Veh.hullDist(car, beside(car, 3)) - 3) < 1e-6 && M.Veh.hullDist(car, [car.x, car.y + 0.5, car.z]) === 0, 'the distance is measured to the hull, not its centre (3 m off the door reads 3.00; inside it reads 0)');
  ok(car.hp === hp0 - 2 * B.frag, 'two of those five took ' + B.frag + ' each and nothing else did [' + hp0 + ' → ' + car.hp + ']');
  /* every vehicle in reach, not just the nearest; one out of reach untouched */
  const others = M.room.veh.list.filter(x => x !== car).slice(0, 2);
  others[0].x = car.x + 6; others[0].z = car.z; others[0].ry = car.ry; others[1].x = car.x + 60; others[1].z = car.z;
  const h0 = others[0].hp, h1 = others[1].hp, hc = car.hp;
  M.Veh.blastAt(M.room, th, [car.x + 3, car.y + 0.6, car.z], 'frag');
  ok(car.hp < hc && others[0].hp < h0 && others[1].hp === h1, 'one frag between two parked vehicles damages both; one 60 m off is untouched');
}
{
  /* who did it */
  const M = match('bom'); M.Veh.start(M.room);
  const car = M.room.veh.list.find(x => x.type === 'car');
  const D = M.add('D', 'a'), P = M.add('P', 'a', 0, 0, { protUntil: M.clock.t + 9000 }), mate = M.add('MATE', 'a', car.x + 30, car.z);
  seat(M, car, [D, P]);
  for (let k = 0; k < 4; k++) M.Veh.blastAt(M.room, mate, beside(car, 0.8), 'frag');
  ok(!D.alive && !P.alive && mate.kills === 0 && M.deaths().every(d => d.weapon === 'vehicle'), 'a TEAM-MATE\'s four frags wreck it just the same: both riders dead (one spawn-protected), no kills for the thrower');
  const E = match('t2'); E.Veh.start(E.room);
  const c2 = E.room.veh.list.find(x => x.type === 'car'), a1 = E.add('A1', 'a'), a2 = E.add('A2', 'a'), foe = E.add('FOE', 'b', c2.x + 30, c2.z);
  seat(E, c2, [a1, a2]);
  for (let k = 0; k < 4; k++) E.Veh.blastAt(E.room, foe, beside(c2, 0.8), 'frag');
  ok(!a1.alive && !a2.alive && foe.kills === 2 && E.room.teamKills.b === 2, 'an enemy\'s four: two kills, two points for their side');
  /* bullets and frags add up on one hull */
  const X = match('ffa'); X.Veh.start(X.room);
  const c3 = X.room.veh.list.find(x => x.type === 'car'), g = X.add('G', null, c3.x + 25, c3.z);
  X.Veh.blastAt(X.room, g, beside(c3, 1), 'frag'); X.Veh.blastAt(X.room, g, beside(c3, 1), 'frag');
  let rounds = 0; while (X.room.veh.list.indexOf(c3) >= 0 && rounds < 60) { X.clock.t += 200; X.Veh.hit(X.room, g, { id: c3.id, w: 'ak47' }); rounds++; }
  ok(rounds > 0 && rounds < 17, 'a hull already hit by two frags takes fewer rounds to finish: ' + rounds + ' of AK instead of 17');
}

/* ------------------------------------------------------------------ B */
console.log('--- B. mines and C4 ---');
{
  const mk = (mode) => {
    const M = match(mode); M.Veh.start(M.room);
    M.Mines = require(path.join(ROOT, 'server/lib/mines.js'))({ io: M.io, now: M.now, applyDamage: (...a) => M.Combat.applyDamage(...a), modeInfo: M.modeInfo,
      riding: (room, id) => M.Veh.riding(room, id), vehBlast: (room, by, pos, kind) => M.Veh.blastAt(room, by, pos, kind) });
    M.lay = (owner, x, y, z) => { M.room.mines = M.room.mines || []; M.room.mines.push({ id: (M.room.mines.length + 1) * 7, owner: owner.id, team: owner.team || null, x, y, z, armAt: M.clock.t - 1 }); };
    return M;
  };
  ok(B.mine === 2 * B.frag && B.mine * 2 >= V.types.car.hp && B.mine < V.types.car.hp, 'a mine is two frags to a hull (' + B.mine + '): one leaves a sedan standing, two do not');
  /* a sedan drives over a mine */
  const M = mk('ffa'), car = M.room.veh.list.find(x => x.type === 'car');
  const owner = M.add('OWN', null, car.x + 50, car.z), D = M.add('D', null), P = M.add('P', null);
  seat(M, car, [D, P]);
  const walker = M.add('W', null, car.x + Math.cos(car.ry) * 2.4, car.z + Math.sin(car.ry) * 2.4); walker.pos[1] = car.y + 0.9;
  const hp0 = car.hp;
  M.lay(owner, car.x, car.y, car.z); M.Mines.tick(M.room);
  ok(M.ev.some(e => e[0] === 'mineBoom') && car.hp === hp0 - B.mine, 'a mine under a sedan goes off and takes ' + B.mine + ' off the hull [' + hp0 + ' → ' + car.hp + ']');
  ok(D.alive && P.alive && D.hp === 100 && P.hp === 100, 'the driver and the passenger over it are not scratched');
  ok(walker.hp < 100, 'somebody on FOOT beside the car still takes the mine\'s splash [hp ' + walker.hp + ']');
  M.lay(owner, car.x, car.y, car.z); M.Mines.tick(M.room);
  ok(!D.alive && !P.alive && M.room.veh.list.indexOf(car) < 0 && owner.kills === 2, 'the second mine finishes the sedan: both dead, two kills for whoever laid it');
  /* a bike: one mine is the bike */
  const K = mk('ffa'), bike = K.room.veh.list.find(x => x.type === 'bike'), o2 = K.add('OWN', null, bike.x + 50, bike.z), r1 = K.add('R1', null), r2 = K.add('R2', null);
  seat(K, bike, [r1, r2]); K.lay(o2, bike.x, bike.y, bike.z); K.Mines.tick(K.room);
  ok(!r1.alive && !r2.alive && o2.kills === 2 && K.deaths().length === 2, 'a motorbike over one mine is gone, and both riders with it — each killed once, not twice [' + K.deaths().length + ' deaths]');
  /* on foot, nothing has changed */
  const F = mk('ffa'), o3 = F.add('OWN', null, 500, 500), foot = F.add('FOOT', null, 300, 300); foot.pos = [300, 1, 300];
  F.lay(o3, 300, 0.1, 300); F.Mines.tick(F.room);
  ok(!foot.alive && F.deaths()[0].weapon === 'mine' && o3.kills === 1, 'on foot a mine is what it was: stepped on, dead, tagged "mine"');

  /* C4 */
  const hz = (M2) => require(path.join(ROOT, 'server/lib/hazards.js'))({ io: M2.io, now: M2.now, applyDamage: (...a) => M2.Combat.applyDamage(...a), modeInfo: M2.modeInfo,
    colliders: () => [], trainPath: (m) => Bots.trainPath(m), pathFrom: (wp, f) => Bots.pathFrom(wp, f),
    riding: (room, id) => M2.Veh.riding(room, id), vehBlast: (room, by, pos, kind) => M2.Veh.blastAt(room, by, pos, kind) });
  const C = match('ffa'); C.Veh.start(C.room);
  const H = hz(C), bus = C.room.veh.list.find(x => x.type === 'bus'), sapper = C.add('SAP', null, bus.x + 60, bus.z);
  const crew = ['B1', 'B2', 'B3'].map(id => C.add(id, null)); seat(C, bus, crew);
  const farCar = C.room.veh.list.find(x => x.type === 'car'); farCar.x = bus.x + 14 + V.types.bus.wid; farCar.z = bus.z; const fc = C.add('FC', null); seat(C, farCar, [fc]);
  const at = beside(bus, 2.0);
  C.room.bombs = [{ id: 1, owner: sapper.id, team: null, x: at[0], y: bus.y + 0.2, z: at[2], at: C.clock.t - 1 }];
  H.tick(C.room);
  ok(C.room.veh.list.indexOf(bus) < 0 && crew.every(p => !p.alive) && sapper.kills === 3, 'C4 two metres from a bus: the bus is gone and the three aboard with it, three kills for the sapper');
  ok(C.room.veh.list.indexOf(farCar) >= 0 && fc.alive && fc.hp === 100, 'a sedan 14 m further along is untouched, and so is its driver');
  ok(C.ev.some(e => e[0] === 'bombBoom' && e[1].n === 3), 'the charge reports three');
}

/* ------------------------------------------------------------------ C */
console.log('--- C. the wiring ---');
{
  const sv = read('server.js'), sy = read('public/src/weapons/system.js');
  const hit = sv.slice(sv.indexOf("socket.on('hit'"), sv.indexOf("socket.on('hit'") + 2600);
  ok(/if \(d\.w === 'frag' && Vehicles\.riding\(room, victim\.id\)\) return;/.test(hit), 'the server refuses a frag\'s damage claim on anyone aboard a vehicle');
  const th = sv.slice(sv.indexOf("socket.on('throw'"), sv.indexOf("socket.on('hit'"));
  ok(/if \(d && d\.type === 'frag'\) \{ const bp = room\.players\.get\(socket\.id\); if \(bp\) bp\.blastCredit = Math\.min\(8, \(bp\.blastCredit \| 0\) \+ 1\); \}/.test(th), 'a relayed frag leaves one blast credit (at most 8 held)');
  ok(th.indexOf('blastCredit') > th.indexOf('fragThrows > CFG.fragCountFor'), 'and only AFTER the arena stock check, so a ninth frag on Killhouse earns none');
  const bl = sv.slice(sv.indexOf("socket.on('blast'"), sv.indexOf("socket.on('heliLand'"));
  ok(/if \(d\.w !== 'rocket' && \(p\.blastCredit \| 0\) > 0\) \{ p\.blastCredit--; Vehicles\.blastAt\(room, p, pos, 'frag'\); \}/.test(bl), 'a reported explosion damages hulls only by spending a credit — never for a rocket, never unpaid');
  ok(/riding: \(room, id\) => Vehicles\.riding\(room, id\)/.test(sv) && (sv.match(/vehBlast: \(room, by, pos, kind\) => Vehicles\.blastAt\(room, by, pos, kind\)/g) || []).length === 2, 'mines and hazards are both handed the rider check and the hull');
  ok(/var fragRule = weaponName === 'frag' && typeof Vehicles !== 'undefined';/.test(sy) && /if \(fragRule && Vehicles\.isRider && Vehicles\.isRider\(id\)\) return;/.test(sy) && /sd < selfR && !\(fragRule && myVehicle\(\)\)/.test(sy),
    'the client sends no frag claim for a rider, nor for itself in a seat (no false hitmarker)');
  ok(/Net\.blast\(\{ p: \[pos\.x, pos\.y, pos\.z\], w: \(p\.kind === 'seeker' \|\| p\.kind === 'rocket'\) \? 'rocket' : 'frag' \}\)/.test(sy), 'and tells the server where each of its own frags went off');
}

/* ------------------------------------------------------------------ D */
console.log('--- D. the blast ---');
{
  /* Rahul: "animations for bombs blasting which should show a blast with yellow tint and fire and it should
     looks real." What it LOOKS like is judged in the browser; here, that it is built of what it should be,
     never of NaN, costs what it says, and cleans up after itself. */
  const THREE = require('three'), vm = require('vm');
  const fakeCanvas = () => { const c = { width: 0, height: 0 }; const g = new Proxy({}, { get: (t, k) => (k === 'canvas' ? c : function () { return { addColorStop() {} }; }), set: () => true }); c.getContext = () => g; return c; };
  let tier = 'high', ground = true;
  const ctx = { THREE, console, Math, Float32Array, isFinite, performance: { now: () => 0 }, CFG, window: {},
    document: { createElement: (t) => (t === 'canvas' ? fakeCanvas() : { style: {} }), body: { appendChild() {} }, getElementById: () => null },
    Quality: { getTier: () => tier }, World: { rayHit: (o, d, max) => (ground && o.y <= max ? { point: new THREE.Vector3(o.x, 0, o.z) } : null) } };
  vm.createContext(ctx);
  vm.runInContext(read('public/src/effects/effects.js') + '\nthis.FX = FX;', ctx, { filename: 'effects.js' });
  const FX = ctx.FX, scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 1.7, 30); FX.init(scene, cam);
  const census = () => { const c = { sprites: 0, fire: 0, glow: 0, points: 0, lights: 0, ring: 0, flat: 0, bad: 0 };
    scene.traverse(o => { if (o.isSprite) { c.sprites++; if (o.material.blending === THREE.AdditiveBlending) c.glow++; else c.fire++; } if (o.isPoints) c.points++; if (o.isLight) c.lights++;
      if (o.isMesh && o.geometry.type === 'RingGeometry') c.ring++; if (o.isMesh && o.geometry.type === 'PlaneGeometry') c.flat++;
      if (o.scale && !(isFinite(o.scale.x) && isFinite(o.scale.y)) || (o.position && !isFinite(o.position.y))) c.bad++; });
    return c; };
  const run = (sec) => { for (let i = 0; i < sec / 0.05; i++) FX.update(0.05); };
  const base = census();
  FX.explosion(new THREE.Vector3(0, 0.3, 0), 9);                        // a frag, on the ground
  const frag = census();
  ok(frag.sprites >= 40 && frag.sprites <= 62 && frag.glow >= 8 && frag.fire >= 30, 'a frag is ' + frag.sprites + ' billows: ' + frag.fire + ' of fire and smoke with a body, ' + frag.glow + ' of glow drawn over them');
  ok(frag.points === 1 && frag.ring === 1 && frag.flat === 1, 'with one cloud of embers, one ring running out along the ground and one scorch left on it');
  ok(frag.lights === base.lights + 1, 'and ONE lamp for its light');
  FX.update(0.1);
  let r = 0, g = 0, b = 0, n = 0; scene.traverse(o => { if (o.isSprite && o.visible && o.material.blending !== THREE.AdditiveBlending && o.material.opacity > 0.6) { r += o.material.color.r; g += o.material.color.g; b += o.material.color.b; n++; } });
  ok(n >= 10 && r / n > 0.97 && g / n > 0.6 && g / n < 0.92 && b / n < 0.45, 'a tenth of a second in, the fire is YELLOW-orange (red ' + (r / n).toFixed(2) + ', green ' + (g / n).toFixed(2) + ', blue ' + (b / n).toFixed(2) + ' over ' + n + ' billows)');
  let rising = 0; const y0 = []; scene.traverse(o => { if (o.isSprite) y0.push([o, o.position.y]); }); run(1.0); y0.forEach(p => { if (p[0].parent && p[0].position.y > p[1] + 1) rising++; });
  ok(rising >= 12, 'a second later ' + rising + ' of them have climbed more than a metre: the stem and the cap');
  ok(census().bad === 0, 'nothing in it is at a not-a-number size or place');
  run(20);
  const after = census();
  ok(after.sprites === 0 && after.points === 0 && after.ring === 0 && after.flat === 0, 'twenty seconds on it is all gone: no billow, ember, ring or scorch left in the scene');
  for (let i = 0; i < 6; i++) { FX.explosion(new THREE.Vector3(i * 3, 0.3, 0), 7); FX.update(0.05); }
  ok(census().lights === base.lights + 1, 'six more blasts, and still one lamp — it is switched on and off, never added (adding a light rebuilds every lit shader)');
  run(20);
  FX.explosion(new THREE.Vector3(0, 0.1, 0));                           // a mine: called with no radius at all
  const mine = census();
  ok(mine.sprites >= 25 && mine.bad === 0, 'a mine\'s blast — called with NO radius, which used to scale its fireball by NaN and draw none — is ' + mine.sprites + ' billows of finite size');
  run(20);
  FX.explosion(new THREE.Vector3(0, 0.2, 0), 1.2);                      // a flashbang's pop
  const pop = census();
  ok(pop.sprites <= 12 && pop.ring === 0 && pop.points === 0 && pop.flat === 0, 'a flashbang\'s pop stays a pop: ' + pop.sprites + ' sprites, no ring, no embers, no scorch, no mushroom');
  run(20);
  ground = false; FX.explosion(new THREE.Vector3(0, 22, 0), 9); const air = census(); ground = true;
  ok(air.ring === 0 && air.flat === 0 && air.sprites >= 30, 'an airburst has no ring on the ground and leaves no scorch');
  run(20);
  tier = 'potato'; FX.explosion(new THREE.Vector3(0, 0.3, 0), 9); const low = census(); tier = 'high';
  ok(low.sprites <= frag.sprites * 0.5 && low.sprites >= 12, 'on the lowest quality tier the same frag is ' + low.sprites + ' billows instead of ' + frag.sprites);
  const fx = read('public/src/effects/effects.js');
  ok(!/new THREE\.PointLight\(0xffa050, 3, radius \* 3\.2, 2\)/.test(fx) && /if \(blastLight\.parent !== scene\) scene\.add\(blastLight\);/.test(fx), 'the old per-blast light is gone from the source');
}

/* ------------------------------------------------------------------ L */
(async function live() {
  const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
  let ioc; try { ioc = require('socket.io-client'); } catch (e) { ioc = null; }
  const URL = process.env.URL || 'http://localhost:3000';
  const up = ioc && await new Promise(r => { const s = ioc(URL, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 1500 }); s.on('connect', () => { s.disconnect(); r(true); }); s.on('connect_error', () => r(false)); setTimeout(() => r(false), 2000); });
  if (!up) { console.log('--- L. live: SKIPPED (no server on ' + URL + ' — npm start, then run again) ---'); return done(); }
  console.log('--- L. live: a driver, a thrower, a real server ---');
  const wait = ms => new Promise(r => setTimeout(r, ms)), ack = (s, ev, d) => new Promise(r => { const t = setTimeout(() => r(null), 2500); s.emit(ev, d, x => { clearTimeout(t); r(x); }); });
  const mk = async () => { const s = ioc(URL, { transports: ['websocket'], forceNew: true }); await new Promise(r => s.on('connect', r)); return s; };
  const A = await mk(), T = await mk();
  const st = { start: null, spawn: {}, boom: [], deaths: [], dmg: [], vh: {} };
  A.on('matchStart', d => { st.start = d; });
  [A, T].forEach(s => s.on('spawn', d => { if (d.id === s.id) st.spawn[s.id] = d; }));
  T.on('vehBoom', d => st.boom.push(d)); T.on('death', d => st.deaths.push(d)); A.on('damaged', d => st.dmg.push(d));
  T.on('snap', d => { if (d.vh) d.vh.v.forEach(r => { st.vh[r[0]] = r; }); });
  const res = await ack(A, 'createRoom', { name: 'Driver', settings: { mode: 'ffa', map: 'urban', minutes: 10, killTarget: 0, backfill: false } });
  await ack(T, 'joinRoom', { name: 'Thrower', code: res.code });
  A.emit('setReady', { v: true }); T.emit('setReady', { v: true }); await wait(300); A.emit('startMatch');
  for (let i = 0; i < 100 && !(st.start && st.spawn[A.id] && st.spawn[T.id]); i++) await wait(100);
  const list = (st.start && st.start.vehicles && st.start.vehicles.v) || [], types = Object.keys(V.types);
  const car = list.find(r => types[r[1]] === 'car');
  if (!car) { ok(false, 'the match started with a sedan on the map'); return done(); }
  /* the thrower stands 22 m from the sedan on the side nearer the middle of the map — a bay on the ring
     road is 6 m from the map's edge, and a position past the edge is one the server does not accept */
  const cd = Math.hypot(car[2], car[4]) || 1;
  const seatPos = [car[2] + 1.8, car[3] + 0.97, car[4]], tp = [car[2] - car[2] / cd * 22, car[3] + 0.97, car[4] - car[4] / cd * 22];
  const say = (s, p) => s.emit('st', { p, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 });
  say(A, seatPos); say(T, tp);
  const hb = setInterval(() => { say(T, tp); say(A, [car[2], car[3] + 0.9, car[4]]); }, 100);
  await wait(250);
  const en = await ack(A, 'vehEnter', { id: car[0] });
  ok(en && en.ok && en.seat === 0, 'the driver is in the sedan');
  await wait((CFG.spawnProtectFor ? CFG.spawnProtectFor('urban') : 3) * 1000 + 600);
  const at = [car[2] + 2.2, car[3] + 0.4, car[4]], hull = () => (st.vh[car[0]] ? st.vh[car[0]][7] : car[7]);
  const h0 = hull();
  /* explosions nobody threw */
  for (let k = 0; k < 6; k++) { T.emit('blast', { p: at, w: 'frag' }); await wait(60); }
  await wait(400);
  ok(hull() === h0 && st.boom.length === 0, 'six reported explosions with no frag thrown do nothing to the hull [' + h0 + ' → ' + hull() + ']');
  /* three thrown, with the damage claim a client would send for the driver */
  for (let k = 0; k < 3; k++) {
    T.emit('throw', { type: 'frag', o: tp, v: [-8, 3, 0], f: 1.2 }); await wait(120);
    T.emit('blast', { p: at, w: 'frag' }); T.emit('hit', { victim: A.id, w: 'frag', dmg: 100, part: 'body', vp: [car[2], car[3] + 0.9, car[4]] }); await wait(350);
  }
  ok(hull() === h0 - 3 * B.frag && st.boom.length === 0, 'three frags thrown beside it: the hull is down by three [' + h0 + ' → ' + hull() + '], the sedan still there');
  ok(st.dmg.length === 0 && st.deaths.length === 0, 'and the driver has taken NOTHING from them, though the client claimed 100 each time');
  T.emit('throw', { type: 'frag', o: tp, v: [-8, 3, 0], f: 1.2 }); await wait(120); T.emit('blast', { p: at, w: 'frag' }); await wait(500);
  const d = st.deaths.find(x => x.victimId === A.id);
  ok(st.boom.some(b => b.id === car[0]) && d && d.weapon === 'vehicle' && d.killerId === T.id, 'the fourth blows it up with the driver inside — the kill is the thrower\'s, tagged "vehicle"');
  clearInterval(hb); A.disconnect(); T.disconnect();
  done();
})().catch(e => { console.log('  FAIL  live section threw: ' + (e && e.message)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
