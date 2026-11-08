// Unit 3: Rewriting history. amend, rebase, interactive rebase, cherry-pick, --onto, squash merges.
import { msgAt, fileAt, has, isMerge, noMerges, span, clean } from './helpers.js';

const loginCommitted = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<a href=login.html>Log in</a>' });
  r.setupCommit('Add login page', { 'login.html': '<form>login</form>' });
  r.setupFiles({ 'login.css': 'form { margin: 0 auto; }' });
};
const shopFeature = (r) => {
  r.setupCommit('Initial commit', { 'app.js': 'app()' });
  r.sh('git switch -c feature');
  r.setupCommit('Add cart', { 'cart.js': 'cart()' });
  r.setupCommit('Add checkout', { 'checkout.js': 'checkout()' });
  r.sh('git switch main');
  r.setupCommit('Update footer', { 'footer.html': '<footer>2025</footer>' });
  r.setupCommit('Add privacy page', { 'privacy.html': '<h1>Privacy</h1>' });
  r.sh('git switch feature');
};
const weatherRebaseConflict = (r) => {
  r.setupCommit('Initial commit', { 'README.md': '# Weather app\nShows the forecast.\nVersion: 1' });
  r.sh('git switch -c units');
  r.setupCommit('Mention units', { 'README.md': '# Weather app\nShows the forecast in °C or °F.\nVersion: 1' });
  r.sh('git switch main');
  r.setupCommit('Describe forecast range', { 'README.md': '# Weather app\nShows a 7-day forecast.\nVersion: 1' });
  r.sh('git switch units');
  r.run('git rebase main');
};
const releaseDev = (r) => {
  r.setupCommit('Release 1.0', { 'cart.js': 'return items.reduce(add)', 'version.txt': '1.0' });
  r.sh('git branch release');
  r.sh('git switch -c dev');
  r.setupCommit('Add dark theme', { 'theme.css': 'body { background: #111; }' });
  r.setupCommit('Fix crash on empty cart', { 'cart.js': 'if (!items.length) return 0;\nreturn items.reduce(add)' });
  r.setupCommit('Experimental AI search', { 'ai.js': 'magic()' });
  r.sh('git switch release');
};
const releaseDevFixes = (r) => {
  r.setupCommit('Release 1.0', { 'cart.js': 'return items.reduce(add)', 'version.txt': '1.0' });
  r.sh('git branch release');
  r.sh('git switch -c dev');
  r.setupCommit('Experimental AI search', { 'ai.js': 'magic()' });
  r.setupCommit('Fix crash on empty cart', { 'cart.js': 'if (!items.length) return 0;\nreturn items.reduce(add)' });
  r.setupCommit('Fix rounding in total', { 'total.js': 'Math.round(total * 100) / 100' });
  r.sh('git switch release');
};
const stackedBranches = (r) => {
  r.setupCommit('Initial commit', { 'app.js': 'app()' });
  r.sh('git switch -c feature-a');
  r.setupCommit('Add profile API', { 'api.js': 'profile()' });
  r.setupCommit('Cache profile API', { 'api.js': 'cached(profile)()' });
  r.sh('git switch -c feature-b');
  r.setupCommit('Add help page', { 'help.html': '<h1>Help</h1>' });
  r.sh('git switch main');
};
const searchFeature = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>' });
  r.sh('git switch -c feature');
  r.setupCommit('Add search box', { 'search.html': '<input type=search>' });
  r.setupCommit('wip', { 'search.js': 'search(q)' });
  r.setupCommit('fix typo', { 'search.js': 'search(query)' });
  r.sh('git switch main');
  r.setupCommit('Update footer', { 'footer.html': '<footer>2025</footer>' });
};

