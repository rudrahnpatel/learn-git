// Content loading and the path: turns UNITS into an ordered list of nodes (lessons, release
// tags, challenges, unit review) and works out which are done, current, skipped or locked.
import { UNITS as FIXTURE } from './fixture.js';
import { G } from './game.js';
import { buildNodes } from './path-nodes.js';

export let UNITS = FIXTURE;
export let contentSource = 'fixture';

const validUnits = (u) => Array.isArray(u) && u.length && u.every((x) => x && x.id && Array.isArray(x.lessons));

// Imports the real content bank when it exists; otherwise keeps the fixture.
export async function loadContent() {
  try {
    if (typeof location !== 'undefined' && /[?&]fixture\b/.test(location.search)) throw new Error('fixture forced by ?fixture');
    const mod = await import('../content/index.js');
    if (validUnits(mod.UNITS)) { UNITS = mod.UNITS; contentSource = 'content'; }
    else console.warn('learn-git: js/content/index.js has no usable UNITS; using the fixture');
  } catch (e) {
    console.info('learn-git: content bank not available, using the dev fixture.', e?.message || '');
  }
  index();
  return UNITS;
}

/* ------------------------------------------------------- exercise lookup */
// A stable key for every exercise (for the mistakes deck).
export const exKey = (lesson, ex, i) => ex.id || `${lesson.id}#${i}`;
let EX = new Map(); // key -> { ex, unit, lesson }
let NODES = [];
function index() {
  EX = new Map();
  for (const unit of UNITS) for (const lesson of unit.lessons) lesson.exercises.forEach((ex, i) => EX.set(exKey(lesson, ex, i), { ex, unit, lesson, key: exKey(lesson, ex, i) }));
  NODES = buildNodes(UNITS);
}
export const exerciseByKey = (k) => EX.get(k) || null;

/* ------------------------------------------------------------ path nodes */
// buildNodes lives in path-nodes.js (no game state) so /admin can list the same nodes.
export const nodes = () => NODES;
export const nodeById = (id) => NODES.find((n) => n.id === id) || null;
export const nodeForLevel = (levelId) => NODES.find((n) => n.kind === 'challenge' && n.levelId === levelId) || null;

export function isDone(n) {
  if (n.kind === 'challenge') return !!G.challenges[n.levelId];
  return !!G.nodes[n.id]?.done;
}
export const isSkipped = (n) => n.ui < (G.placement || 0);
export const crowns = (n) => G.nodes[n.id]?.crowns || 0;

// The first node that is not done, outside the skipped units. Everything before it is open.
export function currentNode() {
  return NODES.find((n) => !isSkipped(n) && !isDone(n)) || null;
}
export function nodeStatus(n) {
  if (isDone(n)) return 'done';
  const cur = currentNode();
  if (cur && cur.id === n.id) return 'current';
  if (isSkipped(n)) return 'skipped';
  if (!cur) return 'open';
  return NODES.indexOf(n) < NODES.indexOf(cur) ? 'open' : 'locked';
}
export function unitProgress(unit) {
  const ns = NODES.filter((n) => n.unit === unit);
  return { done: ns.filter(isDone).length, total: ns.length };
}
export const unitComplete = (unit) => { const p = unitProgress(unit); return p.done === p.total; };
export function nextNodeAfter(n) { const i = NODES.indexOf(n); return NODES.slice(i + 1).find((x) => !isDone(x)) || null; }

/* ------------------------------------------------------- lesson building */
function shuffle(a, r = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const HARD = { learn: 0, choice: 1, match: 1, fill: 2, order: 2, graph: 3, build: 3, type: 4 };

// The first play keeps the authored order. Replays drop the learn cards and shuffle; at higher
// crowns, harder types come first.
export function lessonItems(lesson, crown) {
  const items = lesson.exercises.map((ex, i) => ({ ex, key: exKey(lesson, ex, i) }));
  if (!crown) return items;
  const rest = shuffle(items.filter((x) => x.ex.type !== 'learn'));
  if (crown >= 2) rest.sort((a, b) => (HARD[b.ex.type] || 0) - (HARD[a.ex.type] || 0) + (Math.random() - 0.5) * 2.5);
  return rest.length ? rest : items;
}
export function reviewItems(unit, n = 10) {
  const all = [];
  for (const l of unit.lessons) l.exercises.forEach((ex, i) => { if (ex.type !== 'learn') all.push({ ex, key: exKey(l, ex, i) }); });
  return shuffle(all).slice(0, n);
}
