# Urban Strike — Project Handoff (v2.0.0 · build 30 · 2026-09-21)

Read this file, then `CHANGELOG.md` (the v2.0.0 entry has the *why* of every
change), then the code. Everything below is true of the code as shipped in
`urban-strike-v2_0_0.zip`. The v1.x handoff (`HANDOFF-v1.0.md`) is history;
its §6 rules are carried forward here, amended where v2.0 changed them.

Play group: at most 6–7 people per match. Hosted on Render's free plan.

---

## §0 THE LESSONS THIS RELEASE ADDS

**1. A clock is not a counter.** The avatar jitter that arrived "after a few
minutes" every match was the netcode stamping samples as `base + n × 66.67 ms`
— the tick COUNT used as a clock — and chasing drift at 4 ms/s. Node's
`setInterval` re-arms from when the callback *ran*, not when it was due, so
under any event-loop stall (a shared free-tier CPU, GC, another room) the real
tick period is 67–70 ms and the count clock falls behind wall time
*cumulatively*: 4.7 ms/s measured under 30 ms stalls. After ten minutes the
newest sample looked hundreds of ms old, the SNAP catch-up fired every frame,
and remote bodies stepped at 15 Hz. The fix is the server's real clock on the
wire (`packet.t`, match-relative) mapped by a windowed minimum. **Anything that
must agree between two machines over fifteen minutes needs a real timestamp,
never an assumed period.** (`server.js` snapshot loop, `net.js sampleTimeFor`.)

**2. "It stays as a prop" is a leak with a nicer name.** Airdrop crates were
kept in the scene forever; every impact allocated a material; every shot left
three audio chains connected to master; 437 loot items each carried 3–6
materials and bobbed every frame. None of these was a bug in isolation and
all of them grew with match time — that is what "lags after twelve minutes"
means. **Every per-event allocation needs a disposal path, and every
per-frame cost needs a distance or a cap.** (`pickups.js`, `effects.js`,
`audio.js finish()`.)

**3. A gate can be wrong about the world it measures.** Three train riding
tests passed at 10 m/s and failed at 30 m/s for reasons that had nothing to do
with the train: a stale coach pose read before the coach had moved a coach
length; a test walking "from the road" into a coach face that is now a halt
deck; a frame-phase-dependent resting distance asserted as a contract. Two of
the three failures pointed at REAL riding bugs (§2 train); the third was the
gate. **When a gate goes red after a speed or size change, decide per
assertion whether it measured a contract or an accident of the old numbers.**

---

## §1 OPEN ITEMS (owed, in priority order)

1. **PLAY-VERIFICATION of v2.0 by a human: none yet.** Every change is proved
   headlessly (44 gates) and against a live server (`test.js`), none in a
   browser. Watch specifically: the shadow frustum following the camera (any
   swimming at the frustum edge — `World.followSun` snaps to the texel grid;
   if edges crawl, halve `sunShadowHalf` or raise the map size per tier); the
   low-fuel siren volume aboard vs on the ground (`AudioSys.fuelSiren`); the
   RPG-L lock toast and whether 130 m reads as fair against an 80 m machine;
   the perimeter train at 30 m/s from the roof through the four fillets
   (fillet 14 — if riders slide, raise it to 18 and re-run `verify-train`);
   the halt decks (a rider pressed into the coach wall should stay on the
   deck); crate beacons (60 m) visible through fog from the far side.
2. **The map is 3× the area for 6–7 players.** Rahul chose +100 m on all
   sides. If matches thin out, the zone mode is the lever (`ZONE.r0` 335 covers
   the whole map from (−30, 0); `fullMinutes` 2 before the first shrink) — or
   spawn balancing could weight the new districts down. Do not shrink the map;
   fix pacing with the zone first.
3. **Airdrop cadence 60 s with 5 exotic items** may be too generous for 6–7
   players (a gun every minute somewhere). `AIRDROP.periodSec` and `count` are
   the two numbers; `exoticPool` lists weapons twice — halve that to bias
   toward gear.
