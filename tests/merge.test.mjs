// Cloud sync merge (js/cloud/merge.js): every rule in .notes/user-accounts-supabase.md, plus
// idempotence and commutativity. Run: node tests/merge.test.mjs (or node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, sameState } from '../js/cloud/merge.js';
import { freshState, repairState } from '../js/storage.js';
import { record, writeMirrors, balance, stashKey } from '../js/wallet.js';

// A save with the patch applied; gems / streak.freezes in the patch become the wallet's base (the same
// migration an old save gets in repairState).
const base = (patch = {}) => {
  const s = freshState();
  for (const [k, v] of Object.entries(patch)) s[k] = isPlain(v) && isPlain(s[k]) ? { ...s[k], ...v } : v;
  delete s.wallet;
  return repairState(s);
};
const J = (x) => JSON.parse(JSON.stringify(x));
// What game.js does: earnGems / spendGems / addStashes / useStashes on one device (returns a new copy).
function act(state, device, { earn = 0, spend = 0, stashes = 0, popDays = [] } = {}) {
  const s = J(state);
  record(s.wallet.gems, 'earn', device, earn);
  if (spend) { assert.ok(balance(s.wallet.gems) >= spend, 'spending more than the balance'); record(s.wallet.gems, 'spend', device, spend); }
  record(s.wallet.freezes, 'earn', device, stashes);
  for (const d of popDays) record(s.wallet.freezes, 'spend', stashKey(d), 1);
  return writeMirrors(s);
}
const isPlain = (x) => x && typeof x === 'object' && !Array.isArray(x);

// Two realistic, different saves: a phone and a laptop.
const phone = base({
  onboarded: true, placement: 0, goal: 20, mute: true, savedAt: 1000,
  totalXp: 60, xpByDay: { '2026-11-01': 30, '2026-11-02': 30 }, gems: 40, boostUntil: 500,
  streak: { count: 2, best: 2, lastDay: '2026-11-02', freezes: 1, frozen: ['2026-10-20'], celebrated: '2026-11-02' },
  goalDays: { '2026-11-01': true, '2026-11-02': true },
  nodes: { 'basics:lesson:a': { done: true, crowns: 2, best: 0.8 }, 'basics:lesson:b': { done: true, crowns: 1, best: 1 } },
  challenges: { 'l1': { stars: 2 } },
  quests: { day: '2026-11-02', progress: { q1: 3, q2: 1 }, claimed: { q1: true }, chest: false },
  achievements: { 'first-lesson': 100, 'perfect': 300 },
  mistakes: { 'k1': { box: 1, due: 5000, misses: 1 }, 'k2': { box: 0, due: 100, misses: 2 } },
  stats: { lessons: 3, perfect: 1, challenges: 1, chests: 0, bestCombo: 6, reviewed: 0, speedBest: 4, bisectBest: 7, units: 0, accSum: 2.5, accN: 3, spent: 0 },
  seen: { 'unit:basics': true, tip: 50 },
  courses: { git: { cards: { add: 100, commit: 200 }, seenCards: { add: true } } },
  cosmetics: { owned: { hat: 400 }, equipped: { head: 'hat' } },
});
const laptop = base({
  onboarded: true, placement: 1, goal: 30, mute: false, savedAt: 2000,
  totalXp: 50, xpByDay: { '2026-11-01': 10, '2026-11-03': 40 }, gems: 25, boostUntil: 900,
  streak: { count: 1, best: 4, lastDay: '2026-11-03', freezes: 0, frozen: ['2026-10-21'], celebrated: null },
  goalDays: { '2026-11-03': true },
  nodes: { 'basics:lesson:a': { done: true, crowns: 3, best: 0.6 }, 'basics:lesson:c': { done: true, crowns: 1, best: 0.9 } },
  challenges: { 'l1': { stars: 3 }, 'l2': { stars: 1 } },
  quests: { day: '2026-11-03', progress: { q3: 2 }, claimed: {}, chest: false },
  achievements: { 'first-lesson': 50, 'xp100': 900 },
  mistakes: { 'k1': { box: 2, due: 9000, misses: 1 }, 'k3': { box: 0, due: 10, misses: 1 } },
  stats: { lessons: 2, perfect: 2, challenges: 2, chests: 1, bestCombo: 4, reviewed: 3, speedBest: 9, bisectBest: 5, units: 1, accSum: 1.9, accN: 2, spent: 50 },
  seen: { 'unit:basics': true, tip: 20, signinNudge: true },
  courses: { git: { cards: { add: 50, branch: 300 }, seenCards: { branch: true } } },
  cosmetics: { owned: { hat: 700, scarf: 800 }, equipped: { head: 'crown' } },
});

