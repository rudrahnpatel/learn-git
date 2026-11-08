// Unit 5: Stash & workflow. Park unfinished work, juggle stashes, tag releases, a feature end to end.
import { fileAt, has, clean, tagAt } from './helpers.js';

const chatWip = (r) => {
  r.setupCommit('Initial commit', { 'version.txt': '1.0.0', 'chat.js': '// chat' });
  r.sh('git switch -c chat');
  r.setupCommit('Start chat widget', { 'chat.js': '// chat widget v1' });
  r.setupFiles({ 'chat.js': '// chat widget v1\n// half-written emoji picker' });
};
const chatStashed = (r) => { chatWip(r); r.sh('git stash'); };
const twoStashes = (r) => {
  r.setupCommit('Initial commit', { 'theme.css': 'body { background: white; }', 'nav.html': '<nav>Home</nav>' });
  r.setupFiles({ 'theme.css': 'body { background: navy; }' });
  r.sh('git stash push -m "navy theme"');
  r.setupFiles({ 'nav.html': '<nav>Home | Blog</nav>' });
  r.sh('git stash push -m "blog link"');
};
const portfolio = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>My portfolio</h1>' });
  r.setupCommit('Add projects page', { 'projects.html': '<ul><li>Weather app</li></ul>' });
  r.setupCommit('Add contact form', { 'contact.html': '<form>hi</form>' });
};
const featureDone = (r) => {
  r.setupCommit('Initial commit', { 'index.html': '<h1>My portfolio</h1>' });
  r.sh('git switch -c gallery');
  r.setupCommit('Add photo gallery', { 'gallery.html': '<div class=grid></div>' });
  r.setupCommit('Lazy-load gallery images', { 'gallery.js': 'lazy()' });
};

