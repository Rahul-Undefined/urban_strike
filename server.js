/* UrbanStrike server
   - Serves the client from /public
   - Manages rooms (5-char codes), lobby, match lifecycle, FFA + team modes
   - Relays player state, broadcasts snapshots at CFG.NET.snapRate
   - Owns authoritative HP / tiered armor / pickups; validates reported hits
     against fire-rate limits + a short position-history window (lag-comp lite). */

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const CFG = require('./public/src/config/index.js');
const now = () => Date.now();

// per-map data resolution (urban keeps the legacy top-level keys)
function mapData(room) {
  var m = room.settings && room.settings.map;
  if (m === 'rural' && CFG.MAPS_RURAL) return CFG.MAPS_RURAL;
  if (m === 'metro' && CFG.MAPS_METRO) return CFG.MAPS_METRO;
  return { LOOT_POINTS: CFG.LOOT_POINTS, SPAWNS: CFG.SPAWNS, AIRDROP_POINTS: CFG.AIRDROP.points };
}

/* Every connected player must be Ready before the host may launch. Solo hosts
   are not special-cased: one player, one Ready click. */
function allReady(room) {
  return room.players.size > 0 && [...room.players.values()].every(q => q.ready);
}
/* HOST-TRIGGERED launch countdown (v7.4). Was an auto-start that fired the
   instant everyone readied, which made the START MATCH button decorative.
   Once the host commits, the countdown runs to completion — a late unready
   must not become a grief-cancel. It aborts only if the room stops being a
   lobby or empties out. */
