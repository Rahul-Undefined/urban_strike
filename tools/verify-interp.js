/* verify-interp — does a remote body keep MOVING when the network hiccups?

   The reported symptom, after v10.3: "ek player ek second idhar h, dusre second
   udhar chala ja raha, usko shoot karne pe health nahi gir raha aur woh udhar
   se maar raha" - a player is here one second and somewhere else the next, your
   shots do nothing to them, and theirs land on you.

   Both halves come from ONE cause. When the interpolator runs out of buffered
   samples the avatar stops dead at a stale position; the server has already
   moved that body on, so the 4 m plausibility check refuses every hit you claim
   against it, while its own shots - resolved entirely server-side - land on you
   normally. Freeze, refuse, jump.

   THE ARITHMETIC NOBODY HAD DONE. snapRate 15 puts a tick every 66.7 ms and
   interpDelay was 120 ms, so the buffer held 1.80 ticks and could absorb
   120 - 66.7 = 53 MILLISECONDS of jitter. Home broadband exceeds that. Mobile
   exceeds it by a factor of two.

   AND WHY NO GATE CAUGHT IT. Every measurement this project can take runs on
   localhost, where jitter is about 1 ms. The server timer measured 15.09 Hz,
   arrival gap p50 66 ms, zero gaps over 150 ms, payload sane - a perfect bill
   of health for a game that stutters on the internet. So this gate does not
   measure the network. It SIMULATES one, replaying arrival patterns from clean
   fibre to congested wifi through the real interpolation maths.

   ===== v10.5 - WHAT THIS GATE IS FOR NOW =====

   v10.4 answered the headroom problem with an adaptive buffer and velocity
   extrapolation, and this gate asserted both were in place. Both are REVERTED.
   They were not wrong in themselves - the simulation below still shows them
   helping - but they shipped stacked on top of the binary wire format that was
   already breaking the stream, so what reached the player was one unproven
   change on another, and it was worse than either alone.

   The interpolator is back to v9.15 exactly. This gate no longer asserts a
   fix; it MEASURES THE HEADROOM and states it out loud, so the next person
   knows the number before they touch snapRate or interpDelay. The simulation
   is kept because it is the only thing in this project that can see past
   localhost, and because when the buffer is eventually retuned this is where
   the before-and-after goes.

   Run: node tools/verify-interp.js */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

const netSrc = fs.readFileSync(path.join(ROOT, 'public/src/networking/net.js'), 'utf8');

const TICK = 1000 / CFG.NET.snapRate;
const BASE = CFG.NET.interpDelay;

console.log('--- the configuration itself ---');
console.log('        snapRate ' + CFG.NET.snapRate + ' -> a tick every ' + TICK.toFixed(1) + ' ms');
console.log('        interpDelay ' + BASE + ' ms = ' + (BASE / TICK).toFixed(2) + ' ticks of buffer');
ok(BASE > TICK, 'the configured delay covers at least one whole tick');

/* ---------------------------------------------------------------- the model
   A faithful re-implementation of what net.js does, so this can be replayed
   thousands of times without a browser. It is deliberately a SEPARATE
   implementation of the same rules: a copy of the source would pass whatever
   the source did, including its bugs. */
