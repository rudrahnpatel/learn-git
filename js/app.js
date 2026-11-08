// App shell: loads the content bank, applies the streak, and routes between screens.
//   #/                     the path (or onboarding on the first visit)
//   #/lesson/<nodeId>      a lesson or unit-review node in the lesson player
//   #/challenge/<levelId>  a v1 level as a challenge node
//   #/mistakes             mistakes review      #/practice  the practice hub
//   #/speed  #/bisect  #/sandbox                arcade modes
//   #/shop  #/profile  #/cards                  shop, profile (heatmap, share card), command cards
import { SANDBOX, levelById, makeBisectHunt } from './levels.js';
import { renderSpeed } from './speed.js';
import { setMuted } from './sound.js';
import { applyTheme, applyAccent } from './theme.js';
import { toast, ICON, setShapes } from './ui/fx.js';
import { releaseAll } from './dom.js';
import * as game from './ui/game.js';
import { loadContent, loadedCourse, nodeById, nodeForLevel, nodeStatus, currentNode, crowns, lessonItems, reviewItems, exerciseByKey, unitComplete } from './ui/path.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderHome } from './ui/home.js';
import { playSession } from './ui/lesson.js';
import { runSequence, lessonCompleteStep, followUpSteps, branchSlug } from './ui/complete.js';
import { renderChallenge } from './ui/challenge.js';
import { renderPractice } from './ui/practice.js';
import { renderShop } from './ui/shop.js';
import { renderProfile } from './ui/profile.js';
import { renderCards, cardRevealStep } from './ui/cards.js';
import { REWARDS, useRewards } from './brand.js';
import { startCloud } from './cloud/sync.js';
import { maybeSigninNudge } from './ui/account.js';
import { track } from './learnlog.js';

const app = document.getElementById('app');
let cleanup = null;
let pending = {}; // one-shot options for the next home render (popNode, message)

function screen(name) { document.body.dataset.screen = name; }
function goHome(opts = {}) { pending = opts; if (location.hash === '#/' || location.hash === '') route(); else location.hash = '#/'; }

// After a route change the focus goes to the new screen's heading (WCAG 2.4.3), unless the screen already put it
// somewhere useful itself (the lesson's first prompt, a challenge's terminal, a celebration's heading).
let booted = false;
function focusScreen() {
  if (!booted) { booted = true; return; } // the first paint keeps the browser's own start (the skip link first)
  setTimeout(() => {
    const a = document.activeElement;
    if (document.querySelector('.modal-wrap') || (a && a !== document.body && a !== app && app.contains(a))) return;
    const h1 = app.querySelector('h1');
    if (!h1) { app.focus({ preventScroll: true }); return; }
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  }, 0);
}

function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  releaseAll();
  document.getElementById('modal-root').replaceChildren();
  window.scrollTo(0, 0);
  focusScreen();
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, rawArg] = hash.split('/');
  const arg = rawArg ? decodeURIComponent(rawArg) : '';

  if (!game.G.onboarded) {
    screen('onboard');
    cleanup = renderOnboarding(app, { onDone: () => { const n = currentNode(); if (n && n.kind === 'lesson') location.hash = `#/lesson/${encodeURIComponent(n.id)}`; else goHome(); } });
    return;
  }
  if (page === 'lesson') return lessonRoute(arg);
  if (page === 'challenge') return challengeRoute(arg);
  if (page === 'mistakes') return mistakesRoute();
  if (page === 'practice') { screen('practice'); cleanup = renderPractice(app); return; }
  if (page === 'shop') { screen('shop'); cleanup = renderShop(app); return; }
  if (page === 'profile') { screen('profile'); cleanup = renderProfile(app); return; }
  if (page === 'cards') { screen('cards'); cleanup = renderCards(app); return; }
  if (page === 'speed') { screen('speed'); setShapes('practice'); document.title = 'Speed round · learn-git'; cleanup = renderSpeed(app, { onBack: () => { location.hash = '#/practice'; } }); return; }
  if (page === 'bisect') { screen('challenge'); cleanup = renderChallenge(app, makeBisectHunt(Date.now()), { onExit: () => { location.hash = '#/practice'; }, onAgain: () => route() }); return; }
  if (page === 'sandbox') { screen('challenge'); cleanup = renderChallenge(app, SANDBOX, { onExit: () => { location.hash = '#/practice'; } }); return; }
  homeRoute();
}

