// Unit 8: GitHub workflow. Forks and upstream, the pull-request loop, keeping a PR current,
// the three merge buttons and cleaning up after a merge. GitHub-only actions (opening a PR,
// clicking Merge) are taught with learn/choice/order/match; the live repos simulate the server
// side with r.mergePullRequest() and the fork model with r.setupFork().
import { msgAt, fileAt, has, isMerge, noMerges, ran } from './helpers.js';

const UP = 'https://github.com/open-cookbook/cookbook.git';
const FORK = 'https://github.com/you/cookbook.git';

/* --------------------------------------------- fork scenarios (open-source project) */
const cookbook = (r) => {
  r.setupCommit('Initial commit', { 'README.md': '# Open Cookbook\nRecipes anyone can improve.', 'index.html': '<h1>Open Cookbook</h1>' });
  r.setupCommit('Add soup recipe', { 'recipes/soup.md': '# Soup\nwater\nsalt' });
};
const maintainerWork = (r, where) => {
  r.teammatePush('main', 'Add bread recipe', { 'recipes/bread.md': '# Bread\nflour\nwater\nyeast' }, 'maintainer', where);
  r.teammatePush('main', 'Fix soup salt', { 'recipes/soup.md': '# Soup\nwater\na pinch of salt' }, 'maintainer', where);
};
// cloned your fork; upstream not added yet, and it has moved on
const forkNoUpstream = (r) => { cookbook(r); r.setupFork({ upstreamUrl: UP, forkUrl: FORK, added: false }); maintainerWork(r, UP); };
// upstream added and fetched once, nothing new
const forked = (r) => { cookbook(r); r.setupFork({ upstreamUrl: UP, forkUrl: FORK }); };
// upstream added (fetched earlier), maintainers merged two commits since
const upstreamMoved = (r) => { forked(r); maintainerWork(r, 'upstream'); };
const upstreamMovedFetched = (r) => { upstreamMoved(r); r.sh('git fetch upstream'); };
// your feature branch started before upstream moved
const galleryBehind = (r) => {
  forked(r);
  r.sh('git switch -c photos');
  r.setupCommit('Add soup photo', { 'recipes/soup.md': '# Soup\n![soup](soup.jpg)\nwater\nsalt' });
  r.sh('git push -u origin photos');
  r.teammatePush('main', 'Add bread recipe', { 'recipes/bread.md': '# Bread\nflour\nwater\nyeast' }, 'maintainer', 'upstream');
};

/* --------------------------------------------- team scenarios (origin is the shared repo) */
const cafe = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Corner Cafe</h1>\n<nav>Home</nav>', 'menu.html': '<h2>Menu</h2>\nbread 3' });
  r.setupRemote();
};
const priceEdit = (r) => { cafe(r); r.setupFiles({ 'menu.html': '<h2>Menu</h2>\nbread 3\ncake 4' }); };
// your PR branch `prices`, two commits, pushed; you are on it
const prOpen = (r) => {
  cafe(r);
  r.sh('git switch -c prices');
  r.setupCommit('Add cake prices', { 'menu.html': '<h2>Menu</h2>\nbread 3\ncake 4' });
  r.setupCommit('Add tea prices', { 'menu.html': '<h2>Menu</h2>\nbread 3\ncake 4\ntea 2' });
  r.sh('git push -u origin prices');
};
const prReview = (r) => { prOpen(r); r.setupFiles({ 'menu.html': '<h2>Menu</h2>\nbread 3.50\ncake 4\ntea 2' }); };
const prFixCommitted = (r) => { prReview(r); r.sh('git commit -am "Fix bread price"'); };
// other PRs landed on main while yours waited
const prBehind = (r) => {
  prOpen(r);
  r.teammatePush('main', 'Add opening hours', { 'hours.html': 'Mon-Sat 8-18' });
  r.teammatePush('main', 'Fix homepage title', { 'index.html': '<h1>The Corner Cafe</h1>\n<nav>Home</nav>' });
};
const prBehindFetched = (r) => { prBehind(r); r.sh('git fetch'); };
const merged = (how, opts = {}) => (r) => { prOpen(r); r.sh('git switch main'); r.mergePullRequest('prices', { how, number: 12, title: 'Add cake and tea prices', ...opts }); };
const prMergeCommit = merged('merge');
const prSquashed = merged('squash');
const prMergedFetched = (r) => { prMergeCommit(r); r.sh('git fetch'); };
const prSquashedGone = (r) => { prOpen(r); r.mergePullRequest('prices', { how: 'squash', number: 12, title: 'Add cake and tea prices', deleteBranch: true }); };

