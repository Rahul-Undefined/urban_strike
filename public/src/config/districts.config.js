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
  /* v8.22: THESE TWELVE DISTRICTS ARE URBAN'S. Nothing ever said so, and
     nothing checked, so every caller — the DevHUD, the gates, the minimap —
     happily asked "what district is (43.4, -38.4)?" while standing in Metro
     and got told MARKET CROSS. verify-climb printed Urban district names all
     over the Metro flight list in v8.20 and it looked plausible enough to
     miss. Callers now pass the map; anything that is not urban gets an empty
     string and can fall back to the map label. */
  /* ============ v9.3 — METRO CITY GETS ITS OWN DISTRICTS ==================

     Until now this file held one map's regions and `nameAt` returned an empty
     string for everything else, which was the right call in v8.20 (better to
     say nothing than to tell a player standing in Metro that they are in
     MARKET CROSS). But it meant Metro had no names at all: the DevHUD said
     nothing, verify-climb and verify-stairs-quality printed bare coordinates,
     and there was no way to describe a position on the map in words.

     Metro's regions follow the v9.1 edge districts and the v9.3 coloured
     ground, so the NAME a player reads and the COLOUR under their feet
     describe the same place. That pairing is the whole point — a name without
     a visual boundary is trivia, and a colour without a name cannot be spoken
     aloud in a callout.

     Same ordering rule as Urban: specific before general, first match wins. */
  var M = [
    { id: 'm_plaza', name: 'CENTRAL PLAZA',
      x0: -22, x1: 22, z0: -22, z1: 22, sign: [0, 23.4, 3.1416], tone: 'sidewalk' },
    { id: 'm_station', name: 'UNION STATION',
      x0: -26, x1: 26, z0: -86, z1: -22, sign: [0, -21.0, 0], tone: 'metal' },
    { id: 'm_railyard', name: 'RAIL YARD',
      x0: -100, x1: 100, z0: -100, z1: -80, sign: [-40, -79.0, 0], tone: 'rust' },
    { id: 'm_cargo', name: 'CARGO TERMINAL',
      x0: 80, x1: 100, z0: -80, z1: 80, sign: [79.0, 0, -1.5708], tone: 'contBlue' },
    { id: 'm_market', name: 'MARKET STREET',
      x0: -20, x1: 100, z0: 80, z1: 100, sign: [40, 79.0, 3.1416], tone: 'terracotta' },
    { id: 'm_depot', name: 'BUS DEPOT',
      x0: -100, x1: -20, z0: 80, z1: 100, sign: [-60, 79.0, 3.1416], tone: 'steelBlue' },
    { id: 'm_park', name: 'RIVERSIDE PARK',
      x0: -100, x1: -80, z0: -80, z1: 80, sign: [-79.0, 0, 1.5708], tone: 'ochre' },
    { id: 'm_site', name: 'SECTOR 7 WORKS',
      x0: 54, x1: 92, z0: -92, z1: -54, sign: [53.0, -73, 1.5708], tone: 'rust' },
    { id: 'm_garage', name: 'STACK GARAGE',
      x0: -96, x1: -58, z0: -24, z1: 20, sign: [-57.0, -2, 1.5708], tone: 'metal' },
    { id: 'm_mall', name: 'GALLERIA',
      x0: 54, x1: 96, z0: 8, z1: 50, sign: [53.0, 29, 1.5708], tone: 'steelBlue' },
    { id: 'm_towers', name: 'FINANCIAL ROW',
      x0: -58, x1: 58, z0: -58, z1: -22, sign: [-46, -21.0, 0], tone: 'sidewalk' },
    { id: 'm_resid', name: 'OLD QUARTER',
      x0: -98, x1: -34, z0: 10, z1: 90, sign: [-33.0, 50, 1.5708], tone: 'terracotta' }
  ];

  function atIn(list, x, z) {
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
    }
    return null;
  }
  function nearestIn(list, x, z) {
    var best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var cx = Math.max(d.x0, Math.min(x, d.x1)), cz = Math.max(d.z0, Math.min(z, d.z1));
      var dd = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (dd < bd) { bd = dd; best = d; }
    }
    return { d: best, dist: Math.sqrt(bd) };
  }
  function listFor(map) { return map === 'metro' ? M : (!map || map === 'urban') ? D : null; }

  /* Rural is deliberately absent. Hollow Ridge is a valley with landmarks, not
     a grid of districts, and inventing rectangles for it would produce names
     that do not match anything a player can see. An empty string is honest. */
  function nameAt(x, z, map) {
    var list = listFor(map);
    if (!list) return '';
    var d = atIn(list, x, z);
    if (d) return d.name;
    var n = nearestIn(list, x, z);
    return n.d ? 'NEAR ' + n.d.name : 'OUTSKIRTS';
  }

  root.DISTRICTS = { list: D, metro: M, listFor: listFor,
    at: at, nameAt: nameAt, nearest: nearest, map: 'urban' };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));

if (typeof module !== 'undefined' && module.exports) module.exports = module.exports.DISTRICTS;
