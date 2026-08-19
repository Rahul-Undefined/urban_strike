# Urban Strike — Handoff (v10.6 shipped)

Upload this file plus `urban-strike-v10.6.zip` into a new chat.

> **DEPLOYING? HARD-REFRESH ONCE (Ctrl+Shift+R).** v10.2–v10.5 sent a 1-hour
> cache header on every script while leaving index.html uncached, so a browser
> could run the PREVIOUS build's JavaScript against the new server for an hour
> after a deploy. Fixed in v10.6, but whatever is already in a browser's cache
> has to be cleared once by hand.

**Read §0 first.** All six v9.15 defects are closed, but the most useful thing
in this document is why the gate board was green while they were live.

---

## 0. THE THING THAT MATTERS MOST — UNCHANGED FROM v9.15

**Nothing in this project renders a frame.** Every gate is static analysis or
headless simulation. v10 added three gates and fixed seven defects and *still*
nobody has looked at the game.

Three of the six v9.15 defects were diagnosed from screenshots. Two of the four
NEW findings in v10 came from measuring, and one — bots firing silently — came
from a grep that took four seconds. None of them came from the board.

**Play a match before you believe anything.** Urban and Metro, five minutes each.

`ffmpeg` is available:
`ffmpeg -i clip.mp4 -vf "fps=1/3,scale=760:-1" -q:v 4 out_%02d.jpg`

### v10's own two lessons, which generalise

**A stub that cannot see is worse than no stub.** The headless THREE the gates
run under had no `geometry.parameters`. viewmodels.js reads exactly that field
to measure each muzzle, behind a `if (!o.geometry || !o.geometry.parameters)
return;` guard — so the guard skipped every part and the `-0.7` fallback fired
for all 25 weapons. Every gate assertion about barrel length was **vacuously
true for as long as the stub existed**. Use `tools/_three-stub.js` for anything
that reads geometry. `verify-barrel.js` asserts the fallback is not in use, so
this specific failure now announces itself.

**A budget must name what it excuses.** `verify-stairs-quality` carried
`arrival: 1`, documented as the Civic Centre switchback. Civic Centre got fixed;
the ship bridge — overshooting its building by 5.4 m onto a pier over open water
— silently inherited the slot and rode it for versions while recordings kept
arriving. Budgets are **named allowlists** now, and fail in both directions: an
unlisted failure is red, and so is an entry nobody matched. Check every
remaining numeric budget in the codebase for the same disease.

---

## 1. OPEN — nothing verified by play

Everything below shipped against a green board and **has never been seen on
screen**. Treat this as the defect list until someone plays a match.

1. **The switchback.** `buildingAt` in `districts-outer.js` builds the ship
   bridge stair as three legs in two lanes. `verify-access` walks it to 12.67 m
   and `verify-stairs-quality` is clean, but nobody has looked at it. Check the
   turn landings especially — the clear pad is only 0.75 m deep.
2. **The raking stair skirts** in `access.js`. Nine solid slabs became three
   raked runs of eight thin plates. Purely visual; confirm it reads as a stair
   underside and not as a ladder.
3. **The turf.** 308 tiles, each now cut to its real radial step. Minimum
   coverage margin +0.050 m. Confirm no grey shows at a grazing angle.
4. **The quay crane.** Moved to x −63 and turned 90°. Confirm it does not now
   clip the ship or the stadium's outer tier (`verify-pitch` says it does not).
5. **The seats.** Muted palette. Purely a look question.
6. **Bot gunfire.** Bots now emit `shoot` within 90 m. Confirm you can *hear
   and see* where you are being shot from, and that 12 bots do not flood the
   screen with tracers. This is the one most likely to need tuning.

## 1b. NOT DONE

- **Client-side frame profiling was never completed.** Server tick is proven
  clean (below). The client has not been measured at all. If lag survives the
  bot-gunfire fix, this is where to look next — start with avatar count and
  `rayHit` call sites, and measure before theorising.
- The socket-level end-to-end test of bot gunfire could not be observed: an
  idle test client never becomes a bot's target. The hook was verified in
  simulation at 10.5 shots/sec across 8 bots, and the emit path was read, but
  **no client has actually received one.**

