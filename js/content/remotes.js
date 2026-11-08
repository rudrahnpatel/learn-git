// Unit 6: Remotes. fetch, pull, push, divergence (modern pull rules), force-with-lease, tracking.
import { msgAt, fileAt, has, isMerge, noMerges, pushed, ran } from './helpers.js';

const teamAhead = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Agency</h1>' });
  r.setupCommit('Add homepage', { 'home.html': '<p>Welcome</p>' });
  r.setupRemote();
  r.teammatePush('main', 'Add contact page', { 'contact.html': '<form>contact</form>' });
  r.teammatePush('main', 'Fix contact form email', { 'contact.html': '<form action=mailto:hi@example.com>contact</form>' });
};
const newBranch = (r) => {
  r.setupCommit('Initial commit', { 'app.js': 'render()' });
  r.setupRemote();
  r.sh('git switch -c dark-toggle');
  r.setupCommit('Add dark mode toggle', { 'app.js': 'render()\naddToggle("dark")' });
};
const awayDiverged = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Hi</h1>' });
  r.setupRemote();
  r.teammatePush('main', 'Translate homepage to Spanish', { 'es.html': '<h1>Hola</h1>' });
  r.setupCommit('Add pricing table', { 'pricing.html': '<table></table>' });
};
const awayDivergedFetched = (r) => { awayDiverged(r); r.sh('git fetch'); };
const searchPushed = (r) => {
  r.setupCommit('Initial commit', { 'app.js': 'app()' });
  r.setupRemote();
  r.sh('git switch -c search');
  r.setupCommit('Add serach', { 'search.js': 'search()' });
  r.sh('git push -u origin search');
};
const searchAmended = (r) => { searchPushed(r); r.sh('git commit --amend -m "Add search"'); };
const remoteOnlyBranch = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>' });
  r.setupRemote();
  r.sh('git switch -c reviews');
  r.setupCommit('Add reviews page', { 'reviews.html': '<h2>Reviews</h2>' });
  r.sh('git push -u origin reviews');
  r.sh('git switch main');
  r.sh('git branch -D reviews');
};
const staleRemoteBranch = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>' });
  r.setupRemote();
  r.sh('git switch -c old-banner');
  r.setupCommit('Add holiday banner', { 'banner.html': '<div>Ho ho ho</div>' });
  r.sh('git push -u origin old-banner');
  r.sh('git switch main');
  r.sh('git branch -D old-banner');
  delete r.s.remote.branches['old-banner']; // a teammate deleted it on the remote
};
const leftoverRemoteBranch = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>' });
  r.setupRemote();
  r.sh('git switch -c old-feature');
  r.setupCommit('Try carousel', { 'carousel.js': 'spin()' });
  r.sh('git push -u origin old-feature');
  r.sh('git switch main');
  r.sh('git merge old-feature');
};

