// Celebration screens: lesson complete ("merged into main", stat cards counting up), streak
// extended (a commit lands on your history line), quests and achievements, and the reward crate
// (opened, then its release tag ships). Each step is one screen with one Continue button.
import { h, announce, holdFocus, topLayer } from '../dom.js';
import { REWARDS, say } from '../brand.js';
import { sfx } from '../sound.js';
import { twig } from './twig.js';
import { ICON, confetti, countUp, setShapes, reducedMotion, accent, crateSVG, cherryBurst } from './fx.js';
import * as game from './game.js';

// steps: [() => { el, onShow? }]; calls onDone after the last one.
export function runSequence(root, steps, onDone) {
  let i = 0;
  const wrap = h('main', { class: 'celebrate' });
  root.replaceChildren(wrap);
  let onKey;
  const go = () => {
    if (i >= steps.length) { document.removeEventListener('keydown', onKey); onDone(); return; }
    const step = steps[i++]();
    const btn = h('button', { class: 'btn primary big', type: 'button', onclick: () => go() }, step.button || 'Continue');
    const screen = h('section', { class: 'cel-screen enter' }, step.el, h('div', { class: 'cel-foot' }, btn));
    wrap.replaceChildren(screen);
    step.onShow?.(screen);
    // each step is a new screen: the focus goes to its heading, so a screen reader starts with "Merged into main!"
    // and reads on through the stats; Enter (anywhere) or Tab then Continue moves on
    const h1 = screen.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); } else btn.focus({ preventScroll: true });
  };
  onKey = (e) => { if (!wrap.isConnected) { document.removeEventListener('keydown', onKey); return; } if (e.key === 'Enter' && !document.querySelector('.modal-wrap')) { e.preventDefault(); go(); } };
  document.addEventListener('keydown', onKey);
  go();
  return () => document.removeEventListener('keydown', onKey);
}

const fmtTime = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function statCard(label, color, value, fmt) {
  // the number counts up on screen; a screen reader gets the final value once (not every frame of the count)
  const num = h('span', { class: 'stat-num', 'aria-hidden': 'true' }, '0');
  const card = h('div', { class: `stat-card c-${color}` }, h('span', { class: 'stat-label mono' }, label), h('div', { class: 'stat-val' }, num, h('span', { class: 'sr-only' }, fmt(value))));
  return { card, run: (delay) => countUp(num, value, { fmt, delay, ms: 900 }) };
}

// "lesson/three-places" style branch names for the merge picture.
export const branchSlug = (s) => String(s || 'lesson').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20).replace(/-$/, '') || 'lesson';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const textW = (t, px) => t.length * px * 0.66 + 18; // Martian Mono is wide; a pill that fits the text

// Inline SVG: a lesson branch (two commits) merging into main. Add `.go` to the svg to play it.
export function mergeSVG({ branch = 'lesson/work', color = 'yellow' } = {}) {
  const fill = accent(color);
  const bw = textW(branch, 12), mw = textW('main', 12);
  return `<svg class="merge-svg" viewBox="0 0 400 176" role="img" aria-label="Branch ${esc(branch)} merged into main">
    <path class="mg-main-old" d="M0 132 H100"/>
    <path class="mg-draw mg-branch" pathLength="1" d="M100 132 C130 132 130 56 162 56 H244"/>
    <path class="mg-draw mg-merge" pathLength="1" d="M244 56 C284 56 284 132 318 132"/>
    <path class="mg-draw mg-main-new" pathLength="1" d="M100 132 H318"/>
    <path class="mg-main-tail" d="M318 132 H400"/>
    <circle class="mg-c" cx="40" cy="132" r="11"/>
    <circle class="mg-c" cx="100" cy="132" r="11"/>
    <g class="mg-pop mg-b1"><circle class="mg-b" cx="180" cy="56" r="13" fill="${fill}"/></g>
    <g class="mg-pop mg-b2"><circle class="mg-b" cx="236" cy="56" r="13" fill="${fill}"/></g>
    <g class="mg-label mg-blabel"><rect x="${208 - bw / 2}" y="8" width="${bw}" height="24" rx="12"/><text x="208" y="24.5">${esc(branch)}</text></g>
    <g class="mg-ring-g"><circle class="mg-ring" cx="318" cy="132" r="17"/></g>
    <g class="mg-land"><circle class="mg-m" cx="318" cy="132" r="16"/><path class="mg-tick" d="M311 132.5l5 5 9-10"/></g>
    <g class="mg-head"><rect x="${100 - mw / 2}" y="152" width="${mw}" height="24" rx="12"/><text x="100" y="168.5">main</text></g>
  </svg>`;
}

