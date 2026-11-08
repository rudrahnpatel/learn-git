// Modal tools: conflict surgeon, interactive-rebase todo editor, file editor.
import { h, modal, announce } from './dom.js';
import { firstLine } from './git.js';
import { parseConflicts, resolveConflicts, conflictedFiles } from './conflicts.js';

/* ------------------------------------------------------- conflict surgeon */
// the marker parsing and resolving live in js/conflicts.js (shared with the `resolve` exercise's editor)
export { parseConflicts, resolveConflicts };

export function openSurgeon(repo, { onSave, inRebase }) {
  const files = conflictedFiles(repo);
  if (!files.length) return null;
  let current = files[0];
  const body = h('div', { class: 'surgeon' });
  const m = modal('Conflict surgeon', body, { wide: true });
  const draw = () => {
    const segs = parseConflicts(repo.s.work[current]);
    const hunks = segs.filter((s) => s.hunk);
    const choices = new Array(hunks.length).fill(null);
    const result = h('textarea', { class: 'result', spellcheck: 'false', rows: 8, 'aria-label': 'Resolved file' });
    result.value = resolveConflicts(segs, choices);
    const sync = () => { result.value = resolveConflicts(segs, choices); };
    const cards = hunks.map(({ hunk }, i) => {
      const opts = [['ours', 'Keep ours'], ['theirs', 'Keep theirs'], ['both', 'Both, ours first'], ['both-rev', 'Both, theirs first']];
      const btns = opts.map(([v, label]) => h('button', {
        class: 'btn small seg', type: 'button', 'aria-pressed': 'false', onclick: (e) => {
          choices[i] = v;
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('active', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); });
          sync();
        },
      }, label));
      return h('div', { class: 'hunk' },
        h('div', { class: 'hunk-title' }, `Hunk ${i + 1} of ${hunks.length}`),
        h('div', { class: 'sides' },
          h('div', { class: 'side ours' }, h('div', { class: 'side-label' }, h('b', {}, 'ours'), ` · ${hunk.oursLabel || 'HEAD'}`), h('pre', {}, hunk.ours.join('\n') || '(nothing)')),
          h('div', { class: 'side theirs' }, h('div', { class: 'side-label' }, h('b', {}, 'theirs'), ` · ${hunk.theirsLabel}`), h('pre', {}, hunk.theirs.join('\n') || '(nothing)'))),
        h('div', { class: 'seg-row', role: 'group', 'aria-label': `Resolve hunk ${i + 1}` }, btns));
    });
    const save = (add) => {
      onSave(current, result.value, add);
      const left = conflictedFiles(repo);
      if (left.length) { current = left[0]; draw(); body.querySelector('button')?.focus(); announce(`Saved. Next file: ${current}.`); } else m.close();
    };
    body.replaceChildren(...[
      files.length > 1 ? h('div', { class: 'file-tabs' }, files.map((f) => h('button', { class: 'chip' + (f === current ? ' active' : ''), onclick: () => { current = f; draw(); } }, f))) : null,
      h('p', { class: 'muted' }, `File `, h('code', {}, current), `: ${hunks.length} conflicting ${hunks.length === 1 ? 'hunk' : 'hunks'}. `,
        inRebase ? 'During a rebase, "ours" is the branch you are rebasing onto and "theirs" is your commit being replayed.' : '"Ours" is HEAD (your branch); "theirs" is what you are bringing in.'),
      ...cards,
      h('label', { class: 'result-label' }, 'Result (you can also edit by hand):'), result,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => save(false) }, 'Save file'),
        h('button', { class: 'btn primary', onclick: () => save(true) }, `Save & git add ${current}`))].filter(Boolean));
  };
  draw();
  return m;
}