function homeRoute() {
  screen('home');
  const opts = pending; pending = {};
  const refresh = (o = {}) => { if (typeof cleanup === 'function') cleanup(); pending = o; homeRoute(); };
  cleanup = renderHome(app, { ...opts, refresh });
}

function lessonRoute(id) {
  const node = nodeById(id);
  if (!node || (node.kind !== 'lesson' && node.kind !== 'review')) return goHome();
  if (nodeStatus(node) === 'locked') { toast('That one is still locked.', { icon: ICON.lock() }); return goHome(); }
  const items = node.kind === 'lesson' ? lessonItems(node.lesson, crowns(node)) : reviewItems(node.unit);
  if (!items.length) return goHome();
  screen('lesson');
  const mode = node.kind === 'review' ? 'review' : 'lesson';
  track('lesson_start', { node: node.id, mode, crowns: crowns(node), total: items.length });
  cleanup = playSession(app, {
    title: node.title, items, mode,
    onAnswer: (a) => track('exercise_answer', { node: node.id, ...a }),
    onQuit: (p) => { track('lesson_quit', { node: node.id, mode, ...p }); goHome(); },
    onFinish: (res) => {
      track('lesson_done', { node: node.id, mode, reached: items.length, total: items.length, accuracy: res.accuracy, ms: res.timeMs });
      const wasDone = nodeStatus(node) === 'done';
      const curBefore = currentNode()?.id;   // with "Unlock all levels" a node ahead of it may be finished: nothing new unlocks then
      const xp = game.XP.lesson + (res.perfect ? game.XP.perfect : 0) + res.bonusXp;
      const xpEvent = game.addXp(xp);
      game.finishLesson({ accuracy: res.accuracy, bestCombo: res.bestCombo });
      game.completeNode(node.id, { accuracy: res.accuracy });
      const newCards = node.kind === 'lesson' ? game.unlockCards(node.lesson.id) : [];
      markUnit(node);
      const curAfter = currentNode()?.id;
      celebrate({ title: node.kind === 'review' ? REWARDS.reviewDone : REWARDS.lessonDone, xpEvent, res, popNode: wasDone || curAfter === curBefore ? null : curAfter, newCards,
        branch: node.kind === 'review' ? `review/${branchSlug(node.unit.title)}` : `lesson/${branchSlug(node.title)}`, color: node.unit.color });
    },
  });
}

function markUnit(node) {
  if (unitComplete(node.unit) && !game.G.seen['unit:' + node.unit.id]) {
    game.G.seen['unit:' + node.unit.id] = true;
    game.G.stats.units++;
    game.checkAchievements();
    game.save();
  }
}

function celebrate({ title, xpEvent, res, popNode, sub, branch, color, newCards = [] }) {
  if (typeof cleanup === 'function') cleanup();
  screen('celebrate');
  const first = lessonCompleteStep({ title, xp: xpEvent.gained, accuracy: res.accuracy, timeMs: res.timeMs, perfect: res.perfect, sub, branch, color });
  const { steps } = followUpSteps({ xpEvent });
  const cards = newCards.length ? [cardRevealStep(newCards)] : [];
  cleanup = runSequence(app, [first, ...cards, ...steps], () => { goHome({ popNode }); maybeSigninNudge(); });
}

function challengeRoute(levelId) {
  const level = levelById(levelId);
  if (!level) return goHome();
  const node = nodeForLevel(levelId);
  if (node && nodeStatus(node) === 'locked') { toast('That challenge is still locked.', { icon: ICON.lock() }); return goHome(); }
  screen('challenge');
  track('challenge_start', { level: levelId });
  const wasDone = node ? nodeStatus(node) === 'done' : true;
  cleanup = renderChallenge(app, level, {
    unitTitle: node?.unit.title,
    treesOpen: node ? node.ui === 0 || node.unit.id === 'basics' : false,
    onExit: (completed) => {
      if (completed && node) markUnit(node);
      if (!node) { location.hash = '#/practice'; return; }
      goHome(completed && !wasDone ? { popNode: currentNode()?.id } : {});
    },
  });
}

