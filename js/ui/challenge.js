// Challenge nodes (the v1 levels) and the arcade screens (bisect hunt, sandbox): a live repo with
// terminal, commit graph and goal checklist, plus hints, the conflict surgeon and the rebase-todo
// panel. Progressive disclosure: goal and graph first; the three trees are a toggle.
import { Repo, norm } from '../git.js';
import { APP } from '../brand.js';
import { KINDS, buildRepo, parOf, targetGraph, starsFor } from '../levels.js';
import { GraphView } from '../graph.js';
import { TreesView } from '../trees.js';
import { Terminal } from '../terminal.js';
import { openSurgeon, openRebaseTodo, openEditor } from '../panels.js';
import { h, confirmModal, announce } from '../dom.js';
import { sandboxStore, historyStore, viewStore } from '../storage.js';
import { sfx } from '../sound.js';
import { ICON, setShapes, confetti } from './fx.js';
import { twig } from './twig.js';
import { runSequence, followUpSteps } from './complete.js';
import * as game from './game.js';
import { watchKeyboard, keepFocus } from './kb.js';
import { track } from '../analytics/track.js';

const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;
// the phone view switcher's segments (graph | split | terminal); 14px line icons in currentColor
const svg = (d) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const VIEWS = [
  ['graph', 'Graph', svg('<circle cx="3.5" cy="8" r="2"/><circle cx="12.5" cy="4" r="2"/><circle cx="12.5" cy="12" r="2"/><path d="M5.5 8h2.5M8 8c0-2.4 1.6-4 2.5-4M8 8c0 2.4 1.6 4 2.5 4"/>')],
  ['split', 'Split', svg('<rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M2 8h12"/>')],
  ['term', 'Terminal', svg('<rect x="1.5" y="2.5" width="13" height="11" rx="2.5"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3.5"/>')],
];

