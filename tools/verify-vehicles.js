/* verify-vehicles — VEHICLES ON URBAN (v2.13).

   Rahul: "bike, car, bus, tank, auto in the urban big map ... PUBG style mei
   road pe khade rahenge, usko lekar drive kar sakte hai ... vehicle ka bhi ek
   life ho jisko shoot karne se vehicle blast ho, petrol ho, lights and horn ho
   aur player ko car se hit karne se health opponent ka down ho, vehicle ko
   blast karne usme jo players honge woh 100% kill ... smooth ... server pe
   utna pressure na ho."

   A. THE TABLE AND THE PARKING SPOTS: five types, a mix, every spot on a road,
      clear of every collider and of the railway, spread over the city.
   B. THE SERVER (server/lib/vehicles.js) on a fake room: seats, the driver's
      pose and its speed check, petrol that only goes down, lights, the horn's
      rate limit, bullets on the hull by armour, the blast that kills everyone
      aboard, replacement, ramming, the tank's crew, no tank in Bot Ops — and
      what it costs on the wire.
   C. THE CLIENT (public/src/vehicles/vehicles.js) run headless against Urban's
      real colliders: the five models, driving that never ends inside a wall
      or off the map, top speeds, petrol, the hull as a bullet target, a place
      to stand when you get out.
   D. LIVE (only when a server answers on :3000): two sockets — get in, drive,
      shoot from the seat, be seen driving, run somebody over, be blown up.

   Run: node tools/verify-vehicles.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const Bots = require(path.join(ROOT, 'server/lib/bots.js'))({});
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
const V = CFG.VEHICLES, SPOTS = (CFG.VEHICLE_SPOTS || {}).urban || [];

/* ---------------- A. table and spots ---------------- */
console.log('--- A. the table and the parking spots ---');
ok(V && ['bike', 'auto', 'car', 'bus', 'tank'].every(t => V.types[t]) && V.maps.join() === 'urban', 'five types — bike, auto, car, bus, tank — on Urban only');
ok(V.mix.length === V.count && ['bike', 'auto', 'car', 'bus', 'tank'].every(t => V.mix.indexOf(t) >= 0), V.count + ' parked at match start: ' + ['car', 'bike', 'auto', 'bus', 'tank'].map(t => V.mix.filter(x => x === t).length + ' ' + t).join(', '));
ok(Object.values(V.types).every(T => T.hp > 0 && T.max > 0 && T.burn > 0 && T.seatsAt.length === T.seats && T.len > T.wid), 'every type has health, a top speed, a petrol burn and a place for each seat');
ok(V.types.bike.max > V.types.car.max && V.types.car.max > V.types.bus.max && V.types.bus.max > V.types.tank.max && V.types.tank.hp > V.types.bus.hp * 2 && V.types.tank.sealed,
  'the bike is quickest (' + (V.types.bike.max * 3.6).toFixed(0) + ' km/h), the tank slowest (' + (V.types.tank.max * 3.6).toFixed(0) + ') and by far the toughest (' + V.types.tank.hp + ' hull)');
const cols = Bots.buildColliders('urban'), roads = Bots.groundFor('urban').filter(r => r[4] === 'road');
const hullHits = (x, y, z, ry, T, grow) => {
  /* axis-aligned bays (every spot faces along x or z) */
  const alongX = Math.abs(Math.sin(ry)) > 0.5, hx = (alongX ? T.len : T.wid) / 2 + (grow || 0), hz = (alongX ? T.wid : T.len) / 2 + (grow || 0);
  for (const c of cols) if (x + hx > c[0] && x - hx < c[3] && z + hz > c[2] && z - hz < c[5] && y + T.hgt > c[1] + 0.02 && y + 0.5 < c[4] - 0.02) return true;
  return false;
};
ok(SPOTS.length >= 60, SPOTS.length + ' parking spots generated for Urban (tools/gen-vehicle-spots.js)');
ok(SPOTS.every(s => roads.some(r => s[0] >= r[0] && s[0] <= r[2] && s[1] !== undefined && s[2] >= r[1] && s[2] <= r[3])), 'every spot is on a road the map itself laid (' + roads.length + ' road planes)');
ok(SPOTS.every(s => !hullHits(s[0], s[1], s[2], s[3], s[4] ? V.types.bus : V.types.car, 0)) && SPOTS.filter(s => s[4]).every(s => !hullHits(s[0], s[1], s[2], s[3], V.types.tank, 0)),
  'the largest vehicle each spot may hold touches no collider (bus and tank in the ' + SPOTS.filter(s => s[4]).length + ' long bays)');
{
  let minGap = 1e9; for (let i = 0; i < SPOTS.length; i++) for (let j = i + 1; j < SPOTS.length; j++) minGap = Math.min(minGap, Math.hypot(SPOTS[i][0] - SPOTS[j][0], SPOTS[i][2] - SPOTS[j][2]));
  const q = [0, 0, 0, 0]; SPOTS.forEach(s => { q[(s[0] >= 0 ? 1 : 0) + (s[2] >= 0 ? 2 : 0)]++; });
  ok(minGap >= 25 && Math.min.apply(null, q) >= 10, 'spread over the city: no two closer than ' + minGap.toFixed(0) + ' m, by quarter ' + q.join(' / '));
  const rail = []; (function walk(o, d) { if (!o || d > 4) return; if (Array.isArray(o)) { if (o.length >= 2 && typeof o[0] === 'number') { rail.push(o.length >= 3 ? [o[0], o[2]] : [o[0], o[1]]); return; } o.forEach(x => walk(x, d + 1)); return; }
    if (typeof o === 'object') { if (typeof o.x === 'number' && typeof o.z === 'number') { rail.push([o.x, o.z]); return; } Object.keys(o).forEach(k => walk(o[k], d + 1)); } })(Bots.trainPath('urban'), 0);
  const seg = (px, pz, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz || 1; let t = ((px - a[0]) * vx + (pz - a[1]) * vz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t); };
  let nearest = 1e9; SPOTS.forEach(s => { for (let i = 0; i + 1 < rail.length; i++) if (Math.hypot(rail[i + 1][0] - rail[i][0], rail[i + 1][1] - rail[i][1]) < 90) nearest = Math.min(nearest, seg(s[0], s[2], rail[i], rail[i + 1])); });
  ok(rail.length > 4 && nearest >= 7, 'none on the railway: the nearest spot is ' + nearest.toFixed(1) + ' m from the train\'s path');
}

