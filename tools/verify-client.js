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
/* v2.16: only <script> tags. The page now has an <img src> of its own (the
   boot cover's mark) and the bare src="..." pattern tried to run a .webp. */
const scripts = (html.match(/<script\b[^>]*\ssrc="([^"]+)"/g) || [])
  .map(s => s.replace(/^.*\ssrc="/, '').slice(0, -1))
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
/* v1.0d: botsAllowed / humanSideOf / botSideOf left with Bot Mode. */
['activeTeams', 'modesInCat', 'livesFor', 'isElimination', 'isArena', 'respawnDelayFor',
 'spawnProtectFor'].forEach(fn => {
  ok(typeof ctx.CFG[fn] === 'function', 'CFG.' + fn + '() is callable in the browser');
});
['MODES', 'MODE_CATS', 'MAPS', 'TEAMS', 'WEAPONS', 'WEAPON_ORDER', 'THROWS',
 'GEAR', 'PLAYER', 'MOVE', 'MATCH', 'MINIMAP'].forEach(k => {
  ok(ctx.CFG[k] !== undefined, 'CFG.' + k + ' is present in the browser');
});

console.log('\n--- the v9.2 features are wired to real things ---');
/* v1.0d: the bot-fielding classification is gone with Bot Mode — what the
   browser CFG must now say is that NO mode fields bots, and that the helpers
   Bot Mode owned are absent rather than stubbed. */
ok(Object.keys(ctx.CFG.MODES).every(m => !ctx.CFG.MODES[m].vsBots && !ctx.CFG.MODES[m].practice && !ctx.CFG.MODES[m].botmode),
  'the browser CFG classifies every mode as human-only');
ok(ctx.CFG.botsAllowed === undefined && ctx.CFG.BOTS_ENABLED === undefined,
  'and carries no bot switch or predicate to flip back on');
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
  /* v1.0d: Bot Mode's separate front door is GONE, and must stay gone. */
  (function () {
    var uiSrc, htmlSrc;
    try {
      uiSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'public/src/ui/ui.js'), 'utf8');
      htmlSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
    } catch (e) { uiSrc = ''; htmlSrc = ''; }
    ok(htmlSrc.indexOf('id="btn-botmode"') === -1 && htmlSrc.indexOf('id="botmode-panel"') === -1,
      'no BOT MODE door on the welcome screen (removed v1.0d at Rahul\'s request)');
    ok(!/data-v="bm_/.test(htmlSrc) && !/blacksite/.test(htmlSrc) && !/botmode\.config/.test(htmlSrc),
      'no bot-mode panel, Blacksite reference or botmode config script in index.html');
    ok(uiSrc.indexOf("map: 'blacksite'") === -1 && uiSrc.indexOf('bmSel') === -1,
      'ui.js carries no bot-mode launcher');
  })();

Object.keys(ctx.CFG.MODES).filter(m => ctx.CFG.MODES[m].hidden).forEach(m => {
  ok(ctx.CFG.modesInCat(ctx.CFG.MODES[m].cat).indexOf(m) === -1,
    'hidden mode ' + m + ' is absent from its category listing');
});
catIds.forEach(c => ok(ctx.CFG.modesInCat(c).length > 0,
  'category ' + c + ' has at least one selectable variant'));


/* ===== v2.16.1 - PULL THE TRIGGER =====
   v2.16.0 shipped with a gun that could not fire. tryFire() passed `aiming` to
   the new recoil — a name that exists in update() and fireHitscan() and not in
   tryFire(). Every trigger pull threw AFTER the magazine went down and BEFORE
   the round left; the game's frame loop catches a step's exception and logs
   it, so the page showed no error at all. Rahul found it in a minute of play.

   No gate ran the firing path. They load the bundle (above), lift single
   functions out (verify-hitbox) or simulate a block in isolation (verify-v216
   did exactly that to the recoil springs — in isolation it was perfect). So
   this section does the plain thing: with every script loaded, it gives the
   player each weapon in the table and pulls the trigger, hip and sighted, and
   steps the frames after. Anything that throws anywhere in that path fails
   here, with the weapon and the line.

   The HUD is a stub (this is the weapon system's path, not the DOM's) and the
   world is empty: a round that hits nothing must still be a round. */
