// learn-git: a small, pure, simulated git.
// No DOM access in here, so it runs the same in the browser and in node tests.
// State lives in `repo.s` (plain JSON), commands go through `repo.run(line)`.

export class GitError extends Error {
  constructor(msg, code = 128) { super(msg); this.code = code; }
}
const fail = (msg, code) => { throw new GitError(msg, code); };

/* ------------------------------------------------------------------ utils */

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function shortHash(str) {
  const a = fnv(str), b = fnv(a + ':' + str);
  return ((a ^ Math.imul(b, 2654435761)) >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const keys = (o) => Object.keys(o || {});
const union = (...objs) => [...new Set(objs.flatMap((o) => keys(o)))].sort();
export const firstLine = (msg) => String(msg || '').split('\n')[0];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export function treeEq(a, b) {
  const ka = keys(a), kb = keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && b[k] === a[k]);
}
export function splitLines(s) {
  if (!s) return [];
  const t = s.endsWith('\n') ? s.slice(0, -1) : s;
  return t.split('\n');
}
export function joinLines(a) { return a.length ? a.join('\n') + '\n' : ''; }
export function norm(content) {
  if (content == null) return content;
  const s = String(content);
  return s === '' || s.endsWith('\n') ? s : s + '\n';
}

// LCS match: for each index of a, the matched index in b (or -1).
export function lcsMatch(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const res = new Array(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { res[i] = j; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return res;
}
const arrEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Line-based three-way merge (diff3 style). Returns { text, conflicts }.
export function merge3(base, ours, theirs, labels = { ours: 'HEAD', theirs: 'theirs' }) {
  const O = splitLines(base), A = splitLines(ours), B = splitLines(theirs);
  const ma = lcsMatch(O, A), mb = lcsMatch(O, B);
  const out = [];
  let i = 0, ia = 0, ib = 0, conflicts = 0;
  while (i < O.length || ia < A.length || ib < B.length) {
    if (i < O.length && ma[i] === ia && mb[i] === ib) { out.push(O[i]); i++; ia++; ib++; continue; }
    let j = i;
    while (j < O.length && !(ma[j] !== -1 && mb[j] !== -1)) j++;
    const ea = j < O.length ? ma[j] : A.length, eb = j < O.length ? mb[j] : B.length;
    const o = O.slice(i, j), a = A.slice(ia, ea), b = B.slice(ib, eb);
    if (arrEq(a, o)) out.push(...b);
    else if (arrEq(b, o)) out.push(...a);
    else if (arrEq(a, b)) out.push(...a);
    else {
      conflicts++;
      out.push('<<<<<<< ' + labels.ours, ...a, '=======', ...b, '>>>>>>> ' + labels.theirs);
    }
    i = j; ia = ea; ib = eb;
  }
  return { text: joinLines(out), conflicts };
}

// Merge whole trees ({path: content}); returns { tree, conflicts, msgs }.
export function mergeTrees(base, ours, theirs, labels) {
  const tree = {}, conflicts = {}, msgs = [];
  for (const p of union(base, ours, theirs)) {
    const o = base[p], a = ours[p], b = theirs[p];
    if (a === b) { if (a !== undefined) tree[p] = a; continue; }
    if (o === a) { if (b !== undefined) tree[p] = b; continue; }
    if (o === b) { if (a !== undefined) tree[p] = a; continue; }
    if (a === undefined || b === undefined) {
      tree[p] = a ?? b;
      conflicts[p] = { base: o ?? null, ours: a ?? null, theirs: b ?? null };
      const del = a === undefined ? labels.ours : labels.theirs, mod = a === undefined ? labels.theirs : labels.ours;
      msgs.push(`CONFLICT (modify/delete): ${p} deleted in ${del} and modified in ${mod}.`);
      continue;
    }
    msgs.push(`Auto-merging ${p}`);
    const m = merge3(o ?? '', a, b, labels);
    tree[p] = m.text;
    if (m.conflicts) {
      conflicts[p] = { base: o ?? null, ours: a, theirs: b };
      msgs.push(`CONFLICT (${o === undefined ? 'add/add' : 'content'}): Merge conflict in ${p}`);
    }
  }
  return { tree, conflicts, msgs };
}

// Line diff ops: [{t: ' ' | '-' | '+', line}]
export function diffOps(aText, bText) {
  const a = splitLines(aText), b = splitLines(bText);
  const m = lcsMatch(a, b);
  const ops = [];
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    if (m[i] === -1) { ops.push({ t: '-', line: a[i] }); continue; }
    while (j < m[i]) ops.push({ t: '+', line: b[j++] });
    ops.push({ t: ' ', line: a[i] }); j++;
  }
  while (j < b.length) ops.push({ t: '+', line: b[j++] });
  return ops;
}

export function unifiedDiff(path, aText, bText) {
  const out = [`diff --git a/${path} b/${path}`];
  if (aText === undefined) out.push('new file mode 100644');
  if (bText === undefined) out.push('deleted file mode 100644');
  out.push(aText === undefined ? '--- /dev/null' : `--- a/${path}`);
  out.push(bText === undefined ? '+++ /dev/null' : `+++ b/${path}`);
  const ops = diffOps(aText || '', bText || '');
  const C = 3;
  let k = 0;
  while (k < ops.length) {
    while (k < ops.length && ops[k].t === ' ') k++;
    if (k >= ops.length) break;
    let start = Math.max(0, k - C), end = k;
    while (end < ops.length) {
      if (ops[end].t !== ' ') { end++; continue; }
      let run = 0;
      while (end + run < ops.length && ops[end + run].t === ' ') run++;
      if (end + run >= ops.length || run > 2 * C) { end = Math.min(ops.length, end + C); break; }
      end += run;
    }
    let aLine = 1, bLine = 1;
    for (let x = 0; x < start; x++) { if (ops[x].t !== '+') aLine++; if (ops[x].t !== '-') bLine++; }
    const hunk = ops.slice(start, end);
    const aCount = hunk.filter((o) => o.t !== '+').length, bCount = hunk.filter((o) => o.t !== '-').length;
    const rng = (start, n) => (n === 1 ? `${start}` : `${n ? start : start - 1},${n}`);
    out.push(`@@ -${rng(aLine, aCount)} +${rng(bLine, bCount)} @@`);
    for (const o of hunk) out.push(o.t + o.line);
    k = end;
  }
  return out;
}

function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') { if (glob[i + 1] === '*') { re += '.*'; i++; } else re += '[^/]*'; }
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/* ------------------------------------------------------------- parsing */

export function tokenize(line) {
  const toks = [];
  let cur = null, q = null;
  const push = () => { if (cur !== null) { toks.push({ t: 'w', v: cur }); cur = null; } };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && (line[i + 1] === '"' || line[i + 1] === '\\')) { cur += line[++i]; }
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { q = c; if (cur === null) cur = ''; continue; }
    if (/\s/.test(c)) { push(); continue; }
    if (c === '>') { push(); if (line[i + 1] === '>') { toks.push({ t: 'op', v: '>>' }); i++; } else toks.push({ t: 'op', v: '>' }); continue; }
    if (c === '&' && line[i + 1] === '&') { push(); toks.push({ t: 'op', v: '&&' }); i++; continue; }
    if (c === ';') { push(); toks.push({ t: 'op', v: ';' }); continue; }
    if (cur === null) cur = '';
    cur += c;
  }
  if (q) fail(`syntax error: unterminated quote (${q})`, 2);
  push();
  return toks;
}

export function parseLine(line) {
  const segs = [];
  let cur = { argv: [], redir: null, join: null };
  const toks = tokenize(line);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'op' && (t.v === '&&' || t.v === ';')) {
      if (cur.argv.length) segs.push(cur);
      cur = { argv: [], redir: null, join: t.v };
    } else if (t.t === 'op') {
      const f = toks[i + 1];
      if (!f || f.t !== 'w') fail('syntax error near unexpected token `newline\'', 2);
      cur.redir = { op: t.v, file: f.v }; i++;
    } else cur.argv.push(t.v);
  }
  if (cur.argv.length) segs.push(cur);
  return segs;
}

function opts(args, { flags = [], values = [] } = {}) {
  const o = { _: [], paths: null };
  const F = new Set(flags), V = new Set(values);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { o.paths = args.slice(i + 1); break; }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
      const v = eq > 0 ? a.slice(eq + 1) : undefined;
      if (V.has(k)) {
        const val = v !== undefined ? v : args[++i];
        if (val === undefined) fail(`error: option \`${k}' requires a value`, 129);
        (o[k] ||= []).push(val);
      } else if (F.has(k)) o[k] = true;
      else fail(`error: unknown option \`${k}'`, 129);
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (V.has(c)) {
          const rest = a.slice(j + 1);
          const val = rest || args[++i];
          if (val === undefined) fail(`error: switch \`${c}' requires a value`, 129);
          (o[c] ||= []).push(val);
          break;
        }
        if (F.has(c)) o[c] = true;
        else fail(`error: unknown switch \`${c}'`, 129);
      }
    } else o._.push(a);
  }
  return o;
}
const last = (arr) => (arr ? arr[arr.length - 1] : undefined);

export const GIT_COMMANDS = ['add', 'bisect', 'blame', 'branch', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit', 'config',
  'diff', 'fetch', 'help', 'init', 'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'reflog', 'remote', 'reset', 'restore',
  'rev-parse', 'revert', 'rm', 'show', 'stash', 'status', 'switch', 'tag', 'version',
  'cat-file', 'hash-object', 'ls-tree', 'show-ref', 'symbolic-ref'];
export const SHELL_COMMANDS = ['git', 'ls', 'cat', 'edit', 'echo', 'rm', 'touch', 'mv', 'clear', 'help', 'pwd', './run-tests'];

