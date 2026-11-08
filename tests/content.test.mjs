// Run: node tests/content.test.mjs   (no dependencies)
// Validates every exercise in js/content: schema, ids, answers, and that every live-repo
// exercise (learn demos, graph, type) actually behaves the way the content claims.
import { Repo } from '../js/git.js';
import { LEVELS } from '../js/levels.js';
import { UNITS } from '../js/content/index.js';
import { parseConflicts, resolveConflicts, hasMarkers, resolveTarget, gradeResolve } from '../js/conflicts.js';
import { UNITS as BASH_UNITS } from '../js/content/bash/index.js';
import { freshShell, replay, gradeShellType, readsOutput, cheatLine, outcomeOptions, outcomeProblems, gradeScript, scriptReadsOutput, cheatScript } from '../js/shellex.js';
import { SCRIPT_FIXTURES } from './fixtures/script-exercises.mjs';

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
// Commands the way the mini terminal sees them: one per line, `&&` / `;` chains split (not find's `\;`).
export const splitCommands = (s) => String(s).split(/\n|&&|(?<!\\);/).map((x) => x.trim()).filter(Boolean);

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

/* ============================================================== the bash course (js/content/bash) */
// Same schema rules, on a js/shell.js Shell. Live exercises:
//   type     fails right after setup; passes with its solution (at most 3 commands, or `max` for a puzzle); with a
//            `variant` the same holds on the variant's data. A check that reads the last output needs a variant,
//            and a hard-coded answer (the solution's output printed with printf) must fail on it.
//   outcome  every command runs, the options (generated by the engine) all differ: exactly one is right.
//   script   a file name, a starter and a solution (the file's text), 1-4 runs; the check fails right after setup and
//            with the starter as it is; the solution passes (every run exits with its `code`, 0 by default), on the
//            variant too. A check that reads output must reject a hard-coded script (one that prints the solution's
//            output whatever the files or input): through a variant, or through runs whose input differs.
const BTYPES = ['learn', 'choice', 'build', 'fill', 'match', 'order', 'outcome', 'type', 'script'];
const bCounts = Object.fromEntries(BTYPES.map((t) => [t, 0]));
const bIds = new Set();
let bVariants = 0, bOutputChecks = 0;
function checkBash(ex, { puzzle = false } = {}) {
  assert(BTYPES.includes(ex.type), `type ${ex.type} is not used in the bash course`);
  assert(str(ex.id), 'missing id');
  assert(!bIds.has(ex.id), `duplicate id ${ex.id}`);
  bIds.add(ex.id);
  if (ex.type !== 'learn') assert(str(ex.explain) && str(ex.prompt), 'missing prompt or explain');
  if ('new' in ex) assert(ex.new === true, 'new must be true when present');
  if (ex.type === 'learn') {
    assert(str(ex.title) && str(ex.body), 'learn needs title and body');
    assert(words(ex.body) <= 45, `learn body is ${words(ex.body)} words (max 45)`);
    if (ex.demo) {
      const sh = freshShell(ex.demo.setup);
      assert(Array.isArray(ex.demo.run) && ex.demo.run.length, 'demo.run must be a non-empty list');
      for (const c of ex.demo.run) { const r = sh.run(c); assert(r.ok, `demo: "${c}" failed:\n${r.lines.map((l) => l.t).join('\n')}`); }
    }
  } else if (ex.type === 'type') {
    assert(typeof ex.setup === 'function' && typeof ex.check === 'function' && str(ex.solution), 'type needs setup, check, solution');
    const cmds = splitCommands(ex.solution);
    const max = puzzle ? ex.max || 6 : 3;
    assert(cmds.length >= 1 && cmds.length <= max, `solution has ${cmds.length} commands (max ${max})`);
    assert(!ex.check(freshShell(ex.setup)), 'check is already true right after setup');
    const runAll = (setup, what) => {
      const sh = freshShell(setup);
      for (const c of cmds) { const r = sh.run(c); assert(r.ok, `${what}: "${c}" failed:\n${r.lines.map((l) => l.t).join('\n')}`); }
      return sh;
    };
    const live = runAll(ex.setup, 'solution');
    assert(ex.check(live), 'check is false after running the solution');
    if (ex.variant) {
      bVariants++;
      assert(typeof ex.variant === 'function', 'variant must be a setup function');
      assert(!ex.check(freshShell(ex.variant)), 'check is already true right after the variant setup');
      const v = runAll(ex.variant, 'solution on the variant');
      assert(ex.check(v), 'check is false after running the solution on the variant');
      assert(gradeShellType(ex, live, cmds).ok, 'gradeShellType rejects the solution');
    }
    if (readsOutput(ex, cmds)) {
      bOutputChecks++;
      assert(ex.variant, 'the check reads the last output, so it needs a variant (a hard-coded answer would pass)');
      const cheat = cheatLine(live.lastOut);
      assert(!gradeShellType(ex, replay(ex.setup, [cheat]), [cheat]).ok, `a hard-coded answer passes: ${cheat}`);
      assert(ex.variant && replay(ex.variant, cmds).lastOut !== live.lastOut, 'the variant prints the same output as the setup');
    }
  } else if (ex.type === 'script') {
    assert(typeof ex.setup === 'function' && typeof ex.check === 'function', 'script needs setup and check');
    assert(str(ex.file) && /^[\w.-]+$/.test(ex.file), 'script needs a plain file name (letters, digits, . _ -)');
    assert(typeof ex.starter === 'string' && str(ex.solution), 'script needs a starter (may be empty) and a solution');
    assert(ex.run === undefined || ex.run === 'bash' || ex.run === 'exec', 'run is bash (default) or exec');
    assert(Array.isArray(ex.runs) && ex.runs.length >= 1 && ex.runs.length <= 4, 'script needs 1-4 runs');
    for (const r of ex.runs) {
      assert(r.args === undefined || (Array.isArray(r.args) && r.args.every((a) => typeof a === 'string')), 'run args must be a list of strings');
      assert(r.stdin === undefined || typeof r.stdin === 'string', 'run stdin must be a string');
    }
    assert(ex.solution.trim() !== ex.starter.trim(), 'the solution is the starter unchanged');
    assert(!ex.check(freshShell(ex.setup)), 'check is already true right after setup');
    assert(!gradeScript(ex, ex.starter).live, 'the starter already passes the check');
    const sol = gradeScript(ex, ex.solution);
    const ran = sol.runs.filter((r) => !r.setup);
    ran.forEach((r, i) => assert(r.code === (ex.runs[i].code ?? 0), `solution run ${i + 1} (${r.cmd}) exits ${r.code}, want ${ex.runs[i].code ?? 0}:\n${r.err}`));
    assert(sol.live, 'check is false after running the solution');
    if (ex.variant) {
      bVariants++;
      assert(typeof ex.variant === 'function', 'variant must be a setup function');
      assert(!ex.check(freshShell(ex.variant)), 'check is already true right after the variant setup');
      assert(sol.variant, 'check is false after running the solution on the variant');
    }
    if (scriptReadsOutput(ex)) {
      bOutputChecks++;
      assert(!gradeScript(ex, cheatScript(ex)).ok, 'a hard-coded script (printing the solution\'s output) passes: add a variant or runs with different input');
      if (ex.variant) assert(gradeScript({ ...ex, setup: ex.variant, variant: null }, ex.solution).sh.lastOut !== sol.sh.lastOut, 'the variant prints the same output as the setup');
    }
  } else if (ex.type === 'outcome') {
    assert(typeof ex.setup === 'function' && str(ex.command), 'outcome needs setup and command');
    assert(['tree', 'output'].includes(ex.show), 'show must be tree or output');
    assert(Array.isArray(ex.distractors) && ex.distractors.length >= 1 && ex.distractors.length <= 3, 'needs 1-3 distractors');
    const p = outcomeProblems(ex);
    assert(!p.length, p.join('; '));
    assert(outcomeOptions(ex).opts.filter((o) => o.ok).length === 1, 'exactly one right option');
  } else {
    // the shared static types: same rules as the git course
    const { type } = ex;
    if (type === 'choice' || type === 'fill' || type === 'build' || type === 'match' || type === 'order') {
      const before = counts[type];
      checkExercise({ ...ex, id: '__bash__' + ex.id });
      counts[type] = before;
    }
  }
  bCounts[ex.type]++;
}
const bUnitIds = new Set(), bLessonIds = new Set();
let bTotal = 0;
for (const u of BASH_UNITS) {
  let uFail = 0, n = 0;
  try {
    assert(str(u.id) && !bUnitIds.has(u.id) && u.id.startsWith('bash-'), `bad or duplicate unit id ${u.id} (bash units start with bash-)`);
    bUnitIds.add(u.id);
    assert(str(u.title) && str(u.blurb), 'unit needs title and blurb');
    assert(COLORS.includes(u.color), `unit color ${u.color} not in ${COLORS}`);
    assert(u.lessons.length >= 4 && u.lessons.length <= 6, `unit has ${u.lessons.length} lessons (want 4-6)`);
    assert(Array.isArray(u.challenges) && u.challenges.length >= 1 && u.challenges.length <= 3, 'needs 1-3 challenges');
  } catch (e) { failed++; uFail++; console.log(`  FAIL unit ${u.id}: ${e.message}`); }
  for (const l of u.lessons) {
    try {
      assert(str(l.id) && !bLessonIds.has(l.id), `bad or duplicate lesson id ${l.id}`);
      bLessonIds.add(l.id);
      assert(str(l.title), 'lesson needs a title');
      assert(l.exercises.length >= 8 && l.exercises.length <= 12, `lesson has ${l.exercises.length} exercises (want 8-12)`);
      const typeCount = l.exercises.filter((e) => e.type === 'type').length;
      assert(typeCount >= 1 && typeCount <= 3, `lesson has ${typeCount} type exercises (want 1-3)`);
      assert(l.exercises[0].type === 'learn', 'a lesson opens with a learn card');
    } catch (e) { failed++; uFail++; console.log(`  FAIL lesson ${l.id}: ${e.message}`); }
    for (const ex of l.exercises) {
      n++;
      try { checkBash(ex); passed++; }
      catch (e) { failed++; uFail++; console.log(`  FAIL ${l.id} / ${ex.id || '(no id)'} [${ex.type}]\n       ${e.message.split('\n').join('\n       ')}`); }
    }
  }
  for (const c of u.challenges || []) {
    try {
      assert(c && str(c.id) && str(c.title) && str(c.blurb), 'a bash challenge is { id, title, blurb, exercises }');
      assert(!bLessonIds.has(c.id), `challenge id ${c.id} clashes with a lesson id`);
      assert(Array.isArray(c.exercises) && c.exercises.length >= 1 && c.exercises.length <= 4, 'a challenge has 1-4 exercises');
      assert(c.exercises.every((e) => e.type === 'type'), 'challenge exercises are type exercises');
    } catch (e) { failed++; uFail++; console.log(`  FAIL challenge ${c?.id}: ${e.message}`); continue; }
    for (const ex of c.exercises) {
      n++;
      try { checkBash(ex, { puzzle: true }); passed++; }
      catch (e) { failed++; uFail++; console.log(`  FAIL ${c.id} / ${ex.id || '(no id)'} [${ex.type}]\n       ${e.message.split('\n').join('\n       ')}`); }
    }
  }
  bTotal += n;
  console.log(`${uFail ? 'FAIL' : 'ok  '} ${u.id.padEnd(13)} ${u.lessons.length} lessons, ${n} exercises, challenges: ${u.challenges.map((c) => c.id).join(', ')}`);
}
// The `script` type has no lesson content yet (units 9+): its test-only fixtures go through the same rules.
for (const ex of SCRIPT_FIXTURES) {
  try { checkBash(ex); passed++; console.log(`ok   fixture ${ex.id}`); }
  catch (e) { failed++; console.log(`  FAIL fixture ${ex.id} [script]\n       ${e.message.split('\n').join('\n       ')}`); }
}
console.log(`\nbash: ${bTotal} exercises (+ ${SCRIPT_FIXTURES.length} script fixtures): ` + BTYPES.map((t) => `${t} ${bCounts[t]}`).join(' · ') + ` · ${bVariants} with a variant (${bOutputChecks} read the output)`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
