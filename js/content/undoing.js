// Unit 4: Undoing things. restore, reset modes, revert, reflog, and the classic panic rooms.
import { gameHistory, msgAt, fileAt, has, isMerge, span, clean, staged, pushed } from './helpers.js';

const messyDesk = (r) => {
  r.setupCommit('Initial commit', { 'app.js': 'const total = 0;', 'notes.txt': 'meeting notes' });
  r.setupFiles({ 'app.js': 'const total = 0;;;;;; // the cat walked on the keyboard', 'notes.txt': 'meeting notes\n- ship on friday' });
  r.sh('git add notes.txt');
};
const profile = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<a href=profile.html>Me</a>' });
  r.setupCommit('Add profile page', { 'profile.html': '<h1>Profile</h1>' });
  r.setupCommit('Oops, forgot profile styles', { 'profile.css': 'h1 { color: teal; }' });
};
const prices = (r) => {
  r.setupCommit('Initial commit', { 'price.txt': 'price: 10' });
  r.setupCommit('Raise price to 99', { 'price.txt': 'price: 99' });
  r.setupCommit('Add FAQ', { 'faq.md': '# FAQ' });
  r.setupRemote();
};
const mergedExperiment = (r) => {
  r.setupCommit('Initial commit', { 'app.js': 'stable()' });
  r.sh('git switch -c experiment');
  r.setupCommit('Rewrite everything in one file', { 'app.js': 'chaos()' });
  r.sh('git switch main');
  r.setupCommit('Add settings', { 'settings.js': 'settings()' });
  r.sh('git merge experiment');
};
const resetTooFar = (r) => { gameHistory(r); r.sh('git reset --hard HEAD~2'); };
const wrongBranch = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>News</h1>' });
  r.setupRemote();
  r.setupCommit('Start newsletter form', { 'newsletter.html': '<form>email</form>' });
  r.setupCommit('Hook form to API', { 'newsletter.js': 'post("/subscribe")' });
};
const detachedWork = (r) => {
  r.setupCommit('Initial commit', { 'map.js': 'drawMap()' });
  r.setupCommit('Add legend', { 'legend.js': 'legend()' });
  r.sh('git switch --detach HEAD~1');
  r.setupCommit('Try satellite view', { 'satellite.js': 'tiles("sat")' });
  r.setupCommit('Satellite zoom levels', { 'zoom.js': 'zoom(1, 18)' });
};

