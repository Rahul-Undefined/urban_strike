/* Dynamic loot renderer: builds item meshes from the server's loot list,
   handles collect/respawn events, and animates airdrop crates with smoke
   columns + light beacons. All state is server-authoritative. */
var Pickups = (function () {
  'use strict';

  var scene = null;
  var items = {};        // id -> { grp, ring, t, base, active, pop }
  var crates = [];       // { grp, smoke:[], beam, x, z, landAt, landed, life }
  var mines = {};        // id -> { grp, led } — server-authoritative AP mines
  var RAR_COLOR = { c: 0xd7dee6, r: 0x4fa3e0, l: 0xf0c040 };
  var CAT_COLOR = { sight: 0x51d0e8, muzzle: 0xf09a3a, mag: 0x9be05a };

  /* ===== v2.0 - ONE MATERIAL, ONE MESH PER ITEM (Rahul: "make the game
     lighter"; the 12-minute lag) =====
     Every pickup used to be a Group of 3-6 boxes, each with its OWN
     MeshLambertMaterial — ~437 items x ~5 = 2,000 meshes and 2,000 materials
     on Urban, every one a draw call when in view and every one a node the
     scene graph walked sixty times a second. Now:
       - one SHARED MeshLambertMaterial with vertex colours for every item;
       - one merged BufferGeometry PER ITEM TYPE (built once, colours baked into
         the vertices), shared by every instance of that type;
       - one shared ring geometry and three shared ring materials (per rarity);
       - bob/spin only within ANIM_R metres of the player (update()).
     An item is therefore two meshes in a group and zero allocations after the
     first of its type. Nothing here is ever disposed per item, so freeGroup()
     only frees what an instance truly owns (nothing but its group). */
  var ITEM_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
  var RING_GEO = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 18, 1, true);
  var RING_MAT = {
    c: new THREE.MeshBasicMaterial({ color: RAR_COLOR.c, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    r: new THREE.MeshBasicMaterial({ color: RAR_COLOR.r, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    l: new THREE.MeshBasicMaterial({ color: RAR_COLOR.l, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  };
  var templates = {};   // t -> merged BufferGeometry
  /* a "part list" builder: each part is [geometry, colour, x, y, z, rotY, rotZ] */
  function P(list, geo, c, x, y, z, ry, rz) { list.push([geo, c, x || 0, y || 0, z || 0, ry || 0, rz || 0]); }
  function boxP(list, w, h, d, c, x, y, z, ry) { P(list, new THREE.BoxGeometry(w, h, d), c, x, y, z, ry, 0); }
  function cylP(list, r, h, c, x, y, z) { P(list, new THREE.CylinderGeometry(r, r, h, 10), c, x, y, z, 0, 0); }
  function mergeParts(list) {
    var vTot = 0, iTot = 0;
    list.forEach(function (pt) { vTot += pt[0].attributes.position.count; iTot += pt[0].index.count; });
    var pos = new Float32Array(vTot * 3), nor = new Float32Array(vTot * 3), col = new Float32Array(vTot * 3), idx = new Uint16Array(iTot);
    var vo = 0, io = 0, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), tv = new THREE.Vector3(), nm = new THREE.Matrix3();
    list.forEach(function (pt) {
      var g = pt[0], c = new THREE.Color(pt[1]);
      e3.set(0, pt[5], pt[6]); q.setFromEuler(e3); tv.set(pt[2], pt[3], pt[4]); m4.compose(tv, q, sc); nm.getNormalMatrix(m4);
      var pa = g.attributes.position.array, na = g.attributes.normal.array, ia = g.index.array, n = g.attributes.position.count, e = m4.elements, ne = nm.elements;
      for (var j = 0; j < n; j++) {
        var x = pa[j * 3], y = pa[j * 3 + 1], z = pa[j * 3 + 2];
        pos[(vo + j) * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[(vo + j) * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[(vo + j) * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        var nx = na[j * 3], ny = na[j * 3 + 1], nz = na[j * 3 + 2];
        nor[(vo + j) * 3] = ne[0] * nx + ne[3] * ny + ne[6] * nz;
        nor[(vo + j) * 3 + 1] = ne[1] * nx + ne[4] * ny + ne[7] * nz;
        nor[(vo + j) * 3 + 2] = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        col[(vo + j) * 3] = c.r; col[(vo + j) * 3 + 1] = c.g; col[(vo + j) * 3 + 2] = c.b;
      }
      for (var k = 0; k < ia.length; k++) idx[io + k] = ia[k] + vo;
      vo += n; io += ia.length;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  function vestParts(L, lvl) {
    var c = new THREE.Color(CFG.ARMOR[lvl].color);
    boxP(L, 0.42, 0.5, 0.16, c, 0, 0, 0);
    boxP(L, 0.5, 0.1, 0.18, c.clone().multiplyScalar(0.75), 0, 0.26, 0);
    for (var i = 0; i < lvl; i++) boxP(L, 0.07, 0.05, 0.02, 0xf2f5f8, -0.12 + i * 0.12, 0.05, 0.095);
  }
  function gunParts(L, w) {
    var gm = 0x3a4048;
    /* the whole gun leans 0.5 rad about z, as the old Group did */
    var rz = 0.5, cs = Math.cos(rz), sn = Math.sin(rz);
    function R(x, y) { return [x * cs - y * sn, x * sn + y * cs]; }
    var q;
    q = R(0, 0);        P(L, new THREE.BoxGeometry(0.62, 0.1, 0.07), gm, q[0], q[1], 0, 0, rz);
    q = R(0.42, 0.02);  P(L, new THREE.BoxGeometry(0.34, 0.045, 0.05), 0x2c3138, q[0], q[1], 0, 0, rz);
    q = R(-0.05, -0.12); P(L, new THREE.BoxGeometry(0.07, 0.16, 0.05), gm, q[0], q[1], 0, 0, rz);
    q = R(-0.36, -0.03); P(L, new THREE.BoxGeometry(0.16, 0.12, 0.05), 0x50565e, q[0], q[1], 0, 0, rz);
    if (CFG.WEAPONS[w] && CFG.WEAPONS[w].scope) { q = R(0.05, 0.09); P(L, new THREE.BoxGeometry(0.2, 0.05, 0.04), 0x22262c, q[0], q[1], 0, 0, rz); }
  }
  function helmParts(L, lvl) {
    var c = new THREE.Color(CFG.HELMET[lvl].color);
    P(L, new THREE.SphereGeometry(0.19, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), c, 0, -0.02, 0, 0, 0);
    boxP(L, 0.4, 0.04, 0.3, c.clone().multiplyScalar(0.7), 0, -0.06, 0);
  }
  function templateFor(t) {
    if (templates[t]) return templates[t];
    var it = CFG.LOOT_ITEMS[t], L = [];
    if (it.kind === 'heal') {
      if (t === 'bandage') boxP(L, 0.3, 0.14, 0.2, 0xd8c9a3, 0, 0, 0);
      else if (t === 'health') { boxP(L, 0.42, 0.24, 0.3, 0xf2f5f8, 0, 0, 0); boxP(L, 0.3, 0.07, 0.06, 0xe2503c, 0, 0.13, 0); boxP(L, 0.07, 0.07, 0.3, 0xe2503c, 0, 0.13, 0); }
      else if (t === 'medkit') { boxP(L, 0.5, 0.3, 0.36, 0xc8382a, 0, 0, 0); boxP(L, 0.3, 0.08, 0.07, 0xf2f5f8, 0, 0.16, 0); boxP(L, 0.08, 0.08, 0.3, 0xf2f5f8, 0, 0.16, 0); }
      else if (t === 'energy') cylP(L, 0.1, 0.32, 0x37c8d8, 0, 0, 0);
      else cylP(L, 0.09, 0.22, 0xf0f2f4, 0, 0, 0);
    } else if (it.kind === 'ammo') {
      boxP(L, 0.4, 0.22, 0.26, 0x4a6238, 0, 0, 0); boxP(L, 0.42, 0.06, 0.28, 0x39502b, 0, 0.13, 0);
    } else if (it.kind === 'armor') {
      vestParts(L, it.lvl);
    } else if (it.kind === 'helm') {
      helmParts(L, it.l);
    } else if (it.kind === 'att') {
      var cc = CAT_COLOR[CFG.ATTACH[it.a].cat] || 0xd7dee6;
      boxP(L, 0.26, 0.14, 0.14, 0x2c3138, 0, 0, 0); boxP(L, 0.1, 0.08, 0.15, cc, 0.05, 0.03, 0);
    } else if (it.kind === 'weapon') {
      gunParts(L, it.w);
    } else if (it.kind === 'gear' && it.g === 'emp') {
      boxP(L, 0.34, 0.12, 0.42, 0x2a3138, 0, 0, 0);
      P(L, new THREE.CylinderGeometry(0.11, 0.11, 0.04, 14), 0x51d0e8, 0, 0.08, 0, 0, 0);
      boxP(L, 0.05, 0.03, 0.05, 0xff3428, 0.12, 0.08, 0.14);
    } else if (it.kind === 'gear' && it.g === 'c4') {
      boxP(L, 0.34, 0.12, 0.44, 0xc9b98a, 0, 0, 0); boxP(L, 0.18, 0.05, 0.18, 0x1d2126, 0, 0.085, 0); boxP(L, 0.04, 0.03, 0.04, 0xff3428, 0.05, 0.12, 0.05);
    } else if (it.kind === 'gear' && it.g === 'shield') {
      boxP(L, 0.62, 0.92, 0.08, 0x2b3a4c, 0, 0.1, 0); boxP(L, 0.66, 0.06, 0.10, 0x8a949e, 0, 0.58, 0); boxP(L, 0.66, 0.06, 0.10, 0x8a949e, 0, -0.36, 0);
      boxP(L, 0.30, 0.09, 0.02, 0x9fd8ff, 0, 0.30, 0.05); boxP(L, 0.14, 0.05, 0.02, 0xe2b050, 0, -0.10, 0.05);
    } else if (it.kind === 'gear' && it.g === 'visor') {
      boxP(L, 0.30, 0.09, 0.07, 0x23282e, 0, 0, 0); boxP(L, 0.11, 0.07, 0.04, 0x37c8d8, -0.075, 0, 0.035); boxP(L, 0.11, 0.07, 0.04, 0x37c8d8, 0.075, 0, 0.035); boxP(L, 0.34, 0.04, 0.05, 0x14181c, 0, 0, -0.03);
    } else if (it.kind === 'gear' && it.g === 'drone') {
      boxP(L, 0.34, 0.1, 0.34, 0x2a3038, 0, 0, 0); boxP(L, 0.5, 0.03, 0.05, 0x171b20, 0, 0.01, 0, Math.PI / 4); boxP(L, 0.5, 0.03, 0.05, 0x171b20, 0, 0.01, 0, -Math.PI / 4);
    } else if (it.kind === 'gear' && it.g === 'mine') {
      P(L, new THREE.CylinderGeometry(0.16, 0.19, 0.07, 10), 0x232a22, -0.14, 0, 0, 0, 0); P(L, new THREE.CylinderGeometry(0.16, 0.19, 0.07, 10), 0x232a22, 0.14, 0, 0.1, 0, 0);
      boxP(L, 0.045, 0.02, 0.045, 0xff3428, -0.14, 0.05, 0); boxP(L, 0.045, 0.02, 0.045, 0xff3428, 0.14, 0.05, 0.1);
    } else if (it.kind === 'gear' && it.g === 'molotov') {
      cylP(L, 0.08, 0.3, 0x3a5a3a, 0, 0, 0); cylP(L, 0.03, 0.12, 0x2a2a2a, 0, 0.2, 0); boxP(L, 0.08, 0.05, 0.03, 0xe2d0a0, 0, 0.27, 0);
    } else {
      boxP(L, 0.3, 0.2, 0.3, 0xd7dee6, 0, 0, 0);
    }
    templates[t] = mergeParts(L);
    return templates[t];
  }

  var ANIM_R2 = 70 * 70;   // bob/spin radius squared: beyond this an item just sits

  function buildItem(e) { // e: {id, t, p, active}
    var it = CFG.LOOT_ITEMS[e.t];
    if (!it) return;
    var grp = new THREE.Group();
    var body = new THREE.Mesh(templateFor(e.t), ITEM_MAT);
    body.castShadow = false; body.receiveShadow = false;
    grp.add(body);
    var ring = new THREE.Mesh(RING_GEO, RING_MAT[it.rar] || RING_MAT.c);
    ring.position.y = -0.35;
    var hidden = !!e.h;
    if (!hidden) grp.add(ring);
    grp.position.set(e.p[0], e.p[1], e.p[2]);
    grp.visible = !!e.active;
    scene.add(grp);
    items[e.id] = { grp: grp, ring: ring, t: e.t, base: e.p[1], active: !!e.active, pop: 0, hidden: hidden, near: true };
  }

  function disposeAll() {
    for (var id in items) scene.remove(items[id].grp);
    items = {};
    crates.forEach(function (c) {
      scene.remove(c.grp);
      if (c.beam) { scene.remove(c.beam); c.beam.material.dispose(); }
      c.smoke.forEach(function (s) { scene.remove(s); s.material.dispose(); });
    });
    crates = [];
  }

  function build(s) { scene = s; }

  var MINE_GEO = new THREE.CylinderGeometry(0.16, 0.19, 0.07, 10), MINE_MAT = new THREE.MeshLambertMaterial({ color: 0x232a22 });
  var LED_GEO = new THREE.BoxGeometry(0.045, 0.02, 0.045), LED_MAT = new THREE.MeshBasicMaterial({ color: 0xff3428 });
  function mineAdd(d) {
    if (!scene || mines[d.id]) return;
    var grp = new THREE.Group();
    var body = new THREE.Mesh(MINE_GEO, MINE_MAT);   /* v2.0: shared, like every pickup */
    grp.add(body);
    var led = new THREE.Mesh(LED_GEO, LED_MAT);
    led.position.y = 0.05; grp.add(led);
    grp.position.set(d.x, d.y, d.z);
    scene.add(grp);
    mines[d.id] = { grp: grp, led: led };
  }
  function mineBoom(id) {
    var m = mines[id];
    if (!m) return;
    scene.remove(m.grp);
    delete mines[id];
  }
  /* ===================== v9.4 — STRIKE DRONE RENDERING ====================

     Drones arrive in the normal snapshot (`snap.dr`) and are drawn here rather
     than in avatars.js, because they are world objects like mines and airdrop
     crates, not players — they have no rig, no name plate and no team colour on
     the body.

     What they DO have is a status light, and it is the whole reason the weapon
     is fair. Amber while it hunts, red while it locks and dives. A player who
     looks up can tell the difference between "that is going somewhere" and
     "that is coming for me", and act accordingly. Making the light purely
     decorative would have quietly removed the counter-play. */
  var drones = {}, DRONE_GEO = null, DRONE_LED_GEO = new THREE.SphereGeometry(0.055, 8, 6);
  function droneSync(list) {
    if (!scene) return;
    var seen = {};
    (list || []).forEach(function (d) {
      seen[d.i] = 1;
      var e = drones[d.i];
      if (!e) {
        var grp = new THREE.Group();
        if (!DRONE_GEO) {
          var L = [];
          boxP(L, 0.34, 0.1, 0.34, 0x2a3038, 0, 0, 0);
          [[0.26, 0.26], [-0.26, 0.26], [0.26, -0.26], [-0.26, -0.26]].forEach(function (o) {
            boxP(L, 0.22, 0.03, 0.05, 0x171b20, o[0] * 0.55, 0.01, o[1] * 0.55, Math.atan2(o[1], o[0]));
            P(L, new THREE.CylinderGeometry(0.16, 0.16, 0.012, 8), 0x39424c, o[0], 0.05, o[1], 0, 0);
          });
          DRONE_GEO = mergeParts(L);   /* v2.0: one merged mesh per drone, shared geometry */
        }
        grp.add(new THREE.Mesh(DRONE_GEO, ITEM_MAT));
        var led = new THREE.Mesh(DRONE_LED_GEO, new THREE.MeshBasicMaterial({ color: 0xffb020 }));
        led.position.y = 0.09; grp.add(led);
        scene.add(grp);
        e = drones[d.i] = { grp: grp, led: led, spin: 0 };
      }
      e.grp.position.set(d.p[0], d.p[1], d.p[2]);
      e.spin += 0.6;
      e.grp.rotation.y = e.spin;
      var hot = (d.f === 'lock' || d.f === 'dive');
      e.led.material.color.setHex(hot ? 0xff2a24 : 0xffb020);
      e.led.visible = hot ? (Math.floor(performance.now() / 90) % 2 === 0) : true;
    });
    for (var k in drones) {
      if (!seen[k]) { scene.remove(drones[k].grp); drones[k].led.material.dispose(); delete drones[k]; }
    }
  }
  function droneBoom(d) {
    var e = drones[d.id];
    if (e) { scene.remove(e.grp); e.led.material.dispose(); delete drones[d.id]; }
    if (typeof FX !== 'undefined') {
      /* A harmless airburst still gets an explosion, and a smaller one — the
         player who shot it down has earned the feedback, and the size tells
         everyone nearby whether they need to care. */
      FX.explosion(new THREE.Vector3(d.p[0], d.p[1], d.p[2]), d.lethal ? CFG.GEAR.drone.radius : 1.6);
    }
    if (typeof AudioSys !== 'undefined') AudioSys.explosion(new THREE.Vector3(d.p[0], d.p[1], d.p[2]), !!d.lethal);
  }
  function droneReset() {
    for (var k in drones) { if (scene) scene.remove(drones[k].grp); }
    drones = {};
  }
  /* Exposed so the weapon system can ray-test against drones without owning
     their meshes: returns id + world position + radius for each live drone. */
  function droneTargets() {
    var out = [];
    for (var k in drones) out.push({ id: Number(k), pos: drones[k].grp.position, r: 0.42 });
    return out;
  }

  function mineReset() {
    for (var id in mines) scene.remove(mines[id].grp);
    mines = {};
  }

  function init(list) {
    if (!scene) return;
    disposeAll();
    mineReset();
    bombReset();                                  /* v1.0b: a fuse does not survive a new match */
    if (FX.fireZonesReset) FX.fireZonesReset();
    (list || []).forEach(buildItem);
  }
  function onAdd(list) { (list || []).forEach(buildItem); }

  function rarityColorOf(t) { var it = CFG.LOOT_ITEMS[t]; return it ? RAR_COLOR[it.rar] : 0xd7dee6; }

  function onCollected(d, mine) {
    var e = items[d.id];
    if (!e) return;
    e.active = false; e.grp.visible = false;
    var pos = e.grp.position;
    var it = CFG.LOOT_ITEMS[e.t] || {};
    AudioSys.pickupSnd(it.kind === 'heal' ? 'health' : 'armor', pos);
    if (!d.expired) FX.pickupBurst(pos.clone(), rarityColorOf(e.t));   /* v1.0u: an expiring item just goes; no burst */
    if (mine && (it.kind === 'heal' || it.kind === 'armor') && it.label) UI.toast(it.label);
    /* v10.9: an airdrop item never comes back, so hiding it keeps a mesh and
       its buffers alive for the rest of the match. The server says which ones
       are retired (`gone`); map loot respawns and must stay. Nothing in this
       file shares geometry or materials between items, so freeing this group's
       own resources cannot affect another pickup. */
    if (d.gone) { scene.remove(e.grp); freeGroup(e.grp); delete items[d.id]; }
  }
  /* v2.0: item geometry and materials are SHARED templates (see the head of
     this file) — an instance owns nothing but its group, so there is nothing
     to dispose. Kept as a function so the call sites read the same. */
  function freeGroup(g) { }
  function onSpawn(id) {
    var e = items[id];
    if (!e) return;
    e.active = true; e.grp.visible = true; e.pop = 1;
  }

  /* ---------------- airdrop crates ---------------- */
  var CRATE_GEO = null;
  var BEAM_GEO = new THREE.CylinderGeometry(0.32, 0.5, 60, 10, 1, true);   /* v2.0: 26 -> 60 m — visible across the whole map */
  var SMOKE_MAT = new THREE.SpriteMaterial({ color: 0xcf3a2a, transparent: true, opacity: 0.5, depthWrite: false });
  function airdrop(x, z, landAt) {
    AudioSys.planeFlyby();
    if (!CRATE_GEO) {
      var L = [];
      boxP(L, 1.1, 1.1, 1.1, 0x6b4f2e, 0, 0, 0); boxP(L, 1.14, 0.16, 1.14, 0x8a6a3d, 0, 0.35, 0);
      boxP(L, 0.2, 1.12, 1.12, 0x4f3a22, 0, 0, 0); boxP(L, 1.12, 1.12, 0.2, 0x4f3a22, 0, 0, 0);
      CRATE_GEO = mergeParts(L);
    }
    var grp = new THREE.Group();
    var m = new THREE.Mesh(CRATE_GEO, ITEM_MAT); m.castShadow = true; grp.add(m);
    grp.position.set(x, 60, z);
    scene.add(grp);
    crates.push({ grp: grp, smoke: [], beam: null, x: x, z: z, landAt: landAt, landed: false, life: 0 });
  }
  function landCrate(c) {
    c.landed = true;
    c.grp.position.y = 0.55;
    AudioSys.crateThud(c.grp.position);
    FX.smokeCloud(new THREE.Vector3(c.x, 0.6, c.z), 3.2, 4);
    // vertical light beacon
    var beam = new THREE.Mesh(BEAM_GEO,
      new THREE.MeshBasicMaterial({ color: 0xf0c040, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(c.x, 30, c.z);
    scene.add(beam);
    c.beam = beam;
    // persistent smoke column sprites
    for (var i = 0; i < 3; i++) {
      var s = new THREE.Sprite(SMOKE_MAT.clone());
      s.position.set(c.x + (Math.random() - 0.5) * 0.5, 1 + i * 0.9, c.z + (Math.random() - 0.5) * 0.5);
      s.scale.setScalar(0.8 + i * 0.5);
      s.userData.rise = 0.55 + Math.random() * 0.4;
      scene.add(s);
      c.smoke.push(s);
    }
  }
  function getBeacons() {
    return crates.filter(function (c) { return c.landed; })
      .map(function (c) { return { x: c.x, z: c.z }; });
  }

  var _px = 0, _pz = 0, _lodAt = 0;
  function update(dt) {
    var t = performance.now();
    updateBombs(t);   /* v1.0b */
    /* v2.0: the animation is gated by distance to the player, re-sorted every
       250 ms; an item beyond ANIM_R sits still and costs nothing per frame */
    var relod = t - _lodAt > 250;
    if (relod && typeof PlayerCtl !== 'undefined' && PlayerCtl.pos) { _px = PlayerCtl.pos.x; _pz = PlayerCtl.pos.z; _lodAt = t; }
    for (var id in items) {
      var e = items[id];
      if (!e.active) continue;
      if (e.hidden) continue;
      if (relod) { var dx = e.grp.position.x - _px, dz = e.grp.position.z - _pz; e.near = dx * dx + dz * dz < ANIM_R2; if (!e.near) { e.grp.position.y = e.base; e.grp.scale.set(1, 1, 1); } }
      if (!e.near) continue;
      e.grp.rotation.y += dt * 1.4;
      e.grp.position.y = e.base + Math.sin(t * 0.0022 + Number(id)) * 0.07;
      if (e.pop > 0) { e.pop = Math.max(0, e.pop - dt * 3); var s = 1 + e.pop * 0.6; e.grp.scale.set(s, s, s); }
      else if (e.grp.scale.x !== 1) e.grp.scale.set(1, 1, 1);
    }
    var blink = (t % 900) < 450;
    for (var mid in mines) mines[mid].led.visible = blink;
    for (var i = crates.length - 1; i >= 0; i--) {
      var c = crates[i];
      if (!c.landed) {
        var remain = Math.max(0, (c.landAt - Date.now()) / 1000);
        c.grp.position.y = 0.55 + Math.min(1, remain / CFG.AIRDROP.fallSec) * 59.45;
        c.grp.rotation.y += dt * 0.5;
        if (remain <= 0) landCrate(c);
      } else {
        c.life += dt;
        c.smoke.forEach(function (s) {
          s.position.y += s.userData.rise * dt;
          if (s.position.y > 7) s.position.y = 1;
          s.material.opacity = 0.5 * Math.max(0, 1 - c.life / (CFG.AIRDROP.crateTtlSec || 60));
        });
        if (c.beam) c.beam.material.opacity = 0.26 * Math.max(0, 1 - c.life / ((CFG.AIRDROP.crateTtlSec || 60) * 0.8));
        /* v2.0 (Rahul: "remove the loot box from the map in 60 seconds"): the
           crate, its beam and its smoke are all gone at crateTtlSec; the box no
           longer stays as a prop, so nothing accumulates over a match. */
        if (c.life > (CFG.AIRDROP.crateTtlSec || 60)) {
          c.smoke.forEach(function (s) { scene.remove(s); s.material.dispose(); });
          if (c.beam) { scene.remove(c.beam); c.beam.material.dispose(); }
          scene.remove(c.grp);
          crates.splice(i, 1);
        }
      }
    }
  }

  /* ===== v1.0b - PLANTED C4 =====
     A brick stuck where the ray met the wall, LED blinking faster as the fuse
     runs down; removed on bombBoom (the FX module draws the blast). */
  var bombs = {};
  var BOMB_MAT = new THREE.MeshLambertMaterial({ color: 0xc9b98a });
  var LED_ON = new THREE.MeshLambertMaterial({ color: 0x400000, emissive: 0xff3428 });
  var LED_OFF = new THREE.MeshLambertMaterial({ color: 0x200000 });
  function bombPlanted(d) {
    if (!scene || !d || bombs[d.id]) return;
    var g = new THREE.Group();
    var brick = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.16), BOMB_MAT); g.add(brick);
    var led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), LED_ON); led.position.set(0.1, 0.06, 0.09); g.add(led);
    g.position.set(d.p[0], d.p[1], d.p[2]);
    scene.add(g);
    bombs[d.id] = { grp: g, led: led, at: d.at || 0, fuse: d.fuse || 5, born: performance.now() };
  }
  function bombBoom(id) {
    var b = bombs[id];
    if (!b) return;
    scene.remove(b.grp);
    b.grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    delete bombs[id];
  }
  function bombReset() { for (var id in bombs) bombBoom(id); }
  function updateBombs(t) {
    for (var id in bombs) {
      var b = bombs[id];
      var left = Math.max(0, b.fuse * 1000 - (t - b.born));
      var period = 120 + 500 * (left / (b.fuse * 1000));
      b.led.material = (Math.floor(t / period) % 2) ? LED_ON : LED_OFF;
    }
  }

  return {
    build: build, init: init, onAdd: onAdd,
    bombPlanted: bombPlanted, bombBoom: bombBoom, bombReset: bombReset,   /* v1.0b */
    onCollected: onCollected, onSpawn: onSpawn,
    airdrop: airdrop, getBeacons: getBeacons,
    mineAdd: mineAdd, mineBoom: mineBoom, mineReset: mineReset,
    droneSync: droneSync, droneBoom: droneBoom, droneReset: droneReset, droneTargets: droneTargets,
    update: update
  };
})();
