// Teach before you test: every graded exercise may only need commands, flags, revision syntax and
// concepts that a `learn` card has already introduced, earlier in the same lesson or in an earlier
// lesson in course order (placement skips whole units, so earlier units count as known).
// Run: node tests/teach-order.test.mjs   (also picked up by `node --test tests/`)
//
// What counts as TAUGHT (learn cards only; `explain` text does not count, it is feedback):
//   - every `git ...` command in the card's title and body <code> spans, and in demo.run
//   - a body <code> span holding only flags (`<code>--all</code>`) teaches those flags for every
//     git subcommand the same card mentions
//   - revision syntax (`~`, `^`, `^2`, `^{tree}`, `@{n}`, `stash@{n}`, `..`, `...`, `rev:path`) and
//     special refs (`ORIG_HEAD`, `refs/bisect/bad`) in any body <code> span or demo command
//   - shell bits the course leans on: `echo ... >` / `>>` commands, and `&&` / `>>` code spans
//   - explicit tags: `teaches: ['concept id' | 'git cmd --flag', ...]`
// What an exercise NEEDS (graded exercises):
//   - type: `solution`; build: `answers[0]` (plus `&&` when it is a tile: tiles cannot be split
//     over two lines, typed answers can); fill: before + the right option + after; graph:
//     `command`; choice: the right option; match: both sides of every pair; order: every step;
//     any type: the prompt's <code> spans and a choice's `$ git` code lines. Strings without a
//     git command still contribute their revision syntax (`<code>main~1</code>`, `HEAD@{1}`).
//   - explicit tags: `needs: [...]`, for ideas a parser cannot see (merge direction, output text,
//     bare flags in a match like `--delete`)
// Items are `git <sub>`, `git <sub> <flag>` (flags are per subcommand: `branch -d` is not
// `merge -d`), `git config <key>`, `git stash pop` style sub-subcommands, `rev <syntax>`,
// `ref <name>` and `shell <op>`. Tags that start with `git ` are parsed like commands; anything
// else is a concept id that must match a `teaches` tag exactly (same spelling).
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../js/content/index.js';
import { UNITS as BASH_UNITS } from '../js/content/bash/index.js';
import { SCRIPT_FIXTURES } from './fixtures/script-exercises.mjs';
import { Shell } from '../js/shell.js';

// Items any exercise may use without a learn card. Keep this short and say why.
const ALLOW = new Set([
]);

const SUBSUB = {
  stash: ['push', 'pop', 'apply', 'list', 'show', 'drop', 'branch', 'clear', 'save'],
  remote: ['add', 'remove', 'rm', 'rename', 'get-url', 'set-url', 'show', 'prune'],
  bisect: ['start', 'good', 'bad', 'run', 'reset', 'skip', 'log'],
};
const REV_PATH_SUBS = new Set(['show', 'rev-parse', 'cat-file', 'ls-tree', 'diff']);
// Real git subcommands. Anything else after "git " is prose ("git wants you to pick...").
const SUBCOMMANDS = new Set(('add bisect blame branch cat-file checkout cherry-pick clean clone commit config diff fetch ' +
  'hash-object init log ls-tree merge mv pull push rebase reflog remote reset restore rev-parse revert rm show show-ref ' +
  'stash status switch symbolic-ref tag').split(' '));

