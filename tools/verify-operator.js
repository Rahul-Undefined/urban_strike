/* verify-operator — THE v3 OPERATOR (v2.14), offline.

   Rahul sent a new avatars.js ("operator v3": a body that looks like a person,
   with a face, skin and hair from the callsign, a plate carrier and a helmet
   that appear with the gear) and asked: "isko use kar sakte h kya code mei ...
   ensure ki game theek rahe, saare map mei sahi se implement hona chahiye,
   height sahi se hai ki nahi ... guns, bomb and other weapons sahi se
   implement kar dena."

   An avatar is not only a picture in this game: the hit boxes are read from
   it (Avatars.RIG, Avatars.HEAD_HALF, the head mesh's own position), every
   doorway on every map was fitted to its height (world.js LINTEL), and net.js,
   game.js and the menu reach into the object it returns. So "can we use it"
   is a measurement, and this is the measurement: the new rig against the
   numbers taken from the old one in a browser on 21 Nov 2026, before the swap.

   Run: node tools/verify-operator.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
const fakeCtx = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const fakeCanvas = () => ({ width: 256, height: 64, getContext: () => fakeCtx(), style: {} });
const ctx = { THREE, CFG, console, Math, document: { createElement: (t) => (t === 'canvas' ? fakeCanvas() : { style: {} }) }, performance: { now: () => Date.now() }, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/networking/avatars.js'), 'utf8') + '\nthis.Avatars = Avatars;', ctx, { filename: 'avatars.js' });
const A = ctx.Avatars;
/* the previous rig, measured in Chromium with the group at the standing capsule centre (0.96) */
/* v2.14.1: crouch and prone fold the legs the right way round now, so their LOWEST point moved a few
   centimetres (toes instead of heels); the top and the head — what the hit boxes use — did not. */
const WAS = { stand: { feet: -0.01, top: 2.94, head: [0, 2.75, 0] }, crouch: { feet: 0.45, top: 2.56, head: [0, 2.34, 0.27] }, prone: { feet: 0.68, top: 1.44, head: [0, 1.15, 0.75] }, run: { feet: 0, top: 2.93, head: [0, 2.74, 0] },
              HEAD_HALF: { x: 0.184, y: 0.21, z: 0.175 }, RIG: { x: 1.68, y: 1.62, z: 1.68 } };

console.log('--- it is the same object the game already uses ---');
ok(['RIG', 'HEAD_HALF', 'buildAvatar', 'disposeAvatar', 'setRemoteGun', 'drawHpBar', 'setGear', 'poseAvatar', 'XRAY_MAT'].every(k => A[k] !== undefined) && typeof A.lookFor === 'function',
  'every function the game calls is there (buildAvatar, poseAvatar, setRemoteGun, setGear, drawHpBar, disposeAvatar), plus lookFor');
const av = A.buildAvatar('Tester', '#e2503c');
ok(['group', 'gun', 'head', 'headMesh', 'torso', 'spine', 'hb', 'tag', 'xray', 'tagHolder', 'hipL', 'hipR', 'armL', 'armR', 'helmet', 'vest', 'pack', 'detail'].every(k => av[k]),
  'the avatar object carries every part net.js, game.js and the menu reach for (group, tag, hp bar, xray, head mesh, gun, helmet, vest ...)');
ok(A.RIG.x === WAS.RIG.x && A.RIG.y === WAS.RIG.y && A.RIG.z === WAS.RIG.z, 'the rig scale is untouched (' + A.RIG.x + ' x ' + A.RIG.y + ' x ' + A.RIG.z + ') — the body hit box is computed from it');
const hh = A.HEAD_HALF;
ok(Math.abs(hh.x - WAS.HEAD_HALF.x) <= 0.012 && Math.abs(hh.y - WAS.HEAD_HALF.y) <= 0.012 && Math.abs(hh.z - WAS.HEAD_HALF.z) <= 0.012,
  'the head hit box is the old one to within a centimetre: ' + [hh.x, hh.y, hh.z].map(v => v.toFixed(3)).join(' x ') + ' (was ' + [WAS.HEAD_HALF.x, WAS.HEAD_HALF.y, WAS.HEAD_HALF.z].join(' x ') + ') — headshots are no easier and no harder');

