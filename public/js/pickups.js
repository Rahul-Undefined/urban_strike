/* Pickups — client visuals for server-authoritative health/armor spawns.
   The server decides who collects what; this module only draws and reacts. */
var Pickups = (function () {
  var scene = null, built = false;
  var items = [];   // id-indexed: {group, active, baseY, phase, pop}

  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }

  function healthMesh() {
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.42), mat(0xe8eef2));
    box.castShadow = true; g.add(box);
    var red = mat(0xd8342a);
    var c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.44), red); c1.position.y = 0.0; g.add(c1);
    var c2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.44), red); g.add(c2);
    var c3 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.3), red); g.add(c3);
    var c4 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.09), red); g.add(c4);
    return g;
  }
  function armorMesh(lvl) {
    var col = new THREE.Color(CFG.ARMOR[lvl].color);
    var g = new THREE.Group();
    var chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.2), mat(col.getHex()));
    chest.castShadow = true; g.add(chest);
    var collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.24), mat(0x2a2e34));
    collar.position.y = 0.27; g.add(collar);
    var strapL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.24), mat(0x2a2e34));
    strapL.position.x = -0.17; g.add(strapL);
    var strapR = strapL.clone(); strapR.position.x = 0.17; g.add(strapR);
    for (var i = 0; i < lvl; i++) { // level pips
      var pip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), mat(0xf5f7fa));
      pip.position.set(-0.1 + i * 0.1, -0.05, 0.115); g.add(pip);
    }
    return g;
  }
  function ring(colorHex) {
    var r = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.015, 22, 1, true),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    return r;
  }

  function build(sceneRef) {
    scene = sceneRef;
    if (built) return;
    built = true;
    CFG.PICKUP_SPOTS.forEach(function (s, i) {
      var type = s[0];
      var g = new THREE.Group();
      var mesh = type === 'health' ? healthMesh() : armorMesh(CFG.PICKUPS[type].lvl);
      g.add(mesh);
      var rc = type === 'health' ? 0xd8342a : new THREE.Color(CFG.ARMOR[CFG.PICKUPS[type].lvl].color).getHex();
      var rg = ring(rc); rg.position.y = -0.32; g.add(rg);
      g.position.set(s[1], s[2], s[3]);
      scene.add(g);
      items[i] = { group: g, type: type, active: true, baseY: s[2], phase: Math.random() * 6.28, pop: 1 };
    });
  }

  // list: [{id, active}] from the server at matchStart / late join
  function init(list) {
    if (!list) return;
    list.forEach(function (e) {
      var it = items[e.id];
      if (!it) return;
      it.active = !!e.active;
      it.group.visible = it.active;
      it.pop = 1;
    });
  }

  function onCollected(d, mine) {
    var it = items[d.id];
    if (it) { it.active = false; it.group.visible = false; }
    var kind = d.type === 'health' ? 'health' : 'armor';
    var pos = it ? it.group.position : null;
    AudioSys.pickupSnd(kind, mine ? null : pos);
    if (it) FX.impact(it.group.position.clone().add(new THREE.Vector3(0, 0.1, 0)));
    if (mine && d.type !== 'health') UI.toast('Armor ' + CFG.ARMOR[CFG.PICKUPS[d.type].lvl].label + ' equipped');
  }

  function onSpawn(id) {
    var it = items[id];
    if (!it) return;
    it.active = true;
    it.group.visible = true;
    it.pop = 0; // grows back in
  }

  function update(dt) {
    var t = performance.now() * 0.001;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.active) continue;
      it.pop = Math.min(1, it.pop + dt * 3.2);
      var s = 0.25 + 0.75 * it.pop;
      it.group.scale.setScalar(s);
      it.group.rotation.y = t * 1.4 + it.phase;
      it.group.position.y = it.baseY + Math.sin(t * 2 + it.phase) * 0.07;
    }
  }

  return { build: build, init: init, onCollected: onCollected, onSpawn: onSpawn, update: update };
})();
