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
/* v8.34: a fresh score bucket for exactly the sides this mode fields. Building
   it from CFG.activeTeams rather than a literal is what lets squad modes score
   at all — combat.js does `room.teamKills[attacker.team]++`, which silently
   produces NaN if the key was never seeded. */
function zeroTeamKills(modeId) {
  const out = {};
  CFG.activeTeams(modeId).forEach(t => { out[t] = 0; });
  return out;
}
/* v8.33: host-editable team names. Same strip-and-clamp as cleanName — these
   land in innerHTML on the scoreboard and the end screen, so the angle
   brackets and quotes have to go here, at the trust boundary, not later. */
function cleanTeamName(n, dflt) {
  n = String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 12).toUpperCase();
  return n || dflt;
}
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
      map: (settings && CFG.MAPS[settings.map] && CFG.MAPS[settings.map].ready !== false) ? settings.map : 'urban',
      killTarget: clampOpt(settings && settings.killTarget, CFG.MATCH.killOptions, CFG.MATCH.defaultKills),
      minutes: clampOpt(settings && settings.minutes, CFG.MATCH.timeOptions, CFG.MATCH.defaultMinutes),
      airdropSec: settings && settings.airdropSec ? Math.max(5, Math.min(600, settings.airdropSec | 0)) : 0,
      mode,
      botCount: Math.max(0, Math.min(19, (settings && settings.botCount | 0) || 0)),
      botSkill: (settings && settings.botSkill) || 'regular',
      /* v9.11: backfill defaults ON. Most of this game's mode list needs ten to
         twenty humans to exist, and the common case — a host and a friend or
         two — could not open Team Battle or Last Stand at all. Defaulting off
         would leave that content exactly as unreachable as before for everyone
         who does not find the toggle. A host with a full lobby can turn it off,
         and it does nothing in a room that is already full. */
      backfill: (settings && typeof settings.backfill === 'boolean') ? !!settings.backfill : true,
      // v8.33: default to the config names until the host renames them
      // v8.34: seed a name for every side this mode could field
      teamNames: (function () {
        const tn = {}, src = (settings && settings.teamNames) || {};
        CFG.TEAM_IDS.forEach(t => { tn[t] = cleanTeamName(src[t], CFG.TEAMS[t].name); });
        return tn;
      })()
    },
    players: new Map(),
    teamKills: zeroTeamKills(mode),
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
    /* v9.11: the reconnect token. Issued once, returned to that client alone,
       and never included in the lobby payload — a token anyone can read is a
       token anyone can use to take your seat and your score. */
    token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
    connected: true,
    kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, bestStreak: 0, ping: 0, ready: false,
    hp: CFG.PLAYER.hp, armorLvl: 0, armorDur: 0, helmLvl: 0, helmDur: 0, alive: false,
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
/* v10.22 `preserve`: fill in only players who have no valid side, leaving every
   settled assignment alone.

   Rahul: "player A is in team 1 but in the game sometimes player A is added in
   team 2, this doesn't happen everytime but it does happen most of the time."

   startMatch called this with no argument, so it re-ran the join-order
   round-robin over every unlocked player at the moment the match began. A host
   who pressed Shuffle saw the shuffled teams in the lobby — shuffleTeams sets
   teamLocked = false — and then watched them silently revert to join order on
   the first frame of play.

   Two changes together: shuffleTeams now LOCKS what it assigns, because a
   deliberate arrangement is deliberate however it was produced; and startMatch
   passes preserve = true, because by then the lobby is authoritative and
   re-running the balancer can only disagree with what the players just saw. */
function refreshTeamsAndColors(room, preserve) {
  const list = [...room.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  const teams = modeInfo(room).teams;
  /* v8.27: `teamLocked` is set when the host places somebody by hand. The
     auto-balancer fills everyone else around them instead of overwriting the
     choice on the next join, leave or settings change — which is every time
     this function runs. Without it a manual pick survives until the next
     player breathes. */
  /* v8.34: round-robin across however many sides the mode fields, not a
     hardcoded two. A held lock is honoured only if that side actually exists in
     the CURRENT mode — otherwise switching from squads back to 5v5 would strand
     players on team 'g' with no way to score. */
  const ids = CFG.activeTeams(room.settings.mode);
  /* v9.2 STRIKE TEAM. When the mode fills one side with bots, humans do NOT
     round-robin — every human belongs on the human side and every bot on the
     other. Without this the alternating balancer would put operator 2 on the
     bot team and hand them friendly fire against their own squad, which is the
     mode failing at its first premise. A manual host placement is ignored here
     for the same reason: there is no second side for a human to be placed on. */
  const humanSide = CFG.humanSideOf(room.settings.mode);
  if (humanSide) {
    list.forEach(p => {
      p.team = p.bot ? CFG.botSideOf(room.settings.mode) : humanSide;
      p.teamLocked = false;
      p.color = CFG.TEAMS[p.team].color;
    });
    return;
  }
  let autoIdx = 0;
  list.forEach((p, i) => {
    if (teams) {
      /* v10.22: in preserve mode any side the current mode fields is kept,
         locked or not. Only a player with no team, or one stranded on a side
         this mode does not field, is reassigned. */
      if (preserve && ids.indexOf(p.team) >= 0) {
        p.color = CFG.TEAMS[p.team].color;
        return;
      }
      if (p.teamLocked && ids.indexOf(p.team) >= 0) {
        p.color = CFG.TEAMS[p.team].color;
        return;
      }
      p.team = ids[autoIdx++ % ids.length];
      p.teamLocked = false;                      // a stale lock is cleared, not carried
      p.color = CFG.TEAMS[p.team].color;
    } else {
      p.team = null; p.teamLocked = false;
      p.color = CFG.COLORS[i % CFG.COLORS.length];
    }
  });
}

function lobbyPayload(room) {
  const list = [...room.players.values()];
  const notReady = list.filter(p => !p.ready).length;
  return {
    teams: room.teamKills || null,
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    // START-gate facts computed ONCE on the server so every client agrees.
    notReady: notReady,
    allReady: list.length > 0 && notReady === 0,
    counting: !!room.cdTimer,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, team: p.team,
      bot: !!p.bot,          // v8.38: clients label bots in the roster and scoreboard

      kills: p.kills, deaths: p.deaths, assists: p.assists,
      damage: Math.round(p.damage), streak: p.streak, bestStreak: p.bestStreak || 0,
      ping: p.ping, ready: !!p.ready
    }))
  };
}
function pushLobby(room) { io.to(room.code).emit('lobby', lobbyPayload(room)); }

// ---------- spawns ----------

  return { makeCode, cleanName, cleanTeamName, num, clampOpt, modeInfo, makeRoom, zeroTeamKills,
    addPlayer, refreshTeamsAndColors, lobbyPayload, pushLobby };
};
