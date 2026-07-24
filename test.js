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
setTimeout(() => { console.log('TIMEOUT'); finish(); }, 90000);
const PROT = CFG.MATCH.spawnProtect * 1000;

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
  setTimeout(() => {
    if (!wpRelayed) { wpRelayed = true; ok(false, 'snapshot relays equipped weapon index (wp=9) for remote weapon models'); }
  }, 4500);
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
        setTimeout(done, 300);
      }, 600);
    }, 600);
  });
}

phase1(() => phase2(() => phase3(() => phase4(() => phase5(phase6)))));


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

  function stepReady() {
    A.emit('setReady', { v: true });
    B.emit('setReady', { v: true });
    // cancel mid-count, then re-ready — countdown must restart cleanly
    setTimeout(() => B.emit('setReady', { v: false }), 1400);
    setTimeout(() => {
      ok(sawCancel, 'unreadying cancels the countdown');
      B.emit('setReady', { v: true });
    }, 2000);
  }

  let matchStarted = false;
  A.on('matchStart', () => {
    if (matchStarted) return;
    matchStarted = true;
    ok(cds.filter(n => n === 5).length >= 1 && cds.indexOf(0) !== -1,
      'all-ready countdown ran 5..0 and auto-started the match (no host click)');
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
                  const bodyDmg = e1 ? (100 - e1.hp) : null;
                  const legsDmg = (e1 && e2) ? (e1.hp - e2.hp) : null;
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


/* ---------------- Phase 5: v4.5 — voice signaling relay ---------------- */
function phase5(done) {
  console.log('--- Phase 5: voice signaling (room-scoped, opt-in gated) ---');
  const A = io(URL), B = io(URL), D = io(URL), C = io(URL);
  let leaks = 0, legit = null, peerJoinSeen = null, peerLeaveSeen = null;

  A.on('voiceSignal', (d) => {
    if (d && d.data && d.data.x === 1) legit = d;
    else leaks++;
  });
  A.on('voicePeerJoin', (d) => { peerJoinSeen = d.id; });
  A.on('voicePeerLeave', (d) => { peerLeaveSeen = d.id; });

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Av', settings: {} }, (res) => {
      const code = res.code;
      B.emit('joinRoom', { name: 'Bv', code }, () => {
        D.emit('joinRoom', { name: 'Dv', code }, () => {
          C.emit('createRoom', { name: 'Cv', settings: {} }, () => {
            C.emit('voiceJoin');
            step1();
          });
        });
      });
    });
  });

  function step1() {
    A.emit('voiceJoin');
    A.once('voicePeers', (d) => {
      ok(Array.isArray(d.ids) && d.ids.length === 0, 'first voice joiner receives an empty peer list');
      step2();
    });
  }
  function step2() {
    B.emit('voiceJoin');
    B.once('voicePeers', (d) => {
      ok(d.ids.length === 1 && d.ids[0] === A.id, 'second joiner receives the existing peer to initiate toward');
      setTimeout(() => {
        ok(peerJoinSeen === B.id, 'existing member is notified of the new voice peer');
        step3();
      }, 250);
    });
  }
  function step3() {
    B.emit('voiceSignal', { to: A.id, data: { x: 1 } });
    D.emit('voiceSignal', { to: A.id, data: { x: 9 } });   // same room, never opted in
    C.emit('voiceSignal', { to: A.id, data: { x: 7 } });   // different room entirely
    setTimeout(() => {
      ok(legit && legit.from === B.id && legit.data.x === 1, 'signal relayed with correct sender identity');
      ok(leaks === 0, 'non-opted-in and cross-room signals are both dropped (' + leaks + ' leaks)');
      step4();
    }, 500);
  }
  function step4() {
    const bId = B.id; // socket.id nulls on disconnect — capture before
    B.disconnect();
    setTimeout(() => {
      ok(peerLeaveSeen === bId, 'disconnect broadcasts voicePeerLeave to the mesh');
      A.emit('voiceLeave');
      A.emit('voiceJoin');
      A.once('voicePeers', (d2) => {
        ok(Array.isArray(d2.ids) && d2.ids.length === 0, 'voice rejoin yields a fresh, correct peer list');
        [A, C, D].forEach(s => s.disconnect());
        setTimeout(done, 300);
      });
    }, 500);
  }
}


/* ---------------- Phase 6: v4.6 — multi-map plumbing ---------------- */
function phase6() {
  console.log('--- Phase 6: rural map selection + per-map spawns ---');
  const A = io(URL), B = io(URL);
  A.on('connect', () => {
    A.emit('createRoom', { name: 'Am', settings: { map: 'rural' } }, (res) => {
      B.once('lobby', (lb) => {
        ok(lb.settings && lb.settings.map === 'rural',
          'lobby carries the selected map to joiners');
        A.emit('startMatch');
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
    setTimeout(finish, 300);
  });
}
