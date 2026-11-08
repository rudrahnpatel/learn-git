// Gamification state and rules: XP, daily goal, streak (with stashes), cherries, daily quests,
// release tags, fast-forward boosts, achievements, crowns and the mistakes deck. No DOM here: the
// screens call these functions and render the events they return.
//
// The reward layer is git-themed, but the saved field names predate the theme and are kept as
// they are so existing saves load untouched (see .notes/learn-git-v2-ui.md):
//   G.gems                     -> cherries (the currency)
//   G.streak.freezes / frozen  -> stashes held / days a stash covered ("popped")
//   G.stats.chests             -> releases shipped
//   path nodes `<unit>:chest:<n>` and G.quests.chest/chestOpened -> release tags and the daily release
//   G.boostUntil               -> fast-forward (2x XP) end time
// G.gems and G.streak.freezes are read-only mirrors of the ledger in G.wallet (js/wallet.js): change
// them only through earnGems / spendGems / addStashes / useStashes below.
import { loadState, saveState, resetState, freshCourse, deviceId, STATE_KEY } from '../storage.js';
import { record, writeMirrors, balance, stashKey } from '../wallet.js';
import { ITEMS, itemById } from './cosmetics.js';
import { CARDS } from '../content/cards.js';

export let G = loadState();
// Cloud sync (js/cloud/) sets a hook while someone is signed in: it stamps the save and queues a push.
// Guests never have one, so for them save() is exactly saveState(G).
let saveHook = null;
export const setSaveHook = (fn) => { saveHook = fn; };
export const save = () => { saveHook?.(G); return saveState(G); };
export function resetAll() { resetState(); G = loadState(); }
// Adopts a merged state from the cloud (it already contains everything in G).
export function replaceState(s) { G = s; saveState(G); }
// Another tab saved: adopt its state, so this tab's next save can't write stale progress over it.
try { window.addEventListener('storage', (e) => { if (e.key === STATE_KEY && e.newValue) G = loadState(); }); } catch { /* no window (tests) */ }

/* ---------------------------------------------------------------- dates */
const pad = (n) => String(n).padStart(2, '0');
export function dayKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}
export const today = () => dayKey();

/* ------------------------------------------------------------- constants */
export const GOALS = [
  { xp: 10, label: 'Casual', note: '1 lesson a day' },
  { xp: 20, label: 'Regular', note: '2 lessons a day' },
  { xp: 30, label: 'Serious', note: '3 lessons a day' },
  { xp: 50, label: 'Intense', note: 'a lesson and a challenge, or more' },
];
export const PLACEMENTS = [
  { label: 'I\'m new to git', note: 'Start from the very first commit.' },
  { label: 'I commit & push', note: 'Skip the basics.' },
  { label: 'I branch & merge', note: 'Start at rewriting history.' },
  { label: 'I rebase & rescue', note: 'Jump to undoing and rescues.' },
];
export const STASH_COST = 50;   // cherries
export const MAX_STASHES = 2;
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];
const BOOST_MS = 15 * 60 * 1000;

/* --------------------------------------------------------------- wallet */
// The only places cherries and stashes change. Each adds to a counter in the ledger and re-derives
// G.gems / G.streak.freezes; none of them saves (the caller does, once).
function ledger(k, side, key, n) {
  record(G.wallet[k], side, key, n);
  writeMirrors(G);
}
export function earnGems(n) { if (n > 0) ledger('gems', 'earn', deviceId(), n); }
// false (and nothing changes) when the balance can't cover it: spending never goes below 0 here.
export function spendGems(n) {
  if (!(n > 0)) return true;
  if (balance(G.wallet.gems) < n) return false;
  ledger('gems', 'spend', deviceId(), n);
  return true;
}
export function addStashes(n) { if (n > 0) ledger('freezes', 'earn', deviceId(), n); }
// A popped stash is keyed by the day it covers, not by device: two devices that both pop the same
// missed day (each on load, before syncing) use one stash between them, not two. The merge also hands
// back a stash whose day turns out to have been played on another device (see js/wallet.js).
export function useStashes(days) {
  if (!days.length) return true;
  const fresh = days.filter((d) => !G.wallet.freezes.spend[stashKey(d)]);
  if (balance(G.wallet.freezes) < fresh.length) return false;
  for (const d of fresh) ledger('freezes', 'spend', stashKey(d), 1);
  return true;
}

