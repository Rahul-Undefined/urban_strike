# Urban Strike — Changelog & Deployment Ledger

Every release ships as a cumulative zip (the full game, not a patch).
Deploy ritual: local 2-tab smoke test -> GitHub **delete-then-upload** (uploads never
remove old files) -> Render auto-deploys (`npm install` / `node server.js`, never changed).

---

## Rollback ladder (which zips are safe)

| Zip | Status |
|---|---|
| **v5.1** | CURRENT — deploy this (cumulative; scope ladder, AA-12 airdrop weapon) |
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

## v5.1 — Scope Ladder + Airdrop Weapon *(current)*

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
