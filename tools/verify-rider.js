/* verify-rider — A RIDER IS THE OPERATOR, SEATED (v2.16.2), offline.

   Rahul: "fix the avatar when on bike it is completely bad, it needs to be
   aligned with the current avatar layout."

   Since v2.13 a rider's avatar was hidden and vehicles.js showed five grey
   boxes at the seat. Now the avatar itself sits there. This gate builds real
   avatars and real vehicle models (three.js from npm), seats one on every
   seat of every open or glazed vehicle through the same two calls the game
   makes — Avatars.poseAvatar with Vehicles.seatOf's answer, then Vehicles.sit
   — and measures where the body ended up against the model it is sitting on.

   Run: node tools/verify-rider.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const T = CFG.VEHICLES.types;

/* a canvas that accepts every call (the name plate and the health bar are drawn on one) */
function fakeCanvas() {
  const grad = { addColorStop() {} };
  const g = new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad; if (k === 'measureText') return () => ({ width: 40 }); if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
  return { width: 0, height: 0, style: {}, getContext: () => g };
}
const ctx = { THREE, CFG, console, Math, Float32Array, Uint16Array, Uint32Array, document: { createElement: fakeCanvas }, performance: { now: () => 0 },
  World: { builtMap: 'urban', colliders: [] }, PlayerCtl: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true },
  Net: { getMyId: () => 'me', myId: () => 'me', emitVeh() {}, eachRemote() {} }, UI: { toast() {} } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(read('public/src/networking/avatars.js') + '\nthis.Avatars = Avatars;', ctx, { filename: 'avatars.js' });
vm.runInContext(read('public/src/vehicles/vehicles.js') + '\nthis.Vehicles = Vehicles;', ctx, { filename: 'vehicles.js' });
const A = ctx.Avatars, VV = ctx.Vehicles;

const world = (o) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new THREE.Vector3()); };
const base = { moved: 0, mx: 0, mz: 0, run: false, crouch: false, prone: false, dead: false, deadT: 0, rx: 0, ry: 0, lean: 0, reloading: false, dist: 4, dt: 0.05 };
function seatOne(type, k, opts) {
  opts = opts || {};
  const veh = { id: 1, type, T: T[type], x: opts.x || 0, y: 0, z: opts.z || 0, ry: opts.ry || 0, seats: [], group: VV._build(type, 0xb8312f) };
  veh.group.position.set(veh.x, 0, veh.z); veh.group.rotation.y = -veh.ry; veh.group.rotation.z = opts.roll || 0; veh.group.updateMatrixWorld(true);
  const av = A.buildAvatar('Rahul', '#d0412f');
  const st = { veh, k, kind: type, bike: type === 'bike', open: !T[type].sill, driver: k === 0, sealed: !!T[type].sealed, look: opts.look || 0 };
  for (let f = 0; f < 40; f++) A.poseAvatar(av, Object.assign({}, base, { seat: st }));
  VV.sit(av.group, st);
  av.group.updateMatrixWorld(true);
  /* the lowest point of a boot: the shin segment is 0.50 long under the knee, in rig units */
  const sole = (hip) => { const kn = hip.knee; kn.updateWorldMatrix(true, false); return new THREE.Vector3(0, -0.5, 0.05).applyMatrix4(kn.matrixWorld); };
  const hand = (arm) => { const el = arm.elbow; el.updateWorldMatrix(true, false); return new THREE.Vector3(0, -0.27, 0).applyMatrix4(el.matrixWorld); };
  return { veh, av, st, head: world(av.headMesh), hips: world(av.group), soleL: sole(av.hipL), soleR: sole(av.hipR), handL: hand(av.armL), handR: hand(av.armR) };
}

console.log('--- the rider is the avatar ---');
const vsrc = read('public/src/vehicles/vehicles.js'), nsrc = read('public/src/networking/net.js'), gsrc = read('public/src/core/game.js');
ok(Object.keys(T).every(t => (VV._build(t, 0xb8312f).userData.figures || []).length === 0) && !/fig\.box\(/.test(vsrc), 'the grey box figures are gone from every vehicle model');
ok(!/Vehicles\.isRider\(id\)\) r\.av\.group\.visible = false/.test(nsrc) && /if \(seatS && seatS\.sealed\) \{ r\.av\.group\.visible = false; seatS = null; \}\s*else if \(seatS\) r\.av\.group\.visible = true;/.test(nsrc),
  'a rider\'s own avatar is SHOWN (it was hidden since v2.13); only a tank\'s crew, behind armour, is not drawn');
