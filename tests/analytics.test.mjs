// Analytics: payload validation, the Do Not Track / GPC check, device class, host gating, the outbox
// (batching, the offline cap, retry vs drop), and that the SQL accepts exactly the events the client
// declares. Run: node --test tests/ (or node tests/analytics.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS, EVENT_NAMES, cleanProps, privacySignal, deviceClass, hostAllowed } from '../js/learnlog/kinds.js';
import { createQueue, takeBatch, capRows, classify, QUEUE_CAP } from '../js/learnlog/outbox.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------ payloads */
test('cleanProps: unknown events are refused, unknown fields dropped', () => {
  assert.equal(cleanProps('page_view', {}), null);
  assert.equal(cleanProps('__proto__', {}), null);
  assert.deepEqual(cleanProps('landing_view', { email: 'a@b.c', ua: 'Mozilla' }), {});
  assert.deepEqual(cleanProps('sign_in'), {});
  assert.deepEqual(cleanProps('app_open', 'nope'), {});
});

test('cleanProps: types are checked, numbers clamped and rounded', () => {
  const p = cleanProps('lesson_done', { node: 'basics:lesson:ba1', mode: 'lesson', reached: 9.4, total: 9, accuracy: 0.8333, ms: 1e12, extra: 1 });
  assert.deepEqual(p, { node: 'basics:lesson:ba1', mode: 'lesson', reached: 9, total: 9, accuracy: 0.83, ms: 6 * 60 * 60 * 1000 });
  assert.deepEqual(cleanProps('lesson_done', { node: '<script>', mode: 'speedrun', accuracy: 7, reached: -3, ms: NaN }), { accuracy: 1, reached: 0 });
  assert.deepEqual(cleanProps('app_open', { pwa: 'true', onboarded: false }), { onboarded: false });
  assert.deepEqual(cleanProps('onboarding_step', { step: 9 }), { step: 2 });
  assert.deepEqual(cleanProps('milestone', { kind: 'achievement', id: 'first-lesson' }), { kind: 'achievement', id: 'first-lesson' });
  assert.deepEqual(cleanProps('milestone', { kind: 'gems', value: 5 }), { value: 5 });
  // free text never gets through an id field
  assert.deepEqual(cleanProps('challenge_start', { level: 'has spaces in it' }), {});
  assert.deepEqual(cleanProps('challenge_start', { level: 'x'.repeat(81) }), {});
});

test('cleanProps: what the app actually sends survives whole', () => {
  const ans = { node: 'basics:lesson:ba1', ex: 'ba1-type-add', type: 'type', ok: true, attempt: 2, skipped: false };
  assert.deepEqual(cleanProps('exercise_answer', ans), ans);
  const quit = { node: 'mistakes', mode: 'mistakes', reached: 3, total: 11, accuracy: 0.5, ms: 61234, ex: 'basics-1#4' };
  assert.deepEqual(cleanProps('lesson_quit', quit), quit);
  assert.deepEqual(cleanProps('onboarding_done', { placement: 2, goal: 30 }), { placement: 2, goal: 30 });
});

test('every event spec has at most 10 fields (the SQL policy limit)', () => {
  for (const [name, spec] of Object.entries(EVENTS)) assert.ok(Object.keys(spec).length <= 10, name);
});

/* --------------------------------------------------------- DNT / GPC */
test('privacySignal: Do Not Track and Global Privacy Control', () => {
  assert.equal(privacySignal({ doNotTrack: '1' }), true);
  assert.equal(privacySignal({ doNotTrack: 'yes' }), true);           // old Firefox
  assert.equal(privacySignal({}, { doNotTrack: '1' }), true);         // old IE / Safari put it on window
  assert.equal(privacySignal({ msDoNotTrack: '1' }), true);
  assert.equal(privacySignal({ globalPrivacyControl: true }), true);
  assert.equal(privacySignal({ doNotTrack: '0' }), false);
  assert.equal(privacySignal({ doNotTrack: 'unspecified', globalPrivacyControl: false }), false);
  assert.equal(privacySignal({ doNotTrack: null }), false);
  assert.equal(privacySignal(), false);
});

