/* server/lib/botai.js — v2.12. BOT OPS: AI operators that play like people.

   Rahul (Nov 2026): "Make a Bot mode for Urban Small and Urban ... tougher to
   kill, their own brain and playing style, engaging and tough but not
   unplayable, a Medium and a Highest difficulty ... go inside rooms, roofs and
   towers and shoot and use all the guns ... looks like playing with a human
   ... solo and also with a team."

   The v8-v14 bots were removed in v1.0d at his request; this is a new brain,
   written from nothing, on two things the old one never had:

     botnav.js   a walk graph of the whole map (streets, rooms, stairs, roofs)
                 and fast line of sight. A bot is moved ALONG graph paths, so
                 it cannot wedge on a crate or walk through a wall.
     this file   senses, memory, a personality, and a gun handled the way a
                 person handles one.

   WHAT MAKES IT READ AS A PLAYER
     * It only knows what it has SEEN (a view cone, a range, a clear line, and
       a noticing time that is longer when you crouch, lie down or stand far
       off), HEARD (unsuppressed shots, sprinting feet) or been TOLD by a
       team-mate after a delay. It hunts the place it last saw you, not you.
     * Six playing styles — rusher, assault, flanker, anchor, sniper, marksman
       — each with its own ranges, patience, movement and guns.
     * It reacts late, turns at a human rate, sprays less accurately on the
       move and at the start of a burst, fires in bursts, runs dry, reloads,
       swaps to a side-arm, ducks into cover when hurt, and peeks back out.
     * At most a few of them shoot one player at once; the rest reposition.

   THE DIFFICULTY RULE: a bullet is a bullet. Medium and Hard use the same guns
   at the same damage (weaponServerDamage, applyDamage — your vest, helmet and
   shield work on them as on anyone). Hard is faster to notice, steadier,
   better at cover and flanking, talks to its team sooner, and wears armour. */
'use strict';

