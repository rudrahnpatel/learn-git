// Small read-only helpers for exercise checks, plus a few shared scenario builders.
// Checks look at repo state (like v1 levels), so any valid route to the goal passes.
import { firstLine } from '../git.js';

export const msgAt = (r, ref) => { const id = r.tryResolve(ref); return id ? firstLine(r.commit(id).msg) : null; };
export const fileAt = (r, ref, p) => { const id = r.tryResolve(ref); return id ? r.tree(id)[p] : undefined; };
export const has = (txt, s) => typeof txt === 'string' && txt.includes(s);
export const settled = (r) => !r.inProgress();
export const clean = (r) => r.isClean() && settled(r);
export const spotless = (r) => clean(r) && r.untracked().length === 0;
export const span = (r, a, b) => { const B = r.tryResolve(b); return B ? r.range(r.tryResolve(a), B) : []; };
export const noMerges = (r, a, b) => span(r, a, b).every((id) => r.commit(id).parents.length < 2);
export const isMerge = (r, ref) => { const id = r.tryResolve(ref); return !!id && r.commit(id).parents.length === 2; };
export const staged = (r, p) => r.stagedChanges().includes(p);
export const pushed = (r, b = 'main') => !!r.s.remote && r.s.remote.branches[b] === r.s.branches[b] && r.s.tracking[b] === r.s.branches[b];
export const tagAt = (r, t) => r.s.tags[t]?.id || null;
// the commit a tag points at, found by its message
export const tagMsg = (r, t) => { const id = tagAt(r, t); return id ? firstLine(r.commit(id).msg) : null; };
export const ran = (r, re) => r.history.some((h) => re.test(h));
// no conflict markers left in any working-tree file
export const markerFree = (r) => !Object.values(r.s.work).some((t) => /^(<{7}|>{7})( |$)/m.test(t));
// a working-tree file's lines, trailing spaces and blank lines ignored (for `resolve` exercise checks)
export const linesOf = (r, p) => String(r.s.work[p] ?? '').split('\n').map((l) => l.trimEnd()).filter(Boolean);
export const workIs = (r, p, lines) => { const got = linesOf(r, p); return got.length === lines.length && lines.every((l, i) => got[i] === l); };

/* ------------------------------------------------ shared scenarios */
// A recipe site with two commits on main.
export function recipeSite(r) {
  r.setupCommit('Initial commit', { 'README.md': '# Recipe box\nFamily recipes, one per file.', 'index.html': '<h1>Recipe box</h1>' });
  r.setupCommit('Add pancakes', { 'pancakes.txt': 'Pancakes\n2 eggs\n1 cup flour\n1 cup milk' });
}
// main and feature have both moved on since they split.
export function diverged(r, { feature = 'reviews', file = 'reviews.html' } = {}) {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>', 'about.html': '<p>Abuot</p>' });
  r.sh(`git switch -c ${feature}`);
  r.setupCommit('Add reviews page', { [file]: '<h2>Reviews</h2>' });
  r.sh('git switch main');
  r.setupCommit('Fix typo on about page', { 'about.html': '<p>About</p>' });
}
// main stays put; feature is two commits ahead of it.
export function aheadFeature(r, name = 'feature') {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>' });
  r.sh(`git switch -c ${name}`);
  r.setupCommit('Add search box', { 'search.html': '<input type=search>' });
  r.setupCommit('Style search box', { 'search.css': 'input { width: 100%; }' });
  r.sh('git switch main');
}
// A menu that conflicts: main and spring both changed the starter.
export function menuConflict(r) {
  r.setupCommit('Initial commit', { 'menu.txt': 'Menu\nStarter: soup\nMain: pasta\nDessert: cake' });
  r.sh('git switch -c spring');
  r.setupCommit('Spring starter', { 'menu.txt': 'Menu\nStarter: asparagus salad\nMain: pasta\nDessert: cake' });
  r.sh('git switch main');
  r.setupCommit('Winter starter', { 'menu.txt': 'Menu\nStarter: pumpkin soup\nMain: pasta\nDessert: cake' });
}
// A game with four commits on main.
export function gameHistory(r) {
  r.setupCommit('Initial commit', { 'game.js': 'let score = 0;' });
  r.setupCommit('Add player movement', { 'player.js': 'move()' });
  r.setupCommit('Add enemies', { 'enemies.js': 'spawn()' });
  r.setupCommit('Add level 2', { 'level2.js': 'load(2)' });
}
// A cafe price list with authors, for the detective unit.
export function cafeHistory(r) {
  r.setupCommit('Initial commit', { 'prices.txt': 'coffee 3.00\ntea 2.50', 'README.md': '# Cafe\nFree wifi' }, 'lead');
  r.setupCommit('Update README', { 'README.md': '# Cafe\nFree wifi\nOpen 8-18' }, 'designer');
  r.setupCommit('Tweak styles', { 'style.css': 'body { font: 16px serif; }' }, 'designer');
  r.setupCommit('Small cleanups', { 'prices.txt': 'coffee 3.50\ntea 2.50' }, 'intern');
  r.setupCommit('Fix header', { 'header.html': '<h1>Cafe</h1>', 'README.md': '# Cafe\nOpen 8-18' }, 'lead');
  r.setupCommit('Add cocoa', { 'prices.txt': 'coffee 3.50\ntea 2.50\ncocoa 3.20' }, 'teammate');
  r.setupCommit('Refactor cart', { 'cart.js': 'cart()' }, 'lead');
}
