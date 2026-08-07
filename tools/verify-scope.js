/* verify-scope.js — v8.31

   WHY THIS GATE EXISTS

   `myTeam` was read inside avatars.js but declared `var myTeam` inside the Net
   IIFE in net.js. Every team match threw ReferenceError on the first teammate
   health bar; free-for-all never did, because short-circuit evaluation meant
   the branch was only reachable when `ally` was true.

   The v8.30 audit ran a scanner that caught `mat()` — but it only looked at
   identifiers used as FUNCTION CALLS. `myTeam` is a plain variable READ, so it
   was invisible to it. This gate closes that hole: it finds any identifier that
   is read in a module but never declared there and is not a known cross-module
   global.

   These modules are plain IIFEs loaded by <script> tags, so a variable private
   to one file is genuinely unreachable from another. There is no bundler to
   catch it and no import statement to get wrong — this gate is the only thing
   standing between a typo and a mode-specific crash. */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

const FILES = [];
(function walk(d) {
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) FILES.push(p);
  }
})('public/src');

// Module objects each file legitimately reaches across IIFE boundaries.
const MODULES = new Set(['CFG', 'THREE', 'World', 'Avatars', 'Net', 'UI', 'FX', 'AudioSys',
  'VoiceChat', 'PlayerCtl', 'Weapons', 'WeaponModels', 'Pickups', 'Minimap', 'DevHUD',
  'Game', 'Input', 'Districts', 'Access', 'Deco', 'Merge', 'MetroMap', 'RuralMap', 'io',
  'StaticMerge',
  'module', 'exports', 'require', 'define']);

const BUILTINS = new Set(['Math','Date','JSON','Object','Array','String','Number','Boolean','Error',
  'TypeError','RangeError','isNaN','isFinite','parseInt','parseFloat','setTimeout','setInterval',
  'clearTimeout','clearInterval','requestAnimationFrame','cancelAnimationFrame','document','window',
  'navigator','console','performance','Float32Array','Float64Array','Uint8Array','Uint16Array',
  'Uint32Array','Int32Array','Uint8ClampedArray','Map','Set','WeakMap','WeakSet','Promise','Symbol',
  'Proxy','Reflect','RegExp','Function','BigInt','encodeURIComponent','decodeURIComponent',
  'localStorage','sessionStorage','alert','confirm','fetch','Image','Audio','AudioContext',
  'webkitAudioContext','RTCPeerConnection','RTCSessionDescription','RTCIceCandidate','MediaStream',
  'Blob','URL','URLSearchParams','WebSocket','FileReader','TextEncoder','TextDecoder','structuredClone',
  'queueMicrotask','btoa','atob','globalThis','self','top','parent','screen','location','history',
  'undefined','null','true','false','NaN','Infinity','arguments','this','prototype','constructor']);

const KEYWORDS = new Set(['if','else','for','while','do','switch','case','break','continue','return',
  'function','var','let','const','new','delete','typeof','instanceof','in','of','void','throw','try',
  'catch','finally','class','extends','super','yield','await','async','static','get','set','default']);

console.log('--- verify-scope: cross-IIFE identifier leaks ---\n');