const decode = (s) => String(s).replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const codeSpans = (html) => [...String(html || '').matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => decode(m[1]));
const tokens = (s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).filter((t) => !/^["']/.test(t));

// Revision syntax used in one token.
export function revItems(tok) {
  const out = [];
  if (/^https?:|^git@/.test(tok)) return out;
  if (/@\{/.test(tok)) out.push(/^stash@/.test(tok) ? 'rev stash@{n}' : 'rev @{n}');
  if (/\^\{/.test(tok)) out.push('rev ^{}');
  if (/\^[2-9]/.test(tok)) out.push('rev ^2');
  if (/\^(?![{2-9])/.test(tok)) out.push('rev ^');
  if (/\w~/.test(tok)) out.push('rev ~');
  if (/\w\.\.\.\w/.test(tok)) out.push('rev ...');
  else if (/\w\.\.(\w|$)|^\.\.\w/.test(tok)) out.push('rev ..');
  // special refs a learner has to have met: ORIG_HEAD, FETCH_HEAD, refs/bisect/bad
  const special = /\b(ORIG_HEAD|FETCH_HEAD)\b|^(refs\/bisect\/\w+)/.exec(tok);
  if (special) out.push(`ref ${special[1] || special[2]}`);
  return out;
}

// Items in one shell line that may hold a git command (`git` anywhere in it).
function lineItems(line, out) {
  const at = line.search(/(^|[\s`(])git\s/);
  if (at < 0) {
    const toks = tokens(line);
    for (const t of toks) for (const r of revItems(t)) out.add(r);
    // shell redirection, used to write .gitignore and append lines: `echo "x" > f`, `>> f`
    if (toks[0] === 'echo' && toks.includes('>>')) out.add('shell >>');
    else if (toks[0] === 'echo' && toks.includes('>')) out.add('shell >');
    return;
  }
  // `git merge spring (CONFLICT)`: a trailing aside in brackets is prose, not arguments
  const cmd = line.slice(at).replace(/^[\s`(]/, '').replace(/\s\(.*$/, '');
  const toks = tokens(cmd.split('#')[0]);
  let i = 1;
  while (i < toks.length && /^-/.test(toks[i])) i++; // global options
  const sub = toks[i];
  if (!sub || !SUBCOMMANDS.has(sub)) return;
  out.add(`git ${sub}`);
  let base = `git ${sub}`;
  const rest = toks.slice(i + 1);
  if (sub === 'config' && rest[0] && !/^-/.test(rest[0])) out.add(`git config ${rest[0]}`);
  if (SUBSUB[sub] && SUBSUB[sub].includes(rest[0])) { base = `git ${sub} ${rest[0]}`; out.add(base); rest.shift(); }
  for (const t of rest) {
    if (/^-/.test(t)) for (const f of flagItems(sub, t)) out.add(`${base} ${f}`);
    else {
      for (const r of revItems(t)) out.add(r);
      if (REV_PATH_SUBS.has(sub) && /^[\w./~^@{}<>-]+:[\w./<>-]+$/.test(t)) out.add('rev :path');
    }
  }
}
function flagItems(sub, t) {
  if (t === '-' || t === '--') return [t];
  if (t.startsWith('--')) return [t.split('=')[0]];
  if (/^-\d+$/.test(t)) return ['-<n>'];
  if (/^-[SG]./.test(t)) return [t.slice(0, 2)];
  const letters = t.slice(1);
  if (/^[a-zA-Z]+$/.test(letters) && letters.length > 1) {
    if (new Set(letters).size === 1) return [t]; // -vv is its own thing
    return [...letters].map((c) => '-' + c);
  }
  return [t.split('=')[0]];
}
export function commandItems(text) {
  const out = new Set();
  // one command per piece: lines, `&&`/`;`/`|` chains, and prose joins like "git add x, then git commit"
  for (const line of decode(text).split(/\n|&&|;|\|\|?|,?\s+then\s+/)) lineItems(line.trim(), out);
  return out;
}
const tagItems = (tags) => {
  const out = new Set();
  for (const t of tags || []) {
    if (/^git\s/.test(t)) for (const x of commandItems(t)) out.add(x);
    else out.add(t);
  }
  return out;
};

export function taughtBy(ex) {
  const out = new Set();
  const subs = new Set();
  const add = (set) => { for (const x of set) { out.add(x); const m = /^git (\S+)/.exec(x); if (m) subs.add(m[1]); } };
  add(commandItems(ex.title || ''));
  const spans = codeSpans(ex.body);
  for (const s of spans) if (!/^\s*-/.test(s)) add(commandItems(s));
  for (const s of spans) if (/^\s*(>>?|&&)\s*$/.test(s)) out.add(`shell ${s.trim()}`);
  for (const c of ex.demo?.run || []) add(commandItems(c));
  for (const s of spans) {
    if (!/^\s*-/.test(s)) continue;
    for (const t of tokens(s)) if (/^-/.test(t)) for (const sub of subs) for (const f of flagItems(sub, t)) out.add(`git ${sub} ${f}`);
  }
  add(tagItems(ex.teaches));
  return out;
}

export function neededBy(ex) {
  const out = new Set();
  const addText = (s) => { for (const x of commandItems(s)) out.add(x); };
  const gitish = (s) => /(^|[\s`(])git\s/.test(decode(s));
  // a git command, or else just the revision syntax in it (`main~1`, `HEAD@{1}`, `ORIG_HEAD`)
  const addAny = (s) => {
    if (gitish(s)) addText(s);
    else for (const t of tokens(decode(s).replace(/<[^>]+>/g, ' '))) for (const r of revItems(t)) out.add(r);
  };
  for (const s of codeSpans(ex.prompt)) addAny(s);
  switch (ex.type) {
    case 'type': addText(ex.solution); break;
    case 'build': {
      addText(ex.answers[0].join(' '));
      if (ex.answers[0].includes('&&')) out.add('shell &&'); // typed answers can use two lines; tiles cannot
      break;
    }
    case 'fill': addText(ex.before + ex.options[ex.answer] + ex.after); break;
    case 'graph': addText(ex.command); break;
    case 'choice': {
      addAny(ex.options[ex.answer]);
      for (const l of String(ex.code || '').split('\n')) if (/^\$?\s*git\s/.test(l)) addText(l.replace(/^\$\s*/, ''));
      break;
    }
    case 'match': for (const p of ex.pairs) for (const s of p) addAny(s); break;
    case 'order': for (const s of ex.steps) addAny(s); break;
  }
  for (const x of tagItems(ex.needs)) out.add(x);
  return out;
}

export function audit(units = UNITS) {
  const taught = new Map(); // item -> lesson id that first taught it
  const firstTaught = new Map();
  // first pass: where (if anywhere) each item is taught, for the hint in the report
  for (const u of units) for (const l of u.lessons) for (const ex of l.exercises) if (ex.type === 'learn') for (const x of taughtBy(ex)) if (!firstTaught.has(x)) firstTaught.set(x, l.id);
  const problems = [];
  for (const u of units) for (const l of u.lessons) for (const ex of l.exercises) {
    if (ex.type === 'learn') { for (const x of taughtBy(ex)) if (!taught.has(x)) taught.set(x, l.id); continue; }
    for (const x of neededBy(ex)) {
      if (taught.has(x) || ALLOW.has(x)) continue;
      problems.push({ lesson: l.id, id: ex.id, item: x, later: firstTaught.get(x) || null });
    }
  }
  return problems;
}

test('every exercise only needs what a learn card taught earlier', () => {
  const problems = audit();
  const lines = problems.map((p) => `  ${p.lesson.padEnd(13)} ${p.id.padEnd(26)} needs ${JSON.stringify(p.item)}${p.later ? `  (first taught in ${p.later})` : '  (never taught)'}`);
  assert.equal(problems.length, 0, `${problems.length} exercise item(s) are tested before they are taught:\n${lines.join('\n')}`);
});

test('teaches tags sit on learn cards, needs tags on graded exercises', () => {
  const bad = [];
  for (const u of UNITS) for (const l of u.lessons) for (const ex of l.exercises) {
    if (ex.teaches && ex.type !== 'learn') bad.push(`${ex.id}: teaches on a ${ex.type}`);
    if (ex.needs && ex.type === 'learn') bad.push(`${ex.id}: needs on a learn card`);
    for (const t of [...(ex.teaches || []), ...(ex.needs || [])]) if (typeof t !== 'string' || !t.trim()) bad.push(`${ex.id}: empty tag`);
  }
  assert.deepEqual(bad, []);
});

test('the parser reads commands, flags and revision syntax', () => {
  const s = (t) => [...commandItems(t)].sort();
  assert.deepEqual(s('git commit -am "Fix: a..b ~"'), ['git commit', 'git commit -a', 'git commit -m']);
  assert.deepEqual(s('git log --oneline main..feature'), ['git log', 'git log --oneline', 'rev ..']);
  assert.deepEqual(s('git stash pop stash@{1}'), ['git stash', 'git stash pop', 'rev stash@{n}']);
  assert.deepEqual(s('git reset --hard HEAD@{2}'), ['git reset', 'git reset --hard', 'rev @{n}']);
  assert.deepEqual(s('git show main^2 && git log -3 HEAD~1'), ['git log', 'git log -<n>', 'git show', 'rev ^2', 'rev ~']);
  assert.deepEqual(s('git merge spring (CONFLICT)'), ['git merge']);
  assert.deepEqual(s('git config pull.rebase false'), ['git config', 'git config pull.rebase']);
  assert.deepEqual(s('git branch -vv'), ['git branch', 'git branch -vv']);
  assert.deepEqual(s('git rev-parse HEAD^{tree} HEAD:index.html'), ['git rev-parse', 'rev :path', 'rev ^{}']);
  assert.deepEqual(s('git add login.css, then git commit --amend'), ['git add', 'git commit', 'git commit --amend']);
  assert.deepEqual(s('Both sides moved, and git wants you to pick'), []);
  assert.deepEqual(s('git reset --hard ORIG_HEAD && git tag x refs/bisect/bad'), ['git reset', 'git reset --hard', 'git tag', 'ref ORIG_HEAD', 'ref refs/bisect/bad']);
  assert.deepEqual(s('echo "*.log" >> .gitignore'), ['shell >>']);
});

/* ============================================================== the bash course */
// The same rule for js/content/bash, with a bash parser. Items:
//   `cmd ls`, `ls -a` (flags per command; `-la` splits into -l -a; `-5` is `-<n>`; `tail -n +3` adds `tail +N`),
//   `op |`, `op >`, `op >>`, `op <`, `op <<<`, `op 2>`, `op 2>>`, `op 2>&1`, `op &>`, `op &&`, `op ||`, `op ;`,
//   `glob *`, `glob ?`, `glob []`, `brace {,}`, `brace {..}`, `quote "`, `quote '`, `escape \`,
//   `path /` (absolute), `path ~`, `path ..`, `path .`, `path /dev/null`, `var $` (also inside "…"), `var ${ }`,
//   `var $?`, `assign =` (name=value), `subst $( )` (its inside is read as a command line), `math $(( ))`;
//   find's word options whole (`find -name`), a command run by `xargs` or `-exec` read as a command
//   (`find -exec`, `cmd rm`); a value stuck to a flag ignored (`cut -d:` is `cut -d`);
//   inside quoted programs: grep's pattern (`regex ^ $ . * [] | + ? ()`, the last four with -E or `\|`),
//   sed's script (`sed s///`, `sed s///g`, `sed p`, `sed d`, `sed /re/`), awk's program (`awk $N`, `awk $NF`,
//   `awk $0`, `awk NR`, `awk NF`, `awk END`, `awk BEGIN`, `awk +=`, `awk printf`, `awk condition`, `awk /re/`).
// A string is read as a command line when its first word is a command the engine knows (`ls -a`, `cd ..`); any
// other string (a file name in a prompt, `*.txt`, `~/notes`) still contributes its globs, paths and operators.
// `&&` and `;` are only needed where they can't be split (a build tile, a fill, an outcome command): a typed answer
// can always be two lines. Concept tags (`teaches`/`needs`) work exactly as in the git course. Each unit's challenge
// puzzles count as coming after its lessons (where the path puts them).
// Scripts (the `script` type's `solution`, units 9+): `kw if`, `kw for`, `kw while`, `kw until`, `kw function` (both
// `name() {` and `function name`), `op <<` (a here-doc; its body is data, not commands), the commands inside `$( )`,
// a `#` comment ends the line, and a command after a keyword (`then ls`, `do cp …`) or an assignment
// (`n=$(wc -l < f)`) is a command too. Words after `for x in` are a list, not commands.
const BASH_CMDS = new Set(new Shell().completions().shell);
const OPS = ['2>&1', '<<<', '&>>', '2>>', '&>', '2>', '>>', '<<-', '<<', '&&', '||', '>', '<', '|', ';'];
const REDIRS = new Set(['>', '>>', '<', '<<<', '<<', '<<-', '2>', '2>>', '&>', '&>>', '2>&1']);
// reserved words: the ones that open a construct become items; after any of them a command follows
const KW_ITEM = { if: 'kw if', elif: 'kw if', for: 'kw for', while: 'kw while', until: 'kw until', function: 'kw function' };
const KW_THEN_CMD = new Set(['if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}']);
// the index just after the `)` that closes the `(` at s[k] (quotes inside are skipped)
function closeParen(s, k) {
  let depth = 0, i = k;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === "'" || c === '"') { const j = s.indexOf(c, i + 1); i = j < 0 ? s.length : j + 1; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
    i++;
  }
  return s.length;
}
// a line as words and operators, quotes and $( ) kept inside the words
export function bashTokens(line) {
  const out = [];
  const s = String(line);
  let i = 0, cur = '', inWord = false;
  const push = () => { if (inWord) out.push({ w: cur }); cur = ''; inWord = false; };
  while (i < s.length) {
    const c = s[i];
    if (c === '#' && !inWord) break;   // a comment runs to the end of the line
    if (c === '\\' && i + 1 < s.length) { cur += c + s[i + 1]; inWord = true; i += 2; continue; }
    if (c === '$' && s[i + 1] === '(') { const end = closeParen(s, i + 1); cur += s.slice(i, end); inWord = true; i = end; continue; }
    if (c === "'") { const j = s.indexOf(c, i + 1); const end = j < 0 ? s.length : j + 1; cur += s.slice(i, end); inWord = true; i = end; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j = s[j] === '\\' ? j + 2 : s[j] === '$' && s[j + 1] === '(' ? closeParen(s, j + 1) : j + 1;
      const end = Math.min(j + 1, s.length); cur += s.slice(i, end); inWord = true; i = end; continue;
    }
    if (/\s/.test(c)) { push(); i++; continue; }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (op && !(op.startsWith('2') && inWord)) { push(); out.push({ op }); i += op.length; continue; }
    cur += c; inWord = true; i++;
  }
  push();
  return out;
}
function wordItems(w, out) {
  // $( ) and $(( )) first (not inside single quotes): a command line of its own, or arithmetic
  let flat = '', dq = false;
  for (let i = 0; i < w.length;) {
    const c = w[i];
    if (c === '\\') { flat += w.slice(i, i + 2); i += 2; continue; }
    if (c === "'" && !dq) { const j = w.indexOf("'", i + 1); const end = j < 0 ? w.length : j + 1; flat += w.slice(i, end); i = end; continue; }
    if (c === '"') dq = !dq;
    if (c === '$' && w[i + 1] === '(') {
      const end = closeParen(w, i + 1);
      const inner = w.slice(i + 2, end - 1);
      if (inner.startsWith('(')) out.add('math $(( ))');
      else { out.add('subst $( )'); for (const x of bashItems(inner)) out.add(x); }
      flat += 'S'; i = end; continue;
    }
    flat += c; i++;
  }
  w = flat;
  for (const m of w.matchAll(/`([^`]*)`/g)) for (const x of bashItems(m[1])) out.add(x);   // back-quotes
  // variables, also inside double quotes (never inside single ones)
  const vars = w.replace(/'[^']*'/g, '').replace(/\\./g, '');
  if (/\$[A-Za-z_0-9@#*]|\$\{[\w#%/:-]+\}/.test(vars)) out.add('var $');
  if (/\$\{\w+\}/.test(vars)) out.add('var ${ }');
  if (/\$\?/.test(vars)) out.add('var $?');
  const unq = w.replace(/"[^"]*"|'[^']*'/g, (m) => { out.add(m[0] === '"' ? 'quote "' : "quote '"); return 'Q'; });
  if (/\\ /.test(unq)) out.add('escape \\');
  const bare = unq.replace(/\\./g, 'E').replace(/\$[?#@*$!0-9]/g, 'V');   // $? is not a glob
  if (/\*/.test(bare)) out.add('glob *');
  if (/\?/.test(bare)) out.add('glob ?');
  if (/\[[^\]]+\]/.test(bare)) out.add('glob []');
  if (/\{[^}]*,[^}]*\}/.test(bare)) out.add('brace {,}');
  if (/\{\w+\.\.\w+\}/.test(bare)) out.add('brace {..}');
  if (bare === '/dev/null') out.add('path /dev/null');
  else if (bare.startsWith('/')) out.add('path /');
  if (/^~/.test(bare)) out.add('path ~');
  if (/(^|\/)\.\.(\/|$)/.test(bare)) out.add('path ..');
  if (bare === '.' || bare.startsWith('./')) out.add('path .');
}
function bashFlagItems(cmd, t) {
  if (t === '-' || t === '--') return [`${cmd} ${t}`];
  if (t.startsWith('--')) return [`${cmd} ${t.split('=')[0]}`];
  if (/^-\d+$/.test(t)) return [`${cmd} -<n>`];
  if (cmd === 'find' && /^-[a-z]{2,}$/.test(t)) return [`${cmd} ${t}`];   // find's options are words: -name, -type
  const m = /^-([a-zA-Z]+)\d*$/.exec(t);
  if (m) return [...m[1]].map((c) => `${cmd} -${c}`);
  if (/^-[a-zA-Z]/.test(t)) return [`${cmd} -${t[1]}`];                   // a value stuck to it: -d: -F, -t,
  return [`${cmd} ${t}`];
}
const unquote = (w) => w.replace(/^'([\s\S]*)'$/, '$1').replace(/^"([\s\S]*)"$/, '$1');
// what a grep/sed pattern uses: anchors, any character, repeats, sets, and with -E alternation and groups
function regexItems(p, ere, out) {
  const s = p.replace(/\\\\/g, '');
  if (/^\^/.test(s)) out.add('regex ^');
  if (/[^\\]\$$|^\$$/.test(s)) out.add('regex $');
  if (/(^|[^\\])\./.test(s)) out.add('regex .');
  if (/(^|[^\\])\*/.test(s)) out.add('regex *');
  if (/(^|[^\\])\[/.test(s)) out.add('regex []');
  if (ere ? /(^|[^\\])\|/.test(s) : /\\\|/.test(s)) out.add('regex |');
  if (ere && /(^|[^\\])\+/.test(s)) out.add('regex +');
  if (ere && /(^|[^\\])\?/.test(s)) out.add('regex ?');
  if (ere && /(^|[^\\])\(/.test(s)) out.add('regex ()');
}
// a sed script: `sed s///`, `sed s///g`, `sed p`, `sed d`, `sed /re/` (an address), plus its patterns
function sedItems(script, ere, out) {
  for (const part of script.split(/;|\n/)) {
    const m = /^\s*(\/((?:[^/\\]|\\.)*)\/|\$|\d+)?(,(\/(?:[^/\\]|\\.)*\/|\$|\d+))?\s*!?\s*([a-z=])([\s\S]*)$/.exec(part);
    if (!m) continue;
    if (m[2] !== undefined) { out.add('sed /re/'); regexItems(m[2], ere, out); }
    const [cmd, rest] = [m[5], m[6]];
    if (cmd === 's' && rest) {
      const d = rest[0];
      const bits = rest.slice(1).split(d);
      out.add('sed s///');
      regexItems(bits[0] || '', ere, out);
      if (/g/.test(bits[2] || '')) out.add('sed s///g');
    } else if (cmd === 'p' || cmd === 'd') out.add(`sed ${cmd}`);
  }
}
// an awk program: fields, NR/NF, a condition, END/BEGIN, sums
function awkItems(prog, out) {
  if (/\$NF\b/.test(prog)) out.add('awk $NF');
  if (/\$[1-9]/.test(prog)) out.add('awk $N');
  if (/\$0\b/.test(prog)) out.add('awk $0');
  if (/\bNR\b/.test(prog)) out.add('awk NR');
  if (/(^|[^$])\bNF\b/.test(prog)) out.add('awk NF');
  if (/\bEND\b/.test(prog)) out.add('awk END');
  if (/\bBEGIN\b/.test(prog)) out.add('awk BEGIN');
  if (/\+=/.test(prog)) out.add('awk +=');
  if (/\bprintf\b/.test(prog)) out.add('awk printf');
  const head = prog.trim().split('{')[0].trim();
  if (head && !/^(BEGIN|END)$/.test(head)) out.add(/^\/.*\/$/.test(head) ? 'awk /re/' : 'awk condition');
}
// options of grep/sed/awk that take a value (the word after them is not the pattern or program)
const PROGRAM_VALS = { grep: ['-e', '-f', '-m'], sed: ['-e', '-f'], awk: ['-F', '-v', '-f'] };
// The items in some command lines (needed by an exercise, or taught by a learn card).
export function bashItems(text, { splitOps = true } = {}) {
  const out = new Set();
  let doc = null;   // a here-doc's delimiter: its body lines are data
  for (const raw of decode(String(text)).split('\n')) {
    if (doc) { if (raw.replace(doc.strip ? /^\t+/ : /^$/, '') === doc.delim) doc = null; continue; }
    let start = true, cmd = null, prev = null, list = false, fname = false, flags = new Set(), program = false;
    const begin = (w) => { cmd = w; flags = new Set(); program = false; out.add(`cmd ${w}`); };
    for (const t of bashTokens(raw.trim().replace(/^\$\s+/, ''))) {
      if (t.op) {
        if (splitOps || !['&&', ';'].includes(t.op)) out.add(`op ${t.op.replace('<<-', '<<')}`);
        if (!REDIRS.has(t.op)) { start = true; cmd = null; list = false; }
        prev = t.op; continue;
      }
      const w = t.w;
      if (prev === '<<' || prev === '<<-') { doc = { delim: w.replace(/['"\\]/g, ''), strip: prev === '<<-' }; prev = w; continue; }
      if (REDIRS.has(prev)) { wordItems(w, out); prev = w; continue; }   // a redirect's file name
      if (list === 'name') { if (w === 'in') list = true; prev = w; continue; }   // for x in
      if (list) { wordItems(w, out); prev = w; continue; }               // for x in <list>
      if (fname) { fname = false; prev = w; continue; }   // function NAME {
      if (start) {
        if (KW_ITEM[w] || KW_THEN_CMD.has(w)) {
          if (KW_ITEM[w]) out.add(KW_ITEM[w]);
          if (w === 'for') list = 'name';
          else if (w === 'function') fname = true;
          prev = w; continue;
        }
        if (/^[A-Za-z_]\w*\(\)$/.test(w)) { out.add('kw function'); prev = w; continue; }   // name() {
        const asg = /^[A-Za-z_]\w*\+?=(.*)$/s.exec(w);
        if (asg) { out.add('assign ='); wordItems(asg[1], out); prev = w; continue; }                       // x=… cmd: still at the start
        start = false;
        cmd = BASH_CMDS.has(w) ? w : null;
        if (cmd) { begin(w); prev = w; continue; }
      }
      // a command run by another: xargs grep -l, find … -exec rm {} \;
      if ((cmd === 'xargs' || prev === '-exec') && !w.startsWith('-') && BASH_CMDS.has(w)) { if (prev === '-exec') out.add('find -exec'); begin(w); prev = w; continue; }
      if (cmd && (w === '-' || /^-[^\d]/.test(w))) { for (const f of bashFlagItems(cmd, w)) { out.add(f); flags.add(f.split(' ')[1]); } }
      else if (cmd && /^-\d+$/.test(w)) out.add(`${cmd} -<n>`);
      else {
        if (cmd === 'tail' && /^\+\d+$/.test(w) && prev === '-n') out.add('tail +N');
        const valueOf = (PROGRAM_VALS[cmd] || []).includes(prev);
        const isProgram = prev === '-e' || (!program && !valueOf && !flags.has('-e'));
        if (cmd === 'grep' && isProgram && !flags.has('-F')) { program = true; regexItems(unquote(w), flags.has('-E'), out); }
        else if (cmd === 'sed' && isProgram) { program = true; sedItems(unquote(w), flags.has('-E'), out); }
        else if (cmd === 'awk' && isProgram) { program = true; awkItems(unquote(w), out); }
        wordItems(w, out);
      }
      prev = w;
    }
  }
  return out;
}
const firstWord = (s) => bashTokens(decode(String(s)).trim().replace(/^\$\s+/, ''))[0]?.w;
const isBashCmd = (s) => BASH_CMDS.has(firstWord(s));

export function bashTaughtBy(ex) {
  const out = new Set();
  const cmds = new Set();
  const add = (set) => { for (const x of set) { out.add(x); const m = /^cmd (\S+)/.exec(x); if (m) cmds.add(m[1]); } };
  const spans = [...codeSpans(ex.title), ...codeSpans(ex.body)];
  for (const s of spans) if (!/^\s*-/.test(s)) add(bashItems(s));
  for (const c of ex.demo?.run || []) add(bashItems(c));
  for (const s of spans) {
    if (/^\s*-/.test(s)) for (const t of s.trim().split(/\s+/)) if (/^-/.test(t)) for (const c of cmds) for (const f of bashFlagItems(c, t)) out.add(f);
    if (/^\s*(2>&1|<<<|&>|2>|>>|&&|\|\||>|<|\||;)\s*$/.test(s)) out.add(`op ${s.trim()}`);
  }
  for (const t of ex.teaches || []) {
    if (isBashCmd(t)) for (const x of bashItems(t)) out.add(x);
    else out.add(t);
  }
  return out;
}
export function bashNeededBy(ex) {
  const out = new Set();
  const addAll = (s, opts) => { for (const x of bashItems(s, opts)) out.add(x); };
  // a command line, or else just the globs/paths in it (file names in prompts, `*.txt`, `~/notes`)
  const addAny = (s) => {
    if (isBashCmd(s)) return addAll(s);
    for (const tok of bashTokens(decode(String(s)).replace(/<[^>]+>/g, ' '))) if (tok.w) wordItems(tok.w, out);
  };
  const addField = (s) => { s = String(s); for (const c of codeSpans(s)) addAny(c); if (!/<code>/.test(s)) addAny(s); };
  for (const s of codeSpans(ex.prompt)) addAny(s);
  switch (ex.type) {
    case 'type': addAll(ex.solution, { splitOps: false }); break;
    // a script's lines: the learner reads the starter and writes the solution (`;` and `&&` count: a file can't split)
    case 'script': addAll(ex.starter || ''); addAll(ex.solution); break;
    case 'build': addAll(ex.answers[0].join(' ')); break;
    case 'fill': addAll(ex.before + String(ex.options[ex.answer]).replace(/<[^>]+>/g, '') + ex.after); break;
    case 'outcome': addAll(ex.command); break;
    case 'choice': {
      addField(ex.options[ex.answer]);
      for (const l of String(ex.code || '').split('\n')) if (/^\$\s/.test(l)) addAll(l);
      break;
    }
    case 'match': for (const p of ex.pairs) for (const s of p) addField(s); break;
    case 'order': for (const s of ex.steps) addField(s); break;
  }
  for (const t of ex.needs || []) {
    if (isBashCmd(t)) addAll(t);
    else out.add(t);
  }
  return out;
}
const bashSteps = (units) => units.flatMap((u) => [
  ...u.lessons.map((l) => ({ id: l.id, exercises: l.exercises })),
  ...(u.challenges || []).filter((c) => c && typeof c === 'object').map((c) => ({ id: c.id, exercises: c.exercises })),
]);
export function bashAudit(units = BASH_UNITS) {
  const taught = new Map(), firstTaught = new Map();
  for (const l of bashSteps(units)) for (const ex of l.exercises) if (ex.type === 'learn') for (const x of bashTaughtBy(ex)) if (!firstTaught.has(x)) firstTaught.set(x, l.id);
  const problems = [];
  for (const l of bashSteps(units)) for (const ex of l.exercises) {
    if (ex.type === 'learn') { for (const x of bashTaughtBy(ex)) if (!taught.has(x)) taught.set(x, l.id); continue; }
    for (const x of bashNeededBy(ex)) if (!taught.has(x)) problems.push({ lesson: l.id, id: ex.id, item: x, later: firstTaught.get(x) || null });
  }
  return problems;
}

test('bash: every exercise only needs what a learn card taught earlier', () => {
  const problems = bashAudit();
  const lines = problems.map((p) => `  ${p.lesson.padEnd(15)} ${p.id.padEnd(22)} needs ${JSON.stringify(p.item)}${p.later ? `  (first taught in ${p.later})` : '  (never taught)'}`);
  assert.equal(problems.length, 0, `${problems.length} bash exercise item(s) are tested before they are taught:\n${lines.join('\n')}`);
});

test('bash: teaches tags sit on learn cards, needs tags on graded exercises', () => {
  const bad = [];
  for (const l of bashSteps(BASH_UNITS)) for (const ex of l.exercises) {
    if (ex.teaches && ex.type !== 'learn') bad.push(`${ex.id}: teaches on a ${ex.type}`);
    if (ex.needs && ex.type === 'learn') bad.push(`${ex.id}: needs on a learn card`);
    for (const t of [...(ex.teaches || []), ...(ex.needs || [])]) if (typeof t !== 'string' || !t.trim()) bad.push(`${ex.id}: empty tag`);
  }
  assert.deepEqual(bad, []);
});

test('bash: the parser reads commands, flags, operators, globs and paths', () => {
  const s = (t, o) => [...bashItems(t, o)].sort();
  assert.deepEqual(s('ls -la ~/notes'), ['cmd ls', 'ls -a', 'ls -l', 'path ~']);
  assert.deepEqual(s('ls photos | wc -l'), ['cmd ls', 'cmd wc', 'op |', 'wc -l']);
  assert.deepEqual(s('cat a.txt b.txt 2> /dev/null >> all.txt'), ['cmd cat', 'op 2>', 'op >>', 'path /dev/null']);
  assert.deepEqual(s('ls nope > out.txt 2>&1'), ['cmd ls', 'op 2>&1', 'op >']);
  assert.deepEqual(s('mv *.jpg photos/'), ['cmd mv', 'glob *']);
  assert.deepEqual(s('touch "my notes.txt" day{1..3}.txt {a,b}'), ['brace {,}', 'brace {..}', 'cmd touch', 'quote "']);
  assert.deepEqual(s('cd ../.. && pwd'), ['cmd cd', 'cmd pwd', 'op &&', 'path ..']);
  assert.deepEqual(s('cd ../.. && pwd', { splitOps: false }), ['cmd cd', 'cmd pwd', 'path ..']);
  assert.deepEqual(s('tail -n +2 log.txt'), ['cmd tail', 'tail +N', 'tail -n']);
  assert.deepEqual(s('head -5 f'), ['cmd head', 'head -<n>']);
  assert.deepEqual(s('wc -l < access.log'), ['cmd wc', 'op <', 'wc -l']);
  assert.deepEqual(s('cd -'), ['cd -', 'cmd cd']);
  assert.deepEqual(s('Lists the folder'), []);
  assert.deepEqual(s('rm my\\ file.txt'), ['cmd rm', 'escape \\']);
  assert.deepEqual(s('$ echo hi > a.txt'), ['cmd echo', 'op >']);
  // units 5-8: patterns, programs, find, xargs, variables
  assert.deepEqual(s("grep -E '^(INFO|WARN)' app.log"), ['cmd grep', 'grep -E', "quote '", 'regex ()', 'regex ^', 'regex |']);
  assert.deepEqual(s('grep -n ERROR app.log'), ['cmd grep', 'grep -n']);
  assert.deepEqual(s('grep "e.r$" f'), ['cmd grep', 'quote "', 'regex $', 'regex .']);
  assert.deepEqual(s("sed -n '/ERROR/p' f"), ['cmd sed', "quote '", 'sed -n', 'sed /re/', 'sed p']);
  assert.deepEqual(s("sed 's/a/b/g' f"), ['cmd sed', "quote '", 'sed s///', 'sed s///g']);
  assert.deepEqual(s("awk -F, 'NR > 1 {s += $3} END {print s}' f"), ['awk $N', 'awk +=', 'awk -F', 'awk END', 'awk NR', 'awk condition', 'cmd awk', "quote '"]);
  assert.deepEqual(s('cut -d: -f1 /etc/passwd'), ['cmd cut', 'cut -d', 'cut -f', 'path /']);
  assert.deepEqual(s('find . -name "*.tmp" -exec rm {} \\;'), ['cmd find', 'cmd rm', 'find -exec', 'find -name', 'path .', 'quote "']);
  assert.deepEqual(s('find src -name "*.js" | xargs grep -l TODO'), ['cmd find', 'cmd grep', 'cmd xargs', 'find -name', 'grep -l', 'op |', 'quote "']);
  assert.deepEqual(s('n=$((n + 1))'), ['assign =', 'math $(( ))']);
  assert.deepEqual(s('echo "Files: $(ls | wc -l)"'), ['cmd echo', 'cmd ls', 'cmd wc', 'op |', 'quote "', 'subst $( )', 'wc -l']);
  assert.deepEqual(s('echo "$name" ${name}s \'$x\''), ['cmd echo', 'quote "', "quote '", 'var $', 'var ${ }']);
  assert.deepEqual(s('echo $?'), ['cmd echo', 'var $?']);
});

test('bash: the parser reads scripts: keywords, commands after them, $( ), here-docs, comments', () => {
  const s = (t, o) => [...bashItems(t, o)].sort();
  assert.deepEqual(s('if [ -f "$1" ]; then\n  wc -l < "$1"\nelif [ -d "$1" ]; then ls "$1"\nelse echo no; fi'),
    ['[ -d', '[ -f', 'cmd [', 'cmd echo', 'cmd ls', 'cmd wc', 'kw if', 'op ;', 'op <', 'quote "', 'var $', 'wc -l']);
  assert.deepEqual(s('for f in *.txt; do mv "$f" "${f%.txt}.md"; done', { splitOps: false }), ['cmd mv', 'glob *', 'kw for', 'quote "', 'var $']);
  assert.deepEqual(s('while read -r line; do echo "$line"; done < list.txt', { splitOps: false }), ['cmd echo', 'cmd read', 'kw while', 'op <', 'quote "', 'read -r', 'var $']);
  assert.deepEqual(s('n=$(grep -c ERROR log.txt) # count them\necho $n'), ['assign =', 'cmd echo', 'cmd grep', 'grep -c', 'subst $( )', 'var $']);
  assert.deepEqual(s('greet() {\n  local who=$1\n  return 0\n}\nfunction bye { echo bye; }'), ['cmd echo', 'cmd local', 'cmd return', 'kw function', 'op ;', 'var $']);
  assert.deepEqual(s('cat > notes.txt <<EOF\nrm -rf everything | here\nEOF\nls'), ['cmd cat', 'cmd ls', 'op <<', 'op >']);
  assert.deepEqual(s('#!/bin/bash\n# a comment with ls in it\nset -e'), ['cmd set', 'set -e']);
});

test('bash: a script exercise needs what its starter and solution use', () => {
  const need = [...bashNeededBy(SCRIPT_FIXTURES.find((e) => e.id === 'fx-script-backup'))];
  for (const x of ['cmd mkdir', 'mkdir -p', 'cmd cp', 'cmd echo', 'kw for', 'glob *', 'quote "', 'var $']) assert.ok(need.includes(x), `needs ${x}`);
  assert.ok(!need.some((x) => /^cmd (count|f|backup)\b/.test(x)), 'no variable or file name is read as a command');
});
