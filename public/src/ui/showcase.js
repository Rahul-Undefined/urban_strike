/* FEATURED WEAPON SHOWCASE — menu hero asset. v10.12.

   Rahul: the welcome screen is boring, take ideas from CoD Mobile — logo,
   image, style, colours, gun skin.

   The defining element of that menu is a hero 3D asset you can look at, and it
   is the one thing this game could add without an artist: viewmodels.js
   already contains 25 fully-built weapon models. This puts one on the menu,
   slowly turning, and cycles through a shortlist.

   ===== IT MUST NEVER BE THE REASON THE BUILD IS UNTESTABLE =====

   This creates a SECOND WebGLRenderer. The match already owns one (game.js).
   Browsers cap live contexts, drivers vary, and none of this has been rendered
   yet. So every entry point is wrapped, and any failure — no WebGL, a context
   that will not allocate, a model that will not build — leaves `.showcase`
   without its `live` class and the CSS collapses it to zero height. The menu
   then looks exactly as it did before this file existed.

   That matters more than the feature: Rahul has several versions of unplayed
   work behind this screen, and a menu that throws would make ALL of it
   untestable rather than just this.

   ===== AND IT MUST NOT COST THE MATCH ANYTHING =====

   stop() disposes the renderer, drops the context and cancels the frame loop.
   Called when the match starts. A menu renderer still holding a context during
   play is exactly the kind of invisible cost that v10.9 was spent chasing. */
var Showcase = (function () {
  'use strict';

  /* A shortlist, not the whole roster. These are the silhouettes that read at
     a glance on a small canvas — a pistol and a knife do not. */
  var REEL = ['ak47', 'm4a1', 'aug', 'awm', 'vector', 'aa12', 'scarh', 'mp5'];

  var cv, renderer, scene, cam, holder, raf = 0, idx = -1, tNext = 0, live = false;

  function fail(why) {
    live = false;
    try {
      var host = document.getElementById('showcase');
      if (host) host.classList.remove('live');
      if (renderer) { renderer.dispose(); renderer = null; }
    } catch (e) { /* nothing left to do; the menu renders without us */ }
    if (window.console && console.info) console.info('[showcase] disabled: ' + why);
  }

  function statLine(w) {
    if (!w) return '';
    return '<b>' + (w.dmg || 0) + '</b> DMG &nbsp;&#183;&nbsp; <b>' + (w.rpm || 0) +
           '</b> RPM &nbsp;&#183;&nbsp; <b>' + (w.range || 0) + '</b> M';
  }

  function next() {
    if (!live) return;
    idx = (idx + 1) % REEL.length;
    var id = REEL[idx];
    var w = CFG.WEAPONS[id];
    try {
      while (holder.children.length) holder.remove(holder.children[0]);
      var models = Showcase._models || (Showcase._models = Viewmodels.build());
      var src = models[id];
      if (!src) { tNext = performance.now() + 400; return; }
      /* clone() shares geometry and materials with the viewmodel set, so the
         reel costs one allocation for the whole roster rather than one per
         cycle — the same sharing rule avatars.js was rewritten around. */
      var m = src.clone();
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.scale.setScalar(1);
      holder.add(m);
    } catch (e) { fail('model build threw'); return; }

    var nm = document.getElementById('sc-name');
    var st = document.getElementById('sc-stats');
    if (nm) nm.textContent = (w && w.label) || id.toUpperCase();
    if (st) st.innerHTML = statLine(w);
    tNext = performance.now() + 4200;
  }

  function frame() {
    if (!live) return;
    raf = requestAnimationFrame(frame);
    try {
      var t = performance.now();
      holder.rotation.y = t * 0.00042;
      holder.position.y = Math.sin(t * 0.0011) * 0.012;
      if (t >= tNext) next();
      renderer.render(scene, cam);
    } catch (e) { fail('render threw'); }
  }

  function start() {
    if (live) return;
    try {
      cv = document.getElementById('showcase-cv');
      if (!cv || typeof THREE === 'undefined' || typeof Viewmodels === 'undefined') return fail('no canvas or deps');

      var w = cv.clientWidth || 520, h = cv.clientHeight || 190;
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' });
      if (!renderer || !renderer.getContext || !renderer.getContext()) return fail('no webgl context');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);

      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(30, w / Math.max(1, h), 0.05, 20);
      cam.position.set(0, 0.02, 1.15);
      cam.lookAt(0, 0, 0);

      /* Three lights, warm key from the accent side. The menu's colour identity
         is the amber; lighting the hero asset with the same hue is what ties
         the 3D element to the flat UI around it instead of leaving it looking
         pasted on. */
      scene.add(new THREE.HemisphereLight(0x5a6675, 0x14181e, 0.85));
      var key = new THREE.DirectionalLight(0xffab2e, 1.35); key.position.set(2, 1.6, 2.2); scene.add(key);
      var rim = new THREE.DirectionalLight(0x7fa6c9, 0.55); rim.position.set(-2.4, 0.6, -1.4); scene.add(rim);

      holder = new THREE.Group();
      holder.position.set(0, 0, 0);
      scene.add(holder);

      live = true;
      var host = document.getElementById('showcase');
      if (host) host.classList.add('live');
      idx = -1; next();
      raf = requestAnimationFrame(frame);
    } catch (e) { fail('start threw: ' + (e && e.message)); }
  }

  /* Called when the match begins. Frees the context so the game's renderer is
     the only live one during play. */
  function stop() {
    live = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    try {
      if (holder) while (holder.children.length) holder.remove(holder.children[0]);
      if (renderer) {
        var gl = renderer.getContext && renderer.getContext();
        renderer.dispose();
        var ext = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        renderer = null;
      }
    } catch (e) { /* teardown must not throw into the match start path */ }
    var host = document.getElementById('showcase');
    if (host) host.classList.remove('live');
  }

  function isLive() { return live; }

  /* Pointer parallax for the backdrop. Two CSS variables, so the movement runs
     on the compositor and never touches the frame budget — the rule the
     original backdrop comment sets out and this keeps. */
  function bindParallax() {
    var bd = document.querySelector('.backdrop');
    if (!bd) return;
    window.addEventListener('pointermove', function (e) {
      var px = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      var py = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      bd.style.setProperty('--px', px.toFixed(3));
      bd.style.setProperty('--py', py.toFixed(3));
    }, { passive: true });
  }

  return { start: start, stop: stop, isLive: isLive, bindParallax: bindParallax };
})();
