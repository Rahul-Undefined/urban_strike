# Urban Strike — Changelog & Deployment Ledger

Every release ships as a cumulative zip (the full game, not a patch).
Deploy ritual: local 2-tab smoke test -> GitHub **delete-then-upload** (uploads never
remove old files) -> Render auto-deploys (`npm install` / `node server.js`, never changed).

---

## Rollback ladder (which zips are safe)

| Zip | Status |
|---|---|
| **v4.5 (rebuilt)** | CURRENT — deploy this |
| v4.5 (first build) | BROKEN — carried the v4.4 build crash; discard |
| v4.4 | BROKEN — build crash at "BUILDING SECTOR 7" (see v4.4 defect); do not deploy |
| v4.3 | Last known-good before the merge system |
| v4.2 | Good — map expansion + graphics, before the gameplay update |
| v3.1 | Good — last pre-refactor build |

---

## v4.5 — Voice Chat *(current)*
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

## Known issues & accepted limitations (current, v4.5)

1. **Voice — NAT pairs:** STUN-only (no free TURN exists). A small share of player
   pairs cannot connect P2P: those two won't hear each other; others unaffected.
2. **Voice — media path untested headlessly:** signaling is server-verified;
   microphone/audio requires human browser testing. Two tabs on one machine will
   feedback-loop — use headphones or a second device.
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
| Integration (44) | `node server.js &` then `node test.js` | full server gameplay, run 3x |
| Pipeline (17) | `node verify-models.js` | viewmodels, grants, zoom, gear |
| Map (198) | `node tools/verify-map.js` | loot support, spawn clearance |
| Merge (9) | `node tools/verify-merge.js` | geometry math vs real three |
| Build chain | `node tools/verify-build.js` | full client world build (real three) |
| Parse sweep | `node --check` on every .js | syntax |
