// Merges two copies of the game state (this device's and the cloud's) field by field, so playing on a
// phone and a laptop never loses progress on either. Pure: no DOM, no storage, inputs are not mutated.
// The rules (agreed in .notes/user-accounts-supabase.md, tested in tests/merge.test.mjs):
//   xpByDay              max per day            totalXp      max(a, b, sum of merged xpByDay)
//   nodes                union; done OR, crowns and best max
//   challenges           union; stars max
//   goalDays, seen, achievements, cosmetics.owned, course cards/seenCards
//                        union (a timestamp keeps the earliest)
//   stats                max per field; bisectBest min; accSum/accN as a pair from the side with more lessons
//   streak               count/lastDay/celebrated from the later lastDay; best max; frozen union
//   wallet               cherries and stashes as a ledger (js/wallet.js): base max, every earn/spend
//                        counter max per key (a device id, or "day:<date>" for a popped stash), so each
//                        earn and each spend counts once and a spend on one device can't be undone by
//                        another. A popped stash whose day was played after all (goalDays) is handed back.
//   gems, streak.freezes derived from the merged wallet (balance, clamped at 0); never merged themselves
//   boostUntil           max (an end time; nothing spends it)
//   mistakes             union; per key the copy with the later due
//   quests               the later day; same day: progress max, claimed union, chest OR
//   onboarded            OR
//   goal, mute, course, placement, cosmetics.equipped and anything unknown: from the newer save (savedAt)
//   resetAt              a "reset everywhere" stamp: a copy from before the later reset is dropped whole
//   adminEdits           edits made on /admin (supabase/schema.sql). Before the merge, a copy that hasn't
//                        seen an edit is "rebased" onto it: the edited value replaces the one it was made
//                        from, and whatever that copy gained beyond it (play the admin never saw) is kept on
//                        top. Then both copies merge by the rules above. See rebase() below.

import { walletOf, mergeWallets, refundPlayedDays, writeMirrors, balance, baseFor } from '../wallet.js';

const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// Stable deep equality (key order does not matter): used to tell whether a merge changed anything.
export function sameState(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameState(v, b[i]));
  }
  if (!isObj(a) || !isObj(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined), kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameState(a[k], b[k]));
}

// A deterministic order for two values, so ties break the same way whichever side is "a".
const cmp = (x, y) => { const sx = JSON.stringify(x) ?? '', sy = JSON.stringify(y) ?? ''; return sx < sy ? -1 : sx > sy ? 1 : 0; };

function maxPerKey(a = {}, b = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = Math.max(num(a[k]), num(b[k]));
  return out;
}
// Union of flag / timestamp maps: numbers keep the earliest, anything else keeps a truthy value.
function unionEarliest(a = {}, b = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[k], y = b?.[k];
    if (typeof x === 'number' && typeof y === 'number') out[k] = Math.min(x, y);
    else if (x === undefined) out[k] = clone(y);
    else if (y === undefined) out[k] = clone(x);
    else if (typeof x === 'number') out[k] = x;          // a timestamp beats a bare flag
    else if (typeof y === 'number') out[k] = y;
    else out[k] = clone(x || y ? (x || y) : (cmp(x, y) >= 0 ? x : y));
  }
  return out;
}

