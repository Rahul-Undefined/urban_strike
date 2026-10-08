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
   for the points that will still be safe when the crate lands.
   v2.4: the numbers come from the MODE's profile (CFG.zoneParams): Urban Zone
   keeps the above; URBAN SMALL ZONE is a free circle every 2 minutes and 50%
   per 10 s, counted per player. */
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
    /* v2.4: the mode's profile (Urban: the minute circles, 10%/s; Urban Small
       Zone: a free circle every 2 min, 50%/10 s) — resolved once, kept on the
       room for the bleed, and its numbers ride in the schedule for the client */
    const Z = CFG.zoneParams ? CFG.zoneParams(room.settings.mode) : CFG.ZONE;
    room.zone = { sched: CFG.zoneSchedule(Math.random, bound, room.settings.map || 'urban', Z), Z: Z, lastTick: 0, announced: {} };   /* v2.2: per-map extent */
    for (const q of room.players.values()) q.zoneOutAt = 0;
    return room.zone.sched;
  }
  function circleNow(room) {
    if (!room.zone || !room.startedAt) return null;
    return CFG.zoneCircleAt(room.zone.sched, (now() - room.startedAt) / 1000);
  }
  function tick(room) {
    if (!room.zone || room.state !== 'playing' || !room.startedAt) return;
    const Z = room.zone.Z || CFG.ZONE, t = now();
    const tSec = (t - room.startedAt) / 1000;
    const c = CFG.zoneCircleAt(room.zone.sched, tSec);
    /* announcements at the phase boundaries: "the zone is closing" once, and
       each new circle once */
    const A = room.zone.announced;
    if (tSec >= room.zone.sched.fullSec && !A.first) { A.first = true; io.to(room.code).emit('zoneNotice', { kind: 'first' }); }
    if (c.phase > 0 && !A['p' + c.phase] && !c.shrinking) { A['p' + c.phase] = true; io.to(room.code).emit('zoneNotice', { kind: 'phase', phase: c.phase, of: room.zone.sched.circles.length - 1, r: Math.round(c.r) }); }
    /* ===== v2.4 - THE BLEED IS COUNTED PER PLAYER =====
       It used to be one room-wide metronome: everyone outside took the hit on
       the same second. At 1 s that was invisible; at Urban Small Zone's 10 s
       tick it would mean a player who stepped out a second before the beat
       lost half their life at once. So each player now carries their own
       clock (`zoneOutAt`, the moment they were last found outside or last
       hit): the first hit lands tickSec after they left the circle and the
       next every tickSec after that; stepping back inside clears it. Urban's
       1 s tick is unchanged in effect — 10 s outside is still death. */
    const tickMs = (Z.tickSec || 1) * 1000;
    const dmg = Math.round((CFG.PLAYER.hp || 100) * (Z.dmgPct || 10) / 100);
    for (const q of room.players.values()) {
      if (!q.alive || q.out) { q.zoneOutAt = 0; continue; }
      if (CFG.zoneInside(c, q.pos[0], q.pos[2])) { q.zoneOutAt = 0; continue; }
      if (!q.zoneOutAt) { q.zoneOutAt = t; continue; }   // just stepped out: the clock starts now
      if (t - q.zoneOutAt < tickMs) continue;
      q.zoneOutAt += tickMs;                             // beat-locked, never drifts with the snapshot rate
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
    const found = openGround(room, c.cx, c.cz, rr, 3);
    if (found.length) return found;
    return [[Math.round(c.cx * 10) / 10, Math.round(c.cz * 10) / 10]];
  }
  /* v2.4: the open-ground finder, shared by the crates and the spawns — up to
     `want` spots within `rr` of (cx, cz) with nothing standing within 1.6 m up
     to 8 m high, checked against the map's colliders. Also keeps the spot
     inside the map's walls (the free roll lets a big circle overhang them). */
  function openGround(room, cx, cz, rr, want) {
    const mapId = room.settings.map || 'urban';
    const cols = ctx.colliders ? (ctx.colliders(mapId) || []) : [];
    const E = (CFG.MAPS[mapId] || {}).ext, bd = (CFG.MAPS[mapId] || {}).bound || 120;
    const X0 = E ? E.x0 : -bd, X1 = E ? E.x1 : bd, Z0 = E ? E.z0 : -bd, Z1 = E ? E.z1 : bd;
    const clear = (x, z) => {
      if (x < X0 + 3 || x > X1 - 3 || z < Z0 + 3 || z > Z1 - 3) return false;
      for (const k of cols) {
        if (k[3] - k[0] > 200) continue;                                // the ground slab
        if (k[4] <= 0.2 || k[1] > 8) continue;
        if (x + 1.6 > k[0] && x - 1.6 < k[3] && z + 1.6 > k[2] && z - 1.6 < k[5]) return false;
      }
      return true;
    };
    const found = [];
    for (let i = 0; i < 400 && found.length < (want || 3); i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rr;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (clear(x, z)) found.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    }
    return found;
  }
  /* v1.0u: respawns land INSIDE the circle — the spawn candidates that will be
     safe now; if none, the ones nearest the centre. */
  /* v2.4 (Rahul: "spawn in the active location only, not in the location
     already shortened"): a respawn lands on ground that is safe NOW and will
     STILL be safe — when the next circle is known (the hold, or the wall on
     its way there) the tile must sit inside both, because with the free roll
     the next circle can be on the other side of the map and a tile that is
     merely inside today's wall is a tile the wall walks away from. If no
     configured tile satisfies that, open ground inside the circle is found
     through the map's colliders (the crates' finder) rather than the old
     "nearest two" — which could hand back a tile in the red. The nearest-two
     rule survives only as the last resort, when the collider harness is down. */
  function spawnFilter(room, candidates) {
    if (!room.zone || !room.startedAt || !candidates || !candidates.length) return candidates;
    const c = CFG.zoneCircleAt(room.zone.sched, (now() - room.startedAt) / 1000 + 2);
    const cur = { cx: c.cx, cz: c.cz, r: Math.max(3, c.r - 4) };
    const nxt = c.next ? { cx: c.next.cx, cz: c.next.cz, r: Math.max(3, c.next.r - 4) } : null;
    const inBoth = candidates.filter(k => CFG.zoneInside(cur, k.s[0], k.s[1]) && (!nxt || CFG.zoneInside(nxt, k.s[0], k.s[1])));
    if (inBoth.length) return inBoth;
    const inside = candidates.filter(k => CFG.zoneInside(cur, k.s[0], k.s[1]));
    if (inside.length && !nxt) return inside;
    /* open ground inside the circle — the smaller of the two when a next is
       known (the next circle, where the ground stays safe), else the current */
    const tgt = nxt && nxt.r < cur.r ? nxt : cur;
    const spots = openGround(room, tgt.cx, tgt.cz, Math.max(2, tgt.r - 2), 4)
      .filter(p => CFG.zoneInside(cur, p[0], p[1]) || tgt === cur);
    if (spots.length) return spots.map((p, i) => ({ s: [p[0], p[1], Math.random() * Math.PI * 2, 'n'], i: -1 - i, open: true }));
    if (inside.length) return inside;
    return candidates.slice().sort((a, b) => Math.hypot(a.s[0] - c.cx, a.s[1] - c.cz) - Math.hypot(b.s[0] - c.cx, b.s[1] - c.cz)).slice(0, 2);
  }
  function reset(room) { room.zone = null; }

  return { isZoneRoom, start, tick, cratePoints, circleNow, reset, spawnFilter, openGround };
};