/* -------------------------------------------------------------- XP / day */
export const xpToday = () => G.xpByDay[today()] || 0;
export const boostActive = () => G.boostUntil > Date.now();
export const boostLeftMin = () => Math.max(0, Math.ceil((G.boostUntil - Date.now()) / 60000));

// Adds XP (doubled during a boost). Returns { gained, goalReached, streak } events.
export function addXp(base, { noBoost = false } = {}) {
  const gained = Math.round(base * (!noBoost && boostActive() ? 2 : 1));
  const before = xpToday();
  G.xpByDay[today()] = before + gained;
  G.totalXp += gained;
  const ev = { gained, goalReached: false, streak: null };
  if (before < G.goal && before + gained >= G.goal) {
    ev.goalReached = true;
    ev.streak = extendStreak();
  }
  questProgress('xp', gained);
  save();
  return ev;
}

/* --------------------------------------------------------------- streak */
// Called on load: stashes cover missed days automatically (they "pop"); otherwise the streak breaks.
export function applyStreak() {
  const s = G.streak, t = today();
  if (!s.lastDay || s.count === 0) return null;
  const gap = daysBetween(s.lastDay, t);
  if (gap <= 1) return null;
  const missed = gap - 1;
  const days = Array.from({ length: missed }, (_, i) => addDays(s.lastDay, i + 1));
  if (useStashes(days)) {
    s.frozen.push(...days);
    s.frozen = s.frozen.slice(-30);
    s.lastDay = addDays(t, -1);
    save();
    return { poppedDays: missed };
  }
  const lost = s.count;
  s.count = 0;
  save();
  return { lost };
}
function extendStreak() {
  const s = G.streak, t = today();
  G.goalDays[t] = true;
  if (s.lastDay === t) return null;
  s.count = s.lastDay === addDays(t, -1) ? s.count + 1 : 1;
  s.lastDay = t;
  s.best = Math.max(s.best, s.count);
  const milestone = STREAK_MILESTONES.includes(s.count) ? s.count : null;
  checkAchievements();
  return { count: s.count, milestone };
}
export const streakAlive = () => G.streak.count > 0 && (G.streak.lastDay === today() || G.streak.lastDay === addDays(today(), -1));
export const shownStreak = () => (streakAlive() ? G.streak.count : 0);
export const doneToday = () => G.streak.lastDay === today();

// Mon..Sun of the current week: { key, label, state: 'done'|'stashed'|'today'|'missed'|'future' }
export function weekDays() {
  const t = today();
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const out = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(t, i - dow);
    const label = 'MTWTFSS'[i];
    let state = 'missed';
    if (G.goalDays[key]) state = 'done';
    else if (G.streak.frozen.includes(key)) state = 'stashed';
    else if (key === t) state = 'today';
    else if (key > t) state = 'future';
    out.push({ key, label, state });
  }
  return out;
}

export function buyStash() {
  if (G.streak.freezes >= MAX_STASHES || !spendGems(STASH_COST)) return false;
  addStashes(1);
  save();
  return true;
}