const REMOTE = 'origin';
const URL = 'git@playground.local:team/project.git';
// "github.com/bakery/site" for any spelling of a repo URL (https, ssh, with or without .git)
const repoKey = (url) => String(url || '').toLowerCase().replace(/^[a-z+]+:\/\//, '').replace(/^[^@/]+@/, '').replace(':', '/').replace(/\.git$/, '').replace(/\/+$/, '');
// Fake object ids for trees and blobs (commits already have ids). Same content, same id.
export const blobId = (content) => shortHash('blob\0' + content);
const fakeTime = (n) => 1767225600 + n * 97;

/* Remotes
 * origin keeps its original fields: its server is `s.remote` ({url, branches, tags}) and its
 * remote-tracking refs are `s.tracking` ({branch: id}). Content and levels read those directly.
 * Every other named remote (e.g. `upstream` in the fork model) has its server in
 * `s.remotes[name]` ({url, branches, tags, readOnly?, missing?}) and its tracking refs in
 * `s.remoteTracking[name]`. A branch's upstream is `s.upstream[b]` (the remote branch name) plus
 * `s.upstreamRemote[b]` when that remote is not origin. Repos that exist "out there" but are not
 * added yet wait in `s.unlinked[repoKey(url)]` until `git remote add` names them.
 * Every command goes through `_remote(name)`, `_up(branch)` and `_trackingRef(name)`. */

/* ----------------------------------------------------------------- Repo */

export class Repo {
  constructor(state) {
    this.s = state ? clone(state) : Repo.emptyState();
    for (const k of ['remotes', 'remoteTracking', 'upstreamRemote', 'unlinked']) this.s[k] ||= {}; // older saved states
    this.history = [];
    this.out = [];
    this.events = [];
    this.exitCode = 0;
  }
  static emptyState() {
    return {
      commits: {}, branches: {}, tags: {}, head: { branch: 'main' },
      index: {}, work: {}, conflicts: {}, stash: [], reflog: {}, n: 0,
      origHead: null, mergeHead: null, mergeMsg: null, seq: null, pendingRebase: null, bisect: null,
      remote: null, tracking: {}, upstream: {}, config: {}, prevRef: null, detachedFrom: null, bugMarker: null,
      remotes: {}, remoteTracking: {}, upstreamRemote: {}, unlinked: {},
    };
  }
  clone() { const r = new Repo(this.s); r.history = [...this.history]; return r; }
  fingerprint() { return JSON.stringify(this.s); }

  /* ---------- output ---------- */
  p(text = '', cls = '') { for (const line of String(text).split('\n')) this.out.push({ t: line, c: cls }); }
  hint(text) { this.p(text.split('\n').map((l) => 'hint: ' + l).join('\n'), 'hint'); }

  run(input) {
    this.out = []; this.events = [];
    let segs;
    try { segs = Array.isArray(input) ? [{ argv: input, redir: null, join: null }] : parseLine(String(input).trim()); }
    catch (e) { this.p(e.message, 'err'); return { lines: this.out, ok: false, events: [] }; }
    let ok = true;
    for (const seg of segs) {
      if (!ok && seg.join === '&&') continue;
      ok = this.exec1(seg);
    }
    if (segs.length) this.history.push(Array.isArray(input) ? input.join(' ') : String(input).trim());
    return { lines: this.out, ok, events: this.events };
  }

  exec1(seg) {
    const before = this.out.length;
    const snapshot = JSON.stringify(this.s);
    this.exitCode = 0;
    try { this.dispatch(seg.argv); }
    catch (e) {
      if (e instanceof GitError) { this.s = JSON.parse(snapshot); this.p(e.message, 'err'); this.exitCode = e.code || 128; }
      else { this.s = JSON.parse(snapshot); this.p('internal error: ' + e.message, 'err'); this.exitCode = 1; if (typeof console !== 'undefined') console.error(e); }
    }
    if (seg.redir) {
      const captured = this.out.splice(before).filter((l) => { if (l.c === 'err') { this.out.push(l); return false; } return true; });
      if (this.exitCode === 0) {
        const text = captured.map((l) => l.t).join('\n') + (captured.length ? '\n' : '');
        const f = seg.redir.file;
        this.s.work[f] = seg.redir.op === '>>' ? (this.s.work[f] || '') + text : text;
      }
    }
    return this.exitCode === 0;
  }

  dispatch(argv) {
    const [cmd, ...args] = argv;
    switch (cmd) {
      case 'git': return this.git(args);
      case 'ls': return this.sh_ls(args);
      case 'cat': return this.sh_cat(args);
      case 'edit': return this.sh_edit(args);
      case 'echo': return this.sh_echo(args);
      case 'rm': return this.sh_rm(args);
      case 'touch': for (const f of args) if (!(f in this.s.work)) this.s.work[f] = ''; return;
      case 'mv': return this.sh_mv(args);
      case 'pwd': return this.p('/home/you/project');
      case 'clear': this.events.push({ type: 'clear' }); return;
      case 'help': return this.help();
      case 'run-tests': case './run-tests': return this.sh_tests();
      default: {
        const all = [...SHELL_COMMANDS, ...GIT_COMMANDS];
        if (GIT_COMMANDS.includes(cmd)) fail(`${cmd}: command not found. Did you mean 'git ${cmd}'?`, 127);
        const best = all.map((c) => [c, levenshtein(cmd, c)]).sort((a, b) => a[1] - b[1])[0];
        fail(`${cmd}: command not found.${best && best[1] <= 2 ? ` Did you mean '${best[0]}'?` : ''} Type 'help' for the list.`, 127);
      }
    }
  }

  help() {
    this.p(`Shell:  ls · cat <file> · edit <file> "text" (\\n = new line; no text opens the editor)
        echo "text" > file · echo "text" >> file · rm <file> · touch <file> · clear · ./run-tests
Git:    ${GIT_COMMANDS.join(' · ')}
Tips:   ↑/↓ for history · Tab completes commands, branches and files · cmd1 && cmd2 chains`);
  }

  git(args) {
    if (!args.length) { this.p('usage: git <command> [<args>]   (try: git status, git help)'); return; }
    const [sub, ...rest] = args;
    if (sub === '--version' || sub === 'version') return this.p('git version 2.47.0 (learn-git simulation)');
    const fn = this['git_' + sub.replace(/-/g, '_')];
    if (!fn || !GIT_COMMANDS.includes(sub)) {
      const best = GIT_COMMANDS.map((c) => [c, levenshtein(sub, c)]).sort((a, b) => a[1] - b[1])[0];
      const extra = best[1] <= 3 ? `\n\nThe most similar command is\n\t${best[0]}` : '';
      fail(`git: '${sub}' is not a git command. See 'git help'.${extra}`, 1);
    }
    if (this.s.pendingRebase && !['rebase', 'status', 'log', 'diff', 'show', 'help'].includes(sub))
      fail('error: an interactive rebase is waiting for its todo list.\nhint: finish it in the rebase panel, or run "git rebase --abort"', 1);
    return fn.call(this, rest);
  }

  /* ---------- core helpers ---------- */
  headId() { const h = this.s.head; return h.branch ? this.s.branches[h.branch] || null : h.detached; }
  headTree() { const id = this.headId(); return id ? this.s.commits[id].tree : {}; }
  tree(id) { return id ? this.s.commits[id].tree : {}; }
  commit(id) { return this.s.commits[id]; }
  branchName() { return this.s.head.branch || null; }
  short(id) { return id; }

  _log(ref, id, msg) {
    const l = (this.s.reflog[ref] ||= []);
    l.unshift({ id, msg });
    if (l.length > 200) l.length = 200;
  }
  _setHead(id, msg) {
    const s = this.s;
    if (s.head.branch) { s.branches[s.head.branch] = id; this._log(s.head.branch, id, msg); }
    else s.head = { detached: id };
    this._log('HEAD', id, msg);
  }
  _mkCommit(parents, tree, msg, author = 'you', extra = {}) {
    const n = ++this.s.n;
    const key = Object.keys(tree).sort().map((k) => k + '\u0001' + tree[k]).join('\u0002');
    let id = shortHash(parents.join(',') + '\0' + msg + '\0' + key + '\0' + n);
    while (this.s.commits[id]) id = shortHash(id + '+');
    this.s.commits[id] = { id, parents: [...parents], msg, tree: { ...tree }, author, n, ...extra };
    return id;
  }

  ancestors(id, set = new Set()) {
    const stack = [id];
    while (stack.length) {
      const c = stack.pop();
      if (!c || set.has(c)) continue;
      set.add(c);
      stack.push(...this.s.commits[c].parents);
    }
    return set;
  }
  ancestorsOf(ids) { const set = new Set(); for (const id of ids) if (id) this.ancestors(id, set); return set; }
  isAncestor(a, b) { return !!a && !!b && this.ancestors(b).has(a); }
  mergeBase(a, b) {
    const A = this.ancestors(a), B = this.ancestors(b);
    const common = [...A].filter((x) => B.has(x));
    if (!common.length) return null;
    const best = common.filter((c) => !common.some((d) => d !== c && this.isAncestor(c, d)));
    return best.sort((x, y) => this.s.commits[y].n - this.s.commits[x].n)[0];
  }
  // commits reachable from `to` but not from `from`, oldest first
  range(from, to) {
    const ex = from ? this.ancestors(from) : new Set();
    return [...this.ancestors(to)].filter((c) => !ex.has(c)).sort((a, b) => this.s.commits[a].n - this.s.commits[b].n);
  }
  allRefTips() {
    const s = this.s;
    return [...Object.values(s.branches), ...Object.values(s.tags).map((t) => t.id), ...this._allTracking().map(([, id]) => id), this.headId()].filter(Boolean);
  }

  /* ---------- named remotes (see the note at the top) ---------- */
  remoteNames() { return [...(this.s.remote ? [REMOTE] : []), ...keys(this.s.remotes).sort()]; }
  // {name, R: server state, T: this clone's tracking refs} or null
  _remote(name) {
    const s = this.s;
    if (name === REMOTE) return s.remote ? { name, R: s.remote, T: s.tracking } : null;
    const R = s.remotes[name];
    return R ? { name, R, T: (s.remoteTracking[name] ||= {}) } : null;
  }
  _needRemote(name = REMOTE) {
    const rm = this._remote(name);
    if (!rm) fail(`fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`);
    return rm;
  }
  // every remote-tracking ref as [fullName, id], e.g. ['upstream/main', 'a1b2c3d']
  _allTracking() {
    const out = [];
    for (const n of this.remoteNames()) for (const [b, id] of Object.entries(this._remote(n).T)) out.push([`${n}/${b}`, id]);
    return out;
  }
  // 'upstream/main' -> {remote: 'upstream', branch: 'main', id} when that tracking ref exists
  _trackingRef(full) {
    for (const n of this.remoteNames()) {
      if (!full.startsWith(n + '/')) continue;
      const b = full.slice(n.length + 1), T = this._remote(n).T;
      if (b in T) return { remote: n, branch: b, id: T[b] };
    }
    return null;
  }
  // the configured upstream of a local branch: {remote, branch, ref, tip} (tip null when gone)
  _up(b) {
    const s = this.s;
    if (!b || !s.upstream[b]) return null;
    const remote = s.upstreamRemote[b] || REMOTE, branch = s.upstream[b];
    const rm = this._remote(remote);
    return { remote, branch, ref: `${remote}/${branch}`, tip: (rm && rm.T[branch]) || null };
  }
  _setUp(b, remote, branch) {
    this.s.upstream[b] = branch;
    if (remote === REMOTE) delete this.s.upstreamRemote[b]; else this.s.upstreamRemote[b] = remote;
  }
  _clearUp(b) { delete this.s.upstream[b]; delete this.s.upstreamRemote[b]; }
  _aheadBehind(id, tip) { return [this.range(tip, id).length, this.range(id, tip).length]; }

  resolve(rev, { quiet = false } = {}) {
    const s = this.s;
    const bad = () => fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions`);
    if (!rev) bad();
    const m = rev.match(/^(.*?)((?:[~^]\d*)*)$/);
    let base = m[1];
    const ops = m[2];
    let id = null;
    const rl = base.match(/^(.*)@\{(\d+)\}$/);
    if (base === 'HEAD' || base === '@') {
      id = this.headId();
      if (!id) fail(`fatal: ambiguous argument 'HEAD': unknown revision (your branch has no commits yet)`);
    } else if (rl) {
      const ref = rl[1] === '' || rl[1] === 'HEAD' ? 'HEAD' : rl[1];
      const log = s.reflog[ref];
      if (!log) fail(`fatal: log for '${ref}' is empty or does not exist`);
      const e = log[+rl[2]];
      if (!e) fail(`fatal: log for '${ref}' only has ${log.length} entries`);
      id = e.id;
    } else if (base === 'ORIG_HEAD') id = s.origHead;
    else if (base === 'MERGE_HEAD') id = s.mergeHead;
    else if (base === 'refs/bisect/bad' || base === 'bisect/bad') id = s.bisect?.bad || null;
    else {
      const b = base.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '').replace(/^refs\/remotes\//, '').replace(/^remotes\//, '');
      if (b in s.branches) id = s.branches[b];
      else if (b in s.tags) id = s.tags[b].id;
      else if (this._trackingRef(b)) id = this._trackingRef(b).id;
      // a bare remote name means its default branch (refs/remotes/<name>/HEAD), which is main here
      else if (this.remoteNames().includes(b) && this._remote(b).T.main) id = this._remote(b).T.main;
      else if (/^[0-9a-f]{4,40}$/.test(b)) {
        const hits = keys(s.commits).filter((c) => c.startsWith(b) && !s.commits[c].remoteOnly);
        if (hits.length > 1) fail(`error: short object ID ${b} is ambiguous`);
        id = hits[0] || null;
      }
    }
    if (!id) { if (quiet) return null; bad(); }
    for (const op of ops.matchAll(/([~^])(\d*)/g)) {
      const num = op[2] === '' ? 1 : +op[2];
      if (op[1] === '~') {
        for (let k = 0; k < num; k++) { id = s.commits[id].parents[0]; if (!id) { if (quiet) return null; bad(); } }
      } else if (num > 0) {
        id = s.commits[id].parents[num - 1];
        if (!id) { if (quiet) return null; bad(); }
      }
    }
    return id;
  }
  tryResolve(rev) { try { return this.resolve(rev, { quiet: true }); } catch { return null; } }

  /* ---------- index / working tree helpers ---------- */
  isIgnored(path) {
    const gi = this.s.work['.gitignore'];
    if (!gi) return false;
    for (let pat of splitLines(gi)) {
      pat = pat.trim();
      if (!pat || pat.startsWith('#') || pat.startsWith('!')) continue;
      if (pat.endsWith('/')) {
        const d = pat.replace(/^\//, '').slice(0, -1);
        if (path.startsWith(d + '/') || path.includes('/' + d + '/')) return true;
        continue;
      }
      if (pat.includes('/')) { if (globToRe(pat.replace(/^\//, '')).test(path)) return true; continue; }
      const re = globToRe(pat);
      if (path.split('/').some((seg) => re.test(seg))) return true;
    }
    return false;
  }
  tracked(p) { return p in this.s.index || p in this.s.conflicts; }
  untracked() { return keys(this.s.work).filter((p) => !this.tracked(p) && !this.isIgnored(p)).sort(); }
  stagedChanges() {
    const h = this.headTree(), ix = this.s.index;
    return union(h, ix).filter((p) => h[p] !== ix[p] && !(p in this.s.conflicts));
  }
  unstagedChanges() {
    return keys(this.s.index).filter((p) => this.s.work[p] !== this.s.index[p] && !(p in this.s.conflicts)).sort();
  }
  isClean() { return !this.stagedChanges().length && !this.unstagedChanges().length && !keys(this.s.conflicts).length; }
  matchPaths(spec, candidates) {
    if (spec === '.' || spec === ':/' || spec === '*') return candidates;
    const clean = spec.replace(/^\.\//, '').replace(/\/$/, '');
    if (/[*?]/.test(clean)) { const re = globToRe(clean); return candidates.filter((p) => re.test(p) || re.test(p.split('/').pop())); }
    return candidates.filter((p) => p === clean || p.startsWith(clean + '/'));
  }
  _hardResetTo(tree) {
    const s = this.s;
    for (const p of union(s.index, this.headTree(), s.conflicts)) if (!(p in tree)) delete s.work[p];
    for (const p in tree) s.work[p] = tree[p];
    s.index = { ...tree };
    s.conflicts = {};
  }
  // Move work/index from current HEAD tree to target tree, carrying local changes.
  _checkoutTree(targetId, { force = false } = {}) {
    const s = this.s, cur = this.headTree(), tgt = this.tree(targetId);
    if (force) { this._hardResetTo(tgt); return; }
    if (keys(s.conflicts).length) fail('error: you need to resolve your current index first', 1);
    const paths = union(cur, tgt, s.index, s.work);
    const blocked = [], untr = [];
    const dirty = (p) => s.index[p] !== cur[p] || (p in s.index && s.work[p] !== s.index[p]);
    for (const p of paths) {
      if (cur[p] === tgt[p]) continue;
      if (dirty(p)) { if (!(s.index[p] === tgt[p] && s.work[p] === tgt[p])) blocked.push(p); }
      else if (!(p in s.index) && p in s.work && tgt[p] !== undefined && s.work[p] !== tgt[p]) untr.push(p);
    }
    if (blocked.length) fail(`error: Your local changes to the following files would be overwritten by checkout:\n${blocked.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you switch branches.\nAborting`, 1);
    if (untr.length) fail(`error: The following untracked working tree files would be overwritten by checkout:\n${untr.map((p) => '\t' + p).join('\n')}\nPlease move or remove them before you switch branches.\nAborting`, 1);
    for (const p of paths) {
      if (cur[p] === tgt[p] || dirty(p)) continue;
      if (tgt[p] === undefined) { delete s.index[p]; delete s.work[p]; }
      else { s.index[p] = tgt[p]; s.work[p] = tgt[p]; }
    }
  }
  _requireNoOp(what) {
    const s = this.s;
    if (s.mergeHead) fail(`fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you ${what}.`);
    if (s.seq) fail(`error: a ${s.seq.kind} is in progress.\nhint: use "git ${s.seq.kind} --continue" or "git ${s.seq.kind} --abort"`);
  }
  _describe(id) { return `${id} ${firstLine(this.s.commits[id].msg)}`; }
  _refName(id) {
    const s = this.s;
    for (const [b, v] of Object.entries(s.branches)) if (v === id) return b;
    return id;
  }

  /* =============================================================== commands */

  git_init() { this.p('Reinitialized existing Git repository in /home/you/project/.git/'); }
  git_help() { this.help(); }
  git_clone() {
    fail(`fatal: destination path 'project' already exists and is not an empty directory.\nhint: this playground is already a clone of 'origin' (see: git remote -v)`);
  }
  git_config(args) {
    const o = opts(args, { flags: ['global', 'local', 'list', 'l', 'unset'] });
    if (o.list || o.l) { for (const [k, v] of Object.entries(this.s.config)) this.p(`${k}=${v}`); return; }
    const [k, v] = o._;
    if (!k) fail('usage: git config <key> [<value>]', 129);
    if (o.unset) { delete this.s.config[k]; return; }
    if (v === undefined) { if (k in this.s.config) this.p(this.s.config[k]); else this.exitCode = 1; return; }
    this.s.config[k] = v;
  }
  git_remote(args) {
    const o = opts(args, { flags: ['v', 'verbose'] });
    const s = this.s;
    const [sub, name, url] = o._;
    if (!sub) {
      for (const n of this.remoteNames()) {
        const u = this._remote(n).R.url;
        if (o.v || o.verbose) this.p(`${n}\t${u} (fetch)\n${n}\t${u} (push)`); else this.p(n);
      }
      return;
    }
    if (sub === 'add') {
      if (!name || !url) fail('usage: git remote add <name> <url>', 129);
      this._validName(name);
      if (this._remote(name)) fail(`error: remote ${name} already exists.`, 3);
      const key = repoKey(url);
      const server = s.unlinked[key] || { url, branches: {}, tags: {}, missing: true };
      delete s.unlinked[key];
      server.url = url;
      if (name === REMOTE) { s.remote = server; s.tracking = {}; } else { s.remotes[name] = server; s.remoteTracking[name] = {}; }
      return;
    }
    if (sub === 'remove' || sub === 'rm') {
      if (!name) fail('usage: git remote remove <name>', 129);
      const rm = this._remote(name);
      if (!rm) fail(`error: No such remote: '${name}'`, 2);
      if (!rm.R.missing) s.unlinked[repoKey(rm.R.url)] = rm.R; // the repo still exists out there
      for (const b of keys(s.upstream)) if ((s.upstreamRemote[b] || REMOTE) === name) this._clearUp(b);
      for (const ref of keys(s.reflog)) if (ref.startsWith(name + '/')) delete s.reflog[ref];
      if (name === REMOTE) { s.remote = null; s.tracking = {}; } else { delete s.remotes[name]; delete s.remoteTracking[name]; }
      return;
    }
    if (sub === 'get-url') { this.p(this._needRemote(name).R.url); return; }
    fail(`error: unknown subcommand: '${sub}' (this playground supports: git remote [-v], add, remove, get-url)`, 129);
  }
  git_rev_parse(args) {
    const o = opts(args, { flags: ['short', 'abbrev-ref', 'symbolic-full-name'] });
    for (const r of o._) {
      if (o['abbrev-ref'] && r === 'HEAD') { this.p(this.branchName() || 'HEAD'); continue; }
      if (o['symbolic-full-name']) { this.resolve(r); const f = this._fullRef(r); if (f || r === 'HEAD') this.p(f || 'HEAD'); continue; }
      if (/\^\{tree\}$/.test(r) || r.indexOf(':') > 0) { this.p(this._object(r).id); continue; }
      const id = this.resolve(r.replace(/\^\{commit\}$/, ''));
      this.p(id);
    }
  }
  // 'main' -> 'refs/heads/main', 'origin/x' -> 'refs/remotes/origin/x', 'v1' -> 'refs/tags/v1'
  _fullRef(name) {
    const s = this.s;
    if (name === 'HEAD') return s.head.branch ? `refs/heads/${s.head.branch}` : null;
    const b = name.replace(/^refs\/(heads|tags|remotes)\//, '');
    if (b in s.branches) return `refs/heads/${b}`;
    if (b in s.tags) return `refs/tags/${b}`;
    if (this._trackingRef(b)) return `refs/remotes/${b}`;
    return null;
  }

  /* ---------- objects: blobs, trees, commits (read-only plumbing) ---------- */
  // A tree object for one directory level of a flat {path: content} map: [{mode, type, id, name}]
  _treeEntries(tree, prefix = '') {
    const files = [], dirs = new Map();
    for (const p of keys(tree).sort()) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length), slash = rest.indexOf('/');
      if (slash < 0) files.push({ mode: '100644', type: 'blob', id: blobId(tree[p]), name: rest });
      else dirs.set(rest.slice(0, slash), true);
    }
    const out = [...files, ...[...dirs.keys()].map((d) => ({ mode: '040000', type: 'tree', id: this._treeId(tree, prefix + d + '/'), name: d }))];
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  _treeId(tree, prefix = '') {
    return shortHash('tree\0' + this._treeEntries(tree, prefix).map((e) => `${e.mode} ${e.type} ${e.id}\t${e.name}`).join('\n'));
  }
  // Find any object by id (or rev, or rev:path, or rev^{tree}): {type, id, ...}
  _object(spec) {
    const s = this.s;
    const colon = spec.indexOf(':');
    if (colon > 0) {
      const id = this.resolve(spec.slice(0, colon)), path = spec.slice(colon + 1).replace(/\/$/, '');
      const tr = this.tree(id);
      if (path === '') return { type: 'tree', id: this._treeId(tr), tree: tr, prefix: '' };
      if (path in tr) return { type: 'blob', id: blobId(tr[path]), content: tr[path] };
      if (keys(tr).some((p) => p.startsWith(path + '/'))) return { type: 'tree', id: this._treeId(tr, path + '/'), tree: tr, prefix: path + '/' };
      fail(`fatal: path '${path}' does not exist in '${spec.slice(0, colon)}'`);
    }
    if (/\^\{tree\}$/.test(spec)) { const tr = this.tree(this.resolve(spec.replace(/\^\{tree\}$/, ''))); return { type: 'tree', id: this._treeId(tr), tree: tr, prefix: '' }; }
    if (s.tags[spec]?.msg) return { type: 'tag', id: shortHash('tag\0' + spec + s.tags[spec].id), tag: spec };
    const id = this.tryResolve(spec);
    if (id) return { type: 'commit', id };
    if (/^[0-9a-f]{4,40}$/.test(spec)) {
      for (const c of Object.values(s.commits)) {
        if (c.remoteOnly) continue;
        const walk = (prefix) => {
          if (this._treeId(c.tree, prefix).startsWith(spec)) return { type: 'tree', id: this._treeId(c.tree, prefix), tree: c.tree, prefix };
          for (const e of this._treeEntries(c.tree, prefix)) {
            if (e.type === 'blob' && e.id.startsWith(spec)) return { type: 'blob', id: e.id, content: c.tree[prefix + e.name] };
            if (e.type === 'tree') { const hit = walk(prefix + e.name + '/'); if (hit) return hit; }
          }
          return null;
        };
        const hit = walk('');
        if (hit) return hit;
      }
      for (const t of Object.values(s.index)) if (blobId(t).startsWith(spec)) return { type: 'blob', id: blobId(t), content: t }; // git add wrote it
      for (const [oid, t] of Object.entries(s.objects || {})) if (oid.startsWith(spec)) return { type: 'blob', id: oid, content: t };
    }
    fail(`fatal: Not a valid object name ${spec}`);
  }
  // public, read-only: for content checks and the UI
  object(spec) { return this._object(spec); }
  treeId(rev) { return this._treeId(this.tree(this.resolve(rev))); }
  git_cat_file(args) {
    const o = opts(args, { flags: ['t', 'p', 's', 'e'] });
    const spec = o._[0];
    if (!spec || !(o.t || o.p || o.s || o.e)) fail('usage: git cat-file (-t | -s | -e | -p) <object>', 129);
    if (o.e) { if (!(() => { try { this._object(spec); return true; } catch { return false; } })()) this.exitCode = 1; return; }
    const ob = this._object(spec);
    if (o.t) { this.p(ob.type); return; }
    const s = this.s;
    if (ob.type === 'blob') { if (o.s) this.p(String(ob.content.length)); else if (ob.content) this.p(ob.content.replace(/\n$/, '')); return; }
    if (ob.type === 'tree') {
      const ents = this._treeEntries(ob.tree, ob.prefix);
      if (o.s) { this.p(String(ents.length * 28)); return; }
      for (const e of ents) this.p(`${e.mode} ${e.type} ${e.id}\t${e.name}`);
      return;
    }
    if (ob.type === 'tag') {
      const t = s.tags[ob.tag];
      this.p(`object ${t.id}\ntype commit\ntag ${ob.tag}\ntagger you <you@example.com>\n\n${t.msg}`);
      return;
    }
    const c = s.commits[ob.id];
    const who = (a) => `${a} <${a === 'GitHub' ? 'noreply@github.com' : a + '@example.com'}> ${fakeTime(c.n)} +0000`;
    const lines = [`tree ${this._treeId(c.tree)}`, ...c.parents.map((p) => `parent ${p}`), `author ${who(c.author)}`, `committer ${who(c.committer || c.author)}`, '', ...c.msg.split('\n')];
    if (o.s) { this.p(String(lines.join('\n').length)); return; }
    this.p(lines.join('\n'));
  }
  git_ls_tree(args) {
    const o = opts(args, { flags: ['r', 'name-only'] });
    const [spec, path] = o._;
    if (!spec) fail('usage: git ls-tree [-r] [--name-only] <tree-ish> [<path>]', 129);
    const ob = this._object(spec.includes(':') || /\^\{tree\}$/.test(spec) ? spec : `${spec}^{tree}`);
    if (ob.type !== 'tree') fail(`fatal: not a tree object`);
    const walk = (prefix) => {
      for (const e of this._treeEntries(ob.tree, prefix)) {
        if (path && !(prefix + e.name).startsWith(path.replace(/\/$/, ''))) continue;
        if (o.r && e.type === 'tree') { walk(prefix + e.name + '/'); continue; }
        const shown = prefix.slice(ob.prefix.length) + e.name;
        this.p(o['name-only'] ? shown : `${e.mode} ${e.type} ${e.id}\t${shown}`);
      }
    };
    walk(ob.prefix);
  }
  git_hash_object(args) {
    const o = opts(args, { flags: ['w', 'stdin'] });
    if (!o._.length) fail('usage: git hash-object [-w] <file>', 129);
    for (const f of o._) {
      if (!(f in this.s.work)) fail(`fatal: could not open '${f}' for reading: No such file or directory`);
      const id = blobId(this.s.work[f]);
      if (o.w) (this.s.objects ||= {})[id] = this.s.work[f];
      this.p(id);
    }
  }
  git_show_ref(args) {
    const o = opts(args, { flags: ['heads', 'branches', 'tags', 'head'] });
    const s = this.s, rows = [];
    const onlyHeads = o.heads || o.branches, onlyTags = o.tags;
    if (o.head && this.headId()) rows.push([this.headId(), 'HEAD']);
    if (!onlyTags) for (const b of keys(s.branches).sort()) rows.push([s.branches[b], `refs/heads/${b}`]);
    if (!onlyTags && !onlyHeads) for (const [full, id] of this._allTracking().sort((a, b) => (a[0] < b[0] ? -1 : 1))) rows.push([id, `refs/remotes/${full}`]);
    if (!onlyHeads) for (const t of keys(s.tags).sort()) rows.push([s.tags[t].msg ? shortHash('tag\0' + t + s.tags[t].id) : s.tags[t].id, `refs/tags/${t}`]);
    const pat = o._[0];
    const shown = pat ? rows.filter(([, r]) => r === pat || r.endsWith('/' + pat)) : rows;
    if (!shown.length) { this.exitCode = 1; return; }
    for (const [id, r] of shown) this.p(`${id} ${r}`);
  }
  git_symbolic_ref(args) {
    const o = opts(args, { flags: ['short', 'q'] });
    if (o._[0] && o._[0] !== 'HEAD') fail(`fatal: ref ${o._[0]} is not a symbolic ref`, 128);
    const b = this.branchName();
    if (!b) fail('fatal: ref HEAD is not a symbolic ref', 128);
    this.p(o.short ? b : `refs/heads/${b}`);
  }

  /* ---------- status ---------- */
  git_status(args) {
    const o = opts(args, { flags: ['short', 's', 'b', 'branch'] });
    const s = this.s;
    const staged = this.stagedChanges(), unstaged = this.unstagedChanges(), untr = this.untracked();
    const confl = keys(s.conflicts).sort();
    const h = this.headTree();
    if (o.short || o.s) {
      for (const p of confl) this.p(`UU ${p}`, 'warn');
      for (const p of union(Object.fromEntries([...staged, ...unstaged].map((p) => [p, 1])))) {
        const x = staged.includes(p) ? (h[p] === undefined ? 'A' : s.index[p] === undefined ? 'D' : 'M') : ' ';
        const y = unstaged.includes(p) ? (s.work[p] === undefined ? 'D' : 'M') : ' ';
        this.p(`${x}${y} ${p}`);
      }
      for (const p of untr) this.p(`?? ${p}`);
      return;
    }
    const b = this.branchName();
    if (b) this.p(`On branch ${b}`);
    else {
      const id = this.headId();
      this.p(id === s.detachedFrom || !s.detachedFrom ? `HEAD detached at ${id}` : `HEAD detached from ${s.detachedFrom}`, 'warn');
    }
    if (s.bisect) this.p(`You are currently bisecting, started from ${s.bisect.startBranch ? `branch '${s.bisect.startBranch}'` : s.bisect.startId}.\n  (use "git bisect reset" to get back to the original branch)`);
    if (s.seq?.kind === 'rebase') {
      this.p(`${s.seq.interactive ? 'interactive rebase' : 'rebase'} in progress; onto ${s.seq.onto}`);
      this.p(`You are currently rebasing${s.seq.branch ? ` branch '${s.seq.branch}'` : ''} on '${s.seq.onto}'.`);
      this.p(confl.length ? '  (fix conflicts and then run "git rebase --continue")' : '  (all conflicts fixed: run "git rebase --continue")');
      this.p('  (use "git rebase --abort" to check out the original branch)');
    } else if (s.seq) {
      this.p(`You are currently ${s.seq.kind === 'revert' ? 'reverting' : 'cherry-picking'} commit ${s.seq.cur?.id || ''}.`);
      this.p(confl.length ? `  (fix conflicts and run "git ${s.seq.kind} --continue")` : `  (all conflicts fixed: run "git ${s.seq.kind} --continue")`);
      this.p(`  (use "git ${s.seq.kind} --abort" to cancel the ${s.seq.kind} operation)`);
    }
    if (s.pendingRebase) this.p('interactive rebase waiting: edit the todo list in the rebase panel (or git rebase --abort)', 'warn');
    const U = this._up(b);
    if (U && !U.tip) this.p(`Your branch is based on '${U.ref}', but the upstream is gone.\n  (use "git branch --unset-upstream" to fixup)`);
    if (U && U.tip && this.headId()) {
      const up = U.ref, tip = U.tip, me = this.headId();
      const [ahead, behind] = this._aheadBehind(me, tip);
      if (!ahead && !behind) this.p(`Your branch is up to date with '${up}'.`);
      else if (ahead && !behind) this.p(`Your branch is ahead of '${up}' by ${plural(ahead, 'commit')}.\n  (use "git push" to publish your local commits)`);
      else if (!ahead) this.p(`Your branch is behind '${up}' by ${plural(behind, 'commit')}, and can be fast-forwarded.\n  (use "git pull" to update your local branch)`);
      else this.p(`Your branch and '${up}' have diverged,\nand have ${ahead} and ${behind} different commits each, respectively.\n  (use "git pull" if you want to integrate the remote branch with yours)`);
    }
    if (!this.headId()) this.p('\nNo commits yet');
    if (s.mergeHead) {
      if (confl.length) this.p('\nYou have unmerged paths.\n  (fix conflicts and run "git commit")\n  (use "git merge --abort" to abort the merge)');
      else this.p('\nAll conflicts fixed but you are still merging.\n  (use "git commit" to conclude merge)');
    }
    if (staged.length) {
      this.p('\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)');
      for (const p of staged) this.p(`\t${h[p] === undefined ? 'new file:  ' : s.index[p] === undefined ? 'deleted:   ' : 'modified:  '} ${p}`, 'add');
    }
    if (confl.length) {
      this.p('\nUnmerged paths:\n  (use "git add <file>..." to mark resolution)');
      for (const p of confl) {
        const c = s.conflicts[p];
        const kind = c.ours == null ? 'deleted by us:' : c.theirs == null ? 'deleted by them:' : c.base == null ? 'both added:   ' : 'both modified:';
        this.p(`\t${kind}  ${p}`, 'del');
      }
    }
    if (unstaged.length) {
      this.p('\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)');
      for (const p of unstaged) this.p(`\t${s.work[p] === undefined ? 'deleted:   ' : 'modified:  '} ${p}`, 'del');
    }
    if (untr.length) {
      this.p('\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)');
      for (const p of untr) this.p(`\t${p}`, 'del');
    }
    if (!staged.length && !unstaged.length && !confl.length) {
      if (untr.length) this.p('\nnothing added to commit but untracked files present (use "git add" to track)');
      else if (!s.mergeHead) this.p('\nnothing to commit, working tree clean');
    } else if (!staged.length && !s.mergeHead && !confl.length) this.p('\nno changes added to commit (use "git add" and/or "git commit -a")');
  }

  /* ---------- add / rm / mv ---------- */
  git_add(args) {
    const o = opts(args, { flags: ['A', 'all', 'u', 'update', 'f', 'force', 'v', 'verbose', 'n', 'dry-run'] });
    const s = this.s;
    let specs = [...o._, ...(o.paths || [])];
    if (o.A || o.all) specs = specs.length ? specs : ['.'];
    if (!specs.length) {
      if (o.u || o.update) specs = ['.'];
      else { this.p('Nothing specified, nothing added.'); this.hint("Maybe you wanted to say 'git add .'?"); return; }
    }
    const updateOnly = o.u || o.update;
    const ignored = [];
    const toDo = new Set();
    for (const spec of specs) {
      const cands = union(s.work, s.index, s.conflicts);
      let hits = this.matchPaths(spec, cands);
      if (updateOnly) hits = hits.filter((p) => this.tracked(p));
      const isExplicit = !/[*?]/.test(spec) && spec !== '.';
      hits = hits.filter((p) => {
        if (this.tracked(p) || o.f || o.force) return true;
        if (this.isIgnored(p)) { if (isExplicit) ignored.push(p); return false; }
        return true;
      });
      if (!hits.length && !ignored.length) fail(`fatal: pathspec '${spec}' did not match any files`);
      hits.forEach((p) => toDo.add(p));
    }
    if (ignored.length) {
      this.p(`The following paths are ignored by one of your .gitignore files:\n${ignored.join('\n')}`, 'warn');
      this.hint('Use -f if you really want to add them.');
      this.exitCode = 1;
    }
    for (const p of toDo) {
      if (p in s.work) s.index[p] = s.work[p]; else delete s.index[p];
      delete s.conflicts[p];
      if (o.v || o.verbose) this.p(`add '${p}'`);
    }
  }
  git_rm(args) {
    const o = opts(args, { flags: ['cached', 'r', 'f', 'force', 'q'] });
    const s = this.s;
    const specs = [...o._, ...(o.paths || [])];
    if (!specs.length) fail('usage: git rm [--cached] <file>...', 129);
    const all = [];
    for (const spec of specs) {
      const hits = this.matchPaths(spec, union(s.index, s.conflicts));
      if (!hits.length) fail(`fatal: pathspec '${spec}' did not match any files`);
      if (hits.some((h) => h !== spec.replace(/\/$/, '')) && !o.r && !/[*?]/.test(spec) && spec !== '.') fail(`fatal: not removing '${spec}' recursively without -r`);
      all.push(...hits);
    }
    for (const p of all) {
      delete s.index[p]; delete s.conflicts[p];
      if (!o.cached) delete s.work[p];
      this.p(`rm '${p}'`);
    }
  }
  git_mv(args) {
    const [a, b] = opts(args, { flags: ['f'] })._;
    const s = this.s;
    if (!a || !b) fail('usage: git mv <source> <destination>', 129);
    if (!(a in s.index)) fail(`fatal: not under version control, source=${a}, destination=${b}`);
    s.work[b] = s.work[a]; delete s.work[a];
    s.index[b] = s.index[a]; delete s.index[a];
  }
  git_clean(args) {
    const o = opts(args, { flags: ['f', 'n', 'd', 'x', 'force', 'dry-run'] });
    const dry = o.n || o['dry-run'];
    if (!o.f && !o.force && !dry) fail('fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given; refusing to clean');
    const list = o.x ? keys(this.s.work).filter((p) => !this.tracked(p)) : this.untracked();
    for (const p of list) { this.p(`${dry ? 'Would remove' : 'Removing'} ${p}`); if (!dry) delete this.s.work[p]; }
  }

  /* ---------- commit ---------- */
  git_commit(args) {
    const o = opts(args, { flags: ['a', 'all', 'amend', 'no-edit', 'allow-empty', 'q', 'v', 'continue'], values: ['m', 'message'] });
    const s = this.s;
    const msgs = [...(o.m || []), ...(o.message || [])];
    if (keys(s.conflicts).length)
      fail("error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.");
    if (o.a || o.all) for (const p of keys(s.index)) { if (p in s.work) s.index[p] = s.work[p]; else delete s.index[p]; }
    const head = this.headId();
    let parents, msg, author = 'you';
    if (o.amend) {
      if (!head) fail('fatal: You have nothing to amend.');
      if (s.mergeHead) fail('fatal: You are in the middle of a merge -- cannot amend.');
      const c = s.commits[head];
      parents = c.parents; msg = msgs.length ? msgs.join('\n\n') : c.msg; author = c.author;
    } else {
      parents = head ? [head] : [];
      if (s.mergeHead) parents.push(s.mergeHead);
      msg = msgs.length ? msgs.join('\n\n') : s.mergeHead ? s.mergeMsg : s.seq?.cur && !s.seq.curDone ? this._seqMsg(s.seq.cur) : null;
      if (s.seq?.cur && !s.seq.curDone && !msgs.length) author = s.commits[s.seq.cur.id]?.author || 'you';
      if (!s.mergeHead && !o['allow-empty'] && treeEq(s.index, this.headTree())) {
        this.p(this.branchName() ? `On branch ${this.branchName()}` : `HEAD detached at ${head}`);
        if (this.unstagedChanges().length) this.p('Changes not staged for commit:\n' + this.unstagedChanges().map((p) => `\tmodified:   ${p}`).join('\n') + '\n\nno changes added to commit (use "git add" and/or "git commit -a")', 'warn');
        else if (this.untracked().length) this.p('Untracked files:\n' + this.untracked().map((p) => '\t' + p).join('\n') + '\n\nnothing added to commit but untracked files present (use "git add" to track)', 'warn');
        else this.p('nothing to commit, working tree clean');
        this.exitCode = 1;
        return;
      }
      if (!msg) fail('error: no commit message given.\nhint: this terminal has no editor; use git commit -m "message"');
    }
    const id = this._mkCommit(parents, s.index, msg, author);
    const kind = o.amend ? 'commit (amend)' : !head ? 'commit (initial)' : s.mergeHead ? 'commit (merge)' : 'commit';
    this._setHead(id, `${kind}: ${firstLine(msg)}`);
    if (s.mergeHead) { s.mergeHead = null; s.mergeMsg = null; }
    if (s.seq?.cur) s.seq.curDone = true;
    const label = this.branchName() || 'detached HEAD';
    this.p(`[${label}${!head ? ' (root-commit)' : ''} ${id}] ${firstLine(msg)}`);
    const changed = union(this.tree(parents[0]), s.index).filter((p) => this.tree(parents[0])[p] !== s.index[p]).length;
    if (!o.q) this.p(` ${plural(changed, 'file')} changed`);
  }

  /* ---------- log / show / diff / reflog / blame ---------- */
  _decor(id) {
    const s = this.s, d = [];
    const hb = this.branchName();
    if (!hb && this.headId() === id) d.push('HEAD');
    for (const [b, v] of Object.entries(s.branches)) if (v === id) d.push(b === hb ? `HEAD -> ${b}` : b);
    for (const [full, v] of this._allTracking()) if (v === id) d.push(full);
    for (const [t, v] of Object.entries(s.tags)) if (v.id === id) d.push(`tag: ${t}`);
    d.sort((a, b) => (b.startsWith('HEAD') ? 1 : 0) - (a.startsWith('HEAD') ? 1 : 0));
    return d.length ? ` (${d.join(', ')})` : '';
  }
  git_log(args) {
    const o = opts(args, { flags: ['oneline', 'graph', 'all', 'decorate', 'reverse', 'first-parent', 'p', 'patch', 'stat', 'merges', 'no-merges'], values: ['n', 'max-count', 'grep', 'author', 'S'] });
    const s = this.s;
    let max = Infinity;
    if (o.n || o['max-count']) max = +last(o.n || o['max-count']);
    const pos = [], neg = [];
    let paths = o.paths;
    for (const a of o._) {
      if (/^-\d+$/.test(a)) { max = +a.slice(1); continue; }
      if (a.includes('...')) {
        const [x, y] = a.split('...');
        const X = this.resolve(x || 'HEAD'), Y = this.resolve(y || 'HEAD'), mb = this.mergeBase(X, Y);
        pos.push(X, Y); if (mb) neg.push(mb);
      } else if (a.includes('..')) {
        const [x, y] = a.split('..');
        neg.push(this.resolve(x || 'HEAD')); pos.push(this.resolve(y || 'HEAD'));
      } else if (a.startsWith('^')) neg.push(this.resolve(a.slice(1)));
      else {
        const id = this.tryResolve(a);
        if (id) pos.push(id);
        else if (a in s.work || a in s.index || a in this.headTree()) (paths ||= []).push(a);
        else this.resolve(a);
      }
    }
    if (o.all) pos.push(...this.allRefTips());
    if (!pos.length) {
      const h = this.headId();
      if (!h) fail(`fatal: your current branch '${this.branchName()}' does not have any commits yet`);
      pos.push(h);
    }
    let set;
    if (o['first-parent']) {
      set = new Set();
      for (let id of pos) while (id) { set.add(id); id = s.commits[id].parents[0]; }
    } else set = this.ancestorsOf(pos);
    const ex = this.ancestorsOf(neg);
    let ids = [...set].filter((c) => !ex.has(c)).sort((a, b) => s.commits[b].n - s.commits[a].n);
    const visible = new Set(ids);
    if (paths) ids = ids.filter((id) => { const c = s.commits[id], pt = this.tree(c.parents[0]); return paths.some((p) => this.matchPaths(p, union(c.tree, pt)).some((q) => c.tree[q] !== pt[q])); });
    if (o.grep) { const g = last(o.grep).toLowerCase(); ids = ids.filter((id) => s.commits[id].msg.toLowerCase().includes(g)); }
    if (o.author) { const g = last(o.author).toLowerCase(); ids = ids.filter((id) => s.commits[id].author.toLowerCase().includes(g)); }
    if (o.S) {
      const needle = last(o.S);
      const count = (t) => Object.values(t).reduce((n, txt) => n + txt.split(needle).length - 1, 0);
      ids = ids.filter((id) => { const c = s.commits[id]; return count(c.tree) !== count(this.tree(c.parents[0])); });
    }
    if (o.merges) ids = ids.filter((id) => s.commits[id].parents.length > 1);
    if (o['no-merges']) ids = ids.filter((id) => s.commits[id].parents.length < 2);
    ids = ids.slice(0, max);
    if (o.reverse) ids.reverse();
    const fmt = (id) => {
      const c = s.commits[id];
      if (o.oneline) return [`${id}${this._decor(id)} ${firstLine(c.msg)}`];
      const lines = [`commit ${id}${this._decor(id)}`];
      if (c.parents.length > 1) lines.push(`Merge: ${c.parents.join(' ')}`);
      lines.push(`Author: ${c.author}`, '');
      for (const l of c.msg.split('\n')) lines.push('    ' + l);
      if (o.p || o.patch) lines.push('', ...this._commitDiff(id));
      if (o.stat) lines.push('', ...this._stat(this.tree(c.parents[0]), c.tree));
      lines.push('');
      return lines;
    };
    if (o.graph && !paths && !o.reverse) this._graphLog(ids, visible, fmt);
    else for (const id of ids) for (const l of fmt(id)) this.p(l, l.startsWith('commit ') ? 'commit' : '');
  }
  // git log --graph implies --topo-order: children before parents, one line of history at a time.
  _topo(ids) {
    const s = this.s, set = new Set(ids), indeg = {};
    for (const id of ids) indeg[id] = 0;
    for (const id of ids) for (const p of s.commits[id].parents) if (set.has(p)) indeg[p]++;
    const stack = ids.filter((id) => !indeg[id]).sort((a, b) => s.commits[a].n - s.commits[b].n);
    const out = [];
    while (stack.length) {
      const c = stack.pop();
      out.push(c);
      for (const p of s.commits[c].parents) if (set.has(p) && --indeg[p] === 0) stack.push(p);
    }
    return out;
  }
  _graphLog(ids, visible, fmt) {
    const s = this.s;
    let lanes = [];
    for (const id of this._topo(ids)) {
      let col = lanes.indexOf(id);
      if (col < 0) { col = lanes.length; lanes.push(id); }
      const ps = s.commits[id].parents.filter((p) => visible.has(p));
      fmt(id).forEach((l, i) => {
        const cells = lanes.map((x, k) => (k === col ? (i === 0 ? '*' : ps.length ? '|' : ' ') : '|'));
        this.p((cells.join(' ') + ' ' + l).replace(/\s+$/, ''), i === 0 ? 'commit' : '');
      });
      if (!ps.length) { lanes.splice(col, 1); continue; }
      lanes[col] = ps[0];
      for (const p of ps.slice(1)) {
        if (lanes.includes(p)) continue;
        lanes.splice(col + 1, 0, p);
        let row = '';
        for (let k = 0; k < lanes.length; k++) row = k === col + 1 ? row.trimEnd() + '\\ ' : row + '| ';
        this.p(row.trimEnd());
      }
      for (let i = 0; i < lanes.length; i++) {
        const j = lanes.indexOf(lanes[i], i + 1);
        if (j < 0) continue;
        let row = '';
        for (let k = 0; k < lanes.length; k++) row = k === j ? row.trimEnd() + '/ ' : row + '| ';
        this.p(row.trimEnd());
        lanes.splice(j, 1);
        i--;
      }
    }
  }
  _stat(a, b) {
    const rows = [];
    let ins = 0, del = 0;
    for (const p of union(a, b)) {
      if (a[p] === b[p]) continue;
      const ops = diffOps(a[p] || '', b[p] || '');
      const pl = ops.filter((x) => x.t === '+').length, mi = ops.filter((x) => x.t === '-').length;
      ins += pl; del += mi;
      rows.push([p, pl, mi]);
    }
    const w = Math.max(0, ...rows.map((r) => r[0].length));
    const out = rows.map(([p, pl, mi]) => ` ${p.padEnd(w)} | ${pl + mi} ${'+'.repeat(Math.min(pl, 20))}${'-'.repeat(Math.min(mi, 20))}`);
    let sum = ` ${plural(rows.length, 'file')} changed`;
    if (ins || !del) sum += `, ${plural(ins, 'insertion')}(+)`;
    if (del) sum += `, ${plural(del, 'deletion')}(-)`;
    out.push(sum);
    return out;
  }
  _treeDiff(a, b, paths, { nameOnly = false } = {}) {
    const out = [];
    for (const p of union(a, b)) {
      if (a[p] === b[p]) continue;
      if (paths && !paths.some((sp) => this.matchPaths(sp, [p]).length)) continue;
      if (nameOnly) out.push(p); else out.push(...unifiedDiff(p, a[p], b[p]));
    }
    return out;
  }
  _commitDiff(id) { const c = this.s.commits[id]; return this._treeDiff(this.tree(c.parents[0]), c.tree); }
  git_diff(args) {
    const o = opts(args, { flags: ['staged', 'cached', 'stat', 'name-only'] });
    const s = this.s;
    const revs = [];
    let paths = o.paths;
    for (const a of o._) {
      if (a.includes('..')) { const [x, y] = a.split(/\.\.\.?/); revs.push(this.resolve(x || 'HEAD'), this.resolve(y || 'HEAD')); continue; }
      const id = this.tryResolve(a);
      if (id) revs.push(id);
      else if (a in s.work || a in s.index || a in this.headTree()) (paths ||= []).push(a);
      else this.resolve(a);
    }
    let A, B;
    if (o.staged || o.cached) { A = revs[0] ? this.tree(revs[0]) : this.headTree(); B = s.index; }
    else if (revs.length >= 2) { A = this.tree(revs[0]); B = this.tree(revs[1]); }
    else if (revs.length === 1) {
      A = this.tree(revs[0]);
      B = {}; for (const p of union(s.index, A)) if (p in s.work && (this.tracked(p) || p in A)) B[p] = s.work[p];
    } else {
      A = {}; B = {};
      for (const p of keys(s.index)) { A[p] = s.index[p]; if (p in s.work) B[p] = s.work[p]; }
      for (const p of keys(s.conflicts)) { B[p] = s.work[p]; A[p] = s.conflicts[p].ours ?? undefined; if (A[p] === undefined) delete A[p]; if (B[p] === undefined) delete B[p]; }
    }
    const lines = o.stat ? this._stat(A, B) : this._treeDiff(A, B, paths, { nameOnly: o['name-only'] });
    if (o.stat && lines.length === 1 && lines[0].includes(' 0 files')) return;
    for (const l of lines) this.p(l);
  }
  git_show(args) {
    const o = opts(args, { flags: ['stat', 'name-only', 'oneline', 's', 'no-patch'] });
    const s = this.s;
    const targets = o._.length ? o._ : ['HEAD'];
    for (const t of targets) {
      const colon = t.indexOf(':');
      if (colon > 0 && !t.startsWith(':')) {
        const id = this.resolve(t.slice(0, colon)), path = t.slice(colon + 1);
        const tr = this.tree(id);
        if (!(path in tr)) fail(`fatal: path '${path}' does not exist in '${t.slice(0, colon)}'`);
        this.p(tr[path].replace(/\n$/, ''));
        continue;
      }
      if (t in s.tags && s.tags[t].msg) this.p(`tag ${t}\nTagger: you\n\n${s.tags[t].msg}\n`);
      const id = this.resolve(t), c = s.commits[id];
      if (o.oneline) this.p(`${id}${this._decor(id)} ${firstLine(c.msg)}`, 'commit');
      else {
        this.p(`commit ${id}${this._decor(id)}`, 'commit');
        if (c.parents.length > 1) this.p(`Merge: ${c.parents.join(' ')}`);
        this.p(`Author: ${c.author}\n`);
        for (const l of c.msg.split('\n')) this.p('    ' + l);
        this.p('');
      }
      if (o.s || o['no-patch']) continue;
      if (o.stat) { for (const l of this._stat(this.tree(c.parents[0]), c.tree)) this.p(l); continue; }
      if (o['name-only']) { for (const l of this._treeDiff(this.tree(c.parents[0]), c.tree, null, { nameOnly: true })) this.p(l); continue; }
      if (c.parents.length < 2) for (const l of this._commitDiff(id)) this.p(l);
    }
  }
  git_reflog(args) {
    const o = opts(args, { flags: ['all'], values: ['n'] });
    let a = o._;
    if (a[0] === 'show') a = a.slice(1);
    if (a[0] === 'expire' || a[0] === 'delete') fail('error: this playground keeps its reflog (that is the point!)', 1);
    const ref = a[0] && a[0] !== 'HEAD' ? a[0].replace(/^refs\/heads\//, '') : 'HEAD';
    const log = this.s.reflog[ref];
    if (!log) fail(`fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`);
    const max = o.n ? +last(o.n) : Infinity;
    log.slice(0, max).forEach((e, i) => this.p(`${e.id}${i === 0 ? this._decor(e.id) : ''} ${ref}@{${i}}: ${e.msg}`));
  }
  git_blame(args) {
    const o = opts(args, {});
    const s = this.s;
    const file = o.paths?.[0] || o._[o._.length - 1];
    if (!file) fail('usage: git blame [<rev>] <file>', 129);
    const start = o._.length > 1 ? this.resolve(o._[0]) : this.headId();
    if (!start || !(file in this.tree(start))) fail(`fatal: no such path '${file}' in ${o._.length > 1 ? o._[0] : 'HEAD'}`);
    const lines = splitLines(this.tree(start)[file]);
    const owner = new Array(lines.length).fill(null);
    const idx = lines.map((_, i) => i);
    let id = start;
    while (id) {
      const c = s.commits[id], par = c.parents[0];
      const pt = par ? s.commits[par].tree[file] : undefined;
      if (pt === undefined) { owner.forEach((v, i) => { if (v === null) owner[i] = id; }); break; }
      const m = lcsMatch(splitLines(c.tree[file]), splitLines(pt));
      for (let i = 0; i < lines.length; i++) {
        if (owner[i] !== null) continue;
        if (m[idx[i]] === -1) owner[i] = id; else idx[i] = m[idx[i]];
      }
      if (owner.every((v) => v !== null)) break;
      id = par;
    }
    lines.forEach((l, i) => this.p(`${owner[i]} (${s.commits[owner[i]].author.padEnd(8)} ${String(i + 1).padStart(2)}) ${l}`));
  }

  /* ---------- branches / tags ---------- */
  _validName(name) {
    if (!name || /[\s~^:?*[\\]|\.\.|^[-.]|\/$|\.lock$|@\{/.test(name) || name === 'HEAD') fail(`fatal: '${name}' is not a valid branch name`);
  }
  git_branch(args) {
    const o = opts(args, { flags: ['d', 'D', 'delete', 'm', 'M', 'move', 'f', 'force', 'a', 'all', 'r', 'remotes', 'v', 'vv', 'list', 'merged', 'no-merged', 'show-current', 'c', 'unset-upstream'], values: ['u', 'set-upstream-to'] });
    const s = this.s;
    const cur = this.branchName();
    if (o['show-current']) { if (cur) this.p(cur); return; }
    if (o.u || o['set-upstream-to']) {
      let want = last(o.u || o['set-upstream-to']);
      if (!this.remoteNames().some((n) => want.startsWith(n + '/'))) want = `${REMOTE}/${want}`;
      const b = o._[0] || cur;
      const t = this._trackingRef(want);
      if (!t) fail(`error: the requested upstream branch '${want}' does not exist\nhint: run "git fetch" first if it exists on the remote`);
      this._setUp(b, t.remote, t.branch);
      this.p(`branch '${b}' set up to track '${want}'.`);
      return;
    }
    if (o['unset-upstream']) {
      const b = o._[0] || cur;
      if (!s.upstream[b]) fail(`fatal: branch '${b}' has no upstream information`);
      this._clearUp(b);
      return;
    }
    if (o.d || o.D || o.delete) {
      if (!o._.length) fail('fatal: branch name required');
      for (const b of o._) {
        if (o.r || o.remotes) { const t = this._trackingRef(b); if (!t) fail(`error: remote-tracking branch '${b}' not found`); this.p(`Deleted remote-tracking branch ${b} (was ${t.id}).`); delete this._remote(t.remote).T[t.branch]; continue; }
        if (!(b in s.branches)) fail(`error: branch '${b}' not found`);
        if (b === cur) fail(`error: cannot delete branch '${b}' used by worktree at '/home/you/project'`);
        const tip = s.branches[b];
        const U = this._up(b);
        const into = U?.tip || this.headId();
        if (!o.D && !(o.d && o.f) && !this.isAncestor(tip, into) && !this.isAncestor(tip, this.headId()))
          fail(`error: the branch '${b}' is not fully merged.\nhint: If you are sure you want to delete it, run 'git branch -D ${b}'`, 1);
        if (!o.D && U?.tip && this.isAncestor(tip, U.tip) && !this.isAncestor(tip, this.headId()))
          this.p(`warning: deleting branch '${b}' that has been merged to\n         'refs/remotes/${U.ref}', but not yet merged to HEAD`, 'warn');
        delete s.branches[b]; this._clearUp(b); delete s.reflog[b];
        this.p(`Deleted branch ${b} (was ${tip}).`);
      }
      return;
    }
    if (o.m || o.M || o.move) {
      let [a, b] = o._;
      if (b === undefined) { b = a; a = cur; }
      if (!a || !(a in s.branches) && !(a === cur)) fail(`error: refname refs/heads/${a} not found\nfatal: Branch rename failed`);
      this._validName(b);
      if (b in s.branches && !o.M) fail(`fatal: a branch named '${b}' already exists`);
      const id = s.branches[a];
      delete s.branches[a];
      if (id) s.branches[b] = id;
      if (s.reflog[a]) { s.reflog[b] = s.reflog[a]; delete s.reflog[a]; }
      const U = this._up(a);
      if (U) { this._clearUp(a); this._setUp(b, U.remote, U.branch); }
      if (cur === a) s.head = { branch: b };
      return;
    }
    if (o._.length && !o.list) {
      const [name, start] = o._;
      this._validName(name);
      if (name in s.branches && !(o.f || o.force)) fail(`fatal: a branch named '${name}' already exists`);
      if (name === cur && (o.f || o.force)) fail(`fatal: cannot force update the branch '${name}' used by worktree at '/home/you/project'`);
      const id = this.resolve(start || 'HEAD');
      s.branches[name] = id;
      this._log(name, id, `branch: Created from ${start || 'HEAD'}`);
      const t = start && this._trackingRef(start);
      if (t) { this._setUp(name, t.remote, t.branch); this.p(`branch '${name}' set up to track '${start}'.`); }
      return;
    }
    const vv = o.vv || args.includes('-vv') || args.filter((x) => x === '-v' || x === '--verbose').length > 1;
    const verbose = o.v || vv;
    const line = (mark, name, id, extra = '') => this.p(`${mark} ${name}${verbose ? `  ${id}${extra} ${firstLine(s.commits[id].msg)}` : ''}`, mark === '*' ? 'add' : '');
    let names = keys(s.branches).sort();
    if (o.merged) names = names.filter((b) => this.isAncestor(s.branches[b], this.headId()));
    if (o['no-merged']) names = names.filter((b) => !this.isAncestor(s.branches[b], this.headId()));
    if (!(o.r || o.remotes)) {
      if (!cur) line('*', `(HEAD detached at ${this.headId()})`, this.headId());
      for (const b of names) {
        let extra = '';
        const U = vv && this._up(b);
        if (U) {
          const [ah, be] = U.tip ? this._aheadBehind(s.branches[b], U.tip) : [0, 0];
          const st = !U.tip ? ': gone' : ah && be ? `: ahead ${ah}, behind ${be}` : ah ? `: ahead ${ah}` : be ? `: behind ${be}` : '';
          extra = ` [${U.ref}${st}]`;
        }
        line(b === cur ? '*' : ' ', b, s.branches[b], extra);
      }
    }
    if (o.r || o.remotes || o.a || o.all) for (const [full] of this._allTracking().sort((x, y) => (x[0] < y[0] ? -1 : 1))) this.p(`  ${o.a || o.all ? 'remotes/' : ''}${full}`, 'remote');
  }
  git_tag(args) {
    const o = opts(args, { flags: ['d', 'delete', 'a', 'annotate', 'l', 'list', 'f', 'force', 'n'], values: ['m', 'message'] });
    const s = this.s;
    if (o.d || o.delete) {
      for (const t of o._) {
        if (!(t in s.tags)) fail(`error: tag '${t}' not found.`);
        this.p(`Deleted tag '${t}' (was ${s.tags[t].id})`);
        delete s.tags[t];
      }
      return;
    }
    if (!o._.length || o.l || o.list) {
      for (const t of keys(s.tags).sort()) this.p(o.n && s.tags[t].msg ? `${t.padEnd(14)} ${firstLine(s.tags[t].msg)}` : t);
      return;
    }
    const [name, rev] = o._;
    this._validName(name);
    if (name in s.tags && !(o.f || o.force)) fail(`fatal: tag '${name}' already exists`);
    const msg = (o.m || o.message) ? [...(o.m || []), ...(o.message || [])].join('\n\n') : null;
    if ((o.a || o.annotate) && !msg) fail('fatal: no tag message given.\nhint: this terminal has no editor; use git tag -a <name> -m "message"');
    s.tags[name] = { id: this.resolve(rev || 'HEAD'), msg };
  }

  /* ---------- switch / checkout ---------- */
  _switchBranch(name, { create = false, force = false, start = null, track = null } = {}) {
    const s = this.s;
    const fromLabel = this.branchName() || this.headId();
    if (create) {
      this._validName(name);
      if (name in s.branches && create !== 'force') fail(`fatal: a branch named '${name}' already exists`);
      const id = start ? this.resolve(start) : this.headId();
      if (id && id !== this.headId()) this._checkoutTree(id, { force });
      this._leaveDetached(id);
      if (id) { s.branches[name] = id; this._log(name, id, `branch: Created from ${start || 'HEAD'}`); }
      s.prevRef = fromLabel;
      s.head = { branch: name };
      s.detachedFrom = null;
      if (id) this._log('HEAD', id, `checkout: moving from ${fromLabel} to ${name}`);
      const t = start && this._trackingRef(track || start);
      if (t) { this._setUp(name, t.remote, t.branch); this.p(`branch '${name}' set up to track '${t.remote}/${t.branch}'.`); }
      this.p(`Switched to a new branch '${name}'`);
      return;
    }
    if (name === this.branchName()) { this.p(`Already on '${name}'`); return; }
    const id = s.branches[name];
    this._checkoutTree(id, { force });
    this._leaveDetached(id);
    s.prevRef = fromLabel;
    s.head = { branch: name };
    s.detachedFrom = null;
    this._log('HEAD', id, `checkout: moving from ${fromLabel} to ${name}`);
    this.p(`Switched to branch '${name}'`);
    const U = this._up(name);
    if (U && !U.tip) this.p(`Your branch is based on '${U.ref}', but the upstream is gone.`);
    if (U && U.tip) {
      const [ahead, behind] = this._aheadBehind(id, U.tip);
      const up = U.ref;
      if (!ahead && !behind) this.p(`Your branch is up to date with '${up}'.`);
      else if (!behind) this.p(`Your branch is ahead of '${up}' by ${plural(ahead, 'commit')}.`);
      else if (!ahead) this.p(`Your branch is behind '${up}' by ${plural(behind, 'commit')}, and can be fast-forwarded.`);
      else this.p(`Your branch and '${up}' have diverged.`);
    }
  }
  _leaveDetached(newId) {
    const s = this.s;
    if (s.head.branch) return;
    const old = s.head.detached;
    if (!old) return;
    const others = this.ancestorsOf([...Object.values(s.branches), ...Object.values(s.tags).map((t) => t.id), ...this._allTracking().map(([, id]) => id), newId]);
    const lost = [...this.ancestors(old)].filter((c) => !others.has(c)).sort((a, b) => s.commits[b].n - s.commits[a].n);
    if (lost.length) {
      this.p(`Warning: you are leaving ${plural(lost.length, 'commit')} behind, not connected to\nany of your branches:\n\n${lost.slice(0, 4).map((c) => '  ' + this._describe(c)).join('\n')}\n`, 'warn');
      this.hint(`If you want to keep them by creating a new branch, this may be a good time\nto do so with:\n\n git branch <new-branch-name> ${old}\n`);
    }
  }
  _detach(id, label) {
    const s = this.s;
    const fromLabel = this.branchName() || this.headId();
    this._checkoutTree(id);
    this._leaveDetached(id);
    s.prevRef = fromLabel;
    s.head = { detached: id };
    s.detachedFrom = id;
    this._log('HEAD', id, `checkout: moving from ${fromLabel} to ${label}`);
    this.p(`Note: switching to '${label}'.\n\nYou are in 'detached HEAD' state. You can look around and make commits,\nbut they will not belong to any branch. To keep them, create a branch:\n\n  git switch -c <new-branch-name>\n`, 'warn');
    this.p(`HEAD is now at ${this._describe(id)}`);
  }
  // `git switch reviews` with no local reviews: the one remote that has it ('origin/reviews'), or null.
  // Two remotes with the same branch name is ambiguous, as in real git (no checkout.defaultRemote here).
  _guessRemote(name) {
    const hits = this.remoteNames().filter((n) => name in this._remote(n).T);
    if (hits.length > 1) fail(`fatal: '${name}' matched multiple (${hits.length}) remote tracking branches: ${hits.map((n) => `${n}/${name}`).join(', ')}\nhint: say which one: git switch -c ${name} --track ${hits[0]}/${name}`);
    return hits.length ? `${hits[0]}/${name}` : null;
  }
  git_switch(args) {
    const o = opts(args, { flags: ['detach', 'd', 'f', 'force', 'discard-changes'], values: ['c', 'create', 'C', 'force-create', 't', 'track'] });
    const s = this.s;
    const force = o.f || o.force || o['discard-changes'];
    if (keys(s.conflicts).length && !force) fail('fatal: cannot switch branch while merging\nhint: finish or abort the merge first', 1);
    const track = last(o.t || o.track);
    let newName = last(o.c || o.create || o.C || o['force-create']);
    if (!newName && track) { const t = this._trackingRef(track); if (!t) fail(`fatal: invalid reference: ${track}`); newName = t.branch; }
    if (newName) return this._switchBranch(newName, { create: (o.C || o['force-create']) ? 'force' : true, force, start: o._[0] || track || null });
    let target = o._[0];
    if (!target) fail('fatal: missing branch or commit argument', 128);
    if (target === '-') { target = s.prevRef; if (!target) fail('fatal: no previous branch'); }
    if (o.detach || o.d) return this._detach(this.resolve(target), target);
    if (target in s.branches) return this._switchBranch(target, { force });
    const guess = this._guessRemote(target);
    if (guess) return this._switchBranch(target, { create: true, force, start: guess, track: null });
    const tr = this._trackingRef(target);
    if (tr) fail(`fatal: a branch is expected, got remote branch '${target}'\nhint: to make a local branch from it: git switch ${tr.branch}`);
    if (this.tryResolve(target)) fail(`fatal: a branch is expected, got commit '${target}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.`);
    fail(`fatal: invalid reference: ${target}`);
  }
  git_checkout(args) {
    const o = opts(args, { flags: ['detach', 'f', 'force', 'ours', 'theirs', 'q'], values: ['b', 'B', 't', 'track'] });
    const s = this.s;
    const force = o.f || o.force;
    if (o.ours || o.theirs) {
      const files = o.paths || o._;
      for (const p of files) {
        const c = s.conflicts[p];
        if (!c) fail(`error: path '${p}' does not have ${o.ours ? 'our' : 'their'} version`);
        const v = o.ours ? c.ours : c.theirs;
        if (v == null) delete s.work[p]; else s.work[p] = v;
      }
      return;
    }
    const nb = last(o.b) || last(o.B);
    if (nb) return this._switchBranch(nb, { create: o.B ? 'force' : true, force, start: o._[0] || null });
    if (o.paths) {
      const src = o._[0] ? this.tree(this.resolve(o._[0])) : null;
      for (const spec of o.paths) {
        const hits = this.matchPaths(spec, union(src || s.index, src ? {} : {}));
        if (!hits.length) fail(`error: pathspec '${spec}' did not match any file(s) known to git`);
        for (const p of hits) {
          if (!src && p in s.conflicts) fail(`error: path '${p}' is unmerged`);
          if (src) { s.index[p] = src[p]; s.work[p] = src[p]; } else s.work[p] = s.index[p];
        }
      }
      if (src) this.p(`Updated ${plural(o.paths.length, 'path')} from ${o._[0]}`);
      return;
    }
    let target = o._[0];
    if (!target) fail('error: you must specify a branch, commit or file to check out');
    if (target === '-') { target = s.prevRef; if (!target) fail('error: no previous branch'); }
    if (keys(s.conflicts).length && !force) fail('error: you need to resolve your current index first', 1);
    if (o._.length === 1) {
      if (target in s.branches) return this._switchBranch(target, { force });
      const guess = !o.detach && this._guessRemote(target);
      if (guess) return this._switchBranch(target, { create: true, force, start: guess });
      const id = this.tryResolve(target);
      if (id) { if (force) this._checkoutTree(id, { force: true }); return this._detach(id, target); }
    }
    // treat as paths: git checkout file1 file2
    for (const spec of o._) {
      const hits = this.matchPaths(spec, keys(s.index));
      if (!hits.length) fail(`error: pathspec '${spec}' did not match any file(s) known to git`);
      for (const p of hits) s.work[p] = s.index[p];
    }
    this.p(`Updated ${plural(o._.length, 'path')} from the index`);
  }
  git_restore(args) {
    const o = opts(args, { flags: ['staged', 'S', 'worktree', 'W', 'ours', 'theirs'], values: ['source', 's'] });
    const s = this.s;
    const specs = [...o._, ...(o.paths || [])];
    if (!specs.length) fail('fatal: you must specify path(s) to restore');
    const staged = o.staged || o.S, worktree = o.worktree || o.W || !staged;
    const srcRev = last(o.source || o.s);
    const srcTree = srcRev ? this.tree(this.resolve(srcRev)) : null;
    for (const spec of specs) {
      const cands = union(s.index, this.headTree(), s.work, srcTree || {});
      const hits = this.matchPaths(spec, cands).filter((p) => this.tracked(p) || p in this.headTree() || (srcTree && p in srcTree));
      if (!hits.length) fail(`error: pathspec '${spec}' did not match any file(s) known to git`);
      for (const p of hits) {
        if (o.ours || o.theirs) {
          const c = s.conflicts[p];
          if (!c) fail(`error: path '${p}' does not have ${o.ours ? 'our' : 'their'} version`);
          const v = o.ours ? c.ours : c.theirs;
          if (v == null) delete s.work[p]; else s.work[p] = v;
          continue;
        }
        if (staged) {
          const t = srcTree || this.headTree();
          if (p in t) s.index[p] = t[p]; else delete s.index[p];
          delete s.conflicts[p];
        }
        if (worktree) {
          if (!staged && p in s.conflicts) fail(`error: path '${p}' is unmerged`);
          const t = srcTree || (staged ? this.headTree() : s.index);
          if (p in t) s.work[p] = t[p]; else if (this.tracked(p) || srcTree) delete s.work[p];
        }
      }
    }
  }

  /* ---------- reset / revert ---------- */
  git_reset(args) {
    const o = opts(args, { flags: ['soft', 'mixed', 'hard', 'q', 'keep', 'merge'] });
    const s = this.s;
    if (o.keep || o.merge) fail('error: this playground supports --soft, --mixed and --hard', 129);
    let rev = null, paths = o.paths ? [...o.paths] : null;
    for (const a of o._) {
      if (!rev && !paths && this.tryResolve(a)) rev = a;
      else if (a in s.index || a in this.headTree() || a in s.work || a === '.') (paths ||= []).push(a);
      else this.resolve(a);
    }
    if (paths) {
      if (o.soft || o.hard) fail(`fatal: Cannot do ${o.soft ? 'soft' : 'hard'} reset with paths.`);
      const t = this.tree(this.resolve(rev || 'HEAD'));
      for (const spec of paths) for (const p of this.matchPaths(spec, union(s.index, t))) {
        if (p in t) s.index[p] = t[p]; else delete s.index[p];
        delete s.conflicts[p];
      }
      const un = this.unstagedChanges();
      if (un.length) this.p('Unstaged changes after reset:\n' + un.map((p) => `M\t${p}`).join('\n'));
      return;
    }
    const mode = o.soft ? 'soft' : o.hard ? 'hard' : 'mixed';
    if (mode === 'soft' && (s.mergeHead || keys(s.conflicts).length)) fail('fatal: Cannot do a soft reset in the middle of a merge.');
    const target = this.resolve(rev || 'HEAD');
    s.origHead = this.headId();
    if (mode === 'hard') this._hardResetTo(this.tree(target));
    this._setHead(target, `reset: moving to ${rev || 'HEAD'}`);
    if (mode === 'mixed') { s.index = { ...this.tree(target) }; s.conflicts = {}; }
    if (mode !== 'soft') { s.mergeHead = null; s.mergeMsg = null; }
    if (mode === 'hard') this.p(`HEAD is now at ${this._describe(target)}`);
    if (mode === 'mixed') { const un = this.unstagedChanges(); if (un.length) this.p('Unstaged changes after reset:\n' + un.map((p) => `${s.work[p] === undefined ? 'D' : 'M'}\t${p}`).join('\n')); }
  }

  /* ---------- merge ---------- */
  _mergeMsg(name, id) {
    const cur = this.branchName();
    const into = cur && cur !== 'main' && cur !== 'master' ? ` into ${cur}` : '';
    if (name in this.s.branches) return `Merge branch '${name}'${into}`;
    if (this._trackingRef(name)) return `Merge remote-tracking branch '${name}'${into}`;
    if (name in this.s.tags) return `Merge tag '${name}'${into}`;
    return `Merge commit '${id}'${into}`;
  }
  _applyMergeResult(r, headTree) {
    const s = this.s;
    // refuse if unstaged local changes touch paths the merge changes
    const touched = union(r.tree, headTree).filter((p) => r.tree[p] !== headTree[p] || p in r.conflicts);
    const blocked = touched.filter((p) => (p in s.index && s.work[p] !== s.index[p]) || (!(p in s.index) && p in s.work && s.work[p] !== r.tree[p]));
    if (blocked.length) fail(`error: Your local changes to the following files would be overwritten by merge:\n${blocked.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`, 1);
    for (const p of touched) {
      if (r.tree[p] === undefined) { delete s.index[p]; delete s.work[p]; continue; }
      s.work[p] = r.tree[p];
      if (p in r.conflicts) { if (headTree[p] !== undefined) s.index[p] = headTree[p]; else delete s.index[p]; }
      else s.index[p] = r.tree[p];
    }
    s.conflicts = { ...r.conflicts };
  }
  git_merge(args) {
    const o = opts(args, { flags: ['abort', 'continue', 'no-ff', 'ff-only', 'ff', 'squash', 'no-edit', 'q'], values: ['m', 'message'] });
    const s = this.s;
    if (o.abort) {
      if (!s.mergeHead && !keys(s.conflicts).length) fail('fatal: There is no merge to abort (MERGE_HEAD missing).');
      this._hardResetTo(this.headTree());
      s.mergeHead = null; s.mergeMsg = null;
      return;
    }
    if (o.continue) {
      if (!s.mergeHead) fail('fatal: There is no merge in progress (MERGE_HEAD missing).');
      return this.git_commit([]);
    }
    if (s.mergeHead) fail('fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.');
    if (s.seq) this._requireNoOp('merge');
    if (keys(s.conflicts).length) fail('error: Merging is not possible because you have unmerged files.');
    let names = o._;
    if (!names.length) {
      const b = this.branchName();
      if (b && s.upstream[b]) names = [this._up(b).ref];
      else fail('fatal: No remote for the current branch.\nhint: name the branch to merge, e.g. git merge feature');
    }
    if (names.length > 1) fail('error: octopus merges are not part of this playground; merge one branch at a time', 1);
    const name = names[0];
    const target = this.resolve(name);
    const head = this.headId();
    const userMsg = (o.m || o.message) ? [...(o.m || []), ...(o.message || [])].join('\n\n') : null;
    if (!head) { this._checkoutTree(target); this._setHead(target, `merge ${name}: Fast-forward`); return; }
    if (this.isAncestor(target, head)) { this.p('Already up to date.'); return; }
    if (this.stagedChanges().length) fail(`error: Your local changes to the following files would be overwritten by merge:\n${this.stagedChanges().map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`, 1);
    if (this.isAncestor(head, target) && !o['no-ff'] && !o.squash) {
      const before = this.headTree();
      this._checkoutTree(target);
      s.origHead = head;
      this._setHead(target, `merge ${name}: Fast-forward`);
      this.p(`Updating ${head}..${target}\nFast-forward`);
      for (const l of this._stat(before, this.tree(target))) this.p(l);
      return;
    }
    if (o['ff-only']) fail('fatal: Not possible to fast-forward, aborting.');
    const base = this.mergeBase(head, target);
    const headTree = this.headTree();
    const r = mergeTrees(this.tree(base), headTree, this.tree(target), { ours: 'HEAD', theirs: name });
    this._applyMergeResult(r, headTree);
    s.origHead = head;
    for (const m of r.msgs) this.p(m, m.startsWith('CONFLICT') ? 'err' : '');
    if (o.squash) {
      this.p('Squash commit -- not updating HEAD');
      if (keys(r.conflicts).length) { this.p('Automatic merge failed; fix conflicts and then commit the result.', 'err'); this.exitCode = 1; }
      return;
    }
    const msg = userMsg || this._mergeMsg(name, target);
    if (keys(r.conflicts).length) {
      s.mergeHead = target; s.mergeMsg = msg;
      this.p('Automatic merge failed; fix conflicts and then commit the result.', 'err');
      this.exitCode = 1;
      return;
    }
    const id = this._mkCommit([head, target], s.index, msg);
    this._setHead(id, `merge ${name}: Merge made by the 'ort' strategy.`);
    this.p("Merge made by the 'ort' strategy.");
    for (const l of this._stat(headTree, s.index)) this.p(l);
  }

  /* ---------- sequencer: rebase, cherry-pick, revert ---------- */
  _seqMsg(step) {
    const c = this.s.commits[step.id];
    if (this.s.seq?.kind === 'revert') return `Revert "${firstLine(c.msg)}"\n\nThis reverts commit ${c.id}.`;
    return step.msg ?? c.msg;
  }
  _patchId(id) {
    const c = this.s.commits[id], pt = this.tree(c.parents[0]);
    return union(pt, c.tree).filter((p) => pt[p] !== c.tree[p]).map((p) => p + ':' + diffOps(pt[p] || '', c.tree[p] || '').filter((x) => x.t !== ' ').map((x) => x.t + x.line).join('\n')).join('\n\n');
  }
  _runSeq() {
    const s = this.s;
    const seq = s.seq;
    while (seq.todo.length) {
      const step = seq.todo.shift();
      seq.cur = step; seq.curDone = false;
      if (step.action === 'drop') continue;
      const c = s.commits[step.id];
      let base, theirs;
      const mainline = seq.mainline || 1;
      if (seq.kind === 'revert') { base = c.tree; theirs = this.tree(c.parents[mainline - 1]); }
      else { base = this.tree(c.parents[seq.kind === 'cherry-pick' ? mainline - 1 : 0]); theirs = c.tree; }
      const ours = this.headTree();
      const label = `${c.id} (${firstLine(c.msg)})`;
      const r = seq.kind === 'revert'
        ? mergeTrees(base, ours, theirs, { ours: 'HEAD', theirs: `parent of ${label}` })
        : mergeTrees(base, ours, theirs, { ours: 'HEAD', theirs: label });
      this._applyMergeResult(r, ours);
      for (const m of r.msgs) if (m.startsWith('CONFLICT')) this.p(m, 'err');
      if (keys(r.conflicts).length) {
        const verb = seq.kind === 'revert' ? 'revert' : 'apply';
        this.p(`error: could not ${verb} ${c.id}... ${firstLine(c.msg)}`, 'err');
        if (seq.kind === 'rebase') this.hint('Resolve all conflicts manually, mark them as resolved with\n"git add/rm <conflicted_files>", then run "git rebase --continue".\nTo abort and get back to the state before "git rebase", run "git rebase --abort".');
        else this.hint(`After resolving the conflicts, mark them with\n"git add/rm <pathspec>", then run\n"git ${seq.kind} --continue".\nTo abort and get back to the state before, run "git ${seq.kind} --abort".`);
        this.exitCode = 1;
        return false;
      }
      this._seqCommit(step);
    }
    this._finishSeq();
    return true;
  }
  _seqCommit(step) {
    const s = this.s, seq = s.seq, c = s.commits[step.id];
    const head = this.headId();
    const msg = this._seqMsg(step);
    if (step.action === 'squash' || step.action === 'fixup') {
      const prev = s.commits[head];
      const newMsg = step.action === 'squash' ? `${prev.msg}\n\n${msg}` : prev.msg;
      const id = this._mkCommit(prev.parents, s.index, newMsg, prev.author);
      this._setHead(id, `rebase (${step.action}): ${firstLine(newMsg)}`);
    } else if (treeEq(s.index, this.headTree())) {
      if (seq.kind === 'rebase') this.p(`dropping ${c.id} ${firstLine(c.msg)} -- patch contents already upstream`, 'hint');
      else this.p(`The previous ${seq.kind} is now empty, skipping ${c.id}.`, 'hint');
    } else {
      const id = this._mkCommit([head], s.index, msg, seq.kind === 'revert' ? 'you' : c.author);
      const verb = seq.kind === 'rebase' ? `rebase (${step.action === 'reword' ? 'reword' : 'pick'})` : seq.kind;
      this._setHead(id, `${verb}: ${firstLine(msg)}`);
      if (seq.kind !== 'rebase') this.p(`[${this.branchName() || 'detached HEAD'} ${id}] ${firstLine(msg)}`);
    }
    seq.curDone = true;
  }
  _finishSeq() {
    const s = this.s, seq = s.seq;
    if (seq.kind === 'rebase') {
      const id = this.headId();
      if (seq.branch) {
        s.branches[seq.branch] = id;
        this._log(seq.branch, id, `rebase (finish): refs/heads/${seq.branch} onto ${seq.onto}`);
        s.head = { branch: seq.branch };
        this._log('HEAD', id, `rebase (finish): returning to refs/heads/${seq.branch}`);
        this.p(`Successfully rebased and updated refs/heads/${seq.branch}.`, 'add');
      } else this.p('Successfully rebased (detached HEAD).', 'add');
      s.detachedFrom = null;
    }
    s.seq = null;
  }
  _seqContinue(kind) {
    const s = this.s;
    if (!s.seq || s.seq.kind !== kind) {
      if (kind === 'rebase') fail('fatal: No rebase in progress?');
      fail(`error: no ${kind} in progress`);
    }
    if (keys(s.conflicts).length) fail(`error: you must edit all merge conflicts and then\nmark them as resolved using git add\n(still unmerged: ${keys(s.conflicts).join(', ')})`);
    const cur = s.seq.cur;
    if (cur && !s.seq.curDone && cur.action !== 'drop') this._seqCommit(cur);
    s.seq.cur = null;
    this._runSeq();
  }
  _seqAbort(kind) {
    const s = this.s;
    if (!s.seq || s.seq.kind !== kind) {
      if (kind === 'rebase') fail('fatal: No rebase in progress?');
      fail(`error: no ${kind} in progress`);
    }
    const seq = s.seq;
    this._hardResetTo(this.tree(seq.orig));
    if (seq.kind === 'rebase') {
      if (seq.branch) { s.branches[seq.branch] = seq.orig; s.head = { branch: seq.branch }; }
      else s.head = { detached: seq.orig };
      this._log('HEAD', seq.orig, `rebase (abort): returning to ${seq.branch ? 'refs/heads/' + seq.branch : seq.orig}`);
    } else this._setHead(seq.orig, `${seq.kind}: abort`);
    s.seq = null;
  }
  _seqSkip(kind) {
    const s = this.s;
    if (!s.seq || s.seq.kind !== kind) fail(`error: no ${kind} in progress`);
    this._hardResetTo(this.headTree());
    s.seq.cur = null;
    this._runSeq();
  }
  _seqFlags(kind, o) {
    if (o.continue) { this._seqContinue(kind); return true; }
    if (o.abort) { if (kind === 'rebase' && this.s.pendingRebase) { this.s.pendingRebase = null; this.p('Interactive rebase cancelled.'); return true; } this._seqAbort(kind); return true; }
    if (o.skip) { this._seqSkip(kind); return true; }
    if (o.quit) { if (!this.s.seq) fail(`error: no ${kind} in progress`); this.s.seq = null; return true; }
    return false;
  }
  _requireClean(verb) {
    if (this.stagedChanges().length || this.unstagedChanges().length) {
      fail(`error: cannot ${verb}: You have ${this.stagedChanges().length ? 'staged' : 'unstaged'} changes.\nerror: Please commit or stash them.`, 1);
    }
  }
  git_rebase(args) {
    const o = opts(args, { flags: ['continue', 'abort', 'skip', 'quit', 'i', 'interactive', 'q', 'root'], values: ['onto'] });
    const s = this.s;
    if (this._seqFlags('rebase', o)) return;
    if (s.pendingRebase) fail('error: an interactive rebase is waiting for its todo list (or run git rebase --abort)');
    if (s.seq) fail(`fatal: It seems that there is already a ${s.seq.kind} in progress.\nhint: use --continue, --skip or --abort.`);
    if (s.mergeHead) this._requireNoOp('rebase');
    this._requireClean('rebase');
    const interactive = o.i || o.interactive;
    let [upArg, branchArg] = o._;
    if (branchArg) {
      if (!(branchArg in s.branches)) fail(`fatal: invalid upstream '${branchArg}'`);
      if (branchArg !== this.branchName()) this._switchBranch(branchArg);
    }
    if (!upArg) {
      const b = this.branchName();
      if (b && s.upstream[b]) upArg = this._up(b).ref;
      else fail('fatal: There is no tracking information for the current branch.\nPlease specify which branch you want to rebase against.\n\n    git rebase <branch>');
    }
    const upstream = this.resolve(upArg);
    const ontoArg = last(o.onto);
    const onto = ontoArg ? this.resolve(ontoArg) : upstream;
    const head = this.headId();
    const branch = this.branchName();
    let ids = this.range(upstream, head).filter((id) => s.commits[id].parents.length < 2);
    const upstreamPatches = new Set(this.range(head, onto).map((id) => this._patchId(id)));
    const skipped = ids.filter((id) => upstreamPatches.has(this._patchId(id)));
    ids = ids.filter((id) => !skipped.includes(id));
    if (!interactive) {
      if (this.isAncestor(onto, head) && this.mergeBase(head, upstream) === onto && !skipped.length) {
        this.p(`Current branch ${branch || 'HEAD'} is up to date.`);
        return;
      }
    }
    for (const id of skipped) this.p(`warning: skipped previously applied commit ${id}`, 'hint');
    const todo = ids.map((id) => ({ action: 'pick', id, msg: null }));
    if (interactive) {
      s.pendingRebase = { onto, ontoName: ontoArg || upArg, branch, orig: head, todo };
      this.events.push({ type: 'rebase-todo' });
      this.p(`Interactive rebase of ${plural(todo.length, 'commit')} onto ${onto}.`);
      this.p('Edit the todo list in the rebase panel, then press "Start rebase".', 'hint');
      return;
    }
    this._startRebase(todo, onto, ontoArg || upArg, branch, head, false);
  }
  _startRebase(todo, onto, ontoName, branch, orig, interactive) {
    const s = this.s;
    s.origHead = orig;
    s.seq = { kind: 'rebase', todo: todo.map((t) => ({ ...t })), cur: null, curDone: false, orig, branch, onto, interactive };
    this._hardResetTo(this.tree(onto));
    s.head = { detached: onto };
    s.detachedFrom = onto;
    this._log('HEAD', onto, `rebase (start): checkout ${ontoName}`);
    this._runSeq();
  }
  // Called by the UI (or tests) with the edited todo list: [{action, id, msg?}]
  rebaseTodoApply(todo) {
    this.out = []; this.events = []; this.exitCode = 0;
    const s = this.s, pr = s.pendingRebase;
    const snapshot = JSON.stringify(s);
    try {
      if (!pr) fail('error: no interactive rebase is waiting');
      if (this.headId() !== pr.orig) fail('error: HEAD moved since the rebase was started; run git rebase -i again');
      const valid = ['pick', 'reword', 'squash', 'fixup', 'drop'];
      for (const t of todo) {
        if (!valid.includes(t.action)) fail(`error: invalid command '${t.action}'`);
        if (!s.commits[t.id]) fail(`error: invalid commit '${t.id}'`);
      }
      const firstKept = todo.find((t) => t.action !== 'drop');
      if (firstKept && (firstKept.action === 'squash' || firstKept.action === 'fixup')) fail(`error: cannot '${firstKept.action}' without a previous commit`);
      s.pendingRebase = null;
      this._startRebase(todo.map((t) => ({ action: t.action, id: t.id, msg: t.action === 'reword' ? (t.msg || s.commits[t.id].msg) : null })), pr.onto, pr.ontoName, pr.branch, pr.orig, true);
    } catch (e) {
      if (!(e instanceof GitError)) throw e;
      this.s = JSON.parse(snapshot);
      this.p(e.message, 'err'); this.exitCode = 1;
    }
    this.history.push('(rebase todo: ' + todo.map((t) => t.action + ' ' + t.id).join(', ') + ')');
    return { lines: this.out, ok: this.exitCode === 0, events: this.events };
  }
  rebaseTodoCancel() { this.s.pendingRebase = null; }

  _revList(args) {
    const ids = [];
    for (const a of args) {
      if (a.includes('..')) { const [x, y] = a.split('..'); ids.push(...this.range(this.resolve(x || 'HEAD'), this.resolve(y || 'HEAD'))); }
      else ids.push(this.resolve(a));
    }
    return ids;
  }
  git_cherry_pick(args) {
    const o = opts(args, { flags: ['continue', 'abort', 'skip', 'quit', 'x', 'no-edit'], values: ['m', 'mainline'] });
    const s = this.s;
    if (this._seqFlags('cherry-pick', o)) return;
    if (s.seq) fail(`error: a ${s.seq.kind} is already in progress\nhint: try "git ${s.seq.kind} --continue" or "--abort"`);
    if (s.mergeHead) this._requireNoOp('cherry-pick');
    if (!o._.length) fail('usage: git cherry-pick <commit>...', 129);
    if (!this.headId()) fail('error: cannot cherry-pick onto an empty branch in this playground');
    if (this.stagedChanges().length) fail('error: your local changes would be overwritten by cherry-pick.\nhint: commit your changes or stash them to proceed.\nfatal: cherry-pick failed', 1);
    const ids = this._revList(o._);
    const mainline = o.m || o.mainline ? +last(o.m || o.mainline) : null;
    for (const id of ids) if (s.commits[id].parents.length > 1 && !mainline) fail(`error: commit ${id} is a merge but no -m option was given.\nfatal: cherry-pick failed`);
    s.origHead = this.headId();
    s.seq = { kind: 'cherry-pick', todo: ids.map((id) => ({ action: 'pick', id })), cur: null, orig: this.headId(), branch: this.branchName(), mainline };
    this._runSeq();
  }
  git_revert(args) {
    const o = opts(args, { flags: ['continue', 'abort', 'skip', 'quit', 'no-edit', 'n', 'no-commit'], values: ['m', 'mainline'] });
    const s = this.s;
    if (this._seqFlags('revert', o)) return;
    if (s.seq) fail(`error: a ${s.seq.kind} is already in progress`);
    if (s.mergeHead) this._requireNoOp('revert');
    if (!o._.length) fail('usage: git revert <commit>...', 129);
    if (this.stagedChanges().length) fail('error: your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.\nfatal: revert failed', 1);
    const ids = this._revList(o._).reverse();
    const mainline = o.m || o.mainline ? +last(o.m || o.mainline) : null;
    for (const id of ids) {
      if (s.commits[id].parents.length > 1 && !mainline) fail(`error: commit ${id} is a merge but no -m option was given.\nfatal: revert failed`);
      if (!s.commits[id].parents.length) fail(`error: cannot revert the root commit ${id} in this playground`);
    }
    s.origHead = this.headId();
    s.seq = { kind: 'revert', todo: ids.map((id) => ({ action: 'pick', id })), cur: null, orig: this.headId(), branch: this.branchName(), mainline };
    this._runSeq();
  }

  /* ---------- stash ---------- */
  git_stash(args) {
    const [sub0, ...rest0] = args;
    const subs = ['push', 'save', 'list', 'pop', 'apply', 'drop', 'show', 'clear'];
    const sub = subs.includes(sub0) ? sub0 : 'push';
    const rest = subs.includes(sub0) ? rest0 : args;
    const s = this.s;
    const pick = (arg) => {
      if (!s.stash.length) fail('error: No stash entries found.', 1);
      let n = 0;
      if (arg !== undefined) {
        const m = String(arg).match(/^(?:stash@\{)?(\d+)\}?$/);
        if (!m) fail(`error: '${arg}' is not a stash-like commit`);
        n = +m[1];
      }
      if (!s.stash[n]) fail(`error: stash@{${n}} is not a valid reference`);
      return n;
    };
    if (sub === 'list') { s.stash.forEach((e, i) => this.p(`stash@{${i}}: ${e.msg}`)); return; }
    if (sub === 'clear') { s.stash = []; return; }
    if (sub === 'drop') { const n = pick(opts(rest)._[0]); this.p(`Dropped stash@{${n}} (${s.stash[n].id})`); s.stash.splice(n, 1); return; }
    if (sub === 'show') {
      const n = pick(opts(rest, { flags: ['p', 'patch', 'stat'] })._[0]);
      const e = s.stash[n];
      const o2 = opts(rest, { flags: ['p', 'patch', 'stat'] });
      const lines = o2.p || o2.patch ? this._treeDiff(this.tree(e.base), e.work) : this._stat(this.tree(e.base), e.work);
      for (const l of lines) this.p(l);
      return;
    }
    if (sub === 'pop' || sub === 'apply') {
      const o = opts(rest, { flags: ['index', 'q'] });
      const n = pick(o._[0]);
      const e = s.stash[n];
      const base = this.tree(e.base), headTree = this.headTree();
      const changed = union(base, e.work).filter((p) => base[p] !== e.work[p]);
      const blocked = changed.filter((p) => s.work[p] !== headTree[p] && s.work[p] !== e.work[p] && (this.tracked(p) || p in headTree || p in s.work));
      if (blocked.length) fail(`error: Your local changes to the following files would be overwritten by merge:\n${blocked.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting\nThe stash entry is kept in case you need it again.`, 1);
      const conflicts = {};
      for (const p of changed) {
        const theirs = e.work[p], cur = headTree[p];
        if (cur === base[p] || cur === theirs) {
          if (theirs === undefined) { delete s.work[p]; delete s.index[p]; }
          else { s.work[p] = theirs; if (!(p in base)) s.index[p] = theirs; }
        } else if (theirs === undefined || cur === undefined) {
          conflicts[p] = { base: base[p] ?? null, ours: cur ?? null, theirs: theirs ?? null };
          if (theirs !== undefined) s.work[p] = theirs;
          this.p(`CONFLICT (modify/delete): ${p}`, 'err');
        } else {
          const m = merge3(base[p] || '', cur, theirs, { ours: 'Updated upstream', theirs: 'Stashed changes' });
          s.work[p] = m.text;
          if (m.conflicts) { conflicts[p] = { base: base[p] ?? null, ours: cur, theirs }; this.p(`Auto-merging ${p}\nCONFLICT (content): Merge conflict in ${p}`, 'err'); }
        }
        if (o.index && !conflicts[p] && e.index[p] !== base[p]) { if (e.index[p] === undefined) delete s.index[p]; else s.index[p] = e.index[p]; }
      }
      for (const [p, v] of Object.entries(e.untracked || {})) {
        if (p in s.work) fail(`error: ${p} already exists, no checkout\nerror: could not restore untracked files from stash`, 1);
        s.work[p] = v;
      }
      s.conflicts = { ...s.conflicts, ...conflicts };
      if (keys(conflicts).length) {
        this.p('On branch ' + (this.branchName() || 'HEAD'));
        this.p('The stash entry is kept in case you need it again.', 'warn');
        this.exitCode = 1;
        return;
      }
      this.git_status(['--short']);
      if (sub === 'pop') { this.p(`Dropped refs/stash@{${n}} (${e.id})`); s.stash.splice(n, 1); }
      return;
    }
    // push / save
    const o = opts(rest, { flags: ['u', 'include-untracked', 'k', 'keep-index', 'q'], values: ['m', 'message'] });
    let msg = last(o.m || o.message);
    if (sub === 'save' && o._.length) msg = o._.join(' ');
    if (!this.headId()) fail('You do not have the initial commit yet');
    if (keys(s.conflicts).length) fail('error: could not save the stash: you have unmerged paths (resolve the merge first)');
    const head = this.headId(), headTree = this.headTree();
    const withUntracked = o.u || o['include-untracked'];
    const untracked = {};
    if (withUntracked) for (const p of this.untracked()) untracked[p] = s.work[p];
    if (!this.stagedChanges().length && !this.unstagedChanges().length && !keys(untracked).length) { this.p('No local changes to save'); return; }
    const work = {};
    for (const p of keys(s.index)) if (p in s.work) work[p] = s.work[p];
    const b = this.branchName() || '(no branch)';
    const full = msg ? `On ${b}: ${msg}` : `WIP on ${b}: ${this._describe(head)}`;
    const id = shortHash('stash' + JSON.stringify(work) + full + s.n++);
    s.stash.unshift({ id, msg: full, base: head, index: { ...s.index }, work, untracked });
    const keepIndex = o.k || o['keep-index'];
    const savedIndex = { ...s.index };
    this._hardResetTo(headTree);
    if (keepIndex) for (const p of keys(savedIndex)) { s.index[p] = savedIndex[p]; s.work[p] = savedIndex[p]; }
    for (const p of keys(untracked)) delete s.work[p];
    this.p(`Saved working directory and index state ${full}`);
  }

  /* ---------- remotes ---------- */
  _markKnown(id) { for (const c of this.ancestors(id)) delete this.s.commits[c].remoteOnly; }
  _reachable(rm) { if (rm.R.missing) fail(`fatal: repository '${rm.R.url}' not found`); return rm; }
  _fetch(name = REMOTE, { prune = false, quiet = false } = {}) {
    const s = this.s;
    const { R, T } = this._reachable(this._needRemote(name));
    const lines = [];
    for (const [b, id] of Object.entries(R.branches)) {
      const old = T[b];
      if (old === id) continue;
      this._markKnown(id);
      T[b] = id;
      this._log(`${name}/${b}`, id, 'fetch: fast-forward');
      if (!old) lines.push(` * [new branch]      ${b.padEnd(10)} -> ${name}/${b}`);
      else if (this.isAncestor(old, id)) lines.push(`   ${old}..${id}  ${b.padEnd(10)} -> ${name}/${b}`);
      else lines.push(` + ${old}...${id} ${b.padEnd(10)} -> ${name}/${b}  (forced update)`);
    }
    for (const [t, v] of Object.entries(R.tags)) if (!(t in s.tags)) { this._markKnown(v.id); s.tags[t] = { ...v }; lines.push(` * [new tag]         ${t.padEnd(10)} -> ${t}`); }
    if (prune) for (const b of keys(T)) if (!(b in R.branches)) { lines.push(` - [deleted]         (none)     -> ${name}/${b}`); delete T[b]; }
    if (lines.length && !quiet) this.p(`From ${R.url}\n${lines.join('\n')}`);
    return lines.length;
  }
  // the remote a bare fetch/pull/push talks to: the current branch's upstream remote, else origin
  _defaultRemote() { const U = this._up(this.branchName()); return U ? U.remote : REMOTE; }
  git_fetch(args) {
    const o = opts(args, { flags: ['all', 'prune', 'p', 'q', 'tags'] });
    const prune = o.prune || o.p || this.s.config['fetch.prune'] === 'true';
    if (o.all) {
      const names = this.remoteNames();
      if (!names.length) fail('fatal: no remotes configured');
      for (const n of names) { this.p(`Fetching ${n}`); this._fetch(n, { prune }); }
      return;
    }
    this._fetch(o._[0] || this._defaultRemote(), { prune });
  }
  git_pull(args) {
    const o = opts(args, { flags: ['rebase', 'r', 'no-rebase', 'ff-only', 'ff', 'no-ff', 'q', 'prune', 'p'] });
    const s = this.s;
    const b = this.branchName();
    const U = this._up(b);
    const remote = o._[0] || (U ? U.remote : REMOTE);
    const { R } = this._reachable(this._needRemote(remote));
    if (!b) fail('You are not currently on a branch.\nPlease specify which branch you want to merge with.');
    let remoteBranch = o._[1];
    if (!remoteBranch) {
      if (U && U.remote === remote) remoteBranch = U.branch;
      else if (o._[0] && U) fail(`You asked to pull from the remote '${remote}', but did not specify\na branch. Because this is not the default configured remote\nfor your current branch, you must specify a branch on the command line.\n\n    git pull ${remote} main`, 1);
      else fail(`There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\n\n    git pull ${remote} <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=${remote}/<branch> ${b}`, 1);
    }
    if (this.stagedChanges().length || keys(s.conflicts).length) this._requireClean('pull');
    this._fetch(remote, { prune: o.prune || o.p || s.config['fetch.prune'] === 'true' });
    const tip = R.branches[remoteBranch];
    if (!tip) fail(`fatal: couldn't find remote ref ${remoteBranch}`, 1);
    const head = this.headId();
    if (this.isAncestor(tip, head)) { this.p('Already up to date.'); return; }
    if (!head || this.isAncestor(head, tip)) {
      const before = this.headTree();
      this._checkoutTree(tip);
      s.origHead = head;
      this._setHead(tip, 'pull: Fast-forward');
      this.p(`Updating ${head}..${tip}\nFast-forward`);
      for (const l of this._stat(before, this.tree(tip))) this.p(l);
      return;
    }
    const cfg = s.config['pull.rebase'];
    const rebase = o.rebase || o.r || (cfg === 'true' && !o['no-rebase']);
    const merge = o['no-rebase'] || o['no-ff'] || o.ff || cfg === 'false';
    if (o['ff-only'] || s.config['pull.ff'] === 'only') fail('fatal: Not possible to fast-forward, aborting.');
    if (rebase) return this.git_rebase([`${remote}/${remoteBranch}`]);
    if (!merge) {
      this.hint('You have divergent branches and need to specify how to reconcile them.\nYou can do so by running one of the following commands sometime before\nyour next pull:\n\n  git config pull.rebase false  # merge\n  git config pull.rebase true   # rebase\n  git config pull.ff only       # fast-forward only\n\nor run "git pull --rebase" / "git pull --no-rebase" this time.');
      fail('fatal: Need to specify how to reconcile divergent branches.');
    }
    const headTree = this.headTree();
    const base = this.mergeBase(head, tip);
    const r = mergeTrees(this.tree(base), headTree, this.tree(tip), { ours: 'HEAD', theirs: `${remote}/${remoteBranch}` });
    this._applyMergeResult(r, headTree);
    s.origHead = head;
    for (const m of r.msgs) this.p(m, m.startsWith('CONFLICT') ? 'err' : '');
    const msg = `Merge branch '${remoteBranch}' of ${R.url.replace(/^[a-z]+:\/\//, '').replace(/^git@/, '').replace(/\.git$/, '')}`;
    if (keys(r.conflicts).length) {
      s.mergeHead = tip; s.mergeMsg = msg;
      this.p('Automatic merge failed; fix conflicts and then commit the result.', 'err');
      this.exitCode = 1; return;
    }
    const id = this._mkCommit([head, tip], s.index, msg);
    this._setHead(id, "pull: Merge made by the 'ort' strategy.");
    this.p("Merge made by the 'ort' strategy.");
  }
  git_push(args) {
    const o = opts(args, { flags: ['u', 'set-upstream', 'f', 'force', 'force-with-lease', 'd', 'delete', 'tags', 'all', 'q', 'follow-tags'] });
    const s = this.s;
    const cur = this.branchName();
    const U = this._up(cur);
    const [remoteArg, ...specs] = o._;
    const remote = remoteArg || (U ? U.remote : REMOTE);
    const { R, T } = this._reachable(this._needRemote(remote));
    const url = R.url;
    if (R.readOnly) fail(`ERROR: Permission to ${repoKey(url).replace(/^[^/]+\//, '')}.git denied to you.\nfatal: Could not read from remote repository.\nhint: '${remote}' is someone else's repository. Push to your fork (origin) and open a pull request.`);
    const setUp = o.u || o['set-upstream'] || (s.config['push.autoSetupRemote'] === 'true' && !specs.length && !U);
    const out = [];
    let rejected = false;
    if (o.tags) {
      for (const [t, v] of Object.entries(s.tags)) if (!(t in R.tags)) { R.tags[t] = { ...v }; out.push(` * [new tag]         ${t} -> ${t}`); }
      if (!specs.length) { this.p(out.length ? `To ${url}\n${out.join('\n')}` : 'Everything up-to-date'); return; }
    }
    let pairs;
    if (!specs.length) {
      if (!cur) fail(`fatal: You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push ${remote} HEAD:<name-of-remote-branch>`);
      if (!U && !setUp) fail(`fatal: The current branch ${cur} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream ${remote} ${cur}\n`);
      pairs = [[cur, U && U.remote === remote ? U.branch : cur]];
    } else pairs = specs.map((sp) => { const [a, b2] = sp.split(':'); return [a === '' ? null : a, b2 || (a === 'HEAD' ? cur : a)]; });
    for (let [src, dst] of pairs) {
      if (o.d || o.delete) { dst = src; src = null; }
      if (src === null) {
        if (!(dst in R.branches)) fail(`error: unable to delete '${dst}': remote ref does not exist`);
        delete R.branches[dst]; delete T[dst];
        out.push(` - [deleted]         ${dst}`);
        continue;
      }
      if (src in s.tags && !(src in s.branches)) { R.tags[src] = { ...s.tags[src] }; out.push(` * [new tag]         ${src} -> ${src}`); continue; }
      const id = this.resolve(src);
      const old = R.branches[dst];
      const label = `${src.padEnd(10)} -> ${dst}`;
      if (old === id) { out.push(`= [up to date]      ${label}`); continue; }
      const ff = !old || this.isAncestor(old, id);
      const force = o.f || o.force;
      const lease = o['force-with-lease'];
      if (lease && old && T[dst] !== old) { out.push(` ! [rejected]        ${label} (stale info)`); rejected = 'stale'; continue; }
      if (!ff && !force && !lease) {
        const known = !s.commits[old].remoteOnly;
        out.push(` ! [rejected]        ${label} (${known ? 'non-fast-forward' : 'fetch first'})`);
        rejected = known ? 'nonff' : 'fetch';
        continue;
      }
      R.branches[dst] = id;
      T[dst] = id;
      this._log(`${remote}/${dst}`, id, 'update by push');
      if (!old) out.push(` * [new branch]      ${label}`);
      else if (ff) out.push(`   ${old}..${id}  ${label}`);
      else out.push(` + ${old}...${id} ${label} (forced update)`);
      const local = src === 'HEAD' ? cur : src;
      if (setUp && local in s.branches) { this._setUp(local, remote, dst); out.push(`branch '${local}' set up to track '${remote}/${dst}'.`); }
    }
    // --follow-tags: also push annotated tags that point into what the remote now has
    if (o['follow-tags']) for (const [t, v] of Object.entries(s.tags)) {
      if (v.msg && !(t in R.tags) && Object.values(R.branches).some((tip) => this.isAncestor(v.id, tip))) { R.tags[t] = { ...v }; out.push(` * [new tag]         ${t} -> ${t}`); }
    }
    if (out.length) this.p(`To ${url}\n${out.join('\n')}`, rejected ? 'warn' : '');
    if (rejected) {
      this.p(`error: failed to push some refs to '${url}'`, 'err');
      if (rejected === 'fetch') this.hint("Updates were rejected because the remote contains work that you do not\nhave locally. This is usually caused by another repository pushing to\nthe same ref. Integrate the remote changes first (e.g. 'git pull ...')\nbefore pushing again.");
      else if (rejected === 'nonff') this.hint("Updates were rejected because the tip of your current branch is behind\nits remote counterpart. If you rewrote history on purpose, use\n'git push --force-with-lease'; otherwise integrate with 'git pull'.");
      else this.hint('The remote branch moved since you last fetched. Someone else pushed:\nfetch and look before you overwrite their work.');
      this.exitCode = 1;
    }
  }

  /* ---------- bisect ---------- */
  git_bisect(args) {
    const [sub, ...rest] = args;
    const s = this.s;
    const B = s.bisect;
    if (sub === 'start') {
      if (B) fail('error: a bisect session is already running (git bisect reset to end it)');
      this._requireClean('bisect');
      s.bisect = { startBranch: this.branchName(), startId: this.headId(), bad: null, good: [], steps: 0, found: null };
      this.p('status: waiting for both good and bad commits');
      if (rest[0]) this._bisectMark('bad', rest[0], true);
      for (const g of rest.slice(1)) this._bisectMark('good', g, true);
      if (rest.length) this._bisectNext();
      return;
    }
    if (sub === 'good' || sub === 'bad' || sub === 'old' || sub === 'new') {
      if (!B) fail('You need to start by "git bisect start"', 1);
      const kind = sub === 'old' ? 'good' : sub === 'new' ? 'bad' : sub;
      const revs = rest.length ? rest : ['HEAD'];
      for (const r of revs) this._bisectMark(kind, r);
      return this._bisectNext();
    }
    if (sub === 'skip') fail('error: bisect skip is not part of this playground', 1);
    if (sub === 'reset') {
      if (!B) { this.p('We are not bisecting.'); return; }
      const target = B.startBranch;
      this._hardResetTo(this.tree(target ? s.branches[target] : B.startId));
      const from = this.headId();
      s.head = target ? { branch: target } : { detached: B.startId };
      this._log('HEAD', this.headId(), `checkout: moving from ${from} to ${target || B.startId}`);
      s.bisect = null;
      this.p(`Previous HEAD position was ${this._describe(from)}\nSwitched to branch '${target}'`);
      return;
    }
    if (sub === 'log') { if (!B) fail('error: We are not bisecting.'); for (const g of B.good) this.p(`git bisect good ${g}`); if (B.bad) this.p(`git bisect bad ${B.bad}`); return; }
    if (sub === 'run') {
      if (!B) fail('You need to start by "git bisect start"', 1);
      if (!B.bad || !B.good.length) fail('error: bisect run needs both a good and a bad commit first', 1);
      const cmd = rest.join(' ');
      if (!/^(\.\/)?run-tests$/.test(cmd)) fail(`error: this playground can only bisect run ./run-tests`, 1);
      for (let guard = 0; guard < 64 && !s.bisect.found; guard++) {
        this.p(`running  '${cmd}'`, 'hint');
        const bad = this._testsFail();
        this.p(bad ? 'FAIL' : 'PASS', bad ? 'err' : 'add');
        this._bisectMark(bad ? 'bad' : 'good', 'HEAD');
        this._bisectNext();
      }
      if (s.bisect.found) this.p('bisect found first bad commit');
      return;
    }
    fail('usage: git bisect [start|bad|good|reset|log|run]', 1);
  }
  _bisectMark(kind, rev, silent) {
    const B = this.s.bisect;
    const id = this.resolve(rev);
    if (kind === 'bad') B.bad = id; else if (!B.good.includes(id)) B.good.push(id);
    if (!silent) B.steps++;
  }
  _bisectNext() {
    const s = this.s, B = s.bisect;
    if (!B.bad || !B.good.length) { this.p(`status: waiting for ${B.bad ? 'good' : 'bad'} commit(s), ${B.bad ? 'bad' : 'good'} commit known`); return; }
    if (B.good.some((g) => this.isAncestor(B.bad, g))) fail('Some good revs are not ancestors of the bad rev.\ngit bisect cannot work properly in this case.\nMaybe you mistook good and bad revs?', 1);
    const goodAnc = this.ancestorsOf(B.good);
    const cands = [...this.ancestors(B.bad)].filter((c) => !goodAnc.has(c));
    if (cands.length === 1) {
      B.found = B.bad;
      const c = s.commits[B.bad];
      this.p(`${B.bad} is the first bad commit\ncommit ${B.bad}\nAuthor: ${c.author}\n\n    ${firstLine(c.msg)}\n`, 'warn');
      return;
    }
    const N = cands.length;
    let best = null, bestScore = -1;
    for (const c of cands) {
      if (c === B.bad) continue;
      const anc = this.ancestors(c);
      const k = cands.filter((x) => anc.has(x)).length;
      const score = Math.min(k, N - k);
      if (score > bestScore || (score === bestScore && s.commits[c].n > s.commits[best].n)) { best = c; bestScore = score; }
    }
    const left = Math.max(0, Math.floor(N / 2) - (N % 2 ? 0 : 1));
    const from = this.headId();
    this._hardResetTo(this.tree(best));
    s.head = { detached: best };
    s.detachedFrom = best;
    this._log('HEAD', best, `checkout: moving from ${from} to ${best}`);
    this.p(`Bisecting: ${plural(left, 'revision')} left to test after this (roughly ${Math.ceil(Math.log2(N))} steps)`);
    this.p(`[${best}] ${firstLine(s.commits[best].msg)}`, 'commit');
  }
  _testsFail() {
    const m = this.s.bugMarker;
    return !!m && Object.values(this.s.work).some((t) => t.includes(m));
  }
  sh_tests() {
    const m = this.s.bugMarker;
    if (!m) { this.p('run-tests: no test suite in this repository'); return; }
    const hits = keys(this.s.work).filter((p) => this.s.work[p].includes(m));
    if (hits.length) { this.p(`FAIL  ${hits[0]}: the checkout total is wrong`, 'err'); this.exitCode = 1; }
    else this.p('PASS  all checks passed', 'add');
  }

  /* ---------- shell ---------- */
  // The few files under .git/ the internals unit looks at: HEAD and loose refs. Read-only.
  _dotGit(path) {
    const s = this.s;
    const p = path.replace(/^\.\//, '').replace(/\/+$/, '');
    if (p === '.git/HEAD') return { file: s.head.branch ? `ref: refs/heads/${s.head.branch}` : s.head.detached };
    const refDirs = { '.git/refs/heads': keys(s.branches), '.git/refs/tags': keys(s.tags), '.git/refs/remotes': this.remoteNames() };
    for (const n of this.remoteNames()) refDirs[`.git/refs/remotes/${n}`] = keys(this._remote(n).T);
    if (p === '.git') return { dir: ['HEAD', 'config', 'objects', 'refs'] };
    if (p === '.git/refs') return { dir: ['heads', 'remotes', 'tags'] };
    if (p in refDirs) return { dir: refDirs[p].sort() };
    const m = p.match(/^\.git\/(refs\/.+)$/);
    if (m) {
      const full = m[1];
      if (full.startsWith('refs/heads/') && full.slice(11) in s.branches) return { file: s.branches[full.slice(11)] };
      if (full.startsWith('refs/tags/') && full.slice(10) in s.tags) return { file: s.tags[full.slice(10)].id };
      const t = full.startsWith('refs/remotes/') && this._trackingRef(full.slice(13));
      if (t) return { file: t.id };
    }
    if (p.startsWith('.git')) return { missing: true };
    return null;
  }
  sh_ls(args) {
    const target = args.find((a) => !a.startsWith('-'));
    if (target) {
      const g = this._dotGit(target);
      if (g?.dir) { if (g.dir.length) this.p(g.dir.join('\n')); return; }
      if (g?.file !== undefined) { this.p(target); return; }
      if (g?.missing) fail(`ls: cannot access '${target}': No such file or directory`, 2);
    }
    const files = keys(this.s.work).filter((p) => args.includes('-a') || !p.startsWith('.')).sort();
    if (!files.length) return;
    this.p(files.join('\n'));
  }
  sh_cat(args) {
    if (!args.length) fail('cat: missing file operand', 1);
    for (const f of args) {
      const g = this._dotGit(f);
      if (g?.dir) fail(`cat: ${f}: Is a directory`, 1);
      if (g?.file !== undefined) { this.p(g.file); continue; }
      if (!(f in this.s.work)) fail(`cat: ${f}: No such file or directory`, 1);
      const t = this.s.work[f];
      if (t) this.p(t.replace(/\n$/, ''));
    }
  }
  sh_edit(args) {
    const [file, ...text] = args;
    if (!file) fail('usage: edit <file> "new content"   (\\n starts a new line)', 1);
    if (!text.length) { this.events.push({ type: 'edit', path: file }); this.p(`Opening ${file} in the editor...`, 'hint'); return; }
    this.s.work[file] = norm(text.join(' ').replace(/\\n/g, '\n'));
  }
  sh_echo(args) {
    let a = args, interp = false;
    if (a[0] === '-e') { interp = true; a = a.slice(1); }
    if (a[0] === '-n') a = a.slice(1);
    const text = a.join(' ');
    this.p(interp ? text.replace(/\\n/g, '\n') : text);
  }
  sh_rm(args) {
    const files = args.filter((a) => !a.startsWith('-'));
    const force = args.some((a) => a.startsWith('-') && a.includes('f'));
    if (!files.length) fail('rm: missing operand', 1);
    for (const f of files) {
      const hits = f.endsWith('/') || args.some((a) => /^-[a-z]*r/.test(a)) ? this.matchPaths(f, keys(this.s.work)) : (f in this.s.work ? [f] : this.matchPaths(f, keys(this.s.work)).filter(() => /[*?]/.test(f)));
      if (!hits.length) { if (force) continue; fail(`rm: cannot remove '${f}': No such file or directory`, 1); }
      for (const p of hits) delete this.s.work[p];
    }
  }
  sh_mv(args) {
    const [a, b] = args;
    if (!a || !b) fail('usage: mv <source> <dest>', 1);
    if (!(a in this.s.work)) fail(`mv: cannot stat '${a}': No such file or directory`, 1);
    this.s.work[b] = this.s.work[a];
    delete this.s.work[a];
  }

  /* =========================================================== level setup API */
  // Writes files to the working tree (null deletes), stages everything, commits.
  setupCommit(msg, files = {}, author = 'you') {
    const s = this.s;
    for (const [p, v] of Object.entries(files)) { if (v === null) delete s.work[p]; else s.work[p] = norm(v); }
    for (const p of union(s.work, s.index)) { if (p in s.work) s.index[p] = s.work[p]; else delete s.index[p]; }
    const head = this.headId();
    const id = this._mkCommit(head ? [head] : [], s.index, msg, author);
    this._setHead(id, `commit${head ? '' : ' (initial)'}: ${firstLine(msg)}`);
    return id;
  }
  setupFiles(files) { for (const [p, v] of Object.entries(files)) { if (v === null) delete this.s.work[p]; else this.s.work[p] = norm(v); } }
  sh(line) {
    const r = this.run(line);
    this.history.pop();
    if (!r.ok) throw new Error(`setup command failed: ${line}\n${r.lines.map((l) => l.t).join('\n')}`);
    return r;
  }
  setupRemote() {
    const s = this.s;
    s.remote = { url: URL, branches: { ...s.branches }, tags: {} };
    s.tracking = { ...s.branches };
    for (const b of keys(s.branches)) s.upstream[b] = b;
  }
  // A second named remote whose server starts as a copy of the local branches.
  // fetched: false leaves its tracking refs empty; added: false keeps it "out there" (unlinked)
  // until the player runs `git remote add <name> <url>` with any spelling of its URL.
  setupNamedRemote(name, { url, readOnly = false, fetched = true, added = true } = {}) {
    const s = this.s;
    if (name === REMOTE) throw new Error('setupNamedRemote: use setupRemote() for origin');
    const server = { url: url || `https://github.com/${name}/project.git`, branches: { ...s.branches }, tags: {}, ...(readOnly ? { readOnly: true } : {}) };
    if (!added) { s.unlinked[repoKey(server.url)] = server; return; }
    s.remotes[name] = server;
    s.remoteTracking[name] = fetched ? { ...s.branches } : {};
  }
  // The fork model: origin is your fork (you can push), upstream is the original project
  // (read-only for you: pushing there is refused with a permission error).
  setupFork({ upstreamUrl = 'https://github.com/bakery/site.git', forkUrl = 'https://github.com/you/site.git', added = true, fetched = true } = {}) {
    this.setupRemote();
    this.s.remote.url = forkUrl;
    this.setupNamedRemote('upstream', { url: upstreamUrl, readOnly: true, added, fetched });
  }
  _server(remote) {
    const rm = this._remote(remote);
    if (rm) return rm.R;
    const R = this.s.unlinked[repoKey(remote)] || Object.values(this.s.unlinked).find((x) => repoKey(x.url).endsWith('/' + remote));
    if (!R) throw new Error(`no remote or known repo '${remote}'`);
    return R;
  }
  // A teammate pushes a commit to <remote>/<branch> (invisible locally until fetch).
  // `remote` is a remote name, or the URL of a repo that is not added yet.
  teammatePush(branch, msg, files, author = 'teammate', remote = REMOTE) {
    const R = this._server(remote);
    const parent = R.branches[branch];
    const tree = { ...this.tree(parent) };
    for (const [p, v] of Object.entries(files)) { if (v === null) delete tree[p]; else tree[p] = norm(v); }
    const id = this._mkCommit(parent ? [parent] : [], tree, msg, author, { remoteOnly: true });
    R.branches[branch] = id;
    return id;
  }
  // Simulates GitHub merging a pull request on the server: <remote>/<into> moves, nothing local
  // changes (fetch or pull to see it). The new commits are remote-only until fetched.
  //   how 'merge'  : always a new merge commit (parents: main, PR tip), even if a fast-forward was possible
  //   how 'squash' : ONE new ordinary commit on main with the PR's combined changes; the PR's own
  //                  commits are NOT its ancestors, so git does not consider the branch merged
  //   how 'rebase' : each PR commit replayed onto main as a NEW commit (new id, committer GitHub),
  //                  then main moves to the last copy; the PR's original ids are not on main
  // deleteBranch mimics the "Delete branch" button. Throws (a setup bug) on conflicts.
  mergePullRequest(branch, { how = 'merge', into = 'main', remote = REMOTE, number = 1, title = null, by = 'you', deleteBranch = false } = {}) {
    const R = this._server(remote);
    const head = R.branches[branch], base = R.branches[into];
    if (!head || !base) throw new Error(`mergePullRequest: ${remote} has no ${head ? into : branch}`);
    if (this.isAncestor(head, base)) throw new Error(`mergePullRequest: ${branch} is already in ${into}`);
    const prCommits = this.range(base, head);
    const t = title || firstLine(this.s.commits[prCommits[0]].msg);
    const labels = { ours: into, theirs: branch };
    const extra = { remoteOnly: true, committer: 'GitHub' };
    let tip;
    if (how === 'rebase') {
      tip = base;
      for (const id of prCommits) {
        const c = this.s.commits[id];
        if (c.parents.length > 1) throw new Error('mergePullRequest: rebase-merge of a PR that contains a merge commit');
        const m = mergeTrees(this.tree(c.parents[0]), this.tree(tip), c.tree, labels);
        if (keys(m.conflicts).length) throw new Error('mergePullRequest: rebase-merge conflicts (GitHub would refuse)');
        tip = this._mkCommit([tip], m.tree, c.msg, c.author, extra);
      }
    } else {
      const m = mergeTrees(this.tree(this.mergeBase(base, head)), this.tree(base), this.tree(head), labels);
      if (keys(m.conflicts).length) throw new Error('mergePullRequest: the PR has conflicts (GitHub would refuse)');
      if (how === 'squash') tip = this._mkCommit([base], m.tree, `${t} (#${number})\n\n${prCommits.map((id) => '* ' + firstLine(this.s.commits[id].msg)).join('\n')}`, by, extra);
      else if (how === 'merge') tip = this._mkCommit([base, head], m.tree, `Merge pull request #${number} from ${by}/${branch}\n\n${t}`, by, extra);
      else throw new Error(`mergePullRequest: unknown how '${how}'`);
    }
    R.branches[into] = tip;
    if (deleteBranch) delete R.branches[branch];
    return tip;
  }
  setupDone() { this.history = []; this.out = []; this.events = []; }

  /* =========================================================== views for the UI */
  graphData() {
    const s = this.s;
    const tips = this.allRefTips();
    if (s.bisect) tips.push(s.bisect.bad, ...s.bisect.good);
    const reach = this.ancestorsOf(tips.filter(Boolean));
    const ghosts = new Set();
    const ghostSeeds = [];
    for (const [ref, log] of Object.entries(s.reflog)) {
      if (this.remoteNames().some((n) => ref.startsWith(n + '/')) && !(ref in s.branches)) continue;
      for (const e of log.slice(0, ref === 'HEAD' ? 20 : 6)) if (s.commits[e.id] && !reach.has(e.id)) ghostSeeds.push(e.id);
    }
    for (const g of ghostSeeds) {
      const stack = [g];
      while (stack.length) { const c = stack.pop(); if (reach.has(c) || ghosts.has(c)) continue; ghosts.add(c); stack.push(...s.commits[c].parents); }
    }
    const commits = [...reach, ...ghosts].map((id) => {
      const c = s.commits[id];
      return { id, parents: c.parents.filter((p) => reach.has(p) || ghosts.has(p)), msg: firstLine(c.msg), n: c.n, author: c.author, ghost: ghosts.has(id) };
    }).sort((a, b) => a.n - b.n);
    return {
      commits,
      branches: { ...s.branches },
      tags: Object.fromEntries(Object.entries(s.tags).map(([k, v]) => [k, v.id])),
      remotes: Object.fromEntries(this._allTracking()),
      head: { branch: s.head.branch || null, id: this.headId() },
      bisect: s.bisect ? { bad: s.bisect.bad, good: [...s.bisect.good] } : null,
      mergeHead: s.mergeHead,
    };
  }
  treesView() {
    const s = this.s, head = this.headTree();
    const paths = union(s.work, s.index, head, s.conflicts).filter((p) => !(this.isIgnored(p) && !this.tracked(p) && !(p in head)));
    return paths.map((p) => ({
      path: p, work: s.work[p], index: s.index[p], head: head[p],
      conflict: p in s.conflicts,
      markers: typeof s.work[p] === 'string' && /^<{7} /m.test(s.work[p]),
      untracked: !this.tracked(p) && p in s.work,
      staged: !(p in s.conflicts) && s.index[p] !== head[p],
      modified: this.tracked(p) && s.work[p] !== s.index[p] && !(p in s.conflicts),
    }));
  }
  completions() {
    const s = this.s;
    return {
      branches: keys(s.branches), tags: keys(s.tags), remotes: this._allTracking().map(([full]) => full), remoteNames: this.remoteNames(),
      files: union(s.work, s.index), commands: GIT_COMMANDS, shell: SHELL_COMMANDS,
    };
  }
  inProgress() {
    const s = this.s;
    if (s.pendingRebase) return 'rebase -i (todo)';
    if (s.seq) return s.seq.kind;
    if (s.mergeHead) return 'merge';
    if (s.bisect) return 'bisect';
    return null;
  }
}
