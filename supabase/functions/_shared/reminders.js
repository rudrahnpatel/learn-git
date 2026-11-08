// Push reminders: who is due, and what to say. Pure (no I/O, no Deno or browser APIs), so the
// send-reminders Edge Function imports it and node tests it (tests/reminders.test.mjs).
//
// A subscription row is due when, in ITS time zone:
//   1. it is enabled,
//   2. the local hour equals its reminder_hour,
//   3. last_sent is not today (one reminder per device per local day),
//   4. and the user hasn't practised today: no XP in progress.state.xpByDay[today] and today not in
//      goalDays. Day keys in the game state are the player's local 'YYYY-MM-DD' (js/ui/game.js dayKey),
//      which is why the subscription stores the device's IANA time zone.
// See .notes/push-reminders.md.

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    // en-CA gives YYYY-MM-DD ordering; h23 avoids the "24" hour some engines print at midnight.
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  return f;
}

// { day: 'YYYY-MM-DD', hour: 0-23 } for an instant in an IANA zone, or null for an unknown zone.
export function localDayHour(now, tz) {
  if (typeof tz !== 'string' || !tz) return null;
  let parts;
  try { parts = formatter(tz).formatToParts(now); } catch { return null; }
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = Number(get('hour')) % 24;
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

// Calendar arithmetic on 'YYYY-MM-DD' keys (no time zones involved).
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);

// Did the player do anything on this local day? Any XP counts, as does a met goal.
export function practisedOn(state, day) {
  if (!isObj(state)) return false;
  const xp = isObj(state.xpByDay) ? Number(state.xpByDay[day]) || 0 : 0;
  return xp > 0 || !!(isObj(state.goalDays) && state.goalDays[day]) || state.streak?.lastDay === day;
}

// Step 1 (no progress needed): subscriptions whose local hour has come up and that weren't sent
// today. Returns [{ sub, day }] so the caller only fetches progress for these users.
export function preselect(subs, now) {
  const out = [];
  for (const sub of subs || []) {
    if (!sub || sub.enabled === false) continue;
    const loc = localDayHour(now, sub.time_zone);
    if (!loc || loc.hour !== Number(sub.reminder_hour)) continue;
    if (sub.last_sent && String(sub.last_sent).slice(0, 10) === loc.day) continue;
    out.push({ sub, day: loc.day });
  }
  return out;
}

// Step 2: drop the players who already practised today, and write each one's message.
// states: Map or plain object of user_id -> progress.state (or a partial one: xpByDay, goalDays, streak).
export function pickDue(candidates, states) {
  const get = (id) => (states instanceof Map ? states.get(id) : states?.[id]);
  const out = [];
  for (const { sub, day } of candidates || []) {
    const state = get(sub.user_id) || null;
    if (practisedOn(state, day)) continue;
    out.push({ sub, day, message: reminderMessage(state, day) });
  }
  return out;
}

// Convenience for tests and a dry run: both steps at once.
export function dueReminders(subs, states, now) {
  return pickDue(preselect(subs, now), states);
}

// The streak the player still holds today (it breaks only if yesterday was missed), from the
// saved state. Mirrors streakAlive() in js/ui/game.js for a day that hasn't been played yet.
export function liveStreak(state, day) {
  const s = isObj(state) ? state.streak : null;
  if (!isObj(s) || !(s.count > 0) || !s.lastDay) return 0;
  return s.lastDay === addDays(day, -1) || s.lastDay === day ? s.count : 0;
}

// The notification itself: short, in the game's voice (git puns, Twig the mascot), streak-aware.
// Vocabulary follows js/brand.js (streak, stash); keep them in step if the brand changes.
export function reminderMessage(state, day) {
  const n = liveStreak(state, day);
  const stashes = Number(state?.streak?.freezes) || 0;
  const everPlayed = (Number(state?.totalXp) || 0) > 0 || (isObj(state?.xpByDay) && Object.keys(state.xpByDay).length > 0) || (Number(state?.streak?.best) || 0) > 0;
  let title, body;
  if (n >= 2) {
    title = `Your ${n}-day streak is on the line`;
    body = stashes > 0
      ? 'A stash could cover today, but one three-minute lesson is cheaper.'
      : 'One three-minute lesson commits today and keeps the line going.';
  } else if (n === 1) {
    title = 'Day 2 is one commit away';
    body = 'A three-minute lesson keeps yesterday\'s streak alive.';
  } else if (everPlayed) {
    title = 'Your commit line misses you';
    body = 'Start a fresh streak today. One lesson, three minutes.';
  } else {
    title = 'Ready for your first commit?';
    body = 'One three-minute lesson. Twig will walk you through it.';
  }
  return { title, body, tag: 'streak', url: 'app', streak: n };
}
