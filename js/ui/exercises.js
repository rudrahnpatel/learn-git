// Renderers for every exercise type in the schema (.notes/game-design.md). Each returns
//   { el, ready(), grade() -> { ok, answer }, key(e) -> handled, lock(), learn?, focus? }
// The lesson player owns the Check button and the feedback sheet; ctx.onChange() tells it the
// answer state changed, ctx.submit() asks it to check now (match does that when all pairs pop).
import { h, esc, announce } from '../dom.js';
import { Repo } from '../git.js';
import { GraphView } from '../graph.js';
import { Terminal, phone } from '../terminal.js';
import { sfx } from '../sound.js';
import { shake, reducedMotion } from './fx.js';
import { keepFocus } from './kb.js';

const richRe = /<\/?(code|b|i|em|strong|br|kbd)\b/i;
const rich = (s) => (richRe.test(String(s)) ? { html: String(s) } : {});
const text = (s) => (richRe.test(String(s)) ? null : String(s));
function richEl(tag, attrs, s) { return h(tag, { ...attrs, ...rich(s) }, text(s)); }

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function shuffledIdx(n, avoidIdentity = true) {
  const idx = shuffle([...Array(n).keys()]);
  if (avoidIdentity && n > 1 && idx.every((v, i) => v === i)) [idx[0], idx[1]] = [idx[1], idx[0]];
  return idx;
}
const digit = (e) => (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey ? Number(e.key) - 1 : -1);
const prompt = (ex) => richEl('h2', { class: 'ex-prompt', id: 'ex-prompt' }, ex.prompt || '');
// Screen-reader text (accessibility pass): the keyboard-shortcut badges are visual only, and the green/pink marks
// after grading also say "correct answer" / "your answer, not right" in words.
const sr = (t) => h('span', { class: 'sr-only' }, t);
const keyBadge = (cls, k) => h('span', { class: cls, 'aria-hidden': 'true' }, k);
const mark = (el, t) => {
  if (!el || el.dataset.marked) return;
  el.dataset.marked = '1';
  if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', `${el.getAttribute('aria-label')} (${t})`);
  else el.append(h('span', { class: 'sr-only' }, ` (${t})`));
};
const plain = (s) => String(s ?? '').replace(/<[^>]+>/g, '');
// After a click removes or disables the focused control, the focus moves to the next sensible one instead of
// dropping to the page.
const focusFirst = (...els) => { const t = els.flat().find((b) => b && b.isConnected && !b.disabled && b.getClientRects().length); t?.focus({ preventScroll: true }); return !!t; };

export function buildRepo(setup) {
  const r = new Repo();
  if (setup) setup(r);
  r.setupDone();
  return r;
}
export function graphAfter(setup, cmds) {
  const r = buildRepo(setup);
  for (const c of cmds) r.run(c);
  return r.graphData();
}
export function miniGraph(data, { size = 'mid', cls = '' } = {}) {
  const box = h('div', { class: 'mini-graph ' + cls });
  const g = new GraphView(box, { size });
  try { g.render(data, { animate: false, showGhosts: true }); } catch { box.textContent = '(graph unavailable)'; }
  return box;
}