/* ---------------- B. the server ---------------- */
console.log('--- B. the server ---');
function fakeRoom(mode) {
  const clock = { t: 5e6 }, sent = [], dmg = [];
  const room = { code: 'VEH', state: 'playing', settings: { mode: mode || 'ffa', map: 'urban' }, players: new Map() };
  const io = { to: () => ({ emit: (ev, d) => sent.push([ev, d]) }) };
  const applyDamage = (r, v, amount, by, w, head, pb) => { dmg.push({ v: v.id, amount, by, w }); if (amount >= 999) v.alive = false; else v.hp -= amount; };
  const Veh = require(path.join(ROOT, 'server/lib/vehicles.js'))({ CFG, io, now: () => clock.t, applyDamage, modeInfo: () => ({ teams: !!(CFG.MODES[room.settings.mode] || {}).teams }) });
  const add = (id, x, y, z, team) => { const p = { id, alive: true, hp: 100, pos: [x, y, z], team: team || null, connected: true }; room.players.set(id, p); return p; };
  return { room, Veh, clock, sent, dmg, add };
}
{
  const F = fakeRoom('ffa'), first = F.Veh.start(F.room), L = F.room.veh.list;
  ok(first && first.f === 1 && first.v.length === V.count && L.length === V.count, 'a match on Urban starts with ' + L.length + ' vehicles; the matchStart payload carries all of them');
  ok(V.mix.every((t, i) => L[i].type === t) && L.every(v => !V.types[v.type].big || SPOTS[v.spot][4]), 'the mix is dealt as configured and every bus and tank got a long bay');
  let gap = 1e9; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) gap = Math.min(gap, Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z));
  ok(gap >= 14 && L.every(v => v.fuel >= V.fuelMin && v.fuel <= 100 && v.hp === V.types[v.type].hp), 'no two parked within ' + gap.toFixed(0) + ' m; each has a full hull and ' + V.fuelMin + '-100 petrol [' + Math.min.apply(null, L.map(v => v.fuel)) + '-' + Math.max.apply(null, L.map(v => v.fuel)) + ']');
  const kill = fakeRoom('killhouse'); kill.room.settings.map = 'killhouse';
  ok(kill.Veh.start(kill.room) === null && !kill.room.veh, 'no vehicles on any other map');
  /* seats */
  const car = L.find(v => v.type === 'car'), A = F.add('A', car.x + 30, 1, car.z), B = F.add('B', car.x + 1.5, 1, car.z), C = F.add('C', car.x - 1.5, 1, car.z);
  ok(F.Veh.enter(F.room, A, { id: car.id }).ok === false, 'a player 30 m away cannot get in');
  const eb = F.Veh.enter(F.room, B, { id: car.id }), ec = F.Veh.enter(F.room, C, { id: car.id });
  ok(eb.ok && eb.seat === 0 && ec.ok && ec.seat === 1, 'the first to get in drives, the second rides');
  ok(F.sent.filter(m => m[0] === 'vehSeat').length === 2 && F.Veh.enter(F.room, B, { id: car.id }).ok === false, 'the room is told who sits where; nobody takes two seats');
  /* the driver's pose */
  F.clock.t += 50; F.Veh.drive(F.room, C, { id: car.id, p: [car.x + 1, car.y, car.z], ry: 0, sp: 5 });
  const x0 = car.x;
  ok(car.x === x0 && car.sp === 0, 'only the driver moves it — a passenger\'s report is ignored');
  F.clock.t += 50; F.Veh.drive(F.room, B, { id: car.id, p: [car.x + 1, car.y, car.z], ry: 1.2, sp: 20, f: car.fuel - 0.3, l: 1 });
  const moved = car.x - x0;
  F.clock.t += 50; F.Veh.drive(F.room, B, { id: car.id, p: [car.x + 80, car.y, car.z], ry: 0, sp: 20 });
  ok(Math.abs(moved - 1) < 1e-6 && car.x === x0 + 1, 'the driver\'s pose is kept; an 80 m jump in 50 ms is not');
  const fuelWas = car.fuel; F.clock.t += 50; F.Veh.drive(F.room, B, { id: car.id, p: [car.x + 0.5, car.y, car.z], ry: 0, sp: 10, f: 100, l: 1 });
  ok(car.fuel === fuelWas && car.lit === 1, 'petrol only goes down on a driver\'s say-so (a "refill" to 100 is ignored); the headlights follow the driver\'s switch');
  const delta = F.Veh.snapshot(F.room, false), key = F.Veh.snapshot(F.room, true), quiet = F.Veh.snapshot(F.room, false);
  ok(delta && delta.f === 0 && delta.v.length === 1 && delta.v[0][0] === car.id && delta.v[0].length === 10, 'a snapshot carries only what moved: 1 vehicle of ' + L.length + ' [id, type, x, y, z, facing, speed, hull, petrol, lights]');
  ok(key.f === 1 && key.v.length === L.length && key.s[car.id][0] === 'B' && quiet === null, 'a keyframe carries all of them and the seats; with nothing moving, nothing is sent');
  console.log('        on the wire: ' + JSON.stringify(delta).length + ' bytes per moving vehicle per snapshot, ' + JSON.stringify(key).length + ' bytes for all ' + L.length + ' on a keyframe, 0 bytes while they are parked');
  ok(JSON.stringify(delta).length < 90 && JSON.stringify(key).length < 1500, 'light on the server: no physics, no per-tick work for a parked vehicle, under 90 bytes a snapshot for a moving one');
  /* horn */
  F.sent.length = 0; F.Veh.horn(F.room, B); F.Veh.horn(F.room, B); F.Veh.horn(F.room, C); F.clock.t += 500; F.Veh.horn(F.room, B);
  ok(F.sent.filter(m => m[0] === 'vehHorn').length === 2, 'the horn is the driver\'s, relayed to the room, at most about twice a second');
  /* speed budget */
  ok(F.Veh.speedCap(F.room, B) === V.types.car.max * 1.5 && F.Veh.speedCap(F.room, A) === 0, 'a rider may move at vehicle speed in the position check (' + (V.types.car.max * 1.5).toFixed(1) + ' m/s); a walker gets the walker\'s budget');
  /* ramming */
  const victim = F.add('Vic', car.x + 2, 1, car.z), far = F.add('Far', car.x + 40, 1, car.z);
  car.sp = 2; F.Veh.ram(F.room, B, { id: car.id, victim: 'Vic' });
  const slow = F.dmg.length;
  car.sp = 6; F.clock.t += 1000; F.Veh.ram(F.room, B, { id: car.id, victim: 'Vic' });
  const mid = F.dmg[F.dmg.length - 1];
  F.Veh.ram(F.room, B, { id: car.id, victim: 'Vic' });
  const repeat = F.dmg.length;
  car.sp = 12; F.Veh.ram(F.room, B, { id: car.id, victim: 'Far' }); F.Veh.ram(F.room, B, { id: car.id, victim: 'C' });
  ok(slow === 0 && mid && mid.v === 'Vic' && mid.by === 'B' && mid.w === 'vehicle' && mid.amount === 6 * V.ramDmg && repeat === slow + 1 && F.dmg.length === repeat,
    'running a player over: nothing below ' + V.ramMin + ' m/s, ' + (6 * V.ramDmg) + ' damage at 6 m/s, once per bump, not at 40 m and never your own passenger');
  F.clock.t += 1000; F.Veh.ram(F.room, B, { id: car.id, victim: 'Vic' });
  ok(F.dmg[F.dmg.length - 1].amount >= 999 && !victim.alive, 'at ' + V.ramKill + ' m/s or more it is a kill outright');
  /* bullets and the blast */
  const S = F.add('S', car.x + 20, 1, car.z);
  const hp0 = car.hp; F.Veh.hit(F.room, S, { id: car.id, w: 'ak47', n: 1 }); F.Veh.hit(F.room, S, { id: car.id, w: 'ak47', n: 1 });
  ok(Math.abs(hp0 - car.hp - CFG.WEAPONS.ak47.dmg * V.types.car.armor) < 1e-6, 'a rifle round takes ' + (CFG.WEAPONS.ak47.dmg * V.types.car.armor) + ' off a sedan\'s ' + V.types.car.hp + ' hull, and no faster than the rifle fires');
  let shots = 2; F.sent.length = 0; F.dmg.length = 0;
  while (F.Veh.find(F.room, car.id) && shots < 400) { F.clock.t += 120; F.Veh.hit(F.room, S, { id: car.id, w: 'ak47', n: 1 }); shots++; }
  const boom = F.sent.find(m => m[0] === 'vehBoom');
  ok(!F.Veh.find(F.room, car.id) && boom && boom[1].id === car.id, 'shoot it enough and it blows up: ' + (shots - 1) + ' AK rounds for a sedan');
  ok(F.dmg.length === 2 && F.dmg.every(d => d.amount >= 999 && d.w === 'vehicle' && d.by === 'S') && !B.alive && !C.alive, 'everyone aboard dies with it — driver and passenger — credited to whoever blew it up');
  F.Veh.tick(F.room); const n1 = F.room.veh.list.length; F.clock.t += V.respawnSec * 1000 + 100;
  for (let i = 0; i < 40 && F.room.veh.list.length === n1; i++) F.Veh.tick(F.room);
  ok(n1 === V.count - 1 && F.room.veh.list.length === V.count && F.room.veh.list[V.count - 1].type === 'car', 'a destroyed vehicle is replaced ' + V.respawnSec + ' s later at a free spot away from players');
  /* dead rider */
  const bike = F.room.veh.list.find(v => v.type === 'bike'), R = F.add('R', bike.x + 1, 1, bike.z);
  F.Veh.enter(F.room, R, { id: bike.id }); R.alive = false; F.Veh.tick(F.room);
  ok(bike.seats[0] === null && bike.sp === 0 && bike.lit === 0, 'a rider who dies in the saddle leaves it; the engine and lights go off');
  /* rockets, tank */
  const tank = F.room.veh.list.find(v => v.type === 'tank'), T1 = F.add('T1', tank.x + 2, 1, tank.z), bus = F.room.veh.list.find(v => v.type === 'bus');
  F.Veh.enter(F.room, T1, { id: tank.id });
  /* the shooter walks to what it shoots: spots are shuffled every match and a hit claimed from past 420 m is refused */
  S.pos = [tank.x + 25, 1, tank.z];
  const t0 = tank.hp; F.clock.t += 5000; F.Veh.hit(F.room, S, { id: tank.id, w: 'ak47', n: 1 }); const tAk = t0 - tank.hp;
  F.clock.t += 5000; F.Veh.hit(F.room, S, { id: tank.id, w: 'rocket', n: 1 }); const tRk = t0 - tAk - tank.hp;
  S.pos = [bus.x + 25, 1, bus.z];
  const b0 = bus.hp; F.clock.t += 5000; F.Veh.hit(F.room, S, { id: bus.id, w: 'rocket', n: 1 });
  ok(tAk === CFG.WEAPONS.ak47.dmg * V.types.tank.armor && tRk === CFG.WEAPONS.rocket.dmg * V.types.tank.blast && F.Veh.shields(F.room, T1) && !F.Veh.shields(F.room, S),
    'the tank shrugs off rifles (' + tAk + ' a round of ' + V.types.tank.hp + ') and its crew cannot be shot; a rocket takes ' + tRk + ' — ' + Math.ceil(V.types.tank.hp / tRk) + ' rockets to kill it');
  ok(b0 - bus.hp === CFG.WEAPONS.rocket.dmg * 6, 'a rocket takes ' + (b0 - bus.hp) + ' off a bus (' + V.types.bus.hp + ') — two finish it; one finishes a sedan');
  /* v2.13.1: riders fire */
  {
    const R2 = fakeRoom('ffa'); R2.Veh.start(R2.room);
    const c1 = R2.room.veh.list.find(v => v.type === 'car'), c2 = R2.room.veh.list.filter(v => v.type === 'car')[1], tk = R2.room.veh.list.find(v => v.type === 'tank');
    const D1 = R2.add('D1', c1.x + 1.5, 1, c1.z), TC = R2.add('TC', tk.x + 2, 1, tk.z);
    R2.Veh.enter(R2.room, D1, { id: c1.id }); R2.Veh.enter(R2.room, TC, { id: tk.id });
    const own = c1.hp, other = c2.hp;
    R2.Veh.hit(R2.room, D1, { id: c1.id, w: 'ak47', n: 1 }); R2.clock.t += 500; D1.pos = [c2.x + 25, 1, c2.z]; R2.Veh.hit(R2.room, D1, { id: c2.id, w: 'ak47', n: 1 }); R2.clock.t += 500; TC.pos = [c2.x - 25, 1, c2.z]; R2.Veh.hit(R2.room, TC, { id: c2.id, w: 'ak47', n: 1 });
    ok(c1.hp === own && other - c2.hp === CFG.WEAPONS.ak47.dmg * V.types.car.armor, 'a rider can shoot ANOTHER vehicle (' + (other - c2.hp) + ' off it), never the one they sit in; the tank\'s sealed crew shoots nothing');
    const T2 = fakeRoom('tdm'); if (!CFG.MODES.tdm || !CFG.MODES.tdm.teams) T2.room.settings.mode = Object.keys(CFG.MODES).find(m => CFG.MODES[m].teams && !CFG.MODES[m].bots);
    T2.Veh.start(T2.room);
    const tc = T2.room.veh.list.find(v => v.type === 'car'), a1 = T2.add('a1', tc.x + 1.5, 1, tc.z, 'a'), b1 = T2.add('b1', tc.x - 1.5, 1, tc.z, 'b'), a2 = T2.add('a2', tc.x, 1, tc.z + 1.5, 'a');
    const e1 = T2.Veh.enter(T2.room, a1, { id: tc.id }), e2 = T2.Veh.enter(T2.room, b1, { id: tc.id }), e3 = T2.Veh.enter(T2.room, a2, { id: tc.id });
    ok(e1.ok && !e2.ok && /Enemy/.test(e2.err) && e3.ok && e3.seat === 1, 'in a team mode a vehicle carries one side: a team-mate rides, an enemy is refused ("' + e2.err + '") — riders shoot now, so the seat beside you is not on offer');
  }
  const bots = fakeRoom('bom'); bots.Veh.start(bots.room);
  ok(bots.room.veh.list.length === V.count && !bots.room.veh.list.some(v => v.type === 'tank'), 'no tank in Bot Ops (nothing an operator carries can hurt one) — a sedan stands in its bay');
}

