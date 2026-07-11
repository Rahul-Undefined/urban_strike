/* AudioSys — every sound is synthesized with the Web Audio API, so the game
   ships with zero audio files. Remote sounds are positional (HRTF panner). */
var AudioSys = (function () {
  var ctx = null, master = null, noiseBuf = null, started = false;
  var volume = 0.7;

  function init() {
    if (ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
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
  var SHOT = {
    ak47:    { f0: 2400, f1: 500, dur: 0.16, vol: 0.65, crack: 1600 },
    m4a1:    { f0: 3000, f1: 650, dur: 0.13, vol: 0.55, crack: 2100 },
    sniper:  { f0: 1600, f1: 220, dur: 0.5,  vol: 0.95, crack: 900, boom: true },
    uzi:     { f0: 3600, f1: 900, dur: 0.09, vol: 0.42, crack: 2600 },
    shotgun: { f0: 1400, f1: 260, dur: 0.32, vol: 0.85, crack: 800, boom: true },
    pistol:  { f0: 2800, f1: 700, dur: 0.12, vol: 0.5,  crack: 1900 },
    rocket:  { f0: 900,  f1: 200, dur: 0.5,  vol: 0.8,  crack: 500 },
    knife:   null
  };
  function shot(weapon, pos) {
    if (!ctx) return;
    if (weapon === 'knife') { noiseBurst(pos, { ftype: 'highpass', f0: 3800, dur: 0.09, vol: 0.28 }); return; }
    var s = SHOT[weapon] || SHOT.pistol;
    noiseBurst(pos, { f0: s.f0, f1: s.f1, dur: s.dur, vol: s.vol });
    tone(pos, { type: 'square', f0: s.crack, f1: s.crack * 0.3, dur: 0.045, vol: s.vol * 0.35 });
    if (s.boom) tone(pos, { type: 'sine', f0: 110, f1: 42, dur: 0.35, vol: 0.5 });
  }
  function reload(pos) {
    if (!ctx) return;
    tone(pos, { type: 'square', f0: 2100, f1: 1400, dur: 0.035, vol: 0.18 });
    setTimeout(function () { tone(pos, { type: 'square', f0: 1500, f1: 900, dur: 0.05, vol: 0.22 }); }, 130);
  }
  function magIn(pos) { tone(pos, { type: 'square', f0: 900, f1: 500, dur: 0.06, vol: 0.26 }); }
  function bolt(pos) {
    tone(pos, { type: 'square', f0: 1200, f1: 700, dur: 0.05, vol: 0.24 });
    setTimeout(function () { tone(pos, { type: 'square', f0: 700, f1: 1100, dur: 0.05, vol: 0.24 }); }, 220);
  }
  function step(pos, quiet, sprint) {
    var v = quiet ? 0.05 : (sprint ? 0.22 : 0.13);
    noiseBurst(pos, { f0: 500 + Math.random() * 300, f1: 160, dur: 0.07, vol: v });
  }
  function explosion(pos, big) {
    if (!ctx) return;
    noiseBurst(pos, { f0: 2200, f1: 90, dur: big ? 1.2 : 0.8, vol: 1.0 });
    tone(pos, { type: 'sine', f0: 90, f1: 26, dur: big ? 1.0 : 0.7, vol: 0.9 });
    tone(pos, { type: 'triangle', f0: 160, f1: 40, dur: 0.4, vol: 0.5 });
  }
  function impact(pos) { noiseBurst(pos, { ftype: 'highpass', f0: 2500, dur: 0.05, vol: 0.14 }); }
  function flesh(pos) { noiseBurst(pos, { f0: 700, f1: 250, dur: 0.09, vol: 0.3 }); }
  function hitmark(kill) {
    tone(null, { type: 'square', f0: kill ? 1250 : 1650, f1: kill ? 700 : 1400, dur: 0.06, vol: 0.16 });
    if (kill) setTimeout(function () { tone(null, { type: 'square', f0: 900, f1: 500, dur: 0.09, vol: 0.18 }); }, 70);
  }
  function whoosh(pos) { noiseBurst(pos, { ftype: 'bandpass', f0: 900, f1: 1900, dur: 0.25, vol: 0.2 }); }
  function bounce(pos) { tone(pos, { type: 'square', f0: 1900, f1: 900, dur: 0.03, vol: 0.15 }); }
  function pinPull(pos) { tone(pos, { type: 'square', f0: 2600, f1: 2000, dur: 0.03, vol: 0.15 }); }
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
      // occasional distant industrial clank
      setInterval(function () {
        if (Math.random() < 0.5) tone(null, { type: 'triangle', f0: 200 + Math.random() * 160, f1: 60, dur: 1.4, vol: 0.03 });
      }, 16000);
    } catch (e) {}
  }

  return {
    init: init, resume: resume, setVolume: setVolume, updateListener: updateListener, ambient: ambient,
    shot: shot, reload: reload, magIn: magIn, bolt: bolt, step: step,
    explosion: explosion, impact: impact, flesh: flesh, hitmark: hitmark,
    whoosh: whoosh, bounce: bounce, pinPull: pinPull, flashRing: flashRing,
    uiClick: uiClick, death: death
  };
})();
