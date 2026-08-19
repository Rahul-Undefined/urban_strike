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

  /* ===== v10.5 - THIS FILE IS BACK TO THE v9.15 FORMAT, DELIBERATELY =====

     v10.3 split height into a separate PY flag and shipped the entity block as
     a binary attachment, to cut Render egress. Reverted whole after the game
     became unplayable - avatars teleporting, shots not registering - and after
     Rahul chose to pay for bandwidth instead.

     THE BINARY BLOCK FAILED FOR A REASON THAT HAS NOTHING TO DO WITH ENCODING.
     socket.io does not put a binary event on the wire as one frame. It sends a
     JSON ENVELOPE carrying a `_placeholder`, then the attachment as a SEPARATE
     frame, and the client must hold the envelope until the attachment arrives
     before it can emit the event at all. Every snapshot became two frames plus
     a reassembly step, fifteen times a second, and any delay to the second
     frame stalls the first. The payload got 54% smaller and the STREAM got
     worse. For a shooter that is the wrong trade in the wrong direction.

     DO NOT REDO THE BANDWIDTH WORK WITHOUT THAT FACT IN FRONT OF YOU. If it is
     ever revisited, the thing to measure is ARRIVAL JITTER
     (tools/diag-jitter.js), not packet size. A smaller packet that arrives late
     is a regression, and this format's whole job is to arrive on time. */
  var F = {
    POS: 1, RY: 2, RX: 4, MV: 8, CR: 16, WP: 32, LN: 64,
    HP: 128, ARM: 256, HL: 512, RL: 1024, AL: 2048, TM: 4096, ID: 8192
  };

  /* The order fields are written in. Changing this list changes the wire
     format on both sides at once, which is the entire point of one file. */
  var ORDER = ['POS', 'RY', 'RX', 'MV', 'CR', 'WP', 'LN', 'HP', 'ARM', 'HL', 'RL', 'AL', 'TM', 'ID'];

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

    if (full || s.px !== prev.px || s.py !== prev.py || s.pz !== prev.pz) {
      flags |= F.POS; out.push(s.px, s.py, s.pz);
    }
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
    if (flags & F.POS) { s.px = arr[i++]; s.py = arr[i++]; s.pz = arr[i++]; }
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

  return {
    FLAGS: F, ORDER: ORDER, POS_Q: POS_Q, ANG_Q: ANG_Q, LN_Q: LN_Q,
    stateOf: stateOf, encodeEntity: encodeEntity,
    decodeEntity: decodeEntity, toPlayerState: toPlayerState
  };
});
