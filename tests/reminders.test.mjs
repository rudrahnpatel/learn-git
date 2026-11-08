// Push reminders: the due-user selection and time-zone/day maths the send-reminders Edge Function
// runs (supabase/functions/_shared/reminders.js), and the client's default reminder hour
// (js/cloud/reminder-hour.js). Run: node tests/reminders.test.mjs (or node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { localDayHour, addDays, practisedOn, preselect, pickDue, dueReminders, liveStreak, reminderMessage } from '../supabase/functions/_shared/reminders.js';
import { usualHour, practiceStamps, DEFAULT_REMINDER_HOUR } from '../js/cloud/reminder-hour.js';

const at = (iso) => new Date(iso);

test('localDayHour: plain, half-hour and date-line zones', () => {
  const t = at('2026-11-08T13:30:00Z');
  assert.deepEqual(localDayHour(t, 'UTC'), { day: '2026-11-08', hour: 13 });
  assert.deepEqual(localDayHour(t, 'Asia/Kolkata'), { day: '2026-11-08', hour: 19 });     // +5:30 -> 19:00
  assert.deepEqual(localDayHour(t, 'Asia/Calcutta'), { day: '2026-11-08', hour: 19 });    // legacy alias some browsers report
  assert.deepEqual(localDayHour(t, 'America/New_York'), { day: '2026-11-08', hour: 8 });  // EST after the Nov 1 change
  assert.deepEqual(localDayHour(t, 'Pacific/Kiritimati'), { day: '2026-11-09', hour: 3 }); // +14: already tomorrow
  assert.deepEqual(localDayHour(t, 'Pacific/Pago_Pago'), { day: '2026-11-08', hour: 2 });  // -11
  assert.deepEqual(localDayHour(at('2026-11-08T23:59:00Z'), 'Pacific/Pago_Pago'), { day: '2026-11-08', hour: 12 });
});

test('localDayHour: midnight is hour 0 and the day rolls over', () => {
  assert.deepEqual(localDayHour(at('2026-11-08T18:30:00Z'), 'Asia/Kolkata'), { day: '2026-11-09', hour: 0 });
  assert.deepEqual(localDayHour(at('2026-11-08T00:00:00Z'), 'UTC'), { day: '2026-11-08', hour: 0 });
});

test('localDayHour: daylight saving changes', () => {
  // Europe/London: BST ends 2026-10-25 at 01:00 UTC
  assert.equal(localDayHour(at('2026-10-24T18:00:00Z'), 'Europe/London').hour, 19);
  assert.equal(localDayHour(at('2026-10-26T18:00:00Z'), 'Europe/London').hour, 18);
  // America/New_York: DST starts 2026-03-08 at 07:00 UTC
  assert.equal(localDayHour(at('2026-03-07T23:00:00Z'), 'America/New_York').hour, 18);
  assert.equal(localDayHour(at('2026-03-08T23:00:00Z'), 'America/New_York').hour, 19);
});

test('localDayHour: an unknown or missing zone is null, never a throw', () => {
  assert.equal(localDayHour(at('2026-11-08T13:00:00Z'), 'Mars/Olympus'), null);
  assert.equal(localDayHour(at('2026-11-08T13:00:00Z'), ''), null);
  assert.equal(localDayHour(at('2026-11-08T13:00:00Z'), null), null);
});

