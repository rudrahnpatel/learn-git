// The "three trees" panel: working tree, index and HEAD side by side.
import { h } from './dom.js';

function preview(text, open) {
  if (text === undefined) return h('span', { class: 'absent' }, '(none)');
  if (text === '') return h('span', { class: 'absent' }, '(empty)');
  const lines = text.replace(/\n$/, '').split('\n');
  const shown = open ? lines : lines.slice(0, 2);
  return h('pre', { class: 'fc' }, shown.join('\n') + (!open && lines.length > 2 ? `\n… +${lines.length - 2} lines` : ''));
}

export class TreesView {
  constructor(container, { onConflict } = {}) {
    this.el = container;
    this.open = new Set();
    this.onConflict = onConflict;
  }
  render(repo) {
    const rows = repo.treesView();
    const s = repo.s;
    const op = repo.inProgress();
    const head = repo.headId();
    const status = h('div', { class: 'trees-status' },
      h('span', { class: 'pill' + (repo.branchName() ? '' : ' warn') }, repo.branchName() ? `on ${repo.branchName()}` : `detached at ${head || '-'}`),
      op ? h('span', { class: 'pill err' }, op.toUpperCase() + ' in progress') : null,
      s.stash.length ? h('span', { class: 'pill' }, `stash: ${s.stash.length}`) : null,
      rows.some((r) => r.markers) && this.onConflict ? h('button', { class: 'btn small danger', onclick: () => this.onConflict() }, 'Open conflict surgeon') : null);

    const headRow = h('div', { class: 'trow thead' },
      h('div', { class: 'tc' }, h('b', {}, 'Working tree'), h('small', {}, 'your files on disk')),
      h('div', { class: 'tc arrow', title: 'git add copies working tree → index' }, 'add', h('br'), '→'),
      h('div', { class: 'tc' }, h('b', {}, 'Index'), h('small', {}, 'staged: the next commit')),
      h('div', { class: 'tc arrow', title: 'git commit saves the index as a commit' }, 'commit', h('br'), '→'),
      h('div', { class: 'tc' }, h('b', {}, 'HEAD'), h('small', {}, head ? `last commit ${head}` : 'no commits yet')));

    const body = rows.length ? rows.map((r) => {
      const open = this.open.has(r.path);
      const wTag = r.conflict ? ['conflict', 'conflict'] : r.untracked ? ['untracked', 'untracked'] : r.modified ? [r.work === undefined ? 'deleted' : 'modified', 'mod'] : null;
      const iTag = r.conflict ? ['unmerged', 'conflict'] : r.staged ? [r.head === undefined ? 'new, staged' : r.index === undefined ? 'deletion staged' : 'staged', 'staged'] : null;
      const cell = (text, tag, extra = '') => h('div', { class: `tc cell ${tag ? tag[1] : 'same'} ${extra}` },
        tag ? h('span', { class: 'tag ' + tag[1] }, tag[0]) : null, preview(text, open));
      // the whole row expands on a click; the file name is the keyboard's way in (a real button, aria-expanded)
      const toggle = (refocus) => { open ? this.open.delete(r.path) : this.open.add(r.path); this.render(repo); if (refocus) this.el.querySelector(`.tname[data-path="${CSS.escape(r.path)}"]`)?.focus({ preventScroll: true }); };
      return h('div', { class: 'trow' + (open ? ' open' : ''), onclick: (e) => { if (!e.target.closest('.tname')) toggle(false); }, title: 'click to expand' },
        h('div', { class: 'tc name', title: r.path },
          h('button', { class: 'tname', type: 'button', 'data-path': r.path, 'aria-expanded': String(open), onclick: () => toggle(true) }, r.path),
          r.conflict ? h('span', { class: 'tag conflict' }, 'conflict') : null),
        cell(r.untracked && !r.conflict ? r.work : r.work, wTag, r.markers ? 'markers' : ''),
        h('div', { class: 'tc arrow' }, wTag && !r.conflict ? '≠' : r.conflict ? '!' : '='),
        cell(r.untracked ? undefined : r.index, iTag),
        h('div', { class: 'tc arrow' }, r.staged ? '≠' : '='),
        cell(r.head, null));
    }) : [h('div', { class: 'empty' }, 'No files yet. Try: echo "hello" > hello.txt')];
    this.el.replaceChildren(status, h('div', { class: 'ttable' }, headRow, ...body),
      h('p', { class: 'legend' },
        h('span', { class: 'tag mod' }, 'modified'), ' differs from the index · ',
        h('span', { class: 'tag staged' }, 'staged'), ' index differs from HEAD · ',
        h('span', { class: 'tag untracked' }, 'untracked'), ' unknown to git · ',
        h('span', { class: 'tag conflict' }, 'conflict'), ' needs resolving'));
  }
}
