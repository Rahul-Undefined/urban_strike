/* Remote-player presentation: avatar bodies, name tags, hp bars, and the
   per-weapon third-person models applied from snapshot wp indices. Pure
   rendering — no sockets, no interpolation, no game state. */
var Avatars = (function () {
  'use strict';

  /* ===== v10.9 - GEOMETRY IS SHARED, NOT MINTED PER MESH =====

     THE LEAK. Rahul: "one person drops at a time and after he refreshes the
     browser and again joins". One client at a time, recoverable by reload, is
     a client-side resource exhaustion — not the server, which would have
     dropped everybody together.

     Two call sites built `new THREE.BoxGeometry` on every invocation and
     nothing in this file ever called `dispose()` — the word appeared ZERO
     times in 651 lines, while four other client files use it correctly. So:

       setRemoteGun()  every weapon switch by any remote player tore down the
                       old gun with h.remove() and built a new one. Removing an
                       Object3D from a parent does NOT free its GPU buffers;
                       three.js requires an explicit dispose. 6-15 geometries
                       orphaned per switch, per remote player, forever.

       removeRemote()  a leaver's 13 body geometries and two canvas textures
                       were abandoned the same way.

     A rejoin arrives under a NEW socket id, so every other client builds a
     fresh avatar and strands the old one. That is why it cascades: each drop
     makes every surviving browser heavier and the next drop likelier.

     THE FIX IS NOT "call dispose in more places". Geometry here is immutable —
     nothing in this file reads or writes `.geometry` after construction, and
     every box size is a literal. So a box of a given size is built ONCE and
     shared by every mesh that needs it. Allocation stops being per-event and
     becomes per-distinct-size: bounded at a few hundred for the life of the
     page, no matter how long the match runs or how often anyone swaps.

     What is still per-avatar, and therefore still must be disposed, is the two
     CanvasTextures (name tag, hp bar) and their SpriteMaterials. See
     disposeAvatar() at the foot of this file.

     DO NOT dispose anything reachable from here. AVM, RGM and accentCache are
     module-level and shared; freeing one turns every other operator black. */
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

     WHAT CHANGED. Every body part used to be one BoxGeometry. Each part is now
     a SCULPTED mesh: limbs are lathed profiles (a thigh is thick at the hip
     and narrows to the knee, a calf swells and narrows to the ankle), the
     torso tapers from chest to waist, the head has a skull, jaw, chin, nose,
     ears, hair, eyes and brows, the hands are gloved, the boots have soles.

     WHAT DID NOT CHANGE — THE CONTRACT. Every joint sits at exactly the
     position it did in v7.9-v1.0e: hips (±0.115, -0.02), knees -0.42, spine
     0.02, shoulders (±0.245, 0.495), elbows -0.29, neck 0.625, head +0.118.
     poseAvatar, RIG, RIG_LIFT, the head hitbox (net.js reads headMesh's world
     position), the gun holder on the right elbow and the returned field names
     are untouched, so movement, prone, reload, hit detection and every gate
     that reads the rig behave exactly as before.

     WHY IT COSTS NO MORE THAN THE BOXES. The detail is in VERTICES, not in
     meshes. Each rigid segment (one joint's worth of body) is ONE mesh whose
     colours are baked into a vertex-colour attribute — shirt, trousers,
     gloves, skin and webbing on one draw call. So:
       - always visible: 12 meshes (pelvis, chest, neck, head, 2 upper arms,
         2 forearms, 2 thighs, 2 shins)            budget 17
       - detail (hidden past 30 m): 2 knee pads, the face  -> 15 near, 12 far
       - kitted: + plate carrier + helmet                   -> 17   budget 20
     ONE body material for every player on the server. The team colour is
     baked into the GEOMETRY of the four accent-bearing segments and cached
     by colour, so two players on one team share every buffer.

     REAL-PERSON VARIETY. Skin tone, hair colour and beard are picked from the
     callsign with a stable hash, so the same player always looks the same to
     everyone and a lobby is not fifteen clones. Head geometries are cached per
     look (5 x 3 x 2 at most).

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
        [0, 0, 0], null, [1, 1, 0.62], function (x, y, z) {
          y += 0.40;
          // a seam down the side and a darker collar read as a garment
          var k = (Math.abs(x) > 0.185 && y < 0.5) ? 0.82 : 1.0;
          if (y > 0.585) k = 0.75;
          return shade(A, k);
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
      piece(L, box(0.055, 0.05, 0.008), [side * 0.054, -0.085, 0], [0, side * Math.PI / 2, 0], null, shade(A, 0.72)); // shoulder pocket
      return merge(L);
    });
  }
  function geoForearm(acc, skin) {
    return cached('farm|' + acc + '|' + skin, function () {
      var L = [], A = shade(hexRGB(acc), 0.84), G = hexRGB(COL.webbing), S = hexRGB(skin);
      piece(L, sph(0.04, 10, 8), [0, 0, 0], null, null, A);                                                  // elbow
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
  function geoVest(acc) {
    return cached('vest|' + acc, function () {
      var L = [], V = hexRGB(COL.vest), Vd = hexRGB(COL.vestDk), Pp = hexRGB(COL.pouch), A = hexRGB(acc);
      piece(L, box(0.33, 0.29, 0.05), [0, 0.405, 0.098], [-0.06, 0, 0], null, V);                           // front plate bag
      piece(L, box(0.33, 0.3, 0.045), [0, 0.405, -0.1], [0.05, 0, 0], null, V);                             // back plate bag
      piece(L, cyl(0.212, 0.212, 0.12, 18), [0, 0.31, 0], null, [1, 1, 0.66], Vd);                          // cummerbund
      [-1, 1].forEach(function (s) {
        piece(L, box(0.075, 0.03, 0.235), [s * 0.115, 0.565, 0], [0, 0, s * 0.18], null, Vd);              // shoulder straps
      });
      [-0.105, 0, 0.105].forEach(function (x) {
        piece(L, box(0.078, 0.12, 0.048), [x, 0.335, 0.14], null, null, Pp);                                // triple mag pouch
        piece(L, box(0.078, 0.025, 0.052), [x, 0.392, 0.14], null, null, Vd);                               // flaps
      });
      piece(L, box(0.16, 0.07, 0.03), [0, 0.47, 0.13], null, null, Pp);                                     // admin pouch
      piece(L, box(0.09, 0.05, 0.008), [0, 0.5, 0.148], null, null, A);                                     // team patch
      piece(L, box(0.2, 0.15, 0.05), [0, 0.36, -0.14], null, null, Pp);                                     // hydration pouch
      return merge(L);
    });
  }
  function geoHelmet(acc) {
    return cached('helmet|' + acc, function () {
      var L = [], Hm = hexRGB(COL.helmet), Hd = hexRGB(COL.helmetDk), C = hexRGB(COL.cup), A = hexRGB(acc);
      piece(L, sph(1, 18, 10, 0, Math.PI * 0.52), [0, 0.012, -0.008], [-0.14, 0, 0], [0.111, 0.118, 0.12], Hm); // high-cut shell
      piece(L, cyl(0.113, 0.113, 0.013, 18), [0, 0.03, -0.006], [-0.14, 0, 0], [1, 1, 1.06], A);          // team band
      [-1, 1].forEach(function (s) {
        piece(L, box(0.012, 0.022, 0.12), [s * 0.11, 0.035, -0.01], null, null, Hd);                       // ARC rails
        piece(L, cyl(0.036, 0.036, 0.034, 14), [s * 0.103, -0.012, -0.004], [0, 0, Math.PI / 2], null, C);  // ear defenders
        piece(L, box(0.012, 0.11, 0.012), [s * 0.1, 0.03, -0.004], [0, 0, -s * 0.15], null, C);           // headband
      });
      piece(L, box(0.055, 0.04, 0.025), [0, 0.085, 0.112], [0.35, 0, 0], null, Hd);                       // NVG shroud
      piece(L, box(0.04, 0.03, 0.03), [0, 0.11, -0.115], null, null, Hd);                                  // battery pack
      return merge(L);
    });
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
    var vest = seg(spine, geoVest(acc));
    vest.visible = false;
    var helmet = seg(neck, geoHelmet(acc), 0, 0.118, 0);
    helmet.visible = false;
    var pack = seg(spine, geoPack());
    pack.visible = false;

    /* ---- weapon holder on the right hand (v8.32 position, unchanged) ---- */
    var gun = new THREE.Group();
    gun.position.set(0, -0.12, 0.10);
    armR.elbow.add(gun);

    /* v8.16: NAMEPLATE AND HP BAR GO IN A COUNTER-ROTATED HOLDER.

       They used to be direct children of the group. Prone rotates the group
       ~83 degrees about X, which swung the tag from 1.16 m above the head to
       roughly the same distance out IN FRONT of the body at ground level —
       so it read as "the name tag vanished" when it had actually been laid
       flat on the floor with the player.

       A holder at the group origin, counter-rotated by exactly the group's own
       rotation, cancels it for its children while leaving the body posed. Its
       inverse scale also undoes the RIG stretch, so a 1.52x-wide operator does
       not get a 1.52x-wide smeared nameplate. */
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

    /* ===== v10.10 RECON VISOR SILHOUETTE ===== (placed correctly in v10.12)

       A single box drawn with depthTest OFF and a high renderOrder, so it
       paints over whatever is in front of it. Hidden by default; Net toggles it
       when the local player is wearing a visor.

       WHY IT IS PARENTED TO tagHolder AND NOT TO g.

       v10.10 added it straight to `g` with `position.y = RIG.y * 0.95`. That
       was wrong twice over, and wrong in a way nothing would have reported:

         g.scale is (1.52, 1.301, 1.52). A child of g is scaled by that, so the
         0.62 x 1.86 x 0.42 box rendered at 0.94 x 2.42 x 0.64 — a marker half a
         metre taller than the operator it marks.

         Local position is scaled too, so y = RIG.y * 0.95 = 1.236 landed at
         1.236 * 1.301 = 1.61 above the group origin — floating over the head
         rather than on the body.

       And because g is ROTATED for prone (~83 degrees about X), the box would
       have swung out flat in front of a prone player, marking empty floor.

       tagHolder already solves all three. It carries the inverse RIG scale and
       is counter-rotated every frame by poseAvatar, which is exactly why the
       nameplate and hp bar live there. Its children work in world units, so
       -0.27 is the standing group lift (halfNow * RIG_LIFT = 0.9 * 0.301) put
       back, landing the box on the capsule centre.

       WHY A SEPARATE MESH RATHER THAN RE-MATERIALISING THE BODY. v10.9 made
       every avatar material SHARED across all players — that was the fix for
       the disconnect leak. Setting depthTest = false on a body material to show
       one player through a wall sets it on EVERY player, including the ones you
       are meant to have to find.

       Geometry and material are module-level and shared, so this costs one mesh
       per avatar and nothing per frame. disposeAvatar must NOT free them; it
       names the four resources it owns and this is not among them. */
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
      legL: hipL, legR: hipR,                       // back-compat aliases
      phase: 0, breath: 0
    };
  }

  /* ---- equipment from network state. Called only when a tier changes. ---- */
  function setGear(av, helmLvl, armorLvl) {
    var h = helmLvl > 0, v = armorLvl > 0;
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
  function poseAvatar(av, s) {
    var k = Math.min(1, s.dt * 10);
    var kSlow = Math.min(1, s.dt * 5.5);

    var showDetail = s.dist < 30;
    if (av.detailShown !== showDetail) {
      av.detailShown = showDetail;
      for (var i = 0; i < av.detail.length; i++) av.detail[i].visible = showDetail;
    }

    if (s.dead) {
      /* Three stages rather than one topple: the knees give, the spine folds,
         then the body rolls. Arms trail instead of staying welded to the gun. */
      /* v8.26: collapse compressed 0.85s -> 0.50s.

         Rahul wants a body gone 0.80s after the kill. The old fall took 0.85s
         on its own, so at that window the corpse would have been deleted
         mid-topple — you would see it start to fall and get cut off, which
         looks like a rendering fault rather than a fast kill.

         Shortening the fall keeps the sequence whole inside the budget:
         0.50s to go down, a short beat, then the fade in net.js finishes at
         0.80s. Same three stages, same shapes, just quicker. */
      var t = Math.min(1, s.deadT / 0.50);
      var e = t * t * (3 - 2 * t);
      var late = Math.max(0, (t - 0.35) / 0.65);
      av.hipL.rotation.x = e * 1.2; av.hipR.rotation.x = e * 1.0;
      av.hipL.knee.rotation.x = -e * 2.0; av.hipR.knee.rotation.x = -e * 1.7;
      av.spine.rotation.x = e * 0.62; av.spine.rotation.z = late * 0.25;
      av.spine.position.y = 0.02 - e * 0.18;
      av.armL.rotation.x = -e * 1.0; av.armR.rotation.x = -e * 0.75;
      av.armL.rotation.z = e * 0.62; av.armR.rotation.z = -e * 0.55;
      av.armL.elbow.rotation.x = -0.62 * (1 - late);
      av.armR.elbow.rotation.x = -0.75 * (1 - late);
      av.head.rotation.x = e * 0.45;
      av.group.rotation.z = e * 1.52;
      av.group.rotation.x = late * 0.22;
      /* v8.21 THE CORPSE WAS FALLING THROUGH THE WORLD.

         This line used to read `av.group.position.y -= e * 0.32`, a
         subtraction applied EVERY FRAME. Over the 0.85 s collapse that is
         roughly fifty frames each taking up to another 0.32 m, so the body
         sank about sixteen metres into the ground inside a second. Rahul saw
         a player "just vanish" and assumed there was no death animation at
         all — there was a three-stage one, it was simply happening underground
         after the first few frames.

         Now absolute: settle 0.32 m from wherever the network says the body
         is, and stay there. */
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

    /* Crouch bend retuned in v8.15. The old figures left the feet 0.17 m under
       the floor once the double-counted drop was removed, because the legs
       were only compressing to 0.74 m while the capsule centre sits at 0.60.
       The legs have to fold enough to meet the centre the network dictates,
       not the other way round. Measured, not guessed: feet land at -0.01. */
    var hipCrouch = c * 1.32 + p * 0.30;
    var kneeCrouch = -c * 2.05 - p * 0.45;
    /* v8.15 STANCE HEIGHT WAS DOUBLE-COUNTED.

       net.js:343 sets av.baseY = renderPos.y, and renderPos.y is the CAPSULE
       CENTRE. controller.js reassigns halfY = halfH() on every stance change
       (lines 31, 210, 215), so the centre ALREADY drops when a player crouches
       or goes prone: 0.90 standing, 0.60 crouched, 0.35 prone.

       This function then subtracted the drop a second time. Measured on the
       real rig, feet relative to the ground:

           stand   -0.04    (about right)
           crouch  -0.14    (buried)
           prone   -0.46    (more than half the body underground)

       A prone body is 0.70 m thick. Sunk 0.46, only the weapon — carried
       forward and above the torso — still cleared the floor, which is exactly
       what Rahul filmed: "it vanishes, only the gunshots are visible."

       The network carries the whole vertical story. Do not re-apply it here.
       The spine offsets below are POSTURE inside the body and stay, but the
       crouch figure was tuned against the double-counted position, so it is
       retuned to sit the feet on the floor. */
    av.spine.position.y = 0.02 - c * 0.12 - p * 0.30;
    av.spine.rotation.x = c * 0.22 + p * 0.10;
    /* v8.35 PRONE WAS LYING BACKWARDS.

       Rotation about X maps +Y -> (0, cos, sin) and +Z -> (0, -sin, cos). The
       rig's forward is +Z (the boot toe is offset +0.025 in Z and the rifle is
       carried at +Z). So laying a body face-down with the head forward needs
       the head to travel +Y -> +Z, which is sin = +1, which is a POSITIVE
       rotation.

       It was negative. Measured on the real rig, prone put the head at
       z -0.54 and the feet at z +1.01: the operator was laid out on their BACK,
       feet-first, crawling backwards. The belly faced the sky, and because the
       arms were still posed for standing they swung upward with it, leaving the
       rifle pointing at the clouds 0.49 m above the body.

       One character. Everything downstream follows, including hit detection —
       v8.32 made the head box read the rendered head's world position, so a
       correctly-rotated body carries its own hitbox with it for free. */
    av.group.rotation.x = p * (Math.PI / 2) * 0.92;
    /* NaN GUARD. baseY is written by net.js every frame, but poseAvatar can
       run before the first renderPos exists — a fresh join, a respawn, a
       dropped snapshot. `undefined - p * 0.55` is NaN, Three.js skips an
       object with a NaN matrix entirely, and NaN is STICKY because baseY is
       only ever read. The avatar goes invisible AND stops moving, forever,
       while the local frame keeps rendering. That is the "frozen player"
       report, and it only ever bites remote avatars, which is why it was
       invisible in single-player testing. */
    /* Lift by half the stance height times the rig's Y growth, so the feet
       stay planted whether standing, crouched or flat. Same half-heights the
       capsule uses. */
    var halfNow = 0.9 - c * 0.30 - p * 0.55;
    if (typeof av.baseY === 'number' && isFinite(av.baseY))
      av.group.position.y = av.baseY + halfNow * RIG_LIFT;
    if (av.tagHolder) { av.tagHolder.rotation.x = -av.group.rotation.x; av.tagHolder.rotation.z = 0; av.tagHolder.position.y = 0; }

    // ---------- locomotion ----------
    var speed = s.moved / Math.max(0.0001, s.dt);
    var fwd = s.mz || 0, side = s.mx || 0;          // local, -1..1
    av.phase += s.moved * (s.run ? 2.5 : 3.1);
    var amp = s.moved > 0.0005 ? Math.min(1, speed / (s.run ? 7.0 : 4.2)) : 0;
    av.amp = lerp(av.amp === undefined ? 0 : av.amp, amp, k * 0.8);
    av.fwd = lerp(av.fwd === undefined ? 0 : av.fwd, fwd, k);
    av.side = lerp(av.side === undefined ? 0 : av.side, side, k);
    var A = av.amp * (1 - c * 0.45) * (1 - p * 0.8);

    var sw = Math.sin(av.phase), swb = Math.sin(av.phase + Math.PI);
    /* STRAFING. A soldier moving sideways does not swing their legs fore-and-aft
       — they step out and cross over. Forward swing scales with how much of the
       motion is forward; the sideways component opens the hips instead. */
    var fA = A * Math.abs(av.fwd), sA = A * Math.abs(av.side);
    var backing = av.fwd < -0.25 ? -1 : 1;
    av.hipL.rotation.x = hipCrouch + sw * 0.62 * fA * backing;
    av.hipR.rotation.x = hipCrouch + swb * 0.62 * fA * backing;
    av.hipL.rotation.z = -av.side * 0.10 - Math.max(0, sw) * 0.26 * sA;
    av.hipR.rotation.z = -av.side * 0.10 + Math.max(0, swb) * 0.26 * sA;
    av.hipL.knee.rotation.x = kneeCrouch - Math.max(0, -sw) * (1.0 * fA + 0.55 * sA) - 0.06;
    av.hipR.knee.rotation.x = kneeCrouch - Math.max(0, -swb) * (1.0 * fA + 0.55 * sA) - 0.06;

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
    av.spine.rotation.y = -turnLean * 0.9 + av.side * 0.12;
    av.spine.rotation.z = turnLean + av.side * 0.06;

    /* RELOAD. The support hand drops to the magazine well and comes back, the
       weapon tips down, and the head follows it — read at a glance, and it is
       the only tell that a defender is briefly harmless. */
    var rl = s.reloading ? 1 : 0;
    av.rT = lerp(av.rT === undefined ? rl : av.rT, rl, Math.min(1, s.dt * 7));
    var R = av.rT;
    var pump = Math.sin(av.breath * 3.4) * 0.5 + 0.5;

    /* v8.21 WEAPON IS CARRIED, NOT CARRIED AROUND.

       Rahul: "it is always in one position standing gun down... while shooting
       as well the avatar figure is holding the gun down."

       He was right and the numbers show why. The right arm sat at -0.62 rad,
       about 35 degrees forward of hanging — a low-ready at best, and from any
       distance it reads as a man walking about with a rifle by his knee. The
       weapon is welded to armR.elbow, so the arm angle IS the gun angle;
       nothing else could lift it.

       Raised to a chest carry: shoulders driven further forward, elbows folded
       harder to bring the stock in rather than pushing the muzzle out, and the
       support arm crossed further so both hands read as on the weapon. `aim`
       still adds on top when a remote player is ADS, so scoping is still a
       visible change in silhouette rather than the new resting pose. */
    /* v8.32 THE WEAPON WAS BEING CARRIED AT ARM'S LENGTH.

       v8.21 fixed "standing gun down" by driving the shoulders to -1.18 rad and
       folding the elbows to -1.02. The intent in that commit was to "bring the
       stock in rather than pushing the muzzle out". Measured, it did the
       opposite: the weapon ended up 0.79 m in FRONT of the chest and 0.13 m
       ABOVE it, which on screen reads as arms thrust up in a V with the rifle
       floating detached beside the body.

       The cause is not the angles alone. RIG scales X and Z by 1.52 but Y by
       only 1.22, so a limb rotated toward horizontal is stretched 1.52x while
       the same limb hanging down is stretched 1.22x. Rotating the shoulder
       forward therefore does not just swing the arm — it LENGTHENS it by 25%.
       Angles alone could not bring the weapon closer than 0.56 m; the mount
       offset had to move with them.

       Solved together rather than guessed: shoulder -0.40, elbow -1.10, and the
       weapon remounted from (0,-0.28,-0.06) to (0,-0.12,+0.10). Result is the
       weapon at 0.36 m forward and 0.62 m up — chest height, close to the body,
       and 0.22 m from the elbow, comfortably inside a forearm's reach so the
       hands read as being ON it. `aim` still adds on top for ADS. */
    /* v8.35 PRONE NEEDS ITS OWN ARM POSE.

       Correcting the body rotation is only half of it. A standing carry rotated
       83 degrees puts the arms wherever the torso throws them — with the old
       backwards rotation that was straight up, and even with the corrected one
       it would drive the rifle down into the ground, because the arms hang
       along local -Y and local -Y now points backwards and down.

       Prone shoulders have to reach the other way. Solved numerically against
       the corrected body rather than guessed: shoulder -1.90 and elbow +0.20
       relative to the standing pose put the weapon at z +0.65 — forward of the
       head — and y -0.12, which is 0.23 m above the deck. Reach from the elbow
       stays 0.21 m, well inside a forearm, so the hands still read as on it.

       Blended by `p`, so the transition in and out of prone is the same smooth
       lerp every other stance uses. */
    var proneArm = p * 1.90, proneElbow = p * 0.20;
    av.armR.rotation.x = -0.40 + aim + swb * 0.16 * fA + br - R * 0.16 - proneArm;
    av.armR.rotation.z = -0.20;
    av.armR.elbow.rotation.x = -1.10 - R * 0.18 + proneElbow;
    av.armL.rotation.x = -0.58 + aim + sw * 0.16 * fA + br + R * (0.55 + pump * 0.35) - proneArm;
    av.armL.rotation.z = 0.34 - R * 0.30;
    av.armL.elbow.rotation.x = -1.24 - R * (0.45 + pump * 0.30) + proneElbow;
    /* v8.35: the weapon counter-rotates by exactly the body's prone rotation,
       so the barrel stays level with the WORLD while the operator lies flat.
       Solved numerically at -1.45 rad and then written as the negated body
       rotation, because that is what it physically is — if the 0.92 lie-flat
       factor is ever retuned the barrel follows instead of silently drifting
       back into the dirt. Without this the muzzle buried 0.76 m underground. */
    /* v2.14.0 LOW READY. Measured with the v8.21 arm pose and rx = 0, the
       barrel pointed 79 degrees DOWN — every standing operator held his rifle
       muzzle-to-the-floor like a walking stick. CARRY turns it to a low ready
       (about 10 degrees below level standing, 20 crouched); looking up or down
       still swings it with the arms. It fades out exactly as prone fades in, so
       the v8.35 prone solution below is untouched. */
    av.gun.rotation.x = CARRY * (1 - p) + R * 0.42 - p * (Math.PI / 2) * 0.92;
    av.gun.rotation.z = R * 0.18;

    av.torso.scale.z = 1 + br * 1.4;
    av.head.rotation.x = -s.rx * 0.5 + R * 0.18;
    av.head.rotation.y = -av.side * 0.10;
    av.group.rotation.z = -s.lean * 0.18;
  }

  /* v8.31 THE TEAM-MODE BUG. THIS ONE LINE.

     `myTeam` is declared `var myTeam = null` INSIDE the Net IIFE in net.js.
     It was never visible here, so reading it bare threw ReferenceError.

     It only ever fired for an ALLY, because of short-circuit evaluation:
       ally ? (myTeam ? ...) : '#e8563e'
     With `ally` false the expression resolves to the enemy colour and never
     touches `myTeam`. In FFA `myTeam` is null, so `ally` is ALWAYS false and
     the branch is unreachable — which is exactly why free-for-all was flawless
     while every team match broke. The first time a teammate's bar needed
     drawing (hbDrawn starts at -1 against dispHp 100, so the very first frame
     they are visible) this threw.

     The throw landed inside Net.updateRemotes(), which the render loop calls
     BEFORE FX.update, Pickups.update, Minimap.update, the match clock and the
     team score. Before v8.30 it also skipped renderer.render() outright: the
     black screen. v8.30's error boundary let the frame render, which turned the
     fatal into the visible symptom that finally identified it — muzzle flashes
     and tracers that never age out, a clock frozen at 10:00, and a team score
     stuck at 0-0.

     minimap.js already did this correctly: `var myTeam = Net.getMyTeam();`. */
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

  /* v8.32: the half-extent of the RENDERED head, derived from the very numbers
     the head mesh is built from above (0.195 x 0.235 x 0.185) times RIG. Hit
     detection imports this instead of keeping its own copy, so resizing the
     head resizes the box that protects it. A little generosity is deliberate:
     rounding UP never makes a visible head unhittable. */
  /* v2.14.0: HEAD is measured from the sculpted v3 head at load (see geoHeadRaw):
     about 0.205 wide (ears) x 0.228 tall x 0.188 deep. The resulting box is
     within 1 cm of the v8.32 box head on every axis, so headshot difficulty
     is unchanged. */
  var HEAD_HALF = {
    x: (HEAD.w * RIG.x) / 2 + 0.02,
    y: (HEAD.h * RIG.y) / 2 + 0.02,
    z: (HEAD.d * RIG.z) / 2 + 0.02
  };

  /* ===== v10.9 - FREE WHAT IS ACTUALLY PER-AVATAR =====

     With geometry shared (see boxGeo at the head of this file) an avatar owns
     exactly four disposable things: a 256x64 name-tag CanvasTexture, a 128x18
     hp-bar CanvasTexture, and the SpriteMaterial wrapping each. Nothing else
     here is unique to one player.

     This is deliberately NOT a generic scene-graph walk that disposes every
     geometry and material it finds. Such a walk is the obvious implementation
     and it is wrong in this file: it would free AVM.skin, AVM.fatigue, the
     RGM gun materials and the cached accent the moment ANY player left, and
     every remaining operator would render black. Naming the four owned
     resources explicitly is what makes that impossible.

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
    poseAvatar: poseAvatar,
    XRAY_MAT: XRAY_MAT
  };
})();
