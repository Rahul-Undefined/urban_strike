/* verify-undeclared — catches identifiers used but never declared.

   WHY THIS EXISTS. `ui.js` shipped this line inside updateScoreboard:

       CFG.activeTeams(d.settings.mode).forEach(...)

   `d` is the LOBBY PAYLOAD. updateScoreboard's parameters are
   (roster, myId, code, ping). The line was copied from the lobby renderer in
   v8.37 when the scoreboard learned to group by side, and it referenced a
   variable that does not exist in that function.

   It survived through v9.3 and past every gate in this project, because:
     - `node --check` proves a file PARSES; an undeclared read is legal syntax.
     - verify-client loads the bundle, and module-level code never touches it.
     - verify-scope looks for identifiers LEAKING BETWEEN IIFEs, the opposite
       problem.
     - test.js is server-side and never renders a scoreboard.
   It only fired when a human pressed TAB in a team mode, and then it threw
   "d is not defined" on every press.

   HOW IT WORKS. Comments and string literals are stripped, then each function
   body is checked: if it USES a bare identifier from the watch list and does
   not declare it as a var/let/const, a parameter, or a catch binding, and no
   ENCLOSING function declares it either, it is reported.

   The watch list is short, single-letter names on purpose. Those are the ones
   that get copied between callbacks — nobody accidentally references a stray
   `playerRoster`. A general undeclared-variable checker is a linter, and this
   project has no network access to install one; this covers the specific
   failure that actually happened, cheaply.

   Run: node tools/verify-undeclared.js */

const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS  ' + m)) : (fail++, console.log('  FAIL  ' + m)); };

/* Strip comments and strings so prose and message text cannot look like code.
   Without this, every sentence containing " d " in a comment is a false hit —
   and this file has a lot of comments. */
