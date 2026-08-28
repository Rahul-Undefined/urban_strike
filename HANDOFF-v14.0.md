# Urban Strike — Project Handoff (v14.0)

**Upload this file plus `urban-strike-v14.0.zip` into a new chat.** Read this
file first, then unzip and inventory before writing anything.

---

## §0 THE LESSON THIS RELEASE ADDS

**Trust the disk, not the record.** This release was built across three
interrupted sessions. Twice, work existed on disk that no summary mentioned
(the server driver, the loot entries); once, the record said a fix had shipped
that had never been written (the edit script died on an anchor mismatch, its
gate printed a stale passing count, and the suite re-failed identically the
next session). The operating rule that survives: **after any cut-off, grep the
tree for what IS there before trusting any account of what SHOULD be** — and
treat a passing gate printed in the same breath as a crashed edit as evidence
of nothing.

## §1 OPEN ITEMS (owed, in priority order)

1. **PLAY-VERIFICATION IS OWED.** No browser or GPU exists in this
   environment. Blacksite has never been rendered. The BOT MODE panel has
   never been clicked. TPP (v13.0) and the procedural audio (v13.0) have
   still never been seen or heard. The wave banner has never been watched.
   Everything below the wire — geometry gates, live socket phases, 253/0 —
   is real; everything above it (visuals, feel, readability, balance) is
   unverified. First human session should walk: rail button → panel → each
   mode → a full BATTLE.
2. **Difficulty balance is arithmetic, not playtested.** The EASY/MEDIUM/HARD
   ladders are anchored on the proven recruit/regular/veteran numbers and
   re-tuned by judgment. Expect a tuning pass after real play (v9.7 precedent:
   "very easy in veteran" was true and the arithmetic agreed).
3. **Third-person bm guns wear donor silhouettes.** Remote/own-rig held
   weapons come from WEAPON_ORDER index → avatars' per-id table; bm ids fall
   back to donor shapes. First-person viewmodels are true clone() aliases.
   Bespoke meshes per pool gun are a luxury item, not a bug.
4. **bm_team seatance beyond 2 humans untested live.** Phase 17 exercises
   solo (1+8) and battle (1+5). Team with 3-4 humans joining by code rides
   entirely proven machinery (join flow, vsBots side dealing) — [Likely]
   fine, never witnessed.

## §1b GAP REGISTER (documented, accepted)

- Pre-existing gate reds, unchanged and explained in their files:
  verify-climb 1 red / verify-arch 4 reds / verify-access 55/1 /
  verify-cover: rural 28.6% dead ground vs a 15% budget (predates v14 —
  rural.js and the gate both untouched since v13.1; inherited undocumented,
  now on the register).
- test.js auto-gates legacy phases 11/12/14 behind the bot switch
  (5 SKIP notes when off — the shipped default).
- v13.1's "4 spawns in walls" finding was an ARTIFACT (frozen harness file
  list graded non-listed maps against Urban's colliders). Originals test
  clear with the complete world loaded; the relocated points were also clear
  and were left in place.

## §2 WHAT v14.0 IS

Bot Mode: a separated product beside multiplayer. Three modes (bm_solo,
bm_team, bm_battle), one bot-only map (Blacksite), one bot-exclusive weapon
pool (5 guns, pool:'botmode'), difficulty as intelligence (dmgMul pinned 1.0,
moveMul ≤ 1.0 at every tier), BATTLE waves 5→10→15→20 with per-wave tier
climbs, 15-minute matches, its own front door on the welcome rail.

## §3 THE SEAM MAP (one engine, two products)

The proven v12 AI engine (nav/cover/climb/loot/frag/switch) serves both
products. Every deliberate crossing point:

- `server/lib/botmode.js` — the driver. PROFILES (engine knob names),
  stageFor() pure, applyStage/scheduleNext (room.bmTimer), onMatchStart/End.
- `bots.js skillOf()` — reads `room._bmSkill` first; the engine never knows
  which product it serves.
