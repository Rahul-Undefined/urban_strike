/* verify-v28 — the v2.8 rules, LIVE, against a running server (npm start).

   1. ASSAULT   an `aff` room: a sniper / SMG / pistol hit claim does NOTHING,
                an AK hit lands; every crate gun is an assault rifle.
   2. KILLHOUSE a spawn carries 3 mines; the first frag throw is relayed and
                the second is not; a frag claim after the second is refused;
                no crate carries a drone, hunter, recon flare or visor.
   3. KASBAH    a room on the new map starts, spawns on its own table and
                offers 10 / 15 / 30 minutes.

   Run: node tools/verify-v28.js   (server on :3000) */
'use strict';
const io = require('socket.io-client');
const CFG = require('../public/src/config/index.js');
const URL = process.env.URL || 'http://localhost:3000';

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
function client() { return io(URL, { transports: ['websocket'], forceNew: true }); }
function connect(s) { return new Promise(r => s.on('connect', r)); }
function emitAck(s, ev, d) { return new Promise(r => s.emit(ev, d, r)); }

async function room(settings) {
  const A = client(), B = client();
  await Promise.all([connect(A), connect(B)]);
  const got = { A: { spawns: [], damaged: [], throws: [], loot: [], start: null }, B: { spawns: [], damaged: [], throws: [], loot: [], start: null } };
  [['A', A], ['B', B]].forEach(([k, s]) => {
    s.on('spawn', d => { if (d.id === s.id) got[k].spawns.push(d); });
    s.on('damaged', d => got[k].damaged.push(d));
    s.on('throw', d => got[k].throws.push(d));
    s.on('lootAdd', d => got[k].loot.push(d));
    s.on('matchStart', d => { got[k].start = d; });
  });
  const res = await emitAck(A, 'createRoom', { name: 'V28a', settings: Object.assign({ backfill: false }, settings) });
  await emitAck(B, 'joinRoom', { name: 'V28b', code: res.code });
  A.emit('setReady', { v: true }); B.emit('setReady', { v: true });
  await wait(300);
  A.emit('startMatch');
  /* countdown + first spawn */
  for (let i = 0; i < 80 && !(got.A.spawns.length && got.B.spawns.length); i++) await wait(100);
  return { A, B, got, code: res.code };
}
/* keep a player standing where the server put them, so position checks pass */
function hold(s, pos) { return setInterval(() => s.emit('st', { p: pos, ry: 0, rx: 0, cr: 0, mv: 0, ln: 0, wp: 0, ping: 20 }), 50); }