test('xpByDay: max per day; totalXp: max(a, b, sum of days)', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.xpByDay, { '2026-11-01': 30, '2026-11-02': 30, '2026-11-03': 40 });
  assert.equal(m.totalXp, 100); // the sum (100) beats both totals (60, 50)
  const big = mergeStates({ ...phone, totalXp: 500 }, laptop);
  assert.equal(big.totalXp, 500);
});

test('nodes: union, done OR, crowns and best max', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.nodes['basics:lesson:a'], { done: true, crowns: 3, best: 0.8 });
  assert.ok(m.nodes['basics:lesson:b'].done && m.nodes['basics:lesson:c'].done);
  const notDone = mergeStates(base({ nodes: { x: { done: false, crowns: 0, best: 0 } } }), base({ nodes: { x: { done: true, crowns: 1, best: 0.5 } } }));
  assert.deepEqual(notDone.nodes.x, { done: true, crowns: 1, best: 0.5 });
});

test('challenges: max stars, union', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.challenges, { l1: { stars: 3 }, l2: { stars: 1 } });
});

test('goalDays, seen, achievements, cosmetics.owned and cards: union, earliest timestamp', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.goalDays, { '2026-11-01': true, '2026-11-02': true, '2026-11-03': true });
  assert.deepEqual(m.seen, { 'unit:basics': true, tip: 20, signinNudge: true });
  assert.deepEqual(m.achievements, { 'first-lesson': 50, perfect: 300, xp100: 900 });
  assert.deepEqual(m.cosmetics.owned, { hat: 400, scarf: 800 });
  assert.deepEqual(m.courses.git.cards, { add: 50, commit: 200, branch: 300 });
  assert.deepEqual(m.courses.git.seenCards, { add: true, branch: true });
});

test('stats: max per field, bisectBest min, accuracy pair from the side with more lessons', () => {
  const m = mergeStates(phone, laptop);
  assert.equal(m.stats.lessons, 3);
  assert.equal(m.stats.perfect, 2);
  assert.equal(m.stats.speedBest, 9);
  assert.equal(m.stats.bestCombo, 6);
  assert.equal(m.stats.spent, 50);
  assert.equal(m.stats.bisectBest, 5);
  assert.deepEqual([m.stats.accSum, m.stats.accN], [2.5, 3]);
  const one = mergeStates(base({ stats: { bisectBest: null } }), base({ stats: { bisectBest: 9 } }));
  assert.equal(one.stats.bisectBest, 9);
  const none = mergeStates(base(), base());
  assert.equal(none.stats.bisectBest, null);
});

test('streak: count from the later lastDay, best max, frozen union; freezes from the wallet', () => {
  const m = mergeStates(phone, laptop);
  assert.equal(m.streak.lastDay, '2026-11-03');
  assert.equal(m.streak.count, 1);
  assert.equal(m.streak.best, 4);
  assert.deepEqual(m.streak.frozen, ['2026-10-20', '2026-10-21']);
  assert.equal(m.streak.freezes, 1);
  const sameDay = mergeStates(base({ streak: { count: 5, lastDay: '2026-11-03' } }), base({ streak: { count: 3, lastDay: '2026-11-03' } }));
  assert.equal(sameDay.streak.count, 5);
});

test('boostUntil: max; two pre-ledger saves migrate to bases that max-merge (the old rule, once)', () => {
  const m = mergeStates(phone, laptop);
  assert.equal(m.gems, 40);
  assert.equal(m.boostUntil, 900);
  assert.deepEqual(m.wallet.gems, { base: 40, earn: {}, spend: {} });
});

test('mistakes: union, per key the later due', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.mistakes.k1, { box: 2, due: 9000, misses: 1 });
  assert.ok(m.mistakes.k2 && m.mistakes.k3);
});