---

## 2. FIXED IN v10 — see CHANGELOG for full reasoning

| v9.15 item | Real cause |
|---|---|
| 1.1 knife suppressor | `dress()` measured a "muzzle" on every model; a blade tip qualified. **Bow, drone and RPG were affected too** |
| 1.2 guns through walls | probe 1.05 m vs real reach 1.64 m; cast from the eye, not the gun, and 0.22 m too high |
| 1.3 hanging stairs | 8 m building, 12 m stair run — and a budget excusing the wrong flight |
| 1.4 "weird big steps" | nine solid 1.5–4.3 m slabs *under* the flights, not the treads |
| 1.5 striped outfield | average tile depth on an ellipse → 0.53 m bare gap |
| 1.6 "pergola" | the harbour gantry cranes, 20 m booms across the ground |
| 1.7 neon seats | `M.signalRed` is `E(0xff3a2a)` — an emissive railway signal lamp |
| (new) silent bots | `botShoot` broadcast nothing; no flash, tracer, sound or ping |
| (new) GC churn | `raySlab` built two arrays per collider — 6,664 per `rayHit`, per frame |

---

## 3. Verification

```
npm install
node server.js &                 # test.js needs a live server on :3000
node test.js                     # 263, always 0 failed
for f in tools/verify-*.js; do node $f; done
node verify-models.js            # 225 / 0
node verify-avatar.js            #  25 / 0
```

**Note:** websocket transport is blocked in some sandboxes; `test.js` works
because it uses the default transport. If a socket test reports
`connect_error`, that is the environment, not the server.

### THE THREE DOCUMENTED REDS — expected, not regressions

| gate | expected |
|---|---|
| `verify-climb` | 1 pass / 2 fail — urban 16 of 71, rural 7 of 25 (Metro 0 of 38) |
| `verify-arch` | 4 pass / 2 fail — urban 22, rural 18 (Metro 0) |
| `verify-access` | 55 / 1 — north block A, unchanged since v8.9 |

Everything else green: verify-map 1875/0, verify-bots 250/0, verify-models
225/0, verify-armoury 200/0, **verify-attach 97/0**, verify-lifts 69/0,
verify-client 62/0, **verify-barrel 53/0**, verify-fullmap 51/0, verify-drone
45/0, verify-endscreen 38/0, verify-undeclared 37/0, verify-batch 36/0,
verify-hitbox 32/0, verify-netcodec 31/0, **verify-stairs-quality 30/0**,
verify-avatar 25/0, verify-untouched 23/0, verify-scope 20/0, verify-collision
19/0, verify-fingerprint 16/0, verify-devhud 14/0, verify-merge 9/0,
**verify-pitch 9/0**, verify-flow 6/0, verify-floaters 3/0, verify-props 2/0,
verify-zfight 2/0, verify-build PASS, verify-cover PASS.

---

## 4. How this project fails

1. **A green gate that never looked.** Metro shipped 19.2% dead ground while
   everything passed, because `verify-cover` only ran on Urban.
2. **A gate pinning an implementation, not a rule.** Three examples in v10
   alone: `verify-access`'s walker could not turn, so it called a correct
   switchback unreachable; `verify-devhud` asserted a flight was still broken
   and reddened when it was repaired; a new assertion of mine compared raw
   attachment part counts and failed because a compensator has two parts and a
   suppressor one. Read the gate, fix it to test the invariant, say so in a
   comment. Never weaken it to go green.
3. **A shared helper edited for one caller.** `World.BOUND` set for Urban cost
   Rural two thirds of its loot. Before touching `buildingAt` in v10, all three
   callers were measured first — only one needed the change.
4. **Numbers typed instead of measured.** v9.3, v9.5, v9.6, v9.14, and `CLEAR
   = 1.05` in v9.12. Use `tools/gen-points.js`; it reads the built geometry.
5. **A trimmed dependency.** See §0 — this is now known to have silently
   voided a whole category of assertion, not just to limit them.
6. **Fixing one defect by creating another.** v9.14 bounded a stair and
   orphaned the roof. v9.15 then built a pier over water to catch it.
