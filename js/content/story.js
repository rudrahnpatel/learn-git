// Unit 10: Story, "Ship the bakery site". One project across five lessons with a simulated
// teammate. Each lesson's repos continue from the previous lesson's end state: the builders below
// form one chain (day0 -> committed -> founded -> withHours -> ... -> released), so every exercise
// starts exactly where the story left off. Teammate messages are learn cards ("<b>Teammate:</b> …").
import { fileAt, has, msgAt, pushed, ran, tagAt, markerFree, linesOf } from './helpers.js';

const URL = 'https://github.com/crumb-co/bakery-site.git';
const idx = (nav) => `<h1>Crumb Bakery</h1>\n<nav>${nav}</nav>\n<p>Open 7-15</p>`;
const MENU = '<h2>Menu</h2>\nrye loaf 4\ncinnamon roll 2';

/* ------------------------------------------------ the story, as a chain of states */
// Lesson 1: an empty GitHub repo as origin, the scaffold in the working tree, macOS junk included
const day0 = (r) => {
  r.setupRemote();
  r.s.remote.url = URL;
  r.setupFiles({ 'index.html': '<h1>Crumb Bakery</h1>\n<nav>Home</nav>', 'style.css': 'body { font-family: serif; }', '.DS_Store': 'Finder junk' });
};
const committed = (r) => { day0(r); r.sh('echo ".DS_Store" > .gitignore'); r.sh('git add .'); r.sh('git commit -m "Scaffold bakery site"'); };
const founded = (r) => { committed(r); r.sh('git push -u origin main'); };
// Lesson 2: hours on main, then the order form on a branch
const withHours = (r) => { founded(r); r.sh('echo "<p>Open 7-15</p>" >> index.html'); r.sh('git commit -am "Add opening hours"'); r.sh('git push'); };
const formWritten = (r) => { withHours(r); r.sh('git switch -c order-form'); r.setupFiles({ 'order.html': '<form>cake, quantity, pickup day</form>' }); };
const formCommitted = (r) => { formWritten(r); r.sh('git add order.html'); r.sh('git commit -m "Add order form"'); };
const formPushed = (r) => { formCommitted(r); r.sh('git push -u origin order-form'); };
const navEdited = (r) => { formPushed(r); r.setupFiles({ 'index.html': idx('Home Order') }); };
const featureDone = (r) => { navEdited(r); r.sh('git commit -am "Link order form in nav"'); r.sh('git push'); };
// Lesson 3: the teammate pushed to main meanwhile, touching the same nav line
const teamPushed = (r) => {
  featureDone(r);
  r.teammatePush('main', 'Add menu page', { 'menu.html': MENU });
  r.teammatePush('main', 'Link menu in nav', { 'index.html': idx('Home Menu') });
};
const teamFetched = (r) => { teamPushed(r); r.sh('git fetch'); };
const midRebase = (r) => {
  teamFetched(r);
  r.run('git rebase origin/main'); // stops on the nav conflict, by design
  if (r.s.seq?.kind !== 'rebase') throw new Error('story: expected the rebase to stop on a conflict');
};
const navFixed = (r) => { midRebase(r); r.setupFiles({ 'index.html': idx('Home Menu Order') }); }; // resolved in the editor, not added yet
const rebased = (r) => { navFixed(r); r.sh('git add index.html'); r.sh('git rebase --continue'); };
const rebasedPushed = (r) => { rebased(r); r.sh('git push --force-with-lease'); };
// Lesson 4: the PR is merged (merge commit) and the branch deleted; a week later a bug has shipped
const prMerged = (r) => { rebasedPushed(r); r.mergePullRequest('order-form', { how: 'merge', number: 3, title: 'Online cake orders', deleteBranch: true }); };
const cleanedUp = (r) => { prMerged(r); r.sh('git switch main'); r.sh('git pull --prune'); r.sh('git branch -d order-form'); };
const bugShipped = (r) => {
  cleanedUp(r);
  r.s.bugMarker = 'price + qty';
  r.setupCommit('Add order total', { 'order.js': 'total = price * qty' });
  r.setupCommit('Add cake photos', { 'photos.html': '<img src=cake.jpg>' }, 'teammate');
  r.setupCommit('Round prices for display', { 'order.js': 'total = price + qty // rounded' });
  r.setupCommit('Add delivery note', { 'order.html': '<form>cake, quantity, pickup day</form>\n<p>Delivery Fri only</p>' }, 'teammate');
  r.setupCommit('Tidy styles', { 'style.css': 'body { font-family: serif; margin: 0 auto; }' });
  r.setupCommit('Add gluten-free tag', { 'menu.html': '<h2>Menu</h2>\nrye loaf 4 (GF)\ncinamon roll 2' }, 'teammate');
  r.sh('git push');
};
// Lesson 5: fixed, then release day
const fixed = (r) => { bugShipped(r); r.sh('git revert --no-edit HEAD~3'); r.sh('git push'); };
const releaseDay = (r) => { fixed(r); r.teammatePush('main', 'Update footer year', { 'footer.html': '<footer>2026 Crumb Bakery</footer>' }); };
const releaseReady = (r) => { releaseDay(r); r.sh('git pull'); };
const released = (r) => { releaseReady(r); r.sh('git tag -a v1.0 -m "First release"'); r.sh('git push origin v1.0'); };
const typoFixed = (r) => { released(r); r.setupFiles({ 'menu.html': '<h2>Menu</h2>\nrye loaf 4 (GF)\ncinnamon roll 2' }); };