/* -------------------------------------------------- interactive rebase todo */
const ACTIONS = [
  ['pick', 'use the commit'],
  ['reword', 'use it, change the message'],
  ['squash', 'meld into previous, keep both messages'],
  ['fixup', 'meld into previous, drop this message'],
  ['drop', 'remove the commit'],
];
export function openRebaseTodo(repo, { onStart, onCancel }) {
  const pr = repo.s.pendingRebase;
  if (!pr) return null;
  const rows = pr.todo.map((t) => ({ action: 'pick', id: t.id, msg: repo.commit(t.id).msg }));
  let started = false;
  const list = h('ol', { class: 'todo' });
  const err = h('p', { class: 'err-text' });
  const body = h('div', { class: 'rebase-ui' },
    h('p', { class: 'muted' }, `Rebasing ${rows.length} commit${rows.length === 1 ? '' : 's'} onto ${pr.onto}. Top = oldest = replayed first (same order as git's todo file).`),
    list, err,
    h('details', { class: 'legend-actions' }, h('summary', {}, 'What the actions do'),
      h('ul', {}, ACTIONS.map(([a, d]) => h('li', {}, h('code', {}, a), ' ', d)))),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel (rebase --abort)'),
      h('button', { class: 'btn primary', onclick: () => { started = true; const res = onStart(rows.map((r) => ({ action: r.action, id: r.id, msg: r.action === 'reword' ? r.msg : undefined }))); if (res && !res.ok && repo.s.pendingRebase) { started = false; err.textContent = res.lines.map((l) => l.t).join(' '); } else m.close(); } }, 'Start rebase')));
  // every control is labelled with its commit; after a redraw the focus returns to the same control of the same
  // commit (the moved row, or the select that changed), and moves are announced
  const draw = (focusId = null, focusWhat = null) => {
    list.replaceChildren(...rows.map((r, i) => {
      const what = firstLine(repo.commit(r.id).msg);
      const sel = h('select', { 'aria-label': `Action for ${r.id} ${what}`, 'data-f': 'sel', onchange: (e) => { r.action = e.target.value; draw(r.id, 'sel'); } },
        ACTIONS.map(([a]) => h('option', { value: a, selected: a === r.action }, a)));
      const msg = r.action === 'reword'
        ? h('input', { class: 'reword', value: firstLine(r.msg), 'aria-label': `New message for ${r.id}`, oninput: (e) => { r.msg = e.target.value; } })
        : h('span', { class: 'tmsg' + (r.action === 'drop' ? ' dropped' : '') }, what);
      const move = (d, f) => { [rows[i + d], rows[i]] = [rows[i], rows[i + d]]; draw(r.id, f); announce(`${r.id} moved to line ${i + d + 1} of ${rows.length}.`); };
      return h('li', { class: 'todo-row a-' + r.action, 'data-id': r.id },
        sel, h('code', { class: 'tid' }, r.id), msg,
        h('span', { class: 'mv' },
          h('button', { class: 'icon-btn', type: 'button', 'data-f': 'up', 'aria-label': `Move ${r.id} up`, disabled: i === 0, onclick: () => move(-1, 'up') }, h('span', { 'aria-hidden': 'true' }, '↑')),
          h('button', { class: 'icon-btn', type: 'button', 'data-f': 'down', 'aria-label': `Move ${r.id} down`, disabled: i === rows.length - 1, onclick: () => move(1, 'down') }, h('span', { 'aria-hidden': 'true' }, '↓'))));
    }));
    if (focusId) {
      const row = list.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      // a row moved to the end has no "down" any more: the other move button, then its select
      const t = row?.querySelector(`[data-f="${focusWhat}"]:not(:disabled)`) || row?.querySelector('[data-f="up"]:not(:disabled), [data-f="down"]:not(:disabled)') || row?.querySelector('[data-f]');
      t?.focus();
    }
  };
  draw();
  const m = modal('Interactive rebase', body, { wide: true, onClose: () => { if (!started) onCancel(); } });
  return m;
}

/* ------------------------------------------------------------- file editor */
export function openEditor(path, content, { onSave }) {
  const ta = h('textarea', { class: 'result tall', spellcheck: 'false', 'aria-label': path });
  ta.value = content ?? '';
  const m = modal(`edit ${path}`, h('div', {},
    ta,
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: () => { onSave(ta.value); m.close(); } }, 'Save'))));
  setTimeout(() => ta.focus(), 30);
  return m;
}
