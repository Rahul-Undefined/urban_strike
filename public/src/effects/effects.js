/* FX — pooled visual effects + HUD feedback. All meshes are cheap primitives. */
var FX = (function () {
  var scene = null, camera = null;
  var live = []; // {mesh, life, ttl, update}
  var shakeAmt = 0;
  var muzzleLight = null;

  var tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
  var sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc36b });
  var smokeMat = new THREE.SpriteMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.55, depthWrite: false });
  var fireMat = new THREE.SpriteMaterial({ color: 0xffa640, transparent: true, opacity: 0.95, depthWrite: false });
  var bloodMat = new THREE.MeshBasicMaterial({ color: 0x8f1d12 });

  function init(sc, cam) {
    scene = sc; camera = cam;
    muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2);
    scene.add(muzzleLight);
  }

  function add(mesh, ttl, update) {
    scene.add(mesh);
    live.push({ mesh: mesh, life: 0, ttl: ttl, update: update });
  }

  function tracer(from, to, color) {
    var dir = new THREE.Vector3().subVectors(to, from);
    var len = dir.length();
    if (len < 0.5) return;
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len), tracerMat.clone());
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.lookAt(to);
    add(m, 0.09, function (e, t) { e.mesh.material.opacity = 0.9 * (1 - t); });
  }

  function impact(point) {
    for (var i = 0; i < 5; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), sparkMat);
      m.position.copy(point);
      var v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3.5, (Math.random() - 0.5) * 4);
      (function (vv) {
        add(m, 0.3 + Math.random() * 0.2, function (e, t, dt) {
          vv.y -= 12 * dt;
          e.mesh.position.addScaledVector(vv, dt);
        });
      })(v);
    }
    var puff = new THREE.Sprite(smokeMat.clone());
    puff.position.copy(point); puff.scale.set(0.3, 0.3, 1);
    add(puff, 0.5, function (e, t) {
      e.mesh.scale.setScalar(0.3 + t * 0.9);
      e.mesh.material.opacity = 0.4 * (1 - t);
    });
    // Bullet hole — dark decal sprite, pulled a hair off the surface toward the camera.
    var hole = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x14171c, transparent: true, opacity: 0.85, depthWrite: false }));
    hole.position.copy(point);
    if (camera) hole.position.addScaledVector(new THREE.Vector3().subVectors(camera.position, point).normalize(), 0.045);
    hole.scale.set(0.08, 0.08, 1);
    add(hole, 4.5, function (e, t) { if (t > 0.6) e.mesh.material.opacity = 0.85 * (1 - (t - 0.6) / 0.4); });
  }

  function bloodPuff(point) {
    var mist = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7a1810, transparent: true, opacity: 0.5, depthWrite: false }));
    mist.position.copy(point); mist.scale.set(0.35, 0.35, 1);
    add(mist, 0.4, function (e, t) { e.mesh.scale.setScalar(0.35 + t * 0.8); e.mesh.material.opacity = 0.5 * (1 - t); });
    for (var i = 0; i < 8; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), bloodMat);
      m.position.copy(point);
      var v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      (function (vv) {
        add(m, 0.35, function (e, t, dt) { vv.y -= 10 * dt; e.mesh.position.addScaledVector(vv, dt); });
      })(v);
    }
  }

  // Muzzle flash: crossed star spikes + hot core + smoke wisp + brief light.
  function muzzle(worldPos, isLocal) {
    var baseRot = Math.random() * Math.PI;
    for (var i = 0; i < 3; i++) {
      var spike = new THREE.Sprite(fireMat.clone());
      spike.material.rotation = baseRot + i * 1.05;
      spike.position.copy(worldPos);
      var len = 0.55 + Math.random() * 0.35;
      spike.scale.set(len, 0.14 + Math.random() * 0.06, 1);
      add(spike, 0.05, function (e, t) { e.mesh.material.opacity = 0.95 * (1 - t); });
    }
    var core = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff2c8, transparent: true, opacity: 1, depthWrite: false }));
    core.position.copy(worldPos);
    core.scale.set(0.22, 0.22, 1);
    add(core, 0.04, function (e, t) { e.mesh.material.opacity = 1 - t; });
    var wisp = new THREE.Sprite(smokeMat.clone());
    wisp.position.copy(worldPos);
    wisp.scale.set(0.15, 0.15, 1);
    add(wisp, 0.5, function (e, t, dt) {
      e.mesh.position.y += 0.45 * dt;
      e.mesh.scale.setScalar(0.15 + t * 0.55);
      e.mesh.material.opacity = 0.3 * (1 - t);
    });
    if (isLocal && muzzleLight) {
      muzzleLight.position.copy(worldPos);
      muzzleLight.intensity = 2.6;
      setTimeout(function () { muzzleLight.intensity = 0; }, 45);
    }
  }

  // Brass shell ejection: small tumbling box thrown to the shooter's right.
  var brassMat = new THREE.MeshBasicMaterial({ color: 0xd8a740 });
  function shell(pos, right, floorY) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.055), brassMat);
    m.position.copy(pos);
    var v = new THREE.Vector3()
      .copy(right).multiplyScalar(1.3 + Math.random() * 0.9)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4));
    var rs = new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14);
    var bounced = false;
    var fy = (typeof floorY === 'number') ? floorY : -999;
    add(m, 1.15, function (e, t, dt) {
      v.y -= 11 * dt;
      e.mesh.position.addScaledVector(v, dt);
      if (!bounced && e.mesh.position.y <= fy + 0.02 && v.y < 0) {
        bounced = true;
        e.mesh.position.y = fy + 0.02;
        v.y *= -0.32; v.x *= 0.55; v.z *= 0.55;
        rs.multiplyScalar(0.4);
        AudioSys.bounce(e.mesh.position);
      } else if (bounced && e.mesh.position.y <= fy + 0.012) {
        e.mesh.position.y = fy + 0.012; v.set(0, 0, 0); rs.set(0, 0, 0);
      }
      e.mesh.rotation.x += rs.x * dt; e.mesh.rotation.y += rs.y * dt; e.mesh.rotation.z += rs.z * dt;
    });
  }

  // Floating damage number at the hit point — orange for headshots, red on kill.
  var dmgTexCache = {}, dmgTexOrder = [];
  function dmgTexture(dmg, headshot, kill) {
    var key = dmg + (headshot ? "h" : "") + (kill ? "k" : "");
    if (dmgTexCache[key]) return dmgTexCache[key];
    var c = document.createElement("canvas"); c.width = 128; c.height = 64;
    var g = c.getContext("2d");
    g.font = "700 " + (headshot || kill ? 46 : 38) + "px Rajdhani, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineWidth = 6;
    g.strokeText(String(dmg), 64, 32);
    g.fillStyle = kill ? "#ff4a3a" : headshot ? "#ffb340" : "#f2f5f8";
    g.fillText(String(dmg), 64, 32);
    var tx = new THREE.CanvasTexture(c);
    dmgTexCache[key] = tx; dmgTexOrder.push(key);
    if (dmgTexOrder.length > 48) { var ev = dmgTexOrder.shift(); dmgTexCache[ev].dispose(); delete dmgTexCache[ev]; }
    return tx;
  }
  function damageNumber(pos, dmg, headshot, kill) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dmgTexture(dmg, headshot, kill), depthTest: false, transparent: true }));
    s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3));
    s.scale.set(0.9, 0.45, 1);
    add(s, 0.75, function (e, t, dt) {
      e.mesh.position.y += dt * (1.4 - t);
      e.mesh.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    });
  }

  // Pickup burst — expanding ring + rising sparks in the item's color.
  function pickupBurst(pos, colorHex) {
    var ringM = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ringM.position.copy(pos);
    add(ringM, 0.45, function (e, t) {
      e.mesh.scale.set(1 + t * 3.2, 1, 1 + t * 3.2);
      e.mesh.material.opacity = 0.85 * (1 - t);
    });
    for (var i = 0; i < 6; i++) {
      var sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: colorHex }));
      sp.position.copy(pos);
      var v = new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
      (function (vv) {
        add(sp, 0.5, function (e, t, dt) { vv.y -= 5 * dt; e.mesh.position.addScaledVector(vv, dt); });
      })(v);
    }
  }

  // Molotov ground fire: flickering additive flames + looping smoke risers.
  function groundFire(pos, radius, sec) {
    for (var i = 0; i < 12; i++) {
      (function (idx) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ color: idx % 3 ? 0xff7a26 : 0xffc247, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        var a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * radius * 0.85;
        var bx = pos.x + Math.cos(a) * rr, bz = pos.z + Math.sin(a) * rr, by = pos.y + 0.18;
        s.position.set(bx, by, bz);
        var ph = Math.random() * 6.28, sc = 0.5 + Math.random() * 0.7;
        add(s, sec, function (e, t2) {
          var f = 0.75 + Math.sin(performance.now() * 0.02 + ph) * 0.25;
          e.mesh.scale.set(sc * f, sc * (1 + f * 0.7), 1);
          e.mesh.position.y = by + f * 0.18;
          e.mesh.material.opacity = (t2 > 0.8 ? (1 - t2) * 5 : 1) * 0.85;
        });
      })(i);
    }
    for (var j = 0; j < 4; j++) {
      (function () {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x14100c, transparent: true, opacity: 0.4, depthWrite: false }));
        var a = Math.random() * 6.283, rr = Math.random() * radius * 0.6;
        var bx = pos.x + Math.cos(a) * rr, bz = pos.z + Math.sin(a) * rr;
        s.position.set(bx, pos.y + 0.6, bz);
        add(s, sec, function (e, t2, dt2) {
          e.mesh.position.y += dt2 * 0.9;
          if (e.mesh.position.y > pos.y + 3.4) e.mesh.position.y = pos.y + 0.6;
          e.mesh.scale.setScalar(0.8 + (e.mesh.position.y - pos.y) * 0.5);
          e.mesh.material.opacity = 0.4 * (t2 > 0.85 ? (1 - t2) * 6.6 : 1);
        });
      })();
    }
  }

  // Quick soft white fade (respawn feedback) — visual only, no flash audio.
  function softFlash(v) { flashLevel = Math.max(flashLevel, Math.min(0.4, v)); }

  function explosion(pos, radius) {
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.95 }));
    core.position.copy(pos);
    add(core, 0.35, function (e, t) {
      e.mesh.scale.setScalar(1 + t * radius * 1.4);
      e.mesh.material.opacity = 0.95 * (1 - t);
    });
    for (var i = 0; i < 10; i++) {
      var s = new THREE.Sprite(smokeMat.clone());
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2));
      s.scale.setScalar(1);
      var vy = 1 + Math.random() * 2;
      (function (vv) {
        add(s, 1.6 + Math.random(), function (e, t, dt) {
          e.mesh.position.y += vv * dt * (1 - t);
          e.mesh.scale.setScalar(1 + t * 4);
          e.mesh.material.opacity = 0.5 * (1 - t);
        });
      })(vy);
    }
    var fl = new THREE.PointLight(0xffa050, 3, radius * 3.2, 2);
    fl.position.copy(pos); scene.add(fl);
    add(fl, 0.3, function (e, t) { e.mesh.intensity = 3 * (1 - t); });
    var d = camera ? camera.position.distanceTo(pos) : 99;
    shake(Math.max(0, 0.6 - d * 0.02));
  }

  // Smoke grenade cloud — vision denial, ~12 s
  function smokeCloud(pos, dur) {
    for (var i = 0; i < 22; i++) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xb9bec4, transparent: true, opacity: 0, depthWrite: false }));
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 3.4, 0.4 + Math.random() * 2.6, (Math.random() - 0.5) * 3.4));
      s.scale.setScalar(0.5);
      var drift = new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.06, (Math.random() - 0.5) * 0.25);
      (function (dr) {
        add(s, dur, function (e, t, dt) {
          e.mesh.position.addScaledVector(dr, dt);
          var grow = Math.min(1, t * 6);
          var fade = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
          e.mesh.scale.setScalar(0.5 + grow * 3.6);
          e.mesh.material.opacity = 0.86 * grow * fade;
        });
      })(drift);
    }
  }

  function shake(amt) { shakeAmt = Math.min(0.7, shakeAmt + amt); }
  function applyShake(cam) {
    if (shakeAmt <= 0.001) { shakeAmt = 0; return; }
    cam.position.x += (Math.random() - 0.5) * shakeAmt * 0.22;
    cam.position.y += (Math.random() - 0.5) * shakeAmt * 0.22;
    shakeAmt *= 0.86;
  }

  function update(dt) {
    for (var i = live.length - 1; i >= 0; i--) {
      var e = live[i];
      e.life += dt;
      var t = e.life / e.ttl;
      if (t >= 1) {
        scene.remove(e.mesh);
        if (e.mesh.geometry) e.mesh.geometry.dispose();
        if (e.mesh.material && e.mesh.material.dispose) e.mesh.material.dispose();
        live.splice(i, 1);
      } else if (e.update) e.update(e, t, dt);
    }
  }

  // ------- HUD feedback (DOM) -------
  var vignetteEl, flashEl, indEl, hitEl;
  function initDOM() {
    vignetteEl = document.getElementById('damage-vignette');
    flashEl = document.getElementById('flash-overlay');
    indEl = document.getElementById('dmg-indicator');
    hitEl = document.getElementById('hitmarker');
  }
  var vignetteT = null;
  function damageFlash(strength) {
    if (!vignetteEl) return;
    vignetteEl.style.opacity = Math.min(1, 0.35 + strength);
    clearTimeout(vignetteT);
    vignetteT = setTimeout(function () { vignetteEl.style.opacity = 0; }, 350);
  }
  function damageDirection(angle) {
    if (!indEl) return;
    indEl.style.transform = 'rotate(' + angle + 'rad)';
    indEl.style.opacity = 1;
    indEl.style.transition = 'none';
    requestAnimationFrame(function () {
      indEl.style.transition = 'opacity 0.9s';
      indEl.style.opacity = 0;
    });
  }
  var hmT = null;
  function hitmarker(kill) {
    if (!hitEl) return;
    hitEl.classList.toggle('kill', !!kill);
    hitEl.classList.add('show');
    clearTimeout(hmT);
    hmT = setTimeout(function () { hitEl.classList.remove('show'); }, kill ? 240 : 110);
    AudioSys.hitmark(kill);
  }
  var flashLevel = 0;
  function flashbang(intensity) {
    flashLevel = Math.max(flashLevel, intensity);
    AudioSys.flashRing(intensity);
  }
  function updateFlash(dt) {
    if (!flashEl) return;
    if (flashLevel > 0.003) {
      flashEl.style.opacity = Math.min(1, flashLevel);
      flashLevel *= Math.pow(0.5, dt * 1.6);
    } else if (flashLevel !== 0) {
      flashLevel = 0; flashEl.style.opacity = 0;
    }
  }

  return {
    init: init, initDOM: initDOM, update: update,
    tracer: tracer, impact: impact, bloodPuff: bloodPuff, muzzle: muzzle, shell: shell,
    damageNumber: damageNumber, pickupBurst: pickupBurst, softFlash: softFlash, groundFire: groundFire,
    explosion: explosion, smokeCloud: smokeCloud,
    shake: shake, applyShake: applyShake,
    damageFlash: damageFlash, damageDirection: damageDirection,
    hitmarker: hitmarker, flashbang: flashbang, updateFlash: updateFlash
  };
})();
