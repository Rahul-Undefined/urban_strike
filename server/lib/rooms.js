/* Room + lobby domain: codes, membership, team balancing, lobby payloads. */
'use strict';
const CFG = require('../../public/src/config/index.js');
module.exports = function initRoomsModule(ctx) {
  const { io, rooms, now } = ctx;
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let joinCounter = 0;

function makeCode() {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return rooms.has(c) ? makeCode() : c;
}
function cleanName(n) {
  n = String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 14);
  return n || 'Operator';
}
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
    kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, ping: 0, ready: false,
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
      damage: Math.round(p.damage), streak: p.streak, ping: p.ping, ready: !!p.ready
    }))
  };
}
function pushLobby(room) { io.to(room.code).emit('lobby', lobbyPayload(room)); }

// ---------- spawns ----------

  return { makeCode, cleanName, num, clampOpt, modeInfo, makeRoom,
    addPlayer, refreshTeamsAndColors, lobbyPayload, pushLobby };
};
