/* METRO CITY — phase 1 (Financial District + Central Plaza).
   Registers World._buildMetro, matching the World._buildRural contract exactly:
   the dispatcher hands us { seg, box, cyl, stairFlight, M, rnd, scene,
   addCollider } and we build into the disposable world group.

   PHASE 1 SCOPE — deliberately narrow so each phase can be gate-verified before
   the next is written (the same compile-gate discipline used elsewhere in this
   project). Later phases add: shopping mall, metro station + tunnels, five-level
   parking garage, construction site + crane, residential block, skybridge.

   Vertical access is LIFTS, not stairs. Every staircase in this game with a run
   under ~0.5m was unclimbable until v6.2, and lifts are gate-proven at 27/27
   stops. New towers therefore ship lift-first; stairs are added per phase only
   where verify-access can prove them. */
(function () {
  if (typeof World === 'undefined') return;

  World._buildMetro = function (T) {
    var seg = T.seg, box = T.box, cyl = T.cyl, M = T.M, rnd = T.rnd, stairFlight = T.stairFlight;

    // ---- palette: reuse existing materials, vary by colour only -------------
    function L(c) { return new THREE.MeshLambertMaterial({ color: c }); }
    var CBOX2 = [L(0x8a4038), L(0x2f5a7a)];   // consolidated: fewer materials = fewer merge batches
    var GLASS = L(0x2e4a5c), STEEL = L(0x8790a0), PANEL = L(0x5a6472),
        PAVE = L(0x4a4e56), NEON = L(0xff5c8a), GREEN = L(0x3f6b46);

    // ---- ground ------------------------------------------------------------
    // Single slab, top at y=0, matching Urban/Rural so the coplanar-ground gate
    // has nothing to complain about.
    /* Ground is TILED AROUND the underground footprint rather than punched
       through afterwards. The subway spine runs x -24..24, z -84..24; a solid
       slab there would sit inside the station's head space and the lift gate
       would (correctly) refuse every underground stop. Street level over the
       spine is the station's own deck, laid at the same top y=0 in the same
       material, so it is adjacent rather than overlapping. */
    var UX0 = -24, UX1 = 24, UZ0 = -84, UZ1 = 24;
    seg(-110, UX0, -1, 0, -110, 110, PAVE, { cast: false });          // west of spine
    seg(UX1, 110, -1, 0, -110, 110, PAVE, { cast: false });           // east of spine
    seg(UX0, UX1, -1, 0, -110, UZ0, PAVE, { cast: false });           // north of spine
    seg(UX0, UX1, -1, 0, UZ1, 110, PAVE, { cast: false });            // south of spine
    seg(UX0, UX1, -0.3, 0, UZ0, UZ1, PAVE, { cast: false });          // street deck over it

    // avenue grid (recessed 3cm, never coplanar with the ground)
    [-60, 0, 60].forEach(function (a) {
      seg(a - 6, a + 6, 0.03, 0.08, -100, 100, M.asphalt, { collide: false, cast: false });
      seg(-100, 100, 0.03, 0.08, a - 6, a + 6, M.asphalt, { collide: false, cast: false });
    });

    // ---- Central Plaza -----------------------------------------------------
    seg(-18, 18, 0.08, 0.2, -18, 18, M.sidewalk, { collide: false, cast: false });
    cyl(0, 0.45, 0, 3.2, 0.9, M.concrete);                       // fountain basin
    cyl(0, 1.5, 0, 0.6, 2.2, M.concrete);                        // fountain column
    [[-11, -11], [11, -11], [-11, 11], [11, 11]].forEach(function (p) {
      box(p[0], 1.15, p[1], 1.1, 2.3, 1.1, M.concrete);          // statues
    });
    [[-15, 4], [15, -4], [4, 15], [-4, -15]].forEach(function (p) {
      box(p[0], 0.45, p[1], 2.0, 0.9, 0.7, M.wood);              // benches
    });
    [[-16, -8], [16, 8], [-8, 16], [8, -16]].forEach(function (p) {
      cyl(p[0], 1.1, p[1], 0.22, 2.2, M.wood);                   // street trees
      cyl(p[0], 3.1, p[1], 1.5, 2.4, GREEN, { collide: false });
    });
    seg(-3, 3, 0, 2.6, 19, 19.3, PANEL);                         // bus shelter back
    seg(-3, 3, 2.6, 2.8, 18.4, 20.0, PANEL, { collide: false }); // shelter roof

    // ---- Financial District: four towers ----------------------------------
    /* One helper, one shape, one lift per tower. Floors are solid slabs; the
       perimeter is a sill band + header band leaving a continuous window band to
       fight from — the same profile as the v6.0 towers, which the cover and
       build gates already accept. */
    /* ===== v8.20 TWO-STOREY BLOCKS (was: four 24 m lift towers) =====

       Rahul, after finally being able to load this map: "Metro map is dull,
       building is of no use." Both true, and the generator said why.

       The old tower() emitted six 4 m floor slabs and a perimeter of sill and
       glass bands. That is all it emitted. No door, no stair, no interior —
       four sealed 24 m glass boxes at the map corners whose only way in was a
       lift, connected by skybridges 16 m up. You could not enter them, so they
       were scenery you had to walk around.

       Rebuilt to the brief: two storeys, enterable, stair-served, roof
       reachable, sized for short high-contact deathmatch rounds.

       STAIR GEOMETRY IS NOT ARBITRARY. It obeys the rule this project paid for
       in v8.13: a tread shallower than the player's 0.35 m radius means the
       capsule permanently straddles the tread TWO ahead, whose rise exceeds
       the 0.42 m auto-step limit, and the stair becomes unclimbable. So:

           rise  3.40 / 10 = 0.340   (<= 0.42 auto-step)
           run   4.00 / 10 = 0.400   (>  0.35 player radius)

       Both flights are inside the footprint, offset to opposite walls so the
       climb is a real traverse of the room rather than a ladder, and each one
       is open on its approach side. */
    var FH = 3.4, FLOORS = 2;                                    // 6.8m + roof
    var DOOR_W = 2.6;

    /* stairFlight() rather than raw box() calls. The first cut of this built
       the treads by hand, which meant World._stairs() never saw them and
       verify-climb reported "metro: 0 flights" on a map that now has eight.
       A staircase no gate can see is how Urban accumulated twenty-one
       unclimbable flights. Register everything. */
    function tower(cx, cz, hw, hd, wallMat) {
      var x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd, t = 0.3;
      for (var f = 0; f <= FLOORS; f++) {
        var y = f * FH;
        /* Floor slabs are cut around the stairwell so a flight is not climbing
           into the underside of the floor above — the defect that made five
           Urban staircases unreachable in v8.10. The void runs along the west
           wall on floor 1 and the east wall on floor 2. */
        if (f === 0) {
          seg(x0, x1, y, y + 0.25, z0, z1, PANEL);
        } else if (f === FLOORS) {
          /* Same treatment for the roof: flight two climbs z1-2.6 -> z1-6.6
             along the east side, so the roof slab is cut over that run or the
             player walks up into it. */
          seg(x0, x1 - 7.4, y, y + 0.25, z0, z1, M.roof);
          seg(x1 - 5.4, x1, y, y + 0.25, z0, z1, M.roof);
          seg(x1 - 7.4, x1 - 5.4, y, y + 0.25, z0, z1 - 7.8, M.roof);
          break;
        } else {
          /* The void must cover the whole RUN of the flight beneath it, not
             just its middle. verify-climb caught the first cut at 1.79 m of
             headroom on tread 3 against the 1.82 m a standing capsule needs —
             the slab was still solid over the bottom third of the stair. Flight
             one climbs z0+1.4 -> z0+5.4 plus a landing, so the opening runs
             z0 -> z0+6.6. */
          seg(x0, x0 + 5.4, y, y + 0.25, z0, z1, PANEL);          // west of the void
          seg(x0 + 7.4, x1, y, y + 0.25, z0, z1, PANEL);          // east of the void
          seg(x0 + 5.4, x0 + 7.4, y, y + 0.25, z0 + 8.0, z1, PANEL);
        }
        var b0 = y + 0.25, sill = b0 + 1.0, head = b0 + 2.4, top = (f + 1) * FH;
        var dz0 = cz - DOOR_W / 2, dz1 = cz + DOOR_W / 2;
        [[x0, x1, z0, z0 + t], [x0, x1, z1 - t, z1],
         [x0, x0 + t, z0, z1], [x1 - t, x1, z0, z1]].forEach(function (w, wi) {
          /* Ground floor: the two long walls get a doorway punched through so
             the block can be entered from either side. Every building on this
             map is enterable from at least two approaches — a room with one
             door is a death trap, not a fight. */
          if (f === 0 && wi >= 2) {
            seg(w[0], w[1], b0, top, w[2], dz0, wallMat);
            seg(w[0], w[1], b0, top, dz1, w[3], wallMat);
          } else {
            seg(w[0], w[1], b0, sill, w[2], w[3], wallMat);
            seg(w[0], w[1], head, top, w[2], w[3], GLASS);
          }
        });
      }

      /* rise 3.40/10 = 0.340 (<= 0.42 auto-step) · run 4.00/10 = 0.400
         (> 0.35 player radius). See the v8.13 note in world.js for why the
         run must clear the radius. */
      // ground -> floor 1, running north along the west side
      stairFlight(x0 + 6.4, 0.25, z0 + 2.8, 0, 1, 10, FH / 10, 0.40, 1.6, M.stair);
      // floor 1 -> roof, running south along the east side
      stairFlight(x1 - 6.4, FH + 0.25, z1 - 2.6, 0, -1, 10, FH / 10, 0.40, 1.6, M.stair);

      var ry = FLOORS * FH + 0.25;
      [[x0, x1, z0, z0 + 0.2], [x0, x1, z1 - 0.2, z1],
       [x0, x0 + 0.2, z0, z1], [x1 - 0.2, x1, z0, z1]].forEach(function (w) {
        seg(w[0], w[1], ry, ry + 0.95, w[2], w[3], M.trim, { cast: false });
      });
      box(cx - hw + 3.0, ry + 1.0, cz, 2.4, 1.6, 2.4, STEEL);    // rooftop plant
      box(cx + hw - 1.2, 4.2, cz, 0.3, 2.2, 5.0, NEON, { collide: false });
    }
    tower(-46, -46, 9, 9, PANEL);
    tower(46, -46, 9, 9, STEEL);
    tower(-46, 46, 9, 9, PANEL);
    tower(46, 46, 9, 9, STEEL);

    /* ---- SKYBRIDGES, now at ROOF height ----------------------------------
       They used to span at 16.25 m, which was floor 4 of a 24 m tower. With
       the blocks at 6.8 m those decks would have been floating in open air
       with nothing reaching them — floating geometry and four more broken
       promises. Dropped to roof level so they connect what actually exists. */
    var BR = FLOORS * FH + 0.25;
    function span(x0, x1, z0, z1, y) {
      seg(x0, x1, y, y + 0.25, z0, z1, STEEL);                      // deck
      seg(x0, x1, y + 0.25, y + 1.15, z0, z0 + 0.25, M.trim);       // sides
      seg(x0, x1, y + 0.25, y + 1.15, z1 - 0.25, z1, M.trim);
      for (var b2 = x0 + 2; b2 < x1 - 1; b2 += 6)
        seg(b2, b2 + 0.3, y + 2.4, y + 2.6, z0, z1, STEEL, { collide: false });
    }
    span(-37, 37, -48.5, -43.5, BR);
    span(-37, 37, 43.5, 48.5, BR);
    span(-48.5, -43.5, -37, 37, BR);
    span(43.5, 48.5, -37, 37, BR);

    // ---- PARKING GARAGE (NW quadrant, five decks) --------------------------
    /* Open-sided decks on columns: hard cover from the columns and parked cars,
       sightlines broken every 6m, and a lift for vertical access. */
    (function garage() {
      var gx0 = -92, gx1 = -62, gz0 = -20, gz1 = 16, DH = 3.2;
      for (var d = 0; d < 5; d++) {
        var y = d * DH;
        seg(gx0, gx1, y, y + 0.3, gz0, gz1, M.concrete);            // deck slab
        // perimeter safety wall, waist high, open above for sightlines
        seg(gx0, gx1, y + 0.3, y + 1.2, gz0, gz0 + 0.3, M.concrete);
        seg(gx0, gx1, y + 0.3, y + 1.2, gz1 - 0.3, gz1, M.concrete);
        seg(gx0, gx0 + 0.3, y + 0.3, y + 1.2, gz0, gz1, M.concrete);
        seg(gx1 - 0.3, gx1, y + 0.3, y + 1.2, gz0, gz1, M.concrete);
        if (d === 4) continue;                                       // roof deck is open
        for (var cxp = gx0 + 5; cxp < gx1 - 2; cxp += 7.5)           // columns
          for (var czp = gz0 + 6; czp < gz1 - 3; czp += 10)
            seg(cxp, cxp + 0.7, y + 0.3, y + DH, czp, czp + 0.7, M.concrete);
        // parked cars as hard cover, two rows per deck
        for (var k2 = 0; k2 < 6; k2++) {
          var carX = gx0 + 4 + k2 * 4.4, cz2 = (k2 % 2) ? gz0 + 4 : gz1 - 6;
          box(carX, y + 0.9, cz2, 2.0, 1.2, 4.3, CBOX2[(k2 + d) % CBOX2.length]);
          box(carX, y + 1.55, cz2 - 0.2, 1.7, 0.7, 2.0, GLASS, { collide: false });
        }
      }
    })();

    // ---- rooftop gameplay on the four towers -------------------------------
    /* Sniper positions with counter-play: each roof gets a low parapet ring
       (already built), plus AC units and a stair-head block that break the roof
       into lanes, so a sniper can be flanked rather than owning the whole deck. */
    [[-46, -46], [46, -46], [-46, 46], [46, 46]].forEach(function (r) {
      box(r[0] - 5, 25.15, r[1] - 5, 2.6, 1.6, 2.6, STEEL);         // AC unit
      box(r[0] + 5, 25.15, r[1] + 4, 2.2, 1.6, 3.4, STEEL);
      box(r[0] - 4, 25.55, r[1] + 6, 1.4, 2.4, 1.4, PANEL);         // vent stack
      seg(r[0] - 1.5, r[0] + 1.5, 24.25, 25.65, r[1] - 7.6, r[1] - 7.3, M.trim);
    });

    /* ================== PHASE 3 — MALL / RESIDENTIAL ==================
       Interiors that support combat, not decoration. One shared helper builds
       every multi-storey interior so the shape is uniform and the lift gate can
       prove all of them the same way. Vertical access is lifts throughout. */
    function floors(x0, x1, z0, z1, n, fh, wallMat, openSides) {
      var t = 0.3;
      for (var f = 0; f <= n; f++) {
        var y = f * fh;
        seg(x0, x1, y, y + 0.25, z0, z1, f === n ? M.roof : M.concrete);
        if (f === n) break;
        var b0 = y + 0.25, sill = b0 + 1.0, head = b0 + 2.4, top = (f + 1) * fh;
        [[x0, x1, z0, z0 + t], [x0, x1, z1 - t, z1],
         [x0, x0 + t, z0, z1], [x1 - t, x1, z0, z1]].forEach(function (w, wi) {
          if (openSides && wi === openSides - 1) {                 // shopfront gap
            seg(w[0], w[0] + (w[1] - w[0]) * 0.32, b0, top, w[2], w[3], wallMat);
            seg(w[1] - (w[1] - w[0]) * 0.32, w[1], b0, top, w[2], w[3], wallMat);
            return;
          }
          seg(w[0], w[1], b0, sill, w[2], w[3], wallMat);
          seg(w[0], w[1], head, top, w[2], w[3], GLASS);
        });
      }
      var ry = n * fh + 0.25;
      [[x0, x1, z0, z0 + 0.2], [x0, x1, z1 - 0.2, z1],
       [x0, x0 + 0.2, z0, z1], [x1 - 0.2, x1, z0, z1]].forEach(function (w) {
        seg(w[0], w[1], ry, ry + 0.95, w[2], w[3], M.trim, { cast: false });
      });
    }

    // ---- SHOPPING MALL (SE quadrant): 3 floors, CQB -----------------------
    floors(58, 94, 12, 46, 3, 4.0, PANEL, 3);
    // atrium void is skipped: solid floors keep CQB tight and readable.
    // interior furniture = hard cover, laid on a grid so no lane is unbroken
    for (var mf = 0; mf < 3; mf++) {
      var my = mf * 4.0 + 0.25;
      for (var mx = 62; mx < 92; mx += 6.2) {
        for (var mz = 16; mz < 44; mz += 7.4) {
          var kind = ((mx + mz + mf) | 0) % 3;
          if (kind === 0) box(mx, my + 0.55, mz, 3.0, 1.1, 1.1, PANEL);      // shelving
          else if (kind === 1) { box(mx, my + 0.4, mz, 1.6, 0.8, 1.6, M.wood);  // cafe tables
                                 box(mx + 1.4, my + 0.45, mz, 0.5, 0.9, 0.5, M.wood); }
          else box(mx, my + 0.9, mz, 1.2, 1.8, 2.6, GLASS);                  // display case
        }
      }
    }
    box(76, 12.9, 29, 6.0, 2.2, 6.0, STEEL);        // rooftop plant
    box(66, 13.1, 20, 2.6, 2.6, 2.6, PANEL);        // rooftop water tank
    box(88, 13.1, 40, 2.6, 2.6, 2.6, PANEL);

    // ---- RESIDENTIAL BLOCK (SW quadrant): 4 apartment slabs --------------
    /* Four buildings around a courtyard, separated by alleys wide enough to
       flank through but narrow enough to deny long shots. */
    [[-94, -70, 14, 34], [-94, -70, 42, 62], [-62, -38, 14, 34], [-62, -38, 66, 86]]
      .forEach(function (r, ri) {
        floors(r[0], r[1], r[2], r[3], 4, 3.2, ri % 2 ? M.brick : M.plaster, 0);
        // balconies on the courtyard side: extra cover and a second firing angle
        for (var bf = 1; bf < 4; bf++) {
          var by = bf * 3.2 + 0.25;
          seg(r[0] + 3, r[1] - 3, by, by + 0.2, r[3], r[3] + 1.6, M.concrete);
          seg(r[0] + 3, r[1] - 3, by + 0.2, by + 1.05, r[3] + 1.45, r[3] + 1.6, M.trim);
        }
        // rooftop water tank — hard cover on every residential roof
        box((r[0] + r[1]) / 2, 4 * 3.2 + 1.55, (r[2] + r[3]) / 2, 2.4, 2.4, 2.4, PANEL);
      });
    // courtyard: playground + benches, hard cover in the middle of the block
    [[-78, 38], [-70, 38], [-74, 34]].forEach(function (q) {
      box(q[0], 0.7, q[1], 1.4, 1.4, 1.4, CBOX2[0]);
    });
    cyl(-74, 1.4, 38, 0.25, 2.8, STEEL);
    seg(-80, -68, 2.8, 3.0, 36, 40, M.trim, { collide: false });   // shade canopy

    // ---- SIDE STREETS / ALLEY COVER ---------------------------------------
    for (var ai = 0; ai < 14; ai++) {
      var ax = -66 + (ai % 7) * 4, az = 8 + ((ai / 7) | 0) * 60;
      box(ax, 0.9, az, 1.6, 1.8, 1.2, M.rust);                     // skips / bins
    }

    /* ================== PHASE 4 — UNDERGROUND + CONSTRUCTION ==================
       The subway is an ALTERNATE ROUTE, not a room: three lift shafts drop to it
       at widely separated street points, so descending at one and surfacing at
       another is a genuine map-crossing flank. Lifts (not stairs) throughout —
       the only vertical mechanic in this project with a clean gate record. */
    var UF = -5.75, UC = -1.6;      // tunnel floor top / ceiling underside

    function tunnel(x0, x1, z0, z1) {
      seg(x0, x1, UF - 0.3, UF, z0, z1, M.concrete);                  // floor
      seg(x0, x1, UC, UC + 0.3, z0, z1, M.concrete, { cast: false }); // ceiling
      seg(x0, x1, UF, UC, z0, z0 + 0.3, PANEL);                       // walls
      seg(x0, x1, UF, UC, z1 - 0.3, z1, PANEL);
      seg(x0, x0 + 0.3, UF, UC, z0, z1, PANEL);
      seg(x1 - 0.3, x1, UF, UC, z0, z1, PANEL);
    }
    function room(x0, x1, z0, z1, gapFace) {   // like tunnel but one open face
      seg(x0, x1, UF - 0.3, UF, z0, z1, M.concrete);
      seg(x0, x1, UC, UC + 0.3, z0, z1, M.concrete, { cast: false });
      if (gapFace !== 0) seg(x0, x1, UF, UC, z0, z0 + 0.3, PANEL);
      if (gapFace !== 1) seg(x0, x1, UF, UC, z1 - 0.3, z1, PANEL);
      if (gapFace !== 2) seg(x0, x0 + 0.3, UF, UC, z0, z1, PANEL);
      if (gapFace !== 3) seg(x1 - 0.3, x1, UF, UC, z0, z1, PANEL);
    }

    // ticket hall (north), two platforms, running tunnel south, service spurs
    room(-22, 22, -82, -62, 1);                                       // ticket hall
    room(-22, 22, -62, -30, 1);                                       // platform hall
    seg(-14, -6, UF, UF + 1.05, -60, -32, M.concrete);                // platform A edge
    seg(6, 14, UF, UF + 1.05, -60, -32, M.concrete);                  // platform B edge
    // parked train on platform B
    for (var tc = 0; tc < 4; tc++) {
      var tz = -58 + tc * 7.2;
      box(2.6, UF + 1.9, tz + 3.2, 3.0, 3.4, 6.6, CBOX2[tc % 2]);
      box(2.6, UF + 2.6, tz + 3.2, 3.2, 1.0, 5.0, GLASS, { collide: false });
    }
    tunnel(-8, 8, -30, 22);                                           // running tunnel south
    room(-22, -8, -50, -38, 3);                                       // west service corridor
    room(8, 22, -50, -38, 2);                                         // east service corridor
    room(-22, -12, -36, -30, 3);                                      // utility room
    // maintenance spur with cover pillars
    for (var mp = -26; mp < 20; mp += 6)
      seg(-1.2, 1.2, UF, UC, mp, mp + 1.2, M.concrete);

    // ---- CONSTRUCTION SITE (NE quadrant) ----------------------------------
    /* Half-finished tower: open floor plates on columns, so it reads as a
       skeleton and every level is a firing position with multiple approaches. */
    (function construction() {
      var cx0 = 58, cx1 = 88, cz0 = -88, cz1 = -58, CFH = 4.2;
      for (var f = 0; f < 6; f++) {
        var y = f * CFH;
        seg(cx0, cx1, y, y + 0.3, cz0, cz1, M.concrete);              // floor plate
        for (var px = cx0 + 3; px < cx1 - 2; px += 7)                 // columns
          for (var pz = cz0 + 3; pz < cz1 - 2; pz += 7)
            seg(px, px + 0.6, y + 0.3, y + CFH, pz, pz + 0.6, M.concrete);
        // partial curtain wall on two faces only — long lanes out of the others
        seg(cx0, cx1, y + 0.3, y + 1.15, cz0, cz0 + 0.25, M.concrete);
        seg(cx0, cx0 + 0.25, y + 0.3, y + 1.15, cz0, cz1, M.concrete);
        // scaffolding band on the open faces
        seg(cx1, cx1 + 1.4, y + 0.3, y + 0.45, cz0, cz1, STEEL);
        seg(cx1 + 1.25, cx1 + 1.4, y + 0.45, y + 1.3, cz0, cz1, M.trim);
      }
      // tower crane: mast, cab platform, jib
      var mx = 92, mz = -52;
      seg(mx - 0.9, mx + 0.9, 0, 30, mz - 0.9, mz + 0.9, STEEL);      // mast
      seg(mx - 3.4, mx + 3.4, 30, 30.3, mz - 3.4, mz + 3.4, STEEL);   // crane platform
      seg(mx - 3.4, mx + 3.4, 30.3, 31.2, mz - 3.4, mz - 3.1, M.trim);
      seg(mx - 3.4, mx + 3.4, 30.3, 31.2, mz + 3.1, mz + 3.4, M.trim);
      seg(mx - 34, mx + 6, 30.6, 31.0, mz - 0.6, mz + 0.6, STEEL, { collide: false });
      // construction offices (portacabins) at street level
      [[62, -52], [70, -52]].forEach(function (o) {
        seg(o[0], o[0] + 6, 0, 2.8, o[1], o[1] + 3.2, PANEL);
        seg(o[0] - 0.3, o[0] + 6.3, 2.8, 3.0, o[1] - 0.3, o[1] + 3.5, M.roof, { collide: false });
      });
      // material stacks as hard cover
      for (var st = 0; st < 6; st++)
        box(60 + st * 5, 0.6, -46, 4.2, 1.2, 1.6, M.rust);
    })();

    // ---- street cover ------------------------------------------------------
    var CB = CBOX2;                            // reuse the same two-colour palette
    for (var i = 0; i < 46; i++) {
      var gx = -92 + rnd() * 184, gz = -92 + rnd() * 184;
      if (Math.abs(gx) < 22 && Math.abs(gz) < 22) continue;      // keep plaza open
      if (Math.abs(Math.abs(gx) - 46) < 11 && Math.abs(Math.abs(gz) - 46) < 11) continue;
      var k = (rnd() * 3) | 0;
      if (k === 0) box(gx, 1.3, gz, 6.0, 2.6, 2.44, CB[(rnd() * CB.length) | 0], { rotY: rnd() < 0.5 ? 0 : 1.57 });
      else if (k === 1) { box(gx, 0.45, gz, 2.0, 0.9, 0.6, M.concrete); box(gx + 2.1, 0.45, gz, 2.0, 0.9, 0.6, M.concrete); }
      else { box(gx, 0.9, gz, 2.2, 1.8, 1.6, PANEL); box(gx, 1.9, gz, 2.4, 0.2, 1.8, M.trim, { collide: false }); }
    }

    // ---- perimeter ---------------------------------------------------------
    [[-100, 100, -100, -99], [-100, 100, 99, 100],
     [-100, -99, -100, 100], [99, 100, -100, 100]].forEach(function (w) {
      seg(w[0], w[1], 0, 9, w[2], w[3], M.concrete, { cast: false });
    });
  };
})();
