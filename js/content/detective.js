// Unit 7: Detective work. log filters and ranges, show, blame, bisect, and bringing back old versions.
import { bisectHistory } from '../levels.js';
import { cafeHistory, msgAt, fileAt, has, tagAt, tagMsg, clean } from './helpers.js';

const culpritOk = (r, t = 'culprit') => {
  const id = tagAt(r, t);
  const c = id && r.commit(id);
  return !!c && has(c.tree['checkout.js'], 'subtotal + discount') && !has(r.tree(c.parents[0])['checkout.js'], 'subtotal + discount');
};
const shopBisect = (r) => bisectHistory(r, 16, 11);
const configHistory = (r) => {
  r.setupCommit('Initial commit', { 'config.json': '{ "cache": 0 }' });
  r.setupCommit('Tune cache for launch', { 'config.json': '{ "cache": 300, "gzip": true }' });
  r.setupCommit('Experiment: no cache', { 'config.json': '{ "cache": 0, "gzip": true }' });
  r.setupCommit('Add analytics', { 'analytics.js': 'track()' });
  r.setupCommit('Experiment: huge cache', { 'config.json': '{ "cache": 99999, "gzip": false }' });
};
const taggedRelease = (r) => {
  r.setupCommit('Initial commit', { 'game.js': 'let score = 0;' });
  r.setupCommit('Add high scores', { 'scores.js': 'save()' });
  r.sh('git tag v1.0');
  r.setupCommit('Start online mode', { 'online.js': 'connect()' });
};