test('deviceClass is coarse', () => {
  assert.equal(deviceClass({ short: 390, coarse: true }), 'phone');
  assert.equal(deviceClass({ short: 820, coarse: true }), 'tablet');
  assert.equal(deviceClass({ short: 390, coarse: false }), 'desktop');   // a small desktop window
  assert.equal(deviceClass(), 'desktop');
});

test('hostAllowed: production https only, with a local override', () => {
  assert.equal(hostAllowed({ protocol: 'https:', hostname: 'treeling.vercel.app' }), true);
  assert.equal(hostAllowed({ protocol: 'http:', hostname: 'treeling.vercel.app' }), false);
  for (const hostname of ['localhost', '127.0.0.1', '192.168.1.4', 'playground.local', '[::1]']) assert.equal(hostAllowed({ protocol: 'https:', hostname }), false, hostname);
  assert.equal(hostAllowed({ protocol: 'http:', hostname: 'localhost' }, 'on'), true);
  assert.equal(hostAllowed({ protocol: 'https:', hostname: 'treeling.vercel.app' }, 'off'), false);
  assert.equal(hostAllowed({}), false);
});

/* ------------------------------------------------------------- outbox */
const row = (i, pad = 0) => ({ i, name: 'exercise_answer', props: { ex: 'x'.repeat(pad) } });
function memStore(initial) {
  let saved = initial;
  return { load: () => (saved === undefined ? [] : JSON.parse(JSON.stringify(saved))), store: (r) => { saved = JSON.parse(JSON.stringify(r)); }, get: () => saved };
}

test('classify: what is retried and what is dropped', () => {
  assert.equal(classify(201), 'ok');
  assert.equal(classify(204), 'ok');
  for (const s of [0, undefined, 408, 429, 500, 503]) assert.equal(classify(s), 'retry', String(s));
  for (const s of [400, 401, 403, 404, 409]) assert.equal(classify(s), 'drop', String(s));
});

test('capRows keeps the newest; takeBatch respects count and bytes', () => {
  assert.deepEqual(capRows([1, 2, 3, 4], 2), [3, 4]);
  const rows = Array.from({ length: 120 }, (_, i) => row(i));
  const [b, rest] = takeBatch(rows, 50);
  assert.equal(b.length, 50); assert.equal(rest.length, 70); assert.equal(rest[0].i, 50);
  const big = Array.from({ length: 10 }, (_, i) => row(i, 1000));
  const [b2] = takeBatch(big, 50, 3000);
  assert.ok(b2.length >= 1 && b2.length < 10);
  assert.ok(JSON.stringify(b2).length <= 3000);
  const [one] = takeBatch([row(0, 5000)], 50, 3000);   // a single oversized row still goes (the server decides)
  assert.equal(one.length, 1);
});

test('queue: push persists, says when to flush, caps at QUEUE_CAP dropping the oldest', () => {
  const m = memStore();
  const q = createQueue({ ...m, send: async () => 'ok', flushAt: 3 });
  assert.equal(q.push(row(1)), false);
  assert.equal(q.push(row(2)), false);
  assert.equal(q.push(row(3)), true);
  assert.equal(m.get().length, 3);
  const q2 = createQueue({ ...memStore(), send: async () => 'ok' });
  for (let i = 0; i < QUEUE_CAP + 25; i++) q2.push(row(i));
  assert.equal(q2.size, QUEUE_CAP);
  assert.equal(q2.rows()[0].i, 25);
});

test('queue: a sent batch leaves the queue; a failed one goes back to the front', async () => {
  const m = memStore();
  const sent = [];
  let verdict = 'retry';
  const q = createQueue({ ...m, send: async (rows) => { sent.push(rows.map((r) => r.i)); return verdict; }, batchMax: 2 });
  for (let i = 0; i < 5; i++) q.push(row(i));
  await q.flush();
  assert.deepEqual(sent, [[0, 1]]);
  assert.deepEqual(q.rows().map((r) => r.i), [0, 1, 2, 3, 4]);   // retried later, order kept
  verdict = 'ok';
  await q.flush({ all: true });
  assert.deepEqual(sent.slice(1), [[0, 1], [2, 3], [4]]);
  assert.equal(q.size, 0);
  assert.deepEqual(m.get(), []);
});

