/* verify-v215 — THE SOUNDTRACK AND THE ELECTRIC SCORECARD (v2.15.0), offline.

   Rahul sent an mp3: "you need to implement this song in the game properly,
   like in the game when someone drives the car then this sound will play and
   also when the game starts there should be music. End scorecard should show
   electrifying graphics animation."

   What "properly" has to mean in this game, and what this gate holds to:
     - the DROP lands on zero of the countdown, and is put back there if the
       stream stalls;
     - the music LEAVES once the match is being played (footsteps and gunfire
       are information), and can never be left playing by a countdown that was
       called off or a match that never arrived;
     - the radio plays in a vehicle somebody is driving, remembers its place,
       and has an off switch;
     - none of it is fetched before the first click, none of it is on the
       first-load path, and a file that will not play hands the menu back to
       the synthesized score;
     - the lightning runs only while the scorecard is up and stops when it goes.

   Run: node tools/verify-v215.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }

/* ---- a clock we can turn by hand ---- */
function world(opts) {
  opts = opts || {};
  let now = 0, seq = 0; const timers = new Map();
  const store = Object.assign({}, opts.store || {});
  const log = { plays: 0, pauses: 0, seeks: [], ramps: [], created: 0, refresh: 0, src: null };
  const filmEl = { up: !!opts.film };
  class FakeAudio {
    constructor() { log.created++; this.currentTime = 0; this.paused = true; this.readyState = opts.noMeta ? 0 : 4; this.loop = false; this.preload = ''; this._l = {}; this._src = ''; const self = this; log.el = self; }
    set src(v) { this._src = v; log.src = v; } get src() { return this._src; }
    addEventListener(k, f) { (this._l[k] = this._l[k] || []).push(f); }
    fire(k) { (this._l[k] || []).forEach(f => f()); }
    play() { log.plays++; this.paused = false; return Promise.resolve(); }
    pause() { log.pauses++; this.paused = true; }
  }
  const realSet = Object.getOwnPropertyDescriptor(FakeAudio.prototype, 'src');
  void realSet;
  const gain = { value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v, t) { this.value = v; log.ramps.push([v, +(t - now / 1000).toFixed(2)]); } };
  const actx = { get currentTime() { return now / 1000; }, createGain() { const g = { gain: gain, connect() {}, context: actx }; return g; }, createMediaElementSource() { return { connect() {} }; } };
  const btns = [];
  const box = { checked: true, addEventListener(k, f) { this.on = f; } };
  const doc = { body: { appendChild(e) { btns.push(e); } },
    getElementById(id) { if (id === 'ma-intro') return filmEl.up ? {} : null; if (id === 'song-on') return box; return null; },
    createElement() { return { textContent: '', hidden: false, classList: { toggle() {} }, addEventListener(k, f) { this.click = f; } }; } };
  const ctx = { console, Math, Promise,
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), f }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: doc,
    AudioSys: { bus: () => (opts.noBus ? null : { ctx: actx, master: {} }), musicRefresh() { log.refresh++; } } };
  if (!opts.noAudio) ctx.Audio = FakeAudio;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/src/audio/track.js') + '\nthis.Soundtrack = Soundtrack;', ctx, { filename: 'track.js' });
  if (!opts.noClick) ctx.Soundtrack.poke();          // the first click has happened (AudioSys.wake calls this)
  const advance = (ms, elPlaying) => { const end = now + ms;
    for (;;) { let next = null, nid = 0; timers.forEach((t, id) => { if (t.at <= end && (!next || t.at < next.at)) { next = t; nid = id; } }); if (!next) break;
      if (log.el && !log.el.paused && elPlaying !== false) log.el.currentTime += (next.at - now) / 1000;
      now = next.at; timers.delete(nid); next.f(); }
    if (log.el && !log.el.paused && elPlaying !== false) log.el.currentTime += (end - now) / 1000;
    now = end; };
  return { S: ctx.Soundtrack, log, gain, advance, store, film: filmEl, box, btns, timers };
}
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 0.011 : e);

