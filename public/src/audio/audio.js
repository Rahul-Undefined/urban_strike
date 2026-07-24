/* AudioSys — every sound is synthesized with the Web Audio API, so the game
   ships with zero audio files. Remote sounds are positional (HRTF panner). */
var AudioSys = (function () {
  var ctx = null, master = null, noiseBuf = null, started = false;
  var echoSend = null;
  var volume = 0.7;

  function init() {
    if (ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      // indoor echo bus: post-master send -> slap delay + feedback + lowpass
      echoSend = ctx.createGain(); echoSend.gain.value = 0;
      var dly = ctx.createDelay(0.5); dly.delayTime.value = 0.11;
      var fb = ctx.createGain(); fb.gain.value = 0.34;
      var ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 1600;
      master.connect(echoSend); echoSend.connect(dly);
      dly.connect(ef); ef.connect(fb); fb.connect(dly);
      ef.connect(ctx.destination);
      noiseBuf = buildNoise(2);
    } catch (e) { console.warn('Audio unavailable', e); }
  }
  function resume() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (ctx && !started) { started = true; ambient(); }
  }
  function setVolume(v) { volume = v; if (master) master.gain.value = v; }

  function buildNoise(seconds) {
    var len = ctx.sampleRate * seconds;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Route a node either straight to master (local) or through a 3D panner (world position)
  function out(node, pos) {
    if (!pos) { node.connect(master); return; }
    try {
      var pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = 7; pan.maxDistance = 260; pan.rolloffFactor = 1.15;
      if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
      else pan.setPosition(pos.x, pos.y, pos.z);
      node.connect(pan); pan.connect(master);
    } catch (e) { node.connect(master); }
  }

  function updateListener(pos, fwd, up) {
    if (!ctx) return;
    var L = ctx.listener;
    try {
      if (L.positionX) {
        L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
        L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
        L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
      } else {
        L.setPosition(pos.x, pos.y, pos.z);
        L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    } catch (e) {}
  }

  function noiseBurst(pos, opts) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = opts.rate || 1;
    var f = ctx.createBiquadFilter(); f.type = opts.ftype || 'lowpass';
    f.frequency.setValueAtTime(opts.f0 || 3000, t);
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + (opts.dur || 0.2));
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.2));
    src.connect(f); f.connect(g); out(g, pos);
    src.start(t); src.stop(t + (opts.dur || 0.2) + 0.05);
  }
  function tone(pos, opts) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f0 || 440, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t + (opts.dur || 0.2));
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.2));
    o.connect(g); out(g, pos);
    o.start(t); o.stop(t + (opts.dur || 0.2) + 0.05);
  }

  // ---- game sounds ----
  // Layered per-weapon patches: body (noise burst) + crack (transient) +
  // boom (sub thump) + mech (action cycling). Each gun reads differently.
  var SHOT = {
    ak47:    { body: { f0: 2100, f1: 420, dur: 0.19, vol: 0.62 }, crack: { f: 1450, dur: 0.05, vol: 0.26, type: 'square' },   boom: { f0: 130, f1: 55, dur: 0.16, vol: 0.34 }, mech: { f: 620, vol: 0.10 } },
    m4a1:    { body: { f0: 3200, f1: 750, dur: 0.12, vol: 0.5 },  crack: { f: 2300, dur: 0.035, vol: 0.24, type: 'square' },  boom: { f0: 150, f1: 75, dur: 0.1, vol: 0.2 },   mech: { f: 900, vol: 0.07 } },
    sniper:  { body: { f0: 1500, f1: 190, dur: 0.6, vol: 0.95 },  crack: { f: 850, dur: 0.07, vol: 0.4, type: 'sawtooth' },   boom: { f0: 100, f1: 32, dur: 0.55, vol: 0.7 } },
    uzi:     { body: { f0: 4200, f1: 1100, dur: 0.07, vol: 0.38 },crack: { f: 3000, dur: 0.02, vol: 0.2, type: 'square' } },
    shotgun: { body: { f0: 1300, f1: 230, dur: 0.34, vol: 0.85 }, crack: { f: 700, dur: 0.06, vol: 0.32, type: 'sawtooth' },  boom: { f0: 95, f1: 38, dur: 0.4, vol: 0.62 } },
    pistol:  { body: { f0: 2900, f1: 720, dur: 0.11, vol: 0.48 }, crack: { f: 1950, dur: 0.03, vol: 0.22, type: 'square' },   boom: { f0: 170, f1: 90, dur: 0.07, vol: 0.14 } },
    rocket:  { body: { f0: 800, f1: 160, dur: 0.7, vol: 0.85, ftype: 'bandpass' }, crack: { f: 420, dur: 0.09, vol: 0.3, type: 'sawtooth' }, boom: { f0: 80, f1: 30, dur: 0.5, vol: 0.55 } },
    scarh:   { body: { f0: 2400, f1: 480, dur: 0.17, vol: 0.6 },  crack: { f: 1600, dur: 0.045, vol: 0.26, type: 'square' },  boom: { f0: 125, f1: 58, dur: 0.15, vol: 0.32 }, mech: { f: 700, vol: 0.09 } },
    mk14:    { body: { f0: 2000, f1: 340, dur: 0.24, vol: 0.7 },  crack: { f: 1200, dur: 0.055, vol: 0.3, type: 'sawtooth' }, boom: { f0: 110, f1: 48, dur: 0.22, vol: 0.4 } },
    p90:     { body: { f0: 4600, f1: 1300, dur: 0.06, vol: 0.36 },crack: { f: 3300, dur: 0.018, vol: 0.18, type: 'square' } },
    m249:    { body: { f0: 1900, f1: 380, dur: 0.15, vol: 0.62 }, crack: { f: 1000, dur: 0.05, vol: 0.24, type: 'square' },   boom: { f0: 105, f1: 50, dur: 0.18, vol: 0.42 }, mech: { f: 520, vol: 0.12 } },
    awm:     { body: { f0: 1400, f1: 170, dur: 0.7, vol: 1.0 },   crack: { f: 780, dur: 0.08, vol: 0.42, type: 'sawtooth' },  boom: { f0: 92, f1: 28, dur: 0.62, vol: 0.78 } }
  };
  function shot(weapon, pos, opts) {
    if (!ctx) return;
    if (weapon === 'knife') { noiseBurst(pos, { ftype: 'highpass', f0: 3800, dur: 0.09, vol: 0.28 }); return; }
    if (opts && opts.supp) { // suppressed: soft thup + action click
      noiseBurst(pos, { f0: 1300, f1: 420, dur: 0.09, vol: 0.2, ftype: 'bandpass' });
      setTimeout(function () { tone(pos, { type: 'square', f0: 750, f1: 480, dur: 0.02, vol: 0.08 }); }, 25);
      return;
    }
    var s = SHOT[weapon] || SHOT.pistol;
    var ov = (typeof CFG !== 'undefined' && CFG.WEAPONS[weapon] && CFG.WEAPONS[weapon].snd) || null;
    if (ov) {
      s = {
        body: Object.assign({}, s.body, ov.body || {}),
        crack: Object.assign({}, s.crack, ov.crack || {}),
        boom: ov.boom !== undefined ? ov.boom : s.boom,
        mech: s.mech
      };
    }
    noiseBurst(pos, { f0: s.body.f0, f1: s.body.f1, dur: s.body.dur, vol: s.body.vol, ftype: s.body.ftype });
    tone(pos, { type: s.crack.type, f0: s.crack.f, f1: s.crack.f * 0.35, dur: s.crack.dur, vol: s.crack.vol });
    if (s.boom) tone(pos, { type: 'sine', f0: s.boom.f0, f1: s.boom.f1, dur: s.boom.dur, vol: s.boom.vol });
    if (s.mech) setTimeout(function () { tone(pos, { type: 'square', f0: s.mech.f, f1: s.mech.f * 0.6, dur: 0.02, vol: s.mech.vol }); }, 28);
  }
  function dryFire(weapon) {
    var f = { ak47: 1300, m4a1: 1600, sniper: 950, uzi: 2100, shotgun: 800, pistol: 1800, rocket: 600, knife: 1500 }[weapon] || 1400;
    tone(null, { type: 'square', f0: f, f1: f * 0.55, dur: 0.03, vol: 0.2 });
    setTimeout(function () { tone(null, { type: 'square', f0: f * 0.7, f1: f * 0.4, dur: 0.025, vol: 0.12 }); }, 55);
  }
  // Per-weapon reload sequence: mag-out thunk -> mag-in seat -> action cycle.
  var RELOAD_SEQ = {
    ak47:    [[0, 480, 0.24], [1350, 760, 0.3], [2100, 1150, 0.26], [2280, 850, 0.22]],
    m4a1:    [[0, 560, 0.22], [1150, 880, 0.28], [1850, 1500, 0.24], [1990, 1050, 0.2]],
    sniper:  [[0, 420, 0.26], [1600, 700, 0.3], [2700, 950, 0.26], [3050, 620, 0.28]],
    uzi:     [[0, 640, 0.2], [900, 1000, 0.26], [1500, 1900, 0.2]],
    pistol:  [[0, 700, 0.2], [700, 1100, 0.26], [1200, 2100, 0.22], [1310, 1400, 0.18]],
    rocket:  [[0, 300, 0.3], [1700, 480, 0.3], [3200, 850, 0.26]]
  };
  function reload(weapon, pos) {
    if (!ctx) return;
    var sq = RELOAD_SEQ[weapon] || RELOAD_SEQ.m4a1;
    sq.forEach(function (st) {
      setTimeout(function () { tone(pos, { type: 'square', f0: st[1], f1: st[1] * 0.55, dur: 0.05, vol: st[2] }); }, st[0]);
    });
  }
  function magIn(pos) { tone(pos, { type: 'square', f0: 900, f1: 500, dur: 0.06, vol: 0.26 }); }
  function shellIn(pos) { // pump-shotgun shell: chk-chunk
    tone(pos, { type: 'square', f0: 640, f1: 380, dur: 0.05, vol: 0.26 });
    setTimeout(function () { tone(pos, { type: 'square', f0: 1050, f1: 620, dur: 0.04, vol: 0.2 }); }, 90);
  }
  function bolt(pos) {
    tone(pos, { type: 'square', f0: 1200, f1: 700, dur: 0.05, vol: 0.24 });
    setTimeout(function () { tone(pos, { type: 'square', f0: 700, f1: 1100, dur: 0.05, vol: 0.24 }); }, 220);
  }
  function step(pos, quiet, sprint, surf) {
    var v = quiet ? 0.05 : (sprint ? 0.22 : 0.13);
    if (surf === 1) { // metal: bright clank + short ring
      noiseBurst(pos, { f0: 950 + Math.random() * 400, f1: 320, dur: 0.06, vol: v });
      tone(pos, { type: 'triangle', f0: 1500 + Math.random() * 500, f1: 720, dur: 0.05, vol: v * 0.5 });
    } else if (surf === 2) { // wood: lower hollow thud
      noiseBurst(pos, { f0: 330 + Math.random() * 150, f1: 110, dur: 0.085, vol: v * 1.15 });
    } else { // concrete / asphalt
      noiseBurst(pos, { f0: 500 + Math.random() * 300, f1: 160, dur: 0.07, vol: v });
    }
  }
  function setIndoors(b) {
    if (!ctx || !echoSend) return;
    echoSend.gain.setTargetAtTime(b ? 0.3 : 0, ctx.currentTime, 0.15);
  }
  function explosion(pos, big) {
    if (!ctx) return;
    noiseBurst(pos, { f0: 2200, f1: 90, dur: big ? 1.2 : 0.8, vol: 1.0 });
    tone(pos, { type: 'sine', f0: 90, f1: 26, dur: big ? 1.0 : 0.7, vol: 0.9 });
    tone(pos, { type: 'triangle', f0: 160, f1: 40, dur: 0.4, vol: 0.5 });
  }
  function impact(pos) {
    noiseBurst(pos, { ftype: 'highpass', f0: 2500, dur: 0.05, vol: 0.14 });
    if (Math.random() < 0.18) { // occasional ricochet whine
      setTimeout(function () { tone(pos, { type: 'sine', f0: 2400 + Math.random() * 800, f1: 550, dur: 0.28, vol: 0.1 }); }, 25);
    }
  }
  function flesh(pos) { noiseBurst(pos, { f0: 700, f1: 250, dur: 0.09, vol: 0.3 }); }
  function hitmark(kill) {
    tone(null, { type: 'square', f0: kill ? 1250 : 1650, f1: kill ? 700 : 1400, dur: 0.06, vol: 0.16 });
    if (kill) setTimeout(function () { tone(null, { type: 'square', f0: 900, f1: 500, dur: 0.09, vol: 0.18 }); }, 70);
  }
  function whoosh(pos) { noiseBurst(pos, { ftype: 'bandpass', f0: 900, f1: 1900, dur: 0.25, vol: 0.2 }); }
  function bounce(pos) { tone(pos, { type: 'square', f0: 1900, f1: 900, dur: 0.03, vol: 0.15 }); }
  function pinPull(pos) { tone(pos, { type: 'square', f0: 2600, f1: 2000, dur: 0.03, vol: 0.15 }); }
  function pickupSnd(kind, pos) {
    if (kind === 'health') {
      tone(pos, { type: 'sine', f0: 760, f1: 1150, dur: 0.12, vol: 0.24 });
      setTimeout(function () { tone(pos, { type: 'sine', f0: 1150, f1: 1550, dur: 0.14, vol: 0.22 }); }, 110);
    } else {
      tone(pos, { type: 'square', f0: 520, f1: 320, dur: 0.07, vol: 0.26 });
      setTimeout(function () { noiseBurst(pos, { ftype: 'bandpass', f0: 1500, dur: 0.09, vol: 0.14 }); }, 90);
      setTimeout(function () { tone(pos, { type: 'square', f0: 980, f1: 640, dur: 0.05, vol: 0.2 }); }, 170);
    }
  }
  function planeFlyby() { // distant cargo plane pass for the airdrop
    if (!ctx) return;
    noiseBurst(null, { ftype: 'bandpass', f0: 220, f1: 90, dur: 2.6, vol: 0.22 });
    tone(null, { type: 'sawtooth', f0: 95, f1: 62, dur: 2.4, vol: 0.1 });
  }
  function crateThud(pos) {
    tone(pos, { type: 'sine', f0: 110, f1: 34, dur: 0.4, vol: 0.6 });
    noiseBurst(pos, { f0: 900, f1: 150, dur: 0.3, vol: 0.4 });
  }
  function fireCrackle(pos, sec) {
    if (!ctx) return;
    var n = Math.floor(sec * 5);
    for (var i = 0; i < n; i++) {
      setTimeout(function () {
        noiseBurst(pos, { ftype: 'bandpass', f0: 900 + Math.random() * 1600, f1: 300, dur: 0.1 + Math.random() * 0.12, vol: 0.12 + Math.random() * 0.08 });
      }, i * 200 + Math.random() * 140);
    }
  }
  function stinger(big) { // kill-streak / multikill announcement
    tone(null, { type: 'square', f0: 620, f1: 620, dur: 0.07, vol: 0.16 });
    setTimeout(function () { tone(null, { type: 'square', f0: big ? 930 : 830, f1: big ? 930 : 830, dur: 0.11, vol: 0.18 }); }, 90);
  }
  function flashRing(intensity) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 3400;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.28 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 * intensity + 0.05);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 2.5);
  }
  function uiClick() { tone(null, { type: 'square', f0: 1500, f1: 1000, dur: 0.03, vol: 0.1 }); }
  function death() {
    tone(null, { type: 'sawtooth', f0: 300, f1: 60, dur: 0.9, vol: 0.3 });
    noiseBurst(null, { f0: 800, f1: 120, dur: 0.7, vol: 0.25 });
  }

  var ambientNodes = null;
  function ambient() {
    if (!ctx || ambientNodes) return;
    try {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      var g = ctx.createGain(); g.gain.value = 0.045;
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      var lg = ctx.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(); lfo.start();
      ambientNodes = { src: src, lfo: lfo };
      // distant-traffic rumble bed
      var tr = ctx.createBufferSource(); tr.buffer = noiseBuf; tr.loop = true;
      var tf = ctx.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 110;
      var tg = ctx.createGain(); tg.gain.value = 0.03;
      tr.connect(tf); tf.connect(tg); tg.connect(master); tr.start();
      ambientNodes.tr = tr;
      // rare far-off two-tone siren
      setInterval(function () {
        if (Math.random() > 0.45) return;
        for (var k2 = 0; k2 < 6; k2++) (function (k3) {
          setTimeout(function () {
            tone(null, { type: 'sine', f0: k3 % 2 ? 980 : 660, f1: k3 % 2 ? 700 : 900, dur: 0.9, vol: 0.028 });
          }, k3 * 850);
        })(k2);
      }, 52000);
      // occasional distant industrial clank
      setInterval(function () {
        if (Math.random() < 0.5) tone(null, { type: 'triangle', f0: 200 + Math.random() * 160, f1: 60, dur: 1.4, vol: 0.03 });
      }, 16000);
    } catch (e) {}
  }

  return {
    init: init, resume: resume, setVolume: setVolume, updateListener: updateListener, ambient: ambient,
    shot: shot, reload: reload, magIn: magIn, bolt: bolt, step: step,
    dryFire: dryFire, shellIn: shellIn, pickupSnd: pickupSnd,
    planeFlyby: planeFlyby, crateThud: crateThud, stinger: stinger, fireCrackle: fireCrackle,
    setIndoors: setIndoors,
    explosion: explosion, impact: impact, flesh: flesh, hitmark: hitmark,
    whoosh: whoosh, bounce: bounce, pinPull: pinPull, flashRing: flashRing,
    uiClick: uiClick, death: death
  };
})();
