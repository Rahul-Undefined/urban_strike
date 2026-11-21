/* verify-botmode — BOT OPS (v2.12), LIVE, against a running server (npm start).
   Replaces the v14.0 gate of the same name (it tested a mode removed in v1.0d).

   A real socket plays the human. It checks what only the whole server can show:
     1. the mode exists, is locked to its two maps, and puts the human on side A;
     2. operators appear in the roster and in the snapshot, flagged as bots, on
        side B, and MOVE in the snapshot;
     3. gunfire draws them: they shoot, and the human takes damage;
     4. the human can hit and kill one (the ordinary 'hit' path, lag
        compensation included), and it comes back;
     5. Hard on Urban fields more operators; the walk graph for the 440 m map
        is built without the match ever stalling;
     6. leaving the room leaves no operators behind, and no other mode has any.

   Run: node tools/verify-botmode.js   (server on :3000) */
'use strict';
const path = require('path');
const io = require('socket.io-client');
const CFG = require('../public/src/config/index.js');
const SnapCodec = require('../public/src/networking/snapcodec.js');
const URL = process.env.URL || 'http://localhost:3000';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const ack = (s, ev, d) => new Promise(r => s.emit(ev, d, r));

async function play(settings) {
  const A = io(URL, { transports: ['websocket'], forceNew: true });
  await new Promise(r => A.on('connect', r));
  const G = { A, lobby: null, start: null, toasts: [], spawns: {}, shots: [], damaged: [], deaths: [], cache: {}, ents: {}, snapN: 0, lastSnapAt: 0, maxGap: 0, track: {} };
  A.on('lobby', d => { G.lobby = d; });
  A.on('matchStart', d => { G.start = d; });
  A.on('toast', d => G.toasts.push(d.msg));
  A.on('spawn', d => { G.spawns[d.id] = d; if (d.id === A.id) { G.dead = false; if (G.pos) G.pos = d.pos.slice(); } });
  A.on('shoot', d => { if (String(d.id).indexOf('bot_') === 0) G.shots.push(d); });
  A.on('damaged', d => G.damaged.push(d));
  /* the tester is a player too: when the operators kill it, it respawns the way
     a client does (the first cut of this gate never did, and failed whenever
     the operators won the exchange) */
  A.on('death', d => {
    G.deaths.push(d);
    const who = d.victimId;
    if (who === A.id) { G.dead = true; G.died = (G.died || 0) + 1; setTimeout(() => A.emit('respawn'), ((d.respawnSec || 5) * 1000) + 350); }
  });
  A.on('snap', d => {
    const t = Date.now(); if (G.lastSnapAt) G.maxGap = Math.max(G.maxGap, t - G.lastSnapAt); G.lastSnapAt = t; G.snapN++;
    (d.e || []).forEach(arr => { const s = SnapCodec.decodeEntity(arr, G.cache); if (s && s.id) { const p = SnapCodec.toPlayerState(s); G.ents[s.id] = p;
      if (String(s.id).indexOf('bot_') === 0) { const tr = G.track[s.id] || (G.track[s.id] = { dist: 0, last: p.p, maxY: 0 });
        const dd = Math.hypot(p.p[0] - tr.last[0], p.p[2] - tr.last[2]); if (dd < 4) tr.dist += dd; tr.last = p.p; if (p.p[1] > tr.maxY) tr.maxY = p.p[1]; } } });
  });
  const res = await ack(A, 'createRoom', { name: 'Tester', settings: Object.assign({ killTarget: 0, minutes: 10 }, settings) });
  G.code = res.code; G.create = res;
  await wait(250);
  return G;
}
async function begin(G) {
  G.A.emit('setReady', { v: true }); await wait(200); G.A.emit('startMatch');
  for (let i = 0; i < 100 && !G.spawns[G.A.id]; i++) await wait(100);
  G.pos = G.spawns[G.A.id].pos.slice();
  G.hold = setInterval(() => G.A.emit('st', { p: G.pos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }), 50);
}
const botsIn = (G) => ((G.lobby && G.lobby.players) || []).filter(p => p.bot);

