/* ===== v1.0j - URBAN ZONE (client) =====
   The server rolls the circles once and sends them with matchStart (and with
   every reconnect); from then on this reads CFG.zoneCircleAt(schedule,
   matchTime) — the same function the server damages by — so the wall you see
   is the wall you bleed at, on every client, with no traffic.

   What it draws: a tall translucent WALL at the current circle (red glass, the
   PUBG blue-wall idea in this game's danger colour), a thin white ring on the
   ground where the NEXT circle will be during the hold, and — when you are
   outside — a pulsing red edge, a banner with the distance and direction to
   safety, and the bleed toast. The M map paints everything outside the circle
   red and the circle green (minimap.js). */
var Zone = (function () {
  var sched = null, scene = null, wall = null, nextRing = null, cur = null, wasOut = false, lastNotice = 0;
  var WALL_MAT = null, RING_MAT = null;

  function matchTime() {
    var m = (typeof Net !== 'undefined' && Net.getMatch) ? Net.getMatch() : null;
    if (!m || !m.startedAt) return 0;
    return (Date.now() + (m.serverOffset || 0) - m.startedAt) / 1000;
  }
  function init(sc) { scene = sc; }
  function set(s) {
    dispose();
    sched = s || null;
    if (!sched || !scene) return;
    var Z = CFG.ZONE || { wallHeight: 60 };
    if (!WALL_MAT) WALL_MAT = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    if (!RING_MAT) RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, Z.wallHeight || 60, 96, 1, true), WALL_MAT);
    wall.position.y = (Z.wallHeight || 60) / 2 - 1;
    wall.frustumCulled = false;
    scene.add(wall);
    nextRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 96), RING_MAT);
    nextRing.rotation.x = -Math.PI / 2; nextRing.position.y = 0.12; nextRing.frustumCulled = false;
    scene.add(nextRing);
    wasOut = false;
    if (typeof UI !== 'undefined' && UI.setZoneBanner) UI.setZoneBanner('URBAN ZONE \u00b7 the circle closes at 2:00', false);
  }
  function dispose() {
    if (wall && scene) { scene.remove(wall); wall.geometry.dispose(); }
    if (nextRing && scene) { scene.remove(nextRing); nextRing.geometry.dispose(); }
    wall = null; nextRing = null; sched = null; cur = null; wasOut = false;
    if (typeof UI !== 'undefined' && UI.setZoneBanner) UI.setZoneBanner('', false);
    if (typeof FX !== 'undefined' && FX.zoneEdge) FX.zoneEdge(0);
  }
  function active() { return !!sched; }
  function current() { return cur; }

  function update(dt) {
    if (!sched || !wall) return;
    var t = matchTime();
    cur = CFG.zoneCircleAt(sched, t);
    wall.position.x = cur.cx; wall.position.z = cur.cz;
    wall.scale.set(cur.r, 1, cur.r);
    WALL_MAT.opacity = 0.16 + 0.10 * (0.5 + 0.5 * Math.sin(t * 2.2));
    if (cur.next && !cur.shrinking) {
      nextRing.visible = true; nextRing.position.x = cur.next.cx; nextRing.position.z = cur.next.cz; nextRing.scale.set(cur.next.r, cur.next.r, 1);
    } else nextRing.visible = false;

    if (typeof PlayerCtl === 'undefined' || !PlayerCtl.alive) { if (typeof FX !== 'undefined' && FX.zoneEdge) FX.zoneEdge(0); return; }
    var px = PlayerCtl.pos.x, pz = PlayerCtl.pos.z;
    var dx = px - cur.cx, dz = pz - cur.cz, d = Math.sqrt(dx * dx + dz * dz);
    var out = d > cur.r;
    var banner, urgent = false;
    if (out) {
      var dist = d - cur.r;
      var ang = Math.atan2(-dx, -dz);                  // world direction to the centre
      var rel = ang - PlayerCtl.yaw; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
      var arrow = Math.abs(rel) < 0.4 ? '\u2191' : rel > 0 ? '\u2190' : '\u2192';
      if (Math.abs(rel) > 2.7) arrow = '\u2193';
      banner = 'OUTSIDE THE ZONE \u00b7 ' + Math.ceil(dist) + ' m to safety ' + arrow + ' \u00b7 bleeding';
      urgent = true;
      if (typeof FX !== 'undefined' && FX.zoneEdge) FX.zoneEdge(0.55 + 0.25 * Math.sin(t * 6));
    } else {
      if (typeof FX !== 'undefined' && FX.zoneEdge) FX.zoneEdge(0);
      if (cur.phase === 0 && t < sched.fullSec) banner = 'URBAN ZONE \u00b7 the circle closes in ' + fmt(sched.fullSec - t);
      else if (cur.shrinking) { banner = 'ZONE CLOSING \u00b7 ' + Math.ceil(cur.r - d) + ' m inside'; urgent = (cur.r - d) < 25; }
      else if (cur.next) banner = 'NEXT CIRCLE IN ' + fmt(cur.holdLeft) + ' \u00b7 ' + Math.ceil(cur.r - d) + ' m inside';
      else banner = 'FINAL CIRCLE \u00b7 ' + Math.ceil(cur.r - d) + ' m inside';
    }
    if (typeof UI !== 'undefined' && UI.aliveCount) { var na = UI.aliveCount(); if (na > 0) banner += ' \u00b7 ' + na + ' ALIVE'; }
    if (typeof UI !== 'undefined' && UI.setZoneBanner) UI.setZoneBanner(banner, urgent);
    if (out !== wasOut && typeof UI !== 'undefined' && UI.toast) {
      UI.toast(out ? 'You are outside the zone \u2014 10% health a second' : 'Back inside the zone', out);
      wasOut = out;
    }
  }
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s2 = sec % 60; return m + ':' + (s2 < 10 ? '0' : '') + s2; }
  function notice(d) {
    if (!d || typeof UI === 'undefined') return;
    if (d.kind === 'first') { UI.announce('THE ZONE IS CLOSING'); UI.toast('The map is now reducing \u2014 stay inside the circle', true); }
    else if (d.kind === 'phase') UI.toast('Circle ' + d.phase + ' of ' + d.of + ' \u00b7 radius ' + d.r + ' m \u00b7 closing in ' + (sched ? sched.holdSec : 30) + ' s');
  }

  return { init: init, set: set, dispose: dispose, update: update, active: active, current: current, notice: notice, schedule: function () { return sched; } };
})();
