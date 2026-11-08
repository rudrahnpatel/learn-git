// /admin → Analytics: the learning numbers from the `events` table (supabase/migrations/analytics.sql).
// Every number comes from an admins-only analytics_* SQL function; this file only draws them: plain
// tables plus small inline SVG charts (no chart library, no build step). Days are UTC.
import { h } from '../js/dom.js';

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const todayUTC = () => iso(new Date());
const daysAgo = (n) => iso(new Date(Date.now() - n * DAY));
const pct = (x) => (x == null ? '–' : `${Math.round(Number(x) * 100)}%`);
const num = (x) => (x == null ? '–' : Number(x).toLocaleString());
const dur = (ms) => {
  if (ms == null) return '–';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};
const svgEl = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.filter((k) => k != null));
  return el;
};

// Range state survives switching tabs (not reloads).
let range = { from: daysAgo(29), to: todayUTC(), minN: 20 };

// loadPath(): the game's path nodes (ids, titles, lessons) from admin.js, for readable names.
export async function renderAnalytics(container, { sb, loadPath }) {
  const fromIn = h('input', { type: 'date', value: range.from, max: todayUTC(), 'aria-label': 'From (UTC)' });
  const toIn = h('input', { type: 'date', value: range.to, max: todayUTC(), 'aria-label': 'To (UTC)' });
  const body = h('div', { class: 'an-body' });
  const preset = (n, label) => h('button', { class: 'btn small', type: 'button', onclick: () => { fromIn.value = daysAgo(n - 1); toIn.value = todayUTC(); load(); } }, label);
  const apply = h('button', { class: 'btn small primary', type: 'button', onclick: () => load() }, 'Show');
  const bar = h('div', { class: 'an-range' },
    h('div', { class: 'an-presets' }, preset(7, '7 days'), preset(30, '30 days'), preset(90, '90 days')),
    h('label', { class: 'an-date' }, h('span', { class: 'tiny' }, 'From'), fromIn),
    h('label', { class: 'an-date' }, h('span', { class: 'tiny' }, 'To'), toIn),
    apply,
    h('span', { class: 'tiny an-utc' }, 'Days in UTC'));
  container.replaceChildren(bar, body);

  let names = null;
  async function titles() {
    if (names) return names;
    names = { node: new Map(), ex: new Map(), level: new Map() };
    try {
      const nodes = await loadPath();
      for (const n of nodes) {
        if (n.kind === 'challenge') names.level.set(n.levelId, n.title);
        else names.node.set(n.id, { title: n.title, order: names.node.size, unit: n.unit?.title });
        if (n.kind === 'lesson') n.lesson.exercises.forEach((ex, i) => names.ex.set(ex.id || `${n.lesson.id}#${i}`, { lesson: n.title, prompt: (ex.prompt || ex.title || '').replace(/<[^>]+>/g, '') }));
      }
    } catch { /* ids only */ }
    names.node.set('mistakes', { title: 'Mistakes review', order: 1e6 });
    return names;
  }

  async function load() {
    const from = fromIn.value, to = toIn.value;
    if (!from || !to || from > to) { body.replaceChildren(h('p', { class: 'danger-t' }, 'Pick a start date on or before the end date.')); return; }
    range = { ...range, from, to };
    apply.disabled = true;
    body.replaceChildren(h('p', { class: 'muted' }, 'Loading analytics…'));
    const args = { from_day: from, to_day: to };
    const calls = [
      sb.rpc('analytics_summary', args), sb.rpc('analytics_daily', args), sb.rpc('analytics_funnel', args),
      sb.rpc('analytics_lessons', args), sb.rpc('analytics_exercises', { ...args, min_n: range.minN }),
      sb.rpc('analytics_quits', args), sb.rpc('analytics_challenges', args), titles(),
    ];
    const [summary, daily, funnel, lessons, exercises, quits, challenges, nm] = await Promise.all(calls);
    apply.disabled = false;
    const err = [summary, daily, funnel, lessons, exercises, quits, challenges].find((r) => r.error)?.error;
    if (err) {
      body.replaceChildren(h('section', { class: 'card admin-msg' }, h('h2', {}, 'Could not load analytics'),
        h('p', {}, `${err.message}. Has supabase/migrations/analytics.sql been run? (supabase/README.md, "Analytics")`)));
      return;
    }
    body.replaceChildren(
      summaryCard(summary.data || {}),
      dailyCard(daily.data || []),
      funnelCard(funnel.data || []),
      lessonsCard(lessons.data || [], nm),
      exercisesCard(exercises.data || [], nm),
      quitsCard(quits.data || [], nm),
      challengesCard(challenges.data || [], nm));
  }

  /* ---- cards */
  const card = (title, sub, ...kids) => h('section', { class: 'card an-card' },
    h('div', { class: 'card-head' }, h('h3', {}, title), sub ? h('span', { class: 'mono tiny' }, sub) : null), ...kids);
  const table = (cols, rows, empty = 'Nothing in this range yet.') => (rows.length
    ? h('div', { class: 'table-wrap an-table' }, h('table', { class: 'users' },
      h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', { class: c.n ? 'ncol' : null }, c.t)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...cols.map((c) => h('td', { class: c.n ? 'ncol' : null }, c.v(r))))))))
    : h('p', { class: 'muted' }, empty));

  function summaryCard(s) {
    const devices = s.devices || {};
    const total = Object.values(devices).reduce((a, b) => a + b, 0) || 0;
    const stat = (label, value, note) => h('div', { class: 'an-stat' }, h('span', { class: 'tiny' }, label), h('b', { class: 'mono' }, value), note ? h('small', {}, note) : null);
    return card('Overview', `${range.from} → ${range.to}`,
      h('div', { class: 'an-stats' },
        stat('Installs', num(s.installs), 'active in the range'),
        stat('Visits', num(s.sessions), 'sessions'),
        stat('App opens', num(s.app_opens), s.app_opens ? `${pct((s.pwa_opens || 0) / s.app_opens)} as the installed app` : null),
        stat('Events', num(s.events))),
      total ? h('div', { class: 'an-devices' }, ...['phone', 'tablet', 'desktop', 'unknown'].filter((d) => devices[d]).map((d) =>
        h('span', { class: 'tag-pill mono' }, `${d} ${pct(devices[d] / total)}`))) : null);
  }

  // Active installs per day as bars, new installs as a line on top.
  function dailyCard(rows) {
    if (!rows.length) return card('Daily active installs', null, h('p', { class: 'muted' }, 'No days in range.'));
    const W = 720, H = 180, P = { l: 34, r: 8, t: 10, b: 22 };
    const max = Math.max(1, ...rows.map((r) => r.installs));
    const step = (W - P.l - P.r) / rows.length;
    const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'an-chart', role: 'img', 'aria-label': `Daily active installs, ${rows[0].day} to ${rows.at(-1).day}, peak ${max}` });
    for (const t of [0, Math.round(max / 2), max]) {
      svg.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), class: 'an-grid' }),
        svgEl('text', { x: P.l - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'an-axis' }, String(t)));
    }
    rows.forEach((r, i) => {
      const x = P.l + i * step;
      const bh = (H - P.t - P.b) * (r.installs / max);
      svg.append(svgEl('rect', { x: x + step * 0.15, y: H - P.b - bh, width: Math.max(1, step * 0.7), height: bh, rx: Math.min(4, step * 0.2), class: 'an-bar' },
        svgEl('title', {}, `${r.day}: ${r.installs} active, ${r.new_installs} new, ${r.sessions} visits, ${r.lessons_done} lessons done`)));
    });
    const pts = rows.map((r, i) => `${(P.l + (i + 0.5) * step).toFixed(1)},${y(r.new_installs).toFixed(1)}`).join(' ');
    svg.append(svgEl('polyline', { points: pts, class: 'an-line' }));
    const labelEvery = Math.ceil(rows.length / 7);
    rows.forEach((r, i) => { if (i % labelEvery === 0 || i === rows.length - 1) svg.append(svgEl('text', { x: P.l + (i + 0.5) * step, y: H - 6, 'text-anchor': 'middle', class: 'an-axis' }, r.day.slice(5))); });
    const legend = h('div', { class: 'an-legend tiny' }, h('span', { class: 'an-key bar' }), 'active installs', h('span', { class: 'an-key line' }), 'new installs');
    const details = h('details', { class: 'an-details' }, h('summary', {}, 'Show as a table'),
      table([{ t: 'Day', v: (r) => r.day }, { t: 'Active', n: 1, v: (r) => num(r.installs) }, { t: 'New', n: 1, v: (r) => num(r.new_installs) },
        { t: 'Visits', n: 1, v: (r) => num(r.sessions) }, { t: 'Lessons done', n: 1, v: (r) => num(r.lessons_done) }], [...rows].reverse()));
    const wrap = h('div', { class: 'an-chart-wrap' }, svg);
    requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });   // phones: start at the latest days
    return card('Daily active installs', null, wrap, legend, details);
  }

  function funnelCard(rows) {
    const top = Math.max(1, rows[0]?.eligible || 0, ...rows.map((r) => r.installs));
    const list = h('div', { class: 'an-funnel' }, ...rows.map((r, i) => {
      const prev = i ? rows[i - 1].installs : null;
      const ofPrev = prev ? r.installs / prev : null;
      const partial = r.eligible < (rows[0]?.eligible || 0);
      return h('div', { class: 'an-frow' },
        h('span', { class: 'an-flabel' }, r.label),
        h('span', { class: 'an-ftrack' }, h('span', { class: 'an-ffill', style: `width:${Math.max(0.5, (r.installs / top) * 100)}%` })),
        h('span', { class: 'an-fnum mono' }, num(r.installs)),
        h('span', { class: 'an-fpct mono tiny' }, partial ? `of ${num(r.eligible)} eligible` : ofPrev == null ? '' : `${pct(ofPrev)} of prev`));
    }));
    return card('Funnel', 'NEW INSTALLS FIRST SEEN IN RANGE',
      rows.length && rows[0].eligible ? list : h('p', { class: 'muted' }, 'No new installs in this range.'),
      h('p', { class: 'hint' }, 'Players from before analytics existed are left out. "Next day" and "day 7" count only installs old enough to have had the chance.'));
  }

  const nodeName = (nm, id) => nm.node.get(id)?.title || id;
  function lessonsCard(rows, nm) {
    const sorted = [...rows].sort((a, b) => (nm.node.get(a.node)?.order ?? 1e5) - (nm.node.get(b.node)?.order ?? 1e5));
    const meter = (x) => h('span', { class: 'an-meter' }, h('span', { style: `width:${Math.round((x || 0) * 100)}%` }));
    return card('Lessons', 'PATH ORDER', table([
      { t: 'Lesson', v: (r) => h('span', { class: 'an-name' }, nodeName(nm, r.node), h('small', {}, r.node)) },
      { t: 'Started', n: 1, v: (r) => num(r.starts) },
      { t: 'Finished', n: 1, v: (r) => num(r.done) },
      { t: 'Completion', v: (r) => h('span', { class: 'an-cmp' }, meter(r.completion), h('span', { class: 'mono' }, pct(r.completion))) },
      { t: 'Quit', n: 1, v: (r) => num(r.quits) },
      { t: 'Median time', n: 1, v: (r) => dur(r.median_ms) },
      { t: 'Accuracy', n: 1, v: (r) => pct(r.accuracy) },
    ], sorted), h('p', { class: 'hint' }, 'Completion = finished / started. Closing the tab mid-lesson counts as started, not quit.'));
  }

  function exercisesCard(rows, nm) {
    const minIn = h('input', { type: 'number', min: 1, step: 1, value: String(range.minN), class: 'an-min', 'aria-label': 'Minimum first tries' });
    minIn.addEventListener('change', () => { const v = Math.max(1, Math.floor(Number(minIn.value) || 1)); range.minN = v; load(); });
    return card('Hardest exercises', 'LOWEST FIRST-TRY CORRECT',
      h('label', { class: 'an-date an-minrow' }, h('span', { class: 'tiny' }, 'At least this many first tries'), minIn),
      table([
        { t: 'Exercise', v: (r) => { const x = nm.ex.get(r.ex); return h('span', { class: 'an-name' }, x?.prompt ? x.prompt.slice(0, 90) + (x.prompt.length > 90 ? '…' : '') : r.ex, h('small', {}, `${r.ex} · ${x?.lesson || nodeName(nm, r.node)}`)); } },
        { t: 'Type', v: (r) => h('span', { class: 'mono tiny' }, r.type || '–') },
        { t: 'First tries', n: 1, v: (r) => num(r.tries) },
        { t: 'Right first time', n: 1, v: (r) => pct(r.first_try_ok) },
        { t: 'Skipped', n: 1, v: (r) => num(r.skips) },
      ], rows, `No exercise has ${range.minN}+ first tries in this range. Lower the minimum to see more.`));
  }

  function quitsCard(rows, nm) {
    return card('Where people quit', 'QUIT BUTTON', table([
      { t: 'Lesson', v: (r) => h('span', { class: 'an-name' }, nodeName(nm, r.node), h('small', {}, r.node)) },
      { t: 'On exercise', v: (r) => { const x = nm.ex.get(r.ex); return h('span', { class: 'an-name' }, x?.prompt ? x.prompt.slice(0, 70) + (x.prompt.length > 70 ? '…' : '') : (r.ex || '–'), r.ex ? h('small', {}, r.ex) : null); } },
      { t: 'Quits', n: 1, v: (r) => num(r.quits) },
      { t: 'How far in', n: 1, v: (r) => pct(r.progress) },
    ], rows, 'Nobody quit a lesson in this range.'));
  }

  function challengesCard(rows, nm) {
    return card('Challenges', null, table([
      { t: 'Challenge', v: (r) => h('span', { class: 'an-name' }, nm.level.get(r.level) || r.level, h('small', {}, r.level)) },
      { t: 'Started', n: 1, v: (r) => num(r.starts) },
      { t: 'Solved', n: 1, v: (r) => num(r.done) },
      { t: 'Avg stars', n: 1, v: (r) => (r.stars == null ? '–' : Number(r.stars).toFixed(1)) },
      { t: 'Avg moves', n: 1, v: (r) => (r.moves == null ? '–' : Number(r.moves).toFixed(1)) },
    ], rows));
  }

  await load();
}
