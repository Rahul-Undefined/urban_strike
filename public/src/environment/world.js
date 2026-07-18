/* World — builds Sector 7 (the map) and owns all static collision.
   Every solid is an axis-aligned box collider: [minX,minY,minZ,maxX,maxY,maxZ].
   Geometry placement uses a SEEDED rng so all clients build the identical map. */
var World = (function () {
  var colliders = [];
  var flickers = [];
  var scene = null, sun = null;
  var built = false;

  // Deterministic rng (mulberry32) — cover positions must match on every client.
  var seedState = 1337;
  function rnd() {
    seedState |= 0; seedState = seedState + 0x6D2B79F5 | 0;
    var t = Math.imul(seedState ^ seedState >>> 15, 1 | seedState);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  // ---------- procedural textures ----------
  function canvasTex(size, draw, repeat) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d');
    draw(g, size);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat, repeat);
    return t;
  }
  function noise(g, s, base, spread, n) {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (var i = 0; i < n; i++) {
      var v = (Math.random() - 0.5) * spread;
      g.fillStyle = 'rgba(' + (v > 0 ? '255,255,255' : '0,0,0') + ',' + Math.abs(v) + ')';
      var w = 1 + Math.random() * 5;
      g.fillRect(Math.random() * s, Math.random() * s, w, w);
    }
  }

  var M = {};
  function makeMaterials() {
    var L = function (opt) { return new THREE.MeshLambertMaterial(opt); };
    M.asphalt = L({ map: canvasTex(256, function (g, s) {
      noise(g, s, '#23262b', 0.5, 1600);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
      for (var i = 0; i < 5; i++) { g.beginPath(); g.moveTo(Math.random() * s, Math.random() * s); g.lineTo(Math.random() * s, Math.random() * s); g.stroke(); }
    }) });
    M.dirt = L({ map: canvasTex(256, function (g, s) { noise(g, s, '#3a352c', 0.45, 1400); }) });
    M.concrete = L({ map: canvasTex(256, function (g, s) { noise(g, s, '#5b5f63', 0.35, 1200); }) });
    M.sidewalk = L({ map: canvasTex(256, function (g, s) {
      noise(g, s, '#6a6e72', 0.3, 900);
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
      g.strokeRect(1, 1, s - 2, s - 2);
    }) });
    M.brick = L({ map: canvasTex(256, function (g, s) {
      g.fillStyle = '#6e4436'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#5d382c';
      var bh = 16, bw = 40;
      for (var y = 0; y < s; y += bh) {
        var off = (y / bh) % 2 ? bw / 2 : 0;
        for (var x = -bw; x < s; x += bw) {
          g.fillStyle = Math.random() < 0.5 ? '#77493a' : '#653e30';
          g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
        }
      }
    }) });
    M.plaster = L({ map: canvasTex(256, function (g, s) {
      noise(g, s, '#8d867a', 0.28, 900);
      g.fillStyle = 'rgba(60,50,40,0.25)';
      for (var i = 0; i < 8; i++) g.fillRect(Math.random() * s, s - Math.random() * 40, 2 + Math.random() * 3, 20 + Math.random() * 20);
    }) });
    M.metal = L({ map: canvasTex(256, function (g, s) {
      noise(g, s, '#4c5661', 0.3, 800);
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
      for (var x = 0; x <= s; x += 42) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    }) });
    M.rust = L({ map: canvasTex(256, function (g, s) { noise(g, s, '#7a4a28', 0.5, 1500); }) });
    M.roof = L({ map: canvasTex(256, function (g, s) { noise(g, s, '#2c2e31', 0.4, 1600); }) });
    M.wood = L({ map: canvasTex(128, function (g, s) {
      g.fillStyle = '#7a5c38'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(40,25,10,0.5)';
      for (var y = 0; y < s; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    }) });
    function ribbed(color, dark) {
      return L({ map: canvasTex(128, function (g, s) {
        for (var x = 0; x < s; x += 16) { g.fillStyle = (x / 16) % 2 ? color : dark; g.fillRect(x, 0, 16, s); }
      }) });
    }
    M.contBlue = ribbed('#2d5f8a', '#254e72');
    M.contRed = ribbed('#8a3b2d', '#723225');
    M.contGreen = ribbed('#3f6d3a', '#345a30');
    M.contGray = ribbed('#5a626b', '#4b525a');
    M.dark = L({ color: 0x15171b });
    M.trim = L({ color: 0x2b313b });
    M.white = new THREE.MeshBasicMaterial({ color: 0xd8d4c8 });
    M.amberGlow = new THREE.MeshBasicMaterial({ color: 0xffc069 });
    M.redGlow = new THREE.MeshBasicMaterial({ color: 0xff4438 });
    M.blueGlow = new THREE.MeshBasicMaterial({ color: 0x3f8dff });
    M.tire = L({ color: 0x111214 });
    M.carGlass = L({ color: 0x1a222c });
  }

  // ---------- geometry helpers ----------
  var minimapShapes = [];
  function addCollider(x0, y0, z0, x1, y1, z1) {
    colliders.push([x0, y0, z0, x1, y1, z1, arguments.length > 6 ? arguments[6] | 0 : 0]); // [6] = footstep surface
    // Auto-capture eye-height footprints for the minimap static layer.
    if (y0 < 1.7 && y1 > 1.1 && (x1 - x0) < 45 && (z1 - z0) < 45) minimapShapes.push([x0, z0, x1, z1]);
  }

  function uvScale(geo, w, h, d) {
    // BoxGeometry face order: +x,-x,+y,-y,+z,-z. Scale UVs so textures tile ~ every 2m.
    var uv = geo.attributes.uv, k = 0.5;
    var dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (var f = 0; f < 6; f++) {
      for (var i = 0; i < 4; i++) {
        var idx = f * 4 + i;
        uv.setXY(idx, uv.getX(idx) * dims[f][0] * k, uv.getY(idx) * dims[f][1] * k);
      }
    }
    uv.needsUpdate = true;
  }

  function box(cx, cy, cz, w, h, d, mat, opts) {
    opts = opts || {};
    var geo = new THREE.BoxGeometry(w, h, d);
    if (mat.map) uvScale(geo, w, h, d);
    var m = new THREE.Mesh(geo, mat);
    m.position.set(cx, cy, cz);
    if (opts.rotY) m.rotation.y = opts.rotY;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.recv !== false;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    if (opts.collide !== false) {
      var W = w, D = d;
      if (opts.rotY) {
        var c = Math.abs(Math.cos(opts.rotY)), s = Math.abs(Math.sin(opts.rotY));
        W = w * c + d * s; D = w * s + d * c;
      }
      addCollider(cx - W / 2, cy - h / 2, cz - D / 2, cx + W / 2, cy + h / 2, cz + D / 2, surfOf(mat));
    }
    return m;
  }
  // footstep surface from material identity: 0 concrete, 1 metal, 2 wood
  function surfOf(mat) {
    if (mat === M.wood) return 2;
    if (mat === M.metal || mat === M.rust) return 1;
    return 0;
  }
  // Wall/floor segment by min/max coordinates — the workhorse for buildings.
  function seg(x0, x1, y0, y1, z0, z1, mat, opts) {
    return box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, mat, opts);
  }
  function cyl(cx, cy, cz, r, h, mat, opts) {
    opts = opts || {};
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), mat);
    m.position.set(cx, cy, cz);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    if (opts.collide !== false) addCollider(cx - r, cy - h / 2, cz - r, cx + r, cy + h / 2, cz + r, surfOf(mat));
    return m;
  }
  // Solid staircase with a hanging skirt (reads as concrete stairs).
  function stairFlight(sx, sy, sz, dirX, dirZ, steps, stepH, stepD, width, mat) {
    for (var i = 0; i < steps; i++) {
      var cx = sx + dirX * (i + 0.5) * stepD;
      var cz = sz + dirZ * (i + 0.5) * stepD;
      var top = sy + (i + 1) * stepH;
      var bottom = Math.max(sy - 0.02, top - stepH - 0.9);
      var w = dirX !== 0 ? stepD : width;
      var d = dirX !== 0 ? width : stepD;
      seg(cx - w / 2, cx + w / 2, bottom, top, cz - d / 2, cz + d / 2, mat);
    }
  }

  // ---------- physics queries ----------
  function overlap(cx, cy, cz, hx, hy, hz, c) {
    return cx - hx < c[3] && cx + hx > c[0] && cy - hy < c[4] && cy + hy > c[1] && cz - hz < c[5] && cz + hz > c[2];
  }
  function fits(cx, cy, cz, hx, hy, hz) {
    for (var i = 0; i < colliders.length; i++) if (overlap(cx, cy, cz, hx, hy, hz, colliders[i])) return false;
    return true;
  }
  function raySlab(ox, oy, oz, dx, dy, dz, c) {
    var tmin = 0, tmax = Infinity, o = [ox, oy, oz], d = [dx, dy, dz];
    for (var i = 0; i < 3; i++) {
      var lo = c[i], hi = c[i + 3];
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo || o[i] > hi) return -1; }
      else {
        var t1 = (lo - o[i]) / d[i], t2 = (hi - o[i]) / d[i];
        if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmax < tmin) return -1;
      }
    }
    return tmin;
  }
  function rayHit(origin, dir, maxDist) {
    var best = maxDist, found = false;
    for (var i = 0; i < colliders.length; i++) {
      var t = raySlab(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, colliders[i]);
      if (t >= 0 && t < best) { best = t; found = true; }
    }
    if (!found) return null;
    return { t: best, point: new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best) };
  }
  // Line-of-sight helper for explosions / flashbangs
  function losBlocked(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return false;
    dx /= len; dy /= len; dz /= len;
    for (var i = 0; i < colliders.length; i++) {
      var t = raySlab(a.x, a.y, a.z, dx, dy, dz, colliders[i]);
      if (t >= 0 && t < len - 0.05) return true;
    }
    return false;
  }

  // ---------- lighting, sky, ground, roads ----------
  function lighting() {
    scene.background = new THREE.Color(CFG.RENDER.sky);
    scene.fog = new THREE.FogExp2(CFG.RENDER.fogColor, CFG.RENDER.fogDensity);

    var hemi = new THREE.HemisphereLight(CFG.RENDER.hemiSky, CFG.RENDER.hemiGround, CFG.RENDER.hemiIntensity);
    scene.add(hemi);

    var amb = new THREE.AmbientLight(CFG.RENDER.ambColor, CFG.RENDER.ambIntensity);
    scene.add(amb);

    sun = new THREE.DirectionalLight(CFG.RENDER.sunColor, CFG.RENDER.sunIntensity);
    sun.position.set(CFG.RENDER.sunPos[0], CFG.RENDER.sunPos[1], CFG.RENDER.sunPos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
    sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    // Interior lights
    var wh = new THREE.PointLight(0xffb35c, 1.1, 36, 1.5); wh.position.set(-32, 6.8, -28); scene.add(wh);
    flickers.push(wh);
    var ap = new THREE.PointLight(0x8fb4ff, 0.7, 16, 1.7); ap.position.set(27, 4.6, -35); scene.add(ap);
    var st1 = new THREE.PointLight(0xffb35c, 0.9, 18, 1.6); st1.position.set(8.5, 5, -18); scene.add(st1);
    flickers.push(st1);
    var st2 = new THREE.PointLight(0xffb35c, 0.8, 18, 1.6); st2.position.set(-8.5, 5, 14); scene.add(st2);
  }

  function groundAndRoads() {
    // Ground: four slabs leaving a hole for the sunken tunnel trench (x[45.4,48.6] z[-28,-9])
    seg(-110, 45.4, -1, 0, -110, 110, M.dirt, { cast: false });
    seg(48.6, 110, -1, 0, -110, 110, M.dirt, { cast: false });
    seg(45.4, 48.6, -1, 0, -110, -28, M.dirt, { cast: false });
    seg(45.4, 48.6, -1, 0, -9, 110, M.dirt, { cast: false });
    // Roads (visual planes on top of the ground)
    seg(-7, 7, 0.005, 0.02, -68, 68, M.asphalt, { collide: false, cast: false });
    seg(-68, 68, 0.005, 0.02, -7, 7, M.asphalt, { collide: false, cast: false });
    // (center dashes + crosswalks live in environment/deco.js)
    // Alley A (NE, along apartment west wall) + Alley B (SW, north of office)
    seg(20, 24, 0.005, 0.018, -50, -8, M.asphalt, { collide: false, cast: false });
    seg(-50, -8, 0.005, 0.018, 16, 20, M.asphalt, { collide: false, cast: false });
    // Sidewalk curbs (step-up cover edges)
    var curbs = [
      [7.2, 9.2, -46, -9], [7.2, 9.2, 9, 46], [-9.2, -7.2, -46, -9], [-9.2, -7.2, 9, 46]
    ];
    curbs.forEach(function (c) { seg(c[0], c[1], 0, 0.13, c[2], c[3], M.sidewalk, { cast: false }); });
    var curbsE = [
      [-46, -9, 7.2, 9.2], [9, 46, 7.2, 9.2], [-46, -9, -9.2, -7.2], [9, 45, -9.2, -7.2]
    ];
    curbsE.forEach(function (c) { seg(c[0], c[1], 0, 0.13, c[2], c[3], M.sidewalk, { cast: false }); });
  }

  function crater(cx, cz) {
    var disc = new THREE.Mesh(new THREE.CircleGeometry(3.1, 20), M.dark);
    disc.rotation.x = -Math.PI / 2; disc.position.set(cx, 0.035, cz);
    disc.receiveShadow = true; disc.matrixAutoUpdate = false; disc.updateMatrix();
    scene.add(disc);
    for (var i = 0; i < 7; i++) {
      var a = rnd() * Math.PI * 2, r = 1 + rnd() * 1.6;
      box(cx + Math.cos(a) * r, 0.18 + rnd() * 0.22, cz + Math.sin(a) * r,
        0.5 + rnd() * 0.6, 0.35 + rnd() * 0.5, 0.5 + rnd() * 0.6, M.concrete);
    }
  }

  return {
    BOUND: 100, // playable half-extent (V4.2)
    _colliders: function () { return colliders; }, // test-only introspection
    _initPart1: function (sceneRef) {
      scene = sceneRef;
      makeMaterials(); lighting(); groundAndRoads();
    },
    _internals: function () {
      return { box: box, seg: seg, cyl: cyl, stairFlight: stairFlight, crater: crater, M: M, rnd: rnd, addCollider: addCollider, sceneRef: function () { return scene; } };
    },
    colliders: colliders,
    minimapShapes: minimapShapes,
    flickers: flickers,
    fits: fits,
    rayHit: rayHit,
    losBlocked: losBlocked,
    getSun: function () { return sun; },
    isBuilt: function () { return built; },
    _markBuilt: function () { built = true; },
    build: null // assigned in part 2
  };
})();

