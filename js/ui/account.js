// Account UI: the profile's account card (sign in / avatar, name, email, sync status, sign out,
// delete account), the one-time "Save your progress" nudge after the first lesson, the onboarding
// "I already have progress" link, and the reset flow that also knows about the cloud copy.
// With an empty js/cloud/config.js every function here returns null / does nothing extra.
import { h, modal, confirmModal } from '../dom.js';
import { REWARDS } from '../brand.js';
import { sfx } from '../sound.js';
import { ICON, toast } from './fx.js';
import { twig } from './twig.js';
import * as game from './game.js';
import { sandboxStore, historyStore } from '../storage.js';
import * as cloud from '../cloud/sync.js';
import { analyticsOn } from '../analytics/track.js';
import { reminderSection } from './reminder.js';

const GOOGLE_G = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

const enabled = () => cloud.cloudEnabled();

export function googleButton({ label = 'Continue with Google', cls = 'btn primary' } = {}) {
  const btn = h('button', { class: cls + ' google-btn', type: 'button', onclick: async () => {
    sfx.tap();
    btn.disabled = true;
    try { await cloud.signIn(); }
    catch (e) { btn.disabled = false; toast(navigator.onLine === false ? 'You\'re offline. Sign in when you\'re back online.' : 'Could not start sign-in. Please try again.', { icon: ICON.close(), ms: 3200 }); }
  } }, h('span', { class: 'g-ic', html: GOOGLE_G }), label);
  return btn;
}

