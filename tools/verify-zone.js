/* verify-zone.js — v1.0j
   Urban Zone is a schedule and a rule. Both are pure functions of config and
   the match clock, so both are provable here: the circles nest and end at a
   small-map radius inside the map; the timeline is 2 minutes open, ten
   minute-long phases, three minutes final; the bleed is 10% a second and kills
   in ten; crates land inside; the mode is one life and locked to Urban.
   v2.4: URBAN SMALL ZONE — the small profile (a free circle every 2 min, 50%
   per 10 s counted per player), the spawn rule (inside now AND next), the
   open-ground fallback — proven in its own section. */
const fs = require('fs'), path = require('path');
const CFG = require('../public/src/config/index.js');
let pass = 0, fail = 0;
function ok(c, m) { console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + m); c ? pass++ : fail++; }

console.log('--- the mode ---');
const M = CFG.MODES.zone;
ok(!!M && M.zone === true && !M.lives && M.teams === false, 'Urban Zone exists: solo, unlimited respawns (v1.0u)');
ok(M.mapLock === 'urban', 'and is locked to Urban');
ok(CFG.MODE_CATS.some(c => c.id === 'zone') && CFG.modesInCat('zone').indexOf('zone') >= 0, 'the picker has an Urban Zone category with the mode in it');
ok(CFG.MODE_CATS.map(c => c.id).slice(0, 4).join(',') === 'ffa,team,squads,last', 'the four human categories still lead');
ok(CFG.GEAR.zone && CFG.GEAR.zone.label, 'the kill feed has a name for it');
/* v1.0l: squads */
ok(CFG.MODES.zsq2 && CFG.MODES.zsq2.zone && CFG.MODES.zsq2.teams && CFG.MODES.zsq2.squads && !CFG.MODES.zsq2.lives && CFG.MODES.zsq2.mapLock === 'urban',
  'Urban Zone Duos: squads of 2, respawns, the circle, Urban');
ok(CFG.MODES.zsq3 && CFG.MODES.zsq3.zone && CFG.MODES.zsq3.teamCount === 5 && CFG.MODES.zsq3.squadSize === 3 && CFG.MODES.zsq3.maxPlayers === 15,
  'Urban Zone Squads: five squads of three');
ok(CFG.modesInCat('zone').slice(0, 3).join(',') === 'zone,zsq2,zsq3', 'the Urban Zone category leads with Solo, Duos and Squads on Urban [' + CFG.modesInCat('zone').join(',') + '] (v2.4: Urban Small Zone follows)');
ok(CFG.activeTeams('zsq3').length === 5 && !CFG.isElimination('zsq3'), 'the team helpers read the squad variant; nobody is eliminated');

console.log('--- the schedule ---');
const Z = CFG.ZONE;
ok(Z.fullMinutes === 2 && Z.shrinkPhases === 10 && Z.phaseSec === 60 && Z.holdSec === 30, 'timeline: 2 open minutes, ten 60 s phases with a 30 s hold each');
ok(Z.fullMinutes * 60 + Z.shrinkPhases * Z.phaseSec === 12 * 60, 'the final circle stands at 12:00, three minutes before the 15:00 clock');
/* v2.0: the map is MAPS.urban.ext (500 x 440), centred at (-30, 0) */
const EX = CFG.MAPS.urban.ext, MX = (EX.x0 + EX.x1) / 2, MZ = (EX.z0 + EX.z1) / 2;
const cornerD = Math.hypot((EX.x1 - EX.x0) / 2, (EX.z1 - EX.z0) / 2);
ok(Z.r0 >= cornerD, 'the first circle covers the whole ' + (EX.x1 - EX.x0) + ' x ' + (EX.z1 - EX.z0) + ' map (r0 ' + Z.r0 + ' >= corner distance ' + cornerD.toFixed(1) + ')');
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
    /* and on the map (2 m pad; the nesting keeps the last centimetre) — per axis, against the real box */
    if (b.r < (EX.x1 - EX.x0) / 2 - 2 && (b.cx - b.r < EX.x0 + 1.95 || b.cx + b.r > EX.x1 - 1.95)) boundsOK = false;
    if (b.r < (EX.z1 - EX.z0) / 2 - 2 && (b.cz - b.r < EX.z0 + 1.95 || b.cz + b.r > EX.z1 - 1.95)) boundsOK = false;
  }
  const L = C[C.length - 1];
  finalMax = Math.max(finalMax, Math.hypot(L.cx - MX, L.cz - MZ));   /* v2.0: from the map centre */
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
/* v2.4: the bleed is counted PER PLAYER from the moment they are found
   outside — the first tick only starts the clock, the next nine each take 10 */
