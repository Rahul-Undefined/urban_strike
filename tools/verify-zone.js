/* verify-zone.js — v1.0j
   Urban Zone is a schedule and a rule. Both are pure functions of config and
   the match clock, so both are provable here: the circles nest and end at a
   small-map radius inside the map; the timeline is 2 minutes open, ten
   minute-long phases, three minutes final; the bleed is 10% a second and kills
   in ten; crates land inside; the mode is one life and locked to Urban. */
const fs = require('fs'), path = require('path');
const CFG = require('../public/src/config/index.js');
let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

console.log('--- the mode ---');
const M = CFG.MODES.zone;
ok(!!M && M.zone === true && M.lives === 1 && M.teams === false, 'Urban Zone exists: solo, one life');
ok(M.mapLock === 'urban', 'and is locked to Urban');
ok(CFG.MODE_CATS.some(c => c.id === 'zone') && CFG.modesInCat('zone').indexOf('zone') >= 0, 'the picker has an Urban Zone category with the mode in it');
ok(CFG.MODE_CATS.map(c => c.id).slice(0, 4).join(',') === 'ffa,team,squads,last', 'the four human categories still lead');
ok(CFG.GEAR.zone && CFG.GEAR.zone.label, 'the kill feed has a name for it');

console.log('--- the schedule ---');
const Z = CFG.ZONE;
ok(Z.fullMinutes === 2 && Z.shrinkPhases === 10 && Z.phaseSec === 60 && Z.holdSec === 30, 'timeline: 2 open minutes, ten 60 s phases with a 30 s hold each');
ok(Z.fullMinutes * 60 + Z.shrinkPhases * Z.phaseSec === 12 * 60, 'the final circle stands at 12:00, three minutes before the 15:00 clock');
ok(Z.r0 >= 120 * Math.SQRT2, 'the first circle covers the whole 240 m square (r0 ' + Z.r0 + ' >= corner distance ' + (120 * Math.SQRT2).toFixed(1) + ')');
ok(Z.rFinal >= 35 && Z.rFinal <= 50, 'the final circle is small-map sized (r ' + Z.rFinal + ' ~ Bazaar\'s 84 x 64)');
ok(Z.dmgPct === 10 && Z.tickSec === 1, 'the bleed is 10% every second');

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let nestOK = true, boundsOK = true, finalMax = 0, distinct = new Set();
for (let trial = 0; trial < 200; trial++) {
  const S = CFG.zoneSchedule(rnd, 120);
  const C = S.circles;
  if (C.length !== Z.shrinkPhases + 1) nestOK = false;
  for (let k = 1; k < C.length; k++) {
    const a = C[k - 1], b = C[k];
    const d = Math.hypot(b.cx - a.cx, b.cz - a.cz);
    if (d > a.r - b.r + 1e-6) nestOK = false;                         // the next circle lies inside the current
    if (b.r >= a.r) nestOK = false;                                    // and is smaller
    if (b.r < 118 && (Math.abs(b.cx) + b.r > 118.05 || Math.abs(b.cz) + b.r > 118.05)) boundsOK = false;   // and on the map (2 m pad; the nesting keeps the last centimetre)
  }
  const L = C[C.length - 1];
  finalMax = Math.max(finalMax, Math.hypot(L.cx, L.cz));
  distinct.add(Math.round(L.cx) + ',' + Math.round(L.cz));
  if (Math.abs(L.r - Z.rFinal) > 1e-6) nestOK = false;
}
ok(nestOK, 'over 200 rolls every circle nests inside the previous one and ends at rFinal');
ok(boundsOK, 'no circle that fits on the map ever leaves it');
ok(finalMax <= Z.finalCenterMax + 1e-6 && distinct.size > 150, 'the final centre is random (' + distinct.size + ' distinct of 200) and within ±' + Z.finalCenterMax + ' m [max ' + finalMax.toFixed(1) + ']');

console.log('--- the clock ---');
const S = CFG.zoneSchedule(rnd, 120);
const at = t => CFG.zoneCircleAt(S, t);
ok(at(0).r === Z.r0 && at(119.9).r === Z.r0 && !at(119.9).shrinking, 'the whole map is safe for the first two minutes');
ok(!at(120).shrinking && at(120).next && Math.abs(at(120).holdLeft - 30) < 1e-6, 'at 2:00 the first next-circle is shown and holds 30 s');
ok(at(150.1).shrinking && at(179.9).r < Z.r0 && at(179.9).r > S.circles[1].r, 'from 2:30 the circle shrinks toward circle 1');
ok(Math.abs(at(180).r - S.circles[1].r) < 1e-6 && !at(180).shrinking, 'at 3:00 circle 1 stands and the next hold begins');
ok(Math.abs(at(720).r - Z.rFinal) < 1e-6 && at(720).next === null && at(899).r === Z.rFinal, 'from 12:00 to the end the final circle stands');
let mono = true; for (let t = 0; t < 900; t += 0.5) if (at(t + 0.5).r > at(t).r + 1e-9) mono = false;
ok(mono, 'the radius never grows');

console.log('--- the bleed, on the server ---');
const emitted = [];
const io = { to: id => ({ emit: (ev, d) => emitted.push({ to: id, ev, d }) }) };
let killed = [];
const Bots = require('../server/lib/bots.js')({});
const ZoneSrv = require('../server/lib/zone.js')({ io, now: () => T0, applyDamage: (room, v, dmg, by, w, hs, pb) => { v.alive = false; killed.push({ id: v.id, w }); },
  colliders: (m) => Bots.buildColliders(m) });
