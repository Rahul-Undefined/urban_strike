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
  var teamKills = { a: 0, b: 0 };
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
  function removeRemote(id) {
    var r = remotes[id];
    if (r) { scene.remove(r.av.group); delete remotes[id]; }
  }

  function bind(s) {
    s.on('connect', function () { myIdV = s.id; });

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
      match.mode = d.settings.mode || 'ffa';
      match.startedAt = d.startedAt;
      match.serverOffset = d.serverNow - Date.now();
      roster = d.players;
      var me = d.players.find(function (p) { return p.id === myIdV; });
      myTeam = me ? (me.team || null) : null;
      teamKills = { a: 0, b: 0 };
      Game.onMatchStart(d);
    });

    s.on('snap', function (d) {
      var tLocal = performance.now();
      if (d.tk) teamKills = d.tk;
      for (var id in d.players) {
        var st = d.players[id];
        if (id === myIdV) {
          UI.setVitals(st.hp, st.lv, st.du);
          continue;
        }
        var r = remotes[id];
        if (!r) {
          var known = roster.find(function (p) { return p.id === id; });
          r = ensureRemote(known || { id: id, name: '???', color: '#888' });
          if (!r) continue;
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
    });

    s.on('vitals', function (d) { UI.setVitals(d.hp, d.lv, d.du); });
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
      if (d.victimId === myIdV) { killTimes = []; AudioSys.death(); Game.onLocalDeath(d); }
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
      if (res && res.ok) { phase = res.inProgress ? 'playing' : 'lobby'; roomCode = res.code; }
      cb(res);
    };
  }
  function leaveRoom() {
    if (socket) socket.disconnect();
    socket = null;
    phase = 'menu'; roomCode = ''; isHost = false;
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
    socket.on('proj', function (d) {
      Weapons.spawnRocket(new THREE.Vector3(d.o[0], d.o[1], d.o[2]), new THREE.Vector3(d.v[0], d.v[1], d.v[2]), false);
      AudioSys.shot('rocket', new THREE.Vector3(d.o[0], d.o[1], d.o[2]));
    });
    socket.on('throw', function (d) {
      Weapons.spawnGrenade(d.type, new THREE.Vector3(d.o[0], d.o[1], d.o[2]), new THREE.Vector3(d.v[0], d.v[1], d.v[2]), false,
        (typeof d.f === 'number') ? d.f : undefined);
    });
    socket.on('minePlaced', function (d) { Pickups.mineAdd(d); });
    socket.on('mineBoom', function (d) {
      Pickups.mineBoom(d.id);
      var mp = new THREE.Vector3(d.x, d.y, d.z);
      FX.explosion(mp);
      FX.shake(0.6);
      AudioSys.explosion(mp);
    });
    socket.on('voicePeers', function (d) { VoiceChat.onPeerList(d.ids); });
    socket.on('voicePeerJoin', function (d) { VoiceChat.onPeerJoin(d.id); });
    socket.on('voicePeerLeave', function (d) { VoiceChat.onPeerLeave(d.id); });
    socket.on('voiceSignal', function (d) { VoiceChat.onSignal(d.from, d.data); });
    VoiceChat.init(function (to, data) { if (socket) socket.emit('voiceSignal', { to: to, data: data }); });
    socket.on('disconnect', function () { VoiceChat.leave(); });
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
      var CORPSE_MS = 5000, FADE_MS = 600;
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
      g.rotation.y = -r.ry;
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
    sendState: sendState, sendShoot: sendShoot, sendHit: sendHit,
    sendProj: sendProj, sendThrow: sendThrow, requestRespawn: requestRespawn,
    placeMine: function (d, cb) { if (socket) socket.emit('placeMine', d, cb); },
    setReady: function (v) { if (socket) socket.emit('setReady', { v: !!v }); },
    peerName: function (id) { var r = remotes[id]; return (r && r.name) || 'Player'; },
    voiceJoin: function () { if (socket) socket.emit('voiceJoin'); },
    voiceLeave: function () { if (socket) socket.emit('voiceLeave'); },
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
    isAlly: function (id) { var r = remotes[id]; return !!(myTeam && r && r.team === myTeam); }
  };
})();