test('quests: the later day wins; the same day merges', () => {
  const m = mergeStates(phone, laptop);
  assert.deepEqual(m.quests, laptop.quests);
  const a = base({ quests: { day: 'd', progress: { q1: 2, q2: 5 }, claimed: { q2: true }, chest: false, chestOpened: true } });
  const b = base({ quests: { day: 'd', progress: { q1: 4 }, claimed: { q1: true }, chest: true } });
  assert.deepEqual(mergeStates(a, b).quests, { day: 'd', progress: { q1: 4, q2: 5 }, claimed: { q1: true, q2: true }, chest: true, chestOpened: true });
});

test('settings (goal, mute, placement, equipped) come from the newer save', () => {
  const m = mergeStates(phone, laptop);
  assert.equal(m.goal, 30);
  assert.equal(m.mute, false);
  assert.equal(m.placement, 1);
  assert.deepEqual(m.cosmetics.equipped, { head: 'crown' });
  const m2 = mergeStates({ ...phone, savedAt: 3000 }, laptop);
  assert.equal(m2.goal, 20);
  assert.equal(m2.mute, true);
  assert.deepEqual(m2.cosmetics.equipped, { head: 'hat' });
  assert.equal(m2.savedAt, 3000);
});

test('onboarded: OR (a fresh device signing in adopts the cloud progress)', () => {
  const fresh = freshState();
  const m = mergeStates(fresh, laptop);
  assert.equal(m.onboarded, true);
  assert.equal(m.totalXp, 50);
  assert.equal(m.goal, 30); // fresh device has no savedAt, so the cloud's settings win
});

test('resetAt: the copy from before a later "reset everywhere" is dropped whole', () => {
  const reset = { ...freshState(), resetAt: 5000, savedAt: 5000 };
  assert.ok(sameState(mergeStates(phone, reset), reset));
  assert.ok(sameState(mergeStates(reset, phone), reset));
  const after = { ...reset, totalXp: 10, xpByDay: { '2026-11-05': 10 } };
  assert.equal(mergeStates(after, reset).totalXp, 10);
});

test('inputs are not mutated', () => {
  const a = JSON.parse(JSON.stringify(phone)), b = JSON.parse(JSON.stringify(laptop));
  mergeStates(a, b);
  assert.deepEqual(a, phone);
  assert.deepEqual(b, laptop);
});

test('idempotence: merge(a, a) deep-equals a', () => {
  for (const s of [phone, laptop, freshState(), repairState({ v: 2, onboarded: true })]) {
    assert.deepEqual(mergeStates(s, s), s);
  }
  const m = mergeStates(phone, laptop);
  assert.deepEqual(mergeStates(m, m), m);
  // merging again with either input changes nothing
  assert.deepEqual(mergeStates(m, phone), m);
  assert.deepEqual(mergeStates(laptop, m), m);
});

test('commutativity: merge(a, b) equals merge(b, a)', () => {
  assert.ok(sameState(mergeStates(phone, laptop), mergeStates(laptop, phone)));
  // with equal savedAt the tie still breaks the same way both ways round
  const p = { ...phone, savedAt: 0 }, l = { ...laptop, savedAt: 0 };
  assert.ok(sameState(mergeStates(p, l), mergeStates(l, p)));
  // union and max fields, explicitly
  const ab = mergeStates(phone, laptop), ba = mergeStates(laptop, phone);
  for (const k of ['xpByDay', 'totalXp', 'nodes', 'challenges', 'goalDays', 'seen', 'achievements', 'stats', 'streak', 'gems', 'mistakes', 'courses', 'boostUntil']) {
    assert.deepEqual(ab[k], ba[k], k);
  }
  assert.deepEqual(ab.cosmetics.owned, ba.cosmetics.owned);
});

test('associativity on the union and max fields (three devices)', () => {
  const third = base({ xpByDay: { '2026-11-04': 5 }, totalXp: 5, gems: 99, achievements: { perfect: 10 }, savedAt: 1500 });
  const l = mergeStates(mergeStates(phone, laptop), third), r = mergeStates(phone, mergeStates(laptop, third));
  for (const k of ['xpByDay', 'totalXp', 'nodes', 'gems', 'achievements', 'stats']) assert.deepEqual(l[k], r[k], k);
});

