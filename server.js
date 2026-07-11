/* UrbanStrike server
   - Serves the client from /public
   - Manages rooms (5-char codes), lobby, match lifecycle
   - Relays player state, broadcasts snapshots at CFG.NET.snapRate
   - Owns authoritative HP/armor; validates reported hits against
     fire-rate limits + a short position-history window (lag-comp lite). */

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const CFG = require('./public/js/shared-config.js');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // code -> room

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return rooms.has(c) ? makeCode() : c;
}
function cleanName(n) {
  n = String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 14);
  return n || 'Operator';
}
const now = () => Date.now();

function makeRoom(hostSocket, name, settings) {
  const code = makeCode();
  const room = {
    code,
    hostId: hostSocket.id,
    state: 'lobby', // lobby | playing | ended
    settings: {
      killTarget: clampOpt(settings && settings.killTarget, CFG.MATCH.killOptions, CFG.MATCH.defaultKills),
      minutes: clampOpt(settings && settings.minutes, CFG.MATCH.timeOptions, CFG.MATCH.defaultMinutes)
    },
    players: new Map(),
    startedAt: 0,
    timer: null,
    snapTimer: null
  };
  rooms.set(code, room);
  addPlayer(room, hostSocket, name);
  return room;
}
function clampOpt(v, options, dflt) {
  v = parseInt(v, 10);
  return options.indexOf(v) >= 0 ? v : dflt;
}

function addPlayer(room, socket, name) {
  const usedColors = [...room.players.values()].map(p => p.color);
  const color = CFG.COLORS.find(c => usedColors.indexOf(c) < 0) || CFG.COLORS[0];
  const p = {
    id: socket.id,
    name: cleanName(name),
    color,
    kills: 0, deaths: 0, ping: 0,
    hp: CFG.PLAYER.hp, armor: CFG.PLAYER.armor, alive: false,
    pos: [0, 0.95, 0], ry: 0, rx: 0, crouch: 0, mv: 0, wp: 0, ln: 0,
    lastShotAt: {}, history: [], respawnAt: 0
  };
  room.players.set(socket.id, p);
  socket.join(room.code);
  socket.data.roomCode = room.code;
}

function lobbyPayload(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths, ping: p.ping
    }))
  };
}
function pushLobby(room) { io.to(room.code).emit('lobby', lobbyPayload(room)); }

function pickSpawn(room, forId) {
  // Farthest spawn point from all living enemies.
  const enemies = [...room.players.values()].filter(p => p.alive && p.id !== forId);
  let best = 0, bestScore = -1;
  CFG.SPAWNS.forEach((s, i) => {
    let d = 1e9;
    enemies.forEach(e => {
      const dx = s[0] - e.pos[0], dz = s[1] - e.pos[2];
      d = Math.min(d, dx * dx + dz * dz);
    });
    if (enemies.length === 0) d = Math.random() * 1000;
    if (d > bestScore) { bestScore = d; best = i; }
  });
  return best;
}

function spawnPlayer(room, p) {
  const idx = pickSpawn(room, p.id);
  const s = CFG.SPAWNS[idx];
  p.hp = CFG.PLAYER.hp; p.armor = CFG.PLAYER.armor; p.alive = true;
  p.pos = [s[0], 0.95, s[1]]; p.ry = s[2]; p.history = [];
  io.to(room.code).emit('spawn', { id: p.id, pos: p.pos, ry: p.ry });
}

function startMatch(room) {
  room.state = 'playing';
  room.startedAt = now();
  for (const p of room.players.values()) { p.kills = 0; p.deaths = 0; }
  io.to(room.code).emit('matchStart', {
    settings: room.settings,
    startedAt: room.startedAt,
    serverNow: now(),
    players: lobbyPayload(room).players
  });
  for (const p of room.players.values()) spawnPlayer(room, p);
  startSnapshots(room);
  if (room.settings.minutes > 0) {
    room.timer = setTimeout(() => endMatch(room, null, 'time'), room.settings.minutes * 60000);
  }
}

