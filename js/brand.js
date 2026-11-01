// The brand in one file: the app name, the mascot, and the reward vocabulary with its icons.
// The app will be rebranded (new name, maybe a new mascot and a reward theme that suits courses
// beyond git), so swapping this file is meant to be the whole job: screens read words and icons
// from here instead of hard-coding "cherries" or "learn-git". Storage keys stay neutral (gems,
// freezes, chests) and never use these words.
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

export const REWARDS = {
  // the currency (saved as G.gems)
  currency: { one: 'cherry', many: 'cherries', count: plural('cherry', 'cherries'), icon: () => ICON.cherry() },
  // the daily streak (G.streak)
  streak: { name: 'streak', unit: 'day streak', icon: (lit = true) => ICON.commit(lit) },
  // the streak saver (G.streak.freezes)
  freeze: { one: 'stash', many: 'stashes', count: plural('stash', 'stashes'), verb: 'Stash your streak', icon: () => ICON.stash() },
  // path rewards (G.stats.chests)
  crate: { one: 'reward crate', many: 'reward crates', short: 'crate', count: plural('crate', 'crates'), icon: (open = false) => ICON.crate(open) },
  // the 2x XP boost (G.boostUntil)
  boost: { name: 'Fast-forward', icon: () => ICON.ff() },
  // lesson complete headline
  lessonDone: 'Merged into main!',
};
