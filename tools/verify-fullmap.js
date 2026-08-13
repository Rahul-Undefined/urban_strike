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
ok(/var showContacts = !\(modeCfg && modeCfg\.teams\)/.test(src),
  'contacts are gated on the mode having no sides');
ok(/if \(showContacts\) Net\.eachRemote/.test(src),
  'the remote-player draw loop is behind that gate');

/* The gate must sit on the FULL map only. If it ever ends up wrapping the dial
   as well, players lose the radar they have always had and the change reads as
   a bug rather than a rule. */
const fullStart = src.indexOf('function drawFull');
const updStart = src.indexOf('function update');
ok(fullStart > -1, 'drawFull exists');
ok(src.indexOf('showContacts') > fullStart,
  'the gate lives inside drawFull, not in the minimap dial');
if (updStart > -1 && updStart < fullStart) {
  ok(src.slice(updStart, fullStart).indexOf('showContacts') === -1,
    'the minimap dial is untouched by the rule');
}
ok(/g\.rotate\(PlayerCtl\.yaw\)/.test(src),
  'the own-position arrow is still drawn — a map you cannot locate yourself on is not a map');
const arrowIdx = src.indexOf('g.rotate(PlayerCtl.yaw)');
const gateIdx = src.indexOf('if (showContacts) Net.eachRemote');
ok(arrowIdx > gateIdx,
  'the own-position arrow sits outside the contact gate, so it draws in every mode');

console.log('\n--- which modes show contacts ---');
/* Assert the OUTCOME per mode rather than re-implementing the condition, so a
   new mode is classified by this gate the moment it is registered. */
const shows = m => !(CFG.MODES[m] && CFG.MODES[m].teams);
const expectShown = ['ffa', 'ls', 'bots'];
const expectHidden = ['t2', 't3', 't4', 't5', 't6', 't8', 't10',
  'sq2', 'sq4', 'lsq2', 'lsq4', 'co1', 'co2', 'co3', 'co4', 'co6', 'co10'];

expectShown.forEach(m => ok(CFG.MODES[m] && shows(m),
  m + ': no sides, so the full map still shows contacts'));
expectHidden.forEach(m => ok(CFG.MODES[m] && !shows(m),
  m + ': team-shaped, so the full map shows no contacts'));

/* Nothing may fall through the classification. */
Object.keys(CFG.MODES).forEach(m => {
  ok(expectShown.indexOf(m) >= 0 || expectHidden.indexOf(m) >= 0,
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
ok(!shows('lsq2') && !shows('lsq4'),
  'Last Stand Squads LOSES its anti-camping map — deliberate, see the note in this file');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