// the resolved index.html: the heading, ONE nav with Home first and both new links, the hours
const navResolved = (r) => {
  const l = linesOf(r, 'index.html');
  const nav = l.length === 3 && /^<nav>(.*)<\/nav>$/.exec(l[1]);
  const links = nav ? nav[1].trim().split(/\s+/) : [];
  return l[0] === '<h1>Crumb Bakery</h1>' && l[2] === '<p>Open 7-15</p>' && links.length === 3 && links[0] === 'Home' && links.includes('Menu') && links.includes('Order');
};
const leasedOnly = (r) => ran(r, /--force-with-lease/) && !ran(r, /push.*(\s--force(\s|$)|\s-f(\s|$))/);

export default {
  id: 'story', title: 'Story: Ship the bakery site', color: 'yellow',
  blurb: 'One project, start to finish, with a teammate: branch, conflict, rebase, bisect, release.',
  challenges: ['bakery-launch', 'bakery-hotfix'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'story-1', title: 'Day one',
      exercises: [
        {
          id: 'st1-hello', type: 'learn', title: 'A message from your teammate',
          body: '<b>Teammate:</b> Welcome aboard! I made <code>crumb-co/bakery-site</code> on GitHub and it\'s already your <code>origin</code>, but it\'s empty. Commit your scaffold and push <code>main</code>. And please don\'t commit that <code>.DS_Store</code> file again.',
        },
        {
          id: 'st1-ignore', type: 'choice',
          prompt: 'Your folder has <code>index.html</code>, <code>style.css</code> and <code>.DS_Store</code> (Finder junk). What keeps the junk out of every future commit?',
          options: ['A .gitignore file listing .DS_Store, committed', 'Remembering not to git add it', 'Deleting it once', 'git rm --cached .DS_Store'],
          answer: 0,
          explain: 'An ignore rule protects every future <code>git add .</code>, for you and for your teammate.',
        },
        {
          id: 'st1-fill', type: 'fill',
          prompt: 'Write the ignore rule.',
          before: 'echo ".DS_Store" > ', after: '',
          options: ['.gitignore', '.git', 'README.md', '.gitkeep'],
          answer: 0,
          explain: 'Commit <code>.gitignore</code> itself, so the rule travels with the repo.',
        },
        {
          id: 'st1-type-scaffold', type: 'type',
          prompt: 'Ignore <code>.DS_Store</code>, then stage everything else and make the first commit, <code>Scaffold bakery site</code>.',
          setup: day0,
          check: (r) => !!r.headId() && has(fileAt(r, 'HEAD', '.gitignore'), '.DS_Store') && fileAt(r, 'HEAD', '.DS_Store') === undefined && fileAt(r, 'HEAD', 'index.html') !== undefined && fileAt(r, 'HEAD', 'style.css') !== undefined && r.untracked().length === 0 && r.isClean(),
          solution: 'echo ".DS_Store" > .gitignore && git add . && git commit -m "Scaffold bakery site"',
          explain: 'With the rule in place, <code>git add .</code> skipped the junk and took everything else, .gitignore included.',
        },
        {
          id: 'st1-order', type: 'order',
          prompt: 'From a folder of files to a published main, in order:',
          steps: ['echo ".DS_Store" > .gitignore', 'git add .', 'git commit -m "Scaffold bakery site"', 'git push -u origin main'],
          explain: 'Ignore first, so the junk never reaches the index.',
        },
        {
          id: 'st1-build', type: 'build',
          prompt: 'Publish main to the empty origin, and remember it as main\'s upstream.',
          tiles: ['git', 'push', '-u', 'origin', 'main', '--force', 'pull', 'upstream'],
          answers: [['git', 'push', '-u', 'origin', 'main'], ['git', 'push', 'origin', 'main', '-u'], ['git', 'push', 'origin', '-u', 'main']],
          explain: 'After this, plain <code>git push</code> and <code>git pull</code> know where to go.',
        },
        {
          id: 'st1-type-push', type: 'type',
          prompt: 'Push <code>main</code> to the empty origin and set it as the upstream.',
          setup: committed,
          check: (r) => pushed(r) && r.s.upstream.main === 'main',
          solution: 'git push -u origin main',
          explain: 'origin/main appears on your commit. The teammate can clone now.',
        },
        {
          id: 'st1-hours', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> It\'s live, thanks! Tiny one: can you add <code>&lt;p&gt;Open 7-15&lt;/p&gt;</code> to the bottom of the homepage? Straight on main is fine for this.',
        },
        {
          id: 'st1-match', type: 'match',
          prompt: 'Match each day-one command to its job.',
          pairs: [
            ['git add .', 'Stage every new and changed file'],
            ['git commit -am "…"', 'Stage tracked changes and commit'],
            ['git push', 'Send main to its upstream'],
            ['git status', 'Check what is staged, changed or untracked'],
          ],
          explain: '<code>-a</code> only picks up files git already tracks. New files still need <code>git add</code>.',
        },
        {
          id: 'st1-type-hours', type: 'type',
          prompt: 'Append <code>&lt;p&gt;Open 7-15&lt;/p&gt;</code> to <code>index.html</code>, commit it as <code>Add opening hours</code>, and push.',
          setup: founded,
          check: (r) => has(fileAt(r, 'origin/main', 'index.html'), 'Open 7-15') && has(fileAt(r, 'origin/main', 'index.html'), 'Crumb Bakery') && pushed(r),
          solution: 'echo "<p>Open 7-15</p>" >> index.html && git commit -am "Add opening hours" && git push',
          explain: '<code>&gt;&gt;</code> appends (one <code>&gt;</code> would have replaced the whole page). The hours are on the live site.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'story-2', title: 'The order form',
      exercises: [
        {
          id: 'st2-brief', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> Customers keep phoning in cake orders. Could you build an online order form? Do it on a branch, <code>order-form</code>, so main stays deployable. I\'ll work on a menu page on main meanwhile.',
        },
        {
          id: 'st2-why', type: 'choice',
          prompt: 'Why build the order form on a branch?',
          options: ['main stays deployable while the form is half-done', 'Branches make the site faster', 'GitHub only accepts branches', 'Commits on main cannot be pushed'],
          answer: 0,
          explain: 'A branch is cheap. Your unfinished work and the teammate\'s main can move independently, and meet in a PR.',
        },
        {
          id: 'st2-type-branch', type: 'type',
          prompt: 'Create the <code>order-form</code> branch and switch to it.',
          setup: withHours,
          check: (r) => r.branchName() === 'order-form' && r.s.branches['order-form'] === r.s.branches.main,
          solution: 'git switch -c order-form',
          explain: 'One new label on the current commit, and HEAD now follows it.',
        },
        {
          id: 'st2-type-commit', type: 'type',
          prompt: 'You wrote <code>order.html</code> (untracked). Commit it as <code>Add order form</code> and push the branch with an upstream.',
          setup: formWritten,
          check: (r) => fileAt(r, 'origin/order-form', 'order.html') !== undefined && r.s.remote.branches['order-form'] === r.s.branches['order-form'] && r.s.upstream['order-form'] === 'order-form' && fileAt(r, 'main', 'order.html') === undefined,
          solution: 'git add order.html && git commit -m "Add order form" && git push -u origin order-form',
          explain: 'The branch is on GitHub, so the teammate can look, and GitHub offers to open a pull request.',
        },
        {
          id: 'st2-graph', type: 'graph',
          prompt: 'You committed the form on <code>order-form</code>. Which graph does this give?',
          setup: formCommitted,
          command: 'git push -u origin order-form',
          distractors: [['git push origin main'], ['git switch main', 'git merge order-form']],
          explain: 'origin/order-form appears on your commit. Main was already up to date, and merging it now would put an unfinished form on main.',
        },
        {
          id: 'st2-nav', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> Looks great! Can you link the form from the homepage nav too? Same branch is fine. The PR will show both commits.',
        },
        {
          id: 'st2-amla', type: 'choice',
          prompt: 'You already pushed <code>Add order form</code>. Should you add the nav link with <code>git commit --amend</code>?',
          options: ['No: a new commit; amending would rewrite a pushed commit', 'Yes, amending is always cleaner', 'Yes, then push normally', 'No: you need a new branch'],
          answer: 0,
          explain: 'A new commit pushes normally. Amending would need a force-push, for no real gain.',
        },
        {
          id: 'st2-fill', type: 'fill',
          prompt: 'Commit the change to the tracked <code>index.html</code> without a separate <code>git add</code>.',
          before: 'git commit ', after: ' "Link order form in nav"',
          options: ['-am', '-m', '--amend -m', '-a'],
          answer: 0,
          explain: '<code>-a</code> stages tracked changes, <code>-m</code> takes the message. Together: <code>-am</code>.',
        },
        {
          id: 'st2-type-nav', type: 'type',
          prompt: 'You already edited the nav in <code>index.html</code>. Commit it as <code>Link order form in nav</code> and push.',
          setup: navEdited,
          check: (r) => has(fileAt(r, 'origin/order-form', 'index.html'), 'Home Order') && pushed(r, 'order-form') && msgAt(r, 'order-form~1') === 'Add order form',
          solution: 'git commit -am "Link order form in nav" && git push',
          explain: 'Two commits on the branch, both on GitHub. Plain push worked because <code>-u</code> set the upstream earlier.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'story-3', title: 'Collision',
      exercises: [
        {
          id: 'st3-msg', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> Menu page is on main, and I added it to the nav. Heads up, I think we both edited that nav line. Bring your branch up to date before the PR is merged!',
        },
        {
          id: 'st3-type-fetch', type: 'type',
          prompt: 'See what the teammate pushed, without changing any of your branches yet.',
          setup: teamPushed,
          check: (r) => r.s.tracking.main === r.s.remote.branches.main && msgAt(r, 'main') === 'Add opening hours' && msgAt(r, 'order-form') === 'Link order form in nav',
          solution: 'git fetch',
          explain: 'origin/main jumped two commits ahead. <code>git log main..origin/main</code> lists them.',
        },
        {
          id: 'st3-graph', type: 'graph',
          prompt: 'You are on <code>order-form</code>. Which graph does this give?',
          setup: teamPushed,
          command: 'git fetch',
          distractors: [['git switch main', 'git pull']],
          explain: 'Only origin/main moves. Switching to main and pulling would also move main and HEAD.',
        },
        {
          id: 'st3-onto', type: 'choice',
          prompt: 'You want <code>order-form</code> to sit on top of the teammate\'s work, in a straight line. What do you run (on order-form)?',
          options: ['git rebase origin/main', 'git rebase main', 'git merge order-form', 'git push --force'],
          answer: 0,
          explain: 'Your local main has not pulled the new commits; <code>origin/main</code> has them.',
        },
        {
          id: 'st3-conflict', type: 'learn', title: 'Conflict mid-rebase',
          body: 'Rebase replays your commits one by one. <code>Add order form</code> applies cleanly; <code>Link order form in nav</code> touches the line the teammate changed, so git stops. Fix the file, <code>git add</code> it, then <code>git rebase --continue</code>.',
        },
        {
          id: 'st3-ours', type: 'choice', needs: ['rebase sides swap'],
          prompt: 'During this rebase, the conflict shows <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code> first. Whose version is that?',
          options: ['The teammate\'s (origin/main), which you are replaying onto', 'Yours, from order-form', 'The common ancestor', 'Whichever was committed last'],
          answer: 0,
          explain: 'In a rebase, HEAD is the new base plus the commits replayed so far. Your commit is the incoming side, the reverse of a merge.',
        },
        {
          id: 'st3-type-resolve', type: 'resolve',
          prompt: 'The rebase stopped on the nav. Keep both links in one nav: <code>&lt;nav&gt;Home Menu Order&lt;/nav&gt;</code>.',
          setup: midRebase, file: 'index.html',
          check: (r) => markerFree(r) && navResolved(r),
          solution: '<h1>Crumb Bakery</h1>\n<nav>Home Menu Order</nav>\n<p>Open 7-15</p>',
          explain: '"Keep both" would give two nav bars. Some conflicts need a hand edit: one line with the teammate\'s Menu link and your Order link.',
        },
        {
          id: 'st3-type-continue', type: 'type',
          prompt: '<code>index.html</code> is fixed. Mark it resolved and finish the rebase.',
          setup: navFixed,
          check: (r) => !r.inProgress() && r.branchName() === 'order-form' && has(fileAt(r, 'order-form', 'index.html'), 'Menu') && has(fileAt(r, 'order-form', 'index.html'), 'Order') && markerFree(r) && r.isAncestor(r.s.tracking.main, r.s.branches['order-form']) && msgAt(r, 'order-form') === 'Link order form in nav',
          solution: 'git add index.html && git rebase --continue',
          explain: 'Both commits now sit on top of the teammate\'s work, with new ids. The pushed copies are the old ones.',
        },
        {
          id: 'st3-match', type: 'match',
          prompt: 'Match each command to what it does mid-rebase.',
          pairs: [
            ['git add index.html', 'Mark the conflict resolved'],
            ['git rebase --continue', 'Commit the fix and replay the rest'],
            ['git rebase --abort', 'Go back to before the rebase'],
            ['git rebase --skip', 'Drop the commit that conflicts'],
          ],
          explain: '<code>--abort</code> is always safe: your branch returns exactly to where it was.',
        },
        {
          id: 'st3-order', type: 'order',
          prompt: 'The whole collision, in order:',
          steps: ['git fetch', 'git rebase origin/main', 'Fix index.html, then git add index.html', 'git rebase --continue', 'git push --force-with-lease'],
          explain: 'Fetch, replay, resolve, continue, push with a lease: the standard "my PR is out of date" routine.',
        },
        {
          id: 'st3-type-push', type: 'type',
          prompt: 'The rebase rewrote your two pushed commits. Update <code>origin/order-form</code> the safe way.',
          setup: rebased,
          check: (r) => r.s.remote.branches['order-form'] === r.s.branches['order-form'] && leasedOnly(r),
          solution: 'git push --force-with-lease',
          explain: 'The lease checked nobody had pushed to your branch since your fetch. The PR now shows a clean, conflict-free branch.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'story-4', title: 'A bug ships',
      exercises: [
        {
          id: 'st4-merged', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> Merged your PR (merge commit) and deleted the branch on GitHub. Online orders are live! Can you tidy up your clone?',
        },
        {
          id: 'st4-type-cleanup', type: 'type',
          prompt: 'Switch to <code>main</code>, pull the merge while pruning the deleted <code>origin/order-form</code>, and delete your local <code>order-form</code>.',
          setup: prMerged,
          check: (r) => r.branchName() === 'main' && r.s.branches.main === r.s.remote.branches.main && !('order-form' in r.s.branches) && !('order-form' in r.s.tracking),
          solution: 'git switch main && git pull --prune && git branch -d order-form',
          explain: 'Lower-case <code>-d</code> was enough: with a merge commit, your commits are ancestors of main.',
        },
        {
          id: 'st4-why-d', type: 'choice',
          prompt: 'Why did <code>git branch -d</code> work here, when it can fail after a squash merge?',
          options: ['The merge commit made your commits ancestors of main', 'Pruning forces the delete', 'The branch had only two commits', '-d never checks anything'],
          answer: 0,
          explain: 'After a squash, main has a new commit instead of yours, so -d sees "not fully merged" and you need -D.',
        },
        {
          id: 'st4-bug', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> Help! A customer ordered 3 rolls at 2 each and was charged 5. The total was right when you added it in <code>Add order total</code>, five commits ago. <code>./run-tests</code> catches it.',
        },
        {
          id: 'st4-start', type: 'learn', new: true, title: 'bisect start bad good',
          body: '<code>git bisect start HEAD HEAD~5</code> marks the bad and the good commit in one go. <code>git bisect run ./run-tests</code> then tests the middle commit, halves the range and repeats, until it names the first bad commit.',
        },
        {
          id: 'st4-fill', type: 'fill',
          prompt: 'Let git test each step for you.',
          before: 'git bisect run ', after: '',
          options: ['./run-tests', 'git status', 'HEAD~5', 'good'],
          answer: 0,
          explain: 'Exit code 0 means good, 1 to 127 (except 125) means bad. Any test script works.',
        },
        {
          id: 'st4-type-bisect', type: 'type',
          prompt: 'Find the commit that broke the total: HEAD is bad, <code>HEAD~5</code> (<code>Add order total</code>) was good. Let the tests decide.',
          setup: bugShipped,
          check: (r) => !!r.s.bisect?.found && r.s.bisect.found === r.resolve('main~3'),
          solution: 'git bisect start HEAD HEAD~5 && git bisect run ./run-tests',
          explain: 'The culprit is <code>Round prices for display</code>: "rounding" turned <code>*</code> into <code>+</code>. Three test runs instead of up to five.',
        },
        {
          id: 'st4-undo', type: 'choice',
          prompt: 'The culprit is three commits below main, and main is pushed. How do you undo it?',
          options: ['git revert it: a new commit that undoes it, history kept', 'git reset --hard to before it', 'Rebase it out and force-push main', 'Delete order.js'],
          answer: 0,
          explain: 'main is shared. Revert adds an undo commit on top, so nobody\'s clone breaks.',
        },
        {
          id: 'st4-graph', type: 'graph',
          prompt: 'After <code>git bisect reset</code>, you are back on main. Which graph does this give?',
          setup: bugShipped,
          command: 'git revert --no-edit HEAD~3',
          distractors: [['git reset --hard HEAD~4']],
          explain: 'One new commit on top; everything else stays. The reset would drop four commits, three of them good ones.',
        },
        {
          id: 'st4-match', type: 'match',
          prompt: 'Match each bisect command to its job.',
          pairs: [
            ['git bisect start HEAD HEAD~5', 'Start, with bad and good given'],
            ['git bisect run ./run-tests', 'Let the tests judge every step'],
            ['git bisect good', 'This commit works'],
            ['git bisect reset', 'Stop and go back to your branch'],
          ],
          explain: 'Always reset when done: bisect leaves you on a detached HEAD in the middle of history.',
        },
        {
          id: 'st4-type-revert', type: 'type',
          prompt: 'Revert <code>Round prices for display</code> (it is <code>HEAD~3</code>) without rewriting main, and push the fix.',
          setup: bugShipped,
          check: (r) => !has(fileAt(r, 'main', 'order.js'), 'price + qty') && msgAt(r, 'main~1') === 'Add gluten-free tag' && r.isAncestor(r.resolve('main~4'), r.s.branches.main) && pushed(r),
          solution: 'git revert --no-edit HEAD~3 && git push',
          explain: 'The total is right again, and the history tells the whole story: the bug and its undo.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'story-5', title: 'Release day',
      exercises: [
        {
          id: 'st5-msg', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> I pushed the footer update, that\'s the last thing. If the tests pass, tag it <code>v1.0</code> and ship it. Make it an annotated tag so we know who released it.',
        },
        {
          id: 'st5-tags', type: 'learn', new: true, title: 'Publishing tags',
          body: 'An annotated tag (<code>git tag -a v1.0 -m "…"</code>) records who tagged and why. Tags do not travel with a normal push: send one with <code>git push origin v1.0</code>, or <code>git push --follow-tags</code>. <code>git tag -n</code> lists tags with their messages.',
        },
        {
          id: 'st5-order', type: 'order',
          prompt: 'Release checklist, in order:',
          steps: ['git pull', './run-tests', 'git tag -a v1.0 -m "First release"', 'git push origin v1.0'],
          explain: 'Tag exactly what you tested, and only after pulling the last change.',
        },
        {
          id: 'st5-graph', type: 'graph',
          prompt: 'You pulled the footer commit. Which graph does this give?',
          setup: releaseReady,
          command: 'git tag -a v1.0 -m "First release"',
          distractors: [['git tag v1.0 HEAD~1']],
          explain: 'The tag sits on the newest commit, the one you tested. <code>HEAD~1</code> would release without the footer.',
        },
        {
          id: 'st5-type-release', type: 'type',
          prompt: 'Get the teammate\'s footer commit, tag it <code>v1.0</code> as an annotated tag (<code>First release</code>), and publish the tag.',
          setup: releaseDay,
          check: (r) => r.s.branches.main === r.s.remote.branches.main && tagAt(r, 'v1.0') === r.s.remote.branches.main && !!r.s.tags['v1.0']?.msg && !!r.s.remote.tags['v1.0'],
          solution: 'git pull && git tag -a v1.0 -m "First release" && git push origin v1.0',
          explain: 'v1.0 is on GitHub, and GitHub can turn it into a release page.',
        },
        {
          id: 'st5-not-pushed', type: 'choice',
          prompt: 'You tagged v1.0 and ran a plain <code>git push</code>. Does your teammate get the tag when they fetch?',
          options: ['No: plain push does not send tags', 'Yes, tags always travel with commits', 'Only lightweight tags', 'Only if they pull'],
          answer: 0,
          explain: 'Push the tag by name, or use <code>--follow-tags</code>, which sends annotated tags on the commits you push.',
        },
        {
          id: 'st5-fill', type: 'fill',
          prompt: 'Push your commits plus the annotated tags that point at them.',
          before: 'git push ', after: '',
          options: ['--follow-tags', '--tags-only', '--all', '-f'],
          answer: 0,
          explain: '<code>--tags</code> would send every local tag, even experiments. <code>--follow-tags</code> sends just the annotated ones on what you push.',
        },
        {
          id: 'st5-match', type: 'match',
          prompt: 'Match each tag command to its job.',
          pairs: [
            ['git tag -a v1.0 -m "…"', 'Annotated tag: tagger, date, message'],
            ['git tag v1.0', 'Lightweight tag: just a name for a commit'],
            ['git push origin v1.0', 'Publish one tag'],
            ['git tag -n', 'List tags with their messages'],
          ],
          explain: 'Release tags are usually annotated; lightweight tags suit private bookmarks.',
        },
        {
          id: 'st5-hotfix', type: 'learn', title: 'Teammate',
          body: '<b>Teammate:</b> Ha, someone spotted "cinamon" on the live menu. Fix is in your working tree? Commit it, tag <code>v1.0.1</code> and ship. Great first release, by the way!',
        },
        {
          id: 'st5-type-hotfix', type: 'type',
          prompt: 'The typo fix in <code>menu.html</code> is in your working tree. Commit it, tag it <code>v1.0.1</code> (annotated), and push the commit and the tag in one push.',
          setup: typoFixed,
          check: (r) => has(fileAt(r, 'origin/main', 'menu.html'), 'cinnamon') && pushed(r) && tagAt(r, 'v1.0.1') === r.s.branches.main && !!r.s.tags['v1.0.1']?.msg && r.s.remote.tags['v1.0.1']?.id === r.s.branches.main,
          solution: 'git commit -am "Fix cinnamon typo" && git tag -a v1.0.1 -m "Fix menu typo" && git push --follow-tags',
          explain: 'A patch release in three commands. From an empty folder to v1.0.1: that is the whole everyday git loop.',
        },
      ],
    },
  ],
};
