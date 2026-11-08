// Settings (the top bar's gear) and the course switcher (the home course pill, or Settings > Course).
// Both are real modals from dom.js: the page behind is inert, Tab stays inside, Escape closes, and the focus
// goes back to the control that opened them. See .notes/settings-and-course-switcher.md.
//   Settings: theme (System / Light / Dark, stored per device by js/theme.js), sound on/off (G.mute), the
//   active course, and "Unlock all levels" (G.unlockAll). Room for more rows (the daily goal could move here).
//   Switcher: every course in js/courses.js with its lesson count; coming-soon courses are listed, not playable.
import { h, modal, announce } from '../dom.js';
import { setMuted, sfx } from '../sound.js';
import { getTheme, setTheme, THEMES } from '../theme.js';
import { REWARDS, useRewards } from '../brand.js';
import { COURSES, courseById, isPlayable } from '../courses.js';
import { ICON, toast, accent } from './fx.js';
import { unitsFor, loadContent, loadedCourse, nodes } from './path.js';
import * as game from './game.js';

// Asks the app shell to re-render the current screen (or go home) and put the focus on `focus` (a selector)
// afterwards: a setting or a course switch changes what the screen shows. Handled in js/app.js, which also
// records `switched` ({ course, from }) as the course_switch event.
export const refreshScreen = (detail = {}) => window.dispatchEvent(new CustomEvent('app:refresh', { detail }));

let n = 0;
const THEME_NAME = { system: 'System', light: 'Light', dark: 'Dark' };

// A labelled on/off switch: a native checkbox with role="switch", so it is announced as "on" / "off".
function switchRow({ label, desc, checked, onChange, cls = '' }) {
  const id = 'set-' + (++n);
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', id, checked: !!checked, 'aria-describedby': desc ? id + '-d' : null,
    onchange: (e) => onChange(e.target.checked) });
  return h('div', { class: 'set-row' + (cls ? ' ' + cls : '') },
    h('label', { class: 'set-text', for: id }, h('span', { class: 'set-label' }, label), desc ? h('span', { class: 'set-desc', id: id + '-d' }, desc) : null),
    input);
}

export function openSettings() {
  let changed = false;   // something the screen shows changed: re-render it when the dialog closes
  const theme = h('fieldset', { class: 'seg', 'aria-label': 'Theme' },
    h('legend', { class: 'set-label' }, 'Theme'),
    h('div', { class: 'seg-opts' }, THEMES.map((t) => h('label', { class: 'seg-opt' },
      h('input', { type: 'radio', name: 'set-theme', value: t, checked: getTheme() === t, onchange: () => { setTheme(t); sfx.tap(); } }),
      h('span', { class: 'seg-ic', html: ICON.theme(t) }), h('span', {}, THEME_NAME[t])))));
  const sound = switchRow({ label: 'Sound effects', desc: 'Short sounds for answers, rewards and streaks.', checked: !game.G.mute,
    onChange: (on) => { game.setMute(!on); setMuted(!on); announce(on ? 'Sounds on' : 'Sounds off'); if (on) sfx.tap(); } });
  const unlock = switchRow({ label: 'Unlock all levels', desc: 'Jump to any lesson. Your progress and crowns are kept.', checked: !!game.G.unlockAll, cls: 'unlock-row',
    onChange: (on) => { game.setUnlockAll(on); changed = true; sfx.tap(); announce(on ? 'All levels unlocked. Reward crates still open after their lessons.' : 'Levels unlock in order again. Your progress is kept.'); } });
  const c = courseById(loadedCourse);
  const courseRow = h('div', { class: 'set-row course-row' },
    h('div', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Course'),
      h('span', { class: 'set-course' }, h('span', { class: 'course-ic small', style: { background: accent(c.accent) }, html: c.icon }), c.title)),
    h('button', { class: 'btn small ghost', type: 'button', 'aria-haspopup': 'dialog', onclick: () => openCourseSwitcher() }, 'Switch course'));
  const body = h('div', { class: 'settings' },
    h('section', { class: 'set-sec', 'aria-labelledby': 'set-h-look' }, h('h3', { class: 'mono tiny', id: 'set-h-look' }, 'APPEARANCE'), theme),
    h('section', { class: 'set-sec', 'aria-labelledby': 'set-h-sound' }, h('h3', { class: 'mono tiny', id: 'set-h-sound' }, 'SOUND'), sound),
    h('section', { class: 'set-sec', 'aria-labelledby': 'set-h-learn' }, h('h3', { class: 'mono tiny', id: 'set-h-learn' }, 'LEARNING'), courseRow, unlock));
  modal('Settings', body, { onClose: () => { if (changed) refreshScreen({ focus: '.topbar .gear' }); } });
}

