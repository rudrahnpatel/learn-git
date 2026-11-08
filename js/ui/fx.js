// Decoration and juice: the paper-cut shape layer, confetti bursts, XP fly-ups, toasts, count-ups.
import { h, announce } from '../dom.js';

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// scrollIntoView / scrollTo behaviour: smooth, except under reduced motion
export const glide = () => (reducedMotion() ? 'auto' : 'smooth');
// Accent fills as tokens, so the dark theme can calm them (css/style.css).
const COLORS = { red: 'var(--red)', yellow: 'var(--yellow)', sky: 'var(--sky)', pink: 'var(--pink)', green: 'var(--green)', sunbeam: 'var(--sunbeam)' };
export const accent = (name) => COLORS[name] || COLORS.yellow;

const PATHS = {
  circle: '<circle cx="50" cy="50" r="50"/>',
  semicircle: '<path d="M0 50 A50 50 0 0 1 100 50 Z"/>',
  triangle: '<polygon points="50,4 100,94 0,94"/>',
  pentagon: '<polygon points="50,0 100,38 81,100 19,100 0,38"/>',
  star: '<polygon points="50,0 61,35 98,35 68,57 79,92 50,70 21,92 32,57 2,35 39,35"/>',
};
// fill: defaults to the candy accent (confetti); the background layer passes its own shape token.
export function shapeSVG(kind, color, size, extra = '', fill = accent(color)) {
  return `<svg viewBox="0 ${kind === 'semicircle' ? '0 100 50' : '0 100 100'}" width="${size}" height="${kind === 'semicircle' ? size / 2 : size}" fill="${fill}" ${extra}>${PATHS[kind]}</svg>`;
}
// The background layer uses --shape-<colour>: the candy set in light, a deeper clean set in dark.
const shapeFill = (name) => `var(--shape-${COLORS[name] ? name : 'yellow'})`;

// Positions are [left, top] in % of the viewport, size in px; rot in degrees.
const PRESETS = {
  home: [['semicircle', 'yellow', 520, -14, 70, -8], ['star', 'red', 300, 88, 4, 12], ['circle', 'sky', 360, 90, 62, 0], ['triangle', 'green', 260, -8, 18, -12], ['pentagon', 'pink', 240, 84, 90, 9]],
  onboard: [['circle', 'yellow', 560, -18, 55, 0], ['star', 'red', 360, 78, -8, 10], ['triangle', 'sky', 320, 82, 64, -10], ['semicircle', 'green', 300, 8, -10, 180], ['pentagon', 'pink', 260, 22, 104, 12], ['circle', 'sunbeam', 200, 104, 30, 0]],
  lesson: [['circle', 'sky', 220, -10, 82, 0], ['triangle', 'yellow', 180, 94, 70, 12], ['pentagon', 'pink', 160, 95, 6, -10]],
  celebrate: [['star', 'yellow', 460, -12, -8, -10], ['circle', 'sky', 380, 80, -12, 0], ['semicircle', 'red', 420, 90, 96, -6], ['triangle', 'green', 320, -10, 66, 14], ['pentagon', 'pink', 260, 10, 104, -12], ['star', 'sunbeam', 200, 88, 40, 8], ['circle', 'pink', 160, 22, 10, 0]],
  challenge: [['semicircle', 'sky', 300, -8, 86, 0], ['star', 'yellow', 200, 95, 88, 14]],
  practice: [['pentagon', 'green', 380, -12, 60, -10], ['circle', 'red', 280, 86, -6, 0], ['triangle', 'sunbeam', 300, 84, 70, 10], ['semicircle', 'pink', 240, 30, 92, 0]],
};
export function setShapes(preset) {
  const layer = document.getElementById('shapes');
  if (!layer) return;
  if (layer.dataset.preset === preset) return;
  layer.dataset.preset = preset;
  const list = PRESETS[preset] || [];
  layer.replaceChildren(...list.map(([kind, color, size, x, y, rot], i) => {
    const el = h('div', { class: 'shape', style: { left: x + '%', top: y + '%', '--rot': rot + 'deg', '--d': i * 70 + 'ms' }, html: shapeSVG(kind, color, size, '', shapeFill(color)) });
    el.style.setProperty('--rot', rot + 'deg');
    el.style.setProperty('--d', i * 70 + 'ms');
    el.style.setProperty('--size', size + 'px');
    return el;
  }));
}

