/* verify-client — does the browser bundle actually LOAD?

   WHY THIS EXISTS

   Every other gate in this project reads the server, the config or the world
   geometry. Not one of them loads the client the way a browser does. The v9.2
   pass edited ui.js and minimap.js, and the only thing standing between a typo
   there and a blank screen was `node --check`, which proves a file PARSES and
   nothing else. A parse check would happily pass `CFG.botsAllowd(...)`.

   The specific risk this closes: client code calling a helper that exists in
   Node but not in the browser. The two entry points are different — Node
   `require()`s the config parts directly, the browser relies on each part
   registering itself into `__CFG_PARTS` through its UMD wrapper and on
   index.html listing it in the right ORDER. A config helper added to
   world.config.js reaches the browser only if that whole chain holds.

   So this loads every script index.html lists, in the order index.html lists
   them, into one shared global context, and then asserts that the objects the
   UI depends on came out the other side.

   It is NOT a rendering test. There is no DOM and no WebGL, so modules that
   need a canvas are exercised only as far as their top-level definition. That
   still catches the whole class of "the page is white and the console says
   undefined is not a function".

   Run: node tools/verify-client.js */

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

let THREE;
try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }

/* THE SCRIPT LIST IS READ FROM index.html, NOT TYPED HERE.
   A hardcoded copy is a second source of truth that drifts silently — and
   drifting script lists are already a documented failure in this project
   (verify-lifts carries the v8.9 note). If index.html gains a file, this gate
   loads it on the next run without anyone remembering to update it. */
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const scripts = (html.match(/src="([^"]+)"/g) || [])
  .map(s => s.slice(5, -1))
  .filter(s => !/^https?:/.test(s) && !/socket\.io/.test(s));

ok(scripts.length > 20, 'index.html lists the client bundle [' + scripts.length + ' files]');

/* A DOM stub broad enough for module top-level code. Anything that actually
   touches pixels is out of scope; anything that looks up an element or binds a
   listener at definition time must not throw. */
function fakeEl() {
  const el = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    children: [], value: '', textContent: '', innerHTML: '', disabled: false,
    width: 0, height: 0,
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, remove() {},
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    focus() {}, blur() {}, click() {}, insertBefore() {}, cloneNode: () => fakeEl(),
    getContext: () => new Proxy({}, { get: (t, k) => {
      if (k === 'canvas') return { width: 0, height: 0 };
      return function () {
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
          return { addColorStop() {} };
        if (k === 'measureText') return { width: 10 };
        if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    }, set: () => true })
  };
  return el;
}

const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
  isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  Float32Array, Uint32Array, Uint16Array, Uint8Array, Uint8ClampedArray, Int8Array,
  Set, Map, Promise, RegExp, THREE,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  setTimeout, setInterval, clearTimeout, clearInterval,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { href: 'http://localhost:3000/', search: '', hash: '', protocol: 'http:' },
  navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
  io: () => ({ on() {}, emit() {}, disconnect() {}, id: 'stub' }),
  alert() {}, prompt: () => null, confirm: () => true,
  /* window.addEventListener is bound at module top level by game.js. It is on
     the context object rather than inside `document` because `ctx.window` is
     the context itself. */
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  WebGLRenderingContext: function () {}
};
ctx.document = {
  createElement: () => fakeEl(), createElementNS: () => fakeEl(),
  getElementById: () => fakeEl(), querySelector: () => fakeEl(),
  querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  body: fakeEl(), documentElement: fakeEl(),
  exitPointerLock() {}, pointerLockElement: null, hidden: false
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
ctx.window.innerWidth = 1280; ctx.window.innerHeight = 720;
ctx.window.devicePixelRatio = 1;
vm.createContext(ctx);

console.log('--- loading the bundle in index.html order ---');
let loaded = 0, firstError = null;
for (const rel of scripts) {
  const file = path.join(ROOT, 'public', rel);
  if (!fs.existsSync(file)) {
    ok(false, 'index.html references a file that does not exist: ' + rel);
    continue;
  }
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
    loaded++;
  } catch (e) {
    if (!firstError) firstError = rel + ': ' + e.message;
    ok(false, 'loading ' + rel + ' threw: ' + e.message);
  }
}
ok(loaded === scripts.length,
  'every client script loaded without throwing [' + loaded + '/' + scripts.length + ']' +
  (firstError ? '  first error -> ' + firstError : ''));

