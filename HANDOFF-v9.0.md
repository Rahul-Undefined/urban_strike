# UrbanStrike v9.0 — HANDOFF

Read this before touching anything. It is written for someone starting cold.

---

## 0. HOW THIS PROJECT FAILS

Every expensive mistake in this codebase has been one of five shapes. They
repeat. Assume you are about to make one.

1. **A gate passes and the browser disagrees.** The gate was checking the model,
   the config, or the source text — never the thing the player sees. Bullets
   passed through visible heads for thirteen versions while every gate was
   green, because no gate had ever fired a ray at a rendered avatar.
2. **A fix is guessed instead of measured.** Four separate attempts at the
   team-mode black screen guessed at causes. All four were wrong. It was found
   in one session by executing the real code path and reading the error.
3. **A shared helper is edited for one caller.** `World.BOUND` was a constant at
   100 because Urban is 200 m across. Rural at 300 m had two thirds of its loot
   declared out of bounds.
4. **A setting persists across a mode change.** `botCount` survived switching
   from Training to 5v5, and six bots were injected into a team match. Every
   mode passed its own tests; the bug lived only in the transition.
5. **Deleting by pattern.** A `/voice/i` line-strip removed CSS selector lines
   and left their bodies orphaned. The parser then swallowed the next whole
   rule, which was `#live-board`. Three releases shipped a malformed stylesheet.

**The rule that follows from all five: measure, do not reason. Then write a gate
that fails on the bug you just fixed, and prove it fails by reintroducing it.**

---

## 1. WHAT THIS IS

Browser multiplayer tactical FPS. Node + Express + Socket.IO server, Three.js
client, no build step — `index.html` loads 30 plain `<script>` files in order.

- **Server-authoritative.** The server owns positions, damage, spawns and hit
  validation. The client renders and predicts.
- **Run it:** `npm install` then `node server.js` → http://localhost:3000
- **14 modes, 3 maps, 15 weapons, up to 20 players.**

### Modes (4 categories + Training)

| Category | Variants |
|---|---|
| Free For All | ffa (20 players, no teams) — **the default** |
| Team Battle | 2v2 · 3v3 · 4v4 · 5v5 · 6v6 · 8v8 · 10v10 |
| Squads | 10×2 · 5×4 |
| Last Stand | Solo · Squads 10×2 · Squads 5×4 (one life, no timer) |
| Overrun | Solo vs 1–19 bots, four difficulty rungs |

### Maps

| | bound | colliders | flights | draws | tris | state |
|---|---|---|---|---|---|---|
| **urban** | 100 | 3191 | 68 | 98 | 81,660 | complete |
| **rural** | 150 | 1066 | 25 | 32 | 54,467 | complete (v9.0) |
| **metro** | 100 | 898 | 8 | 20 | 14,012 | **incomplete — do not ship as playable** |

---

## 2. VERIFICATION GATES — RUN ALL BEFORE SHIPPING

```
node server.js &          # must be running for test.js
node test.js              # run THREE times, it has timing-sensitive phases
node verify-avatar.js
node verify-models.js
for t in tools/verify-*.js; do node $t; done
```

| Gate | Expected | Proves |
|---|---|---|
| `test.js` | **211 / 0** | full server gameplay, all modes, lobby, launch, config invariants |
| `verify-models.js` | **139 / 0** | viewmodels, weapon/model parity, sniper rules, keybind collisions |
| `verify-avatar.js` | **25 / 0** | rig parts, material sharing, LOD, 10- and 20-player lobby cost |
| `tools/verify-map.js` | **1054 / 0** | loot support, spawn clearance, airdrop landing, all 3 maps |
| `tools/verify-access.js` | **55 / 1** | walks a capsule up every named route |
| `tools/verify-hitbox.js` | **32 / 0** | fires the REAL castRay at the REAL posed avatar |
| `tools/verify-bots.js` | **42 / 0** | collider build, ground-slab trap, LOS, difficulty ladder |
| `tools/verify-scope.js` | **20 / 0** | cross-IIFE identifier leaks, frame-loop isolation |
| `tools/verify-endscreen.js` | **35 / 0** | runs real `UI.showEnd`, CSS structural integrity |
| `tools/verify-batch.js` | **36 / 0** | draw / triangle / shadow budgets per map |
| `tools/verify-build.js` · `collision` · `cover` · `flow` · `lifts` · `merge` · `props` · `zfight` · `stairs-quality` · `devhud` | all green | |

