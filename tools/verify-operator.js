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
  ok(Math.abs(g.feet - w.feet) <= 0.04 && Math.abs(g.top - w.top) <= 0.06 && dHead <= 0.03,
    k.toUpperCase() + ': feet ' + g.feet.toFixed(2) + ', top ' + g.top.toFixed(2) + ', head centre ' + g.head.map(v => v.toFixed(2)).join(' / ') + ' — the old rig: ' + w.feet + ', ' + w.top + ', ' + w.head.join(' / ') + ' (head ' + (dHead * 100).toFixed(1) + ' cm apart)');
}
const tall = got.stand.top - got.stand.feet;
ok(Math.abs(tall - 2.95) < 0.06, 'a standing operator is drawn ' + tall.toFixed(2) + ' m tall, as before — 1.5x the 1.92 m body that collides, by the v1.0e decision ("make the avatar seriously tall"); doorways were raised to 2.65 m for it then');
ok(Math.abs(got.stand.feet) <= 0.03, 'feet on the ground: the lowest point of a standing operator is ' + (got.stand.feet * 100).toFixed(0) + ' cm from the floor');
A.setGear(av, 3, 3); pose({}); const kit = measure(); A.setGear(av, 0, 0);
ok(kit.top - got.stand.top <= 0.08 && Math.abs(kit.head[1] - got.stand.head[1]) < 0.01, 'a helmet adds ' + ((kit.top - got.stand.top) * 100).toFixed(0) + ' cm to the silhouette and nothing to the head box');

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

console.log('--- what it costs ---');
let meshes = 0, tris = 0; av.group.traverse(m => { if (m.isMesh) { meshes++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
ok(meshes <= 26 && tris < 14000, meshes + ' meshes and ' + Math.round(tris) + ' triangles an operator (the box rig: 24 meshes, 288 triangles) — sixteen of them is ' + Math.round(tris * 16 / 1000) + 'k triangles, a phone\'s worth');
/* the v10.9 leak rule: geometry is built once per distinct shape and SHARED — a
   face and a shirt colour are part of the shape here, so "distinct" is per
   look and colour, and what must hold is that the count stops growing */
const geos = (o) => { const set = new Set(); o.group.traverse(m => { if (m.isMesh) set.add(m.geometry.uuid); }); return set; };
const twinA = A.buildAvatar('Tester', '#e2503c'), gA = geos(av), gT = geos(twinA); let same = 0; gT.forEach(u => { if (gA.has(u)) same++; });
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
