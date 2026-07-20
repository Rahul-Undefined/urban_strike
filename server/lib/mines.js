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
  return { reset, place, tick, clear };
};
