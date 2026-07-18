/* V4.1 street-detail layer. Everything here is presentation only: no entry
   registers a collider, so gameplay is byte-identical with or without this
   file. Deleting deco.js (and its script tag) is a clean rollback. */
World._buildDeco = function (T) {
  'use strict';
  var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, scene = T.scene;
  var NC = { collide: false, cast: false, recv: false };

  function tex(size, draw) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return new THREE.CanvasTexture(c);
  }
  var paint = new THREE.MeshLambertMaterial({ color: 0xcfd2c4 });
  var paintY = new THREE.MeshLambertMaterial({ color: 0xb99a3a });

  function dash(x0, x1, y, z0, z1) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.012, z1 - z0), paint);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    scene.add(m);
  }
  // center dashes: N-S avenue (x=0) and E-W avenue (z=0), skipping the crossroads
  for (var z = -94; z < 94; z += 6) {
    if ((z > -9 && z < 7) || Math.abs(z + 70) < 3 || Math.abs(z - 70) < 3) continue;
    dash(-0.16, 0.16, 0.03, z, z + 2.6);
  }
  for (var x = -94; x < 94; x += 6) {
    if ((x > -9 && x < 7) || Math.abs(x + 70) < 3 || Math.abs(x - 70) < 3) continue;
    dash(x, x + 2.6, 0.03, -0.16, 0.16);
  }
  // crosswalks on all four crossing arms
  function crosswalk(cx, cz, alongX) {
    for (var i = -2; i <= 2; i++) {
      if (alongX) dash(cx - 0.5, cx + 0.5, 0.031, cz + i * 1.15 - 0.38, cz + i * 1.15 + 0.38);
      else dash(cx + i * 1.15 - 0.38, cx + i * 1.15 + 0.38, 0.031, cz - 0.5, cz + 0.5);
    }
  }
  crosswalk(0, 8.1, false); crosswalk(0, -8.1, false);
  crosswalk(8.1, 0, true); crosswalk(-8.1, 0, true);
  // alley edge lines (yellow)
  (function () {
    var m1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 40), paintY);
    m1.position.set(20.3, 0.03, -29); scene.add(m1);
    var m2 = new THREE.Mesh(new THREE.BoxGeometry(40, 0.012, 0.14), paintY);
    m2.position.set(-29, 0.03, 16.3); scene.add(m2);
  })();

  // ---------- streetlight glow: halo sprite + warm ground pool per lamp ----------
  var glowTex = tex(64, function (g, s) {
    var r = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,190,110,0.9)');
    r.addColorStop(0.4, 'rgba(255,170,80,0.35)');
    r.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  (World._lampSpots || []).forEach(function (p) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: CFG.RENDER.lampGlow, transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    s.position.set(p[0], p[1], p[2]); s.scale.set(2.6, 2.6, 1); scene.add(s);
    var pool = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.01, 18),
      new THREE.MeshBasicMaterial({
        color: CFG.RENDER.lampGlow, transparent: true,
        opacity: CFG.RENDER.lampPool, blending: THREE.AdditiveBlending, depthWrite: false
      }));
    pool.position.set(p[0], 0.045, p[2]); scene.add(pool);
  });

  // ---------- power line run (east sidewalk, south half) ----------
  var wireMat = new THREE.LineBasicMaterial({ color: 0x14161a });
  var polesZ = [-62, -44, -26, -8], tips = [];
  polesZ.forEach(function (pz) {
    cyl(9.6, 3.5, pz, 0.11, 7, M.trim, NC);
    box(9.6, 6.6, pz, 0.12, 0.12, 2.2, M.trim, NC);
    tips.push([new THREE.Vector3(9.6, 6.55, pz - 1.0), new THREE.Vector3(9.6, 6.55, pz + 1.0)]);
  });
  for (var i = 0; i < tips.length - 1; i++) {
    for (var w = 0; w < 2; w++) {
      var a = tips[i][w], b = tips[i + 1][w];
      var mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= 0.55; // catenary sag
      var geo = new THREE.BufferGeometry().setFromPoints([a, mid, b]);
      scene.add(new THREE.Line(geo, wireMat));
    }
  }

  // ---------- billboards (flush on existing walls) ----------
  function billboard(w, h, px, py, pz, ry, drawAd) {
    var fr = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h + 0.3),
      new THREE.MeshLambertMaterial({ color: 0x1c1f24 }));
    fr.position.set(px, py, pz); fr.rotation.y = ry;
    fr.translateZ(-0.02); scene.add(fr);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({ map: tex(256, drawAd) }));
    m.position.set(px, py, pz); m.rotation.y = ry; scene.add(m);
  }
  billboard(7, 3, -32, 5.1, -37.12, Math.PI, function (g, s) {
    g.fillStyle = '#20303e'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#f0a232'; g.font = '700 52px Arial'; g.textAlign = 'center';
    g.fillText('SECTOR 7', s / 2, s / 2 - 14);
    g.fillStyle = '#cfd6dd'; g.font = '400 26px Arial';
    g.fillText('TYRES & AUTO PARTS', s / 2, s / 2 + 34);
  });
  billboard(6, 3, 51.93, 5.4, 2, -Math.PI / 2, function (g, s) {
    g.fillStyle = '#3a2430'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#e8d040'; g.font = '700 58px Arial'; g.textAlign = 'center';
    g.fillText('VOLT', s / 2, s / 2 - 12);
    g.fillStyle = '#f2f5f8'; g.font = '400 30px Arial';
    g.fillText('ENERGY DRINK', s / 2, s / 2 + 40);
  });

  // ---------- street furniture (all pass-through) ----------
  function bin(x, z) {
    cyl(x, 0.38, z, 0.32, 0.76, M.rust, NC);
    cyl(x, 0.79, z, 0.34, 0.06, M.trim, NC);
  }
  bin(8.2, -30); bin(-8.2, 34); bin(30, 8.2); bin(-30, -8.2);
  function bags(x, z) {
    box(x, 0.24, z, 0.5, 0.48, 0.5, M.tire, NC);
    box(x + 0.45, 0.19, z + 0.2, 0.42, 0.38, 0.42, M.tire, NC);
  }
  bags(-8.9, 11); bags(8.9, -22); bags(-26, 19.4);
  function pallet(x, z, ry) {
    var g = new THREE.Group();
    for (var i2 = 0; i2 < 3; i2++) {
      var sl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.24),
        new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
      sl.position.set(0, 0.12, -0.38 + i2 * 0.38); g.add(sl);
    }
    var base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x59401f }));
    base.position.y = 0.05; g.add(base);
    g.position.set(x, 0, z); g.rotation.y = ry || 0; scene.add(g);
  }
  pallet(-34, -17.6, 0.2); pallet(-32.4, -17.8, -0.15);

  // ---------- corner trees (dead space, pass-through) ----------
  function tree(x, z, sscale) {
    var sc = sscale || 1;
    cyl(x, 1.1 * sc, z, 0.16 * sc, 2.2 * sc, M.trim, NC);
    var fol = new THREE.MeshLambertMaterial({ color: 0x2f4a2b });
    var c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1.5 * sc, 2.4 * sc, 8), fol);
    c1.position.set(x, 3.1 * sc, z); scene.add(c1);
    var c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1.1 * sc, 1.9 * sc, 8), fol);
    c2.position.set(x, 4.3 * sc, z); scene.add(c2);
  }
  tree(64, 64); tree(-64, 64, 1.2); tree(64, -64, 0.9); tree(-64, -64, 1.1);
  tree(-11.5, 52, 0.8); tree(11.5, -52, 0.8);
};