/* ---------------- C. the client ---------------- */
console.log('--- C. the client, against Urban\'s real colliders ---');
{
  /* World: the two questions the vehicle code asks, answered from the colliders */
  const G = 8, grid = new Map(), big = [];
  cols.forEach((c, i) => { if (c[3] - c[0] > 200 || c[5] - c[2] > 200) { big.push(i); return; }
    for (let a = Math.floor(c[0] / G); a <= Math.floor(c[3] / G); a++) for (let b = Math.floor(c[2] / G); b <= Math.floor(c[5] / G); b++) { const k = a + ',' + b; let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(i); } });
  const near = (x0, z0, x1, z1) => { const out = big.slice(), seen = new Set(); for (let a = Math.floor(x0 / G); a <= Math.floor(x1 / G); a++) for (let b = Math.floor(z0 / G); b <= Math.floor(z1 / G); b++) { const arr = grid.get(a + ',' + b); if (arr) for (const i of arr) if (!seen.has(i)) { seen.add(i); out.push(i); } } return out; };
  const World = {
    builtMap: 'urban', colliders: cols,
    fits(cx, cy, cz, hx, hy, hz) { for (const i of near(cx - hx, cz - hz, cx + hx, cz + hz)) { const c = cols[i]; if (cx + hx > c[0] && cx - hx < c[3] && cy + hy > c[1] && cy - hy < c[4] && cz + hz > c[2] && cz - hz < c[5]) return false; } return true; },
    rayHit(o, d, max) { let best = max, hit = null; const x1 = o.x + d.x * max, z1 = o.z + d.z * max;
      for (const i of near(Math.min(o.x, x1) - 0.1, Math.min(o.z, z1) - 0.1, Math.max(o.x, x1) + 0.1, Math.max(o.z, z1) + 0.1)) { const c = cols[i]; let t0 = 0, t1 = best, okk = true;
        for (let ax = 0; ax < 3; ax++) { const oo = ax === 0 ? o.x : ax === 1 ? o.y : o.z, dd = ax === 0 ? d.x : ax === 1 ? d.y : d.z, mn = c[ax], mx = c[ax + 3];
          if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) { okk = false; break; } continue; }
          let ta = (mn - oo) / dd, tb = (mx - oo) / dd; if (ta > tb) { const s = ta; ta = tb; tb = s; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { okk = false; break; } }
        if (okk && t0 < best) { best = t0; hit = c; } }
      return hit ? { t: best, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best) } : null; }
  };
  const clock = { t: 1000 }, emitted = [], toasts = [];
  const PlayerCtl = { pos: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true };
  const Net = { getMyId: () => 'me', emitVeh(ev, d, cb) { emitted.push([ev, d, clock.t]); if (ev === 'vehEnter' && cb) cb({ ok: true, seat: 0, id: d.id }); }, eachRemote() {} };
  const ctx = { THREE, CFG, World, PlayerCtl, Net, UI: { toast: m => toasts.push(m) }, performance: { now: () => clock.t }, console, Math, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/vehicles/vehicles.js'), 'utf8') + '\nthis.Vehicles = Vehicles;', ctx, { filename: 'vehicles.js' });
  const Vehicles = ctx.Vehicles;
  /* the models */
  const info = {};
  for (const type of Object.keys(V.types)) {
    const g = Vehicles._build(type, 0xb8312f); let tris = 0; const box = new THREE.Box3();
    g.traverse(o => { if (o.isMesh && o !== g.userData.beams && (g.userData.figures || []).indexOf(o.parent) < 0) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); tris += o.geometry.attributes.position.count / 3; } });
    info[type] = { meshes: g.children.length, tris: Math.round(tris), len: box.max.z - box.min.z, wid: box.max.x - box.min.x, hgt: box.max.y, figs: (g.userData.figures || []).length, beams: !!g.userData.beams };
  }
  const T = V.types;
  ok(Object.keys(info).every(t => info[t].meshes <= 22 && info[t].tris < 2600), 'five models, merged by material: ' + Object.keys(info).map(t => t + ' ' + info[t].tris + ' triangles') .join(', '));
  ok(Object.keys(info).every(t => Math.abs(info[t].wid - T[t].wid) <= 0.55 && info[t].len >= T[t].len - 0.5 && info[t].len <= T[t].len + 1.5 && info[t].hgt >= T[t].hgt - 0.2 && info[t].hgt <= T[t].hgt + 1.2),
    'what you see is what you collide with: each model matches its hull box, bar what sticks out past it (mirrors, the tank\'s gun and aerial) [' + Object.keys(info).map(t => t + ' ' + info[t].len.toFixed(1) + 'x' + info[t].wid.toFixed(1) + 'x' + info[t].hgt.toFixed(1) + ' vs ' + T[t].len + 'x' + T[t].wid + 'x' + T[t].hgt).join(', ') + ']');
  /* v2.16.2: the box figures are gone — a rider is the operator itself, seated (tools/verify-rider.js) */
  ok(Object.keys(info).every(t => info[t].beams && info[t].figs === 0), 'every one has headlight beams, and no stand-in figures: whoever rides is drawn as their own avatar');
  /* a match */
  const F = fakeRoom('ffa'); const pkt = F.Veh.start(F.room);
  const scene = new THREE.Scene(); Vehicles.init(scene); Vehicles.sync(pkt); Vehicles.update(0.016);
  const list = Object.values(Vehicles._list());
  ok(list.length === V.count && scene.children.length >= V.count, 'the server\'s list becomes ' + list.length + ' vehicles in the scene');
  ok(list.every(v => Vehicles._hullFree(v, v.x, v.y, v.z, v.ry)), 'every parked vehicle is free to move in the CLIENT\'s own collision test (nobody starts wedged)');
  ok(list.every(v => { const s = Vehicles._exitSpot(v); return s && World.fits(s.x, s.y + 1.04, s.z, 0.36, 0.96, 0.36); }), 'and has room beside it to get out');
  /* driving every one of them with a seeded hand on the wheel */
  let seed = 77; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ext = CFG.MAPS.urban.ext || { x0: -300, x1: 300, z0: -300, z1: 300 };
  let bad = null, travelled = 0, top = {};
  for (const v of list) {
    PlayerCtl.pos.set(v.x + 1.5, v.y + 0.97, v.z); PlayerCtl.alive = true;
    Vehicles._mount(v, 0);
    const inp = { fwd: true, back: false, left: false, right: false, jump: false };
    for (let n = 0; n < 60 * 25; n++) {
      clock.t += 1000 / 60;
      if (n % 45 === 0 && n > 120) { const r = rnd(); inp.left = r < 0.25; inp.right = r > 0.75; inp.fwd = rnd() < 0.9; inp.back = !inp.fwd && rnd() < 0.5; inp.jump = rnd() < 0.05; }
      const px = v.x, pz = v.z;
      Vehicles.drive(1 / 60, inp);
      travelled += Math.hypot(v.x - px, v.z - pz);
      top[v.type] = Math.max(top[v.type] || 0, v.sp);
      if (!bad && (!isFinite(v.x + v.y + v.z + v.ry + v.sp) || v.x < ext.x0 || v.x > ext.x1 || v.z < ext.z0 || v.z > ext.z1 || Math.abs(v.sp) > v.T.max + 1e-6 || v.y < -1 || v.y > 12))
        bad = v.type + ' #' + v.id + ' at ' + [v.x, v.y, v.z].map(q => q.toFixed(1)) + ' sp ' + v.sp;
      if (!bad && n % 20 === 0 && !Vehicles._hullFree(v, v.x, v.y, v.z, v.ry)) bad = v.type + ' #' + v.id + ' ended inside something at ' + [v.x, v.y, v.z].map(q => q.toFixed(1));
    }
    const out = Vehicles._exitSpot(v); if (!bad && !out) bad = v.type + ' #' + v.id + ': nowhere to get out at ' + [v.x, v.z].map(q => q.toFixed(0));
    v.sp = 0; Vehicles.use(); clock.t += 1000;
  }
  ok(!bad, 'all ' + list.length + ' driven for 25 s each with a random hand on the wheel (' + (travelled / 1000).toFixed(1) + ' km): never inside a wall, never off the map, never above top speed, always somewhere to get out' + (bad ? ' [' + bad + ']' : ''));
  ok(Object.keys(T).every(t => top[t] > T[t].max * 0.8), 'each reaches its speed on Urban\'s roads: ' + Object.keys(T).map(t => t + ' ' + ((top[t] || 0) * 3.6).toFixed(0) + ' km/h').join(', '));
  const sends = emitted.filter(m => m[0] === 'veh'); let fastest = 1e9; for (let i = 1; i < sends.length; i++) if (sends[i][1].id === sends[i - 1][1].id) fastest = Math.min(fastest, sends[i][2] - sends[i - 1][2]);
  ok(sends.length > 1000 && fastest >= 48 && sends.every(m => m[1].p.length === 3 && typeof m[1].f === 'number'), 'the driver reports its pose at most ' + (1000 / fastest).toFixed(0) + ' times a second, petrol and lights included');
  /* petrol */
  const car = list.find(v => v.type === 'car'); PlayerCtl.pos.set(car.x + 1.5, car.y + 0.97, car.z); Vehicles._mount(car, 0);
  car.fuel = 0.5; car.sp = 0; const fx = car.x, fz = car.z; let dry = 0;
  for (let n = 0; n < 600; n++) { clock.t += 1000 / 60; Vehicles.drive(1 / 60, { fwd: true }); if (car.fuel <= 0) dry++; }
  const coast = Math.hypot(car.x - fx, car.z - fz), sAfter = car.sp;
  ok(car.fuel === 0 && dry > 300 && sAfter < 0.5 && coast < 60 && toasts.some(m => /PETROL/i.test(m)), 'out of petrol: the engine dies, it coasts ' + coast.toFixed(0) + ' m to a stop and says so');
  Vehicles.use(); clock.t += 1000;
  /* the hull as a target */
  const bus = list.find(v => v.type === 'bus'), sn = Math.sin(bus.ry), cs = Math.cos(bus.ry);
  const from = new THREE.Vector3(bus.x + cs * 12, bus.y + 1.6, bus.z + sn * 12), dir = new THREE.Vector3(-cs, 0, -sn);
  const h = Vehicles.rayHit(from, dir, 60), over = Vehicles.rayHit(new THREE.Vector3(from.x, bus.y + bus.T.hgt + 0.8, from.z), dir, 60), away = Vehicles.rayHit(from, new THREE.Vector3(cs, 0, sn), 60);
  ok(h && h.id === bus.id && Math.abs(h.t - (12 - bus.T.wid / 2)) < 0.05 && !over && (!away || away.id !== bus.id), 'a round fired at a bus from 12 m meets its side at ' + (h ? h.t.toFixed(2) : '?') + ' m; one over the roof or the other way does not');
  PlayerCtl.pos.set(bus.x + 2, bus.y + 0.97, bus.z); Vehicles._mount(bus, 1);
  ok(Vehicles.rayHit(from, dir, 60) === null || Vehicles.rayHit(from, dir, 60).id !== bus.id, 'the vehicle you sit in is never your own target');
  /* v2.13.1: riders fire */
  {
    Vehicles.use(); clock.t += 1000;
    const c = list.find(v => v.type === 'car'), tk = list.find(v => v.type === 'tank');
    PlayerCtl.pos.set(c.x + 1.5, c.y + 0.97, c.z); Vehicles._mount(c, 0); c.sp = 0;
    const drv0 = Vehicles.aimPenalty(), fireCar = Vehicles.canFire(); c.sp = c.T.max; const drv1 = Vehicles.aimPenalty();
    Vehicles.drive(1 / 60, {}); const mz = Vehicles.muzzle(new THREE.Vector3(), new THREE.Vector3(Math.sin(c.ry), 0, -Math.cos(c.ry))), off = mz.distanceTo(PlayerCtl.pos);
    c.sp = 0; Vehicles.use(); clock.t += 1000;
    PlayerCtl.pos.set(c.x + 1.5, c.y + 0.97, c.z); Vehicles._mount(c, 1); const pas0 = Vehicles.aimPenalty(); c.sp = c.T.max; const pas1 = Vehicles.aimPenalty(); c.sp = 0; Vehicles.use(); clock.t += 1000;
    PlayerCtl.pos.set(tk.x + 2, tk.y + 0.97, tk.z); Vehicles._mount(tk, 0); const fireTank = Vehicles.canFire(); Vehicles.use(); clock.t += 1000;
    ok(fireCar && !fireTank && Vehicles.canFire() === false, 'riders of an open vehicle can fire — driver and passengers; the tank\'s crew cannot; nobody on foot is "riding"');
    ok(pas0 >= 1.1 && pas1 > pas0 && drv0 > pas0 && drv1 > pas1 && drv1 <= 3.5, 'a seat is not a firing position: spread x' + pas0.toFixed(1) + ' for a passenger at rest, x' + pas1.toFixed(1) + ' flat out; x' + drv0.toFixed(1) + ' and x' + drv1.toFixed(1) + ' for the one steering');
    ok(off > 0.8 && off < 2, 'the round leaves from the rider (' + off.toFixed(1) + ' m from the seat, toward the aim), not from the chase camera behind the vehicle');
    const sys = fs.readFileSync(path.join(ROOT, 'public/src/weapons/system.js'), 'utf8'), gm = fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8'), sv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    ok(/if \(mineV && Vehicles\.riderOf\(id\) === mineV\) return;/.test(sys) && /if \(seatK\) spread = E\.spread \* seatK;/.test(sys) && /Vehicles\.muzzle\(out/.test(sys), 'the weapon code: co-riders are not in the line of fire, the seat penalty replaces the on-foot spread rules, the muzzle is the rider\'s');
    ok(/if \(e\.button === 0 && Vehicles\.canFire\(\)\) Weapons\.setTrigger\(true\); return;/.test(gm) && /Vehicles\.canFire\(\) && e\.code === 'KeyR'/.test(gm) && /if \(Vehicles\.shields\(room, shooter\)\) return;/.test(sv) && !/if \(Vehicles\.seatOf\(room, socket\.id\)\) return;/.test(sv),
      'left click fires and R reloads from a seat (no ADS — the right button does nothing there); the server accepts a rider\'s hit and refuses a sealed crew\'s');
  }
  ok(fs.readFileSync(path.join(ROOT, 'public/src/weapons/system.js'), 'utf8').indexOf("type: 'vehicle'") > 0 && fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8').indexOf("e.code === 'KeyN'") > 0, 'the weapon ray tests hulls, and N is bound');
}

