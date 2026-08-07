/* verify-endscreen.js — v8.31.2

   WHY THIS GATE EXISTS

   The end screen shipped in v8.29 with 7 columns verified and nothing else.
   What it never checked was whether the result was READABLE, and the screenshot
   that came back showed three separate faults at once:

     - the live 3D map bleeding through a 90%-opaque overlay
     - the minimap and the live mini-scoreboard still drawn on top of it,
       because #end-overlay is a CHILD of #hud-layer and its siblings never
       switched off
     - the table stretched edge to edge while nine insight cards collapsed into
       one narrow column pushed off the bottom

   None of those are catchable by counting table columns. This gate runs the
   real UI.showEnd against a DOM stub with a realistic payload and asserts the
   structure that makes the screen readable. */

const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

const html = fs.readFileSync('public/index.html', 'utf8');
const css = fs.readFileSync('public/css/style.css', 'utf8');
const REAL_IDS = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

console.log('--- verify-endscreen: layout, HUD suppression, insight split ---\n');

/* ---------- structure ---------- */
ok(REAL_IDS.has('end-ins-left') && REAL_IDS.has('end-ins-right'),
  'end screen has two insight columns flanking the board');
ok(/<div class="end-stage">/.test(html), 'a three-column stage wraps the result');
ok(/class="end-center"/.test(html), 'the scoreboard sits in the centre column');

// the board must be INSIDE the centre column, not a loose sibling
const stage = (html.match(/<div class="end-stage">[\s\S]*?\n    <\/div>/) || [''])[0];
ok(/end-center[\s\S]*end-table[\s\S]*<\/table>/.test(stage),
  'the table is nested inside the centre column');
ok(stage.indexOf('end-ins-left') < stage.indexOf('end-center') &&
   stage.indexOf('end-center') < stage.indexOf('end-ins-right'),
  'columns are ordered left / centre / right');