/* ================================================================ learn */
function learn(ex) {
  const parts = [h('div', { class: 'learn-card card' },
    h('span', { class: 'tag-pill mono' }, 'NEW IDEA'),
    richEl('h2', { class: 'learn-title' }, ex.title || ''),
    h('div', { class: 'learn-body', html: ex.body || '' }))];
  let timers = [];
  if (ex.demo && ex.demo.setup) {
    const stage = h('div', { class: 'demo-stage' });
    const cap = h('span', { class: 'demo-cap mono' }, 'BEFORE');
    const cmdEl = h('code', { class: 'demo-cmd' }, ' ');
    const replay = h('button', { class: 'btn ghost small replay', type: 'button', 'aria-label': 'Replay the demo', onclick: () => play() }, '↻', h('span', { class: 'replay-t' }, ' Replay'));
    const treesBox = h('div', { class: 'demo-trees' });
    const demo = h('div', { class: 'demo card' }, h('div', { class: 'demo-head' }, cap, cmdEl, replay), stage, treesBox);
    parts.push(demo);
    const graph = new GraphView(stage, { size: 'mid', animated: true });
    const runs = ex.demo.run || [];
    const play = () => {
      timers.forEach(clearTimeout); timers = [];
      let r;
      try { r = buildRepo(ex.demo.setup); } catch (e) { stage.textContent = 'demo failed: ' + e.message; return; }
      graph.disp = { nodes: {}, labels: {} };
      graph.render(r.graphData(), { animate: false, showGhosts: false });
      treesBox.replaceChildren(compactTrees(r));
      cap.textContent = 'BEFORE'; cap.className = 'demo-cap mono';
      cmdEl.textContent = runs.length ? '$ ' : '';
      let t = 700;
      runs.forEach((cmd, i) => {
        const full = '$ ' + cmd;
        const speed = reducedMotion() ? 0 : 28;
        for (let k = 3; k <= full.length; k++) timers.push(setTimeout(() => { cmdEl.textContent = full.slice(0, k); }, t + (k - 3) * speed));
        t += full.length * speed + 250;
        timers.push(setTimeout(() => {
          r.run(cmd);
          graph.render(r.graphData(), { animate: true, showGhosts: false });
          treesBox.replaceChildren(compactTrees(r));
          treesBox.classList.remove('flash'); void treesBox.offsetWidth; treesBox.classList.add('flash');
          if (i === runs.length - 1) { cap.textContent = 'AFTER'; cap.className = 'demo-cap mono after'; }
          sfx.pop();
        }, t));
        t += 900;
      });
    };
    setTimeout(play, 50);
  }
  return {
    el: h('div', { class: 'ex ex-learn' }, ...parts),
    learn: true, ready: () => true, grade: () => ({ ok: true }), key: () => false, lock() {},
    destroy() { timers.forEach(clearTimeout); },
  };
}

/* ================================================================ choice */
function optionList(options, onPick, { cls = '' } = {}) {
  let sel = -1;
  const btns = options.map((o, i) => h('button', { class: 'opt ' + cls, type: 'button', 'aria-pressed': 'false', onclick: () => pick(i) },
    keyBadge('key mono', String(i + 1)), richEl('span', { class: 'opt-t' }, o)));
  const pick = (i) => {
    if (list.classList.contains('locked') || i < 0 || i >= btns.length) return;
    sel = i;
    btns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    sfx.tap();
    onPick(i);
  };
  const list = h('div', { class: 'opts', role: 'group', 'aria-labelledby': 'ex-prompt' }, btns);
  return { list, btns, pick, get sel() { return sel; } };
}
function choice(ex, ctx) {
  const ol = optionList(ex.options, () => ctx.onChange());
  return {
    el: h('div', { class: 'ex ex-choice' }, prompt(ex), ex.code ? h('pre', { class: 'code-block' }, ex.code) : null, ol.list),
    ready: () => ol.sel >= 0,
    grade: () => {
      const ok = ol.sel === ex.answer;
      ol.btns[ex.answer]?.classList.add('right');
      mark(ol.btns[ex.answer], ok ? 'your answer, correct' : 'correct answer');
      if (!ok) { ol.btns[ol.sel]?.classList.add('wrong'); mark(ol.btns[ol.sel], 'your answer, not right'); }
      return { ok, answer: ex.options[ex.answer] };
    },
    key: (e) => { const d = digit(e); if (d >= 0 && d < ex.options.length) { ol.pick(d); return true; } return false; },
    lock: () => ol.list.classList.add('locked'),
  };
}

/* ================================================================ fill */
function fill(ex, ctx) {
  const blank = h('span', { class: 'blank' }, ' ', sr('(blank)'));
  const ol = optionList(ex.options, (i) => { blank.textContent = ex.options[i].replace(/<[^>]+>/g, ''); blank.classList.add('filled'); blank.classList.remove('pop'); void blank.offsetWidth; blank.classList.add('pop'); ctx.onChange(); }, { cls: 'pill-opt' });
  ol.list.classList.add('opts-row');
  return {
    el: h('div', { class: 'ex ex-fill' }, prompt(ex),
      h('pre', { class: 'code-block fill-line' }, ex.before || '', blank, ex.after || ''), ol.list),
    ready: () => ol.sel >= 0,
    grade: () => {
      const ok = ol.sel === ex.answer;
      blank.classList.add(ok ? 'right' : 'wrong');
      mark(ol.btns[ex.answer], ok ? 'your answer, correct' : 'correct answer');
      if (!ok) mark(ol.btns[ol.sel], 'your answer, not right');
      return { ok, answer: `${ex.before || ''}${String(ex.options[ex.answer]).replace(/<[^>]+>/g, '')}${ex.after || ''}`.trim(), mono: true };
    },
    key: (e) => { const d = digit(e); if (d >= 0 && d < ex.options.length) { ol.pick(d); return true; } return false; },
    lock: () => ol.list.classList.add('locked'),
  };
}

