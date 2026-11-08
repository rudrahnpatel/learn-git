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