function mergeNodes(a = {}, b = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (!isObj(x) || !isObj(y)) { out[k] = clone(isObj(x) ? x : y); continue; }
    out[k] = { ...clone(x), ...clone(y), done: !!(x.done || y.done), crowns: Math.max(num(x.crowns), num(y.crowns)), best: Math.max(num(x.best), num(y.best)) };
  }
  return out;
}
function mergeChallenges(a = {}, b = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (!isObj(x) || !isObj(y)) { out[k] = clone(isObj(x) ? x : y); continue; }
    const o = { ...clone(x), ...clone(y), stars: Math.max(num(x.stars), num(y.stars)) };
    // "migrated" (from v1) stays only if both copies only have the migrated record
    if (!(x.migrated && y.migrated)) delete o.migrated;
    out[k] = o;
  }
  return out;
}
function mergeMistakes(a = {}, b = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (!isObj(x) || !isObj(y)) { out[k] = clone(isObj(x) ? x : y); continue; }
    out[k] = clone(num(x.due) > num(y.due) ? x : num(y.due) > num(x.due) ? y : (cmp(x, y) >= 0 ? x : y));
  }
  return out;
}
function mergeStats(a = {}, b = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'bisectBest' || k === 'accSum' || k === 'accN') continue;
    out[k] = Math.max(num(a[k]), num(b[k]));
  }
  // fewest tests wins; null means "never finished one"
  const bb = [a.bisectBest, b.bisectBest].filter((v) => typeof v === 'number');
  if ('bisectBest' in a || 'bisectBest' in b) out.bisectBest = bb.length ? Math.min(...bb) : null;
  // accuracy is accSum / accN: take the pair from one side so the average stays a real average
  if ('accN' in a || 'accN' in b || 'accSum' in a || 'accSum' in b) {
    const na = num(a.accN), nb = num(b.accN);
    const src = na > nb ? a : nb > na ? b : (num(a.accSum) >= num(b.accSum) ? a : b);
    out.accSum = num(src.accSum); out.accN = num(src.accN);
  }
  return out;
}
function mergeStreak(a = {}, b = {}) {
  const la = a.lastDay || '', lb = b.lastDay || '';
  const later = la > lb ? a : lb > la ? b : (num(a.count) >= num(b.count) ? a : b);
  const frozen = [...new Set([...(a.frozen || []), ...(b.frozen || [])])].sort().slice(-30);
  const out = { ...clone(a), ...clone(b), ...clone(later) };
  out.count = la === lb ? Math.max(num(a.count), num(b.count)) : num(later.count);
  out.lastDay = later.lastDay ?? null;
  out.best = Math.max(num(a.best), num(b.best), out.count);
  delete out.freezes;   // derived from the wallet afterwards (mergeStates)
  out.frozen = frozen;
  out.celebrated = la === lb ? ([a.celebrated, b.celebrated].filter(Boolean).sort().pop() ?? later.celebrated ?? null) : (later.celebrated ?? null);
  return out;
}
function mergeQuests(a = {}, b = {}) {
  const da = a.day || '', db = b.day || '';
  if (da !== db) return clone(da > db ? a : b);
  const out = { ...clone(a), ...clone(b) };
  out.progress = maxPerKey(a.progress, b.progress);
  out.claimed = unionEarliest(a.claimed, b.claimed);
  for (const k of Object.keys(out)) if (typeof a[k] === 'boolean' || typeof b[k] === 'boolean') out[k] = !!(a[k] || b[k]);
  return out;
}
function mergeCourses(a = {}, b = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = isObj(a[id]) ? a[id] : {}, y = isObj(b[id]) ? b[id] : {};
    const o = { ...clone(x), ...clone(y) };
    o.cards = unionEarliest(x.cards, y.cards);
    o.seenCards = unionEarliest(x.seenCards, y.seenCards);
    out[id] = o;
  }
  return out;
}

/* ------------------------------------------------------------ admin edits */
// state.adminEdits, written only by the admin_* functions in supabase/schema.sql (server clock, ms):
//   fields:  { totalXp | gems | streak.freezes | streak.count | streak.best: { at, to, from, days?, base? } }
//            to = the value the admin set, from = the cloud's value just before, days = sum of
//            xpByDay just before (totalXp only), base = the wallet base that makes the balance `to`
//            over the cloud's ledger counters at that moment (gems and streak.freezes only)
//   nodes:   { <path node id>: { at, to: { done, crowns, best } | null, from: { ... } | null } }
//   courses: { <course id>: at }   the course's progress was reset at `at`
export const EDIT_FIELDS = { totalXp: ['totalXp'], gems: ['gems'], 'streak.freezes': ['streak', 'freezes'], 'streak.count': ['streak', 'count'], 'streak.best': ['streak', 'best'] };
// The edit fields that are wallet balances (edit key -> wallet account).
export const WALLET_EDITS = { gems: 'gems', 'streak.freezes': 'freezes' };
// What a course reset clears, besides courses[<id>].cards/seenCards. The git course predates the
// course-aware layer, so its per-course fields still live at the top level (see js/storage.js).
export const COURSE_FIELDS = { git: ['nodes', 'challenges', 'mistakes'] };
const NODE_COURSE = 'git';   // every path node so far is the git course's

