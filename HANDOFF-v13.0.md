# Urban Strike — Handoff (v13.0 shipped)

Read CHANGELOG.md v13.0 first: seven asks; the intel "reversal" was a missing
line, item 3's messaging never existed, and one of my own hardenings was
falsified by the suite in the run it shipped. This file is the working
memory; the changelog is the reasoning.

**Build:** `npm install && node server.js` → http://localhost:3000
**Gates:** `for f in tools/verify-*.js; do node $f; done` then `node verify-models.js && node verify-avatar.js`
**Integration:** start the server, then `node test.js` — **235/0, exit 0**, bot phases SKIP by design (US_BOTS=1 re-arms them). Slow containers: run detached and poll the log; the suite is ~4 min wall.

## 0. THE THING THAT MATTERS MOST — NOTHING NEW HAS BEEN SEEN ON A SCREEN

v13.0 ships THIRD PERSON, a procedural SCORE, coloured/removable MARKERS and
50 m intel rings on the strength of 45 gates and 235 integration assertions —
and zero rendered frames. **Play in TPP first**: it is the largest new
surface and the only one whose failures (camera clipping, own-body pose
glitches, shoulder-offset feel) are invisible to every gate this project can
write. P toggles it.

### v13.0's own lesson

**A MISSING CHANGE-LISTENER PRESENTS AS AN INVERTED SETTING.** The intel
toggle read correctly in pushSettings, synced correctly from the server, and
did nothing — because nothing called pushSettings when it changed. The server
held the PREVIOUS choice, one interaction behind, which from the host's chair
is "No shows intel, Yes doesn't". Before hunting an inverted boolean, check
the control pushes at all. Every new lobby control needs its listener line
(ui.js ~1093) — the cache, the sync and the payload are NOT enough.

### And the one paid for by the suite, same run

**HIDDEN IS NOT WITHDRAWN.** t10 is hidden on purpose — an unlisted capacity
mode the server must keep seating. My "refuse every hidden mode" hardening
hung phase 10 at the rename wait ([0 vs 0] teams was the tell: the room had
fallen to ffa). The guard is narrowed to hidden-AND-bot-fielding and the
comment records the falsification. When a hardening breaks a test, first ask
which of you is wrong about the design.

## 1. OPEN — nothing verified by play, in risk order

1. **TPP, EVERYWHERE.** Toggle P. Walk, sprint, crouch, prone, lean, reload,
   swap weapons, climb stairs, hug walls (the boom should pull in, never
   clip), fight in doorways, ADS (over-shoulder), scope (must SNAP to first
   person), die (body should vanish with the step, camera back to FPP flow on
   respawn — check!). Watch the own-body stride against strafing: the
   derivation mirrors remotes, but nobody has SEEN it.
2. **MARKERS, WITH HANDS.** Team mode, M, left-click place, left-click move,
   right-click remove; a team-mate's screen shows your pin in YOUR colour
   with your callsign; an opponent's never does. Known accepted gaps: the
   instant local pin renders in the default gold until the server echo lands
   (~RTT) because Net.getMe does not exist to read own colour; the DIAL
   (small minimap) pins still render gold, only the full map wears placer
   colours. Both one-line-ish if they grate.
3. **AUDIO LEVELS ARE A TASTE CALL MADE BLIND.** The menu cue and both beds
   were mixed against documented ceilings (0.09 bed, 0.11 cue, 0.12 hard
   line), never against ears. Confirm gunshots/footsteps/comms sit clearly
   above the bed; confirm the cue reads "tactical" not "casino". First sound
   arrives on first click — that is autoplay policy, not a bug.
4. **50 M INTEL RINGS, ON THE EYE.** Host YES → M shows quarter-map-scale
   dashed rings that FEEL like "somewhere over there"; overlapping rings
   stay readable (fill was lightened for exactly this). Host NO → nothing.
   The lag bug is fixed but only a hand on the toggle proves the feel.
5. **BOT ABSENCE.** Picker shows exactly ffa/team/squads/last; no bot rows in
   the lobby; a raw createRoom asking mode:'bots' lands in the default mode
   (phase 15 proves the server; eyes should confirm the UI).
6. Everything still open from v12's list that survives: the field
   black-screen trigger (sentinel armed, census reporting), reconnect's
   three doors under bad wifi, Killhouse angled walls, F3 p90.

## 1b. NOT DONE / FOUND-NOT-FIXED / HONEST GAPS

- **TPP muzzle flash and tracers still originate at the camera**, not the
  own-rig's gun. Subtle at the boom distance; attaching FX to the rig gun is
  the follow-up if it reads wrong in play.
