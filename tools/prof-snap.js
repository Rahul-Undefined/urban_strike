/* prof-snap — what does a bot match ACTUALLY cost on the wire?

   Render reported 5.8 GB of egress on Urban Strike, essentially all of it
   WebSocket responses rather than HTTP. The reported shape of the session was
   1 human + 19 bots, which is close to the worst case this format has:

     - a delta encoder only pays off when fields DO NOT change, and
     - a bot never stands still.

   A human standing in cover sends almost nothing per tick. Nineteen bots
   moving, turning and looking send POS, RY and RX every single tick, forever.
   So the "409 bytes at 20 entities" figure in handoff section 8 - which is
   real, and was measured against a room of mostly-idle humans - is not the
   number that generated this bill.

   This connects a real client to a real bot match and reports what the server
   actually put on the wire, per packet and per hour, so the fix can be aimed at
   a measurement instead of an assumption.

   Needs a server started with NETSTATS=1.
   Run: NETSTATS=1 node server.js &   then   node tools/prof-snap.js [bots] [secs] */

const { io: rawIo } = require('socket.io-client');
const http = require('http');

const BOTS = parseInt(process.argv[2] || '19', 10);
const SECS = parseInt(process.argv[3] || '25', 10);
const URL = 'http://localhost:3000';

function get(p) {
  return new Promise((res, rej) => {
    http.get(URL + p, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej);
  });
}

(async function () {
  await get('/netstats/reset').catch(() => { });
  const s = rawIo(URL);
  let packets = 0, ents = 0;

  s.on('snap', (p) => { packets++; if (p && p.e) ents += p.e.length; });

  await new Promise(r => s.on('connect', r));
  const res = await new Promise(r => s.emit('createRoom',
    { name: 'BW', settings: { killTarget: 500, minutes: 30, mode: 'bots', map: 'urban', botCount: BOTS, backfill: false } },
    r2 => r(r2)));
  if (!res || !res.ok) { console.log('createRoom failed: ' + JSON.stringify(res)); process.exit(1); }
  s.emit('setReady', { v: true });
  setTimeout(() => s.emit('startMatch'), 400);

  await new Promise(r => setTimeout(r, SECS * 1000));

  const raw = await get('/netstats');
  let st = {};
  try { st = JSON.parse(raw); } catch (e) { console.log('netstats not JSON:\n' + raw.slice(0, 400)); }

  const secs = SECS;
  console.log('\n=== ' + BOTS + ' bots + 1 human, ' + secs + 's on urban ===');
  console.log('client received       : ' + packets + ' snap packets  (' +
    (packets / secs).toFixed(1) + '/s, snapRate is 15)');
  console.log('entities per packet   : ' + (packets ? (ents / packets).toFixed(1) : 0));
  if (st.bytes !== undefined) {
    const perPacket = st.packets ? st.bytes / st.packets : 0;
    console.log('server sent           : ' + st.bytes + ' B over ' + st.packets + ' packets');
    console.log('AVG PACKET            : ' + perPacket.toFixed(0) + ' B   (handoff quotes 409 B at 20 entities)');
    console.log('peak packet           : ' + (st.maxBytes || 0) + ' B');
    const perSec = st.bytes / secs;
    console.log('per client            : ' + perSec.toFixed(0) + ' B/s = ' +
      (perSec * 3600 / 1048576).toFixed(1) + ' MB/hour');
    console.log('');
    const hours = 5 * 1024 / (perSec * 3600 / 1048576);
    console.log('=> 5 GB lasts ' + hours.toFixed(1) + ' player-hours at this rate');
    console.log('=> 5.8 GB of egress means about ' + (5.8 * 1024 / (perSec * 3600 / 1048576)).toFixed(0) +
      ' player-hours were served');
  } else {
    console.log('server counters       : ' + raw.slice(0, 300));
  }
  process.exit(0);
})();
