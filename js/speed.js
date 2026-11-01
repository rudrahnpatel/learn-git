// Speed round: "which command does this?" against the clock.
import { h } from './dom.js';
import * as game from './ui/game.js';
import { sfx } from './sound.js';
import { ICON } from './ui/fx.js';

const MSG = `(?:"[^"]+"|'[^']+'|\\S+)`;
const R = (s) => new RegExp('^' + s + '$');
const HEAD1 = '(?:HEAD~1?|HEAD\\^1?|@~1?)';

// Each answer is a regex (or function) tested against the normalized input.
export const QUESTIONS = [
  { q: 'Stage every change in the project, including new and deleted files.', a: [R('git add (?:\\.|-A|--all)')], show: 'git add -A' },
  { q: 'Save what is staged as a commit with the message "Fix login".', a: [R(`git commit -m ${MSG}`)], show: 'git commit -m "Fix login"' },
  { q: 'See which files are staged, modified or untracked.', a: [R('git status(?: -s| --short)?')], show: 'git status' },
  { q: 'Create a branch called hotfix and switch to it, in one command.', a: [R('git switch -c hotfix'), R('git checkout -b hotfix')], show: 'git switch -c hotfix' },
  { q: 'Show history with one line per commit.', a: [R('git log --oneline')], show: 'git log --oneline' },
  { q: 'Unstage app.js but keep your edits to it.', a: [R('git restore --staged app\\.js'), R('git reset (?:HEAD )?(?:-- )?app\\.js')], show: 'git restore --staged app.js' },
  { q: 'Throw away your unstaged changes to app.js.', a: [R('git restore app\\.js'), R('git checkout -- app\\.js')], show: 'git restore app.js' },
  { q: 'Undo the last commit but keep its changes staged.', a: [R(`git reset --soft ${HEAD1}`)], show: 'git reset --soft HEAD~1' },
  { q: 'Delete the last commit and all of its changes (local, unpushed).', a: [R(`git reset --hard ${HEAD1}`)], show: 'git reset --hard HEAD~1' },
  { q: 'Change the message of the last commit to "Add login".', a: [R(`git commit --amend -m ${MSG}`)], show: 'git commit --amend -m "Add login"' },
  { q: 'Show changes you have made but not staged yet.', a: [R('git diff')], show: 'git diff' },
  { q: 'Show the changes that are staged for the next commit.', a: [R('git diff --(?:staged|cached)')], show: 'git diff --staged' },
  { q: 'Merge the branch feature into the branch you are on.', a: [R('git merge feature')], show: 'git merge feature' },
  { q: 'Replay your current branch\'s commits on top of main.', a: [R('git rebase main')], show: 'git rebase main' },
  { q: 'Copy commit a1b2c3d onto the current branch.', a: [R('git cherry-pick a1b2c3d')], show: 'git cherry-pick a1b2c3d' },
  { q: 'Undo pushed commit a1b2c3d with a new commit, without rewriting history.', a: [R('git revert a1b2c3d')], show: 'git revert a1b2c3d' },
  { q: 'Shelve your uncommitted changes and get a clean working tree.', a: [R('git stash(?: push)?')], show: 'git stash' },
  { q: 'Re-apply the newest stash and remove it from the stash list.', a: [R('git stash pop')], show: 'git stash pop' },
  { q: 'Download new commits from origin without touching your branches.', a: [R('git fetch(?: origin)?')], show: 'git fetch' },
  { q: 'Push main to origin for the first time and make it track origin/main.', a: [R('git push (?:-u|--set-upstream) origin main')], show: 'git push -u origin main' },
  { q: 'Overwrite your rebased branch on the remote, but only if nobody else pushed meanwhile.', a: [R('git push --force-with-lease(?: origin(?: \\S+)?)?')], show: 'git push --force-with-lease' },
  { q: 'See every place HEAD has pointed recently (to recover lost commits).', a: [R('git reflog(?: show)?')], show: 'git reflog' },
  { q: 'Delete the branch old-ui, which is already merged.', a: [R('git branch -d old-ui')], show: 'git branch -d old-ui' },
  { q: 'Rename the current branch to main.', a: [R('git branch -[mM] main')], show: 'git branch -m main' },
  { q: 'Begin a binary search for the commit that introduced a bug.', a: [R('git bisect start')], show: 'git bisect start' },
  { q: 'Mark the current commit as v1.0 with a lightweight tag.', a: [R('git tag v1\\.0')], show: 'git tag v1.0' },
  { q: 'Show which commit last changed each line of app.js.', a: [R('git blame app\\.js')], show: 'git blame app.js' },
  { q: 'Give up on a merge that stopped with conflicts.', a: [R('git merge --abort')], show: 'git merge --abort' },
  { q: 'You fixed and staged the conflicts of a rebase. Carry on.', a: [R('git rebase --continue')], show: 'git rebase --continue' },
  { q: 'List local and remote-tracking branches.', a: [R('git branch (?:-a|--all)')], show: 'git branch -a' },
  { q: 'Switch to the existing branch main.', a: [R('git switch main'), R('git checkout main')], show: 'git switch main' },
  { q: 'Show commit a1b2c3d together with its diff.', a: [R('git show a1b2c3d')], show: 'git show a1b2c3d' },
  { q: 'Tidy up (squash, reorder, reword) the last 3 commits.', a: [R('git rebase (?:-i|--interactive) (?:HEAD~3|@~3)')], show: 'git rebase -i HEAD~3' },
  { q: 'Stop tracking secret.env but keep the file on disk.', a: [R('git rm --cached secret\\.env')], show: 'git rm --cached secret.env' },
  { q: 'Fetch and replay your local commits on top of the upstream.', a: [R('git pull (?:--rebase|-r)')], show: 'git pull --rebase' },
  { q: 'Draw the history of all branches as a graph, one line per commit.', a: [(s) => /^git log( --\w+)+$/.test(s) && ['--oneline', '--graph', '--all'].every((f) => s.split(' ').includes(f))], show: 'git log --oneline --graph --all' },
  { q: 'Move HEAD back to where it was one step ago, discarding changes.', a: [R('git reset --hard (?:HEAD|@)@\\{1\\}')], show: 'git reset --hard HEAD@{1}' },
  { q: 'Find commits that added or removed the text "apiKey".', a: [R(`git log (?:--oneline )?-S ?${MSG}(?: --oneline)?`)], show: 'git log -S "apiKey"' },
];

