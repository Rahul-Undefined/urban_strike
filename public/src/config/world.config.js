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
    t3:  { label: '3 vs 3',       teams: true,  maxPlayers: 6 },
    t5:  { label: '5 vs 5',       teams: true,  maxPlayers: 10 }
  };
  // Map registry — rural flips ready:true when its build + data land
  var MAPS = {
    urban: { label: 'Urban', ready: true },
    rural: { label: 'Rural', ready: true }
  };

  var MINIMAP = { proximity: 18 };   // meters at which an enemy pings the minimap without firing
  // V4.1 stylized dusk -- all scene lighting/atmosphere lives here, not in source.
  var RENDER = {
    mergeStatic: true,   // collapse static geometry into per-material meshes
    sky: 0x2b3348, fogColor: 0x2b3348, fogDensity: 0.0040,
    hemiSky: 0xb8c8e2, hemiGround: 0x33291c, hemiIntensity: 0.82,
    ambColor: 0x3c4658, ambIntensity: 0.34,
    sunColor: 0xffa860, sunIntensity: 1.28, sunPos: [70, 82, 34],
    lampGlow: 0xffb25a, lampPool: 0.16   // streetlight halo color + ground-pool strength
  };

  return { COLORS: COLORS, TEAMS: TEAMS, MODES: MODES, MINIMAP: MINIMAP, RENDER: RENDER, MAPS: MAPS };
});
