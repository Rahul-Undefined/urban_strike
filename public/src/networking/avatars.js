/* Remote-player presentation: avatar bodies, name tags, hp bars, and the
   per-weapon third-person models applied from snapshot wp indices. Pure
   rendering — no sockets, no interpolation, no game state. */
var Avatars = (function () {
  'use strict';

  /* v10.9 - GEOMETRY IS SHARED, NOT MINTED PER MESH. Building a geometry per
     weapon switch or per join and never disposing it stranded GPU buffers
     until a browser dropped ("one person drops at a time"). Geometry here is
     built ONCE per distinct piece, cached and shared; what is per-avatar (two
     CanvasTextures and their SpriteMaterials) is freed by disposeAvatar().
     DO NOT dispose anything module-level: it turns every other operator black. */
  /* v10.10: shared by every avatar's visor silhouette. Sized to the standing
     capsule rather than the body mesh — a blob that reads at 40 m through three
     walls is more useful than an accurate outline nobody can resolve. */
  var XRAY_GEO = new THREE.BoxGeometry(0.62, 1.86, 0.42);
  var XRAY_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4d4d, transparent: true, opacity: 0.42,
    depthTest: false, depthWrite: false
  });

  var geoCache = {};
  function boxGeo(w, h, d) {
    var k = w + '|' + h + '|' + d;
    return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d));
  }

  function nameTag(text, color) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.font = 'bold 34px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(10,12,16,0.6)';
    var w = g.measureText(text).width + 26;
    g.fillRect(128 - w / 2, 8, w, 46);
    g.fillStyle = color;
    g.fillText(text, 128, 42);
    var t = new THREE.CanvasTexture(c);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(1.7, 0.42, 1);
    return s;
  }

  // ---------- third-person weapon models (v2.14.0) ----------
  /* Rebuilt for the v3 operator: a receiver, handguard, barrel, muzzle, grip,
     curved or box magazine, stock and optics — real rifle silhouettes instead
     of a plank. Each weapon is ONE mesh: its parts are merged into a single
     vertex-coloured geometry (the body material, AVM.body), built once per
     weapon name and shared by every player holding it. That is fewer draw
     calls than the v7 box guns (5-8 meshes each), not more.
     Convention unchanged: the grip sits at the origin, the barrel runs along
     -z, so the v8.32 hand position and the v8.35 prone maths still apply. */
  var GC = { dark: 0x23262c, steel: 0x4a4f55, black: 0x18191c, wood: 0x6b4a2a, tan: 0x7a6a4c,
             green: 0x3e4a34, glass: 0x2b4a5e, brass: 0x8a6d3a, olive: 0x4f5638 };
  var gunCache = {};
  function remoteGunGeo(name) {
    if (gunCache[name]) return gunCache[name];
    var w = CFG.WEAPONS[name] || CFG.WEAPONS.ak47 || {};
    var L = [], C = function (h) { return hexRGB(h); };
    var X = Math.PI / 2;
    function bx(x, y, z, sx, sy, sz, col, rx) { piece(L, box(sx, sy, sz), [x, y, z], rx ? [rx, 0, 0] : null, null, C(col)); }
    function tube(x, y, z, r, len, col, seg) { piece(L, cyl(r, r, len, seg || 10), [x, y, z], [X, 0, 0], null, C(col)); }
    function grip(col) { bx(0, -0.065, 0.012, 0.034, 0.095, 0.042, col, 0.28); }
    function rifle(o) {
      var len = o.len, body = o.body, furn = o.furn;
      bx(0, 0.008, -0.09, 0.054, 0.072, 0.3, body);                                 // receiver
      bx(0, 0.0, -0.1 - len * 0.32, 0.05, 0.058, len * 0.36, furn);                 // handguard
      tube(0, 0.012, -0.1 - len * 0.5 - len * 0.12, 0.011, len * 0.36, GC.black);   // barrel
      tube(0, 0.012, -0.1 - len * 0.72, 0.016, 0.06, GC.black);                     // muzzle device
      grip(GC.black);
      if (o.mag === 'curve') {
        bx(0, -0.075, -0.155, 0.034, 0.08, 0.062, GC.dark, 0.12);
        bx(0, -0.14, -0.178, 0.033, 0.07, 0.058, GC.dark, 0.42);
      } else if (o.mag === 'box') {
        bx(0, -0.085, -0.15, 0.03, 0.12, 0.06, GC.dark, 0.08);
      } else if (o.mag === 'drum') {
        piece(L, cyl(0.07, 0.07, 0.07, 16), [0, -0.1, -0.15], [0, 0, X], null, C(GC.steel));   // drum
      }
      if (o.stock !== false) {
        bx(0, -0.005, 0.16, 0.038, 0.058, 0.2, o.stockCol || furn);                 // stock
        bx(0, -0.025, 0.268, 0.044, 0.11, 0.03, GC.black);                          // butt pad
      }
      if (o.rail) bx(0, 0.051, -0.14, 0.024, 0.012, 0.3, GC.black);                 // top rail
      if (o.optic === 'dot') { bx(0, 0.078, -0.06, 0.03, 0.04, 0.055, GC.black); bx(0, 0.083, -0.088, 0.024, 0.024, 0.004, GC.glass); }
      if (o.optic === 'scope') {
        tube(0, 0.085, -0.1, 0.019, 0.26, GC.black, 12);
        tube(0, 0.085, -0.245, 0.026, 0.05, GC.black, 12);
        tube(0, 0.085, 0.045, 0.024, 0.04, GC.black, 12);
        bx(0, 0.06, -0.1, 0.02, 0.03, 0.04, GC.black);
      }
      if (o.bipod) { bx(0.02, -0.06, -0.1 - len * 0.58, 0.01, 0.12, 0.012, GC.black, -0.5); bx(-0.02, -0.06, -0.1 - len * 0.58, 0.01, 0.12, 0.012, GC.black, -0.5); }
      if (o.bolt) bx(0.04, 0.02, -0.02, 0.04, 0.012, 0.012, GC.steel);
      if (o.carry) bx(0, 0.07, -0.12, 0.02, 0.03, 0.12, GC.black);
    }
    if (w.type === 'melee') {
      bx(0, 0.0, -0.14, 0.006, 0.035, 0.2, 0xb9bfc6);                               // blade
      bx(0, 0.0, -0.035, 0.05, 0.012, 0.014, GC.black);                             // guard
      bx(0, -0.005, 0.02, 0.026, 0.032, 0.11, GC.black);                            // handle
    } else if (name === 'pistol') {
      bx(0, 0.02, -0.07, 0.03, 0.035, 0.19, GC.black);                              // slide
      bx(0, -0.004, -0.06, 0.028, 0.02, 0.14, GC.dark);                             // frame
      bx(0, -0.06, 0.0, 0.03, 0.1, 0.045, GC.dark, 0.22);                           // grip
    } else if (w.type === 'rocket') {
      tube(0, 0.05, -0.12, 0.05, 0.95, GC.olive, 14);                               // launch tube
      tube(0, 0.05, -0.64, 0.06, 0.12, GC.dark, 14);                                // warhead
      bx(0, -0.03, 0.0, 0.03, 0.09, 0.04, GC.black, 0.2);                           // grip
      bx(0.055, 0.08, -0.05, 0.03, 0.05, 0.08, GC.black);                           // sight
    } else if (w.flame) {
      tube(0, 0.0, -0.3, 0.03, 0.62, GC.dark, 10);
      tube(0, -0.12, 0.05, 0.08, 0.34, GC.steel, 14);
      grip(GC.black);
    } else if (w.gear) {
      bx(0, -0.02, -0.1, 0.16, 0.06, 0.22, GC.dark);
      bx(0, 0.02, -0.1, 0.08, 0.02, 0.08, w.type === 'emp' ? GC.steel : GC.green);
    } else if (w.type === 'bow') {
      bx(0, 0.0, -0.05, 0.02, 0.9, 0.02, GC.wood);
      bx(0, -0.01, 0.0, 0.03, 0.12, 0.035, GC.black);
    } else {
      var S = {
        ak47:   { len: 0.62, body: GC.dark, furn: GC.wood, mag: 'curve' },
        akm:    { len: 0.62, body: GC.dark, furn: GC.wood, mag: 'curve' },
        m4a1:   { len: 0.58, body: GC.dark, furn: GC.black, mag: 'box', rail: 1, optic: 'dot' },
        scarh:  { len: 0.62, body: GC.tan, furn: GC.tan, mag: 'box', rail: 1, optic: 'dot', stockCol: GC.tan },
        famas:  { len: 0.5, body: GC.dark, furn: GC.black, mag: 'box', carry: 1 },
        aug:    { len: 0.56, body: GC.olive, furn: GC.olive, mag: 'box', optic: 'dot', stock: false },
        sniper: { len: 0.86, body: GC.green, furn: GC.green, mag: 'box', optic: 'scope', bolt: 1, bipod: 1 },
        awm:    { len: 0.92, body: GC.tan, furn: GC.tan, mag: 'box', optic: 'scope', bolt: 1, bipod: 1, stockCol: GC.tan },
        kar98:  { len: 0.84, body: GC.wood, furn: GC.wood, mag: null, optic: 'scope', bolt: 1 },
        k98w:   { len: 0.84, body: GC.wood, furn: GC.wood, mag: null, bolt: 1 },
        garand: { len: 0.78, body: GC.wood, furn: GC.wood, mag: null },
        mk14:   { len: 0.72, body: GC.dark, furn: GC.wood, mag: 'box', rail: 1, optic: 'scope' },
        m249:   { len: 0.72, body: GC.green, furn: GC.dark, mag: 'drum', rail: 1, bipod: 1, carry: 1 },
        shotgun:{ len: 0.62, body: GC.dark, furn: GC.wood, mag: null },
        aa12:   { len: 0.56, body: GC.dark, furn: GC.dark, mag: 'drum' },
        uzi:    { len: 0.3, body: GC.dark, furn: GC.dark, mag: 'box', stock: false },
        p90:    { len: 0.36, body: GC.black, furn: GC.black, mag: null, optic: 'dot', stock: false },
        ump9:   { len: 0.38, body: GC.dark, furn: GC.dark, mag: 'box', rail: 1 },
        mp5:    { len: 0.36, body: GC.dark, furn: GC.dark, mag: 'curve' },
        vector: { len: 0.36, body: GC.black, furn: GC.black, mag: 'box', rail: 1, optic: 'dot' }
      };
      var o = S[name] || { len: 0.6, body: GC.dark, furn: GC.dark, mag: 'box', rail: 1 };
      if (w.scope && !o.optic) o.optic = 'scope';
      rifle(o);
      if (name === 'shotgun') { tube(0, -0.03, -0.32, 0.013, 0.34, GC.black); bx(0, -0.04, -0.3, 0.046, 0.05, 0.14, GC.wood); }
      if (name === 'p90') bx(0, 0.06, -0.08, 0.05, 0.03, 0.28, 0x6a6f58);
    }
    gunCache[name] = merge(L);
    return gunCache[name];
  }
  function buildRemoteGun(name) {
    var g = new THREE.Group();
    var m = new THREE.Mesh(remoteGunGeo(name), AVM.body);
    /* Measured: the holder's local +y points DOWN in every stance (standing,
       crouched and prone), so every third-person gun since v7.9 was drawn
       upside down — scope underneath, magazine on top. A roll about the barrel
       axis puts it right way up without moving the barrel or the grip. */
    m.rotation.z = Math.PI;
    m.castShadow = true;
    g.add(m);
    return g;
  }
  // Swap the avatar's held model whenever the snapshot weapon index changes.
  function setRemoteGun(r, wpIdx) {
    var name = CFG.WEAPON_ORDER[wpIdx] || 'ak47';
    if (r.gunName === name) return;
    r.gunName = name;
    var h = r.av.gun;
    while (h.children.length) h.remove(h.children[0]);
    h.add(buildRemoteGun(name));
  }

  /* ==========================================================================
     OPERATOR v3 — A HUMAN, NOT A STACK OF BOXES (v2.14.0)
     ==========================================================================
     Rahul: "real human like avatar hona chahiye."
     Every body part is a SCULPTED mesh: lathed limbs, a tapered torso, a head
     with skull, jaw, nose, ears, hair and eyes, gloved hands, soled boots.

     THE CONTRACT DID NOT CHANGE. Every joint sits where it did in v7.9-v1.0e:
     hips (±0.115, -0.02), knees -0.42, spine 0.02, shoulders (±0.245, 0.495),
     elbows -0.29, neck 0.625, head +0.118. RIG, RIG_LIFT, the head hit box
     (net.js reads headMesh's world position), the gun holder on the right
     elbow and the returned field names are as they were.

     IT COSTS NO MORE THAN THE BOXES. The detail is in VERTICES, not meshes:
     each rigid segment is ONE mesh with its colours baked into a vertex-colour
     attribute. 12 always visible; knee pads and face are shed past 30 m;
     helmet and vest when worn. ONE body material for every player; the team
     colour is baked into the geometry and cached by colour, so a team shares
     every buffer.

     Skin, hair and beard come from the callsign by a stable hash: the same
     player looks the same to everyone and a lobby is not fifteen clones.
     Facing: +z is the front of the operator (knee pads, toes, face). */
  var AVM = {
    body: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 14, specular: 0x161616 }),
    visor: new THREE.MeshLambertMaterial({ color: 0x14181c })   // kept for anything external that reads it
  };
  /* Colours in sRGB hex; vertex colours are written as-is, like the rest of
     the game's Lambert/Phong palette. */
  var COL = {
    fatigue: 0x5d5138, fatigueDk: 0x4a4130, webbing: 0x2f2a21, sole: 0x17140f,
    vest: 0x5a4f37, vestDk: 0x463d2b, pouch: 0x655a40, helmet: 0x544a36, helmetDk: 0x3a3326,
    cup: 0x1d1f22, lip: 0x7a4a40, sclera: 0xd8d2c8, iris: 0x23201c, pack: 0x514936
  };
  var SKINS = [0xe0b48f, 0xc8956c, 0xa8744f, 0x8a5a3c, 0x5e3b27];
  var HAIRS = [0x1c1712, 0x3b2a1c, 0x6b4a2c];

  function hexRGB(h) { var c = new THREE.Color(h); return [c.r, c.g, c.b]; }
  function shade(rgb, k) { return [rgb[0] * k, rgb[1] * k, rgb[2] * k]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ---- a tiny merger: every piece becomes non-indexed, transformed, coloured,
     then all pieces are concatenated into ONE BufferGeometry. ---- */
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  function piece(list, geo, pos, rot, scl, color) {
    var g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1));
    g.applyMatrix4(_m);
    var n = g.attributes.position.count, col = new Float32Array(n * 3);
    var P = g.attributes.position.array;
    for (var i = 0; i < n; i++) {
      var c = typeof color === 'function' ? color(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) : color;
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    list.push({ p: g.attributes.position.array, n: g.attributes.normal.array, c: col });
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  function merge(list) {
    var len = 0, i;
    for (i = 0; i < list.length; i++) len += list[i].p.length;
    var P = new Float32Array(len), N = new Float32Array(len), C = new Float32Array(len), o = 0;
    for (i = 0; i < list.length; i++) { P.set(list[i].p, o); N.set(list[i].n, o); C.set(list[i].c, o); o += list[i].p.length; }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  /* primitives */
  function sph(r, w, h, ts, tl) { return new THREE.SphereGeometry(r, w || 16, h || 12, 0, Math.PI * 2, ts || 0, tl || Math.PI); }
  function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  function cyl(rt, rb, h, seg) { return new THREE.CylinderGeometry(rt, rb, h, seg || 14, 1, false); }
  /* A limb or trunk turned on a lathe: prof = [[radius, y], ...] from bottom to top. */
  function lathe(prof, seg) {
    var pts = prof.map(function (p) { return new THREE.Vector2(Math.max(0.0005, p[0]), p[1]); });
    var g = new THREE.LatheGeometry(pts, seg || 18);
    g.computeVertexNormals();
    return g;
  }

  var geoCache3 = {};
  function cached(key, fn) { return geoCache3[key] || (geoCache3[key] = fn()); }

  /* ---------------- the segments ---------------- */
  function geoPelvis(acc) {
    return cached('pelvis|' + acc, function () {
      var L = [], A = hexRGB(acc), F = hexRGB(COL.fatigue), W = hexRGB(COL.webbing);
      // hips and tucked shirt, one lathe: trousers below the belt, shirt above
      piece(L, lathe([[0.06, -0.115], [0.13, -0.095], [0.165, -0.055], [0.172, -0.01], [0.166, 0.05], [0.156, 0.13], [0.152, 0.2], [0.158, 0.26]], 16),
        [0, 0, 0], null, [1, 1, 0.72], function (x, y) { return y < 0.02 ? F : shade(A, 0.92); });
      piece(L, cyl(0.178, 0.178, 0.055, 18), [0, 0.0, 0], null, [1, 1, 0.74], W);            // belt
      piece(L, box(0.06, 0.042, 0.02), [0, 0.0, 0.132], null, null, hexRGB(0x6f6656));        // buckle
      piece(L, box(0.07, 0.085, 0.05), [0.15, -0.02, 0.05], [0, 0.5, 0], null, W);            // pouch R
      piece(L, box(0.07, 0.085, 0.05), [-0.15, -0.02, 0.05], [0, -0.5, 0], null, W);          // pouch L
      piece(L, box(0.13, 0.07, 0.05), [0, -0.01, -0.13], null, null, W);                     // dump pouch
      return merge(L);
    });
  }
  function geoChest(acc) {
    return cached('chest|' + acc, function () {
      var L = [], A = mix(hexRGB(acc), hexRGB(0x6a6658), 0.22);
      // waist -> ribcage -> chest -> trapezius slope; deeper at the chest than the waist
      piece(L, lathe([[0.153, 0.22], [0.165, 0.3], [0.19, 0.38], [0.203, 0.45], [0.205, 0.5], [0.19, 0.545], [0.15, 0.575], [0.09, 0.6], [0.06, 0.61]], 18),
        [0, 0, 0], null, [1, 1, 0.62], function (x, y) {
          /* v3 tested y + 0.40 here, so the "collar" shade covered the whole
             shirt; that 0.75 is the shirt players know and it stays. The
             collar itself is now the top ring, in kit fabric. */
          return y > 0.585 ? hexRGB(COL.vest) : shade(A, 0.75);
        });
      piece(L, sph(0.08, 12, 8), [0.075, 0.445, 0.07], null, [1, 0.7, 0.45], shade(A, 0.97));   // chest L/R give the shirt a body under it
      piece(L, sph(0.08, 12, 8), [-0.075, 0.445, 0.07], null, [1, 0.7, 0.45], shade(A, 0.97));
      piece(L, box(0.07, 0.05, 0.012), [-0.1, 0.5, 0.126], [0, -0.25, 0], null, shade(A, 0.7)); // sleeve-pocket flap (left chest)
      var g = merge(L); g.translate(0, -0.40, 0); g.computeBoundingBox(); g.computeBoundingSphere();
      return g;
    });
  }
  function geoNeck(skin) {
    return cached('neck|' + skin, function () {
      var L = [], S = hexRGB(skin);
      piece(L, lathe([[0.072, -0.085], [0.058, -0.055], [0.054, 0.0], [0.05, 0.04]], 14), [0, 0, 0.004], null, [1, 1, 0.95], S);
      return merge(L);
    });
  }
  /* The head is built about its own centre — the point net.js caches as the
     head position for hit detection — so the hit box stays centred on what
     is drawn. Its extent is measured at load (HEAD, below the builders). */
  function geoHead(skin, hair, beard) {
    return cached('head|' + skin + '|' + hair + '|' + beard, function () {
      var g = geoHeadRaw(skin, hair, beard);
      g.translate(-HEAD_OFF.x, -HEAD_OFF.y, -HEAD_OFF.z); g.computeBoundingBox(); g.computeBoundingSphere();
      return g;
    });
  }
  function geoHeadRaw(skin, hair, beard) {
    {
      var L = [], S = hexRGB(skin), H = hexRGB(hair), Sd = shade(S, 0.86);
      var stub = mix(S, H, 0.42);
      /* A short military crop painted into the cranium's own vertex colours:
         a high, slightly receding hairline at the front, down to the ears at
         the sides and low on the nape. No shell over the skull, so nothing
         can cut across the face. */
      var hairline = function (x, y, z) {
        var back = Math.max(0, Math.min(1, (0.055 - z) / 0.13));        // 0 at the forehead -> 1 behind the ears
        var line = 0.052 - back * 0.115 + Math.abs(x) * 0.12 * (1 - back);   // recedes at the temples
        var t = Math.max(0, Math.min(1, (y - line) / 0.012));
        t = t * t * (3 - 2 * t);
        return mix(S, H, t * 0.96);
      };
      /* Stubble is painted into the jaw's own vertex colours rather than laid
         over it as a second shell: no seam, no z-fighting, no jagged edge. */
      var beardy = !beard ? S : function (x, y, z) {
        var t = Math.max(0, Math.min(1, (-0.022 - y) / 0.045)); t = t * t * (3 - 2 * t);          // fades in below the cheekbones
        if (z < 0.0) t *= Math.max(0, 1 + z / 0.03);                    // ...and out towards the ears
        if (y < -0.06 && y > -0.075 && Math.abs(x) < 0.02 && z > 0.06) t *= 0.4;   // lighter under the lip
        return mix(S, stub, t);
      };
      piece(L, sph(1, 30, 22), [0, 0.01, -0.004], null, [0.089, 0.1, 0.084], hairline);       // cranium, short crop painted on
      piece(L, sph(1, 28, 18), [0, -0.05, 0.016], null, [0.071, 0.07, 0.07], beardy);          // jaw + cheeks
      piece(L, sph(1, 12, 8), [0, -0.092, 0.043], null, [0.034, 0.022, 0.026], beardy);             // chin
      piece(L, sph(1, 10, 8), [0, -0.014, 0.077], [0.3, 0, 0], [0.0105, 0.03, 0.016], S);      // nose bridge
      piece(L, sph(1, 10, 8), [0, -0.038, 0.085], null, [0.0115, 0.011, 0.011], S);            // nose tip
      piece(L, sph(1, 8, 6), [0.0095, -0.043, 0.079], null, [0.0075, 0.006, 0.006], S);         // nostril wings
      piece(L, sph(1, 8, 6), [-0.0095, -0.043, 0.079], null, [0.0075, 0.006, 0.006], S);
      piece(L, sph(1, 10, 8), [0.0905, -0.006, -0.006], null, [0.012, 0.026, 0.017], Sd);       // ears
      piece(L, sph(1, 10, 8), [-0.0905, -0.006, -0.006], null, [0.012, 0.026, 0.017], Sd);
      piece(L, sph(1, 12, 6), [0, 0.024, 0.062], null, [0.062, 0.015, 0.018], S);              // brow ridge
      // short military cut: a cap of hair tilted back, so the hairline sits high at the front
      return merge(L);
    }
  }
  /* Measured once at load from the sculpted head itself (the beard sits inside
     the jaw, so every look has the same bounds): HEAD_OFF re-centres the head
     on its own origin, HEAD is the extent HEAD_HALF turns into the hit box.
     Sculpt the head and the hit box follows — nothing to keep in sync by hand. */
  var HEAD_OFF, HEAD;
  (function () {
    var g = geoHeadRaw(SKINS[0], HAIRS[0], true); g.computeBoundingBox();
    var b = g.boundingBox, c = new THREE.Vector3(), z = new THREE.Vector3();
    b.getCenter(c); b.getSize(z); g.dispose();
    HEAD_OFF = { x: c.x, y: c.y, z: c.z };
    var up = function (v) { return Math.ceil(v * 1000) / 1000; };
    HEAD = { w: up(z.x), h: up(z.y), d: up(z.z) };
  })();
  /* face detail: eyes, brows, mouth — shed past the LOD line with the knee pads */
  function geoFace(hair, skin) {
    return cached('face|' + hair + '|' + skin, function () {
      var L = [], H = hexRGB(hair), W = hexRGB(COL.sclera), I = hexRGB(COL.iris), Sk = shade(hexRGB(skin), 0.8);
      var Lp = mix(shade(hexRGB(skin), 0.78), hexRGB(COL.lip), 0.4);
      [-1, 1].forEach(function (s) {
        piece(L, sph(1, 10, 6), [s * 0.03, 0.006, 0.0725], null, [0.0115, 0.0062, 0.005], W);
        piece(L, sph(1, 8, 6), [s * 0.03, 0.006, 0.0772], null, [0.0047, 0.0047, 0.0016], I);
        piece(L, sph(1, 10, 6), [s * 0.03, 0.0115, 0.0715], null, [0.0125, 0.004, 0.006], Sk);   // upper lid
        piece(L, box(0.032, 0.0075, 0.01), [s * 0.031, 0.0245, 0.0775], [0, 0, -s * 0.1], null, H);
      });
      piece(L, sph(1, 10, 6), [0, -0.0645, 0.0805], null, [0.017, 0.0035, 0.006], Lp);          // upper lip
      piece(L, sph(1, 10, 6), [0, -0.0705, 0.0795], null, [0.015, 0.0042, 0.0062], shade(Lp, 1.15)); // lower lip
      var g = merge(L); g.translate(-HEAD_OFF.x, -HEAD_OFF.y, -HEAD_OFF.z);
      return g;
    });
  }
  function geoUpperArm(acc, side) {
    return cached('uarm|' + acc + '|' + side, function () {
      var L = [], A = hexRGB(acc);
      piece(L, sph(1, 14, 10), [0, -0.05, 0], null, [0.056, 0.055, 0.062], shade(A, 0.95));   // deltoid (kept below the joint: a cap above it swings out when the arm lifts)
      piece(L, lathe([[0.046, -0.3], [0.05, -0.25], [0.055, -0.16], [0.057, -0.09], [0.057, -0.03]], 14), [0, 0, 0], null, [1, 1, 1.08], A);
      piece(L, box(0.06, 0.06, 0.008), [side * 0.054, -0.085, 0], [0, side * Math.PI / 2, 0], null, hexRGB(COL.vest)); // shoulder pocket, in kit fabric
      return merge(L);
    });
  }
  function geoForearm(acc, skin) {
    return cached('farm|' + acc + '|' + skin, function () {
      var L = [], A = shade(hexRGB(acc), 0.84), G = hexRGB(COL.webbing), S = hexRGB(skin), K = hexRGB(COL.vest);
      piece(L, sph(0.04, 10, 8), [0, 0, 0], null, null, A);                                                  // elbow
      piece(L, sph(1, 10, 6), [0, -0.02, -0.03], null, [0.04, 0.062, 0.024], K);                            // elbow pad
      piece(L, cyl(0.0405, 0.04, 0.032, 10), [0, -0.196, 0], null, null, K);                                 // cuff
      piece(L, lathe([[0.036, -0.215], [0.042, -0.16], [0.046, -0.08], [0.043, -0.01]], 12), [0, 0, 0], null, null, A);
      piece(L, cyl(0.036, 0.037, 0.016, 10), [0, -0.222, 0], null, null, S);                                 // wrist
      piece(L, lathe([[0.027, -0.305], [0.036, -0.285], [0.041, -0.26], [0.039, -0.232]], 10), [0, 0, 0.004], null, [0.82, 1, 1.12], G); // gloved hand
      piece(L, sph(1, 8, 6), [0.024, -0.265, 0.026], [0.4, 0, 0.5], [0.012, 0.03, 0.012], G);             // thumb
      return merge(L);
    });
  }
  function geoThigh(side) {
    return cached('thigh|' + side, function () {
      var L = [], F = hexRGB(COL.fatigue), W = hexRGB(COL.webbing);
      piece(L, lathe([[0.058, -0.43], [0.062, -0.38], [0.072, -0.26], [0.082, -0.13], [0.088, -0.04], [0.084, 0.02], [0.05, 0.05]], 16), [0, 0, 0], null, [1, 1, 1.08],
        function (x, y) { return y > -0.02 ? shade(F, 0.95) : F; });
      piece(L, box(0.028, 0.11, 0.09), [side * 0.08, -0.2, 0.0], null, null, shade(F, 0.82));               // cargo pocket
      if (side > 0) {                                                                                        // drop-leg holster, right thigh
        piece(L, box(0.035, 0.16, 0.075), [0.09, -0.14, -0.005], null, null, W);
        piece(L, box(0.03, 0.05, 0.05), [0.098, -0.04, 0.01], null, null, hexRGB(0x23262c));
      }
      return merge(L);
    });
  }
  function geoShin() {
    return cached('shin', function () {
      var L = [], F = hexRGB(COL.fatigue), B = hexRGB(COL.webbing), So = hexRGB(COL.sole);
      piece(L, sph(0.059, 12, 8), [0, 0, 0], null, null, F);                                                // knee
      piece(L, lathe([[0.05, -0.33], [0.052, -0.26], [0.063, -0.12], [0.06, -0.04], [0.056, 0.0]], 16), [0, 0, 0], null, [1, 1, 1.08], F);
      piece(L, lathe([[0.058, -0.46], [0.058, -0.4], [0.054, -0.34], [0.055, -0.3]], 14), [0, 0, 0], null, [1, 1, 1.1], B); // boot shaft
      piece(L, sph(1, 14, 10), [0, -0.44, 0.05], null, [0.06, 0.045, 0.105], B);                            // foot
      piece(L, box(0.126, 0.03, 0.245), [0, -0.485, 0.035], null, null, So);                                 // sole
      piece(L, box(0.04, 0.12, 0.012), [0, -0.37, 0.058], null, null, shade(B, 0.75));                       // laces
      return merge(L);
    });
  }
  function geoKneePad() {
    return cached('kneepad', function () {
      var L = [], W = hexRGB(COL.webbing);
      piece(L, sph(1, 12, 10), [0, -0.005, 0.058], null, [0.058, 0.066, 0.028], shade(W, 1.15));
      piece(L, cyl(0.062, 0.062, 0.02, 14), [0, -0.05, 0.0], null, [1, 1, 1.05], W);
      return merge(L);
    });
  }
  /* ===== v2.14.1 - THREE LEVELS YOU CAN TELL APART =====
     Rahul: "Helmet, Vest yeh sab ka design consistent kar do ... lvl 1 and 2,
     3 woh sab sahi se hona chahiye." v3 drew ONE vest and ONE helmet for every
     level. Each level is now its own piece of the same kit (same fabric, same
     cut) and says what it is twice: by how much of it there is, and by bars in
     the level's HUD colour on the chest and the back of the helmet.
       vest    L1 two slim plates on straps   L2 + cummerbund, magazines
               L3 + shoulder guards, collar, groin and side plates, radio
       helmet  L1 bump shell   L2 + rails, ear defenders, shroud
               L3 a fuller ballistic shell, goggles up, jaw guards, battery
     One mesh each: the level swaps the (cached, shared) geometry. The shirt's
     collar, cuffs, elbow pads and shoulder pockets are cut from the same
     fabric, so clothes and kit are one uniform. */
  var LVL_HEX = [0, 0x9aa3ad, 0x4fa3e0, 0xf0c040];
  function lvlRGB(lvl) {
    var hex = LVL_HEX[lvl] || LVL_HEX[1];
    try { var cfgC = (typeof CFG !== 'undefined' && CFG.ARMOR && CFG.ARMOR[lvl] && CFG.ARMOR[lvl].color) ? CFG.ARMOR[lvl].color : null; if (cfgC) return hexRGB(cfgC); } catch (err) { /* the table above */ }
    return hexRGB(hex);
  }
  function geoVest(acc, lvl) {
    lvl = Math.max(1, Math.min(3, lvl | 0 || 2));
    return cached('vest|' + acc + '|' + lvl, function () {
      var L = [], V = hexRGB(COL.vest), Vd = hexRGB(COL.vestDk), Pp = hexRGB(COL.pouch), A = hexRGB(acc), Lc = lvlRGB(lvl);
      var thick = lvl === 1 ? 0.036 : lvl === 2 ? 0.05 : 0.062, front = (lvl === 1 ? 0.106 : 0.091) + thick / 2;   // the slim plate sits proud of the shirt (it was flush, and the chest showed through)
      piece(L, box(lvl === 1 ? 0.29 : 0.33, lvl === 1 ? 0.26 : 0.29, thick), [0, lvl === 1 ? 0.42 : 0.405, front], [-0.06, 0, 0], null, V);       // front plate bag
      piece(L, box(lvl === 1 ? 0.29 : 0.33, lvl === 1 ? 0.27 : 0.3, thick - 0.005), [0, lvl === 1 ? 0.42 : 0.405, -front - 0.002], [0.05, 0, 0], null, V); // back plate bag
      [-1, 1].forEach(function (sd) {
        piece(L, box(0.075, 0.03, 0.235), [sd * 0.115, 0.565, 0], [0, 0, sd * 0.18], null, Vd);              // shoulder straps
        if (lvl === 1) {                                                                                      // the light carrier hangs on two side straps
          piece(L, box(0.012, 0.03, 0.2), [sd * 0.2, 0.37, 0], null, null, Vd);
          piece(L, box(0.012, 0.03, 0.2), [sd * 0.2, 0.31, 0], null, null, Vd);
        }
      });
      if (lvl >= 2) piece(L, cyl(0.212, 0.212, 0.12, 18), [0, 0.31, 0], null, [1, 1, 0.66], Vd);            // cummerbund
      if (lvl >= 2) {
        [-0.105, 0, 0.105].forEach(function (x) {
          piece(L, box(0.078, 0.12, 0.048), [x, 0.335, front + 0.042], null, null, Pp);                      // triple mag pouch
          piece(L, box(0.078, 0.025, 0.052), [x, 0.392, front + 0.042], null, null, Vd);                     // flaps
        });
        piece(L, box(0.2, 0.15, 0.05), [0, 0.36, -front - 0.042], null, null, Pp);                           // hydration pouch
      }
      piece(L, box(lvl === 1 ? 0.12 : 0.16, 0.07, 0.03), [0, lvl === 1 ? 0.37 : 0.47, front + 0.032], null, null, Pp);   // admin pouch
      piece(L, box(0.09, 0.05, 0.008), [lvl === 1 ? 0 : 0, lvl === 1 ? 0.49 : 0.5, front + (lvl === 1 ? 0.022 : 0.05)], null, null, A);   // team patch
      if (lvl === 3) {
        [-1, 1].forEach(function (sd) {
          piece(L, box(0.115, 0.045, 0.17), [sd * 0.205, 0.555, 0], [0, 0, -sd * 0.32], null, V);            // shoulder guards
          piece(L, box(0.105, 0.012, 0.15), [sd * 0.212, 0.583, 0], [0, 0, -sd * 0.32], null, Vd);
          piece(L, box(0.03, 0.15, 0.15), [sd * 0.213, 0.33, 0], null, null, V);                             // side plates
        });
        piece(L, cyl(0.082, 0.092, 0.05, 16), [0, 0.615, -0.004], null, [1, 1, 0.92], Vd);                   // collar
        piece(L, box(0.19, 0.13, 0.03), [0, 0.2, front - 0.02], [0.1, 0, 0], null, V);                       // groin plate
        piece(L, box(0.06, 0.11, 0.045), [-0.12, 0.47, -front - 0.04], null, null, Vd);                      // radio
        piece(L, cyl(0.004, 0.004, 0.2, 5), [-0.12, 0.62, -front - 0.04], null, null, hexRGB(COL.cup));      // its aerial
        piece(L, box(0.1, 0.1, 0.06), [0.19, 0.26, 0.06], null, null, Pp);                                   // dump pouch
      }
      /* level bars, top of the chest plate on the wearer's left */
      for (var bar = 0; bar < lvl; bar++) piece(L, box(0.05, 0.011, 0.008), [0.105, 0.535 - bar * 0.018, front + (lvl === 1 ? 0.022 : 0.03)], [-0.06, 0, 0], null, Lc);
      return merge(L);
    });
  }
  function geoHelmet(acc, lvl) {
    lvl = Math.max(1, Math.min(3, lvl | 0 || 2));
    return cached('helmet|' + acc + '|' + lvl, function () {
      var L = [], Hm = hexRGB(COL.helmet), Hd = hexRGB(COL.helmetDk), C = hexRGB(COL.cup), A = hexRGB(acc), Lc = lvlRGB(lvl);
      var full = lvl === 3;
      piece(L, sph(1, 18, 10, 0, Math.PI * (full ? 0.58 : 0.52)), [0, 0.012, -0.008], [-0.14, 0, 0],
            full ? [0.116, 0.121, 0.125] : [0.111, 0.118, 0.12], Hm);                                        // shell (the ballistic one comes lower)
      piece(L, cyl(full ? 0.118 : 0.113, full ? 0.118 : 0.113, 0.013, 18), [0, 0.03, -0.006], [-0.14, 0, 0], [1, 1, 1.06], A);   // team band
      [-1, 1].forEach(function (sd) {
        piece(L, box(0.008, 0.1, 0.012), [sd * 0.097, -0.045, 0.03], [0.25, 0, -sd * 0.08], null, C);        // chin strap
        if (lvl >= 2) {
          piece(L, box(0.012, 0.022, 0.12), [sd * (full ? 0.115 : 0.11), 0.035, -0.01], null, null, Hd);     // ARC rails
          piece(L, cyl(0.036, 0.036, 0.034, 14), [sd * 0.103, -0.012, -0.004], [0, 0, Math.PI / 2], null, C); // ear defenders
          piece(L, box(0.012, 0.11, 0.012), [sd * 0.1, 0.03, -0.004], [0, 0, -sd * 0.15], null, C);         // headband
        }
        if (full) {
          piece(L, box(0.014, 0.06, 0.075), [sd * 0.1, -0.058, 0.045], [0.2, 0, 0], null, Hm);               // jaw guards
          piece(L, cyl(0.02, 0.022, 0.07, 10), [sd * 0.027, 0.118, 0.105], [1.15, 0, 0], null, C);           // goggles, flipped up
          piece(L, cyl(0.016, 0.016, 0.004, 10), [sd * 0.027, 0.148, 0.12], [1.15, 0, 0], null, hexRGB(0x2f7a55));   // their lenses
        }
      });
      if (lvl >= 2) piece(L, box(0.055, 0.04, 0.025), [0, 0.085, 0.112], [0.35, 0, 0], null, Hd);           // NVG shroud
      if (full) {
        piece(L, box(0.03, 0.05, 0.03), [0, 0.108, 0.108], [0.5, 0, 0], null, Hd);                           // goggle arm
        piece(L, box(0.04, 0.03, 0.03), [0, 0.11, -0.118], null, null, Hd);                                  // battery pack
        piece(L, box(0.07, 0.035, 0.012), [0, 0.06, -0.128], [-0.2, 0, 0], null, Hd);                        // counterweight
      }
      /* level bars across the back of the shell */
      for (var bar = 0; bar < lvl; bar++) piece(L, box(0.014, 0.03, 0.006), [(bar - (lvl - 1) / 2) * 0.024, 0.012, -(full ? 0.131 : 0.126)], [-0.1, 0, 0], null, Lc);
      return merge(L);
    });
  }
  /* THE SAME KIT ON THE GROUND. pickups.js draws a loot helmet or vest with
     this, so what lies there is what gets worn; it was a block in the level's
     colour that became something else on the body. Nobody's side yet, so the
     band and patch carry the LEVEL's colour. */
  function kitGeo(helm, lvl) {
    var c = new THREE.Color((helm ? CFG.HELMET : CFG.ARMOR)[lvl].color).getHex();
    var g = (helm ? geoHelmet(c, lvl) : geoVest(c, lvl)).clone(), k = helm ? 1.7 : 1.45;
    g.translate(0, helm ? -0.03 : -0.37, 0); g.scale(k, k, k);
    return g;
  }
  function geoPack() {
    return cached('pack', function () {
      var L = [], Pk = hexRGB(COL.pack);
      piece(L, box(0.28, 0.33, 0.13), [0, 0.34, 0.19 * -1], null, null, Pk);
      piece(L, box(0.22, 0.12, 0.05), [0, 0.28, -0.27], null, null, shade(Pk, 0.85));
      return merge(L);
    });
  }

  function lookFor(name) {
    var s = String(name || ''), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return { skin: SKINS[h % SKINS.length], hair: HAIRS[(h >>> 4) % HAIRS.length], beard: ((h >>> 8) % 3) !== 0 };
  }
  function accentHex(colorHex) { return new THREE.Color(colorHex).getHex(); }

  function joint(parent, x, y, z) {
    var j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  }
  function seg(parent, geo, x, y, z) {
    var m = new THREE.Mesh(geo, AVM.body);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  /* RIG / RIG_LIFT: unchanged from v1.0e — see the long notes in git history
     (v8.15, v9.10, v12.0, v1.0e). Hit geometry, door fit and the feet-on-floor
     lift all derive from these three numbers. */
  var RIG = { x: 1.68, y: 1.62, z: 1.68 };
  var RIG_LIFT = RIG.y - 1;
  var CARRY = -1.45;            // v2.14.0: rifle at low ready, see poseAvatar

  function buildAvatar(name, colorHex) {
    var acc = accentHex(colorHex);
    var look = lookFor(name);
    var g = new THREE.Group();
    g.scale.set(RIG.x, RIG.y, RIG.z);
    var detail = [];              // parts hidden at distance

    /* ---- legs: same hip and knee joints as v7.9 ---- */
    var hipL = joint(g, -0.115, -0.02, 0);
    var hipR = joint(g, 0.115, -0.02, 0);
    [[hipL, -1], [hipR, 1]].forEach(function (hs) {
      var hip = hs[0];
      seg(hip, geoThigh(hs[1]));
      var knee = joint(hip, 0, -0.42, 0);
      seg(knee, geoShin());
      detail.push(seg(knee, geoKneePad()));
      hip.knee = knee;
    });

    /* ---- trunk ---- */
    var spine = joint(g, 0, 0.02, 0);
    seg(spine, geoPelvis(acc));
    var chest = seg(spine, geoChest(acc), 0, 0.40, 0);   // origin at the chest centre, as v7.9's box was

    /* ---- neck + head. The neck mesh is added to the neck joint FIRST and the
       helmet last: verify-hitbox takes the first non-head mesh under av.head
       as the neck. ---- */
    var neck = joint(spine, 0, 0.625, 0);
    seg(neck, geoNeck(look.skin), 0, 0, 0);
    var headMesh = seg(neck, geoHead(look.skin, look.hair, look.beard), 0, 0.118, 0);
    var face = new THREE.Mesh(geoFace(look.hair, look.skin), AVM.body);
    headMesh.add(face); detail.push(face);

    /* ---- arms: same shoulder and elbow joints ---- */
    function buildArm(sx) {
      var sh = joint(spine, sx * 0.245, 0.495, 0);
      seg(sh, geoUpperArm(acc, sx));
      var el = joint(sh, 0, -0.29, 0);
      seg(el, geoForearm(acc, look.skin));
      sh.elbow = el;
      return sh;
    }
    var armL = buildArm(-1), armR = buildArm(1);

    /* ---- modular equipment: built once, toggled by .visible ---- */
    var vest = seg(spine, geoVest(acc, 2));
    vest.visible = false;
    var helmet = seg(neck, geoHelmet(acc, 2), 0, 0.118, 0);
    helmet.visible = false;
    var pack = seg(spine, geoPack());
    pack.visible = false;

    /* ---- weapon holder on the right hand (v8.32 position, unchanged) ---- */
    var gun = new THREE.Group();
    gun.position.set(0, -0.12, 0.10);
    armR.elbow.add(gun);

    /* v8.16: the name plate and hp bar hang on a holder that is counter-rotated
       (prone lays the group flat, which laid the tag on the floor) and
       inverse-scaled (RIG would smear them wide). */
    var tagHolder = new THREE.Group();
    tagHolder.scale.set(1 / RIG.x, 1 / RIG.y, 1 / RIG.z);
    g.add(tagHolder);
    var tag = nameTag(name, colorHex);
    tag.position.y = 1.16 * RIG.y; tagHolder.add(tag);
    var hc = document.createElement('canvas'); hc.width = 128; hc.height = 18;
    var htx = new THREE.CanvasTexture(hc);
    var hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: htx, depthTest: false, transparent: true }));
    hs.scale.set(0.92, 0.13, 1);
    hs.position.y = 0.98 * RIG.y; hs.visible = false; tagHolder.add(hs);
    var hb = { sprite: hs, canvas: hc, ctx: hc.getContext('2d'), tex: htx };

    /* v10.10/v10.12 RECON VISOR SILHOUETTE: one box drawn with depthTest off.
       It hangs on tagHolder, not g: g carries the RIG scale and the prone
       rotation, which made the marker half a metre too tall, floating over
       the head, and flat on the floor beside a prone player. tagHolder works
       in world units, so -(0.9 * RIG_LIFT) lands it on the capsule centre.
       A separate mesh because the body material is shared by every player
       (v10.9): depthTest off on one is depthTest off on all. Geometry and
       material are module-level; disposeAvatar must NOT free them. */
    var xray = new THREE.Mesh(XRAY_GEO, XRAY_MAT);
    xray.position.y = -(0.9 * RIG_LIFT);
    xray.visible = false;
    xray.renderOrder = 9998;
    xray.matrixAutoUpdate = false; xray.updateMatrix();
    tagHolder.add(xray);

    return {
      group: g, gun: gun, head: neck, headMesh: headMesh, torso: chest, spine: spine, hb: hb, tag: tag,
      xray: xray,
      tagHolder: tagHolder,
      hipL: hipL, hipR: hipR, armL: armL, armR: armR,
      helmet: helmet, vest: vest, pack: pack, detail: detail,
      acc: acc, gearH: 2, gearA: 2,                // v2.14.1: which level's geometry the helmet and vest wear now
      legL: hipL, legR: hipR,                       // back-compat aliases
      phase: 0, breath: 0
    };
  }

  /* ---- equipment from network state. Called only when a tier changes. ---- */
  /* one leg of the v2.14.1 walk; `GAIT` is filled by poseAvatar just before.
     xSide: -1 for the leg at -x, +1 for the leg at +x. */
  var GAIT = { hip: 0, knee: 0, sag: 0, lat: 0, fold: 0, give: 0, lift: 0, floor: 0 };
  /* how far below the hip the sole reaches (thigh 0.42, shin and boot 0.50, the
     sole running 0.1575 ahead of the ankle and 0.0875 behind): hx is the thigh's
     angle, s the shin's (hx + knee) */
  function legLow(hx, s) { return -0.42 * Math.cos(hx) - 0.5 * Math.cos(s) - (s > 0 ? 0.1575 : -0.0875) * Math.sin(s); }
  function poseLeg(hip, ph, xSide) {
    var sn = Math.sin(ph), cs = Math.cos(ph);
    var swing = cs > 0 ? cs : 0;
    var fold = Math.cos(ph + 0.3); fold = fold > 0 ? fold * fold : 0;                  // peaks just before the leg passes under the body; almost nothing while the foot is still down
    var give = Math.cos(ph - 2.12); give = give > 0 ? give * give * give : 0;          // just after the foot lands
    var hx = GAIT.hip - sn * GAIT.sag - swing * GAIT.lift;                             // negative = forward
    var kx = Math.max(0, GAIT.knee + fold * GAIT.fold + give * GAIT.give);             // a knee only folds one way
    /* THE FLOOR. A crouched leg that swings back straightens toward the ground
       and would put its toes through it (10 cm, measured). No foot may reach
       lower than the stance's own resting foot: the knee folds the difference. */
    var low = legLow(hx, hx + kx);
    if (low < GAIT.floor) { var slope = 0.5 * Math.sin(hx + kx) - 0.1575 * Math.cos(hx + kx); if (slope > 0.12) kx += Math.min(0.7, (GAIT.floor - low) / slope); }
    hip.rotation.x = hx;
    var rz = sn * GAIT.lat;                                                            // positive = toward +x
    hip.rotation.z = xSide < 0 ? Math.min(rz, 0.07) : Math.max(rz, -0.07);            // a leg does not swing through the other one
    hip.knee.rotation.x = kx;
  }
  function setGear(av, helmLvl, armorLvl) {
    var hl = Math.max(0, Math.min(3, helmLvl | 0)), al = Math.max(0, Math.min(3, armorLvl | 0));
    var h = hl > 0, v = al > 0;
    /* v2.14.1: the level picks the piece. Geometry is cached per colour and level
       and shared, so this is a pointer swap — nothing is built twice or freed. */
    if (h && av.gearH !== hl) { av.helmet.geometry = geoHelmet(av.acc, hl); av.gearH = hl; }
    if (v && av.gearA !== al) { av.vest.geometry = geoVest(av.acc, al); av.gearA = al; }
    if (av.helmet.visible !== h) av.helmet.visible = h;
    if (av.vest.visible !== v) av.vest.visible = v;
    /* The pack mesh is built and wired but stays hidden: no item grants it yet,
       and a backpack nobody picked up is decoration that multiplies by ten.
       The slot is here so a real backpack item is a one-line change, not a
       second character model. */
  }

  /* ==========================================================================
     POSE. One call per visible remote per frame. Everything here is a Group
     rotation or position — no geometry is rebuilt, no material is touched.
     s = { moved, run, crouch, prone, dead, deadT, rx, lean, dist, dt }
     ====================================================================== */
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function angDiff(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* s = { moved, mx, mz, run, crouch, prone, dead, deadT, rx, ry, lean,
           reloading, dist, dt }
     mx/mz are the LOCAL movement direction (already rotated into the avatar's
     own frame by the caller), which is what makes strafing readable. Nothing
     here is networked: direction, turn rate and stride are all derived from
     interpolated position and yaw. */
  /* ===== v2.16.2 - A RIDER IS THE OPERATOR, SEATED =====
     Rahul: "fix the avatar when on bike it is completely bad, it needs to be
     aligned with the current avatar layout."
     It was not the avatar at all. Since v2.13 a rider's own rig was HIDDEN
     and vehicles.js showed five grey boxes at the seat — the look this file
     left behind in v2.14. Now the rider is this operator: the callsign's
     face, the side's colours, the helmet and vest that are worn, sitting.

     ONE THING HAD TO GIVE: SIZE. RIG draws an operator 1.62x life size so a
     target can be found at range — 2.95 m tall. A motorbike is 2.2 m long and
     a sedan 1.5 m high: at full size the rider is a giant on a toy and his
     head goes through the roof. Aboard, the rig is drawn at SEAT_K of that
     (almost exactly life size, 1.83 m), which is what the vehicles were built
     to. The head hit box reads the head that is drawn (net.js, v8.32), so
     what you see is still what you hit.

     s.seat (from Vehicles.seatOf): kind (the vehicle), driver, open (no
     window sill: the gun can be shown), look (where the player looks,
     relative to the nose; + is to the right). vehicles.js places and tilts the group — this only
     bends the joints. */
  var SEAT_K = 0.62;
  /* per vehicle: hip, knee, knees apart, the trunk's lean (whoever steers /
     a passenger), then the driver's shoulder, elbow and hands-apart.
       bike  astride: knees out, feet back on the pegs, over the bars
       auto  a bench under a low canopy: sat back, arms straight to the bars
       car   the seat is on the floor: knees up, legs out under the dash, the
             back reclined (upright, the helmet is through the roof and the
             boots through the floor pan — both measured)
       bus   a chair and a big flat wheel */
  var SEATS = {
    bike: [-1.20, 1.66, 0.30, 0.36, 0.10, -1.08, -0.50, 0.10],
    auto: [-1.50, 1.40, 0.10, -0.10, -0.12, -0.74, -0.42, 0.02],
    car:  [-1.85, 0.70, 0.09, -0.20, -0.20, -1.22, -0.58, -0.06],
    bus:  [-1.46, 1.40, 0.09, 0.05, 0.05, -0.98, -0.86, -0.06]
  };
  function poseSeat(av, s, seat) {
    var k = Math.min(1, s.dt * 10);
    av.breath += s.dt * 1.6;
    var br = Math.sin(av.breath) * 0.012;
    var P = SEATS[seat.kind] || SEATS.bus, drv = !!seat.driver;
    av.hipL.rotation.x = P[0]; av.hipR.rotation.x = P[0];
    av.hipL.rotation.z = -P[2]; av.hipR.rotation.z = P[2];
    av.hipL.knee.rotation.x = P[1]; av.hipR.knee.rotation.x = P[1];
    var lean = drv ? P[3] : P[4];
    var look = Math.max(-1.35, Math.min(1.35, seat.look || 0));
    /* a passenger with a weapon turns the shoulders to the target; whoever
       steers keeps them square and turns only the head */
    var armed = !drv && !!seat.open;
    var twist = armed ? look * 0.72 : look * 0.12;
    av.sLook = lerp(av.sLook === undefined ? twist : av.sLook, twist, k);
    av.spine.position.y = 0.02;
    av.spine.rotation.x = lean;
    av.spine.rotation.y = -av.sLook;
    av.spine.rotation.z = 0;
    var aim = -s.rx * 0.62;
    if (drv) {
      /* both hands on the controls */
      av.armR.rotation.x = P[5] + br; av.armL.rotation.x = P[5] + br;
      av.armR.rotation.z = P[7]; av.armL.rotation.z = -P[7];
      av.armR.elbow.rotation.x = P[6]; av.armL.elbow.rotation.x = P[6];
    } else if (armed) {
      /* the carry, as on foot: a pillion rider or someone in an auto can shoot */
      av.armR.rotation.x = -0.40 + aim + br; av.armR.rotation.z = -0.20; av.armR.elbow.rotation.x = -1.10;
      av.armL.rotation.x = -0.58 + aim + br; av.armL.rotation.z = 0.34; av.armL.elbow.rotation.x = -1.24;
    } else {
      /* behind glass: hands on the knees */
      av.armR.rotation.x = -0.52 + br; av.armL.rotation.x = -0.52 + br;
      av.armR.rotation.z = 0.04; av.armL.rotation.z = -0.04;
      av.armR.elbow.rotation.x = -0.74; av.armL.elbow.rotation.x = -0.74;
    }
    if (av.gun.visible !== armed) av.gun.visible = armed;
    /* looking ahead there is somebody's back a forearm away: the muzzle goes UP
       (high port) and comes level as the shoulders turn to a target */
    var port = 1 - Math.min(1, Math.abs(av.sLook) / 0.45);
    av.gun.rotation.x = CARRY - 0.80 * port; av.gun.rotation.z = 0;
    av.torso.scale.z = 1 + br * 1.4;
    av.head.rotation.x = -lean * 0.9 - s.rx * 0.5;
    av.head.rotation.y = -(look - av.sLook);
    /* the name plate: lowered to sit over a seated head, and upright */
    if (av.tagHolder) { av.tagHolder.rotation.x = 0; av.tagHolder.rotation.z = 0; av.tagHolder.position.y = -0.55; }
  }
  function poseAvatar(av, s) {
    var k = Math.min(1, s.dt * 10);
    var kSlow = Math.min(1, s.dt * 5.5);

    var showDetail = s.dist < 30;
    if (av.detailShown !== showDetail) {
      av.detailShown = showDetail;
      for (var i = 0; i < av.detail.length; i++) av.detail[i].visible = showDetail;
    }

    /* v2.16.2: aboard a vehicle (see poseSeat). Getting on and off changes the
       size the rig is drawn at, once, and puts back what the seat bent. */
    var seat = s.dead ? null : (s.seat || null);
    if (!!av.seated !== !!seat) {
      av.seated = !!seat;
      var sk = seat ? SEAT_K : 1;
      av.group.scale.set(RIG.x * sk, RIG.y * sk, RIG.z * sk);
      if (av.tagHolder) av.tagHolder.scale.set(1 / (RIG.x * sk), 1 / (RIG.y * sk), 1 / (RIG.z * sk));
      if (!seat) { av.hipL.rotation.z = 0; av.hipR.rotation.z = 0; av.spine.rotation.y = 0; av.gun.visible = true; av.sLook = undefined; }
    }
    if (seat) { poseSeat(av, s, seat); return; }

    if (s.dead) {
      /* Three stages rather than one topple: the knees give, the spine folds,
         then the body rolls. Arms trail instead of staying welded to the gun. */
      /* v8.26: the fall takes 0.50 s, so it finishes inside the 0.80 s the body
         stays (net.js fades it) and is not cut off mid-topple. */
      var t = Math.min(1, s.deadT / 0.50);
      var e = t * t * (3 - 2 * t);
      var late = Math.max(0, (t - 0.35) / 0.65);
      /* v2.14.1: signs turned round — see THE KNEES BENT BACKWARDS below */
      av.hipL.rotation.x = -e * 1.2; av.hipR.rotation.x = -e * 1.0;
      av.hipL.knee.rotation.x = e * 2.0; av.hipR.knee.rotation.x = e * 1.7;
      av.spine.rotation.x = e * 0.62; av.spine.rotation.z = late * 0.25;
      av.spine.position.y = 0.02 - e * 0.18;
      av.armL.rotation.x = -e * 1.0; av.armR.rotation.x = -e * 0.75;
      av.armL.rotation.z = e * 0.62; av.armR.rotation.z = -e * 0.55;
      av.armL.elbow.rotation.x = -0.62 * (1 - late);
      av.armR.elbow.rotation.x = -0.75 * (1 - late);
      av.head.rotation.x = e * 0.45;
      av.group.rotation.z = e * 1.52;
      av.group.rotation.x = late * 0.22;
      /* v8.21: ABSOLUTE, never `-=`. Subtracting every frame sank the corpse
         sixteen metres in a second ("players just vanish"). */
      var restY = (typeof av.baseY === 'number' && isFinite(av.baseY)) ? av.baseY : av.group.position.y;
      av.group.position.y = restY - e * 0.32;

      /* The name stays up over the body while it lies there — a marker for who
         died and where, readable across the fight, which is what makes a kill
         legible to everyone else. It fades with the corpse. */
      if (av.tagHolder) {
        av.tagHolder.rotation.x = -av.group.rotation.x;
        av.tagHolder.rotation.z = -av.group.rotation.z;
        av.tagHolder.position.y = 0.55 * e;
      }
      if (av.tag) { av.tag.visible = true; av.tag.material.depthTest = false; }
      if (av.hb && av.hb.sprite) av.hb.sprite.visible = false;
      return;
    }

    // ---------- stance ----------
    /* Stance blends seed at ZERO (standing), not at the current target. Seeding
       at the target made the first frame snap straight into the pose, so a
       player who spawned crouched popped into it — and it made "prone is slower
       than crouch" untestable because both reached 1 immediately. */
    var crouchT = s.crouch ? 1 : 0, proneT = s.prone ? 1 : 0;
    if (av.cT === undefined) { av.cT = 0; av.pT = 0; }
    av.cT = lerp(av.cT, crouchT, k);
    /* Prone uses a SLOWER blend than crouch on purpose. Dropping flat is a
       commitment in this game and it should look like one — going down and
       getting up both read as a real transition rather than a snap. */
    av.pT = lerp(av.pT, proneT, kSlow);
    var c = av.cT, p = av.pT;

    /* ===== v2.14.1 - THE KNEES BENT BACKWARDS =====
       Rahul: "avatar animation thora gadbad hai ... knee and leg ko sahi
       movement hona chahiye." Measured on the rig, which faces +z: a POSITIVE
       hip rotation swings the thigh BACK, a POSITIVE knee rotation folds the
       shin back (the only way a knee folds). This file crouched with hip
       +1.32 / knee -2.05 and walked with a negative knee: a bird's leg, since
       v8.36 turned the body round and left the leg signs alone. Same angles,
       the right way round, so the feet are exactly as far below the hips and
       no height or hit box moves (tools/verify-operator.js measures it). */
    var hipCrouch = -c * 1.32 + p * 0.05;
    var kneeCrouch = c * 2.05;
    /* v8.15 STANCE HEIGHT IS THE NETWORK'S. av.baseY is the CAPSULE CENTRE and
       already drops with the stance (0.90 / 0.60 / 0.35). Subtracting the drop
       again here buried a prone body 0.46 m ("it vanishes, only the gunshots
       are visible"). Do not re-apply it: the spine offsets below are POSTURE
       inside the body. */
    av.spine.position.y = 0.02 - c * 0.12 - p * 0.30;
    av.spine.rotation.x = c * 0.22 + p * 0.10;
    /* v8.35 PRONE: the rig faces +z, so face-down and head-first is a POSITIVE
       rotation about X (it was negative: on its back, feet first). The head
       hit box reads the rendered head, so it follows for free. */
    av.group.rotation.x = p * (Math.PI / 2) * 0.92;
    /* NaN GUARD: poseAvatar can run before the first baseY (a fresh join, a
       respawn, a dropped snapshot). NaN is sticky and three.js skips an object
       with a NaN matrix — the "frozen, invisible player" report. */
    /* Lift by half the stance height times the rig's Y growth, so the feet
       stay planted whether standing, crouched or flat. Same half-heights the
       capsule uses. */
    var halfNow = 0.9 - c * 0.30 - p * 0.55;
    if (typeof av.baseY === 'number' && isFinite(av.baseY))
      av.group.position.y = av.baseY + halfNow * RIG_LIFT;
    if (av.tagHolder) { av.tagHolder.rotation.x = -av.group.rotation.x; av.tagHolder.rotation.z = 0; av.tagHolder.position.y = 0; }

    // ---------- locomotion ----------
    /* ===== v2.14.1 - A WALK WITH A STANCE AND A SWING =====
       The old cycle was one sine on the hip and half a sine on the knee. A leg
       does two different things in a step:
         stance  the foot is down and the body passes over it: the hip goes
                 from flexed to extended, the knee stays nearly straight;
         swing   the foot comes off behind, the knee folds to clear the ground
                 (most just BEFORE the leg passes under the body) and opens
                 again for the heel to land in front.
       sin(ph) = +1 is the foot furthest AHEAD IN THE DIRECTION OF TRAVEL and
       cos(ph) > 0 is the swing. Direction is in the signed components, so one
       description walks forward, walks back (shorter steps) and sidesteps (the
       legs step OUT and close, never through each other, with a knee lift).
       `fwd` +1 is the way the operator faces, `side` +1 the model's +x.
       net.js and game.js hand over exactly that; they rotated the wrong way
       and the answer depended on the compass. */
    var speed = s.moved / Math.max(0.0001, s.dt);
    var fwd = s.mz || 0, side = s.mx || 0;          // body frame, -1..1
    var lateral = Math.abs(side) > Math.abs(fwd);
    av.phase += s.moved * (s.run ? 2.05 : (lateral || fwd < -0.3) ? 3.3 : 2.75);
    var amp = s.moved > 0.0005 ? Math.min(1, speed / (s.run ? 7.0 : 4.2)) : 0;
    av.amp = lerp(av.amp === undefined ? 0 : av.amp, amp, k * 0.8);
    av.fwd = lerp(av.fwd === undefined ? 0 : av.fwd, fwd, k);
    av.side = lerp(av.side === undefined ? 0 : av.side, side, k);
    av.runT = lerp(av.runT === undefined ? 0 : av.runT, s.run ? 1 : 0, k);
    var A = av.amp * (1 - c * 0.45) * (1 - p * 0.8);

    var backK = av.fwd < 0 ? 0.72 : 1, absF = Math.abs(av.fwd), absS = Math.abs(av.side);
    GAIT.hip = hipCrouch; GAIT.knee = kneeCrouch + 0.05;                           // a soft knee, never locked, never the other way
    GAIT.floor = legLow(GAIT.hip, GAIT.hip + GAIT.knee);
    GAIT.sag = A * (0.44 + 0.30 * av.runT) * backK * (1 - p * 0.85) * av.fwd;      // thigh swing, fore and aft
    GAIT.lat = A * 0.24 * av.side;                                                 // step out / close
    GAIT.fold = A * ((0.98 + 0.80 * av.runT) * absF + (av.fwd < 0 ? 0.22 * absF : 0) + 0.9 * absS);   // knee fold in the swing (going back or sideways it is what lifts the foot)
    GAIT.give = A * (0.14 + 0.20 * av.runT) * absF;                                // knee give as the weight lands
    GAIT.lift = A * (0.07 + 0.30 * absS + (av.fwd < 0 ? 0.05 * absF : 0)) * (1 - p);   // extra hip flexion so the swinging foot clears the ground
    poseLeg(av.hipL, av.phase, -1);
    poseLeg(av.hipR, av.phase + Math.PI, 1);
    /* BOTH HANDS STAY ON THE RIFLE. The arms swung against each other like an
       unarmed walker's, so the support hand left the handguard every stride.
       Now the shoulders counter-turn against the hips and the weapon rocks
       with them as one piece; the head stays on the target. */
    var sw = Math.sin(av.phase), fA = A * absF;
    var carrySway = sw * (0.045 + 0.05 * av.runT) * fA, twist = sw * (0.07 + 0.07 * av.runT) * fA;

    /* TURNING. Yaw rate leans the torso into the turn and counter-rotates the
       shoulders slightly, which is most of what stops a strafing player from
       looking like they are on rails. */
    var yawRate = 0;
    if (av.lastRy !== undefined) yawRate = angDiff(av.lastRy, s.ry) / Math.max(0.0001, s.dt);
    av.lastRy = s.ry;
    av.turn = lerp(av.turn === undefined ? 0 : av.turn, Math.max(-2.6, Math.min(2.6, yawRate)), k * 0.7);
    var turnLean = Math.max(-0.16, Math.min(0.16, av.turn * 0.075));

    // ---------- upper body ----------
    av.breath += s.dt * (s.run ? 2.9 : 1.6);
    var br = Math.sin(av.breath) * (0.012 + av.amp * 0.010);
    var aim = -s.rx * 0.62;
    var bob = Math.sin(av.phase * 2) * 0.012 * A;
    av.spine.position.y += bob;
    av.spine.rotation.y = -turnLean * 0.9 + av.side * 0.12 - twist;
    av.spine.rotation.z = turnLean - av.side * 0.06;   // v2.14.1: top of the body toward the side it is moving to (it leaned away)

    /* RELOAD. The support hand drops to the magazine well and comes back, the
       weapon tips down, and the head follows it — read at a glance, and it is
       the only tell that a defender is briefly harmless. */
    var rl = s.reloading ? 1 : 0;
    av.rT = lerp(av.rT === undefined ? rl : av.rT, rl, Math.min(1, s.dt * 7));
    var R = av.rT;
    var pump = Math.sin(av.breath * 3.4) * 0.5 + 0.5;

    /* THE CARRY (v8.21, v8.32). The weapon is welded to armR.elbow, so the arm
       angle IS the gun angle. Shoulder -0.40, elbow -1.10 and the mount at
       (0,-0.12,+0.10) hold it at chest height, close to the body and inside a
       forearm's reach, so both hands read as ON it. RIG stretches a limb more
       when it points forward, which is why angles and mount were solved
       together and not guessed. `aim` adds on top for looking up and down. */
    /* v8.35 PRONE ARMS: a standing carry laid flat drives the rifle into the
       ground. Shoulder -1.90 and elbow +0.20 on top of the standing pose put
       the weapon forward of the head, 0.23 m above the deck. Blended by `p`. */
    var proneArm = p * 1.90, proneElbow = p * 0.20;
    av.armR.rotation.x = -0.40 + aim + carrySway + br - R * 0.16 - proneArm;
    av.armR.rotation.z = -0.20;
    av.armR.elbow.rotation.x = -1.10 - R * 0.18 + proneElbow;
    av.armL.rotation.x = -0.58 + aim + carrySway + br + R * (0.55 + pump * 0.35) - proneArm;
    av.armL.rotation.z = 0.34 - R * 0.30;
    av.armL.elbow.rotation.x = -1.24 - R * (0.45 + pump * 0.30) + proneElbow;
    /* v8.35: the weapon counter-rotates by exactly the body's prone rotation,
       so the barrel stays level with the WORLD while the operator lies flat. */
    /* v2.14.0 LOW READY: CARRY turns the muzzle from 79 degrees down to about
       10 below level (20 crouched); it fades out exactly as prone fades in. */
    av.gun.rotation.x = CARRY * (1 - p) + R * 0.42 - p * (Math.PI / 2) * 0.92;
    av.gun.rotation.z = R * 0.18;

    av.torso.scale.z = 1 + br * 1.4;
    av.head.rotation.x = -s.rx * 0.5 + R * 0.18;
    av.head.rotation.y = -av.side * 0.10 + twist * 0.85;
    av.group.rotation.z = -s.lean * 0.18;
  }

  /* v8.31 THE TEAM-MODE BUG: `myTeam` lives inside the Net IIFE; reading it
     bare here threw ReferenceError, and only for an ALLY's bar — so FFA was
     flawless and every team match froze (the throw starved FX, pickups, the
     clock and the score behind it). Ask Net for it. */
  function drawHpBar(r, ally) {
    var g = r.av.hb.ctx, W = 128, H = 18;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,14,0.78)';
    g.fillRect(0, 2, W, H - 4);
    var frac = Math.max(0, Math.min(1, r.dispHp / CFG.PLAYER.hp));
    var mt = (typeof Net !== 'undefined' && Net.getMyTeam) ? Net.getMyTeam() : null;
    var allyColor = (mt && CFG.TEAMS[mt]) ? CFG.TEAMS[mt].color : '#63d968';
    g.fillStyle = ally ? allyColor : '#e8563e';
    g.fillRect(2, 4, (W - 4) * frac, H - 8);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 3, W - 2, H - 6);
    r.av.hb.tex.needsUpdate = true;
  }

  /* The half-extent of the RENDERED head: HEAD is measured from the sculpt at
     load, times RIG. Hit detection imports this, so resizing the head resizes
     the box that protects it; rounding UP never makes a visible head
     unhittable. Within 1 cm of the v8.32 box head on every axis. */
  var HEAD_HALF = {
    x: (HEAD.w * RIG.x) / 2 + 0.02,
    y: (HEAD.h * RIG.y) / 2 + 0.02,
    z: (HEAD.d * RIG.z) / 2 + 0.02
  };

  /* v10.9 - FREE WHAT IS ACTUALLY PER-AVATAR: the name-tag and hp-bar
     CanvasTextures and their two SpriteMaterials. Deliberately NOT a scene
     walk that disposes whatever it finds: geometry and the body material are
     shared, and freeing them when one player leaves turns the rest black.
     Called from net.js removeRemote(). Safe to call twice. */
  function disposeAvatar(av) {
    if (!av || av.disposed) return;
    av.disposed = true;
    var owned = [av.tag, av.hb && av.hb.sprite];
    for (var i = 0; i < owned.length; i++) {
      var s = owned[i];
      if (!s || !s.material) continue;
      if (s.material.map) s.material.map.dispose();
      s.material.dispose();
      if (s.parent) s.parent.remove(s);
    }
    if (av.hb) { av.hb.canvas = null; av.hb.ctx = null; av.hb.tex = null; }
  }

  return {
    RIG: RIG,                      // v8.19: hit detection must use these too
    HEAD_HALF: HEAD_HALF,          // v8.32: and the head box comes from here
    lookFor: lookFor,              // v2.14.0: skin / hair / beard from the callsign (render-only)
    buildAvatar: buildAvatar,
    disposeAvatar: disposeAvatar,
    setRemoteGun: setRemoteGun,
    drawHpBar: drawHpBar,
    setGear: setGear,
    kitGeo: kitGeo,                // v2.14.1: the worn helmet / vest, for the loot on the ground
    poseAvatar: poseAvatar,
    SEAT_K: SEAT_K,                // v2.16.2: the size a rider is drawn at, as a share of RIG
    XRAY_MAT: XRAY_MAT
  };
})();
