/* UI — owns every DOM element. Menu flow + HUD updates.
   Game logic never touches the DOM directly; it calls these functions. */
var UI = (function () {
  function $(id) { return document.getElementById(id); }

  var els = {};
  var feedTimers = [];

  function cache() {
    ['menu-layer', 'hud-layer', 'screen-main', 'screen-create', 'screen-join', 'screen-lobby',
      'create-name', 'create-mode', 'create-kills', 'create-time', 'btn-create', 'btn-goto-create', 'btn-goto-join',
      'lobby-mode', 'lobby-cat', 'create-cat', 'lobby-var-field', 'create-var-field', 'btn-shuffle', 'lobby-map', 'create-map', 'loading-label', 'live-board', 'team-score', 'armor-badge', 'armor-row',
      'join-name', 'join-code', 'btn-join',
      'lobby-code', 'btn-copy-code', 'lobby-players', 'lobby-count', 'lobby-kills', 'lobby-time',
      'lobby-team-a', 'lobby-team-b', 'team-name-row', 'lobby-bots', 'lobby-skill', 'bot-row',
      'lobby-hint', 'btn-start', 'btn-leave',
      'crosshair', 'scope-overlay', 'match-timer', 'kill-target', 'killfeed',
      'hp-fill', 'hp-num', 'armor-fill', 'armor-num',
      'weapon-name', 'ammo-mag', 'ammo-reserve', 'tc-frag', 'tc-smoke', 'tc-flash', 'reload-hint',
      'scoreboard', 'sb-code', 'sb-body',
      'death-overlay', 'death-info', 'death-timer', 'death-title',
      'end-overlay', 'end-title', 'end-sub', 'end-body', 'end-ins-left', 'end-ins-right', 'btn-back-lobby', 'end-hint',
      'pause-overlay', 'sens-range', 'sens-val', 'vol-range', 'vol-val', 'quality-shadows',
      'btn-resume', 'btn-quit', 'click-to-play', 'toasts', 'loading',
      'announce', 'cook-bar', 'cook-fill', 'att-list',
      'tc-mine', 'tc-molotov', 'countdown', 'btn-ready',
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
  /* v8.37 TWO-STEP MODE PICKER.

     Thirteen modes in one dropdown was a wall of text — Rahul: "it is becoming
     confusing". Category first, then the setup within it. The flat CFG.MODES
     table is untouched and still what goes on the wire; this is only a view. */
  function catItems() {
    return CFG.MODE_CATS.map(function (c) { return { v: c.id, t: c.label }; });
  }
  function variantItems(catId) {
    return CFG.modesInCat(catId).map(function (k) {
      return { v: k, t: CFG.MODES[k].vlabel + '  (' + CFG.MODES[k].maxPlayers + ')' };
    });
  }
  /* v8.37: rename ONE side. The server merges rather than replaces, so sending
     a single key never blanks the others. */
  function pushTeamName(t, name) {
    if (!t) return;
    var tn = {}; tn[t] = name;
    Net.updateSettings({ teamNames: tn });
  }
  function catOf(modeId) { return (CFG.MODES[modeId] || {}).cat || 'ffa'; }
  /* A category with one setup has nothing to choose, so the second dropdown is
     hidden rather than shown holding a single option. */
  function syncVariants(catSel, varSel, fieldEl, modeId) {
    if (!catSel || !varSel) return;
    var cat = catSel.value || catOf(modeId);
    var items = variantItems(cat);
    fillSelect(varSel, items, items.some(function (i) { return i.v === modeId; }) ? modeId : items[0].v);
    if (fieldEl) fieldEl.style.display = items.length > 1 ? '' : 'none';
  }
  function killItems() {
    // v8.30: 0 is the UNLIMITED sentinel — the clock ends the match instead.
    return CFG.MATCH.killOptions.map(function (n) {
      return { v: n, t: n > 0 ? (String(n) + ' kills') : 'Unlimited kills' };
    });
  }
  function timeItems() {
    return CFG.MATCH.timeOptions.map(function (n) { return { v: n, t: n + ' min' }; });
  }
  function populateSelects() {
    var M = CFG.MATCH;
    fillSelect(els['create-cat'], catItems(), catOf(M.defaultMode));
    syncVariants(els['create-cat'], els['create-mode'], els['create-var-field'], M.defaultMode);
    fillSelect(els['create-map'], mapItems(), 'urban');
    fillSelect(els['create-kills'], killItems(), M.defaultKills);
    fillSelect(els['create-time'], timeItems(), M.defaultMinutes);
    var botItems = [];
    for (var bi = 1; bi <= 19; bi++) botItems.push({ v: bi, t: bi + (bi === 1 ? ' bot' : ' bots') });
    fillSelect(els['lobby-bots'], botItems, 5);
    fillSelect(els['lobby-skill'], [
      { v: 'recruit', t: 'Recruit \u00b7 learning the map' },
      { v: 'regular', t: 'Regular \u00b7 a fair fight' },
      { v: 'veteran', t: 'Veteran \u00b7 they shoot back properly' },
      { v: 'extreme', t: 'Extreme \u00b7 they will not miss much' }
    ], 'regular');
    fillSelect(els['lobby-cat'], catItems(), catOf(M.defaultMode));
    syncVariants(els['lobby-cat'], els['lobby-mode'], els['lobby-var-field'], M.defaultMode);
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
    /* v8.34: two sides keep the A n — n B line. More than two and the mini
       board shows the top three, which is what a squad player actually scans
       for: am I winning, and who do I have to catch. */
    var t = '';
    if (d.teams && d.settings && d.settings.mode !== 'ffa') {
      var tids = Object.keys(d.teams);
      if (tids.length <= 2) {
        t = '<div class="lb-teams">A ' + (d.teams.a | 0) + ' \u2014 ' + (d.teams.b | 0) + ' B</div>';
      } else {
        t = '<div class="lb-teams">' + tids.slice()
          .sort(function (x, y) { return (d.teams[y] | 0) - (d.teams[x] | 0); })
          .slice(0, 3)
          .map(function (id) { return esc(teamName(id)) + ' ' + (d.teams[id] | 0); })
          .join(' \u00b7 ') + '</div>';
      }
    }
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
      var botTag = p.bot ? ' <em class="bot-tag">BOT</em>' : '';   // v8.38
      var vc = '';
      li.className = p.ready ? 'is-ready' : '';
      /* v8.28: the host gets a A/B switch on every row in a team mode. Shown
         only to the host and only in the lobby, because the server refuses it
         anywhere else and a button that silently does nothing is worse than no
         button. The arrow points at the team the click MOVES them to. */
      /* v8.34: with two sides this is still a straight A/B toggle. With ten it
         CYCLES to the next squad, so the host walks a player round the ring
         with repeated clicks — no dropdown, no new UI, and the arrow still
         names exactly where the click sends them. Team sizes are never
         enforced, which is what allows "4 in one squad and 2 in another". */
      /* v8.37: two sides keeps the one-click toggle it always had. Beyond two,
         cycling would be up to nine clicks to reach the far squad, so the host
         gets a direct picker instead. */
      var swap = '';
      var sides = CFG.activeTeams(d.settings.mode);
      if (mode.teams && d.hostId === myId && sides.indexOf(p.team) >= 0) {
        if (sides.length <= 2) {
          var to = sides[(sides.indexOf(p.team) + 1) % sides.length];
          swap = ' <button class="team-swap" data-id="' + p.id + '" data-to="' + to +
                 '" title="Move to ' + teamName(to) + '">&#8644; ' + teamName(to) + '</button>';
        } else {
          swap = ' <select class="team-pick" data-id="' + p.id + '">' +
            sides.map(function (t) {
              return '<option value="' + t + '"' + (t === p.team ? ' selected' : '') + '>' +
                esc(teamName(t)) + '</option>';
            }).join('') + '</select>';
        }
      }
      li.innerHTML = '<i class="dot" style="background:' + p.color + '"></i><b>' + p.name + '</b>' + host + you + botTag + vc + rdy + swap;
      els['lobby-players'].appendChild(li);
    }
    if (!els['lobby-players'].__teamSwapBound) {
      els['lobby-players'].__teamSwapBound = true;
      els['lobby-players'].addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.team-swap');
        if (!b) return;
        Net.setPlayerTeam(b.getAttribute('data-id'), b.getAttribute('data-to'));
      });
      /* v8.37: the picker used beyond two sides. Delegated on the same list so
         a re-render never needs to rebind anything. */
      els['lobby-players'].addEventListener('change', function (e) {
        var sel = e.target.closest && e.target.closest('.team-pick');
        if (sel) { Net.setPlayerTeam(sel.getAttribute('data-id'), sel.value); return; }
        var inp = e.target.closest && e.target.closest('.team-rename');
        if (inp) pushTeamName(inp.getAttribute('data-team'), inp.value);
      });
      els['lobby-players'].addEventListener('keydown', function (e) {
        var inp = e.target.closest && e.target.closest('.team-rename');
        if (inp && e.key === 'Enter') inp.blur();
      });
      els['lobby-players'].addEventListener('focusout', function (e) {
        var inp = e.target.closest && e.target.closest('.team-rename');
        if (inp) pushTeamName(inp.getAttribute('data-team'), inp.value);
      });
    }
    if (mode.teams) {
      /* v8.37: EVERY side the mode fields, not just a and b. Rahul: "All teams
         are currently not showing in the staging area just amber and cobalt."
         Empty squads are still listed, because a host needs to see the empty
         slot in order to drag someone into it. */
      CFG.activeTeams(d.settings.mode).forEach(function (t) {
        var hdr = document.createElement('li');
        hdr.className = 'hdr t' + t;
        var members = d.players.filter(function (p) { return p.team === t; });
        var tint = (CFG.TEAMS[t] || {}).color || '';
        if (d.hostId === myId) {
          /* Renaming happens IN PLACE on the team header. Ten sides would need
             ten inputs in the rules panel; here each one sits exactly where it
             already reads, and there is nothing extra to find. */
          hdr.innerHTML = '<input class="team-rename" data-team="' + t +
            '" maxlength="12" value="' + esc(teamName(t)) +
            '" style="color:' + tint + '"><em class="tcount">' + members.length + '</em>';
        } else {
          hdr.innerHTML = '<span style="color:' + tint + '">' + esc(teamName(t)) +
            '</span><em class="tcount">' + members.length + '</em>';
        }
        els['lobby-players'].appendChild(hdr);
        members.forEach(row);
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
    if (els['lobby-cat'] && document.activeElement !== els['lobby-cat']) {
      els['lobby-cat'].value = catOf(d.settings.mode);                       // v8.37
      syncVariants(els['lobby-cat'], els['lobby-mode'], els['lobby-var-field'], d.settings.mode);
    }
    if (els['btn-shuffle']) {
      els['btn-shuffle'].style.display =
        (isHost && CFG.activeTeams(d.settings.mode).length >= 2) ? '' : 'none';
    }
    /* v8.38: bot controls belong to Overrun only.
       v9.2: and to Strike Team. The test is CFG.botsAllowed rather than a
       category string, so the controls follow the same rule the server guard
       does — a mode that gets bots always gets the sliders to configure them. */
    var isPractice = (CFG.MODES[d.settings.mode] || {}).cat === 'practice';
    var hasBots = CFG.botsAllowed(d.settings.mode);
    if (els['bot-row']) els['bot-row'].style.display = hasBots ? '' : 'none';
    if (els['lobby-bots'] && document.activeElement !== els['lobby-bots']) {
      /* Strike Team shows 0 = "match the squad", which is what the server does
         with an unset count. Showing 5 there would be a lie about the default. */
      els['lobby-bots'].value = String(d.settings.botCount || (isPractice ? 5 : 0));
      els['lobby-bots'].disabled = !isHost;
    }
    if (els['lobby-skill'] && document.activeElement !== els['lobby-skill']) {
      els['lobby-skill'].value = d.settings.botSkill || 'regular';
      els['lobby-skill'].disabled = !isHost;
    }
    els['lobby-kills'].value = String(d.settings.killTarget);
    /* v8.33: only meaningful in team modes, and only the host may edit. Skip
       writing the value back while the host is mid-typing, otherwise every
       lobby push would yank the caret to the end of the field. */
    /* v8.34: the two rename boxes only make sense head-to-head. Squad modes
       field up to ten sides and ten text inputs would swamp the panel, so they
       keep the palette names — which are already distinct and colour-matched. */
    var sidesN = CFG.activeTeams(d.settings.mode).length;
    var teamsOn = !!(CFG.MODES[d.settings.mode] && CFG.MODES[d.settings.mode].teams) && sidesN === 2;
    if (els['team-name-row']) els['team-name-row'].style.display = teamsOn ? '' : 'none';
    ['a', 'b'].forEach(function (t) {
      var el = els['lobby-team-' + t];
      if (!el) return;
      el.disabled = !isHost;
      if (document.activeElement !== el) el.value = teamName(t);
    });
    els['lobby-time'].value = String(d.settings.minutes);

    // ---- LEFT column: room information ----
    setTeamNames(d.settings && d.settings.teamNames);      // v8.33
    _mode = d.settings.mode || 'ffa';                     // v8.34
    var mapCfg = CFG.MAPS[d.settings.map] || CFG.MAPS.urban;
    if (els['info-map'])   els['info-map'].textContent   = mapCfg ? mapCfg.label : d.settings.map;
    if (els['info-mode'])  els['info-mode'].textContent  = mode.label;
    if (els['info-kills']) els['info-kills'].textContent =
      d.settings.killTarget > 0 ? (d.settings.killTarget + ' kills') : 'Unlimited';
    if (els['info-time'])  els['info-time'].textContent  = d.settings.minutes + ' min';
    if (els['info-slots']) els['info-slots'].textContent =
      isPractice ? (total + ' + ' + (d.settings.botCount || 0) + ' bots')
      : hasBots  ? (total + ' / ' + mode.maxPlayers + '  vs ' +
                    (d.settings.botCount ? d.settings.botCount : total || 1) + ' bots')
                 : (total + ' / ' + mode.maxPlayers);
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
    var ids = CFG.activeTeams(_mode);
    /* v8.34: two sides keep the exact head-to-head readout they always had.
       Ten sides cannot fit that shape, so squads get a compact form instead:
       your own squad, then whoever is leading. That is the only information
       that changes a decision mid-match — a ten-column ladder on the HUD would
       be unreadable at a glance and is what the TAB scoreboard is for. */
    if (ids.length <= 2) {
      els['team-score'].innerHTML =
        '<span class="ta">' + teamName('a') + ' ' + (tk.a | 0) + '</span>' +
        '<span class="tdash">-</span>' +
        '<span class="tb">' + (tk.b | 0) + ' ' + teamName('b') + '</span>';
      return;
    }
    var lead = null, leadN = -1;
    ids.forEach(function (t) { var v = tk[t] | 0; if (v > leadN) { leadN = v; lead = t; } });
    var mine = myTeam && ids.indexOf(myTeam) >= 0 ? myTeam : null;
    var html = '';
    if (mine) html += '<span class="ta" style="color:' + (CFG.TEAMS[mine] || {}).color + '">' +
      teamName(mine) + ' ' + (tk[mine] | 0) + '</span>';
    if (lead && lead !== mine) {
      html += '<span class="tdash">\u00b7</span><span class="tb" style="color:' +
        (CFG.TEAMS[lead] || {}).color + '">LEAD ' + teamName(lead) + ' ' + leadN + '</span>';
    } else if (lead === mine) {
      html += '<span class="tdash">\u00b7</span><span class="tb">LEADING</span>';
    }
    els['team-score'].innerHTML = html;
  }

  /* v8.33 HOST-EDITABLE TEAM NAMES.

     Six places used to hardcode CFG.TEAMS[t].name. They now all route through
     here, so a rename lands everywhere at once — lobby roster, live scoreboard,
     in-match team score, and the end screen — instead of drifting apart. The
     config value is the fallback, never the source, and the server has already
     stripped anything dangerous before it reaches this point. */
  var _teamNames = null;
  var _mode = 'ffa';                 // v8.34: drives how many sides to render
  function setTeamNames(tn) { _teamNames = tn || null; }
  function teamName(t) {
    if (_teamNames && _teamNames[t]) return _teamNames[t];
    return (CFG.TEAMS[t] || {}).name || String(t).toUpperCase();
  }

  function setWeapon(label, mag, reserve, throwsLeft) {
    els['weapon-name'].textContent = label;
    if (label === 'Knife') { els['ammo-mag'].textContent = '\u2014'; els['ammo-reserve'].textContent = ''; }
    else { els['ammo-mag'].textContent = mag; els['ammo-reserve'].textContent = reserve; }
    if (throwsLeft) {
      els['tc-frag'].textContent = 'G \u00d7' + throwsLeft.frag;
      els['tc-smoke'].textContent = 'B \u00d7' + throwsLeft.smoke;
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
      CFG.activeTeams(d.settings.mode).forEach(function (t) {          // v8.37: all sides
        var members = roster.filter(function (p) { return p.team === t; });
        if (!members.length) return;
        var total = members.reduce(function (s, p) { return s + p.kills; }, 0);
        var hdr = document.createElement('tr');
        hdr.className = 'team-hdr t' + t;
        hdr.innerHTML = '<td>TEAM ' + teamName(t) + '</td><td>' + total + '</td><td></td><td></td><td></td><td></td><td></td>';
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
    /* v8.37: reset the elimination wording. Without this a Last Stand match
       would leave the overlay saying ELIMINATED for every ordinary death in
       every later match on the same page load. */
    if (els['death-title']) els['death-title'].textContent = 'K.I.A.';
    els['death-overlay'].classList.remove('hidden');
    var wl = (CFG.WEAPONS[d.weapon] && CFG.WEAPONS[d.weapon].label) ||
             (CFG.THROWS[d.weapon] && CFG.THROWS[d.weapon].label) || '';
    els['death-info'].textContent = d.self ? 'Careful with those explosives.'
      : 'Taken out by ' + d.killerName + (wl ? ' \u00b7 ' + wl : '') + (d.headshot ? ' \u00b7 HEADSHOT' : '');
  }
  function setDeathCountdown(sec) {
    els['death-timer'].textContent = sec > 0 ? 'Redeploying in ' + sec + '\u2026' : 'Redeploying\u2026';
  }
  /* v8.37: replace the respawn countdown with a plain statement of fact. */
  function setDeathEliminated() {
    if (els['death-title']) els['death-title'].textContent = 'ELIMINATED';
    if (els['death-timer']) els['death-timer'].textContent =
      'One life. Press M to watch the sector \u00b7 TAB for the board.';
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
    /* v8.31.2: #end-overlay is a CHILD of #hud-layer, so the minimap, the live
       mini-scoreboard, the crosshair and the ammo block kept drawing behind and
       on top of the result. One class switches the lot off; hideEnd puts them
       back. */
    if (els['hud-layer']) els['hud-layer'].classList.add('end-active');
    els['end-overlay'].classList.remove('hidden');
    els['end-overlay'].classList.remove('animate-in');
    void els['end-overlay'].offsetWidth;
    els['end-overlay'].classList.add('animate-in');
    var winner = d.players.find(function (p) { return p.id === d.winnerId; });
    var me = d.players.find(function (p) { return p.id === myId; });
    els['end-body'].innerHTML = '';
    function row(p) {
      var tr = document.createElement('tr');
      /* v8.29: STREAK and K/D added so this table matches the live one behind
         Tab. It was five columns against the live board's seven, which is why
         the two never looked like the same scoreboard. Ping is deliberately
         left out — it is a live network reading and means nothing once the
         match is over. */
      var kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : (p.kills > 0 ? p.kills.toFixed(2) : '0.00');
      tr.innerHTML = '<td><i class="dot" style="background:' + p.color + '"></i>' + p.name + '</td><td>' + p.kills + '</td><td>' + p.deaths + '</td><td>' + (p.assists || 0) + '</td><td>' + (p.damage || 0) + '</td><td>' + (p.bestStreak || p.streak || 0) + '</td><td>' + kd + '</td>';
      els['end-body'].appendChild(tr);
    }
    if (d.winnerTeam) {
      var won = me && me.team === d.winnerTeam;
      els['end-title'].textContent = won ? 'VICTORY' : ('TEAM ' + teamName(d.winnerTeam) + ' WINS');
      els['end-title'].className = 'end-title team-' + d.winnerTeam + (won ? ' win' : '');
      /* v8.34: read the sides straight off the payload rather than assuming
         two. Head-to-head keeps its dash; squads list the top three, because a
         ten-way scoreline on one line is noise. */
      var tks = d.teamKills ? Object.keys(d.teamKills) : [];
      var tail = (d.reason === 'time' ? ' \u00b7 time expired'
        : d.reason === 'forfeit' ? ' \u00b7 forfeit' : '');
      if (!tks.length) els['end-sub'].textContent = '';
      else if (tks.length <= 2) {
        els['end-sub'].textContent = teamName('a') + ' ' + (d.teamKills.a | 0) + ' \u2013 ' +
          (d.teamKills.b | 0) + ' ' + teamName('b') + tail;
      } else {
        /* v8.36: ALL sides, not the top three. Rahul: "see at the top it
           showing only three teams." On an end screen there is room and the
           full ladder is the point — you want to see where your squad placed,
           not just who won. Sorted strongest first so the ladder still reads
           top-down. */
        var top = tks.slice().sort(function (x, y) { return (d.teamKills[y] | 0) - (d.teamKills[x] | 0); });
        els['end-sub'].textContent = top.map(function (t) {
          return teamName(t) + ' ' + (d.teamKills[t] | 0);
        }).join('  \u00b7  ') + tail;
      }
      /* Group the board by side, strongest first, so a squad match reads as a
         ladder instead of an arbitrary order. */
      var order = tks.slice().sort(function (x, y) { return (d.teamKills[y] | 0) - (d.teamKills[x] | 0); });
      if (!order.length) order = ['a', 'b'];
      order.forEach(function (t) {
        var hdr = document.createElement('tr');
        hdr.className = 'team-hdr t' + t;
        if (!d.players.some(function (p) { return p.team === t; })) return;   // v8.34: skip empty squads
        hdr.innerHTML = '<td>TEAM ' + teamName(t) + '</td><td></td><td></td><td></td><td></td><td></td><td></td>';
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
    /* v8.29 MATCH INSIGHTS.

       Every field the server sends is optional — a two-player match with one
       kill produces most of them as null — so each card is pushed only if its
       data exists and the whole block hides when nothing qualified. An empty
       row of headings looks broken; no row at all looks deliberate.

       Nemesis is the only one that reads differently per player, which is what
       makes it worth having. */
    var ins = d.insights, cards = [];
    function card(label, text, tone) {
      cards.push('<div class="ins' + (tone ? ' ' + tone : '') + '"><span class="ins-k">' +
        label + '</span><span class="ins-v">' + text + '</span></div>');
    }
    if (ins) {
      if (ins.rivalry) card('RIVALRY', ins.rivalry.killer + ' dominated ' + ins.rivalry.victim +
        ' &middot; ' + ins.rivalry.n + ' kills', 'hot');
      if (ins.nemesis && me && ins.nemesis[myId]) card('YOUR NEMESIS',
        ins.nemesis[myId].name + ' killed you ' + ins.nemesis[myId].n + '\u00d7', 'bad');
      if (ins.bestStreak) card('BEST STREAK', ins.bestStreak.name + ' &middot; ' +
        ins.bestStreak.n + ' in a row', 'hot');
      if (ins.longest) card('LONGEST SHOT', ins.longest.name + ' &middot; ' +
        ins.longest.m.toFixed(0) + ' m with the ' +
        ((CFG.WEAPONS[ins.longest.weapon] || {}).label || ins.longest.weapon));
      if (ins.favouriteWeapon) card('WEAPON OF CHOICE', ins.favouriteWeapon.name + ' &middot; ' +
        ins.favouriteWeapon.n + ' with the ' +
        ((CFG.WEAPONS[ins.favouriteWeapon.w] || CFG.THROWS[ins.favouriteWeapon.w] ||
          CFG.GEAR[ins.favouriteWeapon.w] || {}).label || ins.favouriteWeapon.w));
      if (ins.headshots) card('DEADEYE', ins.headshots.name + ' &middot; ' + ins.headshots.n +
        ' headshot' + (ins.headshots.n === 1 ? '' : 's'));
      if (ins.mostDamage) card('MOST DAMAGE', ins.mostDamage.name + ' &middot; ' +
        ins.mostDamage.n);
      if (ins.firstBlood) card('FIRST BLOOD', ins.firstBlood.name + ' \u2192 ' + ins.firstBlood.victim);
      if (ins.finalBlow) card('FINAL BLOW', ins.finalBlow.name + ' \u2192 ' + ins.finalBlow.victim);
    }
    /* v8.31.2: deal the cards alternately into the two columns flanking the
       scoreboard. Alternating rather than splitting down the middle keeps the
       two sides the same height when the count is odd, and keeps the most
       interesting cards (rivalry, nemesis) at the top of BOTH columns instead
       of stacking them all on the left. */
    var L = [], Rr = [];
    cards.forEach(function (c, i) { (i % 2 ? Rr : L).push(c); });
    function fill(el, list, withTitle) {
      if (!el) return;
      el.innerHTML = list.length
        ? (withTitle ? '<div class="ins-title">MATCH INSIGHTS</div>' : '') + list.join('')
        : '';
      el.style.display = list.length ? '' : 'none';
    }
    fill(els['end-ins-left'], L, true);
    fill(els['end-ins-right'], Rr, false);

    els['btn-back-lobby'].style.display = isHost ? '' : 'none';
    els['end-hint'].style.display = isHost ? 'none' : '';
  }
  function hideEnd() {
    els['end-overlay'].classList.add('hidden');
    els['end-overlay'].classList.remove('animate-in');
    if (els['hud-layer']) els['hud-layer'].classList.remove('end-active');   // v8.31.2: give the HUD back
  }

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
        minutes: parseInt(els['lobby-time'].value, 10),
        botCount: parseInt(els['lobby-bots'] ? els['lobby-bots'].value : 0, 10) || 0,
        botSkill: els['lobby-skill'] ? els['lobby-skill'].value : 'regular',
        teamNames: {                                    // v8.33
          a: els['lobby-team-a'] ? els['lobby-team-a'].value : '',
          b: els['lobby-team-b'] ? els['lobby-team-b'].value : ''
        }
      });
    }
    els['lobby-mode'].addEventListener('change', pushSettings);
    /* v8.37: changing category rebuilds the setup list, then pushes, so the
       server never sees a category without a valid mode under it. */
    if (els['lobby-cat']) els['lobby-cat'].addEventListener('change', function () {
      syncVariants(els['lobby-cat'], els['lobby-mode'], els['lobby-var-field'], els['lobby-mode'].value);
      pushSettings();
    });
    if (els['create-cat']) els['create-cat'].addEventListener('change', function () {
      syncVariants(els['create-cat'], els['create-mode'], els['create-var-field'], els['create-mode'].value);
    });
    if (els['btn-shuffle']) els['btn-shuffle'].addEventListener('click', function () {
      Net.shuffleTeams();
    });
    els['lobby-kills'].addEventListener('change', pushSettings);
    els['lobby-time'].addEventListener('change', pushSettings);
    if (els['lobby-bots']) els['lobby-bots'].addEventListener('change', pushSettings);
    if (els['lobby-skill']) els['lobby-skill'].addEventListener('change', pushSettings);
    /* Push on blur and on Enter rather than on every keystroke: a rename is a
       whole word, and one socket message per character would be silly. */
    ['lobby-team-a', 'lobby-team-b'].forEach(function (id) {
      if (!els[id]) return;
      els[id].addEventListener('change', pushSettings);
      els[id].addEventListener('blur', pushSettings);
      els[id].addEventListener('keydown', function (e) { if (e.key === 'Enter') els[id].blur(); });
    });
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
    setGear: setGear, setCountdown: setCountdown, setDeathEliminated: setDeathEliminated, setTeamNames: setTeamNames, teamName: teamName,
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