4. **Sniper one-shot anywhere.** legs 1.0 on all three scoped rifles means a
   foot shot kills an unarmoured player. That is what was asked for ("instant
   and direct kills if not taken the vest"); if it plays as too much, `legs`
   0.9 (90 dmg) on `sniper`/`kar98` keeps the AWM .338 as the true one-shot.
5. **The helicopter crash kills riders with no killer** (`helidown`, `by: null`).
   Kill-feed and end-screen handle it as an environmental death like the
   train; if a "suicide" stat is wanted it is a one-line count in `combat.js`.
6. **Render free tier sleeps after 15 min idle** — the first player of the day
   waits for a cold start. Nothing in the code can fix that; a paid instance or
   an external ping can.

## §1b GAP REGISTER (documented, accepted)

- Pre-existing gate reds, unchanged and explained in their files:
  `verify-climb` 7 flights (was 16: Construction, Old Town Terrace ×4,
  Airport, Eastgate — the v8 45° flights; none in v2.0 geometry) ·
  `verify-arch` 1 (one roof that looks climbable refuses) · `verify-access`
  45/1 (north block A). Board: **44 offline gates green, 3 documented reds.**
- `verify-stairs-quality` and `verify-climb` measure Urban only now (Metro is
  gone); the Airfield/Riverside towers share `World._towerAt` with Urban's
  eight, which those gates pass, but are not measured in place.
- The four new corner towers reuse `_towerAt` unchanged; `verify-zfight`,
  `verify-props`, `verify-stairs-quality` were re-run over them (§6 rule 9)
  and needed no excusals.
- **BOT MODE IS REMOVED AND STAYS REMOVED** (v10.9, v1.0). `server/lib/bots.js`
  is a GEOMETRY HARNESS (colliders, LOS, stairs, paths) that ~30 gates require
  by path; it fields no bots. Any "bots" request is a new design.
- **METRO CITY IS REMOVED AND STAYS REMOVED** (v2.0). "Nobody plays that."
  Builder, config, districts, lifts, gates — deleted. The `NIGHT` render table
  in `world.config.js` has no map now; it is kept as the documented way to
  give a map its own lighting.
- **KILL-STREAK STRIKES ARE REMOVED AND STAY REMOVED** (v2.0). Rocket ladder,
  arena nuke, Strike Key, Strike Remote + air strike — `nuke.js`, `rocket.js`
  and every handler/binding deleted. `verify-protect` asserts their absence
  (no `strike_key`/`remote` loot, no `GEAR.rocket/remote/heli`, no server
  handlers, no N/hold-Z on the client). "Keep the game authentic."
- `energy` and `painkill` heals, `wpn_sniper`/`garand`/`k98w`/`bow`/`arrows`
  are `retired: 1` — ids resolve (viewmodels, `WEAPON_ORDER`), nothing spawns.

---

## §2 WHAT v2.0 IS — SYSTEM BY SYSTEM

### The map (Urban, 500 × 440 m)

- `MAPS.urban`: `bound: 120` is the CORE square older symmetric readers use
  (spawn balancer, radar); `ext: { x0: -280, x1: 220, z0: -220, z1: 220 }` is
  the true playable extent. Every v2.0 reader uses `ext`: the server `st`
  bounds and team-marker bounds, the minimap bake, `zoneSchedule`,
  `heliRouteBox`, `verify-heli`/`verify-zone`.
- Layout, from the outside in: **wall** at the extent (0.9 m, 3.2 m tall) →
  **perimeter boulevard** (asphalt x −276..−264 / 204..216, z ±204..216,
  train centreline x −270/210, z ±210, kerbs, lamps every 36 m) → the
  **band** of ten districts, 68 m deep → the **inner avenue** where the old
  wall stood (z ±120..128, x 120..128, x −188..−180) → the v1.1 city.
  Sixteen **cross streets** (8 m) join the two rings; four **station plazas**
  sit inside each halt.
- Districts (`districts.config.js`, listed first so they cannot steal a
  match): CANNERY ROW / NORTH RIDGE / REFINERY (north), QUARRY / SOUTH
  COMMONS / SOUTHPORT (south), GASWORKS / RIVER TERRACES (east), FOUNDRY /
  WESTFIELD (west). The Western Reach's three (WEST DOCKS, HARBOUR MARKET,
  MILL ROW) gained regions — they were sign-only before.