### RED BY DESIGN — these are expected, do not "fix" them

- `verify-access` **55/1** — `north block A` is a known urban map-accessibility item
- `verify-climb` **1/2** — 20 unclimbable urban flights, catalogued map work
- `verify-arch` **3/3** — urban 11 broken promises, metro 13

These are Milestone A map-design debt, not defects.

---

## 3. LANDMINES — READ BEFORE WRITING CODE

### Client architecture
- **30 plain IIFEs, no bundler.** A variable private to one file is genuinely
  unreachable from another and NOTHING warns you. `verify-scope` is the only
  thing that catches it. Do not weaken it.
- **`index.html` load order is the dependency graph.** Adding a module means
  adding a `<script>` tag.
- **`mat()`, `esc()` and friends are IIFE-private.** Calling one from a file
  that does not define it throws at runtime and passes every static check.

### Frame loop (`game.js`)
- Each subsystem runs in its own `step()` guard. **Do not collapse them.** One
  guard around the whole frame means a fault in remote avatars silently starves
  `FX.update`, and effects stop expiring — that is how permanent muzzle flashes
  and a frozen clock happened.
- `renderer.render()` must stay OUTSIDE every `try`. `verify-scope` asserts it.

### Avatars and hit detection
- **The hit box must be DERIVED FROM the rendered model, never calculated
  alongside it.** `net.js` caches the real head mesh world position each frame
  and `castRay` reads it. Do not reintroduce a parallel calculation from
  `CFG.PLAYER.eyeHeight`.
- **`RIG` is non-uniform (1.52 / 1.22 / 1.52).** A limb rotated toward
  horizontal is stretched 1.52× instead of 1.22×, so changing an arm angle also
  changes how far the hand reaches. Angles and mount offsets must be solved
  together.
- **Camera forward is −Z; the rig's forward is +Z.** `net.js` applies
  `-r.ry + Math.PI` to reconcile them. Remove the PI and every remote player
  faces backwards.

### Teams
- **`CFG.activeTeams(mode)` is the only thing allowed to decide which sides are
  in play.** Nine places used to hardcode `'a'`/`'b'`; that was the ceiling at
  two teams.
- **`combat.js` does `room.teamKills[attacker.team]++`.** If the key was never
  seeded the result is `undefined++` = **NaN**, which propagates into every
  snapshot and NEVER THROWS. Always build the bucket with `zeroTeamKills(mode)`.
- Team names come from `room.settings.teamNames`, never from `CFG` directly.
  `CFG.TEAMS[t].name` is the fallback inside `UI.teamName()` and nowhere else.

### Modes
- **Every mode must end by a kill target, a clock, or elimination.** Last Stand
  has neither target nor clock; `checkLastStand` is its only termination. If it
  is wrong the match HANGS rather than ending wrong.
- **`CFG.MODE_CATS` is a view over `CFG.MODES`, not a replacement.** Add a mode
  to both or it vanishes from the picker.
- **Settings persist across mode changes.** Guard mode-specific settings on the
  MODE, not on the value — and keep the value, so switching back restores the
  host's choice.

### Bots
- **A bot is a PLAYER.** `room.players` entry, `bot: true`, no socket. It goes
  through `spawnPlayer`, `applyDamage`, snapshots and the avatar code unchanged.
  Never add a parallel bot damage path.
- **`three` is a RUNTIME dependency.** `server/lib/bots.js` builds map colliders
  in a vm for line of sight. Move it back to devDependencies and
  `npm install --production` strips it — bots then shoot through walls in
  deployment while working perfectly in dev.
- **THE GROUND IS A COLLIDER.** Any server-side geometry test must skip AABBs
  underfoot or overhead, or every step is blocked and the bots freeze.

