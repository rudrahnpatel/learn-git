// The `resolve` exercise: a conflict editor. The conflicted file is shown with its <<<<<<< / ======= / >>>>>>>
// markers, and each conflict (hunk) gets four real buttons: keep ours, keep theirs, keep both, or edit by hand.
// A chosen hunk turns into its resolved lines in place, so the file reads as the result. Check writes the file
// into the live repo's working tree and grades with the exercise's own check(r) (js/conflicts.js gradeResolve),
// exactly like a `type` exercise. Same contract as the other renderers (js/ui/exercises.js):
//   { el, ready(), grade(), key(e), lock() }. See .notes/conflict-editor.md.
import { h } from '../dom.js';
import { Repo } from '../git.js';
import { sfx } from '../sound.js';
import { parseConflicts, resolveConflicts, hunkLines, resolveTarget, gradeResolve } from '../conflicts.js';

const ACTIONS = [
  ['ours', 'Keep ours'],
  ['theirs', 'Keep theirs'],
  ['both', 'Keep both'],
  ['edit', 'Edit'],
];
const SAID = { ours: 'kept ours', theirs: 'kept theirs', both: 'kept both, ours first', edit: 'editing by hand' };
let uid = 0;

export function resolve(ex, ctx, { richPrompt } = {}) {
  let repo, file, segs;
  try {
    repo = new Repo(); ex.setup?.(repo); repo.setupDone();
    file = resolveTarget(ex, repo);
    segs = parseConflicts(file ? repo.s.work[file] : '');
  } catch (e) {
    return { el: h('div', { class: 'ex' }, richPrompt(ex), h('p', {}, 'This exercise failed to build: ' + e.message)), ready: () => true, grade: () => ({ ok: true }), key: () => false, lock() {} };
  }
  const hunks = segs.filter((s) => s.hunk).map((s) => s.hunk);
  const n = hunks.length;
  const choices = new Array(n).fill(null), edits = new Array(n).fill(null);
  const id = `cf${++uid}`;
  let locked = false, active = 0;
  const inRebase = repo.s.seq?.kind === 'rebase';

  // a polite status line for screen readers: what each choice did, and when everything is resolved
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const say = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };
  const left = h('span', { class: 'cf-left mono' });
  const body = h('div', { class: 'cf-body', role: 'group', 'aria-label': `${file}, ${n} conflict${n === 1 ? '' : 's'}` });

  const cards = hunks.map((hk, i) => {
    const title = h('span', { class: 'cf-title mono', id: `${id}-t${i}` }, n > 1 ? `Conflict ${i + 1} of ${n}` : 'Conflict');
    const view = h('div', { class: 'cf-view' });
    const btns = ACTIONS.map(([v, label], k) => h('button', {
      class: 'btn small seg cf-act', type: 'button', 'aria-pressed': 'false', 'data-v': v,
      onclick: () => choose(i, v, true),
    }, h('span', { class: 'key mono', 'aria-hidden': 'true' }, String(k + 1)), label));
    const acts = h('div', { class: 'cf-acts', role: 'group', 'aria-labelledby': `${id}-t${i}` }, btns);
    const el = h('section', { class: 'cf-hunk', 'aria-labelledby': `${id}-t${i}`, onfocusin: () => setActive(i) },
      h('div', { class: 'cf-hunk-head' }, title, h('span', { class: 'cf-state mono' })), view, acts);
    return { el, view, btns, state: el.querySelector('.cf-state'), ta: null };
  });

  // the unchanged lines and the conflicts, in file order
  let k = 0;
  for (const s of segs) {
    if (s.text) body.append(h('pre', { class: 'cf-ctx' }, s.text.join('\n')));
    else body.append(cards[k++].el);
  }

  const drawHunk = (i) => {
    const hk = hunks[i], c = choices[i], card = cards[i];
    card.btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === c)));
    card.el.classList.toggle('done', !!c);
    card.state.textContent = c ? SAID[c] : 'unresolved';
    if (c === 'edit') {
      if (!card.ta) {
        card.ta = h('textarea', {
          class: 'cf-edit', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
          'aria-label': `${n > 1 ? `Conflict ${i + 1}` : 'The conflict'}: the lines to keep, edited by hand`,
          oninput: () => { edits[i] = card.ta.value; fit(card.ta); ctx.onChange(); },
        });
      }
      card.ta.value = edits[i];
      card.ta.disabled = locked;
      card.view.replaceChildren(card.ta);
      fit(card.ta);
      return;
    }
    if (c) {
      const lines = hunkLines(hk, c);
      card.view.replaceChildren(h('pre', { class: 'cf-lines cf-res' }, lines.length ? lines.join('\n') : '(nothing: both lines removed)'));
      return;
    }
    // unresolved: the markers as git wrote them; screen readers get "ours" / "theirs" instead of the marker glyphs
    const side = (cls, who, label, lines) => h('div', { class: 'cf-side ' + cls },
      h('span', { class: 'sr-only' }, `${who}${label ? ` (${label})` : ''}: `),
      h('pre', { class: 'cf-lines' }, lines.length ? lines.join('\n') : ' '));
    card.view.replaceChildren(
      h('pre', { class: 'cf-mark', 'aria-hidden': 'true' }, '<<<<<<< ' + hk.oursLabel),
      side('ours', 'Ours', hk.oursLabel, hk.ours),
      h('pre', { class: 'cf-mark', 'aria-hidden': 'true' }, '======='),
      side('theirs', 'Theirs', hk.theirsLabel, hk.theirs),
      h('pre', { class: 'cf-mark', 'aria-hidden': 'true' }, '>>>>>>> ' + hk.theirsLabel));
  };
  const drawLeft = () => {
    const open = choices.filter((c) => !c).length;
    left.textContent = open ? `${open} to resolve` : 'resolved';
    left.classList.toggle('done', !open);
    cards.forEach((c, i) => c.el.classList.toggle('active', n > 1 && i === active && !locked));
  };
  const setActive = (i) => { if (active !== i) { active = i; drawLeft(); } };

  function choose(i, v, fromClick) {
    if (locked || i < 0 || i >= n) return;
    if (v === 'edit' && edits[i] == null) edits[i] = hunkLines(hunks[i], choices[i] || 'both').join('\n');
    choices[i] = v;
    sfx.tap();
    drawHunk(i);
    const open = choices.findIndex((c) => !c);
    if (v === 'edit') {
      active = i;
      // focus the textarea so typing can start (on phones this opens the keyboard; js/ui/kb.js pins the lesson)
      setTimeout(() => cards[i].ta?.focus({ preventScroll: false }), 0);
    } else if (!fromClick && open >= 0) active = open; // keyboard: move on to the next open conflict
    drawLeft();
    const what = `${n > 1 ? `Conflict ${i + 1}: ` : ''}${SAID[v]}.`;
    say(open < 0 ? `${what} All conflicts resolved. Press Check.` : what);
    ctx.onChange();
  }

  const note = h('p', { class: 'cf-note' }, inRebase
    ? 'Mid-rebase, ours (HEAD) is the branch you are replaying onto, and theirs is your commit.'
    : 'Ours (HEAD) is the branch you are on; theirs is the branch you are merging in.');
  const card = h('div', { class: 'cf-file card' },
    h('div', { class: 'cf-head' }, h('span', { class: 'cf-name mono' }, file || '(no file)'), left),
    note, body);
  hunks.forEach((_, i) => drawHunk(i));
  drawLeft();

  return {
    el: h('div', { class: 'ex ex-resolve' }, richPrompt(ex), card, live),
    ready: () => n > 0 && choices.every(Boolean),
    grade: () => {
      const text = resolveConflicts(segs, choices, edits);
      const ok = gradeResolve(ex, repo, text, file);
      card.classList.add(ok ? 'right' : 'wrong');
      const leftover = /^(<{7}|={7}|>{7})( |$)/m.test(text);
      return { ok, answer: ex.solution, mono: true, note: ok ? null : leftover ? 'There are still conflict markers in the file.' : null };
    },
    // 1-4 pick an action for the active conflict (the one holding focus, else the next unresolved one)
    key: (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-4]$/.test(e.key)) return false;
      choose(active, ACTIONS[Number(e.key) - 1][0], false);
      return true;
    },
    lock: () => {
      locked = true;
      cards.forEach((c) => { c.btns.forEach((b) => { b.disabled = true; }); if (c.ta) c.ta.disabled = true; });
      drawLeft();
    },
  };
}

// grow a textarea with its content (no inner scrollbar for a few lines)
function fit(ta) { ta.rows = Math.max(2, Math.min(8, ta.value.split('\n').length)); }
