// The curriculum. Each level builds a repo in setup(), states a goal, and checks the
// resulting state in check(), which returns [label, passed] pairs (all must pass).
// `solution` is the intended play; tests/levels.test.mjs runs every one of them.
import { Repo, firstLine } from './git.js';

/* ------------------------------------------------------------- helpers */
const msgAt = (r, ref) => { const id = r.tryResolve(ref); return id ? firstLine(r.commit(id).msg) : null; };
const fileAt = (r, ref, p) => { const id = r.tryResolve(ref); return id ? r.tree(id)[p] : undefined; };
const settled = (r) => !r.inProgress();
const clean = (r) => r.isClean() && settled(r);
const spotless = (r) => clean(r) && r.untracked().length === 0;
const span = (r, a, b) => { const B = r.tryResolve(b); return B ? r.range(r.tryResolve(a), B) : []; };
const noMerges = (r, a, b) => span(r, a, b).every((id) => r.commit(id).parents.length < 2);
const isMerge = (r, ref) => { const id = r.tryResolve(ref); return !!id && r.commit(id).parents.length === 2; };
const has = (txt, s) => typeof txt === 'string' && txt.includes(s);
const markerFree = (r) => !Object.values(r.s.work).some((t) => /^(<{7}|>{7}) /m.test(t));

export const CHAPTERS = [
  { id: 'basics', title: 'Basics', blurb: 'Working tree, index, commit. The three places every file lives.' },
  { id: 'branching', title: 'Branching & merging', blurb: 'Cheap branches, fast-forwards, real merges and your first conflicts.' },
  { id: 'rewriting', title: 'Rewriting history', blurb: 'Amend, rebase, interactive cleanup and cherry-picking.' },
  { id: 'undoing', title: 'Undoing things', blurb: 'restore, reset, revert, reflog. And a few panic rooms.' },
  { id: 'workflow', title: 'Stash & workflow', blurb: 'Park unfinished work, juggle stashes, tag releases.' },
  { id: 'remotes', title: 'Remotes', blurb: 'fetch, pull, push, diverged branches and safe force-pushes.' },
  { id: 'detective', title: 'Detective work', blurb: 'log, show, blame and bisect: find out what happened and when.' },
  { id: 'github', title: 'GitHub workflow', blurb: 'Forks and upstream, pull requests, keeping a PR current, merge buttons and cleanup.' },
  { id: 'internals', title: 'Under the hood', blurb: 'Blobs, trees, commits and refs: what a branch and HEAD really are.' },
  { id: 'story', title: 'Story: Ship the bakery site', blurb: 'One project, start to finish: branch, conflict, rebase, bisect, release.' },
];

export const KINDS = {
  puzzle: { label: 'Puzzle', short: 'P' },
  rescue: { label: 'Rescue', short: 'R' },
  conflict: { label: 'Conflict surgeon', short: 'C' },
  bisect: { label: 'Bisect hunt', short: 'B' },
};