/* ======================================================= build (tiles) */
function build(ex, ctx) {
  const order = shuffledIdx(ex.tiles.length, false);
  const placed = []; // tile indexes in answer order
  let locked = false;
  // keyboard and screen readers: every tile is a real button; a used tile is disabled, the focus moves on to the
  // next free tile (or back to the bank when a tile is taken out), and the answer so far is read out
  const line = h('div', { class: 'build-line', role: 'group', 'aria-label': 'Your answer' });
  const bankBtns = {};
  const bank = h('div', { class: 'bank', role: 'group', 'aria-label': 'Tiles' }, order.map((ti, pos) => {
    const b = h('button', { class: 'tile mono', type: 'button', onclick: () => add(ti) }, h('span', { class: 'tk mono', 'aria-hidden': 'true' }, pos < 9 ? String(pos + 1) : ''), ex.tiles[ti]);
    bankBtns[ti] = b;
    return b;
  }));
  const said = () => announce(placed.length ? `Your answer: ${tokens().join(' ')}` : 'Your answer is empty');
  const draw = () => {
    line.replaceChildren(...placed.map((ti, k) => h('button', { class: 'tile mono in', type: 'button', 'aria-label': `${ex.tiles[ti]}, tile ${k + 1} of your answer. Press to take it out.`, onclick: () => removeAt(k) }, ex.tiles[ti])));
    if (!placed.length) line.append(h('span', { class: 'build-hint' }, 'Tap the tiles to build the command'));
    for (const [ti, b] of Object.entries(bankBtns)) { const used = placed.includes(Number(ti)); b.classList.toggle('used', used); b.disabled = used || locked; }
    ctx.onChange();
  };
  const seq = order.map((ti) => bankBtns[ti]); // bank buttons in screen order
  const add = (ti) => {
    if (locked || placed.includes(ti)) return;
    const had = document.activeElement === bankBtns[ti];
    placed.push(ti); sfx.tap(); draw(); line.lastElementChild?.classList.add('pop'); said();
    const i = order.indexOf(ti);
    if (had) focusFirst(seq.slice(i + 1), seq.slice(0, i), document.querySelector('.lesson-foot .check'));
  };
  const removeAt = (k) => {
    if (locked) return;
    const had = line.contains(document.activeElement);
    const ti = placed[k];
    placed.splice(k, 1); sfx.tap(); draw(); said();
    if (had) focusFirst(bankBtns[ti]);
  };
  draw();
  const tokens = () => placed.map((ti) => ex.tiles[ti]);
  return {
    el: h('div', { class: 'ex ex-build' }, prompt(ex), line, bank),
    ready: () => placed.length > 0,
    grade: () => {
      const t = tokens();
      const ok = (ex.answers || []).some((a) => a.length === t.length && a.every((x, i) => x === t[i]));
      line.classList.add(ok ? 'right' : 'wrong');
      return { ok, answer: (ex.answers?.[0] || []).join(' '), mono: true };
    },
    key: (e) => {
      const d = digit(e);
      if (d >= 0 && d < order.length) { add(order[d]); return true; }
      if (e.key === 'Backspace' && placed.length) { removeAt(placed.length - 1); return true; }
      return false;
    },
    lock: () => { locked = true; bank.classList.add('locked'); },
  };
}