const laterEdit = (x, y) => {
  if (!isObj(x)) return isObj(y) ? y : undefined;
  if (!isObj(y)) return x;
  return num(x.at) > num(y.at) ? x : num(y.at) > num(x.at) ? y : (cmp(x, y) >= 0 ? x : y);
};
function mergeEdits(a, b) {
  if (!isObj(a) && !isObj(b)) return undefined;
  a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
  const out = { fields: {}, nodes: {}, courses: {} };
  for (const k of new Set([...Object.keys(a.fields || {}), ...Object.keys(b.fields || {})])) out.fields[k] = clone(laterEdit(a.fields?.[k], b.fields?.[k]));
  for (const k of new Set([...Object.keys(a.courses || {}), ...Object.keys(b.courses || {})])) out.courses[k] = Math.max(num(a.courses?.[k]), num(b.courses?.[k]));
  const reset = num(out.courses[NODE_COURSE]);
  for (const k of new Set([...Object.keys(a.nodes || {}), ...Object.keys(b.nodes || {})])) {
    const e = laterEdit(a.nodes?.[k], b.nodes?.[k]);
    if (num(e.at) > reset) out.nodes[k] = clone(e);   // an edit from before a course reset is void
  }
  return out;
}
const EMPTY_NODE = { done: false, crowns: 0, best: 0 };
// A node from a copy that hasn't seen the admin's edit, moved onto the edited node: replays it got
// beyond the node the admin edited (more crowns, or done when it wasn't) are kept on top.
function rebaseNode(n, e) {
  const from = isObj(e.from) ? e.from : EMPTY_NODE, to = isObj(e.to) ? e.to : EMPTY_NODE;
  const cur = isObj(n) ? n : EMPTY_NODE;
  const extra = Math.max(0, num(cur.crowns) - num(from.crowns));
  const done = !!to.done || extra > 0 || (!!cur.done && !from.done);
  const out = { ...clone(cur), done, crowns: Math.min(5, num(to.crowns) + extra), best: Math.max(num(to.best), num(cur.best) > num(from.best) ? num(cur.best) : 0) };
  return out.done || out.crowns ? out : undefined;
}
// Moves one copy onto the merged edit set E (a new object; the input is untouched).
function rebase(s, E) {
  const own = isObj(s.adminEdits) ? s.adminEdits : {};
  const out = clone(s);
  for (const [cid, at] of Object.entries(E.courses)) {
    if (num(own.courses?.[cid]) >= at) continue;
    for (const f of COURSE_FIELDS[cid] || []) out[f] = {};
    if (isObj(out.courses?.[cid])) out.courses[cid] = { ...out.courses[cid], cards: {}, seenCards: {} };
  }
  const nodesReset = num(own.courses?.[NODE_COURSE]) < num(E.courses[NODE_COURSE]);
  for (const [id, e] of Object.entries(E.nodes)) {
    const mine = own.nodes?.[id];
    if (!nodesReset && isObj(mine) && num(mine.at) >= num(e.at)) continue;
    out.nodes = isObj(out.nodes) ? out.nodes : {};
    const n = rebaseNode(out.nodes[id], e);
    if (n) out.nodes[id] = n; else delete out.nodes[id];
  }
  for (const [k, e] of Object.entries(E.fields)) {
    const path = EDIT_FIELDS[k];
    if (!path || num(own.fields?.[k]?.at) >= num(e.at)) continue;
    if (WALLET_EDITS[k]) {
      // Ledger balances: only the base moves. The counters stay and max-merge as usual, so what the
      // admin saw is replaced by `to`, and every earn/spend the cloud didn't have yet lands on top
      // exactly once. An edit from before the ledger (no `base`) moves this copy's own balance like
      // any other number: to + max(0, balance − from).
      const w = out.wallet = walletOf(out);
      const acc = w[WALLET_EDITS[k]];
      acc.base = typeof e.base === 'number' ? e.base : baseFor(num(e.to) + Math.max(0, balance(acc) - num(e.from)), acc);
      continue;
    }
    let o = out;
    for (const p of path.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p]; }
    const last = path[path.length - 1];
    o[last] = num(e.to) + Math.max(0, num(o[last]) - num(e.from));
  }
  out.adminEdits = clone(E);
  return out;
}