(async function main() {
  console.log('--- 1. the mode ---');
  ok(CFG.modesInCat('bots').join(',') === 'bom,boh' && CFG.MODE_CATS.some(c => c.id === 'bots'), 'a Bot Ops category with Medium and Hard');
  const G = await play({ mode: 'bom', map: 'kasbah' });
  ok(G.lobby && G.lobby.settings.mode === 'bom' && G.lobby.settings.map === 'urbansmall', 'asked for Kasbah, the room is on Urban Small — Bot Ops plays on its own maps [' + (G.lobby && G.lobby.settings.map) + ']');
  ok(botsIn(G).length === 0, 'no operators in the staging area');
  await begin(G);
  for (let i = 0; i < 60 && botsIn(G).length === 0; i++) await wait(100);
  const me = (G.lobby.players || []).find(p => p.id === G.A.id), bots = botsIn(G);
  console.log('--- 2. the operators ---');
  ok(me && me.team === 'a', 'the human is on side A');
  ok(bots.length === 5 && bots.every(b => b.team === 'b'), bots.length + ' operators in the roster, flagged as bots, all on side B [' + bots.map(b => b.name).join(', ') + ']');
  ok(G.toasts.some(m => /BOT OPS .* MEDIUM/.test(m)), 'announced: "' + (G.toasts.find(m => /BOT OPS/.test(m)) || '') + '"');
  await wait(6000);
  const tracked = Object.keys(G.track);
  ok(tracked.length === 5, 'all ' + tracked.length + ' are in the snapshot');
  ok(tracked.filter(id => G.track[id].dist > 4).length >= 4, 'and they move there [' + tracked.map(id => G.track[id].dist.toFixed(0)).join(', ') + ' m in 6 s]');

  console.log('--- 3. gunfire draws them ---');
  const fire = setInterval(() => G.A.emit('shoot', { w: 'ak47', o: G.pos, dir: [0, 0, 1], sup: 0 }), 900);
  /* v2.12.1 operators are deadlier: two rounds can be a kill, and a dead tester draws no more fire until it is back — so two rounds is the bar */
  for (let i = 0; i < 700 && (G.shots.length < 2 || G.damaged.length < 1); i++) await wait(100);
  clearInterval(fire);
  ok(G.shots.length >= 2, 'operators open fire on a player who gives his position away [' + G.shots.length + ' shots]');
  ok(G.damaged.length >= 1, 'and the human is hit [' + G.damaged.length + ' hits, hp ' + (G.damaged.length ? G.damaged[G.damaged.length - 1].hp : '-') + ']');
  ok(G.shots.every(s => CFG.WEAPONS[s.w] && Array.isArray(s.o) && s.o.length === 3), 'every operator shot is a real weapon with an origin the client can draw');

  console.log('--- 4. killing one ---');
  let target = null;
  for (let i = 0; i < 100 && !target; i++) { target = Object.keys(G.ents).find(id => id.indexOf('bot_') === 0 && G.ents[id].al); if (!target) await wait(100); }
  const died = () => G.deaths.some(d => d.victimId === target);
  const hp0 = G.ents[target].hp;
  for (let i = 0; i < 260 && !died(); i++) {
    if (!G.dead && G.ents[target].al) G.A.emit('hit', { victim: target, w: 'ak47', part: 'body', pellets: 1, vp: G.ents[target].p });
    await wait(130);
  }
  await wait(300);
  ok(died() || G.ents[target].al === 0, 'the human kills an operator through the ordinary hit path [' + target + ', hp ' + hp0 + ' -> dead; the tester itself died ' + (G.died || 0) + ' time(s) on the way]');
  delete G.spawns[target];
  for (let i = 0; i < 120 && !G.spawns[target]; i++) await wait(100);
  ok(!!G.spawns[target], 'and it comes back after the respawn delay');
  ok(G.maxGap < 1500, 'the snapshot never stalled [longest gap ' + G.maxGap + ' ms over ' + G.snapN + ' snapshots]');
  clearInterval(G.hold); G.A.disconnect();
  await wait(400);

  console.log('--- 5. Hard on Urban ---');
  const H = await play({ mode: 'boh', map: 'urban' });
  ok(H.lobby.settings.map === 'urban', 'Bot Ops Hard runs on Urban');
  const t0 = Date.now(); await begin(H);
  for (let i = 0; i < 300 && botsIn(H).length === 0; i++) await wait(100);
  ok(botsIn(H).length === 6 && H.toasts.some(m => /HARD/.test(m)), botsIn(H).length + ' Hard operators on the 440 m map, fielded ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s after START');
  await wait(3000);
  ok(H.maxGap < 1500, 'building Urban’s walk graph never stalled the match [longest snapshot gap ' + H.maxGap + ' ms]');
  /* v2.12.1: level 2, one in three level 3 — the v2.12 check wanted exactly 2 and failed whenever two of six drew a 3 */
  ok(Object.keys(H.track).filter(id => H.ents[id] && H.ents[id].lv >= 2).length >= 5, 'Hard operators wear level-2 or level-3 vests [' + Object.keys(H.track).map(id => H.ents[id] ? H.ents[id].lv : '?').join(', ') + ']');
  clearInterval(H.hold); H.A.disconnect();
  await wait(400);

  console.log('--- 6. nothing left behind ---');
  const F = await play({ mode: 'ffa', map: 'urbansmall' });
  await begin(F); await wait(2500);
  ok(botsIn(F).length === 0 && Object.keys(F.track).length === 0, 'a Free For All room has no operators');
  clearInterval(F.hold); F.A.disconnect();

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
