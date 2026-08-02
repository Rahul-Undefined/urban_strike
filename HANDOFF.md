# Urban Strike — Project Handoff (v8.5)

**Upload this file plus `urban-strike-v8.5.zip` into a new chat. Read this file
completely before touching anything.**

---

## 0. READ THIS FIRST — how this project fails

This codebase has one repeated failure signature. Understanding it matters more
than any individual fact below.

**Automated gates pass. The browser disagrees.**

| Incident | Gates said | Browser said |
|---|---|---|
| v4.4 static merge | syntax OK | crashed `World.build()` in every browser |
| Rural polygon-offset road | map validator PASS | **entire map rendered black** |
| Rural ground flicker | 358/358 PASS | full-screen z-fighting for 3 versions |
| v6.0 tower stairs | ascent gate 18/18 PASS | **not one staircase was climbable** |
| ~40 interior stairs | never tested at all | unclimbable since the day they shipped |
| **v7.5 crater disc** | **all gates PASS** | **6.2 m black slab at the crossroads** |

The v7.5 case is the most recent and the most instructive. Converting the crater
scorch from `CircleGeometry` to `CylinderGeometry` (to make it mergeable) left
the old `rotation.x = -PI/2` in place. A circle needs rotating flat; a cylinder
already is. The disc stood on its edge. Every gate was green.

**Therefore:**
- Never say a feature "works". Say "passes gate X" or "confirmed in browser by
  Rahul on date Y". These are different claims.
- When Rahul reports something broken that a gate says passes, **the gate is
  wrong**. Debug the gate first.
- Render-stage failures are invisible headlessly. Prefer geometric solutions
  over material/shader tricks, always.
- **A new gate is wrong until it has agreed with a human once.** The v7.7
  architecture gate reported eight floating buildings on its first run; all
  eight were the gate not understanding cantilevers. It was believed for about
  four minutes before being checked.

**The changelog has lied twice** (v4.7 claimed the `polygonOffset` revert that
never happened, and a `damaged` field that did not exist). Treat historical
entries as *claims*.

---

## 1. What this is

Browser multiplayer FPS. **Rahul** owns it, is a beginner coder, deploys via
GitHub → Render (build `npm install`, start `node server.js` — unchanged since
v4.0).

- **Server:** Node/Express/Socket.IO. `server.js` + `server/lib/{rooms,loot,combat,mines}.js`
- **Client:** Three.js **r128 via CDN script tags, no bundler**. Load order in
  `public/index.html` is load-bearing.
- Synthesized Web Audio (zero asset files). AABB collision. Zero image files —
  every texture is canvas-generated or a gradient.
- **Trust model:** client-authoritative movement/ammo; server-authoritative
  HP/armor/helmet/loot/mines.
- `three@0.128` is a devDependency (test harnesses only). This is the **only**
  package.json change in project history. Keep it that way.
- **Never ship `package-lock.json`** — it has never been in the repo.

### Communication preferences (apply to EVERY reply)
1. First sentence challenges an assumption or leads with the uncomfortable
   truth. Never open with agreement.
2. Confidence tags before claims: `[Certain]` / `[Likely]` / `[Guessing]`.
3. Banned phrases: "Great question", "You're absolutely right", "That makes a
   lot of sense", "Absolutely", "Definitely".
4. Disagree with structure: "I disagree because X. Instead I'd do Y. The risk in
   your approach is Z."
5. Goldman-Sachs-style structure: clear sections, concise, tables over prose.
6. Beginner-friendly code explanations.
7. Hold positions under pushback unless given genuinely new information.

Rahul responds well to being told no with a reason. He has accepted a scope
reduction several times when given the engineering rationale. He has also
corrected the project's design philosophy twice and both corrections were right.

### Release cadence (changed by Rahul at v7.7)
**Fewer, larger milestone releases.** Group related work into a coherent
milestone, complete it properly, then ship. Do not ship small incremental
versions. Every release must include **both** a changelog entry and an updated
copy of this handoff.

---

## 2. Current state