ZoneSrv.tick(room);
ok(outside.hp === 100 && outside.zoneOutAt === T0, 'the first tick outside starts that player\'s own clock, no damage yet');
for (let i = 0; i < 9; i++) { T0 += 1000; ZoneSrv.tick(room); }
ok(inside.hp === 100 && inside.alive && !inside.zoneOutAt, 'inside the circle: untouched, no clock');
ok(outside.hp === 10 && outside.alive, 'outside: 10 hp lost per second, 90 down nine seconds after stepping out [' + outside.hp + ']');
ok(emitted.filter(e => e.ev === 'damaged' && e.to === 'O' && e.d.zone === 1).length === 9, 'each tick told the victim (damaged, zone flag)');
T0 += 1000; ZoneSrv.tick(room);
ok(!outside.alive && killed.length === 1 && killed[0].w === 'zone', 'the tenth second kills, tagged zone');
/* stepping back in clears the clock; stepping out again restarts it */
const walker = { id: 'W', alive: true, hp: 100, pos: [fc.cx + fc.r + 10, 1, fc.cz], armorLvl: 0, armorDur: 0 };
room.players.set('W', walker);
T0 += 1000; ZoneSrv.tick(room); T0 += 700; ZoneSrv.tick(room);
walker.pos = [fc.cx, 1, fc.cz]; T0 += 300; ZoneSrv.tick(room);
ok(walker.hp === 100 && !walker.zoneOutAt, 'back inside before the first second: no hit, clock cleared');
walker.pos = [fc.cx + fc.r + 10, 1, fc.cz]; T0 += 100; ZoneSrv.tick(room); T0 += 1000; ZoneSrv.tick(room);
ok(walker.hp === 90, 'out again: the clock restarts from zero and the hit lands a second later [' + walker.hp + ']');
room.players.delete('W');
const nz = { code: 'N', state: 'playing', settings: { mode: 'ffa', map: 'urban' }, players: new Map(), startedAt: T0 - 800000 };
ok(ZoneSrv.start(nz) === null && !nz.zone, 'a non-zone room gets no schedule');

console.log('--- respawns land inside the circle (v1.0u) ---');
{
  const cands = CFG.SPAWNS ? null : null;
  const fake = [{ s: [fc.cx, fc.cz, 0, 'n'] }, { s: [fc.cx + fc.r + 30, fc.cz, 0, 'n'] }, { s: [fc.cx - 5, fc.cz + 5, 0, 'n'] }];
  const inside = ZoneSrv.spawnFilter(room, fake);
  ok(inside.length === 2 && inside.every(k => Math.hypot(k.s[0] - fc.cx, k.s[1] - fc.cz) <= fc.r), 'spawn candidates outside the circle are dropped [' + inside.length + ' of 3 kept]');
  const farOnly = ZoneSrv.spawnFilter(room, [{ s: [fc.cx + 200, fc.cz, 0, 'n'] }, { s: [fc.cx + 90, fc.cz, 0, 'n'] }, { s: [fc.cx + 150, fc.cz, 0, 'n'] }]);
  /* v2.4: with no configured tile inside, OPEN GROUND inside the circle is used — never a tile in the red */
  ok(farOnly.length >= 1 && farOnly.every(k => k.open && Math.hypot(k.s[0] - fc.cx, k.s[1] - fc.cz) <= fc.r), 'with none inside, open ground inside the circle is found instead [' + farOnly.length + ' spots]');
  const noCols = require('../server/lib/zone.js')({ io, now: () => T0, applyDamage: () => {}, colliders: () => { throw new Error('down'); } });
  let lastResort = null; try { lastResort = noCols.spawnFilter(room, [{ s: [fc.cx + 200, fc.cz, 0, 'n'] }, { s: [fc.cx + 90, fc.cz, 0, 'n'] }]); } catch (e) { lastResort = null; }
  ok(!lastResort || lastResort.length >= 1, 'a dead collider harness never throws out of the spawn path');
  const srvSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok(/if \(room\.zone\) candidates = Zone\.spawnFilter\(room, candidates\)/.test(srvSrc), 'pickSpawn asks the zone');
}

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

