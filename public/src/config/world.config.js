(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { (root.__CFG_PARTS = root.__CFG_PARTS || []).push(factory()); }
})(typeof self !== 'undefined' ? self : this, function () {

  var COLORS = ['#f0a232', '#4fa3e0', '#63d968', '#e2503c', '#c778e8',
    '#40c8c0', '#e8d040', '#e878a8', '#90a8ff', '#a8e070'];

  var TEAMS = {
    a: { name: 'AMBER', color: '#f0a232' },
    b: { name: 'COBALT', color: '#4fa3e0' }
  };

  var MODES = {
    ffa: { label: 'Free For All', teams: false, maxPlayers: 10 },
    t2:  { label: '2 vs 2',       teams: true,  maxPlayers: 4 },
    t3:  { label: '3 vs 3',       teams: true,  maxPlayers: 6 },
    t5:  { label: '5 vs 5',       teams: true,  maxPlayers: 10 }
  };
  // Map registry — rural flips ready:true when its build + data land
  /* v8.18 PER-MAP LIGHTING.

     RENDER was global, so every map inherited Urban's dusk. Metro City is
     specified as a NIGHT map and there was no mechanism to express that at
     all — lighting() read CFG.RENDER directly and nothing per-map could reach
     it.

     A map may now carry a `render` object; lighting() shallow-merges it over
     CFG.RENDER. Omit a key and the global value stands, so this cannot break
     Urban or Rural by existing. IMPORTANT: this changes light COLOURS and
     INTENSITIES only, never the light COUNT — the 7-light budget in
     verify-batch is untouched, which is the whole reason it is done this way
     rather than by adding street lamps. */
  var NIGHT = {
    sky: 0x0a0f1c, fogColor: 0x0a0f1c, fogDensity: 0.0075,
    hemiSky: 0x3a4a68, hemiGround: 0x101720, hemiIntensity: 0.55,
    ambColor: 0x2a3550, ambIntensity: 0.42,
    sunColor: 0x9fc0ff, sunIntensity: 0.38          // moonlight, not sun
  };

  var MAPS = {
    urban: { label: 'Urban', ready: true },
    rural: { label: 'Rural', ready: true },
    metro: { label: 'Metro City', ready: true, render: NIGHT },
  };

  var MINIMAP = { proximity: 18 };   // meters at which an enemy pings the minimap without firing
  // V4.1 stylized dusk -- all scene lighting/atmosphere lives here, not in source.
  var RENDER = {
    mergeStatic: true,   // collapse static geometry into per-material meshes
    sky: 0x2b3348, fogColor: 0x2b3348, fogDensity: 0.0040,
    hemiSky: 0xb8c8e2, hemiGround: 0x33291c, hemiIntensity: 0.82,
    ambColor: 0x3c4658, ambIntensity: 0.34,
    sunColor: 0xffa860, sunIntensity: 1.28, sunPos: [70, 82, 34],
    lampGlow: 0xffb25a, lampPool: 0.26   // streetlight halo color + ground-pool strength
    // lampPool raised 0.16 -> 0.26 in v7.5: it now carries the street lighting
    // that two point lights used to provide, at zero shading cost.
  };

  return { COLORS: COLORS, TEAMS: TEAMS, MODES: MODES, MINIMAP: MINIMAP, RENDER: RENDER, MAPS: MAPS };
});
