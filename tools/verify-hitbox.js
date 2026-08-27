/* verify-hitbox.js — v8.32

   WHY THIS GATE EXISTS

   The head hit box and the rendered head were computed by two independent
   chains. The box came from CFG.PLAYER.eyeHeight; the head came from the rig's
   joints. v8.19 scaled both by RIG and declared them aligned. They were not:
   firing eleven rays up a visible head returned FOUR clean misses standing and
   EIGHT crouching. Bullets went through heads, and no gate noticed, because
   every existing gate checked the model or the config but never fired a ray at
   the thing the player actually sees.

   This gate builds the real avatar, settles the real pose, and fires the REAL
   castRay — lifted verbatim out of weapons/system.js — at the rendered body.
   If the model moves and the box does not follow, this fails. */

const THREE = require('three');
const vm = require('vm');
const fs = require('fs');

let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, { get: (t, k) => {
    if (k === 'canvas') return c;
    return function () {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop() {} };
      if (k === 'measureText') return { width: 40 };
      if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
    };
  }, set: () => true });
  c.getContext = () => g;
  return c;
}

const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
  isFinite, isNaN, parseInt, parseFloat,
  Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
  performance: { now: () => Date.now() },
  document: { createElement: t => (t === 'canvas' ? fakeCanvas() : { style: {} }),
              getElementById: () => null, addEventListener() {} },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
ctx.Net = { getMyTeam: () => null };
vm.createContext(ctx);

[ 'public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
  'public/src/config/loot.config.js', 'public/src/config/world.config.js',
  'public/src/config/maps-rural.config.js', 'public/src/config/maps-metro.config.js',
  'public/src/config/index.js', 'public/src/weapons/viewmodels.js',
  'public/src/networking/avatars.js'
].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));

/* Lift the REAL rayBox + castRay out of weapons/system.js so this tests the
   shipping code, not a copy of it that could drift. */
