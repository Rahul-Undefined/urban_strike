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

  function nameTag(text, color) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.font = 'bold 34px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(10,12,16,0.6)';
    var w = g.measureText(text).width + 26;
    g.fillRect(128 - w / 2, 8, w, 46);
    g.fillStyle = color;
    g.fillText(text, 128, 42);
    var t = new THREE.CanvasTexture(c);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(1.7, 0.42, 1);
    return s;
  }

  function buildAvatar(name, colorHex) {
    var color = new THREE.Color(colorHex);
    var body = new THREE.MeshLambertMaterial({ color: color });
    var dark = new THREE.MeshLambertMaterial({ color: 0x23262c });
    var skin = new THREE.MeshLambertMaterial({ color: 0x9c8468 });
    var g = new THREE.Group();
    function bx(x, y, z, w, h, d, m) {
      var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z); b.castShadow = true; g.add(b); return b;
    }
    var torso = bx(0, 0.16, 0, 0.6, 0.7, 0.34, body);
    var head = bx(0, 0.66, 0, 0.3, 0.3, 0.3, skin);
    bx(0, 0.74, 0, 0.32, 0.1, 0.32, dark); // helmet band
    var legL = bx(-0.14, -0.55, 0, 0.17, 0.72, 0.2, dark);
    var legR = bx(0.14, -0.55, 0, 0.17, 0.72, 0.2, dark);
    var armL = bx(-0.4, 0.16, 0, 0.13, 0.6, 0.18, body);
    var armR = bx(0.4, 0.16, 0, 0.13, 0.6, 0.18, body);
    var gun = bx(0.18, 0.28, -0.42, 0.08, 0.1, 0.62, dark);
    var tag = nameTag(name, colorHex);
    tag.position.y = 1.18; g.add(tag);
    // floating health bar (canvas sprite, redrawn only when hp changes)
    var hc = document.createElement('canvas'); hc.width = 128; hc.height = 18;
    var htx = new THREE.CanvasTexture(hc);
    var hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: htx, depthTest: false, transparent: true }));
    hs.scale.set(0.92, 0.13, 1);
    hs.position.y = 0.98; hs.visible = false; g.add(hs);
    var hb = { sprite: hs, canvas: hc, ctx: hc.getContext('2d'), tex: htx };
    return { group: g, legL: legL, legR: legR, gun: gun, head: head, torso: torso, hb: hb };
  }

  function drawHpBar(r, ally) {
    var g = r.av.hb.ctx, W = 128, H = 18;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,14,0.78)';
    g.fillRect(0, 2, W, H - 4);
    var frac = Math.max(0, Math.min(1, r.dispHp / CFG.PLAYER.hp));
    g.fillStyle = ally ? (myTeam ? CFG.TEAMS[myTeam].color : '#63d968') : '#e8563e';
    g.fillRect(2, 4, (W - 4) * frac, H - 8);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 3, W - 2, H - 6);
    r.av.hb.tex.needsUpdate = true;
  }

  function ensureRemote(rp) {
    if (rp.id === myIdV) return null;
    var r = remotes[rp.id];
    if (!r) {
      var av = buildAvatar(rp.name, rp.color);
      scene.add(av.group);
      r = remotes[rp.id] = {
        id: rp.id, name: rp.name, color: rp.color, team: rp.team || null,
        av: av, buf: [], alive: false, crouch: false, mv: 0,
        hp: 100, dispHp: 100, hbDrawn: -1, lastShotAt: 0, lastDamagedAt: 0,
        renderPos: new THREE.Vector3(0, -50, 0), ry: 0, rx: 0, ln: 0,
        stepAcc: 0, lastRP: new THREE.Vector3(0, -50, 0)
      };
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
        if (r.buf.length > 40) r.buf.shift();
        if (st.hp < r.hp) r.lastDamagedAt = tLocal;
        r.hp = st.hp;
        r.team = st.tm || null;
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
        if (r) { r.alive = false; FX.bloodPuff(r.renderPos.clone().add(new THREE.Vector3(0, 0.4, 0))); }
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
      cr: PlayerCtl.crouch ? 1 : 0,
      mv: PlayerCtl.moveState,
      ln: PlayerCtl.lean,
      wp: CFG.WEAPON_ORDER.indexOf(Weapons.currentName()),
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
        r.lastShotAt = performance.now() - (d.sup ? 2300 : 0);
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
  }

  // ---------- remote interpolation ----------
  function updateRemotes(dt) {
    var renderT = performance.now() - CFG.NET.interpDelay;
    for (var id in remotes) {
      var r = remotes[id];
      var buf = r.buf;
      while (buf.length > 2 && buf[1].t < renderT) buf.shift();
      var vis = r.alive && phase === 'playing' && buf.length > 0;
      r.av.group.visible = vis;
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
      r.crouch = !!b.cr;
      r.mv = b.mv;
      r.ln = a.ln + (b.ln - a.ln) * f;

      var g = r.av.group;
      g.position.copy(r.renderPos);
      g.rotation.y = -r.ry;
      g.scale.y = r.crouch ? 0.72 : 1;
      g.rotation.z = -r.ln * 0.18;
      r.av.head.rotation.x = -r.rx * 0.55;
      r.av.gun.rotation.x = -r.rx * 0.7;

      // floating health bar — smooth lerp; allies always, enemies only while recently hurt
      var ally = !!(myTeam && r.team === myTeam);
      r.dispHp += (r.hp - r.dispHp) * Math.min(1, dt * 9);
      var showBar = ally || (r.hp < CFG.PLAYER.hp && (performance.now() - r.lastDamagedAt) < 5000);
      r.av.hb.sprite.visible = showBar;
      if (showBar && Math.abs(r.dispHp - r.hbDrawn) > 0.6) { drawHpBar(r, ally); r.hbDrawn = r.dispHp; }

      var moved = r.renderPos.distanceTo(r.lastRP);
      r.lastRP.copy(r.renderPos);
      if (r.mv > 0 && moved > 0.001) {
        var swing = Math.sin(performance.now() * 0.011 * (r.mv === 2 ? 1.5 : 1));
        r.av.legL.rotation.x = swing * 0.65;
        r.av.legR.rotation.x = -swing * 0.65;
        r.stepAcc += moved;
        var stride = r.mv === 2 ? 3.1 : 2.3;
        if (r.stepAcc > stride) {
          r.stepAcc = 0;
          AudioSys.step(r.renderPos, r.crouch, r.mv === 2);
        }
      } else {
        r.av.legL.rotation.x *= 0.8;
        r.av.legR.rotation.x *= 0.8;
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
