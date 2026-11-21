/* server/lib/vehicles.js — v2.13. VEHICLES ON URBAN.

   Rahul: "Add bike, car, bus, tank, auto in the urban big map so that it is
   faster to travel in the city ... vehicles PUBG style mei road pe khade
   rahenge, usko lekar drive kar sakte hai."

   THE MODEL, and who owns what:
     * The SERVER owns existence: which vehicles there are, where each was last
       left, its health, and who sits in which seat. Parking spots come from a
       table generated out of the map's own walk graph
       (tools/gen-vehicle-spots.js -> config/vehicle-spots.config.js), never
       typed.
     * The DRIVER'S CLIENT owns the driving, exactly as every player's client
       owns its own walking in this game: it simulates the car against the
       world and reports the pose 20 times a second ('veh'). The server checks
       the report is from the driver and within the vehicle's top speed, keeps
       it, and puts it in the snapshot for everyone else.
     * Damage is the server's: bullets on the hull ('vehHit', scaled by the
       type's armour), ramming a player ('vehRam', checked for distance and
       speed, then the ordinary applyDamage), and the explosion that kills
       everyone aboard when the hull is spent.

   A vehicle stays where it is left. A destroyed one is replaced at a free
   parking spot after VEHICLES.respawnSec. */
'use strict';

