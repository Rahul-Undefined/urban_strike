/* ===== v1.0l - THE HELICOPTER (server) =====
   One machine per Urban room. Its whole position is a function of the state
   and the server time the state began (CFG.heliPoseAt), so the client draws
   it from `heliState` events alone and the server can say who is aboard, who
   fell, and whether a shot could have reached it.

     pad      — sitting on the pad, empty. A player standing in the cabin for
                boardSec starts the flight.
     flying   — climb, the loop, descend (heliPoseAt phases). Riders are the
                players who were in the cabin at take-off. A rider found outside
                the cabin while airborne has FALLEN: dead, credited to whoever
                hit the helicopter within creditSec, else nobody.
     landed   — back on the pad; riders may leave; after unloadSec with the
                cabin empty it is gone.
     gone     — until respawnSec after take-off, then pad again.
   Hits (hitHeli from a client): the shooter must be alive and within reach;
   damage is by weapon class (CFG.heliDamageFor). At zero: every rider dies,
   credited to the shooter, tagged 'helidown'; the machine is gone until the
   respawn. */
const CFG = require('../../public/src/config/index.js');

module.exports = function initHeli(ctx) {
  const { io, now, applyDamage, trainPath, modeInfo } = ctx;
  const CAB_HX = 1.4, CAB_HZ = 1.25;                              // cabin half-extents (along / across), matches heli.js

  function has(room) { return !!(room.heli && CFG.HELI && (room.settings.map || 'urban') === 'urban'); }
  function pathFor() { try { return trainPath('urban', 'heli') || null; } catch (e) { return null; } }
  function start(room) {
    if ((room.settings.map || 'urban') !== 'urban' || !CFG.HELI) { room.heli = null; return null; }
    room.heli = { state: 'pad', t0: now(), hp: CFG.HELI.hp, riders: [], lastHitBy: null, lastHitAt: 0, boardSince: 0, respawnAt: 0 };
    return snapshot(room);
  }
  function snapshot(room) {
    const h = room.heli;
    if (!h) return null;
    return { state: h.state, t0: h.t0, hp: h.hp, riders: h.riders.slice(), respawnAt: h.respawnAt || 0 };
  }
  function broadcast(room) { io.to(room.code).emit('heliState', snapshot(room)); }
  function poseNow(room) {
    const h = room.heli, P = pathFor();
    if (!h || !P) return null;
    if (h.state === 'flying') return CFG.heliPoseAt(CFG.HELI, P, (now() - h.t0) / 1000);
    const q = P.at(0);
    return { x: CFG.HELI.pad[0], z: CFG.HELI.pad[1], y: CFG.HELI.padY, yaw: q.yaw, phase: h.state === 'gone' ? 'gone' : 'down', s: 0 };
  }
  function inCabin(pose, q) {
    const dx = q.pos[0] - pose.x, dz = q.pos[2] - pose.z, cs = Math.cos(pose.yaw), sn = Math.sin(pose.yaw);
    const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
    const feet = q.pos[1] - CFG.PLAYER.standH / 2, floor = pose.y + CFG.HELI.cabinFloor;
    return Math.abs(lx) <= CAB_HX + 0.4 && Math.abs(lz) <= CAB_HZ + 0.4 && feet >= floor - 1.2 && feet <= floor + 2.6;
  }
  /* v1.0m: SEATS. Boarding is an act (press Z near the machine on the pad):
     the server puts the player in the cabin at a seat and lists them; the
     first boarding starts the lift-off count. Cabin-local seat slots. */
  const SEATS = [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6], [-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]];
  function seatWorld(pose, i) {
    const s = SEATS[i % SEATS.length], cs = Math.cos(pose.yaw), sn = Math.sin(pose.yaw);
    return [pose.x + s[0] * cs - s[1] * sn, pose.y + CFG.HELI.cabinFloor + CFG.PLAYER.standH / 2 + 0.03, pose.z + s[0] * sn + s[1] * cs];
  }
  function board(room, p) {
    if (!has(room) || !p || !p.alive || p.out) return { ok: false, err: 'Not alive' };
    const h = room.heli;
    if (h.state !== 'pad' && h.state !== 'landed') return { ok: false, err: h.state === 'gone' ? 'No helicopter on the pad' : 'The helicopter is airborne' };
    const pose = poseNow(room);
    if (!pose) return { ok: false, err: 'No helicopter' };
    const d = Math.hypot(p.pos[0] - pose.x, p.pos[2] - pose.z);
    if (d > 7) return { ok: false, err: 'Get closer to the helicopter' };
    if (h.riders.indexOf(p.id) >= 0) {                              // second press: step off
      h.riders = h.riders.filter(id => id !== p.id);
      p.pos = [pose.x + Math.sin(pose.yaw) * 4.5, CFG.HELI.padY + CFG.PLAYER.standH / 2 + 0.03, pose.z - Math.cos(pose.yaw) * 4.5];
      p.justSpawned = true;
      if (!h.riders.length) h.boardSince = 0;
      broadcast(room);
      io.to(p.id).emit('heliSeat', { pos: p.pos, aboard: false });
      return { ok: true, aboard: false };
    }
    if (h.riders.length >= SEATS.length) return { ok: false, err: 'The cabin is full' };
    h.riders.push(p.id);
    const seat = seatWorld(pose, h.riders.length - 1);
    p.pos = seat; p.justSpawned = true;                              // a server teleport: the next state update passes
    if (!h.boardSince) { h.boardSince = now(); io.to(room.code).emit('heliNotice', { kind: 'boarding', in: CFG.HELI.boardSec, name: p.name }); }
    broadcast(room);
    io.to(p.id).emit('heliSeat', { pos: seat, aboard: true, liftIn: Math.max(0, CFG.HELI.boardSec - (now() - h.boardSince) / 1000) });
    return { ok: true, aboard: true, seat: seat };
  }
  /* v1.0m: "fallen" is DROPPING away, not lagging behind. A rider's server
     position trails the machine by a network delay — at 14 m/s that is a
     metre or two behind a seat — so the test is a rider well below the floor
     or well away from the cabin, which a body in free fall is within a second
     and a seated rider never is. */
  function fallen(pose, q) {
    const feet = q.pos[1] - CFG.PLAYER.standH / 2, floor = pose.y + CFG.HELI.cabinFloor;
    const dh = Math.hypot(q.pos[0] - pose.x, q.pos[2] - pose.z);
    return feet < floor - 3.0 || dh > 6.5;
  }
  function flightSec(room) { return (now() - room.heli.t0) / 1000; }
  function totalFlight(P) { return CFG.HELI.climbSec + P.length / CFG.HELI.speed + CFG.HELI.landSec; }

  function tick(room) {
    if (!has(room) || room.state !== 'playing') return;
    const h = room.heli, P = pathFor(), t = now();
    if (!P) return;
    if (h.state === 'gone') {
      if (t >= h.respawnAt) { h.state = 'pad'; h.t0 = t; h.hp = CFG.HELI.hp; h.riders = []; h.lastHitBy = null; broadcast(room); io.to(room.code).emit('toast', { msg: 'A helicopter has landed at the airport pad' }); }
      return;
    }
    const pose = poseNow(room);
    if (h.state === 'pad' || h.state === 'landed') {
      /* riders are those who pressed Z and are still in the cabin */
      h.riders = h.riders.filter(id => { const q = room.players.get(id); return q && q.alive && !q.out && inCabin(pose, q); });
      if (h.state === 'pad') {
        if (!h.riders.length) h.boardSince = 0;
        if (h.boardSince && t - h.boardSince >= CFG.HELI.boardSec * 1000 && h.riders.length) {
          h.state = 'flying'; h.t0 = t; h.boardSince = 0; h.flightStart = t;
          broadcast(room);
          io.to(room.code).emit('toast', { msg: 'The helicopter is airborne \u00b7 ' + h.riders.length + ' aboard' });
        }
      } else {                                                  // landed: unload, then leave
        if (!h.riders.length) { if (!h.emptySince) h.emptySince = t; if (t - h.emptySince >= CFG.HELI.unloadSec * 1000) { leave(room, h.flightStart + CFG.HELI.respawnSec * 1000); } }
        else h.emptySince = 0;
      }
      return;
    }
    if (h.state === 'flying') {
      const T = flightSec(room);
      if (T >= totalFlight(P)) { h.state = 'landed'; h.t0 = t; h.emptySince = 0; broadcast(room); return; }
      if (pose.y > CFG.HELI.padY + 3.5) {
        const still = [];
        for (const id of h.riders) {
          const q = room.players.get(id);
          if (!q || !q.alive || q.out) continue;
          if (!fallen(pose, q)) { still.push(id); continue; }
          /* fell out */
          const by = (h.lastHitBy && t - h.lastHitAt < CFG.HELI.creditSec * 1000 && room.players.has(h.lastHitBy) && h.lastHitBy !== id) ? h.lastHitBy : id;
          applyDamage(room, q, 999, by, 'helifall', false, true);
          io.to(room.code).emit('toast', { msg: q.name + ' fell from the helicopter' });
        }
        if (still.length !== h.riders.length) { h.riders = still; broadcast(room); }
        if (!h.riders.length) {                                 // nobody left aboard: it goes home
          h.state = 'landed'; h.t0 = t; h.emptySince = t; h.homing = true; broadcast(room);
        }
      }
    }
  }
  function leave(room, respawnAt) {
    const h = room.heli;
    h.state = 'gone'; h.t0 = now(); h.respawnAt = Math.max(now() + 5000, respawnAt || (now() + CFG.HELI.respawnSec * 1000)); h.riders = [];
    broadcast(room);
  }
  function hit(room, shooter, w) {
    if (!has(room) || !shooter || !shooter.alive) return { ok: false, err: 'Not alive' };
    const h = room.heli;
    if (h.state === 'gone') return { ok: false, err: 'No helicopter' };
    const pose = poseNow(room);
    if (!pose) return { ok: false, err: 'No helicopter' };
    const dx = pose.x - shooter.pos[0], dy = pose.y - shooter.pos[1], dz = pose.z - shooter.pos[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 320) return { ok: false, err: 'Out of range' };
    if (h.riders.indexOf(shooter.id) >= 0) return { ok: false, err: 'You are aboard' };
    const dmg = CFG.heliDamageFor(CFG.HELI, CFG.WEAPONS, w);
    if (dmg <= 0) return { ok: true, dmg: 0, hp: h.hp };
    h.hp = Math.max(0, h.hp - dmg); h.lastHitBy = shooter.id; h.lastHitAt = now();
    io.to(room.code).emit('heliHp', { hp: h.hp, max: CFG.HELI.hp, by: shooter.id });
    if (h.hp <= 0) {
      let n = 0;
      for (const id of h.riders) { const q = room.players.get(id); if (q && q.alive && !q.out) { applyDamage(room, q, 999, shooter.id, 'helidown', false, true); n++; } }
      io.to(room.code).emit('heliBoom', { x: pose.x, y: pose.y, z: pose.z, by: shooter.id, byName: shooter.name, n });
      leave(room, now() + CFG.HELI.respawnSec * 1000);
      return { ok: true, dmg, hp: 0, destroyed: true, n };
    }
    return { ok: true, dmg, hp: h.hp };
  }
  function reset(room) { room.heli = null; }
  return { start, tick, hit, board, snapshot, reset, poseNow, inCabin, fallen };
};