const leasedOnly = (r) => ran(r, /--force-with-lease/) && !ran(r, /push.*(\s--force(\s|$)|\s-f(\s|$))/);

export default {
  id: 'github', title: 'GitHub workflow', color: 'sky',
  blurb: 'Forks and upstream, pull requests, keeping a PR current, merge buttons and cleanup.',
  challenges: ['sync-fork', 'rescue-pr', 'after-squash'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'github-1', title: 'Forks and clones',
      exercises: [
        {
          id: 'gh1-fork', type: 'learn', new: true, title: 'Clone vs fork',
          body: 'A <b>clone</b> is a full copy of a repo on your machine. A <b>fork</b> is a copy on GitHub, under your account. To contribute to a project you cannot push to, you fork it, then clone your fork.',
        },
        {
          id: 'gh1-first-step', type: 'choice',
          prompt: 'You want to fix a typo in an open-source project. You are not a member. What do you do first?',
          options: ['Fork it on GitHub, then clone your fork', 'Clone it and push straight to its main', 'Ask for write access before anything else', 'Run git init and copy the files in'],
          answer: 0,
          explain: 'Your fork is yours to push to. The pull request then asks the original project to take your commits.',
        },
        {
          id: 'gh1-remotes', type: 'learn', new: true, title: 'origin and upstream',
          body: 'When you clone your fork, it becomes <code>origin</code>. Add the original project as a second remote, by convention called <code>upstream</code>: <code>git remote add upstream &lt;url&gt;</code>. Fetch it to see what the maintainers merged. <code>git remote -v</code> lists your remotes.',
          demo: { setup: forkNoUpstream, run: [`git remote add upstream ${UP}`, 'git fetch upstream'] },
        },
        {
          id: 'gh1-match', type: 'match',
          prompt: 'Match each name to what it is.',
          pairs: [
            ['origin', 'Your fork: you can push here'],
            ['upstream', 'The original project: read-only for you'],
            ['clone', 'A full local copy with all the history'],
            ['fork', 'A server-side copy under your account'],
          ],
          explain: '<code>origin</code> and <code>upstream</code> are just names. They are the usual ones, so every guide and teammate means the same thing.',
        },
        {
          id: 'gh1-fill', type: 'fill',
          prompt: 'Add the original project as a second remote.',
          before: 'git remote add ', after: ` ${UP}`,
          options: ['upstream', 'origin', 'fork', 'main'],
          answer: 0,
          explain: '<code>origin</code> is taken (it is your fork). <code>upstream</code> is the name everyone uses for the original.',
        },
        {
          id: 'gh1-remote-v', type: 'choice',
          prompt: 'You are on <code>main</code>, which tracks <code>origin/main</code>. Where does a plain <code>git push</code> go?',
          code: `$ git remote -v\norigin    ${FORK} (fetch)\norigin    ${FORK} (push)\nupstream  ${UP} (fetch)\nupstream  ${UP} (push)`,
          options: ['origin: your fork', 'upstream: the original project', 'Both remotes', 'Nowhere until you choose'],
          answer: 0,
          explain: 'A plain push goes to the branch\'s upstream remote, here origin. Pushing to upstream would be refused anyway: you have no write access.',
        },
        {
          id: 'gh1-graph', type: 'graph',
          prompt: 'upstream is added and the maintainers merged two commits. Which graph?',
          setup: upstreamMoved,
          command: 'git fetch upstream',
          distractors: [['git fetch origin'], ['git pull upstream main']],
          explain: 'Only <code>upstream/main</code> moves. Fetching origin brings nothing (your fork did not change), and pull would also move your main.',
        },
        {
          id: 'gh1-push-upstream', type: 'choice',
          prompt: 'You run <code>git push upstream main</code> on someone else\'s project. What happens?',
          options: ['Permission denied: push to your fork and open a pull request', 'It opens a pull request automatically', 'It pushes, and the maintainers get an email', 'It pushes to your fork instead'],
          answer: 0,
          explain: 'You can read upstream but not write to it. Contributions go: your fork, then a pull request.',
        },
        {
          id: 'gh1-build', type: 'build',
          prompt: 'Add the original project as <code>upstream</code>.',
          tiles: ['git', 'remote', 'add', 'upstream', UP, 'origin', 'clone', 'fetch'],
          answers: [['git', 'remote', 'add', 'upstream', UP]],
          explain: 'Name first, then URL. It only saves a bookmark: nothing is downloaded until you fetch.',
        },
        {
          id: 'gh1-type-add', type: 'type',
          prompt: `Your clone only knows <code>origin</code>. Add the original project (<code>${UP}</code>) as <code>upstream</code>, and fetch it.`,
          setup: forkNoUpstream,
          check: (r) => !!r.s.remotes.upstream && !r.s.remotes.upstream.missing && r.s.remoteTracking.upstream?.main === r.s.remotes.upstream.branches.main,
          solution: `git remote add upstream ${UP} && git fetch upstream`,
          explain: '<code>upstream/main</code> now shows what the maintainers merged. Your own main has not moved yet.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'github-2', title: 'Sync your fork',
      exercises: [
        {
          id: 'gh2-sync', type: 'learn', new: true, title: 'Your fork does not update itself',
          body: 'Maintainers keep merging into upstream\'s main, and your fork falls behind. To catch up: <code>git fetch upstream</code>, <code>git merge upstream/main</code> into your main, then <code>git push</code> to update your fork.',
          demo: { setup: upstreamMoved, run: ['git fetch upstream', 'git merge upstream/main', 'git push'] },
        },
        {
          id: 'gh2-order', type: 'order',
          prompt: 'Bring your fork\'s main up to date with the original project.',
          steps: ['git switch main', 'git fetch upstream', 'git merge upstream/main', 'git push origin main'],
          explain: 'Fetch, integrate, publish. GitHub\'s "Sync fork" button does the same on the server; you would still pull afterwards.',
        },
        {
          id: 'gh2-graph', type: 'graph',
          prompt: 'You fetched upstream. You never commit on your main. Which graph?',
          setup: upstreamMovedFetched,
          command: 'git merge upstream/main',
          distractors: [['git merge --no-ff upstream/main'], ['git pull']],
          explain: 'A fast-forward: main just slides up to upstream/main. Plain <code>git pull</code> asks your fork, which has nothing new.',
        },
        {
          id: 'gh2-clean-main', type: 'choice',
          prompt: 'Why do contributors keep their own commits off <code>main</code> in a fork?',
          options: ['So syncing with upstream is always a clean fast-forward', 'Because GitHub forbids commits on main', 'Because forks cannot have more than one branch', 'So the commits stay private'],
          answer: 0,
          explain: 'Your main mirrors upstream\'s main. Work lives on feature branches, which you rebase or merge onto the fresh main.',
        },
        {
          id: 'gh2-status', type: 'choice',
          prompt: 'upstream has three new commits, but <code>git status</code> on main says:',
          code: "On branch main\nYour branch is up to date with 'origin/main'.",
          options: ['Your main tracks origin (your fork), which has not changed', 'The upstream commits were already merged', 'git status is broken in forks', 'You must clone again'],
          answer: 0,
          explain: 'Status compares with the branch\'s own upstream, here <code>origin/main</code>. It does not look at other remotes, and never at the network.',
        },
        {
          id: 'gh2-pull', type: 'learn', new: true, title: 'Fetch and merge in one go',
          body: '<code>git pull upstream main</code> fetches upstream and merges its main into your branch in one step. Name the branch: your main tracks origin, so for another remote git has to be told which branch to bring in.',
          demo: { setup: upstreamMoved, run: ['git pull upstream main'] },
          teaches: ['pull <remote> <branch>'],
        },
        {
          id: 'gh2-match', type: 'match', needs: ['pull <remote> <branch>'],
          prompt: 'Match each command to what it does in a fork.',
          pairs: [
            ['git fetch upstream', 'Download what the maintainers merged'],
            ['git merge upstream/main', 'Bring it into your main'],
            ['git push origin main', 'Update your fork on GitHub'],
            ['git pull upstream main', 'Fetch and merge in one step'],
          ],
          explain: 'Two remotes, one direction each: read from upstream, write to origin.',
        },
        {
          id: 'gh2-fill', type: 'fill',
          prompt: 'After <code>git fetch upstream</code>, bring the original project\'s main into yours.',
          before: 'git merge ', after: '',
          options: ['upstream/main', 'origin/main', 'main', 'HEAD'],
          answer: 0,
          explain: '<code>origin/main</code> is your fork, which is behind. The fresh commits are under <code>upstream/main</code>.',
        },
        {
          id: 'gh2-build', type: 'build', needs: ['pull <remote> <branch>'],
          prompt: 'Fetch upstream\'s main and merge it into your branch, in one command.',
          tiles: ['git', 'pull', 'upstream', 'main', 'origin', 'push', '--force'],
          answers: [['git', 'pull', 'upstream', 'main']],
          explain: 'With another remote, name the branch too: <code>git pull upstream</code> alone does not know which branch you mean.',
        },
        {
          id: 'gh2-type-sync', type: 'type',
          prompt: 'The maintainers merged two commits. Bring them into your <code>main</code>, then update your fork.',
          setup: upstreamMoved,
          check: (r) => r.branchName() === 'main' && r.s.branches.main === r.s.remotes.upstream.branches.main && r.s.remote.branches.main === r.s.branches.main,
          solution: 'git fetch upstream && git merge upstream/main && git push',
          explain: 'Your fork now matches the original project. <code>git pull upstream main</code> then <code>git push</code> works too.',
        },
        {
          id: 'gh2-type-rebase', type: 'type',
          prompt: 'Your <code>photos</code> branch started before upstream moved. Replay it on top of the latest upstream main (no merge commit).',
          setup: galleryBehind,
          check: (r) => r.branchName() === 'photos' && r.isAncestor(r.s.remotes.upstream.branches.main, r.s.branches.photos) && noMerges(r, 'upstream/main', 'photos') && msgAt(r, 'photos') === 'Add soup photo',
          solution: 'git fetch upstream && git rebase upstream/main',
          explain: 'Your commit now sits on the newest upstream main. It got a new id, so updating the PR needs <code>git push --force-with-lease</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'github-3', title: 'Pull requests',
      exercises: [
        {
          id: 'gh3-loop', type: 'learn', new: true, title: 'The pull-request loop',
          body: 'Work does not go straight onto main. Branch, commit, and push the branch. On GitHub, open a <b>pull request</b>: a request to merge it into main. Teammates review, you push fixes to the same branch, then someone merges it.',
        },
        {
          id: 'gh3-order', type: 'order',
          prompt: 'Put the pull-request loop in order.',
          steps: ['git switch -c prices', 'git commit -am "Add cake prices"', 'git push -u origin prices', 'Open a pull request on GitHub', 'Review, then merge into main'],
          explain: 'Git does the first three steps. The pull request itself lives on GitHub, not in git.',
        },
        {
          id: 'gh3-type-open', type: 'type',
          prompt: 'You edited <code>menu.html</code> on main. Move the work to a new branch <code>prices</code>, commit it, and push it so you can open a PR.',
          setup: priceEdit,
          check: (r) => has(fileAt(r, 'origin/prices', 'menu.html'), 'cake 4') && r.s.remote.branches.prices === r.s.branches.prices && r.s.upstream.prices === 'prices' && !has(fileAt(r, 'main', 'menu.html'), 'cake'),
          solution: 'git switch -c prices && git commit -am "Add cake prices" && git push -u origin prices',
          explain: 'Uncommitted changes travel with you when you switch, so the commit lands on <code>prices</code>, not main. GitHub now offers "Compare &amp; pull request".',
        },
        {
          id: 'gh3-terms', type: 'learn', new: true, title: 'Pull-request words',
          body: 'A PR asks to merge a <b>compare</b> branch (yours) into a <b>base</b> branch, usually main. Reviewers approve or <b>request changes</b>. Not ready yet? Open it as a <b>draft</b>: open for feedback, but it cannot be merged.',
          teaches: ['pull request terms'],
        },
        {
          id: 'gh3-match', type: 'match', needs: ['pull request terms'],
          prompt: 'Match each pull-request term to its meaning.',
          pairs: [
            ['Base branch', 'Where the PR will merge, usually main'],
            ['Compare branch', 'Your branch with the changes'],
            ['Request changes', 'A reviewer wants fixes first'],
            ['Draft PR', 'Open for feedback, not ready to merge'],
          ],
          explain: 'A PR from a fork has base <code>upstream:main</code> and compare <code>you:your-branch</code>.',
        },
        {
          id: 'gh3-follows', type: 'learn', new: true, title: 'A PR follows its branch',
          body: 'A pull request is not a snapshot. Every <code>git push</code> to its branch adds the new commits to the open PR. Fix review comments with new commits and push: no need to close it and open another.',
          demo: { setup: prReview, run: ['git commit -am "Fix bread price"', 'git push'] },
        },
        {
          id: 'gh3-review', type: 'choice',
          prompt: 'A reviewer asks you to fix a price. How do you update the pull request?',
          options: ['Commit on the same branch and push', 'Close the PR and open a new one', 'Commit the fix on main', 'Edit the PR description'],
          answer: 0,
          explain: 'The PR shows whatever its branch holds. Push, and the reviewer sees the new commit.',
        },
        {
          id: 'gh3-graph', type: 'graph',
          prompt: 'You committed the review fix on <code>prices</code>. Which graph does this give?',
          setup: prFixCommitted,
          command: 'git push',
          distractors: [['git push origin main'], ['git commit --amend -m "Fix the bread price"', 'git push --force-with-lease']],
          explain: 'origin/prices catches up with prices: the PR now shows three commits. Pushing main changes nothing, and amending would replace a commit instead of adding one.',
        },
        {
          id: 'gh3-after-merge', type: 'choice',
          prompt: 'Someone clicks Merge on your PR. What happens to <code>main</code> on your laptop?',
          options: ['Nothing until you fetch or pull', 'It updates automatically', 'It is deleted', 'It becomes a copy of your branch'],
          answer: 0,
          explain: 'The merge happened on GitHub. Your clone hears about it only when you talk to the remote.',
        },
        {
          id: 'gh3-head', type: 'learn', new: true, title: 'HEAD as a branch name',
          body: 'In a push, <code>HEAD</code> stands for the branch you are on. <code>git push -u origin HEAD</code> pushes it under the same name and tracks it: handy for long branch names.',
          teaches: ['push HEAD'],
        },
        {
          id: 'gh3-fill', type: 'fill', needs: ['push HEAD'],
          prompt: 'Push whatever branch you are on, under the same name, and track it.',
          before: 'git push -u origin ', after: '',
          options: ['HEAD', 'main', 'origin', '--all'],
          answer: 0,
          explain: 'In a push, <code>HEAD</code> means "the current branch". Handy for long branch names.',
        },
        {
          id: 'gh3-type-review', type: 'type',
          prompt: 'The reviewer was right: the bread price in <code>menu.html</code> is already fixed in your working tree. Commit it and update the PR.',
          setup: prReview,
          check: (r) => has(fileAt(r, 'origin/prices', 'menu.html'), 'bread 3.50') && r.s.remote.branches.prices === r.s.branches.prices && msgAt(r, 'origin/prices~1') === 'Add tea prices',
          solution: 'git commit -am "Fix bread price" && git push',
          explain: 'A new commit on top, a plain push, no force needed. The PR updates by itself.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'github-4', title: 'Keeping a PR current',
      exercises: [
        {
          id: 'gh4-behind', type: 'learn', new: true, title: 'Your PR fell behind',
          body: 'While your PR waits, other PRs land on main. Catch up by <b>merging main into your branch</b> (nothing rewritten) or <b>rebasing onto main</b> (linear, but new ids, so you must force-push). GitHub\'s <b>Update branch</b> button does the merge for you.',
          teaches: ['Update branch button'],
          demo: { setup: prBehindFetched, run: ['git rebase origin/main'] },
        },
        {
          id: 'gh4-graph', type: 'graph',
          prompt: 'You fetched; origin/main has two new commits. You are on <code>prices</code>. Which graph?',
          setup: prBehindFetched,
          command: 'git rebase origin/main',
          distractors: [['git merge origin/main'], ['git rebase main']],
          explain: 'Your two commits are replayed on the new origin/main, and the old ones fade. Your local main never moved, so <code>git rebase main</code> does nothing.',
        },
        {
          id: 'gh4-rejected', type: 'choice',
          prompt: 'After rebasing your pushed <code>prices</code> branch, plain <code>git push</code> is rejected. Why?',
          options: ['The rebase made new commits; the remote still has the old ones', 'Rebased branches can never be pushed', 'The PR is locked during review', 'You forgot to commit'],
          answer: 0,
          explain: 'The remote tip is not an ancestor of your new tip. <code>git push --force-with-lease</code> replaces it, checking nobody else pushed meanwhile.',
        },
        {
          id: 'gh4-match', type: 'match', needs: ['Update branch button'],
          prompt: 'Match each way of catching up to its effect.',
          pairs: [
            ['git merge origin/main', 'Keeps your commits, adds a merge commit'],
            ['git rebase origin/main', 'Linear history, new ids for your commits'],
            ['git push --force-with-lease', 'Replace the PR branch if nobody else pushed'],
            ['"Update branch" button', 'GitHub merges main into your branch'],
          ],
          explain: 'The button merges by default (it can also rebase). Either way, pull afterwards so your laptop has the result.',
        },
        {
          id: 'gh4-stale-main', type: 'fill',
          prompt: 'You just ran <code>git fetch</code>. Rebase your PR branch onto the newest main.',
          before: 'git rebase ', after: '',
          options: ['origin/main', 'main', 'prices', 'HEAD'],
          answer: 0,
          explain: 'Your local <code>main</code> is stale until you pull it. <code>origin/main</code> is what the fetch just updated.',
        },
        {
          id: 'gh4-shared', type: 'choice',
          prompt: 'A teammate also pushes commits to your PR branch. Which way of catching up is safer?',
          options: ['Merge main in: nothing is rewritten, so no force-push', 'Rebase, then git push --force', 'Delete the branch and start again', 'Rebase their commits away'],
          answer: 0,
          explain: 'Rebasing a branch others build on forces them to recover. If you must rebase, agree first and use a lease.',
        },
        {
          id: 'gh4-order', type: 'order',
          prompt: 'Catch up with main by merging (no rewrite), in order.',
          steps: ['git switch prices', 'git fetch', 'git merge origin/main', 'git push'],
          explain: 'A merge only adds a commit on top, so a plain push is accepted.',
        },
        {
          id: 'gh4-build', type: 'build',
          prompt: 'Update the PR branch after a rebase, safely.',
          tiles: ['git', 'push', '--force-with-lease', '--force', 'pull', 'origin/main'],
          answers: [['git', 'push', '--force-with-lease']],
          explain: 'The lease protects commits you have not seen. Plain <code>--force</code> does not.',
        },
        {
          id: 'gh4-type-rebase', type: 'type',
          prompt: 'Two PRs landed on main since you opened yours. Fetch, rebase <code>prices</code> onto the new main, and update the PR the safe way.',
          setup: prBehind,
          check: (r) => r.isAncestor(r.s.remote.branches.main, r.s.branches.prices) && r.s.remote.branches.prices === r.s.branches.prices && noMerges(r, 'origin/main', 'prices') && msgAt(r, 'prices') === 'Add tea prices' && leasedOnly(r),
          solution: 'git fetch && git rebase origin/main && git push --force-with-lease',
          explain: 'A straight line on top of main, and the lease made sure nobody had pushed to <code>prices</code> meanwhile.',
        },
        {
          id: 'gh4-type-merge', type: 'type',
          prompt: 'Same situation, but a teammate pushes to <code>prices</code> too. Catch up by merging main in (no rewrite), and push.',
          setup: prBehind,
          check: (r) => isMerge(r, 'prices') && r.isAncestor(r.s.remote.branches.main, r.s.branches.prices) && r.s.remote.branches.prices === r.s.branches.prices && !ran(r, /--force/),
          solution: 'git fetch && git merge origin/main && git push',
          explain: 'One merge commit on top of your work; every earlier commit kept its id, so a normal push was enough.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'github-5', title: 'Merge buttons and cleanup',
      exercises: [
        {
          id: 'gh5-buttons', type: 'learn', new: true, title: 'Three merge buttons',
          body: '<b>Create a merge commit</b>: a new two-parent commit; your commits join main unchanged. <b>Squash and merge</b>: one new commit holding all the changes. <b>Rebase and merge</b>: each commit copied onto main with a new id.',
          demo: { setup: prMergeCommit, run: ['git pull'] },
        },
        {
          id: 'gh5-first-parent', type: 'learn', new: true, title: 'One line per PR',
          body: 'With merge commits, every PR lands on main as one merge. <code>git log --first-parent main</code> follows only main\'s first parents, so it reads one line per merged PR, with each PR\'s own commits folded away.',
        },
        {
          id: 'gh5-match', type: 'match',
          prompt: 'Match each merge button to what it does to history.',
          pairs: [
            ['Create a merge commit', 'Two-parent commit; PR commits keep their ids'],
            ['Squash and merge', 'One new commit; PR commits are not on main'],
            ['Rebase and merge', 'Copies with new ids; no merge commit'],
            ['git log --first-parent main', 'One line per PR when merge commits are used'],
          ],
          explain: 'Squash and rebase-merge both give main a straight line, but only a merge commit keeps your original commits on main.',
        },
        {
          id: 'gh5-graph', type: 'graph',
          prompt: 'Your PR was <b>squash-merged</b> on GitHub. You are on main. Which graph does this give?',
          setup: prSquashed,
          command: 'git pull',
          distractors: [['git fetch'], ['git merge prices']],
          explain: 'main gains one new commit whose only parent is the old main. Your two <code>prices</code> commits are left beside it, not inside it.',
        },
        {
          id: 'gh5-ancestor', type: 'choice',
          prompt: 'After a squash merge, is the last commit of your <code>prices</code> branch an ancestor of main?',
          options: ['No: main got a brand-new commit with the same changes', 'Yes: squashing keeps the original commits', 'Only the first commit is', 'Yes, once you pull'],
          answer: 0,
          explain: 'Git checks ancestry, not content. That is why <code>git branch -d prices</code> can say "not fully merged" after a squash.',
        },
        {
          id: 'gh5-rebase-merge', type: 'choice',
          prompt: 'After <b>Rebase and merge</b>, <code>git log main</code> shows your two commit messages. Are those your commits?',
          options: ['Copies: same changes and messages, new ids', 'Yes, the same ids as on your branch', 'No, GitHub squashed them', 'Only if main had not moved'],
          answer: 0,
          explain: 'GitHub replays each commit with a new parent and itself as committer, so the ids always change, even when main had not moved.',
        },
        {
          id: 'gh5-type-behind', type: 'type',
          prompt: 'Your PR was merged and you ran <code>git fetch</code>. <code>git status</code> says <i>"Your branch is behind \'origin/main\' by 3 commits, and can be fast-forwarded."</i> Catch up.',
          setup: prMergedFetched,
          check: (r) => r.branchName() === 'main' && r.s.branches.main === r.s.remote.branches.main,
          solution: 'git pull',
          explain: 'You had no local commits on main, so it was a fast-forward: the PR commits and GitHub\'s merge commit.',
        },
        {
          id: 'gh5-cleanup', type: 'learn', new: true, title: 'Clean up after the merge',
          body: 'Once merged, the branch is done. GitHub can delete <code>origin/prices</code> for you. Locally: switch to main, pull, delete your branch, and drop stale <code>origin/*</code> labels with <code>git fetch --prune</code>. <code>git pull --prune</code> pulls and prunes at once.',
        },
        {
          id: 'gh5-gone', type: 'choice',
          prompt: 'What does <code>gone</code> mean here?',
          code: '$ git branch -vv\n* main    7c1d2e9 [origin/main] Add cake and tea prices (#12)\n  prices  4b8a0f3 [origin/prices: gone] Add tea prices',
          options: ['Its remote branch was deleted (and you pruned)', 'Your local branch lost its commits', 'The PR was rejected', 'prices was renamed'],
          answer: 0,
          explain: 'A "gone" upstream is the classic sign of a merged PR whose branch GitHub deleted. Safe to delete locally once you have checked.',
        },
        {
          id: 'gh5-fill', type: 'fill',
          prompt: 'Your PR was squash-merged and <code>origin/prices</code> is gone. <code>git branch -d prices</code> refuses: "not fully merged". Delete it anyway.',
          before: 'git branch ', after: ' prices',
          options: ['-D', '-d', '-m', '-r'],
          answer: 0,
          explain: '<code>-d</code> only deletes branches whose tip is an ancestor of HEAD or its upstream. After a squash it is not, so use <code>-D</code>.',
        },
        {
          id: 'gh5-type-cleanup', type: 'type',
          prompt: 'Your PR was squash-merged and GitHub deleted the branch. Update <code>main</code>, delete your local <code>prices</code>, and drop the stale <code>origin/prices</code>.',
          setup: prSquashedGone,
          check: (r) => r.branchName() === 'main' && r.s.branches.main === r.s.remote.branches.main && !('prices' in r.s.branches) && !('prices' in r.s.tracking),
          solution: 'git switch main && git pull --prune && git branch -D prices',
          explain: 'Back to a tidy clone: main up to date, no leftover branch, no stale label. <code>git config fetch.prune true</code> makes pruning automatic.',
        },
      ],
    },
  ],
};
