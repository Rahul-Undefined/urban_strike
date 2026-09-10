/* ===== v1.0c - QUALITY: HIGH DEFINITION BY DEFAULT, LOWER WHEN IT LAGS =====

   Rahul: "update the game quality to high definition and if it lags to low
   definition, depending on laptop and user preferences; enhance the quality to
   1080p so it looks realistic."

   FIVE TIERS, one object each, applied by applyTier(): the render pixel ratio
   (the 1080p ask — ULTRA draws at the display's native ratio, up to 2x),
   the sun's shadow map (4096 on ULTRA: 0.06 m texels across the 244 m Urban
   frustum instead of 0.12), texture anisotropy (the ground stops smearing at
   grazing angles), and whether dynamic shadows run at all.

   AUTO is the default and it is DELIBERATELY SLOW, because this game has been
   here before. v10.5 shipped a scaler that re-set the pixel ratio at runtime and
   it was reverted in v10.6 (game.js keeps the note): changing the pixel ratio
   REALLOCATES THE WHOLE DRAWING BUFFER, and a scaler that oscillated around its
   threshold did that every 900 ms — a hitch by itself. So:

     - AUTO starts at HIGH, which is exactly what the game shipped at before this
       file existed (1.75 cap, 2048 shadows). Nobody's first frame is worse.
     - it measures a 3 s window of frame times, and only while the player is in
       a match with the pointer locked (menus and the tab-hidden rAF stall are
       not lag);
     - it steps DOWN when the window averages under DOWN_FPS, at most once per
       6 s; it steps UP only after UP_HOLD seconds of headroom, at most once per
       20 s, never within 30 s of a step down, and never past the tier the
       machine last had to leave (that is the "converge and stop" rule — the
       oscillation v10.6 saw is impossible by construction);
     - the tier it settles on is remembered in localStorage, so the next launch
       starts there instead of climbing again.

   The pause panel's QUALITY select is the user preference: AUTO or a fixed
   tier. A fixed tier is never changed by the scaler. The old "Dynamic shadows"
   checkbox stays as the manual shadow override it always was.

   What this file does NOT touch, on purpose: output encoding and tone mapping.
   Every hex-coloured material in world.js is authored against three r128's
   linear output; an sRGB/ACES pipeline would re-grade every wall on the map
   without a browser to look at the result. That is a separate, seen pass. */
