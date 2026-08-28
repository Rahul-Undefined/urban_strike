/* ============================================================================
   TPPCAM — the third-person camera boom, as pure math (v13.0, brief item 5).

   WHY A MODULE AND NOT TEN LINES IN GAME.JS: the boom is the one piece of TPP
   that can be wrong in ways a play-test misses (clip through a wall you did
   not stand near, jitter at a pitch you did not try). Pure math with an
   injected raycast means tools/verify-tpp.js exercises THE SAME CODE the game
   runs — not a re-derivation that drifts.

   CONVENTIONS (reconciled once, here):
   - PlayerCtl.yaw / .pitch are the game's own angles; the camera is aimed
     with rotation.y = -yaw, rotation.x = pitch, order YXZ (game.js).
   - The forward vector that matches that camera is
       f = ( cos(pitch)*sin(yaw), sin(pitch), -cos(pitch)*cos(yaw) )
     — derived from rotating (0,0,-1) by X then Y exactly as three.js does,
     with ry = -yaw substituted. The gate pins this against known angles so a
     sign regression cannot hide.
   - right = f x up, up = (0,1,0): the shoulder offset side.

   THE BOOM: desired = eye + back*DIST + right*SIDE + (0,UP,0), back = -f.
   One ray from the EYE toward the desired point; a hit closer than the boom
   length pulls the camera in to (hit - MARGIN), never below MIN — the camera
   may hug your back, but it may not enter the wall and it may not enter you.
   ========================================================================= */
(function () {
  var DIST = 3.2;    // boom length, metres behind the eye
  var SIDE = 0.45;   // over-the-right-shoulder offset
  var UP   = 0.35;   // above the eye line, so the body does not fill the frame
  var MARGIN = 0.28; // stand-off from whatever the ray hit
  var MIN  = 0.5;    // the camera never comes closer to the eye than this

  function forward(yaw, pitch) {
    var cp = Math.cos(pitch);
    return { x: cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) };
  }

  /* eye: {x,y,z}; rayFn(origin, dirUnit, maxDist) -> {dist} or null.
     Returns {x,y,z, clamped, dist} — dist is the realised boom length. */
  function computeBoom(eye, yaw, pitch, rayFn) {
    var f = forward(yaw, pitch);
    // right = f x up  (up = 0,1,0)  =>  (-f.z, 0, f.x)
    var rx = -f.z, rz = f.x;
    var rl = Math.sqrt(rx * rx + rz * rz) || 1;
    rx /= rl; rz /= rl;

    var dx = -f.x * DIST + rx * SIDE;
    var dy = -f.y * DIST + UP;
    var dz = -f.z * DIST + rz * SIDE;
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var ux = dx / L, uy = dy / L, uz = dz / L;

    var t = L, clamped = false;
    if (rayFn) {
      var hit = rayFn({ x: eye.x, y: eye.y, z: eye.z }, { x: ux, y: uy, z: uz }, L + MARGIN);
      var hd = hit && (hit.dist !== undefined ? hit.dist :
                       hit.distance !== undefined ? hit.distance : hit.d);
      if (hd !== undefined && hd !== null && hd < L) {
        t = Math.max(MIN, hd - MARGIN);
        clamped = true;
      }
    }
    return { x: eye.x + ux * t, y: eye.y + uy * t, z: eye.z + uz * t,
             clamped: clamped, dist: t };
  }

  var api = { computeBoom: computeBoom, forward: forward,
              DIST: DIST, SIDE: SIDE, UP: UP, MARGIN: MARGIN, MIN: MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TPPCam = api;
})();