console.log('\n--- the globals the page depends on ---');
[['CFG', 'config'], ['World', 'world builder'], ['Net', 'networking'],
 ['UI', 'lobby and HUD'], ['Minimap', 'map and radar'], ['PlayerCtl', 'player controller'],
 ['Weapons', 'weapon system'], ['Pickups', 'loot'], ['Avatars', 'remote models'],
 ['FX', 'effects'], ['AudioSys', 'audio']].forEach(([g, what]) => {
  ok(typeof ctx[g] !== 'undefined', g + ' is defined (' + what + ')');
});

console.log('\n--- config helpers reach the BROWSER, not just Node ---');
/* The v9.2 UI calls these. In Node they come from require(); in the browser
   they only exist if world.config.js registered into __CFG_PARTS and
   index.html loaded it before config/index.js. */
['botsAllowed', 'humanSideOf', 'botSideOf', 'activeTeams', 'modesInCat',
 'livesFor', 'isElimination'].forEach(fn => {
  ok(typeof ctx.CFG[fn] === 'function', 'CFG.' + fn + '() is callable in the browser');
});
['MODES', 'MODE_CATS', 'MAPS', 'TEAMS', 'WEAPONS', 'WEAPON_ORDER', 'THROWS',
 'GEAR', 'PLAYER', 'MOVE', 'MATCH', 'MINIMAP'].forEach(k => {
  ok(ctx.CFG[k] !== undefined, 'CFG.' + k + ' is present in the browser');
});

console.log('\n--- the v9.2 features are wired to real things ---');
/* v10.9: this asserted botsAllowed('co4') === true, which pinned the STATE of
   the bot switch rather than the RULE the v9.2 work introduced. Bots are off
   (world.config.js BOTS_ENABLED), so co4 is correctly not a bot mode now.

   The rule worth keeping is that the browser CFG can still tell a bot-fielding
   mode from a human one — the distinction lives in the `vsBots` / `practice`
   flags, which survive the switch. Testing those tests the classification;
   testing botsAllowed() tested whether bots happened to be enabled today. */
ok(ctx.CFG.MODES.co4.vsBots === true && !ctx.CFG.MODES.t5.vsBots,
  'the browser CFG classifies Strike Team and Team Battle correctly');
ok(ctx.CFG.botsAllowed('co4') === ctx.CFG.BOTS_ENABLED,
  'and botsAllowed() follows the bot switch [BOTS_ENABLED=' + ctx.CFG.BOTS_ENABLED + ']');
ok(typeof ctx.Net.getMatch === 'function',
  'Net.getMatch() exists — minimap.js reads the mode through it');
ok(ctx.Net.getMatch() && typeof ctx.Net.getMatch().mode === 'string',
  'Net.getMatch() returns a match object with a mode');
ok(typeof ctx.Minimap.toggleFull === 'function' && typeof ctx.Minimap.drawFull === 'function',
  'the full map is still exposed by the minimap module');

/* Every mode the picker can offer must resolve to a real category, or the
   lobby dropdown renders an empty variant list and the mode cannot be chosen.

   v10.9: was "every mode in MODES", which is not the rule — it is the rule as
   it happened to look when every mode was selectable. `hidden` modes exist on
   purpose now (the seven bot modes, and t10 which duplicates t8 under the
   15-player cap) and a hidden mode having no visible category is CORRECT.
   Narrowed to the selectable set, which is what "the picker can offer" always
   meant, and paired with the inverse so hiding cannot silently orphan
   something that is still reachable. */
const catIds = ctx.CFG.MODE_CATS.map(c => c.id);
const selectable = Object.keys(ctx.CFG.MODES).filter(m => !ctx.CFG.MODES[m].hidden);
ok(selectable.length > 0, 'at least one mode is selectable [' + selectable.length + ']');
selectable.forEach(m => {
  ok(catIds.indexOf(ctx.CFG.MODES[m].cat) >= 0,
    'mode ' + m + ' resolves to a category the picker shows');
});
Object.keys(ctx.CFG.MODES).filter(m => ctx.CFG.MODES[m].hidden).forEach(m => {
  ok(ctx.CFG.modesInCat(ctx.CFG.MODES[m].cat).indexOf(m) === -1,
    'hidden mode ' + m + ' is absent from its category listing');
});
catIds.forEach(c => ok(ctx.CFG.modesInCat(c).length > 0,
  'category ' + c + ' has at least one selectable variant'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
