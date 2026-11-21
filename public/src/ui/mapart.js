/* MAP ART — v2.13. The game's own pictures and film, put where a player waits.

   Rahul sent an asset pack (wallpapers rendered from the game's maps, an 18 s
   intro film, a logo) and asked: "jab start match hota toh 5 seconds ka
   countdown hota h waha maps ka ek realistic moving photo aana chahiye, game
   start hota h toh ek chota sa video aana chahiye ... last scorecard mei bhi
   map ka design kaise aye socho ... without hampering the gameplay."

   WHERE EACH THING GOES, and why there:
     boot      the intro film, ONCE per browser session, behind a "click to
               start" card (a browser only plays sound after a click). Any key
               or click skips it. If the film cannot load or play, the menu
               opens anyway — nothing here can keep a player out of the game.
               It is NOT played before a match: eighteen seconds in front of
               every round would be the opposite of "without hampering".
     menu      the map wallpapers behind the menu, drifting and cross-fading.
               Runs only while the menu is on screen.
     countdown the five seconds before a match: the map you are about to play,
               full screen, as a living photograph — a slow push-in, a sweep
               of light, dust in the air — with its name. The number stays on
               top of it.
     loading   the same picture, still, under the loader bar, so countdown ->
               loading -> first frame is one continuous image, not three cuts.
     scorecard the same map again, dimmed and drifting, behind the result.

   The pictures are the pack's TEXT-FREE wallpapers scaled to 1920x1080 WebP
   (32-92 KB each, 0.8 MB for all twelve): the pack's own loading cards have
   "BUILD 2.11.0" and a map name painted into them, and there is none for
   Urban Small. Names and numbers are written by the game, so they are never
   stale. Nothing is fetched until it is about to be shown.

   Everything is DOM and CSS (assets/…, css/style.css "MAP ART"); no WebGL, no
   game state, no networking. Every entry point is guarded: a missing element
   is a no-op. */