**Shipped:** `urban-strike-v8.0.zip` — cumulative, contains everything.

**Every deployment is browser-tested by Rahul.** Verification is tracked per
FEATURE in section 8, not per version — see that ledger for what is confirmed,
what is awaiting his report, and the short list that has genuinely never been
rendered by anyone (Metro City, Metro's underground lifts, voice chat).

### Rollback ladder
```
v8.0  current — Container Yard, mall/yard collision fix, legible minimap
v7.9  operator rig + animation, Warehouse district, frame-cost metrics
v7.8  Milestone 9 pt1: Residential, Apartment, Shopping districts
v7.7  architecture gate + fake-architecture pass
v7.6  railway district rebuilt; crater-disc and countdown bugs fixed
v7.5  material consolidation (233 -> 55 draw calls) — SHIPPED THE CRATER BUG
v7.4.1 menu overlap fix, 5s countdown
v7.4  Milestone 8a: lobby overhaul, Metro selectable, host-gated launch
v7.3  Metro City complete
v6.2  ~40 staircases fixed
v6.0  BROKEN: no tower stair climbable. Do not roll back here.
v4.8  last browser-CONFIRMED good state
v4.4 and the FIRST v4.5 build are BROKEN — never roll back to those.
```

### Three maps
| Map | Theme | Colliders | Draw calls | Lights | Tris |
|---|---|---|---|---|---|
| urban | 6 rebuilt districts + airport, harbour, towers, construction | 3188 | **85** | 7 | 72.1k |
| rural | forest, rivers, village, farm, watchtowers | 525 | 17 | 3 | 21.9k |
| metro | downtown, skyscrapers, mall, subway, construction | 946 | 19 | 3 | 12.7k |

**Budget the frame, not the draw call.** A shadow-casting batch is submitted
TWICE per frame — shadow map, then main pass. Urban's "84 draw calls" is really
140 geometry submissions with 58.9k of its 68.6k triangles rasterised twice.
`verify-batch` budgets all three:

| Map | draws / budget | shadow casters / budget | tris / budget |
|---|---|---|---|
| urban | 85 / 115 | 56 / 62 | 72.1k / 95k |
| rural | 17 / 40 | 13 / 20 | 21.9k / 30k |
| metro | 19 / 45 | 14 / 22 | 12.7k / 26k |

Players are budgeted separately (`verify-avatar`): ten kitted operators visible
at once = 180 draw calls, budget 200. Avatars CANNOT be static-merged — they
move every frame — so the only levers are part count, material sharing and LOD.

---

## 3. Verification gates — run ALL before shipping

| Gate | Command | Current | Proves |
|---|---|---|---|
| Integration | `node server.js & sleep 3; node test.js` | 85 | full server gameplay + lobby/launch gate + config invariants. **Run 3x** |
| Models+loot+voice | `node verify-models.js` | 38 | viewmodels, grants, loot exclusivity, scope ladder, voice wiring |
| Map | `node tools/verify-map.js` | 664 | loot support / spawn clearance / airdrop landing, all 3 maps |
| Build chain | `node tools/verify-build.js` | PASS | real-three vm build of all 3 maps + reset + coplanar-ground gate |
| Ascent | `node tools/verify-access.js` | 49/51 | walks a capsule up every staircase |
| Lifts | `node tools/verify-lifts.js` | 98 | every lift stop has floor + head clearance |
| Cover | `node tools/verify-cover.js` | PASS | dead-ground budget (<6%); `--report` prints an ASCII map |
| **Batching** | `node tools/verify-batch.js` | 36 | draw-call budget + the four batching invariants + edge-on decals |
| **Architecture** | `node tools/verify-arch.js` | **3/6 — RED BY DESIGN** | floating geometry (0 everywhere) + broken-promise roofs |
| **Avatar** | `node verify-avatar.js` | **23** | player rig: parts, material sharing, joints, stance, strafe, turn, reload, LOD, lobby cost |
| **Collision** | `node tools/verify-collision.js` | **19** | the resolver itself: order independence, auto-step, no downward resolve, void plane, world-edge probe |
| **Stair quality** | `node tools/verify-stairs-quality.js` | **15** | support, rise, width, headroom, landing — per flight, from a build-time registry |
| **Map flow** | `node tools/verify-flow.js` | **3** | walkable ground reachable from spawn; enumerates sealed pockets |
| **Z-fighting** | `node tools/verify-zfight.js` | **2** | surfaces sharing a plane that will flicker |
| **Props** | `node tools/verify-props.js` | **2** | props buried in structure; props standing on nothing |
| Merge | `node tools/verify-merge.js` | 9 | StaticMerge geometry math |
| Parse sweep | `node --check` every .js | clean | syntax only |

**`verify-arch` is deliberately red.** Its `broken` budget is 0 and there are 10
broken promises on urban, 7 on rural, 25 on metro — all in districts not yet
rebuilt. Each district pass drives the number down. That is the acceptance
criterion for Milestone 9, not a bug. Do not raise the budget to make it green.

**Two ascent failures are known and pre-existing** (urban south office has a
landing box on the run; north block A the walker cannot reach). Not regressions.

### Rule: never weaken a validator
If a gate fails, fix the implementation. Every time a gate has been believed
over a hunch, it found a real bug. Extending a *stub* to model what the build
actually constructs is not weakening (see verify-map's THREE stub).

---

## 4. Hard-won gotchas — READ BEFORE WRITING CODE

### Batching and performance (v7.5)
`StaticMerge` batches by `material.uuid | castShadow | receiveShadow`. Four
mistakes make geometry unmergeable, and all four have shipped:
1. A static mesh created with `new THREE.Mesh` and never given
   `matrixAutoUpdate = false`.
2. `MeshBasicMaterial` for unlit surfaces. **Use a Lambert with
   `color: 0x000000` and a full `emissive`** — byte-identical pixels, and it
   merges. Districts get this as `T.emissive`.
3. Materials minted inside a per-call builder function. Hoist to the shared `M`
   palette. `bus()` used to mint six materials *per bus*.
4. Props parented to a `THREE.Group` — Group children are not scene children.
Only Box, Cylinder and Cone are merge-whitelisted. Sprites never batch; use
`THREE.Points`.

### Geometry
- **Never create two large coplanar surfaces of different materials** (>200 m²,
  tops within 4 mm). The build gate catches it.
- **Prefer geometric separation over material/shader tricks for z-fighting.**
- **Derive roof/structure heights**, never guess. Use a vm stub and scan
  `_colliders()`.
- `CircleGeometry` lies in XY and needs rotating flat. `CylinderGeometry` is
  already flat in XZ. Do not carry a rotation across a conversion.

### Stairs and vertical access
- `stairFlight(sx, sy, sz, dirX, dirZ, steps, stepH, stepD, width, mat)`.
  The flight occupies `sx .. sx + dirX*steps*stepD`; last tread top is
  `sy + steps*stepH`. **Land flush on the destination top.**
- **Never place a landing box on a stair run.** This has appeared five times.
- **Never start a flight inside the destination footprint.**
- Leave **at least 1.5 m of standing room** at the foot of a flight. The v7.6
  station stair had 0.7 m and the ascent walker was squeezed into the wall.
- `CFG.MOVE.step` is 0.42 m. Any rise above that needs a lift or a flight.
- Lifts are the robust vertical mechanic; stairs are the fragile one.
- **Every lift shaft position must be derived by search, never by eye.**

### Adding a new district file — the wiring checklist
A new environment file is invisible to every gate until wired by hand:
1. `public/index.html` script tag, in load order
2. `World.build` → the `World._buildPartN({...})` call with the helper bundle
3. File lists in **all six** harnesses: verify-map, verify-build, verify-access,
   verify-cover, verify-lifts, verify-batch, verify-arch, verify-collision,
   verify-stairs-quality, verify-flow, verify-zfight, verify-props
Adding a district to an EXISTING file avoids all of this. v7.6 put the rebuilt
railway inside `districts-north.js` for exactly that reason.

### Determinism (v7.8)
`rnd()` is a running PRNG shared by every district builder. `World.reset()` now
**reseeds it first and unconditionally**. Before that fix, a map's scattered
props depended on how many `rnd()` calls the previous map made in the same
process — editing Urban silently moved Rural's crates, and every gate was
non-deterministic. If a gate number moves without a matching code change,
suspect determinism before believing the number.

### The "run must be ~0.5" rule is DEAD
`stairFlight` used to skirt each tread with a 1.2 m box that reached into the
climber's chest, so any run under ~0.5 m was unclimbable. **v6.2 made the tread
collider a thin slab.** Runs of 0.30 are correct and gate-proven across the
terrace, the colony and the station. The old rule survives only as a comment
correction in `districts-outer.js`; do not reintroduce it.

### Districts can stand INSIDE each other, and no gate looks for it
v6.0's cargo yard put six container stacks inside the mall's floor plate, and
v7.8 built shop units on top of them. The map gate checks loot and spawns, the
coplanar gate checks large flat surfaces, the architecture gate checks floating
and unreachable decks — **none of them checks whether one building occupies
another's footprint.** It surfaced only because a stair walked into a bus from a
different district. Before adding any district, scan the target band for
existing colliders and write the footprint into the block comment.

### The minimap saturates before it goes stale (v8.0)
`addCollider` auto-captures eye-height footprints. By v7.9 Urban was capturing
1,100 shapes with a median area of 0.9 m2 — every crate and bollard drawn at a
wall's visual weight. Capture is now filtered (>= 3.5 m2 and >= 1.8 m in one
direction) and drawn in two weights. `verify-batch` gates shape count AND median
footprint. If the map looks wrong, check saturation before assuming staleness.

### The player rig (v7.9)
Avatars move every frame, so they can NEVER be static-merged. Cost is controlled
by three things only:
1. **Part count.** 13 visible unequipped, 16 fully kitted. Every part multiplies
   by the player count — a mag pouch nobody can resolve costs ten draw calls.
2. **Shared materials.** All body materials are module-level. The ONLY
   per-player material is the identity accent, cached by colour, so ten players
   on two teams cost two accents. Never mint a material inside `buildAvatar`.
3. **LOD.** Small parts hide past 30 m.

The rig is a JOINT HIERARCHY: nested Groups at hip, knee, shoulder, elbow.
Groups are free. Rotating a limb mesh directly makes it scissor about its own
centre. Crouch and prone are POSES — never `scale.y`, which squashes the head.

Equipment is `.visible` toggling on meshes built once. Three.js skips invisible
objects, so hidden gear costs nothing. Add new equipment as another hidden mesh
plus a line in `setGear`, never as a second character model.

Snapshot fields the rig reads: `cr` (0/1/2 stance), `mv` (0/1/2 speed), `rx`,
`ry`, `ln`, `hl` (helmet), `lv` (armor), `rl` (reloading). Movement DIRECTION,
turn rate and stride are derived client-side from interpolated position and yaw
— do not add network fields for them.

### Container / tooling
- **`pkill -f "node server.js"` kills its own shell.** Use `fuser -k 3000/tcp`.
- **Long bash batches silently time out** (~90 s). Split gate runs. The
  integration suite takes ~110 s; run it in the background and poll.
- `grep -c` exits 1 on zero matches — don't chain under `&&`.
- Python heredoc `assert old in src` needs byte-exact anchors.
- Container may reset mid-session. Re-unzip and `npm install --no-audit
  --no-fund`, then `rm -f package-lock.json`.
- **Verify gates from the extracted zip**, not just the working copy.

### Deploy ritual (tell Rahul every time)
Delete **all** files in the GitHub repo → upload the new zip's contents → wait
for Render → hard-refresh (Ctrl+Shift+R). Mixed uploads have produced ghost bugs
that looked like code regressions and were stale-file artifacts.

---

## 5. Game systems reference

**Weapons (14):** ak47, m4a1, sniper, uzi, shotgun, pistol, rocket, knife, scarh,
mk14, p90, m249, aa12, awm. Start with ak47, m4a1, uzi, shotgun, pistol, knife.
Looted-only (`ex: 1`, slot 9): sniper, rocket, scarh, mk14, p90, m249, awm, aa12.
**aa12 is airdrop-exclusive.** Snipers are real projectiles with travel and drop.

**Attachments:** reddot, x2, x3, x4, x6, x8, extmag, quick, supp, flashh, comp.
4x/6x/8x are marksman-only (scarh, mk14).

**Armour/Helmet:** `CFG.ARMOR` L1/L2/L3, `CFG.HELMET` H1/H2/H3. Helmet cuts only
the headshot bonus. *No test assertion covers the absorb maths yet.*

**Regen:** `CFG.REGEN` — 6 hp/s after 7 quiet seconds, server-side, 4 Hz.
**Scheduled for REMOVAL in Milestone 10**, replaced by consumable-gated healing.
Flag it to Rahul as a removal, not an addition.

**Match settings (v7.4):** modes ffa / t2 / t3 / t5. Kill targets 5/10/15/20/30.
Durations 5/10/15/30/60 min — **no zero option; every match can end.**

**Lobby launch (v7.4):** every connected player must press READY (solo hosts are
not special-cased). `startMatch` is refused server-side unless `allReady`. Host
presses START → `CFG.MATCH.startCountdown` (5 s) → match. A committed countdown
runs to completion; a late unready cannot grief-cancel it. `lobbyPayload`
publishes `notReady`, `allReady`, `counting` so clients recompute nothing.
**The countdown handler must be bound at connect**, not in
`bindGameplayEvents()` — it used to be, and every tick was dropped.

**Key bindings** (`public/src/core/game.js`): G frag (hold to cook), H molotov,
F flash, B smoke, V mine, R reload, X prone, Z lift, Tab scoreboard, C crouch,
Q/E lean, T push-to-talk.

**Nameplates are ALLY-ONLY.** The sprite uses `depthTest: false`; enemy tags
would be a free wallhack. Any future loot label must be depth-tested and
range-limited or it recreates the same bug.

**Voice chat:** WebRTC P2P mesh, PTT on T. **STUN-only — needs TURN credentials
from Rahul.** Two peers behind symmetric NAT cannot connect without it; no code
change fixes that. Diagnostics panel `#voice-diag`.

**Menu (v7.4/7.4.1):** layered CSS + inline SVG skyline. No WebGL, no image
files, no `filter: blur()`. All animation on transform/opacity.
`#menu-layer` is `display:none` in-match so it costs nothing while playing.

---

## 6. Milestone plan

### Milestone 9 — THE CITY DISTRICTS (IN PROGRESS — 6 of 9 done)

| District | Status | Identity |
|---|---|---|
| Railway (Sector 7 Central) | **DONE v7.6** | platforms, walkable coach, footbridge, water tower |
| Residential (Old Town Terrace) | **DONE v7.8** | interiors, back alley, terrace roof run, corner shop |
| Apartment (The Colony) | **DONE v7.8** | vertical, deck access, courtyard, water tank gantry |
| Shopping (Market Cross) | **DONE v7.8** | medium range, arcade, colonnade, fountain, market square |
| Warehouse (Irongate Depot) | **DONE v7.9** | close quarters, container lanes, dock, gantry crane |
| Construction | pending | scaffolding, cranes, unfinished structures, vertical risk |
| Industrial | pending | machinery, pipes, utility buildings, elevation changes |
| Office | pending | corridors, room-to-room |
| Container Yard (Eastgate Yard) | **DONE v8.0** | vertical stack maze, three heights, rail gantry |

Rahul's rule: the design PHILOSOPHY is consistent (street / interior / flank /
upstairs / roof layering, landmark, palette, callouts) but the COMBAT must feel
different per district. He also asked explicitly that the space BETWEEN
buildings be as interesting as the buildings — vehicles, dumpsters,
transformers, barriers, stalls, benches, playgrounds, fountains, statues,
planters, fences. All of that must reuse existing materials.