function startSnapshots(room) {
  stopSnapshots(room);
  room.snapTimer = setInterval(() => {
    const players = {};
    for (const p of room.players.values()) {
      players[p.id] = { p: p.pos, ry: p.ry, rx: p.rx, cr: p.crouch, mv: p.mv, wp: p.wp, ln: p.ln, hp: p.hp, ar: p.armor, al: p.alive ? 1 : 0 };
    }
    io.to(room.code).emit('snap', { t: now(), players });
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
  if (!winnerId) {
    let best = null;
    for (const p of room.players.values()) if (!best || p.kills > best.kills) best = p;
    winnerId = best ? best.id : null;
  }
  io.to(room.code).emit('matchEnd', { winnerId, reason, players: lobbyPayload(room).players });
}

function weaponServerDamage(weapon, part, pellets, dist) {
  const w = CFG.WEAPONS[weapon];
  if (!w) return 0;
  let dmg = w.dmg;
  if (w.pellets) dmg *= Math.max(1, Math.min(pellets || 1, w.pellets));
  if (part === 'head') dmg *= (w.head || 1);
  if (dist > w.range) dmg *= Math.max(0.45, 1 - (dist - w.range) / w.range);
  return dmg;
}

function applyDamage(room, victim, dmg, attackerId, weapon, headshot) {
  if (!victim.alive) return;
  let toArmor = 0;
  if (victim.armor > 0) {
    toArmor = Math.min(victim.armor, dmg * CFG.PLAYER.armorAbsorb);
    victim.armor = Math.max(0, victim.armor - toArmor);
  }
  const toHp = dmg - toArmor;
  victim.hp = Math.max(0, victim.hp - toHp);
  const attacker = room.players.get(attackerId);

  io.to(victim.id).emit('damaged', {
    hp: Math.round(victim.hp), armor: Math.round(victim.armor),
    from: attackerId, fromPos: attacker ? attacker.pos : null
  });
  if (attacker && attackerId !== victim.id) {
    io.to(attackerId).emit('hitConfirm', { dmg: Math.round(dmg), headshot: !!headshot, kill: victim.hp <= 0 });
  }

  if (victim.hp <= 0) {
    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = now() + CFG.MATCH.respawnDelay * 1000;
    let killerName = 'the world';
    if (attacker) {
      if (attackerId === victim.id) { killerName = victim.name; }
      else { attacker.kills++; killerName = attacker.name; }
    }
    io.to(room.code).emit('death', {
      victimId: victim.id, victimName: victim.name,
      killerId: attackerId, killerName,
      weapon, headshot: !!headshot, self: attackerId === victim.id
    });
    pushLobby(room);
    if (attacker && attackerId !== victim.id && attacker.kills >= room.settings.killTarget) {
      endMatch(room, attackerId, 'kills');
    }
  }
}

// Lag-compensation lite: accept the claimed victim position only if it is
// close to where the server has recently seen that victim.
function positionPlausible(victim, claimPos) {
  if (!claimPos || claimPos.length !== 3) return false;
  const tol = CFG.NET.hitTolerance;
  const cutoff = now() - CFG.NET.historyMs;
  const check = (pos) => {
    const dx = pos[0] - claimPos[0], dy = pos[1] - claimPos[1], dz = pos[2] - claimPos[2];
    return dx * dx + dy * dy + dz * dz <= tol * tol;
  };
  if (check(victim.pos)) return true;
  for (let i = victim.history.length - 1; i >= 0; i--) {
    const h = victim.history[i];
    if (h.t < cutoff) break;
    if (check(h.pos)) return true;
  }
  return false;
}

function fireRateOk(shooter, weapon) {
  const w = CFG.WEAPONS[weapon];
  if (!w || !w.rpm) return true;
  if (weapon === 'frag' || weapon === 'rocket') return true;
  const minInterval = (60000 / w.rpm) * 0.55; // generous tolerance for jitter
  const last = shooter.lastShotAt[weapon] || 0;
  const t = now();
  if (t - last < minInterval) return false;
  shooter.lastShotAt[weapon] = t;
  return true;
}

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
    if (room.players.size >= CFG.MATCH.maxPlayers) return cb && cb({ ok: false, error: 'Room is full (4 players max).' });
    addPlayer(room, socket, data && data.name);
    cb && cb({ ok: true, code: room.code, id: socket.id, inProgress: room.state === 'playing' });
    pushLobby(room);
    if (room.state === 'playing') {
      const p = room.players.get(socket.id);
      socket.emit('matchStart', {
        settings: room.settings, startedAt: room.startedAt, serverNow: now(),
        players: lobbyPayload(room).players
      });
      spawnPlayer(room, p);
    }
  });

  socket.on('updateSettings', (s) => {
    const room = getRoom(socket); if (!room || socket.id !== room.hostId || room.state !== 'lobby') return;
    room.settings.killTarget = clampOpt(s && s.killTarget, CFG.MATCH.killOptions, room.settings.killTarget);
    room.settings.minutes = clampOpt(s && s.minutes, CFG.MATCH.timeOptions, room.settings.minutes);
    pushLobby(room);
  });

  socket.on('startMatch', () => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId) return;
    if (room.state === 'playing') return;
    startMatch(room);
  });

  socket.on('returnLobby', () => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId || room.state !== 'ended') return;
    room.state = 'lobby';
    for (const p of room.players.values()) { p.alive = false; p.kills = 0; p.deaths = 0; }
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
    p.crouch = s.cr ? 1 : 0; p.mv = s.mv | 0; p.wp = s.wp | 0; p.ln = num(s.ln);
    if (typeof s.ping === 'number') p.ping = Math.max(0, Math.min(999, s.ping | 0));
    p.history.push({ t: now(), pos: p.pos });
    const cutoff = now() - CFG.NET.historyMs;
    while (p.history.length && p.history[0].t < cutoff) p.history.shift();
  });

  // Cosmetic shot relay (muzzle flash / tracer / sound on other clients)
  socket.on('shoot', (d) => {
    const room = getRoom(socket); if (!room || room.state !== 'playing') return;
    socket.to(room.code).emit('shoot', { id: socket.id, w: d && d.w, o: d && d.o, dir: d && d.dir });
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
    if (!d || !CFG.WEAPONS[d.w] && d.w !== 'frag') return;
    const victim = room.players.get(d.victim); if (!victim || !victim.alive) return;

    const explosive = (d.w === 'frag' || d.w === 'rocket');
    if (!explosive && d.victim === socket.id) return;
    if (!explosive && !fireRateOk(shooter, d.w)) return;
    if (!positionPlausible(victim, d.vp)) return;

    let dmg;
    if (d.w === 'frag') {
      dmg = Math.max(0, Math.min(CFG.THROWS.frag.dmg, num(d.dmg)));
    } else if (d.w === 'rocket') {
      dmg = Math.max(0, Math.min(CFG.WEAPONS.rocket.dmg, num(d.dmg)));
    } else {
      const dx = shooter.pos[0] - victim.pos[0], dy = shooter.pos[1] - victim.pos[1], dz = shooter.pos[2] - victim.pos[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dmg = weaponServerDamage(d.w, d.part, d.pellets, dist);
    }
    if (dmg <= 0) return;
    applyDamage(room, victim, dmg, socket.id, d.w, d.part === 'head');
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
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      stopSnapshots(room);
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) {
      room.hostId = room.players.keys().next().value;
      io.to(room.code).emit('toast', { msg: (room.players.get(room.hostId).name) + ' is now the host' });
    }
    if (p) io.to(room.code).emit('playerLeft', { id: socket.id, name: p.name });
    pushLobby(room);
    if (room.state === 'playing' && room.players.size === 1) {
      endMatch(room, room.players.keys().next().value, 'forfeit');
    }
  });

  function getRoom(sock) { return rooms.get(sock.data.roomCode); }
});

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('UrbanStrike server running on http://localhost:' + PORT);
});
