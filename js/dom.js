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
  return h('span', { class: 'stars', 'aria-label': `${n} of ${max} stars` },
    ...Array.from({ length: max }, (_, i) => h('span', { class: i < n ? 'star on' : 'star' }, '★')));
}

// Modal dialog. Returns { el, close }.
export function modal(title, body, { wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const card = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn close', 'aria-label': 'Close', onclick: close }, '×')),
    h('div', { class: 'modal-body' }, body));
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(); } }, card);
  root.append(wrap);
  document.addEventListener('keydown', onKey);
  return { el: card, close };
}

// Our own confirm dialog (never window.confirm). Resolves true/false.
export function confirmModal(title, text, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const okBtn = h('button', { class: 'btn ' + (danger ? 'dark' : 'primary'), onclick: () => finish(true) }, ok);
    const m = modal(title, h('div', { class: 'confirm' },
      h('p', {}, text),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, cancel),
        okBtn)), { onClose: () => { if (!done) { done = true; resolve(false); } } });
    setTimeout(() => okBtn.focus(), 30);
  });
}
