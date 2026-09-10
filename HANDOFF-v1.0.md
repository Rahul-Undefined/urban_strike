# Urban Strike — Project Handoff (v1.0 · internal lineage v15.0)

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
  deaths)` (resolved in config/index.js after the fold — it needs MATCH and
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
10. **New material × cast combinations are draw calls.** Reuse
    (material, castShadow) pairs already in the batch list; the diff script
    in /tmp/casters.js's shape (build, key by material name + cast) finds
    the strays in one run.