test('sameState ignores key order', () => {
  assert.ok(sameState({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }));
  assert.ok(!sameState({ a: 1 }, { a: 2 }));
  assert.ok(!sameState({ a: [1] }, { a: [1, 2] }));
});

/* ---------------------------------------------------------------- admin edits */
// Mirrors admin_update_progress / admin_reset_course in supabase/schema.sql: the cloud copy gets the
// new values plus a stamp saying what each value was before (tests/sync.test.mjs and the SQL check
// in the notes cover the server side).
const PATHS = { totalXp: ['totalXp'], gems: ['gems'], 'streak.freezes': ['streak', 'freezes'], 'streak.count': ['streak', 'count'], 'streak.best': ['streak', 'best'] };
const WALLET = { gems: 'gems', 'streak.freezes': 'freezes' };
function adminEdit(state, patch, at) {
  const s = JSON.parse(JSON.stringify(state));
  const E = s.adminEdits ||= { fields: {}, nodes: {}, courses: {} };
  for (const [k, to] of Object.entries(patch)) {
    if (k === 'nodes') {
      for (const [id, v] of Object.entries(to)) {
        const from = s.nodes[id] || null;
        const next = v && (v.done || v.crowns) ? { done: !!v.done, crowns: v.crowns || 0, best: v.done ? (from?.best ?? 0) : 0 } : null;
        if (next) s.nodes[id] = next; else delete s.nodes[id];
        E.nodes[id] = { at, to: next, from };
      }
      continue;
    }
    if (k === 'resetCourse') {
      s.nodes = {}; s.challenges = {}; s.mistakes = {}; s.courses[to] = { ...s.courses[to], cards: {}, seenCards: {} };
      E.courses[to] = at; E.nodes = {};
      continue;
    }
    const p = PATHS[k];
    const o = p.length === 1 ? s : s[p[0]];
    if (WALLET[k]) {
      // the ledger: from = the derived balance; the new base makes the balance `to` over these counters
      const acc = s.wallet[WALLET[k]];
      const from = balance(acc), sum = (m) => Object.values(m).reduce((x, y) => x + y, 0);
      acc.base = to - sum(acc.earn) + sum(acc.spend);
      o[p[p.length - 1]] = to;
      E.fields[k] = { at, to, from, base: acc.base };
      continue;
    }
    const from = o[p[p.length - 1]] || 0;
    o[p[p.length - 1]] = to;
    E.fields[k] = { at, to, from, ...(k === 'totalXp' ? { days: Object.values(s.xpByDay).reduce((x, y) => x + y, 0) } : {}) };
  }
  return s;
}
// One account: the cloud copy at 500 XP, and devices that all synced it.
const synced = base({
  onboarded: true, savedAt: 1000, totalXp: 500, gems: 300, xpByDay: { '2026-11-01': 200, '2026-11-02': 300 },
  streak: { count: 9, best: 12, lastDay: '2026-11-02', freezes: 2, frozen: [], celebrated: null },
  nodes: { 'basics:lesson:a': { done: true, crowns: 2, best: 0.9 }, 'basics:lesson:b': { done: true, crowns: 1, best: 1 } },
  challenges: { l1: { stars: 3 } }, mistakes: { k1: { box: 1, due: 5, misses: 1 } },
  courses: { git: { cards: { add: 1, commit: 2 }, seenCards: { add: true } } },
});
const T = 10_000;

test('admin edit: a lowered value sticks against a copy that synced before the edit', () => {
  const cloud = adminEdit(synced, { totalXp: 100, gems: 5, 'streak.freezes': 0, 'streak.count': 1, 'streak.best': 3 }, T);
  for (const m of [mergeStates(synced, cloud), mergeStates(cloud, synced)]) {
    assert.equal(m.totalXp, 100);
    assert.equal(m.gems, 5);
    assert.equal(m.streak.freezes, 0);
    assert.equal(m.streak.count, 1);
    assert.equal(m.streak.best, 3);
    assert.deepEqual(m.adminEdits, cloud.adminEdits);
  }
});

