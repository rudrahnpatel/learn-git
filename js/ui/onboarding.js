// First visit only: Twig says hi, asks your level (placement), you pick a daily goal, and the
// first lesson starts straight away. No setup wall, no sign-up.
import { h } from '../dom.js';
import { APP } from '../brand.js';
import { sfx } from '../sound.js';
import { twig } from './twig.js';
import { setShapes } from './fx.js';
import * as game from './game.js';
import { onboardingSignIn } from './account.js';

export function renderOnboarding(root, { onDone }) {
  setShapes('onboard');
  document.title = `Welcome · ${APP.name}`;
  let step = 0, placement = null, goal = null;
  const t = twig({ mood: 'happy', size: 170, side: 'right', cls: 'onb-twig' });
  const stage = h('div', { class: 'onb-stage' });
  const dots = h('div', { class: 'onb-dots' });
  const next = h('button', { class: 'btn primary big', type: 'button', onclick: () => advance() });
  const back = h('button', { class: 'btn ghost onb-back', type: 'button', onclick: () => goBack() }, h('span', { class: 'arr', 'aria-hidden': 'true' }, '← '), 'Back');
  const el = h('div', { class: 'onboard' }, h('div', { class: 'onb-inner' }, t.el, stage,
    h('div', { class: 'onb-foot' }, h('div', { class: 'onb-nav' }, back, dots, h('span', { 'aria-hidden': 'true' })), next)));
  root.replaceChildren(el);

  const choiceList = (items, sel, onPick, fmt) => h('div', { class: 'onb-opts' }, items.map((it, i) =>
    h('button', { class: 'onb-opt', type: 'button', 'aria-pressed': String(sel === i), onclick: () => { sfx.tap(); onPick(i); draw(); } }, fmt(it, i))));

  function draw() {
    dots.replaceChildren(...[0, 1, 2].map((i) => h('span', { class: 'dot' + (i === step ? ' on' : i < step ? ' past' : '') })));
    back.hidden = step === 0;
    if (step === 0) {
      t.say('Hi! I\'m <b>Twig</b>, a tiny branch with big plans.', 'happy');
      stage.replaceChildren(h('h1', { class: 'onb-title' }, 'Learn git in three-minute bites.'),
        h('p', { class: 'onb-sub' }, 'Short lessons, a live repo to poke at, and a streak to keep alive. No real git needed, nothing to install.'),
        onboardingSignIn() || '');   // nothing unless accounts are configured
      next.replaceChildren('Let\'s go', h('span', { class: 'arr' }, ' →'));
      next.disabled = false;
    } else if (step === 1) {
      t.say(placement == null ? 'First: how much git do you know?' : ['Perfect. We start at the very beginning.', 'Nice, we\'ll skip the basics.', 'Great, straight to rewriting history.', 'Ooh, a pro. Rescues it is.'][placement], placement == null ? 'think' : 'happy');
      stage.replaceChildren(h('h1', { class: 'onb-title' }, 'How much git do you know?'),
        choiceList(game.PLACEMENTS, placement, (i) => { placement = i; }, (p, i) => [h('span', { class: 'lvl', html: bars(i) }), h('span', { class: 'onb-opt-t' }, h('span', { class: 'big-t' }, p.label), h('span', { class: 'small-t' }, p.note))]));
      next.replaceChildren('Continue', h('span', { class: 'arr' }, ' →'));
      next.disabled = placement == null;
    } else {
      t.say(goal == null ? 'Now pick a daily goal. You can change it later.' : ['Easy does it. Little and often wins.', 'A solid pace. I like it.', 'Serious! Let\'s get you fluent.', 'Intense. I\'ll bring snacks.'][goal], goal == null ? 'idle' : 'happy');
      stage.replaceChildren(h('h1', { class: 'onb-title' }, 'Pick a daily goal'),
        choiceList(game.GOALS, goal, (i) => { goal = i; }, (g) => [h('span', { class: 'onb-opt-t' }, h('span', { class: 'big-t' }, g.label), h('span', { class: 'small-t' }, g.note)), h('span', { class: 'xp-pill mono' }, `${g.xp} XP / day`)]));
      next.replaceChildren('Start my first lesson', h('span', { class: 'arr' }, ' →'));
      next.disabled = goal == null;
    }
    stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
  }
  // Back keeps the answers already picked, so going back and forth never loses a choice.
  function goBack() {
    if (step === 0) return;
    sfx.tap(); step--; draw();
  }
  function advance() {
    sfx.tap();
    if (step < 2) { step++; draw(); return; }
    game.G.placement = placement;
    game.G.goal = game.GOALS[goal].xp;
    game.G.onboarded = true;
    game.save();
    onDone();
  }
  const onKey = (e) => {
    if (e.key === 'Enter' && !next.disabled && e.target.tagName !== 'BUTTON') { e.preventDefault(); advance(); }
    if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && step > 0 && e.target.tagName !== 'INPUT') { e.preventDefault(); goBack(); }
    if (/^[1-4]$/.test(e.key) && step > 0) { const i = Number(e.key) - 1; if (step === 1) placement = i; else goal = i; sfx.tap(); draw(); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}

function bars(n) {
  return `<svg viewBox="0 0 28 24" width="28" height="24" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<rect x="${i * 7}" y="${18 - i * 5}" width="5" height="${6 + i * 5}" rx="2.5" class="lvl-bar${i <= n ? ' on' : ''}"/>`).join('')}</svg>`;
}
