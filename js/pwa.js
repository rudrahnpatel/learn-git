// PWA glue (owned by the shell, independent of the game code): service worker registration, the
// "Update available" toast, the install button and an opt-in streak reminder. Everything fails silently.
// Escape hatch: add ?nosw to a URL to unregister the worker and clear its caches (and keep it off for that load).

const $ = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'text' ? (el.textContent = v) : el.setAttribute(k, v);
  el.append(...kids);
  return el;
};
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const corner = $('div', { id: 'pwa-corner' });
document.body.append(corner);

// ---- service worker -------------------------------------------------------------------------------
async function killSW() {
  // Unregister and clear caches. The param stays in the URL, so this page load never re-registers;
  // drop ?nosw to turn the worker back on. If the worker was controlling this load, reload once.
  const wasControlled = !!navigator.serviceWorker.controller;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  for (const k of await caches.keys()) await caches.delete(k);
  if (wasControlled) location.reload();
}

function showUpdateToast(worker) {
  if (document.querySelector('.pwa-toast')) return;
  const go = $('button', { type: 'button', text: 'Reload' });
  const later = $('button', { type: 'button', class: 'pwa-later', text: 'Later' });
  const toast = $('div', { class: 'pwa-toast', role: 'status' }, $('span', { text: 'Update available' }), go, later);
  go.addEventListener('click', () => { go.disabled = true; go.textContent = 'Updating'; worker.postMessage('SKIP_WAITING'); });
  later.addEventListener('click', () => toast.remove());
  document.body.append(toast);
}

async function registerSW() {
  // Service workers need HTTPS or localhost: on plain-http LAN hosts there is simply nothing to do.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (new URLSearchParams(location.search).has('nosw')) return killSW();

  const hadController = !!navigator.serviceWorker.controller;
  const reg = await navigator.serviceWorker.register('sw.js');
  const watch = (w) => w.addEventListener('statechange', () => {
    // "installed" while a controller exists means an update is waiting (a first install has no controller).
    if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast(w);
  });
  if (reg.waiting && navigator.serviceWorker.controller) showUpdateToast(reg.waiting);
  reg.addEventListener('updatefound', () => reg.installing && watch(reg.installing));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;   // the very first claim needs no reload
    reloading = true; location.reload();
  });
  // Look for a new version when the app comes back to the foreground, and hourly while open.
  const check = () => reg.update().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60 * 60 * 1000);
  window.__pwa = { reg, check };
}

// ---- install button -------------------------------------------------------------------------------
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferred = e;
  if (corner.querySelector('.pwa-install')) return;
  const b = $('button', { type: 'button', class: 'pwa-pill pwa-install', text: 'Install app' });
  b.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null; b.remove();
  });
  corner.prepend(b);
});
window.addEventListener('appinstalled', () => { deferred = null; corner.querySelector('.pwa-install')?.remove(); offerReminder(); });

// ---- streak reminder (opt-in, local only) -------------------------------------------------------------
// Honest scope: a page cannot wake itself when closed, and guests have no push subscription. So this only
// fires while the app is open or installed-and-running (e.g. a background tab or window), at 18:00 or later,
// once a day, and only if today's goal is not met and there is a streak to lose.
const R_KEY = 'learn-git:remind';
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

// Signed-in players can turn on real push reminders in the account card (js/cloud/push.js). While
// those are on for this device, this local reminder stays quiet so nobody gets two.
function pushOn() { try { return !!JSON.parse(lsGet('learn-git:push') || 'null')?.on; } catch { return false; } }
function streakAtRisk() {
  try {
    const s = JSON.parse(lsGet('learn-git:v2') || 'null');     // read-only peek at the game's own save
    return !!s && (s.streak?.count || 0) > 0 && !s.goalDays?.[dayKey()];
  } catch { return false; }
}
async function remindTick() {
  if (lsGet(R_KEY) !== 'on' || Notification.permission !== 'granted' || pushOn()) return;
  if (new Date().getHours() < 18 || lsGet(R_KEY + ':last') === dayKey() || !streakAtRisk()) return;
  lsSet(R_KEY + ':last', dayKey());
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts = { body: 'One short lesson keeps your commit line going.', icon: 'icons/icon-192.png', tag: 'streak' };
  reg ? reg.showNotification('Keep your streak alive', opts) : new Notification('Keep your streak alive', opts);
}
function offerReminder() {
  if (!('Notification' in window) || corner.querySelector('.pwa-remind')) return;
  if (lsGet(R_KEY) === 'on' && Notification.permission === 'granted') { setInterval(remindTick, 5 * 60 * 1000); remindTick(); return; }
  if (!standalone() || Notification.permission !== 'default' || lsGet(R_KEY) === 'no' || pushOn()) return;
  const b = $('button', { type: 'button', class: 'pwa-pill pwa-remind', text: 'Remind me to practise' });
  b.addEventListener('click', async () => {
    const p = await Notification.requestPermission().catch(() => 'denied');
    lsSet(R_KEY, p === 'granted' ? 'on' : 'no'); b.remove(); if (p === 'granted') offerReminder();
  });
  corner.append(b);
}

registerSW().catch(() => {});
offerReminder();