- **Dead players cannot mark** (server rule predates v13, kept deliberately);
  PUBG-style spectator pings would need an explicit product call.
- **Phase 16 flake confidence is n=2** (mid-build and final runs, both
  green); its waits are generous but the three-socket team-deal read is new
  machinery.
- **The v12 suite count 275 is now 235 BY DESIGN** (bot phases skip). An
  armed run (US_BOTS=1 for server AND suite) was NOT executed this release —
  the engine is covered by verify-bots' 260 assertions with the switch
  re-armed for its own process, but the integration phases 11/12/14 have not
  run against a v13 server. Run one armed pass before any release that
  re-arms bots.
- **verify-client counts 62 (was 64)**: two conditional assertions keyed to
  bot-visible UI dropped out with the switch, same as the v10.9→v12
  direction. The gate self-adjusts; the drift is expected, not decay.
- cyl() cast:false, rural bridge stairs, per-map builder loading: unchanged.
- **Kill stray servers by /proc argv scan (`node server.js` exact), never
  `pkill -f`; check the new server log head for EADDRINUSE before trusting
  any run** — a zombie absorbed a full v12 pass once already.

---

## 2. FIXED IN v13.0 — see CHANGELOG for full reasoning

One-line index: bots switched off (third flip; env-read form restored;
verify-bots reshaped to assert switch-consistency in EITHER state with one
pinned default line); hidden BOT modes refused at create/updateSettings
(narrowed after t10 falsified the generic version); intel change-listener
added (the whole "reversal"); intel rescaled to a 50 m promise derived from
CFG.MATCH.INTEL by all three consumers, true by construction (ceiling =
radius − 5), floor raised to 10 m, OFF-room integration proof added; item 3
verified-absent (no such messaging exists); THIRD PERSON added — pure-math
collision-clamped boom (tppcam.js, gate-tested), own body driven on the
remote pose contract, P toggle persisted, scoped ADS stays FPP, viewmodel
flag inside the every-frame visibility line; procedural score (menu cue +
menu/game beds, 0.12 ceiling, autoplay-policy-honouring pendingMusic);
markers grown up (placer colour, right-click remove with server-stamped id,
self-duplicate 'self'-key bug fixed, manual rows) with phase 16 proving
sync/attribution/foe-isolation/move/remove end to end. Below this line the
v12.0 index is retained for history.

One-line index: per-map lighting override was dead (builtMap null at read;
now a parameter, gated by verify-lighting); light-loss sentinel with census
reporting + relight repair; WebGL-refused diagnostic panel; compass/clock in
one flex stack (overlap unrepresentable); both scoreboards grouped and
ranked by team score; bots re-armed by the documented one-line switch, with
weapon switching, looting, cover dashes, medkit seeking and loot-economy
drones; the v10 drone ban in bot modes reversed IN WRITING both in server.js
and in test phase 14; every bot mode mapLock'd to Urban with the coercion
running LAST; 15 minutes the only duration; avatar +5% with hit geometry
following and the movement capsule pinned (verify-doorfit); host intel
toggle with a 3-15 m blur contract (verify-intel + end-to-end band in phase
15). Below this line the v11.0 index is retained for history.

One-line index: reconnect (two root bugs + recovery + reclaim + 180 s hold);
adaptive tick-clocked interpolator (freeze/jitter/teleport cluster, four
causes); Killhouse mirrored-chain sign fix + makeover + 63-assertion collision
gate; mine restock reaching the HUD; teams structurally frozen at match start;
menu/lobby merge with operator hero, compass, death distance, stacked damage
arcs; camera-NaN + zero-draw watchdogs; integration suite green (209/0).
Below this line the v10.9 index is retained for history.

| item | real cause |
|---|---|
| players dropping one at a time in long matches | avatars.js minted `new BoxGeometry` per weapon switch and per join and **never called dispose** — 7,983 live geometries in a simulated 60-min match, now 46 |
| loot list growing with match length | collected airdrop items parked at `respawnAt: Infinity`, never retired. +144 dead entries over 60 min |
| modes that could not fill | 10v10 and Squads 10×2 needed 20 seats against a 15 cap |
| bots | switched off at one flag, `BOTS_ENABLED` |
| Kar98 unobtainable | full weapon, viewmodel and bot kit, **no LOOT_ITEMS entry** — bots could shoot it at you forever |
| FAMAS / AKM unusable | recoil 0.015 / 0.016 against a band topping out at 0.012 |
| `verify-pitch` never ran anywhere | hardcoded container path |

---

## 2b. RUN A REAL MATCH — tools/soak.js

    node tools/soak.js [players] [seconds] [map]
    node tools/soak.js 8 240 urban

