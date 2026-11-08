// Home: the winding path of nodes, unit banners, Twig, and the side column (quests, streak
// week, practice entry, achievements).
import { h } from '../dom.js';
import { APP, REWARDS } from '../brand.js';
const CUR = REWARDS.currency, FRZ = REWARDS.freeze, cap = (t) => t[0].toUpperCase() + t.slice(1);
import { sfx } from '../sound.js';
import { twig } from './twig.js';
import { ICON, setShapes, toast, shake, accent, flyUp } from './fx.js';
import { topbar } from './topbar.js';
import { commitLine, releaseOverlay } from './complete.js';
import { UNITS, nodes, nodeStatus, crowns, unitProgress, currentNode, contentSource } from './path.js';
import * as game from './game.js';
import { resetProgress, privacyLine } from './account.js';

const KIND_ICON = { lesson: ICON.star, release: () => ICON.crate(false), challenge: ICON.terminal, review: ICON.trophy };
const WAVE = [0, 0.55, 0.9, 0.55, 0, -0.55, -0.9, -0.55];
// The daily crate's tag is the date as a short version, 2026-11-08 -> v26.11.08 (short enough for a phone's crate tag).
const dailyTag = (day) => 'v' + day.slice(2).replace(/-/g, '.');

function twigLine(msg) {
  if (msg) return msg;
  const s = game.shownStreak();
  if (game.boostActive()) return `Fast-forward is on: 2× XP for ${game.boostLeftMin()} more min. Go go go!`;
  if (game.doneToday()) return s > 1 ? `Day ${s}! Today's commit is in. Fancy a bonus round?` : 'Today\'s commit is in. Look at you.';
  const left = game.G.goal - game.xpToday();
  if (game.xpToday() > 0) return `${left} XP until today's commit lands. ${s ? 'Don\'t break the line!' : 'Start your history!'}`;
  if (s > 0) return `Day ${s} of your history. One lesson commits today.`;
  if (!game.G.totalXp) return 'Tap START. A lesson takes about three minutes.';
  return 'New day, clean working tree. Shall we?';
}

