// /admin: the user list with a progress summary, an edit drawer per user (progress numbers, lesson
// progress, course reset, admin rights, ban) and delete. Every check that matters runs in Postgres
// (the admin_* functions in supabase/schema.sql check the signed-in JWT's email against the admins
// table), so this page holds no secrets: anyone can load it, and anyone who isn't an admin just sees
// "Not authorised". Online-only, not in the service-worker cache.
//
// Edits don't overwrite the player's devices blindly: the server stamps each one into the state
// (state.adminEdits) and js/cloud/merge.js makes a lowered value stick against older copies while
// keeping play the admin never saw on top. See .notes/user-accounts-supabase.md.
import { h, confirmModal, holdFocus } from '../js/dom.js';
import { applyTheme } from '../js/theme.js';
import { toast } from '../js/ui/fx.js';
import { walletOf, balance } from '../js/wallet.js';
import { cloudConfigured, getClient, signInWithGoogle, cleanAuthParams, profileOf } from '../js/cloud/client.js';

const root = document.getElementById('admin');
// The game: /app on Vercel (vercel.json routes it); file servers (the local playground) only have /index.html.
const APP_HREF = location.hostname.endsWith('vercel.app') ? '/app' : '/index.html';
applyTheme();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()); } catch { /* old browsers */ }

const top = (...tools) => h('header', { class: 'admin-top' },
  h('div', {}, h('a', { class: 'brand', href: APP_HREF }, '← learn-git'), h('h1', {}, 'Admin')),
  tools.length ? h('div', { class: 'admin-tools' }, ...tools) : null);
const message = (title, text, ...actions) => root.replaceChildren(top(), h('section', { class: 'card admin-msg' }, h('h2', {}, title), text ? h('p', {}, text) : null, ...actions));

