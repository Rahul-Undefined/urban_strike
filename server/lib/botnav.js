/* server/lib/botnav.js — v2.12. WHERE A BOT CAN WALK, AND WHAT IT CAN SEE.

   The v8-v14 bots (removed in v1.0d) steered straight at a waypoint and relied
   on a stuck detector; their own notes record the result — "one bot in twelve
   gained more than a metre of height in a full minute". This module replaces
   steering with a NAVIGATION GRAPH built from the same colliders the game
   runs on (Bots.buildColliders, the proven headless build):

     * 0.5 m cells, MULTI-LEVEL: a cell may hold several standable heights
       (street, first floor, roof). A node exists only where a 1.92 m body
       fits and only if it was REACHED by walking from a spawn point, one
       auto-step (MOVE.step) at a time. Stairs are therefore in the graph
       for free — and so is every room, roof and tower a player can walk to.
       A flight nobody can climb is simply never entered.
     * A* over that graph (capped, weighted) gives a path; a line-walk test
       smooths it so bots cut corners like people instead of zig-zagging.
     * A 6 m collider grid makes line-of-sight a few dozen box tests instead
       of 11,778.

   Bots are moved ALONG graph paths (botai.js), so they cannot wedge on a
   crate or walk off a roof: every position they occupy was proven standable
   when the graph was built.

   The build is time-sliced (ensure()) so a 440 m map never blocks a tick. */
'use strict';

