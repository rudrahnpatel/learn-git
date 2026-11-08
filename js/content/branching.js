// Unit 2: Branching & merging. Labels, fast-forwards, three-way merges, conflicts.
import { aheadFeature, diverged, menuConflict, msgAt, fileAt, has, isMerge, span, clean, markerFree, workIs } from './helpers.js';

const bakery = (r) => {
  r.setupCommit('Initial commit', { 'site.html': '<h1>Bakery</h1>' });
  r.setupCommit('Add menu', { 'menu.txt': 'bread\ncroissant' });
};
const loginReady = (r) => {
  r.setupCommit('Initial commit', { 'app.js': 'start()' });
  r.sh('git switch -c login');
  r.setupCommit('Add login form', { 'login.html': '<form></form>' });
  r.setupCommit('Validate password length', { 'login.js': 'if (pw.length < 12) warn()' });
  r.sh('git switch main');
};
const midMerge = (r) => { menuConflict(r); r.run('git merge spring'); };

export default {
  id: 'branching', title: 'Branching & merging', color: 'green',
  blurb: 'Cheap branches, fast-forwards, real merges and your first conflicts.',
  challenges: ['three-way', 'first-conflict', 'hunk-by-hunk'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'branching-1', title: 'Branches are labels',
      exercises: [
        {
          id: 'br1-label', type: 'learn', new: true, title: 'A branch is a sticky note',
          body: 'A branch is just a name that points at a commit. <code>git branch dark-mode</code> creates one: no files are copied, so make one for every idea. Plain <code>git branch</code> lists your branches.',
          demo: { setup: bakery, run: ['git branch dark-mode'] },
        },
        {
          id: 'br1-switch', type: 'learn', new: true, title: 'Switch branches',
          body: '<code>git switch dark-mode</code> moves you to a branch that exists. <code>git switch -c dark-mode</code> creates the branch <i>and</i> switches to it, in one step. <code>git switch -</code> jumps back to the branch you were on before.',
          demo: { setup: bakery, run: ['git switch -c dark-mode'] },
        },
        {
          id: 'br1-graph-switch-c', type: 'graph',
          prompt: 'You are on <code>main</code>. Which graph does this give?',
          setup: bakery,
          command: 'git switch -c dark-mode',
          distractors: [['git branch dark-mode'], ['git tag dark-mode']],
          explain: '<code>switch -c</code> creates the label <i>and</i> moves HEAD onto it. <code>git branch</code> alone creates it but leaves you on main, and a tag is a label that never moves.',
        },
        {
          id: 'br1-head', type: 'learn', new: true, title: 'HEAD: where you are',
          body: '<b>HEAD</b> marks the branch you are on. When you commit, that branch moves forward to the new commit, and every other branch stays exactly where it was. <code>git log --oneline --graph --all</code> draws them all.',
        },
        {
          id: 'br1-where-main', type: 'choice',
          prompt: 'You run <code>git switch -c dark-mode</code>, then make a commit. Where is <code>main</code> now?',
          options: ['Still on the commit where you branched', 'On your new commit', 'Deleted', 'One commit behind dark-mode and moving with it'],
          answer: 0,
          explain: 'Only the branch HEAD is on moves when you commit. main stays put until you merge into it.',
        },
        {
          id: 'br1-graph-commit', type: 'graph',
          prompt: 'You are on <code>dark-mode</code> with an edited <code>site.html</code>. What happens?',
          setup: (r) => { bakery(r); r.sh('git switch -c dark-mode'); r.setupFiles({ 'site.html': '<h1 class=dark>Bakery</h1>' }); },
          command: 'git commit -am "Dark header"',
          distractors: [['git commit -am "Dark header"', 'git branch -f main dark-mode'], ['git switch main', 'git commit -am "Dark header"']],
          explain: 'The commit lands on the branch you are on, dark-mode. main does not follow along.',
        },
        {
          id: 'br1-match-branch', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git branch', 'List your branches'],
            ['git branch dark-mode', 'Create a branch, stay where you are'],
            ['git switch dark-mode', 'Move HEAD to an existing branch'],
            ['git switch -c dark-mode', 'Create a branch and switch to it'],
          ],
          explain: '<code>git switch</code> is the modern command for moving between branches. You will also see the older <code>git checkout</code>.',
        },
        {
          id: 'br1-build-create', type: 'build',
          prompt: 'Create a branch called <code>dark-mode</code> and switch to it, in one command.',
          tiles: ['git', 'switch', '-c', 'dark-mode', 'checkout', '-b', 'branch', 'main'],
          answers: [['git', 'switch', '-c', 'dark-mode'], ['git', 'checkout', '-b', 'dark-mode']],
          explain: '<code>git switch -c</code> is the modern spelling. <code>git checkout -b</code> does the same thing, and both work.',
        },
        {
          id: 'br1-fill-back', type: 'fill',
          prompt: 'Jump back to the branch you were on before.',
          before: 'git switch ', after: '',
          options: ['-', 'back', '~', 'HEAD^'],
          answer: 0,
          explain: '<code>git switch -</code> toggles between your last two branches, like <code>cd -</code> in a shell.',
        },
        {
          id: 'br1-type-create', type: 'type',
          prompt: 'Start a new idea: create a branch called <code>menu-update</code> and switch to it.',
          setup: bakery,
          check: (r) => r.branchName() === 'menu-update' && r.s.branches['menu-update'] === r.s.branches.main,
          solution: 'git switch -c menu-update',
          explain: 'Both labels point at the same commit for now. They split as soon as you commit.',
        },
        {
          id: 'br1-type-commit-there', type: 'type',
          prompt: 'Your dark header edit is uncommitted. Put it on a new branch <code>dark-mode</code> as one commit, and leave <code>main</code> where it is.',
          setup: (r) => { bakery(r); r.setupFiles({ 'site.html': '<h1 class=dark>Bakery</h1>' }); },
          check: (r) => r.branchName() === 'dark-mode' && span(r, 'main', 'dark-mode').length === 1 && msgAt(r, 'main') === 'Add menu' && clean(r),
          solution: 'git switch -c dark-mode && git commit -am "Dark header"',
          explain: 'Uncommitted edits travel with you when you switch, so you can decide where they belong right before committing.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'branching-2', title: 'Fast-forward merges',
      exercises: [
        {
          id: 'br2-ff', type: 'learn', new: true, title: 'Fast-forward',
          body: '<code>git merge feature</code> brings feature\'s commits into the branch you are on. If your branch has not moved since feature split off, there is nothing to combine: git just slides the label forward. That is a <b>fast-forward</b>.',
          demo: { setup: aheadFeature, run: ['git merge feature'] },
        },
        {
          id: 'br2-graph-ff', type: 'graph',
          prompt: 'You are on <code>main</code>, and <code>feature</code> is two commits ahead. Which graph?',
          setup: aheadFeature,
          command: 'git merge feature',
          distractors: [['git merge --no-ff feature'], ['git switch feature', 'git merge main']],
          explain: 'main is an ancestor of feature, so git simply moves main up to feature. No new commit, a straight line.',
        },
        {
          id: 'br2-which-moves', type: 'choice',
          prompt: 'On <code>main</code>, you run <code>git merge feature</code>. Which branch moves?',
          options: ['main, the branch you are on', 'feature', 'Both of them', 'Neither, merge only makes a commit'],
          answer: 0,
          explain: 'Merge always updates the current branch. The branch you name is only read from.',
        },
        {
          id: 'br2-no-ff', type: 'learn', new: true, title: 'Keep a record: --no-ff',
          body: '<code>git merge --no-ff login</code> makes a merge commit even when a fast-forward was possible, so the feature shows as a bubble. Then <code>git branch -d login</code> removes the label; the commits stay. <code>&amp;&amp;</code> chains two commands: the second runs only if the first worked.',
          demo: { setup: loginReady, run: ['git merge --no-ff login', 'git branch -d login'] },
        },
        {
          id: 'br2-graph-no-ff', type: 'graph',
          prompt: 'On <code>main</code>, with <code>login</code> two commits ahead. Which graph?',
          setup: loginReady,
          command: 'git merge --no-ff login',
          distractors: [['git merge login'], ['git rebase login', 'git branch -d login']],
          explain: '<code>--no-ff</code> forces a merge commit with two parents, even though main could have just slid forward.',
        },
        {
          id: 'br2-fill-delete', type: 'fill',
          prompt: 'login is merged. Delete the label.',
          before: 'git branch ', after: ' login',
          options: ['-d', '-c', '-m', '--merged'],
          answer: 0,
          explain: '<code>-d</code> deletes a branch, but only if its commits are already merged somewhere, so you cannot lose work by accident.',
        },
        {
          id: 'br2-not-merged', type: 'choice',
          prompt: '<code>git branch -d experiment</code> says <i>"the branch is not fully merged"</i>. What does that mean?',
          options: ['It has commits that no other branch contains', 'It has uncommitted changes', 'Someone else is using it', 'It was already deleted'],
          answer: 0,
          explain: 'Deleting it would leave those commits unreachable. If you are sure, <code>git branch -D</code> forces it.',
        },
        {
          id: 'br2-order-finish', type: 'order',
          prompt: 'Finish the login feature with a visible merge.',
          steps: ['git switch main', 'git merge --no-ff login', 'git branch -d login'],
          explain: 'Merge into the branch you are on, so switch to main first. Delete the label last, once main contains its commits.',
        },
        {
          id: 'br2-build-no-ff', type: 'build',
          prompt: 'Merge <code>login</code> and always create a merge commit.',
          tiles: ['git', 'merge', '--no-ff', 'login', '--ff-only', 'rebase'],
          answers: [['git', 'merge', '--no-ff', 'login'], ['git', 'merge', 'login', '--no-ff']],
          explain: '<code>--ff-only</code> is the opposite: it refuses to merge unless a fast-forward is possible.',
        },
        {
          id: 'br2-type-ff', type: 'type',
          prompt: 'Bring <code>main</code> up to date with <code>feature</code>. No merge commit is needed.',
          setup: aheadFeature,
          check: (r) => r.s.branches.main === r.s.branches.feature && !isMerge(r, 'main') && r.branchName() === 'main',
          solution: 'git merge feature',
          explain: 'Fast-forward: main slid up to feature, and history is still a straight line.',
        },
        {
          id: 'br2-type-no-ff', type: 'type',
          prompt: 'Merge <code>login</code> into main <b>with</b> a merge commit, then delete the <code>login</code> branch.',
          setup: loginReady,
          check: (r) => isMerge(r, 'main') && !('login' in r.s.branches) && has(fileAt(r, 'main', 'login.js'), 'pw.length'),
          solution: 'git merge --no-ff login && git branch -d login',
          explain: 'The label is gone, but the bubble in the graph shows exactly which commits made up the login feature.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'branching-3', title: 'Three-way merges',
      exercises: [
        {
          id: 'br3-three-way', type: 'learn', new: true, title: 'When both sides moved',
          body: 'If both branches have new commits, git finds the <b>merge base</b> (the last commit they share), compares each side with it, and combines the changes into a <b>merge commit</b> with two parents. <code>git merge --ff-only</code> refuses here: it only merges when it can fast-forward.',
          demo: { setup: diverged, run: ['git merge reviews'] },
        },
        {
          id: 'br3-merge-base', type: 'choice',
          prompt: 'What is the merge base of two branches?',
          options: ['The most recent commit both branches share', 'The first commit in the repository', 'The newest commit on main', 'The commit you are on'],
          answer: 0,
          explain: 'Comparing each side with the merge base tells git who changed what, so it can take one-sided changes automatically.',
        },
        {
          id: 'br3-graph-merge', type: 'graph',
          prompt: '<code>main</code> and <code>reviews</code> have both moved on. You are on main. Which graph?',
          setup: diverged,
          command: 'git merge reviews',
          distractors: [['git rebase reviews'], ['git switch reviews', 'git merge main']],
          explain: 'A merge commit on main, with two parents. Rebasing would give a straight line, and merging from reviews would move reviews, not main.',
        },
        {
          id: 'br3-match-terms', type: 'match',
          prompt: 'Match each term to its meaning.',
          pairs: [
            ['Fast-forward', 'The label slides; no new commit'],
            ['Merge commit', 'A commit with two parents'],
            ['Merge base', 'The last commit both sides share'],
            ['--ff-only', 'Merge only if it can fast-forward'],
          ],
          explain: 'Git picks fast-forward when it can and a three-way merge when it must. <code>--ff-only</code> and <code>--no-ff</code> let you insist on one.',
        },
        {
          id: 'br3-either-way', type: 'learn', new: true, title: 'Merging works both ways',
          body: 'Merge always moves the branch you are on, so it works both ways. On <code>reviews</code>, <code>git merge main</code> brings main\'s new commits into your branch, and main stays put. When there is nothing new to bring in, git just says <i>Already up to date.</i>',
          demo: { setup: (r) => { diverged(r); r.sh('git switch reviews'); }, run: ['git merge main'] },
          teaches: ['merge main into your branch', 'Already up to date'],
        },
        {
          id: 'br3-up-to-date', type: 'choice', needs: ['Already up to date'],
          prompt: '<code>git merge feature</code> prints <i>"Already up to date."</i> What does that tell you?',
          options: ['Your branch already contains every commit on feature', 'feature has no commits at all', 'The merge failed', 'You need to pull first'],
          answer: 0,
          explain: 'Everything on feature is already in your history, so there is nothing to bring in.',
        },
        {
          id: 'br3-fill-all', type: 'fill',
          prompt: 'Draw the history of every branch, not just the one you are on.',
          before: 'git log --oneline --graph ', after: '',
          options: ['--all', '--every', '--wide', '--full'],
          answer: 0,
          explain: 'Without <code>--all</code>, log only shows commits reachable from HEAD, so other branches would be hidden.',
        },
        {
          id: 'br3-build-switch-merge', type: 'build',
          prompt: 'You are on <code>reviews</code>. Get its work into <code>main</code>.',
          tiles: ['git', 'switch', 'main', '&&', 'git', 'merge', 'reviews', 'checkout', 'rebase'],
          answers: [['git', 'switch', 'main', '&&', 'git', 'merge', 'reviews'], ['git', 'checkout', 'main', '&&', 'git', 'merge', 'reviews']],
          explain: 'Merge pulls <i>into</i> the current branch, so first go to the branch that should receive the work.',
        },
        {
          id: 'br3-type-merge', type: 'type',
          prompt: 'Merge <code>reviews</code> into <code>main</code>. Both have moved on, so expect a merge commit.',
          setup: diverged,
          check: (r) => isMerge(r, 'main') && r.commit(r.s.branches.main).parents[1] === r.s.branches.reviews && clean(r),
          solution: 'git merge reviews',
          explain: 'They touched different files, so git combined them on its own and recorded a merge commit.',
        },
        {
          id: 'br3-parents', type: 'learn', new: true, title: 'Parents: ~ and ^',
          body: '<code>main~1</code> (or <code>main^</code>) is the commit before main\'s tip, <code>main~2</code> the one before that. A merge commit has two parents: <code>~</code> follows the first, the branch you were on. <code>main^2</code> is the second, the branch you merged in.',
          teaches: ['first parent'],
        },
        {
          id: 'br3-two-parents', type: 'choice', needs: ['first parent'],
          prompt: 'After the merge, <code>main~1</code> is which commit?',
          options: ['The previous tip of main (its first parent)', 'The tip of reviews', 'The merge base', 'There is no main~1 after a merge'],
          answer: 0,
          explain: '<code>~</code> follows first parents, and the first parent of a merge is the branch you were on. <code>main^2</code> would be reviews.',
        },
        {
          id: 'br3-type-catch-up', type: 'type', needs: ['merge main into your branch'],
          prompt: 'You are on <code>reviews</code>. Bring main\'s latest fix into your branch so you can keep working on top of it.',
          setup: (r) => { diverged(r); r.sh('git switch reviews'); },
          check: (r) => r.branchName() === 'reviews' && isMerge(r, 'reviews') && r.isAncestor(r.s.branches.main, r.s.branches.reviews),
          solution: 'git merge main',
          explain: 'Merging main into your feature branch is a normal way to catch up. main itself does not move.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'branching-4', title: 'Conflicts',
      exercises: [
        {
          id: 'br4-conflict', type: 'learn', new: true, title: 'When git needs you',
          body: 'If both sides changed the same lines, git cannot choose. It stops, writes both versions into the file between <b>conflict markers</b>, and waits. You edit the file into its final form, <code>git add</code> it, and commit.',
        },
        {
          id: 'br4-markers', type: 'choice',
          prompt: 'On <code>main</code>, you ran <code>git merge spring</code>. Which part is main\'s version?',
          code: 'Menu\n<<<<<<< HEAD\nStarter: pumpkin soup\n=======\nStarter: asparagus salad\n>>>>>>> spring',
          options: ['pumpkin soup, between <<<<<<< HEAD and =======', 'asparagus salad, between ======= and >>>>>>>', 'Both lines are spring\'s', 'Neither; the markers are the result'],
          answer: 0,
          explain: 'The top half is HEAD, the branch you are on. The bottom half comes from the branch you are merging in.',
        },
        {
          id: 'br4-order-resolve', type: 'order',
          prompt: 'Resolve a conflict, step by step.',
          steps: ['git merge spring (CONFLICT)', 'Edit menu.txt and delete the markers', 'git add menu.txt', 'git commit'],
          explain: '<code>git add</code> is how you tell git "this file is resolved". The commit then finishes the merge.',
        },
        {
          id: 'br4-match-markers', type: 'match',
          prompt: 'Match each piece to its job.',
          pairs: [
            ['<<<<<<< HEAD', 'Start of your side'],
            ['=======', 'Divider between the two sides'],
            ['>>>>>>> spring', 'End of the incoming side'],
            ['git add menu.txt', 'Mark the conflict as resolved'],
          ],
          explain: 'The markers are plain text in the file. Remove all three kinds before you add it, or they get committed.',
        },
        {
          id: 'br4-resolve-both', type: 'resolve',
          prompt: 'You merged <code>spring</code> into main. The new menu should list <b>both</b> starters, main\'s pumpkin soup first.',
          setup: midMerge, file: 'menu.txt',
          check: (r) => markerFree(r) && workIs(r, 'menu.txt', ['Menu', 'Starter: pumpkin soup', 'Starter: asparagus salad', 'Main: pasta', 'Dessert: cake']),
          solution: 'Menu\nStarter: pumpkin soup\nStarter: asparagus salad\nMain: pasta\nDessert: cake',
          explain: 'Ours (HEAD, main) on top, then theirs (spring), and no markers left. Next you would <code>git add menu.txt</code> and commit.',
        },
        {
          id: 'br4-escape', type: 'learn', new: true, title: 'Shortcuts and the exit',
          body: 'To take one side whole: <code>git checkout --ours file</code> or <code>--theirs file</code>, then add it. <code>git commit --no-edit</code> finishes with git\'s ready-made message. To give up: <code>git merge --abort</code> puts everything back as it was before the merge.',
        },
        {
          id: 'br4-fill-abort', type: 'fill',
          prompt: 'This merge is a mess. Go back to before you started it.',
          before: 'git merge ', after: '',
          options: ['--abort', '--cancel', '--undo', '--stop'],
          answer: 0,
          explain: '<code>--abort</code> restores your branch, index and files to their state before the merge. Nothing is committed.',
        },
        {
          id: 'br4-theirs', type: 'choice',
          prompt: 'On main, merging <code>spring</code>, you run <code>git checkout --theirs menu.txt</code>. Which version do you get?',
          options: ['spring\'s version', 'main\'s version', 'The merge base version', 'Both, with markers'],
          answer: 0,
          explain: 'In a merge, "ours" is the branch you are on and "theirs" is the branch being merged in. (In a rebase the roles swap, a classic gotcha.)',
        },
        {
          id: 'br4-build-theirs', type: 'build',
          prompt: 'Mid-merge, take spring\'s version of <code>menu.txt</code> as it is.',
          tiles: ['git', 'checkout', '--theirs', 'menu.txt', '--ours', 'restore', 'merge'],
          answers: [['git', 'checkout', '--theirs', 'menu.txt'], ['git', 'restore', '--theirs', 'menu.txt']],
          explain: 'Both commands copy the incoming side into your working tree. You still need <code>git add</code> to mark it resolved.',
        },
        {
          id: 'br4-type-abort', type: 'type',
          prompt: 'Your merge of <code>spring</code> stopped with a conflict, and you would rather deal with it tomorrow. Back out of the merge.',
          setup: midMerge,
          check: (r) => !r.inProgress() && clean(r) && msgAt(r, 'main') === 'Winter starter',
          solution: 'git merge --abort',
          explain: 'Back to "Winter starter" with a clean tree, as if the merge never started.',
        },
        {
          id: 'br4-type-theirs', type: 'type',
          prompt: 'The merge of <code>spring</code> conflicts in menu.txt. Keep spring\'s starter and finish the merge.',
          setup: midMerge,
          check: (r) => isMerge(r, 'main') && has(fileAt(r, 'main', 'menu.txt'), 'asparagus') && !has(fileAt(r, 'main', 'menu.txt'), '<<<') && clean(r),
          solution: 'git checkout --theirs menu.txt && git add menu.txt && git commit --no-edit',
          explain: 'Take a side, mark it resolved with add, and commit. <code>--no-edit</code> keeps git\'s ready-made merge message.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'branching-5', title: 'Branch housekeeping',
      exercises: [
        {
          id: 'br5-tidy', type: 'learn', new: true, title: 'Rename, list, force-delete',
          body: '<code>git branch -m old new</code> renames a branch. <code>git branch --merged</code> lists branches already contained in yours, safe to delete. <code>git branch -D</code> deletes even unmerged work, so use it only when you mean it.',
        },
        {
          id: 'br5-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git branch -m feature search', 'Rename a branch'],
            ['git branch -D experiment', 'Force-delete an unmerged branch'],
            ['git branch --merged', 'List branches already merged into HEAD'],
            ['git branch', 'List your branches'],
          ],
          explain: 'Housekeeping commands only touch labels. Commits are never changed by renaming or deleting a branch.',
        },
        {
          id: 'br5-graph-rename', type: 'graph',
          prompt: 'Which graph does this give?',
          setup: (r) => { aheadFeature(r); },
          command: 'git branch -m feature search',
          distractors: [['git branch search feature'], ['git switch -c search']],
          explain: 'Renaming moves the name and nothing else: one label, now called search. Creating a branch would leave feature in place too.',
        },
        {
          id: 'br5-D-gone', type: 'choice',
          prompt: 'You force-deleted <code>experiment</code> with <code>git branch -D</code>. Are its commits gone forever?',
          options: ['Not yet: they are unreachable, but the reflog remembers them for a while', 'Yes, instantly and permanently', 'No, they move to main', 'No, git refuses to delete them'],
          answer: 0,
          explain: 'Unreachable commits linger until garbage collection, and the reflog can lead you back to them. The Undoing unit shows how.',
        },
        {
          id: 'br5-fill-rename', type: 'fill',
          prompt: 'Rename the branch login-page to login.',
          before: 'git branch ', after: ' login-page login',
          options: ['-m', '-d', '-r', '--rename'],
          answer: 0,
          explain: '<code>-m</code> stands for move. Renaming the branch you are on works too: <code>git branch -m new-name</code>.',
        },
        {
          id: 'br5-detached', type: 'learn', new: true, title: 'Detached HEAD',
          body: '<code>git switch --detach &lt;commit&gt;</code> puts HEAD on a commit instead of a branch. Look around freely. Commits made there belong to no branch, so before you leave, keep them with <code>git switch -c name</code>.',
        },
        {
          id: 'br5-graph-detach', type: 'graph',
          prompt: 'You want to look at the bakery one commit ago. Which graph?',
          setup: bakery,
          command: 'git switch --detach HEAD~1',
          distractors: [['git reset --hard HEAD~1'], ['git switch -c old HEAD~1']],
          explain: 'Only HEAD moves; main stays where it was. <code>reset</code> would drag main back, and <code>switch -c</code> would create a new branch.',
        },
        {
          id: 'br5-build-rename', type: 'build',
          prompt: 'Rename <code>feature</code> to <code>search</code>.',
          tiles: ['git', 'branch', '-m', 'feature', 'search', '-d', 'switch'],
          answers: [['git', 'branch', '-m', 'feature', 'search']],
          explain: 'Old name first, new name second. Any commits and upstream settings come along with the name.',
        },
        {
          id: 'br5-type-rename', type: 'type',
          prompt: 'The branch <code>feature</code> is really the search work. Rename it to <code>search</code>.',
          setup: aheadFeature,
          check: (r) => 'search' in r.s.branches && !('feature' in r.s.branches),
          solution: 'git branch -m feature search',
          explain: 'Same commits, better name. Teammates will thank you when they read <code>git branch</code>.',
        },
        {
          id: 'br5-type-D', type: 'type',
          prompt: 'The <code>experiment</code> branch was a dead end and was never merged. Delete it anyway.',
          setup: (r) => {
            bakery(r);
            r.sh('git switch -c experiment');
            r.setupCommit('Try neon colours', { 'site.html': '<h1 style="color:lime">Bakery</h1>' });
            r.sh('git switch main');
          },
          check: (r) => !('experiment' in r.s.branches),
          solution: 'git branch -D experiment',
          explain: '<code>-d</code> would refuse because the work is unmerged. <code>-D</code> says "I know, delete it anyway". The commit fades out of the graph.',
        },
      ],
    },
  ],
};