test('admin edit: a device offline during the edit keeps the play the admin never saw, on top', () => {
  const cloud = adminEdit(synced, { totalXp: 100, gems: 5 }, T);
  // offline: earned 20 XP on a new day and 7 cherries, never synced, then comes back
  const offline = { ...act(synced, 'phone', { earn: 7 }), totalXp: 520, xpByDay: { ...synced.xpByDay, '2026-11-03': 20 }, savedAt: 9000 };
  const m = mergeStates(offline, cloud);
  assert.equal(m.totalXp, 120);
  assert.equal(m.gems, 12);
  assert.equal(m.xpByDay['2026-11-03'], 20);        // the heatmap history is kept as it is
  assert.ok(sameState(m, mergeStates(cloud, offline)));
  // ...and after that, play on any device adds on top of the edited value with the normal max merge
  const later = { ...JSON.parse(JSON.stringify(m)), totalXp: 135, xpByDay: { ...m.xpByDay, '2026-11-04': 15 } };
  assert.equal(mergeStates(later, m).totalXp, 135);
  assert.equal(mergeStates(m, later).totalXp, 135);
  // a stale copy from before the edit can't lift it back up
  assert.equal(mergeStates(mergeStates(later, m), synced).totalXp, 135);
});

test('admin edit: two devices playing after the edit both count (xpByDay floor above the edited value)', () => {
  const cloud = adminEdit(synced, { totalXp: 100 }, T);
  const phone = { ...JSON.parse(JSON.stringify(cloud)), totalXp: 110, xpByDay: { ...cloud.xpByDay, '2026-11-05': 10 } };
  const laptop = { ...JSON.parse(JSON.stringify(cloud)), totalXp: 130, xpByDay: { ...cloud.xpByDay, '2026-11-06': 30 } };
  assert.equal(mergeStates(phone, laptop).totalXp, 140);
});

test('admin edit: a later edit wins over an earlier one, and a copy with only the first is rebased onto the second', () => {
  const first = adminEdit(synced, { totalXp: 100 }, T);
  const second = adminEdit(first, { totalXp: 50 }, T + 1);
  const onFirst = { ...JSON.parse(JSON.stringify(first)), totalXp: 104 };   // played 4 XP after the first edit
  // second.from is 100 (the value when the second edit was made), so 104 carries +4 over to 50
  assert.equal(second.adminEdits.fields.totalXp.from, 100);
  const m = mergeStates(onFirst, second);
  assert.equal(m.totalXp, 54);
  assert.equal(m.adminEdits.fields.totalXp.at, T + 1);
});

test('admin edit: raising works like any other value', () => {
  const cloud = adminEdit(synced, { gems: 900 }, T);
  assert.equal(mergeStates(synced, cloud).gems, 900);
});

test('admin node edit: marked undone sticks; a replay on an offline device brings it back on top', () => {
  const cloud = adminEdit(synced, { nodes: { 'basics:lesson:a': null, 'basics:lesson:c': { done: true, crowns: 1 } } }, T);
  const m = mergeStates(synced, cloud);
  assert.equal(m.nodes['basics:lesson:a'], undefined);
  assert.deepEqual(m.nodes['basics:lesson:c'], { done: true, crowns: 1, best: 0 });
  assert.deepEqual(m.nodes['basics:lesson:b'], synced.nodes['basics:lesson:b']);
  // offline device replayed lesson a once more (crowns 2 -> 3) before it heard of the edit
  const offline = JSON.parse(JSON.stringify(synced));
  offline.nodes['basics:lesson:a'] = { done: true, crowns: 3, best: 0.95 };
  const m2 = mergeStates(cloud, offline);
  assert.deepEqual(m2.nodes['basics:lesson:a'], { done: true, crowns: 1, best: 0.95 });
  assert.ok(sameState(m2, mergeStates(offline, cloud)));
});

test('admin node edit: crowns lowered', () => {
  const cloud = adminEdit(synced, { nodes: { 'basics:lesson:a': { done: true, crowns: 1 } } }, T);
  assert.deepEqual(mergeStates(synced, cloud).nodes['basics:lesson:a'], { done: true, crowns: 1, best: 0.9 });
});

