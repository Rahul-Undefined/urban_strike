/* ===== v1.0b - HAZARDS: FIRE ZONES and C4 CHARGES =====

   Two area weapons that live for seconds after the shot, so they need a
   server tick and a teardown like mines and drones. Both are decided here, on
   the server, against the server's own map colliders (Bots.buildColliders —
   the same AABB set bots see through and walk on), never on a client claim.

   FIRE ZONE — opened by a flamethrower hit (server.js 'hit'). Rahul: "the
   opponent will be burnt and 20 m of radius will be under fire, instant kill
   for 10 seconds; in that time anyone else who comes in dies as well."
     - every alive player hostile to the zone's owner inside `radius`, with
       line of sight to the fire (a wall is a wall — the zone does not burn
       through the building next door), dies each tick, pointBlank;
     - the owner's own side is safe: friendly fire is off everywhere else in
       this game and a fire that cooked team-mates would be one nobody dared
       use indoors;
     - one zone per shooter per `cooldown` — a hit every 140 ms must not open
       seventy zones.

   C4 — planted on a wall (server.js 'plantBomb', reach-checked). Rahul: "in 5
   seconds the bomb blasts and every player inside the building where it was
   used is 100% killed." There is no building object in this engine — a
   building is walls that happen to be near each other — so "inside" is
   defined by what makes a building a building: A ROOF. At detonation, every
   hostile within `reach` of the charge who has a collider over their head
   (within `roofScan` metres — a ceiling, a floor above, a rooftop over them)
   dies; so does anyone hostile within `open` metres, roof or not, because the
   charge itself is a bomb. A player on the roof, in the street outside, or in
   the open two houses down lives. Owner's side safe, same rule as above. */
const CFG = require('../../public/src/config/index.js');

