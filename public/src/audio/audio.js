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
      /* v2.16, TRIED AND TAKEN OUT: a DynamicsCompressor as a limiter here.
         Measured in Chromium (offline render): with a 2 ms attack it took the
         first 20 ms of an AK from a peak of 0.56 to 0.12 — it ate the crack,
         which is the part that makes a gunshot a gunshot. Peaks stay as they
         are; the loudest single shot (.338) renders at 0.83 of full scale. */
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
  /* ===== v2.15 - THE MENU WAS SILENT =====
     The context is created at load, where no browser lets it run, and the only
     resume() was in requestLock() — the click that takes the pointer for a
     MATCH. So v13.0's welcome cue and menu bed were scheduled into a context
     that stayed suspended for the whole menu and lobby: measured in Chromium,
     ctx.state was 'suspended' until the match began. wake() is resume()
     without the city (ambient belongs to a map) and it runs on the first
     click or key anywhere — and on every one after, which costs a comparison
     and lets a browser that refused the soundtrack's play() accept it. */
  function wake() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    /* v13.0 (item 6): the browser forbids sound before a gesture, so the
       welcome cue is armed by music('menu') and FIRES here, on the first
       input — the earliest instant the platform allows. */
    if (ctx && pendingMusic) { var pm = pendingMusic; pendingMusic = null; music(pm); }
    if (window.Soundtrack) Soundtrack.poke();
  }
  function resume() {
    wake();
    if (ctx && !started) { started = true; ambient(); }
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('keydown', wake, true);
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

  /* ===== v2.0 - EVERY CHAIN IS TORN DOWN WHEN ITS SOURCE ENDS =====
     A shot builds three or four chains (body, crack, boom, mech), each with a
     BiquadFilter, a Gain and — positional — a PannerNode, and every chain
     was left CONNECTED to master after its source stopped. Whether the
     browser eventually collects a silent connected node is implementation
     detail; what is not is that a six-player fight made 200+ new nodes a
     second and the graph the audio thread walks kept growing until GC caught
     up, in bursts, on the main thread — a frame hitch every few seconds that
     got worse the longer the match ran. `out()` now returns the tail node and
     `finish(src, tail)` disconnects the whole chain in `onended`. VOICES caps
     how many positional chains are alive at once: past it the quietest new
     sound (a distant footstep, a far shell) is simply not built. */
  var live = 0, VOICES = 48;
  function out(node, pos) {
    if (!pos) { node.connect(master); return node; }
    if (tooFar(pos)) return null;
    if (live >= VOICES) return null;
    try {
      var pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = 7; pan.maxDistance = 260; pan.rolloffFactor = 1.15;
      if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
      else pan.setPosition(pos.x, pos.y, pos.z);
      node.connect(pan); pan.connect(master);
      live++;
      return pan;
    } catch (e) { node.connect(master); return node; }
  }
  /* tear a chain down once its source has stopped; `nodes` is every node
     between the source and the tail, in order */
  function finish(src, nodes, tail, positional) {
    src.onended = function () {
      try { src.disconnect(); } catch (e) {}
      for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e2) {} }
      if (tail) { try { tail.disconnect(); } catch (e3) {} }
      if (positional) live = Math.max(0, live - 1);
      src.onended = null;
    };
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
    var t = ctx.currentTime + (opts.at || 0);      // v2.16: `at` seconds from now, on the audio clock (no setTimeout jitter)
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = opts.rate || 1;
    var f = ctx.createBiquadFilter(); f.type = opts.ftype || 'lowpass';
    if (opts.q) f.Q.value = opts.q;
    f.frequency.setValueAtTime(opts.f0 || 3000, t);
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + (opts.dur || 0.2));
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.5, t);
    /* v2.16: `hold` keeps the burst up for longer before it dies (0 = the old
       straight fall to silence, which leaves 34% after 20 ms of a 170 ms
       burst — a tick, not a blast) */
    if (opts.hold) { g.gain.exponentialRampToValueAtTime((opts.vol || 0.5) * opts.hold, t + (opts.dur || 0.2) * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + (opts.dur || 0.2)); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.2));
    src.connect(f); f.connect(g);
    var tail = out(g, pos);
    if (tail === null) { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} return; }   // too far or too many: never started
    finish(src, [f, g], tail !== g ? tail : null, !!pos);
    src.start(t, Math.random() * 1.4); src.stop(t + (opts.dur || 0.2) + 0.05);   // v2.16: a different slice of the noise each time — two shots are never the same sample
  }
  function tone(pos, opts) {
    if (!ctx) return;
    var t = ctx.currentTime + (opts.at || 0);
    var o = ctx.createOscillator(); o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f0 || 440, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t + (opts.dur || 0.2));
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.2));
    o.connect(g);
    var tail = out(g, pos);
    if (tail === null) { try { o.disconnect(); g.disconnect(); } catch (e) {} return; }
    finish(o, [g], tail !== g ? tail : null, !!pos);
    o.start(t); o.stop(t + (opts.dur || 0.2) + 0.05);
  }

  // ---- game sounds ----
  /* ===== v2.16 - EVERY GUN HAS ITS OWN VOICE =====
     Rahul: "harr gun ka sound signature better karo taki gun ka sound unique
     and awesome lage."
     WHAT WAS THERE: twelve patches for twenty-nine weapons. The Kar98, AUG,
     FAMAS, AKM, K98, Garand, UMP, MP5, Vector, bow, flamethrower and Seeker
     had none and all played the PISTOL. And a patch was a noise burst, a
     square-wave blip for the "crack" (which is why they sounded like an
     arcade cabinet) and a sine.
     WHAT A SHOT IS NOW, in the order the ear gets it:
       crack  10-25 ms of high-passed noise: the supersonic snap. Bright for a
              5.56, dull for a .45, enormous for a .338.
       body   the muzzle blast: filtered noise swept downward. Its pitch and
              length are the calibre and the barrel.
       boom   a falling sine: what you feel in the chest. A 9 mm barely has
              one; a shotgun is mostly this.
       tail   the report rolling away: a long, low, quiet decay. It is the
              difference between a toy and a rifle, and between rifles.
       mech   the action: a resonant click of the bolt carrier a few
              hundredths later — an AK clanks low, an M4 rings, an MP5 ticks.
     Plus what makes one weapon THAT weapon (`x`): the M1 Garand's clip pings
     out on its last round, the M4's buffer spring twangs, the M249's belt
     rattles, the bow is a string, not a gun.
     No two shots are identical: each is detuned a few percent and reads a
     different slice of the noise, so automatic fire is not a loop.
     STILL NO FILES, AND NO MORE WORK FOR THE BROWSER: the tail is the one long
     layer, so it is rationed (TAILGAP) — rapid fire shares tails the way real
     reports overlap — and a shot heard from far away drops its click and most
     of its crack, which do not carry. A shot is 8-14 nodes (the Garand's
     last round, with its ping, is 18), as before.
     c crack [Hz, vol]   b body [f0, f1, s, vol]   m boom [f0, f1, s, vol]
     t tail [s, vol, Hz]   k mech [Hz, vol, Q]   x signature */
  var SHOT = {
    ak47:    { c: [2600, 0.50], b: [1900, 360, 0.17, 0.62],  m: [135, 52, 0.17, 0.38],  t: [0.55, 0.16, 900],  k: [1500, 0.13, 7] },
    akm:     { c: [2300, 0.52], b: [1650, 310, 0.20, 0.66],  m: [124, 47, 0.21, 0.43],  t: [0.62, 0.18, 800],  k: [1250, 0.14, 6] },
    m4a1:    { c: [3900, 0.52], b: [3000, 700, 0.11, 0.50],  m: [165, 80, 0.09, 0.20],  t: [0.40, 0.13, 1400], k: [2400, 0.08, 9], x: 'spring' },
    aug:     { c: [3500, 0.48], b: [2500, 820, 0.10, 0.50, 'bandpass'], m: [152, 72, 0.10, 0.23], t: [0.36, 0.12, 1250], k: [2100, 0.07, 8] },
    famas:   { c: [4300, 0.50], b: [3400, 900, 0.085, 0.46], m: [176, 88, 0.07, 0.17],  t: [0.30, 0.11, 1600], k: [2800, 0.07, 10] },
    scarh:   { c: [3100, 0.56], b: [1750, 330, 0.20, 0.68],  m: [112, 44, 0.22, 0.48],  t: [0.78, 0.19, 780],  k: [2300, 0.09, 9] },
    mk14:    { c: [2500, 0.60], b: [1900, 320, 0.24, 0.70],  m: [110, 44, 0.24, 0.44],  t: [0.85, 0.20, 750],  k: [1700, 0.08, 7] },
    garand:  { c: [2200, 0.58], b: [1600, 300, 0.26, 0.74],  m: [105, 42, 0.26, 0.46],  t: [0.90, 0.20, 700],  k: [1300, 0.09, 5], x: 'ping' },
    m249:    { c: [2500, 0.48], b: [1800, 360, 0.13, 0.62],  m: [120, 52, 0.15, 0.40],  t: [0.50, 0.15, 850],  k: [1100, 0.15, 5], x: 'belt' },
    sniper:  { c: [2000, 0.70], b: [1400, 180, 0.50, 0.95],  m: [95, 30, 0.50, 0.72],   t: [1.40, 0.30, 600] },
    awm:     { c: [1800, 0.75], b: [1200, 150, 0.60, 1.00],  m: [85, 26, 0.60, 0.80],   t: [1.70, 0.34, 500] },
    kar98:   { c: [2300, 0.66], b: [1700, 260, 0.38, 0.85],  m: [105, 36, 0.36, 0.58],  t: [1.10, 0.26, 700] },
    k98w:    { c: [2600, 0.60], b: [1900, 300, 0.30, 0.78],  m: [112, 40, 0.30, 0.50],  t: [0.95, 0.22, 760] },
    uzi:     { c: [3200, 0.40], b: [2300, 820, 0.060, 0.46], m: [190, 100, 0.05, 0.12], t: [0.22, 0.09, 1600], k: [1700, 0.13, 6] },
    mp5:     { c: [3600, 0.38], b: [2900, 1000, 0.055, 0.42], m: [200, 110, 0.045, 0.10], t: [0.20, 0.08, 1800], k: [2600, 0.06, 11] },
    ump9:    { c: [2800, 0.40], b: [1800, 600, 0.075, 0.50], m: [170, 85, 0.07, 0.20],  t: [0.26, 0.10, 1300], k: [1500, 0.09, 6] },
    vector:  { c: [3000, 0.38], b: [2000, 700, 0.050, 0.44], m: [160, 90, 0.045, 0.18], t: [0.18, 0.08, 1500], k: [3000, 0.05, 12] },
    p90:     { c: [4600, 0.40], b: [4200, 1300, 0.050, 0.38], m: [220, 130, 0.035, 0.07], t: [0.20, 0.07, 2200], k: [3200, 0.05, 12] },
    pistol:  { c: [3400, 0.45], b: [2700, 700, 0.10, 0.50],  m: [175, 90, 0.07, 0.16],  t: [0.30, 0.10, 1500], k: [2900, 0.09, 9] },
    shotgun: { c: [1500, 0.50], b: [900, 150, 0.30, 0.95],   m: [100, 38, 0.36, 0.66],  t: [0.90, 0.26, 550] },
    aa12:    { c: [1600, 0.46], b: [850, 170, 0.15, 0.86],   m: [120, 48, 0.16, 0.55],  t: [0.50, 0.18, 600],  k: [900, 0.12, 4] },
    rocket:  { c: [900, 0.30],  b: [800, 160, 0.70, 0.85, 'bandpass'], m: [80, 30, 0.50, 0.55], t: [1.20, 0.24, 420] },
    seeker:  { c: [1400, 0.26], b: [1100, 240, 0.60, 0.75, 'bandpass'], m: [90, 34, 0.42, 0.45], t: [1.00, 0.20, 520], x: 'lock' },
    flamer:  { b: [700, 220, 0.22, 0.60], t: [0.30, 0.12, 380] },
    bow:     { x: 'bow' }
  };
  var TAILGAP = 0.085, tailAt = 0;                 // s: at most one new tail this often, however fast the gun
  function shot(weapon, pos, opts) {
    if (!ctx) return;
    if (weapon === 'knife') { noiseBurst(pos, { ftype: 'highpass', f0: 3800, dur: 0.09, vol: 0.28 }); return; }
    var s = SHOT[weapon] || SHOT.pistol;
    var gain = (opts && opts.vol) || 1, d = 0.95 + Math.random() * 0.10, lvl = (0.94 + Math.random() * 0.12) * gain;
    if (opts && opts.supp) {                       // suppressed: the gun's own pitch, with the blast taken off it
      var bs = s.b || SHOT.pistol.b;
      noiseBurst(pos, { f0: Math.min(1700, bs[0] * 0.55) * d, f1: 380, dur: 0.085, vol: 0.2 * lvl, ftype: 'bandpass' });
      if (s.k) noiseBurst(pos, { ftype: 'bandpass', f0: s.k[0] * d, q: s.k[2], dur: 0.03, vol: s.k[1] * 1.6 * lvl, at: 0.024 });
      return;
    }
    /* how far away it is, 0 (here) to 1 (at the edge of hearing): the snap and the click do not carry */
    var far = 0;
    if (pos) { var dx = pos.x - lisX, dy = pos.y - lisY, dz = pos.z - lisZ; far = Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / AUDIBLE); }
    if (s.x === 'bow') {                           // a string and an arrow, no powder
      tone(pos, { type: 'triangle', f0: 230 * d, f1: 120, dur: 0.26, vol: 0.34 * lvl });
      noiseBurst(pos, { ftype: 'highpass', f0: 2600, dur: 0.10, vol: 0.16 * lvl });
      return;
    }
    if (s.c && far < 0.75) noiseBurst(pos, { ftype: 'highpass', f0: s.c[0] * d, dur: 0.016, vol: s.c[1] * lvl * (1 - far) });
    if (s.b) noiseBurst(pos, { ftype: s.b[4] || 'lowpass', f0: s.b[0] * d * (1 - 0.45 * far), f1: s.b[1] * d, dur: s.b[2], vol: s.b[3] * lvl, hold: 0.06 });
    if (s.m) tone(pos, { type: 'sine', f0: s.m[0] * d, f1: s.m[1], dur: s.m[2], vol: s.m[3] * lvl });
    if (s.t && ctx.currentTime - tailAt >= TAILGAP) {
      tailAt = ctx.currentTime;
      noiseBurst(pos, { f0: s.t[2] * d, f1: s.t[2] * 0.3, dur: s.t[0], vol: s.t[1] * lvl * (1 + 0.6 * far), at: 0.012, hold: 0.05 });
    }
    if (far > 0.22) return;                        // the rest is what the shooter and the people beside them hear
    if (s.k) noiseBurst(pos, { ftype: 'bandpass', f0: s.k[0] * d, q: s.k[2], dur: 0.035, vol: s.k[1] * 2.2 * lvl, at: 0.026 });
    if (s.x === 'spring') tone(pos, { type: 'sine', f0: 860 * d, f1: 700, dur: 0.07, vol: 0.05 * lvl, at: 0.03 });                      // the AR buffer spring
    else if (s.x === 'belt') noiseBurst(pos, { ftype: 'bandpass', f0: 3800 * d, q: 5, dur: 0.03, vol: 0.10 * lvl, at: 0.05 });        // a link dropping off the belt
    else if (s.x === 'lock') tone(pos, { type: 'square', f0: 1800, f1: 2600, dur: 0.06, vol: 0.05 * lvl });                             // the seeker head
    else if (s.x === 'ping' && opts && opts.last) {                                                                                   // the en-bloc clip leaving an empty Garand
      tone(pos, { type: 'sine', f0: 2750, f1: 2680, dur: 0.55, vol: 0.16 * lvl, at: 0.06 });
      tone(pos, { type: 'sine', f0: 4120, f1: 4050, dur: 0.30, vol: 0.06 * lvl, at: 0.06 });
    }
  }
  /* reloads and dry clicks: the weapons without a sequence of their own borrow their family's */
  var KIN = { akm: 'ak47', scarh: 'ak47', m249: 'ak47', aa12: 'ak47', aug: 'm4a1', famas: 'm4a1', mk14: 'm4a1', garand: 'sniper', kar98: 'sniper', k98w: 'sniper', awm: 'sniper',
    ump9: 'uzi', mp5: 'uzi', vector: 'uzi', p90: 'uzi', seeker: 'rocket' };
  function dryFire(weapon) {
    var f = { ak47: 1300, m4a1: 1600, sniper: 950, uzi: 2100, shotgun: 800, pistol: 1800, rocket: 600, knife: 1500 }[KIN[weapon] || weapon] || 1400;
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
    var sq = RELOAD_SEQ[weapon] || RELOAD_SEQ[KIN[weapon]] || RELOAD_SEQ.m4a1;
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
  /* v15.0 (fix 1): the EMP — a rising electric sweep, then a low thump. */
  function empPulse(pos) {
    if (!ctx) return;
    tone(pos, { type: 'sawtooth', f0: 180, f1: 2600, dur: 0.35, vol: 0.28 });
    noiseBurst(pos, { ftype: 'highpass', f0: 3000, dur: 0.25, vol: 0.18 });
    setTimeout(function () { tone(pos, { type: 'sine', f0: 120, f1: 40, dur: 0.5, vol: 0.5 }); }, 220);
  }
  /* v15.0 (fix 10): rotor beat under the plane pass, so a helicopter reads as
     a helicopter rather than as another airdrop. */
  /* v2.0: the low-fuel siren — two-tone, four cycles; loud aboard, faint on
     the ground. Non-positional for the rider (it is in your cabin). */
  function fuelSiren(aboard) {
    if (!ctx) return;
    var vol = aboard ? 0.34 : 0.10;
    for (var i = 0; i < 4; i++) {
      (function (k) {
        setTimeout(function () { tone(null, { type: 'square', f0: 880, f1: 880, dur: 0.28, vol: vol }); }, k * 640);
        setTimeout(function () { tone(null, { type: 'square', f0: 660, f1: 660, dur: 0.28, vol: vol }); }, k * 640 + 320);
      })(i);
    }
  }
  function heliBeat(sec) {
    if (!ctx) return;
    var n = Math.floor((sec || 5) * 6);
    for (var i = 0; i < n; i++) {
      setTimeout(function () { noiseBurst(null, { ftype: 'lowpass', f0: 400, f1: 120, dur: 0.11, vol: 0.20 }); }, i * 165);
    }
    tone(null, { type: 'sawtooth', f0: 70, f1: 84, dur: sec || 5, vol: 0.09 });
  }
  /* v1.0k: the zone's heartbeat — one low thump per bleed tick, un-positioned. */
  function zoneTick() {
    if (!ctx) return;
    tone(null, { type: 'sine', f0: 62, f1: 48, dur: 0.22, vol: 0.55 });
    noiseBurst(null, { ftype: 'lowpass', f0: 240, dur: 0.08, vol: 0.10 });
  }
  /* v1.0k: the train. rumble(pos, speedFrac) is called every ~0.7 s by the
     train while it moves — a low positional roll scaled by speed; horn(pos)
     once when it pulls out of the station. */
  function trainRumble(pos, speedFrac) {
    if (!ctx) return;
    var v = 0.10 + 0.22 * Math.max(0, Math.min(1, speedFrac || 0));
    noiseBurst(pos, { ftype: 'lowpass', f0: 180, f1: 90, dur: 0.75, vol: v });
    tone(pos, { type: 'sawtooth', f0: 48, f1: 44, dur: 0.75, vol: v * 0.35 });
  }
  function trainHorn(pos) {
    if (!ctx) return;
    tone(pos, { type: 'sawtooth', f0: 311, f1: 311, dur: 0.9, vol: 0.42 });
    tone(pos, { type: 'sawtooth', f0: 370, f1: 370, dur: 0.9, vol: 0.34 });
    tone(pos, { type: 'square', f0: 155, f1: 155, dur: 0.9, vol: 0.12 });
  }
  /* ===== v2.13 - VEHICLES =====
     A horn is two notes a third apart, voiced per kind (the auto's is the
     pom-pom, the bus's a low air horn). The engine is one looping voice for the
     vehicle you sit in, on the same master bus as everything else so the
     volume slider and the mute apply to it. */
  var HORNS = { bike: [523, 659, 0.3], auto: [440, 587, 0.26], car: [392, 494, 0.5], bus: [220, 277, 0.8], tank: [147, 185, 0.85] };
  function vehicleHorn(pos, kind) {
    if (!ctx) return;
    var hn = HORNS[kind] || HORNS.car;
    tone(pos, { type: 'square', f0: hn[0], f1: hn[0], dur: hn[2], vol: 0.3 });
    tone(pos, { type: 'sawtooth', f0: hn[1], f1: hn[1], dur: hn[2], vol: 0.24 });
  }
  function vehicleDoor(pos) {
    if (!ctx) return;
    tone(pos, { type: 'sine', f0: 150, f1: 60, dur: 0.12, vol: 0.4 });
    noiseBurst(pos, { f0: 1300, f1: 300, dur: 0.08, vol: 0.22 });
  }
  var eng = null;
  /* on: is somebody driving; load 0..1: how hard; deep: a bus or a tank */
  function vehicleEngine(on, load, deep) {
    if (!ctx || !master) return;
    try {
      if (!eng) {
        if (!on) return;
        eng = { o1: ctx.createOscillator(), o2: ctx.createOscillator(), g: ctx.createGain(), f: ctx.createBiquadFilter() };
        eng.o1.type = 'sawtooth'; eng.o2.type = 'square'; eng.f.type = 'lowpass'; eng.g.gain.value = 0;
        eng.o1.connect(eng.f); eng.o2.connect(eng.f); eng.f.connect(eng.g); eng.g.connect(master);
        eng.o1.start(); eng.o2.start();
      }
      var t = ctx.currentTime, k = deep ? 0.62 : 1, ld = Math.max(0, Math.min(1, load || 0));
      eng.o1.frequency.setTargetAtTime((48 + ld * 120) * k, t, 0.08);
      eng.o2.frequency.setTargetAtTime((24 + ld * 60) * k, t, 0.08);
      eng.f.frequency.setTargetAtTime(300 + ld * 1000, t, 0.1);
      eng.g.gain.setTargetAtTime(on ? 0.05 + ld * 0.06 : 0, t, 0.12);
    } catch (e) { /* silence is not a reason to stop driving */ }
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
    /* v2.15: the recorded track (track.js) is asked first. On the menu it
       takes the place of the synthesized cue and bed; if the player turned it
       off or the file would not play, it says no and they play as before. */
    var song = false;
    try { song = !!(window.Soundtrack && Soundtrack.cue(state)); } catch (err) { song = false; }
    mStop();
    musicState = state;
    if (!state) return;
    musicG = ctx.createGain();
    musicG.gain.setValueAtTime(0, ctx.currentTime);
    musicG.gain.linearRampToValueAtTime(MUSIC_VOL, ctx.currentTime + 1.2);
    musicG.connect(master);
    if (state === 'menu') {
      if (!song) {
        if (!menuCuePlayed) { menuCuePlayed = true; menuCue(musicG); }
        menuBed(musicG);
      }
    } else if (state === 'game') {
      gameBed(musicG);
    }
  }

  /* v2.15: re-decide who has the music (the soundtrack was switched, or failed) */
  function musicRefresh() { var was = musicState; if (!ctx || !was) return; musicState = null; music(was); }
  /* v2.15: the scorecard's lightning (mapart.js). A crack of filtered noise,
     and under a big strike a falling thump. Synthesized like everything else. */
  var zapAt = 0;
  function zap(big) {
    if (!ctx || !noiseBuf) return;
    var t = ctx.currentTime;
    if (t - zapAt < (big ? 0.25 : 0.12)) return;
    zapAt = t;
    var n = ctx.createBufferSource(); n.buffer = noiseBuf;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(big ? 2600 : 4200, t); bp.frequency.exponentialRampToValueAtTime(big ? 500 : 1800, t + (big ? 0.5 : 0.12)); bp.Q.value = 0.8;
    var g = ctx.createGain(), peak = big ? 0.34 : 0.07, len = big ? 0.7 : 0.14;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp); bp.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + len + 0.05);
    if (!big) return;
    var o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.32, t + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.85);
  }
  return {
    bus: function () { return ctx && master ? { ctx: ctx, master: master } : null; },
    musicRefresh: musicRefresh, zap: zap, wake: wake,
    music: music,
    init: init, resume: resume, setVolume: setVolume, updateListener: updateListener, ambient: ambient,
    shot: shot, _shots: SHOT, _kin: KIN, reload: reload, magIn: magIn, bolt: bolt, step: step,
    dryFire: dryFire, shellIn: shellIn, pickupSnd: pickupSnd,
    planeFlyby: planeFlyby, crateThud: crateThud, stinger: stinger, fireCrackle: fireCrackle,
    empPulse: empPulse, heliBeat: heliBeat, fuelSiren: fuelSiren,   /* v15.0 */
    zoneTick: zoneTick, trainRumble: trainRumble, trainHorn: trainHorn,   /* v1.0k */
    vehicleHorn: vehicleHorn, vehicleDoor: vehicleDoor, vehicleEngine: vehicleEngine,   /* v2.13 */
    setIndoors: setIndoors,
    explosion: explosion, impact: impact, flesh: flesh, hitmark: hitmark,
    whoosh: whoosh, bounce: bounce, pinPull: pinPull, flashRing: flashRing,
    uiClick: uiClick, death: death
  };
})();