function mistakesRoute() {
  const items = game.mistakeKeys().map((k) => exerciseByKey(k)).filter(Boolean).slice(0, 10).map((x) => ({ ex: x.ex, key: x.key }));
  if (!items.length) { location.hash = '#/practice'; return; }
  screen('lesson');
  track('lesson_start', { node: 'mistakes', mode: 'mistakes', total: items.length });
  cleanup = playSession(app, {
    title: 'Mistakes review', items, mode: 'mistakes',
    onAnswer: (a) => track('exercise_answer', { node: 'mistakes', ...a }),
    onQuit: (p) => { track('lesson_quit', { node: 'mistakes', mode: 'mistakes', ...p }); location.hash = '#/practice'; },
    onFinish: (res) => {
      track('lesson_done', { node: 'mistakes', mode: 'mistakes', reached: items.length, total: items.length, accuracy: res.accuracy, ms: res.timeMs });
      const xpEvent = game.addXp(Math.max(1, res.reviewed * game.XP.review));
      game.questProgress('practice');
      game.G.stats.bestCombo = Math.max(game.G.stats.bestCombo, res.bestCombo);
      game.save();
      celebrate({ title: REWARDS.mistakesDone, xpEvent, res: { ...res, perfect: false }, sub: `${res.reviewed} fixed. Each one is a little stronger now.`, branch: 'fix/old-mistakes', color: 'pink' });
    },
  });
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  applyTheme();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()); } catch { /* old browsers */ }
  setMuted(game.G.mute);
  await loadContent();
  useRewards(loadedCourse);   // the active course's reward words (js/brand.js)
  applyAccent(game.accentTheme());
  // Players with lessons already merged get those lessons' cards (no reveal: they are back pay).
  game.grantCompletedCards(Object.entries(game.courseProgress().nodes).filter(([id, n]) => n?.done && id.includes(':lesson:')).map(([id]) => id.split(':lesson:')[1]));
  const ev = game.applyStreak();
  if (ev?.poppedDays) pending = { message: REWARDS.freeze.popped(ev.poppedDays) };
  else if (ev?.lost) pending = { message: REWARDS.lost(ev.lost) };
  game.checkAchievements();
  game.takeAchievements();
  // analytics (a no-op without config, with Do Not Track / GPC, or off the production host)
  track('app_open', { pwa: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, onboarded: !!game.G.onboarded });
  window.addEventListener('hashchange', route);
  // Settings and the course switcher (js/ui/settings.js) ask for a re-render: home after a course switch,
  // else the current screen; then the focus goes to `focus` (the gear, the course pill) instead of the h1.
  window.addEventListener('app:refresh', (e) => {
    const { home = false, focus = null, switched = null } = e.detail || {};
    if (switched) track('course_switch', switched);
    const put = () => { const el = focus && document.querySelector(focus); if (el) el.focus({ preventScroll: true }); };
    if (home && !(location.hash === '#/' || location.hash === '')) {
      window.addEventListener('hashchange', () => setTimeout(put, 0), { once: true });
      location.hash = '#/';
    } else { route(); put(); }
  });
  route();
  // Accounts (no-op with an empty js/cloud/config.js; supabase-js loads only for a signed-in browser).
  startCloud({
    onReplaced: async () => {   // another device's progress was merged in
      setMuted(game.G.mute);
      applyAccent(game.accentTheme());
      const calm = ['home', 'profile', 'shop', 'cards', 'practice', 'onboard'].includes(document.body.dataset.screen) && !document.querySelector('.modal-wrap');
      // the other device switched course: follow it on a calm screen; mid-lesson keep the course being played
      // (G.course goes back to it, so progress lands in the right course)
      if (game.G.course !== loadedCourse) {
        if (!calm) { game.G.course = loadedCourse; return; }
        await loadContent(game.G.course);
        useRewards(loadedCourse);
      }
      if (calm) route();
    },
    onSignedIn: (p) => { track('sign_in'); toast(`Signed in as ${p.name || p.email}. Your progress is synced.`, { icon: ICON.check(), ms: 3200 }); },
    onAuthError: (msg) => toast(msg, { icon: ICON.close(), ms: 3200 }),
  });
}
boot();