export default {
  id: 'detective', title: 'Detective work', color: 'green',
  blurb: 'log, show, blame and bisect: find out what happened and when.',
  challenges: ['find-change', 'bisect', 'old-version'],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'detective-1', title: 'Reading history',
      exercises: [
        {
          id: 'dt1-log', type: 'learn', new: true, title: 'Shape the log',
          body: '<code>git log</code> takes options that shape its output: <code>--oneline</code> for one line each, <code>--graph</code> to draw branches, <code>--all</code> for every branch, <code>-3</code> for just the newest three, and <code>-- file</code> for commits that touched a file.',
        },
        {
          id: 'dt1-match', type: 'match',
          prompt: 'Match each log option to its effect.',
          pairs: [
            ['--oneline', 'One commit per line'],
            ['--graph', 'Draw the branch lines'],
            ['--all', 'Include every branch, not just HEAD'],
            ['-3', 'Only the newest three commits'],
            ['-- prices.txt', 'Only commits that changed prices.txt'],
          ],
          explain: 'Combine them freely: <code>git log --oneline --graph --all</code> is a favourite for a quick map.',
        },
        {
          id: 'dt1-reachable', type: 'choice',
          prompt: 'You are on main. Does plain <code>git log</code> show commits that exist only on the <code>feature</code> branch?',
          options: ['No, only commits reachable from HEAD', 'Yes, it shows every commit', 'Only if feature is pushed', 'Only the newest one'],
          answer: 0,
          explain: 'log walks back from HEAD through parents. Name other branches, or add <code>--all</code>, to include them.',
        },
        {
          id: 'dt1-fill', type: 'fill',
          prompt: 'List only the commits that changed prices.txt.',
          before: 'git log --oneline ', after: ' prices.txt',
          options: ['--', '-f', ':', '--path'],
          answer: 0,
          explain: 'A lone <code>--</code> means "the rest are file paths", so git never confuses a file with a branch name.',
        },
        {
          id: 'dt1-ranges', type: 'learn', new: true, title: 'Ranges',
          body: '<code>git log main..feature</code> shows commits on feature that are not on main: what a merge would bring in. Flip the sides to see the other direction.',
        },
        {
          id: 'dt1-range-choice', type: 'choice',
          prompt: 'What does <code>git log main..feature</code> list?',
          options: ['Commits on feature that main does not have', 'Commits on main that feature does not have', 'Every commit on both branches', 'Commits made between two dates'],
          answer: 0,
          explain: 'Read <code>A..B</code> as "reachable from B, but not from A".',
        },
        {
          id: 'dt1-build', type: 'build',
          prompt: 'Show the newest three commits, one per line.',
          tiles: ['git', 'log', '--oneline', '-3', '--all', 'show'],
          answers: [['git', 'log', '--oneline', '-3'], ['git', 'log', '-3', '--oneline']],
          explain: '<code>-3</code> is short for <code>-n 3</code>. Option order does not matter here.',
        },
        {
          id: 'dt1-type-last-price', type: 'type',
          prompt: 'Find the newest commit that changed <code>prices.txt</code> and tag it <code>last-price</code>.',
          setup: cafeHistory,
          check: (r) => tagMsg(r, 'last-price') === 'Add cocoa',
          solution: 'git tag last-price HEAD~1',
          explain: '<code>git log --oneline -- prices.txt</code> lists only the price commits; the newest is "Add cocoa".',
        },
        {
          id: 'dt1-order', type: 'order',
          prompt: 'Answer "what is in feature that main lacks?"',
          steps: ['git fetch (if feature lives on the remote)', 'git log --oneline main..feature', 'git show <id> for anything surprising'],
          explain: 'Get up to date, list the difference, then zoom into single commits.',
        },
        {
          id: 'dt1-type-styles', type: 'type',
          prompt: 'Tag the commit that first added <code>style.css</code> as <code>styles-start</code>.',
          setup: cafeHistory,
          check: (r) => tagMsg(r, 'styles-start') === 'Tweak styles',
          solution: 'git tag styles-start HEAD~4',
          explain: '<code>git log --oneline -- style.css</code> shows a single commit: "Tweak styles".',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'detective-2', title: 'Search the history',
      exercises: [
        {
          id: 'dt2-filters', type: 'learn', new: true, title: 'Filters',
          body: 'Narrow down <code>git log</code>: <code>--author=name</code> keeps one person\'s commits. <code>--grep=word</code> searches messages. <code>-S "text"</code>, the pickaxe, finds commits that added or removed that text in the code, even when the message says nothing.',
        },
        {
          id: 'dt2-match', type: 'match',
          prompt: 'Match each filter to what it searches.',
          pairs: [
            ['--author=intern', 'Who wrote the commit'],
            ['--grep=fix', 'The commit message'],
            ['-S "3.50"', 'Code changes that add or remove the text'],
            ['-- prices.txt', 'Which files were touched'],
          ],
          explain: 'Messages can lie or be vague. The pickaxe looks at what actually changed.',
        },
        {
          id: 'dt2-pickaxe', type: 'choice',
          prompt: 'Coffee went from 3.00 to 3.50, and the commit message just says "Small cleanups". Which search finds it?',
          options: ['git log -S "3.50"', 'git log --grep=price', 'git log --author=coffee', 'git log --all'],
          answer: 0,
          explain: '--grep would miss it, because "price" is not in the message. -S finds the commit where "3.50" first appeared.',
        },
        {
          id: 'dt2-fill', type: 'fill',
          prompt: 'Show only the intern\'s commits.',
          before: 'git log --oneline ', after: '=intern',
          options: ['--author', '--user', '--by', '--who'],
          answer: 0,
          explain: 'The match is on part of the author name or email, so <code>--author=intern</code> also catches "intern@cafe.dev".',
        },
        {
          id: 'dt2-build', type: 'build',
          prompt: 'Find the commits that added or removed the text <code>3.50</code>, one per line.',
          tiles: ['git', 'log', '-S', '"3.50"', '--oneline', '--grep', 'blame'],
          answers: [['git', 'log', '-S', '"3.50"', '--oneline'], ['git', 'log', '--oneline', '-S', '"3.50"']],
          explain: '<code>-S</code> takes the text right after it. <code>--grep</code> would search messages instead.',
        },
        {
          id: 'dt2-show', type: 'learn', new: true, title: 'git show',
          body: '<code>git show &lt;commit&gt;</code> prints one commit: author, message and diff. <code>git show &lt;commit&gt;:file</code> prints a whole file as it was in that commit, without changing anything.',
        },
        {
          id: 'dt2-show-colon', type: 'choice',
          prompt: 'What does <code>git show HEAD~2:prices.txt</code> print?',
          options: ['The whole of prices.txt as it was two commits ago', 'The diff of prices.txt in HEAD~2', 'Two lines of prices.txt', 'An error: show only takes commits'],
          answer: 0,
          explain: 'The colon means "this path inside that commit". Your working tree is not touched.',
        },
        {
          id: 'dt2-type-intern', type: 'type',
          prompt: 'Tag the one commit written by <code>intern</code> as <code>intern-change</code>.',
          setup: cafeHistory,
          check: (r) => { const id = tagAt(r, 'intern-change'); return !!id && r.commit(id).author === 'intern'; },
          solution: 'git tag intern-change HEAD~3',
          explain: '<code>git log --oneline --author=intern</code> lists exactly one commit, "Small cleanups".',
        },
        {
          id: 'dt2-grep-choice', type: 'choice',
          prompt: 'You want every commit whose message mentions "cocoa". Which do you run?',
          options: ['git log --grep=cocoa', 'git log -S cocoa', 'git log --author=cocoa', 'git blame cocoa'],
          answer: 0,
          explain: '--grep searches messages. -S cocoa would find commits that changed code containing "cocoa", which is a different question.',
        },
        {
          id: 'dt2-type-wifi', type: 'type',
          prompt: 'The README used to say <code>Free wifi</code>, and now it does not. Tag the commit that removed it as <code>wifi-gone</code>.',
          setup: cafeHistory,
          check: (r) => tagMsg(r, 'wifi-gone') === 'Fix header',
          solution: 'git tag wifi-gone HEAD~2',
          explain: '<code>git log --oneline -S "Free wifi"</code> lists two commits: the one that added it and "Fix header", which removed it.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'detective-3', title: 'Blame',
      exercises: [
        {
          id: 'dt3-blame', type: 'learn', new: true, title: 'git blame',
          body: '<code>git blame file</code> labels every line with the commit that last changed it, and who wrote that commit. Despite the name, it is for understanding, not accusing: the commit usually explains why.',
        },
        {
          id: 'dt3-read', type: 'choice',
          prompt: 'Who last changed line 2?',
          code: 'c4e8a93 (intern    1) coffee 3.50\n0a1b2c3 (lead      2) tea 2.50\n9f8e7d6 (teammate  3) cocoa 3.20',
          options: ['lead, in 0a1b2c3', 'intern, in c4e8a93', 'teammate, in 9f8e7d6', 'Nobody; blame cannot tell'],
          answer: 0,
          explain: 'Each row is: commit, author, line number, then the line itself.',
        },
        {
          id: 'dt3-match', type: 'match',
          prompt: 'Match each question to the command that answers it.',
          pairs: [
            ['Who last touched this line?', 'git blame file'],
            ['What else changed in that commit?', 'git show <id>'],
            ['When did this text first appear?', 'git log -S "text"'],
            ['Every commit that touched this file?', 'git log -- file'],
          ],
          explain: 'Detective work is usually blame, then show, then a log search for the wider story.',
        },
        {
          id: 'dt3-parent', type: 'learn', new: true, title: 'Blame further back',
          body: 'Blame starts from HEAD. If it points at a commit that only reformatted the file, blame again from that commit\'s parent: <code>git blame &lt;id&gt;^ -- file</code>. <code>^</code> means "the parent of"; <code>--</code> marks where the file names begin.',
        },
        {
          id: 'dt3-refactor', type: 'choice',
          prompt: 'Blame points at a commit that only re-indented the file. How do you see who wrote the line before that?',
          options: ['Blame again, starting from that commit\'s parent', 'Give up: blame only goes one level', 'git revert the re-indent', 'git log --all'],
          answer: 0,
          explain: '<code>git blame &lt;id&gt;^ -- file</code> starts from the commit before the re-indent. (<code>git blame -w</code> also ignores whitespace changes.)',
        },
        {
          id: 'dt3-fill', type: 'fill',
          prompt: 'Label every line of prices.txt with who changed it last.',
          before: 'git ', after: ' prices.txt',
          options: ['blame', 'show', 'diff', 'status'],
          answer: 0,
          explain: 'show prints a commit, diff compares versions, and blame annotates lines.',
        },
        {
          id: 'dt3-order', type: 'order',
          prompt: 'Investigate a strange line in checkout.js.',
          steps: ['git blame checkout.js (find the commit)', 'git show <id> (read the whole change)', 'git blame <id>^ -- checkout.js (dig one step further back)'],
          explain: 'Each step goes one level deeper. Most mysteries are solved by the commit message in step two.',
        },
        {
          id: 'dt3-build', type: 'build',
          prompt: 'See who last changed each line of <code>prices.txt</code>.',
          tiles: ['git', 'blame', 'prices.txt', 'log', 'show', '-S'],
          answers: [['git', 'blame', 'prices.txt']],
          explain: 'One file, every line, its last commit and author.',
        },
        {
          id: 'dt3-type-tea', type: 'type',
          prompt: 'Find the commit that last changed the <code>tea</code> line in prices.txt and tag it <code>tea-origin</code>.',
          setup: cafeHistory,
          check: (r) => tagMsg(r, 'tea-origin') === 'Initial commit',
          solution: 'git tag tea-origin HEAD~6',
          explain: 'Blame shows the tea line has not changed since the very first commit.',
        },
        {
          id: 'dt3-type-hours', type: 'type',
          prompt: 'Who added the opening hours line to README.md? Tag that commit <code>hours</code>.',
          setup: cafeHistory,
          check: (r) => tagMsg(r, 'hours') === 'Update README',
          solution: 'git tag hours HEAD~5',
          explain: '"Fix header" rewrote the README later, but blame sees that the hours line itself survived unchanged from "Update README".',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'detective-4', title: 'Bisect',
      exercises: [
        {
          id: 'dt4-bisect', type: 'learn', new: true, title: 'Binary search for bugs',
          body: '<code>git bisect start &lt;bad&gt; &lt;good&gt;</code> hunts for the commit that broke something. Git checks out the middle; test it, then say <code>git bisect good</code> or <code>git bisect bad</code>. Each answer halves the suspects. <code>git bisect reset</code> takes you back.',
        },
        {
          id: 'dt4-how-many', type: 'choice',
          prompt: 'The bug is somewhere in the last 64 commits. Roughly how many tests does bisect need?',
          options: ['About 6', 'About 32', '64', 'About 16'],
          answer: 0,
          explain: 'Each test halves the range: 64, 32, 16, 8, 4, 2, 1. That is log2(64) = 6.',
        },
        {
          id: 'dt4-fill', type: 'fill',
          prompt: 'Start bisecting with main as bad and v1.0 as good, in one command.',
          before: 'git bisect start ', after: ' v1.0',
          options: ['main', '--good', 'HEAD~1', 'reset'],
          answer: 0,
          explain: 'The bad commit comes first, then one or more good ones.',
        },
        {
          id: 'dt4-run', type: 'learn', new: true, title: 'Let a script decide',
          body: '<code>git bisect run ./run-tests</code> runs the script at each step: exit code 0 means good, most other codes mean bad (125 means "skip this one"). Git then finishes the whole search on its own.',
        },
        {
          id: 'dt4-exit', type: 'choice',
          prompt: 'During <code>git bisect run</code>, the test script exits with code 0. What does bisect conclude?',
          options: ['This commit is good', 'This commit is bad', 'Skip this commit', 'Stop bisecting'],
          answer: 0,
          explain: 'Exit 0 is success, so good. 1 to 127 (except 125) is bad, and 125 skips a commit that cannot be tested.',
        },
        {
          id: 'dt4-match', type: 'match',
          prompt: 'Match each bisect command to its meaning.',
          pairs: [
            ['git bisect good', 'This commit does not have the bug'],
            ['git bisect bad', 'This commit has the bug'],
            ['git bisect run ./run-tests', 'Let a script give every verdict'],
            ['git bisect reset', 'End the session, back to your branch'],
          ],
          explain: 'Get one verdict wrong and bisect confidently names the wrong commit, so test carefully.',
        },
        {
          id: 'dt4-culprit', type: 'learn', new: true, title: 'Keep the culprit',
          body: 'When bisect is done, the first bad commit is named <code>refs/bisect/bad</code>. Keep it before you finish: <code>git tag culprit refs/bisect/bad</code>, then <code>git bisect reset</code>, which ends the session and forgets that name.',
        },
        {
          id: 'dt4-order', type: 'order',
          prompt: 'An automated bisect, start to finish.',
          steps: ['git bisect start main v1.0', 'git bisect run ./run-tests', 'git tag culprit refs/bisect/bad', 'git bisect reset'],
          explain: 'Tag before you reset: reset ends the session and removes <code>refs/bisect/bad</code>.',
        },
        {
          id: 'dt4-build', type: 'build',
          prompt: 'Let the test script find the bad commit for you.',
          tiles: ['git', 'bisect', 'run', './run-tests', 'good', 'reset'],
          answers: [['git', 'bisect', 'run', './run-tests']],
          explain: 'It needs a good and a bad commit marked first, then it runs to the end on its own.',
        },
        {
          id: 'dt4-type-run', type: 'type',
          prompt: 'A bisect is running: main is marked bad, v1.0 good. Finish the hunt automatically with the test script.',
          setup: (r) => { shopBisect(r); r.sh('git bisect start main v1.0'); },
          check: (r) => !!r.s.bisect?.found,
          solution: 'git bisect run ./run-tests',
          explain: 'Git names the first bad commit: "Simplify discount maths". About four tests for sixteen commits.',
        },
        {
          id: 'dt4-small-commits', type: 'choice',
          prompt: 'Bisect works best when…',
          options: ['every commit builds and passes tests on its own', 'commits are as large as possible', 'you never use branches', 'all commits have the same author'],
          answer: 0,
          explain: 'If half the commits are broken for unrelated reasons, the verdicts get muddy. Small, working commits make bisect sharp.',
        },
        {
          id: 'dt4-type-full', type: 'type',
          prompt: 'Tests fail on main but passed at <code>v1.0</code>. Find the first bad commit with bisect and tag it <code>culprit</code>.',
          setup: shopBisect,
          check: (r) => culpritOk(r),
          solution: 'git bisect start main v1.0 && git bisect run ./run-tests && git tag culprit refs/bisect/bad',
          explain: 'Three commands for sixteen suspects. Run <code>git bisect reset</code> afterwards to get back to main.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'detective-5', title: 'Bring back the past',
      exercises: [
        {
          id: 'dt5-past', type: 'learn', new: true, title: 'Visit, copy, restore',
          body: 'Look at the past without changing anything: <code>git show HEAD~3:config.json</code>. Copy a file back: <code>git restore --source=HEAD~3 config.json</code>. Commit that, and history moves forward with the old content; nothing is rewritten.',
        },
        {
          id: 'dt5-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [
            ['git show HEAD~3:config.json', 'Print the old file'],
            ['git restore --source=HEAD~3 config.json', 'Write the old version into your files'],
            ['git switch --detach HEAD~3', 'Visit the whole old commit'],
            ['git switch -', 'Go back to where you were'],
          ],
          explain: 'Only the restore changes your working tree, and none of them move a branch.',
        },
        {
          id: 'dt5-vs-reset', type: 'choice',
          prompt: 'Why use <code>git restore --source</code> instead of <code>git reset --hard</code> to bring back an old config?',
          options: ['It changes one file and moves no branch, so history is not rewritten', 'It is faster', 'reset cannot go back in time', 'restore also pushes'],
          answer: 0,
          explain: 'reset would throw away every commit after that point. restore copies one file and you commit it as a normal change.',
        },
        {
          id: 'dt5-fill', type: 'fill',
          prompt: 'Print config.json as it was three commits ago.',
          before: 'git show HEAD~3', after: 'config.json',
          options: [':', '/', ' -- ', '@'],
          answer: 0,
          explain: '<code>commit:path</code> names a file inside a commit.',
        },
        {
          id: 'dt5-checkout-path', type: 'learn', new: true, title: 'Staged copies, old branches',
          body: '<code>git restore --source=X file</code> writes the old version to your working tree only. The older <code>git checkout X -- file</code> writes it to the index too, so it is already staged. To branch from the past: <code>git switch -c v1-fix v1.0</code>.',
          teaches: ['branch from a start point'],
        },
        {
          id: 'dt5-graph', type: 'graph', needs: ['branch from a start point'],
          prompt: 'You need to fix an old release. Which graph does this give?',
          setup: taggedRelease,
          command: 'git switch -c v1-fix v1.0',
          distractors: [['git switch --detach v1.0'], ['git branch v1-fix v1.0']],
          explain: 'A new branch at the tag, with HEAD on it, ready for commits. Detaching has no branch, and git branch alone does not switch.',
        },
        {
          id: 'dt5-build', type: 'build',
          prompt: 'Write config.json from <code>HEAD~3</code> into your working tree.',
          tiles: ['git', 'restore', '--source=HEAD~3', 'config.json', 'reset', '--hard', 'checkout'],
          answers: [['git', 'restore', '--source=HEAD~3', 'config.json'], ['git', 'restore', 'config.json', '--source=HEAD~3']],
          explain: 'Then <code>git commit -am</code> records the old content as a new commit.',
        },
        {
          id: 'dt5-order', type: 'order',
          prompt: 'Bring back the launch config the safe way.',
          steps: ['git log --oneline -- config.json', 'git show <id>:config.json', 'git restore --source=<id> config.json', 'git commit -am "Restore launch config"'],
          explain: 'Find it, preview it, copy it, commit it. Teammates just pull a normal commit.',
        },
        {
          id: 'dt5-type-faq', type: 'type',
          prompt: 'The last commit deleted <code>faq.md</code>. Bring it back as it was and commit that.',
          setup: (r) => {
            r.setupCommit('Initial commit', { 'index.html': '<h1>Cafe</h1>', 'faq.md': '# FAQ\nYes, we have oat milk.' });
            r.setupCommit('Remove FAQ', { 'faq.md': null });
          },
          check: (r) => has(fileAt(r, 'HEAD', 'faq.md'), 'oat milk') && msgAt(r, 'HEAD~1') === 'Remove FAQ' && clean(r),
          solution: 'git checkout HEAD~1 -- faq.md && git commit -m "Bring back the FAQ"',
          explain: 'checkout with a path staged the old file for you. With restore you would add <code>--staged --worktree</code>, or <code>git add</code> it.',
        },
        {
          id: 'dt5-type-branch-tag', type: 'type', needs: ['branch from a start point'],
          prompt: 'Players on <code>v1.0</code> found a bug. Create a branch <code>v1-fix</code> starting at that tag and switch to it.',
          setup: taggedRelease,
          check: (r) => r.branchName() === 'v1-fix' && r.s.branches['v1-fix'] === tagAt(r, 'v1.0'),
          solution: 'git switch -c v1-fix v1.0',
          explain: 'The optional last argument is the starting point: any branch, tag or commit.',
        },
        {
          id: 'dt5-type-config', type: 'type',
          prompt: 'Restore <code>config.json</code> exactly as it was in "Tune cache for launch" (<code>HEAD~3</code>) and commit it. Do not rewrite history.',
          setup: configHistory,
          check: (r) => fileAt(r, 'HEAD', 'config.json') === '{ "cache": 300, "gzip": true }\n' && msgAt(r, 'HEAD~1') === 'Experiment: huge cache' && clean(r),
          solution: 'git restore --source=HEAD~3 config.json && git commit -am "Restore launch cache settings"',
          explain: 'History moved forward with the old content. Every experiment is still there if you need it.',
        },
      ],
    },
  ],
};