/* ================================================================ order */
function order(ex, ctx) {
  const n = ex.steps.length;
  const bankOrder = shuffledIdx(n);
  const placed = [];
  let locked = false;
  // same keyboard model as build: used steps are disabled and the focus moves to the next free one
  const list = h('ol', { class: 'order-list', 'aria-label': 'Your order' });
  const bankBtns = {};
  const bank = h('div', { class: 'order-bank', role: 'group', 'aria-label': 'Steps to place' }, bankOrder.map((si, pos) => {
    const b = h('button', { class: 'step-card', type: 'button', onclick: () => add(si) }, keyBadge('key mono', String(pos + 1)), richEl('span', {}, ex.steps[si]));
    bankBtns[si] = b; return b;
  }));
  const draw = () => {
    list.replaceChildren(...Array.from({ length: n }, (_, k) => {
      const si = placed[k];
      return si === undefined
        ? h('li', { class: 'slot empty' }, h('span', { class: 'num mono', 'aria-hidden': 'true' }, String(k + 1)), sr('empty'))
        : h('li', { class: 'slot' }, h('button', { class: 'step-card in', type: 'button', 'aria-label': `${k + 1}: ${plain(ex.steps[si])}. Press to take it out.`, onclick: () => removeAt(k) }, h('span', { class: 'num mono' }, String(k + 1)), richEl('span', {}, ex.steps[si])));
    }));
    for (const [si, b] of Object.entries(bankBtns)) { const used = placed.includes(Number(si)); b.classList.toggle('used', used); b.disabled = used || locked; }
    ctx.onChange();
  };
  const seq = bankOrder.map((si) => bankBtns[si]);
  const add = (si) => {
    if (locked || placed.includes(si)) return;
    const had = document.activeElement === bankBtns[si];
    placed.push(si); sfx.tap(); draw(); list.children[placed.length - 1]?.classList.add('pop');
    announce(`Step ${placed.length}: ${plain(ex.steps[si])}`);
    const i = bankOrder.indexOf(si);
    if (had) focusFirst(seq.slice(i + 1), seq.slice(0, i), document.querySelector('.lesson-foot .check'));
  };
  const removeAt = (k) => {
    if (locked) return;
    const had = list.contains(document.activeElement), si = placed[k];
    placed.splice(k, 1); sfx.tap(); draw();
    announce(`Took out ${plain(ex.steps[si])}. ${placed.length} of ${n} placed.`);
    if (had) focusFirst(bankBtns[si]);
  };
  draw();
  return {
    el: h('div', { class: 'ex ex-order' }, prompt(ex), list, bank),
    ready: () => placed.length === n,
    grade: () => {
      const ok = placed.every((si, k) => si === k);
      [...list.children].forEach((li, k) => { li.classList.add(placed[k] === k ? 'right' : 'wrong'); mark(li.querySelector('button'), placed[k] === k ? 'right place' : 'wrong place'); });
      return { ok, answer: ex.steps.map((s, i) => `${i + 1}. ${String(s).replace(/<[^>]+>/g, '')}`).join('   ') };
    },
    key: (e) => {
      const d = digit(e);
      if (d >= 0 && d < n) { add(bankOrder[d]); return true; }
      if (e.key === 'Backspace' && placed.length) { removeAt(placed.length - 1); return true; }
      return false;
    },
    lock: () => { locked = true; bank.classList.add('locked'); },
  };
}

