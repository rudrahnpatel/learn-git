// The Linux CLI & bash course: all 12 units, from the first prompt (1-4 "Terminal basics", 5-8 searching, text, permissions, variables) to scripts, conditions and loops, processes, and the log-detective story (9-12). Same schema as the git course
// (.notes/game-design.md), except that `setup`/`check` receive a js/shell.js Shell, live `type` exercises may give a
// `variant` setup (the anti-cheat replay) and a `max` command budget, the `outcome` type replaces `graph`, and unit
// `challenges` are inline puzzles ({ id, title, blurb, exercises }) played in the lesson player.
// See .notes/bash-course-design.md and .notes/bash-course-terminal-basics.md.
import steps from './steps.js';
import files from './files.js';
import reading from './reading.js';
import pipes from './pipes.js';
import search from './search.js';
import text from './text.js';
import perms from './perms.js';
import vars from './vars.js';
import scripts from './scripts.js';
import flow from './flow.js';
import procs from './procs.js';
import story from './story.js';

export const UNITS = [steps, files, reading, pipes, search, text, perms, vars, scripts, flow, procs, story];

export const unitById = (id) => UNITS.find((u) => u.id === id) || null;
export const lessonById = (id) => { for (const u of UNITS) for (const l of u.lessons) if (l.id === id) return l; return null; };
export const allExercises = () => UNITS.flatMap((u) => u.lessons.flatMap((l) => l.exercises.map((ex) => ({ ...ex, unit: u.id, lesson: l.id }))));
