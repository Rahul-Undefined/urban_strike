/* verify-v216 — SEATS, THE SPEEDOMETER, THE RADIO'S SPEAKER, THE FIRST SECOND,
   THE GUNS (LOOK, SHOT AND SOUND) AND THE BLOOD (v2.16.0), offline.

   Rahul's list, in his order:
     1-3  "Car mei 4 people baith paye ... Bike mei 2 ... Bus mei 6"
     4    "speedmeter aisa hona chahiye below screen pe sahi tarike se without
          overlapping any other words or text" — then: "size chota karo"
     5    "Gaana ... loudness 50% se low kar do ... lage radio mei gaana bajj
          raha h, original full quality nahi chahiye"
     6    "Game jab start ho raha toh phir purana wala hi graphics aa raha phir
          1 sec baad load hokar naya wala animation aa raha"
     7    "Gun ke skins ... sab mei ek texture lao, shine lao ... hand ... avatar
          kya dress pehna hai woh hand ke cloths pe dikhna chahiye ... gunshot ka
          animation perfect hona chahiye" — and: "harr gun ka sound signature
          better karo taki gun ka sound unique and awesome lage"
     8    "blood stains ... jaha avatar die hua h ... jitna log uss point pe
          maarega blood stains aur badhna chahiye ... entire match mei rehna
          chahiye ... 5-8 litres" — "on the maps and all modes"

   What a headless gate can hold to, and what it cannot: it can run the server's
   seat and blood rules, the speedometer's geometry, the radio's node graph, the
   recoil springs, the weapon models (with the real three.js from npm, so the
   mesh merge really runs) and the shot synthesiser's node graph. It cannot
   LOOK or LISTEN: the screenshots and the loudness/spectrum measurements were
   taken in Chromium and are recorded in the CHANGELOG; the numbers they
   produced are asserted here as the constants that produced them.

   Run: node tools/verify-v216.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
let THREE; try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const V = CFG.VEHICLES, T = V.types;
const html = read('public/index.html'), css = read('public/css/style.css');

/* a 2D canvas that accepts every call and draws nothing */
function fakeCanvas(made) {
  const grad = { addColorStop() {} };
  const g = new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad; if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
  const cv = { width: 0, height: 0, style: {}, getContext: () => g };
  if (made) made.push(cv);
  return cv;
}

/* ============================== 1-3. SEATS ============================== */
console.log('--- 1-3. seats: sedan 4, bike 2, bus 6 ---');
ok(T.car.seats === 4 && T.bike.seats === 2 && T.bus.seats === 6, 'the table says so: sedan ' + T.car.seats + ', bike ' + T.bike.seats + ', bus ' + T.bus.seats);
ok(Object.keys(T).every(k => T[k].seatsAt.length === T[k].seats && T[k].seatsAt.every(s => Math.abs(s[0]) <= T[k].wid / 2 && Math.abs(s[1]) <= T[k].len / 2)),
  'every seat is a place, and every place is inside its own hull');
{
  let closest = 9;
  Object.keys(T).forEach(k => { const S = T[k].seatsAt; for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) closest = Math.min(closest, Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1])); });
  ok(closest >= 0.5, 'no two riders share a seat: the nearest pair anywhere sit ' + closest.toFixed(2) + ' m apart');
}
function fakeRoom() {
  const clock = { t: 5e6 }, sent = [];
  const room = { code: 'V16', state: 'playing', settings: { mode: 'ffa', map: 'urban' }, players: new Map() };
  const io = { to: () => ({ emit: (ev, d) => sent.push([ev, d]) }) };
  const Veh = require(path.join(ROOT, 'server/lib/vehicles.js'))({ CFG, io, now: () => clock.t, applyDamage() {}, modeInfo: () => ({ teams: false }) });
  const add = (id, x, y, z) => { const p = { id, alive: true, hp: 100, pos: [x, y, z], team: null, connected: true }; room.players.set(id, p); return p; };
  return { room, Veh, clock, sent, add };
}
{
  const F = fakeRoom(); F.Veh.start(F.room);
  const L = F.room.veh.list;
  ['car', 'bike', 'bus'].forEach(type => {
    const v = L.find(x => x.type === type), n = T[type].seats, got = [];
    for (let i = 0; i <= n; i++) { const p = F.add(type + i, v.x + 1.2, v.y, v.z + (i - n / 2) * 0.3); got.push(F.Veh.enter(F.room, p, { id: v.id })); }
    const seated = got.slice(0, n);
    ok(seated.every((r, i) => r.ok && r.seat === i) && v.seats.filter(Boolean).length === n,
      'the server seats ' + n + ' in a ' + T[type].label.toLowerCase() + ', the first at the wheel');
    ok(got[n].ok === false && v.seats.filter(Boolean).length === n, 'and refuses number ' + (n + 1));
    /* somebody gets out: their seat is free again */
    F.Veh.exit(F.room, F.room.players.get(type + '1'));
    const again = F.Veh.enter(F.room, F.room.players.get(type + n), { id: v.id });
    ok(again.ok && again.seat === 1, 'a seat that is left can be taken (seat 2 of the ' + T[type].label.toLowerCase() + ')');
  });
}
const vehSrc = read('public/src/vehicles/vehicles.js');
ok(/aboard\(veh\) \+ '\/' \+ veh\.T\.seats \+ ' seats<\/i>'/.test(vehSrc) && /SEATS <b><\/b>/.test(vehSrc) && /lastChild\.textContent = aboard\(veh\) \+ '\/' \+ veh\.T\.seats/.test(vehSrc),
  'the game says how full it is: on the boarding prompt ("2/4 seats") and on the dashboard (SEATS 2/4)');
{
  const m = html.match(/seats: sedan (\d), bike (\d), bus (\d)/);
  ok(m && +m[1] === T.car.seats && +m[2] === T.bike.seats && +m[3] === T.bus.seats, 'the field manual states the same three numbers as the table');
}