/* ---------------------------------------------------------------- quests */
const QUEST_POOL = [
  { id: 'xp30', kind: 'xp', n: 30, text: 'Earn 30 XP', cherries: 10 },
  { id: 'xp50', kind: 'xp', n: 50, text: 'Earn 50 XP', cherries: 15 },
  { id: 'xp20', kind: 'xp', n: 20, text: 'Earn 20 XP', cherries: 5 },
  { id: 'combo8', kind: 'combo', n: 8, text: 'Get 8 right in a row', cherries: 10 },
  { id: 'combo5', kind: 'combo', n: 5, text: 'Get 5 right in a row', cherries: 5 },
  { id: 'perfect', kind: 'perfect', n: 1, text: 'Merge a lesson with zero mistakes', cherries: 10 },
  { id: 'lessons2', kind: 'lessons', n: 2, text: 'Merge 2 lessons', cherries: 10 },
  { id: 'lessons3', kind: 'lessons', n: 3, text: 'Merge 3 lessons', cherries: 15 },
  { id: 'challenge', kind: 'challenge', n: 1, text: 'Complete a challenge', cherries: 15 },
  { id: 'review5', kind: 'review', n: 5, text: 'Fix 5 old mistakes', cherries: 10 },
  { id: 'type3', kind: 'typed', n: 3, text: 'Type 3 commands right', cherries: 10 },
  { id: 'practice', kind: 'practice', n: 1, text: 'Play a practice round', cherries: 5 },
];
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = typeof seed === 'number' ? seed : hash(String(seed)); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 3 quests, picked deterministically from the date, never two of the same kind.
export function questsFor(day = today()) {
  const r = rng('quests:' + day);
  const pool = [...QUEST_POOL];
  const out = [], kinds = new Set();
  while (out.length < 3 && pool.length) {
    const q = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (kinds.has(q.kind)) continue;
    kinds.add(q.kind);
    out.push(q);
  }
  return out;
}
function ensureQuestDay() {
  if (G.quests.day !== today()) G.quests = { day: today(), progress: {}, claimed: {}, chest: false };
}
export function quests() {
  ensureQuestDay();
  return questsFor().map((q) => ({ ...q, progress: Math.min(q.n, G.quests.progress[q.id] || 0), done: (G.quests.progress[q.id] || 0) >= q.n, claimed: !!G.quests.claimed[q.id] }));
}
let questEvents = [];
// kind: xp | combo (value = current combo, max-tracked) | perfect | lessons | challenge | review | typed | practice
export function questProgress(kind, value = 1) {
  ensureQuestDay();
  for (const q of questsFor()) {
    if (q.kind !== kind || G.quests.claimed[q.id]) continue;
    const prev = G.quests.progress[q.id] || 0;
    const next = kind === 'combo' ? Math.max(prev, value) : prev + value;
    G.quests.progress[q.id] = next;
    if (prev < q.n && next >= q.n) {
      G.quests.claimed[q.id] = true;
      earnGems(q.cherries);
      questEvents.push({ type: 'quest', quest: q });
    }
  }
  if (!G.quests.chest && questsFor().every((q) => G.quests.claimed[q.id])) {
    G.quests.chest = true;
    questEvents.push({ type: 'daily-release' });
  }
  save();
}
export function takeQuestEvents() { const e = questEvents; questEvents = []; return e; }

/* -------------------------------------------------------------- releases */
// Shipping a release tag is the variable reward: 5-30 cherries, sometimes a 15-minute
// fast-forward (2x XP) on top.
export function shipRelease(seedExtra = '') {
  const r = rng(`chest:${Date.now()}:${seedExtra}:${Math.random()}`);
  const roll = r();
  const cherries = roll < 0.5 ? 5 + Math.floor(r() * 8) : roll < 0.85 ? 12 + Math.floor(r() * 10) : 22 + Math.floor(r() * 9);
  const boost = r() < 0.22;
  earnGems(cherries);
  if (boost) G.boostUntil = Math.max(Date.now(), G.boostUntil) + BOOST_MS;
  G.stats.chests++;
  checkAchievements();
  save();
  return { cherries, boost };
}

/* ------------------------------------------------------------ path nodes */
export const nodeState = (id) => G.nodes[id] || null;
export function completeNode(id, { accuracy = 1 } = {}) {
  const prev = G.nodes[id] || { done: false, crowns: 0, best: 0 };
  G.nodes[id] = { done: true, crowns: Math.min(5, prev.crowns + 1), best: Math.max(prev.best || 0, accuracy) };
  save();
  return { crowns: G.nodes[id].crowns, first: !prev.done };
}
export function completeChallenge(levelId, stars) {
  const prev = G.challenges[levelId];
  G.challenges[levelId] = { stars: Math.max(stars, prev?.stars || 0) };
  if (!prev) G.stats.challenges++;
  questProgress('challenge');
  checkAchievements();
  save();
  return { first: !prev };
}

/* -------------------------------------------------------------- mistakes */
const BOX_DAYS = [0, 1, 3, 7];
export function recordMistake(key) {
  if (!key) return;
  const m = G.mistakes[key] || { box: 0, misses: 0 };
  m.box = 0; m.misses++; m.due = Date.now();
  G.mistakes[key] = m;
  save();
}
export function reviewResult(key, ok) {
  const m = G.mistakes[key];
  if (!m) return;
  if (ok) {
    m.box++;
    if (m.box >= BOX_DAYS.length) delete G.mistakes[key];
    else m.due = Date.now() + BOX_DAYS[m.box] * 86400000;
    G.stats.reviewed++;
    questProgress('review');
  } else { m.box = 0; m.due = Date.now(); }
  checkAchievements();
  save();
}
export function mistakeKeys() {
  return Object.entries(G.mistakes).sort((a, b) => a[1].due - b[1].due).map(([k]) => k);
}
export const mistakesDue = () => Object.values(G.mistakes).filter((m) => m.due <= Date.now()).length;

