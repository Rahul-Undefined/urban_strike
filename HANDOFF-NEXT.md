# Urban Strike — handoff for a new session

**Current build:** `urban-strike-v8_26.zip` — working, browser-verified through
v8.25. Start from this zip, not from an older one.

**Rahul** is a beginner coder. He browser-tests every build and is the **only**
source of truth about how the game feels. Nothing is done until he confirms it.

---

## 0. How this project fails, and how the last session failed

**Automated gates pass. The browser disagrees.** That is the repeated signature
across the whole history — v6.0 scored 18/18 on the ascent gate with not one
climbable staircase; v7.5 passed everything and rendered a black slab at the
crossroads.

The session that wrote this file added a second failure mode worth naming,
because it cost more than any bug did:

> **Reasoning from a partial read of a function to a confident number, telling
> Rahul that number, and finding out at measurement time it was wrong.**

It happened five times. The hitbox after the rig was scaled. The FOV wedge
drawn inside a rotated frame. The corpse timer. The auto-step limit. Three
different root causes for the same twenty-one unclimbable staircases, all
wrong.

**The habit that fixes it:** before stating a cause, run it. The container can
build any map headlessly in about two seconds. Measuring costs one tool call.
Being wrong costs a release.

When Rahul asks why something is broken, the honest answer is often *"I have
not measured it yet"*, and he responds well to that.

---

## 1. THE NEXT TASK — throwables into the weapon scroll

This is agreed, specified and not started. **Ship it alone, nothing else in
the build.**

### What Rahul wants

Grenades stop having their own keys. They join the mouse-wheel weapon cycle:
scroll past the guns and the knife and you reach frag, molotov, smoke, flash,
mine. Left-click throws.

His answers to the design questions, verbatim:

1. **Out of ammo** → auto-switch to the last gun held
2. **Cooking** → remove it, simple click and throw
3. **Number keys** → no, scroll only
4. *"Please ensure all the guns with the guns image are correct and nothing
   else breaks while doing this."*

### Why it was not started

It is five changes inside the code that runs every time anyone holds a gun:

1. Add throwables to the scroll list (`CFG.WEAPON_ORDER` / `owned`)
2. Teach `setWeapon()` to handle an item with no magazine and no reload
3. Teach the left-click path to throw instead of fire
4. **Build a held viewmodel for each throwable.** Every weapon currently has a
   model in the player's hands; a grenade has none. Something must appear or
   the player holds air. Use the existing primitive-box approach and existing
   materials — a new material family costs a draw call and may cost a shadow
   caster, and there are only 17 draw calls and 5 casters of headroom left.
5. Auto-switch on depletion

Then remove the old binds from `game.js` and the `#throw-counts` row from
`index.html`.

### An unsolved bug that may disappear with this work

**Only `KeyH` (molotov) fires today. G, T, F and V do nothing.**

Already ruled out, do not re-check these:

- Not the movement key map — G/T/F/V are not in it (`game.js:55`)
- Not key ordering — G is handled before H and still fails
- Not missing config — frag, smoke, flash, molotov all exist in `CFG.THROWS`
- Not missing counts — 2 / 1 / 1 / 3, all present

`throwGrenade('molotov')` works. `throwGrenade('smoke')` does not. **Same
function, different argument.** The bug is inside that function, in a branch
nobody has read. Read `throwGrenade()` in `public/src/weapons/system.js`
before rewriting anything — the rebuild probably deletes this path, but
understanding it first costs five minutes and may explain the design.

---

## 2. Current state — every gate, from the extracted zip

| Gate | Command | Expected |
|---|---|---|
| Integration | `node server.js` then `node test.js` | 85 / 0 |
| Map | `node tools/verify-map.js` | 992 / 0 |
| Build chain | `node tools/verify-build.js` | PASS |
| Ascent | `node tools/verify-access.js` | 50 / 1 |
| **Climb** | `node tools/verify-climb.js` | **RED BY DESIGN — urban 20, rural 1, metro 0** |
| Lifts | `node tools/verify-lifts.js` | 82 / 0 |
| Cover | `node tools/verify-cover.js` | PASS |
| Batching | `node tools/verify-batch.js` | 36 / 0 |
| Architecture | `node tools/verify-arch.js` | **3/6 — RED BY DESIGN**, urban 11 BP, metro 13 |
| Avatar | `node verify-avatar.js` | 23 / 0 |
| Models | `node verify-models.js` | 37 / 0 |
| Merge | `node tools/verify-merge.js` | 9 / 0 |
| Collision | `node tools/verify-collision.js` | 19 / 0 |
| Stair quality | `node tools/verify-stairs-quality.js` | 15 / 0 |
| DevHUD | `node tools/verify-devhud.js` | 13 / 0 |
| Flow | `node tools/verify-flow.js` | 3 / 0 |
| Z-fighting | `node tools/verify-zfight.js` | 2 / 0 |
| Props | `node tools/verify-props.js` | 2 / 0 |
| Parse sweep | `node --check` every .js | clean |

