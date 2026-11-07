// The Supabase client, created on first use. The SDK is imported from the CDN only here, so a guest
// (or an empty config) never downloads it. Shared by the game (js/cloud/sync.js) and /admin.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS, AUTH_STORAGE_KEY } from './config.js';

export const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// True when this browser holds a session (or is mid-way through a PKCE sign-in), checked without the SDK.
export function hasStoredSession() {
  try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch { return false; }
}
// The page was opened by the OAuth redirect: ?code=... (success) or ?error=... (cancelled / failed).
export function isAuthReturn() {
  const p = new URLSearchParams(location.search);
  return p.has('code') || p.has('error') || p.has('error_description');
}
// Removes ?error=... from the address bar (supabase-js removes ?code= itself after the exchange).
export function cleanAuthParams() {
  const url = new URL(location.href);
  let changed = false;
  for (const k of ['code', 'error', 'error_code', 'error_description', 'state']) if (url.searchParams.has(k)) { url.searchParams.delete(k); changed = true; }
  if (changed) history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

let clientP = null;
export function getClient() {
  if (!cloudConfigured()) return Promise.reject(new Error('Supabase is not configured (js/cloud/config.js)'));
  if (!clientP) {
    clientP = import(SUPABASE_JS).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
    })).catch((e) => { clientP = null; throw e; });   // offline: try again next time
  }
  return clientP;
}

// Google OAuth (PKCE): the browser leaves for Google and comes back to this same page with ?code=.
export async function signInWithGoogle() {
  const sb = await getClient();
  const redirectTo = location.origin + location.pathname;   // /app on Vercel, /index.html or /admin locally
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

// Display fields from a Supabase user (Google fills full_name / avatar_url).
export function profileOf(user) {
  const m = user?.user_metadata || {};
  return { id: user?.id, email: user?.email || m.email || '', name: m.full_name || m.name || '', avatar: m.avatar_url || m.picture || '' };
}
