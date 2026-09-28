# Urban Strike — Project Handoff (v1.1.2 · internal lineage v15.0)

**Upload this file plus `urban-strike-v1.0.zip` into a new chat.** Read this
file first, then unzip and inventory before writing anything.

The release is NAMED v1.0 at Rahul's request. `package.json` reads `1.0.0` —
that string is the `?v=` cache-bust key, so the first load after deploy fetches
every asset fresh. Code comments written for this release are tagged `v15.0`
(the internal lineage continues from v14.0.1); both labels mean this release.

---

## §0 THE LESSON THIS RELEASE ADDS

**A port is not a copy.** The South Terminal control tower was moved onto four
new sites by translating its numbers exactly, and two of its excused defects
came with it — its upper flights start over the open well ("floating", tolerated
by name in verify-stairs-quality) and its flights "arrived" on the top face of
their own wall by 0.95 m against a 0.95 m limit, a rounding coin-flip that
came up heads on the east tower and tails on the north. Copying an excused
defect four times is four new defects, and the gate said so. Both were fixed at
the geometry (a sub-1 m² stair-foot plate the stairwell cutter cannot see, a
2 m landing whose centre clears the step-off) rather than excused four more
times. **When you reuse geometry, re-run the gates that excuse its original —
an excuse is scoped to one coordinate, and the port is at another.**

Second, smaller: **frozen harness lists bite every time a file is added or
removed.** Rural's removal touched thirty gate files' script lists; the outer
ring was appended to `districts-outer.js` specifically so it could not fall out
of any of them. Prefer append-in-place to a new file until the lists are
generated from `index.html`.

## §1 OPEN ITEMS (owed, in priority order)

1. **PLAY-VERIFICATION of v1.0 by a human: none yet.** Fifteen changes, every
   one proved headlessly and against a live server, none witnessed in a
   browser. Watch specifically: the helicopter flyover and banner timing; the
   shield slab on remote avatars (event-driven, not in the snapshot — a late
   joiner catches up on the next roster push, ≤4 s); the EMP shockwave and
   whether refused-and-kept reads as intended; the deck stairs in Killhouse at
   15 players; the ring boulevard's sightlines with the old wall gone.
2. **Killhouse cap 15 is a design call, not a measurement.** 52 x 88 m with the
   deck is ~4,600 m² — the same density Bazaar had at 8. If it plays as a
   blender, lower `MAPS.killhouse.maxPlayers`; the geometry stands either way.
3. **The strike remote's hold-Z is 1.2 s** (`GEAR.remote.holdSec`). Rahul asked
   for "press Z"; Z is also the interact key, so a tap interacts and a hold
   calls. If a tap is wanted after all, the hold length is one number — but a
   one-shot that deletes every enemy on the map should not be a tap.
4. **The visor reading.** "It should only show teams locations" was read as
   "the other team's", i.e. enemies only — team-mates were lighting up in the
   same hostile red. `CFG.GEAR.visor.showAllies` reverses it in one word.
5. **Mine ration counts refills only.** Loot mines (AP Mines x2 on the floor)
   are not rationed. If Rahul meant a hard 20-per-match cap on USE, add the
   check at `Mines.place` — `p.mineIssued` is already the counter to read.
6. **Carried from v14: difficulty balance is arithmetic not playtested; bm
   third-person guns wear donor silhouettes (gear slots now get a hand-held
   case); bm_team beyond 2 humans never witnessed.**

## §1b GAP REGISTER (documented, accepted)

- Pre-existing gate reds, unchanged and explained in their files:
  `verify-climb` 16 flights (Old Town Terrace ×5, Colony ×8, Airport,
  Eastgate, Construction — the 45° flights the v8 run/rise note explains; none
  in v1.0 geometry) · `verify-arch` 1 (one roof that looks climbable refuses)
  · `verify-access` 45/1 (north block A). `verify-cover` went GREEN with Rural
  gone. Total board: 44 offline gates green, 3 documented reds.
- The original South Terminal tower keeps its two "floating" excusals; the
  four ring copies do not need them (see §0).
- `verify-stairs-quality` and `verify-climb` measure urban and metro only;
  the Airfield and Riverside towers are the same `World._towerAt` geometry
  as Urban's four, which those gates pass, but are not measured in place.
