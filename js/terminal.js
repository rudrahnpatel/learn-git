// Terminal panel: output, prompt, history (↑/↓), Tab completion and quick-command chips.
// Quiet by default: only the latest command and its output show (earlier ones fold away), and at most a few
// suggestion chips show inline, the rest behind a "+N" chip.
import { h } from './dom.js';
import { keepFocus } from './ui/kb.js';

// phones get a short placeholder (the long one was cut off at 360px, next to the prompt)
export const phone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;

const FLAGS = {
  add: ['-A', '.', '-u'], commit: ['-m', '-am', '--amend', '--no-edit', '-a'], log: ['--oneline', '--graph', '--all', '-S', '--stat', '-p', '--'],
  branch: ['-d', '-D', '-m', '-f', '-a', '-r', '-vv'], switch: ['-c', '--detach', '-'], checkout: ['-b', '--', '--ours', '--theirs'],
  merge: ['--no-ff', '--abort', '--continue', '--ff-only', '--squash'], rebase: ['-i', '--continue', '--abort', '--skip', '--onto'],
  reset: ['--soft', '--mixed', '--hard', 'HEAD~1', 'HEAD@{1}', 'ORIG_HEAD'], restore: ['--staged', '--source='], stash: ['push', 'pop', 'list', 'apply', 'drop', 'show', '-m', '-u'],
  push: ['-u', 'origin', '--force-with-lease', '--tags'], pull: ['--rebase', '--no-rebase'], bisect: ['start', 'good', 'bad', 'reset', 'run', 'log'],
  'cherry-pick': ['--continue', '--abort'], revert: ['--continue', '--abort', '-m'], diff: ['--staged', '--stat'], tag: ['-a', '-m', '-d'], reflog: ['show'],
};

