/* VEHICLES — v2.13. The client half of server/lib/vehicles.js.

   Rahul: "vehicles PUBG style mei road pe khade rahenge, usko lekar drive kar
   sakte hai." Urban only: motorbike, auto rickshaw, sedan, city bus, tank.

   WHAT THIS FILE DOES
     models   five vehicles built from boxes and cylinders, each MERGED to one
              mesh per material (5-7 draw calls a vehicle, not 60).
     driving  the driver's client simulates its own vehicle against the world
              (World.fits for the hull, World.rayHit for the ground) and
              reports the pose 20 times a second — the same division of labour
              as walking in this game. Everyone else sees it through the
              snapshot, interpolated.
     riding   a seated player is carried at the seat, and drawn there as
              their own avatar, sitting (v2.16.2: seatOf / sit).
     camera   a chase camera on the mouse, pulled in when a wall is behind it.
     damage   a local shot whose ray meets a hull before it meets a wall is
              reported ('vehHit'); a driver who runs into a player reports the
              ram ('vehRam'). The server decides what each is worth.

   Frames: a vehicle's facing is `ry` with forward = (sin ry, -cos ry) — the
   same convention as a player's. Models are built nose toward -Z. */
var Vehicles = (function () {
  var V = (typeof CFG !== 'undefined' && CFG.VEHICLES) || null;
  var TYPES = V ? Object.keys(V.types) : [];
  var scene = null;
  var list = {};
  var mine = null;
  var mySeat = -1;
  var mountedAt = 0;
  var riders = {};
  var lastRy = 0;
  var mats = null;
  var sendAt = 0;
  var ramAt = {};
  var hudEl = null;
  var promptEl = null;
  var nearest = null;
  var useAt = 0;
  var hornAt = 0;
  var dryToldAt = 0;
  var puffs = [];
  /* a rider's reported position (the middle of their body box) is this far
     above the seat; the head box is read from the head that is drawn */
  var SEAT_UP = 0.22;

  /* ------------------------------------------------------------ models */
  /* ===== v2.18 - THE MODELS, REBUILT =====
     Rahul: "Cars, Bike, Bus graphics should be enhanced so that it looks very
     close to real."

     What was here: boxes. A sedan was two flat-sided extrusions and forty
     boxes in ten flat, matt materials; a wheel was three cylinders that never
     turned; "glass" was a solid dark block, so nobody could be seen inside.

     What a model is now:
       PAINT THAT SHINES. Bodywork is one glossy material that reflects a small
       sky (six painted squares made from the scene's own sky and haze
       colours); trim, rubber and upholstery are a second, matt one. Colour is
       carried per vertex, so a whole body is two draw calls, not ten.
       ROUNDED METAL. Silhouettes are curves, extruded with a bevel, so a
       bonnet rolls over into a wing instead of meeting it at a knife edge;
       normals are averaged across gentle folds and kept sharp across hard
       ones (smooth, below).
       GLASS YOU SEE THROUGH. Windows are panes — tinted, half transparent,
       reflecting the sky — in a cabin with pillars, a roof and an INTERIOR:
       seats, a dashboard, a steering wheel. Whoever rides is seen riding.
       WHEELS THAT TURN. Each wheel is its own mesh — a tyre with shoulders, a
       rim, spokes — spun by the speed and, at the front of a car, bus or
       auto, steered by the turn.
       DOORS THAT OPEN. A sedan's four doors are hinged pieces: the side of
       the cabin IS the doors, so an open one shows the seats. The bus has a
       door that slides. (They are what getting in opens — see enter, below.)
     Built once per type and colour and shared by every vehicle that has it.

     What it is not: a photograph. These are still shapes made in code — no
     model files, no textures but two number plates and a destination board.
     Every dimension that something else depends on is where it was: the hull
     boxes, the wheel centres, the seats, a motorbike's bars and saddle, the
     roofs riders sit under (tools/verify-rider.js measures them). */
  var PAINT = -1;
  var COL = { trim: 0x1b1e22, dark: 0x0d0e10, chrome: 0x9ea6ae, steel: 0x7d848b, tyre: 0x0f0f10, rim: 0xa4abb3, seat: 0x3d312a, seatD: 0x241d19,
              cloth: 0x2c3a4c, olive: 0x4d5a37, oliveD: 0x38422a, track: 0x1b1b19, yellow: 0xe2b21f, green: 0x1f7a46, white: 0xe8e6e0, floor: 0x16181b,
              head: 0xfff3cf, tail: 0xd22a22, amber: 0xffb84a, mirror: 0x9fb4c9, engine: 0x5a5f66 };
  var envTex = null;
  function css(c, k) { return 'rgb(' + Math.round(Math.min(1, c.r * k) * 255) + ',' + Math.round(Math.min(1, c.g * k) * 255) + ',' + Math.round(Math.min(1, c.b * k) * 255) + ')'; }
  /* the small sky the paint and the glass reflect: the scene's own colours, a bright horizon, dark ground */
  function envCube() {
    if (envTex) return envTex;
    if (typeof document === 'undefined') return null;          // no page (a headless check): paint without a sky in it
    var sky = new THREE.Color(0x4d6ea6), haze = new THREE.Color(0x9db2d2);
    if (scene && scene.background && scene.background.isColor) sky.copy(scene.background);
    if (scene && scene.fog && scene.fog.color) haze.copy(scene.fog.color);
    var face = function (kind) {
      var c = document.createElement('canvas'); c.width = c.height = 32;
      var g = c.getContext('2d'), gr;
      if (kind === 'top') { g.fillStyle = css(sky, 1.25); g.fillRect(0, 0, 32, 32); gr = g.createRadialGradient(22, 10, 0, 22, 10, 9); gr.addColorStop(0, 'rgba(255,250,235,0.95)'); gr.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
      else if (kind === 'bottom') { g.fillStyle = '#1a1a1b'; g.fillRect(0, 0, 32, 32); }
      else {
        gr = g.createLinearGradient(0, 0, 0, 32);
        gr.addColorStop(0, css(sky, 1.2)); gr.addColorStop(0.42, css(haze, 1.25)); gr.addColorStop(0.5, css(haze, 1.45)); gr.addColorStop(0.54, '#4a4a48'); gr.addColorStop(1, '#1c1c1d');
        g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      }
      return c;
    };
    var side = face('side');
    envTex = new THREE.CubeTexture([side, side, face('top'), face('bottom'), side, side]);
    envTex.needsUpdate = true;
    return envTex;
  }
  function M() {
    if (mats) return mats;
    var env = envCube();
    mats = {
      gloss: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 85, specular: 0x9a9a9a, envMap: env, combine: THREE.MixOperation, reflectivity: 0.2 }),
      matt: new THREE.MeshLambertMaterial({ vertexColors: true }),
      glass: new THREE.MeshPhongMaterial({ color: 0x0c151d, transparent: true, opacity: 0.62, shininess: 160, specular: 0xffffff, envMap: env, combine: THREE.MixOperation, reflectivity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
      lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
      wheel: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x555555, side: THREE.DoubleSide }),
      beam: new THREE.MeshBasicMaterial({ color: 0xfff0c2, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      smoke: new THREE.MeshBasicMaterial({ color: 0x1d1d1f, transparent: true, opacity: 0.55, depthWrite: false }),
      flame: new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
    };
    return mats;
  }
  /* normals averaged over the faces that meet at a point — but only those within `cosMax` of each other, so
     a curved wing is smooth and the edge of a bumper stays an edge */
  function smooth(pos, nrm, cosMax) {
    var n = pos.length / 3, at = {}, i, key, group, a, b, ia, ib, sx, sy, sz, len, out = new Float32Array(nrm.length);
    for (i = 0; i < n; i++) {
      key = Math.round(pos[i * 3] * 1500) + ',' + Math.round(pos[i * 3 + 1] * 1500) + ',' + Math.round(pos[i * 3 + 2] * 1500);
      (at[key] || (at[key] = [])).push(i);
    }
    for (key in at) {
      group = at[key];
      for (a = 0; a < group.length; a++) {
        ia = group[a] * 3; sx = 0; sy = 0; sz = 0;
        for (b = 0; b < group.length; b++) {
          ib = group[b] * 3;
          if (nrm[ia] * nrm[ib] + nrm[ia + 1] * nrm[ib + 1] + nrm[ia + 2] * nrm[ib + 2] >= cosMax) { sx += nrm[ib]; sy += nrm[ib + 1]; sz += nrm[ib + 2]; }
        }
        len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        out[ia] = sx / len; out[ia + 1] = sy / len; out[ia + 2] = sz / len;
      }
    }
    return out;
  }
  var _km = null, _ke = null, _kc = null, _kv = null, _kq = null, _ks = null;
  function Kit(paint) {
    this.paint = paint; this.bins = {}; this.subs = []; this.cur = null; this.wheels = []; this.decals = [];
    if (!_km) { _km = new THREE.Matrix4(); _ke = new THREE.Euler(); _kc = new THREE.Color(); _kv = new THREE.Vector3(); _kq = new THREE.Quaternion(); _ks = new THREE.Vector3(1, 1, 1); }
  }
  /* a piece that moves on its own (a door): what is put between sub() and end() belongs to it, about its pivot */
  Kit.prototype.sub = function (name, px, py, pz, meta) { var s = { name: name, pivot: [px, py, pz], bins: {}, meta: meta || {} }; this.subs.push(s); this.cur = s; return this; };
  Kit.prototype.end = function () { this.cur = null; return this; };
  Kit.prototype.take = function (layer, col, geo, mtx) {
    var tgt = this.cur ? this.cur.bins : this.bins, bin = tgt[layer] || (tgt[layer] = { pos: [], nrm: [], col: [] });
    var g = geo.index ? geo.toNonIndexed() : geo;
    if (this.cur) { mtx.elements[12] -= this.cur.pivot[0]; mtx.elements[13] -= this.cur.pivot[1]; mtx.elements[14] -= this.cur.pivot[2]; }
    g.applyMatrix4(mtx);
    if (mtx.determinant() < 0) {                               // a mirrored piece: turn its triangles back to face out
      var pa = g.attributes.position.array, na = g.attributes.normal.array, t, q;
      for (q = 0; q < pa.length; q += 9) for (t = 0; t < 3; t++) { var s1 = pa[q + 3 + t]; pa[q + 3 + t] = pa[q + 6 + t]; pa[q + 6 + t] = s1; s1 = na[q + 3 + t]; na[q + 3 + t] = na[q + 6 + t]; na[q + 6 + t] = s1; }
    }
    var P = g.attributes.position.array, N = g.attributes.normal.array;
    _kc.setHex(col === PAINT ? this.paint : col);
    for (var k = 0; k < P.length; k += 3) { bin.pos.push(P[k], P[k + 1], P[k + 2]); bin.nrm.push(N[k], N[k + 1], N[k + 2]); bin.col.push(_kc.r, _kc.g, _kc.b); }
    if (g !== geo && g.dispose) g.dispose();
    if (geo.dispose) geo.dispose();
    return this;
  };
  Kit.prototype.put = function (layer, col, geo, px, py, pz, rx, ry, rz, sx) {
    _km.makeRotationFromEuler(_ke.set(rx || 0, ry || 0, rz || 0, 'XYZ'));
    if (sx) _km.scale(_ks.set(sx, 1, 1));
    _km.setPosition(px, py, pz);
    return this.take(layer, col, geo, _km);
  };
  Kit.prototype.box = function (layer, col, wid, hgt, dep, px, py, pz, rx, ry, rz) { return this.put(layer, col, new THREE.BoxGeometry(wid, hgt, dep), px, py, pz, rx, ry, rz); };
  /* axis: 'x' an axle, 'z' a barrel or pipe, 'y' upright; r2 tapers the far end */
  Kit.prototype.cyl = function (layer, col, radius, len, px, py, pz, axis, seg, r2) {
    return this.put(layer, col, new THREE.CylinderGeometry(r2 === undefined ? radius : r2, radius, len, seg || 14), px, py, pz, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  };
  Kit.prototype.ball = function (layer, col, sx, sy, sz, px, py, pz, seg) {
    var geo = new THREE.SphereGeometry(1, seg || 16, Math.max(8, (seg || 16) - 4)); geo.scale(sx, sy, sz);
    return this.put(layer, col, geo, px, py, pz);
  };
  /* a ring (or part of one) standing in the plane across `axis`; arc starts at +forward and goes over the top */
  Kit.prototype.ring = function (layer, col, R, tube, px, py, pz, axis, arc, from, seg) {
    var geo = new THREE.TorusGeometry(R, tube, 8, seg || 22, arc || Math.PI * 2);
    if (from) geo.rotateZ(from);
    return this.put(layer, col, geo, px, py, pz, 0, axis === 'x' ? Math.PI / 2 : 0, 0);
  };
  /* a box with its corners rounded: w across, h up, d deep, r the rounding (of the w-h outline and the edges) */
  Kit.prototype.rbox = function (layer, col, w, h, d, r, px, py, pz, rx, ry, rz) {
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    var s = new THREE.Shape(), x = w / 2, y = h / 2, b = Math.min(r * 0.7, d / 2 - 0.001);
    s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
    s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
    var small = Math.max(w, h, d) < 0.45;
    var geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: small ? 1 : 2, curveSegments: small ? 2 : 4 });
    geo.translate(0, 0, -(d - 2 * b) / 2);
    return this.put(layer, col, geo, px, py, pz, rx, ry, rz);
  };
  /* a bar from a to b, w wide and t thick: pillars, tubes of a frame, wipers */
  Kit.prototype.strut = function (layer, col, a, b, w, t, round) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    var geo = round ? new THREE.CylinderGeometry(w / 2, w / 2, len, round) : new THREE.BoxGeometry(w, len, t);
    _kq.setFromUnitVectors(_kv.set(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    _km.makeRotationFromQuaternion(_kq).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return this.take(layer, col, geo, _km);
  };
  /* a flat pane through four corners, given going round */
  Kit.prototype.quad = function (layer, col, a, b, c, d) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]], 3));
    geo.computeVertexNormals();
    return this.take(layer, col, geo, _km.identity());
  };
  /* a side silhouette, [metres along the body (nose is negative), height] going round once, extruded across
     the width. A point may be ['arc', centreZ, centreY, radius] — a wheel arch — or ['q', ctrlZ, ctrlY, z, y],
     a curve. `bevel` rolls the long edges over. */
  Kit.prototype.profile = function (layer, col, pts, wid, cx, bevel) {
    var shape = new THREE.Shape();
    for (var k = 0; k < pts.length; k++) {
      var pt = pts[k];
      if (pt[0] === 'arc') { shape.lineTo(pt[1] + pt[3], pt[2]); shape.absarc(pt[1], pt[2], pt[3], 0, Math.PI, false); }
      else if (pt[0] === 'q') shape.quadraticCurveTo(pt[1], pt[2], pt[3], pt[4]);
      else if (k === 0) shape.moveTo(pt[0], pt[1]);
      else shape.lineTo(pt[0], pt[1]);
    }
    var b = bevel || 0;
    var geo = new THREE.ExtrudeGeometry(shape, b ? { depth: wid - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 10 }
                                                 : { depth: wid, bevelEnabled: false, curveSegments: 10 });
    /* shape x -> vehicle z, shape depth -> vehicle -x: a quarter turn about y */
    return this.put(layer, col, geo, (cx || 0) + wid / 2 - b, 0, 0, 0, -Math.PI / 2, 0);
  };
  /* a headlight beam: a cone of light from the lamp, opening toward the nose, and its pool on the road */
  Kit.prototype.beam = function (px, py, pz, len, spread) {
    this.put('beam', 0, new THREE.ConeGeometry(spread, len, 18, 1, true), px, py - 0.25, pz - len / 2, Math.PI / 2, 0, 0);
    var pool = new THREE.CircleGeometry(spread * 1.05, 26);
    pool.scale(1, 2.1, 1);                                   // a long oval thrown down the road, not a disc
    return this.put('beam', 0, pool, px, 0.07, pz - len * 0.62, -Math.PI / 2, 0, 0);
  };
  /* a wheel is its own turning mesh: where it is, how big, whether it steers, which kind */
  Kit.prototype.wheel = function (px, pz, radius, wid, steer, kind) { this.wheels.push({ x: px, z: pz, r: radius, w: wid, steer: !!steer, kind: kind || 'car' }); return this; };
  /* a painted sign (number plate, destination board): [text, width, height, x, y, z, facing] */
  Kit.prototype.decal = function (kind, text, w, h, px, py, pz, ry) { this.decals.push({ kind: kind, text: text, w: w, h: h, x: px, y: py, z: pz, ry: ry || 0 }); return this; };
  function geoOf(bin, soft) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bin.pos, 3));
    geo.setAttribute('normal', soft ? new THREE.BufferAttribute(smooth(bin.pos, bin.nrm, 0.78), 3) : new THREE.Float32BufferAttribute(bin.nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(bin.col, 3));
    return geo;
  }
  Kit.prototype.finish = function () {
    var def = { layers: {}, subs: [], wheels: this.wheels, decals: this.decals }, name;
    for (name in this.bins) def.layers[name] = geoOf(this.bins[name], name === 'gloss' || name === 'matt');
    this.subs.forEach(function (s) {
      var d = { name: s.name, pivot: s.pivot, meta: s.meta, layers: {} };
      for (var n2 in s.bins) d.layers[n2] = geoOf(s.bins[n2], n2 === 'gloss' || n2 === 'matt');
      def.subs.push(d);
    });
    return def;
  };

  /* ---- wheels: one shared geometry per size and kind, coloured per vertex ---- */
  var wheelGeos = {};
  function wheelGeo(R, W, kind) {
    var key = kind + ':' + R + ':' + W;
    if (wheelGeos[key]) return wheelGeos[key];
    var kit = new Kit(0), i, a, bike = kind === 'bike', rimR = R * (bike ? 0.78 : 0.63), h = W / 2;
    /* the tyre: a cross-section with a flat tread and round shoulders, turned about the axle */
    var sec = [new THREE.Vector2(rimR, -h * 0.82), new THREE.Vector2(rimR + (R - rimR) * 0.35, -h), new THREE.Vector2(R - (R - rimR) * 0.3, -h), new THREE.Vector2(R - 0.012, -h * 0.72),
               new THREE.Vector2(R, -h * 0.5), new THREE.Vector2(R, h * 0.5), new THREE.Vector2(R - 0.012, h * 0.72), new THREE.Vector2(R - (R - rimR) * 0.3, h),
               new THREE.Vector2(rimR + (R - rimR) * 0.35, h), new THREE.Vector2(rimR, h * 0.82)];
    kit.put('wheel', COL.tyre, new THREE.LatheGeometry(sec, bike ? 26 : 22), 0, 0, 0, 0, 0, -Math.PI / 2);
    if (bike) {
      /* a wire wheel: a bright rim, a hub, spokes laced to both sides */
      kit.ring('wheel', COL.rim, rimR - 0.012, 0.016, 0, 0, 0, 'x', 0, 0, 26);
      kit.cyl('wheel', COL.steel, 0.045, W * 1.5, 0, 0, 0, 'x', 10);
      kit.cyl('wheel', COL.dark, 0.11, 0.012, W * 0.55, 0, 0, 'x', 14);                                // the brake disc
      for (i = 0; i < 12; i++) {
        a = i / 12 * Math.PI * 2;
        kit.strut('wheel', COL.rim, [(i % 2 ? 1 : -1) * W * 0.5, Math.sin(a) * 0.04, Math.cos(a) * 0.04], [0, Math.sin(a + 0.35) * (rimR - 0.02), Math.cos(a + 0.35) * (rimR - 0.02)], 0.009, 0.009, 4);
      }
    } else {
      var deep = kind === 'bus';
      kit.cyl('wheel', COL.dark, rimR, W * 0.5, 0, 0, 0, 'x', 20);                                      // the barrel, in shadow
      kit.cyl('wheel', deep ? COL.steel : COL.dark, rimR * 0.98, 0.02, h * (deep ? 0.52 : 0.54), 0, 0, 'x', 20);   // the well behind the spokes
      kit.ring('wheel', COL.rim, rimR - 0.012, 0.014, h * 0.84, 0, 0, 'x', 0, 0, 22);                   // its lip
      if (deep) {
        kit.cyl('wheel', COL.steel, rimR * 0.5, h * 0.4, h * 0.72, 0, 0, 'x', 12, rimR * 0.36);           // a truck hub, standing proud
        for (i = 0; i < 8; i++) { a = i / 8 * Math.PI * 2; kit.cyl('wheel', COL.dark, 0.022, 0.03, h * 0.56, Math.sin(a) * rimR * 0.72, Math.cos(a) * rimR * 0.72, 'x', 6); }
      } else {
        for (i = 0; i < 5; i++) {                                                                        // five spokes
          a = i / 5 * Math.PI * 2;
          kit.strut('wheel', COL.rim, [h * 0.78, Math.sin(a) * rimR * 0.14, Math.cos(a) * rimR * 0.14], [h * 0.7, Math.sin(a) * rimR * 0.96, Math.cos(a) * rimR * 0.96], 0.035, rimR * 0.34);
        }
        kit.cyl('wheel', COL.chrome, rimR * 0.24, 0.04, h * 0.84, 0, 0, 'x', 10);                        // the cap
      }
    }
    var bin = kit.bins.wheel, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bin.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(smooth(bin.pos, bin.nrm, 0.7), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(bin.col, 3));
    return (wheelGeos[key] = geo);
  }
  /* ---- signs: a number plate, a destination board ---- */
  var signTex = {};
  function signTexture(kind, text) {
    var key = kind + ':' + text;
    if (signTex[key]) return signTex[key];
    if (typeof document === 'undefined') return (signTex[key] = { tex: null, mat: new THREE.MeshBasicMaterial({ color: kind === 'board' ? 0x141210 : 0xf1efe6 }) });
    var board = kind === 'board', c = document.createElement('canvas'); c.width = board ? 256 : 168; c.height = board ? 40 : 40;
    var g = c.getContext('2d');
    g.fillStyle = board ? '#141210' : '#f1efe6'; g.fillRect(0, 0, c.width, c.height);
    if (!board) { g.strokeStyle = '#15171a'; g.lineWidth = 3; g.strokeRect(2, 2, c.width - 4, c.height - 4); }
    g.fillStyle = board ? '#ffb536' : '#15171a';
    g.font = (board ? 'bold 26px ' : 'bold 22px ') + 'Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 1);
    var tex = new THREE.CanvasTexture(c);
    return (signTex[key] = { tex: tex, mat: new THREE.MeshBasicMaterial({ map: tex }) });
  }
  function plateText(seed) {
    var L = 'ABCDEFGHJKLMNPRSTUVWXYZ', a = (seed * 2654435761) >>> 0, n = function (m) { a = (a * 1664525 + 1013904223) >>> 0; return a % m; };
    return 'US ' + (10 + n(89)) + ' ' + L.charAt(n(L.length)) + L.charAt(n(L.length)) + ' ' + (1000 + n(8999));
  }
  /* ---- the sedan ---- */
  function buildCar(kit) {
    var sx, i;
    /* nose and tail: silhouettes with the wheel arches cut in, rolled over at the shoulders. Between them
       the side of the car is its DOORS (below), so an open door shows the cabin. */
    kit.profile('gloss', PAINT, [[-0.86, 0.34], ['arc', -1.4, 0.34, 0.45], [-2.08, 0.34], ['q', -2.2, 0.36, -2.2, 0.6], [-2.2, 0.76], ['q', -2.17, 0.9, -1.95, 0.93],
                                 ['q', -1.5, 1.0, -0.95, 1.03], [-0.86, 1.03]], 1.86, 0, 0.07);
    kit.profile('gloss', PAINT, [[2.08, 0.34], ['arc', 1.4, 0.34, 0.45], [0.92, 0.34], [0.92, 1.03], [1.5, 1.03], ['q', 2.0, 1.04, 2.14, 0.96], ['q', 2.21, 0.9, 2.2, 0.74],
                                 [2.2, 0.56], ['q', 2.2, 0.36, 2.08, 0.34]], 1.86, 0, 0.07);
    kit.box('matt', COL.dark, 1.34, 0.5, 0.94, 0, 0.6, -1.4).box('matt', COL.dark, 1.34, 0.5, 0.94, 0, 0.6, 1.4);         // behind the arches: not a tunnel
    kit.box('matt', COL.floor, 1.74, 0.07, 1.86, 0, 0.335, 0.03);                                                           // the floor
    kit.box('matt', COL.trim, 0.24, 0.16, 1.5, 0, 0.44, 0.1);                                                               // the tunnel
    /* the roof, and what holds it up */
    kit.profile('gloss', PAINT, [[-0.4, 1.4], ['q', -0.37, 1.455, -0.25, 1.47], ['q', 0.35, 1.51, 0.92, 1.465], ['q', 1.02, 1.45, 1.04, 1.4]], 1.44, 0, 0.06);
    for (sx = -1; sx <= 1; sx += 2) {
      kit.strut('gloss', PAINT, [sx * 0.8, 1.02, -0.93], [sx * 0.69, 1.42, -0.35], 0.05, 0.08);                             // A pillar
      kit.strut('matt', COL.trim, [sx * 0.845, 1.02, 0.21], [sx * 0.705, 1.42, 0.21], 0.04, 0.09);                          // B pillar
      kit.strut('gloss', PAINT, [sx * 0.8, 1.02, 1.47], [sx * 0.69, 1.42, 0.98], 0.05, 0.17);                               // C pillar
      kit.strut('gloss', PAINT, [sx * 0.692, 1.425, -0.36], [sx * 0.692, 1.425, 0.99], 0.05, 0.05);                         // the rail over the doors
      kit.quad('glass', 0, [sx * 0.842, 1.04, 0.95], [sx * 0.815, 1.04, 1.38], [sx * 0.71, 1.39, 1.0], [sx * 0.705, 1.4, 0.95]);   // the quarter light
      kit.ring('matt', COL.trim, 0.455, 0.024, sx * 0.925, 0.34, -1.4, 'x', Math.PI).ring('matt', COL.trim, 0.455, 0.024, sx * 0.925, 0.34, 1.4, 'x', Math.PI);   // arch lips
      kit.rbox('gloss', PAINT, 1.78, 0.12, 0.1, 0.03, sx * 0.875, 0.4, 0.03, 0, Math.PI / 2, 0);                            // sill
      /* lamps */
      kit.rbox('gloss', COL.chrome, 0.44, 0.18, 0.06, 0.04, sx * 0.64, 0.76, -2.18).rbox('lamp', COL.head, 0.37, 0.12, 0.03, 0.03, sx * 0.64, 0.76, -2.213);
      kit.rbox('lamp', COL.amber, 0.1, 0.1, 0.03, 0.02, sx * 0.885, 0.76, -2.195);
      kit.rbox('lamp', COL.tail, 0.36, 0.15, 0.03, 0.03, sx * 0.7, 0.8, 2.203).rbox('lamp', COL.white, 0.1, 0.07, 0.03, 0.02, sx * 0.44, 0.8, 2.203);
      kit.strut('matt', COL.dark, [sx * 0.1 + 0.05, 1.045, -0.95], [sx * 0.1 + 0.42, 1.2, -0.72], 0.02, 0.012);              // wiper
    }
    kit.quad('glass', 0, [-0.78, 1.035, -0.93], [0.78, 1.035, -0.93], [0.67, 1.41, -0.37], [-0.67, 1.41, -0.37]);          // windscreen
    kit.quad('glass', 0, [0.78, 1.035, 1.47], [-0.78, 1.035, 1.47], [-0.67, 1.41, 0.99], [0.67, 1.41, 0.99]);              // rear screen
    kit.box('matt', COL.dark, 1.6, 0.03, 0.1, 0, 1.035, -0.92);                                                             // scuttle
    kit.box('matt', COL.dark, 0.8, 0.16, 0.04, 0, 0.76, -2.2);                                                              // grille
    for (i = 0; i < 4; i++) kit.box('gloss', COL.chrome, 0.8, 0.012, 0.03, 0, 0.7 + i * 0.04, -2.212);
    kit.rbox('matt', COL.trim, 1.92, 0.2, 0.18, 0.06, 0, 0.47, -2.17).rbox('matt', COL.trim, 1.92, 0.2, 0.18, 0.06, 0, 0.47, 2.17);   // bumpers
    kit.box('gloss', COL.chrome, 1.5, 0.025, 0.02, 0, 0.53, -2.262).box('gloss', COL.chrome, 1.5, 0.025, 0.02, 0, 0.53, 2.262);
    kit.box('matt', COL.dark, 1.0, 0.07, 0.03, 0, 0.42, -2.255);                                                            // lower intake
    kit.box('matt', COL.dark, 1.3, 0.008, 0.012, 0, 0.95, 2.19);                                                            // boot shut line
    kit.cyl('gloss', COL.chrome, 0.04, 0.22, 0.55, 0.3, 2.17, 'z', 10);                                                     // exhaust
    kit.strut('matt', COL.dark, [-0.5, 1.47, 0.82], [-0.5, 1.82, 0.96], 0.012, 0.012, 4);                                   // aerial
    /* the cabin: seats, a dashboard, a wheel on the right */
    for (sx = -1; sx <= 1; sx += 2) {
      kit.rbox('matt', COL.seat, 0.46, 0.12, 0.5, 0.04, sx * 0.42, 0.43, -0.27);
      kit.rbox('matt', COL.seat, 0.44, 0.56, 0.1, 0.04, sx * 0.42, 0.74, 0.03, 0.22, 0, 0).rbox('matt', COL.seatD, 0.24, 0.15, 0.08, 0.03, sx * 0.42, 1.1, 0.11, 0.22, 0, 0);
    }
    kit.rbox('matt', COL.seat, 1.36, 0.12, 0.5, 0.04, 0, 0.43, 0.66).rbox('matt', COL.seat, 1.36, 0.52, 0.09, 0.04, 0, 0.73, 0.9, 0.16, 0, 0);
    kit.rbox('matt', COL.trim, 1.56, 0.22, 0.3, 0.06, 0, 0.92, -0.8);                                                       // dashboard
    kit.put('matt', COL.dark, new THREE.TorusGeometry(0.16, 0.018, 6, 18), 0.42, 0.98, -0.6, -0.35, 0, 0);                  // steering wheel
    kit.strut('matt', COL.dark, [0.42, 0.98, -0.6], [0.42, 0.9, -0.78], 0.04, 0.04, 6);
    /* four doors, each hung on its front edge */
    for (sx = -1; sx <= 1; sx += 2) {
      kit.sub('door', sx * 0.93, 0.74, -0.86, { side: sx, swing: 1.08, seats: [sx > 0 ? 0 : 1] });
      kit.rbox('gloss', PAINT, 1.05, 0.6, 0.07, 0.05, sx * 0.9, 0.735, -0.335, 0, Math.PI / 2, 0);
      kit.box('matt', COL.seatD, 0.02, 0.5, 0.96, sx * 0.862, 0.72, -0.335);
      kit.box('gloss', COL.chrome, 0.018, 0.022, 1.02, sx * 0.936, 1.04, -0.335);
      kit.quad('glass', 0, [sx * 0.845, 1.045, -0.82], [sx * 0.845, 1.045, 0.17], [sx * 0.705, 1.405, 0.17], [sx * 0.705, 1.405, -0.3]);
      kit.rbox('gloss', COL.chrome, 0.14, 0.035, 0.03, 0.012, sx * 0.94, 0.9, 0.02, 0, Math.PI / 2, 0);
      kit.rbox('gloss', PAINT, 0.1, 0.11, 0.17, 0.03, sx * 1.03, 1.08, -0.74).strut('matt', COL.dark, [sx * 0.92, 1.05, -0.76], [sx * 0.98, 1.07, -0.75], 0.04, 0.03);    // mirror
      kit.box('gloss', COL.mirror, 0.085, 0.085, 0.01, sx * 1.03, 1.08, -0.652);
      kit.end();
      kit.sub('door', sx * 0.93, 0.74, 0.225, { side: sx, swing: 1.02, seats: [sx > 0 ? 2 : 3] });
      kit.rbox('gloss', PAINT, 0.69, 0.6, 0.07, 0.05, sx * 0.9, 0.735, 0.572, 0, Math.PI / 2, 0);
      kit.box('matt', COL.seatD, 0.02, 0.5, 0.6, sx * 0.862, 0.72, 0.572);
      kit.box('gloss', COL.chrome, 0.018, 0.022, 0.66, sx * 0.936, 1.04, 0.572);
      kit.quad('glass', 0, [sx * 0.845, 1.045, 0.26], [sx * 0.845, 1.045, 0.905], [sx * 0.705, 1.405, 0.905], [sx * 0.705, 1.405, 0.26]);
      kit.rbox('gloss', COL.chrome, 0.14, 0.035, 0.03, 0.012, sx * 0.94, 0.9, 0.8, 0, Math.PI / 2, 0);
      kit.end();
    }
    kit.decal('plate', plateText(kit.paint), 0.46, 0.115, 0, 0.47, -2.266, Math.PI).decal('plate', plateText(kit.paint), 0.46, 0.115, 0, 0.62, 2.215, 0);
    kit.wheel(0.84, -1.4, 0.36, 0.24, true).wheel(-0.84, -1.4, 0.36, 0.24, true).wheel(0.84, 1.4, 0.36, 0.24).wheel(-0.84, 1.4, 0.36, 0.24);
  }
  /* ---- the motorbike: tubes, a tank, an engine with fins, wire wheels ---- */
  function buildBike(kit) {
    var sx, i;
    var head = [0, 0.98, -0.5], axF = [0, 0.34, -0.74], axR = [0, 0.34, 0.74];
    /* frame */
    kit.strut('matt', COL.trim, head, [0, 0.4, -0.22], 0.05, 0.05, 8).strut('matt', COL.trim, head, [0, 0.8, 0.22], 0.055, 0.055, 8);
    kit.strut('matt', COL.trim, [0, 0.8, 0.22], [0, 0.8, 0.9], 0.04, 0.04, 8).strut('matt', COL.trim, [0, 0.4, -0.22], [0, 0.34, 0.22], 0.045, 0.045, 8);
    kit.strut('matt', COL.trim, [0, 0.34, 0.22], [0, 0.8, 0.26], 0.045, 0.045, 8);
    for (sx = -1; sx <= 1; sx += 2) {
      kit.strut('matt', COL.trim, [sx * 0.09, 0.4, 0.22], [sx * 0.09, 0.34, 0.74], 0.04, 0.04, 6);                           // swing arm
      kit.strut('gloss', COL.chrome, [sx * 0.12, 0.76, 0.46], [sx * 0.11, 0.38, 0.7], 0.035, 0.035, 8);                      // rear shock
      kit.strut('matt', COL.dark, [sx * 0.12, 0.66, 0.52], [sx * 0.113, 0.5, 0.62], 0.055, 0.055, 8);
      kit.strut('gloss', COL.chrome, [sx * 0.095, 1.04, -0.56], [sx * 0.095, 0.34, -0.74], 0.04, 0.04, 8);                   // forks
      kit.strut('matt', COL.dark, [sx * 0.095, 0.62, -0.668], [sx * 0.095, 0.34, -0.74], 0.055, 0.055, 8);
      kit.cyl('matt', COL.dark, 0.022, 0.1, sx * 0.24, 0.32, 0.18, 'x', 6);                                                   // foot pegs
      kit.cyl('matt', COL.dark, 0.022, 0.09, sx * 0.24, 0.42, 0.55, 'x', 6);
      kit.cyl('gloss', COL.chrome, 0.11, 0.05, sx * 0.14, 0.42, 0.0, 'x', 14);                                                // engine covers
      kit.cyl('matt', COL.dark, 0.024, 0.12, sx * 0.34, 1.08, -0.62, 'x', 8);                                                 // grips
      kit.strut('matt', COL.dark, [sx * 0.3, 1.09, -0.64], [sx * 0.2, 1.1, -0.7], 0.012, 0.012, 4);                           // levers
      kit.strut('gloss', COL.chrome, [sx * 0.24, 1.08, -0.62], [sx * 0.3, 1.26, -0.6], 0.012, 0.012, 4);                      // mirror stalks
      kit.put('gloss', COL.chrome, new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12), sx * 0.3, 1.28, -0.6, Math.PI / 2, 0, 0);
      kit.ball('lamp', COL.amber, 0.03, 0.03, 0.03, sx * 0.16, 0.92, -0.82, 8).ball('lamp', COL.amber, 0.028, 0.028, 0.028, sx * 0.14, 0.8, 0.94, 8);
    }
    kit.cyl('matt', COL.trim, 0.04, 0.2, head[0], head[1] + 0.03, head[2] - 0.03, 'y', 8);                                    // steering head
    kit.rbox('matt', COL.trim, 0.24, 0.03, 0.05, 0.01, 0, 1.04, -0.56).rbox('matt', COL.trim, 0.24, 0.03, 0.05, 0.01, 0, 0.9, -0.596);   // yokes
    /* engine */
    kit.rbox('matt', COL.engine, 0.24, 0.24, 0.36, 0.05, 0, 0.42, 0.0);
    for (i = 0; i < 6; i++) kit.put('matt', i % 2 ? COL.steel : COL.engine, new THREE.BoxGeometry(0.2, 0.014, 0.2), 0, 0.57 + i * 0.03, -0.085 - i * 0.012, -0.32, 0, 0);
    kit.put('matt', COL.engine, new THREE.BoxGeometry(0.17, 0.05, 0.17), 0, 0.76, -0.16, -0.32, 0, 0);
    kit.cyl('matt', COL.dark, 0.07, 0.1, 0, 0.6, 0.12, 'x', 10);                                                              // carburettor and filter
    /* exhaust: down from the head, back under the engine, a silencer */
    kit.strut('gloss', COL.chrome, [0.07, 0.68, -0.2], [0.13, 0.36, -0.2], 0.045, 0.045, 8).strut('gloss', COL.chrome, [0.13, 0.36, -0.2], [0.17, 0.33, 0.2], 0.045, 0.045, 8);
    kit.cyl('gloss', COL.chrome, 0.06, 0.62, 0.18, 0.36, 0.56, 'z', 12, 0.05).cyl('matt', COL.dark, 0.035, 0.03, 0.18, 0.36, 0.88, 'z', 8);
    /* tank, saddle, guards */
    kit.ball('gloss', PAINT, 0.165, 0.125, 0.3, 0, 0.86, -0.22, 18).rbox('gloss', COL.chrome, 0.07, 0.02, 0.07, 0.008, 0, 0.985, -0.26);
    kit.rbox('matt', COL.seat, 0.28, 0.09, 0.76, 0.04, 0, 0.84, 0.43).rbox('matt', COL.seatD, 0.24, 0.05, 0.3, 0.02, 0, 0.885, 0.62);
    kit.rbox('gloss', PAINT, 0.2, 0.14, 0.3, 0.04, 0, 0.76, 0.86);                                                            // tail piece
    kit.ring('gloss', PAINT, 0.385, 0.03, 0, 0.34, -0.74, 'x', 1.9, 0.45).ring('gloss', PAINT, 0.39, 0.032, 0, 0.34, 0.74, 'x', 1.5, 1.35);   // mudguards
    kit.strut('matt', COL.trim, [-0.11, 0.42, 0.24], [-0.11, 0.36, 0.72], 0.02, 0.09);                                        // chain guard
    kit.strut('matt', COL.dark, [-0.13, 0.36, 0.1], [-0.3, 0.05, 0.22], 0.02, 0.02, 4);                                       // side stand
    /* bars — where they always were, because hands are measured to them */
    kit.cyl('gloss', COL.chrome, 0.016, 0.72, 0, 1.08, -0.62, 'x', 8);
    kit.strut('gloss', COL.chrome, [0, 1.04, -0.56], [0, 1.08, -0.62], 0.03, 0.03, 6);
    kit.rbox('matt', COL.dark, 0.16, 0.07, 0.06, 0.02, 0, 1.11, -0.66);                                                       // the clocks
    kit.cyl('gloss', COL.chrome, 0.105, 0.11, 0, 0.94, -0.82, 'z', 16, 0.07).cyl('lamp', COL.head, 0.09, 0.02, 0, 0.94, -0.885, 'z', 16);   // headlamp
    kit.rbox('lamp', COL.tail, 0.14, 0.07, 0.04, 0.02, 0, 0.78, 1.02);
    kit.decal('plate', plateText(kit.paint + 7), 0.2, 0.1, 0, 0.62, 1.07, 0);
    kit.strut('matt', COL.trim, [0, 0.74, 0.98], [0, 0.6, 1.06], 0.03, 0.02);
    kit.wheel(0, -0.74, 0.34, 0.11, false, 'bike').wheel(0, 0.74, 0.34, 0.13, false, 'bike');
  }
  /* ---- the auto rickshaw: the same shape it was, in the new paint, on wheels that turn ---- */
  function buildAuto(kit) {
    var sx;
    kit.rbox('gloss', COL.green, 1.4, 0.55, 1.65, 0.08, 0, 0.6, 0.55).rbox('gloss', COL.green, 0.9, 0.5, 0.9, 0.12, 0, 0.56, -0.74);
    kit.rbox('gloss', COL.yellow, 0.82, 0.1, 0.72, 0.04, 0, 0.86, -0.8);
    kit.put('glass', 0, new THREE.BoxGeometry(1.18, 0.74, 0.02), 0, 1.28, -0.5, -0.24, 0, 0);
    kit.rbox('gloss', COL.yellow, 1.44, 0.1, 2.05, 0.045, 0, 1.76, 0.25).rbox('gloss', COL.yellow, 1.4, 0.9, 0.06, 0.02, 0, 1.28, 1.36);
    kit.box('glass', 0, 0.8, 0.34, 0.02, 0, 1.42, 1.4);
    for (sx = -1; sx <= 1; sx += 2) {
      kit.box('matt', COL.trim, 0.06, 0.95, 0.06, sx * 0.67, 1.26, -0.34);
      kit.rbox('lamp', COL.tail, 0.16, 0.1, 0.04, 0.02, sx * 0.55, 0.72, 1.395);
      kit.ball('lamp', COL.amber, 0.035, 0.035, 0.035, sx * 0.4, 0.86, -1.17, 8);
    }
    kit.rbox('matt', COL.seat, 1.2, 0.12, 0.5, 0.04, 0, 0.92, 0.95).rbox('matt', COL.seat, 1.2, 0.5, 0.1, 0.04, 0, 1.16, 1.26).rbox('matt', COL.seat, 0.5, 0.1, 0.4, 0.03, 0, 0.9, -0.1);
    kit.cyl('gloss', COL.chrome, 0.018, 0.6, 0, 1.05, -0.5, 'x', 8);                                                          // bars
    kit.strut('matt', COL.trim, [0, 1.05, -0.5], [0, 0.8, -0.86], 0.04, 0.04, 6);
    kit.cyl('gloss', COL.chrome, 0.1, 0.08, 0, 0.7, -1.17, 'z', 14, 0.07).cyl('lamp', COL.head, 0.085, 0.02, 0, 0.7, -1.215, 'z', 14);
    kit.rbox('matt', COL.trim, 1.44, 0.08, 0.1, 0.03, 0, 0.36, 1.38);
    kit.ring('gloss', COL.green, 0.3, 0.03, 0, 0.26, -1.05, 'x', 1.9, 0.5);
    kit.decal('plate', plateText(4421), 0.36, 0.1, 0, 0.5, 1.435, 0);
    kit.wheel(0, -1.05, 0.26, 0.13, true).wheel(0.6, 0.85, 0.26, 0.16).wheel(-0.6, 0.85, 0.26, 0.16);
  }
  /* ---- the bus ---- */
  function buildBus(kit) {
    var sx, z, i;
    /* body: two skins from just behind the front door to the tail with the arches cut in, a tail panel, the
       nose, the wall across from the door — a shell, because the windows show what is inside */
    var skin = [[5.1, 0.6], ['arc', 3.45, 0.6, 0.64], ['arc', -3.4, 0.6, 0.64], [-4.06, 0.6], [-4.06, 1.5], [5.2, 1.5], [5.2, 0.9], ['q', 5.2, 0.62, 5.1, 0.6]];
    kit.profile('gloss', PAINT, skin, 0.08, 1.24, 0.025).profile('gloss', PAINT, skin, 0.08, -1.24, 0.025);
    kit.rbox('gloss', PAINT, 2.52, 0.92, 0.1, 0.04, 0, 1.05, 5.15);
    kit.rbox('gloss', PAINT, 2.56, 0.9, 0.3, 0.09, 0, 1.05, -5.1).rbox('gloss', PAINT, 0.08, 0.9, 0.96, 0.03, 1.24, 1.05, -4.52);
    for (sx = -1; sx <= 1; sx += 2) {                                                                                           // wheel housings, standing in the cabin
      kit.box('matt', COL.dark, 0.5, 0.72, 1.2, sx * 0.96, 1.0, -3.36).box('matt', COL.dark, 0.62, 0.72, 1.36, sx * 0.9, 1.0, 3.45);
    }
    kit.box('matt', COL.floor, 2.4, 0.08, 10.1, 0, 0.66, 0.0);                                                                // floor
    kit.box('matt', COL.trim, 0.9, 0.2, 0.9, -0.8, 0.5, -4.52);                                                               // the step
    kit.box('matt', 0x8d9399, 0.03, 0.78, 9.0, 1.185, 1.1, 0.55).box('matt', 0x8d9399, 0.03, 0.78, 9.0, -1.185, 1.1, 0.55).box('matt', 0xb9bdc2, 2.3, 0.03, 9.9, 0, 2.69, 0.0);   // side lining, ceiling
    /* roof */
    kit.profile('gloss', COL.white, [[-5.22, 2.7], ['q', -5.2, 2.9, -4.85, 2.92], [4.9, 2.92], ['q', 5.2, 2.9, 5.2, 2.7]], 2.52, 0, 0.12);
    kit.rbox('gloss', COL.white, 1.4, 0.22, 2.2, 0.08, 0, 3.03, 1.5).rbox('matt', COL.trim, 1.1, 0.03, 1.6, 0.01, 0, 3.145, 1.5);     // AC unit
    kit.rbox('gloss', COL.white, 0.7, 0.06, 0.7, 0.03, 0, 2.95, -2.2);                                                        // roof hatch
    /* posts and panes down both sides; the door bay is left open on the kerb side */
    for (sx = -1; sx <= 1; sx += 2) {
      for (z = -4.0; z <= 5.01; z += 1.0) kit.box('gloss', PAINT, 0.07, 1.22, 0.1, sx * 1.25, 2.1, z);
      for (z = -4.0; z <= 4.01; z += 1.0) kit.quad('glass', 0, [sx * 1.262, 1.56, z + 0.05], [sx * 1.262, 1.56, z + 0.95], [sx * 1.262, 2.62, z + 0.95], [sx * 1.262, 2.62, z + 0.05]);
      kit.box('gloss', PAINT, 0.07, 0.1, 9.2, sx * 1.25, 2.66, 0.5).box('gloss', COL.white, 0.02, 0.12, 9.1, sx * 1.283, 1.42, 0.55);   // cant rail, waist stripe
      kit.strut('gloss', PAINT, [sx * 1.22, 1.5, -5.22], [sx * 1.22, 2.72, -4.98], 0.1, 0.1);                                 // corner posts
      kit.rbox('gloss', COL.chrome, 0.4, 0.22, 0.06, 0.05, sx * 0.9, 1.05, -5.25).rbox('lamp', COL.head, 0.32, 0.15, 0.03, 0.04, sx * 0.9, 1.05, -5.283);
      kit.rbox('lamp', COL.amber, 0.12, 0.12, 0.03, 0.03, sx * 1.14, 1.05, -5.27);
      kit.rbox('lamp', COL.tail, 0.26, 0.3, 0.03, 0.04, sx * 1.0, 1.1, 5.21).rbox('lamp', COL.amber, 0.26, 0.1, 0.03, 0.03, sx * 1.0, 1.32, 5.21);
      kit.strut('matt', COL.trim, [sx * 1.22, 2.5, -5.0], [sx * 1.42, 2.36, -5.2], 0.03, 0.03, 6).rbox('matt', COL.trim, 0.16, 0.34, 0.06, 0.03, sx * 1.42, 2.2, -5.2);   // mirrors
      kit.box('gloss', COL.mirror, 0.13, 0.3, 0.01, sx * 1.42, 2.2, -5.168);
      kit.strut('matt', COL.dark, [sx * 0.25, 1.56, -5.26], [sx * 0.85, 2.1, -5.16], 0.025, 0.015);                           // wipers
      kit.ring('matt', COL.trim, 0.645, 0.03, sx * 1.275, 0.6, -3.4, 'x', Math.PI).ring('matt', COL.trim, 0.645, 0.03, sx * 1.275, 0.6, 3.45, 'x', Math.PI);
      for (i = 0; i < 4; i++) kit.ball('lamp', COL.amber, 0.03, 0.03, 0.03, sx * 1.285, 1.3, -2 + i * 2.2, 6);                // marker lamps
    }
    kit.box('gloss', PAINT, 0.07, 1.22, 0.1, 1.25, 2.1, -5.0);                                                                // the driver's side has a post where the door is
    kit.quad('glass', 0, [1.262, 1.56, -4.95], [1.262, 1.56, -4.05], [1.262, 2.62, -4.05], [1.262, 2.62, -4.95]);
    kit.quad('glass', 0, [-1.17, 1.52, -5.245], [1.17, 1.52, -5.245], [1.17, 2.7, -5.0], [-1.17, 2.7, -5.0]);                 // windscreen
    kit.rbox('gloss', PAINT, 2.5, 1.22, 0.08, 0.03, 0, 2.1, 5.16).box('glass', 0, 1.8, 0.7, 0.02, 0, 2.2, 5.21);              // tail wall and its window
    kit.box('matt', COL.dark, 1.5, 0.36, 0.03, 0, 1.0, 5.215);                                                                // engine grille
    for (i = 0; i < 5; i++) kit.box('matt', COL.trim, 1.46, 0.02, 0.02, 0, 0.86 + i * 0.07, 5.235);
    kit.rbox('matt', COL.trim, 2.62, 0.3, 0.18, 0.07, 0, 0.74, -5.2).rbox('matt', COL.trim, 2.62, 0.3, 0.18, 0.07, 0, 0.74, 5.16);    // bumpers
    kit.box('matt', COL.dark, 1.3, 0.2, 0.03, 0, 1.05, -5.262);                                                               // grille between the lamps
    /* inside: rows of seats, a driver's chair and a big flat wheel, grab poles */
    for (z = -2.4; z <= 2.41; z += 1.2) for (sx = -1; sx <= 1; sx += 2) {
      kit.rbox('matt', COL.cloth, 0.92, 0.1, 0.44, 0.04, sx * 0.72, 1.02, z + 0.05).rbox('matt', COL.cloth, 0.92, 0.56, 0.08, 0.04, sx * 0.72, 1.36, z + 0.3, 0.1, 0, 0);
      kit.box('matt', COL.trim, 0.06, 0.3, 0.3, sx * 0.72, 0.84, z + 0.05);
    }
    kit.rbox('matt', COL.cloth, 2.2, 0.1, 0.46, 0.04, 0, 1.36, 4.72).rbox('matt', COL.cloth, 2.2, 0.56, 0.08, 0.04, 0, 1.7, 4.98, 0.1, 0, 0).box('matt', COL.trim, 2.3, 0.62, 0.7, 0, 1.0, 4.72);   // the bench over the engine
    kit.rbox('matt', COL.seat, 0.5, 0.1, 0.46, 0.04, 0.75, 1.02, -4.05).rbox('matt', COL.seat, 0.5, 0.6, 0.08, 0.04, 0.75, 1.38, -3.8, 0.1, 0, 0);
    kit.put('matt', COL.dark, new THREE.TorusGeometry(0.24, 0.022, 6, 20), 0.75, 1.36, -4.62, -1.05, 0, 0);
    kit.strut('matt', COL.dark, [0.75, 1.36, -4.62], [0.75, 1.0, -4.85], 0.05, 0.05, 6).rbox('matt', COL.trim, 2.3, 0.3, 0.3, 0.08, 0, 1.36, -4.98);
    kit.cyl('gloss', COL.chrome, 0.02, 1.95, -0.3, 1.7, -4.0, 'y', 6).cyl('gloss', COL.chrome, 0.02, 1.95, -0.3, 1.7, 1.0, 'y', 6).cyl('gloss', COL.chrome, 0.018, 8.4, 0, 2.6, 0.2, 'z', 6);
    /* the front door: two glazed leaves that slide back along the side */
    kit.sub('door', -1.27, 1.6, -4.52, { slide: [-0.07, 0, 0.98], seats: 'all' });
    kit.box('matt', COL.trim, 0.05, 2.0, 0.05, -1.27, 1.62, -4.98).box('matt', COL.trim, 0.05, 2.0, 0.05, -1.27, 1.62, -4.52).box('matt', COL.trim, 0.05, 2.0, 0.05, -1.27, 1.62, -4.06);
    kit.box('matt', COL.trim, 0.05, 0.06, 0.96, -1.27, 2.62, -4.52).box('matt', COL.trim, 0.05, 0.34, 0.96, -1.27, 0.8, -4.52);
    kit.quad('glass', 0, [-1.272, 0.98, -4.96], [-1.272, 0.98, -4.54], [-1.272, 2.58, -4.54], [-1.272, 2.58, -4.96]);
    kit.quad('glass', 0, [-1.272, 0.98, -4.5], [-1.272, 0.98, -4.08], [-1.272, 2.58, -4.08], [-1.272, 2.58, -4.5]);
    kit.end();
    kit.decal('board', 'SECTOR 7 CENTRAL', 1.5, 0.22, 0, 2.79, -5.14, Math.PI);
    kit.decal('plate', plateText(kit.paint + 3), 0.5, 0.125, 0, 0.76, -5.295, Math.PI).decal('plate', plateText(kit.paint + 3), 0.5, 0.125, 0, 0.76, 5.255, 0);
    kit.wheel(1.1, -3.4, 0.52, 0.3, true, 'bus').wheel(-1.1, -3.4, 0.52, 0.3, true, 'bus').wheel(1.02, 3.45, 0.52, 0.5, false, 'bus').wheel(-1.02, 3.45, 0.52, 0.5, false, 'bus');
  }
  /* ---- the tank: as it was (armour is not shiny) ---- */
  function buildTank(kit) {
    var wz;
    kit.box('matt', COL.track, 0.62, 0.9, 6.2, 1.39, 0.45, 0).box('matt', COL.track, 0.62, 0.9, 6.2, -1.39, 0.45, 0);        // tracks
    for (wz = -2.4; wz <= 2.41; wz += 0.96) kit.cyl('matt', COL.oliveD, 0.36, 0.68, 1.39, 0.4, wz, 'x', 12).cyl('matt', COL.oliveD, 0.36, 0.68, -1.39, 0.4, wz, 'x', 12);
    kit.box('matt', COL.olive, 2.2, 0.8, 5.9, 0, 1.0, 0);                                                                     // hull
    kit.box('matt', COL.olive, 3.4, 0.1, 6.0, 0, 0.96, 0.05);                                                                 // track guards
    kit.box('matt', COL.olive, 2.2, 0.52, 1.3, 0, 1.22, -2.62, 0.52);                                                         // glacis
    kit.box('matt', COL.oliveD, 2.0, 0.3, 1.5, 0, 1.5, 2.1);                                                                  // engine deck
    kit.box('matt', COL.trim, 0.5, 0.04, 1.1, 0.5, 1.67, 2.1).box('matt', COL.trim, 0.5, 0.04, 1.1, -0.5, 1.67, 2.1);         // grilles
    kit.box('matt', COL.olive, 2.0, 0.7, 2.5, 0, 1.78, 0.1);                                                                  // turret
    kit.box('matt', COL.olive, 1.6, 0.56, 0.7, 0, 1.76, -1.4, 0.35);                                                          // turret nose
    kit.box('matt', COL.oliveD, 0.9, 0.5, 0.6, 0, 1.8, 1.55);                                                                 // bustle
    kit.cyl('matt', COL.oliveD, 0.11, 3.7, 0, 1.84, -3.3, 'z', 12);                                                           // gun
    kit.cyl('matt', COL.trim, 0.17, 0.36, 0, 1.84, -5.0, 'z', 12);                                                            // muzzle brake
    kit.cyl('matt', COL.oliveD, 0.2, 0.5, 0, 1.84, -1.85, 'z', 10);                                                           // mantlet
    kit.cyl('matt', COL.oliveD, 0.36, 0.12, 0.5, 2.19, 0.45, 'y', 14);                                                        // commander's hatch
    kit.cyl('matt', COL.oliveD, 0.3, 0.1, -0.5, 2.18, -0.2, 'y', 14);
    kit.box('matt', COL.trim, 0.08, 0.14, 0.7, 0.5, 2.36, 0.2);                                                               // roof MG
    kit.cyl('matt', COL.trim, 0.015, 1.6, -0.8, 2.9, 1.1, 'y', 6);                                                            // aerial
    kit.box('lamp', COL.head, 0.2, 0.14, 0.05, 0.85, 1.2, -3.05).box('lamp', COL.head, 0.2, 0.14, 0.05, -0.85, 1.2, -3.05);
    kit.box('lamp', COL.tail, 0.2, 0.1, 0.05, 0.9, 1.2, 2.98).box('lamp', COL.tail, 0.2, 0.1, 0.05, -0.9, 1.2, 2.98);
    kit.cyl('matt', COL.trim, 0.09, 0.5, 0.95, 1.5, 2.95, 'z', 8).cyl('matt', COL.trim, 0.09, 0.5, -0.95, 1.5, 2.95, 'z', 8);  // exhausts
  }
  /* built once per type and colour; every vehicle that has it shares the geometry */
  var modelDefs = {}, signGeos = {};
  function defOf(type, color) {
    var key = type + ':' + color, def = modelDefs[key];
    if (def) return def;
    M();
    var kit = new Kit(color);
    if (type === 'car') buildCar(kit);
    else if (type === 'bike') buildBike(kit);
    else if (type === 'auto') buildAuto(kit);
    else if (type === 'bus') buildBus(kit);
    else buildTank(kit);
    var lamps = { car: [[0.64, 0.76, -2.2], [-0.64, 0.76, -2.2]], bike: [[0, 0.94, -0.92]], auto: [[0, 0.7, -1.22]],
                  bus: [[0.9, 1.05, -5.27], [-0.9, 1.05, -5.27]], tank: [[0.85, 1.2, -3.05], [-0.85, 1.2, -3.05]] }[type] || [];
    for (var lk = 0; lk < lamps.length; lk++) kit.beam(lamps[lk][0], lamps[lk][1], lamps[lk][2], type === 'bike' || type === 'auto' ? 9 : 12, type === 'bike' ? 1.5 : 1.9);
    return (modelDefs[key] = kit.finish());
  }
  function meshOf(geo, layer) {
    var mm = M(), mesh = new THREE.Mesh(geo, mm[layer] || mm.matt);
    mesh.userData.sharedGeo = true;
    if (layer === 'beam') { mesh.visible = false; mesh.renderOrder = 3; }
    else if (layer === 'glass') mesh.renderOrder = 2;
    else mesh.castShadow = true;
    return mesh;
  }
  function buildModel(type, color) {
    var def = defOf(type, color), group = new THREE.Group(), ud = group.userData, name;
    /* v2.16.2: no stand-in figures — a rider is the operator itself, seated (seatOf / sit below) */
    ud.figures = []; ud.wheels = []; ud.doors = [];
    for (name in def.layers) { var mesh = meshOf(def.layers[name], name); if (name === 'beam') ud.beams = mesh; group.add(mesh); }
    def.subs.forEach(function (s) {
      var g = new THREE.Group(); g.position.set(s.pivot[0], s.pivot[1], s.pivot[2]);
      for (var n in s.layers) g.add(meshOf(s.layers[n], n));
      group.add(g);
      ud.doors.push({ obj: g, meta: s.meta, pivot: s.pivot, at: 0 });
    });
    def.wheels.forEach(function (w) {
      var pivot = new THREE.Group(); pivot.position.set(w.x, w.r, w.z);
      var wm = new THREE.Mesh(wheelGeo(w.r, w.w, w.kind), M().wheel); wm.userData.sharedGeo = true; wm.castShadow = true;
      if (w.x < 0) wm.scale.x = -1;                            // the face of the rim looks outward on both sides
      pivot.add(wm); group.add(pivot);
      ud.wheels.push({ pivot: pivot, mesh: wm, r: w.r, steer: w.steer });
    });
    def.decals.forEach(function (d) {
      var key = d.w + 'x' + d.h, pg = signGeos[key] || (signGeos[key] = new THREE.PlaneGeometry(d.w, d.h));
      var dm = new THREE.Mesh(pg, signTexture(d.kind, d.text).mat); dm.userData.sharedGeo = true;
      dm.position.set(d.x, d.y, d.z); dm.rotation.y = d.ry; group.add(dm);
    });
    group.rotation.order = 'YXZ';   // heading, then pitch and roll in the vehicle's own frame
    return group;
  }
  /* ===== v2.18 - WHAT MOVES ON A MODEL =====
     Wheels roll by the distance covered and the front ones turn with the bend (read back from the yaw the
     vehicle is actually making, so a vehicle somebody else drives steers too). Doors follow the seats:
     a seat that has just been taken opens its door, holds it while the rider gets in (sit, below), and
     shuts it; a seat just left opens and shuts it once. Looks only. */
  var ENTER_MS = 950, EXIT_MS = 650;
  /* how long getting into seat k takes: a second — and in the bus, longer the further down the aisle the seat is */
  function enterMs(veh, k) {
    if (veh.type !== 'bus') return ENTER_MS;
    var o = veh.T.seatsAt[k] || veh.T.seatsAt[0];
    return ENTER_MS + Math.min(950, Math.max(0, Math.abs(-o[1] + 4.52) - 1.2) * 165);
  }
  function doorCurve(e) { return e <= 0 || e >= 1 ? 0 : Math.min(1, e / 0.26) * (e > 0.74 ? (1 - e) / 0.26 : 1); }
  function progress(map, k, span, nowT) { var t0 = map && map[k]; return t0 === undefined ? -1 : (nowT - t0) / span; }
  function animate(veh, dt, nowT) {
    var ud = veh.group.userData, W = ud.wheels, D = ud.doors, k, S = veh.seats || [], PS = veh.pseats;
    if (!PS) { PS = veh.pseats = []; for (k = 0; k < veh.T.seats; k++) PS[k] = S[k] || null; }       // first sight: whoever is aboard was aboard
    else for (k = 0; k < veh.T.seats; k++) if ((S[k] || null) !== PS[k]) {
      if (S[k]) (veh.enterAt || (veh.enterAt = {}))[k] = nowT; else (veh.exitAt || (veh.exitAt = {}))[k] = nowT;
      PS[k] = S[k] || null;
    }
    if (W && W.length) {
      veh.spin = (veh.spin || 0) - (veh.sp || 0) * dt;
      if (veh.spin > 1e4 || veh.spin < -1e4) veh.spin = 0;
      var want = Math.abs(veh.sp) > 0.4 ? Math.max(-0.42, Math.min(0.42, Math.atan2((veh.yr || 0) * veh.T.len * 0.62, Math.abs(veh.sp)) * (veh.sp < 0 ? -1 : 1))) : 0;
      veh.steer = (veh.steer || 0) + (want - (veh.steer || 0)) * Math.min(1, dt * 8);
      for (k = 0; k < W.length; k++) { W[k].mesh.rotation.x = veh.spin / W[k].r; if (W[k].steer) W[k].pivot.rotation.y = -veh.steer; }
    }
    if (D && D.length && (veh.enterAt || veh.exitAt)) {
      for (k = 0; k < D.length; k++) {
        var d = D[k], open = 0, seats = d.meta.seats, s;
        for (s = 0; s < veh.T.seats; s++) {
          if (seats !== 'all' && seats.indexOf(s) < 0) continue;
          open = Math.max(open, doorCurve(progress(veh.enterAt, s, enterMs(veh, s), nowT)), doorCurve(progress(veh.exitAt, s, EXIT_MS, nowT)));
        }
        if (open === d.at) continue;
        d.at = open;
        var ease = open * open * (3 - 2 * open);
        if (d.meta.slide) d.obj.position.set(d.pivot[0] + d.meta.slide[0] * Math.min(1, ease * 4), d.pivot[1], d.pivot[2] + d.meta.slide[2] * ease);
        else d.obj.rotation.y = d.meta.side * d.meta.swing * ease;
      }
    }
  }
  /* where a rider is while getting in: e 0..1 of ENTER_MS, in the vehicle's own frame. Starts standing
     beside the seat's door (hips 0.93 m up — the rig is life size aboard), ends on the seat. */
  var boardP = { x: 0, y: 0, z: 0, yaw: 0 };
  function sstep(a, b, v) { var t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
  function boardPath(veh, k, e, sx, sy, sz) {
    var T = veh.T, type = veh.type, side = sx > 0.01 ? 1 : -1, m;
    if (type === 'bus') {
      /* up the step at the front door with a hop, then down the aisle to the seat */
      var hop = sstep(0.05, 0.42, e), walk = sstep(0.42, 1, e), dz = -4.52, inX = -0.55, floorHip = 0.7 + 0.93;
      boardP.x = (-2.0 + (inX + 2.0) * hop) * (1 - walk) + sx * walk;
      boardP.y = (0.93 + (floorHip - 0.93) * hop + Math.sin(Math.PI * hop) * 0.3) * (1 - walk) + sy * walk;
      boardP.z = dz * (1 - walk) + sz * walk;
      boardP.yaw = -Math.PI / 2 * (1 - sstep(0.3, 0.7, e));
      return boardP;
    }
    if (type === 'bike') {
      /* from the left: step in, a leg over (the pose does that), settle */
      m = sstep(0.12, 0.72, e);
      boardP.x = -0.5 * (1 - m); boardP.y = 0.93 + (sy - 0.93) * sstep(0.45, 0.95, e) + Math.sin(Math.PI * m) * 0.05; boardP.z = sz; boardP.yaw = 0;
      return boardP;
    }
    /* a sedan (through the door that has just opened) or an auto (through its open side) */
    m = sstep(0.24, 0.8, e);
    var out = side * (T.wid / 2 + 0.5);
    boardP.x = out + (sx - out) * m; boardP.y = 0.93 + (sy - 0.93) * sstep(0.34, 0.86, e); boardP.z = sz + 0.12 * (1 - m);
    boardP.yaw = side * Math.PI / 2 * (1 - sstep(0.3, 0.85, e));
    return boardP;
  }

  /* ------------------------------------------------------------ state */
  function init(sceneRef) {
    reset();
    scene = sceneRef;
  }
  function drop(veh) {
    if (!veh) return;
    if (veh.group) {
      if (veh.group.parent) veh.group.parent.remove(veh.group);
      /* v2.18: nothing to dispose — every geometry of a model is shared by all vehicles of its type and colour */
    }
    if (mine === veh) unmount();
    delete list[veh.id];
  }
  function reset() {
    for (var id in list) drop(list[id]);
    list = {};
    mine = null;
    mySeat = -1;
    nearest = null;
    riders = {};
    for (var pk = 0; pk < puffs.length; pk++) if (puffs[pk].mesh.parent) puffs[pk].mesh.parent.remove(puffs[pk].mesh);
    puffs = [];
    engine(false, 0, 1);
    if (typeof Soundtrack !== 'undefined') Soundtrack.radio(false);   /* v2.15: the match is over; update() will not run to say so */
    showHud(false);
    showPrompt(null);
  }
  function ensure(id, typeIdx) {
    var veh = list[id];
    if (veh) return veh;
    var type = TYPES[typeIdx] || 'car';
    var spec = V.types[type];
    var pal = (spec.paints && spec.paints.length) ? spec.paints : V.paints;
    var group = buildModel(type, pal[id % pal.length]);
    if (scene) scene.add(group);
    veh = list[id] = { id: id, type: type, T: spec, group: group, x: 0, y: 0, z: 0, ry: 0, sp: 0, hp: spec.hp, seats: [],
                       tx: 0, ty: 0, tz: 0, tr: 0, fresh: true, fuel: 100, lit: 0, roll: 0, tilt: 0, pry: 0, psp: 0, puffAt: 0 };
    return veh;
  }
  /* the snapshot: { f: full?, v: [[id, type, x, y, z, ry, speed, hp]...], s: { id: seats } } */
  function sync(pkt) {
    if (!pkt || !V || !scene || !pkt.v) return;
    var seen = {};
    for (var i = 0; i < pkt.v.length; i++) {
      var row = pkt.v[i];
      var veh = ensure(row[0], row[1]);
      seen[row[0]] = 1;
      veh.hp = row[7];
      if (mine === veh && mySeat === 0) continue;             // I am driving it: my simulation is the truth
      if (row[8] !== undefined) veh.fuel = row[8];
      veh.lit = row[9] ? 1 : 0;
      veh.tx = row[2]; veh.ty = row[3]; veh.tz = row[4]; veh.tr = row[5]; veh.sp = row[6];
      if (veh.fresh) { veh.x = veh.tx; veh.y = veh.ty; veh.z = veh.tz; veh.ry = veh.tr; veh.fresh = false; place(veh); }
    }
    if (pkt.f) {
      for (var id in list) {
        if (!seen[id]) { drop(list[id]); continue; }
        list[id].seats = (pkt.s && pkt.s[id]) || [];
      }
      reconcileSeat();
    }
  }
  function myId() { return (typeof Net !== 'undefined' && Net.getMyId) ? Net.getMyId() : null; }
  function reconcileSeat() {
    var me = myId();
    if (!mine || !me) return;
    if (performance.now() - mountedAt < 1200) return;         // the seat message may still be in flight
    if (mine.seats.indexOf(me) < 0) unmount();
  }
  function onSeat(msg) {
    var veh = msg && list[msg.id];
    if (!veh) return;
    veh.seats = msg.seats || [];
    var me = myId();
    var at = me ? veh.seats.indexOf(me) : -1;
    if (at >= 0) { if (mine !== veh) mount(veh, at); else mySeat = at; }
    else if (mine === veh && performance.now() - mountedAt > 400) unmount();
  }
  function onBoom(msg) {
    var veh = msg && list[msg.id];
    try {
      if (msg && msg.p) {
        var at = new THREE.Vector3(msg.p[0], msg.p[1] + 1, msg.p[2]);
        if (typeof FX !== 'undefined') {
          if (FX.explosion) FX.explosion(at, 7);
          if (FX.groundFire) FX.groundFire(new THREE.Vector3(msg.p[0], msg.p[1] + 0.1, msg.p[2]), 2.6, 7);   // the wreck burns for a while
        }
        if (typeof AudioSys !== 'undefined' && AudioSys.explosion) AudioSys.explosion(at, true);
      }
    } catch (err) { /* the effect is cosmetic */ }
    if (veh) drop(veh);
  }
  /* somebody's horn (mine was already played when I pressed the key) */
  function onHorn(msg) {
    var veh = msg && list[msg.id];
    if (!veh || msg.by === myId()) return;
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleHorn) AudioSys.vehicleHorn(new THREE.Vector3(veh.x, veh.y + 1, veh.z), veh.type); } catch (err) { /* cosmetic */ }
  }
  /* ===== v2.13.1 - RIDERS SHOOT =====
     Rahul: "car mei baithe avatar shoot kar sakte h, abhi shoot nahi kar sakte,
     usko bhi include kar do." Everybody in an OPEN vehicle fires — the driver
     too, or a player alone in a car could never shoot from it. The tank's crew
     does not: they are behind armour nothing can reach, and a gun that cannot
     be answered is not a fight.
     It costs accuracy: a seat is not a firing position. The spread is the
     gun's hip spread times aimPenalty() — more for the one steering than for a
     passenger, and more the faster the vehicle goes. No scope and no ADS from
     a seat; nothing is thrown from one. */
  function canFire() { return !!mine && !mine.T.sealed; }
  function aimPenalty() {
    if (!mine) return 1;
    var load = Math.min(1, Math.abs(mine.sp) / mine.T.max);
    return mySeat === 0 ? 1.7 + 1.5 * load : 1.2 + 0.8 * load;
  }
  /* where a rider's rounds leave from: head height at the seat, an arm's length
     toward the aim (the camera is a chase camera; the gun is not at the lens) */
  function muzzle(out, dir) {
    var pos = PlayerCtl.pos;
    return out.set(pos.x + dir.x * 1.2, pos.y + 0.75 + dir.y * 1.2, pos.z + dir.z * 1.2);
  }
  function horn() {
    if (!mine || mySeat !== 0) return;
    var nowT = performance.now();
    if (nowT - hornAt < 450) return;
    hornAt = nowT;
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleHorn) AudioSys.vehicleHorn(null, mine.type); } catch (err) { /* cosmetic */ }
    if (typeof Net !== 'undefined' && Net.emitVeh) Net.emitVeh('vehHorn', {});
  }
  function lights() {
    if (!mine || mySeat !== 0) return;
    mine.lit = mine.lit ? 0 : 1;
    sendAt = 0;                                   // tell the room on the next frame
    if (typeof AudioSys !== 'undefined' && AudioSys.uiClick) AudioSys.uiClick();
  }

  /* ------------------------------------------------------------ geometry */
  function wrap(ang) { while (ang > Math.PI) ang -= 6.283185307; while (ang < -Math.PI) ang += 6.283185307; return ang; }
  function place(veh) {
    /* the height you SEE eases over a kerb; the height that collides is exact */
    veh.yv = (veh.yv === undefined || Math.abs(veh.y - veh.yv) > 1.5) ? veh.y : veh.yv + (veh.y - veh.yv) * 0.3;
    veh.group.position.set(veh.x, veh.yv, veh.z);
    veh.group.rotation.y = -veh.ry;
    veh.group.rotation.z = veh.roll || 0;
    veh.group.rotation.x = veh.tilt || 0;
  }
  /* the body leans: a bike into the turn, everything else away from it; the nose
     lifts under power and dips on the brakes. Looks only — never collision. */
  function lean(veh, yawRate, accel, dt) {
    veh.yr = yawRate;                                         // v2.18: the front wheels read the bend back from this (animate)
    var bikeK = veh.type === 'bike' ? -0.19 : 0.012;
    var wantRoll = Math.max(-0.5, Math.min(0.5, yawRate * Math.abs(veh.sp) * bikeK * (veh.type === 'bike' ? 0.09 : 1)));
    if (veh.type !== 'bike') wantRoll = Math.max(-0.07, Math.min(0.07, wantRoll));
    var wantTilt = veh.type === 'bike' ? 0 : Math.max(-0.035, Math.min(0.035, accel * 0.0022));
    var kk = Math.min(1, dt * 7);
    veh.roll += (wantRoll - veh.roll) * kk;
    veh.tilt += (wantTilt - veh.tilt) * kk;
  }
  /* a hull that has taken a beating smokes, then burns — the warning to get out */
  function smoke(veh, nowT) {
    var frac = veh.hp / veh.T.hp;
    if (frac >= V.smokeAt || nowT < veh.puffAt || !scene) return;
    var burning = frac < V.fireAt;
    veh.puffAt = nowT + (burning ? 90 : 190);
    if (puffs.length >= 40) return;
    if (!smoke.geo) smoke.geo = new THREE.SphereGeometry(0.34, 6, 5);
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    var fwd = veh.type === 'tank' ? -veh.T.len * 0.3 : veh.T.len * 0.32;      // the engine: up front, at the back on the tank
    var mesh = new THREE.Mesh(smoke.geo, (burning && Math.random() < 0.45) ? M().flame : M().smoke);
    mesh.position.set(veh.x + sn * fwd + (Math.random() - 0.5) * 0.5, veh.y + veh.T.hgt * 0.62, veh.z - cs * fwd + (Math.random() - 0.5) * 0.5);
    scene.add(mesh);
    puffs.push({ mesh: mesh, born: nowT, life: burning ? 900 : 1500, vy: 1.4 + Math.random() * 0.9, grow: 0.9 + Math.random() * 0.8 });
  }
  function agePuffs(dt, nowT) {
    for (var k = puffs.length - 1; k >= 0; k--) {
      var puff = puffs[k];
      var age = (nowT - puff.born) / puff.life;
      if (age >= 1) { scene.remove(puff.mesh); puffs.splice(k, 1); continue; }
      puff.mesh.position.y += puff.vy * dt;
      var sc = (0.5 + age * puff.grow * 2.2) * (age > 0.7 ? (1 - age) / 0.3 : 1);
      puff.mesh.scale.set(sc, sc, sc);
    }
  }
  function seatPos(veh, seat) {
    var off = veh.T.seatsAt[seat] || veh.T.seatsAt[0];
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    return { x: veh.x + cs * off[0] + sn * off[1], y: veh.y + veh.T.seatY, z: veh.z + sn * off[0] - cs * off[1] };
  }
  /* does the hull fit here? sampled along its length against the world and the other vehicles */
  /* the hull as a row of circles along its length (a capsule chain) */
  function samples(spec, px, pz, ry) {
    var sn = Math.sin(ry);
    var cs = Math.cos(ry);
    var count = Math.max(2, Math.ceil(spec.len / (spec.r * 1.6)));
    var half = spec.len / 2 - spec.r * 0.9;
    var out = [];
    for (var k = 0; k < count; k++) {
      var along = -half + (2 * half) * k / (count - 1);
      out.push(px + sn * along, pz - cs * along);
    }
    return out;
  }
  /* does the hull fit here? against the world (boxes from 0.5 m up, so a kerb is
     not a wall) and against every other vehicle, circle to circle */
  function hullFree(veh, px, py, pz, ry, worldOnly) {
    var spec = veh.T;
    var mineS = samples(spec, px, pz, ry);
    var lift = 0.5;
    var hh = (spec.hgt * 0.85 - lift) / 2;
    for (var k = 0; k < mineS.length; k += 2) if (!World.fits(mineS[k], py + lift + hh, mineS[k + 1], spec.r, hh, spec.r)) return false;
    if (worldOnly) return true;
    for (var id in list) {
      var other = list[id];
      if (other === veh || Math.abs(other.y - py) > 2.5) continue;
      var reach = (spec.len + other.T.len) / 2 + 1;
      if (Math.abs(other.x - px) > reach || Math.abs(other.z - pz) > reach) continue;
      var theirs = samples(other.T, other.x, other.z, other.ry);
      var rr = (spec.r + other.T.r) * 0.92;
      for (var a = 0; a < mineS.length; a += 2) for (var b = 0; b < theirs.length; b += 2) {
        var dx = mineS[a] - theirs[b];
        var dz = mineS[a + 1] - theirs[b + 1];
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
    return true;
  }
  var _from = null;
  var _down = null;
  function groundUnder(px, py, pz) {
    if (!_from) { _from = new THREE.Vector3(); _down = new THREE.Vector3(0, -1, 0); }
    _from.set(px, py + 1.3, pz);
    var hit = World.rayHit(_from, _down, 5);
    return hit && hit.point ? hit.point.y : null;
  }

  /* ------------------------------------------------------------ riding */
  function mounted() { return !!mine; }
  function mount(veh, seat) {
    mine = veh; mySeat = seat; mountedAt = performance.now(); lastRy = veh.ry;
    if (typeof PlayerCtl !== 'undefined') { PlayerCtl.yaw = veh.ry; PlayerCtl.pitch = -0.12; }
    if (typeof Weapons !== 'undefined' && Weapons.setTrigger) Weapons.setTrigger(false);
    if (seat === 0) veh.lit = 1;                  // the driver's lamps come on with the engine; L switches them
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleDoor) AudioSys.vehicleDoor(null); } catch (err) { /* cosmetic */ }
    showPrompt(null);
    showHud(true);
  }
  function unmount() {
    if (mine && mySeat === 0) { mine.lit = 0; mine.sp = 0; }
    mine = null; mySeat = -1;
    engine(false, 0, 1);
    showHud(false);
  }
  function exitSpot(veh) {
    var spec = veh.T;
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    var side = spec.wid / 2 + 0.85;
    var tries = [[side, 0], [-side, 0], [side, 1.2], [-side, 1.2], [side, -1.2], [-side, -1.2], [0, -(spec.len / 2 + 1.0)], [0, spec.len / 2 + 1.0]];
    for (var k = 0; k < tries.length; k++) {
      var px = veh.x + cs * tries[k][0] + sn * tries[k][1];
      var pz = veh.z + sn * tries[k][0] - cs * tries[k][1];
      var gy = groundUnder(px, veh.y, pz);
      if (gy === null || Math.abs(gy - veh.y) > 1.2) continue;
      if (World.fits(px, gy + CFG.PLAYER.standH / 2 + 0.08, pz, 0.36, CFG.PLAYER.standH / 2, 0.36)) return { x: px, y: gy, z: pz };
    }
    return null;
  }
  function use() {
    if (!V || typeof Net === 'undefined' || !Net.emitVeh) return;
    var nowT = performance.now();
    if (nowT - useAt < 350) return;
    useAt = nowT;
    if (mine) {
      if (Math.abs(mine.sp) > 6 && mySeat === 0) { if (typeof UI !== 'undefined') UI.toast('Slow down to get out'); return; }
      var spot = exitSpot(mine);
      if (!spot) { if (typeof UI !== 'undefined') UI.toast('No room to get out here'); return; }
      Net.emitVeh('vehExit', {});
      var pos = PlayerCtl.pos;
      pos.x = spot.x; pos.y = spot.y + CFG.PLAYER.standH / 2 + 0.02; pos.z = spot.z;
      unmount();
      return;
    }
    if (!nearest || !PlayerCtl.alive) return;
    if (PlayerCtl.prone) { if (typeof UI !== 'undefined') UI.toast('Stand up to get in'); return; }   // v2.13.1: a rider fires at full strength, so nobody boards lying down
    var target = nearest;
    Net.emitVeh('vehEnter', { id: target.id }, function (res) {
      if (res && res.ok) { if (list[target.id]) mount(list[target.id], res.seat); }
      else if (res && res.err && typeof UI !== 'undefined') UI.toast(res.err);
    });
  }
  /* called INSTEAD of PlayerCtl.update while seated */
  function drive(dt, input) {
    var veh = mine;
    if (!veh) return;
    if (!PlayerCtl.alive) { unmount(); return; }
    if (mySeat === 0) {
      var spec = veh.T;
      var throttle = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
      var steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      /* petrol: burned by the throttle, a little by rolling; an empty tank is an
         engine that will not pull (the brakes still work) */
      if (veh.fuel > 0) {
        veh.fuel = Math.max(0, veh.fuel - spec.burn * (throttle !== 0 ? 1 : (Math.abs(veh.sp) > 0.5 ? V.idleBurn : 0.04)) * dt);
        if (veh.fuel <= 0 && typeof UI !== 'undefined') UI.toast('OUT OF PETROL');
      } else {
        if (throttle !== 0 && Math.sign(throttle) === Math.sign(veh.sp || throttle)) {
          if (performance.now() - dryToldAt > 4000) { dryToldAt = performance.now(); if (typeof UI !== 'undefined') UI.toast('No petrol \u2014 the engine is dead'); }
          throttle = 0;
        }
      }
      var spBefore = veh.sp;
      var ryBefore = veh.ry;
      if (throttle > 0) veh.sp += (veh.sp < 0 ? spec.brake : spec.accel) * dt;
      else if (throttle < 0) veh.sp -= (veh.sp > 0 ? spec.brake : spec.accel * 0.7) * dt;
      else veh.sp -= Math.sign(veh.sp) * Math.min(Math.abs(veh.sp), 3.2 * dt);
      if (input.jump) veh.sp -= Math.sign(veh.sp) * Math.min(Math.abs(veh.sp), spec.brake * 1.5 * dt);   // handbrake
      veh.sp = Math.max(-spec.rev, Math.min(spec.max, veh.sp));
      var grip = Math.min(1, Math.abs(veh.sp) / 5) * (veh.sp >= 0 ? 1 : -1);
      if (spec.pivot && Math.abs(veh.sp) < 1.2) grip = 0.7;                       // a tank turns on the spot
      /* somebody drove into it (two drivers, one gap): let it pull clear of other
         vehicles — the world is still solid */
      var wedged = !hullFree(veh, veh.x, veh.y, veh.z, veh.ry);
      var newRy = wrap(veh.ry + steer * spec.turn * grip * dt * (1 - 0.35 * Math.min(1, Math.abs(veh.sp) / spec.max)));
      if (newRy !== veh.ry && hullFree(veh, veh.x, veh.y, veh.z, newRy, wedged)) veh.ry = newRy;
      var sn = Math.sin(veh.ry);
      var cs = Math.cos(veh.ry);
      var stepLen = veh.sp * dt;
      var nx = veh.x + sn * stepLen;
      var nz = veh.z - cs * stepLen;
      var ext = (CFG.MAPS[World.builtMap] || {}).ext;
      if (ext) { nx = Math.max(ext.x0 + 2, Math.min(ext.x1 - 2, nx)); nz = Math.max(ext.z0 + 2, Math.min(ext.z1 - 2, nz)); }
      /* a move is the whole pose or nothing: where it would stand, at the HEIGHT
         it would stand there (up a kerb, down off a dock), must be free. Checking
         the ground after the move let a bike mount a kerb into the underside of
         a stair (verify-vehicles caught it). */
      var heightAt = function (px, pz) {
        var gy = groundUnder(px, veh.y, pz);
        if (gy === null) return veh.y;
        if (gy > veh.y + 0.5) return null;                                       // too high to mount: that is a wall
        return gy < veh.y ? Math.max(gy, veh.y - Math.max(0.15, 9 * dt)) : gy;   // down no faster than it falls
      };
      var attempt = function (px, pz) {
        var ny = heightAt(px, pz);
        if (ny === null || !hullFree(veh, px, ny, pz, veh.ry, wedged)) return false;
        veh.x = px; veh.z = pz; veh.y = ny;
        return true;
      };
      if (stepLen !== 0) {
        if (!attempt(nx, nz)) {
          var scrub = Math.max(0, 1 - 3.5 * dt);                                  // sliding along a wall bleeds speed, it does not stop dead
          if (attempt(nx, veh.z)) veh.sp *= scrub;
          else if (attempt(veh.x, nz)) veh.sp *= scrub;
          else veh.sp = -veh.sp * 0.22;                                           // square on: stop and bounce a little
        }
      } else attempt(veh.x, veh.z);                                               // parked on a slope or still falling: settle
      lean(veh, wrap(veh.ry - ryBefore) / Math.max(dt, 1e-3), (veh.sp - spBefore) / Math.max(dt, 1e-3), dt);
      place(veh);
      var nowT = performance.now();
      if (nowT - sendAt > 48) {
        sendAt = nowT;
        Net.emitVeh('veh', { id: veh.id, p: [veh.x, veh.y, veh.z], ry: veh.ry, sp: veh.sp, f: Math.round(veh.fuel * 10) / 10, l: veh.lit ? 1 : 0 });
      }
      rams(veh, nowT);
    }
    /* the camera turns with the vehicle; the mouse looks around on top of that */
    PlayerCtl.yaw = PlayerCtl.yaw + wrap(veh.ry - lastRy); lastRy = veh.ry;
    var at = seatPos(veh, mySeat);
    var pos = PlayerCtl.pos;
    pos.x = at.x; pos.y = at.y + SEAT_UP; pos.z = at.z;
    var vel = PlayerCtl.vel;
    if (vel) { vel.x = 0; vel.y = 0; vel.z = 0; }
    engine(mySeat === 0 && veh.fuel > 0, veh.sp, veh.T.max, !!veh.T.big);
  }
  function rams(veh, nowT) {
    if (Math.abs(veh.sp) < V.ramMin || !Net.eachRemote) return;
    var spec = veh.T;
    var sn = Math.sin(veh.ry);
    var cs = Math.cos(veh.ry);
    Net.eachRemote(function (id, rem) {
      if (!rem || !rem.alive || !rem.renderPos) return;
      var dx = rem.renderPos.x - veh.x;
      var dz = rem.renderPos.z - veh.z;
      var side = dx * cs + dz * sn;
      var along = dx * sn - dz * cs;
      if (Math.abs(side) > spec.wid / 2 + 0.45 || Math.abs(along) > spec.len / 2 + 0.5 || Math.abs(rem.renderPos.y - veh.y) > 2.6) return;
      if (nowT - (ramAt[id] || 0) < 900) return;
      ramAt[id] = nowT;
      Net.emitVeh('vehRam', { id: veh.id, victim: id });
    });
  }
  /* a ray against every hull but my own: { t, point, id, sealed } for the nearest, or null.
     Hulls are oriented boxes; the ray is taken into each one's frame. */
  function rayHit(origin, dir, maxDist) {
    if (!V) return null;
    var best = null;
    var bestT = maxDist;
    for (var id in list) {
      var veh = list[id];
      if (veh === mine) continue;
      var sn = Math.sin(veh.ry);
      var cs = Math.cos(veh.ry);
      var ox = origin.x - veh.x;
      var oz = origin.z - veh.z;
      if (ox * ox + oz * oz > (maxDist + veh.T.len) * (maxDist + veh.T.len)) continue;
      var lo = [ox * cs + oz * sn, origin.y - veh.y, ox * sn - oz * cs];
      var ld = [dir.x * cs + dir.z * sn, dir.y, dir.x * sn - dir.z * cs];
      var mn = [-veh.T.wid / 2, 0.15, -veh.T.len / 2];
      var mx = [veh.T.wid / 2, veh.T.hgt, veh.T.len / 2];
      var t0 = 0;
      var t1 = bestT;
      var hitIt = true;
      for (var ax = 0; ax < 3; ax++) {
        if (Math.abs(ld[ax]) < 1e-7) { if (lo[ax] < mn[ax] || lo[ax] > mx[ax]) { hitIt = false; break; } continue; }
        var ta = (mn[ax] - lo[ax]) / ld[ax];
        var tb = (mx[ax] - lo[ax]) / ld[ax];
        if (ta > tb) { var swapT = ta; ta = tb; tb = swapT; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { hitIt = false; break; }
      }
      if (hitIt && t0 < bestT) { bestT = t0; best = veh; }
    }
    if (!best) return null;
    return { t: bestT, id: best.id, sealed: !!best.T.sealed, sillY: best.y + (best.T.sill || 0),
             point: new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT) };
  }
  /* rounds that met a hull this shot, told to the server once per vehicle */
  function report(id, weapon, count) {
    if (typeof Net !== 'undefined' && Net.emitVeh) Net.emitVeh('vehHit', { id: id, w: weapon, n: count || 1 });
  }

  /* ------------------------------------------------------------ per frame */
  function freeSeat(veh) {
    for (var k = 0; k < veh.T.seats; k++) if (!veh.seats || !veh.seats[k]) return k;
    return -1;
  }
  /* net.js asks before it shows a remote avatar; system.js before it lets a round through a hull */
  function isRider(pid) { return riders[pid] !== undefined; }
  /* ===== v2.16.2 - THE RIDER IS THE OPERATOR =====
     seatOf: who sits where, in the words the avatar code poses from (one
     object, reused — read it before the next call). lookYaw is where the
     player is looking; `look` is that relative to the nose, + to the right.
     sit: puts a rig ON the seat in the vehicle's own frame, so a rider leans
     into a bend with the bike and pitches with the bonnet. The rig faces +z
     and a vehicle's nose is -z: half a turn about Y. */
  var SEAT_HIP = { bike: 0.37, auto: 0.28, car: 0.34, bus: 0.40 };   // hips above seatY: on the saddle, sunk a little into a bench, low in a sedan
  var seatS = { veh: null, k: 0, kind: '', bike: false, open: false, driver: false, sealed: false, look: 0, enter: 1 };
  var sitV = null, sitQ = null, sitY = null, sitUp = null;
  function seatOf(pid, lookYaw) {
    var vid = riders[pid];
    if (vid === undefined) return null;
    var veh = list[vid];
    if (!veh || !veh.seats) return null;
    var k = veh.seats.indexOf(pid);
    if (k < 0) return null;
    seatS.veh = veh; seatS.k = k; seatS.kind = veh.type; seatS.bike = veh.type === 'bike'; seatS.open = !veh.T.sill; seatS.sealed = !!veh.T.sealed;
    seatS.driver = k === 0; seatS.look = wrap((lookYaw || 0) - veh.ry);
    /* v2.18: getting in. `enter` runs 0..1 over ENTER_MS from the moment the seat was taken (1 = seated);
       sit() walks the rig in from the door by it and Avatars.poseSeat folds it down by it. */
    var en = progress(veh.enterAt, k, enterMs(veh, k), performance.now());
    seatS.enter = (en < 0 || en >= 1) ? 1 : en;
    return seatS;
  }
  function sit(group, st) {
    var veh = st.veh, off = veh.T.seatsAt[st.k] || veh.T.seatsAt[0];
    if (!sitV) { sitV = new THREE.Vector3(); sitQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); }
    var lx = off[0], ly = veh.T.seatY + (SEAT_HIP[veh.type] || 0.4), lz = -off[1], yaw = 0;
    if (st.enter !== undefined && st.enter < 1) { var bp = boardPath(veh, st.k, st.enter, lx, ly, lz); lx = bp.x; ly = bp.y; lz = bp.z; yaw = bp.yaw; }
    sitV.set(lx, ly, lz).applyQuaternion(veh.group.quaternion).add(veh.group.position);
    group.position.copy(sitV);
    group.quaternion.copy(veh.group.quaternion).multiply(sitQ);
    if (yaw) { if (!sitY) { sitY = new THREE.Quaternion(); sitUp = new THREE.Vector3(0, 1, 0); } group.quaternion.multiply(sitY.setFromAxisAngle(sitUp, yaw)); }
  }
  function riderOf(pid) { var vid = riders[pid]; return vid === undefined ? null : (list[vid] || null); }
  function update(dt) {
    if (!V || !scene) return;
    var blend = Math.min(1, dt * 10);
    var nowT = performance.now();
    agePuffs(dt, nowT);
    var best = null;
    var bestD = 1e9;
    var pos = (typeof PlayerCtl !== 'undefined') ? PlayerCtl.pos : null;
    riders = {};
    for (var id in list) {
      var veh = list[id];
      if (!(veh === mine && mySeat === 0)) {
        veh.x += (veh.tx - veh.x) * blend; veh.y += (veh.ty - veh.y) * blend; veh.z += (veh.tz - veh.z) * blend;
        veh.ry = wrap(veh.ry + wrap(veh.tr - veh.ry) * blend);
        lean(veh, wrap(veh.ry - veh.pry) / Math.max(dt, 1e-3), (veh.sp - veh.psp) / Math.max(dt, 1e-3), dt);
        veh.pry = veh.ry; veh.psp = veh.sp;
        place(veh);
      }
      var beams = veh.group.userData.beams;
      if (beams && beams.visible !== !!veh.lit) beams.visible = !!veh.lit;
      animate(veh, dt, nowT);                                 // v2.18: wheels, steering, doors
      smoke(veh, nowT);
      if (veh.seats) for (var sk = 0; sk < veh.seats.length; sk++) if (veh.seats[sk]) riders[veh.seats[sk]] = veh.id;
      if (!mine && pos && freeSeat(veh) >= 0) {
        var gap = Math.hypot(veh.x - pos.x, veh.z - pos.z) - veh.T.len / 2;
        if (gap < V.enterDist && Math.abs(veh.y - (pos.y - 0.96)) < 3 && gap < bestD) { bestD = gap; best = veh; }
      }
    }
    nearest = (!mine && typeof PlayerCtl !== 'undefined' && PlayerCtl.alive) ? best : null;
    /* v2.15: the radio plays for everyone aboard a vehicle somebody is DRIVING (track.js; one comparison a frame) */
    if (typeof Soundtrack !== 'undefined') Soundtrack.radio(!!(mine && (mySeat === 0 || (mine.seats && mine.seats[0]))));
    showPrompt(nearest);
    if (mine) hud(mine, dt);
  }
  function camera(cam) {
    if (!mine || !cam || typeof PlayerCtl === 'undefined') return;
    var spec = mine.T;
    var yaw = PlayerCtl.yaw;
    var pitch = Math.max(-0.95, Math.min(0.35, PlayerCtl.pitch));
    var cp = Math.cos(pitch);
    var fx = Math.sin(yaw) * cp;
    var fy = Math.sin(pitch);
    var fz = -Math.cos(yaw) * cp;
    var px = mine.x;
    var py = (mine.yv === undefined ? mine.y : mine.yv) + spec.hgt + 0.7;
    var pz = mine.z;
    var boom = spec.boom;
    try {
      var hit = World.rayHit(new THREE.Vector3(px, py, pz), new THREE.Vector3(-fx, -fy, -fz), boom);
      if (hit && hit.point) boom = Math.max(1.6, Math.hypot(hit.point.x - px, hit.point.y - py, hit.point.z - pz) - 0.35);
    } catch (err) { /* keep the full boom */ }
    cam.position.set(px - fx * boom, Math.max(mine.y + 0.6, py - fy * boom), pz - fz * boom);
    cam.rotation.x = pitch; cam.rotation.z = 0;
  }

  /* ------------------------------------------------------------ HUD, sound
     v2.16 - A SPEEDOMETER, NOT A PANEL OF BARS. Rahul sent a dashboard photo:
     "speedmeter aisa hona chahiye below screen pe sahi tarike se without
     overlapping any other words or text." A black dial at the bottom centre
     (the one stretch of the HUD nothing else writes on: health is bottom-left,
     ammunition bottom-right; toasts move up above it while seated): white
     numerals, orange minor ticks and rim, a glowing orange needle, and an LCD
     strip in the face for what the bars used to say — speed, petrol, hull,
     seats. SMALL (Rahul, on seeing the first size: "speedometer ka size chota
     karo"): 190 px across at most, 26% of the screen's height on a short one.
     The scale is the vehicle's own (`dial` in the table): the photo
     reads to 260, and a sedan that tops out at 90 would never leave its first
     third. The FACE is painted once per scale into its own canvas; a frame
     copies it and draws a needle, and only when the needle has moved. */
  var DIAL = { W: 640, H: 480, cx: 320, cy: 322, R: 292, a0: 190, sweep: 200 };   // 0 sits ten degrees below level, so a parked needle clears the LCD under the pivot
  var gauge = { cv: null, g: null, face: null, faceMax: 0, drawn: -9, sp: 0, lcd: '', keysAt: 0, keys: '' };
  function dialAt(t, r, out) {                     // t 0..1 round the scale, r pixels from the pivot
    var a = (DIAL.a0 - t * DIAL.sweep) * Math.PI / 180;
    out[0] = DIAL.cx + Math.cos(a) * r; out[1] = DIAL.cy - Math.sin(a) * r;
    return out;
  }
  function dialStep(max) { return max > 110 ? 20 : 10; }   // a numeral every this many km/h
  function paintFace(max) {
    var cv = document.createElement('canvas'); cv.width = DIAL.W; cv.height = DIAL.H;
    var g = cv.getContext('2d'); if (!g) return null;
    var p = [0, 0], q = [0, 0], step = dialStep(max), minor = step / 10, k;
    g.fillStyle = 'rgba(3,4,6,0.9)';
    g.beginPath(); g.arc(DIAL.cx, DIAL.cy, DIAL.R + 22, 0, Math.PI * 2); g.fill();
    g.lineCap = 'butt';
    g.strokeStyle = '#f08a1c'; g.lineWidth = 3;                                   // the rim
    g.beginPath(); g.arc(DIAL.cx, DIAL.cy, DIAL.R, -DIAL.a0 * Math.PI / 180, -(DIAL.a0 - DIAL.sweep) * Math.PI / 180, false); g.stroke();
    for (k = 0; k * minor <= max + 1e-6; k++) {
      var v = k * minor, t = v / max, major = k % 10 === 0, mid = k % 5 === 0;
      dialAt(t, DIAL.R - 5, p); dialAt(t, DIAL.R - (major ? 40 : mid ? 26 : 17), q);
      g.strokeStyle = major ? '#ffffff' : '#f08a1c'; g.lineWidth = major ? 7 : mid ? 3.5 : 2.5;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 ' + (max > 110 ? 37 : 39) + 'px Rajdhani, Arial, sans-serif';
    for (k = 0; k * step <= max + 1e-6; k++) { dialAt(k * step / max, DIAL.R - 78, p); g.fillText(String(k * step), p[0], p[1] + 2); }
    return cv;                                      // nothing is written where the needle sweeps: name and numbers sit under the pivot
  }
  function drawGauge(veh, dt) {
    var max = veh.T.dial || 160, g = gauge.g;
    if (!g) return;
    if (gauge.faceMax !== max) { gauge.face = paintFace(max); gauge.faceMax = max; gauge.drawn = -9; gauge.sp = Math.abs(veh.sp) * 3.6; }
    var want = Math.min(max, Math.abs(veh.sp) * 3.6);
    gauge.sp += (want - gauge.sp) * Math.min(1, dt * 9);                          // a needle has a little weight
    if (Math.abs(gauge.sp - gauge.drawn) < 0.12) return;
    gauge.drawn = gauge.sp;
    g.clearRect(0, 0, DIAL.W, DIAL.H);
    if (gauge.face) g.drawImage(gauge.face, 0, 0);
    var a = [0, 0], b = [0, 0], t = gauge.sp / max;
    dialAt(t, 26, a); dialAt(t, DIAL.R - 46, b);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,110,0,0.20)'; g.lineWidth = 20; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = 'rgba(255,140,20,0.55)'; g.lineWidth = 11; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = '#ffb84a'; g.lineWidth = 5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.fillStyle = '#0b0d11'; g.beginPath(); g.arc(DIAL.cx, DIAL.cy, 20, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a3f47'; g.lineWidth = 3; g.beginPath(); g.arc(DIAL.cx, DIAL.cy, 20, 0, Math.PI * 2); g.stroke();
  }
  function dom() {
    if (hudEl || typeof document === 'undefined' || !document.body || !document.createElement) return;
    var css = document.createElement('style');
    css.textContent =
      '#veh-hud{--vw:min(190px,26vh);position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:40;display:none;width:var(--vw);pointer-events:none;' +
      'font-family:Rajdhani,Arial,sans-serif;color:#e9edf2}' +
      '#veh-hud canvas{display:block;width:100%;height:auto}' +
      '#veh-hud .vlcd{position:absolute;left:50%;top:77%;transform:translateX(-50%);white-space:nowrap;padding:1px 5px 2px;text-align:center;' +
      'background:#11161c;border:1px solid #2b323b;border-radius:2px;font:600 10px/11px Consolas,Menlo,monospace;color:#8f9aa6}' +
      '#veh-hud .vlcd span{margin:0 3px}' +
      '#veh-hud .vlcd b{color:#e6f1ea;font-weight:700}#veh-hud .vlcd .warn b{color:#f0b23c}#veh-hud .vlcd .bad b{color:#ff5b45;animation:vgBlink .8s steps(2,end) infinite}' +
      '@keyframes vgBlink{50%{opacity:.35}}' +
      '#veh-hud .vk{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:4px;white-space:nowrap;padding:3px 10px;background:rgba(8,11,16,.6);' +
      'font-size:12px;color:#c3ccd6;letter-spacing:.06em;transition:opacity .6s}#veh-hud .vk.gone{opacity:0}#veh-hud .vk.hot{color:#ff5b45;background:rgba(40,6,4,.8)}' +
      'body.veh-on #toasts{bottom:calc(min(190px,26vh)*.75 + 40px)}' +
      '#veh-prompt{position:fixed;left:50%;bottom:24%;transform:translateX(-50%);z-index:40;display:none;padding:8px 16px;background:rgba(10,14,20,.78);' +
      'border:1px solid rgba(240,178,60,.6);color:#e9edf2;font:600 15px Rajdhani,Arial,sans-serif;letter-spacing:.1em;pointer-events:none}' +
      '#veh-prompt b{color:#f0b23c}#veh-prompt i{font-style:normal;color:#9aa6b2;margin-left:8px;font-size:13px}';
    document.head.appendChild(css);
    hudEl = document.createElement('div');
    hudEl.id = 'veh-hud';
    hudEl.innerHTML = '<canvas width="' + DIAL.W + '" height="' + DIAL.H + '"></canvas>' +
      '<div class="vlcd"><div><span>PETROL <b></b></span><span>HULL <b></b></span></div><div><span><b></b> km/h</span><span>SEATS <b></b></span></div></div><div class="vk"></div>';
    document.body.appendChild(hudEl);
    gauge.cv = hudEl.firstChild;
    try { gauge.g = gauge.cv.getContext('2d'); } catch (err) { gauge.g = null; }
    promptEl = document.createElement('div');
    promptEl.id = 'veh-prompt';
    document.body.appendChild(promptEl);
  }
  function keyName() { return String(V.useKey || 'KeyN').replace('Key', ''); }
  function aboard(veh) { var n = 0; if (veh.seats) for (var k = 0; k < veh.T.seats; k++) if (veh.seats[k]) n++; return n; }
  function showHud(on) {
    dom();
    if (!hudEl) return;
    hudEl.style.display = on ? 'block' : 'none';
    if (document.body.classList) document.body.classList.toggle('veh-on', !!on);   // toasts step up out of the dial's way
    if (on) { gauge.keysAt = performance.now(); gauge.drawn = -9; gauge.lcd = ''; }
  }
  function showPrompt(veh) {
    dom();
    if (!promptEl) return;
    if (!veh) { if (promptEl.style.display !== 'none') promptEl.style.display = 'none'; return; }
    var seat = freeSeat(veh);
    var text = keyName() + ' — ' + (seat === 0 ? 'DRIVE' : 'RIDE') + ' <b>' + veh.T.label.toUpperCase() + '</b><i>' + aboard(veh) + '/' + veh.T.seats + ' seats</i>';
    if (promptEl.innerHTML !== text) promptEl.innerHTML = text;
    promptEl.style.display = 'block';
  }
  function hud(veh, dt) {
    if (!hudEl) return;
    drawGauge(veh, dt || 0.016);
    var kids = hudEl.children, rows = kids[1].children;
    var frac = Math.max(0, Math.min(1, veh.hp / veh.T.hp)), fuel = Math.max(0, Math.min(1, veh.fuel / 100));
    var line = Math.round(Math.abs(veh.sp) * 3.6) + '|' + Math.round(fuel * 100) + '|' + Math.round(frac * 100) + '|' + aboard(veh) + '|' + veh.id;
    if (line !== gauge.lcd) {                       // the DOM is touched when a number on it changes, not every frame
      gauge.lcd = line;
      var pet = rows[0].children[0], hul = rows[0].children[1];
      pet.lastChild.textContent = Math.round(fuel * 100) + '%';
      pet.className = fuel > 0.25 ? '' : fuel > 0.1 ? 'warn' : 'bad';
      hul.lastChild.textContent = Math.round(frac * 100) + '%';
      hul.className = frac > V.smokeAt ? '' : frac > V.fireAt ? 'warn' : 'bad';
      rows[1].children[0].firstChild.textContent = String(Math.round(Math.abs(veh.sp) * 3.6));
      rows[1].children[1].lastChild.textContent = aboard(veh) + '/' + veh.T.seats;
    }
    var fire = veh.T.sealed ? '' : 'CLICK fire · R reload · G frag · ';
    var who = veh.T.label.toUpperCase() + (mySeat === 0 ? '' : ' · PASSENGER') + ' — ';
    var hint = who + (mySeat === 0 ? 'W/S A/D drive · SPACE brake · ' + fire + 'H horn · L lights · B radio · ' + keyName() + ' out' : fire + 'B radio · ' + keyName() + ' get out');
    var hot = frac < V.fireAt;
    if (hot) hint = 'ON FIRE — GET OUT (' + keyName() + ')';
    /* the keys are a reminder, not furniture: ten seconds after boarding they fade (the field manual has them) */
    var cls = 'vk' + (hot ? ' hot' : performance.now() - gauge.keysAt > 10000 ? ' gone' : '');
    if (gauge.keys !== hint + cls) { gauge.keys = hint + cls; kids[2].textContent = hint; kids[2].className = cls; }
  }
  /* the engine note is the game's own audio bus (volume slider, mute) */
  function engine(on, speed, top, deep) {
    try { if (typeof AudioSys !== 'undefined' && AudioSys.vehicleEngine) AudioSys.vehicleEngine(!!on, Math.min(1, Math.abs(speed) / (top || 1)), !!deep); } catch (err) { /* no sound is not a reason to stop driving */ }
  }
  return { init: init, reset: reset, sync: sync, onSeat: onSeat, onBoom: onBoom, update: update, drive: drive, mounted: mounted,
           camera: camera, use: use, horn: horn, lights: lights, onHorn: onHorn, rayHit: rayHit, report: report, isRider: isRider, riderOf: riderOf, seatOf: seatOf, sit: sit, _seatHip: SEAT_HIP,
    offering: function () { return !!nearest; },   // v2.17: a vehicle's own N prompt is up (the train's waits)
           canFire: canFire, aimPenalty: aimPenalty, muzzle: muzzle, ridden: function () { return mine; },
           driving: function () { return !!mine && mySeat === 0; },
           _list: function () { return list; }, _seat: function () { return mySeat; }, _gauge: gauge, _dial: DIAL, _dialAt: dialAt, _dialStep: dialStep, _build: buildModel, _enterMs: enterMs, _mount: mount, _hullFree: hullFree, _exitSpot: exitSpot };
})();
if (typeof window !== 'undefined') window.Vehicles = Vehicles;