console.log('--- height: where the feet, the top of the head and the head box are ---');
const scene = new THREE.Scene(); scene.add(av.group);
const base = { moved: 0, mx: 0, mz: 0, run: false, crouch: false, prone: false, dead: false, deadT: 0, rx: 0, ry: 0, lean: 0, reloading: false, dist: 4, dt: 0.016 };
const pose = (p) => { av.group.position.set(0, 0.96, 0); av.baseY = 0.96; for (let i = 0; i < 90; i++) A.poseAvatar(av, Object.assign({}, base, p)); av.group.updateMatrixWorld(true); };
const measure = () => { const b = new THREE.Box3(); av.group.traverse(m => { if (!m.isMesh || m === av.xray || (m.material && m.material.depthTest === false)) return; let q = m; while (q) { if (!q.visible) return; q = q.parent; } b.expandByObject(m); });
  const hp = new THREE.Vector3(); av.headMesh.getWorldPosition(hp); return { feet: b.min.y, top: b.max.y, head: [hp.x, hp.y, hp.z] }; };
A.setGear(av, 0, 0); av.gun.visible = false;
const got = {};
[['stand', {}], ['crouch', { crouch: true }], ['prone', { prone: true }], ['run', { moved: 0.08, mz: 1, run: true }]].forEach(([k, p]) => { pose(p); got[k] = measure(); });
for (const k of ['stand', 'crouch', 'prone', 'run']) {
  const g = got[k], w = WAS[k], dHead = Math.hypot(g.head[0] - w.head[0], g.head[1] - w.head[1], g.head[2] - w.head[2]);
  ok(Math.abs(g.feet - w.feet) <= (k === 'stand' ? 0.04 : 0.1) && Math.abs(g.top - w.top) <= 0.06 && dHead <= 0.03,
    k.toUpperCase() + ': feet ' + g.feet.toFixed(2) + ', top ' + g.top.toFixed(2) + ', head centre ' + g.head.map(v => v.toFixed(2)).join(' / ') + ' — the old rig: ' + w.feet + ', ' + w.top + ', ' + w.head.join(' / ') + ' (head ' + (dHead * 100).toFixed(1) + ' cm apart)');
}
const tall = got.stand.top - got.stand.feet;
ok(Math.abs(tall - 2.95) < 0.06, 'a standing operator is drawn ' + tall.toFixed(2) + ' m tall, as before — 1.5x the 1.92 m body that collides, by the v1.0e decision ("make the avatar seriously tall"); doorways were raised to 2.65 m for it then');
ok(Math.abs(got.stand.feet) <= 0.03, 'feet on the ground: the lowest point of a standing operator is ' + (got.stand.feet * 100).toFixed(0) + ' cm from the floor');
A.setGear(av, 3, 3); pose({}); const kit = measure(); A.setGear(av, 0, 0);
ok(kit.top - got.stand.top <= 0.14 && Math.abs(kit.head[1] - got.stand.head[1]) < 0.01, 'the level-3 helmet (goggles up) adds ' + ((kit.top - got.stand.top) * 100).toFixed(0) + ' cm to the silhouette and nothing to the head box');

console.log('--- guns, the bomb and everything else it can hold ---');
av.gun.visible = true; pose({});
const hand = new THREE.Vector3(), bad = [], far = [];
CFG.WEAPON_ORDER.forEach((w, i) => { try { A.setRemoteGun({ av: av, wpIdx: -1 }, i); let n = 0; const b = new THREE.Box3(); av.group.updateMatrixWorld(true); av.gun.traverse(m => { if (m.isMesh) { n++; b.expandByObject(m); } }); if (!n) bad.push(w + ' (nothing in hand)');
  else { av.armR.getWorldPosition(hand); const c = b.getCenter(new THREE.Vector3()); if (c.distanceTo(hand) > 1.9 || b.max.y > got.stand.top + 0.9 || b.min.y < -0.05) far.push(w + ' ' + c.distanceTo(hand).toFixed(2) + ' m'); } } catch (e) { bad.push(w + ': ' + e.message); } });