const fmt = (t) => (t ? new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const n0 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const errText = (e) => e?.message || String(e);

function avatar(r, cls = '') {
  const ini = h('span', { class: 'ini ' + cls, 'aria-hidden': 'true' }, (r.name || r.email || '?')[0].toUpperCase());
  if (!r.avatar) return ini;
  const img = h('img', { src: r.avatar, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy', class: cls });
  img.addEventListener('error', () => img.replaceWith(ini));
  return img;
}
const pills = (r) => (r.is_admin || r.banned
  ? h('span', { class: 'pills' }, r.is_admin ? h('span', { class: 'tag-pill is-admin' }, 'ADMIN') : null, r.banned ? h('span', { class: 'tag-pill is-banned' }, 'BANNED') : null)
  : null);

async function main() {
  if (!cloudConfigured()) return message('Accounts are off', 'js/cloud/config.js has no Supabase URL / anon key yet. See supabase/README.md.');
  let sb;
  try { sb = await getClient(); } catch { return message('Can\'t reach Supabase', 'The admin page needs a connection. Check that you are online and reload.', h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Reload')); }
  const params = new URLSearchParams(location.search);
  const { data: { session } } = await sb.auth.getSession();
  const returnError = params.get('error_description') || params.get('error');
  cleanAuthParams();
  if (!session) {
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => { btn.disabled = true; try { await signInWithGoogle(); } catch { btn.disabled = false; toast('Could not start sign-in.'); } } }, 'Sign in with Google');
    return message('Sign in', returnError ? `Sign-in did not finish: ${returnError}` : 'Sign in with the Google account that is listed as an admin.', btn);
  }
  const me = profileOf(session.user);
  const signOut = h('button', { class: 'btn small dark', type: 'button', onclick: async () => { await sb.auth.signOut({ scope: 'local' }); location.reload(); } }, 'Sign out');
  const { data: admin, error: aerr } = await sb.rpc('is_admin');
  if (aerr) return message('Something went wrong', `is_admin() failed: ${aerr.message}. Has supabase/schema.sql been run?`, signOut);
  if (!admin) return message('Not authorised', `${me.email} is not an admin. Admins are listed in the admins table (see supabase/README.md).`, signOut);
  await listUsers(sb, me, signOut);
}

async function listUsers(sb, me, signOut) {
  root.replaceChildren(top(signOut), h('p', { class: 'muted' }, 'Loading users…'));
  const { data, error } = await sb.rpc('admin_list_users');
  if (error) return message('Could not load users', error.message, signOut);
  let rows = data || [];
  const search = h('input', { class: 'admin-search', type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search users' });
  const count = h('span', { class: 'count mono tiny' });
  const tbody = h('tbody');
  const refresh = h('button', { class: 'btn small', type: 'button', onclick: () => listUsers(sb, me, signOut) }, 'Refresh');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = rows.filter((r) => !q || `${r.name || ''} ${r.email || ''}`.toLowerCase().includes(q));
    count.textContent = `${shown.length} of ${rows.length} user${rows.length === 1 ? '' : 's'}`;
    tbody.replaceChildren(...shown.map((r) => {
      const edit = h('button', { class: 'btn small', type: 'button', onclick: () => openEditor(sb, me, r, (patch) => {
        if (patch === null) rows = rows.filter((x) => x.id !== r.id); else Object.assign(r, patch);
        draw();
      }) }, 'Edit');
      const del = h('button', { class: 'btn small ghost del', type: 'button', disabled: r.id === me.id, title: r.id === me.id ? 'This is you' : null, onclick: async () => {
        if (!(await confirmModal('Delete this user?', `${r.email}: the account and its cloud progress are deleted for good. Their own devices keep a local guest copy.`, { ok: 'Delete user', danger: true }))) return;
        del.disabled = true;
        const { error: e } = await sb.rpc('admin_delete_user', { uid: r.id });
        if (e) { del.disabled = false; toast(`Delete failed: ${e.message}`, { ms: 3600 }); return; }
        rows = rows.filter((x) => x.id !== r.id);
        draw();
        toast(`Deleted ${r.email}`);
      } }, 'Delete');
      return h('tr', {},
        h('td', {}, h('div', { class: 'who' }, avatar(r), h('span', {}, r.name || r.email, r.name ? h('small', {}, r.email) : null, pills(r)))),
        h('td', { class: 'when' }, fmt(r.created_at)),
        h('td', { class: 'when' }, fmt(r.last_sign_in_at)),
        h('td', { class: 'ncol' }, String(r.total_xp ?? 0)),
        h('td', { class: 'ncol' }, String(r.streak ?? 0)),
        h('td', { class: 'ncol' }, String(r.lessons ?? 0)),
        h('td', { class: 'when' }, r.updated_at ? fmt(r.updated_at) : 'never'),
        h('td', {}, h('div', { class: 'row-actions' }, edit, del)));
    }));
  };
  search.addEventListener('input', draw);
  const table = h('div', { class: 'table-wrap' }, h('table', { class: 'users' },
    h('thead', {}, h('tr', {}, ...['User', 'Joined', 'Last sign-in'].map((t) => h('th', {}, t)), ...['XP', 'Streak', 'Lessons'].map((t) => h('th', { class: 'ncol' }, t)), h('th', {}, 'Last sync'), h('th', {}, h('span', { class: 'skip' }, 'Actions')))),
    tbody));
  root.replaceChildren(top(refresh, signOut), h('div', { class: 'admin-tools' }, search, count), table);
  draw();
}

/* ------------------------------------------------------------ edit drawer */
// The numbers an admin can set (the keys are admin_update_progress's patch keys).
const NUMBERS = [
  { key: 'totalXp', label: 'XP', get: (s) => s.totalXp },
  // cherries and stashes are ledger balances (js/wallet.js); the plain numbers are only mirrors
  { key: 'gems', label: 'Cherries', get: (s) => balance(walletOf(s).gems) },
  { key: 'streak.freezes', label: 'Stashes', get: (s) => balance(walletOf(s).freezes), max: 2 },   // MAX_STASHES in js/ui/game.js
  { key: 'streak.count', label: 'Streak', get: (s) => s.streak?.count },
  { key: 'streak.best', label: 'Best streak', get: (s) => s.streak?.best },
];

let pathNodes = null;   // the game's path (same ids and titles), loaded once
async function loadPath() {
  if (!pathNodes) {
    const [{ UNITS }, { buildNodes }] = await Promise.all([import('../js/content/index.js'), import('../js/ui/path-nodes.js')]);
    pathNodes = buildNodes(UNITS);
  }
  return pathNodes;
}

// onChange(patch): patch = fields to update on the table row, or null when the user was removed.
async function openEditor(sb, me, r, onChange) {
  const self = r.id === me.id;
  // a modal drawer: the page behind is inert and Tab stays inside (holdFocus); Escape closes; focus returns to the row
  let hold = null;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); hold?.release({ restore: false }); opener?.focus?.(); };
  const opener = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-wrap')) close(); };
  const closeBtn = h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Close', onclick: close }, '×');
  const head = h('div', { class: 'drawer-head' }, avatar(r), h('div', { class: 'who-t' }, h('h2', {}, r.name || r.email), r.name ? h('small', {}, r.email) : null, pills(r)), closeBtn);
  const body = h('div', { class: 'drawer-body' }, h('p', { class: 'muted' }, 'Loading progress…'));
  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Edit ${r.email}` }, head, body);
  const wrap = h('div', { class: 'drawer-wrap', onclick: (e) => { if (e.target === wrap) close(); } }, drawer);
  document.body.append(wrap);
  hold = holdFocus(wrap);
  document.addEventListener('keydown', onKey);
  closeBtn.focus();

  const redraw = async () => {
    const [{ data: prog, error }, nodes] = await Promise.all([sb.rpc('admin_get_progress', { uid: r.id }), loadPath().catch(() => null)]);
    if (error) { body.replaceChildren(h('p', { class: 'danger-t' }, `Could not load progress: ${error.message}`)); return; }
    const state = prog?.state || null;
    body.replaceChildren(...[
      numbersCard(state),
      accountCard(),
      lessonsCard(state, nodes),   // last: it is the long one
    ].filter(Boolean));
  };
  // Saves through the server, then shows the state it returns and updates the table row.
  const apply = async (fn, args, okText) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) { toast(`Not saved: ${error.message}`, { ms: 4000 }); return false; }
    if (data && typeof data === 'object') onChange({ total_xp: n0(data.totalXp), streak: n0(data.streak?.count), updated_at: new Date().toISOString() });
    // The database still has the pre-ledger admin_update_progress: a cherry/stash edit on a ledger save
    // would be ignored by the next sync (supabase/README.md, supabase/migrations/wallet_ledger.sql).
    const stale = data?.wallet && ['gems', 'streak.freezes'].some((k) => k in (args.patch || {}) && data.adminEdits?.fields?.[k] && typeof data.adminEdits.fields[k].base !== 'number');
    if (stale) toast('Cherries/stashes won\'t stick: run supabase/migrations/wallet_ledger.sql first.', { ms: 6000 });
    else toast(okText);
    await redraw();
    return true;
  };

  /* progress numbers */
  function numbersCard(state) {
    const card = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, 'Progress')));
    if (!state) { card.append(h('p', { class: 'muted' }, 'No synced progress yet: this player has never synced a device. There is nothing to edit until they do.')); return card; }
    const inputs = NUMBERS.map((f) => {
      const was = n0(f.get(state));
      const input = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: f.max ?? null, step: 1, value: String(was), id: `f-${f.key}` });
      const note = h('span', { class: 'was' });
      input.addEventListener('input', () => {
        const v = Number(input.value);
        const changed = input.value !== '' && v !== was;
        input.classList.toggle('changed', changed);
        note.textContent = changed ? `was ${was}` : '';
        save.disabled = !inputs.some((x) => x.changed());
      });
      return { f, was, input, changed: () => input.value !== '' && Number(input.value) !== was,
        el: h('label', { class: 'num-field', for: `f-${f.key}` }, h('span', { class: 'tiny' }, f.label), input, note) };
    });
    const save = h('button', { class: 'btn primary small', type: 'button', disabled: true, onclick: async () => {
      const patch = {}, lowered = [];
      for (const x of inputs) {
        if (!x.changed()) continue;
        const v = Number(x.input.value);
        if (!Number.isInteger(v) || v < 0 || (x.f.max != null && v > x.f.max)) { toast(`${x.f.label} must be a whole number from 0${x.f.max != null ? ` to ${x.f.max}` : ''}.`, { ms: 3200 }); x.input.focus(); return; }
        patch[x.f.key] = v;
        if (v < x.was) lowered.push(`${x.f.label} ${x.was} → ${v}`);
      }
      const best = 'streak.best' in patch ? patch['streak.best'] : n0(state.streak?.best);
      const count = 'streak.count' in patch ? patch['streak.count'] : n0(state.streak?.count);
      if (best < count) { toast('Best streak can\'t be lower than the streak.', { ms: 3200 }); return; }
      if (lowered.length && !(await confirmModal('Lower these values?', `${lowered.join(', ')}. This sticks on every device, even ones that are offline now; anything they earn later is added on top.`, { ok: 'Lower them', danger: true }))) return;
      save.disabled = true;
      if (!(await apply('admin_update_progress', { uid: r.id, patch }, 'Progress saved'))) save.disabled = false;
    } }, 'Save numbers');
    card.append(h('div', { class: 'num-grid' }, inputs.map((x) => x.el)),
      h('p', { class: 'hint' }, 'Their devices pick this up on their next sync.'),
      h('div', { class: 'drawer-actions' }, save));
    return card;
  }

  /* lesson progress */
  function lessonsCard(state, nodes) {
    const card = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, 'Lessons'), h('span', { class: 'mono tiny' }, 'GIT COURSE')));
    if (!state) return null;
    if (!nodes) { card.append(h('p', { class: 'danger-t' }, 'Could not load the lesson list.')); return card; }
    const saved = state.nodes || {};
    const pending = new Map();   // node id -> { done, crowns }
    const counter = h('span', { class: 'mono tiny' });
    const save = h('button', { class: 'btn primary small', type: 'button', disabled: true });
    const sync = () => {
      counter.textContent = pending.size ? `${pending.size} CHANGE${pending.size > 1 ? 'S' : ''}` : '';
      save.disabled = !pending.size;
      save.textContent = pending.size ? `Save ${pending.size} lesson change${pending.size > 1 ? 's' : ''}` : 'Save lesson changes';
    };
    sync();
    const groups = [];
    let unitId = null, group = null;
    for (const n of nodes) {
      if (n.unit.id !== unitId) {
        unitId = n.unit.id;
        group = h('div', { class: 'unit-group' }, h('span', { class: 'tiny' }, `UNIT ${n.ui + 1} · ${n.unit.title}`));
        groups.push(group);
      }
      if (n.kind === 'challenge') {
        const stars = n0(state.challenges?.[n.levelId]?.stars);
        group.append(h('div', { class: 'node-row' }, h('span', { class: 't' }, n.title, h('small', {}, 'CHALLENGE')),
          h('span', { class: 'stars-ro', title: 'Challenges are earned by playing them' }, stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'not played')));
        continue;
      }
      const cur = saved[n.id] || { done: false, crowns: 0 };
      const row = h('div', { class: 'node-row' });
      const box = h('input', { type: 'checkbox', checked: !!cur.done, 'aria-label': `${n.title} done` });
      const crowns = n.kind === 'lesson' ? h('select', { 'aria-label': `${n.title} crowns` }, [0, 1, 2, 3, 4, 5].map((c) => h('option', { value: c, selected: n0(cur.crowns) === c }, `${c} ♛`))) : null;
      const update = () => {
        const next = { done: box.checked, crowns: crowns ? Number(crowns.value) : (box.checked ? Math.max(1, n0(cur.crowns)) : 0) };
        if (!crowns && !box.checked) next.crowns = 0;
        const same = next.done === !!cur.done && (crowns ? next.crowns === n0(cur.crowns) : true);
        if (same) pending.delete(n.id); else pending.set(n.id, next);
        row.classList.toggle('changed', !same);
        sync();
      };
      box.addEventListener('change', () => {
        // a done lesson has at least one crown; an undone one has none
        if (crowns) crowns.value = box.checked ? String(Math.max(1, Number(crowns.value))) : '0';
        update();
      });
      crowns?.addEventListener('change', () => { box.checked = Number(crowns.value) > 0; update(); });
      row.append(h('span', { class: 't' }, n.title, n.kind !== 'lesson' ? h('small', {}, n.kind === 'release' ? 'RELEASE' : 'REVIEW') : null),
        h('label', { class: 'done' }, box, 'done'), crowns || '');
      group.append(row);
    }
    save.addEventListener('click', async () => {
      const patch = {}, undone = [];
      for (const [id, v] of pending) {
        const was = saved[id] || { done: false, crowns: 0 };
        patch[id] = v.done || v.crowns ? v : null;
        if ((was.done && !v.done) || n0(v.crowns) < n0(was.crowns)) undone.push(nodes.find((x) => x.id === id)?.title || id);
      }
      if (undone.length && !(await confirmModal('Take this progress away?', `${undone.length === 1 ? undone[0] : `${undone.length} lessons (${undone.slice(0, 3).join(', ')}${undone.length > 3 ? ', …' : ''})`} will be marked not done or lose crowns, on every device.`, { ok: 'Save changes', danger: true }))) return;
      save.disabled = true;
      if (!(await apply('admin_update_progress', { uid: r.id, patch: { nodes: patch } }, 'Lessons saved'))) save.disabled = false;
    });
    const reset = h('button', { class: 'btn small ghost del', type: 'button', onclick: async () => {
      if (!(await confirmModal('Reset the git course?', `Every lesson, release, challenge, the mistakes deck and the command cards go back to the start for ${r.email}, on every device. XP, cherries, streak and achievements stay.`, { ok: 'Reset course', danger: true }))) return;
      reset.disabled = true;
      if (!(await apply('admin_reset_course', { uid: r.id, course: 'git' }, 'Course reset'))) reset.disabled = false;
    } }, 'Reset course');
    card.append(...groups, h('div', { class: 'drawer-actions' }, counter, reset, save));
    return card;
  }

  /* admin rights and ban */
  function accountCard() {
    const adminBtn = h('button', { class: 'btn small' + (r.is_admin ? '' : ' dark'), type: 'button', disabled: self && r.is_admin, title: self ? 'You can\'t remove your own admin rights' : null, onclick: async () => {
      const make = !r.is_admin;
      if (!make && !(await confirmModal('Remove admin rights?', `${r.email} will no longer be able to open /admin.`, { ok: 'Remove admin', danger: true }))) return;
      adminBtn.disabled = true;
      const { error } = await sb.rpc('admin_set_admin', { target_email: r.email, make });
      if (error) { adminBtn.disabled = false; toast(`Not changed: ${error.message}`, { ms: 4000 }); return; }
      onChange({ is_admin: make });
      toast(make ? `${r.email} is now an admin` : `${r.email} is no longer an admin`);
      refreshHead(); await redraw();
    } }, r.is_admin ? 'Remove admin' : 'Make admin');
    const banBtn = h('button', { class: 'btn small' + (r.banned ? '' : ' ghost del'), type: 'button', disabled: self, title: self ? 'You can\'t ban yourself' : null, onclick: async () => {
      const banned = !r.banned;
      if (banned && !(await confirmModal('Ban this user?', `${r.email} is signed out everywhere and can't sign in again until you unban them. Their progress is kept.`, { ok: 'Ban', danger: true }))) return;
      banBtn.disabled = true;
      const { error } = await sb.rpc('admin_set_banned', { uid: r.id, banned });
      if (error) { banBtn.disabled = false; toast(`Not changed: ${error.message}`, { ms: 4000 }); return; }
      onChange({ banned });
      toast(banned ? `${r.email} is banned` : `${r.email} can sign in again`);
      refreshHead(); await redraw();
    } }, r.banned ? 'Unban' : 'Ban sign-in');
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, 'Account')),
      h('div', { class: 'acct-rows' },
        h('div', { class: 'acct-row' }, h('p', {}, r.is_admin ? 'Admin: can open this page and edit every user.' : 'Not an admin.'), adminBtn),
        h('div', { class: 'acct-row' }, h('p', {}, r.banned ? 'Banned: can\'t sign in. Their progress is kept.' : 'Can sign in.'), banBtn)));
  }
  const refreshHead = () => { const p = head.querySelector('.pills'); const np = pills(r); if (p) p.replaceWith(np || ''); else if (np) head.querySelector('.who-t').append(np); };

  await redraw();
}

main().catch((e) => { console.error(e); message('Something went wrong', errText(e)); });