- **Everything is data.** `World.V2` at the top of `_buildPart8`
  (`districts-outer.js` tail) holds `ext`, `ring`, `blocks` (75 ×
  `[x0,x1,z0,z1,floors,material,doorFace,district]`), `towers` (4),
  `streets` (16), `plazas` (4). `tools/_v2points.js` builds the map, then
  probes loot (block interiors at y 0.70, every third roof at H+0.85, tower
  decks/cabs), spawns (street midpoints, plazas, avenue) and drop points
  (sky-clear 3 m columns) against the real colliders and writes
  `/tmp/v2out.json`. **If you add or move a block, re-run it and re-inject**
  — `verify-map` will tell you if you forgot.
- `block()` in `_buildPart8` is the Reach's vocabulary with one change: the
  floor slab is INSET by the wall thickness (a full-footprint slab put its
  four side faces in the wall planes — 300 coplanar pairs). The stair climbs
  the north wall eastward; a landing bridges onto the roof.
- District signatures are plain `seg/box/cyl` props: tanks + pipe rack
  (Refinery), gasometer + valve yard (Gasworks), chimney + slag yard
  (Foundry), crusher + stepped terraces (Quarry), quay + two cranes +
  container stack (Southport), bandstand on a green with hedges (Commons),
  pitch with goals (Westfield), river plane + promenade wall (Terraces),
  container yard (Cannery), concrete berms (North Ridge). `verify-props`
  reads box support only — a prop standing on a `cyl` reads as floating; the
  bandstand deck is a box for that reason.
- `world.js`: ground slabs to x −290..230, z ±230 (the tunnel trench hole
  kept); skyline r 345–385; `_buildPart8` called after `_buildPart7` with
  `bus` added to `T`.

### Rendering: the following shadow frustum

`world.js lighting()`: the sun's ortho frustum is ±100 m, near 20 / far 320,
`normalBias` 0.030. `World.followSun(x, z)` — called every frame from
`game.js` camera step — moves `sun.target` and `sun.position` (160 m along
`sunDir`) to the camera, snapped to the shadow texel (`2·SH / mapSize`), and
returns early when the snap has not changed. Texel 0.049 m at 2048 (v1.1 was
0.119 over a fixed ±122). `Quality.setSun` still owns `mapSize` per tier.

### One train, four halts

- `CFG.TRAIN.urban`: waypoints `[[-270,-210],[210,-210],[210,210],[-270,210]]`,
  fillet 14, speed 30, dwell 3, brake 75, accel 95. `stops`: head at
  `sAtWaypoint(i) + offset` with offsets 250.85 (N/S) / 220.85 (E/W) = straight
  midpoint + half a train (24.85), so the train is centred on each halt.
  `stations: [{id, name, side:'N'|'E'|'S'|'W', c}]` — `c` is the platform
  centre along its straight. `stationAt`/`stopOffset` kept for old readers.
  `TRAINS.urban = [TRAIN.urban]`; **TRAIN2 is gone**.
- Halt builder (`_buildPart6`, "THE HALTS (v1.0l, rebuilt v2.0)") is
  track-relative: `P(a0,a1,y0,y1,w0,w1)` with `w` = distance from the
  centreline toward the city, `TRK = {N:-210,S:210,E:210,W:-270}`. Deck
  1.05 high, w 2.2..4.9, 52 m long, steps at both ends, shelter roof at 3.95
  (clears the coach roof 3.75 by 0.2), bench, name board, lamp.
- Riding at 30 m/s (`train.js floorAt`, `controller.js`):
  - the rigid carry is consumed ONCE per train pose (`c.carried`), so a
    controller frame without a train frame no longer applies a stale delta;
  - stale-pose limit 4 → 9 m, yaw 0.6 → 0.9 (a 250 ms hitch at 30 m/s moves
    a coach 7.5 m; an uncarried rider lands on the road behind a train that
    left — fatal by the v1.0g rule);
  - `high` block results: a player at deck height (feet ≥ FLOOR − 0.5) who
    walks into the coach wall is pushed to 2.35 m (onto the deck edge, 2.2)
    instead of 1.9 (the gap); and the step-board strip (HALF_W..+0.6) is a
    wall at deck height except at the doors, so the deck-to-body gap cannot
    be walked into.
