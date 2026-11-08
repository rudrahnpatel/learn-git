// In-memory filesystem for the simulated shell: a flat map of absolute path -> node.
// Pure data (JSON-serialisable), no DOM. See .notes/shell-engine.md.
//   node = { type: 'dir' | 'file' | 'dev', mode: 0o644, owner: 'you', mtime: <epoch s>, content?: '…', bin?: 'ls' }
// `bin` marks a file in /usr/bin that runs a built-in utility; `dev` is /dev/null.

export const ERRORS = {
  ENOENT: 'No such file or directory', EACCES: 'Permission denied', EISDIR: 'Is a directory',
  ENOTDIR: 'Not a directory', EEXIST: 'File exists', ENOTEMPTY: 'Directory not empty',
  EPERM: 'Operation not permitted', EINVAL: 'Invalid argument',
};
export class FsError extends Error {
  constructor(code) { super(ERRORS[code] || code); this.code = code; }
}
const err = (code) => { throw new FsError(code); };

// Codepoint order everywhere (LC_ALL=C): uppercase before lowercase, predictable in tests and lessons.
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ------------------------------------------------------------------ paths */
export function normalize(p) {
  const out = [];
  for (const seg of String(p).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return '/' + out.join('/');
}
export const joinPath = (a, b) => (b.startsWith('/') ? b : a === '/' ? '/' + b : a + '/' + b);
export const dirname = (p) => { if (p === '/') return '/'; const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
export const basename = (p) => (p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1));
export const isUnder = (p, dir) => p === dir || p.startsWith(dir === '/' ? '/' : dir + '/');

/* ------------------------------------------------------------------ globs */
const POSIX_CLASS = {
  alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', word: 'a-zA-Z0-9_',
};
// Translate a bracket expression starting at pat[i] === '['. Returns [regexSource, nextIndex] or null.
export function bracket(pat, i) {
  let j = i + 1, neg = false, body = '';
  if (pat[j] === '!' || pat[j] === '^') { neg = true; j++; }
  let first = true;
  while (j < pat.length) {
    const c = pat[j];
    if (c === ']' && !first) return [`[${neg ? '^' : ''}${body}]`, j + 1];
    first = false;
    if (c === '[' && pat[j + 1] === ':') {
      const end = pat.indexOf(':]', j + 2);
      if (end > 0 && POSIX_CLASS[pat.slice(j + 2, end)]) { body += POSIX_CLASS[pat.slice(j + 2, end)]; j = end + 2; continue; }
    }
    if (c === '\\' && j + 1 < pat.length) { body += '\\' + pat[j + 1]; j += 2; continue; }
    body += /[\]\\^]/.test(c) ? '\\' + c : c;
    j++;
  }
  return null;
}
// A shell pattern (glob) to a RegExp source. Backslash escapes the next character (quoted text arrives escaped).
// slash: whether * and ? may match '/' (true for ${v%pat} and find -path, false for pathname segments).
export function globSource(pat, { slash = false } = {}) {
  let re = '';
  const any = slash ? '.' : '[^/]';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\' && i + 1 < pat.length) { re += escapeRe(pat[++i]); continue; }
    if (c === '*') { re += any + '*'; continue; }
    if (c === '?') { re += any; continue; }
    if (c === '[') { const b = bracket(pat, i); if (b) { re += b[0]; i = b[1] - 1; continue; } }
    re += escapeRe(c);
  }
  return re;
}
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
export const globRegExp = (pat, opts = {}) => new RegExp('^' + globSource(pat, opts) + '$', opts.flags || '');
// Does the (escaped) pattern contain an active glob character?
export function hasGlob(pat) {
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\') { i++; continue; }
    if (c === '*' || c === '?') return true;
    if (c === '[' && bracket(pat, i)) return true;
  }
  return false;
}
export const unescapeGlob = (s) => s.replace(/\\(.)/g, '$1');
export const escapeGlob = (s) => s.replace(/[\\*?[\]]/g, '\\$&');

/* ------------------------------------------------------------------ the filesystem */
export class FS {
  // host provides: s (state with nodes, user), now() -> epoch seconds
  constructor(host) { this.host = host; }
  get nodes() { return this.host.s.nodes; }
  get user() { return this.host.s.user; }

  can(n, what) {
    if (this.user === 'root') return what !== 'x' || n.type === 'dir' || (n.mode & 0o111) !== 0;
    const shift = n.owner === this.user ? 6 : 0;
    return ((n.mode >> shift) & { r: 4, w: 2, x: 1 }[what]) !== 0;
  }
  // Every ancestor must exist, be a directory and be searchable (x).
  walk(p) {
    if (p === '/') return;
    const segs = p.split('/');
    let cur = '';
    for (let i = 1; i < segs.length - 1; i++) {
      cur += '/' + segs[i];
      const n = this.nodes[cur];
      if (!n) err('ENOENT');
      if (n.type !== 'dir') err('ENOTDIR');
      if (!this.can(n, 'x')) err('EACCES');
    }
    const root = this.nodes['/'];
    if (root && !this.can(root, 'x')) err('EACCES');
  }
  stat(p) { this.walk(p); const n = this.nodes[p]; if (!n) err('ENOENT'); return n; }
  tryStat(p) { try { return this.stat(p); } catch { return null; } }
  exists(p) { return !!this.tryStat(p); }
  isDir(p) { return this.tryStat(p)?.type === 'dir'; }
  isFile(p) { const n = this.tryStat(p); return !!n && n.type !== 'dir'; }

