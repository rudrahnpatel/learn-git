// Profile (#/profile): the mascot in its outfit, a contribution heatmap of daily XP, lifetime stats,
// achievements, and a shareable progress card rendered to PNG on a canvas. It is a page, so it may
// scroll. Words and icons come from js/brand.js; per-course numbers from game.js.
import { h, modal } from '../dom.js';
import { sfx } from '../sound.js';
import { ICON, setShapes, accent, toast, shapeSVG } from './fx.js';
import { avatarHTML, twigSVG, wornOutfit } from './twig.js';
import { topbar } from './topbar.js';
import { UNITS } from './path.js';
import { APP, MASCOT, REWARDS } from '../brand.js';
import { COURSE } from '../content/cards.js';
import * as game from './game.js';
import { accountCard } from './account.js';

const DOW = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

// 0..4 intensity, relative to the daily goal (a met goal is always level 3 or more).
export function heatLevel(xp, goal = game.G.goal) {
  if (!xp) return 0;
  if (xp < goal / 2) return 1;
  if (xp < goal) return 2;
  if (xp < goal * 2) return 3;
  return 4;
}
// Columns of 7 days (Mon..Sun), the last column holding today; future days are null.
export function heatWeeks(weeks) {
  const t = game.today(), now = parseKey(t);
  const dow = (now.getDay() + 6) % 7;
  const start = game.addDays(t, -dow - (weeks - 1) * 7);
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) { const k = game.addDays(start, w * 7 + d); col.push(k > t ? null : { key: k, xp: game.G.xpByDay[k] || 0 }); }
    cols.push(col);
  }
  return cols;
}

// The furthest unit with a finished lesson -> "rebase ready" (COURSE.ready labels).
function readyLabel() {
  let label = null;
  for (const u of UNITS) if (u.lessons.some((l) => game.G.nodes[`${u.id}:lesson:${l.id}`]?.done)) label = COURSE.ready[u.id] || `${u.title.toLowerCase()} ready`;
  return label || 'just getting started';
}
export function profileStats() {
  const acc = game.accuracy();
  const cards = game.cardCount();
  const activeDays = Object.values(game.G.xpByDay).filter((x) => x > 0).length;
  return {
    streak: game.shownStreak(), best: game.G.streak.best, xp: game.G.totalXp, lessons: game.G.stats.lessons,
    crates: game.G.stats.chests, accuracy: acc, cards, activeDays, ready: readyLabel(),
  };
}

function heatmap() {
  const wide = matchMedia('(min-width: 1100px)').matches;
  const weeks = heatWeeks(wide ? 52 : 26);
  const tip = h('div', { class: 'heat-tip', role: 'tooltip', hidden: true });
  const grid = h('div', { class: 'heat-grid', role: 'grid', 'aria-label': `Daily XP for the last ${weeks.length} weeks`, style: { '--weeks': weeks.length } });
  const months = h('div', { class: 'heat-months', 'aria-hidden': 'true', style: { '--weeks': weeks.length } });
  let lastM = -1;
  weeks.forEach((col, w) => {
    const first = col.find(Boolean);
    const m = first ? parseKey(first.key).getMonth() : -1;
    months.append(h('span', {}, m !== lastM && first && parseKey(first.key).getDate() <= 7 ? MONTHS[m] : ''));
    if (m !== -1) lastM = m;
    const c = h('div', { class: 'heat-col', role: 'row' });
    col.forEach((d) => {
      if (!d) { c.append(h('span', { class: 'heat-cell future', role: 'gridcell', 'aria-hidden': 'true' })); return; }
      const dt = parseKey(d.key);
      const label = `${d.xp ? d.xp + ' XP' : 'No XP'} on ${dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${game.G.goalDays[d.key] ? ' · goal met' : game.G.streak.frozen.includes(d.key) ? ` · saved by a ${REWARDS.freeze.one}` : ''}`;
      c.append(h('span', { class: `heat-cell l${heatLevel(d.xp)}` + (d.key === game.today() ? ' today' : ''), role: 'gridcell', tabindex: '-1', 'aria-label': label, 'data-tip': label }));
    });
    grid.append(c);
  });
  const show = (cell) => {
    if (!cell?.dataset.tip) { tip.hidden = true; return; }
    tip.textContent = cell.dataset.tip; tip.hidden = false;
    const wrap = tip.parentElement.getBoundingClientRect(), r = cell.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2 - wrap.left, 70), wrap.width - 70);
    tip.style.left = x + 'px'; tip.style.top = (r.top - wrap.top - 8) + 'px';
  };
  grid.addEventListener('pointerover', (e) => show(e.target.closest('.heat-cell')));
  grid.addEventListener('pointerleave', () => { tip.hidden = true; });
  grid.addEventListener('click', (e) => show(e.target.closest('.heat-cell')));
  // keyboard: one tab stop, arrows move between days
  const cells = [...grid.querySelectorAll('.heat-cell:not(.future)')];
  const todayCell = grid.querySelector('.heat-cell.today') || cells[cells.length - 1];
  if (todayCell) todayCell.tabIndex = 0;
  grid.addEventListener('focusin', (e) => show(e.target.closest('.heat-cell')));
  grid.addEventListener('focusout', () => { tip.hidden = true; });
  grid.addEventListener('keydown', (e) => {
    const i = cells.indexOf(document.activeElement); if (i < 0) return;
    const d = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key]; if (!d) return;
    e.preventDefault(); const n = cells[Math.min(cells.length - 1, Math.max(0, i + d))]; cells[i].tabIndex = -1; n.tabIndex = 0; n.focus();
  });
  const total = weeks.flat().filter(Boolean).reduce((a, d) => a + d.xp, 0);
  const legend = h('div', { class: 'heat-legend mono', 'aria-hidden': 'true' }, 'Less', [0, 1, 2, 3, 4].map((l) => h('span', { class: `heat-cell l${l}` })), 'More');
  return h('section', { class: 'card heat-card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Your commit history'), h('span', { class: 'mono tiny' }, `${total} XP IN ${weeks.length} WEEKS`)),
    h('div', { class: 'heat-wrap' }, h('div', { class: 'heat-days mono', 'aria-hidden': 'true' }, DOW.map((d) => h('span', {}, d))),
      h('div', { class: 'heat-scroll' }, months, grid), tip),
    legend);
}