function beginCountdown(room) {
  if (room.cdTimer || room.state !== 'lobby') return;
  room.cdN = CFG.MATCH.startCountdown;
  io.to(room.code).emit('countdown', { n: room.cdN });
  room.cdTimer = setInterval(() => {
    if (room.state !== 'lobby' || room.players.size === 0) { cancelCountdown(room); return; }
    room.cdN--;
    io.to(room.code).emit('countdown', { n: room.cdN });
    if (room.cdN <= 0) { cancelCountdown(room, true); startMatch(room); }
  }, 1000);
  pushLobby(room);   // AFTER cdTimer exists — counting is derived from it
}
function cancelCountdown(room, silent) {
  const was = !!room.cdTimer;
  if (room.cdTimer) { clearInterval(room.cdTimer); room.cdTimer = null; }
  if (!silent && room.cdN > 0) io.to(room.code).emit('countdown', { n: -1 });
  room.cdN = 0;
  if (was && !silent && room.state === 'lobby') pushLobby(room);
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();

// ---------- domain modules (io/state injected; no module touches globals) ----------
const Rooms = require('./server/lib/rooms.js')({ io, rooms, now });
const { makeCode, cleanName, num, clampOpt, modeInfo, makeRoom,
  addPlayer, refreshTeamsAndColors, lobbyPayload, pushLobby } = Rooms;
const Loot = require('./server/lib/loot.js')({ io, now, mapData });
const { initPickups, pickupList, tryCollect, respawnPickups,
  scheduleAirdrop, clearAirdrop, dropCrate } = Loot;
const Combat = require('./server/lib/combat.js')({ io, now, modeInfo, pushLobby,
  endMatch: (...a) => endMatch(...a) });
const { weaponServerDamage, applyDamage, positionPlausible, fireRateOk } = Combat;
const Mines = require('./server/lib/mines.js')({ io, now, applyDamage: (...a) => applyDamage(...a), modeInfo }); // code -> room

function pickSpawn(room, forP) {
  const teams = modeInfo(room).teams;
  /* v8.27: NEVER LET THE FILTER RETURN NOTHING.

     In a team mode this keeps only spawns tagged with the player's own team
     or 'n'. If `forP.team` is ever null or undefined — a player who joined at
     the wrong moment, a mode switched while someone was mid-handshake — the
     filter matches only 'n' spawns. Urban has 4 of those and Rural 6, but
     METRO HAS ZERO. `candidates[0]` is then undefined, `best.s` throws inside
     the match-start path, and the client sits on a black screen because the
     match never actually began.

     Falling back to the full spawn set is strictly better than throwing: the
     worst case is one player spawning on a tile meant for the other team,
     which is a fairness annoyance for one life. A crash ends the match for
     everybody. */
  const all = mapData(room).SPAWNS.map((s, i) => ({ s, i }));
  let candidates = all.filter(c => !teams || c.s[3] === forP.team || c.s[3] === 'n');
  if (!candidates.length) candidates = all;
  const enemies = [...room.players.values()]
    .filter(p => p.alive && p.id !== forP.id && (!teams || p.team !== forP.team));
  let best = candidates[0], bestScore = -1;
  candidates.forEach(c => {
    let d = 1e9;
    enemies.forEach(e => {
      const dx = c.s[0] - e.pos[0], dz = c.s[1] - e.pos[2];
      d = Math.min(d, dx * dx + dz * dz);
    });
    if (enemies.length === 0) d = Math.random() * 1000;
    if (d > bestScore) { bestScore = d; best = c; }
  });
  return best.s;
}

function spawnPlayer(room, p) {
  const s = pickSpawn(room, p);
  p.hp = CFG.PLAYER.hp; p.armorLvl = 0; p.armorDur = 0; p.alive = true;
  p.protUntil = now() + CFG.MATCH.spawnProtect * 1000;
  p.pos = [s[0], 0.95, s[1]]; p.ry = s[2]; p.history = [];
  io.to(room.code).emit('spawn', { id: p.id, pos: p.pos, ry: p.ry, prot: CFG.MATCH.spawnProtect });
}

// ---------- dynamic loot (server-authoritative) ----------
// Every match rolls fresh loot across CFG.LOOT_POINTS by point class + rarity
// weights, with guarantees: an L3 vest and at least one legendary weapon exist.
function startMatch(room) {
  room.state = 'playing';
  room.startedAt = now();
  room.teamKills = { a: 0, b: 0 };
  for (const p of room.players.values()) {
    p.kills = 0; p.deaths = 0; p.assists = 0; p.damage = 0; p.streak = 0;
    p.att = { sight: null, muzzle: null, mag: null }; p.exW = {}; p.rd = {};
    p.ready = false; p.mines = CFG.GEAR.mine.start; p.lastMolo = {};
  }
  refreshTeamsAndColors(room);
  initPickups(room);
  io.to(room.code).emit('matchStart', {
    settings: room.settings,
    startedAt: room.startedAt,
    serverNow: now(),
    players: lobbyPayload(room).players,
    pickups: pickupList(room)
  });
  for (const p of room.players.values()) spawnPlayer(room, p);
  cancelCountdown(room);
  Mines.reset(room);
  startSnapshots(room);
  scheduleAirdrop(room);
  if (room.settings.minutes > 0) {
    room.timer = setTimeout(() => endMatch(room, null, 'time'), room.settings.minutes * 60000);
  }
}

/* v4.9 out-of-combat health regeneration. Server-authoritative like all other
   HP changes; the client just receives the higher hp in the next snapshot, so
   no new message type and no trust change. Armor does NOT regenerate. */
function regenTick(room) {
  const R = CFG.REGEN;
  if (!R || !R.enabled || !room.startedAt) return;
  const t = now();
  if (t - (room.lastRegenAt || 0) < 250) return;   // 4Hz, not snapshot rate
  const dt = Math.min(1, (t - (room.lastRegenAt || t - 250)) / 1000);
  room.lastRegenAt = t;
  const cap = CFG.PLAYER.hp * (R.maxFrac || 1);
  for (const p of room.players.values()) {
    if (!p.alive || p.hp >= cap) continue;
    if (t - (p.lastHitAt || 0) < R.delaySec * 1000) continue;
    p.hp = Math.min(cap, p.hp + R.perSec * dt);
  }
}

function startSnapshots(room) {
  stopSnapshots(room);
  room.snapN = 0;
  room.snapTimer = setInterval(() => {
    respawnPickups(room);
    Mines.tick(room);
    regenTick(room);
    if (++room.snapN % 60 === 0) pushLobby(room); // live K/D/assists/damage refresh (~4 s)
    const players = {};
    for (const p of room.players.values()) {
      players[p.id] = {
        p: [Math.round(p.pos[0] * 100) / 100, Math.round(p.pos[1] * 100) / 100, Math.round(p.pos[2] * 100) / 100],
        ry: Math.round(p.ry * 1000) / 1000, rx: Math.round(p.rx * 1000) / 1000,
        cr: p.crouch, mv: p.mv, wp: p.wp, ln: Math.round(p.ln * 100) / 100,
        hp: Math.round(p.hp), lv: p.armorLvl, du: Math.round(p.armorDur),
        hl: p.helmLvl | 0,          // v7.9: helmets are VISIBLE on the model now
        rl: p.rl | 0,
        al: p.alive ? 1 : 0, tm: p.team
      };
    }
    io.to(room.code).emit('snap', {
      t: now(), players,
      tk: modeInfo(room).teams ? room.teamKills : null
    });
  }, 1000 / CFG.NET.snapRate);
}
function stopSnapshots(room) {
  if (room.snapTimer) { clearInterval(room.snapTimer); room.snapTimer = null; }
}

function endMatch(room, winnerId, reason) {
  if (room.state !== 'playing') return;
  room.state = 'ended';
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  stopSnapshots(room);
  clearAirdrop(room);
  Mines.clear(room);
  const teams = modeInfo(room).teams;
  let winnerTeam = null;
  if (teams) {
    winnerTeam = room.teamKills.a === room.teamKills.b ? null
      : (room.teamKills.a > room.teamKills.b ? 'a' : 'b');
    if (winnerId) winnerTeam = (room.players.get(winnerId) || {}).team || winnerTeam;
    if (!winnerId) {
      let best = null;
      for (const p of room.players.values())
        if (winnerTeam && p.team === winnerTeam && (!best || p.kills > best.kills)) best = p;
      winnerId = best ? best.id : null;
    }
  } else if (!winnerId) {
    let best = null;
    for (const p of room.players.values()) if (!best || p.kills > best.kills) best = p;
    winnerId = best ? best.id : null;
  }
  io.to(room.code).emit('matchEnd', {
    winnerId, winnerTeam, reason,
    teamKills: teams ? room.teamKills : null,
    players: lobbyPayload(room).players
  });
}

// ---------- combat validation ----------
io.on('connection', (socket) => {
  socket.on('createRoom', (data, cb) => {
    const room = makeRoom(socket, data && data.name, data && data.settings);
    if (cb) cb({ ok: true, code: room.code, id: socket.id });
    pushLobby(room);
  });

  socket.on('joinRoom', (data, cb) => {
    const code = String((data && data.code) || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: 'Room not found. Check the code.' });
    const cap = modeInfo(room).maxPlayers;
    if (room.players.size >= cap) return cb && cb({ ok: false, error: 'Room is full (' + cap + ' players max for this mode).' });
    addPlayer(room, socket, data && data.name);
    cb && cb({ ok: true, code: room.code, id: socket.id, inProgress: room.state === 'playing' });
    pushLobby(room);
    if (room.state === 'playing') {
      const p = room.players.get(socket.id);
      socket.emit('matchStart', {
        settings: room.settings, startedAt: room.startedAt, serverNow: now(),
        players: lobbyPayload(room).players,
        pickups: pickupList(room)
      });
      spawnPlayer(room, p);
    }
  });

  socket.on('updateSettings', (s) => {
    const room = getRoom(socket); if (!room || socket.id !== room.hostId || room.state !== 'lobby') return;
    if (room.cdTimer) return;                     // no rule changes mid-countdown
    room.settings.killTarget = clampOpt(s && s.killTarget, CFG.MATCH.killOptions, room.settings.killTarget);
    room.settings.minutes = clampOpt(s && s.minutes, CFG.MATCH.timeOptions, room.settings.minutes);
    if (s && s.map && CFG.MAPS[s.map] && CFG.MAPS[s.map].ready !== false) room.settings.map = s.map;
    if (s && CFG.MODES[s.mode]) {
      if (room.players.size > CFG.MODES[s.mode].maxPlayers) {
        socket.emit('toast', { msg: 'Too many players in room for that mode' });
      } else {
        room.settings.mode = s.mode;
        refreshTeamsAndColors(room);
      }
    }
    pushLobby(room);
  });

  socket.on('setReady', (d) => {
    const room = getRoom(socket); if (!room || room.state !== 'lobby') return;
    const p = room.players.get(socket.id); if (!p) return;
    p.ready = !!(d && d.v);
    pushLobby(room);   // the START gate is derived from this payload, client-side
  });
  socket.on('voiceJoin', () => {
    const room = getRoom(socket); if (!room) return;
    const p = room.players.get(socket.id); if (!p) return;
    p.voice = true;
    const ids = [...room.players.values()].filter(q => q.voice && q.id !== socket.id).map(q => q.id);
    socket.emit('voicePeers', { ids });
    socket.to(room.code).emit('voicePeerJoin', { id: socket.id });
  });
  socket.on('voiceLeave', () => {
    const room = getRoom(socket); if (!room) return;
    const p = room.players.get(socket.id); if (!p) return;
    p.voice = false;
    socket.to(room.code).emit('voicePeerLeave', { id: socket.id });
  });
  socket.on('voiceSignal', (d) => {
    const room = getRoom(socket); if (!room || !d || !d.to) return;
    const p = room.players.get(socket.id);
    const q = room.players.get(d.to);
    if (!p || !q || !p.voice || !q.voice) return; // same room + both opted in
    io.to(d.to).emit('voiceSignal', { from: socket.id, data: d.data });
  });
  socket.on('placeMine', (d, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    const room = getRoom(socket);
    if (!room || room.state !== 'playing') return ack({ ok: false, err: 'Not in a match' });
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return ack({ ok: false, err: 'Not alive' });
    ack(Mines.place(room, p, d && d.p));
  });
  /* v8.28 HOST-ASSIGNED TEAMS.

     Teams were auto-balanced by join order with no way to change them. This
     lets the host move anybody, and sets `teamLocked` so the auto-balancer
     fills around the choice instead of wiping it on the next join, leave or
     settings change — which is every time refreshTeamsAndColors() runs.

     Lobby only and host only, both checked here rather than trusted from the
     client. Mid-match team switching would hand someone a free look at the
     other side's spawns. */
  socket.on('setPlayerTeam', (d) => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId || room.state !== 'lobby') return;
    if (room.cdTimer) return;                       // no shuffling mid-countdown
    if (!modeInfo(room).teams) return;              // meaningless in FFA
    if (!d || (d.team !== 'a' && d.team !== 'b')) return;
    const p = room.players.get(d.id);
    if (!p) return;
    p.team = d.team;
    p.teamLocked = true;
    p.color = CFG.TEAMS[d.team].color;
    pushLobby(room);
  });

  socket.on('startMatch', () => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId) return;
    if (room.state === 'playing') return;
    if (room.cdTimer) return;                     // already counting down
    if (!allReady(room)) {                        // authoritative gate, not just a greyed button
      socket.emit('toast', { msg: 'All operators must be READY before launch.' });
      return;
    }
    beginCountdown(room);
  });

  socket.on('returnLobby', () => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId || room.state !== 'ended') return;
    room.state = 'lobby';
    cancelCountdown(room);
    Mines.clear(room);
    clearAirdrop(room);
    for (const p of room.players.values()) {
      p.alive = false; p.kills = 0; p.deaths = 0;
      p.assists = 0; p.damage = 0; p.streak = 0; p.ready = false;
      p.mines = 0; p.rd = {}; p.lastMolo = {};
    }
    io.to(room.code).emit('backToLobby');
    pushLobby(room);
  });

  // ~20 Hz player state
  socket.on('st', (s) => {
    const room = getRoom(socket); if (!room) return;
    const p = room.players.get(socket.id); if (!p || !p.alive) return;
    if (!s || !Array.isArray(s.p) || s.p.length !== 3) return;
    p.pos = [num(s.p[0]), num(s.p[1]), num(s.p[2])];
    p.ry = num(s.ry); p.rx = num(s.rx);
    p.crouch = Math.max(0, Math.min(2, (s.cr | 0))); p.mv = s.mv | 0; p.wp = s.wp | 0; p.ln = num(s.ln); // cr: 0 stand, 1 crouch, 2 prone
    p.rl = s.rl ? 1 : 0;                       // reloading — cosmetic only, never trusted for anything
    if (typeof s.ping === 'number') p.ping = Math.max(0, Math.min(999, s.ping | 0));
    p.history.push({ t: now(), pos: p.pos });
    const cutoff = now() - CFG.NET.historyMs;
    while (p.history.length && p.history[0].t < cutoff) p.history.shift();
    if (room.state === 'playing') tryCollect(room, p);
  });

  // Cosmetic shot relay (muzzle flash / tracer / sound on other clients)
  socket.on('shoot', (d) => {
    const room = getRoom(socket); if (!room || room.state !== 'playing') return;
    const p = room.players.get(socket.id);
    if (p) p.protUntil = 0;
    socket.to(room.code).emit('shoot', { id: socket.id, w: d && d.w, o: d && d.o, dir: d && d.dir, sup: d && d.sup ? 1 : 0 });
  });

  socket.on('proj', (d) => {
    const room = getRoom(socket); if (!room || room.state !== 'playing') return;
    socket.to(room.code).emit('proj', { id: socket.id, type: d && d.type, o: d && d.o, v: d && d.v });
  });

  socket.on('throw', (d) => {
    const room = getRoom(socket); if (!room || room.state !== 'playing') return;
    socket.to(room.code).emit('throw', { id: socket.id, type: d && d.type, o: d && d.o, v: d && d.v });
  });

  // Damage claim from the shooting client — validated here.
  socket.on('hit', (d) => {
    const room = getRoom(socket); if (!room || room.state !== 'playing') return;
    const shooter = room.players.get(socket.id); if (!shooter || !shooter.alive) return;
    shooter.protUntil = 0;
    if (!d || !CFG.WEAPONS[d.w] && d.w !== 'frag' && d.w !== 'molotov') return;
    const victim = room.players.get(d.victim); if (!victim || !victim.alive) return;

    const explosive = d.w === 'frag' || d.w === 'rocket' || d.w === 'molotov';
    if (!explosive && d.victim === socket.id) return;
    if (!explosive && !fireRateOk(shooter, d.w)) return;
    if (!positionPlausible(victim, d.vp)) return;

    let dmg, pointBlank = false;
    if (d.w === 'frag') {
      dmg = Math.max(0, Math.min(CFG.THROWS.frag.dmg, num(d.dmg)));
      pointBlank = dmg >= CFG.THROWS.frag.dmg - 0.5; // hugged the blast -> guaranteed kill
    } else if (d.w === 'rocket') {
      dmg = Math.max(0, Math.min(CFG.WEAPONS.rocket.dmg, num(d.dmg)));
      pointBlank = dmg >= CFG.WEAPONS.rocket.dmg - 0.5;
    } else if (d.w === 'molotov') {
      dmg = Math.max(0, Math.min(CFG.THROWS.molotov.dmg, num(d.dmg)));
      shooter.lastMolo = shooter.lastMolo || {};
      if (now() - (shooter.lastMolo[d.victim] || 0) < 350) return; // burn-tick throttle
      shooter.lastMolo[d.victim] = now();
    } else {
      const dx = shooter.pos[0] - victim.pos[0], dy = shooter.pos[1] - victim.pos[1], dz = shooter.pos[2] - victim.pos[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dmg = weaponServerDamage(d.w, d.part, d.pellets, dist);
    }
    if (dmg <= 0) return;
    applyDamage(room, victim, dmg, socket.id, d.w, d.part === 'head', pointBlank);
  });

  socket.on('respawn', () => {
    const room = getRoom(socket); if (!room || room.state !== 'playing') return;
    const p = room.players.get(socket.id); if (!p || p.alive) return;
    if (now() < p.respawnAt - 250) return;
    spawnPlayer(room, p);
  });

  socket.on('pingCheck', (t, cb) => { if (cb) cb(t); });

  socket.on('disconnect', () => {
    const room = getRoom(socket); if (!room) return;
    const p = room.players.get(socket.id);
    if (p && p.voice) io.to(room.code).emit('voicePeerLeave', { id: socket.id }); // socket.to() is dead inside disconnect
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      stopSnapshots(room);
      clearAirdrop(room);
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) {
      room.hostId = room.players.keys().next().value;
      io.to(room.code).emit('toast', { msg: (room.players.get(room.hostId).name) + ' is now the host' });
    }
    if (p) io.to(room.code).emit('playerLeft', { id: socket.id, name: p.name });
    if (room.state === 'lobby') refreshTeamsAndColors(room);
    pushLobby(room);
    if (room.state === 'playing' && room.players.size === 1) {
      endMatch(room, room.players.keys().next().value, 'forfeit');
    }
  });

  function getRoom(sock) { return rooms.get(sock.data.roomCode); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('UrbanStrike server running on http://localhost:' + PORT);
});
