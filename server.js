/* UrbanStrike server
   - Serves the client from /public
   - Manages rooms (5-char codes), lobby, match lifecycle, FFA + team modes
   - Relays player state, broadcasts snapshots at CFG.NET.snapRate
   - Owns authoritative HP / tiered armor / pickups; validates reported hits
     against fire-rate limits + a short position-history window (lag-comp lite). */

const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');

/* v8.35 ONE BAD PACKET MUST NOT END TWENTY PEOPLE'S MATCH.

   Every socket handler runs on the shared event loop. An unguarded throw in any
   one of them takes down the PROCESS, which takes down every room on it — and
   at a 20-player cap that is up to twenty operators dropped by a single
   malformed message.

   This logs loudly and keeps serving. That is deliberately not the textbook
   advice, which is to exit on an uncaught exception because process state may
   be suspect. The trade is made knowingly: rooms here are independent
   in-memory objects, a fault in one player's handler does not corrupt another
   room's state, and a stack trace in the log with the game still running is far
   more useful than a silent restart nobody can reproduce. If a fault repeats,
   it repeats visibly in the log rather than as an unexplained disconnect. */
process.on('uncaughtException', (err) => {
  console.error('[UrbanStrike] uncaught exception — server staying up:', err && err.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UrbanStrike] unhandled rejection:', reason);
});
const CFG = require('./public/src/config/index.js');
const now = () => Date.now();

// per-map data resolution (urban keeps the legacy top-level keys)
function mapData(room) {
  var m = room.settings && room.settings.map;
  if (m === 'rural' && CFG.MAPS_RURAL) return CFG.MAPS_RURAL;
  if (m === 'metro' && CFG.MAPS_METRO) return CFG.MAPS_METRO;
  if (m === 'killhouse' && CFG.MAPS_KILLHOUSE) return CFG.MAPS_KILLHOUSE;   // v10.10
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
/* ===== v10.7 - GZIP ONLY. NO ASSET CACHING, EVER. =====

   gzip is 66% off a page load on heavily commented JavaScript, it happens once
   per load, it caches nothing and it cannot produce a version mismatch.

   v10.2 also set `maxAge: '1h'`, which was actively dangerous. This game ships
   as a CUMULATIVE UPLOAD and index.html names ~35 scripts by the same URLs
   every build, so after a deploy a browser fetched the new index.html and then
   served the PREVIOUS BUILD'S JAVASCRIPT out of cache for an hour. A client
   from one build talking to a server from another renders nothing and reports
   nothing. Only safe with a build hash in every asset URL, which does not exist
   here. maxAge is pinned to 0 explicitly so the default can never drift. */
/* ===== v10.7 - CACHE BUSTING, SO NOBODY HAS TO HARD-REFRESH =====

   v10.2 put `maxAge: '1h'` on express.static. index.html was excluded, so after
   a deploy a browser fetched the NEW index.html and then served the PREVIOUS
   BUILD'S JAVASCRIPT out of cache for up to an hour. A client from one build
   talking to a server from another renders nothing and reports nothing.

   The header is gone, but that does not help anyone whose browser ALREADY
   cached a file under it - their cache stays valid until its hour is up, and
   telling every player to press Ctrl+Shift+R is not a fix, it is a request.

   So every local asset in index.html now carries `?v=<version>`. The URL a
   stale entry was stored under no longer exists, so the cache cannot match it
   and the browser fetches fresh - once, automatically, for everyone. index.html
   itself is served with max-age 0, so it is always the current one and always
   names the current version.

   CDN and protocol-relative URLs are left alone: three.js and the fonts are
   versioned by their own paths, and /socket.io/socket.io.js is generated by the
   server rather than served from disk.

   Done ONCE at startup, not per request. Bump the version in package.json on
   every release and this handles itself; that is the whole point of it being
   read from there rather than typed here. */
const APP_VERSION = require('./package.json').version;
const INDEX_HTML = (function () {
  const raw = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  return raw.replace(/(src|href)="(?!https?:|[/][/]|[/]socket[.]io[/]|data:|#)([^"?]+)"/g,
    (m, attr, url) => attr + '="' + url + '?v=' + APP_VERSION + '"');
})();
function sendIndex(req, res) {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(INDEX_HTML);
}
app.get('/', sendIndex);
app.get('/index.html', sendIndex);


app.use(compression({ level: 6, threshold: 1024 }));
/* `index: false` so express.static does NOT answer "/" with the raw
   index.html. The first cut of the cache-busting above registered its route
   AFTER this middleware, so static replied first and the version stamps never
   reached the browser - the routes existed and did nothing. */
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: 0, index: false }));
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/version', (req, res) => res.type('text').send(APP_VERSION));
/* v9.8 BANDWIDTH METER. Only mounted when NETSTATS=1, so production pays
   nothing — not even the route. Reports what Render's WebSocket figure is
   actually made of: packets per second, average and peak packet size, entities
   per packet, and total outbound bytes across all clients.
       NETSTATS=1 node server.js     then GET /netstats */
