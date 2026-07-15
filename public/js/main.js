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
    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  function wireInput() {
    var map = {
      KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump',
      KeyC: 'crouch', KeyQ: 'leanL', KeyE: 'leanR'
    };
    document.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var playing = Net.getPhase() === 'playing';
      if (e.code === 'Tab' && playing) {
        e.preventDefault();
        UI.updateScoreboard(Net.getRoster(), Net.myId(), Net.getRoomCode(), Net.getPing());
        UI.showScoreboard(true);
        return;
      }
      if (!locked || !playing) return;
      if (map[e.code]) { Input[map[e.code]] = true; if (e.code === 'Space') e.preventDefault(); return; }
      if (e.code === 'KeyR') { Weapons.startReload(); return; }
      if (e.code === 'KeyG') { Weapons.throwGrenade('frag'); return; }
      if (e.code === 'KeyT') { Weapons.throwGrenade('smoke'); return; }
      if (e.code === 'KeyF') { Weapons.throwGrenade('flash'); return; }
      if (e.code.indexOf('Digit') === 0) {
        var n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 8) Weapons.selectByKey(n);
      }
    });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'Tab') { UI.showScoreboard(false); return; }
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
  function onMatchStart(d) {
    UI.setLoading(true);
    setTimeout(function () {           // let the loading bar paint before the ~1s map build
      World.build(scene);
      Pickups.build(scene);
      Pickups.init(d.pickups);
      Minimap.init();
      if (!gameplayBound) { Net.bindGameplayEvents(); gameplayBound = true; }
      AudioSys.ambient();
      UI.setLoading(false);
      UI.hideEnd(); UI.hideDeath();
      UI.showHUD();
      var teams = CFG.MODES[d.settings.mode] && CFG.MODES[d.settings.mode].teams;
      UI.setKillTarget((teams ? 'FIRST TEAM TO ' : 'FIRST TO ') + d.settings.killTarget);
      UI.setTeamScore({ a: 0, b: 0 }, Net.getMyTeam(), !!teams);
      UI.showClickToPlay(true);
    }, 60);
  }

  function onLocalSpawn(pos, ry) {
    PlayerCtl.spawnAt(pos, ry);
    Weapons.resetLoadout();
    UI.hideDeath();
    UI.setVitals(CFG.PLAYER.hp, 0, 0);
    UI.setCrosshair(true);
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
    var dt = Math.min(0.05, Math.max(0.0001, (t - lastT) / 1000));
    lastT = t;

    var playing = Net.getPhase() === 'playing';
    if (playing && World.isBuilt()) {
      var wu = Weapons.update(dt);
      PlayerCtl.update(dt, Input, wu.speedMult, wu.aiming);

      PlayerCtl.eyePosition(camera.position);
      camera.rotation.y = -PlayerCtl.yaw;
      camera.rotation.x = PlayerCtl.pitch;
      camera.rotation.z = -PlayerCtl.lean * CFG.MOVE.leanAngle;

      var targetFov = wu.aiming ? wu.adsFov : 75;
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 11);
      camera.updateProjectionMatrix();
      UI.setScope(!!wu.scoped);

      Net.updateRemotes(dt);
      Net.sendState();

      FX.update(dt);
      FX.applyShake(camera);
      FX.updateFlash(dt);
      Pickups.update(dt);
      Minimap.update();

      camera.getWorldDirection(fwdV);
      AudioSys.updateListener(camera.position, fwdV, upV);

      // match timer + team score
      timerAccum += dt;
      if (timerAccum > 0.25) {
        timerAccum = 0;
        var m = Net.getMatch();
        var teamsOn = CFG.MODES[m.mode] && CFG.MODES[m.mode].teams;
        if (teamsOn) UI.setTeamScore(Net.getTeamKills(), Net.getMyTeam(), true);
        if (m.minutes > 0) {
          var serverNow = Date.now() + m.serverOffset;
          var remain = Math.max(0, m.startedAt + m.minutes * 60000 - serverNow);
          var mm = Math.floor(remain / 60000);
          var ss = Math.floor((remain % 60000) / 1000);
          UI.setTimer(mm + ':' + (ss < 10 ? '0' : '') + ss);
        } else UI.setTimer('\u221e');
      }

      // flickering warehouse / street light
      if (!flickerBases) flickerBases = World.flickers.map(function (l) { return l.intensity; });
      World.flickers.forEach(function (l, i) {
        if (Math.random() < 0.06) l.intensity = flickerBases[i] * (0.55 + Math.random() * 0.6);
      });
    }

    renderer.render(scene, camera);
  }

  return {
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
