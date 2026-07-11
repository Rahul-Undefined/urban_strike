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

  function tracer(from, to) {
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
  }

  function bloodPuff(point) {
    for (var i = 0; i < 6; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), bloodMat);
      m.position.copy(point);
      var v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      (function (vv) {
        add(m, 0.35, function (e, t, dt) { vv.y -= 10 * dt; e.mesh.position.addScaledVector(vv, dt); });
      })(v);
    }
  }

  // Muzzle flash: sprite + brief point light (local gun) / sprite only (remote)
  function muzzle(worldPos, isLocal) {
    var fl = new THREE.Sprite(fireMat.clone());
    fl.position.copy(worldPos);
    fl.scale.set(0.5 + Math.random() * 0.3, 0.5 + Math.random() * 0.3, 1);
    add(fl, 0.05, function (e, t) { e.mesh.material.opacity = 0.95 * (1 - t); });
    if (isLocal && muzzleLight) {
      muzzleLight.position.copy(worldPos);
      muzzleLight.intensity = 2.2;
      setTimeout(function () { muzzleLight.intensity = 0; }, 45);
    }
  }

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
    tracer: tracer, impact: impact, bloodPuff: bloodPuff, muzzle: muzzle,
    explosion: explosion, smokeCloud: smokeCloud,
    shake: shake, applyShake: applyShake,
    damageFlash: damageFlash, damageDirection: damageDirection,
    hitmarker: hitmarker, flashbang: flashbang, updateFlash: updateFlash
  };
})();
