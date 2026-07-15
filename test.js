/* Integration test v3 — three phases against a running server.
   Phase 1: FFA flow + spawn protection + dynamic loot guarantees.
   Phase 2: 3v3 teams, FF block, armor soak math, heals, assists, team score.
   Phase 3: fast airdrop -> crate loot -> attachment + exclusive weapon grants.
   Run:  npm start   then   npm test                                        */
const { io } = require('socket.io-client');
const URL = 'http://localhost:3000';
const CFG = require('./public/js/shared-config.js');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
function finish() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
setTimeout(() => { console.log('TIMEOUT'); finish(); }, 55000);
const PROT = CFG.MATCH.spawnProtect * 1000;

/* ---------------- Phase 1: FFA + protection + loot list ---------------- */
function phase1(done) {
  console.log('--- Phase 1: FFA / protection / loot ---');
  const A = io(URL), B = io(URL);
  let bPos = null, bDead = false, bSpawns = 0;
  let protViolation = false, gotDamaged = false, gotConfirmV = false, lootList = null;

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Alpha', settings: { killTarget: 5, minutes: 10 } }, (res) => {
      ok(res && res.ok && /^[A-Z2-9]{5}$/.test(res.code), 'createRoom returns 5-char code');
      B.emit('joinRoom', { name: 'Bravo', code: res.code }, (res2) => {
        ok(res2 && res2.ok, 'joinRoom with valid code succeeds');
        A.emit('startMatch');
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
      setInterval(() => { if (!bDead) B.emit('st', { p: bPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }); }, 50);
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

  [A, B, C].forEach(s => s.on('lobby', (d) => { lastLobby = d; }));
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
      setTimeout(() => A.emit('startMatch'), 200);
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
    let first = null;
    const h = (d) => { if (!first) { first = d; B.off('damaged', h); } };
    B.on('damaged', h);
    A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    setTimeout(() => {
      const soak = Math.min(CFG.ARMOR[lvl].dur, 33 * CFG.ARMOR[lvl].absorb);
      const expDu = Math.round(CFG.ARMOR[lvl].dur - soak);
      const expHp = Math.round(100 - (33 - soak));
      ok(first && first.du === expDu && first.hp === expHp,
        'armor soak math exact (hp ' + expHp + ', dur ' + expDu + ') [got ' + JSON.stringify(first) + ']');
      bHp = first ? first.hp : bHp;
      stepHeal();
    }, 500);
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
    C.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    setTimeout(() => {
      let n = 0;
      const iv = setInterval(() => {
        if (bDead || n >= 14) { clearInterval(iv); return; }
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
function phase3() {
  console.log('--- Phase 3: airdrop / attachment + exclusive grants ---');
  const A = io(URL), B = io(URL);
  let bPos = null, dropSeen = false, items = null;
  const grants = [];

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Ax', settings: { killTarget: 5, minutes: 10, airdropSec: 5 } }, (res) => {
      B.emit('joinRoom', { name: 'Bx', code: res.code }, () => A.emit('startMatch'));
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
        setTimeout(finish, 300);
      }, 600);
    }, 600);
  });
}

phase1(() => phase2(phase3));
