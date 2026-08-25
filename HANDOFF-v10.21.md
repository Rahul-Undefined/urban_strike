# Urban Strike — Handoff (v10.21 shipped)

Upload this file plus `urban-strike-v10.21.zip` into a new chat.

> **RELEASING? BUMP `version` IN package.json.** Every local asset URL is
> stamped `?v=<version>` at startup. Forget the bump and a cached client runs
> the previous build's JavaScript against the new server — that failure renders
> nothing and logs nothing. Check with `curl -s <host>/ | grep -c '?v='`
> (expect 38) and `curl -s <host>/version`. v10.21.0 verified on both.

**Read §0 first.**

---

## 0. THE THING THAT MATTERS MOST — STILL TRUE, NOW WORSE

**Nothing in v10.9 has been seen on a screen.** Five behaviour changes shipped
against a green board and zero rendered frames. One of them changes what every
remote player's body is made of.

**Play a match before you believe anything.** Two maps, 45 minutes, F3 open.
Read **p90, not the average**.

`ffmpeg -i clip.mp4 -vf "fps=1/3,scale=760:-1" -q:v 4 out_%02d.jpg`

### v10.21's own lesson

**A flag named after one of its two meanings will eventually be asked to do
only the other.** `smallMap` meant both "this map is small" and "this map uses
the arena rules" — identical statements until a MEDIUM map wanted the rules
without the size. Split into `arena` (the rule set) and `smallMap` (the size),
with the latter implying the former.

Two gates went red on the split, correctly: they were pinned to the old
concept. A gate that stays green through a concept change was not testing the
concept.

### v10.20's own lesson

**When a map is a transcription of somebody else's drawing, make the layout a
readable table.** Killhouse's thirty walls are numbered rows at the head of
killhouse.js. Rahul can say "row 12 is too far left" and it is a one-line
change. Buried in a hundred hand-written box() calls the same correction would
be a rebuild.

And: the original Killhouse was off-brief, not merely different. A killhouse is
a CQB TRAINING FACILITY. Reading the name properly would have produced his
layout without him having to draw it.

### v10.19's own lesson

**NEVER ROUTE AROUND A GATE THAT IS TELLING YOU THE TRUTH.** v10.12 emitted
lit windows through box(); verify-props reported 135 unsupported props. I moved
them to still(), which bypasses the prop registry, and called it fixed. Six
versions later Rahul saw 379 of those 444 panels floating in his sky.

The gate was right, the placement was wrong, and making the gate blind is not a
fix. In the SAME pass I cut the roof kits for exactly this reason — so the
judgement was available and I did not apply it twice.

### v10.18's own lesson

**CHECK THE LIMIT BEFORE DESIGNING AROUND IT.** Every version since v10.9 said
"test.js NOT RUN — the sandbox blocks the socket transport". That came from one
early attempt returning `xhr poll error`. socket.io tries HTTP long-polling
first; polling was blocked, websocket was not. `transports: ['websocket']`
connects instantly and always would have.

Eighteen versions of "I cannot test this" rested on not re-reading one error
message. `tools/soak.js` now runs a real match headlessly — real server, real
sockets, real clients — and it proved the server and the network are clean,
which is something no amount of reading code could establish.

### v10.17's own lesson

**"After a certain time" is a diagnosis, not a detail.** v10.15 read the
freeze-and-teleport as network jitter and widened the interpolation buffer. It
did nothing, because jitter is not time-correlated and the report said plainly
that the fault grew with match length. The thing that grew was the socket send
queue: snapshots were emitted unconditionally at 15 Hz, and a client that could
not keep up had them QUEUED, not dropped.

**When a symptom is time-correlated, find what accumulates.** Everything else —
the codec, the keyframes, the buffer, the build — was verified sound first, and
that verification is what left the queue as the only candidate.

And: F3 now has a network panel, because guessing twice is not a strategy.

### v10.16's own lesson

