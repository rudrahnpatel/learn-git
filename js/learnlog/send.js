// First-party, cookie-free analytics (.notes/analytics-supabase.md). Events go to our own Supabase
// project (the `events` table, insert-only for the anon key) with plain fetch: supabase-js is never
// loaded for this, so guests still download nothing extra.
//
//   track('lesson_done', { node, accuracy, ... })   fire and forget; never throws, never blocks
//
// Off (sends nothing, stores nothing) when: js/cloud/config.js is empty, the browser sends Do Not
// Track or Global Privacy Control, the host isn't the production site (localhost, LAN, plain http;
// localStorage 'learn-git:analytics' = 'on' forces it on for testing, 'off' always turns it off),
// or there is no fetch / localStorage (node tests).
//
// What a row holds: a random install id (localStorage, made here, never linked to a Google account),
// a per-visit session id (sessionStorage, 30 min idle), the event name, a coarse device class
// (phone / tablet / desktop), the client time and the props declared in kinds.js. No IP is stored
// (Supabase's REST API doesn't put it in the row), no user agent, no user id, no referrer.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../cloud/config.js';
import { cleanProps, privacySignal, deviceClass, hostAllowed } from './kinds.js';
import { createQueue, classify } from './outbox.js';

const INSTALL_KEY = 'learn-git:aid';
const SESSION_KEY = 'learn-git:asid';
const QUEUE_KEY = 'learn-git:aq';
const OVERRIDE_KEY = 'learn-git:analytics';
const SESSION_IDLE = 30 * 60 * 1000;
const FLUSH_EVERY = 15000;

let on = null;      // decided once per page load
let queue = null, timer = null, device = 'desktop';

const ls = (k, v) => {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ }
  return null;
};

export function analyticsOn() {
  if (on !== null) return on;
  try {
    on = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
      && typeof fetch === 'function' && typeof localStorage !== 'undefined' && typeof document !== 'undefined'
      && !privacySignal(globalThis.navigator || {}, globalThis)
      && hostAllowed(globalThis.location || {}, ls(OVERRIDE_KEY));
  } catch { on = false; }
  if (!on) { ls(QUEUE_KEY, null); return on; }   // a queue left from before DNT was switched on is dropped
  setup();
  return on;
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));   // plain-http hosts have no randomUUID
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function installId() {
  let id = ls(INSTALL_KEY);
  if (!id || !UUID_RE.test(id)) { id = uuid(); ls(INSTALL_KEY, id); }
  return id;
}
function sessionId() {
  const now = Date.now();
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { /* none */ }
  if (!s || !UUID_RE.test(s.id || '') || now - (s.last || 0) > SESSION_IDLE) s = { id: uuid() };
  s.last = now;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* blocked: one id per page load */ }
  return s.id;
}

// The anon key goes in `apikey`. A legacy anon key (a JWT) also goes in Authorization; the new
// sb_publishable_ keys are not JWTs and must not.
function headers() {
  const h = { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY, prefer: 'return=minimal' };
  if (!SUPABASE_ANON_KEY.startsWith('sb_')) h.authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  return h;
}
async function send(rows) {
  if (navigator.onLine === false) return 'retry';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
    method: 'POST', headers: headers(), body: JSON.stringify(rows),
    keepalive: true, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
  });
  return classify(res.status);
}

function setup() {
  try {
    const short = Math.min(screen.width || 0, screen.height || 0);
    device = deviceClass({ short, coarse: matchMedia('(pointer: coarse)').matches });
  } catch { /* desktop */ }
  queue = createQueue({
    load: () => JSON.parse(ls(QUEUE_KEY) || '[]'),
    store: (rows) => ls(QUEUE_KEY, rows.length ? JSON.stringify(rows) : null),
    send,
  });
  const leave = () => { clearTimeout(timer); timer = null; queue.flush({ unloading: true }); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  addEventListener('pagehide', leave);
  addEventListener('online', () => queue.flush({ all: true }));
  // whatever an earlier visit left queued (offline, or closed before it sent)
  if (queue.size) later(3000);
}
function later(ms = FLUSH_EVERY) {
  if (!timer) timer = setTimeout(() => { timer = null; queue.flush({ all: true }); }, ms);
}

export function track(name, props) {
  try {
    if (!analyticsOn()) return;
    const clean = cleanProps(name, props);
    if (!clean) { console.warn('[analytics] unknown event', name); return; }
    const row = { at: new Date().toISOString(), install_id: installId(), session_id: sessionId(), name, device, props: clean };
    if (queue.push(row)) queue.flush();
    else later();
  } catch { /* analytics must never break the app */ }
}