export function normalize(s) { return s.trim().replace(/\s+/g, ' '); }
export function isCorrect(q, input) {
  const s = normalize(input);
  return q.a.some((m) => (typeof m === 'function' ? m(s) : m.test(s)));
}

const DURATION = 90;

// opts.onBack(): leave the screen. Scores feed the game: best score, a practice quest, and XP.
export function renderSpeed(root, opts = {}) {
  let qs = [], idx = 0, score = 0, wrong = 0, timer = 0, left = DURATION, running = false, misses = [];
  const best = () => game.G.stats.speedBest || 0;
  const qEl = h('p', { class: 'speed-q' });
  const input = h('input', { class: 'term-in speed-in', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Your command', placeholder: 'git ...' });
  const fb = h('p', { class: 'speed-fb', 'aria-live': 'polite' });
  const scoreEl = h('span', { class: 'big' }, '0');
  const timeEl = h('span', { class: 'big' }, String(DURATION));
  const bestEl = h('span', { class: 'big' }, String(best()));
  const bar = h('div', { class: 'timebar' }, h('div', { class: 'timefill' }));
  const startBtn = h('button', { class: 'btn primary big', onclick: () => start() }, 'Start', h('span', { class: 'arr' }, ' →'));
  const skipBtn = h('button', { class: 'btn', type: 'button', onclick: () => reveal() }, 'Skip');
  const form = h('form', { class: 'speed-form', onsubmit: (e) => { e.preventDefault(); answer(); } }, h('span', { class: 'prompt' }, '$'), input, h('button', { class: 'btn small run', type: 'submit' }, '⏎'), skipBtn);
  const play = h('div', { class: 'speed-play hidden' }, bar, qEl, form, fb);
  const summary = h('div', { class: 'speed-summary' },
    h('p', {}, `You get ${DURATION} seconds. Each line describes a situation: type the git command that handles it. Equivalent forms count (switch -c or checkout -b, --staged or --cached...). Skipping shows the answer.`),
    startBtn);
  root.replaceChildren(h('section', { class: 'speed card' },
    h('div', { class: 'speed-head' },
      h('button', { class: 'icon-btn round quit', 'aria-label': 'Back to practice', html: ICON.close(), onclick: () => { clearInterval(timer); opts.onBack?.(); } }),
      h('h1', {}, 'Speed round'),
      h('div', { class: 'scoreboard' },
        h('div', {}, scoreEl, h('small', {}, 'score')), h('div', {}, timeEl, h('small', {}, 'seconds')), h('div', {}, bestEl, h('small', {}, 'best')))),
    summary, play));

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function start() {
    qs = shuffle([...QUESTIONS]); idx = 0; score = 0; wrong = 0; left = DURATION; running = true; misses = [];
    scoreEl.textContent = '0'; timeEl.textContent = String(left);
    summary.classList.add('hidden'); play.classList.remove('hidden');
    show(); input.focus();
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.body.contains(root)) { clearInterval(timer); return; }
      left--; timeEl.textContent = String(left);
      bar.firstChild.style.width = `${(left / DURATION) * 100}%`;
      if (left <= 0) finish();
    }, 1000);
    bar.firstChild.style.width = '100%';
  }
  function show() { if (idx >= qs.length) { qs = shuffle([...QUESTIONS]); idx = 0; } qEl.textContent = qs[idx].q; wrong = 0; input.value = ''; }
  function answer() {
    if (!running) return;
    const v = input.value;
    if (!v.trim()) return;
    if (isCorrect(qs[idx], v)) {
      score++; scoreEl.textContent = String(score); sfx.correct();
      scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump');
      fb.textContent = `✓ ${normalize(v)}`; fb.className = 'speed-fb ok';
      idx++; show();
    } else {
      wrong++;
      sfx.wrong();
      fb.className = 'speed-fb bad';
      fb.textContent = wrong >= 2 ? `✗ Not quite. One answer: ${qs[idx].show}` : '✗ Not quite. Try again, or skip.';
      input.select();
      if (wrong >= 2) { misses.push(qs[idx]); setTimeout(() => { if (running) { idx++; show(); } }, 1400); }
    }
  }
  function reveal() {
    if (!running) return;
    fb.className = 'speed-fb bad';
    fb.textContent = `Answer: ${qs[idx].show}`;
    misses.push(qs[idx]);
    idx++; show(); input.focus();
  }
  function finish() {
    running = false; clearInterval(timer);
    const isBest = game.recordSpeedScore(score);
    const xp = Math.min(15, score);
    if (xp) game.addXp(xp);
    sfx.complete();
    bestEl.textContent = String(best());
    play.classList.add('hidden'); summary.classList.remove('hidden');
    summary.replaceChildren(...[
      h('p', { class: 'speed-result' }, `Time! You scored ${score}.`, isBest && score > 0 ? h('span', { class: 'tag-pill mono new' }, 'NEW BEST') : null),
      xp ? h('p', { class: 'muted' }, `+${xp} XP`) : null,
      misses.length ? h('div', {}, h('p', { class: 'muted' }, 'Worth another look:'),
        h('ul', { class: 'misses' }, [...new Set(misses)].map((m) => h('li', {}, m.q, ' → ', h('code', {}, m.show))))) : null,
      h('button', { class: 'btn primary big', onclick: () => start() }, 'Play again', h('span', { class: 'arr' }, ' →'))].filter(Boolean));
  }
  return () => clearInterval(timer);
}
