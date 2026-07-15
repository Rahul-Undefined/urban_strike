/* PlayerCtl — local player physics. Position is the CENTER of the collision box.
   Axis-by-axis AABB resolution with a 0.42m auto-step (stairs, curbs, rubble). */
var PlayerCtl = (function () {
  var P = CFG.PLAYER, MV = CFG.MOVE;
  var pos = new THREE.Vector3(0, 0.95, 0);
  var vel = new THREE.Vector3();
  var yaw = 0, pitch = 0;
  var crouch = false, grounded = false, alive = false;
  var landHit = 0; // set on hard landings, consumed by main for a camera dip
  var lean = 0;          // -1 left .. 1 right (smoothed)
  var leanTarget = 0;
  var moveState = 0;     // 0 idle, 1 walk, 2 sprint (broadcast for footstep sync)
  var stepDist = 0;
  var halfY = P.standH / 2;
  var bobT = 0;

  function halfH() { return crouch ? P.crouchH / 2 : P.standH / 2; }
  function eyeOffset() { return crouch ? P.eyeCrouch : P.eyeStand; }

  function spawnAt(p, ry) {
    pos.set(p[0], p[1], p[2]);
    vel.set(0, 0, 0);
    yaw = ry || 0; pitch = 0; crouch = false; lean = 0; leanTarget = 0;
    alive = true;
  }

  function overlapAny(cx, cy, cz, hx, hy, hz, skipIdx) {
    var cs = World.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (cx - hx < c[3] && cx + hx > c[0] && cy - hy < c[4] && cy + hy > c[1] && cz - hz < c[5] && cz + hz > c[2]) return i;
    }
    return -1;
  }

  function moveAxis(axis, delta) {
    if (delta === 0) return;
    var v = [pos.x, pos.y, pos.z];
    v[axis] += delta;
    var hx = P.radius, hy = halfY, hz = P.radius;
    var cs = World.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (!(v[0] - hx < c[3] && v[0] + hx > c[0] && v[1] - hy < c[4] && v[1] + hy > c[1] && v[2] - hz < c[5] && v[2] + hz > c[2])) continue;
      if (axis === 1) {
        if (delta < 0) { if (vel.y < -4.5) landHit = Math.min(1, -vel.y / 13); v[1] = c[4] + hy + 0.001; grounded = true; vel.y = 0; }
        else { v[1] = c[1] - hy - 0.001; vel.y = 0; }
      } else {
        // auto-step: climb small ledges (stairs, curbs)
        var footY = v[1] - hy;
        var rise = c[4] - footY;
        if (grounded && rise > 0 && rise <= MV.step) {
          var ny = v[1] + rise + 0.02;
          if (overlapAny(v[0], ny, v[2], hx, hy, hz) < 0) { v[1] = ny; continue; }
        }
        if (delta > 0) v[axis] = c[axis] - (axis === 0 ? hx : hz) - 0.001;
        else v[axis] = c[axis + 3] + (axis === 0 ? hx : hz) + 0.001;
      }
    }
    pos.set(v[0], v[1], v[2]);
  }

  function update(dt, input, weaponSpeedMult, isAiming) {
    if (!alive) return;
    halfY = halfH();

    // crouch toggle-with-headroom
    if (input.crouch !== crouch) {
      if (input.crouch) { crouch = true; halfY = halfH(); }
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
    var sprinting = input.sprint && input.fwd && !crouch && !isAiming;
    var speed = crouch ? MV.crouch : (sprinting ? MV.sprint : MV.walk);
    speed *= (weaponSpeedMult || 1);
    if (isAiming) speed *= MV.adsMult;

    var sin = Math.sin(yaw), cos = Math.cos(yaw);
    var wx = (fx * cos - fz * sin) * speed;
    var wz = (fx * sin + fz * cos) * speed;

    var accel = grounded ? MV.accel : MV.airAccel;
    vel.x += Math.max(-accel * dt, Math.min(accel * dt, wx - vel.x));
    vel.z += Math.max(-accel * dt, Math.min(accel * dt, wz - vel.z));

    if (input.jump && grounded) { vel.y = MV.jump; grounded = false; }
    vel.y -= MV.gravity * dt;
    if (vel.y < -30) vel.y = -30;

    var preX = pos.x, preZ = pos.z;
    moveAxis(0, vel.x * dt);
    moveAxis(2, vel.z * dt);
    grounded = false;
    moveAxis(1, vel.y * dt);
    if (pos.y < -8) { pos.set(0, 3, 0); vel.set(0, 0, 0); } // failsafe

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
        AudioSys.step(null, crouch, sprinting);
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
    get grounded() { return grounded; },
    get lean() { return lean; },
    get moveState() { return moveState; },
    get alive() { return alive; }, set alive(v) { alive = v; },
    consumeLand: function () { var l = landHit; landHit = 0; return l; },
    spawnAt: spawnAt,
    update: update,
    eyePosition: eyePosition,
    eyeOffset: eyeOffset
  };
})();
