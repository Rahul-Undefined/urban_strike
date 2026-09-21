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
    /* ===== v2.0: THE OUTER CITY — ten districts in the 100 m band outside the
       old wall line (x -180/120, z +/-120), inside the new one (x -280/220,
       z +/-220). Listed FIRST: they lie wholly outside every older region, so
       they cannot steal a match, and a player on the inner avenue reads the
       new district rather than the old strip behind them. Signs stand on the
       inner avenue facing the road. Tones reuse existing materials. */
    { id: 'cannery',    name: 'CANNERY ROW',    x0: -280, x1: -114, z0: -220, z1: -124, sign: [-150, -130, 3.1416], tone: 'cream' },
    { id: 'northridge', name: 'NORTH RIDGE',    x0: -114, x1: 60,   z0: -220, z1: -124, sign: [-30, -130, 3.1416], tone: 'brick' },
    { id: 'refinery',   name: 'REFINERY',       x0: 60,   x1: 220,  z0: -220, z1: -124, sign: [110, -130, 3.1416], tone: 'metal' },
    { id: 'quarry',     name: 'QUARRY',         x0: -280, x1: -114, z0: 124,  z1: 220,  sign: [-150, 130, 0], tone: 'rust' },
    { id: 'commons',    name: 'SOUTH COMMONS',  x0: -114, x1: 60,   z0: 124,  z1: 220,  sign: [-30, 130, 0], tone: 'sage' },
    { id: 'southport',  name: 'SOUTHPORT',      x0: 60,   x1: 220,  z0: 124,  z1: 220,  sign: [110, 130, 0], tone: 'steelBlue' },
    { id: 'gasworks',   name: 'GASWORKS',       x0: 124,  x1: 220,  z0: -124, z1: 0,    sign: [130, -60, -1.5708], tone: 'metal' },
    { id: 'terraces',   name: 'RIVER TERRACES', x0: 124,  x1: 220,  z0: 0,    z1: 124,  sign: [130, 60, -1.5708], tone: 'plaster' },
    { id: 'foundry',    name: 'FOUNDRY',        x0: -280, x1: -184, z0: -124, z1: 0,    sign: [-190, -60, 1.5708], tone: 'rust' },
    { id: 'westfield',  name: 'WESTFIELD',      x0: -280, x1: -184, z0: 0,    z1: 124,  sign: [-190, 60, 1.5708], tone: 'sage' },
    /* v15.0 (fix 4): the outer ring. Listed first — they are narrow strips
       outside every old region, so they cannot steal a match, and the tower
       at the centre of each side belongs to the strip it stands in. */
    { id: 'northyards', name: 'NORTH YARDS',
      x0: -120, x1: 120, z0: -120, z1: -106, sign: [20, -96.6, 0], tone: 'contBlue' },       /* v1.0i: inner edge of the boulevard — the outer lane is the train's */
    { id: 'southfield', name: 'SOUTHFIELD PARK',
      x0: -120, x1: 120, z0: 106, z1: 120, sign: [-20, 96.6, 3.1416], tone: 'sage' },
    { id: 'eastmarket', name: 'EAST MARKET',
      x0: 106, x1: 120, z0: -106, z1: 106, sign: [96.6, 40, -1.5708], tone: 'dustyPink' },   /* v1.0r */
    { id: 'westbarracks', name: 'WEST BARRACKS',
      x0: -120, x1: -106, z0: -106, z1: 106, sign: [-96.6, -40, 1.5708], tone: 'facadeOlive' },   /* v1.0r */
    /* v1.1: THE WESTERN REACH — three districts beyond the old west wall */
    { id: 'westdocks', name: 'WEST DOCKS',     x0: -180, x1: -120, z0: -120, z1: -34, sign: [-144, -40, 3.1416], tone: 'steelBlue' },
    { id: 'harbour',   name: 'HARBOUR MARKET', x0: -180, x1: -120, z0: -34,  z1: 34,  sign: [-144, -30, 0], tone: 'cream' },
    { id: 'millrow',   name: 'MILL ROW',       x0: -180, x1: -120, z0: 34,   z1: 120, sign: [-144, 40, 0], tone: 'facadeOlive' },

    { id: 'construction', name: 'CONSTRUCTION SITE',
      x0: -20, x1: 20, z0: -70, z1: -52, sign: [0, -51.0, 0], tone: 'rust' },

    { id: 'depotB', name: 'DEPOT B',
      x0: 52, x1: 68, z0: -12, z1: 16, sign: [60, 18.6, 0], tone: 'metal' },

    /* v9.6 — the two districts built over dead ground.
       SOUTH TERMINAL replaced three sealed 19 m towers; WESTBROOK STADIUM
       filled the empty south-west. Both are listed BEFORE the general
       neighbours below so the specific-before-general ordering this file
       depends on still resolves them first — a player standing on the stadium
       terraces must read WESTBROOK STADIUM, not NEAR THE COLONY.
       These entries are what the minimap label, the full map's rectangles and
       the DevHUD all read, so naming them here updates every one at once. */
    { id: 'southterm', name: 'SOUTH TERMINAL',
      x0: 50, x1: 94, z0: 54, z1: 94, sign: [72, 53.0, 0], tone: 'metal' },
    { id: 'stadium', name: 'WESTBROOK STADIUM',
      x0: -97, x1: -61, z0: 40, z1: 84, sign: [-79, 39.0, 0], tone: 'sage' },
    { id: 'training', name: 'TRAINING GROUND',
      x0: -94, x1: -62, z0: 84, z1: 94, sign: [-79, 95.0, 3.1416], tone: 'ochre' },
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
  /* v2.0: Metro City and its district table are gone with the map. */

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
  function listFor(map) { return (!map || map === 'urban') ? D : null; }

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

  root.DISTRICTS = { list: D, listFor: listFor,
    at: at, nameAt: nameAt, nearest: nearest, map: 'urban' };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));

if (typeof module !== 'undefined' && module.exports) module.exports = module.exports.DISTRICTS;
