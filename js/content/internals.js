// Unit 9: Under the hood. Blobs, trees, commits and refs; ids are hashes of contents; a branch is
// a file holding an id; HEAD points at a branch (or a commit when detached); why rewriting
// changes ids. Inspection exercises are graded on what the player looked at (see `looked`).
import { msgAt, noMerges } from './helpers.js';

/* ------------------------------------------------ scenarios */
const site = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Crumb</h1>', 'css/site.css': 'body { margin: 0 }' });
  r.setupCommit('Add menu page', { 'menu.html': '<h2>Menu</h2>\nbread 3' });
  r.setupCommit('Add contact page', { 'contact.html': '<p>hi@crumb.example</p>' });
};
const typo = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Crumb</h1>', 'css/site.css': 'body { margin: 0 }' });
  r.setupCommit('Add menu page', { 'menu.html': '<h2>Menu</h2>\nbread 3' });
  r.setupCommit('Add contcat page', { 'contact.html': '<p>hi@crumb.example</p>' });
};
const featureBehind = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>Crumb</h1>' });
  r.sh('git switch -c feature');
  r.setupCommit('Add menu page', { 'menu.html': '<h2>Menu</h2>' });
  r.setupCommit('Add prices', { 'menu.html': '<h2>Menu</h2>\nbread 3' });
  r.sh('git switch main');
  r.setupCommit('Add footer', { 'footer.html': '<footer>Crumb</footer>' });
  r.sh('git switch feature');
};