Turn the rest of Urban into recognisable districts, the way the Railway District
was done in v7.6. Per district: architecture pass, palette, landmark, interiors,
loot, roof classification.

Districts: Residential · Shopping · Warehouse · Construction · Industrial ·
Container Yard · Office · Apartment.

Acceptance: `verify-arch` broken-promises on urban → **0**; every district has a
landmark and a distinct palette; every important building has ≥2 entrances,
interior cover and a reason to enter; loot in every meaningful building; Urban
minimap rebaked **last**, after geometry settles. Draw calls stay under 95.

### Milestone 10 — SURVIVAL SYSTEMS
Backpack/inventory; bandages, med kits, painkillers; **healing only if the
player carries an item** (this REMOVES `CFG.REGEN`); loot labels on the ground
(proximity-gated, depth-tested, range-limited); elimination feedback (collapse,
better hitmarkers, kill confirmation, kill feed, natural loot drop). New
`verify-inventory` gate.

### Milestone 11 — PRESENTATION & FEEL
Human-proportioned player model (Box/Cylinder/Cone only — correct proportions,
separated limbs, real joints, gear silhouette are achievable; smooth organic
geometry is not). Always-visible diagnostic overlay (Rahul approved). Helmet
absorb assertion. Rural minimap rebake.

### Milestone 12 — RURAL PASS
Blocked: Rahul is still reviewing Rural and will supply direction.

