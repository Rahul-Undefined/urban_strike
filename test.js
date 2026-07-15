/* Integration test v2 — two phases against a running server.
   Phase 1: FFA room flow, validated damage, death, respawn (v1 behavior kept).
   Phase 2: 3v3 teams, auto-balancing, mode switch, friendly-fire block,
            armor pickup + durability soak math, health pickup, team scoring.
   Run:  npm start   then in another terminal   npm test               */
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
setTimeout(() => { console.log('TIMEOUT'); finish(); }, 40000);

/* ---------------- Phase 1: FFA ---------------- */
function phase1(done) {
  console.log('--- Phase 1: FFA ---');
  const A = io(URL), B = io(URL);
  let bPos = null, bDead = false, bSpawns = 0, shots = 0;
  let gotDamaged = false, gotConfirm = false;

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
    ok(d.settings.killTarget === 5 && d.settings.mode === 'ffa', 'matchStart carries settings incl. mode');
    ok(Array.isArray(d.pickups) && d.pickups.length === CFG.PICKUP_SPOTS.length, 'matchStart lists all ' + CFG.PICKUP_SPOTS.length + ' pickups');
  });
  B.on('spawn', (d) => {
    if (d.id !== B.id) return;
    bSpawns++;
    bPos = d.pos.slice();
    if (bSpawns === 1) {
      ok(Array.isArray(d.pos) && d.pos.length === 3, 'spawn event has [x,y,z]');
      setInterval(() => { if (!bDead) B.emit('st', { p: bPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }); }, 50);
      setTimeout(shoot, 400);
    }
    if (bSpawns === 2) {
      ok(true, 'B respawned after death');
      A.disconnect(); B.disconnect();
      setTimeout(done, 200);
    }
  });
  function shoot() {
    if (shots >= 12 || bDead) return;
    shots++;
    A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    setTimeout(shoot, 80);
  }
  B.on('damaged', (d) => {
    if (!gotDamaged) { gotDamaged = true; ok(typeof d.hp === 'number' && d.hp < 100, 'victim receives damaged with reduced hp'); }
  });
  A.on('hitConfirm', (d) => {
    if (!gotConfirm) { gotConfirm = true; ok(d.dmg > 0, 'shooter receives hitConfirm'); }
  });
  A.on('death', (d) => {
    if (d.victimId !== B.id || bDead) return;
    bDead = true;
    ok(d.killerName === 'Alpha' && d.weapon === 'ak47', 'death event names killer + weapon');
    B.emit('respawn'); // early — must be rejected
    setTimeout(() => { bDead = false; B.emit('respawn'); }, CFG.MATCH.respawnDelay * 1000 + 250);
  });
}

/* ---------------- Phase 2: 3v3 teams ---------------- */
function phase2() {
  console.log('--- Phase 2: 3v3 teams ---');
  const A = io(URL), B = io(URL), C = io(URL);
  let code = null, lastLobby = null;
  let bPos = null, cPos = null, bAlive = false;
  let sawModeT5 = false, teamAssertDone = false;
  let ffViolation = false, soakChecked = false, healthChecked = false, tkChecked = false, bDead = false;

  [A, B, C].forEach(s => s.on('lobby', (d) => { lastLobby = d; }));

  A.on('connect', () => {
    A.emit('createRoom', { name: 'Ares', settings: { killTarget: 5, minutes: 10, mode: 't3' } }, (res) => {
      code = res.code;
      B.emit('joinRoom', { name: 'Boar', code }, () => {
        C.emit('joinRoom', { name: 'Crow', code }, () => {
          setTimeout(step_checkTeams, 250);
        });
      });
    });
  });

  function team(id) { return lastLobby.players.find(p => p.id === id).team; }

  function step_checkTeams() {
    ok(lastLobby && lastLobby.settings.mode === 't3', 'room created in 3v3 mode');
    ok(team(A.id) === 'a' && team(B.id) === 'b' && team(C.id) === 'a', 'auto-balancing alternates teams (a,b,a)');
    const cols = lastLobby.players.map(p => p.color);
    ok(cols[0] === CFG.TEAMS.a.color && cols[1] === CFG.TEAMS.b.color, 'players carry team colors');
    teamAssertDone = true;
    A.emit('updateSettings', { mode: 't5', killTarget: 5, minutes: 10 });
    setTimeout(step_checkModeSwitch, 250);
  }
  function step_checkModeSwitch() {
    sawModeT5 = lastLobby.settings.mode === 't5';
    ok(sawModeT5, 'host can switch mode in lobby (t3 -> t5)');
    A.emit('updateSettings', { mode: 't3', killTarget: 5, minutes: 10 });
    setTimeout(() => A.emit('startMatch'), 200);
  }

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
  A.on('matchStart', () => setTimeout(step_friendlyFire, 500));

  C.on('damaged', () => { ffViolation = true; });
  function step_friendlyFire() {
    // A (team a) shoots teammate C (team a) with a valid claimed position
    A.emit('hit', { victim: C.id, w: 'ak47', part: 'body', pellets: 1, vp: cPos });
    setTimeout(() => {
      ok(!ffViolation, 'friendly fire is blocked in team modes');
      step_armorPickup();
    }, 500);
  }

  let gotVitals = null, gotPickupEvt = false;
  B.on('vitals', (d) => { gotVitals = d; });
  A.on('pickup', (d) => { if (d.by === B.id) gotPickupEvt = true; });
  function step_armorPickup() {
    const spot = CFG.PICKUP_SPOTS.find(s => s[0] === 'armor1');
    bPos = [spot[1], 0.95, spot[3]]; // teleport onto the vest
    setTimeout(() => {
      ok(gotVitals && gotVitals.lv === 1 && gotVitals.du === CFG.ARMOR[1].dur, 'armor pickup grants L1 with full durability');
      ok(gotPickupEvt, 'room is notified of the pickup');
      step_soakMath();
    }, 400);
  }

  function step_soakMath() {
    let first = null;
    B.on('damaged', function onD(d) { if (!first) { first = d; B.off('damaged', onD); } });
    A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    setTimeout(() => {
      // 33 dmg vs L1 (45% absorb, 60 dur): soak 14.85 -> du 45, hp 82
      ok(first && first.lv === 1 && first.du === 45 && first.hp === 82, 'armor soak math (hp 82, durability 45) [got ' + JSON.stringify(first) + ']');
      soakChecked = true;
      step_healthPickup();
    }, 400);
  }

  function step_healthPickup() {
    gotVitals = null;
    const spot = CFG.PICKUP_SPOTS.find(s => s[0] === 'health' && s[2] < 1); // ground-level health
    bPos = [spot[1], 0.95, spot[3]];
    setTimeout(() => {
      ok(gotVitals && gotVitals.hp === 100, 'health pack restores hp to 100');
      healthChecked = true;
      step_teamKill();
    }, 400);
  }

  A.on('snap', (d) => {
    if (bDead && !tkChecked && d.tk && d.tk.a >= 1) {
      tkChecked = true;
      ok(true, 'team kill counted in snapshot team score');
      cleanup();
    }
  });
  A.on('death', (d) => { if (d.victimId === B.id) { bDead = true; bAlive = false; } });
  function step_teamKill() {
    let n = 0;
    const iv = setInterval(() => {
      if (bDead || n >= 9) { clearInterval(iv); return; }
      n++;
      A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    }, 80);
    setTimeout(() => { if (!tkChecked) { ok(false, 'team kill counted in snapshot team score'); cleanup(); } }, 4000);
  }

  function cleanup() {
    [A, B, C].forEach(s => s.disconnect());
    setTimeout(finish, 300);
  }
}

phase1(phase2);
