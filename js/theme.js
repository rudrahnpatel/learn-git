// Light / Dark / System theme. The choice lives in localStorage ('learn-git:theme'); "system"
// (the default) removes data-theme so the prefers-color-scheme media query decides. index.html
// applies the stored choice inline before first paint, so there is no flash.
const KEY = 'learn-git:theme';
export const THEMES = ['system', 'light', 'dark'];

export function getTheme() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}
export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
  const dark = t === 'dark' || (t === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#14141c' : '#f0f6ff'));
}
export function setTheme(t) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* storage blocked: still applies for this visit */ }
  applyTheme(t);
}
// System -> Light -> Dark -> System
export const nextTheme = (t = getTheme()) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
export const themeLabel = (t) => ({ system: 'Theme: follows your system', light: 'Theme: light', dark: 'Theme: dark' }[t]);

// App accent (a shop item): recolours the action colour. The id comes from the equipped 'theme'
// slot; it is mirrored to localStorage so index.html could apply it before first paint too.
const ACCENT_KEY = 'learn-git:accent';
export function applyAccent(id) {
  const name = id ? String(id).replace(/^accent-/, '') : '';
  if (name) document.documentElement.setAttribute('data-accent', name); else document.documentElement.removeAttribute('data-accent');
  try { if (name) localStorage.setItem(ACCENT_KEY, name); else localStorage.removeItem(ACCENT_KEY); } catch { /* storage blocked */ }
}
