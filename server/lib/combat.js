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

function weaponServerDamage(weapon, part, pellets, dist, prone) {
  const w = CFG.WEAPONS[weapon];
  if (!w) return 0;
  /* v2.9 (Rahul): lying down, every gun reaches HALF its range and not a metre
     more — no warning, no popup, just the number. Standing or crouched, the
     whole range. So the prone hitbox cut (v2.7) buys cover, not a sniper nest. */
  if (prone && w.range > 0 && dist > w.range * 0.5) return 0;
  let dmg = w.dmg;
  if (w.pellets) dmg *= Math.max(1, Math.min(pellets || 1, w.pellets));
  if (part === 'head') dmg *= (w.head || 1);
  if (part === 'legs') dmg *= (w.legs || 0.72);
  if (dist > w.range) dmg *= Math.max(0.45, 1 - (dist - w.range) / w.range);
  return dmg;
}

/* ===== v1.0v - THE HELICOPTER PROTECTS ITS RIDERS =====
   Rahul: "the player in the heli can't be killed until the helicopter is put
   down; from any gun the player will not be killed." A listed rider of an
   airborne machine takes no damage from anything except the machine's own
   end (helidown), a fall (helifall) and the zone's bleed. Guns, grenades,
   rockets aimed at the body, fire, mines: nothing. Down the machine (RPG or
   EMP) and the riders die with it. */