test('addDays: month, year and leap-day edges', () => {
  assert.equal(addDays('2026-11-08', -1), '2026-11-07');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('practisedOn: XP, a met goal or a streak day count; other days and junk do not', () => {
  assert.equal(practisedOn({ xpByDay: { '2026-11-08': 10 } }, '2026-11-08'), true);
  assert.equal(practisedOn({ xpByDay: { '2026-11-08': 0 } }, '2026-11-08'), false);
  assert.equal(practisedOn({ goalDays: { '2026-11-08': true } }, '2026-11-08'), true);
  assert.equal(practisedOn({ streak: { lastDay: '2026-11-08' } }, '2026-11-08'), true);
  assert.equal(practisedOn({ xpByDay: { '2026-11-07': 50 }, goalDays: { '2026-11-07': true } }, '2026-11-08'), false);
  assert.equal(practisedOn(null, '2026-11-08'), false);
  assert.equal(practisedOn({ xpByDay: 'nope' }, '2026-11-08'), false);
});

const sub = (o = {}) => ({ id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', time_zone: 'Asia/Kolkata', reminder_hour: 19, enabled: true, last_sent: null, ...o });
const NOW = at('2026-11-08T13:30:00Z');   // 19:00 in Kolkata, 13:30 in UTC, 08:30 in New York

test('preselect: the local hour has to match, in the row\'s own zone', () => {
  const subs = [
    sub({ id: 'kol' }),
    sub({ id: 'utc', time_zone: 'UTC', reminder_hour: 13 }),
    sub({ id: 'ny-wrong', time_zone: 'America/New_York', reminder_hour: 19 }),
    sub({ id: 'ny', time_zone: 'America/New_York', reminder_hour: 8 }),
    sub({ id: 'bad-tz', time_zone: 'Nowhere/Land' }),
  ];
  assert.deepEqual(preselect(subs, NOW).map((c) => c.sub.id), ['kol', 'utc', 'ny']);
  assert.equal(preselect(subs, NOW)[0].day, '2026-11-08');
});

test('preselect: disabled rows and rows already sent today (local day) are skipped', () => {
  const subs = [
    sub({ id: 'off', enabled: false }),
    sub({ id: 'sent-today', last_sent: '2026-11-08' }),
    sub({ id: 'sent-yesterday', last_sent: '2026-11-07' }),
    // Kiritimati is already on the 9th: a send dated the 8th was "yesterday" there
    sub({ id: 'kiri', time_zone: 'Pacific/Kiritimati', reminder_hour: 3, last_sent: '2026-11-08' }),
  ];
  const got = preselect(subs, NOW);
  assert.deepEqual(got.map((c) => c.sub.id), ['sent-yesterday', 'kiri']);
  assert.equal(got[1].day, '2026-11-09');
});

test('preselect: reminder_hour as a string (from JSON) still matches', () => {
  assert.equal(preselect([sub({ reminder_hour: '19' })], NOW).length, 1);
});

test('pickDue: practised today is skipped; no progress row means not practised', () => {
  const subs = [sub({ id: 'a', user_id: 'played' }), sub({ id: 'b', user_id: 'idle' }), sub({ id: 'c', user_id: 'never-synced' })];
  const states = new Map([
    ['played', { xpByDay: { '2026-11-08': 15 } }],
    ['idle', { xpByDay: { '2026-11-07': 30 }, streak: { count: 4, lastDay: '2026-11-07', best: 4, freezes: 0 } }],
  ]);
  const due = pickDue(preselect(subs, NOW), states);
  assert.deepEqual(due.map((d) => d.sub.id), ['b', 'c']);
  assert.match(due[0].message.title, /4-day streak/);
  assert.equal(due[0].message.streak, 4);
  assert.equal(due[1].message.title, 'Ready for your first commit?');
});

test('pickDue: "today" is the subscription\'s local day, not UTC', () => {
  // 20:00 UTC on the 8th is 01:30 on the 9th in Kolkata. XP dated the 8th doesn't count there.
  const late = at('2026-11-08T20:00:00Z');
  const s = sub({ reminder_hour: 1 });
  assert.equal(dueReminders([s], { u1: { xpByDay: { '2026-11-08': 40 } } }, late).length, 1);
  assert.equal(dueReminders([s], { u1: { xpByDay: { '2026-11-09': 5 } } }, late).length, 0);
});

test('a user with two devices gets one reminder per device, each in its own zone', () => {
  const subs = [sub({ id: 'phone' }), sub({ id: 'laptop', time_zone: 'Europe/London', reminder_hour: 13 })];
  assert.deepEqual(dueReminders(subs, {}, NOW).map((d) => d.sub.id), ['phone', 'laptop']);
});

test('liveStreak: alive only if the last streak day was yesterday (or today)', () => {
  assert.equal(liveStreak({ streak: { count: 5, lastDay: '2026-11-07' } }, '2026-11-08'), 5);
  assert.equal(liveStreak({ streak: { count: 5, lastDay: '2026-11-06' } }, '2026-11-08'), 0);
  assert.equal(liveStreak({ streak: { count: 0, lastDay: '2026-11-07' } }, '2026-11-08'), 0);
  assert.equal(liveStreak({}, '2026-11-08'), 0);
});

test('reminderMessage: streak-aware lines, short enough for a notification', () => {
  const day = '2026-11-08';
  const m5 = reminderMessage({ streak: { count: 5, lastDay: '2026-11-07', freezes: 0 } }, day);
  assert.equal(m5.title, 'Your 5-day streak is on the line');
  assert.match(m5.body, /keeps the line going/);
  assert.match(reminderMessage({ streak: { count: 5, lastDay: '2026-11-07', freezes: 1 } }, day).body, /stash/);
  assert.equal(reminderMessage({ streak: { count: 1, lastDay: '2026-11-07' } }, day).title, 'Day 2 is one commit away');
  assert.equal(reminderMessage({ totalXp: 300, streak: { count: 3, lastDay: '2026-11-01', best: 9 } }, day).title, 'Your commit line misses you');
  assert.equal(reminderMessage(null, day).title, 'Ready for your first commit?');
  for (const s of [null, { streak: { count: 12, lastDay: '2026-11-07', freezes: 2 } }, { totalXp: 1 }]) {
    const m = reminderMessage(s, day);
    assert.ok(m.title.length <= 40 && m.body.length <= 80, `${m.title} / ${m.body}`);
    assert.equal(m.tag, 'streak');
    assert.equal(m.url, 'app');
  }
});

/* ------------------------------------------------------- client default hour */
const H = 3600000;
const utcHour = (t) => new Date(t).getUTCHours();
const base = Date.UTC(2026, 9, 1);   // 2026-10-01T00:00Z

test('usualHour: 19:00 when the save has too little to go on', () => {
  assert.equal(DEFAULT_REMINDER_HOUR, 19);
  assert.equal(usualHour({}, utcHour), 19);
  assert.equal(usualHour({ achievements: { a: base + 8 * H, b: base + 86400000 + 8 * H } }, utcHour), 19);
});

test('usualHour: the most common hour across cards and achievements', () => {
  const state = {
    achievements: { first: base + 21 * H, streak3: base + 2 * 86400000 + 21 * H + 600000 },
    courses: { git: { cards: { add: base + 86400000 + 21 * H + 120000, commit: base + 3 * 86400000 + 7 * H } } },
  };
  assert.equal(usualHour(state, utcHour), 21);
});

test('usualHour: cards unlocked in the same minute count once', () => {
  const burst = base + 8 * H;
  const state = {
    courses: { git: { cards: { a: burst, b: burst + 1000, c: burst + 2000, d: burst + 3000 } } },
    achievements: { x: base + 86400000 + 20 * H, y: base + 2 * 86400000 + 20 * H },
  };
  assert.equal(practiceStamps(state).length, 3);
  assert.equal(usualHour(state, utcHour), 20);
});

test('usualHour: ties go to the later hour, junk values are ignored', () => {
  const state = { achievements: { a: base + 9 * H, b: base + 86400000 + 18 * H, c: base + 2 * 86400000 + 9 * H + 60000, d: base + 3 * 86400000 + 18 * H, e: 'x', f: true, g: 5 } };
  assert.equal(usualHour(state, utcHour), 18);
});