function strip(src) {
  let out = '', i = 0, mode = 0, q = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (mode === 0) {
      if (c === '/' && n === '*') { mode = 1; i += 2; continue; }
      if (c === '/' && n === '/') { mode = 2; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = 3; q = c; out += ' '; i++; continue; }
      /* REGEX LITERALS. Without this the flags on /[<>&"']/g survive stripping
         and read as a bare `g`, which is how this gate's first run reported a
         false positive in rooms.js. A '/' starts a literal only where a VALUE
         is expected — after an operator, an opening bracket, or a comma — which
         is what the lookback below tests. */
      if (c === '/' && /[(,=:[!&|?{;+\-*%<>~^]\s*$/.test(out.replace(/\s+$/, m => m))) {
        mode = 4; out += ' '; i++; continue;
      }
      out += c; i++; continue;
    }
    if (mode === 1) { if (c === '*' && n === '/') { mode = 0; i += 2; } else { out += (c === '\n' ? '\n' : ' '); i++; } continue; }
    if (mode === 2) { if (c === '\n') { mode = 0; out += '\n'; i++; } else { out += ' '; i++; } continue; }
    if (mode === 3) { if (c === '\\') { out += '  '; i += 2; continue; } if (c === q) mode = 0; out += (c === '\n' ? '\n' : ' '); i++; continue; }
    if (mode === 4) {                                   // inside a regex literal
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '/') { mode = 5; out += ' '; i++; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (mode === 5) {                                   // its flags
      if (/[a-z]/.test(c)) { out += ' '; i++; continue; }
      mode = 0; continue;
    }
  }
  return out;
}

const WATCH = ['d', 'e', 'p', 'r', 's', 't', 'a', 'b', 'g', 'm', 'n', 'w', 'q'];

function scan(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const S = strip(raw).split('\n'), R = raw.split('\n');
  const found = [];
  // every function header, with the line index of its body start
  const heads = [];
  S.forEach((l, i) => { if (/function\s*\w*\s*\(/.test(l)) heads.push(i); });
  heads.forEach(st => {
    let depth = 0, started = false, end = S.length - 1;
    for (let i = st; i < S.length; i++) {
      for (const ch of S[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
      if (started && depth <= 0) { end = i; break; }
    }
    const body = S.slice(st, end + 1);
    WATCH.forEach(T => {
      /* Not followed by ':' — that excludes object-literal keys ({ g: 'mine' })
         and labels, both of which look exactly like a variable read otherwise.
         Not preceded by '.' — that excludes property access (it.g).
         Not preceded by '/' either: the stripper handles comments and strings
         but not REGEX LITERALS, so the trailing flags in /[<>&"']/g read as a
         bare `g`. The cost is that `a/d` written without spaces is invisible to
         this gate; every division in this codebase is spaced, and a regex flag
         never is. */
      const use = new RegExp('(^|[^\\w$./])' + T + '(?![\\w$])(?!\\s*:)');
      const dec = new RegExp(
        '(var|let|const)\\s+(\\w+\\s*(=[^,;]*)?,\\s*)*' + T + '\\b' +
        '|function\\s*\\w*\\s*\\([^)]*\\b' + T + '\\b' +
        '|\\(\\s*' + T + '\\s*[,)]|,\\s*' + T + '\\s*[,)]' +
        '|catch\\s*\\(\\s*' + T + '\\s*\\)' +
        /* arrow parameters, with and without parentheses — `p => ...` and
           `(a, b) => ...` are the dominant style in server/lib and were the
           whole of this gate's first-run false positives. */
        '|\\b' + T + '\\s*=>' +
        '|\\(\\s*' + T + '\\s*\\)\\s*=>' +
        '|for\\s*\\(\\s*(var|let|const)?\\s*' + T + '\\b' +
        '|\\{[^}]*\\b' + T + '\\b[^}]*\\}\\s*=');
      if (!body.some(l => use.test(l))) return;
      if (body.some(l => dec.test(l))) return;
      /* Not declared HERE — but a closure may legitimately capture it from an
         enclosing function. Walk outward: any earlier line whose function body
         still encloses this one and which declares the name makes it valid. */
      const enclosing = heads.filter(h => h < st).some(h => {
        let d2 = 0, s2 = false, e2 = S.length - 1;
        for (let i = h; i < S.length; i++) {
          for (const ch of S[i]) { if (ch === '{') { d2++; s2 = true; } else if (ch === '}') d2--; }
          if (s2 && d2 <= 0) { e2 = i; break; }
        }
        return e2 >= end && S.slice(h, st).some(l => dec.test(l));
      });
      // module-level declaration is also fine
      const moduleLevel = S.slice(0, st).some(l => /^\s*(var|let|const)\s/.test(l) && dec.test(l));
      if (!enclosing && !moduleLevel) {
        found.push({ line: st + 1, name: T, text: R[st].trim().slice(0, 80) });
      }
    });
  });
  return found;
}

const files = [];
(function walk(p) {
  for (const f of fs.readdirSync(p)) {
    const fp = path.join(p, f);
    if (fs.statSync(fp).isDirectory()) walk(fp);
    else if (f.endsWith('.js')) files.push(fp);
  }
})(path.join(ROOT, 'public/src'));
['server.js'].forEach(f => files.push(path.join(ROOT, f)));
fs.readdirSync(path.join(ROOT, 'server/lib')).forEach(f => {
  if (f.endsWith('.js')) files.push(path.join(ROOT, 'server/lib', f));
});

console.log('--- undeclared single-letter identifiers ---');
let total = 0;
files.forEach(f => {
  const hits = scan(f);
  total += hits.length;
  const rel = path.relative(ROOT, f);
  hits.forEach(h => console.log('        ' + rel + ':' + h.line + '  "' + h.name + '"  ' + h.text));
  ok(hits.length === 0, rel + ' has no undeclared watch identifiers' +
    (hits.length ? ' [' + hits.length + ']' : ''));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed  (' + files.length + ' files scanned)');
process.exit(fail ? 1 : 0);
