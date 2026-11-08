// Tiny DOM helpers.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function stars(n, max = 3) {
  return h('span', { class: 'stars', role: 'img', 'aria-label': `${n} of ${max} stars` },
    ...Array.from({ length: max }, (_, i) => h('span', { class: i < n ? 'star on' : 'star', 'aria-hidden': 'true' }, '★')));
}

// Screen-reader announcements go through two live regions that exist from the first paint (index.html): a region
// created at the moment it changes is often not read, so toasts, answer feedback and rewards are spoken from here.
export function announce(text, { assertive = false } = {}) {
  const el = typeof document !== 'undefined' && document.getElementById(assertive ? 'sr-alert' : 'sr-status');
  if (!el || !text) return;
  const t = String(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // clear, then set a moment later, so the same message twice in a row is read twice; emptied again after a while
  // so an old message doesn't linger where a screen reader's reading cursor can find it
  el.textContent = '';
  clearTimeout(el._say); clearTimeout(el._clear);
  el._say = setTimeout(() => { el.textContent = t; el._clear = setTimeout(() => { el.textContent = ''; }, 7000); }, 60);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
export const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)]
  .filter((el) => !el.closest('[hidden], [inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');

// Puts a dialog in charge of the keyboard: the rest of the page goes inert, Tab cycles inside the dialog, and
// release() hands the focus back to whatever had it before (when that is still on the page). Dialogs stack.
const layers = [];
export const topLayer = () => layers[layers.length - 1] || null;
export function holdFocus(dialog) {
  const before = document.activeElement;
  const outside = [...document.body.children].filter((el) => !el.contains(dialog) && !el.matches('script, #sr-status, #sr-alert, #fx'));
  const was = outside.map((el) => el.inert);
  outside.forEach((el) => { el.inert = true; });
  const onKey = (e) => {
    if (e.key !== 'Tab' || topLayer() !== layer) return;
    const f = focusables(dialog);
    if (!f.length) { e.preventDefault(); return; }
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  const layer = {
    release({ restore = true } = {}) {
      if (!layers.includes(layer)) return;
      document.removeEventListener('keydown', onKey, true);
      outside.forEach((el, i) => { el.inert = was[i]; });
      layers.splice(layers.indexOf(layer), 1);
      if (restore && before?.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    },
  };
  layers.push(layer);
  return layer;
}
// Lets go of every held dialog without moving the focus (a route change empties #modal-root).
export function releaseAll() { while (layers.length) topLayer().release({ restore: false }); }

// Modal dialog. Returns { el, close }. Escape and the backdrop close it; the focus stays inside while it is open
// and goes back to the control that opened it.
let modalN = 0;
export function modal(title, body, { wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const hid = 'modal-h-' + (++modalN);
  let hold = null;
  const close = () => { if (!wrap.isConnected) return; wrap.remove(); document.removeEventListener('keydown', onKey); hold?.release(); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape' && topLayer() === hold) { e.preventDefault(); close(); } };
  const card = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': hid, tabindex: '-1' },
    h('div', { class: 'modal-head' }, h('h2', { id: hid }, title), h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Close', onclick: close }, '×')),
    h('div', { class: 'modal-body' }, body));
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(); } }, card);
  root.append(wrap);
  hold = holdFocus(wrap);
  // the first control in the body (not the close button), else the dialog itself; callers may focus another one
  setTimeout(() => { if (!wrap.isConnected || wrap.contains(document.activeElement)) return; const f = focusables(card.querySelector('.modal-body')); (f[0] || card).focus({ preventScroll: true }); }, 20);
  document.addEventListener('keydown', onKey);
  return { el: card, close };
}

// Our own confirm dialog (never window.confirm). Resolves true/false.
export function confirmModal(title, text, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const okBtn = h('button', { class: 'btn ' + (danger ? 'dark' : 'primary'), type: 'button', onclick: () => finish(true) }, ok);
    const cancelBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(false) }, cancel);
    const m = modal(title, h('div', { class: 'confirm' },
      h('p', { id: 'confirm-text' }, text),
      h('div', { class: 'modal-actions' }, cancelBtn, okBtn)), { onClose: () => { if (!done) { done = true; resolve(false); } } });
    m.el.setAttribute('aria-describedby', 'confirm-text');
    // a destructive confirm starts on the safe choice, so a stray Enter never throws progress away
    setTimeout(() => (danger ? cancelBtn : okBtn).focus(), 30);
  });
}