ok(/seat: seatS,/.test(nsrc) && /if \(seatS\) Vehicles\.sit\(g, seatS\);/.test(nsrc) && nsrc.indexOf('if (seatS) Vehicles.sit(g, seatS);') < nsrc.indexOf('r.av.headMesh.getWorldPosition(r.headPos)'),
  'everyone else is posed seated and put on the seat BEFORE the head hit box is read from the drawn head — what you see is what you hit');
ok(/var ownSeat = \(riding && window\.Vehicles && Vehicles\.seatOf\) \? Vehicles\.seatOf\(Net\.myId\(\), PlayerCtl\.yaw\) : null;/.test(gsrc) && /seat: ownSeat,/.test(gsrc) && /if \(ownSeat\) Vehicles\.sit\(g2, ownSeat\);/.test(gsrc),
  'and so are you: aboard, your own operator is on the seat under the chase camera');

console.log('--- size: life size aboard, because the vehicles are ---');
{
  const s = seatOne('bike', 0), g = s.av.group.scale;
  ok(Math.abs(g.y - A.RIG.y * A.SEAT_K) < 1e-9 && Math.abs(g.y - 1) < 0.02 && Math.abs(g.x / g.y - A.RIG.x / A.RIG.y) < 1e-9,
    'aboard the rig is drawn at ' + A.SEAT_K + ' of its on-foot size: x' + g.y.toFixed(2) + ' of life, where on foot it is x' + A.RIG.y + ' (a 2.95 m operator on a 2.2 m motorbike)');
  const torso = s.head.y - s.hips.y;
  ok(torso > 0.6 && torso < 0.8, 'a seated rider is ' + torso.toFixed(2) + ' m from hip to the middle of the head — a person');
  ok(Math.abs(s.av.tagHolder.scale.y * g.y - 1) < 1e-9, 'the name plate and health bar stay the size they always are');
  /* off again */
  for (let f = 0; f < 40; f++) A.poseAvatar(s.av, Object.assign({}, base, { seat: null }));
  ok(Math.abs(s.av.group.scale.y - A.RIG.y) < 1e-9 && s.av.gun.visible === true && s.av.hipL.rotation.z === 0 && Math.abs(s.av.hipL.rotation.x) < 0.2 && s.av.seated === false,
    'getting off puts everything back: full size, standing, weapon in hand');
  /* a rider who is shot is a body, not a seated figure */
  const d = seatOne('bike', 1);
  A.poseAvatar(d.av, Object.assign({}, base, { dead: true, deadT: 0.4, seat: d.st }));
  ok(Math.abs(d.av.group.scale.y - A.RIG.y) < 1e-9 && d.av.seated === false, 'and a rider who is killed falls as a body, at full size');
}

