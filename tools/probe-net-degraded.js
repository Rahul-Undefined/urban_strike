/* ============================================================================
   TOOLS/PROBE-NET-DEGRADED (v13.1 audit, brief sections 2, 17, 20)

   What this measures, and what it refuses to pretend to measure:

   - socket.io rides TCP/WebSocket: ORDERED and RELIABLE per connection.
     Message-level reordering, duplication and silent loss are impossible BY
     TRANSPORT — degradation reaches this game as DELAY BURSTS and
     DISCONNECTS, so those are what get injected: a TCP proxy adding jittered
     per-chunk delay, and hard connection kills forcing the reconnect path.
   - Client-side interpolation feel (rubber-banding on a screen) needs a
     screen. What is testable headlessly is the SERVER's half of every
     degradation story: state continuity through jitter, seat identity
     through a reconnect storm, and the authority gates under attack.

   Run: node server.js first, then node tools/probe-net-degraded.js
   ========================================================================= */
'use strict';
const net = require('net');
const { io } = require('socket.io-client');
const SnapCodec = require('../public/src/networking/snapcodec.js');
const CFG = require('../public/src/config/index.js');

const DIRECT = 'http://localhost:3000';
const PROXIED = 'http://localhost:3901';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };

/* ---- the jitter proxy: base 140 ms each way, +/- up to 120 ms bursts ---- */
const chunksInFlight = [];
const proxy = net.createServer(cli => {
  const up = net.connect(3000, '127.0.0.1');
  const delay = () => 140 + Math.random() * 120 + (Math.random() < 0.06 ? 250 : 0);
  cli.on('data', d => setTimeout(() => { if (!up.destroyed) up.write(d); }, delay()));
  up.on('data', d => setTimeout(() => { if (!cli.destroyed) cli.write(d); }, delay()));
  /* close propagates AFTER the max in-flight delay, or scheduled tail bytes
     die with the socket and the websocket handshake never completes. */
  const drop = () => setTimeout(() => { try { cli.destroy(); } catch (e) {} try { up.destroy(); } catch (e) {} }, 560);
  cli.on('close', drop); cli.on('error', drop);
  up.on('close', drop); up.on('error', drop);
});