module.exports = function initHazards(ctx) {
  const { io, now, applyDamage, modeInfo, colliders } = ctx;

  function F() { return CFG.GEAR.fire || { radius: 20, dur: 10, cooldown: 2 }; }
  function C() { return CFG.GEAR.c4 || { fuseSec: 5, reach: 18, roofScan: 14, open: 4.5, maxCarry: 2, stick: 3.2 }; }
  function hostile(room, owner, ownerTeam, q) {
    if (!q.alive || q.out) return false;
    if (q.id === owner) return false;
    const teams = modeInfo(room).teams;
    if (teams && q.team && ownerTeam && q.team === ownerTeam) return false;
    return true;
  }
  function cols(room) {
    try { return colliders(room.settings.map || 'urban') || []; } catch (e) { return []; }
  }
  /* Axis-aligned segment/AABB test, the same arithmetic bots.js uses. */
  function segmentBlocked(cs, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      let t0 = 0, t1 = 1, ok = true;
      for (let a = 0; a < 3; a++) {
        const o = a === 0 ? ax : a === 1 ? ay : az;
        const d = a === 0 ? dx : a === 1 ? dy : dz;
        const lo = c[a], hi = c[a + 3];
        if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) { ok = false; break; } continue; }
        let n = (lo - o) / d, f = (hi - o) / d;
        if (n > f) { const tmp = n; n = f; f = tmp; }
        if (n > t0) t0 = n;
        if (f < t1) t1 = f;
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  function roofAbove(cs, x, y, z, scan) {
    const head = y + 1.0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (x < c[0] || x > c[3] || z < c[2] || z > c[5]) continue;
      if (c[1] > head && c[1] < head + scan) return true;
    }
    return false;
  }

  /* ---------------- fire zones ---------------- */
  function ignite(room, pos, owner) {
    if (!room.fireZones) room.fireZones = [];
    const S = F();
    const t = now();
    const recent = room.fireZones.find(z => z.owner === owner.id && t - z.born < S.cooldown * 1000);
    if (recent) return null;
    const z = {
      id: room.nextFireId = (room.nextFireId || 1) + 1,
      x: pos[0], y: pos[1], z: pos[2], owner: owner.id, team: owner.team || null,
      born: t, until: t + S.dur * 1000, lastTick: 0
    };
    room.fireZones.push(z);
    io.to(room.code).emit('fireZone', { id: z.id, p: [z.x, z.y, z.z], r: S.radius, dur: S.dur, by: owner.id });
    return z;
  }
  function tickFire(room) {
    const zones = room.fireZones;
    if (!zones || !zones.length) return;
    const S = F(), t = now(), cs = cols(room);
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (t >= z.until) { zones.splice(i, 1); io.to(room.code).emit('fireZoneEnd', { id: z.id }); continue; }
      if (t - z.lastTick < 250) continue;
      z.lastTick = t;
      for (const q of room.players.values()) {
        if (!hostile(room, z.owner, z.team, q)) continue;
        const dx = q.pos[0] - z.x, dz = q.pos[2] - z.z, dy = q.pos[1] - z.y;
        if (Math.abs(dy) > 6 || dx * dx + dz * dz > S.radius * S.radius) continue;
        if (segmentBlocked(cs, z.x, z.y + 1.2, z.z, q.pos[0], q.pos[1] + 1.0, q.pos[2])) continue;
        applyDamage(room, q, 999, z.owner, 'flamer', false, true);
      }
    }
  }

  /* ---------------- C4 ---------------- */
  function plant(room, p, at) {
    const S = C();
    if (!p || !p.alive) return { ok: false, err: 'Not alive' };
    if ((p.c4 | 0) <= 0) return { ok: false, err: 'No C4 charge' };
    if (CFG.isArena && CFG.isArena(room.settings.map || 'urban')) return { ok: false, err: 'C4 is not issued on this map' };
    if (!at || at.length !== 3 || at.some(v => typeof v !== 'number' || !isFinite(v))) return { ok: false, err: 'Nothing to stick it to' };
    const dx = at[0] - p.pos[0], dy = at[1] - (p.pos[1] + 0.9), dz = at[2] - p.pos[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > S.stick + 0.6) return { ok: false, err: 'Get closer to the wall' };
    p.c4--;
    if (!room.bombs) room.bombs = [];
    const b = {
      id: room.nextBombId = (room.nextBombId || 1) + 1,
      x: at[0], y: at[1], z: at[2], owner: p.id, ownerName: p.name, team: p.team || null,
      at: now() + S.fuseSec * 1000
    };
    room.bombs.push(b);
    io.to(room.code).emit('bombPlanted', { id: b.id, p: [b.x, b.y, b.z], by: p.id, at: b.at, fuse: S.fuseSec });
    return { ok: true, left: p.c4, fuse: S.fuseSec };
  }
  function tickBombs(room) {
    const bombs = room.bombs;
    if (!bombs || !bombs.length) return;
    const S = C(), t = now();
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      if (t < b.at) continue;
      bombs.splice(i, 1);
      const cs = cols(room);
      let n = 0;
      for (const q of room.players.values()) {
        if (!hostile(room, b.owner, b.team, q)) continue;
        const dx = q.pos[0] - b.x, dy = q.pos[1] - b.y, dz = q.pos[2] - b.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > S.reach) continue;
        const indoors = roofAbove(cs, q.pos[0], q.pos[1], q.pos[2], S.roofScan);
        if (!indoors && d > S.open) continue;
        applyDamage(room, q, 999, b.owner, 'c4', false, true);
        n++;
      }
      io.to(room.code).emit('bombBoom', { id: b.id, p: [b.x, b.y, b.z], n: n, by: b.owner });
      const owner = room.players.get(b.owner);
      if (owner && !owner.bot) io.to(b.owner).emit('toast', { msg: 'C4 \u00b7 ' + n + ' eliminated inside' });
    }
  }

  /* ===== v1.0f - THE TRAIN KILLS WHAT IT HITS =====
     Rahul: "any player that gets hit by the train is a 100% kill." The server
     places the train exactly where every client draws it — the same path
     (through the geometry harness) and the same schedule functions, on the
     match clock — and each tick asks: is anyone alive standing IN a car's body
     at ground level while the train moves? Riders stand on the floor, the
     step or the roof and are exempt; a bystander on the platform is outside
     the body. The death is tagged 'train' with no killer: nobody earns it. */
  const HALF_W = 1.5;
  function tickTrain(room) {
    if (!ctx.trainPath || !CFG.TRAIN || !CFG.trainHeadAt) return;
    const mapId = room.settings.map || 'urban';
    const cfg = CFG.TRAIN[mapId];
    if (!cfg || !room.startedAt) return;
    let P = null;
    try { P = ctx.trainPath(mapId); } catch (e) { P = null; }
    if (!P) return;
    if (!room.trainSched) room.trainSched = CFG.trainSchedule(cfg, P.length, P.sAtWaypoint(cfg.stationAt || 0) + (cfg.stopOffset || 0));
    const t = now();
    const h = CFG.trainHeadAt(room.trainSched, (t - room.startedAt) / 1000);
    const cars = CFG.trainCars(cfg), FLOOR = cfg.floor || 1.05, half = CFG.PLAYER.standH / 2;
    const poses = cars.map(c => { const p = P.at(h.s - c.off); return { c, p, cs: Math.cos(p.yaw), sn: Math.sin(p.yaw) }; });
    /* local coordinates of a player against each car; `inBody` with the tight
       margins is "the train is on top of you"; `aboardish` with generous
       margins (the snapshot lags a rider by up to a metre at speed) is "you
       are riding". */
    function scan(q, alongPad, sidePad) {
      for (const k of poses) {
        const dx = q.pos[0] - k.p.x, dz = q.pos[2] - k.p.z;
        const lx = dx * k.cs + dz * k.sn, lz = -dx * k.sn + dz * k.cs;
        if (Math.abs(lx) <= k.c.L / 2 + alongPad && Math.abs(lz) <= HALF_W + sidePad) return true;
      }
      return false;
    }
    for (const q of room.players.values()) {
      if (!q.alive || q.out) continue;
      const feet = q.pos[1] - half;
      const riding = feet >= FLOOR - 0.25 && scan(q, 2.0, 0.6);
      if (riding) { q.trainAboardAt = t; continue; }               // aboard: floor, step or roof
      /* ===== v1.0g - LEAVING A MOVING TRAIN IS FATAL =====
         Rahul: "if a player gets down from the moving train, 100% kill." Seen
         aboard within the last 1.2 s, the train doing more than 2 m/s, and now
         at GROUND level — that is a jump from a moving train. Stepping onto
         the platform deck (1.05 m) is not ground level, so the station is
         safe even while the train is still creeping in. */
      if (h.v > 2.0 && q.trainAboardAt && t - q.trainAboardAt < 1200 && feet < 0.45) {
        q.trainAboardAt = 0;
        applyDamage(room, q, 999, q.id, 'train', false, true);
        io.to(room.code).emit('toast', { msg: q.name + ' jumped from the moving train' });
        continue;
      }
      if (h.v < 1.0) continue;                                        // a standing train hurts nobody
      if (feet >= FLOOR - 0.25) continue;                             // on a platform deck beside it
      if (!scan(q, 0.2, 0.1)) continue;                               // not under it
      applyDamage(room, q, 999, q.id, 'train', false, true);
      io.to(room.code).emit('toast', { msg: q.name + ' was run over by the train' });
    }
  }

  function tick(room) { tickFire(room); tickBombs(room); tickTrain(room); }
  function reset(room) { room.fireZones = []; room.bombs = []; room.trainSched = null; }

  return { ignite, plant, tick, reset, roofAbove, segmentBlocked, tickTrain };
};
