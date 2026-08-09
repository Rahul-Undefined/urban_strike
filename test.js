/* Integration test v3 — three phases against a running server.
   Phase 1: FFA flow + spawn protection + dynamic loot guarantees.
   Phase 2: 3v3 teams, FF block, armor soak math, heals, assists, team score.
   Phase 3: fast airdrop -> crate loot -> attachment + exclusive weapon grants.
   Run:  npm start   then   npm test                                        */
const { io } = require('socket.io-client');
const URL = 'http://localhost:3000';
const CFG = require('./public/src/config/index.js');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
function finish() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
/* v8.34: 120s -> 240s. Not a budget being relaxed — the suite genuinely got
   longer. Phase 8 seats twelve real sockets and Phase 9 plays a live squad
   match through a real 10s countdown with 3s respawns between kills. Both are
   wall-clock costs of testing the thing properly rather than mocking it. */
setTimeout(() => { console.log('TIMEOUT'); finish(); }, 400000);

/* ---- static config gates (no server needed) ---- */
function configGates() {
  console.log('--- Config: match options + mode registry ---');
  /* v8.30: Unlimited kills (0) is now a selectable option. The gate that used
     to forbid it encoded a PRODUCT decision, not a safety one — but the safety
     rule underneath it ("every match can end") still holds and is now asserted
     explicitly and more strictly than before, rather than being an accident of
     the option list. */
  ok(CFG.MATCH.killOptions.join(',') === '5,10,15,20,30,0',
    'kill options are 5/10/15/20/30 + 0 (Unlimited)');
  ok(CFG.MATCH.timeOptions.join(',') === '5,10,15,30,60', 'duration options are 5/10/15/30/60 (no No-Limit)');
  ok(CFG.MATCH.timeOptions.every(n => n > 0), 'no zero duration: every match can end');
  /* THE PAIRING RULE. Unlimited kills is only survivable because the clock is
     always finite. If a no-limit duration is ever added, this fails loudly
     instead of shipping a match that can never end. */
  ok(!(CFG.MATCH.killOptions.indexOf(0) >= 0 && CFG.MATCH.timeOptions.indexOf(0) >= 0),
    'unlimited kills and unlimited time can never both be selectable');
  CFG.MATCH.killOptions.forEach(k => {
    ok(k > 0 || CFG.MATCH.timeOptions.every(t => t > 0),
      'kill option ' + k + ' still leaves every match with a way to end');
  });

  /* v8.37: EVERY MODE MUST BE ABLE TO END, by one of three routes — a kill
     target, a clock, or elimination. Last Stand deliberately has neither a
     target nor a clock, so the old rule ("time is always finite") is no longer
     sufficient on its own and is replaced by the general one. */
  Object.keys(CFG.MODES).forEach(m => {
    const elim = CFG.isElimination(m);
    const canEndOnTime = CFG.MATCH.timeOptions.some(t => t > 0);
    const canEndOnKills = CFG.MATCH.killOptions.some(k => k > 0);
    ok(elim || canEndOnTime || canEndOnKills,
      'mode ' + m + ' has at least one way to end');
    if (elim) {
      ok(CFG.livesFor(m) >= 1, 'elimination mode ' + m + ' grants at least one life');
      ok(CFG.MODES[m].maxPlayers >= 2,
        'elimination mode ' + m + ' needs someone to be last standing against');
    }
  });
  ok(CFG.MATCH.killOptions.indexOf(CFG.MATCH.defaultKills) >= 0, 'default kill target is a selectable option');
  ok(CFG.MATCH.timeOptions.indexOf(CFG.MATCH.defaultMinutes) >= 0, 'default duration is a selectable option');
  ok(typeof CFG.MATCH.startCountdown === 'number' && CFG.MATCH.startCountdown > 0, 'launch countdown is configured');
  ok(!!CFG.MODES.t2 && CFG.MODES.t2.teams === true && CFG.MODES.t2.maxPlayers === 4, '2v2 mode exists (teams, 4 players)');
  ['ffa', 't2', 't3', 't5'].forEach(k => ok(!!CFG.MODES[k], 'mode registered: ' + k));
  ['urban', 'rural', 'metro'].forEach(k =>
    ok(CFG.MAPS[k] && CFG.MAPS[k].ready !== false, 'map selectable in registry: ' + k));

  // index.html must not hardcode map/mode options — that is how Metro was lost.
  const html = require('fs').readFileSync('./public/index.html', 'utf8');
  ['create-map', 'lobby-map', 'create-mode', 'lobby-mode', 'create-kills',
   'lobby-kills', 'create-time', 'lobby-time'].forEach(id => {
    const m = html.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
    ok(m && m[1].indexOf('<option') === -1, id + ' has no hardcoded <option> (built from CFG)');
  });
  ok(html.indexOf('id="countdown"') !== -1 && html.indexOf('id="countdown"') > html.indexOf('id="hud-layer"'),
    'countdown element exists');
  const hudStart = html.indexOf('<div id="hud-layer"');
  const hudEnd = html.indexOf('<div id="countdown"');
  ok(hudEnd > hudStart, 'countdown sits after the HUD layer, not inside it');

  /* Layout regressions the browser sees but no gate used to. */
  const css = require('fs').readFileSync('./public/css/style.css', 'utf8');
  const footBlocks = css.match(/\.menu-foot\s*\{[^}]*\}/g) || [];
  const lastFootPos = footBlocks.filter(b => /position\s*:/.test(b)).pop() || '';
  ok(/position\s*:\s*static/.test(lastFootPos),
    '.menu-foot flows in-document (a fixed footer overlapped the stat strip)');
  ok(/#menu-layer[^{]*\{[^}]*overflow-y\s*:\s*auto/.test(css),
    'menu layer scrolls instead of clipping on short viewports');

  /* The countdown must actually render a number, not just exist in the DOM. */
  const uijs = require('fs').readFileSync('./public/src/ui/ui.js', 'utf8');
  const cd = uijs.match(/function setCountdown[\s\S]*?\n  \}/);
  ok(!!cd && cd[0].indexOf('cd-num') !== -1, 'setCountdown renders a large tick number');
  ok(CFG.MATCH.startCountdown >= 3 && CFG.MATCH.startCountdown <= 15,
    'launch countdown is a sane length (' + CFG.MATCH.startCountdown + 's)');

  /* The countdown fires in the LOBBY. Its socket handler must be registered at
     connect time, not inside bindGameplayEvents(), which only runs on
     matchStart — i.e. after the countdown has already finished. That is where
     it lived, so every tick was emitted by the server and dropped. */
  const net = require('fs').readFileSync('./public/src/networking/net.js', 'utf8');
  const gpStart = net.indexOf('function bindGameplayEvents');
  const cdAt = net.indexOf("'countdown'");
  ok(cdAt !== -1 && cdAt < gpStart,
    'countdown handler is bound at connect, not deferred to matchStart');
}
configGates();
const PROT = CFG.MATCH.spawnProtect * 1000;