const RIDER_PASS = { helidown: 1, helifall: 1, zone: 1 };
function riderShielded(room, victim, weapon) {
  const list = (room && room.helis) || (room && room.heli ? [room.heli] : []);
  for (const h of list) {
    if (!h || !h.riders || h.riders.indexOf(victim.id) < 0) continue;
    if (h.state !== 'flying' && h.state !== 'returning' && h.state !== 'crash') continue;   /* v2.0: a falling cabin still shields */
    return !RIDER_PASS[weapon];
  }
  return false;
}
function applyDamage(room, victim, dmg, attackerId, weapon, headshot, pointBlank, opts) {
  if (riderShielded(room, victim, weapon)) return;   /* v1.0v */
  if (!victim.alive) return;
  const attacker = room.players.get(attackerId);
  const teams = modeInfo(room).teams;
  // friendly fire off in team modes (self-damage from explosives still allowed)
  if (teams && attacker && attackerId !== victim.id && attacker.team === victim.team) return;
  // spawn protection (attacking others still allowed; being hit is not)
  if (victim.protUntil > now() && attackerId !== victim.id) return;
  /* v2.8: a DOWNED player has no vest, no shield, no hp — only the down pool.
     Every hit drains it; empty, they are finished by whoever emptied it. The
     bleed-out and the finish come back in through `opts.noDown`. */
  if (victim.down && !(opts && opts.noDown)) { hitDown(room, victim, dmg, attackerId, weapon, headshot); return; }

  /* ===== v15.0 - THE SHIELD TAKES IT FIRST (fix 5) =====
     Server-owned hp on the victim, spent before helmet-cut damage reaches
     the vest. Point-blank explosives ignore it like everything else. A
     scoped rifle SHATTERS it: the shield is gone in one round and
     `sniperPass` of that round still lands, so the shield is cover against
     rifles and SMGs, not against the weapon class that exists to answer
     cover. Overflow (damage past the shield's remaining hp) continues into
     the normal armour path below. The room is told on every change so every
     client can draw the slab and its state. */
  if (!pointBlank && (victim.shieldHp | 0) > 0) {
    const SH = CFG.GEAR.shield || {};
    const wdef = CFG.WEAPONS[weapon];
    const sniper = !!(SH.sniperBreaks && wdef && wdef.scope === true);
    let absorbed;
    if (sniper) { absorbed = dmg * (1 - (SH.sniperPass === undefined ? 0.5 : SH.sniperPass)); victim.shieldHp = 0; }
    else { absorbed = Math.min(victim.shieldHp, dmg); victim.shieldHp -= absorbed; }
    dmg -= absorbed;
    if (attacker && attackerId !== victim.id) attacker.damage += absorbed;   // shield damage still counts as damage dealt
    io.to(room.code).emit('shield', { id: victim.id, hp: Math.max(0, Math.round(victim.shieldHp)),
      max: SH.hp, broke: victim.shieldHp <= 0 ? 1 : 0, sniper: sniper ? 1 : 0 });
    if (dmg <= 0) {
      victim.lastHitAt = now();
      io.to(victim.id).emit('damaged', { dmg: 0, hp: Math.round(victim.hp), lv: victim.armorLvl,
        du: Math.round(victim.armorDur), sh: Math.round(victim.shieldHp), from: attackerId, fromPos: attacker ? attacker.pos : null });
      if (attacker && attackerId !== victim.id)
        io.to(attackerId).emit('hitConfirm', { dmg: Math.round(absorbed), headshot: false, kill: false, v: victim.id, shield: 1 });
      return;
    }
  }
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
  if (attacker && attackerId !== victim.id) victim.lastHitByTeam = attacker.team || null;   /* v1.0w: for the train's credit in squads */
  // scoreboard credit + assist bookkeeping
  /* v1.0w (Rahul: "killed by the train — accidentally or not — gives the
     opponent points in team and squad modes, nothing in individual"): the
     victim's side loses a body; the OTHER side scores. Two sides: the other
     one. More (squads): the side that last hurt the victim within 15 s, else
     nobody — a squad that never touched them earned nothing. Individual
     modes: a death, no kill, as before. */
  if (weapon === 'train' && teams && victim.team) {
    const sides = CFG.activeTeams(room.settings.mode);
    let credit = null;
    if (sides.length === 2) credit = sides[0] === victim.team ? sides[1] : sides[0];
    else if (victim.lastHitByTeam && victim.lastHitByTeam !== victim.team && now() - (victim.lastHitAt || 0) < 15000) credit = victim.lastHitByTeam;
    if (credit && room.teamKills && credit in room.teamKills) {
      room.teamKills[credit]++;
      /* v1.1.1 (Rahul): no popup — the kill FEED carries the credit instead */
      victim.trainCredit = (room.settings.teamNames && room.settings.teamNames[credit]) || (CFG.TEAMS[credit] || {}).name || credit;
    }
  }
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
    sh: Math.round(victim.shieldHp || 0),   /* v15.0 (fix 5) */
    from: attackerId, fromPos: attacker ? attacker.pos : null
  });
  if (attacker && attackerId !== victim.id) {
    io.to(attackerId).emit('hitConfirm', { dmg: Math.round(dmg), headshot: !!headshot, kill: victim.hp <= 0, v: victim.id });
  }

  if (victim.hp <= 0) {
    /* ===== v2.8 - KNOCKED, NOT KILLED (team and squad modes) =====
       Rahul: "take inspiration from PUBG — the avatar is knocked out first,
       a team-mate can revive them within 20 seconds; no revive by then and
       it is a death and a point to the opponent; revived, they continue on
       low health." The knock happens here, at the only place hp reaches
       zero, and the death path below is skipped until the bleed-out or a
       finish brings the victim back through with opts.noDown. */
    if (!(opts && opts.noDown) && shouldDown(room, victim, attackerId, weapon)) { knock(room, victim, attackerId, weapon, headshot); return; }
    victim.alive = false;
    victim.down = false; victim.crouch = victim.crouch === 3 ? 2 : victim.crouch;
    victim.diedAt = now();   /* v2.9: a frag already in the air still counts (server.js 'hit') */
    victim.deaths++;
    if (ctx.onDeathCrate) { try { ctx.onDeathCrate(room, victim); } catch (e) { console.error('deathCrate', e); } }   /* v2.9 */
    /* v1.0d: arenas climb the redeploy ladder with each death; big maps keep
       the flat delay. The number is computed HERE and shipped in the death
       payload below, so the client counts down what the server will accept. */
    const respawnSec = CFG.respawnDelayFor ? CFG.respawnDelayFor(room.settings.map || 'urban', victim.deaths) : CFG.MATCH.respawnDelay;
    victim.respawnSec = respawnSec;
    victim.respawnAt = now() + respawnSec * 1000;
    /* v8.37 LAST STAND: one life, and that was it.

       `out` is what makes a mode an elimination match. It is set here, on the
       server, at the only place a player can actually die — not derived on the
       client, where a dropped packet would resurrect someone. */
    const livesN = CFG.livesFor(room.settings.mode);
    if (livesN > 0 && victim.deaths >= livesN) {
      victim.out = true;
      victim.respawnAt = Infinity;         // nothing will ever let them back in
    }
    /* ===== v2.6 - A ZONE DEATH COSTS A POINT =====
       Rahul: "the player when died in the zone will lose a point on the team
       level, -1 each time died in the zone." Team and squad modes: the
       victim's side loses one from its score. Solo: the score IS the kill
       count, so the victim's own kills drop by one (never below zero on the
       board — a negative kill count reads as a bug, not a penalty). */
    if (weapon === 'zone') {
      if (teams && victim.team && room.teamKills && victim.team in room.teamKills) room.teamKills[victim.team] = (room.teamKills[victim.team] | 0) - 1;
      else if (!teams) victim.kills = Math.max(0, (victim.kills | 0) - 1);
      victim.zoneDeaths = (victim.zoneDeaths | 0) + 1;
    }
    let killerName = 'the world', killerStreak = 0;
    if (attacker) {
      if (attackerId === victim.id) { killerName = victim.name; }
      else {
        attacker.kills++;
        attacker.streak++;
        /* v1.0e (Rahul): kills a STRIKE scores — the nuke, the rocket — count
           as kills and toward the streak announcements, but NOT toward the
           next strike. A five-kill nuke that killed four was re-arming on the
           very next kill; the reward has to be re-earned by the player's own
           hand. nuke.js / rocket.js read (streak - strikeKills). */
        /* v15.0 (fix 9): mine kills are a scoreboard KPI of their own. Counted
           here, the only place a kill is credited, on the weapon tag the mine
           module already passes ('mine') — no second bookkeeping path. */
        if (weapon === 'mine') attacker.mineKills = (attacker.mineKills | 0) + 1;
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
      credit: victim.trainCredit || null,   /* v1.1.1: the side a train death scored for */
      respawnSec: victim.out ? 0 : respawnSec,   /* v1.0d: the arena ladder rung, or the flat delay */
      out: !!victim.out, livesLeft: CFG.livesFor(room.settings.mode)
        ? Math.max(0, CFG.livesFor(room.settings.mode) - victim.deaths) : null
    });
    victim.trainCredit = null;
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
  /* v2.0: a bolt-action's cycle is gated by the client's boltTime, not rpm, and
     a clean shot should never be eaten by a timer — 0.35 of the rpm interval
     for scoped rifles, 0.55 for everything else */
  const minInterval = (60000 / w.rpm) * (w.scope === true ? 0.35 : 0.55); // generous tolerance for jitter
  const last = shooter.lastShotAt[weapon] || 0;
  const t = now();
  if (t - last < minInterval) return false;
  shooter.lastShotAt[weapon] = t;
  return true;
}