**A guard that covers "every subsystem" must be checked, not assumed.** v8.31
put each subsystem in its own `step()` so one fault could not skip
`renderer.render()`. Two calls at the top of the loop were never brought
inside, and a throw in either blacked the screen every frame with no crash and
no console spam — because the loop reschedules on its first line.

**And: never delete multi-line CSS with a single-line filter.** v10.14 stripped
the Outbreak styles by dropping every line containing `zomb-`. The opening
lines went; the continuation lines stayed, leaving four orphaned `}` in a
`<style>` block that shipped to every player.

### v10.15's own lesson

**A safety net can hide the feature it protects.** `spawnFor()` filters spawns
by team tag and falls back to the full set when the filter is empty — a guard
added in v8.27 so an empty list could never crash a match. Five small maps
shipped with no tags. The guard did its job perfectly and team spawns were
silently off for every one of them: no error, no warning, nothing in any gate.

**When a fallback exists, assert that the primary path is actually being
taken.** tools/verify-spawns.js does that now.

### v10.14's own lesson

**A gate board of 3,800 assertions did not stop me shipping a build where no
match would start.** `s.on(...)` in a function whose socket is named `socket`.
Valid JavaScript, a declared identifier, wrong scope — and every gate here
tests data and geometry, so none of them ever ran the code.

`tools/verify-bindings.js` now executes the socket bind chain. **When a defect
gets through, ask what CLASS of thing the board cannot see at all.** Here it
was an entire category: plumbing that only fails when executed.

And: I shipped Outbreak without running it once. It did not work. Rahul found
both in the first minute of play.

### v10.13's own lesson

**A keybind collision is invisible in the file you are editing.** The enemy
spot was bound to KeyX, which is `toggleProne` eighteen lines below in the same
handler — and my branch returned first, so it would have silently removed prone
from every player on every map. The second guess, KeyV, is `placeMine`. Both
were caught by verify-models comparing keydown claims across game.js and ui.js,
which is the only thing that could: each handler is valid code on its own.

Every letter except I, J, K, L, O, P and U is claimed on this build. **Check
the table before binding, and never assume a key is free because the file you
are looking at does not use it.**

### v10.12's own lesson

**A gate failing is information about the CODE before it is information about
the gate.** First load hit 341 KB against a 340 KB budget. The tempting read
was "a fifth map costs 1 KB, raise it". The real cause was two duplicate
`<script>` tags shipping sunsetrow twice on every load. Deleting them gave
334 KB, under budget, without touching a ratchet. The wasted bandwidth was the
only symptom; the double parse and double module execution were invisible.
**Read what the gate is pointing at before adjusting what it allows.**

### v10.11's own lesson

**An inverted box does not crash — it becomes a wall that is sometimes there.**
Every mirrored wall in killhouse.js computed x from `s`, which is -1 on one
side, and `seg()` does not sort its arguments. Three walls went into the
collider list with x0 > x1 and NEGATIVE width, including the whole west
perimeter. They merged, they drew, they passed the fingerprint, and they
collided unpredictably. Rahul found one by walking into it.

`verify-collision` now asserts no collider has a negative extent, on all four
maps — and caught two more the moment it was written. **When you fix a defect,
ask whether a gate can catch the CLASS**, because this one was invisible to
every gate that already existed.

### v10.10's own lesson

**The gates caught three mistakes I made while quoting the rules that forbid
them.** `M.carPaint` is an array of six materials and I passed it as one
(section 6, sixth instance). I typed killhouse spawn coordinates by hand and
four landed inside my own shipping containers (section 4.4). I emitted Urban's
lit windows through `box()`, which registers every solid in the prop log, and
produced 135 unsupported props (wrong mechanism, not a tight budget — `still()`
already existed for exactly this).

The lesson is not "read the handoff harder". It is that **reading a rule does
not prevent breaking it, and only a gate does.** Every one of those three was
caught in under a minute by a tool that already existed. Run them.

### v10.9's own lesson