var MapArt = (function () {
  var BASE = 'assets/maps/';
  var ART = {
    urban: ['urban_yards', 'urban_helipad', 'urban_trainyard'],
    urbansmall: ['urban_rooftops', 'urban_night'],
    urbansmall2: ['urbansmall2_street'],
    kasbah: ['kasbah_aerial', 'kasbah_alley', 'kasbah_walls', 'kasbah_night'],
    killhouse: ['killhouse_lane']
  };
  var MENU = ['kasbah_gate', 'urban_yards', 'kasbah_aerial', 'urban_night', 'kasbah_alley', 'urban_helipad'];
  var match = { map: 'urban', mode: '', label: 'Urban', pick: 'urban_yards', n: 0 };
  var deployEl = null;
  var deployHideT = 0;
  var menuT = 0;
  var menuI = 0;
  var menuTop = 0;
  var introEl = null;

  function $(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
  /* ABSOLUTE urls: these are also handed to the stylesheet through a custom
     property (--ma-art), and a relative url() in a custom property is resolved
     against css/style.css, not the page — it asked for /css/assets/… and got a
     404 (caught in the first browser run). */
  function root() { try { return new URL(BASE, document.baseURI).href; } catch (err) { return '/' + BASE; } }
  function src(name) { return root() + name + '.webp'; }
  function css(name) { return 'url("' + src(name) + '")'; }
  function mk(tag, cls, html) { var el = document.createElement(tag); if (cls) el.className = cls; if (html) el.innerHTML = html; return el; }
  function esc(text) { return String(text == null ? '' : text).replace(/[&<>]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]; }); }
  function preload(name, then) {
    var img = new Image();
    var doneOnce = false;
    var fire = function () { if (!doneOnce) { doneOnce = true; if (then) then(); } };
    img.onload = fire; img.onerror = fire;
    img.src = src(name);
    setTimeout(fire, 2500);                       // a slow picture never holds anything up
  }
  function listFor(mapId) { return ART[mapId] || ART.urban; }

  /* the lobby tells us what is about to be played; one picture is chosen per
     match and kept from the countdown to the scorecard */
  function setMatch(mapId, mapLabel, modeLabel) {
    var changed = mapId !== match.map;
    match.map = mapId || 'urban';
    match.label = mapLabel || match.map;
    if (modeLabel !== undefined) match.mode = modeLabel || '';
    if (changed || !match.pick || listFor(match.map).indexOf(match.pick) < 0) {
      var list = listFor(match.map);
      match.pick = list[match.n % list.length];
      preload(match.pick);                        // warm it while they are still in the staging area
    }
  }
  function nextMatchPicture() {
    match.n++;
    var list = listFor(match.map);
    match.pick = list[match.n % list.length];
  }

  /* ------------------------------------------------------------ the menu */
  function menuVisible() {
    var layer = $('menu-layer');
    return !!(layer && !layer.classList.contains('hidden') && !document.hidden);
  }
  function menuStep() {
    if (!menuVisible()) return;
    var holder = document.querySelector('.ma-menu');
    if (!holder) return;
    var slides = holder.children;
    var name = MENU[menuI % MENU.length];
    menuI++;
    preload(name, function () {
      var incoming = slides[1 - menuTop];
      var outgoing = slides[menuTop];
      incoming.style.backgroundImage = css(name);
      incoming.classList.remove('ma-run');
      void incoming.offsetWidth;                  // restart the drift on the picture coming in
      incoming.classList.add('ma-run', 'ma-show');
      outgoing.classList.remove('ma-show');
      menuTop = 1 - menuTop;
    });
  }
  function menuStart() {
    var backdrop = document.querySelector('#menu-layer .backdrop');
    if (!backdrop || document.querySelector('.ma-menu')) return;
    var holder = mk('div', 'ma-menu', '<div class="ma-slide"></div><div class="ma-slide"></div>');
    backdrop.insertBefore(holder, backdrop.firstChild);
    backdrop.classList.add('has-art');
    menuTop = 1;
    menuStep();
    menuT = setInterval(menuStep, 9000);
  }

  /* ------------------------------------------------------------ the countdown */
  function ensureDeploy() {
    if (deployEl) return deployEl;
    deployEl = mk('div', 'ma-deploy hidden',
      '<div class="ma-photo"></div><div class="ma-rays"></div><div class="ma-dust"></div><div class="ma-grade"></div>' +
      '<div class="ma-plate"><div class="ma-kicker">DEPLOYING TO</div><div class="ma-name"></div><div class="ma-meta"></div><div class="ma-stripe"></div></div>' +
      '<i class="ma-c tl"></i><i class="ma-c tr"></i><i class="ma-c bl"></i><i class="ma-c br"></i>');
    deployEl.id = 'ma-deploy';
    var dust = deployEl.querySelector('.ma-dust');
    for (var k = 0; k < 14; k++) {
      var mote = mk('span');
      mote.style.left = (5 + (k * 37) % 90) + '%';
      mote.style.top = (18 + (k * 53) % 70) + '%';
      mote.style.animationDelay = (-(k * 0.61) % 6) + 's';
      mote.style.animationDuration = (5.5 + (k % 5) * 1.3) + 's';
      dust.appendChild(mote);
    }
    document.body.appendChild(deployEl);
    return deployEl;
  }
  function countdown(n) {
    if (typeof document === 'undefined') return;
    clearTimeout(deployHideT);
    if (!(n > 0)) {
      /* the count is over (or was called off): hold the picture a moment so the
         loading screen, which wears the same one, can take over without a cut */
      if (deployEl && !deployEl.classList.contains('hidden')) deployHideT = setTimeout(hideDeploy, 1100);
      return;
    }
    var el = ensureDeploy();
    if (el.classList.contains('hidden')) {
      el.querySelector('.ma-photo').style.backgroundImage = css(match.pick);
      el.querySelector('.ma-name').textContent = String(match.label || '').toUpperCase();
      el.querySelector('.ma-meta').textContent = String(match.mode || '').toUpperCase();
      el.classList.remove('hidden', 'ma-go');
      void el.offsetWidth;
      el.classList.add('ma-go');
    }
  }
  function hideDeploy() { clearTimeout(deployHideT); if (deployEl) deployEl.classList.add('hidden'); }

  /* ------------------------------------------------------------ loading */
  function loading(on) {
    var el = $('loading');
    if (!el) return;
    if (on) {
      el.style.setProperty('--ma-art', css(match.pick));
      el.classList.add('ma-on');
      var plate = el.querySelector('.ma-loadname');
      if (!plate) { plate = mk('div', 'ma-loadname'); el.appendChild(plate); }
      plate.innerHTML = '<span>DEPLOYING TO</span><b>' + esc(String(match.label || '').toUpperCase()) + '</b>';
      hideDeploy();
    } else {
      el.classList.remove('ma-on');
      hideDeploy();
    }
  }

  /* ------------------------------------------------------------ the scorecard */
  function end(on) {
    var el = $('end-overlay');
    if (!el) return;
    if (!on) { el.classList.remove('ma-on'); voltStop(); nextMatchPicture(); return; }
    el.style.setProperty('--ma-art', css(match.pick));
    el.classList.add('ma-on');
    try { voltStart(el); } catch (err) { /* the board without the lightning is still the board */ }
    if (!el.querySelector('.ma-end-art')) el.insertBefore(mk('div', 'ma-end-art', '<i></i>'), el.firstChild);
    var plate = $('ma-end-plate');
    if (!plate) {
      plate = mk('div', 'ma-end-plate'); plate.id = 'ma-end-plate';
      var sub = $('end-sub');
      if (sub && sub.parentNode) sub.parentNode.insertBefore(plate, sub.nextSibling); else el.insertBefore(plate, el.firstChild);
    }
    plate.innerHTML = '<i></i><b>' + esc(String(match.label || '').toUpperCase()) + '</b>' + (match.mode ? '<span>' + esc(String(match.mode).toUpperCase()) + '</span>' : '') + '<i></i>';
  }

  /* ------------------------------------------------------------ the scorecard, electrified (v2.15)
     Rahul: "End scorecard should show electrifying graphics animation."
     One canvas over the result, drawn only while the result is on screen:
       - a first BIG strike lands on the title as it stamps in (flash, crack of
         thunder from AudioSys.zap, sparks), then strikes keep finding the
         board's frame — a storm for three seconds, steady for nine, now and
         then after that (a result can sit on screen for minutes);
       - a current crawls round the scoreboard's edge the whole time;
       - sparks fall from wherever a strike lands.
     Bolts are midpoint-displaced paths, stroked three times (wide blue, mid,
     white core) with additive blending — no shadowBlur, which is the slow way
     to glow. Nothing here touches the game's renderer or the board's numbers;
     the canvas takes no clicks. prefers-reduced-motion: none of it runs. */
  var volt = { cv: null, g: null, host: null, raf: 0, strikes: [], sparks: [], next: 0, born: 0, last: 0, n: 0, flash: 0, w: 0, h: 0, box: null, titleY: 0, boxAt: 0 };
  function calm() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (err) { return false; } }
  /* a jagged path from (x0,y0) to (x1,y1) as a flat [x, y, x, y ...] list */
  function jag(x0, y0, x1, y1, rough, depth) {
    var pts = [x0, y0, x1, y1];
    for (var d = 0; d < depth; d++) {
      var out = [pts[0], pts[1]];
      for (var i = 2; i < pts.length; i += 2) {
        var ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1], dx = bx - ax, dy = by - ay, off = (Math.random() - 0.5) * rough;
        out.push((ax + bx) / 2 - dy * off, (ay + by) / 2 + dx * off, bx, by);
      }
      pts = out;
    }
    return pts;
  }
  /* a point `d` pixels round the board's frame, clockwise from its top-left corner */
  function onFrame(b, d, out) {
    var w = b.r - b.l, h = b.b - b.t, P = 2 * (w + h);
    d = ((d % P) + P) % P;
    if (d < w) { out[0] = b.l + d; out[1] = b.t; out[2] = 0; out[3] = -1; }
    else if (d < w + h) { out[0] = b.r; out[1] = b.t + d - w; out[2] = 1; out[3] = 0; }
    else if (d < 2 * w + h) { out[0] = b.r - (d - w - h); out[1] = b.b; out[2] = 0; out[3] = 1; }
    else { out[0] = b.l; out[1] = b.b - (d - 2 * w - h); out[2] = -1; out[3] = 0; }
    return P;
  }
  function measure() {
    var host = volt.host, r = host.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w !== volt.w || h !== volt.h) { volt.w = volt.cv.width = w; volt.h = volt.cv.height = h; }
    var tb = host.querySelector('.end-table'), tt = $('end-title');
    var q = tb ? tb.getBoundingClientRect() : null;
    volt.box = (q && q.width > 40 && q.height > 20) ? { l: q.left - r.left - 4, t: q.top - r.top - 4, r: q.right - r.left + 4, b: q.bottom - r.top + 4 } : null;
    var tq = tt ? tt.getBoundingClientRect() : null;
    volt.titleY = tq && tq.height ? tq.top - r.top + tq.height * 0.55 : h * 0.22;
  }
  function strike(now, big) {
    var w = volt.w, h = volt.h, b = volt.box || { l: w * 0.25, t: h * 0.45, r: w * 0.75, b: h * 0.8 };
    var tx, ty, side = Math.random();
    if (big) { tx = w / 2 + (Math.random() - 0.5) * (b.r - b.l) * 0.5; ty = volt.titleY; }
    else if (side < 0.5) { tx = b.l + Math.random() * (b.r - b.l); ty = b.t; }
    else { tx = side < 0.75 ? b.l : b.r; ty = b.t + Math.random() * (b.b - b.t) * 0.7; }
    var main = jag(tx + (Math.random() - 0.5) * w * 0.45, -24, tx, ty, 0.3, big ? 6 : 5), paths = [{ p: main, w: big ? 3 : 1.7 }];
    for (var f = 0, forks = big ? 4 : 2; f < forks; f++) {
      var at = 2 * (2 + Math.floor(Math.random() * Math.max(1, main.length / 2 - 5))), len = (big ? 240 : 130) * (0.5 + Math.random()), ang = Math.PI / 2 + (Math.random() - 0.5) * 1.7;
      paths.push({ p: jag(main[at], main[at + 1], main[at] + Math.cos(ang) * len, main[at + 1] + Math.sin(ang) * len, 0.36, 4), w: big ? 1.4 : 0.9 });
    }
    volt.strikes.push({ paths: paths, t: now, life: big ? 560 : 300 });
    volt.flash = big ? 1 : 0.4;
    for (var k = 0, many = big ? 28 : 10; k < many; k++) {
      var a = -Math.PI * Math.random(), v = 80 + Math.random() * (big ? 430 : 230);
      volt.sparks.push({ x: tx, y: ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: now, life: 360 + Math.random() * 560 });
    }
    try { if (window.AudioSys && AudioSys.zap) AudioSys.zap(big); } catch (err) { /* silent lightning is still lightning */ }
    if (big) { volt.host.classList.remove('ma-jolt'); void volt.host.offsetWidth; volt.host.classList.add('ma-jolt'); }
  }
  function trace(c, p, style, width) {
    c.strokeStyle = style; c.lineWidth = width;
    c.beginPath(); c.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    c.stroke();
  }
  var tmp4 = [0, 0, 0, 0];
  function voltFrame(now) {
    var host = volt.host;
    if (!host || !volt.cv.parentNode || host.classList.contains('hidden')) { voltStop(); return; }
    volt.raf = requestAnimationFrame(voltFrame);
    var dt = Math.min(0.05, Math.max(0, (now - volt.last) / 1000)); volt.last = now;
    if (now - volt.boxAt > 400) { volt.boxAt = now; measure(); }
    var c = volt.g, w = volt.w, h = volt.h, i, k;
    c.clearRect(0, 0, w, h);
    if (now >= volt.next) {
      var age = now - volt.born;
      strike(now, volt.n === 0 || Math.random() < 0.16);
      volt.n++;
      volt.next = now + (age < 3200 ? 170 + Math.random() * 380 : age < 9000 ? 380 + Math.random() * 800 : 1700 + Math.random() * 2600);   // a storm at first, then weather
    }
    c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round'; c.lineCap = 'round';
    if (volt.flash > 0.01) { c.fillStyle = 'rgba(150,215,255,' + (volt.flash * 0.14).toFixed(3) + ')'; c.fillRect(0, 0, w, h); volt.flash *= Math.pow(0.0006, dt); }
    /* the current round the board: two arcs chasing each other, re-jittered every frame */
    if (volt.box) {
      for (k = 0; k < 2; k++) {
        var head = now * 0.42 + k * 0.5 * onFrame(volt.box, 0, tmp4), span = 170 + 70 * Math.sin(now / 700 + k * 2), arc = [];
        for (var d = 0; d <= span; d += 11) {
          onFrame(volt.box, head - d, tmp4);
          var j = (d === 0 || d + 11 > span) ? 1 : (Math.random() - 0.3) * 9;
          arc.push(tmp4[0] + tmp4[2] * j, tmp4[1] + tmp4[3] * j);
        }
        var fl = 0.55 + Math.random() * 0.45;
        trace(c, arc, 'rgba(70,170,255,' + (0.22 * fl).toFixed(3) + ')', 7);
        trace(c, arc, 'rgba(225,245,255,' + (0.85 * fl).toFixed(3) + ')', 1.4);
      }
    }
    for (i = volt.strikes.length - 1; i >= 0; i--) {
      var s = volt.strikes[i], t = (now - s.t) / s.life;
      if (t >= 1) { volt.strikes.splice(i, 1); continue; }
      var al = t < 0.14 ? 1 : Math.pow(1 - t, 1.5) * (0.5 + Math.random() * 0.5);   // it flickers as it dies
      for (k = 0; k < s.paths.length; k++) {
        var ph = s.paths[k];
        trace(c, ph.p, 'rgba(60,160,255,' + (0.2 * al).toFixed(3) + ')', ph.w * 6.5);
        trace(c, ph.p, 'rgba(140,215,255,' + (0.5 * al).toFixed(3) + ')', ph.w * 2.6);
        trace(c, ph.p, 'rgba(240,250,255,' + al.toFixed(3) + ')', ph.w);
      }
    }
    for (i = volt.sparks.length - 1; i >= 0; i--) {
      var sp = volt.sparks[i], st = (now - sp.t) / sp.life;
      if (st >= 1) { volt.sparks.splice(i, 1); continue; }
      sp.vy += 620 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      c.strokeStyle = 'rgba(200,235,255,' + ((1 - st) * 0.9).toFixed(3) + ')'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(sp.x, sp.y); c.lineTo(sp.x - sp.vx * 0.028, sp.y - sp.vy * 0.028); c.stroke();
    }
  }
  function voltStart(host) {
    if (typeof document === 'undefined' || !window.requestAnimationFrame) return;
    host.classList.add('ma-volt');
    if (calm()) return;
    if (!volt.cv) { volt.cv = mk('canvas', 'ma-end-fx'); volt.g = volt.cv.getContext('2d'); }
    if (!volt.g) return;
    volt.host = host;
    if (volt.cv.parentNode !== host) host.appendChild(volt.cv);
    volt.strikes.length = 0; volt.sparks.length = 0; volt.n = 0; volt.flash = 0; volt.w = volt.h = 0;
    measure();
    volt.born = volt.last = volt.boxAt = performance.now();
    volt.next = volt.born + 430;                 // the title's stamp lands about here
    cancelAnimationFrame(volt.raf);
    volt.raf = requestAnimationFrame(voltFrame);
  }
  function voltStop() {
    if (volt.raf) cancelAnimationFrame(volt.raf);
    volt.raf = 0;
    if (volt.host) volt.host.classList.remove('ma-volt', 'ma-jolt');
    if (volt.cv && volt.cv.parentNode) volt.cv.parentNode.removeChild(volt.cv);
    volt.strikes.length = 0; volt.sparks.length = 0;
  }

  /* ------------------------------------------------------------ the intro film */
  function introSeen() { try { return sessionStorage.getItem('us_intro_seen') === '1'; } catch (err) { return true; } }
  function markSeen() { try { sessionStorage.setItem('us_intro_seen', '1'); } catch (err) { /* private mode: it will simply show again */ } }
  function intro(force) {
    if (typeof document === 'undefined' || introEl) return;
    if (!force && (introSeen() || /[?&]nointro\b/.test(location.search))) return;
    var state = 'gate';
    var startedAt = 0;
    var guardT = 0;
    introEl = mk('div', 'ma-intro',
      '<video playsinline preload="none"></video>' +
      '<div class="ma-gate"><img alt="Urban Strike" src="assets/intro/logo.webp"><button type="button" class="ma-start">CLICK TO START</button>' +
      '<p>PLAY WITH HEADPHONES · SOUND IS INTEL</p></div><div class="ma-skip">SKIP ▸</div>');
    introEl.id = 'ma-intro';
    document.body.appendChild(introEl);
    var video = introEl.querySelector('video');
    function finish() {
      if (state === 'out') return;
      state = 'out';
      clearTimeout(guardT);
      markSeen();
      window.removeEventListener('keydown', onKey, true);
      try { video.pause(); } catch (err) { /* already stopped */ }
      introEl.classList.add('ma-out');
      var node = introEl;
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); try { video.removeAttribute('src'); video.load(); } catch (err) { /* gone */ } }, 480);
      introEl = null;
    }
    function begin() {
      if (state !== 'gate') return;
      state = 'video';
      startedAt = performance.now();
      markSeen();
      introEl.classList.add('ma-playing');
      /* the menu must always be reachable: no picture inside five seconds, no film */
      guardT = setTimeout(function () { if (state === 'video' && (video.readyState < 2 || video.currentTime === 0)) finish(); }, 5000);
      video.addEventListener('error', finish);
      video.addEventListener('ended', function () { if (state === 'video') { state = 'hold'; introEl.classList.add('ma-hold'); } });
      video.addEventListener('playing', function () { clearTimeout(guardT); });
      video.src = 'assets/intro/intro_1080p.mp4';
      var playing = null;
      try { playing = video.play(); } catch (err) { finish(); return; }
      if (playing && playing.catch) playing.catch(function () { video.muted = true; var again = video.play(); if (again && again.catch) again.catch(finish); });
    }
    function press() {
      if (state === 'gate') begin();
      else if (state === 'hold') finish();
      else if (state === 'video' && performance.now() - startedAt > 500) finish();
    }
    function onKey(ev) { ev.stopPropagation(); ev.preventDefault(); if (!ev.repeat) press(); }
    window.addEventListener('keydown', onKey, true);        // nothing typed during the film reaches the game
    introEl.addEventListener('click', press);
  }

  function init() {
    if (typeof document === 'undefined') return;
    try { menuStart(); } catch (err) { /* the old backdrop is still there */ }
    try { intro(false); } catch (err) { /* straight to the menu */ }
    try {
      var main = $('screen-main');
      if (main && !main.querySelector('.ma-replay')) {
        var again = mk('button', 'ma-replay', '▶ REPLAY INTRO');
        again.type = 'button';
        again.addEventListener('click', function () { intro(true); });
        main.appendChild(again);
      }
    } catch (err) { /* cosmetic */ }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }

  return { setMatch: setMatch, countdown: countdown, loading: loading, end: end, intro: intro, ART: ART, MENU: MENU, _jag: jag, _onFrame: onFrame, _volt: volt,
           _state: function () { return { map: match.map, pick: match.pick, label: match.label, mode: match.mode }; } };
})();
if (typeof window !== 'undefined') window.MapArt = MapArt;