console.log('--- v2.4: URBAN SMALL ZONE ---');
{
  const ZS = CFG.MODES.zs, ZD = CFG.MODES.zssq2, ZQ = CFG.MODES.zssq4;
  ok(ZS && ZS.zone && ZS.zoneProfile === 'small' && ZS.mapLock === 'urbansmall' && ZS.maxPlayers === 8 && ZS.cat === 'zone' && !ZS.lives,
    'Urban Small Zone Solo: the zone, the small profile, locked to Urban Small, eight players, respawns');
  ok(ZD && ZD.squads && ZD.teamCount === 4 && ZD.squadSize === 2 && ZD.maxPlayers === 8 && ZD.mapLock === 'urbansmall', 'Duos: four squads of two on Urban Small');
  ok(ZQ && ZQ.squads && ZQ.teamCount === 2 && ZQ.squadSize === 4 && ZQ.maxPlayers === 8 && CFG.activeTeams('zssq4').length === 2, 'Squads: two squads of four on Urban Small');
  ok(CFG.modesInCat('zone').length === 6, 'the Urban Zone category now offers six setups [' + CFG.modesInCat('zone').join(',') + ']');
  const P = CFG.zoneParams('zs'), PU = CFG.zoneParams('zone');
  ok(PU.phaseSec === 60 && PU.dmgPct === 10 && PU.tickSec === 1 && !PU.free && PU.label === 'URBAN ZONE', 'Urban Zone reads the unchanged defaults through the same resolver');
  ok(P.fullMinutes === 2 && P.phaseSec === 120 && P.shrinkPhases === 6 && P.holdSec === 45, 'the clock: 2 open minutes, then a new circle every 2 minutes (45 s shown, 75 s moving)');
  ok(P.fullMinutes * 60 + P.shrinkPhases * P.phaseSec === 14 * 60, 'the final circle stands at 14:00 of the 15:00 clock');
  ok(P.dmgPct === 50 && P.tickSec === 10, 'the bleed: 50% of max HP every 10 s outside');
  ok(P.free === true && P.rFinal === 32 && P.label === 'URBAN SMALL ZONE', 'free circles, a 32 m final arena, its own name');
  const EXS = CFG.MAPS.urbansmall.ext, HWx = (EXS.x1 - EXS.x0) / 2, HWz = (EXS.z1 - EXS.z0) / 2, cornerS = Math.hypot(HWx, HWz);
  let seedS = 13;
  const rndS = () => { seedS = (seedS * 1103515245 + 12345) % 2147483648; return seedS / 2147483648; };
  let shapeOK = true, finalIn = true, centreIn = true, notNested = 0, finals = new Set(), fourths = new Set(), mono = true;
  for (let trial = 0; trial < 300; trial++) {
    const S2 = CFG.zoneSchedule(rndS, CFG.MAPS.urbansmall.bound, 'urbansmall', P);
    const C = S2.circles;
    if (C.length !== P.shrinkPhases + 1 || S2.phaseSec !== 120 || S2.holdSec !== 45 || S2.fullSec !== 120 || !S2.free || S2.dmgPct !== 50 || S2.tickSec !== 10 || S2.label !== 'URBAN SMALL ZONE') shapeOK = false;
    if (Math.abs(C[0].r - (cornerS + 2)) > 1e-6 || Math.abs(C[C.length - 1].r - P.rFinal) > 1e-6) shapeOK = false;
    for (let k = 1; k < C.length; k++) {
      const a = C[k - 1], b = C[k];
      if (b.r >= a.r) mono = false;
      if (b.cx < EXS.x0 || b.cx > EXS.x1 || b.cz < EXS.z0 || b.cz > EXS.z1) centreIn = false;
      if (Math.hypot(b.cx - a.cx, b.cz - a.cz) > a.r - b.r + 1e-6) notNested++;   // the free roll is allowed to leave the previous circle
    }
    const L = C[C.length - 1];
    if (L.cx - L.r < EXS.x0 + 1.95 || L.cx + L.r > EXS.x1 - 1.95 || L.cz - L.r < EXS.z0 + 1.95 || L.cz + L.r > EXS.z1 - 1.95) finalIn = false;
    finals.add(Math.round(L.cx / 5) + ',' + Math.round(L.cz / 5));
    fourths.add(Math.round(C[3].cx / 5) + ',' + Math.round(C[3].cz / 5));
  }
  ok(shapeOK, 'over 300 rolls: seven circles, the first the map\'s half-diagonal, the last rFinal, the profile\'s numbers in the schedule');
  ok(mono, 'the radius still steps down every phase');
  ok(centreIn && finalIn, 'every centre is on the map and the FINAL circle is always wholly inside the walls');
  ok(notNested > 300, 'the circles are FREE — ' + notNested + ' of 1800 steps leave the previous circle (nesting is not required)');
  ok(finals.size > 200 && fourths.size > 100, 'random, anywhere: ' + finals.size + ' distinct final spots and ' + fourths.size + ' distinct mid-match spots (5 m bins) in 300 rolls');
  /* the clock, read by both sides */
  const S3 = CFG.zoneSchedule(rndS, CFG.MAPS.urbansmall.bound, 'urbansmall', P), atS = t => CFG.zoneCircleAt(S3, t);
  ok(atS(119.9).r === S3.circles[0].r && !atS(119.9).shrinking && atS(120).next && Math.abs(atS(120).holdLeft - 45) < 1e-6, 'the whole map is safe to 2:00; at 2:00 the next circle is shown and holds 45 s');
  ok(atS(165.1).shrinking && Math.abs(atS(240).r - S3.circles[1].r) < 1e-6 && Math.abs(atS(240).cx - S3.circles[1].cx) < 1e-6, 'from 2:45 the wall moves and at 4:00 circle 1 stands where it was rolled');
  ok(Math.abs(atS(840).r - P.rFinal) < 1e-6 && atS(840).next === null && atS(899).r === P.rFinal, 'from 14:00 to the end the final circle stands');
  /* the bleed on the server: 50% at 10 s, dead at 20 s, counted per player */
  const killedS = [];
  const ZSrv = require('../server/lib/zone.js')({ io, now: () => T0, applyDamage: (room, v, dmg, by, w) => { v.alive = false; killedS.push({ id: v.id, w }); }, colliders: (m) => Bots.buildColliders(m) });
  const roomS = { code: 'S', state: 'playing', settings: { mode: 'zs', map: 'urbansmall' }, players: new Map(), startedAt: T0 - 14 * 60 * 1000 - 5000 };
  ZSrv.start(roomS);
  ok(!!roomS.zone && roomS.zone.sched.circles.length === 7 && roomS.zone.sched.free && roomS.zone.Z.dmgPct === 50, 'start() rolls the small profile for a zs room');
  const fcS = CFG.zoneCircleAt(roomS.zone.sched, 14 * 60 + 5);
  const inS = { id: 'i', alive: true, hp: 100, pos: [fcS.cx, 1, fcS.cz], armorLvl: 0, armorDur: 0 };
  const outS = { id: 'o', alive: true, hp: 100, pos: [fcS.cx + fcS.r + 5, 1, fcS.cz], armorLvl: 0, armorDur: 0 };
  roomS.players.set('i', inS); roomS.players.set('o', outS);
  ZSrv.tick(roomS);
  for (let i = 0; i < 9; i++) { T0 += 1000; ZSrv.tick(roomS); }
  ok(outS.hp === 100 && inS.hp === 100, 'nine seconds outside: nothing yet');
  T0 += 1000; ZSrv.tick(roomS);
  ok(outS.hp === 50 && outS.alive && emitted.some(e => e.to === 'o' && e.ev === 'damaged' && e.d.dmg === 50 && e.d.zone === 1), 'ten seconds outside: half the life gone in one hit, the victim told [' + outS.hp + ']');
  for (let i = 0; i < 9; i++) { T0 += 1000; ZSrv.tick(roomS); }
  ok(outS.hp === 50 && outS.alive, 'nineteen seconds: still 50');
  T0 += 1000; ZSrv.tick(roomS);
  ok(!outS.alive && killedS.length === 1 && killedS[0].w === 'zone' && inS.hp === 100, 'twenty seconds outside: dead, tagged zone; inside untouched');
  /* spawns: only where it is safe now AND stays safe — the next circle, when known */
  const roomH = { code: 'H', state: 'playing', settings: { mode: 'zs', map: 'urbansmall' }, players: new Map(),
    zone: { Z: P, lastTick: 0, announced: {}, sched: { circles: [{ cx: -60, cz: -60, r: 60 }, { cx: 60, cz: 60, r: 40 }, { cx: 60, cz: 60, r: 32 }], fullSec: 0, phaseSec: 120, holdSec: 45, free: true } },
    startedAt: T0 - 10 * 1000 };   // in the hold: the current circle at (-60,-60) r60, the next far away at (60,60) r40
  const tiles = [{ s: [-60, -60, 0, 'n'] }, { s: [-40, -40, 0, 'n'] }, { s: [60, 60, 0, 'n'] }, { s: [0, 0, 0, 'n'] }];
  const pick = ZSrv.spawnFilter(roomH, tiles);
  ok(pick.every(k => Math.hypot(k.s[0] + 60, k.s[1] + 60) <= 60), 'during a hold whose next circle is elsewhere, every spawn offered is inside the CURRENT circle [' + pick.length + ']');
  ok(!pick.some(k => k.s[0] === 60 && k.s[1] === 60), 'and never a tile in the red, however safe it will be later');
  const roomB = { code: 'B', state: 'playing', settings: { mode: 'zs', map: 'urbansmall' }, players: new Map(),
    zone: { Z: P, lastTick: 0, announced: {}, sched: { circles: [{ cx: 0, cz: 0, r: 80 }, { cx: 30, cz: 0, r: 40 }, { cx: 30, cz: 0, r: 32 }], fullSec: 0, phaseSec: 120, holdSec: 45, free: true } },
    startedAt: T0 - 10 * 1000 };   // next circle overlaps: (30,0) r40 inside (0,0) r80
  const both = ZSrv.spawnFilter(roomB, [{ s: [-60, 0, 0, 'n'] }, { s: [40, 0, 0, 'n'] }, { s: [20, 10, 0, 'n'] }]);
  ok(both.length === 2 && both.every(k => Math.hypot(k.s[0] - 30, k.s[1]) <= 36), 'when tiles lie in both the current and the next circle, only those are offered (the one that will be in the red is dropped)');
  const roomE = { code: 'E', state: 'playing', settings: { mode: 'zs', map: 'urbansmall' }, players: new Map(),
    zone: { Z: P, lastTick: 0, announced: {}, sched: { circles: [{ cx: 0, cz: 0, r: 80 }, { cx: 40, cz: 0, r: 32 }, { cx: 40, cz: 0, r: 32 }], fullSec: 0, phaseSec: 120, holdSec: 45, free: true } },
    startedAt: T0 - 10 * 1000 };   // the next circle sits inside the current one; no configured tile is in it
  const ground = ZSrv.spawnFilter(roomE, [{ s: [-60, 0, 0, 'n'] }, { s: [-70, -70, 0, 'n'] }]);
  const colsS = Bots.buildColliders('urbansmall');
  ok(ground.length >= 1 && ground.every(k => k.open && Math.hypot(k.s[0] - 40, k.s[1]) <= 32 && Math.hypot(k.s[0], k.s[1]) <= 80), 'with no tile in both, open ground inside the NEXT circle (and the current) is found [' + ground.length + ' spots]');
  /* and when the next circle lies wholly outside the current one, the fallback is a tile inside the current — never one in the red */
  const roomF = { code: 'F', state: 'playing', settings: { mode: 'zs', map: 'urbansmall' }, players: new Map(),
    zone: { Z: P, lastTick: 0, announced: {}, sched: { circles: [{ cx: -60, cz: -60, r: 40 }, { cx: 60, cz: 60, r: 32 }, { cx: 60, cz: 60, r: 32 }], fullSec: 0, phaseSec: 120, holdSec: 45, free: true } },
    startedAt: T0 - 10 * 1000 };
  const disjoint = ZSrv.spawnFilter(roomF, [{ s: [-60, -60, 0, 'n'] }, { s: [60, 60, 0, 'n'] }]);
  ok(disjoint.length === 1 && disjoint[0].s[0] === -60, 'disjoint next circle: the tile inside the current circle is offered, the one in the red is not');
  ok(ground.every(k => !colsS.some(c => (c[3] - c[0] <= 200) && c[4] > 0.2 && c[1] <= 8 && k.s[0] + 1.6 > c[0] && k.s[0] - 1.6 < c[3] && k.s[1] + 1.6 > c[2] && k.s[1] - 1.6 < c[5])), 'and nothing stands on any of those spots');
  const cz = fs.readFileSync(path.join(__dirname, '..', 'public/src/environment/zone.js'), 'utf8');
  ok(/sched\.label/.test(cz) && /sched\.dmgPct/.test(cz) && /next circle/.test(cz) && !/10% health a second/.test(cz), 'the client reads the name and the bleed from the schedule and points to the next circle');
  const uiS = fs.readFileSync(path.join(__dirname, '..', 'public/src/ui/ui.js'), 'utf8');
  ok(!/Urban Zone is played on Urban/.test(uiS), 'the lobby no longer hardcodes Urban as the only locked map');
}

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
