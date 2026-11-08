// Read-only check helpers for the bash course (the git course's helpers.js, for js/shell.js).
// Checks look at the end state (files, folders, permissions, cwd, variables) plus what the last command printed,
// so any valid route to the goal passes. Relative paths are relative to HOME (~), not to the learner's cwd,
// so a check means the same thing wherever the learner has cd'ed to. Absolute paths and ~/… work too.
import { normalize, joinPath } from '../shell/fs.js';

const at = (sh, p) => normalize(p.startsWith('/') ? p : p === '~' ? sh.s.home : p.startsWith('~/') ? sh.s.home + p.slice(1) : joinPath(sh.s.home, p));
const node = (sh, p) => sh.s.nodes[at(sh, p)];
const trimEnd = (t) => String(t ?? '').replace(/\s+$/, '');
const lines = (t) => String(t ?? '').split('\n').map((l) => l.trimEnd()).filter((l, i, a) => l !== '' || a.slice(i).some((x) => x.trim() !== ''));

export const exists = (sh, p) => !!node(sh, p);
export const isDir = (sh, p) => node(sh, p)?.type === 'dir';
export const isFile = (sh, p) => node(sh, p)?.type === 'file';
// a file's text (undefined when it is missing or a directory)
export const fileText = (sh, p) => { const n = node(sh, p); return n?.type === 'file' ? n.content : undefined; };
// exact content, ignoring trailing whitespace and the final newline; `text` may be a string or an array of lines
export const fileIs = (sh, p, text) => {
  const t = fileText(sh, p);
  if (t === undefined) return false;
  const want = Array.isArray(text) ? text.join('\n') : text;
  return lines(t).join('\n') === lines(want).join('\n');
};
export const fileHas = (sh, p, s) => { const t = fileText(sh, p); return t !== undefined && (s instanceof RegExp ? s.test(t) : t.includes(s)); };
export const fileLines = (sh, p) => lines(fileText(sh, p) ?? '');
// the names directly inside a folder (sorted, hidden ones included), [] when it is missing
export const listOf = (sh, p) => {
  const dir = at(sh, p);
  const n = sh.s.nodes[dir];
  return n?.type === 'dir' ? sh.fs.names(dir) : [];
};
// the learner ended up in this folder
export const cwdIs = (sh, p) => sh.s.cwd === at(sh, p);
// stdout of the last command line (stderr and sandbox hints excluded); trailing whitespace ignored
export const lastOut = (sh) => trimEnd(sh.lastOut);
export const lastErr = (sh) => trimEnd(sh.lastErr);
export const lastOutIs = (sh, text) => lines(sh.lastOut).join('\n') === lines(Array.isArray(text) ? text.join('\n') : text).join('\n');
export const lastOutHas = (sh, s) => (s instanceof RegExp ? s.test(sh.lastOut) : sh.lastOut.includes(s));
export const lastCode = (sh) => sh.lastCode;
// permission bits: modeHas(sh, 'run.sh', 'x') (owner can execute), modeHas(sh, f, 'u+x'), modeHas(sh, f, 'o-w'),
// or an exact octal number: modeHas(sh, f, 0o755)
export const modeOf = (sh, p) => node(sh, p)?.mode;
export function modeHas(sh, p, spec) {
  const m = modeOf(sh, p);
  if (m === undefined) return false;
  if (typeof spec === 'number') return (m & 0o7777) === spec;
  const r = String(spec).match(/^([ugoa]*)([+-]?)([rwx]+)$/);
  if (!r) throw new Error(`modeHas: bad spec ${spec}`);
  const [, who = '', sign, perms] = r;
  const whos = (who || 'u').replace('a', 'ugo');
  const shift = { u: 6, g: 3, o: 0 };
  const bit = { r: 4, w: 2, x: 1 };
  for (const w of whos) for (const q of perms) {
    const on = ((m >> shift[w]) & bit[q]) !== 0;
    if (sign === '-' ? on : !on) return false;
  }
  return true;
}
export const isExecutable = (sh, p) => modeHas(sh, p, 'u+x');
export const varIs = (sh, name, value) => sh.s.vars[name] === String(value);
export const isExported = (sh, name) => !!sh.s.exported[name] && name in sh.s.vars;
export const aliasIs = (sh, name, value) => sh.s.aliases[name] === value;
export const hasFunction = (sh, name) => !!sh.s.funcs[name];
// the learner ran a command matching re (chains split as typed lines; use sparingly: prefer state)
export const ran = (sh, re) => sh.history.some((h) => re.test(h));
// a process from setupProcess is gone
export const procGone = (sh, pid) => !sh.s.procs.some((p) => p.pid === pid);
// every path matching a predicate under a folder (relative to it), for "all .log files moved" checks
export const filesUnder = (sh, p) => {
  const dir = at(sh, p);
  if (sh.s.nodes[dir]?.type !== 'dir') return [];
  return sh.fs.descendants(dir).filter((x) => sh.s.nodes[x].type === 'file').map((x) => x.slice(dir.length + 1));
};