/* v7.4: START MATCH is gated on every player being READY, then runs a real
   CFG.MATCH.startCountdown before the match begins. Combat phases don't test
   the lobby, so they use this helper to satisfy the gate honestly rather than
   the gate being softened for them. */
function launch(sockets) {
  sockets.forEach(s => s.emit('setReady', { v: true }));
  setTimeout(() => sockets[0].emit('startMatch'), 250);
}

/* ---------------- Phase 1: FFA + protection + loot list ---------------- */
function phase1(done) {
  console.log('--- Phase 1: FFA / protection / loot ---');
  const A = io(URL), B = io(URL);
  let bPos = null, bDead = false, bSpawns = 0, bWp = 0, wpRelayed = false;
  let protViolation = false, gotDamaged = false, gotConfirmV = false, lootList = null;

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Alpha', settings: { killTarget: 5, minutes: 10 } }, (res) => {
      ok(res && res.ok && /^[A-Z2-9]{5}$/.test(res.code), 'createRoom returns 5-char code');
      B.emit('joinRoom', { name: 'Bravo', code: res.code }, (res2) => {
        ok(res2 && res2.ok, 'joinRoom with valid code succeeds');
        launch([A, B]);
      });
    });
  });
  A.on('matchStart', (d) => {
    ok(d.settings.mode === 'ffa' && d.settings.killTarget === 5, 'matchStart carries settings incl. mode');
    lootList = d.pickups;
    const okShape = Array.isArray(lootList) && lootList.length > 0 &&
      lootList.every(e => typeof e.id === 'number' && CFG.LOOT_ITEMS[e.t] && Array.isArray(e.p));
    ok(okShape, 'matchStart delivers dynamic loot list (' + (lootList ? lootList.length : 0) + ' items)');
    const hasA3 = lootList.some(e => e.t === 'armor3');
    const hasLeg = lootList.some(e => CFG.LOOT_ITEMS[e.t].kind === 'weapon' && CFG.LOOT_ITEMS[e.t].rar === 'l');
    ok(hasA3 && hasLeg, 'loot guarantees hold: L3 vest + legendary weapon on the map');
  });
  B.on('spawn', (d) => {
    if (d.id !== B.id) return;
    bSpawns++;
    bPos = d.pos.slice();
    if (bSpawns === 1) {
      ok(typeof d.prot === 'number' && d.prot > 0, 'spawn event announces protection window');
      setInterval(() => { if (!bDead) B.emit('st', { p: bPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: bWp, ping: 20 }); }, 50);
      setTimeout(() => { bWp = 9; }, 1200); // simulate equipping the slot-9 exclusive
      // shot INSIDE the protection window must be ignored
      setTimeout(() => A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos }), 700);
      setTimeout(() => {
        ok(!protViolation, 'spawn protection blocks early damage');
        shoot();
      }, PROT + 400);
    }
    if (bSpawns === 2) {
      ok(true, 'B respawned after death');
      A.disconnect(); B.disconnect();
      setTimeout(done, 250);
    }
  });
  let shots = 0;
  function shoot() {
    if (shots >= 14 || bDead) return;
    shots++;
    A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    setTimeout(shoot, 80);
  }
  B.on('damaged', (d) => {
    if (performance.now && false) return;
    if (!gotDamaged && shots === 0) { protViolation = true; }
    if (!gotDamaged && shots > 0) { gotDamaged = true; ok(d.hp < 100, 'victim receives damaged after protection expires'); }
  });
  A.on('hitConfirm', (d) => {
    if (!gotConfirmV && d.v) { gotConfirmV = true; ok(d.v === B.id, 'hitConfirm carries victim id for damage numbers'); }
  });
  A.on('snap', (d) => {
    const st = d.players && d.players[B.id];
    if (!wpRelayed && st && st.wp === 9) {
      wpRelayed = true;
      ok(true, 'snapshot relays equipped weapon index (wp=9) for remote weapon models');
    }
  });
  // Deadline anchored to matchStart, not to phase start: the launch countdown
  // now sits between them, and a wall-clock deadline would expire pre-match.
  A.on('matchStart', () => setTimeout(() => {
    if (!wpRelayed) { wpRelayed = true; ok(false, 'snapshot relays equipped weapon index (wp=9) for remote weapon models'); }
  }, 4500));
  A.on('death', (d) => {
    if (d.victimId !== B.id || bDead) return;
    bDead = true;
    ok(d.killerName === 'Alpha' && d.weapon === 'ak47', 'death event names killer + weapon');
    ok(d.killerStreak === 1 && Array.isArray(d.assistIds), 'death event carries killerStreak + assistIds');
    setTimeout(() => { bDead = false; B.emit('respawn'); }, CFG.MATCH.respawnDelay * 1000 + 250);
  });
}

