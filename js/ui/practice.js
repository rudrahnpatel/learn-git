// Practice hub: mistakes review, speed round, bisect hunt and the sandbox.
// The mistakes deck is the active course's. Speed round, bisect hunt, sandbox and the extra challenges are
// git modes (the v1 levels): in another course they stay available under a "From the git course" heading.
import { h } from '../dom.js';
import { APP } from '../brand.js';
import { ICON, setShapes } from './fx.js';
import { twig } from './twig.js';
import { topbar } from './topbar.js';
import * as game from './game.js';
import { LEVELS, KINDS } from '../levels.js';
import { UNITS, loadedCourse } from './path.js';
import { courseById } from '../courses.js';

export function renderPractice(root) {
  setShapes('practice');
  document.title = `Practice · ${APP.name}`;
  const total = game.mistakeCount();
  const isGit = loadedCourse === 'git';
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
    ...practiceGrids()));
  function practiceGrids() {
    const where = isGit ? '' : ` in ${courseById(loadedCourse)?.title || 'this course'}`;
    const mistakes = card('#/mistakes', 'pink', ICON.book(), 'Mistakes review', `Re-play the exercises you missed${where}. Get one right three times over the next week and it leaves the deck.`, total ? `${due} DUE · ${total} SAVED` : 'NOTHING TO REVIEW', !total);
    const arcade = [
      card('#/speed', 'yellow', ICON.bolt('var(--on-accent)'), 'Speed round', '90 seconds. Situation in, command out. Earns up to 15 XP.', game.G.stats.speedBest ? `BEST ${game.G.stats.speedBest}` : 'NO SCORE YET'),
      card('#/bisect', 'sky', ICON.terminal(), 'Bisect hunt', 'A fresh random history with a hidden bug. Find it in as few tests as you can.', game.G.stats.bisectBest != null ? `BEST ${game.G.stats.bisectBest} TESTS` : 'NO SCORE YET'),
      card('#/sandbox', 'green', ICON.dumbbell(), 'Sandbox', 'Every command, no goal. A repo with branches and a remote, saved in your browser.', 'FREE PLAY')];
    if (isGit) return [h('div', { class: 'practice-grid' }, mistakes, arcade), extras()];
    return [h('div', { class: 'practice-grid' }, mistakes),
      h('div', { class: 'card-head practice-sub' }, h('h2', {}, 'From the git course'), h('span', { class: 'mono tiny' }, 'GIT ARCADE')),
      h('div', { class: 'practice-grid' }, arcade), extras()];
  }
  return null;
}

// v1 levels that no unit uses as a challenge node: replayable here as extra challenges.
function extras() {
  if (loadedCourse !== 'git') return null;   // "unused by the path" only means something on the git path
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
