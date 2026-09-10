/* ===== v1.0e - THE TRAIN =====
   Rahul: "add a moving train across the boundary of the map so that if a player
   gets in the train it can travel from one place to another... continuously
   across the map; it stops at the station for 3 seconds then goes again. The
   compartments should allow players to get in and shoot. Make sure the train
   looks like a train."

   THREE THINGS, kept apart on purpose:

   1. WHERE IT IS. Deterministic in match time. The head's arc-length position
      s(t) is a pure function of (serverNow - match.startedAt) built from
      CFG.TRAIN: dwell at the station, accelerate, cruise, brake, dwell. Every
      client evaluates the same function against the same server clock (the
      one the HUD timer already trusts), so there is no train traffic at all
      and a late joiner is in sync on their first frame.

   2. WHAT IT LOOKS LIKE. A locomotive (cab, nose, headlights, stack, side
      tanks) and three coaches (body, window strips, doors at both ends of both
      sides, roof, bogies with wheels, couplings). Built from the same M
      materials as the map, but with matrixAutoUpdate ON, which is exactly the
      flag merge.js uses to leave a mesh alone — the train is never folded into
      a static batch.

   3. HOW YOU RIDE IT. The train is NOT in the collider grid (this engine's
      resolver is static-only — see the lift note in game.js). Instead every
      frame it offers the player controller a MOVING FLOOR: floorAt(pos) maps
      the player into each car's frame and returns the coach floor, its roof or
      the boarding step when the player is over one, with the car's velocity.
      controller.js snaps the standing player to that floor, carries them with
      the velocity, and holds them inside the coach walls except at the doors.
      Boarding is walking in at the station or jumping aboard from the road;
      leaving is stepping out of a door — or off the roof.

   Honest limits, written down: the coach walls are not colliders, so BULLETS
   pass through them (bodies do not, for the rider). A remote rider is drawn
   where the snapshot puts them, ~0.2 s behind their true seat while the train
   moves. The footbridge at x 76 clears the roof by 0.6 m: a roof rider goes
   under it prone or gets swept off. */