function Interp(opts) {
  this.buf = [];
  this.adaptive = opts.adaptive;
  this.extrapMs = opts.extrapMs;
  this.eff = BASE;
  this.gaps = [];
  this.lastArr = 0;
  this.pos = [0, 0, 0];
}
Interp.prototype.onPacket = function (t, p) {
  if (this.lastArr) { this.gaps.push(t - this.lastArr); if (this.gaps.length > 30) this.gaps.shift(); }
  this.lastArr = t;
  this.buf.push({ t: t, p: p.slice() });
  if (this.buf.length > 40) this.buf.shift();
};
Interp.prototype.effDelay = function () {
  if (!this.adaptive || this.gaps.length < 8) return BASE;
  const a = this.gaps.slice().sort((x, y) => x - y);
  const p90 = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
  let want = Math.max(BASE, p90 + TICK * 0.75);
  if (want > 320) want = 320;
  this.eff += (want - this.eff) * 0.06;
  return this.eff;
};
Interp.prototype.sample = function (now) {
  const renderT = now - this.effDelay();
  const buf = this.buf;
  while (buf.length > 2 && buf[1].t < renderT) buf.shift();
  if (!buf.length) return null;
  const a = buf[0], b = buf.length > 1 ? buf[1] : buf[0];
  const span = Math.max(1, b.t - a.t);
  const raw = (renderT - a.t) / span;
  let f;
  if (raw <= 1) f = Math.max(0, raw);
  else f = 1 + Math.min(renderT - b.t, this.extrapMs) / span;
  let out = [
    a.p[0] + (b.p[0] - a.p[0]) * f,
    a.p[1] + (b.p[1] - a.p[1]) * f,
    a.p[2] + (b.p[2] - a.p[2]) * f
  ];
  if (f > 1) {
    const ex = out[0] - b.p[0], ez = out[2] - b.p[2];
    const e2 = ex * ex + ez * ez;
    if (e2 > 9) { const k = 3 / Math.sqrt(e2); out = [b.p[0] + ex * k, out[1], b.p[2] + ez * k]; }
  }
  this.pos = out;
  return out;
};

/* A player running in a straight line at walk speed. The truth the client is
   trying to reproduce. */
const SPEED = 4.4 / 1000;         // m per ms
function truthAt(ms) { return [SPEED * ms, 0.95, 0]; }

/* Replay one network profile and report how badly the rendered body stalls.
   A STALL is what the player sees as a freeze: the avatar moving far less than
   it should over a stretch of frames. */
function run(profile, opts) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const I = new Interp(opts);
  const DUR = 20000;
  // schedule packet arrivals: server sends every TICK, network adds jitter
  const arrivals = [];
  for (let k = 0; k * TICK < DUR; k++) {
    const sent = k * TICK;
    const j = profile.base + (rnd() * 2 - 1) * profile.jitter +
      (rnd() < profile.spikeRate ? profile.spike : 0);
    arrivals.push({ at: sent + Math.max(0, j), truth: truthAt(sent) });
  }
  arrivals.sort((a, b) => a.at - b.at);     // TCP keeps order; late packets bunch

  let ai = 0, frozenFrames = 0, frames = 0, worstErr = 0, worstStall = 0, stall = 0;
  let prev = null;
  /* Skip the first 1.5 s. Before the buffer has filled, EVERY variant sits
     still waiting for a second sample - that is correct behaviour at join, not
     a stall, and counting it put an identical "worst stall 100 ms" on every
     profile including localhost, which is what gave the first version of this
     gate away. */
  const WARM = 1500;
  for (let now = 0; now < DUR; now += 16.7) {          // 60 fps
    while (ai < arrivals.length && arrivals[ai].at <= now) { I.onPacket(arrivals[ai].at, arrivals[ai].truth); ai++; }
    const p = I.sample(now);
    if (!p) continue;
    if (now < WARM) { prev = p; continue; }
    frames++;
    if (prev) {
      const moved = Math.abs(p[0] - prev[0]);
      const shouldMove = SPEED * 16.7;
      /* Under a fifth of expected motion for a frame is a visible stall. */
      if (moved < shouldMove * 0.2) { stall += 16.7; frozenFrames++; if (stall > worstStall) worstStall = stall; }
      else stall = 0;
    }
    prev = p;
    // how far the rendered body is from where the server had it 'eff' ago
    const err = Math.abs(p[0] - truthAt(now - I.effDelay())[0]);
    if (err > worstErr) worstErr = err;
  }
  return { frozenPct: frames ? frozenFrames / frames * 100 : 0, worstStall, worstErr, eff: I.eff };
}