console.log('\n--- every weapon fires when the trigger is pulled ---');
{
  let clock = 5e6; ctx.performance.now = () => clock;
  const run = (code) => vm.runInContext(code, ctx, { filename: 'trigger-pull' });
  let ready = false;
  try {
    run(`
      var __cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 500), __sc = new THREE.Scene(); __sc.add(__cam);
      UI = new Proxy({}, { get: function () { return function () { return 0; }; } });
      var __sent = { shoot: 0, hit: 0 };
      Net.sendShoot = function () { __sent.shoot++; }; Net.sendHit = function () { __sent.hit++; };
      FX.init(__sc, __cam); Weapons.init(__cam, __sc); PlayerCtl.alive = true;
    `);
    ready = true;
  } catch (e) { ok(false, 'the weapon system starts with the bundle loaded — ' + e.message); }
  if (ready) {
    const order = ctx.CFG.WEAPON_ORDER, W = ctx.CFG.WEAPONS, threw = [], silent = [];
    let fired = 0;
    order.forEach((n) => {
      ['hip', 'sights'].forEach((how) => {
        try {
          run('Weapons.applyGrant({ t: "weapon", w: "' + n + '" }); Input.aim = ' + (how === 'sights') + ';');
          clock += 3000; run('Weapons.update(0.016);'); clock += 16;
          const before = run('__sent.shoot');
          run('Weapons.setTrigger(true); Weapons.update(0.016);'); clock += 16;
          run('Weapons.setTrigger(false);');
          for (let f = 0; f < 12; f++) { run('Weapons.update(0.016); FX.update(0.016);'); clock += 16; }   // the recoil settling, the flash dying
          const after = run('__sent.shoot');
          if (['auto', 'semi', 'bolt'].indexOf(W[n].type) >= 0) { if (after > before) fired++; else silent.push(n + ' (' + how + ')'); }
        } catch (e) { threw.push(n + ' (' + how + '): ' + e.message + ' @' + String(e.stack || '').split('\n')[1].trim().replace(/^at /, '').slice(0, 70)); }
      });
    });
    run('Input.aim = false;');
    const guns = order.filter(n => ['auto', 'semi', 'bolt'].indexOf(W[n].type) >= 0).length;
    ok(threw.length === 0, 'all ' + order.length + ' weapons take a trigger pull, from the hip and through the sights, without throwing' + (threw.length ? ' — ' + threw.slice(0, 4).join(' | ') : ''));
    ok(silent.length === 0 && fired === guns * 2, 'and every firearm actually sends its round to the server: ' + fired + ' of ' + guns * 2 + ' pulls' + (silent.length ? ' — NOTHING LEFT: ' + silent.slice(0, 6).join(', ') : ''));
  }
}

/* ===== v2.17 - A GRENADE FROM A SEAT, AND THE BOT OPS BELT =====
   Rahul: "player cannot throw bombs from inside the car" and "Only in bot
   mode, bombs should be 8 at once and 10 mines". Same harness, same reason as
   above: the throw is run, not read. From a seat the camera is the chase
   camera — metres behind and above — so the two things that can go wrong are
   a grenade that starts at the lens, and one that forgets the car is moving. */
