/* districts.config.js — Urban's districts, as data.

   Until now the districts existed only as comments in the builder files:

       /* =============== AIRPORT (x -96..-14, z -96..-74) =============== *​/

   A human could read that; nothing else could. Every bug report was a screenshot
   and a guess, every gate reported bare coordinates, and district-coloured
   anything was impossible because no code knew where a district was.

   Rahul asked for two things and they are the same thing: district names in the
   code, and district signs on the map. Both come from this file.

   ORDER MATTERS. Regions overlap at their edges, so `at()` returns the FIRST
   match. Small, specific districts are listed before large, general ones.

   sign: [x, z, facing]  where the board stands and which way it reads.
         facing is the yaw in radians the sign's face points along.
   tone: an existing material name from world.js M. No new materials, so a
         district palette costs no draw calls.  */

(function (root) {
  var D = [
    { id: 'construction', name: 'CONSTRUCTION SITE',
      x0: -20, x1: 20, z0: -70, z1: -52, sign: [0, -51.0, 0], tone: 'rust' },

    { id: 'depotB', name: 'DEPOT B',
      x0: 52, x1: 68, z0: -12, z1: 16, sign: [60, 18.6, 0], tone: 'metal' },

    { id: 'busterm', name: 'BUS TERMINAL',
      x0: 74, x1: 97, z0: 26, z1: 60, sign: [73.0, 43, -1.5708], tone: 'steelBlue' },

    { id: 'eastgate', name: 'EASTGATE YARD',
      x0: 72, x1: 98, z0: -10, z1: 25, sign: [73.2, 7, -1.5708], tone: 'contBlue' },

    { id: 'westworks', name: 'WEST WORKS',
      x0: -97, x1: -74, z0: -26, z1: 18, sign: [-73.0, -4, 1.5708], tone: 'ochre' },

    { id: 'colony', name: 'THE COLONY',
      x0: -44, x1: 38, z0: 74, z1: 97, sign: [-3, 73.0, 3.1416], tone: 'terracotta' },

    { id: 'oldtown', name: 'OLD TOWN TERRACE',
      x0: -36, x1: 34, z0: 50, z1: 68, sign: [-1, 46.6, 3.1416], tone: 'brick' },

    { id: 'irongate', name: 'IRONGATE DEPOT',
      x0: -72, x1: -14, z0: -50, z1: -12, sign: [-37.5, -10.6, 0], tone: 'rust' },

    { id: 'marketcross', name: 'MARKET CROSS',
      x0: 44, x1: 94, z0: -52, z1: -12, sign: [63.0, -10.4, 0], tone: 'cream' },

    { id: 'railway', name: 'SECTOR 7 CENTRAL',
      x0: 18, x1: 94, z0: -96, z1: -64, sign: [56, -63.0, 0], tone: 'railGreen' },

    { id: 'airport', name: 'AIRPORT',
      x0: -96, x1: -14, z0: -96, z1: -74, sign: [-55, -73.0, 0], tone: 'plaster' },

    /* Everything the named districts do not claim: the crossroads and the towers
       in the middle of the map. It is last so it never steals a match. */
    { id: 'civic', name: 'CIVIC CENTRE',
      x0: -14, x1: 44, z0: -50, z1: 48, sign: [19.5, 45.6, 3.1416], tone: 'sidewalk' }
  ];

  function at(x, z) {
    for (var i = 0; i < D.length; i++) {
      var d = D[i];
      if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
    }
    return null;
  }
  /* Nearest-district fallback. The named regions cover the built-up areas but
     leave 44% of the 200 m square unclaimed — roads between districts, the
     outskirts, the ground the +/-70 wall used to stand on. Reporting those as
     "UNZONED" makes a gate line useless exactly where a defect is hardest to
     place. Falling back to the nearest region and marking it as an approach
     keeps every coordinate reportable. */
  function nearest(x, z) {
    var best = null, bd = Infinity;
    for (var i = 0; i < D.length; i++) {
      var d = D[i];
      var dx = Math.max(d.x0 - x, 0, x - d.x1);
      var dz = Math.max(d.z0 - z, 0, z - d.z1);
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bd) { bd = dist; best = d; }
    }
    return { d: best, dist: bd };
  }
  function nameAt(x, z) {
    var d = at(x, z);
    if (d) return d.name;
    var n = nearest(x, z);
    return n.d ? 'NEAR ' + n.d.name : 'OUTSKIRTS';
  }

  root.DISTRICTS = { list: D, at: at, nameAt: nameAt, nearest: nearest };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));

if (typeof module !== 'undefined' && module.exports) module.exports = module.exports.DISTRICTS;
