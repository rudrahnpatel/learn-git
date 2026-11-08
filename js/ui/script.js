// The `script` exercise (bash course, units 9+): write or fix a short script in a small editor, Run it, Check it.
// The editor is a plain textarea with a line-number gutter (monospace, no spellcheck/autocorrect, Tab inserts two
// spaces). Run builds the exercise's files from `setup`, saves the text as `ex.file` and runs it once per entry of
// `runs` (js/shellex.js runScript): the output box shows each command line, its output and its exit status, and the
// live file tree shows what the script made or moved. Check grades with gradeScript (fresh files, the same runs,
// `check(sh)`, and the variant replay when the exercise has one). Same contract as the other renderers
// (js/ui/exercises.js): { el, ready(), grade(), key(e), lock(), focus() }. See .notes/bash-script-exercise.md.
import { h, announce } from '../dom.js';
import { sfx } from '../sound.js';
import { keepFocus } from './kb.js';
import { FileTree } from './filetree.js';
import { freshShell, runScript, gradeScript, SCRIPT_VARIANT_NOTE } from '../shellex.js';

// keys phone keyboards bury and scripts need (shown on narrow screens only, like the terminal's symbol row)
export const EDITOR_SYMBOLS = [['$', 'dollar'], ['"', 'double quote'], ['|', 'pipe'], ['>', 'greater than'], ['[', 'open bracket'], [']', 'close bracket'], ['{', 'open brace'], ['}', 'close brace'], [';', 'semicolon'], ['#', 'hash'], ['-', 'dash']];
const INDENT = '  ';
let uid = 0;

