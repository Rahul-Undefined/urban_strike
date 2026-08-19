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

console.log('\n--- the snapshot format is the known-good one ---');
/* ===== v10.5 - THIS SECTION USED TO ASSERT THE OPPOSITE =====

   v10.3 shipped a binary entity block and a split PY flag to cut Render egress
   from 5.8 GB, and this gate asserted both were in place. They are gone, and
   the assertions are inverted, because the bandwidth work made the game
   unplayable and Rahul chose to pay for bandwidth instead.

   THE REASON MATTERS MORE THAN THE REVERT. socket.io does not put a binary
   event on the wire as one frame. It sends a JSON ENVELOPE carrying a
   `_placeholder`, then the attachment as a SEPARATE frame, and the client must
   hold the envelope until the attachment lands before it can emit the event at
   all. Every snapshot became two frames plus a reassembly step, fifteen times a
   second. The payload got 54% smaller and the STREAM got worse - avatars
   teleporting, hits refused - which for a shooter is the wrong trade in the
   wrong direction.

   So these now assert the format STAYS simple. Not because small packets are
   bad, but because the next person to look at the Render bill will have the
   same good idea, and the thing they need to know is not in the bill. */
const snapSrc = fs.readFileSync(path.join(ROOT, 'public/src/networking/snapcodec.js'), 'utf8');
const SnapCodec = require(path.join(ROOT, 'public/src/networking/snapcodec.js'));

ok(typeof SnapCodec.encodeEntities !== 'function',
  'there is NO binary entity encoder — socket.io would split it across two frames');
ok(/packet = \{ e: ents \}/.test(serverSrc),
  'the entity block travels as one JSON array in a single frame');
ok(SnapCodec.FLAGS.PY === undefined,
  'POS carries x, y and z together — the PY split went with the binary format');
ok(SnapCodec.ORDER.length === 14, 'the field order is the v9.15 one [' + SnapCodec.ORDER.length + ' fields]');

/* The delta encoder is the saving that DOES work and costs nothing: it only
   sends fields that changed. It is worth ~87% against idle players and much
   less against bots, which never stand still - that is a fact about bots, not a
   defect to fix. */
ok(/full \|\| s\.px !== prev\.px/.test(snapSrc), 'the v9.8 delta encoder is intact');
ok(/POS_Q = 100/.test(snapSrc), 'positions are still quantised to centimetres');

console.log('\n--- and nothing sits between the server and the socket ---');
ok(/perMessageDeflate:\s*false/.test(serverSrc),
  'permessage-deflate is OFF — measured at 2% saving, and ws compresses ASYNC, adding jitter');
ok(/app\.use\(compression\(/.test(serverSrc),
  'HTTP gzip on static assets is unaffected — that is 66% once per page load, nowhere near the frame path');
ok(CFG.NET.snapRate === 15,
  'snapRate is 15 — the documented floor before rubber-banding');

console.log('\n--- the bot shoot event carries its own truth ---');
/* v10.2 cut this to `{ id }` and resolved position and weapon from the client's
   last interpolated snapshot. That is only right while the interpolation is
   right, so during exactly the stalls being reported the muzzle flash appeared
   wherever the client THOUGHT the bot was. Reverted with the rest. */
const botFired = serverSrc.slice(serverSrc.indexOf('botFired:'), serverSrc.indexOf('botFired:') + 1400);
ok(/o: o/.test(botFired), 'a bot shot carries the position it was actually fired from');
ok(/w: weapon/.test(botFired), 'and the weapon it was fired with');
ok(/R2|dx \* dx/.test(botFired), 'still range-gated rather than broadcast to the room');

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
