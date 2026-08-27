/* Server-side damage model + hit validation. All match-flow effects
   (lobby pushes, match end) arrive via injected ctx callbacks. */
'use strict';
const CFG = require('../../public/src/config/index.js');
module.exports = function initCombatModule(ctx) {

  /* v8.37 LAST STAND WIN CONDITION.

     Solo: one operator still in. Squads: one squad with anyone still in.

     Disconnected players count as OUT — otherwise a match could hang forever
     waiting on somebody who closed the tab, and with no clock to fall back on
     there would be nothing to break the deadlock. Zero survivors (a mutual
     grenade, the last two trading kills) is a draw rather than a hang. */
  function checkLastStand(room) {
    const teams = modeInfo(room).teams;
    const live = [];
    for (const p of room.players.values()) {
      if (!p.out && p.connected !== false) live.push(p);
    }
    if (teams) {
      const sides = new Set(live.map(p => p.team));
      if (sides.size <= 1) {
        const winTeam = sides.size === 1 ? [...sides][0] : null;
        const champ = winTeam ? (live[0] && live[0].id) : null;
        endMatch(room, champ, sides.size === 1 ? 'laststand' : 'draw');
        return true;
      }
      return false;
    }
    if (live.length <= 1) {
      endMatch(room, live.length === 1 ? live[0].id : null,
        live.length === 1 ? 'laststand' : 'draw');
      return true;
    }
    return false;
  }

  const { io, now, modeInfo, pushLobby, endMatch } = ctx;

function weaponServerDamage(weapon, part, pellets, dist) {
  const w = CFG.WEAPONS[weapon];
  if (!w) return 0;
  let dmg = w.dmg;
  if (w.pellets) dmg *= Math.max(1, Math.min(pellets || 1, w.pellets));
  if (part === 'head') dmg *= (w.head || 1);
  if (part === 'legs') dmg *= (w.legs || 0.72);
  if (dist > w.range) dmg *= Math.max(0.45, 1 - (dist - w.range) / w.range);
  return dmg;
}

function applyDamage(room, victim, dmg, attackerId, weapon, headshot, pointBlank) {
  if (!victim.alive) return;
  const attacker = room.players.get(attackerId);
  const teams = modeInfo(room).teams;
  // friendly fire off in team modes (self-damage from explosives still allowed)
  if (teams && attacker && attackerId !== victim.id && attacker.team === victim.team) return;
  // spawn protection (attacking others still allowed; being hit is not)
  if (victim.protUntil > now() && attackerId !== victim.id) return;

  /* Helmet: spends durability to cut the HEADSHOT BONUS only, never the base
     damage. A head hit for 100 from a 40-base weapon (2.5x) with an H2 helmet
     (0.55) loses 0.55 of the 60-point bonus, so 67 lands. Body and leg shots
     are untouched. Point-blank explosives ignore it, same rule as armour. */
  if (headshot && !pointBlank && victim.helmLvl > 0 && victim.helmDur > 0) {
    const H = CFG.HELMET[victim.helmLvl];
    const w = CFG.WEAPONS[weapon];
    const base = w ? dmg / (w.head || 1) : dmg;
    const bonus = dmg - base;
    if (bonus > 0) {
      const cut = Math.min(bonus * H.absorb, victim.helmDur);
      dmg -= cut;
      victim.helmDur = Math.max(0, victim.helmDur - cut);
      if (victim.helmDur === 0) victim.helmLvl = 0;
    }
  }

  /* tiered armor with durability; point-blank explosives ignore armor entirely

     v8.17: A VEST DOES NOT COVER THE HEAD.

     Until now `soaked` was applied to every hit including headshots, so a
     level-3 vest absorbed 70% of a round that went through the victim's skull
     — on top of the helmet, which had already taken its cut of the headshot
     bonus. Stacked, the two made a headshot kill arithmetically impossible:
     landing 100 damage on a fully-kitted player needed a raw figure above 330,
     which no sane multiplier reaches.

     That is not a balance choice, it is a modelling error. Every major shooter
     separates the two: the helmet mitigates head hits, the vest mitigates body
     and limb hits. Splitting them is what lets "a sniper headshot is a kill"
     be true at all, and it is why the sniper head multipliers below are sized
     against the HELMET only.

     Explosives are unchanged — a blast is not aimed at a hit location, so the
     vest still soaks it wherever the victim was looking. */
  let soaked = 0;
  const vestCovers = !headshot;
  if (pointBlank) {
    victim.armorLvl = 0; victim.armorDur = 0;
    victim.hp = 0;
  } else if (victim.armorLvl > 0 && vestCovers) {
    const rate = CFG.ARMOR[victim.armorLvl].absorb;
    soaked = Math.min(victim.armorDur, dmg * rate);
    victim.armorDur -= soaked;
    if (victim.armorDur <= 0.5) { victim.armorLvl = 0; victim.armorDur = 0; }
  }
  if (!pointBlank) victim.hp = Math.max(0, victim.hp - (dmg - soaked));
  victim.lastHitAt = now();          // v4.9: gates out-of-combat regeneration
  // scoreboard credit + assist bookkeeping
  if (attacker && attackerId !== victim.id) {
    attacker.damage += dmg;
    const rec = victim.rd[attackerId] || (victim.rd[attackerId] = { d: 0, t: 0 });
    rec.d += dmg; rec.t = now();
  }

  io.to(victim.id).emit('damaged', {
    // v4.9: report the damage APPLIED, not just the resulting hp. Deriving damage
    // from an hp delta breaks the moment anything else moves hp between the two
    // reads (med kits, mines, and now out-of-combat regen). The v4.7 changelog
    // said this field existed; it did not.
    dmg: Math.round(dmg),
    hp: Math.round(victim.hp), lv: victim.armorLvl, du: Math.round(victim.armorDur),
    from: attackerId, fromPos: attacker ? attacker.pos : null
  });
  if (attacker && attackerId !== victim.id) {
    io.to(attackerId).emit('hitConfirm', { dmg: Math.round(dmg), headshot: !!headshot, kill: victim.hp <= 0, v: victim.id });
  }

  if (victim.hp <= 0) {
    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = now() + CFG.MATCH.respawnDelay * 1000;
    /* v8.37 LAST STAND: one life, and that was it.

       `out` is what makes a mode an elimination match. It is set here, on the
       server, at the only place a player can actually die — not derived on the
       client, where a dropped packet would resurrect someone. */
    const livesN = CFG.livesFor(room.settings.mode);
    if (livesN > 0 && victim.deaths >= livesN) {
      victim.out = true;
      victim.respawnAt = Infinity;         // nothing will ever let them back in
    }
    let killerName = 'the world', killerStreak = 0;
    if (attacker) {
      if (attackerId === victim.id) { killerName = victim.name; }
      else {
        attacker.kills++;
        attacker.streak++;
        killerStreak = attacker.streak;
        if (attacker.streak > (attacker.bestStreak || 0)) attacker.bestStreak = attacker.streak;
        /* v10.10: the nuke rides THIS counter rather than keeping its own.
           A second streak counter is a second thing to reset, and combat.js
           already resets this one on death a few lines below. */
        if (ctx.onKillStreak) ctx.onKillStreak(room, attacker);
        killerName = attacker.name;
        if (teams && attacker.team) room.teamKills[attacker.team]++;

        /* v8.29 MATCH INSIGHTS. Recorded here because this is the only place
           that knows all of it at once — who, whom, with what, from how far,
           and whether it was a head hit. Reconstructing any of this later from
           the killfeed would mean trusting the client. Plain counters, no
           timers, nothing that can throw: a bad insight must never be able to
           break a kill. */
        const S = room.insights || (room.insights = {
          pairs: {}, weapons: {}, longest: null, first: null, last: null, heads: {}
        });
        const pk = attackerId + '>' + victim.id;
        S.pairs[pk] = (S.pairs[pk] || 0) + 1;
        const wk = attackerId + '|' + (weapon || '?');
        S.weapons[wk] = (S.weapons[wk] || 0) + 1;
        if (headshot) S.heads[attackerId] = (S.heads[attackerId] || 0) + 1;
        let dist = 0;
        if (attacker.pos && victim.pos) {
          const dx = attacker.pos[0] - victim.pos[0];
          const dy = attacker.pos[1] - victim.pos[1];
          const dz = attacker.pos[2] - victim.pos[2];
          dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        if (dist > 0 && (!S.longest || dist > S.longest.m)) {
          S.longest = { id: attackerId, name: attacker.name, m: dist, weapon: weapon || '?' };
        }
        const stamp = { id: attackerId, name: attacker.name, victim: victim.name };
        if (!S.first) S.first = stamp;
        S.last = stamp;
      }
    }
    // assists: meaningful damage shortly before the kill, by someone else
    const assistIds = [];
    const cutoff = now() - CFG.MATCH.assistWindow * 1000;
    for (const aid in victim.rd) {
      if (aid === attackerId || aid === victim.id) continue;
      const rec = victim.rd[aid];
      if (rec.t >= cutoff && rec.d >= CFG.MATCH.assistMinDmg) {
        const ap = room.players.get(aid);
        if (ap) { ap.assists++; assistIds.push(aid); }
      }
    }
    victim.rd = {};
    victim.streak = 0;
    /* v10.10: dying loses an armed nuke, whether or not the target map was
       open. This is the rule that makes the reward cost something — see the
       header of server/lib/nuke.js. One call, one place. */
    if (ctx.onDeathClearStreakReward) ctx.onDeathClearStreakReward(room, victim);
    /* v11.0: kill distance rides the death event. Rahul: "players need to
       clearly understand where shots are coming from and who killed whom" —
       the death screen now names killer, weapon AND range, which is the fact
       that tells you whether you were rushed or sniped. Envelope event, not
       the snapshot, so the wire format is untouched. */
    const _atk = room.players.get(attackerId);
    const _dist = (_atk && _atk.pos && victim.pos)
      ? Math.round(Math.hypot(_atk.pos[0] - victim.pos[0], _atk.pos[1] - victim.pos[1],
                              _atk.pos[2] - victim.pos[2]))
      : null;
    io.to(room.code).emit('death', {
      victimId: victim.id, victimName: victim.name,
      killerId: attackerId, killerName, killerStreak, assistIds, dist: _dist,
      weapon, headshot: !!headshot, self: attackerId === victim.id,
      out: !!victim.out, livesLeft: CFG.livesFor(room.settings.mode)
        ? Math.max(0, CFG.livesFor(room.settings.mode) - victim.deaths) : null
    });
    pushLobby(room);

    /* Elimination is checked BEFORE the kill target, because in Last Stand
       there is no kill target and no clock — being the last one breathing is
       the only way the match can end. */
    if (CFG.isElimination(room.settings.mode) && checkLastStand(room)) return;
    if (attacker && attackerId !== victim.id) {
      const target = room.settings.killTarget;
      /* v8.30: target 0 means UNLIMITED — never end on kills, let the clock
         decide. Guarding on `> 0` rather than a separate flag keeps the
         setting a single number all the way from the dropdown to here. */
      if (target > 0 &&
          (teams ? room.teamKills[attacker.team] >= target : attacker.kills >= target)) {
        endMatch(room, attackerId, 'kills');
      }
    }
  }
}

// Lag-compensation lite: accept the claimed victim position only if it is
// close to where the server has recently seen that victim.
function positionPlausible(victim, claimPos) {
  if (!claimPos || claimPos.length !== 3) return false;
  const tol = CFG.NET.hitTolerance;
  const cutoff = now() - CFG.NET.historyMs;
  const check = (pos) => {
    const dx = pos[0] - claimPos[0], dy = pos[1] - claimPos[1], dz = pos[2] - claimPos[2];
    return dx * dx + dy * dy + dz * dz <= tol * tol;
  };
  if (check(victim.pos)) return true;
  for (let i = victim.history.length - 1; i >= 0; i--) {
    const h = victim.history[i];
    if (h.t < cutoff) break;
    if (check(h.pos)) return true;
  }
  return false;
}

function fireRateOk(shooter, weapon) {
  const w = CFG.WEAPONS[weapon];
  if (!w || !w.rpm) return true;
  if (weapon === 'frag' || weapon === 'rocket') return true;
  const minInterval = (60000 / w.rpm) * 0.55; // generous tolerance for jitter
  const last = shooter.lastShotAt[weapon] || 0;
  const t = now();
  if (t - last < minInterval) return false;
  shooter.lastShotAt[weapon] = t;
  return true;
}

// ---------- sockets ----------

  return { weaponServerDamage, applyDamage, positionPlausible, fireRateOk };
};
