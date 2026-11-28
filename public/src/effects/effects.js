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
    /* v2.0: a 90 ms streak does not need its own material to fade — one shared
       material, scaled geometry, no per-shot allocation of a material */
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len), tracerMat); m.userData.sharedMat = true;
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.lookAt(to);
    add(m, 0.09, null);
  }

  /* v1.0z: one spark geometry for every spark ever — five fresh BoxGeometries
     per bullet impact was hundreds of GPU buffer creations a second in a
     busy fight, and their disposal churned the same. Shared geometry is
     flagged so the cleanup below leaves it alone. */
  var sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  var puffMat = new THREE.SpriteMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.3, depthWrite: false });
  var holeMat = new THREE.SpriteMaterial({ color: 0x14171c, transparent: true, opacity: 0.85, depthWrite: false });
  var _holeTmp = new THREE.Vector3();
  function impact(point) {
    for (var i = 0; i < 5; i++) {
      var m = new THREE.Mesh(sparkGeo, sparkMat); m.userData.sharedGeo = true; m.userData.sharedMat = true;
      m.position.copy(point);
      var v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3.5, (Math.random() - 0.5) * 4);
      (function (vv) {
        add(m, 0.3 + Math.random() * 0.2, function (e, t, dt) {
          vv.y -= 12 * dt;
          e.mesh.position.addScaledVector(vv, dt);
        });
      })(v);
    }
    /* v2.0: shared materials — the puff grows and the hole shrinks away
       instead of fading, so neither needs a material of its own. An impact
       is now five sparks, a puff and a hole with ZERO material allocations. */
    var puff = new THREE.Sprite(puffMat); puff.userData.sharedMat = true;
    puff.position.copy(point); puff.scale.set(0.3, 0.3, 1);
    add(puff, 0.5, function (e, t) { e.mesh.scale.setScalar(0.3 + t * 0.9); });
    var hole = new THREE.Sprite(holeMat); hole.userData.sharedMat = true;
    hole.position.copy(point);
    if (camera) hole.position.addScaledVector(_holeTmp.subVectors(camera.position, point).normalize(), 0.045);
    hole.scale.set(0.08, 0.08, 1);
    add(hole, 4.5, function (e, t) { if (t > 0.6) { var k = 0.08 * (1 - (t - 0.6) / 0.4); e.mesh.scale.set(k, k, 1); } });
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

  /* ===== v2.16 - A MUZZLE FLASH, NOT THREE ORANGE BARS =====
     The flash was three untextured sprites — which draw as plain orange
     RECTANGLES — crossed over a white square, each up to 0.9 m long and a
     metre from the eye. That is the "weird" in "gunshot ka animation ...
     abhi weird rehta h." It is now a painted burst: a white-hot core, a soft
     orange bloom and six uneven tongues, drawn once into a 128 px texture and
     added to the frame (additive blending, so it brightens what is behind it
     instead of covering it). Each shot turns it to a new angle and size and
     it is gone in 55 ms; the smoke that follows is a soft puff, not a square.
     The local flash is sized for something an arm's length away. */
  var flashTex = null, puffTex = null;
  function flashArt() {
    if (flashTex || typeof document === 'undefined') return;
    try {
      var cv = document.createElement('canvas'); cv.width = cv.height = 128;
      var g = cv.getContext('2d'), i;
      g.translate(64, 64);
      for (i = 0; i < 6; i++) {                                  // the tongues
        var a = i * 1.047 + (i % 2 ? 0.22 : -0.1), len = i % 3 === 0 ? 60 : i % 2 ? 44 : 34, w = i % 3 === 0 ? 9 : 6;
        var gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, 'rgba(255,236,190,0.95)'); gr.addColorStop(0.45, 'rgba(255,158,52,0.7)'); gr.addColorStop(1, 'rgba(255,90,10,0)');
        g.save(); g.rotate(a); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -w); g.quadraticCurveTo(len * 0.5, -w * 0.55, len, 0); g.quadraticCurveTo(len * 0.5, w * 0.55, 0, w); g.fill(); g.restore();
      }
      var bloom = g.createRadialGradient(0, 0, 2, 0, 0, 46); bloom.addColorStop(0, 'rgba(255,255,244,1)'); bloom.addColorStop(0.22, 'rgba(255,224,150,0.9)'); bloom.addColorStop(0.55, 'rgba(255,140,40,0.35)'); bloom.addColorStop(1, 'rgba(255,90,10,0)');
      g.fillStyle = bloom; g.beginPath(); g.arc(0, 0, 46, 0, 6.283); g.fill();
      flashTex = new THREE.CanvasTexture(cv);
      var pv = document.createElement('canvas'); pv.width = pv.height = 64;
      var p = pv.getContext('2d'), soft = p.createRadialGradient(32, 32, 2, 32, 32, 30); soft.addColorStop(0, 'rgba(255,255,255,0.9)'); soft.addColorStop(0.5, 'rgba(255,255,255,0.4)'); soft.addColorStop(1, 'rgba(255,255,255,0)');
      p.fillStyle = soft; p.fillRect(0, 0, 64, 64);
      puffTex = new THREE.CanvasTexture(pv);
    } catch (err) { flashTex = puffTex = null; }
  }
  function muzzle(worldPos, isLocal) {
    flashArt();
    var size = (isLocal ? 0.30 : 0.62) * (0.85 + Math.random() * 0.4);
    var burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, rotation: Math.random() * 6.283 }));
    burst.position.copy(worldPos);
    burst.scale.set(size, size, 1);
    add(burst, 0.055, function (e, t) { e.mesh.material.opacity = 1 - t * t; e.mesh.scale.setScalar(size * (1 + t * 0.35)); });
    var wisp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xa7adb3, transparent: true, opacity: 0.28, depthWrite: false }));
    wisp.position.copy(worldPos);
    wisp.scale.set(0.12, 0.12, 1);
    add(wisp, 0.45, function (e, t, dt) {
      e.mesh.position.y += 0.4 * dt;
      e.mesh.scale.setScalar(0.12 + t * 0.42);
      e.mesh.material.opacity = 0.28 * (1 - t);
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

  /* ===== v2.18 - THE BLAST =====
     Rahul: "add animations for bombs blasting which should show a blast with
     yellow tint and fire and it should looks real" — with a picture: a
     white-yellow heart, orange fire rolling over itself with dark creases, a
     stem, a cap, and fire running out along the ground.

     What was here: one translucent orange ball that grew and faded in a third
     of a second, and ten grey squares. (A mine's did not even have the ball:
     it was called with no radius, and a ball scaled by NaN is not drawn.)

     Now a blast is built the way the picture is:
       flash    one frame of white-yellow, and a warm light on everything near
       fire     billows thrown outward that slow, rise and cool — white-yellow,
                yellow, orange, deep red — drawn ADDITIVE, so where they pile
                up the heart burns white
       smoke    dark brown-black billows that come out of the fire as it cools
                and keep rising after it is gone; in front of the fire they
                are the dark creases
       ground   a pale ring racing out, fire rolling along the ground behind
                it, and a scorch left where it stood
       embers   sparks thrown high, falling under gravity
       a stem and a cap — the mushroom — for anything the size of a frag, a
       bomb or a vehicle; a flashbang's pop gets none of that.
     The billows are not round blobs: three lumpy shapes are painted once on a
     canvas (soft discs piled inside a disc, creases cut back out), and every
     sprite takes one at its own angle and turns slowly.

     Cost, since a firefight is where this runs: a frag is 58 sprites, most of
     them gone inside a second and a half, counted down by the quality tier
     (40% on POTATO); a flashbang's pop is 10. The
     light is ONE pooled lamp, switched on and off — the old code added and
     removed a light per blast, which makes three.js rebuild every lit shader
     twice per explosion. */
  var blastTex = null, blastLight = null, blastLightT = 0, blastLightI = 0, ringGeo = null, flatGeo = null, glowEl = null, glowAmt = 0;
  function blastRng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* A billow, painted once. Its ALPHA is the lumpy outline (soft discs piled inside a disc); when `shaded`
     its COLOUR is the relief — lit lumps, dark creases — which the sprite's own colour multiplies, so an
     orange billow has dark red folds in it and a smoke billow has depth. */
  function puffTexture(seed, lumps, creases, shaded) {
    var S = 160, h = S / 2, r = blastRng(seed), i, a, d, x, y, rad, gr;
    var A = document.createElement('canvas'); A.width = A.height = S;
    var ga = A.getContext('2d');
    ga.clearRect(0, 0, S, S);
    ga.globalCompositeOperation = 'lighter';
    for (i = 0; i < lumps; i++) {
      a = r() * 6.2832; d = Math.sqrt(r()) * h * 0.58; x = h + Math.cos(a) * d; y = h + Math.sin(a) * d; rad = h * (0.2 + r() * 0.34);
      gr = ga.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.34)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ga.fillStyle = gr; ga.beginPath(); ga.arc(x, y, rad, 0, 6.2832); ga.fill();
    }
    ga.globalCompositeOperation = 'destination-in';
    gr = ga.createRadialGradient(h, h, h * 0.42, h, h, h * 0.98);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ga.fillStyle = gr; ga.fillRect(0, 0, S, S);
    ga.globalCompositeOperation = 'source-over';
    if (!shaded) return new THREE.CanvasTexture(A);
    var c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    g.fillStyle = 'rgb(118,118,118)'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < lumps * 1.5; i++) {
      a = r() * 6.2832; d = Math.sqrt(r()) * h * 0.82; x = h + Math.cos(a) * d; y = h + Math.sin(a) * d; rad = h * (0.09 + r() * 0.2);
      gr = g.createRadialGradient(x - rad * 0.2, y - rad * 0.25, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    for (i = 0; i < creases; i++) {
      a = r() * 6.2832; d = Math.sqrt(r()) * h * 0.85; x = h + Math.cos(a) * d; y = h + Math.sin(a) * d; rad = h * (0.09 + r() * 0.2);
      gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(0,0,0,0.44)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill();
    }
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(A, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return new THREE.CanvasTexture(c);
  }
  function blastAssets() {
    if (blastTex) return blastTex;
    blastTex = {
      fire: [puffTexture(11, 30, 15, true), puffTexture(29, 28, 18, true), puffTexture(47, 34, 13, true)],
      smoke: [puffTexture(63, 34, 14, true), puffTexture(81, 30, 17, true), puffTexture(97, 38, 12, true)],
      glow: [puffTexture(113, 24, 0, false), puffTexture(131, 20, 0, false)],
      soft: puffTexture(5, 40, 0, false)
    };
    ringGeo = new THREE.RingGeometry(0.88, 1.0, 44); ringGeo.rotateX(-Math.PI / 2);
    flatGeo = new THREE.PlaneGeometry(2, 2); flatGeo.rotateX(-Math.PI / 2);
    return blastTex;
  }
  /* colour and opacity along a life: stops of [t, r, g, b, opacity] */
  /* BODY is the fire you see the shape of: opaque, orange, creased, going dark red and then to smoke.
     GLOW is drawn additive over its heart: yellow that stacks up to white where the billows pile. */
  var RAMP_BODY  = [[0, 1, 0.92, 0.50, 0], [0.05, 1, 0.86, 0.36, 0.97], [0.28, 1, 0.62, 0.14, 0.97], [0.56, 0.92, 0.33, 0.06, 0.92], [0.80, 0.40, 0.16, 0.07, 0.7], [1, 0.12, 0.10, 0.10, 0]];
  var RAMP_GLOW  = [[0, 1, 0.90, 0.50, 0], [0.05, 1, 0.84, 0.36, 0.62], [0.35, 1, 0.60, 0.12, 0.50], [0.7, 0.9, 0.30, 0.04, 0.22], [1, 0.4, 0.08, 0.02, 0]];
  var RAMP_SMOKE = [[0, 0.46, 0.27, 0.10, 0], [0.10, 0.36, 0.23, 0.12, 0.72], [0.40, 0.17, 0.14, 0.13, 0.64], [1, 0.10, 0.10, 0.11, 0]];
  var RAMP_SURGE = [[0, 1, 0.92, 0.55, 0], [0.08, 1, 0.80, 0.30, 0.9], [0.5, 1, 0.48, 0.10, 0.6], [1, 0.40, 0.10, 0.03, 0]];
  var RAMP_DUST  = [[0, 0.50, 0.42, 0.32, 0], [0.15, 0.44, 0.38, 0.30, 0.42], [1, 0.30, 0.28, 0.26, 0]];
  function applyRamp(R, t, m) {
    var i = 1; while (i < R.length - 1 && R[i][0] < t) i++;
    var A = R[i - 1], B = R[i], k = (t - A[0]) / ((B[0] - A[0]) || 1); if (k < 0) k = 0; else if (k > 1) k = 1;
    m.color.setRGB(A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k, A[3] + (B[3] - A[3]) * k);
    m.opacity = A[4] + (B[4] - A[4]) * k;
  }
  /* one billow: thrown with v, slowed by drag, lifted, grown from s0 to s1, coloured along a ramp;
     `out`/`flare` is a sideways push that starts late — the cap rolling over */
  function billow(o) {
    var m = new THREE.SpriteMaterial({ map: o.tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, rotation: Math.random() * 6.2832 });
    var s = new THREE.Sprite(m); s.position.copy(o.p); s.scale.setScalar(o.s0);
    var v = o.v, age = 0, delay = o.delay || 0, spin = (Math.random() - 0.5) * (o.spin === undefined ? 0.8 : o.spin), floorY = o.floor;
    s.visible = delay <= 0;
    add(s, o.ttl + delay, function (e, tt, dt) {
      age += dt; var a = age - delay; if (a < 0) return;
      if (!s.visible) s.visible = true;
      var t = a / o.ttl; if (t > 1) t = 1;
      var k = Math.exp(-o.drag * dt); v.x *= k; v.z *= k; v.y = v.y * k + o.lift * dt;
      if (o.out && t > 0.3) { v.x += o.out.x * o.flare * dt; v.z += o.out.z * o.flare * dt; }
      s.position.addScaledVector(v, dt);
      if (floorY !== undefined && s.position.y < floorY) { s.position.y = floorY; if (v.y < 0) v.y = 0; }
      s.scale.setScalar(o.s0 + (o.s1 - o.s0) * (1 - (1 - t) * (1 - t)));
      applyRamp(o.ramp, t, m);
      m.rotation += spin * dt;
    });
  }
  function blastQuality() {
    var t = (typeof Quality !== 'undefined' && Quality.getTier) ? Quality.getTier() : 'high';
    return t === 'potato' ? 0.4 : t === 'low' ? 0.6 : t === 'medium' ? 0.8 : 1;
  }
  var _bDown = null, _bFrom = null;
  function groundBelow(pos) {
    if (typeof World !== 'undefined' && World.rayHit) {
      if (!_bDown) { _bDown = new THREE.Vector3(0, -1, 0); _bFrom = new THREE.Vector3(); }
      _bFrom.set(pos.x, pos.y + 0.4, pos.z);
      var hit = World.rayHit(_bFrom, _bDown, 3.2);
      if (hit && hit.point) return hit.point.y;
    }
    return pos.y <= 2.6 ? 0 : null;                       // open ground, or an airburst: no ring, no scorch
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function explosion(pos, radius) {
    if (!scene || typeof document === 'undefined') return;
    var R = (typeof radius === 'number' && isFinite(radius) && radius > 0) ? radius : 5;      // a mine's blast is called without one
    var T = blastAssets(), q = blastQuality(), big = R >= 4.5, pop = R < 2.5;
    var n = function (c) { return Math.max(1, Math.round(c * q)); };
    var ground = groundBelow(pos), onGround = ground !== null, gy = onGround ? ground : pos.y;
    var c = new THREE.Vector3(pos.x, Math.max(pos.y, gy + (pop ? 0.2 : 0.6)), pos.z), i, a, e, sp, dir;
    var fr = pop ? R * 0.9 : R * 0.5;                                                         // the fireball's own radius
    var d = camera ? camera.position.distanceTo(pos) : 99;

    /* the flash */
    var fm = new THREE.SpriteMaterial({ map: T.soft, color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    var fs = new THREE.Sprite(fm); fs.position.copy(c); fs.scale.setScalar(fr * 1.4);
    add(fs, pop ? 0.16 : 0.22, function (en, t) { en.mesh.scale.setScalar(fr * (1.4 + t * 2.6)); en.mesh.material.opacity = 0.9 * (1 - t) * (1 - t); });

    /* the fire: thrown outward, slowing, rising, cooling — a body you can see the shape of, and a glow in its heart */
    for (i = 0; i < n(pop ? 4 : big ? 11 : 8); i++) {
      a = Math.random() * 6.2832; e = Math.random() * (onGround ? 0.95 : 2.6) - (onGround ? 0.05 : 1.3);
      dir = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      sp = fr * rnd(2.2, 4.4);
      billow({ tex: T.fire[i % 3], p: c.clone().addScaledVector(dir, fr * 0.12), v: dir.multiplyScalar(sp), drag: 4.2, lift: pop ? 0.6 : rnd(0.5, 1.6),
        s0: fr * 0.7, s1: fr * rnd(1.5, 2.1), ttl: pop ? rnd(0.28, 0.42) : rnd(0.85, 1.35) * (big ? 1.15 : 0.9), ramp: RAMP_BODY, floor: onGround ? gy + 0.15 : undefined });
    }
    for (i = 0; i < n(pop ? 2 : big ? 5 : 4); i++) {
      a = Math.random() * 6.2832; e = Math.random() * 1.2;
      dir = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      billow({ tex: T.glow[i % 2], additive: true, p: c.clone().addScaledVector(dir, fr * 0.08), v: dir.multiplyScalar(fr * rnd(1.0, 2.2)), drag: 4.2, lift: pop ? 0.6 : rnd(1.6, 2.8),
        s0: fr * 0.6, s1: fr * rnd(1.2, 1.6), ttl: pop ? rnd(0.2, 0.3) : rnd(0.6, 0.95), ramp: RAMP_GLOW, floor: onGround ? gy + 0.15 : undefined });
    }
    /* the smoke that comes out of it */
    for (i = 0; i < n(pop ? 3 : big ? 9 : 6); i++) {
      a = Math.random() * 6.2832; e = Math.random() * 1.3;
      dir = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      billow({ tex: T.smoke[i % 3], p: c.clone().addScaledVector(dir, fr * rnd(0.1, 0.5)), v: dir.multiplyScalar(fr * rnd(1.0, 2.6)), drag: 2.6, lift: rnd(1.6, 3.4) * (pop ? 0.5 : 1),
        s0: fr * 0.8, s1: fr * rnd(1.9, 2.7), ttl: pop ? rnd(0.7, 1.1) : rnd(2.3, 3.6), delay: pop ? 0.05 : rnd(0.25, 0.7), ramp: RAMP_SMOKE, floor: onGround ? gy + 0.2 : undefined });
    }
    /* the mushroom: a stem of fire and smoke, and a cap that rolls outward at the top */
    if (big) {
      var H = R * rnd(1.0, 1.2);                                                              // how high the cap stands
      for (i = 0; i < n(5); i++) {
        billow({ tex: T.fire[i % 3], p: c.clone().add(new THREE.Vector3(rnd(-0.3, 0.3) * fr, 0, rnd(-0.3, 0.3) * fr)), v: new THREE.Vector3(0, H * rnd(1.3, 2.9), 0), drag: 3.0, lift: 1.5,
          s0: fr * 0.7, s1: fr * rnd(1.0, 1.35), ttl: rnd(1.0, 1.5), delay: i * 0.04, ramp: RAMP_BODY });
        billow({ tex: T.smoke[i % 3], p: c.clone().add(new THREE.Vector3(rnd(-0.3, 0.3) * fr, 0, rnd(-0.3, 0.3) * fr)), v: new THREE.Vector3(0, H * rnd(1.0, 2.6), 0), drag: 3.0, lift: 1.8,
          s0: fr * 0.7, s1: fr * rnd(1.2, 1.6), ttl: rnd(2.6, 3.8), delay: 0.3 + i * 0.07, ramp: RAMP_SMOKE });
      }
      var nc = n(8);
      for (i = 0; i < nc; i++) {
        a = (i / nc) * 6.2832 + rnd(-0.3, 0.3);
        var out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), kind = i % 5;               // three of five are fire, one its glow, one smoke
        billow({ tex: kind === 4 ? T.smoke[i % 3] : kind === 3 ? T.glow[i % 2] : T.fire[i % 3], additive: kind === 3, p: c.clone().addScaledVector(out, fr * 0.2), v: new THREE.Vector3(out.x * fr * 0.5, H * 3.05, out.z * fr * 0.5), drag: 3.0, lift: 1.2,
          out: out, flare: fr * rnd(1.8, 2.8), s0: fr * 0.75, s1: fr * rnd(1.6, 2.2), ttl: kind === 4 ? rnd(2.8, 4.0) : kind === 3 ? rnd(0.9, 1.2) : rnd(1.5, 2.1), delay: kind === 4 ? 0.3 : 0.05,
          ramp: kind === 4 ? RAMP_SMOKE : kind === 3 ? RAMP_GLOW : RAMP_BODY });
      }
    }
    /* along the ground: the ring, the fire behind it, dust, and the scorch */
    if (onGround && !pop) {
      var rm = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      var ring = new THREE.Mesh(ringGeo, rm); ring.userData.sharedGeo = true; ring.position.set(pos.x, gy + 0.08, pos.z); ring.scale.setScalar(0.4);
      add(ring, 0.36, function (en, t) { var g2 = 1 - (1 - t) * (1 - t); en.mesh.scale.set(0.4 + g2 * R * 1.5, 1, 0.4 + g2 * R * 1.5); en.mesh.material.opacity = 0.5 * (1 - t) * (1 - t); });
      for (i = 0; i < n(big ? 7 : 5); i++) {
        a = (i / Math.max(1, n(big ? 7 : 5))) * 6.2832 + rnd(-0.35, 0.35);
        dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        billow({ tex: T.glow[i % 2], additive: true, p: new THREE.Vector3(pos.x, gy + fr * 0.22, pos.z), v: dir.clone().multiplyScalar(R * rnd(2.6, 3.8)), drag: 3.6, lift: 0.5,
          s0: fr * 0.4, s1: fr * rnd(0.8, 1.1), ttl: rnd(0.6, 1.0), ramp: RAMP_SURGE, floor: gy + fr * 0.2 });
        billow({ tex: T.smoke[(i + 1) % 3], p: new THREE.Vector3(pos.x, gy + fr * 0.2, pos.z), v: dir.multiplyScalar(R * rnd(2.9, 4.2)), drag: 3.2, lift: 0.7,
          s0: fr * 0.4, s1: fr * rnd(1.0, 1.4), ttl: rnd(1.5, 2.4), delay: 0.08, ramp: RAMP_DUST, floor: gy + fr * 0.25 });
      }
      var sm = new THREE.MeshBasicMaterial({ map: T.smoke[0], color: 0x070605, transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      var scorch = new THREE.Mesh(flatGeo, sm); scorch.userData.sharedGeo = true; scorch.position.set(pos.x, gy + 0.03, pos.z); scorch.rotation.y = Math.random() * 6.2832; scorch.scale.set(fr * 1.25, 1, fr * 1.25);
      add(scorch, 16, function (en, t) { en.mesh.material.opacity = 0.78 * Math.min(1, t * 40) * (t > 0.7 ? (1 - t) / 0.3 : 1); });
    }
    /* embers: one cloud of points, thrown and falling */
    if (!pop) {
      var ne = Math.max(6, Math.round((big ? 34 : 18) * q)), P = new Float32Array(ne * 3), V = [];
      for (i = 0; i < ne; i++) {
        a = Math.random() * 6.2832; e = rnd(0.25, 1.45); sp = rnd(5, 15) * Math.sqrt(Math.min(1.4, R / 7));
        P[i * 3] = c.x; P[i * 3 + 1] = c.y; P[i * 3 + 2] = c.z;
        V.push(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp);
      }
      var eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(P, 3));
      var pm = new THREE.PointsMaterial({ map: T.soft, color: 0xffb648, size: 0.34, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
      var pts = new THREE.Points(eg, pm); pts.frustumCulled = false;
      add(pts, 1.5, function (en, t, dt) {
        for (var k = 0; k < ne; k++) {
          V[k * 3 + 1] -= 9.8 * dt;
          P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
          if (onGround && P[k * 3 + 1] < gy + 0.05) { P[k * 3 + 1] = gy + 0.05; V[k * 3] *= 0.5; V[k * 3 + 1] *= -0.25; V[k * 3 + 2] *= 0.5; }
        }
        eg.attributes.position.needsUpdate = true;
        pm.opacity = t < 0.5 ? 1 : (1 - t) * 2; pm.color.setRGB(1, 0.71 - t * 0.4, 0.28 - t * 0.22);
      });
    }
    /* the warm light on everything near, and on the lens */
    if (!blastLight) blastLight = new THREE.PointLight(0xffc452, 0, 30, 2);
    if (blastLight.parent !== scene) scene.add(blastLight);
    blastLight.position.set(c.x, c.y + (pop ? 0.3 : fr * 0.6), c.z); blastLight.distance = Math.max(8, R * 3.4);
    blastLightI = pop ? 2.2 : 3.4 + Math.min(2.2, R * 0.22); blastLightT = pop ? 0.2 : 0.55; blastLight.userData.t0 = blastLightT;
    blastLight.intensity = blastLightI;
    if (!pop) glowAmt = Math.max(glowAmt, Math.max(0, 1 - d / (R * 3.5 + 6)) * 0.55);
    shake(Math.max(0, 0.6 - d * 0.02));
  }
  /* the pooled light fades; the lens glow fades (called from update) */
  function updateBlast(dt) {
    if (blastLight && blastLightT > 0) {
      blastLightT -= dt;
      var k = Math.max(0, blastLightT / (blastLight.userData.t0 || 0.55));
      blastLight.intensity = blastLightI * k * k;
      blastLight.color.setRGB(1, 0.5 + 0.27 * k, 0.12 + 0.2 * k);                              // yellow going to orange as it dies
    }
    if (glowAmt > 0.004 || (glowEl && glowEl.style.opacity !== '0')) {
      if (!glowEl && typeof document !== 'undefined' && document.body && document.body.appendChild) {
        glowEl = document.createElement('div'); glowEl.id = 'blast-glow';
        glowEl.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:6;pointer-events:none;opacity:0;mix-blend-mode:screen;' +
          'background:radial-gradient(ellipse at center,rgba(255,214,120,.16) 0%,rgba(255,170,60,.42) 62%,rgba(255,120,30,.72) 100%)';
        document.body.appendChild(glowEl);
      }
      glowAmt = glowAmt > 0.004 ? glowAmt * Math.exp(-3.6 * dt) : 0;
      if (glowEl) glowEl.style.opacity = glowAmt > 0.004 ? glowAmt.toFixed(3) : '0';
    }
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
    updatePings();          // v9.11: team pings fade on the same clock
    updateFireZones(dt);    // v1.0b
    updateBlast(dt);        // v2.18: the blast's light and lens glow
    for (var i = live.length - 1; i >= 0; i--) {
      var e = live[i];
      e.life += dt;
      var t = e.life / e.ttl;
      if (t >= 1) {
        scene.remove(e.mesh);
        if (e.mesh.geometry && !e.mesh.userData.sharedGeo) e.mesh.geometry.dispose();
        /* v1.0z: never dispose a SHARED material — disposing sparkMat on every
           spark forced the shader program to be rebuilt on the next impact,
           dozens of times a second in a fight */
        if (e.mesh.material && e.mesh.material.dispose && !e.mesh.userData.sharedMat) e.mesh.material.dispose();
        /* v15.0: a GROUP effect (the helicopter) owns its children's buffers. */
        if (e.mesh.isGroup) e.mesh.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material && o.material.dispose) o.material.dispose();
        });
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
  /* ===== v10.10 NUKE STRIKE EFFECT =====

     Ten seconds of repeated explosions inside the target circle, plus a screen
     overlay and continuous shake. Driven by a single interval that is stored
     and cleared, NOT by scheduling 20 timeouts up front — a match can end, a
     player can disconnect, or a second nuke can land mid-strike, and 20 loose
     timeouts would keep firing into a torn-down scene. One handle, one clear.

     Purely cosmetic. The kills come from the server tick in
     server/lib/nuke.js, so a client that never renders this still dies in the
     circle, and a client that renders it does not get to decide who died. */
  function empBlast(d) {
    if (!d) return;
    var o = new THREE.Vector3(d.x || 0, (d.y || 1) - 0.6, d.z || 0);
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 40),
      new THREE.MeshBasicMaterial({ color: 0x51d0e8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(o);
    add(ring, 1.1, function (e, t) {
      e.mesh.scale.setScalar(1 + t * 40);
      e.mesh.material.opacity = 0.85 * (1 - t);
    });
    var fl = new THREE.PointLight(0x51d0e8, 2.5, 18, 2);
    fl.position.copy(o).add(new THREE.Vector3(0, 1.2, 0)); scene.add(fl);
    add(fl, 0.5, function (e, t) { e.mesh.intensity = 2.5 * (1 - t); });
    (d.mines || []).forEach(function (m) {
      var p = new THREE.Vector3(m.x, m.y + 0.1, m.z);
      for (var i = 0; i < 6; i++) {
        var sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05),
          new THREE.MeshBasicMaterial({ color: i % 2 ? 0x51d0e8 : 0xffffff }));
        sp.position.copy(p);
        var vx = (Math.random() - 0.5) * 3, vy = 1.5 + Math.random() * 2.5, vz = (Math.random() - 0.5) * 3;
        (function (a, b, c) {
          add(sp, 0.6, function (e, t, dt) {
            e.mesh.position.x += a * dt; e.mesh.position.z += c * dt;
            e.mesh.position.y += (b - t * 8) * dt;
          });
        })(vx, vy, vz);
      }
    });
    var dd = camera ? camera.position.distanceTo(o) : 99;
    shake(Math.max(0, 0.25 - dd * 0.01));
  }

  /* ===== v1.0b - FIRE ZONE =====
     Twenty metres of ground on fire for ten seconds: a ring of flame boards
     around the edge, a glowing disc, a light, and rising embers. One handle
     per zone so fireZoneEnd can put it out early or on time. */
  var fireZones = {};
  /* ===== v2.3 - THE RECON FLARE: a streak up, then a bright burst that hangs ===== */
  var flareMat = new THREE.SpriteMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  function reconFlare(from, top, fuseSec) {
    var s = new THREE.Sprite(flareMat); s.userData.sharedMat = true; s.scale.set(0.5, 0.5, 1); s.position.copy(from);
    var y0 = from.y, dur = Math.max(0.5, fuseSec || 3);
    add(s, dur, function (e, t) { e.mesh.position.y = y0 + top * Math.min(1, t * 1.15); if (Math.random() < 0.5) { var p = new THREE.Sprite(puffMat); p.userData.sharedMat = true; p.scale.set(0.6, 0.6, 1); p.position.copy(e.mesh.position); add(p, 0.6, function (e2, t2) { e2.mesh.scale.setScalar(0.6 + t2 * 1.2); }); } });
  }
  function reconBurst(at) {
    var s = new THREE.Sprite(flareMat); s.userData.sharedMat = true; s.position.copy(at); s.scale.set(2, 2, 1);
    add(s, 6, function (e, t) { var k = t < 0.1 ? 2 + t * 60 : 8 - t * 5; e.mesh.scale.set(k, k, 1); });
    for (var i = 0; i < 10; i++) { var p = new THREE.Sprite(puffMat); p.userData.sharedMat = true; p.position.copy(at); var a = i / 10 * Math.PI * 2; p.scale.set(1, 1, 1); (function (pp, ang) { add(pp, 2.5, function (e, t) { e.mesh.position.set(at.x + Math.cos(ang) * t * 9, at.y - t * 4, at.z + Math.sin(ang) * t * 9); e.mesh.scale.setScalar(1 + t * 2); }); })(p, a); }
  }
  function fireZone(d) {
    if (!d || fireZones[d.id]) return;
    var c = new THREE.Vector3(d.p[0], d.p[1], d.p[2]), r = d.r || 20, dur = d.dur || 10;
    var g = new THREE.Group();
    var disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48),
      new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
    var flames = [];
    var FM = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    var FM2 = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    var n = Math.max(24, Math.round(r * 2.2));
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2, rr = r * (0.55 + Math.random() * 0.45);
      var h = 1.2 + Math.random() * 1.8;
      var f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, h), i % 3 ? FM : FM2);
      f.position.set(Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
      f.rotation.y = a + Math.PI / 2;
      f.userData = { a: a, rr: rr, h: h, ph: Math.random() * 6 };
      g.add(f); flames.push(f);
    }
    var light = new THREE.PointLight(0xff7a20, 2.2, r * 1.6, 2);
    light.position.set(0, 3, 0); g.add(light);
    g.position.copy(c);
    scene.add(g);
    fireZones[d.id] = { grp: g, flames: flames, disc: disc, light: light, born: performance.now(), dur: dur };
    var dd = camera ? camera.position.distanceTo(c) : 99;
    shake(Math.max(0, 0.3 - dd * 0.01));
  }
  function fireZoneEnd(id) {
    var z = fireZones[id];
    if (!z) return;
    scene.remove(z.grp);
    z.grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    delete fireZones[id];
  }
  function fireZonesReset() { for (var id in fireZones) fireZoneEnd(id); }
  function updateFireZones(dt) {
    var t = performance.now() * 0.001;
    for (var id in fireZones) {
      var z = fireZones[id];
      var age = (performance.now() - z.born) / 1000;
      var fade = age > z.dur - 1.5 ? Math.max(0, (z.dur - age) / 1.5) : 1;
      for (var i = 0; i < z.flames.length; i++) {
        var f = z.flames[i], u = f.userData;
        var sc = 0.75 + 0.35 * Math.sin(t * 9 + u.ph);
        f.scale.set(1, sc * fade + 0.01, 1);
        f.position.y = (u.h * sc * fade) / 2;
      }
      z.disc.material.opacity = 0.32 * fade;
      z.light.intensity = 2.2 * fade * (0.85 + 0.15 * Math.sin(t * 13));
      if (camera && camera.position.distanceTo(z.grp.position) < 22 && Math.random() < 0.3) {
        // rising embers
        var e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
        var a = Math.random() * Math.PI * 2, rr = Math.random() * 20;
        e.position.set(z.grp.position.x + Math.cos(a) * rr, z.grp.position.y + 0.3, z.grp.position.z + Math.sin(a) * rr);
        add(e, 1.2, function (ev, tt, dt2) { ev.mesh.position.y += 2.4 * dt2; ev.mesh.material.opacity = 1 - tt; });
      }
    }
  }

  /* v1.0j: the zone's red edge — a persistent vignette while outside. */
  var zoneEdgeEl = null;
  var zoneEdgeLast = -1;
  function zoneEdge(strength) {
    if (!zoneEdgeEl) zoneEdgeEl = document.getElementById('zone-edge');
    if (!zoneEdgeEl) return;
    var v = Math.round(Math.max(0, Math.min(1, strength)) * 20) / 20;   /* v1.0u: write the style only when it changes */
    if (v === zoneEdgeLast) return;
    zoneEdgeLast = v;
    zoneEdgeEl.style.opacity = String(v);
  }
  function damageFlash(strength) {
    if (!vignetteEl) return;
    vignetteEl.style.opacity = Math.min(1, 0.35 + strength);
    clearTimeout(vignetteT);
    vignetteT = setTimeout(function () { vignetteEl.style.opacity = 0; }, 350);
  }
  /* ===== v11.0 - EVERY HIT GETS ITS OWN BEARING =====
     One element, rotated and re-faded per hit, meant a second attacker ERASED
     the first: under crossfire the arrow thrashed between bearings and told
     you nothing — the exact "players need to clearly understand where shots
     are coming from" complaint. Each hit now spawns its own arc, several live
     at once, CSS animates the fade, and the node removes itself. Capped and
     pooled-by-removal so crossfire cannot grow the DOM. Signature unchanged:
     every caller keeps passing the same relative angle it always did. */
  function damageDirection(angle) {
    if (!indEl) return;
    while (indEl.children.length >= 6) indEl.removeChild(indEl.firstChild);
    var arc = document.createElement('i');
    arc.className = 'dmg-arc';
    arc.style.transform = 'rotate(' + angle + 'rad)';
    indEl.appendChild(arc);
    setTimeout(function () { if (arc.parentNode) arc.parentNode.removeChild(arc); }, 950);
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

  /* ===== v9.11 TEAM PING =====
     A world-anchored marker with a label, visible THROUGH geometry
     (depthTest false) because the whole value of "enemy that way" is that the
     wall is between you and it. It fades on its own — a ping is a call-out, not
     a permanent objective, and a screen accumulating them is a screen nobody
     reads.
     Kept in FX rather than in the HUD because it lives in the world: it has a
     position, it gets closer as you approach, and it disappears behind you. */
  var PING_STYLE = {
    enemy:   { c: 0xff4a3c, t: 'ENEMY' },
    here:    { c: 0xffd166, t: 'HERE' },
    going:   { c: 0x6fd3ff, t: 'ON MY WAY' },
    need:    { c: 0x9be36f, t: 'NEED AMMO' },
    careful: { c: 0xffa64a, t: 'CAREFUL' },
    loot:    { c: 0xc79bff, t: 'LOOT' }
  };
  var pings = [];
  function teamPing(d) {
    if (!d || !scene) return;
    var st = PING_STYLE[d.k] || PING_STYLE.here;
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: st.c, depthTest: false, transparent: true });
    var pin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), mat);
    pin.rotation.x = Math.PI; pin.position.y = 1.1;
    g.add(pin);
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 20), mat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    g.add(ring);
    g.position.set(d.x, d.y, d.z);
    g.renderOrder = 999;
    scene.add(g);
    pings.push({ g: g, mat: mat, born: performance.now(), label: st.t, name: d.name || '' });
    if (typeof AudioSys !== 'undefined' && AudioSys.pickup) AudioSys.pickup();
    if (typeof UI !== 'undefined' && UI.toast) UI.toast((d.name || 'Squad') + ': ' + st.t);
  }
  function updatePings() {
    var t = performance.now();
    for (var i = pings.length - 1; i >= 0; i--) {
      var p = pings[i], age = (t - p.born) / 7000;
      if (age >= 1) { scene.remove(p.g); pings.splice(i, 1); continue; }
      p.mat.opacity = Math.max(0, 1 - age);
      p.g.rotation.y += 0.02;
      p.g.position.y += Math.sin(t / 300) * 0.0015;
    }
  }

  return {
    teamPing: teamPing, updatePings: updatePings,
    init: init, initDOM: initDOM, update: update,
    tracer: tracer, impact: impact, bloodPuff: bloodPuff, muzzle: muzzle, shell: shell,
    damageNumber: damageNumber, pickupBurst: pickupBurst, softFlash: softFlash, groundFire: groundFire,
    explosion: explosion, smokeCloud: smokeCloud, reconFlare: reconFlare, reconBurst: reconBurst,   /* v2.3 */
    shake: shake, applyShake: applyShake,
    damageFlash: damageFlash, damageDirection: damageDirection,
    hitmarker: hitmarker, flashbang: flashbang, updateFlash: updateFlash,
    empBlast: empBlast,   /* v15.0 */
    fireZone: fireZone, fireZoneEnd: fireZoneEnd, fireZonesReset: fireZonesReset,   /* v1.0b */
    zoneEdge: zoneEdge   /* v1.0j */
  };
})();
