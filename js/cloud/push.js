// Daily push reminders for signed-in players (Web Push + VAPID). This device subscribes through the
// service worker's pushManager and stores the subscription, its time zone and the chosen hour in
// public.push_subscriptions (RLS: own rows only). The send-reminders Edge Function does the rest
// (supabase/functions/send-reminders, .notes/push-reminders.md).
//
// The setting is per device: a push subscription belongs to one browser. What this browser chose
// is mirrored in localStorage ('learn-git:push') so the UI can draw without a network round trip,
// and so js/pwa.js can mute its local-only reminder while push is on.
import * as cfg from './config.js';
import { getClient } from './client.js';

const KEY = 'learn-git:push';   // { on, hour, uid, endpoint }

export const pushConfigured = () => !!cfg.VAPID_PUBLIC_KEY;
export function prefs() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function savePrefs(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } }
export const remindersOn = (uid) => { const p = prefs(); return !!p.on && (!uid || p.uid === uid); };

export function localTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'ok' | 'ios-install' (iOS/iPadOS: only an app added to the Home Screen gets push) |
// 'ios-old' (installed, but iOS before 16.4) | 'insecure' (http) | 'unsupported'
export function pushSupport() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS()) return !standalone() ? 'ios-install' : has ? 'ok' : 'ios-old';
  return has ? 'ok' : 'unsupported';
}
export const permission = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

function keyBytes() {
  const b64 = cfg.VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const sameBytes = (a, b) => !!a && !!b && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  // Not registered yet (first load): wait a little for js/pwa.js, but never forever (?nosw).
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
}

// This browser's push subscription under our VAPID key, created if needed. fresh: drop the old one first.
async function subscription({ create = true, fresh = false } = {}) {
  const reg = await registration();
  if (!reg?.pushManager) throw Object.assign(new Error('no service worker'), { reason: 'unsupported' });
  let sub = await reg.pushManager.getSubscription();
  const key = keyBytes();
  if (sub && (fresh || !sameBytes(sub.options?.applicationServerKey, key))) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sub;
}

// Writes this device's row (insert or update by endpoint). An endpoint still owned by another
// account (signed out offline) can't be taken over under RLS, so the browser gets a new one.
async function saveRow(uid, sub, hour) {
  const sb = await getClient();
  const write = async (s) => {
    const j = s.toJSON();
    const fields = { keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, time_zone: localTimeZone(), reminder_hour: hour, enabled: true };
    const { data: rows, error: e1 } = await sb.from('push_subscriptions').select('id').eq('endpoint', j.endpoint);
    if (e1) throw e1;
    const { error } = rows?.length
      ? await sb.from('push_subscriptions').update(fields).eq('id', rows[0].id)
      : await sb.from('push_subscriptions').insert({ user_id: uid, endpoint: j.endpoint, ...fields });
    return { error, endpoint: j.endpoint };
  };
  let { error, endpoint } = await write(sub);
  if (error?.code === '23505') ({ error, endpoint } = await write(await subscription({ fresh: true })));
  if (error) throw error;
  const old = prefs().endpoint;
  if (old && old !== endpoint) await sb.from('push_subscriptions').delete().eq('endpoint', old).then(() => {}, () => {});
  return endpoint;
}

// Turns reminders on for this device. Call straight from the click (Safari wants the permission
// prompt inside the user gesture). Resolves { ok } or { ok: false, reason: 'denied' | 'dismissed' |
// 'unsupported' | 'error' }.
export async function enableReminders(uid, hour) {
  if (pushSupport() !== 'ok' || !pushConfigured()) return { ok: false, reason: 'unsupported' };
  let p = permission();
  if (p !== 'granted') p = await Notification.requestPermission().catch(() => 'denied');
  if (p !== 'granted') return { ok: false, reason: p === 'denied' ? 'denied' : 'dismissed' };
  try {
    const endpoint = await saveRow(uid, await subscription(), hour);
    savePrefs({ on: true, hour, uid, endpoint });
    return { ok: true };
  } catch (e) {
    console.warn('[push] enable', e);
    return { ok: false, reason: e?.reason || 'error' };
  }
}

export async function setReminderHour(uid, hour) {
  const p = prefs();
  if (!p.on || p.uid !== uid) { savePrefs({ ...p, hour }); return; }
  const sb = await getClient();
  const { data, error } = await sb.from('push_subscriptions').update({ reminder_hour: hour, time_zone: localTimeZone() }).eq('endpoint', p.endpoint).select('id');
  if (error) throw error;
  if (!data?.length) { const endpoint = await saveRow(uid, await subscription(), hour); savePrefs({ ...p, hour, endpoint }); return; }
  savePrefs({ ...p, hour });
}

// Turns reminders off here: the row goes, and the browser drops the subscription too, so even a
// row the delete couldn't reach (offline) only earns a 410 and is pruned by the next run.
export async function disableReminders() {
  const p = prefs();
  if (p.endpoint) {
    try { const sb = await getClient(); await sb.from('push_subscriptions').delete().eq('endpoint', p.endpoint); } catch (e) { console.warn('[push] delete row', e); }
  }
  try { const s = await subscription({ create: false }); await s?.unsubscribe(); } catch { /* no SW */ }
  savePrefs({ on: false, hour: p.hour });
}

// Sign-out and account deletion: this browser must stop getting the account's reminders.
// server: false after delete_my_account() (the rows went with the account).
export async function forgetDevice({ server = true } = {}) {
  const p = prefs();
  if (!p.on && !p.endpoint) { if (p.uid) savePrefs(null); return; }
  if (server && p.endpoint) {
    try { const sb = await getClient(); await sb.from('push_subscriptions').delete().eq('endpoint', p.endpoint); } catch { /* offline: the 410 prune covers it */ }
  }
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    try { const s = await subscription({ create: false }); await s?.unsubscribe(); } catch { /* no SW */ }
  }
  savePrefs(null);
}

// After sign-in (and on every load while signed in): keep the row in step with the browser.
// A rotated or lost subscription, a revoked permission, a new time zone, or a row the server
// pruned are all fixed here. Cheap when reminders are off (a localStorage read).
export async function reconcileReminders(uid) {
  const p = prefs();
  if (!p.on) return;
  if (p.uid !== uid) { await forgetDevice({ server: false }); return; }
  if (pushSupport() !== 'ok' || !pushConfigured()) return;
  if (permission() !== 'granted') { await disableReminders(); return; }
  const sub = await subscription();
  const sb = await getClient();
  const { data, error } = await sb.from('push_subscriptions').select('time_zone, reminder_hour, enabled').eq('endpoint', sub.endpoint);
  if (error) return;
  const row = data?.[0];
  if (!row || sub.endpoint !== p.endpoint || row.time_zone !== localTimeZone() || !row.enabled || row.reminder_hour !== p.hour) {
    const endpoint = await saveRow(uid, sub, Number.isInteger(p.hour) ? p.hour : 19);
    savePrefs({ ...p, endpoint });
  }
}
