/* World — builds Sector 7 (the map) and owns all static collision.
   Every solid is an axis-aligned box collider: [minX,minY,minZ,maxX,maxY,maxZ].
   Geometry placement uses a SEEDED rng so all clients build the identical map. */
var World = (function () {
  var colliders = [];
  /* Every flight stairFlight() emits, recorded for tools/verify-stairs-quality.
     Reconstructing flights from raw colliders is guesswork; recording them at
     the point of construction is exact. */
  var stairs = [];
  var boxLog = null;
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
  /* Unlit look, mergeable material. Lambert output is emissive + diffuse*light;
     with a black diffuse the result is exactly the Basic colour, but StaticMerge
     will batch it. Districts get this through the T contract as `emissive` so a
     district-specific sign or glow never has to reach for MeshBasicMaterial. */
  function emissiveMat(hex) {
    return new THREE.MeshLambertMaterial({ color: 0x000000, emissive: hex });
  }
  function makeMaterials() {
    var L = function (opt) { return new THREE.MeshLambertMaterial(opt); };
    M.asphalt = L({ map: canvasTex(256, function (g, s) {
      noise(g, s, '#23262b', 0.5, 1600);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
      for (var i = 0; i < 5; i++) { g.beginPath(); g.moveTo(Math.random() * s, Math.random() * s); g.lineTo(Math.random() * s, Math.random() * s); g.stroke(); }
    }) });
    M.dirt = L({ map: canvasTex(256, function (g, s) { noise(g, s, '#3a352c', 0.45, 1400); }) });
    M.concrete = L({ map: canvasTex(256, function (g, s) { noise(g, s, '#5b5f63', 0.35, 1200); }) });
    /* v8.5 STAIR MATERIAL. Every generic flight in the game was M.concrete, the
       same blue-grey as the walls they climb, so a staircase read as part of the
       wall rather than as something you could use. This is a warm sandstone that
       separates from the cool building palette at a glance, which is the point:
       stairs are a traversal affordance and should announce themselves.

       Deliberately a distinct material rather than a reuse of M.ochre, so the
       stair tone can be retuned later without moving anything else. It shares
       concrete's footstep surface (surfOf returns 0 for anything that is not
       wood, metal or rust), so this changes nothing you can hear. */
    M.stair = L({ map: canvasTex(256, function (g, s) { noise(g, s, '#a8895e', 0.32, 1200); }) });
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

    /* ---- unlit surfaces (v7.5) ----------------------------------------
       These were MeshBasicMaterial, which StaticMerge cannot batch: it only
       accepts MeshLambertMaterial. A Lambert with color 0x000000 and a full
       emissive term produces byte-identical pixels to Basic (diffuse
       contribution is zero, so output == emissive) AND merges. 55 unmergeable
       meshes became merge candidates for free. */
    var E = emissiveMat;
    M.white = E(0xd8d4c8);
    M.amberGlow = E(0xffc069);
    M.redGlow = E(0xff4438);
    M.blueGlow = E(0x3f8dff);
    M.lampGlow = E(CFG.RENDER.lampGlow);

    M.tire = L({ color: 0x111214 });
    M.carGlass = L({ color: 0x1a222c });

    /* ---- shared vehicle palette (v7.5) ---------------------------------
       Every vehicle builder used to construct its own materials on each call.
       bus() alone minted SIX new materials per bus. StaticMerge batches by
       material.uuid, so identical-looking paint could never batch and most
       ended up as singleton groups the merger skips entirely. */
    M.carPaint = [
      L({ color: 0x7a2f2f }), L({ color: 0x2f5a7a }), L({ color: 0x6b6f4a }),
      L({ color: 0x50565e }), L({ color: 0x8a4a20 }), L({ color: 0x2c3e50 })
    ];
    M.busBody = L({ color: 0x2e5f8a });
    M.busRoof = L({ color: 0xd8dde2 });
    M.vanBody = L({ color: 0xb8b0a0 });
    M.jeepBody = M.carPaint[5];
    M.cargoWood = L({ color: 0x5a3b28 });
    M.vGlass = L({ color: 0x151d26 });
    M.headlight = E(0xfff2c0);
    M.taillight = E(0xff5040);

    /* ---- DISTRICT palette (v7.6) ---------------------------------------
       District identity is carried by silhouette first and colour second. Each
       entry below is one draw call, so a district earns a colour only if it
       makes the place callable on comms ("the green canopy", "maroon coach").
       RAILWAY: cream stucco + brick base + dark green ironwork + maroon stock. */
    M.railGreen = L({ color: 0x24443a });     // canopy, ironwork, station trim
    M.cream = L({ color: 0xc9b98f });         // station stucco
    M.maroon = L({ color: 0x6d2f2c });        // passenger coach livery
    M.steelBlue = L({ color: 0x37536e });     // freight shed cladding
    M.signalRed = E(0xff3a2a);
    M.signalGreen = E(0x3ee06a);
    /* RESIDENTIAL: warm render over brick, terracotta pantiles, painted doors.
       Four colours across six houses so a terrace reads as individual homes
       and a callout can be "the ochre house" rather than "the brick one". */
    M.terracotta = L({ color: 0x9c4f32 });
    M.ochre = L({ color: 0xb8894a });
    M.sage = L({ color: 0x76856a });
    M.doorPaint = L({ color: 0x2f4a5c });
    /* THE COLONY: painted concrete slab blocks. Three washed-out municipal
       colours, one per stair core, so "pink block, third floor" is a callout
       and the three cores are told apart at a glance from the courtyard. */
    M.paleYellow = L({ color: 0xc7b579 });
    M.dustyPink = L({ color: 0xb08279 });
    M.mint = L({ color: 0x7fa298 });
    /* MARKET CROSS: the commercial palette. Pale render and blue shop glazing
       against the residential brick and the industrial rust — the one part of
       the city that looks like it was built this century. */
    M.paperWhite = L({ color: 0xd6d4c9 });
    M.shopGlass = L({ color: 0x35586b });
    /* IRONGATE DEPOT: one new colour for the whole warehouse district. Hazard
       yellow does double duty as dock edging, gantry paint and floor lane
       marking — a single material that makes every industrial surface read
       as industrial. Everything else reuses steelBlue, rust and the container
       set that already exist. */
    M.hazard = L({ color: 0xc9a227 });

    /* ---- shared street / prop palette (v7.5) ---------------------------
       Hoisted out of deco.js, where they were minted per call site. */
    M.roadPaint = L({ color: 0xcfd2c4 });
    M.roadPaintY = L({ color: 0xb99a3a });
    M.foliage = L({ color: 0x2f4a2b });
    M.palletWood = L({ color: 0x6b4a2a });
    M.palletBase = L({ color: 0x59401f });
    M.signFrame = L({ color: 0x1c1f24 });
    // Lambert (not Basic) so StaticMerge can collapse all 17 ground pools into
    // one mesh. Black diffuse + emissive == the unlit look of the original.
    M.glowPool = L({
      color: 0x000000, emissive: CFG.RENDER.lampGlow, transparent: true,
      opacity: CFG.RENDER.lampPool, blending: THREE.AdditiveBlending, depthWrite: false
    });
  }

  // ---------- geometry helpers ----------
  var minimapShapes = [];
  var outer = null;
  var solids = [];            // v8.10: emitted box <-> collider pairing, for stairwells()
  function addCollider(x0, y0, z0, x1, y1, z1) {
    colliders.push([x0, y0, z0, x1, y1, z1, arguments.length > 6 ? arguments[6] | 0 : 0]); // [6] = footstep surface
    /* Auto-capture eye-height footprints for the minimap static layer.
       v8.0: FILTERED BY FOOTPRINT. The old rule captured anything crossing eye
       height, which by v7.9 meant 1,100 shapes on Urban with a median area of
       0.9 m2 — 740 crates, barrels, bollards, bins and fence posts drawn as
       solid blocks at the same visual weight as a building wall. The minimap
       had not gone stale, it had saturated: the districts were all there and
       none of them were legible. A prop is not a landmark; only things you
       navigate BY belong on a map. */
    if (y0 < 1.7 && y1 > 0.95 && (x1 - x0) < 80 && (z1 - z0) < 80) {
      var w = x1 - x0, d = z1 - z0;
      if (w * d >= 3.5 && Math.max(w, d) >= 1.8) minimapShapes.push([x0, z0, x1, z1]);
    }
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
    /* Test-only introspection, same idea as _colliders() and _stairs(). Every
       surface in this game is a box, and z-fighting is two boxes sharing a
       plane — but by the time the scene exists they have been merged into ~90
       batches and the individual faces are gone. Recording them here is the
       only place the question can still be asked. Off unless a gate turns it on. */
    if (boxLog) boxLog.push([cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2,
      /* Material IDENTITY, not colour. Almost every material here is
         L({ map: canvasTex(...) }) with no explicit colour, so concrete, brick,
         metal, sidewalk, plaster and asphalt ALL report #ffffff. A gate that
         compares hex strings therefore treats them as the same surface and
         skips the pair — which is precisely what verify-zfight was doing to
         most of the map before v8.5. uuid is exact. */
      (mat && mat.uuid) ? mat.uuid : "?",
      (mat && mat.color && mat.color.getHexString) ? mat.color.getHexString() : "?"]);
    opts = opts || {};
    var geo = new THREE.BoxGeometry(w, h, d);
    /* uvScale tiles a texture at constant world density, which is right for
       concrete and brick and catastrophic for a sign: a 4.2 m board repeated
       the 512 px name several times across its own face. opts.tile === false
       leaves UVs at 0..1 so the texture maps ONCE across each face. */
    if (mat.map && opts.tile !== false) uvScale(geo, w, h, d);
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
      /* v8.10 STAIRWELL REGISTRY. Always on, unlike boxLog.

         stairwells() below has to cut holes in floor slabs that a staircase
         climbs into, and to cut a hole you must be able to find the mesh and
         the collider that belong to the same emitted box AFTER the district
         builders have finished. Nothing in the build recorded that pairing.
         ~3.2k small objects on urban; the cost is a push per solid. */
      solids.push({ m: m, ci: colliders.length - 1, cx: cx, cy: cy, cz: cz,
        w: w, h: h, d: d, mat: mat, opts: opts });
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
  /* v8.2 stairFlight.

     Two defects, both visible in Rahul's v8.1 screenshots, both from here
     rather than from any individual district:

     1. FLOATING FLIGHTS. The decorative skirt under each tread reached only
        0.9 m down. On a short flight that touches the ground and looks solid;
        on anything taller the skirt stops in mid-air and the upper half of the
        staircase visibly hangs. Every long flight in the game had it.
     2. GIANT STEPS. Call sites use a rise of 0.26-0.35 m. A person is 1.8 m
        tall, so each step was a fifth of the player's height and read as a
        stack of blocks rather than a staircase.

     The FLOATING flights are fixed here. The GIANT STEPS are not, and the
     reason is worth recording so nobody tries this again.

     The obvious fix is to subdivide each logical step inside this function,
     preserving total rise and run so every landing stays put. I built it. It
     broke five staircases outright — "north block A" went from a clean climb to
     the capsule never leaving the ground.

     The cause: subdividing the rise also subdivides the RUN. At a 0.30 m rise
     and 0.33 m run, halving gives a 0.165 m tread. The player is 0.70 m wide,
     so their box now overlaps three or four treads simultaneously. The
     auto-step takes the highest overlapping surface, which is two or three
     steps up — past the 0.42 m step limit — and refuses. Shallower treads make
     stairs LESS climbable, which is the same trap the v6.2 note describes from
     the other direction.

     Rise and run are locked together by the flight's angle, and the angle is
     set by the building: a 3.3 m climb across 3.6 m of floor is a 42 degree
     stair no matter how it is cut. Smaller steps therefore require a LONGER
     flight, which means moving where it lands. That is per-district
     architecture work, not a change to this generator.

     opt.baseY  — where the stringer lands, if not the flight's own start
                  (a flight bridging two decks should skirt to the lower deck).
     opt.stringers === false — open steel flight, no side plates. */
  function stairFlight(sx, sy, sz, dirX, dirZ, steps, stepH, stepD, width, mat, opt) {
    opt = opt || {};
    /* One stair colour across Urban, applied here rather than at 60 call sites.
       Only the GENERIC flights are re-tinted. Steel fire escapes stay M.metal
       and timber stays M.wood on purpose: surfOf() derives the footstep sound
       from the material, so turning a steel fire escape to stone would make it
       sound like concrete underfoot. Material identity that carries audio is
       not decoration. */
    if (mat === M.concrete || mat === M.dirt || mat === M.sidewalk) mat = M.stair;
    var baseY = (opt.baseY === undefined) ? sy - 0.02 : opt.baseY;
    stairs.push({
      sx: sx, sy: sy, sz: sz, dirX: dirX, dirZ: dirZ,
      steps: steps, stepH: stepH, stepD: stepD, width: width,
      baseY: baseY, topY: sy + steps * stepH,
      landing: (opt.landing === false) ? 0 : 0.70,
      endX: sx + dirX * steps * stepD, endZ: sz + dirZ * steps * stepD,
      stringers: opt.stringers !== false
    });
    var lip = Math.min(stepH * 0.55, 0.18);
    var SP = 0.09;                                 // stringer plate thickness

    for (var i = 0; i < steps; i++) {
      var cx = sx + dirX * (i + 0.5) * stepD;
      var cz = sz + dirZ * (i + 0.5) * stepD;
      var top = sy + (i + 1) * stepH;
      var w = dirX !== 0 ? stepD : width;
      var dep = dirX !== 0 ? width : stepD;

      /* The tread COLLIDER stays a thin slab. Kept from v6.2: the auto-step in
         controller.moveAxis refuses a step whenever the destination capsule
         overlaps anything, so a full-depth skirt put the tread two ahead into
         the climber's chest and made 40 of 43 staircases unclimbable. */
      seg(cx - w / 2, cx + w / 2, top - lip, top, cz - dep / 2, cz + dep / 2, mat);

      if (opt.stringers === false || top - lip <= baseY) continue;

      /* v8.4: stringers sit INSIDE the tread width, not outside it.

         v8.2 hung them on the outer faces at +/-(width/2 + SP). That is fine
         for a free-standing flight and wrong for every staircase built flush
         against a wall — the plate landed inside the wall. Rahul reported both
         halves of it from the browser: "stairs and walls are completely merged"
         and "stairs are flickering if inside the room watching from outside".
         An A/B build confirmed the stringers added 6 coplanar surface pairs,
         all of them above roof height.

         Inset, the plate can never reach further out than the tread it belongs
         to, so it cannot enter geometry the staircase was not already touching.
         Its outer face is now coplanar with the tread's — same material, same
         colour, so nothing to see and nothing for verify-zfight to flag. */
      if (dirX !== 0) {
        seg(cx - stepD / 2, cx + stepD / 2, baseY, top - lip,
          cz - width / 2, cz - width / 2 + SP, mat, { collide: false });
        seg(cx - stepD / 2, cx + stepD / 2, baseY, top - lip,
          cz + width / 2 - SP, cz + width / 2, mat, { collide: false });
      } else {
        seg(cx - width / 2, cx - width / 2 + SP, baseY, top - lip,
          cz - stepD / 2, cz + stepD / 2, mat, { collide: false });
        seg(cx + width / 2 - SP, cx + width / 2, baseY, top - lip,
          cz - stepD / 2, cz + stepD / 2, mat, { collide: false });
      }
    }

    /* The top landing is NOT built here. See stairLandings() below: emitting it
       inline gave every flight a slab whether it needed one or not, and 16 of
       them landed inside decks that already existed (verify-props 134 -> 150,
       verify-zfight 110 -> 121). The pass runs once after the whole map is
       built, so it can look at the finished collider set and skip the flights
       that already arrive somewhere. Running it at the end is what makes that
       check deterministic rather than dependent on district build order. */
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
  function lighting(urban) {
    outer.background = new THREE.Color(CFG.RENDER.sky);
    outer.fog = new THREE.FogExp2(CFG.RENDER.fogColor, CFG.RENDER.fogDensity);

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

    // Interior lights — Urban buildings only. On other maps these are four
    // invisible floating lamps (two of them animated by World.flickers), which
    // both cost shading time and wash odd bright patches over open terrain.
    if (urban === false) return;
    /* v7.5 lighting budget. Urban carried 4 interior/street point lights against
       Metro's 0; every Lambert point light multiplies fragment shading across
       every lit surface in range. The two STREET lamps at (8.5,-18) and
       (-8.5,14) were removed: their job — a warm pool under the streetlights —
       is already done by the emissive lamp heads and the merged ground-glow
       discs in deco.js, which cost one draw call between them and zero shading.
       The two INTERIOR lights stay: they light building volumes that no
       emissive prop can fake, and they are the map's atmosphere. */
    var wh = new THREE.PointLight(0xffb35c, 1.1, 36, 1.5); wh.position.set(-32, 6.8, -28); scene.add(wh);
    flickers.push(wh);
    var ap = new THREE.PointLight(0x8fb4ff, 0.7, 16, 1.7); ap.position.set(27, 4.6, -35); scene.add(ap);
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
    // Flat cylinder rather than a circle: CylinderGeometry is merge-whitelisted,
    // CircleGeometry is not, and at 8mm thickness they are indistinguishable.
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.008, 20), M.dark);
    // NO rotation. CircleGeometry lies in the XY plane and needed rotating flat;
    // CylinderGeometry is ALREADY flat in XZ. Keeping the old -90 deg stood the
    // disc on its edge: a 6.2 m black wall at the crossroads. Gates passed.
    disc.position.set(cx, 0.035, cz);
    disc.receiveShadow = true; disc.matrixAutoUpdate = false; disc.updateMatrix();
    scene.add(disc);
    for (var i = 0; i < 7; i++) {
      var a = rnd() * Math.PI * 2, r = 1 + rnd() * 1.6;
      box(cx + Math.cos(a) * r, 0.18 + rnd() * 0.22, cz + Math.sin(a) * r,
        0.5 + rnd() * 0.6, 0.35 + rnd() * 0.5, 0.5 + rnd() * 0.6, M.concrete);
    }
  }

  /* ===== STAIR CONNECTORS — ATTEMPTED, REVERTED, DO NOT RE-ATTEMPT BLIND =====

     The nine "floating" flights on urban are switchback stairwells whose
     half-landing was never built: flight A ends at (24.6, 3.65, -34.1), flight
     B begins at (24.6, 3.65, -36.1), two metres of open air between them.

     A pass that builds those landings was written, and it is not shippable,
     because THE LANDING DOES NOT FIT. Measured per half-flight in the CIVIC
     CENTRE stairwell:

         total rise per half-flight   1.70 - 1.82 m
         clearance a standing player  1.80 m + auto-step lift = 2.02 m

     A landing at the turn sits at the top of the flight below it. With only
     1.73 m between them, that landing IS the low ceiling. The first version of
     the pass proved it empirically: nine floating flights became four, and
     headroom went 0 -> 13 across CIVIC CENTRE, THE COLONY and SECTOR 7. Adding
     a guard that refuses to create a low ceiling made the pass emit ZERO
     connectors, which is the same answer stated honestly.

     So this is not a missing-landing defect. It is a storey-height defect: the
     stairwell needs FEWER, TALLER half-flights (>= 7 steps at 0.29 rather than
     6) so a landing can physically fit. That changes where the flights land,
     which is district work, and Rahul has scoped district changes out of
     Milestone A. Reported, not silently patched.

     Rule 11: non-beneficial changes get reported and reverted, not kept. */

  /* ===== STAIRWELLS (v8.10) =====

     THE DEFECT, AND WHY IT LOOKED LIKE FIVE DIFFERENT BUGS.

     Rahul reported that WEST WORKS and EASTGATE YARD second floors are
     unreachable, while the F3 overlay said `top arrival: OK (0.00m)` on both.
     The overlay was right and useless at the same time. Replaying a standing
     capsule up those flights tread by tread showed the same thing under both:

       flight #44  blocker [72.4, 3.00, -8.8 .. 78.4, 3.30, -1.2]  top 3.30
       flight #47  blocker [-94.0, 7.10, -16.0 .. -83.0, 7.50, -4.0]  top 7.50

     In every case the blocking collider's TOP EQUALS THE FLIGHT'S TOP. The
     staircase is not failing to arrive. It arrives perfectly — at a floor slab
     with no hole cut in it. The flight runs underneath its own destination and
     the headroom shrinks by one rise per tread until the capsule cannot stand.

     That is why `arrival` said OK: a deck IS at the top, at distance 0.00. It
     is also why `headroom` flagged these same flights and the ratchet buried
     it as five acceptable instances. One defect, five coordinates.

     THE FIX IS THE HOLE, NOT THE STAIR. A real building has a stairwell void
     in the floor above the run. This pass cuts one: for every registered
     flight, any thin horizontal slab hanging over the run within the clearance
     a standing player needs is replaced by up to four pieces surrounding a
     rectangular opening.

     WHY IT IS A POST-PASS. Same reason stairLandings() is: the districts
     register their flights while they build, and a slab is often emitted by a
     different district file than the stair beneath it. Anything that inspects
     the finished world has to run after the whole world exists. It runs BEFORE
     StaticMerge so the replacement pieces batch into the same draw calls their
     original did — same material, so no new batch and no new shadow caster.

     WHAT IT REFUSES TO DO. It only cuts thin (<= 0.8 m) horizontal slabs of at
     least 1 m2. A wall across a staircase, a rotated box, or a thick solid is
     a different defect with a different right answer, so those are counted and
     reported rather than silently demolished. Read the count in
     tools/verify-climb.js; do not widen this rule to make a number go green. */
  function stairwells() {
    var NEED = CFG.PLAYER.standH + 0.22;   // 2.02 m: stand 1.80 + auto-step lift + slack
    var report = { cut: 0, pieces: 0, refused: [] };
    if (!stairs.length || !solids.length) return report;

    for (var i = 0; i < stairs.length; i++) {
      var f = stairs[i];
      var halfW = f.width / 2 + 0.06;
      // the opening spans the run and stops AT the arrival edge, so the deck
      // the player steps out onto is never removed
      var hx0 = Math.min(f.sx, f.endX) - (f.dirX ? 0 : halfW);
      var hx1 = Math.max(f.sx, f.endX) + (f.dirX ? 0 : halfW);
      var hz0 = Math.min(f.sz, f.endZ) - (f.dirZ ? 0 : halfW);
      var hz1 = Math.max(f.sz, f.endZ) + (f.dirZ ? 0 : halfW);
      if (f.dirX) { hx0 -= 0.06; hx1 += 0.06; }
      if (f.dirZ) { hz0 -= 0.06; hz1 += 0.06; }
      if (f.dirX > 0) hx1 = f.endX; else if (f.dirX < 0) hx0 = f.endX;
      if (f.dirZ > 0) hz1 = f.endZ; else if (f.dirZ < 0) hz0 = f.endZ;

      // highest tread the opening has to clear
      var topTread = f.topY;

      for (var j = solids.length - 1; j >= 0; j--) {
        var S = solids[j];
        if (!S.m) continue;                                   // already cut away
        var sx0 = S.cx - S.w / 2, sx1 = S.cx + S.w / 2;
        var sz0 = S.cz - S.d / 2, sz1 = S.cz + S.d / 2;
        var sy0 = S.cy - S.h / 2, sy1 = S.cy + S.h / 2;
        if (sx1 <= hx0 + 0.01 || sx0 >= hx1 - 0.01) continue;
        if (sz1 <= hz0 + 0.01 || sz0 >= hz1 - 0.01) continue;
        if (sy0 <= f.sy + 0.05) continue;                     // not overhead
        if (sy0 >= topTread + NEED) continue;                 // high enough already

        // the flight's own treads, stringers and landing are not obstacles
        var ocx = S.cx, ocz = S.cz;
        var ox0 = Math.min(f.sx, f.endX) - f.width / 2 - 0.10;
        var ox1 = Math.max(f.sx, f.endX) + f.width / 2 + 0.10;
        var oz0 = Math.min(f.sz, f.endZ) - f.width / 2 - 0.10;
        var oz1 = Math.max(f.sz, f.endZ) + f.width / 2 + 0.10;
        if (ocx > ox0 && ocx < ox1 && ocz > oz0 && ocz < oz1 &&
            sy1 <= f.topY + 0.06 && sy1 >= f.baseY - 0.10) continue;

        if (S.opts.rotY || S.h > 0.8 || (S.w * S.d) < 1.0) {
          report.refused.push({ flight: i, at: [S.cx, S.cy, S.cz],
            why: S.opts.rotY ? 'rotated' : (S.h > 0.8 ? 'not a slab (h ' + S.h.toFixed(2) + ')' : 'too small') });
          continue;
        }

        // clip the opening to this slab, then rebuild the slab around it
        var cx0 = Math.max(sx0, hx0), cx1 = Math.min(sx1, hx1);
        var cz0 = Math.max(sz0, hz0), cz1 = Math.min(sz1, hz1);

        scene.remove(S.m);
        if (S.m.geometry && S.m.geometry.dispose) S.m.geometry.dispose();
        colliders[S.ci] = null;                                // compacted below
        S.m = null;

        var parts = [];
        if (cz0 > sz0 + 0.02) parts.push([sx0, sx1, sz0, cz0]);
        if (cz1 < sz1 - 0.02) parts.push([sx0, sx1, cz1, sz1]);
        if (cx0 > sx0 + 0.02) parts.push([sx0, cx0, cz0, cz1]);
        if (cx1 < sx1 - 0.02) parts.push([cx1, sx1, cz0, cz1]);
        for (var k = 0; k < parts.length; k++) {
          var q = parts[k];
          if (q[1] - q[0] < 0.02 || q[3] - q[2] < 0.02) continue;
          /* Trap #8: do not emit a sliver. A 0.3 m strip left over from a cut
             is a standable surface nobody can reach, and verify-arch counts it
             as a broken promise — the first version of this pass pushed urban
             from 10 to 11 doing exactly that. A gap narrower than the player's
             0.70 m diameter cannot be fallen through, so dropping the sliver
             costs nothing and keeps the ratchet honest. */
          if (Math.min(q[1] - q[0], q[3] - q[2]) < 0.55) continue;
          seg(q[0], q[1], sy0, sy1, q[2], q[3], S.mat, S.opts);
          report.pieces++;
        }
        report.cut++;
      }
    }

    // compact the collider array once, at the end
    if (report.cut) {
      var keep = [];
      for (var n = 0; n < colliders.length; n++) if (colliders[n]) keep.push(colliders[n]);
      colliders.length = 0;
      for (var n2 = 0; n2 < keep.length; n2++) colliders.push(keep[n2]);
      // indices in `solids` are stale after compaction; nothing reads them again
      // this build, and reset() clears the array.
    }
    return report;
  }

  return {
    BOUND: 100, // playable half-extent (V4.2)
    _colliders: function () { return colliders; }, // test-only introspection
    _stairs: function () { return stairs; },       // test-only introspection
    _recordBoxes: function (on) { boxLog = on ? [] : null; return boxLog; },
    _boxes: function () { return boxLog || []; },
    /* opts.urban === false  ->  build shared setup only (materials, sky, fog,
       hemi/ambient/sun) and SKIP groundAndRoads(). groundAndRoads() lays the
       Urban dirt ground with its top face at exactly y=0, plus the asphalt
       avenue cross and eight sidewalk curbs. Rural lays its own grass top at
       y=0, so leaving the Urban layer in produced ~44,000 m2 of exactly
       coplanar surface -> full-screen z-fighting (the "blinking grey/green"),
       a phantom asphalt cross, eight colliding concrete curbs in the forest,
       and an Urban ground collider at y=0 that filled in the river fords. */
    _initPart1: function (sceneRef, opts) {
      var urban = !opts || opts.urban !== false;
      outer = sceneRef;
      solids.length = 0;
      scene = new THREE.Group();
      outer.add(scene);
      makeMaterials(); lighting(urban);
      if (urban) groundAndRoads();
    },
    _stairwells: function () { return stairwells(); },
    _internals: function () {
      return { box: box, seg: seg, cyl: cyl, stairFlight: stairFlight, crater: crater, M: M, rnd: rnd, addCollider: addCollider, emissive: emissiveMat, canvasTex: canvasTex, sceneRef: function () { return scene; } };
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
    builtMap: null,
    reset: function () {
      /* Reseed FIRST, and unconditionally. rnd() is a running PRNG shared by
         every district builder, and it was never reset — so a map's scattered
         props depended on how many rnd() calls the PREVIOUS map made in the
         same process. Editing Urban silently moved Rural's crates. In game it
         only ever mattered on a map switch; in the validators it made every
         gate non-deterministic, which is worse: it means a number that changed
         cannot be trusted to mean anything. */
      seedState = 1337;
      /* v8.1: the collision state is cleared BEFORE the scene guard, not after.
         The guard exists to protect the THREE.js teardown from running without
         a scene — it has no business gating the collider array. With the old
         ordering, calling reset() while `scene` was null returned early and
         left every collider from the previous map in place, so the next
         buildMap APPENDED to them: solid geometry you collide with and cannot
         see. Not reachable from the menu flow today, but it silently corrupted
         verify-collision the first time that gate reset a map twice. */
      colliders.length = 0;
      stairs.length = 0;
      minimapShapes.length = 0;
      if (World._lampSpots) World._lampSpots.length = 0;
      built = false;
      World.builtMap = null;
      if (!outer || !scene) return;
      outer.remove(scene);
      scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      scene = null;
    },
    build: null // assigned in part 2
  };
})();

/* ---------- PART 2: buildings, vehicles, props ---------- */
World.build = function (sceneRef) {
  if (World.isBuilt()) return;
  World._initPart1(sceneRef);
  var H = World._internals();
  var emissiveMat = H.emissive;   // unlit-but-mergeable material factory, for districts
  var seg = H.seg, box = H.box, cyl = H.cyl, stairFlight = H.stairFlight, crater = H.crater, M = H.M, rnd = H.rnd, addCollider = H.addCollider;
  var canvasTex = H.canvasTex;   // district sign faces are drawn, not loaded

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
  /* `pi` is an index into the shared M.carPaint palette, not a raw hex. Each
     colour is now one material shared by every car that wears it, so all the
     bodies of a colour batch into a single draw call. */
  function sedan(cx, cz, r, pi, wreck) {
    var paint = M.carPaint[pi % M.carPaint.length];
    vpart(cx, cz, r, 0, 0, 0.67, 4.2, 0.7, 1.9, paint);
    vpart(cx, cz, r, -0.2, 0, 1.3, 2.2, wreck ? 0.3 : 0.56, 1.7, wreck ? paint : M.carGlass);
    wheels(cx, cz, r, 1.4, 0.85, 0.33);
  }
  /* Single definition. districts-outer.js carried a byte-identical copy that
     minted its own six materials; it now calls this one through T.bus. */
  function bus(cx, cz, r) {
    var scene = H.sceneRef();
    var VGLASS = M.vGlass, VWHEEL = M.tire, VLF = M.headlight,
        VLR = M.taillight, VBUS = M.busBody, VROOF = M.busRoof;
    var RY = r, CC = Math.cos(RY), SS = Math.sin(RY);
    function OFF(dx, dz) { return [cx + dx * CC - dz * SS, cz + dx * SS + dz * CC]; }
    box(cx, 1.32, cz, 2.45, 1.3, 8.9, VBUS, { rotY: RY });
    box(cx, 1.78, cz, 2.5, 0.42, 7.6, VGLASS, { rotY: RY, collide: false });
    box(cx, 2.68, cz, 2.3, 0.1, 8.7, VROOF, { rotY: RY, collide: false });
    var LAT = 1.05, LZF = 3.1;
    [[LAT, LZF], [-LAT, LZF], [LAT, -LZF], [-LAT, -LZF]].forEach(function (wf) {
      var wp = OFF(wf[0], wf[1]);
      var wm = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10), VWHEEL);
      wm.position.set(wp[0], 0.31, wp[1]);
      wm.rotation.set(0, RY, Math.PI / 2);
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      scene.add(wm);
    });
    [OFF(LAT, 0), OFF(-LAT, 0)].forEach(function (wp) {
      var wm = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10), VWHEEL);
      wm.position.set(wp[0], 0.31, wp[1]);
      wm.rotation.set(0, RY, Math.PI / 2);
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      scene.add(wm);
    });
    var lf = OFF(0, 4.5); box(lf[0], 0.9, lf[1], 2.1, 0.16, 0.06, VLF, { rotY: RY, collide: false });
    var lr = OFF(0, -4.5); box(lr[0], 0.9, lr[1], 2.1, 0.14, 0.06, VLR, { rotY: RY, collide: false });
  }
  function truck(cx, cz, r) {
    vpart(cx, cz, r, -2.6, 0, 1.35, 2.2, 2.3, 2.4, M.cargoWood);
    vpart(cx, cz, r, 1.1, 0, 1.75, 4.6, 2.9, 2.5, M.contGray);
    wheels(cx, cz, r, 2.6, 1.05, 0.44);
  }
  function van(cx, cz, r) {
    var paint = M.vanBody;
    vpart(cx, cz, r, 0.35, 0, 1.35, 4.0, 2.1, 2.2, paint);
    vpart(cx, cz, r, -2.15, 0, 0.95, 1.0, 1.3, 2.1, paint);
    wheels(cx, cz, r, 1.7, 0.95, 0.36);
  }
  function jeep(cx, cz, r) {
    var paint = M.jeepBody;
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
  sedan(3, 26, true, 0, false);
  sedan(30, 3, false, 1, false);
  sedan(-34, -3, false, 2, false);
  sedan(-20, 18, false, 3, false);
  sedan(-14.5, 38.5, true, 4, false); // inside garage
  // wrecked sedan at the crossroads (visual tilt, fat AABB collider)
  (function () {
    /* Was a THREE.Group. Group children are not scene children, so StaticMerge
       never saw either box and both shipped as their own draw call. Rotated
       offsets are computed here instead, and box() handles rotY natively —
       which also keeps this code working under the lightweight THREE stub the
       map validator uses, where Object3D.matrix does not exist.
       M.dark instead of a bespoke near-black: joins the existing dark batch.
       Collider is the original fat AABB, unchanged. */
    var RY = 0.55, CX = 2, CZ = -15;
    var c = Math.cos(RY), s2 = Math.sin(RY);
    box(CX, 0.6, CZ, 4.2, 0.7, 1.9, M.dark, { rotY: RY, collide: false });
    box(CX - 0.2 * c, 1.1, CZ - 0.2 * s2, 2.1, 0.34, 1.7, M.dark, { rotY: RY, collide: false });
    addCollider(CX - 2.1, 0, CZ - 2.1, CX + 2.1, 1.35, CZ + 2.1);
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

  /* ===== STAIR TOP LANDINGS =====

     The one-for-all stair fix. Every remaining "stairs to nowhere" in Urban was
     the same missing piece, and the symptoms only looked different:

       - six flights ended 1.00 to 1.27 m short of a real deck, at the same
         height. A step, with nothing to step onto.
       - flights in a stairwell began on nothing but the last tread of the one
         below, because no landing was ever built between them.

     A 0.7 m slab at the top of a flight solves both, and the flight only needs
     one where it does not already arrive somewhere. That check needs the
     FINISHED collider set, which is why this runs as a pass at the end of the
     build rather than inside stairFlight — a mid-build query would make the
     output depend on district order, the exact non-determinism the v7.8 PRNG
     fix removed. */
  function stairLandings() {
    var LAND = 0.70, list = World._stairs();
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.landing === 0) continue;
      var topY = f.topY;
      var lx = f.endX + f.dirX * LAND / 2, lz = f.endZ + f.dirZ * LAND / 2;
      var lw = f.dirX ? LAND : f.width, ld = f.dirZ ? LAND : f.width;
      // already something walkable at this height across the landing footprint?
      var covered = false;
      var cols = World._colliders();     // part 2 has no closure access to the array
      for (var j = 0; j < cols.length; j++) {
        var c = cols[j];
        if (Math.abs(c[4] - topY) > 0.30) continue;
        if (c[3] <= lx - lw / 2 + 0.05 || c[0] >= lx + lw / 2 - 0.05) continue;
        if (c[5] <= lz - ld / 2 + 0.05 || c[2] >= lz + ld / 2 - 0.05) continue;
        covered = true; break;
      }
      if (covered) { f.landing = 0; continue; }
      var lip = Math.min(f.stepH * 0.55, 0.18);
      seg(lx - lw / 2, lx + lw / 2, topY - lip, topY, lz - ld / 2, lz + ld / 2, M.stair);
    }
  }

  /* ===== DISTRICT SIGNS =====

     Rahul's actual words: "map pe bhi ek sign board add karo taki mai ss lekar
     tumko exact bata saku ki kaha issue hai." Every bug report so far has been a
     screenshot plus a guess at where it was, and I have burned whole turns
     reverse-engineering a location from the shape of a roofline. A readable
     board in frame ends that.

     One board per district, from DISTRICTS in districts.config.js, so the names
     on the map and the names in the gates are literally the same strings.

     The face is a canvas texture with the name drawn into it — this project
     ships no image files, and canvasTex already exists for exactly this. The
     panel is emissive so it reads at night without needing its own light, which
     matters: the lamp budget is full at 7 of 7. */
  /* A sign is a board carried on TWO posts at its ends, with nothing crossing
     the face — that is what a road sign looks like and what Rahul sent as a
     reference. v8.6 used a single centre post, which put a black bar straight
     through the middle of every district name.

     Placement is a search, not a guess. v8.6 checked only the POST footprint for
     clearance, so Market Cross ended up with its board inside the VOLT building
     while the post itself stood in open air. clearFor() tests the whole solid —
     both posts and the board — against the finished collider set, and walks a
     ring of candidate offsets until it finds open ground. This is the general
     form of Rahul's instruction: check what is already there before placing
     anything. */
  function signClear(sx, sz, face, BW, BH, PH) {
    var cols = World._colliders();
    var dx = Math.cos(face), dz = Math.sin(face);
    var px = -dz, pz = dx;
    var halfW = BW / 2 + 0.3, halfD = 0.6;
    var x0 = sx - Math.abs(px) * halfW - Math.abs(dx) * halfD;
    var x1 = sx + Math.abs(px) * halfW + Math.abs(dx) * halfD;
    var z0 = sz - Math.abs(pz) * halfW - Math.abs(dz) * halfD;
    var z1 = sz + Math.abs(pz) * halfW + Math.abs(dz) * halfD;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (c[4] < 0.20 || c[1] > PH + BH + 0.4) continue;   // ground plates and high roofs are fine
      if (c[3] <= x0 || c[0] >= x1 || c[5] <= z0 || c[2] >= z1) continue;
      return false;
    }
    return true;
  }

  function districtSigns() {
    if (typeof DISTRICTS === 'undefined') return;
    var list = DISTRICTS.list;
    var PW = 0.17, PH = 2.55;                      // post thickness / height
    var BW = 5.2, BH = 1.20;                       // board width / height
    for (var i = 0; i < list.length; i++) {
      var d = list[i], face = d.sign[2] || 0;
      var dx = Math.cos(face), dz = Math.sin(face);
      var px = -dz, pz = dx;

      // walk outward from the anchor until the whole sign fits in open ground
      var sx = null, sz = null;
      var RING = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [4, 0], [-4, 0], [0, 4], [0, -4],
                  [3, 3], [-3, 3], [3, -3], [-3, -3], [6, 0], [-6, 0], [0, 6], [0, -6],
                  [8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, 6], [6, -6], [-6, -6]];
      for (var r = 0; r < RING.length; r++) {
        var tx = d.sign[0] + RING[r][0], tz = d.sign[1] + RING[r][1];
        if (signClear(tx, tz, face, BW, BH, PH)) { sx = tx; sz = tz; break; }
      }
      if (sx === null) continue;                   // nowhere clear: no sign beats a buried one
      d.placed = [sx, sz];

      var faceTex = canvasTex(512, (function (label) {
        return function (g, S) {
          var bandH = S / 4, y0 = (S - bandH) / 2;
          g.fillStyle = '#0d2033'; g.fillRect(0, 0, S, S);
          g.fillStyle = '#12304a'; g.fillRect(0, y0, S, bandH);
          g.fillStyle = '#e8eef4';
          g.fillRect(0, y0 + 4, S, 4); g.fillRect(0, y0 + bandH - 8, S, 4);
          g.fillStyle = '#ffffff';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          var size = 82;
          g.font = 'bold ' + size + 'px sans-serif';
          while (size > 30 && g.measureText(label).width > S - 36) {
            size -= 3; g.font = 'bold ' + size + 'px sans-serif';
          }
          g.fillText(label, S / 2, y0 + bandH / 2);
        };
      })(d.name));
      var boardMat = new THREE.MeshLambertMaterial(
        { map: faceTex, color: 0x000000, emissive: 0xffffff, emissiveMap: faceTex });

      // posts at the ends, stopping BELOW the board so nothing crosses the text
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        var ox = px * s2 * (BW / 2 - 0.35), oz = pz * s2 * (BW / 2 - 0.35);
        box(sx + ox, PH / 2, sz + oz, PW, PH, PW, M.trim, { cast: false });
      }
      var bw = Math.abs(px) * BW + Math.abs(dx) * 0.14;
      var bd = Math.abs(pz) * BW + Math.abs(dz) * 0.14;
      box(sx, PH + BH / 2, sz, bw, BH, bd, boardMat, { collide: false, cast: false, tile: false });
    }
  }

  /* ===== PERIMETER + SKYLINE =====

     v8.3: THE INNER CITY WALL IS GONE.

     This ring at +/-70 was the map's perimeter back when the map ended there.
     v4.2 extended the world to +/-100 and built a new outer perimeter, but the
     old one was left standing in the middle of the city. Everything since has
     treated it as deliberate structure and worked around it — v7.6 set the
     station hall into it because it left the railway district with no approach,
     v7.8 set the mall into it because it drove a 3 m wall through the shop
     floor. Two releases spent punching holes in a wall that should not have
     been there, which is what Rahul spotted in images 6, 7 and 19.

     Measured before removal: 3,523 of 33,454 walkable cells in Urban (10.5%)
     could not be reached from a spawn at all, and this ring was the single
     biggest contributor.

     The brick PIERS survive. With the wall gone they read as gateposts on the
     old city line — they still mark where one district ends and the next
     begins, which is what district callouts need, and they are cover in the
     open ground the wall used to occupy. */
  seg(29, 32, 0, 4.4, -71.0, -69.9, M.brick);                     // old south gate, west post
  seg(52, 55, 0, 4.4, -71.0, -69.9, M.brick);                     // old south gate, east post
  seg(62.5, 63.4, 0, 3.9, -71.0, -69.9, M.brick);                 // service gate piers
  seg(66.6, 67.5, 0, 3.9, -71.0, -69.9, M.brick);
  seg(62.5, 67.5, 3.9, 4.3, -71.0, -69.9, M.railGreen);           // service gate lintel
  seg(69.6, 71.3, 0, 4.6, -44.8, -44.4, M.brick);     // piers either side of the mall
  seg(69.6, 71.3, 0, 4.6, -21.6, -21.2, M.brick);
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
    seg: seg, box: box, cyl: cyl, stairFlight: stairFlight, facade: facade, win: win, emissive: emissiveMat,
    bus: bus, sedan: sedan, van: van, jeep: jeep, truck: truck,
    container: container, crates: crates, brokenWall: brokenWall, lamp: lamp, barrel: barrel,
    M: M, rnd: rnd, scene: H.sceneRef()
  });

  if (World._buildPart4) World._buildPart4({
    seg: seg, box: box, cyl: cyl, stairFlight: stairFlight, facade: facade, win: win, emissive: emissiveMat,
    container: container, crates: crates, brokenWall: brokenWall, lamp: lamp, barrel: barrel,
    bus: bus, sedan: sedan, van: van, jeep: jeep, truck: truck,
    M: M, rnd: rnd, scene: H.sceneRef()
  });
  if (World._buildPart5) World._buildPart5({
    seg: seg, box: box, cyl: cyl, stairFlight: stairFlight, facade: facade, win: win, emissive: emissiveMat,
    container: container, crates: crates, brokenWall: brokenWall, lamp: lamp, barrel: barrel,
    bus: bus, sedan: sedan, van: van, jeep: jeep, truck: truck,
    M: M, rnd: rnd, scene: H.sceneRef()
  });
  if (World._buildDeco) World._buildDeco({
    seg: seg, box: box, cyl: cyl, M: M, emissive: emissiveMat, scene: H.sceneRef()
  });
  if (World._buildAccess) World._buildAccess({
    seg: seg, box: box, cyl: cyl, stairFlight: stairFlight, M: M, scene: H.sceneRef()
  });

  /* LAST thing before the merge. Placed at the very end of World.build on
     purpose: the district builders register their flights during the build, and
     an earlier call site saw only 9 of Urban's 68 staircases and emitted nothing
     at all while reporting success. A post-pass has to run after everything it
     claims to inspect. */
  /* Cut the stairwells BEFORE the landings. stairLandings() asks "is anything
     walkable already at the top of this flight"; if a slab has just had a hole
     cut in it, that question has to be asked of the geometry that survived. */
  World._stairwells();
  stairLandings();
  districtSigns();

  if (CFG.RENDER.mergeStatic !== false && typeof StaticMerge !== 'undefined') {
    StaticMerge.merge(THREE, H.sceneRef());
  }

  World._markBuilt();
  World.builtMap = 'urban';
};