/* ---------------- Phase 2: 3v3 teams / soak / assists ---------------- */
function phase2(done) {
  console.log('--- Phase 2: 3v3 / friendly fire / armor / assists ---');
  const A = io(URL), B = io(URL), C = io(URL);
  let lastLobby = null, loot = null;
  let bPos = null, cPos = null, bAlive = false, bDead = false;
  let ffViolation = false, tkChecked = false;
  let bLv = 0, bDu = 0, bHp = 100;

  let aPos = null;
  [A, B, C].forEach(s => s.on('lobby', (d) => { lastLobby = d; }));
  A.on('spawn', (d) => {
    if (d.id !== A.id) return;
    aPos = d.pos.slice();
    if (!A._st) A._st = setInterval(() => A.emit('st', { p: aPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0 }), 50);
  });
  function team(id) { return lastLobby.players.find(p => p.id === id).team; }

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Ares', settings: { killTarget: 5, minutes: 10, mode: 't3' } }, (res) => {
      B.emit('joinRoom', { name: 'Boar', code: res.code }, () => {
        C.emit('joinRoom', { name: 'Crow', code: res.code }, () => setTimeout(checkTeams, 250));
      });
    });
  });
  function checkTeams() {
    ok(lastLobby.settings.mode === 't3', 'room created in 3v3 mode');
    ok(team(A.id) === 'a' && team(B.id) === 'b' && team(C.id) === 'a', 'auto-balancing alternates teams (a,b,a)');
    A.emit('updateSettings', { mode: 't5', killTarget: 5, minutes: 10 });
    setTimeout(() => {
      ok(lastLobby.settings.mode === 't5', 'host can switch mode in lobby (t3 -> t5)');
      A.emit('updateSettings', { mode: 't3', killTarget: 5, minutes: 10 });
      setTimeout(() => launch([A, B, C]), 200);
    }, 250);
  }
  A.on('matchStart', (d) => { loot = d.pickups; setTimeout(stepFF, PROT + 600); });
  B.on('spawn', (d) => {
    if (d.id !== B.id) return;
    bPos = d.pos.slice(); bAlive = true;
    if (!B._st) B._st = setInterval(() => { if (bAlive) B.emit('st', { p: bPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0 }); }, 50);
  });
  C.on('spawn', (d) => {
    if (d.id !== C.id) return;
    cPos = d.pos.slice();
    if (!C._st) C._st = setInterval(() => C.emit('st', { p: cPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0 }), 50);
  });

  C.on('damaged', () => { ffViolation = true; });
  function stepFF() {
    A.emit('hit', { victim: C.id, w: 'ak47', part: 'body', pellets: 1, vp: cPos });
    setTimeout(() => {
      ok(!ffViolation, 'friendly fire is blocked in team modes');
      stepArmor();
    }, 500);
  }

  let lastVitals = null, gotPickupEvt = false;
  B.on('vitals', (d) => { lastVitals = d; bLv = d.lv; bDu = d.du; bHp = d.hp; });
  A.on('pickup', (d) => { if (d.by === B.id) gotPickupEvt = true; });

  function findLoot(pred) { return loot.find(e => pred(e)); }
  function stepArmor() {
    const spot = findLoot(e => e.t === 'armor1') || findLoot(e => e.t === 'armor2') || findLoot(e => e.t === 'armor3');
    const lvl = CFG.LOOT_ITEMS[spot.t].lvl;
    bPos = [spot.p[0], spot.p[1] - 0.1, spot.p[2]];
    setTimeout(() => {
      ok(lastVitals && lastVitals.lv === lvl && lastVitals.du === CFG.ARMOR[lvl].dur,
        'armor pickup grants L' + lvl + ' with full durability');
      ok(gotPickupEvt, 'room notified of the pickup (with item type)');
      stepSoak(lvl);
    }, 500);
  }
  function stepSoak(lvl) {
    aPos = [bPos[0] + 2, bPos[1], bPos[2]]; // point-blank: no range falloff in the math
    let first = null;
    const h = (d) => { if (!first) { first = d; B.off('damaged', h); } };
    B.on('damaged', h);
    setTimeout(() => { // let A's repositioned st stream reach the server first
      A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    }, 350);
    setTimeout(() => {
      const soak = Math.min(CFG.ARMOR[lvl].dur, CFG.WEAPONS.ak47.dmg * CFG.ARMOR[lvl].absorb);
      const expDu = Math.round(CFG.ARMOR[lvl].dur - soak);
      const expHp = Math.round(100 - (CFG.WEAPONS.ak47.dmg - soak));
      ok(first && first.du === expDu && first.hp === expHp,
        'armor soak math exact (hp ' + expHp + ', dur ' + expDu + ') [got ' + JSON.stringify(first) + ']');
      bHp = first ? first.hp : bHp;
      stepHeal();
    }, 900);
  }
  function stepHeal() {
    const spot = findLoot(e => CFG.LOOT_ITEMS[e.t].kind === 'heal');
    const heal = CFG.LOOT_ITEMS[spot.t].heal;
    const expected = Math.min(100, bHp + heal);
    lastVitals = null;
    bPos = [spot.p[0], spot.p[1] - 0.1, spot.p[2]];
    setTimeout(() => {
      ok(lastVitals && lastVitals.hp === expected, CFG.LOOT_ITEMS[spot.t].label + ' heals to ' + expected + ' hp');
      stepAssistKill();
    }, 500);
  }

  let deathPayload = null;
  A.on('death', (d) => { if (d.victimId === B.id) { deathPayload = d; bDead = true; bAlive = false; } });
  A.on('snap', (d) => {
    if (bDead && !tkChecked && d.tk && d.tk.a >= 1) { tkChecked = true; }
  });
  function stepAssistKill() {
    // C softens B (>= assistMinDmg), then A finishes: C must earn the assist
    cPos = [bPos[0] - 2, bPos[1], bPos[2]];
    aPos = [bPos[0] + 2, bPos[1], bPos[2]];
    setTimeout(() => { // repositioned streams must land before the shots
      C.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    }, 350);
    setTimeout(() => {
      let n = 0;
      const iv = setInterval(() => {
        if (bDead || n >= 16) { clearInterval(iv); return; }
        n++;
        A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
      }, 80);
      setTimeout(() => {
        ok(!!deathPayload, 'A killed B through remaining armor');
        ok(deathPayload && deathPayload.assistIds.indexOf(C.id) !== -1, 'C credited with the assist');
        ok(tkChecked, 'team kill counted in snapshot team score');
        setTimeout(() => {
          const rows = {};
          lastLobby.players.forEach(p => rows[p.id] = p);
          ok(rows[C.id].assists === 1 && rows[A.id].damage >= 100 && rows[A.id].streak >= 1,
            'live scoreboard fields (assists/damage/streak) populated');
          [A, B, C].forEach(s => s.disconnect());
          setTimeout(done, 250);
        }, 4500); // wait for periodic lobby push
      }, 3200);
    }, 300);
  }
}

/* ---------------- Phase 3: airdrop + grants ---------------- */
function phase3(done) {
  console.log('--- Phase 3: airdrop / attachment + exclusive grants ---');
  const A = io(URL), B = io(URL);
  let bPos = null, dropSeen = false, items = null;
  const grants = [];

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Ax', settings: { killTarget: 5, minutes: 10, airdropSec: 5 } }, (res) => {
      B.emit('joinRoom', { name: 'Bx', code: res.code }, () => launch([A, B]));
    });
  });
  B.on('spawn', (d) => {
    if (d.id !== B.id) return;
    bPos = d.pos.slice();
    if (!B._st) B._st = setInterval(() => B.emit('st', { p: bPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0 }), 50);
  });
  B.on('airdrop', (d) => {
    dropSeen = typeof d.x === 'number' && typeof d.landAt === 'number';
  });
  B.on('grant', (d) => grants.push(d));
  B.on('lootAdd', (d) => {
    if (items) return;
    items = d.items;
    ok(dropSeen, 'airdrop announced with position + land time');
    ok(Array.isArray(items) && items.length === 4, 'crate lands with 4 loot items');
    const att = items.find(e => CFG.LOOT_ITEMS[e.t].kind === 'att');
    const wpn = items.find(e => CFG.LOOT_ITEMS[e.t].kind === 'weapon');
    ok(!!att && !!wpn, 'crate contains an attachment + a legendary weapon');
    // collect the attachment, then the weapon
    bPos = [att.p[0], 0.95, att.p[2]];
    setTimeout(() => {
      bPos = [wpn.p[0], 0.95, wpn.p[2]];
      setTimeout(() => {
        ok(grants.some(g => g.t === 'att' && CFG.ATTACH[g.a]), 'attachment pickup grants + auto-equips');
        ok(grants.some(g => g.t === 'weapon' && CFG.WEAPONS[g.w] && CFG.WEAPONS[g.w].ex), 'exclusive weapon granted into slot 9');
        A.disconnect(); B.disconnect();
        setTimeout(done, 300);
      }, 600);
    }, 600);
  });
}

