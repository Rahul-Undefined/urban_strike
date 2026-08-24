/* verify-bindings.js — v10.14

   WHY THIS GATE EXISTS

   v10.13 shipped `s.on('zomb', ...)` inside bindGameplayEvents(), where the
   socket is named `socket`. `s` is the parameter of bind() — a real
   identifier, declared, in the same file, four hundred lines away and out of
   scope at that point.

   The result was a ReferenceError on the first gameplay bind, which aborted
   the rest of the chain. Rahul saw four errors stacked on his screen:

       match start: s is not defined
       match start (retry): s is not defined
       The map could not be built - leave and rejoin the room
       Map failed to load - press ESC and rejoin the room

   One undefined variable, four unrelated-looking symptoms, and EVERY match on
   EVERY map failed to start.

   Nothing caught it. Not the syntax check — it is valid JavaScript. Not
   verify-scope — that looks for identifiers a module never declares, and `s`
   IS declared in this module; being in the wrong scope is invisible to it. Not
   any other gate, because they all test data and geometry, and this was
   plumbing.

   The only thing that catches a wrong-scope reference is RUNNING THE CODE. So
   this executes net.js's bind functions against a stub socket and asserts they
   complete. It does not check what they do — only that they run, which is
   exactly the class of failure that got through. */
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let THREE;
try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }

/* A socket that records every event name bound to it and never throws. */
function stubSocket() {
  const bound = [];
  const s = {
    bound,
    on: (ev) => { bound.push(ev); return s; },
    emit: () => s,
    connected: true,
    id: 'stub',
    io: { on: () => {}, engine: { on: () => {} } }
  };
  return s;
}

function noopProxy(name) {
  return new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return () => 0;
      if (!t[k]) t[k] = noopProxy(name + '.' + String(k));
      return t[k];
    },
    apply: () => noopProxy(name + '()'),
    set: () => true
  });
}

const CFG = require(path.join(ROOT, 'public/src/config/index.js'));
const ctx = {
  THREE, CFG, console, Math, Date, JSON, Object, Array, String, Number, Boolean,
  isFinite, isNaN, parseInt, parseFloat, Float32Array, Uint8Array, Uint16Array, Uint32Array,
  Int32Array, ArrayBuffer, DataView, Map, Set, Promise, Error,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  performance: { now: () => 0 },
  io: () => stubSocket()
};
['document', 'navigator', 'localStorage', 'location', 'fetch',
 'UI', 'FX', 'AudioSys', 'Weapons', 'PlayerCtl', 'Minimap', 'World', 'Pickups',
 'Avatars', 'SnapCodec', 'Game', 'DevHUD', 'Viewmodels', 'Showcase', 'DISTRICTS'
].forEach(k => { ctx[k] = noopProxy(k); });
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

const src = fs.readFileSync(path.join(ROOT, 'public/src/networking/net.js'), 'utf8');
let loaded = false;
try { vm.runInContext(src, ctx, { filename: 'net.js' }); loaded = true; }
catch (e) { console.log('        ' + e.message); }
ok(loaded, 'net.js evaluates');

console.log('\n--- the real bind path runs end to end ---');
/* The bind functions are private to the module IIFE, which is correct — so
   they are reached the way the GAME reaches them: Net.init() connects, and
   connecting binds. That is the exact call chain that threw on Rahul's
   machine, so it is the one worth executing. */
let sock = null;
ctx.io = () => (sock = stubSocket());
/* init() only stores the scene; connect() is what binds. Both are called, in
   the order Game.init calls them. */
let initErr = null;
try { vm.runInContext('Net.init(new THREE.Group()); Net.connect();', ctx); }
catch (e) { initErr = e.message; }
ok(!initErr, 'Net.init() + Net.connect() complete without throwing' +
   (initErr ? ' — ' + initErr : ''));
ok(sock && sock.bound.length > 20,
  'and the socket came back with every handler bound [' +
  (sock ? sock.bound.length : 0) + ' events]');
/* The specific shape of the v10.13 defect: a handler that never registered
   because an earlier one in the same function threw. */
console.log('        bound: ' + (sock ? sock.bound.join(' ') : '(none)'));
/* The v10.13 defect in its exact shape: an earlier handler threw, so every
   handler AFTER it in the same function silently never registered. These four
   sit at the end of the chain, so if any of them is missing something above
   it threw. 'death' and 'matchEnd' being last is the point of choosing them. */
['snap', 'vitals', 'death', 'matchEnd'].forEach(ev => {
  ok(sock && sock.bound.indexOf(ev) >= 0,
    "'" + ev + "' is bound — it sits late in the chain, so a throw above it would drop it");
});

/* bindGameplayEvents() runs on match start, not on connect, so it is
   exercised separately — and it is the function the v10.13 defect was IN. */
console.log('\n--- the match-start bind runs too ---');
{
  let gErr = null;
  const before = sock ? sock.bound.length : 0;
  try { vm.runInContext('if (Net.bindGameplayEvents) Net.bindGameplayEvents();', ctx); }
  catch (e) { gErr = e.message; }
  ok(!gErr, 'the gameplay bind completes without throwing' + (gErr ? ' — ' + gErr : ''));
  if (!gErr && sock) {
    ok(sock.bound.length >= before,
      'and registered ' + (sock.bound.length - before) + ' further handlers');
  }
}

console.log('\n--- no handler references a socket by the wrong name ---');
/* A cheap structural backstop for the same defect: inside bindGameplayEvents,
   which receives no socket parameter, nothing may call `s.on`. */
/* Comments are stripped first: this file's own history note quotes the bad
   line verbatim, and a check that trips on a comment ABOUT the defect is the
   most annoying possible false positive. */
const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const bge = noComments.slice(noComments.indexOf('function bindGameplayEvents'));
const bgeBody = bge.slice(0, bge.indexOf('\n  function ', 10) > 0 ? bge.indexOf('\n  function ', 10) : bge.length);
ok(!/(^|[^\w.])s\.on\s*\(/.test(bgeBody),
  'bindGameplayEvents() never calls s.on — its socket is named `socket`');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