module.exports = function initBotNav(ctx) {
  const CFG = ctx.CFG, Bots = ctx.Bots;
  const NS = 0.5;                       // nav cell, metres
  const CG = 6;                         // collider-grid cell, metres
  const MARGIN = 0.6;                   // collider-grid overlap (>= capsule radius)
  const R = 0.30;                       // nav capsule radius
  const BODY = CFG.PLAYER.standH;
  const STEP = CFG.MOVE.step;
  const cache = Object.create(null);

  function create(mapId) {
    const cols = Bots.buildColliders(mapId);
    /* extent: the map's declared one when it has it, else the colliders' own */
    const m = CFG.MAPS[mapId] || {};
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    if (m.ext) { x0 = m.ext.x0; x1 = m.ext.x1; z0 = m.ext.z0; z1 = m.ext.z1; }
    else {
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c[3] - c[0] > 900 || c[5] - c[2] > 900) continue;
        if (c[0] < x0) x0 = c[0]; if (c[2] < z0) z0 = c[2];
        if (c[3] > x1) x1 = c[3]; if (c[5] > z1) z1 = c[5];
      }
      x0 = Math.max(-520, x0); z0 = Math.max(-520, z0); x1 = Math.min(520, x1); z1 = Math.min(520, z1);
    }
    const nav = {
      mapId, cols, x0, z0, x1, z1,
      gw: Math.ceil((x1 - x0) / CG) + 1, gd: Math.ceil((z1 - z0) / CG) + 1, grid: null,
      w: Math.ceil((x1 - x0) / NS) + 1, d: Math.ceil((z1 - z0) / NS) + 1,
      first: null, nh: new Float32Array(1 << 16), nnext: new Int32Array(1 << 16), ncell: new Int32Array(1 << 16), nflag: new Uint8Array(1 << 16), n: 0,
      links: new Map(), reach: null, flights: 0, flightsLinked: 0,
      queue: [], qHead: 0, ready: false, building: false, waiters: [],
      stamp: new Uint32Array(cols.length), stampN: 1,
      perches: [], high: [], gScore: null, came: null, sStamp: null, sId: 1, closed: null
    };
    /* ---- the collider grid ---- */
    const lists = new Array(nav.gw * nav.gd);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      let a0 = Math.floor((c[0] - MARGIN - x0) / CG), a1 = Math.floor((c[3] + MARGIN - x0) / CG);
      let b0 = Math.floor((c[2] - MARGIN - z0) / CG), b1 = Math.floor((c[5] + MARGIN - z0) / CG);
      if (a0 < 0) a0 = 0; if (b0 < 0) b0 = 0; if (a1 >= nav.gw) a1 = nav.gw - 1; if (b1 >= nav.gd) b1 = nav.gd - 1;
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
        const k = b * nav.gw + a; (lists[k] || (lists[k] = [])).push(i);
      }
    }
    nav.grid = lists.map(l => l ? Int32Array.from(l) : null);
    nav.first = new Int32Array(nav.w * nav.d).fill(-1);
    return nav;
  }

  function cellList(nav, x, z) {
    const a = Math.floor((x - nav.x0) / CG), b = Math.floor((z - nav.z0) / CG);
    if (a < 0 || b < 0 || a >= nav.gw || b >= nav.gd) return null;
    return nav.grid[b * nav.gw + a];
  }
  /* highest surface a body with its feet at feetY could step onto at (x, z) */
  function groundAt(nav, x, z, feetY) {
    const L = cellList(nav, x, z); if (!L) return null;
    const cols = nav.cols, reach = feetY + STEP + 0.02;
    let best = null;
    for (let i = 0; i < L.length; i++) {
      const c = cols[L[i]];
      if (x <= c[0] - R || x >= c[3] + R || z <= c[2] - R || z >= c[5] + R) continue;
      const top = c[4];
      if (top > reach) continue;
      if (best === null || top > best) best = top;
    }
    return best;
  }
  function blocked(nav, x, feetY, z) {
    const L = cellList(nav, x, z); if (!L) return true;
    const cols = nav.cols, lo = feetY + STEP + 0.03, hi = feetY + BODY;
    for (let i = 0; i < L.length; i++) {
      const c = cols[L[i]];
      if (c[4] <= lo || c[1] >= hi) continue;
      if (x > c[0] - R && x < c[3] + R && z > c[2] - R && z < c[5] + R) return true;
    }
    return false;
  }
  /* is there a roof / slab over a body standing here? */
  function roofed(nav, x, feetY, z) {
    const L = cellList(nav, x, z); if (!L) return false;
    const cols = nav.cols;
    for (let i = 0; i < L.length; i++) {
      const c = cols[L[i]];
      if (c[1] < feetY + 1.8 || c[1] > feetY + 9) continue;
      if (x > c[0] && x < c[3] && z > c[2] && z < c[5]) return true;
    }
    return false;
  }

  /* ---- line of sight: true when NOTHING is between the two points ---- */
  function los(nav, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(len / 1.5));
    const cols = nav.cols, st = nav.stamp;
    let sn = ++nav.stampN; if (sn > 4000000000) { st.fill(0); sn = nav.stampN = 1; }
    let lastK = -1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, px = ax + dx * t, pz = az + dz * t;
      const a = Math.floor((px - nav.x0) / CG), b = Math.floor((pz - nav.z0) / CG);
      if (a < 0 || b < 0 || a >= nav.gw || b >= nav.gd) continue;
      const k = b * nav.gw + a; if (k === lastK) continue; lastK = k;
      const L = nav.grid[k]; if (!L) continue;
      for (let i = 0; i < L.length; i++) {
        const ci = L[i]; if (st[ci] === sn) continue; st[ci] = sn;
        const c = cols[ci];
        let t0 = 0, t1 = 1, hit = true;
        for (let ax3 = 0; ax3 < 3; ax3++) {
          const o = ax3 === 0 ? ax : ax3 === 1 ? ay : az, dd = ax3 === 0 ? dx : ax3 === 1 ? dy : dz;
          const lo = c[ax3], hi = c[ax3 + 3];
          if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) { hit = false; break; } }
          else {
            let ta = (lo - o) / dd, tb = (hi - o) / dd; if (ta > tb) { const q = ta; ta = tb; tb = q; }
            if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
            if (t0 > t1) { hit = false; break; }
          }
        }
        if (hit && t1 > 0.002 && t0 < 0.998) return false;
      }
    }
    return true;
  }

  /* ---- nodes ---- */
  function grow(nav) {
    const cap = nav.nh.length * 2;
    const a = new Float32Array(cap); a.set(nav.nh); nav.nh = a;
    const b = new Int32Array(cap); b.set(nav.nnext); nav.nnext = b;
    const c = new Int32Array(cap); c.set(nav.ncell); nav.ncell = c;
    const e = new Uint8Array(cap); e.set(nav.nflag); nav.nflag = e;
  }
  /* `any` true: stair nodes count too (used to follow the ground under a body).
     Otherwise PLAIN nodes only — a stair node is entered and left through its
     explicit links, never by being a similar height to the cell next door. */
  function nodeIn(nav, cell, h, tol, any) {
    let best = -1, bd = tol;
    for (let n = nav.first[cell]; n >= 0; n = nav.nnext[n]) {
      if (!any && (nav.nflag[n] & 1)) continue;
      const d = Math.abs(nav.nh[n] - h); if (d <= bd) { bd = d; best = n; }
    }
    return best;
  }
  function link(nav, a, b) {
    if (a < 0 || b < 0 || a === b) return;
    let L = nav.links.get(a); if (!L) nav.links.set(a, L = []); if (L.indexOf(b) < 0) L.push(b);
    L = nav.links.get(b); if (!L) nav.links.set(b, L = []); if (L.indexOf(a) < 0) L.push(a);
  }
  function addNode(nav, cell, h) {
    if (nav.n >= nav.nh.length) grow(nav);
    const id = nav.n++;
    nav.nh[id] = h; nav.ncell[id] = cell; nav.nnext[id] = nav.first[cell]; nav.first[cell] = id;
    return id;
  }
  const cx = (nav, cell) => nav.x0 + ((cell % nav.w) + 0.5) * NS;
  const cz = (nav, cell) => nav.z0 + (Math.floor(cell / nav.w) + 0.5) * NS;
  function cellOf(nav, x, z) {
    const a = Math.floor((x - nav.x0) / NS), b = Math.floor((z - nav.z0) / NS);
    if (a < 0 || b < 0 || a >= nav.w || b >= nav.d) return -1;
    return b * nav.w + a;
  }
  function nodeAt(nav, x, z, y, tol, any) {
    const c = cellOf(nav, x, z); if (c < 0) return -1;
    return nodeIn(nav, c, y, tol === undefined ? STEP + 0.1 : tol, any);
  }
  function posOf(nav, id) { const c = nav.ncell[id]; return [cx(nav, c), nav.nh[id], cz(nav, c)]; }

  /* ---- the build: flood from the spawn points, one auto-step at a time ---- */
  function seed(nav) {
    const D = CFG['MAPS_' + nav.mapId.toUpperCase()] || (nav.mapId === 'urban' ? { SPAWNS: CFG.SPAWNS } : null) || {};
    const pts = (D.SPAWNS || CFG.SPAWNS || []).map(s => [s[0], s[1]]);
    pts.forEach(p => {
      const c = cellOf(nav, p[0], p[1]); if (c < 0) return;
      const x = cx(nav, c), z = cz(nav, c), g = groundAt(nav, x, z, 0.7);
      if (g === null || blocked(nav, x, g, z)) return;
      if (nodeIn(nav, c, g, 0.25) < 0) nav.queue.push(addNode(nav, c, g));
    });
  }
  const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
  function stepBuild(nav, budgetMs) {
    const t0 = Date.now(), q = nav.queue, w = nav.w, d = nav.d;
    let iter = 0;
    while (nav.qHead < q.length) {
      const n = q[nav.qHead++], cell = nav.ncell[n], f = nav.nh[n];
      const a = cell % w, b = (cell - a) / w;
      for (let k = 0; k < 4; k++) {
        const na = a + DX[k], nb = b + DZ[k];
        if (na < 0 || nb < 0 || na >= w || nb >= d) continue;
        const nc = nb * w + na, x = nav.x0 + (na + 0.5) * NS, z = nav.z0 + (nb + 0.5) * NS;
        const g = groundAt(nav, x, z, f);
        if (g === null || f - g > STEP + 0.02) continue;        // no drops: every edge is two-way
        if (nodeIn(nav, nc, g, 0.25) >= 0) continue;
        if (blocked(nav, x, g, z)) continue;
        q.push(addNode(nav, nc, g));
      }
      if ((++iter & 1023) === 0 && budgetMs && Date.now() - t0 > budgetMs) return false;
    }
    return true;
  }
  /* ===== THE STAIRS =====
     A 0.6 m-wide body on 0.4 m treads always overlaps a tread two steps up, so
     a capsule test at cell centres accepts some flights and refuses others by
     the accident of where the cells fall (first measurement: 7 of 58 flights
     entered). The world already RECORDS every flight it builds (foot, run,
     rise) and verify-climb walks that list, so the flights are laid into the
     graph from the record instead: a chain of nodes up the centreline, joined
     by explicit links, the foot linked to the floor it stands on and the head
     to the landing it reaches. The flood then continues from every landing. */
  function layFlights(nav) {
    const F = Bots.stairsFor(nav.mapId) || [];
    nav.flights = F.length;
    const pending = [];
    F.forEach(f => {
      /* the harness keeps foot, head and direction — the run is the distance between them */
      const run = (f.endX - f.sx) * f.dirX + (f.endZ - f.sz) * f.dirZ, rise = f.topY - f.sy; if (!(run > 0) || !(rise > 0)) return;
      const chain = []; let lastCell = -1;
      for (let t = 0; t <= run + 1e-6; t += NS / 2) {
        const c = cellOf(nav, f.sx + f.dirX * t, f.sz + f.dirZ * t); if (c < 0 || c === lastCell) continue; lastCell = c;
        const tt = Math.max(0, Math.min(run, (cx(nav, c) - f.sx) * f.dirX + (cz(nav, c) - f.sz) * f.dirZ));
        const id = addNode(nav, c, f.sy + rise * tt / run); nav.nflag[id] |= 1;
        if (chain.length) link(nav, chain[chain.length - 1], id);
        chain.push(id);
      }
      if (chain.length < 2) return;
      /* the landing: the first standable spot just past the head */
      for (let d = 0.3; d <= 1.3; d += 0.25) {
        const x = f.endX + f.dirX * d, z = f.endZ + f.dirZ * d, c = cellOf(nav, x, z); if (c < 0) continue;
        const px = cx(nav, c), pz = cz(nav, c), g = groundAt(nav, px, pz, f.topY);
        if (g === null || Math.abs(g - f.topY) > 0.5 || blocked(nav, px, g, pz)) continue;
        if (nodeIn(nav, c, g, 0.25) < 0) nav.queue.push(addNode(nav, c, g));
        break;
      }
      pending.push({ f, chain });
    });
    return pending;
  }
  function tieFlights(nav, pending) {
    const near = (x, z, y, bx, bz) => {      // nearest PLAIN node, preferring the (bx, bz) side
      const c = cellOf(nav, x, z); if (c < 0) return -1;
      const a = c % nav.w, b = (c - a) / nav.w; let best = -1, bd = Infinity;
      for (let da = -3; da <= 3; da++) for (let db = -3; db <= 3; db++) {
        const na = a + da, nb = b + db; if (na < 0 || nb < 0 || na >= nav.w || nb >= nav.d) continue;
        for (let n = nav.first[nb * nav.w + na]; n >= 0; n = nav.nnext[n]) {
          if (nav.nflag[n] & 1) continue;
          const dy = Math.abs(nav.nh[n] - y); if (dy > 0.6) continue;
          const sc = Math.hypot(da, db) * NS + dy - (da * bx + db * bz) * 0.2;
          if (sc < bd) { bd = sc; best = n; }
        }
      }
      return best;
    };
    pending.forEach(p => {
      const f = p.f, foot = near(f.sx, f.sz, f.sy, -f.dirX, -f.dirZ), head = near(f.endX, f.endZ, f.topY, f.dirX, f.dirZ);
      if (foot >= 0) link(nav, p.chain[0], foot);
      if (head >= 0) { link(nav, p.chain[p.chain.length - 1], head); p.head = head; }
      if (foot >= 0 && head >= 0) nav.flightsLinked++;
    });
  }
  /* which nodes can actually be walked to from the street */
  function markReach(nav) {
    nav.reach = null;                       // nearest() filters on it once it exists
    const reach = new Uint8Array(nav.n);
    const D = CFG['MAPS_' + nav.mapId.toUpperCase()] || { SPAWNS: CFG.SPAWNS }, S = D.SPAWNS || CFG.SPAWNS || [];
    const q = [], buf = new Int32Array(64);
    for (let i = 0; i < S.length && !q.length; i++) { const n = nearest(nav, S[i][0], S[i][1], 0, 3, 1.2); if (n >= 0) { q.push(n); reach[n] = 1; } }
    for (let h = 0; h < q.length; h++) {
      const cnt = neighbours(nav, q[h], buf);
      for (let i = 0; i < cnt; i += 2) { const m = buf[i]; if (!reach[m]) { reach[m] = 1; q.push(m); } }
    }
    nav.reach = reach; nav.reachable = q.length;
  }
  function finish(nav) {
    const pending = layFlights(nav);
    stepBuild(nav, 0);                    // flood the floors the flights reach
    tieFlights(nav, pending);
    markReach(nav);
    nav.queue = null;
    nav.gScore = new Float32Array(nav.n); nav.came = new Int32Array(nav.n);
    nav.sStamp = new Uint32Array(nav.n); nav.closed = new Uint32Array(nav.n);
    /* high ground: where the stairs arrive, and a sample of everything above 2.8 m */
    pending.forEach(p => { if (p.head >= 0 && p.f.topY >= 2.5 && nav.reach[p.head] && nav.perches.indexOf(p.head) < 0) nav.perches.push(p.head); });
    for (let i = 0; i < nav.n; i += 97) {
      if (nav.nh[i] < 2.8 || !nav.reach[i] || (nav.nflag[i] & 1)) continue;
      const p = posOf(nav, i);
      if (!roofed(nav, p[0], p[1], p[2])) nav.high.push(i);
    }
    nav.ready = true; nav.building = false;
    const ws = nav.waiters; nav.waiters = []; ws.forEach(fn => { try { fn(nav); } catch (e) { console.error('[botnav] waiter failed:', e.message); } });
  }
  function get(mapId) { return cache[mapId] || (cache[mapId] = create(mapId)); }
  function buildSync(mapId) {
    const nav = get(mapId);
    if (nav.ready) return nav;
    if (!nav.building) { nav.building = true; seed(nav); }
    stepBuild(nav, 0); finish(nav);
    return nav;
  }
  /* time-sliced: at most `slice` ms of work per turn of the event loop */
  function ensure(mapId, cb, slice) {
    const nav = get(mapId);
    if (nav.ready) { if (cb) cb(nav); return nav; }
    if (cb) nav.waiters.push(cb);
    if (nav.building) return nav;
    nav.building = true; seed(nav);
    const pump = () => { if (stepBuild(nav, slice || 10)) finish(nav); else setImmediate(pump); };
    setImmediate(pump);
    return nav;
  }

  /* nearest node to a point: rings of cells outward */
  function nearest(nav, x, z, y, maxR, yTol) {
    const c = cellOf(nav, x, z); if (c < 0) return -1;
    const a = c % nav.w, b = (c - a) / nav.w, rings = Math.ceil((maxR || 3) / NS);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= rings; r++) {
      for (let da = -r; da <= r; da++) for (let db = -r; db <= r; db++) {
        if (Math.max(Math.abs(da), Math.abs(db)) !== r) continue;
        const na = a + da, nb = b + db;
        if (na < 0 || nb < 0 || na >= nav.w || nb >= nav.d) continue;
        for (let n = nav.first[nb * nav.w + na]; n >= 0; n = nav.nnext[n]) {
          if ((nav.nflag[n] & 1) || (nav.reach && !nav.reach[n])) continue;
          const dy = Math.abs(nav.nh[n] - y);
          if (yTol !== undefined && dy > yTol) continue;
          const sc = Math.hypot(da, db) * NS + dy * 2;
          if (sc < bd) { bd = sc; best = n; }
        }
      }
      if (best >= 0 && r * NS > bd) break;
    }
    return best;
  }

  /* neighbours of a node: 8-connected, no corner cutting */
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function neighbours(nav, n, out) {
    const cell = nav.ncell[n], h = nav.nh[n], w = nav.w, a = cell % w, b = (cell - a) / w;
    let cnt = 0, orth = 0;
    const LK = nav.links.get(n);
    if (LK) for (let i = 0; i < LK.length; i++) { out[cnt++] = LK[i]; out[cnt++] = 8; }
    if (nav.nflag[n] & 1) return cnt;
    for (let k = 0; k < 8; k++) {
      const na = a + NB[k][0], nb = b + NB[k][1];
      if (na < 0 || nb < 0 || na >= w || nb >= nav.d) continue;
      if (k >= 4) {       // a diagonal needs both of its orthogonal steps
        const need = (NB[k][0] > 0 ? 1 : 2) | (NB[k][1] > 0 ? 4 : 8);
        if ((orth & need) !== need) continue;
      }
      const m = nodeIn(nav, nb * w + na, h, STEP + 0.03);
      if (m < 0) continue;
      if (k < 4) orth |= (1 << k);
      out[cnt++] = m; out[cnt++] = k;
    }
    return cnt;
  }

  /* ---- A*: weighted, capped. Returns node ids, or the best partial path ---- */
  const heap = { a: [], f: [] };
  function hpush(n, f) { const A = heap.a, F = heap.f; let i = A.length; A.push(n); F.push(f);
    while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; A[i] = A[p]; F[i] = F[p]; i = p; } A[i] = n; F[i] = f; }
  function hpop() { const A = heap.a, F = heap.f, top = A[0], n = A.pop(), f = F.pop(), len = A.length;
    if (len) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= len) break; if (c + 1 < len && F[c + 1] < F[c]) c++; if (F[c] >= f) break; A[i] = A[c]; F[i] = F[c]; i = c; } A[i] = n; F[i] = f; }
    return top; }
  const nbuf = new Int32Array(64);
  function path(nav, from, to, maxExpand) {
    if (from < 0 || to < 0) return null;
    if (from === to) return [from];
    const sid = ++nav.sId, g = nav.gScore, came = nav.came, st = nav.sStamp, cl = nav.closed, w = nav.w;
    const tc = nav.ncell[to], ta = tc % w, tb = (tc - ta) / w, th = nav.nh[to];
    const hfun = (n) => { const c = nav.ncell[n], a = c % w, b = (c - a) / w, da = Math.abs(a - ta), db = Math.abs(b - tb);
      return (Math.max(da, db) + 0.414 * Math.min(da, db)) * NS + Math.abs(nav.nh[n] - th) * 1.5; };
    heap.a.length = 0; heap.f.length = 0;
    g[from] = 0; st[from] = sid; came[from] = -1; hpush(from, hfun(from));
    let expand = 0, best = from, bestH = hfun(from), found = false;
    const cap = maxExpand || 16000;
    while (heap.a.length && expand < cap) {
      const n = hpop();
      if (cl[n] === sid) continue; cl[n] = sid; expand++;
      if (n === to) { found = true; break; }
      const hn = hfun(n); if (hn < bestH) { bestH = hn; best = n; }
      const cnt = neighbours(nav, n, nbuf);
      for (let i = 0; i < cnt; i += 2) {
        const m = nbuf[i]; if (cl[m] === sid) continue;
        const kk = nbuf[i + 1];
        let stepLen = kk >= 8 ? 0 : kk >= 4 ? 0.7071 : 0.5;
        if (kk >= 8) { const c1 = nav.ncell[n], c2 = nav.ncell[m]; stepLen = Math.hypot((c1 % w) - (c2 % w), Math.floor(c1 / w) - Math.floor(c2 / w)) * NS; }
        const ng = g[n] + stepLen + Math.abs(nav.nh[m] - nav.nh[n]) * 0.6;
        if (st[m] !== sid || ng < g[m]) { g[m] = ng; st[m] = sid; came[m] = n; hpush(m, ng + 1.35 * hfun(m)); }
      }
    }
    const end = found ? to : best;
    if (end === from) return null;
    const out = []; for (let n = end; n >= 0; n = came[n]) out.push(n);
    out.reverse(); out.partial = !found;
    return out;
  }
  /* can a body walk the straight line between two nodes? */
  function walkLine(nav, a, b) {
    if ((nav.nflag[a] & 1) || (nav.nflag[b] & 1)) return false;
    const pa = posOf(nav, a), pb = posOf(nav, b);
    const len = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]), steps = Math.ceil(len / 0.25);
    let h = pa[1];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, n = nodeAt(nav, pa[0] + (pb[0] - pa[0]) * t, pa[2] + (pb[2] - pa[2]) * t, h, STEP + 0.03);
      if (n < 0) return false;
      h = nav.nh[n];
    }
    return Math.abs(h - pb[1]) <= STEP + 0.05;
  }
  /* node ids -> waypoints [x, y, z], corners cut where a body can walk the chord */
  function smooth(nav, ids) {
    if (!ids || !ids.length) return [];
    const out = []; let i = 0;
    while (i < ids.length - 1) {
      let j = Math.min(ids.length - 1, i + 36);
      while (j > i + 1 && !walkLine(nav, ids[i], ids[j])) j = i + Math.max(1, (j - i) >> 1);
      out.push(posOf(nav, ids[j])); i = j;
    }
    return out;
  }
  /* a walkable node somewhere in a ring round a point */
  function randomNear(nav, x, z, rMin, rMax, yMax, rnd) {
    for (let t = 0; t < 24; t++) {
      const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
      const c = cellOf(nav, x + Math.cos(a) * r, z + Math.sin(a) * r); if (c < 0) continue;
      for (let n = nav.first[c]; n >= 0; n = nav.nnext[n]) if (!(nav.nflag[n] & 1) && nav.reach[n] && (yMax === undefined || nav.nh[n] <= yMax)) return n;
    }
    return -1;
  }
  /* ground height under a moving body: the node whose height is nearest the one it had */
  function heightAt(nav, x, z, y) { const n = nodeAt(nav, x, z, y, STEP + 0.25, true); return n < 0 ? null : nav.nh[n]; }

  /* standing on a flight (and not on a floor that happens to share the cell) */
  function isStair(nav, x, z, y) {
    const n = nodeAt(nav, x, z, y, 0.5, true);
    return n >= 0 && (nav.nflag[n] & 1) === 1 && nodeAt(nav, x, z, y, 0.3, false) < 0;
  }
  return { get, ensure, buildSync, los, nodeAt, nearest, posOf, path, smooth, walkLine, randomNear, heightAt, roofed, isStair,
           neighbours, NS, STEP, _cache: cache };
};
