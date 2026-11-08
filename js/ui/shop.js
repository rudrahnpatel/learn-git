// The shop (#/shop): the currency sink. Mascot cosmetics by slot (tiered 40-400), profile rings,
// app accents and the streak stash. Tap an item to try it on the big preview; buying asks in our
// own modal, ticks the top-bar count down, and the mascot puts the item on with a happy hop.
// Words and icons come from js/brand.js; prices, locks and ownership from game.js.
import { h, confirmModal } from '../dom.js';
import { sfx } from '../sound.js';
import { ICON, setShapes, toast, flyUp, shake, confetti } from './fx.js';
import { twig, twigSVG } from './twig.js';
import { topbar, tickCurrency } from './topbar.js';
import { applyAccent } from '../theme.js';
import { SLOTS, ITEMS, ringSVG, THUMB_VIEW, itemById } from './cosmetics.js';
import { APP, MASCOT, REWARDS } from '../brand.js';
import * as game from './game.js';

const TRY_LINES = {
  head: ['How do I look?', 'Hat hair, worth it.', 'Fits like a fresh clone.'],
  face: ['Ooh, I can read diffs from here.'],
  neck: ['Snug as a stashed change.', 'Very dapper.'],
  held: ['Mine now. Mine!', 'Look what I\'m holding!'],
  ring: ['Check out my profile glow.'],
  theme: ['New paint on every button!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function thumb(it) {
  if (it.slot === 'ring') return h('span', { class: 'shop-thumb ring-thumb', html: `<span class="avatar-ring">${ringSVG(it.id)}</span><span class="avatar-twig">${twigSVG('happy', {})}</span>` });
  if (it.slot === 'theme') return h('span', { class: 'shop-thumb swatch-thumb', 'data-accent-preview': it.id.replace(/^accent-/, '') }, h('span', { class: 'swatch-btn' }, 'Go', h('span', { class: 'arr' }, ' →')));
  return h('span', { class: 'shop-thumb', html: twigSVG('idle', { [it.slot]: it.id }, { viewBox: THUMB_VIEW[it.slot] }) });
}

export function renderShop(root) {
  setShapes('practice');
  document.title = `Shop · ${APP.name}`;
  const cur = REWARDS.currency;
  let previewId = null;
  const mascot = twig({ mood: 'idle', size: 150, side: 'left', cls: 'shop-twig', text: `Spend your ${cur.many} on me! Tap anything to try it on.` });
  const previewName = h('span', { class: 'mono tiny prev-label' }, 'WEARING NOW');
  const previewAct = h('div', { class: 'prev-act' });
  const balance = h('span', { class: 'shop-balance', 'aria-live': 'polite' });
  const preview = h('aside', { class: 'card shop-preview' }, mascot.el, h('div', { class: 'prev-info' }, previewName, previewAct), balance);
  const list = h('div', { class: 'shop-list' });

  const outfitWith = (it) => ({ ...game.G.cosmetics.equipped, [it.slot]: it.id });
  function showBalance() { balance.replaceChildren(h('span', { class: 'ic', html: cur.icon() }), h('span', {}, `${game.G.gems} ${game.G.gems === 1 ? cur.one : cur.many}`)); }

  // The button for an item, wherever it shows (its card, and the preview panel).
  function actionBtn(it, where) {
    const lock = game.itemLock(it.id);
    if (lock) return h('span', { class: 'tag-pill mono lock-pill' }, h('span', { class: 'inline-ic', html: ICON.lock() }), lock.title.toUpperCase());
    if (game.owns(it.id)) {
      const on = game.equipped(it.slot) === it.id;
      return h('button', { class: 'btn small ' + (on ? 'ghost' : 'dark'), type: 'button', onclick: (e) => { e.stopPropagation(); toggle(it); } }, on ? 'Take off' : 'Equip');
    }
    const short = it.price - game.G.gems;
    return h('button', { class: 'btn small primary buy', type: 'button', disabled: short > 0, 'aria-label': short > 0 ? `${it.name}: need ${short} more ${cur.many}` : `Buy ${it.name} for ${cur.count(it.price)}`,
      onclick: (e) => { e.stopPropagation(); buy(it, e.currentTarget); } },
    short > 0 ? `Need ${short} more` : h('span', { class: 'price' }, 'Buy · ', h('span', { class: 'inline-ic', html: cur.icon() }), String(it.price)));
  }

  function itemCard(it) {
    const on = game.equipped(it.slot) === it.id, own = game.owns(it.id), lock = game.itemLock(it.id);
    return h('div', { class: 'card shop-item' + (on ? ' on' : '') + (previewId === it.id ? ' trying' : '') + (lock ? ' is-locked' : ''), 'data-item': it.id },
      h('button', { class: 'shop-try', type: 'button', 'aria-label': `Try on ${it.name}`, onclick: () => tryOn(it) }, thumb(it)),
      h('div', { class: 'shop-meta' },
        h('h3', {}, it.name),
        h('p', {}, lock ? `Unlocks with the "${lock.title}" achievement: ${lock.text.replace(/ \(.*\)$/, '')}.` : it.blurb),
        h('div', { class: 'shop-foot' },
          own ? h('span', { class: 'tag-pill mono' + (on ? ' wearing' : '') }, on ? (it.slot === 'theme' ? 'IN USE' : it.slot === 'ring' ? 'SHOWING' : 'WEARING') : 'OWNED')
            : h('span', { class: 'price-tag mono', 'aria-hidden': 'true' }, h('span', { class: 'inline-ic', html: cur.icon() }), String(it.price)),
          actionBtn(it, 'card'))));
  }

  function stashCard() {
    const full = game.G.streak.freezes >= game.MAX_STASHES, short = game.STASH_COST - game.G.gems;
    const F = REWARDS.freeze;
    return h('div', { class: 'card shop-item stash-item' },
      h('span', { class: 'shop-thumb stash-thumb', html: F.icon() }),
      h('div', { class: 'shop-meta' },
        h('h3', {}, `${F.verb}`),
        h('p', {}, `Saves your ${REWARDS.streak.name} on a day you miss. You hold ${game.G.streak.freezes} of ${game.MAX_STASHES}.`),
        h('div', { class: 'shop-foot' },
          h('span', { class: 'price-tag mono', 'aria-hidden': 'true' }, h('span', { class: 'inline-ic', html: cur.icon() }), String(game.STASH_COST)),
          h('button', { class: 'btn small dark', type: 'button', disabled: full || short > 0, onclick: (e) => {
            const from = game.G.gems;
            if (!game.buyStash()) return;
            sfx.stash(); tickCurrency(from, game.G.gems); flyUp(document.querySelector('.topbar .stat.cherries'), `−${game.STASH_COST}`, 'cherry', { icon: cur.icon(), down: true });
            toast(`${F.one[0].toUpperCase() + F.one.slice(1)} saved. It pops itself if you miss a day.`, { icon: F.icon() });
            draw();
          } }, full ? `${F.many[0].toUpperCase() + F.many.slice(1)} full` : short > 0 ? `Need ${short} more` : 'Buy'))));
  }

  function draw() {
    // a redraw replaces the buttons: keep the keyboard focus on the same item's same control afterwards
    const f = document.activeElement;
    const was = f && f !== document.body ? { item: f.closest('[data-item]')?.dataset.item, tryBtn: f.classList.contains('shop-try'), preview: preview.contains(f), stash: !!f.closest('.stash-item') } : null;
    redraw();
    if (!was || document.activeElement !== document.body) return;
    const card = was.item && list.querySelector(`[data-item="${CSS.escape(was.item)}"]`);
    const target = was.preview ? previewAct.querySelector('button, a')
      : was.stash ? list.querySelector('.stash-item button:not(:disabled)') || list.querySelector('.stash-item h3')
      : card && (was.tryBtn ? card.querySelector('.shop-try') : card.querySelector('.shop-foot button:not(:disabled)') || card.querySelector('.shop-try'));
    if (target) { if (!target.matches('button, a')) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
  }
  function redraw() {
    showBalance();
    const sections = [];
    for (const s of SLOTS) {
      const items = ITEMS.filter((i) => i.slot === s.id).sort((a, b) => a.price - b.price);
      if (!items.length) continue;
      sections.push(h('section', { class: 'shop-sec' },
        h('div', { class: 'card-head' }, h('h2', {}, s.label), s.note ? h('span', { class: 'mono tiny' }, s.note.toUpperCase()) : null),
        h('div', { class: 'shop-grid' }, items.map(itemCard))));
    }
    sections.push(h('section', { class: 'shop-sec' }, h('div', { class: 'card-head' }, h('h2', {}, `Keep your ${REWARDS.streak.name}`)), h('div', { class: 'shop-grid' }, stashCard())));
    list.replaceChildren(...sections);
    drawPreview();
  }
  function drawPreview() {
    const it = previewId && itemById(previewId);
    if (!it) { previewName.textContent = 'WEARING NOW'; previewAct.replaceChildren(h('a', { class: 'btn small ghost', href: '#/profile' }, 'See your profile', h('span', { class: 'arr' }, ' →'))); return; }
    previewName.textContent = (game.owns(it.id) ? 'YOURS · ' : 'TRYING ON · ') + it.name.toUpperCase();
    previewAct.replaceChildren(actionBtn(it, 'preview'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => { previewId = null; mascot.dress(null); setAccentPreview(null); mascot.say('Back to my usual look.', 'idle'); draw(); } }, 'Reset'));
  }
  // Accent items preview on the whole page; leaving the shop puts the equipped accent back.
  function setAccentPreview(it) { applyAccent(it && it.slot === 'theme' ? it.id : game.accentTheme()); }

  function tryOn(it) {
    sfx.tap();
    previewId = it.id;
    if (it.slot === 'ring') mascot.dress({ ...game.G.cosmetics.equipped });
    else if (it.slot !== 'theme') mascot.dress(outfitWith(it));
    setAccentPreview(it);
    const lock = game.itemLock(it.id);
    mascot.say(lock ? `Ooh, shiny. Earn "${lock.title}" first.` : game.owns(it.id) ? `My ${it.name.toLowerCase()}!` : `${pick(TRY_LINES[it.slot] || TRY_LINES.head)} ${cur.count(it.price)}.`, lock ? 'think' : 'happy');
    draw();
    if (matchMedia('(max-width: 900px)').matches) preview.scrollIntoView?.({ block: 'nearest' });
  }

  async function buy(it, btn) {
    const after = game.G.gems - it.price;
    const ok = await confirmModal(`Buy the ${it.name.toLowerCase()}?`, `${cur.count(it.price)}. You will have ${cur.count(after)} left. ${it.slot === 'theme' ? 'It recolours every button.' : `${MASCOT.name} puts it on straight away.`}`, { ok: `Buy · ${it.price}` });
    if (!ok) return;
    const from = game.G.gems;
    const r = game.buyItem(it.id);
    if (!r.ok) { shake(btn); toast(r.reason === 'cherries' ? `Not enough ${cur.many} yet.` : 'You can\'t buy that one yet.', { icon: ICON.lock() }); return; }
    sfx.buy();
    tickCurrency(from, game.G.gems);
    flyUp(document.querySelector('.topbar .stat.cherries'), `−${it.price}`, 'cherry', { icon: cur.icon(), down: true });
    previewId = it.id;
    if (it.slot === 'theme') applyAccent(it.id);
    mascot.dress(null);
    mascot.say(`${pick(TRY_LINES[it.slot] || TRY_LINES.head)} Thank you!`, 'cheer');
    setTimeout(() => mascot.mood('happy'), 1300);
    confetti(mascot.el.querySelector('.twig'), { count: 30, spread: 0.6 });
    refreshAvatar();
    draw();
  }
  function toggle(it) {
    const on = game.equipped(it.slot) === it.id;
    game.equip(it.id, !on);
    sfx.tap();
    if (it.slot === 'theme') applyAccent(game.accentTheme());
    previewId = it.id;
    mascot.dress(null);
    mascot.say(on ? 'Back in the wardrobe it goes.' : pick(TRY_LINES[it.slot] || TRY_LINES.head), on ? 'idle' : 'happy');
    refreshAvatar();
    draw();
  }
  const refreshAvatar = () => { const me = document.querySelector('.topbar .me'); if (me) me.replaceWith(topbar('shop').querySelector('.me')); };

  draw();
  root.replaceChildren(topbar('shop'), h('main', { class: 'shop' },
    h('div', { class: 'practice-head shop-head' },
      h('div', {}, h('span', { class: 'mono tiny' }, 'SHOP'), h('h1', {}, `${MASCOT.name}'s wardrobe`), h('p', { class: 'lede' }, `Spend your ${cur.many} on outfits, a profile ring, a new accent or a ${REWARDS.freeze.one} for your ${REWARDS.streak.name}.`))),
    h('div', { class: 'shop-layout' }, preview, list)));
  return () => setAccentPreview(null);
}
