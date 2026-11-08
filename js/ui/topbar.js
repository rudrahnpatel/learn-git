// Top bar for the main screens: brand, Learn/Practice/Cards/Shop tabs, streak, currency, the
// daily-goal XP ring, the theme toggle (System / Light / Dark), the mute toggle and the profile
// avatar (the mascot in its outfit). Words and icons come from js/brand.js.
import { h, announce } from '../dom.js';
import { setMuted, sfx } from '../sound.js';
import { getTheme, setTheme, nextTheme, themeLabel } from '../theme.js';
import { twigSVG, avatarHTML } from './twig.js';
import { APP, REWARDS } from '../brand.js';
import { ICON, glide } from './fx.js';
import * as game from './game.js';

export function goalRing(size = 40) {
  const pct = Math.min(1, game.xpToday() / game.G.goal);
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return h('span', { class: 'ring' + (pct >= 1 ? ' full' : ''), title: `${game.xpToday()} / ${game.G.goal} XP today`,
    html: `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>` });
}

export function topbar(active = 'learn') {
  const streak = game.shownStreak();
  // a toggle: one fixed name, the pressed state says whether sound is off (a name that flips as well reads as a
  // double negative: "Unmute sounds, pressed")
  const mute = h('button', { class: 'icon-btn round mute', type: 'button', 'aria-label': 'Mute sounds', title: 'Mute sounds', 'aria-pressed': String(game.G.mute), html: ICON.sound(!game.G.mute),
    onclick: () => { const m = !game.G.mute; game.setMute(m); setMuted(m); mute.innerHTML = ICON.sound(!m); mute.setAttribute('aria-pressed', String(m)); announce(m ? 'Sounds off' : 'Sounds on'); if (!m) sfx.tap(); } });
  const theme = h('button', { class: 'icon-btn round theme', type: 'button', 'aria-label': themeLabel(getTheme()) + '. Click to change.', title: themeLabel(getTheme()), html: ICON.theme(getTheme()),
    onclick: () => { const t = nextTheme(); setTheme(t); theme.innerHTML = ICON.theme(t); theme.title = themeLabel(t); theme.setAttribute('aria-label', themeLabel(t) + '. Click to change.'); sfx.tap(); } });
  const tab = (id, href, label) => h('a', { class: 'tab' + (active === id ? ' active' : ''), href, 'aria-current': active === id ? 'page' : null }, label);
  const cur = REWARDS.currency;
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': `${APP.name} home` }, h('span', { class: 'brand-twig', html: twigSVG('happy') }), h('span', { class: 'brand-t' }, APP.name)),
    h('nav', { class: 'tabs', 'aria-label': 'Main' },
      tab('learn', '#/', 'Learn'), tab('practice', '#/practice', 'Practice'), tab('cards', '#/cards', 'Cards'), tab('shop', '#/shop', 'Shop')),
    h('div', { class: 'stats' },
      h('a', { class: 'stat streak' + (game.doneToday() ? '' : ' dim'), href: '#/', title: `${streak}-day streak${game.doneToday() ? '' : ' (no commit today yet)'}`, 'aria-label': `${streak}-day streak${game.doneToday() ? '' : ', no commit today yet'}`, onclick: (e) => { const c = document.querySelector('.streak-card'); if (c) { e.preventDefault(); c.scrollIntoView({ behavior: glide(), block: 'center' }); } } },
        h('span', { class: 'ic', html: REWARDS.streak.icon(streak > 0) }), h('span', { class: 'n' }, String(streak))),
      h('a', { class: 'stat cherries', href: '#/shop', title: `${cur.count(game.G.gems)} · spend them in the shop`, 'aria-label': `${cur.count(game.G.gems)}, open the shop` }, h('span', { class: 'ic', html: cur.icon() }), h('span', { class: 'n' }, String(game.G.gems))),
      h('span', { class: 'stat goal', title: `${game.xpToday()} / ${game.G.goal} XP today` }, goalRing(34), h('span', { class: 'n', 'aria-hidden': 'true' }, `${game.xpToday()}`, h('small', {}, `/${game.G.goal}`)),
        h('span', { class: 'sr-only' }, `${game.xpToday()} of ${game.G.goal} XP today`)),
      theme, mute),
    h('a', { class: 'me' + (active === 'profile' ? ' active' : ''), href: '#/profile', 'aria-label': 'Your profile', title: 'Your profile', html: avatarHTML('happy') }));
}

// Ticks the top bar's currency count from one value to another (after a purchase).
export function tickCurrency(from, to, ms = 700) {
  const el = document.querySelector('.topbar .stat.cherries .n');
  if (!el) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const step = (now) => { const t = Math.min(1, (now - t0) / ms); el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)))); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  const stat = el.closest('.stat'); stat.classList.remove('spend'); void stat.offsetWidth; stat.classList.add('spend');
}