var Quality = (function () {
  var TIERS = {
    ultra:  { label: 'ULTRA',  ratio: 2.0,  shadow: 4096, aniso: 8, shadows: true,  bias: 0.030 },
    high:   { label: 'HIGH',   ratio: 1.75, shadow: 2048, aniso: 8, shadows: true,  bias: 0.058 },
    medium: { label: 'MEDIUM', ratio: 1.25, shadow: 2048, aniso: 4, shadows: true,  bias: 0.058 },
    low:    { label: 'LOW',    ratio: 1.0,  shadow: 1024, aniso: 2, shadows: true,  bias: 0.110 },
    potato: { label: 'POTATO', ratio: 0.75, shadow: 1024, aniso: 1, shadows: false, bias: 0.110 }
  };
  var ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];
  var DOWN_FPS = 42, UP_FPS = 57, WINDOW_MS = 3000, UP_HOLD = 12000;
  var MIN_DOWN_GAP = 6000, MIN_UP_GAP = 20000, UP_LOCKOUT_AFTER_DOWN = 30000;

  var renderer = null, sceneRef = null, sunRef = null;
  var mode = 'auto';              // 'auto' or a tier id
  var tier = 'high';
  var ceiling = 'ultra';          // AUTO never climbs past the tier it last had to leave
  var active = false;             // measuring only while the player is in a match
  var frames = 0, accum = 0, winStart = 0, headroomSince = 0;
  var lastDown = -1e9, lastUp = -1e9, applied = null, onChange = null;

  function load() {
    mode = 'auto'; tier = 'high'; ceiling = 'ultra';     // defaults first; storage may override
    try {
      var m = localStorage.getItem('us_quality_mode'); if (m && (m === 'auto' || TIERS[m])) mode = m;
      var t = localStorage.getItem('us_quality_tier'); if (t && TIERS[t]) tier = t;
    } catch (e) {}
    if (mode !== 'auto') tier = mode;
  }
  function save() {
    try { localStorage.setItem('us_quality_mode', mode); localStorage.setItem('us_quality_tier', tier); } catch (e) {}
  }

  function init(r, scene, hooks) {
    renderer = r; sceneRef = scene; onChange = (hooks && hooks.onChange) || null;
    load();
    applyTier(tier, 'boot');
  }
  function setSun(sun) {
    sunRef = sun;
    applyShadowMap(TIERS[tier]);
    applyAnisotropy(TIERS[tier].aniso);                  // a freshly built map's textures take the tier too
    if (sunRef) sunRef.castShadow = TIERS[tier].shadows;
  }
  function setActive(on) {
    if (active === !!on) return;                         // called every frame; only a CHANGE resets the window
    active = !!on;
    frames = 0; accum = 0; winStart = 0; headroomSince = 0;
  }

  /* --- applying a tier --- */
  function applyShadowMap(T) {
    if (!sunRef || !sunRef.shadow) return;
    if (sunRef.shadow.mapSize.x !== T.shadow) {
      sunRef.shadow.mapSize.set(T.shadow, T.shadow);
      if (sunRef.shadow.map) { sunRef.shadow.map.dispose(); sunRef.shadow.map = null; }   // three reallocates on the next frame
    }
    sunRef.shadow.normalBias = T.bias;
  }
  function applyAnisotropy(n) {
    if (!sceneRef || !renderer) return;
    var max = renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    var a = Math.max(1, Math.min(n, max));
    var seen = {};
    sceneRef.traverse(function (o) {
      if (!o.material) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) {
        var tex = m.map;
        if (!tex || seen[tex.uuid]) return;
        seen[tex.uuid] = true;
        if (tex.anisotropy !== a) { tex.anisotropy = a; tex.needsUpdate = true; }
      });
    });
  }
  function applyTier(id, why) {
    var T = TIERS[id]; if (!T || !renderer) return;
    tier = id;
    var ratio = Math.min(window.devicePixelRatio || 1, T.ratio);
    if (Math.abs(renderer.getPixelRatio() - ratio) > 0.01) {
      renderer.setPixelRatio(ratio);                     // three re-runs setSize for us
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    applyShadowMap(T);
    applyAnisotropy(T.aniso);
    if (applied === null || applied.shadows !== T.shadows) {
      renderer.shadowMap.enabled = T.shadows;
      if (sunRef) sunRef.castShadow = T.shadows;
      if (sceneRef) sceneRef.traverse(function (o) {
        if (!o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) { m.needsUpdate = true; });
      });
    }
    applied = T;
    save();
    if (onChange) onChange(id, T, why);
  }

  /* --- the user preference --- */
  function setMode(m) {
    if (m !== 'auto' && !TIERS[m]) return;
    mode = m;
    if (m === 'auto') { ceiling = 'ultra'; lastDown = -1e9; lastUp = -1e9; headroomSince = 0; applyTier(tier, 'auto'); }
    else applyTier(m, 'manual');
    save();
  }

  /* --- the scaler: fed every frame from the game loop --- */
  function tick(dtMs, now) {
    if (!active || mode !== 'auto' || !renderer) return;
    if (dtMs <= 0 || dtMs > 250) return;                 // tab-hidden stalls are not lag
    if (!winStart) winStart = now;
    frames++; accum += dtMs;
    if (now - winStart < WINDOW_MS) return;
    var fps = frames > 0 ? 1000 / (accum / frames) : 60;
    frames = 0; accum = 0; winStart = now;
    var i = ORDER.indexOf(tier);
    if (fps < DOWN_FPS && i > 0 && now - lastDown >= MIN_DOWN_GAP) {
      ceiling = ORDER[i - 1];                            // the tier it lagged AT is gone for this session
      lastDown = now; headroomSince = 0;
      applyTier(ORDER[i - 1], 'lag');
      return;
    }
    if (fps >= UP_FPS) {
      if (!headroomSince) headroomSince = now;
      var next = ORDER[i + 1];
      if (next && ORDER.indexOf(next) <= ORDER.indexOf(ceiling) &&
          now - headroomSince >= UP_HOLD && now - lastUp >= MIN_UP_GAP && now - lastDown >= UP_LOCKOUT_AFTER_DOWN) {
        lastUp = now; headroomSince = 0;
        applyTier(next, 'headroom');
      }
    } else headroomSince = 0;
  }

  function describe() { return (mode === 'auto' ? 'AUTO \u00b7 ' : '') + TIERS[tier].label; }

  return { init: init, setSun: setSun, setActive: setActive, tick: tick, setMode: setMode,
    getMode: function () { return mode; }, getTier: function () { return tier; },
    describe: describe, TIERS: TIERS, ORDER: ORDER };
})();