test('admin course reset: a copy from before it loses its course progress, not the rest', () => {
  const cloud = adminEdit(synced, { resetCourse: 'git' }, T);
  const offline = JSON.parse(JSON.stringify(synced));
  offline.nodes['basics:lesson:z'] = { done: true, crowns: 1, best: 1 };
  for (const m of [mergeStates(offline, cloud), mergeStates(cloud, offline)]) {
    assert.deepEqual(m.nodes, {});
    assert.deepEqual(m.challenges, {});
    assert.deepEqual(m.mistakes, {});
    assert.deepEqual(m.courses.git.cards, {});
    assert.equal(m.totalXp, 500);                    // XP, cherries and streak are not the course's
    assert.equal(m.gems, 300);
  }
  // after the reset, new lessons count again, and a node edit made after the reset applies
  const after = adminEdit(cloud, { nodes: { 'basics:lesson:a': { done: true, crowns: 1 } } }, T + 5);
  const m = mergeStates(synced, after);
  assert.deepEqual(Object.keys(m.nodes), ['basics:lesson:a']);
  const replay = { ...JSON.parse(JSON.stringify(after)) };
  replay.nodes['basics:lesson:b'] = { done: true, crowns: 1, best: 1 };
  assert.ok(mergeStates(replay, after).nodes['basics:lesson:b'].done);
});

test('admin edits: a node edit from before a course reset is void', () => {
  const nodeEdit = adminEdit(synced, { nodes: { 'basics:lesson:b': null } }, T);
  const reset = adminEdit(nodeEdit, { resetCourse: 'git' }, T + 1);
  const m = mergeStates(nodeEdit, reset);
  assert.deepEqual(m.adminEdits.nodes, {});
  assert.deepEqual(m.nodes, {});
});

test('admin edits: idempotent and commutative', () => {
  const cloud = adminEdit(synced, { totalXp: 100, gems: 5, 'streak.count': 1, nodes: { 'basics:lesson:a': null } }, T);
  const offline = { ...act(synced, 'phone', { earn: 7 }), totalXp: 520, xpByDay: { ...synced.xpByDay, '2026-11-03': 20 } };
  assert.deepEqual(mergeStates(cloud, cloud), cloud);
  const m = mergeStates(offline, cloud);
  assert.deepEqual(mergeStates(m, m), m);
  assert.deepEqual(mergeStates(m, cloud), m);
  assert.deepEqual(mergeStates(m, offline), m);
  assert.ok(sameState(mergeStates(offline, cloud), mergeStates(cloud, offline)));
});

test('admin edits ride along with a "reset everywhere"', () => {
  const cloud = adminEdit(synced, { totalXp: 100 }, T);
  const reset = { ...freshState(), resetAt: 20_000, savedAt: 20_000 };
  assert.ok(sameState(mergeStates(cloud, reset), reset));
});

/* ---------------------------------------------------------------- wallet ledger */
// Cherries (gems) and stashes (streak.freezes) are a per-device ledger (js/wallet.js), so a spend on one
// device can't be undone by the other device's copy, the way max(gems) used to undo it.
const legacy = (gems, freezes = 0) => repairState({ v: 2, onboarded: true, gems, streak: { count: 3, best: 3, lastDay: '2026-11-07', freezes } });

test('wallet: the reported bug. Both at 110, the phone buys two stashes, sync in either order: 10 cherries, 2 more stashes', () => {
  const laptop = legacy(110), phoneStart = legacy(110);
  assert.equal(laptop.gems, 110);
  assert.deepEqual(laptop.wallet.gems, { base: 110, earn: {}, spend: {} });
  // two stash buys on the phone: -50 cherries, +1 stash, twice
  const phone = act(act(phoneStart, 'phone', { spend: 50, stashes: 1 }), 'phone', { spend: 50, stashes: 1 });
  assert.equal(phone.gems, 10);
  assert.equal(phone.streak.freezes, 2);
  // phone pushes first (cloud = laptop's copy), then the laptop pulls; and the other way round
  const cloud1 = mergeStates(phone, laptop), laptop1 = mergeStates(laptop, cloud1);
  const cloud2 = mergeStates(laptop, phone), phone2 = mergeStates(phone, cloud2);
  for (const s of [cloud1, laptop1, cloud2, phone2, mergeStates(laptop1, phone2)]) {
    assert.equal(s.gems, 10);
    assert.equal(s.streak.freezes, 2);
  }
  // the laptop's stale copy merged again (an old push, a retry) changes nothing
  assert.deepEqual(mergeStates(laptop1, laptop), laptop1);
  assert.deepEqual(mergeStates(laptop, laptop1), laptop1);
});