if (process.env.NETSTATS === '1') {
  app.get('/netstats', (req, res) => {
    const secs = Math.max(1, (Date.now() - netTotals.since) / 1000);
    res.json({
      windowSec: Math.round(secs),
      packetsPerSec: +(netTotals.packets / secs).toFixed(1),
      avgPacketBytes: netTotals.packets ? Math.round(netTotals.bytes / Math.max(1, netTotals.clients)) : 0,
      maxPacketBytes: netTotals.maxBytes,
      avgEntitiesPerPacket: netTotals.packets ? +(netTotals.entities / netTotals.packets).toFixed(1) : 0,
      outBytesTotal: netTotals.bytes,
      outBytesPerSec: Math.round(netTotals.bytes / secs),
      projectedGBPerMonthAtThisRate: +((netTotals.bytes / secs) * 2592000 / 1073741824).toFixed(2)
    });
  });
  app.get('/netstats/reset', (req, res) => {
    netTotals.packets = netTotals.bytes = netTotals.maxBytes = 0;
    netTotals.entities = netTotals.clients = 0; netTotals.since = Date.now();
    res.send('reset');
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();

// ---------- domain modules (io/state injected; no module touches globals) ----------
const Rooms = require('./server/lib/rooms.js')({ io, rooms, now });
const { makeCode, cleanName, cleanTeamName, num, clampOpt, modeInfo, makeRoom, zeroTeamKills,
  addPlayer, refreshTeamsAndColors, lobbyPayload, pushLobby } = Rooms;
const Bots = require('./server/lib/bots.js')({
  io, now, mapData,
  spawnPlayer: (room, p) => spawnPlayer(room, p),
  pushLobby: (room) => pushLobby(room),
  endMatch: (room, w, r) => endMatch(room, w, r),
  modeInfo: (room) => modeInfo(room),
  /* v8.38: a bot's shot goes through the SAME damage path a human's does —
     friendly fire, spawn protection, armour, headshot rules, kill feed, streaks
     and the win condition all come along for free. A separate bot damage path
     would drift from the real one the first time either changed. */
  botShoot: (room, bot, victim, part, mul, weapon) => {
    /* v9.2: the weapon is the BOT'S weapon, not a hardcoded ak47. v8.38 pinned
       this to one rifle, so a bot rendered carrying an AWM still did AK damage
       and the kill feed named the wrong gun. Damage, pellet count and range
       falloff all come from the real weapon table via the human damage path. */
    const w = (weapon && CFG.WEAPONS[weapon]) ? weapon : 'ak47';
    const spec = CFG.WEAPONS[w];
    const dx = bot.pos[0] - victim.pos[0], dy = bot.pos[1] - victim.pos[1], dz = bot.pos[2] - victim.pos[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    /* Shotguns are modelled as landing most of the pattern, not all of it —
       all nine pellets at any range would make an aa12 bot a sniper. */
    const pellets = (spec.pellets && spec.pellets > 1)
      ? Math.max(1, Math.round(spec.pellets * (part === 'head' ? 0.4 : 0.62)))
      : 1;
    const base = Combat.weaponServerDamage(w, part, pellets, dist);
    Combat.applyDamage(room, victim, base * mul, bot.id, w, part === 'head', false);
  },
  /* A bot's frag is resolved on the server (it has no client to claim a hit),
     but it lands in the SAME applyDamage the human path uses, so armour,
     friendly fire, streaks, the kill feed and the win condition are identical. */
  botExplode: (room, bot, victim, dmg, weapon, pointBlank) => {
    Combat.applyDamage(room, victim, dmg, bot.id, weapon || 'frag', false, !!pointBlank);
  },
  botPlaceMine: (room, bot, pos) => Mines.place(room, bot, pos)
});
const Loot = require('./server/lib/loot.js')({ io, now, mapData });
const { initPickups, pickupList, tryCollect, respawnPickups,
  scheduleAirdrop, clearAirdrop, dropCrate } = Loot;
const Combat = require('./server/lib/combat.js')({ io, now, modeInfo, pushLobby,
  endMatch: (...a) => endMatch(...a) });
const { weaponServerDamage, applyDamage, positionPlausible, fireRateOk } = Combat;
const Mines = require('./server/lib/mines.js')({ io, now, applyDamage: (...a) => applyDamage(...a), modeInfo }); // code -> room
/* v9.4 STRIKE DRONE. Server-authoritative for the reason recorded in
   server/lib/drones.js: a drone outlives the moment its owner is watching it,
   and a third player can shoot it down, so no single client can be trusted with
   the flight or the kill. */
/* v9.8 — the snapshot wire format, shared with the browser and test.js.
   One definition, three consumers; see the header of that file. */
const SnapCodec = require('./public/src/networking/snapcodec.js');
/* A keyframe every 60 ticks (4 s at 15 Hz). Deltas are exact over an ordered,
   reliable transport, so this is a bound on the damage any future bug can do
   rather than a correctness requirement. */
const KEYFRAME_EVERY = 60;
/* v9.11: how long a seat is held for a dropped player. Long enough for a phone
   changing towers or a laptop resuming from sleep; short enough that a genuine
   quitter does not hold a slot for a whole round. */
const RECONNECT_WINDOW = 45000;
/* Bandwidth instrumentation, off unless NETSTATS=1 is set in the environment.
   Counting bytes means stringifying the packet a second time, which is real
   CPU on the hot path — it must never run in production by accident. */
const NETSTATS = process.env.NETSTATS === '1';
const netTotals = { packets: 0, bytes: 0, maxBytes: 0, entities: 0, since: Date.now(), clients: 0 };
function netstat(room, packet) {
  const n = Buffer.byteLength(JSON.stringify(packet)) + 15;   // + socket.io framing
  const sockets = io.sockets.adapter.rooms.get(room.code);
  const recips = sockets ? sockets.size : 0;
  netTotals.packets++;
  netTotals.bytes += n * recips;
  netTotals.entities += packet.e.length;
  netTotals.clients += recips;
  if (n > netTotals.maxBytes) netTotals.maxBytes = n;
}

const Drones = require('./server/lib/drones.js')({ io, now, applyDamage: (...a) => applyDamage(...a), modeInfo, CFG });

/* ===== v9.5 — WARM THE BOT COLLIDER CACHE BEFORE ANYBODY NEEDS IT =====

   Rahul: "Bot mode after the countdown takes a good 5-7 second for the game to
   start."

   Bots.addBots() calls buildColliders(), which runs the whole world builder
   inside a vm to get the collision set. Measured cold: ~900 ms per map on this
   machine, and it is SYNCHRONOUS — so it happens on the event loop, inside
   startMatch, between the countdown ending and the matchStart emit. Every
   client sits on a frozen countdown for the duration, and on a slower machine
   that single call is seconds rather than one.

   The cache made this a first-match-only cost, which is the worst shape for it:
   it never showed up in testing because the second match was always fast.

   Warming at boot moves the whole cost to server start, where nobody is
   waiting. Deferred with setTimeout so it cannot delay listen(), and wrapped
   because a warm failure must never stop the server coming up — buildColliders
   already falls back to an empty set and logs. */
setTimeout(() => {
  const maps = Object.keys(CFG.MAPS || { urban: 1 });
  let i = 0;
  (function warmNext() {
    if (i >= maps.length) return;
    const m = maps[i++];
    try { Bots.buildColliders(m); } catch (e) { console.error('[UrbanStrike] collider warm failed for ' + m + ':', e.message); }
    setTimeout(warmNext, 20);   // one map per turn, so boot stays responsive
  })();
}, 250);

/* v8.29: turn the raw counters into the handful of lines worth reading. Every
   field is optional and every consumer must treat it as such — a two-player
   match with one kill produces most of these as null, and the end screen has
   to render cleanly in that case rather than showing empty rows. */
function buildInsights(room) {
  const S = room.insights;
  if (!S) return null;
  const nameOf = id => (room.players.get(id) || {}).name || 'Someone';
  const out = {};

  let topPair = null;
  for (const k in S.pairs) {
    if (!topPair || S.pairs[k] > topPair.n) {
      const [a, b] = k.split('>');
      topPair = { n: S.pairs[k], killer: nameOf(a), victim: nameOf(b) };
    }
  }
  if (topPair && topPair.n > 1) out.rivalry = topPair;

  out.nemesis = {};                       // per player: who killed them most
  for (const k in S.pairs) {
    const [a, b] = k.split('>');
    const cur = out.nemesis[b];
    if (!cur || S.pairs[k] > cur.n) out.nemesis[b] = { n: S.pairs[k], name: nameOf(a) };
  }

  const bestW = {};
  for (const k in S.weapons) {
    const [id, w] = k.split('|');
    if (!bestW[id] || S.weapons[k] > bestW[id].n) bestW[id] = { n: S.weapons[k], w };
  }
  let topGun = null;
  for (const id in bestW) if (!topGun || bestW[id].n > topGun.n) topGun = { ...bestW[id], name: nameOf(id) };
  if (topGun) out.favouriteWeapon = topGun;

  if (S.longest && S.longest.m >= 5) out.longest = S.longest;
  if (S.first) out.firstBlood = S.first;
  if (S.last && (!S.first || S.last.name !== S.first.name || S.last.victim !== S.first.victim)) out.finalBlow = S.last;

  let streak = null, carry = null, heads = null;
  for (const p of room.players.values()) {
    if (!streak || p.bestStreak > streak.n) streak = { n: p.bestStreak || 0, name: p.name };
    if (!carry || p.damage > carry.n) carry = { n: Math.round(p.damage || 0), name: p.name };
    const h = S.heads[p.id] || 0;
    if (h > 0 && (!heads || h > heads.n)) heads = { n: h, name: p.name, of: p.kills };
  }
  if (streak && streak.n > 1) out.bestStreak = streak;
  if (carry && carry.n > 0) out.mostDamage = carry;
  if (heads) out.headshots = heads;
  return out;
}

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
  const alive = [...room.players.values()].filter(p => p.alive && p.id !== forP.id);
  const enemies = alive.filter(p => !teams || p.team !== forP.team);
  const friends = alive.filter(p => teams && p.team === forP.team);

  /* ===== v9.4 — WHY EVERY BOT SPAWNED ON THE SAME TILE =====

     This scored a spawn purely on "how far is the nearest ENEMY", and took the
     maximum. That is the right instinct and it has one fatal property: it is
     DETERMINISTIC AND IDENTICAL for everyone on a side. Teammates are not
     enemies, so they contribute nothing to the score, so the furthest-from-the-
     other-team tile is the furthest for every single one of them.

     Rahul: "all bot are spawning in the same location." Twelve bots, one tile,
     stacked inside each other — and the same fault applies to a 5v5 of humans,
     where an entire team lands on one corner at every respawn. It was invisible
     in free-for-all (no teams, so the random branch ran) and in Overrun (bots
     have no side, so every bot is an enemy of every other and they pushed each
     other apart). Adding a mode where twelve players share one team is what
     finally made it obvious.

     THE FIX IS TO SCORE CROWDING, NOT TO FORBID IT. A hard "this tile is taken"
     filter can empty the candidate list — the exact failure the v8.27 comment
     above exists to prevent — so occupancy DEMOTES a spawn instead. A tile with
     a team-mate standing on it scores a fiftieth of its distance value, which
     loses to any free tile anywhere and still wins over nothing at all.

     The jitter matters too: with integer-identical scores the first candidate
     always won, so two players picking simultaneously still collided. */
  let best = candidates[0], bestScore = -1;
  candidates.forEach(c => {
    let d = 1e9;
    enemies.forEach(e => {
      const dx = c.s[0] - e.pos[0], dz = c.s[1] - e.pos[2];
      d = Math.min(d, dx * dx + dz * dz);
    });
    if (enemies.length === 0) d = 400 + Math.random() * 1000;
    // crowding: how close is the nearest team-mate to this tile?
    let near = 1e9;
    friends.forEach(f => {
      const fx = c.s[0] - f.pos[0], fz = c.s[1] - f.pos[2];
      near = Math.min(near, fx * fx + fz * fz);
    });
    let score = d;
    if (near < 64) score *= 0.02;          // within 8 m of a team-mate
    else if (near < 400) score *= 0.4;     // within 20 m
    score *= 0.85 + Math.random() * 0.3;   // break ties so simultaneous picks differ
    if (score > bestScore) { bestScore = score; best = c; }
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
  room.teamKills = zeroTeamKills(room.settings.mode);   // v8.34: sized to the mode
  for (const p of room.players.values()) {
    p.kills = 0; p.deaths = 0; p.assists = 0; p.damage = 0; p.streak = 0; p.bestStreak = 0;
    p.out = false;                    // v8.37: Last Stand elimination flag, cleared per match
    room.insights = null;   // v8.29: insights are per match, never cumulative
    p.att = { sight: null, muzzle: null, mag: null }; p.exW = {}; p.rd = {};
    p.ready = false; p.mines = CFG.GEAR.mine.start; p.lastMolo = {};
    /* v9.4: drones are per-MATCH, not per-life. Refilling them on respawn
       would mean an unlimited supply for anybody willing to die. */
    /* v9.5: NOBODY SPAWNS WITH A DRONE. It is crate loot now, so the starting
       stock is zero in every mode — otherwise the drop-only rule would be
       cosmetic and everyone would still open the match with two. */
    p.drones = 0;
  }
  refreshTeamsAndColors(room);
  initPickups(room);
  /* v8.38: bots must exist BEFORE the matchStart payload is built, or clients
     receive a roster without them and never render the ones they are fighting. */
  Drones.reset(room);          // v9.4: no drone survives a match boundary
  Bots.addBots(room);
  /* v9.5: PUSH THE ROSTER THE INSTANT THE BOTS EXIST.
     Rahul: "bot takes 3-4 sec to join the game and show on the live scorecard."
     That was exact, and it was arithmetic rather than a race — the lobby
     payload is refreshed every 60 snapshots, which at the configured snap rate
     is almost exactly three seconds. Bots were in the match immediately and in
     the SCOREBOARD three seconds later, so the first thing a player did was
     look at an incomplete roster and conclude the mode had not filled.
     One push here costs one message per match. */
  pushLobby(room);
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
  /* Every match starts from a clean baseline: no slot numbers, no remembered
     state, and the first packet is a keyframe. */
  room.snapSlots = new Map(); room.snapPrev = new Map();
  room.snapSlotNext = 1; room.snapTk = null; room.snapKeyframe = true;
  room.snapTimer = setInterval(() => {
    /* v8.30 THE CLOCK HIT 0:00 AND THE MATCH KEPT GOING.

       There were two independent clocks. The HUD counted down from
       `startedAt + minutes`, while the only thing that actually ended the
       match was a single `setTimeout(minutes * 60000)` armed a few
       milliseconds later. Node does not fire a ten-minute timer to the
       millisecond — under a snapshot loop running fifteen times a second it
       fires LATE — so the display reliably reached zero before the server
       agreed, and the players sat in a match the scoreboard said was over.

       Ending it from the tick means both sides now derive the end from the
       same quantity, so they cannot disagree by more than one tick (~67ms).
       The setTimeout stays armed as a backstop; endMatch() guards on
       `room.state !== 'playing'`, so whichever fires first wins and the
       second is a no-op. */
    if (room.settings.minutes > 0 && room.startedAt &&
        now() - room.startedAt >= room.settings.minutes * 60000) {
      endMatch(room, null, 'time');
      return;
    }
    Bots.tick(room, 1 / CFG.NET.snapRate);   // v8.38
    Drones.tick(room, 1 / CFG.NET.snapRate); // v9.4
    respawnPickups(room);
    Mines.tick(room);
    regenTick(room);
    if (++room.snapN % 60 === 0) pushLobby(room); // live K/D/assists/damage refresh (~4 s)

    /* ===== v9.8 DELTA SNAPSHOTS — see public/src/networking/snapcodec.js =====

       The old packet named every field and resent every value fifteen times a
       second: 153-198 bytes per entity per tick, to every client. An Overrun
       match — one human, nineteen bots — was 46 KB/s outbound to a single
       player, about 166 MB an hour, which is where a 5.8 GB month comes from.

       What travels now is what CHANGED. Positions and angles change every tick
       and still do; hp, armour, weapon, helmet, team and the alive flag change
       on events and are sent when they do.

       A KEYFRAME is forced on match start, whenever a client joins, and every
       `KEYFRAME_EVERY` ticks. The periodic one is not strictly required —
       WebSocket is ordered and reliable — but it bounds the cost of any future
       bug to a few seconds of drift instead of a whole match, and at one every
       four seconds it is cheap insurance.

       Every live entity appears every tick, at minimum as [slot, 0]. Absence
       therefore means REMOVED, which is what lets a client drop a player who
       left without a separate message. */
    room.snapSlots = room.snapSlots || new Map();     // player id -> wire slot
    room.snapPrev = room.snapPrev || new Map();       // slot -> last state SENT
    room.snapSlotNext = room.snapSlotNext || 1;

    const keyframe = room.snapKeyframe || (room.snapN % KEYFRAME_EVERY === 0);
    room.snapKeyframe = false;

    const ents = [];
    const liveSlots = new Set();
    for (const p of room.players.values()) {
      let slot = room.snapSlots.get(p.id);
      if (slot === undefined) { slot = room.snapSlotNext++; room.snapSlots.set(p.id, slot); }
      liveSlots.add(slot);
      const st = SnapCodec.stateOf(p, slot);
      const prev = keyframe ? null : room.snapPrev.get(slot);
      ents.push(SnapCodec.encodeEntity(st, prev, keyframe));
      room.snapPrev.set(slot, st);
    }
    // a player who left frees their slot, so the map cannot grow without bound
    for (const slot of room.snapPrev.keys()) if (!liveSlots.has(slot)) room.snapPrev.delete(slot);
    for (const [id, slot] of room.snapSlots) if (!liveSlots.has(slot)) room.snapSlots.delete(id);

    /* Team kills changed on a kill, not on a tick. Sent when they move. */
    const tkNow = modeInfo(room).teams ? JSON.stringify(room.teamKills) : null;
    const tkChanged = tkNow !== (room.snapTk || null);
    room.snapTk = tkNow;

    const packet = { e: ents };
    if (keyframe) packet.k = 1;
    /* v9.4: drones ride the normal snapshot rather than a channel of their own,
       so every client renders them with the code that already interpolates
       remote entities. Omitted entirely when none are airborne. */
    const dr = Drones.snapshot(room);
    if (dr) packet.dr = dr;
    if (tkChanged || keyframe) packet.tk = modeInfo(room).teams ? room.teamKills : null;
    /* `t` is GONE. It carried now() — thirteen digits plus the key, every tick
       — and the client never read it: the interpolation buffer timestamps
       arrivals with its own performance.now(), and the clock offset comes from
       matchStart. Eighteen bytes a tick for a field nothing consumed. */
    io.to(room.code).emit('snap', packet);
    if (NETSTATS) netstat(room, packet);
    return;
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
  Bots.removeBots(room);      // v8.38: bots are per-match; never let them into a lobby
  const insights = buildInsights(room);
  let winnerTeam = null;
  if (teams) {
    /* v8.34: highest-scoring side wins, across however many are in play. A
       clean tie for first has no winner, exactly as a-vs-b did. */
    const ids = CFG.activeTeams(room.settings.mode);
    let top = -1, tied = false;
    ids.forEach(t => {
      const v = room.teamKills[t] | 0;
      if (v > top) { top = v; winnerTeam = t; tied = false; }
      else if (v === top) tied = true;
    });
    if (tied || top < 0) winnerTeam = null;
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
    winnerId, winnerTeam, reason, insights,
    teamKills: teams ? room.teamKills : null,
    players: lobbyPayload(room).players
  });
}

// ---------- combat validation ----------
io.on('connection', (socket) => {
  socket.on('createRoom', (data, cb) => {
    const room = makeRoom(socket, data && data.name, data && data.settings);
    /* v9.11: the reconnect token, read from the record rather than a local —
       `p` is not in scope here and makeRoom owns the player it creates. */
    if (cb) cb({ ok: true, code: room.code, id: socket.id,
      token: (room.players.get(socket.id) || {}).token });
    pushLobby(room);
  });

  socket.on('joinRoom', (data, cb) => {
    const code = String((data && data.code) || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: 'Room not found. Check the code.' });
    const cap = modeInfo(room).maxPlayers;
    /* v9.2: count HUMANS, not room.players.size. Bots live in the same map as
       real players, so once a Strike Team or Overrun match starts, size is
       humans + bots and a room with a genuinely free slot reports itself full.
       The cap has always meant "how many people", and now it says so. */
    /* v9.8: a joiner has no delta baseline, so the next snapshot must be a
       keyframe. Without this they would see an empty world until the periodic
       one arrived up to four seconds later. */
    room.snapKeyframe = true;
    let humanCount = 0;
    for (const q of room.players.values()) if (!q.bot) humanCount++;
    if (humanCount >= cap) return cb && cb({ ok: false, error: 'Room is full (' + cap + ' players max for this mode).' });
    /* v9.11: a backfilled room is full of bots by design. Free a seat so the
       human can take it — otherwise the feature that makes modes playable is
       the feature that makes them unjoinable. */
    if (room.state === 'playing') Bots.yieldSeat(room);
    addPlayer(room, socket, data && data.name);
    cb && cb({ ok: true, code: room.code, id: socket.id,
      token: (room.players.get(socket.id) || {}).token,
      inProgress: room.state === 'playing' });
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
    /* v8.33: only the host may rename a team, and only in the lobby — both
       already guaranteed by the guard at the top of this handler. */
    /* v9.11: backfill is a host setting like any other, and it is only
       meaningful in the human-vs-human modes — Overrun and Strike Team field
       their own bots and would double up. */
    if (s && typeof s.backfill === 'boolean') room.settings.backfill = !!s.backfill;
    if (s && typeof s.botCount === 'number')
      room.settings.botCount = Math.max(0, Math.min(19, s.botCount | 0));
    if (s && s.botSkill && Bots.SKILL_IDS.indexOf(s.botSkill) >= 0)
      room.settings.botSkill = s.botSkill;
    if (s && s.teamNames) {
      /* v8.34: rename any side the mode fields. Sides not sent keep whatever
         they had, so editing team A never blanks team B. */
      const tn = Object.assign({}, room.settings.teamNames);
      CFG.activeTeams(room.settings.mode).forEach(t => {
        if (s.teamNames[t] !== undefined) tn[t] = cleanTeamName(s.teamNames[t], CFG.TEAMS[t].name);
      });
      room.settings.teamNames = tn;
    }
    if (s && CFG.MODES[s.mode]) {
      let humansNow = 0;
      for (const q of room.players.values()) if (!q.bot) humansNow++;
      if (humansNow > CFG.MODES[s.mode].maxPlayers) {
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
  /* DRONES ARE NOT AVAILABLE IN BOT MODES.
     Rahul: "Drone mode should be in Free for all, squad, team battle only.
     Drone should not be there in Bot fight." The reasoning holds up — a drone
     that auto-finds a target is aim-free pressure, and against bots there is no
     opponent for it to be unfair to, so all it does is trivialise a mode whose
     entire point is practising your aim. The check is CFG.botsAllowed, the same
     predicate that decides whether a room has bots at all, so Overrun and every
     Strike Team size are covered by one rule. */
  socket.on('launchDrone', (d, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    const room = getRoom(socket);
    if (!room || room.state !== 'playing') return ack({ ok: false, err: 'Not in a match' });
    if (CFG.botsAllowed(room.settings.mode)) return ack({ ok: false, err: 'Drones are disabled in bot modes' });
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return ack({ ok: false, err: 'Not alive' });
    ack(Drones.launch(room, p));
  });
  socket.on('droneHit', (d) => {
    const room = getRoom(socket);
    if (!room || room.state !== 'playing' || !d) return;
    Drones.damage(room, d.id | 0, Math.max(0, Math.min(200, +d.dmg || 0)), socket.id);
  });
  /* ===== v9.10 — TEAM MAP MARKERS =====
     Rahul: "in the team match a team member can mark a place on the map and
     other fellow team mates can follow the marked location."

     Server-relayed rather than peer-to-peer, because the server is the only
     thing that knows who is on whose side — a client deciding for itself who
     to send a marker to is a client that can be modified to send it to
     everyone. It goes to the TEAM ROOM only, so an opponent never sees it.

     Free-for-all has no team, so a marker there would either go to nobody or
     to everybody; both are wrong, so the mode simply does not offer it.

     Deliberately NOT part of the snapshot. A marker is placed a handful of
     times a match — putting it in a 15 Hz stream to save an event would undo
     the v9.8 bandwidth work for a feature that fires once a minute. */
  socket.on('mark', (d) => {
    const room = getRoom(socket);
    if (!room || room.state !== 'playing' || !d) return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive || !p.team) return;            // FFA and the dead do not mark
    if (!modeInfo(room).teams) return;
    const x = +d.x, z = +d.z;
    if (!isFinite(x) || !isFinite(z)) return;
    const B = CFG.MAPS[room.settings.map || 'urban'] ? 110 : 110;
    if (Math.abs(x) > B || Math.abs(z) > B) return;
    /* Throttled per player: a marker is a deliberate act, and without this a
       held mouse button becomes a broadcast loop. */
    if (now() - (p.lastMark || 0) < 700) return;
    p.lastMark = now();
    const payload = { id: socket.id, name: p.name, x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10, at: now(), team: p.team };
    for (const q of room.players.values()) {
      if (q.bot || !q.connected || q.team !== p.team) continue;
      io.to(q.id).emit('mark', payload);
    }
  });
  /* ===== v9.11 — PING WHEEL =====
     Same relay shape as the v9.10 map marker and for the same reason: the
     server is the only thing that knows who is on whose side, so it decides the
     recipients rather than trusting a client to.

     A ping is a WORLD POINT plus a type. The client supplies the point by
     casting its aim ray, so "enemy spotted" lands on the wall the enemy is
     standing next to rather than in the middle of the map — a bearing you can
     actually push toward.

     Team modes only. In free-for-all there is nobody to tell. */
  socket.on('ping', (d) => {
    const room = getRoom(socket);
    if (!room || room.state !== 'playing' || !d) return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive || !p.team || !modeInfo(room).teams) return;
    const kind = String(d.k || '').slice(0, 12);
    if (['enemy', 'here', 'going', 'need', 'careful', 'loot'].indexOf(kind) < 0) return;
    const x = +d.x, y = +d.y, z = +d.z;
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    /* Throttled harder than markers: a ping is one keypress and a held key
       would otherwise be a broadcast loop with audio attached. */
    if (now() - (p.lastPing || 0) < 900) return;
    p.lastPing = now();
    const payload = { id: socket.id, name: p.name, k: kind,
      x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 10) / 10,
      at: now() };
    for (const q of room.players.values()) {
      if (q.bot || !q.connected || q.team !== p.team) continue;
      io.to(q.id).emit('ping', payload);
    }
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
  /* v8.37: host re-rolls the sides. Clears every lock first, otherwise a
     previously-moved player would pin in place and the shuffle would look
     broken rather than partial. */
  socket.on('shuffleTeams', () => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId || room.state !== 'lobby') return;
    if (room.cdTimer) return;
    if (!modeInfo(room).teams) return;
    const list = [...room.players.values()];
    for (let i = list.length - 1; i > 0; i--) {          // Fisher-Yates
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const ids = CFG.activeTeams(room.settings.mode);
    list.forEach((p, i) => {
      p.team = ids[i % ids.length];
      p.teamLocked = false;
      p.color = CFG.TEAMS[p.team].color;
    });
    pushLobby(room);
  });

  socket.on('setPlayerTeam', (d) => {
    const room = getRoom(socket);
    if (!room || socket.id !== room.hostId || room.state !== 'lobby') return;
    if (room.cdTimer) return;                       // no shuffling mid-countdown
    if (!modeInfo(room).teams) return;              // meaningless in FFA
    /* v8.34: any side the CURRENT mode fields, not just a/b. Validating against
       activeTeams rather than CFG.TEAMS matters — 'g' is a real team but not a
       legal destination in 5v5, and putting someone there would leave them
       unable to score. */
    if (!d || CFG.activeTeams(room.settings.mode).indexOf(d.team) < 0) return;
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
    { const r0 = getRoom(socket); if (r0) Bots.removeBots(r0); }   // v8.38
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
    /* ===== v10.7 - NO AUTO-PICKUP =====
       This called tryCollect on EVERY state update, so walking within
       pickupRadius took whatever was there - including a weapon you never asked
       for, mid-fight. Rahul: "loot k pass jane se gun auto pick ho jata hai,
       this is not required." Driven by the interact key now; see the 'pickup'
       handler. Every rule inside tryCollect is unchanged - only what asks it to
       run. */
  });

  /* v10.7: explicit pickup, bound to the same interact key that rides lifts.
     Carries no item id and no position - the server still decides everything,
     exactly as it did when this ran automatically. Rate-limited because a held
     key would otherwise repeat at whatever rate the browser chooses. */
  socket.on('pickup', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;
    const t = now();
    if (p.lastPickAt && t - p.lastPickAt < 120) return;
    p.lastPickAt = t;
    tryCollect(room, p);
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
    if (p.out) return;                       // v8.37: Last Stand — one life, no coming back
    if (now() < p.respawnAt - 250) return;
    spawnPlayer(room, p);
  });

  socket.on('pingCheck', (t, cb) => { if (cb) cb(t); });

  /* Rejoin by TOKEN, not by name. A name is guessable and a name collision
     would let one player steal another's seat and score; the token is issued
     once, on join, and never broadcast in the lobby payload. */
  socket.on('rejoin', (d, cb) => {
    const ack = typeof cb === 'function' ? cb : () => {};
    if (!d || !d.code || !d.token) return ack({ ok: false, error: 'No session to restore.' });
    const room = rooms.get(String(d.code).toUpperCase());
    if (!room) return ack({ ok: false, error: 'That match has ended.' });
    let oldId = null;
    for (const [id, q] of room.players) if (q.token === d.token && !q.connected) { oldId = id; break; }
    if (!oldId) return ack({ ok: false, error: 'That seat is no longer held.' });

    const p = room.players.get(oldId);
    if (p.purgeTimer) { clearTimeout(p.purgeTimer); p.purgeTimer = null; }
    /* The player is re-keyed to the NEW socket id, because every emit path in
       this server addresses a player by id. Everything score-shaped rides on
       the record itself and moves with it. */
    room.players.delete(oldId);
    p.id = socket.id;
    p.connected = true;
    p.respawnAt = now() + CFG.MATCH.respawnDelay * 1000;
    room.players.set(socket.id, p);
    if (room.hostId === oldId) room.hostId = socket.id;
    /* The old wire slot dies with the old id, and the next snapshot must be a
       keyframe or the returning client decodes deltas against nothing. */
    if (room.snapSlots) room.snapSlots.delete(oldId);
    room.snapKeyframe = true;
    socket.join(room.code);
    io.to(room.code).emit('playerLeft', { id: oldId, name: p.name });
    io.to(room.code).emit('toast', { msg: p.name + ' reconnected' });
    ack({ ok: true, code: room.code, id: socket.id, token: p.token,
          settings: room.settings, state: room.state,
          startedAt: room.startedAt, serverNow: now(),
          pickups: room.pickups.filter(k => k.active).map(k => ({ id: k.id, t: k.t, p: k.pos, active: true })) });
    pushLobby(room);
  });

  /* v8.37: leaving is the same as being eliminated in Last Stand, so a
     disconnect can be the event that ends the match. Without this a room with
     one survivor and one quitter would sit there forever — there is no clock to
     rescue it. */
  function lastStandOnLeave(room) {
    if (!room || room.state !== 'playing') return;
    if (!CFG.isElimination(room.settings.mode)) return;
    const live = [];
    for (const p of room.players.values()) if (!p.out && p.connected !== false) live.push(p);
    if (modeInfo(room).teams) {
      const sides = new Set(live.map(p => p.team));
      if (sides.size <= 1) endMatch(room, sides.size === 1 && live[0] ? live[0].id : null,
        sides.size === 1 ? 'laststand' : 'draw');
    } else if (live.length <= 1) {
      endMatch(room, live.length === 1 ? live[0].id : null,
        live.length === 1 ? 'laststand' : 'draw');
    }
  }

  socket.on('disconnect', () => {
    const room = getRoom(socket); if (!room) return;
    const p = room.players.get(socket.id);

    /* ===== v9.11 RECONNECT =====
       A dropped connection used to delete the player outright: score, kills,
       team and streak gone, and rejoining meant arriving as a stranger in a
       match you were winning. A Wi-Fi blip is not a decision to quit.

       So during a MATCH the record is kept for RECONNECT_WINDOW and the seat is
       held. The player is marked disconnected and set not-alive — leaving them
       standing would hand the enemy a free kill on someone who cannot fight
       back, which is worse than removing them.

       Only during a match. In a lobby there is nothing to preserve and holding
       a seat would block a real player from taking it. */
    if (p && room.state === 'playing') {
      p.connected = false;
      p.alive = false;
      p.disconnectedAt = now();
      p.respawnAt = Infinity;
      io.to(room.code).emit('toast', { msg: p.name + ' lost connection' });
      pushLobby(room);
      /* The purge timer is what stops a held seat becoming a permanent ghost.
         Cleared on a successful rejoin. */
      p.purgeTimer = setTimeout(() => {
        const r2 = rooms.get(room.code);
        if (!r2) return;
        const q = r2.players.get(socket.id);
        if (!q || q.connected) return;
        r2.players.delete(socket.id);
        io.to(r2.code).emit('playerLeft', { id: socket.id, name: q.name });
        if (r2.hostId === socket.id && r2.players.size) {
          r2.hostId = r2.players.keys().next().value;
        }
        pushLobby(r2);
        lastStandOnLeave(r2);
      }, RECONNECT_WINDOW);
      return;
    }
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
    lastStandOnLeave(room);
    /* v8.38: bots cannot finish a match on their own. If the last human leaves
       a bot room, end it rather than leaving robots duelling forever. */
    if (room && room.state === 'playing' && !Bots.anyHumans(room)) endMatch(room, null, 'abandoned');
  });

  function getRoom(sock) { return rooms.get(sock.data.roomCode); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('UrbanStrike server running on http://localhost:' + PORT);
});
