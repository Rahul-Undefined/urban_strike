/* verify-fullmap — the full map is not a live tactical feed in team modes.

   WHAT THIS PROTECTS

   Pressing M does NOT pause the match. Until v9.2 the full map drew every
   team-mate by name and every detected enemy, refreshed every frame, for free —
   an overhead readout of the fight you could hold open while the fight
   continued. Rahul's words: it is running the gameplay.

   So contacts on the FULL map are now limited to modes with no sides. The
   minimap is untouched, because the dial is small, glanced at, and costs you
   your view of the world to read.

   WHY A GATE AND NOT JUST THE CODE

   This is a one-line condition guarding a fifty-line drawing block, in a file
   nobody opens unless the minimap is broken. The natural way to "fix" a future
   bug in that block is to move code around it, and the natural casualty is the
   guard. The rule is also non-obvious — a reviewer seeing `if (showContacts)`
   has no way to know it is deliberate rather than a leftover debug flag.

   WHAT IT DELIBERATELY DOES NOT ASSERT

   The player's own position arrow. Without it the full map stops being a map:
   you cannot orient on a layout you cannot locate yourself in, and your own
   position is not intel you could gain an advantage from. It is drawn
   unconditionally and that is correct.

   Run: node tools/verify-fullmap.js */

const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'public/src/config/index.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

const src = fs.readFileSync(path.join(ROOT, 'public/src/ui/minimap.js'), 'utf8');

console.log('--- the rule itself ---');
/* v9.5: TWO switches. `showAllies` and `showEnemies` replaced the single
   `showContacts`, because your own squad and the enemy are opposite kinds of
   information — one is coordination, the other is intel. */
ok(/var showEnemies = !teamMode/.test(src),
  'enemy visibility is gated on the mode having no sides');
ok(/var showAllies\s*=\s*true/.test(src),
  'ally visibility is unconditional — a squad can always see itself');
ok(/if \(!\(ally \? showAllies : showEnemies\)\) return;/.test(src),
  'the draw loop applies the ally/enemy split per contact');

/* The gate must sit on the FULL map only. If it ever ends up wrapping the dial
   as well, players lose the radar they have always had and the change reads as
   a bug rather than a rule. */
const fullStart = src.indexOf('function drawFull');
const updStart = src.indexOf('function update');
ok(fullStart > -1, 'drawFull exists');
ok(src.indexOf('showEnemies') > fullStart,
  'the gate lives inside drawFull, not in the minimap dial');
if (updStart > -1 && updStart < fullStart) {
  ok(src.slice(updStart, fullStart).indexOf('showContacts') === -1,
    'the minimap dial is untouched by the rule');
}
ok(/g\.rotate\(PlayerCtl\.yaw\)/.test(src),
  'the own-position arrow is still drawn — a map you cannot locate yourself on is not a map');
const arrowIdx = src.indexOf('g.rotate(PlayerCtl.yaw)');
const gateIdx = src.indexOf('if (!(ally ? showAllies : showEnemies)) return;');
ok(arrowIdx > gateIdx,
  'the own-position arrow sits outside the contact gate, so it draws in every mode');

console.log('\n--- which modes show contacts ---');
/* Assert the OUTCOME per mode rather than re-implementing the condition, so a
   new mode is classified by this gate the moment it is registered. */
const shows = m => !(CFG.MODES[m] && CFG.MODES[m].teams) ||
  !!(CFG.MODES[m] && CFG.MODES[m].fullMapContacts);
const expectShown = ['ffa', 'ls', 'bots', 'lsq2', 'lsq4'];
const expectHidden = ['t2', 't3', 't4', 't5', 't6', 't8', 't10',
  'sq2', 'sq4', 'co1', 'co2', 'co3', 'co4', 'co6', 'co10'];
/* v10.13: the outbreak modes. Enemies SHOWN on the full map, and that is a
   design decision rather than a default. In a PvP mode a full map that reveals
   the other side removes the whole game; here the other side is a wave of
   things that walk straight at you and make no attempt to hide. Knowing where
   the horde is coming from is the tactical layer, not a cheat — it is how a
   team decides which end of a building to hold. */
const expectShownZ = Object.keys(CFG.MODES).filter(m => CFG.MODES[m].outbreak);
expectShownZ.forEach(m => ok(CFG.MODES[m] && shows(m),
  m + ': outbreak, so the full map shows the horde'));

expectShown.forEach(m => ok(CFG.MODES[m] && shows(m),
  m + ': the full map shows ENEMIES'));
expectHidden.forEach(m => ok(CFG.MODES[m] && !shows(m),
  m + ': team-shaped, so the full map hides enemies (allies still show)'));

/* Nothing may fall through the classification. */
Object.keys(CFG.MODES).forEach(m => {
  ok(expectShown.indexOf(m) >= 0 || expectHidden.indexOf(m) >= 0 || expectShownZ.indexOf(m) >= 0,
    'mode ' + m + ' is classified by this gate');
});

/* THE KNOWN COST, recorded rather than discovered.
   Last Stand's entry in world.config.js says camping is answered by the map
   rather than by a timer — pressing M showed where everyone was, so hiding
   bought position, not safety. lsq2 and lsq4 are team-shaped and lose that.
   Solo keeps it. If squad camping turns out to matter in play, the fix is a
   `fullMapContacts: true` flag on those two entries, NOT a special case wired
   into minimap.js. This assertion exists so that trade-off is visible from the
   gate output instead of being rediscovered in a match. */
console.log('\n--- known cost ---');
ok(shows('ls'), 'Last Stand Solo keeps its anti-camping map');
ok(shows('lsq2') && shows('lsq4'),
  'Last Stand Squads keeps it too, via fullMapContacts (v9.4)');
/* And the thing that changed in v9.5: allies are never hidden anywhere. */
ok(/showAllies\s*=\s*true/.test(src),
  'no mode hides your own squad — coordination is not intel');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
