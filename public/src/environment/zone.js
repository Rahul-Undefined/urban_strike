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
   red and the circle green (minimap.js).
   v2.4: nothing here knows which zone it is — the name, the bleed and whether
   the circles are free (Urban Small Zone) are read from the schedule. */
var Zone = (function () {
  var sched = null, scene = null, wall = null, nextRing = null, cur = null, wasOut = false, lastNotice = 0;
  var lastBannerAt = 0, lastUrgent = null;
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
    wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, Z.wallHeight || 60, 64, 1, true), WALL_MAT);   /* v1.0u: 96 -> 64 segments */
    wall.position.y = (Z.wallHeight || 60) / 2 - 1;
    wall.frustumCulled = false;
    scene.add(wall);
    nextRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 96), RING_MAT);
    nextRing.rotation.x = -Math.PI / 2; nextRing.position.y = 0.12; nextRing.frustumCulled = false;
    scene.add(nextRing);
    wasOut = false;
    if (typeof UI !== 'undefined' && UI.setZoneBanner) UI.setZoneBanner(name() + ' \u00b7 the circle closes at ' + fmt(sched.fullSec || 120), false);
  }
  /* v2.4: the name and the bleed come from the schedule the server rolled
     (its mode profile), so Urban Small Zone's "50% every 10 s" and Urban's
     "10% a second" are both read, never typed here */
  function name() { return (sched && sched.label) || 'URBAN ZONE'; }
  function bleedText() {
    var d = (sched && sched.dmgPct) || 10, t = (sched && sched.tickSec) || 1;
    return d + '% health ' + (t === 1 ? 'a second' : 'every ' + t + ' s');
  }
  /* the arrow to a point, relative to where the player looks */
  function arrowTo(tx, tz) {
    var dx = tx - PlayerCtl.pos.x, dz = tz - PlayerCtl.pos.z;
    var ang = Math.atan2(-dx, -dz);
    var rel = ang - PlayerCtl.yaw; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
    var arrow = Math.abs(rel) < 0.4 ? '\u2191' : rel > 0 ? '\u2190' : '\u2192';
    if (Math.abs(rel) > 2.7) arrow = '\u2193';
    return arrow;
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
    /* v2.4: on the free profile the destination ring stays on the ground while
       the wall slides there too — the next circle may be across the map */
    if (cur.next && (!cur.shrinking || sched.free)) {
      nextRing.visible = true; nextRing.position.x = cur.next.cx; nextRing.position.z = cur.next.cz; nextRing.scale.set(cur.next.r, cur.next.r, 1);
    } else nextRing.visible = false;

    if (typeof PlayerCtl === 'undefined' || !PlayerCtl.alive) { if (typeof FX !== 'undefined' && FX.zoneEdge) FX.zoneEdge(0); return; }
    var px = PlayerCtl.pos.x, pz = PlayerCtl.pos.z;
    var dx = px - cur.cx, dz = pz - cur.cz, d = Math.sqrt(dx * dx + dz * dz);
    var out = d > cur.r;
    var banner, urgent = false;
    /* v2.4: with the free roll the NEXT circle can be anywhere on the map, so
       while it is known the banner also says how far and which way it is
       whenever you are not already standing in it — the wall will walk there. */
    var nextHint = '';
    if (cur.next) {
      var ndx = px - cur.next.cx, ndz = pz - cur.next.cz, nd = Math.sqrt(ndx * ndx + ndz * ndz);
      if (nd > cur.next.r) nextHint = ' \u00b7 next circle ' + Math.ceil(nd - cur.next.r) + ' m ' + arrowTo(cur.next.cx, cur.next.cz);
    }
    if (out) {
      var dist = d - cur.r;
      banner = 'OUTSIDE THE ZONE \u00b7 ' + Math.ceil(dist) + ' m to safety ' + arrowTo(cur.cx, cur.cz) + ' \u00b7 bleeding';
      urgent = true;
      if (typeof FX !== 'undefined' && FX.zoneEdge) FX.zoneEdge(0.55 + 0.25 * Math.sin(t * 6));
    } else {
      if (typeof FX !== 'undefined' && FX.zoneEdge) FX.zoneEdge(0);
      if (cur.phase === 0 && t < sched.fullSec) banner = name() + ' \u00b7 the circle closes in ' + fmt(sched.fullSec - t);
      else if (cur.shrinking) { banner = (sched.free ? 'ZONE MOVING' : 'ZONE CLOSING') + ' \u00b7 ' + Math.ceil(cur.r - d) + ' m inside' + nextHint; urgent = (cur.r - d) < 25 || !!nextHint; }
      else if (cur.next) { banner = 'NEXT CIRCLE IN ' + fmt(cur.holdLeft) + ' \u00b7 ' + Math.ceil(cur.r - d) + ' m inside' + nextHint; urgent = !!nextHint && cur.holdLeft < 15; }
      else banner = 'FINAL CIRCLE \u00b7 ' + Math.ceil(cur.r - d) + ' m inside';
    }
    /* v1.0u: DOM writes are throttled — the banner text every 250 ms, the count only
       when the mode has lives to count (respawn modes show none) */
    var mm = (typeof CFG !== 'undefined' && CFG.MODES && Net.getMatch) ? CFG.MODES[Net.getMatch().mode] : null;
    if (mm && mm.lives === 1 && typeof UI !== 'undefined' && UI.aliveCount) { var na = UI.aliveCount(); if (na > 0) banner += ' \u00b7 ' + na + ' ALIVE'; }
    var nowB = performance.now();
    if (typeof UI !== 'undefined' && UI.setZoneBanner && (nowB - lastBannerAt > 250 || urgent !== lastUrgent)) { UI.setZoneBanner(banner, urgent); lastBannerAt = nowB; lastUrgent = urgent; }
    if (out !== wasOut && typeof UI !== 'undefined' && UI.toast) {
      UI.toast(out ? 'You are outside the zone \u2014 ' + bleedText() : 'Back inside the zone', out);
      wasOut = out;
    }
  }
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s2 = sec % 60; return m + ':' + (s2 < 10 ? '0' : '') + s2; }
  function notice(d) {
    if (!d || typeof UI === 'undefined') return;
    if (d.kind === 'first') { UI.announce('THE ZONE IS CLOSING'); UI.toast('The map is now reducing \u2014 stay inside the circle', true); }
    else if (d.kind === 'phase') UI.toast('Circle ' + d.phase + ' of ' + d.of + ' \u00b7 radius ' + d.r + ' m \u00b7 ' + (sched && sched.free ? 'the next one is on the map \u2014 moving' : 'closing') + ' in ' + (sched ? sched.holdSec : 30) + ' s');
  }

  return { init: init, set: set, dispose: dispose, update: update, active: active, current: current, notice: notice, schedule: function () { return sched; } };
})();
