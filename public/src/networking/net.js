/* Net — client networking + remote player rendering.
   Remote players are drawn ~120 ms in the past and interpolated between
   server snapshots, which is what makes movement look smooth over the wire. */
var Net = (function () {
  var socket = null;
  var myIdV = null;
  var phase = 'menu'; // menu | lobby | playing | ended
  var isHost = false;
  var roomCode = '';
  var remotes = {};   // id -> remote record
  var roster = [];    // lobby payload players (names/colors/scores)
  var ping = 0;
  var match = { killTarget: 15, minutes: 10, mode: 'ffa', startedAt: 0, serverOffset: 0 };
  /* v9.8: the delta baseline. snapCache holds the last known state per wire
     slot; slotToId maps a slot back to the player id everything else uses. */
  var snapCache = {}, slotToId = {};
  /* v9.11 RECONNECT. The token is kept in sessionStorage rather than a
     variable, so a page refresh — the most common way people "lose" a match —
     can restore the seat too. sessionStorage and not localStorage: the session
     ends with the tab, which is the right lifetime for a match seat. */
  var SKEY = 'us.session';
  function saveSession(code, token) {
    try { sessionStorage.setItem(SKEY, JSON.stringify({ code: code, token: token, at: Date.now() })); } catch (e) {}
  }
  function loadSession() {
    try {
      var v = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
      /* Older than the server's 45 s hold plus slack is not worth trying. */
      if (!v || Date.now() - v.at > 90000) return null;
      return v;
    } catch (e) { return null; }
  }
  function clearSession() { try { sessionStorage.removeItem(SKEY); } catch (e) {} }
  var teamKills = {};                // v8.34: sized by the server, not assumed
  var myTeam = null;
  var scene = null;
  var P = CFG.PLAYER;

  function init(sceneRef) { scene = sceneRef; }

  function connect() {
    if (socket && socket.connected) return;
    socket = io();
    bind(socket);
  }

  function ensureRemote(rp) {
    if (rp.id === myIdV) return null;
    var r = remotes[rp.id];
    if (!r) {
      var av = Avatars.buildAvatar(rp.name, rp.color);
      /* v10.13: the dead are re-dressed on top of the ordinary rig, so they
         inherit every pose, topple and hitbox an operator has and the server
         needs no special case for hitting one. */
      if (rp.zombie || (rp.id && rp.id.charAt(0) === 'z' && rp.ztype)) {
        Avatars.makeZombie(av, rp.ztype);
      }
      applyVisorTo(av);          // v10.10: joins mid-visor must be visible at once
      scene.add(av.group);
      r = remotes[rp.id] = {
        id: rp.id, name: rp.name, color: rp.color, team: rp.team || null,
        av: av, buf: [], alive: false, crouch: false, mv: 0,
        hp: 100, dispHp: 100, hbDrawn: -1, lastShotAt: 0, lastDamagedAt: 0,
        renderPos: new THREE.Vector3(0, -50, 0), ry: 0, rx: 0, ln: 0,
        stepAcc: 0, lastRP: new THREE.Vector3(0, -50, 0),
        gunName: null
      };
      Avatars.setRemoteGun(r, 0);
      av.group.visible = false;
    }
    return r;
  }
  /* v10.9: scene.remove() unparents; it does not free GPU memory. A leaver's
     name-tag and hp-bar textures survived every departure, and a player who
     refreshed and rejoined arrived under a NEW socket id — so every other
     client built a second avatar and stranded the first. That is the cascade
     behind "one person drops at a time". Avatars owns the list of what is
     genuinely per-player; see disposeAvatar. */
  /* v10.10 RECON VISOR. One flag and a loop over the avatars that already
     exist; new arrivals read `visorOn` when they are built. Toggling
     `visible` on a mesh that is already in the scene graph costs nothing —
     there is no allocation and no material change, which matters because the
     materials are shared (v10.9). */
  var visorOn = false;
  function setVisor(on) {
    visorOn = !!on;
    for (var id in remotes) {
      var r = remotes[id];
      if (r && r.av && r.av.xray) r.av.xray.visible = visorOn;
    }
    if (UI.setVisorHud) UI.setVisorHud(visorOn);
  }
  function visorActive() { return visorOn; }

  /* v10.10: a player who joins or respawns while you are wearing a visor must
     be visible through walls immediately. setVisor() only walks the avatars
     that existed when it ran, so the flag is re-read here at build time. */
  function applyVisorTo(av) { if (av && av.xray) av.xray.visible = visorOn; }

  function removeRemote(id) {
    var r = remotes[id];
    if (r) { scene.remove(r.av.group); Avatars.disposeAvatar(r.av); delete remotes[id]; }
  }

  function bind(s) {
    s.on('connect', function () {
      var wasConnected = !!myIdV;
      myIdV = s.id;
      /* First connect is a normal join; a LATER one is a recovery. */
      if (wasConnected) attemptRejoin(s);
    });
    s.on('disconnect', function () {
      if (phase === 'playing') UI.toast('Connection lost \u2014 reconnecting\u2026', true);
    });

    /* The launch countdown fires in the LOBBY, so its handler must exist from
       the moment we connect. It used to live in bindGameplayEvents(), which
       only runs on matchStart — i.e. after the countdown has already finished.
       Every 5..1 tick was emitted by the server and dropped on the floor. */
    s.on('countdown', function (d) { UI.setCountdown(d.n); });

    s.on('lobby', function (d) {
      roster = d.players;
      roomCode = d.code;
      isHost = (d.hostId === myIdV);
      match.killTarget = d.settings.killTarget;
      match.minutes = d.settings.minutes;
      snapCache = {}; slotToId = {};   // v9.8: never carry slots across a match
      Minimap.clearMarks();            // v9.10: markers do not survive a match
      match.mode = d.settings.mode || 'ffa';
      var me = d.players.find(function (p) { return p.id === myIdV; });
      myTeam = me ? (me.team || null) : myTeam;
      d.players.forEach(function (p) {
        if (p.id === myIdV) return;
        var ex = remotes[p.id];
        if (ex && ex.color !== p.color) removeRemote(p.id); // team recolor -> rebuild avatar
        var r2 = ensureRemote(p);
        if (r2) r2.team = p.team || null;
      });
      for (var id in remotes) {
        if (!d.players.some(function (p) { return p.id === id; })) removeRemote(id);
      }
      UI.updateLobby(d, myIdV);
      UI.updateScoreboard(roster, myIdV, roomCode, remotesPing());
    });

    s.on('toast', function (d) { UI.toast(d.msg); });
    s.on('playerLeft', function (d) { removeRemote(d.id); UI.toast(d.name + ' disconnected'); });

    s.on('matchStart', function (d) {
      phase = 'playing';
      match.killTarget = d.settings.killTarget;
      match.minutes = d.settings.minutes;
      snapCache = {}; slotToId = {};   // v9.8: never carry slots across a match
      Minimap.clearMarks();            // v9.10: markers do not survive a match
      match.mode = d.settings.mode || 'ffa';
      match.startedAt = d.startedAt;
      match.serverOffset = d.serverNow - Date.now();
      roster = d.players;
      var me = d.players.find(function (p) { return p.id === myIdV; });
      myTeam = me ? (me.team || null) : null;
      teamKills = {};                  // v8.34
      Game.onMatchStart(d);
    });

    /* ===== v9.8 DELTA SNAPSHOTS =====
       The packet is now `{ e: [[slot, flags, ...changed], ...], k?, tk?, dr? }`
       and the decode lives in SnapCodec so the server, this file and test.js
       cannot drift apart. See that file's header for the format and for why
       nothing was culled to get the saving.

       Two invariants this handler depends on:
         - every LIVE entity appears in every packet, so a slot that is absent
           has genuinely left and its avatar must be removed;
         - a keyframe (`k`) carries every field of every entity including the
           slot->id mapping, and one is sent on join, so a client that arrives
           mid-match is never decoding against an empty cache. */
    s.on('snap', function (d) {
      var tLocal = performance.now();
      if (d.tk !== undefined) teamKills = d.tk || {};
      Pickups.droneSync(d.dr);          // undefined when none are airborne
      if (!d.e) return;

      var seen = {};
      for (var n = 0; n < d.e.length; n++) {
        var raw = SnapCodec.decodeEntity(d.e[n], snapCache);
        seen[raw.slot] = 1;
        if (!raw.id) continue;                       // no identity yet, wait for a keyframe
        slotToId[raw.slot] = raw.id;
        var st = SnapCodec.toPlayerState(raw);
        var id = raw.id;
        if (id === myIdV) { UI.setVitals(st.hp, st.lv, st.du); continue; }
        var r = remotes[id];
        if (!r) {
          var known = roster.find(function (p) { return p.id === id; });
          r = ensureRemote(known || { id: id, name: '???', color: '#888' });
          if (!r) continue;
        }
        /* ===== v9.13 — A TELEPORT MUST NOT BE INTERPOLATED =====
           Reported as players "achanak se ek jagah se dusre jagah aa ja rahe
           hai" — jumping from one place to another — with shots not registering
           and then the bot dying all at once.

           Measured over a 20 s Overrun match: packet timing was perfect (66 ms
           median, zero gaps over 150 ms) but the stream carried 44 position
           jumps of up to 158 m. Forty-one were respawns and three had no cause
           at all.

           The interpolator was doing exactly what it was built to do with them:
           LERPING. A respawned bot slid smoothly across the whole map over the
           next 67 ms, and for that whole slide the avatar you can see is
           nowhere near where the server says it is — so your shots are refused
           by the 4 m plausibility check, and then land the instant it settles.
           That is precisely the "shoot kar rahe lekin bot ko kuch nhi ho raha,
           aur achanak se marr ja raha" symptom.

           A body cannot cross more than about 0.45 m in one tick at sprint. Two
           and a half metres is impossible by any means the game has, so it is a
           teleport, and a teleport is SNAPPED. The buffer is dropped rather
           than extended, which is what the existing `spawn` handler already
           does for the respawns it knows about — this covers the ones nothing
           announces. */
        var prevBuf = r.buf.length ? r.buf[r.buf.length - 1] : null;
        if (prevBuf) {
          var jx = st.p[0] - prevBuf.p[0], jy = st.p[1] - prevBuf.p[1], jz = st.p[2] - prevBuf.p[2];
          if (jx * jx + jy * jy + jz * jz > 6.25) {          // 2.5 m
            r.buf.length = 0;
            r.renderPos.set(st.p[0], st.p[1], st.p[2]);
            if (r.lastRP) r.lastRP.copy(r.renderPos);
          }
        }
        r.buf.push({ t: tLocal, p: st.p, ry: st.ry, rx: st.rx, cr: st.cr, mv: st.mv, ln: st.ln });
        Avatars.setRemoteGun(r, st.wp); // replicate equipped weapon (switches, pickups, late sync)
        if (r.buf.length > 40) r.buf.shift();
        if (st.hp < r.hp) r.lastDamagedAt = tLocal;
        r.hp = st.hp;
        r.team = st.tm || null;
        if (r.alive && !st.al) r.deadAt = performance.now();
        r.alive = !!st.al;
      }
      /* Absence means gone. Without this a player who disconnects mid-match
         leaves an avatar standing wherever they were last seen. */
      for (var sl in snapCache) {
        if (seen[sl]) continue;
        var goneId = slotToId[sl];
        delete snapCache[sl]; delete slotToId[sl];
        if (goneId && remotes[goneId]) removeRemote(goneId);
      }
    });

    s.on('vitals', function (d) { UI.setVitals(d.hp, d.lv, d.du); });
    /* v10.10 NUKE — killhouse killstreak. The client is told it HAS one; it
       never decides that for itself. See server/lib/nuke.js. */
    s.on('nukeReady', function (d) { UI.nukeReady(d); });
    s.on('nukeLost', function (d) { UI.nukeLost(d && d.reason); });
    s.on('nukeIncoming', function (d) { UI.nukeIncoming(d); FX.nukeStart(d); });
    s.on('nukeEnd', function () { FX.nukeEnd(); });
    s.on('pickup', function (d) { Pickups.onCollected(d, d.by === myIdV); });
    s.on('pickupSpawn', function (d) { Pickups.onSpawn(d.id); });
    s.on('grant', function (d) { Weapons.applyGrant(d); });
    s.on('airdrop', function (d) {
      Pickups.airdrop(d.x, d.z, d.landAt);
      UI.toast('SUPPLY DROP INBOUND');
    });
    s.on('lootAdd', function (d) { Pickups.onAdd(d.items); });

    s.on('spawn', function (d) {
      if (d.id === myIdV) { Game.onLocalSpawn(d.pos, d.ry, d.prot); }
      else {
        var r = remotes[d.id];
        if (r) { r.buf = []; r.alive = true; r.renderPos.set(d.pos[0], d.pos[1], d.pos[2]); }
      }
    });

    s.on('damaged', function (d) {
      UI.setVitals(d.hp, d.lv, d.du);
      FX.damageFlash(0.3);
      FX.shake(0.12);
      if (d.fromPos) {
        var dx = d.fromPos[0] - PlayerCtl.pos.x, dz = d.fromPos[2] - PlayerCtl.pos.z;
        var worldAng = Math.atan2(dx, -dz);
        FX.damageDirection(worldAng - PlayerCtl.yaw);
      }
    });

    var killTimes = [];
    s.on('hitConfirm', function (d) {
      FX.hitmarker(d.kill);
      var vr = remotes[d.v];
      if (vr) FX.damageNumber(vr.renderPos.clone().add(new THREE.Vector3(0, 0.55, 0)), d.dmg, d.headshot, d.kill);
      if (d.kill) {
        var nw = performance.now();
        killTimes.push(nw);
        killTimes = killTimes.filter(function (kt) { return nw - kt < 4200; });
        if (killTimes.length >= 2) {
          var names = ['DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'MEGA KILL'];
          UI.announce(names[Math.min(names.length - 1, killTimes.length - 2)]);
          AudioSys.stinger(killTimes.length > 2);
        }
      }
    });

    s.on('death', function (d) {
      UI.addFeed(d, myIdV);
      if (d.killerId === myIdV && !d.self) {
        var SPREE = { 3: 'KILLING SPREE', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'GODLIKE' };
        if (SPREE[d.killerStreak]) { UI.announce(SPREE[d.killerStreak]); AudioSys.stinger(d.killerStreak >= 7); }
      }
      if (d.assistIds && d.assistIds.indexOf(myIdV) !== -1) UI.announce('+ ASSIST', true);
      if (d.victimId === myIdV) {
        killTimes = [];
        /* v10.10: both streak rewards die with you. The server clears its own
           copy of each (spawnPlayer for the visor, nuke.js clearArmed for the
           nuke) — these two calls are the client catching up immediately
           rather than waiting for the next vitals, so the through-wall view
           does not linger for a second after you are dead. */
        setVisor(false);
        UI.nukeLost('died');
        AudioSys.death(); Game.onLocalDeath(d);
      }
      else {
        var r = remotes[d.victimId];
        if (r) { if (r.alive) r.deadAt = performance.now(); r.alive = false; FX.bloodPuff(r.renderPos.clone().add(new THREE.Vector3(0, 0.4, 0))); }
      }
    });

    s.on('matchEnd', function (d) {
      phase = 'ended';
      roster = d.players;
      Game.onMatchEnd(d, myIdV, isHost);
    });

    s.on('backToLobby', function () {
      phase = 'lobby';
      Game.onBackToLobby();
    });

    s.on('disconnect', function () {
      if (phase !== 'menu') UI.toast('Lost connection to server', true);
    });

    setInterval(function () {
      if (!s.connected) return;
      var t0 = Date.now();
      s.emit('pingCheck', t0, function () { ping = Date.now() - t0; });
    }, 2000);
  }

  function remotesPing() { return ping; }

  // ---------- outgoing ----------
  function createRoom(name, settings, cb) {
    connect();
    var send = function () { socket.emit('createRoom', { name: name, settings: settings }, wrapCb(cb)); };
    socket.connected ? send() : socket.once('connect', send);
  }
  function joinRoom(name, code, cb) {
    connect();
    var send = function () { socket.emit('joinRoom', { name: name, code: code }, wrapCb(cb)); };
    socket.connected ? send() : socket.once('connect', send);
  }
  function wrapCb(cb) {
    return function (res) {
      if (res && res.ok) {
        phase = res.inProgress ? 'playing' : 'lobby'; roomCode = res.code;
        if (res.token) saveSession(res.code, res.token);   // v9.11
      }
      cb(res);
    };
  }

  /* ===== v9.11 AUTOMATIC RECONNECT =====
     socket.io reconnects the TRANSPORT by itself, but the new socket has a new
     id and the server has no idea it is the same person — which is why a blip
     used to cost the match. On every reconnect we offer the stored token; the
     server either restores the seat or says it is gone, and either way the
     player finds out instead of staring at a frozen world.

     It fires on transport reconnect rather than on a button, because the moment
     that matters is the one where the player did not do anything. */
  function attemptRejoin(s) {
    var sess = loadSession();
    if (!sess) return;
    s.emit('rejoin', { code: sess.code, token: sess.token }, function (res) {
      if (res && res.ok) {
        myIdV = res.id; roomCode = res.code;
        phase = res.state === 'playing' ? 'playing' : 'lobby';
        saveSession(res.code, res.token);
        snapCache = {}; slotToId = {};     // the old wire slots died with the old id
        if (res.pickups) Pickups.init(res.pickups);
        UI.toast('Reconnected');
        if (typeof Game !== 'undefined' && Game.onRejoin) Game.onRejoin(res);
      } else {
        clearSession();
        UI.toast((res && res.error) || 'Could not rejoin', true);
      }
    });
  }
  function leaveRoom() {
    if (socket) socket.disconnect();
    socket = null;
    phase = 'menu'; roomCode = ''; isHost = false;
    clearSession();          // v9.11: leaving is deliberate; do not auto-rejoin
    for (var id in remotes) removeRemote(id);
    roster = [];
  }

  var lastStateSent = 0;
  function sendState() {
    if (!socket || !socket.connected || phase !== 'playing' || !PlayerCtl.alive) return;
    var t = performance.now();
    if (t - lastStateSent < 1000 / CFG.NET.clientRate) return;
    lastStateSent = t;
    socket.emit('st', {
      p: [PlayerCtl.pos.x, PlayerCtl.pos.y, PlayerCtl.pos.z],
      ry: PlayerCtl.yaw, rx: PlayerCtl.pitch,
      cr: PlayerCtl.prone ? 2 : (PlayerCtl.crouch ? 1 : 0),
      mv: PlayerCtl.moveState,
      ln: PlayerCtl.lean,
      wp: Math.max(0, CFG.WEAPON_ORDER.indexOf(Weapons.currentName())),
      /* One flag, 15 times a second, so remote players visibly reload. It is
         the only thing on the animation list that costs bandwidth — strafe,
         turn and stride are all DERIVED client-side from interpolated position
         and yaw, which costs nothing. */
      rl: Weapons.isReloading() ? 1 : 0,
      ping: ping
    });
  }
  function sendShoot(d) { if (socket) socket.emit('shoot', d); }
  /* v10.6: ask the server to collect whatever is underfoot. Carries no item id
     and no position, so it cannot be used to claim loot from across the map -
     the server owns the decision exactly as it did when this ran automatically. */
  function pickup() { if (socket) socket.emit('pickup'); }
  function sendHit(d) { if (socket) socket.emit('hit', d); }
  function sendProj(d) { if (socket) socket.emit('proj', d); }
  function sendThrow(d) { if (socket) socket.emit('throw', d); }
  function requestRespawn() { if (socket) socket.emit('respawn'); }
  function updateSettings(s) { if (socket) socket.emit('updateSettings', s); }
  function startMatch() { if (socket) socket.emit('startMatch'); }
  function returnLobby() { if (socket) socket.emit('returnLobby'); }

  // Remote fire/projectile events → local visuals
  function bindGameplayEvents() {
    socket.on('shoot', function (d) {
      var o = new THREE.Vector3(d.o[0], d.o[1], d.o[2]);
      AudioSys.shot(d.w, o, { supp: !!d.sup });
      if (!d.sup) FX.muzzle(o, false);
      var r = remotes[d.id];
      if (r) {
        // suppressed fire pings the minimap for ~1.2 s instead of 3.5 s
        r.lastShotAt = performance.now() - (d.sup ? (CFG.NET.detectMs - CFG.ATTACH.supp.detectMs) : 0);
        var cp = Math.cos(r.rx);
        var dir = new THREE.Vector3(Math.sin(r.ry) * cp, Math.sin(r.rx), -Math.cos(r.ry) * cp).normalize();
        var wh = World.rayHit(o, dir, 140);
        FX.tracer(o, wh ? wh.point : o.clone().addScaledVector(dir, 100));
        if (wh) FX.impact(wh.point);
      }
    });
    /* v8.35: the server relays these fields verbatim, so a malformed or
       hostile packet used to reach THREE.Vector3 unchecked — `d.o[0]` on a
       missing array throws, and an unknown `d.type` reaches
       `CFG.THROWS[type].fuse` and throws there. Neither killed the game (the
       v8.31 per-subsystem guards contain it) but both would spam the error
       toast and drop the effect for everyone. Validate at the boundary. */
    function vec3(a) {
      return (a && a.length === 3 && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]))
        ? new THREE.Vector3(a[0], a[1], a[2]) : null;
    }
    socket.on('proj', function (d) {
      if (!d) return;
      var o = vec3(d.o), v = vec3(d.v);
      if (!o || !v) return;
      Weapons.spawnRocket(o, v, false);
      AudioSys.shot('rocket', o.clone());
    });
    socket.on('throw', function (d) {
      if (!d || !CFG.THROWS[d.type]) return;          // unknown type = ignore, not crash
      var o = vec3(d.o), v = vec3(d.v);
      if (!o || !v) return;
      Weapons.spawnGrenade(d.type, o, v, false, (typeof d.f === 'number') ? d.f : undefined);
    });
    /* v9.4 STRIKE DRONE. Position comes from the snapshot, not from these —
       these are the discrete events: launched, destroyed, and the warning to
       the player being hunted. */
    socket.on('droneLaunch', function (d) {
      UI.toast(d.owner === myIdV ? 'Drone away \u00b7 acquiring' : 'Drone in the air');
    });
    socket.on('droneBoom', function (d) { Pickups.droneBoom(d); });
    socket.on('droneHit', function (d) { UI.droneHealth && UI.droneHealth(d.id, d.hp); });
    socket.on('droneKilled', function () { UI.toast('Drone destroyed'); });
    /* THE WARNING IS THE WEAPON'S FAIRNESS. Without it a drone is an unblockable
       kill from a direction nobody looks. With it, dying to one is a decision
       the victim lost rather than a dice roll they never saw. */
    socket.on('droneWarn', function (d) { UI.droneWarn && UI.droneWarn(d.d); });
    /* v9.10: a team-mate's map marker. Relayed by the server to that side only,
       so this can be trusted to be from an ally. */
    socket.on('mark', function (d) {
      Minimap.addMark(d);
      if (!d) return;
      var mine = d.id === myIdV || d.id === 'spot:' + myIdV;
      if (d.kind === 'enemy') {
        UI.toast((mine ? 'Enemy spotted' : (d.name || 'Squad') + ' spotted an enemy') +
                 (d.dist ? ' \u00b7 ' + d.dist + ' m' : ''), false);
        if (FX.teamPing) FX.teamPing({ x: d.x, z: d.z, hostile: true });
      } else if (!mine) {
        UI.toast((d.name || 'Squad') + ' marked a position');
      }
    });
    socket.on('spotMiss', function () { UI.toast('No enemy in view', true); });
    /* v10.13 OUTBREAK. The server owns the wave state entirely; these only
       paint it. `zomb` arrives roughly twice a second plus on every phase
       change, so the HUD is never more than half a second stale. */
    s.on('zomb', function (d) { if (UI.zombState) UI.zombState(d); });
    s.on('zombSpawn', function (d) { if (UI.zombSpawn) UI.zombSpawn(d); });
    s.on('zombDown', function (d) { if (UI.zombDown) UI.zombDown(d); });
    s.on('zombSwing', function (d) {
      var r = remotes[d && d.id];
      if (r && r.av && FX.shake) { /* felt, not seen, unless it is close */ }
    });
    /* v9.11: a team-mate's ping. Relayed to this side only, so it can be
       trusted to be from an ally. */
    socket.on('ping', function (d) { FX.teamPing(d); });
    socket.on('minePlaced', function (d) { Pickups.mineAdd(d); });
    socket.on('mineBoom', function (d) {
      Pickups.mineBoom(d.id);
      var mp = new THREE.Vector3(d.x, d.y, d.z);
      FX.explosion(mp);
      FX.shake(0.6);
      AudioSys.explosion(mp);
    });
  }

  // ---------- remote interpolation ----------
  var _camPos = new THREE.Vector3();
  function updateRemotes(dt, camera) {
    var renderT = performance.now() - CFG.NET.interpDelay;
    if (camera) camera.getWorldPosition(_camPos);
    for (var id in remotes) {
      var r = remotes[id];
      var buf = r.buf;
      while (buf.length > 2 && buf[1].t < renderT) buf.shift();
      var vis = r.alive && phase === 'playing' && buf.length > 0;
      /* v8.23 THE BODY USED TO BE DELETED 50ms AFTER IT FINISHED FALLING.

         The collapse in poseAvatar runs to completion at deadT = 0.85s. This
         window was 900ms. So the corpse was hidden fifty milliseconds after
         landing — you saw a body drop and blink out, which is why Rahul kept
         reporting "it vanishes" even after v8.21 stopped it sinking through
         the floor. The animation was fine; nothing was left on screen to look
         at once it ended.

         Five seconds now: 0.85s to fall, roughly three and a half lying there
         with the name tag standing over it as a marker of who died and where,
         then a half-second fade out so it leaves rather than pops. */
      /* v8.25: back down from 5000ms. v8.23 held the body for five seconds so
         there was a marker of who died and where — Rahul's verdict after
         playing it is that a corpse lying in the middle of a first-to-5
         firefight reads as a live target you keep shooting at, and the kill
         should feel immediate. 1200ms is the fall (850ms) plus a short beat,
         then a 350ms fade so it leaves rather than pops. Raise CORPSE_MS if
         the marker turns out to be worth more than the clarity. */
      /* v8.26: 1200 -> 800ms at Rahul's request. The collapse in poseAvatar was
         compressed to 0.50s in the same change so the fall still completes
         before the fade starts — 0.50 down, 0.02 beat, 0.28 fade, gone at
         0.80. Setting CORPSE_MS to 0 makes a kill vanish instantly if that is
         ever wanted; the fall duration above would want raising back if so. */
      var CORPSE_MS = 800, FADE_MS = 280;
      var deadFor = (!r.alive && r.deadAt) ? (performance.now() - r.deadAt) : 1e9;
      var deadAnim = deadFor < CORPSE_MS;
      r.av.group.visible = vis || deadAnim;
      if (deadAnim && !vis) {
        var fade = deadFor > (CORPSE_MS - FADE_MS)
          ? Math.max(0, (CORPSE_MS - deadFor) / FADE_MS) : 1;
        if (r.av.tag) r.av.tag.material.opacity = fade;
        if (r.av.tag) r.av.tag.material.transparent = true;
      } else if (r.av.tag) {
        r.av.tag.material.opacity = 1;
      }
      if (!vis) continue;

      var a = buf[0], b = buf.length > 1 ? buf[1] : buf[0];
      var span = Math.max(1, b.t - a.t);
      var f = Math.min(1.15, Math.max(0, (renderT - a.t) / span));
      r.renderPos.set(
        a.p[0] + (b.p[0] - a.p[0]) * f,
        a.p[1] + (b.p[1] - a.p[1]) * f,
        a.p[2] + (b.p[2] - a.p[2]) * f
      );
      var dry = b.ry - a.ry;
      if (dry > Math.PI) dry -= Math.PI * 2;
      if (dry < -Math.PI) dry += Math.PI * 2;
      r.ry = a.ry + dry * f;
      r.rx = a.rx + (b.rx - a.rx) * f;
      var stc = b.cr | 0;
      r.crouch = stc === 1;
      r.prone = stc === 2;
      r.mv = b.mv;
      r.ln = a.ln + (b.ln - a.ln) * f;

      var g = r.av.group;
      g.position.copy(r.renderPos);
      /* v8.36 EVERY REMOTE PLAYER WAS DRAWN FACING BACKWARDS.

         Rahul: "the player is looking forward but the other player sees his
         backward."

         Two conventions that were never reconciled. A three.js camera looks
         down its own LOCAL -Z, and game.js aims it with `camera.rotation.y =
         -yaw`. The avatar rig faces local +Z — the boot toe is offset +0.025 in
         Z and the rifle is carried at +0.36 Z. Handing the group the camera's
         formula therefore pointed the BODY the exact opposite way to the head
         it belonged to.

         Measured before the fix: the rendered body direction against the look
         direction gave a dot of -0.78 at 0, 90 and 180 degrees of yaw —
         consistently, wildly backwards.

         The PI reconciles the two conventions. Nothing else needs to move: the
         camera keeps its own formula, the minimap arrow reads PlayerCtl.yaw
         directly and never went through the rig, and prone lies along the
         body's own local axis so it rotates with the correction rather than
         against it. */
      g.rotation.y = -r.ry + Math.PI;
      /* v8.15: guard at the source too. A NaN reaching baseY makes the avatar
         invisible and permanently stationary, and nothing downstream repairs
         it. Belt and braces with the isFinite check in poseAvatar. */
      if (isFinite(r.renderPos.y)) r.av.baseY = r.renderPos.y;

      /* Equipment visibility straight off the snapshot. setGear only touches
         .visible when a tier actually changes, so this is free per frame. */
      var hl = b.hl | 0, al = b.lv | 0;
      if (r.gearH !== hl || r.gearA !== al) {
        r.gearH = hl; r.gearA = al;
        Avatars.setGear(r.av, hl, al);
      }

      /* Movement DIRECTION is derived here, not networked: take the world-space
         step since last frame and rotate it into the avatar's own frame. That
         gives strafe and back-pedal for free at 0 bytes. */
      var dxw = r.renderPos.x - r.lastRP.x, dzw = r.renderPos.z - r.lastRP.z;
      var movedNow = Math.sqrt(dxw * dxw + dzw * dzw) +
        Math.abs(r.renderPos.y - r.lastRP.y) * 0.25;
      var cs = Math.cos(r.ry), sn = Math.sin(r.ry);
      var lz = dxw * sn + dzw * cs, lx = dxw * cs - dzw * sn;
      var mag = Math.sqrt(lx * lx + lz * lz) || 1;
      r.lastRP.copy(r.renderPos);
      Avatars.poseAvatar(r.av, {
        moved: movedNow, mx: lx / mag, mz: lz / mag,
        run: r.mv === 2, crouch: r.crouch, prone: r.prone,
        dead: deadAnim, deadT: deadFor / 1000, rx: r.rx, ry: r.ry, lean: r.ln,
        reloading: !!b.rl,
        dist: r.renderPos.distanceTo(_camPos), dt: dt
      });

      /* v8.32 ONE SOURCE OF TRUTH FOR WHERE THE HEAD IS.

         The head box in weapons/system.js used to be derived from
         CFG.PLAYER.eyeHeight, a completely separate chain from the rig that
         actually draws the head. They disagreed by up to 0.32 m and bullets
         passed through visible heads. Caching the real world position here —
         right after the pose that produced it — means hit detection reads the
         head instead of predicting it, and prone works for free because a
         rotated body carries its head with it.

         The matrix update is forced because three.js would not otherwise
         refresh it until render, which would leave the cache a frame stale.
         It walks about thirty nodes per remote, which against a 98-draw-call
         map is not measurable. */
      if (r.av.headMesh) {
        r.av.group.updateMatrixWorld(true);
        if (!r.headPos) r.headPos = new THREE.Vector3();
        r.av.headMesh.getWorldPosition(r.headPos);
      }

      // floating health bar — smooth lerp; allies always, enemies only while recently hurt
      var ally = !!(myTeam && r.team === myTeam);
      r.dispHp += (r.hp - r.dispHp) * Math.min(1, dt * 9);
      /* v8.17: bar is ALWAYS up. Rahul: "name and health bar is not showing,
         only when getting a hit it shows a bar and then it hides again." */
      var showBar = true;
      r.av.hb.sprite.visible = true;
      /* v8.17: ENEMY TAGS ARE BACK, BUT OCCLUDED.

         v4.9 hid them entirely, and the reasoning in that commit was sound:
         the sprite is built with depthTest:false, so an enemy tag rendered
         THROUGH walls at unlimited range — a free wallhack.

         Hiding the tag was not the only way to close that. Turning depth
         testing back ON for enemies means a wall occludes their tag exactly
         like it occludes their body, so you can read a name you can actually
         see and nothing more. Allies keep depthTest:false so you can still
         track a teammate through cover, which is the tactical part.

         Enemy tags also fade out past 55 m, where the name is unreadable
         anyway and the only thing it would add is a spotting aid. */
      r.av.tag.material.depthTest = !ally;
      r.av.hb.sprite.material.depthTest = !ally;
      r.av.tag.visible = ally || r.renderPos.distanceTo(_camPos) < 55;
      if (showBar && Math.abs(r.dispHp - r.hbDrawn) > 0.6) { Avatars.drawHpBar(r, ally); r.hbDrawn = r.dispHp; }

      // footstep audio still keys off distance travelled, not the animation
      if (r.mv > 0 && movedNow > 0.001) {
        r.stepAcc += movedNow;
        var stride = r.mv === 2 ? 3.1 : 2.3;
        if (r.stepAcc > stride) {
          r.stepAcc = 0;
          AudioSys.step(r.renderPos, r.crouch, r.mv === 2);
        }
      }
    }
  }

  function eachRemote(fn) { for (var id in remotes) fn(id, remotes[id]); }

  return {
    init: init,
    connect: connect,
    createRoom: createRoom, joinRoom: joinRoom, leaveRoom: leaveRoom,
    updateSettings: updateSettings, startMatch: startMatch, returnLobby: returnLobby,
    sendState: sendState, sendShoot: sendShoot, sendHit: sendHit, pickup: pickup,
    sendProj: sendProj, sendThrow: sendThrow, requestRespawn: requestRespawn,
    placeMine: function (d, cb) { if (socket) socket.emit('placeMine', d, cb); },
    mark: function (x, z) { if (socket) socket.emit('mark', { x: x, z: z }); },
    /* v10.13: the client says where it is LOOKING; the server decides whether
       an enemy is there and whether it can be seen. Nothing about who the
       enemy is comes from this side. */
    spot: function (yaw, pitch) { if (socket) socket.emit('spot', { yaw: yaw, pitch: pitch }); },
    ping: function (kind, x, y, z) { if (socket) socket.emit('ping', { k: kind, x: x, y: y, z: z }); },
    launchDrone: function (cb) { if (socket) socket.emit('launchDrone', {}, cb); },
    droneHit: function (id, dmg) { if (socket) socket.emit('droneHit', { id: id, dmg: dmg }); },
    setPlayerTeam: function (id, team) { if (socket) socket.emit('setPlayerTeam', { id: id, team: team }); },
    shuffleTeams: function () { if (socket) socket.emit('shuffleTeams'); },   // v8.37
    setReady: function (v) { if (socket) socket.emit('setReady', { v: !!v }); },
    peerName: function (id) { var r = remotes[id]; return (r && r.name) || 'Player'; },
    bindGameplayEvents: bindGameplayEvents,
    updateRemotes: updateRemotes,
    eachRemote: eachRemote,
    myId: function () { return myIdV; },
    getPhase: function () { return phase; },
    setPhase: function (p) { phase = p; },
    getRoster: function () { return roster; },
    getPing: function () { return ping; },
    getMatch: function () { return match; },
    getIsHost: function () { return isHost; },
    getRoomCode: function () { return roomCode; },
    getMyTeam: function () { return myTeam; },
    getTeamKills: function () { return teamKills; },
    isAlly: function (id) { var r = remotes[id]; return !!(myTeam && r && r.team === myTeam); },
    setVisor: setVisor,               // v10.10 recon visor
    visorActive: visorActive,
    /* v10.10: the client asks for a strike; the server decides whether it is
       allowed one. Nothing here checks eligibility, deliberately. */
    nukeStrike: function (x, z) { if (socket) socket.emit('nukeStrike', { x: x, z: z }); }
  };
})();