var Train = (function () {
  var scene = null, cfg = null, path = null, cars = [], group = null;
  var active = false, headS = 0, headV = 0, mapId = null;
  var CL = 12.0, LOCO_L = 11.0, GAP = 0.9, HALF_W = 1.5, FLOOR = 1.05, ROOF = 3.75, STEP_Y = 0.55;
  var sched = null;

  /* ---------- schedule: shared with the server (world.config.js) ---------- */
  function buildSchedule() {
    sched = CFG.trainSchedule(cfg, path.length, path.sAtWaypoint(cfg.stationAt || 0) + (cfg.stopOffset || 0));
  }
  function headAt(tMatch) { return CFG.trainHeadAt(sched, tMatch); }

  /* ---------- geometry ---------- */
  function mat(name, fallback) { var M = World._internals && World._internals().M; return (M && M[name]) || (M && M[fallback]) || new THREE.MeshLambertMaterial({ color: 0x777777 }); }
  function bx(parent, x, y, z, w, h, d, m) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b;
  }
  function cy(parent, x, y, z, r, h, m, rotZ) {
    var c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), m);
    c.position.set(x, y, z); if (rotZ) c.rotation.z = rotZ; c.castShadow = true; parent.add(c); return c;
  }
  function bogies(g, L, steel, dark) {
    [-L / 2 + 1.9, L / 2 - 1.9].forEach(function (bx0) {
      bx(g, bx0, 0.55, 0, 2.6, 0.35, 2.4, steel);                       // bogie frame
      [-0.9, 0.9].forEach(function (wx) { cy(g, bx0 + wx, 0.42, -1.1, 0.42, 0.22, dark, Math.PI / 2); cy(g, bx0 + wx, 0.42, 1.1, 0.42, 0.22, dark, Math.PI / 2); });
      bx(g, bx0, 0.42, 0, 2.2, 0.16, 0.16, steel);                      // axle
    });
  }
  /* The locomotive faces +x (the direction of travel along the path). */
  function buildLoco() {
    var g = new THREE.Group();
    var body = mat('railGreen', 'metal'), steel = mat('metal'), dark = mat('dark', 'metal'), glass = mat('shopGlass', 'metal'), warn = mat('hazard', 'metal'), roofM = mat('roof', 'dark');
    bx(g, 0, 0.9, 0, LOCO_L, 0.5, 2.9, steel);                          // frame
    bx(g, -0.6, 2.35, 0, 7.6, 2.4, 2.9, body);                          // hood
    bx(g, 3.9, 2.55, 0, 3.0, 2.8, 3.0, body);                           // cab
    bx(g, 5.55, 2.8, 0, 0.3, 1.1, 2.4, glass);                          // windscreen
    [-1.5, 1.5].forEach(function (sz) { bx(g, 3.9, 2.9, sz * 1.01, 2.4, 0.9, 0.08, glass); });   // cab side windows
    bx(g, 0.4, 3.8, 0, 8.0, 0.25, 2.96, roofM);                         // roof
    bx(g, -2.2, 4.05, 0, 0.9, 0.5, 0.9, dark);                          // exhaust stack (top 4.30: the footbridge deck is at 4.35)
    bx(g, 5.5, 1.35, 0, 0.5, 0.6, 2.9, warn);                           // buffer beam / stripes
    bx(g, 5.6, 1.15, 0, 0.35, 0.9, 0.5, dark);                          // coupler
    bx(g, 5.72, 3.0, -0.9, 0.12, 0.3, 0.4, mat('amberGlow', 'white'));  // headlights
    bx(g, 5.72, 3.0, 0.9, 0.12, 0.3, 0.4, mat('amberGlow', 'white'));
    bx(g, -1.0, 1.25, -1.55, 5.0, 0.7, 0.2, steel);                     // side tanks
    bx(g, -1.0, 1.25, 1.55, 5.0, 0.7, 0.2, steel);
    [-3.6, -1.6, 0.4].forEach(function (vx) { bx(g, vx, 2.6, -1.5, 1.2, 1.0, 0.06, dark); bx(g, vx, 2.6, 1.5, 1.2, 1.0, 0.06, dark); });   // louvres
    bogies(g, LOCO_L, steel, dark);
    return g;
  }
  function buildCoach(idx) {
    var g = new THREE.Group();
    var body = mat(idx % 2 ? 'facadeIndigo' : 'steelBlue', 'metal'), steel = mat('metal'), dark = mat('dark', 'metal'), glass = mat('shopGlass', 'metal'), roofM = mat('roof', 'dark'), seat = mat('seatSand', 'wood'), floorM = mat('wood');
    bx(g, 0, 0.9, 0, CL, 0.4, 2.9, steel);                              // underframe
    bx(g, 0, FLOOR - 0.06, 0, CL - 0.4, 0.12, 2.6, floorM);             // floor (walking surface at FLOOR)
    bx(g, 0, 1.45, -HALF_W + 0.05, CL, 0.9, 0.1, body);                 // lower side panels
    bx(g, 0, 1.45, HALF_W - 0.05, CL, 0.9, 0.1, body);
    // window strip with pillars; door openings at both ends of both sides
    [-1, 1].forEach(function (sd) {
      var z = sd * (HALF_W - 0.05);
      bx(g, 0, 2.55, z, CL - 5.2, 1.3, 0.06, glass);                    // window band between the doors
      for (var px = -CL / 2 + 3.0; px <= CL / 2 - 3.0; px += 1.5) bx(g, px, 2.55, z, 0.14, 1.3, 0.14, body);   // pillars
      bx(g, 0, 3.35, z, CL, 0.3, 0.12, body);                           // cantrail
      // door frames (openings stay OPEN: the doors are how you get on)
      [-CL / 2 + 1.7, CL / 2 - 1.7].forEach(function (dx) {
        bx(g, dx - 0.95, 2.2, z, 0.1, 2.3, 0.14, body); bx(g, dx + 0.95, 2.2, z, 0.1, 2.3, 0.14, body);
        bx(g, dx, STEP_Y - 0.05, sd * (HALF_W + 0.15), 1.9, 0.1, 0.3, steel);   // boarding step
      });
      bx(g, -CL / 2 + 0.55, 2.55, z, 1.1, 1.3, 0.06, body);             // end panels beyond the doors
      bx(g, CL / 2 - 0.55, 2.55, z, 1.1, 1.3, 0.06, body);
    });
    bx(g, -CL / 2 + 0.05, 2.35, 0, 0.1, 2.7, 2.9, body);                // end walls
    bx(g, CL / 2 - 0.05, 2.35, 0, 0.1, 2.7, 2.9, body);
    bx(g, 0, ROOF - 0.1, 0, CL, 0.2, 3.0, roofM);                       // roof (walking surface at ROOF)
    bx(g, 0, ROOF + 0.12, 0, CL - 1.0, 0.24, 1.6, roofM);               // roof rib
    for (var sx = -CL / 2 + 2.8; sx <= CL / 2 - 2.8; sx += 1.6) {        // seats in two rows, an aisle between
      bx(g, sx, FLOOR + 0.25, -0.95, 0.9, 0.5, 0.6, seat); bx(g, sx - 0.4, FLOOR + 0.65, -0.95, 0.12, 0.7, 0.6, seat);
      bx(g, sx, FLOOR + 0.25, 0.95, 0.9, 0.5, 0.6, seat); bx(g, sx - 0.4, FLOOR + 0.65, 0.95, 0.12, 0.7, 0.6, seat);
    }
    bx(g, CL / 2 + 0.3, 1.15, 0, 0.6, 0.3, 0.3, dark);                  // coupler
    bogies(g, CL, steel, dark);
    return g;
  }

  function init(sc, map) {
    dispose();
    scene = sc; mapId = map;
    cfg = CFG.TRAIN && CFG.TRAIN[map];
    active = !!cfg;
    if (!active) return false;
    FLOOR = cfg.floor || 1.05; ROOF = cfg.roof || 3.75;
    path = World.trainPath(cfg);
    buildSchedule();
    group = new THREE.Group();
    cars = [];
    var layout = CFG.trainCars(cfg);
    for (var i = 0; i < layout.length; i++) {
      var g = i === 0 ? buildLoco() : buildCoach(i);
      cars.push({ g: g, L: layout[i].L, off: layout[i].off, coach: layout[i].coach, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, px: 0, pz: 0, pyaw: 0, moving: false });
      group.add(g);
    }
    scene.add(group);
    update(0);
    return true;
  }
  function dispose() {
    if (group && scene) {
      scene.remove(group);
      group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    }
    group = null; cars = []; active = false; path = null; cfg = null;
  }

  /* ---------- per frame ---------- */
  function matchTime() {
    var m = (typeof Net !== 'undefined' && Net.getMatch) ? Net.getMatch() : null;
    if (!m || !m.startedAt) return 0;
    return (Date.now() + (m.serverOffset || 0) - m.startedAt) / 1000;
  }
  var wasAboard = false, boardToastAt = 0;
  /* v1.0g: the rider's HUD hint. Once per boarding: leaving a moving train is
     fatal (the server rule in hazards.js); the station stop is the way off. */
  function riderHint(dt) {
    var aboard = !!(typeof PlayerCtl !== 'undefined' && PlayerCtl.onPlatform);
    if (aboard && !wasAboard && typeof UI !== 'undefined' && UI.toast) {
      var nowT = performance.now();
      if (nowT - boardToastAt > 4000) { UI.toast('ABOARD \u2014 leaving a moving train is fatal; get off at the station stop', true); boardToastAt = nowT; }
    }
    wasAboard = aboard;
  }
  function update(dt) {
    if (!active) return;
    var h = headAt(matchTime());
    headS = h.s; headV = h.v;
    riderHint(dt);
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i], p = path.at(headS - c.off);
      /* v1.0f: keep the PREVIOUS pose. A rider is carried by the car's rigid
         motion between the two poses (rotation included), not by a velocity —
         that is what kept riders in their seats through the corners. */
      c.px = c.x; c.pz = c.z; c.pyaw = c.yaw;
      if (!c.seen) { c.px = p.x; c.pz = p.z; c.pyaw = p.yaw; c.seen = true; }
      c.x = p.x; c.z = p.z; c.yaw = p.yaw;
      c.vx = Math.cos(p.yaw) * headV; c.vz = Math.sin(p.yaw) * headV;
      c.moving = headV > 0.05;
      c.g.position.set(p.x, 0, p.z);
      c.g.rotation.y = -p.yaw;
    }
  }

  /* ---------- the moving floor (and the walls) the controller asks about ----------
     Mapping uses the car's PREVIOUS pose, because the controller runs after
     Train.update moved the cars and the player is still where the old pose
     left them. The result carries both poses so the controller can apply the
     rigid motion, plus what the player is standing on / walking into:
       inside  — on the coach floor; walls hold laterally and at the ends,
                 except across a door zone
       step    — on a boarding step outside a door
       roof    — on the roof
       block   — not aboard, but inside the car's body: a WALL. The controller
                 pushes the player out to the nearest face. The locomotive is
                 all wall; a coach's doors are the only way in. */
  function floorAt(pos, halfY) {
    if (!active) return null;
    var feet = pos.y - halfY;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      /* Reference frame: the car's previous pose when it is FRESH (one frame
         old); after a stall or a clock jump the previous pose is stale and the
         current one is used instead (no carry that frame, nobody flung). */
      var dyaw = c.yaw - c.pyaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      var fresh = Math.abs(c.x - c.px) + Math.abs(c.z - c.pz) < 4 && Math.abs(dyaw) < 0.6;
      var rx = fresh ? c.px : c.x, rz = fresh ? c.pz : c.z, ryaw = fresh ? c.pyaw : c.yaw;
      var dx = pos.x - rx, dz = pos.z - rz, cs = Math.cos(ryaw), sn = Math.sin(ryaw);
      var lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;        // lx along the car, lz across
      if (Math.abs(lx) > c.L / 2 + 0.35 || Math.abs(lz) > HALF_W + 0.45) continue;
      var res = null;
      var doorZone = c.coach && Math.abs(Math.abs(lx) - (c.L / 2 - 1.7)) <= 1.0;
      var inBodyXZ = Math.abs(lx) <= c.L / 2 + 0.05 && Math.abs(lz) <= HALF_W + 0.05;
      var interior = c.coach && Math.abs(lz) <= HALF_W - 0.2 && Math.abs(lx) <= c.L / 2 - 0.15;
      if (feet >= ROOF - 0.75 && inBodyXZ) res = { y: ROOF, roof: true };
      else if (c.coach && feet >= FLOOR - 0.95 && feet < ROOF - 0.75) {
        /* at body height: the interior, a door step, or the WALL itself */
        if (interior) res = { y: FLOOR, inside: true, doorZone: doorZone, ceil: ROOF - 0.15 };
        else if (doorZone && Math.abs(lz) > HALF_W - 0.2 && feet <= FLOOR + 0.6) res = { y: STEP_Y, step: true, doorZone: true };
        /* in the wall thickness: a RIDER at floor height who drifted into it is
           still a rider — the controller's interior clamp puts them back and
           the floor snap keeps them; anyone lower came from the road: a wall. */
        else if (inBodyXZ && feet >= FLOOR - 0.5 && Math.abs(lz) < HALF_W - 0.05 && Math.abs(lx) < c.L / 2 - 0.1)
          res = { y: FLOOR, inside: true, doorZone: false, ceil: ROOF - 0.15 };
        else if (inBodyXZ) res = { block: true, inward: false };
      }
      else if (feet < FLOOR - 0.95 && inBodyXZ && !(doorZone && Math.abs(lz) > HALF_W - 0.6)) res = { block: true, inward: false };
      else if (!c.coach && feet < ROOF - 0.75 && inBodyXZ) res = { block: true, inward: false };   // the locomotive is all wall
      if (!res) continue;
      res.px = rx; res.pz = rz; res.pyaw = ryaw; res.cx = c.x; res.cz = c.z; res.yaw = c.yaw;
      res.lx = lx; res.lz = lz; res.halfW = HALF_W - 0.25; res.halfL = c.L / 2 - 0.35; res.moving = c.moving;
      res.vx = c.vx; res.vz = c.vz;
      return res;
    }
    return null;
  }

  return { init: init, dispose: dispose, update: update, floorAt: floorAt,
    isActive: function () { return active; }, cars: function () { return cars; },
    head: function () { return { s: headS, v: headV }; }, schedule: function () { return sched; }, path: function () { return path; } };
})();