ok(bad.length === 0, 'all ' + CFG.WEAPON_ORDER.length + ' things a player can hold build a model in the hands — rifles, snipers, shotguns, pistol, knife, bow, rocket, seeker, flamethrower, C4, drone and EMP remotes' + (bad.length ? ' [' + bad.join('; ') + ']' : ''));
ok(far.length === 0, 'and each sits at the body, off the floor and below a reach above the head' + (far.length ? ' [' + far.join('; ') + ']' : ''));
let gearOk = true; for (let h = 0; h <= 3; h++) for (let a = 0; a <= 3; a++) { try { A.setGear(av, h, a); if (!!av.helmet.visible !== (h > 0) || !!av.vest.visible !== (a > 0)) gearOk = false; } catch (e) { gearOk = false; } }
ok(gearOk, 'helmet and plate carrier appear with the gear level and vanish without it (every combination of helmet 0-3 and vest 0-3)');
const frames = (p, n) => { for (let i = 0; i < n; i++) A.poseAvatar(av, Object.assign({}, base, p)); av.group.updateMatrixWorld(true); let okk = true; av.group.traverse(o => { const e = o.matrixWorld.elements; for (let k = 0; k < 16; k++) if (!isFinite(e[k])) okk = false; }); return okk; };
ok(frames({ reloading: true }, 40) && frames({ dead: true, deadT: 0.3 }, 20) && frames({ dead: true, deadT: 0.9 }, 5) && frames({ lean: 1, rx: 0.6 }, 20) && frames({ lean: -1, rx: -0.9, crouch: true }, 20) && frames({ prone: true, moved: 0.03, mz: 1 }, 30) && frames({}, 30),
  'reloading, dying, leaning both ways, aiming up and down, crawling: every pose is a finite transform (a NaN here is an invisible player)');