console.log('--- the motorbike ---');
{
  const d = seatOne('bike', 0), p = seatOne('bike', 1);
  /* the model: saddle top 0.87, bars at y 1.08 z -0.62 and 0.72 wide, tank top 0.97 */
  ok(d.hips.y > 0.74 && d.hips.y < 0.92 && p.hips.y > 0.74 && p.hips.y < 0.92, 'both sit ON the saddle (its top is 0.87 m): hips at ' + d.hips.y.toFixed(2) + ' m');
  const reach = (h, sx) => Math.hypot(h.x - sx * 0.30, h.y - 1.08, h.z + 0.62);
  ok(Math.max(reach(d.handL, d.handL.x > 0 ? 1 : -1), reach(d.handR, d.handR.x > 0 ? 1 : -1)) < 0.16,
    'the driver\'s hands are on the bars: ' + (Math.max(reach(d.handL, d.handL.x > 0 ? 1 : -1), reach(d.handR, d.handR.x > 0 ? 1 : -1)) * 100).toFixed(0) + ' cm from the grips at worst');
  ok(d.soleL.y > 0.12 && d.soleL.y < 0.5 && Math.abs(d.soleL.x) > 0.16 && Math.abs(d.soleL.x) < 0.45 && d.soleL.x * d.soleR.x < 0,
    'a foot each side of the engine, off the ground: ' + d.soleL.y.toFixed(2) + ' m up, ' + Math.abs(d.soleL.x).toFixed(2) + ' m out');
  ok(d.av.spine.rotation.x > p.av.spine.rotation.x + 0.15 && d.av.gun.visible === false && p.av.gun.visible === true,
    'the driver leans over the tank with both hands busy (weapon slung); the pillion sits up and HAS the weapon — riders shoot');
  ok(p.hips.z - d.hips.z > 0.45 && p.head.z > d.head.z + 0.4, 'the pillion is behind the driver, not inside him (' + (p.hips.z - d.hips.z).toFixed(2) + ' m back)');
  /* looking */
  const pr = seatOne('bike', 1, { look: 1.1 }), dr = seatOne('bike', 0, { look: 1.1 });
  ok(Math.abs(pr.av.spine.rotation.y) > 0.6 && Math.abs(dr.av.spine.rotation.y) < 0.2 && Math.abs(dr.av.head.rotation.y) > 0.8,
    'aim to the side and the pillion\'s shoulders turn with the weapon; the driver keeps his square and turns his head');
  ok(pr.av.gun.rotation.x > p.av.gun.rotation.x + 0.5, 'facing forward the pillion holds the muzzle UP, clear of the driver\'s back; it comes level as the shoulders turn');
  /* the bike leans: so does whoever is on it */
  const lean = seatOne('bike', 0, { roll: 0.35 });
  ok(Math.abs(lean.head.x - lean.hips.x) > 0.2 && Math.abs((lean.head.x - lean.hips.x) / (lean.head.y - lean.hips.y) - Math.tan(0.35) * (lean.head.x > lean.hips.x ? 1 : -1)) < 0.35,
    'in a bend the rider leans WITH the bike (' + (Math.abs(lean.head.x - lean.hips.x) * 100).toFixed(0) + ' cm at the head at 20 degrees): the rig is placed in the vehicle\'s own frame');
  /* and goes where the bike is, facing the way it faces */
  const far = seatOne('bike', 0, { x: 40, z: -25, ry: Math.PI / 2 });
  ok(Math.hypot(far.hips.x - 40, far.hips.z + 25) < 0.2 && far.head.x > far.hips.x + 0.1, 'wherever the bike is and whichever way it points (east: the rider leans east)');
}

console.log('--- the auto rickshaw ---');
{
  const d = seatOne('auto', 0), a = seatOne('auto', 1), b = seatOne('auto', 2);
  /* the model: driver's seat at z -0.1, bench at z 0.95, bars at y 1.05 z -0.5, windscreen at z -0.5, canopy slab 1.71-1.81 */
  ok(Math.abs(d.hips.z + 0.1) < 0.12 && Math.abs(a.hips.z - 0.95) < 0.12 && Math.abs(b.hips.z - 0.95) < 0.12,
    'the driver is on the driver\'s seat and the passengers on the bench (the old seat points were 45 cm ahead of both: the driver sat in the windscreen)');
  ok(d.head.z > -0.45 && d.head.y + 0.14 < 1.81 && a.head.y + 0.14 < 1.81, 'heads are behind the windscreen and under the canopy (top of a helmet ' + (d.head.y + 0.14).toFixed(2) + ' m, canopy 1.81 m)');
  const reach = Math.max(Math.hypot(d.handL.y - 1.05, d.handL.z + 0.5), Math.hypot(d.handR.y - 1.05, d.handR.z + 0.5));
  ok(reach < 0.2, 'the driver holds the bars (' + (reach * 100).toFixed(0) + ' cm off at worst)');
  ok(a.av.gun.visible && b.av.gun.visible && !d.av.gun.visible && a.hips.x * b.hips.x < 0, 'two armed passengers side by side behind him');
  ok(CFG.VEHICLES.types.auto.seatsAt.every(s => Math.abs(s[1]) <= T.auto.len / 2), 'and the seats are still inside the hull');
}

