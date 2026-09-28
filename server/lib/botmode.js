/* ============================================================================
   BOT MODE DRIVER (v14.0) — server/lib/botmode.js

   Owns everything BOT-MODE-SPECIFIC on the server: which rooms are bot-mode,
   what difficulty means, how many machines a mode fields, and BATTLE's wave
   ladder. Owns NOTHING the multiplayer game runs on — spawning, movement,
   aiming, looting, cover, climbing, grenades and weapon switching are the
   proven v12 engine in bots.js, invoked through two narrow room-attached
   seams (room._bmSkill for skillOf, opts for addBots) so the engine never
   imports this file and this file never reaches into the engine's state.

   THE DIFFICULTY RULE, enforced here and asserted by verify-botmode:
   dmgMul is 1.0 at EVERY tier. Hard is a smarter opponent — faster reaction,
   tighter aim, longer sight, more cover and flanking, more grenades — never
   a stronger bullet. (The legacy ladder used dmgMul as a crutch; this table
   deliberately does not.)
   ========================================================================= */
'use strict';

module.exports = function initBotMode(ctx) {
  const { CFG, io, now, Bots } = ctx;
  const BM = CFG.BOTMODE || {};

  /* Engine-shaped difficulty profiles (the exact knob names skillOf's callers
     read). Values anchored on the proven recruit/regular/veteran ladder, then
     re-tuned to the brief: behavior scales, damage never does. */
  const PROFILES = {
    easy: {
      label: 'EASY', react: 900, aimErr: 0.30, fireMs: 640, range: 42, burst: 2,
      headPct: 0.02, moveMul: 0.78, dmgMul: 1.0,
      crouchPct: 0.06, pronePct: 0.0, sprintPct: 0.0, nadePct: 0.02, minePct: 0.0,
      verticality: 0.06, nadeCdMs: 30000, leash: 44, coverPct: 0.10
    },
    medium: {
      label: 'MEDIUM', react: 430, aimErr: 0.17, fireMs: 430, range: 60, burst: 3,
      headPct: 0.06, moveMul: 0.92, dmgMul: 1.0,
      crouchPct: 0.20, pronePct: 0.02, sprintPct: 0.30, nadePct: 0.10, minePct: 0.05,
      verticality: 0.18, nadeCdMs: 16000, leash: 78, coverPct: 0.45
    },
    hard: {
      label: 'HARD', react: 210, aimErr: 0.085, fireMs: 330, range: 74, burst: 4,
      headPct: 0.12, moveMul: 1.0, dmgMul: 1.0,
      crouchPct: 0.30, pronePct: 0.05, sprintPct: 0.55, nadePct: 0.20, minePct: 0.10,
      verticality: 0.30, nadeCdMs: 11000, leash: 95, coverPct: 0.70
    },
    hardplus: {
      label: 'HARD+', react: 150, aimErr: 0.06, fireMs: 300, range: 80, burst: 4,
      headPct: 0.16, moveMul: 1.0, dmgMul: 1.0,   // moveMul capped at 1.0: no superhuman legs
      crouchPct: 0.32, pronePct: 0.06, sprintPct: 0.70, nadePct: 0.28, minePct: 0.12,
      verticality: 0.35, nadeCdMs: 9000, leash: 110, coverPct: 0.80
    }
  };

  function isBM(mode) { return !!(CFG.MODES[mode] && CFG.MODES[mode].botmode); }

  /* Pure — the whole BATTLE ladder as arithmetic, so the gate proves the
     5-10-15-20 progression without waiting fifteen minutes for it. */
  function stageFor(elapsedSec) {
    const waves = BM.WAVES || [];
    let cur = waves[0] || { at: 0, count: 5, diff: 'easy' }, idx = 0;
    for (let i = 0; i < waves.length; i++) {
      if (elapsedSec >= waves[i].at) { cur = waves[i]; idx = i; }
    }
    return { idx, count: cur.count, diff: cur.diff };
  }

  function announce(room, text) {
    for (const q of room.players.values()) {
      if (q.bot || !q.connected) continue;
      io.to(q.id).emit('toast', { msg: text });
    }
    io.to(room.code).emit('wave', {
      stage: room._bmStage + 1, count: room._bmTarget,
      diff: (PROFILES[room._bmDiff] || {}).label || room._bmDiff
    });
  }

  function applyStage(room, stage, silent) {
    room._bmStage = stage.idx;
    room._bmDiff = stage.diff;
    room._bmTarget = stage.count;
    /* skillOf reads this — EXISTING bots get smarter mid-match too, which is
       the brief's "as the count increases, their difficulty should also
       increase" done at the source rather than per-bot bookkeeping. */
    room._bmSkill = PROFILES[stage.diff] || PROFILES.medium;
    let bots = 0;
    for (const q of room.players.values()) if (q.bot) bots++;
    if (bots < stage.count) {
      Bots.addBots(room, {
        bm: true, count: stage.count - bots, side: BM.BOT_TEAM || 'b',
        loadouts: BM.LOADOUTS, baseIdx: room._bmNextIdx || 0
      });
      room._bmNextIdx = (room._bmNextIdx || 0) + (stage.count - bots);
    }
    if (!silent) {
      announce(room, 'WAVE ' + (stage.idx + 1) + ' \u00b7 ' + stage.count +
        ' HOSTILES \u00b7 ' + (PROFILES[stage.diff] || {}).label);
    }
  }

  function scheduleNext(room) {
    const waves = BM.WAVES || [];
    const nextIdx = room._bmStage + 1;
    if (nextIdx >= waves.length) return;
    const delayMs = Math.max(250, (waves[nextIdx].at - waves[room._bmStage].at) * 1000);
    /* room.bmTimer is cleared by endMatch teardown and destroyRoomIfEmpty —
       the v13.1 rule: every timer a room owns dies in the teardown. */
    room.bmTimer = setTimeout(() => {
      if (room.state !== 'playing') return;
      applyStage(room, stageFor(waves[nextIdx].at));
      scheduleNext(room);
    }, delayMs);
  }

  function onMatchStart(room) {
    const mode = room.settings.mode;
    if (!isBM(mode)) return;
    if (mode === 'bm_battle') {
      applyStage(room, stageFor(0), true);
      announce(room, 'BATTLE \u00b7 WAVE 1 \u00b7 ' + room._bmTarget + ' HOSTILES \u00b7 ' +
        (PROFILES[room._bmDiff] || {}).label + ' \u00b7 THEY GET SMARTER');
      scheduleNext(room);
      return;
    }
    /* SOLO / TEAM: fixed enemy count, host-chosen difficulty. bmDiff is a
       room setting the lobby writes; hardplus is BATTLE-only by rule. */
    const diff = (room.settings.bmDiff && room.settings.bmDiff !== 'hardplus' &&
                  PROFILES[room.settings.bmDiff]) ? room.settings.bmDiff : 'medium';
    room._bmDiff = diff;
    room._bmSkill = PROFILES[diff];
    room._bmStage = 0;
    room._bmTarget = (BM.COUNTS && BM.COUNTS[mode]) || 8;
    Bots.addBots(room, {
      bm: true, count: room._bmTarget, side: BM.BOT_TEAM || 'b',
      loadouts: BM.LOADOUTS, baseIdx: 0
    });
    room._bmNextIdx = room._bmTarget;
    announce(room, 'BOT MODE \u00b7 ' + room._bmTarget + ' HOSTILES \u00b7 ' + PROFILES[diff].label);
  }

  function onMatchEnd(room) {
    if (room.bmTimer) { clearTimeout(room.bmTimer); room.bmTimer = null; }
    room._bmSkill = null;
  }

  return { isBM, stageFor, onMatchStart, onMatchEnd, PROFILES };
};