### Banked design answers — do not re-ask
| Topic | Rahul's answer |
|---|---|
| Rooftop movement | Ziplines between rooftops |
| Environment interaction | Doors you can open, close and block |
| Tower reward | Spotting station that pings nearby enemies |
| Game modes | No new modes — polish what exists |
| Anti-cheat | Deferred ("friends only for now") |
| Tower stairs | Deleted — lifts only |
| Lift behaviour | ~2 s ride, vulnerable in the shaft |
| Roof philosophy | **Not every roof must be playable. Every roof that LOOKS climbable must be.** Decorative roofs are good for skyline variety |
| Release cadence | Fewer, larger milestones |

---

## 7. Known technical debt

| Item | Detail |
|---|---|
| **Metro City never rendered** | Built headlessly across four versions. The Rural black-screen regression is the precedent for why this matters |
| Broken-promise roofs | urban **12**, rural 7, metro 25. All in districts not yet rebuilt. Coordinates printed by `verify-arch` |
| Frame headroom | urban 85/115 draws, **56/62 shadow casters**, 72.1k/95k tris with **three districts left**. Shadow casters are by far the tightest — design remaining districts with non-casting geometry |
| Player cost is untested in a browser | Ten kitted operators = 180 draw calls on top of the map. That number has never been rendered |
| Minimaps stale | Urban and Rural do not reflect v6/v7 geometry at all |
| Two ascent failures | urban south office, north block A. Pre-existing |
| No jump gate | Ascent proves stairs. Crate-to-container hops and canopy-to-coach crossings are unverified by anything |
| Helmet absorb | No assertion covers the maths |
| Anti-cheat | Movement, ammo and fire rate are fully client-trusted. The Render URL is public. Social boundary, not a technical one. Raise once if the audience widens; don't nag |
| Voice TURN | Blocked on Rahul supplying credentials |

