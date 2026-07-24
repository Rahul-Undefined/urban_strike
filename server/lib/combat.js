/* Server-side damage model + hit validation. All match-flow effects
   (lobby pushes, match end) arrive via injected ctx callbacks. */
'use strict';
const CFG = require('../../public/src/config/index.js');
module.exports = function initCombatModule(ctx) {
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

  // tiered armor with durability; point-blank explosives ignore armor entirely
  let soaked = 0;
  if (pointBlank) {
    victim.armorLvl = 0; victim.armorDur = 0;
    victim.hp = 0;
  } else if (victim.armorLvl > 0) {
    const rate = CFG.ARMOR[victim.armorLvl].absorb;
    soaked = Math.min(victim.armorDur, dmg * rate);
    victim.armorDur -= soaked;
    if (victim.armorDur <= 0.5) { victim.armorLvl = 0; victim.armorDur = 0; }
  }
  if (!pointBlank) victim.hp = Math.max(0, victim.hp - (dmg - soaked));
  // scoreboard credit + assist bookkeeping
  if (attacker && attackerId !== victim.id) {
    attacker.damage += dmg;
    const rec = victim.rd[attackerId] || (victim.rd[attackerId] = { d: 0, t: 0 });
    rec.d += dmg; rec.t = now();
  }

  io.to(victim.id).emit('damaged', {
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
    let killerName = 'the world', killerStreak = 0;
    if (attacker) {
      if (attackerId === victim.id) { killerName = victim.name; }
      else {
        attacker.kills++;
        attacker.streak++;
        killerStreak = attacker.streak;
        killerName = attacker.name;
        if (teams && attacker.team) room.teamKills[attacker.team]++;
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
    io.to(room.code).emit('death', {
      victimId: victim.id, victimName: victim.name,
      killerId: attackerId, killerName, killerStreak, assistIds,
      weapon, headshot: !!headshot, self: attackerId === victim.id
    });
    pushLobby(room);
    if (attacker && attackerId !== victim.id) {
      const target = room.settings.killTarget;
      if (teams ? room.teamKills[attacker.team] >= target : attacker.kills >= target) {
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
