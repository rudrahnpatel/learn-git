// The mascot component: the brand's mascot (js/brand.js; Twig by default) with the equipped shop
// accessories composed onto it, an optional speech bubble, and expression states (idle, happy,
// worried, cheer, think) animated with CSS.
import { h } from '../dom.js';
import { itemById, ringSVG, REF_ANCHORS } from './cosmetics.js';
import { MASCOT } from '../brand.js';
import { G } from './game.js';

// What the mascot is wearing: { head, face, neck, held, ring } item ids (the shop's equipped slots).
export const wornOutfit = () => ({ ...(G.cosmetics?.equipped || {}) });

// Maps an item drawn against the reference anchor onto this mascot's anchor for the slot.
function placed(slot, mood, svg) {
  const ref = slot === 'held' ? REF_ANCHORS.held : REF_ANCHORS[slot];
  const a = typeof MASCOT.anchors[slot] === 'function' ? MASCOT.anchors[slot](mood) : MASCOT.anchors[slot];
  if (!ref || !a) return '';
  const k = a.w / ref.w;
  if (Math.abs(k - 1) < 1e-6 && a.x === ref.x && a.y === ref.y) return svg;
  return `<g transform="translate(${(a.x - ref.x * k).toFixed(2)} ${(a.y - ref.y * k).toFixed(2)}) scale(${k.toFixed(4)})">${svg}</g>`;
}

// outfit: item ids per slot; defaults to what the mascot wears now. Back layers (a hood) go behind,
// then the mascot, then neck, face, hat and the held item; a hat with `over` gets the mascot's
// overlay (Twig's sprout) drawn again on top, poking through it. opts.viewBox crops (shop thumbnails).
export function twigSVG(mood = 'idle', outfit = wornOutfit(), { viewBox = MASCOT.viewBox, cls = '' } = {}) {
  const items = ['neck', 'face', 'head', 'held'].map((slot) => itemById(outfit?.[slot])).filter((it) => it && it.front && it.slot !== 'ring');
  const back = items.map((it) => (it.back ? placed(it.slot, mood, it.back(mood)) : '')).join('');
  const front = items.map((it) => `<g class="tw-acc acc-${it.slot}">${placed(it.slot, mood, it.front(mood))}</g>`).join('');
  const over = items.some((it) => it.over) ? MASCOT.overlay || '' : '';
  return `<svg viewBox="${viewBox}" class="twig-svg${cls ? ' ' + cls : ''}" aria-hidden="true">${MASCOT.draw(mood, { back, front, over })}</svg>`;
}
export const mascotSVG = twigSVG;

// The mascot as an avatar: the profile ring (if one is equipped) behind him.
export function avatarHTML(mood = 'happy', outfit = wornOutfit()) {
  return `<span class="avatar-ring">${ringSVG(outfit?.ring)}</span><span class="avatar-twig">${twigSVG(mood, outfit)}</span>`;
}

// A Twig element with an optional speech bubble. Returns { el, say(text, mood), mood(m) }.
export function twig({ mood = 'idle', text = '', size = 120, side = 'right', cls = '', outfit } = {}) {
  let wear = outfit;
  const draw = (m) => twigSVG(m, wear || wornOutfit());
  const fig = h('div', { class: `twig m-${mood}`, style: { width: size + 'px' }, html: draw(mood) });
  const bubble = h('div', { class: `bubble b-${side}` + (text ? '' : ' hidden'), 'aria-live': 'polite' });
  if (text) bubble.innerHTML = text;
  const el = h('div', { class: `twig-wrap s-${side} ${cls}` }, fig, bubble);
  const api = {
    el,
    // dress(outfit): try a different outfit on (the shop preview); null goes back to what he wears.
    dress(o) { wear = o; fig.innerHTML = draw(fig.className.match(/m-(\w+)/)?.[1] || 'idle'); return api; },
    mood(m) { fig.className = `twig m-${m}`; fig.innerHTML = draw(m); fig.classList.remove('hop'); void fig.offsetWidth; if (m === 'happy' || m === 'cheer') fig.classList.add('hop'); if (m === 'worried') fig.classList.add('wobble'); return api; },
    say(t, m) { bubble.innerHTML = t; bubble.classList.toggle('hidden', !t); bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); if (m) api.mood(m); return api; },
  };
  return api;
}