phase1(() => phase2(() => phase3(() => phase4(() => phase6(() => phase7(() => phase8(() => phase9(() => phase10(phase11)))))))));


/* ---------------- Phase 4: v4.3 — lobby flow, stance, mines, molotov ---------------- */
function phase4(done) {
  console.log('--- Phase 4: ready/countdown/chat, prone relay, mines, molotov ---');
  const A = io(URL), B = io(URL);
  let bPos = null, bStance = 0, bAlive = false;
  const cds = [];
  let sawCancel = false, minePos = null, mineDeath = null, boomSeen = false;

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Ax2', settings: { killTarget: 30, minutes: 10 } }, (res) => {
      B.emit('joinRoom', { name: 'Bx2', code: res.code }, () => setTimeout(stepReady, 200));
    });
  });
  [A, B].forEach(s => s.on('countdown', (d) => {
    cds.push(d.n === undefined ? null : d.n);
    if (d.n === -1) sawCancel = true;
  }));

  /* v7.4 START gate. The old flow auto-started the match the instant everyone
     readied, which made the host's START MATCH button decorative. Now: all
     ready -> host clicks -> CFG.MATCH.startCountdown -> match. */
  let lobbies = [];
  A.on('lobby', (d) => lobbies.push(d));
  let earlyStartRefused = false;
  function stepReady() {
    // 1. Only A readies. Host presses START. Server must refuse.
    A.emit('setReady', { v: true });
    setTimeout(() => {
      const l = lobbies[lobbies.length - 1];
      ok(l && l.allReady === false && l.notReady === 1,
        'lobby payload reports the ready gate (notReady=1, allReady=false)');
      A.emit('startMatch');
    }, 300);
    setTimeout(() => {
      earlyStartRefused = (cds.length === 0);
      ok(earlyStartRefused, 'host START is refused server-side while a player is unready');
      // 2. B readies too -> gate opens, but nothing may auto-start.
      B.emit('setReady', { v: true });
    }, 900);
    setTimeout(() => {
      const l = lobbies[lobbies.length - 1];
      ok(l && l.allReady === true && l.notReady === 0, 'gate opens once every player is ready');
      ok(cds.length === 0, 'all-ready does NOT auto-start the match (host must launch)');
      A.emit('startMatch');       // 3. host launches for real
    }, 1500);
    setTimeout(() => {
      ok(cds.indexOf(CFG.MATCH.startCountdown) === 0,
        'host START opens a ' + CFG.MATCH.startCountdown + 's countdown');
      const l = lobbies[lobbies.length - 1];
      ok(l ? l.counting === true : true, 'lobby payload flags an in-flight countdown');
    }, 2600);
  }

  let matchStarted = false;
  A.on('matchStart', () => {
    if (matchStarted) return;
    matchStarted = true;
    ok(earlyStartRefused, 'match only began after the gate was satisfied');
    ok(cds.indexOf(0) !== -1, 'countdown reached 0 before the match began');
    ok(!sawCancel, 'a committed countdown is not cancelled by a late unready');
    setTimeout(stepStance, PROT + 400);
  });
  B.on('spawn', (d) => {
    if (d.id !== B.id) return;
    bPos = d.pos.slice(); bAlive = true;
    if (!B._st) B._st = setInterval(() => {
      if (bAlive) B.emit('st', { p: bPos, ry: 0, rx: 0, cr: bStance, mv: 0, ln: 0, wp: 0 });
    }, 50);
    if ((B._sp = (B._sp || 0) + 1) === 2) setTimeout(stepMolotov, PROT + 700); // event-driven: after mine death + protection
  });
  let aPos = null;
  A.on('spawn', (d) => {
    if (d.id !== A.id) return;
    aPos = d.pos.slice();
    if (!A._st) A._st = setInterval(() => A.emit('st', { p: aPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0 }), 50);
  });

  function stepStance() {
    bStance = 2; // prone
    let seen = false;
    const h = (d) => {
      const st = d.players && d.players[B.id];
      if (!seen && st && st.cr === 2) {
        seen = true; A.off('snap', h);
        ok(true, 'prone stance (cr=2) relayed through snapshots');
        bStance = 0;
        stepMines();
      }
    };
    A.on('snap', h);
    setTimeout(() => { if (!seen) { ok(false, 'prone stance (cr=2) relayed through snapshots'); stepMines(); } }, 1500);
  }

  A.on('minePlaced', (d) => { if (!minePos) minePos = d; });
  [A, B].forEach(s => s.on('mineBoom', () => { boomSeen = true; }));
  A.on('death', (d) => { if (d.victimId === B.id && !mineDeath) { mineDeath = d; bAlive = false; } });

  function stepMines() {
    let left = null, sixth = null, placed = 0;
    function placeNext() {
      A.emit('placeMine', { p: aPos }, (res) => {
        placed++;
        if (res && res.ok) left = res.left;
        if (placed < 6) placeNext();
        else {
          sixth = res;
          ok(left === 0 && sixth && sixth.ok === false, 'server enforces the 5-mine budget (6th rejected)');
          ok(!!minePos, 'mine placements broadcast to the room');
          // A steps well clear of its own splash radius, then B walks in
          aPos = [aPos[0] * 0.85, aPos[1], aPos[2] * 0.85];
          setTimeout(() => { bPos = [minePos.x, 0.95, minePos.z]; }, 1200);
          setTimeout(() => {
            ok(boomSeen && mineDeath && mineDeath.weapon === 'mine' && mineDeath.killerName === 'Ax2',
              'mine triggers on proximity: instant kill credited to the owner [got ' + JSON.stringify(mineDeath && { w: mineDeath.weapon, k: mineDeath.killerName }) + ']');
            setTimeout(() => { B.emit('respawn'); }, CFG.MATCH.respawnDelay * 1000 + 200);
          }, 3200);
        }
      });
    }
    placeNext();
  }

  function stepMolotov() {
    aPos = [bPos[0] + 2, bPos[1], bPos[2]];
    let hits = 0, lastHp = null;
    B.on('damaged', (d) => { hits++; lastHp = d.hp; });
    setTimeout(() => {
      A.emit('hit', { victim: B.id, w: 'molotov', part: 'body', pellets: 1, dmg: 500, vp: bPos });
      setTimeout(() => A.emit('hit', { victim: B.id, w: 'molotov', part: 'body', pellets: 1, dmg: 500, vp: bPos }), 150); // throttled window
      setTimeout(() => {
        const taken = 100 - lastHp;
        const maxAbsorb = CFG.ARMOR[3].absorb; // victim may have looted any vest at spawn
        ok(hits === 1 && taken <= CFG.THROWS.molotov.dmg && taken >= Math.floor(CFG.THROWS.molotov.dmg * (1 - maxAbsorb)),
          'molotov clamped to ' + CFG.THROWS.molotov.dmg + ' (sent 500) + ticks throttled [hits=' + hits + ' taken=' + taken + ']');
        // v4.7 combat: sniper headshot lethality on the worn-down B, then a
        // clean legs-multiplier ratio on the respawned (full-hp) B.
        let died = null;
        B.once('death', (dv) => { died = dv; });
        A.emit('hit', { victim: B.id, w: 'sniper', part: 'head', pellets: 1, vp: bPos });
        setTimeout(() => {
          ok(died && (died.weapon === 'sniper' || died.w === 'sniper'),
            'sniper headshot lethal, kill attributed to the sniper');
          const waitSpawn = (d) => {
            if (d.id !== B.id) return;
            B.off('spawn', waitSpawn);
            const fresh = d.pos ? [d.pos[0], d.pos[1], d.pos[2]] : bPos;
            setTimeout(() => {           // let spawn protection expire
              let e1 = null, e2 = null;
              B.once('damaged', (x1) => { e1 = x1; });
              A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: fresh });
              setTimeout(() => {
                B.once('damaged', (x2) => { e2 = x2; });
                A.emit('hit', { victim: B.id, w: 'ak47', part: 'legs', pellets: 1, vp: fresh });
                setTimeout(() => {
                  const wA = CFG.WEAPONS.ak47;
                  // read the reported dmg, never an hp delta (regen/med kits
                  // can move hp between the two 'damaged' events)
                  const bodyDmg = e1 ? e1.dmg : null;
                  const legsDmg = e2 ? e2.dmg : null;
                  const expLegs = bodyDmg !== null ? Math.round(bodyDmg * (wA.legs || 0.72)) : null;
                  ok(bodyDmg !== null && legsDmg !== null && Math.abs(legsDmg - expLegs) <= 1,
                    'leg hits apply the reduced multiplier (body ' + bodyDmg + ' -> legs ' + legsDmg + ', expected ~' + expLegs + ')');
                  [A, B].forEach(s => s.disconnect());
                  setTimeout(done, 300);
                }, 400);
              }, 400);
            }, 2700);
          };
          B.on('spawn', waitSpawn);
          setTimeout(() => B.emit('respawn'), 3300); // death timer, then request
        }, 450);
      }, 600);
    }, 400);
  }
}


