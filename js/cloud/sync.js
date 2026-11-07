// Cross-device progress sync (Supabase). Nothing here runs until startCloud() is called with a
// non-empty js/cloud/config.js, and the SDK itself is only fetched when a session exists, the page is
// an OAuth return, or the player taps "Continue with Google". Guests never get past the first check.
//
// Flow (see .notes/user-accounts-supabase.md):
//   save() -> hook stamps G.savedAt and queues a push (debounced)
//   flush: read {state, rev} -> merged = mergeStates(local, remote) -> write merged with rev+1 only
//          where rev is still the one we read (another device won the race: read again and re-merge)
//          -> if merged has anything this device lacked, adopt it and re-render
//   flushes also run on sign-in, 'online', and when the tab is hidden or shown again.
import * as game from '../ui/game.js';
import { repairState } from '../storage.js';
import { mergeStates, sameState } from './merge.js';
import { AUTH_STORAGE_KEY } from './config.js';
import { cloudConfigured, hasStoredSession, isAuthReturn, cleanAuthParams, getClient, signInWithGoogle, profileOf } from './client.js';

const PUSH_DELAY = 3000;          // ms after the last save
const MAX_TRIES = 4;              // optimistic-concurrency retries per flush
const LAST_KEY = 'learn-git:sync:v1';
const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);

let sb = null, user = null, timer = null, running = null, again = false, dirty = false, started = false;
// True until this browser's first successful sync with the signed-in account (see syncOnce).
let firstSync = false;
let hooks = { onReplaced: () => {}, onSignedIn: () => {}, onAuthError: () => {} };
const listeners = new Set();

function readLast() { try { const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); return v && typeof v.at === 'number' ? v : null; } catch { return null; } }
function writeLast(v) { try { if (v) localStorage.setItem(LAST_KEY, JSON.stringify(v)); else localStorage.removeItem(LAST_KEY); } catch { /* storage blocked */ } }

// phase: off (no config) | guest | connecting | syncing | synced | offline | error
let status = { phase: 'off', user: null, lastSyncedAt: null, error: null };
function set(patch) {
  status = { ...status, ...patch };
  for (const fn of listeners) { try { fn(status); } catch (e) { console.warn(e); } }
}
export const cloudStatus = () => status;
export const cloudEnabled = () => cloudConfigured();
export const signedIn = () => !!user;
export function onCloudStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* ------------------------------------------------------------------ boot */
export function startCloud(opts = {}) {
  if (started || !cloudConfigured()) return;
  started = true;
  hooks = { ...hooks, ...opts };
  const last = readLast();
  set({ phase: hasStoredSession() || isAuthReturn() ? 'connecting' : 'guest', lastSyncedAt: last?.at || null });
  addEventListener('online', () => { if (user) flush(); else if (status.phase === 'offline') connect(); });
  addEventListener('offline', () => { if (user) set({ phase: 'offline' }); });
  document.addEventListener('visibilitychange', () => {
    if (!user) return;
    // leaving: push what's pending; coming back: pull what other devices did meanwhile
    if (document.visibilityState === 'hidden') { if (dirty) flush(); }
    else if (dirty || !status.lastSyncedAt || Date.now() - status.lastSyncedAt > 15000) flush();
  });
  if (hasStoredSession() || isAuthReturn()) connect();
}

let connecting = null;
function connect() {
  if (!connecting) connecting = doConnect().finally(() => { connecting = null; });
  return connecting;
}
async function doConnect() {
  const params = new URLSearchParams(location.search);
  const returnError = params.get('error_description') || params.get('error');
  const isReturn = params.has('code');
  try {
    sb = await getClient();
  } catch (e) {
    console.warn('[cloud] could not load supabase-js', e);
    set({ phase: navigator.onLine === false ? 'offline' : 'error', error: 'Could not reach the sign-in service.' });
    return;
  }
  // getSession() waits for the client to finish starting, which exchanges ?code= for a session.
  let session = null;
  try { ({ data: { session } } = await sb.auth.getSession()); } catch (e) { console.warn('[cloud] getSession', e); }
  cleanAuthParams();
  if (!session && (returnError || isReturn)) hooks.onAuthError(returnError ? 'Sign-in was cancelled.' : 'Sign-in did not finish. Please try again.');
  sb.auth.onAuthStateChange((event, s) => {
    // Never await Supabase calls inside this callback (supabase-js holds a lock while it runs).
    setTimeout(() => {
      if (event === 'SIGNED_OUT') { if (user) ended(); return; }
      if (s?.user && (!user || user.id !== s.user.id)) begin(s.user, true);
      else if (s?.user) { user = s.user; set({ user: profileOf(user) }); }
    }, 0);
  });
  if (session?.user) await begin(session.user, isReturn);
  else if (!user) set({ phase: 'guest', user: null });
}

async function begin(u, fresh) {
  const prev = readLast();
  user = u;
  game.setSaveHook(onSave);
  set({ user: profileOf(u), error: null });
  // A different account than last time on this browser: never "remember" the old sync time.
  if (prev && prev.uid !== u.id) { writeLast(null); set({ lastSyncedAt: null }); }
  firstSync = !(prev && prev.uid === u.id);
  // No savedAt stamp here: a device that never synced has none, so on a first sign-in the
  // cloud copy's settings (goal, outfit, ...) win over this device's defaults.
  await flush();
  if (fresh) hooks.onSignedIn(profileOf(u));
}
function ended() {
  user = null; dirty = false;
  clearTimeout(timer); timer = null;
  game.setSaveHook(null);
  writeLast(null);
  set({ phase: 'guest', user: null, lastSyncedAt: null, error: null });
}