module.exports = function initBotAI(ctx) {
  const CFG = ctx.CFG, io = ctx.io, now = ctx.now, Nav = ctx.Nav, Rooms = ctx.Rooms;
  const P = CFG.PLAYER, MV = CFG.MOVE;
  const HALF = [P.standH / 2, P.crouchH / 2, P.proneH / 2];
  const EYE = [P.eyeStand || 0.768, P.eyeCrouch || 0.448, P.eyeProne || 0.192];
  const BODYH = [P.standH, P.crouchH, P.proneHitH || 0.46];
  const rnd = Math.random;
  const rand = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[(rnd() * arr.length) | 0];
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * v); };
  const wrap = (a) => { while (a > Math.PI) a -= 6.283185307; while (a < -Math.PI) a += 6.283185307; return a; };

  /* ---------------- difficulty: behaviour scales, damage never does ---------------- */
  /* ===== v2.12.1 - RETUNED AFTER RAHUL PLAYED IT =====
     "Bots are very easy to kill and they are not able to kill me." Measured,
     not guessed this time (tools/verify-bots.js section D plays a moving,
     shooting player against them): at 25 m against a walking target a v2.12
     Medium operator landed 3-10% of its rounds and needed about a second to
     notice and react, while it died to two or three of the player's. Whoever
     fires first wins in this game (50 a round, 100 health), so they never did.
       * they notice and react like people who are awake (react, detect);
       * the aim model is simpler and tighter: `err` is the angular error of a
         settled shot at a standing target, and movement/first-shot/burst
         multipliers are now modest instead of stacking to 5x;
       * every operator wears a vest (Hard: level 2 or 3 and a helmet);
       * one more of them may fire at the same player at once;
       * the squad gets a rough fix on a player it has lost for a while
         (`intel`), so the fight comes to you instead of waiting on a roof.
     Still true: difficulty changes behaviour and kit, never what a bullet does. */
  const PROFILES = {
    medium: { label: 'MEDIUM', react: [300, 480], turn: 6.0, err: 0.022, tau: 500, fov: 1.05, view: 85, detect: 1.5, flinch: 1.6,
              memory: 14000, commsMs: 2200, hearErr: 0.12, hurtErr: 4, headPct: 0.08, burst: [4, 7], pause: [260, 560],
              scopeMul: 0.6, snipeSettle: 1050, moveMul: 0.97, cover: 0.55, peek: 0.3, retreatHp: 30, flankK: 0.6,
              crouchK: 0.7, strafe: [700, 1400], maxShooters: 3, armorP: 1.0, vest: 1, vestUp: 0, helm: 1, helmP: 0.4, pool: 'base',
              intelMs: 22000, intelErr: 20, reach: 1.4,
              count: (h) => Math.min(10, 3 + 2 * h) },   /* (v2.17: the head count is the MAP's now - CFG.botCountFor; kept for a map with no entry) */
    hard:   { label: 'HARD', react: [230, 380], turn: 10, err: 0.018, tau: 320, fov: 1.25, view: 105, detect: 2.2, flinch: 1.25,
              memory: 20000, commsMs: 700, hearErr: 0.06, hurtErr: 2, headPct: 0.2, burst: [4, 9], pause: [140, 360],
              scopeMul: 0.45, snipeSettle: 650, moveMul: 1.0, cover: 0.85, peek: 0.55, retreatHp: 40, flankK: 1.0,
              crouchK: 1.0, strafe: [450, 1000], maxShooters: 3, armorP: 1.0, vest: 2, vestUp: 0.35, helm: 2, helmP: 1.0, pool: 'all',
              intelMs: 15000, intelErr: 10, reach: 1.7,
              count: (h) => Math.min(12, 4 + 2 * h) }
  };
  /* ---------------- playing styles ---------------- */
  const PERSONAS = {
    rusher:   { label: 'Rusher',   ideal: [4, 12],   aggression: 0.95, flank: 0.3,  hold: 0,   crouch: 0.05, sprint: 1.0,
                base: [['uzi', 'shotgun'], ['pistol']], all: [['vector', 'p90', 'mp5', 'aa12', 'ump9', 'uzi', 'shotgun'], ['pistol']] },
    assault:  { label: 'Assault',  ideal: [14, 34],  aggression: 0.6,  flank: 0.3,  hold: 0.1, crouch: 0.3,  sprint: 0.6,
                base: [['ak47', 'm4a1'], ['pistol']], all: [['scarh', 'aug', 'akm', 'famas', 'ak47', 'm4a1'], ['pistol']] },
    flanker:  { label: 'Flanker',  ideal: [8, 22],   aggression: 0.75, flank: 0.95, hold: 0,   crouch: 0.15, sprint: 0.9,
                base: [['m4a1', 'uzi'], ['pistol']], all: [['ump9', 'famas', 'akm', 'm4a1', 'mp5'], ['pistol']] },
    anchor:   { label: 'Anchor',   ideal: [10, 30],  aggression: 0.25, flank: 0.05, hold: 0.9, crouch: 0.7,  sprint: 0.3,
                base: [['m4a1', 'ak47'], ['shotgun']], all: [['m249', 'scarh', 'garand', 'ak47'], ['shotgun', 'aa12']] },
    sniper:   { label: 'Sniper',   ideal: [45, 110], aggression: 0.15, flank: 0,    hold: 1.0, crouch: 0.8,  sprint: 0.4,
                base: [['sniper', 'kar98'], ['uzi']], all: [['awm', 'kar98', 'sniper'], ['mp5', 'uzi']] },
    marksman: { label: 'Marksman', ideal: [28, 65],  aggression: 0.4,  flank: 0.2,  hold: 0.5, crouch: 0.5,  sprint: 0.5,
                base: [['ak47', 'kar98'], ['pistol']], all: [['mk14', 'garand', 'k98w', 'akm'], ['uzi', 'pistol']] }
  };
  const SQUAD = ['assault', 'rusher', 'flanker', 'sniper', 'anchor', 'assault', 'marksman', 'rusher', 'flanker', 'anchor', 'sniper', 'assault'];
  const NAMES = ['Viper', 'Ghost', 'Raven', 'Kabir', 'Zara', 'Bishop', 'Nomad', 'Havoc', 'Onyx', 'Sable', 'Rook', 'Jinx',
                 'Echo', 'Blaze', 'Drift', 'Kite', 'Mako', 'Nova', 'Orion', 'Pike', 'Tariq', 'Wolf', 'Mira', 'Dax'];

  const modeOf = (room) => CFG.MODES[room.settings.mode] || {};
  const isBotMode = (mode) => !!(CFG.MODES[mode] && CFG.MODES[mode].bots);
  const feetOf = (p) => p.pos[1] - HALF[p.crouch | 0];
  const eyeOf = (p) => p.pos[1] + EYE[p.crouch | 0];
  const humans = (room) => { const out = []; for (const q of room.players.values()) if (!q.bot && q.connected !== false) out.push(q); return out; };
  const wdef = (w) => CFG.WEAPONS[w];
  const isBolt = (w) => { const d = wdef(w); return !!(d && (d.type === 'bolt' || d.scope === true)); };

  /* ---------------- the roster ---------------- */
  function loadout(per, prof) {
    const L = (prof.pool === 'all' ? per.all : per.base).map(slot => slot.filter(w => wdef(w)));
    return [pick(L[0].length ? L[0] : ['ak47']), pick(L[1].length ? L[1] : ['pistol'])];
  }
  function makeBot(room, S, idx) {
    const used = new Set([...room.players.values()].map(q => q.name));
    let name = NAMES[(idx * 7 + S.nameSeed) % NAMES.length];
    for (let k = 1; used.has(name) && k < 200; k++) name = NAMES[(idx * 7 + S.nameSeed + k) % NAMES.length] + (k > NAMES.length ? '-' + k : '');
    const per = PERSONAS[SQUAD[idx % SQUAD.length]];
    const p = {
      id: 'bot_' + room.code + '_' + (S.seq++), name: name, bot: true, botStyle: per.label,
      joinOrder: 100000 + idx, color: '#d2553f', team: S.team, teamLocked: true, token: '', connected: true,
      kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, bestStreak: 0, ping: 0, ready: true,
      mineKills: 0, mineIssued: 0, mines: 0, hp: P.hp, armorLvl: 0, armorDur: 0, helmLvl: 0, helmDur: 0, helmStops: 0,
      alive: false, protUntil: 0, att: { sight: null, muzzle: null, mag: null }, exW: {}, rd: {},
      pos: [0, HALF[0], 0], ry: 0, rx: 0, crouch: 0, mv: 0, wp: 0, ln: 0, lastShotAt: {}, history: [], respawnAt: 0,
      ai: { per: per, idx: idx, phase: rnd() * 6.28, known: new Map(), x: 0, z: 0, feet: 0, yaw: 0, pitch: 0 }
    };
    try { p.color = Rooms.colorFor(room, p, idx); } catch (e) { /* the default stands */ }
    room.players.set(p.id, p);
    S.list.push(p);
    return p;
  }
  function resetLife(room, S, bot) {
    const A = bot.ai, nav = S.nav, prof = S.prof;
    A.wpn = loadout(A.per, prof); A.cur = 0; A.mag = {}; A.wpn.forEach(w => { A.mag[w] = wdef(w).mag || 1; });
    A.reloadUntil = 0; A.swapUntil = 0; A.nextShotAt = 0; A.burstLeft = 0; A.pauseUntil = 0; A.shotsInBurst = 0;
    A.known.clear(); A.target = null; A.onTargetSince = 0; A.reactAt = 0; A.mode = 'patrol'; A.path = null; A.pi = 0;
    A.pending = null; A.holdUntil = 0; A.coverUntil = 0; A.strafeAt = 0; A.strafeDir = rnd() < 0.5 ? 1 : -1; A.wantCrouch = 0;
    A.thinkAt = 0; A.commsAt = 0; A.lastHp = P.hp; A.flinchUntil = 0; A.moving = false; A.searchUntil = 0; A.idleUntil = 0;
    A.holdYaw = null; A.flankDone = 0; A.goalTag = null; A.coverAt = 0;
    /* stand it on the graph */
    let n = Nav.nearest(nav, bot.pos[0], bot.pos[2], bot.pos[1] - HALF[0], 5, 1.5);
    if (n < 0) n = Nav.randomNear(nav, bot.pos[0], bot.pos[2], 0, 25, 1.5, rnd);
    if (n >= 0) { const q = Nav.posOf(nav, n); A.x = q[0]; A.feet = q[1]; A.z = q[2]; }
    else { A.x = bot.pos[0]; A.z = bot.pos[2]; A.feet = bot.pos[1] - HALF[0]; }
    A.ref = A.feet; A.airT = 0;
    A.yaw = bot.ry || 0; A.pitch = 0;
    if (rnd() < prof.armorP) {
      const vl = Math.min(3, prof.vest + (rnd() < (prof.vestUp || 0) ? 1 : 0));
      bot.armorLvl = vl; bot.armorDur = CFG.ARMOR[vl].dur;
    }
    if (prof.helm && rnd() < (prof.helmP === undefined ? 1 : prof.helmP)) {
      const hl = Math.min(3, prof.helm + (prof.helmP >= 1 && rnd() < 0.3 ? 1 : 0));
      bot.helmLvl = hl; bot.helmDur = CFG.HELMET[hl].dur; bot.helmStops = CFG.HELMET[hl].sniperStops | 0;
    }
    bot.crouch = 0; bot.wp = Math.max(0, CFG.WEAPON_ORDER.indexOf(A.wpn[0]));
    writePos(bot, A);
  }
  function writePos(bot, A) {
    bot.pos = [A.x, A.feet + HALF[bot.crouch | 0], A.z];
    bot.ry = A.yaw; bot.rx = A.pitch;
    const t = now();
    bot.history.push({ t: t, pos: bot.pos });
    const cut = t - CFG.NET.historyMs;
    while (bot.history.length && bot.history[0].t < cut) bot.history.shift();
  }
  function ensureCount(room, S) {
    /* v2.17: per map (Urban 20-25, Urban Small 8-12, Killhouse 6-8), the same at both difficulties */
    const want = CFG.botCountFor ? CFG.botCountFor(room.settings.map || 'urban', Math.max(1, humans(room).length)) : S.prof.count(Math.max(1, humans(room).length));
    let added = 0;
    while (S.list.length < want) {
      const bot = makeBot(room, S, S.list.length);
      ctx.spawnPlayer(room, bot);
      resetLife(room, S, bot);
      added++;
    }
    /* a keyframe and a roster refresh only when somebody actually arrived */
    if (added) { room.snapKeyframe = true; try { Rooms.pushLobby(room); } catch (e) { /* cosmetic */ } }
  }
  function removeBots(room) {
    for (const [id, q] of [...room.players]) if (q.bot) room.players.delete(id);
    room._bots = null;
  }

  /* ---------------- match lifecycle ---------------- */
  function onMatchStart(room) {
    if (!isBotMode(room.settings.mode)) { room._bots = null; return; }
    removeBots(room);
    const diff = modeOf(room).bots === 'hard' ? 'hard' : 'medium';
    const S = room._bots = { ready: false, list: [], seq: 1, nameSeed: (rnd() * 97) | 0, prof: PROFILES[diff], diff: diff,
      team: (CFG.activeTeams(room.settings.mode) || ['a', 'b'])[1] || 'b', tickN: 0, intel: null, shooters: new Map(), focus: {}, hot: null, nav: null };
    Nav.ensure(room.settings.map || 'urban', (nav) => {
      if (room._bots !== S || room.state !== 'playing') return;
      S.nav = nav; S.hot = hotspots(room, nav); S.ready = true;
      ensureCount(room, S);
      io.to(room.code).emit('toast', { msg: 'BOT OPS · ' + S.list.length + ' HOSTILES · ' + S.prof.label });
      try { Rooms.pushLobby(room); } catch (e) { /* roster refresh is cosmetic */ }
    });
  }
  function onMatchEnd(room) { if (room._bots) room._bots.ready = false; }

  /* where people go: loot, drop points, the humans' spawn band */
  function hotspots(room, nav) {
    const D = CFG['MAPS_' + String(room.settings.map || 'urban').toUpperCase()] || {};
    const pts = [];
    (D.LOOT_POINTS || CFG.LOOT_POINTS || []).forEach((p, i) => { if (i % 3 === 0 && p[1] < 1.2) pts.push([p[0], p[2]]); });
    (D.AIRDROP_POINTS || (CFG.AIRDROP && CFG.AIRDROP.points) || []).forEach(p => pts.push([p[0], p[1]]));
    (D.SPAWNS || CFG.SPAWNS || []).forEach(s => { if (s[3] !== 'b') pts.push([s[0], s[1]]); });
    const out = [];
    pts.forEach(p => { const n = Nav.nearest(nav, p[0], p[1], 0, 3, 1.5); if (n >= 0) out.push(n); });
    return out;
  }

  /* ---------------- movement on the graph ---------------- */
  const curNode = (A, nav) => Nav.nearest(nav, A.x, A.z, A.feet, 1.6, 0.9);
  /* ===== v2.17 - TWO ROUTES A TICK, FOR THE WHOLE SQUAD =====
     Urban now fields 20-25 operators (it was 10-12). A route search on its
     900,000-node graph costs 1-10 ms, and nothing stopped twenty of them
     landing in one server tick: measured, a 25 ms tick, on a server whose
     whole tick is 66 ms and whose CPU (Render's free plan) is a fraction of
     the machine that measured it. So the squad shares a budget. An operator
     that asks when it is spent keeps walking and asks again next tick — the
     `pending` slot a bot on a staircase already used. Demand measured at
     5-14 searches a second; two a tick is thirty. */
  const PATHS_PER_TICK = 2;
  let pathBudget = PATHS_PER_TICK;
  function goTo(A, nav, node, mode, tag) {
    if (node < 0) return false;
    if (Nav.isStair(nav, A.x, A.z, A.feet)) { A.pending = [node, mode, tag]; return true; }   // finish the flight first
    if (pathBudget <= 0) { A.pending = [node, mode, tag]; return true; }                       // the squad's two are spent: next tick
    pathBudget--;
    const from = curNode(A, nav); if (from < 0) return false;
    const ids = Nav.path(nav, from, node, 22000); if (!ids || ids.length < 2) return false;
    A.path = Nav.smooth(nav, ids); A.pi = 0; A.ref = A.feet; A.moveMode = mode; A.goalNode = node; A.goalTag = tag || null; A.pathAt = now(); A.pending = null;
    return A.path.length > 0;
  }
  function goNear(A, nav, x, z, y, mode, tag, reach) {
    const n = Nav.nearest(nav, x, z, y === undefined ? A.feet : y, reach || 6, y === undefined ? undefined : 2.5);
    return goTo(A, nav, n, mode, tag);
  }
  /* ===== v2.12.1 - A BOT'S HEIGHT COMES FROM ITS PATH, NOT FROM WHERE IT WAS =====
     Rahul's screenshot: an operator standing in the sky above the watchtower.
     The legs moved along the path, but the height was looked up "near the
     height I already have" — and where a stair flight meets a roof the two
     differ by more than that lookup tolerates. The lookup found nothing, the
     height froze, and the bot carried a rooftop's altitude down the street
     (reproduced headless: one of five operators inside six minutes, then
     stuck there for good, neither moving nor fighting).
     Every waypoint carries its own height. `A.ref` is that height, walked
     along the segment; the graph is consulted NEAR IT only to follow kerbs
     and treads between waypoints. A path can no longer leave the ground. */
  function follow(A, nav, dt, speed) {
    if (A.ref === undefined || A.ref === null) A.ref = A.feet;
    if (!A.path || A.pi >= A.path.length) { A.moving = false; settle(A, nav, dt); return; }
    let remain = speed * dt; A.moving = true;
    while (remain > 1e-5 && A.pi < A.path.length) {
      const w = A.path[A.pi], dx = w[0] - A.x, dz = w[2] - A.z, d = Math.hypot(dx, dz);
      if (A.segI !== A.pi || A.segP !== A.path) { A.segI = A.pi; A.segP = A.path; A.segLen = d; A.segFrom = A.pi > 0 ? (A.path[A.pi - 1][3] | 0) : (Nav.isStair(nav, A.x, A.z, A.ref) ? 1 : 0); }
      if (d <= Math.min(remain, 0.25) + 1e-9) { A.x = w[0]; A.z = w[2]; A.ref = w[1]; remain -= d; A.pi++; continue; }
      /* quarter-metre strides — the stride the line was proven walkable with — and
         at each one the ground is read NEAR THE HEIGHT IT HAD A STRIDE AGO */
      const m = Math.min(remain, 0.25), d2 = d - m;
      A.x += dx / d * m; A.z += dz / d * m; A.mvx = dx / d; A.mvz = dz / d; remain -= m;
      const h = Nav.heightAt(nav, A.x, A.z, A.ref);
      if (h !== null) { A.ref = h; continue; }
      /* no ground within a step of it here: the join between a floor and a
         flight (their heights are tied by a link, not by adjacent cells) */
      const rise = w[1] - A.ref, onto = (w[3] | 0) && !A.segFrom, off = A.segFrom && !(w[3] | 0);
      if (onto) { if (d2 < 0.6) A.ref += rise * Math.min(1, m / Math.max(m, d2 + m)); }          // climb at the foot of the flight, not across the yard
      else if (off) { const gone = A.segLen - d2; A.ref += rise * (gone >= 0.6 ? 1 : Math.min(1, m / Math.max(m, 0.6 - gone + m))); }   // down at once when stepping off
      else A.ref += rise * (m / d);                                                               // along a flight: a straight line between its nodes
    }
    settle(A, nav, dt);
    if (A.pi >= A.path.length) { A.path = null; A.moving = false; A.arrivedAt = now(); }
  }
  function settle(A, nav, dt) {
    if (A.ref === undefined || A.ref === null) A.ref = A.feet;
    const h = Nav.heightAt(nav, A.x, A.z, A.ref);
    const want = h !== null ? h : A.ref;
    const dy = want - A.feet;
    /* up a tread at once; down no faster than a body falls */
    A.feet += dy > 0 ? dy * Math.min(1, dt * 14) : Math.max(dy, -Math.max(0.35, 11 * dt));
  }
  /* the net under all of it: a bot with no graph under its feet is put back on
     the ground below it (or the nearest ground) and plans again */
  function grounded(A, nav, dt) {
    if (A.path) { A.airT = 0; return; }                    // on a path the height is the path's own
    for (let ox = -1; ox <= 1; ox += 0.5) for (let oz = -1; oz <= 1; oz += 0.5)
      if (Nav.nodeAt(nav, A.x + ox, A.z + oz, A.feet, 0.9, true) >= 0) { A.airT = 0; return; }   // a tread or a floor within reach of its feet
    A.airT = (A.airT || 0) + dt;
    if (A.airT < 0.35) return;
    let n = Nav.below(nav, A.x, A.z, A.feet + 0.3);
    if (n < 0) n = Nav.nearest(nav, A.x, A.z, A.feet, 8, 80);
    if (n < 0) return;
    const q = Nav.posOf(nav, n);
    A.x = q[0]; A.z = q[2]; A.ref = q[1]; A.path = null; A.pending = null; A.moving = false; A.thinkAt = 0; A.airT = 0; A.rescued = (A.rescued || 0) + 1;
  }
  function sidestep(A, nav, tx, tz, dist) {
    const dx = tx - A.x, dz = tz - A.z, d = Math.hypot(dx, dz) || 1;
    for (let tries = 0; tries < 2; tries++) {
      const s = A.strafeDir, px = -dz / d * s, pz = dx / d * s;
      const from = curNode(A, nav), n = Nav.nodeAt(nav, A.x + px * dist, A.z + pz * dist, A.feet, 0.5);
      if (from >= 0 && n >= 0 && Nav.walkLine(nav, from, n)) { A.path = [Nav.posOf(nav, n)]; A.pi = 0; A.ref = A.feet; A.moveMode = 'strafe'; A.goalTag = 'strafe'; return true; }
      A.strafeDir = -s;
    }
    return false;
  }
  /* a spot the threat cannot see, close by */
  function findCover(A, nav, eye) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < 26; i++) {
      const n = Nav.randomNear(nav, A.x, A.z, 2.5, 14, A.feet + 2.5, rnd); if (n < 0) continue;
      const q = Nav.posOf(nav, n); if (Math.abs(q[1] - A.feet) > 3) continue;
      if (Nav.los(nav, eye[0], eye[1], eye[2], q[0], q[1] + 1.2, q[2])) continue;
      const d = Math.hypot(q[0] - A.x, q[2] - A.z); if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  /* a spot near (x, z) that CAN see the target */
  function findVantage(A, nav, x, z, y, r, tgt) {
    for (let i = 0; i < 12; i++) {
      const n = Nav.randomNear(nav, x, z, 0, r, y + 3, rnd); if (n < 0) continue;
      const q = Nav.posOf(nav, n); if (Math.abs(q[1] - y) > 3.5) continue;
      if (Nav.los(nav, q[0], q[1] + 1.55, q[2], tgt[0], tgt[1], tgt[2])) return n;
    }
    return -1;
  }
  function pickPerch(S, A, nav, ix, iz, iy) {
    const pool = nav.perches.concat(nav.high); let best = -1, bs = -1e9;
    for (let i = 0; i < 28 && pool.length; i++) {
      const n = pool[(rnd() * pool.length) | 0], q = Nav.posOf(nav, n);
      const d = Math.hypot(q[0] - ix, q[2] - iz); if (d < 22 || d > 120) continue;
      const sees = Nav.los(nav, q[0], q[1] + 1.2, q[2], ix, iy + 1.2, iz);
      const sc = (sees ? 60 : 0) + q[1] * 2 - Math.abs(d - 60) * 0.25 - Math.hypot(q[0] - A.x, q[2] - A.z) * 0.12 + rnd() * 12;
      if (sc > bs) { bs = sc; best = n; }
    }
    return best;
  }
  function interest(room, S) {
    if (S.intel && now() - S.intel.t < 45000) return [S.intel.x, S.intel.y, S.intel.z];
    const hs = humans(room).filter(h => h.alive);
    if (!hs.length) return [0, 0, 0];
    /* not where they ARE — the middle of the map between us and their spawn band */
    let sx = 0, sz = 0, n = 0;
    const D = CFG['MAPS_' + String(room.settings.map || 'urban').toUpperCase()] || {};
    (D.SPAWNS || CFG.SPAWNS || []).forEach(s => { if (s[3] === 'a') { sx += s[0]; sz += s[1]; n++; } });
    return n ? [sx / n * 0.5, 0, sz / n * 0.5] : [0, 0, 0];
  }

  /* ---------------- senses ---------------- */
  function know(A, id) { let k = A.known.get(id); if (!k) { k = { x: 0, y: 0, z: 0, t: 0, vis: false, meter: 0, seenAt: 0, hurtMe: 0, vx: 0, vz: 0 }; A.known.set(id, k); } return k; }
  function sense(room, S, bot, A, dt, t) {
    const prof = S.prof, nav = S.nav, ex = A.x, ey = eyeOf(bot), ez = A.z;
    const scoped = isBolt(A.wpn[A.cur]) && !A.moving;
    const view = prof.view * (scoped ? 1.5 : 1), fov = prof.fov * (scoped ? 0.75 : 1);
    for (const e of room.players.values()) {
      if (e.bot || e.team === bot.team || !e.alive || e.connected === false) continue;
      const cr = e.crouch | 0, ef = feetOf(e), dx = e.pos[0] - ex, dz = e.pos[2] - ez, d = Math.hypot(dx, dz);
      const k = A.known.get(e.id);
      let seen = false;
      if (d < view) {
        const ang = Math.abs(wrap(Math.atan2(dx, -dz) - A.yaw));
        const bubble = cr ? 2.2 : 4.5;
        if (ang <= fov || d < bubble || (k && k.vis)) {
          const chestY = ef + BODYH[cr] * 0.62, headY = ef + BODYH[cr] - 0.14;
          const c = Nav.los(nav, ex, ey, ez, e.pos[0], chestY, e.pos[2]);
          const h = c || Nav.los(nav, ex, ey, ez, e.pos[0], headY, e.pos[2]);
          if (c || h) { seen = true; var aimHead = !c; }
        }
      }
      if (seen) {
        const kk = know(A, e.id);
        const fresh = t - kk.t < 2200;
        const rate = prof.detect * (cr === 2 ? 0.5 : cr === 1 ? 0.75 : 1) * (e.mv === 2 ? 1.3 : e.mv === 1 ? 1 : 0.85) *
                     Math.max(0.35, Math.min(1.7, 1.75 - d / view * 1.3)) * (d < 6 ? 3 : 1);
        kk.meter = Math.min(1.5, kk.meter + dt * rate * 2.2);
        if (kk.meter >= 1 || fresh || kk.vis) {
          if (!kk.vis) {
            kk.seenAt = t;
            /* he is back in view: a beat before the trigger, shorter if he was
               only gone a moment (the angle was held), never zero */
            if (e.id === A.target) { A.reactAt = Math.max(A.reactAt, t + rand(prof.react[0], prof.react[1]) * (t - kk.t < 1500 ? 0.45 : 0.8)); A.onTargetSince = 0; }
          }
          const pdt = Math.max(0.05, (t - kk.t) / 1000);
          if (kk.vis && pdt < 0.5) { kk.vx = (e.pos[0] - kk.x) / pdt; kk.vz = (e.pos[2] - kk.z) / pdt; } else { kk.vx = 0; kk.vz = 0; }
          kk.vis = true; kk.x = e.pos[0]; kk.y = ef; kk.z = e.pos[2]; kk.t = t; kk.cr = cr; kk.head = !!aimHead;
        }
      } else if (k) {
        k.vis = false; k.meter = Math.max(0, k.meter - dt * 0.6);
        /* sprinting feet close by are heard */
        if (e.mv === 2 && !cr && d < 13 && t - k.t > 600) { k.x = e.pos[0] + gauss() * 2.5; k.z = e.pos[2] + gauss() * 2.5; k.y = ef; k.t = t; }
      } else if (e.mv === 2 && !cr && d < 13) {
        const kk = know(A, e.id); kk.x = e.pos[0] + gauss() * 2.5; kk.z = e.pos[2] + gauss() * 2.5; kk.y = ef; kk.t = t;
      }
    }
    /* being shot tells you roughly where from */
    if (bot.hp < A.lastHp - 0.5) {
      let who = null, wt = 0;
      for (const id in bot.rd) { const r = bot.rd[id]; if (r && r.t > wt) { wt = r.t; who = id; } }
      const e = who && room.players.get(who);
      if (e && !e.bot && e.alive && t - wt < 1500) {
        const kk = know(A, who); kk.hurtMe = t;
        if (!kk.vis) { kk.x = e.pos[0] + gauss() * prof.hurtErr; kk.z = e.pos[2] + gauss() * prof.hurtErr; kk.y = feetOf(e); kk.t = t; }
      }
      A.flinchUntil = t + 380; A.thinkAt = 0; A.hurtAt = t;
    }
    A.lastHp = bot.hp;
  }
  /* an unsuppressed shot carries; a suppressed one barely does */
  function onShot(room, shooter, w, sup) {
    const S = room._bots; if (!S || !S.ready || !shooter || shooter.bot) return;
    const t = now(), range = sup ? 14 : 85;
    for (const bot of S.list) {
      if (!bot.alive) continue;
      const A = bot.ai, d = Math.hypot(shooter.pos[0] - A.x, shooter.pos[2] - A.z);
      if (d > range) continue;
      const k = know(A, shooter.id); if (k.vis) continue;
      const e = d * S.prof.hearErr + 1;
      k.x = shooter.pos[0] + gauss() * e; k.z = shooter.pos[2] + gauss() * e; k.y = feetOf(shooter); k.t = t;
      if (A.thinkAt > t + 150) A.thinkAt = t + rand(150, 400);
    }
  }
  function share(room, S, bot, A, t) {
    if (t < A.commsAt || !A.target) return;
    const k = A.known.get(A.target); if (!k || !k.vis) return;
    A.commsAt = t + S.prof.commsMs * rand(0.8, 1.3);
    S.intel = { x: k.x, y: k.y, z: k.z, t: t };
    for (const m of S.list) {
      if (m === bot || !m.alive) continue;
      const B = m.ai; if (Math.hypot(B.x - A.x, B.z - A.z) > 160) continue;
      const kk = know(B, A.target); if (kk.vis || t - kk.t < 1500) continue;
      kk.x = k.x + gauss() * 3; kk.z = k.z + gauss() * 3; kk.y = k.y; kk.t = t;
    }
  }

  /* ---------------- thinking ---------------- */
  function think(room, S, bot, A, t) {
    const nav = S.nav, prof = S.prof, per = A.per;
    A.thinkAt = t + rand(180, 320);
    if (A.pending && !Nav.isStair(nav, A.x, A.z, A.feet)) { const g = A.pending; A.pending = null; goTo(A, nav, g[0], g[1], g[2]); }
    /* who */
    let best = null, bs = -1e9;
    for (const [id, k] of A.known) {
      const e = room.players.get(id);
      if (!e || !e.alive || e.connected === false || t - k.t > prof.memory) { A.known.delete(id); continue; }
      const d = Math.hypot(k.x - A.x, k.z - A.z);
      const sc = (k.vis ? 100 : 0) + Math.max(0, 60 - d * 0.5) + (k.hurtMe && t - k.hurtMe < 4000 ? 35 : 0) -
                 (S.focus[id] || 0) * 6 + (id === A.target ? 18 : 0) - (t - k.t) * 0.004;
      if (sc > bs) { bs = sc; best = id; }
    }
    if (best !== A.target) {
      A.target = best; A.onTargetSince = 0;
      A.reactAt = t + rand(prof.react[0], prof.react[1]) * (A.mode === 'hold' ? 0.6 : 1);
    }
    const k = A.target ? A.known.get(A.target) : null;
    if (!k) return patrol(room, S, bot, A, t);
    const d = Math.hypot(k.x - A.x, k.z - A.z), w = wdef(A.wpn[A.cur]);
    const reloading = t < A.reloadUntil;
    /* cover, when hurt or dry */
    if (A.mode === 'cover') {
      if (t < A.coverUntil && (reloading || bot.hp < 60 || t < A.coverMin)) return;
      A.mode = 'fight'; A.wantCrouch = 0;
    }
    if (k.vis) {
      share(room, S, bot, A, t);
      const hurt = bot.hp < prof.retreatHp, canCover = t - A.coverAt > 4500;
      if (canCover && ((hurt && rnd() < prof.cover) || (reloading && d < 45 && rnd() < prof.cover * 0.7))) {
        const e = room.players.get(A.target), c = findCover(A, nav, [e.pos[0], eyeOf(e), e.pos[2]]);
        if (c >= 0 && goTo(A, nav, c, 'run', 'cover')) {
          A.mode = 'cover'; A.coverAt = t; A.coverMin = t + rand(900, 1700); A.coverUntil = t + (hurt ? rand(5000, 8000) : rand(2200, 3600)); A.wantCrouch = t + 9000;
          return;
        }
      }
      A.mode = 'fight';
      return fight(room, S, bot, A, t, k, d, w);
    }
    /* known, not in sight */
    const age = t - k.t;
    if (A.mode === 'hold' && per.hold >= 0.5 && t < A.holdUntil) return;                     // keep the angle
    if (A.mode === 'fight' && age < 450) return;                                             // he ducked; give it a beat
    hunt(room, S, bot, A, t, k, d);
  }
  function fight(room, S, bot, A, t, k, d, w) {
    const nav = S.nav, prof = S.prof, per = A.per;
    let lo = per.ideal[0], hi = per.ideal[1];
    if (!isBolt(A.wpn[A.cur])) hi = Math.min(hi, (w.range || 40) * 1.05);
    if (lo > hi * 0.7) lo = hi * 0.5;
    const tgt = [k.x, k.y + 1.1, k.z];
    if (A.path && (A.goalTag === 'advance' || A.goalTag === 'back') && t - A.pathAt < 1500) return;
    if (d > hi * 1.15 && per.hold < 0.8) {
      const mid = (lo + hi) / 2, ux = (A.x - k.x) / d, uz = (A.z - k.z) / d;
      let n = findVantage(A, nav, k.x + ux * mid, k.z + uz * mid, k.y, 6, tgt);
      if (n < 0) n = Nav.nearest(nav, k.x + ux * mid, k.z + uz * mid, k.y, 6, 3);
      if (goTo(A, nav, n, (d > hi * 1.6 && rnd() < per.sprint) ? 'run' : 'walk', 'advance')) return;
    }
    if (d < lo * 0.65 && per.aggression < 0.5 && t - (A.backAt || 0) > 2500) {
      A.backAt = t;
      const ux = (A.x - k.x) / (d || 1), uz = (A.z - k.z) / (d || 1);
      const n = findVantage(A, nav, A.x + ux * 8, A.z + uz * 8, A.feet, 5, tgt);
      if (n >= 0 && goTo(A, nav, n, 'walk', 'back')) return;
    }
    if (per.hold >= 0.8 || t < A.wantCrouch) { A.path = (A.goalTag === 'strafe') ? null : A.path; return; }   // steady shooters stay put
    if (!A.path && t >= A.strafeAt) {
      A.strafeAt = t + rand(prof.strafe[0], prof.strafe[1]);
      if (rnd() < per.crouch * prof.crouchK * 0.5) { A.wantCrouch = t + rand(900, 2200); return; }
      if (rnd() < 0.35) A.strafeDir = -A.strafeDir;
      sidestep(A, nav, k.x, k.z, rand(1.4, 3.4));
    }
  }
  function hunt(room, S, bot, A, t, k, d) {
    const nav = S.nav, prof = S.prof, per = A.per, tag = 'hunt:' + A.target + ':' + Math.round(k.t / 1500);
    A.wantCrouch = 0;
    if (A.afterMove === 'hold' && !A.path && !A.pending) {     // arrived at the angle it went for: hold it
      A.afterMove = null; A.mode = 'hold'; A.holdUntil = t + rand(12000, 24000);
      A.holdYaw = Math.atan2(k.x - A.x, -(k.z - A.z)); A.goalTag = null;
      return;
    }
    if (A.mode === 'search') {
      if (t > A.searchUntil) { A.known.delete(A.target); A.target = null; A.mode = 'patrol'; return; }
      if (!A.path && t > (A.idleUntil || 0)) {
        const n = Nav.randomNear(nav, k.x, k.z, 3, 13, k.y + 3, rnd);
        if (n >= 0) goTo(A, nav, n, 'walk', 'search'); A.idleUntil = t + rand(700, 1600);
      }
      return;
    }
    if (d < 4.5 && Math.abs(k.y - A.feet) < 2.5) { A.mode = 'search'; A.searchUntil = t + rand(5000, 8000); A.path = null; return; }
    if (A.path && A.goalTag === tag) return;
    A.mode = 'hunt';
    if (per.hold >= 0.9) {                 // the sniper finds a place that overlooks it
      const n = pickPerch(S, A, nav, k.x, k.z, k.y);
      if (n >= 0 && goTo(A, nav, n, 'run', tag)) { A.afterMove = 'hold'; return; }
    }
    if (per.hold >= 0.5 && d < 40) {       // the anchor / marksman takes a covered angle on it
      const n = findVantage(A, nav, A.x, A.z, A.feet, 9, [k.x, k.y + 1.1, k.z]);
      if (n >= 0 && goTo(A, nav, n, 'walk', tag)) { A.afterMove = 'hold'; return; }
    }
    if (rnd() < per.flank * prof.flankK && d > 18 && t - A.flankDone > 9000) {
      A.flankDone = t;
      const ux = (k.x - A.x) / d, uz = (k.z - A.z) / d, s = rnd() < 0.5 ? 1 : -1, off = rand(14, 24);
      const a = rand(1.2, 1.9) * s, cx = k.x + (-ux * Math.cos(a) + uz * Math.sin(a)) * off, cz = k.z + (-uz * Math.cos(a) - ux * Math.sin(a)) * off;
      if (goNear(A, nav, cx, cz, k.y, 'run', tag, 8)) return;
    }
    goNear(A, nav, k.x, k.z, k.y, (d > 22 && rnd() < per.sprint + 0.2) ? 'run' : 'walk', tag, 8);
  }
  function patrol(room, S, bot, A, t) {
    const nav = S.nav, per = A.per;
    A.wantCrouch = 0;
    if (A.mode === 'hold') {
      if (t < A.holdUntil) return;
      A.mode = 'patrol';
    }
    if (A.path) return;
    if (A.pending) return;
    if (A.afterMove === 'hold' || A.goalTag === 'post') {
      A.afterMove = null; A.mode = 'hold'; A.holdUntil = t + rand(22000, 46000); A.goalTag = null;
      const I = interest(room, S); A.holdYaw = Math.atan2(I[0] - A.x, -(I[2] - A.z));
      return;
    }
    if (t < (A.idleUntil || 0)) return;
    const I = interest(room, S);
    if (per.hold >= 0.9) {
      const n = pickPerch(S, A, nav, I[0], I[2], I[1]);
      if (n >= 0 && goTo(A, nav, n, 'walk', 'post')) return;
    } else if (per.hold >= 0.5) {
      /* a room or a corner near where people pass */
      const h = S.hot.length ? Nav.posOf(nav, pick(S.hot)) : [I[0], 0, I[2]];
      let best = -1;
      for (let i = 0; i < 14; i++) {
        const n = Nav.randomNear(nav, h[0], h[2], 2, 16, 9, rnd); if (n < 0) continue;
        const q = Nav.posOf(nav, n); if (best < 0) best = n;
        if (Nav.roofed(nav, q[0], q[1], q[2])) { best = n; break; }
      }
      if (best >= 0 && goTo(A, nav, best, 'walk', 'post')) return;
    }
    /* roam: somewhere people go, not too near, not across the world */
    let n = -1, nb = 1e9; const lean = rnd() < 0.6;       // six times in ten, toward where people were last
    for (let i = 0; i < 8 && S.hot.length; i++) {
      const c = pick(S.hot), q = Nav.posOf(nav, c), dd = Math.hypot(q[0] - A.x, q[2] - A.z);
      if (dd < 25 || dd > 170) continue;
      if (!lean) { n = c; break; }
      const di = Math.hypot(q[0] - I[0], q[2] - I[2]); if (di < nb) { nb = di; n = c; }
    }
    if (n < 0) n = Nav.randomNear(nav, A.x, A.z, 20, 70, 2, rnd);
    if (goTo(A, nav, n, rnd() < per.sprint * 0.4 ? 'run' : 'walk', 'roam')) A.idleUntil = 0;
    else A.idleUntil = t + 800;
  }

  /* ---------------- acting: legs, eyes, trigger ---------------- */
  function act(room, S, bot, A, dt, t) {
    const nav = S.nav, prof = S.prof, per = A.per;
    const k = A.target ? A.known.get(A.target) : null;
    const e = k ? room.players.get(A.target) : null;
    const engaging = !!(k && k.vis && e && e.alive);
    /* stance */
    const still = !A.path;
    let cr = 0;
    if (A.mode === 'hold' && per.crouch > 0.4) cr = 1;
    if (A.mode === 'cover' && still) cr = 1;
    if (t < A.wantCrouch && still) cr = 1;
    bot.crouch = cr;
    /* legs */
    let speed = 0, mv = 0;
    if (A.path) {
      const m = A.moveMode;
      speed = m === 'run' ? MV.sprint : m === 'strafe' ? MV.walk * 0.78 : MV.walk;
      if (engaging && m !== 'run') speed *= 0.85;
      speed *= prof.moveMul; mv = m === 'run' ? 2 : 1;
      follow(A, nav, dt, speed);
      if (!A.path && A.goalTag === 'roam') A.idleUntil = t + rand(900, 2600);
    } else { A.moving = false; settle(A, nav, dt); }
    grounded(A, nav, dt);
    bot.mv = A.moving ? mv : 0;
    /* eyes */
    let wantYaw = A.yaw, wantPitch = 0;
    if (k && (k.vis || t - k.t < 5000)) {
      const lead = k.vis ? 0.12 : 0, tx = k.x + k.vx * lead, tz = k.z + k.vz * lead;
      const dx = tx - A.x, dz = tz - A.z, dd = Math.hypot(dx, dz) || 1;
      const ty = k.y + (k.head ? BODYH[k.cr | 0] - 0.14 : BODYH[k.cr | 0] * 0.62);
      wantYaw = Math.atan2(dx, -dz); wantPitch = Math.atan2(ty - eyeOf(bot), dd);
    } else if (A.mode === 'hold' && A.holdYaw !== null) {
      wantYaw = A.holdYaw + Math.sin(t / 1900 + A.phase) * 0.85;
    } else if (A.moving) {
      wantYaw = Math.atan2(A.mvx || 0, -(A.mvz || 0)) + Math.sin(t / 1300 + A.phase) * 0.45;
    } else wantYaw = A.yaw + Math.sin(t / 1700 + A.phase) * 0.02;
    const turn = prof.turn * dt * (A.moveMode === 'run' && A.moving ? 0.8 : 1);
    const dy = wrap(wantYaw - A.yaw);
    A.yaw = wrap(A.yaw + Math.max(-turn, Math.min(turn, dy)));
    A.pitch += Math.max(-turn, Math.min(turn, wantPitch - A.pitch));
    /* weapon handling */
    const wn = A.wpn[A.cur], w = wdef(wn);
    if (A.reloadUntil && t >= A.reloadUntil) { A.mag[wn] = w.mag || 1; A.reloadUntil = 0; }
    if (!engaging) {
      A.onTargetSince = 0; A.burstLeft = 0;
      if (!A.reloadUntil && A.mag[wn] < (w.mag || 1) * 0.4 && (!k || t - k.t > 2000)) A.reloadUntil = t + (w.reload || 2) * 1000;
      if (A.cur === 1 && !A.reloadUntil && (!k || t - k.t > 3500)) swap(bot, A, 0, t);
      return;
    }
    const d = Math.hypot(k.x - A.x, k.z - A.z);
    /* the right gun for the range */
    if (t >= A.swapUntil && !A.reloadUntil) {
      if (A.cur === 0 && isBolt(A.wpn[0]) && d < 14) swap(bot, A, 1, t);
      else if (A.cur === 0 && A.mag[A.wpn[0]] <= 0 && d < 12) swap(bot, A, 1, t);
      else if (A.cur === 1 && d > 26 && A.mag[A.wpn[0]] > 0) swap(bot, A, 0, t);
    }
    if (!A.onTargetSince) A.onTargetSince = t;
    if (A.mag[wn] <= 0 && !A.reloadUntil) { A.reloadUntil = t + (w.reload || 2) * 1000 * (prof === PROFILES.medium ? 1.1 : 1); A.thinkAt = 0; return; }
    if (A.reloadUntil || t < A.swapUntil || t < A.reactAt || t < A.pauseUntil) return;
    if (e.protUntil && e.protUntil > t) return;                       // spawn protection is respected
    if (Math.abs(dy) > 0.14) return;                                  // not on him yet
    const bolt = isBolt(wn);
    if (bolt && (t - A.onTargetSince < prof.snipeSettle || A.moving)) return;
    if (!bolt && d > (w.range || 40) * (prof.reach || 2.2)) return;    // out of reach: close in, do not spray
    /* a few of them shoot one player at a time; the rest move */
    let sh = S.shooters.get(A.target); if (!sh) S.shooters.set(A.target, sh = new Map());
    let busy = 0; for (const [bid, bt] of sh) { if (t - bt > 700) sh.delete(bid); else if (bid !== bot.id) busy++; }
    if (busy >= prof.maxShooters) return;
    if (t < A.nextShotAt) return;
    if (A.burstLeft <= 0) {
      A.burstLeft = bolt || w.type === 'semi' ? ((1 + rnd() * 2) | 0) : ((rand(prof.burst[0], prof.burst[1] + 1)) | 0) * (wn === 'm249' ? 2 : 1);
      if (bolt) A.burstLeft = 1;
      A.shotsInBurst = 0;
    }
    /* the line is checked at the moment of the shot, from where it stands NOW —
       sight is sampled every other tick and a strafe can carry it behind a
       pillar in between (verify-bots caught 6 such shots in 134) */
    {
      const ef0 = feetOf(e), c0 = e.crouch | 0, ey0 = eyeOf(bot);
      const chest = Nav.los(nav, A.x, ey0, A.z, e.pos[0], ef0 + BODYH[c0] * 0.62, e.pos[2]);
      const head = chest || Nav.los(nav, A.x, ey0, A.z, e.pos[0], ef0 + BODYH[c0] - 0.14, e.pos[2]);
      if (!head) { k.vis = false; A.burstLeft = 0; return; }
      k.head = !chest;
    }
    /* one shot */
    A.nextShotAt = t + 60000 / (w.rpm || 600);
    A.mag[wn]--; A.burstLeft--; A.shotsInBurst++;
    sh.set(bot.id, t); bot.protUntil = 0;
    const firstShot = 1 + 1.2 * Math.exp(-(t - A.onTargetSince) / prof.tau);
    const tSpeed = Math.hypot(k.vx, k.vz);
    let err = prof.err * firstShot * (A.moving ? 1.3 : cr ? 0.85 : 1) * (1 + Math.min(0.6, tSpeed / 12)) *
              (1 + 0.05 * A.shotsInBurst) * (t < A.flinchUntil ? (prof.flinch || 1.6) : 1);
    if (bolt) err *= prof.scopeMul * (1 + Math.min(1.2, tSpeed / 5));
    const ecr = e.crouch | 0, ef = feetOf(e), top = ef + BODYH[ecr];
    const settled = t - A.onTargetSince > prof.tau * 2;
    const goHead = k.head || (settled && d < 45 && rnd() < prof.headPct * (bolt ? 2 : 1));
    const aimY = goHead ? top - 0.14 : ef + BODYH[ecr] * 0.62;
    const eye = [A.x, eyeOf(bot), A.z];
    const pellets = w.pellets || 1; let hits = 0, part = 'body';
    const halfW = ecr === 2 ? 0.5 : 0.3;
    for (let i = 0; i < pellets; i++) {
      const pe = pellets > 1 ? Math.max(err, 0.045) : err;
      const mx = gauss() * pe * d, my = gauss() * pe * d * 0.8, y = aimY + my;
      if (Math.abs(mx) > halfW || y < ef || y > top) continue;
      hits++;
      if (pellets === 1) part = (y >= top - 0.3 && Math.abs(mx) <= 0.16) ? 'head' : (y < ef + BODYH[ecr] * 0.42 ? 'legs' : 'body');
    }
    io.to(room.code).emit('shoot', { id: bot.id, w: wn, o: eye, dir: [Math.sin(A.yaw) * Math.cos(A.pitch), Math.sin(A.pitch), -Math.cos(A.yaw) * Math.cos(A.pitch)], sup: 0 });
    if (hits > 0) {
      const dist3 = Math.hypot(d, e.pos[1] - bot.pos[1]);
      const dmg = ctx.weaponServerDamage(wn, part, hits, dist3, false);
      if (dmg > 0) ctx.applyDamage(room, e, dmg, bot.id, wn, part === 'head', false);
    }
    if (A.burstLeft <= 0) {
      A.pauseUntil = t + rand(prof.pause[0], prof.pause[1]) * (bolt ? 0.4 : 1);
      /* hard operators break the line between bursts */
      if (!bolt && per.hold < 0.8 && rnd() < prof.peek * (1 - per.aggression * 0.6) && t - A.coverAt > 5000) {
        const c = findCover(A, nav, [e.pos[0], eyeOf(e), e.pos[2]]);
        if (c >= 0 && goTo(A, nav, c, 'run', 'cover')) { A.mode = 'cover'; A.coverAt = t; A.coverMin = t + rand(700, 1300); A.coverUntil = t + rand(1500, 2600); }
      }
    }
  }
  function swap(bot, A, slot, t) {
    if (A.cur === slot || !A.wpn[slot]) return;
    A.cur = slot; A.swapUntil = t + 550; A.burstLeft = 0; A.onTargetSince = t;
    bot.wp = Math.max(0, CFG.WEAPON_ORDER.indexOf(A.wpn[slot]));
  }

  /* ---------------- the tick (snapshot rate) ---------------- */
  /* v2.12.1: nobody has had eyes on a player for a while — the squad gets a
     rough fix (a sound, a radio call) and the nearest operators who are not
     holding an angle go and look. Without this a solo player could walk the
     map and meet nobody; the fight is supposed to come to him. */
  function scout(room, S, t) {
    if (!S.scoutAt) { S.scoutAt = t + S.prof.intelMs; return; }
    if (t < S.scoutAt) return;
    S.scoutAt = t + S.prof.intelMs * rand(0.8, 1.25);
    const hs = humans(room).filter(h => h.alive && !(h.protUntil > t));
    if (!hs.length) return;
    for (const b of S.list) if (b.alive) for (const k of b.ai.known.values()) if (k.vis || t - k.t < 6000) return;   // contact: no need
    const h = pick(hs), err = S.prof.intelErr;
    const fx = h.pos[0] + gauss() * err, fz = h.pos[2] + gauss() * err, fy = feetOf(h);
    S.intel = { x: fx, y: fy, z: fz, t: t };
    const near = S.list.filter(b => b.alive && b.ai.per.hold < 0.9 && b.ai.mode !== 'cover')
      .sort((a, b) => Math.hypot(a.ai.x - fx, a.ai.z - fz) - Math.hypot(b.ai.x - fx, b.ai.z - fz))
      .slice(0, S.prof === PROFILES.hard ? 3 : 2);
    near.forEach(b => {
      const kk = know(b.ai, h.id); if (kk.vis) return;
      kk.x = fx + gauss() * 3; kk.z = fz + gauss() * 3; kk.y = fy; kk.t = t;
      if (b.ai.mode === 'hold') { b.ai.mode = 'patrol'; b.ai.holdUntil = 0; }
      b.ai.thinkAt = 0;
    });
  }
  function tick(room, dt) {
    const S = room._bots; if (!S || !S.ready || room.state !== 'playing') return;
    const t = now(); S.tickN++;
    pathBudget = PATHS_PER_TICK;
    if (S.tickN % 45 === 0) ensureCount(room, S);
    const focus = {}; for (const b of S.list) if (b.alive && b.ai.target) focus[b.ai.target] = (focus[b.ai.target] || 0) + 1;
    S.focus = focus;
    scout(room, S, t);
    for (let i = 0; i < S.list.length; i++) {
      const bot = S.list[i], A = bot.ai;
      if (!bot.alive) {
        if (!bot.out && bot.respawnAt && t >= bot.respawnAt && bot.respawnAt !== Infinity) { ctx.spawnPlayer(room, bot); resetLife(room, S, bot); }
        continue;
      }
      try {
        if ((S.tickN + i) % 2 === 0) sense(room, S, bot, A, dt * 2, t);
        if (t >= A.thinkAt) think(room, S, bot, A, t);
        act(room, S, bot, A, dt, t);
      } catch (err) {
        /* one bot's bad tick must never take the match down */
        if (!S.warned) { S.warned = true; console.error('[botai] tick failed:', err && err.stack || err); }
        A.path = null; A.thinkAt = t + 500;
      }
      writePos(bot, A);
    }
  }

  return { isBotMode, onMatchStart, onMatchEnd, tick, onShot, removeBots, PROFILES, PERSONAS, SQUAD,
           _resetLife: resetLife, _ensureCount: ensureCount };
};