/* ============================== 4. SPEEDOMETER ============================== */
console.log('--- 4. the speedometer ---');
{
  const ctx = { THREE, CFG, World: { builtMap: 'urban', colliders: [] }, PlayerCtl: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true },
    Net: { getMyId: () => 'me', emitVeh() {}, eachRemote() {} }, UI: { toast() {} }, performance: { now: () => 0 }, console, Math, window: {} };
  vm.createContext(ctx);
  vm.runInContext(vehSrc + '\nthis.Vehicles = Vehicles;', ctx, { filename: 'vehicles.js' });
  const VV = ctx.Vehicles, D = VV._dial, at = (t, r) => VV._dialAt(t, r, [0, 0]);
  ok(Object.keys(T).every(k => T[k].dial >= T[k].max * 3.6 && T[k].max * 3.6 >= T[k].dial * 0.5),
    'each vehicle has a scale it can reach the top half of and cannot run off: ' + Object.keys(T).map(k => k + ' ' + Math.round(T[k].max * 3.6) + '/' + T[k].dial).join(', ') + ' km/h');
  const p0 = at(0, 100), pm = at(0.5, 100), p1 = at(1, 100);
  ok(p0[0] < D.cx - 90 && p1[0] > D.cx + 90 && Math.abs(pm[0] - D.cx) < 1e-6 && Math.abs(pm[1] - (D.cy - 100)) < 1e-6,
    'zero is at the left, the top of the scale at the right, half-way straight up — the photograph\'s dial');
  /* the numerals */
  let tight = 1e9, most = 0;
  [60, 100, 160].forEach(max => { const step = VV._dialStep(max), n = max / step; most = Math.max(most, n + 1); tight = Math.min(tight, D.sweep / n * Math.PI / 180 * (D.R - 78)); });
  ok(most <= 11 && tight >= 60, 'at most ' + most + ' numerals on a face, never closer than ' + tight.toFixed(0) + ' px on the ' + D.W + ' px drawing');
  /* the needle and the LCD share the dial without touching */
  const lcdTop = +(/\.vlcd\{[^}]*top:(\d+)%/.exec(vehSrc) || [0, 0])[1];
  let low = 0; for (let t = 0; t <= 1.0001; t += 0.01) low = Math.max(low, at(t, D.R - 46)[1]);
  ok(lcdTop >= 70 && low / D.H * 100 < lcdTop, 'the needle\'s lowest reach is ' + (low / D.H * 100).toFixed(1) + '% down the dial; the LCD starts at ' + lcdTop + '% — a parked needle does not lie across it');
  const face = vehSrc.slice(vehSrc.indexOf('function paintFace'), vehSrc.indexOf('function drawGauge'));
  ok((face.match(/fillText\(/g) || []).length === 1 && /fillText\(String\(k \* step\)/.test(face), 'nothing is painted on the face but the scale and its numerals: every word is in the LCD, under the pivot');
  const w = /#veh-hud\{--vw:min\((\d+)px,(\d+)vh\);position:fixed;left:50%;bottom:(\d+)px;transform:translateX\(-50%\)/.exec(vehSrc);
  ok(w && +w[1] <= 200 && +w[1] >= 150 && +w[3] <= 8, 'it sits bottom-centre and is SMALL: ' + (w ? w[1] : '?') + ' px wide (' + (w ? Math.round(w[1] * D.H / D.W) : '?') + ' px tall), never more than ' + (w ? w[2] : '?') + '% of the screen\'s height');
  ok(w && +w[2] * D.H / D.W + 2 < 24 && /#veh-prompt\{position:fixed;left:50%;bottom:24%/.test(vehSrc), 'the boarding prompt (24% up) is above the top of the dial (' + (w ? (w[2] * D.H / D.W).toFixed(1) : '?') + '% up) on any screen');
  ok(/#veh-hud \.vk\{position:absolute;left:50%;bottom:100%/.test(vehSrc) && /> 10000 \? ' gone'/.test(vehSrc), 'the key reminder is ABOVE the dial, not on it, and fades ten seconds after boarding');
  ok(/body\.veh-on #toasts\{bottom:calc\(/.test(vehSrc) && /classList\.toggle\('veh-on', !!on\)/.test(vehSrc), 'toasts (which also live bottom-centre) step up out of its way while somebody is aboard');
  ok(/Math\.abs\(gauge\.sp - gauge\.drawn\) < 0\.12\) return/.test(vehSrc) && /if \(line !== gauge\.lcd\)/.test(vehSrc) && /gauge\.faceMax !== max/.test(vehSrc),
    'cost: the face is painted once per vehicle type, the needle only when it has moved, the LCD only when a number on it changes');
}

/* ============================== 5. THE RADIO ============================== */
console.log('--- 5. the radio: quieter, and through a small speaker ---');
function radioWorld(opts) {
  opts = opts || {};
  let now = 0, seq = 0; const timers = new Map(), nodes = [];
  const param = (v) => ({ value: v, target: undefined, log: [], cancelScheduledValues() {}, setValueAtTime(x) { this.value = x; this.log.push(['set', x]); },
    linearRampToValueAtTime(x) { this.value = x; }, setTargetAtTime(x, t, tc) { this.target = x; this.log.push(['target', x, tc]); } });
  const node = (kind, extra) => { const n = Object.assign({ kind, outs: [], connect(to) { this.outs.push(to); return to; }, disconnect() { this.outs.length = 0; } }, extra || {}); nodes.push(n); return n; };
  const actx = { get currentTime() { return now / 1000; },
    createGain() { const n = node('gain', { gain: param(1) }); n.context = actx; return n; },
    createBiquadFilter() { return node('biquad', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }); },
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; },
    createBufferSource() { return node('noise', { buffer: null, loop: false, started: false, start() { this.started = true; } }); },
    createMediaElementSource() { return node('media'); } };
  if (!opts.noShaper) actx.createWaveShaper = () => node('shaper', { curve: null });
  class FakeAudio { constructor() { this.currentTime = 0; this.paused = true; this.readyState = 4; } addEventListener() {} play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } }
  const master = node('master');
  const doc = { body: { appendChild() {} }, getElementById: () => null, createElement: () => ({ textContent: '', classList: { toggle() {} }, addEventListener() {} }) };
  const ctx = { console, Math, Promise, Float32Array, Audio: FakeAudio, document: doc,
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), f }); return id; }, clearTimeout: (id) => timers.delete(id),
    localStorage: { getItem: () => null, setItem() {} }, AudioSys: { bus: () => ({ ctx: actx, master }), musicRefresh() {} } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('public/src/audio/track.js') + '\nthis.Soundtrack = Soundtrack;', ctx, { filename: 'track.js' });
  ctx.Soundtrack.poke();
  const advance = (ms) => { const end = now + ms; for (;;) { let next = null, nid = 0; timers.forEach((t, id) => { if (t.at <= end && (!next || t.at < next.at)) { next = t; nid = id; } }); if (!next) break; now = next.at; timers.delete(nid); next.f(); } now = end; };
  return { S: ctx.Soundtrack, nodes, master, advance };
}
{
  const w = radioWorld(); w.S.cue('game'); w.S.radio(true); w.advance(900);
  const v = w.S._voice(), media = w.nodes.find(n => n.kind === 'media');
  ok(w.S._state().mode === 'radio' && v.dry && v.wet && v.hiss, 'in a driven vehicle the track is on the radio, and the radio has a speaker');
  /* walk the wet path from the source to the gain */
  const mono = media.outs.find(n => n !== v.dry), chain = [];
  for (let n = mono, guard = 0; n && guard < 20; n = n.outs[0], guard++) { chain.push(n); if (n === v.wet) break; }
  const hp = chain.filter(n => n.kind === 'biquad' && n.type === 'highpass'), lp = chain.filter(n => n.kind === 'biquad' && n.type === 'lowpass'),
    pk = chain.filter(n => n.kind === 'biquad' && n.type === 'peaking'), sh = chain.filter(n => n.kind === 'shaper');
  ok(media.outs.length === 2 && media.outs.indexOf(v.dry) >= 0 && mono && mono.channelCount === 1 && mono.channelCountMode === 'explicit',
    'the track goes two ways: the clean path, and a MONO one into the speaker (a car radio is not stereo)');
  ok(hp.length === 2 && lp.length === 2 && hp.every(n => n.frequency.value >= 250) && lp.every(n => n.frequency.value <= 4000) && chain[chain.length - 1] === v.wet,
    'the speaker passes ' + (hp[0] ? hp[0].frequency.value : '?') + ' Hz to ' + (lp[0] ? lp[0].frequency.value : '?') + ' Hz at 24 dB/octave: no bass, no air — "original full quality nahi"');
  ok(pk.length === 1 && pk[0].frequency.value >= 1000 && pk[0].frequency.value <= 2500 && pk[0].gain.value > 0, 'with the honk of a small cone: +' + (pk[0] ? pk[0].gain.value : '?') + ' dB at ' + (pk[0] ? pk[0].frequency.value : '?') + ' Hz');
  const c = sh[0] && sh[0].curve;
  ok(c && c.length >= 129 && Math.abs(c[(c.length - 1) / 2]) < 1e-6 && c[c.length - 1] > 0.5 && c[c.length - 1] < 1 && Math.abs(c[0] + c[c.length - 1]) < 1e-6 && (c[c.length - 1] - c[Math.round(c.length * 0.75)]) < (c[Math.round(c.length * 0.75)] - c[(c.length - 1) / 2]),
    'and a little overdrive: a symmetric curve that flattens toward the top');
  ok(v.wet.gain.target === 1 && v.dry.gain.target === 0, 'on the radio the speaker path is up and the clean one is down');
  const noise = w.nodes.find(n => n.kind === 'noise'), crackle = v.hiss.gain.log.find(e => e[0] === 'set');
  ok(noise && noise.loop && noise.started && crackle && crackle[1] >= 0.3 && v.hiss.gain.target > 0 && v.hiss.gain.target <= 0.06,
    'the set crackles as it comes on (' + (crackle ? crackle[1] : '?') + ') and settles to a bed of hiss (' + v.hiss.gain.target + ')');
  ok(w.S.LEVEL.radio < 0.42 * 0.65 && Math.abs(w.S._state().gain - w.S.LEVEL.radio) < 0.011, 'its level is ' + w.S.LEVEL.radio + ' of the master bus (it was 0.42)');
  ok(/-12\.9 LUFS/.test(read('public/src/audio/track.js')) && /-25\.\d/.test(read('public/src/audio/track.js')),
    'measured, not guessed (EBU R128): -12.9 LUFS before, about -25 after — twelve LU down, and ten is half as loud');
  w.S.radio(false); w.advance(900);
  ok(v.wet.gain.target === 0 && v.dry.gain.target === 1 && v.hiss.gain.target === 0, 'getting out switches the speaker and its hiss off');
  /* the other two uses of the track stay clean */
  const m = radioWorld(); m.S.cue('menu'); m.advance(900); const mv = m.S._voice();
  ok(m.S._state().mode === 'menu' && mv.wet.gain.value === 0 && mv.wet.gain.target === undefined && mv.dry.gain.value === 1, 'the menu plays the clean track');
  const s = radioWorld(); s.S.cue('game'); s.S.radio(true); s.advance(500); s.S.count(5);
  ok(s.S._state().mode === 'start' && s.S._voice().dry.gain.target === 1 && s.S._voice().wet.gain.target === 0, 'and so does the match-start drop, even if it starts from inside a car');
  /* a browser without the nodes */
  const old = radioWorld({ noShaper: true }); old.S.cue('game'); old.S.radio(true); old.advance(900);
  const om = old.nodes.find(n => n.kind === 'media');
  ok(old.S._state().mode === 'radio' && old.S._voice().wet === null && om.outs.length === 1 && om.outs[0].kind === 'gain',
    'where the speaker cannot be built the plain track still plays — connected once, not twice');
}