7. **Fixing the wrong instance.** v9.13 reshaped the wrong staircases; v9.15
   reshaped the right ones' *treads* when the problem was their *skirts*.
   **Confirm you are looking at the thing in the screenshot.**
8. **A budget that does not name its exception.** New in v10 — see §0.
9. **Measuring the mean and stopping.** v9.13 cleared bot AI at 1.08 ms
   average. That is consistent with 40 ms spikes. `tools/prof-bots.js` reports
   percentiles; it confirmed the tick really is clean, but only because it was
   asked properly.

---

## 5. Architecture

```
server.js                 rooms, match loop, snapshots, socket handlers
server/lib/{rooms,combat,loot,mines,bots,drones}.js       [bots.js SHARED x3 modes]
public/src/networking/snapcodec.js    THE WIRE FORMAT — server, browser, tests
public/src/config/        weapons, gameplay, loot, world, maps-*, districts
public/src/environment/   world.js + districts-{south,north,outer}.js,
                          rural.js, metro.js, access.js, deco.js
public/src/weapons/       system.js (fire/reload/grants), viewmodels.js
public/src/ui/            ui.js, minimap.js, devhud.js
tools/verify-*.js         35 gates (verify-bandwidth covers the wire format)
tools/_three-stub.js      THREE stub WITH geometry.parameters — use for geometry
tools/audit-stairs.js     finds flights by collider shape, registered or not
tools/prof-bots.js        bot tick cost as a distribution
tools/prof-rays.js        ray throughput, grid vs linear
tools/audit-sightlines.js longest clear line per map vs fog density
tools/prof-snap.js        REAL snapshot bandwidth in a live bot match
tools/diag-jitter.js      arrival gaps + wire frames + position jumps, live
tools/verify-interp.js    replays real network profiles through the interpolator
tools/gen-points.js       spawn/loot generator — USE IT, never type coordinates
```

- **`CFG.WEAPON_ORDER` is the wire format.** Append only.
- **`pos[1]` is the capsule CENTRE, not the feet.**
- **One weapon, one spelling.** Travelling projectiles read `bulletSpeed` /
  `bulletDrop`; rockets read `projSpeed`.
- **A model carries its own type** (`userData.wtype`, v10). Anything that
  decides what a weapon may wear reads that, not a name list.

---

## 6. Rules this project pays for when broken

- A limit is not a target. `MOVE.step` is 0.42; stair rises target 0.24–0.34.
- Stair run must exceed the 0.35 m player radius.
- A landing goes beside or beyond a flight, never above it — **and a
  switchback landing needs a clear pad with nothing overhead, or there is
  nowhere to stand at the turn** (v10).
- A switchback must turn in a *second lane*. Turning in place leaves 0.375 m of
  headroom where a capsule needs 1.9 m (v10).
- **Ratchets fall, never rise.** And they must name what they excuse.
- Anything mounted on top of a viewmodel grows into the sight line.
- Paint needs a real offset — 6 mm is inside the z-fight tolerance.
- A rotated box collides through its AABB, which is not its shape.
- **Nothing allocates per collider in a per-frame loop** (v10).
- **A spatial query goes through the grid, not the whole array** (v10.1). If
  you add one, add it to `verify-broadphase.js` — the grid is only safe while
  it is proven identical.
- **A gate must test code, not its own comments** (v10.1). Strip comments
  before source assertions; naming a thing to forbid it will match the regex
  that forbids it.
- **Never send what the snapshot already carries** (v10.2). Check snapcodec
  before adding a field to any event.
- **NEVER cache assets by name.** This project ships as a cumulative upload;
  ~35 scripts keep the same URLs every build, so any positive `maxAge` lets a
  browser run last build's client against this build's server. A v10.3 client
  hits `if (!d.e) return;` against a v10.5 server and renders nothing at all —
  no error, total freeze. Only safe with a build hash in every URL.
- **Never hand-revert a file.** v10.5's slice edits silently dropped
  `if (d.tk !== undefined) teamKills = ...`. Restore from the archive verbatim
  and re-apply changes on top.
