// Practice hub: mistakes review, speed round, bisect hunt and the sandbox.
import { h } from '../dom.js';
import { APP } from '../brand.js';
import { ICON, setShapes } from './fx.js';
import { twig } from './twig.js';
import { topbar } from './topbar.js';
import * as game from './game.js';
import { LEVELS, KINDS } from '../levels.js';
import { UNITS } from './path.js';

export function renderPractice(root) {
  setShapes('practice');
  document.title = `Practice · ${APP.name}`;
  const total = Object.keys(game.G.mistakes).length;
  const due = game.mistakesDue();
  const card = (href, color, icon, title, text, meta, disabled = false) => h(disabled ? 'div' : 'a', { class: `card practice-card c-${color}` + (disabled ? ' disabled' : ''), href: disabled ? null : href },
    h('span', { class: 'pc-ic', html: icon }),
    h('h2', {}, title), h('p', {}, text),
    h('div', { class: 'pc-foot' }, h('span', { class: 'tag-pill mono' }, meta), disabled ? null : h('span', { class: 'btn primary small' }, 'Play', h('span', { class: 'arr' }, ' →'))));
  const line = total ? `You have ${total} mistake${total > 1 ? 's' : ''} saved. Fixing them is the fastest way to learn.` : 'No mistakes saved. Go make some, they\'re useful!';
  root.replaceChildren(topbar('practice'), h('main', { class: 'practice' },
    h('div', { class: 'practice-head' },
      h('div', {}, h('span', { class: 'mono tiny' }, 'PRACTICE HUB'), h('h1', {}, 'Sharpen up'), h('p', { class: 'lede' }, 'Replay what tripped you up, race the clock, or break things on purpose.')),
      twig({ mood: total ? 'think' : 'happy', size: 110, text: line, side: 'left' }).el),
    h('div', { class: 'practice-grid' },
      card('#/mistakes', 'pink', ICON.book(), 'Mistakes review', 'Re-play the exercises you missed. Get one right three times over the next week and it leaves the deck.', total ? `${due} DUE · ${total} SAVED` : 'NOTHING TO REVIEW', !total),
      card('#/speed', 'yellow', ICON.bolt('var(--on-accent)'), 'Speed round', '90 seconds. Situation in, command out. Earns up to 15 XP.', game.G.stats.speedBest ? `BEST ${game.G.stats.speedBest}` : 'NO SCORE YET'),
      card('#/bisect', 'sky', ICON.terminal(), 'Bisect hunt', 'A fresh random history with a hidden bug. Find it in as few tests as you can.', game.G.stats.bisectBest != null ? `BEST ${game.G.stats.bisectBest} TESTS` : 'NO SCORE YET'),
      card('#/sandbox', 'green', ICON.dumbbell(), 'Sandbox', 'Every command, no goal. A repo with branches and a remote, saved in your browser.', 'FREE PLAY')),
    extras()));
  return null;
}

// v1 levels that no unit uses as a challenge node: replayable here as extra challenges.
function extras() {
  const used = new Set(UNITS.flatMap((u) => u.challenges || []));
  const list = LEVELS.filter((l) => !used.has(l.id));
  if (!list.length) return null;
  return h('section', { class: 'extras' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Extra challenges'), h('span', { class: 'mono tiny' }, `${list.filter((l) => game.G.challenges[l.id]).length}/${list.length} DONE`)),
    h('div', { class: 'extra-grid' }, list.map((l) => {
      const st = game.G.challenges[l.id]?.stars || 0;
      return h('a', { class: 'card extra' + (st ? ' done' : ''), href: `#/challenge/${encodeURIComponent(l.id)}` },
        h('span', { class: 'mono tiny' }, KINDS[l.kind]?.label || 'Puzzle'),
        h('h3', {}, l.title),
        h('span', { class: 'extra-stars' }, [1, 2, 3].map((i) => h('span', { class: 'xs' + (i <= st ? ' on' : ''), html: ICON.star() }))));
    })));
}