- `bots.js addBots(room, opts)` — explicit {count, side, loadouts, baseIdx}
  path the driver uses; legacy path refuses botmode rooms.
- `bots.js tick admission` (~line 808) — botmode rooms tick regardless of the
  legacy switch.
- `config/index.js fold` — WEAPONS_BOTMODE → CFG.WEAPONS; bm ids APPENDED to
  WEAPON_ORDER (wire format: wp is an index; append-only, never insert).
- `loot.config.js` — wpn_bm_* entries (labels live here, one source of
  truth); `server/lib/loot.js` walls both doors by CFG.WEAPONS[w].pool.
- `world.config.js` — MODES bm_* {cat:'botmode' (absent from ALL_MODE_CATS),
  vsBots:true (inherits v9.2 side dealing: humans 'a', machines 'b'),
  mapLock:'blacksite', botmode:true, NOT hidden}; MAPS.blacksite
  {botOnly:true} refused to every non-botmode mode at BOTH doors (create +
  updateSettings).
- Client: BOT MODE rail button + panel (ui.js bmSel/segWire), 'wave' event →
  UI.waveBanner, weapons/system.js baseWeapons() deals by product,
  viewmodels dup() aliases.

## §4 VERIFICATION STATE AT SHIP

- Full suite **253/0** including Phase 17 (Bot Mode live: fence both
  directions, hardplus refusal, 1+8 on opposite sides, loot wall live,
  BATTLE wave one).
- verify-botmode 36/0 · verify-bots 270/0 · verify-models 257/0 ·
  verify-client 66/0 · verify-endscreen 47/0 · verify-spawn-geometry 55/0.
- Board (final tree): 44 gates green — incl. armoury 230/0, attach 111/0,
  barrel 58/0, fullmap 57/0, bandwidth 25/0 after the v14 content was made
  to satisfy them — except the FOUR documented §1b reds.
- probe-net-degraded 10/0 (jitter, authority attacks, reconnect storms).

## §5 PERFORMANCE NOTE

Bot Mode reuses the legacy engine's own tick pacing and amortization —
no new per-frame client cost (the panel and banner are menu/event-driven),
no new server loops (the wave director is one setTimeout per stage).
BATTLE's worst case is 20 machines + 4 humans on a 52-bound map, which is
smaller headroom than 15 humans on the 200 m maps the engine already
serves. Formal profiling under load: not done here (no load rig); flagged,
not claimed.

## §6 RULES OF THE ROOM (carry these forward verbatim)

1. **Never weaken a gate** — fix at the invariant, extend with counterpart
   asserts when a rule is legitimately scoped (see picker-cat + seat-ceiling
   this release).
2. **Inventory before writing** after any cut-off (grep/ls); create_file
   fails on existing paths, and tails leave real work.
3. **Environment:** background `cmd &` gets reaped — install synchronously,
   check `ls node_modules | wc -l` = 86. Kill strays via /proc argv scan for
   exactly ['node','server.js']/['node','test.js'] — NEVER `pkill -f`.
   Launch server `(setsid node server.js > /tmp/log 2>&1 < /dev/null &)`;
   suite detached the same way + poll ~150 s; check new server log head for
   EADDRINUSE. Container resets between turns; disk persists.
4. **Every timer a room owns dies in the teardown** (destroyRoomIfEmpty +
   endMatch) — bmTimer included.
5. **WEAPON_ORDER is wire format** — append-only, forever.
6. **Every new lobby control needs four things:** cache, sync, read,
   LISTENER (the v13.0 intel lesson).
7. **Suite phases assert global lobby counts** — never run probes against a
   server while the suite is mid-run. And run probe-net-degraded ALONE:
   under CPU contention from other gates it flaked to 9/1 twice; standalone
   it is 10/0. A timing probe sharing a core with verify-bots measures the
   scheduler, not the netcode.
8. **Version bump per release; CHANGELOG in lessons-learned style; HANDOFF
   carries §0/§1/§1b/§6 forward.**
