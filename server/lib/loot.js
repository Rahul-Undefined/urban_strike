/* Server-side loot + airdrops. Pure room-state logic; io and clock are
   injected so this module never touches globals. */
'use strict';
const CFG = require('../../public/src/config/index.js');
module.exports = function initLootModule(ctx) {
  const { io, now, mapData } = ctx;

function initPickups(room) {
  const items = CFG.LOOT_ITEMS;
  const byRar = { c: [], r: [], l: [] };
  /* drop:1 items are airdrop-exclusive and never enter the ground-spawn pools.
     v10.9 `retired:1` is the weapon cull — the entry stays in LOOT_ITEMS so
     CFG.WEAPON_ORDER indices, viewmodels and the bot kits keep resolving, but
     it never spawns for a player. This is the ONE place the cull is applied,
     so a retired weapon cannot leak back in through a second code path. */
  for (const t in items) if (!items[t].drop && !items[t].retired) byRar[items[t].rar].push(t);
  room.nextLootId = 0;
  room.pickups = [];
  let hasA3 = false, hasLegW = false;
  mapData(room).LOOT_POINTS.forEach(pt => {
    const w = CFG.LOOT_WEIGHTS[pt[3]] || CFG.LOOT_WEIGHTS.g;
    let roll = Math.random(), t = null;
    if (roll >= w.empty) {
      roll -= w.empty;
      const rar = roll < w.c ? 'c' : (roll < w.c + w.r ? 'r' : 'l');
      const pool = byRar[rar];
      t = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!t) return;
    if (t === 'armor3') hasA3 = true;
    if (items[t].kind === 'weapon' && items[t].rar === 'l') hasLegW = true;
    room.pickups.push({ id: room.nextLootId++, t, pos: [pt[0], pt[1], pt[2]], cls: pt[3], active: true, respawnAt: 0 });
  });
  const sigs = room.pickups.filter(p => p.cls === 's');
  if (!hasA3 && sigs.length) sigs[Math.floor(Math.random() * sigs.length)].t = 'armor3';
  if (!hasLegW) {
    const cand = room.pickups.filter(p => (p.cls === 's' || p.cls === 'h') && p.t !== 'armor3');
    if (cand.length) {
      // guarantee one legendary weapon on the ground, but only from the
      // normal-spawn set — the airdrop pool now contains a drop-exclusive gun
      const legW = byRar.l.filter(k => items[k].kind === 'weapon');
      if (legW.length) cand[Math.floor(Math.random() * cand.length)].t = legW[Math.floor(Math.random() * legW.length)];
    }
  }
}
function pickupList(room) { return room.pickups.map(pk => ({ id: pk.id, t: pk.t, p: pk.pos, active: pk.active })); }

function tryCollect(room, p) {
  if (!p.alive) return;
  const R = CFG.MATCH.pickupRadius;
  for (const pk of room.pickups) {
    if (!pk.active) continue;
    const dx = p.pos[0] - pk.pos[0], dy = p.pos[1] - pk.pos[1], dz = p.pos[2] - pk.pos[2];
    if (dx * dx + dz * dz > R * R || Math.abs(dy) > 1.3) continue;

    const it = CFG.LOOT_ITEMS[pk.t];
    let grant = null;
    if (it.kind === 'heal') {
      if (p.hp >= CFG.PLAYER.hp) continue;
      p.hp = Math.min(CFG.PLAYER.hp, p.hp + it.heal);
    } else if (it.kind === 'armor') {
      const max = CFG.ARMOR[it.lvl].dur;
      const up = it.lvl > p.armorLvl || (it.lvl === p.armorLvl && p.armorDur < max * 0.5);
      if (!up) continue;
      p.armorLvl = it.lvl; p.armorDur = max;
    } else if (it.kind === 'helm') {
      // same upgrade rule as armour: take it if it's a better tier, or the same
      // tier when the current one is below half durability
      const hmax = CFG.HELMET[it.l].dur;
      const hup = it.l > p.helmLvl || (it.l === p.helmLvl && p.helmDur < hmax * 0.5);
      if (!hup) continue;
      p.helmLvl = it.l; p.helmDur = hmax;
      grant = { t: 'helm', l: it.l };
    } else if (it.kind === 'att') {
      if (p.att[CFG.ATTACH[it.a].cat] === it.a) continue; // already equipped
      p.att[CFG.ATTACH[it.a].cat] = it.a;
      grant = { t: 'att', a: it.a };
    } else if (it.kind === 'weapon') {
      if (p.exW[it.w]) grant = { t: 'ammoFor', w: it.w };
      else { p.exW[it.w] = 1; grant = { t: 'weapon', w: it.w }; }
    } else if (it.kind === 'gear') {
      if (it.g === 'drone') {
        /* v9.4: a drone pickup in a bot mode is dead weight — drones are
           disabled there — so it is left on the ground rather than collected,
           which is more honest than granting a count the player cannot spend. */
        if (CFG.botsAllowed(room.settings.mode)) continue;
        if ((p.drones | 0) >= CFG.GEAR.drone.maxCarry) continue;
        p.drones = Math.min(CFG.GEAR.drone.maxCarry, (p.drones | 0) + it.n);
        grant = { t: 'gear', g: 'drone', n: p.drones };
      } else if (it.g === 'visor') {
        /* v10.10: a boolean, not a count. Picking up a second visor while
           wearing one must not stack or refresh anything — there is nothing to
           refresh, it lasts until death — so it is left on the ground for
           someone who can use it, the same courtesy the drone branch shows. */
        if (p.visor) continue;
        p.visor = true;
        grant = { t: 'gear', g: 'visor', n: 1 };
      } else if (it.g === 'mine') {
        if ((p.mines | 0) >= CFG.GEAR.mine.maxCarry) continue;
        p.mines = Math.min(CFG.GEAR.mine.maxCarry, (p.mines | 0) + it.n);
        grant = { t: 'gear', g: 'mine', n: p.mines };
      } else {
        grant = { t: 'gear', g: 'molotov', n: it.n };
      }
    } else if (it.kind === 'ammo') {
      /* v9.3: an ammo pickup may name a WEAPON. The Quiver does, so it tops up
         arrows specifically instead of resupplying every gun the player owns —
         a quiver that refills your M249 reads as a bug even though nothing
         crashes. The `ammoFor` grant already existed for exactly this shape, so
         this is a routing change, not a new mechanism. Anything without a `w`
         keeps the old behaviour, which is what Ammo Cache wants. */
      grant = it.w ? { t: 'ammoFor', w: it.w, amount: it.amount | 0 } : { t: 'ammo' };
    }
    pk.active = false;
    pk.respawnAt = pk.noRespawn ? Infinity : now() + CFG.LOOT_RESPAWN[it.rar] * 1000;
    io.to(p.id).emit('vitals', { hp: Math.round(p.hp), lv: p.armorLvl, du: Math.round(p.armorDur) });
    if (grant) io.to(p.id).emit('grant', grant);
    io.to(room.code).emit('pickup', { id: pk.id, by: p.id, t: pk.t, gone: pk.noRespawn ? 1 : 0 });
    /* v10.9: A COLLECTED AIRDROP ITEM IS GONE. RETIRE IT.

       Map loot has a finite count and respawns, so parking it inactive is
       correct — the same record comes back. Airdrop items are `noRespawn` and
       were parked at respawnAt Infinity instead, so every crate added six
       entries that this array could never lose. At periodSec 150 that is +36
       over a 15 min match, +72 over 30, +144 over 60, on top of Urban's 364:
       a list that grows with match length and is walked by respawnPickups on
       every tick, plus a mesh the client keeps forever.

       Retired here rather than filtered at read time so there is exactly one
       place the array shrinks. Marked `gone` for the same-tick collect loop —
       splicing the array while tryCollect is iterating it would skip the next
       pickup — and swept below. */
    if (pk.noRespawn) pk.gone = true;
  }
  if (room.pickups.some(pk => pk.gone)) room.pickups = room.pickups.filter(pk => !pk.gone);
}
function respawnPickups(room) {
  const t = now();
  for (const pk of room.pickups) {
    if (!pk.active && pk.respawnAt <= t) {
      pk.active = true;
      io.to(room.code).emit('pickupSpawn', { id: pk.id });
    }
  }
}

// ---------- airdrops ----------
function scheduleAirdrop(room) {
  clearAirdrop(room);
  const period = Math.max(5, Math.min(600, room.settings.airdropSec || CFG.AIRDROP.periodSec)) * 1000;
  room.dropTimer = setInterval(() => dropCrate(room), period);
}
function clearAirdrop(room) {
  if (room.dropTimer) { clearInterval(room.dropTimer); room.dropTimer = null; }
  if (room.dropFall) { clearTimeout(room.dropFall); room.dropFall = null; }
}
function dropCrate(room) {
  if (room.state !== 'playing') return;
  /* v8.18: guard. A map shipping the wrong key name should degrade to "no
     airdrops on this map", not throw inside a timer and take the match with
     it. metro did exactly that until the config key was fixed. */
  const pts = mapData(room).AIRDROP_POINTS || [];
  if (!pts.length) return;
  const pt = pts[Math.floor(Math.random() * pts.length)];
  io.to(room.code).emit('airdrop', { x: pt[0], z: pt[1], landAt: now() + CFG.AIRDROP.fallSec * 1000 });
  room.dropFall = setTimeout(() => {
    if (room.state !== 'playing') return;
    const wp = CFG.AIRDROP.weaponPool, ap = CFG.AIRDROP.attPool;
    const types = [wp[(Math.random() * wp.length) | 0], 'armor3', 'medkit', ap[(Math.random() * ap.length) | 0]];
    /* v9.4: two extra RANDOM slots on top of the guaranteed four. Unknown items
       are what make a crate worth contesting — see the note in loot.config.js.
       Drawn without replacement so a crate never contains the same exotic
       twice, and skipped entirely if a pool entry has gone stale, because a
       crate that spawns `undefined` is a pickup nobody can collect. */
    const pool = (CFG.AIRDROP.exoticPool || []).filter(t => CFG.LOOT_ITEMS[t]);
    for (let e = 0; e < (CFG.AIRDROP.extraCount || 0) && pool.length; e++) {
      types.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    }
    /* A ring, sized to the number of items, so six do not overlap the way four
       hardcoded offsets would. */
    const offs = types.map((t, i) => {
      const a = (i / types.length) * Math.PI * 2;
      return [Math.cos(a) * 1.15, Math.sin(a) * 1.15];
    });
    const items = types.map((t, i) => {
      const pk = { id: room.nextLootId++, t, pos: [pt[0] + offs[i][0], 1.35, pt[1] + offs[i][1]], cls: 's', active: true, respawnAt: 0, noRespawn: true };
      room.pickups.push(pk);
      return { id: pk.id, t: pk.t, p: pk.pos, active: true };
    });
    io.to(room.code).emit('lootAdd', { items, x: pt[0], z: pt[1] });
  }, CFG.AIRDROP.fallSec * 1000);
}

// ---------- match lifecycle ----------

  return { initPickups, pickupList, tryCollect, respawnPickups,
    scheduleAirdrop, clearAirdrop, dropCrate };
};