// The branch-merging picture and its merge message show only for a course whose reward words have mergeHero
// (git); other courses get the headline, the stats and the confetti.
export function lessonCompleteStep({ title = REWARDS.lessonDone, xp, accuracy, timeMs, perfect, sub, branch = 'lesson/work', color = 'yellow' }) {
  return () => {
    setShapes('celebrate');
    const L = REWARDS.doneLines, hero = REWARDS.mergeHero;
    const t = twig({ mood: 'cheer', size: 104, text: perfect ? L.perfect : accuracy >= 0.8 ? L.good : L.ok, side: 'right', cls: 'cel-twig' });
    const merge = hero ? h('div', { class: 'merge-hero', html: mergeSVG({ branch, color }) }) : null;
    const cards = [
      statCard('TOTAL XP', 'yellow', xp, (n) => String(Math.round(n))),
      statCard('ACCURACY', 'green', Math.round(accuracy * 100), (n) => Math.round(n) + '%'),
      statCard('TIME', 'sky', timeMs, (n) => fmtTime(n)),
    ];
    const head = h('h1', { class: 'cel-title' }, title);
    const el = h('div', { class: 'cel-body merge-body' }, t.el, merge,
      head,
      hero ? h('p', { class: 'merge-msg mono' }, `Merge branch '${branch}' into main`) : null,
      sub ? h('p', { class: 'cel-sub' }, sub) : null,
      perfect ? h('span', { class: 'tag-pill mono perfect-pill' }, '★ PERFECT +5 XP') : null,
      h('div', { class: 'stat-row' }, cards.map((c) => c.card)));
    return {
      el,
      onShow: () => {
        const svg = merge?.querySelector('svg');
        const rm = reducedMotion();
        if (svg) requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('go')));
        sfx.complete();
        setTimeout(() => { if (svg) sfx.merge(); confetti(svg ? svg.querySelector('.mg-land') : head, { count: 56 }); }, rm ? 0 : svg ? 1250 : 500);
        cards.forEach((c, i) => { c.card.style.animationDelay = 900 + i * 140 + 'ms'; c.run(1050 + i * 160); });
      },
    };
  };
}

