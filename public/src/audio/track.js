/* Soundtrack — the one piece of RECORDED music in the game (v2.15.0).

   Rahul sent a track and asked: "implement this song in the game properly,
   like in the game when someone drives the car then this sound will play and
   also when the game starts there should be music."

   Everything else you hear is synthesized (audio.js ships no files). This is
   one file, streamed by an <audio> element — never decoded into memory (103 s
   of stereo is 36 MB of samples) — and fed through AudioSys's own master bus,
   so the VOLUME slider governs it like every other sound.

   Three places, one element, strict priority:
     start   the match countdown. The track is cut to its own build-up so the
             bass DROPS on zero: at "5" it is placed five seconds before the
             drop (DROP, measured on the file), and each tick re-checks it. It
             carries through the loading screen and the first seconds of play,
             then fades out — gunfire and footsteps are information, music is
             not, and v13.0's rule ("the score must never fight the game")
             stands.
     radio   in a vehicle that has a driver, through a dashboard speaker (see
             voice()) at under half its first loudness. It resumes where the
             radio was. B switches it off and on.
     menu    a quiet loop on the menu and in the lobby, in place of the
             synthesized bed. Not while the intro film is showing.

   SWAPPABLE: replace assets/music/track.mp3 and set DROP to the second where
   the new one lands. Nothing else knows what the song is.

   If the file cannot be played, or the player turns the soundtrack off, the
   synthesized score takes the menu back exactly as before (AudioSys.music). */
