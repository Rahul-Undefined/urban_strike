/* URBAN SMALL 2 — v2.11. Two functions World.buildMap('urbansmall2') calls
   around the ordinary Urban Small build (world.js):

     World._restyleRealistic()  before the build: swaps the painted colour
                                skins in M for a realistic set (brick, concrete
                                panel, limestone, render, slab pavement, dark
                                asphalt, tar roofs). Returns the function that
                                puts M back — every other map keeps its look.
     World._turnQuarter(scene)  after the build: turns the WHOLE map 90 deg
                                about the vertical — every mesh, every collider,
                                the minimap layers, the stair records — with
                                (x, z) -> (z, -x). The tables (spawns, loot,
                                drops, lifts, districts) are turned the same way
                                in config, so nothing disagrees.

   Why a quarter turn and not new builders: Rahul asked for "Urban Small jaisa
   hi map, area ... building, station ka position change ... new feeling".
   The districts and every one of their stairs, lifts and routes are proven on
   Urban Small; a quarter turn moves every building (the railway station
   north edge -> west edge, the airport north-west -> south-west, the mall
   east -> north) while keeping each collider an exact axis-aligned box, so
   all of that proof carries over unchanged. A mirror would have flipped the
   sign text; a free rotation would have broken every box. */
(function () {
  if (typeof World === 'undefined') return;

  /* ============ REALISTIC MATERIALS ============
     Canvas textures at Urban's density (uvScale tiles a 256 px canvas every
     2 m, so 128 px = 1 m): a brick is 0.21 x 0.065 m, a concrete panel 1 m,
     a pavement slab 0.5 m. Made once, cached on World (materials survive
     World.reset; only geometry is disposed). */
  function makeSet(H) {
    var CT = H.canvasTex;
    function L(map) { return new THREE.MeshLambertMaterial({ map: map }); }
    function jitter(hex, a) {
      var cr = parseInt(hex.slice(1, 3), 16);
      var cg = parseInt(hex.slice(3, 5), 16);
      var cb = parseInt(hex.slice(5, 7), 16);
      var k = 1 + (Math.random() - 0.5) * a;
      return 'rgb(' + Math.min(255, cr * k | 0) + ',' + Math.min(255, cg * k | 0) + ',' + Math.min(255, cb * k | 0) + ')';
    }
    function grime(g, s, n) {
      g.fillStyle = 'rgba(20,18,16,0.10)';
      for (var i = 0; i < n; i++) g.fillRect(Math.random() * s, s - Math.random() * 60, 2 + Math.random() * 3, 20 + Math.random() * 40);
      g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, s - 22, s, 22);
    }
    function brick(base, mortar) {
      return L(CT(256, function (g, s) {
        g.fillStyle = mortar; g.fillRect(0, 0, s, s);
        var bh = 8, bw = 28;
        for (var row = 0; row * bh < s; row++) {
          var off = (row % 2) ? bw / 2 : 0;
          for (var x = -bw; x < s + bw; x += bw) {
            g.fillStyle = jitter(base, 0.22);
            g.fillRect(x + off + 1, row * bh + 1, bw - 2, bh - 2);
          }
        }
        grime(g, s, 8);
      }));
    }
    function panel(base, seam) {
      return L(CT(256, function (g, s) {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        for (var i = 0; i < 1400; i++) { g.fillStyle = jitter(base, 0.12); g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
        g.fillStyle = seam;
        for (var k = 0; k <= s; k += 128) { g.fillRect(k - 1, 0, 2, s); g.fillRect(0, k - 1, s, 2); }
        g.fillStyle = 'rgba(0,0,0,0.06)';
        for (var t = 0; t < 4; t++) g.fillRect(Math.random() * s, Math.random() * s, 40 + Math.random() * 60, 30 + Math.random() * 50);
        grime(g, s, 6);
      }));
    }
    function stone(base) {
      return L(CT(256, function (g, s) {
        g.fillStyle = 'rgba(60,54,46,1)'; g.fillRect(0, 0, s, s);
        var bh = 32, bw = 64;
        for (var row = 0; row * bh < s; row++) {
          var off = (row % 2) ? bw / 2 : 0;
          for (var x = -bw; x < s + bw; x += bw) { g.fillStyle = jitter(base, 0.10); g.fillRect(x + off + 1, row * bh + 1, bw - 2, bh - 2); }
        }
        grime(g, s, 5);
      }));
    }
    function render(base) {
      return L(CT(256, function (g, s) {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        for (var i = 0; i < 1800; i++) { g.fillStyle = jitter(base, 0.08); g.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
        grime(g, s, 7);
      }));
    }
    function slabs(base) {
      return L(CT(256, function (g, s) {
        g.fillStyle = 'rgba(70,72,76,1)'; g.fillRect(0, 0, s, s);
        for (var x = 0; x < s; x += 64) for (var z = 0; z < s; z += 64) { g.fillStyle = jitter(base, 0.10); g.fillRect(x + 1, z + 1, 62, 62); }
      }));
    }
    function asphalt(base) {
      return L(CT(256, function (g, s) {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        for (var i = 0; i < 2600; i++) { g.fillStyle = jitter(base, 0.35); g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); }
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1;
        for (var k = 0; k < 4; k++) { g.beginPath(); g.moveTo(Math.random() * s, Math.random() * s); g.lineTo(Math.random() * s, Math.random() * s); g.stroke(); }
      }));
    }
    return {
      /* the nine painted skins -> real building materials */
      facadeTeal: panel('#7a838c', 'rgba(40,44,48,0.55)'),     // grey precast panel
      facadeAmber: brick('#8f4a36', '#b9ab98'),                 // red brick, light mortar
      facadeRose: brick('#6f4436', '#a69a8a'),                  // brown brick
      facadeIndigo: panel('#5d636b', 'rgba(26,28,32,0.6)'),     // dark concrete
      facadeOlive: stone('#ae9f83'),                            // sandstone blocks
      facadeCoral: brick('#a05a40', '#c2b6a4'),                 // terracotta brick
      facadeMustard: stone('#c2b596'),                          // limestone
      facadeSky: panel('#9ba4ab', 'rgba(50,56,62,0.5)'),        // pale concrete
      facadeMint: render('#cdc9bd'),                            // off-white render
      /* and the shared surfaces */
      brick: brick('#7d4231', '#a99c8b'),
      plaster: render('#b9b5ab'),
      cream: stone('#bcae8d'),
      concrete: panel('#80858b', 'rgba(40,44,48,0.45)'),
      sidewalk: slabs('#9a9ca0'),
      asphalt: asphalt('#25282c'),
      roof: render('#34373b')
    };
  }

  World._restyleRealistic = function () {
    var H = World._internals(), M = H.M;
    var R = World._us2Mats || (World._us2Mats = makeSet(H));
    var saved = {};
    Object.keys(R).forEach(function (k) { if (M[k]) { saved[k] = M[k]; M[k] = R[k]; } });
    return function restore() { Object.keys(saved).forEach(function (k) { M[k] = saved[k]; }); };
  };

  /* ============ THE QUARTER TURN ============
     (x, z) -> (z, -x): three.js's +90 deg about +Y. Lights that light the
     whole world (sun, hemisphere, ambient) are left where they are — the sun
     stays where the sky has it; every lamp, sign and building turns. */
  function turnBox(c) {   // [x0, y0, z0, x1, y1, z1, ...] in place
    var x0 = c[0], x1 = c[3], z0 = c[2], z1 = c[5];
    c[0] = z0; c[3] = z1; c[2] = -x1; c[5] = -x0;
  }
  function turnRect(r) {  // [x0, z0, x1, z1, ...] in place
    var x0 = r[0], z0 = r[1], x1 = r[2], z1 = r[3];
    r[0] = z0; r[2] = z1; r[1] = -x1; r[3] = -x0;
  }
  World._turnQuarter = function (sceneRef) {
    var meshesTurned = 0;
    /* 1. the scene graph — every top-level object, about the world origin */
    /* The world lives in an INNER group (World._initPart1: `scene = new
       THREE.Group(); outer.add(scene)`), and the sun lives in it too. Turning
       the group would turn the sun with it and break followSun, which places
       the sun in the group's frame assuming identity. So the group stays put
       and its CHILDREN turn — every light that is not the world rig, every
       mesh — about the origin. */
    var G = (World._internals && World._internals().sceneRef && World._internals().sceneRef()) || sceneRef;
    try {
      if (THREE.Quaternion && THREE.Quaternion.prototype.setFromAxisAngle && G && G.children) {
        var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        G.children.slice().forEach(function (o) {
          if (o.isDirectionalLight || o.isHemisphereLight || o.isAmbientLight) return;
          if (o.isObject3D && !o.isMesh && !o.isLight && !o.isGroup && (!o.children || !o.children.length)) return;   // the sun's target
          if (o.position && o.position.applyQuaternion) o.position.applyQuaternion(q);
          if (o.quaternion && o.quaternion.premultiply) o.quaternion.premultiply(q);
          if (o.matrixAutoUpdate === false && o.updateMatrix) o.updateMatrix();
          meshesTurned++;
        });
        if (G.updateMatrixWorld) G.updateMatrixWorld(true);
      }
    } catch (e) { /* the gate harness's stub THREE has no quaternion maths: colliders only */ }
    /* 2. every collider, then the broadphase over them */
    var C = World._colliders();
    for (var i = 0; i < C.length; i++) turnBox(C[i]);
    World._rebuildGrid();
    /* 3. the minimap layers */
    (World.minimapShapes || []).forEach(turnRect);
    (World.minimapGround || []).forEach(turnRect);
    /* 4. the stair records (verify-climb and every post-pass read these) */
    (World._stairs() || []).forEach(function (f) {
      var sx = f.sx, sz = f.sz, dx = f.dirX, dz = f.dirZ;
      f.sx = sz; f.sz = -sx; f.dirX = dz; f.dirZ = -dx;
      if (f.endX !== undefined) { var ex = f.endX, ez = f.endZ; f.endX = ez; f.endZ = -ex; }
    });
    return meshesTurned;
  };
})();
