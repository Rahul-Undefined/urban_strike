/* verify-quality.js — v1.0c
   The adaptive quality scaler, driven with synthetic frame times in a vm.
   What it must prove is the v10.6 lesson: NO OSCILLATION. Steps down are
   rate-limited, steps up need sustained headroom and a long lockout after any
   step down, and AUTO never climbs back past the tier it had to leave. It
   also proves the tier is actually applied to the renderer, the sun's shadow
   map and the textures, and that a manual tier is never touched. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label); } }

const store = {};
const ctx = {
  console, Math, JSON, Object, Array,
  window: { devicePixelRatio: 2.0, innerWidth: 1920, innerHeight: 1080 },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }
};
ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/src/core/quality.js'), 'utf8'), ctx, { filename: 'quality.js' });
const Q = ctx.Quality;

/* stubs: a renderer that records ratio/size, a scene with two textured
   materials, a sun with a shadow map object */
function mkRenderer() {
  const r = { ratio: 1, sizes: 0, shadowMap: { enabled: true }, capabilities: { getMaxAnisotropy: () => 16 } };
  r.getPixelRatio = () => r.ratio; r.setPixelRatio = v => { r.ratio = v; r.sizes++; }; r.setSize = () => { r.sizes++; };
  return r;
}
function mkScene() {
  const texA = { uuid: 'ta', anisotropy: 4, needsUpdate: false }, texB = { uuid: 'tb', anisotropy: 4, needsUpdate: false };
  const objs = [{ material: { map: texA, needsUpdate: false } }, { material: [{ map: texB, needsUpdate: false }, { map: texA, needsUpdate: false }] }];
  return { objs, texA, texB, traverse: fn => objs.forEach(fn) };
}
function mkSun() {
  let disposed = 0;
  const sun = { castShadow: true, shadow: { mapSize: { x: 2048, y: 2048, set(a, b) { this.x = a; this.y = b; } }, map: { dispose() { disposed++; } }, normalBias: 0.058 } };
  sun.disposed = () => disposed;
  return sun;
}

console.log('--- boot ---');
const R = mkRenderer(), S = mkScene(), SUN = mkSun();
const changes = [];
Q.init(R, S, { onChange: (id, T, why) => changes.push({ id, why }) });
ok(Q.getMode() === 'auto' && Q.getTier() === 'high', 'fresh install: AUTO at HIGH — the tier the game shipped at before this file');
ok(Math.abs(R.ratio - 1.75) < 1e-9, 'HIGH applies the 1.75 pixel-ratio cap (device 2.0)');
Q.setSun(SUN);
ok(SUN.shadow.mapSize.x === 2048 && Math.abs(SUN.shadow.normalBias - 0.058) < 1e-9, 'HIGH keeps the 2048 shadow map and its bias');
ok(S.texA.anisotropy === 8 && S.texA.needsUpdate === true, 'textures take the tier anisotropy on setSun');

console.log('--- lag: steps down, rate-limited ---');
let now = 100000;
Q.setActive(true);
function frames(ms, fps, active) {
  const dt = 1000 / fps;
  for (let t = 0; t < ms; t += dt) { now += dt; Q.tick(dt, now); }
}
frames(3200, 25);
ok(Q.getTier() === 'medium', 'three seconds at 25 fps: one step down to MEDIUM [' + Q.getTier() + ']');
frames(3200, 25);
ok(Q.getTier() === 'medium', 'another 3 s of lag inside the 6 s gap does NOT step again (no cascade)');
ok(Math.abs(R.ratio - 1.25) < 1e-9, 'MEDIUM drew the buffer once at 1.25');
frames(3200, 25);
ok(Q.getTier() === 'low', 'past the gap the next lagging window steps to LOW');
ok(SUN.shadow.mapSize.x === 1024 && SUN.disposed() >= 1, 'LOW shrank the shadow map and disposed the old one');

console.log('--- headroom: the tiers it lagged at are gone for the session ---');
frames(15000, 60);
ok(Q.getTier() === 'low', '15 s of 60 fps within 30 s of a step down: still LOW (lockout)');
frames(60000, 60);
ok(Q.getTier() === 'low', 'a full minute of headroom: STILL LOW — it lagged at MEDIUM, so MEDIUM is not retried this session (converge and stop) [' + Q.getTier() + ']');
const downs = changes.filter(c => c.why === 'lag').length, ups = changes.filter(c => c.why === 'headroom').length;
ok(downs === 2 && ups === 0, 'exactly two steps down and none up across the whole run [' + downs + '/' + ups + ']');
ok(store.us_quality_tier === 'low', 'LOW is remembered, so the NEXT launch starts there and gets one fresh climb (the ceiling resets per session)');