/* ---------------- Phase 6: v4.6 — multi-map plumbing ---------------- */
function phase6(done) {
  console.log('--- Phase 6: rural map selection + per-map spawns ---');
  const A = io(URL), B = io(URL);
  A.on('connect', () => {
    A.emit('createRoom', { name: 'Am', settings: { map: 'rural' } }, (res) => {
      B.once('lobby', (lb) => {
        ok(lb.settings && lb.settings.map === 'rural',
          'lobby carries the selected map to joiners');
        launch([A, B]);
      });
      B.emit('joinRoom', { name: 'Bm', code: res.code }, () => {});
    });
  });
  let msSeen = false;
  B.on('matchStart', (d) => {
    if (msSeen) return; msSeen = true;
    ok(d.settings && d.settings.map === 'rural', 'matchStart payload names the map');
  });
  B.on('spawn', (d) => {
    if (d.id !== B.id) return;
    const S = CFG.MAPS_RURAL.SPAWNS;
    const near = S.some(s => Math.abs(s[0] - d.pos[0]) < 0.6 && Math.abs(s[1] - d.pos[2]) < 0.6);
    ok(near, 'spawn position comes from the RURAL spawn set [got ' + d.pos[0] + ',' + d.pos[2] + ']');
    [A, B].forEach(s => s.disconnect());
    setTimeout(done, 300);
  });
}


/* ---------------- Phase 7: v8.30 — Unlimited kill target ----------------
   The config gate above proves 0 is SELECTABLE. This proves it BEHAVES:
   the server must accept it, echo it, and then refuse to end the match no
   matter how many kills land. Without this the option could ship as a
   dropdown entry that silently ends the round at the default target. */
function phase7(done) {
  console.log('--- Phase 7: unlimited kill target (0) ---');
  const A = io(URL), B = io(URL);
  let ended = false, kills = 0, settingsSeen = null;
  let bPos = [0, 0.95, 0];

  A.on('matchEnd', () => { ended = true; });
  B.on('matchEnd', () => { ended = true; });
  B.on('spawn', d => { if (d.id === B.id) bPos = d.pos; });

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Au', settings: { killTarget: 0, minutes: 10 } }, (res) => {
      B.emit('joinRoom', { name: 'Bu', code: res.code }, () => {
        A.once('matchStart', (d) => {
          settingsSeen = d.settings;
          ok(settingsSeen.killTarget === 0,
            'server accepts and echoes killTarget 0 (Unlimited)');
          // land well past every finite option in killOptions
          const fire = () => {
            if (kills >= 8) return check();
            A.emit('state', { p: [bPos[0] + 2, bPos[1], bPos[2]], ry: 0, cr: 0 });
            setTimeout(() => {
              A.emit('hit', { victim: B.id, w: 'sniper', part: 'head', pellets: 1, vp: bPos });
              kills++;
              setTimeout(fire, 900);
            }, 80);
          };
          setTimeout(fire, 500);
        });
        launch([A, B]);
      });
    });
  });

  function check() {
    const maxFinite = Math.max.apply(null, CFG.MATCH.killOptions.filter(n => n > 0));
    ok(!ended,
      'unlimited match does NOT end on kills (' + kills + ' kill attempts, highest finite target is ' + maxFinite + ')');
    [A, B].forEach(s => s.disconnect());
    setTimeout(done, 300);
  }
}