/* ------------------------------------------------------------------ push */
function onSave(G) {
  G.savedAt = Date.now();
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(() => flush(), PUSH_DELAY);
  if (navigator.onLine === false) set({ phase: 'offline' });
}

export async function flush() {
  if (!sb || !user) return;
  if (running) { again = true; return running; }
  clearTimeout(timer); timer = null;
  const uid = user.id;
  running = (async () => {
    if (navigator.onLine === false) { set({ phase: 'offline' }); return; }
    set({ phase: 'syncing' });
    try {
      let ok = false;
      for (let i = 0; i < MAX_TRIES && !ok; i++) ok = await syncOnce(uid);
      if (user?.id !== uid) return;   // signed out meanwhile
      if (!ok) throw new Error('kept losing the race to another device');
      const at = Date.now();
      writeLast({ at, uid });
      firstSync = false;
      set({ phase: 'synced', lastSyncedAt: at, error: null });
    } catch (e) {
      if (user?.id !== uid) return;
      dirty = true;   // whatever this round was carrying still has to go up
      console.warn('[cloud] sync failed', e);
      set({ phase: navigator.onLine === false ? 'offline' : 'error', error: e?.message || String(e) });
      // try again later; a save, 'online' or coming back to the tab also retries
      if (navigator.onLine !== false) { clearTimeout(timer); timer = setTimeout(() => flush(), 60000); }
    }
  })();
  try { await running; } finally { running = null; }
  if (again) { again = false; return flush(); }
}

// One read-merge-write round. Returns false when another device wrote in between (rev moved on).
async function syncOnce(uid) {
  dirty = false;   // anything saved from here on queues another round
  const { data: row, error } = await sb.from('progress').select('state, rev').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  // The account was "reset everywhere" at some point. A browser that synced with it before holds a
  // pre-reset copy, which the merge drops. A browser joining for the first time holds new progress
  // (a guest's, or a copy made after signing out), so it joins the current epoch and is merged in.
  const remoteReset = isObj(row?.state) && typeof row.state.resetAt === 'number' ? row.state.resetAt : 0;
  if (firstSync && remoteReset > (game.G.resetAt || 0)) game.G.resetAt = remoteReset;
  const local = repairState(game.G);
  if (!row) {
    // first sign-in anywhere: this device's progress becomes the cloud copy
    const { error: e } = await sb.from('progress').insert({ user_id: uid, state: local, rev: 1 });
    if (e) { if (e.code === '23505') return false; throw e; }
    return true;
  }
  const remote = isObj(row.state) ? repairState(row.state) : null;
  const merged = remote ? mergeStates(local, remote) : local;
  if (!sameState(merged, row.state)) {
    const { data, error: e } = await sb.from('progress').update({ state: merged, rev: row.rev + 1 }).eq('user_id', uid).eq('rev', row.rev).select('rev');
    if (e) throw e;
    if (!data?.length) return false;
  }
  adopt(merged);
  return true;
}

// Brings what the cloud had into this device. G may have moved on during the round trip, so the
// merged copy is merged once more with the live G (merging is idempotent, so nothing doubles).
function adopt(merged) {
  const live = game.G;
  const next = mergeStates(live, merged);
  if (!sameState(next, merged)) dirty = true;           // played meanwhile: push again soon
  if (sameState(next, live)) return;
  game.replaceState(next);
  try { hooks.onReplaced(); } catch (e) { console.warn(e); }
  if (dirty) { clearTimeout(timer); timer = setTimeout(() => flush(), PUSH_DELAY); }
}

/* -------------------------------------------------------------- actions */
export async function signIn() {
  set({ phase: 'connecting', error: null });
  try { await signInWithGoogle(); }   // navigates away to Google
  catch (e) {
    set({ phase: user ? 'synced' : 'guest', error: navigator.onLine === false ? 'You are offline.' : (e?.message || 'Sign-in failed.') });
    throw e;
  }
}

// Signs this browser out (other devices stay signed in). Progress stays here as a guest copy.
export async function signOut() {
  if (!sb || !user) return;
  if (dirty) { try { await flush(); } catch { /* keep going */ } }
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { console.warn(e); }
  dropLocalSession();
  ended();
}

// Deletes the account and its cloud copy (delete_my_account() in supabase/schema.sql).
export async function deleteAccount() {
  if (!sb || !user) throw new Error('Not signed in.');
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  try { await sb.auth.signOut({ scope: 'local' }); } catch { /* the user is gone already */ }
  dropLocalSession();
  ended();
}

// "Reset everywhere": a fresh state stamped with resetAt wins every later merge against older copies.
export async function resetEverywhere() {
  game.resetAll();
  game.G.resetAt = Date.now();
  game.save();
  await flush();
  return status.phase === 'synced';
}

function dropLocalSession() {
  try { for (const k of Object.keys(localStorage)) if (k === AUTH_STORAGE_KEY || k.startsWith(AUTH_STORAGE_KEY + '-')) localStorage.removeItem(k); } catch { /* storage blocked */ }
}
