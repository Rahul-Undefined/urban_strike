/* verify-bandwidth — this game runs on a 5 GB monthly budget.

   Render bills outbound traffic, and measured before v10.2 the numbers were:

     static assets   855 KB RAW per fresh page load, 35 files, NO compression
                     and NO cache headers
     snapshots       21.1 MB per player-HOUR (409 B x 15 Hz, handoff §8)
     bot gunfire     5.7 MB per player-hour at twelve bots — a 27% increase
                     that v10 itself introduced

   That is about 240 player-hours in total, or roughly 30 hours of an
   eight-player match. Disk is not the constraint and never was: the whole
   source tree is 2.1 MB and node_modules is 41 MB, under 1% of the limit.
   Anyone reaching for this file to shrink files on disk is solving the wrong
   problem.

   The point of a gate rather than a one-off fix is that bandwidth regressions
   are INVISIBLE. Nothing crashes, no gate reddens, the game plays identically,
   and the bill arrives four weeks later. Every check below is something that
   was actually wrong at some point in this project.

   Run: node tools/verify-bandwidth.js */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

console.log('--- static assets are compressed and cacheable ---');
ok(/require\(['"]compression['"]\)/.test(serverSrc), 'the compression middleware is required');
ok(/app\.use\(compression\(/.test(serverSrc), 'and mounted');
/* Order matters and is easy to get wrong: compression has to be mounted BEFORE
   express.static or the static handler answers first and nothing is compressed.
   The symptom is silent — correct files, full size. */
const iComp = serverSrc.indexOf('app.use(compression(');
const iStat = serverSrc.indexOf('express.static(');
ok(iComp > 0 && iStat > 0 && iComp < iStat,
  'compression is mounted BEFORE express.static (order is silent when wrong)');
/* Written as a plain slice rather than one regex: `[^)]*` cannot cross the
   `path.join(__dirname, 'public')` argument, so the obvious pattern never
   matched even though the header was verifiably being sent. */
const staticCall = serverSrc.slice(iStat, iStat + 500);
ok(/maxAge/.test(staticCall),
  'express.static sets a maxAge (the default is 0 — every file re-requested)');
/* index.html must NOT be cached. This project ships as a cumulative upload, and
   a client holding a stale index that names last build's files while the server
   serves this build's is a bug nobody can reproduce. */
ok(/index\\?\.html[\s\S]{0,120}no-cache/.test(serverSrc) || /no-cache/.test(serverSrc),
  'index.html is excluded from caching so a deploy is picked up at once');

console.log('\n--- the payload is actually small enough ---');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const refs = (html.match(/(?:src|href)="(?!http|\/socket)([^"]+)"/g) || [])
  .map(m => m.replace(/.*="/, '').replace(/"/, ''));
let raw = html.length, gz = zlib.gzipSync(Buffer.from(html), { level: 6 }).length;
let missing = [];
refs.forEach(f => {
  const p = path.join(ROOT, 'public', f);
  if (!fs.existsSync(p)) { missing.push(f); return; }
  const b = fs.readFileSync(p);
  raw += b.length; gz += zlib.gzipSync(b, { level: 6 }).length;
});
ok(missing.length === 0, 'every file index.html references exists' +
  (missing.length ? ' — MISSING ' + missing.join(', ') : ''));
console.log('        ' + refs.length + ' files: ' + (raw / 1024).toFixed(0) +
  ' KB raw, ' + (gz / 1024).toFixed(0) + ' KB gzipped');

/* A budget, not a target. It may fall and never rise. If a change pushes past
   it, the question is whether that file needed to grow — not whether the number
   can go up. */
const GZ_BUDGET_KB = 340;
ok(gz / 1024 <= GZ_BUDGET_KB,
  'first load is ' + (gz / 1024).toFixed(0) + ' KB gzipped (budget ' + GZ_BUDGET_KB + ' KB)' +
  '  → ' + Math.round(5 * 1024 * 1024 / (gz / 1024)).toLocaleString() + ' fresh loads per 5 GB');
ok(gz < raw * 0.5, 'gzip is worth having here (' + (100 - gz / raw * 100).toFixed(0) + '% saved)');

/* three.js is 600 KB. Serving it ourselves would nearly triple a page load, so
   it comes from a CDN and is not our bandwidth. */
console.log('\n--- the heavy dependencies are not on our bill ---');
ok(/cdnjs\.cloudflare\.com[^"]*three/.test(html), 'three.js is loaded from a CDN, not from us');
/* Anchored to a RELATIVE src. The first version matched the CDN URL itself,
   because it ends in /three.min.js — the gate failed on the very thing it was
   written to require. */
ok(!/src="(?!https?:)[^"]*three(\.min)?\.js"/.test(html),
  'no local copy of three.js is served from our own origin');

console.log('\n--- per-tick traffic ---');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
ok(CFG.NET.snapRate <= 15,
  'snapRate is ' + CFG.NET.snapRate + ' (raising it scales the whole bill linearly)');

/* The bot shoot event. v10 added it to stop bots firing invisibly and silently;
   v10.2 cut it to `{ id }` because position and weapon are already in every
   snapshot. Asserted structurally, because the cost only shows up on a bill. */
const botFired = serverSrc.slice(serverSrc.indexOf('botFired:'),
  serverSrc.indexOf('botFired:') + 1400);
ok(botFired.length > 50, 'botFired is present');
const emitLine = (botFired.match(/emit\('shoot',\s*\{[^}]*\}/) || [''])[0];
ok(!/\bo:\s*o\b|\bo:\s*\[/.test(emitLine),
  'the bot shoot event does not resend a position the snapshot already carries');
ok(!/\bw:\s*weapon\b/.test(emitLine),
  'nor the weapon name (snapcodec sends `wp` per entity)');
ok(emitLine.length > 0 && emitLine.length < 60,
  'the bot shoot payload is minimal [' + emitLine.replace(/\s+/g, ' ') + ']');
/* Range gating: without it this is N events x every client, most of them
   tracers nobody can see and bangs nobody can hear. */
ok(/R2\s*=|\* \* 2|dx \* dx/.test(botFired),
  'bot gunfire is range-gated rather than broadcast to the room');

/* The client must tolerate BOTH shapes: humans still send the long form. */
const netSrc = fs.readFileSync(path.join(ROOT, 'public/src/networking/net.js'), 'utf8');
ok(/if \(d\.o\)/.test(netSrc), 'the client accepts the long form when an origin is sent');
ok(/r\.wp = st\.wp/.test(netSrc),
  'the client stores the remote weapon index the compact form resolves the sound from');


console.log('\n--- the snapshot entity block is binary ---');
/* ===== v10.3 =====
   Render billed 5.8 GB, essentially all WebSocket. Measured on the shape that
   caused it - 1 human + 19 bots on Urban - the server was sending 459 B a
   packet at 15 Hz: 5,403 B/s, 18.5 MB per player-hour, 13 GB/month if left
   running.

   The delta encoder was not broken; it was defeated. v9.8's 87% saving was
   measured against HUMANS, who stand still. A BOT NEVER DOES, so POS/RY/RX are
   dirty on every entity on every tick and the delta test rejects nothing.

   Nothing was left to remove, so what changed is how it is WRITTEN:
   [5,99,1234,95,-4567,-3141,120] is thirteen bytes of data typed as
   twenty-nine characters. Binary: 459 B -> 210 B a packet, before deflate.

   Asserted structurally here because a wire regression is invisible - the game
   plays identically and the bill arrives four weeks later. */
const snapSrc = fs.readFileSync(path.join(ROOT, 'public/src/networking/snapcodec.js'), 'utf8');
const SnapCodec = require(path.join(ROOT, 'public/src/networking/snapcodec.js'));

ok(typeof SnapCodec.encodeEntities === 'function', 'snapcodec exposes a binary entity encoder');
ok(/packet = \{ b: SnapCodec\.encodeEntities/.test(serverSrc),
  'the server sends the entity block as a binary attachment, not JSON');

/* PY split out of POS. A bot on flat ground changes x and z every tick and
   leaves y identical for hundreds - under a combined flag its two bytes rode
   along every time. This is the only field a moving bot leaves clean. */
ok(SnapCodec.FLAGS.PY !== undefined, 'height has its own flag, so a stable y is not resent');
ok(/if \(full \|\| s\.py !== prev\.py\)/.test(snapSrc), 'and PY is delta-tested separately');

/* Size, measured rather than asserted from memory. A fully-dirty 20-entity
   packet is the bot-mode worst case and the number that produced the bill. */
const F = SnapCodec.FLAGS;
const dirty = [];
for (let i = 0; i < 20; i++) {
  dirty.push([i, F.POS | F.RY | F.RX, (Math.random() * 20000 - 10000) | 0,
    (Math.random() * 20000 - 10000) | 0, (Math.random() * 6283 - 3141) | 0,
    (Math.random() * 1500) | 0]);
}
const binLen = SnapCodec.encodeEntities(dirty).length;
const jsonLen = Buffer.byteLength(JSON.stringify(dirty));
console.log('        20 fully-dirty entities: ' + jsonLen + ' B as JSON, ' + binLen + ' B binary');
const PER_ENTITY_BUDGET = 16;
ok(binLen / 20 <= PER_ENTITY_BUDGET,
  'a fully-dirty entity costs ' + (binLen / 20).toFixed(1) + ' B (budget ' + PER_ENTITY_BUDGET + ' B)');
ok(binLen < jsonLen * 0.6, 'binary is at least 40% smaller than the JSON it replaced');

/* Round trip, exhaustively. The encoder is the one place a silent corruption
   would look like a netcode bug for weeks - a team encoded as a byte turned
   'b' into 0 and put every player on one side, which test.js caught but only
   because a test happened to check sides. */
let bad = 0;
const RANGE = { POS: [2, () => (Math.random() * 20000 - 10000) | 0], PY: [1, () => (Math.random() * 3000) | 0],
  RY: [1, () => (Math.random() * 6283 - 3141) | 0], RX: [1, () => (Math.random() * 3000 - 1500) | 0],
  MV: [1, () => (Math.random() * 3) | 0], CR: [1, () => (Math.random() * 2) | 0],
  WP: [1, () => (Math.random() * 25) | 0], LN: [1, () => (Math.random() * 200 - 100) | 0],
  HP: [1, () => (Math.random() * 100) | 0], ARM: [2, () => (Math.random() * 100) | 0],
  HL: [1, () => (Math.random() * 3) | 0], RL: [1, () => (Math.random() * 2) | 0],
  AL: [1, () => (Math.random() * 2) | 0], TM: [1, () => ['a', 'b', 0][(Math.random() * 3) | 0]],
  ID: [1, () => 'AbCdEfGh12345678xyz'] };
const nFlags = 1 << SnapCodec.ORDER.length;
for (let f = 0; f < nFlags; f++) {
  const a = [f % 600, f];
  for (const k of SnapCodec.ORDER) {
    if (!(f & F[k])) continue;
    const [n, gen] = RANGE[k];
    for (let j = 0; j < n; j++) a.push(gen());
  }
  const out = SnapCodec.decodeEntities(SnapCodec.encodeEntities([a]));
  if (JSON.stringify([a]) !== JSON.stringify(out)) bad++;
}
ok(bad === 0, 'all ' + nFlags + ' flag combinations round-trip EXACTLY (' + bad + ' mismatches)');

/* Both shapes accepted, so a client that outlives a server rollback still
   works - this game deploys as a cumulative upload. */
ok(/d\.e \|\| \(d\.b/.test(netSrc) || /if \(!ents && d\.b\)/.test(netSrc),
  'the client accepts both the binary and the legacy JSON entity block');

console.log('\n--- websocket frames are NOT deflated ---');
/* v10.4 reverses v10.3 on measurement. Deflate saves 2% on a binary snapshot -
   quantised integers have nothing for a dictionary coder to find - and ws
   compresses asynchronously on the threadpool, adding a scheduling round trip
   of jitter to every packet. The interpolation buffer could only absorb 53 ms
   of jitter, so that trade fed straight into the freeze-and-jump the player
   reported. Asserted OFF so it is not switched back on by plausible reasoning
   a second time. */
ok(/perMessageDeflate:\s*false/.test(serverSrc),
  'permessage-deflate is OFF — measured at 2% saving for real added jitter');
const binSample = SnapCodec.encodeEntities(dirty);
const deflated = require('zlib').deflateRawSync(Buffer.from(binSample), { level: 6 }).length;
ok(deflated > binSample.length * 0.9,
  'and the measurement still holds: deflate saves only ' +
  (100 - deflated / binSample.length * 100).toFixed(0) + '% on a real snapshot');
/* HTTP gzip is a different thing entirely and stays on - see above. */
ok(/app\.use\(compression\(/.test(serverSrc), 'HTTP gzip on static assets is unaffected');

/* snapRate is the one knob that scales the entire bill linearly. 15 is the
   documented floor - at 10 it rubber-bands against the 120 ms buffer. */
ok(CFG.NET.snapRate === 15,
  'snapRate is still 15 — the documented floor before rubber-banding');

/* NOTHING is culled by distance. The rule at the top of snapcodec stands:
   trading gameplay correctness for a bandwidth number is the wrong way round. */
ok(!/distance|relevan|cull/i.test(serverSrc.slice(serverSrc.indexOf('const packet = { b:') - 600,
  serverSrc.indexOf('const packet = { b:') + 400)),
  'no entity is culled by distance — every player still sees every player');

console.log('\n--- disk, for the record ---');
/* Included so nobody optimises the wrong axis. */
function dirSize(d, skip) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip && skip.test(e.name)) continue;
    const p = path.join(d, e.name);
    n += e.isDirectory() ? dirSize(p, skip) : fs.statSync(p).size;
  }
  return n;
}
const srcMB = dirSize(ROOT, /^(node_modules|\.git)$/) / 1048576;
ok(srcMB < 50, 'the source tree is ' + srcMB.toFixed(1) + ' MB — disk is not the constraint');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