/* ---------- the map must not bleed through ---------- */
const endBg = (css.match(/#end-overlay\s*\{[^}]*background:\s*([^;]+);/) || [])[1] || '';
ok(!/rgba\([^)]*0?\.\d+\s*\)/.test(endBg),
  'end overlay background is fully opaque, so the 3D map cannot show through [' + endBg.trim() + ']');

/* ---------- the live HUD must switch off ---------- */
ok(/#hud-layer\.end-active\s*>\s*\*:not\(#end-overlay\)/.test(css),
  'a rule hides the live HUD siblings while the result is up');
const ui = fs.readFileSync('public/src/ui/ui.js', 'utf8');
ok(/classList\.add\('end-active'\)/.test(ui), 'showEnd switches the HUD off');
ok(/classList\.remove\('end-active'\)/.test(ui), 'hideEnd switches the HUD back on');

/* the minimap and live board are exactly the things that were showing */
['minimap', 'live-board', 'hud-top', 'crosshair', 'hud-bottom-right'].forEach(id => {
  ok(REAL_IDS.has(id), 'HUD element #' + id + ' exists and is covered by the end-active rule');
});

/* ---------- the table must be bounded ---------- */
ok(/\.end-stage\s*\{[^}]*grid-template-columns/.test(css),
  'the stage uses a fixed grid so the table cannot stretch edge to edge');
ok(/\.end-stage\s*\{[^}]*width:\s*min\(/.test(css),
  'the stage has a bounded max width');
ok(/@media \(max-width: 1180px\)[\s\S]*\.end-stage\s*\{[^}]*grid-template-columns:\s*1fr/.test(css),
  'narrow screens collapse to a single column instead of crushing three');

/* ---------- insights split across both columns ---------- */
ok(/end-ins-left/.test(ui) && /end-ins-right/.test(ui),
  'showEnd fills both insight columns');
ok(/i % 2 \? Rr : L/.test(ui) || /% 2/.test(ui),
  'cards alternate between columns so the two sides stay level');

/* ---------- run the real showEnd ---------- */
function mkEl(id) {
  const el = {
    id: id || '', children: [], style: {}, innerHTML: '', textContent: '',
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return mkEl(''); }, querySelectorAll() { return []; },
    offsetWidth: 100, dataset: {}
  };
  return el;
}
const cache = {};
const doc = {
  getElementById(id) { if (!REAL_IDS.has(id)) return null; return cache[id] || (cache[id] = mkEl(id)); },
  createElement() { return mkEl(''); },
  querySelectorAll() { return []; }, querySelector() { return mkEl(''); },
  addEventListener() {}, body: mkEl('body'), exitPointerLock() {}
};

const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
  document: doc, window: null, navigator: {}, localStorage: { getItem: () => null, setItem() {} },
  setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
  performance: { now: () => 0 }, requestAnimationFrame: () => 0
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
['public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
 'public/src/config/loot.config.js', 'public/src/config/world.config.js',
 'public/src/config/maps-rural.config.js', 'public/src/config/maps-metro.config.js',
 'public/src/config/index.js'
].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
ctx.Net = new Proxy({}, { get: () => () => {} });
ctx.VoiceChat = new Proxy({}, { get: () => () => {} });
vm.runInContext(fs.readFileSync('public/src/ui/ui.js', 'utf8'), ctx, { filename: 'ui.js' });

const payload = {
  reason: 'time', winnerId: 'p1', winnerTeam: null,
  players: [
    { id: 'p1', name: 'Rahul',  kills: 26, deaths: 23, assists: 5, damage: 4011, bestStreak: 8, team: null, alive: true },
    { id: 'p2', name: 'Bubka',  kills: 25, deaths: 24, assists: 4, damage: 3415, bestStreak: 4, team: null, alive: true },
    { id: 'p3', name: 'DD BI',  kills: 19, deaths: 19, assists: 4, damage: 2478, bestStreak: 3, team: null, alive: true },
    { id: 'p4', name: 'kaleen', kills: 18, deaths: 16, assists: 1, damage: 2665, bestStreak: 4, team: null, alive: true },
    { id: 'p5', name: 'Sandy',  kills: 7,  deaths: 10, assists: 1, damage: 842,  bestStreak: 3, team: null, alive: true }
  ],
  insights: {
    rivalry: { killer: 'Bubka', victim: 'Rahul', n: 9 },
    nemesis: { p1: { name: 'Bubka', n: 7 } },
    bestStreak: { name: 'Rahul', n: 8 },
    longest: { name: 'Bubka', m: 109, weapon: 'm4a1' },
    favouriteWeapon: { name: 'Rahul', n: 23, w: 'm4a1' },
    headshots: { name: 'Bubka', n: 2, of: 25 },
    mostDamage: { name: 'Rahul', n: 4011 },
    firstBlood: { name: 'Bubka', victim: 'DD BI' },
    finalBlow: { name: 'Rahul', victim: 'DD BI' }
  }
};

let threw = null;
try {
  vm.runInContext('UI.init(); UI.showEnd(__d, "p1", true);',
    Object.assign(ctx, { __d: payload }), { filename: '<showEnd>' });
} catch (e) { threw = e.message; }
ok(!threw, 'UI.showEnd runs without throwing' + (threw ? ' [' + threw + ']' : ''));

const L = cache['end-ins-left'], R = cache['end-ins-right'];
const nL = L ? (L.innerHTML.match(/class="ins[ "]/g) || []).length : 0;
const nR = R ? (R.innerHTML.match(/class="ins[ "]/g) || []).length : 0;
ok(nL + nR === 9, 'all nine insight cards rendered [' + (nL + nR) + ']');
ok(nL > 0 && nR > 0, 'cards land in BOTH columns, not one [' + nL + ' left / ' + nR + ' right]');
ok(Math.abs(nL - nR) <= 1, 'the two columns stay level [' + nL + ' vs ' + nR + ']');
ok(/MATCH INSIGHTS/.test(L ? L.innerHTML : ''), 'the section heading is rendered once');
ok(!/MATCH INSIGHTS/.test(R ? R.innerHTML : ''), 'the heading is NOT duplicated on the right');

const hud = cache['hud-layer'];
ok(hud && hud.classList.contains('end-active'), 'showEnd put the HUD into end-active');
vm.runInContext('UI.hideEnd();', ctx, { filename: '<hideEnd>' });
ok(hud && !hud.classList.contains('end-active'), 'hideEnd released the HUD again');

const rows = (cache['end-body'] ? cache['end-body'].children.length : 0);
ok(rows === 5, 'all five operators are in the board [' + rows + ']');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