module.exports = function initVehicles(ctx) {
  const CFG = ctx.CFG, io = ctx.io, now = ctx.now;
  const V = CFG.VEHICLES || null;
  const TYPES = V ? Object.keys(V.types) : [];
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

  function enabled(room) { return !!(V && V.maps.indexOf(room.settings.map || 'urban') >= 0 && (CFG.VEHICLE_SPOTS || {})[room.settings.map || 'urban']); }
  function spotsOf(room) { return (CFG.VEHICLE_SPOTS || {})[room.settings.map || 'urban'] || []; }
  function make(S, type, sp, idx) {
    const T = V.types[type];
    return { id: S.next++, type: type, x: sp[0], y: sp[1], z: sp[2], ry: sp[3], sp: 0, hp: T.hp, seats: new Array(T.seats).fill(null),
             fuel: Math.round((V.fuelMin || 45) + Math.random() * (100 - (V.fuelMin || 45))), lit: 0, hornAt: 0,
             spot: idx, movedAt: 0, dirty: true, lastAt: 0 };
  }
  function start(room) {
    room.veh = null;
    if (!enabled(room)) return null;
    const spots = spotsOf(room), order = spots.map((s, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0, t = order[i]; order[i] = order[j]; order[j] = t; }
    const S = room.veh = { list: [], next: 1, respawns: [], full: true };
    const mix = V.mix, used = [];
    for (let k = 0, n = 0; n < Math.min(V.count, spots.length) && k < order.length; k++) {
      const idx = order[k], sp = spots[idx];
      let type = mix[n % mix.length];
      /* nothing an operator carries can hurt a tank: in Bot Ops it would be a free win */
      if (V.types[type].sealed && CFG.MODES[room.settings.mode] && CFG.MODES[room.settings.mode].bots) type = 'car';
      const T = V.types[type];
      if (T.big && !sp[4]) continue;                               // a bus or a tank needs a long bay
      if (used.some(u => Math.hypot(u[0] - sp[0], u[2] - sp[2]) < 14)) continue;
      used.push(sp); S.list.push(make(S, type, sp, idx)); n++;
    }
    return snapshot(room, true);
  }
  function reset(room) { room.veh = null; }
  const find = (room, id) => { const S = room.veh; if (!S) return null; for (let i = 0; i < S.list.length; i++) if (S.list[i].id === id) return S.list[i]; return null; };
  function seatOf(room, pid) {
    const S = room.veh; if (!S) return null;
    for (const v of S.list) { const k = v.seats.indexOf(pid); if (k >= 0) return { v: v, seat: k }; }
    return null;
  }
  function pushSeats(room, v) { v.dirty = true; io.to(room.code).emit('vehSeat', { id: v.id, seats: v.seats }); }

  function enter(room, p, d) {
    const S = room.veh; if (!S || !p || !p.alive) return { ok: false, err: 'No vehicles here' };
    if (seatOf(room, p.id)) return { ok: false, err: 'Already aboard' };
    const v = find(room, d && d.id); if (!v) return { ok: false, err: 'That vehicle is gone' };
    const T = V.types[v.type];
    if (Math.hypot(p.pos[0] - v.x, p.pos[2] - v.z) > V.enterDist + T.len / 2 || Math.abs(p.pos[1] - v.y) > 4) return { ok: false, err: 'Too far' };
    /* v2.13.1: now that riders shoot, a seat beside the enemy is not on offer: in a team mode a vehicle carries one side */
    if (ctx.modeInfo(room).teams && v.seats.some(pid => { const q = pid && room.players.get(pid); return q && q.team && p.team && q.team !== p.team; })) return { ok: false, err: 'Enemy vehicle' };
    const k = v.seats.indexOf(null); if (k < 0) return { ok: false, err: 'No free seat' };
    v.seats[k] = p.id; pushSeats(room, v);
    return { ok: true, seat: k, id: v.id };
  }
  function exit(room, p) {
    const s = p && seatOf(room, p.id); if (!s) return { ok: false };
    s.v.seats[s.seat] = null; if (s.seat === 0) { s.v.sp = 0; s.v.lit = 0; }
    pushSeats(room, s.v);
    return { ok: true };
  }
  /* the driver's report */
  function drive(room, p, d) {
    const s = p && seatOf(room, p.id); if (!s || s.seat !== 0 || !d || d.id !== s.v.id) return;
    if (!Array.isArray(d.p) || d.p.length !== 3) return;
    const v = s.v, T = V.types[v.type], t = now();
    const x = num(d.p[0]), y = num(d.p[1]), z = num(d.p[2]);
    const dt = Math.min(1, Math.max(0.02, (t - (v.lastAt || t - 50)) / 1000));
    if (Math.hypot(x - v.x, z - v.z) > T.max * 1.6 * dt + 2.5) { v.lastAt = t; return; }      // faster than it can go: not kept
    const E = (CFG.MAPS[room.settings.map || 'urban'] || {}).ext;
    if (E && (x < E.x0 - 5 || x > E.x1 + 5 || z < E.z0 - 5 || z > E.z1 + 5)) return;
    if (y < -5 || y > 60) return;
    v.x = x; v.y = y; v.z = z; v.ry = num(d.ry); v.sp = Math.max(-T.rev * 1.2, Math.min(T.max * 1.2, num(d.sp)));
    /* petrol only ever goes DOWN on a driver's say-so; the lights are the driver's switch */
    if (typeof d.f === 'number' && isFinite(d.f)) v.fuel = Math.max(0, Math.min(v.fuel, d.f));
    v.lit = d.l ? 1 : 0;
    if (v.fuel <= 0) v.sp = Math.max(-2, Math.min(2, v.sp));
    v.lastAt = t; v.movedAt = t; v.dirty = true;
  }
  /* bullets on the hull */
  function hit(room, shooter, d) {
    if (!shooter || !shooter.alive || !d) return;
    const v = find(room, d.id); if (!v) return;
    /* v2.13.1: riders fire — at other vehicles, never the one they sit in, and not from inside a sealed hull */
    const mineSeat = seatOf(room, shooter.id);
    if (mineSeat && (mineSeat.v === v || V.types[mineSeat.v.type].sealed)) return;
    const W = CFG.WEAPONS[d.w]; if (!W || W.gear || W.type === 'melee') return;
    if (CFG.gunAllowed && !CFG.gunAllowed(room.settings.mode, d.w)) return;
    const t = now(), gap = 60000 / (W.rpm || 600) * 0.75;
    shooter._vehHit = shooter._vehHit || {};
    if (t - (shooter._vehHit[d.w] || 0) < gap) return;                 // no faster than the gun fires
    shooter._vehHit[d.w] = t;
    if (Math.hypot(shooter.pos[0] - v.x, shooter.pos[2] - v.z) > 420) return;
    const T = V.types[v.type], explosive = W.type === 'rocket';
    const pellets = W.pellets ? Math.max(1, Math.min(W.pellets, d.n | 0 || Math.ceil(W.pellets * 0.6))) : 1;
    const dmg = W.dmg * pellets * (explosive ? (T.blast || 6) : T.armor);
    v.hp -= dmg; v.dirty = true;
    if (v.hp <= 0) destroy(room, v, shooter);
  }
  /* the hull is spent: everyone aboard dies with it */
  function destroy(room, v, by) {
    const S = room.veh; if (!S) return;
    const i = S.list.indexOf(v); if (i < 0) return;
    S.list.splice(i, 1);
    io.to(room.code).emit('vehBoom', { id: v.id, p: [v.x, v.y, v.z] });
    v.seats.forEach(pid => {
      const q = pid && room.players.get(pid);
      if (q && q.alive) ctx.applyDamage(room, q, 999, by && by.id !== pid ? by.id : pid, 'vehicle', false, true);
    });
    S.respawns.push({ at: now() + V.respawnSec * 1000, type: v.type });
    S.full = true;
  }
  /* run somebody over */
  function ram(room, driver, d) {
    const s = driver && seatOf(room, driver.id); if (!s || s.seat !== 0 || !d) return;
    const v = s.v, T = V.types[v.type], q = room.players.get(d.victim);
    if (!q || !q.alive || q.id === driver.id || v.seats.indexOf(q.id) >= 0) return;
    if (ctx.modeInfo(room).teams && q.team && q.team === driver.team) return;
    const sp = Math.abs(v.sp); if (sp < V.ramMin) return;
    if (Math.hypot(q.pos[0] - v.x, q.pos[2] - v.z) > T.len / 2 + 2.6 || Math.abs(q.pos[1] - v.y) > 3.2) return;
    if (seatOf(room, q.id)) return;                                   // riders are hurt through their own hull
    const t = now(); v.rams = v.rams || {};
    if (t - (v.rams[q.id] || 0) < 900) return; v.rams[q.id] = t;
    const lethal = sp >= V.ramKill;
    ctx.applyDamage(room, q, lethal ? 999 : sp * V.ramDmg * (T.ram || 1), driver.id, 'vehicle', false, lethal);
  }
  /* the horn: the driver's, relayed to the room, no faster than twice a second */
  function horn(room, p) {
    const s = p && seatOf(room, p.id); if (!s || s.seat !== 0) return;
    const t = now(); if (t - (s.v.hornAt || 0) < 450) return;
    s.v.hornAt = t;
    io.to(room.code).emit('vehHorn', { id: s.v.id, by: p.id });
  }
  /* is this player behind armour bullets cannot get through? */
  function shields(room, victim) { const s = victim && seatOf(room, victim.id); return !!(s && V.types[s.v.type].sealed); }
  /* how fast a player may legitimately be moving (the 'st' budget) */
  function speedCap(room, p) { const s = p && seatOf(room, p.id); return s ? V.types[s.v.type].max * 1.5 : 0; }

  function tick(room) {
    const S = room.veh; if (!S) return;
    const t = now();
    for (const v of S.list) {
      let changed = false;
      for (let k = 0; k < v.seats.length; k++) {
        const pid = v.seats[k]; if (!pid) continue;
        const q = room.players.get(pid);
        if (!q || !q.alive || q.connected === false) { v.seats[k] = null; changed = true; if (k === 0) { v.sp = 0; v.lit = 0; } }
      }
      if (changed) pushSeats(room, v);
      if (!v.seats[0] && v.sp) { v.sp = 0; v.dirty = true; }
    }
    if (S.respawns.length && t >= S.respawns[0].at) {
      const r = S.respawns.shift(), spots = spotsOf(room), T = V.types[r.type];
      for (let tries = 0; tries < 30; tries++) {
        const idx = (Math.random() * spots.length) | 0, sp = spots[idx];
        if (T.big && !sp[4]) continue;
        if (S.list.some(v => Math.hypot(v.x - sp[0], v.z - sp[2]) < 14)) continue;
        let near = false; for (const q of room.players.values()) if (q.alive && Math.hypot(q.pos[0] - sp[0], q.pos[2] - sp[2]) < 25) { near = true; break; }
        if (near) continue;
        S.list.push(make(S, r.type, sp, idx)); S.full = true; break;
      }
    }
  }
  /* [id, typeIndex, x, y, z, ry, speed, hp, fuel, lights] — everything on a keyframe, only what moved otherwise */
  function snapshot(room, keyframe) {
    const S = room.veh; if (!S) return null;
    const full = keyframe || S.full, out = [];
    for (const v of S.list) {
      if (!full && !v.dirty) continue;
      v.dirty = false;
      out.push([v.id, TYPES.indexOf(v.type), Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100,
                Math.round(v.ry * 1000) / 1000, Math.round(v.sp * 10) / 10, Math.max(0, Math.round(v.hp)), Math.round(v.fuel), v.lit ? 1 : 0]);
    }
    if (!full && !out.length) return null;
    const pkt = { f: full ? 1 : 0, v: out };
    if (full) { pkt.s = {}; S.list.forEach(v => { if (v.seats.some(x => x)) pkt.s[v.id] = v.seats; }); }
    S.full = false;
    return pkt;
  }

  return { enabled, start, reset, enter, exit, drive, hit, ram, horn, tick, snapshot, shields, speedCap, seatOf, find, TYPES };
};