export default {
  id: 'workflow', title: 'Stash & workflow', color: 'sky',
  blurb: 'Park unfinished work, juggle stashes, tag releases.',
  challenges: ['stash', 'stash-pick', 'tag'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'workflow-1', title: 'Pause and resume',
      exercises: [
        {
          id: 'wf1-stash', type: 'learn', new: true, title: 'git stash',
          body: 'Urgent fix, half-done feature? <code>git stash</code> shelves your uncommitted changes and leaves a clean tree. <code>git stash pop</code> puts them back and removes the entry; <code>git stash apply</code> puts them back but keeps it. <code>git stash list</code> shows the shelf.',
        },
        {
          id: 'wf1-refused', type: 'choice',
          prompt: 'You try <code>git switch main</code> and git says <i>"Your local changes to the following files would be overwritten by checkout"</i>. What is the quickest safe move?',
          options: ['git stash, then switch', 'git reset --hard, then switch', 'Delete the file, then switch', 'git switch -f main'],
          answer: 0,
          explain: 'Stash keeps your edits safe on a shelf. Reset and <code>-f</code> would throw them away.',
        },
        {
          id: 'wf1-match', type: 'match',
          prompt: 'Match each stash command to what it does.',
          pairs: [
            ['git stash', 'Shelve changes, clean the tree'],
            ['git stash pop', 'Re-apply the newest stash and remove it'],
            ['git stash apply', 'Re-apply the newest stash, keep it listed'],
            ['git stash list', 'Show every shelved stash'],
          ],
          explain: 'pop is apply plus drop. apply is handy when you want the same changes on more than one branch.',
        },
        {
          id: 'wf1-order', type: 'order',
          prompt: 'An urgent fix interrupts your chat feature. In order:',
          steps: ['git stash', 'git switch main', 'Fix the bug and commit', 'git switch chat', 'git stash pop'],
          explain: 'Shelve, go fix, come back, unshelve. Your half-written work never touches main.',
        },
        {
          id: 'wf1-fill-pop', type: 'fill',
          prompt: 'Re-apply your stash and remove it from the list.',
          before: 'git stash ', after: '',
          options: ['pop', 'apply', 'get', 'restore'],
          answer: 0,
          explain: '<code>apply</code> would bring the changes back too, but leave the entry in the list.',
        },
        {
          id: 'wf1-untracked', type: 'learn', new: true, title: 'New files need -u',
          body: 'Plain <code>git stash</code> only shelves tracked files; a brand-new file stays behind in your working tree. <code>git stash -u</code> (<code>--include-untracked</code>) takes untracked files along too. To find a stash later, label it: <code>git stash push -m "emoji picker"</code>.',
        },
        {
          id: 'wf1-build', type: 'build',
          prompt: 'Stash your work with a label so you can find it later.',
          tiles: ['git', 'stash', 'push', '-m', '"emoji picker"', 'pop', 'commit'],
          answers: [['git', 'stash', 'push', '-m', '"emoji picker"'], ['git', 'stash', '-m', '"emoji picker"']],
          explain: '<code>git stash</code> on its own means <code>git stash push</code>. The label shows up in <code>git stash list</code>.',
        },
        {
          id: 'wf1-type-stash', type: 'type',
          prompt: 'Your emoji picker is half-written in <code>chat.js</code>. Shelve it so your working tree is clean.',
          setup: chatWip,
          check: (r) => r.s.stash.length === 1 && clean(r) && !has(r.s.work['chat.js'], 'emoji'),
          solution: 'git stash',
          explain: 'Clean tree, nothing lost. <code>git stash list</code> shows the entry waiting for you.',
        },
        {
          id: 'wf1-u-choice', type: 'choice',
          prompt: 'You edited <code>chat.js</code> (tracked) and created <code>emoji.js</code> (new), then ran plain <code>git stash</code>. What is left in your working tree?',
          options: ['emoji.js', 'Nothing', 'chat.js with your edits', 'Both files'],
          answer: 0,
          explain: 'Untracked files are not stashed unless you ask with <code>-u</code>. That surprises a lot of people.',
        },
        {
          id: 'wf1-type-pop', type: 'type',
          prompt: 'The fix is done. Bring your stashed emoji picker back and remove it from the stash list.',
          setup: chatStashed,
          check: (r) => has(r.s.work['chat.js'], 'emoji') && r.s.stash.length === 0,
          solution: 'git stash pop',
          explain: 'Back where you left off, and the stash list is empty again.',
        },
        {
          id: 'wf1-type-u', type: 'type',
          prompt: 'You edited <code>chat.js</code> and created a new <code>emoji.js</code>. Stash <b>both</b>.',
          setup: (r) => { chatWip(r); r.setupFiles({ 'emoji.js': 'export const faces = ["🙂"]' }); },
          check: (r) => r.s.stash.length === 1 && clean(r) && r.untracked().length === 0,
          solution: 'git stash -u',
          explain: 'With <code>-u</code> the new file went onto the shelf too, so the tree is spotless.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'workflow-2', title: 'Juggling stashes',
      exercises: [
        {
          id: 'wf2-stack', type: 'learn', new: true, title: 'A stack of stashes',
          body: 'Stashes pile up like plates. The newest is <code>stash@{0}</code>, the one before is <code>stash@{1}</code>. Every stash command takes these names: <code>git stash show -p stash@{1}</code> shows what is inside, <code>git stash drop stash@{1}</code> deletes it. <code>git stash clear</code> deletes them all.',
        },
        {
          id: 'wf2-newest', type: 'choice',
          prompt: 'Which entry is the most recent stash?',
          code: 'stash@{0}: On main: blog link\nstash@{1}: On main: navy theme\nstash@{2}: WIP on main: 3f2a1b9 Initial commit',
          options: ['stash@{0}: blog link', 'stash@{2}', 'stash@{1}: navy theme', 'They have no order'],
          answer: 0,
          explain: 'New stashes go on top as <code>stash@{0}</code> and push the others down by one.',
        },
        {
          id: 'wf2-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git stash show -p stash@{1}', 'See the changes inside stash@{1}'],
            ['git stash pop stash@{1}', 'Apply stash@{1} and remove it'],
            ['git stash drop stash@{1}', 'Delete stash@{1} without applying'],
            ['git stash clear', 'Delete every stash'],
          ],
          explain: 'Peek with show before you pop, especially when the labels are just "WIP on main".',
        },
        {
          id: 'wf2-fill', type: 'fill',
          prompt: 'Apply the navy theme, which is the second stash in the list.',
          before: 'git stash pop ', after: '',
          options: ['stash@{1}', 'stash@{2}', 'stash@{0}', 'stash~1'],
          answer: 0,
          explain: 'Counting starts at zero, so the second entry is <code>stash@{1}</code>.',
        },
        {
          id: 'wf2-conflict', type: 'learn', new: true, title: 'When pop conflicts',
          body: 'If a stash touches lines that changed since you made it, pop stops with conflict markers, like a merge. The stash entry is <b>kept</b> so nothing is lost. Resolve, then <code>git stash drop</code> it yourself.',
        },
        {
          id: 'wf2-kept', type: 'choice',
          prompt: '<code>git stash pop</code> hit a conflict. What happened to the stash entry?',
          options: ['It is still in the list', 'It was deleted', 'It was turned into a commit', 'It moved to stash@{1}'],
          answer: 0,
          explain: 'Git only drops a stash after a clean apply. After resolving, drop it so it does not linger.',
        },
        {
          id: 'wf2-build', type: 'build',
          prompt: 'Show the full diff inside <code>stash@{1}</code>.',
          tiles: ['git', 'stash', 'show', '-p', 'stash@{1}', 'stash@{0}', 'pop'],
          answers: [['git', 'stash', 'show', '-p', 'stash@{1}'], ['git', 'stash', 'show', 'stash@{1}', '-p']],
          explain: 'Without <code>-p</code> you only get a summary of which files changed.',
        },
        {
          id: 'wf2-type-drop', type: 'type',
          prompt: 'You have two stashes. The older one, "navy theme", is no longer needed. Delete it and keep "blog link".',
          setup: twoStashes,
          check: (r) => r.s.stash.length === 1 && has(r.s.stash[0].msg, 'blog link'),
          solution: 'git stash drop stash@{1}',
          explain: 'The blog link stash is now alone at <code>stash@{0}</code>.',
        },
        {
          id: 'wf2-order', type: 'order',
          prompt: 'Find and restore the right stash among several.',
          steps: ['git stash list', 'git stash show -p stash@{1}', 'git stash pop stash@{1}'],
          explain: 'List, peek, then pop. Popping the wrong one is harmless but annoying.',
        },
        {
          id: 'wf2-type-apply', type: 'type',
          prompt: 'Apply the "navy theme" stash (the older one) to your working tree, but keep it in the list for another branch later.',
          setup: twoStashes,
          check: (r) => has(r.s.work['theme.css'], 'navy') && r.s.stash.length === 2,
          solution: 'git stash apply stash@{1}',
          explain: '<code>apply</code> leaves the entry in place, so you can apply it again somewhere else.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'workflow-3', title: 'Tags and releases',
      exercises: [
        {
          id: 'wf3-tag', type: 'learn', new: true, title: 'Tags never move',
          body: 'A tag is a label fixed to one commit, perfect for releases like <code>v1.0</code>. Unlike a branch, it does not move when you commit. An <b>annotated</b> tag (<code>-a -m</code>) also stores a message, author and date.',
          demo: { setup: portfolio, run: ['git tag v1.0'] },
        },
        {
          id: 'wf3-graph', type: 'graph',
          prompt: 'Mark the newest portfolio commit as a release. Which graph?',
          setup: portfolio,
          command: 'git tag v1.0',
          distractors: [['git branch v1.0'], ['git tag v1.0 HEAD~1']],
          explain: 'A tag label on HEAD. A branch called v1.0 would look similar, but it would move as soon as you committed on it.',
        },
        {
          id: 'wf3-vs-branch', type: 'choice',
          prompt: 'You tag a commit <code>v1.0</code>, then make three more commits. Where is v1.0?',
          options: ['Still on the commit you tagged', 'On the newest commit', 'Deleted', 'Three commits ahead'],
          answer: 0,
          explain: 'That is the whole point of a tag: v1.0 means the same code forever.',
        },
        {
          id: 'wf3-share', type: 'learn', new: true, title: 'Sharing and managing tags',
          body: 'A plain <code>git push</code> leaves tags behind. Send one with <code>git push origin v1.0</code>, or all of them with <code>git push origin --tags</code>. Tag an older commit by naming it: <code>git tag v0.9 HEAD~1</code>. <code>git tag -d v0.9</code> deletes a local tag.',
          demo: { setup: (r) => { portfolio(r); r.setupRemote(); }, run: ['git tag v1.0', 'git push origin v1.0'] },
        },
        {
          id: 'wf3-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git tag v1.0', 'Lightweight tag at HEAD'],
            ['git tag -a v1.0 -m "First release"', 'Annotated tag with a message'],
            ['git push origin v1.0', 'Share one tag with the remote'],
            ['git tag -d v1.0', 'Delete a local tag'],
          ],
          explain: 'Use annotated tags for releases: <code>git show v1.0</code> then tells you who tagged it, when and why.',
        },
        {
          id: 'wf3-fill', type: 'fill',
          prompt: 'Push all your tags at once.',
          before: 'git push origin ', after: '',
          options: ['--tags', '--all', 'tags', '-t'],
          answer: 0,
          explain: '<code>--all</code> pushes all branches, not tags. <code>--tags</code> pushes every tag.',
        },
        {
          id: 'wf3-push-alone', type: 'choice',
          prompt: 'You created <code>v1.0</code> and ran plain <code>git push</code>. Can teammates see the tag?',
          options: ['No, tags are not pushed by default', 'Yes, push always sends tags', 'Only annotated tags', 'Only after they pull twice'],
          answer: 0,
          explain: 'Push them explicitly with <code>git push origin v1.0</code> or <code>git push --tags</code>.',
        },
        {
          id: 'wf3-build', type: 'build',
          prompt: 'Tag the commit before HEAD as <code>v1.0</code>.',
          tiles: ['git', 'tag', 'v1.0', 'HEAD~1', 'branch', 'HEAD~2'],
          answers: [['git', 'tag', 'v1.0', 'HEAD~1']],
          explain: 'Name first, then the commit. You can tag any commit in history, not just HEAD.',
        },
        {
          id: 'wf3-type-annotated', type: 'type',
          prompt: 'Release time. Create an annotated tag <code>v1.0</code> at HEAD with the message <code>First release</code>.',
          setup: portfolio,
          check: (r) => tagAt(r, 'v1.0') === r.headId() && has(r.s.tags['v1.0'].msg, 'First release'),
          solution: 'git tag -a v1.0 -m "First release"',
          explain: 'Try <code>git show v1.0</code>: the tag message appears above the commit.',
        },
        {
          id: 'wf3-type-push', type: 'type',
          prompt: 'Tag HEAD as <code>v1.1</code> and share that tag with origin.',
          setup: (r) => { portfolio(r); r.setupRemote(); },
          check: (r) => tagAt(r, 'v1.1') === r.headId() && r.s.remote.tags['v1.1']?.id === r.headId(),
          solution: 'git tag v1.1 && git push origin v1.1',
          explain: 'Now anyone can fetch v1.1 and get exactly this code.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'workflow-4', title: 'A feature, start to finish',
      exercises: [
        {
          id: 'wf4-flow', type: 'learn', new: true, title: 'The feature-branch loop',
          body: 'Branch off main, commit small steps, switch back to main, merge, delete the branch. Repeat. Each idea lives on its own branch until it is ready, so main always works.',
          demo: { setup: featureDone, run: ['git switch main', 'git merge gallery', 'git branch -d gallery'] },
        },
        {
          id: 'wf4-order', type: 'order',
          prompt: 'Build a photo gallery the tidy way.',
          steps: ['git switch -c gallery', 'Commit the gallery in small steps', 'git switch main', 'git merge gallery', 'git branch -d gallery'],
          explain: 'Start from main, finish on main. The branch label is temporary; the commits stay.',
        },
        {
          id: 'wf4-graph', type: 'graph',
          prompt: 'You are on <code>gallery</code>, two commits ahead of main. Which graph?',
          setup: featureDone,
          command: 'git switch main && git merge gallery',
          distractors: [['git merge main'], ['git switch main', 'git merge --no-ff gallery']],
          explain: 'main has not moved, so the merge fast-forwards. Merging main into gallery does nothing here: gallery already contains main.',
        },
        {
          id: 'wf4-carry', type: 'learn', new: true, title: 'Edits travel with you',
          body: 'Uncommitted changes are not on any branch yet. Switch branches and they come along, as long as the other branch does not change those same files. Started on the wrong branch? Just switch before you commit.',
        },
        {
          id: 'wf4-wrong-start', type: 'choice',
          prompt: 'You edited <code>app.js</code> on main, then realised it belongs on a new branch. Nothing is committed. What do you run?',
          options: ['git switch -c toggle, then commit', 'git stash, git reset --hard, then start over', 'git commit, then git revert', 'Copy the file somewhere, then delete it'],
          answer: 0,
          explain: 'Your edits come along to the new branch, and main never sees them.',
        },
        {
          id: 'wf4-match', type: 'match',
          prompt: 'Match each habit to why it helps.',
          pairs: [
            ['Small commits', 'Easy to review, revert and bisect'],
            ['git status before committing', 'No surprise files in the commit'],
            ['A branch per idea', 'main always works'],
            ['Delete merged branches', 'git branch stays readable'],
          ],
          explain: 'None of these are rules git enforces, but every one of them saves you time later.',
        },
        {
          id: 'wf4-fill', type: 'fill',
          prompt: 'Merge only if main can simply slide forward, never creating a merge commit.',
          before: 'git merge ', after: ' gallery',
          options: ['--ff-only', '--no-ff', '--squash', '--abort'],
          answer: 0,
          explain: '<code>--ff-only</code> refuses if the branches diverged, so you notice and can rebase first.',
        },
        {
          id: 'wf4-build', type: 'build',
          prompt: 'Go to main and merge <code>gallery</code>, as one line.',
          tiles: ['git', 'switch', 'main', '&&', 'git', 'merge', 'gallery', 'rebase', 'push'],
          answers: [['git', 'switch', 'main', '&&', 'git', 'merge', 'gallery']],
          explain: '<code>&amp;&amp;</code> only runs the merge if the switch succeeded, so you never merge into the wrong branch.',
        },
        {
          id: 'wf4-type-move-edit', type: 'type',
          prompt: 'You started a dark-mode toggle on main (uncommitted). Move the edit to a new branch <code>dark-toggle</code> and commit it there.',
          setup: (r) => { r.setupCommit('Initial commit', { 'app.js': 'render()' }); r.setupFiles({ 'app.js': 'render()\naddToggle("dark")' }); },
          check: (r) => r.branchName() === 'dark-toggle' && has(fileAt(r, 'dark-toggle', 'app.js'), 'dark') && !has(fileAt(r, 'main', 'app.js'), 'dark') && clean(r),
          solution: 'git switch -c dark-toggle && git commit -am "Add dark mode toggle"',
          explain: 'main stays clean, and the toggle has its own branch.',
        },
        {
          id: 'wf4-type-land', type: 'type',
          prompt: 'The gallery is done. Land <code>gallery</code> on main and delete the branch.',
          setup: featureDone,
          check: (r) => !('gallery' in r.s.branches) && fileAt(r, 'main', 'gallery.js') !== undefined && r.branchName() === 'main',
          solution: 'git switch main && git merge gallery && git branch -d gallery',
          explain: 'One feature, start to finish. The gallery commits now live on main.',
        },
      ],
    },
  ],
};