### Maps
- **`World.BOUND` is PER MAP**, set by `buildMap` from `CFG.MAPS[map].bound`.
  A new map that is not Urban-sized MUST set `bound`.
- **`_stairwells()` cuts holes through any floor a flight passes through.** A
  flight starting above the deck it serves will DELETE that deck from the
  collider set. It still renders, so it looks solid and you fall through it.
  Every flight must start far enough out that `steps × stepDepth` ENDS at the
  platform edge.
- **Terrain is terraces + `stairFlight`, never slopes.** Slopes need a second
  collision path and are invisible to `verify-climb` / `verify-access`.
- **Loot heights are MEASURED, not typed.** Build the map, read the collider top
  under each point, add 0.55.
- **Cover comes from boxes, not trees.** A drystone wall is 12 triangles; a tree
  is four primitives. Place on a jittered grid — random scatter clumps and
  leaves 70 m holes.

### CSS
- `style.css` must have **brace depth 0 and no orphaned declarations**.
  `verify-endscreen` asserts both. Never edit CSS by line-pattern deletion.
- `#end-overlay` is a CHILD of `#hud-layer`. Every HUD element is its SIBLING
  and keeps drawing unless something switches it off. `showEnd` adds
  `end-active`; `hideEnd` removes it.

---

## 4. WORKING AGREEMENT

- **One change at a time.** Do not bundle unrelated fixes.
- **Budgets are ratchets.** They may fall, never rise. If one genuinely must
  rise, raise it by the minimum, in its own commit, with the reason written into
  the gate file itself. Precedent: rural triangles 30k → 70k in v9.0, and the
  avatar part budget 13 → 14 in v8.32.
- **Never weaken a validator to make a build pass.** If a gate is stale — it
  names geometry that no longer exists — REPLACE its cases with current ones at
  equal rigour. Do not delete them. Precedent: five rural access routes in v9.0.
- **Every fix ships with a gate that fails without it.** Prove it by
  reintroducing the bug and showing the red.
- **Never ship `node_modules` or `package-lock.json` in the zip.**
- **Verify from the extracted artifact**, not from the working tree.
- `test.js` is timing-sensitive — **run it three times.**
- A stale `node server.js` on port 3000 will silently serve OLD code while your
  edits appear to do nothing. `pkill -9 -f "node server.js"` first, and check
  the log for `EADDRINUSE`. This has wasted time more than once.

---

## 5. OPEN ITEMS

| Item | Notes |
|---|---|
| **Metro map incomplete** | 8 flights, 14k triangles, 13 broken promises. Not playable. Finish or hide it. |
| **Urban accessibility** | 20 unclimbable flights, `north block A` unreachable. Map you already paid for and cannot reach. |
| **Bots are Overrun-only** | The highest-value next feature: let a host add bots to ANY mode. Fixes the constraint that limits every session — needing 19 other people. Team assignment, LOS and difficulty already work. |

### Ideas discussed, not built
Gun Game (WEAPON_ORDER is already an ordered list of 15 — near-free), a ping
system (voice chat was removed; squads have no comms), killstreak rewards
(streaks and airdrops both already exist), a capture point (districts already
know their own geography), spectate-a-teammate in Last Stand.

---

## 6. VERSION HISTORY — ROLLBACK LADDER

| Version | State |
|---|---|
| **v9.0** | CURRENT — rural rebuilt as Hollow Ridge (300 m, climbable ridge, falls, lake, village, farm, quarry). Urban untouched. |
| v8.39 | Good — bot mode renamed Overrun |
| v8.38.1 | Good — fixed bot settings leaking into non-bot modes |
| v8.38 | Good — training bots with real map line-of-sight |
| v8.37 | Good — Last Stand, mode categories, staging area rework |
| v8.34 | Good — teams generalised 2 → 10, squad modes |
| v8.32 | Good — weapon carry, neck, head hitbox realigned |
| v8.31 | Good — team-mode bug fixed (`myTeam` out of scope) |
| v8.30 | Superseded — error boundaries, Unlimited kills, `mat()` restored |

Full detail per release is in `CHANGELOG.md`, newest first. Each entry records
what broke, why, and what gate now prevents it.
