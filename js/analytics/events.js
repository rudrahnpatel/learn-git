// The analytics event list: every event name and the shape of its props, in one place. The client
// (js/analytics/track.js) drops anything that doesn't fit, and supabase/migrations/analytics.sql
// accepts only these names (tests/analytics.test.mjs checks the two lists match). Pure: no DOM.
// Privacy rules (.notes/analytics-supabase.md): no user ids, emails, IPs, user agents or free text.
// Props are short ids, small numbers and booleans only.

// Field types:
//   id     a short slug: letters, digits and _ - . : # / (node ids, exercise ids, level ids)
//   int    a whole number in [min, max]
//   ratio  a number from 0 to 1 (rounded to 2 places)
//   bool   true / false
//   enum   one of a fixed list of strings
const id = { t: 'id' };
const int = (min, max) => ({ t: 'int', min, max });
const ratio = { t: 'ratio' };
const bool = { t: 'bool' };
const oneOf = (...values) => ({ t: 'enum', values });

const MS = int(0, 6 * 60 * 60 * 1000);   // durations, capped at 6 hours
const MODE = oneOf('lesson', 'review', 'mistakes');

export const EVENTS = {
  landing_view: {},
  app_open: { pwa: bool, onboarded: bool },                         // pwa = launched as the installed app
  onboarding_step: { step: int(0, 2) },                             // 0 welcome, 1 level, 2 daily goal (reached)
  onboarding_done: { placement: int(0, 3), goal: int(0, 1000) },    // placement = the level picked (units skipped)
  lesson_start: { node: id, mode: MODE, crowns: int(0, 5), total: int(0, 200) },
  lesson_done: { node: id, mode: MODE, reached: int(0, 200), total: int(0, 200), accuracy: ratio, ms: MS },
  lesson_quit: { node: id, mode: MODE, reached: int(0, 200), total: int(0, 200), accuracy: ratio, ms: MS, ex: id },
  exercise_answer: { node: id, ex: id, type: id, ok: bool, attempt: int(1, 50), skipped: bool },
  challenge_start: { level: id },
  challenge_done: { level: id, stars: int(0, 3), moves: int(0, 10000), hints: int(0, 20) },
  milestone: { kind: oneOf('streak', 'achievement'), value: int(0, 100000), id },   // streak days, or an achievement id
  sign_in: {},
  course_switch: { course: id, from: id },                          // the course switcher (js/ui/settings.js)
};
export const EVENT_NAMES = Object.keys(EVENTS);

export const DEVICES = ['phone', 'tablet', 'desktop'];
const ID_RE = /^[A-Za-z0-9_.:#/-]{1,80}$/;

// Returns a clean copy of props with only the declared fields (wrong types dropped), or null when the
// event name is unknown. Never throws.
export function cleanProps(name, props) {
  const spec = Object.prototype.hasOwnProperty.call(EVENTS, name) ? EVENTS[name] : null;
  if (!spec) return null;
  const out = {};
  if (!props || typeof props !== 'object') return out;
  for (const [k, f] of Object.entries(spec)) {
    const v = props[k];
    if (v === undefined || v === null) continue;
    if (f.t === 'id' && typeof v === 'string' && ID_RE.test(v)) out[k] = v;
    else if (f.t === 'int' && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(f.max, Math.max(f.min, Math.round(v)));
    else if (f.t === 'ratio' && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
    else if (f.t === 'bool' && typeof v === 'boolean') out[k] = v;
    else if (f.t === 'enum' && f.values.includes(v)) out[k] = v;
  }
  return out;
}

// The browser asked not to be tracked: Do Not Track ("1" / "yes") or Global Privacy Control.
export function privacySignal(nav = {}, win = {}) {
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes' || dnt === 1 || nav.globalPrivacyControl === true || nav.globalPrivacyControl === 'true';
}

// A coarse device class from the screen's short side and the pointer, nothing finer.
export function deviceClass({ short = 0, coarse = false } = {}) {
  if (!coarse) return 'desktop';
  return short && short < 600 ? 'phone' : 'tablet';
}

// Only the production site counts. localhost, LAN hosts and plain http stay quiet unless the
// learn-git:analytics key in localStorage says "on" (for testing); "off" always wins.
export function hostAllowed({ protocol = '', hostname = '' } = {}, override = null) {
  if (override === 'off') return false;
  if (override === 'on') return true;
  if (protocol !== 'https:' || !hostname) return false;
  return !/^(localhost|127\.|\[::1\]|10\.|192\.168\.)|\.local$/.test(hostname);
}