// opts: { unitTitle, treesOpen, onExit(popNodeId?), onAgain() }
export function renderChallenge(root, level, opts = {}) {
  setShapes('challenge');
  document.title = `${level.title} · ${APP.name}`;
  let repo, moves = 0, hintsShown = 0, completed = false, bisectTests = 0, autoSurgeon = false, showGhosts = true;
  let treesOpen = !!opts.treesOpen;
  const typedHere = new Set(); // commands run on this screen (the chips prefer the ones not used yet)

  const makeRepo = () => {
    if (level.sandbox) {
      const saved = sandboxStore.load();
      if (saved && saved.commits) { try { return new Repo(saved); } catch { /* fresh */ } }
    }
    return buildRepo(level);
  };
  repo = makeRepo();

  /* ---- header */
  const movesPill = h('span', { class: 'tag-pill mono moves-pill' });
  const back = h('button', { class: 'icon-btn round quit', 'aria-label': 'Back to the path', html: ICON.close(), onclick: () => leave() });
  const head = h('header', { class: 'ch-top' }, back,
    h('div', { class: 'ch-title' },
      h('span', { class: 'mono tiny' }, (level.arcade ? 'PRACTICE' : opts.unitTitle ? `${opts.unitTitle.toUpperCase()} · CHALLENGE` : 'CHALLENGE') + (level.sandbox ? '' : ` · ${KINDS[level.kind]?.label.toUpperCase() || ''}`)),
      h('h1', {}, level.title)),
    level.sandbox ? null : movesPill,
    level.sandbox ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => restart() }, 'Reset sandbox')
      : h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Restart', onclick: () => restart() }, '↻', h('span', { class: 'wide-l' }, ' Restart')),
    level.arcade && !level.sandbox ? h('button', { class: 'btn small dark', type: 'button', onclick: () => opts.onAgain?.() }, 'New history') : null);

  /* ---- goal card */
  const checklist = h('ul', { class: 'checklist' });
  const hintList = h('ol', { class: 'hints' });
  const hintBtn = h('button', { class: 'btn small ghost hint-btn', type: 'button', onclick: () => { if (hintsShown < level.hints.length) { hintsShown++; sfx.tap(); drawHints(); } } });
  const drawHints = () => {
    hintList.replaceChildren(...level.hints.slice(0, hintsShown).map((t) => h('li', { html: t })));
    hintBtn.textContent = hintsShown >= level.hints.length ? 'No more hints' : hintsShown ? `Another hint (${hintsShown}/${level.hints.length})` : 'Need a hint?';
    hintBtn.disabled = hintsShown >= level.hints.length;
  };
  if (level.sandbox) hintsShown = level.hints.length;
  let targetBox = null;
  if (level.target) {
    targetBox = h('div', { class: 'target' }, h('span', { class: 'tag-pill mono' }, 'TARGET SHAPE'));
    const tg = new GraphView(targetBox, { mini: true });
    try { tg.render(targetGraph(level), { animate: false, showGhosts: false }); } catch { targetBox = null; }
  }
  const movesPill2 = h('span', { class: 'tag-pill mono moves-pill phone-only' }); // phones: the count lives in the goal sheet
  const goalCard = h('section', { class: 'card goal-card' },
    h('div', { class: 'goal-tags' }, h('span', { class: 'tag-pill mono goal-tag' }, level.sandbox ? 'THINGS TO TRY' : 'GOAL'), level.sandbox ? null : movesPill2),
    h('p', { class: 'goal-text', id: 'ch-goal', html: level.goal }),
    level.sandbox ? null : checklist,
    targetBox);
  // the concept and the hints share one quiet card: two collapsed rows under the goal
  const conceptCard = h('details', { class: 'concept', open: !!opts.conceptOpen && !narrow() },
    h('summary', {}, h('span', {}, 'What\'s going on here?'), h('span', { class: 'chev', 'aria-hidden': 'true' }, '+')),
    h('p', { html: level.concept }));
  const hintCard = h('section', { class: 'hint-card', 'aria-label': 'Hints' },
    level.sandbox ? h('h2', {}, 'Hints') : hintBtn, hintList);
  const helpCard = h('div', { class: 'card ch-help' }, conceptCard, hintCard);

  /* ---- graph, terminal, trees */
  const graphScroll = h('div', { class: 'graph-scroll' });
  const treesToggle = h('button', { class: 'btn small ghost trees-toggle', type: 'button', 'aria-expanded': String(treesOpen), onclick: () => toggleTrees() });
  // the graph is the hero: no title bar; the legend and the orphans switch wait behind a small "?"
  const graphCard = h('section', { class: 'card graph-card', 'aria-label': 'Commit graph' },
    h('details', { class: 'graph-key' },
      h('summary', { 'aria-label': 'Graph key and options', title: 'Graph key and options' }, '?'),
      h('div', { class: 'graph-key-body' },
        h('span', { class: 'legend-inline' }, h('i', { class: 'lg cur' }), 'HEAD', h('i', { class: 'lg rem' }), 'origin', h('i', { class: 'lg tag' }), 'tag'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { showGhosts = e.target.checked; refresh(); } }), ' show orphaned commits'))),
    graphScroll);
  const termCard = h('section', { class: 'term-card', 'aria-label': 'Terminal' });
  const treesBody = h('div', { class: 'trees' });
  const treesCard = h('section', { class: 'card trees-card' + (treesOpen ? '' : ' hidden'), 'aria-label': 'Three trees' },
    h('div', { class: 'card-head' }, h('h2', { class: 'h3' }, 'The three trees'), h('span', { class: 'muted small' }, 'tap a file to expand')), treesBody);
  const toggleTrees = () => {
    treesOpen = !treesOpen;
    treesCard.classList.toggle('hidden', !treesOpen);
    treesToggle.setAttribute('aria-expanded', String(treesOpen));
    treesToggle.textContent = treesOpen ? 'Hide the three trees' : 'Show the three trees';
    if (treesOpen) trees.render(repo);
  };
  treesToggle.textContent = treesOpen ? 'Hide the three trees' : 'Show the three trees';

  /* ---- phones: the work area (graph + terminal) is one screen tall and shows the graph, both stacked, or the
     terminal (.notes/learn-git-v2-ui.md, "Phone view switcher"); desktop keeps the side-by-side layout */
  let view = ['graph', 'split', 'term'].includes(viewStore.load()) ? viewStore.load() : 'split';
  const work = h('div', { class: 'ch-work', 'data-view': view }, graphCard, termCard);
  const segs = VIEWS.map(([id, label, icon]) => keepFocus(h('button', { class: 'vs-seg', type: 'button', 'data-view': id, 'aria-pressed': String(id === view), 'aria-label': `${label} view`, onclick: () => setView(id, true) },
    h('span', { class: 'vs-ic', html: icon }), h('span', { class: 'vs-l' }, label))));
  const switcher = h('div', { class: 'view-switch', role: 'group', 'aria-label': 'Work area view' }, segs);
  switcher.addEventListener('keydown', (e) => { // arrows move between the segments (Tab still reaches each one)
    const i = segs.indexOf(document.activeElement), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (i < 0 || !d) return;
    e.preventDefault(); segs[(i + d + segs.length) % segs.length].focus();
  });
  // phones: the goal is this one line; a tap unfolds the goal, concept and hints as a sheet over the work area
  // (without closing the keyboard if it is up)
  const goalMini = keepFocus(h('button', { class: 'goal-mini', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ch-goal-sheet', onclick: () => peek(!screen.classList.contains('goal-peek')) },
    h('span', { class: 'gm-tag mono' }, level.sandbox ? 'TRY' : 'GOAL'), h('span', { class: 'gm-text' }), h('span', { class: 'gm-n mono' }), h('span', { class: 'chev', 'aria-hidden': 'true' }, '+')));
  const peek = (on) => { screen.classList.toggle('goal-peek', on); goalMini.setAttribute('aria-expanded', String(on)); };
  goalMini.querySelector('.gm-text').textContent = h('div', { html: level.goal }).textContent;
  const workBar = h('div', { class: 'ch-workbar' }, goalMini, switcher);
  const pane = h('div', { class: 'ch-pane' }, workBar, work);
  function setView(v, chosen = false) {
    if (v === view && !chosen) return;
    view = v;
    work.dataset.view = v;
    segs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    viewStore.save(v);
    if (chosen) peek(false);
    requestAnimationFrame(() => { graph.zoom?.refresh(); graph.autoscroll(graph.target); });
  }

  const left = h('div', { class: 'ch-left', id: 'ch-goal-sheet' }, goalCard, helpCard);
  const right = h('div', { class: 'ch-right' }, pane, h('div', { class: 'trees-row' }, treesToggle), treesCard);
  const screen = h('div', { class: 'challenge' + (level.sandbox ? ' sandbox' : '') }, head, h('main', { class: 'ch-grid' }, left, right));
  root.replaceChildren(screen);

  // typing needs the terminal: a commit tapped in Graph view, a key pressed, or the input focused brings back Split
  const toTyping = () => { if (view === 'graph' && narrow()) setView('split'); };
  // zoomable graph (pinch, ctrl+wheel, − + fit); fitted to its pane by default. In the phone Split view the graph
  // pane is sized to the fitted graph, so the room to fit into is half the work area, not the pane itself.
  const splitRoom = () => {
    if (!narrow() || view !== 'split') return null;
    const cs = getComputedStyle(graphCard);
    const gap = parseFloat(getComputedStyle(work).rowGap) || 0, termMin = parseFloat(getComputedStyle(termCard).minHeight) || 0;
    const room = Math.min((work.clientHeight - gap) * 0.5, work.clientHeight - gap - termMin);
    return { w: graphScroll.clientWidth, h: room - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) };
  };
  const graph = new GraphView(graphScroll, {
    onCommitClick: (id) => { toTyping(); term.insertWord(id); },
    zoom: { key: level.sandbox ? 'sandbox' : level.arcade ? 'bisect' : 'challenge:' + level.id, host: graphCard, keepFocus,
      box: () => splitRoom() || { w: graphScroll.clientWidth, h: graphRoomH() } },
  });
  function graphRoomH() { const mh = parseFloat(getComputedStyle(graphScroll).maxHeight); return mh > 0 && graphScroll.clientHeight >= mh - 2 ? mh : graphScroll.clientHeight; }
  const trees = new TreesView(treesBody, { onConflict: () => surgeon() });
  const term = new Terminal(termCard, {
    onCommand: (cmd) => runCommand(cmd, false),
    getCompletions: () => repo.completions(),
    history: historyStore.load(),
    onHistory: (hist) => historyStore.save(hist),
  });
  drawHints();
  // the terminal takes the focus on a desktop: the goal is its description, so a screen reader hears the task first
  term.input.setAttribute('aria-describedby', `ch-goal ${term.input.getAttribute('aria-describedby') || ''}`.trim());
  term.input.addEventListener('focus', () => { toTyping(); peek(false); });
  work.addEventListener('pointerdown', () => { if (screen.classList.contains('goal-peek')) peek(false); });
  if (narrow() && !level.sandbox) peek(true); // a challenge opens with its goal showing
  const kb = watchKeyboard(screen, { onChange: (on) => {
    requestAnimationFrame(() => { graph.zoom?.refresh(); graph.autoscroll(graph.target); term.scroll(); });
  } });

  /* ---- actions (same wiring as v1) */
  function act(fn) { const before = repo.fingerprint(); const res = fn(); if (repo.fingerprint() !== before) moves++; return res; }
  function handle(res) {
    term.print(res.lines);
    for (const ev of res.events || []) {
      if (ev.type === 'clear') term.clear();
      if (ev.type === 'edit') editor(ev.path);
      if (ev.type === 'rebase-todo') rebaseTodo();
    }
  }
  const hasMarkers = () => Object.values(repo.s.work).some((t) => /^<{7} /m.test(t));
  function runCommand(cmd, echo = true) {
    if (echo) term.echo(cmd);
    typedHere.add(cmd.trim());
    const hadMarkers = hasMarkers();
    const res = act(() => repo.run(cmd));
    handle(res);
    if (!hadMarkers && hasMarkers()) {
      if (!treesOpen) toggleTrees();
      if (level.kind === 'conflict' && !autoSurgeon) { autoSurgeon = true; setTimeout(() => surgeon(), 450); }
      else term.note('Tip: the Conflict surgeon (in the three-trees panel) resolves this hunk by hunk.');
    }
    refresh();
  }
  function surgeon() {
    openSurgeon(repo, {
      inRebase: repo.s.seq?.kind === 'rebase',
      onSave: (path, content, add) => {
        act(() => { repo.s.work[path] = content; });
        term.note(`(conflict surgeon) wrote ${path}`);
        if (add) runCommand(`git add ${path}`); else refresh();
      },
    });
  }
  function rebaseTodo() {
    openRebaseTodo(repo, {
      onStart: (todo) => { const res = act(() => repo.rebaseTodoApply(todo)); term.print([{ t: '(rebase todo) ' + todo.map((t) => `${t.action} ${t.id}`).join(' · '), c: 'hint' }]); handle(res); refresh(); return res; },
      onCancel: () => { repo.rebaseTodoCancel(); term.note('Interactive rebase cancelled; nothing changed.'); refresh(); },
    });
  }
  function editor(path) {
    openEditor(path, repo.s.work[path] ?? '', { onSave: (text) => { act(() => { repo.s.work[path] = norm(text); }); term.note(`(editor) saved ${path}`); refresh(); } });
  }
  function restart() {
    if (level.sandbox) sandboxStore.clear();
    repo = buildRepo(level);
    moves = 0; completed = false; bisectTests = 0; autoSurgeon = false;
    term.clear(); intro(); refresh(false);
  }
  function intro() { term.note(level.sandbox ? 'Sandbox ready. Type help to list commands.' : 'Type git status to look around, or help for commands.'); }
  function prompt() {
    const b = repo.branchName() || `HEAD ${repo.headId() || ''}`.trim();
    const op = repo.inProgress();
    const extra = repo.s.seq?.kind === 'rebase' ? '|REBASE' : op === 'merge' ? '|MERGING' : op === 'cherry-pick' ? '|CHERRY-PICKING' : op === 'revert' ? '|REVERTING' : op === 'bisect' ? '|BISECTING' : '';
    return `(${b}${extra}) $`;
  }
  // The level's chips, the ones that fit the moment first: during a bisect the verdicts, during a merge, rebase or
  // pick the resolve/continue/abort ones, otherwise the ones not used yet. Only the first three show inline.
  function contextChips() {
    const list = level.chips || ['git status'];
    const used = typedHere;
    const op = repo.s.bisect ? 'bisect' : repo.inProgress();
    const fits = (c) => op === 'bisect' ? /bisect (good|bad)|run-tests/.test(c)
      : op ? /--continue|--abort|--skip|\bgit (add|status|diff)\b/.test(c)
      : !used.has(c.trim());
    return [...list.filter(fits), ...list.filter((c) => !fits(c))];
  }
  let lastOk = 0, doneLabels = new Set();
  function refresh(animate = true) {
    graph.render(repo.graphData(), { animate, showGhosts });
    if (treesOpen) trees.render(repo);
    term.setPrompt(prompt());
    const names = [...Object.keys(repo.s.branches), ...Object.keys(repo.s.tags)].slice(0, 8);
    term.setChips([...contextChips(), ...names.map((n) => ({ label: n, insert: n, word: true }))], { inline: narrow() ? 2 : 3 });
    if (repo.s.bisect) bisectTests = Math.max(bisectTests, repo.s.bisect.steps);
    if (level.sandbox) { sandboxStore.save(repo.s); return; }
    const results = level.check(repo);
    const okCount = results.filter(([, ok]) => ok).length;
    goalMini.querySelector('.gm-n').textContent = results.length ? `${okCount}/${results.length}` : '';
    checklist.replaceChildren(...results.map(([label, ok]) => h('li', { class: ok ? 'ok' : '' }, h('span', { class: 'tick', html: ok ? ICON.check() : '' }), h('span', {}, label), h('span', { class: 'sr-only' }, ok ? ' (done)' : ' (not yet)'))));
    if (animate && okCount > lastOk) {
      sfx.pop();
      // after the terminal output has been read: which goal just got ticked
      const fresh = results.filter(([, ok]) => ok).map(([l]) => l).filter((l) => !doneLabels.has(l));
      if (fresh.length && okCount < results.length) setTimeout(() => announce(`Goal ${okCount} of ${results.length} done: ${fresh.join(', ')}.`), 400);
    }
    doneLabels = new Set(results.filter(([, ok]) => ok).map(([l]) => l));
    lastOk = okCount;
    movesPill.textContent = movesPill2.textContent = level.kind === 'bisect' ? `${bisectTests} TESTS · ${moves} MOVES` : `${moves} MOVES · PAR ${parOf(level)}`;
    if (!completed && results.length && results.every(([, ok]) => ok)) { completed = true; setTimeout(() => complete(), 650); }
  }

  function complete() {
    let stars, line;
    if (level.arcade) {
      const optimal = Math.ceil(Math.log2(Object.keys(repo.s.commits).length));
      stars = bisectTests <= optimal ? 3 : bisectTests <= optimal + 2 ? 2 : 1;
      const best = game.recordBisectScore(bisectTests);
      line = `You gave ${bisectTests} verdicts (binary search needs about ${optimal}).${best ? ' New best!' : ''}`;
    } else {
      stars = starsFor(level, moves, hintsShown);
      game.completeChallenge(level.id, stars);
      track('challenge_done', { level: level.id, stars, moves, hints: hintsShown });
      line = `${moves} moves, par ${parOf(level)}${hintsShown >= level.hints.length ? ' · all hints used (max 2 stars)' : ''}`;
    }
    const xp = level.arcade ? 5 + stars * 3 : game.XP.challenge[stars];
    const xpEvent = game.addXp(xp);
    cleanup();
    const first = () => {
      setShapes('celebrate');
      const t = twig({ mood: 'cheer', size: 130, text: stars === 3 ? 'Three stars. Textbook git.' : 'Solved! Fewer moves next time for more stars.' });
      const starEls = [1, 2, 3].map((i) => h('span', { class: 'big-star' + (i <= stars ? ' on' : ''), html: ICON.star() }));
      return {
        el: h('div', { class: 'cel-body' }, t.el,
          h('h1', { class: 'cel-title' }, level.arcade ? 'Bug found!' : 'Challenge complete!'),
          h('div', { class: 'star-row' }, starEls, h('span', { class: 'sr-only' }, `${stars} of 3 stars`)),
          h('div', { class: 'stat-row' }, h('div', { class: 'stat-card c-yellow' }, h('span', { class: 'stat-label mono' }, 'XP'), h('div', { class: 'stat-val' }, `+${xpEvent.gained}`))),
          h('p', { class: 'cel-sub mono small' }, line),
          level.debrief ? h('div', { class: 'card debrief' }, h('span', { class: 'tag-pill mono' }, 'WHAT YOU JUST LEARNED'), h('p', { html: level.debrief })) : null),
        onShow: () => {
          sfx.complete();
          starEls.forEach((s, i) => { s.style.animationDelay = 300 + i * 220 + 'ms'; });
          setTimeout(() => confetti(t.el.querySelector('.twig'), { count: 48 }), 200);
        },
      };
    };
    const { steps } = followUpSteps({ xpEvent });
    runSequence(root, [first, ...steps], () => opts.onExit?.(true));
  }

  async function leave() {
    if (!completed && moves > 0 && !level.sandbox) {
      const ok = await confirmModal('Leave this challenge?', 'Your repo resets next time you open it.', { ok: 'Leave', cancel: 'Stay', danger: true });
      if (!ok) return;
    }
    opts.onExit?.(false);
  }

  intro();
  refresh(false);
  if (finePointer()) term.focus();
  const onKey = (e) => {
    if (e.target === document.body && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('.modal-wrap')) { toTyping(); term.focus(); }
  };
  document.addEventListener('keydown', onKey);
  const cleanup = () => { document.removeEventListener('keydown', onKey); kb.destroy(); };
  return cleanup;
}
