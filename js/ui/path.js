// Content loading and the path: turns UNITS into an ordered list of nodes (lessons, release
// tags, challenges, unit review) and works out which are done, current, skipped or locked.
// UNITS is the active course's content (js/courses.js); progress comes from game.courseProgress().
import { UNITS as FIXTURE } from './fixture.js';
import { G, courseProgress } from './game.js';
import { buildNodes } from './path-nodes.js';
import { courseById, isPlayable, playableId, DEFAULT_COURSE } from '../courses.js';

export let UNITS = FIXTURE;
export let contentSource = 'fixture';
export let loadedCourse = DEFAULT_COURSE;   // the course UNITS belongs to

const validUnits = (u) => Array.isArray(u) && u.length && u.every((x) => x && x.id && Array.isArray(x.lessons));
const cache = new Map();   // course id -> { units, source }

// A course's UNITS (cached). The git course falls back to the dev fixture when its content bank is missing
// (and `?fixture` forces the fixture); any other course resolves to null when it can't be loaded.
export async function unitsFor(id) {
  if (cache.has(id)) return cache.get(id).units;
  const c = courseById(id);
  if (!isPlayable(c)) return null;
  let units = null;
  try {
    if (id === DEFAULT_COURSE && typeof location !== 'undefined' && /[?&]fixture\b/.test(location.search)) throw new Error('fixture forced by ?fixture');
    const u = await c.load();
    if (validUnits(u)) units = u;
    else console.warn(`learn-git: course ${id} has no usable UNITS`);
  } catch (e) {
    console.info(`learn-git: content for ${id} not available.`, e?.message || '');
  }
  if (!units && id !== DEFAULT_COURSE) return null;
  const entry = units ? { units, source: 'content' } : { units: FIXTURE, source: 'fixture' };
  cache.set(id, entry);
  return entry.units;
}

// Loads the active course's content (G.course), falling back to the default course when this build can't
// play it (a newer build may have synced a course this one only lists as coming soon). Returns UNITS;
// `loadedCourse` says whose they are.
export async function loadContent(id = G.course) {
  let want = playableId(id);
  let units = await unitsFor(want);
  if (!units) { want = DEFAULT_COURSE; units = await unitsFor(want); }
  // the game reads the active course from G.course: keep it in step with what is loaded (persisted on the
  // next save; a newer device's choice wins again through the merge's "newer save" rule when it syncs)
  if (G.course !== want) G.course = want;
  useUnits(units, want, cache.get(want).source);
  return UNITS;
}
// Puts a course's UNITS in charge of the path (the tests call it directly).
export function useUnits(units, course = DEFAULT_COURSE, source = 'content') {
  UNITS = units; loadedCourse = course; contentSource = source;
  index();
}

/* ------------------------------------------------------- exercise lookup */
// A stable key for every exercise (for the mistakes deck).
export const exKey = (lesson, ex, i) => ex.id || `${lesson.id}#${i}`;
let EX = new Map(); // key -> { ex, unit, lesson }
let NODES = [];
function index() {
  EX = new Map();
  for (const unit of UNITS) for (const lesson of unit.lessons) lesson.exercises.forEach((ex, i) => EX.set(exKey(lesson, ex, i), { ex, unit, lesson, key: exKey(lesson, ex, i) }));
  // inline puzzles (the bash course's challenges) can put exercises in the mistakes deck too
  for (const unit of UNITS) for (const c of unit.challenges || []) if (c && typeof c === 'object') (c.exercises || []).forEach((ex, i) => EX.set(exKey(c, ex, i), { ex, unit, lesson: c, key: exKey(c, ex, i) }));
  NODES = buildNodes(UNITS);
}
export const exerciseByKey = (k) => EX.get(k) || null;

/* ------------------------------------------------------------ path nodes */
// buildNodes lives in path-nodes.js (no game state) so /admin can list the same nodes.
export const nodes = () => NODES;
export const nodeById = (id) => NODES.find((n) => n.id === id) || null;
export const nodeForLevel = (levelId) => NODES.find((n) => n.kind === 'challenge' && n.levelId === levelId) || null;

