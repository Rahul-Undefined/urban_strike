/* audit-stairs — find EVERY flight, including the ones nobody registered.

   verify-stairs-quality reads World._stairs(), the registry stairFlight()
   fills in. That is the right source for flights built by the generator and
   completely blind to flights built by hand out of seg() calls — metro.js:217
   already records one case of exactly that ("the treads by hand, which meant
   World._stairs() never saw them").

   Defect 1.3 in the v9.15 handoff is a long external flight climbing to
   nothing (Recording_105733) that survived two fixes aimed at buildingAt's
   external run. The handoff's conclusion was "it is a different generator".
   This finds it by looking at COLLIDERS rather than at the registry: a
   staircase is a run of similar boxes rising in a straight line, whatever
   built it.

   Run: node tools/audit-stairs.js [map] */

let THREE;
try { THREE = require('three'); } catch (e) { console.log('SKIP: npm install first'); process.exit(0); }
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DIST = require(path.join(ROOT, 'public/src/config/districts.config.js'));
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

function fakeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  const g = new Proxy({}, {
    get: (t, k) => {
      if (k === 'canvas') return c;
      return function () {
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop: function () { } };
        if (k === 'measureText') return { width: 10 };
        if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
      };
    }, set: () => true
  });
  c.getContext = () => g;
  return c;
}
const ctx = {
  console, Math, Date, JSON, Object, Array, Float32Array, Uint32Array, Uint16Array, Uint8ClampedArray,
  THREE, performance: { now: () => Date.now() },
  document: { createElement: (t) => (t === 'canvas' ? fakeCanvas() : { style: {} }) },
  navigator: {}, setTimeout, setInterval, clearTimeout, clearInterval, AudioSys: { step: function () { } }
};
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
[
  'public/src/config/weapons.config.js', 'public/src/config/gameplay.config.js',
  'public/src/config/loot.config.js', 'public/src/config/world.config.js',
  'public/src/config/maps-rural.config.js', 'public/src/config/maps-metro.config.js',
  'public/src/config/districts.config.js',
  'public/src/config/index.js', 'public/src/environment/merge.js',
  'public/src/environment/world.js', 'public/src/environment/districts-south.js',
  'public/src/environment/districts-north.js', 'public/src/environment/districts-outer.js',
  'public/src/environment/deco.js', 'public/src/environment/rural.js',
  'public/src/environment/metro.js', 'public/src/environment/access.js'
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));

function build(map) {
  ctx.__m = map;
  return vm.runInContext(`(function(){
    var sc = new THREE.Scene(); World.reset(); World.buildMap(sc, __m);
    return { c: World._colliders().map(function(x){return [x[0],x[1],x[2],x[3],x[4],x[5]];}),
             s: World._stairs().map(function(x){return JSON.parse(JSON.stringify(x));}) };
  })();`, ctx);
}

const STEP = CFG.MOVE.step;

/* A tread: small footprint, thin-ish, off the ground. Deliberately loose —
   this is a net, not a classifier, and a false positive costs a line of
   output while a false negative costs another shipped defect. */
function treadLike(c) {
  const w = c[3] - c[0], d = c[5] - c[2], h = c[4] - c[1];
  const foot = Math.max(w, d), thin = Math.min(w, d);
  return foot >= 0.5 && foot <= 4.5 && thin >= 0.15 && thin <= 3.0 && h <= 1.2 && c[4] > 0.15;
}

/* Chain treads into flights: each next tread is one small step up and one
   small step along, in a consistent direction. */
function findFlights(cols) {
  const t = cols.map((c, i) => ({ i, c, cx: (c[0] + c[3]) / 2, cz: (c[2] + c[5]) / 2, top: c[4], bot: c[1] }))
    .filter(o => treadLike(o.c));
  t.sort((a, b) => a.top - b.top);
  const used = new Set();
  const flights = [];
  for (const seed of t) {
    if (used.has(seed.i)) continue;
    let cur = seed;
    const chain = [seed];
    let dirX = 0, dirZ = 0;
    for (let guard = 0; guard < 200; guard++) {
      let next = null, bestScore = 1e9;
      for (const o of t) {
        if (used.has(o.i) || o === cur || chain.indexOf(o) >= 0) continue;
        const dy = o.top - cur.top;
        if (dy < 0.08 || dy > STEP + 0.08) continue;
        const dx = o.cx - cur.cx, dz = o.cz - cur.cz;
        const run = Math.hypot(dx, dz);
        if (run < 0.08 || run > 1.4) continue;
        if (dirX || dirZ) {
          // must keep going the same way
          const dot = (dx * dirX + dz * dirZ) / (run || 1);
          if (dot < 0.75) continue;
        }
        const score = run + Math.abs(dy - 0.3);
        if (score < bestScore) { bestScore = score; next = o; }
      }
      if (!next) break;
      if (!dirX && !dirZ) {
        const dx = next.cx - cur.cx, dz = next.cz - cur.cz, r = Math.hypot(dx, dz) || 1;
        dirX = dx / r; dirZ = dz / r;
      }
      chain.push(next); cur = next;
    }
    if (chain.length >= 4) {
      chain.forEach(o => used.add(o.i));
      const first = chain[0], last = chain[chain.length - 1];
      flights.push({
        n: chain.length,
        sx: first.cx, sz: first.cz, baseY: first.bot, sy: first.top,
        endX: last.cx, endZ: last.cz, topY: last.top,
        width: Math.max(last.c[3] - last.c[0], last.c[5] - last.c[2]),
        boxes: chain.map(o => o.c)
      });
    }
  }
  return flights;
}