(async function main() {
  /* ---------------- 1. ASSAULT ---------------- */
  console.log('--- 1. Assault: rifles only ---');
  {
    const R = await room({ mode: 'aff', map: 'urban', minutes: 10, killTarget: 0, airdropSec: 5 });
    ok(R.got.A.start && R.got.A.start.settings.mode === 'aff', 'an Assault room starts [' + (R.got.A.start && R.got.A.start.settings.mode) + ']');
    ok(R.got.A.start && R.got.A.start.settings.minutes === 10, 'and runs the 10-minute clock it asked for');
    const bPos = R.got.B.spawns[0].pos.slice(), aPos = R.got.A.spawns[0].pos.slice();
    const hb = hold(R.B, bPos), ha = hold(R.A, aPos);
    await wait((CFG.spawnProtectFor('urban') + 0.6) * 1000);
    const before = R.got.B.damaged.length;
    ['sniper', 'uzi', 'pistol', 'shotgun', 'awm', 'm249'].forEach(w => R.A.emit('hit', { victim: R.B.id, w, part: 'body', pellets: 1, vp: bPos }));
    await wait(600);
    ok(R.got.B.damaged.length === before, 'a sniper, SMG, pistol, shotgun, AWM and M249 claim deal nothing [' + (R.got.B.damaged.length - before) + ' landed]');
    R.A.emit('hit', { victim: R.B.id, w: 'ak47', part: 'body', pellets: 1, vp: bPos });
    await wait(500);
    ok(R.got.B.damaged.length === before + 1 && R.got.B.damaged[R.got.B.damaged.length - 1].hp < 100, 'an AK-47 round lands');
    /* wait for two crates */
    for (let i = 0; i < 160 && R.got.A.loot.length < 2; i++) await wait(100);
    const guns = [].concat(...R.got.A.loot.map(l => l.items)).map(it => CFG.LOOT_ITEMS[it.t]).filter(it => it && it.kind === 'weapon');
    ok(R.got.A.loot.length >= 1, 'crates fall in the Assault room [' + R.got.A.loot.length + ']');
    ok(guns.every(g => CFG.ASSAULT_GUNS.indexOf(g.w) >= 0), 'every crate gun is an assault rifle [' + guns.map(g => g.w).join(',') + ']');
    clearInterval(hb); clearInterval(ha); R.A.disconnect(); R.B.disconnect();
  }

  /* ---------------- 2. KILLHOUSE ---------------- */
  console.log('--- 2. Killhouse: 3 mines, 1 frag, no map-vision gear ---');
  {
    const R = await room({ mode: 'ffa', map: 'killhouse', minutes: 10, killTarget: 0, airdropSec: 5 });
    ok(R.got.B.spawns[0].mines === 3, 'a Killhouse life starts with 3 mines [' + R.got.B.spawns[0].mines + ']');
    const bPos = R.got.B.spawns[0].pos.slice(), aPos = R.got.A.spawns[0].pos.slice();
    const hb = hold(R.B, bPos), ha = hold(R.A, aPos);
    await wait((CFG.spawnProtectFor('killhouse') + 0.6) * 1000);
    R.B.emit('throw', { type: 'frag', o: bPos, v: [0, 5, 0] });
    await wait(300);
    ok(R.got.A.throws.filter(t => t.type === 'frag').length === 1, 'the first frag of the life is relayed');
    R.B.emit('throw', { type: 'frag', o: bPos, v: [0, 5, 0] });
    await wait(300);
    ok(R.got.A.throws.filter(t => t.type === 'frag').length === 1, 'the second frag of the same life is NOT relayed');
    const before = R.got.A.damaged.length;
    R.B.emit('hit', { victim: R.A.id, w: 'frag', dmg: 60, part: 'body', pellets: 1, vp: aPos });
    await wait(500);
    ok(R.got.A.damaged.length === before, 'and its blast claim is refused');
    for (let i = 0; i < 260 && R.got.A.loot.length < 3; i++) await wait(100);
    const items = [].concat(...R.got.A.loot.map(l => l.items)).map(it => it.t);
    ok(R.got.A.loot.length >= 1, 'crates fall in the Killhouse [' + R.got.A.loot.length + ' crates, ' + items.length + ' items]');
    ok(!items.some(t => ['drone', 'hunter', 'recon', 'visor'].indexOf(t) >= 0), 'no drone, hunter, recon flare or visor in a Killhouse crate [' + items.join(',') + ']');
    clearInterval(hb); clearInterval(ha); R.A.disconnect(); R.B.disconnect();
  }

  /* ---------------- 3. KASBAH ---------------- */
  console.log('--- 3. Kasbah: a room on the new map ---');
  {
    const R = await room({ mode: 'ffa', map: 'kasbah', minutes: 30, killTarget: 0 });
    ok(R.got.A.start && R.got.A.start.settings.map === 'kasbah', 'a Kasbah room starts');
    ok(R.got.A.start && R.got.A.start.settings.minutes === 30, 'and keeps the 30 minutes a theatre may run');
    const S = CFG.MAPS_KASBAH.SPAWNS, p = R.got.B.spawns[0].pos;
    ok(S.some(s => Math.abs(s[0] - p[0]) < 0.6 && Math.abs(s[1] - p[2]) < 0.6), 'the spawn comes from the Kasbah table [' + p[0] + ',' + p[2] + ']');
    ok(R.got.A.start && R.got.A.start.pickups.length > 40, 'the floor loot rolled on Kasbah\u2019s own points [' + (R.got.A.start && R.got.A.start.pickups.length) + ']');
    R.A.disconnect(); R.B.disconnect();
  }

  /* ---------------- 4. URBAN SMALL 2 (v2.11) ---------------- */
  console.log('--- 4. Urban Small 2: a room on the turned map ---');
  {
    const R = await room({ mode: 'ffa', map: 'urbansmall2', minutes: 10, killTarget: 0 });
    ok(R.got.A.start && R.got.A.start.settings.map === 'urbansmall2', 'an Urban Small 2 room starts');
    const S = CFG.MAPS_URBANSMALL2.SPAWNS, p = R.got.B.spawns[0].pos;
    ok(S.some(s => Math.abs(s[0] - p[0]) < 0.6 && Math.abs(s[1] - p[2]) < 0.6), 'the spawn comes from the turned table [' + p[0] + ',' + p[2] + ']');
    ok(R.got.A.start && R.got.A.start.pickups.length > 40, 'the floor loot rolled on Urban Small 2\u2019s points [' + (R.got.A.start && R.got.A.start.pickups.length) + ']');
    R.A.disconnect(); R.B.disconnect();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