export default {
  id: 'undoing', title: 'Undoing things', color: 'red',
  blurb: 'restore, reset, revert, reflog. And a few panic rooms.',
  challenges: ['reflog', 'wrong-branch', 'revert'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'undoing-1', title: 'Undo before committing',
      exercises: [
        {
          id: 'un1-restore', type: 'learn', new: true, title: 'git restore',
          body: '<code>git restore file</code> throws away unstaged edits, copying the file back from the index. <code>git restore --staged file</code> unstages it instead and keeps your edit. Careful: discarded edits were never committed, so they are gone.',
        },
        {
          id: 'un1-gone', type: 'choice',
          prompt: 'You ran <code>git restore app.js</code> on an edit you never staged or committed. Can git bring it back?',
          options: ['No: it was never saved in git, so it is gone', 'Yes, with git reflog', 'Yes, with git stash pop', 'Yes, with git restore --undo'],
          answer: 0,
          explain: 'The reflog only remembers commits. Unsaved edits only lived in your working tree. Your editor\'s undo is the last hope.',
        },
        {
          id: 'un1-source', type: 'learn', new: true, title: 'Other sources, older spellings',
          body: '<code>git restore --source=HEAD~2 file</code> copies the file from any commit instead of the index: here, two commits back. Old tutorials write <code>git checkout -- file</code> for a plain <code>git restore file</code>; <code>checkout</code> once did both branches and files.',
        },
        {
          id: 'un1-fill-source', type: 'fill',
          prompt: 'Bring back config.json exactly as it was two commits ago.',
          before: 'git restore ', after: '=HEAD~2 config.json',
          options: ['--source', '--from', '--commit', '--rev'],
          answer: 0,
          explain: '<code>--source</code> picks the commit to copy from. Without it, restore copies from the index.',
        },
        {
          id: 'un1-clean', type: 'learn', new: true, title: 'git clean',
          body: '<code>git clean</code> deletes untracked files (ignored ones are left alone). Because that cannot be undone, it refuses to run without <code>-f</code>. Preview first with <code>git clean -n</code>.',
        },
        {
          id: 'un1-match', type: 'match',
          prompt: 'Match each command to what it undoes.',
          pairs: [
            ['git restore app.js', 'Throw away unstaged edits to app.js'],
            ['git restore --staged app.js', 'Unstage app.js, keep the edit'],
            ['git restore --source=HEAD~2 app.js', 'Bring back app.js from two commits ago'],
            ['git clean -f', 'Delete untracked files'],
          ],
          explain: 'restore works on files and never moves a branch. clean is the only one that deletes files git has never seen.',
        },
        {
          id: 'un1-build-unstage', type: 'build',
          prompt: 'Unstage <code>notes.txt</code> but keep your edit.',
          tiles: ['git', 'restore', '--staged', 'notes.txt', 'reset', '--hard', 'rm'],
          answers: [['git', 'restore', '--staged', 'notes.txt'], ['git', 'restore', 'notes.txt', '--staged'], ['git', 'reset', 'notes.txt']],
          explain: '<code>git reset notes.txt</code> is the older way to unstage one file. <code>--hard</code> would discard your edit as well.',
        },
        {
          id: 'un1-checkout-dashdash', type: 'choice',
          prompt: 'An old tutorial says <code>git checkout -- app.js</code>. What does it do?',
          options: ['The same as git restore app.js: discard unstaged edits', 'Switch to a branch called app.js', 'Create a branch from app.js', 'Commit app.js'],
          answer: 0,
          explain: '<code>checkout</code> used to do both branches and files. <code>switch</code> and <code>restore</code> split those jobs so they are harder to mix up.',
        },
        {
          id: 'un1-type-discard', type: 'type',
          prompt: 'The cat walked on your keyboard: <code>app.js</code> is full of semicolons. Throw that edit away.',
          setup: (r) => { r.setupCommit('Initial commit', { 'app.js': 'const total = 0;' }); r.setupFiles({ 'app.js': 'const total = 0;;;;;; // cat' }); },
          check: (r) => r.s.work['app.js'] === 'const total = 0;\n' && clean(r),
          solution: 'git restore app.js',
          explain: 'app.js matches the last commit again, and status is clean.',
        },
        {
          id: 'un1-type-both', type: 'type',
          prompt: 'Unstage <code>notes.txt</code> (keep the edit), and throw away the cat\'s edit to <code>app.js</code>.',
          setup: messyDesk,
          check: (r) => !staged(r, 'notes.txt') && has(r.s.work['notes.txt'], 'friday') && r.s.work['app.js'] === 'const total = 0;\n',
          solution: 'git restore --staged notes.txt && git restore app.js',
          explain: 'Two different undos: one for the index, one for the working tree. Your notes survive, the semicolons do not.',
        },
        {
          id: 'un1-type-clean', type: 'type',
          prompt: 'Your folder is full of untracked scratch files. Delete every untracked file.',
          setup: (r) => { r.setupCommit('Initial commit', { 'app.js': 'app()' }); r.setupFiles({ 'scratch1.txt': 'tmp', 'scratch2.txt': 'tmp', 'old-idea.js': 'nope()' }); },
          check: (r) => r.untracked().length === 0 && 'app.js' in r.s.work,
          solution: 'git clean -f',
          explain: 'Tracked files are safe from clean. Next time, run <code>git clean -n</code> first to see the list.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'undoing-2', title: 'reset: move the branch back',
      exercises: [
        {
          id: 'un2-reset', type: 'learn', new: true, title: 'git reset and its three modes',
          body: '<code>git reset &lt;commit&gt;</code> moves your current branch back to that commit. The mode decides what happens to the changes you stepped over: <code>--soft</code> keeps them staged, <code>--mixed</code> (default) keeps them unstaged, <code>--hard</code> throws them away.',
          demo: { setup: gameHistory, run: ['git reset HEAD~1'] },
        },
        {
          id: 'un2-match-modes', type: 'match',
          prompt: 'Match each reset mode to what you are left with.',
          pairs: [
            ['--soft', 'Branch moved; changes still staged'],
            ['--mixed', 'Branch moved; changes in files, unstaged'],
            ['--hard', 'Branch moved; changes discarded'],
            ['No mode given', 'Same as --mixed, the default'],
          ],
          explain: 'All three move the branch the same way. They only differ in how much of the index and working tree they also reset.',
        },
        {
          id: 'un2-graph-reset', type: 'graph',
          prompt: 'Which graph does this give?',
          setup: gameHistory,
          command: 'git reset HEAD~1',
          distractors: [['git revert --no-edit HEAD'], ['git reset HEAD~2']],
          explain: 'main steps back one commit and "Add level 2" fades out. Revert would add a new commit instead of moving back.',
        },
        {
          id: 'un2-soft-where', type: 'choice',
          prompt: 'After <code>git reset --soft HEAD~1</code>, where are the last commit\'s changes?',
          options: ['Staged in the index, ready to commit again', 'Gone', 'Unstaged in your files', 'In a new branch'],
          answer: 0,
          explain: '--soft only moves the branch. The index still holds the snapshot you had, so <code>git commit</code> would recreate it.',
        },
        {
          id: 'un2-fill-soft', type: 'fill',
          prompt: 'Fold the last two commits back into the index, so one git commit can replace them.',
          before: 'git reset ', after: ' HEAD~2',
          options: ['--soft', '--hard', '--mixed', '--keep'],
          answer: 0,
          explain: '--soft keeps everything staged, which makes it the quickest way to squash recent commits.',
        },
        {
          id: 'un2-hard', type: 'learn', new: true, title: '--hard is the sharp one',
          body: '<code>git reset --hard</code> also overwrites your index and working tree. Uncommitted edits are lost for good. Committed work is still recoverable for a while through the reflog. With no commit named, reset uses HEAD: plain <code>git reset</code> just unstages everything.',
          teaches: ['reset defaults to HEAD'],
        },
        {
          id: 'un2-hard-dirty', type: 'choice',
          prompt: 'You have uncommitted edits and run <code>git reset --hard HEAD</code>. What happens to them?',
          options: ['They are discarded permanently', 'They are stashed automatically', 'They are committed first', 'Nothing; HEAD did not move'],
          answer: 0,
          explain: 'Even without moving the branch, --hard resets every tracked file to the commit. Stash first if you are unsure.',
        },
        {
          id: 'un2-build-soft', type: 'build',
          prompt: 'Move the branch back two commits and keep their changes staged.',
          tiles: ['git', 'reset', '--soft', 'HEAD~2', '--hard', 'HEAD~1', 'revert'],
          answers: [['git', 'reset', '--soft', 'HEAD~2'], ['git', 'reset', 'HEAD~2', '--soft']],
          explain: '<code>--hard</code> would discard the changes, and <code>HEAD~1</code> would only go back one commit.',
        },
        {
          id: 'un2-type-squash', type: 'type',
          prompt: 'Two commits ("Add profile page" and "Oops, forgot profile styles") should be one. Replace them with a single commit called <code>Add profile page</code>.',
          setup: profile,
          check: (r) => msgAt(r, 'HEAD') === 'Add profile page' && msgAt(r, 'HEAD~1') === 'Initial commit' && fileAt(r, 'HEAD', 'profile.css') !== undefined && fileAt(r, 'HEAD', 'profile.html') !== undefined && clean(r),
          solution: 'git reset --soft HEAD~2 && git commit -m "Add profile page"',
          explain: 'reset --soft plus commit is a squash without an interactive rebase. Both originals fade out of the graph.',
        },
        {
          id: 'un2-type-unstage-all', type: 'type', needs: ['reset defaults to HEAD'],
          prompt: 'You staged everything with <code>git add .</code> too early. Unstage it all, keeping every edit.',
          setup: (r) => { r.setupCommit('Initial commit', { 'a.js': 'a()', 'b.js': 'b()' }); r.setupFiles({ 'a.js': 'a(1)', 'b.js': 'b(2)' }); r.sh('git add .'); },
          check: (r) => r.stagedChanges().length === 0 && r.s.work['a.js'] === 'a(1)\n' && r.s.work['b.js'] === 'b(2)\n',
          solution: 'git reset',
          explain: 'Plain <code>git reset</code> is a mixed reset to HEAD: the branch stays put, and the index is reset to match it.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'undoing-3', title: 'revert: undo in public',
      exercises: [
        {
          id: 'un3-revert', type: 'learn', new: true, title: 'git revert',
          body: '<code>git revert &lt;commit&gt;</code> makes a <b>new</b> commit that does the exact opposite of an old one. History only grows, so it is safe on branches your team already pulled.',
          demo: { setup: prices, run: ['git revert --no-edit HEAD~1'] },
        },
        {
          id: 'un3-shared', type: 'learn', new: true, title: 'Pushed means shared',
          body: 'Teams share commits through a remote copy of the repo, <code>origin</code>. <code>git push</code> uploads your new commits there; <code>origin/main</code> marks where its main is. Once a commit is pushed, teammates build on it: undo it with a new commit, never by moving main back.',
          teaches: ['origin/main'],
        },
        {
          id: 'un3-graph-revert', type: 'graph', needs: ['origin/main'],
          prompt: '"Raise price to 99" (<code>HEAD~1</code>) was a mistake, and main is already pushed. Which graph?',
          setup: prices,
          command: 'git revert --no-edit HEAD~1',
          distractors: [['git reset --hard HEAD~1'], ['git reset --hard HEAD~2']],
          explain: 'A new commit on top, and nothing removed. The resets drag main back behind origin/main, losing the FAQ on the way, and would need a force-push.',
        },
        {
          id: 'un3-which-safe', type: 'choice', needs: ['origin/main'],
          prompt: 'The bad commit is on <code>origin/main</code> and teammates have pulled it. Which undo is safe?',
          options: ['git revert', 'git reset --hard', 'git commit --amend', 'git rebase -i'],
          answer: 0,
          explain: 'The other three rewrite history that others already have. Revert just adds a commit everyone can pull normally.',
        },
        {
          id: 'un3-merge', type: 'learn', new: true, title: 'Reverting a merge',
          body: 'A merge has two parents, so git needs to know which side was the mainline. <code>git revert -m 1 &lt;merge&gt;</code> keeps parent 1 (the branch you merged into) and undoes everything the merge brought in.',
        },
        {
          id: 'un3-fill-m', type: 'fill',
          prompt: 'Undo the merge commit at HEAD, keeping main\'s side.',
          before: 'git revert ', after: ' 1 HEAD',
          options: ['-m', '-p', '-x', '--parent'],
          answer: 0,
          explain: '<code>-m</code> (mainline) says which parent to keep. Without it, git refuses to revert a merge.',
        },
        {
          id: 'un3-match', type: 'match',
          prompt: 'Match each undo to when you would use it.',
          pairs: [
            ['git revert <commit>', 'Undo a pushed commit with a new commit'],
            ['git reset --hard HEAD~1', 'Drop an unpushed commit entirely'],
            ['git revert -m 1 <merge>', 'Undo a whole merge, keeping parent 1'],
            ['git restore <file>', 'Undo uncommitted edits'],
          ],
          explain: 'Ask two questions: is it committed, and has anyone else got it?',
        },
        {
          id: 'un3-order', type: 'order', needs: ['origin/main'],
          prompt: 'A bad commit is already on origin/main. Undo it the safe way.',
          steps: ['git log --oneline (find the bad commit)', 'git revert <id>', 'git push'],
          explain: 'Find it, revert it, share the revert. Nobody has to force anything.',
        },
        {
          id: 'un3-build', type: 'build',
          prompt: 'Undo the commit just below HEAD with a new commit.',
          tiles: ['git', 'revert', 'HEAD~1', 'reset', '--hard', 'HEAD'],
          answers: [['git', 'revert', 'HEAD~1']],
          explain: 'Revert only undoes the commit you name. The commits after it stay as they are.',
        },
        {
          id: 'un3-type-revert', type: 'type',
          prompt: 'Undo "Raise price to 99" without rewriting history, and push the fix. The FAQ commit must stay.',
          setup: prices,
          check: (r) => has(fileAt(r, 'main', 'price.txt'), 'price: 10') && fileAt(r, 'main', 'faq.md') !== undefined && /^Revert/.test(msgAt(r, 'main')) && pushed(r),
          solution: 'git revert --no-edit HEAD~1 && git push',
          explain: 'Teammates just pull the revert. The history honestly shows the mistake and its fix.',
        },
        {
          id: 'un3-type-revert-merge', type: 'type',
          prompt: 'The merge of <code>experiment</code> at HEAD broke main, and it is already shared. Undo the whole merge with a new commit.',
          setup: mergedExperiment,
          check: (r) => /^Revert/.test(msgAt(r, 'HEAD')) && isMerge(r, 'HEAD~1') && fileAt(r, 'HEAD', 'app.js') === 'stable()\n' && fileAt(r, 'HEAD', 'settings.js') !== undefined,
          solution: 'git revert -m 1 HEAD',
          explain: 'app.js is stable again and settings.js stays. One catch: merging experiment again later will not re-add those changes, because git sees them as already merged. You would revert the revert.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'undoing-4', title: 'reflog: the safety net',
      exercises: [
        {
          id: 'un4-reflog', type: 'learn', new: true, title: 'git reflog',
          body: 'Git quietly logs every place HEAD has been: commits, resets, rebases, switches. A commit that seems lost after a bad reset is still listed there, as <code>HEAD@{1}</code>, <code>HEAD@{2}</code>…, for weeks.',
          demo: { setup: resetTooFar, run: ['git reset --hard HEAD@{1}'] },
        },
        {
          id: 'un4-read', type: 'choice',
          prompt: 'Here is <code>git reflog</code>. Where was HEAD just before the reset?',
          code: 'a1b2c3d HEAD@{0}: reset: moving to HEAD~2\ne4f5a6b HEAD@{1}: commit: Add level 2\nc7d8e9f HEAD@{2}: commit: Add enemies',
          options: ['HEAD@{1}', 'HEAD@{0}', 'HEAD@{2}', 'HEAD~1'],
          answer: 0,
          explain: 'HEAD@{0} is now, HEAD@{1} is one move ago. <code>HEAD~1</code> means something different: the parent commit.',
        },
        {
          id: 'un4-graph', type: 'graph',
          prompt: 'You reset two commits too far. Which graph does this give?',
          setup: resetTooFar,
          command: 'git reset --hard HEAD@{1}',
          distractors: [['git reset --hard HEAD~1'], ['git reset --hard HEAD@{2}']],
          explain: 'HEAD@{1} is where you were right before the bad reset, so main jumps back to "Add level 2". HEAD~1 walks further into the past.',
        },
        {
          id: 'un4-orig-head', type: 'learn', new: true, title: 'ORIG_HEAD: one step back',
          body: 'Reset, merge and rebase save where HEAD was before they moved it, as <code>ORIG_HEAD</code>. So <code>git reset --hard ORIG_HEAD</code> undoes the last of them in one step, no reflog reading needed. The next reset, merge or rebase overwrites it.',
          demo: { setup: resetTooFar, run: ['git reset --hard ORIG_HEAD'] },
        },
        {
          id: 'un4-fill-orig', type: 'fill',
          prompt: 'Undo the reset you just made.',
          before: 'git reset --hard ', after: '',
          options: ['ORIG_HEAD', 'HEAD@{0}', 'HEAD~1', 'origin/HEAD'],
          answer: 0,
          explain: 'reset, merge and rebase all save the previous position in <code>ORIG_HEAD</code>. <code>HEAD@{0}</code> is where you are now.',
        },
        {
          id: 'un4-branch', type: 'learn', new: true, title: 'Rescue with a branch',
          body: 'Not sure? Do not move anything. <code>git branch rescue HEAD@{1}</code> puts a new label on the lost commit, so it is safe and visible again, and you can decide later.',
        },
        {
          id: 'un4-match', type: 'match',
          prompt: 'Match each name to the commit it means.',
          pairs: [
            ['HEAD@{0}', 'Where HEAD is now'],
            ['HEAD@{1}', 'Where HEAD was one move ago'],
            ['HEAD~1', 'The parent of the current commit'],
            ['ORIG_HEAD', 'Before the last reset, merge or rebase'],
          ],
          explain: '<code>@{n}</code> walks back through time (the reflog). <code>~n</code> walks back through parents (the graph).',
        },
        {
          id: 'un4-build', type: 'build',
          prompt: 'Put a branch called <code>rescue</code> on the commit HEAD was on one move ago, without switching to it.',
          tiles: ['git', 'branch', 'rescue', 'HEAD@{1}', 'HEAD~1', 'switch', 'reset'],
          answers: [['git', 'branch', 'rescue', 'HEAD@{1}']],
          explain: '<code>git branch name &lt;commit&gt;</code> creates a label anywhere. HEAD~1 would be the parent, which is not the lost commit.',
        },
        {
          id: 'un4-type-reset', type: 'type',
          prompt: 'You ran <code>git reset --hard HEAD~2</code> by mistake and lost "Add enemies" and "Add level 2". Get main back to where it was.',
          setup: resetTooFar,
          check: (r) => msgAt(r, 'main') === 'Add level 2' && fileAt(r, 'main', 'enemies.js') !== undefined && clean(r),
          solution: 'git reset --hard HEAD@{1}',
          explain: '<code>git reset --hard ORIG_HEAD</code> works too. The reflog makes "lost" commits a two-second fix.',
        },
        {
          id: 'un4-local', type: 'choice',
          prompt: 'Is your reflog shared with teammates when you push?',
          options: ['No, it is local to your clone', 'Yes, push uploads it', 'Only for main', 'Only if you push with --all'],
          answer: 0,
          explain: 'The reflog is your personal history of where HEAD went. That is also why it cannot rescue work that never reached your machine.',
        },
        {
          id: 'un4-type-deleted', type: 'type',
          prompt: 'You deleted the unmerged <code>experiment</code> branch with <code>-D</code>, and want it back. Its last commit was "Try boss fight".',
          setup: (r) => {
            gameHistory(r);
            r.sh('git switch -c experiment');
            r.setupCommit('Try boss fight', { 'boss.js': 'boss()' });
            r.sh('git switch main');
            r.sh('git branch -D experiment');
          },
          check: (r) => msgAt(r, 'experiment') === 'Try boss fight',
          solution: 'git branch experiment HEAD@{1}',
          explain: 'Switching to main was HEAD@{0}, so HEAD@{1} is the boss-fight commit. A new label and the branch is back.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'undoing-5', title: 'Panic rooms',
      exercises: [
        {
          id: 'un5-wrong-branch', type: 'learn', new: true, title: 'Committed on the wrong branch',
          body: 'Commits on main that belong on a feature branch? Branches are just labels, so relabel: create the new branch where you are (the commits are safe there), then move main back.',
          demo: { setup: wrongBranch, run: ['git branch newsletter', 'git reset --hard origin/main'] },
        },
        {
          id: 'un5-order', type: 'order', needs: ['origin/main'],
          prompt: 'Two commits on main belong on <code>newsletter</code>. You are on main.',
          steps: ['git branch newsletter', 'git reset --hard origin/main', 'git switch newsletter'],
          explain: 'Label first, so the commits are kept. Then main can safely move back. Reversing the first two would orphan the work.',
        },
        {
          id: 'un5-graph', type: 'graph', needs: ['origin/main'],
          prompt: 'You are on main, two commits ahead of origin/main. Which graph?',
          setup: wrongBranch,
          command: 'git branch newsletter && git reset --hard origin/main',
          distractors: [['git reset --hard origin/main'], ['git switch -c newsletter']],
          explain: 'newsletter keeps both commits and main is back at origin/main. Resetting without the branch would orphan them, and switch -c alone leaves main ahead.',
        },
        {
          id: 'un5-detached', type: 'choice',
          prompt: '<code>git status</code> says <i>"HEAD detached at 3f2a1b9"</i>. What does that mean?',
          options: ['HEAD points at a commit, not a branch', 'Your repository is corrupted', 'You are offline', 'The branch was deleted on the remote'],
          answer: 0,
          explain: 'You can look around and even commit, but no branch follows those commits. Give them a branch before you leave.',
        },
        {
          id: 'un5-fill-detached', type: 'fill',
          prompt: 'You made commits on a detached HEAD. Keep them on a new branch called satellite.',
          before: 'git switch ', after: ' satellite',
          options: ['-c', '-d', '--detach', '-f'],
          answer: 0,
          explain: 'Creating a branch right where you are captures every commit you made since detaching.',
        },
        {
          id: 'un5-match', type: 'match',
          prompt: 'Match each emergency to its fix.',
          pairs: [
            ['Committed to the wrong branch', 'Branch here, then reset main back'],
            ['Merge full of conflicts, not ready', 'git merge --abort'],
            ['Merged locally by mistake, not pushed', 'git reset --hard ORIG_HEAD'],
            ['Bad commit already pushed', 'git revert'],
          ],
          explain: 'Most rescues are just moving labels around, and the reflog has your back if you move the wrong one.',
        },
        {
          id: 'un5-first-parent', type: 'choice', needs: ['first parent'],
          prompt: 'Right after a merge on main, <code>git reset --hard HEAD~1</code> goes to which commit?',
          options: ['main\'s tip from before the merge (first parent)', 'The merged branch\'s tip', 'The merge base', 'It fails on merge commits'],
          answer: 0,
          explain: '<code>~</code> follows first parents, and a merge\'s first parent is the branch you were on. So it undoes the merge exactly.',
        },
        {
          id: 'un5-build', type: 'build',
          prompt: 'Undo the local merge you just made (not pushed yet).',
          tiles: ['git', 'reset', '--hard', 'ORIG_HEAD', 'revert', 'HEAD~2', '--soft'],
          answers: [['git', 'reset', '--hard', 'ORIG_HEAD'], ['git', 'reset', 'ORIG_HEAD', '--hard']],
          explain: 'After a merge, ORIG_HEAD is where your branch was before it. --hard also brings your files back to that state.',
        },
        {
          id: 'un5-type-detached', type: 'type',
          prompt: 'You are on a detached HEAD with two satellite-view commits. Save them on a branch called <code>satellite</code>.',
          setup: detachedWork,
          check: (r) => r.branchName() === 'satellite' && msgAt(r, 'satellite') === 'Satellite zoom levels' && msgAt(r, 'main') === 'Add legend',
          solution: 'git switch -c satellite',
          explain: 'The commits now have a home. main was never touched.',
        },
        {
          id: 'un5-type-undo-merge', type: 'type',
          prompt: 'You merged <code>experiment</code> into main by accident (not pushed). Put main back exactly where it was. Keep the experiment branch.',
          setup: mergedExperiment,
          check: (r) => msgAt(r, 'main') === 'Add settings' && msgAt(r, 'experiment') === 'Rewrite everything in one file' && r.s.work['app.js'] === 'stable()\n' && clean(r),
          solution: 'git reset --hard ORIG_HEAD',
          explain: 'main is back on "Add settings". <code>git reset --hard HEAD~1</code> works too, since the first parent is main\'s old tip.',
        },
      ],
    },
  ],
};