**Run all of these at baseline before changing anything.** If a number differs
from this table, something drifted and that matters more than the next task.

**Urban performance:** 98 draw calls / 115 · ~81.7k tris / 120k ·
**57 shadow casters / 62** · 7 lights / 7 · ~3,215 colliders.

Remaining headroom: **17 draw calls, 5 shadow casters, 38k triangles.** Shadow
casters are counted per mesh **after** merge, so geometry reusing an existing
material costs zero; every new material family costs a draw call and may cost
a caster. Rahul has said hold the caster budget.

---

## 3. Rules that are not negotiable

1. **Never weaken a validator.** Budgets are ratchets — they may fall, never
   rise. Add gates, never soften them.
2. **A gate must load exactly what `public/index.html` loads,** and must
   consume config the same way the runtime does, with no adapter in between.
   Three separate gates were caught reshaping their input until the world
   matched the test.
3. **Root-cause only.** Fix the generator, not the instance.
4. **Verify from the EXTRACTED ZIP**, not the working copy.
5. **Never ship `package-lock.json`.** Every zip is cumulative — the whole
   game, not a patch.
6. **Do not bundle unrelated changes.** When something breaks Rahul needs to
   know which change did it.
7. **Non-beneficial changes get reported and reverted, not kept.**
8. **Never claim a feature works before Rahul confirms it in a browser.**
9. **Tell him when a number he has been quoting is wrong.** He has said
   repeatedly this is the most valuable thing in the project.

---

## 4. Traps that have already cost real time

- **`fuser` does not exist in the container.** Every `fuser -k 3000/tcp`
  returns 127 and stale servers pile up on port 3000, so `test.js` connects to
  an old process running old config. The integration score drifted 85 → 84 →
  83 → 82 across one session **while changes were being reverted** — none of
  those failures were real. Use:
  ```
  ps aux | grep "[n]ode server.js" | awk '{print $2}' | xargs -r kill -9
  ```
  Start the server in its **own** tool call (`setsid nohup node server.js >
  /tmp/s.log 2>&1 &` then `sleep 6`), and run `test.js` in the **next** call.
  The suite takes about 110 s.
- **`moveAxis` auto-step has TWO conditions** — `rise <= STEP` **and**
  `!overlapAny(...)`. Reading only the first produced a wrong root cause and a
  wasted release. Raising `MOVE.step` from 0.42 to 0.62 changes nothing.
- **A hitbox that disagrees with the model is a lie told to the player.**
  `Avatars.RIG` and `castRay` in `weapons/system.js` are one number expressed
  in two files, with **no gate checking they agree**. That is how headshots
  broke. Any change to `RIG` must touch `castRay` in the same commit.
- **A tread shallower than the player's 0.35 m radius is unclimbable.** The
  capsule permanently straddles the tread two ahead, whose rise exceeds the
  0.42 m auto-step. Stairs need `run > 0.35` and `rise <= 0.42`.
- **Do not subdivide stair steps.** Smaller treads make stairs *less*
  climbable, not more.
- **A staircase built with raw `box()` calls is invisible to every gate.**
  Use `stairFlight()` so it lands in `World._stairs()`.
- **`DISTRICTS` describes Urban only.** `nameAt(x, z, map)` takes the map and
  returns `''` for anything else. Do not reintroduce Urban district names on
  Metro.
- **Do not emit slivers.** A leftover strip under 0.55 m is a standable
  surface nobody can reach and `verify-arch` counts it as a broken promise.
- **When you add a gate for something you just built, A/B it with your change
  disabled.** A devhud gate once "passed" three assertions against stale text
  because its clock was throttled.
- **A decorative animation must never decide whether critical UI is visible.**
  An `opacity: 0` keyframe with `both` fill on the match-end overlay could
  leave the result invisible and the match looking unfinished.

---

## 5. Tools you have — use them

