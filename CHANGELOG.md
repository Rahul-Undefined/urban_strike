# Urban Strike — Changelog & Deployment Ledger

Every release ships as a cumulative zip (the full game, not a patch).
Deploy ritual: local 2-tab smoke test -> GitHub **delete-then-upload** (uploads never
remove old files) -> Render auto-deploys (`npm install` / `node server.js`, never changed).

---

## Rollback ladder (which zips are safe)

| Zip | Status |
|---|---|
| **v7.6** | CURRENT — Railway district rebuilt + two browser-reported bugs fixed (edge-on crater disc, dead countdown). |
| v7.5 | Good — Milestone 8b-1: Urban material consolidation. 233 -> 55 draw calls, 10 -> 7 lights. |
| v7.4.1 | Good — Milestone 8a + menu overlap fix, 5s countdown with on-screen ticks. |
| v7.4 | Superseded — menu footer overlapped the stat strip on short viewports. |
| v7.3 | Good — METRO CITY COMPLETE. Subway, construction site, tower crane. |
| v7.2 | Good — Metro City phase 3 |
| v7.1 | Good — Metro City phase 2 |
| v7.0 | Good — Metro City phase 1, but towers had no vertical access |
| v6.2 | Good — fixes ~40 broken staircases map-wide |
| v6.1 | Good — lifts + helmets, but nearly every interior stair is unclimbable |
| v6.0 | BROKEN — tower stairs unclimbable. Do not roll back to this. |
| v5.3 | Good — but 3 of 5 railway stairs are unclimbable |
| v5.2 | Good — voice diagnostics + TURN support |
| v5.1 | Good — scope ladder + AA-12; voice still STUN-only with no diagnostics |
| v5.0 | Good — cover pass, tree variety, recoil recovery |
| v4.9 | Good — stairs/tags/regen, but 23.6% of Urban is dead ground and recoil never recentres |
| v4.8 | Good — flicker fix; but NO staircase in either map is climbable standing |
| v4.7 | Good, but Rural flickers full-screen (Urban ground layer built underneath it) |
| v4.6 | Internal milestone — never shipped standalone; folded into v4.7 |
| v4.5 (rebuilt) | Good — last release before multi-map |
| v4.5 (first build) | BROKEN — carried the v4.4 build crash; discard |
| v4.4 | BROKEN — build crash at "BUILDING SECTOR 7" (see v4.4 defect); do not deploy |
| v4.3 | Last known-good before the merge system |
| v4.2 | Good — map expansion + graphics, before the gameplay update |
| v3.1 | Good — last pre-refactor build |

---

## v7.6 — Two browser bugs + Milestone 8b-2: Railway district rebuilt

### The black slab at the crossroads

v7.5 converted the crater scorch disc from `CircleGeometry` to `CylinderGeometry`
so it would merge. `CircleGeometry` lies in the XY plane and needs rotating flat;
`CylinderGeometry` is **already** flat in XZ. The old `rotation.x = -PI/2` was
left in place, which stood the disc on its edge — a 6.2 m black wall at (-1.5,
-21) and (-18, 2). Every gate passed. This is the project's signature failure and
it happened again.

Fixed, and gated: `verify-batch.js` now fails if any paper-thin wide cylinder is
not lying flat. Re-introducing the exact bug makes the gate fail and print the
two coordinates.

### The countdown nobody could see

`socket.on('countdown')` was registered inside `bindGameplayEvents()`, which only
runs on `matchStart` — i.e. **after** the countdown has finished. The server was
emitting 5, 4, 3, 2, 1, 0 and every tick was dropped on the floor. The handler is
now bound at connect time. Verified end-to-end: a solo host receives all six
ticks. A test assertion fails the build if the registration moves back.

### Milestone 8b-2 — SECTOR 7 CENTRAL, the railway district

The old district was three mistakes stacked: the station house sat NORTH of the
tracks with its south wall driven 1.4 m **into** the ballast; the only platform
sat on the far south side, two tracks away from anything; and the parked train
was on the north freight road, so it was neither boardable nor next to the
platform. 30 m of the band was bare ballast with no reason to cross it.

Rebuilt north to south:

| Band | Content |
|---|---|
| z -96.0 .. -90.0 | Freight yard: engine shed, maintenance hut, container road, **water tower** |
| z -90.0 .. -86.4 | Track 2 — freight road |
| z -86.2 .. -82.6 | **Island platform** (x 26..68) + half canopy |
| z -82.4 .. -78.8 | Track 1 — passenger road, the express parked on it |
| z -78.6 .. -75.4 | **Side platform** (x 24..70) |
| z -75.4 .. -67.0 | **Station hall**, three levels |
| z -70.9 .. -63.6 | Forecourt, taxi rank, approach lane |

**The train is a route, not a wall.** The middle coach is 4.0 m wide so its body
meets both platform faces with no gap, its floor is at platform height (1.05),
and it has two door openings a side. Crossing between platforms *through* the
coach is a short, blind, brutal fight — and it is the shortest path.

**The station is the gate.** The inner city wall ran unbroken from x 7 to 70.9,
so the district had no approach. Rather than punch a hole, the hall is set INTO
the wall line: wall, pier, station, pier, wall. A service gate at x 62.5..67.5
keeps the hall from being the only way in.

**Vertical, with counterplay at every level.**
- Concourse 1.05 → upper floor 4.95 → roof 8.25, by two internal flights in
  opposite lanes with holed slabs.
- Canopy deck 3.86, reached by a maintenance stair at its east end. Exposed to
  the footbridge and the hall roof; a 1.6 m hop reaches the coach roof at 3.77.
- Engine shed roof 4.00 by an external west stair, looking straight back at the
  hall roof.
- Footbridge at x 76, deck 4.60, crossing both roads. **Its parapets are
  gapped** — a bridge you cannot be shot on is a sniper nest, not a route.
- The hall's north parapet is gapped so the roof cannot camp the platform safely,
  and the half canopy denies it a clean look at the island platform's north lane.

**Nothing looks climbable and isn't.** The water tower has no ladder geometry
anywhere, so it never promises access it cannot honour.

**District identity.** Cream stucco over a brick plinth, dark green ironwork,
maroon rolling stock, blue-steel freight cladding — six new materials, six draw
calls. Intended callouts: *water tower, the coach, green canopy, shed roof, hall
roof, footbridge, station gate.*

**Loot: 4 points → 12**, one on every level of the district — concourse, upper
floor, roof, both platforms, canopy, coach interior, footbridge, shed floor, shed
roof, maintenance hut, forecourt. Climbing and entering both pay.

### What the gates caught during this work

| Gate | Caught |
|---|---|
| Map | 3 stranded loot points and a spawn buried inside the new island platform |
| Ascent | Station stair had 0.7 m of standing room at its foot — the walker was squeezed against the wall and pushed back out of the hall |
| Ascent | A shipping container roof sat straight across the footbridge's north flight |
| Map | Spawn 17 relocated three times before it was clear of the wall, the hall and the slab |

None of these were visible by eye.

### Gates

| Gate | v7.5 | v7.6 |
|---|---|---|
| Integration | 84 | **85** |
| Batching | 21 | **24** (+ edge-on decal check) |
| Map | 566 | **582** |
| Ascent | 25/27 | **31/33** (same two pre-existing) |
| Models/loot/voice | 38 | 38 |
| Lifts | 98 | 98 |
| Build chain | PASS | PASS |
| Cover | 827 pieces, 0.4% dead | **911 pieces, 0.7% dead** |
| Draw calls (urban) | 55 | **66** |
| Parse sweep | clean | clean |

Urban is at 66 draw calls against a 95 budget — the railway district cost 11,
including its six identity materials. Triangles 39.5k → 45.8k.

### NOT browser-confirmed

The railway district has never been rendered. Specifically worth a look: that
the coach interior is enterable from both platforms, that the canopy stair is
climbable in practice and not just to the ascent walker, and that the station
hall reads as a building rather than a box.

---

## v7.5 — Milestone 8b-1: Urban material consolidation

Foundation work for the Urban visual pass. **No building moved, no collider
changed, no spawn or loot point touched.** Cover analysis reports the identical
827 cover pieces and 0.4% dead ground as v7.4.1, which is the check that the
map itself is untouched.

### Result

| Map | Draw calls before | after | Lights before | after |
|---|---|---|---|---|
| **urban** | **233** | **55** | 10 | 7 |
| rural | 17 | 17 | 3 | 3 |
| metro | 19 | 19 | 3 | 3 |

Urban carried 12x Metro's draw calls on 3x the triangles. It now sits at 55 with
39.5k triangles — the headroom the district colour pass will spend.

### What was actually wrong

The waste was never geometry. Four specific mistakes, all invisible in a
screenshot and all easy to reintroduce one prop at a time:

