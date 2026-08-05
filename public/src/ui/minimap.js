/* Minimap — rotating radar (player-up), zoomed on the local player.
   Static geometry is baked once from World.minimapShapes; per frame we only
   rotate/blit that image and draw dots. Enemies appear when they fired within
   3.5 s or are within 18 m; allies are always shown in their team color. */
var Minimap = (function () {
  var canvas = null, ctx = null;
  var off = null;             // baked static layer
  function invalidate() { off = null; }
  var SIZE = 200, R = 96;     // canvas px, radar radius
  var SCALE = 3.0;            // px per meter (the "zoom")
  var WORLD = 100;            // world half-extent
  var lastDraw = 0;
  var ready = false;

  function init() {
    canvas = document.getElementById('minimap');
    if (!canvas) return;
    canvas.width = SIZE; canvas.height = SIZE;
    ctx = canvas.getContext('2d');
    bakeStatic();
    ready = true;
  }

  function bakeStatic() {
    var px = Math.ceil(WORLD * 2 * SCALE);
    off = document.createElement('canvas');
    off.width = px; off.height = px;
    var g = off.getContext('2d');
    g.fillStyle = 'rgba(18,22,28,0.92)';
    g.fillRect(0, 0, px, px);
    // roads hinted as slightly lighter strips
    g.fillStyle = 'rgba(52,58,66,0.9)';
    if (World.builtMap === 'rural') {
      g.fillStyle = 'rgba(122,96,64,0.55)';
      g.fillRect((WORLD - 3.5) * SCALE, 0, 7 * SCALE, px);
      g.fillRect(0, (WORLD - 3.5) * SCALE, px, 7 * SCALE);
      g.fillStyle = 'rgba(52,118,150,0.7)';
      g.fillRect(0, (WORLD + 36) * SCALE, px, 12 * SCALE);
      g.fillRect((WORLD + 50) * SCALE, 0, 10 * SCALE, (WORLD + 48) * SCALE);
    } else {
      g.fillRect((WORLD - 7) * SCALE, 0, 14 * SCALE, px);
      g.fillRect(0, (WORLD - 7) * SCALE, px, 14 * SCALE);
    }
    /* Structures, drawn in TWO WEIGHTS. Buildings and long walls carry the
       strong tone; containers, vehicles and small structures sit back in a
       lighter one. A flat single-colour pass made a shipping container and an
       apartment block indistinguishable, which is most of why the map was
       unreadable even before it saturated. */
    var shapes = World.minimapShapes || [];
    var i, s, w, h;
    g.fillStyle = 'rgba(96,106,120,0.75)';
    for (i = 0; i < shapes.length; i++) {
      s = shapes[i]; w = s[2] - s[0]; h = s[3] - s[1];
      if (w * h >= 24) continue;
      g.fillRect((s[0] + WORLD) * SCALE, (s[1] + WORLD) * SCALE,
        Math.max(1.0, w * SCALE), Math.max(1.0, h * SCALE));
    }
    g.fillStyle = 'rgba(138,150,164,0.97)';
    for (i = 0; i < shapes.length; i++) {
      s = shapes[i]; w = s[2] - s[0]; h = s[3] - s[1];
      if (w * h < 24) continue;
      g.fillRect((s[0] + WORLD) * SCALE, (s[1] + WORLD) * SCALE,
        Math.max(1.5, w * SCALE), Math.max(1.5, h * SCALE));
    }
  }

  function dot(x, y, r, color, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  function update() {
    if (!ready) return;
    if (Net.getPhase() !== 'playing' || !World.isBuilt()) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      return;
    }
    var now = performance.now();
    if (now - lastDraw < 50) return; // ~20 fps is plenty for a radar
    lastDraw = now;

    var px = PlayerCtl.pos.x, pz = PlayerCtl.pos.z, yaw = PlayerCtl.yaw;
    var cx = SIZE / 2, cy = SIZE / 2;
    var myTeam = Net.getMyTeam();

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.clip();

    // rotated world layer (player-up)
    ctx.translate(cx, cy);
    ctx.rotate(-yaw);
    ctx.drawImage(off, (-px - WORLD) * SCALE, (-pz - WORLD) * SCALE);

    /* v8.22 FIELD OF VIEW WEDGE.

       The radar is player-up, so the direction you are facing is always
       straight up on the dial — which meant nothing on screen told you how
       much of what you could see was in front of you versus behind. A wedge
       matching the camera FOV makes the dial read the way every shooter's
       does: contacts inside the cone are ones you could already be looking at.

       Drawn first so dots and beacons sit on top of it, and inside the
       rotated frame so it stays welded to the facing rather than the world. */
    /* Read the LIVE camera fov, not a constant. game.js:314 lerps camera.fov
       toward a target every frame for ADS and sniper zoom, so a hard-coded 75
       would leave the wedge wide open while the player is scoped at 8 degrees
       — the dial would claim awareness the player does not have. */
    var _cam = (typeof Game !== 'undefined' && Game.getCamera) ? Game.getCamera() : null;
    var fovRad = ((_cam && _cam.fov) || 75) * Math.PI / 180;
    var g0 = ctx.createRadialGradient(0, 0, 4, 0, 0, R);
    g0.addColorStop(0, 'rgba(240,162,50,0.30)');
    g0.addColorStop(1, 'rgba(240,162,50,0.02)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -Math.PI / 2 - fovRad / 2, -Math.PI / 2 + fovRad / 2);
    ctx.closePath();
    ctx.fillStyle = g0;
    ctx.fill();

    // remote dots (drawn in world space inside the rotated frame)
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      var rx = (r.renderPos.x - px) * SCALE, rz = (r.renderPos.z - pz) * SCALE;
      if (rx * rx + rz * rz > (R + 14) * (R + 14)) return;
      var ally = myTeam && r.team === myTeam;
      if (ally) {
        dot(rx, rz, 4, r.color || '#63d968', true);
      } else {
        var dist = Math.sqrt((r.renderPos.x - px) * (r.renderPos.x - px) + (r.renderPos.z - pz) * (r.renderPos.z - pz));
        var detected = (now - r.lastShotAt) < CFG.NET.detectMs || dist < CFG.MINIMAP.proximity;
        if (detected) dot(rx, rz, 4.2, '#e8563e', true);
      }
    });

    // airdrop beacons — pulsing gold blips
    Pickups.getBeacons().forEach(function (b) {
      var bx = (b.x - px) * SCALE, bz = (b.z - pz) * SCALE;
      if (bx * bx + bz * bz > (R + 14) * (R + 14)) return;
      var pulse = 4 + Math.sin(now * 0.007) * 1.6;
      dot(bx, bz, pulse, '#f0c040', true);
    });
    ctx.restore();

    // self arrow (always centered, pointing up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#f2f5f8';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // rim + north marker
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.strokeStyle = 'rgba(240,162,50,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // world-north (0,-1) rotated by -yaw lands at (-sin yaw, -cos yaw)
    var nx = cx - Math.sin(yaw) * (R - 11), ny = cy - Math.cos(yaw) * (R - 11);
    ctx.fillStyle = 'rgba(235,240,246,0.9)';
    ctx.font = 'bold 12px Rajdhani, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    /* Where you are, in words. The signboards already carry these names in the
       world and every gate prints them, so the dial saying the same string ties
       a callout, a screenshot and a bug report to one place. Non-urban maps get
       the map label instead — DISTRICTS only describes Urban. */
    var mapNow = (World.builtMap || 'urban');
    var dName = (typeof DISTRICTS !== 'undefined') ? DISTRICTS.nameAt(px, pz, mapNow) : '';
    if (!dName) dName = (CFG.MAPS[mapNow] || {}).label || mapNow.toUpperCase();
    ctx.font = 'bold 11px Rajdhani, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(dName, cx, SIZE - 5);
    ctx.fillStyle = 'rgba(240,200,140,0.96)';
    ctx.fillText(dName, cx, SIZE - 5);
  }

  /* ===== v8.22 FULL MAP (M) =====

     The radar shows 32 m of a 200 m map. Rahul asked for a way to see the
     whole thing at once with district names and roads so the layout becomes
     memorable — the thing a spawn screen normally teaches you and this game
     never did.

     It reuses the SAME baked static layer the radar draws, so roads and
     structures cannot drift between the two views, and it is north-up rather
     than player-up because a memorised map has to have a fixed orientation.
     Pure 2D canvas: no WebGL, no geometry, nothing added to any budget. */
  var fullOn = false, fullCv = null, fullCtx = null;

  function toggleFull() {
    fullCv = fullCv || document.getElementById('fullmap');
    if (!fullCv) return;
    fullOn = !fullOn;
    fullCv.style.display = fullOn ? 'block' : 'none';
    if (fullOn) drawFull();
  }
  function isFullOpen() { return fullOn; }

  function drawFull() {
    if (!fullOn || !fullCv) return;
    if (!off) bakeStatic();
    var W = Math.min(window.innerWidth, window.innerHeight) * 0.86;
    fullCv.width = W; fullCv.height = W;
    fullCtx = fullCtx || fullCv.getContext('2d');
    var g = fullCtx, S = W / (WORLD * 2);          // screen px per metre
    g.clearRect(0, 0, W, W);
    g.save();
    g.globalAlpha = 0.97;
    g.drawImage(off, 0, 0, W, W);                  // north-up, whole world
    g.restore();

    var mapNow = (World.builtMap || 'urban');
    function sx(x) { return (x + WORLD) * S; }
    function sz(z) { return (z + WORLD) * S; }

    // district rectangles + names (urban only — DISTRICTS describes Urban)
    if (mapNow === 'urban' && typeof DISTRICTS !== 'undefined') {
      g.lineWidth = 1;
      DISTRICTS.list.forEach(function (d) {
        g.strokeStyle = 'rgba(240,162,50,0.32)';
        g.strokeRect(sx(d.x0), sz(d.z0), (d.x1 - d.x0) * S, (d.z1 - d.z0) * S);
        var mx = sx((d.x0 + d.x1) / 2), mz = sz((d.z0 + d.z1) / 2);
        g.font = 'bold 12px Rajdhani, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.strokeText(d.name, mx, mz);
        g.fillStyle = 'rgba(245,225,190,0.95)';
        g.fillText(d.name, mx, mz);
      });
    }

    // teammates, then you
    var myTeam = Net.getMyTeam();
    Net.eachRemote(function (id, r) {
      if (!r.alive) return;
      if (!(myTeam && r.team === myTeam)) return;
      g.beginPath();
      g.arc(sx(r.renderPos.x), sz(r.renderPos.z), 5, 0, 6.2832);
      g.fillStyle = r.color || '#63d968';
      g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.stroke();
    });

    var pxw = sx(PlayerCtl.pos.x), pzw = sz(PlayerCtl.pos.z);
    g.save();
    g.translate(pxw, pzw);
    g.rotate(PlayerCtl.yaw);
    g.beginPath();
    g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8);
    g.closePath();
    g.fillStyle = '#f2f5f8';
    g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.fill(); g.stroke();
    g.restore();

    // frame + title
    g.lineWidth = 3; g.strokeStyle = 'rgba(240,162,50,0.85)';
    g.strokeRect(1.5, 1.5, W - 3, W - 3);
    g.font = 'bold 15px Rajdhani, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(240,200,140,0.95)';
    g.fillText(((CFG.MAPS[mapNow] || {}).label || mapNow).toUpperCase() + '   —   N \u2191   —   M to close', 12, 10);
  }

  return { init: init, update: update, invalidate: invalidate,
           toggleFull: toggleFull, drawFull: drawFull, isFullOpen: isFullOpen };
})();
