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
  const { io, now, applyDamage, pathFrom, modeInfo } = ctx;
  const routes = {};   // seed -> path (per flight)
  const CAB_HX = 1.4, CAB_HZ = 1.25;                              // cabin half-extents (along / across), matches heli.js

  function has(room) { return !!(room.heli && CFG.HELI && (room.settings.map || 'urban') === 'urban'); }
  /* v1.0q: the path for a flight's seed — the same wandering loop every client builds */
  function pathFor(seed) {
    if (routes[seed]) return routes[seed];
    const R = CFG.heliRoute(CFG.HELI, seed);
    const P = pathFrom(R.waypoints, R.fillet);
    if (P) routes[seed] = P;
    return P || null;
  }
  function baseYaw(room) { const P = pathFor(room.heli.seed || 1); const q = P ? P.at(0) : { yaw: 0 }; return q.yaw; }
  function start(room) {
    if ((room.settings.map || 'urban') !== 'urban' || !CFG.HELI) { room.heli = null; return null; }
    room.heli = { state: 'pad', t0: now(), hp: CFG.HELI.hp, riders: [], lastHitBy: null, lastHitAt: 0, boardSince: 0, respawnAt: 0, seed: 1 + Math.floor(Math.random() * 2147483000), from: null };
    return snapshot(room);
  }
  function snapshot(room) {
    const h = room.heli;
    if (!h) return null;
    return { state: h.state, t0: h.t0, hp: h.hp, riders: h.riders.slice(), respawnAt: h.respawnAt || 0, seed: h.seed || 1, from: h.from || null };
  }
  function broadcast(room) { io.to(room.code).emit('heliState', snapshot(room)); }
  function poseNow(room) {
    const h = room.heli;
    if (!h) return null;
    if (h.state === 'flying') { const P = pathFor(h.seed); return P ? CFG.heliPoseAt(CFG.HELI, P, (now() - h.t0) / 1000) : null; }
    if (h.state === 'returning' && h.from) return CFG.heliReturnPose(CFG.HELI, h.from, (now() - h.t0) / 1000);
    return { x: CFG.HELI.pad[0], z: CFG.HELI.pad[1], y: CFG.HELI.padY, yaw: baseYaw(room), phase: h.state === 'gone' ? 'gone' : 'down', s: 0 };
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
    if (h.riders.indexOf(p.id) >= 0) {
      /* v1.0q: aboard a LANDED machine, Z means FLY AGAIN — arm the lift-off
         from the riders already in the cabin, don't step the presser off. */
      if (h.state === 'landed' && !h.boardSince) { h.boardSince = now(); io.to(room.code).emit('heliNotice', { kind: 'boarding', in: CFG.HELI.boardSec, name: p.name }); broadcast(room); return { ok: true, aboard: true, relaunch: true, seat: p.pos.slice() }; }
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
    /* v1.0o: BOARDING GRACE. The client's next state update may already be
       in flight with the OLD position (outside the cabin); it would overwrite
       the seat the server just set and the tick would drop the rider before
       the client even learned where it sits — Rahul's "boarded but the
       helicopter is not going up". A rider is trusted aboard for graceMs
       after boarding, whatever position arrives. */
    h.boardedAt = h.boardedAt || {}; h.boardedAt[p.id] = now();
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
  /* v1.0p: the ONLY way off a flying machine is the rider's own jump, which
     the client reports (bail). The position test below is a SANITY NET for a
     client that stopped riding without saying so — it is deliberately huge,
     because a rider's reported position trails the machine by network delay
     plus the update interval, and during the climb (12.8 m/s at mid-climb) or
     a clock skew of a quarter second that is metres; Rahul was killed as a
     faller three builds running by tests that were too tight. */
  function fallen(room, pose, q) {
    const feet = q.pos[1] - CFG.PLAYER.standH / 2, floor = pose.y + CFG.HELI.cabinFloor;
    if (feet < floor - 12.0) return true;                          // a body in free fall drops fast
    /* horizontal: near ANY of the machine's recent positions (it left a trail
       over the last second) counts as following it — a lagging rider on a
       curving route is always near a point the machine actually occupied. */
    const trail = room.heli.trail || [[pose.x, pose.z]];
    let best = Infinity;
    for (const p of trail) { const d = Math.hypot(q.pos[0] - p[0], q.pos[2] - p[1]); if (d < best) best = d; }
    return best > 22.0;
  }
  function fall(room, q, tag) {
    const h = room.heli, t = now();
    const by = (h.lastHitBy && t - h.lastHitAt < CFG.HELI.creditSec * 1000 && room.players.has(h.lastHitBy) && h.lastHitBy !== q.id) ? h.lastHitBy : q.id;
    applyDamage(room, q, 999, by, 'helifall', false, true);
    io.to(room.code).emit('toast', { msg: q.name + (tag === 'bail' ? ' jumped from the helicopter' : ' fell from the helicopter') });
  }
  /* the rider says they jumped */
  function bail(room, p) {
    if (!has(room) || !p || !p.alive || p.out) return { ok: false };
    const h = room.heli;
    if (h.state !== 'flying' || h.riders.indexOf(p.id) < 0) return { ok: false, err: 'Not riding' };
    const pose = poseNow(room);
    if (!pose || pose.y < CFG.HELI.padY + 3.5) return { ok: false, err: 'Too low to matter' };
    h.riders = h.riders.filter(id => id !== p.id);
    fall(room, p, 'bail');
    broadcast(room);
    if (!h.riders.length) { h.from = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }; h.state = 'returning'; h.t0 = now(); broadcast(room); }
    return { ok: true };
  }
  function flightSec(room) { return (now() - room.heli.t0) / 1000; }
  /* v1.0q: a rider presses Q — the machine turns for the pad from where it is */
  function land(room, p) {
    if (!has(room) || !p) return { ok: false };
    const h = room.heli;
    if (h.state !== 'flying') return { ok: false, err: h.state === 'returning' ? 'Already heading home' : 'Not flying' };
    if (h.riders.indexOf(p.id) < 0) return { ok: false, err: 'Not riding' };
    const pose = poseNow(room);
    if (!pose) return { ok: false };
    h.from = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw };
    h.state = 'returning'; h.t0 = now();
    broadcast(room);
    return { ok: true };
  }

  function tick(room) {
    if (!has(room) || room.state !== 'playing') return;
    const h = room.heli, t = now();
    if (h.state === 'gone') {
      if (t >= h.respawnAt) { h.state = 'pad'; h.t0 = t; h.hp = CFG.HELI.hp; h.riders = []; h.lastHitBy = null; h.seed = 1 + Math.floor(Math.random() * 2147483000); h.from = null; broadcast(room); io.to(room.code).emit('toast', { msg: 'A helicopter has landed at the airport pad' }); }
      return;
    }
    const pose = poseNow(room);
    if (!pose) return;
    if (h.state === 'pad' || h.state === 'landed') {
      /* riders are those who pressed Z and are still in the cabin (a fresh
         boarder is trusted for the grace window — see board()) */
      const GRACE = 2500;
      h.riders = h.riders.filter(id => { const q = room.players.get(id); if (!q || !q.alive || q.out) return false; if (h.boardedAt && t - (h.boardedAt[id] || 0) < GRACE) return true; return inCabin(pose, q); });
      /* v1.0q: a boarding lifts off from the pad OR from a landing — the same
         machine flies again with a fresh route; a landed machine nobody boards
         leaves after unloadSec, and the next one comes respawnSec later. */
      if (h.riders.length && h.boardSince && t - h.boardSince >= CFG.HELI.boardSec * 1000) {
        h.state = 'flying'; h.t0 = t; h.boardSince = 0; h.flightStart = t; h.emptySince = 0; h.from = null; h.trail = []; h.outCount = {};
        h.seed = 1 + Math.floor(Math.random() * 2147483000); pathFor(h.seed);
        broadcast(room);
        return;
      }
      if (!h.riders.length) h.boardSince = 0;
      if (h.state === 'landed') {
        if (!h.riders.length) { if (!h.emptySince) h.emptySince = t; if (t - h.emptySince >= CFG.HELI.unloadSec * 1000) leave(room, t + CFG.HELI.respawnSec * 1000); }
        else h.emptySince = 0;
      }
      return;
    }
    if (h.state === 'returning') {
      h.trail = [[pose.x, pose.z]];
      if (pose.y > CFG.HELI.padY + 3.5) {
        h.outCount = h.outCount || {};
        const still = [];
        for (const id of h.riders) { const q = room.players.get(id); if (!q || !q.alive || q.out) continue; if (!fallen(room, pose, q)) { h.outCount[id] = 0; still.push(id); continue; } h.outCount[id] = (h.outCount[id] || 0) + 1; if (h.outCount[id] < 2) { still.push(id); continue; } fall(room, q, 'lost'); }
        if (still.length !== h.riders.length) { h.riders = still; broadcast(room); }
      }
      if (pose.phase === 'down') { h.state = 'landed'; h.t0 = t; h.emptySince = 0; h.from = null; broadcast(room); }
      return;
    }
    if (h.state === 'flying') {
      const T = flightSec(room);
      /* keep a one-second trail of the head's position for the fall test */
      h.trail = h.trail || []; h.trail.push([pose.x, pose.z]); if (h.trail.length > 20) h.trail.shift();
      /* the fall test waits until the machine is well up AND the flight is
         2.5 s old — the seat teleport and a client's first airborne frames
         settle in that window (v1.0o) */
      if (pose.y > CFG.HELI.padY + 3.5 && T > 2.5) {
        const still = [];
        h.outCount = h.outCount || {};
        for (const id of h.riders) {
          const q = room.players.get(id);
          if (!q || !q.alive || q.out) continue;
          if (!fallen(room, pose, q)) { h.outCount[id] = 0; still.push(id); continue; }
          /* far from the machine on TWO consecutive ticks: the client is no
             longer riding it and never said why */
          h.outCount[id] = (h.outCount[id] || 0) + 1;
          if (h.outCount[id] < 2) { still.push(id); continue; }
          fall(room, q, 'lost');
        }
        if (still.length !== h.riders.length) { h.riders = still; broadcast(room); }
        if (!h.riders.length) {                                 // nobody left aboard: it goes home
          h.from = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }; h.state = 'returning'; h.t0 = t; broadcast(room);
        }
      }
    }
  }
  function leave(room, respawnAt) {
    const h = room.heli;
    h.state = 'gone'; h.t0 = now(); h.respawnAt = Math.max(now() + 5000, respawnAt || (now() + CFG.HELI.respawnSec * 1000)); h.riders = []; h.boardedAt = {};
    broadcast(room);
  }
  function hit(room, shooter, w) {
    if (!has(room) || !shooter || !shooter.alive) return { ok: false, err: 'Not alive' };
    const h = room.heli;
    if (h.state === 'gone') return { ok: false, err: 'No helicopter' };   // pad, flying, returning, landed: all fair game
    const pose = poseNow(room);
    if (!pose) return { ok: false, err: 'No helicopter' };
    const dx = pose.x - shooter.pos[0], dy = pose.y - shooter.pos[1], dz = pose.z - shooter.pos[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 320) return { ok: false, err: 'Out of range' };
    if (h.riders.indexOf(shooter.id) >= 0) return { ok: false, err: 'You are aboard' };
    const dmg = CFG.heliDamageFor(CFG.HELI, CFG.WEAPONS, w);
    if (dmg <= 0) return { ok: true, dmg: 0, hp: h.hp, err: 'Only a rocket hurts the hull' };   /* v1.0t: every gun is zero */
    /* v1.0t: the server does not track loadouts (it never did), so the guard
       against a spoofed rocket claim is the launcher's own cycle: one round
       loaded, a 3.6 s reload — a hull hit per shooter no oftener than 1.8 s. */
    if (CFG.WEAPONS[w].type === 'rocket') {
      const tNow = now();
      if (shooter.lastHeliRocketAt && tNow - shooter.lastHeliRocketAt < 1800) return { ok: false, err: 'Too fast' };
      shooter.lastHeliRocketAt = tNow;
    }
    h.hp = Math.max(0, h.hp - dmg); h.lastHitBy = shooter.id; h.lastHitAt = now();
    io.to(room.code).emit('heliHp', { hp: h.hp, max: CFG.HELI.hp, by: shooter.id });
    if (h.hp <= 0) { const n = destroy(room, shooter); return { ok: true, dmg, hp: 0, destroyed: true, n }; }
    return { ok: true, dmg, hp: h.hp };
  }
  /* the machine goes down: every rider dies, credited to `by`; a fireball; gone until the respawn */
  function destroy(room, by) {
    const h = room.heli, pose = poseNow(room) || { x: CFG.HELI.pad[0], y: CFG.HELI.padY, z: CFG.HELI.pad[1] };
    let n = 0;
    for (const id of h.riders) { const q = room.players.get(id); if (q && q.alive && !q.out) { applyDamage(room, q, 999, by.id, 'helidown', false, true); n++; } }
    h.hp = 0;
    io.to(room.code).emit('heliBoom', { x: pose.x, y: pose.y, z: pose.z, by: by.id, byName: by.name, n });
    leave(room, now() + CFG.HELI.respawnSec * 1000);
    return n;
  }
  /* v1.0v: an EMP within reach fells an airborne machine outright */
  function emp(room, p) {
    if (!has(room) || !p) return { ok: false };
    const h = room.heli;
    if (h.state !== 'flying' && h.state !== 'returning') return { ok: false, err: 'Not airborne' };
    if (h.riders.indexOf(p.id) >= 0) return { ok: false, err: 'You are aboard' };
    const pose = poseNow(room);
    if (!pose) return { ok: false };
    const d = Math.hypot(pose.x - p.pos[0], pose.z - p.pos[2]);
    if (d > (CFG.HELI.empRange || 80)) return { ok: false, err: 'Helicopter out of EMP range (' + Math.round(d) + ' m)' };
    const n = destroy(room, p);
    return { ok: true, n };
  }
  function reset(room) { room.heli = null; }
  return { start, tick, hit, board, bail, land, snapshot, reset, poseNow, inCabin, fallen, pathFor, destroy, emp };
};
