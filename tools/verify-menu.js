/* verify-menu.js — v10.12

   WHY THIS GATE EXISTS

   The welcome screen carried "3 THEATRES" and "25 WEAPONS" as literal text in
   index.html. Both were true when written and both were wrong by v10.11:
   killhouse and sunsetrow made it five maps, and the v10.9 cull retired four
   guns from loot. Nothing reported it, because a wrong number on a front page
   is not an error — it just quietly lies to the player about the game.

   That is the same class as the Kar98 and the visor: a fact stated in one
   place and changed in another. The counters are computed from CFG now, and
   this asserts they still are.

   It also asserts the showcase FAIL-SAFE, which matters more than the showcase
   does. showcase.js creates a second WebGL context. If that throws on Rahul's
   machine and the failure is not contained, the menu breaks — and every
   unplayed change behind the menu becomes untestable at once. The contract is:
   every entry point wrapped, and failure collapses the panel rather than
   propagating. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'public/src/ui/ui.js'), 'utf8');
const sc = fs.readFileSync(path.join(ROOT, 'public/src/ui/showcase.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/css/style.css'), 'utf8');
const game = fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

console.log('--- the menu states no fact it cannot recompute ---');
/* The counters must be driven from CFG. A literal that HAPPENS to be right
   today is the thing this gate exists to stop, so the test is that ui.js
   computes them — not that the markup currently reads the right number. */
ok(/els\['stat-maps'\][\s\S]{0,80}mapItems\(\)\.length/.test(ui),
  'the theatre count is computed from the map list');
ok(/els\['stat-weapons'\][\s\S]{0,400}WEAPON_ORDER\.filter/.test(ui),
  'the weapon count is computed from WEAPON_ORDER minus retired');
ok(/els\['brand-ver'\]/.test(ui) && /\/version/.test(ui),
  'the build number is fetched from /version, not typed');

const maps = Object.keys(CFG.MAPS).length;
const guns = CFG.WEAPON_ORDER.filter(w => {
  const it = CFG.LOOT_ITEMS['wpn_' + w];
  return !(it && it.retired);
}).length;
console.log('        computed today: ' + maps + ' maps, ' + guns + ' playable weapons');

/* Any *other* bare integer left in the stat strip is a future stale fact. */
const strip = (html.match(/<div class="menu-stats">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
const literals = (strip.match(/<b>\s*\d+\s*<\/b>/g) || []);
ok(literals.length <= 1,
  'at most one hardcoded number survives in the stat strip [' + literals.length +
  (literals.length ? ': ' + literals.join(' ') : '') + ']');

/* v10.12: sunsetrow shipped with DUPLICATE script tags — its config and its
   builder were both fetched, parsed and executed twice on every single load.
   It cost 7 KB gzipped and pushed first load past its budget, which is how it
   was found; the wasted parse and double module execution were free of charge
   and invisible.

   A duplicated <script> is not a syntax error and nothing else looks at it, so
   this is the only place it can be caught. */
console.log('\n--- no script is loaded twice ---');
{
  const srcs = (html.match(/<script src="([^"]+)"/g) || []).map(t => t.slice(13, -1));
  const seen = Object.create(null), dupes = [];
  srcs.forEach(u => { if (seen[u]) { if (dupes.indexOf(u) < 0) dupes.push(u); } seen[u] = 1; });
  ok(dupes.length === 0,
    srcs.length + ' script tags, none duplicated' +
    (dupes.length ? ' — REPEATED: ' + dupes.join(', ') : ''));
}

console.log('\n--- the showcase cannot take the menu down with it ---');
ok(/function fail\(/.test(sc), 'showcase has an explicit failure path');
['function start', 'function stop', 'function next', 'function frame'].forEach(fn => {
  const body = sc.slice(sc.indexOf(fn));
  const end = body.indexOf('\n  }');
  ok(/try\s*\{/.test(body.slice(0, end > 0 ? end : 800)),
    fn.replace('function ', '') + '() guards its body');
});
ok(/classList\.remove\('live'\)/.test(sc),
  'failure removes the live class, which is what collapses the panel');
ok(/\.showcase:not\(\.live\)\s*\{[^}]*height:\s*0/.test(css),
  'and the CSS collapses a non-live showcase to zero height');
ok(/WEBGL_lose_context/.test(sc),
  'stop() drops the WebGL context rather than only disposing the renderer');

console.log('\n--- the match never inherits the menu renderer ---');
/* Scoped to the onMatchStart body. A file-wide indexOf compared against the
   FIRST 'UI.setLoading(true)' in the file, which belongs to the context-lost
   handler hundreds of lines earlier — the test was wrong, not the code. */
const oms = game.slice(game.indexOf('function onMatchStart'));
const omsBody = oms.slice(0, oms.indexOf('UI.setLoading(false)'));
ok(omsBody.indexOf('Showcase.stop()') >= 0 &&
   omsBody.indexOf('Showcase.stop()') < omsBody.indexOf('UI.setLoading(true)'),
  'onMatchStart stops the showcase BEFORE the map build');
ok(/try\s*\{[^}]*Showcase\.stop\(\)/.test(game),
  'and does it inside a try — nothing in the match-start path may throw');
ok(/try\s*\{[^}]*Showcase\.(bindParallax|start)\(\)/.test(game),
  'boot starts it inside a try as well');

console.log('\n--- the parallax stays on the compositor ---');
/* The original backdrop comment sets this rule: transform/opacity only, so the
   menu never competes with the game's frame budget. Driving it from two CSS
   variables keeps it there; animating left/top from JS would not. */
ok(/setProperty\('--px'/.test(sc) && /setProperty\('--py'/.test(sc),
  'pointer parallax is written as CSS variables');
ok(/--px[\s\S]{0,400}translate3d/.test(css),
  'and consumed by a transform, not by layout properties');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
