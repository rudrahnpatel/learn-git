// The bash course's file tree: what the commit graph is for git. Renders Shell.treeView() as nested lists rooted at
// ~, folders with a trailing slash, executables marked, the working directory highlighted ("you are here").
// Live mode (the type exercise, learn demos) remembers the paths it drew, so a new entry pops in; render() returns
// what was added and removed, for the caller to announce. Plain DOM, no state outside the instance.
import { h } from '../dom.js';

const FOLDER = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 4.5a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.5h5.5a1.5 1.5 0 0 1 1.5 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5h-10a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor"/></svg>';
const FILE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 1.5h5l3.5 3.5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5V5h3.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

export class FileTree {
  // opts: label (accessible name), hidden (show dot files), compact (smaller rows), inline (spans instead of lists,
  // for use inside a button: an outcome option, where only phrasing content is allowed)
  constructor(container, { label = 'Files', hidden = false, compact = false, inline = false } = {}) {
    this.hidden = hidden;
    this.inline = inline;
    this.seen = null;
    this.list = h(inline ? 'span' : 'ul', { class: 'ftree' + (compact ? ' compact' : '') + (inline ? ' inline' : ''), 'aria-label': inline ? null : label });
    this.el = h(inline ? 'span' : 'div', { class: 'ftree-wrap' }, this.list);
    container.append(this.el);
  }
  // sh: a Shell. animate: pop in what is new since the last render.
  render(sh, { animate = false } = {}) {
    const L = this.inline ? 'span' : 'ul', I = this.inline ? 'span' : 'li';
    const t = sh.treeView({ hidden: this.hidden });
    const now = new Set();
    const prev = this.seen;
    const here = () => h('span', { class: 'ft-here mono' }, h('span', { 'aria-hidden': 'true' }, '◂ '), 'you are here');
    const item = (n, depth) => {
      now.add(n.path);
      const isNew = animate && prev && !prev.has(n.path);
      const dir = n.type === 'dir';
      const label = h('span', { class: 'ft-row' + (n.cwd ? ' cwd' : '') + (isNew ? ' pop' : '') },
        h('span', { class: 'ft-ic' + (dir ? ' dir' : ''), html: dir ? FOLDER : FILE }),
        h('span', { class: 'ft-name mono' }, n.name + (dir && depth ? '/' : '') + (n.exec ? '*' : '')),
        n.exec ? h('span', { class: 'sr-only' }, ' (executable)') : null,
        n.cwd ? here() : null,
        isNew ? h('span', { class: 'sr-only' }, ' (new)') : null);
      const kids = dir && n.children.length ? h(L, { class: 'ft-kids' }, n.children.map((c) => item(c, depth + 1))) : null;
      return h(I, { class: 'ft-item', 'aria-current': n.cwd && !this.inline ? 'location' : null }, label, kids);
    };
    if (!t) { this.list.replaceChildren(h(I, { class: 'ft-item' }, h('span', { class: 'ft-row' }, '(no home folder)'))); return { added: [], removed: [] }; }
    this.list.replaceChildren(item(t, 0));
    // the working directory may sit outside home (cd /etc): say so instead of highlighting nothing
    if (!sh.s.cwd.startsWith(sh.s.home)) this.list.append(h(I, { class: 'ft-item ft-out' }, h('span', { class: 'ft-row cwd' }, h('span', { class: 'ft-name mono' }, sh.s.cwd), here())));
    const removed = prev ? [...prev].filter((p) => !now.has(p)).map((p) => sh.pretty(p)) : [];
    const added = prev ? [...now].filter((p) => !prev.has(p)).map((p) => sh.pretty(p)) : [];
    this.seen = now;
    // keep the highlighted folder in view in a long tree
    const cur = this.list.querySelector('.ft-row.cwd');
    if (cur && this.el.scrollHeight > this.el.clientHeight + 4) {
      const top = cur.offsetTop - this.el.offsetTop;
      if (top < this.el.scrollTop || top > this.el.scrollTop + this.el.clientHeight - 24) this.el.scrollTop = Math.max(0, top - 24);
    }
    return { added, removed };
  }
}
