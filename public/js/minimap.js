/* Minimap — rotating radar (player-up), zoomed on the local player.
   Static geometry is baked once from World.minimapShapes; per frame we only
   rotate/blit that image and draw dots. Enemies appear when they fired within
   3.5 s or are within 18 m; allies are always shown in their team color. */
var Minimap = (function () {
  var canvas = null, ctx = null;
  var off = null;             // baked static layer
  var SIZE = 200, R = 96;     // canvas px, radar radius
  var SCALE = 3.0;            // px per meter (the "zoom")
  var WORLD = 70;             // world half-extent
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
    g.fillRect((WORLD - 7) * SCALE, 0, 14 * SCALE, px);
    g.fillRect(0, (WORLD - 7) * SCALE, px, 14 * SCALE);
    // structures
    g.fillStyle = 'rgba(122,134,148,0.95)';
    var shapes = World.minimapShapes || [];
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      g.fillRect((s[0] + WORLD) * SCALE, (s[1] + WORLD) * SCALE,
        Math.max(1.5, (s[2] - s[0]) * SCALE), Math.max(1.5, (s[3] - s[1]) * SCALE));
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
        var detected = (now - r.lastShotAt) < 3500 || dist < 18;
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
  }

  return { init: init, update: update };
})();
