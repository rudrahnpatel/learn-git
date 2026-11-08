# Bash course, units 9-12: Scripts, Conditions and loops, Processes and jobs, Story: the log detective

Built 2026-11-08 on a worktree branch, on top of units 1-8 and the `script` type. Design:
[bash-course-design.md](bash-course-design.md); the `script` type: [bash-script-exercise.md](bash-script-exercise.md);
units 5-8: [bash-course-units-5-8.md](bash-course-units-5-8.md); engine: [shell-engine.md](shell-engine.md).
This finishes the course: 12 units, 56 lessons.

## What
- **Content:** four new units in `js/content/bash/` (`scripts.js`, `flow.js`, `procs.js`, `story.js`), wired into
  `index.js` after `vars`: 18 lessons, 4 puzzles, 177 exercises (169 in lessons + 8 in puzzles).

  | unit (colour) | lessons (exercises) | lesson mix | puzzle |
  |---|---|---|---|
  | bash-scripts (sky) | Your first script (10) · Arguments (11) · Exit codes (10) · Debugging (10) | learn 12, choice 5, match 4, build 2, fill 4, order 1, outcome 3, type 4, script 6 | Toolbox: write `newproj.sh NAME` (script) + run `~/tools/total.sh notes/*.txt` (type) |
  | bash-flow (pink) | if and test (10) · elif and else (10) · for loops (9) · while and read (9) · Functions (9) | learn 12, choice 7, match 5, build 1, fill 5, order 1, outcome 5, type 5, script 6 | Night shift: `sizes.sh DIR` with a running total (script) + `.bak` every `.conf` with a for loop (type) |
  | bash-procs (sunbeam) | What's running (9) · Stopping things (9) · Find them by name (9) · Background jobs (9) | learn 10, choice 5, match 4, build 2, fill 4, order 1, outcome 2, type 8 | Runaway: a stubborn CPU hog (kill -9) + pkill workers, pgrep the server's PID into a file |
  | bash-story (red) | Day one on the server (9) · What broke? (9) · Busiest hour (9) · Automate it (9) · Clean-up (9) | learn 10, choice 6, match 4, build 1, fill 4, order 2, outcome 4, type 12, script 2 | The log detective: write `report.sh DIR` from scratch (usage + 3 facts, 3 runs) + tidy the server (type) |

  Totals across the whole course now: 583 exercises + 2 script fixtures; 106 type/script exercises have a variant,
  95 checks read output (the content test proves a hard-coded answer fails on each).
- **Cards:** 18 new command cards (one per lesson) in `js/content/bash/cards.js`; share-card labels `script ready`,
  `loop ready`, `kill ready`, `detective ready`.
- **Placement:** "I write scripts" (skip 8: start at Scripts). `tests/courses.test.mjs` checks all 12 units load and
  that skip 8 lands on `bash-scripts`.
- **Engine fixes** (each compared with bash 5.3 / coreutils 9 on this machine; tests in `tests/shell.test.mjs`):
  - `[ ]` / `test` now decide by the number of arguments first, as POSIX and bash do: `[ $n -gt 5 ]` with an
    empty n is `-gt: unary operator expected` (was "too many arguments"), `[ a b c ]` is `b: binary operator
    expected`, `[ -n ]` is true, `[ ! -d x ]` works.
  - `ps` lists only this terminal (pts/0: bash, its jobs, ps); `ps aux` / `-ef` / `-e` list everything, plus root's
    `/sbin/init` (pid 1). `setupProcess` takes `tty` (default `pts/1`, "another terminal"; `?` for services).
    `kill 1` is "Operation not permitted"; kill's usage line ends with `or kill -l [sigspec]`.
  - An empty file name (`"$1"` with no argument) is no file at all, not the current folder: `cp '' x`,
    `cat ''`, `ls ''`, `touch ''`, `rm ''`, `mkdir -p ''` fail as on Linux (`wc` says "invalid zero-length file name").
  - coreutils' quoting of names in messages: `cat: 'my notes.txt': No such file or directory` (cat, wc, cut, uniq,
    sort; grep and sed stay unquoted, as GNU's do).
  - cp/mv into a missing folder use coreutils 9 wording: `target 'public/': No such file or directory`,
    `cannot create regular file 'nodir/': Not a directory` (it used to create a file called nodir),
    `cannot move 'a' to 'nodir/x': No such file or directory`.
  - `wc` prints the total line whenever it was given more than one file, even if one is missing.
  - Errors inside `$( )` are reported at the outer command's line (`s.sh: line 6: nope: command not found`; it
    said line 1), while a function called from `$( )` keeps its own line numbers.
- **Tests and guards:**
  - `tests/content.test.mjs`: a lesson needs 1-3 `type` and 0-2 `script` exercises (at least one of either); puzzles
    may hold `script` exercises; type solutions now run as typed, one terminal line at a time (`a && b || c` is one
    line, as the learner types it), with the budget counting `&&` / `;` chains except inside one compound command.
  - `tests/shellex.test.mjs` replays solutions line by line too.
  - `tests/teach-order.test.mjs`: new items `var $1` ($1-$9), `var $0`, `var $#`, `var $@`, `var ${%}`, `op &`,
    `op >&`, and `[` / `test` word operators kept whole (`[ -gt`, not `[ -g` + `[ -t`), with parser tests.

