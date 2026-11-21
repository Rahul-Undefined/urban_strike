/* Blood — the pools left where operators die (v2.16.0).

   Rahul: "Blood lekar aao game mei ... map pe jaha avatar die hua h waha blood
   marks hona chahiye aur jitna log uss point pe maarega blood stains aur
   badhna chahiye taki intensive game bane, aur woh blood stains entire match
   mei rehna chahiye aur blood stains drop ke jaisa nahi ki ek acha khasa for
   reference 5-8 litres blood gira hai waisa dikhna chahiye." And: "applicable
   on the maps and all modes."

   WHAT IT IS. The server keeps the list (server/lib/blood.js): a pool is
   [x, y, z, n] — where a body was and how many have died there. It arrives on
   the 'death' event and, for a late joiner, with match start. This file finds
   the FLOOR under each point (one ray down through the world, so a death on a
   roof stains the roof and a death in mid-air stains what is underneath) and
   draws the pool there.

   HOW BIG. Five to eight litres on a hard floor is a pool, not a spatter:
   a single death spreads to about 2.4 m across. Each further death at the
   same place widens it (SIZE below), to a ceiling of 7.5 m — a doorway people
   keep dying in ends up painted wall to wall.

   WHAT IT COSTS. ONE mesh, ONE material, ONE texture for every pool on the
   map: each pool is a quad in a shared geometry, so a hundred pools are a
   single draw call. The texture is painted once (four different pools in one
   512 px atlas). A pool SPREADS for a few seconds when it is made or fed;
   only pools that are spreading are touched in a frame, and when none is the
   update returns at its first line. Nothing is ever removed during a match —
   that is the request — and the geometry is sized for the server's ceiling. */