console.log('\n--- a grenade thrown from a vehicle seat; the Bot Ops belt ---');
{
  let clock = 9e6; ctx.performance.now = () => clock;
  const run = (code) => vm.runInContext(code, ctx, { filename: 'seat-throw' });
  try {
    run(`
      var __hud = { frag: -1, mines: -1 }, __throws = [];
      UI = new Proxy({ setWeapon: function (l, m, r, t) { __hud.frag = t.frag; __hud.flash = t.flash; }, setGear: function (m) { __hud.mines = m; } }, { get: function (t, k) { return t[k] || function () { return 0; }; } });
      Net.sendThrow = function (d) { __throws.push(d); };
      var __mode = 'ffa'; Net.getMatch = function () { return { mode: __mode }; };
      PlayerCtl.alive = true; PlayerCtl.pos.set(40, 1.4, -30); PlayerCtl.vel.set(0, 0, 0);
      __cam.position.set(34, 4.6, -24); __cam.lookAt(60, 2, -50); __cam.updateMatrixWorld(true);
      var __dir = __cam.getWorldDirection(new THREE.Vector3());
      Weapons.matchReset(); Weapons.resetLoadout();
    `);
    /* the mine number reaches the HUD with the next full refresh (in a match the server's spawn message sets it) — a smoke thrown does one */
    const belt = (mode) => { run('__mode = "' + mode + '"; Weapons.matchReset(); Weapons.resetLoadout(); Weapons.throwGrenade("smoke");'); clock += 400; return [run('__hud.frag'), run('__hud.mines')]; };
    const base = belt('ffa'); run('__throws.length = 0;');
    const foot = base[0], footMines = base[1];
    /* on foot: from the eye, as always */
    run('Weapons.throwGrenade("molotov");'); clock += 400;
    const t0 = run('__throws[0]'), cam = run('[__cam.position.x, __cam.position.y, __cam.position.z]'), dir = run('[__dir.x, __dir.y, __dir.z]'), pos = [40, 1.4, -30];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    ok(t0 && t0.type === 'molotov' && dist(t0.o, cam) < 0.01, 'on foot a throw leaves from the eye, as before');
    /* seated: a sedan at 16 m/s, heading 0.7 rad */
    run('var __ridden = Vehicles.ridden; Vehicles.ridden = function () { return { ry: 0.7, sp: 16, type: "car" }; };');
    run('Weapons.throwGrenade("flash");'); clock += 400;
    const t1 = run('__throws[1]'), tv = ctx.CFG.THROWS.flash.throwVel;
    ok(t1 && dist(t1.o, pos) < 2.0 && dist(t1.o, cam) > 5, 'from a seat it leaves from the RIDER — ' + (t1 ? dist(t1.o, pos).toFixed(1) : '?') + ' m from them, ' + (t1 ? dist(t1.o, cam).toFixed(1) : '?') + ' m from the chase camera');
    const want = [dir[0] * tv + Math.sin(0.7) * 16, dir[1] * tv + 2.6, dir[2] * tv - Math.cos(0.7) * 16];
    ok(t1 && dist(t1.v, want) < 0.01, 'and carries the car\'s 16 m/s with it [' + (t1 ? t1.v.map(n => n.toFixed(1)).join(', ') : '?') + ']');
    /* a cooked frag: G down, G up */
    run('Weapons.startCook();'); clock += 900; run('Weapons.update(0.016); Weapons.releaseCook();');
    const t2 = run('__throws[2]');
    ok(t2 && t2.type === 'frag' && t2.f > 0.5 && t2.f < ctx.CFG.THROWS.frag.fuse - 0.5 && dist(t2.o, pos) < 2.0, 'a frag cooked for 0.9 s in the seat is thrown from the rider with the fuse that is left [' + (t2 ? t2.f.toFixed(2) : '?') + ' s]');
    ok(run('__hud.frag') === foot - 1, 'and comes off the belt [' + foot + ' → ' + run('__hud.frag') + ']');
    run('Vehicles.ridden = __ridden;');
    /* the belt by mode */
    const bo = belt('bom'), bF = bo[0], bM = bo[1], t4 = belt('t4');
    ok(bF === 8 && bM === 10, 'Bot Ops: the belt shows 8 frags and 10 mines [' + bF + ', ' + bM + ']');
    ok(t4[0] === foot && t4[1] === footMines && foot === ctx.CFG.THROWS.frag.count && footMines === ctx.CFG.GEAR.mine.start, 'any other mode: ' + foot + ' frags and ' + footMines + ' mines, as before');
  } catch (e) { ok(false, 'the seat throw runs — ' + e.message + ' @' + String(e.stack || '').split('\n')[1]); }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
