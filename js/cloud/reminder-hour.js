// The default hour for the daily push reminder: the hour this player usually practises, when the
// save says so, else 19:00. Pure (the clock is a parameter), tested in tests/reminders.test.mjs.
//
// The save has no per-lesson clock times, but a few things are stamped with Date.now() at the
// moment they happen in play: command cards unlocked (courses.<id>.cards) and achievements
// earned. Several cards unlock at the same instant, so stamps are counted once per minute.
export const DEFAULT_REMINDER_HOUR = 19;
const MIN_SAMPLES = 3;
const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);

export function practiceStamps(state) {
  const out = [];
  const add = (v) => { if (typeof v === 'number' && v > 1e12) out.push(v); };
  if (isObj(state?.achievements)) Object.values(state.achievements).forEach(add);
  if (isObj(state?.courses)) for (const c of Object.values(state.courses)) if (isObj(c?.cards)) Object.values(c.cards).forEach(add);
  return [...new Set(out.map((t) => Math.floor(t / 60000)))].map((m) => m * 60000);
}

// hourOf: (ms) => 0-23 in the player's local time (a parameter so tests don't depend on TZ).
export function usualHour(state, hourOf = (t) => new Date(t).getHours()) {
  const stamps = practiceStamps(state);
  if (stamps.length < MIN_SAMPLES) return DEFAULT_REMINDER_HOUR;
  const count = new Array(24).fill(0);
  for (const t of stamps) count[hourOf(t)]++;
  let best = DEFAULT_REMINDER_HOUR;
  for (let h = 0; h < 24; h++) if (count[h] > count[best] || (count[h] === count[best] && h > best)) best = h;
  return count[best] > 0 ? best : DEFAULT_REMINDER_HOUR;
}
