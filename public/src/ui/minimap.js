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

  /* ===== v10.13 - WORLD AND SCALE FOLLOW THE MAP =====

     Rahul: "minimap in killhouse and other map needs to be fixed properly".

     WORLD was a hardcoded 100 — Urban's half-extent, written when Urban was
     the only map. Every other map has since disagreed with it:

       urban 100   rural 150   metro 100   killhouse 32   sunsetrow 34

     On rural the outer 50 m of the world simply had no minimap: the baked
     canvas stopped at 100 and a third of the map was off the edge of it. On
     killhouse the opposite — a 64 x 34 m building drawn into a 200 x 200 m
     canvas, so the whole map was a smudge in the middle of the radar occupying
     about a ninth of the area, and the full map (M) was mostly empty grey.

     Both come from the same line, and the fix has to move SCALE as well as
     WORLD. Leaving SCALE at 3 px/m and shrinking WORLD would fix the extents
     and leave killhouse's radar showing a 21 m circle — closer than the map is
     wide. The radar should show a comparable slice of the world whatever the
     map, so px-per-metre scales inversely with the world size and is clamped:
     the offscreen canvas is WORLD*2*SCALE on a side and an unclamped small map
     would mint a needlessly large one.

     Read from CFG.MAPS[map].bound, which is the SAME number the out-of-bounds
     ring and the airdrop clamp use, so the minimap cannot disagree with where
     the world actually ends. */
  var WORLD = 100;
  function applyMapExtent() {
    var m = (typeof World !== 'undefined' && World.builtMap) || 'urban';
    var b = (CFG.MAPS[m] && CFG.MAPS[m].bound) || 100;
    var wasWorld = WORLD, wasScale = SCALE;
    WORLD = b;
    /* 3.0 px/m at 100 m is the look everything was tuned against. Hold the
       offscreen canvas near that pixel budget rather than the scale, so a
       32 m map gets a much closer radar and a 150 m map does not mint a
       450 px-per-side bake for no benefit. */
    SCALE = Math.max(2.0, Math.min(7.0, 300 / b));
    if (WORLD !== wasWorld || SCALE !== wasScale) invalidate();
    return WORLD;
  }
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
    /* v10.13: resolve the extent HERE, immediately before the bake that
       depends on it. bakeStatic is called from init() (before any map exists),
       from the draw path when `off` is null, and after World.reset() — putting
       the call anywhere else leaves one of those three baking at the previous
       map's scale. */
    applyMapExtent();
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

    /* ===== v9.10: THE MARKER BEARING, ON THE DIAL =====
       A pin you can only see by opening the full map is a pin you check once
       and then forget, because opening the map costs you your view of the
       world while the match keeps running. So a team marker also rides the
       radar: inside its range it sits where it really is, and beyond that it
       clamps to the rim as a BEARING with the distance in metres. That turns
       "someone marked a spot" into something you can act on while moving. */
    liveMarks().forEach(function (m) {
      var dxw = m.x - PlayerCtl.pos.x, dzw = m.z - PlayerCtl.pos.z;
      var dist = Math.hypot(dxw, dzw);
      var sn = Math.sin(-PlayerCtl.yaw), cs = Math.cos(-PlayerCtl.yaw);
      var lx = dxw * cs - dzw * sn, lz = dxw * sn + dzw * cs;
      var px = lx * SCALE, py = lz * SCALE;
      var rad = Math.hypot(px, py);
      var clamped = rad > R - 8;
      if (clamped) { var k = (R - 8) / (rad || 1); px *= k; py *= k; }
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.translate(cx + px, cy + py);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(5, 4); ctx.lineTo(-5, 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      if (clamped) {
        ctx.fillStyle = '#ffd166';
        ctx.font = '600 9px Rajdhani, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(Math.round(dist) + 'm', 0, 14);
      }
      ctx.restore();
    });

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

  /* ===== v9.10 — TEAM MAP MARKERS =====
     Click the full map in a team mode and every team-mate gets a pin, with a
     bearing arrow on their compass so it is useful with the map CLOSED — which
     is where it matters, because the map does not pause the match.

     Only one marker per player is kept: the point is "go here", and a map that
     accumulates eleven pins is a map nobody reads. A marker expires after
     MARK_TTL so a stale call-out does not outlive the fight it was about. */
  var MARK_TTL = 45000;
  var marks = {};                    // player id -> { x, z, at, name }

  /* v10.13: `kind` distinguishes a planning mark (click the full map) from an
     enemy spot (crosshair callout). An enemy spot is a SNAPSHOT of where
     somebody was, so it expires in a third of the time — a stale enemy marker
     that looks current is worse than none, because the team pushes onto it. */
  function addMark(m) {
    if (!m) return;
    marks[m.id] = { x: m.x, z: m.z, at: performance.now(), name: m.name || 'Squad',
                    kind: m.kind || 'spot', dist: m.dist || 0 };
  }
  function liveMarks() {
    var out = [], t = performance.now();
    for (var k in marks) {
      var ttl = marks[k].kind === 'enemy' ? 5000 : MARK_TTL;
      if (t - marks[k].at > ttl) { delete marks[k]; continue; }
      out.push(marks[k]);
    }
    return out;
  }
  function clearMarks() { marks = {}; }
  var lastSeen = {};          // id -> {x, z, t} for the LAST KNOWN rings

  /* Placing one. The map is drawn north-up over the whole world, so the screen
     -> world transform is the exact inverse of sx/sz in drawFull; deriving it
     from the same W and WORLD is what keeps a pin under the cursor when the
     window is resized. */
  /* v10.10 NUKE TARGETING reuses this transform rather than writing a second
     one. A duplicate screen->world mapping is a duplicate that drifts: the
     comment above exists because deriving it from the same W and WORLD is the
     only thing that keeps a pin under the cursor on resize, and a nuke landing
     where the player did not click is worse than a pin doing it. */
  var nukeAim = false;
  function setNukeAim(on) { nukeAim = !!on; if (fullCv) fullCv.style.cursor = nukeAim ? 'crosshair' : ''; }
  function nukeAiming() { return nukeAim; }

  function screenToWorld(clientX, clientY) {
    var r = fullCv.getBoundingClientRect();
    var W = r.width, S = W / (WORLD * 2);
    var x = (clientX - r.left) / S - WORLD;
    var z = (clientY - r.top) / S - WORLD;
    if (Math.abs(x) > WORLD || Math.abs(z) > WORLD) return null;
    return { x: x, z: z };
  }

  function markAt(clientX, clientY) {
    if (!fullOn || !fullCv) return;
    /* v10.15: the click-to-target branch is gone. N calls the strike directly
       and the server aims it — see ui.js nukeToggleAim. setNukeAim/nukeAiming
       remain as no-ops so nothing that still calls them throws; screenToWorld
       stays because it is the only correct screen-to-world transform in the
       file and a future feature should reuse it rather than write a second. */
    var modeCfg = CFG.MODES[(Net.getMatch() || {}).mode];
    if (!modeCfg || !modeCfg.teams) return;          // no sides, no shared marker
    var r = fullCv.getBoundingClientRect();
    var W = r.width, S = W / (WORLD * 2);
    var x = (clientX - r.left) / S - WORLD;
    var z = (clientY - r.top) / S - WORLD;
    if (Math.abs(x) > WORLD || Math.abs(z) > WORLD) return;
    Net.mark(x, z);
    /* Shown immediately rather than waiting for the round trip. The server
       relays to the whole team including the sender, so this is replaced by the
       authoritative copy a moment later. */
    addMark({ id: 'self', x: x, z: z, name: 'You' });
  }

  function toggleFull() {
    fullCv = fullCv || document.getElementById('fullmap');
    if (!fullCv) return;
    if (!fullCv._markBound) {
      fullCv._markBound = 1;
      fullCv.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        markAt(e.clientX, e.clientY);
      });
      /* Touch too: the map is the one screen a phone player can realistically
         aim at, and a marker is the one thing they can contribute without
         precise aim. */
      fullCv.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        e.preventDefault();
        markAt(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
    }
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

    /* v9.4: districts for WHICHEVER map is loaded, not urban only.
       This was correct when DISTRICTS held one map's regions — drawing Urban's
       rectangles over Metro would have been worse than drawing nothing. Metro
       has its own twelve regions as of v9.3, and `listFor(map)` hands back the
       right set (or null for Rural, which has landmarks rather than a grid).
       Without this the map Rahul opened showed named streets on Urban and a
       blank grid on Metro, which reads as the feature being broken. */
    var dList = (typeof DISTRICTS !== 'undefined' && DISTRICTS.listFor)
      ? DISTRICTS.listFor(mapNow) : (mapNow === 'urban' ? DISTRICTS.list : null);
    if (dList && dList.length) {
      g.lineWidth = 1;
      dList.forEach(function (d) {
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
    /* ===== v9.5 — TWO SWITCHES, NOT ONE =====

       v9.2 hid every contact in team modes; v9.4 let Last Stand opt back in.
       Both were wrong in the same way: they treated "where is my squad" and
       "where is the enemy" as one piece of information when they are opposites.

       Rahul: "In the team modes like squad, team battle, bot with teams, team
       location should show on the big Map ... Enemy location should only show
       on big Map in free to all matches."

       That is exactly right, and it is a better rule than either of mine:
         - YOUR OWN TEAM is not intel, it is coordination. A squad that cannot
           see itself on the map cannot regroup, and hiding it made team modes
           worse to play without making them fairer.
         - THE ENEMY is intel, and a live overhead readout of it in a match
           that never pauses is the thing worth removing.
       In free-for-all there is no team, so everyone is an enemy and the map is
       the mode's whole anti-camping mechanic — enemies stay visible there.

       Last Stand keeps `fullMapContacts` and therefore keeps enemies too, for
       the reason recorded in world.config.js. */
    var teamMode = !!(modeCfg && modeCfg.teams);
    var showAllies  = true;                       // your own side, always
    var showEnemies = !teamMode || !!(modeCfg && modeCfg.fullMapContacts);

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

    Net.eachRemote(function (id, r) {
      var ally = myTeam && r.team === myTeam;
      /* The one line that splits the two switches. An ally is drawn in every
         mode; an enemy only where the mode allows it. */
      if (!(ally ? showAllies : showEnemies)) return;
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
    /* MARKERS. Drawn last so they sit over the terrain and the contacts, with
       a pulse keyed to age — a fresh call-out should catch the eye and a minute
       old one should not. */
    liveMarks().forEach(function (m) {
      var age = (performance.now() - m.at) / MARK_TTL;
      var mx = sx(m.x), mz = sz(m.z);
      var pulse = 1 + Math.sin(performance.now() / 220) * 0.12;
      g.save();
      g.globalAlpha = Math.max(0.35, 1 - age);
      g.strokeStyle = '#ffd166'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(mx, mz, 9 * pulse, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(mx - 14, mz); g.lineTo(mx - 5, mz);
      g.moveTo(mx + 5, mz); g.lineTo(mx + 14, mz);
      g.moveTo(mx, mz - 14); g.lineTo(mx, mz - 5);
      g.moveTo(mx, mz + 5); g.lineTo(mx, mz + 14); g.stroke();
      g.fillStyle = '#ffd166';
      g.font = '600 11px Rajdhani, sans-serif'; g.textAlign = 'center';
      g.fillText(m.name, mx, mz - 18);
      g.restore();
    });

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
           addMark: addMark, clearMarks: clearMarks, liveMarks: liveMarks,
           toggleFull: toggleFull, drawFull: drawFull, isFullOpen: isFullOpen,
           setNukeAim: setNukeAim, nukeAiming: nukeAiming };
})();