console.log('--- the file ---');
const MP3 = path.join(ROOT, 'public/assets/music/track.mp3');
const haveFile = fs.existsSync(MP3), bytes = haveFile ? fs.statSync(MP3).size : 0;
const trackSrc = read('public/src/audio/track.js');
const DROP = +(trackSrc.match(/var DROP = ([0-9.]+)/) || [0, 0])[1];
let kbps = 0, secs = 0;
if (haveFile) { const b = fs.readFileSync(MP3); let i = 0; if (b.slice(0, 3).toString() === 'ID3') i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
  while (i < b.length - 4 && !(b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0)) i++;
  const V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]; if ((b[i + 1] & 0x1e) === 0x1a) kbps = V1L3[b[i + 2] >> 4]; secs = kbps ? (b.length - i) * 8 / (kbps * 1000) : 0; }
ok(haveFile && bytes > 600e3 && bytes < 1500e3, 'assets/music/track.mp3 is there and is ' + (bytes / 1048576).toFixed(2) + ' MB (the upload was 4.63 MB at 320 kbps)');
ok(kbps > 0 && kbps <= 128 && secs > 60, 'it is an MPEG-1 Layer III stream at ' + kbps + ' kbps, about ' + secs.toFixed(0) + ' s long');
ok(DROP >= 5 && DROP < secs - 20, 'the drop the countdown aims for is at ' + DROP + ' s: five seconds of build-up before it, and ' + (secs - DROP).toFixed(0) + ' s after');
const html = read('public/index.html');
ok(html.indexOf('track.mp3') < 0 && /src\/audio\/audio\.js[\s\S]*src\/audio\/track\.js[\s\S]*src\/core\/game\.js/.test(html),
  'index.html loads track.js after audio.js and never names the mp3 — the song is not on the first-load path');

