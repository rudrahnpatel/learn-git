// Shared scenario builders for the bash course, plus the read-only check helpers from ../shell-helpers.js.
// A builder takes a Shell and fills in files; exercises use them as `setup` and, with different data, as
// `variant` (the anti-cheat replay: see js/shellex.js and .notes/bash-course-terminal-basics.md).
export * from '../shell-helpers.js';
import { listOf, fileText, fileLines, lastOut, lastOutIs } from '../shell-helpers.js';
import { normalize, joinPath } from '../../shell/fs.js';

// The learner's home: a few folders a real person might have. `v` picks a second data set with other names.
export const home = (v = 0) => (sh) => sh.setupFiles(v ? {
  'notes/plan.txt': 'Plan the trip\nBook the train\n', 'notes/books.txt': 'Dune\nEmma\nUlysses\n',
  'photos/2023/lake.jpg': '', 'photos/2023/hill.jpg': '', 'photos/dog.jpg': '',
  'projects/shop/index.html': '<h1>Shop</h1>\n', 'projects/shop/app.js': 'start()\n',
  'music/': null, 'readme.txt': 'My files.\n', '.profile': 'export EDITOR=nano\n',
} : {
  'notes/todo.txt': 'Buy milk\nCall mum\nWater the plants\n', 'notes/ideas.txt': 'A tiny game\nA recipe site\n',
  'photos/2024/beach.jpg': '', 'photos/2024/city.jpg': '', 'photos/cat.jpg': '',
  'projects/website/index.html': '<h1>Hello</h1>\n', 'projects/website/style.css': 'h1 { color: teal; }\n',
  'readme.txt': 'This is your home folder.\n', '.bashrc': 'alias ll="ls -l"\n',
});
export const homeIn = (cwd, v = 0) => (sh) => { home(v)(sh); sh.setupCwd(cwd); };

// "every name in this folder appears in the last output" (any order, any layout: ls, ls -1, ls -a)
export const listed = (sh, dir, { hidden = false } = {}) => {
  const names = listOf(sh, dir).filter((n) => hidden || !n.startsWith('.'));
  const words = new Set(lastOut(sh).split(/\s+/));
  return names.length > 0 && names.every((n) => words.has(n));
};
// the last output is exactly this file's text
export const printed = (sh, p) => fileText(sh, p) !== undefined && lastOutIs(sh, fileText(sh, p));
// the last output is these lines of a file (1-based, inclusive)
export const printedLines = (sh, p, from, to) => {
  const ls = String(fileText(sh, p) ?? '').replace(/\n$/, '').split('\n');
  return lastOutIs(sh, ls.slice(from - 1, to).join('\n'));
};
// what `wc -l` counts: newline characters
export const lineCount = (sh, p) => (String(fileText(sh, p) ?? '').match(/\n/g) || []).length;
export const wordCount = (sh, p) => String(fileText(sh, p) ?? '').split(/\s+/).filter(Boolean).length;
// a number alone on the last output (wc -l < f, ls | wc -l), or as the first word (wc -l f)
export const printedNumber = (sh, n) => lastOut(sh).trim().split(/\s+/)[0] === String(n);
// numbered lines like `cat -n` prints them
export const numberedLines = (text) => String(text).replace(/\n$/, '').split('\n').map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n');

// A log file of n lines that makes counting worth a command.
export const logLines = (n, seed = 1) => Array.from({ length: n }, (_, i) => {
  const k = (i * 7 + seed * 13) % 24;
  const lvl = (i + seed) % 5 === 0 ? 'ERROR' : (i + seed) % 3 === 0 ? 'WARN' : 'INFO';
  return `2026-01-05 ${String(8 + (k % 10)).padStart(2, '0')}:${String((i * 11 + seed) % 60).padStart(2, '0')} ${lvl} ${['login ok', 'page served', 'cache miss', 'disk slow', 'user saved', 'timeout'][(i + seed) % 6]}`;
}).join('\n') + '\n';

/* ------------------------------------------------------------ units 5-8 (searching, text, permissions, variables) */
// The last output's lines in any order: on a real disk `find` and `grep -r` walk folders in directory order, not
// sorted, so a check must not depend on the order.
const sameSet = (got, want) => {
  const g = got.map((l) => l.trim()).filter(Boolean).sort();
  const w = [...want].map(String).sort();
  return g.length === w.length && g.every((x, i) => x === w[i]);
};
export const printedSet = (sh, want) => sameSet(lastOut(sh).split('\n'), want);
// A path as the learner's command printed it (./src/a.js from ~, a.js from ~/src, /home/you/src/a.js), made
// relative to ~: src/a.js ('.' for ~ itself).
export const fromHome = (sh, p) => {
  const abs = normalize(p.startsWith('/') ? p : joinPath(sh.s.cwd, p));
  return abs === sh.s.home ? '.' : abs.startsWith(sh.s.home + '/') ? abs.slice(sh.s.home.length + 1) : abs;
};
const outLines = (sh) => lastOut(sh).split('\n').map((l) => l.trim()).filter(Boolean);
// The last output is exactly these paths (relative to ~), in any order, wherever they were listed from.
export const printedPaths = (sh, want) => sameSet(outLines(sh).map((l) => fromHome(sh, l)), want);
// grep -r style lines (path:rest) with the paths made relative to ~, in any order
export const printedHits = (sh, want) => sameSet(outLines(sh).map((l) => { const i = l.indexOf(':'); return i < 0 ? l : fromHome(sh, l.slice(0, i)) + l.slice(i); }), want);
// the lines of a file that match a test (a RegExp or a function), the way grep prints them
export const linesWith = (sh, p, test) => fileLines(sh, p).filter((l) => (test instanceof RegExp ? test.test(l) : test(l)));
