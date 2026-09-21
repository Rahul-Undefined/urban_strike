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
  function pathFor(seed, pad) {
    const key = seed + '@' + (pad ? pad.join(',') : '');
    if (routes[key]) return routes[key];
    const R = CFG.heliRoute(Object.assign({}, CFG.HELI, { pad: pad || CFG.HELI.pad }), seed);
    const P = pathFrom(R.waypoints, R.fillet);
    if (P) routes[key] = P;
    return P || null;
  }
  /* v1.0x: TWO MACHINES, one per pad. Everything below works on ONE machine
     `h`; the room holds `room.helis` and `room.heli` is machine 0 (the alias
     keeps every reader that predates the second pad working). Machine 1 is
     'gone' at the start and is scheduled `secondSpawnSec` after machine 0
     first lifts off. */
  function newMachine(idx, state, t) {
    return { idx, pad: (CFG.HELI.pads && CFG.HELI.pads[idx]) || CFG.HELI.pad, state, t0: t, hp: CFG.HELI.hp, riders: [], lastHitBy: null, lastHitAt: 0, boardSince: 0, respawnAt: 0,
      seed: 1 + Math.floor(Math.random() * 2147483000), from: null, refuelUntil: 0, fuelStart: 0, fuelWarned: false, crashFrom: null };
  }
  function start(room) {
    if ((room.settings.map || 'urban') !== 'urban' || !CFG.HELI) { room.helis = null; room.heli = null; return null; }
    const t = now();
    room.helis = [newMachine(0, 'pad', t), newMachine(1, 'gone', t)];
    room.helis[1].respawnAt = 0;                                  // not scheduled until the first flight
    Object.defineProperty(room, 'heli', { configurable: true, enumerable: false, get() { return room.helis ? room.helis[0] : null; }, set(v) { if (room.helis) room.helis[0] = v; } });
    return snapshot(room);
  }
  function snapOne(h) { return { idx: h.idx, pad: h.pad, state: h.state, t0: h.t0, hp: h.hp, riders: h.riders.slice(), respawnAt: h.respawnAt || 0, seed: h.seed || 1, from: h.from || null, refuelUntil: h.refuelUntil || 0, fuelStart: h.fuelStart || 0, crashFrom: h.crashFrom || null }; }
  function snapshot(room) {
    if (!room.helis) return null;
    const s0 = snapOne(room.helis[0]);
    s0.all = room.helis.map(snapOne);
    return s0;
  }
  function broadcast(room) { io.to(room.code).emit('heliState', snapshot(room)); }
  function machineOf(room, id) { return (room.helis || []).find(m => m.riders.indexOf(id) >= 0) || null; }
  function nearestMachine(room, pos, states) {
    let best = null, bd = 1e9;
    for (const m of room.helis || []) {
      if (states && states.indexOf(m.state) < 0) continue;
      const q = poseOf(room, m); if (!q) continue;
      const d = Math.hypot(q.x - pos[0], q.z - pos[2]);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { m: best, d: bd } : null;
  }
  function poseOf(room, h) {
    if (!h) return null;
    const cfg = Object.assign({}, CFG.HELI, { pad: h.pad });
    if (h.state === 'flying') { const P = pathFor(h.seed, h.pad); return P ? CFG.heliPoseAt(cfg, P, (now() - h.t0) / 1000) : null; }
    if (h.state === 'returning' && h.from) return CFG.heliReturnPose(cfg, h.from, (now() - h.t0) / 1000);
    if (h.state === 'crash' && h.crashFrom) return CFG.heliCrashPose(cfg, h.crashFrom, (now() - h.t0) / 1000);   /* v2.0 */
    const P0 = pathFor(h.seed, h.pad), q = P0 ? P0.at(0) : { yaw: 0 };
    return { x: h.pad[0], z: h.pad[1], y: CFG.HELI.padY, yaw: q.yaw, phase: h.state === 'gone' ? 'gone' : 'down', s: 0 };
  }
  function poseNow(room) { return poseOf(room, room.heli); }
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
  function board(room, p, idx) {
    if (!has(room) || !p || !p.alive || p.out) return { ok: false, err: 'Not alive' };
    /* the machine I am already listed on, else the one named if in reach, else the nearest one sitting on a pad */
    let h = machineOf(room, p.id);
    if (!h && typeof idx === 'number' && room.helis[idx] && (room.helis[idx].state === 'pad' || room.helis[idx].state === 'landed')) { const q = poseOf(room, room.helis[idx]); if (q && Math.hypot(q.x - p.pos[0], q.z - p.pos[2]) <= 7) h = room.helis[idx]; }
    if (!h) { const nr = nearestMachine(room, p.pos, ['pad', 'landed']); if (!nr) return { ok: false, err: (room.helis || []).some(m => m.state !== 'gone') ? 'The helicopter is airborne' : 'No helicopter on the pad' }; if (nr.d > 7) return { ok: false, err: 'Get closer to the helicopter' }; h = nr.m; }
    if (h.state !== 'pad' && h.state !== 'landed') return { ok: false, err: 'The helicopter is airborne' };
    const t = now();
    if (h.refuelUntil && t < h.refuelUntil) return { ok: false, err: 'Refuelling \u00b7 ' + Math.ceil((h.refuelUntil - t) / 1000) + ' s' };   /* v1.0x */
    const pose = poseOf(room, h);
    if (!pose) return { ok: false, err: 'No helicopter' };
    if (h.riders.indexOf(p.id) >= 0) {
      if (h.state === 'landed' && !h.boardSince) { h.boardSince = t; io.to(room.code).emit('heliNotice', { kind: 'boarding', in: CFG.HELI.boardSec, name: p.name, idx: h.idx }); broadcast(room); return { ok: true, aboard: true, relaunch: true, seat: p.pos.slice(), idx: h.idx }; }
      h.riders = h.riders.filter(id => id !== p.id);
      p.pos = [pose.x + Math.sin(pose.yaw) * 4.5, CFG.HELI.padY + CFG.PLAYER.standH / 2 + 0.03, pose.z - Math.cos(pose.yaw) * 4.5];
      p.justSpawned = true;
      if (!h.riders.length) h.boardSince = 0;
      broadcast(room);
      io.to(p.id).emit('heliSeat', { pos: p.pos, aboard: false, idx: h.idx });
      return { ok: true, aboard: false, idx: h.idx };
    }
    if (h.riders.length >= SEATS.length) return { ok: false, err: 'The cabin is full' };
    h.riders.push(p.id);
    const seat = seatWorld(pose, h.riders.length - 1);
    p.pos = seat; p.justSpawned = true;
    h.boardedAt = h.boardedAt || {}; h.boardedAt[p.id] = t;
    if (!h.boardSince) { h.boardSince = t; io.to(room.code).emit('heliNotice', { kind: 'boarding', in: CFG.HELI.boardSec, name: p.name, idx: h.idx }); }
    broadcast(room);
    io.to(p.id).emit('heliSeat', { pos: seat, aboard: true, liftIn: Math.max(0, CFG.HELI.boardSec - (t - h.boardSince) / 1000), idx: h.idx });
    return { ok: true, aboard: true, seat: seat, idx: h.idx };
  }
  function fallen(pose, h, q) {
    const feet = q.pos[1] - CFG.PLAYER.standH / 2, floor = pose.y + CFG.HELI.cabinFloor;
    if (feet < floor - 12.0) return true;
    const trail = h.trail || [[pose.x, pose.z]];
    let best = Infinity;
    for (const p of trail) { const d = Math.hypot(q.pos[0] - p[0], q.pos[2] - p[1]); if (d < best) best = d; }
    return best > 22.0;
  }
  function fall(room, h, q, tag) {
    const t = now();
    const by = (h.lastHitBy && t - h.lastHitAt < CFG.HELI.creditSec * 1000 && room.players.has(h.lastHitBy) && h.lastHitBy !== q.id) ? h.lastHitBy : q.id;
    applyDamage(room, q, 999, by, 'helifall', false, true);
    io.to(room.code).emit('toast', { msg: q.name + (tag === 'bail' ? ' jumped from the helicopter' : ' fell from the helicopter') });
  }
  function goHome(room, h, pose) { h.from = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }; h.state = 'returning'; h.t0 = now(); broadcast(room); }
  /* v2.0: the tank is dry — freeze the pose and fall. Riders stay listed (the
     cabin floor carries them down, RIDER_PASS still shields them from guns);
     they die when the wreck lands (tickMachine 'crash'). */
  function crash(room, h, pose) {
    h.crashFrom = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }; h.state = 'crash'; h.t0 = now();
    io.to(room.code).emit('toast', { msg: 'Helicopter ' + (h.idx === 0 ? 'A' : 'B') + ' is out of fuel and going down' });
    broadcast(room);
  }
  function bail(room, p) {
    if (!has(room) || !p || !p.alive || p.out) return { ok: false };
    const h = machineOf(room, p.id);
    if (!h || (h.state !== 'flying' && h.state !== 'returning' && h.state !== 'crash')) return { ok: false, err: 'Not riding' };
    const pose = poseOf(room, h);
    if (!pose || pose.y < CFG.HELI.padY + 3.5) return { ok: false, err: 'Too low to matter' };
    h.riders = h.riders.filter(id => id !== p.id);
    fall(room, h, p, 'bail');
    broadcast(room);
    if (!h.riders.length && h.state === 'flying') goHome(room, h, pose);
    return { ok: true };
  }
  function land(room, p) {
    if (!has(room) || !p) return { ok: false };
    const h = machineOf(room, p.id);
    if (!h) return { ok: false, err: 'Not riding' };
    if (h.state !== 'flying') return { ok: false, err: h.state === 'returning' ? 'Already heading home' : 'Not flying' };
    const pose = poseOf(room, h);
    if (!pose) return { ok: false };
    goHome(room, h, pose);
    return { ok: true };
  }

  function tickMachine(room, h, t) {
    if (h.state === 'gone') {
      if (h.respawnAt && t >= h.respawnAt) { h.state = 'pad'; h.t0 = t; h.hp = CFG.HELI.hp; h.riders = []; h.lastHitBy = null; h.seed = 1 + Math.floor(Math.random() * 2147483000); h.from = null; h.refuelUntil = 0; broadcast(room); io.to(room.code).emit('toast', { msg: 'A helicopter has landed at pad ' + (h.idx === 0 ? 'A' : 'B') }); }
      return;
    }
    const pose = poseOf(room, h);
    if (!pose) return;
    if (h.state === 'pad' || h.state === 'landed') {
      const GRACE = 2500;
      h.riders = h.riders.filter(id => { const q = room.players.get(id); if (!q || !q.alive || q.out) return false; if (h.boardedAt && t - (h.boardedAt[id] || 0) < GRACE) return true; return inCabin(pose, q); });
      const fuelled = !h.refuelUntil || t >= h.refuelUntil;
      if (fuelled && h.riders.length && h.boardSince && t - h.boardSince >= CFG.HELI.boardSec * 1000) {
        h.state = 'flying'; h.t0 = t; h.boardSince = 0; h.flightStart = t; h.fuelStart = t; h.emptySince = 0; h.from = null; h.trail = []; h.outCount = {}; h.refuelUntil = 0; h.fuelWarned = false; h.crashFrom = null;
        h.seed = 1 + Math.floor(Math.random() * 2147483000); pathFor(h.seed, h.pad);
        /* v1.0x: the first lift-off books the second machine for the other pad */
        const other = room.helis[h.idx === 0 ? 1 : 0];
        if (other && other.state === 'gone' && !other.respawnAt) other.respawnAt = t + (CFG.HELI.secondSpawnSec || 120) * 1000;
        broadcast(room);
        return;
      }
      if (!h.riders.length) h.boardSince = 0;
      /* v1.0x: a landed machine stays and refuels; it never leaves the map on its own */
      return;
    }
    if (h.state === 'returning') {
      h.trail = [[pose.x, pose.z]];
      if (pose.y > CFG.HELI.padY + 3.5) {
        h.outCount = h.outCount || {};
        const still = [];
        for (const id of h.riders) { const q = room.players.get(id); if (!q || !q.alive || q.out) continue; if (!fallen(pose, h, q)) { h.outCount[id] = 0; still.push(id); continue; } h.outCount[id] = (h.outCount[id] || 0) + 1; if (h.outCount[id] < 2) { still.push(id); continue; } fall(room, h, q, 'lost'); }
        if (still.length !== h.riders.length) { h.riders = still; broadcast(room); }
      }
      if (pose.phase === 'down') { h.state = 'landed'; h.t0 = t; h.emptySince = 0; h.from = null; h.refuelUntil = t + (CFG.HELI.refuelSec || 60) * 1000; broadcast(room); }
      return;
    }
    if (h.state === 'crash') {
      const D = CFG.HELI.crashSec || 3;
      if ((t - h.t0) / 1000 >= D) {
        /* the wreck has met the ground: every rider aboard dies with it */
        const at = pose || { x: h.crashFrom.x, y: CFG.HELI.padY, z: h.crashFrom.z };
        let n = 0;
        for (const id of h.riders) { const q = room.players.get(id); if (q && q.alive && !q.out) { applyDamage(room, q, 999, id, 'helidown', false, true); n++; } }
        h.hp = 0;
        io.to(room.code).emit('heliBoom', { x: at.x, y: at.y, z: at.z, by: null, byName: 'Out of fuel', n, idx: h.idx, crash: 1 });
        leave(room, h, t + CFG.HELI.respawnSec * 1000);
      }
      return;
    }
    if (h.state === 'flying') {
      const T = (t - h.t0) / 1000;
      h.trail = h.trail || []; h.trail.push([pose.x, pose.z]); if (h.trail.length > 20) h.trail.shift();
      /* ===== v2.0 - FUEL: A SIREN, THEN A CRASH (Rahul: "no auto return; if
         fuel is finished the helicopter will crash and the player will die") =====
         fuelWarnSec before empty every client hears the low-fuel siren
         (heliFuel event: riders get the loud one, the room a distant one). At
         zero the machine drops out of the sky: state 'crash' (CFG.heliCrashPose),
         and when the wreck meets the ground every rider dies — tag 'helidown',
         no killer, the machine's own fault — and the wreck burns for a moment
         before the machine is 'gone' until its respawn. Q-landing before the
         tank runs dry is the only way home now. */
      const fuelLeft = h.fuelStart ? (CFG.HELI.fuelSec || 120) - (t - h.fuelStart) / 1000 : 999;
      if (!h.fuelWarned && fuelLeft <= (CFG.HELI.fuelWarnSec || 30)) {
        h.fuelWarned = true;
        io.to(room.code).emit('heliFuel', { idx: h.idx, left: Math.max(0, Math.round(fuelLeft)), riders: h.riders.slice() });
      }
      if (fuelLeft <= 0) { crash(room, h, pose); return; }
      if (pose.y > CFG.HELI.padY + 3.5 && T > 2.5) {
        const still = [];
        h.outCount = h.outCount || {};
        for (const id of h.riders) {
          const q = room.players.get(id);
          if (!q || !q.alive || q.out) continue;
          if (!fallen(pose, h, q)) { h.outCount[id] = 0; still.push(id); continue; }
          h.outCount[id] = (h.outCount[id] || 0) + 1;
          if (h.outCount[id] < 2) { still.push(id); continue; }
          fall(room, h, q, 'lost');
        }
        if (still.length !== h.riders.length) { h.riders = still; broadcast(room); }
        if (!h.riders.length) goHome(room, h, pose);
      }
    }
  }
  function tick(room) {
    if (!has(room) || room.state !== 'playing') return;
    const t = now();
    for (const h of room.helis) tickMachine(room, h, t);
  }
  function leave(room, h, respawnAt) {
    h.state = 'gone'; h.t0 = now(); h.respawnAt = Math.max(now() + 5000, respawnAt || (now() + CFG.HELI.respawnSec * 1000)); h.riders = []; h.boardedAt = {};
    broadcast(room);
  }
  /* a shot at "the helicopter": the nearest machine that is not gone, unless the shooter names one */
  function hit(room, shooter, w, idx) {
    if (!has(room) || !shooter || !shooter.alive) return { ok: false, err: 'Not alive' };
    let h = (typeof idx === 'number' && room.helis[idx]) ? room.helis[idx] : null;
    if (!h) { const nr = nearestMachine(room, shooter.pos, ['pad', 'landed', 'flying', 'returning', 'crash']); if (!nr) return { ok: false, err: 'No helicopter' }; h = nr.m; }
    if (h.state === 'gone') return { ok: false, err: 'No helicopter' };
    const pose = poseOf(room, h);
    if (!pose) return { ok: false, err: 'No helicopter' };
    const dx = pose.x - shooter.pos[0], dy = pose.y - shooter.pos[1], dz = pose.z - shooter.pos[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 340) return { ok: false, err: 'Out of range' };
    if (h.riders.indexOf(shooter.id) >= 0) return { ok: false, err: 'You are aboard' };
    let dmg = CFG.heliDamageFor(CFG.HELI, CFG.WEAPONS, w);
    if (dmg <= 0) return { ok: true, dmg: 0, hp: h.hp, idx: h.idx };
    /* v1.0y: AIR TO AIR — the shooter rides another airborne machine: 2x */
    const mine = machineOf(room, shooter.id);
    const airToAir = !!(mine && mine !== h && (mine.state === 'flying' || mine.state === 'returning') && (h.state === 'flying' || h.state === 'returning'));
    if (airToAir) dmg = Math.round(dmg * (CFG.HELI.airToAirMult || 2));
    if (CFG.WEAPONS[w].type === 'rocket') {
      const tNow = now();
      if (shooter.lastHeliRocketAt && tNow - shooter.lastHeliRocketAt < 1800) return { ok: false, err: 'Too fast' };
      shooter.lastHeliRocketAt = tNow;
    }
    h.hp = Math.max(0, h.hp - dmg); h.lastHitBy = shooter.id; h.lastHitAt = now();
    io.to(room.code).emit('heliHp', { hp: h.hp, max: CFG.HELI.hp, by: shooter.id, idx: h.idx, a2a: airToAir });
    if (h.hp <= 0) { const n = destroy(room, h, shooter); return { ok: true, dmg, hp: 0, destroyed: true, n, idx: h.idx, a2a: airToAir }; }
    return { ok: true, dmg, hp: h.hp, idx: h.idx, a2a: airToAir };
  }
  function destroy(room, h, by) {
    const pose = poseOf(room, h) || { x: h.pad[0], y: CFG.HELI.padY, z: h.pad[1] };
    let n = 0;
    for (const id of h.riders) { const q = room.players.get(id); if (q && q.alive && !q.out) { applyDamage(room, q, 999, by.id, 'helidown', false, true); n++; } }
    h.hp = 0;
    io.to(room.code).emit('heliBoom', { x: pose.x, y: pose.y, z: pose.z, by: by.id, byName: by.name, n, idx: h.idx });
    leave(room, h, now() + CFG.HELI.respawnSec * 1000);
    return n;
  }
  /* v1.0v: an EMP within reach fells every airborne machine in range */
  function emp(room, p) {
    if (!has(room) || !p) return { ok: false };
    let n = 0, felled = 0, nearest = 1e9;
    for (const h of room.helis) {
      if (h.state !== 'flying' && h.state !== 'returning') continue;
      if (h.riders.indexOf(p.id) >= 0) continue;
      const pose = poseOf(room, h); if (!pose) continue;
      const d = Math.hypot(pose.x - p.pos[0], pose.z - p.pos[2]); nearest = Math.min(nearest, d);
      if (d > (CFG.HELI.empRange || 80)) continue;
      n += destroy(room, h, p); felled++;
    }
    if (!felled) return { ok: false, err: nearest < 1e9 ? 'Helicopter out of EMP range (' + Math.round(nearest) + ' m)' : 'Not airborne' };
    return { ok: true, n, felled };
  }

  function reset(room) { room.helis = null; }
  return { start, tick, hit, board, bail, land, snapshot, reset, poseNow, poseOf, inCabin, fallen, pathFor, destroy, emp, machineOf };
};
