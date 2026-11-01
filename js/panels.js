// Modal tools: conflict surgeon, interactive-rebase todo editor, file editor.
import { h, modal } from './dom.js';
import { splitLines, joinLines, firstLine } from './git.js';

/* ------------------------------------------------------- conflict surgeon */
export function parseConflicts(text) {
  const lines = splitLines(text);
  const segs = [];
  let buf = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('<<<<<<< ') || lines[i] === '<<<<<<<') {
      const hunk = { ours: [], theirs: [], oursLabel: lines[i].slice(8), theirsLabel: '' };
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('=======')) hunk.ours.push(lines[j++]);
      j++;
      while (j < lines.length && !lines[j].startsWith('>>>>>>>')) hunk.theirs.push(lines[j++]);
      if (j >= lines.length) { buf.push(...lines.slice(i)); break; }
      hunk.theirsLabel = lines[j].slice(8);
      if (buf.length) segs.push({ text: buf }); buf = [];
      segs.push({ hunk });
      i = j;
    } else buf.push(lines[i]);
  }
  if (buf.length) segs.push({ text: buf });
  return segs;
}
export function resolveConflicts(segs, choices) {
  const out = [];
  let k = 0;
  for (const s of segs) {
    if (s.text) { out.push(...s.text); continue; }
    const c = choices[k++], hk = s.hunk;
    if (c === 'ours') out.push(...hk.ours);
    else if (c === 'theirs') out.push(...hk.theirs);
    else if (c === 'both') out.push(...hk.ours, ...hk.theirs);
    else if (c === 'both-rev') out.push(...hk.theirs, ...hk.ours);
    else out.push('<<<<<<< ' + hk.oursLabel, ...hk.ours, '=======', ...hk.theirs, '>>>>>>> ' + hk.theirsLabel);
  }
  return joinLines(out);
}

export function openSurgeon(repo, { onSave, inRebase }) {
  const files = Object.keys(repo.s.work).filter((p) => /^<{7} /m.test(repo.s.work[p])).sort();
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
        class: 'btn small seg', type: 'button', onclick: (e) => {
          choices[i] = v;
          e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
          sync();
        },
      }, label));
      return h('div', { class: 'hunk' },
        h('div', { class: 'hunk-title' }, `Hunk ${i + 1} of ${hunks.length}`),
        h('div', { class: 'sides' },
          h('div', { class: 'side ours' }, h('div', { class: 'side-label' }, h('b', {}, 'ours'), ` · ${hunk.oursLabel || 'HEAD'}`), h('pre', {}, hunk.ours.join('\n') || '(nothing)')),
          h('div', { class: 'side theirs' }, h('div', { class: 'side-label' }, h('b', {}, 'theirs'), ` · ${hunk.theirsLabel}`), h('pre', {}, hunk.theirs.join('\n') || '(nothing)'))),
        h('div', { class: 'seg-row' }, btns));
    });
    const save = (add) => {
      onSave(current, result.value, add);
      const left = Object.keys(repo.s.work).filter((p) => /^<{7} /m.test(repo.s.work[p])).sort();
      if (left.length) { current = left[0]; draw(); } else m.close();
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
  const draw = () => {
    list.replaceChildren(...rows.map((r, i) => {
      const sel = h('select', { 'aria-label': 'action', onchange: (e) => { r.action = e.target.value; draw(); } },
        ACTIONS.map(([a]) => h('option', { value: a, selected: a === r.action }, a)));
      const msg = r.action === 'reword'
        ? h('input', { class: 'reword', value: firstLine(r.msg), 'aria-label': 'new message', oninput: (e) => { r.msg = e.target.value; } })
        : h('span', { class: 'tmsg' + (r.action === 'drop' ? ' dropped' : '') }, firstLine(repo.commit(r.id).msg));
      return h('li', { class: 'todo-row a-' + r.action },
        sel, h('code', { class: 'tid' }, r.id), msg,
        h('span', { class: 'mv' },
          h('button', { class: 'icon-btn', 'aria-label': 'move up', disabled: i === 0, onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); } }, '↑'),
          h('button', { class: 'icon-btn', 'aria-label': 'move down', disabled: i === rows.length - 1, onclick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); } }, '↓')));
    }));
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