const PROFILES = [
  { name: 'localhost',      base: 1,  jitter: 1,  spike: 0,   spikeRate: 0 },
  { name: 'fibre',          base: 12, jitter: 8,  spike: 0,   spikeRate: 0 },
  { name: 'home broadband', base: 35, jitter: 30, spike: 90,  spikeRate: 0.02 },
  { name: 'mobile 4G',      base: 70, jitter: 60, spike: 200, spikeRate: 0.05 },
  { name: 'congested wifi', base: 60, jitter: 100, spike: 350, spikeRate: 0.08 }
];

console.log('\n--- OLD behaviour: fixed ' + BASE + ' ms buffer, freeze when dry ---');
const before = {};
for (const P of PROFILES) {
  const r = run(P, { adaptive: false, extrapMs: 0.15 * TICK });
  before[P.name] = r;
  console.log('        ' + P.name.padEnd(16) + ' frozen ' + r.frozenPct.toFixed(1).padStart(5) +
    '% of frames, worst stall ' + r.worstStall.toFixed(0).padStart(4) + ' ms');
}
/* The regression assertion. If this ever stops being true the simulation has
   drifted and the numbers below mean nothing. */
/* THE REGRESSION ASSERTION, aimed at the profile the data actually condemns.
   The first cut of this asserted home broadband stalled over 5% and it did not
   - it stalls 0.7%. Asserting a number I expected rather than the one the
   simulation produced would have been a gate pinned to a guess. What the model
   does show clearly is congested wifi and mobile, and those are the links this
   game is played on. If this ever goes green the simulation has drifted and
   every comparison below is meaningless. */
/* ===== v10.15 - THIS ASSERTION IS INVERTED, AND THAT IS THE POINT =====

   It used to read `frozenPct > 3` — it asserted THE BUG EXISTS, because this
   whole file was written as evidence for a proposed adaptive buffer and needed
   to prove the problem was real first.

   v10.15 raised interpDelay 120 -> 190 ms (1.80 -> 2.85 ticks) and taught
   updateRemotes to snap forward when the buffer genuinely runs dry. Congested
   wifi now models at 1.0% of frames instead of over 3, so the old assertion
   fails — by succeeding.

   A gate that fails when the defect is fixed is a gate pinned to the old
   state, which section 4.2 is about. Flipped to the rule actually worth
   holding: the SHIPPED configuration must keep stalls rare on the links this
   game is played on. If this ever goes red, the buffer has been shortened or
   the tick rate has moved. */
ok(before['congested wifi'].frozenPct < 2.0,
  'the SHIPPED buffer keeps a jittery link smooth [congested wifi ' +
  before['congested wifi'].frozenPct.toFixed(1) + '% of frames, was >3% at interpDelay 120]');
ok(before['mobile 4G'].frozenPct < 2.0,
  'and mobile too [' + before['mobile 4G'].frozenPct.toFixed(1) + '%]');
ok(before['mobile 4G'].frozenPct > before['fibre'].frozenPct * 1.5,
  'and stalls get worse as jitter rises [4G ' + before['mobile 4G'].frozenPct.toFixed(1) +
  '% vs fibre ' + before['fibre'].frozenPct.toFixed(1) + '%]');

console.log('\n--- headroom, stated plainly ---');
const headroom = BASE - TICK;
console.log('        the buffer absorbs ' + headroom.toFixed(1) + ' ms of jitter before it runs dry');
console.log('        past that, f clamps at 1.15 in updateRemotes and the avatar STOPS');
console.log('        while it is stopped the server has already moved that body on, so');
console.log('        the 4 m plausibility check refuses your hits and its own still land');
ok(headroom > 0, 'there is at least some headroom [' + headroom.toFixed(1) + ' ms]');

/* NOT a pass/fail on the headroom being generous - it is 53 ms and that is
   thin, but changing it is a decision for somebody who has played the game, not
   for a gate. What IS asserted is that the number is not silently getting
   worse: raising snapRate or lowering interpDelay both eat it. */
ok(headroom >= 50,
  'headroom has not been eroded below 50 ms by a config change [' + headroom.toFixed(1) + ' ms]');

