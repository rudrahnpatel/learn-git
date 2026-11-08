// Run: node tests/content.test.mjs   (no dependencies)
// Validates every exercise in js/content: schema, ids, answers, and that every live-repo
// exercise (learn demos, graph, type) actually behaves the way the content claims.
import { Repo } from '../js/git.js';
import { LEVELS } from '../js/levels.js';
import { UNITS } from '../js/content/index.js';
import { parseConflicts, resolveConflicts, hasMarkers, resolveTarget, gradeResolve } from '../js/conflicts.js';

const COLORS = ['yellow', 'red', 'green', 'sky', 'pink', 'sunbeam'];
const TYPES = ['learn', 'choice', 'build', 'fill', 'match', 'order', 'graph', 'type', 'resolve'];
let passed = 0, failed = 0;
const ids = new Set();
const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const words = (html) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

function fresh(setup) {
  const r = new Repo();
  setup(r);
  r.setupDone();
  return r;
}
function runOk(r, cmd, what) {
  const res = r.run(cmd);
  if (!res.ok) throw new Error(`${what}: "${cmd}" failed:\n${res.lines.map((l) => l.t).join('\n')}`);
}
// Commands the way the mini terminal sees them: one per line, `&&` / `;` chains split.
export const splitCommands = (s) => String(s).split(/\n|&&|;/).map((x) => x.trim()).filter(Boolean);

// A graph's visible identity: shape (parents, orphans) plus refs, independent of commit ids.
function graphKey(g) {
  const idx = new Map(g.commits.map((c, i) => [c.id, i]));
  const at = (id) => (id == null ? null : idx.has(id) ? idx.get(id) : '?');
  const refs = (o) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, at(v)]);
  return JSON.stringify({
    commits: g.commits.map((c) => [c.parents.map(at), !!c.ghost]),
    branches: refs(g.branches), tags: refs(g.tags), remotes: refs(g.remotes),
    head: [g.head.branch, at(g.head.id)],
  });
}

function checkExercise(ex) {
  assert(TYPES.includes(ex.type), `unknown type ${ex.type}`);
  assert(str(ex.id), 'missing id');
  assert(!ids.has(ex.id), `duplicate id ${ex.id}`);
  ids.add(ex.id);
  if (ex.type !== 'learn') assert(str(ex.explain), 'missing explain');
  if ('new' in ex) assert(ex.new === true, 'new must be true when present');
  if (ex.type !== 'learn' && ex.type !== 'graph') assert(str(ex.prompt), 'missing prompt');
  switch (ex.type) {
    case 'learn': {
      assert(str(ex.title) && str(ex.body), 'learn needs title and body');
      assert(words(ex.body) <= 45, `learn body is ${words(ex.body)} words (max 45)`);
      if (ex.demo) {
        const r = fresh(ex.demo.setup);
        assert(Array.isArray(ex.demo.run) && ex.demo.run.length, 'demo.run must be a non-empty list');
        for (const c of ex.demo.run) runOk(r, c, 'demo');
      }
      break;
    }
    case 'choice': case 'fill': {
      assert(Array.isArray(ex.options) && ex.options.length >= 2 && ex.options.length <= 4, 'needs 2-4 options');
      assert(new Set(ex.options).size === ex.options.length, 'duplicate options');
      assert(Number.isInteger(ex.answer) && ex.answer >= 0 && ex.answer < ex.options.length, 'answer out of range');
      if (ex.type === 'fill') assert(typeof ex.before === 'string' && typeof ex.after === 'string', 'fill needs before/after');
      break;
    }
    case 'build': {
      assert(Array.isArray(ex.tiles) && Array.isArray(ex.answers) && ex.answers.length, 'build needs tiles and answers');
      const pool = {};
      for (const t of ex.tiles) pool[t] = (pool[t] || 0) + 1;
      for (const a of ex.answers) {
        const use = {};
        for (const t of a) {
          use[t] = (use[t] || 0) + 1;
          assert(use[t] <= (pool[t] || 0), `answer "${a.join(' ')}" uses tile "${t}" more than offered`);
        }
      }
      assert(new Set(ex.answers.map((a) => a.join('\u0001'))).size === ex.answers.length, 'duplicate answers');
      const spare = ex.tiles.length - ex.answers[0].length;
      assert(spare >= 2 && spare <= 4, `first answer leaves ${spare} distractor tiles (want 2-4)`);
      break;
    }
    case 'match': {
      assert(Array.isArray(ex.pairs) && ex.pairs.length >= 4 && ex.pairs.length <= 5, 'needs 4-5 pairs');
      const L = ex.pairs.map((p) => p[0]), R = ex.pairs.map((p) => p[1]);
      assert(ex.pairs.every((p) => p.length === 2 && str(p[0]) && str(p[1])), 'pairs must be [left, right] strings');
      assert(new Set(L).size === L.length && new Set(R).size === R.length, 'duplicate side in pairs');
      break;
    }
    case 'order': {
      assert(Array.isArray(ex.steps) && ex.steps.length >= 3 && ex.steps.length <= 5, 'needs 3-5 steps');
      assert(new Set(ex.steps).size === ex.steps.length, 'duplicate steps');
      break;
    }
    case 'graph': {
      assert(str(ex.prompt) && str(ex.command), 'graph needs prompt and command');
      assert(Array.isArray(ex.distractors) && ex.distractors.length >= 1 && ex.distractors.length <= 3, 'needs 1-3 distractors');
      const r = fresh(ex.setup);
      const start = graphKey(r.graphData());
      runOk(r, ex.command, 'graph command');
      const right = graphKey(r.graphData());
      assert(right !== start, 'the command does not change the graph');
      const seen = new Set([right]);
      for (const d of ex.distractors) {
        const rd = fresh(ex.setup);
        for (const c of d) runOk(rd, c, 'distractor');
        const k = graphKey(rd.graphData());
        assert(k !== right, `distractor [${d.join(', ')}] gives the same graph as the answer`);
        assert(!seen.has(k), `distractor [${d.join(', ')}] duplicates another option`);
        seen.add(k);
      }
      break;
    }
    case 'type': {
      assert(typeof ex.setup === 'function' && typeof ex.check === 'function' && str(ex.solution), 'type needs setup, check, solution');
      for (const a of ex.accept || []) new RegExp(a);
      const r = fresh(ex.setup);
      assert(!ex.check(r), 'check is already true right after setup');
      const cmds = splitCommands(ex.solution);
      assert(cmds.length >= 1 && cmds.length <= 3, `solution has ${cmds.length} commands (max 3)`);
      for (const c of cmds) runOk(r, c, 'solution');
      assert(ex.check(r), 'check is false after running the solution');
      break;
    }
    case 'resolve': {
      assert(typeof ex.setup === 'function' && typeof ex.check === 'function' && str(ex.solution), 'resolve needs setup, check, solution');
      const r = fresh(ex.setup);
      const file = resolveTarget(ex, r);
      assert(file && hasMarkers(r.s.work[file]), `setup leaves no conflict markers in ${file || 'any file'}`);
      const hunks = parseConflicts(r.s.work[file]).filter((s) => s.hunk);
      assert(hunks.length >= 1 && hunks.length <= 3, `${file} has ${hunks.length} conflicts (want 1-3)`);
      assert(!ex.check(r), 'check is already true right after setup');
      assert(!hasMarkers(ex.solution), 'the solution still has conflict markers');
      assert(gradeResolve(ex, fresh(ex.setup), ex.solution), 'check is false for the solution text');
      // leaving every hunk unresolved must never pass
      const segs = parseConflicts(fresh(ex.setup).s.work[file]);
      assert(!gradeResolve(ex, fresh(ex.setup), resolveConflicts(segs, []), file), 'check passes with the markers left in');
      break;
    }
  }
  counts[ex.type]++;
}