**A gate that has never run is worse than a gate that fails.** `verify-pitch.js`
carried `const ROOT='/home/claude/us'` — the absolute path of the container it
was authored in. It threw ENOENT on every other checkout while the board
recorded it green at 9/0. Nobody noticed, because a crashing gate and a passing
gate both produce "no failures" if you only read the last line. **Grep the whole
tool tree for absolute paths before trusting any board.** It is clean as of
v10.9; it was not before.

---

## 1. OPEN — nothing verified by play

1. **THREE NEW SMALL MAPS.** Freightyard (four-way rotational, smallest map in
   the game), Bazaar (winding alleys, no straight lines), Substation (ring
   around a sunken pit). Never rendered. Walk each perimeter and confirm the
   pit edge on Substation reads before you walk off it.
2. **EVERY MATCH STARTS.** v10.13 shipped a crash that stopped all of them.
   Start one on any map before judging anything else in this build.
3. **THE ENEMY SPOT (U).** Team modes only. Confirm it refuses through walls,
   that the marker fades after ~5 s, and that it does not fire on teammates.
3. **THE MINIMAP ON EVERY MAP.** It was hardcoded to urban's size, so rural was
   clipped and the small maps were a smudge. Check all five.
4. **THE WELCOME SCREEN — TEST THIS FIRST OF THE OLD ITEMS.** Riskiest new code in the build and
   it sits in front of everything else. showcase.js creates a SECOND
   WebGLRenderer for the rotating weapon. Wrapped at every entry point, fails to
   a collapsed panel, but that path has never run. If the menu renders and the
   gun turns, the riskiest thing here is proven. If the panel is simply absent,
   the fail-safe worked and the console says why.
2. **SUNSET ROW.** Two houses, a street, side yards. Walk both houses, both
   doorways of each, and the flank routes.
3. **THE RECON VISOR SILHOUETTE, AGAIN.** Scaled and lifted twice in v10.10,
   found only by reading the code. Confirm it sits ON the operator, is
   operator-sized, and behaves when the target goes prone.
4. **THE NUKE HAS NEVER BEEN CALLED BY A HUMAN.** Killhouse only, five kills in
   a row, N opens the target map, click to strike. The rules are gate-proven
   (tools/verify-nuke.js, 28 assertions) but the FEEL is not: is five kills the
   right price on an 8-player map, and is 11 m the right radius in a 58 x 34 m
   room? Both are one number each in `server/lib/nuke.js`. Also confirm the
   banner is readable mid-fight and that dying while the map is open takes both
   the nuke and the map away.
2. **THE RECON VISOR.** Crate-only. Confirm enemies read clearly through walls
   without the silhouette being so loud it is better than looking, and that it
   vanishes the instant you die.
3. **THE WEST OFFICE DOORWAY.** Two defects fixed there — a crate blocking it
   and three walls with negative width. Walk in and out of BOTH offices, and
   walk the full inside of the west wall, which was one of the broken ones.
4. **KILLHOUSE, everything else about it.** Never rendered. Confirm: the map loads;
   both spawn ends look and play the same; container tops are reachable by the
   crate chain (there are no stairs anywhere by design); the offices are
   enterable through their single doorway; skylights actually light the floor.
5. **URBAN'S NEW LOOK.** Lit windows on the perimeter blocks and wet ground
   under the streetlamps. Confirm it reads as evening rather than as grey, and
   that nothing glows through a wall. `colSig` is unchanged so it CANNOT have
   altered cover — if the map plays differently, something else did it.
6. **The avatar geometry cache (v10.9).** Every body part and third-person
   weapon now shares one geometry per distinct box size. Confirm operators look
   right, weapon switches change the visible gun, and crouch/prone/walk are
   unchanged. Highest-risk change of the last two versions.
7. **The disconnect (v10.9).** The 30/60-minute drop should be gone. Only a long
   match with several people can confirm it. If it survives: press F3, read
   **p90 not the average**, then §1b.
