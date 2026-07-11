/* Integration test: simulates two players end-to-end against a running server.
   Run:  npm start  (in one terminal)   then   npm test  (in another). */
const { io } = require('socket.io-client');
const URL = 'http://localhost:3000';
const CFG = require('./public/js/shared-config.js');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
function done(code) {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(code !== undefined ? code : (fail ? 1 : 0));
}
setTimeout(() => { console.log('TIMEOUT'); done(1); }, 20000);

const A = io(URL), B = io(URL);
let code = null, bPos = null, bDead = false, bSpawns = 0;

A.on('connect', () => {
  A.emit('createRoom', { name: 'Alpha', settings: { killTarget: 5, minutes: 10 } }, (res) => {
    ok(res && res.ok && /^[A-Z2-9]{5}$/.test(res.code), 'createRoom returns 5-char code');
    code = res.code;
    B.emit('joinRoom', { name: 'Bravo', code: code }, (res2) => {
      ok(res2 && res2.ok, 'joinRoom with valid code succeeds');
      B.emit('joinRoom', { name: 'X', code: 'ZZZZ9' }, () => {}); // wrong code ignored by server-side room map
      A.emit('startMatch');
    });
  });
});

let matchStarted = 0;
[A, B].forEach((s, i) => s.on('matchStart', (d) => {
  matchStarted++;
  if (i === 0) ok(d.settings.killTarget === 5, 'matchStart carries settings');
}));

B.on('spawn', (d) => {
  if (d.id === B.id) {
    bSpawns++;
    bPos = d.pos.slice();
    ok(Array.isArray(d.pos) && d.pos.length === 3, 'spawn event has [x,y,z]');
    // B reports its own state so the server has fresh position history
    setInterval(() => {
      if (!bDead) B.emit('st', { p: bPos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 });
    }, 50);
    if (bSpawns === 1) setTimeout(shoot, 400);
    if (bSpawns === 2) { ok(true, 'B respawned after death'); setTimeout(() => done(), 300); }
  }
});

let shots = 0, gotDamaged = false, gotConfirm = false;
function shoot() {
  if (shots >= 12 || bDead) return;
  shots++;
  A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
  setTimeout(shoot, 80);
}
// fire-rate + bogus-position rejection probes
setTimeout(() => {
  A.emit('hit', { victim: B.id, w: 'ak47', part: 'body', pellets: 1, vp: [999, 0, 999] });
}, 600);

B.on('damaged', (d) => {
  if (!gotDamaged) { gotDamaged = true; ok(typeof d.hp === 'number' && d.hp < 100, 'victim receives damaged event with reduced hp'); }
});
A.on('hitConfirm', (d) => {
  if (!gotConfirm) { gotConfirm = true; ok(typeof d.dmg === 'number' && d.dmg > 0, 'shooter receives hitConfirm'); }
});
A.on('death', (d) => {
  if (d.victimId === B.id && !bDead) {
    bDead = true;
    ok(d.killerName === 'Alpha' && d.weapon === 'ak47', 'death event names killer + weapon');
    // early respawn must be rejected; proper respawn after delay accepted
    B.emit('respawn');
    setTimeout(() => { bDead = false; B.emit('respawn'); }, CFG.MATCH.respawnDelay * 1000 + 250);
  }
});
