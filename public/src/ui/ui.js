/* UI — owns every DOM element. Menu flow + HUD updates.
   Game logic never touches the DOM directly; it calls these functions. */
var UI = (function () {
  function $(id) { return document.getElementById(id); }

  var els = {};
  var feedTimers = [];

  function cache() {
    ['menu-layer', 'hud-layer', 'screen-main', 'screen-create', 'screen-join', 'screen-lobby',
      'create-name', 'create-mode', 'create-kills', 'create-time', 'btn-create', 'btn-goto-create', 'btn-goto-join',
      'lobby-mode', 'lobby-map', 'create-map', 'loading-label', 'live-board', 'team-score', 'armor-badge', 'armor-row',
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
      'btn-resume', 'btn-quit', 'click-to-play', 'toasts', 'loading',
      'announce', 'cook-bar', 'cook-fill', 'att-list',
      'tc-mine', 'tc-molotov', 'countdown', 'btn-ready',
      'btn-voice', 'voice-ind', 'voice-diag',
      'info-map', 'info-mode', 'info-kills', 'info-time', 'info-slots', 'info-role',
      'ready-fill', 'ready-text', 'brand-modes', 'stat-maps'
    ].forEach(function (id) { els[id] = $(id); });
  }

  /* ---------- CFG-driven option lists ----------
     Every dropdown in the menu is built from CFG here. v7.3 hardcoded these in
     index.html, which is the sole reason Metro City shipped complete but could
     never be selected. Adding a map or mode now needs no markup change. */
  function fillSelect(el, items, selected) {
    if (!el) return;
    el.innerHTML = '';
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = String(it.v);
      o.textContent = it.t;
      if (String(it.v) === String(selected)) o.selected = true;
      el.appendChild(o);
    });
  }
  function mapItems() {
    return Object.keys(CFG.MAPS)
      .filter(function (k) { return CFG.MAPS[k].ready !== false; })
      .map(function (k) { return { v: k, t: CFG.MAPS[k].label }; });
  }
  function modeItems() {
    return Object.keys(CFG.MODES).map(function (k) {
      return { v: k, t: CFG.MODES[k].label + ' (' + CFG.MODES[k].maxPlayers + ')' };
    });
  }
  function killItems() {
    return CFG.MATCH.killOptions.map(function (n) { return { v: n, t: String(n) + ' kills' }; });
  }
  function timeItems() {
    return CFG.MATCH.timeOptions.map(function (n) { return { v: n, t: n + ' min' }; });
  }
  function populateSelects() {
    var M = CFG.MATCH;
    fillSelect(els['create-mode'], modeItems(), M.defaultMode);
    fillSelect(els['create-map'], mapItems(), 'urban');
    fillSelect(els['create-kills'], killItems(), M.defaultKills);
    fillSelect(els['create-time'], timeItems(), M.defaultMinutes);
    fillSelect(els['lobby-mode'], modeItems(), M.defaultMode);
    fillSelect(els['lobby-map'], mapItems(), 'urban');
    fillSelect(els['lobby-kills'], killItems(), M.defaultKills);
    fillSelect(els['lobby-time'], timeItems(), M.defaultMinutes);
    if (els['stat-maps']) els['stat-maps'].textContent = String(mapItems().length);
    if (els['brand-modes']) {
      els['brand-modes'].textContent = '2\u201310 player tactical combat \u00b7 ' +
        Object.keys(CFG.MODES).map(function (k) { return CFG.MODES[k].label; }).join(' \u00b7 ') +
        ' \u00b7 in your browser';
    }
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
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function renderBoard(d) {
    var el = els['live-board'];
    if (!el || !d || !d.players) return;
    var rows = d.players.slice().map(function (p) {
      var s = (p.kills | 0) * 200 + (p.assists | 0) * 50 + Math.round((p.damage || 0) * 0.5);
      return { n: p.name, k: p.kills | 0, dd: p.deaths | 0, a: p.assists | 0, s: s };
    }).sort(function (a, b) { return b.s - a.s || b.k - a.k; }).slice(0, 10);
    var t = (d.teams && d.settings && d.settings.mode !== 'ffa')
      ? '<div class="lb-teams">A ' + (d.teams.a | 0) + ' \u2014 ' + (d.teams.b | 0) + ' B</div>' : '';
    el.innerHTML = '<div class="lb-title">' + esc(currentMapLabel).toUpperCase() + '</div>' + t +
      '<div class="lb-row lb-h"><span>PLAYER</span><b>K</b><b>D</b><b>A</b><b>S</b></div>' +
      rows.map(function (r) {
        return '<div class="lb-row"><span>' + esc(r.n) + '</span><b>' + r.k + '</b><b>' + r.dd + '</b><b>' + r.a + '</b><b>' + r.s + '</b></div>';
      }).join('');
  }
  function updateLobby(d, myId) {
    renderBoard(d);
    var mode = CFG.MODES[d.settings.mode] || CFG.MODES.ffa;
    els['lobby-code'].textContent = d.code;
    els['lobby-count'].textContent = d.players.length + '/' + mode.maxPlayers;
    els['lobby-players'].innerHTML = '';

    function row(p) {
      var li = document.createElement('li');
      var host = p.id === d.hostId ? ' <em class="host-tag">HOST</em>' : '';
      var you = p.id === myId ? ' <em class="you-tag">YOU</em>' : '';
      var rdy = p.ready ? ' <em class="rdy-tag">READY</em>' : '';
      var vc = p.voice ? ' <em class="voice-tag">MIC</em>' : '';
      li.className = p.ready ? 'is-ready' : '';
      li.innerHTML = '<i class="dot" style="background:' + p.color + '"></i><b>' + p.name + '</b>' + host + you + vc + rdy;
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

    var meL = d.players.find(function (p) { return p.id === myId; });
    if (els['btn-ready']) {
      var r = !!(meL && meL.ready);
      els['btn-ready'].dataset.r = r ? '1' : '0';
      els['btn-ready'].textContent = r ? 'UNREADY' : 'READY UP';
      els['btn-ready'].classList.toggle('is-ready', r);
    }
    /* ---- START gate (v7.4) ----
       Every fact below comes from the server payload, never recomputed here, so
       the greyed button and the server's own refusal can never disagree. */
    var isHost = d.hostId === myId;
    var total = d.players.length;
    var notReady = (typeof d.notReady === 'number')
      ? d.notReady
      : d.players.filter(function (p) { return !p.ready; }).length;
    var allReady = (typeof d.allReady === 'boolean') ? d.allReady : (total > 0 && notReady === 0);
    var counting = !!d.counting;

    if (els['ready-fill']) {
      var pct = total ? Math.round(((total - notReady) / total) * 100) : 0;
      els['ready-fill'].style.width = pct + '%';
      els['ready-fill'].parentNode.classList.toggle('all', allReady);
    }
    if (els['ready-text']) {
      els['ready-text'].textContent = (total - notReady) + ' of ' + total + ' ready';
    }

    els['btn-start'].style.display = isHost ? '' : 'none';
    var canStart = isHost && allReady && !counting;
    els['btn-start'].disabled = !canStart;
    els['btn-start'].classList.toggle('is-disabled', !canStart);
    els['btn-start'].classList.toggle('is-armed', canStart);
    els['btn-start'].textContent = counting ? 'LAUNCHING\u2026' : 'START MATCH';

    var hint;
    if (counting) hint = 'Launch sequence started. Standing by\u2026';
    else if (!isHost) hint = allReady
      ? 'All operators ready. Waiting for the host to launch.'
      : 'Waiting for ' + notReady + ' operator' + (notReady === 1 ? '' : 's') + ' to ready up.';
    else if (allReady) hint = 'All operators ready \u2014 you may launch.';
    else hint = 'START MATCH is locked: waiting for ' + notReady +
      ' operator' + (notReady === 1 ? '' : 's') + ' to ready up.';
    els['lobby-hint'].textContent = hint;

    els['lobby-mode'].disabled = !isHost;
    if (els['lobby-map']) els['lobby-map'].disabled = !isHost;
    els['lobby-kills'].disabled = !isHost;
    els['lobby-time'].disabled = !isHost;
    els['lobby-mode'].value = d.settings.mode || 'ffa';
    if (els['lobby-map']) els['lobby-map'].value = d.settings.map || 'urban';
    els['lobby-kills'].value = String(d.settings.killTarget);
    els['lobby-time'].value = String(d.settings.minutes);

    // ---- LEFT column: room information ----
    var mapCfg = CFG.MAPS[d.settings.map] || CFG.MAPS.urban;
    if (els['info-map'])   els['info-map'].textContent   = mapCfg ? mapCfg.label : d.settings.map;
    if (els['info-mode'])  els['info-mode'].textContent  = mode.label;
    if (els['info-kills']) els['info-kills'].textContent = d.settings.killTarget + ' kills';
    if (els['info-time'])  els['info-time'].textContent  = d.settings.minutes + ' min';
    if (els['info-slots']) els['info-slots'].textContent = total + ' / ' + mode.maxPlayers;
    if (els['info-role'])  els['info-role'].textContent  = isHost ? 'HOST' : 'OPERATOR';
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
      (CFG.THROWS[d.weapon] && CFG.THROWS[d.weapon].label) ||
      (CFG.GEAR[d.weapon] && CFG.GEAR[d.weapon].label) || d.weapon || '?';
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
      tr.innerHTML = '<td><i class="dot" style="background:' + p.color + '"></i>' + p.name + '</td>' +
        '<td>' + p.kills + '</td><td>' + p.deaths + '</td><td>' + (p.assists || 0) + '</td>' +
        '<td>' + (p.damage || 0) + '</td><td>' + (p.streak || 0) + '</td><td>' + (pg | 0) + '</td>';
      els['sb-body'].appendChild(tr);
    }
    var mode = CFG.MODES[(Net.getMatch().mode) || 'ffa'] || CFG.MODES.ffa;
    if (mode.teams) {
      ['a', 'b'].forEach(function (t) {
        var members = roster.filter(function (p) { return p.team === t; });
        var total = members.reduce(function (s, p) { return s + p.kills; }, 0);
        var hdr = document.createElement('tr');
        hdr.className = 'team-hdr t' + t;
        hdr.innerHTML = '<td>TEAM ' + CFG.TEAMS[t].name + '</td><td>' + total + '</td><td></td><td></td><td></td><td></td><td></td>';
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
    var wl = (CFG.WEAPONS[d.weapon] && CFG.WEAPONS[d.weapon].label) ||
             (CFG.THROWS[d.weapon] && CFG.THROWS[d.weapon].label) || '';
    els['death-info'].textContent = d.self ? 'Careful with those explosives.'
      : 'Taken out by ' + d.killerName + (wl ? ' \u00b7 ' + wl : '') + (d.headshot ? ' \u00b7 HEADSHOT' : '');
  }
  function setDeathCountdown(sec) {
    els['death-timer'].textContent = sec > 0 ? 'Redeploying in ' + sec + '\u2026' : 'Redeploying\u2026';
  }
  function hideDeath() { els['death-overlay'].classList.add('hidden'); }

  function showEnd(d, myId, isHost) {
    /* v8.22: the result used to snap in with no transition, which reads as the
       game crashing rather than finishing. Retriggering the class forces the
       animation to replay on a second match in the same session — without the
       reflow read, the browser coalesces remove/add and nothing plays. The
       overlay wipes in, the card rises, then the scoreboard rows cascade, so
       the eye lands on the winner before the numbers arrive. Same easing
       family as the lobby, so an ending belongs to the same product as the
       welcome screen. CSS only — no JS timers to leak. */
    els['end-overlay'].classList.remove('hidden');
    els['end-overlay'].classList.remove('animate-in');
    void els['end-overlay'].offsetWidth;
    els['end-overlay'].classList.add('animate-in');
    var winner = d.players.find(function (p) { return p.id === d.winnerId; });
    var me = d.players.find(function (p) { return p.id === myId; });
    els['end-body'].innerHTML = '';
    function row(p) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><i class="dot" style="background:' + p.color + '"></i>' + p.name + '</td><td>' + p.kills + '</td><td>' + p.deaths + '</td><td>' + (p.assists || 0) + '</td><td>' + (p.damage || 0) + '</td>';
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
        hdr.innerHTML = '<td>TEAM ' + CFG.TEAMS[t].name + '</td><td></td><td></td><td></td><td></td>';
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
  function hideEnd() { els['end-overlay'].classList.add('hidden'); els['end-overlay'].classList.remove('animate-in'); }

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
        map: els['create-map'] ? els['create-map'].value : 'urban',
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
        map: els['lobby-map'] ? els['lobby-map'].value : 'urban',
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

  // ---------- v3 HUD ----------
  function setAttachments(atts) {
    if (!els['att-list']) return;
    var parts = [];
    ['sight', 'mag', 'muzzle'].forEach(function (cat) {
      if (atts[cat] && CFG.ATTACH[atts[cat]]) parts.push('<span>' + CFG.ATTACH[atts[cat]].label + '</span>');
    });
    els['att-list'].innerHTML = parts.join('');
  }
  var currentMapLabel = 'Urban';
  function setLoadingMap(label) {
    currentMapLabel = label || 'Urban';
    if (els['loading-label']) els['loading-label'].textContent = 'BUILDING ' + currentMapLabel.toUpperCase() + '\u2026';
  }
  function setVoiceState(state) {
    if (els['btn-voice']) {
      els['btn-voice'].textContent = state === 'off' ? 'JOIN VOICE' : 'VOICE ON \u00b7 hold T to talk';
      els['btn-voice'].classList.toggle('is-on', state !== 'off');
    }
    var ind = els['voice-ind'];
    if (!ind) return;
    ind.classList.toggle('hidden', state === 'off');
    ind.classList.toggle('live', state === 'talking');
    ind.classList.toggle('muted', state === 'muted');
    ind.textContent = state === 'talking' ? '\u25CF TALKING' : 'MIC MUTED \u2014 HOLD T';
  }
  /* Voice diagnostics. Voice failed silently for four releases because the only
     feedback was a toast that vanished. This shows the live per-peer state so a
     failure names its own stage instead of being "it doesn't work". */
  var vdTimer = null;
  function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function renderVoiceDiag() {
    var el = els['voice-diag'];
    if (!el || typeof VoiceChat === 'undefined' || !VoiceChat.getDiag) return;
    var dbg = (typeof CFG !== 'undefined' && CFG.VOICE && CFG.VOICE.debug);
    var d = VoiceChat.getDiag();
    if (!dbg || !d.joined) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    var turnBad = d.turn.indexOf('NONE') === 0;
    var h = '<div class="vd-h">VOICE DIAGNOSTICS</div>';
    h += '<div class="vd-row">mic: <span class="' + (d.mic.indexOf('live') > -1 ? 'vd-ok' : '') + '">' + esc(d.mic) + '</span></div>';
    h += '<div class="vd-row">turn: <span class="' + (turnBad ? 'vd-bad' : 'vd-ok') + '">' + esc(d.turn) + '</span></div>';
    if (!d.peers.length) h += '<div class="vd-row vd-bad">no peers &mdash; is the other side joined?</div>';
    d.peers.forEach(function (p) {
      var good = p.conn === 'connected' && p.track === 'YES';
      h += '<div class="vd-row">' + esc(p.name) + ': <span class="' + (good ? 'vd-ok' : 'vd-bad') + '">'
        + esc(p.conn) + '</span> ice=' + esc(p.ice) + ' audio=' + esc(p.track) + '</div>';
      if (p.cand !== '-') h += '<div class="vd-row">&nbsp;&nbsp;route: ' + esc(p.cand) + '</div>';
      if (p.err) h += '<div class="vd-row vd-bad">&nbsp;&nbsp;' + esc(p.err) + '</div>';
    });
    el.innerHTML = h;
  }
  function startVoiceDiag() {
    if (vdTimer) return;
    vdTimer = setInterval(renderVoiceDiag, 700);
  }

  function setGear(minesN, molosN) {
    if (els['tc-mine']) els['tc-mine'].textContent = 'V \u00d7' + minesN;
    if (els['tc-molotov']) els['tc-molotov'].textContent = 'H \u00d7' + molosN;
  }
  /* Rebuilt per tick so the pop animation restarts on every number. Replacing
     the node is the reliable way to retrigger a CSS animation without a
     forced-reflow hack. */
  function setCountdown(n) {
    var el = els['countdown'];
    if (!el) return;
    if (!(n > 0)) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.innerHTML =
      '<div class="cd-label">MATCH STARTS IN</div>' +
      '<div class="cd-num">' + n + '</div>' +
      '<div class="cd-ring"></div>';
    el.classList.remove('hidden');
  }
  function setCooking(on, frac) {
    if (!els['cook-bar']) return;
    els['cook-bar'].classList.toggle('hidden', !on);
    if (on) els['cook-fill'].style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }
  function announce(text, minor) {
    if (!els['announce']) return;
    var div = document.createElement('div');
    div.className = 'ann' + (minor ? ' minor' : '');
    div.textContent = text;
    els['announce'].appendChild(div);
    setTimeout(function () { div.remove(); }, minor ? 1500 : 2200);
  }
  function setCrosshairGap(px) {
    els['crosshair'].style.setProperty('--chgap', (px | 0) + 'px');
  }

  function wireV43() {
    if (els['btn-ready']) els['btn-ready'].addEventListener('click', function () {
      Net.setReady(this.dataset.r !== '1');
    });
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'KeyT' || e.repeat) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      VoiceChat.setTalking(true);
    });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'KeyT') VoiceChat.setTalking(false);
    });
    if (els['btn-voice']) els['btn-voice'].addEventListener('click', function () {
      if (VoiceChat.isJoined()) VoiceChat.leave();
      else VoiceChat.join();
    });
    startVoiceDiag();
  }

  function init() {
    cache();
    populateSelects();
    wireMenus();
    wireSettings();
    wireV43();
  }

  return {
    init: init,
    showScreen: showScreen, showMenu: showMenu, showHUD: showHUD, setLoading: setLoading,
    updateLobby: updateLobby,
    setVitals: setVitals, setTeamScore: setTeamScore, setWeapon: setWeapon, setReloading: setReloading,
    setScope: setScope, setCrosshair: setCrosshair,
    setAttachments: setAttachments, setCooking: setCooking, announce: announce, setCrosshairGap: setCrosshairGap,
    setGear: setGear, setCountdown: setCountdown,
    setVoiceState: setVoiceState,
    setLoadingMap: setLoadingMap,
    getMapLabel: function () { return currentMapLabel; },
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
