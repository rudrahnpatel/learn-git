// The brand in one file: the app name, the mascot, and the reward vocabulary with its icons.
// The app will be rebranded (new name, maybe a new mascot and a reward theme that suits courses
// beyond git), so swapping this file is meant to be the whole job: screens read words and icons
// from here instead of hard-coding "cherries" or "learn-git". Storage keys stay neutral (gems,
// freezes, chests) and never use these words.
//
// Reward words are per course (.notes/settings-and-course-switcher.md): the git course keeps its git
// flavour (cherries, stashes, "Merged into main!", release tags, fast-forward, the commit line), and a
// course without a set of its own gets NEUTRAL (coins, streak shields, "Lesson complete!", 2x XP boost).
// The balance behind the words is one wallet shared by every course (js/wallet.js); only the names change.
// REWARDS is the active set: one object, re-filled in place by useRewards() when the course changes, so
// read REWARDS.x when you render, not once at module load.
import { ICON } from './ui/fx.js';
import { TWIG } from './ui/mascot-twig.js';

export const APP = {
  name: 'learn-git',
  tagline: 'Learn git in three-minute bites.',
  url: '',                       // shown on the share card when set
};

// The mascot: { id, name, viewBox, draw(mood, layers), anchors, overlay } (see js/ui/mascot-twig.js).
export const MASCOT = TWIG;

const plural = (one, many) => (n) => `${n} ${n === 1 ? one : many}`;

// Every key a set must have. Strings with HTML (`popped`, `lost`) are shown in Twig's bubble.
const GIT = {
  // the currency (saved as G.gems)
  currency: { one: 'cherry', many: 'cherries', count: plural('cherry', 'cherries'), icon: () => ICON.cherry() },
  // the daily streak (G.streak): its icon, the week line's HEAD label and names
  streak: { name: 'streak', unit: 'day streak', icon: (lit = true) => ICON.commit(lit), head: 'HEAD', week: 'This week\'s commits', history: 'Your commit history' },
  // the streak saver (G.streak.freezes)
  freeze: {
    one: 'stash', many: 'stashes', count: plural('stash', 'stashes'), verb: 'Stash your streak', icon: () => ICON.stash(),
    bought: 'Streak stashed. It pops itself if you miss a day.',
    popped: (n) => (n === 1 ? '<code>git stash pop</code>: your streak survived yesterday. Phew!' : `<code>git stash pop</code> ×${n}: your streak survived while you were away.`),
  },
  lost: (n) => `Your ${n}-day streak ended. Time to <code>git init</code> a fresh one!`,
  // path rewards (G.stats.chests). tagged: the crate carries a release tag (v0.1.1) that ships when it opens.
  crate: {
    one: 'reward crate', many: 'reward crates', short: 'crate', count: plural('crate', 'crates'), icon: (open = false) => ICON.crate(open),
    tagged: true, inside: 'Cherries inside!', picked: (n) => `Cherry-picked ${n} cherries`, said: (n) => `Cherries inside! You cherry-picked ${n} cherries.`,
  },
  // the 2x XP boost (G.boostUntil)
  boost: { name: 'Fast-forward', a: 'a fast-forward', banner: 'Fast-forward · 2× XP', got: 'Fast-forward! 2× XP for 15 min', said: 'Fast-forward: 2 times XP for 15 minutes.', icon: () => ICON.ff() },
  // the lesson-complete screen: headlines, and the branch-merging picture (mergeHero)
  lessonDone: 'Merged into main!', reviewDone: 'Review merged!', mistakesDone: 'Fixes merged!', mergeHero: true,
  doneLines: { perfect: 'Flawless! Not a single slip.', good: 'Clean merge. Your brain just grew a branch.', ok: 'Merged! Mistakes are how commits get better.' },
  // "Merge 2 lessons", "LESSONS MERGED": the verb for finishing a lesson
  words: { Finish: 'Merge', finished: 'merged' },
  // a met daily goal is a commit on the streak line
  day: { done: 'Today\'s commit is in', verb: 'commit today', notYet: 'no commit today yet' },
  streakLines: {
    milestone: (n) => `${n}-day milestone! That's a real habit, tagged and everything.`,
    first: 'Your first commit. Come back tomorrow to grow the line.',
    more: 'Another commit on your history. See you tomorrow.',
  },
  // Twig on the path
  twig: {
    boost: (min) => `Fast-forward is on: 2× XP for ${min} more min. Go go go!`,
    doneMany: (s) => `Day ${s}! Today's commit is in. Fancy a bonus round?`,
    doneOne: 'Today\'s commit is in. Look at you.',
    partial: (left, s) => `${left} XP until today's commit lands. ${s ? 'Don\'t break the line!' : 'Start your history!'}`,
    day: (s) => `Day ${s} of your history. One lesson commits today.`,
    fresh: 'Tap START. A lesson takes about three minutes.',
    idle: 'New day, clean working tree. Shall we?',
  },
};

