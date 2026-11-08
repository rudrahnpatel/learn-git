// localStorage wrapper: every access is guarded (private mode, quota, disabled storage).
// v2 keeps the whole game state under one key; v1 progress is migrated once on first load.
import { walletOf, writeMirrors } from './wallet.js';

const KEY = 'learn-git:v2';
const V1_KEY = 'learn-git:progress:v1';
const DEVICE_KEY = 'learn-git:device:v1';

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
    // gems and streak.freezes are mirrors of the wallet ledger below (js/wallet.js): game.js changes
    // them only through earnGems/spendGems/addStashes/useStashes, never by writing the numbers.
    gems: 20,
    streak: { count: 0, best: 0, lastDay: null, freezes: 0, frozen: [], celebrated: null },
    wallet: { gems: { base: 20, earn: {}, spend: {} }, freezes: { base: 0, earn: {}, spend: {} } },
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
    newDeviceId();   // a fresh save starts fresh ledger counters (see deviceId below)
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
  // The wallet ledger (js/wallet.js). A save from before it is migrated: base = its cherries/stashes,
  // no counters. Two devices migrating the same cloud value get the same base, and bases max-merge,
  // so nothing is counted twice. The plain numbers are then re-derived from the ledger.
  out.wallet = walletOf({ ...out, wallet: s.wallet });
  return writeMirrors(out);
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
export function resetState() { remove(KEY); newDeviceId(); }

// This browser's id in the wallet ledger, kept outside the save so a merged copy from the cloud can't
// overwrite it. It changes whenever the save starts over (first run, reset, cleared device): the
// ledger counts each id's earn/spend as "max of what any copy has seen", so a restarted save reusing
// an old id would have its new spending hidden behind the old, larger counter.
let device = null;
const randomId = () => {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16); } catch { /* fall through */ }
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};
export function deviceId() {
  if (device) return device;
  const stored = read(DEVICE_KEY, null);
  if (typeof stored === 'string' && /^[0-9a-z]{8,40}$/.test(stored)) return (device = stored);
  return newDeviceId();
}
function newDeviceId() { device = randomId(); write(DEVICE_KEY, device); return device; }

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