/* ---------------------------------------------------------- achievements */
export const ACHIEVEMENTS = [
  { id: 'first-lesson', title: 'Initial commit', text: 'Merge your first lesson', test: (g) => g.stats.lessons >= 1, color: 'yellow' },
  { id: 'perfect', title: 'Clean history', text: 'Finish a lesson without a mistake', test: (g) => g.stats.perfect >= 1, color: 'green' },
  { id: 'combo10', title: 'No reverts', text: 'Get 10 right in a row', test: (g) => g.stats.bestCombo >= 10, color: 'red' },
  { id: 'streak3', title: 'Habit forming', text: 'Reach a 3-day streak', test: (g) => g.streak.best >= 3, color: 'sunbeam' },
  { id: 'streak7', title: 'Week of commits', text: 'Reach a 7-day streak', test: (g) => g.streak.best >= 7, color: 'red' },
  { id: 'streak30', title: 'Month of commits', text: 'Reach a 30-day streak (unlocks the crown)', test: (g) => g.streak.best >= 30, color: 'yellow' },
  { id: 'challenge1', title: 'Hands on the keys', text: 'Complete a challenge', test: (g) => g.stats.challenges >= 1, color: 'sky' },
  { id: 'challenge10', title: 'Repo wrangler', text: 'Complete 10 challenges', test: (g) => g.stats.challenges >= 10, color: 'sky' },
  { id: 'chest', title: 'Shipped it', text: 'Ship your first release', test: (g) => g.stats.chests >= 1, color: 'sunbeam' },
  { id: 'xp100', title: 'Centurion', text: 'Earn 100 XP', test: (g) => g.totalXp >= 100, color: 'pink' },
  { id: 'xp1000', title: 'Committed', text: 'Earn 1000 XP', test: (g) => g.totalXp >= 1000, color: 'pink' },
  { id: 'unit', title: 'Unit cleared', text: 'Finish every node in a unit', test: (g) => g.stats.units >= 1, color: 'green' },
  { id: 'review10', title: 'Learn from it', text: 'Review 10 mistakes', test: (g) => g.stats.reviewed >= 10, color: 'yellow' },
  { id: 'speed10', title: 'Quick draw', text: 'Score 10 in a speed round', test: (g) => g.stats.speedBest >= 10, color: 'red' },
  { id: 'bisect', title: 'Bug hunter', text: 'Finish a bisect hunt', test: (g) => g.stats.bisectBest != null, color: 'sky' },
];
let achievementEvents = [];
export function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!G.achievements[a.id] && a.test(G)) { G.achievements[a.id] = Date.now(); achievementEvents.push(a); }
  }
}
export function takeAchievements() { const e = achievementEvents; achievementEvents = []; return e; }

/* -------------------------------------------------------------- lessons */
export const XP = { lesson: 10, perfect: 5, combo: { 5: 2, 10: 3, 15: 5 }, challenge: { 3: 20, 2: 15, 1: 10 }, review: 1 };

export function finishLesson({ accuracy, bestCombo }) {
  G.stats.lessons++;
  G.stats.accSum = (G.stats.accSum || 0) + accuracy;
  G.stats.accN = (G.stats.accN || 0) + 1;
  earnGems(5);
  if (accuracy === 1) { G.stats.perfect++; questProgress('perfect'); }
  G.stats.bestCombo = Math.max(G.stats.bestCombo, bestCombo);
  questProgress('lessons');
  checkAchievements();
  save();
}
export function setMute(m) { G.mute = m; save(); }
export function recordSpeedScore(score) {
  const best = score > (G.stats.speedBest || 0);
  if (best) G.stats.speedBest = score;
  questProgress('practice');
  checkAchievements();
  save();
  return best;
}
export function recordBisectScore(tests) {
  const best = G.stats.bisectBest == null || tests < G.stats.bisectBest;
  if (best) G.stats.bisectBest = tests;
  questProgress('practice');
  checkAchievements();
  save();
  return best;
}