test('queue: rows the server refuses are dropped, a throwing send is a retry', async () => {
  const q = createQueue({ ...memStore(), send: async () => 'drop' });
  q.push(row(1));
  await q.flush();
  assert.equal(q.size, 0);
  const q2 = createQueue({ ...memStore(), send: async () => { throw new TypeError('Failed to fetch'); } });
  q2.push(row(1));
  await q2.flush({ all: true });                       // stops at the first failure, doesn't loop
  assert.equal(q2.size, 1);
});

test('queue: rows pushed while a batch is in flight are kept behind a retried batch', async () => {
  let release;
  const q = createQueue({ ...memStore(), send: () => new Promise((r) => { release = r; }) });
  q.push(row(1));
  const p = q.flush();
  q.push(row(2));
  release('retry');
  await p;
  assert.deepEqual(q.rows().map((r) => r.i), [1, 2]);
});

test('queue: survives a reload, and corrupt or blocked storage never throws', async () => {
  const m = memStore();
  const q = createQueue({ ...m, send: async () => 'retry' });
  q.push(row(7));
  const again = createQueue({ ...m, send: async () => 'ok' });
  assert.equal(again.size, 1);
  assert.equal(createQueue({ load: () => { throw new SyntaxError('bad json'); }, send: async () => 'ok' }).size, 0);
  assert.equal(createQueue({ load: () => ({ not: 'an array' }), send: async () => 'ok' }).size, 0);
  const blocked = createQueue({ store: () => { throw new Error('QuotaExceededError'); }, send: async () => 'ok' });
  assert.doesNotThrow(() => blocked.push(row(1)));
  await assert.doesNotReject(blocked.flush());
  assert.equal(blocked.size, 0);
});

/* ------------------------------------------------------ track() in node */
test('track() is a silent no-op without a browser', async () => {
  const { track, analyticsOn } = await import('../js/learnlog/send.js');
  assert.equal(analyticsOn(), false);
  assert.doesNotThrow(() => track('lesson_done', { node: 'a:lesson:b' }));
  assert.doesNotThrow(() => track('nonsense'));
});

/* ------------------------------------------------------------ SQL drift */
test('the SQL policy accepts exactly the declared event names', () => {
  const sql = readFileSync(join(repo, 'supabase/migrations/analytics.sql'), 'utf8');
  const m = sql.match(/name in \(([^)]*)\)/);
  assert.ok(m, 'name list in the insert policy');
  const names = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  assert.deepEqual([...names].sort(), [...EVENT_NAMES].sort());
});

test('schema.sql carries the analytics migration verbatim', () => {
  const schema = readFileSync(join(repo, 'supabase/schema.sql'), 'utf8');
  const mig = readFileSync(join(repo, 'supabase/migrations/analytics.sql'), 'utf8');
  const m = schema.match(/-- ==== analytics ====\n-- [^\n]*\n([\s\S]*?)-- ==== \/analytics ====/);
  assert.ok(m, 'analytics section in schema.sql');
  assert.equal(m[1], mig);
});

/* ---------------------------------------------------- blocker safety */
// Content blockers (uBlock Origin) block stats scripts. A blocked *static* import fails the whole module graph and
// the app renders nothing, so app code may only reach the stats code through js/learnlog.js (a dynamic import).
test('no shipped module statically imports the stats code', () => {
  const walk = (d) => readdirSync(join(repo, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []);
  const files = [...walk('js'), ...walk('site'), ...walk('admin')].filter((f) => !f.startsWith(join('js', 'learnlog')));
  const bad = files.filter((f) => /^\s*import[^(]*from\s*['"][^'"]*learnlog\//m.test(readFileSync(join(repo, f), 'utf8')));
  assert.deepEqual(bad, []);
  // and nothing shipped sits under a path blockers match on
  assert.deepEqual(files.filter((f) => /(^|\/)(analytics|tracking|telemetry)(\/|\.js$)|(^|\/)track\.js$/.test(f)), []);
});

test('the shim queues calls and never throws', async () => {
  const shim = await import('../js/learnlog.js');
  assert.equal(shim.analyticsOn(), false);
  assert.doesNotThrow(() => shim.track('lesson_done', { node: 'a:lesson:b' }));
  await shim.loadStats();
  assert.equal(shim.analyticsOn(), false);   // node: no browser, so stats stay off
});