console.log('--- a machine that lags once and then has headroom climbs back within its ceiling ---');
{
  const R2 = mkRenderer(), S2 = mkScene(), SUN2 = mkSun();
  for (const k in store) delete store[k];
  Q.init(R2, S2, {}); Q.setSun(SUN2); Q.setMode('auto'); Q.setActive(false); Q.setActive(true);
  ok(Q.getTier() === 'high', 'fresh machine: HIGH');
  frames(3200, 25);
  ok(Q.getTier() === 'medium', 'lags once at HIGH -> MEDIUM; the ceiling is now MEDIUM');
  frames(3200, 25);                       // inside the gap: no cascade
  frames(3200, 25);                       // past the gap: down again
  ok(Q.getTier() === 'low', 'a second lagging window past the 6 s gap -> LOW');
  Q.setMode('auto');                      // re-entering AUTO resets the ceiling — the manual escape hatch
  frames(35000, 60);
  ok(Q.getTier() === 'medium', 'after re-entering AUTO, sustained headroom climbs one step (12 s hold), then waits 20 s [' + Q.getTier() + ']');
  frames(40000, 60);
  ok(Q.getTier() === 'ultra' || Q.getTier() === 'high', 'and keeps climbing one step per 20 s while the headroom holds [' + Q.getTier() + ']');
}

console.log('--- not measuring outside a match; stalls are not lag ---');
{
  const t0 = Q.getTier();
  Q.setActive(false); frames(6000, 10); ok(Q.getTier() === t0, 'menu/lobby frames do not drive the scaler');
  Q.setActive(true); now += 5000; Q.tick(5000, now); frames(3200, 60);
  ok(Q.getTier() === t0, 'a 5 s tab-hidden stall is ignored');
}

console.log('--- the user preference ---');
const R3 = mkRenderer(), S3 = mkScene(), SUN3 = mkSun();
Q.init(R3, S3, {}); Q.setSun(SUN3); Q.setActive(false); Q.setActive(true);
Q.setMode('ultra');
ok(Q.getTier() === 'ultra' && Math.abs(R3.ratio - 2.0) < 1e-9 && SUN3.shadow.mapSize.x === 4096, 'ULTRA pins native ratio (2.0) and a 4096 shadow map');
frames(9000, 20);
ok(Q.getTier() === 'ultra', 'a manual tier is never changed by the scaler');
Q.setMode('potato');
ok(R3.shadowMap.enabled === false && SUN3.castShadow === false && Math.abs(R3.ratio - 0.75) < 1e-9, 'POTATO turns shadows off and draws at 0.75');
ok(store.us_quality_mode === 'potato' && store.us_quality_tier === 'potato', 'the preference is persisted');
Q.setMode('auto');
ok(Q.getMode() === 'auto' && Q.getTier() === 'potato', 'back to AUTO: it resumes from the remembered tier, and may climb from there');
frames(25000, 60);
ok(Q.getTier() === 'low', 'from POTATO with headroom AUTO climbs one step after the 12 s hold (ceiling reset to ULTRA on re-entry) [' + Q.getTier() + ']');

console.log('--- the pause panel and game wiring exist ---');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
ok(/id="quality-mode"/.test(html) && /value="auto"/.test(html) && /value="potato"/.test(html), 'the QUALITY select with AUTO and every tier is in the pause panel');
ok(/src\/core\/quality\.js/.test(html), 'quality.js is loaded');
const game = fs.readFileSync(path.join(ROOT, 'public/src/core/game.js'), 'utf8');
ok(/Quality\.init\(renderer, scene/.test(game) && /Quality\.tick\(dt \* 1000, t\)/.test(game) && /Quality\.setSun\(World\.getSun\(\)\)/.test(game),
  'game.js initialises, feeds and re-suns the quality module');
ok(/Quality\.setActive\(playing && locked && World\.isBuilt\(\)\)/.test(game), 'the scaler only measures in a match with the pointer locked');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
