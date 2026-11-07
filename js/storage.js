// localStorage wrapper: every access is guarded (private mode, quota, disabled storage).
// v2 keeps the whole game state under one key; v1 progress is migrated once on first load.
const KEY = 'learn-git:v2';
const V1_KEY = 'learn-git:progress:v1';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function remove(key) { try { window.localStorage.removeItem(key); } catch { /* ignore */ } }

export function freshState() {
  return {
    v: 2,
    onboarded: false,
    placement: 0,          // 0 new, 1 commit & push, 2 branch & merge, 3 rebase & rescue
    goal: 20,              // daily XP goal
    mute: false,
    totalXp: 0,
    xpByDay: {},           // 'YYYY-MM-DD' -> xp
    // Field names predate the git-themed rewards and are kept so old saves load unchanged:
    // gems = cherries, freezes = stashes held, frozen = days a stash covered, chests = releases.
    gems: 20,
    streak: { count: 0, best: 0, lastDay: null, freezes: 0, frozen: [], celebrated: null },
    goalDays: {},          // 'YYYY-MM-DD' -> true when the daily goal was met
    nodes: {},             // path node id -> { done, crowns, best }
    challenges: {},        // v1 level id -> { stars }
    quests: { day: null, progress: {}, claimed: {}, chest: false },
    boostUntil: 0,
    achievements: {},      // id -> timestamp
    mistakes: {},          // exercise key -> { box, due, misses }
    stats: { lessons: 0, perfect: 0, challenges: 0, chests: 0, bestCombo: 0, reviewed: 0, speedBest: 0, bisectBest: null, units: 0, accSum: 0, accN: 0, spent: 0 },
    seen: {},              // one-off flags (popped nodes, tips)
    // ---- course-aware layer (see .notes/learn-git-v2-ui.md, "Shop, profile and cards").
    // Global things (cherries, streak, XP history, cosmetics, achievements) stay at the top level;
    // anything that belongs to one course lives under courses[<course id>]. The older per-course
    // fields above (placement, nodes, challenges, mistakes) are the git course's and stay where they
    // are until a second course needs the move.
    course: 'git',         // the active course
    courses: { git: freshCourse() },
    cosmetics: { owned: {}, equipped: {} }, // item id -> timestamp; slot -> item id (global, any course)
  };
}
export function freshCourse() {
  return { cards: {}, seenCards: {} };  // card id -> unlock timestamp; card id -> true once revealed
}

// Never discards a save silently: an unreadable save, or one in a format this code doesn't know,
// is copied to a backup key before anything is written; a save that only lacks fields is repaired
// (merged over the defaults below), not reset. Only a browser with no save gets a fresh one.
export function loadState() {
  let raw = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* storage blocked: play without saving */ }
  let s = null;
  if (raw) { try { s = JSON.parse(raw); } catch { s = null; } }
  const looksV2 = s && typeof s === 'object' && !Array.isArray(s) && (s.v === 2 || (s.v == null && ('onboarded' in s || 'totalXp' in s || 'nodes' in s)));
  if (looksV2) s.v = 2;
  else {
    if (raw) backup(raw);
    s = freshState();
    migrateV1(s);
    write(KEY, s);
  }
  return repairState(s);
}
// Fills in every field a save is missing (merged over the defaults), never resetting what is there.
// Pure (no storage access): the cloud sync runs a downloaded copy through it too (js/cloud/sync.js).
export function repairState(s) {
  const base = freshState();
  const out = { ...base, ...s, streak: { ...base.streak, ...s.streak }, quests: { ...base.quests, ...s.quests }, stats: { ...base.stats, ...s.stats } };
  // Saves from before the course-aware layer get it filled in (a migration, never a reset).
  out.courses = { ...base.courses, ...(s.courses || {}) };
  for (const [id, c] of Object.entries(out.courses)) out.courses[id] = { ...freshCourse(), ...c };
  out.cosmetics = { owned: { ...(s.cosmetics?.owned || {}) }, equipped: { ...(s.cosmetics?.equipped || {}) } };
  return out;
}
export function saveState(s) { return write(KEY, s); }
// Keeps up to three copies of a save that could not be loaded, newest last, under KEY:backup.
function backup(raw) {
  const list = read(KEY + ':backup', []);
  const arr = Array.isArray(list) ? list : [];
  arr.push({ at: Date.now(), raw });
  write(KEY + ':backup', arr.slice(-3));
}
export const STATE_KEY = KEY;
export function resetState() { remove(KEY); }

// v1 stored { levels: { id: { stars, moves } }, speedBest, bisectBest }.
function migrateV1(s) {
  const p = read(V1_KEY, null);
  if (!p || typeof p !== 'object') return;
  for (const [id, v] of Object.entries(p.levels || {})) s.challenges[id] = { stars: v?.stars || 1, migrated: true };
  s.stats.challenges = Object.keys(s.challenges).length;
  if (p.speedBest) s.stats.speedBest = p.speedBest;
  if (p.bisectBest != null) s.stats.bisectBest = p.bisectBest;
}

export const sandboxStore = {
  load: () => read('learn-git:sandbox:v1', null),
  save: (state) => write('learn-git:sandbox:v1', state),
  clear: () => remove('learn-git:sandbox:v1'),
};
// the phone work-area view (graph | split | term), per viewer
export const viewStore = {
  load: () => read('learn-git:view:v1', 'split'),
  save: (v) => write('learn-git:view:v1', v),
};
export const historyStore = {
  load: () => { const h = read('learn-git:history:v1', []); return Array.isArray(h) ? h : []; },
  save: (h) => write('learn-git:history:v1', h.slice(-200)),
};