Spawns the real server, connects real socket.io clients over websocket, starts
a match and drives movement at 20 Hz. Reports snapshot arrival gaps, keyframe
cadence, entities per packet and server RSS over time.

**Use it before theorising about the network.** At 8 players over 4 minutes it
measured p50 66 / p90 67 ms with no drift and no memory growth, which is what
ruled the server out of the freeze-and-teleport hunt.

The transport line matters: socket.io defaults to long-polling first, and that
is what appears blocked. Force `transports: ['websocket']`.

## 3. Verification

The full board, v13.0 — 45 gates, three documented pre-existing reds:

    for f in tools/verify-*.js; do node "$f"; done
    node verify-models.js        # 226/0
    node verify-avatar.js        # 35/0
    node server.js &             # then:
    node test.js                 # 235 passed, 0 failed, exit 0 (bot phases SKIP)

Expected reds, unchanged and documented in their files: verify-climb 1/2,
verify-arch 4/2, verify-access 55/1.

New in v13.0: verify-tpp 19/0 (the boom math AS THE GAME'S OWN MODULE —
forward convention against hand-computed angles, wall clamp, margin window,
floor, adapter tolerance — plus the wiring seams as source asserts),
verify-audio 13/0 (state calls at all three sites, the 0.12 ceiling, the
pendingMusic gesture parking, the ramp-out). Rewritten at the product:
verify-intel 11/0 (50 m contract, inside-the-drawn-circle promise, CFG
unity, honest 0.11 rounding tolerance with the measured 9.94 worst case in
the comment); verify-bots 260/0 (switch-consistency in either state, one
pinned default line). test.js: phase 15 covers both switch states in one
body (hidden-mode refusal when off, the urban-lock dance when armed), the
8..60 band, and a from-scratch intel-OFF room asserting zero emissions;
phase 16 is new (markers end to end, sides read from the dealt roster).

Armed runs: US_BOTS=1 in the environment of BOTH server and suite re-arms
phases 11/12/14. Not executed this release — see §1b.

On slow containers the suite exceeds per-command wall limits: run
`(setsid node test.js > /tmp/run.log 2>&1 &)` and poll the log.

## 4. How this project fails

1. **A green gate that never looked.** Metro shipped 19.2% dead ground while
   everything passed, because `verify-cover` only ran on Urban.
2. **A gate pinning an implementation, not a rule.** Three more in v10.9:
   `verify-client` asserted every mode was selectable, `verify-drone` asserted
   Overrun *is* a bot mode, `verify-bots` asked a disabled system to spawn. All
   three were testing the old STATE. Read the gate, fix it to test the
   invariant, say so in a comment. **Never weaken it to go green.**
3. **A shared helper edited for one caller.** `World.BOUND` set for Urban cost
   Rural two thirds of its loot.
4. **Numbers typed instead of measured.** Use `tools/gen-points.js`.
5. **A trimmed dependency.** A stub that cannot see voids whole categories of
   assertion. Use `tools/_three-stub.js` for anything reading geometry.
6. **Fixing one defect by creating another.** v9.14 bounded a stair and orphaned
   the roof; v9.15 built a pier over water to catch it.
7. **Fixing the wrong instance.** Confirm you are looking at the thing in the
   screenshot.
8. **A budget that does not name its exception.** Budgets are named allowlists
   and fail in both directions. **Still outstanding:** `verify-props`
   (`EMBED_BUDGET 133`, `FLOAT_BUDGET 15`), `verify-batch`
   (`nonWhitelisted <= 2`) and `verify-cover`'s per-map `DEAD_BUDGET` are still
   bare numbers.
9. **Measuring the mean and stopping.** `tools/prof-bots.js` reports percentiles.
10. **A gate with a hardcoded path.** New in v10.9 — see §0.

---

## 5. Architecture

```
server.js                 rooms, match loop, snapshots, socket handlers
server/lib/{rooms,combat,loot,mines,bots,drones}.js       [bots.js RETAINED, switched off]
public/src/networking/snapcodec.js    THE WIRE FORMAT — server, browser, tests
public/src/networking/avatars.js      remote bodies — SHARED GEOMETRY, see v10.9
public/src/config/        weapons, gameplay, loot, world, maps-*, districts
public/src/environment/   world.js + districts-{south,north,outer}.js,
                          rural.js, metro.js, access.js, deco.js
public/src/weapons/       system.js (fire/reload/grants), viewmodels.js
public/src/ui/            ui.js, minimap.js, devhud.js  [F3 = FPS + p50/p90/max]
tools/verify-*.js         34 gates
tools/_three-stub.js      THREE stub WITH geometry.parameters
tools/gen-points.js       spawn/loot generator — USE IT, never type coordinates
tools/prof-bots.js  prof-rays.js  prof-snap.js  diag-jitter.js  audit-sightlines.js
```