// Paper-cut confetti from a point (or the centre of an element).
export function confetti(from, { count = 46, spread = 1 } = {}) {
  const fx = document.getElementById('fx');
  if (!fx || reducedMotion()) return;
  let x = innerWidth / 2, y = innerHeight / 3;
  if (from instanceof Element) { const r = from.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  else if (from) ({ x, y } = from);
  const kinds = Object.keys(PATHS), colors = Object.keys(COLORS);
  for (let i = 0; i < count; i++) {
    const size = 10 + Math.random() * 16;
    const el = h('div', { class: 'confetto', html: shapeSVG(kinds[i % kinds.length], colors[(i * 7) % colors.length], size) });
    el.style.left = x + 'px'; el.style.top = y + 'px';
    fx.append(el);
    const ang = Math.random() * Math.PI * 2;
    const v = (160 + Math.random() * 280) * spread;
    const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v - 180;
    const rot = (Math.random() - 0.5) * 900;
    const dur = 1100 + Math.random() * 700;
    const a = el.animate([
      { transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) scale(1) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 380}px)) scale(.9) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    a.onfinish = () => el.remove();
  }
}

// The currency bursting up and out of an element (an opened crate), then falling away. icon: the course's
// currency glyph (js/brand.js); cherries by default.
export function cherryBurst(from, { count = 9, icon = ICON.cherry() } = {}) {
  const fx = document.getElementById('fx');
  if (!fx || !from || reducedMotion()) return;
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const el = h('div', { class: 'confetto cherry-bit', html: icon });
    const size = 26 + Math.random() * 14;
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = el.style.height = size + 'px';
    fx.append(el);
    const ang = -Math.PI / 2 + (i / (count - 1) - 0.5) * 2.1 + (Math.random() - 0.5) * 0.3;
    const v = 150 + Math.random() * 110;
    const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v;
    const rot = (Math.random() - 0.5) * 120;
    el.animate([
      { transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.75}px), calc(-50% + ${dy * 0.75}px)) scale(1.1) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${rot * 0.8}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 260}px)) scale(.9) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 300, delay: i * 25, easing: 'cubic-bezier(.2,.75,.4,1)', fill: 'both' }).onfinish = () => el.remove();
  }
}