// The default for courses without their own words: plain game vocabulary, nothing git-specific.
const NEUTRAL = {
  currency: { one: 'coin', many: 'coins', count: plural('coin', 'coins'), icon: () => ICON.coin() },
  streak: { name: 'streak', unit: 'day streak', icon: (lit = true) => ICON.flame(lit), head: 'TODAY', week: 'This week', history: 'Your activity' },
  freeze: {
    one: 'streak shield', many: 'streak shields', count: plural('streak shield', 'streak shields'), verb: 'Shield your streak', icon: () => ICON.shield(),
    bought: 'Streak shield ready. It kicks in by itself if you miss a day.',
    popped: (n) => (n === 1 ? 'A streak shield saved yesterday. Phew!' : `${n} streak shields saved your streak while you were away.`),
  },
  lost: (n) => `Your ${n}-day streak ended. Let's start a fresh one!`,
  crate: {
    one: 'reward crate', many: 'reward crates', short: 'crate', count: plural('crate', 'crates'), icon: (open = false) => ICON.crate(open),
    tagged: false, inside: 'Coins inside!', picked: (n) => `You got ${n} coins`, said: (n) => `Coins inside! You got ${n} coins.`,
  },
  boost: { name: '2× XP boost', a: 'a 2× XP boost', banner: '2× XP boost', got: '2× XP boost for 15 min!', said: 'Boost: 2 times XP for 15 minutes.', icon: () => ICON.bolt('var(--ink)') },
  lessonDone: 'Lesson complete!', reviewDone: 'Review complete!', mistakesDone: 'Mistakes fixed!', mergeHero: false,
  doneLines: { perfect: 'Flawless! Not a single slip.', good: 'Nice and clean. That one stuck.', ok: 'Done! Mistakes are how it sticks.' },
  words: { Finish: 'Finish', finished: 'finished' },
  day: { done: 'Today\'s goal is met', verb: 'meet today\'s goal', notYet: 'goal not met today yet' },
  streakLines: {
    milestone: (n) => `${n}-day milestone! That's a real habit.`,
    first: 'Day one. Come back tomorrow to grow your streak.',
    more: 'Another day on your streak. See you tomorrow.',
  },
  twig: {
    boost: (min) => `2× XP boost is on for ${min} more min. Go go go!`,
    doneMany: (s) => `Day ${s}! Today's goal is met. Fancy a bonus round?`,
    doneOne: 'Today\'s goal is met. Look at you.',
    partial: (left, s) => `${left} XP to today's goal. ${s ? 'Keep the streak going!' : 'Start your streak!'}`,
    day: (s) => `Day ${s} of your streak. One lesson keeps it going.`,
    fresh: 'Tap START. A lesson takes about three minutes.',
    idle: 'New day, fresh start. Shall we?',
  },
};

// Per-course sets. A new course may add its own here (same keys as NEUTRAL); without one it reads NEUTRAL.
export const REWARD_SETS = { git: GIT, neutral: NEUTRAL };
export const rewardsFor = (courseId) => REWARD_SETS[courseId] || NEUTRAL;

// The active set (the git course's until useRewards says otherwise).
export const REWARDS = { ...GIT };
export function useRewards(courseId) {
  const set = rewardsFor(courseId);
  for (const k of Object.keys(REWARDS)) delete REWARDS[k];
  Object.assign(REWARDS, set);
  return REWARDS;
}
// "{Finish} 2 lessons" -> "Merge 2 lessons" (git) / "Finish 2 lessons": game data with reward words in it.
export const say = (text) => String(text).replace(/\{(\w+)\}/g, (m, k) => REWARDS.words[k] ?? m);