- `verify-train` (57/0) now asserts: loop 1,700–1,850 m; head/tail centred on
  the north halt; lap 70–110 s; one stop per side against `TRK`; each deck
  spans the whole train; cruise 30; brake/accel sized for speed; single
  train; the swept four-car envelope meets no collider; every halt shelter
  roof ≥ 3.95; riding from the road is refused, from the deck at a door
  boards, from the deck mid-coach stays on the deck.

### The helicopter

- `CFG.HELI`: alt 80, speed 22, returnSpeed 24, routeN 22, legMin/Max 90/240,
  `routeInset` 24, fuelSec 120, **fuelWarnSec 30, crashSec 3.2**, climbSec 10,
  landSec 10. `heliRoute(cfg, seed)` wanders a BOX (`heliRouteBox` =
  `MAPS.urban.ext` inset) from the pad, first leg toward the box centre.
  `heliCrashPose(cfg, from, t)` falls from a frozen pose with drift and roll;
  `phase 'crash' | 'wreck'`, y clamped to `padY`.
- Server (`server/lib/heli.js tickMachine` 'flying'): `fuelLeft` computed
  from `fuelStart`; at ≤ fuelWarnSec → `heliFuel {idx, left, riders}` once
  (`h.fuelWarned`); at ≤ 0 → `crash()` (state 'crash', `crashFrom`, toast).
  In 'crash', after `crashSec`: every listed rider gets
  `applyDamage(room, q, 999, id, 'helidown', false, true)`, `heliBoom
  {crash:1, by:null, byName:'Out of fuel', n}`, then `leave()` schedules the
  respawn. **No auto-return exists**; `goHome()` remains only for an empty
  machine (last rider bailed). Pad refuel (`refuelUntil`) stays for a
  Q-landing. `riderShielded` (`combat.js`) and `nearestMachine` include
  'crash'; `bail()` is allowed while crashing.
- Client (`environment/heli.js`): `inAir()` includes 'crash';
  `computePose` uses `heliCrashPose`; `update` rolls to `pose.roll`, pitches
  down, spins the rotor slow, emits a smoke puff every 120 ms (`crashFx`);
  the sign reads GOING DOWN. `onFuel(d)` → `AudioSys.fuelSiren(aboard)`
  (four two-tone cycles, 0.34 aboard / 0.10 ground) and a HUD hint for riders.
  `net.js` wires `heliFuel`.
- `verify-heli` 113/0: route inside `ext`; climb ≤ 1.2 m/0.1 s at alt 80;
  fuel → siren once (28–30 s left, naming the rider) → 'crash' → rider alive
  while falling → dead at impact → `heliBoom {crash:1, n:1, by:null}` →
  machine gone until respawn → fresh machine on the pad.

### RPG-L homing

`WEAPONS.rocket`: `homing: 1, lockRange: 130, lockTurn: 4.5, projSpeed: 46`.
`weapons/system.js` fire path: `Heli.lockTarget(o, w.lockRange)` returns a
machine only within that range; if found the projectile is `kind:'seeker'`
with `lockIdx` and `turn`; otherwise a plain rocket and a toast "No helicopter
within 130 m · unguided". `updateProjectiles` steers seekers with
`p.turn`. Two hits down a machine (`HELI.rocketDmg` 2000 on 4000). SEEKER-9
keeps `lockRange` 320, `lockTurn` 3.0, projSpeed 40.

### Snipers

`legs: 1.0` on `sniper`, `kar98`, `awm` — any unarmoured hit is 100. Vest
(body) and helmet (head) soak as before (`combat.applyDamage`). `fireRateOk`
uses 0.35 of the rpm interval for `scope === true` weapons (0.55 otherwise).

### Loot

- `LOOT_ITEMS`: floor = bandage/health/medkit, ammo, armor1-3, helm_1-3,
  att_extmag, mine, molotov, emp, shield. Crate-only (`drop: 1`) = every
  weapon (`wpn_*`), all other attachments, drone, visor, c4. Retired =
  energy, painkill, wpn_sniper, garand, k98w, bow, arrows. **strike_key and
  remote are deleted.**