- **`CFG.WEAPON_ORDER` is the wire format.** Append only. To retire a weapon,
  set `retired:1` on its LOOT_ITEMS entry — never remove the ORDER entry.
- **`pos[1]` is the capsule CENTRE, not the feet.**
- **A model carries its own type** (`userData.wtype`).
- **`CFG.BOTS_ENABLED` is the bot switch.** False ships. `US_BOTS=1` re-enables
  it, which is how verify-bots and verify-drone test the retained engine.
- **`server/lib/nuke.js` is the killhouse killstreak.** Server-authoritative.
  It rides combat.js's existing `streak` counter — do not add a second one.
  Tuning is five named constants at the top of that file.
- **`p.visor` is per LIFE, cleared in spawnPlayer.** `p.drones` is per MATCH,
  cleared in the match-start block. The two live a few lines apart and mean
  different things.
- **`CFG.MAPS[map].smallMap` carries the small-map rule set** — 8 players, nuke
  killstreak, visor in the crate pool. A third small map inherits all of it by
  setting one flag. Do NOT guard on a map name.
- **`public/src/ui/showcase.js` owns a SECOND WebGLRenderer.** It must stay
  wrapped at every entry point and must be stopped before any map build.
- ~~`CFG.MODES[m].outbreak`~~ REMOVED in v10.14 — see below. `lives: 1` reuses Last
  Stand's spectate path. A zombie is a bot-shaped record in `room.players` —
  it snapshots, renders, takes damage and dies through the existing paths.
  **Do not write a second AI.**
- **`hidden: true` on a mode** removes it from the picker without removing it
  from the table. Categories with no visible modes are dropped automatically.

---

## 6. Rules this project pays for when broken

- A limit is not a target. `MOVE.step` is 0.42; stair rises target 0.24–0.34.
- Stair run must exceed the 0.35 m player radius.
- A landing goes beside or beyond a flight, never above it.
- A switchback must turn in a *second lane*.
- **Ratchets fall, never rise.** And they must name what they excuse.
- Anything mounted on top of a viewmodel grows into the sight line.
- Paint needs a real offset — 6 mm is inside the z-fight tolerance.
- A rotated box collides through its AABB, which is not its shape.
- **Nothing allocates per collider in a per-frame loop.**
- **A spatial query goes through the grid, not the whole array.**
- **A gate must test code, not its own comments.**
- **A gate must not carry an absolute path** (v10.9).
- **Never send what the snapshot already carries.**
- **PRESS F3.** Read p90, not the average.
- **Positional audio is capped at 70 m and uses `equalpower`, not `HRTF`.**
- **A remote EVENT costs client main-thread time, and no server meter sees it.**
- **`scene.remove()` DOES NOT FREE GPU MEMORY** (v10.9). three.js requires an
  explicit `dispose()`. Better still, share immutable geometry so there is
  nothing to free. And **never** write a generic dispose-everything walk over a
  scene that shares materials — it turns every other object black.
- **A COLLIDER MUST NOT HAVE A NEGATIVE EXTENT** (v10.11). `seg()` does not
  sort its arguments. Any mirrored call that computes x from a sign must
  normalise — see `segx()` in killhouse.js. Gated in verify-collision.
- **AN ITEM MARKED `drop: 1` MUST BE IN AN AIRDROP POOL** (v10.11). Twice in two
  versions: Kar98, then the visor. Marking it drop-only and adding it to a pool
  are two separate edits and verify-models is the only thing joining them.
- **DO NOT MUTATE A SHARED AVATAR MATERIAL** (v10.11). They are shared across
  every player since v10.9. Per-player visual state is a separate mesh.
- **NO WORLD-SIZED CHILD MAY HANG OFF THE RIG-SCALED AVATAR GROUP** (v10.12).
  It carries scale (1.52, 1.301, 1.52) and rotates ~83 degrees prone. Overlays
  go under `tagHolder`, which inverts both. Gated in verify-avatar.
- **NO NUMBER ON THE WELCOME SCREEN MAY BE A LITERAL** (v10.12). Four were, two
  were wrong. Gated in verify-menu.
- **NO SCRIPT TAG MAY APPEAR TWICE** (v10.12). Gated in verify-menu.
- **THE MINIMAP READS `CFG.MAPS[map].bound`** (v10.13), the same number the
  out-of-bounds ring uses. Never hardcode a world size.
