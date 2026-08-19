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
ok(before['congested wifi'].frozenPct > 3,
  'the old fixed buffer stalls badly on a jittery link [congested wifi ' +
  before['congested wifi'].frozenPct.toFixed(1) + '% of frames] — this is the reported bug');
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
ok(cwAdapt.frozenPct < cwNow.frozenPct,
  'the simulation still says adaptive would help a jittery link [' +
  cwNow.frozenPct.toFixed(1) + '% -> ' + cwAdapt.frozenPct.toFixed(1) + '%] — evidence, not a claim');

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
