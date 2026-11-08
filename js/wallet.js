// The wallet: cherries (G.gems) and stashes (G.streak.freezes) as a per-device ledger, so spending on
// one device can't be undone by another device's copy when the two merge (js/cloud/merge.js).
//
//   G.wallet = { gems:    { base, earn: { <device id>: n }, spend: { <device id>: n } },
//                freezes: { base, earn: { <device id>: n }, spend: { "day:<YYYY-MM-DD>": 1 } } }
//
// balance = base + Σ earn − Σ spend (shown clamped at 0). Each counter only ever grows, and only one
// writer owns it (a device its own id; a popped stash its covered day), so merging two copies is "max
// per key" for every counter, and the result counts every earn and every spend exactly once whichever
// order the copies meet in (a PN-counter). Spending is refused locally below 0 (game.js); two devices
// spending the same cherries offline can still leave a debt, which shows as 0 until earnings cover it.
// `base` is where the ledger starts: the old save's value when a pre-ledger save is migrated, and the
// value an admin edit sets (supabase/schema.sql, admin_update_progress). G.gems and G.streak.freezes
// stay as derived mirrors, rewritten from the ledger after every change, so the UI and the admin table
// can keep reading them. Pure: no DOM, no storage.
export const ACCOUNTS = { gems: ['gems'], freezes: ['streak', 'freezes'] };

const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const counters = (m) => {
  const out = {};
  if (isObj(m)) for (const [k, v] of Object.entries(m)) if (num(v) > 0) out[k] = num(v);
  return out;
};
export const sum = (m) => Object.values(isObj(m) ? m : {}).reduce((s, v) => s + num(v), 0);

const legacyValue = (s, key) => { let o = s; for (const p of ACCOUNTS[key]) o = isObj(o) ? o[p] : undefined; return Math.max(0, num(o)); };
// One account, cleaned up; a missing one starts from the save's old plain number.
export function account(a, legacy = 0) {
  if (!isObj(a)) return { base: legacy, earn: {}, spend: {} };
  return { base: num(a.base), earn: counters(a.earn), spend: counters(a.spend) };
}
// The wallet of a save. A save from before the ledger gets base = its old value and empty counters.
export function walletOf(s) {
  const w = isObj(s?.wallet) ? s.wallet : {};
  const out = {};
  for (const k of Object.keys(ACCOUNTS)) out[k] = account(w[k], legacyValue(s, k));
  return out;
}
export const rawBalance = (a) => num(a?.base) + sum(a?.earn) - sum(a?.spend);
export const balance = (a) => Math.max(0, rawBalance(a));

// Max per device id: each device's counter only grows, so the larger one has seen more.
const maxCounters = (x, y) => {
  const out = {};
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) out[k] = Math.max(num(x[k]), num(y[k]));
  return out;
};
export function mergeAccount(a, b) {
  return { base: Math.max(num(a.base), num(b.base)), earn: maxCounters(a.earn, b.earn), spend: maxCounters(a.spend, b.spend) };
}
export function mergeWallets(a, b) {
  const out = {};
  for (const k of Object.keys(ACCOUNTS)) out[k] = mergeAccount(account(a?.[k]), account(b?.[k]));
  return out;
}

// Stashes are spent per covered day ("day:2026-11-04": 1), not per device, so two devices popping the
// same missed day count once. A day that turns out to have been played (goalDays, from any device:
// one device popped a stash for it before it had synced the other's play) gets its stash back.
export const stashKey = (day) => 'day:' + day;
export function refundPlayedDays(w, goalDays) {
  if (!isObj(goalDays)) return w;
  for (const k of Object.keys(w.freezes.spend)) if (k.startsWith('day:') && goalDays[k.slice(4)]) delete w.freezes.spend[k];
  return w;
}

// Writes the derived balances into s.gems / s.streak.freezes (mutates s; returns it).
export function writeMirrors(s) {
  for (const [k, path] of Object.entries(ACCOUNTS)) {
    let o = s;
    for (const p of path.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p]; }
    o[path[path.length - 1]] = balance(s.wallet[k]);
  }
  return s;
}

// Adds n to this device's earn or spend counter (mutates the account).
export function record(a, side, device, n) {
  if (!(n > 0)) return;
  a[side][device] = num(a[side][device]) + n;
}

// The base an admin edit sets so the balance comes out at `to` over these counters (see rebase in
// js/cloud/merge.js; admin_update_progress in supabase/schema.sql computes the same thing).
export const baseFor = (to, a) => to - sum(a.earn) + sum(a.spend);