/* ---------- PART 3: expansion districts (tunnel, construction, Depot B, row houses, rail yard) ---------- */

/* Map dispatcher (v4.6): urban uses the untouched build(); rural composes the
   same helper contract via World._buildRural (registered by environment/rural-*.js).
   Rebuild-on-map-change is safe: reset() disposes the previous world group. */
World.buildMap = function (sceneRef, map) {
  map = (CFG.MAPS && CFG.MAPS[map]) ? map : 'urban';
  if (World.isBuilt()) {
    if (World.builtMap === map) return;
    World.reset();
  }
  var builder = map === 'rural' ? World._buildRural : (map === 'metro' ? World._buildMetro : null);
  if (map === 'urban' || !builder) {
    World.build(sceneRef);
    World.builtMap = 'urban';
    return;
  }
  World._initPart1(sceneRef, { urban: false });
  var H = World._internals();
  builder({
    seg: H.seg, box: H.box, cyl: H.cyl, stairFlight: H.stairFlight,
    M: H.M, rnd: H.rnd, scene: H.sceneRef(), addCollider: H.addCollider
  });
  World._stairwells();
  if (CFG.RENDER.mergeStatic !== false && typeof StaticMerge !== 'undefined') {
    StaticMerge.merge(THREE, H.sceneRef());
  }
  World._markBuilt();
  World.builtMap = map;
};