- **BOT MODE IS REMOVED AND STAYS REMOVED.** Rahul asked for this in v10.9
  ("remove every trace of it") and again in v1.0 ("I thought I asked to remove
  the bot mode completely — it came back"). v10.9 hid it behind a switch and
  v14.0 built a second product on the retained engine. Build 4 deleted both:
  MODES `bots`/`co*`/`bm_*`, Blacksite, `botmode.config.js`, `botmode.js`, the
  bm_ weapons, the welcome-rail door, the loot walls, the server wiring, the
  bot phases and gates. `server/lib/bots.js` is a GEOMETRY HARNESS (colliders,
  LOS, stairs) that ~30 gates and the Intel/hazard checks require by path; its
  header says so. There is no switch to flip and nothing to "bring back later".
  If a future brief asks for AI opponents, that is a NEW design from scratch,
  and it should be asked twice before it is started.

## §1c BUILD 2 — THE ARSENAL (same release, six more items)

Added after the first v1.0 package, tagged `v1.0b` in code:
- **Drop keys K/L** (`Weapons.dropCurrent/dropSight` → `dropItem` → `lootAdd`).
- **Rocket ladder** on big maps (`server/lib/rocket.js`; N; 5/7/10/+5 per
  life; instant random-hostile kill + 6 m splash; refused-and-kept).
- **Drone bounty** (`drones.js damage()` → `server.js onDroneBounty`: +1 kill
  and a drone in the bag for a HOSTILE shooter).
- **Frag two bands** (`THROWS.frag.killRadius/outerDmg/selfRadius/fxRadius`;
  `weapons/system.js explosionDamage`; bots.js's copy of the rule left with the bots).
- **C4** (gear slot; `plantBomb` → `hazards.js plant/tickBombs`; "inside a
  building" = a collider over the head within `roofScan`, within `reach`).
- **Flamethrower** (`WEAPONS.flamer` `flame:1`, hard reach; `server.js 'hit'`
  flamer branch → guaranteed kill + `hazards.js ignite`; zone kills hostiles
  with LOS for `dur`; loot `cls:'h'` filter in `loot.js`).
Open on balance, all single numbers: `GEAR.fire.radius` (20 m instant-kill
zone), `THROWS.frag.killRadius` (20 m, and the frag is not big-map gated —
on Killhouse that is a quarter of the map), `GEAR.c4.reach` (18 m). None of
the six has been seen in a browser by a human. Live at ship: `test.js` 317/0
(Phase 19), `verify-client` 66/0, `probe-net-degraded` 10/0 (the probe now
measures travel relative to the first snapshot — see CHANGELOG).

## §1ac BUILD 29 — THE WALL CHECK, REVERTED (tagged v1.1.2) — VERSION 1.1.2

The v1.0z LOS check and its US_TEST seam are removed; `NET.hitTolerance` 4.0,
`historyMs` 1200 restored. The §1z TEST SEAM note no longer applies — run the
suite against a plain server. If "died behind the wall" comes back as a
complaint, the honest lever is `historyMs` (shorter = less lag forgiveness for
everyone), not geometry.

## §1ab BUILD 28 — ONE POINT, IN THE FEED (tagged v1.1.1) — VERSION 1.1.1

`combat.js`: the train credit block exists ONCE; `victim.trainCredit` rides the
`death` event as `credit`; all train toasts removed (hazards.js). RULE 17: a
`str.replace(old, new)` on a line that recurs in a file must be checked for
count before it is applied — three copies of a scoring block is exactly how
"3 points" happens.

## §1aa BUILD 27 — THE WESTERN REACH (tagged v1.1) — VERSION 1.1.0

`MAPS.urban.ext` {x0:-180,x1:120,z0:-120,z1:120}; `bound` 120 = the core.
Readers of the extent: server st bounds, minimap (WX0/WZ0/WW/WH, OX/OZ),
verify-map/verify-spawn-geometry (`inExt`). Builder `World._buildPart7` in
districts-outer.js (`block()` helper: three facades + door pieces + outside
stair + landing). `World._towerAt(T,x,z,mir,floors)` — Urban 5, medium 3.
Train 2 waypoints west at −170; speed 10.7592, tOffset 34. signClear refuses
the ring lanes and the new west boulevard. AUDIT ITEM: the props/z-fight
budgets were raised for the Reach — walk `PROPS_ALL=1 node tools/verify-props.js`
once and tighten. Known: zone circles and helicopter routes stay in the core.

## §1z BUILD 26 — RAHUL'S TEN (tagged v1.0z) — VERSION 1.0.12

TEST SEAM: run the live suite against `US_TEST=1 node server.js`; the LOS
check is then off except in rooms created with `settings.los: true` (rooms.js
copies it only under US_TEST). Never set US_TEST in production. Gate
baselines moved this build: verify-drone (3-4 hits rule), verify-untouched
(urban loot 414).

`HELI.hp` 4000/`rocketDmg` 2000/`fuelSec` 120. `TRAIN.speed` 10 (brake 28,
accel 36), `TRAIN2.speed` 9.425, `tOffset` 33 — retune both together
(/tmp/tune.js pattern). `THROWS.frag.count` 5. `GEAR.drone` hp 110, speeds up,
lockSec 0.6. `AIRDROP.periodSec` 100, exoticPool without helm_3/medkit. 16
loot points removed (heuristic: elevated ≥3 m with no stair top within 26 m at
height). `NET.hitTolerance` 2.5, `historyMs` 250, LOS check in server.js
'hit' via `Bots.segmentBlocked` over the shooter's last 250 ms of positions.
FX: `sparkGeo` shared, `userData.sharedGeo/sharedMat` skip disposal.

## §1y BUILD 25 — AIR TO AIR 2x (tagged v1.0y) — VERSION 1.0.11

`HELI.airToAirMult` 2; `heli.js hit()` multiplies when `machineOf(shooter)` is
another airborne machine (`a2a` in the ack/heliHp). Client `Heli.rayHit`
skips the ridden machine only; system.js no longer refuses the hull test for
riders.

## §1x BUILD 24 — TWO MACHINES, FUEL, 5000 HULL, SEEKER (tagged v1.0x) — VERSION 1.0.10

`CFG.HELI`: `pads[2]`, `secondSpawnSec`, `fuelSec`, `refuelSec`, `hp` 5000,
`dmgWeapon`/`dmgType`, `rocketPct`. Server `heli.js`: `room.helis[]` with
`room.heli` = machine 0 (alias getter); per-machine `poseOf`, `tickMachine`
(fuel → goHome; landed → refuelUntil; first lift-off books machine 1),
`board(room,p,idx)`, `hit(room,p,w,idx)`, `emp` fells all in range. Client
`heli.js`: `makeHeli(idx)` + aggregate `Heli` (`lockTarget` for the SEEKER,
`machines()`); `set()` takes `snapshot.all[idx]`. `WEAPONS.seeker` (homing,
lockRange), `WEAPON_ORDER` appended after c4, viewmodel `models.seeker`. UI:
`#heli-rider` left bar. Knobs: `HELI.dmgWeapon`, `rocketPct`, `fuelSec`,
`refuelSec`, `secondSpawnSec`.

## §1w BUILD 23 — THE TRAIN SCORES, TALLER COVER, FLAT REDEPLOY (tagged v1.0w) — VERSION 1.0.9

`combat.js applyDamage`: train deaths credit the opposition (2 sides: the
other; N sides: `victim.lastHitByTeam` within 15 s). Killhouse barriers 1.50,
crates +0.3. `MATCH.respawnLadder = [[Infinity, 5]]`.

## §1v BUILD 22 — PROTECTED RIDERS, EMP, MINES, STRIKE KEY, Q, MERGE (tagged v1.0v) — VERSION 1.0.8

`combat.js riderShielded` (RIDER_PASS helidown/helifall/zone). `heli.js
destroy(room, by)` + `emp(room, p)` (`HELI.empRange` default 80); server.js
useEmp calls both. `mines.js blast(room, p, pos, r)`; client `detonate` sends
`blast`. Strike Key: `LOOT_ITEMS.strike_key`, `Loot.placeStrikeKey` at
matchStart (Urban), grant sets `p.strikeKey/nukeArmed`, `nuke.js` bypasses the
small-map gate and uses R=1e6 for a key strike. Q tap: `Weapons.dropAttachment`
(game.js qDownAt < 220 ms). `World.mergeGroup(g, skip)` used by train.js and
heli.js. Gate: verify-protect.

## §1u BUILD 21 — RESPAWNS, SEATS, QUIET, LIGHTER (tagged v1.0u) — VERSION 1.0.7

Zone modes: `lives` removed; `Zone.spawnFilter` in `pickSpawn`. Heli:
`Heli.seatFor(id)` (net.js draws listed riders there), `rayHit().opening`
(door band: |z|>1.1, 1.42<y<2.58, -1.85<x<1.95 hull-local) gates player hits
in `fireHitscan`; toasts for boarding/lift-off/landing removed (`heliNotice`
is state only; `UI.setHeliHint`). Loot: `AIRDROP.itemTtlSec` 150,
`Loot.expireDrops` in the tick, `pickup{gone,expired}`. Zone DOM throttled,
`ZONE.wallHeight` 40, 64 segments. If late-match lag persists: profile draw
calls (renderer.info) — next suspects are remote name-tag sprites and the
per-frame `UI.aliveCount` filter (gone in respawn modes).

## §1t BUILD 20 — ONLY A ROCKET (tagged v1.0t) — VERSION 1.0.6

`HELI.dmgClass` all zero, `rocketDmg` 300 (3 hits). `system.js
updateProjectiles`: a rocket meeting `Heli.rayHit` detonates and sends
`hitHeli('rocket')`; the hitscan hull test is FX-only. `heli.js hit()`: rocket
claims rate-limited to one per 1.8 s per shooter (`lastHeliRocketAt`). RPG-L
stays legendary airdrop loot (`AIRDROP.exoticPool`). Knob: `HELI.rocketDmg`
(and `hp`) if three hits feels wrong in play.

## §1s BUILD 19 — THE HULL THAT ATE THE BULLETS (tagged v1.0s) — VERSION 1.0.5

`system.js fireHitscan`: hull test skipped when `Heli.isRiding()`; player hits
(`hit.type === 'player'`) beat the hull; `Heli.rayHit` returns null for an
origin inside the box and refreshes `matrixWorld`. RULE 16: a hit-test
exemption must name a field that actually exists on the hit object — the old
`hit.remote` never did, and no gate read the field, so it silently ate shots.

## §1r BUILD 18 — THE AUDIT (tagged v1.0r) — VERSION 1.0.4

- `CFG.TRAINS.urban = [TRAIN.urban, TRAIN2.urban]`; `train.js` is a factory
  (`makeTrain`) under an aggregate `Train`; hazards tick every train;
  `Bots.pathFrom` builds track 2's path. Retune `TRAIN2.speed`/`tOffset` if
  EITHER train's route or stops change (/tmp/tune.js pattern: equal laps, OBB
  scan of offsets) — verify-train enforces it.
- Rails: `layRails(path, skipStation)` chords; per loop.
- Dress colours: `rooms.js colorFor/recolor/cleanHex`; `settings.dressColors`
  `{teamId|all: '#hex'}`; UI `.team-dress` pickers, `#lobby-dress`.
- Audit findings: (1) the radar (small minimap) does not draw the trains or
  the helicopter — only the M map does; (2) the three halts are gone and would
  need the 2.6 m inner strip cleared at three sites to return; (3) nothing
  else out of alignment was found: zone overlays, helicopter HUD/prompt/sign,
  kill-feed tags and death-screen causes all read from the shared config.

## §1q BUILD 17 — FLIES FREE, Q LANDS IT (tagged v1.0q) — VERSION 1.0.3

Per-flight seeded route: `CFG.heliRoute(seed)` (mulberry32, wandering, collinear
pad); `heliPoseAt` cruises the loop endlessly; `heliReturnPose(from, t)` the Q
return. Server `heli.js`: states pad→flying→returning→landed→gone; `land()` on
Q, `board()` on a landed rider RE-LAUNCHES (relaunch:true), respawn timed from
`leave()`. Route built via `Bots.pathFrom(waypoints, fillet)` in the harness vm.
Fall net tracks `h.trail` (1 s of head positions), needs two ticks. Client
`heli.js` builds the route from `state.seed`, Q = `landRequest`. Shooting works
through the ordinary hit path (the rider is a normal shooter). Knobs:
`HELI.routeN/legMin/legMax/routeBound/speed/returnSpeed/respawnSec`.

## §1p BUILD 16 — NOBODY FALLS WITHOUT A REASON (tagged v1.0p) — VERSION 1.0.2

The fall is the rider's reported jump (`heliBail` → `Heli.bail`), never a
position comparison; `fallen()` is a 12 m / 25 m sanity net needing two ticks.
Client: a listed rider gets `lock: true` from `floorAt` and the controller
holds them to the floor regardless of gap. RULE 15 (the general form of 13):
**never decide a rider's fate from position agreement between two clocks and a
network; decide it from an event the rider's client sends.**

## §1o BUILD 15 — THE HELICOPTER, PROPERLY (tagged v1.0o) — VERSION 1.0.1

Boarding grace (`h.boardedAt`, 2.5 s), climb grace (fall test after 2.5 s),
seat from the Z ack, `PlayerCtl.platformSrc` ('train'|'heli') for the hints,
death-screen causes per tag, `ASSET_STAMP` = version + sha1(public/**.js,css,
html) in every asset URL. RULE 14: never ship a live client change under an
unchanged asset URL — the stamp now guarantees it, so the rule is automatic.

## §1n BUILD 14 — STATE SURVIVES THE REBUILD (tagged v1.0n)

`heli.js` keeps `pending` (last `heliState`) across `init/dispose`; `init`
re-applies it; `Heli.clear()` on backToLobby. RULE: anything the server tells
the client once (matchStart payload fields) must survive `buildWorld` — the
client rebuilds the map AFTER applying the payload. Zone's meshes live on the
outer scene and survive `World.reset`; the train needs no server state.

## §1m BUILD 13 — Z TO BOARD, THE PAD BOARD (tagged v1.0m)

`heli.js` server: `board(room,p)` seats/unseats (SEATS, `p.justSpawned`),
`fallen()` = feet < floor−3 or 6.5 m off (lag-tolerant), riders filtered to
the cabin at lift-off; `boardHeli` handler. Client: `canBoard/board/onSeat`,
`#heli-prompt`, `buildSign/updateSign` (canvas board, live countdown),
`state.liftIn`. `HELI.respawnSec` 180. Game.js: Z boards before pickup/lift.

## §1l BUILD 12 — ZONE SQUADS, FOUR HALTS, THE HELICOPTER (tagged v1.0l)

- Zone: `zsq2`/`zsq3` (cat `zone`, squads, lives 1, mapLock urban).
- Train: `CFG.TRAIN.urban.stops` + `stations`; `trainSchedule(cfg, L, stopsS[])`
  chains legs; `trainStops(cfg, path)`; halts built in `_buildPart6`.
- Helicopter: `CFG.HELI` (+ `heliPoseAt`, `heliDamageFor`); the pad waypoint is
  COLLINEAR with its neighbours so the filleted route passes over it
  (`World.trainPath` now handles straight-through waypoints). Server
  `server/lib/heli.js` (pad → flying → landed → gone; hits; falls; respawn) via
  `Bots.trainPath('urban','heli')`; client `environment/heli.js` (mesh, banking,
  cabin floor through `game.js platformProbe`, `bail()` on Space, `rayHit` in
  the hitscan); `hitHeli` handler; HUD `#heli-hud`. Gate: verify-heli.
- Balance knobs: `HELI.hp`, `HELI.dmgClass`, `HELI.respawnSec`, `HELI.speed`,
  `HELI.alt`. Unseen in a browser, like every system before it.

## §1k BUILD 11 — SOUND AND COUNT (tagged v1.0k)

Zone banner appends "N ALIVE" (from the last roster, `UI.aliveCount`); each
bleed tick plays a heartbeat (`AudioSys.zoneTick`). The train has a horn when it
pulls out and a positional rumble every 0.7 s within 60 m while moving
(`train.js trainSound`, `AudioSys.trainRumble/trainHorn`). No gameplay change.

## §1j BUILD 10 — URBAN ZONE (tagged v1.0j)

Mode `zone` (cat `zone`, lives 1, `mapLock: 'urban'`). Config: `CFG.ZONE`,
`zoneSchedule(rnd, bound)`, `zoneCircleAt(sched, t)`, `zoneInside`. Server:
`server/lib/zone.js` — `start` (roll at matchStart, shipped in `matchStart.zone`
and every reconnect ack), `tick` (10%/s bleed, notices), `cratePoints` (loot.js
asks). Client: `environment/zone.js` (wall, next ring, banner, red edge),
minimap overlays, `zoneNotice`. Map lock: rooms.js makeRoom + server.js
updateSettings + ui.js disables the select. Gate: verify-zone. Balance knobs
all in CFG.ZONE (r0/rFinal/holdSec/dmgPct/finalCenterMax). Spectating after
elimination is the existing Last Stand path (`onLocalDeath` → `startSpectating`
on `out`), so a dead Zone player watches the last circle.

## §1i BUILD 9 — THE WHOLE COMPARTMENT IS A WALL (tagged v1.0i)

`train.js floorAt`: roof / inside (interior or a drifted rider) / step (door
zones only) / block (wall thickness from outside, below-floor body, the
locomotive). `controller.js`: inside results are carried and clamped EVERY
frame (airborne too) with a ceiling at roof-0.15; block pushes to the nearest
face. Ring-district signs at ±99.6 (inner boulevard edge).

## §1h BUILD 7 — LEAVING A MOVING TRAIN IS FATAL (tagged v1.0g)

`hazards.js tickTrain`: `q.trainAboardAt` while riding; aboard-within-1.2 s +
train > 2 m/s + feet < 0.45 → kill, tag `train`. Platform deck (1.05) is not
ground. `spawnPlayer` clears the memory. Gate: verify-train (5 counterparts).

## §1g BUILD 6 — THE TRAIN HOLDS ITS PASSENGERS (tagged v1.0f)

- Rider carry is RIGID (prev pose → new pose per car, `train.js floorAt` +
  `controller.js`), with side AND end walls; stale-pose guard.
- Server kills what the moving train hits: `hazards.js tickTrain` via
  `Bots.trainPath(mapId)` (path evaluated in the harness vm) and the shared
  `CFG.trainSchedule/trainHeadAt/trainCars`. Tag `train`, no killer.
- Outsiders are pushed out of a car body (`block` result); doors are the way in.
- If the train's path or schedule ever changes, BOTH `train.js` and the server
  read the same config functions — change `CFG.TRAIN` / `world.config.js`, not
  either consumer.

## §1f BUILD 5 — THE TRAIN, THE TALL OPERATOR (tagged v1.0e)

- **Train:** `CFG.TRAIN.urban` (waypoints, fillet, speed, dwell, station
  waypoint + stopOffset) → `World.trainPath(cfg)` (filleted, arc-length
  parametrised; shared by the rails in `districts-outer.js _buildPart6` and by
  `src/environment/train.js`). Schedule is a pure function of
  `serverNow - match.startedAt`. Rider = `PlayerCtl.setPlatform(Train.floorAt)`:
  the controller snaps/carries/clamps AFTER static resolution. Gate:
  `tools/verify-train.js` — its swept-envelope clearance test is the thing to
  re-run after ANY Urban geometry change near the boulevard, the S-bend
  (x -6..18, z -103..-88) or Track 2. The cover scatter in `_buildPart5` skips
  3.6 m either side of the centreline. Known limits: coach walls stop bodies,
  not bullets; remote riders lag ~0.2 s; roof under the footbridge (4.35 m) is
  prone-or-swept. The M map draws the cars as gold bars from the same pose
  (minimap.js drawFull). Not yet: sound for the train.
- **Tall operator:** `avatars.js RIG` 1.62/1.68; capsule untouched; body hit
  box spans the rendered body (`weapons/system.js castRay`); doorway headers
  lifted at build by `World._liftLintels` (world.js) — a post-pass in the
  stairwell cutter's style; `_lintelStats(true)` before a build returns the
  list it lifted. If a doorway is still low on some map, it failed one of the
  proof tests (no jamb and under 3 m, or no floor 1.9-2.55 m below).
- **Strike kills:** `p.strikeKills` in combat.js; nuke/rocket read
  `streak - strikeKills`.
- **Hold breath:** `GEAR.breath`; `Weapons.setBreath(Input.sprint)` from the
  loop; meter bar `#breath-bar`.
- Station hall: F1 1.05 / F2 4.95 / F3 8.25 / roof 11.55.

## §1e BUILD 4 — FROM RAHUL'S EIGHT SCREENSHOTS (tagged v1.0d)

- Bus helper: roof meets the glass band (was 64 cm of sky). Every bus.
- Colony 86 m rear wall → four 5 m stubs. West terrace: middle house → paved
  passage with garden wall and bin stores.
- The Ship Harbour was the root of two complaints: its 0.6 m quay deck was
  laid OVER the stadium outfield (turf buried — "make it green"), and its rust
  hull was the "orange wall". Both gone; a Training Ground (turf, pitch,
  goals, two-storey clubhouse with switchback, benches, nets) stands there.
  Stadium tiers 1.1 → 2.0 m ("a floor higher"). verify-pitch/access rewritten.
- Full map on arenas: minimap shape filter keeps thin walls and elevated decks
  on arenas (`World._buildingMap` is set BEFORE the builder runs, so
  addCollider can read the map id); the Urban road cross draws on Urban only.
- Bazaar caravanserai court filled.
- Arena redeploy ladder: `MATCH.respawnLadder` via `CFG.respawnDelayFor(map,
  deaths)` — v1.0h: 5/8/10/12 then a 15 s CEILING (Rahul: the 30 s read as unlimited) (resolved in config/index.js after the fold — it needs MATCH and
  isArena from two parts); combat.js ships `respawnSec` in the death payload;
  the client counts that down; reconnects keep the rung.
- Bot Mode removed (see §1b).
- Fingerprints/untouched re-recorded with reasons (urban, bazaar).

## §1d BUILD 3 — QUALITY TIERS (`src/core/quality.js`, tagged v1.0c)

ULTRA/HIGH/MEDIUM/LOW/POTATO: pixel-ratio cap, sun shadow-map size + bias,
texture anisotropy, shadows on/off. AUTO (default) starts at HIGH, measures 3 s
windows in-match only, steps down ≤ once/6 s under 42 fps, steps up after 12 s
of 57+ fps, ≤ once/20 s, never within 30 s of a step down, never back to a
tier it lagged at this session; remembers its tier. Wiring: `Quality.init` after
the renderer, `Quality.setSun(World.getSun())` after every buildMap (three
sites), `Quality.tick` in the loop. Pause panel: `#quality-mode`. Gate:
`tools/verify-quality.js`. NOT done (deliberately, unseen): sRGB output /
ACES tone mapping — would re-grade every hex-coloured material; do it with a
browser open. Also unseen: the actual look of ULTRA on a real GPU — expect
the 4096 map to cost integrated GPUs a tier, which is what AUTO is for.

## §2 WHAT v1.0 IS

Rahul's fifteen: six bug fixes (reconnect clock, FFA big map, visor sides,
5 s respawn, small-map mine ration, mine-kill KPI), three items (EMP Charge,
Ballistic Shield, hidden Strike Remote + helicopter), six map jobs (Rural
removed; Urban 240 x 240 with four ring districts, four control towers and a
colour pass; Killhouse rebuilt around THE DECK; Freightyard/Bazaar/Substation/
Sunset Row enlarged for 15; Airfield and Riverside given landmarks). CHANGELOG
v1.0 has the why for each.

## §3 THE SEAM MAP (what touches what)

- **Reconnect clock:** `net.js absorbMatchClock()` — token rejoin, name
  reclaim, `recovered`. Server acks already carried the fields.
- **Full map contacts:** `minimap.js drawFull` reads `MODES[mode].fullMapContacts`
  only; `world.config.js` carries it on ls/lsq2/lsq4.
- **Visor:** `net.js visorShows(r)` settled per frame in updateRemotes from
  `r.team`; `CFG.GEAR.visor.showAllies`.
- **Mine ration:** `server/lib/mines.js refillFor(room,p)` called from
  `spawnPlayer`; `p.mineIssued` zeroed in startMatch/returnLobby;
  `GEAR.mine.lifetimeSmall`.
- **Mine KPI:** `combat.js` (count) → `rooms.js lobbyPayload` (ship) →
  `ui.js showEnd` (column) + `server.js buildInsights` (card).
- **EMP:** WEAPONS.emp (gear slot, appended to WEAPON_ORDER after drone; bm
  ids fold after it) → `Weapons.useEmp` → `Net.useEmp` → `Mines.emp(room,p)`
  → `empBlast` to the room → `Pickups.mineBoom` + `FX.empBlast`.
  LOOT_ITEMS.emp (rare floor + crate pool). verify-armoury EXEMPT names it.
- **Shield:** `GEAR.shield`; `loot.js tryCollect` (one per life);
  `combat.applyDamage` soak block BEFORE the helmet cut (`sniperBreaks` on
  `WEAPONS[w].scope === true`); `shield` event → `UI.setShield` (own) /
  `setRemoteShield` (slab); `lobbyPayload.shield` for late joiners;
  `spawnPlayer` clears it. `bigOnly` filtered at `initPickups` AND
  `dropCrate`.
- **Remote/heli:** `loot.js plantRemote` (one, `hidden:1`, 'h' point, big
  maps, not botmode) → `pickupList` carries `h` → `pickups.js` no ring/no
  bob → `tryCollect` sets `p.hasRemote` → hold-Z in `game.js` → `Net.callStrike`
  → `server.js 'callStrike'` (clears flag first, `room.heliTimer`, kills via
  `applyDamage(...,'heli',false,true)`) → `heliStrike`/`heliDone` events →
  `FX.heliStrike`, `AudioSys.heliBeat`. Timer dies in destroyRoomIfEmpty and
  endMatch. `GEAR.heli.label` feeds the kill feed.
- **Urban ring:** `districts-outer.js` tail: `World._towerAt(T,X0,Z0,mir)` +
  `World._buildPart6(T)`; called from `World.build` before deco. `world.js`
  ground/shadow/skyline/connectors adjusted; `MAPS.urban.bound: 120`;
  `districts.config.js` four regions first; spawns/loot/drops in
  gameplay/loot config. `gen-points.js` margin is now a flat 4 m.
- **Killhouse:** `killhouse.js` PLAN scaled, DECK/corridors after the PLAN
  loop; `maps-killhouse.config.js` regenerated; `verify-collision` deck
  section replaces the angled-chain section.
- **Small maps:** outer rings appended to each builder in `smallmaps.js`
  (`quad`/`pair` vocabulary), end bands in `sunsetrow.js`; bounds/caps in
  `world.config.js`.
- **Medium maps:** landmarks appended to `medium.js` builders; both use
  `World._towerAt`.

## §4 VERIFICATION STATE AT SHIP

- 44 offline gates green; the 3 §1b reds unchanged. Notable extensions:
  `verify-fullmap` 61/0 (new opt-in rule), `verify-endscreen` 58/0 (MINES
  column + MINEFIELD card), `verify-collision` 53/0 (deck section),
  `verify-map` 2521/0, `verify-spawn-geometry` 72/0, `verify-stairs-quality`
  20/0 (better than v14: the ring towers need no excusals), `verify-batch`
  31/0 (urban 99/115 draws, 62/62 casters, 7/7 lights, tris 128.5k/136k
  itemized), `verify-fingerprint` 64/0 and `verify-untouched` 12/0
  re-recorded with reasons, `verify-bandwidth` 25/0 (Rural's departure paid
  for the new client code).
- Live against a running server at ship: `test.js` 279/0 (Phase 18 covers the
  ration, an EMP blast, the shield soak/shatter and the remote end to end —
  the floor roll offered 15 EMP and 4 shield, which is why the EMP moved from
  rare to legendary before packaging), `verify-client` 66/0,
  `probe-net-degraded` 10/0.

## §5 PERFORMANCE NOTE

Urban grew 44% in area for +29% triangles and +1 draw call; the shadow
frustum widened 95 → 122 (texel 0.093 → 0.119 m, normalBias scaled). The
helicopter is one Group effect per match, disposed with its children. Shield
state is an event, not a snapshot field — bandwidth cost is per change, not
per tick. Nothing new runs per frame on the server.

## §6 RULES OF THE ROOM (carry these forward verbatim)

1. **Never weaken a gate** — fix at the invariant, extend with counterpart
   asserts when a rule is legitimately scoped (fullmap, endscreen, collision
   this release). A budget moves only for a deliberate expansion, itemized.
2. **Inventory before writing** after any cut-off (grep/ls); create_file
   fails on existing paths, and tails leave real work.
3. **Environment:** background `cmd &` gets reaped — install synchronously,
   check `ls node_modules | wc -l` = 86. Launch server
   `(setsid node server.js > /tmp/log 2>&1 < /dev/null &)`; suite detached the
   same way + poll; check the new server log head for EADDRINUSE. Container
   resets between turns; disk persists.
4. **Every timer a room owns dies in the teardown** (destroyRoomIfEmpty +
   endMatch) — bmTimer and heliTimer included.
5. **WEAPON_ORDER is wire format** — append-only, forever (emp appended after
   drone; bm ids fold after).
6. **Every new lobby control needs four things:** cache, sync, read,
   LISTENER.
7. **Suite phases assert global lobby counts** — never run probes against a
   server while the suite is mid-run; run probe-net-degraded ALONE.
8. **Version bump per release; CHANGELOG in lessons-learned style; HANDOFF
   carries §0/§1/§1b/§6 forward.**
9. **Reused geometry re-runs the gates that excuse its original** (§0).
11. **Area weapons are server modules with a tick and a teardown** (mines,
    drones, nuke, rocket, hazards). Decide hostility per tick, never at
    launch; read `Bots.buildColliders` (the geometry harness — it fields no
    bots) for "can the fire see him" / "is he under a roof" — never a client
    claim.
12. **Bot Mode is not a feature to restore.** See §1b. Any "bots" request is
    a new design, not a switch.
13. **A moving rider is judged with lag in mind, and one-shot server state
    survives the map rebuild.** The helicopter taught both (builds 13/14):
    "fallen" is metres below/away, not a tight box; `matchStart` fields are
    re-applied after `buildWorld`.
13. **The train's corridor is part of the map contract.** Anything built
    within 3.6 m of `CFG.TRAIN.urban`'s centreline, or under 4.35 m over it,
    breaks `verify-train`'s clearance sweep. Run it after every Urban edit.
10. **New material × cast combinations are draw calls.** Reuse
    (material, castShadow) pairs already in the batch list; the diff script
    in /tmp/casters.js's shape (build, key by material name + cast) finds
    the strays in one run.
