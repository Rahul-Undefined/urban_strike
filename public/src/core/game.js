/* main.js — boots Three.js, owns Input + the render loop, and wires the
   match lifecycle. Everything else lives in its own module. */

var Input = {
  fwd: false, back: false, left: false, right: false,
  sprint: false, jump: false, crouch: false,
  leanL: false, leanR: false, aim: false
};

var Game = (function () {
  var renderer, scene, camera, canvas;
  var locked = false;
  var lastT = 0;
  var gameplayBound = false;
  var deathInterval = null;
  var flickerBases = null;
  var baseSens = 0.0023;
  var timerAccum = 0;
  var landDip = 0;

  /* v8.30 ERROR SURFACE.

     Before this, a client-side throw was invisible: the console had it, the
     player had a black screen, and the report that came back was "it is
     stuck". Every guard added in this version funnels here, so the actual
     message reaches the screen and the bug becomes reportable instead of
     guessable.

     Rate-limited hard, because the render loop runs at 60Hz and an unlucky
     frame would otherwise queue sixty toasts a second and make things worse
     than the fault it is reporting. Each distinct message is shown once. */
  var seenErrors = {};
  function reportError(where, err) {
    var msg = (err && err.message) ? err.message : String(err);
    var key = where + '|' + msg;
    if (seenErrors[key]) return;
    seenErrors[key] = true;
    try { console.error('[UrbanStrike:' + where + ']', err); } catch (e) {}
    try { UI.toast(where + ': ' + msg, true); } catch (e) {}
  }

  /* v8.31: run one frame subsystem in isolation. Returns its value, or
     undefined if it threw. Containment is the point — a fault in remote
     avatars must not stop effects ageing, the clock ticking, or the frame
     rendering. Reporting is rate-limited by reportError, so a subsystem that
     fails every frame names itself once. */
  function step(name, fn) {
    try { return fn(); }
    catch (err) { reportError(name, err); }
  }

  // ---------- boot ----------
  function init() {
    canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 320);
    camera.rotation.order = 'YXZ';
    scene.add(camera); // required so the viewmodel (a child of the camera) renders

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    UI.init();
    AudioSys.init();
    Net.init(scene);
    FX.init(scene, camera);
    FX.initDOM();
    Weapons.init(camera, scene);

    wireInput();
    wirePointerLock();

    /* v8.30: catch anything that escapes a handler we do not own — a socket
       callback, an audio decode, a promise nobody awaited. Same rate-limited
       surface, so the player sees a message instead of a silent freeze. */
    window.addEventListener('error', function (e) {
      reportError('script', (e && e.error) || (e && e.message) || 'unknown error');
    });
    window.addEventListener('unhandledrejection', function (e) {
      reportError('async', (e && e.reason) || 'unhandled rejection');
    });

    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  function wireInput() {
    var map = {
      KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump',
      KeyC: 'crouch', KeyQ: 'leanL', KeyE: 'leanR'
    };
    /* Lifts: teleport the player between derived floor stops. Chosen over a
       moving platform because carrying a capsule on a moving collider is exactly
       the kind of marginal physics that made the tower stairs unreliable. */
    var liftPending = false;
    function rideLift() {
      if (!PlayerCtl.alive) return;
      var L = CFG.LIFTS || [], p = PlayerCtl.pos, half = CFG.PLAYER.standH / 2;
      for (var i = 0; i < L.length; i++) {
        var s = L[i], dx = p.x - s.x, dz = p.z - s.z;
        if (s.map && World.builtMap && s.map !== World.builtMap) continue;
        if (dx * dx + dz * dz > s.r * s.r) continue;
        var foot = p.y - half, best = 0, bd = 1e9;
        for (var k = 0; k < s.stops.length; k++) {
          var d = Math.abs(s.stops[k] - foot);
          if (d < bd) { bd = d; best = k; }
        }
        if (bd > 1.2) return;                       // not standing on a stop
        if (liftPending) return;                    // already riding
        var next = (best + 1) % s.stops.length;     // wraps to the ground floor
        /* 2s exposure before the move. Implemented as a delay rather than a
           lerped ride because the controller owns pos.y every frame — fighting
           it for 120 frames is precisely the marginal physics that broke the
           stairs. You stand in the shaft, visible and shootable, and if you
           walk out or die the ride is cancelled. */
        liftPending = true;
        UI.toast('Lift called \u2014 hold position (2s)');
        setTimeout(function () {
          liftPending = false;
          if (!PlayerCtl.alive) return;
          var q = PlayerCtl.pos, ex = q.x - s.x, ez = q.z - s.z;
          if (ex * ex + ez * ez > s.r * s.r) { UI.toast('Lift cancelled'); return; }
          PlayerCtl.pos.set(s.x, s.stops[next] + half + 0.05, s.z);
          UI.toast('Floor ' + next + (next === 0 ? ' (ground)' : ''));
        }, 2000);
        return;
      }
    }
    document.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      /* v8.33 THE CALLSIGN BOX WOULD NOT ACCEPT THE LETTER M.

         The M binding below calls preventDefault() and is registered ABOVE the
         pointer-lock guard on purpose, so the map opens while paused. Nothing
         checked whether the player was TYPING at the time, so every M aimed at
         the name field was swallowed and turned into a map toggle instead —
         "Sam" came out as "Sa". The same trap sits under every letter key this
         handler ever claims, so the guard is at the top of the handler rather
         than on the one binding that happened to be reported.

         ui.js already does exactly this for push-to-talk; this is the same
         check in the file that needed it. */
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.tagName === 'SELECT' || t.isContentEditable)) return;
      var playing = Net.getPhase() === 'playing';
      /* v8.9 dev overlay. Registered BEFORE the pointer-lock guard below on
         purpose: the panel has to be readable while paused, which is exactly
         when a bug gets examined. F4 copies the readout so coordinates are
         pasted into a report, not re-typed off a screenshot. */
      /* v8.22: M opens the whole map, north-up, with district names. Placed
         with the other always-available keys so it works while paused — that
         is when you actually want to study a layout. */
      if (e.code === 'KeyM') { e.preventDefault(); Minimap.toggleFull(); return; }
      if (e.code === 'F3') { e.preventDefault(); DevHUD.toggle(); return; }
      if (e.code === 'F4') { e.preventDefault(); DevHUD.copy(); return; }
      if (e.code === 'Tab' && playing) {
        e.preventDefault();
        UI.updateScoreboard(Net.getRoster(), Net.myId(), Net.getRoomCode(), Net.getPing());
        UI.showScoreboard(true);
        return;
      }
      if (!locked || !playing) return;
      if (map[e.code]) { Input[map[e.code]] = true; if (e.code === 'Space') e.preventDefault(); return; }
      if (e.code === 'KeyR') { Weapons.startReload(); return; }
      if (e.code === 'KeyG') { Weapons.startCook(); return; } // hold to cook, release to throw
      if (e.code === 'KeyX') { PlayerCtl.toggleProne(); return; }
      if (e.code === 'KeyH') { Weapons.throwGrenade('molotov'); return; }
      if (e.code === 'KeyV') { Weapons.placeMine(); return; }
      // PTT is registered once, at document level, in ui.js wireV43() — it must
      // work in the lobby too, so it does NOT live here. The old duplicate also
      // shadowed the smoke grenade, which had been unbindable ever since.
      if (e.code === 'KeyZ') { rideLift(); return; }
      /* Smoke is B. v8.21 briefly moved it to T, which collided with the old
         push-to-talk bind; v8.30 moved it back and v8.33 removed voice chat
         entirely, so T is now simply free. Left on B because that is what the
         HUD label says and what muscle memory now expects — verify-models.js
         asserts the bind and the label agree. */
      if (e.code === 'KeyB') { Weapons.throwGrenade('smoke'); return; }
      if (e.code === 'KeyF') { Weapons.throwGrenade('flash'); return; }
      if (e.code.indexOf('Digit') === 0) {
        var n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) Weapons.selectByKey(n);
      }
    });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'Tab') { UI.showScoreboard(false); return; }
      if (e.code === 'KeyG') { Weapons.releaseCook(); return; }
      var map2 = {
        KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
        ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump',
        KeyC: 'crouch', KeyQ: 'leanL', KeyE: 'leanR'
      };
      if (map2[e.code]) Input[map2[e.code]] = false;
    });

    document.addEventListener('mousemove', function (e) {
      if (!locked || !PlayerCtl.alive) return;
      var s = baseSens * UI.getSensitivity();
      PlayerCtl.yaw += e.movementX * s;
      PlayerCtl.pitch -= e.movementY * s;
    });
    document.addEventListener('mousedown', function (e) {
      if (!locked) return;
      if (e.button === 0) Weapons.setTrigger(true);
      if (e.button === 2) Input.aim = true;
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) Weapons.setTrigger(false);
      if (e.button === 2) Input.aim = false;
    });
    document.addEventListener('contextmenu', function (e) {
      if (Net.getPhase() === 'playing') e.preventDefault();
    });
    document.addEventListener('wheel', function (e) {
      if (!locked || Net.getPhase() !== 'playing') return;
      if (Weapons.wheelZoom(e.deltaY < 0 ? 1 : -1)) return; // scoped: wheel = zoom
      Weapons.cycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
  }

  function clearInput() {
    for (var k in Input) Input[k] = false;
    Weapons.setTrigger(false);
  }

  // ---------- pointer lock / pause ----------
  function requestLock() {
    AudioSys.resume();
    canvas.requestPointerLock();
  }
  function wirePointerLock() {
    document.addEventListener('pointerlockchange', function () {
      locked = document.pointerLockElement === canvas;
      if (locked) {
        UI.showPause(false);
        UI.showClickToPlay(false);
      } else {
        clearInput();
        if (Net.getPhase() === 'playing') UI.showPause(true);
      }
    });
    UI.el('click-to-play').addEventListener('click', requestLock);
    UI.el('btn-resume').addEventListener('click', requestLock);
    canvas.addEventListener('click', function () {
      if (Net.getPhase() === 'playing' && !locked &&
        UI.el('pause-overlay').classList.contains('hidden')) requestLock();
    });
  }

  // ---------- match lifecycle (called by Net) ----------
  /* v8.30 THE BLACK SCREEN WAS A MISSING ERROR BOUNDARY, NOT A MISSING FEATURE.

     `#loading` is a full-screen overlay at z-index 80 filled with var(--bg),
     which is #0d1015 — near black. Everything below used to run unguarded
     between `setLoading(true)` and `setLoading(false)`. If ANY line in that
     chain threw — the map build, a pickup, the minimap, a bad settings
     payload — the exception escaped the timer callback and the last four
     calls never ran. No `setLoading(false)`, no `showHUD()`, no
     `showClickToPlay()`. The player was left staring at a near-black overlay
     with faint dim text, unable to click into the game, forever. That is the
     "stuck on a single black screen" report, and it is why guessing at
     individual triggers never fixed it: the trigger varies, the trap does not.

     The build is now wrapped so the recovery calls run in a `finally`. Worst
     case the player lands in a half-built match and is TOLD so, which they
     can leave and rejoin. Best case nothing throws and this costs nothing.
     `reportError` puts the real message on screen so the actual trigger can
     finally be identified instead of guessed at. */
  function onMatchStart(d) {
    UI.setLoading(true);
    setTimeout(function () {           // let the loading bar paint before the ~1s map build
      var built = false;
      try {
        var mapId = (d.settings && d.settings.map) || 'urban';
        UI.setLoadingMap((CFG.MAPS[mapId] || CFG.MAPS.urban).label);
        World.buildMap(scene, mapId);
        Minimap.invalidate();
        Weapons.matchReset();
        Pickups.build(scene);
        Pickups.init(d.pickups);
        Minimap.init();
        if (!gameplayBound) { Net.bindGameplayEvents(); gameplayBound = true; }
        AudioSys.ambient();
        built = true;
      } catch (err) {
        reportError('match start', err);
      } finally {
        /* These four own the screen. They run whether the build succeeded or
           not, so a failure is a visible, playable-or-leavable state rather
           than a black hole. */
        UI.setLoading(false);
        UI.hideEnd(); UI.hideDeath();
        UI.setCountdown(-1);
        UI.showHUD();
      }
      try {
        var teams = CFG.MODES[d.settings.mode] && CFG.MODES[d.settings.mode].teams;
        UI.setKillTarget(killTargetLabel(d.settings.killTarget, teams));
        /* v8.35: seed a zero for every side this mode fields, not just a/b.
           Harmless with two, but in a squad match the HUD would otherwise open
           against a two-key object and read the wrong shape for one frame. */
        var zero = {};
        CFG.activeTeams(d.settings.mode).forEach(function (t) { zero[t] = 0; });
        UI.setTeamScore(zero, Net.getMyTeam(), !!teams);
      } catch (err2) {
        reportError('match start hud', err2);
      }
      UI.showClickToPlay(true);
      if (!built) UI.toast('Map failed to load \u2014 press ESC and rejoin the room', true);
    }, 60);
  }

  /* v8.30: 0 kills means UNLIMITED — the match runs until the clock expires.
     Mirrors how `minutes: 0` already reads as an infinity symbol on the HUD. */
  function killTargetLabel(target, teams) {
    if (!(target > 0)) return 'UNLIMITED KILLS';
    return (teams ? 'FIRST TEAM TO ' : 'FIRST TO ') + target;
  }

  function onLocalSpawn(pos, ry, prot) {
    PlayerCtl.spawnAt(pos, ry);
    Weapons.resetLoadout();
    UI.hideDeath();
    UI.setVitals(CFG.PLAYER.hp, 0, 0);
    UI.setCrosshair(true);
    FX.softFlash(0.22);
    if (prot) UI.toast('Spawn protection ' + prot + 's');
    if (deathInterval) { clearInterval(deathInterval); deathInterval = null; }
  }

  function onLocalDeath(d) {
    PlayerCtl.alive = false;
    clearInput();
    UI.setCrosshair(false);
    UI.setScope(false);
    UI.showDeath(d);
    var left = CFG.MATCH.respawnDelay;
    UI.setDeathCountdown(left);
    if (deathInterval) clearInterval(deathInterval);
    deathInterval = setInterval(function () {
      left--;
      UI.setDeathCountdown(left);
      if (left <= 0) {
        clearInterval(deathInterval); deathInterval = null;
        Net.requestRespawn();
      }
    }, 1000);
  }

  function onMatchEnd(d, myId, isHost) {
    PlayerCtl.alive = false;
    clearInput();
    if (deathInterval) { clearInterval(deathInterval); deathInterval = null; }
    UI.hideDeath();
    UI.setScope(false);
    UI.showScoreboard(false);
    UI.showPause(false);
    UI.showEnd(d, myId, isHost);
    document.exitPointerLock();
  }

  function onBackToLobby() {
    UI.hideEnd();
    UI.showMenu();
    UI.showScreen('screen-lobby');
  }

  function setShadows(on) {
    renderer.shadowMap.enabled = on;
    var sun = World.getSun();
    if (sun) sun.castShadow = on;
    scene.traverse(function (o) {
      if (o.material) {
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) { m.needsUpdate = true; });
      }
    });
  }

  // ---------- render loop ----------
  var fwdV = new THREE.Vector3(), upV = new THREE.Vector3(0, 1, 0);
  function loop(t) {
    requestAnimationFrame(loop);
    DevHUD.update(t);            // no-ops on its first line while hidden
    if (Minimap.isFullOpen()) Minimap.drawFull();   // keeps dots live while open
    var dt = Math.min(0.05, Math.max(0.0001, (t - lastT) / 1000));
    lastT = t;

    /* v8.31 ONE GUARD AROUND THE WHOLE FRAME WAS NOT ENOUGH.

       v8.30 wrapped this entire block in a single try/catch so that
       `renderer.render()` — the last statement — could never be skipped. That
       fixed the black screen, but it swapped one failure for a quieter one:
       when `Net.updateRemotes` threw (the myTeam bug), everything AFTER it in
       the block was skipped too. `FX.update` never aged anything, so muzzle
       flashes and tracers stayed on screen forever; the match clock froze at
       10:00 and the team score stayed 0-0, because both live below it.

       Each subsystem now runs in its own guard. A fault is contained to the
       thing that faulted: effects still expire, the clock still ticks, and the
       frame still renders. `step()` reports through the same rate-limited
       surface, so the first failure names itself once and does not spam. */
    var playing = Net.getPhase() === 'playing';

    if (playing && World.isBuilt()) {
      var wu = step('weapons', function () { return Weapons.update(dt); });
      /* Every later line reads wu. If the weapons update itself failed, fall
         back to inert values rather than letting one fault cascade. */
      if (!wu) wu = { speedMult: 1, aiming: false, crossGap: 0, adsFov: 75, scoped: false };

      step('player', function () {
        PlayerCtl.update(dt, Input, wu.speedMult, wu.aiming);
        UI.setCrosshairGap(wu.crossGap);

        var land = PlayerCtl.consumeLand();
        if (land) landDip = Math.max(landDip, land);
        landDip *= Math.pow(0.0004, dt);
      });

      step('camera', function () {
        PlayerCtl.eyePosition(camera.position);
        camera.position.y -= landDip * 0.2;
        camera.rotation.y = -PlayerCtl.yaw;
        camera.rotation.x = PlayerCtl.pitch;
        camera.rotation.z = -PlayerCtl.lean * CFG.MOVE.leanAngle;

        var targetFov = wu.aiming ? wu.adsFov : 75;
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 11);
        camera.updateProjectionMatrix();
        UI.setScope(!!wu.scoped);
      });

      /* Remote avatars are their own step. This is the one that broke in team
         mode, and starving everything below it is exactly what must not
         happen again. */
      step('remotes', function () {
        Net.updateRemotes(dt, camera);   // camera drives avatar distance LOD
      });
      step('netsend', function () { Net.sendState(); });

      /* FX ageing is deliberately its own step and deliberately AFTER nothing
         it depends on. If this is skipped, effects never expire and the screen
         fills with permanent muzzle flashes and tracers. */
      step('fx', function () {
        FX.update(dt);
        FX.applyShake(camera);
        FX.updateFlash(dt);
      });
      step('pickups', function () { Pickups.update(dt); });
      step('minimap', function () { Minimap.update(); });

      step('audio', function () {
        camera.getWorldDirection(fwdV);
        AudioSys.updateListener(camera.position, fwdV, upV);
      });

      // match timer + team score
      timerAccum += dt;
      if (timerAccum > 0.25) {
        timerAccum = 0;
        step('hud', function () {
          var m = Net.getMatch();
          // roof-overhead probe -> indoor echo routing
          var CC = World.colliders, px = PlayerCtl.pos.x, py = PlayerCtl.pos.y, pz = PlayerCtl.pos.z, ind = false;
          for (var ci = 0; ci < CC.length; ci++) {
            var cc = CC[ci];
            if (px >= cc[0] && px <= cc[3] && pz >= cc[2] && pz <= cc[5] && cc[1] > py + 0.6 && cc[1] < py + 9) { ind = true; break; }
          }
          AudioSys.setIndoors(ind);
          var teamsOn = CFG.MODES[m.mode] && CFG.MODES[m.mode].teams;
          if (teamsOn) UI.setTeamScore(Net.getTeamKills(), Net.getMyTeam(), true);
          if (m.minutes > 0) {
            var serverNow = Date.now() + m.serverOffset;
            var remain = Math.max(0, m.startedAt + m.minutes * 60000 - serverNow);
            var mm = Math.floor(remain / 60000);
            var ss = Math.floor((remain % 60000) / 1000);
            UI.setTimer(mm + ':' + (ss < 10 ? '0' : '') + ss);
          } else UI.setTimer('\u221e');
        });
      }

      // flickering warehouse / street light
      step('flicker', function () {
        if (!flickerBases) flickerBases = World.flickers.map(function (l) { return l.intensity; });
        World.flickers.forEach(function (l, i) {
          if (Math.random() < 0.06) l.intensity = flickerBases[i] * (0.55 + Math.random() * 0.6);
        });
      });
    }

    renderer.render(scene, camera);
  }

  return {
    /* v8.22: exposed so Minimap can read the LIVE fov for its wedge. It is
       lerped every frame for ADS and sniper zoom, so a constant would leave
       the dial claiming a 75-degree cone while the player is scoped at 8. */
    getCamera: function () { return camera; },
    init: init,
    onMatchStart: onMatchStart,
    onLocalSpawn: onLocalSpawn,
    onLocalDeath: onLocalDeath,
    onMatchEnd: onMatchEnd,
    onBackToLobby: onBackToLobby,
    setShadows: setShadows
  };
})();

window.addEventListener('DOMContentLoaded', function () { Game.init(); });