8. **15-player cap and reshaped modes (v10.9).** 7v7 is the top team rung,
   Squads are 7x2 and 5x3. Confirm lobbies fill and start.
9. **Bots gone from the UI (v10.9).** No Overrun or Strike Team anywhere, no bot
   sliders, no "FILL EMPTY SLOTS WITH BOTS" row — including on first paint.
10. **The weapon cull (v10.9).** AWM-S, Karabiner 98k, M1 Garand and the bow
   should not spawn. **Kar98 now should** — it was unobtainable before.
11. **FAMAS and AKM recoil (v10.9).** Controllable without being lasers.
12. **Everything still open from v10.8** — the ship-bridge switchback, the raking
   stair skirts, the turf, the quay crane, the seats. Still nobody has looked.

## 1b. NOT DONE

- **Client frame profiling still never completed.** F3 exists and reports
  p50/p90/max. Nobody has read it in a real match.
- **`test.js` was not run for v10.9.** It needs a live socket; the authoring
  sandbox blocked the transport. **Run it before deploying.** Expect 263/0.
- **Bot gunfire has no sound.** Bots emitted `shoot` in v10, it was the v10.7
  lag, and it was removed. Bots are switched off now so this is dormant — but
  if bots ever return, a bot shooting you still produces a damage flash, shake
  and a direction arrow (`fromPos`, combat.js) and **no gunshot, flash or
  tracer**. If re-added: a GLOBAL budget of a few per second, nearest-first,
  **audio only** — no raycast, no tracer.
- **Rural bridge stairs are only half fixed.** Six flights climbed away from the
  deck; turned around, two now climb fully and four reach 0.30 m instead of
  0.05. The flight shape is right, so something local to those four ends still
  blocks them. Rural 7 -> 5 unclimbable.
- **Urban rooftop clutter and cable runs were built and CUT.** 135 unsupported
  props. To ship them: read real roof tops out of the built geometry the way
  gen-points reads spawn ground, and give the cables a named anchor exemption.
  Commented note left in deco.js.
- **Killhouse has no mezzanine.** Deliberate for v1. It is the obvious v2.
- **ANIMATION AND RENDERING BUGS — STILL NEVER SEEN.** Asked for in the original
  brief, asked for again twice. They cannot be found in source; they have to be
  watched. Recordings are the blocker.

---

## 2. FIXED IN v10.9 — see CHANGELOG for full reasoning

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

```
npm install
node server.js &
node test.js                     # 263 expected — NOT RUN for v10.9
for f in tools/verify-*.js; do node $f; done
node verify-models.js            # 225 / 0
node verify-avatar.js            #  25 / 0
```

**3,408 assertions passing.** verify-bots **258/0** (was 250 — 8 new assertions
prove the bot kill switch), verify-client 62/0, verify-drone 45/0,
verify-scope 20/0, **verify-pitch 9/0 (first real run in its life)**.

### THE THREE DOCUMENTED REDS — expected, not regressions

| gate | expected |
|---|---|
| `verify-climb` | 1 pass / 2 fail — urban 16 of 73, rural 7 of 25 (Metro 0 of 38) |
| `verify-arch` | 4 pass / 2 fail — urban 21, rural 18 (Metro 0) |
| `verify-access` | 55 / 1 — north block A, unchanged since v8.9 |

---

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
- **NEVER cache assets by name.** Only safe with a build hash in every URL.
- **Never hand-revert a file.** Restore from the archive verbatim.
- **`powerPreference` must be set on the WebGL context.**
- **Check the field you are reading actually exists, AND what type it is.**
  `muzzleZ`, `SPAWNS[1]`, `r.wp`, `team` as a string — and in v10.9, `process`
  in a file the browser also loads. Five times now; the most repeated mistake
  in the project.

---

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

## 7c. THE INTERPOLATION BUFFER

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

## 13. THE WELCOME SCREEN — v10.12

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