export const LEVELS = [
  /* =========================================================== BASICS */
  {
    id: 'first-commit', chapter: 'basics', kind: 'puzzle', title: 'Three places for every file',
    concept: `Git keeps your project in three places. The <b>working tree</b> is the files you edit. The <b>index</b> (also called the staging area) is a draft of your next commit. <b>HEAD</b> is the last commit you made. <code>git add</code> copies a file from the working tree into the index, and <code>git commit</code> saves everything in the index as a new commit. Watch the three-trees panel while you do it.`,
    goal: 'Commit the new file <code>pancakes.txt</code> and leave a clean working tree.',
    hints: ['Run <code>git status</code>: pancakes.txt is listed as untracked.', 'Stage it with <code>git add pancakes.txt</code>, and watch it appear in the Index column.', 'Then <code>git commit -m "Add pancakes recipe"</code>.'],
    debrief: 'You moved a file through all three trees: working tree, index, then a commit. Day to day you will run <code>git status</code> constantly. It is free and it tells you which tree is out of step with which.',
    setup(r) {
      r.setupCommit('Initial commit', { 'README.md': '# Recipe box\nA tiny app for recipes.' });
      r.setupFiles({ 'pancakes.txt': 'Pancakes\n2 eggs\n1 cup flour\n1 cup milk' });
    },
    check: (r) => [
      ['pancakes.txt is in the latest commit', has(fileAt(r, 'HEAD', 'pancakes.txt'), 'flour')],
      ['working tree is clean (git status)', spotless(r)],
    ],
    solution: ['git add pancakes.txt', 'git commit -m "Add pancakes recipe"'],
    chips: ['git status', 'git add pancakes.txt', 'git commit -m "Add pancakes recipe"'],
  },
  {
    id: 'stage-selectively', chapter: 'basics', kind: 'puzzle', title: 'Stage only what belongs',
    concept: `A commit should contain one logical change. Because staging is a separate step, you choose exactly what goes in. <code>git add &lt;file&gt;</code> stages one file and leaves the others alone. <code>git diff</code> shows changes you have not staged yet, so you can review them before you decide.`,
    goal: 'Commit the bug fix in <code>app.js</code>. Your edit to <code>notes.txt</code> is personal: keep it in the working tree, but do not commit it.',
    hints: ['<code>git diff</code> shows both edits. Only the app.js one is the fix.', 'Stage just that file: <code>git add app.js</code>.', 'Commit it: <code>git commit -m "Sum item prices in total"</code>. notes.txt stays modified.'],
    debrief: 'Selective staging keeps history readable: one commit, one idea. In real projects you can go further and stage single hunks with <code>git add -p</code>.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'function total(items) {\n  return items.length;\n}', 'notes.txt': 'todo: ask about tax' });
      r.setupFiles({ 'app.js': 'function total(items) {\n  return items.reduce((sum, i) => sum + i.price, 0);\n}', 'notes.txt': 'todo: ask about tax\nidea: dark mode?' });
    },
    check: (r) => [
      ['the latest commit has the fixed app.js', has(fileAt(r, 'HEAD', 'app.js'), 'reduce')],
      ['notes.txt was not committed', fileAt(r, 'HEAD', 'notes.txt') === 'todo: ask about tax\n'],
      ['your notes edit is still in the working tree', has(r.s.work['notes.txt'], 'dark mode')],
      ['nothing left in the index', r.stagedChanges().length === 0],
    ],
    solution: ['git add app.js', 'git commit -m "Sum item prices in total"'],
    chips: ['git status', 'git diff', 'git add app.js'],
  },
  {
    id: 'staged-snapshot', chapter: 'basics', kind: 'puzzle', title: 'The index is a snapshot',
    concept: `<code>git add</code> stores the file <i>as it is right now</i>. If you edit it again afterwards, the index still holds the older version until you add again. <code>git diff</code> compares the working tree with the index, and <code>git diff --staged</code> compares the index with HEAD. The same file can appear in both.`,
    goal: 'Commit the version of <code>recipe.txt</code> that is already staged (3 eggs). The chili experiment must stay in the working tree, uncommitted.',
    hints: ['Compare <code>git diff --staged</code> with <code>git diff</code>.', 'The staged version is exactly what you want, so do not run git add again.', '<code>git commit -m "Use 3 eggs"</code> commits the index only.'],
    debrief: 'A commit is made from the index, not from your files on disk. That is why "I edited it but the commit does not have it" happens: the edit was never staged, or it was made after the add.',
    setup(r) {
      r.setupCommit('Initial commit', { 'recipe.txt': 'Omelette\n2 eggs\nsalt' });
      r.setupFiles({ 'recipe.txt': 'Omelette\n3 eggs\nsalt' });
      r.sh('git add recipe.txt');
      r.setupFiles({ 'recipe.txt': 'Omelette\n3 eggs\nsalt\nchili flakes (experiment!)' });
    },
    check: (r) => [
      ['the new commit has 3 eggs', has(fileAt(r, 'HEAD', 'recipe.txt'), '3 eggs') && msgAt(r, 'HEAD~1') === 'Initial commit'],
      ['the chili experiment is not committed', !has(fileAt(r, 'HEAD', 'recipe.txt'), 'chili')],
      ['the chili line is still in the working tree', has(r.s.work['recipe.txt'], 'chili')],
    ],
    solution: ['git commit -m "Use 3 eggs"'],
    chips: ['git diff', 'git diff --staged', 'git status'],
  },
  {
    id: 'commit-all', chapter: 'basics', kind: 'puzzle', title: 'Commit every tracked change',
    concept: `<code>git commit -a</code> stages every <i>tracked</i> file that changed, then commits, in one step. Tracked means git already knows the file, because it was added at some point. Brand-new (untracked) files are skipped. That is a feature: scratch files do not sneak into history.`,
    goal: 'In a single command, commit the changes to both <code>style.css</code> and <code>index.html</code>. <code>scratch.txt</code> must stay untracked.',
    hints: ['Both changed files are tracked, and scratch.txt is not.', 'Flags can be combined: <code>-a</code> plus <code>-m</code>.', '<code>git commit -am "Update styles and hours"</code>'],
    debrief: '<code>commit -a</code> is handy for small edits to known files. Remember that it never adds new files, so check <code>git status</code> for untracked ones you meant to include.',
    setup(r) {
      r.setupCommit('Initial commit', { 'style.css': 'body { color: black; }', 'index.html': '<h1>Shop</h1>' });
      r.setupFiles({ 'style.css': 'body { color: #222; }', 'index.html': '<h1>Shop</h1>\n<p>Open daily 9-5</p>', 'scratch.txt': 'random thoughts' });
    },
    check: (r) => [
      ['both edits are in one new commit', has(fileAt(r, 'HEAD', 'style.css'), '#222') && has(fileAt(r, 'HEAD', 'index.html'), 'Open daily') && msgAt(r, 'HEAD~1') === 'Initial commit'],
      ['scratch.txt is still untracked', r.untracked().includes('scratch.txt') && fileAt(r, 'HEAD', 'scratch.txt') === undefined],
    ],
    solution: ['git commit -am "Update styles and hours"'],
    chips: ['git status', 'git commit -am ""'],
  },
  {
    id: 'gitignore', chapter: 'basics', kind: 'puzzle', title: 'Ignore the noise',
    concept: `Logs, build output and secrets should never be committed. A <code>.gitignore</code> file lists patterns, and untracked files that match them disappear from <code>git status</code> and are skipped by <code>git add .</code>. <code>*.log</code> matches any .log file and <code>build/</code> matches a whole folder. The .gitignore itself <i>is</i> committed, so the whole team shares it.`,
    goal: 'Create a <code>.gitignore</code> that ignores <code>*.log</code> files and the <code>build/</code> folder, then commit it. <code>git status</code> must end up completely clean.',
    hints: ['<code>echo "*.log" &gt; .gitignore</code> creates the file. <code>&gt;&gt;</code> appends a line.', 'Add the folder pattern: <code>echo "build/" &gt;&gt; .gitignore</code>.', 'Then <code>git add .gitignore</code> and commit.'],
    debrief: 'An ignore rule only affects untracked files. If a file is already committed, ignoring it does nothing: you also have to untrack it with <code>git rm --cached &lt;file&gt;</code>. You will need that later.',
    setup(r) {
      r.setupCommit('Initial commit', { 'main.py': 'print("hello")' });
      r.setupFiles({ 'debug.log': 'DEBUG starting\nDEBUG done', 'build/app.bin': '0101', 'build/cache.tmp': 'tmp' });
    },
    check: (r) => [
      ['.gitignore is committed', fileAt(r, 'HEAD', '.gitignore') !== undefined && fileAt(r, 'HEAD', '.gitignore') === r.s.work['.gitignore']],
      ['logs and build/ are ignored', r.isIgnored('debug.log') && r.isIgnored('build/app.bin')],
      ['no log or build files were committed', !Object.keys(r.headTree()).some((p) => p.endsWith('.log') || p.startsWith('build/'))],
      ['git status is clean', spotless(r)],
    ],
    solution: ['echo "*.log" > .gitignore', 'echo "build/" >> .gitignore', 'git add .gitignore', 'git commit -m "Ignore logs and build output"'],
    chips: ['git status', 'cat .gitignore', 'echo "*.log" > .gitignore'],
  },

  /* =========================================================== BRANCHING */
  {
    id: 'first-branch', chapter: 'branching', kind: 'puzzle', title: 'Branches are sticky notes',
    concept: `A branch is just a movable name that points at a commit. Creating one copies no files. <code>git switch -c name</code> creates a branch and moves you onto it. HEAD then points at the new branch, and the next commit moves that branch forward while <code>main</code> stays where it was. Watch the labels in the graph.`,
    goal: 'Create a branch called <code>dark-mode</code>, switch to it and make one commit there. <code>main</code> must not move.',
    hints: ['<code>git switch -c dark-mode</code>, or the older <code>git checkout -b dark-mode</code>.', 'Change a file, e.g. <code>edit site.html "&lt;h1 class=dark&gt;Bakery&lt;/h1&gt;"</code>.', 'Then <code>git commit -am "Dark header"</code>.'],
    debrief: 'Branches are cheap, so make one for every idea. The HEAD marker shows which branch your next commit will move. The commit you made exists only on dark-mode until you merge it.',
    setup(r) {
      r.setupCommit('Initial commit', { 'site.html': '<h1>Bakery</h1>' });
      r.setupCommit('Add menu', { 'menu.txt': 'bread\ncroissant' });
    },
    check: (r) => [
      ['branch dark-mode exists', 'dark-mode' in r.s.branches],
      ['dark-mode is one commit ahead of main', span(r, 'main', 'dark-mode').length === 1 && span(r, 'dark-mode', 'main').length === 0],
      ['main did not move', msgAt(r, 'main') === 'Add menu'],
      ['you are on dark-mode', r.branchName() === 'dark-mode'],
    ],
    solution: ['git switch -c dark-mode', 'edit site.html "<h1 class=dark>Bakery</h1>"', 'git commit -am "Dark header"'],
    target: true,
    chips: ['git switch -c dark-mode', 'git branch', 'git commit -am ""'],
  },
  {
    id: 'fast-forward', chapter: 'branching', kind: 'puzzle', title: 'Fast-forward',
    concept: `If the branch you merge into has not moved since the other branch split off, git has nothing to combine. It just slides the branch name forward. That is a <b>fast-forward</b>: no new commit, and the history stays a straight line.`,
    goal: 'Bring <code>main</code> up to date with <code>feature</code>. No merge commit is needed.',
    hints: ['You are already on main. Check with <code>git branch</code>.', 'main is an ancestor of feature, so a merge can just move the label.', '<code>git merge feature</code>'],
    debrief: 'Fast-forward merges keep history linear. Some teams force a merge commit anyway with <code>git merge --no-ff</code>, so that every feature shows up as one visible bubble. That is the next level.',
    setup(r) {
      r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>' });
      r.sh('git switch -c feature');
      r.setupCommit('Add search box', { 'search.html': '<input type=search>' });
      r.setupCommit('Style search box', { 'search.css': 'input { width: 100%; }' });
      r.sh('git switch main');
    },
    check: (r) => [
      ['main points where feature points', r.s.branches.main === r.s.branches.feature],
      ['no merge commit was made', !isMerge(r, 'main')],
      ['you are on main', r.branchName() === 'main'],
    ],
    solution: ['git merge feature'],
    target: true,
    chips: ['git merge feature', 'git log --oneline --graph --all'],
  },
  {
    id: 'three-way', chapter: 'branching', kind: 'puzzle', title: 'Two lines of work',
    concept: `When both branches have new commits, git does a <b>three-way merge</b>. It finds the <i>merge base</i> (the last commit they share) and compares each side against it. Changes that only one side made are taken automatically, and the result is saved as a <b>merge commit</b> with two parents.`,
    goal: 'Merge <code>reviews</code> into <code>main</code>. Both have moved on, so expect a merge commit.',
    hints: ['Look at the graph: the branches split at "Initial commit".', 'They touched different files, so there will be no conflict.', '<code>git merge reviews</code>'],
    debrief: 'A merge commit has two parents and records exactly when two lines of work came together. Nothing is rewritten, which makes merging the safe default on shared branches.',
    setup(r) {
      r.setupCommit('Initial commit', { 'index.html': '<h1>Shop</h1>', 'about.html': '<p>Abuot</p>' });
      r.sh('git switch -c reviews');
      r.setupCommit('Add reviews page', { 'reviews.html': '<h2>Reviews</h2>' });
      r.sh('git switch main');
      r.setupCommit('Fix typo on about page', { 'about.html': '<p>About</p>' });
    },
    check: (r) => [
      ['main has a merge commit', isMerge(r, 'main')],
      ['it merged reviews', r.commit(r.s.branches.main)?.parents[1] === r.s.branches.reviews],
      ['both changes are in main', has(fileAt(r, 'main', 'reviews.html'), 'Reviews') && fileAt(r, 'main', 'about.html') === '<p>About</p>\n'],
      ['working tree clean', clean(r)],
    ],
    solution: ['git merge reviews'],
    target: true,
    chips: ['git merge reviews', 'git log --oneline --graph --all'],
  },
  {
    id: 'no-ff', chapter: 'branching', kind: 'puzzle', title: 'Merge with a record',
    concept: `<code>git merge --no-ff</code> always creates a merge commit, even when a fast-forward is possible. The feature's commits stay grouped as a visible side branch. After merging, the branch name is no longer needed: <code>git branch -d</code> deletes the label, but only if its commits are already merged, so nothing is lost.`,
    goal: 'Merge <code>login</code> into main <b>with a merge commit</b>, then delete the <code>login</code> branch.',
    hints: ['A plain merge would fast-forward here. You want <code>--no-ff</code>.', '<code>git merge --no-ff login</code>', 'Then <code>git branch -d login</code>. The commits stay reachable through main.'],
    debrief: '<code>-d</code> refuses to delete unmerged work, and <code>-D</code> forces it. After a --no-ff merge, the second parent of the merge commit still reaches every login commit, so deleting the name is safe.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'start()' });
      r.sh('git switch -c login');
      r.setupCommit('Add login form', { 'login.html': '<form></form>' });
      r.setupCommit('Validate password length', { 'login.js': 'if (pw.length < 12) warn()' });
      r.sh('git switch main');
    },
    check: (r) => [
      ['main ends in a merge commit', isMerge(r, 'main')],
      ['login work is inside main', has(fileAt(r, 'main', 'login.js'), 'pw.length')],
      ['branch login is deleted', !('login' in r.s.branches)],
    ],
    solution: ['git merge --no-ff login', 'git branch -d login'],
    target: true,
    chips: ['git merge --no-ff login', 'git branch -d login'],
  },
  {
    id: 'first-conflict', chapter: 'branching', kind: 'conflict', title: 'First conflict',
    concept: `When both sides changed the <i>same lines</i>, git cannot choose for you. It stops and writes <b>conflict markers</b> into the file: <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code> (your side), <code>=======</code>, and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt; other</code> (their side). You edit the file into its final form, mark it resolved with <code>git add</code>, and finish with <code>git commit</code>.`,
    goal: 'Merge <code>spring</code> into main. The chef wants <b>both</b> starters on the menu, winter (yours) first: <code>Starter: pumpkin soup</code>, then <code>Starter: asparagus salad</code>.',
    hints: ['<code>git merge spring</code>, then open the Conflict surgeon (or <code>cat menu.txt</code>).', 'Choose "Both, ours first", save, and stage the file with <code>git add menu.txt</code>.', 'Finish the merge with <code>git commit --no-edit</code>, which keeps the prepared merge message.'],
    debrief: 'A conflict is not an error. It is git asking you a question. The markers are ordinary text in the file, and the merge is finished only after you <code>add</code> the resolved file and commit. <code>git merge --abort</code> is always there if you want out.',
    setup(r) {
      r.setupCommit('Initial commit', { 'menu.txt': 'Menu\nStarter: soup\nMain: pasta\nDessert: cake' });
      r.sh('git switch -c spring');
      r.setupCommit('Spring starter', { 'menu.txt': 'Menu\nStarter: asparagus salad\nMain: pasta\nDessert: cake' });
      r.sh('git switch main');
      r.setupCommit('Winter starter', { 'menu.txt': 'Menu\nStarter: pumpkin soup\nMain: pasta\nDessert: cake' });
    },
    check: (r) => [
      ['spring is merged (merge commit)', isMerge(r, 'main') && r.commit(r.s.branches.main).parents[1] === r.s.branches.spring],
      ['menu lists pumpkin soup then asparagus salad', fileAt(r, 'main', 'menu.txt') === 'Menu\nStarter: pumpkin soup\nStarter: asparagus salad\nMain: pasta\nDessert: cake\n'],
      ['no conflict markers left', markerFree(r)],
      ['merge finished, tree clean', clean(r)],
    ],
    solution: ['git merge spring', 'edit menu.txt "Menu\\nStarter: pumpkin soup\\nStarter: asparagus salad\\nMain: pasta\\nDessert: cake"', 'git add menu.txt', 'git commit --no-edit'],
    chips: ['git merge spring', 'cat menu.txt', 'git add menu.txt', 'git commit --no-edit'],
  },
  {
    id: 'hunk-by-hunk', chapter: 'branching', kind: 'conflict', title: 'Decide hunk by hunk',
    concept: `A file can have several conflicting regions (<b>hunks</b>), and each one is a separate decision. Sometimes you want your side in one place and theirs in another. During a merge, "ours" means the branch you are on (HEAD) and "theirs" means the branch you are merging in.`,
    goal: 'Merge <code>ops</code>. In <code>config.ini</code>, take <b>their</b> port (<code>8080</code>) but keep <b>our</b> timeout (<code>30</code>). Finish the merge.',
    hints: ['After <code>git merge ops</code>, the Conflict surgeon shows two hunks.', 'Hunk 1 (port): take theirs. Hunk 2 (timeout): keep ours.', 'Save, <code>git add config.ini</code>, <code>git commit --no-edit</code>.'],
    debrief: 'Whole-file shortcuts exist too: <code>git checkout --ours file</code> or <code>--theirs file</code>. Per-hunk decisions are what real conflicts usually need. Read both sides; never take one blindly.',
    setup(r) {
      const cfg = (port, t) => `[server]\nport = ${port}\nhost = localhost\n\n[cache]\ntimeout = ${t}\nsize = 100`;
      r.setupCommit('Initial commit', { 'config.ini': cfg(8000, 10) });
      r.sh('git switch -c ops');
      r.setupCommit('Ops: production port and timeout', { 'config.ini': cfg(8080, 60) });
      r.sh('git switch main');
      r.setupCommit('Dev: local port and timeout', { 'config.ini': cfg(3000, 30) });
    },
    check: (r) => [
      ['ops is merged', isMerge(r, 'main')],
      ['port = 8080 (theirs)', has(fileAt(r, 'main', 'config.ini'), 'port = 8080\n')],
      ['timeout = 30 (ours)', has(fileAt(r, 'main', 'config.ini'), 'timeout = 30\n')],
      ['rest of the file intact, no markers', fileAt(r, 'main', 'config.ini') === '[server]\nport = 8080\nhost = localhost\n\n[cache]\ntimeout = 30\nsize = 100\n' && markerFree(r)],
      ['merge finished', clean(r)],
    ],
    solution: ['git merge ops', 'edit config.ini "[server]\\nport = 8080\\nhost = localhost\\n\\n[cache]\\ntimeout = 30\\nsize = 100"', 'git add config.ini', 'git commit --no-edit'],
    chips: ['git merge ops', 'git diff', 'git add config.ini', 'git commit --no-edit'],
  },

  /* =========================================================== REWRITING */
  {
    id: 'amend', chapter: 'rewriting', kind: 'puzzle', title: 'Fix the last commit',
    concept: `<code>git commit --amend</code> replaces the last commit with a new one, built from the current index, optionally with a new message. It does not edit the old commit. It makes a new one and moves the branch to it, so the old one becomes an orphan (shown faded in the graph). Only amend commits you have not pushed yet.`,
    goal: 'The last commit says "Add lgoin page" and forgot <code>login.css</code>. Fix both: one commit named <code>Add login page</code> with both files.',
    hints: ['First stage the forgotten file: <code>git add login.css</code>.', 'Then amend, giving the corrected message.', '<code>git commit --amend -m "Add login page"</code>'],
    debrief: 'Amend is the everyday "oops" fix. Notice that the commit id changed: commits are immutable, so rewriting means replacing. That is why amending something already pushed causes trouble for teammates.',
    setup(r) {
      r.setupCommit('Initial commit', { 'index.html': '<a href=login.html>Log in</a>' });
      r.setupFiles({ 'login.html': '<form>login</form>', 'login.css': 'form { margin: 0 auto; }' });
      r.sh('git add login.html');
      r.sh('git commit -m "Add lgoin page"');
    },
    check: (r) => [
      ['last commit is called "Add login page"', msgAt(r, 'HEAD') === 'Add login page'],
      ['it contains login.html and login.css', fileAt(r, 'HEAD', 'login.html') !== undefined && fileAt(r, 'HEAD', 'login.css') !== undefined],
      ['still a single commit on top of Initial', msgAt(r, 'HEAD~1') === 'Initial commit'],
      ['tree clean', spotless(r)],
    ],
    solution: ['git add login.css', 'git commit --amend -m "Add login page"'],
    chips: ['git status', 'git add login.css', 'git commit --amend -m ""'],
  },
  {
    id: 'rebase', chapter: 'rewriting', kind: 'puzzle', title: 'Replay on top',
    concept: `<code>git rebase main</code> takes the commits on your branch that main does not have and <b>replays</b> them, one by one, on top of main's latest commit. The result is a straight line, as if you had started your work today. The replayed commits are new commits with new ids. The old ones are left behind, faded in the graph.`,
    goal: 'Rebase <code>feature</code> onto <code>main</code> so history is one straight line. Do not move main.',
    hints: ['You are on feature, which is what gets rewritten.', 'The argument is the branch to build on top of.', '<code>git rebase main</code>'],
    debrief: 'Rebase gives a tidy linear history, but it rewrites commits. Golden rule: rebase your own unpushed work freely, and do not rebase commits others already have. Compare the faded originals with the new copies in the graph.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'app()' });
      r.sh('git switch -c feature');
      r.setupCommit('Add cart', { 'cart.js': 'cart()' });
      r.setupCommit('Add checkout', { 'checkout.js': 'checkout()' });
      r.sh('git switch main');
      r.setupCommit('Update footer', { 'footer.html': '<footer>2025</footer>' });
      r.setupCommit('Add privacy page', { 'privacy.html': '<h1>Privacy</h1>' });
      r.sh('git switch feature');
    },
    check: (r) => [
      ['feature sits on top of main', r.isAncestor(r.s.branches.main, r.s.branches.feature) && span(r, 'main', 'feature').length === 2],
      ['history is linear (no merge commit)', noMerges(r, 'Initial commit', 'feature') && !isMerge(r, 'feature')],
      ['main did not move', msgAt(r, 'main') === 'Add privacy page'],
      ['your commits kept their messages', msgAt(r, 'feature') === 'Add checkout' && msgAt(r, 'feature~1') === 'Add cart'],
    ],
    solution: ['git rebase main'],
    target: true,
    chips: ['git rebase main', 'git log --oneline --graph --all'],
  },
  {
    id: 'rebase-conflict', chapter: 'rewriting', kind: 'conflict', title: 'Conflict mid-rebase',
    concept: `A rebase replays commits one at a time, so a conflict stops it at one particular commit. You are then in a detached HEAD in the middle of the operation. Resolve the file, <code>git add</code> it, and run <code>git rebase --continue</code> (not commit). Watch the labels: during a rebase, "HEAD"/ours is the branch you are rebasing <i>onto</i>, and the commit being replayed is "theirs".`,
    goal: 'Rebase <code>units</code> onto main. Resolve so the line reads exactly <code>Shows a 7-day forecast in °C or °F.</code>, then complete the rebase.',
    hints: ['<code>git rebase main</code> stops on "Mention units".', 'Combine both edits into that one line (the surgeon\'s textarea lets you hand-edit), save, <code>git add README.md</code>.', '<code>git rebase --continue</code>'],
    debrief: 'Mid-rebase you always have three exits: <code>--continue</code> after resolving, <code>--skip</code> to drop the current commit, and <code>--abort</code> to go back to how things were before. Most hard rebase moments are solved by --abort and a calmer second try.',
    setup(r) {
      r.setupCommit('Initial commit', { 'README.md': '# Weather app\nShows the forecast.\nVersion: 1' });
      r.sh('git switch -c units');
      r.setupCommit('Mention units', { 'README.md': '# Weather app\nShows the forecast in °C or °F.\nVersion: 1' });
      r.sh('git switch main');
      r.setupCommit('Describe forecast range', { 'README.md': '# Weather app\nShows a 7-day forecast.\nVersion: 1' });
      r.sh('git switch units');
    },
    check: (r) => [
      ['units is rebased onto main', r.tryResolve('units~1') === r.s.branches.main],
      ['line is "Shows a 7-day forecast in °C or °F."', fileAt(r, 'units', 'README.md') === '# Weather app\nShows a 7-day forecast in °C or °F.\nVersion: 1\n'],
      ['rebase finished, on units', settled(r) && r.branchName() === 'units' && clean(r)],
    ],
    solution: ['git rebase main', 'edit README.md "# Weather app\\nShows a 7-day forecast in °C or °F.\\nVersion: 1"', 'git add README.md', 'git rebase --continue'],
    chips: ['git rebase main', 'git status', 'git add README.md', 'git rebase --continue', 'git rebase --abort'],
  },
  {
    id: 'squash', chapter: 'rewriting', kind: 'puzzle', title: 'Squash the noise',
    concept: `<code>git rebase -i &lt;base&gt;</code> opens a <b>todo list</b> of your commits, oldest first. Each line gets an action. <b>pick</b> keeps the commit, <b>fixup</b> melts it into the commit above and drops its message, <b>squash</b> melts it in and keeps both messages, <b>drop</b> deletes it, and <b>reword</b> keeps it with a new message. You can also reorder the lines. Here the todo list opens in a panel.`,
    goal: 'Before review, fold "fix typo" into "Add search" and drop "wip debug". Leave exactly two commits on top of main: <code>Add search</code>, then <code>Add search tests</code>.',
    hints: ['<code>git rebase -i main</code> lists the 4 commits on your branch.', 'Set "fix typo" to fixup, which merges it into the line above.', 'Set "wip debug" to drop, then start the rebase.'],
    debrief: 'Interactive rebase lets you publish the story you meant to tell, not the one you lived through. Use fixup for "oops" commits. With <code>git commit --fixup=&lt;id&gt;</code> plus <code>git rebase -i --autosquash</code>, real git arranges the todo for you.',
    setup(r) {
      r.setupCommit('Initial commit', { 'items.js': 'export const items = []' });
      r.sh('git switch -c search');
      r.setupCommit('Add search', { 'search.js': 'function search(q) {\n  return items.filter(i => i.name.includs(q));\n}' });
      r.setupCommit('fix typo', { 'search.js': 'function search(q) {\n  return items.filter(i => i.name.includes(q));\n}' });
      r.setupCommit('Add search tests', { 'search.test.js': 'test("finds apples", () => expect(search("app")).toHaveLength(1));' });
      r.setupCommit('wip debug', { 'debug.txt': 'console.log(everything)' });
    },
    check: (r) => [
      ['exactly two commits on top of main', span(r, 'main', 'search').length === 2],
      ['named "Add search" then "Add search tests"', msgAt(r, 'search~1') === 'Add search' && msgAt(r, 'search') === 'Add search tests'],
      ['the typo fix is inside "Add search"', has(fileAt(r, 'search~1', 'search.js'), 'includes(q)')],
      ['debug.txt is gone', fileAt(r, 'search', 'debug.txt') === undefined],
      ['rebase finished, on search', settled(r) && r.branchName() === 'search'],
    ],
    solution: ['git rebase -i main', { todo: [['pick', 0], ['fixup', 1], ['pick', 2], ['drop', 3]] }],
    target: true,
    chips: ['git rebase -i main', 'git log --oneline'],
  },
  {
    id: 'reorder', chapter: 'rewriting', kind: 'puzzle', title: 'Reorder and reword',
    concept: `In the interactive todo, the order of the lines is the order the commits get replayed. Moving a line up makes that commit come earlier in history. <b>reword</b> keeps a commit's changes and only changes its message. Reordering is safe when the commits touch different files. If they overlap, you may get conflicts to resolve.`,
    goal: 'The API commit should come <b>before</b> the UI that uses it, and its message should be <code>Add avatar API</code>. Fix the order and the message.',
    hints: ['<code>git rebase -i main</code>', 'Move "add api for avatars" to the top and set it to reword.', 'Type the new message "Add avatar API" and start the rebase.'],
    debrief: 'A logical order (foundation first, then features that use it) makes review, bisect and revert easier, because every commit builds on the one before.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'app()' });
      r.sh('git switch -c profile');
      r.setupCommit('Show avatar in UI', { 'ui.js': 'render(getAvatar(user))' });
      r.setupCommit('add api for avatars', { 'api.js': 'export function getAvatar(u) { return u.img; }' });
    },
    check: (r) => [
      ['first commit is "Add avatar API"', msgAt(r, 'profile~1') === 'Add avatar API' && fileAt(r, 'profile~1', 'api.js') !== undefined && fileAt(r, 'profile~1', 'ui.js') === undefined],
      ['then "Show avatar in UI"', msgAt(r, 'profile') === 'Show avatar in UI'],
      ['both sit directly on main', r.tryResolve('profile~2') === r.s.branches.main],
      ['rebase finished', settled(r) && r.branchName() === 'profile'],
    ],
    solution: ['git rebase -i main', { todo: [['reword', 1, 'Add avatar API'], ['pick', 0]] }],
    chips: ['git rebase -i main', 'git log --oneline'],
  },
  {
    id: 'cherry-pick', chapter: 'rewriting', kind: 'puzzle', title: 'Cherry-pick a hotfix',
    concept: `<code>git cherry-pick &lt;commit&gt;</code> copies the <i>change</i> one commit introduced and applies it as a new commit on your current branch. It is perfect when another branch has one commit you need, but you do not want the rest of that branch.`,
    goal: '<code>release</code> needs only the crash fix from <code>dev</code>, not the other dev work. Copy that one commit onto release.',
    hints: ['<code>git log --oneline dev</code> to find "Fix crash on empty cart".', 'You are on release. Cherry-pick takes an id or a ref like <code>dev~1</code>.', '<code>git cherry-pick dev~1</code>'],
    debrief: 'Cherry-picked commits are copies with new ids. That is fine for backporting a fix, but if you later merge dev into release, the same change exists twice (git usually handles it). Prefer merging when you need a whole branch.',
    setup(r) {
      r.setupCommit('Release 1.0', { 'cart.js': 'return items.reduce(add)', 'version.txt': '1.0' });
      r.sh('git branch release');
      r.sh('git switch -c dev');
      r.setupCommit('Add dark theme', { 'theme.css': 'body { background: #111; }' });
      r.setupCommit('Fix crash on empty cart', { 'cart.js': 'if (!items.length) return 0;\nreturn items.reduce(add)' });
      r.setupCommit('Experimental AI search', { 'ai.js': 'magic()' });
      r.sh('git switch release');
    },
    check: (r) => [
      ['release has the fix as one new commit', msgAt(r, 'release') === 'Fix crash on empty cart' && msgAt(r, 'release~1') === 'Release 1.0'],
      ['the fix is in cart.js', has(fileAt(r, 'release', 'cart.js'), 'items.length')],
      ['no other dev work on release', fileAt(r, 'release', 'theme.css') === undefined && fileAt(r, 'release', 'ai.js') === undefined],
      ['dev is untouched', msgAt(r, 'dev') === 'Experimental AI search'],
    ],
    solution: ['git cherry-pick dev~1'],
    target: true,
    chips: ['git log --oneline dev', 'git cherry-pick '],
  },

  /* =========================================================== UNDOING */
  {
    id: 'restore', chapter: 'undoing', kind: 'puzzle', title: 'Undo before committing',
    concept: `<code>git restore</code> fixes things that were never committed. <code>git restore --staged file</code> unstages: it copies the HEAD version back into the index and leaves your working file alone. <code>git restore file</code> discards working-tree changes by copying the index version over your file. That second one cannot be undone, so read the diff first.`,
    goal: '<code>notes.txt</code> was staged by mistake: unstage it but keep your edit. The change to <code>app.js</code> is garbage: throw it away.',
    hints: ['<code>git status</code> even tells you the commands.', '<code>git restore --staged notes.txt</code>', '<code>git restore app.js</code>'],
    debrief: 'Older tutorials use <code>git reset HEAD file</code> and <code>git checkout -- file</code> for the same jobs. <code>restore</code> was added in git 2.23 to make the two jobs clearer.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'const total = 0;', 'notes.txt': 'meeting notes' });
      r.setupFiles({ 'app.js': 'const total = 0;;;;;; // the cat walked on the keyboard', 'notes.txt': 'meeting notes\n- ship on friday' });
      r.sh('git add notes.txt');
    },
    check: (r) => [
      ['nothing is staged', r.stagedChanges().length === 0],
      ['your notes edit is kept', has(r.s.work['notes.txt'], 'ship on friday')],
      ['app.js is back to the committed version', r.s.work['app.js'] === fileAt(r, 'HEAD', 'app.js')],
      ['no commits were made', msgAt(r, 'HEAD') === 'Initial commit'],
    ],
    solution: ['git restore --staged notes.txt', 'git restore app.js'],
    chips: ['git status', 'git diff', 'git restore --staged ', 'git restore '],
  },
  {
    id: 'reset-soft', chapter: 'undoing', kind: 'puzzle', title: 'Squash with reset --soft',
    concept: `<code>git reset &lt;commit&gt;</code> moves the current branch to another commit. The flag decides what happens to the three trees. <code>--soft</code> moves only the branch: index and files keep everything. <code>--mixed</code> (the default) also resets the index. <code>--hard</code> resets the index and your files too, and that is the dangerous one.`,
    goal: 'Turn the last two (unpushed) commits into one commit called <code>Add profile page</code> that contains both files.',
    hints: ['Move main back two commits but keep all the changes staged.', '<code>git reset --soft HEAD~2</code>, then look at the index column.', '<code>git commit -m "Add profile page"</code>'],
    debrief: 'reset --soft is a quick squash for the last few commits. Learn the table: soft keeps index and files, mixed keeps files, hard keeps nothing (except what the reflog remembers).',
    setup(r) {
      r.setupCommit('Initial commit', { 'index.html': '<a href=profile.html>Me</a>' });
      r.setupCommit('Add profile page', { 'profile.html': '<h1>Profile</h1>' });
      r.setupCommit('Oops, forgot profile styles', { 'profile.css': 'h1 { color: teal; }' });
    },
    check: (r) => [
      ['one commit "Add profile page" on top of Initial', msgAt(r, 'HEAD') === 'Add profile page' && msgAt(r, 'HEAD~1') === 'Initial commit'],
      ['it has profile.html and profile.css', fileAt(r, 'HEAD', 'profile.html') !== undefined && fileAt(r, 'HEAD', 'profile.css') !== undefined],
      ['tree clean', clean(r)],
    ],
    solution: ['git reset --soft HEAD~2', 'git commit -m "Add profile page"'],
    target: true,
    chips: ['git reset --soft HEAD~2', 'git status', 'git commit -m ""'],
  },
  {
    id: 'revert', chapter: 'undoing', kind: 'puzzle', title: 'Undo in public: revert',
    concept: `Once commits are pushed, rewriting them (reset, amend, rebase) breaks everyone who already pulled them. <code>git revert &lt;commit&gt;</code> adds a <i>new</i> commit that applies the exact opposite change. History only moves forward, so it is safe on shared branches.`,
    goal: 'The price change (already pushed) was a mistake. Undo it <b>without rewriting history</b>, keep the FAQ, and push.',
    hints: ['The bad commit is HEAD~1. Look with <code>git log --oneline</code>.', '<code>git revert HEAD~1</code>', 'Then <code>git push</code>. It is a fast-forward for origin.'],
    debrief: 'Revert is the "undo" for shared history. Even a bad merge can be reverted with <code>git revert -m 1 &lt;merge&gt;</code>. Reverting the revert later brings the change back.',
    setup(r) {
      r.setupCommit('Initial commit', { 'price.txt': 'price: 10' });
      r.setupCommit('Raise price to 99', { 'price.txt': 'price: 99' });
      r.setupCommit('Add FAQ', { 'faq.md': '# FAQ' });
      r.setupRemote();
    },
    check: (r) => [
      ['price is back to 10', fileAt(r, 'main', 'price.txt') === 'price: 10\n'],
      ['FAQ is kept', fileAt(r, 'main', 'faq.md') !== undefined],
      ['history was not rewritten', r.isAncestor(r.tryResolve('origin/main'), r.s.branches.main) && msgAt(r, 'main').startsWith('Revert')],
      ['pushed', r.s.remote.branches.main === r.s.branches.main],
    ],
    solution: ['git revert HEAD~1', 'git push'],
    chips: ['git log --oneline', 'git revert ', 'git push'],
  },
  {
    id: 'reflog', chapter: 'undoing', kind: 'rescue', title: 'Lost a day of work',
    concept: `The <b>reflog</b> is git's diary: every time HEAD moves (commit, reset, checkout, rebase...), it writes down where HEAD was. A commit that no branch points at is not deleted right away; it stays recoverable for weeks. <code>git reflog</code> lists the entries, and <code>HEAD@{1}</code> means "where HEAD was one move ago".`,
    goal: 'Someone ran <code>git reset --hard HEAD~3</code> and three commits "vanished". Bring <code>main</code> back to where it was.',
    hints: ['<code>git reflog</code>: the entry before the reset is the old tip.', 'You can use the id or <code>HEAD@{1}</code>.', '<code>git reset --hard HEAD@{1}</code>'],
    debrief: 'Committed work is very hard to lose in git. The reflog is local to your machine and its entries expire: by default after 90 days, or 30 days for commits that no branch can reach any more. Uncommitted changes wiped by reset --hard are truly gone, so commit early.',
    setup(r) {
      r.setupCommit('Initial commit', { 'game.js': 'let score = 0;' });
      r.setupCommit('Add player movement', { 'player.js': 'move()' });
      r.setupCommit('Add enemies', { 'enemies.js': 'spawn()' });
      r.setupCommit('Add level 2', { 'level2.js': 'load(2)' });
      r.sh('git reset --hard HEAD~3');
    },
    check: (r) => [
      ['main is back at "Add level 2"', msgAt(r, 'main') === 'Add level 2'],
      ['the files are back', r.s.work['level2.js'] !== undefined && r.s.work['enemies.js'] !== undefined],
      ['on main, clean', r.branchName() === 'main' && clean(r)],
    ],
    solution: ['git reset --hard HEAD@{1}'],
    target: true,
    chips: ['git reflog', 'git reset --hard '],
  },
  {
    id: 'wrong-branch', chapter: 'undoing', kind: 'rescue', title: 'Committed to main by mistake',
    concept: `Branch names are just pointers, so "moving commits to another branch" is often just moving names. Make a new branch at the current commit (the work is now safe there), then point main back at where it should be. <code>git branch -f main &lt;commit&gt;</code> moves a branch you are not on. <code>git reset --hard</code> does the same for the branch you are on.`,
    goal: 'The two newest commits belong on a new branch <code>newsletter</code>. Put them there, move <code>main</code> back to <code>origin/main</code>, and end up on newsletter.',
    hints: ['First save the work: create newsletter right here.', '<code>git switch -c newsletter</code> keeps the commits and moves you onto it.', 'Then <code>git branch -f main origin/main</code>.'],
    debrief: 'No cherry-picking needed: you relabelled commits. The same trick works the other way round, e.g. <code>git branch feature && git reset --hard origin/main</code> while you are still on main.',
    setup(r) {
      r.setupCommit('Initial commit', { 'index.html': '<h1>News</h1>' });
      r.setupRemote();
      r.setupCommit('Start newsletter form', { 'newsletter.html': '<form>email</form>' });
      r.setupCommit('Hook form to API', { 'newsletter.js': 'post("/subscribe")' });
    },
    check: (r) => [
      ['newsletter has both commits', msgAt(r, 'newsletter') === 'Hook form to API' && span(r, 'origin/main', 'newsletter').length === 2],
      ['main matches origin/main', r.s.branches.main === r.tryResolve('origin/main')],
      ['you are on newsletter', r.branchName() === 'newsletter'],
    ],
    solution: ['git switch -c newsletter', 'git branch -f main origin/main'],
    target: true,
    chips: ['git switch -c newsletter', 'git branch -f main origin/main', 'git status'],
  },
  {
    id: 'undo-merge', chapter: 'undoing', kind: 'rescue', title: 'Undo a local merge',
    concept: `A merge commit is still just a commit. If it has not been pushed, you can move the branch back to the commit before it. Its first parent (<code>HEAD~1</code>, or <code>HEAD^1</code>) is where main was before the merge, and git also leaves that spot in <code>ORIG_HEAD</code> after a merge.`,
    goal: 'You merged <code>experiment</code> into main by accident (not pushed). Put main back exactly where it was before the merge. Keep the experiment branch.',
    hints: ['The merge commit has two parents. Main was on the first one.', 'Moving the branch plus the files is a hard reset.', '<code>git reset --hard HEAD~1</code> (or <code>ORIG_HEAD</code>)'],
    debrief: 'If that merge had already been pushed, you would use <code>git revert -m 1 &lt;merge&gt;</code> instead, which undoes it with a new commit. <code>-m 1</code> says "keep parent 1 (main) as the mainline".',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'stable()' });
      r.sh('git switch -c experiment');
      r.setupCommit('Rewrite everything in one file', { 'app.js': 'chaos()' });
      r.sh('git switch main');
      r.setupCommit('Add settings', { 'settings.js': 'settings()' });
      r.sh('git merge experiment');
    },
    check: (r) => [
      ['main is back at "Add settings"', msgAt(r, 'main') === 'Add settings'],
      ['experiment branch still exists', msgAt(r, 'experiment') === 'Rewrite everything in one file'],
      ['app.js is stable again', r.s.work['app.js'] === 'stable()\n' && clean(r)],
    ],
    solution: ['git reset --hard HEAD~1'],
    target: true,
    chips: ['git log --oneline --graph', 'git reset --hard '],
  },
  {
    id: 'detached', chapter: 'undoing', kind: 'rescue', title: 'Commits on a detached HEAD',
    concept: `Checking out a commit (not a branch) gives you a <b>detached HEAD</b>: HEAD points straight at a commit. You can commit there, but no branch follows along. Switch away and those commits are orphaned. The fix is to put a branch name on them before you leave.`,
    goal: 'You are on a detached HEAD with two experimental commits. Save them on a branch called <code>satellite</code> and end up on it.',
    hints: ['<code>git status</code> says "HEAD detached".', 'Creating a branch right here captures the commits.', '<code>git switch -c satellite</code>'],
    debrief: 'If you had already switched away, git prints a warning with the orphan ids, and the reflog has them too: <code>git branch satellite &lt;id&gt;</code> would rescue them.',
    setup(r) {
      r.setupCommit('Initial commit', { 'map.js': 'drawMap()' });
      r.setupCommit('Add legend', { 'legend.js': 'legend()' });
      r.sh('git switch --detach HEAD~1');
      r.setupCommit('Try satellite view', { 'satellite.js': 'tiles("sat")' });
      r.setupCommit('Satellite zoom levels', { 'zoom.js': 'zoom(1, 18)' });
    },
    check: (r) => [
      ['satellite holds both experiments', msgAt(r, 'satellite') === 'Satellite zoom levels' && msgAt(r, 'satellite~1') === 'Try satellite view'],
      ['you are on satellite', r.branchName() === 'satellite'],
      ['main is untouched', msgAt(r, 'main') === 'Add legend'],
    ],
    solution: ['git switch -c satellite'],
    target: true,
    chips: ['git status', 'git switch -c satellite'],
  },
  {
    id: 'merge-abort', chapter: 'undoing', kind: 'rescue', title: 'Bail out of a messy merge',
    concept: `A merge with conflicts leaves you in a half-finished state: markers in files, and a MERGE_HEAD remembering what you were merging. If you are not ready to resolve, <code>git merge --abort</code> puts everything back as it was before the merge started.`,
    goal: 'The merge of <code>big-refactor</code> conflicted in three files and you are not ready. Abort it and get back to a clean main.',
    hints: ['<code>git status</code> shows "You have unmerged paths".', 'It even prints the command to abort.', '<code>git merge --abort</code>'],
    debrief: 'Aborting is always allowed and loses nothing that was committed. Rebase and cherry-pick have the same escape hatch: <code>git rebase --abort</code>, <code>git cherry-pick --abort</code>.',
    setup(r) {
      r.setupCommit('Initial commit', { 'a.js': 'a()', 'b.js': 'b()', 'c.js': 'c()' });
      r.sh('git switch -c big-refactor');
      r.setupCommit('Rename everything', { 'a.js': 'alpha()', 'b.js': 'beta()', 'c.js': 'gamma()' });
      r.sh('git switch main');
      r.setupCommit('Add logging', { 'a.js': 'a(); log()', 'b.js': 'b(); log()', 'c.js': 'c(); log()' });
      r.run('git merge big-refactor');
    },
    check: (r) => [
      ['no merge in progress', !r.s.mergeHead && !Object.keys(r.s.conflicts).length],
      ['main still at "Add logging", no markers', msgAt(r, 'main') === 'Add logging' && markerFree(r)],
      ['tree clean', clean(r)],
    ],
    solution: ['git merge --abort'],
    chips: ['git status', 'git merge --abort'],
  },

  /* =========================================================== WORKFLOW */
  {
    id: 'stash', chapter: 'workflow', kind: 'puzzle', title: 'Pause, fix, resume',
    concept: `<code>git stash</code> saves your uncommitted changes (to tracked files) on a stack and gives you a clean working tree. You can switch branches, do something urgent, come back, and <code>git stash pop</code> to get your changes back. Pop applies the stash and removes it from the stack.`,
    goal: 'Urgent: on <code>main</code>, bump <code>version.txt</code> to <code>1.0.1</code> and commit. Your half-written chat.js is not ready: park it, do the fix, return to <code>chat</code>, and restore it.',
    hints: ['Try <code>git switch main</code> first: git refuses, because your edit would be overwritten.', '<code>git stash</code>, switch, then <code>edit version.txt "1.0.1"</code> and <code>git commit -am "Bump version to 1.0.1"</code>.', '<code>git switch chat</code>, then <code>git stash pop</code>.'],
    debrief: 'Stash is for short interruptions. For anything longer, a WIP commit on your branch is safer and easier to find. <code>git stash -u</code> also includes untracked files.',
    setup(r) {
      r.setupCommit('Initial commit', { 'version.txt': '1.0.0', 'chat.js': '// chat' });
      r.sh('git switch -c chat');
      r.setupCommit('Start chat widget', { 'chat.js': '// chat widget v1' });
      r.setupFiles({ 'chat.js': '// chat widget v1\n// half-written emoji picker' });
    },
    check: (r) => [
      ['main has version 1.0.1', fileAt(r, 'main', 'version.txt') === '1.0.1\n' && msgAt(r, 'main~1') === 'Initial commit'],
      ['the WIP is not committed anywhere', !has(fileAt(r, 'main', 'chat.js'), 'emoji') && msgAt(r, 'chat') === 'Start chat widget'],
      ['back on chat with your WIP restored', r.branchName() === 'chat' && has(r.s.work['chat.js'], 'emoji picker')],
      ['stash is empty', r.s.stash.length === 0],
    ],
    solution: ['git stash', 'git switch main', 'edit version.txt "1.0.1"', 'git commit -am "Bump version to 1.0.1"', 'git switch chat', 'git stash pop'],
    chips: ['git stash', 'git switch main', 'git stash pop', 'git stash list'],
  },
  {
    id: 'stash-pick', chapter: 'workflow', kind: 'puzzle', title: 'The right stash',
    concept: `The stash is a stack. <code>stash@{0}</code> is the newest entry and higher numbers are older. <code>git stash list</code> shows them, and <code>git stash push -m "msg"</code> gives an entry a name you will recognise later. <code>pop</code>, <code>apply</code> and <code>drop</code> all accept a specific entry.`,
    goal: 'Bring back the <b>navy theme</b> experiment (not the blog link) and remove it from the stash list. The blog-link stash must stay.',
    hints: ['<code>git stash list</code>: the navy theme is not on top.', 'pop takes an argument such as <code>stash@{1}</code>.', '<code>git stash pop stash@{1}</code>'],
    debrief: 'Unnamed stashes ("WIP on main: ...") pile up fast. Name them, and clean up with <code>git stash drop</code>. <code>git stash show -p stash@{1}</code> previews an entry before you apply it.',
    setup(r) {
      r.setupCommit('Initial commit', { 'theme.css': 'body { background: white; }', 'nav.html': '<nav>Home</nav>' });
      r.setupFiles({ 'theme.css': 'body { background: navy; }' });
      r.sh('git stash push -m "navy theme"');
      r.setupFiles({ 'nav.html': '<nav>Home | Blog</nav>' });
      r.sh('git stash push -m "blog link"');
    },
    check: (r) => [
      ['navy theme is back in theme.css', has(r.s.work['theme.css'], 'navy')],
      ['blog link not applied', r.s.work['nav.html'] === '<nav>Home</nav>\n'],
      ['only the blog-link stash remains', r.s.stash.length === 1 && r.s.stash[0].msg.includes('blog link')],
    ],
    solution: ['git stash pop stash@{1}'],
    chips: ['git stash list', 'git stash show -p stash@{1}', 'git stash pop '],
  },
  {
    id: 'tag', chapter: 'workflow', kind: 'puzzle', title: 'Tag a release',
    concept: `A <b>tag</b> is a name for one commit that never moves, which makes it ideal for releases. A lightweight tag is just the name. An <b>annotated</b> tag (<code>git tag -a v1.0 -m "..."</code>) also stores a message and who made it, and it is what release tooling expects. Tags are not pushed by default: use <code>git push origin v1.0</code> or <code>--tags</code>.`,
    goal: 'Put an <b>annotated</b> tag <code>v2.0</code> on the commit "Release 2.0: new checkout" (not on the newest commit).',
    hints: ['<code>git log --oneline</code>: the release commit is HEAD~1.', 'Annotated means <code>-a</code> plus a message.', '<code>git tag -a v2.0 -m "Version 2.0" HEAD~1</code>'],
    debrief: 'Branches move as you commit, but tags stay put. Later, <code>git switch --detach v2.0</code> or <code>git diff v2.0 main</code> let you inspect or compare that exact release.',
    setup(r) {
      r.setupCommit('Initial commit', { 'shop.js': 'shop()' });
      r.setupCommit('Add checkout', { 'checkout.js': 'v1' });
      r.setupCommit('Release 2.0: new checkout', { 'checkout.js': 'v2', 'version.txt': '2.0' });
      r.setupCommit('Start 2.1 work', { 'wishlist.js': 'todo' });
    },
    check: (r) => [
      ['tag v2.0 exists', 'v2.0' in r.s.tags],
      ['it marks the Release 2.0 commit', 'v2.0' in r.s.tags && firstLine(r.commit(r.s.tags['v2.0'].id).msg).startsWith('Release 2.0')],
      ['it is annotated', !!r.s.tags['v2.0']?.msg],
    ],
    solution: ['git tag -a v2.0 -m "Version 2.0" HEAD~1'],
    chips: ['git log --oneline', 'git tag', 'git show v2.0'],
  },

  /* =========================================================== REMOTES */
  {
    id: 'pull', chapter: 'remotes', kind: 'puzzle', title: 'Catch up with the team',
    concept: `Your repo has a copy of the remote's branches, called <b>remote-tracking branches</b> such as <code>origin/main</code>. They only update when you talk to the remote. <code>git fetch</code> downloads new commits and moves origin/*, and never touches your own branches. <code>git pull</code> is a fetch followed by integrating (merging, or with <code>--rebase</code>, rebasing) the upstream into your branch.`,
    goal: 'Teammates pushed two commits to <code>origin/main</code>. Get them into your local <code>main</code>.',
    hints: ['Try <code>git fetch</code> first, and watch origin/main jump ahead in the graph.', 'Your main is behind, so integrating is a fast-forward.', '<code>git pull</code> (or <code>git merge origin/main</code> after the fetch)'],
    debrief: 'Fetch first, look, then integrate. That habit avoids surprises. <code>git log main..origin/main</code> shows exactly what is incoming.',
    setup(r) {
      r.setupCommit('Initial commit', { 'index.html': '<h1>Agency</h1>' });
      r.setupCommit('Add homepage', { 'home.html': '<p>Welcome</p>' });
      r.setupRemote();
      r.teammatePush('main', 'Add contact page', { 'contact.html': '<form>contact</form>' });
      r.teammatePush('main', 'Fix contact form email', { 'contact.html': '<form action=mailto:hi@example.com>contact</form>' });
    },
    check: (r) => [
      ['origin/main is up to date', r.s.tracking.main === r.s.remote.branches.main],
      ['main has the team\'s commits', r.s.branches.main === r.s.remote.branches.main],
      ['on main, clean', r.branchName() === 'main' && clean(r)],
    ],
    solution: ['git pull'],
    par: 2, // leaves room for a git fetch first
    target: true,
    chips: ['git fetch', 'git status', 'git pull', 'git log --oneline main..origin/main'],
  },
  {
    id: 'push-branch', chapter: 'remotes', kind: 'puzzle', title: 'Share a branch',
    concept: `<code>git push origin name</code> uploads a branch. Add <code>-u</code> (<code>--set-upstream</code>) the first time and git remembers that your branch tracks <code>origin/name</code>. After that, plain <code>git push</code> and <code>git pull</code> know where to go, and <code>git status</code> can tell you if you are ahead or behind.`,
    goal: 'Your dark-mode toggle edit is uncommitted. Create <code>dark-toggle</code>, commit it there, and push it so it tracks <code>origin/dark-toggle</code>.',
    hints: ['Uncommitted changes travel with you when you switch: <code>git switch -c dark-toggle</code>.', '<code>git commit -am "Add dark mode toggle"</code>', '<code>git push -u origin dark-toggle</code>'],
    debrief: 'Try a plain <code>git push</code> on a new branch sometime: git refuses, and tells you the -u command to use. Setting <code>push.autoSetupRemote</code> makes that automatic.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'render()' });
      r.setupRemote();
      r.setupFiles({ 'app.js': 'render()\naddToggle("dark")' });
    },
    check: (r) => [
      ['dark-toggle has your commit', has(fileAt(r, 'dark-toggle', 'app.js'), 'dark') && span(r, 'main', 'dark-toggle').length === 1],
      ['main did not move', !has(fileAt(r, 'main', 'app.js'), 'dark')],
      ['origin has dark-toggle', r.s.remote.branches['dark-toggle'] === r.s.branches['dark-toggle']],
      ['it tracks origin/dark-toggle', r.s.upstream['dark-toggle'] === 'dark-toggle'],
    ],
    solution: ['git switch -c dark-toggle', 'git commit -am "Add dark mode toggle"', 'git push -u origin dark-toggle'],
    target: true,
    chips: ['git switch -c dark-toggle', 'git push -u origin dark-toggle', 'git branch -vv'],
  },
  {
    id: 'diverged', chapter: 'remotes', kind: 'puzzle', title: 'Diverged',
    concept: `If someone pushed while you were committing, your branch and origin have <b>diverged</b>, and a push is rejected because it would throw their commit away. You must integrate first. <code>git pull --rebase</code> fetches and replays your local commits on top of theirs, which keeps history linear. Plain <code>git pull</code> asks you to choose merge or rebase.`,
    goal: 'Push is rejected: a teammate pushed first. Put your commit on top of theirs (no merge commit), then push.',
    hints: ['Try <code>git push</code> and read the hint.', '<code>git pull --rebase</code> replays your commit after theirs.', 'Then <code>git push</code>.'],
    debrief: 'Many teams set <code>git config pull.rebase true</code> so pulls rebase by default. If the rebase conflicts, you resolve it as usual and run <code>git rebase --continue</code>.',
    setup(r) {
      r.setupCommit('Initial commit', { 'index.html': '<h1>Hi</h1>' });
      r.setupRemote();
      r.teammatePush('main', 'Translate homepage to Spanish', { 'es.html': '<h1>Hola</h1>' });
      r.setupCommit('Add pricing table', { 'pricing.html': '<table></table>' });
    },
    check: (r) => [
      ['your commit sits on top of theirs', msgAt(r, 'main') === 'Add pricing table' && msgAt(r, 'main~1') === 'Translate homepage to Spanish'],
      ['no merge commit', noMerges(r, null, 'main')],
      ['pushed', r.s.remote.branches.main === r.s.branches.main],
    ],
    solution: ['git pull --rebase', 'git push'],
    par: 3, // leaves room for a git fetch first
    target: true,
    chips: ['git push', 'git fetch', 'git pull --rebase', 'git status'],
  },
  {
    id: 'force-with-lease', chapter: 'remotes', kind: 'puzzle', title: 'Force-push safely',
    concept: `After rebasing a branch that is already pushed, your local branch and origin disagree, and a normal push is rejected. <code>--force</code> overwrites the remote no matter what, and can silently delete a teammate's commits. <code>--force-with-lease</code> overwrites only if the remote is still where your <code>origin/</code> branch says it was, so you never clobber work you have not seen.`,
    goal: 'Rebase your pushed <code>search</code> branch onto main, then update <code>origin/search</code> the safe way.',
    hints: ['<code>git rebase main</code> (you are on search).', 'A plain <code>git push</code> is rejected: non-fast-forward.', '<code>git push --force-with-lease</code>'],
    debrief: 'Force-push only your own branches, and always with a lease. Never force-push a shared branch like main. If the lease fails, someone pushed: fetch, look, integrate, and try again.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'app()' });
      r.setupRemote();
      r.sh('git switch -c search');
      r.setupCommit('Add search', { 'search.js': 'search()' });
      r.sh('git push -u origin search');
      r.sh('git switch main');
      r.setupCommit('Update dependencies', { 'deps.txt': 'lib 2.0' });
      r.sh('git push');
      r.sh('git switch search');
    },
    check: (r) => [
      ['search is rebased onto main', r.tryResolve('search~1') === r.s.branches.main],
      ['origin/search matches', r.s.remote.branches.search === r.s.branches.search],
      ['used --force-with-lease, not --force', r.history.some((h) => h.includes('--force-with-lease')) && !r.history.some((h) => /push.*(\s--force(\s|$)|\s-f(\s|$))/.test(h))],
    ],
    solution: ['git rebase main', 'git push --force-with-lease'],
    par: 3, // leaves room for a git fetch first
    target: true,
    chips: ['git rebase main', 'git push', 'git push --force-with-lease'],
  },
  {
    id: 'secret', chapter: 'remotes', kind: 'rescue', title: 'A secret in the history',
    concept: `Deleting a file in a new commit does not remove it from history: the old commit still has it. If the secret is only in <i>unpushed</i> commits, you can rewrite those commits before anything leaves your machine. <code>git reset --soft origin/main</code> folds your unpushed commits back into the index, so you can rebuild them without the file.`,
    goal: '<code>config.env</code> holds a live API key and sits in your unpushed commits. Rewrite them so <b>no commit contains it</b>, keep the payment form, and push. Keep config.env on disk.',
    hints: ['Fold your two commits back into the index: <code>git reset --soft origin/main</code>.', 'Unstage the secret: <code>git restore --staged config.env</code> (the file stays on disk).', 'Commit, then push. A .gitignore entry for it is a bonus.'],
    debrief: 'If a secret ever reaches a remote, treat it as leaked: <b>rotate the key first</b>, then clean history (e.g. with git filter-repo) and ask everyone to re-clone. Ignore files like .env from day one.',
    setup(r) {
      r.setupCommit('Initial commit', { 'app.js': 'connect()' });
      r.setupRemote();
      r.setupCommit('Add payment config', { 'config.env': 'STRIPE_KEY=sk_live_51HxEXAMPLE' });
      r.setupCommit('Add payment form', { 'pay.html': '<form>pay</form>', 'app.js': 'connect()\npay()' });
    },
    check: (r) => {
      const all = r.ancestorsOf([...Object.values(r.s.branches), ...Object.values(r.s.tracking), r.s.remote.branches.main]);
      const leak = [...all].some((id) => Object.values(r.commit(id).tree).some((t) => t.includes('sk_live')));
      return [
        ['no reachable commit contains the key', !leak],
        ['payment form is committed', fileAt(r, 'main', 'pay.html') !== undefined && has(fileAt(r, 'main', 'app.js'), 'pay()')],
        ['pushed', r.s.remote.branches.main === r.s.branches.main && r.s.tracking.main === r.s.branches.main],
        ['config.env still on disk, untracked', has(r.s.work['config.env'], 'sk_live') && !r.tracked('config.env')],
      ];
    },
    solution: ['git reset --soft origin/main', 'git restore --staged config.env', 'git commit -m "Add payment form"', 'git push'],
    chips: ['git log --stat', 'git reset --soft origin/main', 'git restore --staged config.env', 'git push'],
  },

  /* =========================================================== DETECTIVE */
  {
    id: 'find-change', chapter: 'detective', kind: 'puzzle', title: 'Who changed the price?',
    concept: `History is searchable. <code>git log -- file</code> lists only commits that touched a file. <code>git log -S "text"</code> (the "pickaxe") finds commits that added or removed some text. <code>git show &lt;id&gt;</code> prints one commit with its diff, and <code>git blame file</code> labels every line with the commit that last changed it.`,
    goal: 'Coffee went from <code>3.00</code> to <code>3.50</code>, and the commit message does not say so. Find that commit and tag it <code>price-change</code>.',
    hints: ['<code>git log --oneline -- prices.txt</code> narrows it down.', 'Or search the text: <code>git log --oneline -S "3.50"</code>.', 'Then <code>git tag price-change &lt;id&gt;</code>.'],
    debrief: 'log -S, log -- path, blame and show answer most "when did this change, and why?" questions in seconds. Good commit messages make the answer even quicker.',
    setup(r) {
      r.setupCommit('Initial commit', { 'prices.txt': 'coffee 3.00\ntea 2.50', 'README.md': '# Cafe' });
      r.setupCommit('Update README', { 'README.md': '# Cafe\nOpen 8-18' }, 'designer');
      r.setupCommit('Tweak styles', { 'style.css': 'body { font: 16px serif; }' }, 'designer');
      r.setupCommit('Small cleanups', { 'prices.txt': 'coffee 3.50\ntea 2.50', 'README.md': '# Cafe\nOpen 8-18\n' }, 'intern');
      r.setupCommit('Fix header', { 'header.html': '<h1>Cafe</h1>' }, 'lead');
      r.setupCommit('Add cocoa', { 'prices.txt': 'coffee 3.50\ntea 2.50\ncocoa 3.20' }, 'lead');
      r.setupCommit('Refactor cart', { 'cart.js': 'cart()' }, 'lead');
    },
    check: (r) => {
      const t = r.s.tags['price-change'];
      const c = t && r.commit(t.id);
      const ok = !!c && has(c.tree['prices.txt'], 'coffee 3.50') && has(r.tree(c.parents[0])['prices.txt'], 'coffee 3.00');
      return [['tag price-change exists', !!t], ['it marks the commit that changed coffee to 3.50', ok]];
    },
    solution: ['git tag price-change HEAD~3'],
    chips: ['git log --oneline -- prices.txt', 'git log --oneline -S "3.50"', 'git blame prices.txt', 'git show '],
  },
  {
    id: 'bisect', chapter: 'detective', kind: 'bisect', title: 'Bisect hunt',
    concept: `<code>git bisect</code> binary-searches history for the commit that introduced a bug. Mark a bad commit and a good one, and git checks out the middle. You test it and say <code>git bisect good</code> or <code>git bisect bad</code>, and each answer halves the suspects. Sixteen commits take about four tests. <code>git bisect run &lt;script&gt;</code> automates it, and <code>git bisect reset</code> takes you back.`,
    goal: 'Tests fail on main (<code>./run-tests</code>) but passed at tag <code>v1.0</code>. Find the first bad commit, tag it <code>culprit</code>, then <code>git bisect reset</code>.',
    hints: ['<code>git bisect start</code>, <code>git bisect bad</code>, <code>git bisect good v1.0</code>.', 'At each step run <code>./run-tests</code> and answer good or bad, or let <code>git bisect run ./run-tests</code> do it.', 'When git names the first bad commit: <code>git tag culprit &lt;id&gt;</code> (or <code>refs/bisect/bad</code>), then <code>git bisect reset</code>.'],
    debrief: 'Bisect turns "it broke sometime last month" into a handful of tests. It works best when every commit builds and passes on its own, which is one more reason to keep commits small and focused.',
    setup(r) { bisectHistory(r, 16, 11); },
    check: (r) => bisectCheck(r),
    solution: ['git bisect start', 'git bisect bad', 'git bisect good v1.0', 'git bisect run ./run-tests', 'git tag culprit refs/bisect/bad', 'git bisect reset'],
    par: 9,
    chips: ['git bisect start', './run-tests', 'git bisect good', 'git bisect bad', 'git bisect reset'],
  },
  {
    id: 'old-version', chapter: 'detective', kind: 'puzzle', title: 'Bring back an old version',
    concept: `You can pull a single file out of any commit without moving branches. <code>git show &lt;commit&gt;:path</code> prints it, and <code>git restore --source=&lt;commit&gt; path</code> (or <code>git checkout &lt;commit&gt; -- path</code>) writes it into your working tree. Commit that, and history moves forward with the old content: nothing is rewritten.`,
    goal: 'Restore <code>config.json</code> exactly as it was in the commit "Tune cache for launch", and commit it. Do not rewrite history.',
    hints: ['<code>git log --oneline -- config.json</code> to find the commit.', '<code>git show HEAD~3:config.json</code> to preview it.', '<code>git restore --source=HEAD~3 config.json</code>, then <code>git commit -am "..."</code>.'],
    debrief: 'This is the safe, surgical undo: one file, any point in time, recorded as a new commit that teammates can pull normally.',
    setup(r) {
      r.setupCommit('Initial commit', { 'config.json': '{ "cache": 0 }' });
      r.setupCommit('Tune cache for launch', { 'config.json': '{ "cache": 300, "gzip": true }' });
      r.setupCommit('Experiment: no cache', { 'config.json': '{ "cache": 0, "gzip": true }' });
      r.setupCommit('Add analytics', { 'analytics.js': 'track()' });
      r.setupCommit('Experiment: huge cache', { 'config.json': '{ "cache": 99999, "gzip": false }' });
    },
    check: (r) => [
      ['config.json matches "Tune cache for launch"', fileAt(r, 'HEAD', 'config.json') === '{ "cache": 300, "gzip": true }\n'],
      ['history moved forward (nothing rewritten)', msgAt(r, 'HEAD~1') === 'Experiment: huge cache'],
      ['analytics.js still there, tree clean', fileAt(r, 'HEAD', 'analytics.js') !== undefined && clean(r)],
    ],
    solution: ['git restore --source=HEAD~3 config.json', 'git commit -am "Restore launch cache settings"'],
    chips: ['git log --oneline -- config.json', 'git show HEAD~3:config.json', 'git restore --source='],
  },
  /* =========================================================== GITHUB */
  {
    id: 'sync-fork', chapter: 'github', kind: 'puzzle', title: 'Sync a fork',
    concept: `You contribute to an open-source cookbook through a <b>fork</b>. Your clone has two remotes: <code>origin</code> (your fork, you can push) and <code>upstream</code> (the original project, read-only for you). Maintainers merge into <code>upstream/main</code>, and your fork does not follow by itself. Syncing means: fetch upstream, bring its main into yours, push to origin. Feature branches then go on top of the fresh main.`,
    goal: 'Bring <code>main</code> up to date with <code>upstream/main</code> (locally and on your fork), then put your pushed <code>photos</code> branch on top of it (no merge commit) and update <code>origin/photos</code> safely.',
    hints: ['<code>git fetch upstream</code>, then on main: <code>git merge upstream/main</code> (a fast-forward) and <code>git push</code>.', 'Switch to photos and <code>git rebase main</code>.', 'The rebase rewrote a pushed commit: <code>git push --force-with-lease</code>.'],
    debrief: 'This is the weekly routine of every open-source contributor. Because you never commit on main in a fork, syncing is always a fast-forward. GitHub\'s "Sync fork" button does the first half on the server; you would still pull afterwards.',
    setup(r) {
      r.setupCommit('Initial commit', { 'README.md': '# Open Cookbook', 'recipes/soup.md': '# Soup\nwater\nsalt' });
      r.setupFork({ upstreamUrl: 'https://github.com/open-cookbook/cookbook.git', forkUrl: 'https://github.com/you/cookbook.git' });
      r.sh('git switch -c photos');
      r.setupCommit('Add soup photo', { 'photos/soup.md': '![soup](soup.jpg)' });
      r.sh('git push -u origin photos');
      r.sh('git switch main');
      r.teammatePush('main', 'Add bread recipe', { 'recipes/bread.md': '# Bread\nflour\nyeast' }, 'maintainer', 'upstream');
      r.teammatePush('main', 'Fix soup salt', { 'recipes/soup.md': '# Soup\nwater\na pinch of salt' }, 'maintainer', 'upstream');
    },
    check: (r) => [
      ['main matches upstream/main', r.s.branches.main === r.s.remotes.upstream.branches.main],
      ['your fork\'s main is updated', r.s.remote.branches.main === r.s.branches.main],
      ['photos sits on the new main, no merge', r.tryResolve('photos~1') === r.s.branches.main && msgAt(r, 'photos') === 'Add soup photo'],
      ['origin/photos updated with a lease', r.s.remote.branches.photos === r.s.branches.photos && r.history.some((h) => h.includes('--force-with-lease')) && !r.history.some((h) => /push.*(\s--force(\s|$)|\s-f(\s|$))/.test(h))],
    ],
    solution: ['git fetch upstream', 'git merge upstream/main', 'git push', 'git switch photos', 'git rebase main', 'git push --force-with-lease'],
    par: 7,
    target: true,
    chips: ['git remote -v', 'git fetch upstream', 'git merge upstream/main', 'git log --oneline --graph --all'],
  },
  {
    id: 'rescue-pr', chapter: 'github', kind: 'conflict', title: 'Rescue a PR branch',
    concept: `GitHub says your pull request "has conflicts that must be resolved": another PR changed the same line of <code>menu.html</code> and was merged first. Fix it on your side: fetch, rebase your branch onto the new <code>origin/main</code>, resolve the conflict when the rebase stops, continue, then replace the PR branch with <code>--force-with-lease</code>. During a rebase, <code>HEAD</code> in the markers is main's version, and the other side is your commit.`,
    goal: 'Rebase <code>prices</code> onto the latest main. The menu must keep <b>both</b> lines, the teammate\'s <code>tea 2</code> then your <code>cake 4</code>. Update the PR without a merge commit.',
    hints: ['<code>git fetch</code>, then <code>git rebase origin/main</code>. It stops on menu.html.', 'Make menu.html read <code>Menu</code>, <code>bread 3</code>, <code>tea 2</code>, <code>cake 4</code> (one per line), then <code>git add menu.html</code> and <code>git rebase --continue</code>.', '<code>git push --force-with-lease</code>'],
    debrief: 'The PR is mergeable again and history stays linear. If teammates also pushed to your PR branch, merging main in (<code>git merge origin/main</code>) avoids the force-push; the conflict is resolved the same way.',
    setup(r) {
      r.setupCommit('Initial commit', { 'menu.html': 'Menu\nbread 3', 'index.html': '<h1>Corner Cafe</h1>' });
      r.setupRemote();
      r.sh('git switch -c prices');
      r.setupCommit('Add cake price', { 'menu.html': 'Menu\nbread 3\ncake 4' });
      r.sh('git push -u origin prices');
      r.teammatePush('main', 'Add tea price', { 'menu.html': 'Menu\nbread 3\ntea 2' });
    },
    check: (r) => [
      ['prices is on top of the new origin/main', r.s.remote.branches.main === r.tryResolve('prices~1') && msgAt(r, 'prices') === 'Add cake price'],
      ['menu has tea then cake', fileAt(r, 'prices', 'menu.html') === 'Menu\nbread 3\ntea 2\ncake 4\n'],
      ['no conflict markers, rebase finished', markerFree(r) && clean(r)],
      ['PR branch updated with a lease', r.s.remote.branches.prices === r.s.branches.prices && r.history.some((h) => h.includes('--force-with-lease')) && !r.history.some((h) => /push.*(\s--force(\s|$)|\s-f(\s|$))/.test(h))],
    ],
    solution: ['git fetch', 'git rebase origin/main', 'edit menu.html "Menu\\nbread 3\\ntea 2\\ncake 4"', 'git add menu.html', 'git rebase --continue', 'git push --force-with-lease'],
    chips: ['git fetch', 'git rebase origin/main', 'cat menu.html', 'git rebase --continue'],
  },
  {
    id: 'after-squash', chapter: 'github', kind: 'rescue', title: 'After the squash',
    concept: `Your <code>search</code> PR was <b>squash-merged</b>: main got one new commit with all its changes, and GitHub deleted the branch. Your commits are not ancestors of that squash commit, so git thinks <code>search</code> is unmerged. Worse, you had already started <code>filters</code> on top of search. Rebasing filters onto main would replay search's old commits again. <code>git rebase --onto main search filters</code> moves only the commits after search.`,
    goal: 'Update <code>main</code>, move <code>filters</code> so it is just its own commit on top of main, delete local <code>search</code>, and drop the stale <code>origin/search</code>.',
    hints: ['<code>git switch main</code> and <code>git pull --prune</code>.', '<code>git rebase --onto main search filters</code> replays only "Add price filter".', '<code>git branch -D search</code> (lower-case -d refuses after a squash).'],
    debrief: 'Stacked branches and squash merges need <code>--onto</code>. In newer git, <code>git rebase --update-refs</code> helps keep stacks in sync, and GitHub\'s merge-commit button avoids the problem entirely, at the cost of a busier history.',
    setup(r) {
      r.setupCommit('Initial commit', { 'shop.html': '<h1>Shop</h1>' });
      r.setupRemote();
      r.sh('git switch -c search');
      r.setupCommit('Add search box', { 'search.js': 'search()' });
      r.setupCommit('Debounce search', { 'search.js': 'debounce(search)' });
      r.sh('git push -u origin search');
      r.sh('git switch -c filters');
      r.setupCommit('Add price filter', { 'filters.js': 'filterByPrice()' });
      r.mergePullRequest('search', { how: 'squash', number: 8, title: 'Search box', deleteBranch: true });
    },
    check: (r) => [
      ['main has the squash commit', r.s.branches.main === r.s.remote.branches.main],
      ['filters is one commit on top of main', r.tryResolve('filters~1') === r.s.branches.main && msgAt(r, 'filters') === 'Add price filter'],
      ['local search deleted', !('search' in r.s.branches)],
      ['origin/search pruned', !('search' in r.s.tracking)],
    ],
    solution: ['git switch main', 'git pull --prune', 'git rebase --onto main search filters', 'git branch -D search'],
    target: true,
    chips: ['git log --oneline --graph --all', 'git pull --prune', 'git branch -vv'],
  },

  /* =========================================================== INTERNALS */
  {
    id: 'same-snapshot', chapter: 'internals', kind: 'puzzle', title: 'Same snapshot, different commit',
    concept: `A commit id hashes the tree, the parents, the author, the time and the message, so two commits can differ while their <b>snapshots</b> are identical. The tree id is the fingerprint of the snapshot alone: same files, same tree id. <code>git rev-parse X^{tree}</code> prints it for any commit or branch, and inspecting costs no moves.`,
    goal: 'Exactly one of <code>try-a</code>, <code>try-b</code> and <code>try-c</code> has the very same files as the <code>release</code> tag. Tag that branch\'s tip <code>match</code>.',
    hints: ['Commit messages lie. Compare tree ids instead.', '<code>git rev-parse release^{tree} try-a^{tree} try-b^{tree} try-c^{tree}</code>', 'Then <code>git tag match &lt;branch&gt;</code> for the one whose tree id equals release\'s.'],
    debrief: 'Tree ids are how git knows two snapshots are identical without comparing files one by one. It is also why "revert the revert" or an undone experiment gives back an old tree id, while every commit id stays unique.',
    setup(r) {
      r.setupCommit('Initial commit', { 'menu.txt': 'bread 3\ncake 4', 'index.html': '<h1>Crumb</h1>' });
      r.setupCommit('Add tea', { 'menu.txt': 'bread 3\ncake 4\ntea 2' });
      r.sh('git tag release');
      r.sh('git switch -c try-a');
      r.setupCommit('Tidy whitespace', { 'menu.txt': 'bread 3\ncake 4\ntea 2\n' });
      r.sh('git switch main');
      r.sh('git switch -c try-b');
      r.setupCommit('Experiment: banner', { 'banner.html': '<div>Sale</div>' });
      r.setupCommit('Remove banner again', { 'banner.html': null });
      r.sh('git switch main');
      r.sh('git switch -c try-c');
      r.setupCommit('No-op cleanup', { 'menu.txt': 'bread 3\ncake 4\ntea 2.00' });
      r.sh('git switch main');
    },
    check: (r) => [
      ['tag match exists', !!r.s.tags.match],
      ['it marks the branch with release\'s snapshot', r.s.tags.match?.id === r.s.branches['try-b']],
    ],
    solution: ['git rev-parse release^{tree} try-a^{tree} try-b^{tree} try-c^{tree}', 'git tag match try-b'],
    par: 1,
    chips: ['git log --oneline --all', 'git rev-parse release^{tree}', 'git cat-file -p try-a'],
  },

  /* =========================================================== STORY */
  {
    id: 'bakery-launch', chapter: 'story', kind: 'puzzle', title: 'Launch the bakery site',
    concept: `Everything at once. Your <code>order-form</code> branch is pushed, and your teammate pushed the menu page to main meanwhile. Launch day means: bring the branch up to date in a straight line, update its remote copy safely, land it on main without a merge commit, push main, and publish an annotated <code>v1.0</code> tag on exactly what you shipped.`,
    goal: 'Rebase <code>order-form</code> onto the latest main and update <code>origin/order-form</code>; fast-forward <code>main</code> to it and push; tag main <code>v1.0</code> (annotated) and push the tag.',
    hints: ['<code>git fetch</code>, then (on order-form) <code>git rebase origin/main</code> and <code>git push --force-with-lease</code>.', '<code>git switch main</code>, <code>git merge order-form</code> (a fast-forward: main is behind it), <code>git push</code>.', '<code>git tag -a v1.0 -m "First release"</code>, then <code>git push origin v1.0</code>.'],
    debrief: 'You just did by hand what GitHub\'s "Rebase and merge" button does, plus the release. Each step had a reason: rebase for a straight line, the lease to protect your teammate, the fast-forward to keep exactly the commits you tested, and an annotated tag to record who shipped what.',
    setup(r) {
      r.setupCommit('Scaffold bakery site', { 'index.html': '<h1>Crumb Bakery</h1>\n<nav>Home</nav>', '.gitignore': '.DS_Store' });
      r.setupRemote();
      r.sh('git switch -c order-form');
      r.setupCommit('Add order form', { 'order.html': '<form>cake, quantity</form>' });
      r.setupCommit('Validate quantity', { 'order.html': '<form>cake, quantity (1-20)</form>' });
      r.sh('git push -u origin order-form');
      r.teammatePush('main', 'Add menu page', { 'menu.html': '<h2>Menu</h2>\nrye loaf 4' });
    },
    check: (r) => [
      ['order-form sits on the teammate\'s commit', msgAt(r, 'order-form~2') === 'Add menu page' && msgAt(r, 'order-form') === 'Validate quantity' && noMerges(r, null, 'order-form')],
      ['origin/order-form updated with a lease', r.s.remote.branches['order-form'] === r.s.branches['order-form'] && r.history.some((h) => h.includes('--force-with-lease')) && !r.history.some((h) => /push.*(\s--force(\s|$)|\s-f(\s|$))/.test(h))],
      ['main = order-form, no merge commit, pushed', r.s.branches.main === r.s.branches['order-form'] && noMerges(r, null, 'main') && r.s.remote.branches.main === r.s.branches.main],
      ['annotated v1.0 on main, pushed', r.s.tags['v1.0']?.id === r.s.branches.main && !!r.s.tags['v1.0']?.msg && r.s.remote.tags['v1.0']?.id === r.s.branches.main],
    ],
    solution: ['git fetch', 'git rebase origin/main', 'git push --force-with-lease', 'git switch main', 'git merge order-form', 'git push', 'git tag -a v1.0 -m "First release"', 'git push origin v1.0'],
    par: 9,
    target: true,
    chips: ['git fetch', 'git status', 'git log --oneline --graph --all', 'git tag -n'],
  },
  {
    id: 'bakery-hotfix', chapter: 'story', kind: 'rescue', title: 'Hotfix the order total',
    concept: `v1.0 shipped, then the order total broke: three rolls at 2 each now cost 5. Somewhere between the <code>v1.0</code> tag (good) and main (bad) a commit turned a <code>*</code> into a <code>+</code>. <code>git bisect</code> finds it in a few steps, and <code>./run-tests</code> can judge each step for you. main is shared, so the fix is a <b>revert</b>, released as <code>v1.0.1</code>.`,
    goal: 'Find the culprit with bisect, end the bisect, revert the culprit on main, push, and publish an annotated <code>v1.0.1</code> tag on the fixed main.',
    hints: ['<code>git bisect start HEAD v1.0</code>, then <code>git bisect run ./run-tests</code>.', 'Remember the culprit: <code>git tag culprit refs/bisect/bad</code>, then <code>git bisect reset</code>.', '<code>git revert --no-edit culprit</code>, <code>git push</code>, <code>git tag -a v1.0.1 -m "Fix order total"</code>, <code>git push origin v1.0.1</code>.'],
    debrief: 'Bisect, revert, patch release: the calm way to handle a production bug on a shared branch. The history now shows the bug and its fix, and v1.0.1 marks exactly what you shipped.',
    setup(r) {
      r.s.bugMarker = 'price + qty';
      r.setupCommit('Scaffold bakery site', { 'index.html': '<h1>Crumb Bakery</h1>' });
      r.setupCommit('Add order total', { 'order.js': 'total = price * qty' });
      r.sh('git tag -a v1.0 -m "First release"');
      r.setupRemote();
      r.sh('git push origin v1.0');
      const after = [['Add cake photos', { 'photos.html': '<img src=cake.jpg>' }, 'teammate'], ['Add delivery note', { 'delivery.html': 'Fri only' }, 'teammate'],
        ['Round prices for display', { 'order.js': 'total = price + qty // rounded' }, 'you'], ['Tidy styles', { 'style.css': 'body { margin: 0 }' }, 'you'],
        ['Add gluten-free tag', { 'menu.html': 'rye (GF)' }, 'teammate'], ['Add pickup times', { 'pickup.html': '8-12' }, 'teammate'], ['Update footer', { 'footer.html': '2026' }, 'you']];
      for (const [m, f, a] of after) r.setupCommit(m, f, a);
      r.sh('git push');
    },
    check: (r) => {
      const main = r.s.branches.main;
      const culprit = r.range(r.s.tags['v1.0'].id, main).find((id) => r.commit(id).msg === 'Round prices for display');
      return [
        ['found with git bisect', r.history.some((h) => /^git bisect (good|bad|run|start \S+ \S+)/.test(h))],
        ['bisect is over, back on main', !r.s.bisect && r.branchName() === 'main'],
        ['culprit reverted (still in history)', !!culprit && !has(fileAt(r, 'main', 'order.js'), 'price + qty') && r.range(culprit, main).some((id) => /^Revert "Round prices/.test(r.commit(id).msg))],
        ['main pushed', r.s.remote.branches.main === main],
        ['annotated v1.0.1 on main, pushed', r.s.tags['v1.0.1']?.id === main && !!r.s.tags['v1.0.1']?.msg && r.s.remote.tags['v1.0.1']?.id === main],
      ];
    },
    solution: ['git bisect start HEAD v1.0', 'git bisect run ./run-tests', 'git tag culprit refs/bisect/bad', 'git bisect reset', 'git revert --no-edit culprit', 'git push', 'git tag -a v1.0.1 -m "Fix order total"', 'git push origin v1.0.1'],
    par: 10,
    chips: ['git log --oneline', './run-tests', 'git bisect start HEAD v1.0', 'git bisect run ./run-tests'],
  },
];

/* ------------------------------------------------- bisect scenario helpers */
const FEATURES = ['Add coupon field', 'Refactor cart totals', 'Translate checkout', 'Add gift wrap option', 'Speed up product list',
  'Fix footer links', 'Add newsletter box', 'Round prices for display', 'Add tax for EU', 'Rename helpers', 'Tidy imports',
  'Add loyalty points', 'Lazy-load images', 'Add express shipping', 'Cache product data', 'Improve error messages',
  'Add wishlist button', 'Update copyright', 'Add search suggestions', 'Clean up CSS', 'Add order history', 'Tweak discount banner',
  'Support dark mode', 'Track page views', 'Add size guide', 'Refine mobile layout', 'Show stock levels', 'Add reviews widget'];

export function bisectHistory(r, count, badAt, seed = 0) {
  r.s.bugMarker = 'subtotal + discount';
  r.setupCommit('Initial commit', { 'checkout.js': 'total = subtotal - discount', 'shop.js': 'shop()' });
  r.sh('git tag v1.0');
  for (let i = 1; i <= count; i++) {
    const files = { [`feature${i}.js`]: `feature(${i})` };
    if (i === badAt) files['checkout.js'] = 'total = subtotal + discount // simplified';
    const name = FEATURES[(i - 1 + seed) % FEATURES.length];
    r.setupCommit(i === badAt ? 'Simplify discount maths' : name, files, ['lead', 'teammate', 'intern', 'you'][(i + seed) % 4]);
  }
}
export function bisectCheck(r) {
  const t = r.s.tags.culprit;
  const c = t && r.commit(t.id);
  const ok = !!c && has(c.tree['checkout.js'], 'subtotal + discount') && !has(r.tree(c.parents[0])['checkout.js'], 'subtotal + discount');
  return [
    ['tag culprit exists', !!t],
    ['it marks the first bad commit', ok],
    ['found with git bisect (good/bad/run)', r.history.some((x) => /^git bisect (good|bad|old|new|run)\b/.test(x))],
    ['bisect is reset, back on main', !r.s.bisect && r.branchName() === 'main'],
  ];
}

// A random, replayable bisect hunt for the arcade.
export function makeBisectHunt(seed = Date.now()) {
  let x = seed % 2147483647 || 7;
  const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const count = 20 + Math.floor(rnd() * 13);
  const badAt = 3 + Math.floor(rnd() * (count - 4));
  return {
    id: 'bisect-hunt', chapter: 'arcade', kind: 'bisect', title: 'Bisect hunt (random)', arcade: true,
    concept: `Somewhere in the last ${count} commits, someone broke the checkout total. <code>./run-tests</code> says whether the commit you are on is good. Each verdict you give (<code>git bisect good</code>/<code>bad</code>) counts as one test. Find the culprit in as few tests as you can: about ${Math.ceil(Math.log2(count + 1))} should do.`,
    goal: 'Find the first bad commit between <code>v1.0</code> (good) and <code>main</code> (bad), tag it <code>culprit</code>, then <code>git bisect reset</code>.',
    hints: ['<code>git bisect start</code>, <code>git bisect bad</code>, <code>git bisect good v1.0</code>', 'Run <code>./run-tests</code>, then say <code>git bisect good</code> or <code>git bisect bad</code>.', '<code>git tag culprit refs/bisect/bad</code>, then <code>git bisect reset</code>.'],
    debrief: 'Binary search needs about log2(N) tests whatever the history looks like. Your score counts the verdicts you gave.',
    setup(r) { bisectHistory(r, count, badAt, seed % 17); },
    check: (r) => bisectCheck(r),
    solution: ['git bisect start', 'git bisect bad', 'git bisect good v1.0', 'git bisect run ./run-tests', 'git tag culprit refs/bisect/bad', 'git bisect reset'],
    par: 99,
    chips: ['git bisect start', './run-tests', 'git bisect good', 'git bisect bad', 'git bisect reset'],
  };
}

export const SANDBOX = {
  id: 'sandbox', chapter: 'arcade', kind: 'puzzle', title: 'Sandbox', sandbox: true,
  concept: `Free play: every command works. The repo has a <code>main</code> with history, a <code>feature</code> branch, and an <code>origin</code> where a teammate has pushed something you have not fetched yet. Break things, then fix them. The <b>Reset</b> button gives you a fresh copy, and your sandbox is saved in this browser.`,
  goal: 'Some ideas: merge feature, then undo it with reflog. Rebase feature instead. Fetch and look at origin/main. Stash a change. Create a conflict on purpose. Try <code>git log --oneline --graph --all</code>.',
  hints: ['Type <code>help</code> for the command list.', 'Tab completes commands, branches and file names.', 'Faded commits in the graph are orphans that the reflog still remembers.'],
  debrief: '',
  setup(r) {
    r.setupCommit('Initial commit', { 'README.md': '# Playground\nA place to try things.', 'app.js': 'start()' });
    r.setupCommit('Add config', { 'config.json': '{ "debug": false }' });
    r.setupRemote();
    r.sh('git switch -c feature');
    r.setupCommit('Start feature', { 'feature.js': 'feature()' });
    r.setupCommit('Polish feature', { 'feature.js': 'feature()\npolish()', 'app.js': 'start()\nfeature()' });
    r.sh('git switch main');
    r.setupCommit('Update README', { 'README.md': '# Playground\nA safe place to try things.' });
    r.teammatePush('main', 'Teammate: add license', { 'LICENSE': 'MIT' });
  },
  check: () => [],
  solution: [],
  chips: ['git status', 'git log --oneline --graph --all', 'git merge feature', 'git fetch', 'git reflog'],
};

/* ------------------------------------------------------------- utilities */
export function levelById(id) { return LEVELS.find((l) => l.id === id) || null; }
export function buildRepo(level) {
  const r = new Repo();
  level.setup(r);
  r.setupDone();
  return r;
}
// Applies one solution step: a command string, or {todo: [[action, index, msg?]...]}
// where index refers to the rebase todo list as git proposed it (oldest first).
export function applyStep(r, step) {
  if (typeof step === 'string') return r.run(step);
  if (step.todo) {
    const t = r.s.pendingRebase?.todo || [];
    return r.rebaseTodoApply(step.todo.map(([action, i, msg]) => ({ action, id: t[i].id, msg })));
  }
  throw new Error('unknown step');
}
export function parOf(level) { return level.par ?? level.solution.length; }
const targetCache = new Map();
export function targetGraph(level) {
  if (!targetCache.has(level.id)) {
    const r = buildRepo(level);
    for (const s of level.solution) applyStep(r, s);
    targetCache.set(level.id, r.graphData());
  }
  return targetCache.get(level.id);
}
export function starsFor(level, moves, hintsUsed) {
  const par = parOf(level);
  let s = moves <= par ? 3 : moves <= Math.max(par + 2, Math.ceil(par * 1.5)) ? 2 : 1;
  if (hintsUsed >= level.hints.length) s = Math.min(s, 2);
  return s;
}
