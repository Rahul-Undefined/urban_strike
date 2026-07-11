/* Weapons — everything the player holds and throws.
   Data-driven from CFG.WEAPONS / CFG.THROWS (edit shared-config.js to balance). */
var Weapons = (function () {
  var camera = null, scene = null;
  var rig = null;                 // viewmodel root, parented to the camera
  var models = {};                // weaponName -> THREE.Group
  var current = 'ak47';
  var ammo = {};                  // name -> {mag, reserve}
  var throwsLeft = { frag: 2, smoke: 1, flash: 1 };
  var nextFireAt = 0, reloadUntil = 0, boltUntil = 0, switchUntil = 0;
  var reloadingShell = false;
  var triggerDown = false, semiQueued = false;
  var kick = 0, meleeAnim = 0;
  var projectiles = [];           // rockets + grenades (local sim on every client)
  var tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function part(g, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); g.add(b); return b;
  }

  function buildModels() {
    var gunmetal = mat(0x2b2f34), wood = mat(0x6b4a2a), tan = mat(0x4a4438),
      green = mat(0x36402e), steel = mat(0x54595f), blade = mat(0xb9bfc6);
    function rifle(bodyM, len, hasStock) {
      var g = new THREE.Group();
      part(g, 0, 0, -len * 0.5, 0.055, 0.075, len, gunmetal);          // barrel/receiver
      part(g, 0, -0.02, -0.1, 0.06, 0.1, 0.3, bodyM);                  // body
      part(g, 0, -0.12, -0.16, 0.045, 0.16, 0.07, bodyM);              // mag
      part(g, 0, -0.09, 0.06, 0.05, 0.11, 0.06, gunmetal);             // grip
      if (hasStock) part(g, 0, 0, 0.16, 0.05, 0.08, 0.2, bodyM);
      part(g, 0, 0.045, -len * 0.85, 0.02, 0.03, 0.05, gunmetal);      // front sight
      return g;
    }
    models.ak47 = rifle(wood, 0.72, true);
    models.m4a1 = rifle(tan, 0.68, true);
    models.uzi = rifle(gunmetal, 0.4, false);
    models.shotgun = rifle(wood, 0.78, true);
    models.pistol = (function () {
      var g = new THREE.Group();
      part(g, 0, 0, -0.14, 0.045, 0.06, 0.26, gunmetal);
      part(g, 0, -0.08, 0.02, 0.045, 0.12, 0.06, gunmetal);
      return g;
    })();
    models.sniper = (function () {
      var g = rifle(green, 0.95, true);
      var sc = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 8), gunmetal);
      sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.075, -0.2); g.add(sc);
      return g;
    })();
    models.rocket = (function () {
      var g = new THREE.Group();
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 10), green);
      tube.rotation.x = Math.PI / 2; tube.position.z = -0.25; g.add(tube);
      part(g, 0, -0.11, 0, 0.05, 0.12, 0.06, gunmetal);
      part(g, 0, 0.1, -0.05, 0.04, 0.06, 0.1, steel);
      return g;
    })();
    models.knife = (function () {
      var g = new THREE.Group();
      part(g, 0, -0.02, -0.16, 0.015, 0.05, 0.26, blade);
      part(g, 0, -0.04, 0.0, 0.03, 0.05, 0.1, gunmetal);
      return g;
    })();
    for (var k in models) { models[k].visible = false; rig.add(models[k]); }
  }

  function init(cam, sc) {
    camera = cam; scene = sc;
    rig = new THREE.Group();
    rig.position.set(0.26, -0.22, -0.5);
    camera.add(rig);
    buildModels();
    resetLoadout();
  }

  function resetLoadout() {
    CFG.WEAPON_ORDER.forEach(function (n) {
      var w = CFG.WEAPONS[n];
      ammo[n] = { mag: w.mag, reserve: w.reserve };
    });
    throwsLeft = { frag: CFG.THROWS.frag.count, smoke: CFG.THROWS.smoke.count, flash: CFG.THROWS.flash.count };
    setWeapon('ak47', true);
  }

  function setWeapon(name, instant) {
    if (!CFG.WEAPONS[name]) return;
    if (name === current && !instant) return;
    if (models[current]) models[current].visible = false;
    current = name;
    if (models[current]) models[current].visible = true;
    reloadUntil = 0; reloadingShell = false; boltUntil = 0;
    switchUntil = instant ? 0 : performance.now() + 380;
    UI.setWeapon(CFG.WEAPONS[name].label, ammo[name].mag, ammo[name].reserve, throwsLeft);
    if (!instant) AudioSys.magIn(null);
  }
  function selectByKey(k) {
    for (var i = 0; i < CFG.WEAPON_ORDER.length; i++) {
      var n = CFG.WEAPON_ORDER[i];
      if (CFG.WEAPONS[n].key === k) { setWeapon(n); return; }
    }
  }
  function cycle(dir) {
    var i = CFG.WEAPON_ORDER.indexOf(current);
    i = (i + dir + CFG.WEAPON_ORDER.length) % CFG.WEAPON_ORDER.length;
    setWeapon(CFG.WEAPON_ORDER[i]);
  }

  function startReload() {
    var w = CFG.WEAPONS[current], a = ammo[current];
    if (w.type === 'melee' || a.mag >= w.mag || a.reserve <= 0 || isReloading()) return;
    if (w.shellReload) { reloadingShell = true; reloadUntil = performance.now() + w.reload * 1000; }
    else { reloadUntil = performance.now() + w.reload * 1000; }
    AudioSys.reload(null);
    UI.setReloading(true);
  }
  function isReloading() { return performance.now() < reloadUntil; }

  function finishReload() {
    var w = CFG.WEAPONS[current], a = ammo[current];
    if (w.shellReload) {
      if (a.mag < w.mag && a.reserve > 0) { a.mag++; a.reserve--; AudioSys.magIn(null); }
      if (a.mag < w.mag && a.reserve > 0 && reloadingShell) {
        reloadUntil = performance.now() + w.reload * 1000; // next shell
      } else { reloadingShell = false; UI.setReloading(false); }
    } else {
      var need = w.mag - a.mag, take = Math.min(need, a.reserve);
      a.mag += take; a.reserve -= take;
      AudioSys.magIn(null);
      UI.setReloading(false);
    }
    UI.setWeapon(w.label, a.mag, a.reserve, throwsLeft);
  }

  // ---------- firing ----------
  function muzzleWorld(out) {
    out.set(0.24, -0.15, -0.6).applyQuaternion(camera.getWorldQuaternion(tmpQ)).add(camera.position);
    return out;
  }
  function rayDir(spread, out) {
    camera.getWorldDirection(out);
    if (spread > 0) {
      out.x += (Math.random() - 0.5) * 2 * spread;
      out.y += (Math.random() - 0.5) * 2 * spread;
      out.z += (Math.random() - 0.5) * 2 * spread;
      out.normalize();
    }
    return out;
  }
  function rayBox(o, d, cx, cy, cz, hx, hy, hz) {
    var tmin = 0, tmax = Infinity;
    var lo = [cx - hx, cy - hy, cz - hz], hi = [cx + hx, cy + hy, cz + hz];
    var oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (var i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < lo[i] || oo[i] > hi[i]) return -1; }
      else {
        var t1 = (lo[i] - oo[i]) / dd[i], t2 = (hi[i] - oo[i]) / dd[i];
        if (t1 > t2) { var t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmax < tmin) return -1;
      }
    }
    return tmin;
  }
  // One hitscan ray: returns {type:'world'|'player', t, point, id?, part?}
  function castRay(o, d, maxDist) {
    var wh = World.rayHit(o, d, maxDist);
    var best = wh ? wh.t : maxDist;
    var hit = wh ? { type: 'world', t: wh.t, point: wh.point } : null;
    var P = CFG.PLAYER;
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      var c = r.renderPos;
      var halfH = r.crouch ? P.crouchH / 2 : P.standH / 2;
      var eyeY = c.y + (r.crouch ? P.eyeCrouch : P.eyeStand);
      var tHead = rayBox(o, d, c.x, eyeY + 0.04, c.z, P.headR, P.headR, P.headR);
      var tBody = rayBox(o, d, c.x, c.y, c.z, P.radius, halfH, P.radius);
      var part = null, t = -1;
      if (tHead >= 0 && (tBody < 0 || tHead <= tBody)) { t = tHead; part = 'head'; }
      else if (tBody >= 0) { t = tBody; part = 'body'; }
      if (t >= 0 && t < best) {
        best = t;
        hit = { type: 'player', t: t, id: id, part: part, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), vp: [c.x, c.y, c.z] };
      }
    });
    return hit;
  }

  function fireHitscan(w) {
    var pellets = w.pellets || 1;
    var aiming = Input.aim && w.type !== 'melee';
    var spread = aiming ? w.ads : w.spread;
    if (PlayerCtl.moveState === 2) spread *= 2.6;
    else if (PlayerCtl.moveState === 1) spread *= 1.5;
    if (!PlayerCtl.grounded) spread *= 2.2;
    if (PlayerCtl.crouch) spread *= 0.75;

    var o = camera.position.clone();
    var mz = muzzleWorld(tmpV2).clone();
    var perVictim = {};
    for (var i = 0; i < pellets; i++) {
      var d = rayDir(spread, new THREE.Vector3());
      var hit = castRay(o, d, 400);
      var end = hit ? hit.point : o.clone().addScaledVector(d, 120);
      FX.tracer(mz, end);
      if (hit && hit.type === 'world') { FX.impact(hit.point); AudioSys.impact(hit.point); }
      if (hit && hit.type === 'player') {
        FX.bloodPuff(hit.point);
        AudioSys.flesh(hit.point);
        var pv = perVictim[hit.id] || (perVictim[hit.id] = { pellets: 0, part: 'body', vp: hit.vp });
        pv.pellets++;
        if (hit.part === 'head') pv.part = 'head';
      }
    }
    for (var id in perVictim) {
      var pv2 = perVictim[id];
      Net.sendHit({ victim: id, w: current, part: pv2.part, pellets: pv2.pellets, vp: pv2.vp });
    }
    FX.muzzle(mz, true);
    Net.sendShoot({ w: current, o: [mz.x, mz.y, mz.z], dir: [0, 0, 0] });
  }

  function fireMelee(w) {
    var o = camera.position.clone();
    var d = camera.getWorldDirection(new THREE.Vector3());
    var hit = castRay(o, d, w.range);
    meleeAnim = 1;
    AudioSys.shot('knife', null);
    if (hit && hit.type === 'player') {
      FX.bloodPuff(hit.point);
      AudioSys.flesh(hit.point);
      Net.sendHit({ victim: hit.id, w: 'knife', part: 'body', pellets: 1, vp: hit.vp });
    } else if (hit) { FX.impact(hit.point); }
  }

  function fireRocket(w) {
    var o = muzzleWorld(new THREE.Vector3()).clone();
    var d = rayDir(Input.aim ? w.ads : w.spread, new THREE.Vector3());
    var v = d.multiplyScalar(w.projSpeed);
    spawnRocket(o, v, true);
    Net.sendProj({ type: 'rocket', o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    FX.muzzle(o, true);
    FX.shake(0.25);
  }

  function tryFire() {
    var w = CFG.WEAPONS[current], a = ammo[current];
    var t = performance.now();
    if (t < nextFireAt || t < switchUntil || t < boltUntil || !PlayerCtl.alive) return;
    if (isReloading()) {
      if (w.shellReload && a.mag > 0) { reloadUntil = 0; reloadingShell = false; UI.setReloading(false); } // pump: interrupt shell reload
      else return;
    }
    if (w.type !== 'melee') {
      if (a.mag <= 0) {
        AudioSys.magIn(null); // dry click
        if (a.reserve > 0) startReload();
        nextFireAt = t + 250;
        return;
      }
      a.mag--;
    }
    nextFireAt = t + 60000 / w.rpm;
    kick = 1;
    PlayerCtl.pitch += w.recoil * (0.85 + Math.random() * 0.35);
    PlayerCtl.yaw += (Math.random() - 0.5) * w.recoil * 0.45;

    if (w.type === 'melee') fireMelee(w);
    else if (w.type === 'rocket') { AudioSys.shot('rocket', null); fireRocket(w); }
    else {
      AudioSys.shot(current, null);
      fireHitscan(w);
      if (w.type === 'bolt') { boltUntil = t + w.boltTime * 1000; setTimeout(function () { AudioSys.bolt(null); }, 260); }
    }
    UI.setWeapon(w.label, a.mag, a.reserve, throwsLeft);
    if (w.type !== 'melee' && a.mag === 0 && a.reserve > 0) setTimeout(startReload, w.type === 'pump' ? 400 : 220);
  }

  // ---------- throwables ----------
  function throwGrenade(type) {
    if (!PlayerCtl.alive || throwsLeft[type] <= 0) return;
    throwsLeft[type]--;
    AudioSys.pinPull(null);
    var o = camera.position.clone();
    var d = camera.getWorldDirection(new THREE.Vector3());
    var spec = CFG.THROWS[type];
    var v = d.multiplyScalar(spec.throwVel).add(new THREE.Vector3(0, 2.6, 0));
    v.x += PlayerCtl.vel.x * 0.4; v.z += PlayerCtl.vel.z * 0.4;
    spawnGrenade(type, o, v, true);
    Net.sendThrow({ type: type, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    AudioSys.whoosh(null);
    UI.setWeapon(CFG.WEAPONS[current].label, ammo[current].mag, ammo[current].reserve, throwsLeft);
  }

  function grenadeMesh(type) {
    var c = type === 'frag' ? 0x3a4a34 : type === 'smoke' ? 0x777d84 : 0x8a8258;
    var m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(c));
    m.castShadow = true;
    return m;
  }
  function spawnGrenade(type, o, v, mine) {
    var m = grenadeMesh(type);
    m.position.copy(o); scene.add(m);
    projectiles.push({ kind: 'nade', type: type, pos: o.clone(), vel: v.clone(), fuse: CFG.THROWS[type].fuse + 0.35, mesh: m, mine: mine });
  }
  function spawnRocket(o, v, mine) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), mat(0x4a4438));
    body.rotation.x = Math.PI / 2; g.add(body);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x7a2f22));
    tip.position.z = -0.28; g.add(tip);
    g.position.copy(o); g.lookAt(o.clone().add(v));
    scene.add(g);
    projectiles.push({ kind: 'rocket', pos: o.clone(), vel: v.clone(), mesh: g, mine: mine, life: 0 });
  }

  function resolveGrenade(p, dt) {
    p.vel.y -= 12 * dt;
    p.pos.addScaledVector(p.vel, dt);
    var h = 0.11, cs = World.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (!(p.pos.x - h < c[3] && p.pos.x + h > c[0] && p.pos.y - h < c[4] && p.pos.y + h > c[1] && p.pos.z - h < c[5] && p.pos.z + h > c[2])) continue;
      var pen = [
        c[3] - (p.pos.x - h), (p.pos.x + h) - c[0],
        c[4] - (p.pos.y - h), (p.pos.y + h) - c[1],
        c[5] - (p.pos.z - h), (p.pos.z + h) - c[2]
      ];
      var m = 0; for (var j = 1; j < 6; j++) if (pen[j] < pen[m]) m = j;
      var axis = m >> 1, sign = (m % 2 === 0) ? 1 : -1;
      if (axis === 0) { p.pos.x += pen[m] * sign; p.vel.x *= -0.42; p.vel.y *= 0.75; p.vel.z *= 0.75; }
      if (axis === 1) { p.pos.y += pen[m] * sign; p.vel.y *= -0.38; p.vel.x *= 0.7; p.vel.z *= 0.7; }
      if (axis === 2) { p.pos.z += pen[m] * sign; p.vel.z *= -0.42; p.vel.x *= 0.75; p.vel.y *= 0.75; }
      if (p.vel.lengthSq() > 3) AudioSys.bounce(p.pos);
    }
    p.mesh.position.copy(p.pos);
  }

  function detonate(p) {
    var pos = p.pos;
    if (p.type === 'frag' || p.kind === 'rocket') {
      var spec = p.kind === 'rocket' ? { dmg: CFG.WEAPONS.rocket.dmg, radius: CFG.WEAPONS.rocket.radius } : CFG.THROWS.frag;
      FX.explosion(pos, spec.radius);
      AudioSys.explosion(pos.distanceTo(camera.position) < 3 ? null : pos, true);
      if (p.mine) explosionDamage(pos, spec.radius, spec.dmg, p.kind === 'rocket' ? 'rocket' : 'frag');
      selfExplosionFeedback(pos, spec.radius);
    } else if (p.type === 'smoke') {
      FX.smokeCloud(pos, CFG.THROWS.smoke.dur);
      AudioSys.impact(pos);
    } else if (p.type === 'flash') {
      FX.explosion(pos, 1.2);
      AudioSys.shot('pistol', pos);
      flashCheck(pos);
    }
  }
  function explosionDamage(center, radius, maxDmg, weaponName) {
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      var d = r.renderPos.distanceTo(center);
      if (d > radius) return;
      var dmg = maxDmg * (1 - d / radius);
      if (World.losBlocked(center.clone().add(new THREE.Vector3(0, 0.25, 0)), r.renderPos)) dmg *= 0.25;
      if (dmg > 1) Net.sendHit({ victim: id, w: weaponName, dmg: dmg, part: 'body', vp: [r.renderPos.x, r.renderPos.y, r.renderPos.z] });
    });
    // self-damage
    var sd = PlayerCtl.pos.distanceTo(center);
    if (PlayerCtl.alive && sd < radius) {
      var dmg2 = maxDmg * (1 - sd / radius);
      if (World.losBlocked(center.clone().add(new THREE.Vector3(0, 0.25, 0)), PlayerCtl.pos)) dmg2 *= 0.25;
      if (dmg2 > 1) Net.sendHit({ victim: Net.myId(), w: weaponName, dmg: dmg2, part: 'body', vp: [PlayerCtl.pos.x, PlayerCtl.pos.y, PlayerCtl.pos.z] });
    }
  }
  function selfExplosionFeedback(pos, radius) {
    var d = camera.position.distanceTo(pos);
    if (d < radius * 2) FX.shake(0.5 * (1 - d / (radius * 2)));
  }
  function flashCheck(pos) {
    var spec = CFG.THROWS.flash;
    var d = camera.position.distanceTo(pos);
    if (d > spec.radius || !PlayerCtl.alive) return;
    if (World.losBlocked(pos, camera.position)) return;
    var toBlast = pos.clone().sub(camera.position).normalize();
    var fwd = camera.getWorldDirection(tmpV);
    var facing = fwd.dot(toBlast);
    var base = 1 - d / spec.radius;
    var intensity = base * (facing > 0.1 ? 1 : 0.3);
    FX.flashbang(Math.min(1, intensity * 1.4));
  }

  function updateProjectiles(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      if (p.kind === 'nade') {
        resolveGrenade(p, dt);
        p.fuse -= dt;
        if (p.fuse <= 0) { detonate(p); scene.remove(p.mesh); projectiles.splice(i, 1); }
      } else { // rocket
        p.life += dt;
        var step = p.vel.length() * dt;
        var dir = tmpV.copy(p.vel).normalize();
        var wh = World.rayHit(p.pos, dir, step + 0.15);
        var hitPlayer = false;
        Net.eachRemote(function (id, r) {
          if (hitPlayer || !r.alive) return;
          if (r.renderPos.distanceTo(p.pos) < 0.85) hitPlayer = true;
        });
        if (wh || hitPlayer || p.life > 6) {
          if (wh) p.pos.copy(wh.point).addScaledVector(dir, -0.05);
          detonate(p); scene.remove(p.mesh); projectiles.splice(i, 1);
        } else {
          p.pos.addScaledVector(dir, step);
          p.mesh.position.copy(p.pos);
        }
      }
    }
  }

  // ---------- per-frame ----------
  function update(dt) {
    var w = CFG.WEAPONS[current];
    var t = performance.now();

    if (reloadUntil > 0 && t >= reloadUntil) { reloadUntil = 0; finishReload(); }

    if (triggerDown && (w.type === 'auto')) tryFire();
    if (semiQueued) { semiQueued = false; tryFire(); }

    // viewmodel motion
    var aiming = Input.aim && PlayerCtl.alive && w.type !== 'melee';
    var scoped = aiming && w.scope;
    var tx = aiming ? 0 : 0.26;
    var ty = aiming ? -0.115 : -0.22;
    var tz = aiming ? -0.34 : -0.5;
    if (isReloading()) { ty -= 0.12; }
    var lerp = Math.min(1, dt * 10);
    rig.position.x += (tx - rig.position.x) * lerp;
    rig.position.y += (ty - rig.position.y) * lerp;
    rig.position.z += (tz + kick * 0.09 - rig.position.z) * lerp;
    rig.rotation.x = -kick * 0.06 + (isReloading() ? -0.5 : 0) + meleeAnim * -0.9;
    rig.rotation.z = meleeAnim * 0.4;
    kick *= Math.pow(0.02, dt);
    meleeAnim *= Math.pow(0.003, dt);
    rig.visible = PlayerCtl.alive && !scoped;

    updateProjectiles(dt);
    return { aiming: aiming, scoped: scoped, adsFov: w.adsFov, speedMult: w.speed };
  }

  return {
    init: init,
    update: update,
    resetLoadout: resetLoadout,
    selectByKey: selectByKey,
    cycle: cycle,
    startReload: startReload,
    throwGrenade: throwGrenade,
    spawnGrenade: spawnGrenade,
    spawnRocket: spawnRocket,
    setTrigger: function (down) { triggerDown = down; if (down && CFG.WEAPONS[current].type !== 'auto') semiQueued = true; },
    currentName: function () { return current; },
    isBoltCycling: function () { return performance.now() < boltUntil; }
  };
})();