| Cause | Count | Why the merger skipped it |
|---|---|---|
| Static mesh never marked `matrixAutoUpdate = false` | 121 | `StaticMerge` only takes meshes explicitly flagged static |
| `MeshBasicMaterial` used for unlit surfaces | 55 | The merger only accepts `MeshLambertMaterial` |
| Materials minted inside per-call builder functions | ~20 | Batching is by `material.uuid`; identical paint could not share a batch |
| Props parented to a `THREE.Group` | 10 | Group children are not scene children — the merger never sees them |

`bus()` constructed **six brand-new materials on every call**, and existed as two
byte-identical copies in `world.js` and `districts-outer.js`. `sedan()` minted
one paint per car. Every streetlamp minted its own glow material. Every tree
minted its own foliage material.

### Changes

**Shared palette.** All vehicle, street and prop materials hoisted into the `M`
dictionary: `carPaint[]`, `busBody`, `busRoof`, `vanBody`, `vGlass`, `headlight`,
`taillight`, `roadPaint`, `roadPaintY`, `foliage`, `palletWood`, `palletBase`,
`signFrame`, `glowPool`. Named for the district work ahead so phase 6 extends the
palette rather than refactoring it again.

**Unlit surfaces became mergeable.** `M.white`, `M.amberGlow`, `M.redGlow`,
`M.blueGlow` and the lamp pools were `MeshBasicMaterial`. A Lambert with
`color: 0x000000` and a full emissive term produces byte-identical pixels — the
diffuse contribution is zero, so output equals emissive — *and* merges. Districts
get the factory as `T.emissive` so new signage never reaches for Basic again.

**One `bus()`.** The duplicate in `districts-outer.js` was deleted; the shared
implementation arrives through the district `T` contract.

**deco.js rebuilt.** All 76 road dashes, both yellow lines, all trees and pallets
now go through a `still()` helper that sets the static flag every time. Pallets no
longer use a `THREE.Group` — rotation is applied to offsets instead. The wrecked
sedan lost its Group the same way and now shares `M.dark`.

**17 lamp sprites became 1 Points cloud.** Sprites never batch; `THREE.Points`
with the same radial texture and additive blend does, at one draw call. The 17
ground-glow discs now share one material and merge into a single mesh.

**Crater discs** switched from `CircleGeometry` to an 8 mm `CylinderGeometry` —
visually identical, and cylinders are merge-whitelisted.

### Lighting

Three point lights removed, four kept. The rule applied: **a point light stays
only if it lights an enclosed volume that emissive geometry cannot fake.**

| Light | Verdict |
|---|---|
| Warehouse interior (-32, 6.8, -28) | KEPT — encloses a building volume |
| Apartment interior (27, 4.6, -35) | KEPT |
| Sunken tunnel (47, -1.05, -18) | KEPT — genuinely dark without it |
| Depot roof (60, 7.4, 2) | KEPT — under a roof |
| Street lamp (8.5, 5, -18) | REMOVED — emissive heads + ground pools do this |
| Street lamp (-8.5, 5, 14) | REMOVED |
| Construction work light (0, 8.6, -62) | REMOVED — lit an open-air deck the sun already reaches; replaced with emissive flood panels on a mast |

`CFG.RENDER.lampPool` raised 0.16 → 0.26 so the merged ground glow carries the
street lighting the two removed lamps provided, at zero shading cost.

### New gate: `tools/verify-batch.js` (21 assertions)

Asserts the **invariants**, not a mesh-count ceiling, so it keeps working as
districts add content. Per map: draw-call budget, every static mesh flagged
static, no `MeshBasicMaterial` in static geometry, no mesh hidden in a Group,
loose meshes use merge-whitelisted geometry, no per-object sprites, light budget.
It prints the draw-call count for every map — that is the number to watch during
the visual pass.

Budgets (urban 95, rural 40, metro 45) are headroom to catch a return to the old
architecture, not targets. If a district pass pushes a map over, the cause is
almost always one of the four mistakes above — investigate before raising it.

`tools/verify-map.js`'s THREE stub gained `BufferAttribute`, `Points`,
`PointsMaterial` and the missing `BufferGeometry` methods. The stub was extended
to model what the build actually constructs; nothing was relaxed.

### Gates

| Gate | v7.4.1 | v7.5 |
|---|---|---|
| Integration | 84 | 84 |
| **Batching** | — | **21 (new)** |
| Models/loot/voice | 38 | 38 |
| Map | 566 | 566 |
| Build chain | PASS | PASS |
| Ascent | 25/27 | 25/27 (same two pre-existing) |
| Lifts | 98 | 98 |
| Cover | 827 pieces, 0.4% dead | identical |
| Parse sweep | clean | clean |

### NOT browser-confirmed — read this before building on it

This release changed **material instance identity across the whole Urban map**
and **removed three lights**. That is render-stage work, and render-stage
failures are exactly what headless gates cannot see: the Rural `polygonOffset`
road passed 358/358 while rendering the map completely black.

Specifically unverified: that emissive-Lambert reads identically to the Basic
materials it replaced; that the Points halo cloud looks like the sprites did;
that Urban is not too dark where the three lights were removed.

One look at Urban answers all three.

---

## v7.4.1 — menu layout fix + visible launch countdown

First browser-reported defect of the milestone, and a gate-blind one.

### Menu text overlap (reported from a screenshot)

`.menu-foot` was `position: fixed; bottom: 20px`. That was safe for as long as
nothing else occupied the bottom of the screen. v7.4's stat strip is in normal
flow and landed underneath it, so the keybind hints and the stat strip painted
on top of each other. No headless gate could see this.

Fixes:
- `.menu-foot` now flows in-document instead of being fixed.
- `#menu-layer` scrolls (`overflow-y: auto`) instead of clipping, with
  `align-items: flex-start` + `margin: auto 0` on the active screen. Auto margins
  centre the panel when it fits and collapse when it doesn't, which avoids the
  flexbox top-clipping that `align-items: center` causes on short viewports.
- `.backdrop`, `.menu-vignette` and `.menu-frame` became `position: fixed`.
  Absolutely positioned children of a scroll container scroll away with the
  content and would have left bare background above and below the artwork.
- New `@media (max-height: 720px)` block shrinks the wordmark and tightens gaps.

Two new assertions guard this: the last `.menu-foot` rule declaring `position`
must say `static`, and `#menu-layer` must declare `overflow-y: auto`.

### Launch countdown

- `CFG.MATCH.startCountdown` 10 s → **5 s**.
- `setCountdown` now renders a label, a large amber tick number and a rule,
  rebuilding the node each tick so the pop animation retriggers on every number.
  It counts 5 · 4 · 3 · 2 · 1 and clears at 0.
- Assertion added: `setCountdown` must emit a `cd-num` element, so a countdown
  that exists in the DOM but renders nothing fails the build.

### Gates

Integration **84 / 84** (was 80). Models 38, map 566, lifts 98, merge 9, cover
PASS, build chain PASS, ascent 25/27 (same two pre-existing), parse sweep clean.
Suite runtime dropped ~20 s with the shorter countdown.

---

## v7.4 — Milestone 8a: UI, Lobby & Match Settings

**Scope discipline:** this release touches menu markup, CSS, lobby UI, match
config and the server's lobby domain. **No map geometry, no material, no
collider, no spawn was modified.** Every map gate should read identically to
v7.3 — and does.

### Metro City is selectable (root cause found)

Metro was never missing. `CFG.MAPS.metro.ready` was already `true`, `server.js`
`mapData()` already branched on it, both Metro script tags were already in
`index.html`, and all five harnesses already loaded it (946 colliders, 566 map
assertions). The **only** thing missing was the `<option>` element: the map
picker was hardcoded in markup at two places.

Fix: **every menu dropdown is now built from `CFG` at runtime**
(`UI.populateSelects`). Maps, modes, kill targets and durations all derive from
config. Adding map #4 requires no HTML edit. A test assertion now fails the
build if any of the eight selects regains a hardcoded `<option>`.

### Match settings