export function renderProfile(root) {
  setShapes('home');
  document.title = `Profile · ${APP.name}`;
  const s = profileStats();
  const stat = (label, value, color, icon) => h('div', { class: `pstat c-${color}` }, icon ? h('span', { class: 'pstat-ic', html: icon }) : null, h('span', { class: 'pstat-v' }, value), h('span', { class: 'mono tiny' }, label));
  const head = h('section', { class: 'profile-head' },
    h('a', { class: 'big-avatar', href: '#/shop', 'aria-label': `${MASCOT.name}'s outfit. Open the shop.`, html: avatarHTML('happy') }),
    h('div', { class: 'ph-text' },
      h('span', { class: 'mono tiny' }, `PROFILE · ${COURSE.name.toUpperCase()} COURSE`),
      h('h1', {}, s.streak ? `Day ${s.streak}` : s.activeDays ? `${s.activeDays} day${s.activeDays > 1 ? 's' : ''} of ${COURSE.name}` : 'Welcome!'),
      h('p', { class: 'lede' }, `${s.cards.got} command${s.cards.got === 1 ? '' : 's'} collected · ${s.ready}`),
      h('div', { class: 'ph-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => shareCard() }, 'Share progress', h('span', { class: 'arr' }, ' →')),
        h('a', { class: 'btn dark', href: '#/shop' }, 'Change outfit'),
        h('a', { class: 'btn ghost', href: '#/cards' }, 'Card collection'))));
  const stats = h('section', { class: 'pstats' },
    stat('DAY STREAK', String(s.streak), 'yellow', REWARDS.streak.icon(s.streak > 0)),
    stat('LONGEST STREAK', String(s.best), 'sunbeam'),
    stat('TOTAL XP', String(s.xp), 'sky'),
    stat('LESSONS MERGED', String(s.lessons), 'green'),
    stat(`${REWARDS.crate.many.toUpperCase()} OPENED`, String(s.crates), 'pink', REWARDS.crate.icon(true)),
    stat('ACCURACY', s.accuracy == null ? '–' : Math.round(s.accuracy * 100) + '%', 'sky'),
    stat('CARDS', `${s.cards.got}/${s.cards.total}`, 'yellow', ICON.book()));
  const ach = h('section', { class: 'card side-card ach-card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Achievements'), h('span', { class: 'mono tiny' }, `${Object.keys(game.G.achievements).filter((id) => game.ACHIEVEMENTS.some((a) => a.id === id)).length}/${game.ACHIEVEMENTS.length}`)),
    h('div', { class: 'badges' }, game.ACHIEVEMENTS.map((a) => {
      const got = !!game.G.achievements[a.id];
      return h('div', { class: 'badge' + (got ? ' got' : ''), title: `${a.title}: ${a.text}`, style: got ? { '--fill': accent(a.color) } : {} },
        h('span', { class: 'badge-disc', html: got ? ICON.trophy() : ICON.lock() }), h('span', { class: 'badge-t' }, a.title),
        h('span', { class: 'sr-only' }, `${got ? ', earned' : ', locked'}: ${a.text}`));
    })));
  root.replaceChildren(topbar('profile'), h('main', { class: 'profile' }, head, stats, heatmap(), accountCard(), ach));
  return null;
}

