/* ===== v1.0j - URBAN ZONE (server) =====
   The circle is rolled ONCE at match start (random final centre, nested
   phases — CFG.zoneSchedule) and sent with matchStart; from then on the server
   and every client read CFG.zoneCircleAt(schedule, matchTime) against the same
   match clock, like the train. Nothing about the circle is ever re-sent.

   Every `tickSec` seconds an alive player outside the current circle loses
   `dmgPct` of max HP straight off the HP — no vest, helmet or shield soaks it
   (the zone is not a bullet) — and dies at zero, tagged 'zone', no killer.
   10% a second is 10 s from full health to dead, which is Rahul's number.
   Airdrops in a zone match land inside the circle: loot.js asks cratePoints()
   for the points that will still be safe when the crate lands. */
const CFG = require('../../public/src/config/index.js');

module.exports = function initZone(ctx) {
  const { io, now, applyDamage } = ctx;

  function isZoneRoom(room) {
    const m = room && room.settings && CFG.MODES[room.settings.mode];
    return !!(m && m.zone);
  }
  function start(room) {
    if (!isZoneRoom(room)) { room.zone = null; return null; }
    const bound = (CFG.MAPS[room.settings.map || 'urban'] || {}).bound || 120;
    room.zone = { sched: CFG.zoneSchedule(Math.random, bound), lastTick: 0, announced: {} };
    return room.zone.sched;
  }
  function circleNow(room) {
    if (!room.zone || !room.startedAt) return null;
    return CFG.zoneCircleAt(room.zone.sched, (now() - room.startedAt) / 1000);
  }
  function tick(room) {
    if (!room.zone || room.state !== 'playing' || !room.startedAt) return;
    const Z = CFG.ZONE, t = now();
    const tSec = (t - room.startedAt) / 1000;
    const c = CFG.zoneCircleAt(room.zone.sched, tSec);
    /* announcements at the phase boundaries: "the zone is closing" once, and
       each new circle once */
    const A = room.zone.announced;
    if (tSec >= room.zone.sched.fullSec && !A.first) { A.first = true; io.to(room.code).emit('zoneNotice', { kind: 'first' }); }
    if (c.phase > 0 && !A['p' + c.phase] && !c.shrinking) { A['p' + c.phase] = true; io.to(room.code).emit('zoneNotice', { kind: 'phase', phase: c.phase, of: room.zone.sched.circles.length - 1, r: Math.round(c.r) }); }
    if (t - room.zone.lastTick < (Z.tickSec || 1) * 1000) return;
    room.zone.lastTick = t;
    const dmg = Math.round((CFG.PLAYER.hp || 100) * (Z.dmgPct || 10) / 100);
    for (const q of room.players.values()) {
      if (!q.alive || q.out) continue;
      if (CFG.zoneInside(c, q.pos[0], q.pos[2])) continue;
      q.hp -= dmg;
      if (q.hp <= 0) { q.hp = 1; applyDamage(room, q, 999, q.id, 'zone', false, true); continue; }
      io.to(q.id).emit('damaged', { dmg: dmg, hp: Math.round(q.hp), lv: q.armorLvl, du: Math.round(q.armorDur), sh: Math.round(q.shieldHp || 0), from: null, fromPos: null, zone: 1 });
    }
  }
  /* airdrop points that lie inside the circle as it will be when the crate
     lands; falls back to the points nearest the circle's centre */
  function cratePoints(room, pts, landInSec) {
    if (!room.zone || !room.startedAt) return pts;
    const c = CFG.zoneCircleAt(room.zone.sched, (now() - room.startedAt) / 1000 + (landInSec || 0));
    const rr = Math.max(4, c.r - 6);
    const inside = pts.filter(p => CFG.zoneInside({ cx: c.cx, cz: c.cz, r: rr }, p[0], p[1]));
    if (inside.length) return inside;
    /* No configured drop point inside the circle (a small late circle can miss
       all fourteen): find OPEN GROUND inside it — a spot with nothing standing
       within 1.6 m up to 8 m high, checked against the map's colliders — so
       the crate still lands in the safe zone, never on a roof or in a wall. */
    const cols = ctx.colliders ? (ctx.colliders(room.settings.map || 'urban') || []) : [];
    const clear = (x, z) => {
      for (const k of cols) {
        if (k[3] - k[0] > 200) continue;                                // the ground slab
        if (k[4] <= 0.2 || k[1] > 8) continue;
        if (x + 1.6 > k[0] && x - 1.6 < k[3] && z + 1.6 > k[2] && z - 1.6 < k[5]) return false;
      }
      return true;
    };
    const found = [];
    for (let i = 0; i < 400 && found.length < 3; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rr;
      const x = c.cx + Math.cos(a) * d, z = c.cz + Math.sin(a) * d;
      if (clear(x, z)) found.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    }
    if (found.length) return found;
    return [[Math.round(c.cx * 10) / 10, Math.round(c.cz * 10) / 10]];
  }
  function reset(room) { room.zone = null; }

  return { isZoneRoom, start, tick, cratePoints, circleNow, reset };
};
