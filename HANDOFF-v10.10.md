# Urban Strike — Handoff (v10.10 shipped)

Upload this file plus `urban-strike-v10.10.zip` into a new chat.

> **RELEASING? BUMP `version` IN package.json.** Every local asset URL is
> stamped `?v=<version>` at startup. Forget the bump and a cached client runs
> the previous build's JavaScript against the new server — that failure renders
> nothing and logs nothing. Check with `curl -s <host>/ | grep -c '?v='`
> (expect 33) and `curl -s <host>/version`. v10.10.0 verified on both.

**Read §0 first.**

---

## 0. THE THING THAT MATTERS MOST — STILL TRUE, NOW WORSE

**Nothing in v10.9 has been seen on a screen.** Five behaviour changes shipped
against a green board and zero rendered frames. One of them changes what every
remote player's body is made of.

**Play a match before you believe anything.** Two maps, 45 minutes, F3 open.
Read **p90, not the average**.

`ffmpeg -i clip.mp4 -vf "fps=1/3,scale=760:-1" -q:v 4 out_%02d.jpg`

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

1. **KILLHOUSE, everything about it.** Never rendered. Confirm: the map loads;
   both spawn ends look and play the same; container tops are reachable by the
   crate chain (there are no stairs anywhere by design); the offices are
   enterable through their single doorway; skylights actually light the floor.
2. **URBAN'S NEW LOOK.** Lit windows on the perimeter blocks and wet ground
   under the streetlamps. Confirm it reads as evening rather than as grey, and
   that nothing glows through a wall. `colSig` is unchanged so it CANNOT have
   altered cover — if the map plays differently, something else did it.
3. **The avatar geometry cache (v10.9).** Every body part and third-person
   weapon now shares one geometry per distinct box size. Confirm operators look
   right, weapon switches change the visible gun, and crouch/prone/walk are
   unchanged. Highest-risk change of the last two versions.
4. **The disconnect (v10.9).** The 30/60-minute drop should be gone. Only a long
   match with several people can confirm it. If it survives: press F3, read
   **p90 not the average**, then §1b.
5. **15-player cap and reshaped modes (v10.9).** 7v7 is the top team rung,
   Squads are 7x2 and 5x3. Confirm lobbies fill and start.
6. **Bots gone from the UI (v10.9).** No Overrun or Strike Team anywhere, no bot
   sliders, no "FILL EMPTY SLOTS WITH BOTS" row — including on first paint.
7. **The weapon cull (v10.9).** AWM-S, Karabiner 98k, M1 Garand and the bow
   should not spawn. **Kar98 now should** — it was unobtainable before.
8. **FAMAS and AKM recoil (v10.9).** Controllable without being lasers.
9. **Everything still open from v10.8** — the ship-bridge switchback, the raking
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

## 11. KILLHOUSE — shipped v10.10

Indoor warehouse, 58 x 34 m, humans only, mirrored about x=0 by `pair()`.

    public/src/config/maps-killhouse.config.js    loot / spawns / airdrops
    public/src/environment/killhouse.js            geometry
    CFG.MAPS.killhouse                             bound 32, maxPlayers 8
    server.js mapData()                            resolves MAPS_KILLHOUSE
    world.js buildMap()                            dispatch lookup

    draws 33/45 · tris 12,260/26,000 · casters 17/22 · colliders 205
    dead ground 0.2% (budget 0.02) · floaters 0 · worst uncovered 14.7 m

**maxPlayers 8 on the MAP caps every mode played on it**, lower of map and mode
wins. Fifteen operators in this footprint is not a fight.

**No sniper or RPG on the floor** — airdrop pool only. A 100-damage one-shot at
spawn on a 40 m map defines every match; earning it from a crate does not.

**No stairs, deliberately.** Container tops come off a 0.31 m crate chain.

Its cover budget is 0.02, tighter than every other map, because indoors there is
nowhere for dead ground to hide honestly — a rooftop or a river accounts for a
few percent on a 200 m outdoor map, but here it means floor no cover overlooks.

Next: the mezzanine, once verify-climb is not red on 21 flights.
