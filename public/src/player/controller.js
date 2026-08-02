/* PlayerCtl — local player physics. Position is the CENTER of the collision box.
   Axis-by-axis AABB resolution with a 0.42m auto-step (stairs, curbs, rubble). */
var PlayerCtl = (function () {
  var P = CFG.PLAYER, MV = CFG.MOVE;
  var pos = new THREE.Vector3(0, 0.95, 0);
  var vel = new THREE.Vector3();
  var yaw = 0, pitch = 0;
  var crouch = false, prone = false, grounded = false, alive = false;
  var landHit = 0; // set on hard landings, consumed by main for a camera dip
  var lastSurf = 0; // footstep surface of the collider underfoot
  var lean = 0;          // -1 left .. 1 right (smoothed)
  var leanTarget = 0;
  var moveState = 0;     // 0 idle, 1 walk, 2 sprint (broadcast for footstep sync)
  var stepDist = 0;
  var halfY = P.standH / 2;
  var bobT = 0;
  /* Failsafe state. The old net was a hard-coded y < -8, which no Urban slab
     could ever reach: being resolved under a ground slab parks you at -0.90 and
     you simply stay there. The threshold is now derived from the map's own
     lowest collider at spawn time, so it adapts to Metro's subway (floor near
     -6) without a per-map constant. Recovery teleports to the last position
     the player was safely standing on, not to the map centre. */
  var voidY = -8;
  var lastSafe = new THREE.Vector3(0, 3, 0);

  function halfH() { return prone ? P.proneH / 2 : crouch ? P.crouchH / 2 : P.standH / 2; }
  function eyeOffset() { return prone ? P.eyeProne : crouch ? P.eyeCrouch : P.eyeStand; }

  function toggleProne() {
    if (!alive) return;
    if (!prone) { prone = true; crouch = false; halfY = halfH(); return; }
    // getting up: try standing first, fall back to crouch under low ceilings
    var tries = [[false, P.standH / 2], [true, P.crouchH / 2]];
    for (var i = 0; i < tries.length; i++) {
      var h = tries[i][1];
      if (overlapAny(pos.x, pos.y + (h - halfY) + 0.02, pos.z, P.radius, h, P.radius) < 0) {
        pos.y += (h - halfY);
        prone = false; crouch = tries[i][0]; halfY = h;
        return;
      }
    }
  }

  function spawnAt(p, ry) {
    pos.set(p[0], p[1], p[2]);
    vel.set(0, 0, 0);
    yaw = ry || 0; pitch = 0; crouch = false; prone = false; lean = 0; leanTarget = 0;
    halfY = P.standH / 2;          // stale from a crouched death otherwise
    alive = true;
    // Derive the void plane from the map that is actually loaded.
    var cs = World.colliders, lo = 0;
    for (var i = 0; i < cs.length; i++) if (cs[i][1] < lo) lo = cs[i][1];
    voidY = lo - 2.5;
    /* Spawn tables are not consistent about what their y means: Urban stores
       the box CENTRE (0.95), Metro and Rural store the FLOOR (0). Spawning
       straight onto a floor value buries the player half a body deep for a
       frame. Rather than migrate three data tables, push out of whatever we
       landed in — the recovery pass only ever moves upward, so this is safe. */
    unstick(P.radius, halfY, P.radius);
    lastSafe.copy(pos);
  }

  function overlapAny(cx, cy, cz, hx, hy, hz, skipIdx) {
    var cs = World.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (cx - hx < c[3] && cx + hx > c[0] && cy - hy < c[4] && cy + hy > c[1] && cz - hz < c[5] && cz + hz > c[2]) return i;
    }
    return -1;
  }

  /* ---------------------------------------------------------------------
     v8.1 COLLISION RESOLVER

     The old resolver walked the collider array and snapped the player out of
     each overlap in array order. Three defects came out of that, and all three
     were reachable in a normal match:

     1. ORDER DEPENDENCE. Pushed out of box A into box B, then out of B back
        into A — final position inside A. In a corner that squeezes the player
        through the seam between two boxes.
     2. THE AUTO-STEP SKIPPED RESOLUTION. `continue` after raising the player
        left the horizontal move unresolved, so a step-up could finish inside
        the very box it had just stepped over.
     3. A RISING MOVE SNAPPED THE PLAYER TO A BOX'S UNDERSIDE with no check
        that they had ever been below it. Urban has 11 collider slabs of 3x3 m
        or larger whose bottom face sits at y = 0.00 — the ground line —
        so resolving upward against one placed the player at y = -0.90.
        Under the map. The old -8 failsafe could never fire.

     THE FIX. A single-axis move can only ever be corrected AGAINST the
     direction of travel, so the correct answer is the single most restrictive
     correction among every overlapping box. Taking the extreme instead of the
     first makes the result independent of array order.

     Vertical moves additionally require that the player was already on the
     correct side of the box BEFORE the move — you can only land on a top you
     were above, and only be stopped by an underside you were below. That is
     what makes a teleport from above a slab to beneath it impossible.
     --------------------------------------------------------------------- */

  var EPS = 0.001;
  var SIDE_TOL = 0.06;   // forgiveness for the "which side were you on" test

  /* Scan every collider overlapping the proposed position and return the most
     restrictive correction along `axis`, or null if the position is clear.
     `top` is the highest surface among the blockers, used by the auto-step. */
  function sweepAxis(v, axis, delta, hx, hy, hz, startY) {
    var cs = World.colliders;
    var half = axis === 1 ? hy : (axis === 0 ? hx : hz);
    var hit = false, best = 0, surf = 0, top = -Infinity;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (!(v[0] - hx < c[3] && v[0] + hx > c[0] &&
            v[1] - hy < c[4] && v[1] + hy > c[1] &&
            v[2] - hz < c[5] && v[2] + hz > c[2])) continue;
      var cand;
      if (delta > 0) {
        // Rising / moving +: only an underside the player was below can stop them.
        if (axis === 1 && startY + hy > c[1] + SIDE_TOL) continue;
        cand = c[axis] - half - EPS;
        if (!hit || cand < best) { best = cand; surf = c[6] | 0; }
      } else {
        // Falling / moving -: only a top the player was above can catch them.
        if (axis === 1 && startY - hy < c[4] - SIDE_TOL) continue;
        cand = c[axis + 3] + half + EPS;
        if (!hit || cand > best) { best = cand; surf = c[6] | 0; }
      }
      if (c[4] > top) top = c[4];
      hit = true;
    }
    return hit ? { pos: best, surf: surf, top: top } : null;
  }

  function moveAxis(axis, delta) {
    if (delta === 0) return;
    var hx = P.radius, hy = halfY, hz = P.radius;
    var startY = pos.y;
    var v = [pos.x, pos.y, pos.z];
    v[axis] += delta;

    if (axis === 1) {
      var rv = sweepAxis(v, 1, delta, hx, hy, hz, startY);
      if (rv) {
        if (delta < 0) {
          if (vel.y < -4.5) landHit = Math.min(1, -vel.y / 13);
          grounded = true; lastSurf = rv.surf;
          v[1] = rv.pos;
        } else {
          // A rising move must never finish BELOW where it started. This one
          // clamp is what makes falling through the world impossible.
          v[1] = Math.max(startY, rv.pos);
        }
        vel.y = 0;
      }
      pos.set(v[0], v[1], v[2]);
      return;
    }

    var rh = sweepAxis(v, axis, delta, hx, hy, hz, startY);
    if (!rh) { pos.set(v[0], v[1], v[2]); return; }

    // Auto-step: climb small ledges (stairs, curbs, rubble). Tested against the
    // WHOLE collider set, and if it succeeds the horizontal move stands — the
    // old version skipped resolution and could finish inside the ledge.
    if (grounded && rh.top > -Infinity) {
      var rise = rh.top - (v[1] - hy);
      if (rise > 0 && rise <= MV.step) {
        var ny = v[1] + rise + 0.02;
        if (overlapAny(v[0], ny, v[2], hx, hy, hz) < 0) {
          pos.set(v[0], ny, v[2]);
          return;
        }
      }
    }
    v[axis] = rh.pos;
    pos.set(v[0], v[1], v[2]);
  }

  /* Last-resort recovery. If a frame ends inside geometry (bad map data, a
     spawn placed too close, a case none of us predicted) push out along the
     axis of least penetration. Pushing DOWN is deliberately not an option:
     ending on top of a box is a visible, recoverable glitch, while ending
     underneath one is the bug this whole rewrite exists to kill. */
  function unstick(hx, hy, hz) {
    var cs = World.colliders;
    for (var pass = 0; pass < 4; pass++) {
      var idx = overlapAny(pos.x, pos.y, pos.z, hx, hy, hz);
      if (idx < 0) return true;
      var c = cs[idx];
      var up = c[4] - (pos.y - hy);
      var xp = c[3] - (pos.x - hx), xn = (pos.x + hx) - c[0];
      var zp = c[5] - (pos.z - hz), zn = (pos.z + hz) - c[2];
      var best = Math.min(up, xp, xn, zp, zn);
      if (best === up) { pos.y = c[4] + hy + EPS; vel.y = 0; grounded = true; }
      else if (best === xp) pos.x = c[3] + hx + EPS;
      else if (best === xn) pos.x = c[0] - hx - EPS;
      else if (best === zp) pos.z = c[5] + hz + EPS;
      else pos.z = c[2] - hz - EPS;
    }
    return overlapAny(pos.x, pos.y, pos.z, hx, hy, hz) < 0;
  }

  function update(dt, input, weaponSpeedMult, isAiming) {
    if (!alive) return;
    halfY = halfH();

    // crouch toggle-with-headroom
    if (input.crouch !== crouch) {
      if (input.crouch) { crouch = true; prone = false; halfY = halfH(); }
      else {
        var standHalf = P.standH / 2;
        if (overlapAny(pos.x, pos.y + (standHalf - halfY) + 0.02, pos.z, P.radius, standHalf, P.radius) < 0) {
          pos.y += (standHalf - halfY);
          crouch = false; halfY = standHalf;
        }
      }
    }

    // desired horizontal velocity in yaw space
    var fx = 0, fz = 0;
    if (input.fwd) fz -= 1;
    if (input.back) fz += 1;
    if (input.left) fx -= 1;
    if (input.right) fx += 1;
    var len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    var sprinting = input.sprint && input.fwd && !crouch && !prone && !isAiming;
    var speed = prone ? MV.prone : crouch ? MV.crouch : (sprinting ? MV.sprint : MV.walk);
    speed *= (weaponSpeedMult || 1);
    if (isAiming) speed *= MV.adsMult;

    var sin = Math.sin(yaw), cos = Math.cos(yaw);
    var wx = (fx * cos - fz * sin) * speed;
    var wz = (fx * sin + fz * cos) * speed;

    var accel = grounded ? MV.accel : MV.airAccel;
    vel.x += Math.max(-accel * dt, Math.min(accel * dt, wx - vel.x));
    vel.z += Math.max(-accel * dt, Math.min(accel * dt, wz - vel.z));

    if (input.jump && grounded && !prone) { vel.y = MV.jump; grounded = false; }
    vel.y -= MV.gravity * dt;
    if (vel.y < -30) vel.y = -30;

    var preX = pos.x, preZ = pos.z;
    moveAxis(0, vel.x * dt);
    moveAxis(2, vel.z * dt);
    grounded = false;
    moveAxis(1, vel.y * dt);

    // Recovery, cheapest first.
    unstick(P.radius, halfY, P.radius);
    if (pos.y < voidY) { pos.copy(lastSafe); vel.set(0, 0, 0); grounded = false; }
    else if (grounded) lastSafe.copy(pos);

    // lean (Q/E) — only extend if there is room
    leanTarget = (input.leanL ? -1 : 0) + (input.leanR ? 1 : 0);
    lean += (leanTarget - lean) * Math.min(1, dt * 12);

    // footsteps
    var moved = Math.hypot(pos.x - preX, pos.z - preZ);
    moveState = 0;
    if (grounded && moved > dt * 0.6) {
      moveState = sprinting ? 2 : 1;
      stepDist += moved;
      var stride = sprinting ? 3.1 : 2.3;
      if (stepDist > stride) {
        stepDist = 0;
        AudioSys.step(null, crouch || prone, sprinting, lastSurf);
        bobT += Math.PI;
      }
    }
    bobT += dt * (moveState === 2 ? 11 : moveState === 1 ? 8 : 2);
  }

  function eyePosition(out) {
    out = out || new THREE.Vector3();
    var side = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    var shift = lean * MV.leanShift;
    // don't lean the camera into a wall
    if (shift !== 0) {
      var tx = pos.x + side.x * shift, tz = pos.z + side.z * shift;
      if (overlapAny(tx, pos.y + eyeOffset() - 0.1, tz, 0.16, 0.16, 0.16) >= 0) shift *= 0.15;
    }
    var bob = (moveState > 0 && grounded) ? Math.sin(bobT) * (moveState === 2 ? 0.05 : 0.028) : 0;
    out.set(pos.x + side.x * shift, pos.y + eyeOffset() + bob, pos.z + side.z * shift);
    return out;
  }

  return {
    get pos() { return pos; },
    get vel() { return vel; },
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get pitch() { return pitch; }, set pitch(v) { pitch = Math.max(-1.53, Math.min(1.53, v)); },
    get crouch() { return crouch; },
    get prone() { return prone; },
    toggleProne: toggleProne,
    get grounded() { return grounded; },
    get lean() { return lean; },
    get moveState() { return moveState; },
    get alive() { return alive; }, set alive(v) { alive = v; },
    consumeLand: function () { var l = landHit; landHit = 0; return l; },
    spawnAt: spawnAt,
    update: update,
    eyePosition: eyePosition,
    eyeOffset: eyeOffset,
    /* Headless hook for tools/verify-collision.js. Mirrors World._colliders():
       the resolver is the one part of the client that must be provable without
       a browser, because its failure mode is invisible until someone films it. */
    _probe: {
      moveAxis: moveAxis,
      unstick: function () { return unstick(P.radius, halfY, P.radius); },
      setGrounded: function (g) { grounded = !!g; },
      halfY: function () { return halfY; },
      voidY: function () { return voidY; }
    }
  };
})();
