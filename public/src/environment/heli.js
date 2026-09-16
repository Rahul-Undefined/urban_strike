/* ===== v1.0l - THE HELICOPTER (client) =====
   Drawn from `heliState` events alone: {state, t0, hp, riders}. The pose is
   CFG.heliPoseAt(state time) — the same function the server uses to decide who
   is aboard and who fell — with banking added for the eye: the fuselage rolls
   into every turn in proportion to how fast the heading is changing, and noses
   down a little when accelerating out of the climb.

   Riding uses the train's moving-floor contract (floorAt): the cabin floor is
   the platform, the cabin is walled on all four sides while airborne so nobody
   falls out by accident, and the only way out in the air is to JUMP (bail),
   which the server treats as a fall — death, credited to whoever hit the
   helicopter last. On the pad the cabin is open: walk in, walk out.

   Shooting it: fireHitscan asks Heli.rayHit(origin, dir) before the world; a
   hit inside the fuselage box closer than anything else is reported to the
   server as hitHeli with the weapon id. The HUD shows its health to everyone
   in the match while it exists. */
var Heli = (function () {
  var scene = null, cfg = null, path = null, group = null, rotor = null, tailRotor = null, fuselage = null;
  var state = null, pose = null, prevPose = null, lastYaw = 0, roll = 0, pitch = 0;
  var bailUntil = 0, wasAboard = false, boardToastAt = 0, rotorSoundAt = 0;
  var CAB_HX = 1.4, CAB_HZ = 1.25, CAB_H = 2.1;
  var sign = null, signCtx = null, signTex = null, signText = '', signAt = 0, promptOn = false;
  /* v1.0n: the last state the server sent, kept ACROSS init/dispose. The client
     rebuilds the whole map on matchStart (Game.onMatchStart → buildWorld →
     Heli.init) a moment AFTER net.js has already applied `heliState` from the
     matchStart payload; build 13 dropped that state in dispose(), so the machine
     came back invisible with no prompt — Rahul's "helicopter pura vanish".
     Now init() re-applies whatever the server last said. */
  var pending = null;
  var pathSeed = null;                                          // v1.0q: the seed the current `path` was built from
  function ensurePath() {
    if (!state || !cfg) return null;
    var seed = state.seed || 1;
    if (!path || pathSeed !== seed) { var R = CFG.heliRoute(cfg, seed); path = World.trainPath({ waypoints: R.waypoints, fillet: R.fillet }); pathSeed = seed; }
    return path;
  }

  function serverNow() {
    var m = (typeof Net !== 'undefined' && Net.getMatch) ? Net.getMatch() : null;
    return Date.now() + ((m && m.serverOffset) || 0);
  }
  function mat(name, fallback) { var M = World._internals && World._internals().M; return (M && M[name]) || (M && M[fallback]) || new THREE.MeshLambertMaterial({ color: 0x777777 }); }
  function bx(parent, x, y, z, w, h, d, m) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; }

  /* The machine faces +x in its own frame (nose at +x), like the train's loco. */
  function build() {
    var g = new THREE.Group();
    var body = mat('facadeOlive', 'metal'), dark = mat('dark', 'metal'), glass = mat('shopGlass', 'metal'), steel = mat('metal'), warn = mat('hazard', 'metal');
    fuselage = new THREE.Group(); g.add(fuselage);
    bx(fuselage, 0.2, 1.65, 0, 4.6, 1.9, 2.5, body);                     // cabin body
    bx(fuselage, 2.9, 1.5, 0, 1.6, 1.5, 2.0, glass);                    // nose glass
    bx(fuselage, 2.2, 2.35, 0, 1.4, 0.5, 2.3, body);                    // nose cap
    bx(fuselage, 0.2, 0.6 + 0.06, 0, 4.4, 0.12, 2.4, mat('wood'));      // CABIN FLOOR at cabinFloor (0.6)
    bx(fuselage, 0.2, 2.65, 0, 4.8, 0.12, 2.6, dark);                   // cabin roof
    bx(fuselage, -2.0, 1.55, 0, 0.14, 1.8, 2.4, body);                  // rear bulkhead
    bx(fuselage, 2.1, 1.55, 0, 0.14, 1.8, 2.4, body);                   // front bulkhead (behind the pilot)
    [-1.28, 1.28].forEach(function (sz) {                                // open sides: door rails only (a bar at hip height)
      bx(fuselage, 0.2, 1.35, sz, 4.2, 0.08, 0.08, steel);
      bx(fuselage, -1.9, 1.5, sz, 0.1, 1.7, 0.1, steel); bx(fuselage, 2.0, 1.5, sz, 0.1, 1.7, 0.1, steel);
    });
    bx(fuselage, -4.6, 2.1, 0, 5.2, 0.55, 0.55, body);                   // tail boom
    bx(fuselage, -7.0, 2.9, 0, 0.9, 1.7, 0.12, body);                   // tail fin
    bx(fuselage, -6.4, 2.2, 0, 1.6, 0.1, 2.2, body);                    // horizontal stabiliser
    bx(fuselage, 0.2, 2.85, 0, 1.2, 0.5, 1.2, dark);                    // rotor mast housing
    bx(fuselage, -1.2, 3.05, 0, 0.9, 0.5, 0.9, dark);                   // engine cowl
    bx(fuselage, -1.4, 3.4, -0.5, 0.35, 0.3, 0.35, dark);               // exhaust
    [-1.1, 1.1].forEach(function (sz) {                                  // skids
      bx(fuselage, 0.2, 0.15, sz, 4.4, 0.1, 0.1, steel);
      bx(fuselage, -1.2, 0.35, sz, 0.1, 0.5, 0.1, steel); bx(fuselage, 1.6, 0.35, sz, 0.1, 0.5, 0.1, steel);
    });
    bx(fuselage, 3.2, 1.0, 0, 0.9, 0.2, 1.0, warn);                     // nose stripe
    bx(fuselage, 3.72, 1.3, 0, 0.1, 0.3, 0.5, mat('amberGlow', 'white')); // searchlight
    rotor = new THREE.Group(); rotor.position.set(0.2, 3.2, 0); fuselage.add(rotor);
    var bladeM = new THREE.MeshBasicMaterial({ color: 0x14181c, transparent: true, opacity: 0.55 });
    [0, Math.PI / 2].forEach(function (a) { var b = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.06, 0.42), bladeM); b.rotation.y = a; rotor.add(b); });
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(6.3, 6.3, 0.02, 32), new THREE.MeshBasicMaterial({ color: 0x14181c, transparent: true, opacity: 0.12 })); rotor.add(disc);
    tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.28), bladeM); tailRotor.position.set(-7.05, 2.9, 0.1); fuselage.add(tailRotor);
    return g;
  }

  /* v1.0m: THE BOARD at the pad edge — a live countdown when the machine is
     away, "PRESS Z TO BOARD" when it is here, "AIRBORNE" while it flies. */
  function buildSign() {
    var g = new THREE.Group();
    var post = mat('metal');
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    signCtx = cv.getContext('2d');
    signTex = new THREE.CanvasTexture(cv);
    var board = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.0, 0.12), [post, post, post, post,
      new THREE.MeshBasicMaterial({ map: signTex }), new THREE.MeshBasicMaterial({ map: signTex })]);
    board.position.set(0, 2.6, 0); g.add(board);
    var p1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.1, 0.16), post); p1.position.set(-1.7, 1.55, 0); g.add(p1);
    var p2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.1, 0.16), post); p2.position.set(1.7, 1.55, 0); g.add(p2);
    g.position.set(cfg.pad[0] - 8.6, cfg.padY, cfg.pad[1] + 2.0);   // beside the pad, facing the approach
    g.rotation.y = Math.PI / 2;
    return g;
  }
  function drawSign(text, sub, color) {
    if (!signCtx) return;
    var g = signCtx; g.fillStyle = '#10151c'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = color || '#ffd36b'; g.fillRect(0, 0, 512, 8);
    g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#eef3f8';
    g.fillText(text, 256, sub ? 48 : 64);
    if (sub) { g.font = '24px sans-serif'; g.fillStyle = color || '#ffd36b'; g.fillText(sub, 256, 96); }
    signTex.needsUpdate = true;
  }
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s2 = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s2 < 10 ? '0' : '') + s2; }
  function updateSign() {
    if (!signCtx || !state) return;
    var t = performance.now(); if (t - signAt < 250) return; signAt = t;
    var text, sub, col;
    if (state.state === 'gone') { text = 'NEXT HELICOPTER IN'; sub = fmt((state.respawnAt - serverNow()) / 1000); col = '#ff9a4a'; }
    else if (state.state === 'flying') { text = 'HELICOPTER AIRBORNE'; sub = 'a rider presses Q to bring it down'; col = '#7ef0ff'; }
    else if (state.state === 'returning') { text = 'HELICOPTER RETURNING'; sub = pose && pose.left !== undefined ? 'landing in ' + fmt(pose.left) : 'coming back to the pad'; col = '#7ef0ff'; }
    else if (state.state === 'landed') { text = 'HELICOPTER LANDED'; sub = 'Z to fly again \u00b7 leaves in ' + fmt(cfg.unloadSec - (serverNow() - state.t0) / 1000); col = '#7ef0ff'; }
    else if (state.liftIn > 0) { text = 'LIFT-OFF IN ' + Math.ceil(state.liftIn); sub = 'press Z to board'; col = '#7ef0ff'; }
    else { text = 'HELICOPTER READY'; sub = 'walk up \u00b7 press Z to board'; col = '#7ef0ff'; }
    var key = text + '|' + sub; if (key === signText) return; signText = key;
    drawSign(text, sub, col);
  }
  function flightLeft() { return 0; }   /* v1.0q: flights are open-ended */

  function init(sc, map) {
    dispose();
    scene = sc;
    cfg = (map === 'urban' && CFG.HELI) ? CFG.HELI : null;
    if (!cfg) return false;
    path = null; pathSeed = null;                              // v1.0q: built per flight from the server's seed
    group = build();
    scene.add(group);
    sign = buildSign(); scene.add(sign); signText = '';
    set(pending);                                   // re-apply the server's last word (see `pending`)
    return true;
  }
  function dispose() {
    if (group && scene) { scene.remove(group); group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    if (sign && scene) { scene.remove(sign); sign.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    if (signTex) signTex.dispose();
    group = null; sign = null; signCtx = null; signTex = null; state = null; pose = null; prevPose = null; cfg = null; path = null;
    setPrompt(false);
    if (typeof UI !== 'undefined' && UI.setHeliHud) UI.setHeliHud(null);
  }
  function set(st) {
    pending = st || null;
    var prevState = state ? state.state : null;
    state = st || null;
    if (state && prevState !== state.state) state.liftIn = 0;
    if (group) group.visible = !!(state && state.state !== 'gone');
    if (typeof UI !== 'undefined' && UI.setHeliHud) UI.setHeliHud(state && state.state !== 'gone' ? { hp: state.hp, max: cfg ? cfg.hp : 900, state: state.state } : null);
  }
  function hpUpdate(d) { if (state) { state.hp = d.hp; if (typeof UI !== 'undefined' && UI.setHeliHud) UI.setHeliHud({ hp: d.hp, max: d.max, state: state.state }); } }
  function active() { return !!(cfg && state && state.state !== 'gone'); }
  function inAir() { return !!(state && (state.state === 'flying' || state.state === 'returning')); }
  function isRiding() { return !!(state && state.riders && typeof Net !== 'undefined' && state.riders.indexOf(Net.getMyId()) >= 0 && inAir()); }

  function computePose() {
    if (!state) return null;
    var P = ensurePath();
    if (!P) return null;
    if (state.state === 'flying') return CFG.heliPoseAt(cfg, P, (serverNow() - state.t0) / 1000);
    if (state.state === 'returning' && state.from) return CFG.heliReturnPose(cfg, state.from, (serverNow() - state.t0) / 1000);
    var q = P.at(0);
    return { x: cfg.pad[0], z: cfg.pad[1], y: cfg.padY, yaw: q.yaw, phase: 'down', s: 0 };
  }
  function update(dt) {
    if (!group || !state) return;
    if (state.liftIn > 0 && state.state === 'pad') state.liftIn = Math.max(0, state.liftIn - dt);
    if (state.state === 'gone') { group.visible = false; updateSign(); if (promptOn) setPrompt(false); return; }
    prevPose = pose;
    pose = computePose();
    if (!prevPose) prevPose = pose;
    // banking: roll with heading change, pitch with vertical motion
    var dyaw = pose.yaw - lastYaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    var yawRate = dt > 0 ? dyaw / dt : 0; lastYaw = pose.yaw;
    var targetRoll = Math.max(-0.5, Math.min(0.5, -yawRate * 0.9));
    var vy = dt > 0 ? (pose.y - prevPose.y) / dt : 0;
    var targetPitch = pose.phase === 'cruise' ? -0.08 : Math.max(-0.25, Math.min(0.25, -vy * 0.03));
    roll += (targetRoll - roll) * Math.min(1, dt * 3); pitch += (targetPitch - pitch) * Math.min(1, dt * 3);
    var bob = state.state === 'flying' ? Math.sin(performance.now() * 0.0021) * 0.15 : 0;
    group.position.set(pose.x, pose.y + bob, pose.z);
    group.rotation.set(0, -pose.yaw, 0);
    fuselage.rotation.set(roll, 0, pitch);
    var spin = state.state === 'flying' ? 0.55 : (state.state === 'pad' && state.boarding ? 0.25 : 0.06);
    rotor.rotation.y += spin; tailRotor.rotation.x += spin * 1.6;
    riderHud(); rotorSound(); updateSign(); updatePrompt();
  }
  /* v1.0m: "press Z to board" when standing near the machine on the pad */
  function nearForBoarding() {
    if (!active() || !pose || typeof PlayerCtl === 'undefined' || !PlayerCtl.alive) return false;
    if (state.state !== 'pad' && state.state !== 'landed') return false;
    return Math.hypot(PlayerCtl.pos.x - pose.x, PlayerCtl.pos.z - pose.z) <= 6.5;
  }
  function setPrompt(on, text) {
    var e = document.getElementById('heli-prompt');
    if (!e) return;
    if (on) { e.textContent = text || ''; e.classList.add('on'); } else e.classList.remove('on');
    promptOn = !!on;
  }
  function updatePrompt() {
    if (!nearForBoarding()) { if (promptOn) setPrompt(false); return; }
    var me = (typeof Net !== 'undefined' && Net.getMyId) ? Net.getMyId() : null;
    var aboard = !!(state.riders && me && state.riders.indexOf(me) >= 0);
    setPrompt(true, aboard ? 'Z \u2014 STEP OFF' + (state.liftIn > 0 ? ' \u00b7 lift-off in ' + Math.ceil(state.liftIn) : '') : 'Z \u2014 BOARD THE HELICOPTER');
  }
  function canBoard() { return nearForBoarding(); }
  function board() {
    if (!canBoard() || typeof Net === 'undefined' || !Net.boardHeli) return false;
    Net.boardHeli(function (res) {
      if (!res || !res.ok) { if (res && res.err && typeof UI !== 'undefined') UI.toast(res.err, true); return; }
      if (res.relaunch) return;   // v1.0q/u: already seated, flying again — the HUD counts it down
      if (res.seat) onSeat({ pos: res.seat, aboard: true, liftIn: cfg.boardSec });   // v1.0o: sit down NOW, before the next state update goes out
      /* v1.0u: no popup on boarding — the prompt already read "Z — BOARD"; the HUD shows LIFT-OFF IN */
    });
    return true;
  }
  /* v1.0q: Q — a rider brings the machine down (the server turns it for the pad) */
  function landRequest() {
    if (!isRiding() || !state || state.state !== 'flying' || typeof Net === 'undefined' || !Net.heliLand) return false;
    Net.heliLand(function (res) { if (res && !res.ok && res.err && typeof UI !== 'undefined') UI.toast(res.err, true); });
    return true;
  }
  /* the server seats (or unseats) us: take the position it chose */
  function onSeat(d) {
    if (!d || !d.pos || typeof PlayerCtl === 'undefined') return;
    PlayerCtl.pos.set(d.pos[0], d.pos[1], d.pos[2]);
    if (PlayerCtl.vel) PlayerCtl.vel.set(0, 0, 0);
    if (state && d.aboard && d.liftIn !== undefined) state.liftIn = d.liftIn;
  }
  function riderHud() {
    if (typeof PlayerCtl === 'undefined' || typeof UI === 'undefined') return;
    var aboard = !!PlayerCtl.onPlatform && PlayerCtl.platformSrc === 'heli' && isRiding();
    if (aboard && !wasAboard && UI.setHeliHint) UI.setHeliHint('Q lands \u00b7 jumping is fatal'); else if (!aboard && wasAboard && UI.setHeliHint) UI.setHeliHint('');   /* v1.0u: a quiet HUD line, not a popup */
    wasAboard = aboard;
  }
  function rotorSound() {
    if (typeof AudioSys === 'undefined' || !AudioSys.trainRumble || typeof PlayerCtl === 'undefined' || !pose) return;
    var t = performance.now(); if (t - rotorSoundAt < 260) return; rotorSoundAt = t;
    var d = Math.hypot(pose.x - PlayerCtl.pos.x, pose.z - PlayerCtl.pos.z, pose.y - PlayerCtl.pos.y);
    if (d < 120 && state.state === 'flying') AudioSys.trainRumble(new THREE.Vector3(pose.x, pose.y, pose.z), 0.9);
  }

  /* ---------- the cabin floor (train's contract) ---------- */
  function floorAt(pos, halfY) {
    if (!active() || !pose || !prevPose) return null;
    var feet = pos.y - halfY, floor = pose.y + cfg.cabinFloor;
    var dx = pos.x - prevPose.x, dz = pos.z - prevPose.z, cs = Math.cos(prevPose.yaw), sn = Math.sin(prevPose.yaw);
    var lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
    if ((Math.abs(lx) > CAB_HX + 0.5 || Math.abs(lz) > CAB_HZ + 0.6) && !isRiding()) return null;
    var airborne = inAir() && pose.y > cfg.padY + 1.0;
    if (performance.now() < bailUntil) return null;                     // bailing: no floor, no walls
    /* v1.0p: a LISTED rider on a flying machine is held to the floor whatever
       the frame did — a hitch of a few hundred ms at 12.8 m/s of climb used to
       open more gap than the snap window and drop the rider through the
       cabin. The only way off is bail(). */
    var rider = isRiding();
    if (!rider && (feet < floor - 1.3 || feet > floor + CAB_H + 0.5)) return null;
    var inside = Math.abs(lx) <= CAB_HX && Math.abs(lz) <= CAB_HZ;
    if (!inside && !airborne && !rider) return null;                    // on the pad the cabin is open at the sides
    return { y: floor, inside: true, doorZone: !airborne, ceil: floor + CAB_H, px: prevPose.x, pz: prevPose.z, pyaw: prevPose.yaw,
      cx: pose.x, cz: pose.z, yaw: pose.yaw, lx: lx, lz: lz, halfW: CAB_HZ - 0.05, halfL: CAB_HX - 0.05, vx: 0, vz: 0, lock: rider };
  }
  /* jumping while airborne = bail: the floor lets go for a second */
  function bail() {
    if (isRiding() && pose && pose.y > cfg.padY + 1.0) {
      bailUntil = performance.now() + 1500;
      if (typeof Net !== 'undefined' && Net.heliBail) Net.heliBail();   /* v1.0p: tell the server — the jump is the ONLY way off */
      return true;
    }
    return false;
  }

  /* ---------- where a listed rider IS (v1.0u) ----------
     A remote rider's snapshot trails the machine by the network delay, so
     others saw them "hanging" behind the cabin and picked them off. A LISTED
     rider is drawn at their seat in the machine's current pose — the same
     seats the server assigned — so they sit inside, behind the rails. */
  var SEATS = [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6], [-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]];
  function seatFor(id, out) {
    if (!active() || !pose || !state || !state.riders) return null;
    if (state.state !== 'flying' && state.state !== 'returning') return null;
    var idx = state.riders.indexOf(id);
    if (idx < 0) return null;
    var sd = SEATS[idx % SEATS.length], cs = Math.cos(pose.yaw), sn = Math.sin(pose.yaw);
    out = out || new THREE.Vector3();
    out.set(pose.x + sd[0] * cs - sd[1] * sn, pose.y + cfg.cabinFloor, pose.z + sd[0] * sn + sd[1] * cs);
    return out;
  }
  /* is a hull-local point inside an OPEN side (between the hip rail and the roof, on a side face)? */
  function isOpening(local) {
    return Math.abs(local.z) > CAB_HZ - 0.15 && local.y > 1.42 && local.y < 2.58 && local.x > -1.85 && local.x < 1.95;
  }

  /* ---------- shooting it ---------- */
  var _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _box = new THREE.Box3(new THREE.Vector3(-7.2, 0, -1.6), new THREE.Vector3(3.8, 3.6, 1.6)), _ray = new THREE.Ray(), _hit = new THREE.Vector3();
  function rayHit(origin, dir, maxDist) {
    if (!active() || !group || !pose) return null;
    group.updateMatrixWorld(true);                                    // v1.0s: this frame's pose, not the last rendered one
    _inv.copy(group.matrixWorld).invert();
    _o.copy(origin).applyMatrix4(_inv); _d.copy(dir).transformDirection(_inv);
    if (_box.containsPoint(_o)) return null;                        // v1.0s: from inside the cabin there is no hull to hit
    _ray.set(_o, _d);
    if (!_ray.intersectBox(_box, _hit)) return null;
    var t = _hit.distanceTo(_o);
    if (t > maxDist) return null;
    return { t: t, point: _hit.clone().applyMatrix4(group.matrixWorld), local: _hit.clone(), opening: isOpening(_hit) };
  }

  function clear() { pending = null; set(null); }   /* v1.0n: leaving the match forgets the machine */
  return { init: init, dispose: dispose, set: set, clear: clear, hpUpdate: hpUpdate, update: update, floorAt: floorAt, bail: bail, rayHit: rayHit,
    canBoard: canBoard, board: board, onSeat: onSeat, landRequest: landRequest, seatFor: seatFor,
    active: active, isRiding: isRiding, pose: function () { return pose; }, state: function () { return state; } };
})();