let leaks = 0;
for (const file of FILES) {
  const raw = fs.readFileSync(file, 'utf8');

  // Strip comments and string/template literals so we never match inside them.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    // regex literals: /[&<>]/g would otherwise leak its `g` flag as an identifier
    .replace(/(^|[=(,:[!&|?{;\n]\s*)\/(?![*/])(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, '$1 REGEX ');

  // Everything DECLARED in this file, by any means.
  const declared = new Set();
  const add = n => { if (n) declared.add(n); };
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of code.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  // additional declarators after a comma:  var a = 1, b = 2, c;
  /* Declarations routinely wrap across several lines:
       var seg = T.seg, box = T.box,
         facade = T.facade, win = T.win, ...;
     Stopping at the newline only caught the first line and reported every
     later name as an undeclared read. Capture through to the semicolon. */
  for (const m of code.matchAll(/\b(?:var|let|const)\s+([\s\S]*?);/g)) {
    m[1].split(',').forEach(part => add((part.trim().match(/^([A-Za-z_$][\w$]*)/) || [])[1]));
  }
  for (const m of code.matchAll(/\bfunction\s*[\w$]*\s*\(([^)]*)\)/g)) {
    m[1].split(',').forEach(a => add((a.trim().match(/^\.{0,3}\s*([A-Za-z_$][\w$]*)/) || [])[1]));
  }
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of code.matchAll(/\bfor\s*\(\s*(?:var|let|const)?\s*([A-Za-z_$][\w$]*)\s+(?:in|of)\b/g)) add(m[1]);
  // arrow params:  (a, b) => ... and  a => ...
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
    m[1].split(',').forEach(a => add((a.trim().match(/^([A-Za-z_$][\w$]*)/) || [])[1]));
  }
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) add(m[1]);
  // object literal keys are not identifiers we read
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)) add(m[1]);

  // Every identifier READ: not preceded by a dot, not a property key.
  const suspects = new Map();
  for (const m of code.matchAll(/(^|[^\w$.'"])([A-Za-z_$][\w$]*)/gm)) {
    const n = m[2];
    if (KEYWORDS.has(n) || BUILTINS.has(n) || MODULES.has(n) || declared.has(n)) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(n) && n.length > 3) continue;   // SHOUTY consts declared elsewhere in-file
    suspects.set(n, (suspects.get(n) || 0) + 1);
  }

  if (suspects.size) {
    leaks += suspects.size;
    console.log('  ' + file);
    for (const [n, c] of suspects) {
      const lines = [];
      raw.split('\n').forEach((L, i) => {
        if (new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(L)
          && !/^\s*(\/\/|\*|\/\*)/.test(L)) lines.push(i + 1);
      });
      console.log('     ' + n + '  x' + c + '   line(s): ' + lines.slice(0, 5).join(', '));
    }
  }
}

ok(leaks === 0, 'no client module reads an identifier it does not declare (' + leaks + ' found)');

/* Behavioural companion: drawHpBar's ally branch is the one that broke. Prove
   it runs for BOTH ally states, since only the ally path was ever reachable in
   team mode and only the enemy path in FFA. */
const THREE = require('three');
const vm = require('vm');
function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, { get: (t, k) => {
    if (k === 'canvas') return c;
    return function () {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop() {} };
      if (k === 'measureText') return { width: 40 };
      if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
    };
  }, set: () => true });
  c.getContext = () => g;
  return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, isFinite, isNaN,
  parseInt, parseFloat, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray, THREE,
  performance: { now: () => Date.now() },
  document: { createElement: t => (t === 'canvas' ? fakeCanvas() : { style: {} }),
              getElementById: () => null, addEventListener() {} },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
[ 'public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
  'public/src/config/loot.config.js', 'public/src/config/world.config.js',
  'public/src/config/maps-rural.config.js', 'public/src/config/maps-metro.config.js',
  'public/src/config/index.js', 'public/src/weapons/viewmodels.js',
  'public/src/networking/avatars.js'
].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));

for (const team of [null, 'a', 'b']) {
  ctx.Net = { getMyTeam: () => team };
  for (const ally of [false, true]) {
    let threw = null;
    try {
      vm.runInContext(`(function(){
        var av = Avatars.buildAvatar('X', 0xf0a232);
        Avatars.drawHpBar({ av: av, dispHp: 100, hp: 100 }, ${ally});
      })();`, ctx, { filename: '<hpbar>' });
    } catch (e) { threw = e.message; }
    ok(!threw, 'drawHpBar survives ally=' + ally + ' with myTeam=' + JSON.stringify(team) +
      (threw ? ' [' + threw + ']' : ''));
  }
}

/* ---- Render-loop isolation (v8.31) ----

   The team-mode fault was in Net.updateRemotes. Under v8.30's single frame
   guard that ALSO silently stopped FX.update, so muzzle flashes and tracers
   never expired and the clock froze. These assertions keep the subsystems
   independently guarded, and keep the render call unconditionally reachable. */
const gsrc = fs.readFileSync('public/src/core/game.js', 'utf8');

ok(/function step\s*\(\s*name\s*,\s*fn\s*\)/.test(gsrc),
  'game.js defines a per-subsystem step() guard');

function stepArg(name) {
  return new RegExp("step\\('" + name + "'").test(gsrc);
}
['weapons', 'player', 'camera', 'remotes', 'fx', 'pickups', 'minimap', 'hud']
  .forEach(n => ok(stepArg(n), 'frame subsystem "' + n + '" runs in its own guard'));

/* FX ageing must NOT sit inside the same guarded call as remote avatars —
   that coupling is precisely what froze effects on screen. */
const remotesBlock = (gsrc.match(/step\('remotes'[\s\S]*?\}\);/) || [''])[0];
ok(!/FX\.update/.test(remotesBlock),
  'FX.update is not inside the remotes step (a remote fault must not freeze effects)');

const fxBlock = (gsrc.match(/step\('fx'[\s\S]*?\}\);/) || [''])[0];
ok(/FX\.update/.test(fxBlock) && /FX\.updateFlash/.test(fxBlock),
  'FX ageing lives in the fx step');

/* renderer.render() must be reachable no matter what any step did. */
const loopSrc = (gsrc.match(/function loop\s*\(t\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
const renderIdx = loopSrc.indexOf('renderer.render(');
ok(renderIdx > -1, 'loop calls renderer.render()');
const beforeRender = loopSrc.slice(0, renderIdx);
const opens = (beforeRender.match(/\btry\s*\{/g) || []).length;
const closes = (beforeRender.match(/\bcatch\s*\(/g) || []).length;
ok(opens === closes,
  'renderer.render() sits outside every try block (' + opens + ' try / ' + closes + ' catch before it)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
