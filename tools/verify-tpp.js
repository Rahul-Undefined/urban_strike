/* ============================================================================
   VERIFY-TPP (v13.0, brief item 5)

   Two halves. The MATH half exercises tppcam.js — the same module the game
   runs — against hand-computed angles, so a sign regression in the forward
   vector or a broken clamp cannot hide behind "it looked fine on the one map
   I tried". The WIRING half asserts the seams in game.js / weapons/system.js
   / index.html as source text: a boom module nobody calls is a boom module
   that silently stopped existing.

   Conventions pinned here (derived once in tppcam.js, asserted forever):
     f = ( cos(pitch)*sin(yaw), sin(pitch), -cos(pitch)*cos(yaw) )
   matches camera.rotation.y = -yaw, rotation.x = pitch, order YXZ.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const TPP = require('../public/src/core/tppcam.js');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 0.01); }

console.log('--- tppcam: the forward vector matches the camera convention ---');
{
  const f0 = TPP.forward(0, 0);
  ok(near(f0.x, 0) && near(f0.y, 0) && near(f0.z, -1),
    'yaw 0, pitch 0 looks down -Z exactly like the camera [' + f0.x.toFixed(3) + ',' + f0.y.toFixed(3) + ',' + f0.z.toFixed(3) + ']');
  const fE = TPP.forward(Math.PI / 2, 0);
  ok(near(fE.x, 1) && near(fE.z, 0), 'yaw +90\u00b0 looks down +X (the game\'s east)');
  const fU = TPP.forward(0, 0.5);
  ok(fU.y > 0.47 && fU.y < 0.49, 'positive pitch looks UP (y = sin(pitch)) [' + fU.y.toFixed(3) + ']');
}

console.log('--- tppcam: the boom sits behind the right shoulder ---');
{
  const b = TPP.computeBoom({ x: 0, y: 1.6, z: 0 }, 0, 0, null);
  ok(near(b.x, TPP.SIDE) && near(b.y, 1.6 + TPP.UP) && near(b.z, TPP.DIST),
    'yaw 0: boom lands at (+SIDE, eye+UP, +DIST) = (' + b.x.toFixed(2) + ', ' + b.y.toFixed(2) + ', ' + b.z.toFixed(2) + ')');
  ok(!b.clamped && near(b.dist, Math.sqrt(TPP.DIST * TPP.DIST + TPP.SIDE * TPP.SIDE + TPP.UP * TPP.UP), 0.02),
    'no obstruction: full boom length, clamped=false [' + b.dist.toFixed(2) + ' m]');

  const bE = TPP.computeBoom({ x: 0, y: 1.6, z: 0 }, Math.PI / 2, 0, null);
  ok(bE.x < -3 && near(bE.z, TPP.SIDE) && near(bE.y, 1.6 + TPP.UP),
    'yaw +90\u00b0: boom swings to -X, shoulder offset rides to +Z [' + bE.x.toFixed(2) + ', ' + bE.z.toFixed(2) + ']');

  const bD = TPP.computeBoom({ x: 0, y: 1.6, z: 0 }, 0, -0.6, null);
  ok(bD.y > 1.6 + 1.5,
    'looking DOWN raises the boom over the shoulder (y = ' + bD.y.toFixed(2) + ' vs eye 1.60) \u2014 the over-the-head shot every TPP game frames');
}

console.log('--- tppcam: walls pull the camera in, never through ---');
{
  const wall1 = (o, d, m) => ({ dist: 1.0 });
  const b1 = TPP.computeBoom({ x: 0, y: 1.6, z: 0 }, 0, 0, wall1);
  ok(b1.clamped === true && near(b1.dist, 1.0 - TPP.MARGIN),
    'a hit at 1.0 m stands the camera off by MARGIN [' + b1.dist.toFixed(2) + ' m, clamped=' + b1.clamped + ']');

  const wall2 = (o, d, m) => ({ dist: 0.55 });
  const b2 = TPP.computeBoom({ x: 0, y: 1.6, z: 0 }, 0, 0, wall2);
  ok(near(b2.dist, TPP.MIN),
    'a hit inside MARGIN floors at MIN \u2014 the camera hugs the back, never enters the head [' + b2.dist.toFixed(2) + ' m]');

  const far = (o, d, m) => ({ dist: 99 });
  const b3 = TPP.computeBoom({ x: 0, y: 1.6, z: 0 }, 0, 0, far);
  ok(b3.clamped === false, 'a hit beyond the boom length is ignored \u2014 distant walls do not tug the camera');

  const alt = (o, d, m) => ({ distance: 1.0 });   // three.js Raycaster spells it "distance"
  const b4 = TPP.computeBoom({ x: 0, y: 1.6, z: 0 }, 0, 0, alt);
  ok(b4.clamped === true, 'the hit adapter reads .distance as well as .dist \u2014 both raycast dialects clamp');
}

console.log('--- wiring: the seams exist in the shipped source ---');
{
  const game = fs.readFileSync(path.join(__dirname, '../public/src/core/game.js'), 'utf8');
  const weap = fs.readFileSync(path.join(__dirname, '../public/src/weapons/system.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

  ok(/e\.code === 'KeyP'/.test(game), 'game.js binds P (verify-models\' duplicate-claim gate rules on collisions)');
  ok(/TPPCam\.computeBoom/.test(game), 'game.js aims the camera through TPPCam.computeBoom \u2014 the gated module, not a re-derivation');
  ok(/step\('ownbody'/.test(game), 'game.js drives the local body as its own step, on the remote pose contract');
  ok(/us_tpp/.test(game), 'the perspective persists (localStorage us_tpp)');
  ok(/Weapons\.setFirstPerson/.test(game), 'game.js tells WEAPONS which prop set to draw');
  ok(/rig\.visible = PlayerCtl\.alive && !scoped && firstPerson/.test(weap),
    'the viewmodel visibility line carries the flag \u2014 a one-time hide would be overwritten every frame');
  const tppIdx = html.indexOf('src/core/tppcam.js');
  const gameIdx = html.indexOf('src/core/game.js');
  ok(tppIdx !== -1 && gameIdx !== -1 && tppIdx < gameIdx,
    'index.html loads tppcam.js BEFORE game.js \u2014 the caller cannot outrun its module');
  ok(/scoped aim is always first person/i.test(html) || /first \/ third person/i.test(html),
    'the field manual tells the player P exists \u2014 an unbindable feature is an unshipped one');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