/* ---------------- D. live ---------------- */
(async function live() {
  let ioc; try { ioc = require('socket.io-client'); } catch (e) { ioc = null; }
  const URL = process.env.URL || 'http://localhost:3000';
  const up = ioc && await new Promise(r => { const s = ioc(URL, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 1500 }); s.on('connect', () => { s.disconnect(); r(true); }); s.on('connect_error', () => r(false)); setTimeout(() => r(false), 2000); });
  if (!up) { console.log('--- D. live: SKIPPED (no server on ' + URL + ' — npm start, then run again) ---'); return done(); }
  console.log('--- D. live, two players on a real server ---');
  const wait = ms => new Promise(r => setTimeout(r, ms)), ack = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
  const mk = async () => { const s = ioc(URL, { transports: ['websocket'], forceNew: true }); await new Promise(r => s.on('connect', r)); return s; };
  const A = await mk(), B = await mk();
  const st = { start: null, spawn: {}, seat: [], boom: [], horn: [], deaths: [], dmg: [], vh: {}, vhN: 0 };
  A.on('matchStart', d => { st.start = d; });
  [A, B].forEach(s => s.on('spawn', d => { if (d.id === s.id) st.spawn[s.id] = d; }));
  B.on('vehSeat', d => st.seat.push(d)); B.on('vehBoom', d => st.boom.push(d)); B.on('vehHorn', d => st.horn.push(d));
  B.on('death', d => st.deaths.push(d)); B.on('damaged', d => st.dmg.push(d));
  B.on('snap', d => { if (d.vh) { st.vhN++; d.vh.v.forEach(r => { st.vh[r[0]] = r; }); } });
  const res = await ack(A, 'createRoom', { name: 'Driver', settings: { mode: 'ffa', map: 'urban', minutes: 10, killTarget: 0, backfill: false } });
  await ack(B, 'joinRoom', { name: 'Walker', code: res.code });
  A.emit('setReady', { v: true }); B.emit('setReady', { v: true }); await wait(300); A.emit('startMatch');
  for (let i = 0; i < 100 && !(st.start && st.spawn[A.id] && st.spawn[B.id]); i++) await wait(100);
  const list = (st.start && st.start.vehicles && st.start.vehicles.v) || [];
  ok(list.length === V.count, 'matchStart carries ' + list.length + ' vehicles');
  const car = list.find(r => Object.keys(V.types)[r[1]] === 'car');
  /* the first position after a spawn is taken as it comes: stand next to the car */
  const pa = [car[2] + 1.8, car[3] + 0.97, car[4]], ahead = [car[2] + Math.sin(car[5]) * 9, car[3] + 0.97, car[4] - Math.cos(car[5]) * 9];
  A.emit('st', { p: pa, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }); B.emit('st', { p: ahead, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 });
  const hb = setInterval(() => B.emit('st', { p: ahead, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }), 100);
  await wait(250);
  const en = await ack(A, 'vehEnter', { id: car[0] });
  await wait(250);
  ok(en && en.ok && en.seat === 0 && st.seat.some(d => d.id === car[0] && d.seats[0] === A.id), 'the driver gets in; the other player is told who is at the wheel');
  await wait((CFG.spawnProtectFor ? CFG.spawnProtectFor('urban') : 3) * 1000 + 600);
  A.emit('vehHorn', {});
  /* v2.13.1: the driver shoots the walker from the seat */
  A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: ahead }); await wait(350);
  const shot = st.dmg.length ? st.dmg[st.dmg.length - 1] : null;
  ok(shot && shot.dmg === CFG.WEAPONS.ak47.dmg, 'a rider\'s shot lands: the driver fires an AK from the seat and the walker takes ' + (shot ? shot.dmg : 'nothing'));
  /* drive at the walker: 5 m in 1 s */
  let x = car[2], z = car[4]; const fx = Math.sin(car[5]), fz = -Math.cos(car[5]);
  for (let i = 0; i < 20; i++) { x += fx * 0.25; z += fz * 0.25; A.emit('veh', { id: car[0], p: [x, car[3], z], ry: car[5], sp: 5, f: 50, l: 1 }); A.emit('st', { p: [x, car[3] + 0.5, z], ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }); await wait(50); }
  const dmgBefore = st.dmg.length;
  A.emit('vehRam', { id: car[0], victim: B.id });
  await wait(400);
  const seen = st.vh[car[0]];
  ok(seen && Math.hypot(seen[2] - x, seen[4] - z) < 1.5 && seen[9] === 1, 'the other player sees it drive in the snapshot — 5 m on, headlights lit — from ' + st.vhN + ' vehicle updates');
  ok(st.horn.some(d => d.id === car[0]), 'and hears the horn');
  ok(st.dmg.length > dmgBefore && st.dmg[st.dmg.length - 1].dmg === 5 * V.ramDmg, 'run over at 5 m/s (18 km/h): the walker takes ' + (st.dmg.length > dmgBefore ? st.dmg[st.dmg.length - 1].dmg : 'nothing') + ' more, weapon "vehicle"');
  /* blow it up with the driver aboard */
  clearInterval(hb);
  for (let i = 0; i < 6 && !st.boom.length; i++) { B.emit('vehHit', { id: car[0], w: 'rocket', n: 1 }); await wait(1700); }
  await wait(400);
  const dA = st.deaths.find(d => d.victimId === A.id);
  ok(st.boom.some(d => d.id === car[0]) && dA && dA.weapon === 'vehicle', 'a rocket on the hull: it blows up and the driver dies with it [' + (dA ? dA.weapon + ', credited to ' + dA.killerName : 'no death seen') + ']');
  A.disconnect(); B.disconnect();
  done();
})().catch(e => { console.error(e); fail++; done(); });
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