test('wallet: earning on both devices counts both; spending on both counts both', () => {
  const start = legacy(100);
  const a = act(start, 'phone', { earn: 15, spend: 50 }), b = act(start, 'laptop', { earn: 5, spend: 30 });
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) assert.equal(m.gems, 100 + 15 + 5 - 50 - 30);
  // spending the same cherries twice offline leaves a debt: shown as 0, and later earnings pay it first
  const c = act(start, 'phone', { spend: 80 }), d = act(start, 'laptop', { spend: 60 });
  const m = mergeStates(c, d);
  assert.equal(m.gems, 0);
  assert.equal(act(m, 'phone', { earn: 30 }).gems, 0);
  assert.equal(act(m, 'phone', { earn: 50 }).gems, 10);
});

test('wallet: a stash used on one device while the other was offline stays used', () => {
  const start = legacy(0, 1);
  const laptop = act(start, 'laptop', { popDays: ['2026-11-08'] });
  laptop.streak = { ...laptop.streak, lastDay: '2026-11-09', frozen: ['2026-11-08'] };
  assert.equal(laptop.streak.freezes, 0);
  const phoneOffline = J(start);   // still thinks it holds one
  for (const m of [mergeStates(laptop, phoneOffline), mergeStates(phoneOffline, laptop)]) {
    assert.equal(m.streak.freezes, 0);
    assert.deepEqual(m.streak.frozen, ['2026-11-08']);
  }
});

test('wallet: two devices popping a stash for the same missed day use one stash, not two', () => {
  const start = legacy(0, 2);
  const a = act(start, 'phone', { popDays: ['2026-11-08'] }), b = act(start, 'laptop', { popDays: ['2026-11-08'] });
  assert.equal(mergeStates(a, b).streak.freezes, 1);
});

test('wallet: a stash popped for a day that was played on another device is handed back', () => {
  const start = legacy(0, 1);
  // the phone played on 11-08; the laptop opened later with its stale copy and popped a stash for 11-08
  const phone = { ...J(start), goalDays: { '2026-11-08': true } };
  const laptop = act(start, 'laptop', { popDays: ['2026-11-08'] });
  assert.equal(laptop.streak.freezes, 0);
  for (const m of [mergeStates(phone, laptop), mergeStates(laptop, phone)]) assert.equal(m.streak.freezes, 1);
});

test('wallet: merging is idempotent, commutative and associative across three devices', () => {
  const start = legacy(200, 1);
  const a = act(start, 'a', { earn: 10, spend: 50, stashes: 1 }), b = act(start, 'b', { earn: 3, popDays: ['2026-11-08'] }), c = act(start, 'c', { spend: 20 });
  const l = mergeStates(mergeStates(a, b), c), r = mergeStates(a, mergeStates(b, c)), x = mergeStates(mergeStates(c, a), b);
  assert.deepEqual(l.wallet, r.wallet);
  assert.deepEqual(l.wallet, x.wallet);
  assert.equal(l.gems, 200 + 10 + 3 - 50 - 20);
  assert.equal(l.streak.freezes, 1 + 1 - 1);
  assert.deepEqual(mergeStates(l, l), l);
  assert.deepEqual(mergeStates(l, a), l);
});

test('wallet: a save without a ledger keeps its cherries and stashes (migration), and repair leaves a ledger alone', () => {
  const s = repairState({ v: 2, gems: 77, streak: { freezes: 2 } });
  assert.equal(s.gems, 77);
  assert.equal(s.streak.freezes, 2);
  assert.deepEqual(s.wallet, { gems: { base: 77, earn: {}, spend: {} }, freezes: { base: 2, earn: {}, spend: {} } });
  const later = act(s, 'phone', { spend: 50 });
  assert.deepEqual(repairState(later), later);
  // a stale plain number (e.g. written by an old app version) never overrides the ledger
  assert.equal(repairState({ ...later, gems: 500 }).gems, 27);
  assert.equal(freshState().gems, 20);
  assert.equal(repairState({ v: 2, onboarded: true }).gems, 20);   // a save missing gems gets the default
});