- `LOOT_WEIGHTS.h`: empty 0.18 / c 0.48 / r 0.26 / l 0.08 (interior points
  pay better; there are fewer of them). `g` weights kept for other maps.
- `LOOT_POINTS`: 245 — 133 kept from v1.1.2 (every 'g' removed, 'h' thinned
  to one per 9 m, all 32 's' kept) + 112 generated for the Outer City
  (interiors, every third roof, tower decks/cabs).
- `AIRDROP`: periodSec 60, fallSec 4, **itemTtlSec 60, crateTtlSec 60**, 46
  points (10 core, 4 ring, 4 reach, 28 outer), **count 5** draws without
  replacement from `exoticPool` only (weapons listed twice), no guaranteed
  filler. `weaponPool/attPool/extraCount` kept for old readers; `loot.js
  dropCrate` reads `exoticPool` only, filters retired/bigOnly-on-arena/special.
- Server `loot.js`: `plantRemote`/`placeStrikeKey` and the `strikeKey`/
  `remote` grant branches are gone; expiry default 60 s.
- Client `pickups.js` (the performance rewrite): `ITEM_MAT` (one
  MeshLambertMaterial, vertexColors) + `templateFor(t)` (one merged
  BufferGeometry per item type via `mergeParts`, colours baked) + shared
  `RING_GEO`/`RING_MAT[rar]`. An item is a Group with TWO meshes and owns
  nothing disposable (`freeGroup` is a no-op by design). `update()` bobs/spins
  only items within `ANIM_R2` (70 m²… i.e. 70 m) of `PlayerCtl.pos`,
  re-sorted every 250 ms. Crates: `CRATE_GEO` shared, beam 60 m tall
  (`BEAM_GEO`), 3 smoke sprites from a cloned `SMOKE_MAT`; at
  `crateTtlSec` the crate group, beam and smoke are REMOVED and their owned
  materials disposed (`crates.splice`). Mines share `MINE_GEO/MINE_MAT`;
  drones share `DRONE_GEO`.

### Netcode (the jitter fix)

- Server snapshot loop: `packet.t = now() − room.startedAt` (six digits).
- `net.js sampleTimeFor(n, arrival, tServer)`: `off = arrival − t` per packet
  into a 45-slot ring; window minimum `mn`; `offBase` steps DOWN to `mn` at
  once, creeps UP at ≤ `OFF_UP` 30 ms/s; a `t` that jumps back > 5 s (new
  match) resets. Returns `offBase + t`. The tick-count path stays for a server
  without `t`. `jitterTarget()` recomputes the p95 every 250 ms into a
  preallocated buffer instead of slicing and sorting 90 floats per frame.
- `verify-interp` 32/0, `verify-netcodec` 31/0, `verify-bandwidth` 25/0
  unchanged (the field is small).

### Audio

`audio.js out(node, pos)` returns the chain tail (or `null` when too far /
over `VOICES` 48). `noise()` and `tone()` call `finish(src, [nodes], tail,
positional)` which disconnects the whole chain in `src.onended` and
decrements `live`. `fuelSiren(aboard)` added and exported.

### FX

`effects.js`: `tracerMat` shared (no per-shot clone; 90 ms, no fade),
`puffMat`/`holeMat` shared (puff grows, hole shrinks away — scale, not
opacity). `nukeStart/nukeEnd/heliStrike/rocketStrike` deleted.

### Removed wiring (for anyone grepping)

Server: `Nuke`, `Rocket` requires; `onKillStreak`/`onDeathClearStreakReward`
are no-ops; `callStrike`/`launchRocket`/`nukeStrike` handlers; `heliTimer`
teardown lines; `p.hasRemote`, `p.strikeKills`; `remote` in `lobbyPayload`.
Client: `game.js` `strikeHold`/N/hold-Z; `net.js` heliStrike/heliDone/
rocketReady/rocketLost/nuke* handlers and `launchRocket/callStrike/
nukeStrike` emitters; `system.js hasRemote/callStrike/setRemote`; `ui.js`
nuke*/rocket*/setRemoteHud/Hold; `minimap.js setNukeAim`; `index.html`
#nuke-banner/#rocket-banner/#nuke-flash/#remote-pip and their CSS
(`nukePulse` keyframe renamed `hudPulse`; still used by the zone banner).