/* ================================================================ match */
function match(ex, ctx) {
  const pairs = ex.pairs;
  const L = shuffledIdx(pairs.length, false), R = shuffledIdx(pairs.length);
  let selL = null, selR = null, wrongs = 0, matched = 0, locked = false;
  const lb = {}, rb = {};
  const tryPair = () => {
    if (selL == null || selR == null) return;
    const a = lb[selL], b = rb[selR];
    const had = document.activeElement === a || document.activeElement === b;
    const sel = (x, on) => { x.classList.toggle('sel', on); x.setAttribute('aria-pressed', String(on)); };
    if (selL === selR) {
      a.classList.add('matched'); b.classList.add('matched'); a.disabled = b.disabled = true;
      sel(a, false); sel(b, false);
      mark(a, 'matched'); mark(b, 'matched');
      matched++; sfx.pop();
      announce(matched === pairs.length ? 'All pairs matched.' : `Matched: ${plain(pairs[selL][0])} with ${plain(pairs[selL][1])}. ${pairs.length - matched} left.`);
      if (matched === pairs.length) { ctx.onChange(); setTimeout(() => ctx.submit(), 380); }
      // the matched pair is disabled: carry the focus to the next open item on the left (or Check, at the end)
      if (had) focusFirst(L.map((i) => lb[i]), R.map((i) => rb[i]), document.querySelector('.lesson-foot .check'));
    } else {
      wrongs++;
      sfx.wrong();
      announce('Not a pair. Try again.');
      a.classList.add('bad'); b.classList.add('bad'); shake(a); shake(b);
      setTimeout(() => { a.classList.remove('bad'); b.classList.remove('bad'); sel(a, false); sel(b, false); }, 520);
    }
    selL = selR = null;
  };
  const mk = (side, i, label, k) => h('button', {
    class: 'match-btn', type: 'button', 'aria-pressed': 'false',
    onclick: (e) => {
      if (locked) return;
      const btn = e.currentTarget;
      const col = side === 'L' ? lb : rb;
      Object.values(col).forEach((x) => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
      if (side === 'L') selL = i; else selR = i;
      btn.classList.add('sel'); btn.setAttribute('aria-pressed', 'true'); sfx.tap();
      tryPair();
    },
  }, keyBadge('key mono', k), richEl('span', {}, label));
  const left = h('div', { class: 'match-col', role: 'group', 'aria-label': 'Left column' }, L.map((i, k) => (lb[i] = mk('L', i, pairs[i][0], String(k + 1)))));
  const right = h('div', { class: 'match-col', role: 'group', 'aria-label': 'Right column' }, R.map((i, k) => (rb[i] = mk('R', i, pairs[i][1], String.fromCharCode(97 + k)))));
  return {
    el: h('div', { class: 'ex ex-match' }, prompt(ex), h('div', { class: 'match-grid' }, left, right)),
    ready: () => matched === pairs.length,
    grade: () => ({ ok: wrongs < 2, answer: pairs.map(([a, b]) => `${String(a).replace(/<[^>]+>/g, '')} → ${String(b).replace(/<[^>]+>/g, '')}`).join(' · '), note: wrongs ? `${wrongs} slip${wrongs > 1 ? 's' : ''} on the way.` : '' }),
    key: (e) => {
      const d = digit(e);
      if (d >= 0 && d < pairs.length) { lb[L[d]].click(); return true; }
      const c = /^[a-e]$/.test(e.key) ? e.key.charCodeAt(0) - 97 : -1;
      if (c >= 0 && c < pairs.length) { rb[R[c]].click(); return true; }
      return false;
    },
    lock: () => { locked = true; },
  };
}

/* ================================================================ graph */
function graph(ex, ctx) {
  let start, correct;
  try {
    start = graphAfter(ex.setup, []);
    correct = graphAfter(ex.setup, [ex.command]);
  } catch (e) {
    return { el: h('div', { class: 'ex' }, prompt(ex), h('p', {}, 'This exercise failed to build: ' + e.message)), ready: () => true, grade: () => ({ ok: true }), key: () => false, lock() {} };
  }
  const seen = new Set([JSON.stringify(correct)]);
  const opts = [{ data: correct, ok: true }];
  for (const d of ex.distractors || []) {
    try {
      const g = graphAfter(ex.setup, d);
      const k = JSON.stringify(g);
      if (!seen.has(k)) { seen.add(k); opts.push({ data: g, ok: false }); }
    } catch { /* skip a broken distractor */ }
  }
  shuffle(opts);
  const right = opts.findIndex((o) => o.ok);
  const ol = optionList(opts.map(() => ''), () => ctx.onChange(), { cls: 'graph-opt' });
  // each option is read as "Graph n" plus the graph's text summary (js/graph.js describeGraph)
  ol.btns.forEach((b, i) => { b.querySelector('.opt-t').replaceWith(sr(`Graph ${i + 1}: `), miniGraph(opts[i].data, { size: 'mid' })); b.__ok = opts[i].ok; });
  ol.list.classList.add('graph-opts', 'n' + opts.length);
  return {
    el: h('div', { class: 'ex ex-graph' }, prompt(ex),
      h('div', { class: 'graph-start card' },
        h('div', { class: 'gs-col' }, h('span', { class: 'tag-pill mono' }, 'START'), miniGraph(start, { size: 'mid' })),
        h('div', { class: 'gs-arrow' }, sr('then run '), h('code', { class: 'cmd-pill' }, ex.command), h('span', { class: 'gs-arr', 'aria-hidden': 'true' }, '→'), h('span', { class: 'gs-q', 'aria-hidden': 'true' }, '?'))),
      h('p', { class: 'ex-sub' }, 'Pick the graph you end up with.'),
      ol.list),
    ready: () => ol.sel >= 0,
    grade: () => {
      const ok = ol.sel === right;
      ol.btns[right]?.classList.add('right');
      mark(ol.btns[right], ok ? 'your answer, correct' : 'correct answer');
      if (!ok) { ol.btns[ol.sel]?.classList.add('wrong'); mark(ol.btns[ol.sel], 'your answer, not right'); }
      return { ok, answer: `graph ${right + 1}` };
    },
    key: (e) => { const d = digit(e); if (d >= 0 && d < opts.length) { ol.pick(d); return true; } return false; },
    lock: () => ol.list.classList.add('locked'),
  };
}

/* ============================================================ type (live) */
function compactTrees(repo) {
  const rows = repo.treesView();
  const short = (t) => (t === undefined ? '—' : (t.replace(/\n$/, '').split('\n')[0] || '(empty)').slice(0, 16));
  if (!rows.length) return h('p', { class: 'ct-empty' }, 'No files yet.');
  return h('table', { class: 'ctrees' },
    h('thead', {}, h('tr', {}, h('th', {}, 'file'), h('th', {}, 'working'), h('th', {}, 'index'), h('th', {}, 'HEAD'))),
    h('tbody', {}, rows.map((r) => h('tr', {},
      h('td', { class: 'ct-name' }, r.path),
      h('td', { class: (r.untracked || r.modified ? 'diff' : '') + (r.conflict ? ' conflict' : '') }, short(r.work)),
      h('td', { class: r.staged ? 'diff' : '' }, r.untracked ? '—' : short(r.index)),
      h('td', {}, short(r.head))))));
}
function type(ex, ctx) {
  const MAX = 3;
  let repo, cmds = [], locked = false;
  const graphBox = h('div', { class: 'type-graph' });
  const zoomHost = h('div', { class: 'type-zoom' }); // the graph's − + fit buttons, in the card's corner
  const treesBox = h('div', { class: 'type-trees' });
  const termBox = h('div', { class: 'type-term' });
  const counter = h('span', { class: 'cmd-count mono' });
  // the files table folds away while every file is clean (the graph is the payoff then) and opens by itself as soon
  // as something is modified, staged or untracked; the player can toggle it either way
  let filesOpen = null;
  const filesBtn = h('button', { class: 'files-toggle mono', type: 'button', 'aria-expanded': 'false', onclick: () => { filesOpen = treesBox.hidden; drawFiles(); } });
  const drawFiles = () => {
    const rows = repo.treesView();
    const dirty = rows.some((r) => r.untracked || r.modified || r.staged || r.conflict);
    const open = filesOpen ?? dirty;
    treesBox.hidden = !open;
    filesBtn.setAttribute('aria-expanded', String(open));
    filesBtn.textContent = `files · ${rows.length ? (dirty ? 'changes' : 'all clean') : 'none yet'}`;
  };
  const g = new GraphView(graphBox, { size: 'mid', animated: true, zoom: { key: 'type', host: zoomHost, fitHeight: false, keepFocus } });
  const term = new Terminal(termBox, {
    onCommand: (c) => run(c), getCompletions: () => repo.completions(), history: [], onHistory: () => {},
  });
  term.input.placeholder = phone() ? 'git command…' : 'type a git command';
  term.input.setAttribute('aria-describedby', `ex-prompt type-count ${term.input.getAttribute('aria-describedby') || ''}`.trim());
  counter.id = 'type-count';
  treesBox.id = 'type-files';
  filesBtn.setAttribute('aria-controls', 'type-files');
  term.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !term.input.value.trim()) { e.preventDefault(); e.stopPropagation(); ctx.submit(); }
  });
  const refresh = (animate) => {
    g.render(repo.graphData(), { animate, showGhosts: true });
    treesBox.replaceChildren(compactTrees(repo));
    drawFiles();
    const b = repo.branchName() || 'HEAD';
    term.setPrompt(`(${b}) $`);
    // file and branch names wait behind one quiet chip (Tab completes them too)
    const words = [...Object.keys(repo.s.work), ...Object.keys(repo.s.branches)].slice(0, 6);
    term.setChips(words.map((w) => ({ label: w, insert: w, word: true })), { inline: 0, moreLabel: 'file/branch names' });
    counter.textContent = `${cmds.length}/${MAX} commands`;
  };
  const reset = () => {
    try { repo = buildRepo(ex.setup); } catch (e) { termBox.textContent = 'setup failed: ' + e.message; return; }
    cmds = []; term.clear(); term.input.disabled = false;
    g.disp = { nodes: {}, labels: {} };
    refresh(false);
    ctx.onChange();
  };
  const run = (c) => {
    if (locked || cmds.length >= MAX) return;
    const res = repo.run(c);
    cmds.push(c);
    term.print(res.lines);
    refresh(true);
    sfx.tap();
    if (cmds.length >= MAX) {
      const had = document.activeElement === term.input;
      term.input.disabled = true; term.note('That\'s 3 commands. Press Check.');
      if (had) setTimeout(() => document.querySelector('.lesson-foot .check')?.focus({ preventScroll: true }), 0); // the disabled input would drop it
    }
    ctx.onChange();
  };
  reset();
  return {
    el: h('div', { class: 'ex ex-type' }, prompt(ex),
      h('div', { class: 'type-grid' },
        h('div', { class: 'type-left card' }, zoomHost, graphBox,
          h('div', { class: 'mini-head' }, filesBtn), treesBox),
        h('div', { class: 'type-right' }, termBox,
          h('div', { class: 'type-meta' }, counter, h('button', { class: 'btn ghost small', type: 'button', onclick: () => { if (!locked) { reset(); term.focus(); announce('Repo reset to the start.'); } } }, h('span', { 'aria-hidden': 'true' }, '↻ '), 'Reset repo'))))),
    ready: () => cmds.length > 0,
    grade: () => {
      let ok = false;
      try { ok = !!ex.check(repo); } catch { ok = false; }
      return { ok, answer: ex.solution, mono: true, typed: true, note: ok ? null : nameSlip(ex.prompt, repo) };
    },
    key: () => false,
    lock: () => { locked = true; term.input.disabled = true; },
    // returns true when it took the focus (the lesson player focuses the prompt otherwise)
    focus: () => { if (!matchMedia('(pointer: fine)').matches) return false; term.focus(); return true; },
  };
}