const levelIds = new Set(LEVELS.map((l) => l.id));
const unitIds = new Set(), lessonIds = new Set();
let total = 0;
for (const u of UNITS) {
  let uFail = 0, n = 0;
  try {
    assert(str(u.id) && !unitIds.has(u.id), `bad or duplicate unit id ${u.id}`);
    unitIds.add(u.id);
    assert(str(u.title) && str(u.blurb), 'unit needs title and blurb');
    assert(COLORS.includes(u.color), `unit color ${u.color} not in ${COLORS}`);
    assert(u.lessons.length >= 4 && u.lessons.length <= 6, `unit has ${u.lessons.length} lessons (want 4-6)`);
    assert(Array.isArray(u.challenges) && u.challenges.length >= 1 && u.challenges.length <= 3, 'needs 1-3 challenges');
    for (const c of u.challenges) assert(levelIds.has(c), `challenge ${c} is not a level id`);
  } catch (e) { failed++; uFail++; console.log(`  FAIL unit ${u.id}: ${e.message}`); }
  for (const l of u.lessons) {
    try {
      assert(str(l.id) && !lessonIds.has(l.id), `bad or duplicate lesson id ${l.id}`);
      lessonIds.add(l.id);
      assert(str(l.title), 'lesson needs a title');
      assert(l.exercises.length >= 8 && l.exercises.length <= 12, `lesson has ${l.exercises.length} exercises (want 8-12)`);
      const typeCount = l.exercises.filter((e) => e.type === 'type').length;
      assert(typeCount >= 1 && typeCount <= 3, `lesson has ${typeCount} type exercises (want 1-3)`);
      assert(l.exercises[0].type === 'learn', 'a lesson opens with a learn card');
    } catch (e) { failed++; uFail++; console.log(`  FAIL lesson ${l.id}: ${e.message}`); }
    for (const ex of l.exercises) {
      n++;
      try { checkExercise(ex); passed++; }
      catch (e) { failed++; uFail++; console.log(`  FAIL ${l.id} / ${ex.id || '(no id)'} [${ex.type}]\n       ${e.message.split('\n').join('\n       ')}`); }
    }
  }
  total += n;
  console.log(`${uFail ? 'FAIL' : 'ok  '} ${u.id.padEnd(10)} ${u.lessons.length} lessons, ${n} exercises, challenges: ${u.challenges.join(', ')}`);
}
console.log(`\n${total} exercises: ` + TYPES.map((t) => `${t} ${counts[t]}`).join(' · '));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
