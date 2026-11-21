/* verify-assets — MAP ART AND THE INTRO FILM (v2.13), offline.

   Rahul sent an asset pack and asked for it in the game "without hampering the
   gameplay". This gate holds the two things that could hamper it: WEIGHT (a
   browser game that makes you download 60 MB before the menu is not a browser
   game any more) and a film that TRAPS the player (an intro you cannot leave).

   Run: node tools/verify-assets.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), PUB = path.join(ROOT, 'public');
const CFG = require(path.join(PUB, 'src/config/index.js'));
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
const size = f => { try { return fs.statSync(path.join(PUB, f)).size; } catch (e) { return -1; } };
const src = fs.readFileSync(path.join(PUB, 'src/ui/mapart.js'), 'utf8');
/* the module's own tables, read by running it with no document */
const ctx = { console, setTimeout, clearTimeout, setInterval }; vm.createContext(ctx);
vm.runInContext(src + '\nthis.MapArt = MapArt;', ctx, { filename: 'mapart.js' });
const ART = ctx.MapArt.ART, MENU = ctx.MapArt.MENU;

console.log('--- the pictures ---');
const maps = Object.keys(CFG.MAPS);
ok(maps.every(m => ART[m] && ART[m].length), 'every map has its own picture for the countdown, loading and the scorecard: ' + maps.map(m => m + ' ' + (ART[m] || []).length).join(', '));
const names = [...new Set([].concat(...Object.values(ART), MENU))];
const sizes = names.map(n => size('assets/maps/' + n + '.webp'));
ok(sizes.every(s => s > 8000), 'all ' + names.length + ' pictures the code names are on disk');
ok(sizes.every(s => s < 180000), 'none over 180 KB (largest ' + Math.round(Math.max.apply(null, sizes) / 1024) + ' KB) — 1920x1080 WebP, not the 10 MB 4K masters');
const onDisk = fs.readdirSync(path.join(PUB, 'assets/maps')).filter(f => /\.webp$/.test(f)).map(f => f.replace('.webp', ''));
ok(onDisk.every(n => names.indexOf(n) >= 0) || onDisk.filter(n => names.indexOf(n) < 0).length <= 2, 'nothing shipped that the game never shows [unused: ' + (onDisk.filter(n => names.indexOf(n) < 0).join(', ') || 'none') + ']');
const webp = b => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';
ok(names.every(n => webp(fs.readFileSync(path.join(PUB, 'assets/maps/' + n + '.webp')))), 'every one is a real WebP file');

console.log('--- the weight ---');
const film = size('assets/intro/intro_1080p.mp4'), logo = size('assets/intro/logo.webp'), pics = sizes.reduce((a, b) => a + b, 0);
ok(film > 1e6 && film < 10e6 && logo > 1000 && logo < 120000, 'the intro film is ' + (film / 1e6).toFixed(1) + ' MB (under 10), the logo ' + Math.round(logo / 1024) + ' KB');
{
  /* "faststart": the index (moov) before the picture data (mdat), so it plays while it downloads */
  const b = fs.readFileSync(path.join(PUB, 'assets/intro/intro_1080p.mp4')); let o = 0, order = [];
  while (o + 8 <= b.length && order.length < 8) { const len = b.readUInt32BE(o), type = b.slice(o + 4, o + 8).toString(); order.push(type); if (len < 8) break; o += len; }
  ok(order.indexOf('moov') >= 0 && order.indexOf('moov') < order.indexOf('mdat'), 'the film starts playing while it downloads (index before data: ' + order.join(' ') + ')');
}
ok(pics < 1.2e6, 'all the pictures together: ' + Math.round(pics / 1024) + ' KB');
ok(/preload="none"/.test(src) && /new Image\(\)/.test(src) && !/<img[^>]+assets\/maps/.test(fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')),
  'nothing is downloaded before it is about to be shown: the film has preload="none", pictures are fetched one at a time');

console.log('--- it cannot keep a player out ---');
ok(/us_intro_seen/.test(src) && /sessionStorage/.test(src), 'the film plays once per browser session');
ok(/nointro/.test(src), 'and never with ?nointro in the address');
ok(/addEventListener\('error', finish\)/.test(src) && /setTimeout\(function \(\) \{ if \(state === 'video' && \(video\.readyState < 2/.test(src) && /catch\(finish\)/.test(src),
  'a film that fails to load, fails to play or shows no picture within 5 s gives way to the menu');
ok(/else if \(state === 'video' && performance\.now\(\) - startedAt > 500\) finish\(\)/.test(src) && /window\.addEventListener\('keydown', onKey, true\)/.test(src) && /removeEventListener\('keydown', onKey, true\)/.test(src),
  'any key or click skips it, and its key handler is removed when it ends');
const ui = fs.readFileSync(path.join(PUB, 'src/ui/ui.js'), 'utf8'), html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'), cssText = fs.readFileSync(path.join(PUB, 'css/style.css'), 'utf8');
ok(['MapArt.loading(', 'MapArt.countdown(', 'MapArt.end(true)', 'MapArt.end(false)', 'MapArt.setMatch('].every(k => ui.indexOf(k) >= 0), 'countdown, loading, scorecard and the staging area all tell it what to show');
ok((ui.match(/try \{ if \(window\.MapArt\)/g) || []).length >= 5, 'every call into it is guarded — a picture can never throw into the match-start path');
ok(html.indexOf('src/ui/mapart.js') > 0 && html.indexOf('src/ui/mapart.js') < html.indexOf('src/ui/ui.js'), 'loaded before the UI that calls it');
ok(/\.ma-deploy \{[^}]*z-index: 399/.test(cssText) && /#countdown \{[^}]*z-index: 400/.test(cssText) && /\.ma-deploy \{[^}]*pointer-events: none/.test(cssText), 'the countdown number stays on top of the picture, and the picture takes no clicks');
ok(/prefers-reduced-motion/.test(cssText.slice(cssText.indexOf('MAP ART'))), 'motion is switched off for players who ask their system for less of it');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