- **`powerPreference` must be set on the WebGL context.** Without it a laptop
  with switchable graphics hands you the **integrated** GPU. This game ran on
  the weakest chip in the machine until v10.5.
- **Measure the thing that decides playability, not the thing that is easy to
  measure.** Bandwidth was measured correctly every time in v10.2–v10.4. When
  packets *arrive* was never measured until the player reported it twice.
- **Localhost is not the internet.** Four separate v10.4 bugs measured perfect
  in a container. If a fix concerns timing, simulate the network.
- **Check the field you are reading actually exists, AND what type it is.**
  `muzzleZ` was a fallback; `SPAWNS[1]` was a rotation; `r.wp` was never
  stored; `team` is a **string**, and encoding it as a byte put every player on
  one side. Four times now — this is the most repeated mistake in the project.

---

## 7. Maps and budgets

| | Urban | Metro | Rural |
|---|---|---|---|
| colliders | 3,332 | 1,564 | 1,066 |
| draw calls | **98 / 115** | 41 / 45 | 32 |
| triangles | 92,092 / 120,000 | 25,708 / 26,000 | 54,467 |
| shadow casters | **62 / 62** | 20 / 22 | 22 / 26 |
| spawns / loot | 44 / 364 | 46 / 246 | 50 / 164 |

**Urban has ZERO caster headroom. Metro has ~290 spare triangles.** Every v10
geometry change was made `cast: false` for this reason; casters and draw calls
did not move.

**Urban's south-west has a real building at x[−60,−46] z[48,86].** It has now
been built into three times. `tools/verify-pitch.js` guards the stadium side of
it; the building itself still has no gate.

---

## 7b. DO NOT REDO THE BANDWIDTH WORK. READ THIS FIRST.

Render billed 5.8 GB and v10.2–v10.4 attacked it. **All of it is reverted** and
Rahul has chosen to pay for bandwidth instead. The next person to see that bill
will have the same good idea, so here is the fact that is not in the bill:

**socket.io does not send a binary event as one frame.** It sends a JSON
envelope carrying a `_placeholder`, then the attachment as a **separate frame**,
and the client must hold the envelope until the attachment lands before it can
emit the event. Every snapshot became **two frames plus a reassembly step**, 15
times a second. The payload got **54% smaller** and the **stream got worse** —
avatars teleporting, hits refused.

Reverted: binary entity block, PY split, permessage-deflate (2% on quantised
integers, and `ws` compresses **async** — that is jitter), the compact `{id}`
bot shot event, and v10.4's adaptive interpolation buffer and extrapolation.

Kept, because none of it touches the frame path: HTTP gzip on static assets
(66%, once per page load), the broadphase, the sign atlas, all geometry fixes.

**If bandwidth is ever revisited: measure ARRIVAL JITTER
(`tools/diag-jitter.js`), not payload size.** A smaller packet that arrives late
is a regression, and arrival is the only thing a shooter is made of.

## 7c. THE INTERPOLATION BUFFER — read this before touching snapRate

```
snapRate 15        → a tick every 66.7 ms
interpDelay 120 ms → 1.80 ticks of buffer
headroom           → 53 ms of jitter before it runs dry
```

Past that, `f` clamps at 1.15 and the avatar **stops**; the server has moved
that body on, so the 4 m plausibility check refuses your hits while its own
still land.

53 ms is thin — **and it is unchanged from v9.15, so it is not what broke
v10.3.** Left alone deliberately. If stutter persists, the cheapest experiment
is raising `CFG.NET.interpDelay` **alone**: one number, no new code, instantly
reversible. Do not reach for extrapolation first. `verify-interp` prints what an
adaptive buffer would buy as *evidence, not a claim*.

**Every measurement this project can take runs on localhost, where jitter is
~1 ms.** The server timer reads 15.09 Hz on a game that stutters over real
internet.

## 8. Networking

Delta snapshots since v9.8, ~87% less outbound than v9.7. Format lives **only**
in `snapcodec.js`.

