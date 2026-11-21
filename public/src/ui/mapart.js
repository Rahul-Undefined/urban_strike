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
    if (!on) { el.classList.remove('ma-on'); nextMatchPicture(); return; }
    el.style.setProperty('--ma-art', css(match.pick));
    el.classList.add('ma-on');
    if (!el.querySelector('.ma-end-art')) el.insertBefore(mk('div', 'ma-end-art', '<i></i>'), el.firstChild);
    var plate = $('ma-end-plate');
    if (!plate) {
      plate = mk('div', 'ma-end-plate'); plate.id = 'ma-end-plate';
      var sub = $('end-sub');
      if (sub && sub.parentNode) sub.parentNode.insertBefore(plate, sub.nextSibling); else el.insertBefore(plate, el.firstChild);
    }
    plate.innerHTML = '<i></i><b>' + esc(String(match.label || '').toUpperCase()) + '</b>' + (match.mode ? '<span>' + esc(String(match.mode).toUpperCase()) + '</span>' : '') + '<i></i>';
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

  return { setMatch: setMatch, countdown: countdown, loading: loading, end: end, intro: intro, ART: ART, MENU: MENU,
           _state: function () { return { map: match.map, pick: match.pick, label: match.label, mode: match.mode }; } };
})();
if (typeof window !== 'undefined') window.MapArt = MapArt;