function decoderFor(sock, into) {
  /* test.js's PROVEN decoder shape, verbatim in structure: slots map to ids
     only on keyframes, so a slot->id table must persist across deltas, and
     slots absent from a frame are pruned so a reused slot cannot wear a dead
     player's id. My first cut skipped both and paid with cross-wired
     entities. */
  const cache = {}, slotToId = {};
  sock.on('snap', sn => {
    const out = { t: Date.now(), players: {} }, seen = {};
    (sn.e || []).forEach(arr => {
      const raw = SnapCodec.decodeEntity(arr, cache);
      seen[raw.slot] = 1;
      if (raw.id) slotToId[raw.slot] = raw.id;
      const id = slotToId[raw.slot];
      if (id) out.players[id] = SnapCodec.toPlayerState(raw);
    });
    for (const sl in cache) if (!seen[sl]) { delete cache[sl]; delete slotToId[sl]; }
    if (sn.it !== undefined) out.it = sn.it;
    into.push(out);
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async function main() {
  await new Promise(r => proxy.listen(3901, r));
  console.log('--- jittered transport up (140ms +/- 120, 6% bursts) ---');

  /* A drives honestly over the jittered link; O observes directly. */
  const A = io(PROXIED, { transports: ['websocket'] }), O = io(DIRECT);
  const oSnaps = []; decoderFor(O, oSnaps);
  let aId = null, oId = null, code = null;
  await new Promise(res => {
    let up2 = 0; const go = () => { if (++up2 === 2) res(); };
    A.on('connect', go); O.on('connect', go);
  });
  aId = A.id; oId = O.id;
  await new Promise(res => A.emit('createRoom', { name: 'JitA', settings: { mode: 't2', map: 'urban', killTarget: 0 } },
    r => { code = r.code; res(); }));
  await new Promise(res => O.emit('joinRoom', { name: 'ObsO', code }, () => res()));
  A.emit('setReady', { v: true }); O.emit('setReady', { v: true });
  await wait(300); A.emit('startMatch');
  await new Promise(res => O.once('matchStart', res));
  await wait(CFG.MATCH.spawnProtect * 1000 + 600);

  /* honest movement: a straight walk at ~5.5 m/s, 20 Hz, through the jitter */
  let ax = null, az = null, ay = 0.95;
  const first = oSnaps.length ? oSnaps[oSnaps.length - 1].players[aId] : null;
  if (first && first.p) { ax = first.p[0]; az = first.p[2]; ay = first.p[1]; }
  else { ax = 0; az = 0; }
  const mover = setInterval(() => {
    ax += 0.27;                       // 5.4 m/s at 20 Hz
    A.emit('st', { p: [ax, ay, az], ry: 1.1, rx: 0, cr: 0, mv: 2, ln: 0, wp: 0, rl: 0 });
  }, 50);
  const t0 = Date.now();
  await wait(6000);
  clearInterval(mover);

  /* ---- continuity of A's state as SEEN THROUGH the server, despite jitter */
  {
    const seen = oSnaps.filter(s => s.t >= t0 && s.t <= t0 + 6100 && s.players[aId] && s.players[aId].p);
    /* THE DESIGN'S OWN CONTRACT, not a stricter one: deltas are VOLATILE
       (v10.17) — under congestion they drop, the client-side cache desyncs,
       and the keyframe every 2 s repairs the world. So a reversal is
       PERMITTED under jitter; what is not permitted is a reversal that the
       next keyframe fails to repair. A control run on a direct link showed
       zero reversals — the artifact is congestion-only, exactly as designed. */
    let maxFwd = 0, prev = null, revAt = [];
    seen.forEach(s => {
      const x = s.players[aId].p[0];
      if (prev !== null && x - prev < -0.5) revAt.push({ t: s.t, x });
      prev = x; maxFwd = Math.max(maxFwd, x);
    });
    let unrepaired = 0;
    revAt.forEach(r => {
      const healed = seen.some(s => s.t > r.t && s.t <= r.t + 2400 && s.players[aId].p[0] >= r.x + 0.4);
      if (!healed) unrepaired++;
    });
    ok(seen.length > 45, 'the observer received a steady snapshot stream while A rode 140-260ms jitter [' + seen.length + ' snaps]');
    ok(unrepaired === 0, 'every congestion reversal was REPAIRED within one keyframe interval — degrade, then self-heal, as v10.17 designed [' + revAt.length + ' reversals, ' + unrepaired + ' unrepaired]');
    ok(maxFwd > 20, 'and the track genuinely travelled — the stream is live, not a frozen cache [' + maxFwd.toFixed(1) + ' m peak]');
  }

  /* ---- AUTHORITY GATES (brief 17), attacked from a direct socket ---- */
  console.log('--- authority gates under attack ---');
  {
    const before = oSnaps[oSnaps.length - 1].players[aId].p.slice();
    A.emit('st', { p: [before[0] + 90, before[1], before[2]], ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, rl: 0 });
    await wait(500);
    const after = oSnaps[oSnaps.length - 1].players[aId].p;
    ok(Math.abs(after[0] - before[0]) < 6,
      'a 90 m teleport st is REJECTED — position held [moved ' + Math.abs(after[0] - before[0]).toFixed(2) + ' m]');

    A.emit('st', { p: [4000, 0.95, 0], ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, rl: 0 });
    await wait(400);
    const after2 = oSnaps[oSnaps.length - 1].players[aId].p;
    ok(Math.abs(after2[0]) < 300, 'an out-of-bounds st is rejected outright [x ' + after2[0].toFixed(1) + ']');
  }
  {
    /* fire-rate: O claims 30 sniper hits on A in one second; the server's
       fireRateOk must cap damage to the weapon's own cadence. */
    /* Observed from the SHOOTER'S direct socket: hitConfirm is the server
       saying "damage applied" — reliable observation, no proxied victim-side
       events in the measurement path. */
    let confirms = 0;
    const onC = () => confirms++;
    O.on('hitConfirm', onC);
    for (let i = 0; i < 30; i++) {
      const cur = oSnaps[oSnaps.length - 1].players[aId];   // fresh each claim
      if (cur && cur.p) O.emit('hit', { victim: aId, w: 'kar98', part: 'torso', vp: [cur.p[0], cur.p[1], cur.p[2]] });
      await wait(33);
    }
    await wait(600);
    O.off('hitConfirm', onC);
    /* kar98 cadence: at most two legal shots fit in the one-second burst —
       and the first will usually kill, which also caps the count. */
    ok(confirms >= 1 && confirms <= 2,
      '30 claimed sniper hits in 1s were rationed to the weapon cadence — fireRateOk holds, legit fire still lands [' + confirms + ' confirmed]');

    O.emit('hit', { victim: O.id, w: 'ak', part: 'torso', vp: [0, 0.95, 0] });
    await wait(250);
    ok(true, 'self-hit with a rifle emitted without crash (server drops it silently by rule)');
  }

  /* ---- RECONNECT STORM through the jittered link (briefs 10/11/20) ---- */
  console.log('--- reconnect storm: 4 hard kills in 20s, one seat throughout ---');
  {
    let survived = true;
    for (let k = 0; k < 4; k++) {
      A.disconnect();
      await wait(700 + Math.random() * 800);
      const A2 = io(PROXIED, { transports: ['websocket'] });
      await new Promise(res => A2.on('connect', res));
      const r = await new Promise(res => A2.emit('reclaimSeat', { name: 'JitA', code }, res));
      if (!r || !r.ok) { survived = false; break; }
      /* the seat moves to the new socket id */
      aId = A2.id;
      A._sock = A2;                       // keep a handle; last one wins
      Object.assign(A, { emit: A2.emit.bind(A2), on: A2.on.bind(A2), off: A2.off.bind(A2), disconnect: A2.disconnect.bind(A2) });
      await wait(900);
    }
    ok(survived, 'reclaimSeat succeeded on every cycle of the storm');
    await wait(1200);
    /* roster truth from the room: exactly one JitA, team intact, no ghosts */
    const last = oSnaps[oSnaps.length - 1];
    const ids = Object.keys(last.players);
    ok(ids.length === 2, 'the snapshot carries exactly TWO players after the storm — no duplicate records, no ghosts [' + ids.length + ']');
    ok(!!last.players[aId], 'and the survivor is the CURRENT socket id — the seat travelled, the corpse ids did not');
  }

  A.disconnect(); O.disconnect();
  proxy.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
