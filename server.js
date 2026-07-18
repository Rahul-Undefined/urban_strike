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
const CFG = require('./public/js/shared-config.js');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // code -> room
let joinCounter = 0;

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
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function clampOpt(v, options, dflt) {
  v = parseInt(v, 10);
  return options.indexOf(v) >= 0 ? v : dflt;
}
function modeInfo(room) { return CFG.MODES[room.settings.mode] || CFG.MODES.ffa; }

function makeRoom(hostSocket, name, settings) {
  const code = makeCode();
  const mode = (settings && CFG.MODES[settings.mode]) ? settings.mode : CFG.MATCH.defaultMode;
  const room = {
    code,
    hostId: hostSocket.id,
    state: 'lobby', // lobby | playing | ended
    settings: {
      killTarget: clampOpt(settings && settings.killTarget, CFG.MATCH.killOptions, CFG.MATCH.defaultKills),
      minutes: clampOpt(settings && settings.minutes, CFG.MATCH.timeOptions, CFG.MATCH.defaultMinutes),
      airdropSec: settings && settings.airdropSec ? Math.max(5, Math.min(600, settings.airdropSec | 0)) : 0,
      mode
    },
    players: new Map(),
    teamKills: { a: 0, b: 0 },
    pickups: [],
    startedAt: 0,
    timer: null,
    snapTimer: null
  };
  rooms.set(code, room);
  addPlayer(room, hostSocket, name);
  return room;
}

function addPlayer(room, socket, name) {
  const p = {
    id: socket.id,
    name: cleanName(name),
    color: CFG.COLORS[0],
    team: null,
    joinOrder: joinCounter++,
    kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, ping: 0,
    hp: CFG.PLAYER.hp, armorLvl: 0, armorDur: 0, alive: false,
    protUntil: 0, att: { sight: null, muzzle: null, mag: null }, exW: {}, rd: {},
    pos: [0, 0.95, 0], ry: 0, rx: 0, crouch: 0, mv: 0, wp: 0, ln: 0,
    lastShotAt: {}, history: [], respawnAt: 0
  };
  room.players.set(socket.id, p);
  socket.join(room.code);
  socket.data.roomCode = room.code;
  refreshTeamsAndColors(room);
}

// Team assignment (alternating by join order = automatic balancing) + colors.
function refreshTeamsAndColors(room) {
  const list = [...room.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  const teams = modeInfo(room).teams;
  list.forEach((p, i) => {
    if (teams) {
      p.team = (i % 2 === 0) ? 'a' : 'b';
      p.color = CFG.TEAMS[p.team].color;
    } else {
      p.team = null;
      p.color = CFG.COLORS[i % CFG.COLORS.length];
    }
  });
}

function lobbyPayload(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, team: p.team,
      kills: p.kills, deaths: p.deaths, assists: p.assists,
      damage: Math.round(p.damage), streak: p.streak, ping: p.ping
    }))
  };
}
function pushLobby(room) { io.to(room.code).emit('lobby', lobbyPayload(room)); }