## How
- Same schema and ramp as units 1-8: each lesson opens with a learn card (≤45 words), then recognise
  (choice/match/outcome), recall (fill/build/order), and ends with `type` and, in units 9, 10 and 12, 1-2 `script`
  exercises (fix a bug, fill a gap, write a short one; every script ≤ 10 lines so it fits a phone).
- Script anti-cheat uses both routes from the script note: a `variant` (other files) where the script reads files,
  and runs with different arguments or input (`[{ args: ['notes.txt'] }, { args: ['todo.txt'] }]`) where it doesn't.
  Usage-error runs declare `code: 1`.
- Scenario builders with a `v` switch, as before: `desk`/`argv`/`logs`/`workbench`/`toolbox` (unit 9),
  `yard`/`drafts`/`sized` (unit 10), `machine`/`jobsRunning` (unit 11), `shop` (unit 12). `machine(1)` starts one more
  service first, so every PID shifts and a typed-in PID or a pasted `ps` output fails the replay.
- The story's logs are generated (`day()` in `story.js`): one line per request, `date time LEVEL METHOD page
  status`, a busiest hour and a favourite page that win clearly (checked: no ties at the top of either ranking in
  either data set, since `sort -rn` would order ties by the line), and the failed checkouts late in the evening of
  the bad day. The variant has other dates, another busiest hour and errors on two pages.
- Checks compute the answer from the shell (`busiest(sh)`, `errorsIn`, `reportLines`, the jobs table), never a
  constant; process exercises without a variant (kill by PID found with `ps aux`) check state only (the right
  process gone, the others alive), since reading a PID off the screen is the lesson.

```mermaid
flowchart LR
  L1[9 Scripts: shebang, $1 $# "$@", exit / && / ||, bash -x, set -e] --> L2[10 if / [ ], elif / else, for, while read, functions]
  L2 --> L3[11 ps / ps aux, kill / -9, pgrep / pkill, & jobs fg]
  L3 --> L4[12 story: look around, grep -c ERROR, busiest hour, report.sh, clean-up]
  L4 --> P[capstone: report.sh from scratch + tidy the server]
```

## Why
- **Processes are a 4-lesson unit, not 3:** the content test wants 4-6 lessons per unit, and pgrep/pkill earned a
  lesson of their own between kill and jobs. Ctrl+C and Ctrl+Z are learn cards (the sandbox has nothing long-running
  to interrupt) and appear only in match pairs tagged with their concept.
- **`ps` shows this terminal only** because that is what a learner's machine does, and it makes the lesson's point
  (`ps` vs `ps aux`) real instead of a sentence.
- **Running type solutions as typed** (not split on `&&`): the learner's terminal runs a whole line; splitting made
  `grep -q ERROR f && echo yes || echo no` look like a failed `grep -q` on the no-error data set.
- **No `[[ ]]`, `case`, `basename`, `-mtime`:** out of the engine's scope or untaught; scripts use `[ ]`, globs and
  `"$f"` paths instead.
- **`"$1"/*.log`, star outside the quotes** is taught explicitly (story lesson 4) because the report script depends
  on it and it is the classic mistake.
- **bash 5.2's `jobs` column width kept** (Running padded to 24): bash 5.3 on this machine pads wider when job
  control is off; most learners (Ubuntu 24.04) run 5.2.

## Verification (2026-11-08)
- `node tools/precache.mjs`, then `node --test tests/`: 290 pass, 0 fail. Content: 1085 checked (500 git + 583 bash +
  2 script fixtures).
- Real bash (5.3.20, GNU coreutils, LC_ALL=C), files exported from the engine into a scratch home, replayed with a
  driver: every demo, type solution (setup and variant), script solution (setup and variant) and starter, and outcome
  command/distractor of units 9, 10 and 12: 149 runs; identical stdout, stderr, exit codes and final files, except
  `find`'s output order (directory order on disk; the checks are order-free) and coreutils' curly quotes (the engine
  uses ‘’ as a UTF-8 locale does). Process commands (ps, kill, pkill, pgrep, jobs, `&`) were deliberately **not** run
  on the host; unit 11 is checked by the engine tests and by reasoning about real output formats.
- Headless Chromium (CDP 9491, http 9492, fresh profile): all 177 exercises of units 9-12 render through
  `renderExercise` with `engine: 'shell'`; all 34 type solutions typed into the terminal grade right; all 28 cheats
  (the solution's output printed) are rejected; all 17 scripts Run (output shown) and grade right in the editor, and
  their cheat scripts and edited starters are rejected; no console errors. Phone 412x800 screenshot of
  `fl1-script-spaces` in the lesson player looked right (question, editor with gutter, Output/Files switch, red
  `[2: command not found` lines, Check). Course end: with every bash node done except the last, the current node is
  `bash-story:review`; with it done, home shows "You finished the whole path!"; 12 units, 105 nodes, last crate v1.0.0.
- Not verified: a real phone or screen reader; full lesson flow through the path for the new units; the `jobs`
  column width against bash 5.2.
