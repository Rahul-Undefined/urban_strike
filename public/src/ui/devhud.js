/* devhud.js — permanent developer overlay.  v8.9

   WHY THIS EXISTS
   ---------------
   This project's failure signature is "automated gates pass, the browser
   disagrees". Closing that gap means every browser screenshot has to carry
   enough information to be reproduced headlessly. Until now a bug report was
   a picture and a guess; the district signboards helped, but only where a
   board happened to be in frame.

   This panel makes every screenshot a precise bug report.

   COST
   ----
   Zero WebGL. Zero geometry. Zero draw calls, triangles, shadow casters or
   colliders. It is one absolutely-positioned <div> of text.

   When hidden, update() returns on its first line and does nothing at all.
   When shown, it recomputes at REFRESH_HZ (6/sec), not per frame; between
   refreshes it also returns immediately. One refresh is a single linear pass
   over World.colliders (~3.2k entries on urban), which is ~20k comparisons
   six times a second. That is below measurement noise on an i5.

   KEYS
   ----
   F3   toggle the panel
   F4   copy the current readout to the clipboard (so coordinates get pasted,
        not re-typed off a screenshot)

   READOUT
   -------
   XYZ       player feet position
   DIST      DISTRICTS.nameAt() — the same string the gates print
   DECK      top y of the surface directly under the feet, and how far below
   FLOOR     how many distinct deck tops exist in this x/z column at or below
             the feet. Ground is F0, first slab F1, and so on. This is derived,
             not authored: there is no building registry in the codebase, so
             the panel reports what is measurable rather than inventing a name.
   COLUMN    total decks stacked in this x/z column, and the highest top.
             "3 decks, top 10.15" while you stand at F1 means two more above.
   HEAD      clearance from the top of the head to the nearest solid above.
             This is the direct read-out for the Milestone A defects "roof slab
             blocking stair exit", "stairs ending underneath slabs" and the
             tracked headroom class. Anything under ~0.30 is a blocker.
   STAIR     if a recorded flight from World._stairs() covers this x/z: its
             index, top y, and whether a deck exists within reach of that top.
             "no deck" here is the arrival defect, live, under your feet.
   GND       grounded flag straight off the controller.

   DO NOT make this depend on the render loop's dt, or on anything that only
   exists while playing. It must survive being toggled on in a paused match.  */
