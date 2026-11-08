// Pure helpers for the bash course's live exercises (no DOM): building a shell for an exercise, grading a `type`
// exercise with the "re-run on new data" anti-cheat, and generating an `outcome` exercise's options by running the
// engine. Shared by the lesson player (js/ui/exercises.js) and the content tests (tests/bash-content.test.mjs).
// See .notes/bash-course-terminal-basics.md.
import { Shell } from './shell.js';

// A ready shell for an exercise: setup(sh) builds the files, then setupDone() clears history and output.
export function freshShell(setup) {
  const sh = new Shell();
  if (setup) setup(sh);
  return sh.setupDone();
}

// The command lines a learner typed, one per entry, replayed in order on a shell. Returns the shell.
export function replay(setup, lines) {
  const sh = freshShell(setup);
  for (const l of lines) sh.run(l);
  return sh;
}

const passes = (check, sh) => { try { return !!check(sh); } catch { return false; } };

// Grading a bash `type` exercise. `sh` is the live shell the learner typed into, `lines` what they typed.
//   ok        the check passes on the live shell, and (when the exercise has a `variant`) also when the same lines
//             are replayed on the variant's data. A hard-coded answer (`echo 42`) passes the first and fails the second.
//   live      the check on the live shell alone
//   variant   the check on the replay (null without a variant)
export function gradeShellType(ex, sh, lines) {
  const live = passes(ex.check, sh);
  if (!ex.variant) return { ok: live, live, variant: null };
  const variant = live ? passes(ex.check, replay(ex.variant, lines)) : false;
  return { ok: live && variant, live, variant };
}
// What the feedback sheet says when only the variant failed.
export const VARIANT_NOTE = 'It worked on these files, but not when the same commands ran on a second set of files with different contents. Did you type the answer in yourself? Use commands that work it out.';

// Does a check read the last command's output? Run the solution, then blank the output: if the check now fails,
// it depended on it. The content test uses this to require a `variant` on every such exercise.
export function readsOutput(ex, lines) {
  const sh = replay(ex.setup, lines);
  if (!passes(ex.check, sh)) return false;
  sh.lastOut = ''; sh.lastErr = '';
  return !passes(ex.check, sh);
}
// A hard-coded answer: a command that prints exactly what the solution printed, without looking at any file.
export function cheatLine(text) {
  const ls = String(text).replace(/\n$/, '').split('\n');
  return 'printf \'%s\\n\' ' + ls.map((l) => "'" + l.replace(/'/g, "'\\''") + "'").join(' ');
}

/* ------------------------------------------------------------------ the file tree as text */
// One line per entry, indented, folders with a trailing slash, executables with a star, the current folder marked.
// Used to compare outcome options and as their screen-reader text.
export function treeLines(sh, { hidden = false } = {}) {
  const t = sh.treeView({ hidden });
  const out = [];
  const walk = (n, depth) => {
    out.push(`${'  '.repeat(depth)}${n.name}${n.type === 'dir' && depth ? '/' : ''}${n.exec ? '*' : ''}${n.cwd ? '  (you are here)' : ''}`);
    for (const c of n.children || []) walk(c, depth + 1);
  };
  if (t) walk(t, 0);
  return out;
}

/* ------------------------------------------------------------------ outcome */
// An outcome exercise: { setup, command, show: 'tree' | 'output', distractors: [[cmd...]...], peek?: [file...] }.
// Every option is what the engine produces: the answer runs `command`, each distractor runs its commands, all from
// the same setup. Options that would look identical are dropped (the content test forbids them).
function resultOf(ex, cmds) {
  const sh = freshShell(ex.setup);
  let out = '', ok = true;
  for (const c of cmds) { const r = sh.run(c); ok = ok && r.ok; out = sh.lastOut; }
  const value = ex.show === 'output' ? out.replace(/\n$/, '') : treeLines(sh, { hidden: !!ex.hidden }).join('\n');
  return { sh, value, ok };
}
export function outcomeOptions(ex) {
  const start = freshShell(ex.setup);
  const right = resultOf(ex, [ex.command]);
  const opts = [{ value: right.value, ok: true, sh: right.sh }];
  const seen = new Set([right.value]);
  for (const d of ex.distractors || []) {
    const r = resultOf(ex, d);
    if (seen.has(r.value)) continue;
    seen.add(r.value);
    opts.push({ value: r.value, ok: false, sh: r.sh, cmds: d });
  }
  return { start, right, opts };
}
// For the content test: every command runs cleanly, every option differs, exactly one is right.
export function outcomeProblems(ex) {
  const p = [];
  const right = resultOf(ex, [ex.command]);
  if (!right.ok) p.push(`the command "${ex.command}" fails`);
  if (ex.show === 'tree' && right.value === treeLines(freshShell(ex.setup), { hidden: !!ex.hidden }).join('\n')) p.push('the command does not change the tree');
  if (ex.show === 'output' && !right.value.trim()) p.push('the command prints nothing');
  const seen = new Map([[right.value, 'the answer']]);
  for (const d of ex.distractors || []) {
    const r = resultOf(ex, d);
    if (!r.ok) p.push(`distractor [${d.join(', ')}] fails`);
    if (seen.has(r.value)) p.push(`distractor [${d.join(', ')}] gives the same result as ${seen.get(r.value)}`);
    seen.set(r.value, `[${d.join(', ')}]`);
  }
  return p;
}