- **CHECK THE KEYBIND TABLE BEFORE BINDING** (v10.13). Free letters: I, J, K,
  L, O, P. Gated in verify-models.
- **INTERPOLATION BUFFER: `interpDelay` MUST STAY ABOVE ~2.5 TICKS** (v10.15).
  At 1.80 ticks the client froze remote bodies on stale positions, which also
  made them unshootable. Gated in verify-interp.
- **EVERY SPAWN TABLE MUST CARRY TEAM TAGS** (v10.15). An untagged table falls
  back to the full set and team spawns silently stop working.
- **EVERY PER-FRAME CALL GOES INSIDE `step()`** (v10.16). The loop reschedules
  first, so an unguarded throw does not crash — it silently skips the render,
  forever. Gated in verify-bindings.
- **SNAPSHOT DELTAS ARE VOLATILE; KEYFRAMES ARE RELIABLE** (v10.17). Both
  halves are required. Volatile is safe ONLY because every field is sent
  absolute — if encodeEntity is ever changed to send a difference from `prev`,
  volatile becomes a corruption bug. Gated in verify-interp.
- **A COSMETIC PROP MUST BE PLACED FROM MEASURED GEOMETRY** (v10.19), or not
  shipped. Typed facade coordinates put 379 panels in the sky. If a decoration
  cannot be placed against something that provably exists, cut it.
- **`CFG.isArena(map)` IS THE RULE SET** (v10.21) — nuke killstreak, 1 s spawn
  protection, crate visor. `smallMap` is a size classifier and implies it.
  Never key a rule on `smallMap` alone, and never on a map name.
- **AN ANGLED WALL NEEDS A COLLIDER CHAIN** (v10.22). A rotated box collides
  through its AABB — a 10 m wall at 0.52 rad blocks 8.8 x 5.2 m. Emit the
  visual rotated with collide:false and step short axis-aligned colliders along
  the centreline.
- **MATCH SETTINGS ARE WRITTEN ONCE, ON THE CREATE SCREEN** (v10.22). The
  staging panel reports and cannot emit. Do not give it controls again.
- **EVERY MODE IS UNLIMITED KILLS** (v10.22). killTarget is always 0.
- **A CLIENT-SIDE MIRROR MUST BE REFRESHED ON RESPAWN** (v10.22), not only
  initialised. `spawn` carries mines and visor for this reason.
- **NEVER cache assets by name.** Only safe with a build hash in every URL.
- **Never hand-revert a file.** Restore from the archive verbatim.
- **`powerPreference` must be set on the WebGL context.**
- **Check the field you are reading actually exists, AND what type it is.**
  `muzzleZ`, `SPAWNS[1]`, `r.wp`, `team` as a string — and in v10.9, `process`
  in a file the browser also loads. Five times now; the most repeated mistake
  in the project.

---

### Added by v11.0 — paid for this release

- **Every socket re-key sets `socket.data.roomCode`.** Both re-key paths
  (token rejoin, reclaimSeat) do. Miss it and the player is a ghost who
  receives everything and can send nothing — sixteen versions of exactly that.
- **rotY places geometry along (cos, −sin). Steppers must match the placer.**
  The Killhouse phantom walls were one `+sin`. verify-collision now drives
  both faces of every angled row, so the next flip fails loudly.
- **`CFG.NET.interpDelay` is a FLOOR, not a value.** The adaptive delay may
  only ever ADD buffer. verify-interp asserts the clamp; do not "optimise" it
  back to a constant, and do not let anything render closer to the present.
- **Extrapolation stays banned; smoothing must reset on every genuine snap.**
  A follow that glides through a teleport recreates the unshootable body at
  the visual layer. The reset lines are gate-asserted.
- **A lifecycle hook needs a caller AND an implementation, greppable, same
  release.** `Game.onRejoin` shipped as a guarded call to nothing for sixteen
  versions.
- **Tests gate on feature switches and derive from CFG; never pin a content
  count.** A permanently red suite teaches people that red means nothing —
  that is how 27 assertions rotted unread.
- **The lobby config column is the ONLY settings writer.** The v10.22
  "written once on the create screen" rule is superseded: there is no create
  screen. Do not add a second writer; the two-sources-of-truth fault is
  currently unrepresentable and should stay that way.

### Added by v13.0 — paid for this release

- **Every new lobby config control needs FOUR things**: the element cache,
  the updateLobby sync, the pushSettings read, AND the change-listener line
  (ui.js ~1093). Missing the fourth presents as an inverted setting.
- **verify-bots asserts consistency with the switch, not a state.** Exactly
  one line pins the shipped default; a flip edits that line and
  world.config.js line ~78, nothing else. Do not rewrite the block again.