export default {
  id: 'rewriting', title: 'Rewriting history', color: 'pink',
  blurb: 'Amend, rebase, interactive cleanup and cherry-picking.',
  challenges: ['rebase', 'squash', 'cherry-pick'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'rewriting-1', title: 'Fix the last commit',
      exercises: [
        {
          id: 'rw1-amend', type: 'learn', new: true, title: 'git commit --amend',
          body: 'Forgot a file, or typo in the message? <code>git commit --amend</code> <b>replaces</b> the last commit with a new one: whatever is staged now, plus the old changes, with a new message if you give <code>-m</code>.',
          demo: { setup: (r) => { loginCommitted(r); r.sh('git add login.css'); }, run: ['git commit --amend --no-edit'] },
        },
        {
          id: 'rw1-graph-amend', type: 'graph',
          prompt: '<code>login.css</code> is staged. Which graph does this give?',
          setup: (r) => { loginCommitted(r); r.sh('git add login.css'); },
          command: 'git commit --amend --no-edit',
          distractors: [['git commit -m "Add login styles"']],
          explain: 'Amend swaps the last commit for a new one with the same parent. The old commit fades out: nothing points at it any more.',
        },
        {
          id: 'rw1-new-id', type: 'choice',
          prompt: 'After <code>git commit --amend</code>, does the commit keep its old id?',
          options: ['No, it is a brand-new commit with a new id', 'Yes, amend edits the commit in place', 'Only if the message stays the same', 'Only if you add no files'],
          answer: 0,
          explain: 'Commits never change. Amend builds a new one and moves the branch to it. That is why amending pushed work causes trouble.',
        },
        {
          id: 'rw1-match', type: 'match',
          prompt: 'Match each amend recipe to its effect.',
          pairs: [
            ['git add login.css, then --amend --no-edit', 'Add a forgotten file, keep the message'],
            ['git commit --amend -m "Add login page"', 'Fix the message'],
            ['--no-edit', 'Reuse the old message without an editor'],
            ['git commit -m "oops"', 'A separate new commit, nothing replaced'],
          ],
          explain: 'Amend only ever touches the newest commit. Older commits need an interactive rebase.',
        },
        {
          id: 'rw1-fill-no-edit', type: 'fill',
          prompt: 'Amend the last commit and keep its message, without opening an editor.',
          before: 'git commit --amend ', after: '',
          options: ['--no-edit', '--keep', '--same', '--quiet'],
          answer: 0,
          explain: '<code>--no-edit</code> reuses the existing message as it is.',
        },
        {
          id: 'rw1-pushed', type: 'choice',
          prompt: 'Why think twice before amending a commit your teammates already have?',
          options: ['Amend makes a new commit, so your copy and theirs no longer match', 'Amend deletes their copy of the branch', 'Shared commits cannot be amended at all', 'Amend sends the change to them automatically'],
          answer: 0,
          explain: 'Teammates may already have the old commit. Rewriting it means a force-push, and their copies diverge from yours.',
        },
        {
          id: 'rw1-build-amend', type: 'build',
          prompt: 'Replace the last commit\'s message with <code>Add login page</code>.',
          tiles: ['git', 'commit', '--amend', '-m', '"Add login page"', '--no-edit', 'push'],
          answers: [['git', 'commit', '--amend', '-m', '"Add login page"'], ['git', 'commit', '-m', '"Add login page"', '--amend']],
          explain: 'With <code>-m</code>, amend uses your new message. With <code>--no-edit</code> it would keep the old one.',
        },
        {
          id: 'rw1-type-forgot', type: 'type',
          prompt: 'Your last commit "Add login page" forgot <code>login.css</code>. Put it into that same commit and keep the message.',
          setup: loginCommitted,
          check: (r) => msgAt(r, 'HEAD') === 'Add login page' && msgAt(r, 'HEAD~1') === 'Initial commit' && fileAt(r, 'HEAD', 'login.css') !== undefined && clean(r),
          solution: 'git add login.css && git commit --amend --no-edit',
          explain: 'Still one commit, now complete. The graph shows the faded original that got replaced.',
        },
        {
          id: 'rw1-type-message', type: 'type',
          prompt: 'You committed with the message <code>Add logn page</code>. Fix it to <code>Add login page</code>.',
          setup: (r) => { r.setupCommit('Initial commit', { 'index.html': '<a href=login.html>Log in</a>' }); r.setupCommit('Add logn page', { 'login.html': '<form>login</form>' }); },
          check: (r) => msgAt(r, 'HEAD') === 'Add login page' && msgAt(r, 'HEAD~1') === 'Initial commit',
          solution: 'git commit --amend -m "Add login page"',
          explain: 'Nothing was staged, so only the message changed. Same files, new commit.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'rewriting-2', title: 'Rebase',
      exercises: [
        {
          id: 'rw2-rebase', type: 'learn', new: true, title: 'Replay on top',
          body: '<code>git rebase main</code> takes the commits on your branch that main lacks and replays them, one by one, on top of main\'s tip. History becomes a straight line, as if you had started today. <code>git rebase main feature</code> switches to feature first.',
          teaches: ['rebase <base> <branch>'],
          demo: { setup: shopFeature, run: ['git rebase main'] },
        },
        {
          id: 'rw2-graph-rebase', type: 'graph',
          prompt: 'You are on <code>feature</code>; main has moved on. Which graph?',
          setup: shopFeature,
          command: 'git rebase main',
          distractors: [['git merge main'], ['git switch main', 'git rebase feature']],
          explain: 'feature\'s two commits are copied onto main\'s tip, and the originals fade. A merge would add a merge commit instead, and rebasing from main would move main.',
        },
        {
          id: 'rw2-new-ids', type: 'choice',
          prompt: 'After a rebase, your commits have new ids. Why?',
          options: ['Each commit records its parent, and the parent changed', 'Rebase renames commits randomly', 'Ids include the time of the rebase only', 'They do not; ids stay the same'],
          answer: 0,
          explain: 'A commit\'s id comes from its content, message and parent. New parent, new commit. The old ones still exist until they are cleaned up.',
        },
        {
          id: 'rw2-conflicts', type: 'learn', new: true, title: 'Conflicts mid-rebase',
          body: 'A rebase can stop on any commit it replays. Fix the file, <code>git add</code> it, then <code>git rebase --continue</code>. <code>--skip</code> drops that commit; <code>--abort</code> undoes everything. Mid-rebase, HEAD is the base you replay onto, so ours and theirs swap.',
          teaches: ['rebase sides swap'],
        },
        {
          id: 'rw2-order-conflict', type: 'order',
          prompt: 'A rebase hits a conflict. Put the steps in order.',
          steps: ['git rebase main (stops: CONFLICT)', 'Edit README.md, remove the markers', 'git add README.md', 'git rebase --continue'],
          explain: 'Same as a merge conflict, except the last step is <code>--continue</code>, which commits this step and replays the rest.',
        },
        {
          id: 'rw2-fill-continue', type: 'fill',
          prompt: 'You fixed and staged the conflict. Carry on with the rebase.',
          before: 'git rebase ', after: '',
          options: ['--continue', '--commit', '--next', '--resume'],
          answer: 0,
          explain: '<code>--continue</code> records the fixed commit and moves on to the next one in the list.',
        },
        {
          id: 'rw2-match', type: 'match',
          prompt: 'Merge or rebase? Match each to its description.',
          pairs: [
            ['git merge main', 'Keeps history as it happened, adds a merge commit'],
            ['git rebase main', 'Rewrites your commits onto a new base'],
            ['git rebase --continue', 'Carry on after fixing a conflict'],
            ['git rebase --abort', 'Go back to before the rebase started'],
          ],
          explain: 'Both integrate the same changes. Merge preserves history; rebase rewrites it into a straight line.',
        },
        {
          id: 'rw2-build-two-arg', type: 'build', needs: ['rebase <base> <branch>'],
          prompt: 'You are on <code>main</code>. Rebase <code>feature</code> onto main in one command.',
          tiles: ['git', 'rebase', 'main', 'feature', 'merge', 'switch'],
          answers: [['git', 'rebase', 'main', 'feature']],
          explain: 'The optional second argument is the branch to rebase: git switches to it first, then replays it onto the first argument.',
        },
        {
          id: 'rw2-type-rebase', type: 'type',
          prompt: 'Rebase <code>feature</code> onto <code>main</code> so history is one straight line. Do not move main.',
          setup: shopFeature,
          check: (r) => r.isAncestor(r.s.branches.main, r.s.branches.feature) && noMerges(r, 'main', 'feature') && msgAt(r, 'main') === 'Add privacy page' && span(r, 'main', 'feature').length === 2,
          solution: 'git rebase main',
          explain: 'feature now starts from main\'s newest commit. Merging it into main later will be a fast-forward.',
        },
        {
          id: 'rw2-type-abort', type: 'type',
          prompt: 'Rebasing <code>units</code> onto main stopped on a conflict in README.md. Not today: undo the whole rebase.',
          setup: weatherRebaseConflict,
          check: (r) => !r.inProgress() && r.branchName() === 'units' && msgAt(r, 'units') === 'Mention units' && msgAt(r, 'units~1') === 'Initial commit' && clean(r),
          solution: 'git rebase --abort',
          explain: 'You are back on units exactly as it was. Nothing is lost, and you can try again later.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'rewriting-3', title: 'Interactive rebase',
      exercises: [
        {
          id: 'rw3-todo', type: 'learn', new: true, title: 'git rebase -i: a todo list',
          body: '<code>git rebase -i main</code> opens a todo list of your commits, oldest first, each starting with <code>pick</code>. Change that word, or move lines around, and git rewrites the commits to match when you save.',
        },
        {
          id: 'rw3-match-actions', type: 'match',
          prompt: 'Match each todo word to what it does.',
          pairs: [
            ['pick', 'Keep the commit as it is'],
            ['reword', 'Keep the changes, edit the message'],
            ['squash', 'Meld into the commit above, combine messages'],
            ['fixup', 'Meld into the commit above, drop this message'],
            ['drop', 'Remove the commit entirely'],
          ],
          explain: 'squash and fixup both fold a commit into the one above it. The only difference is what happens to its message.',
        },
        {
          id: 'rw3-which-line', type: 'choice',
          prompt: 'Fold "fix typo" into "Add search" and throw its message away. What do you change?',
          code: 'pick a1f3c2e Add search\npick b7d9e01 fix typo\npick c4e8a93 Add search tests',
          options: ['pick b7d9e01 → fixup b7d9e01', 'pick b7d9e01 → squash b7d9e01', 'pick a1f3c2e → fixup a1f3c2e', 'Delete the c4e8a93 line'],
          answer: 0,
          explain: 'fixup folds a commit into the line above it. "Add search" keeps its message; the typo fix just disappears into it.',
        },
        {
          id: 'rw3-fill-drop', type: 'fill',
          prompt: 'Remove the debug commit from history.',
          before: 'pick a1f3c2e Add search\npick c4e8a93 Add search tests\n', after: ' d2b6f70 wip debug',
          options: ['drop', 'fixup', 'reword', 'squash'],
          answer: 0,
          explain: '<code>drop</code> (or deleting the line) leaves the commit out of the rewritten history.',
        },
        {
          id: 'rw3-order-lines', type: 'learn', new: true, title: 'Line order is commit order',
          body: 'Move lines up or down to reorder commits. The top line is replayed first. squash and fixup always merge into the line directly above, so put the fix right below the commit it belongs to.',
        },
        {
          id: 'rw3-order-todo', type: 'order',
          prompt: 'The UI needs the API, and the tests need both. Arrange the todo list.',
          steps: ['pick 3f2c9d1 Add avatar API', 'pick 1a9e4b7 Show avatar in UI', 'pick 7c4d2e8 Add avatar tests'],
          explain: 'Ordering by dependency means every commit in the new history builds and passes on its own, which also keeps bisect useful.',
        },
        {
          id: 'rw3-fixup-first', type: 'choice',
          prompt: 'What happens if the <b>first</b> line of the todo list is a <code>fixup</code>?',
          options: ['Git refuses: there is no earlier commit to fold it into', 'It is folded into main\'s tip', 'It turns into a pick', 'It is dropped'],
          answer: 0,
          explain: 'squash and fixup need a commit above them in the list. The commit the rebase starts on is not part of the list.',
        },
        {
          id: 'rw3-build-head3', type: 'build',
          prompt: 'Open an interactive rebase of your last three commits.',
          tiles: ['git', 'rebase', '-i', 'HEAD~3', 'HEAD^3', 'merge', 'main'],
          answers: [['git', 'rebase', '-i', 'HEAD~3'], ['git', 'rebase', 'HEAD~3', '-i']],
          explain: '<code>HEAD~3</code> is three commits back, so the list holds the three after it. <code>HEAD^3</code> means "third parent", which only merges with three parents have.',
        },
        {
          id: 'rw3-squash-vs-fixup', type: 'choice',
          prompt: 'Your history has "Add search" then "fix typo". Which keeps a clean message with the least effort?',
          options: ['fixup the typo commit', 'squash the typo commit', 'reword the typo commit', 'pick both'],
          answer: 0,
          explain: 'squash would combine both messages and ask you to edit them. fixup silently keeps "Add search".',
        },
        {
          id: 'rw3-type-reword-last', type: 'type',
          prompt: 'For the <b>newest</b> commit, "reword" has a shortcut. Change its message to <code>Add search tests</code>.',
          setup: (r) => {
            r.setupCommit('Initial commit', { 'search.js': 'search()' });
            r.setupCommit('tests', { 'search.test.js': 'test("search")' });
          },
          check: (r) => msgAt(r, 'HEAD') === 'Add search tests' && msgAt(r, 'HEAD~1') === 'Initial commit',
          solution: 'git commit --amend -m "Add search tests"',
          explain: 'Amend is a one-commit interactive rebase. For anything older than the last commit, reach for <code>git rebase -i</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'rewriting-4', title: 'Cherry-pick',
      exercises: [
        {
          id: 'rw4-cherry', type: 'learn', new: true, title: 'Copy one commit',
          body: '<code>git cherry-pick &lt;commit&gt;</code> takes the change that one commit made and applies it as a new commit on your current branch. Perfect for a hotfix you need without the rest of that branch.',
          demo: { setup: releaseDev, run: ['git cherry-pick dev~1'] },
        },
        {
          id: 'rw4-graph-pick', type: 'graph',
          prompt: 'You are on <code>release</code>. <code>dev~1</code> is the crash fix. Which graph?',
          setup: releaseDev,
          command: 'git cherry-pick dev~1',
          distractors: [['git merge dev'], ['git reset --hard dev~1']],
          explain: 'One new commit on release, a copy of the fix. Merging would drag in all of dev, and reset would move release onto dev\'s history.',
        },
        {
          id: 'rw4-same-id', type: 'choice',
          prompt: 'Does the cherry-picked commit have the same id as the original?',
          options: ['No: same change, different parent, so a new id', 'Yes, it is the same commit', 'Yes, unless there was a conflict', 'It has no id until you push'],
          answer: 0,
          explain: 'It is a copy. Git can often spot the duplicate later (for example, rebase skips patches that are already upstream).',
        },
        {
          id: 'rw4-ranges', type: 'learn', new: true, title: 'Ranges and conflicts',
          body: '<code>git cherry-pick A..B</code> copies every commit after A, up to B, oldest first. <code>-x</code> notes the original id in the message. A conflict stops it like a rebase: fix, <code>git add</code>, then <code>git cherry-pick --continue</code>, or <code>--abort</code> to give up.',
          demo: { setup: releaseDev, run: ['git cherry-pick dev~2..dev'] },
        },
        {
          id: 'rw4-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git cherry-pick a1b2c3d', 'Copy one commit onto this branch'],
            ['git cherry-pick a1b2c3d..f4e5d6c', 'Copy the commits after a1b2c3d up to f4e5d6c'],
            ['git cherry-pick -x a1b2c3d', 'Copy it and note the original id in the message'],
            ['git cherry-pick --abort', 'Give up a cherry-pick that hit a conflict'],
          ],
          explain: 'A range <code>A..B</code> excludes A itself. Write <code>A^..B</code> to include it.',
        },
        {
          id: 'rw4-fill-range', type: 'fill',
          prompt: 'Copy every commit after <code>a1b2c3d</code>, up to and including <code>f4e5d6c</code>.',
          before: 'git cherry-pick ', after: '',
          options: ['a1b2c3d..f4e5d6c', 'a1b2c3d-f4e5d6c', 'a1b2c3d:f4e5d6c', 'a1b2c3d,f4e5d6c'],
          answer: 0,
          explain: 'Two dots is git\'s range syntax everywhere: "reachable from the right side, not from the left".',
        },
        {
          id: 'rw4-when', type: 'choice',
          prompt: 'Your <code>release</code> branch needs one security fix that lives on <code>dev</code>, among ten experimental commits. Best move?',
          options: ['Cherry-pick the fix onto release', 'Merge dev into release', 'Rebase release onto dev', 'Reset release to dev'],
          answer: 0,
          explain: 'The other three would all bring the experiments along. Cherry-pick takes exactly one change.',
        },
        {
          id: 'rw4-build', type: 'build',
          prompt: 'You are on release. Copy the commit just below dev\'s tip.',
          tiles: ['git', 'cherry-pick', 'dev~1', 'dev', 'merge', 'rebase'],
          answers: [['git', 'cherry-pick', 'dev~1']],
          explain: '<code>dev~1</code> is the parent of dev\'s tip. <code>dev</code> alone would pick the tip itself.',
        },
        {
          id: 'rw4-type-pick', type: 'type',
          prompt: '<code>release</code> needs only the crash fix from <code>dev</code>. Copy that one commit onto release.',
          setup: releaseDev,
          check: (r) => msgAt(r, 'release') === 'Fix crash on empty cart' && msgAt(r, 'release~1') === 'Release 1.0' && fileAt(r, 'release', 'ai.js') === undefined && fileAt(r, 'release', 'theme.css') === undefined,
          solution: 'git cherry-pick dev~1',
          explain: 'Release got the fix and nothing else. dev is untouched.',
        },
        {
          id: 'rw4-conflict', type: 'choice',
          prompt: 'A cherry-pick stops with a conflict. You fix the file and <code>git add</code> it. Then?',
          options: ['git cherry-pick --continue', 'git commit --amend', 'git rebase --continue', 'git merge --continue'],
          answer: 0,
          explain: 'Each in-progress operation has its own <code>--continue</code> and <code>--abort</code>. <code>git status</code> tells you which one you are in.',
        },
        {
          id: 'rw4-type-range', type: 'type',
          prompt: 'The last <b>two</b> commits on <code>dev</code> are fixes. Copy both onto <code>release</code>, but not the AI experiment below them.',
          setup: releaseDevFixes,
          check: (r) => msgAt(r, 'release') === 'Fix rounding in total' && msgAt(r, 'release~1') === 'Fix crash on empty cart' && msgAt(r, 'release~2') === 'Release 1.0' && fileAt(r, 'release', 'ai.js') === undefined,
          solution: 'git cherry-pick dev~2..dev',
          explain: '<code>dev~2..dev</code> means "after dev~2, up to dev": exactly the two fixes, applied oldest first.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'rewriting-5', title: 'Choosing your history',
      exercises: [
        {
          id: 'rw5-golden', type: 'learn', new: true, title: 'The golden rule',
          body: 'Rewrite freely while commits are only on your machine. Once others have them, rewriting means force-pushing and confusing everyone. So: rebase and tidy your own branch, merge into shared ones.',
        },
        {
          id: 'rw5-private-branch', type: 'choice',
          prompt: 'Your feature branch exists only on your laptop, and main has moved on. You want a straight-line history. What do you run on feature?',
          options: ['git rebase main', 'git merge main', 'git reset --hard main', 'git cherry-pick main'],
          answer: 0,
          explain: 'Nobody else has these commits, so rewriting them is safe. <code>reset --hard main</code> would throw your work away.',
        },
        {
          id: 'rw5-onto', type: 'learn', new: true, title: 'rebase --onto',
          body: '<code>git rebase --onto main feature-a feature-b</code> takes the commits on feature-b that come after feature-a, and replays only those onto main. Handy when a branch was started from the wrong place.',
          demo: { setup: stackedBranches, run: ['git rebase --onto main feature-a feature-b'] },
        },
        {
          id: 'rw5-graph-onto', type: 'graph',
          prompt: '<code>feature-b</code> was branched off <code>feature-a</code> by mistake. Which graph?',
          setup: stackedBranches,
          command: 'git rebase --onto main feature-a feature-b',
          distractors: [['git rebase main feature-b'], ['git cherry-pick feature-b']],
          explain: 'Only "Add help page" moves, straight onto main. Plain <code>rebase main</code> finds nothing to do, since feature-b already contains main.',
        },
        {
          id: 'rw5-fill-onto', type: 'fill',
          prompt: 'Move feature-b\'s own commits (the ones after feature-a) onto main.',
          before: 'git rebase --onto main ', after: ' feature-b',
          options: ['feature-a', 'main', 'feature-b', 'HEAD'],
          answer: 0,
          explain: 'The middle argument is the old base: commits reachable from it are left behind.',
        },
        {
          id: 'rw5-match', type: 'match',
          prompt: 'Pick the tool for each job.',
          pairs: [
            ['Catch my private branch up with main, linearly', 'git rebase main'],
            ['Combine a shared branch, keep history as is', 'git merge'],
            ['One fix from another branch', 'git cherry-pick'],
            ['Tidy my last commits before review', 'git rebase -i'],
          ],
          explain: 'They overlap, but each has a sweet spot. When in doubt on a shared branch, merge.',
        },
        {
          id: 'rw5-squash-merge', type: 'learn', new: true, title: 'Squash merge',
          body: '<code>git merge --squash feature</code> stages all of feature\'s changes as one lump but does not commit. Then <code>git commit</code> records them as a single ordinary commit, with no merge bubble and none of the "wip" history.',
        },
        {
          id: 'rw5-order-pr', type: 'order',
          prompt: 'Tidy a feature, then land it.',
          steps: ['git switch feature', 'git rebase -i main (squash the wip commits)', 'git switch main', 'git merge feature'],
          explain: 'After the rebase, feature sits right on top of main, so the final merge is a clean fast-forward.',
        },
        {
          id: 'rw5-type-onto', type: 'type',
          prompt: '<code>feature-b</code> ("Add help page") was started from <code>feature-a</code> by mistake. Move just its own commit onto <code>main</code>.',
          setup: stackedBranches,
          check: (r) => r.tryResolve('feature-b~1') === r.s.branches.main && fileAt(r, 'feature-b', 'help.html') !== undefined && fileAt(r, 'feature-b', 'api.js') === undefined,
          solution: 'git rebase --onto main feature-a feature-b',
          explain: 'feature-b now holds only its own work, based on main. feature-a is untouched.',
        },
        {
          id: 'rw5-type-squash', type: 'type',
          prompt: 'Land <code>feature</code> on main as <b>one</b> commit called <code>Add search</code>, without its messy "wip" and "fix typo" history.',
          setup: searchFeature,
          check: (r) => msgAt(r, 'main') === 'Add search' && !isMerge(r, 'main') && msgAt(r, 'main~1') === 'Update footer' && has(fileAt(r, 'main', 'search.js'), 'query') && clean(r),
          solution: 'git merge --squash feature && git commit -m "Add search"',
          explain: 'One tidy commit on main. Note that feature is not marked as merged, so delete it with <code>-D</code> when you are done.',
        },
      ],
    },
  ],
};