console.log('--- v2.14.1: the legs ---');
{
  /* foot of a leg from its two angles (thigh 0.42, shin 0.50): z forward, y up, x from the hip roll */
  const footOf = (hip, x0) => { const hx = hip.rotation.x, kx = hip.knee.rotation.x, rz = hip.rotation.z; return { z: -0.42 * Math.sin(hx) - 0.5 * Math.sin(hx + kx), y: -0.42 * Math.cos(hx) - 0.5 * Math.cos(hx + kx), x: x0 + 0.92 * Math.sin(rz), knee: kx, hx: hx, rz: rz }; };
  const walk = (state, frames) => { for (let i = 0; i < 70; i++) A.poseAvatar(av, Object.assign({}, base, state)); const out = []; for (let i = 0; i < frames; i++) { A.poseAvatar(av, Object.assign({}, base, state)); out.push([footOf(av.hipL, -0.115), footOf(av.hipR, 0.115)]); } return out; };
  /* stance = the frames where the foot is DOWN (within 1.5 cm of as low as it gets); a foot that is
     folding up behind at toe-off is already in the swing, whichever way it is moving */
  const study = (rows, axis, dir) => { let minKnee = 9, maxKnee = 0, up = 0, upN = 0, down = 0, downN = 0, stanceKnee = 0, crossed = 0, reach = 0, low = [9, 9];
    rows.forEach(r => { for (let l = 0; l < 2; l++) low[l] = Math.min(low[l], r[l].y); });
    for (let i = 1; i < rows.length; i++) for (let l = 0; l < 2; l++) { const a = rows[i - 1][l], b = rows[i][l], v = (b[axis] - a[axis]) * dir;
      minKnee = Math.min(minKnee, b.knee); maxKnee = Math.max(maxKnee, b.knee); reach = Math.max(reach, Math.abs(b[axis] - (axis === 'x' ? (l ? 0.115 : -0.115) : 0)));
      if (v > 0.002) { up += b.y; upN++; } else if (v < -0.002) { down += b.y; downN++; }
      if (b.y <= low[l] + 0.015) stanceKnee = Math.max(stanceKnee, b.knee);
      if (l === 0 ? b.rz > 0.075 : b.rz < -0.075) crossed++; }
    return { minKnee, maxKnee, lift: up / Math.max(1, upN) - down / Math.max(1, downN), stanceKnee, crossed, reach }; };
  A.setGear(av, 0, 0);
  const F = study(walk({ moved: 0.07, mz: 1 }, 140), 'z', 1), B = study(walk({ moved: 0.05, mz: -1 }, 160), 'z', -1), Lt = study(walk({ moved: 0.05, mx: 1 }, 160), 'x', 1), Rt = study(walk({ moved: 0.05, mx: -1 }, 160), 'x', -1), Rn = study(walk({ moved: 0.12, mz: 1, run: true }, 120), 'z', 1);
  ok([F, B, Lt, Rt, Rn].every(q => q.minKnee >= 0), 'a knee never bends backwards — forward, back, left, right, running: the smallest knee angle in any frame is ' + Math.min(F.minKnee, B.minKnee, Lt.minKnee, Rt.minKnee, Rn.minKnee).toFixed(2) + ' rad (the old cycle: down to -1.06)');
  ok(F.lift > 0.03 && F.maxKnee > 0.6 && F.maxKnee < 1.4 && F.stanceKnee < 0.45, 'FRONT WALK: the foot moving forward is the one in the air (' + (F.lift * 100).toFixed(0) + ' cm higher than the planted one); the knee folds ' + (F.maxKnee * 57.3).toFixed(0) + ' degrees in the swing and stays under ' + (F.stanceKnee * 57.3).toFixed(0) + ' on the ground');
  ok(B.lift > 0.02 && B.maxKnee > 0.35 && B.reach < F.reach, 'BACK WALK: the foot moving BACK is the one in the air (' + (B.lift * 100).toFixed(0) + ' cm), knee ' + (B.maxKnee * 57.3).toFixed(0) + ' degrees, shorter steps than forward (' + B.reach.toFixed(2) + ' against ' + F.reach.toFixed(2) + ' m)');
  ok(Lt.lift > 0.01 && Rt.lift > 0.01 && Lt.crossed === 0 && Rt.crossed === 0 && Lt.reach > 0.1 && Rt.reach > 0.1, 'LEFT and RIGHT: the legs step out to the side they travel to (' + Lt.reach.toFixed(2) + ' m), the moving foot lifted (' + (Lt.lift * 100).toFixed(0) + ' / ' + (Rt.lift * 100).toFixed(0) + ' cm), and never pass through each other');
  ok(Rn.maxKnee > F.maxKnee + 0.3 && Rn.reach > F.reach, 'RUN: a longer stride and a higher heel than the walk (knee ' + (Rn.maxKnee * 57.3).toFixed(0) + ' degrees against ' + (F.maxKnee * 57.3).toFixed(0) + ')');
  pose({ crouch: true }); const cr = footOf(av.hipL, -0.115), kneeZ = -0.42 * Math.sin(av.hipL.rotation.x);
  ok(av.hipL.rotation.x < -1 && av.hipL.knee.rotation.x > 1.5 && kneeZ > 0.3 && Math.abs(cr.z) < 0.2, 'CROUCH: thighs forward, knees in FRONT of the hips (' + kneeZ.toFixed(2) + ' m), feet under the body — it crouched with the knees behind');
  pose({ prone: true }); ok(av.hipL.knee.rotation.x >= 0 && av.hipL.knee.rotation.x < 0.2, 'PRONE: straight legs (it had a 26 degree backward kink at the knee)');
  for (let i = 0; i < 30; i++) A.poseAvatar(av, Object.assign({}, base, { dead: true, deadT: 0.45 })); ok(av.hipL.knee.rotation.x > 1 && av.hipL.rotation.x < -0.5, 'DYING: the knees give forward');
  pose({});
  /* the callers hand over the BODY frame whatever the compass */
  let worst = 0; for (let k = 0; k < 16; k++) { const ry = k * Math.PI / 8, sn = Math.sin(ry), cs = Math.cos(ry), fx = sn, fz = -cs, lxw = -cs, lzw = -sn;   // forward, and the operator's left
    const f = (dx, dz) => [dx * sn - dz * cs, -dx * cs - dz * sn]; const a = f(fx, fz), b = f(lxw, lzw); worst = Math.max(worst, Math.abs(a[0] - 1), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1] - 1)); }
  const netS = fs.readFileSync(path.join(ROOT, 'public/src/networking/net.js'), 'utf8'), gmS = fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8'), F2 = 'lz = dxw * sn - dzw * cs, lx = -dxw * cs - dzw * sn;';
  ok(worst < 1e-9 && netS.indexOf(F2) > 0 && gmS.indexOf(F2) > 0 && netS.indexOf('lz = dxw * sn + dzw * cs') < 0, 'walking forward reads as forward at every compass heading (16 tried) in both callers — it read as backwards facing north and as a sidestep facing north-east');
}
console.log('--- v2.14.1: three levels of kit ---');
{
  const count = (m) => m.geometry.attributes.position.count / 3, hG = [], vG = [], hT = [], vT = [];
  for (let l = 1; l <= 3; l++) { A.setGear(av, l, l); hG.push(av.helmet.geometry.uuid); vG.push(av.vest.geometry.uuid); hT.push(count(av.helmet)); vT.push(count(av.vest)); }
  ok(new Set(hG).size === 3 && new Set(vG).size === 3, 'helmet and vest each have three different pieces, one per level (v3 drew the same one for all three)');
  ok(hT[0] < hT[1] && hT[1] < hT[2] && vT[0] < vT[1] && vT[1] < vT[2], 'and each level is visibly MORE kit: helmet ' + hT.join(' < ') + ' triangles, vest ' + vT.join(' < '));
  const other = A.buildAvatar('Other', '#e2503c'); A.setGear(other, 3, 3);
  ok(other.helmet.geometry.uuid === hG[2] && other.vest.geometry.uuid === vG[2], 'two players in the same colour and level share the piece (nothing is built per player)');
  A.setGear(av, 3, 1); A.setGear(av, 0, 0); A.setGear(av, 3, 1);
  ok(av.helmet.visible && av.vest.visible && av.helmet.geometry.uuid === hG[2] && av.vest.geometry.uuid === vG[0], 'mixed kit works: a level-3 helmet over a level-1 vest, lost and picked up again');
  A.setGear(av, 0, 0);
  /* the same kit on the ground: pickups.js draws loot with the piece an operator wears */
  const pctx = { THREE, CFG, console, Math, Date, Float32Array, Uint16Array, Avatars: A, document: ctx.document, performance: ctx.performance, AudioSys: { pickupSnd() {}, planeFlyby() {}, crateThud() {} }, FX: {}, UI: { toast() {} } };
  vm.createContext(pctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/loot/pickups.js'), 'utf8') + '\nthis.Pickups = Pickups;', pctx, { filename: 'pickups.js' });
  const ps = new THREE.Scene(); pctx.Pickups.build(ps);
  const kitTypes = Object.keys(CFG.LOOT_ITEMS).filter(t => CFG.LOOT_ITEMS[t].kind === 'armor' || CFG.LOOT_ITEMS[t].kind === 'helm');
  pctx.Pickups.init(kitTypes.map((t, i) => ({ id: i, t: t, p: [i * 2, 0.55, 0], active: true })));
  const loot = {}; ps.traverse(m => { if (m.isMesh && m.geometry.attributes.color) { const it = kitTypes[Math.round(m.parent.position.x / 2)]; if (it) loot[it] = m.geometry; } });
  let lootOk = kitTypes.length >= 6, sizes = [];
  kitTypes.forEach(t => { const it = CFG.LOOT_ITEMS[t], helm = it.kind === 'helm', lvl = helm ? it.l : it.lvl, g = loot[t]; if (!g) { lootOk = false; return; }
    A.setGear(av, lvl, lvl); const worn = (helm ? av.helmet : av.vest).geometry;
    if (g.attributes.position.count !== worn.attributes.position.count || !g.attributes.normal || g.uuid === worn.uuid) lootOk = false;
    g.computeBoundingBox(); const z = g.boundingBox.getSize(new THREE.Vector3()), c = g.boundingBox.getCenter(new THREE.Vector3()); sizes.push(Math.max(z.x, z.y, z.z));
    if (Math.max(z.x, z.y, z.z) > 1.0 || Math.max(z.x, z.y, z.z) < 0.3 || Math.abs(c.y) > 0.2) lootOk = false; });
  A.setGear(av, 0, 0);
  ok(lootOk, 'a helmet or vest on the GROUND is the piece an operator wears at that level (' + kitTypes.length + ' items, same shape vertex for vertex, ' + Math.min.apply(null, sizes).toFixed(2) + '-' + Math.max.apply(null, sizes).toFixed(2) + ' m across, centred on its ring) — it was a block in the level colour');
  /* and your own body wears it and carries your weapon */
  const gmSrc = fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8'), uiSrc = fs.readFileSync(path.join(ROOT, 'public/src/ui/ui.js'), 'utf8');
  ok(/Avatars\.setGear\(ownAv, UI\.worn\.h, UI\.worn\.a\)/.test(gmSrc) && /Avatars\.setRemoteGun\(ownAv\._r,/.test(gmSrc) && /worn\.a = lv;/.test(uiSrc) && /worn\.h = lv;/.test(uiSrc),
    'your OWN third-person body wears the helmet and vest the HUD shows and carries the weapon in your hands (it walked empty-handed and bare-headed)');
}
console.log('--- v2.14.1: both hands on the rifle ---');
{
  A.setGear(av, 0, 0);
  const hands = (state, n) => { for (let i = 0; i < 70; i++) A.poseAvatar(av, Object.assign({}, base, state)); let lo = 9, hi = 0; const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < n; i++) { A.poseAvatar(av, Object.assign({}, base, state)); av.group.updateMatrixWorld(true); a.set(0, -0.27, 0); b.set(0, -0.27, 0); av.armL.elbow.localToWorld(a); av.armR.elbow.localToWorld(b); const d = a.distanceTo(b); lo = Math.min(lo, d); hi = Math.max(hi, d); } return hi - lo; };
  const wk = hands({ moved: 0.07, mz: 1 }, 140), rn = hands({ moved: 0.12, mz: 1, run: true }, 120);
  ok(wk < 0.03 && rn < 0.03, 'walking and running, the two hands stay the same distance apart to within ' + (Math.max(wk, rn) * 100).toFixed(1) + ' cm — in v2.14.0 the gap between them opened and closed by 16 cm every stride (the support hand left the handguard)');
  pose({});
}
console.log('--- what it costs ---');
let meshes = 0, tris = 0; av.group.traverse(m => { if (m.isMesh) { meshes++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
ok(meshes <= 26 && tris < 14000, meshes + ' meshes and ' + Math.round(tris) + ' triangles an operator (the box rig: 24 meshes, 288 triangles) — sixteen of them is ' + Math.round(tris * 16 / 1000) + 'k triangles, a phone\'s worth');
/* the v10.9 leak rule: geometry is built once per distinct shape and SHARED — a
   face and a shirt colour are part of the shape here, so "distinct" is per
   look and colour, and what must hold is that the count stops growing */
const geos = (o) => { const set = new Set(); o.group.traverse(m => { if (m.isMesh) set.add(m.geometry.uuid); }); return set; };
A.setGear(av, 2, 2); const twinA = A.buildAvatar('Tester', '#e2503c'); A.setGear(twinA, 2, 2); const gA = geos(av), gT = geos(twinA); let same = 0; gT.forEach(u => { if (gA.has(u)) same++; });
ok(same === gT.size, 'two operators with the same callsign and colour share every one of their ' + gT.size + ' geometries');
const NAMES = ['Rahul', 'Viper', 'Ghost', 'Kabir', 'Zara', 'Bishop', 'Nomad', 'Havoc', 'Onyx', 'Sable', 'Rook', 'Jinx', 'Echo', 'Blaze', 'Drift', 'Kite', 'Mako', 'Nova', 'Orion', 'Pike', 'Tariq', 'Wolf', 'Mira', 'Dax'];
const COLS = ['#e2503c', '#3fd06a', '#4fa3e0', '#f0c040', '#b46be0', '#f08a3c'], all = new Set(); let at300 = 0;
for (let i = 0; i < 600; i++) { const o = A.buildAvatar(NAMES[i % NAMES.length] + (i % 7 === 0 ? i : ''), COLS[(i * 5) % COLS.length]); geos(o).forEach(u => all.add(u)); A.disposeAvatar(o); if (i === 299) at300 = all.size; }
ok(all.size < 900 && all.size - at300 < at300 * 0.35, '600 operators joining and leaving (24 callsigns and 86 one-off names, 6 colours) leave ' + all.size + ' geometries in memory, ' + at300 + ' of them after the first 300 — it levels off instead of growing with every join');
let alive = true; av.group.traverse(m => { if (m.isMesh && (!m.geometry.attributes.position || m.geometry.attributes.position.count === 0)) alive = false; });
ok(alive, 'and disposing 600 of them left the first operator intact (nothing shared was freed)');
const looks = ['Rahul', 'Viper', 'Ghost', 'Kabir', 'Zara', 'Bishop', 'Nomad', 'Havoc', 'Onyx', 'Sable', 'Rook', 'Jinx'].map(n => JSON.stringify(A.lookFor(n)));
ok(JSON.stringify(A.lookFor('Rahul')) === looks[0] && new Set(looks).size >= 5, 'a callsign always gets the same face, and twelve callsigns get ' + new Set(looks).size + ' different ones (skin, hair, beard) — render only, nothing is sent');
ok(fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8').indexOf('Avatars.buildAvatar(meRow.name, meRow.color)') > 0, 'your own third-person body is built with your callsign and your side\'s colour');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