const maps = process.argv[2] ? [process.argv[2]] : ['urban', 'metro', 'rural'];

for (const map of maps) {
  const { c: cols, s: registered } = build(map);
  const found = findFlights(cols);

  /* Which detected flights correspond to a registered one? Match on the top
     point, generously — the point is to identify the UNregistered ones. */
  function isRegistered(f) {
    return registered.some(r =>
      Math.hypot(r.endX - f.endX, r.endZ - f.endZ) < 2.5 && Math.abs(r.topY - f.topY) < 1.2);
  }

  const decks = cols.filter(c => (c[3] - c[0]) * (c[5] - c[2]) >= 1.0)
    .map(c => ({ x0: c[0], x1: c[3], z0: c[2], z1: c[5], y: c[4] }));

  /* Arrival, applied to every flight regardless of origin: is there a deck
     within 3 m of the top, at a height you could step onto? */
  function arrival(f) {
    let best = null;
    for (const d of decks) {
      // skip the flight's own treads
      const dcx = (d.x0 + d.x1) / 2, dcz = (d.z0 + d.z1) / 2;
      const onFlight = f.boxes.some(b =>
        dcx > b[0] - 0.05 && dcx < b[3] + 0.05 && dcz > b[2] - 0.05 && dcz < b[5] + 0.05);
      if (onFlight) continue;
      const dx = Math.max(d.x0 - f.endX, 0, f.endX - d.x1);
      const dz = Math.max(d.z0 - f.endZ, 0, f.endZ - d.z1);
      const gap = Math.hypot(dx, dz), rise = d.y - f.topY;
      if (rise < -1.5 || rise > 3.0) continue;
      if (!best || gap < best.gap) best = { gap, rise, y: d.y };
    }
    return best;
  }

  const unreg = found.filter(f => !isRegistered(f));
  console.log(`\n=== [${map}] ${cols.length} colliders · ${registered.length} registered flights · ` +
    `${found.length} detected · ${unreg.length} UNREGISTERED ===`);

  const orphans = [];
  for (const f of found) {
    const a = arrival(f);
    const climbed = f.topY - f.sy;
    const ok = a && a.gap <= CFG.PLAYER.radius + 0.6 && a.rise <= STEP + 0.02;
    if (!ok && climbed > 1.2) orphans.push({ f, a, reg: isRegistered(f) });
  }

  if (!orphans.length) console.log('  no flight climbs over 1.2 m and arrives nowhere.');
  orphans.sort((a, b) => (b.f.topY - b.f.sy) - (a.f.topY - a.f.sy));
  orphans.slice(0, 14).forEach(o => {
    const f = o.f;
    console.log('  ' + (o.reg ? '[reg]  ' : '[UNREG]') +
      ' [' + DIST.nameAt(f.sx, f.sz) + '] ' + f.n + ' treads  ' +
      '(' + f.sx.toFixed(1) + ', ' + f.sy.toFixed(2) + ', ' + f.sz.toFixed(1) + ')' +
      ' -> (' + f.endX.toFixed(1) + ', ' + f.topY.toFixed(2) + ', ' + f.endZ.toFixed(1) + ')' +
      '  climbs ' + (f.topY - f.sy).toFixed(2) + ' m  ' +
      (o.a ? 'nearest deck ' + o.a.gap.toFixed(2) + ' m away, ' +
        (o.a.rise >= 0 ? '+' : '') + o.a.rise.toFixed(2) + ' m'
        : 'NO deck within reach at all'));
  });
  if (orphans.length > 14) console.log('  ... and ' + (orphans.length - 14) + ' more');
}
