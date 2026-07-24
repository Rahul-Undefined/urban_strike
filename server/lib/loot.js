/* Server-side loot + airdrops. Pure room-state logic; io and clock are
   injected so this module never touches globals. */
'use strict';
const CFG = require('../../public/src/config/index.js');
module.exports = function initLootModule(ctx) {
  const { io, now, mapData } = ctx;

function initPickups(room) {
  const items = CFG.LOOT_ITEMS;
  const byRar = { c: [], r: [], l: [] };
  for (const t in items) byRar[items[t].rar].push(t);
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
      const pool = CFG.AIRDROP.weaponPool;
      cand[Math.floor(Math.random() * cand.length)].t = pool[Math.floor(Math.random() * pool.length)];
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
    } else if (it.kind === 'att') {
      if (p.att[CFG.ATTACH[it.a].cat] === it.a) continue; // already equipped
      p.att[CFG.ATTACH[it.a].cat] = it.a;
      grant = { t: 'att', a: it.a };
    } else if (it.kind === 'weapon') {
      if (p.exW[it.w]) grant = { t: 'ammoFor', w: it.w };
      else { p.exW[it.w] = 1; grant = { t: 'weapon', w: it.w }; }
    } else if (it.kind === 'gear') {
      if (it.g === 'mine') {
        if ((p.mines | 0) >= CFG.GEAR.mine.maxCarry) continue;
        p.mines = Math.min(CFG.GEAR.mine.maxCarry, (p.mines | 0) + it.n);
        grant = { t: 'gear', g: 'mine', n: p.mines };
      } else {
        grant = { t: 'gear', g: 'molotov', n: it.n };
      }
    } else if (it.kind === 'ammo') {
      grant = { t: 'ammo' };
    }
    pk.active = false;
    pk.respawnAt = pk.noRespawn ? Infinity : now() + CFG.LOOT_RESPAWN[it.rar] * 1000;
    io.to(p.id).emit('vitals', { hp: Math.round(p.hp), lv: p.armorLvl, du: Math.round(p.armorDur) });
    if (grant) io.to(p.id).emit('grant', grant);
    io.to(room.code).emit('pickup', { id: pk.id, by: p.id, t: pk.t });
  }
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
  const pts = mapData(room).AIRDROP_POINTS;
  const pt = pts[Math.floor(Math.random() * pts.length)];
  io.to(room.code).emit('airdrop', { x: pt[0], z: pt[1], landAt: now() + CFG.AIRDROP.fallSec * 1000 });
  room.dropFall = setTimeout(() => {
    if (room.state !== 'playing') return;
    const wp = CFG.AIRDROP.weaponPool, ap = CFG.AIRDROP.attPool;
    const types = [wp[(Math.random() * wp.length) | 0], 'armor3', 'medkit', ap[(Math.random() * ap.length) | 0]];
    const offs = [[0.95, 0], [-0.95, 0], [0, 0.95], [0, -0.95]];
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
