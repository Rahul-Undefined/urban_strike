/* verify-netcodec — the snapshot wire format, round-tripped.

   WHY. v9.8 replaced a self-describing JSON packet with a delta stream. That
   trade is only safe if decode(encode(x)) === x for every field, on every path,
   including the ones that are easy to forget: a value that changes back to what
   it was two ticks ago, an entity that leaves, a client that joins mid-match.

   A wrong delta does not crash. It desyncs quietly — a player frozen at an old
   position, a corpse still standing, an enemy who never seems to reload — and
   those look like lag, which is the hardest kind of bug to attribute. So the
   format gets a gate.

   Run: node tools/verify-netcodec.js */
const path = require('path');
const SC = require(path.join(__dirname, '..', 'public/src/networking/snapcodec.js'));
const CFG = require(path.join(__dirname, '..', 'public/src/config/index.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

function mkP(id, o) {
  return Object.assign({ id: id, pos: [12.34, 0.95, -56.78], ry: 1.234, rx: -0.123,
    mv: 1, crouch: 0, wp: 3, ln: 0.42, hp: 87.3, armorLvl: 2, armorDur: 81.4,
    helmLvl: 1, rl: 0, alive: true, team: 'b' }, o || {});
}
const EPS = 0.011;                              // one quantisation step, centimetres

console.log('--- round trip ---');
{
  const cache = {};
  const s = SC.stateOf(mkP('sock-aaaaaaaaaaaaaaaa'), 1);
  const out = SC.toPlayerState(SC.decodeEntity(SC.encodeEntity(s, null, true), cache));
  ok(Math.abs(out.p[0] - 12.34) < EPS && Math.abs(out.p[2] + 56.78) < EPS, 'position survives a keyframe');
  ok(Math.abs(out.ry - 1.234) < 0.002 && Math.abs(out.rx + 0.123) < 0.002, 'angles survive');
  ok(out.hp === 87 && out.lv === 2 && out.du === 81, 'vitals survive');
  ok(out.wp === 3 && out.hl === 1 && out.al === 1 && out.tm === 'b', 'weapon, helmet, alive, team survive');
  ok(out.id === 'sock-aaaaaaaaaaaaaaaa', 'the id travels on a keyframe');
}

console.log('\n--- deltas carry only what moved ---');
{
  const cache = {};
  const a = SC.stateOf(mkP('sock-a'), 1);
  SC.decodeEntity(SC.encodeEntity(a, null, true), cache);
  const b = SC.stateOf(mkP('sock-a', { pos: [12.40, 0.95, -56.70] }), 1);
  const wire = SC.encodeEntity(b, a, false);
  ok(JSON.stringify(wire).length < 30, 'a moving player costs under 30 chars [' + JSON.stringify(wire).length + ']');
  const out = SC.toPlayerState(SC.decodeEntity(wire, cache));
  ok(Math.abs(out.p[0] - 12.40) < EPS, 'the moved axis updates');
  ok(out.hp === 87 && out.tm === 'b' && out.wp === 3,
    'UNCHANGED fields keep their cached values — the whole point of the format');
  ok(out.id === 'sock-a', 'the id is remembered, not resent');

  const still = SC.encodeEntity(b, b, false);
  ok(still.length === 2 && still[1] === 0, 'a player who did not move costs [slot,0]');
  const out2 = SC.toPlayerState(SC.decodeEntity(still, cache));
  ok(Math.abs(out2.p[0] - 12.40) < EPS && out2.hp === 87, 'and decodes to the same state');
}

console.log('\n--- the fields that change on events ---');
/* Each of these was sent fifteen times a second before v9.8. If any stops
   arriving when it changes, the symptom is a client that never learns about a
   hit, a death or a weapon swap. */
[['hp', { hp: 41 }, o => o.hp === 41],
 ['armour', { armorLvl: 3, armorDur: 120 }, o => o.lv === 3 && o.du === 120],
 ['helmet', { helmLvl: 2 }, o => o.hl === 2],
 ['weapon', { wp: 11 }, o => o.wp === 11],
 ['crouch', { crouch: 2 }, o => o.cr === 2],
 ['reloading', { rl: 1 }, o => o.rl === 1],
 ['death', { alive: false }, o => o.al === 0],
 ['team', { team: 'a' }, o => o.tm === 'a'],
 ['lean', { ln: -0.4 }, o => Math.abs(o.ln + 0.4) < EPS],
 ['move state', { mv: 2 }, o => o.mv === 2]
].forEach(([label, change, check]) => {
  const cache = {};
  const a = SC.stateOf(mkP('sock-a'), 1);
  SC.decodeEntity(SC.encodeEntity(a, null, true), cache);
  const b = SC.stateOf(mkP('sock-a', change), 1);
  const out = SC.toPlayerState(SC.decodeEntity(SC.encodeEntity(b, a, false), cache));
  ok(check(out), label + ' is transmitted when it changes');
});

console.log('\n--- a value that returns to a previous one ---');
/* The trap in any delta scheme: A -> B -> A. If the encoder diffs against
   anything other than what it LAST SENT, the return trip is dropped and the
   client is stuck on B. */
{
  const cache = {};
  const a = SC.stateOf(mkP('sock-a', { hp: 100 }), 1);
  SC.decodeEntity(SC.encodeEntity(a, null, true), cache);
  const b = SC.stateOf(mkP('sock-a', { hp: 40 }), 1);
  SC.decodeEntity(SC.encodeEntity(b, a, false), cache);
  const c = SC.stateOf(mkP('sock-a', { hp: 100 }), 1);
  const out = SC.toPlayerState(SC.decodeEntity(SC.encodeEntity(c, b, false), cache));
  ok(out.hp === 100, 'hp 100 -> 40 -> 100 arrives back at 100');
}

console.log('\n--- a client joining mid-match ---');
{
  const server = {};                       // what the server believes was sent
  const a = SC.stateOf(mkP('sock-a', { hp: 55, wp: 9, team: 'a' }), 1);
  server[1] = a;
  const joiner = {};                       // a brand new, empty cache
  const out = SC.toPlayerState(SC.decodeEntity(SC.encodeEntity(a, null, true), joiner));
  ok(out.hp === 55 && out.wp === 9 && out.tm === 'a' && out.id === 'sock-a',
    'a keyframe gives a joiner every field with no prior state');
}

console.log('\n--- precision is not worse than v9.7 ---');
/* v9.7 sent Math.round(x*100)/100 and Math.round(ry*1000)/1000. The integer
   form is the SAME precision in fewer characters. This asserts that, because
   "we made it smaller" must never quietly mean "we made it coarser". */
{
  ok(SC.POS_Q === 100, 'positions still quantise to the centimetre');
  ok(SC.ANG_Q === 1000, 'angles still quantise to the milliradian');
  const cache = {};
  const p = mkP('sock-a', { pos: [-99.994, 0.955, 41.006], ry: -3.1409 });
  const s = SC.stateOf(p, 1);
  const out = SC.toPlayerState(SC.decodeEntity(SC.encodeEntity(s, null, true), cache));
  ['0', '1', '2'].forEach((k, i) =>
    ok(Math.abs(out.p[i] - Math.round(p.pos[i] * 100) / 100) < 1e-9,
      'axis ' + i + ' matches what v9.7 would have sent'));
  ok(Math.abs(out.ry - Math.round(p.ry * 1000) / 1000) < 1e-9, 'yaw matches v9.7 exactly');
}

console.log('\n--- payload budget ---');
/* A ratchet, like the render budgets. If a future field pushes the average
   entity back over this, the saving is being spent without anyone noticing. */
{
  const cache = {};
  let total = 0;
  const prev = {};
  for (let tick = 0; tick < 60; tick++) {
    for (let i = 0; i < 20; i++) {
      const p = mkP('sock-' + i, { pos: [i + tick * 0.05, 0.95, -i - tick * 0.03], ry: tick * 0.01 });
      const s = SC.stateOf(p, i);
      total += JSON.stringify(SC.encodeEntity(s, prev[i] || null, tick === 0)).length;
      prev[i] = s;
    }
  }
  const perEnt = total / (60 * 20);
  ok(perEnt < 32, 'steady-state cost is under 32 chars per entity per tick [' +
    perEnt.toFixed(1) + ']  (v9.7 was ~153)');
  const kbs = perEnt * 20 * CFG.NET.snapRate / 1024;
  ok(kbs < 12, 'a full 20-entity room costs under 12 KB/s per client [' + kbs.toFixed(1) + ']');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
