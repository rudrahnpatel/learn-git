// The commit graph's text alternative (js/graph.js describeGraph), read by screen readers as the svg's name.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Repo } from '../js/git.js';
import { describeGraph } from '../js/graph.js';

const repo = (cmds) => { const r = new Repo(); r.setupDone(); for (const c of cmds) r.run(c); return r; };

test('an empty repo says so', () => {
  assert.equal(describeGraph(repo([]).graphData()), 'Commit graph: no commits yet.');
});

test('names HEAD, every branch and tag, and each commit with its parent', () => {
  const r = repo(['echo a > a.txt', 'git add a.txt', 'git commit -m "first"', 'git tag v1', 'git switch -c feature',
    'echo b > b.txt', 'git add b.txt', 'git commit -m "second"']);
  const d = r.graphData();
  const t = describeGraph(d);
  const [c1, c2] = d.commits.map((c) => c.id);
  assert.match(t, /^Commit graph, 2 commits\./);
  assert.match(t, new RegExp(`HEAD is on feature at ${c2}\\.`));
  assert.match(t, new RegExp(`Branches: .*main at ${c1}`));
  assert.match(t, new RegExp(`feature at ${c2}`));
  assert.match(t, new RegExp(`Tags: v1 at ${c1}\\.`));
  assert.match(t, new RegExp(`${c1} "first", first commit; ${c2} "second", after ${c1}\\.`));
});

test('a detached HEAD and a merge commit are spelled out', () => {
  const r = repo(['echo a > a.txt', 'git add a.txt', 'git commit -m "one"', 'git switch -c side', 'echo b > b.txt', 'git add b.txt',
    'git commit -m "two"', 'git switch main', 'echo c > c.txt', 'git add c.txt', 'git commit -m "three"', 'git merge side -m "merge side"']);
  const d = r.graphData();
  const merge = d.commits[d.commits.length - 1];
  assert.equal(merge.parents.length, 2);
  assert.match(describeGraph(d), new RegExp(`${merge.id} "merge side", merge of ${merge.parents[0]} and ${merge.parents[1]}`));
  r.run(`git switch --detach ${d.commits[0].id}`);
  assert.match(describeGraph(r.graphData()), new RegExp(`HEAD is detached at ${d.commits[0].id}\\.`));
});

test('long histories keep the newest commits only', () => {
  const cmds = [];
  for (let i = 0; i < 20; i++) cmds.push(`echo ${i} > f.txt`, 'git add f.txt', `git commit -m "c${i}"`);
  const t = describeGraph(repo(cmds).graphData(), { max: 5 });
  assert.match(t, /20 commits\. .*Newest 5 commits:/);
  assert.ok(t.includes('"c19"') && !t.includes('"c14"'));
});