---

## 8. Browser verification status

Rahul browser-tests **every** deployment: replace files -> push to GitHub ->
Render deploys -> play the build -> report with screenshots. So a feature that
has shipped and been played is VERIFIED, and this document must say so. Do not
describe confirmed features as unverified.

Two rules keep this ledger honest:

1. **Verification is per FEATURE, not per version.** v7.5 was deployed and
   played, and the material optimisation was confirmed working in that same
   session that revealed a 6.2 m black slab at the crossroads. "v7.5 verified"
   would have been wrong. "Material optimisation verified, crater disc broken"
   was right.
2. **Move an item up only when Rahul confirms it**, or when the evidence is
   unambiguous (a screenshot showing it, or a bug report that proves the
   surrounding feature rendered). Never promote on a general "looks good".

### Browser verified

| Feature | Evidence |
|---|---|
| Welcome screen: backdrop, skyline, brand, buttons, stat strip | v7.4 screenshot |
| Menu grid, vignette, corner brackets | v7.4 screenshot |
| Create Room flow and CFG-driven dropdowns | reached a live match in v7.5 |
| Staging area / ready system / match launch | reached a live match in v7.5 |
| Urban builds and plays in-browser | v7.5 in-game screenshots |
| **Material optimisation (233 -> 55 draw calls)** | v7.5 in-game screenshots |
| Emissive-Lambert unlit surfaces (road markings, crosswalks, lane lines) | visible in v7.5 screenshots |
| Streetlamp halos as a single `THREE.Points` cloud | visible in v7.5 screenshots |
| Shared vehicle paint palette | distinct car colours visible in v7.5 screenshots |
| HUD: timer, kill target, live board, minimap, weapon, crosshair | v7.5 screenshots |
| Match settings propagating ("FIRST TO 15") | v7.5 screenshots |