- **`hidden` on a mode means "not offered", not "not seatable" — EXCEPT for
  bot modes**, where the v13 guard makes it both. t10 must stay creatable;
  the guard predicate is hidden && (vsBots || practice). Widening it back to
  all-hidden re-breaks phase 10 exactly as documented at the guard.
- **CFG.MATCH.INTEL is the only place intel numbers live.** Server band,
  drawn circle and gate all derive from it; the gate asserts unity. Editing
  intel.js constants directly re-splits the promise from the error.
- **The TPP boom is pure math in tppcam.js** — change camera feel THERE, and
  verify-tpp pins the convention (forward vector, shoulder side, clamp,
  margin window, floor). game.js only adapts World.rayHit and applies the
  result. The viewmodel's firstPerson flag must stay INSIDE the every-frame
  rig.visible line.
- **The own-body rig is fed the remote pose contract** (net.js updateRemotes
  is the reference implementation — -yaw+PI, stride from displacement
  rotated into body frame). If remote animation changes shape, the ownbody
  step in game.js changes with it, or first person and third disagree.
- **Music states are 'menu' | 'game' | null through AudioSys.music() only.**
  MUSIC_VOL ceiling is 0.12 and verify-audio pins it; new cues route through
  musicG so mStop()'s ramp-out kills them poplessly. Never start an
  oscillator outside musicNodes/musicTimers bookkeeping.
- **Marker payload ids are stamped server-side, never read from the client**
  — that single line is why a modified client cannot delete or forge
  another player's pin. Keep it that way when extending the payload.

### Added by v12.0 — paid for this release

- **lighting() takes the map as a PARAMETER. Never read World.builtMap (or
  any build-mutated state) mid-build** — it is null by construction at that
  moment. verify-lighting fails the sequence if a map loses its own sky.
- **Every light the builder adds goes through the registry** (lights.push in
  lighting(), World.registerLight elsewhere). The sentinel's contract is
  registry == graph census; an unregistered light breaks the equality and
  verify-lighting catches it at build time.
- **The mapLock coercion in updateSettings runs LAST**, after every payload
  field has landed. Moving it up recreates the bug phase 15 exists to catch.
  Same rule generalises: a guard above the assignment it polices is
  decoration.
- **Avatar size is THREE numbers** — RIG (visuals), HEAD_HALF/ray-box (hit),
  CFG.PLAYER.radius+heights (movement). They move independently and
  verify-doorfit + verify-hitbox pin the pairings. Never grow the movement
  capsule to "match" the render.
- **Bot equipment obeys the human economy.** Drone stock is looted, never
  granted; grants land through Loot.tryCollect and Drones.launch, the same
  paths humans use. A bot-only resource path is how the v8.38 leak class
  returns.
- **The intel blur band (3-15 m, 14 m cells, 5 s wander) is a CONTRACT**,
  not tuning. verify-intel asserts it pure; phase 15 asserts it end-to-end.
  Tightening MIN_ERR is how the feature becomes a wallhack politely.
- **Kill stray servers by /proc argv scan for exactly `node server.js`;
  never `pkill -f`** (it matches your own wrapper and kills it). Check the
  new server's log for EADDRINUSE before trusting any test run against it.

## 7. Maps and budgets

| | Urban | Metro | Rural |
|---|---|---|---|
| colliders | 3,332 | 1,564 | 1,066 |
| draw calls | **98 / 115** | 41 / 45 | 32 |
| triangles | 92,092 / 120,000 | 25,708 / 26,000 | 54,467 |
| shadow casters | **62 / 62** | 20 / 22 | 22 / 26 |
| spawns / loot | 44 / 364 | 46 / 246 | 50 / 164 |

**Urban has ZERO caster headroom.** Every new geometry goes `cast: false`.

**Urban's south-west has a real building at x[−60,−46] z[48,86].** Built into
three times. `verify-pitch` guards the stadium side; the building has no gate.

## 7b. DO NOT REDO THE BANDWIDTH WORK.

Render billed 5.8 GB, v10.2–v10.4 attacked it, **all of it is reverted** and
Rahul pays for bandwidth instead. **socket.io does not send a binary event as
one frame** — a JSON envelope with a `_placeholder`, then the attachment as a
separate frame, held until it lands. The payload got 54% smaller and the stream
got worse. If bandwidth is ever revisited: measure **ARRIVAL JITTER**
(`tools/diag-jitter.js`), not payload size.

## 7c. THE INTERPOLATION BUFFER — SUPERSEDED IN v11.0, FLOOR RETAINED