export function script(ex, ctx, { richPrompt }) {
  const id = `sc${++uid}`;
  const starter = String(ex.starter ?? '');
  let locked = false, escaped = false, view = 'out';

  /* ------------------------------------------------------------ the editor */
  const gutter = h('pre', { class: 'sc-gut', 'aria-hidden': 'true' });
  const tip = h('span', { class: 'sr-only', id: `${id}-tip` }, 'Tab inserts two spaces. To leave the editor, press Escape, then Tab. Control Enter checks.');
  const ta = h('textarea', {
    class: 'sc-ta', id: `${id}-ta`, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off',
    wrap: 'off', 'aria-label': `${ex.file}: the script`, 'aria-describedby': `ex-prompt ${id}-tip`,
    oninput: () => { drawGutter(); ctx.onChange(); },
    onscroll: () => { gutter.scrollTop = ta.scrollTop; },
    onkeydown: (e) => onEditorKey(e),
  });
  ta.value = starter;
  const drawGutter = () => {
    const n = Math.max(1, ta.value.split('\n').length);
    if (gutter.childElementCount !== n) gutter.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', {}, String(i + 1))));
    gutter.scrollTop = ta.scrollTop;
  };
  const insert = (text) => {
    if (locked) return;
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  function onEditorKey(e) {
    if (e.key === 'Escape') { escaped = true; return; }   // the next Tab leaves the editor (no keyboard trap)
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !escaped && !locked) {
      e.preventDefault();
      insert(INDENT);
      return;
    }
    // Enter keeps the current line's indent
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !locked) {
      const before = ta.value.slice(0, ta.selectionStart);
      const indent = /[ \t]*/.exec(before.slice(before.lastIndexOf('\n') + 1))[0];
      if (indent) { e.preventDefault(); insert('\n' + indent); }
    }
    escaped = false;
  }
  const symRow = h('div', { class: 'sym-row sc-syms', role: 'group', 'aria-label': 'Symbols' },
    EDITOR_SYMBOLS.map(([t, name]) => keepFocus(h('button', { class: 'sym mono', type: 'button', 'aria-label': `Insert ${name}`, onclick: () => { insert(t); ta.focus({ preventScroll: true }); } }, t))));

  const runBtn = h('button', { class: 'btn small sc-run', type: 'button', onclick: () => run() },
    h('span', { 'aria-hidden': 'true', class: 'sc-run-ic' }, '▶'), ' Run');
  const resetBtn = h('button', { class: 'btn ghost small sc-reset', type: 'button', onclick: () => reset() },
    h('span', { 'aria-hidden': 'true' }, '↻ '), 'Reset');
  const how = (ex.runs || [{}]).length;
  const editor = h('section', { class: 'sc-editor card', 'aria-labelledby': `${id}-name` },
    h('div', { class: 'sc-head' },
      h('span', { class: 'sc-name mono', id: `${id}-name` }, ex.file),
      h('span', { class: 'sc-acts' }, resetBtn, runBtn)),
    h('div', { class: 'sc-body' }, gutter, ta),
    tip, symRow);

  /* ------------------------------------------------------------ output and files */
  const out = h('div', { class: 'sc-out mono', tabindex: '0', role: 'region', 'aria-label': 'Output', id: `${id}-out` });
  const status = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const treeBox = h('div', { class: 'sc-files', tabindex: '0', role: 'region', 'aria-label': 'File tree', id: `${id}-files` });
  const tree = new FileTree(treeBox, { label: 'Files in your home folder', compact: true });
  // phones: one pane at a time under the editor, picked with two pressed-state buttons (wide screens show both)
  const tabs = [['out', 'Output'], ['files', 'Files']].map(([v, label]) => h('button', {
    class: 'sc-tab mono', type: 'button', 'aria-pressed': 'false', 'aria-controls': `${id}-${v}`, onclick: () => setView(v),
  }, label));
  const setView = (v) => {
    view = v;
    tabs.forEach((t, i) => t.setAttribute('aria-pressed', String((i === 0) === (v === 'out'))));
    side.dataset.view = v;
  };
  const side = h('div', { class: 'sc-side' }, h('div', { class: 'sc-tabs', role: 'group', 'aria-label': 'Show' }, tabs),
    h('div', { class: 'sc-pane sc-pane-out' }, out),
    h('div', { class: 'sc-pane sc-pane-files card' }, h('span', { class: 'sc-pane-title mono', 'aria-hidden': 'true' }, 'files'), treeBox));
  setView('out');

  const idle = () => {
    out.replaceChildren(h('div', { class: 'ln hint' }, `Press Run to run ${ex.run === 'exec' ? `./${ex.file}` : `bash ${ex.file}`}${how > 1 ? ` (${how} times, with different input)` : ''}.`));
    out.classList.remove('has-out');
  };
  // the files before any run: the setup, with the script saved in place
  const drawStart = () => {
    try { const sh = freshShell(ex.setup); sh.writeFile(ex.file, ta.value); tree.seen = null; tree.render(sh); }
    catch (e) { treeBox.textContent = 'setup failed: ' + e.message; }
  };
  // show runs (from runScript) in the output box, the resulting files in the tree; returns a spoken summary
  const show = (runs, sh) => {
    const lines = [];
    for (const r of runs) {
      lines.push(h('div', { class: 'ln cmd' }, h('span', { class: 'p' }, '$ '), r.cmd));
      if (r.stdin != null) lines.push(h('div', { class: 'ln hint sc-in' }, `(input: ${r.stdin.replace(/\n$/, '').split('\n').join(' ⏎ ')})`));
      for (const l of r.lines) lines.push(h('div', { class: 'ln ' + (l.c || '') }, l.t || ' '));
      if (!r.setup) lines.push(h('div', { class: 'ln sc-code' + (r.code ? ' bad' : '') }, `exit status ${r.code}`));
    }
    out.replaceChildren(...lines);
    out.classList.add('has-out');
    out.scrollTop = 0;
    const d = tree.render(sh, { animate: true });
    const shown = runs.filter((r) => !r.setup);
    const said = shown.map((r) => {
      const text = r.lines.filter((l) => l.c !== 'hint').map((l) => l.t).join('. ');
      return `${r.cmd}: ${text ? `printed ${text}.` : 'printed nothing.'} Exit status ${r.code}.`;
    });
    if (d.added.length) said.push(`Added ${d.added.join(', ')}.`);
    if (d.removed.length) said.push(`Removed ${d.removed.join(', ')}.`);
    return said.join(' ');
  };
  const say = (t) => { status.textContent = ''; setTimeout(() => { status.textContent = t; }, 40); };

  function run() {
    if (locked) return;
    let sh, runs;
    // the baseline for "new" in the tree: the setup with the script saved, so only what the script made pops in
    try { sh = freshShell(ex.setup); sh.writeFile(ex.file, ta.value); tree.seen = null; tree.render(sh); runs = runScript(sh, ex, ta.value); }
    catch (e) { out.textContent = 'setup failed: ' + e.message; return; }
    sfx.tap();
    say(show(runs, sh));
    if (view !== 'out' && !matchMedia('(min-width: 900px)').matches) setView('out');
    ctx.onChange();
  }
  function reset() {
    if (locked) return;
    ta.value = starter;
    drawGutter();
    idle(); drawStart();
    ta.focus({ preventScroll: true });
    announce('Script and files reset to the start.');
    ctx.onChange();
  }

  idle(); drawGutter(); drawStart();
  return {
    el: h('div', { class: 'ex ex-script' }, richPrompt(ex), h('div', { class: 'sc-grid' }, editor, side), status),
    // the unchanged starter never passes (the content test makes sure), so Check waits for an edit
    ready: () => ta.value.trim().length > 0 && ta.value.trim() !== starter.trim(),
    grade: () => {
      const g = gradeScript(ex, ta.value);
      // what the graded run printed, so the learner sees why
      say(show(g.runs, g.sh));
      editor.classList.add(g.ok ? 'right' : 'wrong');
      return { ok: g.ok, answer: ex.solution, mono: true, note: g.live && g.variant === false ? SCRIPT_VARIANT_NOTE : null };
    },
    key: () => false,
    lock: () => { locked = true; ta.readOnly = true; runBtn.disabled = true; resetBtn.disabled = true; symRow.querySelectorAll('button').forEach((b) => { b.disabled = true; }); },
    // desktop: start in the editor (phones would pop the keyboard over the question)
    focus: () => { if (!matchMedia('(pointer: fine)').matches) return false; ta.focus({ preventScroll: true }); ta.setSelectionRange(0, 0); return true; },
  };
}
