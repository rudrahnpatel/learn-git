// The v2 course: units (v1 chapters) -> lessons -> exercises.
// Schema and the UI contract: .notes/game-design.md ("Exercise schema" and "Content notes").
import basics from './basics.js';
import branching from './branching.js';
import rewriting from './rewriting.js';
import undoing from './undoing.js';
import workflow from './workflow.js';
import remotes from './remotes.js';
import detective from './detective.js';
import github from './github.js';
import internals from './internals.js';
import story from './story.js';

export const UNITS = [basics, branching, rewriting, undoing, workflow, remotes, detective, github, internals, story];

export const unitById = (id) => UNITS.find((u) => u.id === id) || null;
export const lessonById = (id) => { for (const u of UNITS) for (const l of u.lessons) if (l.id === id) return l; return null; };
export const allExercises = () => UNITS.flatMap((u) => u.lessons.flatMap((l) => l.exercises.map((ex) => ({ ...ex, unit: u.id, lesson: l.id }))));