var Blood = (function () {
  'use strict';
  var MAX = 260;                       // the server's ceiling (server/lib/blood.js)
  var LIFT = 0.03;                     // m above the floor: clear of z-fighting, below a boot sole
  var SPREAD = 4.5;                    // s for a pool to reach its size
  var scene = null, mesh = null, geo = null, pos = null, uv = null, tex = null;
  var pools = [];                      // by the server's index: { x, y, z, n, rot, cell, size, from, to, t, ok }
  var live = [];                       // indices still spreading
  var _from = null, _down = null;

  /* how wide a pool with n deaths in it is, in metres */
  function SIZE(n) { return Math.min(7.5, 2.4 * Math.pow(Math.max(1, n), 0.42)); }
  /* a small repeatable generator: pool k looks the same on every screen */
  function rng(seed) { var s = (seed * 2654435761) >>> 0; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  /* ---- the picture: four pools in one atlas, painted once ---- */
  function paint() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 512;
    var g = cv.getContext('2d'); if (!g) return null;
    for (var cell = 0; cell < 4; cell++) {
      var r = rng(cell * 7 + 3), ox = (cell % 2) * 256, oy = (cell >> 1) * 256, cx = ox + 128, cy = oy + 128, i;
      g.save(); g.beginPath(); g.rect(ox, oy, 256, 256); g.clip();
      /* the body of the pool: lobes that overlap into one uneven shape */
      var lobes = [];
      for (i = 0; i < 13; i++) { var a = r() * 6.283, d = r() * 34 + (i < 4 ? 0 : 16); lobes.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.86, 34 + r() * 30]); }
      /* a thin wet margin first, then the pool, then its deep middle */
      g.fillStyle = 'rgba(78,5,5,0.55)';
      for (i = 0; i < lobes.length; i++) { g.beginPath(); g.arc(lobes[i][0], lobes[i][1], lobes[i][2] + 7, 0, 6.283); g.fill(); }
      g.fillStyle = 'rgba(94,3,3,0.97)';
      for (i = 0; i < lobes.length; i++) { g.beginPath(); g.arc(lobes[i][0], lobes[i][1], lobes[i][2], 0, 6.283); g.fill(); }
      var deep = g.createRadialGradient(cx, cy, 8, cx, cy, 92);
      deep.addColorStop(0, 'rgba(34,0,0,0.94)'); deep.addColorStop(0.6, 'rgba(56,1,1,0.6)'); deep.addColorStop(1, 'rgba(80,2,2,0)');
      g.fillStyle = deep;
      for (i = 0; i < lobes.length; i++) { g.beginPath(); g.arc(lobes[i][0], lobes[i][1], lobes[i][2] - 5, 0, 6.283); g.fill(); }
      /* runs and thrown splashes leaving the pool */
      g.fillStyle = 'rgba(92,3,3,0.95)';
      for (i = 0; i < 7; i++) {
        var ang = r() * 6.283, len = 26 + r() * 34, w0 = 5 + r() * 6, sx = cx + Math.cos(ang) * 70, sy = cy + Math.sin(ang) * 62;
        g.save(); g.translate(sx, sy); g.rotate(ang); g.beginPath(); g.ellipse(len / 2, 0, len / 2, w0, 0, 0, 6.283); g.fill();
        g.beginPath(); g.arc(len + 5 + r() * 8, (r() - 0.5) * 6, 2.5 + r() * 4, 0, 6.283); g.fill(); g.restore();
      }
      for (i = 0; i < 16; i++) { var a2 = r() * 6.283, d2 = 84 + r() * 34; g.beginPath(); g.arc(cx + Math.cos(a2) * d2, cy + Math.sin(a2) * d2, 1.5 + r() * 4.5, 0, 6.283); g.fill(); }
      /* it is wet: a few pale glints lying on the surface */
      g.strokeStyle = 'rgba(255,170,160,0.10)'; g.lineCap = 'round';
      for (i = 0; i < 4; i++) { var gx = cx + (r() - 0.5) * 90, gy = cy + (r() - 0.5) * 80, g0 = r() * 6.283; g.lineWidth = 1.5 + r() * 2; g.beginPath(); g.arc(gx, gy, 16 + r() * 22, g0, g0 + 0.5 + r() * 0.4); g.stroke(); }
      g.restore();
    }
    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearMipMapLinearFilter; t.generateMipmaps = true;
    return t;
  }

  function init(sc) {
    reset();
    scene = sc;
    if (!scene || typeof THREE === 'undefined' || typeof document === 'undefined') return;
    if (!tex) tex = paint();
    if (!tex) return;
    geo = new THREE.BufferGeometry();
    pos = new THREE.BufferAttribute(new Float32Array(MAX * 12), 3);
    uv = new THREE.BufferAttribute(new Float32Array(MAX * 8), 2);
    var idx = new Uint16Array(MAX * 6), nor = new Float32Array(MAX * 12);
    for (var k = 0; k < MAX; k++) {
      idx.set([k * 4, k * 4 + 2, k * 4 + 1, k * 4, k * 4 + 3, k * 4 + 2], k * 6);
      for (var v = 0; v < 4; v++) nor[k * 12 + v * 3 + 1] = 1;
    }
    geo.setAttribute('position', pos); geo.setAttribute('uv', uv);
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    /* Phong, for one reason: a flat wet surface should catch the sun */
    var mat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, depthWrite: false, shininess: 70, specular: 0x4a2a2a,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;        // one mesh spans the map; its quads are cheap, a wrong bounding sphere is not
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
  /* geometry and material are this match's; the texture is kept (it is the same four pools every match) */
  function reset() {
    if (mesh && mesh.parent) mesh.parent.remove(mesh);
    if (geo) geo.dispose();
    if (mesh && mesh.material) mesh.material.dispose();
    mesh = null; geo = null; pos = null; uv = null; scene = null;
    pools = []; live = [];
  }

  function floorUnder(x, y, z) {
    if (typeof World === 'undefined' || !World.rayHit) return null;
    if (!_from) { _from = new THREE.Vector3(); _down = new THREE.Vector3(0, -1, 0); }
    _from.set(x, y + 0.3, z);
    var hit = World.rayHit(_from, _down, 60);
    return hit && hit.point ? hit.point.y : null;
  }
  function write(k) {
    var p = pools[k]; if (!p || !p.ok || !pos) return;
    var h = p.size / 2, c = Math.cos(p.rot) * h, s = Math.sin(p.rot) * h, y = p.fy + LIFT + (k % 7) * 0.0015, o = k * 12, a = pos.array;
    a[o] = p.x - c + s;      a[o + 1] = y; a[o + 2] = p.z - s - c;
    a[o + 3] = p.x + c + s;  a[o + 4] = y; a[o + 5] = p.z + s - c;
    a[o + 6] = p.x + c - s;  a[o + 7] = y; a[o + 8] = p.z + s + c;
    a[o + 9] = p.x - c - s;  a[o + 10] = y; a[o + 11] = p.z - s + c;
    pos.needsUpdate = true;
  }
  /* one pool from the server: b = [index, x, y, z, n]. `quiet` = it was already there when we arrived (no spreading) */
  function add(b, quiet) {
    if (!b || !pos || !(b[0] >= 0) || b[0] >= MAX) return;
    var k = b[0] | 0, p = pools[k];
    if (!p) {
      var r = rng(k + 11);
      p = pools[k] = { x: b[1], y: b[2], z: b[3], n: 0, rot: r() * 6.283, cell: (r() * 4) | 0, size: 0, from: 0, to: 0, t: 1, ok: false, fy: 0 };
      var fy = floorUnder(p.x, p.y, p.z);
      if (fy === null) return;                     // nothing underneath (off the edge of the world): no stain
      p.fy = fy; p.ok = true;
      var u0 = (p.cell % 2) * 0.5, v0 = 1 - ((p.cell >> 1) + 1) * 0.5, o = k * 8, a = uv.array;
      a[o] = u0; a[o + 1] = v0; a[o + 2] = u0 + 0.5; a[o + 3] = v0; a[o + 4] = u0 + 0.5; a[o + 5] = v0 + 0.5; a[o + 6] = u0; a[o + 7] = v0 + 0.5;
      uv.needsUpdate = true;
      if (k + 1 > geo.drawRange.count / 6) geo.setDrawRange(0, (k + 1) * 6);
    }
    if (!p.ok) return;
    if (b[4] > p.n || p.x !== b[1] || p.z !== b[3]) {
      p.n = Math.max(p.n, b[4] | 0); p.x = b[1]; p.z = b[3];
      p.to = SIZE(p.n);
      if (quiet) { p.size = p.to; p.t = 1; write(k); }
      else { p.from = p.size > 0 ? p.size : p.to * 0.28; p.t = 0; if (live.indexOf(k) < 0) live.push(k); }
    }
  }
  /* the whole list, for a match joined late: [[x, y, z, n], ...] by index */
  function sync(list) {
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) if (list[i]) add([i, list[i][0], list[i][1], list[i][2], list[i][3]], true);
  }
  function update(dt) {
    if (!live.length) return;
    for (var i = live.length - 1; i >= 0; i--) {
      var k = live[i], p = pools[k];
      p.t = Math.min(1, p.t + dt / SPREAD);
      var e = 1 - Math.pow(1 - p.t, 3);            // fast at first, then it creeps
      p.size = p.from + (p.to - p.from) * e;
      write(k);
      if (p.t >= 1) live.splice(i, 1);
    }
  }
  return { init: init, reset: reset, add: add, sync: sync, update: update, SIZE: SIZE, MAX: MAX,
    _pools: function () { return pools; }, _mesh: function () { return mesh; }, _live: function () { return live; } };
})();