// The course switcher: one row per course with its progress; the current course is marked, coming-soon ones
// are listed but can't be picked.
export async function openCourseSwitcher() {
  const list = h('ul', { class: 'course-list', role: 'list' });
  const m = modal('Choose a course', h('div', {}, h('p', { class: 'muted course-note' }, `Each course keeps its own path, mistakes and cards. Your XP, streak and ${REWARDS.currency.many} are shared.`), list));
  // lesson counts need each course's content: loaded lazily (cached after the first time)
  const rows = await Promise.all(COURSES.map(async (c) => {
    const units = isPlayable(c) ? await unitsFor(c.id) : null;
    const total = units ? units.reduce((s, u) => s + u.lessons.length, 0) : 0;
    return { c, total, done: units ? Math.min(total, game.lessonsDone(c.id)) : 0 };
  }));
  if (!m.el.isConnected) return;
  for (const { c, total, done } of rows) {
    const current = c.id === loadedCourse, playable = isPlayable(c);
    const meta = !playable ? 'COMING SOON' : `${done}/${total} LESSONS`;
    const btn = h('button', { class: 'course-opt' + (current ? ' current' : '') + (playable ? '' : ' soon'), type: 'button',
      'aria-current': current ? 'true' : null, 'aria-disabled': playable ? null : 'true',
      'aria-label': `${c.title}. ${playable ? `${done} of ${total} lessons done` : 'Coming soon'}${current ? '. Current course' : ''}`,
      onclick: async () => {
        if (!playable) { sfx.tap(); toast(`${c.title} is coming soon.`, { icon: ICON.lock() }); return; }
        if (current) { m.close(); return; }
        btn.setAttribute('aria-busy', 'true');
        const ok = await switchCourse(c.id);
        if (!ok) { btn.removeAttribute('aria-busy'); toast(`${c.title} couldn't be loaded. Try again in a moment.`, { icon: ICON.close() }); }
      } },
      h('span', { class: 'course-ic', style: { background: accent(c.accent) }, html: c.icon }),
      h('span', { class: 'course-txt' }, h('span', { class: 'course-t' }, c.title), h('span', { class: 'course-b' }, c.blurb)),
      h('span', { class: 'course-meta' },
        h('span', { class: 'tag-pill mono' + (current ? ' on' : '') }, current ? 'CURRENT' : meta),
        current ? h('span', { class: 'mono tiny' }, meta) : null));
    list.append(h('li', {}, btn));
  }
  // start on the current course (the first control otherwise)
  list.querySelector('.course-opt.current')?.focus({ preventScroll: true });
}

// Switches the active course: its content becomes the path, its reward words the vocabulary. Every course's
// progress stays where it is. Goes home afterwards, with the focus on the course pill.
export async function switchCourse(id) {
  const c = courseById(id);
  if (!isPlayable(c) || id === loadedCourse) return false;
  if (!(await unitsFor(id))) return false;
  const from = loadedCourse;
  game.setCourse(id);
  await loadContent(id);
  if (loadedCourse !== id) return false;
  useRewards(id);
  // the first time a course with its own placement opens: "how much do you know?" (git asks in onboarding)
  if (c.placements && !game.courseState(id).placed) await askPlacement(c);
  // lessons finished on another device before this one had the course: their cards, without a reveal
  game.grantCompletedCards(Object.entries(game.courseProgress(id).nodes).filter(([k, v]) => v?.done && k.includes(':lesson:')).map(([k]) => k.split(':lesson:')[1]), id);
  sfx.tap();
  announce(`Switched to ${c.title}.`);
  // the app shell sends the course_switch event (this module doesn't import the stats code)
  refreshScreen({ home: true, focus: '.course-pill', switched: { course: id, from } });
  return true;
}

// Placement for a course opened for the first time (js/courses.js `placements`): one question, the answers mark the
// first units as skipped (still playable), as git's onboarding does. Closing it starts at the beginning. Asked once.
export function askPlacement(c) {
  return new Promise((resolve) => {
    let picked = false;
    const done = (skip) => {
      const p = game.courseProgress(c.id);
      p.placement = skip;
      game.courseState(c.id).placed = true;
      game.save();
      resolve(skip);
    };
    const opts = c.placements.map((p, i) => h('button', { class: 'onb-opt place-opt', type: 'button',
      onclick: () => { picked = true; sfx.tap(); m.close(); done(p.skip); announce(p.skip ? `${p.skip === 1 ? 'The first unit is' : `The first ${p.skip} units are`} marked as skipped. They stay playable.` : 'Starting at the very beginning.'); } },
    h('span', { class: 'lvl', 'aria-hidden': 'true', html: bars(i) }),
    h('span', { class: 'onb-opt-t' }, h('span', { class: 'big-t' }, p.label), h('span', { class: 'small-t' }, p.note))));
    const m = modal(`How much ${c.short === 'bash' ? 'terminal' : c.title} do you know?`, h('div', { class: 'placement' },
      h('p', { class: 'muted course-note' }, 'We\'ll skip what you know. Skipped units stay open, so you can play them any time.'),
      h('div', { class: 'onb-opts' }, opts)), { onClose: () => { if (!picked) done(0); } });
  });
}
const bars = (n) => `<svg viewBox="0 0 28 24" width="28" height="24" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<rect x="${i * 7}" y="${18 - i * 5}" width="5" height="${6 + i * 5}" rx="2.5" class="lvl-bar${i <= n ? ' on' : ''}"/>`).join('')}</svg>`;

// The home course pill: the active course, its lesson count, and the way into the switcher.
export function coursePill() {
  const c = courseById(loadedCourse);
  const lessons = nodes().filter((x) => x.kind === 'lesson');
  const done = lessons.filter((x) => game.courseProgress().nodes[x.id]?.done).length;
  return h('button', { class: 'course-pill', type: 'button', 'aria-haspopup': 'dialog',
    'aria-label': `Course: ${c.title}, ${done} of ${lessons.length} lessons done. Change course`, onclick: () => { sfx.tap(); openCourseSwitcher(); } },
  h('span', { class: 'course-ic small', style: { background: accent(c.accent) }, html: c.icon }),
  h('span', { class: 'cp-t' }, c.title),
  h('span', { class: 'cp-n mono' }, `${done}/${lessons.length}`),
  h('span', { class: 'cp-chev', html: ICON.chevron() }));
}
