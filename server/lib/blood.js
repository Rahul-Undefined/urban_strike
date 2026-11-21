/* blood.js — where people died (v2.16.0).

   Rahul: "blood stains hona chahiye map pe jaha avatar die hua h ... jitna log
   uss point pe maarega blood stains aur badhna chahiye ... woh blood stains
   entire match mei rehna chahiye", and: "blood stains should be applicable on
   the maps and all modes."

   The server keeps one short list per match, because a stain every player
   sees in the same place — including somebody who joins in the tenth minute —
   has to come from the one side that saw every death. It costs a few numbers:
     a pool is [x, y, z, n]: where the victim's body was, and how many died
     there. A death within MERGE metres of a pool (and on the same floor)
     GROWS it; otherwise it starts a new one.
   It rides the 'death' event that is sent anyway (five numbers) and the
   match-start payload for joiners. Nothing is added to the snapshot; nothing
   is ticked. The client decides what the floor is under each point and draws
   it (public/src/effects/blood.js).

   MAX is a ceiling, not a budget anyone should reach: past it a death grows
   the nearest pool wherever that is, so the list cannot grow without bound in
   an hour-long room. */
'use strict';
const MERGE = 2.6;        // m: closer than this (and within FLOOR of height) is the same pool
const FLOOR = 2.2;        // m: a death on the floor above is a different pool
const MAX = 260;
const r1 = (v) => Math.round(v * 10) / 10;

function start(room) { room.blood = []; }
function list(room) { return (room && room.blood) || []; }
/* returns [index, x, y, z, n] for the pool this death made or fed, or null */
function add(room, pos) {
  if (!room || !Array.isArray(pos) || pos.length < 3) return null;
  const x = +pos[0], y = +pos[1], z = +pos[2];
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
  const L = room.blood || (room.blood = []);
  let at = -1, best = MERGE * MERGE, far = -1, farD = Infinity;
  for (let i = 0; i < L.length; i++) {
    const dx = L[i][0] - x, dz = L[i][2] - z, d = dx * dx + dz * dz;
    if (d < farD) { farD = d; far = i; }
    if (d < best && Math.abs(L[i][1] - y) < FLOOR) { best = d; at = i; }
  }
  if (at < 0 && L.length >= MAX) at = far;
  if (at >= 0) {
    const b = L[at];
    /* the pool creeps toward where people keep dying, by less each time */
    b[0] = r1(b[0] + (x - b[0]) / (b[3] + 1)); b[2] = r1(b[2] + (z - b[2]) / (b[3] + 1));
    b[3]++;
    return [at, b[0], b[1], b[2], b[3]];
  }
  L.push([r1(x), r1(y), r1(z), 1]);
  return [L.length - 1, r1(x), r1(y), r1(z), 1];
}
module.exports = { start, list, add, MERGE, FLOOR, MAX };