const progress = () => courseProgress(loadedCourse);
// Challenge nodes are v1 git levels, recorded in the git course's challenges (see game.completeChallenge); an
// inline puzzle (n.puzzle, the bash course) is recorded in its own course's challenges (game.completePuzzle).
export function isDone(n) {
  if (n.kind === 'challenge') return !!(n.puzzle ? progress() : courseProgress('git')).challenges[n.levelId];
  return !!progress().nodes[n.id]?.done;
}
export const isSkipped = (n) => n.ui < (progress().placement || 0);
export const crowns = (n) => progress().nodes[n.id]?.crowns || 0;

// The first node that is not done, outside the skipped units: the START bubble. Everything before it is
// open. "Unlock all levels" doesn't move it: it still points at the next unfinished node in path order.
export function currentNode() {
  return NODES.find((n) => !isSkipped(n) && !isDone(n)) || null;
}
// A reward crate is earned by the lessons that lead up to it: those since the previous crate in its unit.
export function crateEarned(n) {
  for (let i = NODES.indexOf(n) - 1; i >= 0; i--) {
    const m = NODES[i];
    if (m.unit !== n.unit || m.kind === 'release') break;
    if (m.kind === 'lesson' && !isDone(m)) return false;
  }
  return true;
}
// done | current | skipped | open | locked.
// With "Unlock all levels" (G.unlockAll) every node after the current one is open too, except a crate whose
// lessons aren't done yet: a crate is a reward for those lessons, so it stays locked until they are, and (as
// always) it opens once. The setting changes only what is open; turning it off brings the locks back, and
// anything finished meanwhile stays done.
export function nodeStatus(n) {
  if (isDone(n)) return 'done';
  const cur = currentNode();
  if (cur && cur.id === n.id) return 'current';
  if (isSkipped(n)) return 'skipped';
  if (!cur) return 'open';
  if (NODES.indexOf(n) < NODES.indexOf(cur)) return 'open';
  if (G.unlockAll) return n.kind === 'release' && !crateEarned(n) ? 'locked' : 'open';
  return 'locked';
}
export function unitProgress(unit) {
  const ns = NODES.filter((n) => n.unit === unit);
  return { done: ns.filter(isDone).length, total: ns.length };
}
export const unitComplete = (unit) => { const p = unitProgress(unit); return p.done === p.total; };
export function nextNodeAfter(n) { const i = NODES.indexOf(n); return NODES.slice(i + 1).find((x) => !isDone(x)) || null; }

/* ------------------------------------------------------- lesson building */
function shuffle(a, r = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const HARD = { learn: 0, choice: 1, match: 1, fill: 2, order: 2, graph: 3, outcome: 3, build: 3, type: 4 };

// The first play keeps the authored order. Replays drop the learn cards and shuffle; at higher
// crowns, harder types come first.
export function lessonItems(lesson, crown) {
  const items = lesson.exercises.map((ex, i) => ({ ex, key: exKey(lesson, ex, i) }));
  if (!crown) return items;
  const rest = shuffle(items.filter((x) => x.ex.type !== 'learn'));
  if (crown >= 2) rest.sort((a, b) => (HARD[b.ex.type] || 0) - (HARD[a.ex.type] || 0) + (Math.random() - 0.5) * 2.5);
  return rest.length ? rest : items;
}
// An inline puzzle plays its exercises in order, every time.
export const puzzleItems = (puzzle) => puzzle.exercises.map((ex, i) => ({ ex, key: exKey(puzzle, ex, i) }));
export function reviewItems(unit, n = 10) {
  const all = [];
  for (const l of unit.lessons) l.exercises.forEach((ex, i) => { if (ex.type !== 'learn') all.push({ ex, key: exKey(l, ex, i) }); });
  return shuffle(all).slice(0, n);
}
