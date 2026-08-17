/* snapcodec.js — THE SNAPSHOT WIRE FORMAT, defined once.

   WHY THIS FILE EXISTS AT ALL

   The encoder lives on the server, the decoder in the browser, and test.js
   reads snapshots too. Three copies of a wire format is the drift failure this
   project keeps paying for (see the v8.9 note in verify-lifts.js about script
   lists). So the format is defined HERE, in a UMD module that Node `require`s
   and the browser loads as a script, and all three use the same code.

   WHAT PROBLEM IT SOLVES

   Measured on v9.7, the old format cost 153-198 bytes PER ENTITY PER SNAPSHOT,
   at 15 Hz, to every connected client:

       {"t":1786714962251,"players":{"sKq7bZ2xR11":{"p":[12.34,0.95,-56.78],
        "ry":1.234,"rx":-0.123,"cr":0,"mv":1,"wp":3,"ln":0.42,"hp":87,"lv":2,
        "du":81,"hl":1,"rl":0,"al":1,"tm":"b"}},"tk":{"a":3,"b":5}}

   Three separate kinds of waste in that one line:

     1. FIELD NAMES. `"ry":1.234,` is 11 characters to carry one number. Across
        14 fields that is more than half the packet.
     2. UNCHANGED VALUES. hp, lv, du, hl, rl, al, tm, wp and cr change on
        events — a hit, a pickup, a death — not every 67 ms. They were sent
        fifteen times a second regardless.
     3. IDENTITY. A socket id is 20 characters, repeated in full every tick.

   This format fixes all three:

     - entities are ARRAYS in a fixed field order, so no key names travel;
     - only CHANGED fields are sent, selected by a bitmask;
     - each entity gets a small integer slot, and its string id travels once.

   HOW DELTAS STAY CORRECT

   Socket.IO over WebSocket is TCP: ordered and reliable, so a client cannot
   miss a packet and silently desync. The two real hazards are a client that
   joins mid-match with no baseline, and an entity that leaves. Both are
   handled explicitly rather than hoped away:

     - JOINERS get a KEYFRAME (`k: 1`) — every field of every entity, plus the
       slot->id mapping. `encode()` is told when to produce one, and the server
       also emits one every few seconds as a standing safety net.
     - REMOVAL is by absence. Every live entity appears in every packet, at
       minimum as `[slot, 0]` (two characters), so a slot the client does not
       see this tick is genuinely gone. Making absence mean "unchanged" instead
       would leave dead players on screen forever.

   WHAT IS DELIBERATELY NOT DONE

   No interest management, no distance culling, no dropping of dead players.
   Every one of those changes what a client KNOWS, and this codebase uses
   remote state for the minimap, audio, hit registration and the kill feed —
   culling it to save bytes trades a bandwidth number against gameplay
   correctness, which is the wrong way round. This format sends exactly the
   same information as before; it just stops repeating itself.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnapCodec = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Quantisation. Positions to the centimetre and angles to the milliradian,
     which is what the old format already sent — `Math.round(x*100)/100` and
     `Math.round(ry*1000)/1000`. Sending the integer instead of the decimal is
     the same precision in fewer characters: 1234 rather than 12.34.
     NOTHING here is lossier than what shipped in v9.7. */
  var POS_Q = 100;      // centimetres
  var ANG_Q = 1000;     // milliradians
  var LN_Q = 100;       // lean, centimetres of travel

  /* POS was one flag covering x, y AND z. v10.3 splits the height off.

     A bot running across flat ground changes px and pz every tick - 0.29 m at
     walking speed, twenty-nine centimetre-units, always dirty - while py sits
     at exactly the same quantised value for hundreds of ticks at a time. Under
     the combined flag its two unchanging bytes rode along with every single
     position update, nineteen times a tick, for the whole match.

     Split, the delta test can finally reject something in bot mode. PY only
     goes on the wire when a player actually changes height: stairs, jumps,
     ramps, lifts, falling. That is the FIRST field in this format that a
     moving bot leaves clean.

     PY takes bit 14 rather than renumbering. CFG.WEAPON_ORDER is append-only
     for the same reason and for the same class of bug: a renumbered flag is a
     silent misread of every field after it. */
  var F = {
    POS: 1, RY: 2, RX: 4, MV: 8, CR: 16, WP: 32, LN: 64,
    HP: 128, ARM: 256, HL: 512, RL: 1024, AL: 2048, TM: 4096, ID: 8192,
    PY: 16384
  };

  /* The order fields are written in. Changing this list changes the wire
     format on both sides at once, which is the entire point of one file. */
  var ORDER = ['POS', 'PY', 'RY', 'RX', 'MV', 'CR', 'WP', 'LN', 'HP', 'ARM', 'HL', 'RL', 'AL', 'TM', 'ID'];

  function qi(v, q) { return Math.round((+v || 0) * q); }

  /* Build the compact per-entity state the encoder diffs against. Kept
     separate from encode() so the server can hold one of these per entity as
     "what the client last saw" without duplicating the quantisation rules. */
  function stateOf(p, slot) {
    return {
      slot: slot,
      id: p.id,
      px: qi(p.pos[0], POS_Q), py: qi(p.pos[1], POS_Q), pz: qi(p.pos[2], POS_Q),
      ry: qi(p.ry, ANG_Q), rx: qi(p.rx, ANG_Q),
      mv: p.mv | 0, cr: p.crouch | 0, wp: p.wp | 0, ln: qi(p.ln, LN_Q),
      hp: Math.round(p.hp) | 0, lv: p.armorLvl | 0, du: Math.round(p.armorDur) | 0,
      hl: p.helmLvl | 0, rl: p.rl | 0, al: p.alive ? 1 : 0, tm: p.team || 0
    };
  }

  /* One entity -> one array. `prev` is what the client already has, or null
     for a first appearance / keyframe. */
  function encodeEntity(s, prev, keyframe) {
    var flags = 0, out = [];
    var full = keyframe || !prev;

    if (full || s.px !== prev.px || s.pz !== prev.pz) {
      flags |= F.POS; out.push(s.px, s.pz);
    }
    if (full || s.py !== prev.py) { flags |= F.PY; out.push(s.py); }
    if (full || s.ry !== prev.ry) { flags |= F.RY; out.push(s.ry); }
    if (full || s.rx !== prev.rx) { flags |= F.RX; out.push(s.rx); }
    if (full || s.mv !== prev.mv) { flags |= F.MV; out.push(s.mv); }
    if (full || s.cr !== prev.cr) { flags |= F.CR; out.push(s.cr); }
    if (full || s.wp !== prev.wp) { flags |= F.WP; out.push(s.wp); }
    if (full || s.ln !== prev.ln) { flags |= F.LN; out.push(s.ln); }
    if (full || s.hp !== prev.hp) { flags |= F.HP; out.push(s.hp); }
    if (full || s.lv !== prev.lv || s.du !== prev.du) { flags |= F.ARM; out.push(s.lv, s.du); }
    if (full || s.hl !== prev.hl) { flags |= F.HL; out.push(s.hl); }
    if (full || s.rl !== prev.rl) { flags |= F.RL; out.push(s.rl); }
    if (full || s.al !== prev.al) { flags |= F.AL; out.push(s.al); }
    if (full || s.tm !== prev.tm) { flags |= F.TM; out.push(s.tm); }
    /* The id travels on first sight and on keyframes only. It is 20 characters
       and it never changes, so repeating it fifteen times a second was the
       single largest constant cost in the old format. */
    if (full) { flags |= F.ID; out.push(s.id); }

    return [s.slot, flags].concat(out);
  }

  /* Decode one entity array on top of a cached previous value. Returns the
     merged state; the caller owns the cache. */
  function decodeEntity(arr, cache) {
    var slot = arr[0], flags = arr[1] | 0, i = 2;
    var s = cache[slot];
    if (!s) s = cache[slot] = { slot: slot, id: null, px: 0, py: 0, pz: 0, ry: 0, rx: 0,
      mv: 0, cr: 0, wp: 0, ln: 0, hp: 100, lv: 0, du: 0, hl: 0, rl: 0, al: 1, tm: 0 };
    if (flags & F.POS) { s.px = arr[i++]; s.pz = arr[i++]; }
    if (flags & F.PY) { s.py = arr[i++]; }
    if (flags & F.RY) s.ry = arr[i++];
    if (flags & F.RX) s.rx = arr[i++];
    if (flags & F.MV) s.mv = arr[i++];
    if (flags & F.CR) s.cr = arr[i++];
    if (flags & F.WP) s.wp = arr[i++];
    if (flags & F.LN) s.ln = arr[i++];
    if (flags & F.HP) s.hp = arr[i++];
    if (flags & F.ARM) { s.lv = arr[i++]; s.du = arr[i++]; }
    if (flags & F.HL) s.hl = arr[i++];
    if (flags & F.RL) s.rl = arr[i++];
    if (flags & F.AL) s.al = arr[i++];
    if (flags & F.TM) s.tm = arr[i++];
    if (flags & F.ID) s.id = arr[i++];
    return s;
  }

  /* Back to the shape the rest of the client already expects, so nothing
     downstream of net.js has to learn about slots or quantisation. */
  function toPlayerState(s) {
    return {
      p: [s.px / POS_Q, s.py / POS_Q, s.pz / POS_Q],
      ry: s.ry / ANG_Q, rx: s.rx / ANG_Q,
      cr: s.cr, mv: s.mv, wp: s.wp, ln: s.ln / LN_Q,
      hp: s.hp, lv: s.lv, du: s.du, hl: s.hl, rl: s.rl,
      al: s.al, tm: s.tm || null, id: s.id
    };
  }

  /* ===== v10.3 - THE ENTITY BLOCK IS BINARY =====

     Render billed 5.8 GB of egress, essentially all of it WebSocket responses.
     Measured on the shape that produced it - 1 human + 19 bots on Urban - the
     server was sending 459 bytes a packet at 15 Hz, 5.4 KB/s, 18.5 MB per
     player-hour.

     WHY THE DELTA ENCODER STOPPED HELPING. v9.8 cut 87% by sending only fields
     that CHANGED, and that measurement was taken against a room of humans, who
     spend most of a match standing still, walking in straight lines or dead. A
     BOT NEVER STOPS. Nineteen of them move, turn and look every single tick, so
     POS, RY and RX are dirty on every entity on every tick and the delta test
     rejects nothing. Bot mode is close to the worst case this format has, which
     is exactly the mode that ran up the bill.

     There is nothing left to remove - every field being sent is a field that
     changed. What is left is HOW it is written. The array
     [5,99,1234,95,-4567,-3141,120] is thirteen bytes of information typed out
     as twenty-nine characters of JSON: sign characters, commas, brackets, and
     decimal digits at roughly 3.3 bits each instead of 8.

     So the entity block travels as a Buffer. Measured on the real packet shape:
     32.5 B/entity of JSON becomes 14 B/entity of binary, 56% off the part that
     is 90% of the packet.

     WHAT DELIBERATELY DID NOT CHANGE:
       - the quantisation. POS_Q, ANG_Q and LN_Q are untouched, so a decoded
         value is bit-identical to what the JSON path produced. This is an
         ENCODING change, not a precision change, and verify-netcodec asserts
         equality rather than closeness.
       - the delta logic, the flags, the field order, slot assignment, keyframe
         cadence, and "absence means removed".
       - the client-facing shape. toPlayerState returns exactly what it did, so
         nothing downstream of net.js knows this happened.
       - drones and team kills still ride as ordinary JSON keys beside the
         buffer. They are small and occasional; converting them would add
         format surface for almost no bytes.

     Nothing is culled by distance or relevance. The comment at the top of this
     file is still the rule: culling trades a bandwidth number against gameplay
     correctness, and that is the wrong way round.

     Field widths are chosen so nothing can silently clip:
       slot   uint16   slots are handed out monotonically and never recycled
       flags  uint16   fourteen flags today
       pos    int16    at POS_Q 100 that is +/-327 m against a 100 m bound
       ry/rx  int16    at ANG_Q 1000 that is +/-32.7 rad against +/-pi
       hp/du  int16    ln int16, the rest uint8
     A value that would clip is a bug in the sender, so writeI16 asserts in
     place rather than wrapping quietly. */

  var BYTES = { POS: 4, PY: 2, RY: 2, RX: 2, MV: 1, CR: 1, WP: 1, LN: 2, HP: 2, ARM: 3, HL: 1, RL: 1, AL: 1, TM: 1 };

  function clipCheck(v, lo, hi, what) {
    if (v < lo || v > hi) {
      /* Loud, because a clipped position is a player teleporting and a silent
         wrap would be diagnosed as a netcode bug for weeks. */
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[snapcodec] ' + what + ' out of range: ' + v);
      }
      return v < lo ? lo : hi;
    }
    return v;
  }

  /* Upper bound on the encoded size of one entity, used to size the scratch
     buffer. Two bytes slot, two flags, plus every field, plus a 64-byte id. */
  var MAX_ENT = 4 + 6 + 2 + 2 + 1 + 1 + 1 + 2 + 2 + 3 + 1 + 1 + 1 + 16 + 1 + 64;

  function makeBuf(n) {
    if (typeof Buffer !== 'undefined') return Buffer.allocUnsafe(n);
    return new Uint8Array(n);
  }

  /* Encode the whole entity list. `ents` is the array of arrays that
     encodeEntity already produces, so the delta decision and this are cleanly
     separated and the JSON path stays testable. */
  function encodeEntities(ents) {
    var buf = makeBuf(2 + ents.length * MAX_ENT);
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var o = 0;
    dv.setUint16(o, ents.length); o += 2;
    for (var n = 0; n < ents.length; n++) {
      var a = ents[n], flags = a[1] | 0, i = 2;
      dv.setUint16(o, a[0] | 0); o += 2;
      dv.setUint16(o, flags); o += 2;
      if (flags & F.POS) {
        dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'px')); o += 2;
        dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'pz')); o += 2;
      }
      if (flags & F.PY) { dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'py')); o += 2; }
      if (flags & F.RY) { dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'ry')); o += 2; }
      if (flags & F.RX) { dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'rx')); o += 2; }
      if (flags & F.MV) { dv.setUint8(o, a[i++] & 255); o += 1; }
      if (flags & F.CR) { dv.setUint8(o, a[i++] & 255); o += 1; }
      if (flags & F.WP) { dv.setUint8(o, a[i++] & 255); o += 1; }
      if (flags & F.LN) { dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'ln')); o += 2; }
      if (flags & F.HP) { dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'hp')); o += 2; }
      if (flags & F.ARM) {
        dv.setUint8(o, a[i++] & 255); o += 1;
        dv.setInt16(o, clipCheck(a[i++] | 0, -32768, 32767, 'du')); o += 2;
      }
      if (flags & F.HL) { dv.setUint8(o, a[i++] & 255); o += 1; }
      if (flags & F.RL) { dv.setUint8(o, a[i++] & 255); o += 1; }
      if (flags & F.AL) { dv.setUint8(o, a[i++] & 255); o += 1; }
      if (flags & F.TM) {
        /* TEAM IS A STRING, NOT A NUMBER. It is a side id like "a" or "b" from
           CFG.botSideOf, and null in free-for-all. The first cut of this
           encoder wrote it as a uint8, so `'b' & 255` became 0 and every player
           on the wire collapsed onto one side - test.js caught it immediately
           with "every bot is on side B" and "no bot shares a side with an
           operator". Written as a length-prefixed string like the id, which
           costs one extra byte on a field that only moves when someone changes
           team. */
        var tm = (a[i++] || ''), tmS = (typeof tm === 'string') ? tm : String(tm);
        var tL = Math.min(tmS.length, 15);
        dv.setUint8(o, tL); o += 1;
        for (var tc = 0; tc < tL; tc++) { dv.setUint8(o, tmS.charCodeAt(tc) & 255); o += 1; }
      }
      if (flags & F.ID) {
        var id = String(a[i++] || ''), L = Math.min(id.length, 63);
        dv.setUint8(o, L); o += 1;
        /* Socket ids are base64url from socket.io, so one byte per character.
           Truncating at 63 rather than throwing: an id longer than that cannot
           happen, and a match that keeps running beats one that dies. */
        for (var c = 0; c < L; c++) { dv.setUint8(o, id.charCodeAt(c) & 255); o += 1; }
      }
    }
    return buf.slice ? buf.slice(0, o) : new Uint8Array(buf.buffer, 0, o);
  }

  /* Decode back to the SAME array-of-arrays encodeEntity produces, so
     decodeEntity is reused untouched and there is only one place that knows
     what a flag means. */
  function decodeEntities(src) {
    var u8 = (src instanceof Uint8Array) ? src : new Uint8Array(src);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var o = 0, count = dv.getUint16(o); o += 2;
    var out = [];
    for (var n = 0; n < count; n++) {
      var slot = dv.getUint16(o); o += 2;
      var flags = dv.getUint16(o); o += 2;
      var a = [slot, flags];
      if (flags & F.POS) { a.push(dv.getInt16(o), dv.getInt16(o + 2)); o += 4; }
      if (flags & F.PY) { a.push(dv.getInt16(o)); o += 2; }
      if (flags & F.RY) { a.push(dv.getInt16(o)); o += 2; }
      if (flags & F.RX) { a.push(dv.getInt16(o)); o += 2; }
      if (flags & F.MV) { a.push(dv.getUint8(o)); o += 1; }
      if (flags & F.CR) { a.push(dv.getUint8(o)); o += 1; }
      if (flags & F.WP) { a.push(dv.getUint8(o)); o += 1; }
      if (flags & F.LN) { a.push(dv.getInt16(o)); o += 2; }
      if (flags & F.HP) { a.push(dv.getInt16(o)); o += 2; }
      if (flags & F.ARM) { a.push(dv.getUint8(o), dv.getInt16(o + 1)); o += 3; }
      if (flags & F.HL) { a.push(dv.getUint8(o)); o += 1; }
      if (flags & F.RL) { a.push(dv.getUint8(o)); o += 1; }
      if (flags & F.AL) { a.push(dv.getUint8(o)); o += 1; }
      if (flags & F.TM) {
        var tL = dv.getUint8(o); o += 1;
        var tm = '';
        for (var tc = 0; tc < tL; tc++) { tm += String.fromCharCode(dv.getUint8(o)); o += 1; }
        /* Empty means FFA. stateOf normalises null to 0 and toPlayerState turns
           0 back into null, so '' must decode to something falsy that survives
           that round trip unchanged. */
        a.push(tm === '' ? 0 : tm);
      }
      if (flags & F.ID) {
        var L = dv.getUint8(o); o += 1;
        var id = '';
        for (var c = 0; c < L; c++) { id += String.fromCharCode(dv.getUint8(o)); o += 1; }
        a.push(id);
      }
      out.push(a);
    }
    return out;
  }

  return {
    FLAGS: F, ORDER: ORDER, POS_Q: POS_Q, ANG_Q: ANG_Q, LN_Q: LN_Q, BYTES: BYTES,
    stateOf: stateOf, encodeEntity: encodeEntity,
    decodeEntity: decodeEntity, toPlayerState: toPlayerState,
    encodeEntities: encodeEntities, decodeEntities: decodeEntities
  };
});