  // Names directly inside a directory (no permission check: callers check r).
  names(dir) {
    const pre = dir === '/' ? '/' : dir + '/';
    const out = [];
    for (const k of Object.keys(this.nodes)) {
      if (k.length > pre.length && k.startsWith(pre) && !k.includes('/', pre.length)) out.push(k.slice(pre.length));
    }
    return out.sort(cmp);
  }
  list(dir) {
    const n = this.stat(dir);
    if (n.type !== 'dir') err('ENOTDIR');
    if (!this.can(n, 'r')) err('EACCES');
    return this.names(dir);
  }
  // Every path under dir (not dir itself), depth-first in sorted order.
  descendants(dir) {
    const out = [];
    const rec = (d) => { for (const nm of this.names(d)) { const p = joinPath(d, nm); out.push(p); if (this.nodes[p].type === 'dir') rec(p); } };
    rec(dir);
    return out;
  }

  read(p) {
    const n = this.stat(p);
    if (n.type === 'dir') err('EISDIR');
    if (n.type === 'dev') return '';
    if (!this.can(n, 'r')) err('EACCES');
    return n.content || '';
  }
  // The parent directory must exist and be writable to create or delete an entry in it.
  _parentForChange(p) {
    const parent = this.stat(dirname(p));
    if (parent.type !== 'dir') err('ENOTDIR');
    if (!this.can(parent, 'w') || !this.can(parent, 'x')) err('EACCES');
    return parent;
  }
  write(p, text, { append = false } = {}) {
    if (p === '/') err('EISDIR');
    this.walk(p);
    const n = this.nodes[p];
    if (n) {
      if (n.type === 'dir') err('EISDIR');
      if (n.type === 'dev') return;
      if (!this.can(n, 'w')) err('EACCES');
      n.content = append ? (n.content || '') + text : text;
      n.mtime = this.host.now();
      return;
    }
    const parent = this.nodes[dirname(p)];
    if (!parent) err('ENOENT');
    this._parentForChange(p);
    this.nodes[p] = { type: 'file', mode: 0o644, owner: this.user, mtime: this.host.now(), content: text };
  }
  touch(p, { create = true } = {}) {
    this.walk(p);
    const n = this.nodes[p];
    if (n) { if (n.type !== 'dev') { if (!this.can(n, 'w') && n.owner !== this.user) err('EACCES'); n.mtime = this.host.now(); } return; }
    if (!create) return;
    this.write(p, '');
  }
  mkdir(p) {
    if (this.nodes[p]) { this.walk(p); err('EEXIST'); }
    this.walk(p);
    if (!this.nodes[dirname(p)]) err('ENOENT');
    this._parentForChange(p);
    this.nodes[p] = { type: 'dir', mode: 0o755, owner: this.user, mtime: this.host.now() };
  }
  // Remove one entry. Directories must be empty unless recursive.
  remove(p, { recursive = false } = {}) {
    const n = this.stat(p);
    this._parentForChange(p);
    if (n.type === 'dir') {
      const kids = this.names(p);
      if (kids.length && !recursive) err('ENOTEMPTY');
      for (const k of kids) this.remove(joinPath(p, k), { recursive: true });
    }
    delete this.nodes[p];
  }
  // Move a whole subtree (rename). Caller has checked the target makes sense.
  rename(from, to) {
    this.stat(from);
    this._parentForChange(from);
    this.walk(to);
    if (!this.nodes[dirname(to)]) err('ENOENT');
    this._parentForChange(to);
    const moves = Object.keys(this.nodes).filter((k) => isUnder(k, from));
    const moved = moves.map((k) => [to + k.slice(from.length), this.nodes[k]]);
    for (const k of moves) delete this.nodes[k];
    for (const [k, v] of moved) this.nodes[k] = v;
  }
  chmod(p, mode) {
    const n = this.stat(p);
    if (n.owner !== this.user && this.user !== 'root') err('EPERM');
    n.mode = mode & 0o7777;
  }

  // Expand a glob pattern (backslash-escaped where quoted) relative to cwd.
  // Returns the matches as typed (relative stays relative), sorted; [] when nothing matches.
  glob(pattern, cwd) {
    const abs = pattern.startsWith('/');
    const trailing = pattern.endsWith('/');
    const segs = pattern.split('/').filter((s, i) => s !== '' || i === 0);
    if (abs) segs.shift();
    let cands = [{ disp: abs ? '/' : '', abs: abs ? '/' : cwd }];
    for (const seg of segs) {
      if (seg === '') continue;
      const next = [];
      for (const c of cands) {
        const sep = c.disp === '' || c.disp.endsWith('/') ? '' : '/';
        if (hasGlob(seg)) {
          const n = this.tryStat(c.abs);
          if (!n || n.type !== 'dir' || !this.can(n, 'r')) continue;
          const re = globRegExp(seg);
          const dotOk = seg.startsWith('.') || seg.startsWith('\\.');
          for (const name of this.names(c.abs)) {
            if (name.startsWith('.') && !dotOk) continue;
            if (re.test(name)) next.push({ disp: c.disp + sep + name, abs: joinPath(c.abs, name) });
          }
        } else {
          const lit = unescapeGlob(seg);
          next.push({ disp: c.disp + sep + lit, abs: normalize(joinPath(c.abs, lit)) });
        }
      }
      cands = next;
    }
    return cands
      .filter((c) => { const n = this.tryStat(c.abs); return n && (!trailing || n.type === 'dir'); })
      .map((c) => c.disp + (trailing ? '/' : ''))
      .sort(cmp);
  }
}

// rwx string for a mode: 0o755 dir -> 'drwxr-xr-x'
export function modeString(n) {
  const t = n.type === 'dir' ? 'd' : n.type === 'dev' ? 'c' : '-';
  let s = t;
  for (const shift of [6, 3, 0]) {
    const b = (n.mode >> shift) & 7;
    s += (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-');
  }
  if (n.mode & 0o1000) s = s.slice(0, 9) + (n.mode & 1 ? 't' : 'T');
  return s;
}
