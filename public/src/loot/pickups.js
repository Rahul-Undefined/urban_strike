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

  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function box(g, w, h, d, c, x, y, z, ry) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x || 0, y || 0, z || 0);
    if (ry) m.rotation.y = ry;
    g.add(m); return m;
  }
  function cyl(g, r, h, c, x, y, z) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), mat(c));
    m.position.set(x || 0, y || 0, z || 0);
    g.add(m); return m;
  }

  function vestMesh(g, lvl) {
    var c = new THREE.Color(CFG.ARMOR[lvl].color);
    box(g, 0.42, 0.5, 0.16, c, 0, 0, 0);
    box(g, 0.5, 0.1, 0.18, c.clone().multiplyScalar(0.75), 0, 0.26, 0);
    for (var i = 0; i < lvl; i++) box(g, 0.07, 0.05, 0.02, 0xf2f5f8, -0.12 + i * 0.12, 0.05, 0.095);
  }
  function gunMesh(g, w) {
    var gm = 0x3a4048;
    box(g, 0.62, 0.1, 0.07, gm, 0, 0, 0);                       // receiver
    box(g, 0.34, 0.045, 0.05, 0x2c3138, 0.42, 0.02, 0);         // barrel
    box(g, 0.07, 0.16, 0.05, gm, -0.05, -0.12, 0);              // mag
    box(g, 0.16, 0.12, 0.05, 0x50565e, -0.36, -0.03, 0);        // stock
    if (CFG.WEAPONS[w] && CFG.WEAPONS[w].scope) box(g, 0.2, 0.05, 0.04, 0x22262c, 0.05, 0.09, 0);
    g.rotation.z = 0.5;
  }

  function meshFor(t) {
    var it = CFG.LOOT_ITEMS[t];
    var g = new THREE.Group();
    if (it.kind === 'heal') {
      if (t === 'bandage') box(g, 0.3, 0.14, 0.2, 0xd8c9a3, 0, 0, 0);
      else if (t === 'health') { box(g, 0.42, 0.24, 0.3, 0xf2f5f8, 0, 0, 0); box(g, 0.3, 0.07, 0.06, 0xe2503c, 0, 0.13, 0); box(g, 0.07, 0.07, 0.3, 0xe2503c, 0, 0.13, 0); }
      else if (t === 'medkit') { box(g, 0.5, 0.3, 0.36, 0xc8382a, 0, 0, 0); box(g, 0.3, 0.08, 0.07, 0xf2f5f8, 0, 0.16, 0); box(g, 0.08, 0.08, 0.3, 0xf2f5f8, 0, 0.16, 0); }
      else if (t === 'energy') cyl(g, 0.1, 0.32, 0x37c8d8, 0, 0, 0);
      else cyl(g, 0.09, 0.22, 0xf0f2f4, 0, 0, 0); // painkillers
    } else if (it.kind === 'ammo') {
      box(g, 0.4, 0.22, 0.26, 0x4a6238, 0, 0, 0);
      box(g, 0.42, 0.06, 0.28, 0x39502b, 0, 0.13, 0);
    } else if (it.kind === 'armor') {
      vestMesh(g, it.lvl);
    } else if (it.kind === 'att') {
      var cc = CAT_COLOR[CFG.ATTACH[it.a].cat] || 0xd7dee6;
      box(g, 0.26, 0.14, 0.14, 0x2c3138, 0, 0, 0);
      box(g, 0.1, 0.08, 0.15, cc, 0.05, 0.03, 0);
    } else if (it.kind === 'weapon') {
      gunMesh(g, it.w);
    } else if (it.kind === 'gear' && it.g === 'visor') {
      /* v10.10 RECON VISOR — goggles: a dark strap with two cyan lenses. Gear
         had no mesh branch at all until now (drone and mine are start-kit or
         crate items that never sat on the floor), so anything falling through
         got the bare rarity ring and nothing else. */
      box(g, 0.30, 0.09, 0.07, 0x23282e, 0, 0, 0);
      box(g, 0.11, 0.07, 0.04, 0x37c8d8, -0.075, 0, 0.035);
      box(g, 0.11, 0.07, 0.04, 0x37c8d8, 0.075, 0, 0.035);
      box(g, 0.34, 0.04, 0.05, 0x14181c, 0, 0, -0.03);
    }
    return g;
  }

  function buildItem(e) { // e: {id, t, p, active}
    var it = CFG.LOOT_ITEMS[e.t];
    if (!it) return;
    var grp = new THREE.Group();
    grp.add(meshFor(e.t));
    var rc = RAR_COLOR[it.rar];
    var ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.02, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: rc, transparent: true, opacity: it.rar === 'l' ? 0.85 : 0.55, side: THREE.DoubleSide }));
    ring.position.y = -0.35;
    grp.add(ring);
    grp.position.set(e.p[0], e.p[1], e.p[2]);
    grp.visible = !!e.active;
    scene.add(grp);
    items[e.id] = { grp: grp, ring: ring, t: e.t, base: e.p[1], active: !!e.active, pop: 0 };
  }

  function disposeAll() {
    for (var id in items) scene.remove(items[id].grp);
    items = {};
    crates.forEach(function (c) {
      scene.remove(c.grp);
      if (c.beam) scene.remove(c.beam);
      c.smoke.forEach(function (s) { scene.remove(s); });
    });
    crates = [];
  }

  function build(s) { scene = s; }

  function mineAdd(d) {
    if (!scene || mines[d.id]) return;
    var grp = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.07, 10), mat(0x232a22));
    grp.add(body);
    var led = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.045),
      new THREE.MeshBasicMaterial({ color: 0xff3428 }));
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
  var drones = {};
  function droneSync(list) {
    if (!scene) return;
    var seen = {};
    (list || []).forEach(function (d) {
      seen[d.i] = 1;
      var e = drones[d.i];
      if (!e) {
        var grp = new THREE.Group();
        var body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), mat(0x2a3038));
        grp.add(body);
        // four rotor booms, so the silhouette reads as a quadcopter from below
        [[0.26, 0.26], [-0.26, 0.26], [0.26, -0.26], [-0.26, -0.26]].forEach(function (o) {
          var arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.05), mat(0x171b20));
          arm.position.set(o[0] * 0.55, 0.01, o[1] * 0.55);
          arm.rotation.y = Math.atan2(o[1], o[0]);
          grp.add(arm);
          var rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 8), mat(0x39424c));
          rotor.position.set(o[0], 0.05, o[1]);
          grp.add(rotor);
        });
        var led = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffb020 }));
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
      if (!seen[k]) { scene.remove(drones[k].grp); delete drones[k]; }
    }
  }
  function droneBoom(d) {
    var e = drones[d.id];
    if (e) { scene.remove(e.grp); delete drones[d.id]; }
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
    FX.pickupBurst(pos.clone(), rarityColorOf(e.t));
    if (mine && (it.kind === 'heal' || it.kind === 'armor') && it.label) UI.toast(it.label);
    /* v10.9: an airdrop item never comes back, so hiding it keeps a mesh and
       its buffers alive for the rest of the match. The server says which ones
       are retired (`gone`); map loot respawns and must stay. Nothing in this
       file shares geometry or materials between items, so freeing this group's
       own resources cannot affect another pickup. */
    if (d.gone) { scene.remove(e.grp); freeGroup(e.grp); delete items[d.id]; }
  }
  function freeGroup(g) {
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
  function onSpawn(id) {
    var e = items[id];
    if (!e) return;
    e.active = true; e.grp.visible = true; e.pop = 1;
  }

  /* ---------------- airdrop crates ---------------- */
  function airdrop(x, z, landAt) {
    AudioSys.planeFlyby();
    var grp = new THREE.Group();
    box(grp, 1.1, 1.1, 1.1, 0x6b4f2e, 0, 0, 0);
    box(grp, 1.14, 0.16, 1.14, 0x8a6a3d, 0, 0.35, 0);
    box(grp, 0.2, 1.12, 1.12, 0x4f3a22, 0, 0, 0);
    box(grp, 1.12, 1.12, 0.2, 0x4f3a22, 0, 0, 0);
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
    var beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.5, 26, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf0c040, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(c.x, 13, c.z);
    scene.add(beam);
    c.beam = beam;
    // persistent smoke column sprites
    for (var i = 0; i < 5; i++) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xcf3a2a, transparent: true, opacity: 0.5, depthWrite: false }));
      s.position.set(c.x + (Math.random() - 0.5) * 0.5, 1 + i * 0.9, c.z + (Math.random() - 0.5) * 0.5);
      s.scale.setScalar(0.8 + i * 0.5);
      s.userData.rise = 0.55 + Math.random() * 0.4;
      scene.add(s);
      c.smoke.push(s);
    }
  }
  function getBeacons() {
    return crates.filter(function (c) { return c.landed && c.life < 60; })
      .map(function (c) { return { x: c.x, z: c.z }; });
  }

  function update(dt) {
    var t = performance.now();
    for (var id in items) {
      var e = items[id];
      if (!e.active) continue;
      e.grp.rotation.y += dt * 1.4;
      e.grp.position.y = e.base + Math.sin(t * 0.0022 + Number(id)) * 0.07;
      if (e.pop > 0) { e.pop = Math.max(0, e.pop - dt * 3); var s = 1 + e.pop * 0.6; e.grp.scale.set(s, s, s); }
      else e.grp.scale.set(1, 1, 1);
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
          s.material.opacity = 0.5 * Math.max(0, 1 - c.life / 60);
        });
        if (c.beam) c.beam.material.opacity = 0.26 * Math.max(0, 1 - c.life / 45);
        if (c.life > 60) {
          c.smoke.forEach(function (s) { scene.remove(s); });
          if (c.beam) scene.remove(c.beam);
          c.smoke = []; c.beam = null; // crate box itself stays as a prop
        }
      }
    }
  }

  return {
    build: build, init: init, onAdd: onAdd,
    onCollected: onCollected, onSpawn: onSpawn,
    airdrop: airdrop, getBeacons: getBeacons,
    mineAdd: mineAdd, mineBoom: mineBoom, mineReset: mineReset,
    droneSync: droneSync, droneBoom: droneBoom, droneReset: droneReset, droneTargets: droneTargets,
    update: update
  };
})();
