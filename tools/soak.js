/* tools/soak.js — a REAL match, headlessly, with real sockets. v10.18.

   WHY THIS EXISTS

   For eighteen versions every change was verified by gates that read code and
   built geometry. Not one of them ever ran a match. Rahul kept finding faults
   that no gate could see, and twice I shipped a diagnosis that turned out to
   be wrong because I reasoned about the network instead of measuring it.

   This spawns the actual server, connects actual socket.io clients over
   websocket, starts an actual match and drives movement at 20 Hz — no browser
   required. It measures what the receiving client actually experiences:
   snapshot arrival gaps, keyframe cadence, and server memory over time.

   The transport matters: socket.io defaults to HTTP long-polling first, which
   this sandbox blocks. Forcing `transports: ['websocket']` is what made all of
   this possible, and not testing that assumption cost several versions.

     node tools/soak.js [players] [seconds] [map]
     node tools/soak.js 8 300 urban
*/
const { spawn } = require('child_process');
const path = require('path');
const io = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const PLAYERS = Math.max(2, +(process.argv[2] || 4));
const SECONDS = +(process.argv[3] || 180);
const MAP = process.argv[4] || 'urban';
const PORT = 3200 + (process.pid % 300);

const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } });
let up = false;
srv.stdout.on('data', d => { if (/running/.test(d.toString())) up = true; });
srv.stderr.on('data', d => process.stdout.write('SRV-ERR ' + d));

const wait = ms => new Promise(r => setTimeout(r, ms));
const mk = () => io('http://127.0.0.1:' + PORT, { transports: ['websocket'], timeout: 5000 });
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

function rssMB(pid) {
  try {
    const st = require('fs').readFileSync('/proc/' + pid + '/statm', 'utf8').split(' ');
    return Math.round((+st[1] * 4096) / 1048576);
  } catch (e) { return -1; }
}

(async () => {
  for (let i = 0; i < 100 && !up; i++) await wait(100);
  if (!up) { console.log('server did not start'); srv.kill(); process.exit(1); }
  console.log('soak: ' + PLAYERS + ' players, ' + SECONDS + 's, map ' + MAP);

  const cs = [];
  for (let i = 0; i < PLAYERS; i++) cs.push(mk());
  await Promise.all(cs.map(c => new Promise(r => c.on('connect', r))));

  /* Client 1 is the observer — every metric below is what IT experiences,
     because the bug is always reported by someone watching somebody else. */
  const gaps = []; let last = 0, snaps = 0, kf = 0, ents = 0;
  cs[1].on('snap', d => {
    const t = Date.now();
    if (last) gaps.push(t - last);
    last = t; snaps++; if (d.k) kf++; if (d.e) ents += d.e.length;
  });

  const room = await new Promise(r =>
    cs[0].emit('createRoom', { name: 'P0', settings: { map: MAP, mode: 'ffa', minutes: 60 } }, r));
  if (!room || !room.ok) { console.log('createRoom failed', room); srv.kill(); process.exit(1); }
  for (let i = 1; i < cs.length; i++) {
    await new Promise(r => cs[i].emit('joinRoom', { code: room.code, name: 'P' + i }, r));
  }
  cs.forEach(c => c.emit('setReady', { v: true }));
  await wait(500);
  cs[0].emit('startMatch');
  await wait(7000);

  let tick = 0;
  const drive = setInterval(() => {
    tick++;
    cs.forEach((c, i) => {
      const a = tick * 0.05 + i;
      const r = 12 + i * 3;
      c.emit('st', { p: [Math.cos(a) * r, 0.95, Math.sin(a) * r], ry: a, rx: 0, cr: 0, mv: 1, wp: 0, ln: 0 });
    });
  }, 50);

  const rss0 = rssMB(srv.pid);
  console.log('t=0     server RSS ' + rss0 + ' MB');
  for (let s = 30; s <= SECONDS; s += 30) {
    await wait(30000);
    const g = gaps.slice(-450);
    console.log(('t+' + s + 's').padEnd(8) +
      'snaps ' + String(snaps).padStart(6) +
      '  gap p50 ' + String(pct(g, .5)).padStart(3) +
      ' p90 ' + String(pct(g, .9)).padStart(4) +
      ' max ' + String(Math.max(...g)).padStart(5) +
      '   ents/snap ' + (ents / Math.max(1, snaps)).toFixed(1) +
      '   RSS ' + String(rssMB(srv.pid)).padStart(4) + ' MB (+' + (rssMB(srv.pid) - rss0) + ')');
  }
  clearInterval(drive);
  cs.forEach(c => c.close()); srv.kill();
  process.exit(0);
})();