v11.0 replaced the fixed-delay interpolator with a tick-clocked, adaptively
delayed one (net.js, long comments at `sampleTimeFor` and `updateRemotes`;
CHANGELOG §3). Everything below remains true AS THE FLOOR: 190 ms is the
minimum the adaptive delay may ever use, and verify-interp asserts the clamp.
Original reasoning kept for the numbers:

```
snapRate 15  -> a tick every 66.7 ms
interpDelay 120 ms -> 1.80 ticks -> 53 ms of jitter headroom
```

Past that, `f` clamps at 1.15, the avatar stops, and the 4 m plausibility check
refuses your hits. If stutter persists after v10.9, the cheapest experiment is
raising `CFG.NET.interpDelay` **alone**. Do not reach for extrapolation.

## 8. Networking

Delta snapshots since v9.8. Format lives **only** in `snapcodec.js`.
Keyframes on match start, join, every 60 ticks. A move over 2.5 m in one tick is
snapped, not interpolated. `snapRate` 15 should stay. **Loot does NOT
auto-pick** — interact key since v10.5. **No permessage-deflate.** The snapshot
buffer must OWN its memory (`Buffer.allocUnsafe` hands out a pooled view).
Nothing is culled by distance.

---

## 9. Longer-term open items

1. `verify-climb` urban 16 / rural 7 — The Colony and Old Town Terrace next.
2. `verify-arch` urban 21 / rural 18 broken promises.
3. **Metro sniper fog — measured in v10.1, not acted on.** Real longest clear
   lines: Metro 196.3 m at **89% obscured**, Urban 175.8 m at 39%, **Rural
   301.0 m at 77%**. The surprise is Rural: 161 clear lines over 150 m against
   Metro's 12, on daylight fog, and nobody has looked at it.
4. **Bots don't use lifts** — dormant while bots are off, live again the moment
   they return. Urban has 21 lifts; 7 downward stops and the tower roofs are
   territory a bot will never contest.
5. The spectator camera, ping wheel and reconnect toast have **never been seen
   on screen** — shipped in v9.11, verified only headlessly.
6. **Client frame cost has never been measured.** F3 exists. Use it.
7. **Three bare numeric budgets remain** — see §4.8.
8. `server/lib/bots.js` collider scans still have no broadphase equivalent and
   were never measured.

---

## 10. Working style that has worked

- **Measure before proposing.** The v10.9 recoil pass started by reading the
  roster and found the requested gun already existed.
- **One change, then run the gate.**
- **Test two theories before believing one.**
- **Measure distributions, not means.**
- **Write the reason in the code, not the chat.**
- **Say what is not done.** §1b exists for this reason.

---

## 11. KILLHOUSE — rebuilt v10.20 to Rahul's plan

PORTRAIT, 40 x 68 m. A CQB shoot-house: partition maze, checkered inspection
floor, target silhouettes, observation catwalk. Humans only, 10 players.

    public/src/environment/killhouse.js    30-row PLAN table at the head
    CFG.MAPS.killhouse                     bound 38, maxPlayers 10, smallMap

    draws 22/45 - tris 7,192/26,000 - casters 10/22 - colliders 184
    dead ground 0.1% - floaters 0 - escapes 0 - worst uncovered 7 m

**THE PLAN IS A TABLE.** `[x, z, len, rot, kind]`, one row per wall, numbered.
Edit a row, not the builder. It is a transcription of a drawing, so it must
stay correctable by pointing at a number.

**IT IS NOT MIRRORED** — the only small map that is not, because his plan is
asymmetric. Spawns sit at the two short ends, 58 m apart. If a side plays
stronger, move spawns; do not mirror the map.

No stairs. Blocks are climbed by a 0.31 m crate chain.


## 12. SUNSET ROW — shipped v10.12

Two houses facing each other across a street. 64 x 40 m, humans only.

    public/src/config/maps-sunsetrow.config.js    loot / spawns / airdrops
    public/src/environment/sunsetrow.js            geometry, segx(), KEEP_CLEAR
    CFG.MAPS.sunsetrow                             bound 34, maxPlayers 8, smallMap

    draws 39/45 · tris 5,112/26,000 · casters 17/22 · colliders 182
    dead ground 0.1% · floaters 0 · escapes 0 · worst uncovered 7.1 m

**The shape is the point.** Killhouse is cover-in-lanes. This is
rooms-and-a-street: the houses are enterable volumes at the ends, so a life
offers three real plays — hold a house and shoot from a window, push the street
behind the bus, or flank a side yard. A second three-lane box would have given
two maps that play the same and one of them would stop being chosen.

**No stairs, no climbable roofs.** Same call as killhouse.