var Soundtrack = (function () {
  'use strict';
  var SRC = 'assets/music/track.mp3';
  var DROP = 14.4;                                   // s — where the bass lands (measured: silence to 12.7-14.3, full level from 14.40)
  var LEVEL = { menu: 0.2, start: 0.6, radio: 0.26 };   // of the master bus (the radio's is after its speaker chain: see voice())
  var HOLD = 6, FADE = 5;                            // s of play before the start music leaves, and how long it takes to
  var el = null, g = null, dead = false;
  var mode = null;                                   // 'start' | 'radio' | 'menu' | null — what is sounding now
  var wantMenu = false, wantRadio = false, sting = false, live = false;
  var songOn = true, radioOn = true, pendingSeek = -1, woke = false;
  var radioAt = Math.max(0, DROP - 1.2);            // the first time the radio comes on, the bass is a second away
  var T = { rest: 0, out: 0, end: 0, dog: 0, film: 0 };
  try { songOn = localStorage.getItem('us_song') !== '0'; radioOn = localStorage.getItem('us_radio') !== '0'; } catch (err) { /* private mode: both on */ }

  function save(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (err) { /* not remembered, still works */ } }
  function fail() {
    if (dead) return;
    dead = true; mode = null; sting = false;
    try { if (el) el.pause(); } catch (err) { /* nothing was playing */ }
    button();
    try { if (wantMenu && AudioSys.musicRefresh) AudioSys.musicRefresh(); } catch (err) { /* silence is the fallback's fallback */ }
  }
  /* the element, and its gain on the game's own bus. Nothing may sound before
     a gesture, so nothing is built before one: a visitor who never clicks
     never downloads the song (poke() is the gesture). */
  function ready() {
    if (dead) return false;
    if (el) return true;
    if (!woke) return false;
    var bus = (typeof AudioSys !== 'undefined' && AudioSys.bus) ? AudioSys.bus() : null;
    if (!bus || typeof Audio === 'undefined') return false;
    try {
      el = new Audio();
      el.preload = 'auto'; el.loop = true;
      el.addEventListener('error', fail);
      el.addEventListener('loadedmetadata', function () { if (pendingSeek >= 0) seek(pendingSeek); });
      el.src = SRC;
      g = bus.ctx.createGain(); g.gain.value = 0;
      var src = bus.ctx.createMediaElementSource(el);
      try { voice(bus.ctx, src); }
      catch (err) { dry = wet = hiss = null; try { src.disconnect(); } catch (e2) { /* nothing was connected */ } src.connect(g); }   // no speaker chain: the plain track, ONCE, is still a radio
      g.connect(bus.master);
    } catch (err) { fail(); }
    return !dead;
  }
  /* ===== v2.16 - THE RADIO SOUNDS LIKE A RADIO, AND HALF AS LOUD =====
     Rahul: "sound ko aisa banao ki lage radio mei gaana bajj raha h, original
     full quality nahi chahiye" and "loudness 50% se low kar do, bahot jor hai."
     In a vehicle the track plays through a dashboard speaker: summed to mono,
     nothing below 320 Hz or above 3.3 kHz (24 dB an octave each side), a nudge
     at 1.7 kHz where a small cone honks, a little saturation, and a bed of
     hiss that crackles for a moment as the set comes on. The menu and the
     match-start music keep the clean path — two gains choose between them.
     LOUDNESS, MEASURED (EBU R128, ffmpeg): the clean track at the old radio
     level was -12.9 LUFS; this chain at 0.26 is -25.0. Twelve LU down — a
     little under half as loud to the ear (ten is half). */
  var dry = null, wet = null, hiss = null;
  function voice(c, src) {
    var bq = function (type, f, q, gain) { var n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (gain) n.gain.value = gain; return n; };
    dry = c.createGain(); wet = c.createGain(); wet.gain.value = 0;
    src.connect(dry); dry.connect(g);
    var mono = c.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    var sat = c.createWaveShaper(), curve = new Float32Array(257);
    for (var i = 0; i < 257; i++) { var x = i / 128 - 1; curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5) * 0.9; }
    sat.curve = curve;
    var nodes = [mono, bq('highpass', 320, 0.71), bq('highpass', 320, 0.71), bq('peaking', 1700, 1, 5), sat, bq('lowpass', 3300, 0.71), bq('lowpass', 3300, 0.71), wet];
    src.connect(nodes[0]);
    for (var k = 1; k < nodes.length; k++) nodes[k - 1].connect(nodes[k]);
    wet.connect(g);
    /* the hiss: one second of noise, looped, band-passed, silent until the radio is on */
    var buf = c.createBuffer(1, 22050, 22050);
    var d = buf.getChannelData(0);
    for (var j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
    var ns = c.createBufferSource(); ns.buffer = buf; ns.loop = true;
    hiss = c.createGain(); hiss.gain.value = 0;
    var band = bq('bandpass', 2600, 0.6);
    ns.connect(band); band.connect(hiss); hiss.connect(g);
    ns.start();
  }
  function speaker(on) {
    if (!wet) return;
    var t = g.context.currentTime;
    dry.gain.cancelScheduledValues(t); wet.gain.cancelScheduledValues(t); hiss.gain.cancelScheduledValues(t);
    dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.03); wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.03);
    if (on) { hiss.gain.setValueAtTime(0.5, t); hiss.gain.setTargetAtTime(0.045, t + 0.05, 0.12); }   // a crackle as it comes on, then a bed
    else hiss.gain.setTargetAtTime(0, t, 0.05);
  }
  function level(v, secs) {
    var t = g.context.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(v, t + Math.max(0.02, secs));
  }
  function seek(t) {
    pendingSeek = t;
    try { if (el.readyState >= 1) { el.currentTime = t; pendingSeek = -1; } } catch (err) { /* applied when the metadata arrives */ }
  }
  function play() {
    clearTimeout(T.rest);
    var p; try { p = el.play(); } catch (err) { p = null; }
    if (p && p.catch) p.catch(function () { /* blocked until the next gesture; settle() runs again then */ });
  }
  function rest(secs) {
    level(0, secs);
    clearTimeout(T.rest);
    T.rest = setTimeout(function () { if (mode === null && el) { try { el.pause(); } catch (err) { /* already */ } } }, secs * 1000 + 120);
  }
  function filmUp() { return typeof document !== 'undefined' && !!document.getElementById('ma-intro'); }

  /* decide what should be sounding, and move there */
  function settle() {
    button();
    var film = wantMenu && filmUp();
    if (film) { clearTimeout(T.film); T.film = setTimeout(settle, 400); }   // the film has its own sound: the menu waits for it
    var menuOk = wantMenu && songOn && !dead && !film;
    var next = sting ? 'start' : (wantRadio && radioOn && !dead) ? 'radio' : menuOk ? 'menu' : null;
    if (next === mode || next === 'start') return;     // the countdown drives 'start' itself (count)
    if (next && !ready()) return;
    if (mode === 'radio' && el) radioAt = el.currentTime || 0;
    var from = mode; mode = next;
    if (!el) return;
    if (next === 'radio' || from === 'radio') speaker(next === 'radio');
    if (next === 'radio') { if (from !== 'menu') seek(radioAt); play(); level(LEVEL.radio, 0.5); }
    else if (next === 'menu') { play(); level(LEVEL.menu, from === 'radio' ? 0.8 : 2.5); }
    else rest(from === 'radio' ? 0.5 : 0.9);
  }

  /* ---- the match countdown: n = 5, 4, 3, 2, 1, then 0; -1 = called off ---- */
  function count(n) {
    if (!(n > 0)) {
      if (n < 0 && sting && !live) endSting();           // called off before the match began
      return;
    }
    if (!songOn || !ready()) return;
    var at = Math.max(0, DROP - n);
    clearTimeout(T.dog); T.dog = setTimeout(endSting, 30000);   // a match that never arrives must not leave this playing
    if (!sting) {
      if (mode === 'radio') radioAt = el.currentTime || 0;
      sting = true; live = false; mode = 'start'; speaker(false);
      clearTimeout(T.out); clearTimeout(T.end);
      var t = g.context.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t);
      seek(at); play(); level(LEVEL.start, 0.35);
    } else if (Math.abs((el.currentTime || 0) - at) > 0.35) seek(at);   // a stall while buffering: put the drop back on zero
    button();
  }
  /* the match is being played: stay for HOLD, leave over FADE */
  function playing() {
    wantMenu = false;
    if (!sting) { settle(); return; }
    if (live) return;
    live = true;
    clearTimeout(T.dog); clearTimeout(T.out); clearTimeout(T.end);
    T.out = setTimeout(function () { if (sting && g) level(0, FADE); T.end = setTimeout(endSting, FADE * 1000 + 150); }, HOLD * 1000);
  }
  function endSting() {
    clearTimeout(T.dog); clearTimeout(T.out); clearTimeout(T.end);
    if (!sting) return;
    sting = false; live = false; mode = null;
    if (el && g) { var t = g.context.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.min(g.gain.value, 0.05), t); }
    settle();
    if (mode === null && el) rest(0.3);
  }

  /* ---- AudioSys.music(state) asks first: true = the song has the menu ---- */
  function cue(state) {
    if (typeof Audio === 'undefined') dead = true;
    if (state === 'menu') { wantMenu = true; settle(); return songOn && !dead; }
    if (state === 'game') { playing(); return false; }
    wantMenu = false; settle(); return false;
  }
  /* every click and key (AudioSys.wake). The first one is what allows any of
     this; later ones let a browser that refused play() from a timer — after
     the film, say — accept it now. */
  function poke() {
    if (!woke) { woke = true; settle(); }
    if (el && mode && el.paused && !dead) play();
  }
  /* ---- vehicles.js, every frame: am I in a vehicle somebody is driving? ---- */
  function radio(on) {
    on = !!on;
    if (on === wantRadio) return;
    wantRadio = on; settle();
  }
  function toggleRadio() {
    radioOn = !radioOn; save('us_radio', radioOn); settle();
    return radioOn;
  }
  function enable(on) {
    songOn = !!on; save('us_song', songOn);
    if (!songOn && sting) endSting();
    settle();
    try { if (AudioSys.musicRefresh) AudioSys.musicRefresh(); } catch (err) { /* the bed follows on the next state change */ }
    return songOn;
  }

  /* ---- the two switches: a corner button on the menu, a box in the pause panel ---- */
  var btn = null, box = null;
  function button() {
    if (typeof document === 'undefined' || !document.body) return;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'song-btn'; btn.className = 'song-btn';
      btn.addEventListener('click', function () { enable(!songOn); });
      document.body.appendChild(btn);
      box = document.getElementById('song-on');
      if (box) box.addEventListener('change', function () { enable(box.checked); });
    }
    var text = dead ? '' : '♪  MUSIC ' + (songOn ? 'ON' : 'OFF');
    if (btn.textContent !== text) btn.textContent = text;
    var show = wantMenu && !dead && !filmUp();
    if (btn.hidden === show) btn.hidden = !show;
    btn.classList.toggle('off', !songOn);
    if (box && box.checked !== songOn) box.checked = songOn;
  }

  return {
    cue: cue, count: count, radio: radio, toggleRadio: toggleRadio, enable: enable, poke: poke,
    isOn: function () { return songOn; }, radioIsOn: function () { return radioOn; },
    DROP: DROP, SRC: SRC, LEVEL: LEVEL, _voice: function () { return { dry: dry, wet: wet, hiss: hiss }; },
    _state: function () { return { mode: mode, sting: sting, live: live, wantMenu: wantMenu, wantRadio: wantRadio, dead: dead, at: el ? el.currentTime : -1, gain: g ? g.gain.value : -1, paused: el ? el.paused : true }; }
  };
})();