// "+10 XP" floating up from an element.
// icon: optional inline SVG before the text; down: fly downwards (for things in the top bar).
export function flyUp(fromEl, text, cls = '', { icon = '', down = false } = {}) {
  const fx = document.getElementById('fx');
  if (!fx || !fromEl) return;
  const r = fromEl.getBoundingClientRect();
  const el = h('div', { class: 'flyup ' + cls }, icon ? h('span', { class: 'flyup-ic', html: icon }) : null, text);
  el.style.left = r.left + r.width / 2 + 'px';
  el.style.top = (down ? r.bottom : r.top) + 'px';
  const k = down ? -1 : 1;
  fx.append(el);
  if (reducedMotion()) { setTimeout(() => el.remove(), 900); return; }
  el.animate([
    { transform: 'translate(-50%, 0) scale(.6)', opacity: 0 },
    { transform: `translate(-50%, ${-28 * k}px) scale(1.1)`, opacity: 1, offset: 0.25 },
    { transform: `translate(-50%, ${-90 * k}px) scale(1)`, opacity: 0 },
  ], { duration: 1100, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).onfinish = () => el.remove();
}

// The toast is drawn in #fx (hidden from assistive tech, like the confetti) and spoken through the live region.
export function toast(text, { icon = '', ms = 2200, cls = '' } = {}) {
  const fx = document.getElementById('fx');
  if (!fx) return;
  announce(text);
  const el = h('div', { class: 'toast' + (cls ? ' ' + cls : '') }, icon ? h('span', { class: 'toast-ic', html: icon }) : null, h('span', {}, text));
  fx.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

export function countUp(el, to, { ms = 900, fmt = (n) => String(Math.round(n)), delay = 0 } = {}) {
  if (reducedMotion()) { el.textContent = fmt(to); return; }
  el.textContent = fmt(0);
  setTimeout(() => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}

/* the reward crate: a three.js chest pre-rendered to images (tools/chest3d, icons/chest/), placed in a 64x64 SVG
   so every existing svg sizing rule keeps working and the sparkles sit on top. Groups: .cr-all (the chest, which
   shakes and lands), .cr-strip (the opening sprite strip), .cr-spark (twinkles on the current node). */
const CHEST = 'icons/chest/';
export const CHEST_FRAMES = 14; // frames in chest-open-strip.webp (tools/chest3d/render.mjs --frames)
const SPARK = '<g class="cr-spark"><path d="M56 6l1.6 4.4L62 12l-4.4 1.6L56 18l-1.6-4.4L50 12l4.4-1.6z" fill="var(--sunbeam)"/><path d="M5 10l1 2.8L8.8 14 6 15l-1 2.8L4 15l-2.8-1L4 12.8z" fill="var(--sunbeam)"/></g>';

/* hinge: true shows the opening sprite strip (frame 0 = closed); css steps it to the open frame on .opened */
export function crateSVG({ open = false, cls = '', hinge = false } = {}) {
  const art = hinge
    ? `<svg class="cr-film" width="64" height="64" viewBox="0 0 64 64"><image class="cr-strip" href="${CHEST}chest-open-strip.webp" width="${64 * CHEST_FRAMES}" height="64"/></svg>`
    : `<image href="${CHEST}chest-${open ? 'open' : 'closed'}.webp" width="64" height="64"/>`;
  return `<svg viewBox="0 0 64 64" class="ic-crate${open ? ' is-open' : ''}${cls ? ' ' + cls : ''}" aria-hidden="true"><g class="cr-all">${art}</g>${SPARK}</svg>`;
}

/* small inline icons (flat, paper-cut) */
export const ICON = {
  // The in-lesson combo flame, in the combo colour. onCombo: drawn in ink for the orange combo toast.
  flame: (lit = true, onCombo = false) => `<svg viewBox="0 0 24 24" class="ic-flame${lit ? '' : ' out'}" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-4.5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill="${!lit ? 'var(--frost-2)' : onCombo ? 'var(--on-combo)' : 'var(--combo)'}"/><path d="M12 12c.5 2 3 3 3 5.5a3 3 0 0 1-6 0c0-1.6 1-2.4 1.6-3 .2 1 .7 1.4 1.1 1.4 0-1.6-.4-2.5.3-3.9z" fill="${lit ? 'var(--yellow)' : 'var(--frost)'}"/></svg>`,
  // The currency: a pair of paper-cut cherries (you cherry-pick them).
  cherry: () => '<svg viewBox="0 0 24 24" class="ic-cherry" aria-hidden="true"><path d="M7.5 15.5C8.5 10 11 6.5 15.5 3.5M16.5 16C15.5 11 15 7 15.5 3.5" stroke="var(--ink)" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M15.5 3.5C18 1.5 21.5 2 23 4 20.5 6 17.5 5.8 15.5 3.5Z" fill="var(--green)"/><circle cx="7" cy="17" r="5.5" fill="var(--red)"/><circle cx="17" cy="17.5" r="5" fill="var(--red)"/><circle cx="5" cy="15" r="1.5" fill="var(--pink)"/><circle cx="15.2" cy="15.6" r="1.3" fill="var(--pink)"/></svg>',
  // The neutral currency (courses without their own reward words): a flat paper-cut coin.
  coin: () => '<svg viewBox="0 0 24 24" class="ic-coin" aria-hidden="true"><circle cx="12" cy="13" r="9" fill="var(--ink)"/><circle cx="12" cy="11" r="9" fill="var(--yellow)"/><circle cx="12" cy="11" r="5.2" fill="none" stroke="var(--ink)" stroke-width="1.6" opacity=".35"/><path d="M12 7.5v7" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round" opacity=".7"/></svg>',
  // The neutral streak saver: a paper-cut shield.
  shield: () => '<svg viewBox="0 0 24 24" class="ic-shield" aria-hidden="true"><path d="M12 2l8.5 3.2v6.3c0 5-3.6 8.9-8.5 10.5C7.1 20.4 3.5 16.5 3.5 11.5V5.2z" fill="var(--sky)"/><path d="M12 2v20c4.9-1.6 8.5-5.5 8.5-10.5V5.2z" fill="var(--ink)" opacity=".18"/><path d="M8.2 11.8l2.6 2.6 5-5.2" stroke="var(--ink)" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // Settings: a gear.
  gear: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.7 1.9.8 2.3-1.6 2.4 2.4-1.6 2.3.8 1.9 2.7.5v3.4l-2.7.5-.8 1.9 1.6 2.3-2.4 2.4-2.3-1.6-1.9.8-.5 2.7h-3.4l-.5-2.7-1.9-.8-2.3 1.6-2.4-2.4 1.6-2.3-.8-1.9L2 13.7v-3.4l2.7-.5.8-1.9-1.6-2.3 2.4-2.4 2.3 1.6 1.9-.8z" fill="currentColor"/><circle cx="12" cy="12" r="3.4" fill="var(--paper)"/></svg>',
  chevron: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9.5l5 5 5-5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  crown: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="2,7 7,12 12,4 17,12 22,7 20,20 4,20" fill="var(--yellow)"/></svg>',
  // A release tag (the path's reward nodes). Shipped: green tag with a check.
  tag: (shipped = false) => shipped
    ? '<svg viewBox="0 0 48 48" aria-hidden="true"><polygon points="3,24 15,9 45,9 45,39 15,39" fill="var(--green)"/><circle cx="15" cy="24" r="4" fill="var(--paper)"/><path d="M24 24.5l5 5 9-10" stroke="var(--on-iris)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 48 48" aria-hidden="true"><polygon points="3,24 15,9 45,9 45,39 15,39" fill="var(--yellow)"/><polygon points="15,39 45,39 45,31 22,31" fill="var(--sunbeam)"/><circle cx="15" cy="24" r="4" fill="var(--paper)"/><rect x="24" y="19" width="15" height="3.5" fill="var(--on-accent)"/><rect x="24" y="26" width="9" height="3.5" fill="var(--on-accent)"/></svg>',
  // The reward crate (release nodes, the daily crate): a toon-shaded 3D treasure chest, pre-rendered.
  // open: the barrel lid stands open on its back hinge over a heap of gold (a crate already opened).
  crate: (open = false) => crateSVG({ open }),
  star: () => '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,0 61,35 98,35 68,57 79,92 50,70 21,92 32,57 2,35 39,35" fill="var(--yellow)"/></svg>',
  bolt: (c = 'var(--yellow)') => `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="13,1 4,14 11,14 9,23 20,9 13,9" fill="${c}"/></svg>`,
  // A streak stash: a paper-cut box with a commit tucked inside.
  stash: () => '<svg viewBox="0 0 24 24" class="ic-stash" aria-hidden="true"><rect x="3" y="9" width="18" height="13" fill="var(--sky)"/><rect x="1.5" y="5" width="21" height="5" fill="var(--ink)"/><rect x="9" y="5" width="6" height="2.5" fill="var(--sky)"/><circle cx="12" cy="15.5" r="3.4" fill="var(--yellow)"/></svg>',
  // Fast-forward (the 2x XP boost): two flat triangles.
  ff: (c = 'var(--ink)') => `<svg viewBox="0 0 24 24" class="ic-ff" aria-hidden="true"><polygon points="1,4 12,12 1,20" fill="${c}"/><polygon points="11,4 22,12 11,20" fill="${c}"/></svg>`,
  // The streak: a commit node on a history line. Lit when the streak is alive.
  commit: (lit = true) => `<svg viewBox="0 0 24 24" class="ic-commit${lit ? '' : ' out'}" aria-hidden="true"><path d="M0 12h24" stroke="${lit ? 'var(--ink)' : 'var(--frost-2)'}" stroke-width="2.6"/><circle cx="12" cy="12" r="7" fill="${lit ? 'var(--yellow)' : 'var(--frost)'}" stroke="${lit ? 'var(--ink)' : 'var(--frost-2)'}" stroke-width="2.6"/></svg>`,
  sound: (on = true) => on
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  // Theme toggle glyph: system (half disc), light (sun), dark (moon).
  theme: (t = 'system') => t === 'light'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    : t === 'dark'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  back: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  lock: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2.4" fill="none"/></svg>',
  check: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  book: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z" fill="currentColor"/><path d="M12 6v14" stroke="var(--iris)" stroke-width="1.5"/></svg>',
  terminal: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7l5 5-5 5M12 18h7" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trophy: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4" stroke="currentColor" stroke-width="2" fill="none"/><rect x="10" y="14" width="4" height="4" fill="currentColor"/><rect x="7" y="18" width="10" height="3" rx="1" fill="currentColor"/></svg>',
  dumbbell: () => '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="8" width="4" height="8" rx="1.5" fill="currentColor"/><rect x="18" y="8" width="4" height="8" rx="1.5" fill="currentColor"/><rect x="6" y="6" width="3" height="12" rx="1.5" fill="currentColor"/><rect x="15" y="6" width="3" height="12" rx="1.5" fill="currentColor"/><rect x="9" y="11" width="6" height="2" fill="currentColor"/></svg>',
  arrow: () => '→',
};
