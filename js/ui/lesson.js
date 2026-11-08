// The lesson player: full screen, one exercise per screen, a Check button, a feedback sheet
// that slides up, re-queued mistakes, a springy progress bar and a combo flame.
import { h, confirmModal } from '../dom.js';
import { APP } from '../brand.js';
import { sfx } from '../sound.js';
import { renderExercise } from './exercises.js';
import { twigSVG } from './twig.js';
import { ICON, shake, flyUp, toast, setShapes, glide } from './fx.js';
import * as game from './game.js';
import { watchKeyboard } from './kb.js';

const COMBO_AT = { 5: 2, 10: 3, 15: 5 };

// items: [{ ex, key }]. mode: 'lesson' | 'review' | 'mistakes'. onFinish(result) is called once.
export function playSession(root, { title, items, mode = 'lesson', onFinish, onQuit }) {
  setShapes('lesson');
  document.title = `${title} · ${APP.name}`;
  const queue = items.map((it) => ({ ...it, retry: false }));
  const total = items.length;
  const graded = items.filter((it) => it.ex.type !== 'learn').length || 1;
  const firstTry = new Map(); // key -> ok on first attempt
  let solved = 0, pos = 0, combo = 0, bestCombo = 0, bonusXp = 0, reviewed = 0;
  let cur = null, checked = false, result = null, finished = false;
  const t0 = Date.now();

  /* ---- chrome */
  const fill = h('div', { class: 'pbar-fill' });
  const bar = h('div', { class: 'pbar', role: 'progressbar', 'aria-label': 'Lesson progress', 'aria-valuemin': '0', 'aria-valuemax': String(total) }, fill, h('div', { class: 'pbar-shine' }));
  // the flame is decoration: the combo milestones are spoken by their toast
  const comboEl = h('div', { class: 'combo', 'aria-hidden': 'true' });
  const quitBtn = h('button', { class: 'icon-btn round quit', type: 'button', 'aria-label': 'Quit lesson', html: ICON.close(), onclick: () => quit() });
  const top = h('header', { class: 'lesson-top' },
    h('h1', { class: 'sr-only' }, title),
    h('p', { class: 'sr-only' }, 'Keys: number keys pick an answer (letters a to e for the right-hand column in matching), Backspace takes back the last tile or step, Enter checks and continues, Escape leaves the lesson.'),
    quitBtn, bar, comboEl);
  const tagRow = h('div', { class: 'ex-tags' });
  const stage = h('div', { class: 'ex-stage' });
  const inner = h('div', { class: 'lesson-inner' }, tagRow, stage);
  const body = h('main', { class: 'lesson-body' }, inner);
  const checkBtn = h('button', { class: 'btn primary big check', type: 'button', disabled: true, onclick: () => check() }, 'Check');
  const skipBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => skip() }, 'Can\'t do it now');
  const footInner = h('div', { class: 'foot-inner' }, skipBtn, checkBtn);
  const foot = h('footer', { class: 'lesson-foot' }, footInner);
  const el = h('div', { class: 'lesson' }, top, body, foot);
  root.replaceChildren(el);

  // Fit to the viewport (.notes/learn-git-v2-ui.md, "Fit to viewport"): the page never scrolls.
  // The body stops above the fixed footer, whose height is measured rather than guessed (it
  // changes with the viewport and with the Check/skip layout on phones).
  const footRO = new ResizeObserver(() => {
    if (!foot.classList.contains('open')) document.body.style.setProperty('--foot-h', foot.offsetHeight + 'px');
    else roomForSheet();
  });
  footRO.observe(foot);
  // On-screen keyboard (phones): while a text input is focused on a short screen, body.kb pins the lesson to the
  // visual viewport and compacts it (no top bar, the exercise top-aligned, the graph a strip) so the prompt, the input
  // and Check all stay in view (js/ui/kb.js).
  const kb = watchKeyboard(el, { reveal: true });
  const kbSync = kb.sync;
  // When the feedback sheet opens, the layout stays put (no reflow under the player's eyes), but
  // the body gains room under the content so it can scroll clear of the sheet, and the answer
  // that matters (the right option, else the whole exercise) is brought into view.
  function roomForSheet() {
    if (!inner.style.flex) inner.style.flex = `0 0 ${inner.getBoundingClientRect().height}px`;
    const extra = Math.max(0, foot.offsetHeight - (parseFloat(document.body.style.getPropertyValue('--foot-h')) || 0));
    document.body.style.setProperty('--sheet-extra', extra + 'px');
    const target = stage.querySelector('.right') || stage.querySelector('.ex');
    if (!target) return;
    const room = window.innerHeight - foot.offsetHeight - 12; // not the rect: the sheet is still sliding up
    const r = target.getBoundingClientRect();
    if (r.bottom > room) body.scrollTo({ top: body.scrollTop + Math.min(r.bottom - room, r.top - body.getBoundingClientRect().top), behavior: glide() });
  }

  function drawBar() {
    const pct = Math.round((solved / total) * 100);
    fill.style.width = Math.max(pct, 2) + '%';
    bar.setAttribute('aria-valuenow', String(solved));
    bar.setAttribute('aria-valuetext', `${solved} of ${total} done`);
    bar.classList.toggle('hot', combo >= 5);          // the bar turns flame orange (--combo)
    comboEl.classList.toggle('hot', combo >= 5);
    comboEl.innerHTML = combo >= 2 ? `${ICON.flame(true)}<span class="mono">${combo}</span>` : '';
    comboEl.classList.toggle('on', combo >= 2);
  }

  function show() {
    if (pos >= queue.length) return finish();
    cur?.destroy?.();
    checked = false; result = null;
    const item = queue[pos];
    const ex = item.ex;
    tagRow.replaceChildren(...[
      item.retry ? h('span', { class: 'tag-pill mono retry' }, '↺ PREVIOUS MISTAKE') : null,
      ex.new && !item.retry && ex.type !== 'learn' ? h('span', { class: 'tag-pill mono new' }, '★ NEW') : null,
      mode === 'mistakes' && !item.retry ? h('span', { class: 'tag-pill mono' }, 'REVIEW') : null,
    ].filter(Boolean));
    cur = renderExercise(ex, { onChange: () => sync(), submit: () => { if (!checked && cur.ready()) check(); } });
    stage.replaceChildren(cur.el);
    stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
    body.scrollTop = 0;
    inner.style.flex = '';
    document.body.style.setProperty('--sheet-extra', '0px');
    foot.className = 'lesson-foot';
    checkBtn.textContent = cur.learn ? 'Got it' : 'Check';
    skipBtn.classList.toggle('hidden', !!cur.learn);
    footInner.replaceChildren(skipBtn, checkBtn);
    sync();
    // the focus starts on the new exercise: its own control (the type exercise's terminal), else its prompt, so a
    // screen reader reads the question and Tab goes on to the answers
    if (!cur.focus?.() && !stage.contains(document.activeElement)) {
      const q = stage.querySelector('.ex-prompt, .learn-title');
      if (q) { q.setAttribute('tabindex', '-1'); q.focus({ preventScroll: true }); }
    }
  }
  function sync() { checkBtn.disabled = !cur || !cur.ready(); }

  function check() {
    if (!cur || checked || finished) return;
    if (!cur.ready()) return;
    const item = queue[pos];
    if (cur.learn) { solved++; drawBar(); sfx.tap(); pos++; show(); return; }
    checked = true;
    if (document.body.classList.contains('kb')) document.activeElement?.blur?.(); // close the keyboard for the sheet
    cur.lock();
    kbSync();
    result = cur.grade();
    const key = item.key;
    if (!firstTry.has(key)) firstTry.set(key, result.ok);
    if (result.ok) {
      solved++;
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      sfx.correct();
      if (COMBO_AT[combo]) {
        bonusXp += COMBO_AT[combo];
        setTimeout(() => { sfx.combo(); toast(`${combo} in a row! +${COMBO_AT[combo]} XP`, { icon: ICON.flame(true, true), cls: 'combo-toast' }); flyUp(comboEl, `+${COMBO_AT[combo]}`); }, 250);
      }
      game.questProgress('combo', combo);
      if (result.typed) game.questProgress('typed');
      if (mode === 'mistakes') { game.reviewResult(key, true); reviewed++; }
    } else {
      combo = 0;
      sfx.wrong();
      shake(stage);
      queue.push({ ...item, retry: true });
      if (mode === 'mistakes') game.reviewResult(key, false);
      else game.recordMistake(key);
    }
    drawBar();
    sheet(result, item.ex);
  }
  function skip() {
    if (checked || !cur || cur.learn) return;
    checked = true;
    cur.lock();
    const item = queue[pos];
    let answer = '';
    try { answer = cur.grade().answer; } catch { /* ignore */ }
    if (!firstTry.has(item.key)) firstTry.set(item.key, false);
    combo = 0;
    queue.push({ ...item, retry: true });
    if (mode !== 'mistakes') game.recordMistake(item.key);
    drawBar();
    sheet({ ok: false, answer, skipped: true }, item.ex);
  }

  function sheet(res, ex) {
    const ok = res.ok;
    const praise = ['Nice!', 'Correct!', 'Great job!', 'Spot on!', 'You got it!'];
    const head = ok ? (combo >= 5 ? `${combo} in a row!` : praise[(pos + combo) % praise.length]) : res.skipped ? 'No worries, here it is' : 'Not quite';
    // the feedback is read with Continue, which takes the focus (its description is the whole sheet text)
    const cont = h('button', { class: 'btn big ' + (ok ? 'primary' : 'dark') + ' cont', type: 'button', 'aria-describedby': 'sheet-text', onclick: () => next() }, 'Continue');
    const content = h('div', { class: 'sheet', role: 'group', 'aria-label': ok ? 'Correct' : 'Feedback' },
      h('div', { class: 'sheet-twig', html: twigSVG(ok ? 'happy' : 'worried') }),
      h('div', { class: 'sheet-text', id: 'sheet-text' },
        h('h3', { class: 'sheet-head' }, head),
        !ok && res.answer ? h('p', { class: 'sheet-ans' }, h('span', { class: 'mono lab' }, 'CORRECT ANSWER'), h(res.mono ? 'code' : 'span', { class: 'ans' }, res.answer)) : null,
        res.note ? h('p', { class: 'sheet-note' }, res.note) : null,
        ex.explain ? h('p', { class: 'sheet-explain', html: ex.explain }) : null),
      cont);
    foot.className = 'lesson-foot open ' + (ok ? 'ok' : 'bad');
    footInner.replaceChildren(content);
    setTimeout(() => cont.focus({ preventScroll: true }), 60);
  }
  function next() { pos++; show(); }

  function finish() {
    if (finished) return;
    finished = true;
    cur?.destroy?.();
    const firstOk = [...firstTry.entries()].filter(([k]) => items.find((i) => i.key === k)?.ex.type !== 'learn');
    const correctFirst = firstOk.filter(([, v]) => v).length;
    const accuracy = firstOk.length ? correctFirst / firstOk.length : 1;
    onFinish?.({ accuracy, bestCombo, bonusXp, reviewed, timeMs: Date.now() - t0, perfect: accuracy === 1 && graded > 0 });
  }

  async function quit() {
    if (finished) return;
    const sure = await confirmModal('Leave the lesson?', 'You\'ll lose your progress in this lesson.', { ok: 'Quit', cancel: 'Keep learning', danger: true });
    if (sure) { finished = true; onQuit?.(); }
  }

  const onKey = (e) => {
    if (document.querySelector('.modal-wrap') || finished) return;
    if (e.target.closest?.('.terminal')) return; // the mini terminal handles its own keys
    if (e.key === 'Escape') { e.preventDefault(); quit(); return; }
    if (e.key === 'Enter') {
      if (e.target.tagName === 'BUTTON' && !e.target.classList.contains('cont') && !e.target.classList.contains('check')) return;
      e.preventDefault();
      if (checked) next(); else check();
      return;
    }
    if (!checked && cur && cur.key(e)) { e.preventDefault(); sync(); }
  };
  document.addEventListener('keydown', onKey);
  drawBar();
  show();
  return () => { document.removeEventListener('keydown', onKey); footRO.disconnect();
    kb.destroy(); document.body.style.removeProperty('--sheet-extra'); cur?.destroy?.(); };
}
