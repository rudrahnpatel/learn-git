// Run: node --test tests/conflicts.test.mjs
// The conflict editor's checking logic (js/conflicts.js): parsing markers, resolving hunks by choice or by hand,
// and grading the `resolve` exercises through their state-based checks, the way the lesson player does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Repo } from '../js/git.js';
import { parseConflicts, resolveConflicts, hunkLines, hasMarkers, conflictedFiles, resolveTarget, gradeResolve } from '../js/conflicts.js';
import { parseConflicts as surgeonParse } from '../js/panels.js';
import { allExercises } from '../js/content/index.js';

const fresh = (setup) => { const r = new Repo(); setup(r); r.setupDone(); return r; };
const byId = (id) => allExercises().find((e) => e.id === id);
// resolve a fresh copy of an exercise's repo with these choices (and hand edits) and grade it
function play(ex, choices, edits = []) {
  const r = fresh(ex.setup);
  const file = resolveTarget(ex, r);
  const text = resolveConflicts(parseConflicts(r.s.work[file]), choices, edits);
  return { ok: gradeResolve(ex, r, text, file), text, r };
}

const TWO = 'top\n<<<<<<< HEAD\na1\n=======\nb1\n>>>>>>> feature\nmiddle\n<<<<<<< HEAD\na2\n=======\n>>>>>>> feature\nend\n';

test('parseConflicts splits text and hunks, with labels', () => {
  const segs = parseConflicts(TWO);
  assert.deepEqual(segs.map((s) => (s.text ? 'text' : 'hunk')), ['text', 'hunk', 'text', 'hunk', 'text']);
  assert.deepEqual(segs[1].hunk, { ours: ['a1'], theirs: ['b1'], oursLabel: 'HEAD', theirsLabel: 'feature' });
  assert.deepEqual(segs[3].hunk.theirs, []);
});

test('an unterminated region stays plain text', () => {
  const segs = parseConflicts('x\n<<<<<<< HEAD\nours\n=======\ntheirs\n');
  assert.equal(segs.filter((s) => s.hunk).length, 0);
  assert.equal(resolveConflicts(segs, []), 'x\n<<<<<<< HEAD\nours\n=======\ntheirs\n');
});

test('resolveConflicts: ours, theirs, both, both-rev and a hand edit', () => {
  const segs = parseConflicts(TWO);
  assert.equal(resolveConflicts(segs, ['ours', 'ours']), 'top\na1\nmiddle\na2\nend\n');
  assert.equal(resolveConflicts(segs, ['theirs', 'theirs']), 'top\nb1\nmiddle\nend\n');
  assert.equal(resolveConflicts(segs, ['both', 'both-rev']), 'top\na1\nb1\nmiddle\na2\nend\n');
  assert.equal(resolveConflicts(segs, ['edit', 'theirs'], ['merged 1\nmerged 2']), 'top\nmerged 1\nmerged 2\nmiddle\nend\n');
  assert.equal(resolveConflicts(segs, ['edit', 'ours'], ['']), 'top\nmiddle\na2\nend\n', 'an empty edit drops the hunk');
});

test('an unresolved hunk keeps its markers, so the text round-trips', () => {
  const segs = parseConflicts(TWO);
  assert.equal(resolveConflicts(segs, []), TWO);
  assert.ok(hasMarkers(resolveConflicts(segs, ['ours'])));
  assert.ok(!hasMarkers(resolveConflicts(segs, ['ours', 'theirs'])));
  assert.deepEqual(hunkLines(segs[1].hunk, null), ['<<<<<<< HEAD', 'a1', '=======', 'b1', '>>>>>>> feature']);
});

test('the conflict surgeon uses the same parser', () => {
  assert.equal(surgeonParse, parseConflicts);
});

test('conflictedFiles and resolveTarget find the file with markers', () => {
  const r = new Repo();
  r.setupFiles({ 'a.txt': 'fine', 'b.txt': TWO, 'c.txt': '======= not a marker on its own' });
  assert.deepEqual(conflictedFiles(r), ['b.txt']);
  assert.equal(resolveTarget({}, r), 'b.txt');
  assert.equal(resolveTarget({ file: 'a.txt' }, r), 'a.txt');
});

test('gradeResolve writes the file into the working tree and runs the check', () => {
  const r = new Repo();
  r.setupFiles({ 'b.txt': TWO });
  const ex = { check: (repo) => repo.s.work['b.txt'] === 'top\na1\nmiddle\na2\nend\n' };
  assert.equal(gradeResolve(ex, r, 'top\na1\nmiddle\na2\nend'), true, 'a missing final newline is normalised');
  assert.equal(gradeResolve({ check: () => { throw new Error('boom'); } }, r, 'x', 'b.txt'), false, 'a throwing check is a fail');
});

test('br4-resolve-both: only "keep both", ours first, passes', () => {
  const ex = byId('br4-resolve-both');
  assert.equal(ex.type, 'resolve');
  assert.equal(play(ex, ['both']).ok, true);
  assert.equal(play(ex, ['ours']).ok, false);
  assert.equal(play(ex, ['theirs']).ok, false);
  assert.equal(play(ex, ['both-rev']).ok, false);
  assert.equal(play(ex, []).ok, false);
  assert.equal(play(ex, ['edit'], ['Starter: pumpkin soup\nStarter: asparagus salad']).ok, true, 'typing it by hand also works');
});

test('st3-type-resolve: keeps its id, is a resolve exercise, and needs a hand edit', () => {
  const ex = byId('st3-type-resolve');
  assert.equal(ex.type, 'resolve');
  const r = fresh(ex.setup);
  assert.equal(r.s.seq?.kind, 'rebase', 'it starts mid-rebase');
  assert.deepEqual(conflictedFiles(r), ['index.html']);
  for (const c of ['ours', 'theirs', 'both', 'both-rev']) assert.equal(play(ex, [c]).ok, false, `"${c}" alone must not pass`);
  assert.equal(play(ex, ['edit'], ['<nav>Home Menu Order</nav>']).ok, true);
  assert.equal(play(ex, ['edit'], ['<nav>Home Order Menu</nav>']).ok, true, 'either link order is fine');
  assert.equal(play(ex, ['edit'], ['  <nav>Home  Menu Order</nav>  ']).ok, false, 'the nav must be a clean line');
  assert.equal(play(ex, ['edit'], ['<nav>Home Menu Order</nav>\n=======']).ok, false, 'a stray ======= line fails');
  assert.equal(play(ex, ['edit'], ['<nav>Home Menu</nav>\n<nav>Home Order</nav>']).ok, false, 'two navs fail');
  assert.equal(play(ex, ['edit'], ['<<<<<<< HEAD\n<nav>Home Menu Order</nav>']).ok, false, 'a leftover marker fails');
});

test('after st3-type-resolve, st3-type-continue finishes the rebase in the terminal', () => {
  const ex = byId('st3-type-continue');
  assert.equal(ex.type, 'type');
  const r = fresh(ex.setup);
  assert.equal(r.s.seq?.kind, 'rebase');
  assert.ok(!hasMarkers(r.s.work['index.html']));
  for (const c of ex.solution.split('&&')) r.run(c.trim());
  assert.ok(ex.check(r));
});
