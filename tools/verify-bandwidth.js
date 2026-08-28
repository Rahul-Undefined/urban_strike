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
/* ===== v10.6 - ASSET CACHING IS FORBIDDEN HERE =====

   v10.2 set `maxAge: '1h'` on express.static and excluded index.html so a
   deploy would still be picked up. That combination is worse than either
   choice on its own.

   This game ships as a CUMULATIVE UPLOAD, and index.html names ~35 script
   files by the same URLs every build. After a deploy the browser fetched the
   new index.html and then served the PREVIOUS BUILD'S JAVASCRIPT out of cache
   for up to an hour. A v10.3 client decoding a binary `d.b` entity block
   against a v10.5 server sending a JSON `d.e` one hits `if (!d.e) return;` on
   every snapshot: nothing renders, nothing errors, everything freezes.

   Asserted OFF. The only safe way to cache these assets is a build hash in
   every URL so a new build cannot collide with an old cache entry, and until
   that exists this must stay at zero. */
const staticCall = serverSrc.slice(iStat, iStat + 500);
ok(!/maxAge:\s*['"][0-9]/.test(staticCall) && !/maxAge:\s*[1-9]/.test(staticCall),
  'express.static sets NO positive maxAge — a cumulative upload cannot cache assets by name');
ok(/maxAge:\s*0/.test(staticCall), 'and says so explicitly rather than relying on the default');
/* Gzip is a different thing entirely: it compresses the response, caches
   nothing, and cannot produce a version mismatch. */
ok(/app\.use\(compression\(/.test(serverSrc), 'gzip is still on — it cannot cause a stale client');

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
/* ===== v10.14 — 340 -> 355 KB. A RATCHET RISING, WHICH THE HANDOFF SAYS
   SHOULD NOT HAPPEN, SO IT IS WRITTEN DOWN RATHER THAN QUIETLY EDITED. =====

   What was checked first, per the v10.12 lesson: is the gate pointing at waste
   or at content? Last time it was two duplicate <script> tags shipping a map
   twice and the answer was to delete them, not to raise this. This time:

     removed  Outbreak's HUD markup, its CSS block and its UI logic — dead the
              moment the mode came out, 2 KB gzipped
     removed  server/lib/zombies.js and tools/verify-outbreak.js (not first
              load, but gone)
     left     three new maps: freightyard, bazaar, substation

   After deleting everything dead, first load is 344 KB. The remaining 4 KB is
   three real maps, and a budget that can never rise is a budget that forbids
   content. Raised to 355 with 11 KB of headroom, which is roughly two more
   small maps and no more.

   THE REAL FIX, NOT DONE: every map builder ships to every player on every
   load, and exactly one of them is ever used in a match. Eight builders is
   ~90 KB raw of code that 7/8 of the time does nothing. Loading a map's
   builder on demand would take first load BELOW where it was three versions
   ago and make this budget stop being the thing that argues with new content.
   That is an architecture change and it deserves its own build.

   Bandwidth impact of this rise, stated plainly: 15,375 -> ~14,700 fresh loads
   per 5 GB. */
/* ===== v11.0 — 355 -> 375 KB. THE RISE IS FEATURES, STATED PLAINLY =====
   What the ~10 KB gzipped bought: the merged operations lobby + welcome
   redesign (markup/CSS/logic), the HUD compass, the reclaim flow, the
   operator hero, and the adaptive-delay netcode with its teaching comments —
   the house style ships its reasoning, and that is a deliberate cost. 20 KB
   grants ~10 KB of headroom, the same allowance the v10.14 rise left.
   Bandwidth impact: ~14,700 -> ~13,980 fresh loads per 5 GB. The real fix
   remains the one v10.14 names: per-map builder loading, its own build. */
/* ===== v13.0 — 375 -> 382 KB. THE RISE IS FEATURES, STATED PLAINLY =====
   What the 7 KB gzipped bought, itemized: the TPP boom module and the
   own-body drive (item 5, ~3.5 KB gz across tppcam.js + game.js), the score —
   welcome cue, menu bed, game bed (item 6, ~2.5 KB gz), and the marker
   remove/attribution verbs (item 7, ~1 KB gz). Raised BY the spend, exactly
   the v11 discipline above: the next feature argues for its own bytes, this
   line does not pre-pay for it.
   Bandwidth impact, stated plainly: ~13,970 -> ~13,700 fresh loads per 5 GB. */
/* ===== v14.0 — 382 -> 392 KB. THE RISE IS A GAME MODE, STATED PLAINLY =====
   Measured 391 gzipped. What the ~9 KB bought: botmode.config (5 weapons,
   Blacksite spawn/loot tables, difficulty ladders, wave plan), the Blacksite
   builder, the BOT MODE panel + wave banner (markup, css, ui logic), and the
   loot labels. One spare KB against gzip jitter, same margin every previous
   raise carried. The v10.14 note still names the real fix: per-map builder
   loading. */
const GZ_BUDGET_KB = 392;
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
/* socket.io leaves permessage-deflate OFF by default, and server.js is back to
   the v9.15 constructor which passes no such option - so absence is the correct
   state, not a missing setting. v10.3 turned it ON reasoning that quantised
   integers "compress well"; measured, it saves 2%, and `ws` compresses
   ASYNCHRONOUSLY on the threadpool, adding a scheduling round trip of jitter to
   every snapshot. Asserted absent so it is not switched on by plausible
   reasoning a second time. */
ok(!/perMessageDeflate:\s*(true|\{)/.test(serverSrc),
  'permessage-deflate is not enabled — 2% saving for real added jitter');
ok(/app\.use\(compression\(/.test(serverSrc),
  'HTTP gzip on static assets is unaffected — that is 66% once per page load, nowhere near the frame path');
ok(CFG.NET.snapRate === 15,
  'snapRate is 15 — the documented floor before rubber-banding');

console.log('\n--- bots do NOT broadcast gunfire ---');
/* ===== v10.7 - THIS ASSERTED THE OPPOSITE THREE VERSIONS RUNNING =====

   v10 made bots emit a 'shoot' event so they would stop firing invisibly, and
   this gate checked the payload was well formed. Nobody checked what RECEIVING
   it costs, and the cost is entirely on the client where no server-side meter
   can see it:

     AudioSys.shot()  10-15 Web Audio nodes per call
     World.rayHit()   a 140 m raycast through the collider grid
     FX.tracer/impact geometry and particles

   Nineteen bots fire ~25 times a second between them. Bot mode was asking for
   roughly 300 Web Audio nodes and 25 long raycasts every second on top of
   rendering, and every player froze for seconds while the main thread caught
   up - reported as "bots wala mode bahot laggy", entities stagnant then
   suddenly active.

   Asserted OFF, because the idea is a good one and somebody will have it again.
   The missing piece is a GLOBAL budget - a few events a second for the whole
   match, nearest-first, AUDIO ONLY, no raycast and no tracer - measured with a
   frame-time percentile on real hardware before it ships. */
ok(!/botFired/.test(serverSrc), 'the server does not broadcast bot gunfire');
const botsSrc = fs.readFileSync(path.join(ROOT, 'server/lib/bots.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
ok(!/botFired/.test(botsSrc), 'and bots.js does not call it');

console.log('\n--- nothing else was added to the per-frame client path ---');
/* The rule this whole section exists to protect: anything that runs once per
   remote EVENT lands on the client's main thread, and the main thread is what
   renders. A server-side meter cannot see any of it. */
const netSrc2 = fs.readFileSync(path.join(ROOT, 'public/src/networking/net.js'), 'utf8');
const shootHandler = netSrc2.slice(netSrc2.indexOf("socket.on('shoot'"), netSrc2.indexOf("socket.on('shoot'") + 900);
ok(/World\.rayHit/.test(shootHandler),
  'a HUMAN shot still gets its full tracer - that is a few events a second, not hundreds');

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