const RENDERERS = { learn, choice, fill, build, order, match, graph, type };
export const TYPES = Object.keys(RENDERERS);
export function renderExercise(ex, ctx) {
  const f = RENDERERS[ex.type];
  if (f) { const r = f(ex, ctx); r.el.dataset.type = ex.type; r.el.__ex = ex; return r; }
  if (!f) return { el: h('div', { class: 'ex' }, h('p', {}, `Unknown exercise type: ${esc(ex.type)}`)), ready: () => true, grade: () => ({ ok: true }), key: () => false, lock() {} };
  return f(ex, ctx);
}

// A failed typed exercise only knows pass/fail, so the sheet can only show the model answer. The
// commonest slip is a misspelt name (darkmode for dark-mode), which is easy to miss next to an answer
// that looks the same. This compares the names the prompt asks for (<code>…</code>) with the branches
// and tags that exist now, and names a near miss: same letters ignoring case/-/_ , or one or two typos.
export function nameSlip(prompt, repo) {
  const s = repo?.s;
  if (!s || typeof prompt !== 'string') return null;
  const asked = [...prompt.matchAll(/<code>([^<\s]+)<\/code>/g)].map((m) => m[1]).filter((n) => /^[\w./-]+$/.test(n));
  const have = [...Object.keys(s.branches || {}), ...Object.keys(s.tags || {})];
  const norm = (n) => n.toLowerCase().replace(/[-_./]/g, '');
  for (const want of asked) {
    if (have.includes(want)) continue;
    const got = have.find((n) => !asked.includes(n) && (norm(n) === norm(want) || (want.length > 3 && editDistance(n, want) <= 2)));
    if (got) return `Close! The task asks for ${want}, but you named it ${got}. Names have to match exactly.`;
  }
  return null;
}
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