---

## §3 THE SEAM MAP (what touches what)

- **Map extent:** `MAPS.urban.ext` → `server.js` (`st` bounds, team markers),
  `minimap.js` (WX0/WZ0/WW/WH from ext), `zoneSchedule`, `heliRouteBox`,
  `verify-heli`, `verify-zone`, `_v2points.js`. `bound` 120 stays for the core.
- **Outer City geometry:** `World.V2` data → `_buildPart8` → colliders →
  `verify-map` (loot/spawn/drop probes), `verify-train` (clearance sweep),
  `verify-zfight`/`props`/`stairs-quality`/`floaters`/`flow`. Change a block:
  re-run `_v2points.js`, re-inject the points, run those six gates.
- **Train:** `TRAIN.urban` → `trainPath` → `train.js` (client) +
  `hazards.js tickTrain` (server, the rule: aboard within 1.2 s, train > 2 m/s,
  feet < 0.45 → dead) + halt builder in `_buildPart6` (reads `stations`).
  `stops` offsets encode fillet 14 — change the fillet, recompute the offsets
  (straight length − 2·fillet)/2 + 24.85.
- **Heli fuel:** `HELI.fuelWarnSec/crashSec` → `heli.js` server (`heliFuel`,
  `crash`, 'crash' tick) → `net.js` → `Heli.onFuel` → `AudioSys.fuelSiren`,
  `UI.setHeliHint`; `heliCrashPose` shared by server `poseOf` and client
  `computePose`; `combat.riderShielded` includes 'crash'.
- **RPG lock:** `WEAPONS.rocket.homing/lockRange/lockTurn` →
  `system.js` fire path → `Heli.lockTarget(from, range)` → projectile
  `kind:'seeker'`/`turn` → `updateProjectiles`.
- **Crates:** `AIRDROP.exoticPool/count/crateTtlSec/itemTtlSec` →
  `loot.js dropCrate` (server contents) + `expirePickups` (items) →
  `pickups.js` (box/beam/smoke disposal at `crateTtlSec`).
- **Shadow:** `world.js lighting()` (`SH`, `sunDir`) → `World.followSun` ←
  `game.js` camera step; `Quality.setSun` (mapSize per tier).
- **Clock:** `server.js` `packet.t` → `net.js` 'snap' handler →
  `sampleTimeFor(d.n, tLocal, d.t)`.

## §4 VERIFICATION STATE AT SHIP

- **44 offline gates green, 3 documented reds** (§1b). Rewritten to new
  contracts: `verify-heli` 113/0, `verify-train` 57/0, `verify-zone` 44/0,
  `verify-protect` 29/0. Re-recorded as a decision with itemised reasons in
  the files: `verify-fingerprint` 64/0 and `verify-untouched` 12/0
  (colliders 5160 → 9283, draws 99 → 101, tris 158,912 → 271,052, casters 62
  and lights 7 unchanged, minimap 296 → 583, loot 437 → 245, spawns 66 → 94,
  drops 14 → 46), `verify-batch` 19/0 (tris 168k → 280k, minimap 320 → 620).
  Fixed at the geometry: `verify-zfight` 2/0 (154 → 150 budget met by the
  floor-slab inset and moving the quarry terraces, river and pitch off the
  streets), `verify-props` 2/0. `verify-map` 1672/0 (every one of 245 loot,
  94 spawns, 46 drops probed). `verify-attach` 117/0 and `verify-barrel` 57/0
  had crashed since v1.0x (stub lacked `clone`) — the stubs gained `clone`.
  `verify-lighting` 27/0, `verify-collision` 49/0, `verify-build` PASS with
  Metro's lines removed.
- **Live against a running server:** `test.js` — **311 passed, 0 failed**,
  server log clean (one boot line). Phases 1–20 with the rocket-ladder phase
  removed, Phase 18's remote steps replaced by absence assertions (no remote,
  no strike key, no weapon on the floor), the crate and floor-loot assertions
  rewritten to the exotic-only contract, metro rooms → riverside. Run it as
  `node server.js` in one shell and `node test.js` in another; it takes about
  eight minutes (match countdowns are real).