let T0 = 1000000;
const room = { code: 'Z', state: 'playing', settings: { mode: 'zone', map: 'urban' }, players: new Map(), startedAt: T0 - 13 * 60 * 1000 };   // final circle
ZoneSrv.start(room);
ok(!!room.zone && room.zone.sched.circles.length === 11, 'start() rolls an 11-circle schedule for a zone room');
const fc = CFG.zoneCircleAt(room.zone.sched, 13 * 60);
const inside = { id: 'I', alive: true, hp: 100, pos: [fc.cx, 1, fc.cz], armorLvl: 0, armorDur: 0 };
const outside = { id: 'O', alive: true, hp: 100, pos: [fc.cx + fc.r + 10, 1, fc.cz], armorLvl: 0, armorDur: 0 };
room.players.set('I', inside); room.players.set('O', outside);
for (let i = 0; i < 9; i++) { T0 += 1000; ZoneSrv.tick(room); }
ok(inside.hp === 100 && inside.alive, 'inside the circle: untouched');
ok(outside.hp === 10 && outside.alive, 'outside: 10 hp lost per second, 90 down after nine ticks [' + outside.hp + ']');
ok(emitted.filter(e => e.ev === 'damaged' && e.to === 'O' && e.d.zone === 1).length === 9, 'each tick told the victim (damaged, zone flag)');
T0 += 1000; ZoneSrv.tick(room);
ok(!outside.alive && killed.length === 1 && killed[0].w === 'zone', 'the tenth second kills, tagged zone');
const nz = { code: 'N', state: 'playing', settings: { mode: 'ffa', map: 'urban' }, players: new Map(), startedAt: T0 - 800000 };
ok(ZoneSrv.start(nz) === null && !nz.zone, 'a non-zone room gets no schedule');

console.log('--- the crates ---');
const pts = CFG.AIRDROP.points;
const picked = ZoneSrv.cratePoints(room, pts, CFG.AIRDROP.fallSec);
ok(picked.length > 0 && picked.every(p => Math.hypot(p[0] - fc.cx, p[1] - fc.cz) <= fc.r), 'crate points are filtered to the current circle [' + picked.length + ' of ' + pts.length + ']');
/* a small circle placed where no configured drop point lies: the crate still lands INSIDE, on open ground */
const tiny = { code: 'T', settings: { map: 'urban' }, zone: { sched: { circles: [{ cx: -81, cz: 64, r: 14 }], fullSec: 0, phaseSec: 60, holdSec: 30 } }, startedAt: T0 - 5000 };   // the stadium pitch: open ground, no configured drop point within 8 m
const noneInside = pts.every(p => Math.hypot(p[0] + 81, p[1] - 64) > 8);
const fb = ZoneSrv.cratePoints(tiny, pts, 0);
ok(noneInside && fb.length >= 1 && fb.every(p => Math.hypot(p[0] + 81, p[1] - 64) <= 14), 'with no configured point inside, open ground INSIDE the circle is found instead [' + fb.length + ' spots]');
const colsU = Bots.buildColliders('urban');
ok(fb.every(p => !colsU.some(k => (k[3] - k[0] <= 200) && k[4] > 0.2 && k[1] <= 8 && p[0] + 1.6 > k[0] && p[0] - 1.6 < k[3] && p[1] + 1.6 > k[2] && p[1] - 1.6 < k[5])), 'and every such spot has nothing standing on it');
const lootSrc = fs.readFileSync(path.join(__dirname, '..', 'server/lib/loot.js'), 'utf8');
ok(/ctx\.zoneCratePoints\(room, pts, CFG\.AIRDROP\.fallSec\)/.test(lootSrc), 'dropCrate asks the zone where the crate may land');

console.log('--- the wiring ---');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok(/const zoneSched = Zone\.start\(room\)/.test(srv) && /zone: zoneSched/.test(srv), 'matchStart rolls and ships the schedule');
ok((srv.match(/zone: room\.zone \? room\.zone\.sched : null/g) || []).length >= 4, 'every reconnect door and the late-join matchStart carry it');
ok(/Zone\.tick\(room\)/.test(srv) && /Zone\.reset\(room\)/.test(srv), 'the server ticks and resets it');
ok(/mapLock\) room\.settings\.map = s\.map/.test(srv), 'a locked mode refuses a map change');
const rooms = fs.readFileSync(path.join(__dirname, '..', 'server/lib/rooms.js'), 'utf8');
ok(/CFG\.MODES\[mode\]\.mapLock/.test(rooms), 'makeRoom honours the map lock');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
ok(/src\/environment\/zone\.js/.test(html) && /id="zone-banner"/.test(html) && /id="zone-edge"/.test(html), 'the client has the module, the banner and the red edge');
const mm = fs.readFileSync(path.join(__dirname, '..', 'public/src/ui/minimap.js'), 'utf8');
ok(/Zone\.current\(\)/.test(mm) && /evenodd/.test(mm) && /rgba\(70,230,110/.test(mm), 'the M map and radar paint outside red and the circle green');
const net = fs.readFileSync(path.join(__dirname, '..', 'public/src/networking/net.js'), 'utf8');
ok(/Zone\.set\(d && d\.zone \? d\.zone : null\)/.test(net) && /zoneNotice/.test(net), 'the client takes the schedule from matchStart and the notices');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
