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
    var scene = T.scene;   /* v9.5: district signboards add meshes directly */

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

    /* ============ v9.3 — THE FLOOR IS NOT A CAR PARK ANYMORE ==============

       Rahul: "floor of the metro map is flat grey make it colourful and
       playable." Both halves of that are the same complaint. The whole 200x200
       ground was ONE material at 0x4a4e56, so from any rooftop the map read as
       a single grey sheet with buildings standing on it: nothing told you which
       part of the city you were looking at, and nothing told you where you had
       already been. Grey is not just drab here, it is disorienting.

       WHAT THIS IS NOT. It is not a texture pass and it is not more geometry
       for its own sake. Every piece below is a flat, non-colliding, non-shadow-
       casting slab at y 0.03-0.09 — the same trick the avenue grid already
       uses. They merge into the existing batches, so the cost is triangles
       (about 900) and NOT draw calls, which is the budget that actually hurts:
       Metro sits at 29 of 45 draws and this pass must not move it.

       PLAYABLE, specifically. Ground colour is the cheapest wayfinding a map
       has. A player who can say "I am on the red plaza, they came from the
       green park" is navigating; a player looking at grey is guessing. The
       colours therefore follow the DISTRICTS, not decoration — the yard is
       ballast-brown, the terminal is cargo-blue, the market is warm, the park
       is green, and the plaza at the centre is the one that reads from every
       roof on the map.

       LAYER ORDER MATTERS. These sit ABOVE the ground (y 0.03+) and BELOW the
       avenue asphalt where they meet it, so no two coplanar faces ever fight —
       verify-zfight is a budget of 0 and this is exactly the change that would
       break it. Districts are laid first, avenues drawn over them. */
    /* FIVE materials, not eight. The first cut had one per district and that
       cost three extra draw calls for colours nobody could tell apart from a
       rooftop — StaticMerge batches by material, so every distinct colour is a
       separate batch no matter how small the slab. Draw calls are Metro's
       tightest budget after triangles, so districts that read the same from
       distance now share a tone: the garage and the construction site are both
       industrial olive, the four residential slabs are both sand.
       GREEN is reused rather than recreated for the same reason. */
    var DECK = {
      yard:    L(0x6b5a44),   // rail ballast — warm brown
      cargo:   L(0x2c5f7a),   // container yard + station forecourt — deep blue
      market:  L(0x8a5a3c),   // market street + residential — terracotta/sand
      park:    GREEN,         // park lawn — reuses the existing green
      indust:  L(0x5c5f52)    // garage apron + construction — olive concrete
    };
    function deck(x0, x1, z0, z1, m) {
      seg(x0, x1, 0.03, 0.075, z0, z1, m, { collide: false, cast: false });
    }
    /* Each entry is one district floor. Coordinates match the structures that
       stand on them, so a district's colour ends where the district ends. */
    /* THE DECKS TILE. THEY DO NOT OVERLAP.
       The first cut drew each district floor at its structure's real extent,
       which meant the rail yard band ran under the construction site, the park
       band ran under the garage apron, and the two residential slabs ran into
       each other — six overlapping pairs, all at y 0.075. verify-build called
       it immediately: two coplanar faces at the same height flicker against
       each other as the camera moves, and 1,008 m2 of flickering ground is far
       worse than the grey it replaced.

       So the inner rectangles are CLIPPED to the ring they sit inside, and
       every pair either abuts exactly or leaves a gap. Where a district's
       colour stops short of its buildings, the buildings sit on the ring colour
       and that is correct — the ring IS that part of the city. */
    deck(-100, 100, -100, -80, DECK.yard);       // NORTH ring — rail yard
    deck(-100, 100, 80, 100, DECK.market);       // SOUTH ring — depot and market
    deck(-100, -80, -80, 80, DECK.park);         // WEST  ring — park strip
    deck(80, 100, -80, 80, DECK.cargo);          // EAST  ring — cargo terminal
    // inner city, all clipped inside x -80..80 / z -80..80
    deck(-26, 26, -80, 26, DECK.cargo);          // station deck over the spine
    deck(54, 80, -80, -54, DECK.indust);         // construction site apron
    deck(54, 80, 8, 50, DECK.cargo);             // mall forecourt
    deck(-80, -58, -24, 20, DECK.indust);        // parking garage apron
    deck(-80, -58, 22, 66, DECK.market);         // residential A / B
    deck(-56, -34, 10, 80, DECK.market);         // residential C / D

    /* Kerbs. A colour change with no edge looks like a rendering artefact; a
       2 m band of pale concrete at the seam reads as a pavement and makes the
       district boundary intentional. Cheap: eight thin slabs. */
    [[-100, 100, -82, -80], [-100, 100, 80, 82],
     [-82, -80, -80, 80], [80, 82, -80, 80]].forEach(function (k) {
      seg(k[0], k[1], 0.076, 0.09, k[2], k[3], M.sidewalk, { collide: false, cast: false });
    });

    /* Painted road markings down the avenues. The lane dashes are what turn a
       grey band into a street you can read direction from — and they double as
       a distance reference when judging a shot down a 200 m avenue. */
    /* Spacing is 24 m, not 12. At 12 m this loop alone was ~1,150 triangles and
       pushed Metro to 436 below its ceiling, which is no margin at all for the
       next person. Half as many dashes read identically from eye level and the
       gap still works as a distance reference. */
    [-60, 0, 60].forEach(function (a) {
      for (var d = -96; d < 96; d += 24) {
        seg(a - 0.35, a + 0.35, 0.081, 0.088, d, d + 9, M.sidewalk, { collide: false, cast: false });
        seg(d, d + 9, 0.081, 0.088, a - 0.35, a + 0.35, M.sidewalk, { collide: false, cast: false });
      }
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
        /* Parked cars as hard cover, two rows per deck.

           v9.1 — CAR ROOF HEIGHT. These were 1.2 m tall on a deck whose slab
           tops at y+0.3, putting the roof 1.20 m above the floor you stand on.
           verify-arch's JUMP_UP is 1.15 m, so every car on decks 1, 2 and 3 was
           a 9 m2 surface you could see, walk to, and then fail to climb by FIVE
           CENTIMETRES. That was twelve of Metro's thirteen broken promises.

           The fix is not a gate dodge. Climbing onto a car for an angle over the
           deck wall is what a parking garage is FOR, and at 1.2 m the geometry
           was promising exactly that and refusing it. Body height 1.2 -> 1.1
           drops the roof to 1.10 m above the deck, inside the jump, and the body
           still sits flush on the slab (bottom stays at y+0.3).

           Deck 0 cars were never flagged only because the ground slab below them
           is under the 0.9 m PROMISE_MIN — they were equally unclimbable. They
           are fixed here too, by the same single change. */
        for (var k2 = 0; k2 < 6; k2++) {
          var carX = gx0 + 4 + k2 * 4.4, cz2 = (k2 % 2) ? gz0 + 4 : gz1 - 6;
          box(carX, y + 0.85, cz2, 2.0, 1.1, 4.3, CBOX2[(k2 + d) % CBOX2.length]);
          box(carX, y + 1.50, cz2 - 0.2, 1.7, 0.7, 2.0, GLASS, { collide: false });
        }
      }
    })();

    // ---- rooftop gameplay on the four towers -------------------------------
    /* Sniper positions with counter-play: each roof gets a low parapet ring
       (already built), plus AC units and a vent stack that break the roof into
       lanes, so a sniper can be flanked rather than owning the whole deck.

       v9.1 — THESE WERE FLOATING 17.2 m IN THE AIR.
       v8.20 shrank the towers from six 4 m floors (roof deck top 24.25 m) to
       two 3.4 m floors (roof deck top 7.05 m) and rewrote the tower body, the
       skybridges and the loot heights to match. This block was missed. Sixteen
       solid, bullet-stopping colliders — four AC units, four larger units, four
       vent stacks and four trim walls — stayed at 24.25-26.75 m over roofs that
       now end at 7.05 m.

       verify-arch did not catch it: its floating test looks for STANDABLE decks
       with nothing beneath, and these are props, not decks. verify-batch did not
       catch it: they are inside the draw and triangle budgets wherever they sit.
       Nothing in the suite asks "is this object above the building it belongs
       to", which is why tools/verify-fingerprint.js now records Metro's figures
       every run and why the roof-prop support case was added to verify-arch.

       The consequence in the browser was worse than cosmetic: the four tower
       roofs — the map's primary elevated fighting positions — were completely
       BARE, because all of their cover was 18 m overhead. A sniper on any roof
       owned the whole deck with nothing to flank through, which is precisely
       the outcome the comment above says this block exists to prevent.

       ROOF is the single source of truth below. Every prop is seated flush on
       it, so if the tower height ever changes again these move with it. */
    /* PROP HEIGHTS ARE NOT FREE-HAND. Seating these on the roof at their
       original 1.6 m height put their tops 1.60 m above the deck — over
       verify-arch's 1.15 m JUMP_UP — and turned twelve fixed car promises into
       eight new roof promises on the same run. Every standable prop on this map
       is now either CLIMBABLE (top within 1.15 m of the surface it stands on)
       or CLEARLY NOT (more than 2.2 m above it, so nothing reads as an
       invitation). Nothing sits in the band between.

         AC units    1.10 m -> top 1.10 above roof  = climbable, a mantle for a
                                                      peek over the parapet
         vent stack  2.40 m -> top 2.40 above roof  = decorative, no promise
                                                      (already clear of 2.2)
         trim wall   1.40 m tall, 0.9 m2 footprint  = cover, too narrow to read
                                                      as a deck                */
    var ROOF = FLOORS * FH + 0.25;                                   // 7.05 — the walking surface
    var JUMPABLE = 1.10;                                             // <= verify-arch JUMP_UP (1.15)
    [[-46, -46], [46, -46], [-46, 46], [46, 46]].forEach(function (r) {
      box(r[0] - 5, ROOF + JUMPABLE / 2, r[1] - 5, 2.6, JUMPABLE, 2.6, STEEL);   // AC unit
      box(r[0] + 5, ROOF + JUMPABLE / 2, r[1] + 4, 2.2, JUMPABLE, 3.4, STEEL);
      box(r[0] - 4, ROOF + 1.20, r[1] + 6, 1.4, 2.4, 1.4, PANEL);    // vent stack
      seg(r[0] - 1.5, r[0] + 1.5, ROOF, ROOF + 1.40, r[1] - 7.6, r[1] - 7.3, M.trim);
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
    /* v9.1 — MALL ROOFTOP PROPS WERE SUNK THROUGH THE ROOF.
       floors(58,94,12,46, n=3, fh=4.0) puts the roof slab at y 12.00-12.25, so
       the walking surface is 12.25. These three were centred at 12.9 and 13.1,
       putting their undersides at 11.80 — 0.20 m BELOW the roof underside. In
       the browser that is a steel box and two tanks hanging out of the ceiling
       of the third floor, in the middle of the map's tightest CQB space.

       Same root cause as the tower props: a height typed once and never
       re-derived when the building around it changed. MALL_ROOF is the single
       source of truth, so a future floor-count change moves these with it.

       Heights are chosen against verify-arch's bands, not by eye: the plant at
       2.4 m and the tanks at 2.6 m put their tops more than PROMISE_REACH
       (2.2 m) above the roof, so they read as scenery rather than as a climb
       the map then refuses. */
    var MALL_ROOF = 3 * 4.0 + 0.25;                 // 12.25 — the walking surface
    box(76, MALL_ROOF + 1.20, 29, 6.0, 2.4, 6.0, STEEL);   // rooftop plant
    box(66, MALL_ROOF + 1.30, 20, 2.6, 2.6, 2.6, PANEL);   // rooftop water tank
    box(88, MALL_ROOF + 1.30, 40, 2.6, 2.6, 2.6, PANEL);

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
    /* v9.1: 46 -> 96. Confining random cover to the inner map (above) cost
       2.7 points of dead ground on its own. The districts furnish the rim; the
       inner streets still need furniture, and this is where it comes from.
       Doubling a merged box loop is ~600 triangles, well inside the ceiling.

       KEEP-OUT ZONES ARE READ FROM THE MAP DATA, NOT TYPED.
       Raising the count to 96 immediately buried metro spawn #17 at (58, 78)
       inside a container and blocked airdrop #6 at (0, 60). Both were pure
       luck: rnd() is seeded, so those two collisions were reproducible, and the
       46-box version had simply not rolled a box onto a spawn yet. Any future
       change to this count, or to the seed, re-rolls that dice.

       So the loop now asks the map data where the spawns and airdrops are and
       refuses to build near them. A spawn needs a body's width plus slack; an
       airdrop needs room for the crate to land and be looted, so it gets more.
       The point is that this is structural — the next person to change 96 to
       140 cannot reintroduce the bug by accident. */
    /* BUILDING KEEP-OUT, and why a radius list is not enough.
       A portacabin roof is 2.80 m. verify-arch calls a deck a broken promise
       when anything 0.9 m or taller stands within 1.2 m of it and within 2.2 m
       of its top — so for a 2.80 m roof, EVERY piece of standing-height cover
       in the game qualifies. There is no "safe" random prop height next to a
       building; the only fix is not to put random props against buildings.

       That is the real reason Metro shipped with 252 cover pieces. Scattering
       cover across a city of small structures generates promises faster than
       they can be fixed by hand, so the original build scattered very little
       and left 19.2% of the map dead. The districts solve the rim; this list
       lets the inner streets be furnished without re-creating the problem.

       Footprints are the OUTER extent of each structure, and keptOut() pads
       them by the 1.2 m the gate uses. */
    var BUILDINGS = [
      [-92, -62, -20, 16],      // parking garage
      [58, 94, 12, 46],         // shopping mall
      [-94, -70, 14, 34], [-94, -70, 42, 62],      // residential slabs
      [-62, -38, 14, 34], [-62, -38, 66, 86],
      [58, 90, -88, -58],       // construction site + scaffold
      [62, 68, -52, -48.8], [70, 76, -52, -48.8],  // portacabins
      [88, 96, -56, -48],       // crane mast + platform footprint
      [-97, -87, 17, 27]        // bandstand
      /* The station deck (x -24..24, z -84..24) is NOT listed. It is open
         ground at y 0 with every subway structure below -1.6 m, so there is no
         deck for a prop to make a false promise against, and excluding it cost
         2.5 points of dead ground for nothing. */
    ];
    function nearBuilding(x, z) {
      for (var q2 = 0; q2 < BUILDINGS.length; q2++) {
        var r2 = BUILDINGS[q2];
        if (x > r2[0] - 1.6 && x < r2[1] + 1.6 && z > r2[2] - 1.6 && z < r2[3] + 1.6) return true;
      }
      return false;
    }

    var KEEPOUT = [];
    if (typeof CFG !== 'undefined' && CFG.MAPS_METRO) {
      (CFG.MAPS_METRO.SPAWNS || []).forEach(function (sp) {
        KEEPOUT.push([sp[0], sp[1], 4.5]);           // spawn tuple is [x, z, yaw, team]
      });
      (CFG.MAPS_METRO.AIRDROP_POINTS || []).forEach(function (ap) {
        KEEPOUT.push([ap[0], ap[1], 7.0]);           // crate needs landing + looting room
      });
    }
    function keptOut(x, z) {
      for (var q = 0; q < KEEPOUT.length; q++) {
        var dx2 = x - KEEPOUT[q][0], dz2 = z - KEEPOUT[q][1];
        if (dx2 * dx2 + dz2 * dz2 < KEEPOUT[q][2] * KEEPOUT[q][2]) return true;
      }
      return false;
    }
    for (var i = 0; i < 96; i++) {
      var gx = -92 + rnd() * 184, gz = -92 + rnd() * 184;
      if (Math.abs(gx) < 22 && Math.abs(gz) < 22) continue;      // keep plaza open
      /* v9.1: the four edge districts now furnish the map's rim, and a random
         2.6 m container dropped beside a 3.10 m wagon is a broken promise the
         RNG re-rolls every build. Random cover stays inside the districts. */
      if (gz < -78 || gz > 84 || gx < -84 || gx > 84) continue;
      if (keptOut(gx, gz)) continue;                            // spawns and airdrops
      if (Math.abs(Math.abs(gx) - 46) < 11 && Math.abs(Math.abs(gz) - 46) < 11) continue;
      /* TWO COVER CLASSES, AND THE WALL DECIDES WHICH.
         A portacabin roof is 2.80 m. verify-arch calls a deck a broken promise
         when anything 0.9 m or taller stands within 1.2 m of it and within
         2.2 m of its top — so against a 2.80 m roof, EVERY piece of
         standing-height cover in this game qualifies. There is no safe tall
         prop next to a building.

         The first cut of this simply skipped those positions, which is why the
         count had to go to 96 and dead ground still sat at 5.8%. Skipping the
         ground beside a wall is the worst possible answer: the base of a wall
         is exactly where a player wants something to crouch behind.

         So a position next to a structure gets JERSEY BARRIERS at 0.80 m —
         below the 0.9 m PROMISE_MIN, therefore incapable of reading as the
         start of a climb no matter what it is placed against. Open ground gets
         the tall classes. Low cover hugs the walls, big blocks sit in the
         open, and neither can generate a promise. */
      var k = nearBuilding(gx, gz) ? 3 : (rnd() * 3) | 0;
      /* v9.1 — CONTAINERS SHIP WITH THEIR OWN STEP.
         A 6 x 2.44 m container at 2.60 m is a 15 m2 deck you can see, walk to,
         and not climb: 2.60 m is well over the 1.15 m a player can mantle, and
         whenever the random scatter dropped any waist-high prop against one the
         pair read as a staircase and refused. That was Metro's last broken
         promise, and because placement is random it could reappear on any seed
         change — so this is fixed structurally, not by moving one box.

         Container 2.60 -> 2.20 m and a pallet stack topping at 1.10 m welded to
         one end. Ground -> pallets (1.10) -> container roof (1.10) — two legal
         mantles, no seed can undo it. At 2.20 m the container still fully
         breaks the line of a standing 1.80 m player, so cover is unchanged.
         The step follows rotY, or a rotated container would have its stack
         floating off the side. */
      if (k === 0) {
        var rot = rnd() < 0.5 ? 0 : 1.57;
        box(gx, 1.1, gz, 6.0, 2.2, 2.44, CB[(rnd() * CB.length) | 0], { rotY: rot });
        box(rot ? gx : gx + 3.95, 0.55, rot ? gz + 3.95 : gz, 1.8, 1.1, 1.8, M.wood);
      }
      /* 0.85, not 0.90. At exactly 0.90 the gate's `top < PROMISE_MIN` test
         does not exclude it, so a pair of these landing beside the 1.80 m
         kiosk below would read as a step. 0.85 can never be a step. */
      else if (k === 1) { box(gx, 0.425, gz, 2.0, 0.85, 0.6, M.concrete); box(gx + 2.1, 0.425, gz, 2.0, 0.85, 0.6, M.concrete); }
      else if (k === 2) { box(gx, 0.9, gz, 2.2, 1.8, 1.6, PANEL); box(gx, 1.9, gz, 2.4, 0.2, 1.8, M.trim, { collide: false }); }
      else {                                                    // 3: wall-side barriers
        var brot = rnd() < 0.5;
        box(gx, 0.40, gz, brot ? 0.7 : 2.4, 0.80, brot ? 2.4 : 0.7, M.concrete);
        box(brot ? gx : gx + 2.6, 0.40, brot ? gz + 2.6 : gz, brot ? 0.7 : 2.4, 0.80, brot ? 2.4 : 0.7, M.concrete);
      }
    }

    /* ============ PHASE 6 (v9.1) — A SECOND WAY INTO EVERY BUILDING ============

       Before this, the mall, the parking garage, all four residential slabs,
       the construction site and the crane were reachable ONLY by lift. A lift
       in this game is a 1.6 m radius trigger: one player standing in it denies
       an entire building to everybody else, and in a twenty-player match that
       is not a chokepoint, it is a lock. The four Financial District towers
       already had stairs; nothing else did.

       WHY EXTERNAL. The obvious build is an internal stairwell, and the obvious
       build is what cost Urban five unreachable staircases in v8.10 and cost
       this file a 1.79 m headroom failure in v8.20: an internal flight needs a
       void cut through the slab above it covering the WHOLE run, not just the
       middle, and every floor helper on this map lays solid slabs. An external
       flight has open sky above it and needs no cut at all. It is also better
       to look at — a fire escape reads instantly as a way up from across the
       street, which a hidden internal stairwell does not.

       WHY SWITCHBACK, TWO LANES. Flight f and flight f+2 share a lane, so they
       are separated vertically by 2 x fh — 6.4 m at the tightest. A standing
       capsule needs 2.02 m. Nothing here can be marginal.

       GEOMETRY IS DERIVED, NEVER TYPED. steps = ceil(fh / 0.40) so the rise is
       always <= 0.40 against the 0.42 auto-step limit, and the run is fixed at
       0.40 which clears the 0.35 player radius. That second number is the one
       this project paid for in v8.13: a run shallower than the radius makes the
       capsule straddle the tread two ahead, whose rise is double, and the stair
       refuses. Every flight goes through stairFlight() so World._stairs() sees
       it — a staircase no gate can see is how Urban accumulated twenty-one
       broken ones. */
    function fireEscape(ax, az, stops, wallX) {
      var W = 1.6, RUN = 0.40, LANE = 2.0, PAD = 2.2;
      /* THE FLIGHT STARTS ON THE GROUND, NOT ON THE FLOOR SLAB.
         The first cut passed the building's ground-floor top as the base — 0.30
         for the garage, 0.25 for the mall — because that is the height the
         floor is at. But the stair is OUTSIDE the building, where the pavement
         is at y 0. Every flight therefore began one slab-thickness in the air,
         so the first tread stood 0.62 m above the ground the player was
         actually walking on, against a 0.42 m auto-step. Seven flights refused
         at their very first step.

         So the caller passes the floor tops — the same numbers as the lift
         stops, because they describe the same decks — and flight 0 climbs from
         true ground to floor 1 while the rest climb slab to slab.

         rise targets 0.34, not the 0.42 limit. The first cut used ceil(fh/0.40),
         which put the mall's flights at exactly 0.400: a limit is not a target,
         and the resolver needs slack above the rise, not equal to it. 0.34 is
         what the four Financial District towers use and what the gate has
         already proven. */
      for (var f = 0; f + 1 < stops.length; f++) {
        var from = f === 0 ? 0 : stops[f], to = stops[f + 1];
        var h = to - from, steps = Math.ceil(h / 0.34), rise = h / steps, len = steps * RUN;
        var odd = (f % 2) === 1;
        var lx = ax + (odd ? LANE : 0);
        stairFlight(lx, from, odd ? az + len : az, 0, odd ? -1 : 1, steps, rise, RUN, W,
                    M.stair, { stringers: false });
        /* THE LANDING GOES BEYOND THE FLIGHT, NEVER OVER IT.
           The first cut centred each landing on the point where its flight
           topped out, putting a 0.22 m slab directly above the last three
           treads: 0.18 m of headroom against the 1.82 m a standing capsule
           needs, and 26 of 38 flights failed. A landing that receives a flight
           has to start where the treads stop. */
        var lz0 = odd ? az - PAD : az + len;
        var m0 = Math.min(wallX, ax - W / 2 - 0.2), m1 = Math.max(wallX, ax + LANE + W / 2 + 0.2);
        seg(m0, m1, to - 0.22, to, lz0, lz0 + PAD, M.stair);
        /* NOSING — and the reason a landing needs one.
           The next flight climbs in the OTHER lane, 2.0 m across, and it starts
           at the same z the previous flight finished at. So its first tread sits
           0.4 m short of the landing edge, over open air: verify-stairs-quality
           found 22 of the 30 new flights starting on nothing, which is the
           "floating stairs" defect this map already carries screenshots of.

           The nosing reaches 0.7 m back under that first tread, but only across
           the NEXT flight's lane. Extending the whole landing back instead would
           put a slab directly over the last treads of the flight below and trade
           a support failure for a headroom one. */
        var nx0 = odd ? ax - W / 2 : ax + LANE - W / 2;
        seg(nx0, nx0 + W, to - 0.22, to,
            odd ? lz0 + PAD : lz0 - 0.7, odd ? lz0 + PAD + 0.7 : lz0, M.stair);
      }
      /* No guard rails. The first cut ran a 0.95 m rail along the open edge of
         every landing and it sat across the walking line — verify-climb showed
         four flights "blocked by" their own handrail. A rail that stops the
         player using the stair is worse than no rail. */
    }

    /* Floor tops are the LIFT STOPS. Both describe the same decks, so writing
       them once here and once in gameplay.config.js is the kind of duplication
       that drifts — if a building's floor count changes, these two lists have
       to move together, and verify-lifts plus verify-climb will both say so. */
    fireEscape(-59.0, -18.0, [0.30, 3.50, 6.70, 9.90, 13.10], -62.0);   // parking garage
    fireEscape(54.0, 14.0, [0.25, 4.25, 8.25, 12.25], 58.0);            // shopping mall

    /* RESIDENTIAL — stairs on the outer face, clear of the courtyard balconies.
       Blocks A and B start at z 20 and z 46, not 16 and 44: the parking garage
       deck spans x -92..-62 z -20..16 and OVERLAPS block A's south-west corner,
       so a stair at z 16 was climbing into a garage slab on five levels. */
    fireEscape(-67.5, 20.0, [0.25, 3.45, 6.65, 9.85, 13.05], -70.0);    // block A
    fireEscape(-67.5, 46.0, [0.25, 3.45, 6.65, 9.85, 13.05], -70.0);    // block B
    fireEscape(-35.5, 16.0, [0.25, 3.45, 6.65, 9.85, 13.05], -38.0);    // block C
    fireEscape(-35.5, 68.0, [0.25, 3.45, 6.65, 9.85, 13.05], -38.0);    // block D

    fireEscape(53.5, -86.0, [0.30, 4.50, 8.70, 12.90, 17.10, 21.30], 58.0);  // construction

    /* THE CRANE — the map's highest position, and the one place a ground-level
       stair could not go: 30 m of switchback needs a 10 x 4 m footprint, and
       every square metre around the mast is either cargo terminal or
       construction scaffold.

       So the crane's second route is EARNED rather than given. Climb the
       construction site by its new stair to the top plate at 21.3 m, take two
       more flights to 30.3 m, and cross a catwalk to the platform. Two routes
       to the highest point on any map in this game: ride one lift, or climb
       eight flights. That is the right shape for it. */
    (function craneClimb() {
      var PLATE = 21.3, TOP = 30.3, half = (TOP - PLATE) / 2;   // 4.5 m per flight
      var st = Math.ceil(half / 0.34), rs = half / st;          // 14 steps, 0.321 rise
      var ln = st * 0.40;
      stairFlight(84.0, PLATE, -84.0, 0, 1, st, rs, 0.40, 1.6, M.stair, { stringers: false });
      /* The mid landing runs -84+ln .. -81.8+ln; the upper flight starts at
         -81.8+ln in the SAME lane, so without a nosing reaching back under its
         first tread the flight begins on air. Same defect the fire-escape
         landings had, same fix. */
      seg(82.6, 87.4, PLATE + half - 0.22, PLATE + half, -84.0 + ln, -81.8 + ln + 0.7, M.stair);
      /* Upper flight moved to x 84.0. At 86.4 it shared its x span exactly
         with the catwalk above (85.6..87.2), which left 0.64 m of headroom over
         tread 11 against the 1.82 m a standing capsule needs. Separate lanes,
         not a taller catwalk: raising the walkway would only move the pinch. */
      stairFlight(84.0, PLATE + half, -81.8 + ln, 0, 1, st, rs, 0.40, 1.6, M.stair, { stringers: false });
      seg(82.6, 87.2, TOP - 0.22, TOP, -81.8 + 2 * ln, -79.6 + 2 * ln, M.stair);
      // catwalk out to the crane platform at (92, -52), deck top 30.3
      /* Catwalk starts at the far edge of the top landing. Starting it at
         the flight's own top tread put its underside 0.42 m over tread 11. */
      seg(85.6, 87.2, TOP - 0.22, TOP, -81.8 + 2 * ln + 2.2, -55.4, M.stair);
      seg(87.2, 89.0, TOP - 0.22, TOP, -56.9, -55.4, M.stair);
      /* v9.1: a 0.95 m guard rail stood here at z -71.8..-71.6. Every rail on
         the fire escapes was dropped for blocking the walking line; this one
         survived the edit and then hung in open air over a 9 m void once the
         upper flight moved lanes. Removed rather than re-seated — the catwalk
         does not need it and verify-floaters is a budget of 0. */
    })();

    /* ================== PHASE 5 (v9.1) — THE EDGE DISTRICTS ==================

       WHY THIS EXISTS. verify-cover was extended to Metro in v9.1 and gave the
       map its first ever dead-ground measurement: 19.2% against a 6% budget,
       worst open run 36.2 m. Urban, on an identical 200x200 footprint, sits at
       0.6%. The cause was not layout — verify-flow puts Metro at 9.6% isolated,
       which passes — it was furniture:

           Urban   1567 cover pieces   907 at ground level
           Metro    252 cover pieces   196 at ground level     = 21% of Urban

       A 4 m dead-ground heatmap showed where: the districts occupy the middle,
       and everything outside roughly +/-84 was bare pavement running out to the
       wall at +/-100. A twelve-metre empty corridor around the entire map is a
       sniper lane, not a boundary.

       These four districts fill that ring with content that earns its place —
       each is a real place with its own silhouette, and each one BREAKS THE
       SIGHTLINE ALONG THE EDGE rather than just scattering boxes into it.

       COST DISCIPLINE. Metro's triangle ceiling is 26,000 and it is NOT rising
       (HANDOFF s4: ratchets fall, never rise). Every piece here is a box or a
       seg so StaticMerge collapses it into the existing batches, and almost
       everything is cast:false — shadow casters are the scarcer budget (15 of
       22 before this work). Cylinders are used sparingly: each one is 10-sided
       and costs 60 triangles against a box's 12.

       PROP HEIGHTS OBEY THE verify-arch BANDS, the same rule the v9.1 roof
       props were rebuilt to: a standable prop is either CLIMBABLE (top within
       1.15 m of the surface it stands on) or CLEARLY NOT (more than 2.2 m above
       it). Nothing sits in the band between, because that band is what the gate
       calls a broken promise. Container stacks are therefore 2.6 m single or
       5.2 m double — never 1.6 m.

       THE FIRST CUT OF THESE DISTRICTS BROKE THAT RULE 36 TIMES, and the shape
       of the mistake is worth keeping. Every tall object here — wagon 3.10 m,
       hut 2.90 m, container 2.60 m, bus 3.10 m — had a waist-high prop parked
       against it: bogies at 0.90, buffer stops at 1.70, sleeper stacks and
       pallets at 1.10-1.20, planters at 1.00. Each pair reads as a step and a
       platform. None of them was: 3.10 - 1.70 = 1.40 m, well over the 1.15 m a
       jump clears, so the player mantles the buffer stop, finds the wagon roof
       still out of reach, and the map has lied.

       Nothing about that is visible while writing the code. It only appears
       when the gate pairs every prop with every deck above it — which is the
       argument for the gate, not for more careful typing.

       THE FIX IS A HEIGHT DISCIPLINE, NOT A NUDGE. Every low prop across the
       four districts is now 0.80 m: below verify-arch's 0.9 m PROMISE_MIN, so
       it can never register as the start of a climb no matter what is built
       next to it later. The gameplay cost is nil — a standing player is 1.80 m,
       so 0.80 m and 1.10 m are both crouch cover and neither hides a torso.
       Standing cover on these edges comes from the wagons, containers, buses
       and stalls, which is where it should come from.

       If a climb onto the container roofs is ever wanted, it needs a TWO-STEP
       ladder (ground -> 1.10 -> 2.20 -> 2.60), because reachable() is
       single-hop: a 1.45 m intermediate is itself unreachable and just moves
       the broken promise up a level. That is a deliberate build, not a prop
       height change. */

    // ---- NORTH EDGE: RAIL YARD (z -100..-84) -------------------------------
    /* The subway has to come from somewhere. Freight sidings run east-west
       across the north edge and surface the underground spine at x 0, which
       gives the station a reason to exist and the north edge a hard silhouette.
       Rolling stock is the cover: a wagon is 3.0 m tall, so it blocks a
       standing body completely and cannot be mantled. */
    (function railYard() {
      var Z0 = -98, RAIL = [-95, -89, -83];                      // three sidings
      RAIL.forEach(function (rz, ri) {
        // ballast + rails, flush to the ground so nothing is a trip hazard
        seg(-96, 96, 0.02, 0.10, rz - 1.6, rz + 1.6, M.rust, { collide: false, cast: false });
        /* Wagons in broken rakes. The GAPS are the point: a solid 190 m train
           would be a wall, and this edge already had one of those. Each rake is
           4-6 wagons with a 7 m gap, so the yard reads as crossable and every
           crossing point is a fight. */
        for (var k = 0; k < 9; k++) {
          if ((k + ri) % 4 === 3) continue;                       // the gaps
          var wx = -92 + k * 21 + (ri * 6);
          if (wx > 88) continue;
          /* The construction site (x 58..89.4, z -88..-58) puts a 1.15 m curtain
             wall along its north face. A 3.10 m wagon parked against it is a
             step-then-refuse pair, and its WEST wall (x 58..58.25) does the
             same to the inner siding, and its external stair lands at x 53.5.
             Only the outermost siding, which clears the site by 5.5 m, runs the
             full width. */
          if (rz !== -95 && wx > 36 && wx < 98) continue;
          box(wx, 1.60, rz, 16.0, 3.00, 3.0, CBOX2[(k + ri) % 2]);          // wagon body
          box(wx, 3.25, rz, 15.0, 0.30, 2.6, M.rust, { collide: false, cast: false });
          box(wx - 6.0, 0.40, rz, 2.0, 0.80, 3.2, M.rust, { cast: false }); // bogies
          box(wx + 6.0, 0.40, rz, 2.0, 0.80, 3.2, M.rust, { cast: false });
        }
      });
      // signal gantries: vertical read across a flat district
      [-70, -24, 24, 70].forEach(function (gx) {
        seg(gx - 0.3, gx + 0.3, 0, 6.4, Z0 + 1, Z0 + 1.6, STEEL, { cast: false });
        seg(gx - 4.0, gx + 4.0, 6.4, 6.7, Z0 + 0.7, Z0 + 1.9, STEEL, { collide: false, cast: false });
        box(gx + 2.6, 5.6, Z0 + 1.3, 0.7, 1.4, 0.7, NEON, { collide: false, cast: false });
      });
      // permanent-way huts and material piles between the sidings
      /* v9.1: WAS h < 7, which put huts at x 51 and x 78. The x=51 hut's
         sleeper stack landed on the construction lift shaft (60, -86) and
         blocked its ground stop; the x=78 hut sat 0.35 m from the construction
         site's scaffold rail and turned its 2.90 m roof into a broken promise.
         Five huts, ending at x 24, clear the whole NE structure. */
      for (var h = 0; h < 5; h++) {
        var hx = -84 + h * 27;
        seg(hx, hx + 4.4, 0, 2.90, -87.4, -84.6, PANEL);                    // hut
        seg(hx - 0.3, hx + 4.7, 2.90, 3.10, -87.7, -84.3, M.roof, { collide: false, cast: false });
        box(hx + 8.5, 0.40, -86, 3.4, 0.80, 2.0, M.rust);                   // sleeper stack
      }
      // buffer stops close the rake ends so the yard has a readable edge
      [-96, 96].forEach(function (bx) {
        RAIL.forEach(function (rz) { box(bx, 0.40, rz, 1.6, 0.80, 3.2, M.rust); });
      });
    })();

    // ---- EAST EDGE: CARGO TERMINAL (x 84..100) -----------------------------
    /* Container stacks are the densest cover-per-triangle shape in the game: a
       box is 12 triangles and blocks a lane completely. Laid as a maze of
       single and double-height stacks with 3 m aisles, so the whole east edge
       becomes close-quarters rather than a run down an open pavement. */
    (function cargoTerminal() {
      var CW = 6.0, CH = 2.6, CD = 2.44;                         // ISO-ish proportions
      for (var r = 0; r < 11; r++) {
        for (var c = 0; c < 3; c++) {
          if ((r * 3 + c) % 7 === 5) continue;                    // aisles through the stack
          var cx2 = 87 + c * 4.2, cz2 = -88 + r * 16.4 + (c % 2 ? 3.0 : 0);
          if (cz2 > 92) continue;
          /* The construction site's scaffold rail runs to x 89.4 over
             z -88..-58 with its top at 1.30 m. A 2.60 m container parked
             against it is a 1.30 m step to a 2.60 m roof — inside the promise
             band. The two western columns skip that z range; the site itself
             is the cover there. */
          if (c < 2 && cz2 > -92 && cz2 < -54) continue;
          box(cx2, CH / 2, cz2, CD, CH, CW, CBOX2[(r + c) % 2], { cast: c === 0 });
          /* Double stacks are 5.2 m: over PROMISE_REACH from the ground, so
             verify-arch reads them as decorative rather than as a climb the map
             is offering. A 1.6 m half-height stack would be the broken promise
             this project keeps re-learning. */
          if ((r + c) % 3 === 0) box(cx2, CH * 1.5, cz2, CD, CH, CW, CBOX2[(r + c + 1) % 2], { cast: false });
        }
      }
      // dockside gantry legs — silhouette, and hard cover at the base
      [-56, -8, 40, 84].forEach(function (gz) {
        if (gz > 90) return;
        seg(85.0, 85.8, 0, 8.5, gz - 0.4, gz + 0.4, STEEL, { cast: false });
        seg(96.0, 96.8, 0, 8.5, gz - 0.4, gz + 0.4, STEEL, { cast: false });
        seg(85.0, 96.8, 8.5, 8.9, gz - 0.5, gz + 0.5, STEEL, { collide: false, cast: false });
      });
      // pallet runs and drum clusters fill the aisle floor
      for (var p = 0; p < 12; p++) {
        var pz = -84 + p * 15;
        if (pz > 90) continue;
        box(91.5, 0.40, pz, 3.0, 0.80, 2.2, M.wood);                        // pallet stack
        cyl(94.5, 0.40, pz + 4, 0.55, 0.80, M.rust);                        // drum
      }
    })();

    // ---- SOUTH EDGE: BUS DEPOT & MARKET STREET (z 84..100) -----------------
    /* Two halves with different textures so the south edge is not one idea
       repeated: buses west (big, blocky, hard cover) and a market east (light,
       cluttered, waist-high). Awnings give overhead cover from the roofs and
       the crane, which is the only thing on this map that can shoot down here. */
    (function southEdge() {
      // bus depot, west half — buses parked in echelon so gaps are diagonal
      /* v9.1: WAS b < 7. The seventh bus stood at x -11, overlapping the
         first market stall, and a 1.05 m stall counter against a 3.10 m bus is
         inside the promise band. Six buses end the depot at x -19. */
      for (var b = 0; b < 6; b++) {
        var bx = -92 + b * 13.5;
        box(bx, 1.55, 90 + (b % 2) * 5.5, 11.0, 3.10, 2.9, CBOX2[b % 2]);   // bus body
        box(bx, 3.25, 90 + (b % 2) * 5.5, 10.0, 0.30, 2.5, M.trim, { collide: false, cast: false });
      }
      seg(-96, -20, 0, 3.40, 85.0, 86.0, PANEL, { cast: false });            // depot back wall
      seg(-96, -20, 3.40, 3.70, 84.4, 89.0, M.roof, { collide: false, cast: false });
      // market street, east half — stalls and produce crates
      for (var s = 0; s < 10; s++) {
        var sx = -12 + s * 10.6;
        if (sx > 92) continue;
        seg(sx, sx + 4.6, 0, 1.05, 87.0, 89.4, M.wood);                     // stall counter
        seg(sx - 0.4, sx + 5.0, 2.35, 2.55, 86.4, 90.0, NEON, { collide: false, cast: false });
        seg(sx - 0.3, sx, 1.05, 2.35, 87.0, 87.3, M.wood, { collide: false, cast: false });
        seg(sx + 4.6, sx + 4.9, 1.05, 2.35, 89.1, 89.4, M.wood, { collide: false, cast: false });
        box(sx + 2.2, 0.40, 92.5, 2.2, 0.80, 1.6, CBOX2[s % 2]);            // crate pile
        if (s % 3 === 1) box(sx - 1.6, 0.40, 84.6, 1.4, 0.80, 1.4, M.rust); // bins
      }
      // planters break the run along the pavement edge
      for (var pl = 0; pl < 8; pl++) {
        var px2 = -80 + pl * 23;
        if (px2 > 92) continue;
        box(px2, 0.40, 96.5, 3.4, 0.80, 1.6, M.concrete);
      }
    })();

    // ---- WEST EDGE: PARK STRIP (x -100..-84) -------------------------------
    /* The one soft district. Everything else on this map is concrete and steel;
       a tree line reads instantly on the minimap and from the tower roofs, and
       it gives the west approach a different feel from the east.

       Trees are the expensive shape here — a cylinder is 10-sided, 60 triangles
       against a box's 12, and each tree is two cylinders. Twelve trees is 1,440
       triangles, which is affordable; forty would not be. Canopies are
       collide:false so they never become invisible walls, exactly as the plaza
       trees already do. */
    (function parkStrip() {
      seg(-99, -85, 0.05, 0.12, -70, 92, GREEN, { collide: false, cast: false }); // lawn
      for (var t2 = 0; t2 < 12; t2++) {
        var tz = -64 + t2 * 13.2, tx = (t2 % 2) ? -96 : -89;
        cyl(tx, 1.20, tz, 0.26, 2.40, M.wood);                              // trunk
        cyl(tx, 3.40, tz, 1.70, 2.60, GREEN, { collide: false, cast: false }); // canopy
      }
      // low park walls: waist-high cover that does not block the district read
      for (var w2 = 0; w2 < 9; w2++) {
        var wz = -60 + w2 * 17;
        if (wz > 88) continue;
        seg(-98, -92, 0, 0.85, wz, wz + 0.5, M.concrete, { cast: false });
        seg(-91, -86, 0, 0.85, wz + 6, wz + 6.5, M.concrete, { cast: false });
      }
      // bandstand: the one hard structure, a landmark and a covered position
      var bsx = -92, bsz = 22;
      cyl(bsx, 0.30, bsz, 4.6, 0.60, M.concrete);                           // plinth
      [0, 1, 2, 3, 4, 5].forEach(function (a2) {
        var an = a2 * Math.PI / 3;
        seg(bsx + Math.cos(an) * 4.0 - 0.2, bsx + Math.cos(an) * 4.0 + 0.2, 0.60, 3.20,
            bsz + Math.sin(an) * 4.0 - 0.2, bsz + Math.sin(an) * 4.0 + 0.2, M.wood, { cast: false });
      });
      cyl(bsx, 3.45, bsz, 5.0, 0.50, M.roof, { collide: false, cast: false }); // canopy
      // benches and bins along the path
      for (var bn = 0; bn < 7; bn++) {
        var bz2 = -56 + bn * 21;
        if (bz2 > 88) continue;
        box(-94, 0.40, bz2, 0.7, 0.80, 2.0, M.wood);
        if (bn % 2) box(-88, 0.40, bz2 + 5, 1.2, 0.80, 1.2, M.rust);
      }
    })();

    /* ================= v9.5 — DISTRICT SIGNBOARDS =========================

       Metro's twelve districts existed in config and on the map since v9.3, but
       nothing in the WORLD said where you were. A name you can only read by
       opening the map is a label; a name on a lit board across the plaza is
       wayfinding, and it is what makes a callout like "pushing through Union
       Station" mean anything to the person hearing it.

       MODERN, because the district colours already went that way in v9.3:
       edge-lit panel, thin brushed frame, a coloured accent bar keyed to the
       district's own ground colour, and a slim mast. No pole-and-plank.

       TEXT ALIGNMENT IS THE WHOLE JOB and it is where signs usually go wrong.
       Rahul: "Please ensure text is aligned properly with the board." Three
       things are done for it, and all three matter:

         1. The canvas is drawn at the board's OWN aspect ratio (4:1), not on a
            square that then gets stretched — stretching a square canvas onto a
            wide quad is what squashes letters.
         2. The text is measured and the font SHRINKS to fit, so OLD QUARTER and
            CARGO TERMINAL both sit inside the same frame with the same margins
            instead of one overflowing.
         3. It is centred on both axes using the measured metrics, with
            `textBaseline = 'middle'`, rather than by guessing a y offset.

       The panel is `collide: false` throughout: a sign you can walk into is a
       sign that blocks a doorway, and these sit at head height in the open. */
    (function districtSigns() {
      if (typeof DISTRICTS === 'undefined' || !DISTRICTS.metro) return;
      var list = DISTRICTS.metro.filter(function (d) { return !!d.sign; });
      if (!list.length) return;
      var W = 7.2, H = 1.8, POST = 5.4;         // board 4:1, mast height

      /* ONE TEXTURE, ONE MESH, ONE DRAW CALL.
         The first cut built each sign from five separate meshes with its own
         canvas material: twelve districts became SIXTY loose meshes and pushed
         Metro from 33 draw calls to 70 against a budget of 45. StaticMerge
         batches by material, so a unique texture per sign can never merge.

         So all twelve names are drawn into one vertical ATLAS — 512x128 per
         row — and the twelve boards are one BufferGeometry whose quads carry
         UVs into their own row. Twelve signs, one material, one draw call. The
         posts and lips go through box(), so they join the batches that already
         exist and cost nothing extra. */
      var ROW_W = 512, ROW_H = 128;
      var atlas = document.createElement('canvas');
      atlas.width = ROW_W; atlas.height = ROW_H * list.length;
      var g = atlas.getContext('2d');
      var ACCENT = {
        m_railyard: '#b08a55', m_cargo: '#3f86ad', m_market: '#c07a4e',
        m_depot: '#4f7fa0', m_park: '#5aa06a', m_site: '#c08a3a',
        m_garage: '#8d94a0', m_mall: '#5f9fc4', m_towers: '#c9c2b2',
        m_resid: '#c08a6a', m_plaza: '#d0655e', m_station: '#7fa8c8'
      };

      list.forEach(function (d, i) {
        var y0 = i * ROW_H;
        var grd = g.createLinearGradient(0, y0, 0, y0 + ROW_H);
        grd.addColorStop(0, '#1c2126'); grd.addColorStop(1, '#0e1114');
        g.fillStyle = grd; g.fillRect(0, y0, ROW_W, ROW_H);
        g.fillStyle = ACCENT[d.id] || '#c9c2b2';
        g.fillRect(0, y0, 9, ROW_H);                      // accent bar
        g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2;
        g.strokeRect(1, y0 + 1, ROW_W - 2, ROW_H - 2);    // hairline frame

        /* TEXT ALIGNMENT, which is the part that usually goes wrong.
           Rahul: "ensure text is aligned properly with the board."
             - the row is drawn at the BOARD's aspect (4:1), so nothing is
               stretched when it lands on the quad;
             - the font shrinks until the name fits the safe area, so OLD
               QUARTER and CARGO TERMINAL sit in the same margins instead of
               one overflowing;
             - it is centred with measured metrics and textBaseline 'middle',
               not by guessing a y offset. */
        var pad = 26, maxW = ROW_W - pad * 2 - 9;
        var size = 66;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        do {
          g.font = '700 ' + size + 'px Rajdhani, Arial, sans-serif';
          size -= 2;
        } while (g.measureText(d.name).width > maxW && size > 20);
        var cx = 9 + (ROW_W - 9) / 2, cy = y0 + ROW_H / 2;
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(d.name, cx, cy + 2);
        g.fillStyle = '#f2ece0'; g.fillText(d.name, cx, cy);
      });

      var tex = new THREE.CanvasTexture(atlas);
      tex.anisotropy = 4;

      var pos = [], uv = [], idx = [];
      var yMid = POST + H * 0.5 - 0.1;
      list.forEach(function (d, i) {
        var x = d.sign[0], z = d.sign[1], ry = d.sign[2] || 0;
        var ca = Math.cos(ry), sa = Math.sin(ry);
        var hw = W / 2, hh = H / 2;
        // quad corners in board space, rotated into the world about Y
        [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(function (c) {
          pos.push(x + c[0] * ca, yMid + c[1], z - c[0] * sa);
        });
        /* Rows are laid top-down on the canvas but V runs bottom-up, so row i
           occupies the band [1-(i+1)/n , 1-i/n]. Getting this backwards puts
           the wrong name on every board, which is why it is written out. */
        var n = list.length;
        var v0 = 1 - (i + 1) / n, v1 = 1 - i / n;
        uv.push(0, v0, 1, v0, 1, v1, 0, v1);
        var b = i * 4;
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      });
      var geo = new THREE.BufferGeometry();
      /* BufferAttribute + Float32Array, not Float32BufferAttribute. The latter
         is a convenience subclass and is absent from the trimmed THREE the map
         gates run against, so using it crashed verify-map while the render
         gates passed — the geometry was correct and the DEPENDENCY was not.
         The base class is present in every build. */
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setIndex(idx);
      var mesh = new THREE.Mesh(geo,
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      scene.add(mesh);

      // masts and lit lips — through box(), so they merge into existing batches
      list.forEach(function (d) {
        var x = d.sign[0], z = d.sign[1], ry = d.sign[2] || 0;
        var ca = Math.cos(ry), sa = Math.sin(ry);
        [-W * 0.34, W * 0.34].forEach(function (o) {
          box(x + o * ca, POST / 2, z - o * sa, 0.18, POST, 0.18, M.metal,
            { collide: false, cast: false });
        });
        [-1, 1].forEach(function (sgn) {
          var ly = yMid + sgn * (H / 2 + 0.05);
          box(x, ly, z, Math.abs(ca) * (W + 0.2) + 0.12, 0.1,
            Math.abs(sa) * (W + 0.2) + 0.12, M.trim, { collide: false, cast: false });
        });
      });
    })();

    // ---- perimeter ---------------------------------------------------------
    [[-100, 100, -100, -99], [-100, 100, 99, 100],
     [-100, -99, -100, 100], [99, 100, -100, 100]].forEach(function (w) {
      seg(w[0], w[1], 0, 9, w[2], w[3], M.concrete, { cast: false });
    });
  };
})();