- Two working scripts are in `tools/`: `_v2points.js` (the Outer City probe)
  and `_v2pick.js` (headless template build of every item type — 51 items →
  102 meshes).

## §5 PERFORMANCE NOTE

Urban tripled in area (72,000 → 220,000 m²) for +70% triangles (159k →
271k, all static, merged, ~100 draw calls — GPU-side and cheap) and +2 draw
calls. What was cut is the per-frame and per-event churn that grew with
match time: loot ~2,000 meshes/materials → ~490 meshes on one material,
animated only within 70 m; audio chains torn down and capped at 48; FX
materials shared; crates disposed at 60 s; the jitter sort cached; the tick
clock replaced by a real one. Server-side: one train instead of two, no
Metro warm build, no strike modules, 245 pickups to sweep instead of 437.
The shadow frustum is smaller and sharper than before. Nothing new runs per
frame on the server; the one new field on the wire (`t`) is six digits.

## §6 RULES OF THE ROOM (carry these forward verbatim)

1. **Never weaken a gate** — fix at the invariant, extend with counterpart
   asserts when a rule is legitimately scoped. A budget moves only for a
   deliberate expansion, itemised in the file (v2.0: batch, fingerprint,
   untouched). When an assertion measured an accident of old numbers rather
   than a contract, rewrite the assertion to the contract and say so (§0.3).
2. **Inventory before writing** after any cut-off (grep/ls); `create_file`
   fails on existing paths; a Python edit script that never calls `write`
   silently loses everything (v2.0 lost a world.js pass this way — check
   with grep after every scripted edit).
3. **Environment:** install synchronously, check `ls node_modules | wc -l`
   = 86. **Launch detached with `setsid -f node server.js > log 2>&1 <
   /dev/null`; the suite the same way via `setsid -f bash -c '…'`; poll in
   later calls.** A plain `cmd &` or `( … &)` dies with the tool call, and
   **`pkill -f` with a pattern that appears in your own command line kills
   your own shell** — kill by PID from `pgrep -x node`. Container resets
   between turns; disk persists.
4. **Every timer a room owns dies in the teardown** (destroyRoomIfEmpty +
   endMatch) — bmTimer included; heliTimer is gone with the strike.
5. **WEAPON_ORDER is wire format** — append-only, forever.
6. **Every new lobby control needs four things:** cache, sync, read, LISTENER.
7. **Suite phases assert global lobby counts** — never run probes against a
   server while the suite is mid-run.
8. **Version bump per release; CHANGELOG in lessons-learned style; HANDOFF
   carries §0/§1/§1b/§6 forward.**
9. **Reused geometry re-runs the gates that excuse its original.**
10. **New material × cast combinations are draw calls.** Reuse (material,
    castShadow) pairs already in the batch list.
11. **Area weapons are server modules with a tick and a teardown** (mines,
    drones, hazards). Decide hostility per tick, never at launch; read
    `Bots.buildColliders` for "can the fire see him" — never a client claim.
12. **Bot Mode is not a feature to restore.** Nor Metro. Nor the strikes.
13. **A moving rider is judged with lag in mind, and one-shot server state
    survives the map rebuild.**
14. **The train's corridor is part of the map contract.** Anything within
    3.6 m of `CFG.TRAIN.urban`'s centreline, or under 4.35 m over it, breaks
    `verify-train`'s sweep. The corridor is now the PERIMETER boulevard.
15. **Every per-event allocation needs a disposal path; every per-frame cost
    needs a distance or a cap** (§0.2). Before adding a material, ask which
    existing one it can be.
16. **Two machines agree on time only through a timestamp** (§0.1). Never
    reconstruct a clock from a count and an assumed period.
17. **`verify-props` reads box support only.** A prop resting on a `cyl`
    reads as floating; give it a box to stand on.
18. **The Outer City is data.** Move a block in `World.V2`, re-run
    `tools/_v2points.js`, re-inject, run the six geometry gates. Never hand-
    type a loot point.
