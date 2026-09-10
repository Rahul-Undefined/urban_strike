/* Server-authoritative AP mines: placement validation, arming, proximity
   trigger, guaranteed kill on the triggering player, radius splash.
   FF rules and self-damage semantics are enforced by applyDamage + local
   team checks. Injected ctx keeps this module global-free. */
"use strict";
const CFG = require("../../public/src/config/index.js");
module.exports = function initMinesModule(ctx) {
  const { io, now, applyDamage, modeInfo } = ctx;
  const G = CFG.GEAR.mine;

  function reset(room) { room.mines = []; room.mineSeq = 0; }
  function clear(room) { room.mines = []; }

  /* ===== v15.0 - THE SMALL-MAP RATION (fix 8) =====
     Rahul: "In small maps, maximum mines a player can use is 20 — 5 mines per
     life up to 4 times. Not applied to big maps."

     Called by spawnPlayer on EVERY respawn (the v10.15 refill point). On a
     smallMap the refill draws from a per-match budget of CFG.GEAR.mine
     .lifetimeSmall, so the fifth life spawns with none; everywhere else it is
     the unconditional `start` it always was. `mineIssued` is per player per
     match — zeroed in startMatch beside kills/deaths, and by returnLobby.
     Loot mines (AP Mines x2 on the floor) are deliberately NOT rationed:
     they cost a walk, and the ration exists to stop the free refill turning a
     40 m room into a minefield. Returns what the spawn should carry. */
  function refillFor(room, p) {
    const start = G.start | 0;
    const m = room && room.settings && room.settings.map;
    const small = !!(m && CFG.MAPS && CFG.MAPS[m] && CFG.MAPS[m].smallMap);
    const cap = small ? (G.lifetimeSmall | 0) : 0;
    if (!cap) return start;
    const issued = p.mineIssued | 0;
    const grant = Math.max(0, Math.min(start, cap - issued));
    p.mineIssued = issued + grant;
    return grant;
  }

  function place(room, p, pos) {
    if (!Array.isArray(pos) || pos.length !== 3 || pos.some(v => typeof v !== "number" || !isFinite(v)))
      return { ok: false, err: "Bad position" };
    if ((p.mines | 0) <= 0) return { ok: false, err: "No mines left" };
    const dx = pos[0] - p.pos[0], dz = pos[2] - p.pos[2];
    if (dx * dx + dz * dz > 2.5 * 2.5) return { ok: false, err: "Too far" };
    p.mines--;
    room.mineSeq = (room.mineSeq || 0) + 1;
    const m = { id: "m" + room.mineSeq, owner: p.id, team: p.team,
      x: pos[0], y: Math.max(0.06, pos[1] - 0.86), z: pos[2],
      armAt: now() + G.armSec * 1000 };
    (room.mines = room.mines || []).push(m);
    io.to(room.code).emit("minePlaced", { id: m.id, x: m.x, y: m.y, z: m.z });
    return { ok: true, left: p.mines };
  }

  function tick(room) {
    if (!room.mines || !room.mines.length) return;
    const teams = modeInfo(room).teams;
    const t = now();
    for (let i = room.mines.length - 1; i >= 0; i--) {
      const m = room.mines[i];
      if (t < m.armAt) continue;
      let trig = null;
      for (const p of room.players.values()) {
        if (!p.alive || p.id === m.owner) continue;
        if (teams && p.team === m.team) continue;
        const dx = p.pos[0] - m.x, dz = p.pos[2] - m.z;
        if (dx * dx + dz * dz <= G.trigger * G.trigger && Math.abs(p.pos[1] - m.y) < 1.6) { trig = p; break; }
      }
      if (!trig) continue;
      room.mines.splice(i, 1);
      io.to(room.code).emit("mineBoom", { id: m.id, x: m.x, y: m.y, z: m.z });
      applyDamage(room, trig, G.dmg, m.owner, "mine", false, true); // instant kill through armor
      for (const p of room.players.values()) {                      // splash with falloff
        if (!p.alive || p === trig) continue;
        const dx = p.pos[0] - m.x, dz = p.pos[2] - m.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > G.radius || Math.abs(p.pos[1] - m.y) > 2.4) continue;
        if (teams && p.id !== m.owner && p.team === m.team) continue;
        const dmg = Math.round(G.dmg * 0.45 * (1 - d / G.radius));
        if (dmg > 0) applyDamage(room, p, dmg, m.owner, "mine", false, false);
      }
    }
  }
  /* ===== v15.0 - EMP (fix 1) =====
     Destroys every ARMED-OR-ARMING mine on the map that does not belong to
     the caller or the caller's side. Server-authoritative like placement: the
     client asks, the server decides which mines are hostile, spends the
     charge, and tells the room which ids vanished so every client can drop
     the mesh. Refused without spending when there is nothing to fry — a
     spent charge that visibly did nothing reads as the button being broken.
     Owners of destroyed mines are told, because a minefield that silently
     stops existing is a bug report waiting to happen. */
  function emp(room, p) {
    if (!p || !p.alive) return { ok: false, err: "Not alive" };
    if ((p.emps | 0) <= 0) return { ok: false, err: "No EMP charge" };
    const teams = modeInfo(room).teams;
    const mines = room.mines || [];
    const gone = [], byOwner = {};
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      if (m.owner === p.id) continue;
      if (teams && m.team && m.team === p.team) continue;
      mines.splice(i, 1);
      gone.push({ id: m.id, x: m.x, y: m.y, z: m.z });
      byOwner[m.owner] = (byOwner[m.owner] | 0) + 1;
    }
    if (!gone.length) return { ok: false, err: "No enemy mines to disable" };
    p.emps--;
    io.to(room.code).emit("empBlast", { by: p.id, x: p.pos[0], y: p.pos[1], z: p.pos[2], mines: gone });
    for (const oid in byOwner) {
      const q = room.players.get(oid);
      if (q && !q.bot && q.connected !== false)
        io.to(oid).emit("toast", { msg: "An EMP destroyed " + byOwner[oid] + " of your mine" + (byOwner[oid] === 1 ? "" : "s") });
    }
    return { ok: true, left: p.emps, cleared: gone.length };
  }

  return { reset, place, tick, clear, refillFor, emp };
};
