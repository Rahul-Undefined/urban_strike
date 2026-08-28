/* ============================================================================
   VERIFY-AUDIO (v13.0, brief item 6)

   Headless node has no AudioContext, so this gate cannot LISTEN — what it can
   do is hold the source to the contract that made the feature safe to ship:

   1. THE CEILING. Music exists to sit under gunfire. MUSIC_VOL and CUE_VOL
      are read out of the source as numbers and must both be <= 0.12; weapon
      transients run 0.3+. A future "just make the music a bit louder" edit
      fails here, on purpose, and has to argue with this comment.
   2. GESTURE-GATING. Browsers refuse audio before input. music() must park
      its request when the context does not exist yet, and resume() must
      release it — otherwise the welcome cue is a silent no-op on every
      first load, the exact platform trap the design dodged.
   3. LIFECYCLE. The score follows the game: armed at init (menu), switched
      to the game bed in BOTH buildWorld attempts (the retry path builds the
      same world and deserves the same score), back to the menu bed on
      backToLobby. The cue plays once per page load.
   4. HYGIENE. Beds own timers; a stopped bed must clear them, or every
      match adds a heartbeat that never dies.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

const audio = fs.readFileSync(path.join(__dirname, '../public/src/audio/audio.js'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, '../public/src/core/game.js'), 'utf8');

console.log('--- the ceiling: score under gunfire, by construction ---');
{
  const mv = audio.match(/MUSIC_VOL = (0\.\d+)/);
  const cv = audio.match(/CUE_VOL = (0\.\d+)/);
  ok(!!mv && parseFloat(mv[1]) <= 0.12,
    'MUSIC_VOL is a named constant at or under 0.12 [' + (mv ? mv[1] : 'MISSING') + ']');
  ok(!!cv && parseFloat(cv[1]) <= 0.12,
    'CUE_VOL is a named constant at or under 0.12 [' + (cv ? cv[1] : 'MISSING') + ']');
  ok(/never above 0\.12/.test(audio),
    'the ceiling is documented AT the constants, so raising one means arguing with the reason');
}

console.log('--- gesture-gating: the platform trap is handled ---');
{
  ok(/if \(!ctx\) \{ pendingMusic = state; return; \}/.test(audio),
    'music() before the first input PARKS the request instead of throwing or vanishing');
  ok(/if \(ctx && pendingMusic\)/.test(audio) && /resume\(\)/.test(audio),
    'resume() releases the parked request on the first gesture');
}

console.log('--- lifecycle: the score follows the game ---');
{
  ok(/AudioSys\.music\('menu'\)/.test(game) && /arm the welcome cue/i.test(game),
    'the welcome cue is ARMED at init and fires on first input');
  const gameCalls = (game.match(/AudioSys\.music\('game'\)/g) || []).length;
  ok(gameCalls === 2,
    'BOTH buildWorld attempts start the game bed — the retry path is not a silent path [' + gameCalls + ']');
  ok(/onBackToLobby\(\) \{\n    AudioSys\.music\('menu'\)/.test(game),
    'backToLobby returns the score to the menu bed');
  ok(/menuCuePlayed = true/.test(audio) && /once per page load|once per load/i.test(audio + game),
    'the cue is once per page load — returning to the lobby does not re-blast it');
}

console.log('--- hygiene: state machine and cleanup ---');
{
  ok(/if \(state === musicState\) return;/.test(audio),
    'music() is idempotent — re-entering a state does not stack a second bed');
  ok(/musicTimers\.forEach\(function \(t\) \{ clearInterval\(t\); \}\)/.test(audio),
    'stopping a bed clears its timers — no orphan heartbeat after the match');
  ok(/linearRampToValueAtTime\(0, ctx\.currentTime \+ 0\.8\)/.test(audio),
    'beds FADE out (0.8 s) rather than cutting — a hard cut reads as a bug');
  ok(/musicG\.connect\(master\)/.test(audio),
    'the score routes through the master gain, so the volume setting governs it too');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
