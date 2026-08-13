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
        var detected = CFG.MINIMAP.alwaysShowPlayers ||
          (now - r.lastShotAt) < CFG.NET.detectMs || dist < CFG.MINIMAP.proximity;
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

    /* v8.23 FIELD OF VIEW WEDGE — IN SCREEN SPACE, NOT WORLD SPACE.

       v8.22 drew this immediately after `ctx.rotate(-yaw)`, inside the rotated
       world layer. So the wedge inherited that rotation and pointed at a fixed
       WORLD bearing — it sat on north and stayed there while the player span,
       which is exactly what Rahul photographed.

       The dial is player-up: the facing is ALWAYS straight up on screen. So the
       wedge belongs outside the rotated frame, drawn with the self arrow, and
       it never rotates at all. Clipped to the dial so it cannot spill past the
       rim, and drawn before the arrow so the arrow stays on top. */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.clip();
    ctx.translate(cx, cy);
    var _cam = (typeof Game !== 'undefined' && Game.getCamera) ? Game.getCamera() : null;
    var fovRad = ((_cam && _cam.fov) || 75) * Math.PI / 180;
    var gW = ctx.createRadialGradient(0, 0, 4, 0, 0, R);
    gW.addColorStop(0, 'rgba(240,162,50,0.34)');
    gW.addColorStop(1, 'rgba(240,162,50,0.03)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -Math.PI / 2 - fovRad / 2, -Math.PI / 2 + fovRad / 2);
    ctx.closePath();
    ctx.fillStyle = gW;
    ctx.fill();
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
    /* v8.36 THE LABEL WAS BEING CLIPPED BY THE CIRCLE.

       It was drawn centred at a fixed 11px with no regard for how wide the name
       actually is, but the minimap is round and clipped to that circle. "NEAR
       IRONGATE DEPOT" is far wider than the chord available at the bottom of a
       circle, so both ends were sliced off and it read as "AR IRONGATE DEP".

       The usable width is the CHORD at the label's height, not the diameter —
       5px up from the bottom of a circle is a narrow slice. Measure the text,
       compare against that chord, and step the font down until it fits, with a
       floor so it never becomes unreadable; below the floor the name is
       ellipsised instead. */
    var labelY = SIZE - 6;
    var R0 = SIZE / 2;
    var dy = Math.abs(labelY - 3 - R0);                       // distance from centre line
    var chord = 2 * Math.sqrt(Math.max(1, R0 * R0 - dy * dy)) - 6;
    var size = 11;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold ' + size + 'px Rajdhani, sans-serif';
    while (ctx.measureText(dName).width > chord && size > 8) {
      size -= 0.5;
      ctx.font = 'bold ' + size + 'px Rajdhani, sans-serif';
    }
    if (ctx.measureText(dName).width > chord) {
      while (dName.length > 4 && ctx.measureText(dName + '\u2026').width > chord) {
        dName = dName.slice(0, -1);
      }
      dName += '\u2026';
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(dName, cx, labelY);
    ctx.fillStyle = 'rgba(240,200,140,0.96)';
    ctx.fillText(dName, cx, labelY);
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
  var lastSeen = {};          // id -> {x, z, t} for the LAST KNOWN rings

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

    /* ===== v8.24 EVERYONE ON THE BOARD =====

       Rahul asked for other players on the full map so it is usable for
       navigating toward a fight rather than only for learning the layout.

       It deliberately uses the SAME detection rule as the radar rather than
       revealing every enemy outright. Two reasons. Consistency: if the dial
       and the map disagree about whether a contact exists, one of them is
       lying and you stop trusting both. And a full map with permanent enemy
       dots is a wallhack with extra steps — it would delete flanking,
       holding an angle, and every reason to carry a sniper.

       So: allies always, named. Enemies when the radar would show them —
       they fired inside CFG.NET.detectMs or are within CFG.MINIMAP.proximity.
       Anything seen in the last eight seconds stays as a hollow LAST KNOWN
       ring at the place it was last seen, which is the part that actually
       helps you navigate toward a fight instead of guessing.

       v8.25: CFG.MINIMAP.alwaysShowPlayers is now TRUE. With two to four
       players on a 200 m map the detection rule left the board empty almost
       all the time, which reads as a broken feature rather than as stealth.
       The flag is read here and by the dial, so the two views can never
       disagree about whether a contact is shown. */
    /* ===== v9.2 THE FULL MAP IS NOT A TACTICAL FEED IN TEAM MODES =====

       The match does NOT pause while M is held. In a team or squad game that
       turned the full map into a permanent overhead readout of where every
       team-mate is and where every detected enemy was last seen — free
       information, refreshed live, with no cost for taking it. Rahul called it
       exactly right: it is running the gameplay.

       So contacts on the FULL map are now limited to modes with no sides —
       Free For All, Overrun, Last Stand Solo. The minimap is untouched and
       still shows everything it always did, because the dial is small, glanced
       at, and costs you your view of the world to read.

       WHAT THIS COSTS, stated plainly rather than discovered later: Last Stand
       Squads (lsq2/lsq4) was designed around this. Its entry in world.config.js
       says camping is answered by the map rather than by a timer — pressing M
       showed where everyone was, so hiding bought position, not safety. Those
       two modes are team-shaped, so they lose that. Elimination still
       terminates the match, but two squads that never seek each other can now
       stall much longer than before. If that turns out to matter in play, the
       fix is a mode flag (`fullMapContacts: true` on the Last Stand entries),
       not a special case wired in here.

       The own-position arrow below is deliberately NOT gated. Without it the
       full map stops being a map — you cannot orient on a layout you cannot
       locate yourself in, and your own position is not intel you could gain an
       advantage from. */
    var modeNow = (Net.getMatch() || {}).mode;
    var modeCfg = CFG.MODES[modeNow] || null;
    var showContacts = !(modeCfg && modeCfg.teams);

    var myTeam = Net.getMyTeam();
    var nowMs = performance.now();
    lastSeen = lastSeen || {};

    function marker(wx, wz, radius, fill, solid, label) {
      var mx = sx(wx), mz = sz(wz);
      g.beginPath();
      g.arc(mx, mz, radius, 0, 6.2832);
      if (solid) {
        g.fillStyle = fill; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.stroke();
      } else {
        g.lineWidth = 2; g.strokeStyle = fill; g.stroke();
      }
      if (label) {
        g.font = 'bold 11px Rajdhani, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.85)';
        g.strokeText(label, mx, mz - radius - 3);
        g.fillStyle = fill;
        g.fillText(label, mx, mz - radius - 3);
      }
    }

    if (showContacts) Net.eachRemote(function (id, r) {
      var ally = myTeam && r.team === myTeam;
      if (ally) {
        if (!r.alive) return;
        marker(r.renderPos.x, r.renderPos.z, 5, r.color || '#63d968', true, r.name || '');
        return;
      }
      var dx = r.renderPos.x - PlayerCtl.pos.x, dz = r.renderPos.z - PlayerCtl.pos.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var detected = r.alive && (CFG.MINIMAP.alwaysShowPlayers ||
        (nowMs - r.lastShotAt) < CFG.NET.detectMs || dist < CFG.MINIMAP.proximity);
      if (detected) {
        lastSeen[id] = { x: r.renderPos.x, z: r.renderPos.z, t: nowMs };
        marker(r.renderPos.x, r.renderPos.z, 5.5, '#e8563e', true, r.name || '');
      } else {
        var ls = lastSeen[id];
        if (ls && nowMs - ls.t < 8000) {
          g.save();
          g.globalAlpha = Math.max(0.18, 1 - (nowMs - ls.t) / 8000);
          marker(ls.x, ls.z, 6, 'rgba(232,86,62,0.95)', false, '');
          g.restore();
        }
      }
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
