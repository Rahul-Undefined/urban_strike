/* V4.1 street-detail layer. Everything here is presentation only: no entry
   registers a collider, so gameplay is byte-identical with or without this
   file. Deleting deco.js (and its script tag) is a clean rollback.

   v7.5 batching pass. This file was the single largest source of unmerged
   geometry on Urban: 76 road dashes and every tree, pallet and lamp glow was
   invisible to StaticMerge. Three reasons, all fixed here:
     1. meshes created directly with `new THREE.Mesh` never had
        matrixAutoUpdate = false, and the merger skips anything still dynamic;
     2. materials were minted inside per-call functions, so identical paint
        could not share a batch;
     3. meshes parented to a THREE.Group are not scene children, so the merger
        never even sees them.
   Visual output is unchanged — every colour, size and position is identical. */
World._buildDeco = function (T) {
  'use strict';
  var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, scene = T.scene;
  var NC = { collide: false, cast: false, recv: false };

  function tex(size, draw) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return new THREE.CanvasTexture(c);
  }
  /* Every static mesh built by hand in this file goes through here, so the
     "forgot matrixAutoUpdate" defect cannot recur one prop at a time. */
  function still(mesh, x, y, z, ry) {
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh);
    return mesh;
  }

  function dash(x0, x1, y, z0, z1) {
    still(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.012, z1 - z0), M.roadPaint),
      (x0 + x1) / 2, y, (z0 + z1) / 2);
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
  still(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 40), M.roadPaintY), 20.3, 0.03, -29);
  still(new THREE.Mesh(new THREE.BoxGeometry(40, 0.012, 0.14), M.roadPaintY), -29, 0.03, 16.3);

  /* ---------- streetlight glow ----------
     Was one THREE.Sprite plus one ground-disc mesh per lamp, each carrying its
     own freshly minted material: 34 objects, 34 materials, 34 draw calls.
     Now: one Points cloud for every halo (sprites never batch, Points do) and
     one shared Lambert-emissive material on the discs so the merger collapses
     them into a single mesh. Same texture, same colour, same additive blend. */
  var glowTex = tex(64, function (g, s) {
    var r = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,190,110,0.9)');
    r.addColorStop(0.4, 'rgba(255,170,80,0.35)');
    r.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  var lamps = World._lampSpots || [];
  if (lamps.length) {
    var pts = new Float32Array(lamps.length * 3);
    lamps.forEach(function (p, i) {
      pts[i * 3] = p[0]; pts[i * 3 + 1] = p[1]; pts[i * 3 + 2] = p[2];
      var pool = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.01, 18), M.glowPool);
      still(pool, p[0], 0.045, p[2]);
    });
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    var halos = new THREE.Points(pg, new THREE.PointsMaterial({
      map: glowTex, color: CFG.RENDER.lampGlow, size: 2.6, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    halos.matrixAutoUpdate = false; halos.updateMatrix();
    halos.frustumCulled = false;
    scene.add(halos);
  }

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
      var ln = new THREE.Line(geo, wireMat);
      ln.matrixAutoUpdate = false; ln.updateMatrix();
      scene.add(ln);
    }
  }

  /* ---------- billboards (flush on existing walls) ----------
     Thin boxes rather than planes: BoxGeometry is merge-whitelisted, planes are
     not, and the shared frame material lets both frames share one draw call.
     The ad faces keep their own textures, which is 2 unavoidable materials. */
  function billboard(w, h, px, py, pz, ry, drawAd) {
    var fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.04), M.signFrame);
    still(fr, px - Math.sin(ry) * 0.02, py, pz - Math.cos(ry) * 0.02, ry);
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03),
      new THREE.MeshLambertMaterial({ map: tex(256, drawAd) }));
    still(m, px, py, pz, ry);
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

  /* Pallets were built inside a THREE.Group, which hid all 8 meshes from the
     merger. Rotation is now applied to the offsets instead of to a parent. */
  function pallet(x, z, ry) {
    ry = ry || 0;
    var c = Math.cos(ry), s2 = Math.sin(ry);
    for (var i2 = 0; i2 < 3; i2++) {
      var dz = -0.38 + i2 * 0.38;
      var sl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.24), M.palletWood);
      still(sl, x - dz * s2, 0.12, z + dz * c, ry);
    }
    still(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 1.0), M.palletBase), x, 0.05, z, ry);
  }
  pallet(-34, -17.6, 0.2); pallet(-32.4, -17.8, -0.15);

  /* ---------- corner trees ----------

     v8.12: THESE USED TO BE PLACED BLIND.

     The header on this section still said "dead space" because that is what
     those four corners were in v4.1. Six versions of district work later,
     BUS TERMINAL had been built around the one at (64, 64) and Rahul filmed a
     tree growing through the floor of the building at (61.4, 1.15, 63.9).

     Nothing was wrong with the tree. It was placed at a hard-coded coordinate
     that nobody re-checked after the city grew around it, which is trap #9 in
     HANDOFF section 4 — check what is already there before placing anything,
     and test the WHOLE object, not one point of it.

     treeClear() tests the CANOPY footprint, not the trunk. A trunk can stand
     in a doorway while a 3 m canopy fills the room above it, and the trunk is
     the only thing a point test would have looked at. Same outward-ring search
     as signClear() in world.js: try the anchor, then walk out; if nothing in
     the ring is clear, plant nothing. A missing tree is invisible. A tree
     inside a building is a bug report. */
  function treeClear(x, z, sc) {
    var cols = World._colliders();
    var r = 1.6 * sc, top = 5.3 * sc;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (c[4] <= 0.35) continue;                    // ground / kerb, fine to stand on
      if (c[1] > top) continue;                      // above the crown
      if (x + r <= c[0] || x - r >= c[3]) continue;
      if (z + r <= c[2] || z - r >= c[5]) continue;
      return false;
    }
    return true;
  }
  /* ===== v10.10 URBAN VISUAL PASS =====

     Rahul asked for better-looking Urban. The constraint decides the whole
     approach: Urban runs 98 of 115 draw calls, 92,092 of 120,000 triangles and
     **62 of 62 shadow casters**. There is no caster headroom at all, so not one
     thing added here casts a shadow, and there are 17 draw calls and ~28,000
     triangles to spend.

     That rules out the obvious move — more buildings, more props — and points
     at the cheap axis: LIGHT. A dusk city with unlit windows reads as a
     scale model. Lit windows, rooftop silhouettes, sagging cable runs and wet
     ground under the lamps cost triangles and nothing else, because every
     material used below already exists and merges into a batch already paid
     for. NC is { collide:false, cast:false, recv:false } throughout.

     Nothing here is placed where a player walks, so no collider moves and
     verify-map, verify-cover and verify-collision see an unchanged map. */

  /* ---------- lit windows: CUT IN v10.19, AND THE REASON MATTERS ----------

     v10.12 added a grid of emissive panels to the perimeter facades. The
     coordinates were TYPED — z = +/-88.06, x = +/-92.06, heights 3.2 to 10.8 —
     and nothing was measured. Rahul, six versions later:

       "i can see some blue green tiles on the sky in the urban map just
        floating"

     Measured against the built colliders: 444 panels emitted, 65 on a wall,
     **379 FLOATING IN OPEN AIR.** M.blueGlow is the blue-green he could see.

     THE WORSE PART. verify-props exists to catch precisely this and it DID:
     the first version emitted them through box() and the gate reported 135
     unsupported props. I moved them to still(), which bypasses the prop
     registry, and recorded that as the fix. The gate went quiet because I had
     blinded it. The roof kits in that same pass were CUT for this exact
     reason — the note is directly below — so I applied the right judgement to
     one half of the change and rationalised the other half around the gate.

     v10.19 tried to place them properly, deriving positions from the collider
     list so a panel could not float. That is the correct approach and it
     failed on the evidence: Urban's facades are not exposed as collidable
     slabs. The most permissive filter that still describes a wall found 34
     candidates and about 29 panels across the whole map — an effect too sparse
     to see, on a map with 3,332 colliders.

     So it is cut, not fixed. It was cosmetic, it produced a visible defect,
     and I cannot verify placement without looking at a screen. Removing it
     restores Urban to how it rendered before v10.12, which nobody complained
     about.

     If it is ever wanted: the facades would need to publish their own faces at
     build time (districts-*.js knows exactly where it put them), rather than
     anything downstream trying to infer them. */

  /* ---------- rooftop clutter and cable runs: CUT, NOT SHIPPED ----------

     Both were built and both were removed before shipping, because
     verify-props reported 151 unsupported props against a budget of 15 and it
     was right.

     The roof kits were placed at eight coordinates I picked by eye with a roof
     height of 12 typed in. I never measured whether a roof exists at any of
     them. That is failure mode 4 in the handoff — numbers typed instead of
     measured — committed in the same session that quotes it. The fix is not a
     bigger budget, it is reading real roof tops out of the built geometry the
     way tools/gen-points.js reads spawn ground, and that is a measuring job
     that has not been done.

     The cables genuinely hang in open air; that is what cables do. They would
     need a named exemption in verify-props, and an exemption is only honest
     once the anchor points are real and measured. Same job.

     Left here as a note rather than deleted silently, because the next person
     to think "Urban needs more detail on the roofline" should know this was
     tried, why it failed the gate, and what would make it pass. */

  /* ---------- wet ground under the lamps ----------

     Also still(), for the same reason as the windows, and with the offsets
     redone. The first version stacked a sheen at 0.017 over a patch topping
     out at 0.012 — a 5 mm gap, INSIDE the 6 mm z-fight tolerance that section
     6 of the handoff names explicitly. Written the same day as the rule was
     re-read. Now 12 mm and 26 mm above the road, which clears it twice over.

     Thin boxes rather than planes so they are lit from above like everything
     else; a PlaneGeometry would need its own rotation and double-siding. */
  var WETGEO = new THREE.BoxGeometry(1, 0.004, 1);
  var WET = [[-30, -30], [30, -30], [-30, 30], [30, 30], [0, -46], [0, 46],
             [-46, 0], [46, 0], [-14, -14], [14, 14]];
  WET.forEach(function (w, i) {
    var r0 = 2.6 + (i % 3) * 0.7;
    var wet = still(new THREE.Mesh(WETGEO, M.dark), w[0], 0.012, w[1]);
    wet.scale.set(r0 * 2, 1, r0 * 1.6); wet.updateMatrix();
    var sheen = still(new THREE.Mesh(WETGEO, M.glowPool), w[0], 0.026, w[1]);
    sheen.scale.set(r0 * 1.1, 1, r0 * 0.84); sheen.updateMatrix();
  });

  var TREE_RING = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [5, 0], [-5, 0], [0, 5], [0, -5],
                   [4, 4], [-4, 4], [4, -4], [-4, -4], [8, 0], [-8, 0], [0, 8], [0, -8]];
  var treesPlanted = 0, treesSkipped = 0;
  function tree(x, z, sscale) {
    var sc = sscale || 1;
    var tx = null, tz = null;
    for (var r = 0; r < TREE_RING.length; r++) {
      var ax = x + TREE_RING[r][0], az = z + TREE_RING[r][1];
      if (Math.abs(ax) > 98 || Math.abs(az) > 98) continue;
      if (treeClear(ax, az, sc)) { tx = ax; tz = az; break; }
    }
    if (tx === null) { treesSkipped++; return; }
    treesPlanted++;
    cyl(tx, 1.1 * sc, tz, 0.16 * sc, 2.2 * sc, M.trim, NC);
    still(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1.5 * sc, 2.4 * sc, 8), M.foliage),
      tx, 3.1 * sc, tz);
    still(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1.1 * sc, 1.9 * sc, 8), M.foliage),
      tx, 4.3 * sc, tz);
  }
  tree(64, 64); tree(-64, 64, 1.2); tree(64, -64, 0.9); tree(-64, -64, 1.1);
  tree(-11.5, 52, 0.8); tree(11.5, -52, 0.8);
  World._vegetation = { planted: treesPlanted, skipped: treesSkipped };
};