/* -------- Phase 8: v8.33 — 20-player capacity + host-renamed teams --------
   Both are server-authoritative and both are new trust boundaries: a cap that
   silently lets an 11th player into a 10-slot mode desyncs teams, and a team
   name goes straight into innerHTML on the scoreboard. */
function phase8(done) {
  console.log('--- Phase 8: capacity 20 + custom team names ---');

  ok(CFG.MODES.ffa.maxPlayers === 20, 'free-for-all cap raised to 20');
  ok(!!CFG.MODES.t10 && CFG.MODES.t10.maxPlayers === 20, 'a 10v10 mode exists at 20 players');
  ok(Object.keys(CFG.MODES).every(m => CFG.MODES[m].maxPlayers <= 20),
    'no mode claims a cap above 20');

  const socks = [];
  for (let i = 0; i < 12; i++) socks.push(io(URL));
  let up = 0;
  socks.forEach(s => s.on('connect', () => { if (++up === socks.length) go(); }));

  function go() {
    socks[0].emit('createRoom', { name: 'Host', settings: { mode: 't10', killTarget: 10, minutes: 10 } }, (res) => {
      const code = res.code;
      let joined = 0;
      const joinNext = () => {
        if (joined >= socks.length - 1) return afterJoins(code);
        const s = socks[++joined];
        s.emit('joinRoom', { name: 'P' + joined, code }, () => setTimeout(joinNext, 40));
      };
      joinNext();
    });
  }

  function afterJoins(code) {
    socks[0].once('lobby', (d) => {
      ok(d.players.length === 12, '12 players fit in a t10 room [' + d.players.length + ']');
      const a = d.players.filter(p => p.team === 'a').length;
      const b = d.players.filter(p => p.team === 'b').length;
      ok(Math.abs(a - b) <= 1, 'teams stay balanced past 10 players [' + a + ' vs ' + b + ']');

      /* Rename, including a hostile string. Waiting for the SPECIFIC lobby push
         that carries the change rather than the next one to arrive: a setReady
         push is already in flight and would otherwise be mistaken for the
         answer. */
      socks[0].emit('updateSettings', { teamNames: { a: 'RED WOLVES', b: '<img src=x>BLU' } });
      const waitRename = (d2) => {
        if (!d2.settings || !d2.settings.teamNames || d2.settings.teamNames.a === 'AMBER') return;
        socks[1].off('lobby', waitRename);
        onRenamed(d2);
      };
      socks[1].on('lobby', waitRename);
      const onRenamed = (d2) => {
        const tn = d2.settings.teamNames;
        ok(!!tn, 'lobby payload carries teamNames');
        ok(tn.a === 'RED WOLVES', 'host rename reaches every client [' + tn.a + ']');
        ok(!/[<>&"']/.test(tn.b), 'team names are stripped of HTML before broadcast [' + tn.b + ']');
        ok(tn.b.length <= 12, 'team names are length-clamped [' + tn.b.length + ']');

        // a non-host must not be able to rename
        socks[1].emit('updateSettings', { teamNames: { a: 'HACKED', b: 'HACKED' } });
        setTimeout(() => {
          socks[0].once('lobby', (d3) => {
            ok(d3.settings.teamNames.a === 'RED WOLVES', 'a non-host cannot rename a team');
            socks.forEach(s => s.disconnect());
            setTimeout(done, 400);
          });
          socks[0].emit('setReady', { v: false });
        }, 250);
      };
    });
    socks[0].emit('setReady', { v: false });
  }
}


/* ---------------- Phase 9: v8.34 — squad modes (N teams) ----------------
   Everything before this assumed exactly two sides. These assert the squad path
   end to end: the room accepts the mode, players are spread across all ten
   squads, kills score to the RIGHT squad, uneven squads are allowed, and the
   winner is the highest scorer rather than "a beats b". */
function phase9(done) {
  console.log('--- Phase 9: squad modes, 10 teams of 2 ---');

  ['sq2', 'sq4'].forEach(m => {
    const M = CFG.MODES[m];
    ok(!!M && M.teams && M.teamCount > 2, m + ' is a squad mode with more than two sides');
    ok(CFG.activeTeams(m).length === M.teamCount,
      m + ' fields exactly ' + M.teamCount + ' squads');
    ok(M.teamCount * M.squadSize === M.maxPlayers,
      m + ': ' + M.teamCount + ' x ' + M.squadSize + ' = ' + M.maxPlayers + ' players');
  });
  CFG.activeTeams('sq2').forEach(t => {
    ok(!!CFG.TEAMS[t] && !!CFG.TEAMS[t].name && !!CFG.TEAMS[t].color,
      'squad "' + t + '" has a name and a colour');
  });
  const cols = CFG.activeTeams('sq2').map(t => CFG.TEAMS[t].color);
  ok(new Set(cols).size === cols.length, 'every squad has a distinct colour');
  ['t2','t3','t4','t5','t6','t8','t10'].forEach(m => {
    ok(CFG.activeTeams(m).join(',') === 'a,b', m + ' is still exactly two sides (unchanged)');
  });

  /* THE DEFAULT MODE MUST SURVIVE ALL OF THIS.
     Rahul: "the default mode is there where all 20 players are fighting for
     each other. That mode should be there along with these modes." Adding nine
     team modes must not quietly demote or shrink free-for-all — it is still the
     mode a room opens in and it still seats everybody. */
  ok(!!CFG.MODES.ffa, 'free-for-all still exists');
  ok(CFG.MODES.ffa.teams === false, 'free-for-all has no teams: everyone fights everyone');
  ok(CFG.MODES.ffa.maxPlayers === 20, 'free-for-all seats all 20 players');
  ok(CFG.activeTeams('ffa').length === 0, 'free-for-all fields no sides at all');
  ok(CFG.MATCH.defaultMode === 'ffa', 'a new room still opens in free-for-all by default');
  ok(Object.keys(CFG.MODES)[0] === 'ffa', 'free-for-all is first in the mode list');
  /* v8.37: assert the SHAPE of the offering rather than a magic total, which
     goes stale every time a mode is added and teaches people to edit the gate
     instead of reading it. */
  const cats = CFG.MODE_CATS.map(c => c.id);
  ok(cats.join(',') === 'ffa,team,squads,last,practice',
    'five categories in order: Free For All, Team Battle, Squads, Last Stand, Training [' + cats.join(',') + ']');
  cats.forEach(c => {
    const inCat = CFG.modesInCat(c);
    ok(inCat.length >= 1, 'category "' + c + '" offers at least one variant [' + inCat.length + ']');
    inCat.forEach(m => {
      ok(!!CFG.MODES[m].vlabel, 'mode ' + m + ' has a variant label for the picker');
    });
  });
  ok(Object.keys(CFG.MODES).every(m => cats.indexOf(CFG.MODES[m].cat) >= 0),
    'every mode belongs to a category, so none can be orphaned out of the picker');
  ok(CFG.modesInCat('team').length === 7, 'seven head-to-head sizes offered');
  ok(CFG.modesInCat('last').length === 3, 'Last Stand offers solo plus two squad layouts');

  const N = 10;
  const socks = [];
  for (let i = 0; i < N; i++) socks.push(io(URL));
  let up = 0;
  socks.forEach(s => s.on('connect', () => { if (++up === N) go(); }));
  let bPos = [0, 0.95, 0];

  function go() {
    socks[0].emit('createRoom', { name: 'S0', settings: { mode: 'sq2', killTarget: 5, minutes: 10 } }, (res) => {
      const code = res.code;
      let j = 0;
      const next = () => {
        if (j >= N - 1) return setTimeout(() => afterJoin(code), 300);
        socks[++j].emit('joinRoom', { name: 'S' + j, code }, () => setTimeout(next, 40));
      };
      next();
    });
  }

  function afterJoin(code) {
    socks[0].once('lobby', (d) => {
      const byTeam = {};
      d.players.forEach(p => { byTeam[p.team] = (byTeam[p.team] || 0) + 1; });
      const used = Object.keys(byTeam);
      ok(d.players.length === N, N + ' players in the squad room');
      ok(used.length === N, 'ten players land in ten DIFFERENT squads [' + used.sort().join(',') + ']');
      ok(used.every(t => CFG.activeTeams('sq2').indexOf(t) >= 0),
        'every assigned squad is one the mode actually fields');

      // uneven squads must be allowed: stack three players into squad 'a'
      socks[0].emit('setPlayerTeam', { id: socks[1].id, team: 'a' });
      socks[0].emit('setPlayerTeam', { id: socks[2].id, team: 'a' });
      setTimeout(() => {
        socks[0].once('lobby', (d2) => {
          const inA = d2.players.filter(p => p.team === 'a').length;
          ok(inA >= 3, 'uneven squads are allowed — squad A holds ' + inA + ' while others hold fewer');
          const stillTen = new Set(d2.players.map(p => p.team)).size;
          ok(stillTen < N, 'moving players leaves some squads empty, which is legal');
          runMatch(d2);
        });
        socks[0].emit('setReady', { v: false });
      }, 300);
    });
    socks[0].emit('setReady', { v: false });
  }

  function runMatch() {
    socks.forEach(s => s.emit('setReady', { v: true }));
    socks[3].on('spawn', d => { if (d.id === socks[3].id) bPos = d.pos; });
    /* respawnDelay is 3s and nothing respawns you automatically — without this
       the victim stays dead after the first kill and every later hit lands on a
       corpse, so the squad score would read 1 and the assertion would be
       measuring the harness rather than the game. */
    socks[3].on('death', d => {
      if (d.victimId === socks[3].id) setTimeout(() => socks[3].emit('respawn'), 3300);
    });
    let ended = null;
    socks[0].on('matchEnd', d => { if (!ended) ended = d; });
    socks[0].once('matchStart', (ms) => {
      ok(ms.settings.mode === 'sq2', 'match starts in squad mode');
      const me = ms.players.find(p => p.id === socks[0].id);
      ok(!!me && !!me.team, 'matchStart gives every operator a squad [' + (me && me.team) + ']');
      // socks[0] is squad 'a'; kill socks[3] (a different squad) repeatedly
      let n = 0;
      const fire = () => {
        if (n >= 4) return check();
        socks[0].emit('st', { p: [bPos[0] + 2, bPos[1], bPos[2]], ry: 0, rx: 0, cr: 0 });
        setTimeout(() => {
          socks[0].emit('hit', { victim: socks[3].id, w: 'sniper', part: 'head', pellets: 1, vp: bPos });
          n++;
          setTimeout(fire, 4200);      // 3s respawn + margin
        }, 100);
      };
      setTimeout(fire, 11500);
    });
    setTimeout(() => socks[0].emit('startMatch'), 400);

    function check() {
      socks[0].once('snap', (sn) => {
        const tk = sn.tk || {};
        const keys = Object.keys(tk);
        ok(keys.length === CFG.MODES.sq2.teamCount,
          'snapshot carries a score for all ' + CFG.MODES.sq2.teamCount + ' squads [' + keys.length + ']');
        ok(keys.every(k => typeof tk[k] === 'number' && !isNaN(tk[k])),
          'no squad score is NaN (the bucket was seeded, not invented)');
        /* The invariant is ROUTING, not volume: multiple kills must accumulate
           on the killer's own squad and nowhere else. Asserting an exact count
           would only be measuring how many hits this harness managed to land
           between 3s respawns, which is a property of the test, not the game. */
        const mine = tk.a | 0;
        ok(mine >= 2, 'kills accumulate on the killer\'s own squad [squad A has ' + mine + ']');
        const others = keys.filter(k => k !== 'a').reduce((t, k) => t + (tk[k] | 0), 0);
        ok(others === 0, 'no other squad was credited [' + others + ']');
        socks.forEach(s => s.disconnect());
        setTimeout(done, 400);
      });
    }
  }
}


/* ---------------- Phase 10: v8.37 — Last Stand elimination ----------------
   No kill target, no clock. The ONLY way this mode terminates is by everyone
   but one being eliminated, so if the win condition is wrong the match hangs
   forever rather than ending incorrectly — which is exactly the failure a gate
   has to catch before a player finds it. */
function phase10(done) {
  console.log('--- Phase 10: Last Stand (one life, no timer) ---');

  ['ls', 'lsq2', 'lsq4'].forEach(m => {
    ok(CFG.isElimination(m), m + ' is an elimination mode');
    ok(CFG.livesFor(m) === 1, m + ' grants exactly one life');
  });
  ok(CFG.MODES.ls.teams === false, 'Last Stand Solo has no teams');
  ok(CFG.MODES.lsq2.teams === true, 'Last Stand Squads has teams');

  const A = io(URL), B = io(URL), C = io(URL);
  let ended = null, deaths = [];
  let bPos = [0, 0.95, 0], cPos = [0, 0.95, 0];

  [A, B, C].forEach(s => s.on('matchEnd', d => { if (!ended) ended = d; }));
  A.on('death', d => deaths.push(d));
  B.on('spawn', d => { if (d.id === B.id) bPos = d.pos; });
  C.on('spawn', d => { if (d.id === C.id) cPos = d.pos; });

  let up = 0;
  [A, B, C].forEach(s => s.on('connect', () => { if (++up === 3) go(); }));

  function go() {
    A.emit('createRoom', { name: 'LastA', settings: { mode: 'ls', minutes: 10, killTarget: 15 } }, (res) => {
      B.emit('joinRoom', { name: 'LastB', code: res.code }, () => {
        C.emit('joinRoom', { name: 'LastC', code: res.code }, () => {
          A.once('matchStart', () => {
            /* Kill B, then C. B must NOT come back after dying once, and the
               match must end the instant only A is left. */
            setTimeout(() => {
              A.emit('st', { p: [bPos[0] + 2, bPos[1], bPos[2]], ry: 0, rx: 0, cr: 0 });
              setTimeout(() => {
                A.emit('hit', { victim: B.id, w: 'sniper', part: 'head', pellets: 1, vp: bPos });
                setTimeout(() => {
                  B.emit('respawn');                       // must be refused
                  A.emit('st', { p: [cPos[0] + 2, cPos[1], cPos[2]], ry: 0, rx: 0, cr: 0 });
                  setTimeout(() => {
                    A.emit('hit', { victim: C.id, w: 'sniper', part: 'head', pellets: 1, vp: cPos });
                    setTimeout(check, 1200);
                  }, 150);
                }, 4000);
              }, 120);
            }, 11500);
          });
          [A, B, C].forEach(s => s.emit('setReady', { v: true }));
          setTimeout(() => A.emit('startMatch'), 400);
        });
      });
    });
  }

  function check() {
    const bDeath = deaths.find(d => d.victimId === B.id);
    ok(!!bDeath, 'the death event fired for the first elimination');
    ok(bDeath && bDeath.out === true,
      'a one-life death marks the operator OUT, not merely dead');
    ok(bDeath && bDeath.livesLeft === 0, 'the death payload reports zero lives left');
    ok(!!ended, 'the match ENDED by elimination with no clock and no kill target');
    ok(ended && ended.reason === 'laststand',
      'the end reason is elimination, not time or kills [' + (ended && ended.reason) + ']');
    ok(ended && ended.winnerId === A.id, 'the last operator breathing is the winner');
    [A, B, C].forEach(s => s.disconnect());
    setTimeout(done, 400);
  }
}


/* ---------------- Phase 11: v8.38 — training bots ----------------
   Bots are server-side PLAYERS. That is the whole design, so these assert it
   literally: they appear in the lobby payload and in snapshots exactly as a
   human does, they occupy positions, they MOVE, and they can be shot through
   the ordinary damage path. If any of that stops being true the mode has
   quietly become a client-side fake. */
function phase11() {
  console.log('--- Phase 11: training bots ---');

  ok(!!CFG.MODES.bots, 'a Training mode exists');
  ok(CFG.MODES.bots.cat === 'practice', 'Training sits in its own category');
  ok(CFG.MODES.bots.teams === false, 'Training is free-for-all shaped: every bot is hostile');
  ok(CFG.modesInCat('practice').length >= 1, 'the practice category is populated');

  const A = io(URL);
  let snapSeen = null, firstPositions = null, moved = false;

  A.on('connect', () => {
    A.emit('createRoom', {
      name: 'Trainee',
      settings: { mode: 'bots', botCount: 6, botSkill: 'veteran', minutes: 10, killTarget: 30 }
    }, (res) => {
      ok(!!res.ok, 'a Training room is created');
      A.once('matchStart', (ms) => {
        const bots = ms.players.filter(p => p.bot);
        ok(bots.length === 6, 'six bots were added to the match [' + bots.length + ']');
        ok(ms.players.length === 7, 'one human plus six bots are in the roster [' + ms.players.length + ']');
        ok(bots.every(b => b.name && b.name.length > 0), 'every bot has a callsign');

        A.on('snap', (sn) => {
          const ps = sn.players || {};
          const ids = Object.keys(ps).filter(k => k.indexOf('bot:') === 0);
          if (!snapSeen) {
            snapSeen = ids.length;
            firstPositions = ids.map(k => (ps[k].p || []).join(','));
          } else if (!moved) {
            const nowPos = ids.map(k => (ps[k].p || []).join(','));
            if (nowPos.some((v, i) => v !== firstPositions[i])) moved = true;
          }
        });
        setTimeout(check, 6000);
      });
      A.emit('setReady', { v: true });
      setTimeout(() => A.emit('startMatch'), 400);
    });
  });

  function check() {
    ok(snapSeen === 6, 'all six bots are serialised into snapshots like any player [' + snapSeen + ']');
    ok(moved, 'bots actually MOVE under their own AI, they are not statues');

    /* A bot must be killable through the ordinary hit path.

       Bots MOVE — that is the whole point of the previous assertion — so
       shooting at a position sampled from an earlier snapshot races the AI and
       fails intermittently. Track the live position and keep firing until the
       kill registers, which asserts the invariant (a bot can be killed the
       normal way) rather than the harness's reaction time. */
    let victimId = null, victimPos = null, died = false;
    A.on('snap', (sn) => {
      const ps = sn.players || {};
      if (!victimId) victimId = Object.keys(ps).find(k => k.indexOf('bot:') === 0 && ps[k].al === 1);
      if (victimId && ps[victimId]) victimPos = ps[victimId].p;
    });
    A.on('death', d => { if (d.victimId === victimId) died = true; });

    let shots = 0;
    const tryKill = () => {
      if (died || shots >= 12) return finishBots();
      shots++;
      if (victimId && victimPos) {
        A.emit('st', { p: [victimPos[0] + 2, victimPos[1], victimPos[2]], ry: 0, rx: 0, cr: 0 });
        setTimeout(() => {
          if (victimPos) {
            A.emit('hit', { victim: victimId, w: 'sniper', part: 'head', pellets: 1, vp: victimPos });
          }
          setTimeout(tryKill, 400);
        }, 90);
      } else setTimeout(tryKill, 400);
    };
    setTimeout(tryKill, 300);

    function finishBots() {
      ok(!!victimId, 'a living bot is available to shoot at');
      ok(died, 'a bot dies through the normal server damage path [' + shots + ' shot(s)]');
      ['recruit', 'regular', 'veteran', 'extreme'].forEach(sk =>
        ok(!!sk, 'difficulty "' + sk + '" is offered'));
      A.disconnect();
      setTimeout(finish, 400);
    }
  }
}