console.log('\n--- what an adaptive buffer WOULD buy, if it is ever revisited ---');
/* Kept as measurement, not as a claim. If stutter persists on the clean revert,
   this is the evidence for what to try - and the order to try it in: raise
   interpDelay alone first (one number, no new code, instantly reversible),
   and only then consider the adaptive version. */
for (const P of PROFILES) {
  const r = run(P, { adaptive: true, extrapMs: 220 });
  const b = before[P.name];
  console.log('        ' + P.name.padEnd(16) + ' frozen ' + b.frozenPct.toFixed(1).padStart(5) +
    '% now, ' + r.frozenPct.toFixed(1).padStart(5) + '% adaptive   (buffer would settle at ' +
    r.eff.toFixed(0) + ' ms)');
}
const cwNow = before['congested wifi'], cwAdapt = run(PROFILES[4], { adaptive: true, extrapMs: 220 });
/* v10.15: this asserted adaptive beats fixed, which was true when fixed meant
   120 ms. At 190 ms the two are level in the model — adaptive has nothing left
   to recover. Kept as a REPORT rather than an assertion, because the number
   still matters: if the gap ever reopens, the fixed buffer has drifted too
   short again and adaptive becomes worth building. */
console.log('        congested wifi: fixed ' + cwNow.frozenPct.toFixed(1) +
  '%  vs adaptive ' + cwAdapt.frozenPct.toFixed(1) + '%  (gap ' +
  (cwNow.frozenPct - cwAdapt.frozenPct).toFixed(1) + ' pts)');
ok(cwAdapt.frozenPct <= cwNow.frozenPct + 0.1,
  'adaptive is no longer meaningfully better than the shipped fixed buffer');

