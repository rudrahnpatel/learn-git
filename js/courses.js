// The course registry: every course the app knows, in the order the switcher lists them. Pure (no DOM, no
// game state), so tests and /admin can import it. See .notes/settings-and-course-switcher.md.
//
// A course entry:
//   id          short slug; also the key of its progress in the save (courses[<id>]; git's predates that and
//               keeps its per-course fields at the top level, see js/storage.js)
//   title       shown in the switcher and the home course pill
//   short       a short name for the pill on narrow screens
//   blurb       one line in the switcher
//   icon        inline SVG (currentColor), drawn on the course's accent fill
//   accent      a fill colour name from the unit palette (css --yellow, --sky, --green, --pink, --red, --sunbeam)
//   available   true when the course can be played in this build
//   comingSoon  listed in the switcher but not selectable
//   load()      async, resolves to the course's UNITS (same shape as js/content/index.js). Loaded lazily, only
//               when the course is opened or the switcher counts its lessons.
//   engine      what `setup`/`check` receive in live exercises: 'git' (a js/git.js Repo) or 'shell' (a js/shell.js
//               Shell). The lesson player builds the matching one and shows the commit graph or the file tree.
//   placements  the "how much do you know?" answers asked the first time the course is opened (git asks in
//               onboarding, js/ui/game.js PLACEMENTS): { label, note, skip } where skip is the number of units marked
//               as skipped. Only units that exist may be skipped.
// Reward words per course live in js/brand.js (REWARD_SETS); a course without its own set gets the neutral one.

const GIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M7 9c0 4 10 2 10 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="7" cy="5" r="2.6" fill="currentColor"/><circle cx="7" cy="19" r="2.6" fill="currentColor"/><circle cx="17" cy="17" r="2.6" fill="currentColor"/></svg>';
const BASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M6 9.5l3.5 2.5L6 14.5M11.5 15.5H17" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const DEFAULT_COURSE = 'git';
export const engineOf = (id) => courseById(id)?.engine || 'git';

export const COURSES = [
  {
    id: 'git', title: 'Git', short: 'Git', blurb: 'Commits, branches, rebases and rescues on a live repo.',
    icon: GIT_ICON, accent: 'yellow', available: true, engine: 'git',
    load: () => import('./content/index.js').then((m) => m.UNITS),
  },
  {
    id: 'bash', title: 'Linux CLI & bash', short: 'bash', blurb: 'Files, pipes, permissions and scripts in a real shell.',
    icon: BASH_ICON, accent: 'green', available: true, engine: 'shell',
    load: () => import('./content/bash/index.js').then((m) => m.UNITS),
    // the first release has units 1-4 (Terminal basics), so placement can skip at most three of them
    placements: [
      { label: 'I\'ve never used a terminal', note: 'Start at the very first prompt.', skip: 0 },
      { label: 'I can move around', note: 'Skip first steps: start with files and folders.', skip: 1 },
      { label: 'I copy, move and read files', note: 'Start at pipes and redirection.', skip: 3 },
    ],
  },
];

export const courseById = (id) => COURSES.find((c) => c.id === id) || null;
// Can be opened in this build: available, not coming soon, and has a loader.
export const isPlayable = (c) => !!(c && c.available && !c.comingSoon && typeof c.load === 'function');
// The course a save asks for, or the default when this build can't play it (an unknown id, or one still
// coming soon here but available on a newer build that synced it).
export const playableId = (id) => (isPlayable(courseById(id)) ? id : DEFAULT_COURSE);