/* ---------------------------------------------------- courses (per-course data) */
// Per-course state lives in G.courses[<id>]; the active course is G.course ('git' today).
export const courseId = () => G.course || 'git';
export function courseState(id = courseId()) {
  if (!G.courses[id]) G.courses[id] = freshCourse();
  return G.courses[id];
}

/* --------------------------------------------------------------- command cards */
const deck = (course) => CARDS.filter((c) => c.course === course);
export const ownedCards = (course = courseId()) => courseState(course).cards;
export const hasCard = (id, course = courseId()) => !!ownedCards(course)[id];
// Unlocks the cards a finished lesson teaches. Returns the newly unlocked cards (for the reveal).
export function unlockCards(lessonId, course = courseId()) {
  const st = courseState(course);
  const fresh = deck(course).filter((c) => c.unlockedBy.includes(lessonId) && !st.cards[c.id]);
  for (const c of fresh) st.cards[c.id] = Date.now();
  if (fresh.length) save();
  return fresh;
}
// Existing players: grant every card whose lesson is already done, silently (no reveal).
export function grantCompletedCards(doneLessonIds, course = courseId()) {
  const st = courseState(course), done = new Set(doneLessonIds);
  let n = 0;
  for (const c of deck(course)) if (!st.cards[c.id] && c.unlockedBy.some((l) => done.has(l))) { st.cards[c.id] = Date.now(); st.seenCards[c.id] = true; n++; }
  if (n) save();
  return n;
}
export function markCardsSeen(ids, course = courseId()) { const st = courseState(course); for (const id of ids) st.seenCards[id] = true; save(); }
export const unseenCards = (course = courseId()) => Object.keys(ownedCards(course)).filter((id) => !courseState(course).seenCards[id]);
export const cardCount = (course = courseId()) => ({ got: Object.keys(ownedCards(course)).filter((id) => CARDS.some((c) => c.id === id)).length, total: deck(course).length });

/* ----------------------------------------------------------- shop and cosmetics */
// Cosmetics are global (G.cosmetics), shared by every course.
export const owns = (id) => !!G.cosmetics.owned[id];
export const equipped = (slot) => G.cosmetics.equipped[slot] || null;
// An item can be locked behind an achievement (the crown): returns the achievement or null.
export function itemLock(id) {
  const it = itemById(id);
  if (!it?.lock || G.achievements[it.lock]) return null;
  return ACHIEVEMENTS.find((a) => a.id === it.lock) || { id: it.lock, title: it.lock, text: '' };
}
// Returns { ok, reason } — reason: 'owned' | 'locked' | 'cherries' | 'unknown'.
export function buyItem(id) {
  const it = itemById(id);
  if (!it) return { ok: false, reason: 'unknown' };
  if (owns(id)) return { ok: false, reason: 'owned' };
  if (itemLock(id)) return { ok: false, reason: 'locked' };
  if (!spendGems(it.price)) return { ok: false, reason: 'cherries' };
  G.stats.spent = (G.stats.spent || 0) + it.price;
  G.cosmetics.owned[id] = Date.now();
  G.cosmetics.equipped[it.slot] = id;
  save();
  return { ok: true, item: it };
}
// Equip an owned item in its slot, or take it off when it is already on (equip(id, false) forces off).
export function equip(id, on = !(equipped(itemById(id)?.slot) === id)) {
  const it = itemById(id);
  if (!it || !owns(id)) return false;
  if (on) G.cosmetics.equipped[it.slot] = id;
  else if (G.cosmetics.equipped[it.slot] === id) delete G.cosmetics.equipped[it.slot];
  save();
  return true;
}
export const accentTheme = () => equipped('theme');
export const shopItems = () => ITEMS;

/* ------------------------------------------------------------------- profile */
// Average first-try accuracy over finished lessons; older saves fall back to the best per lesson.
export function accuracy() {
  if (G.stats.accN) return G.stats.accSum / G.stats.accN;
  const bests = Object.values(G.nodes).filter((n) => n.done && typeof n.best === 'number' && n.best > 0).map((n) => n.best);
  return bests.length ? bests.reduce((a, b) => a + b, 0) / bests.length : null;
}