export class Terminal {
  // collapse: show only the latest command and its output; earlier entries fold behind a quiet "earlier" button.
  constructor(container, { onCommand, getCompletions, history = [], onHistory, collapse = true }) {
    this.onCommand = onCommand;
    this.getCompletions = getCompletions;
    this.history = history;
    this.onHistory = onHistory;
    this.hIdx = history.length;
    this.draft = '';
    this.cur = null;
    this.showOld = false;
    this.moreOpen = false;
    this.out = h('div', { class: 'term-out' + (collapse ? ' collapsed' : ''), role: 'log', 'aria-live': 'polite' });
    this.oldBtn = h('button', { class: 'term-old', type: 'button', hidden: true, 'aria-expanded': 'false', onclick: () => this.toggleOld() });
    this.promptEl = h('span', { class: 'prompt' }, '$');
    this.input = h('input', { class: 'term-in', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Command', placeholder: phone() ? 'git command…' : 'type a command, e.g. git status' });
    this.chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Suggested commands' });
    this.chipsMore = h('div', { class: 'chips chips-more', hidden: true, role: 'toolbar', 'aria-label': 'More suggestions' });
    const form = h('form', { class: 'term-form', onsubmit: (e) => { e.preventDefault(); this.submit(); } },
      this.promptEl, this.input, keepFocus(h('button', { class: 'run', type: 'submit', 'aria-label': 'Run' }, '⏎')));
    keepFocus(this.oldBtn);
    this.el = h('div', { class: 'terminal', onclick: (e) => { if (e.target === this.out || e.target === this.el) this.input.focus(); } }, this.oldBtn, this.out, this.chips, this.chipsMore, form);
    container.append(this.el);
    this.input.addEventListener('keydown', (e) => this.key(e));
  }
  focus() { this.input.focus({ preventScroll: true }); }
  setPrompt(text) { this.promptEl.textContent = text; }
  clear() { this.out.replaceChildren(); this.cur = null; this.syncOld(); }
  // one entry per command: the echo line plus everything printed until the next command
  entry() {
    for (const e of this.out.children) e.classList.add('old');
    this.cur = h('div', { class: 'entry' });
    this.out.append(this.cur);
    this.syncOld();
    return this.cur;
  }
  syncOld() {
    const old = this.out.querySelectorAll('.entry.old');
    const n = [...old].filter((e) => e.querySelector('.cmd')).length;
    this.oldBtn.hidden = !old.length || !this.out.classList.contains('collapsed');
    this.out.classList.toggle('show-old', this.showOld);
    this.oldBtn.setAttribute('aria-expanded', String(this.showOld));
    this.oldBtn.textContent = this.showOld ? 'hide earlier' : n ? `${n} earlier command${n > 1 ? 's' : ''}` : 'earlier output';
  }
  toggleOld() { this.showOld = !this.showOld; this.syncOld(); this.scroll(); }
  echo(cmd) { this.entry().append(h('div', { class: 'ln cmd' }, h('span', { class: 'p' }, this.promptEl.textContent + ' '), cmd)); }
  print(lines) {
    const box = this.cur || this.entry();
    for (const l of lines) {
      let cls = l.c || '';
      const t = l.t;
      if (!cls) {
        if (/^diff --git|^index |^(---|\+\+\+) /.test(t)) cls = 'meta';
        else if (t.startsWith('+')) cls = 'add';
        else if (t.startsWith('-')) cls = 'del';
        else if (t.startsWith('@@')) cls = 'hunk';
        else if (/^(<{7}|={7}|>{7})/.test(t)) cls = 'err';
      }
      box.append(h('div', { class: 'ln ' + cls }, t || ' '));
    }
    this.scroll();
  }
  // folded: the latest entry is the only one showing, so show it from its command line down; else follow the end
  scroll() { this.out.scrollTop = this.out.classList.contains('collapsed') && !this.showOld ? 0 : this.out.scrollHeight; }
  note(text, cls = 'hint') { this.print([{ t: text, c: cls }]); }
  // Suggestions: the first `inline` show as quiet chips; the rest wait behind one "+N" chip.
  setChips(list, { inline = 3, moreLabel = '' } = {}) {
    const make = (c) => keepFocus(chip(c));
    const chip = (c) => {
      const label = typeof c === 'string' ? c : c.label;
      const insert = typeof c === 'string' ? c : c.insert;
      if (c.word) return h('button', { class: 'chip word', type: 'button', title: 'insert ' + c.insert, onclick: () => this.insertWord(c.insert) }, label);
      const runNow = typeof c === 'string' ? !/(\s|"|=|')$/.test(c) : c.run;
      return h('button', { class: 'chip' + (runNow ? '' : ' fill'), type: 'button', title: runNow ? 'run it' : 'put it in the prompt', onclick: () => this.chip(insert, runNow) }, label);
    };
    const shown = list.slice(0, inline).map(make), rest = list.slice(inline).map(make);
    if (!rest.length) this.moreOpen = false;
    const toggle = rest.length ? keepFocus(h('button', {
      class: 'chip more', type: 'button', 'aria-expanded': String(this.moreOpen),
      'aria-label': this.moreOpen ? 'Hide extra suggestions' : `Show ${rest.length} more suggestions`,
      onclick: () => { this.moreOpen = !this.moreOpen; this.setChips(list, { inline, moreLabel }); },
    }, this.moreOpen ? 'less' : moreLabel ? `${moreLabel} +${rest.length}` : `+${rest.length} more`)) : null;
    this.chips.replaceChildren(...shown, ...(toggle ? [toggle] : []));
    this.chipsMore.replaceChildren(...rest);
    this.chipsMore.hidden = !this.moreOpen;
  }
  chip(text, runNow) {
    if (runNow) { this.input.value = text; this.submit(); return; }
    this.input.value = text;
    this.focus();
    const caret = text.endsWith('""') ? text.length - 1 : text.length;
    this.input.setSelectionRange(caret, caret);
  }
  insertWord(word) {
    const v = this.input.value;
    this.input.value = !v || v.endsWith(' ') ? v + word : v + ' ' + word;
    this.focus();
  }
  submit() {
    const cmd = this.input.value.trim();
    this.input.value = '';
    if (!cmd) return;
    if (this.history[this.history.length - 1] !== cmd) this.history.push(cmd);
    this.hIdx = this.history.length;
    this.onHistory?.(this.history);
    this.echo(cmd);
    this.onCommand(cmd);
    this.scroll();
  }
  key(e) {
    if (e.key === 'ArrowUp') {
      if (this.hIdx === this.history.length) this.draft = this.input.value;
      if (this.hIdx > 0) { this.hIdx--; this.input.value = this.history[this.hIdx]; }
      e.preventDefault();
      requestAnimationFrame(() => this.input.setSelectionRange(this.input.value.length, this.input.value.length));
    } else if (e.key === 'ArrowDown') {
      if (this.hIdx < this.history.length) { this.hIdx++; this.input.value = this.hIdx === this.history.length ? this.draft : this.history[this.hIdx]; }
      e.preventDefault();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault(); this.clear();
    }
  }
  complete() {
    const v = this.input.value;
    const words = v.split(/\s+/);
    const cur = words[words.length - 1];
    const c = this.getCompletions();
    let cands;
    if (words.length === 1) cands = c.shell;
    else if (words[0] === 'git' && words.length === 2) cands = c.commands;
    else {
      const sub = words[0] === 'git' ? words[1] : words[0];
      const refs = [...c.branches, ...c.tags, ...c.remotes, 'HEAD'];
      if (['add', 'rm', 'restore', 'cat', 'edit', 'diff', 'blame', 'mv'].includes(sub)) cands = [...c.files, ...(FLAGS[sub] || [])];
      else cands = [...refs, ...(FLAGS[sub] || []), ...(['checkout', 'log', 'show'].includes(sub) ? c.files : [])];
    }
    const prefixCut = cur.match(/^(.*[:.]{2}|--source=)?(.*)$/);
    const pre = prefixCut[1] || '', stem = prefixCut[2];
    const hits = [...new Set(cands)].filter((x) => x.startsWith(stem));
    if (!hits.length) return;
    if (hits.length === 1) { words[words.length - 1] = pre + hits[0]; this.input.value = words.join(' ') + ' '; return; }
    let common = hits[0];
    for (const x of hits) while (!x.startsWith(common)) common = common.slice(0, -1);
    if (common.length > stem.length) { words[words.length - 1] = pre + common; this.input.value = words.join(' '); }
    else this.print([{ t: hits.join('   '), c: 'hint' }]);
  }
}