/* ------------------------------------------------ inspection checks */
// every single command the player ran (chains split), newest last
const cmds = (r) => r.history.flatMap((h) => h.split(/&&|;|\n/).map((x) => x.trim()).filter(Boolean));
// some command matching `re` named an object (capture group 1) that satisfies `pred`
const looked = (r, re, pred) => cmds(r).some((c) => {
  const m = c.match(re);
  if (!m) return false;
  try { return pred(r.object(m[1].replace(/^["']|["']$/g, ''))); } catch { return false; }
});
const ranCmd = (r, re) => cmds(r).some((c) => re.test(c));

export default {
  id: 'internals', title: 'Under the hood', color: 'pink',
  blurb: 'Blobs, trees, commits and refs: what a branch and HEAD really are, and why ids change.',
  challenges: ['same-snapshot', 'detached'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'internals-1', title: 'Blobs, trees and commits',
      exercises: [
        {
          id: 'in1-objects', type: 'learn', new: true, title: 'Three kinds of objects',
          body: 'Git stores your project as objects. A <b>blob</b> is one file\'s contents. A <b>tree</b> is a folder: names pointing at blobs and other trees. A <b>commit</b> points at one tree (the whole snapshot), its parent commits, an author and a message.',
        },
        {
          id: 'in1-match', type: 'match',
          prompt: 'Match each object to what it holds.',
          pairs: [
            ['blob', 'The contents of one file'],
            ['tree', 'A folder listing: names, blobs, subtrees'],
            ['commit', 'A root tree, parents, author, message'],
            ['branch', 'A name that points at a commit'],
          ],
          explain: 'A branch is not an object at all: it is a ref, a label stored outside the object database.',
        },
        {
          id: 'in1-names', type: 'choice',
          prompt: 'Where does git keep a file\'s <b>name</b>?',
          options: ['In the tree that points at its blob', 'Inside the blob, above the contents', 'In the commit message', 'In .gitignore'],
          answer: 0,
          explain: 'A blob is only contents. Renaming a file changes the tree, not the blob.',
        },
        {
          id: 'in1-snapshot', type: 'choice',
          prompt: 'What does a commit store?',
          options: ['A full snapshot (via its tree), not a diff', 'Only the lines that changed', 'A copy of the working tree, including untracked files', 'The diff against main'],
          answer: 0,
          explain: 'Each commit names a complete tree. Unchanged files reuse the same blobs, so snapshots stay cheap. Diffs are computed when you ask.',
        },
        {
          id: 'in1-catfile', type: 'learn', new: true, title: 'Look inside: cat-file',
          body: '<code>git cat-file -t X</code> prints the type of object X. <code>git cat-file -p X</code> pretty-prints it: a commit shows its <code>tree</code> and <code>parent</code> lines, a tree lists its entries. <code>HEAD^{tree}</code> names HEAD\'s tree.',
        },
        {
          id: 'in1-read', type: 'choice',
          prompt: 'Read this commit. Which is true?',
          code: '$ git cat-file -p HEAD\ntree 9f1c2ab\nparent 4e5d6c7\nauthor you <you@example.com> 1767230000 +0000\ncommitter you <you@example.com> 1767230000 +0000\n\nAdd contact page',
          options: ['One parent, and 9f1c2ab is the whole project snapshot', 'No parent: it is the first commit', '9f1c2ab holds only contact.html', 'Two parents: it is a merge'],
          answer: 0,
          explain: 'One <code>parent</code> line, one parent. A merge commit has two. The tree is the root folder of the full snapshot.',
        },
        {
          id: 'in1-fill', type: 'fill',
          prompt: 'Print just the <b>type</b> of the object HEAD points at (it says <code>commit</code>).',
          before: 'git cat-file ', after: ' HEAD',
          options: ['-t', '-p', '-s', '-e'],
          answer: 0,
          explain: '<code>-t</code> type, <code>-p</code> pretty-print, <code>-s</code> size, <code>-e</code> "does it exist?" (exit code only).',
        },
        {
          id: 'in1-build', type: 'build',
          prompt: 'List the entries of HEAD\'s root tree.',
          tiles: ['git', 'cat-file', '-p', 'HEAD^{tree}', '-t', 'log', 'HEAD~1'],
          answers: [['git', 'cat-file', '-p', 'HEAD^{tree}']],
          explain: '<code>X^{tree}</code> means "the tree of commit X". <code>git ls-tree HEAD</code> shows the same list.',
        },
        {
          id: 'in1-type-commit', type: 'type',
          prompt: 'Pretty-print the commit that <code>HEAD</code> points at.',
          setup: site,
          check: (r) => looked(r, /^git cat-file -p (\S+)$/, (ob) => ob.type === 'commit' && ob.id === r.headId()),
          solution: 'git cat-file -p HEAD',
          explain: 'A tree line, a parent line, author, committer, a blank line, the message. That is a whole commit.',
        },
        {
          id: 'in1-type-tree', type: 'type',
          prompt: 'Now list HEAD\'s root tree. Spot the subtree for the <code>css</code> folder.',
          setup: site,
          check: (r) => looked(r, /^git cat-file -p (\S+)$/, (ob) => ob.type === 'tree' && ob.prefix === '' && ob.id === r.treeId('HEAD')),
          solution: 'git cat-file -p HEAD^{tree}',
          explain: '<code>100644 blob</code> lines are files; <code>040000 tree css</code> is a folder. You could <code>cat-file -p</code> that tree id too.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'internals-2', title: 'Ids are hashes',
      exercises: [
        {
          id: 'in2-hash', type: 'learn', new: true, title: 'Named by content',
          body: 'An object\'s id is a hash of its contents. Same contents, same id. A commit\'s contents are its tree id, parent ids, author, committer, timestamps and message, so changing any of them gives a different commit id.',
        },
        {
          id: 'in2-dup', type: 'choice',
          prompt: 'Two files in different folders contain exactly the same text. How many blobs does git store for them?',
          options: ['One', 'Two', 'One per commit', 'None until you push'],
          answer: 0,
          explain: 'Same contents, same hash, one blob. The two trees both point at it under different names.',
        },
        {
          id: 'in2-hash-object', type: 'learn', new: true, title: 'hash-object and rev-parse',
          body: '<code>git hash-object file</code> prints the blob id a file would get, without committing anything. <code>git rev-parse X</code> prints the id behind any name: <code>main</code>, <code>HEAD^{tree}</code>, <code>HEAD:file</code>. Real git ids are 40 hex digits; this playground shows 7.',
        },
        {
          id: 'in2-one-line', type: 'choice',
          prompt: 'You change one line in <code>css/site.css</code> and commit. Which objects are new?',
          options: ['A blob, the css tree, the root tree and the commit', 'Only a blob for the changed line', 'A copy of every file', 'Only the commit'],
          answer: 0,
          explain: 'The new blob changes the css tree\'s contents, which changes the root tree, which changes the commit. Every other blob and tree is reused.',
        },
        {
          id: 'in2-match', type: 'match',
          prompt: 'Match each change to what happens to ids.',
          pairs: [
            ['Two files with the same text', 'They share one blob id'],
            ['Edit one file', 'New blob, new trees up to the root, new commit'],
            ['Amend only the message', 'New commit id, same tree id'],
            ['Revert back to an earlier snapshot', 'New commit id, an old tree id again'],
          ],
          explain: 'Trees capture "what the files are". Commits add "where it came from and who said so", which is why commit ids change more often.',
        },
        {
          id: 'in2-same-tree', type: 'choice',
          prompt: 'Can two <b>different</b> commits have the <b>same</b> tree id?',
          options: ['Yes: the same snapshot reached twice, e.g. after a revert', 'No, every commit has a unique tree', 'Only on different branches', 'Only in merge commits'],
          answer: 0,
          explain: 'Revert a commit and the snapshot is byte-for-byte the one before it: same tree id, but a new commit with its own parent and message.',
        },
        {
          id: 'in2-fill', type: 'fill',
          prompt: 'Print the id of HEAD\'s root tree.',
          before: 'git rev-parse HEAD^{', after: '}',
          options: ['tree', 'commit', 'blob', 'parent'],
          answer: 0,
          explain: '<code>git rev-parse</code> turns any name into an id. <code>HEAD:menu.html</code> would give a blob id.',
        },
        {
          id: 'in2-revparse', type: 'choice',
          prompt: '<code>git rev-parse main</code> prints <code>4e5d6c7</code>. What is that?',
          options: ['The id of the commit main points at', 'The id of main\'s tree', 'A hash of the word "main"', 'The id of the first commit on main'],
          answer: 0,
          explain: 'A branch name resolves to a commit id. That is all a branch is.',
        },
        {
          id: 'in2-type-hash', type: 'type',
          prompt: 'Compute the blob id of the working file <code>menu.html</code>, then print the blob id HEAD has for it (<code>HEAD:menu.html</code>). They match: same contents.',
          setup: site,
          check: (r) => ranCmd(r, /^git hash-object (\S+\s)*menu\.html$/) && looked(r, /^git rev-parse (\S+)$/, (ob) => ob.type === 'blob' && ob.content === r.tree(r.headId())['menu.html']),
          solution: 'git hash-object menu.html && git rev-parse HEAD:menu.html',
          explain: 'Same bytes, same id. Edit menu.html and hash it again: the id changes, even for a one-character edit.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'internals-3', title: 'Refs and HEAD',
      exercises: [
        {
          id: 'in3-ref', type: 'learn', new: true, title: 'A branch is a file',
          body: '<code>.git/refs/heads/main</code> is a tiny text file holding one commit id. That is the whole branch. Committing on main writes the new id into it. A new branch is one more small file, which is why branches are cheap.',
        },
        {
          id: 'in3-cheap', type: 'choice',
          prompt: 'Why is <code>git branch hotfix</code> instant, even in a huge repository?',
          options: ['It writes one small file holding a commit id', 'Git copies the files in the background', 'Branches only exist on the server', 'It only works on small repos'],
          answer: 0,
          explain: 'No files are copied. The commits already exist; the branch is a new label on one of them.',
        },
        {
          id: 'in3-graph', type: 'graph',
          prompt: 'Which graph does this give?',
          setup: site,
          command: 'git branch hotfix HEAD~1',
          distractors: [['git switch -c hotfix HEAD~1'], ['git branch hotfix']],
          explain: 'A new label on the second commit, and HEAD stays on main. <code>switch -c</code> would also move HEAD.',
        },
        {
          id: 'in3-head', type: 'learn', new: true, title: 'HEAD points at a branch',
          body: '<code>.git/HEAD</code> usually says <code>ref: refs/heads/main</code>: HEAD points at a branch, and the branch points at a commit. In <b>detached HEAD</b>, the file holds a commit id directly, so new commits belong to no branch.',
          demo: { setup: site, run: ['git switch --detach HEAD~1'] },
        },
        {
          id: 'in3-which', type: 'choice',
          prompt: 'What does this tell you?',
          code: '$ cat .git/HEAD\nref: refs/heads/feature',
          options: ['You are on branch feature', 'HEAD is detached at feature', 'feature is the default branch', 'feature has no commits'],
          answer: 0,
          explain: 'A <code>ref:</code> line means HEAD is attached to that branch. Commits will move feature.',
        },
        {
          id: 'in3-detached', type: 'choice',
          prompt: 'And this?',
          code: '$ cat .git/HEAD\n4e5d6c7',
          options: ['Detached HEAD: HEAD holds a commit id directly', 'You are on main', 'The repository is corrupted', 'A merge is in progress'],
          answer: 0,
          explain: 'No branch in between. Commit here and only HEAD (and the reflog) remembers it, until you <code>git switch -c</code> a branch.',
        },
        {
          id: 'in3-match', type: 'match',
          prompt: 'Match each file to what it holds.',
          pairs: [
            ['.git/HEAD', 'Which branch you are on'],
            ['.git/refs/heads/main', 'The commit main points at'],
            ['.git/refs/remotes/origin/main', 'Your last-known origin/main'],
            ['.git/refs/tags/v1.0', 'The commit (or tag object) v1.0 names'],
          ],
          explain: 'Real repos also pack refs into <code>.git/packed-refs</code>, but the idea is the same: a name and an id.',
        },
        {
          id: 'in3-order', type: 'order',
          prompt: 'What git does when you add and commit a change, in order:',
          steps: ['git add stores the file\'s contents as a blob', 'git commit builds trees from the index, up to the root', 'It writes a commit pointing at the root tree and the parent', 'It writes the new commit id into .git/refs/heads/main'],
          explain: 'Moving the branch is the very last step: one small file write. That is why a commit is atomic.',
        },
        {
          id: 'in3-show-ref', type: 'learn', new: true, title: 'All refs at once',
          body: '<code>git show-ref</code> prints every ref with the id it holds, one per line: <code>&lt;id&gt; refs/heads/main</code>. <code>--heads</code> keeps only your local branches, <code>--tags</code> only tags. Same as reading the files under <code>.git/refs/</code> one by one.',
        },
        {
          id: 'in3-build', type: 'build',
          prompt: 'List only your local branches, each with the id it points at.',
          tiles: ['git', 'show-ref', '--heads', '--tags', 'branch', 'log'],
          answers: [['git', 'show-ref', '--heads']],
          explain: 'Each line is <code>&lt;id&gt; refs/heads/&lt;name&gt;</code>: exactly what the ref files contain.',
        },
        {
          id: 'in3-type-cat', type: 'type',
          prompt: 'Look at the raw files: print <code>.git/HEAD</code>, then the file for the branch it names.',
          setup: site,
          check: (r) => ranCmd(r, /^cat (\.\/)?\.git\/HEAD$/) && ranCmd(r, /^cat (\.\/)?\.git\/refs\/heads\/main$/),
          solution: 'cat .git/HEAD && cat .git/refs/heads/main',
          explain: 'HEAD names main, and main holds an id: the same one <code>git rev-parse HEAD</code> prints.',
        },
        {
          id: 'in3-type-detach', type: 'type',
          prompt: 'Point HEAD straight at the commit <b>before</b> main\'s tip, without any branch (detached).',
          setup: site,
          check: (r) => !r.s.head.branch && r.headId() === r.resolve('main~1') && r.s.branches.main === r.resolve('main'),
          solution: 'git switch --detach HEAD~1',
          explain: '<code>cat .git/HEAD</code> would now print an id instead of <code>ref: refs/heads/main</code>. <code>git switch main</code> re-attaches.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'internals-4', title: 'Why rewriting changes ids',
      exercises: [
        {
          id: 'in4-chain', type: 'learn', new: true, title: 'Rewrite means new commits',
          body: 'A commit\'s id covers its parent\'s id. Rebase gives commits new parents, so each gets a new id, and so does every commit after it. Amend, rebase, squash and cherry-pick all make new commits; the old ones stay until garbage collection.',
          demo: { setup: featureBehind, run: ['git rebase main'] },
        },
        {
          id: 'in4-graph', type: 'graph',
          prompt: 'You are on <code>feature</code>. Which graph does this give?',
          setup: featureBehind,
          command: 'git rebase main',
          distractors: [['git merge main'], ['git cherry-pick main']],
          explain: 'Two new commits on top of main; the originals fade (only the reflog remembers them). A merge would keep the originals and add a merge commit.',
        },
        {
          id: 'in4-count', type: 'choice',
          prompt: 'With <code>rebase -i</code> you reword the third-newest commit on your branch. How many commit ids change?',
          options: ['That commit and the two after it', 'Only that commit', 'Every commit in the repository', 'None, rewording keeps ids'],
          answer: 0,
          explain: 'The reworded commit gets a new id, so its child gets a new parent id, and so on up to the tip. Older commits are untouched.',
        },
        {
          id: 'in4-squash', type: 'choice',
          prompt: 'After a squash merge, <code>git branch -d feature</code> says "not fully merged", though main has all the changes. Why?',
          options: ['main got a new commit; feature\'s commit ids are not ancestors of main', 'Squash merges lose changes', 'The branch is still checked out', 'git never deletes merged branches'],
          answer: 0,
          explain: 'Git compares ids and ancestry, not file contents. Same changes, different commits.',
        },
        {
          id: 'in4-match', type: 'match',
          prompt: 'Match each command to what it does to ids.',
          pairs: [
            ['git commit --amend', 'Replaces the tip with a new id'],
            ['git rebase main', 'New ids for every replayed commit'],
            ['git cherry-pick abc1234', 'A copy with a new id on your branch'],
            ['git revert abc1234', 'Adds a new commit; old ids untouched'],
          ],
          explain: 'Only revert leaves existing history alone, which is why it is the safe undo for shared branches.',
        },
        {
          id: 'in4-fill', type: 'fill',
          prompt: 'After a rebase, the old commits are unreachable but not gone. Find their ids with:',
          before: 'git ', after: '',
          options: ['reflog', 'status', 'fetch', 'stash list'],
          answer: 0,
          explain: 'The reflog lists every position HEAD and each branch had. The old objects survive until garbage collection, weeks later.',
        },
        {
          id: 'in4-shared', type: 'choice',
          prompt: 'You rebase a branch a teammate already pulled, and force-push. What does the teammate\'s clone see?',
          options: ['Their branch and the remote have diverged: same changes, different ids', 'Nothing: their copy updates itself', 'Their commits are deleted', 'A merge conflict, immediately'],
          answer: 0,
          explain: 'They hold the old ids, the remote holds new ones. That is the golden rule: do not rewrite commits others have built on.',
        },
        {
          id: 'in4-type-amend', type: 'type',
          prompt: 'The last commit says <code>Add contcat page</code>. Fix the message to <code>Add contact page</code>. Then check: the tree id stays, the commit id changes.',
          setup: typo,
          check: (r) => msgAt(r, 'HEAD') === 'Add contact page' && msgAt(r, 'HEAD~1') === 'Add menu page' && r.headId() !== r.tryResolve('HEAD@{1}') && r.treeId('HEAD') === r.treeId('HEAD@{1}'),
          solution: 'git commit --amend -m "Add contact page"',
          explain: '<code>git rev-parse HEAD^{tree} HEAD@{1}^{tree}</code> prints the same id twice: same snapshot, new commit.',
        },
        {
          id: 'in4-type-rebase', type: 'type',
          prompt: 'You are on <code>feature</code>. Replay its two commits on top of <code>main</code>. Note the ids before and after with <code>git log --oneline</code>.',
          setup: featureBehind,
          check: (r) => r.branchName() === 'feature' && r.isAncestor(r.s.branches.main, r.s.branches.feature) && noMerges(r, 'main', 'feature') && msgAt(r, 'feature') === 'Add prices' && msgAt(r, 'feature~1') === 'Add menu page',
          solution: 'git rebase main',
          explain: 'Same messages, same changes, new parents, so new ids. Anyone holding the old ids now has a diverged copy.',
        },
      ],
    },
  ],
};
