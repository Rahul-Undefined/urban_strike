/* UI — owns every DOM element. Menu flow + HUD updates.
   Game logic never touches the DOM directly; it calls these functions. */
var UI = (function () {
  function $(id) { return document.getElementById(id); }

  var els = {};
  var feedTimers = [];

  function cache() {
    ['menu-layer', 'hud-layer', 'screen-main', 'screen-create', 'screen-join', 'screen-lobby',
      'create-name', 'create-mode', 'create-kills', 'create-time', 'btn-create', 'btn-goto-create', 'btn-goto-join',
      'lobby-mode', 'team-score', 'armor-badge', 'armor-row',
      'join-name', 'join-code', 'btn-join',
      'lobby-code', 'btn-copy-code', 'lobby-players', 'lobby-count', 'lobby-kills', 'lobby-time',
      'lobby-hint', 'btn-start', 'btn-leave',
      'crosshair', 'scope-overlay', 'match-timer', 'kill-target', 'killfeed',
      'hp-fill', 'hp-num', 'armor-fill', 'armor-num',
      'weapon-name', 'ammo-mag', 'ammo-reserve', 'tc-frag', 'tc-smoke', 'tc-flash', 'reload-hint',
      'scoreboard', 'sb-code', 'sb-body',
      'death-overlay', 'death-info', 'death-timer',
      'end-overlay', 'end-title', 'end-sub', 'end-body', 'btn-back-lobby', 'end-hint',
      'pause-overlay', 'sens-range', 'sens-val', 'vol-range', 'vol-val', 'quality-shadows',
      'btn-resume', 'btn-quit', 'click-to-play', 'toasts', 'loading'
    ].forEach(function (id) { els[id] = $(id); });
  }

  // ---------- screens ----------
  function showScreen(id) {
    document.querySelectorAll('#menu-layer .screen').forEach(function (s) {
      s.classList.toggle('active', s.id === id);
    });
  }
  function showMenu() {
    els['menu-layer'].classList.remove('hidden');
    els['hud-layer'].classList.add('hidden');
  }
  function showHUD() {
    els['menu-layer'].classList.add('hidden');
    els['hud-layer'].classList.remove('hidden');
  }
  function setLoading(on) { els['loading'].classList.toggle('hidden', !on); }

  // ---------- lobby ----------
  function updateLobby(d, myId) {
    var mode = CFG.MODES[d.settings.mode] || CFG.MODES.ffa;
    els['lobby-code'].textContent = d.code;
    els['lobby-count'].textContent = d.players.length + '/' + mode.maxPlayers;
    els['lobby-players'].innerHTML = '';

    function row(p) {
      var li = document.createElement('li');
      var host = p.id === d.hostId ? ' <em class="host-tag">HOST</em>' : '';
      var you = p.id === myId ? ' <em class="you-tag">YOU</em>' : '';
      li.innerHTML = '<i class="dot" style="background:' + p.color + '"></i><b>' + p.name + '</b>' + host + you;
      els['lobby-players'].appendChild(li);
    }
    if (mode.teams) {
      ['a', 'b'].forEach(function (t) {
        var hdr = document.createElement('li');
        hdr.className = 'hdr t' + t;
        hdr.textContent = 'TEAM ' + CFG.TEAMS[t].name;
        els['lobby-players'].appendChild(hdr);
        d.players.filter(function (p) { return p.team === t; }).forEach(row);
      });
    } else {
      d.players.forEach(row);
    }

    var isHost = d.hostId === myId;
    els['btn-start'].style.display = isHost ? '' : 'none';
    els['lobby-hint'].textContent = isHost
      ? (d.players.length < 2 ? 'You can start solo to explore, or wait for friends.' : 'Ready when you are.')
      : 'Waiting for host to start\u2026';
    els['lobby-mode'].disabled = !isHost;
    els['lobby-kills'].disabled = !isHost;
    els['lobby-time'].disabled = !isHost;
    els['lobby-mode'].value = d.settings.mode || 'ffa';
    els['lobby-kills'].value = String(d.settings.killTarget);
    els['lobby-time'].value = String(d.settings.minutes);
  }

  // ---------- HUD ----------
  function setVitals(hp, lv, du) {
    hp = Math.max(0, Math.round(hp)); lv = lv | 0; du = Math.max(0, Math.round(du || 0));
    els['hp-fill'].style.width = hp + '%';
    els['hp-num'].textContent = hp;
    els['hp-fill'].classList.toggle('low', hp <= 30);
    if (lv > 0 && CFG.ARMOR[lv]) {
      els['armor-badge'].textContent = CFG.ARMOR[lv].label;
      els['armor-badge'].className = 'stat-label lv' + lv;
      els['armor-fill'].style.width = Math.min(100, du / CFG.ARMOR[lv].dur * 100) + '%';
      els['armor-num'].textContent = du;
      els['armor-row'].classList.remove('empty');
    } else {
      els['armor-badge'].textContent = 'AR';
      els['armor-badge'].className = 'stat-label';
      els['armor-fill'].style.width = '0%';
      els['armor-num'].textContent = 0;
      els['armor-row'].classList.add('empty');
    }
  }
  function setTeamScore(tk, myTeam, show) {
    if (!show) { els['team-score'].classList.add('hidden'); return; }
    els['team-score'].classList.remove('hidden');
    els['team-score'].innerHTML =
      '<span class="ta">' + CFG.TEAMS.a.name + ' ' + tk.a + '</span>' +
      '<span class="sep">\u2013</span>' +
      '<span class="tb">' + tk.b + ' ' + CFG.TEAMS.b.name + '</span>';
  }
  function setWeapon(label, mag, reserve, throwsLeft) {
    els['weapon-name'].textContent = label;
    if (label === 'Knife') { els['ammo-mag'].textContent = '\u2014'; els['ammo-reserve'].textContent = ''; }
    else { els['ammo-mag'].textContent = mag; els['ammo-reserve'].textContent = reserve; }
    if (throwsLeft) {
      els['tc-frag'].textContent = 'G \u00d7' + throwsLeft.frag;
      els['tc-smoke'].textContent = 'T \u00d7' + throwsLeft.smoke;
      els['tc-flash'].textContent = 'F \u00d7' + throwsLeft.flash;
      els['tc-frag'].classList.toggle('spent', throwsLeft.frag <= 0);
      els['tc-smoke'].classList.toggle('spent', throwsLeft.smoke <= 0);
      els['tc-flash'].classList.toggle('spent', throwsLeft.flash <= 0);
    }
  }
  function setReloading(on) { els['reload-hint'].classList.toggle('hidden', !on); }
  function setScope(on) {
    els['scope-overlay'].classList.toggle('hidden', !on);
    els['crosshair'].classList.toggle('hidden', on);
  }
  function setCrosshair(on) { els['crosshair'].classList.toggle('hidden', !on); }
  function setTimer(text) { els['match-timer'].textContent = text; }
  function setKillTarget(text) { els['kill-target'].textContent = text; }

  function addFeed(d, myId) {
    var row = document.createElement('div');
    row.className = 'feed-row';
    if (d.victimId === myId || d.killerId === myId) row.classList.add('me');
    var wLabel = (CFG.WEAPONS[d.weapon] && CFG.WEAPONS[d.weapon].label) ||
      (CFG.THROWS[d.weapon] && CFG.THROWS[d.weapon].label) || d.weapon || '?';
    if (d.self) {
      row.innerHTML = '<b>' + d.victimName + '</b> <span class="fw">eliminated themselves</span>';
    } else {
      row.innerHTML = '<b>' + d.killerName + '</b> <span class="fw">[' + wLabel + (d.headshot ? ' \u2620' : '') + ']</span> <b>' + d.victimName + '</b>';
    }
    els['killfeed'].appendChild(row);
    while (els['killfeed'].children.length > 5) els['killfeed'].removeChild(els['killfeed'].firstChild);
    setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 6000);
  }

  function updateScoreboard(roster, myId, code, ping) {
    els['sb-code'].textContent = code ? '\u00b7 ROOM ' + code : '';
    els['sb-body'].innerHTML = '';
    function row(p) {
      var tr = document.createElement('tr');
      if (p.id === myId) tr.className = 'me';
      var pg = (p.id === myId) ? ping : p.ping;
      tr.innerHTML = '<td><i class="dot" style="background:' + p.color + '"></i>' + p.name + '</td><td>' + p.kills + '</td><td>' + p.deaths + '</td><td>' + (pg | 0) + '</td>';
      els['sb-body'].appendChild(tr);
    }
    var mode = CFG.MODES[(Net.getMatch().mode) || 'ffa'] || CFG.MODES.ffa;
    if (mode.teams) {
      ['a', 'b'].forEach(function (t) {
        var members = roster.filter(function (p) { return p.team === t; });
        var total = members.reduce(function (s, p) { return s + p.kills; }, 0);
        var hdr = document.createElement('tr');
        hdr.className = 'team-hdr t' + t;
        hdr.innerHTML = '<td>TEAM ' + CFG.TEAMS[t].name + '</td><td>' + total + '</td><td></td><td></td>';
        els['sb-body'].appendChild(hdr);
        members.sort(function (a, b) { return b.kills - a.kills; }).forEach(row);
      });
    } else {
      roster.slice().sort(function (a, b) { return b.kills - a.kills || a.deaths - b.deaths; }).forEach(row);
    }
  }
  function showScoreboard(on) { els['scoreboard'].classList.toggle('hidden', !on); }

  // ---------- overlays ----------
  function showDeath(d) {
    els['death-overlay'].classList.remove('hidden');
    els['death-info'].textContent = d.self ? 'Careful with those explosives.' : 'Taken out by ' + d.killerName;
  }
  function setDeathCountdown(sec) {
    els['death-timer'].textContent = sec > 0 ? 'Redeploying in ' + sec + '\u2026' : 'Redeploying\u2026';
  }
  function hideDeath() { els['death-overlay'].classList.add('hidden'); }

  function showEnd(d, myId, isHost) {
    els['end-overlay'].classList.remove('hidden');
    var winner = d.players.find(function (p) { return p.id === d.winnerId; });
    var me = d.players.find(function (p) { return p.id === myId; });
    els['end-body'].innerHTML = '';
    function row(p) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><i class="dot" style="background:' + p.color + '"></i>' + p.name + '</td><td>' + p.kills + '</td><td>' + p.deaths + '</td>';
      els['end-body'].appendChild(tr);
    }
    if (d.winnerTeam) {
      var won = me && me.team === d.winnerTeam;
      els['end-title'].textContent = won ? 'VICTORY' : ('TEAM ' + CFG.TEAMS[d.winnerTeam].name + ' WINS');
      els['end-title'].className = 'end-title team-' + d.winnerTeam + (won ? ' win' : '');
      els['end-sub'].textContent = d.teamKills
        ? (CFG.TEAMS.a.name + ' ' + d.teamKills.a + ' \u2013 ' + d.teamKills.b + ' ' + CFG.TEAMS.b.name +
          (d.reason === 'time' ? ' \u00b7 time expired' : d.reason === 'forfeit' ? ' \u00b7 forfeit' : ''))
        : '';
      ['a', 'b'].forEach(function (t) {
        var hdr = document.createElement('tr');
        hdr.className = 'team-hdr t' + t;
        hdr.innerHTML = '<td>TEAM ' + CFG.TEAMS[t].name + '</td><td></td><td></td>';
        els['end-body'].appendChild(hdr);
        d.players.filter(function (p) { return p.team === t; })
          .sort(function (a, b) { return b.kills - a.kills; }).forEach(row);
      });
    } else {
      if (d.winnerId === myId) { els['end-title'].textContent = 'VICTORY'; els['end-title'].className = 'end-title win'; }
      else { els['end-title'].textContent = 'MATCH OVER'; els['end-title'].className = 'end-title'; }
      els['end-sub'].textContent = winner
        ? winner.name + ' wins' + (d.reason === 'time' ? ' on time' : d.reason === 'forfeit' ? ' by forfeit' : '')
        : 'Time expired';
      d.players.slice().sort(function (a, b) { return b.kills - a.kills; }).forEach(row);
    }
    els['btn-back-lobby'].style.display = isHost ? '' : 'none';
    els['end-hint'].style.display = isHost ? 'none' : '';
  }
  function hideEnd() { els['end-overlay'].classList.add('hidden'); }

  function showPause(on) { els['pause-overlay'].classList.toggle('hidden', !on); }
  function showClickToPlay(on) { els['click-to-play'].classList.toggle('hidden', !on); }

  function toast(msg, isErr) {
    var t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    els['toasts'].appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3400);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  }

  // ---------- settings (pause panel) ----------
  var sensitivity = 1.0;
  function wireSettings() {
    els['sens-range'].addEventListener('input', function () {
      sensitivity = parseFloat(this.value);
      els['sens-val'].textContent = sensitivity.toFixed(1);
    });
    els['vol-range'].addEventListener('input', function () {
      els['vol-val'].textContent = this.value + '%';
      AudioSys.setVolume(parseInt(this.value, 10) / 100);
    });
    els['quality-shadows'].addEventListener('change', function () {
      Game.setShadows(this.checked);
    });
  }

  // ---------- menu wiring ----------
  function wireMenus() {
    els['btn-goto-create'].onclick = function () { showScreen('screen-create'); els['create-name'].focus(); };
    els['btn-goto-join'].onclick = function () { showScreen('screen-join'); els['join-name'].focus(); };
    document.querySelectorAll('[data-back]').forEach(function (b) {
      b.onclick = function () { showScreen('screen-main'); };
    });

    els['btn-create'].onclick = function () {
      var name = els['create-name'].value.trim();
      if (!name) { toast('Enter a callsign first', true); els['create-name'].focus(); return; }
      els['btn-create'].disabled = true;
      Net.createRoom(name, {
        mode: els['create-mode'].value,
        killTarget: parseInt(els['create-kills'].value, 10),
        minutes: parseInt(els['create-time'].value, 10)
      }, function (res) {
        els['btn-create'].disabled = false;
        if (res && res.ok) showScreen('screen-lobby');
        else toast((res && res.error) || 'Could not create room', true);
      });
    };

    els['btn-join'].onclick = function () {
      var name = els['join-name'].value.trim();
      var code = els['join-code'].value.trim().toUpperCase();
      if (!name) { toast('Enter a callsign first', true); return; }
      if (code.length !== 5) { toast('Room codes are 5 characters', true); return; }
      els['btn-join'].disabled = true;
      Net.joinRoom(name, code, function (res) {
        els['btn-join'].disabled = false;
        if (res && res.ok) { if (!res.inProgress) showScreen('screen-lobby'); }
        else toast((res && res.error) || 'Could not join', true);
      });
    };
    els['join-code'].addEventListener('input', function () { this.value = this.value.toUpperCase(); });

    els['btn-copy-code'].onclick = function () {
      var code = els['lobby-code'].textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(code);
      toast('Code ' + code + ' copied');
    };
    function pushSettings() {
      Net.updateSettings({
        mode: els['lobby-mode'].value,
        killTarget: parseInt(els['lobby-kills'].value, 10),
        minutes: parseInt(els['lobby-time'].value, 10)
      });
    }
    els['lobby-mode'].addEventListener('change', pushSettings);
    els['lobby-kills'].addEventListener('change', pushSettings);
    els['lobby-time'].addEventListener('change', pushSettings);
    els['btn-start'].onclick = function () { Net.startMatch(); };
    els['btn-leave'].onclick = function () { Net.leaveRoom(); showScreen('screen-main'); };
    els['btn-back-lobby'].onclick = function () { Net.returnLobby(); };
    els['btn-quit'].onclick = function () { location.reload(); };
    // btn-resume is wired by main.js (needs pointer lock).
  }

  function init() {
    cache();
    wireMenus();
    wireSettings();
  }

  return {
    init: init,
    showScreen: showScreen, showMenu: showMenu, showHUD: showHUD, setLoading: setLoading,
    updateLobby: updateLobby,
    setVitals: setVitals, setTeamScore: setTeamScore, setWeapon: setWeapon, setReloading: setReloading,
    setScope: setScope, setCrosshair: setCrosshair,
    setTimer: setTimer, setKillTarget: setKillTarget,
    addFeed: addFeed, updateScoreboard: updateScoreboard, showScoreboard: showScoreboard,
    showDeath: showDeath, setDeathCountdown: setDeathCountdown, hideDeath: hideDeath,
    showEnd: showEnd, hideEnd: hideEnd,
    showPause: showPause, showClickToPlay: showClickToPlay,
    toast: toast,
    getSensitivity: function () { return sensitivity; },
    el: function (id) { return els[id]; }
  };
})();