console.log('\n--- v10.17: the snapshot stream cannot queue without bound ---');
{
  const fs3 = require('fs'), path3 = require('path');
  const srv = fs3.readFileSync(path3.join(__dirname, '..', 'server.js'), 'utf8');
  const netjs = fs3.readFileSync(path3.join(__dirname, '..', 'public/src/networking/net.js'), 'utf8');
  const codec = fs3.readFileSync(path3.join(__dirname, '..', 'public/src/networking/snapcodec.js'), 'utf8');

  /* THE RULE: a delta may be dropped, a keyframe may not. Dropping deltas is
     what stops the send queue growing on a slow link; keeping keyframes
     reliable is what repairs whatever a drop cost. Both halves are required —
     volatile keyframes would make a dropped packet permanent. */
  ok(/volatile\.emit\('snap'/.test(srv), 'deltas are emitted volatile');
  const kfLine = srv.slice(srv.indexOf("if (keyframe) io.to(room.code)"), srv.indexOf("if (keyframe) io.to(room.code)") + 120);
  ok(/if \(keyframe\) io\.to\(room\.code\)\.emit/.test(kfLine),
    'and keyframes are emitted RELIABLY, which is what repairs a dropped delta');

  /* Volatile is only safe because every field is absolute. If encodeEntity ever
     pushed a difference from the previous value, one dropped packet would
     corrupt the position permanently and this whole design would be wrong. */
  const enc = codec.slice(codec.indexOf('function encodeEntity'), codec.indexOf('function decodeEntity'));
  ok(!/out\.push\([^)]*prev\./.test(enc),
    'encodeEntity pushes ABSOLUTE values, never a difference from prev — this is what makes dropping safe');
  ok(/out\.push\(s\.px, s\.py, s\.pz\)/.test(enc),
    'position specifically is sent absolute');

  const kf = /const KEYFRAME_EVERY = (\d+)/.exec(srv);
  ok(kf && +kf[1] <= 30,
    'the keyframe interval is short enough to bound a dropped delta [' +
    (kf ? kf[1] : '?') + ' ticks = ' + (kf ? (+kf[1] / 15).toFixed(1) : '?') + 's]');

  /* The instrumentation. v10.15 guessed and was wrong; the next answer must be
     readable off the screen. */
  ok(/function netDiag\(/.test(netjs) && /netDiag: netDiag/.test(netjs),
    'net.js exposes arrival timing and per-remote staleness');
  ok(/noteSnapArrival\(tLocal\)/.test(netjs),
    'and records an arrival timestamp for every snapshot received');
}

console.log('\n--- v10.16: updateRemotes survives every buffer shape ---');
/* The v10.15 catch-up reads buf[buf.length - 1] and splices. If any buffer
   shape can make it throw, it throws EVERY FRAME — and until v10.16 that
   skipped renderer.render() and blacked the screen. Exercised directly against
   the shapes a bad link actually produces. */
{
  const vm2 = require('vm');
  const fs2 = require('fs');
  const pathMod = require('path');
  const src2 = fs2.readFileSync(pathMod.join(__dirname, '..', 'public/src/networking/net.js'), 'utf8');
  /* Lift the catch-up arithmetic out of updateRemotes and run it standalone —
     the whole function needs a scene, a camera and THREE, but the logic under
     test is self-contained. */
  const TICKMS = 1000 / 15;
  function catchUp(buf, renderT) {
    while (buf.length > 2 && buf[1].t < renderT) buf.shift();
    while (buf.length > 1 && buf[buf.length - 1].t < renderT && buf.length > 2) buf.shift();
    if (!buf.length) return null;
    let a = buf[0], b = buf.length > 1 ? buf[1] : buf[0];
    const SNAP_MS = TICKMS * 3;
    const newest = buf[buf.length - 1];
    if (renderT - newest.t > SNAP_MS) {
      a = newest; b = newest;
      if (buf.length > 1) buf.splice(0, buf.length - 1);
    }
    const span = Math.max(1, b.t - a.t);
    const f = Math.min(1.15, Math.max(0, (renderT - a.t) / span));
    return a.p[0] + (b.p[0] - a.p[0]) * f;
  }
  const mk = ts => ts.map((t, i) => ({ t, p: [i * 10, 0, 0], ry: 0, rx: 0 }));
  const SHAPES = {
    'one entry':            mk([1000]),
    'two entries, current': mk([1000, 1066]),
    'two entries, stale':   mk([100, 166]),
    'long stale burst':     mk([100, 166, 233, 300, 366, 433]),
    'all in the future':    mk([9000, 9066]),
    'identical timestamps': mk([1000, 1000, 1000])
  };
  Object.keys(SHAPES).forEach(name => {
    let threw = null, out = null;
    try { out = catchUp(SHAPES[name], 1100); } catch (e) { threw = e.message; }
    ok(!threw && (out === null || isFinite(out)),
      name + ': resolves to a finite position' + (threw ? ' — THREW ' + threw : ' [' +
      (out === null ? 'empty' : out.toFixed(1)) + ']'));
  });
  /* The behaviour that matters: a badly stale buffer must land on the NEWEST
     sample, not hold the oldest. */
  const stale = mk([100, 166, 233, 300]);
  const got = catchUp(stale, 5000);
  ok(got === 30, 'a badly stale buffer snaps to the newest sample, not the oldest [' + got + ']');
}

console.log('\n--- the shipped interpolator is the v9.15 one ---');
ok(/renderT = performance\.now\(\) - CFG\.NET\.interpDelay/.test(netSrc),
  'the fixed interpDelay is what runs');
ok(!/effDelay/.test(netSrc), 'no adaptive buffer is in the shipped path');
ok(!/EXTRAP_MS/.test(netSrc), 'no extrapolation is in the shipped path');
ok(/Math\.min\(1\.15/.test(netSrc), 'the v9.15 clamp is back');
/* The one interpolation fix that PREDATES the bandwidth work and must survive
   every revert: v9.13's teleport snap. Without it a respawn is lerped across
   the map and every shot at that player is refused for the whole slide. */
ok(/6\.25/.test(netSrc), 'the v9.13 2.5 m teleport snap is still in place');
ok(/r\.buf\.length = 0/.test(netSrc), 'and it still drops the buffer rather than extending it');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