var DevHUD = (function () {
  var REFRESH_HZ = 6;
  var el = null, on = false, last = 0, text = '';

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'devhud';
    /* Inline styles on purpose: this file is self-contained so it can be
       deleted in one move without leaving orphan CSS behind. */
    el.style.cssText = [
      'position:fixed', 'left:8px', 'top:150px', 'z-index:40',
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace',
      'color:#cfe6ff', 'background:rgba(6,12,20,0.62)',
      'border:1px solid rgba(120,180,240,0.28)', 'border-radius:3px',
      'padding:6px 9px', 'white-space:pre', 'pointer-events:none',
      'letter-spacing:0.2px', 'text-shadow:0 1px 2px rgba(0,0,0,0.9)',
      'display:none'
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function fmt(n, d) { return (n < 0 ? '' : ' ') + n.toFixed(d === undefined ? 2 : d); }

  /* One linear pass. Collider layout is [x0,y0,z0,x1,y1,z1,...]; c[4] is the
     top face and c[1] the bottom, matching World._colliders() everywhere else
     in this project. */
  function probe(px, py, pz, feetY, headY) {
    var cols = (typeof World !== 'undefined' && World.colliders) ? World.colliders : null;
    var r = { deck: null, below: 0, column: 0, top: null, head: null };
    if (!cols) return r;
    var tops = [], bottoms = [], i, c;
    for (i = 0; i < cols.length; i++) {
      c = cols[i];
      if (px < c[0] - 0.02 || px > c[3] + 0.02) continue;
      if (pz < c[2] - 0.02 || pz > c[5] + 0.02) continue;
      tops.push(c[4]);
      bottoms.push(c[1]);
      // best supporting surface at or just under the feet
      if (c[4] <= feetY + 0.35 && (r.deck === null || c[4] > r.deck)) r.deck = c[4];
    }
    if (!tops.length) return r;

    /* The ceiling is the nearest underside above the SURFACE, not above the
       player's head. Measuring from the head is self-defeating: a slab 1.6 m
       over the deck is the exact defect being hunted, and it sits BELOW a
       1.8 m player's head, so a head-relative filter throws it away and the
       panel cheerfully reports open sky at a spot the stair gate flags. This
       cost one iteration of tools/verify-devhud.js to catch. */
    var ref = (r.deck === null ? feetY : r.deck) + 0.05;
    for (i = 0; i < bottoms.length; i++) {
      if (bottoms[i] > ref && (r.head === null || bottoms[i] < r.head)) r.head = bottoms[i];
    }
    tops.sort(function (a, b) { return a - b; });
    // distinct deck tops, 0.25 m apart, so a stair tread cluster is not 20 floors
    var distinct = [];
    for (i = 0; i < tops.length; i++) {
      if (!distinct.length || tops[i] - distinct[distinct.length - 1] > 0.25) distinct.push(tops[i]);
    }
    r.column = distinct.length;
    r.top = distinct[distinct.length - 1];
    for (i = 0; i < distinct.length; i++) if (distinct[i] <= feetY + 0.35) r.below++;
    return r;
  }

  function stairAt(px, pz, feetY) {
    if (typeof World === 'undefined' || !World._stairs) return null;
    var list = World._stairs(), i, f, x0, x1, z0, z1;
    for (i = 0; i < list.length; i++) {
      f = list[i];
      x0 = Math.min(f.sx, f.endX) - f.width / 2; x1 = Math.max(f.sx, f.endX) + f.width / 2;
      z0 = Math.min(f.sz, f.endZ) - f.width / 2; z1 = Math.max(f.sz, f.endZ) + f.width / 2;
      if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
      if (feetY < f.sy - 1.2 || feetY > f.topY + 1.6) continue;
      return { i: i, f: f };
    }
    return null;
  }

  /* Does a standable deck exist within a player-step of this flight's top?

     THE SAME QUESTION tools/verify-stairs-quality.js ASKS, AND IT MUST BE
     ASKED THE SAME WAY. The first draft of this function scanned raw
     colliders for anything near the top face. That is precisely the v8.3 bug
     the gate's own comment records: the flight's OWN last tread satisfies
     "something to stand on near the top", so every staircase passes and the
     panel reports "ok" while standing on the one flight in urban that the
     gate flags as arriving nowhere. It did exactly that before this rewrite.

     So: real decks only (top face >= 1.0 m2, a tread is not a deck), the
     flight's own footprint and landing excluded, measured rectangle to
     rectangle from the area a player can actually stand on at the top.
     tools/verify-devhud.js pins the panel and the gate to the same verdict on
     a known-bad flight and a known-good one. If you change one, that gate
     will tell you the other no longer agrees. */
  function arrival(f) {
    var cols = (typeof World !== 'undefined' && World.colliders) ? World.colliders : null;
    if (!cols) return '?';
    var STEP = (CFG && CFG.MOVE) ? CFG.MOVE.step : 0.42;
    var PR = (CFG && CFG.PLAYER) ? CFG.PLAYER.radius : 0.35;

    // standing area at the top: last tread plus the landing
    var ax = f.endX - f.dirX * f.stepD, bx = f.endX + f.dirX * (f.landing || 0);
    var az = f.endZ - f.dirZ * f.stepD, bz = f.endZ + f.dirZ * (f.landing || 0);
    var hX = f.dirX ? 0 : f.width / 2, hZ = f.dirZ ? 0 : f.width / 2;
    var rx0 = Math.min(ax, bx) - hX, rx1 = Math.max(ax, bx) + hX;
    var rz0 = Math.min(az, bz) - hZ, rz1 = Math.max(az, bz) + hZ;

    // this flight's own footprint, including its landing
    var tx0 = Math.min(f.sx, f.endX) - f.width / 2 - 0.05;
    var tx1 = Math.max(f.sx, f.endX) + f.width / 2 + 0.05;
    var tz0 = Math.min(f.sz, f.endZ) - f.width / 2 - 0.05;
    var tz1 = Math.max(f.sz, f.endZ) + f.width / 2 + 0.05;

    var best = null, i, c, cx, cz, dx, dz, g;
    for (i = 0; i < cols.length; i++) {
      c = cols[i];
      if ((c[3] - c[0]) * (c[5] - c[2]) < 1.0) continue;          // tread, not deck
      if (c[4] - f.topY > STEP + 0.02 || c[4] - f.topY < -1.2) continue;
      cx = (c[0] + c[3]) / 2; cz = (c[2] + c[5]) / 2;
      if (cx > tx0 && cx < tx1 && cz > tz0 && cz < tz1 &&
          c[4] > f.baseY - 0.1 && c[4] < f.topY + 0.1) continue;  // own geometry
      dx = Math.max(c[0] - rx1, 0, rx0 - c[3]);
      dz = Math.max(c[2] - rz1, 0, rz0 - c[5]);
      g = Math.hypot(dx, dz);
      if (g > 3.0) continue;
      if (best === null || g < best) best = g;
    }
    if (best === null) return 'NO DECK in 3m';
    return best <= PR + 0.6 ? 'ok (' + best.toFixed(2) + 'm)' : 'gap ' + best.toFixed(2) + 'm  << SHORT';
  }

  function compose() {
    var P = (typeof PlayerCtl !== 'undefined') ? PlayerCtl.pos : null;
    if (!P) return 'devhud: no player';
    var halfY = (CFG && CFG.PLAYER ? CFG.PLAYER.standH : 1.8) / 2;
    var feetY = P.y - halfY, headY = P.y + halfY;
    var r = probe(P.x, P.y, P.z, feetY, headY);
    var mapNow = (typeof World !== 'undefined' && World.builtMap) ? World.builtMap : 'urban';
    var name = (typeof DISTRICTS !== 'undefined') ? (DISTRICTS.nameAt(P.x, P.z, mapNow) || ('(' + mapNow + ' — no districts)')) : '(no districts.config)';
    var map = (typeof World !== 'undefined' && World.builtMap) ? World.builtMap : '?';

    var L = [];
    L.push('X' + fmt(P.x) + '   Y' + fmt(P.y) + '   Z' + fmt(P.z) + '    [' + map + ']');
    L.push('DIST   ' + name);
    L.push('DECK   ' + (r.deck === null ? '-' :
      r.deck.toFixed(2) + '  (' + (feetY - r.deck).toFixed(2) + 'm under feet)'));
    L.push('FLOOR  F' + Math.max(0, r.below - 1));
    L.push('COLUMN ' + r.column + ' deck' + (r.column === 1 ? '' : 's') +
      (r.top === null ? '' : ', top ' + r.top.toFixed(2)));
    /* Clearance is measured from the SURFACE UNDERFOOT, not from the top of
       the head, and flagged against 1.9 m — the same constant HEAD in
       tools/verify-stairs-quality.js. Measuring from the head instead makes
       the panel disagree with the gate by exactly the player's height, which
       is how you end up sending map work to a place that was never broken. */
    var clear = (r.head === null || r.deck === null) ? null : r.head - r.deck;
    L.push('HEAD   ' + (r.head === null ? 'open sky' :
      (clear === null ? (r.head - headY).toFixed(2) + 'm over head' :
        clear.toFixed(2) + 'm over deck' + (clear < 1.9 ? '   << LOW (need 1.90)' : ''))));
    var s = stairAt(P.x, P.z, feetY);
    if (s) {
      L.push('STAIR  #' + s.i + '  ' + s.f.sy.toFixed(2) + ' -> ' + s.f.topY.toFixed(2) +
        '  ' + s.f.steps + ' steps  rise ' + s.f.stepH.toFixed(3) +
        '  w ' + s.f.width.toFixed(2));
      L.push('       top arrival: ' + arrival(s.f));
    }
    L.push('GND    ' + ((typeof PlayerCtl !== 'undefined' && PlayerCtl.grounded) ? 'yes' : 'no') +
      '        F3 hide  F4 copy');
    return L.join('\n');
  }

  return {
    toggle: function () {
      build();
      on = !on;
      el.style.display = on ? 'block' : 'none';
      last = 0;
      if (on) DevHUD.update(performance.now());
    },
    isOn: function () { return on; },
    /* Called every frame from the render loop. First line is the whole
       performance story: hidden costs one boolean test. */
    update: function (nowMs) {
      if (!on || !el) return;
      if (nowMs - last < 1000 / REFRESH_HZ) return;
      last = nowMs;
      text = compose();
      el.textContent = text;
    },
    copy: function () {
      if (!on) return;
      var t = text || compose();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t)['catch'](function () {});
      }
    }
  };
})();
