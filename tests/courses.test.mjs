// Settings and courses (.notes/settings-and-course-switcher.md): "Unlock all levels" node status, course
// switching keeps every course's progress apart, the registry shape, the per-course reward words, and the
// merge of the new setting and of a second course's progress. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/ui/game.js';
import { useUnits, nodes, nodeStatus, currentNode, crateEarned } from '../js/ui/path.js';
import { COURSES, courseById, isPlayable, playableId } from '../js/courses.js';
import { REWARDS, REWARD_SETS, useRewards, say } from '../js/brand.js';
import { mergeStates } from '../js/cloud/merge.js';
import { freshState, repairState } from '../js/storage.js';

// A small course: 2 units of 4 lessons (a crate after every two), each with a review. No challenges.
const ex = (id) => ({ id, type: 'choice', prompt: 'q', options: ['a', 'b'], answer: 0 });
const unit = (id) => ({ id, title: id, color: 'sky', lessons: [1, 2, 3, 4].map((i) => ({ id: `${id}-${i}`, title: `${id} ${i}`, exercises: [ex(`${id}-${i}-e`)] })) });
const UNITS = [unit('u1'), unit('u2')];
const byId = (id) => nodes().find((n) => n.id === id);
const status = () => Object.fromEntries(nodes().map((n) => [n.id, nodeStatus(n)]));

function fresh(course = 'git') {
  for (const k of Object.keys(game.G)) delete game.G[k];
  Object.assign(game.G, repairState(freshState()));
  game.G.course = course;
  useUnits(UNITS, course);
}

test('the path order of the test course', () => {
  fresh();
  assert.deepEqual(nodes().map((n) => n.id), [
    'u1:lesson:u1-1', 'u1:lesson:u1-2', 'u1:chest:0', 'u1:lesson:u1-3', 'u1:lesson:u1-4', 'u1:chest:1', 'u1:review',
    'u2:lesson:u2-1', 'u2:lesson:u2-2', 'u2:chest:0', 'u2:lesson:u2-3', 'u2:lesson:u2-4', 'u2:chest:1', 'u2:review']);
});

test('without unlock-all everything after the current node is locked', () => {
  fresh();
  const s = status();
  assert.equal(s['u1:lesson:u1-1'], 'current');
  for (const id of Object.keys(s).slice(1)) assert.equal(s[id], 'locked', id);
});

test('unlock-all opens every lesson and review, but a crate only once its own lessons are done', () => {
  fresh();
  game.G.unlockAll = true;
  const s = status();
  assert.equal(s['u1:lesson:u1-1'], 'current');
  for (const id of ['u1:lesson:u1-2', 'u1:lesson:u1-3', 'u1:review', 'u2:lesson:u2-1', 'u2:lesson:u2-4', 'u2:review']) assert.equal(s[id], 'open', id);
  for (const id of ['u1:chest:0', 'u1:chest:1', 'u2:chest:0', 'u2:chest:1']) assert.equal(s[id], 'locked', id);
  // finish the two lessons before u2's first crate, out of order: that crate opens, nothing is marked done
  game.completeNode('u2:lesson:u2-1'); game.completeNode('u2:lesson:u2-2');
  assert.ok(crateEarned(byId('u2:chest:0')));
  assert.equal(nodeStatus(byId('u2:chest:0')), 'open');
  assert.equal(nodeStatus(byId('u2:chest:1')), 'locked');
  assert.equal(nodeStatus(byId('u2:lesson:u2-1')), 'done');
  assert.deepEqual(Object.keys(game.G.nodes).sort(), ['u2:lesson:u2-1', 'u2:lesson:u2-2']);
});

test('the START node stays the next unfinished node in order', () => {
  fresh();
  game.G.unlockAll = true;
  game.completeNode('u2:lesson:u2-3');
  assert.equal(currentNode().id, 'u1:lesson:u1-1');
  game.completeNode('u1:lesson:u1-1');
  assert.equal(currentNode().id, 'u1:lesson:u1-2');
});

test('turning unlock-all off restores the locks and keeps progress made meanwhile', () => {
  fresh();
  game.setUnlockAll(true);
  game.completeNode('u2:lesson:u2-1');
  game.completeNode('u2:lesson:u2-1');   // a replay: a second crown
  game.setUnlockAll(false);
  assert.equal(game.G.unlockAll, false);
  assert.equal(nodeStatus(byId('u2:lesson:u2-1')), 'done');
  assert.equal(game.G.nodes['u2:lesson:u2-1'].crowns, 2);
  assert.equal(nodeStatus(byId('u2:lesson:u2-2')), 'locked');
  assert.equal(nodeStatus(byId('u1:lesson:u1-2')), 'locked');
});

test('skipped units stay skipped (and playable) with or without unlock-all', () => {
  fresh();
  game.G.placement = 1;
  assert.equal(nodeStatus(byId('u1:lesson:u1-3')), 'skipped');
  assert.equal(currentNode().id, 'u2:lesson:u2-1');
  game.G.unlockAll = true;
  assert.equal(nodeStatus(byId('u1:lesson:u1-3')), 'skipped');
});