function ago(t) {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function statusText(st = cloud.cloudStatus()) {
  switch (st.phase) {
    case 'connecting': return 'Connecting…';
    case 'syncing': return 'Syncing…';
    case 'synced': return st.lastSyncedAt ? `Synced ${ago(st.lastSyncedAt)}` : 'Synced';
    case 'offline': return 'Offline, will sync when you\'re back';
    case 'error': return 'Couldn\'t sync, will retry';
    default: return '';
  }
}

function avatarEl(p, size = 64) {
  const initial = (p.name || p.email || '?').trim()[0]?.toUpperCase() || '?';
  const fallback = h('span', { class: 'acct-avatar acct-initial', style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' }, initial);
  if (!p.avatar) return fallback;
  const img = h('img', { class: 'acct-avatar', src: p.avatar, alt: '', width: size, height: size, referrerpolicy: 'no-referrer', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(fallback));
  return img;
}

/* -------------------------------------------------------- profile card */
// The account section of #/profile. Re-draws itself when the sync status changes.
export function accountCard() {
  if (!enabled()) return null;
  const card = h('section', { class: 'card acct-card', 'aria-labelledby': 'acct-h' });
  let tick = null;
  let rem = null;   // the "Daily reminder" block, kept across redraws (built once per signed-in user)
  const draw = () => {
    if (!card.isConnected && card.dataset.drawn) { off(); clearInterval(tick); return; }
    card.dataset.drawn = '1';
    const st = cloud.cloudStatus();
    const p = st.user;
    if (!p) {
      const busy = st.phase === 'connecting';
      card.replaceChildren(
        h('div', { class: 'card-head' }, h('h2', { id: 'acct-h' }, 'Save your progress'), h('span', { class: 'mono tiny' }, 'GUEST')),
        h('p', { class: 'muted acct-copy' }, `Right now your progress lives only in this browser. Sign in to keep your ${REWARDS.streak.name}, lessons and ${REWARDS.currency.many} safe and pick up on any device.`),
        h('div', { class: 'acct-actions' }, busy ? h('span', { class: 'mono tiny' }, 'CONNECTING…') : googleButton()),
        st.error ? h('p', { class: 'acct-err small' }, st.error) : '');
      return;
    }
    if (rem?.uid !== p.id) rem = { uid: p.id, el: reminderSection(p.id) };
    const keepFocus = rem.el?.contains(document.activeElement) ? document.activeElement : null;
    const status = h('span', { class: `acct-status s-${st.phase}`, role: 'status' }, h('span', { class: 'acct-dot', 'aria-hidden': 'true' }), statusText(st));
    card.replaceChildren(
      h('div', { class: 'card-head' }, h('h2', { id: 'acct-h' }, 'Account'), h('span', { class: 'mono tiny' }, 'GOOGLE')),
      h('div', { class: 'acct-who' }, avatarEl(p),
        h('div', { class: 'acct-id' }, h('span', { class: 'acct-name' }, p.name || p.email), p.name ? h('span', { class: 'muted acct-email' }, p.email) : null, status)),
      h('div', { class: 'acct-actions' },
        st.phase === 'error' || st.phase === 'offline' ? h('button', { class: 'btn small', type: 'button', onclick: () => { sfx.tap(); cloud.flush(); } }, 'Sync now') : null,
        h('button', { class: 'btn small dark', type: 'button', onclick: () => signOutFlow() }, 'Sign out'),
        h('button', { class: 'btn small ghost acct-delete', type: 'button', onclick: () => deleteFlow() }, 'Delete account')),
      rem.el,
      h('p', { class: 'muted small acct-note' }, 'Your progress is merged across every device you sign in on. Signing out keeps a copy here.'));
    keepFocus?.focus({ preventScroll: true });   // the redraw moved the reminder block; keep the keyboard where it was
  };
  const off = cloud.onCloudStatus(draw);
  tick = setInterval(draw, 30000);   // "synced 2 min ago" keeps counting
  draw();
  return card;
}

async function signOutFlow() {
  sfx.tap();
  // Asks every time: keep a guest copy here (own device), or wipe this browser (shared computer).
  // Either way the account keeps everything; signOut() pushes any unsynced progress first.
  const choice = await new Promise((resolve) => {
    let done = false;
    const pick = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const m = modal('Sign out?', h('div', { class: 'confirm' },
      h('p', {}, 'Your progress is safe in your account. Keep a copy on this device, or clear it? Clear it on a shared or public computer.'),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => pick(null) }, 'Cancel'),
        h('button', { class: 'btn', type: 'button', onclick: () => pick('clear') }, 'Clear this device'),
        h('button', { class: 'btn dark', type: 'button', onclick: () => pick('keep') }, 'Keep progress here'))),
    { onClose: () => { if (!done) { done = true; resolve(null); } } });
  });
  if (!choice) return;
  await cloud.signOut();
  if (choice === 'keep') { toast('Signed out. Playing as a guest.', { icon: ICON.check() }); return; }
  game.resetAll();
  sandboxStore.clear();
  historyStore.save([]);
  location.hash = '#/';
  location.reload();
}

async function deleteFlow() {
  sfx.tap();
  const ok = await confirmModal('Delete your account?',
    'This deletes your account and the cloud copy of your progress, on every device, and can\'t be undone. The progress on this device stays here as a guest copy.',
    { ok: 'Delete account', cancel: 'Keep it', danger: true });
  if (!ok) return;
  try {
    await cloud.deleteAccount();
    toast('Account deleted. This device keeps playing as a guest.', { ms: 3200 });
  } catch (e) {
    console.warn(e);
    toast(navigator.onLine === false ? 'You\'re offline. Try again when you\'re back.' : 'Could not delete the account. Please try again.', { icon: ICON.close(), ms: 3200 });
  }
}

/* --------------------------------------------------------------- nudge */
// Once, after the first finished lesson: "Save your progress". The flag lives in G.seen.
export function maybeSigninNudge() {
  if (!enabled() || cloud.signedIn() || cloud.cloudStatus().phase === 'connecting') return;
  if (game.G.seen.signinNudge || game.G.stats.lessons < 1) return;
  setTimeout(() => {
    if (document.body.dataset.screen !== 'home' || document.querySelector('.modal-wrap') || game.G.seen.signinNudge) return;
    game.G.seen.signinNudge = Date.now();
    game.save();
    const t = twig({ mood: 'cheer', size: 96, text: 'Nice work! Want to keep it?', side: 'right', cls: 'nudge-twig' });
    let m = null;
    const later = h('button', { class: 'btn ghost', type: 'button', onclick: () => { sfx.tap(); m.close(); } }, 'Not now');
    m = modal('Save your progress', h('div', { class: 'nudge' }, t.el,
      h('p', { class: 'nudge-copy' }, `Sign in with Google to keep your ${REWARDS.streak.name} and lessons safe, and carry on from any device.`),
      h('p', { class: 'muted small' }, 'Optional. You can always do it later from your profile.'),
      h('div', { class: 'modal-actions' }, later, googleButton())));
  }, 700);
}

/* ---------------------------------------------------------- onboarding */
// "Already playing on another device?" on the first onboarding screen.
export function onboardingSignIn() {
  if (!enabled() || cloud.signedIn()) return null;
  return h('p', { class: 'onb-signin muted small' }, 'Already playing on another device? ', h('button', { class: 'linkish', type: 'button', onclick: async (e) => {
    e.currentTarget.disabled = true;
    try { await cloud.signIn(); } catch { e.currentTarget.disabled = false; toast('Could not start sign-in. Please try again.', { icon: ICON.close() }); }
  } }, 'Sign in with Google'));
}

// The home footer line: still true for guests, and honest once progress syncs to an account.
// With analytics on it also says so (anonymous, no cookies; Do Not Track turns it off).
export function privacyLine() {
  const stats = analyticsOn();
  if (cloud.signedIn() || cloud.cloudStatus().phase === 'connecting') {
    return stats
      ? 'Everything runs in your browser. No real git; your progress syncs to your account, plus anonymous lesson stats (no cookies).'
      : 'Everything runs in your browser. No real git; only your progress syncs to your account.';
  }
  return stats
    ? 'Everything runs in your browser. No real git, no cookies; only anonymous lesson stats are sent.'
    : 'Everything runs in your browser. No real git, nothing sent anywhere.';
}

/* --------------------------------------------------------------- reset */
// "Reset progress" from the home footer. Guests get the same confirm as before. Signed in, a
// local-only reset would be undone by the next sync, so the choice is: everywhere, or sign this
// device out and reset only it.
export async function resetProgress() {
  const CUR = REWARDS.currency, FRZ = REWARDS.freeze;
  const text = `Your XP, ${REWARDS.streak.name}, ${CUR.many}, ${FRZ.many}, quests, cards, outfits and path progress will be wiped from this browser.`;
  if (!enabled() || !cloud.signedIn()) {
    if (await confirmModal('Reset everything?', text, { ok: 'Reset', danger: true })) { game.resetAll(); location.hash = '#/'; location.reload(); }
    return;
  }
  const choice = await new Promise((resolve) => {
    let done = false;
    const pick = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const m = modal('Reset everything?', h('div', { class: 'confirm' },
      h('p', {}, 'You\'re signed in, so your progress is also saved in your account. Reset it everywhere, or only on this device?'),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => pick(null) }, 'Cancel'),
        h('button', { class: 'btn', type: 'button', onclick: () => pick('local') }, 'This device only'),
        h('button', { class: 'btn dark', type: 'button', onclick: () => pick('everywhere') }, 'Everywhere')),
      h('p', { class: 'muted small reset-note' }, '"This device only" signs this device out first, so the cloud copy can\'t bring the progress back.')),
    { onClose: () => { if (!done) { done = true; resolve(null); } } });
  });
  if (!choice) return;
  if (choice === 'everywhere') {
    const ok = await cloud.resetEverywhere();
    if (!ok) toast('Reset here. Your account resets the next time this device syncs.', { ms: 3200 });
  } else {
    await cloud.signOut();
    game.resetAll();
  }
  location.hash = '#/';
  setTimeout(() => location.reload(), choice === 'everywhere' ? 600 : 0);
}