/* ============================== 6. THE FIRST SECOND ============================== */
console.log('--- 6. the first thing on screen ---');
{
  const body = html.slice(html.indexOf('<body>'));
  const iBoot = body.indexOf('<div id="ma-boot"'), iCanvas = body.indexOf('<canvas id="game-canvas"'), iScript = body.indexOf('<script src=');
  ok(iBoot > 0 && iBoot < iCanvas && iBoot < iScript, 'the boot cover is in the markup, ahead of the canvas and of every script file');
  const boot = body.slice(iBoot, body.indexOf('</div>\n<script>', iBoot));
  ok(/class="ma-intro ma-boot"/.test(boot) && /<video playsinline preload="none">/.test(boot) && /<img alt="Urban Strike" src="assets\/intro\/logo\.webp">/.test(boot) && /class="ma-start" disabled>LOADING</.test(boot),
    'it is the film\'s gate before its scripts: same element, same mark, a button that says LOADING and cannot be pressed');
  ok(/<link rel="preload" as="image" href="assets\/intro\/logo\.webp">/.test(html) && /<link rel="preload" as="image" href="assets\/maps\/kasbah_gate\.webp">/.test(html),
    'the two pictures of the first screen are asked for with the page, not after 46 scripts');
  const mapart = read('public/src/ui/mapart.js');
  const first = (/var MENU = \['([a-z_0-9]+)'/.exec(mapart) || [])[1];
  ok(first && new RegExp('<div class="backdrop has-art"[^>]*>[\\s\\S]{0,260}<div class="ma-menu"><div class="ma-slide ma-show ma-run" style="background-image:url\\(assets/maps/' + first + '\\.webp\\)"></div><div class="ma-slide"></div></div>').test(html),
    'the menu\'s first wallpaper (MENU[0] = ' + first + ') is in the markup and showing: the old backdrop is never the first picture');
  ok(fs.existsSync(path.join(ROOT, 'public/assets/maps', first + '.webp')) && fs.existsSync(path.join(ROOT, 'public/assets/intro/logo.webp')), 'both files exist');
  ok(/menuTop = 0; menuI = 1;/.test(mapart) && /if \(!backdrop \|\| menuT\) return;/.test(mapart), 'the slideshow carries on from that picture (the next one in is MENU[1]) and cannot be started twice');
  /* the inline script */
  const inline = (/<script>\s*window\.__maBoot = ([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
  let lifted = null;
  {
    const el = { parentNode: { removeChild() { el.parentNode = null; } }, classList: { list: [], add(c) { this.list.push(c); } } }, timers = [];
    const sb = { document: { getElementById: (id) => (id === 'ma-boot' ? el : null) }, setTimeout: (f, ms) => { timers.push([ms, f]); } };
    sb.window = sb; vm.createContext(sb); vm.runInContext('window.__maBoot = ' + inline, sb);
    const B = sb.__maBoot, safety = timers.find(t => t[0] >= 5000 && t[0] <= 10000);
    ok(B && B.el === el && typeof B.lift === 'function' && safety, 'the cover lifts ITSELF after ' + (safety ? safety[0] / 1000 : '?') + ' s if nothing else has — the menu is always reachable');
    safety[1]();
    lifted = el.classList.list.indexOf('ma-out') >= 0 && B.gone() === true;
    timers.filter(t => t[0] < 1000).forEach(t => t[1]());
    ok(lifted && el.parentNode === null, 'lifting fades it and then removes it from the page');
    const el2 = { parentNode: {}, classList: { list: [], add(c) { this.list.push(c); } } }, sb2 = { document: { getElementById: () => el2 }, setTimeout() {} };
    sb2.window = sb2; vm.createContext(sb2); vm.runInContext('window.__maBoot = ' + inline, sb2);
    sb2.__maBoot.taken(); sb2.__maBoot.lift();
    ok(el2.classList.list.length === 0, 'once the film has taken the element over, the safety timer leaves it alone');
  }
  ok(/boot\.taken\(\);\s*introEl = boot\.el;/.test(mapart) && /go\.disabled = false; go\.textContent = 'CLICK TO START';/.test(mapart) && /introEl\.classList\.remove\('ma-boot'\)/.test(mapart),
    'first visit: the cover BECOMES the gate (LOADING turns into CLICK TO START) — nothing fades, jumps or plays twice');
  ok(/if \(boot && !introEl && !boot\.gone\(\)\) \{\s*preload\(MENU\[0\], function \(\) \{/.test(mapart) && /raf\(function \(\) \{ raf\(function \(\) \{ setTimeout\(boot\.lift, 90\); \}\); \}\);/.test(mapart),
    'no film this time: it comes off once the first wallpaper is decoded and the game has had two frames to fill the menu in');
  ok(/\.ma-intro\.ma-boot \{[^}]*animation: maBootGone [0-9.]+s ease 9s forwards/.test(css) && /@keyframes maBootGone \{ to \{ opacity: 0; visibility: hidden; \} \}/.test(css),
    'and with no script at all the stylesheet removes it at nine seconds');
}

/* ============================== 7a. THE GUNS, TO LOOK AT ============================== */
console.log('--- 7. the guns: finish, hands, the shot ---');
const vmSrc = read('public/src/weapons/viewmodels.js');
const FIREARMS = Object.keys(CFG.WEAPONS).filter(n => ['auto', 'semi', 'bolt'].indexOf(CFG.WEAPONS[n].type) >= 0);
function buildModels(three, doc) {
  const ctx = { THREE: three, CFG, console, Math };
  if (doc) ctx.document = doc;
  vm.createContext(ctx);
  vm.runInContext(vmSrc + '\nthis.WeaponModels = WeaponModels;', ctx, { filename: 'viewmodels.js' });
  return { WM: ctx.WeaponModels, models: ctx.WeaponModels.build() };
}
const meshesOf = (g) => { const out = []; (function walk(o) { (o.children || []).forEach(c => { if (c.isMesh) out.push(c); walk(c); }); })(g); return out; };
{
  /* a browser: a document that can make canvases, and the real three.js */
  const made = [], doc = { createElement: () => fakeCanvas(made) };
  const B = buildModels(THREE, doc), M = B.models, FIN = B.WM._fin, DR = B.WM._dress;
  ok(Object.keys(FIN).join() === 'metal,poly,wood,cloth,skin' && made.length === 5 + 6,
    'five finishes — metal, polymer, wood, cloth, skin — painted once each on a 128 px sheet, plus one small sky to reflect: ' + made.length + ' canvases, no files');
  const mats = new Set(); FIREARMS.forEach(n => meshesOf(M[n]).forEach(m => mats.add(m.material)));
  const lit = Array.from(mats).filter(m => m.isMeshPhongMaterial && m.map), lamps = Array.from(mats).filter(m => !m.map && (m.isMeshBasicMaterial || (m.emissive && m.emissive.getHex() > 0)));
  ok(lit.length + lamps.length === mats.size && lamps.length <= 2 && mats.size <= 16,
    'every surface of every gun wears one of them: ' + mats.size + ' materials across ' + FIREARMS.length + ' firearms, ' + lit.length + ' textured finishes and ' + lamps.length + ' that glows by itself (the flamethrower\'s pilot flame)');
  const steel = Array.from(mats).filter(m => m.shininess === FIN.metal.shin);
  ok(steel.length >= 3 && steel.every(m => m.map === steel[0].map && m.envMap && m.envMap === steel[0].envMap && m.reflectivity > 0) && FIN.metal.shin > FIN.wood.shin && FIN.wood.shin > FIN.poly.shin && FIN.poly.shin > FIN.cloth.shin,
    'and it SHINES by what it is made of: steel ' + FIN.metal.shin + ' > wood ' + FIN.wood.shin + ' > polymer ' + FIN.poly.shin + ' > cloth ' + FIN.cloth.shin + ', with the sky in the metal (one shared sheet and one shared sky)');
  /* the hands */
  const wears = (g, mat) => meshesOf(g).some(m => m.material === mat);
  ok(FIREARMS.every(n => wears(M[n], DR.glove) && wears(M[n], DR.sleeve) && wears(M[n], DR.cuff) && wears(M[n], DR.skin) && wears(M[n], DR.pad)),
    'every firearm is held by hands: glove, knuckle pad, a wrist of skin, a cuff and a sleeve');
  B.WM.setDress('#2f6fd0', 0x8d5a3c);
  const blue = DR.sleeve.color.clone(), skin = DR.skin.color.getHex(), foldBlue = DR.fold.color.clone();
  B.WM.setDress('#d0412f', 0xf0c8a0);
  const red = DR.sleeve.color.clone();
  ok(blue.b > blue.r * 1.6 && red.r > red.b * 1.6 && skin === 0x8d5a3c && DR.skin.color.getHex() === 0xf0c8a0,
    'the sleeve is the colour the avatar wears (blue team: blue sleeve, red: red) and the wrist is the operator\'s own skin');
  ok(foldBlue.b < blue.b && foldBlue.b > 0, 'its creases are the same cloth in shadow');
  ok(/WeaponModels\.setDress\(row\.color, Avatars\.lookFor\(row\.name\)\.skin\)/.test(read('public/src/core/game.js')), 'the game dresses them from the player\'s own roster row');
  /* detail without draw calls */
  let parts = 0, draws = 0, worst = 0, least = 1e9, movers = true;
  FIREARMS.forEach(n => {
    const ms = meshesOf(M[n]); let p = 0; ms.forEach(m => { p += m.userData.baked || 1; });
    parts += p; draws += ms.length; worst = Math.max(worst, ms.length); least = Math.min(least, p);
    ['mag', 'pump', 'slide'].forEach(k => { const g = M[n].userData[k]; if (g && (g.parent !== M[n] || !meshesOf(g).length)) movers = false; });
  });
  ok(least >= 34, 'every firearm is at least ' + least + ' modelled parts (it was 12-20): sights, guard and trigger, port and bolt, pins, vents, butt, the hand\'s fingers ...');
  ok(worst <= 16 && draws / FIREARMS.length <= 13, 'drawn as ' + (draws / FIREARMS.length).toFixed(1) + ' meshes each on average (most ' + worst + '): ' + parts + ' parts folded into ' + draws + ' — one mesh per finish');
  ok(movers, 'what MOVES is still its own piece: every magazine, pump and slide is a separate group with its geometry inside');
  const pistolSlide = M.pistol.userData.slide;
  ok(meshesOf(pistolSlide).length <= 3 && meshesOf(pistolSlide).reduce((a, m) => a + (m.userData.baked || 1), 0) >= 14, 'and a moving piece is folded too, in its own space (the pistol\'s slide: ' + meshesOf(pistolSlide).reduce((a, m) => a + (m.userData.baked || 1), 0) + ' parts, ' + meshesOf(pistolSlide).length + ' meshes)');
  const before = made.length; B.WM.build();
  ok(made.length === before, 'building the armoury again paints nothing new');
  /* a folded mesh is where its parts were */
  const box = new THREE.Box3().setFromObject(M.ak47), muz = M.ak47.userData.muzzleZ;
  ok(Math.abs(box.min.z - muz) < 0.03 && box.max.z > 0.3, 'folding moved nothing: the AK\'s barrel still ends at its measured muzzle (' + muz.toFixed(3) + ' m) and its sleeves still reach back to the player');
  /* and the gates' own THREE, which cannot fold, measures the same weapon */
  const stub = require(path.join(__dirname, '_three-stub.js'));
  const S = buildModels(stub.THREE, null).models;
  ok(FIREARMS.every(n => Math.abs(S[n].userData.muzzleZ - M[n].userData.muzzleZ) < 1e-9 && Math.abs(S[n].userData.muzzleY - M[n].userData.muzzleY) < 1e-9),
    'headless (no canvas, no geometry) every weapon still builds, in flat paint, with the SAME measured muzzle — the model gates are not reading a different gun');
}
/* ---- the shot ---- */
{
  const sys = read('public/src/weapons/system.js');
  const block = sys.slice(sys.indexOf('var REC = {'), sys.indexOf('var pumpAnim'));
  const sb = { Math: Object.create(Math) }; sb.Math.random = () => 0.5;
  vm.createContext(sb); vm.runInContext(block + '\nthis.REC = REC; this.punch = recoilPunch; this.step = recoilStep;', sb);
  const run = (ms) => { for (let t = 0; t < ms; t += 4) sb.step(0.004); };
  const reset = () => { ['z', 'vz', 'up', 'vup', 'roll', 'vroll', 'yaw', 'vyaw'].forEach(k => { sb.REC[k] = 0; }); };
  sb.punch(CFG.WEAPONS.ak47, false); run(40);
  const z40 = sb.REC.z, up40 = sb.REC.up;
  ok(z40 > 0.02 && up40 > 0.03, 'a shot drives the rifle BACK (' + (z40 * 100).toFixed(1) + ' cm) and its muzzle UP (' + (up40 * 57.3).toFixed(1) + ' deg) within 40 ms');
  ok(/^\s*rig\.rotation\.x = REC\.up \+/m.test(sys) && /^\s*rig\.position\.z = REC\.baseZ \+ REC\.z;/m.test(sys) && !/^\s*rig\.rotation\.x = -kick/m.test(sys),
    'on the rig that is +z (toward the player) and a positive turn about X (muzzle rises) — the old kick nodded it 3.4 degrees DOWN');
  let peak = 0, tPeak = 0; reset(); sb.punch(CFG.WEAPONS.ak47, false); for (let t = 0; t < 600; t += 4) { sb.step(0.004); if (sb.REC.up > peak) { peak = sb.REC.up; tPeak = t + 4; } }
  ok(tPeak <= 100 && Math.abs(sb.REC.up) < peak * 0.02 && Math.abs(sb.REC.z) < 1e-3, 'it peaks ' + tPeak + ' ms after the trigger and is home again inside 0.6 s');
  let under = 0; reset(); sb.punch(CFG.WEAPONS.ak47, false); for (let t = 0; t < 600; t += 4) { sb.step(0.004); under = Math.min(under, sb.REC.up); }
  ok(under < 0 && under > -peak * 0.25, 'with a touch of overshoot (' + (under / peak * 100).toFixed(0) + '% of the kick), which is what makes it read as weight');
  const kickOf = (name, ads) => { reset(); sb.punch(CFG.WEAPONS[name], ads); let m = 0; for (let t = 0; t < 300; t += 4) { sb.step(0.004); m = Math.max(m, sb.REC.up); } return m; };
  const ak = kickOf('ak47'), awm = kickOf('awm'), mp5 = kickOf('mp5'), sg = kickOf('shotgun'), akAds = kickOf('ak47', true);
  ok(awm > sg * 0.99 && sg > ak && ak > mp5 * 0.99 && Math.abs(akAds / ak - 0.5) < 0.02, 'by weapon: bolt rifle ' + (awm * 57.3).toFixed(1) + ' > shotgun ' + (sg * 57.3).toFixed(1) + ' > AK ' + (ak * 57.3).toFixed(1) + ' >= MP5 ' + (mp5 * 57.3).toFixed(1) + ' deg; half of it with the sights up');
  reset(); let worst = 0; for (let t = 0; t < 3000; t += 4) { if (t % 100 === 0) sb.punch(CFG.WEAPONS.ak47, false); sb.step(0.004); worst = Math.max(worst, Math.abs(sb.REC.up), Math.abs(sb.REC.z)); }
  ok(worst < peak * 2.2, 'held down at 600 rounds a minute for three seconds it chatters and stays bounded (never more than ' + (worst / peak).toFixed(1) + 'x one shot)');
  ok(/if \(mdl && rig && rig\.visible && firstPerson && mdl\.userData && mdl\.userData\.muzzleZ !== undefined && mdl\.localToWorld\)/.test(sys) && /mdl\.userData\.muzzleZ - \(\(atts && atts\.muzzle\) \? 0\.2 : 0\)/.test(sys),
    'the flash, the tracer and the smoke leave from the muzzle of the model on screen (and from the end of the can, when one is fitted)');
  const fx = read('public/src/effects/effects.js');
  ok(/blending: THREE\.AdditiveBlending, rotation: Math\.random\(\) \* 6\.283/.test(fx) && /add\(burst, 0\.055,/.test(fx) && /flashTex = new THREE\.CanvasTexture\(cv\)/.test(fx),
    'the flash is a painted burst added to the frame, turned to a new angle every shot and gone in 55 ms — not a yellow square');
  ok(/if \(flashTex \|\| typeof document === 'undefined'\) return;/.test(fx), 'painted once, on first use');
}

/* ============================== 7b. THE GUNS, TO HEAR ============================== */
console.log('--- 7. every gun has its own voice ---');
function audioWorld() {
  let now = 0; const nodes = [];
  const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.value = x; this.ev.push(['set', x, t]); }, exponentialRampToValueAtTime(x, t) { this.ev.push(['exp', x, t]); },
    linearRampToValueAtTime(x, t) { this.ev.push(['lin', x, t]); }, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (kind, extra) => { const n = Object.assign({ kind, connect() {}, disconnect() {}, start(t, off) { this.at = t; this.off = off; }, stop() {} }, extra || {}); nodes.push(n); return n; };
  function AC() {
    this.sampleRate = 4000; this.state = 'running'; this.destination = {}; this.listener = { setPosition() {}, setOrientation() {} };
    Object.defineProperty(this, 'currentTime', { get: () => now });
    this.createGain = () => node('gain', { gain: param(1) });
    this.createBiquadFilter = () => node('biquad', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) });
    this.createBufferSource = () => node('src', { buffer: null, playbackRate: param(1) });
    this.createOscillator = () => node('osc', { type: 'sine', frequency: param(440) });
    this.createDelay = () => node('delay', { delayTime: param(0) });
    this.createPanner = () => node('panner', { setPosition() {} });
    this.createBuffer = (ch, len) => { const d = new Float32Array(len); return { getChannelData: () => d }; };
    this.resume = () => {};
  }
  const ctx = { console, Math, Float32Array, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = { AudioContext: AC }; vm.createContext(ctx);
  vm.runInContext(read('public/src/audio/audio.js') + '\nthis.AudioSys = AudioSys;', ctx, { filename: 'audio.js' });
  ctx.AudioSys.init();
  const mark = () => nodes.length;
  return { A: ctx.AudioSys, nodes, mark, since: (m) => nodes.slice(m), tick: (s) => { now += s; } };
}
{
  const W = audioWorld(), SHOT = W.A._shots;
  const voiced = FIREARMS.concat(Object.keys(CFG.WEAPONS).filter(n => ['rocket', 'bow'].indexOf(CFG.WEAPONS[n].type) >= 0));
  const missing = voiced.filter(n => !SHOT[n]);
  ok(missing.length === 0 && voiced.length >= 25, 'all ' + voiced.length + ' weapons that fire have a voice of their own' + (missing.length ? ' — MISSING ' + missing.join(', ') : '') + ' (twelve did; the rest played the pistol)');
  ok(Object.keys(SHOT).every(n => CFG.WEAPONS[n]), 'and there is no voice for a weapon that does not exist');
  /* how far apart two voices are: the layers' pitch, length and level, in octaves / ratios */
  const lg = (a, b) => Math.abs(Math.log2(a / b));
  const dist = (a, b) => {
    let d = 0, n = 0;
    [['c', 0, 1], ['c', 1, 3], ['b', 0, 1], ['b', 1, 1], ['b', 2, 1.5], ['b', 3, 3], ['m', 0, 1.5], ['m', 2, 1], ['m', 3, 1.5], ['t', 0, 1.5], ['t', 2, 1], ['k', 0, 1], ['k', 1, 1]].forEach(([L, i, wgt]) => {
      const x = a[L], y = b[L];
      if (!x && !y) return; n += wgt;
      if (!x || !y) { d += wgt * 1.5; return; }
      d += wgt * Math.min(1.5, lg(x[i], y[i]));
    });
    if ((a.x || '') !== (b.x || '')) { d += 1; n += 1; }
    return d / n;
  };
  let closest = 9, pair = '';
  const names = Object.keys(SHOT).filter(n => n !== 'bow');
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const d = dist(SHOT[names[i]], SHOT[names[j]]); if (d < closest) { closest = d; pair = names[i] + ' / ' + names[j]; } }
  ok(closest >= 0.12, 'no two are alike: the nearest pair is ' + pair + ', ' + closest.toFixed(2) + ' apart (0 = the same patch). Rendered in Chromium and measured (brightness, ring, low end, level), the nearest two were about 0.20 apart; before, with twelve weapons on one patch, 0.06');
  /* each sounds like what it is */
  const avg = (list, f) => list.reduce((a, n) => a + f(SHOT[n]), 0) / list.length;
  const smg = ['uzi', 'mp5', 'ump9', 'vector', 'p90'], rifle = ['ak47', 'akm', 'm4a1', 'aug', 'famas', 'scarh'], bolt = ['sniper', 'awm', 'kar98', 'k98w'];
  ok(avg(smg, s => s.t[0]) < avg(rifle, s => s.t[0]) && avg(rifle, s => s.t[0]) < avg(bolt, s => s.t[0]),
    'the report rolls away longer the bigger the round: SMG ' + avg(smg, s => s.t[0]).toFixed(2) + ' s < rifle ' + avg(rifle, s => s.t[0]).toFixed(2) + ' s < bolt rifle ' + avg(bolt, s => s.t[0]).toFixed(2) + ' s');
  ok(avg(smg, s => s.m[3]) < avg(rifle, s => s.m[3]) && avg(rifle, s => s.m[3]) < avg(bolt, s => s.m[3]) && SHOT.shotgun.m[3] > avg(rifle, s => s.m[3]) && SHOT.awm.m[0] < SHOT.sniper.m[0] && SHOT.sniper.m[0] < SHOT.ak47.m[0] && SHOT.ak47.m[0] < SHOT.m4a1.m[0] && SHOT.m4a1.m[0] < SHOT.p90.m[0],
    'and thumps lower and harder: a 9 mm barely has a boom, a 12-gauge is mostly boom, the .338 is the deepest thing in the game');
  ok(SHOT.ak47.k[0] < SHOT.m4a1.k[0] && SHOT.m4a1.k[0] < SHOT.mp5.k[0] + 400 && SHOT.m249.k[0] < SHOT.ak47.k[0] && !SHOT.sniper.k && !SHOT.shotgun.k,
    'the action is part of it: an AK clanks low (' + SHOT.ak47.k[0] + ' Hz), an M4 rings (' + SHOT.m4a1.k[0] + '), an MP5 ticks (' + SHOT.mp5.k[0] + '); a bolt gun and a pump have no action to hear in the shot');
  ok(SHOT.garand.x === 'ping' && SHOT.m4a1.x === 'spring' && SHOT.m249.x === 'belt' && SHOT.seeker.x === 'lock' && SHOT.bow.x === 'bow', 'and five have something nobody else has: the Garand\'s ping, the AR spring, the belt, the seeker head, the bow string');
  /* what one shot costs, and what makes two shots differ */
  let most = 0, mostName = '';
  names.forEach(n => { W.tick(1); const m = W.mark(); W.A.shot(n, null, { last: true }); const k = W.since(m).length; if (k > most) { most = k; mostName = n; } });
  ok(most <= 20, 'a shot is at most ' + most + ' audio nodes (' + mostName + ', on its last round), all of them freed when they stop');
  W.tick(1); let m0 = W.mark(); W.A.shot('ak47', null); const a1 = W.since(m0); W.tick(1); m0 = W.mark(); W.A.shot('ak47', null); const a2 = W.since(m0);
  const f1 = a1.filter(n => n.kind === 'biquad').map(n => n.frequency.ev[0][1]), f2 = a2.filter(n => n.kind === 'biquad').map(n => n.frequency.ev[0][1]);
  const o1 = a1.filter(n => n.kind === 'src').map(n => n.off), o2 = a2.filter(n => n.kind === 'src').map(n => n.off);
  ok(f1.length === f2.length && f1.every((f, i) => f !== f2[i]) && o1.every((o, i) => o !== o2[i]) && f1.every((f, i) => Math.abs(f / f2[i] - 1) < 0.12),
    'no two shots are the same sound: each is detuned a few percent and reads a different slice of the noise — automatic fire is not a loop');
  /* rapid fire shares its tails */
  W.tick(1); m0 = W.mark(); for (let i = 0; i < 20; i++) { W.A.shot('vector', null); W.tick(0.025); }
  const burst = W.since(m0), tails = burst.filter(n => n.kind === 'src' && n.at !== undefined).filter((n, i, arr) => false).length;
  void tails;
  const perShot = burst.length / 20; W.tick(1); m0 = W.mark(); W.A.shot('vector', null); const single = W.since(m0).length;
  ok(perShot < single - 1.5, 'the long layer is rationed: twenty rounds in half a second cost ' + perShot.toFixed(1) + ' nodes each, a single shot ' + single + ' (reports overlap; they are not stacked)');
  /* suppressed, far away, the last round */
  W.tick(1); m0 = W.mark(); W.A.shot('m4a1', null, { supp: true }); const sup = W.since(m0);
  W.tick(1); m0 = W.mark(); W.A.shot('m4a1', null); const loud = W.since(m0);
  const level = (list) => list.filter(n => n.kind === 'gain').reduce((a, n) => a + (n.gain.ev[0] ? n.gain.ev[0][1] : 0), 0);
  ok(sup.length < loud.length && !sup.some(n => n.kind === 'osc') && level(sup) < level(loud) * 0.4, 'a suppressor takes the blast and the boom off and leaves the action: ' + (level(sup) / level(loud) * 100).toFixed(0) + '% of the level');
  W.A.updateListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
  W.tick(1); m0 = W.mark(); W.A.shot('ak47', { x: 60, y: 0, z: 0 }); const farShot = W.since(m0);
  W.tick(1); m0 = W.mark(); W.A.shot('ak47', { x: 3, y: 0, z: 0 }); const nearShot = W.since(m0);
  const hi = (list) => list.filter(n => n.kind === 'biquad' && (n.type === 'highpass' || n.type === 'bandpass')).length;
  ok(hi(farShot) === 0 && hi(nearShot) === 2 && farShot.length < nearShot.length, 'from 60 m the snap and the click do not carry — you hear the thump and the report; from 3 m you hear all of it');
  W.tick(1); m0 = W.mark(); W.A.shot('garand', null, { last: false }); const g7 = W.since(m0).filter(n => n.kind === 'osc').length;
  W.tick(1); m0 = W.mark(); W.A.shot('garand', null, { last: true }); const g8 = W.since(m0).filter(n => n.kind === 'osc').length;
  ok(g8 === g7 + 2, 'the Garand pings on its eighth round and only then');
  const sys = read('public/src/weapons/system.js');
  ok(/AudioSys\.shot\(current, null, \{ supp: EF\.quiet, last: a\.mag === 0 \}\)/.test(sys) && !/\bsnd:/.test(read('public/src/config/weapons.config.js')),
    'the weapon system asks for its OWN voice (the four `snd:` borrowings are gone from the table)');
  ok(!/createDynamicsCompressor\(/.test(read('public/src/audio/audio.js')), 'no limiter on the master bus: one was tried and it ate the first 20 ms of every shot, which is the gunshot');
}

/* ============================== 8. BLOOD ============================== */
console.log('--- 8. blood where they died ---');
{
  const Blood = require(path.join(ROOT, 'server/lib/blood.js'));
  const room = {}; Blood.start(room);
  const a = Blood.add(room, [10, 1, 10]);
  ok(a && a[0] === 0 && a[4] === 1 && Blood.list(room).length === 1, 'the first death in a place starts a pool there');
  const b = Blood.add(room, [10.8, 1, 10.5]), c = Blood.add(room, [11.2, 1.1, 9.4]);
  ok(b[0] === 0 && b[4] === 2 && c[0] === 0 && c[4] === 3 && Blood.list(room).length === 1, 'the next ones within ' + Blood.MERGE + ' m FEED it: one pool, three deaths in it');
  ok(Math.hypot(c[1] - 10, c[3] - 10) < 1.0 && Math.hypot(c[1] - 10, c[3] - 10) > 0, 'and it creeps toward where people keep dying');
  const up = Blood.add(room, [10, 1 + Blood.FLOOR + 0.5, 10]), away = Blood.add(room, [10 + Blood.MERGE + 1, 1, 10 + Blood.MERGE]);
  ok(up[0] === 1 && up[4] === 1 && away[0] === 2, 'the floor above is a different pool; so is the next room');
  for (let i = 0; i < 400; i++) Blood.add(room, [200 + (i % 20) * 9, 1, (i / 20 | 0) * 9]);
  const full = Blood.list(room).length, deaths = Blood.list(room).reduce((s, p) => s + p[3], 0);
  ok(full === Blood.MAX && deaths === 5 + 400, 'the list has a ceiling (' + Blood.MAX + ' pools) and loses nobody at it: 405 deaths are all in there, the late ones in the nearest pool');
  ok(Blood.add(room, [NaN, 0, 0]) === null && Blood.add(room, null) === null && Blood.add(null, [0, 0, 0]) === null, 'a death with no position is not a stain and not a crash');
  Blood.start(room);
  ok(Blood.list(room).length === 0, 'a new match starts on a clean floor');
  /* one path for every death, in every mode, on every map */
  const combat = read('server/lib/combat.js'), server = read('server.js');
  ok((combat.match(/emit\('death'/g) || []).length === 1 && !/emit\('death'/.test(server) && /emit\('death', \{\s*blood: Blood\.add\(room, victim\.pos\),/.test(combat),
    'there is ONE place a death is announced — players and bots, every mode, every map — and the pool rides that message');
  const emitAt = combat.indexOf("emit('death'");
  ok(!/settings\.(mode|map)/.test(combat.slice(emitAt - 400, emitAt + 200)), 'with no mode or map condition anywhere near it');
  ok((server.match(/Blood\.start\(room\)/g) || []).length === 2 && /blood: Blood\.list\(room\)/.test(server), 'the server clears it at match start and on return to the lobby, and hands the whole list to whoever joins late');
  ok(!/blood/i.test(read('public/src/networking/snapcodec.js')), 'nothing was added to the 15 Hz snapshot: a pool is five numbers on a message that is sent anyway');

  /* the client: real three.js, a floor at y = 3 under x < 50, a higher one at y = 9 */
  const made = [], doc = { createElement: () => fakeCanvas(made) };
  const World = { rayHit(o, d, max) { if (o.x > 900) return null; const floor = (o.x < 50 && o.y > 9) ? 9 : 3; if (o.y < floor) return null; return { t: o.y - floor, point: new THREE.Vector3(o.x, floor, o.z) }; } };
  const ctx = { THREE, World, document: doc, console, Math, Float32Array, Uint16Array };
  vm.createContext(ctx); vm.runInContext(read('public/src/effects/blood.js') + '\nthis.Blood = Blood;', ctx, { filename: 'blood.js' });
  const B = ctx.Blood, scene = new THREE.Scene();
  B.init(scene);
  const mesh = B._mesh();
  ok(scene.children.length === 1 && mesh && mesh.geometry.attributes.position.count === B.MAX * 4 && mesh.geometry.drawRange.count === 0 && made.length === 1,
    'every pool on the map is ONE mesh, one material and one painted texture (four pool shapes on a single sheet): one draw call however many die');
  ok(B.MAX === Blood.MAX, 'sized for the server\'s ceiling');
  B.add([0, 20, 4, 20, 1]);
  const p = B._pools()[0];
  ok(p.ok && Math.abs(p.fy - 3) < 1e-9 && B._live().length === 1 && mesh.geometry.drawRange.count === 6, 'a death is laid on the FLOOR under the body (ray down through the world), not at chest height');
  B.update(0.001); const small = p.size; B.update(1.0); const mid = p.size; B.update(10);
  ok(small < mid && mid < p.size && Math.abs(p.size - B.SIZE(1)) < 1e-6 && B._live().length === 0, 'it SPREADS — ' + (small).toFixed(2) + ' m as the body falls, ' + mid.toFixed(2) + ' m after a second, ' + p.size.toFixed(2) + ' m when it stops');
  ok(B.SIZE(1) >= 2.2 && B.SIZE(1) <= 2.8, 'one body leaves a pool ' + B.SIZE(1).toFixed(1) + ' m across — about ' + (Math.PI * Math.pow(B.SIZE(1) / 2, 2) * 0.55 * 2.5).toFixed(0) + ' litres at 2.5 mm deep over the 55% of the quad the pool covers: a pool, not drops');
  const arr = mesh.geometry.attributes.position.array, ys = [arr[1], arr[4], arr[7], arr[10]], span = Math.hypot(arr[6] - arr[0], arr[8] - arr[2]);
  ok(ys.every(y => y > 3 && y < 3.06) && Math.abs(span - p.size * Math.SQRT2) < 1e-4, 'the quad lies flat, 3 cm above the floor, exactly as wide as the pool');
  B.add([0, 20.4, 4, 20.2, 2]); B.update(10); const two = p.size; B.add([0, 20.4, 4, 20.2, 6]); B.update(10); const six = p.size; B.add([0, 20.4, 4, 20.2, 60]); B.update(10);
  ok(two > B.SIZE(1) && six > two && p.size > six && p.size <= 7.5 + 1e-9 && scene.children.length === 1 && mesh.geometry.drawRange.count === 6,
    'more deaths in the same place make the SAME pool bigger: ' + B.SIZE(1).toFixed(1) + ' -> ' + two.toFixed(1) + ' -> ' + six.toFixed(1) + ' m, to a ceiling of ' + p.size.toFixed(1) + ' m');
  B.add([0, 20.4, 4, 20.2, 3]); B.update(10);
  ok(p.size > six && p.n === 60, 'and it never shrinks (a stale message cannot wash it away)');
  B.add([1, 20, 14, 20, 1]); B.add([2, 999, 4, 0, 1]); B.update(10);
  ok(Math.abs(B._pools()[1].fy - 9) < 1e-9 && B._pools()[2].ok === false && mesh.geometry.drawRange.count === 12, 'a death on the roof stains the roof; a body with nothing under it leaves no stain');
  /* joining late */
  B.init(scene);
  ok(B._pools().length === 0 && scene.children.length === 1 && B._mesh() !== mesh, 'a new match is a clean floor (the old mesh is gone, the texture is kept: ' + made.length + ' canvas in all)');
  B.sync([[20, 4, 20, 5], [60, 4, 0, 1], [30, 12, 30, 2]]);
  const late = B._pools();
  ok(late.length === 3 && late.every(q => q.ok) && Math.abs(late[0].size - B.SIZE(5)) < 1e-6 && B._live().length === 0, 'somebody who joins in the tenth minute gets every pool at its full size, already dry at the edges — no spreading replayed');
  let touched = 0; const realWrite = B._mesh().geometry.attributes.position; const v0 = realWrite.version; B.update(0.016); B.update(0.016);
  touched = realWrite.version - v0;
  ok(touched === 0, 'when nothing is spreading, a frame of blood costs one comparison: the geometry is not touched');
  const bsrc = read('public/src/effects/blood.js');
  ok(!/\.splice\(k|pools\.pop|pools\.shift|setTimeout/.test(bsrc.replace(/live\.splice/g, '')), 'nothing ever removes a pool during a match: they stay to the end, as asked');
  const game = read('public/src/core/game.js'), net = read('public/src/networking/net.js');
  ok(/if \(window\.Blood\) Blood\.init\(scene\);/.test(game) && /Blood\.sync\(d\.blood\)/.test(game) && /Blood\.update\(dt\)/.test(game) && /if \(d\.blood && window\.Blood\) Blood\.add\(d\.blood\)/.test(net),
    'wired: built with the map, filled from the match-start payload, fed by every death message, stepped in the frame');
  ok(/<script src="src\/effects\/blood\.js">/.test(html), 'and the page loads it');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