/* ----------------------------------------------------------- share card */
// Resolves every var(--token) in an SVG string to the current theme's value, so it can be drawn
// as an <img> on a canvas (an image has no access to the page's CSS).
function resolveVars(svg) {
  const cs = getComputedStyle(document.documentElement);
  return svg.replace(/var\(--([\w-]+)\)/g, (_, n) => cs.getPropertyValue('--' + n).trim() || '#000');
}
const svgImage = (svg, w, hgt) => new Promise((res, rej) => {
  const s = resolveVars(svg).replace(/<svg([^>]*)>/, (_, attrs) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}"${attrs.replace(/\s(width|height)="[^"]*"/g, '')}>`);
  const img = new Image(); img.onload = () => res(img); img.onerror = rej;
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
});

export async function renderShareCard() {
  const W = 1200, H = 630;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const tok = (n) => cs.getPropertyValue('--' + n).trim();
  try { await Promise.all([document.fonts.load('400 40px Inter'), document.fonts.load('400 20px "Martian Mono"')]); } catch { /* system fonts */ }
  const s = profileStats();
  // canvas + paper-cut shapes clipped by the edge
  x.fillStyle = tok('chalk'); x.fillRect(0, 0, W, H);
  const shapes = [['semicircle', 'yellow', 520, -120, 380, -8], ['star', 'red', 300, 1010, -60, 12], ['circle', 'sky', 340, 1040, 430, 0], ['triangle', 'green', 220, 360, -90, -12]];
  for (const [kind, col, size, sx, sy, rot] of shapes) {
    const img = await svgImage(shapeSVG(kind, col, size, '', `var(--shape-${col})`), size, kind === 'semicircle' ? size / 2 : size);
    x.save(); x.translate(sx + size / 2, sy + size / 2); x.rotate((rot * Math.PI) / 180); x.drawImage(img, -size / 2, -size / 2); x.restore();
  }
  // card
  const cx = 60, cy = 60, cw = W - 120, ch = H - 120;
  x.fillStyle = tok('shadow'); roundRect(x, cx, cy + 6, cw, ch, 28); x.fill();
  x.fillStyle = tok('paper'); roundRect(x, cx, cy, cw, ch, 28); x.fill();
  x.strokeStyle = tok('frost'); x.lineWidth = 2; roundRect(x, cx, cy, cw, ch, 28); x.stroke();
  // mascot in its outfit, with the profile ring
  const ring = (await import('./cosmetics.js')).ringSVG(wornOutfit().ring);
  if (ring) x.drawImage(await svgImage(ring, 330, 330), 92, 108);
  x.drawImage(await svgImage(twigSVG('cheer'), 240, 280), 137, 125);
  // text
  const ink = tok('ink'), mute = tok('mute');
  x.fillStyle = mute; x.font = '400 20px "Martian Mono", monospace'; x.fillText(`${APP.name.toUpperCase()} · ${COURSE.name.toUpperCase()} COURSE`, 470, 140);
  x.fillStyle = ink; x.font = '400 110px Inter, sans-serif';
  const big = s.streak ? `Day ${s.streak}` : `${s.activeDays || 1} day${s.activeDays === 1 ? '' : 's'} in`;
  x.fillText(big, 462, 250);
  x.font = '400 40px Inter, sans-serif';
  x.fillText(`${s.cards.got} command${s.cards.got === 1 ? '' : 's'} · ${s.ready}`, 470, 316);
  x.fillStyle = mute; x.font = '400 26px Inter, sans-serif';
  x.fillText(`${s.xp} XP · ${s.lessons} lessons merged · best ${REWARDS.streak.name} ${s.best}`, 470, 362);
  // heatmap strip: the last 26 weeks
  const weeks = heatWeeks(26), cell = 15, gap = 4, hx = 470, hy = 398;
  const lv = [tok('heat-0'), tok('heat-1'), tok('heat-2'), tok('heat-3'), tok('heat-4')];
  weeks.forEach((col, w) => col.forEach((d, di) => { if (!d) return; x.fillStyle = lv[heatLevel(d.xp)]; roundRect(x, hx + w * (cell + gap), hy + di * (cell + gap), cell, cell, 4); x.fill(); }));
  x.fillStyle = mute; x.font = '400 16px "Martian Mono", monospace'; x.fillText('LAST 26 WEEKS', 470, 548);
  if (APP.url) { x.textAlign = 'right'; x.fillText(APP.url, W - 100, 548); x.textAlign = 'left'; }
  return cv;
}
function roundRect(x, l, t, w, hh, r) { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + hh, r); x.arcTo(l + w, t + hh, l, t + hh, r); x.arcTo(l, t + hh, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); }

async function shareCard() {
  sfx.tap();
  let cv;
  try { cv = await renderShareCard(); } catch (e) { console.warn(e); toast('Could not draw the card in this browser.', { icon: ICON.close() }); return; }
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const url = URL.createObjectURL(blob);
  const name = `${APP.name}-progress.png`;
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const img = h('img', { class: 'share-img', src: url, alt: 'Your progress card', width: 1200, height: 630 });
  const dl = h('a', { class: 'btn ' + (canShare ? 'dark' : 'primary'), href: url, download: name, onclick: () => sfx.tap() }, 'Download PNG');
  const share = canShare ? h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { await navigator.share({ files: [file], title: APP.name, text: `${profileStats().ready} on ${APP.name}` }); } catch { /* cancelled */ } } }, 'Share', h('span', { class: 'arr' }, ' →')) : null;
  modal('Your progress card', h('div', { class: 'share-body' }, img, h('div', { class: 'modal-actions' }, dl, share)), { wide: true, onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
}