console.log('--- nothing before the first click ---');
{
  const w = world({ noClick: true });
  const took = w.S.cue('menu'); w.advance(5000);
  ok(w.log.created === 0 && w.log.src === null, 'a page that has been loaded but never clicked has no <audio> and has not asked for the file (the AudioContext exists from load, so that is not the test)');
  ok(took === true, 'the menu is still promised to the song, so the synthesized bed does not start underneath it');
  w.S.poke();
  ok(w.log.created === 1 && !w.log.el.paused && near(w.gain.value, w.S.LEVEL.menu), 'the first click or key starts it');
  const audioS = read('public/src/audio/audio.js');
  ok(/document\.addEventListener\('pointerdown', wake, true\)/.test(audioS) && /document\.addEventListener\('keydown', wake, true\)/.test(audioS) && /function wake\(\) \{[\s\S]{0,200}ctx\.resume\(\)/.test(audioS) && /function resume\(\) \{\s*wake\(\);/.test(audioS),
    'and that first click wakes the AudioContext wherever it lands — it used to wake only when a MATCH took the pointer, so the menu and lobby were silent');
  const nb = world({ noBus: true });
  ok(nb.S.cue('menu') === true && nb.log.created === 0, 'no AudioContext at all: nothing is built');
}

console.log('--- the menu ---');
{
  const w = world();
  ok(w.S.cue('menu') === true && w.log.created === 1 && /assets\/music\/track\.mp3$/.test(w.log.src) && w.log.el.loop === true && !w.log.el.paused,
    'on the menu the track plays as a loop from ' + w.log.src);
  ok(near(w.gain.value, w.S.LEVEL.menu) && w.S.LEVEL.menu <= 0.25 && w.log.ramps[w.log.ramps.length - 1][1] >= 2, 'quietly: ' + w.S.LEVEL.menu + ' of the master bus, faded in over ' + w.log.ramps[w.log.ramps.length - 1][1] + ' s');
  ok(w.btns.length === 1 && /MUSIC ON/.test(w.btns[0].textContent) && w.btns[0].hidden === false, 'a MUSIC ON / OFF switch sits on the menu');
  w.btns[0].click();
  ok(w.S.isOn() === false && near(w.gain.value, 0) && w.store.us_song === '0' && w.log.refresh >= 1 && w.S.cue('menu') === false,
    'switching it off silences the track, is remembered, and hands the menu back to the synthesized score');
  w.advance(1500); ok(w.log.el.paused, 'and the stream is paused once it has faded (it does not play on at zero volume)');
  w.btns[0].click(); ok(w.S.isOn() === true && !w.log.el.paused && near(w.gain.value, w.S.LEVEL.menu) && w.store.us_song === '1', 'switching it on again brings it back');
  const f = world({ film: true });
  const tookF = f.S.cue('menu');
  ok(tookF === true && (f.log.created === 0 || f.log.el.paused), 'while the intro film is showing the track waits (the film has its own sound)');
  f.film.up = false; f.advance(900);
  ok(f.log.created === 1 && !f.log.el.paused && near(f.gain.value, f.S.LEVEL.menu), 'and starts by itself when the film is over');
}

console.log('--- the countdown: the drop lands on zero ---');
{
  const w = world(); w.S.cue('menu'); w.advance(20000);              // twenty seconds in the lobby
  const before = w.log.seeks.length; void before;
  w.S.count(5);
  ok(near(w.log.el.currentTime, DROP - 5) && near(w.gain.value, w.S.LEVEL.start) && w.S._state().mode === 'start',
    'at "5" the track is placed ' + (DROP - 5).toFixed(1) + ' s in — five seconds before the drop — and raised to ' + w.S.LEVEL.start);
  let onTime = true;
  for (let n = 4; n >= 1; n--) { w.advance(1000); w.S.count(n); if (!near(w.log.el.currentTime, DROP - n, 0.02)) onTime = false; }
  w.advance(1000); w.S.count(0);
  ok(onTime && near(w.log.el.currentTime, DROP, 0.02), 'ticking 4, 3, 2, 1 leaves it alone when it is on time, and at zero the track is at ' + w.log.el.currentTime.toFixed(2) + ' s: the drop');
  /* a stream that stalls */
  const s = world(); s.S.cue('menu'); s.S.count(5); s.advance(1000, false);   // a second passes, the audio does not move
  s.S.count(4);
  ok(near(s.log.el.currentTime, DROP - 4), 'a stream that stalled while buffering is put back (it was 1.0 s late; over 0.35 s is corrected)');
  /* the match begins */
  w.S.cue('game');
  ok(w.S._state().live === true && near(w.gain.value, w.S.LEVEL.start), 'when the match is live the track holds for a moment');
  w.advance(5900); const held = near(w.gain.value, w.S.LEVEL.start); w.advance(200);
  const fading = near(w.gain.value, 0) && w.log.ramps[w.log.ramps.length - 1][1] >= 4;
  w.advance(5600);
  ok(held && fading && w.log.el.paused && w.S._state().mode === null, 'six seconds of play, a five second fade, then it is gone and the stream is paused — the fight has the sound to itself');
  ok(w.S.cue('game') === false, 'the synthesized game bed is never displaced (cue("game") says no)');
  /* called off */
  const c = world(); c.S.cue('menu'); c.S.count(5); c.advance(1000); c.S.count(4); c.S.count(-1);
  ok(c.S._state().sting === false && c.S._state().mode === 'menu' && near(c.gain.value, c.S.LEVEL.menu), 'a countdown that is called off drops back to the quiet menu level');
  /* never arrives */
  const d = world(); d.S.cue('menu'); d.S.count(5); d.advance(1000); d.S.count(4); d.advance(31000);
  ok(d.S._state().sting === false && near(d.gain.value, d.S.LEVEL.menu), 'and a match that never arrives cannot leave it blaring: after 30 s without a tick it stands down');
  /* switched off */
  const o = world({ store: { us_song: '0' } }); o.S.cue('menu'); o.S.count(5);
  ok(o.log.created === 0 && o.S._state().mode === null, 'with the soundtrack switched off the countdown is silent and the file is never fetched');
}

console.log('--- the car radio ---');
{
  const w = world(); w.S.cue('game');
  w.S.radio(true);
  ok(w.S._state().mode === 'radio' && !w.log.el.paused && near(w.gain.value, w.S.LEVEL.radio), 'in a vehicle somebody is driving the track plays, at ' + w.S.LEVEL.radio + ' of the master bus');
  const plays = w.log.plays; for (let i = 0; i < 600; i++) w.S.radio(true);
  ok(w.log.plays === plays, 'asked every frame, it does nothing until the answer changes (600 frames, no new play)');
  w.advance(42000); const at = w.log.el.currentTime;
  w.S.radio(false); w.advance(800);
  ok(w.log.el.paused && near(w.gain.value, 0), 'getting out fades it and pauses the stream');
  w.advance(60000); w.S.radio(true);
  ok(near(w.log.el.currentTime, at, 0.6), 'getting back in, the radio is where it was (' + at.toFixed(0) + ' s), not at the start again');
  const first = world(); first.S.cue('game'); first.S.radio(true);
  ok(near(first.log.el.currentTime, DROP - 1.2), 'the very first time, it comes on a second before the drop, not in the quiet intro');
  ok(w.S.toggleRadio() === false && near(w.gain.value, 0) && w.store.us_radio === '0', 'B switches the radio off, and that is remembered');
  w.S.radio(false); w.S.radio(true); w.advance(700);
  ok(w.log.el.paused, 'off means off: the next vehicle is quiet');
  ok(w.S.toggleRadio() === true && !w.log.el.paused && near(w.gain.value, w.S.LEVEL.radio), 'B again and it plays');
  /* the radio works with the menu soundtrack switched off — they are two switches */
  const r = world({ store: { us_song: '0' } }); r.S.cue('game'); r.S.radio(true);
  ok(r.S._state().mode === 'radio' && !r.log.el.paused, 'the radio has its own switch: it plays with the menu soundtrack off');
  /* the countdown outranks the radio */
  const p = world(); p.S.cue('menu'); p.S.count(5); p.S.radio(true);
  ok(p.S._state().mode === 'start' && near(p.gain.value, p.S.LEVEL.start), 'the match-start music outranks the radio while it lasts');
}

console.log('--- when it cannot play ---');
{
  const w = world(); w.S.cue('menu'); w.log.el.fire('error');
  ok(w.S._state().dead === true && w.log.refresh === 1 && w.S.cue('menu') === false, 'a file that fails to load gives the menu back to the synthesized score at once');
  w.S.count(5); w.S.radio(true);
  ok(w.log.plays === 1 && w.S._state().mode === null, 'and nothing tries to play it again');
  const n = world({ noAudio: true });
  ok(n.S.cue('menu') === false, 'a browser with no <audio> at all gets the synthesized score, not silence');
  const m = world({ noMeta: true }); m.S.cue('menu'); m.S.count(5);
  const lateSeek = m.log.el.currentTime; m.log.el.readyState = 1; m.log.el.fire('loadedmetadata');
  ok(lateSeek === 0 && near(m.log.el.currentTime, DROP - 5), 'a seek asked for before the file\'s header has arrived is applied when it does');
}

console.log('--- wired into the game ---');
const audioSrc = read('public/src/audio/audio.js'), uiSrc = read('public/src/ui/ui.js'), vehSrc = read('public/src/vehicles/vehicles.js'), gameSrc = read('public/src/core/game.js');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
ok(/Soundtrack\.cue\(state\)/.test(audioSrc) && /if \(!song\) \{[\s\S]{0,160}menuBed\(musicG\)/.test(audioSrc) && /bus: function \(\) \{ return ctx && master/.test(audioSrc),
  'AudioSys.music() asks the soundtrack first and plays its own menu bed only when the answer is no; the track runs through AudioSys\'s master bus (the VOLUME slider)');
ok(/Soundtrack\.count\(n\)/.test(uiSrc), 'the countdown on screen is the countdown the track follows (UI.setCountdown)');
ok(/Soundtrack\.radio\(!!\(mine && \(mySeat === 0 \|\| \(mine\.seats && mine\.seats\[0\]\)\)\)\)/.test(vehSrc) && /Soundtrack\.radio\(false\)/.test(vehSrc),
  'vehicles.js turns the radio on for everyone aboard a vehicle that has a DRIVER, and off when the match resets');
ok(/e\.code === 'KeyB' && window\.Soundtrack\) UI\.toast\(Soundtrack\.toggleRadio\(\)/.test(gameSrc) && CFG.VEHICLES && CFG.VEHICLES.radioKey === 'KeyB' && /B radio/.test(vehSrc),
  'B is the radio switch while seated (smoke on foot), it is in the vehicle table and on the vehicle HUD\'s hint line');
ok(/id="song-on"/.test(html) && /getElementById\('song-on'\)/.test(trackSrc), 'the pause panel has a Soundtrack box too');
ok(/function zap\(big\)/.test(audioSrc) && /zap: zap/.test(audioSrc) && /t - zapAt < \(big \? 0\.25 : 0\.12\)/.test(audioSrc), 'the lightning\'s crack is synthesized on the same bus and rate-limited');

console.log('--- the scorecard, electrified ---');
{
  /* a DOM just big enough for MapArt.end */
  let rafSeq = 0; const rafs = new Map(); let now = 1000; const zaps = [];
  const draw = { strokes: 0, fills: 0, clears: 0 };
  const g2d = new Proxy({}, { get: (t, k) => (k === 'stroke' ? () => { draw.strokes++; } : k === 'fillRect' ? () => { draw.fills++; } : k === 'clearRect' ? () => { draw.clears++; } : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
  function El(tag) { this.tag = tag; this.kids = []; this.parentNode = null; this.cls = new Set(); this.style = { setProperty() {} }; this.width = 0; this.height = 0; this.innerHTML = ''; const self = this;
    this.classList = { add() { for (const c of arguments) self.cls.add(c); }, remove() { for (const c of arguments) self.cls.delete(c); }, contains: (c) => self.cls.has(c), toggle(c, on) { if (on) self.cls.add(c); else self.cls.delete(c); } }; }
  Object.defineProperty(El.prototype, 'className', { set(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }, get() { return Array.from(this.cls).join(' '); } });
  Object.defineProperty(El.prototype, 'firstChild', { get() { return this.kids[0] || null; } });
  Object.defineProperty(El.prototype, 'offsetWidth', { get() { return 1280; } });
  El.prototype.appendChild = function (e) { if (e.parentNode) e.parentNode.removeChild(e); this.kids.push(e); e.parentNode = this; return e; };
  El.prototype.insertBefore = function (e, ref) { if (e.parentNode) e.parentNode.removeChild(e); const i = this.kids.indexOf(ref); if (i < 0) this.kids.push(e); else this.kids.splice(i, 0, e); e.parentNode = this; return e; };
  El.prototype.removeChild = function (e) { const i = this.kids.indexOf(e); if (i >= 0) this.kids.splice(i, 1); e.parentNode = null; return e; };
  El.prototype.querySelector = function (sel) { const c = sel.replace('.', ''); const walk = (n) => { for (const k of n.kids) { if (k.cls.has(c)) return k; const r = walk(k); if (r) return r; } return null; }; return walk(this); };
  El.prototype.getBoundingClientRect = function () { return this.rect || { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }; };
  El.prototype.getContext = function () { return g2d; };
  El.prototype.addEventListener = function () {};
  const overlay = new El('div'), table = new El('table'), title = new El('div'), sub = new El('div');
  table.className = 'end-table'; table.rect = { left: 260, top: 366, right: 1020, bottom: 552, width: 760, height: 186 };
  title.rect = { left: 400, top: 100, right: 880, bottom: 200, width: 480, height: 100 };
  overlay.appendChild(title); overlay.appendChild(sub); overlay.appendChild(table);
  const ids = { 'end-overlay': overlay, 'end-title': title, 'end-sub': sub };
  let reduce = false;
  const ctx = { console, Math, performance: { now: () => now }, setTimeout: () => 0, clearTimeout() {}, location: { search: '?nointro=1' }, sessionStorage: { getItem: () => '1', setItem() {} },
    Image: function () {}, URL: URL,
    document: { baseURI: 'http://localhost/', readyState: 'complete', body: new El('body'), getElementById: (id) => ids[id] || null, createElement: (t) => new El(t), addEventListener() {}, querySelector: () => null },
    requestAnimationFrame: (f) => { const id = ++rafSeq; rafs.set(id, f); return id; }, cancelAnimationFrame: (id) => { rafs.delete(id); },
    matchMedia: () => ({ matches: reduce }), AudioSys: { zap: (big) => { zaps.push([now, !!big]); } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('public/src/ui/mapart.js') + '\nthis.MapArt = MapArt;', ctx, { filename: 'mapart.js' });
  const M = ctx.MapArt;
  const run = (ms) => { const end = now + ms; while (now < end) { now += 16; const pend = Array.from(rafs.entries()); rafs.clear(); pend.forEach(([, f]) => f(now)); } };
  /* the bolt */
  let jagOk = true, maxDev = 0;
  for (let i = 0; i < 300; i++) { const p = M._jag(100, -20, 640, 300, 0.3, 6); if (p.length !== 2 * 65 || p[0] !== 100 || p[1] !== -20 || p[p.length - 2] !== 640 || p[p.length - 1] !== 300) jagOk = false;
    for (let k = 0; k < p.length; k += 2) { if (!isFinite(p[k]) || !isFinite(p[k + 1])) jagOk = false; const t = ((p[k] - 100) * 540 + (p[k + 1] + 20) * 320) / (540 * 540 + 320 * 320), dx = p[k] - (100 + 540 * t), dy = p[k + 1] - (-20 + 320 * t); maxDev = Math.max(maxDev, Math.hypot(dx, dy)); } }
  ok(jagOk && maxDev > 20 && maxDev < 320, 'a bolt is a jagged path of 65 points that starts and ends exactly where it is aimed and strays up to ' + maxDev.toFixed(0) + ' px on the way (300 bolts, all finite)');
  const b = { l: 260, t: 366, r: 1020, b: 552 }, out = [0, 0, 0, 0]; let onEdge = true; const P = M._onFrame(b, 0, out);
  for (let d = -50; d < P * 2 + 50; d += 7) { M._onFrame(b, d, out); const e = (Math.abs(out[0] - b.l) < 1e-6 || Math.abs(out[0] - b.r) < 1e-6 || Math.abs(out[1] - b.t) < 1e-6 || Math.abs(out[1] - b.b) < 1e-6) && out[0] >= b.l - 1e-6 && out[0] <= b.r + 1e-6 && out[1] >= b.t - 1e-6 && out[1] <= b.b + 1e-6; if (!e) onEdge = false; }
  ok(onEdge && P === 2 * (760 + 186), 'the current that crawls round the board stays on the board\'s frame all the way round, and wraps');
  /* it runs while the result is up */
  M.end(true);
  const cv = overlay.kids.find(k => k.cls.has('ma-end-fx'));
  ok(!!cv && cv.tag === 'canvas' && rafs.size === 1 && overlay.cls.has('ma-volt') && cv.width === 1280 && cv.height === 720, 'showing the result puts ONE canvas over it (' + (cv ? cv.width + ' x ' + cv.height : 'none') + ') and starts one animation loop');
  run(400); const early = zaps.length; run(200);
  ok(early === 0 && zaps.length === 1 && zaps[0][1] === true && overlay.cls.has('ma-jolt'), 'the first strike is the BIG one, 0.43 s in as the title stamps: thunder once, and the title flinches');
  const s0 = draw.strokes; run(8000);
  const inNine = zaps.length;
  ok(inNine >= 10 && inNine <= 32 && draw.strokes - s0 > 2000, 'then a storm: ' + inNine + ' strikes in the first nine seconds, ' + (draw.strokes - s0) + ' strokes drawn (bolts, the current round the board, sparks)');
  run(20000); const later = zaps.length - inNine;
  ok(later >= 3 && later <= 14, 'and settles to an occasional strike after that (' + later + ' in the next twenty seconds) — a result screen can sit for a while');
  ok(ctx.MapArt._volt.strikes.length < 8 && ctx.MapArt._volt.sparks.length < 120, 'old bolts and sparks are dropped, not kept (' + ctx.MapArt._volt.strikes.length + ' bolts, ' + ctx.MapArt._volt.sparks.length + ' sparks alive)');
  M.end(false);
  ok(rafs.size === 0 && !overlay.kids.includes(cv) && !overlay.cls.has('ma-volt') && !overlay.cls.has('ma-jolt'), 'leaving the result stops the loop and takes the canvas away');
  const z = zaps.length; run(3000);
  ok(zaps.length === z, 'and nothing strikes after that');
  /* a result hidden some other way must not leave a loop running */
  M.end(true); run(100); overlay.cls.add('hidden'); run(100);
  ok(rafs.size === 0, 'a result that is hidden by any other route stops the loop by itself');
  overlay.cls.delete('hidden'); M.end(false);
  reduce = true; M.end(true);
  ok(rafs.size === 0 && !overlay.kids.some(k => k.cls.has('ma-end-fx')), 'prefers-reduced-motion: no canvas, no loop');
  M.end(false);
  const css = read('public/css/style.css');
  ok(/canvas\.ma-end-fx \{[^}]*pointer-events: none/.test(css) && /#end-overlay\.ma-jolt \.end-title/.test(css) && /@keyframes maLive/.test(css), 'the canvas takes no clicks (BACK TO LOBBY still works) and the board glows with the current');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