export function renderHome(root, { message = null, popNode = null, refresh } = {}) {
  const rerender = (o = {}) => refresh(o);
  setShapes('home');
  document.title = APP.name;
  const cur = currentNode();
  let popover = null;
  const closePop = () => {
    document.querySelectorAll('.has-pop').forEach((el) => el.classList.remove('has-pop'));
    popover?.remove(); popover = null;
  };

  /* ---------------------------------------------------------------- path */
  const pathCol = h('div', { class: 'path-col' });
  let k = 0;
  for (const unit of UNITS) {
    const prog = unitProgress(unit);
    const ui = UNITS.indexOf(unit);
    pathCol.append(h('section', { class: `unit-banner`, style: { background: accent(unit.color) } },
      h('div', {},
        h('span', { class: 'mono tiny' }, `UNIT ${ui + 1}${ui < game.G.placement ? ' · SKIPPED, STILL PLAYABLE' : ''}`),
        h('h2', {}, unit.title),
        unit.blurb ? h('p', {}, unit.blurb) : null),
      h('span', { class: 'unit-prog mono' }, `${prog.done}/${prog.total}`)));
    const list = h('div', { class: 'path' });
    k = 0;
    for (const n of nodes().filter((x) => x.unit === unit)) {
      const st = nodeStatus(n);
      const x = WAVE[k++ % WAVE.length];
      const cr = n.kind === 'lesson' ? crowns(n) : 0;
      const btn = h('button', {
        class: `pnode k-${n.kind} s-${st}`, type: 'button', style: { '--fill': accent(unit.color) },
        'aria-label': n.kind === 'release' ? `Reward crate, release ${n.version}, ${st === 'done' ? 'opened' : st}` : `${n.title}, ${st}`,
        html: st === 'locked' && n.kind !== 'release' ? ICON.lock() : st === 'done' && n.kind === 'release' ? ICON.crate(true) : st === 'done' && n.kind === 'lesson' ? ICON.check() : KIND_ICON[n.kind](),
        onclick: (e) => { e.stopPropagation(); clickNode(n, st, btn); },
      });
      const wrap = h('div', { class: 'node-wrap' }, btn,
        cr ? h('span', { class: 'crowns', title: `${cr} crown${cr > 1 ? 's' : ''}` }, h('span', { html: ICON.crown() }), String(cr)) : null,
        // the version hangs off the crate as a small git tag: the reward first, the git flavour second
        n.kind === 'release' ? h('span', { class: 'tag-ver', 'aria-hidden': 'true' }, h('span', { class: 'tag-ver-t mono' }, n.version)) : null);
      if (st === 'current') wrap.prepend(h('button', { class: 'start-bubble mono', type: 'button', onclick: (e) => { e.stopPropagation(); start(n); } }, n.kind === 'release' ? 'OPEN' : 'START'));
      const row = h('div', { class: 'path-row', style: { '--x': x }, 'data-node': n.id }, wrap);
      if (st === 'current') {
        const t = twig({ mood: 'idle', size: 92, text: twigLine(message), side: x > 0 ? 'right' : 'left', cls: 'path-twig ' + (x > 0 ? 'on-left' : 'on-right') });
        row.append(t.el);
        row.classList.add('has-twig');
      }
      if (popNode && n.id === popNode) btn.classList.add('pop-in');
      list.append(row);
    }
    pathCol.append(list);
  }
  if (!cur) pathCol.append(h('div', { class: 'card path-end' }, twig({ mood: 'cheer', size: 100 }).el, h('h2', {}, 'You finished the whole path!'), h('p', {}, 'Replay lessons for crowns, or keep sharp in Practice.')));

  function clickNode(n, st, btn) {
    sfx.tap();
    if (st === 'locked') { shake(btn); toast('Finish the nodes before this one first.', { icon: ICON.lock() }); return; }
    closePop();
    const label = { lesson: 'LESSON', release: 'PATH REWARD', challenge: 'CHALLENGE', review: 'UNIT REVIEW' }[n.kind];
    const done = st === 'done';
    const meta = n.kind === 'lesson' ? (crowns(n) ? `${crowns(n)} crown${crowns(n) > 1 ? 's' : ''} · replays are shuffled` : `${n.lesson.exercises.length} exercises · about 3 min`)
      : n.kind === 'challenge' ? 'A live repo puzzle. Stars become XP.'
      : n.kind === 'review' ? '10 exercises from this unit, shuffled.'
      : `Release ${n.version} · ${CUR.many} inside, and sometimes a ${REWARDS.boost.name.toLowerCase()}.`;
    if (n.kind === 'release' && done) { toast(`Crate ${n.version} already opened. Onwards!`, { icon: ICON.crate(true) }); return; }
    const go = h('button', { class: 'btn primary', type: 'button', onclick: () => start(n) },
      n.kind === 'release' ? 'Open crate' : done ? (n.kind === 'challenge' ? 'Play again' : 'Practice again +XP') : `Start +${n.kind === 'challenge' ? '20' : '10'} XP`, h('span', { class: 'arr' }, ' →'));
    popover = h('div', { class: 'popover card', role: 'dialog', 'aria-label': n.title, onclick: (e) => e.stopPropagation() },
      n.kind === 'release' ? h('span', { class: 'pop-crate', html: ICON.crate(false) }) : null,
      h('span', { class: 'mono tiny' }, label + (st === 'skipped' ? ' · SKIPPED' : '')), h('h3', {}, n.kind === 'release' ? 'Reward crate' : n.title), h('p', {}, meta), go);
    if (n.kind === 'release') popover.classList.add('crate-pop');
    btn.parentElement.append(popover);
    btn.parentElement.classList.add('has-pop');                 // .node-wrap
    btn.closest('.path-row')?.classList.add('has-pop');         // and its row, in case the row is a stacking context too
    // Open upward when there isn't room below the node (and there is above); otherwise scroll it into view.
    const nb = btn.getBoundingClientRect(), ph = popover.offsetHeight + 24, top = document.querySelector('.topbar')?.offsetHeight || 0;
    if (nb.bottom + ph > innerHeight && nb.top - ph > top) popover.classList.add('above');
    else if (nb.bottom + ph > innerHeight) popover.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    go.focus({ preventScroll: true });
  }
  async function start(n) {
    closePop();
    if (n.kind === 'release') {
      const reward = await releaseOverlay({ version: n.version, from: n.prevVersion, seed: n.id });
      if (reward) game.completeNode(n.id);
      rerender({ popNode: currentNode()?.id });
      if (reward) pickFlyUp(reward.cherries);
      return;
    }
    if (n.kind === 'challenge') location.hash = `#/challenge/${encodeURIComponent(n.levelId)}`;
    else location.hash = `#/lesson/${encodeURIComponent(n.id)}`;
  }

  /* ---------------------------------------------------------------- side */
  const qs = game.quests();
  const releaseReady = game.G.quests.chest && !game.G.quests.chestOpened; // saved names: chest = daily release
  const questCard = h('section', { class: 'card side-card quests' },
    h('div', { class: 'card-head' }, h('h3', {}, 'Daily quests'), h('span', { class: 'mono tiny' }, 'NEW ONES AT MIDNIGHT')),
    qs.map((q) => h('div', { class: 'quest' + (q.done ? ' done' : '') },
      h('div', { class: 'q-top' }, h('span', {}, q.text), h('span', { class: 'q-cherries', 'aria-label': CUR.count(q.cherries) }, h('span', { html: CUR.icon() }), String(q.cherries))),
      h('div', { class: 'qbar' }, h('div', { class: 'qbar-fill', style: { width: `${(q.progress / q.n) * 100}%` } }), h('span', { class: 'qbar-n mono' }, `${q.progress}/${q.n}`)))),
    h('div', { class: 'daily-release' + (releaseReady ? ' ready' : '') },
      h('span', { class: 'dr-ic' + (releaseReady ? ' ready' : ''), html: ICON.crate(!!game.G.quests.chestOpened) }),
      h('span', {}, game.G.quests.chestOpened ? 'Daily crate opened. A new one tomorrow!' : releaseReady ? 'All quests done! Open today\'s crate.' : 'Finish all three to open the daily crate'),
      releaseReady ? h('button', { class: 'btn primary small', type: 'button', onclick: async () => {
        const r = await releaseOverlay({ version: dailyTag(game.today()), from: dailyTag(game.addDays(game.today(), -1)), title: 'Daily crate', label: 'ALL QUESTS DONE', seed: 'quests' });
        game.G.quests.chestOpened = true; game.save(); rerender(); if (r) pickFlyUp(r.cherries);
      } }, 'Open') : null));

  const s = game.shownStreak();
  const stashFull = game.G.streak.freezes >= game.MAX_STASHES;
  const stashBtn = h('button', { class: 'btn small dark stash-btn', type: 'button', disabled: game.G.gems < game.STASH_COST || stashFull,
    'aria-label': stashFull ? `${cap(FRZ.many)} full` : `${FRZ.verb} for ${CUR.count(game.STASH_COST)}`,
    onclick: () => {
      if (!game.buyStash()) return;
      sfx.stash(); toast('Streak stashed. It pops itself if you miss a day.', { icon: FRZ.icon() }); rerender();
      flyUp(document.querySelector('.stash-row .stashes'), `−${game.STASH_COST}`, 'cherry', { icon: CUR.icon() });
      const fz = document.querySelectorAll('.fz.on'); fz[fz.length - 1]?.classList.add('fresh');
    } },
    stashFull ? `${cap(FRZ.many)} full` : h('span', {}, `${FRZ.verb} · `, h('span', { class: 'inline-ic', html: CUR.icon() }), String(game.STASH_COST)));
  const streakCard = h('section', { class: 'card side-card streak-card' },
    h('div', { class: 'streak-row' },
      h('span', { class: 'commit-big', html: ICON.commit(s > 0) }),
      h('div', {}, h('div', { class: 'streak-n' }, String(s)), h('span', { class: 'mono tiny' }, 'DAY STREAK'))),
    h('p', { class: 'muted' }, game.doneToday() ? 'Today\'s commit is in. See you tomorrow!' : `Earn ${Math.max(0, game.G.goal - game.xpToday())} more XP to commit today and ${s ? 'grow' : 'start'} your streak.`),
    commitLine(),
    h('div', { class: 'stash-row' },
      h('span', { class: 'stashes' }, Array.from({ length: game.MAX_STASHES }, (_, i) => h('span', { class: 'fz' + (i < game.G.streak.freezes ? ' on' : ''), html: FRZ.icon() })), h('span', { class: 'muted' }, ` ${game.G.streak.freezes}/${game.MAX_STASHES} ${FRZ.many}`)),
      stashBtn));

  const mistakes = Object.keys(game.G.mistakes).length;
  const practiceCard = h('a', { class: 'card side-card practice-entry', href: '#/practice' },
    h('span', { class: 'round-ic', html: ICON.dumbbell() }),
    h('div', {}, h('h3', {}, 'Practice hub'), h('p', {}, mistakes ? `${mistakes} mistake${mistakes > 1 ? 's' : ''} to review, plus speed round, bisect hunt and sandbox.` : 'Speed round, bisect hunt and the sandbox.')),
    h('span', { class: 'arr' }, '→'));

  const achCard = h('section', { class: 'card side-card ach-card' },
    h('div', { class: 'card-head' }, h('h3', {}, 'Achievements'), h('span', { class: 'mono tiny' }, `${Object.keys(game.G.achievements).length}/${game.ACHIEVEMENTS.length}`)),
    h('div', { class: 'badges' }, game.ACHIEVEMENTS.map((a) => {
      const got = !!game.G.achievements[a.id];
      return h('div', { class: 'badge' + (got ? ' got' : ''), title: `${a.title}: ${a.text}`, style: got ? { '--fill': accent(a.color) } : {} },
        h('span', { class: 'badge-disc', html: got ? ICON.trophy() : ICON.lock() }), h('span', { class: 'badge-t' }, a.title));
    })));

  const boost = game.boostActive() ? h('div', { class: 'boost-banner', role: 'status' }, h('span', { class: 'ff-ic', html: ICON.ff() }), h('span', {}, 'Fast-forward · 2× XP · ', h('span', { class: 'mono' }, `${game.boostLeftMin()} min left`))) : null;

  const footer = h('footer', { class: 'foot' },
    h('p', {}, privacyLine()),
    contentSource === 'fixture' ? h('p', { class: 'mono tiny' }, 'DEV FIXTURE CONTENT (js/content/index.js not found)') : null,
    // the confirm (and, when signed in, the cloud copy) is handled in account.js
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => resetProgress() }, 'Reset progress'));

  const side = h('aside', { class: 'side-col' }, boost, streakCard, questCard, practiceCard, achCard, footer);
  root.replaceChildren(topbar('learn'), h('div', { class: 'home' }, pathCol, side));

  const onDoc = () => closePop();
  document.addEventListener('click', onDoc);
  const onKey = (e) => {
    if (e.key === 'Escape') closePop();
    if (e.key === 'Enter' && e.target === document.body && cur && !document.querySelector('.modal-wrap')) start(cur);
  };
  document.addEventListener('keydown', onKey);

  // bring the current node into view; pop the newly unlocked one
  requestAnimationFrame(() => {
    const row = cur && root.querySelector(`[data-node="${CSS.escape(cur.id)}"]`);
    if (row) row.scrollIntoView({ block: 'center', behavior: popNode ? 'smooth' : 'auto' });
    if (popNode) setTimeout(() => sfx.unlock(), 350);
  });
  return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
}

// "+12" cherries dropping out of the top bar after a crate is opened.
function pickFlyUp(n) {
  requestAnimationFrame(() => flyUp(document.querySelector('.stat.cherries'), `+${n}`, 'cherry', { icon: CUR.icon(), down: true }));
}
