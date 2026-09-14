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

  function init(sc, map) {
    dispose();
    scene = sc;
    cfg = (map === 'urban' && CFG.HELI) ? CFG.HELI : null;
    if (!cfg) return false;
    path = World.trainPath({ waypoints: cfg.route, fillet: cfg.fillet });
    group = build();
    scene.add(group);
    set(null);
    return true;
  }
  function dispose() {
    if (group && scene) { scene.remove(group); group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    group = null; state = null; pose = null; prevPose = null; cfg = null; path = null;
    if (typeof UI !== 'undefined' && UI.setHeliHud) UI.setHeliHud(null);
  }
  function set(st) {
    state = st || null;
    if (group) group.visible = !!(state && state.state !== 'gone');
    if (typeof UI !== 'undefined' && UI.setHeliHud) UI.setHeliHud(state && state.state !== 'gone' ? { hp: state.hp, max: cfg ? cfg.hp : 900, state: state.state } : null);
  }
  function hpUpdate(d) { if (state) { state.hp = d.hp; if (typeof UI !== 'undefined' && UI.setHeliHud) UI.setHeliHud({ hp: d.hp, max: d.max, state: state.state }); } }
  function active() { return !!(cfg && state && state.state !== 'gone'); }
  function isRiding() { return !!(state && state.riders && typeof Net !== 'undefined' && state.riders.indexOf(Net.getMyId()) >= 0 && state.state === 'flying'); }

  function computePose() {
    if (!state) return null;
    if (state.state === 'flying') return CFG.heliPoseAt(cfg, path, (serverNow() - state.t0) / 1000);
    var q = path.at(0);
    return { x: cfg.pad[0], z: cfg.pad[1], y: cfg.padY, yaw: q.yaw, phase: 'down', s: 0 };
  }
  function update(dt) {
    if (!group || !state) return;
    if (state.state === 'gone') { group.visible = false; return; }
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
    riderHud(); rotorSound();
  }
  function riderHud() {
    if (typeof PlayerCtl === 'undefined' || typeof UI === 'undefined') return;
    var aboard = !!PlayerCtl.onPlatform && isRiding();
    if (aboard && !wasAboard && UI.toast && performance.now() - boardToastAt > 4000) { UI.toast('AIRBORNE \u2014 do not jump; falling from the helicopter is fatal', true); boardToastAt = performance.now(); }
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
    if (Math.abs(lx) > CAB_HX + 0.5 || Math.abs(lz) > CAB_HZ + 0.6) return null;
    var airborne = state.state === 'flying' && pose.y > cfg.padY + 1.0;
    if (performance.now() < bailUntil) return null;                     // bailing: no floor, no walls
    if (feet < floor - 1.3 || feet > floor + CAB_H + 0.5) return null;
    var inside = Math.abs(lx) <= CAB_HX && Math.abs(lz) <= CAB_HZ;
    if (!inside && !airborne) return null;                              // on the pad the cabin is open at the sides
    return { y: floor, inside: true, doorZone: !airborne, ceil: floor + CAB_H, px: prevPose.x, pz: prevPose.z, pyaw: prevPose.yaw,
      cx: pose.x, cz: pose.z, yaw: pose.yaw, lx: lx, lz: lz, halfW: CAB_HZ - 0.05, halfL: CAB_HX - 0.05, vx: 0, vz: 0 };
  }
  /* jumping while airborne = bail: the floor lets go for a second */
  function bail() { if (isRiding() && state.state === 'flying' && pose && pose.y > cfg.padY + 1.0) { bailUntil = performance.now() + 1500; return true; } return false; }

  /* ---------- shooting it ---------- */
  var _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _box = new THREE.Box3(new THREE.Vector3(-7.2, 0, -1.6), new THREE.Vector3(3.8, 3.6, 1.6)), _ray = new THREE.Ray(), _hit = new THREE.Vector3();
  function rayHit(origin, dir, maxDist) {
    if (!active() || !group || !pose) return null;
    _inv.copy(group.matrixWorld).invert();
    _o.copy(origin).applyMatrix4(_inv); _d.copy(dir).transformDirection(_inv);
    _ray.set(_o, _d);
    if (!_ray.intersectBox(_box, _hit)) return null;
    var t = _hit.distanceTo(_o);
    if (t > maxDist) return null;
    return { t: t, point: _hit.clone().applyMatrix4(group.matrixWorld) };
  }

  return { init: init, dispose: dispose, set: set, hpUpdate: hpUpdate, update: update, floorAt: floorAt, bail: bail, rayHit: rayHit,
    active: active, isRiding: isRiding, pose: function () { return pose; }, state: function () { return state; } };
})();