// ---------- sockets ----------

  /* ===== v2.8 - THE DOWN STATE =====
     shouldDown: team or squad mode, a human, not already down, not the zone
     (a bleed outside the circle is a death — nobody revives you in the red),
     and at least one team-mate still standing (the last one standing dies
     outright, as in PUBG — there is nobody left to come).
     knock: hp pinned at 1 and `alive` kept TRUE (they move, crawl, throw,
     place, shoot the pistol — server.js gates the rest), posture 3 on the
     wire so every client lays them down, a 20 s clock, the down pool full.
     hitDown: hits drain the pool; empty, the shooter finishes them.
     tick: the clock runs out, the knocker gets the kill. revive: a team-mate
     within reach pings every ~200 ms while holding the key; reviveSec of
     continuous pings (a gap of 700 ms resets) stands them up on lowHp. */
  const D = () => CFG.DOWN || (CFG.MATCH && CFG.MATCH.DOWN) || { sec: 20, pool: 100, reviveSec: 4, reviveRange: 2.6, reviveHp: 30 };
  function standingMates(room, p) {
    let n = 0;
    for (const q of room.players.values()) if (q.id !== p.id && q.alive && !q.down && !q.out && q.team && q.team === p.team) n++;
    return n;
  }
  function shouldDown(room, victim, attackerId, weapon) {
    if (!modeInfo(room).teams || !victim.team || victim.bot || victim.down) return false;
    if (weapon === 'zone' || weapon === 'helifall' || weapon === 'train') return false;
    return standingMates(room, victim) > 0;
  }
  function knock(room, victim, attackerId, weapon, headshot) {
    const attacker = room.players.get(attackerId);
    victim.down = true; victim.hp = 1; victim.downHp = D().pool;
    victim.downAt = now(); victim.downUntil = now() + D().sec * 1000;
    victim.downBy = attackerId; victim.downWeapon = weapon; victim.downHead = !!headshot;
    victim.reviveProg = 0; victim.reviveLast = 0; victim.reviveBy = null;
    victim.crouch = 3;   /* wire posture: down — every client lays the avatar flat */
    victim.lastHitAt = now();
    if (attacker && attacker.id !== victim.id) attacker.knocks = (attacker.knocks | 0) + 1;
    io.to(room.code).emit('knocked', { victimId: victim.id, victimName: victim.name, byId: attackerId, byName: attacker ? attacker.name : 'the world',
      weapon, headshot: !!headshot, sec: D().sec, team: victim.team });
    io.to(victim.id).emit('vitals', { hp: 1, lv: victim.armorLvl, du: Math.round(victim.armorDur), sh: 0 });
  }
  function hitDown(room, victim, dmg, attackerId, weapon, headshot) {
    const attacker = room.players.get(attackerId);
    if (attacker && attackerId !== victim.id) {
      attacker.damage += dmg;
      const rec = victim.rd[attackerId] || (victim.rd[attackerId] = { d: 0, t: 0 });
      rec.d += dmg; rec.t = now();
    }
    /* v2.9 (Rahul): "if the opponent still shoots the knocked player, the
       player dies" — any hit while down is the finish. The pool is gone. */
    victim.downHp = 0;
    victim.lastHitAt = now();
    io.to(victim.id).emit('downHit', { dmg: Math.round(dmg), pool: 0, max: D().pool, from: attackerId,
      fromPos: attacker && attacker.pos ? [attacker.pos[0], attacker.pos[1], attacker.pos[2]] : null });
    finishDown(room, victim, attackerId, weapon, headshot, 'finished');
  }
  function finishDown(room, victim, byId, weapon, headshot, how) {
    if (!victim.down) return;
    victim.down = false; victim.downHow = how;
    io.to(room.code).emit('downEnd', { id: victim.id, how: how, byId: byId });
    applyDamage(room, victim, 999, byId, weapon, headshot, true, { noDown: true });
  }
  function reviveNow(room, victim, by) {
    if (!victim.down) return;
    victim.down = false; victim.hp = D().reviveHp; victim.downHow = 'revived';
    victim.crouch = 2; victim.reviveProg = 0; victim.reviveBy = null;
    victim.protUntil = now() + 1500;   // a moment to get off the floor
    if (by) by.revives = (by.revives | 0) + 1;
    io.to(room.code).emit('downEnd', { id: victim.id, how: 'revived', byId: by ? by.id : null, byName: by ? by.name : null, name: victim.name });
    io.to(victim.id).emit('vitals', { hp: Math.round(victim.hp), lv: victim.armorLvl, du: Math.round(victim.armorDur), sh: Math.round(victim.shieldHp || 0) });
  }
  function tickDown(room) {
    if (room.state !== 'playing') return;
    const t = now();
    for (const p of room.players.values()) {
      if (!p.down) continue;
      if (!p.alive) { p.down = false; continue; }
      if (p.reviveProg > 0 && t - p.reviveLast > 700) { p.reviveProg = 0; p.reviveBy = null; io.to(p.id).emit('reviveProg', { f: 0, by: null }); }
      if (standingMates(room, p) === 0) { finishDown(room, p, p.downBy, p.downWeapon, p.downHead, 'squad'); continue; }   // nobody left to come
      if (t >= p.downUntil) finishDown(room, p, p.downBy, p.downWeapon, p.downHead, 'bleed');
    }
  }
  function revive(room, reviver, targetId) {
    const v = room.players.get(targetId);
    if (!v || !v.down || !v.alive) return { ok: false, err: 'Nobody to revive' };
    if (!reviver.alive || reviver.down) return { ok: false, err: 'You cannot revive now' };
    if (!reviver.team || reviver.team !== v.team) return { ok: false, err: 'Not your team' };
    const dist = Math.hypot(reviver.pos[0] - v.pos[0], reviver.pos[1] - v.pos[1], reviver.pos[2] - v.pos[2]);
    if (dist > D().reviveRange) return { ok: false, err: 'Get closer' };
    const t = now();
    if (v.reviveBy && v.reviveBy !== reviver.id && t - v.reviveLast < 700) return { ok: false, err: 'Someone is already reviving them' };
    const step = v.reviveLast ? Math.min(300, t - v.reviveLast) : 0;
    v.reviveProg = (v.reviveBy === reviver.id ? v.reviveProg : 0) + step;
    v.reviveBy = reviver.id; v.reviveLast = t;
    const f = Math.min(1, v.reviveProg / (D().reviveSec * 1000));
    io.to(v.id).emit('reviveProg', { f: f, by: reviver.name });
    if (f >= 1) { reviveNow(room, v, reviver); return { ok: true, f: 1, done: true }; }
    return { ok: true, f: f };
  }
  return { weaponServerDamage, applyDamage, positionPlausible, fireRateOk, tickDown, revive };
};
