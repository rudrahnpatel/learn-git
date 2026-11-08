// "Daily reminder" in the account card (signed-in players): an on/off switch and an hour picker for
// push reminders on this device (js/cloud/push.js). Built once per signed-in user and re-attached
// on every account-card redraw, so focus and a pending save survive the card's 30 s refresh.
// Guests keep the local-only "Remind me to practise" pill from js/pwa.js.
import { h } from '../dom.js';
import { sfx } from '../sound.js';
import * as game from './game.js';
import * as push from '../cloud/push.js';
import { usualHour } from '../cloud/reminder-hour.js';

const hourLabel = (hr) => new Date(2000, 0, 1, hr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const SUPPORT_MSG = {
  'ios-install': 'On iPhone and iPad, reminders only reach the installed app. Tap Share, then Add to Home Screen, open learn-git from there and turn this on.',
  'ios-old': 'Reminders need iOS or iPadOS 16.4 or later.',
  insecure: 'Reminders need a secure (https) connection.',
  unsupported: 'This browser can\'t get reminders while the app is closed. Try Chrome, Edge, Firefox or Safari.',
};

export function reminderSection(uid) {
  if (!push.pushConfigured()) return null;
  const support = push.pushSupport();
  const saved = push.prefs();
  let on = push.remindersOn(uid) && push.permission() === 'granted';
  let hour = Number.isInteger(saved.hour) ? saved.hour : usualHour(game.G);
  let busy = false, note = '', noteKind = '';

  const sw = h('button', { type: 'button', role: 'switch', class: 'rem-switch', 'aria-labelledby': 'rem-h', 'aria-describedby': 'rem-desc rem-msg' },
    h('span', { class: 'rem-knob', 'aria-hidden': 'true' }));
  const sel = h('select', { id: 'rem-hour', class: 'rem-select' },
    ...Array.from({ length: 24 }, (_, hr) => h('option', { value: String(hr) }, hourLabel(hr))));
  sel.value = String(hour);
  const msg = h('p', { id: 'rem-msg', class: 'rem-msg small', role: 'status' });
  const el = h('section', { class: 'rem', 'aria-labelledby': 'rem-h' },
    h('div', { class: 'rem-head' },
      h('div', { class: 'rem-text' },
        h('h3', { id: 'rem-h', class: 'rem-title' }, 'Daily reminder'),
        h('p', { id: 'rem-desc', class: 'muted small' }, 'A nudge on this device if you haven\'t practised by then, even when the app is closed.')),
      sw),
    h('div', { class: 'rem-time' }, h('label', { for: 'rem-hour' }, 'Remind me at'), sel),
    msg);

  const paint = () => {
    const blocked = support !== 'ok';
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.disabled = blocked || busy;
    sel.disabled = blocked || busy;
    el.setAttribute('aria-busy', busy ? 'true' : 'false');
    el.classList.toggle('is-on', on);
    let text = note, kind = noteKind;
    if (!text) {
      if (blocked) { text = SUPPORT_MSG[support]; kind = 'info'; }
      else if (!on && push.permission() === 'denied') { text = 'Notifications are blocked for this site. Allow them in your browser\'s site settings, then turn this on.'; kind = 'warn'; }
      else if (on) text = `On. If you haven't practised by ${hourLabel(hour)}, this device gets one nudge.`;
      else text = '';
    }
    msg.textContent = busy ? 'Saving…' : text;
    msg.className = `rem-msg small${kind ? ' rem-' + kind : ''}`;
  };

  sw.addEventListener('click', async () => {
    if (busy) return;
    sfx.tap();
    busy = true; note = ''; noteKind = '';
    // enableReminders() asks for permission first thing, inside this click (Safari needs that).
    const turningOn = !on;
    const pending = turningOn ? push.enableReminders(uid, hour) : push.disableReminders().then(() => ({ ok: true }));
    paint();
    const r = await pending;
    busy = false;
    if (r.ok) on = turningOn;
    else if (r.reason === 'denied') { /* paint() explains the block */ }
    else if (r.reason === 'dismissed') { note = 'No problem. Turn it on whenever you like.'; }
    else if (r.reason === 'unsupported') { note = SUPPORT_MSG.unsupported; noteKind = 'info'; }
    else { note = navigator.onLine === false ? 'You\'re offline. Try again when you\'re back.' : 'Couldn\'t save that. Please try again.'; noteKind = 'warn'; }
    paint();
    sw.focus();
  });

  sel.addEventListener('change', async () => {
    const next = Number(sel.value), prev = hour;
    hour = next; note = ''; noteKind = '';
    if (!on) { try { await push.setReminderHour(uid, next); } catch { /* local only */ } paint(); return; }
    busy = true; paint();
    try { await push.setReminderHour(uid, next); }
    catch (e) {
      console.warn('[push] hour', e);
      hour = prev; sel.value = String(prev);
      note = navigator.onLine === false ? 'You\'re offline. Try again when you\'re back.' : 'Couldn\'t change the time. Please try again.'; noteKind = 'warn';
    }
    busy = false; paint();
    sel.focus();
  });

  paint();
  return el;
}
