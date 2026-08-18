/* diag-jitter — is the stream late, or is the DATA wrong?

   Reported after v10.3: "ek player ek second idhar h, dusre second udhar chala
   ja raha, usko shoot karne pe health nahi gir raha" - a player one place one
   second and somewhere else the next, with shots refused against them.

   That is the v9.13 symptom returning, and v9.13 is also the method: TWO
   THEORIES, MEASURED, BEFORE BELIEVING EITHER.

     theory A - the stream is LATE. Packets arriving in bursts with gaps
                between them. The interpolator runs dry, the avatar freezes,
                then snaps forward when the next burst lands.

     theory B - the stream is WRONG. Packets arrive on time but carry bad
                positions, so the client renders a body where the server does
                not have one, and the 4 m plausibility check on the server
                refuses every hit claim against it.

   They look identical to a player and they have completely different fixes, so
   this measures both at once against a real match:

     - arrival gaps, from a real socket, at the millisecond
     - actual WebSocket FRAME sizes, read off the transport rather than from
       the server's own accounting, because a server that miscounts its own
       payload is exactly the bug being hunted
     - per-entity position jumps between consecutive packets, with the 2.5 m
       teleport threshold the client uses
     - decode failures, which under the v10.3 binary format are silent: the
       handler returns and that whole tick is simply lost

   Run: node server.js &   then   node tools/diag-jitter.js [bots] [secs] */

const { io: rawIo } = require('socket.io-client');

const BOTS = parseInt(process.argv[2] || '19', 10);
const SECS = parseInt(process.argv[3] || '25', 10);
const URL = 'http://localhost:3000';
const SnapCodec = require('../public/src/networking/snapcodec.js');

const s = rawIo(URL, { transports: ['polling'] });

let frames = [];            // {t, bytes}
let arrivals = [];          // ms timestamps of snap events
let decodeFails = 0, packets = 0;
const cache = {};
const lastPos = {};         // slot -> [x,y,z]
const jumps = [];           // {slot, dist, dt}
let lastT = 0;

/* Read frame sizes off the ENGINE, not off our own emit path. If the server is
   shipping more bytes than it thinks it is - a pooled Buffer view being
   expanded to its whole 8 KB backing store, say - this is the only place that
   shows it. */
s.io.engine.on('packet', (p) => {
  if (!p || p.type !== 'message') return;
  const d = p.data;
  let n = 0;
  if (typeof d === 'string') n = Buffer.byteLength(d);
  else if (d && d.byteLength !== undefined) n = d.byteLength;
  else if (Buffer.isBuffer(d)) n = d.length;
  frames.push({ t: Date.now(), bytes: n });
});

s.on('snap', (d) => {
  const t = Date.now();
  packets++;
  if (lastT) arrivals.push(t - lastT);
  lastT = t;

  let ents = d.e;
  if (!ents && d.b) {
    try { ents = SnapCodec.decodeEntities(d.b); }
    catch (e) { decodeFails++; return; }
  }
  if (!ents) { decodeFails++; return; }

  for (const arr of ents) {
    let raw;
    try { raw = SnapCodec.decodeEntity(arr, cache); }
    catch (e) { decodeFails++; continue; }
    const st = SnapCodec.toPlayerState(raw);
    const p = st.p;
    /* A finite, in-bounds position. A decode that reads the wrong offset
       produces values that are wild rather than merely wrong, so this catches
       corruption that a distance check alone would miss. */
    if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2]) ||
        Math.abs(p[0]) > 400 || Math.abs(p[2]) > 400 || p[1] < -60 || p[1] > 200) {
      jumps.push({ slot: raw.slot, dist: Infinity, why: 'OUT OF RANGE ' + p.map(v => v.toFixed(1)).join(',') });
      lastPos[raw.slot] = p;
      continue;
    }
    const prev = lastPos[raw.slot];
    if (prev) {
      const dx = p[0] - prev[0], dy = p[1] - prev[1], dz = p[2] - prev[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 2.5) jumps.push({ slot: raw.slot, dist: dist, why: '' });
    }
    lastPos[raw.slot] = p;
  }
});

s.on('connect', () => {
  s.emit('createRoom', { name: 'DIAG', settings: { killTarget: 500, minutes: 30, mode: 'bots', map: 'urban', botCount: BOTS, backfill: false } }, (res) => {
    if (!res || !res.ok) { console.log('createRoom failed: ' + JSON.stringify(res)); process.exit(1); }
    s.emit('setReady', { v: true });
    setTimeout(() => s.emit('startMatch'), 400);
  });
});

setTimeout(() => {
  const expected = 1000 / 15;
  arrivals.sort((a, b) => a - b);
  const pct = q => arrivals.length ? arrivals[Math.min(arrivals.length - 1, Math.floor(arrivals.length * q))] : 0;
  const big = arrivals.filter(g => g > 150).length;
  const huge = arrivals.filter(g => g > 400).length;

  console.log('\n=== ' + BOTS + ' bots + 1 human, ' + SECS + 's ===\n');

  console.log('THEORY A - is the stream LATE?');
  console.log('  snapshots received : ' + packets + '  (' + (packets / SECS).toFixed(1) + '/s, expected 15/s)');
  console.log('  gap p50 / p90 / p99: ' + pct(0.5) + ' / ' + pct(0.9) + ' / ' + pct(0.99) + ' ms   (expected ~' + expected.toFixed(0) + ')');
  console.log('  worst gap          : ' + (arrivals.length ? arrivals[arrivals.length - 1] : 0) + ' ms');
  console.log('  gaps over 150 ms   : ' + big + '   over 400 ms: ' + huge);
  console.log('  verdict            : ' + (huge > 0 ? 'LATE — bursts and stalls' :
    big > packets * 0.02 ? 'MARGINAL — some stalls' : 'clean'));

  console.log('\nTHEORY B - is the DATA wrong?');
  console.log('  decode failures    : ' + decodeFails + (decodeFails ? '   <-- every one is a LOST TICK' : ''));
  const oor = jumps.filter(j => j.why).length;
  console.log('  out-of-range posns : ' + oor + (oor ? '   <-- CORRUPTION, not lag' : ''));
  console.log('  jumps over 2.5 m   : ' + (jumps.length - oor) + '   (respawns are legitimate)');
  jumps.slice(0, 6).forEach(j => console.log('      slot ' + j.slot + '  ' +
    (j.why || j.dist.toFixed(1) + ' m')));
  console.log('  verdict            : ' + (decodeFails || oor ? 'WRONG — the payload is corrupt' : 'payload is sane'));

  console.log('\nWIRE (read off the transport, not the server\'s own count)');
  const tot = frames.reduce((a, f) => a + f.bytes, 0);
  const sizes = frames.map(f => f.bytes).sort((a, b) => a - b);
  console.log('  frames             : ' + frames.length);
  console.log('  total bytes        : ' + tot + '   (' + (tot / SECS).toFixed(0) + ' B/s)');
  console.log('  frame p50 / max    : ' + (sizes[(sizes.length / 2) | 0] || 0) + ' / ' + (sizes[sizes.length - 1] || 0) + ' B');
  const oversize = sizes.filter(n => n > 2000).length;
  console.log('  frames over 2 KB   : ' + oversize +
    (oversize ? '   <-- something is shipping far more than a snapshot' : ''));
  process.exit(0);
}, SECS * 1000 + 1500);
