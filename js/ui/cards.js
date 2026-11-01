// Command cards: the card element (flip to see the example and the common pitfall), the
// collection screen (#/cards: locked silhouettes, rarity filter, search) and the "New card!"
// reveal that joins the lesson-complete sequence. Card data: js/content/cards.js (per course).
import { h } from '../dom.js';
import { sfx } from '../sound.js';
import { ICON, setShapes, confetti, reducedMotion } from './fx.js';
import { twig, twigSVG } from './twig.js';
import { topbar } from './topbar.js';
import { UNITS } from './path.js';
import { APP } from '../brand.js';
import { CARDS, RARITIES } from '../content/cards.js';
import * as game from './game.js';

const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const lessonTitle = (id) => { for (const u of UNITS) for (const l of u.lessons) if (l.id === id) return { lesson: l.title, unit: u.title }; return null; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// mode 'collect': front = summary, back = example + pitfall, tap flips.
// mode 'reveal' : back = the card's cover (face down), front = summary; .flip() turns it over.
export function cardEl(card, { mode = 'collect', locked = false } = {}) {
  if (locked) {
    const where = lessonTitle(card.unlockedBy[0]);
    return h('div', { class: `ccard locked r-${card.rarity}`, role: 'listitem', 'aria-label': `Locked ${RARITY_LABEL[card.rarity]} card. Unlocks in ${where?.lesson || 'a lesson'}.` },
      h('span', { class: 'ccard-in' }, h('span', { class: 'ccard-face front' },
        h('span', { class: 'ccard-top' }, h('span', { class: 'ccard-rar mono' }, RARITY_LABEL[card.rarity]), h('span', { class: 'ccard-lock', html: ICON.lock() })),
        h('span', { class: 'ccard-q', 'aria-hidden': 'true' }, '?'),
        h('span', { class: 'ccard-unlock' }, h('span', { class: 'mono tiny' }, 'UNLOCKS IN'), h('span', {}, where ? where.lesson : 'a lesson')))));
  }
  const front = h('span', { class: 'ccard-face front' },
    h('span', { class: 'ccard-top' }, h('span', { class: 'ccard-rar mono' }, RARITY_LABEL[card.rarity]), mode === 'collect' ? h('span', { class: 'ccard-turn mono', 'aria-hidden': 'true' }, 'TAP ↻') : null),
    h('code', { class: 'ccard-cmd' }, card.cmd),
    h('span', { class: 'ccard-title' }, card.title),
    h('span', { class: 'ccard-what' }, card.what));
  const back = mode === 'reveal'
    ? h('span', { class: 'ccard-face back cover' }, h('span', { class: 'cover-twig', html: twigSVG('happy') }), h('span', { class: 'mono cover-t' }, APP.name))
    : h('span', { class: 'ccard-face back' },
      h('span', { class: 'mono tiny' }, 'EXAMPLE'),
      h('pre', { class: 'ccard-ex' }, h('code', {}, card.example)),
      h('span', { class: 'mono tiny watch' }, 'WATCH OUT'),
      h('span', { class: 'ccard-mistake' }, card.mistake));
  const el = h(mode === 'collect' ? 'button' : 'div', {
    class: `ccard r-${card.rarity}` + (mode === 'reveal' ? ' face-down' : ''), type: mode === 'collect' ? 'button' : null,
    role: mode === 'collect' ? null : 'listitem', 'aria-pressed': mode === 'collect' ? 'false' : null,
    'aria-label': mode === 'collect' ? `${card.cmd}: ${card.title}. ${RARITY_LABEL[card.rarity]}. Tap to see an example.` : null,
  }, h('span', { class: 'ccard-in' }, front, back), h('span', { class: 'ccard-shine', 'aria-hidden': 'true' }));
  if (mode === 'collect') {
    el.addEventListener('click', () => {
      const on = !el.classList.contains('flipped');
      el.classList.toggle('flipped', on); el.setAttribute('aria-pressed', String(on));
      el.setAttribute('aria-label', on ? `${card.cmd}. Example: ${card.example}. Watch out: ${card.mistake}` : `${card.cmd}: ${card.title}. ${RARITY_LABEL[card.rarity]}. Tap to see an example.`);
      sfx.flip();
    });
  }
  return el;
}

/* -------------------------------------------------------------- collection */
export function renderCards(root) {
  setShapes('practice');
  document.title = `Cards · ${APP.name}`;
  const course = game.courseId();
  const deck = CARDS.filter((c) => c.course === course);
  const owned = game.ownedCards(course);
  let rarity = 'all', query = '', onlyOwned = false;
  const { got, total } = game.cardCount(course);

  const grid = h('div', { class: 'card-groups' });
  const empty = h('p', { class: 'cards-empty muted hidden' }, 'No cards match. Try another word or rarity.');
  const pill = (id, label, n) => h('button', { class: 'tag-pill filter' + (rarity === id ? ' on' : ''), type: 'button', 'aria-pressed': String(rarity === id), 'data-r': id,
    onclick: () => { rarity = id; sfx.tap(); pills.querySelectorAll('.filter').forEach((p) => { const on = p.dataset.r === id; p.classList.toggle('on', on); p.setAttribute('aria-pressed', String(on)); }); draw(); } }, label, n != null ? h('span', { class: 'mono pill-n' }, n) : null);
  const pills = h('div', { class: 'card-filters', role: 'group', 'aria-label': 'Filter by rarity' },
    pill('all', 'All', `${got}/${total}`),
    RARITIES.map((r) => pill(r, RARITY_LABEL[r], `${deck.filter((c) => c.rarity === r && owned[c.id]).length}/${deck.filter((c) => c.rarity === r).length}`)));
  const search = h('input', { class: 'card-search', type: 'search', placeholder: 'Search commands: rebase, stash, -u…', 'aria-label': 'Search cards', oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });
  const ownedToggle = h('label', { class: 'own-toggle' }, h('input', { type: 'checkbox', onchange: (e) => { onlyOwned = e.target.checked; draw(); } }), h('span', {}, 'Collected only'));

  function draw() {
    grid.replaceChildren();
    let shown = 0;
    for (const u of UNITS) {
      const ids = new Set(u.lessons.map((l) => l.id));
      const list = deck.filter((c) => ids.has(c.unlockedBy[0])) // each card once, under the unit that first teaches it
        .filter((c) => rarity === 'all' || c.rarity === rarity)
        .filter((c) => !onlyOwned || owned[c.id])
        .filter((c) => !query || (owned[c.id] ? `${c.cmd} ${c.title} ${c.what} ${c.example}` : c.rarity).toLowerCase().includes(query));
      if (!list.length) continue;
      shown += list.length;
      grid.append(h('section', { class: 'card-group' },
        h('div', { class: 'card-head' }, h('h2', {}, u.title), h('span', { class: 'mono tiny' }, `${list.filter((c) => owned[c.id]).length}/${list.length}`)),
        h('div', { class: 'card-grid', role: 'list' }, list.map((c) => owned[c.id] ? h('div', { role: 'listitem', class: 'ccard-cell' }, cardEl(c)) : cardEl(c, { locked: true })))));
    }
    empty.classList.toggle('hidden', shown > 0);
  }
  draw();
  const line = got === 0 ? 'Merge a lesson to win your first card!' : got === total ? 'Every card! You are a walking cheat sheet.' : `${got} of ${total}. Tap a card to see an example and the classic slip.`;
  root.replaceChildren(topbar('cards'), h('main', { class: 'cards-page' },
    h('div', { class: 'practice-head cards-head' },
      h('div', {}, h('span', { class: 'mono tiny' }, 'COMMAND CARDS'), h('h1', {}, 'Your cheat sheet'), h('p', { class: 'lede' }, 'One card per command. Merge a lesson to unlock its cards.')),
      twig({ mood: got ? 'happy' : 'think', size: 100, text: line, side: 'left' }).el),
    h('div', { class: 'card-tools' }, pills, h('div', { class: 'card-search-row' }, search, ownedToggle)),
    empty, grid));
  game.markCardsSeen(Object.keys(owned), course);
  return null;
}

/* ------------------------------------------------------------ "New card!" */
// One celebration step: the new cards lie face down, then turn over one by one with a shimmer.
export function cardRevealStep(cards) {
  return () => {
    setShapes('celebrate');
    const shown = cards.slice(0, 3);
    const els = shown.map((c) => cardEl(c, { mode: 'reveal' }));
    const best = shown.reduce((a, c) => (RARITIES.indexOf(c.rarity) > RARITIES.indexOf(a.rarity) ? c : a), shown[0]);
    const more = cards.length - shown.length;
    const el = h('div', { class: 'cel-body card-reveal' },
      h('span', { class: 'tag-pill mono new-card-pill' }, h('span', { class: 'inline-ic', html: ICON.book() }), cards.length > 1 ? `${cards.length} NEW CARDS` : 'NEW CARD'),
      h('h1', { class: 'cel-title' }, cards.length > 1 ? 'New cards!' : 'New card!'),
      h('div', { class: 'reveal-row n' + shown.length, role: 'list' }, els),
      h('p', { class: 'cel-sub' }, more > 0 ? `+${more} more in your collection.` : best.rarity === 'legendary' ? 'A legendary one. Guard it with your reflog.' : 'Added to your cheat sheet. Find it under Cards.'));
    return {
      el,
      onShow: () => {
        const rm = reducedMotion();
        els.forEach((c, i) => setTimeout(() => {
          c.classList.remove('face-down'); c.classList.add('revealed');
          sfx.flip(); setTimeout(() => sfx.reveal(shown[i].rarity === 'legendary' || shown[i].rarity === 'epic'), rm ? 0 : 260);
          if (shown[i].rarity === 'legendary' || shown[i].rarity === 'epic') setTimeout(() => confetti(c, { count: 24, spread: 0.6 }), rm ? 0 : 420);
        }, rm ? 0 : 450 + i * 520));
        game.markCardsSeen(cards.map((c) => c.id));
      },
    };
  };
}