// Fields with a rule of their own; every other field comes from the newer save.
const RULED = new Set(['adminEdits', 'v', 'savedAt', 'resetAt', 'onboarded', 'totalXp', 'xpByDay', 'gems', 'wallet', 'streak', 'goalDays', 'nodes', 'challenges', 'quests', 'boostUntil', 'achievements', 'mistakes', 'stats', 'seen', 'courses', 'cosmetics']);

export function mergeStates(a, b) {
  if (!isObj(a)) return clone(b);
  if (!isObj(b)) return clone(a);
  // A "reset everywhere" happened after one of these copies was made: that copy is history.
  const ra = num(a.resetAt), rb = num(b.resetAt);
  if (ra !== rb) return clone(ra > rb ? a : b);
  // Admin edits: bring both copies onto the newest edits first, then merge as usual.
  const E = mergeEdits(a.adminEdits, b.adminEdits);
  if (E) { a = rebase(a, E); b = rebase(b, E); }

  const sa = num(a.savedAt), sb = num(b.savedAt);
  const newer = sa > sb ? a : sb > sa ? b : (cmp(a, b) >= 0 ? a : b);
  const older = newer === a ? b : a;

  const out = {};
  for (const k of new Set([...Object.keys(older), ...Object.keys(newer)])) {
    if (RULED.has(k)) continue;
    out[k] = clone(k in newer ? newer[k] : older[k]);
  }
  if ('v' in a || 'v' in b) out.v = Math.max(num(a.v), num(b.v));
  if ('savedAt' in a || 'savedAt' in b) out.savedAt = Math.max(sa, sb);
  if ('resetAt' in a || 'resetAt' in b) out.resetAt = ra;
  if ('onboarded' in a || 'onboarded' in b) out.onboarded = !!(a.onboarded || b.onboarded);
  out.xpByDay = maxPerKey(a.xpByDay, b.xpByDay);
  const daySum = Object.values(out.xpByDay).reduce((s, x) => s + x, 0);
  // After an admin set the XP, only days earned beyond the ones it was set over count towards the floor.
  const xpEdit = E?.fields?.totalXp;
  const floor = xpEdit ? num(xpEdit.to) + Math.max(0, daySum - num(xpEdit.days)) : daySum;
  out.totalXp = Math.max(num(a.totalXp), num(b.totalXp), floor);
  if (E) out.adminEdits = clone(E);
  out.boostUntil = Math.max(num(a.boostUntil), num(b.boostUntil));
  out.streak = mergeStreak(a.streak, b.streak);
  out.goalDays = unionEarliest(a.goalDays, b.goalDays);
  out.wallet = refundPlayedDays(mergeWallets(walletOf(a), walletOf(b)), out.goalDays);
  writeMirrors(out);   // gems and streak.freezes
  out.nodes = mergeNodes(a.nodes, b.nodes);
  out.challenges = mergeChallenges(a.challenges, b.challenges);
  out.quests = mergeQuests(a.quests, b.quests);
  out.achievements = unionEarliest(a.achievements, b.achievements);
  out.mistakes = mergeMistakes(a.mistakes, b.mistakes);
  out.stats = mergeStats(a.stats, b.stats);
  out.seen = unionEarliest(a.seen, b.seen);
  out.courses = mergeCourses(a.courses, b.courses);
  out.cosmetics = {
    owned: unionEarliest(a.cosmetics?.owned, b.cosmetics?.owned),
    equipped: clone(newer.cosmetics?.equipped ?? older.cosmetics?.equipped ?? {}),
  };
  return out;
}