- **`tools/verify-climb.js`** walks a capsule up **every registered flight**,
  not a hand-written route list. Reports the tread index and clearance where
  it stalls. This is the instrument for any stair work.
- **F3 in-game** opens the DevHUD: XYZ, district, deck, floor, column,
  headroom, and the stair arrival verdict under the player's feet. **F4**
  copies it to the clipboard. When Rahul reports a bug, ask him for the F4
  readout — it turns a screenshot into a coordinate.
- **`World._stairs()`** — every flight recorded at construction.
- **`World.stairwells()`** — post-build pass that cuts a stairwell opening in
  any thin slab a flight climbs into. Runs in both build paths.
- **`DISTRICTS.nameAt(x, z, map)`** — the same string the gates print and the
  signboards carry.

---

## 6. Open work, in Rahul's priority order

1. **Throwables into the weapon scroll** — section 1. Agreed and specified.
2. **Match may not end when the clock hits 0:00.** Rahul photographed 0:00
   with the match still running. The server arms
   `setTimeout(() => endMatch(room, null, 'time'), minutes * 60000)` at match
   start and only clears it when the room empties; the client's FFA branch
   handles a null winner correctly. The v8.23 fix removed an opacity keyframe
   that *could* have hidden the result — but if the match genuinely does not
   end, the cause is upstream and **needs the browser console from the moment
   the clock hits zero.** Ask for it; do not guess.
3. **Milestone A accessibility — 21 unclimbable flights.** Grouped causes:
   THE COLONY ×8 are 45° staircases (run == rise) which no step count can
   fix; OLD TOWN TERRACE ×5 are blocked by one kerb repeated five times;
   CIVIC CENTRE ×3 need 7-step half-flights instead of 6 (**Rahul has already
   approved this change**); the rest are walls the stairwell pass refuses to
   cut. Also: signboard relocation, and 11 broken promises on Urban.
4. **Metro** — 13 broken promises left. The garage, mall and residential
   blocks still carry the old lift-only, no-stairs pattern that the four
   towers had before v8.20. Same treatment. Rahul also wants the map made
   physically smaller for faster fights; that means moving spawns and loot
   with the blocks.
5. **Milestone B and C** — district identities, vehicles, high-rise redesign,
   loot rebalance; then player model, animations, armour tiers, backpacks,
   healing items, helicopter drops. Not started, not authorised.

---

## 7. What changed in the last session (v8.9 → v8.26)

Kept and working:

- **v8.9** — five gates were building a world that does not ship; `verify-map`
  never loaded `districts.config.js` (24 sign-post colliders missing from 978
  assertions). F3 DevHUD added.
- **v8.10** — `World.stairwells()`. Staircases were climbing into floor slabs
  with no hole cut in them. 26 slabs cut, headroom and narrow classes driven
  to **0** on all three maps.
- **v8.11** — `verify-climb`. 26 flights had never been walked by anything.
- **v8.12** — tree placement clearance-tested against the canopy, not the
  trunk.
- **v8.15–v8.16** — stance drop was double-counted, so prone bodies sank
  0.46 m underground and only the gun showed. Avatars enlarged with lift
  compensation; nameplate moved to a counter-rotated holder so it stops lying
  on the floor when prone.
- **v8.17** — kill model. **A vest was soaking headshots**, which made a
  headshot kill arithmetically impossible against a kitted player. Split, then
  the damage table set to Rahul's spec: sniper 80 body / kill head, assault
  50/80, SMG 30/50.
- **v8.18** — Metro's "load error" was one wrong config key (`AIRDROPS` vs
  `AIRDROP_POINTS`) that crashed the first airdrop tick. Per-map night
  lighting added without changing the light count.
- **v8.19** — headshots. The rig was scaled 1.22× but the hitbox was not, so
  the rendered head sat 0.17 m above a box with a 0.19 m half-extent.
- **v8.20** — Metro's four sealed 24 m lift towers rebuilt as enterable
  two-storey blocks with stairs. metro passes `verify-climb` 8/8.
- **v8.21–v8.26** — corpse was falling through the world, then being deleted
  50 ms after landing; weapon raised from a low-ready to a chest carry;
  killfeed moved out from behind the minimap; FOV wedge moved to screen space;
  full map on **M** with district names and all player positions; animated
  match end.

Two changes were **implemented, measured and reverted** with the arithmetic
recorded in `world.js` — a stair-connector pass and a map-wide run/rise
correction. Read those comments before re-attempting either.
