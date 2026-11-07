// Cloud sync engine (js/cloud/sync.js) end to end against an in-memory fake of supabase-js:
// first sign-in upload, debounced push with rev+1, merging another device's progress, a lost rev
// race being retried, "reset everywhere", and sign-out leaving guest saves untouched.
// The shipped config is empty, so the test copies js/ to a temp dir and points config.js at the fake.
// Run: node tests/sync.test.mjs (or node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'learn-git-sync-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
cpSync(join(repo, 'js'), join(dir, 'js'), { recursive: true });
writeFileSync(join(dir, 'fake-supabase.mjs'), FAKE_SUPABASE());
writeFileSync(join(dir, 'js/cloud/config.js'), `export const SUPABASE_URL = 'https://fake.supabase.co';
export const SUPABASE_ANON_KEY = 'anon';
export const SUPABASE_JS = ${JSON.stringify(pathToFileURL(join(dir, 'fake-supabase.mjs')).href)};
export const AUTH_STORAGE_KEY = 'learn-git:auth';
`);

// browser globals the app touches
const store = new Map();
globalThis.window = globalThis;
// localStorage over a Map; a Proxy so Object.keys(localStorage) lists the stored keys like a browser
const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.localStorage = new Proxy(ls, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { value: store.get(k), enumerable: true, configurable: true } : Reflect.getOwnPropertyDescriptor(t, k)),
});
globalThis.location = { search: '', href: 'http://localhost:8801/index.html', origin: 'http://localhost:8801', pathname: '/index.html', hash: '' };
globalThis.history = { state: null, replaceState() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { visibilityState: 'visible', addEventListener() {}, body: { dataset: {} } };
globalThis.addEventListener = () => {};

// a guest with some progress, who has a session (as after the OAuth return)
store.set('learn-git:v2', JSON.stringify({ v: 2, onboarded: true, totalXp: 30, xpByDay: { '2026-11-01': 30 }, gems: 25, nodes: { 'a:lesson:x': { done: true, crowns: 1, best: 1 } } }));
store.set('learn-git:auth', '{"t":1}');
const game = await import(pathToFileURL(join(dir, 'js/ui/game.js')).href);
const sync = await import(pathToFileURL(join(dir, 'js/cloud/sync.js')).href);
const db = globalThis.__db = { rows: new Map(), beforeUpdate: null, calls: [] };
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
let replaced = 0, signedIn = 0;

test('first sign-in uploads this device', async () => {
  sync.startCloud({ onReplaced: () => replaced++, onSignedIn: () => signedIn++ });
  for (let i = 0; i < 50 && sync.cloudStatus().phase !== 'synced'; i++) await tick();
  assert.equal(sync.cloudStatus().phase, 'synced');
  assert.ok(sync.signedIn());
  const row = db.rows.get('u1');
  assert.equal(row.rev, 1);
  assert.equal(row.state.totalXp, 30);
  assert.equal(replaced, 0);
});

test('save() while signed in stamps savedAt and pushes (rev+1)', async () => {
  game.addXp(10, { noBoost: true });
  assert.ok(game.G.savedAt > 0);
  await sync.flush();
  const row = db.rows.get('u1');
  assert.equal(row.rev, 2);
  assert.equal(row.state.totalXp, 40);
});

test('another device\'s progress is merged in and the app re-renders', async () => {
  const row = db.rows.get('u1');
  row.state.nodes['b:lesson:y'] = { done: true, crowns: 2, best: 0.9 };
  row.state.gems = 999; row.rev = 3;
  await sync.flush();
  assert.equal(game.G.gems, 999);
  assert.ok(game.G.nodes['b:lesson:y'].done && game.G.nodes['a:lesson:x'].done);
  assert.equal(replaced, 1);
  assert.equal(db.rows.get('u1').rev, 3); // nothing new locally: no write
});

test('a race on rev is retried and loses nothing', async () => {
  game.G.nodes['c:lesson:z'] = { done: true, crowns: 1, best: 1 }; game.save();
  db.beforeUpdate = () => { const r = db.rows.get('u1'); r.state.achievements = { ...(r.state.achievements || {}), other: 5 }; r.rev += 1; };
  await sync.flush();
  const r = db.rows.get('u1');
  assert.ok(r.state.nodes['c:lesson:z'] && r.state.achievements.other === 5);
  assert.equal(r.rev, 5); // 3, the other device's 4, then our retry 5
  assert.equal(game.G.achievements.other, 5);
});

test('reset everywhere wins over an older copy', async () => {
  const before = JSON.parse(JSON.stringify(db.rows.get('u1').state));
  await sync.resetEverywhere();
  const r = db.rows.get('u1');
  assert.ok(r.state.resetAt > 0);
  assert.equal(r.state.totalXp, 0);
  // an old device pushes its stale copy: merge keeps the reset
  const { mergeStates } = await import(pathToFileURL(join(dir, 'js/cloud/merge.js')).href);
  assert.equal(mergeStates(before, r.state).totalXp, 0);
});

test('sign out removes the hook: guest saves are untouched', async () => {
  await sync.signOut();
  assert.equal(sync.signedIn(), false);
  assert.equal(store.get('learn-git:auth'), undefined);
  const s0 = game.G.savedAt;
  game.addXp(5, { noBoost: true });
  assert.equal(game.G.savedAt, s0);
  assert.equal(sync.cloudStatus().phase, 'guest');
});

test('a browser joining after a "reset everywhere" keeps its own progress', async () => {
  // signed out now (previous test); this browser's guest copy has progress from after the reset
  assert.ok(db.rows.get('u1').state.resetAt > 0);
  delete game.G.resetAt; game.save();   // as on a browser that never saw the reset
  game.addXp(7, { noBoost: true });
  const xp = game.G.totalXp;
  assert.ok(xp > 0);
  store.set('learn-git:auth', '{"t":2}');
  globalThis.__authCb('SIGNED_IN', { user: { id: 'u1', email: 'p@example.com', user_metadata: {} } });
  for (let i = 0; i < 50 && !(sync.signedIn() && sync.cloudStatus().phase === 'synced'); i++) await tick();
  assert.equal(db.rows.get('u1').state.totalXp, xp);
  assert.equal(game.G.totalXp, xp);
  assert.equal(game.G.resetAt, db.rows.get('u1').state.resetAt);
});


// What admin_update_progress (supabase/schema.sql) does to the row: new value, stamp, rev + 1.
function adminSetXp(to) {
  const r = db.rows.get('u1');
  const from = r.state.totalXp;
  const days = Object.values(r.state.xpByDay).reduce((a, b) => a + b, 0);
  r.state.totalXp = to;
  r.state.adminEdits = { fields: { ...(r.state.adminEdits?.fields || {}), totalXp: { at: Date.now(), to, from, days } }, nodes: {}, courses: {} };
  r.rev += 1;
}

test('an admin lowering XP reaches a synced device and sticks', async () => {
  await sync.flush();
  const before = game.G.totalXp;
  assert.ok(before > 3);
  adminSetXp(3);
  await sync.flush();
  assert.equal(game.G.totalXp, 3);
  assert.equal(db.rows.get('u1').state.totalXp, 3);
  // later play adds on top, and the cloud gets it
  game.addXp(10, { noBoost: true });
  await sync.flush();
  assert.equal(game.G.totalXp, 13);
  assert.equal(db.rows.get('u1').state.totalXp, 13);
});

test('a device that played offline during the edit keeps that play on top of the edited value', async () => {
  game.addXp(4, { noBoost: true });          // not pushed yet: "offline"
  adminSetXp(1);                              // edited from 13 (the cloud value) while this device had 17
  await sync.flush();
  assert.equal(game.G.totalXp, 5);
  assert.equal(db.rows.get('u1').state.totalXp, 5);
});

test('an admin edit landing in the middle of a sync: the device retries and takes it', async () => {
  game.addXp(2, { noBoost: true });          // 7 locally
  const rev = db.rows.get('u1').rev;
  db.beforeUpdate = () => adminSetXp(0);      // between the device's read and its write
  await sync.flush();
  assert.equal(game.G.totalXp, 2);            // the edit (5 -> 0) plus this device's 2 on top
  assert.equal(db.rows.get('u1').state.totalXp, 2);
  assert.equal(db.rows.get('u1').rev, rev + 2);   // the admin's write, then the device's retry
});

function FAKE_SUPABASE() {
  return String.raw`// In-memory stand-in for supabase-js: auth + the progress table with rev semantics.
const db = globalThis.__db = globalThis.__db || { rows: new Map(), beforeUpdate: null, calls: [] };
const user = { id: 'u1', email: 'p@example.com', user_metadata: { full_name: 'Player', avatar_url: '' } };
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: localStorage.getItem('learn-git:auth') ? { user } : null } }),
      onAuthStateChange: (fn) => { globalThis.__authCb = fn; setTimeout(() => fn('INITIAL_SESSION', { user }), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => { localStorage.removeItem('learn-git:auth'); return { error: null }; },
      signInWithOAuth: async () => ({ error: null }),
    },
    rpc: async (name) => { db.calls.push(name); if (name === 'delete_my_account') db.rows.delete('u1'); return { error: null }; },
    from: () => query(),
  };
}
const J = (x) => JSON.parse(JSON.stringify(x));
function query() {
  const q = { filters: {}, op: 'select', payload: null, wantRows: false };
  const run = async () => {
    const row = db.rows.get(q.filters.user_id);
    if (q.op === 'select') return { data: row ? J(row) : null, error: null };
    if (q.op === 'insert') { if (db.rows.has(q.payload.user_id)) return { error: { code: '23505', message: 'dup' } }; db.rows.set(q.payload.user_id, J({ state: q.payload.state, rev: q.payload.rev })); return { error: null }; }
    if (q.op === 'update') {
      if (db.beforeUpdate) { const f = db.beforeUpdate; db.beforeUpdate = null; f(); }
      const cur = db.rows.get(q.filters.user_id);
      if (!cur || cur.rev !== q.filters.rev) return { data: [], error: null };
      if (q.payload.rev !== cur.rev + 1) return { error: { message: 'rev must +1' } };
      db.rows.set(q.filters.user_id, J({ state: q.payload.state, rev: q.payload.rev }));
      return { data: [{ rev: q.payload.rev }], error: null };
    }
  };
  Object.assign(q, {
    select() { if (q.op !== 'select') q.wantRows = true; return q; },
    eq(k, v) { q.filters[k] = v; return q; },
    maybeSingle: run,
    insert(p) { q.op = 'insert'; q.payload = p; return run(); },
    update(p) { q.op = 'update'; q.payload = p; return q; },
    then(res, rej) { return run().then(res, rej); },
  });
  return q;
}
`;
}
