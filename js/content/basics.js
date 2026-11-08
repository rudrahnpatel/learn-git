// Unit 1: Basics. Working tree, index, commit. Leans on learn / choice / build.
import { fileAt, has, msgAt, spotless, staged, clean } from './helpers.js';

const pancakeRepo = (r) => {
  r.setupCommit('Initial commit', { 'README.md': '# Recipe box\nFamily recipes, one per file.' });
  r.setupFiles({ 'pancakes.txt': 'Pancakes\n2 eggs\n1 cup flour\n1 cup milk' });
};

export default {
  id: 'basics', title: 'Basics', color: 'yellow',
  blurb: 'Working tree, index, commit: the three places every file lives.',
  challenges: ['first-commit', 'stage-selectively', 'gitignore'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'basics-1', title: 'Three places',
      exercises: [
        {
          id: 'ba1-three-places', type: 'learn', new: true, title: 'Every file lives in three places',
          body: 'The <b>working tree</b> is the files you edit. The <b>index</b> (or staging area) is a draft of your next commit. <b>HEAD</b> is the commit you are on: your last saved snapshot.',
          demo: { setup: pancakeRepo, run: ['git add pancakes.txt', 'git commit -m "Add pancakes"'] },
        },
        {
          id: 'ba1-where-edit', type: 'choice',
          prompt: 'You just typed a new line into <code>menu.txt</code> and saved it. Where does that change live right now?',
          options: ['Only in the working tree', 'In the index', 'In the last commit', 'In all three places'],
          answer: 0,
          explain: 'Saving a file only changes the working tree. Git does not copy anything until you tell it to with <code>git add</code>.',
        },
        {
          id: 'ba1-status', type: 'learn', new: true, title: 'git status: your dashboard',
          body: '<code>git status</code> compares the three places and tells you what differs: untracked files, changes not staged yet, and changes ready to commit. It never changes anything, so run it as often as you like.',
        },
        {
          id: 'ba1-match-places', type: 'match',
          prompt: 'Match each place to what it holds.',
          pairs: [
            ['Working tree', 'The files you edit'],
            ['Index', 'A draft of the next commit'],
            ['HEAD', 'The commit you are on'],
            ['git status', 'Shows how the three differ'],
          ],
          explain: 'Edit in the working tree, prepare in the index, save as a commit. <code>git status</code> tells you which step each file is at.',
        },
        {
          id: 'ba1-untracked', type: 'choice',
          prompt: 'What does "untracked" mean here?',
          code: 'Untracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tpancakes.txt',
          options: ['Git has never been told to track this file', 'The file is ignored by .gitignore', 'The file was deleted', 'The file has a merge conflict'],
          answer: 0,
          explain: 'A new file is untracked until you <code>git add</code> it for the first time. Ignored files do not show up in status at all.',
        },
        {
          id: 'ba1-add-commit', type: 'learn', new: true, title: 'add, then commit',
          body: '<code>git add file</code> copies the file as it is now into the index. <code>git commit -m "message"</code> saves everything in the index as a new commit. Two steps, so you choose what goes in.',
          demo: { setup: pancakeRepo, run: ['git add pancakes.txt', 'git commit -m "Add pancakes"'] },
        },
        {
          id: 'ba1-order-save', type: 'order',
          prompt: 'Put the steps for saving a brand-new recipe in order.',
          steps: ['Write pancakes.txt in your editor', 'git add pancakes.txt', 'git commit -m "Add pancakes"'],
          explain: 'A file has to exist before you can stage it, and it has to be staged before a commit can include it.',
        },
        {
          id: 'ba1-build-add', type: 'build',
          prompt: 'Stage <code>pancakes.txt</code>.',
          tiles: ['git', 'add', 'pancakes.txt', 'commit', 'status', '-m'],
          answers: [['git', 'add', 'pancakes.txt']],
          explain: '<code>git add</code> moves a snapshot of the file into the index. Nothing is saved in history yet.',
        },
        {
          id: 'ba1-fill-commit', type: 'fill',
          prompt: 'Save the staged recipe as a commit.',
          before: 'git ', after: ' -m "Add pancakes"',
          options: ['commit', 'add', 'save', 'push'],
          answer: 0,
          explain: '<code>git commit</code> turns the index into a commit. <code>-m</code> gives the message inline. There is no <code>git save</code>.',
        },
        {
          id: 'ba1-type-add', type: 'type',
          prompt: 'Your recipe box has a new file, <code>pancakes.txt</code>. Stage it.',
          setup: pancakeRepo,
          check: (r) => staged(r, 'pancakes.txt'),
          solution: 'git add pancakes.txt',
          explain: 'Watch the trees view: the file now sits in the index, ready for the next commit.',
        },
        {
          id: 'ba1-type-commit', type: 'type',
          prompt: '<code>pancakes.txt</code> is staged. Commit it with the message <code>Add pancakes</code>.',
          setup: (r) => { pancakeRepo(r); r.sh('git add pancakes.txt'); },
          check: (r) => has(fileAt(r, 'HEAD', 'pancakes.txt'), 'flour') && spotless(r),
          solution: 'git commit -m "Add pancakes"',
          explain: 'A new dot appears in the graph: your snapshot is now part of history, and the working tree is clean.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'basics-2', title: 'Commits and history',
      exercises: [
        {
          id: 'ba2-snapshot', type: 'learn', new: true, title: 'A commit is a snapshot',
          body: 'Each commit stores a full snapshot of every tracked file, plus a message, an author and a link to its <b>parent</b> (the commit before it). Unchanged files are shared between snapshots, so this stays small.',
          demo: {
            setup: (r) => { r.setupCommit('Initial commit', { 'pancakes.txt': 'Pancakes\n2 eggs' }); r.setupFiles({ 'pancakes.txt': 'Pancakes\n2 eggs\nmaple syrup' }); },
            run: ['git commit -am "Add syrup"'],
          },
        },
        {
          id: 'ba2-what-stored', type: 'choice',
          prompt: 'What does a commit record?',
          options: ['A snapshot of all tracked files, a message and its parent', 'Only the lines you changed', 'The commands you typed', 'Every file on your disk, tracked or not'],
          answer: 0,
          explain: 'Git thinks in snapshots, not edits. A diff is something it works out by comparing a commit with its parent.',
        },
        {
          id: 'ba2-graph-commit', type: 'graph',
          prompt: '<code>pancakes.txt</code> is tracked and edited. Which graph do you get?',
          setup: (r) => { r.setupCommit('Initial commit', { 'pancakes.txt': 'Pancakes\n2 eggs' }); r.setupFiles({ 'pancakes.txt': 'Pancakes\n2 eggs\nmaple syrup' }); },
          command: 'git commit -am "Add syrup"',
          distractors: [['git add pancakes.txt']],
          explain: '<code>-a</code> stages every tracked file that changed, so the commit happens and <code>main</code> moves to the new dot.',
        },
        {
          id: 'ba2-log', type: 'learn', new: true, title: 'git log: read the history',
          body: '<code>git log</code> lists commits, newest first. <code>git log --oneline</code> squeezes each one onto a single line: a short id and the message. That is why a clear message matters.',
        },
        {
          id: 'ba2-good-message', type: 'choice',
          prompt: 'Which commit message will help a teammate most in six months?',
          options: ['Add gluten-free pancake recipe', 'stuff', 'fixed things', 'asdfgh'],
          answer: 0,
          explain: 'Say what the commit does, in the imperative ("Add", "Fix", "Remove"). It reads like an instruction: "this commit will add a gluten-free recipe".',
        },
        {
          id: 'ba2-fill-oneline', type: 'fill',
          prompt: 'Show one commit per line.',
          before: 'git log ', after: '',
          options: ['--oneline', '--short', '--brief', '-1line'],
          answer: 0,
          explain: '<code>--oneline</code> prints the short id and the first line of the message. Perfect for a quick look.',
        },
        {
          id: 'ba2-build-commit', type: 'build',
          prompt: 'Commit what is staged with the message <code>Add syrup</code>.',
          tiles: ['git', 'commit', '-m', '"Add syrup"', 'push', 'add'],
          answers: [['git', 'commit', '-m', '"Add syrup"']],
          explain: '<code>-m</code> takes the message right after it. Without <code>-m</code>, git would open an editor for you to write one.',
        },
        {
          id: 'ba2-match-commands', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git add', 'Stage a change'],
            ['git commit', 'Save the staged snapshot'],
            ['git status', 'Show what is staged and what is not'],
            ['git log', 'List past commits'],
          ],
          explain: 'These four are most of your day: check, stage, commit, look back.',
        },
        {
          id: 'ba2-type-two', type: 'type',
          prompt: 'You wrote <code>syrup.txt</code>. Stage it and commit it with the message <code>Add syrup</code>.',
          setup: (r) => { r.setupCommit('Initial commit', { 'pancakes.txt': 'Pancakes\n2 eggs' }); r.setupFiles({ 'syrup.txt': 'Maple syrup, warm' }); },
          check: (r) => fileAt(r, 'HEAD', 'syrup.txt') !== undefined && spotless(r),
          solution: 'git add syrup.txt && git commit -m "Add syrup"',
          explain: 'Two steps, one commit. <code>&amp;&amp;</code> runs the second command only if the first one worked.',
        },
        {
          id: 'ba2-type-commit-a', type: 'type',
          prompt: '<code>pancakes.txt</code> is tracked and you edited it. Commit the edit in one command.',
          setup: (r) => { r.setupCommit('Initial commit', { 'pancakes.txt': 'Pancakes\n2 eggs' }); r.setupFiles({ 'pancakes.txt': 'Pancakes\n3 eggs' }); },
          check: (r) => has(fileAt(r, 'HEAD', 'pancakes.txt'), '3 eggs') && msgAt(r, 'HEAD~1') === 'Initial commit' && clean(r),
          solution: 'git commit -am "Use 3 eggs"',
          explain: '<code>-a</code> stages every tracked file that changed, then commits. It is a shortcut for known files only.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'basics-3', title: 'Seeing changes',
      exercises: [
        {
          id: 'ba3-diff', type: 'learn', new: true, title: 'Two kinds of diff',
          body: '<code>git diff</code> shows changes you have <i>not</i> staged yet (working tree vs index). <code>git diff --staged</code> shows what you <i>have</i> staged (index vs last commit): exactly what the next commit will contain.',
        },
        {
          id: 'ba3-empty-diff', type: 'choice',
          prompt: 'You ran <code>git add app.js</code>, then <code>git diff</code> printed nothing. Why?',
          options: ['The change is staged, and git diff only shows unstaged changes', 'git add threw your change away', 'The change was committed automatically', 'git diff only works on new files'],
          answer: 0,
          explain: 'Plain <code>git diff</code> compares the working tree with the index, and they now match. <code>git diff --staged</code> shows the change.',
        },
        {
          id: 'ba3-show', type: 'learn', new: true, title: 'Two more views',
          body: '<code>git diff HEAD</code> shows every change since the last commit, staged or not. <code>git show</code> looks back instead: it prints the last commit, its message and its diff against its parent.',
        },
        {
          id: 'ba3-match-diffs', type: 'match',
          prompt: 'Match each command to what it compares.',
          pairs: [
            ['git diff', 'Working tree vs index'],
            ['git diff --staged', 'Index vs last commit'],
            ['git diff HEAD', 'Working tree vs last commit'],
            ['git show', 'The last commit vs its parent'],
          ],
          explain: '<code>--staged</code> (also spelled <code>--cached</code>) is your preview of the next commit. <code>git diff HEAD</code> shows everything, staged or not.',
        },
        {
          id: 'ba3-snapshot-index', type: 'learn', new: true, title: 'add takes a snapshot',
          body: '<code>git add</code> stores the file <i>as it is right now</i>. Edit it again afterwards and the index still holds the older version until you add again. A commit is made from the index, not from your disk.',
        },
        {
          id: 'ba3-add-then-edit', type: 'choice',
          prompt: 'You stage <code>recipe.txt</code> with 3 eggs, then change it to 4 eggs, then run <code>git commit -m "Eggs"</code>. What gets committed?',
          options: ['3 eggs', '4 eggs', 'Both versions', 'Nothing, git refuses'],
          answer: 0,
          explain: 'The commit uses the index, which still has the 3-egg snapshot. The 4-egg edit stays in your working tree, unstaged.',
        },
        {
          id: 'ba3-fill-staged', type: 'fill',
          prompt: 'Preview exactly what your next commit will contain.',
          before: 'git diff ', after: '',
          options: ['--staged', '--all', '--next', '--head'],
          answer: 0,
          explain: '<code>git diff --staged</code> compares the index with HEAD. Its twin spelling is <code>--cached</code>.',
        },
        {
          id: 'ba3-status-twice', type: 'choice',
          prompt: '<code>git status</code> lists <code>recipe.txt</code> under <b>both</b> "Changes to be committed" and "Changes not staged". How?',
          options: ['You staged it, then edited it again', 'The file is duplicated', 'It has a merge conflict', 'Git is confused, run git status again'],
          answer: 0,
          explain: 'One version is in the index and a newer one is in the working tree. Both are real, and each diff shows one of them.',
        },
        {
          id: 'ba3-order-review', type: 'order',
          prompt: 'A careful commit: put these in order.',
          steps: ['Edit app.js', 'git diff (review the edit)', 'git add app.js', 'git diff --staged (double-check)', 'git commit -m "Fix total"'],
          explain: 'Review before staging with <code>git diff</code>, then check the staged version with <code>git diff --staged</code> before committing.',
        },
        {
          id: 'ba3-build-staged', type: 'build',
          prompt: 'Show the changes that are already staged.',
          tiles: ['git', 'diff', '--staged', 'log', '--oneline', 'add'],
          answers: [['git', 'diff', '--staged']],
          explain: 'Without <code>--staged</code> you would see only the unstaged changes, which might be nothing at all.',
        },
        {
          id: 'ba3-type-staged-only', type: 'type',
          prompt: 'The staged <code>recipe.txt</code> says 3 eggs, and a chili experiment is unstaged. Commit only the staged version.',
          setup: (r) => {
            r.setupCommit('Initial commit', { 'recipe.txt': 'Omelette\n2 eggs\nsalt' });
            r.setupFiles({ 'recipe.txt': 'Omelette\n3 eggs\nsalt' });
            r.sh('git add recipe.txt');
            r.setupFiles({ 'recipe.txt': 'Omelette\n3 eggs\nsalt\nchili flakes' });
          },
          check: (r) => has(fileAt(r, 'HEAD', 'recipe.txt'), '3 eggs') && !has(fileAt(r, 'HEAD', 'recipe.txt'), 'chili') && has(r.s.work['recipe.txt'], 'chili'),
          solution: 'git commit -m "Use 3 eggs"',
          explain: 'Plain <code>git commit</code> takes the index as it is. Running <code>git add</code> or <code>-a</code> first would have swept the chili in too.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'basics-4', title: 'Choosing what to commit',
      exercises: [
        {
          id: 'ba4-tracked', type: 'learn', new: true, title: 'Tracked or untracked',
          body: 'A file is <b>tracked</b> once it has been added. <code>git commit -a</code> stages every tracked file that changed, then commits. It never picks up new, untracked files. <code>git add .</code> does: it stages everything in the folder.',
        },
        {
          id: 'ba4-commit-a-new', type: 'choice',
          prompt: 'You edited <code>style.css</code> (tracked) and created <code>scratch.txt</code> (new). What does <code>git commit -am "Update styles"</code> commit?',
          options: ['Only style.css', 'Both files', 'Only scratch.txt', 'Nothing, you must git add first'],
          answer: 0,
          explain: '<code>-a</code> only stages files git already tracks. scratch.txt stays untracked.',
        },
        {
          id: 'ba4-match-add', type: 'match',
          prompt: 'Match each command to what it stages.',
          pairs: [
            ['git add app.js', 'Just that one file'],
            ['git add .', 'Everything here, new files included'],
            ['git commit -a', 'Tracked files that changed (then commits)'],
            ['git add app.js notes.txt', 'Exactly the files you name'],
          ],
          explain: 'Pick the narrowest tool: name the files you mean, and save <code>git add .</code> for when everything belongs in the commit.',
        },
        {
          id: 'ba4-unstage', type: 'learn', new: true, title: 'Changed your mind? Unstage',
          body: '<code>git restore --staged file</code> takes a file back out of the index. Your edit stays in the working tree, untouched. Nothing is lost: it just will not be in the next commit.',
        },
        {
          id: 'ba4-which-unstage', type: 'choice',
          prompt: 'You staged <code>notes.txt</code> by accident. Which command unstages it and keeps your edit?',
          options: ['git restore --staged notes.txt', 'git restore notes.txt', 'git rm notes.txt', 'git commit -m "oops"'],
          answer: 0,
          explain: 'Without <code>--staged</code>, <code>git restore</code> would overwrite your edit in the working tree. <code>git rm</code> would delete the file.',
        },
        {
          id: 'ba4-fill-staged', type: 'fill',
          prompt: 'Unstage notes.txt, keep the edit.',
          before: 'git restore ', after: ' notes.txt',
          options: ['--staged', '--hard', '--cached', '--undo'],
          answer: 0,
          explain: '<code>--staged</code> works on the index only. (<code>--cached</code> is the word <code>git rm</code> and <code>git diff</code> use, not restore.)',
        },
        {
          id: 'ba4-order-split', type: 'order',
          prompt: 'Two unrelated edits: commit the bug fix first, then the notes.',
          steps: ['git add app.js', 'git commit -m "Fix total"', 'git add notes.txt', 'git commit -m "Update notes"'],
          explain: 'One idea per commit. Staging lets you split one messy working tree into clean, separate commits.',
        },
        {
          id: 'ba4-build-am', type: 'build',
          prompt: 'Stage every tracked change and commit, in one command.',
          tiles: ['git', 'commit', '-am', '"Update styles"', 'add', '--amend', 'push'],
          answers: [['git', 'commit', '-am', '"Update styles"']],
          explain: '<code>-am</code> is <code>-a</code> plus <code>-m</code>: stage tracked changes, then use the message that follows.',
        },
        {
          id: 'ba4-type-select', type: 'type',
          prompt: 'Commit the fix in <code>app.js</code> only. Your <code>notes.txt</code> edit is personal: leave it uncommitted.',
          setup: (r) => {
            r.setupCommit('Initial commit', { 'app.js': 'function total(items) {\n  return items.length;\n}', 'notes.txt': 'todo: ask about tax' });
            r.setupFiles({ 'app.js': 'function total(items) {\n  return items.reduce((s, i) => s + i.price, 0);\n}', 'notes.txt': 'todo: ask about tax\nidea: dark mode?' });
          },
          check: (r) => has(fileAt(r, 'HEAD', 'app.js'), 'reduce') && !has(fileAt(r, 'HEAD', 'notes.txt'), 'dark mode') && has(r.s.work['notes.txt'], 'dark mode'),
          solution: 'git add app.js && git commit -m "Sum item prices"',
          explain: 'Stage the file you mean, commit, and the other edit simply waits in the working tree.',
        },
        {
          id: 'ba4-type-unstage', type: 'type',
          prompt: 'Both files are staged, but <code>notes.txt</code> should not be. Unstage it without losing the edit.',
          setup: (r) => {
            r.setupCommit('Initial commit', { 'app.js': 'total()', 'notes.txt': 'meeting notes' });
            r.setupFiles({ 'app.js': 'total(items)', 'notes.txt': 'meeting notes\n- ship on friday' });
            r.sh('git add app.js notes.txt');
          },
          check: (r) => !staged(r, 'notes.txt') && has(r.s.work['notes.txt'], 'friday') && staged(r, 'app.js'),
          solution: 'git restore --staged notes.txt',
          explain: 'app.js is still staged and notes.txt is back to "modified, not staged". The older <code>git reset notes.txt</code> does the same.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'basics-5', title: 'Ignore the noise',
      exercises: [
        {
          id: 'ba5-gitignore', type: 'learn', new: true, title: '.gitignore',
          body: 'A <code>.gitignore</code> file lists patterns. Untracked files that match vanish from <code>git status</code> and are skipped by <code>git add .</code>. Write one with <code>echo "*.log" &gt; .gitignore</code>; <code>&gt;&gt;</code> appends a line instead. Commit it so the team shares it.',
        },
        {
          id: 'ba5-patterns', type: 'learn', new: true, title: 'Pattern basics',
          body: 'One pattern per line. <code>*</code> matches any name, so <code>*.log</code> catches every log file. A trailing slash, <code>build/</code>, means a whole folder. A leading <code>!</code>, as in <code>!keep.log</code>, makes an exception to an earlier rule.',
          teaches: ['gitignore patterns'],
        },
        {
          id: 'ba5-match-patterns', type: 'match', needs: ['gitignore patterns'],
          prompt: 'Match each .gitignore line to what it ignores.',
          pairs: [
            ['*.log', 'Every file ending in .log'],
            ['build/', 'The whole build folder'],
            ['.env', 'Any file named .env'],
            ['!keep.log', 'Un-ignores keep.log again'],
          ],
          explain: '<code>*</code> matches any name, a trailing <code>/</code> means a folder, and <code>!</code> makes an exception to an earlier rule.',
        },
        {
          id: 'ba5-already-tracked', type: 'choice',
          prompt: 'You add <code>secrets.txt</code> to .gitignore, but it was committed last week. What happens on your next edit to it?',
          options: ['Git still tracks it and shows the change', 'Git deletes it from history', 'Git stops tracking it automatically', 'Git refuses to commit anything'],
          answer: 0,
          explain: 'Ignore rules only apply to <i>untracked</i> files. A file that is already tracked stays tracked until you remove it from the index.',
        },
        {
          id: 'ba5-rm-cached', type: 'learn', new: true, title: 'Stop tracking, keep the file',
          body: '<code>git rm --cached file</code> removes a file from the index but leaves it on your disk. Commit that, add the file to .gitignore, and git will leave it alone from then on.',
        },
        {
          id: 'ba5-fill-cached', type: 'fill',
          prompt: 'Stop tracking secrets.txt but keep it on disk.',
          before: 'git rm ', after: ' secrets.txt',
          options: ['--cached', '--staged', '-r', '--force'],
          answer: 0,
          explain: 'Plain <code>git rm</code> deletes the file from disk too. <code>--cached</code> touches only the index.',
        },
        {
          id: 'ba5-belongs', type: 'choice',
          prompt: 'Which of these belongs in the repository?',
          options: ['.gitignore', 'node_modules/', '.env with your API key', 'debug.log'],
          answer: 0,
          explain: 'Share the rules, not the noise. Dependencies can be reinstalled, logs regenerate, and keys must never be committed.',
        },
        {
          id: 'ba5-build-append', type: 'build',
          prompt: 'Add the pattern <code>*.log</code> to the end of an existing .gitignore.',
          tiles: ['echo', '"*.log"', '>>', '.gitignore', '>', 'git', 'add'],
          answers: [['echo', '"*.log"', '>>', '.gitignore']],
          explain: '<code>&gt;&gt;</code> appends a line. A single <code>&gt;</code> would replace the whole file, wiping the rules already in it.',
        },
        {
          id: 'ba5-order-ignore', type: 'order',
          prompt: 'Set up ignoring for a fresh project.',
          steps: ['Write the patterns into .gitignore', 'git add .gitignore', 'git commit -m "Ignore logs"', 'git status shows a clean tree'],
          explain: 'The .gitignore is a normal file: write it, stage it, commit it. After that, status stops nagging about the ignored files.',
        },
        {
          id: 'ba5-type-ignore', type: 'type',
          prompt: '<code>debug.log</code> keeps showing up in <code>git status</code>. Create a .gitignore that ignores every <code>.log</code> file.',
          setup: (r) => { r.setupCommit('Initial commit', { 'main.py': 'print("hello")' }); r.setupFiles({ 'debug.log': 'DEBUG starting' }); },
          check: (r) => r.isIgnored('debug.log') && r.isIgnored('server.log'),
          solution: 'echo "*.log" > .gitignore',
          explain: 'debug.log is gone from status. Only .gitignore shows up now, as a new file waiting to be committed.',
        },
        {
          id: 'ba5-type-untrack', type: 'type',
          prompt: '<code>secrets.txt</code> is listed in .gitignore but was committed earlier. Stop tracking it (keep it on disk) and commit that.',
          setup: (r) => {
            r.setupCommit('Initial commit', { 'app.py': 'run()', 'secrets.txt': 'token=abc123' });
            r.setupCommit('Ignore secrets', { '.gitignore': 'secrets.txt' });
          },
          check: (r) => fileAt(r, 'HEAD', 'secrets.txt') === undefined && has(r.s.work['secrets.txt'], 'abc123') && spotless(r),
          solution: 'git rm --cached secrets.txt && git commit -m "Stop tracking secrets"',
          explain: 'The file stays on disk, is no longer tracked, and the ignore rule now keeps it out. Older commits still contain it, though: rotate any real secret.',
        },
      ],
    },
  ],
};