- Keyframes on match start, on join, every 60 ticks. Absence means removed.
- A position change over 2.5 m in one tick is **snapped, not interpolated**.
- `snapRate` 15 should stay; at 10 it rubber-bands against the 120 ms buffer.
- `clientRate` is **inbound** — changing it saves nothing on Render's bill.
- **Loot does NOT auto-pick.** `tryCollect` ran on every state update; it is
  driven by the interact key (Z, same as lifts) since v10.5. The server still
  owns the decision — the client sends no item id and no position.
- **No permessage-deflate.** v10.3 enabled it; measured, it saves **2%** on a
  binary snapshot and `ws` compresses asynchronously, adding jitter to a stream
  that could only absorb 53 ms. Removed in v10.4. HTTP gzip is unaffected.
- **The snapshot buffer must OWN its memory.** `Buffer.allocUnsafe` hands out a
  view into a shared 8 KB pool; anything reaching for `.buffer` then ships 8 KB
  of unrelated memory and the client decodes garbage. Intermittent, because it
  works whenever the pool cursor lands on 0.
- **The entity block is JSON** — see §7b for why binary failed. Same fields, same deltas, same
  quantisation — decoded values are bit-identical to the old JSON path. `PY`
  is split out of `POS` so a stable height is not resent; it is the only field
  a moving bot leaves clean. permessage-deflate is on (socket.io defaults it
  off). **Nothing is culled by distance** — every player still sees every
  player, which is the rule at the top of snapcodec.js.
- **Bot gunfire is range-gated at 90 m and sent per recipient** (v10), and
  carries `{ id }` ALONE (v10.2) — the snapshot already has the position and
  the weapon index `wp`, so sending them again cost 4.3 MB/player-hour for
  nothing. The client accepts both shapes; humans still send the long form.
- Meter: `NETSTATS=1 node server.js` then `GET /netstats`. Off in production.

---

## 9. Longer-term open items

1. `verify-climb` urban 16 / rural 7 — The Colony and Old Town Terrace next.
2. `verify-arch` urban 22 / rural 18 broken promises.
3. **Metro sniper fog — measured in v10.1, not acted on.** The 97%-at-250 m
   figure was arithmetic on a distance that does not exist. Real longest clear
   lines (`tools/audit-sightlines.js`): Metro 196.3 m at **89% obscured**,
   Urban 175.8 m at 39%, **Rural 301.0 m at 77%**. A max-range shot on Metro is
   about twice as hard to read as on Urban, and five weapons out-range what the
   map can show — which is why a miss reads as "the bullet didn't reach".
   Whether a night map *should* be that opaque needs someone who has seen it.
   **The surprise is Rural**, not Metro: 161 clear lines over 150 m against
   Metro's 12, on daylight fog, and nobody has looked at it.
4. ~~Urban district signboards~~ — **done in v10.1.** One atlas, one material:
   draws 112 → 98, headroom 3 → 17.
5. **Bots don't use lifts.** Urban has **21** (13 up to 6.25–30.3 m, 7 down
   to −5.75 m with no stairs at all, 1 tower lift); Metro and Rural have none.
   Bots take stairs and ramps only, so the 7 downward stops and the lift-only
   tower roofs are human-accessible territory a bot will never contest.
6. The spectator camera, ping wheel and reconnect toast have **never been seen
   on screen** — shipped in v9.11, verified only headlessly.
7. **Client frame cost has never been measured.** See §1b.
8. ~~No broadphase~~ — **done in v10.1.** Uniform 8 m x/z grid; a 140 m cast
   went from 296 µs to 15 µs (**19.5×**). Proven bit-identical to the linear
   scan over 25,500 queries. Remaining: the server's own collider scans in
   `server/lib/bots.js` have no equivalent and were never measured.

---

## 10. Working style that has worked

- **Measure before proposing.** Build the map in a vm, query the colliders,
  quote real numbers.
- **Extract frames from the recordings.**
- **One change, then run the gate.** Both v10 switchback mistakes were caught
  on the first run after the change that caused them.
- **Test two theories before believing one.** In v10, three theories for bot
  lag were tested and two discarded before the silent-gunfire finding.
- **Measure distributions, not means.**
- **Write the reason in the code, not the chat.**
- **Say what is not done.** §1b exists for this reason.