console.log('--- behind glass: the sedan and the bus ---');
{
  let worstTop = 0, lowSole = 9, wide = 0;
  for (let k = 0; k < T.car.seats; k++) { const s = seatOne('car', k); worstTop = Math.max(worstTop, s.head.y + 0.15); lowSole = Math.min(lowSole, s.soleL.y, s.soleR.y); wide = Math.max(wide, Math.abs(s.handL.x), Math.abs(s.handR.x)); }
  ok(worstTop < T.car.hgt - 0.02, 'nobody\'s helmet comes through a sedan\'s roof: ' + worstTop.toFixed(2) + ' m under a ' + T.car.hgt + ' m car (sat upright, a helmet reached 1.52 m)');
  ok(lowSole > 0.3, 'nobody\'s boots hang under its floor: the lowest sole is ' + lowSole.toFixed(2) + ' m up (sat upright they showed between the wheels)');
  ok(wide < T.car.wid / 2 - 0.1, 'and nobody\'s arm is through a door');
  let busTop = 0, busLow = 9;
  let glassGuns = 0;
  for (let k = 0; k < T.bus.seats; k++) { const s = seatOne('bus', k); busTop = Math.max(busTop, s.head.y + 0.15); busLow = Math.min(busLow, s.soleL.y, s.soleR.y); if (s.av.gun.visible) glassGuns++; }
  for (let k = 0; k < T.car.seats; k++) if (seatOne('car', k).av.gun.visible) glassGuns++;
  ok(glassGuns === 0, 'behind glass everyone keeps the weapon down (it would be through the window)');
  ok(busTop < 2.8 && busLow > 0.5, 'six in the bus, heads under its roof and feet on its floor (' + busLow.toFixed(2) + ' - ' + busTop.toFixed(2) + ' m)');
  ok(/seatS\.sealed = !!veh\.T\.sealed/.test(vsrc) && T.tank.sealed, 'the tank is sealed: seatOf says so, and nobody is drawn sitting on its armour');
}

console.log('--- seatOf, the question the avatar code asks ---');
{
  /* a real list: a match's vehicles, then two people get on the same bike */
  VV.init(new THREE.Scene());
  VV.sync({ f: 1, v: [[7, Object.keys(T).indexOf('bike'), 10, 0, 10, 0.5, 0, 260, 80, 0]], s: { 7: ['A', 'B'] } });
  ctx.PlayerCtl.pos.set(500, 1, 500);
  VV.update(0.016);
  const a = VV.seatOf('A', 0.5 + 0.8), b0 = VV.seatOf('B', 0.5 - 0.4);
  ok(a === b0, 'ONE reused object answers (no allocation per rider per frame) — so it is read before the next question, which net.js does');
  const b = VV.seatOf('B', 0.5 - 0.4);
  ok(b && b.k === 1 && b.driver === false && b.kind === 'bike' && b.open === true && Math.abs(b.look + 0.4) < 1e-9, 'B is the pillion of the bike, looking 0.4 rad left of its nose');
  const a2 = VV.seatOf('A', 0.5 + 0.8);
  ok(a2.k === 0 && a2.driver === true && Math.abs(a2.look - 0.8) < 1e-9 && VV.seatOf('nobody', 0) === null, 'A drives, looking right; somebody on foot gets null');
}

