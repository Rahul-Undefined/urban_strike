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
    /* v13.0 (item 6): the browser forbids sound before a gesture, so the
       welcome cue is armed by music('menu') and FIRES here, on the first
       input — the earliest instant the platform allows. */
    if (ctx && pendingMusic) { var pm = pendingMusic; pendingMusic = null; music(pm); }
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
  /* ===== v10.8 - AUDIBLE RANGE, AND A CHEAPER PANNER =====

     Every positional sound built a PannerNode with panningModel 'HRTF', and
     nothing anywhere checked how far away the source was. `maxDistance: 260`
     only shapes the GAIN - the node is still created, connected and convolved
     for a footstep 150 m away that you cannot hear at all.

     HRTF is the most expensive panning model the Web Audio API has. It
     convolves against head-related transfer functions to place a sound in 3D.
     For one gunshot that is a luxury worth paying for. For nineteen bots
     walking it is not: a bot takes a step every ~0.52 s at walk speed, so
     nineteen of them generate ROUGHLY THIRTY-SIX FOOTSTEPS A SECOND, each
     building a BufferSource, a BiquadFilter, a Gain and an HRTF panner, and
     every one of those panners is convolved every audio quantum until it
     finishes.

     That cost scales linearly with bot count and it is why bot mode stutters
     while human matches do not - it is not the network, it is the audio graph
     starving the main thread. Rahul's instinct that "bahot bots h isliye ho
     raha h" was right about the correlation and wrong about the cause: the
     problem is not that there are nineteen bots, it is that a bot 150 m away
     costs exactly as much to hear as one standing next to you.

     TWO CHANGES, both here, neither touching gameplay:

       AUDIBLE  - past 70 m a positional sound is DROPPED ENTIRELY. Not faded,
                  not quieted: no panner, no connection, nothing. At 260 m the
                  inverse rolloff already had it at a few percent of volume, so
                  nothing audible is lost. On a 200 m map this removes roughly
                  two thirds of them.

       equalpower instead of HRTF - a constant-power stereo pan, a few
                  multiplies against a convolution. Direction is still there,
                  the sound still moves left and right and falls off with
                  distance; what is lost is the front/back and elevation cue,
                  which almost nobody is resolving over laptop speakers while
                  being shot at. If it is ever wanted back, it belongs on a
                  small allowlist of important one-off sounds - explosions, the
                  airdrop plane - and never on footsteps. */
  var AUDIBLE = 70, AUD2 = 70 * 70;
  var lisX = 0, lisY = 0, lisZ = 0;
  function tooFar(pos) {
    var dx = pos.x - lisX, dy = pos.y - lisY, dz = pos.z - lisZ;
    return (dx * dx + dy * dy + dz * dz) > AUD2;
  }

  function out(node, pos) {
    if (!pos) { node.connect(master); return; }
    /* Dropped rather than connected. The source nodes the caller already built
       are never reached by the graph and are collected; the panner - the
       expensive part - is never created at all. */
    if (tooFar(pos)) return;
    try {
      var pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = 7; pan.maxDistance = 260; pan.rolloffFactor = 1.15;
      if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
      else pan.setPosition(pos.x, pos.y, pos.z);
      node.connect(pan); pan.connect(master);
    } catch (e) { node.connect(master); }
  }

  function updateListener(pos, fwd, up) {
    if (!ctx) return;
    /* Kept in plain numbers for tooFar(), which runs on every positional sound
       and must not allocate or read through a THREE.Vector3 wrapper. */
    lisX = pos.x; lisY = pos.y; lisZ = pos.z;
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
    if (!ctx) return;
    /* Checked HERE as well as in out(), because this is the one sound that
       fires dozens of times a second in bot mode and the cheapest node is the
       one never constructed. A footstep is also the least worth hearing at
       range - it is inaudible past about 25 m in practice, so 70 m is already
       generous. */
    if (pos && tooFar(pos)) return;
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


  /* ==========================================================================
     v13.0 (brief item 6) - MUSIC, AS DISTINCT FROM THE CITY
     The ambient() bed above is DIEGETIC — traffic, sirens, clanks: the map's
     own noise. What the brief asks for is score: a cinematic military cue
     when the welcome screen begins, and a slow tonal bed under gameplay.

     Constraints that shaped this:
     - NO AUDIO ASSETS ship in this repo, so everything is synthesized on the
       shared context — oscillators, filtered noise, gain envelopes.
     - THE SCORE MUST NEVER FIGHT THE GAME. Gunshots, footsteps and comms are
       the information channel; music is atmosphere. Both beds are capped by
       MUSIC_VOL and the cue peaks at CUE_VOL — never above 0.12, against
       weapon transients that run 0.3+. If you cannot hear the music over a
       firefight, it is working.
     - GESTURE-GATED: music() before the first input parks its request in
       pendingMusic; resume() plays it the moment the platform allows.
     ====================================================================== */
  var MUSIC_VOL = 0.09;   // gameplay/menu bed ceiling — never above 0.12
  var CUE_VOL = 0.11;     // welcome-cue peak — never above 0.12
  var musicState = null, musicG = null, musicNodes = [], musicTimers = [];
  var pendingMusic = null, menuCuePlayed = false;

  function mStop() {
    if (musicG) {
      try {
        musicG.gain.cancelScheduledValues(ctx.currentTime);
        musicG.gain.setValueAtTime(musicG.gain.value, ctx.currentTime);
        musicG.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      } catch (e) {}
    }
    var oldNodes = musicNodes, oldG = musicG;
    musicTimers.forEach(function (t) { clearInterval(t); });
    musicTimers = []; musicNodes = []; musicG = null;
    setTimeout(function () {
      oldNodes.forEach(function (n) { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
      if (oldG) { try { oldG.disconnect(); } catch (e) {} }
    }, 900);
  }

  function mOsc(type, freq, dest) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    o.connect(dest); o.start(); musicNodes.push(o); return o;
  }

  /* The welcome cue: a sub swell, a low fifth blooming through a closed
     filter, a two-tap military snare from filtered noise, and a horn-like
     call — about seven seconds, once per page load. */
  function menuCue(dest) {
    var t0 = ctx.currentTime;
    var sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(38, t0);
    var sg = ctx.createGain(); sg.gain.setValueAtTime(0, t0);
    sg.gain.linearRampToValueAtTime(CUE_VOL * 0.9, t0 + 1.8);
    sg.gain.linearRampToValueAtTime(0, t0 + 6.0);
    sub.connect(sg); sg.connect(dest); sub.start(t0); sub.stop(t0 + 6.2); musicNodes.push(sub);

    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(160, t0);
    lp.frequency.linearRampToValueAtTime(520, t0 + 3.2); lp.connect(dest);
    [73.4, 73.9, 110].forEach(function (f) {          // D2 pair (detuned) + A2: an open fifth
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      var g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(CUE_VOL * 0.42, t0 + 2.5);
      g.gain.linearRampToValueAtTime(0, t0 + 7.0);
      o.connect(g); g.connect(lp); o.start(t0); o.stop(t0 + 7.1); musicNodes.push(o);
    });

    [0.9, 1.05].forEach(function (dtT) {              // the two-tap snare
      var n = ctx.createBufferSource(); n.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
      var g = ctx.createGain(); g.gain.setValueAtTime(0, t0 + dtT);
      g.gain.linearRampToValueAtTime(CUE_VOL * 0.5, t0 + dtT + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dtT + 0.22);
      n.connect(bp); bp.connect(g); g.connect(dest);
      n.start(t0 + dtT); n.stop(t0 + dtT + 0.3); musicNodes.push(n);
    });

    var hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 900; hlp.connect(dest);
    [146.8, 147.6].forEach(function (f) {             // the horn call, D3 detuned pair
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      var g = ctx.createGain(); g.gain.setValueAtTime(0, t0 + 1.2);
      g.gain.linearRampToValueAtTime(CUE_VOL * 0.55, t0 + 1.6);
      g.gain.linearRampToValueAtTime(0, t0 + 4.2);
      o.connect(g); g.connect(hlp); o.start(t0 + 1.2); o.stop(t0 + 4.3); musicNodes.push(o);
    });
  }

  /* The gameplay bed: a dark drone on A1/E2, a C3 colour tone breathing on a
     22 s cycle, a heartbeat pulse every ~9 s, and the thinnest ribbon of high
     air. Sparse on purpose — it has to sit UNDER footsteps. */
  function gameBed(dest) {
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(dest);
    var lfo = mOsc('sine', 0.05, ctx.createGain());   // placeholder connect; rewired below
    try { lfo.disconnect(); } catch (e) {}
    var lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency);

    var dg = ctx.createGain(); dg.gain.value = 0.55; dg.connect(lp);
    mOsc('triangle', 55, dg);                          // A1
    mOsc('sine', 82.4, dg);                            // E2

    var cg = ctx.createGain(); cg.gain.value = 0; cg.connect(lp);
    mOsc('sine', 130.8, cg);                           // C3 — the minor colour
    var clfo = mOsc('sine', 1 / 22, ctx.createGain());
    try { clfo.disconnect(); } catch (e) {}
    var clg = ctx.createGain(); clg.gain.value = 0.22; clfo.connect(clg); clg.connect(cg.gain);

    var air = ctx.createBufferSource(); air.buffer = noiseBuf; air.loop = true;
    var abp = ctx.createBiquadFilter(); abp.type = 'bandpass'; abp.frequency.value = 2600; abp.Q.value = 6;
    var ag = ctx.createGain(); ag.gain.value = 0.09;
    air.connect(abp); abp.connect(ag); ag.connect(dest); air.start(); musicNodes.push(air);

    musicTimers.push(setInterval(function () {         // the heartbeat
      if (!ctx || musicState !== 'game') return;
      var t0 = ctx.currentTime;
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(58, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 1.1);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 1.3);
    }, 8800));
  }

  /* Menu bed after the cue: the same fifth, barely there, breathing. */
  function menuBed(dest) {
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.connect(dest);
    var blfo = mOsc('sine', 0.06, ctx.createGain());
    try { blfo.disconnect(); } catch (e) {}
    var blg = ctx.createGain(); blg.gain.value = 120; blfo.connect(blg); blg.connect(lp.frequency);
    var bg = ctx.createGain(); bg.gain.value = 0.4; bg.connect(lp);
    mOsc('sawtooth', 73.4, bg); mOsc('sawtooth', 110, bg);
  }

  /* music('menu' | 'game' | null) — idempotent, fade-out on change. */
  function music(state) {
    if (!ctx) { pendingMusic = state; return; }
    if (state === musicState) return;
    mStop();
    musicState = state;
    if (!state) return;
    musicG = ctx.createGain();
    musicG.gain.setValueAtTime(0, ctx.currentTime);
    musicG.gain.linearRampToValueAtTime(MUSIC_VOL, ctx.currentTime + 1.2);
    musicG.connect(master);
    if (state === 'menu') {
      if (!menuCuePlayed) { menuCuePlayed = true; menuCue(musicG); }
      menuBed(musicG);
    } else if (state === 'game') {
      gameBed(musicG);
    }
  }

  return {
    music: music,
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
