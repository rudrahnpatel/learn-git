// Run: node tests/git.test.mjs   (no dependencies)
import { Repo, merge3 } from '../js/git.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message.split('\n').join('\n       ')}`); }
}
function eq(a, b, msg = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg}\n expected: ${B}\n actual:   ${A}`);
}
function ok(v, msg = 'expected truthy') { if (!v) throw new Error(msg); }
function run(r, line, expectOk = true) {
  const res = r.run(line);
  if (res.ok !== expectOk) throw new Error(`"${line}" ${expectOk ? 'failed' : 'unexpectedly succeeded'}:\n${res.lines.map((l) => l.t).join('\n')}`);
  return res.lines.map((l) => l.t).join('\n');
}
function base() {
  const r = new Repo();
  r.setupCommit('Initial', { 'a.txt': 'one\ntwo\nthree\nfour\nfive', 'b.txt': 'bee' });
  r.setupDone();
  return r;
}

console.log('merge3');
test('clean merge of separate edits', () => {
  const m = merge3('1\n2\n3\n4\n5\n', 'ONE\n2\n3\n4\n5\n', '1\n2\n3\n4\nFIVE\n');
  eq(m, { text: 'ONE\n2\n3\n4\nFIVE\n', conflicts: 0 });
});
test('conflict on the same line', () => {
  const m = merge3('x\n', 'ours\n', 'theirs\n', { ours: 'HEAD', theirs: 'feat' });
  eq(m.conflicts, 1);
  eq(m.text, '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feat\n');
});

console.log('commit, status, diff');
test('add + commit moves file through the three trees', () => {
  const r = base();
  run(r, 'echo hello > c.txt');
  eq(r.s.work['c.txt'], 'hello\n');
  ok(r.untracked().includes('c.txt'));
  run(r, 'git add c.txt');
  eq(r.stagedChanges(), ['c.txt']);
  run(r, 'git commit -m "Add c"');
  ok(r.isClean());
  eq(r.headTree()['c.txt'], 'hello\n');
});
test('commit -a skips untracked, diff/--staged', () => {
  const r = base();
  run(r, 'edit b.txt "buzz" && echo new > n.txt');
  ok(run(r, 'git diff').includes('+buzz'));
  run(r, 'git add b.txt');
  eq(run(r, 'git diff'), '');
  ok(run(r, 'git diff --staged').includes('-bee'));
  run(r, 'git commit -am "B"');
  ok(r.untracked().includes('n.txt'));
});
test('nothing to commit exits non-zero', () => {
  const r = base();
  ok(run(r, 'git commit -m nope', false).includes('nothing to commit'));
});
test('amend replaces the tip and keeps the old one in the reflog', () => {
  const r = base();
  const old = r.headId();
  run(r, 'git commit --amend -m "Initial commit"');
  ok(r.headId() !== old);
  eq(r.commit(r.headId()).msg, 'Initial commit');
  eq(r.resolve('HEAD@{1}'), old);
});

console.log('branching and merging');
test('fast-forward merge', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "B" && git commit -am "B up"');
  const tip = r.headId();
  run(r, 'git switch main');
  ok(run(r, 'git merge feat').includes('Fast-forward'));
  eq(r.headId(), tip);
});
test('3-way merge without conflict', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "B" && git commit -am "B up"');
  run(r, 'git switch main && edit a.txt "ONE\\ntwo\\nthree\\nfour\\nfive" && git commit -am "A up"');
  const out = run(r, 'git merge feat');
  ok(out.includes("Merge made by the 'ort' strategy."));
  const c = r.commit(r.headId());
  eq(c.parents.length, 2);
  eq(c.msg, "Merge branch 'feat'");
  eq(r.s.work['a.txt'], 'ONE\ntwo\nthree\nfour\nfive\n');
  eq(r.s.work['b.txt'], 'B\n');
  ok(r.isClean());
});
test('3-way merge with conflict, resolve, commit', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "theirs" && git commit -am "T"');
  run(r, 'git switch main && edit b.txt "ours" && git commit -am "O"');
  const out = run(r, 'git merge feat', false);
  ok(out.includes('CONFLICT (content): Merge conflict in b.txt'));
  eq(r.s.work['b.txt'], '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feat\n');
  ok(run(r, 'git commit -m x', false).includes('unmerged'));
  run(r, 'edit b.txt "both"');
  run(r, 'git add b.txt');
  run(r, 'git commit');
  const c = r.commit(r.headId());
  eq(c.parents.length, 2);
  eq(c.tree['b.txt'], 'both\n');
  eq(r.s.mergeHead, null);
});
test('merge --abort restores the pre-merge state', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "theirs" && git commit -am "T"');
  run(r, 'git switch main && edit b.txt "ours" && git commit -am "O"');
  const before = r.headId();
  run(r, 'git merge feat', false);
  run(r, 'git merge --abort');
  eq(r.headId(), before);
  eq(r.s.work['b.txt'], 'ours\n');
  ok(r.isClean());
});
test('--no-ff creates a merge commit even when ff is possible', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "B" && git commit -am "B up" && git switch main');
  run(r, 'git merge --no-ff feat');
  eq(r.commit(r.headId()).parents.length, 2);
});
test('switch refuses to clobber local changes', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "B" && git commit -am "B up" && git switch main');
  run(r, 'edit b.txt "local"');
  ok(run(r, 'git switch feat', false).includes('would be overwritten'));
  run(r, 'edit a.txt "changed"');
});

console.log('rebase');
test('rebase replays commits on top of upstream', () => {
  const r = base();
  run(r, 'git switch -c feat && echo f1 > f1.txt && git add . && git commit -m F1 && echo f2 > f2.txt && git add . && git commit -m F2');
  const [oldF1, oldF2] = [r.resolve('HEAD~1'), r.resolve('HEAD')];
  run(r, 'git switch main && echo m > m.txt && git add . && git commit -m M');
  const m = r.headId();
  run(r, 'git switch feat');
  ok(run(r, 'git rebase main').includes('Successfully rebased'));
  eq(r.branchName(), 'feat');
  eq(r.resolve('HEAD~2'), m);
  eq(r.commit(r.resolve('HEAD')).msg, 'F2');
  ok(r.resolve('HEAD') !== oldF2 && r.resolve('HEAD~1') !== oldF1);
  eq(Object.keys(r.headTree()).sort(), ['a.txt', 'b.txt', 'f1.txt', 'f2.txt', 'm.txt']);
});
test('rebase conflict, --continue', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "feat" && git commit -am "F"');
  run(r, 'git switch main && edit b.txt "main" && git commit -am "M"');
  run(r, 'git switch feat');
  ok(run(r, 'git rebase main', false).includes('could not apply'));
  ok(!r.branchName());
  ok(run(r, 'git rebase --continue', false).includes('still unmerged'));
  run(r, 'edit b.txt "main+feat" && git add b.txt');
  run(r, 'git rebase --continue');
  eq(r.branchName(), 'feat');
  eq(r.headTree()['b.txt'], 'main+feat\n');
  eq(r.resolve('HEAD~1'), r.s.branches.main);
});
test('rebase --abort goes back', () => {
  const r = base();
  run(r, 'git switch -c feat && edit b.txt "feat" && git commit -am "F"');
  const tip = r.headId();
  run(r, 'git switch main && edit b.txt "main" && git commit -am "M" && git switch feat');
  run(r, 'git rebase main', false);
  run(r, 'git rebase --abort');
  eq(r.headId(), tip); eq(r.branchName(), 'feat'); ok(r.isClean());
});
test('interactive rebase: fixup, reword, drop, reorder', () => {
  const r = base();
  run(r, 'git switch -c feat');
  for (const n of [1, 2, 3, 4]) run(r, `echo c${n} > c${n}.txt && git add . && git commit -m C${n}`);
  run(r, 'git rebase -i main');
  const t = r.s.pendingRebase.todo;
  eq(t.map((x) => r.commit(x.id).msg), ['C1', 'C2', 'C3', 'C4']);
  const res = r.rebaseTodoApply([
    { action: 'reword', id: t[2].id, msg: 'Third first' },
    { action: 'pick', id: t[0].id },
    { action: 'fixup', id: t[1].id },
    { action: 'drop', id: t[3].id },
  ]);
  ok(res.ok, res.lines.map((l) => l.t).join('\n'));
  eq(r.commit(r.headId()).msg, 'C1');
  eq(r.commit(r.resolve('HEAD~1')).msg, 'Third first');
  eq(r.resolve('HEAD~2'), r.s.branches.main);
  ok(!('c4.txt' in r.headTree()) && 'c2.txt' in r.headTree());
});

console.log('reset, restore, reflog');
test('reset --soft keeps index, --mixed keeps work, --hard drops all', () => {
  const r = base();
  run(r, 'edit b.txt "v2" && git commit -am "v2"');
  const r2 = r.clone(), r3 = r.clone();
  run(r, 'git reset --soft HEAD~1');
  eq(r.s.index['b.txt'], 'v2\n'); eq(r.headTree()['b.txt'], 'bee\n');
  run(r2, 'git reset HEAD~1');
  eq(r2.s.index['b.txt'], 'bee\n'); eq(r2.s.work['b.txt'], 'v2\n');
  run(r3, 'git reset --hard HEAD~1');
  eq(r3.s.work['b.txt'], 'bee\n'); ok(r3.isClean());
});
test('reflog recovers commits after reset --hard', () => {
  const r = base();
  run(r, 'echo x > x.txt && git add . && git commit -m X && echo y > y.txt && git add . && git commit -m Y');
  const lost = r.headId();
  run(r, 'git reset --hard HEAD~2');
  ok(!('y.txt' in r.s.work));
  ok(run(r, 'git reflog').includes(`${lost} HEAD@{1}: commit: Y`));
  run(r, 'git reset --hard HEAD@{1}');
  eq(r.headId(), lost);
  eq(r.s.work['y.txt'], 'y\n');
});
test('restore and restore --staged', () => {
  const r = base();
  run(r, 'edit b.txt "oops" && git add b.txt');
  run(r, 'git restore --staged b.txt');
  eq(r.s.index['b.txt'], 'bee\n'); eq(r.s.work['b.txt'], 'oops\n');
  run(r, 'git restore b.txt');
  eq(r.s.work['b.txt'], 'bee\n');
});
test('revert creates an inverse commit', () => {
  const r = base();
  run(r, 'edit b.txt "bad" && git commit -am "Bad"');
  run(r, 'git revert HEAD');
  eq(r.commit(r.headId()).msg.split('\n')[0], 'Revert "Bad"');
  eq(r.s.work['b.txt'], 'bee\n');
});

console.log('stash');
test('stash push / list / pop round-trip', () => {
  const r = base();
  run(r, 'edit b.txt "wip"');
  ok(run(r, 'git stash').includes('Saved working directory'));
  ok(r.isClean());
  ok(run(r, 'git stash list').startsWith('stash@{0}: WIP on main'));
  run(r, 'git stash pop');
  eq(r.s.work['b.txt'], 'wip\n');
  eq(r.s.stash.length, 0);
});
test('stash apply onto a moved branch merges; conflicting pop keeps entry', () => {
  const r = base();
  run(r, 'edit a.txt "one\\ntwo\\nthree\\nfour\\nFIVE"');
  run(r, 'git stash push -m five');
  run(r, 'edit a.txt "ONE\\ntwo\\nthree\\nfour\\nfive" && git commit -am top');
  run(r, 'git stash apply');
  eq(r.s.work['a.txt'], 'ONE\ntwo\nthree\nfour\nFIVE\n');
  eq(r.s.stash.length, 1);
  run(r, 'git reset --hard && edit a.txt "zzz" && git commit -am z');
  ok(run(r, 'git stash pop', false).includes('kept'));
  eq(r.s.stash.length, 1);
});

console.log('cherry-pick');
test('cherry-pick copies one commit', () => {
  const r = base();
  run(r, 'git switch -c dev && echo fix > fix.txt && git add . && git commit -m Fix && echo more > more.txt && git add . && git commit -m More');
  run(r, 'git switch main && git cherry-pick dev~1');
  eq(r.commit(r.headId()).msg, 'Fix');
  ok('fix.txt' in r.headTree() && !('more.txt' in r.headTree()));
  ok(r.headId() !== r.resolve('dev~1'));
});
test('cherry-pick conflict then --continue', () => {
  const r = base();
  run(r, 'git switch -c dev && edit b.txt "dev" && git commit -am D && git switch main && edit b.txt "main" && git commit -am M');
  run(r, 'git cherry-pick dev', false);
  ok('b.txt' in r.s.conflicts);
  run(r, 'edit b.txt "merged" && git add . && git cherry-pick --continue');
  eq(r.commit(r.headId()).msg, 'D');
  eq(r.s.seq, null);
});

console.log('remotes and bisect');
test('push rejected when behind, pull --rebase then push', () => {
  const r = base();
  r.setupRemote();
  r.teammatePush('main', 'Theirs', { 't.txt': 't' });
  run(r, 'echo me > me.txt && git add . && git commit -m Mine');
  ok(run(r, 'git push', false).includes('fetch first'));
  ok(run(r, 'git pull', false).includes('divergent'));
  run(r, 'git pull --rebase');
  run(r, 'git push');
  eq(r.s.remote.branches.main, r.headId());
  eq(r.commit(r.resolve('HEAD~1')).msg, 'Theirs');
});
test('force-with-lease refuses when remote moved unseen', () => {
  const r = base();
  r.setupRemote();
  run(r, 'git commit --amend -m "rewritten"');
  r.teammatePush('main', 'Sneaky', { s: 's' });
  ok(run(r, 'git push --force-with-lease', false).includes('stale info'));
  run(r, 'git fetch');
  run(r, 'git push --force-with-lease');
  eq(r.s.remote.branches.main, r.headId());
});
test('bisect run finds the first bad commit', () => {
  const r = base();
  r.s.bugMarker = 'BUG';
  for (let i = 1; i <= 9; i++) r.setupCommit(`c${i}`, { 'app.js': i >= 6 ? `v${i} BUG` : `v${i}` });
  const culprit = r.resolve('HEAD~3');
  run(r, 'git bisect start && git bisect bad && git bisect good HEAD~9');
  run(r, 'git bisect run ./run-tests');
  eq(r.s.bisect.found, culprit);
  run(r, 'git bisect reset');
  eq(r.branchName(), 'main');
});
test('unknown commands give hints', () => {
  const r = base();
  ok(run(r, 'git comit', false).includes('commit'));
  ok(run(r, 'stauts', false).includes('status'));
});

console.log('named remotes (fork model)');
function fork(opts) {
  const r = new Repo();
  r.setupCommit('Initial', { 'index.html': '<h1>Bakery</h1>' });
  r.setupFork(opts);
  r.setupDone();
  return r;
}
test('existing single-origin state is unchanged by the remote model', () => {
  const r = base();
  r.setupRemote();
  eq(r.remoteNames(), ['origin']);
  eq(Object.keys(r.graphData().remotes), ['origin/main']);
  eq(run(r, 'git remote -v'), `origin\tgit@playground.local:team/project.git (fetch)\norigin\tgit@playground.local:team/project.git (push)`);
});
test('setupFork: origin (fork) and upstream (read-only original) both listed and resolvable', () => {
  const r = fork();
  eq(run(r, 'git remote'), 'origin\nupstream');
  ok(run(r, 'git remote -v').includes('upstream\thttps://github.com/bakery/site.git (fetch)'));
  eq(r.resolve('upstream/main'), r.headId());
  eq(r.graphData().remotes['upstream/main'], r.headId());
  ok(r.completions().remotes.includes('upstream/main'));
  ok(run(r, 'git log --oneline -1').includes('upstream/main'));
});
test('git remote add links a known repo by any URL spelling; fetch then sees its commits', () => {
  const r = fork({ added: false });
  eq(r.remoteNames(), ['origin']);
  r.teammatePush('main', 'Add menu page', { 'menu.html': 'menu' }, 'maintainer', 'https://github.com/bakery/site.git');
  run(r, 'git remote add upstream git@github.com:bakery/site.git');
  eq(r.remoteNames(), ['origin', 'upstream']);
  ok(run(r, 'git fetch upstream').includes('-> upstream/main'));
  eq(r.commit(r.resolve('upstream/main')).msg, 'Add menu page');
  eq(r.s.tracking.main, r.headId(), 'origin/main untouched');
});
test('remote add of an unknown repo succeeds, but fetching it fails', () => {
  const r = fork();
  run(r, 'git remote add typo https://github.com/nobody/nothing.git');
  ok(run(r, 'git fetch typo', false).includes('not found'));
  run(r, 'git remote remove typo');
  eq(r.remoteNames(), ['origin', 'upstream']);
  ok(run(r, 'git remote add upstream x', false).includes('already exists'));
});
test('sync a fork: fetch upstream, merge upstream/main, push to origin', () => {
  const r = fork();
  r.teammatePush('main', 'Add menu page', { 'menu.html': 'menu' }, 'maintainer', 'upstream');
  run(r, 'git fetch upstream');
  ok(run(r, 'git status').includes("up to date with 'origin/main'"));
  run(r, 'git merge upstream/main');
  eq(r.headId(), r.resolve('upstream/main'), 'fast-forward');
  ok(run(r, 'git status').includes("ahead of 'origin/main' by 1 commit"));
  run(r, 'git push');
  eq(r.s.remote.branches.main, r.headId());
  eq(r.s.remotes.upstream.branches.main, r.headId());
});
test('pull upstream main works; bare "git pull upstream" asks for a branch', () => {
  const r = fork();
  r.teammatePush('main', 'Add menu page', { 'menu.html': 'menu' }, 'maintainer', 'upstream');
  ok(run(r, 'git pull upstream', false).includes('did not specify'));
  run(r, 'git pull upstream main');
  eq(r.commit(r.headId()).msg, 'Add menu page');
});
test('pushing to a read-only upstream is refused with a permission error', () => {
  const r = fork();
  run(r, 'echo hi > a.txt && git add a.txt && git commit -m "A"');
  ok(run(r, 'git push upstream main', false).includes('Permission to bakery/site.git denied'));
  eq(r.s.remotes.upstream.branches.main, r.resolve('main~1'));
});
test('branch tracking another remote: -u, --set-upstream-to, status and -vv', () => {
  const r = fork();
  run(r, 'git switch -c fix');
  run(r, 'echo hi > a.txt && git add a.txt && git commit -m "A"');
  run(r, 'git push -u origin fix');
  eq([r.s.upstream.fix, r.s.upstreamRemote.fix], ['fix', undefined]);
  run(r, 'git branch --set-upstream-to=upstream/main');
  eq([r.s.upstream.fix, r.s.upstreamRemote.fix], ['main', 'upstream']);
  ok(run(r, 'git status').includes("ahead of 'upstream/main' by 1 commit"));
  ok(run(r, 'git branch -vv').includes('[upstream/main: ahead 1]'));
  run(r, 'git branch -m fix fix2');
  eq(r.s.upstreamRemote.fix2, 'upstream');
});
test('switch guesses from a single remote, refuses when two remotes have the name', () => {
  const r = fork();
  r.teammatePush('docs', 'Docs', { 'd.md': 'd' }, 'teammate', 'origin');
  run(r, 'git fetch origin');
  run(r, 'git switch docs');
  eq(r.s.upstream.docs, 'docs');
  r.teammatePush('feat', 'F1', { 'f': '1' }, 'teammate', 'origin');
  r.teammatePush('feat', 'F2', { 'f': '2' }, 'maintainer', 'upstream');
  run(r, 'git fetch --all');
  ok(run(r, 'git switch feat', false).includes('matched multiple'));
  run(r, 'git switch --track upstream/feat');
  eq([r.branchName(), r.s.upstreamRemote.feat], ['feat', 'upstream']);
});
test('fetch --prune on one remote leaves the other remote alone', () => {
  const r = fork();
  run(r, 'git switch -c a && git push -u origin a && git switch main');
  delete r.s.remote.branches.a;
  run(r, 'git fetch --prune');
  ok(!('a' in r.s.tracking));
  eq(r.s.remoteTracking.upstream.main, r.headId());
  ok(run(r, 'git branch -vv').includes('[origin/a: gone]'));
});

console.log('pull request merges on the server');
function prRepo() {
  const r = new Repo();
  r.setupCommit('Initial', { 'index.html': '<h1>Bakery</h1>' });
  r.setupRemote();
  r.sh('git switch -c menu');
  r.setupCommit('Add menu page', { 'menu.html': 'bread' });
  r.setupCommit('Add prices', { 'menu.html': 'bread 3' });
  r.sh('git push -u origin menu');
  r.sh('git switch main');
  r.setupDone();
  return r;
}
test('merge-commit PR: main gets a two-parent merge, PR commits become ancestors', () => {
  const r = prRepo();
  const tip = r.s.branches.menu;
  const m = r.mergePullRequest('menu', { how: 'merge', number: 7 });
  eq(r.s.branches.main, r.s.tracking.main, 'nothing local moved yet');
  run(r, 'git pull');
  eq(r.headId(), m);
  eq(r.commit(m).parents, [r.resolve('HEAD^1'), tip]);
  eq(r.commit(m).msg.split('\n')[0], 'Merge pull request #7 from you/menu');
  ok(r.isAncestor(tip, r.headId()));
  run(r, 'git branch -d menu');
});
test('merge-commit PR even when a fast-forward was possible (GitHub never fast-forwards)', () => {
  const r = prRepo();
  const m = r.mergePullRequest('menu');
  eq(r.commit(m).parents.length, 2);
});
test('squash PR: one new single-parent commit, PR commits are NOT ancestors of main', () => {
  const r = prRepo();
  const tip = r.s.branches.menu;
  const sq = r.mergePullRequest('menu', { how: 'squash', number: 12, title: 'Menu page' });
  run(r, 'git pull');
  eq(r.commit(sq).parents, [r.resolve('HEAD~1')]);
  ok(r.commit(sq).msg.startsWith('Menu page (#12)\n\n* Add menu page\n* Add prices'));
  eq(r.tree(sq)['menu.html'], 'bread 3\n', 'same content as the PR tip');
  ok(!r.isAncestor(tip, r.headId()), 'not an ancestor');
  // origin/menu still exists, so -d accepts it (merged into its upstream) with a warning
  ok(run(r, 'git branch -d menu').includes('not yet merged to HEAD'));
});
test('squash PR + deleted branch + prune: branch -d refuses, -D needed', () => {
  const r = prRepo();
  r.mergePullRequest('menu', { how: 'squash', deleteBranch: true });
  run(r, 'git pull --prune');
  ok(!('menu' in r.s.tracking));
  ok(run(r, 'git branch -d menu', false).includes('not fully merged'));
  run(r, 'git branch -D menu');
});
test('rebase PR: commits replayed with new ids on top of main, originals not on main', () => {
  const r = prRepo();
  r.teammatePush('main', 'Fix title', { 'index.html': '<h1>The Bakery</h1>' });
  const orig = r.range(r.s.branches.main, r.s.branches.menu);
  const tip = r.mergePullRequest('menu', { how: 'rebase' });
  run(r, 'git pull');
  const onMain = [r.resolve('HEAD~1'), r.headId()];
  eq(onMain.map((id) => r.commit(id).msg), ['Add menu page', 'Add prices']);
  ok(onMain.every((id, i) => id !== orig[i]), 'new ids');
  eq(r.commit(r.resolve('HEAD~2')).msg, 'Fix title');
  eq(r.commit(tip).committer, 'GitHub');
  ok(!r.isAncestor(orig[1], r.headId()));
  eq(r.commit(r.headId()).parents.length, 1);
});
test('rebase PR rewrites ids even when main has not moved', () => {
  const r = prRepo();
  const before = r.s.branches.menu;
  r.mergePullRequest('menu', { how: 'rebase' });
  ok(r.s.remote.branches.main !== before);
  eq(r.tree(r.s.remote.branches.main), r.tree(before));
});
test('after a PR merge, pushing main without pulling is rejected (fetch first)', () => {
  const r = prRepo();
  r.mergePullRequest('menu', { how: 'squash' });
  run(r, 'echo x > x.txt && git add x.txt && git commit -m "X"');
  ok(run(r, 'git push', false).includes('fetch first'));
});
test('a conflicting PR throws (setup bug, not a silent merge)', () => {
  const r = prRepo();
  r.teammatePush('main', 'Other menu', { 'menu.html': 'cake' });
  let threw = false;
  try { r.mergePullRequest('menu', { how: 'squash' }); } catch { threw = true; }
  ok(threw);
});

test('push --follow-tags sends annotated tags on pushed commits, not lightweight ones', () => {
  const r = base();
  r.setupRemote();
  run(r, 'echo x > x.txt && git add x.txt && git commit -m "X"');
  run(r, 'git tag -a v1 -m "One" && git tag light');
  run(r, 'git push --follow-tags');
  eq(Object.keys(r.s.remote.tags), ['v1']);
  eq(r.s.remote.branches.main, r.headId());
});

console.log('objects and refs');
test('cat-file -t/-p on commits, trees and blobs', () => {
  const r = base();
  r.setupCommit('Add css', { 'css/site.css': 'body {}' });
  eq(run(r, 'git cat-file -t HEAD'), 'commit');
  const p = run(r, 'git cat-file -p HEAD');
  const treeId = p.match(/^tree ([0-9a-f]{7})$/m)[1];
  ok(p.includes(`parent ${r.resolve('HEAD~1')}`));
  ok(/\nauthor you <you@example.com> \d+ \+0000\ncommitter you/.test(p));
  ok(p.endsWith('\n\nAdd css'));
  eq(run(r, `git cat-file -t ${treeId}`), 'tree');
  eq(run(r, 'git rev-parse HEAD^{tree}'), treeId);
  const t = run(r, `git cat-file -p ${treeId}`).split('\n');
  eq(t.map((l) => l.split(/\s/)[1] + ' ' + l.split('\t')[1]), ['blob a.txt', 'blob b.txt', 'tree css']);
  const blob = t[1].split(/\s/)[2];
  eq(run(r, `git cat-file -t ${blob}`), 'blob');
  eq(run(r, `git cat-file -p ${blob}`), 'bee');
  eq(run(r, 'git cat-file -p HEAD:css/site.css'), 'body {}');
  const sub = t[2].split(/\s/)[2];
  ok(run(r, `git cat-file -p ${sub}`).endsWith('\tsite.css'));
});
test('ls-tree lists a commit\'s tree; -r recurses into folders', () => {
  const r = base();
  r.setupCommit('Add css', { 'css/site.css': 'body {}' });
  eq(run(r, 'git ls-tree HEAD'), run(r, 'git cat-file -p HEAD^{tree}'));
  eq(run(r, 'git ls-tree -r --name-only HEAD'), 'a.txt\nb.txt\ncss/site.css');
});
test('same content, same blob id; a changed file changes the tree id; unchanged trees keep theirs', () => {
  const r = base();
  const t1 = run(r, 'git rev-parse HEAD^{tree}');
  run(r, 'echo bee > c.txt');
  eq(run(r, 'git hash-object c.txt'), run(r, 'git rev-parse HEAD:b.txt'));
  eq(run(r, 'git hash-object c.txt'), run(r, 'git cat-file -p HEAD^{tree}').split('\n')[1].split(/\s/)[2]);
  run(r, 'echo B > b.txt && git commit -am "B"');
  ok(run(r, 'git rev-parse HEAD^{tree}') !== t1);
  run(r, 'git revert --no-edit HEAD');
  eq(run(r, 'git rev-parse HEAD^{tree}'), t1, 'same content, same tree id');
});
test('amend gives a new commit id; the old one is still in the reflog', () => {
  const r = base();
  const old = r.headId();
  run(r, 'git commit --amend -m "Initial commit"');
  ok(r.headId() !== old);
  eq(run(r, 'git cat-file -t ' + old), 'commit');
});
test('show-ref, symbolic-ref, .git/HEAD and .git/refs files', () => {
  const r = base();
  r.setupRemote();
  run(r, 'git tag v1 && git switch -c feat');
  const id = r.headId();
  eq(run(r, 'git show-ref'), `${id} refs/heads/feat\n${id} refs/heads/main\n${id} refs/remotes/origin/main\n${id} refs/tags/v1`);
  eq(run(r, 'git show-ref --heads'), `${id} refs/heads/feat\n${id} refs/heads/main`);
  eq(run(r, 'git symbolic-ref HEAD'), 'refs/heads/feat');
  eq(run(r, 'git rev-parse --symbolic-full-name HEAD'), 'refs/heads/feat');
  eq(run(r, 'cat .git/HEAD'), 'ref: refs/heads/feat');
  eq(run(r, 'cat .git/refs/heads/main'), id);
  eq(run(r, 'cat .git/refs/remotes/origin/main'), id);
  eq(run(r, 'ls .git/refs/heads'), 'feat\nmain');
  run(r, 'git switch --detach HEAD');
  eq(run(r, 'cat .git/HEAD'), id);
  ok(run(r, 'git symbolic-ref HEAD', false).includes('not a symbolic ref'));
  ok(run(r, 'cat .git/refs/heads/nope', false).includes('No such file'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