export default {
  id: 'remotes', title: 'Remotes', color: 'sunbeam',
  blurb: 'fetch, pull, push, diverged branches and safe force-pushes.',
  challenges: ['diverged', 'force-with-lease', 'secret'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'remotes-1', title: 'origin and fetch',
      exercises: [
        {
          id: 'rm1-origin', type: 'learn', new: true, title: 'origin/main is a snapshot',
          body: 'A remote, usually called <code>origin</code>, is another copy of the repo. <code>origin/main</code> is your last-known picture of its main. It only updates when you talk to the remote, with <code>git fetch</code>, pull or push.',
          demo: { setup: teamAhead, run: ['git fetch'] },
        },
        {
          id: 'rm1-stale', type: 'choice',
          prompt: 'A teammate pushed five minutes ago. You have not run any git command since. What does your <code>origin/main</code> show?',
          options: ['The old position, from your last fetch', 'Their new commit, automatically', 'Nothing until you clone again', 'An error'],
          answer: 0,
          explain: 'Git never talks to the network on its own. Fetch to update your picture of the remote.',
        },
        {
          id: 'rm1-graph-fetch', type: 'graph',
          prompt: 'Teammates pushed two commits. Which graph does this give?',
          setup: teamAhead,
          command: 'git fetch',
          distractors: [['git pull']],
          explain: 'Fetch downloads the commits and moves origin/main, but never touches your main. Pull would also move main.',
        },
        {
          id: 'rm1-pull', type: 'learn', new: true, title: 'pull = fetch + merge',
          body: '<code>git pull</code> is <code>git fetch</code> plus a merge of <code>origin/main</code> into the branch you are on. With no local commits it is a fast-forward: main just slides up. <code>git push</code> goes the other way and uploads your commits.',
          demo: { setup: teamAhead, run: ['git pull'] },
        },
        {
          id: 'rm1-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git fetch', 'Download commits, move origin/* only'],
            ['git pull', 'Fetch, then integrate into your branch'],
            ['git push', 'Upload your branch to the remote'],
            ['origin/main', 'Your last-known picture of the remote main'],
          ],
          explain: 'Fetch is always safe: it only updates remote-tracking branches. Pull and push change things.',
        },
        {
          id: 'rm1-incoming', type: 'learn', new: true, title: 'Look before you pull',
          body: 'After a fetch, <code>git log main..origin/main</code> lists the commits that are on the remote but not on your main: exactly what a pull would bring in.',
        },
        {
          id: 'rm1-fill', type: 'fill',
          prompt: 'List the incoming commits after a fetch.',
          before: 'git log --oneline main..', after: '',
          options: ['origin/main', 'main', 'HEAD', 'remote'],
          answer: 0,
          explain: '<code>A..B</code> means "on B but not on A". Flip it, <code>origin/main..main</code>, to see what you have not pushed.',
        },
        {
          id: 'rm1-behind', type: 'choice',
          prompt: 'What should you run?',
          code: "On branch main\nYour branch is behind 'origin/main' by 2 commits, and can be fast-forwarded.",
          options: ['git pull', 'git push', 'git push --force', 'git reset --hard'],
          answer: 0,
          explain: 'You have no local commits, so the pull is a simple fast-forward. Pushing would be rejected: you are behind.',
        },
        {
          id: 'rm1-build', type: 'build',
          prompt: 'Show the commits that are on origin/main but not on your main, one per line.',
          tiles: ['git', 'log', '--oneline', 'main..origin/main', 'origin/main..main', 'pull'],
          answers: [['git', 'log', '--oneline', 'main..origin/main'], ['git', 'log', 'main..origin/main', '--oneline']],
          explain: 'The order of the two sides matters: the left side is what you exclude.',
        },
        {
          id: 'rm1-type-fetch', type: 'type',
          prompt: 'Download your teammates\' new commits <b>without</b> changing your main.',
          setup: teamAhead,
          check: (r) => r.s.tracking.main === r.s.remote.branches.main && msgAt(r, 'main') === 'Add homepage',
          solution: 'git fetch',
          explain: 'origin/main jumped ahead and main stayed put. Now you can look before you integrate.',
        },
        {
          id: 'rm1-type-pull', type: 'type',
          prompt: 'Now bring those two commits into your main.',
          setup: teamAhead,
          check: (r) => r.s.branches.main === r.s.remote.branches.main && r.branchName() === 'main',
          solution: 'git pull',
          explain: 'You had no local commits, so pull fast-forwarded main. Fetch plus <code>git merge origin/main</code> does the same.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'remotes-2', title: 'Push',
      exercises: [
        {
          id: 'rm2-push', type: 'learn', new: true, title: 'push and -u',
          body: '<code>git push origin dark-toggle</code> uploads a branch. Add <code>-u</code> the first time and git remembers that your branch tracks <code>origin/dark-toggle</code>. After that, plain <code>git push</code> and <code>git pull</code> know where to go.',
          demo: { setup: newBranch, run: ['git push -u origin dark-toggle'] },
        },
        {
          id: 'rm2-no-upstream', type: 'choice',
          prompt: 'On a brand-new branch, you type plain <code>git push</code>. What happens?',
          options: ['Git refuses: the branch has no upstream yet, and suggests the -u command', 'It pushes to main', 'It pushes every branch', 'It silently does nothing'],
          answer: 0,
          explain: 'Git will not guess where a new branch should go. Setting <code>push.autoSetupRemote</code> makes it automatic.',
        },
        {
          id: 'rm2-graph', type: 'graph',
          prompt: 'You are on <code>dark-toggle</code>, which only exists locally. Which graph?',
          setup: newBranch,
          command: 'git push -u origin dark-toggle',
          distractors: [['git push origin main']],
          explain: 'A new remote-tracking label, origin/dark-toggle, appears on your commit. main was already up to date, so pushing it changes nothing.',
        },
        {
          id: 'rm2-fill', type: 'fill',
          prompt: 'Push feature for the first time and remember the upstream.',
          before: 'git push ', after: ' origin feature',
          options: ['-u', '-f', '--all', '-d'],
          answer: 0,
          explain: '<code>-u</code> is short for <code>--set-upstream</code>. <code>-f</code> would force-push, which is never needed for a new branch.',
        },
        {
          id: 'rm2-delete', type: 'learn', new: true, title: 'Delete a remote branch',
          body: 'A merged branch lives on in the remote too. <code>git push origin --delete old-feature</code> removes it there. Your local label is separate: <code>git branch -d old-feature</code> removes that one.',
          demo: { setup: leftoverRemoteBranch, run: ['git push origin --delete old-feature'] },
        },
        {
          id: 'rm2-match', type: 'match',
          prompt: 'Match each push option to what it does.',
          needs: ['git push -u', 'git push --delete', 'git push --tags'],
          pairs: [
            ['-u', 'Remember the upstream branch'],
            ['No option', 'Push the branch to its upstream'],
            ['--delete', 'Remove a branch from the remote'],
            ['--tags', 'Push all your tags'],
          ],
          explain: 'Most days you need none of these. Plain <code>git push</code> on a tracked branch does the job.',
        },
        {
          id: 'rm2-build', type: 'build',
          prompt: 'Push <code>dark-toggle</code> to origin and set it as the upstream.',
          tiles: ['git', 'push', '-u', 'origin', 'dark-toggle', 'pull', '-f'],
          answers: [['git', 'push', '-u', 'origin', 'dark-toggle'], ['git', 'push', 'origin', 'dark-toggle', '-u'], ['git', 'push', 'origin', '-u', 'dark-toggle']],
          explain: 'Remote first, then branch. The <code>-u</code> flag can go anywhere in the command.',
        },
        {
          id: 'rm2-type-push', type: 'type',
          prompt: 'Share your <code>dark-toggle</code> branch and make it track <code>origin/dark-toggle</code>.',
          setup: newBranch,
          check: (r) => r.s.remote.branches['dark-toggle'] === r.s.branches['dark-toggle'] && r.s.upstream['dark-toggle'] === 'dark-toggle',
          solution: 'git push -u origin dark-toggle',
          explain: 'From now on, plain <code>git push</code> and <code>git pull</code> work on this branch.',
        },
        {
          id: 'rm2-up-to-date', type: 'choice',
          prompt: 'After you push, <code>git status</code> says "up to date with origin/main". Do teammates already have your commit?',
          options: ['The remote has it; they get it when they fetch or pull', 'Yes, it is on their machines now', 'No, the push only updated origin/main locally', 'Only if they are on main'],
          answer: 0,
          explain: 'Pushing updates the shared remote. Every clone still has to fetch to see it, just like you do.',
        },
        {
          id: 'rm2-type-delete', type: 'type',
          prompt: 'The <code>old-feature</code> branch is merged. Delete it <b>from the remote</b>.',
          setup: leftoverRemoteBranch,
          check: (r) => !('old-feature' in r.s.remote.branches),
          solution: 'git push origin --delete old-feature',
          explain: 'The remote branch is gone. Your local <code>old-feature</code> label is separate: delete it with <code>git branch -d</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'remotes-3', title: 'Diverged',
      exercises: [
        {
          id: 'rm3-diverged', type: 'learn', new: true, title: 'Both sides moved',
          body: 'A teammate pushed while you were committing. Your push is rejected, because it would throw their commit away. Modern <code>git pull</code> refuses to guess here: choose <code>--rebase</code> or <code>--no-rebase</code> (merge), or set <code>pull.rebase</code> once.',
        },
        {
          id: 'rm3-graph', type: 'graph',
          prompt: 'You and a teammate both committed on main. You have fetched. Which graph?',
          setup: awayDivergedFetched,
          command: 'git pull --rebase',
          distractors: [['git pull --no-rebase'], ['git push --force']],
          explain: 'Your commit is replayed on top of theirs: a straight line. --no-rebase would add a merge commit, and --force would erase their commit from the remote.',
        },
        {
          id: 'rm3-why-refuse', type: 'choice',
          prompt: '<code>git pull</code> fails with <i>"Need to specify how to reconcile divergent branches."</i> Why?',
          options: ['Both sides have new commits, and git wants you to pick merge or rebase', 'The remote is offline', 'You have uncommitted changes', 'Your branch has no upstream'],
          answer: 0,
          explain: 'Recent git versions stop and ask instead of silently merging. <code>--rebase</code>, <code>--no-rebase</code> or a <code>pull.rebase</code> setting answers it.',
        },
        {
          id: 'rm3-config', type: 'learn', new: true, title: 'Pick a default once',
          body: '<code>git config pull.rebase true</code> makes every pull rebase; <code>false</code> makes it merge. <code>git pull --ff-only</code> is the cautious third way: it only fast-forwards, and stops if both sides moved.',
        },
        {
          id: 'rm3-match', type: 'match',
          prompt: 'Match each command to how it integrates.',
          pairs: [
            ['git pull --rebase', 'Replay my commits on top of theirs'],
            ['git pull --no-rebase', 'Make a merge commit'],
            ['git pull --ff-only', 'Only if I have no local commits'],
            ['git config pull.rebase true', 'Make rebasing the default for pull'],
          ],
          explain: 'Many teams set <code>pull.rebase true</code> so local work always lands neatly on top.',
        },
        {
          id: 'rm3-fill', type: 'fill',
          prompt: 'Make every future git pull rebase by default.',
          before: 'git config pull.rebase ', after: '',
          options: ['true', 'false', 'always', 'never'],
          answer: 0,
          explain: '<code>false</code> means merge. Add <code>--global</code> to apply it to all your repositories.',
        },
        {
          id: 'rm3-order', type: 'order',
          prompt: 'Your push was rejected because a teammate pushed first. In order:',
          steps: ['git push (rejected: fetch first)', 'git pull --rebase', 'git log --oneline --graph (check)', 'git push'],
          explain: 'Integrate their work, check the result, then push. No force needed, because you built on top of their commit.',
        },
        {
          id: 'rm3-build', type: 'build',
          prompt: 'Bring in the remote commits and put your local commits on top.',
          tiles: ['git', 'pull', '--rebase', '--force', 'push', 'merge'],
          answers: [['git', 'pull', '--rebase']],
          explain: 'Pull with rebase is fetch plus <code>git rebase origin/main</code> in one step.',
        },
        {
          id: 'rm3-type-rebase', type: 'type',
          prompt: 'Your push is rejected: a teammate pushed first. Put your commit on top of theirs (no merge commit), then push.',
          setup: awayDiverged,
          check: (r) => msgAt(r, 'main') === 'Add pricing table' && msgAt(r, 'main~1') === 'Translate homepage to Spanish' && noMerges(r, null, 'main') && pushed(r),
          solution: 'git pull --rebase && git push',
          explain: 'A straight line on origin/main, with your commit last. If the rebase had conflicted, you would resolve and <code>git rebase --continue</code>.',
        },
        {
          id: 'rm3-type-merge', type: 'type',
          prompt: 'Same situation, but your team prefers merge commits. Integrate with a merge, then push.',
          setup: awayDiverged,
          check: (r) => isMerge(r, 'main') && fileAt(r, 'main', 'es.html') !== undefined && fileAt(r, 'main', 'pricing.html') !== undefined && pushed(r),
          solution: 'git pull --no-rebase && git push',
          explain: 'The merge commit records that two lines of work met. Both are valid; teams just pick one style.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'remotes-4', title: 'Force-pushing safely',
      exercises: [
        {
          id: 'rm4-lease', type: 'learn', new: true, title: '--force vs --force-with-lease',
          body: 'After you amend or rebase pushed commits, a normal push is rejected. <code>--force</code> overwrites the remote no matter what. <code>--force-with-lease</code> overwrites only if the remote is still where your <code>origin/</code> branch says.',
          demo: { setup: searchAmended, run: ['git push --force-with-lease'] },
        },
        {
          id: 'rm4-graph', type: 'graph',
          prompt: 'You amended your pushed <code>search</code> commit. Which graph does this give?',
          setup: searchAmended,
          command: 'git push --force-with-lease',
          distractors: [['git pull --no-rebase']],
          explain: 'origin/search moves to your amended commit, and the old one fades. Pulling would merge the old and new versions of the same commit together.',
        },
        {
          id: 'rm4-stale', type: 'choice',
          prompt: 'A teammate pushed to your <code>search</code> branch after your last fetch. You run <code>git push --force-with-lease</code>. What happens?',
          options: ['Rejected (stale info): their commit is safe', 'Their commit is overwritten', 'Git merges their commit in automatically', 'Your branch is deleted'],
          answer: 0,
          explain: 'The lease checks that the remote is where you last saw it. It is not, so git refuses. <code>--force</code> would have deleted their work.',
        },
        {
          id: 'rm4-match', type: 'match', needs: ['git push --force', 'git push --force-with-lease'],
          prompt: 'Match each phrase to its meaning.',
          pairs: [
            ['--force', 'Overwrite the remote no matter what'],
            ['--force-with-lease', 'Overwrite only if nobody pushed since my fetch'],
            ['rejected (stale info)', 'The lease failed: someone pushed'],
            ['Shared branches like main', 'Never force-push'],
          ],
          explain: 'Force-push only your own branches, and always with a lease.',
        },
        {
          id: 'rm4-fill', type: 'fill',
          prompt: 'Update the remote after a rebase, without risking a teammate\'s commits.',
          before: 'git push ', after: '',
          options: ['--force-with-lease', '--force', '--safe', '--lease-only'],
          answer: 0,
          explain: 'Long to type, but it is the habit that prevents "where did my commit go?" afternoons.',
        },
        {
          id: 'rm4-fetch-trap', type: 'choice',
          prompt: 'You run <code>git fetch</code>, do not look at what came in, then <code>git push --force-with-lease</code>. Is that still safe?',
          options: ['No: the fetch updated origin/, so the lease passes and overwrites what you just fetched', 'Yes, the lease always protects others', 'Yes, fetch cancels the force', 'No, the push is always rejected after a fetch'],
          answer: 0,
          explain: 'The lease compares with your origin/ branch. Fetching moves it, so look at incoming commits (and rebase onto them) before forcing.',
        },
        {
          id: 'rm4-order', type: 'order',
          prompt: 'Bring your pushed PR branch up to date with main, linearly.',
          steps: ['git fetch', 'git rebase origin/main', 'git push --force-with-lease'],
          explain: 'Rebasing rewrote the branch, so the final push must replace it. The lease makes sure nobody else pushed meanwhile.',
        },
        {
          id: 'rm4-build', type: 'build',
          prompt: 'Force-push your current branch safely.',
          tiles: ['git', 'push', '--force-with-lease', '--force', 'pull', '--rebase'],
          answers: [['git', 'push', '--force-with-lease']],
          explain: 'With an upstream set, git knows which remote branch to update.',
        },
        {
          id: 'rm4-type-amend-push', type: 'type',
          prompt: 'Your pushed <code>search</code> commit says <code>Add serach</code>. Fix the message to <code>Add search</code> and update origin the safe way.',
          setup: searchPushed,
          check: (r) => msgAt(r, 'origin/search') === 'Add search' && r.s.remote.branches.search === r.s.branches.search && ran(r, /--force-with-lease/) && !ran(r, /push.*(\s--force(\s|$)|\s-f(\s|$))/),
          solution: 'git commit --amend -m "Add search" && git push --force-with-lease',
          explain: 'Amend made a new commit, and the lease checked that origin/search had not moved before replacing it.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'remotes-5', title: 'Tracking branches',
      exercises: [
        {
          id: 'rm5-track', type: 'learn', new: true, title: 'Work on a teammate\'s branch',
          body: 'If <code>origin/reviews</code> exists but you have no local <code>reviews</code>, just run <code>git switch reviews</code>. Git creates the local branch from it and sets it to track origin/reviews.',
          demo: { setup: remoteOnlyBranch, run: ['git switch reviews'] },
        },
        {
          id: 'rm5-graph', type: 'graph',
          prompt: 'Only <code>origin/reviews</code> exists. Which graph does this give?',
          setup: remoteOnlyBranch,
          command: 'git switch reviews',
          distractors: [['git switch --detach origin/reviews'], ['git branch reviews']],
          explain: 'A new local reviews, on the same commit as origin/reviews, with HEAD on it. <code>git branch reviews</code> would create it at main instead.',
        },
        {
          id: 'rm5-prune', type: 'learn', new: true, title: 'List and prune',
          body: '<code>git branch -r</code> lists remote-tracking branches; <code>git branch -vv</code> shows the upstream each local branch tracks. A branch deleted on the remote lingers here as a stale <code>origin/</code> label until <code>git fetch --prune</code> removes it.',
        },
        {
          id: 'rm5-match', type: 'match',
          prompt: 'Match each command to what it shows or does.',
          pairs: [
            ['git branch -r', 'List remote-tracking branches'],
            ['git branch -vv', 'Show each branch\'s upstream'],
            ['git fetch --prune', 'Drop origin/* refs deleted on the remote'],
            ['git switch reviews', 'Create local reviews from origin/reviews'],
          ],
          explain: 'Remote-tracking branches are read-only bookmarks. You commit on local branches that track them.',
        },
        {
          id: 'rm5-stale', type: 'choice',
          prompt: 'A teammate deleted <code>old-banner</code> on the remote, but your <code>git branch -r</code> still lists <code>origin/old-banner</code>. Why?',
          options: ['Fetch does not remove deleted branches unless you prune', 'The delete failed', 'Your clone is corrupted', 'Remote branches can never be deleted'],
          answer: 0,
          explain: '<code>git fetch --prune</code> (or <code>fetch.prune true</code>) cleans up refs for branches that no longer exist.',
        },
        {
          id: 'rm5-fill', type: 'fill',
          prompt: 'Fetch, and forget remote branches that were deleted.',
          before: 'git fetch ', after: '',
          options: ['--prune', '--clean', '--all', '--tidy'],
          answer: 0,
          explain: '<code>--all</code> fetches from every remote. <code>--prune</code> is the one that removes stale refs.',
        },
        {
          id: 'rm5-pull-scope', type: 'choice',
          prompt: 'Does <code>git pull</code> on main update your local <code>reviews</code> branch too?',
          options: ['No: it only integrates into the branch you are on', 'Yes, it updates every local branch', 'Only if reviews is merged', 'Only with --all'],
          answer: 0,
          explain: 'The fetch half updates all origin/* refs, but the merge or rebase half only touches the current branch.',
        },
        {
          id: 'rm5-build', type: 'build',
          prompt: 'Start working on the teammate\'s <code>reviews</code> branch, tracking origin/reviews.',
          tiles: ['git', 'switch', '-c', 'reviews', 'origin/reviews', '--detach', 'branch'],
          answers: [['git', 'switch', 'reviews'], ['git', 'switch', '-c', 'reviews', 'origin/reviews']],
          explain: 'The short form guesses from origin/reviews. The long form says it explicitly, and also sets up tracking because the start point is a remote branch.',
        },
        {
          id: 'rm5-type-switch', type: 'type',
          prompt: 'A teammate pushed <code>reviews</code>. Get a local copy that tracks it, and switch to it.',
          setup: remoteOnlyBranch,
          check: (r) => r.branchName() === 'reviews' && r.s.upstream.reviews === 'reviews' && r.s.branches.reviews === r.s.tracking.reviews,
          solution: 'git switch reviews',
          explain: '<code>git branch -vv</code> now shows <code>[origin/reviews]</code> next to it.',
        },
        {
          id: 'rm5-type-prune', type: 'type',
          prompt: '<code>old-banner</code> was deleted on the remote, but <code>origin/old-banner</code> is still in your graph. Clean it up.',
          setup: staleRemoteBranch,
          check: (r) => !('old-banner' in r.s.tracking),
          solution: 'git fetch --prune',
          explain: 'The stale label is gone. Its commit is unreachable now, so it fades away too.',
        },
      ],
    },
  ],
};