const wsrc = fs.readFileSync('public/src/weapons/system.js', 'utf8').split('\n');
function grab(startRe, endRe) {
  const a = wsrc.findIndex(l => startRe.test(l));
  if (a < 0) return null;
  let depth = 0, started = false, out = [];
  for (let i = a; i < wsrc.length; i++) {
    out.push(wsrc[i]);
    for (const ch of wsrc[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
    if (started && depth === 0) break;
  }
  return out.join('\n');
}
const rayBoxSrc = grab(/^\s*function rayBox\s*\(/);
const castRaySrc = grab(/^\s*function castRay\s*\(/);
ok(!!rayBoxSrc && !!castRaySrc, 'extracted the real rayBox() and castRay() from weapons/system.js');

ctx.World = { rayHit: () => null };
let REMOTE = null;
ctx.Net.eachRemote = fn => { if (REMOTE) fn('bot', REMOTE); };
vm.runInContext(rayBoxSrc + '\n' + castRaySrc, ctx, { filename: 'lifted-from-system.js' });

const CY = 10;
const STANCES = [
  { n: 'standing', c: 0, p: 0 },
  { n: 'crouching', c: 1, p: 0 },
  { n: 'prone', c: 0, p: 1 }
];

console.log('--- verify-hitbox: rays fired at the RENDERED body ---\n');

for (const S of STANCES) {
  const res = vm.runInContext(`(function(){
    var av = Avatars.buildAvatar('Bot', 0xf0a232);
    Avatars.setRemoteGun({ av: av, gunName: null }, 0);
    var sc = new THREE.Scene(); sc.add(av.group); av.baseY = ${CY};
    for (var f = 0; f < 400; f++) Avatars.poseAvatar(av, { moved:0, mx:0, mz:0, run:false,
      crouch:${S.c}, prone:${S.p}, dead:false, deadT:0, rx:0, ry:0, lean:0, reloading:false, dist:10, dt:0.016 });
    av.group.updateMatrixWorld(true);

    var hp = new THREE.Vector3(); av.headMesh.getWorldPosition(hp);
    var headBox = new THREE.Box3().setFromObject(av.headMesh);

    // torso + legs only: what a player unambiguously reads as "the body"
    var core = new THREE.Box3();
    [av.torso, av.hipL, av.hipR].forEach(function(o){ core.union(new THREE.Box3().setFromObject(o)); });

    return {
      headPos: [hp.x, hp.y, hp.z],
      headSpan: [headBox.min.y, headBox.max.y],
      coreSpan: [core.min.y, core.max.y],
      crouch: ${S.c} === 1, prone: ${S.p} === 1
    };
  })();`, ctx, { filename: '<build>' });

  // wire the remote exactly as net.js does, including the cached head position
  ctx.__setRemote = null;
  REMOTE = {
    alive: true,
    crouch: res.crouch,
    prone: res.prone,
    renderPos: new THREE.Vector3(0, CY, 0),
    headPos: new THREE.Vector3(res.headPos[0], res.headPos[1], res.headPos[2])
  };

  function sweep(lo, hi, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const y = lo + (hi - lo) * (i / n);
      const h = vm.runInContext(
        `castRay(new THREE.Vector3(0, ${y}, -20), new THREE.Vector3(0, 0, 1), 60)`,
        ctx, { filename: '<ray>' });
      out.push(h ? h.part : 'MISS');
    }
    return out;
  }

  const headRays = sweep(res.headSpan[0] + 0.01, res.headSpan[1] - 0.01, 10);
  const bodyRays = sweep(res.coreSpan[0] + 0.01, res.coreSpan[1] - 0.01, 10);

  const headMiss = headRays.filter(p => p === 'MISS').length;
  const bodyMiss = bodyRays.filter(p => p === 'MISS').length;
  const headHits = headRays.filter(p => p === 'head').length;

  ok(headMiss === 0,
    S.n + ': no ray through the visible HEAD misses entirely [' + headMiss + '/11 missed]');
  ok(headHits >= 8,
    S.n + ': the visible head registers as a HEADSHOT [' + headHits + '/11 head]');
  ok(bodyMiss === 0,
    S.n + ': no ray through the visible TORSO/LEGS misses entirely [' + bodyMiss + '/11 missed]');
}

/* The weapon must read as carried, not thrown. Measured against the elbow it
   hangs from: a forearm is about 0.35 m after RIG scaling, so anything beyond
   that is a rifle floating free of the hands. */
const carry = vm.runInContext(`(function(){
  var av = Avatars.buildAvatar('Bot', 0xf0a232);
  Avatars.setRemoteGun({ av: av, gunName: null }, 0);
  var sc = new THREE.Scene(); sc.add(av.group); av.baseY = ${CY};
  for (var f = 0; f < 400; f++) Avatars.poseAvatar(av, { moved:0, mx:0, mz:0, run:false,
    crouch:0, prone:0, dead:false, deadT:0, rx:0, ry:0, lean:0, reloading:false, dist:10, dt:0.016 });
  av.group.updateMatrixWorld(true);
  var g = new THREE.Vector3(); av.gun.getWorldPosition(g);
  var e = new THREE.Vector3(); av.armR.elbow.getWorldPosition(e);
  var ch = new THREE.Vector3(); av.torso.getWorldPosition(ch);
  return { fwd: g.z - ch.z, up: g.y - ch.y, reach: g.distanceTo(e) };
})();`, ctx, { filename: '<carry>' });

ok(carry.fwd > 0.15 && carry.fwd < 0.50,
  'weapon is carried close to the chest [' + carry.fwd.toFixed(2) + ' m forward, want 0.15-0.50]');
ok(carry.up > -0.35 && carry.up < 0.10,
  'weapon sits at chest height, not raised overhead [' + carry.up.toFixed(2) + ' m vs chest]');
ok(carry.reach < 0.35,
  'weapon stays within a forearm of the elbow so the hands read as on it [' +
  carry.reach.toFixed(2) + ' m]');

/* ---- FACING (v8.36) ----
   A three.js camera looks down its own local -Z; the rig faces local +Z. Both
   were fed `-yaw`, so every remote operator was drawn facing the opposite way
   to the head it belonged to. Nothing caught it because every previous gate
   posed a single avatar in isolation, where there is no second player to look
   wrong to. This one compares the RENDERED body direction against the direction
   the camera says that player is looking. */
const facing = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(yaw => vm.runInContext(`(function(){
  var cam = new THREE.PerspectiveCamera(75, 1.7, 0.1, 100);
  cam.rotation.order = 'YXZ'; cam.rotation.y = ${-1} * ${yaw};
  var look = new THREE.Vector3(); cam.getWorldDirection(look); look.y = 0; look.normalize();

  var av = Avatars.buildAvatar('Bot', 0xf0a232);
  var sc = new THREE.Scene(); sc.add(av.group); av.baseY = 0;
  av.group.rotation.y = ${-1} * ${yaw} + Math.PI;          // must match net.js
  for (var f = 0; f < 200; f++) Avatars.poseAvatar(av, { moved:0, mx:0, mz:0, run:false,
    crouch:0, prone:0, dead:false, deadT:0, rx:0, ry:${yaw}, lean:0, reloading:false, dist:10, dt:0.016 });
  av.group.updateMatrixWorld(true);
  var q = new THREE.Quaternion(); av.group.getWorldQuaternion(q);
  var fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
  return { dot: look.dot(fwd), yaw: ${yaw} };
})();`, ctx, { filename: '<facing>' }));

facing.forEach(f => {
  ok(f.dot > 0.99,
    'remote avatar faces where the player is looking at yaw ' +
    Math.round(f.yaw * 180 / Math.PI) + ' deg [dot ' + f.dot.toFixed(2) + ']');
});
const nsrc = fs.readFileSync('public/src/networking/net.js', 'utf8');
/* v11.0: the group is rotated from the SMOOTHED yaw (r.smoothRy) — same value
   once settled, same +PI correction; the functional facing test above measures
   the actual rendered direction either way, so this grep only names the symbol. */
ok(/g\.rotation\.y\s*=\s*-r\.(smoothRy|ry)\s*\+\s*Math\.PI/.test(nsrc),
  'net.js applies the camera/rig convention correction');

/* A head balanced straight on the shoulders reads as a crate. */
const neck = vm.runInContext(`(function(){
  var av = Avatars.buildAvatar('Bot', 0xf0a232);
  var sc = new THREE.Scene(); sc.add(av.group); av.baseY = ${CY};
  for (var f = 0; f < 300; f++) Avatars.poseAvatar(av, { moved:0, mx:0, mz:0, run:false,
    crouch:0, prone:0, dead:false, deadT:0, rx:0, ry:0, lean:0, reloading:false, dist:10, dt:0.016 });
  av.group.updateMatrixWorld(true);
  var hb = new THREE.Box3().setFromObject(av.headMesh);
  var tb = new THREE.Box3().setFromObject(av.torso);
  var necks = [];
  av.head.children.forEach(function(o){ if (o.isMesh && o !== av.headMesh) necks.push(o); });
  var nb = necks.length ? new THREE.Box3().setFromObject(necks[0]) : null;
  return {
    gap: hb.min.y - tb.max.y,
    hasNeck: !!nb,
    neckBridges: nb ? (nb.min.y <= tb.max.y + 0.001 && nb.max.y >= hb.min.y - 0.001) : false,
    headW: hb.max.x - hb.min.x, headD: hb.max.z - hb.min.z, headH: hb.max.y - hb.min.y,
    torsoW: tb.max.x - tb.min.x
  };
})();`, ctx, { filename: '<neck>' });

ok(neck.hasNeck, 'a neck exists between the shoulders and the head');
ok(neck.neckBridges, 'the neck actually bridges the gap, leaving no floating head');
ok(neck.headW >= neck.headD - 0.001,
  'head is not deeper than it is wide [' + neck.headW.toFixed(3) + 'w x ' + neck.headD.toFixed(3) + 'd]');
/* Silhouette must not shrink — Rahul: "not make it small avatar." */
ok(neck.torsoW >= 0.60,
  'torso stays wide enough to spot at range [' + neck.torsoW.toFixed(3) + ' m, floor 0.60]');
ok(neck.headH >= 0.25,
  'head stays large enough to aim at [' + neck.headH.toFixed(3) + ' m, floor 0.25]');

/* ---- v8.35 PRONE ORIENTATION ----

   Prone shipped backwards from whenever it was written until v8.35: the body
   rotation had the wrong sign, so the operator lay on their BACK with the head
   behind and the feet forward, and the rifle — still posed for standing —
   pointed at the sky.

   Nothing caught it because every gate up to this point measured HEIGHTS. A
   body lying the wrong way round is exactly the right height. These assertions
   measure DIRECTION, which is the axis the bug lived on. */
{
  const CFGl = require('../public/src/config/index.js');
  const CY = 10, GROUND = CY - CFGl.PLAYER.proneH / 2;
  const P = vm.runInContext(`(function(){
    var av = Avatars.buildAvatar('Pr', 0xf0a232);
    Avatars.setRemoteGun({ av: av, gunName: null }, 0);
    var sc = new THREE.Scene(); sc.add(av.group); av.baseY = ${CY};
    for (var f = 0; f < 420; f++) Avatars.poseAvatar(av, { moved:0, mx:0, mz:0, run:false,
      crouch:0, prone:1, dead:false, deadT:0, rx:0, ry:0, lean:0, reloading:false, dist:10, dt:0.016 });
    av.group.updateMatrixWorld(true);
    function wp(o){ var v = new THREE.Vector3(); o.getWorldPosition(v); return v; }
    var foot = null; av.hipL.knee.children.forEach(function(o){ if (o.isMesh) foot = o; });
    var h = wp(av.headMesh), f = wp(foot), g = wp(av.gun);
    var barrel = new THREE.Vector3(0,0,-1)
      .applyQuaternion(av.gun.getWorldQuaternion(new THREE.Quaternion()));
    var lo = 1e9, gunLo = 1e9;
    av.group.traverse(function(o){
      if (!o.isMesh || !o.visible) return;
      var n = o, tag = false, inGun = false;
      while (n) { if (n === av.tagHolder) tag = true; if (n === av.gun) inGun = true; n = n.parent; }
      if (tag) return;
      var b = new THREE.Box3().setFromObject(o);
      if (b.min.y < lo) lo = b.min.y;
      if (inGun && b.min.y < gunLo) gunLo = b.min.y;
    });
    return { headZ:h.z, footZ:f.z, headY:h.y-${CY}, gunZ:g.z, gunY:g.y-${CY},
             barrelY:barrel.y, barrelZ:barrel.z,
             lowest:lo-${GROUND}, gunLowest:gunLo-${GROUND} };
  })();`, ctx, { filename: '<prone>' });

  ok(P.headZ > 0.25, 'prone: the head points FORWARD [z ' + P.headZ.toFixed(2) + ']');
  ok(P.footZ < -0.25, 'prone: the feet point BACKWARD [z ' + P.footZ.toFixed(2) + ']');
  ok(P.headZ > P.footZ + 1.0,
    'prone: the body is laid out head-first, not reversed [head ' + P.headZ.toFixed(2) +
    ' vs feet ' + P.footZ.toFixed(2) + ']');
  ok(Math.abs(P.headY) < 0.30,
    'prone: the head is DOWN at body level, not standing up [y ' + P.headY.toFixed(2) + ']');
  ok(P.gunZ > P.headZ - 0.15,
    'prone: the weapon is out in front, not behind the operator [gun ' + P.gunZ.toFixed(2) +
    ' vs head ' + P.headZ.toFixed(2) + ']');
  ok(Math.abs(P.barrelY) < 0.30,
    'prone: the barrel is level, not aimed at the sky or the dirt [dirY ' + P.barrelY.toFixed(2) + ']');
  ok(P.barrelZ > 0.85, 'prone: the barrel points forward [dirZ ' + P.barrelZ.toFixed(2) + ']');
  ok(P.gunLowest > 0.0,
    'prone: no part of the weapon is underground [' + P.gunLowest.toFixed(3) + ' m]');
  ok(P.lowest > -0.10,
    'prone: the body rests on the deck rather than sinking through it [' + P.lowest.toFixed(3) + ' m]');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