console.log('--- v2.18: getting in ---');
{
  /* Rahul: "opening the gate of the car and then sitting inside, same in bike it taking one leg above and
     then sitting on the bike, jumping up in the bus." seat.enter runs 0..1; the vehicle places the rig
     (Vehicles.sit) and the avatar folds it (poseSeat). Posed once at each moment, as the game does per frame. */
  const at = (type, k, e) => {
    const veh = { id: 1, type, T: T[type], x: 0, y: 0, z: 0, ry: 0, seats: [], group: VV._build(type, 0xb8312f) };
    veh.group.position.set(0, 0, 0); veh.group.rotation.y = 0; veh.group.updateMatrixWorld(true);
    const av = A.buildAvatar('Rahul', '#d0412f');
    const st = { veh, k, kind: type, bike: type === 'bike', open: !T[type].sill, driver: k === 0, sealed: false, look: 0, enter: e };
    for (let f = 0; f < 3; f++) A.poseAvatar(av, Object.assign({}, base, { seat: st }));
    VV.sit(av.group, st); av.group.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(av.group.quaternion);   // the rig faces +z in its own frame
    return { av, p: av.group.position.clone(), fwd };
  };
  const seatP = (type, k) => { const o = T[type].seatsAt[k]; return new THREE.Vector3(o[0], T[type].seatY + VV._seatHip[type], -o[1]); };
  /* the sedan's driver (right-hand drive: the right-hand door) */
  const c0 = at('car', 0, 0.02), c5 = at('car', 0, 0.55), c1 = at('car', 0, 1);
  ok(c0.p.x > T.car.wid / 2 + 0.35 && Math.abs(c0.p.y - 0.93) < 0.03 && Math.abs(c0.av.hipL.rotation.x) < 0.05 && c0.av.hipL.knee.rotation.x < 0.05,
    'sedan: it starts with the driver STANDING outside the right-hand door (' + (c0.p.x - T.car.wid / 2).toFixed(2) + ' m clear of the body, hips ' + c0.p.y.toFixed(2) + ' m up, legs straight)');
  ok(c0.fwd.x < -0.9, 'facing into the car');
  ok(c5.p.x < c0.p.x - 0.4 && c5.p.x > seatP('car', 0).x - 0.01 && c5.p.y < 0.93 && c5.p.y > seatP('car', 0).y && c5.av.spine.rotation.x > c1.av.spine.rotation.x + 0.25,
    'half way he is through the doorway, coming down, head ducked under the roof');
  ok(c1.p.distanceTo(seatP('car', 0)) < 1e-6 && c1.fwd.z < -0.999, 'and it ends exactly on the seat, facing the nose — the same pose as before');
  const left = at('car', 1, 0.02);
  ok(left.p.x < -T.car.wid / 2 - 0.35 && left.fwd.x > 0.9, 'the front passenger comes in from the other side');
  /* the motorbike: from the left, a leg over */
  const b0 = at('bike', 0, 0.02), b4 = at('bike', 0, 0.38), b1 = at('bike', 0, 1);
  ok(b0.p.x < -0.45 && Math.abs(b0.p.y - 0.93) < 0.03, 'motorbike: he starts standing on its left');
  ok(b4.av.hipR.rotation.z > 1.0 && Math.abs(b4.av.hipL.rotation.z) < 0.25 && b4.av.hipR.rotation.x > b4.av.hipL.rotation.x + 0.3,
    'then the RIGHT leg goes up and over the saddle (thrown ' + (b4.av.hipR.rotation.z * 57.3).toFixed(0) + ' degrees out) while the left stays under him');
  ok(b1.p.distanceTo(seatP('bike', 0)) < 1e-6 && Math.abs(b1.av.hipR.rotation.z + b1.av.hipL.rotation.z) < 1e-9, 'and he settles astride, both knees out the same');
  /* the bus: a hop up the step, then the aisle */
  const u0 = at('bus', 0, 0.02), u2 = at('bus', 0, 0.24), u1 = at('bus', 0, 1);
  ok(u0.p.x < -T.bus.wid / 2 - 0.5 && Math.abs(u0.p.z + 4.52) < 0.05 && Math.abs(u0.p.y - 0.93) < 0.05, 'bus: he starts on the road at the front door');
  ok(u2.p.y > 1.3 && u2.av.hipL.knee.rotation.x > 0.8 && u2.av.hipL.rotation.x < -0.5, 'and JUMPS up the step, knees tucked (' + (u2.p.y - 0.93).toFixed(2) + ' m off where he stood)');
  ok(u1.p.distanceTo(seatP('bus', 0)) < 1e-6, 'then walks to the seat');
  /* nobody teleports, nobody flies: the speed of the hips, in real time, for every seat of every vehicle drawn */
  let worst = 0, where = '', worstSmall = 0;
  ['bike', 'auto', 'car', 'bus'].forEach(type => { for (let k = 0; k < T[type].seats; k++) {
    const ms = VV._enterMs({ type, T: T[type] }, k); let prev = null;
    for (let t = 0; t <= ms + 0.001; t += 20) { const q = at(type, k, Math.min(1, t / ms)).p; if (prev) { const v = q.distanceTo(prev) / 0.02; if (v > worst) { worst = v; where = type + ' seat ' + k; } if (type !== 'bus' && v > worstSmall) worstSmall = v; } prev = q; }
  } });
  ok(worstSmall < 5 && worst < 10.5, 'no seat is reached with a jump: getting into a bike, an auto or a sedan never moves the hips faster than ' + worstSmall.toFixed(1) + ' m/s; the quickest anyone goes is ' + worst.toFixed(1) + ' m/s down the aisle (' + where + ')');
  ok(VV._enterMs({ type: 'car', T: T.car }, 0) === 950 && VV._enterMs({ type: 'bus', T: T.bus }, 0) < 1000 && VV._enterMs({ type: 'bus', T: T.bus }, 5) > 1700 && VV._enterMs({ type: 'bus', T: T.bus }, 5) <= 1900,
    'it takes a second — in the bus up to ' + (VV._enterMs({ type: 'bus', T: T.bus }, 5) / 1000).toFixed(1) + ' s for the seat furthest down the aisle');
  ok(/var en = \(seat\.enter === undefined \|\| seat\.enter >= 1\) \? 1 : Math\.max\(0, seat\.enter\);/.test(read('public/src/networking/avatars.js')), 'a seat with no `enter` is a seat taken long ago: the settled pose, untouched');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
