// Check helpers for the bash course (js/content/shell-helpers.js).
// Run: node --test tests/shell-helpers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShell } from '../js/shell.js';
import * as H from '../js/content/shell-helpers.js';

const make = () => buildShell({
  files: { 'notes/todo.txt': 'buy milk\ncall mum', 'run.sh': { content: '#!/bin/bash\necho hi', mode: 0o755 }, 'empty/': null },
  procs: [{ cmd: 'sleep 999', cpu: 1 }],
});

test('exists / isDir / isFile resolve relative to home, wherever the learner is', () => {
  const sh = make();
  sh.run('cd /tmp');
  assert.ok(H.exists(sh, 'notes/todo.txt'));
  assert.ok(H.exists(sh, '~/notes'));
  assert.ok(H.exists(sh, '/home/you/run.sh'));
  assert.ok(H.isDir(sh, 'notes') && !H.isDir(sh, 'run.sh'));
  assert.ok(H.isFile(sh, 'run.sh') && !H.isFile(sh, 'notes'));
  assert.ok(H.isDir(sh, 'empty'));
  assert.ok(!H.exists(sh, 'nope'));
});
test('fileIs ignores trailing whitespace and the final newline; fileHas / fileLines', () => {
  const sh = make();
  assert.ok(H.fileIs(sh, 'notes/todo.txt', 'buy milk\ncall mum'));
  assert.ok(H.fileIs(sh, 'notes/todo.txt', ['buy milk', 'call mum']));
  sh.run('echo "call mum   " > x.txt; echo >> x.txt');
  assert.ok(H.fileIs(sh, 'x.txt', 'call mum'));
  assert.ok(!H.fileIs(sh, 'notes/todo.txt', 'buy milk'));
  assert.ok(!H.fileIs(sh, 'missing', ''));
  assert.ok(H.fileHas(sh, 'notes/todo.txt', 'milk'));
  assert.ok(H.fileHas(sh, 'notes/todo.txt', /^call/m));
  assert.deepEqual(H.fileLines(sh, 'notes/todo.txt'), ['buy milk', 'call mum']);
  assert.equal(H.fileText(sh, 'notes'), undefined);
});
test('cwdIs, listOf, filesUnder', () => {
  const sh = make();
  sh.run('mkdir -p projects/site && cd projects/site');
  assert.ok(H.cwdIs(sh, 'projects/site'));
  assert.ok(H.cwdIs(sh, '~/projects/site'));
  assert.ok(!H.cwdIs(sh, '~'));
  assert.deepEqual(H.listOf(sh, '~'), ['empty', 'notes', 'projects', 'run.sh']);
  assert.deepEqual(H.listOf(sh, 'nope'), []);
  sh.run('touch index.html');
  assert.deepEqual(H.filesUnder(sh, 'projects'), ['site/index.html']);
});
test('lastOut / lastOutIs / lastOutHas / lastErr / lastCode see only the last command line', () => {
  const sh = make();
  sh.run('cat notes/todo.txt');
  assert.equal(H.lastOut(sh), 'buy milk\ncall mum');
  assert.ok(H.lastOutIs(sh, ['buy milk', 'call mum']));
  assert.ok(H.lastOutHas(sh, 'milk'));
  sh.run('grep -c buy notes/todo.txt');
  assert.ok(H.lastOutIs(sh, '1'));
  sh.run('cat nope');
  assert.equal(H.lastOut(sh), '');
  assert.match(H.lastErr(sh), /No such file/);
  assert.equal(H.lastCode(sh), 1);
  sh.run('ls > list.txt');
  assert.equal(H.lastOut(sh), '', 'redirected output is not on the screen');
});
test('modeHas: letters, who, minus, octal; isExecutable', () => {
  const sh = make();
  assert.ok(H.modeHas(sh, 'run.sh', 'x'));
  assert.ok(H.modeHas(sh, 'run.sh', 'u+rwx'));
  assert.ok(H.modeHas(sh, 'run.sh', 'go+rx'));
  assert.ok(H.modeHas(sh, 'run.sh', 'go-w'));
  assert.ok(H.modeHas(sh, 'run.sh', 0o755));
  assert.ok(!H.modeHas(sh, 'notes/todo.txt', 'x'));
  assert.ok(H.isExecutable(sh, 'run.sh'));
  sh.run('chmod 600 notes/todo.txt');
  assert.ok(H.modeHas(sh, 'notes/todo.txt', 'o-r'));
  assert.ok(H.modeHas(sh, 'notes/todo.txt', 'a-x'));
  assert.ok(!H.modeHas(sh, 'missing', 'r'));
  assert.equal(H.modeOf(sh, 'notes/todo.txt'), 0o600);
  assert.throws(() => H.modeHas(sh, 'run.sh', 'bad!'));
});
test('variables, exports, aliases, functions, history, processes', () => {
  const sh = make();
  sh.run('city=Pune; export LANGUAGE=en; alias ll="ls -l"; greet() { echo hi; }');
  assert.ok(H.varIs(sh, 'city', 'Pune'));
  assert.ok(!H.isExported(sh, 'city'));
  assert.ok(H.isExported(sh, 'LANGUAGE'));
  assert.ok(H.aliasIs(sh, 'll', 'ls -l'));
  assert.ok(H.hasFunction(sh, 'greet'));
  assert.ok(H.ran(sh, /^city=/));
  const pid = sh.s.procs[0].pid;
  assert.ok(!H.procGone(sh, pid));
  sh.run(`kill ${pid}`);
  assert.ok(H.procGone(sh, pid));
});
test('a whole exercise: setup, a free-form solution, a state check', () => {
  // "Move every .log file into a new logs folder" accepts any route.
  const setup = () => buildShell({ files: { 'a.log': '1', 'b.log': '2', 'keep.txt': 'k' } });
  const check = (sh) => H.isDir(sh, 'logs') && H.filesUnder(sh, 'logs').join() === 'a.log,b.log' && !H.exists(sh, 'a.log') && H.exists(sh, 'keep.txt');
  for (const route of [['mkdir logs', 'mv *.log logs'], ['mkdir logs && mv a.log b.log logs/'], ['mkdir logs; for f in *.log; do mv "$f" logs; done'], ['mkdir logs', 'find . -maxdepth 1 -name "*.log" -exec mv {} logs \\;']]) {
    const sh = setup();
    assert.ok(!check(sh));
    for (const line of route) sh.run(line);
    assert.ok(check(sh), route.join(' / '));
  }
});