**Same rule set as killhouse, carried by the `smallMap` flag** — 8 players,
nuke killstreak, recon visor in the crate pool, no sniper or RPG on the floor.

Spawns sit behind each house so a building stands between you and the map at
the moment you appear. On a map this size that is the difference between a
spawn and a shooting gallery.

## 13. THE WELCOME SCREEN — v10.12, REBUILT v11.0

v11.0 rebuilt the menu (hero layout, deploy sheet, merged lobby — CHANGELOG
§7). The v10.12 principles below still govern: compositor-only backdrop, the
second WebGL context lives ONLY while the menu is up, every entry point
wrapped, fail-safe collapses the panel. The operator hero adds one rule: rig
faults degrade to the weapon-only reel via `killOperator()`, never to a dead
menu. Original v10.12 notes:

    public/src/ui/showcase.js     live weapon hero, pointer parallax
    public/css/style.css          logo lockup, colour identity (see the v10.12 block)

Four things, taken from the CoD Mobile reference with its art budget removed:
a hero 3D asset, a logo rather than type, one loud accent, and motion that
answers the player.

**The showcase owns a second WebGLRenderer.** Every entry point is wrapped and
failure collapses the panel to zero height. That containment matters more than
the feature: a menu that throws makes every unplayed change behind it
untestable. `stop()` drops the context via WEBGL_lose_context before any map
build, so a match never runs with two renderers alive.

**Every number on this screen is computed from CFG.** Four were literals, two
were wrong. verify-menu asserts they are COMPUTED, not that they read correctly
today — a literal that happens to be right is exactly what goes stale.

### Not done here
- **No menu music.** Rahul asked. Nothing was added: shipping an unmuteable
  loop is worse than silence, and there is no audio asset pipeline. If it is
  wanted, it needs a mute control and a stored preference first.
- **No weapon skins.** The models are procedural boxes with shared materials;
  a skin system means per-weapon materials, which is a draw-call cost that
  should be measured before it is spent.



---

## 14. OUTBREAK — BUILT IN v10.13, REMOVED IN v10.14

It shipped having never been run and it did not work: the zombies stood still
holding rifles and could not be killed.

**The wave logic was not the problem.** It was gate-covered and correct. The
problem was that a zombie was a bot-shaped record in `room.players` and nothing
told the client it was a zombie. The snapshot carries position, yaw, weapon
index and health — there is no field for "this one is dead". Every client built
an ordinary operator, gave it the default AK and rendered the idle pose.

**To build it again properly, the wire format has to carry an actor kind.**
That is `snapcodec.js`, which is append-only and shared by server, browser and
test.js. It is a real piece of design. Do it deliberately, in its own build,
and read the v10.13 changelog entry first — the difficulty curve, the tier
schedule and the reasoning about zombie speed versus sprint are all still
sound and worth reusing.

## 15. THE FIVE SMALL MAPS

    killhouse    58 x 34   indoor box, three parallel lanes
    sunsetrow    64 x 40   two enterable houses either end of a street
    freightyard  38 x 38   FOUR-WAY ROTATIONAL, no lanes and no ends
    bazaar       54 x 40   winding alleys, almost no straight sightline
    substation   46 x 46   ring around a sunken pit you cannot cross

Each is a different SHAPE on purpose. A sixth should be too — the roster does
not need another box with crates in it. What it still lacks: **verticality**,
which every one of these avoids because verify-climb is red on 21 flights. A
small map with a real second storey is the obvious next one, and it should wait
until stairs are trusted.

All five carry `smallMap`: 8 players, nuke killstreak, crate-only visor, no
sniper or RPG on the floor.


---

## 16. THE MEDIUM TIER — shipped v10.21

    public/src/config/maps-medium.config.js
    public/src/environment/medium.js        shared kit + both builders
    CFG.MAPS.riverside   bound 66, maxPlayers 12, arena
    CFG.MAPS.airfield    bound 70, maxPlayers 12, arena

    riverside  120 x 88   189 colliders  25 draws  5,696 tris  0.2% dead
    airfield   128 x 96   126 colliders  25 draws  4,188 tris  0.2% dead

Built because the roster was bimodal — arenas under 70 m and theatres at 200 m,
with nothing between, so half the armoury was situational everywhere.

**They carry the arena RULES and not the arena WEAPON RESTRICTION.** Snipers and
rockets spawn here; at 120 m the restriction would remove the weapon the tier
exists to justify.

Cover budget 0.06, not 0.02. Airfield's apron is meant to be bare.

**Open:** escape budget 8 on both, matching urban and metro. The gate's own note
says "walkable ground ends without a boundary wall - map defect, not resolver".
Worth chasing on all four maps together rather than special-casing these two.