test('switching course keeps each course\'s progress separate; git stays at the top level', () => {
  fresh('git');
  game.completeNode('u1:lesson:u1-1');
  game.recordMistake('u1-1-e');
  assert.ok(game.G.nodes['u1:lesson:u1-1'].done);
  assert.equal(game.setCourse('bash'), true);
  useUnits(UNITS, 'bash');
  assert.equal(game.courseId(), 'bash');
  // a fresh start in the new course: nothing done, no mistakes
  assert.equal(currentNode().id, 'u1:lesson:u1-1');
  assert.equal(game.mistakeCount(), 0);
  game.completeNode('u1:lesson:u1-2');
  game.recordMistake('bash-ex');
  assert.deepEqual(Object.keys(game.G.courses.bash.nodes), ['u1:lesson:u1-2']);
  assert.deepEqual(Object.keys(game.G.courses.bash.mistakes), ['bash-ex']);
  assert.equal(game.G.courses.bash.placement, 0);
  // git's copy is untouched and still at the top level; the git course entry gains no path fields
  assert.deepEqual(Object.keys(game.G.nodes), ['u1:lesson:u1-1']);
  assert.deepEqual(Object.keys(game.G.mistakes), ['u1-1-e']);
  assert.equal('nodes' in game.G.courses.git, false);
  assert.equal(game.lessonsDone('git'), 1);
  assert.equal(game.lessonsDone('bash'), 1);
  // and back
  game.setCourse('git');
  useUnits(UNITS, 'git');
  assert.equal(nodeStatus(byId('u1:lesson:u1-1')), 'done');
  assert.equal(nodeStatus(byId('u1:lesson:u1-2')), 'current');
  assert.equal(game.setCourse('git'), false, 'already active: no-op');
});

test('challenges always count for the git course', () => {
  fresh('bash');
  game.completeChallenge('first-commit', 2);
  assert.equal(game.G.challenges['first-commit'].stars, 2);
  assert.equal(game.courseProgress('bash').challenges['first-commit'], undefined);
});

test('the course registry: git playable, bash listed as coming soon', () => {
  assert.ok(COURSES.length >= 2);
  for (const c of COURSES) for (const k of ['id', 'title', 'short', 'blurb', 'icon', 'accent']) assert.ok(c[k], `${c.id}.${k}`);
  assert.equal(new Set(COURSES.map((c) => c.id)).size, COURSES.length);
  assert.ok(isPlayable(courseById('git')));
  const bash = courseById('bash');
  assert.equal(bash.title, 'Linux CLI & bash');
  assert.equal(bash.comingSoon, true);
  assert.equal(isPlayable(bash), false);
  assert.equal(playableId('bash'), 'git');
  assert.equal(playableId('nope'), 'git');
});

test('reward words: git keeps its flavour, other courses get the neutral set', () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(REWARD_SETS.git), keys(REWARD_SETS.neutral));
  useRewards('git');
  assert.equal(REWARDS.currency.many, 'cherries');
  assert.equal(REWARDS.freeze.one, 'stash');
  assert.equal(REWARDS.lessonDone, 'Merged into main!');
  assert.equal(REWARDS.boost.name, 'Fast-forward');
  assert.equal(say('{Finish} 2 lessons'), 'Merge 2 lessons');
  useRewards('bash');
  assert.equal(REWARDS.currency.many, 'coins');
  assert.equal(REWARDS.freeze.many, 'streak shields');
  assert.equal(REWARDS.lessonDone, 'Lesson complete!');
  assert.equal(REWARDS.crate.tagged, false);
  assert.equal(say('{Finish} 2 lessons'), 'Finish 2 lessons');
  assert.doesNotMatch(JSON.stringify(Object.values(REWARD_SETS.neutral), (k, v) => (typeof v === 'function' ? String(v) : v)), /cherr|stash|commit|merge|git /i);
  useRewards('git');
});

/* ------------------------------------------------------------------ merge */
const save = (patch) => ({ ...repairState(freshState()), onboarded: true, ...patch });

test('merge: unlockAll comes from the newer save, like the other settings', () => {
  const a = save({ unlockAll: true, savedAt: 2000 }), b = save({ unlockAll: false, savedAt: 1000 });
  assert.equal(mergeStates(a, b).unlockAll, true);
  assert.equal(mergeStates(b, a).unlockAll, true);
  const c = save({ unlockAll: false, savedAt: 3000 });
  assert.equal(mergeStates(a, c).unlockAll, false);
  assert.equal(mergeStates(c, a).unlockAll, false);
});

test('merge: a second course\'s progress merges by the same rules as git\'s; course from the newer save', () => {
  const a = save({ savedAt: 1000, course: 'bash', courses: { git: { cards: {}, seenCards: {} }, bash: { cards: {}, seenCards: {}, placement: 1,
    nodes: { 'x:lesson:a': { done: true, crowns: 2, best: 0.8 } }, challenges: {}, mistakes: { k: { box: 1, due: 50, misses: 1 } } } } });
  const b = save({ savedAt: 2000, course: 'git', courses: { git: { cards: {}, seenCards: {} }, bash: { cards: {}, seenCards: {}, placement: 2,
    nodes: { 'x:lesson:a': { done: true, crowns: 1, best: 0.9 }, 'x:lesson:b': { done: true, crowns: 1, best: 1 } }, challenges: {}, mistakes: { k: { box: 2, due: 90, misses: 1 } } } } });
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    assert.equal(m.course, 'git');
    const bash = m.courses.bash;
    assert.deepEqual(bash.nodes['x:lesson:a'], { done: true, crowns: 2, best: 0.9 });
    assert.ok(bash.nodes['x:lesson:b'].done);
    assert.equal(bash.mistakes.k.due, 90);
    assert.equal(bash.placement, 2, 'placement from the newer save');
    assert.deepEqual(m.nodes, {}, 'git progress untouched');
  }
});
