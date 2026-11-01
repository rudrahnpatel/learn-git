// Run: node tests/levels.test.mjs
// Plays every level's `solution` through the engine and its goal checker.
import { QUESTIONS, isCorrect } from '../js/speed.js';
import { LEVELS, CHAPTERS, SANDBOX, buildRepo, applyStep, parOf, makeBisectHunt, targetGraph } from '../js/levels.js';

let passed = 0, failed = 0;
const ids = new Set();
function play(level) {
  const r = buildRepo(level);
  const before = level.check(r);
  if (before.length && before.every(([, ok]) => ok)) throw new Error('goal is already met before playing');
  let moves = 0;
  for (const step of level.solution) {
    const fp = r.fingerprint();
    const res = applyStep(r, step);
    if (r.fingerprint() !== fp) moves++;
    const label = typeof step === 'string' ? step : JSON.stringify(step);
    // A step may legitimately "fail" (exit 1) only when it stops for a conflict.
    if (!res.ok && !r.inProgress()) throw new Error(`step failed: ${label}\n${res.lines.map((l) => l.t).join('\n')}`);
  }
  const after = level.check(r);
  const bad = after.filter(([, ok]) => !ok);
  if (bad.length) throw new Error('unmet: ' + bad.map(([l]) => l).join('; '));
  if (moves > parOf(level)) throw new Error(`solution uses ${moves} moves, par is ${parOf(level)}`);
  if (level.target) targetGraph(level);
  return moves;
}

for (const ch of CHAPTERS) {
  const levels = LEVELS.filter((l) => l.chapter === ch.id);
  console.log(`${ch.title} (${levels.length})`);
  for (const level of levels) {
    try {
      if (ids.has(level.id)) throw new Error('duplicate id');
      ids.add(level.id);
      for (const f of ['title', 'concept', 'goal', 'debrief']) if (!level[f]) throw new Error(`missing ${f}`);
      if (level.hints.length < 2) throw new Error('needs 2-3 hints');
      const moves = play(level);
      passed++;
      console.log(`  ok   ${level.id.padEnd(18)} ${moves} moves (par ${parOf(level)})`);
    } catch (e) {
      failed++;
      console.log(`  FAIL ${level.id}\n       ${e.message.split('\n').join('\n       ')}`);
    }
  }
}
const orphans = LEVELS.filter((l) => !CHAPTERS.some((c) => c.id === l.chapter));
if (orphans.length) { failed++; console.log('FAIL levels without chapter: ' + orphans.map((l) => l.id)); }

console.log('Arcade');
for (const [name, mk] of [['bisect hunt (5 seeds)', () => [1, 2, 3, 99, 12345].map((s) => makeBisectHunt(s))], ['sandbox builds', () => [SANDBOX]]]) {
  try {
    for (const lv of mk()) { if (lv.sandbox) buildRepo(lv); else play(lv); }
    passed++; console.log(`  ok   ${name}`);
  } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

console.log('Speed round');
try {
  const bad = QUESTIONS.filter((q) => !isCorrect(q, q.show));
  if (bad.length) throw new Error('canonical answer rejected: ' + bad.map((q) => q.show).join(', '));
  const extra = [['git checkout -b hotfix', 3], ['git diff --cached', 11], ['git log --all --graph --oneline', 35], ['git reset HEAD app.js', 5]];
  for (const [ans, i] of extra) if (!isCorrect(QUESTIONS[i], ans)) throw new Error(`equivalent form rejected: ${ans}`);
  if (isCorrect(QUESTIONS[3], 'git branch hotfix')) throw new Error('wrong answer accepted');
  passed++; console.log(`  ok   ${QUESTIONS.length} questions accept their answers`);
} catch (e) { failed++; console.log(`  FAIL speed round\n       ${e.message}`); }

console.log(`\n${LEVELS.length} levels · ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
