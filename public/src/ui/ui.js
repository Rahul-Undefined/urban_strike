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
      'mode-brief', 'kills-row', 'kills-label', 'backfill-row', 'lobby-backfill', 'lobby-bfskill',
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
      'ready-fill', 'ready-text', 'stat-maps', 'stat-weapons', 'stat-attach', 'stat-seats', 'brand-ver'
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
    /* Both difficulty selects are filled from ONE list. Overrun uses
       `lobby-skill`, backfill uses `lobby-bfskill`, and they write the same
       room setting — two lists would drift the moment a rung is retuned. */
    var skillItems = [
      { v: 'recruit', t: 'Recruit \u00b7 stays on the street, one rifle' },
      { v: 'regular', t: 'Regular \u00b7 a fair fight' },
      { v: 'veteran', t: 'Veteran \u00b7 they take the high ground' },
      { v: 'extreme', t: 'Extreme \u00b7 they play like people' }
    ];
    fillSelect(els['lobby-skill'], skillItems, 'regular');
    fillSelect(els['lobby-bfskill'], skillItems, 'regular');
    fillSelect(els['lobby-cat'], catItems(), catOf(M.defaultMode));
    syncVariants(els['lobby-cat'], els['lobby-mode'], els['lobby-var-field'], M.defaultMode);
    fillSelect(els['lobby-map'], mapItems(), 'urban');
    fillSelect(els['lobby-kills'], killItems(), M.defaultKills);
    fillSelect(els['lobby-time'], timeItems(), M.defaultMinutes);
    /* v10.12: the build number on the menu comes from the same /version the
       cache stamp uses. A hardcoded one on a screen whose whole job is to say
       which build you are running would be the worst possible thing to let go
       stale. */
    if (els['brand-ver'] && !els['brand-ver'].dataset.set) {
      els['brand-ver'].dataset.set = '1';
      try {
        fetch('/version').then(function (r) { return r.text(); })
          .then(function (v) { els['brand-ver'].textContent = (v || '').trim() || '\u2014'; })
          .catch(function () { });
      } catch (e) { }
    }
    if (els['stat-maps']) els['stat-maps'].textContent = String(mapItems().length);
    /* v10.12: both of these were hardcoded — "3 THEATRES" and "25 WEAPONS" —
       and both were wrong the moment killhouse shipped and the v10.9 cull
       retired four guns. A number on the front page that contradicts the game
       is worse than no number, and a hardcoded one goes stale silently.
       Counted from CFG so they cannot drift again. */
    if (els['stat-weapons']) {
      var playable = CFG.WEAPON_ORDER.filter(function (w) {
        var it = CFG.LOOT_ITEMS['wpn_' + w];
        return !(it && it.retired);
      }).length;
      els['stat-weapons'].textContent = String(playable);
    }
    if (els['stat-attach']) els['stat-attach'].textContent = String(Object.keys(CFG.ATTACH).length);
    /* MAX OPERATORS read 20 and had been wrong since v10.9 dropped the cap to
       15. The largest SELECTABLE mode is the honest number — counting hidden
       modes would advertise a lobby size nobody can choose. */
    if (els['stat-seats']) {
      var seats = 0;
      for (var mk in CFG.MODES) {
        if (CFG.MODES[mk].hidden) continue;
        seats = Math.max(seats, CFG.MODES[mk].maxPlayers | 0);
      }
      els['stat-seats'].textContent = String(seats);
    }
    /* v9.9: THIS was the wall of text.
       It listed EVERY mode label joined by dots. That read fine at eight modes
       in v8.x; by v9.7 there are twenty-five, and the welcome screen was
       carrying a paragraph of comma-soup nobody reads before clicking CREATE
       ROOM. The stat strip above already says how many theatres, weapons and
       operators there are, in numbers, which is what a player actually scans.
       The element is gone from index.html and this block with it. A line that
       grows every time a feature is added is a line that will be too long
       again in two versions. */
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
    /* v9.4 STRIKE TEAM IS NOT A TEAM PICKER.
       `mode.teams` is true for Strike Team because it IS a two-sided match —
       that is what keeps friendly fire off and the team kill target working.
       But the second side is machines. Showing the side headers meant the
       staging area invited the host to arrange operators across two teams, one
       of which no human can ever join, and offered a rename box for the bots.
       Rahul: "it is asking me to select team members but this is just human vs
       bot as one team of human vs one team of bot."

       So a vsBots mode renders ONE roster, flat, exactly like free-for-all —
       because from the players' point of view that is what it is. The bot side
       is described by the Strike Team panel further down, not by an empty team
       header nobody can fill. */
    var vsBots = !!mode.vsBots;
    if (mode.teams && !vsBots) {
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
    /* v9.11 BACKFILL ROW — the human modes only. A mode that already fields
       bots must not offer to fill its slots with more of them. */
    var canFill = CFG.backfillAllowed(d.settings.mode);
    if (els['backfill-row']) els['backfill-row'].style.display = canFill ? '' : 'none';
    if (els['lobby-backfill'] && document.activeElement !== els['lobby-backfill']) {
      els['lobby-backfill'].value = (d.settings.backfill === false) ? '0' : '1';
      els['lobby-backfill'].disabled = !isHost;
    }
    if (els['lobby-bfskill'] && document.activeElement !== els['lobby-bfskill']) {
      els['lobby-bfskill'].value = d.settings.botSkill || 'regular';
      els['lobby-bfskill'].disabled = !isHost;
    }
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
    /* ============ v9.4 — THE STAGING AREA ANSWERS THE MODE ==============

       Rahul: "it is very default for any mode, i need the staging area to be
       active for the mode selected by the host, only necessary information or
       questions in the staging area."

       Every mode was shown the same panel: kills, duration, two team-name
       boxes, and a bot row. In free-for-all the team boxes were dead controls.
       In Last Stand the KILLS field was worse than dead — that mode ends when
       one side is left standing, so a kill target is not a setting, it is a
       misleading one. In Strike Team the host was asked to name the machines.

       So the panel is now assembled per mode from three questions:
         - does this mode END on kills?      (Last Stand does not)
         - does it have sides a human picks? (vsBots does not)
         - does it field bots?
       Anything a mode cannot use is hidden rather than disabled, because a
       greyed-out control still asks the host to think about it.

       The briefing line above it exists for the same reason. A host choosing
       "Squads 5 x 4" had to already know what that meant; now the panel says
       so, together with the one rule that mode changes. */
    var mBrief = CFG.MODES[d.settings.mode] || CFG.MODES.ffa;
    var isElim = !!CFG.isElimination(d.settings.mode);
    var livesN = CFG.livesFor(d.settings.mode);
    if (els['mode-brief']) {
      var tag, line;
      if (mBrief.vsBots) {
        tag = 'Strike Team';
        line = '<b>' + mBrief.maxPlayers + ' operator' + (mBrief.maxPlayers > 1 ? 's' : '') +
          '</b> against a squad of machines. Set how many bots and how hard they fight.';
      } else if (isElim) {
        tag = 'Last Stand';
        line = '<b>' + (livesN === 1 ? 'One life' : livesN + ' lives') + '.</b> ' +
          (mBrief.squads ? mBrief.teamCount + ' squads of ' + mBrief.squadSize : 'Everyone for themselves') +
          ' \u2014 the match ends when one side is left standing, so there is no kill target.';
      } else if (mBrief.squads) {
        tag = 'Squads';
        line = '<b>' + mBrief.teamCount + ' squads of ' + mBrief.squadSize +
          '.</b> First squad to the kill target wins. Friendly fire is off.';
      } else if (mBrief.teams) {
        tag = 'Team Battle';
        line = '<b>' + mBrief.maxPlayers / 2 + ' v ' + mBrief.maxPlayers / 2 +
          '.</b> Team kills are pooled. Friendly fire is off.';
      } else if (mBrief.practice) {
        tag = 'Overrun';
        line = '<b>One operator, the whole sector.</b> Choose how many bots come for you and how mean they are.';
      } else {
        tag = 'Free For All';
        line = '<b>Everyone for themselves.</b> First to the kill target wins.';
      }
      els['mode-brief'].innerHTML = '<span class="brief-tag">' + tag + '</span>' + line;
    }
    /* KILLS is meaningless in an elimination mode. Hidden, not disabled — a
       greyed control is still a question. DURATION stays, because a time limit
       is a real backstop in every mode including Last Stand. */
    if (els['kills-row']) {
      var killsOff = isElim;
      var kl = els['kills-label'];
      if (kl) kl.textContent = mBrief.teams && !mBrief.vsBots ? 'TEAM KILLS' : 'KILLS';
      var kf = els['lobby-kills'] && els['lobby-kills'].closest ? els['lobby-kills'].closest('.field') : null;
      if (kf) kf.style.display = killsOff ? 'none' : '';
      els['kills-row'].style.gridTemplateColumns = killsOff ? '1fr' : '1fr 1fr';
    }
    var sidesN = CFG.activeTeams(d.settings.mode).length;
    /* v9.4: and NOT in a vsBots mode. Strike Team fields two sides, so this
       used to offer the host two rename boxes — one for their squad and one for
       the machines. Renaming the bot team is not a setting anybody wants; it is
       a control that exists only because the mode happens to satisfy an old
       shape test. */
    var teamsOn = !!(CFG.MODES[d.settings.mode] && CFG.MODES[d.settings.mode].teams)
      && sidesN === 2 && !CFG.MODES[d.settings.mode].vsBots;
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
      /* v9.4 CRASH FIX — `d` does not exist here.
         updateScoreboard's parameters are (roster, myId, code, ping). `d` is
         the LOBBY PAYLOAD, and it is in scope in the lobby renderer a few
         hundred lines above, which is where this line was copied from in v8.37
         when the scoreboard learned to group by side.

         In a free-for-all `mode.teams` is false, so the line never ran and the
         mistake sat there. In any team mode — Team Battle, Squads, Last Stand
         Squads, and now Strike Team — every press of TAB threw
         "d is not defined", which window.onerror surfaced as the `script:`
         toast Rahul screenshotted. The scoreboard then rendered with no team
         grouping at all, because the throw aborted the rest of the function.

         The mode is already resolved on the line above from Net.getMatch(),
         which is the authoritative source here; the lobby payload is not even
         available at this point in a match. */
      CFG.activeTeams(Net.getMatch().mode || 'ffa').forEach(function (t) {   // v8.37: all sides
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

  /* ===== v10.10 KILLHOUSE NUKE + RECON VISOR HUD =====

     Display only. Not one of these functions decides anything: `armed` lives
     on the server (server/lib/nuke.js) and the banner is a mirror of what the
     server said. If this file and the server ever disagree, the server is
     right and the banner is stale — which is the correct failure direction for
     a reward that can be lost mid-aim. */
  var nukeArmed = false;
  function nukeEl() { return document.getElementById('nuke-banner'); }

  function nukeReady() {
    nukeArmed = true;
    var e = nukeEl(); if (e) e.classList.add('armed');
    toast('NUKE ACTIVATED \u00b7 press N to select a target');
  }
  /* Called on death, on spending it, and on match end. Also closes the target
     map if it is open — being killed while aiming must take the map away as
     well as the nuke, or the player sits staring at a crosshair that no longer
     does anything. */
  function nukeLost(reason) {
    if (!nukeArmed) return;
    nukeArmed = false;
    var e = nukeEl(); if (e) e.classList.remove('armed');
    if (Minimap.setNukeAim) Minimap.setNukeAim(false);
    if (Minimap.isFullOpen && Minimap.isFullOpen()) Minimap.toggleFull();
    if (reason === 'died') toast('Nuke lost \u2014 you were killed before launch', true);
  }
  function nukeFired() {
    nukeArmed = false;
    var e = nukeEl(); if (e) e.classList.remove('armed');
    if (Minimap.setNukeAim) Minimap.setNukeAim(false);
  }
  function nukeArmedNow() { return nukeArmed; }

  /* ===== v10.15 - N CALLS THE STRIKE. IT DOES NOT OPEN A MENU. =====

     This used to open the full map in a targeting mode and wait for a click.
     Rahul: "there is no option to select the area" — and he was right, because
     the only route into that mode was a map overlay nobody opens mid-fight, so
     pressing N looked like it did nothing at all.

     One press, one strike. The server decides where it lands (nuke.js
     bestTarget), which is what the player would have tried to do with the map
     anyway, done without leaving the fight. */
  function nukeToggleAim() {
    if (!nukeArmed) return false;
    nukeArmed = false;                       // spend it here so N cannot double-fire
    var e = nukeEl(); if (e) e.classList.remove('armed');
    Net.nukeStrike(0, 0);                    // coordinates ignored; the server aims
    toast('STRIKE CALLED');
    return true;
  }

  function nukeIncoming(d) {
    var mine = d && d.by === Net.myId();
    toast(mine ? 'NUKE INBOUND \u00b7 your strike is landing'
               : 'NUKE INBOUND \u00b7 ' + ((d && d.byName) || 'Enemy') + ' \u2014 get clear', !mine);
  }

  function setVisorHud(on) {
    var e = document.getElementById('visor-pip');
    if (e) e.classList.toggle('on', !!on);
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
        /* Whichever difficulty select is VISIBLE owns the setting. Reading the
           hidden one would have the Overrun slider silently override a backfill
           choice the host just made. */
        botSkill: (els['backfill-row'] && els['backfill-row'].style.display !== 'none' && els['lobby-bfskill'])
          ? els['lobby-bfskill'].value
          : (els['lobby-skill'] ? els['lobby-skill'].value : 'regular'),
        backfill: els['lobby-backfill'] ? els['lobby-backfill'].value === '1' : true,
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
    if (els['lobby-bfskill']) els['lobby-bfskill'].addEventListener('change', pushSettings);
    if (els['lobby-backfill']) els['lobby-backfill'].addEventListener('change', pushSettings);
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
    /* v9.4 DRONE WARNING. Deliberately loud and deliberately temporary: it
       fires from the server while a drone is still crossing toward you, and it
       is the entire reason a lethal auto-targeting weapon is allowed to exist.
       Distance is shown because "40 m out" and "overhead" are different
       decisions — the first means run, the second means shoot up or die. */
    droneWarn: function (dist) {
      var el = document.getElementById('drone-warn');
      if (!el) {
        el = document.createElement('div');
        el.id = 'drone-warn';
        el.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);' +
          'font:700 20px Rajdhani,sans-serif;letter-spacing:2px;color:#ff3428;' +
          'text-shadow:0 0 12px rgba(255,52,40,.8),0 2px 4px #000;pointer-events:none;' +
          'z-index:60;display:none';
        document.body.appendChild(el);
      }
      el.textContent = dist > 0 ? ('\u25B2 DRONE INBOUND \u00b7 ' + dist + 'm') : '\u25B2 DRONE OVERHEAD';
      el.style.display = 'block';
      el.style.opacity = dist > 0 ? '0.9' : '1';
      clearTimeout(el._t);
      /* Cleared on a timer rather than by a "drone gone" event: the drone may
         be shot down by a third party, may retarget, or may kill you — and in
         all three cases nothing would arrive to switch this off. */
      el._t = setTimeout(function () { el.style.display = 'none'; }, 900);
    },
    droneHealth: function () { /* reserved: per-drone health bar */ },
    /* v9.11: who the eliminated player is watching. A caption rather than a
       panel — the point of spectating is the match, not the UI around it. */
    setSpectateName: function (name) {
      var el = document.getElementById('spectate-name');
      if (!el) {
        el = document.createElement('div');
        el.id = 'spectate-name';
        el.style.cssText = 'position:fixed;left:50%;bottom:11%;transform:translateX(-50%);' +
          'font:600 15px Rajdhani,sans-serif;letter-spacing:1.5px;color:#f0e2c4;' +
          'text-shadow:0 2px 6px #000;pointer-events:none;z-index:55;opacity:.9';
        document.body.appendChild(el);
      }
      el.textContent = 'SPECTATING  ' + name + '   \u2039 \u203a to change';
      el.style.display = 'block';
    },
    /* v9.11: the ping wheel. A list rather than a radial dial — a radial menu
       needs the mouse, and the mouse is aiming. Six numbered choices read
       faster than six sectors you have to sweep to. */
    setPingWheel: function (on) {
      var el = document.getElementById('ping-wheel');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ping-wheel';
        el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
          'padding:14px 18px;border:1px solid rgba(240,162,50,.5);border-radius:6px;' +
          'background:rgba(10,14,20,.86);font:600 14px Rajdhani,sans-serif;' +
          'letter-spacing:1.2px;color:#f0e2c4;pointer-events:none;z-index:70;line-height:1.9';
        el.innerHTML = '<b style="color:#f0a232">PING</b><br>' +
          '1 &nbsp;Enemy spotted<br>2 &nbsp;Here<br>3 &nbsp;On my way<br>' +
          '4 &nbsp;Need ammo<br>5 &nbsp;Careful<br>6 &nbsp;Loot<br>' +
          '<span style="opacity:.6">release for ENEMY</span>';
        document.body.appendChild(el);
      }
      el.style.display = on ? 'block' : 'none';
    },
    clearSpectateName: function () {
      var el = document.getElementById('spectate-name');
      if (el) el.style.display = 'none';
    },
    toast: toast,
    nukeReady: nukeReady, nukeLost: nukeLost, nukeFired: nukeFired,
    nukeIncoming: nukeIncoming, nukeToggleAim: nukeToggleAim,
    nukeArmedNow: nukeArmedNow, setVisorHud: setVisorHud,
    getSensitivity: function () { return sensitivity; },
    el: function (id) { return els[id]; }
  };
})();