test('admin wallet edit: the edited value wins; earning and spending the admin never saw land on top once', () => {
  // the cloud: base 300, the phone has earned 50 and the laptop spent 30 so far (balance 320)
  const cloudBefore = act(act(legacy(300), 'phone', { earn: 50 }), 'laptop', { spend: 30 });
  assert.equal(cloudBefore.gems, 320);
  const cloud = adminEdit(cloudBefore, { gems: 100 }, T);
  assert.equal(cloud.gems, 100);
  assert.deepEqual(cloud.adminEdits.fields.gems, { at: T, to: 100, from: 320, base: 80 });
  // the phone was offline: earned 7 more and spent 50 more, on top of what the cloud had seen
  const phone = act(cloudBefore, 'phone', { earn: 7, spend: 50 });
  // and the laptop synced the edit, then spent 20
  const laptop = act(mergeStates(cloudBefore, cloud), 'laptop', { spend: 20 });
  assert.equal(laptop.gems, 80);
  const want = 100 + 7 - 50 - 20;
  const phoneSynced = mergeStates(phone, cloud);               // the phone rebases onto the edit
  assert.equal(phoneSynced.gems, 100 + 7 - 50);
  for (const m of [mergeStates(phoneSynced, laptop), mergeStates(laptop, phoneSynced), mergeStates(phone, laptop), mergeStates(laptop, phone),
    mergeStates(mergeStates(phone, cloud), mergeStates(laptop, cloud))]) assert.equal(m.gems, want);
  // stale pre-edit copies can't lift it back up, and nothing doubles on repeat merges
  const m = mergeStates(phoneSynced, laptop);
  assert.equal(mergeStates(m, cloudBefore).gems, want);
  assert.equal(mergeStates(mergeStates(m, phone), cloud).gems, want);
  assert.deepEqual(mergeStates(m, m), m);
});

test('admin wallet edit: stashes set to 0 while another device used one and bought one offline: 0', () => {
  const start = legacy(200, 2);
  const cloud = adminEdit(start, { 'streak.freezes': 0 }, T);
  const offline = act(act(start, 'phone', { popDays: ['2026-11-08'] }), 'phone', { spend: 50, stashes: 1 });   // used one, bought one: still 2
  assert.equal(offline.streak.freezes, 2);
  for (const m of [mergeStates(offline, cloud), mergeStates(cloud, offline)]) {
    assert.equal(m.streak.freezes, 0);   // 0, then +1 bought and -1 used, both unseen by the admin
    assert.equal(m.gems, 150);
  }
  const bought = act(start, 'phone', { spend: 50, stashes: 1 });   // only bought one (now holds 3)
  assert.equal(mergeStates(bought, cloud).streak.freezes, 1);
});

test('admin wallet edit: a later edit replaces an earlier one; a copy with only the first takes the second', () => {
  const start = legacy(300);
  const first = adminEdit(start, { gems: 100 }, T);
  const onFirst = act(mergeStates(start, first), 'phone', { earn: 4 });
  const second = adminEdit(mergeStates(onFirst, first), { gems: 50 }, T + 1);
  assert.equal(second.adminEdits.fields.gems.from, 104);
  const offline = act(onFirst, 'phone', { earn: 6 });         // 6 more the second edit never saw
  for (const m of [mergeStates(offline, second), mergeStates(second, offline), mergeStates(mergeStates(offline, first), second)]) assert.equal(m.gems, 56);
});

test('admin wallet edit from before the ledger (no base) still applies to a ledger copy', () => {
  const start = legacy(300);
  const old = J(start);
  old.gems = 5;
  delete old.wallet;   // the old SQL wrote only the plain number
  old.adminEdits = { fields: { gems: { at: T, to: 5, from: 300 } }, nodes: {}, courses: {} };
  const phone = act(start, 'phone', { earn: 7, spend: 2 });   // 305 locally, never saw the edit
  for (const m of [mergeStates(phone, old), mergeStates(old, phone)]) assert.equal(m.gems, 10);
  const m = mergeStates(phone, old);
  assert.deepEqual(mergeStates(m, m), m);
  assert.equal(mergeStates(m, phone).gems, 10);
});