| Setting | v7.3 | v7.4 |
|---|---|---|
| Modes | ffa, t3, t5 | ffa, **t2 (2v2, 4 players)**, t3, t5 |
| Kill target | 5/10/15/20/30 | unchanged |
| Duration | 5/10/15/**No limit** | 5/10/15/**30/60** — No-limit removed |

Removing the zero-duration option means **every match can now end**. A gate
asserts `timeOptions.every(n => n > 0)`.

### Ready gate + host-triggered launch (behaviour change)

v7.3 had two competing start paths: a `startMatch` handler that never checked
readiness, and an auto-countdown that launched by itself 5 s after everyone
readied — which made the START MATCH button decorative.

New flow, server-authoritative:
1. Every connected player must press READY. Solo hosts are **not** special-cased.
2. `startMatch` is refused server-side unless `allReady(room)`, with a toast.
3. Host presses START → `CFG.MATCH.startCountdown` (10 s) → match begins.
4. A committed countdown runs to completion; a late unready cannot grief-cancel it.
5. Settings are frozen while a countdown is in flight.

`lobbyPayload` now publishes `notReady`, `allReady` and `counting` so the greyed
button and the server's own refusal can never disagree. The client recomputes
nothing.

### Defects found and fixed along the way

| Defect | Effect |
|---|---|
| Stray closing tag in the staging markup | `.lobby-grid` closed early; the MATCH RULES panel rendered **outside** the grid. No CSS could have balanced that layout. |
| `<label>` nested inside `<label>` in Create Room | Broken click targeting and the reported alignment/spacing problem. |
| `#countdown` lived inside `#hud-layer` | `#hud-layer` is `display:none` during the lobby, so the pre-match countdown was invisible on the only screen that triggers it. Moved to a body-level node. |
| `pushLobby` called before `cdTimer` was assigned | `counting` published as `false` during an active countdown. Caught by a new assertion, not by eye. |

### Frontend

- **Welcome screen:** layered CSS backdrop — sodium-dusk gradient, inline SVG
  three-plane skyline with gantry crane and comms mast, blinking hazard lights,
  drifting haze, 12 dust motes, a slow radar wash, tactical grid, corner
  brackets. Plus a stat strip, live-status eyebrow and screen-entry transition.
- **Staging area:** real three-column grid — LEFT room code + room information,
  CENTER operators with a ready meter and MIC tags, RIGHT match rules + actions.
- Buttons gained hover sheen, disabled and armed states. The sheen is painted as
  the button's own background rather than a positioned pseudo-element, which
  would have painted over every label.
- Responsive breakpoints at 980 px and 560 px; `prefers-reduced-motion` honoured.

**Performance:** zero image files, zero WebGL, no `filter: blur()` anywhere,
all animation on transform/opacity only. `#menu-layer` is `display:none` during
a match, so the entire menu costs nothing while playing.

### Gates

| Gate | v7.3 | v7.4 |
|---|---|---|
| Integration | 49 | **80** (+24 config/markup, +7 launch-gate) |
| Models/loot/voice | 38 | 38 |
| Map | 566 | 566 |
| Build chain | PASS | PASS |
| Ascent | 25/27 | 25/27 (same 2 pre-existing) |
| Lifts | 98 | 98 |
| Cover | PASS | PASS |
| Parse sweep | clean | clean |

Suite runtime rose by ~40 s: every combat phase now satisfies the ready gate and
waits out a real 10 s countdown rather than starting instantly. The timeout was
raised to 120 s. The gate was not softened for the tests.

### NOT browser-confirmed

Everything from v4.9 to v7.4 remains machine-verified only. v7.4 specifically
needs a human to confirm: the welcome screen renders, all three maps appear in
both pickers, the READY gate greys and ungreys START, and the 10 s countdown is
visible **on the staging screen**.

---

## v7.3 — Metro City Phase 4: COMPLETE *(current)*

Final construction phase. Metro City is finished and fully validated.

**THE UNDERGROUND IS A ROUTE, NOT A ROOM.** Three lift shafts drop to the subway
at widely separated street points — ticket hall (-20,-80), west service corridor
(-20,-48) and south tunnel (-6,-20). Descending at one and surfacing at another
crosses ~60m of map under cover, which is the flank the brief asked for.

*Built underground:* ticket hall, two platform halls with raised platform edges,
a four-car train parked on platform B, a running tunnel south, east and west
service corridors, a utility room, and a maintenance spur with pillar cover
every 6m. Floor at -5.75, ceiling at -1.6.

**Ground was TILED AROUND the underground, not punched through afterwards.** The
subway spine (x -24..24, z -84..24) is excluded from the four ground slabs, and
street level over it is the station's own deck at the same top y=0 in the same
material — adjacent, never overlapping. A solid slab there would have sat inside
the station's head space and the lift gate would have refused every underground
stop, correctly.

**CONSTRUCTION SITE (NE).** Half-finished tower: six open floor plates on
columns, curtain wall on two faces only so the other two are long lanes,
scaffolding band down the open side. Portacabin offices and material stacks at
street level. Lift-served across all six levels.

**TOWER CRANE.** 30m mast, cab platform at 30.3m with waist-high sides, 40m jib.
**The highest position on the map**, reachable by its own lift. The platform is
3.4m square with railings on two sides only — a real sniper perch that cannot be
held against a flank, since the lift delivers attackers directly onto it.

**Performance held: still 19 merged meshes** after adding an entire underground
network, a six-storey construction tower and a crane. Every phase-4 material is a
reuse of the consolidated palette. Colliders 759 -> 946.

**Lift gate 84 -> 98 assertions.** Five new shafts, all positions DERIVED by
search — including the underground stops, where the search had to find spots
clear of both the tunnel ceiling and the street deck.

**Map gate 532 -> 566 assertions.** Added 10 underground loot points, 6
construction levels and the crane platform. One spawn failed and was moved, not
silenced: it sat inside the construction curtain wall.

**Gates:** integration 49/49 · map 566/566 · lifts 98/98 · build PASS all three
maps incl. coplanar · models 38/38 · merge 9/9 · cover PASS urban+rural ·
ascent 25/27 · parse sweep clean.

**METRO CITY IS COMPLETE.** All four phases delivered. Urban and Rural untouched
throughout — no regressions in any gate.

### Genuinely requires browser testing tomorrow
1. Nothing in Metro City has ever been RENDERED. Gates prove geometry, collision,
   reachability and loot support; they cannot see a render-stage failure. The
   Rural black-screen regression is the precedent.
2. The v6.2 staircase fix — it changed every staircase in the game at once.
3. Lifts, on every map. Press Z. Especially the underground shafts, where a
   failure means falling into solid ground.
4. Voice chat (still STUN-only; needs TURN credentials).
5. Whether Metro reads as a city or as boxes.

### Still parked (not started)
Player model, diagnostic overlay, helmet test assertion, minimap rebake for v6/v7
geometry, loot-in-every-house, proximity loot labels, bag inventory with
consumable-gated regen, kill animation.

---

## v7.2 — Metro City Phase 3

**SHOPPING MALL (SE quadrant).** Three floors plus roof, 36x34m, shopfront gaps
in one face. Interior furniture is laid on a 6.2 x 7.4m grid across all three
floors — shelving runs, cafe tables, glass display cases — so no lane inside the
mall is unbroken. That is what makes it CQB rather than a shooting gallery.
Rooftop plant and two water tanks give cover on the roof. Lift-served, 4 stops.

**RESIDENTIAL BLOCK (SW quadrant).** Four 4-storey apartment slabs around a
courtyard, each with a lift, courtyard-side balconies on floors 1-3 (a second
firing angle into the courtyard, and cover while using it), and a rooftop water
tank. Courtyard has playground blocks, a mast and a shade canopy as hard cover.

**ALLEYS AND SIDE STREETS.** Fourteen skips/bins along the routes between
districts — flanking lanes with cover, narrow enough to deny long shots.

**MATERIAL CONSOLIDATION — mesh count went DOWN while the map grew.** The v7.1
note flagged 23 merged meshes against the brief's <=20 target, caused by material
count (StaticMerge batches by material). The five-colour vehicle palette was
consolidated to two and the street-cover palette now reuses it. Result: mall +
residential + alleys added, and Metro is **19 merged meshes** — under target.
Colliders 434 -> 759.

**Two real defects caught by gates and fixed at the root, not bypassed:**
1. *Coplanar ground, 221m2.* The SE residential building overlapped the SW tower
   footprint (x -55..-37 / z 37..55) at exactly y=0.25 — two different-material
   slabs on one plane, i.e. guaranteed full-screen z-fighting. Building relocated
   to z 66..86; its lift and three loot points moved with it. The build gate was
   also extended to PRINT the overlapping footprints rather than just the area,
   which is what made this diagnosable in one run.
2. *Palette index out of range.* Consolidating the car palette to two entries
   left a `CB[(rnd()*4)|0]` picker, producing undefined materials and crashing
   the metro build. Now indexes on `CB.length`.

Plus two placement failures moved rather than silenced: a loot point 0.55m above
where the roof actually is, and a spawn inside a residential wall.

**Lift gate 60 -> 84 assertions.** Six new shafts (mall + four residential +
existing), all positions DERIVED by search across each structure's full stop list.

**Map gate 496 -> 532 assertions.**

**Gates:** integration 49/49 · map 532/532 · lifts 84/84 · build PASS all three
maps incl. coplanar · models 38/38 · merge 9/9 · ascent 25/27 (pre-existing Urban
interior stairs, unchanged) · parse sweep clean.

**PHASE 4 NOT STARTED:** metro station, underground platforms, subway tunnels,
service corridors, emergency exits, construction site, tower crane, utility rooms.

---

## v7.1 — Metro City Phase 2

Phase 2 closes the phase 1 gap: the Financial District towers had roof loot and
no way to reach it.

**LIFTS — the phase 1 gap, closed.** Five new shafts: one per tower (7 stops,
ground to 24.25m) and one in the parking garage (5 decks). **Every position was
DERIVED** by searching each structure for a spot valid at all its stops — the
same method used for the Urban towers, after hand-picked positions there put
four stops over pierced slabs with no floor at all.

**Lifts are now map-scoped.** `CFG.LIFTS` entries carry a `map` field, the client
skips lifts belonging to another map, and the lift gate checks each shaft against
its own map's colliders. Without this the gate pooled Urban and Metro geometry
and reported two false failures — fixed at the root rather than by loosening the
assertion. Lift gate 27 -> **60 assertions**, covering both maps.

**SKYBRIDGES.** Four spans at 16.25m linking all four towers in a ring: solid
deck, waist-high sides for cover while crossing, open roof ribs. Every span has
two ends, so no elevated position in this map has a single entrance.

**PARKING GARAGE.** Five open-sided decks, 3.2m apart, NW quadrant. Columns every
7.5m break sightlines, parked cars give hard cover, waist-high perimeter walls
allow shooting out without turning the decks into a fishbowl. Lift-served.

**ROOFTOP GAMEPLAY.** Each tower roof gets AC units, a vent stack and a stair-head
block that split the deck into lanes, so a sniper holds an angle rather than the
whole roof and can be flanked.

**LOOT.** Map gate 472 -> **496 assertions**. Added skybridge decks, the four
tower mid-floors, and six garage-deck points. Two placements failed on first run
and were moved, not silenced: a spawn inside the garage perimeter wall, and an
earlier spawn inside a street container.

**Metro totals:** 23 merged meshes, 434 colliders.
**NOTE — over the brief's <=20 merged-mesh target.** Cause is material count:
phase 2 introduced a five-colour car palette plus glass/steel/panel, and
StaticMerge batches by material. Documented rather than hidden; the fix is
palette consolidation, which is safe but should be measured, not guessed.

**Gates:** integration 49/49 · map 496/496 · lifts 60/60 · build PASS all three
maps · models 38/38 · merge 9/9 · cover PASS urban+rural · ascent 25/27
(unchanged pre-existing Urban interior stairs).

**Phases 3 and 4 NOT started:** shopping mall, residential block, metro station
and tunnels, construction site and crane.

---

## v7.0 — Metro City, Phase 1 of ~4

The Metro City brief is seven districts, a five-level garage, a subway network,
65 loot points, 24 spawns with line-of-sight rules and a crane platform. That is
several sessions, not one. Delivered in phases with a full gate run between each
— the same compile-gate discipline used elsewhere in this project.

**PHASE 1 — foundation + Financial District + Central Plaza.**

*Integration (the part that must be right or nothing later works).* A new
environment file is invisible to every gate until wired in by hand, so all of it
was done explicitly: `CFG.MAPS` registry, `maps-metro.config.js`, `metro.js`,
`World.buildMap` dispatcher generalised from a hardcoded rural branch to a
builder lookup, `config/index.js` merger, `server.js mapData()`, two script tags
in `index.html`, and the file-lists of all five harnesses (map, build, access,
cover, lifts). Urban and Rural are untouched and still pass everything.

*Built.* Paved ground (top y=0, so the coplanar gate has nothing to catch), a
three-lane avenue grid recessed 3cm, Central Plaza with fountain, statues,
benches, street trees and a bus shelter, and four 6-storey Financial District
towers with a sill/glass window band on every floor. Plus 46 pieces of
procedural street cover, keeping the plaza and tower approaches clear.

*Numbers.* **18 merged meshes** (brief target: <=20). 309 colliders.
Map gate 370 -> **472 assertions** — metro's 22 loot points, 24 spawns and 10
airdrops are now judged on the same terms as Urban and Rural. Two failures on
first run were real and fixed: a spawn inside a street container, and the centre
airdrop landing on the fountain basin.

**KNOWN PHASE 1 GAP:** the towers have **no vertical access yet**. Roof and
mid-floor loot points exist and validate as resting on real geometry, but nothing
reaches them. Lifts land in phase 2 — deliberately lift-first, because every
staircase in this game with a run under ~0.5m was unclimbable until v6.2, while
lifts are gate-proven at 27/27 stops.

**Phases remaining:** 2 — lifts, skybridge, parking garage. 3 — shopping mall,
residential block. 4 — metro station and tunnels, construction site and crane.

**Gates:** integration 49/49 · map 472/472 · build PASS all three maps ·
lifts 27/27 · models 38/38 · merge 9/9 · cover PASS · ascent 25/27 (two
pre-existing Urban interior stairs, unchanged from v6.2).

**Still parked from v6.2/6.3:** player model, diagnostic overlay, helmet test
assertion, minimap rebake, loot in every house/floor, proximity loot labels, bag
inventory + consumable-gated regen, kill animation.

---

## v6.2 — The Staircase Fix

**Rahul reported stairs inside rooms that won't reach the second floor. He was
right, and it is not a placement problem — it is `stairFlight` itself.**

There are 43 staircases in this game. The gate covered 16. Listing every call
showed the pattern immediately: the only flights that have ever worked in a
browser use a **0.5m run**; nearly every other stair in the map uses **0.33**.

`stairFlight` gave each tread a skirt reaching ~1.2m below its top, to hide the
gap underneath. That skirt is a COLLIDER. `controller.moveAxis` refuses an
auto-step whenever the destination capsule overlaps anything — and with a 0.33
run, the tread TWO ahead sits inside the climber's chest. Every interior stair,
shop stair, tunnel portal and station stair in the game was affected.

**Fix, at the source:** the tread collider is now a thin lip
(`min(stepH*0.55, 0.18)`), and the deep skirt below it is decorative
(`collide: false`). Appearance is unchanged; ~40 staircases became climbable in
one edit.

**Gate coverage 16 -> 27 assertions**, adding eleven interior/district stairs
that had never been tested: warehouse interior, south office, east block, south
shop, two shop rows, west apartments, north depot, two north blocks, cargo
office. **25 pass.** Two still fail:
- *south office*: a landing box sits ON the run at y 1.3-1.5 (the recurring
  landing-over-treads defect) — a real map bug, not yet fixed.
- *north block A*: the walker cannot reach the flight; a 1.3m wall stands between
  the approach and the stair, so the room is probably entered from elsewhere.
  Likely a bad gate approach vector rather than a map fault, unconfirmed.

**Gates:** integration 49/49 · map 370/370 · lifts 27/27 · ascent 25/27 ·
models 38/38 · merge 9/9 · cover PASS both maps · build PASS.

**NOT IN THIS BUILD** — the rest of the v6.2 list is untouched:
player model, diagnostic overlay, helmet test assertion, minimap rebake,
loot in every house/floor, proximity loot labels.

---

## v6.1 — Lifts and Helmets

**The ascent gate was wrong, twice.** `controller.update()` runs horizontal move
-> `grounded = false` -> vertical move, so `grounded` during horizontal movement
is left over from the PREVIOUS frame. After an auto-step the player sits
rise+0.02 clear and the next vertical move falls only ~4mm, so auto-step is
unavailable the following frame. The gate ran gravity first, making `grounded`
always true. It also used a constant 4.4 m/s instead of modelling MV.accel 42 /
MV.airAccel 9. Both corrected. This is why v6.0 shipped six unclimbable buildings
with a green gate.

**Root mechanism.** `stairFlight` skirts each tread with a 1.2m box. With a run
under ~0.5m the tread TWO ahead intrudes into the climber's headroom and the
auto-step clearance check rejects the step. The warehouse fire escape (0.5 run)
is the only stair profile confirmed working in a browser.

**Tower stairs deleted — lifts only.** Tower B's flight could not be made
reliable across three repositionings. Mall, airport terminal and ship keep their
stairs; those pass. Ascent gate 16/16.

**LIFTS** (`CFG.LIFTS`, ride with **Z**). Five shafts. Every shaft position was
DERIVED by searching each building for a spot valid at all floor stops — the
first positions I chose by eye sat inside the stairwell slot where upper slabs
are pierced, so four stops had no floor at all. New gate `tools/verify-lifts.js`
checks every stop for solid floor and head clearance: **27/27**.

2-second exposure before the ride, implemented as a delay rather than an animated
ride: the controller owns pos.y every frame and fighting it for 120 frames is the
same marginal physics that broke the stairs. Walk out of the shaft or die and it
cancels.

**HELMETS** (`CFG.HELMET`, own slot, own durability, mirroring vests).
H1 0.35/55 - H2 0.55/95 - H3 0.70/150. Cuts ONLY the headshot bonus, never base
damage: a 100-point head hit from a 2.5x weapon with H2 loses 55% of the 60-point
bonus, so 67 lands. Body and leg shots untouched. Point-blank explosives ignore
it, same rule as armour. `helm_1/2/3` loot at common/rare/legendary; pickup uses
the identical upgrade rule as armour.

**Also fixed:** platform ramps and station-house stair (v6.0 railway work), ship
superstructure raised onto the hull deck, rooftop loot realigned to the rebuilt
towers, flatcar loot point moved with the flatcar.

**Gates:** integration 49/49 · models 38/38 · map 370/370 · merge 9/9 ·
ascent 16/16 · **lifts 27/27** · cover PASS both maps · build PASS.

**KNOWN INCOMPLETE — read before deploying:**
- Human-proportioned player model: NOT STARTED
- On-screen diagnostic overlay: NOT STARTED
- Helmet absorb maths has no test assertion yet

---

## v6.0 — Districts, Towers, and the Railway That Never Worked

**The railway zone was never useless — it was unreachable.** Adding it to the
ascent gate for the first time showed **3 of its 5 stairs could not be climbed**:

| Stair | Reached | Needed | Cause |
|---|---|---|---|
| Station house east stair | 3.97 m | 4.60 m | roof arrival landing (4.60-4.85) sat ON the last two treads |
| Platform west ramp | 0.30 m | 1.12 m | flight began INSIDE the platform footprint |
| Platform east ramp | 0.30 m | 1.12 m | same |

All three are the same defect family as the v4.9 stringers: a solid box placed
over the treads. Ramps now start clear of the platform edge; the station landing
moved past the end of the flight. All 5 pass.

**New districts** (`districts-outer.js`), placed in the four quadrants the cover
tool measured as empty:

- **AIRPORT (NW)** — asphalt runway with centreline, 2-floor terminal, two
  open-fronted hangars, two parked aircraft (fuselage/wings/tail/engines as hard
  cover on the apron), fuel drums.
- **SHIP HARBOUR (SW)** — concrete quay, water channel, docked ship with a hull,
  a 3-floor superstructure you can climb to the bridge, and an aft deck; two
  gantry cranes; stacked containers.
- **MALL (E)** — 38x22 m two-floor box with interior planters and stalls as
  ground-floor cover.
- **HIGH-RISE CLUSTER (SE)** — three towers of 6, 7 and 6 floors (18-21 m), each
  with a continuous window band on every floor to fight and snipe from.

**One parameterised builder for everything multi-storey.** `building(x0,x1,z0,z1,
floors, wallMat, roofMat)` lays slabs, four walls per floor split into a sill
band and a header band (leaving a continuous window band), corner posts, a roof
parapet, and one external flight along the -z face with a doorway gap punched in
the wall at every floor the flight passes. One stair design everywhere, so one
gate proves all of them.

**The builder's first version failed the gate**, and instructively: it placed a
landing box at every floor, centred on the flight. Those landings sat on top of
the treads and walled the climb off at 2.12 m — the identical bug I had just
fixed on the station house, reintroduced from scratch an hour later. The flight
is continuous and passes every floor, so the landings were never needed. Removed;
you step sideways through the doorway, a 0.25 m rise from tread to slab.

**Rooftop loot** on all six new climbable structures, so the climb pays. Map gate
358 -> 370 assertions.

**Ascent gate 7 -> 18 assertions** — now covers every staircase in the game:
2 fire escapes, 5 railway, 6 new buildings, 5 rural.

**Cover:** Urban dead ground 1.2% -> **0.6%**, worst point 22.5 m -> 16.5 m.

**Counts:** Urban 233 merged meshes (unchanged — StaticMerge absorbed the entire
build), colliders 1552 -> 2191. Rural untouched.

**Gates:** integration 49/49 x3 · models 38/38 · map 370/370 · merge 9/9 ·
**ascent 18/18** · cover PASS both maps · build-chain PASS · parse sweep clean.

**Not verified in-browser.** Climb all three towers, the mall, the terminal and
the ship bridge standing. Check the window bands read as windows and not as gaps
you fall through.

---

## v5.3 — Sniper and RPG Are Loot Now

**#3 / #4 — starting loadout.** `system.js` builds the base loadout as
`WEAPON_ORDER.filter(n => !WEAPONS[n].ex)`, so the `ex` flag is the whole
mechanism. Added `ex: 1` to `sniper` and `rocket` and moved both to number key 9,
which puts them in the existing bounded slot-9 exclusive cycle. Added
`wpn_sniper` (rare) and `wpn_rocket` (legendary) to `LOOT_ITEMS`.

Every player now spawns with: AK-47, M4A1, UZI, M870, P92, knife. The AWM-S and
RPG-L must be found. Keys 3 and 7 are now unused; that is deliberate and
harmless — renumbering the whole ladder would have risked the slot-cycling
assertions for cosmetic gain.

Gate `slot-9 cycling reaches the AWM (bounded, no spin)` still passes with four
more weapons in the cycle, which is the assertion that matters here.

**Voice removal: NOT done, deliberately.** See the note below — the premise
("without signup it won't work") is not established, and v5.2's diagnostics have
not been deployed yet. Removing a feature on an untested hypothesis, when removal
touches six layers and has already left debris once (the v4.7 lobby chat
`chat-input` orphan), is the wrong order of operations.

**Gates:** integration 49/49 x3 · models 38/38 · map 358/358 · merge 9/9 ·
ascent 7/7 · cover PASS both maps · build-chain PASS · parse sweep clean.

---

## v5.2 — Voice: Make The Failure Legible

Rahul reported voice dead in both directions. Root cause is not one bug — it is
that the feature was never diagnosable, plus a hard structural gap.

**The structural gap: `CFG.VOICE` never existed.** `voice.js` line 16 read
`CFG.VOICE && CFG.VOICE.turn` to append a TURN server. `CFG.VOICE` was not
defined in any config file, so that branch never ran. The mesh has been
**STUN-only since v4.5**. STUN cannot connect two peers that are both behind
symmetric NAT / CGNAT — common on Indian mobile and broadband. No amount of
signalling code fixes that; it needs a relay. The file header even said "STUN
only: rare NAT pairs may fail (no TURN)" — the hook to fix it was dead.

`CFG.VOICE = { turn: [], debug: true, iceRestart: true }` now exists and
`voice.js` iterates `turn` as an array. **Rahul must supply credentials** — this
is the one thing in this release that cannot be finished from here.

**Diagnostics panel (`#voice-diag`).** Voice failed silently across four releases
because the only feedback was a toast that vanished. The panel now shows, live:
mic track state (live/muted), whether TURN is configured, and per peer the
connection state, ICE state, whether a remote audio track arrived, the selected
candidate pair (`host` = same LAN, `srflx` = direct across NAT, `relay` = via
TURN), and any error. A failure now names its own stage.

**ICE restart before giving up.** `connectionState === 'failed'` previously
called `closePeer()` immediately, so any transient drop killed that pair
permanently. The initiator now retries once with `createOffer({iceRestart:true})`.

**`ontrack` hardening.** `el.srcObject = ev.streams[0]` silently produced no
audio if the remote sent a track without an associated stream. Falls back to
`new MediaStream([ev.track])`.

**Push-to-talk was bound twice.** `ui.js wireV43()` registers document-level
KeyT handlers; `game.js` registered a second pair. Both fired in-match. The
game.js copy is removed — ui.js is the correct home because PTT must work in the
lobby too.

**Smoke grenade has been unbindable since v4.5.** In `game.js`:

    if (e.code === 'KeyT') { ...setTalking(true); return; }
    if (e.code === 'KeyT') { Weapons.throwGrenade('smoke'); return; }

The second line was unreachable — voice took the key and returned first. Smoke is
now **B**. Nothing in the codebase had ever asserted that a throwable's binding
was reachable.

**Gate additions — `verify-models.js` (26 -> 36 assertions).** Asserts CFG.VOICE
exists and is shaped as voice.js expects; that voice.js actually reads it; that
diagnostics are both exposed and rendered; that the DOM element exists; that ICE
restart and candidate-pair reporting are present; that PTT is bound exactly once;
and that every throwable has a distinct reachable key. Cheap static checks that
would have caught the dead TURN hook the day it shipped.

**Gates:** integration 49/49 x3 · models 36/36 · map 358/358 · merge 9/9 ·
ascent 7/7 · cover PASS both maps · build-chain PASS · parse sweep clean.

---

## v5.1 — Scope Ladder + Airdrop Weapon

Rahul's answers: no new game mode, airdrops should carry a weapon that cannot be
found on the ground, anti-cheat deferred. Scope rule banked earlier: 2x/3x for
anyone, 4x and above marksman-only.

**#8 Scope ladder.** `x3` (adsFov 30), `x6` (16), `x8` (12) join the existing
`reddot`/`x2` (40)/`x4` (22). Magnification now runs 1x -> 8x on a single
consistent FOV curve, and every scope has a distinct value (gated).

Restriction is enforced in `system.js eff()`: `CFG.ATTACH[..].mark` scopes are
ignored unless the weapon carries `CFG.WEAPONS[..].mark`. Marksman weapons are
**SCAR-H** and **MK-14** — the two long-range guns that can mount an external
sight. The bolt snipers already carry their own 8-26x `scopeZoom` and are
deliberately untouched. A marksman scope stays in your kit when you're holding an
SMG; it simply does nothing until you switch. No pickup-flow change.

Loot: `att_x3` rare, `att_x6` legendary, `att_x8` **airdrop-exclusive**.

**#9 Airdrop-exclusive weapon — AA-12.** Automatic shotgun: 6 pellets x 10 dmg,
300rpm, 20-round drum, 13m range, 3.1s reload. It reuses the existing pellet and
falloff path, so it is a new *role* rather than a new system — nothing else in
the 13-weapon roster is a full-auto shotgun. First-person viewmodel (drum mag,
top rail) and third-person model added; `verify-models` picked it up automatically
and went 18 -> 19 assertions before the new invariants.

**New `drop: 1` mechanism.** Loot items flagged `drop: 1` are filtered out of the
ground-spawn rarity pools in `server/lib/loot.js`. The "guarantee one legendary
weapon on the map" fallback previously drew from `CFG.AIRDROP.weaponPool`, which
would have leaked the AA-12 onto the ground — it now draws from the legendary
weapons in the normal-spawn set instead.

**Gate additions — `verify-models.js` (19 -> 26 assertions).** Exercises the REAL
server loot module over 400 loot points x 25 rolls and asserts no drop-exclusive
item ever appears; asserts ground loot still yields weapons after the filter;
asserts every drop-exclusive item is actually reachable from a crate; and asserts
the scope ladder invariants (exactly 4x/6x/8x restricted, 2x/3x/reddot open,
marksman weapons not already scoped, all magnifications distinct).

**Anti-cheat: deferred at Rahul's direction.** Recorded here so the decision is
explicit rather than forgotten. Movement, ammo and fire rate remain fully
client-trusted. Note this is a *social* boundary, not a technical one — the Render
URL is public, so anyone with the link can join. The moment the link travels
beyond people you know, this decision needs revisiting.

**Gates:** integration 49/49 x3 · models 26/26 · map 358/358 · merge 9/9 ·
ascent 7/7 · cover PASS both maps · build-chain PASS · parse sweep clean.

**Still unconfirmed in a browser: v4.9, v5.0 and now v5.1**, plus voice chat since
v4.7. The last state Rahul verified live is v4.8.

---

## v5.0 — Cover, Trees, Recoil Recovery

Scope chosen by Rahul: maps first. Recoil came along anyway — see below, it
turned out to be a bug rather than a balance question.

**New tool + gate — `tools/verify-cover.js`.** Grids the playable area at 4m and
measures, per cell, the distance to the nearest body-blocking collider (top
between 0.5m and 3.5m). Cells further than 14m from any cover are "dead ground".
Run with `--report` for an ASCII cover map. This replaced "send me a screenshot
of the empty bits" with measured coordinates.

| Map | dead ground before | after | worst point before | after |
|---|---|---|---|---|
| Urban | 23.6% (591/2500 cells) | **1.2%** | 56.3 m | 22.5 m |
| Rural | 14.4% (359/2500 cells) | **1.1%** | 34.7 m | 21.3 m |

**#4 Urban vacant space — outskirts cover pass** (`districts-outer.js`). Walks a
7m grid, asks the LIVE collider set whether a spot already has cover within 11m,
and only fills genuinely exposed ground. Up to 110 pieces: shipping containers
(singles and stacks), jersey-barrier runs, utility sheds, pylons, planters,
rubble piles, crates, broken walls. Avenues and alleys are excluded. Self-
correcting — if the map gains content later this pass automatically places less.

**#2 Rural cover** (`rural.js`). Bushes 36 -> 78 clumps of 2-4 at three sizes
(concealment only, no colliders). Plus the same grid-driven pass placing up to 96
pieces of HARD cover: boulder groups, haystacks, log piles, hunting blinds
(three walls, open front), small stone shacks you can stand inside, and dry stone
walls. Roads, rivers, village and farm footprints are excluded via the existing
`blocked()` rects.

**#3 Tree variety.** One silhouette became five: classic conifer, tall bare-
trunked pine, rounded broadleaf, squat lumpy oak, and dead bare snag with
branches. Three bark tones. Trunks still collide (hard cover), canopies never do
(concealment) — unchanged contract. Box/Cylinder/Cone only, so StaticMerge still
absorbs everything: Rural went 13 -> 17 merged meshes for ~200 extra objects.

**#7 Recoil — this was arithmetic, not feel.** Per shot the view pitched by
`recoil * (0.9 + rand*0.25)` (mean 1.025x) while the accumulator only tracked
`recoil` (1.0x), and recovery returned 55% of the accumulator. Net: **~47% of
every burst's climb was permanent**. Horizontal drift was never recovered at all.
That is exactly "never recovers back to centre" — it was not a tuning problem.
Now the exact applied pitch AND yaw are recorded and handed back under
`CFG.RECOIL = { recover: 0.9, settleSec: 0.35, delayMs: 90 }`. Set `recover: 1`
for a perfect return to centre; 0.9 leaves a deliberate residual so long sprays
still cost something.

**Counts:** Urban 232 -> 233 merged meshes, 1413 -> 1552 colliders.
Rural 13 -> 17 merged meshes, 411 -> 535 colliders.

**Gates:** integration 49/49 x3 · models 18/18 · map 358/358 · merge 9/9 ·
ascent 7/7 · build-chain PASS · **cover PASS both maps** · parse sweep clean.

**One unreproduced failure, not silenced:** a single `test.js` run failed once
immediately after `verify-build.js` in the same shell, and the assertion name was
not captured. 12 consecutive clean runs since, including 4 deliberate attempts to
reproduce under the same CPU contention. Most likely the server had not finished
binding port 3000. Flagged here rather than swept up; if it recurs, capture the
`FAIL` line before doing anything else.

**Not verified in-browser.** Walk both maps and check the new cover does not
block a doorway, stair or spawn, and fire a full magazine to confirm the crosshair
returns to where you started.

---

## v4.9 — Stairs, Spotting, Regen

Scope note: Rahul raised 11 items. Four shipped here — the ones that were
deterministic bugs with a provable pass/fail. The content and balance items
(bushes/cover, tree variety, Urban filler, recoil, scope ladder, airdrop
variety) are deferred to v5.0 by choice, not by oversight; bundling authoring
work with collision fixes is how v4.4 shipped broken.

**#1 + #5 — stairs unclimbable (ONE root cause, both maps).**
v4.7 added "stepped stringer support walls" under each flight to kill a
floating-tread look. They shipped **with colliders**, so every 0.30-0.31 m tread
sat buried inside a solid 1.3-1.5 m wall. Auto-step is `CFG.MOVE.step = 0.42`,
so nothing could be climbed standing. Crouching sometimes worked because the
shorter capsule passes the auto-step headroom check, which is exactly the
symptom reported. Fixed by making the 12 stringer blocks decorative
(`{ collide: false }`) in `access.js` and `rural.js`. Treads and landings still
collide, so the geometry is unchanged visually.

The new ascent gate then exposed three genuine Rural placement bugs, all masked
until v4.8 removed the phantom Urban ground:
- SE terrace stair started at y=0 inside river A, whose ford floor is -0.4 — a
  0.68 m first step. Now starts on the ford floor with an extra tread.
- Village watchtower stood **inside river B** (x[50,60]); its stair base was
  unreachable from the recessed ford. Moved to the west bank at (40, 26).
- NW summit watchtower's stair base hung ~1 m off the t3 terrace edge. Shifted
  to bx=-64.5 so the whole run lands on the terrace.
- Loot points #13 and #14 moved with their towers; forest scatter exclusion
  added for the relocated tower footprint.

**#6 — enemy position given away.** The name tag sprite is built with
`depthTest: false` and was never hidden, so an enemy's name rendered **through
walls and terrain at unlimited range**. Name tags are now ally-only. Enemy
awareness comes from the minimap alone, which already reveals a foe who fired
within 3.5 s or is inside 18 m — that behaviour already existed and is unchanged.

**#10 — out-of-combat health regeneration.** New `CFG.REGEN`
(`delaySec: 7, perSec: 6, maxFrac: 1.0`), applied server-side in the snapshot
tick at 4 Hz, per-room. Armor does not regenerate. Server-authoritative like every
other HP change, so no new message type and no trust-model change. Numbers are my
call and are one config line to retune.

**Test hardening.** The `damaged` payload now actually carries `dmg` — the v4.7
changelog claimed it did, but the field was never added. The legs-multiplier
assertion was still deriving damage from an hp delta, which regen broke on a 1-in-4
flake. It now reads the reported `dmg` and is immune to anything else moving hp.

**New gate — `tools/verify-access.js` (7 assertions).** Ports the real
`controller.moveAxis` auto-step model and walks a standing capsule up every
staircase in both maps, asserting it reaches the target height. No previous gate
checked climbability: `verify-map` proves loot rests on geometry, `verify-build`
proves the scene constructs. Neither would ever have caught this.

**Gates:** integration 49/49 x3 · models 18/18 · map 358/358 · merge 9/9 ·
build-chain PASS both maps · **ascent 7/7** · parse sweep clean.

**Not verified in-browser.** Climb both fire escapes, all three watchtowers and
both terrace stairs standing (no crouch). Confirm enemy names are gone and ally
names remain.

---

## v4.8 — Rural Flicker Root Cause

**Symptom reported:** Rural "screen flickers"; whole ground blinking green/grey
under movement. Reproduced from Rahul's 28s screen recording by extracting
consecutive frames — the ground flips flat-green to textured-brown on isolated
single frames, with a wavy distance-dependent boundary and the near field
unaffected. That is a depth-precision tie, not a shader or culling fault.

**Root cause (found by headless AABB dump, real three, merge disabled):**
`World._initPart1()` unconditionally called `groundAndRoads()` — the URBAN
ground builder — for **every** map. On Rural that laid:

| Surface | Top Y | Footprint |
|---|---|---|
| Urban dirt ground (x -110..45.4) | **0** | 34,188 m² |
| Urban dirt ground (x 48.6..110) | **0** | 13,508 m² |
| Rural NW / S / NE grass | **0** | 44,300 m² |
| Urban asphalt avenue cross | 0.02 | 3,808 m² |
| Urban sidewalk curbs (8, solid) | 0.13 | 590 m² |

92,639 m² of different-material surface sharing one exact plane. The GPU cannot
break the tie, so the winner changed per frame → full-screen flicker. Present
since v4.6 (multi-map split). Every previous "grass/road z-fighting" fix targeted
the wrong pair of surfaces, which is why the polygon-offset attempt blanked the
map and the geometric-separation rewrite did not stop the blinking.

**Also fixed by the same change (all were Urban leakage into Rural):**
- phantom asphalt avenue cross floating 2 cm over the grass
- eight solid concrete curbs with live colliders standing in the forest
- rivers were not walkable 0.4 m fords — the Urban ground collider at y=0 filled
  them in; the ford now works as designed (and loot#17, which had been resting on
  that phantom floor, dropped to the river bed: `[53, 0.55, 12]` → `[53, 0.15, 12]`)
- four Urban interior point lights (two animated via `World.flickers`) burning
  shading time in open terrain

**Changes**
- `world.js` — `_initPart1(sceneRef, opts)`; `opts.urban === false` skips
  `groundAndRoads()` and the Urban interior point lights. `lighting(urban)` gained
  the same guard. `World.build()` (Urban) is behaviourally unchanged.
- `world.js` — `buildMap()` rural path passes `{ urban: false }`.
- `rural.js` — **removed `polygonOffset` from `ROADMAT`**. It was still shipped
  despite the v4.7 note saying it had been reverted; it is the exact material
  state that rendered Rural fully black in-browser. Replaced with geometric
  clearance: rural dirt roads moved from `0.012..0.06` to `0.04..0.09`, i.e. 4 cm
  of clear air over the grass top. At `near=0.08 / far=320` the 24-bit depth step
  reaches 12 mm at ~127 m (inside view distance) but 40 mm only past ~230 m,
  which is fully fogged.
- `rural.js` — grass texture `repeat` 48 → 4. `uvScale()` already tiles every 2 m,
  so 48 meant ~24 tiles/metre: it mip-collapsed to flat paint (why the grass had no
  visible texture at all) and shimmered under motion. Added `anisotropy = 8`.
- `districts-south.js` / `districts-outer.js` — two Urban concrete pads sat 4 mm
  under the asphalt with real overlap (238 + 42 + 294 m²), which fights past ~73 m.
  Split/truncated to abut the avenue edges instead of running beneath it. Purely
  geometric; no material or ordering tricks.

**New permanent gate — `tools/verify-build.js`**
Builds both maps with merge disabled, collects every large flat surface, and fails
if any two with **different materials** share a top-Y within 4 mm and overlap by
more than 1 m in both axes. Same-material overlaps are skipped (identical pixels
either way, so they cannot show a fight). This exact class of bug can no longer
ship silently.

**Counts:** Rural 15 → 13 merged meshes, 431 → 419 colliders. Urban unchanged
(232 meshes / 1,413 colliders).

**Gates:** integration 49/49 ×3 · models 18/18 · map 358/358 · merge 9/9 ·
build-chain PASS both maps incl. new coplanar gate · parse sweep clean.

**Not verified in-browser yet.** Headless gates cannot see render-stage failures —
this is precisely how the black-Rural regression got through last time. Load Rural
and confirm before trusting it.

---

## v4.7 — Fixes + Visual Pass *(includes v4.6)*

**v4.7 revision (post browser test):** rural grass now uses a speckled texture
(was flat color — read as grey/green shimmer under shadows); dirt roads thickened
and de-overlapped (z-fighting at the crossroads); watchtower stairs rebuilt to climb
TOWARD the deck on stepped stringers with support walls (they previously ascended
away from the platform on floating treads — stairFlight only skirts 0.9m below each
step); urban fire escapes grounded on stepped stringers; a chat input that survived
the removal (operators panel) deleted; live scoreboard moved out of the centered
hud-top container to the LEFT edge (it was overlapping the objective text); lobby
grid rebalanced to two columns with a labeled MAP select; AC units added to the two
accessible roofs. Second revision: rural roads moved to a
polygon-offset material (the grey-green flicker was depth z-fighting between road
strips and grass at distance, not shadows — the texture fix treated the wrong
cause); lobby restored to the original three-column template (the two-column
rework is reverted) with MAP as a standard rules field; chat markup verified
absent by machine check — a message box after deploying this build means a stale
index.html in the repo (mixed upload) plus browser cache.
- **Voice hardening** (reported total silence in the field): dual STUN + optional TURN
  config hook (CFG.VOICE.turn), DOM-attached audio elements with explicit play() and a
  user-gesture retry queue, offer-glare rollback, per-peer connection toasts
  ("<name>: voice connected / voice link FAILED"), an always-visible
  **MIC MUTED — HOLD T** vs **TALKING** chip, and PTT listeners that work in the lobby.
  Honest scope: signaling is machine-verified; the audio path is browser-only territory.
  Discriminating test: two tabs, one machine, headphones.
- **Minimap fixed**: the bake hardcoded the Urban avenue cross onto every map and
  dropped structures longer than 45m. Now map-aware (Rural renders dirt roads and
  rivers) with an 80m capture threshold.
- **Lobby chat removed** at every layer (was unused).
- **Vehicles redesigned**: buses and cars get glass bands, wheels, head/tail lights,
  liveries — one collidable hull each, decoration colliderless, still merge-friendly.
- Urban gets 3 validator-proven roof loot points on the new accessibility routes.

## v4.6 — Gameplay & Map Expansion *(folded into v4.7)*
- **Multi-map system**: map choice at room creation, host-changeable in lobby, carried
  through matchStart; world builds into a disposable root group with a proven reset()
  path for map switching. Per-map loot/spawns/airdrops server-side (mapData).
- **RURAL map**: forest theme on the same +-100 bounds — two rivers as walkable fords
  with three wooden bridges, terraced hills (NW summit watchtower = the long sniping
  lane), five-cabin village, farm with barn loft + silo, NE logging area, boulder
  cover, bushes, ~130 trees. 51 loot points / 22 spawns / 8 airdrop zones, all
  mathematically validated. Post-merge cost: **14 meshes** for the whole map.
- **Complete weapon rebalance** — every weapon has a role: UZI/P90 shred close and die
  at range; AK/M4/SCAR split power vs control; MK-14 is the semi-auto DMR; M249 has a
  100-round belt and a 5.2s reload; the M870 deletes people inside 9m and tickles past
  it. Per-weapon recoil patterns, reload times, movement penalties, tracer colors, and
  synthesized sound profiles.
- **Sniper ballistics**: AWM-S and AWM .338 fire simulated projectiles — real travel
  time (240/300 m/s), gravity drop, stance-scaled scope sway applied *before* the shot
  (prone 15% / crouch 45% / standing 100%). Headshots are lethal through any armor;
  legs take reduced damage on every weapon (client hit zone + server multiplier).
- **Urban accessibility**: exterior metal fire escapes to the garage roof (4.30) and
  warehouse roof (9.15) — heights derived from the collider set, roofs railed, and the
  validator proves loot rests on them.
- **Persistent live scoreboard** (top-right): K/D/A + score (kills x200 + assists x50 +
  damage x0.5), sorted, map label, team score in team modes, updates on every lobby
  push (kills, joins, leaves). HTML-escaped names.

## v4.5 — Voice Chat
- In-game voice for up to ~10 players over a WebRTC peer-to-peer mesh.
  JOIN VOICE in lobby (one-time mic permission), **hold T** to talk, TALKING indicator.
- Signaling rides the existing game socket, room-scoped and opt-in gated on both ends;
  audio is pure P2P — the server never carries voice traffic. Zero Render changes.
- Echo cancellation / noise suppression / auto gain on capture; push-to-talk keeps
  idle bandwidth near zero.
- **Rebuilt release** additionally fixes the v4.4 build crash and adds the
  `tools/verify-build.js` gate (full client build chain executed against real three).

**Fixed during development:** disconnect cleanup verified end-to-end (test initially
compared against a nulled `socket.id` — socket.io-client nulls it on disconnect).

**Verification:** 44/44 integration x3 · 17/17 pipeline · 198/198 map · 9/9 merge · build-chain PASS.

---

## v4.4 — Audio / Performance / Animation Polish
- **Static geometry merge:** ~1,500 per-box draw calls collapse into per-material merged
  meshes (scene: 185 meshes total post-merge). Toggle: `RENDER.mergeStatic` in
  `world.config.js` — the instant rollback for any merge-related visual issue.
- Indoor echo bus (fades in under any roof, collider-probe driven).
- Surface-aware footsteps: concrete / metal / wood via collider surface tags.
- Ambience: distant-traffic rumble, rare far-off siren.
- Animation: smooth crouch/prone transitions; remotes fall over and sink on death.
- **Bug fixes:** prone remotes had *standing* hit-capsules (client hit test ignored
  `r.prone`); prone now also grants a 45% accuracy bonus. Return-to-lobby leaked
  assists/damage/streak/ready/mines and live mines/airdrops/countdowns. Molotov
  throttle map persisted across matches.
- Snapshot bandwidth cut ~35% (coordinate rounding); damage-number texture LRU (48).
- `three@0.128` added as **devDependency** (test-only; no runtime/Render impact) —
  first and only package.json change.

**CRITICAL DEFECT (post-release):** the merge hook referenced an out-of-scope variable,
crashing `World.build()` in every browser — game stuck at "BUILDING SECTOR 7".
Root cause of the miss: syntax checks cannot see runtime scope errors, and the map
validator's stub context never loads StaticMerge, so a `typeof` guard skipped the
broken line. Fixed in rebuilt v4.5; the verify-build gate now makes this class of
defect impossible to ship silently.

---

## v4.3 — Gameplay Update
- **Prone** (X): true low profile, replicated to all clients via the stance channel
  (server was flattening stance `2` to `1` — found and fixed in-release).
- **AP Mines** (V, start 5, cap 8): fully server-authoritative module
  (`server/lib/mines.js`) — placement budget, 1s arm, proximity trigger, instant kill
  on the triggering player, splash falloff. Owner is trigger-immune but **not**
  splash-immune (by design — mines punish carelessness, including the owner's).
- **Molotov** (H, start 3): shatters on impact, 80 direct, burning area with ticks;
  damage server-clamped to 80 and per-victim throttled (350ms).
- **Scope zoom:** mouse wheel while scoped (sniper 10–26°, AWM 8–24°, config-driven).
- **Lobby:** ready-up with all-ready 5s auto-countdown (self-cancelling), lobby chat
  (120 chars), ready badges.
- Kill-feed weapon chips; match summary with K/D/A/DMG; mines + molotovs in loot.

**Verification:** 38/38 integration x3 · 198/198 map · 17/17 pipeline.

---

## v4.2 — Graphics + Map Expansion *(v4.1 fused in)*
- Map expanded to ±100 (2.04x area): Airport, Railway Station, Cargo/Warehouse,
  Bus Terminal, West Construction Zone, Residential — old wall converted to a gated
  inner ring. 72 loot points, 22 spawns, 10 airdrop points.
- Stylized dusk look via `CFG.RENDER`; lamp-glow sprites; road markings + crosswalks;
  power lines; lit billboards; alley clutter; perimeter trees (all colliderless deco).
- **New gate:** `tools/verify-map.js` — headless proof that every loot point sits on
  real geometry and every spawn is unobstructed (198 assertions).

**Process note:** v4.1 and v4.2 were planned as separate deploys but fused on disk
by a parallel work stream; separating them would have meant hand-reverting verified
geometry. Deployment checkpoints became v4.2 -> v4.3.

---

## v4.0 — Engine Refactor *(zero gameplay change)*
- 11 flat files -> `public/src/` in 9 domains; server 614-line monolith ->
  306 lines + `server/lib/` (rooms / loot / combat) with injected context.
- Config split into 4 domain files + merger; **CFG proven byte-identical** via JSON
  deep-diff (only planned additions). `docs/ARCHITECTURE.md` with module contracts
  and Phase-12 extension points (bots, vehicles, spectator, BR).
- Broke the server 3x during the split (orphaned constants) — all caught by
  boot-smoke + suite; the systematic constant-relocation scan is now the pattern.

---

## v3.1 — Weapon Visibility Hotfix
- Root causes: viewmodel registry missing the 5 exclusive first-person models
  (+ completeness fallback added), and snapshot ingestion discarding the weapon
  index for third-person models. Added `verify-models.js` headless harness.

## v3.0 — Loot & Arsenal
- Dynamic loot (47 points, common/rare/legendary), 5 exclusive weapons (slot 9),
  8 attachments across 3 slots, airdrops with flyby + smoke beacon, grenade cooking
  (hold G), spawn protection 2.5s, assists/streaks/damage scoreboard. 29 tests.

## v2.0 — Teams & Armor
- FFA / 3v3 / 5v5, friendly-fire rules, armor with durability, live minimap. 19 tests.

## v1.0 — Baseline
- Browser FPS: Three.js r128 (no build step), Node/Express/Socket.IO rooms,
  8 weapons, synthesized Web Audio (zero asset files), AABB world.

---

## Known issues & accepted limitations (current, v4.7)

1. **Voice — NAT pairs:** STUN-only by default; with two players there is exactly ONE
   network pair, so a NAT failure is total silence, not a partial one. The TURN hook
   (CFG.VOICE.turn) accepts credentials if you ever rent or host one. The new chip and
   toasts now name the failing stage instead of failing silently.
2. **Voice — media path untested headlessly:** signaling and rejoin are machine-verified;
   microphone/audio requires human browser testing (two tabs + headphones first).
2b. **adsTime** exists in config but ADS transition speed is not yet consumed by the
   viewmodel — deliberate cut. Road texture polish beyond markings also deferred.
3. **Mine owner splash:** owners can die to their own mine's splash. Design, not bug.
4. **Audio tuning knobs:** echo depth and siren/traffic volumes are hardcoded in
   `audio.js`, not config. One-line edits if they annoy.
5. **Trust model:** ammo and movement are client-authoritative (HP/armor/loot/mines
   are server-authoritative). Fine for friend play; not cheat-proof for strangers.
6. **Deferred:** knife/pistol removal (needs usage data); LOD/occlusion intentionally
   not built (draw-call merge supersedes both for this map style).

## Verification layers (run all before any release)

| Gate | Command | Proves |
|---|---|---|
| Integration (49) | `node server.js &` then `node test.js` | full server gameplay incl. voice + maps + ballistics, run 3x |
| Pipeline (18) | `node verify-models.js` | viewmodels, grants, zoom, gear |
| Map (358, 2 maps) | `node tools/verify-map.js` | loot support, spawn clearance, roofs |
| Merge (9) | `node tools/verify-merge.js` | geometry math vs real three |
| Build chain | `node tools/verify-build.js` | both maps + reset path on real three |
| Parse sweep | `node --check` on every .js | syntax |