### Pending browser verification

Shipped but not yet reported on by Rahul:

| Feature | Release |
|---|---|
| Metro City map selection end-to-end | v7.4 |
| 2v2 mode | v7.4 |
| START disabled + "waiting for N operators" reason text | v7.4 |
| 5 s launch countdown rendering on the staging screen | v7.4.1 / fixed v7.6 |
| Crater disc lying flat (the black slabs) | v7.6 |
| **Railway district** — station hall, platforms, walkable coach, canopy, footbridge, engine shed, water tower | v7.6 |
| Station gate cut into the inner city wall | v7.6 |
| Container step stacks (jump route — no gate covers jumps) | v7.7 |
| Canopy wide bays -> train roof crossings (jump route) | v7.7 |
| **Old Town Terrace** — six houses, interiors, back alley, roof run, corner shop | v7.8 |
| **The Colony** — deck-access blocks, courtyard, water tank gantry | v7.8 |
| **Market Cross** — mall arcade, shop units, colonnade, market square, service yard | v7.8 |
| Mall gate cut into the inner city wall | v7.8 |
| Terrace / colony / market loot distribution (33 new points) | v7.8 |
| Stall-crate and colonnade jump routes | v7.8 |
| **Tactical operator rig** — proportions, joints, posture | v7.9 |
| **Animation**: stride-by-distance, strafe, turning, prone transition, reload, idle breathing, 3-stage death | v7.9 |
| **Visible helmet and vest** from equipped tiers | v7.9 |
| **Irongate Depot** — container lanes, gantry crane, loading dock, north yard | v7.9 |
| Container-top step stacks (jump routes) | v7.9 |
| Depot loot distribution (9 new points) | v7.9 |
| **Eastgate Yard** — three-height stack maze, rail gantry, yard office, reefer row | v8.0 |
| Container climb chains (pallet -> 2.6 -> 5.2 -> 7.8) | v8.0 |
| **Legible minimap** — 1,100 shapes down to 198, two-weight drawing | v8.0 |
| Yard loot distribution (8 new points) | v8.0 |

### Still never rendered by anyone

| Item | Why it matters |
|---|---|
| **Metro City** | Built headlessly only, across four versions. The Rural black-screen regression is the precedent |
| Lifts on Metro's underground shafts | A failure means standing inside solid ground |
| Voice chat | Blocked on TURN credentials from Rahul |

## 9. Working agreement

- Phase large work internally and run a full gate sweep between phases. Metro
  City took 4 phases; attempting it in one pass is how v6.0 shipped broken.
- Prefer one fully-validated feature over several partial ones.
- When uncertain, **stop and document rather than guess.**
- Update `CHANGELOG.md` **and this handoff** whenever a version lands. Record
  known-incomplete items in the entry itself.
- Every zip is cumulative. Never a patch.
- Performance is a first-class requirement in every milestone, not a phase.