// ---------- spawns ----------
function pickSpawn(room, forP) {
  const teams = modeInfo(room).teams;
  const candidates = CFG.SPAWNS
    .map((s, i) => ({ s, i }))
    .filter(c => !teams || c.s[3] === forP.team || c.s[3] === 'n');
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
function initPickups(room) {
  const items = CFG.LOOT_ITEMS;
  const byRar = { c: [], r: [], l: [] };
  for (const t in items) byRar[items[t].rar].push(t);
  room.nextLootId = 0;
  room.pickups = [];
  let hasA3 = false, hasLegW = false;
  CFG.LOOT_POINTS.forEach(pt => {
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
  const pt = CFG.AIRDROP.points[Math.floor(Math.random() * CFG.AIRDROP.points.length)];
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
function startMatch(room) {
  room.state = 'playing';
  room.startedAt = now();
  room.teamKills = { a: 0, b: 0 };
  for (const p of room.players.values()) {
    p.kills = 0; p.deaths = 0; p.assists = 0; p.damage = 0; p.streak = 0;
    p.att = { sight: null, muzzle: null, mag: null }; p.exW = {}; p.rd = {};
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
  startSnapshots(room);
  scheduleAirdrop(room);
  if (room.settings.minutes > 0) {
    room.timer = setTimeout(() => endMatch(room, null, 'time'), room.settings.minutes * 60000);
  }
}

function startSnapshots(room) {
  stopSnapshots(room);
  room.snapN = 0;
  room.snapTimer = setInterval(() => {
    respawnPickups(room);
    if (++room.snapN % 60 === 0) pushLobby(room); // live K/D/assists/damage refresh (~4 s)
    const players = {};
    for (const p of room.players.values()) {
      players[p.id] = {
        p: p.pos, ry: p.ry, rx: p.rx, cr: p.crouch, mv: p.mv, wp: p.wp, ln: p.ln,
        hp: Math.round(p.hp), lv: p.armorLvl, du: Math.round(p.armorDur),
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
function weaponServerDamage(weapon, part, pellets, dist) {
  const w = CFG.WEAPONS[weapon];
  if (!w) return 0;
  let dmg = w.dmg;
  if (w.pellets) dmg *= Math.max(1, Math.min(pellets || 1, w.pellets));
  if (part === 'head') dmg *= (w.head || 1);
  if (dist > w.range) dmg *= Math.max(0.45, 1 - (dist - w.range) / w.range);
  return dmg;
}

function applyDamage(room, victim, dmg, attackerId, weapon, headshot, pointBlank) {
  if (!victim.alive) return;
  const attacker = room.players.get(attackerId);
  const teams = modeInfo(room).teams;
  // friendly fire off in team modes (self-damage from explosives still allowed)
  if (teams && attacker && attackerId !== victim.id && attacker.team === victim.team) return;
  // spawn protection (attacking others still allowed; being hit is not)
  if (victim.protUntil > now() && attackerId !== victim.id) return;

  // tiered armor with durability; point-blank explosives ignore armor entirely
  let soaked = 0;
  if (pointBlank) {
    victim.armorLvl = 0; victim.armorDur = 0;
    victim.hp = 0;
  } else if (victim.armorLvl > 0) {
    const rate = CFG.ARMOR[victim.armorLvl].absorb;
    soaked = Math.min(victim.armorDur, dmg * rate);
    victim.armorDur -= soaked;
    if (victim.armorDur <= 0.5) { victim.armorLvl = 0; victim.armorDur = 0; }
  }
  if (!pointBlank) victim.hp = Math.max(0, victim.hp - (dmg - soaked));
  // scoreboard credit + assist bookkeeping
  if (attacker && attackerId !== victim.id) {
    attacker.damage += dmg;
    const rec = victim.rd[attackerId] || (victim.rd[attackerId] = { d: 0, t: 0 });
    rec.d += dmg; rec.t = now();
  }

  io.to(victim.id).emit('damaged', {
    hp: Math.round(victim.hp), lv: victim.armorLvl, du: Math.round(victim.armorDur),
    from: attackerId, fromPos: attacker ? attacker.pos : null
  });
  if (attacker && attackerId !== victim.id) {
    io.to(attackerId).emit('hitConfirm', { dmg: Math.round(dmg), headshot: !!headshot, kill: victim.hp <= 0, v: victim.id });
  }

  if (victim.hp <= 0) {
    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = now() + CFG.MATCH.respawnDelay * 1000;
    let killerName = 'the world', killerStreak = 0;
    if (attacker) {
      if (attackerId === victim.id) { killerName = victim.name; }
      else {
        attacker.kills++;
        attacker.streak++;
        killerStreak = attacker.streak;
        killerName = attacker.name;
        if (teams && attacker.team) room.teamKills[attacker.team]++;
      }
    }
    // assists: meaningful damage shortly before the kill, by someone else
    const assistIds = [];
    const cutoff = now() - CFG.MATCH.assistWindow * 1000;
    for (const aid in victim.rd) {
      if (aid === attackerId || aid === victim.id) continue;
      const rec = victim.rd[aid];
      if (rec.t >= cutoff && rec.d >= CFG.MATCH.assistMinDmg) {
        const ap = room.players.get(aid);
        if (ap) { ap.assists++; assistIds.push(aid); }
      }
    }
    victim.rd = {};
    victim.streak = 0;
    io.to(room.code).emit('death', {
      victimId: victim.id, victimName: victim.name,
      killerId: attackerId, killerName, killerStreak, assistIds,
      weapon, headshot: !!headshot, self: attackerId === victim.id
    });
    pushLobby(room);
    if (attacker && attackerId !== victim.id) {
      const target = room.settings.killTarget;
      if (teams ? room.teamKills[attacker.team] >= target : attacker.kills >= target) {
        endMatch(room, attackerId, 'kills');
      }
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

// ---------- sockets ----------
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
    room.settings.killTarget = clampOpt(s && s.killTarget, CFG.MATCH.killOptions, room.settings.killTarget);
    room.settings.minutes = clampOpt(s && s.minutes, CFG.MATCH.timeOptions, room.settings.minutes);
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
    if (!d || !CFG.WEAPONS[d.w] && d.w !== 'frag') return;
    const victim = room.players.get(d.victim); if (!victim || !victim.alive) return;

    const explosive = (d.w === 'frag' || d.w === 'rocket');
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