/* ---------- PART 2: buildings, vehicles, props ---------- */
World.build = function (sceneRef) {
  if (World.isBuilt()) return;
  World._initPart1(sceneRef);
  var H = World._internals();
  var seg = H.seg, box = H.box, cyl = H.cyl, stairFlight = H.stairFlight, crater = H.crater, M = H.M, rnd = H.rnd, addCollider = H.addCollider;

  // Wall with openings: fixed-plane facade, greedy row-merged into few boxes.
  // plane 'z': wall at z in [c0,c1], runs along x (u=x). plane 'x': fixed x, runs along z.
  function facade(plane, c0, c1, u0, u1, v0, v1, mat, openings) {
    openings = openings || [];
    var us = [u0, u1], vs = [v0, v1];
    openings.forEach(function (o) { us.push(o.u0, o.u1); vs.push(o.v0, o.v1); });
    function prep(arr, lo, hi) {
      arr = arr.map(function (v) { return Math.min(hi, Math.max(lo, v)); });
      arr.sort(function (a, b) { return a - b; });
      var out = [];
      arr.forEach(function (v) { if (!out.length || v - out[out.length - 1] > 1e-4) out.push(v); });
      return out;
    }
    us = prep(us, u0, u1); vs = prep(vs, v0, v1);
    function open(uc, vc) {
      for (var i = 0; i < openings.length; i++) {
        var o = openings[i];
        if (uc > o.u0 && uc < o.u1 && vc > o.v0 && vc < o.v1) return true;
      }
      return false;
    }
    for (var vi = 0; vi < vs.length - 1; vi++) {
      var va = vs[vi], vb = vs[vi + 1], vc = (va + vb) / 2;
      var runStart = null;
      for (var ui = 0; ui <= us.length - 1; ui++) {
        var solid = ui < us.length - 1 && !open((us[ui] + us[ui + 1]) / 2, vc);
        if (solid && runStart === null) runStart = us[ui];
        if (!solid && runStart !== null) {
          var ue = us[ui];
          if (plane === 'z') seg(runStart, ue, va, vb, c0, c1, mat);
          else seg(c0, c1, va, vb, runStart, ue, mat);
          runStart = null;
        }
      }
    }
  }
  function win(u, v0, w, h) { return { u0: u, u1: u + w, v0: v0, v1: v0 + h }; }

  /* ===== WAREHOUSE  x[-46,-18] z[-37,-19] h9 ===== */
  (function () {
    var X0 = -46, X1 = -18, Z0 = -37, Z1 = -19, T = 0.35, TOP = 8.8;
    facade('x', X1 - T, X1, Z0, Z1, 0, TOP, M.metal, [ // east (front) wall
      { u0: -31, u1: -25, v0: 0, v1: 4.4 }, win(-34, 6, 1.6, 1.4), win(-23.6, 6, 1.6, 1.4)
    ]);
    facade('x', X0, X0 + T, Z0, Z1, 0, TOP, M.metal, [{ u0: -28.7, u1: -27.5, v0: 0, v1: 2.3 }]);
    facade('z', Z0, Z0 + T, X0, X1, 0, TOP, M.metal, [win(-42, 5.5, 2, 1.7), win(-33, 5.5, 2, 1.7), win(-24, 5.5, 2, 1.7)]);
    facade('z', Z1 - T, Z1, X0, X1, 0, TOP, M.metal, [win(-42, 5.5, 2, 1.7), win(-33, 5.5, 2, 1.7), win(-24, 5.5, 2, 1.7)]);
    seg(X0, X1, TOP, TOP + 0.35, Z0, Z1, M.roof);
    // catwalk along west wall + rail + access stair
    seg(-45.6, -42.65, 3.8, 4.05, -36.4, -19.6, M.metal);
    seg(-42.73, -42.65, 4.05, 5.1, -36.4, -19.6, M.trim);
    stairFlight(-38.55, 0, -35.95, -1, 0, 13, 0.293, 0.335, 1.2, M.concrete);
    // shelving rows: low base (shoot-over cover) + top board on posts
    [-34, -30, -26].forEach(function (z) {
      seg(-41, -33, 0, 1.15, z - 0.5, z + 0.5, M.wood);
      seg(-41, -33, 2.0, 2.15, z - 0.5, z + 0.5, M.wood);
      seg(-41, -40.85, 1.15, 2.0, z - 0.5, z + 0.5, M.trim);
      seg(-33.15, -33, 1.15, 2.0, z - 0.5, z + 0.5, M.trim);
    });
    // dark office room in NE interior corner (climbable roof)
    facade('x', -22.6, -22.35, -22.9, Z1 + T, 0, 3, M.plaster, [{ u0: -21.8, u1: -20.6, v0: 0, v1: 2.2 }]);
    facade('z', -22.9, -22.65, -22.6, X1 - T, 0, 3, M.plaster, []);
    seg(-22.6, X1 - T, 3, 3.2, -22.9, Z1 + T, M.concrete);
    seg(-21.9, -19.2, 0.72, 0.78, -22.4, -21.6, M.wood); // desk top
    seg(-21.9, -19.2, 0, 0.72, -22.35, -21.65, M.trim);
  })();

  /* ===== APARTMENT  x[24,40] z[-37,-23]  3 floors + roof ===== */
  (function () {
    var X0 = 24, X1 = 40, Z0 = -37, Z1 = -23, T = 0.3;
    var floorTops = [0, 3.65, 7.05, 10.5];
    var f, base;
    for (f = 0; f < 3; f++) {
      base = f * 3.4; var top = (f < 2) ? (f + 1) * 3.4 : 10.2;
      var north = [win(26, base + 1.1, 1.4, 1.2), win(31, base + 1.1, 1.4, 1.2), win(36, base + 1.1, 1.4, 1.2)];
      if (f === 0) north.push({ u0: 28.6, u1: 29.9, v0: 0, v1: 2.3 });
      facade('z', Z1 - T, Z1, X0, X1, base, top, M.brick, north);
      var west = [win(-34.5, base + 1.1, 1.4, 1.2), win(-27, base + 1.1, 1.4, 1.2)];
      if (f === 0) west.push({ u0: -31, u1: -29.7, v0: 0, v1: 2.3 });
      facade('x', X0, X0 + T, Z0, Z1, base, top, M.brick, west);
      facade('z', Z0, Z0 + T, X0, X1, base, top, M.brick, [win(26, base + 1.1, 1.4, 1.2), win(33, base + 1.1, 1.4, 1.2)]);
      var east = (f === 0) ? [] : [win(-34, base + 1.1, 1.4, 1.2), win(-26.5, base + 1.1, 1.4, 1.2)];
      facade('x', X1 - T, X1, Z0, Z1, base, top, M.brick, east);
      // interior walls (broken doorways: full-height gaps)
      facade('z', -29.15, -28.85, X0 + T, 33, base, top, M.plaster, [{ u0: 30.9, u1: 32.1, v0: base, v1: top }]);
      facade('x', 32.85, 33.15, Z0 + T, -29.15, base, top, M.plaster, [{ u0: -33, u1: -31.8, v0: base, v1: top }]);
    }
    // slabs with stair-shaft hole (shaft: x[24.3,29.6] z[-36.7,-33.5])
    for (f = 1; f <= 2; f++) {
      var y0 = f * 3.4, y1 = f * 3.4 + 0.25;
      seg(24.3, 39.7, y0, y1, -33.5, -23.3, M.concrete);
      seg(29.6, 39.7, y0, y1, -36.7, -33.5, M.concrete);
    }
    seg(24, 40, 10.2, 10.5, -33.5, -23, M.roof);
    seg(29.6, 40, 10.2, 10.5, -37, -33.5, M.roof);
    seg(24, 24.3, 10.2, 10.5, -37, -33.5, M.roof);
    // roof parapet — the sniper nest
    seg(X0, X1, 10.5, 11.55, -23.25, -23, M.brick);
    seg(X0, X1, 10.5, 11.55, -37, -36.75, M.brick);
    seg(24, 24.25, 10.5, 11.55, Z0, Z1, M.brick);
    seg(39.75, 40, 10.5, 11.55, Z0, Z1, M.brick);
    // stair-head bulkhead
    seg(24.3, 29.85, 10.2, 11.9, -33.5, -33.25, M.brick);
    seg(29.6, 29.85, 10.2, 11.9, -36.7, -33.5, M.brick);
    seg(24.25, 24.5, 10.2, 11.9, -36.7, -33.5, M.brick);
    // switchback stairs, ground -> roof
    for (f = 0; f < 3; f++) {
      var bY = floorTops[f], rise = floorTops[f + 1] - bY, sh = rise / 12;
      stairFlight(24.55, bY, -36.1, 1, 0, 6, sh, 0.36, 1.2, M.concrete);
      seg(26.75, 29.55, bY - 0.9, bY + 6 * sh, -36.7, -33.55, M.concrete); // landing
      stairFlight(26.75, bY + 6 * sh, -34.15, -1, 0, 6, sh, 0.36, 1.2, M.concrete);
    }
    box(36.5, 0.45, -33.5, 0.9, 0.9, 0.9, M.wood); // crate in the dark room
  })();

  /* ===== OFFICE  x[-37,-23] z[21,31]  2 floors ===== */
  (function () {
    var X0 = -37, X1 = -23, Z0 = 21, Z1 = 31, T = 0.3;
    var f;
    for (f = 0; f < 2; f++) {
      var base = f * 3.2, top = (f + 1) * 3.2;
      var north = [win(-35.4, base + 1.05, 1.4, 1.2), win(-29.3, base + 1.05, 1.4, 1.2), win(-26, base + 1.05, 1.4, 1.2)];
      if (f === 0) north.push({ u0: -33, u1: -31.7, v0: 0, v1: 2.3 });
      facade('z', Z0, Z0 + T, X0, X1, base, top, M.plaster, north);
      var south = (f === 0) ? [{ u0: -27, u1: -25.7, v0: 0, v1: 2.3 }] : [win(-33, base + 1.05, 1.4, 1.2)];
      facade('z', Z1 - T, Z1, X0, X1, base, top, M.plaster, south);
      facade('x', X1 - T, X1, Z0, Z1, base, top, M.plaster, [win(23, base + 1.05, 1.4, 1.2), win(27.6, base + 1.05, 1.4, 1.2)]);
      facade('x', X0, X0 + T, Z0, Z1, base, top, M.plaster, []);
    }
    // slab with stair hole (flight lane x[-36.55,-35.35] rising toward -z)
    seg(-35.2, X1 - T, 3.2, 3.45, Z0 + T, Z1 - T, M.concrete);
    seg(X0 + T, -35.2, 3.2, 3.45, Z0 + T, 25.3, M.concrete);
    seg(X0 + T, -35.2, 3.2, 3.45, 28.3, Z1 - T, M.concrete);
    seg(X0, X1, 6.4, 6.7, Z0, Z1, M.roof);
    seg(X0, X1, 6.7, 7.55, Z0, Z0 + 0.25, M.plaster);
    seg(X0, X1, 6.7, 7.55, Z1 - 0.25, Z1, M.plaster);
    stairFlight(-35.95, 0, 29.4, 0, -1, 11, 0.291, 0.34, 1.2, M.concrete);
    // furniture: desks + reception counter (crouch cover)
    [[-30, 27.5], [-26.5, 23.5], [-33.5, 23.5]].forEach(function (p) {
      seg(p[0] - 0.75, p[0] + 0.75, 0.72, 0.78, p[1] - 0.4, p[1] + 0.4, M.wood);
      seg(p[0] - 0.7, p[0] + 0.7, 0, 0.72, p[1] - 0.35, p[1] + 0.35, M.trim);
    });
    seg(-26.5, -23.6, 0, 1.05, 25.6, 26.4, M.wood);
    seg(-34.5, -33.5, 3.45, 4.9, 29.4, 30.4, M.trim); // filing cabinet upstairs
    seg(-27, -25.4, 3.45, 4.2, 22, 23.2, M.wood);     // upstairs table
  })();

  /* ===== GARAGE  x[-16.5,-7.5] z[34,42] ===== */
  (function () {
    var X0 = -16.5, X1 = -7.5, Z0 = 34, Z1 = 42, T = 0.3, TOP = 4;
    facade('z', Z0, Z0 + T, X0, X1, 0, TOP, M.metal, [{ u0: -15.3, u1: -8.7, v0: 0, v1: 3.1 }]);
    facade('z', Z1 - T, Z1, X0, X1, 0, TOP, M.metal, []);
    facade('x', X0, X0 + T, Z0, Z1, 0, TOP, M.metal, []);
    facade('x', X1 - T, X1, Z0, Z1, 0, TOP, M.metal, [{ u0: 39.4, u1: 40.6, v0: 0, v1: 2.2 }]);
    seg(X0, X1, TOP, TOP + 0.3, Z0, Z1, M.roof);
    seg(-15.8, -11, 0, 0.95, 41, 41.7, M.wood); // workbench
  })();

  /* ===== WATCHTOWER (SE) ===== */
  (function () {
    [[38.5, 40.2], [41.5, 40.2], [38.5, 42.9], [41.5, 42.9]].forEach(function (p) {
      seg(p[0] - 0.15, p[0] + 0.15, 0, 5.6, p[1] - 0.15, p[1] + 0.15, M.rust);
    });
    seg(38.1, 41.9, 5.6, 5.9, 39.5, 43.3, M.metal);
    seg(38.1, 41.9, 5.9, 6.95, 43.22, 43.3, M.trim);
    seg(38.1, 38.18, 5.9, 6.95, 39.5, 43.3, M.trim);
    seg(41.82, 41.9, 5.9, 6.95, 39.5, 43.3, M.trim);
    seg(38.1, 39.3, 5.9, 6.95, 39.5, 39.58, M.trim);
    seg(40.7, 41.9, 5.9, 6.95, 39.5, 39.58, M.trim);
    stairFlight(40, 0, 33.1, 0, 1, 20, 0.286, 0.315, 1.3, M.metal);
  })();

  /* ===== SHIPPING CONTAINERS (SE yard) ===== */
  function container(cx, cz, rot90, mat, open) {
    var L = 6.1, W = 2.44, HT = 2.6;
    var w = rot90 ? W : L, d = rot90 ? L : W;
    if (!open) { box(cx, HT / 2, cz, w, HT, d, mat); return; }
    // open container: floor, roof, two long walls, one end cap — enterable
    seg(cx - w / 2, cx + w / 2, 0, 0.12, cz - d / 2, cz + d / 2, mat);
    seg(cx - w / 2, cx + w / 2, HT - 0.12, HT, cz - d / 2, cz + d / 2, mat);
    if (rot90) {
      seg(cx - w / 2, cx - w / 2 + 0.1, 0, HT, cz - d / 2, cz + d / 2, mat);
      seg(cx + w / 2 - 0.1, cx + w / 2, 0, HT, cz - d / 2, cz + d / 2, mat);
      seg(cx - w / 2, cx + w / 2, 0, HT, cz + d / 2 - 0.1, cz + d / 2, mat);
    } else {
      seg(cx - w / 2, cx + w / 2, 0, HT, cz - d / 2, cz - d / 2 + 0.1, mat);
      seg(cx - w / 2, cx + w / 2, 0, HT, cz + d / 2 - 0.1, cz + d / 2, mat);
      seg(cx + w / 2 - 0.1, cx + w / 2, 0, HT, cz - d / 2, cz + d / 2, mat);
    }
  }
  container(27, 21, false, M.contBlue, false);
  box(27, 3.9, 21, 6.1, 2.6, 2.44, M.rust); // stacked on top
  container(27, 25.2, false, M.contGreen, true); // open — hide inside
  container(34.5, 23.5, true, M.contRed, false);
  container(40, 28.5, false, M.contBlue, false);
  container(30, 31, false, M.contGray, false);

  /* ===== VEHICLES ===== */
  function vpart(cx, cz, r, dx, dz, cy, w, h, d, mat, opts) {
    var px = r ? -dz : dx, pz = r ? dx : dz;
    var W = r ? d : w, D = r ? w : d;
    return box(cx + px, cy, cz + pz, W, h, D, mat, opts);
  }
  function wheels(cx, cz, r, halfL, halfW, rad) {
    [[-halfL, -halfW], [halfL, -halfW], [-halfL, halfW], [halfL, halfW]].forEach(function (o) {
      var px = r ? -o[1] : o[0], pz = r ? o[0] : o[1];
      var m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.28, 10), M.tire);
      m.rotation.x = Math.PI / 2; m.rotation.z = r ? 0 : Math.PI / 2;
      if (r) m.rotation.x = 0, m.rotation.z = Math.PI / 2, m.rotation.y = Math.PI / 2;
      m.position.set(cx + px, rad, cz + pz);
      m.castShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      H.sceneRef().add(m);
    });
  }
  function sedan(cx, cz, r, color, wreck) {
    var paint = new THREE.MeshLambertMaterial({ color: color });
    vpart(cx, cz, r, 0, 0, 0.67, 4.2, 0.7, 1.9, paint);
    vpart(cx, cz, r, -0.2, 0, 1.3, 2.2, wreck ? 0.3 : 0.56, 1.7, wreck ? paint : M.carGlass);
    wheels(cx, cz, r, 1.4, 0.85, 0.33);
  }
  function bus(cx, cz, r) {
    var paint = new THREE.MeshLambertMaterial({ color: 0x8a7530 });
    vpart(cx, cz, r, 0, 0, 1.65, 11, 2.6, 2.5, paint);
    vpart(cx, cz, r, 0, 0, 2.15, 11.02, 0.8, 2.52, M.carGlass, { collide: false });
    wheels(cx, cz, r, 3.9, 1.1, 0.45);
  }
  function truck(cx, cz, r) {
    vpart(cx, cz, r, -2.6, 0, 1.35, 2.2, 2.3, 2.4, new THREE.MeshLambertMaterial({ color: 0x5a3b28 }));
    vpart(cx, cz, r, 1.1, 0, 1.75, 4.6, 2.9, 2.5, M.contGray);
    wheels(cx, cz, r, 2.6, 1.05, 0.44);
  }
  function van(cx, cz, r) {
    var paint = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
    vpart(cx, cz, r, 0.35, 0, 1.35, 4.0, 2.1, 2.2, paint);
    vpart(cx, cz, r, -2.15, 0, 0.95, 1.0, 1.3, 2.1, paint);
    wheels(cx, cz, r, 1.7, 0.95, 0.36);
  }
  function jeep(cx, cz, r) {
    var paint = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    vpart(cx, cz, r, 0, 0, 0.8, 3.9, 0.9, 1.85, paint);
    vpart(cx, cz, r, -0.3, 0, 1.62, 1.8, 0.68, 1.75, M.carGlass);
    vpart(cx, cz, r, 2.05, 0, 0.75, 0.25, 0.9, 1.7, M.trim);
    vpart(cx, cz, r, -0.3, -0.35, 2.06, 0.5, 0.2, 0.35, M.redGlow, { collide: false });
    vpart(cx, cz, r, -0.3, 0.35, 2.06, 0.5, 0.2, 0.35, M.blueGlow, { collide: false });
    wheels(cx, cz, r, 1.35, 0.85, 0.38);
  }
  bus(16, 3, false);
  truck(-9.6, -26, true);
  van(22, -20, true);
  jeep(-24, 12, false);
  sedan(3, 26, true, 0x7a2f2f, false);
  sedan(30, 3, false, 0x2f5a7a, false);
  sedan(-34, -3, false, 0x6b6f4a, false);
  sedan(-20, 18, false, 0x50565e, false);
  sedan(-14.5, 38.5, true, 0x8a4a20, false); // inside garage
  // wrecked sedan at the crossroads (visual tilt, fat AABB collider)
  (function () {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.9), new THREE.MeshLambertMaterial({ color: 0x1d1d1f }));
    body.position.y = 0.6; g.add(body);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.34, 1.7), M.dark);
    cab.position.set(-0.2, 1.1, 0); g.add(cab);
    g.position.set(2, 0, -15); g.rotation.y = 0.55;
    g.traverse(function (o) { o.castShadow = true; });
    H.sceneRef().add(g);
    addCollider(2 - 2.1, 0, -15 - 2.1, 2 + 2.1, 1.35, -15 + 2.1);
  })();

  /* ===== COVER PROPS ===== */
  function sandbags(x0, x1, z0, z1) {
    seg(x0, x1, 0, 0.85, z0, z1, M.dirt);
    var alongX = (x1 - x0) > (z1 - z0);
    var n = Math.floor((alongX ? x1 - x0 : z1 - z0) / 0.5);
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n;
      var bx = alongX ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
      var bz = alongX ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
      box(bx, 0.92, bz, alongX ? 0.48 : (x1 - x0), 0.16, alongX ? (z1 - z0) : 0.48, M.dirt, { collide: false });
    }
  }
  sandbags(7.5, 11.5, -9.1, -8.5);
  sandbags(7.5, 8.1, -12.5, -9.1);
  sandbags(-16.6, -13.2, -23.9, -23.3);
  sandbags(36.2, 36.8, 40, 42.6);
  function barrel(x, z, rusty) { cyl(x, 0.48, z, 0.34, 0.96, rusty ? M.rust : M.metal); }
  barrel(-38.8, -24.3, true); barrel(-38.1, -25.2, false); barrel(-38.6, -23.4, true);
  barrel(-13.2, 36.2, false); barrel(-8.9, 40.8, true);
  barrel(22.6, -33, true); barrel(23.2, -32.4, false);
  barrel(36.8, 25.6, true); barrel(10, -10.6, false);
  function crates(x, z) {
    box(x, 0.45, z, 0.9, 0.9, 0.9, M.wood);
    box(x + 0.15, 1.25, z - 0.1, 0.7, 0.7, 0.7, M.wood);
  }
  crates(-24, -34); crates(28, 18.6); crates(-43, -8);
  function brokenWall(x, z, alongX) {
    if (alongX) {
      seg(x - 2.2, x - 0.4, 0, 1.35, z - 0.15, z + 0.15, M.brick);
      seg(x + 0.5, x + 2.1, 0, 0.9, z - 0.15, z + 0.15, M.brick);
    } else {
      seg(x - 0.15, x + 0.15, 0, 1.35, z - 2.2, z - 0.4, M.brick);
      seg(x - 0.15, x + 0.15, 0, 0.9, z + 0.5, z + 2.1, M.brick);
    }
  }
  brokenWall(-14, -42, true); brokenWall(14, 36, false); brokenWall(-42, 36, true); brokenWall(44, -18, false);

  crater(-1.5, -21); crater(-18, 2);

  /* ===== STREETLIGHTS ===== */
  function lamp(x, z, armToward) {
    cyl(x, 2.5, z, 0.09, 5, M.trim);
    var ax = armToward === 'w' ? -0.7 : armToward === 'e' ? 0.7 : 0;
    var az = armToward === 'n' ? -0.7 : armToward === 's' ? 0.7 : 0;
    box(x + ax, 4.9, z + az, ax ? 1.5 : 0.16, 0.12, az ? 1.5 : 0.16, M.trim, { collide: false });
    box(x + ax * 2, 4.8, z + az * 2, 0.45, 0.15, 0.45, M.amberGlow, { collide: false });
    (World._lampSpots = World._lampSpots || []).push([x + ax * 2, 4.8, z + az * 2]);
  }
  lamp(8.5, -18, 'w'); lamp(-8.5, 14, 'e'); lamp(8.5, 30, 'w');
  lamp(-8.5, -34, 'e'); lamp(24, 8.5, 'n'); lamp(-24, -8.5, 's');

  /* ===== PERIMETER + SKYLINE ===== */
  // inner city wall (old perimeter) with road gates at the avenue crossings
  seg(-70.9, -7, 0, 3, -70.9, -70, M.concrete);
  seg(7, 70.9, 0, 3, -70.9, -70, M.concrete);
  seg(-70.9, -7, 0, 3, 70, 70.9, M.concrete);
  seg(7, 70.9, 0, 3, 70, 70.9, M.concrete);
  seg(-70.9, -70, 0, 3, -70, -7, M.concrete);
  seg(-70.9, -70, 0, 3, 7, 70, M.concrete);
  seg(70, 70.9, 0, 3, -70, -7, M.concrete);
  seg(70, 70.9, 0, 3, 7, 70, M.concrete);
  // V4.2 outer perimeter
  seg(-100.9, 100.9, 0, 3.2, -100.9, -100, M.concrete);
  seg(-100.9, 100.9, 0, 3.2, 100, 100.9, M.concrete);
  seg(-100.9, -100, 0, 3.2, -100, 100, M.concrete);
  seg(100, 100.9, 0, 3.2, -100, 100, M.concrete);
  // connector roads through the gates (visual)
  seg(-7, 7, 0.005, 0.02, -96, -68, M.asphalt, { collide: false, cast: false });
  seg(-7, 7, 0.005, 0.02, 68, 96, M.asphalt, { collide: false, cast: false });
  seg(-96, -68, 0.005, 0.02, -7, 7, M.asphalt, { collide: false, cast: false });
  seg(68, 96, 0.005, 0.02, -7, 7, M.asphalt, { collide: false, cast: false });
  for (var i = 0; i < 12; i++) {
    var ang = (i / 12) * Math.PI * 2;
    var rr = 128 + rnd() * 24;
    box(Math.cos(ang) * rr, 7 + rnd() * 10, Math.sin(ang) * rr,
      9 + rnd() * 11, 14 + rnd() * 20, 9 + rnd() * 11, M.dark, { collide: false, cast: false, recv: false });
  }

  World._buildPart3({
    seg: seg, box: box, cyl: cyl, stairFlight: stairFlight, facade: facade, win: win,
    container: container, crates: crates, brokenWall: brokenWall, lamp: lamp, barrel: barrel,
    M: M, rnd: rnd, scene: H.sceneRef()
  });

  if (World._buildPart4) World._buildPart4({
    seg: seg, box: box, cyl: cyl, stairFlight: stairFlight, facade: facade, win: win,
    container: container, crates: crates, brokenWall: brokenWall, lamp: lamp, barrel: barrel,
    M: M, rnd: rnd, scene: H.sceneRef()
  });
  if (World._buildPart5) World._buildPart5({
    seg: seg, box: box, cyl: cyl, stairFlight: stairFlight, facade: facade, win: win,
    container: container, crates: crates, brokenWall: brokenWall, lamp: lamp, barrel: barrel,
    M: M, rnd: rnd, scene: H.sceneRef()
  });
  if (World._buildDeco) World._buildDeco({
    seg: seg, box: box, cyl: cyl, M: M, scene: H.sceneRef()
  });

  if (CFG.RENDER.mergeStatic !== false && typeof StaticMerge !== 'undefined') {
    StaticMerge.merge(THREE, scene);
  }

  World._markBuilt();
};

/* ---------- PART 3: expansion districts (tunnel, construction, Depot B, row houses, rail yard) ---------- */