/* ------------------------------------------------------- the streak line */
// The week as your own history: one commit node per day (Mon..Sun), HEAD on today.
// land: today's commit drops onto the line (add `.go` to the svg to play it).
const CL = { x0: 22, dx: 40, y: 44 };
export function commitLine({ land = false } = {}) {
  const days = game.weekDays();
  const ti = days.findIndex((d) => d.key === game.today());
  const X = (i) => CL.x0 + i * CL.dx, Y = CL.y;
  const filled = (d) => d.state === 'done' || d.state === 'stashed';
  let segs = '', nodes = '';
  for (let i = 0; i < 6; i++) {
    const a = days[i], b = days[i + 1];
    let cls = 'cl-gap';
    if (i + 1 > ti) cls = 'cl-future';
    else if (i + 1 === ti && !filled(b)) cls = filled(a) ? 'cl-pending' : 'cl-gap';
    else if (filled(a) && filled(b)) cls = 'cl-solid';
    if (land && i + 1 === ti) cls = filled(a) ? 'cl-solid cl-seg-new' : 'cl-gap';
    segs += `<path class="cl-seg ${cls}" pathLength="1" d="M${X(i)} ${Y} H${X(i + 1)}"/>`;
  }
  days.forEach((d, i) => {
    const x = X(i);
    if (land && i === ti) {
      nodes += `<circle class="cl-today cl-ph" cx="${x}" cy="${Y}" r="11"/>`;
      nodes += `<g class="cl-new"><circle class="cl-done" cx="${x}" cy="${Y}" r="12"/></g>`;
    } else if (d.state === 'done') nodes += `<circle class="cl-done" cx="${x}" cy="${Y}" r="12"/>`;
    else if (d.state === 'stashed') nodes += `<circle class="cl-stashed" cx="${x}" cy="${Y}" r="13"/><svg x="${x - 9}" y="${Y - 9}" width="18" height="18" viewBox="0 0 24 24">${REWARDS.freeze.icon().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
    else if (d.state === 'today') nodes += `<circle class="cl-today" cx="${x}" cy="${Y}" r="11"/>`;
    else if (d.state === 'future') nodes += `<circle class="cl-fut" cx="${x}" cy="${Y}" r="6"/>`;
    else nodes += `<circle class="cl-miss" cx="${x}" cy="${Y}" r="5"/>`;
    nodes += `<text class="cl-l${i === ti ? ' now' : ''}" x="${x}" y="${Y + 34}">${d.label}</text>`;
  });
  const hx = X(ti);
  const head = `<g class="cl-head${land ? ' moving' : ''}"><rect x="${hx - 23}" y="2" width="46" height="20" rx="10"/><text x="${hx}" y="16">${REWARDS.streak.head}</text><path d="M${hx - 5} 22 L${hx} 28 L${hx + 5} 22Z"/></g>`;
  const label = days.map((d) => `${d.label}: ${d.state === 'stashed' ? `saved by a ${REWARDS.freeze.one}` : d.state}`).join(', ');
  return h('div', { class: 'commit-line', html: `<svg viewBox="0 0 284 88" role="img" aria-label="${REWARDS.streak.week}. ${label}">${segs}${nodes}${head}</svg>` });
}

export function streakStep(ev) {
  return () => {
    setShapes('celebrate');
    const count = h('span', { class: 'streak-big-n', 'aria-hidden': 'true' }, String(Math.max(0, ev.count - 1)));
    const line = commitLine({ land: true });
    const S = REWARDS.streakLines;
    const msg = ev.milestone ? S.milestone(ev.milestone) : ev.count === 1 ? S.first : S.more;
    const el = h('div', { class: 'cel-body' },
      h('div', { class: 'streak-hero' },
        h('span', { class: 'sh-ic', html: REWARDS.streak.icon(true) }), count,
        h('span', { class: 'mono tiny sh-l' }, 'DAY STREAK')),
      ev.milestone && REWARDS.crate.tagged ? h('span', { class: 'tag-pill mono milestone-tag' }, h('span', { class: 'inline-ic', html: ICON.tag(false) }), `streak-${ev.milestone}`) : null,
      h('h1', { class: 'cel-title' }, 'Streak extended!', h('span', { class: 'sr-only' }, ` ${ev.count}-day streak.`)),
      h('p', { class: 'cel-sub' }, msg),
      h('div', { class: 'card week-card' }, line));
    return {
      el,
      onShow: () => {
        sfx.streak();
        const svg = line.querySelector('svg');
        requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('go')));
        setTimeout(() => { count.textContent = String(ev.count); count.classList.add('bump'); }, reducedMotion() ? 0 : 900);
        if (ev.milestone) setTimeout(() => confetti(svg.querySelector('.cl-new'), { count: 40 }), 950);
      },
    };
  };
}

export function rewardsStep({ goalReached, questEvents = [], achievements = [] }) {
  return () => {
    setShapes('celebrate');
    const rows = [];
    if (goalReached) rows.push(h('div', { class: 'reward-row c-yellow' }, h('span', { class: 'rw-ic', html: ICON.bolt() }), h('div', {}, h('h3', {}, 'Daily goal reached'), h('p', {}, `${game.G.goal} XP today. Nice work.`))));
    for (const e of questEvents) {
      if (e.type === 'quest') rows.push(h('div', { class: 'reward-row c-green' }, h('span', { class: 'rw-ic', html: ICON.check() }), h('div', {}, h('h3', {}, 'Quest complete'), h('p', {}, say(e.quest.text))), h('span', { class: 'rw-cherries' }, h('span', { html: REWARDS.currency.icon() }), `+${e.quest.cherries}`, h('span', { class: 'sr-only' }, ` ${REWARDS.currency.many}`))));
      if (e.type === 'daily-release') rows.push(h('div', { class: 'reward-row c-pink' }, h('span', { class: 'rw-ic', html: ICON.crate(false) }), h('div', {}, h('h3', {}, 'All quests done'), h('p', {}, 'Today\'s daily crate is ready to open.'))));
    }
    for (const a of achievements) rows.push(h('div', { class: `reward-row ach c-${a.color}` }, h('span', { class: 'rw-ic', html: ICON.trophy() }), h('div', {}, h('span', { class: 'mono tiny' }, 'ACHIEVEMENT UNLOCKED'), h('h3', {}, a.title), h('p', {}, a.text))));
    const t = twig({ mood: 'happy', size: 110 });
    const el = h('div', { class: 'cel-body' }, t.el, h('h1', { class: 'cel-title' }, achievements.length ? 'Look what you unlocked' : 'Progress!'), h('div', { class: 'reward-list' }, rows));
    return {
      el,
      onShow: () => {
        rows.forEach((r, i) => { r.style.animationDelay = 150 + i * 180 + 'ms'; });
        if (achievements.length) setTimeout(() => { sfx.combo(); confetti(el.querySelector('.reward-list'), { count: 30 }); }, 300);
      },
    };
  };
}

/* ------------------------------------------------------- reward crates */
// The opening stage: the big 3D chest (a pre-rendered sprite strip) with the release tag hanging off it on a string.
// Classes on the stage drive it (css/style.css "reward crate"): .shaking -> .opened (the strip plays: the lid swings up on its back hinge,
// gold inside, cherries burst) -> .shipped (the tag turns green: the release is out).
function crateTagSVG(version) {
  const w = Math.max(64, textW(version, 13) + 14), hgt = 30;
  return `<svg class="cs-tag-svg" viewBox="0 0 ${w + 4} ${hgt + 4}" width="${w + 4}" height="${hgt + 4}" aria-hidden="true">
    <polygon class="rs-tag-body" points="2,${2 + hgt / 2} 16,2 ${w + 2},2 ${w + 2},${hgt + 2} 16,${hgt + 2}"/>
    <circle class="rs-hole" cx="14" cy="${2 + hgt / 2}" r="3.2"/>
    <text class="rs-ver" x="${(w + 22) / 2}" y="${2 + hgt / 2 + 4.5}">${esc(version)}</text>
  </svg>`;
}

// Reward crate overlay: tap the crate to open it; resolves with the reward ({ cherries, boost }).
// In the git course the old release flavour stays as the finale: once the cherries are out, the tag ships.
// A course whose crates aren't tagged (REWARDS.crate.tagged false) gets the crate and its reward only.
export function releaseOverlay({ version = 'v0.1.1', from = null, title = 'Reward crate', seed = '', label } = {}) {
  const tagged = REWARDS.crate.tagged, CUR = REWARDS.currency, B = REWARDS.boost, C = REWARDS.crate;
  if (!label) label = tagged ? `RELEASE ${version}` : 'PATH REWARD';
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const crate = h('span', { class: 'cs-crate', html: crateSVG({ cls: 'big', hinge: true }) });
    const tag = tagged ? h('span', { class: 'cs-tag' }, h('span', { class: 'cs-string' }), h('span', { html: crateTagSVG(version) })) : null;
    const stage = h('button', { class: 'release-stage crate-stage', type: 'button', 'aria-label': tagged ? `Open the reward crate for release ${version}` : 'Open the reward crate' }, crate, tag);
    const cmd = tagged ? h('p', { class: 'release-cmd mono' }, `$ git tag ${version} && git push --tags`) : null;
    const msg = h('p', { class: 'cel-sub' }, 'Tap the crate to open it');
    const out = h('div', { class: 'release-reward' });
    const done = h('button', { class: 'btn primary big waiting', type: 'button', tabindex: '-1' }, 'Collect');
    const panel = h('div', { class: 'release-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'release-h', 'aria-describedby': 'release-msg' },
      h('span', { class: 'mono tiny' }, label), h('h1', { class: 'cel-title', id: 'release-h' }, title), stage, msg, out, cmd, done);
    msg.id = 'release-msg';
    const wrap = h('div', { class: 'modal-wrap release-wrap' }, panel);
    root.append(wrap);
    // a real modal: the page behind is inert, Tab stays inside, Escape closes it unopened (nothing is spent) or,
    // once the tag has shipped, collects; the focus goes back where it was
    const hold = holdFocus(wrap);
    let shipped = false;
    const finish = (r) => { if (!wrap.isConnected) return; document.removeEventListener('keydown', onEsc); wrap.remove(); hold.release(); resolve(r); };
    const onEsc = (e) => { if (e.key !== 'Escape' || topLayer() !== hold) return; e.preventDefault(); if (!reward) finish(null); else if (shipped) finish(reward); };
    document.addEventListener('keydown', onEsc);
    let reward = null;
    const open = () => {
      if (reward) return;
      reward = game.shipRelease(seed);
      const rm = reducedMotion();
      stage.setAttribute('aria-disabled', 'true');
      stage.classList.add('busy', 'shaking');
      msg.textContent = 'Opening…';
      if (!rm) sfx.rattle();
      // 1. the lid pops and the cherries burst out
      setTimeout(() => {
        stage.classList.remove('shaking');
        stage.classList.add('opened');
        sfx.release();
        cherryBurst(crate, { count: 10, icon: CUR.icon() });
        confetti(crate, { count: 26, spread: 0.7 });
        msg.textContent = C.inside;
        announce(`${C.said(reward.cherries)}${reward.boost ? ' ' + B.said : ''}`);
        const n = h('span', {}, '0');
        out.replaceChildren(...[
          h('div', { class: 'rw-cherries big' }, h('span', { html: CUR.icon() }), '+', n),
          h('p', { class: 'release-picked' }, C.picked(reward.cherries)),
          reward.boost ? h('div', { class: 'boost-pill' }, h('span', { html: B.icon() }), B.got) : null].filter(Boolean));
        countUp(n, reward.cherries, { ms: 700 });
      }, rm ? 0 : 680);
      // 2. finale: the tag ships
      setTimeout(() => {
        stage.classList.add('shipped');
        if (cmd) {
          cmd.textContent = from ? ` * [new tag]  ${from} -> ${version}` : ` * [new tag]  ${version} -> ${version}`;
          cmd.classList.add('ok');
        }
        msg.textContent = tagged ? `Shipped ${version}!` : 'All yours!';
        shipped = true;
        done.classList.remove('waiting');
        done.removeAttribute('tabindex');
        done.focus();
      }, rm ? 0 : 1650);
    };
    stage.addEventListener('click', open);
    done.addEventListener('click', () => finish(reward));
    setTimeout(() => stage.focus(), 50);
  });
}

// Builds the post-session steps that follow the first one (streak, then rewards).
export function followUpSteps({ xpEvent }) {
  const steps = [];
  if (xpEvent?.streak) steps.push(streakStep(xpEvent.streak));
  const questEvents = game.takeQuestEvents();
  game.checkAchievements();
  const achievements = game.takeAchievements();
  const goalReached = !!xpEvent?.goalReached && !xpEvent?.streak;
  if (goalReached || questEvents.length || achievements.length) steps.push(rewardsStep({ goalReached, questEvents, achievements }));
  return { steps, dailyRelease: questEvents.some((e) => e.type === 'daily-release') };
}
