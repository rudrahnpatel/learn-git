// The simulated bash shell (js/shell.js): parser, expansion, filesystem, commands, scripts, jobs.
// Run: node --test tests/shell.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Shell, buildShell, START_TIME, LIMITS } from '../js/shell.js';
import { parse, lex } from '../js/shell/parse.js';
import { applyMode } from '../js/shell/commands.js';
import { printf } from '../js/shell/util.js';

// A small home folder most tests start from.
function fresh(extra = {}) {
  return buildShell({
    files: {
      'notes/todo.txt': 'buy milk\ncall mum\nbuy bread',
      'notes/done.txt': 'laundry',
      'a.txt': 'hello',
      'b.log': 'one\ntwo',
      '.secret': 'hidden',
      ...extra,
    },
  });
}
// run a line, expect a status (default 0), return stdout
function out(sh, line, code = 0) {
  const r = sh.run(line);
  assert.equal(r.code, code, `"${line}" exited ${r.code}, expected ${code}:\n${r.lines.map((l) => `[${l.c}] ${l.t}`).join('\n')}`);
  return sh.lastOut;
}
const err = (sh, line, code) => { const r = sh.run(line); if (code !== undefined) assert.equal(r.code, code, `"${line}" exited ${r.code}`); return sh.lastErr; };
const file = (sh, p) => sh.readFile(p);

/* ================================================================== parser */
test('parser: lists, and-or, pipes, compound commands', () => {
  const ast = parse('a | b && c || d; e &');
  assert.equal(ast.items.length, 2);
  assert.equal(ast.items[0].node.type, 'andor');
  assert.equal(ast.items[0].node.first.type, 'pipe');
  assert.equal(ast.items[1].bg, true);
  assert.equal(parse('if a; then b; elif c; then d; else e; fi').items[0].node.clauses.length, 2);
  assert.equal(parse('for x in 1 2; do echo $x; done').items[0].node.items.length, 2);
  assert.equal(parse('while true\ndo\n  break\ndone').items[0].node.type, 'while');
  assert.equal(parse('f() { echo hi; }').items[0].node.type, 'func');
  assert.equal(parse('function g { echo hi; }').items[0].node.name, 'g');
  assert.equal(parse('(cd /tmp; ls)').items[0].node.type, 'subshell');
  assert.equal(parse('# just a comment').items.length, 0);
});
test('parser: redirections with fd numbers and dups', () => {
  const r = parse('cmd 2>&1 >out.txt 2>>err <in &>all').items[0].node.redirs;
  assert.deepEqual(r.map((x) => [x.op, x.fd, x.dup ?? null]), [['>&', 2, '1'], ['>', 1, null], ['>>', 2, null], ['<', 0, null], ['&>', 1, null]]);
  assert.equal(parse('echo a2>f').items[0].node.words.length, 2, 'a2 is a word, > f a redirect');
});
test('parser: quoting keeps parts apart', () => {
  const w = lex(`'a $b' "c $d" e\\ f`).filter((t) => t.t === 'word');
  assert.equal(w.length, 3);
  assert.deepEqual(w[0].parts, [{ k: 'lit', v: 'a $b', q: 1 }]);
  assert.equal(w[1].parts[1].k, 'var');
  assert.equal(w[2].parts.map((p) => p.v).join(''), 'e f');
});
test('parser: syntax errors carry a message and exit 2', () => {
  const sh = fresh();
  assert.match(err(sh, 'if then', 2), /syntax error near unexpected token `then'/);
  assert.match(err(sh, 'echo "open', 2), /unexpected EOF while looking for matching `"'/);
  assert.match(err(sh, 'for x in a; do echo', 2), /unexpected end of file/);
  assert.match(err(sh, '| ls', 2), /unexpected token `\|'/);
  assert.match(err(sh, 'case a in a) ;; esac', 2), /not supported/);
  assert.match(err(sh, '(( i++ ))', 2), /not supported in this sandbox/);
  assert.equal(out(sh, '( (echo nested) )'), 'nested\n', 'nested subshells need the space, as in bash');
  const r = sh.run('[[ -f a.txt ]]');
  assert.equal(r.code, 127);
  assert.ok(r.lines.some((l) => l.c === 'hint' && /use \[ \]/.test(l.t)));
});

/* ================================================================== paths and navigation */
test('pwd, cd, ~, ., .., cd -', () => {
  const sh = fresh();
  assert.equal(out(sh, 'pwd'), '/home/you\n');
  out(sh, 'cd notes');
  assert.equal(sh.s.cwd, '/home/you/notes');
  assert.equal(out(sh, 'pwd'), '/home/you/notes\n');
  out(sh, 'cd ..');
  assert.equal(sh.s.cwd, '/home/you');
  out(sh, 'cd /tmp');
  assert.equal(out(sh, 'cd -'), '/home/you\n');
  out(sh, 'cd ./notes/../notes/.');
  assert.equal(sh.s.cwd, '/home/you/notes');
  out(sh, 'cd');
  assert.equal(sh.s.cwd, '/home/you');
  out(sh, 'cd ~/notes');
  assert.equal(sh.s.cwd, '/home/you/notes');
  out(sh, 'cd /');
  out(sh, 'cd ..');
  assert.equal(sh.s.cwd, '/', '.. of / is /');
  assert.equal(sh.getVar('OLDPWD'), '/');
});
test('cd errors', () => {
  const sh = fresh();
  assert.equal(err(sh, 'cd nowhere', 1), 'bash: cd: nowhere: No such file or directory\n');
  assert.equal(err(sh, 'cd a.txt', 1), 'bash: cd: a.txt: Not a directory\n');
  assert.equal(err(sh, 'cd a b', 1), 'bash: cd: too many arguments\n');
  out(sh, 'mkdir vault; chmod 000 vault');
  assert.equal(err(sh, 'cd vault', 1), 'bash: cd: vault: Permission denied\n');
  assert.equal(sh.s.cwd, '/home/you');
});
test('the prompt shows ~ for home', () => {
  const sh = fresh();
  assert.equal(sh.prompt(), 'you@learn:~$');
  out(sh, 'cd notes');
  assert.equal(sh.prompt(), 'you@learn:~/notes$');
  out(sh, 'cd /etc');
  assert.equal(sh.prompt(), 'you@learn:/etc$');
});

/* ================================================================== ls */
test('ls: columns on the terminal, one per line in a pipe, hidden files', () => {
  const sh = fresh();
  assert.equal(out(sh, 'ls'), 'a.txt  b.log  notes\n');
  assert.equal(out(sh, 'ls | cat'), 'a.txt\nb.log\nnotes\n');
  assert.equal(out(sh, 'ls -1'), 'a.txt\nb.log\nnotes\n');
  assert.equal(out(sh, 'ls -a'), '.  ..  .secret  a.txt  b.log  notes\n');
  assert.equal(out(sh, 'ls -A'), '.secret  a.txt  b.log  notes\n');
  assert.equal(out(sh, 'ls notes'), 'done.txt  todo.txt\n');
  assert.equal(out(sh, 'ls a.txt notes'), 'a.txt\n\nnotes:\ndone.txt  todo.txt\n');
  assert.equal(out(sh, 'ls -F'), 'a.txt  b.log  notes/\n');
  assert.equal(out(sh, 'ls -d notes'), 'notes\n');
  assert.equal(out(sh, 'ls | wc -l'), '3\n');
});
test('ls -l, -h, -t, -S, -r, -R', () => {
  const sh = fresh();
  const l = out(sh, 'ls -l').split('\n');
  assert.equal(l[0], 'total 12');
  assert.match(l[1], /^-rw-r--r-- 1 you you\s+6 Jan  5 09:00 a\.txt$/);
  assert.match(l[3], /^drwxr-xr-x 2 you you 4096 Jan  5 09:00 notes$/);
  assert.match(out(sh, 'ls -lh notes'), /4\.0K|28 /);
  out(sh, 'touch b.log');
  assert.equal(out(sh, 'ls -t | head -1'), 'b.log\n');
  assert.equal(out(sh, 'ls -S notes | head -1'), 'todo.txt\n');
  assert.equal(out(sh, 'ls -r'), 'notes  b.log  a.txt\n');
  assert.equal(out(sh, 'ls -R'), '.:\na.txt  b.log  notes\n\n./notes:\ndone.txt  todo.txt\n');
  assert.match(out(sh, 'ls -ld notes'), /^drwxr-xr-x 2 you you 4096 .* notes\n$/);
});
test('ls errors exit 2 but still list what exists', () => {
  const sh = fresh();
  const r = sh.run('ls nope a.txt');
  assert.equal(r.code, 2);
  assert.equal(sh.lastErr, "ls: cannot access 'nope': No such file or directory\n");
  assert.equal(sh.lastOut, 'a.txt\n');
  assert.match(err(sh, 'ls -z', 2), /invalid option -- 'z'/);
});

/* ================================================================== files and folders */
test('touch, mkdir -p, rmdir', () => {
  const sh = fresh();
  out(sh, 'touch new.txt');
  assert.equal(file(sh, 'new.txt'), '');
  assert.match(err(sh, 'touch no/such/file', 1), /touch: cannot touch 'no\/such\/file': No such file or directory/);
  assert.match(err(sh, 'mkdir a/b/c', 1), /mkdir: cannot create directory ‘a\/b\/c’: No such file or directory/);
  out(sh, 'mkdir -p a/b/c');
  assert.ok(sh.fs.isDir('/home/you/a/b/c'));
  out(sh, 'mkdir -p a/b/c');
  assert.match(err(sh, 'mkdir notes', 1), /File exists/);
  assert.equal(out(sh, 'mkdir -v x'), "mkdir: created directory 'x'\n");
  assert.match(err(sh, 'rmdir a', 1), /rmdir: failed to remove 'a': Directory not empty/);
  out(sh, 'rmdir a/b/c a/b a');
  assert.equal(sh.fs.exists('/home/you/a'), false);
  assert.match(err(sh, 'rmdir a.txt', 1), /Not a directory/);
});
test('cp: files, into folders, -r, errors', () => {
  const sh = fresh();
  out(sh, 'cp a.txt copy.txt');
  assert.equal(file(sh, 'copy.txt'), 'hello\n');
  out(sh, 'cp a.txt b.log notes');
  assert.equal(file(sh, 'notes/a.txt'), 'hello\n');
  assert.equal(file(sh, 'notes/b.log'), 'one\ntwo\n');
  assert.equal(err(sh, 'cp notes backup', 1), "cp: -r not specified; omitting directory 'notes'\n");
  out(sh, 'cp -r notes backup');
  assert.equal(file(sh, 'backup/todo.txt'), 'buy milk\ncall mum\nbuy bread\n');
  out(sh, 'cp -r notes backup');
  assert.ok(sh.fs.isDir('/home/you/backup/notes'), 'copying into an existing folder nests it');
  assert.match(err(sh, 'cp missing x', 1), /cp: cannot stat 'missing': No such file or directory/);
  assert.match(err(sh, 'cp a.txt a.txt', 1), /'a.txt' and 'a.txt' are the same file/);
  assert.match(err(sh, 'cp a.txt b.log nofolder', 1), /target 'nofolder' is not a directory/);
  assert.match(err(sh, 'cp a.txt', 1), /missing destination file operand after 'a.txt'/);
  assert.match(err(sh, 'cp -r notes notes/inner', 1), /cannot copy a directory, 'notes', into itself/);
  out(sh, 'echo old > keep.txt; cp -n a.txt keep.txt');
  assert.equal(file(sh, 'keep.txt'), 'old\n');
  assert.equal(out(sh, 'cp -v a.txt v.txt'), "'a.txt' -> 'v.txt'\n");
});
test('mv: rename, move into folder, overwrite, errors', () => {
  const sh = fresh();
  out(sh, 'mv a.txt hello.txt');
  assert.equal(file(sh, 'a.txt'), undefined);
  assert.equal(file(sh, 'hello.txt'), 'hello\n');
  out(sh, 'mv hello.txt notes/');
  assert.equal(file(sh, 'notes/hello.txt'), 'hello\n');
  out(sh, 'mv notes docs');
  assert.equal(file(sh, 'docs/todo.txt'), 'buy milk\ncall mum\nbuy bread\n');
  out(sh, 'echo new > b2; mv b2 b.log');
  assert.equal(file(sh, 'b.log'), 'new\n');
  assert.match(err(sh, 'mv nope x', 1), /mv: cannot stat 'nope': No such file or directory/);
  assert.match(err(sh, 'mv docs docs/sub', 1), /cannot move 'docs' to a subdirectory of itself, 'docs\/sub'/);
  assert.equal(out(sh, 'mv -v b.log c.log'), "renamed 'b.log' -> 'c.log'\n");
  out(sh, 'mkdir full empty; touch full/x; mkdir empty/full; touch empty/full/y');
  assert.match(err(sh, 'mv full empty', 1), /Directory not empty/);
});
test('rm: files, -r, -f, refusals and verbose', () => {
  const sh = fresh();
  out(sh, 'rm a.txt');
  assert.equal(sh.fs.exists('/home/you/a.txt'), false);
  assert.equal(err(sh, 'rm a.txt', 1), "rm: cannot remove 'a.txt': No such file or directory\n");
  out(sh, 'rm -f a.txt');
  assert.equal(err(sh, 'rm notes', 1), "rm: cannot remove 'notes': Is a directory\n");
  assert.equal(out(sh, 'rm -rv notes'), "removed 'notes/todo.txt'\nremoved 'notes/done.txt'\nremoved directory 'notes'\n");
  assert.equal(sh.fs.exists('/home/you/notes'), false);
  assert.match(err(sh, 'rm -r .', 1), /refusing to remove '.' or '..' directory/);
  assert.match(err(sh, 'rm -rf /', 1), /dangerous to operate recursively on '\/'/);
  assert.match(err(sh, 'rm', 1), /missing operand/);
  out(sh, 'mkdir e; rm -d e');
  assert.equal(sh.fs.exists('/home/you/e'), false);
  assert.match(err(sh, 'rm /etc/passwd', 1), /cannot remove '\/etc\/passwd': Permission denied/);
});
test('globs: * ? [abc] [!x] hidden files, no match stays literal', () => {
  const sh = fresh({ 'img1.png': '', 'img2.png': '', 'img10.png': '', 'doc.md': '' });
  assert.equal(out(sh, 'echo *.png'), 'img1.png img10.png img2.png\n');
  assert.equal(out(sh, 'echo img?.png'), 'img1.png img2.png\n');
  assert.equal(out(sh, 'echo img[12].png'), 'img1.png img2.png\n');
  assert.equal(out(sh, 'echo [!i]*'), 'a.txt b.log doc.md notes\n');
  assert.equal(out(sh, 'echo *'), 'a.txt b.log doc.md img1.png img10.png img2.png notes\n');
  assert.equal(out(sh, 'echo .s*'), '.secret\n');
  assert.equal(out(sh, 'echo notes/*.txt'), 'notes/done.txt notes/todo.txt\n');
  assert.equal(out(sh, 'echo */'), 'notes/\n');
  assert.equal(out(sh, 'echo *.xyz'), '*.xyz\n', 'no match: the pattern is passed on as typed');
  assert.equal(out(sh, 'echo "*.png" \'*\' \\*'), '*.png * *\n', 'quoted globs stay literal');
  assert.equal(out(sh, 'echo /etc/pass*'), '/etc/passwd\n');
  assert.equal(out(sh, 'cd notes; echo ../*.log'), '../b.log\n');
  out(sh, 'cd; rm *.png');
  assert.equal(out(sh, 'ls'), 'a.txt  b.log  doc.md  notes\n');
});
test('brace expansion', () => {
  const sh = fresh();
  assert.equal(out(sh, 'echo {a,b,c}'), 'a b c\n');
  assert.equal(out(sh, 'echo file{,.bak}'), 'file file.bak\n');
  assert.equal(out(sh, 'echo {1..5}'), '1 2 3 4 5\n');
  assert.equal(out(sh, 'echo {3..1} {a..c} {01..03}'), '3 2 1 a b c 01 02 03\n');
  assert.equal(out(sh, 'echo {x,y}{1,2}'), 'x1 x2 y1 y2\n');
  assert.equal(out(sh, 'echo "{a,b}" {single}'), '{a,b} {single}\n');
  out(sh, 'mkdir -p project/{src,docs,tests}');
  assert.deepEqual(sh.fs.names('/home/you/project'), ['docs', 'src', 'tests']);
});

/* ================================================================== reading files */
test('cat, cat -n, less, head, tail, wc', () => {
  const sh = fresh({ 'nums.txt': Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join('\n') });
  assert.equal(out(sh, 'cat a.txt b.log'), 'hello\none\ntwo\n');
  assert.equal(out(sh, 'cat -n b.log'), '     1\tone\n     2\ttwo\n');
  const r = sh.run('less a.txt');
  assert.equal(sh.lastOut, 'hello\n');
  assert.ok(r.lines.some((l) => l.c === 'hint'), 'less explains it is not paging');
  assert.equal(out(sh, 'head -n 2 nums.txt'), 'line 1\nline 2\n');
  assert.equal(out(sh, 'head -3 nums.txt | tail -1'), 'line 3\n');
  assert.equal(out(sh, 'head nums.txt | wc -l'), '10\n');
  assert.equal(out(sh, 'tail -n 2 nums.txt'), 'line 14\nline 15\n');
  assert.equal(out(sh, 'tail -n +14 nums.txt'), 'line 14\nline 15\n');
  assert.equal(out(sh, 'head -c 3 a.txt'), 'hel');
  assert.equal(out(sh, 'head -n 1 a.txt b.log'), '==> a.txt <==\nhello\n\n==> b.log <==\none\n');
  assert.equal(out(sh, 'wc notes/todo.txt'), ' 3  6 28 notes/todo.txt\n');
  assert.equal(out(sh, 'wc -l notes/todo.txt'), '3 notes/todo.txt\n');
  assert.equal(out(sh, 'wc -l < notes/todo.txt'), '3\n');
  assert.equal(out(sh, 'echo hi there | wc'), '      1       2       9\n');
  assert.equal(out(sh, 'wc -w a.txt b.log'), '1 a.txt\n2 b.log\n3 total\n');
  assert.equal(err(sh, 'cat nope', 1), 'cat: nope: No such file or directory\n');
  assert.equal(err(sh, 'cat notes', 1), 'cat: notes: Is a directory\n');
  assert.match(err(sh, 'head -n x a.txt', 1), /invalid number of lines: 'x'/);
  assert.match(err(sh, 'tail nope', 1), /cannot open 'nope' for reading: No such file or directory/);
});

/* ================================================================== quoting and variables */
test('quoting: single, double, backslash', () => {
  const sh = fresh();
  assert.equal(out(sh, `echo 'single $HOME' "double $HOME" \\$HOME a\\ b`), 'single $HOME double /home/you $HOME a b\n');
  assert.equal(out(sh, `echo "she said \\"hi\\"" 'it'\\''s'`), 'she said "hi" it\'s\n');
  assert.equal(out(sh, 'echo "a   b"   c    d'), 'a   b c d\n');
  assert.equal(out(sh, 'echo ""; echo "" | wc -c'), '\n1\n');
  assert.equal(out(sh, 'printf "[%s]\\n" "" x'), '[]\n[x]\n', 'an empty quoted argument survives');
});
test('variables: assignment, $VAR, ${VAR}, defaults, length, trimming', () => {
  const sh = fresh();
  out(sh, 'name=World');
  assert.equal(out(sh, 'echo Hello $name ${name}s "$name!"'), 'Hello World Worlds World!\n');
  assert.equal(out(sh, 'echo ${missing:-fallback} ${#name}'), 'fallback 5\n');
  assert.equal(out(sh, 'f=report.txt; echo ${f%.txt} ${f#*.} ${f/txt/md}'), 'report txt report.md\n');
  assert.equal(out(sh, 'p=/a/b/c.tar.gz; echo ${p##*/} ${p%%.*} ${p%/*}'), 'c.tar.gz /a/b/c /a/b\n');
  assert.equal(out(sh, 'echo ${unset:=set_now}; echo $unset'), 'set_now\nset_now\n');
  assert.equal(out(sh, 'x=1; x+=2; echo $x'), '12\n');
  assert.match(err(sh, 'echo ${nope:?is required}', 1), /nope: is required/);
  assert.equal(out(sh, 'echo $nosuchvar end'), 'end\n', 'an unset variable disappears');
  assert.equal(out(sh, 'echo "${HOME}/x" ~/y ~'), '/home/you/x /home/you/y /home/you\n');
  assert.equal(out(sh, 'unset name; echo "[$name]"'), '[]\n');
});
test('word splitting and globbing of unquoted variables', () => {
  const sh = fresh();
  assert.equal(out(sh, 'v="a   b"; printf "<%s>" $v "$v"; echo'), '<a><b><a   b>\n');
  assert.equal(out(sh, 'g="*.txt"; echo $g "$g"'), 'a.txt *.txt\n');
  out(sh, 'touch "my file.txt"');
  assert.equal(err(sh, 'f="my file.txt"; cat $f', 1), 'cat: my: No such file or directory\ncat: file.txt: No such file or directory\n');
  assert.equal(out(sh, 'f="my file.txt"; cat "$f"; echo ok'), 'ok\n');
});
test('special parameters: $? $# $@ $* $0 $$', () => {
  const sh = fresh();
  assert.equal(out(sh, 'false; echo $?; true; echo $?'), '1\n0\n');
  assert.equal(out(sh, 'ls nope 2>/dev/null; echo $?'), '2\n');
  assert.equal(out(sh, 'nope 2>/dev/null; echo $?'), '127\n');
  assert.equal(out(sh, 'echo $0 $$ $#'), 'bash 1000 0\n');
  assert.equal(out(sh, 'set -- a "b c" d; echo $#; printf "<%s>" "$@"; echo; printf "<%s>" "$*"; echo'), '3\n<a><b c><d>\n<a b c d>\n');
});
test('command substitution and arithmetic', () => {
  const sh = fresh();
  assert.equal(out(sh, 'n=$(ls notes | wc -l); echo "files: $n"'), 'files: 2\n');
  assert.equal(out(sh, 'echo "today is $(date +%A)"'), 'today is Monday\n');
  assert.equal(out(sh, 'echo `echo back ticks`'), 'back ticks\n');
  assert.equal(out(sh, 'echo $(echo a $(echo b))'), 'a b\n');
  assert.equal(out(sh, 'echo $((1 + 2 * 3)) $((10 / 3)) $((10 % 3)) $((2 ** 8)) $(( (1+2) * 3 ))'), '7 3 1 256 9\n');
  assert.equal(out(sh, 'i=5; echo $((i + 1)) $(($i * 2)) $((i > 3)) $((i == 5 && 1))'), '6 10 1 1\n');
  assert.equal(out(sh, 'i=0; : $((i++)); : $((i += 5)); echo $i'), '6\n');
  assert.match(err(sh, 'echo $((1 / 0))', 1), /division by 0/);
  assert.equal(out(sh, 'x=$(false); echo $?'), '1\n', 'an assignment takes the status of its command substitution');
});
test('export: only exported variables reach scripts and child shells', () => {
  const sh = fresh();
  out(sh, 'v=local; export w=shared');
  assert.equal(out(sh, `bash -c 'echo "[$v] [$w]"'`), '[] [shared]\n');
  out(sh, 'export v');
  assert.equal(out(sh, `bash -c 'echo "[$v]"'`), '[local]\n');
  assert.equal(out(sh, `X=temp bash -c 'echo $X'; echo "[$X]"`), 'temp\n[]\n', 'NAME=value cmd sets it for that command only');
  assert.match(out(sh, 'export'), /declare -x w="shared"/);
  assert.match(out(sh, 'env'), /^w=shared$/m);
  assert.equal(out(sh, 'printenv HOME'), '/home/you\n');
  assert.equal(out(sh, 'env GREETING=hi printenv GREETING'), 'hi\n');
  assert.match(err(sh, 'export 1x=2', 1), /`1x=2': not a valid identifier/);
});

/* ================================================================== pipes and redirection */
test('pipes chain stdout into stdin', () => {
  const sh = fresh();
  assert.equal(out(sh, 'cat notes/todo.txt | grep buy | sort -r'), 'buy milk\nbuy bread\n');
  assert.equal(out(sh, 'echo one two three | tr " " "\\n" | wc -l'), '3\n');
  assert.equal(out(sh, 'cd /tmp | pwd'), '/home/you\n', 'each part of a pipeline runs in a subshell');
  assert.equal(sh.s.cwd, '/home/you');
  assert.equal(out(sh, 'echo hi | read x; echo "[$x]"'), '[]\n');
  assert.equal(out(sh, 'ls nope 2>&1 | wc -l'), '1\n');
  assert.equal(out(sh, '! false; echo $?'), '0\n');
});
test('redirection: > >> < 2> 2>&1 &> /dev/null', () => {
  const sh = fresh();
  out(sh, 'echo first > out.txt');
  out(sh, 'echo second >> out.txt');
  assert.equal(file(sh, 'out.txt'), 'first\nsecond\n');
  out(sh, 'echo replaced > out.txt');
  assert.equal(file(sh, 'out.txt'), 'replaced\n');
  assert.equal(out(sh, 'wc -l < notes/todo.txt'), '3\n');
  assert.equal(out(sh, 'ls nope 2> err.txt; cat err.txt', 0), "ls: cannot access 'nope': No such file or directory\n");
  sh.run('ls a.txt nope > both.txt 2>&1');
  assert.equal(file(sh, 'both.txt'), "ls: cannot access 'nope': No such file or directory\na.txt\n");
  sh.run('ls a.txt nope &> amp.txt');
  assert.equal(file(sh, 'amp.txt'), file(sh, 'both.txt'));
  const r = sh.run('ls nope 2>&1 > only-out.txt');
  assert.equal(file(sh, 'only-out.txt'), '', 'order matters: 2>&1 first copies the old stdout (the terminal)');
  assert.equal(r.lines[0].t, "ls: cannot access 'nope': No such file or directory");
  assert.equal(out(sh, 'ls nope 2>/dev/null; echo done', 0), 'done\n');
  out(sh, 'echo gone > /dev/null');
  assert.equal(file(sh, '/dev/null'), undefined);
  assert.equal(out(sh, 'cat < /dev/null | wc -c'), '0\n');
  assert.equal(out(sh, 'echo err >&2 2>/dev/null; echo x 1>&2 2>/dev/null'), '', 'stderr writes land on stderr');
  assert.equal(out(sh, '> empty.txt; wc -c < empty.txt'), '0\n', 'a bare > creates an empty file');
  assert.equal(out(sh, 'cat <<< "here string"'), 'here string\n');
});
test('redirection errors: missing folder, directory, permission, ambiguous', () => {
  const sh = fresh();
  assert.equal(err(sh, 'echo x > nodir/f.txt', 1), 'bash: nodir/f.txt: No such file or directory\n');
  assert.equal(err(sh, 'echo x > notes', 1), 'bash: notes: Is a directory\n');
  assert.equal(err(sh, 'cat < missing', 1), 'bash: missing: No such file or directory\n');
  assert.equal(err(sh, 'echo x > /etc/new', 1), 'bash: /etc/new: Permission denied\n');
  out(sh, 'chmod -w a.txt');
  assert.equal(err(sh, 'echo x >> a.txt', 1), 'bash: a.txt: Permission denied\n');
  assert.equal(file(sh, 'a.txt'), 'hello\n');
  assert.match(err(sh, 'f="a b"; echo x > $f', 1), /ambiguous redirect/);
});
test('cat file > file empties it first (the classic trap)', () => {
  const sh = fresh();
  out(sh, 'cat a.txt > a.txt');
  assert.equal(file(sh, 'a.txt'), '');
});
test('here-documents in scripts', () => {
  const sh = fresh({ 'h.sh': 'name=Ada\ncat <<EOF\nHi $name\n  indented\nEOF\ncat <<\'EOF\'\nraw $name\nEOF\ncat <<-END\n\ttabs stripped\n\tEND\n' });
  assert.equal(out(sh, 'bash h.sh'), 'Hi Ada\n  indented\nraw $name\ntabs stripped\n');
});

/* ================================================================== exit codes, && || ; */
test('&& runs on success, || on failure, ; always', () => {
  const sh = fresh();
  assert.equal(out(sh, 'true && echo a; false && echo b; false || echo c; true || echo d'), 'a\nc\n');
  assert.equal(out(sh, 'mkdir x && cd x && pwd'), '/home/you/x\n');
  out(sh, 'cd');
  assert.equal(out(sh, 'mkdir x 2>/dev/null && echo made || echo exists'), 'exists\n');
  assert.equal(sh.run('false; true').code, 0);
  assert.equal(sh.run('true; false').code, 1);
  assert.equal(sh.run('false && true').code, 1);
  assert.equal(sh.run('ls nope 2>/dev/null || true').code, 0);
});
test('command not found: 127 with a hint; not executable: 126', () => {
  const sh = fresh({ 'tool.sh': 'echo hi' });
  const r = sh.run('sl');
  assert.equal(r.code, 127);
  assert.equal(sh.lastErr, 'bash: sl: command not found\n');
  assert.ok(r.lines.some((l) => l.c === 'hint' && /ls/.test(l.t)));
  assert.equal(err(sh, './tool.sh', 126), 'bash: ./tool.sh: Permission denied\n');
  assert.equal(err(sh, './nope.sh', 127), 'bash: ./nope.sh: No such file or directory\n');
  assert.equal(err(sh, './notes', 126), 'bash: ./notes: Is a directory\n');
  assert.ok(sh.run('curl example.com').lines.some((l) => /Networking is not simulated/.test(l.t)));
  assert.ok(sh.run('gerp x').lines.some((l) => /grep/.test(l.t)));
});
test('$PATH decides where commands are found', () => {
  const sh = fresh();
  const r = sh.run('PATH=/nowhere; ls');
  assert.equal(r.code, 127);
  assert.ok(r.lines.some((l) => /not in your \$PATH/.test(l.t)));
  out(sh, 'PATH=/usr/local/bin:/usr/bin:/bin');
  out(sh, 'mkdir -p ~/bin; printf "#!/bin/bash\\necho hello from hi\\n" > ~/bin/hi; chmod +x ~/bin/hi');
  assert.equal(sh.run('hi').code, 127);
  out(sh, 'export PATH="$HOME/bin:$PATH"');
  assert.equal(out(sh, 'hi'), 'hello from hi\n');
  assert.equal(out(sh, 'which hi ls'), '/home/you/bin/hi\n/usr/bin/ls\n');
  assert.equal(sh.run('which cd').code, 1, 'builtins have no file');
  assert.equal(out(sh, 'type cd ls hi if'), 'cd is a shell builtin\nls is /usr/bin/ls\nhi is /home/you/bin/hi\nif is a shell keyword\n');
  assert.equal(out(sh, 'command -v ls cd'), '/usr/bin/ls\ncd\n');
  assert.equal(out(sh, '/usr/bin/echo by path'), 'by path\n');
});

/* ================================================================== permissions */
test('chmod: octal and symbolic modes, ls -l shows them', () => {
  const sh = fresh({ 'run.sh': '#!/bin/bash\necho ran' });
  out(sh, 'chmod +x run.sh');
  assert.match(out(sh, 'ls -l run.sh'), /^-rwxr-xr-x /);
  out(sh, 'chmod 600 run.sh');
  assert.match(out(sh, 'ls -l run.sh'), /^-rw------- /);
  out(sh, 'chmod u+x,g+r run.sh');
  assert.match(out(sh, 'ls -l run.sh'), /^-rwxr----- /);
  out(sh, 'chmod a=r run.sh');
  assert.match(out(sh, 'ls -l run.sh'), /^-r--r--r-- /);
  out(sh, 'chmod 755 run.sh; chmod go-x run.sh');
  assert.match(out(sh, 'ls -l run.sh'), /^-rwxr--r-- /);
  out(sh, 'chmod -R 700 notes');
  assert.match(out(sh, 'ls -ld notes; ls -l notes/todo.txt'), /^drwx------ [\s\S]*-rwx------ /);
  assert.match(err(sh, 'chmod 999 a.txt', 1), /invalid mode: ‘999’/);
  assert.match(err(sh, 'chmod +x nope', 1), /cannot access 'nope': No such file or directory/);
  assert.match(err(sh, 'chmod 777 /etc/passwd', 1), /changing permissions of '\/etc\/passwd': Operation not permitted/);
  assert.equal(out(sh, 'chmod -v 644 a.txt'), "mode of 'a.txt' changed to 0644 (rw-r--r--)\n");
});
test('applyMode: umask applies when no who is given', () => {
  assert.equal(applyMode(0o644, '+x'), 0o755);
  assert.equal(applyMode(0o644, '+w'), 0o644, '+w with umask 022 only adds it for the owner');
  assert.equal(applyMode(0o644, 'a+w'), 0o666);
  assert.equal(applyMode(0o755, 'o='), 0o750);
  assert.equal(applyMode(0o700, 'g=u'), null, 'copying classes is not supported');
  assert.equal(applyMode(0o644, '1777'), 0o1777);
});
test('permission errors: read, write, execute, directories', () => {
  const sh = fresh({ 'run.sh': '#!/bin/bash\necho ran' });
  out(sh, 'chmod 000 a.txt');
  assert.equal(err(sh, 'cat a.txt', 1), 'cat: a.txt: Permission denied\n');
  assert.equal(err(sh, 'grep x a.txt', 2), 'grep: a.txt: Permission denied\n');
  assert.equal(err(sh, './run.sh', 126), 'bash: ./run.sh: Permission denied\n');
  assert.equal(out(sh, 'bash run.sh'), 'ran\n', 'bash file runs it without the x bit');
  out(sh, 'chmod 555 notes');
  assert.match(err(sh, 'touch notes/new', 1), /cannot touch 'notes\/new': Permission denied/);
  assert.match(err(sh, 'rm notes/todo.txt', 1), /cannot remove 'notes\/todo.txt': Permission denied/);
  out(sh, 'chmod 311 notes');
  assert.match(err(sh, 'ls notes', 2), /cannot open directory 'notes': Permission denied/);
  assert.equal(out(sh, 'cat notes/todo.txt | head -1'), 'buy milk\n', 'x without r: you can still open a file you know the name of');
  out(sh, 'chmod 644 notes');
  assert.match(err(sh, 'cat notes/todo.txt', 1), /Permission denied/);
});

/* ================================================================== searching */
test('grep: -i -n -v -c -l -w -o -E -F -r and exit codes', () => {
  const sh = fresh({ 'src/app.js': 'const Todo = 1;\n// TODO: fix\nlet todo2;', 'src/lib/util.js': 'export const x = 1; // todo later' });
  assert.equal(out(sh, 'grep buy notes/todo.txt'), 'buy milk\nbuy bread\n');
  assert.equal(out(sh, 'grep -n buy notes/todo.txt'), '1:buy milk\n3:buy bread\n');
  assert.equal(out(sh, 'grep -v buy notes/todo.txt'), 'call mum\n');
  assert.equal(out(sh, 'grep -c buy notes/todo.txt'), '2\n');
  assert.equal(out(sh, 'grep -i todo src/app.js'), 'const Todo = 1;\n// TODO: fix\nlet todo2;\n');
  assert.equal(out(sh, 'grep -iw todo src/app.js'), 'const Todo = 1;\n// TODO: fix\n');
  assert.equal(out(sh, 'grep -o "b[a-z]*" notes/todo.txt'), 'buy\nbuy\nbread\n');
  assert.equal(out(sh, 'grep -E "milk|mum" notes/todo.txt'), 'buy milk\ncall mum\n');
  assert.equal(out(sh, 'grep "milk\\|mum" notes/todo.txt'), 'buy milk\ncall mum\n', 'BRE alternation');
  assert.equal(out(sh, 'grep -F "a.b" notes/todo.txt', 1), '');
  assert.equal(out(sh, 'grep "^call" notes/todo.txt'), 'call mum\n');
  assert.equal(out(sh, 'grep "d$" notes/todo.txt'), 'buy bread\n');
  assert.equal(out(sh, 'grep -l buy notes/*'), 'notes/todo.txt\n');
  assert.equal(out(sh, 'grep buy notes/*'), 'notes/todo.txt:buy milk\nnotes/todo.txt:buy bread\n');
  assert.equal(out(sh, 'grep -h buy notes/*'), 'buy milk\nbuy bread\n');
  assert.equal(out(sh, 'grep -rn todo src'), 'src/app.js:3:let todo2;\nsrc/lib/util.js:1:export const x = 1; // todo later\n');
  assert.equal(out(sh, 'cd src; grep -rl -i todo'), 'app.js\nlib/util.js\n');
  out(sh, 'cd');
  assert.equal(out(sh, 'grep -ri todo .'), './src/app.js:const Todo = 1;\n./src/app.js:// TODO: fix\n./src/app.js:let todo2;\n./src/lib/util.js:export const x = 1; // todo later\n');
  assert.equal(out(sh, 'grep -q milk notes/todo.txt && echo found'), 'found\n');
  assert.equal(sh.run('grep zebra notes/todo.txt').code, 1);
  assert.equal(err(sh, 'grep x nope', 2), 'grep: nope: No such file or directory\n');
  assert.equal(err(sh, 'grep x notes', 1), 'grep: notes: Is a directory\n');
  assert.equal(out(sh, 'echo "a1 b22 c333" | grep -oE "[0-9]+"'), '1\n22\n333\n');
  assert.equal(out(sh, 'printf "x\\nab\\n" | grep -x ab'), 'ab\n');
  assert.equal(out(sh, 'grep -e milk -e mum notes/todo.txt'), 'buy milk\ncall mum\n');
  assert.equal(out(sh, 'grep "[[:digit:]]" src/app.js'), 'const Todo = 1;\nlet todo2;\n');
});
test('find: -name -iname -type -maxdepth -empty -size, actions', () => {
  const sh = fresh({ 'src/app.js': 'x', 'src/lib/util.js': '', 'src/README.MD': 'r', 'logs/a.log': 'a', 'logs/old/b.log': 'b' });
  assert.equal(out(sh, 'find . -name "*.log"'), './b.log\n./logs/a.log\n./logs/old/b.log\n');
  assert.equal(out(sh, 'find logs -name "*.log" -type f'), 'logs/a.log\nlogs/old/b.log\n');
  assert.equal(out(sh, 'find src'), 'src\nsrc/README.MD\nsrc/app.js\nsrc/lib\nsrc/lib/util.js\n');
  assert.equal(out(sh, 'find src -type d'), 'src\nsrc/lib\n');
  assert.equal(out(sh, 'find src -iname "*.md"'), 'src/README.MD\n');
  assert.equal(out(sh, 'find . -maxdepth 1 -name "*.log"'), './b.log\n');
  assert.equal(out(sh, 'find src -empty'), 'src/lib/util.js\n');
  assert.equal(out(sh, 'find src -name "*.js" ! -name "app*"'), 'src/lib/util.js\n');
  assert.equal(out(sh, 'find src -name "*.js" -o -name "*.MD"'), 'src/README.MD\nsrc/app.js\nsrc/lib/util.js\n');
  assert.equal(out(sh, 'find . -name "*.log" -exec rm {} \\;'), '');
  assert.equal(out(sh, 'find . -name "*.log" | wc -l'), '0\n');
  out(sh, 'touch t1.tmp t2.tmp');
  out(sh, 'find . -name "*.tmp" -delete');
  assert.equal(out(sh, 'ls *.tmp 2>/dev/null | wc -l'), '0\n');
  assert.equal(out(sh, 'find src -name "*.js" -exec echo FILE {} +'), 'FILE src/app.js src/lib/util.js\n');
  assert.equal(out(sh, 'find . -size +0 -name "*.js"'), './src/app.js\n');
  assert.equal(err(sh, 'find nope', 1), 'find: ‘nope’: No such file or directory\n');
  assert.match(err(sh, 'find . -nmae x', 1), /unknown predicate `-nmae'/);
  assert.match(err(sh, 'find . -name', 1), /missing argument to `-name'/);
  assert.equal(out(sh, 'find . -name *.txt'), './a.txt\n', 'unquoted: the shell expands it first (one match here)');
});

/* ================================================================== text processing */
test('sort: -r -n -u -k -t -f', () => {
  const sh = fresh({ 'scores.csv': 'ann,30\nbob,9\ncat,100\nann,30' });
  assert.equal(out(sh, 'printf "b\\nA\\na\\nB\\n" | sort'), 'A\nB\na\nb\n', 'codepoint order: uppercase first');
  assert.equal(out(sh, 'printf "b\\nA\\na\\nB\\n" | sort -f'), 'A\na\nB\nb\n');
  assert.equal(out(sh, 'printf "10\\n9\\n100\\n" | sort'), '10\n100\n9\n');
  assert.equal(out(sh, 'printf "10\\n9\\n100\\n" | sort -n'), '9\n10\n100\n');
  assert.equal(out(sh, 'printf "10\\n9\\n100\\n" | sort -nr'), '100\n10\n9\n');
  assert.equal(out(sh, 'sort -u scores.csv'), 'ann,30\nbob,9\ncat,100\n');
  assert.equal(out(sh, 'sort -t, -k2 -n scores.csv'), 'bob,9\nann,30\nann,30\ncat,100\n');
  assert.equal(out(sh, 'sort -t, -k2,2nr scores.csv | head -1'), 'cat,100\n');
  out(sh, 'sort -o sorted.txt notes/todo.txt');
  assert.equal(file(sh, 'sorted.txt'), 'buy bread\nbuy milk\ncall mum\n');
});
test('uniq: adjacent only, -c -d -u', () => {
  const sh = fresh({ 'w.txt': 'a\na\nb\na\nc\nc' });
  assert.equal(out(sh, 'uniq w.txt'), 'a\nb\na\nc\n');
  assert.equal(out(sh, 'sort w.txt | uniq'), 'a\nb\nc\n');
  assert.equal(out(sh, 'sort w.txt | uniq -c'), '      3 a\n      1 b\n      2 c\n');
  assert.equal(out(sh, 'sort w.txt | uniq -c | sort -rn | head -1'), '      3 a\n');
  assert.equal(out(sh, 'sort w.txt | uniq -d'), 'a\nc\n');
  assert.equal(out(sh, 'sort w.txt | uniq -u'), 'b\n');
});
test('cut and tr', () => {
  const sh = fresh();
  assert.equal(out(sh, 'cut -d: -f1 /etc/passwd | head -2'), 'root\ndaemon\n');
  assert.equal(out(sh, 'cut -d: -f1,7 /etc/passwd | tail -1'), 'you:/bin/bash\n');
  assert.equal(out(sh, 'echo "a,b,c,d" | cut -d, -f2-'), 'b,c,d\n');
  assert.equal(out(sh, 'echo "hello" | cut -c1-3'), 'hel\n');
  assert.equal(out(sh, 'echo "no delim" | cut -d, -f2'), 'no delim\n');
  assert.match(err(sh, 'cut a.txt', 1), /you must specify a list/);
  assert.equal(out(sh, 'echo "Hello World" | tr a-z A-Z'), 'HELLO WORLD\n');
  assert.equal(out(sh, 'echo "Hello" | tr "[:upper:]" "[:lower:]"'), 'hello\n');
  assert.equal(out(sh, 'echo "a-b-c" | tr - " "'), 'a b c\n');
  assert.equal(out(sh, 'echo "hello world" | tr -d o'), 'hell wrld\n');
  assert.equal(out(sh, 'echo "too    many   spaces" | tr -s " "'), 'too many spaces\n');
  assert.equal(out(sh, 'echo "a b" | tr " " "\\n"'), 'a\nb\n');
  assert.match(err(sh, 'tr a b a.txt', 1), /extra operand 'a.txt'/);
});
test('sed: s///, g, -n p, d, ranges, -i, -E, backrefs', () => {
  const sh = fresh({ 'cfg.txt': 'port=80\nhost=old\n# comment\nport=81' });
  assert.equal(out(sh, 'sed "s/port/PORT/" cfg.txt'), 'PORT=80\nhost=old\n# comment\nPORT=81\n');
  assert.equal(out(sh, 'echo aaa | sed "s/a/b/"; echo aaa | sed "s/a/b/g"; echo aaa | sed "s/a/b/2"'), 'baa\nbbb\naba\n');
  assert.equal(out(sh, 'sed -n "2p" cfg.txt'), 'host=old\n');
  assert.equal(out(sh, 'sed -n "/port/p" cfg.txt'), 'port=80\nport=81\n');
  assert.equal(out(sh, 'sed "/^#/d" cfg.txt'), 'port=80\nhost=old\nport=81\n');
  assert.equal(out(sh, 'sed "1,2d" cfg.txt'), '# comment\nport=81\n');
  assert.equal(out(sh, "sed '$d' cfg.txt | tail -1"), '# comment\n');
  assert.equal(out(sh, 'sed "$d" cfg.txt | tail -1'), 'port=81\n', 'in double quotes the shell expands $d (to nothing) first');
  assert.equal(out(sh, 'sed "2q" cfg.txt'), 'port=80\nhost=old\n');
  assert.equal(out(sh, 'echo "hello world" | sed "s/\\(hello\\) \\(world\\)/\\2 \\1/"'), 'world hello\n');
  assert.equal(out(sh, 'echo "hello world" | sed -E "s/(hello) (world)/\\2 \\1/"'), 'world hello\n');
  assert.equal(out(sh, 'echo "x" | sed "s/x/[&]/"'), '[x]\n');
  assert.equal(out(sh, 'echo "a/b" | sed "s|/|-|"'), 'a-b\n');
  assert.equal(out(sh, 'echo "Hello" | sed "s/hello/bye/I"'), 'bye\n');
  assert.equal(out(sh, 'sed -e "s/80/8080/" -e "s/old/new/" cfg.txt | head -2'), 'port=8080\nhost=new\n');
  assert.equal(out(sh, 'sed "s/=/: /; s/port/Port/" cfg.txt | head -1'), 'Port: 80\n');
  assert.equal(out(sh, 'sed "/host/!d" cfg.txt'), 'host=old\n');
  assert.equal(out(sh, 'printf "a\\nb\\n" | sed "1i\\\\top"'), 'top\na\nb\n');
  out(sh, 'sed -i "s/old/new/" cfg.txt');
  assert.equal(file(sh, 'cfg.txt'), 'port=80\nhost=new\n# comment\nport=81\n');
  out(sh, 'sed -i.bak "s/new/newer/" cfg.txt');
  assert.equal(file(sh, 'cfg.txt.bak'), 'port=80\nhost=new\n# comment\nport=81\n');
  assert.match(err(sh, 'sed "s/a/b" cfg.txt', 1), /unterminated `s' command/);
  assert.match(err(sh, 'sed "k" cfg.txt', 1), /unknown command/);
});
test('awk: fields, -F, patterns, NR NF $NF, END sums, printf', () => {
  const sh = fresh({ 'sales.txt': 'apples 3 1.50\npears 10 0.80\nplums 7 2.00', 'data.csv': 'name,age\nada,36\nlin,25' });
  assert.equal(out(sh, "awk '{print $1}' sales.txt"), 'apples\npears\nplums\n');
  assert.equal(out(sh, "awk '{print $2, $1}' sales.txt | head -1"), '3 apples\n');
  assert.equal(out(sh, "awk -F, '{print $2}' data.csv"), 'age\n36\n25\n');
  assert.equal(out(sh, "awk -F, 'NR > 1 {print $1}' data.csv"), 'ada\nlin\n');
  assert.equal(out(sh, "awk '$2 > 5' sales.txt"), 'pears 10 0.80\nplums 7 2.00\n');
  assert.equal(out(sh, "awk '/^pl/ {print NR\": \"$0}' sales.txt"), '3: plums 7 2.00\n');
  assert.equal(out(sh, "awk '{total += $2} END {print total}' sales.txt"), '20\n');
  assert.equal(out(sh, "awk '{s += $2 * $3} END {print s}' sales.txt"), '26.5\n');
  assert.equal(out(sh, "awk 'END {print NR}' sales.txt"), '3\n');
  assert.equal(out(sh, "echo 'a b c' | awk '{print NF, $NF, $(NF-1)}'"), '3 c b\n');
  assert.equal(out(sh, "awk '{printf \"%-7s%5.2f\\n\", $1, $3}' sales.txt | head -1"), 'apples  1.50\n');
  assert.equal(out(sh, "awk 'BEGIN {print \"start\"} {n++} END {print n \" lines\"}' sales.txt"), 'start\n3 lines\n');
  assert.equal(out(sh, "awk '$1 ~ /^p/ {print toupper($1)}' sales.txt"), 'PEARS\nPLUMS\n');
  assert.equal(out(sh, "awk '{ if ($2 >= 7) print $1; else print \"-\" }' sales.txt"), '-\npears\nplums\n');
  assert.equal(out(sh, "awk -F: '$3 >= 1000 {print $1}' /etc/passwd"), 'you\n');
  assert.equal(out(sh, "awk 'NR==2 {print length($1)}' sales.txt"), '5\n');
  assert.equal(out(sh, "awk -v x=5 'BEGIN {print x * 2}'"), '10\n');
});
test('tee, xargs, diff, rev, seq', () => {
  const sh = fresh();
  assert.equal(out(sh, 'echo saved | tee copy.txt'), 'saved\n');
  assert.equal(file(sh, 'copy.txt'), 'saved\n');
  out(sh, 'echo more | tee -a copy.txt > /dev/null');
  assert.equal(file(sh, 'copy.txt'), 'saved\nmore\n');
  assert.equal(out(sh, 'ls notes | xargs echo got'), 'got done.txt todo.txt\n');
  assert.equal(out(sh, 'printf "a\\nb\\n" | xargs -n 1 echo item'), 'item a\nitem b\n');
  assert.equal(out(sh, 'printf "x\\ny\\n" | xargs -I {} echo "<{}>"'), '<x>\n<y>\n');
  out(sh, 'cd notes; ls | xargs rm; cd');
  assert.equal(out(sh, 'ls notes | wc -l'), '0\n');
  out(sh, 'printf "a\\nb\\nc\\n" > x1; printf "a\\nB\\nc\\nd\\n" > x2');
  assert.equal(out(sh, 'diff x1 x2', 1), '2c2\n< b\n---\n> B\n3a4\n> d\n');
  assert.equal(out(sh, 'diff -u x1 x2', 1), '--- x1\n+++ x2\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d\n');
  assert.equal(out(sh, 'diff x1 x1'), '');
  assert.equal(out(sh, 'diff -q x1 x2', 1), 'Files x1 and x2 differ\n');
  assert.equal(out(sh, 'echo abc | rev'), 'cba\n');
  assert.equal(out(sh, 'seq 3'), '1\n2\n3\n');
  assert.equal(out(sh, 'seq 2 2 6'), '2\n4\n6\n');
  assert.equal(out(sh, 'seq 3 -1 1 | tr "\\n" " "'), '3 2 1 ');
  assert.equal(out(sh, 'seq -s , 1 4'), '1,2,3,4\n');
});

/* ================================================================== echo, printf, read, test */
test('echo -n -e and printf formats', () => {
  const sh = fresh();
  assert.equal(out(sh, 'echo -n hi'), 'hi');
  assert.equal(out(sh, 'echo -e "a\\tb\\nc"'), 'a\tb\nc\n');
  assert.equal(out(sh, 'echo "a\\tb"'), 'a\\tb\n', 'plain echo keeps backslashes');
  assert.equal(out(sh, 'echo -x'), '-x\n');
  assert.equal(out(sh, 'printf "%s is %d\\n" age 36'), 'age is 36\n');
  assert.equal(out(sh, 'printf "%s\\n" a b c'), 'a\nb\nc\n', 'the format repeats for extra arguments');
  assert.equal(out(sh, 'printf "%5s|%-5s|%05d|%.2f|%x|%%\\n" ab cd 42 3.14159 255'), '   ab|cd   |00042|3.14|ff|%\n');
  assert.equal(out(sh, 'printf "no newline"'), 'no newline');
  const r = sh.run('printf "%d\\n" abc');
  assert.equal(r.code, 1);
  assert.match(sh.lastErr, /abc: invalid number/);
  assert.equal(printf('%b', ['a\\nb']), 'a\nb');
});
test('read: from pipes, redirects, here-strings and typed input', () => {
  const sh = fresh();
  assert.equal(out(sh, 'read a b <<< "one two three"; echo "$a|$b"'), 'one|two three\n');
  assert.equal(out(sh, 'read line < notes/todo.txt; echo "$line"'), 'buy milk\n');
  assert.equal(out(sh, 'read <<< "default var"; echo "$REPLY"'), 'default var\n');
  assert.equal(out(sh, 'while read item; do echo "- $item"; done < notes/todo.txt'), '- buy milk\n- call mum\n- buy bread\n');
  assert.equal(out(sh, 'printf "a b\\nc d\\n" | while read x y; do echo "$y$x"; done'), 'ba\ndc\n');
  assert.equal(out(sh, 'read -r raw <<< "a\\\\b"; echo "$raw"'), 'a\\b\n');
  const r = sh.run('read -p "Name: " name; echo "Hi $name"', { stdin: 'Ada\n' });
  assert.equal(r.code, 0);
  assert.equal(sh.lastOut, 'Hi Ada\n');
  assert.equal(sh.lastErr, 'Name: ');
  const r2 = sh.run('read nothing');
  assert.equal(r2.code, 1, 'no input: read fails like at end of file');
  assert.ok(r2.lines.some((l) => l.c === 'hint'));
});
test('test and [ ]: files, strings, numbers, ! -a -o', () => {
  const sh = fresh({ 'run.sh': { content: 'x', mode: 0o755 } });
  const t = (expr) => sh.run(expr).code;
  assert.equal(t('[ -e a.txt ]'), 0);
  assert.equal(t('[ -e nope ]'), 1);
  assert.equal(t('[ -f notes ]'), 1);
  assert.equal(t('[ -d notes ]'), 0);
  assert.equal(t('[ -x run.sh ]'), 0);
  assert.equal(t('[ -x a.txt ]'), 1);
  assert.equal(t('[ -r a.txt -a -w a.txt ]'), 0);
  assert.equal(t('[ -s a.txt ]'), 0);
  out(sh, 'touch empty');
  assert.equal(t('[ -s empty ]'), 1);
  assert.equal(t('[ -z "" ]'), 0);
  assert.equal(t('[ -n "" ]'), 1);
  assert.equal(t('[ abc = abc ]'), 0);
  assert.equal(t('[ abc != abc ]'), 1);
  assert.equal(t('[ 5 -gt 3 ]'), 0);
  assert.equal(t('[ 5 -le 3 ]'), 1);
  assert.equal(t('[ 10 -eq 10 -o 1 -eq 2 ]'), 0);
  assert.equal(t('[ ! -e nope ]'), 0);
  assert.equal(t('test -d notes'), 0);
  assert.equal(t('[ ]'), 1);
  assert.equal(t('[ word ]'), 0);
  assert.equal(t('[ "$unset" = "" ]'), 0);
  assert.equal(err(sh, '[ 1 -lt x ]', 2), 'bash: [: x: integer expression expected\n');
  assert.equal(err(sh, '[ 1 = 1', 2), "bash: [: missing `]'\n");
  assert.equal(err(sh, 'x="a b"; [ $x = "a b" ]', 2), 'bash: [: too many arguments\n', 'the classic unquoted variable bug');
  assert.equal(t('x="a b"; [ "$x" = "a b" ]'), 0);
});

/* ================================================================== control flow */
test('if / elif / else', () => {
  const sh = fresh();
  const grade = (n) => out(sh, `n=${n}; if [ $n -ge 90 ]; then echo A; elif [ $n -ge 50 ]; then echo pass; else echo fail; fi`);
  assert.equal(grade(95), 'A\n');
  assert.equal(grade(60), 'pass\n');
  assert.equal(grade(10), 'fail\n');
  assert.equal(out(sh, 'if grep -q milk notes/todo.txt; then echo has milk; fi'), 'has milk\n');
  assert.equal(out(sh, 'if ! ls nope 2>/dev/null; then echo missing; fi'), 'missing\n');
  assert.equal(sh.run('if false; then echo x; fi').code, 0, 'no branch taken: status 0');
});
test('for loops: words, globs, ranges, "$@", break and continue', () => {
  const sh = fresh();
  assert.equal(out(sh, 'for x in a b c; do echo $x; done'), 'a\nb\nc\n');
  assert.equal(out(sh, 'for f in notes/*.txt; do echo "file: $f"; done'), 'file: notes/done.txt\nfile: notes/todo.txt\n');
  assert.equal(out(sh, 'for i in {1..3}; do echo -n $i; done; echo'), '123\n');
  assert.equal(out(sh, 'for i in $(seq 1 3); do echo $((i * i)); done'), '1\n4\n9\n');
  assert.equal(out(sh, 'for i in 1 2 3 4; do if [ $i = 3 ]; then break; fi; echo $i; done'), '1\n2\n');
  assert.equal(out(sh, 'for i in 1 2 3; do [ $i = 2 ] && continue; echo $i; done'), '1\n3\n');
  assert.equal(out(sh, 'for a in 1 2; do for b in x y; do [ $b = y ] && continue 2; echo $a$b; done; done'), '1x\n2x\n');
  assert.equal(out(sh, 'set -- p q; for arg; do echo $arg; done'), 'p\nq\n');
  out(sh, 'for f in *.log; do mv "$f" "${f%.log}.txt"; done');
  assert.equal(file(sh, 'b.txt'), 'one\ntwo\n');
  assert.equal(out(sh, 'for x in a b; do echo $x; done > list.txt; cat list.txt'), 'a\nb\n');
});
test('while and until loops, with the iteration cap', () => {
  const sh = fresh();
  assert.equal(out(sh, 'i=1; while [ $i -le 3 ]; do echo $i; i=$((i + 1)); done'), '1\n2\n3\n');
  assert.equal(out(sh, 'i=3; until [ $i -eq 0 ]; do echo $i; i=$((i - 1)); done'), '3\n2\n1\n');
  assert.equal(out(sh, 'n=0; while true; do n=$((n+1)); [ $n -ge 5 ] && break; done; echo $n'), '5\n');
  const r = sh.run('while true; do :; done');
  assert.equal(r.code, 1);
  assert.match(sh.lastErr, new RegExp(`stopped after ${LIMITS.loop} rounds`));
  assert.equal(err(sh, 'break', 0), "bash: break: only meaningful in a `for', `while', or `until' loop\n");
});
test('functions: arguments, return, local, recursion cap', () => {
  const sh = fresh();
  out(sh, 'greet() { echo "Hello, $1 ($# args)"; }');
  assert.equal(out(sh, 'greet Ada Lovelace'), 'Hello, Ada (2 args)\n');
  assert.equal(out(sh, 'ok() { return 3; }; ok; echo $?'), '3\n');
  assert.equal(out(sh, 'f() { local x=in; echo $x; }; x=out; f; echo $x'), 'in\nout\n');
  assert.equal(out(sh, 'g() { y=leaked; }; g; echo $y'), 'leaked\n');
  assert.equal(out(sh, 'type greet'), 'greet is a function\n');
  assert.equal(out(sh, 'function shout { echo "$*!"; }; shout hey you'), 'hey you!\n');
  assert.match(err(sh, 'loop() { loop; }; loop', 1), /maximum function nesting level exceeded/);
  assert.match(err(sh, 'return', 1), /can only `return' from a function or sourced script/);
  assert.match(err(sh, 'local z=1', 1), /can only be used in a function/);
  out(sh, 'unset -f greet');
  assert.equal(sh.run('greet').code, 127);
});
test('subshells and groups', () => {
  const sh = fresh();
  assert.equal(out(sh, '(cd /tmp; pwd); pwd'), '/tmp\n/home/you\n');
  assert.equal(out(sh, '(x=inside); echo "[$x]"'), '[]\n');
  assert.equal(out(sh, '{ echo a; echo b; } > g.txt; cat g.txt'), 'a\nb\n');
  assert.equal(out(sh, '(exit 4); echo $?'), '4\n');
});
test('set -e, set -x, set -u', () => {
  const sh = fresh({
    'strict.sh': '#!/bin/bash\nset -e\necho one\nfalse\necho never\n',
    'lenient.sh': '#!/bin/bash\nset -e\nfalse || echo handled\nif false; then :; fi\necho reached\n',
    'trace.sh': '#!/bin/bash\nset -x\nname=Ada\necho "hi $name"\n',
  });
  const r = sh.run('bash strict.sh');
  assert.equal(r.code, 1);
  assert.equal(sh.lastOut, 'one\n');
  assert.equal(out(sh, 'bash lenient.sh'), 'handled\nreached\n');
  sh.run('bash trace.sh');
  assert.equal(sh.lastOut, 'hi Ada\n');
  assert.equal(sh.lastErr, "+ name=Ada\n+ echo 'hi Ada'\n");
  sh.run('bash -x -c "echo traced"');
  assert.equal(sh.lastErr, '+ echo traced\n');
  assert.match(err(sh, 'set -u; echo $nope', 1), /nope: unbound variable/);
  out(sh, 'set +u');
});

/* ================================================================== scripts */
test('scripts: shebang, ./ needs x, args, $0 $# $@, exit codes', () => {
  const sh = fresh({
    'hello.sh': '#!/bin/bash\n# say hello\necho "Hello, $1!"\necho "script: $0, args: $#"\nfor a in "$@"; do echo "- $a"; done\nexit 3\n',
  });
  assert.equal(err(sh, './hello.sh', 126), 'bash: ./hello.sh: Permission denied\n');
  out(sh, 'chmod +x hello.sh');
  assert.equal(out(sh, './hello.sh World "two words"', 3), 'Hello, World!\nscript: ./hello.sh, args: 2\n- World\n- two words\n');
  assert.equal(out(sh, './hello.sh x > out.txt; echo $?'), '3\n');
  assert.equal(file(sh, 'out.txt'), 'Hello, x!\nscript: ./hello.sh, args: 1\n- x\n');
  assert.equal(out(sh, 'bash hello.sh a', 3).split('\n')[1], 'script: hello.sh, args: 1');
  assert.equal(out(sh, './hello.sh a && echo ok || echo failed'), 'Hello, a!\nscript: ./hello.sh, args: 1\n- a\nfailed\n');
  out(sh, 'cd notes');
  assert.equal(out(sh, '../hello.sh up', 3).split('\n')[0], 'Hello, up!');
  assert.equal(out(sh, '~/hello.sh home', 3).split('\n')[0], 'Hello, home!');
});
test('scripts run in a child shell: cd and variables do not leak; source runs here', () => {
  const sh = fresh({ 'setup.sh': 'cd notes\nGREETING=hi\nexport SHARED=yes\n' });
  out(sh, 'bash setup.sh');
  assert.equal(sh.s.cwd, '/home/you');
  assert.equal(sh.getVar('GREETING'), undefined);
  out(sh, 'source setup.sh');
  assert.equal(sh.s.cwd, '/home/you/notes');
  assert.equal(sh.getVar('GREETING'), 'hi');
  out(sh, 'cd; . ./setup.sh');
  assert.equal(sh.s.cwd, '/home/you/notes');
  assert.match(err(sh, 'source nope.sh', 1), /nope.sh: No such file or directory/);
});
test('script errors carry the file name and line number', () => {
  const sh = fresh({
    'broken.sh': '#!/bin/bash\necho start\nnosuchcmd\necho after\n',
    'syntax.sh': '#!/bin/bash\necho a\nif [ 1 = 1 ]\n  echo b\nfi\n',
    'crlf.sh': '#!/bin/bash\r\necho hi\r\n',
    'py.sh': '#!/usr/bin/env python3\nprint(1)\n',
    'bad.sh': '#!/bin/bsh\necho x\n',
  });
  out(sh, 'chmod +x *.sh');
  const r = sh.run('./broken.sh');
  assert.equal(r.code, 0, 'a script carries on after a failed command and returns the last status');
  assert.equal(sh.lastOut, 'start\nafter\n');
  assert.equal(sh.lastErr, './broken.sh: line 3: nosuchcmd: command not found\n');
  assert.equal(err(sh, './syntax.sh', 2), "./syntax.sh: line 5: syntax error near unexpected token `fi'\n");
  assert.match(err(sh, './crlf.sh', 126), /\/bin\/bash\^M: bad interpreter/);
  assert.equal(err(sh, './py.sh', 127), "/usr/bin/env: 'python3': No such file or directory\n");
  assert.equal(err(sh, './bad.sh', 126), 'bash: ./bad.sh: /bin/bsh: bad interpreter: No such file or directory\n');
});
test('a script with if, for, while, read and arithmetic (a backup script)', () => {
  const sh = fresh({
    'backup.sh': [
      '#!/bin/bash',
      'if [ $# -lt 1 ]; then',
      '  echo "usage: $0 DIR" >&2',
      '  exit 1',
      'fi',
      'src=$1',
      'dest="backup-$src"',
      'mkdir -p "$dest"',
      'count=0',
      'for f in "$src"/*.txt; do',
      '  cp "$f" "$dest/"',
      '  count=$((count + 1))',
      'done',
      'echo "copied $count files to $dest"',
    ].join('\n'),
  });
  out(sh, 'chmod +x backup.sh');
  const r = sh.run('./backup.sh');
  assert.equal(r.code, 1);
  assert.equal(sh.lastErr, 'usage: ./backup.sh DIR\n');
  assert.equal(out(sh, './backup.sh notes'), 'copied 2 files to backup-notes\n');
  assert.deepEqual(sh.fs.names('/home/you/backup-notes'), ['done.txt', 'todo.txt']);
});
test('scripts get typed input through read', () => {
  const sh = fresh({ 'ask.sh': '#!/bin/bash\nread -p "Your name? " name\nif [ -z "$name" ]; then echo "no name"; exit 2; fi\necho "Hi, $name"\n' });
  const r = sh.run('bash ask.sh', { stdin: 'Grace\n' });
  assert.equal(r.code, 0);
  assert.equal(sh.lastOut, 'Hi, Grace\n');
  assert.equal(sh.run('bash ask.sh').code, 2);
  assert.equal(out(sh, 'echo Linus | bash ask.sh'), 'Hi, Linus\n');
});
test('bash -c and exit at the prompt', () => {
  const sh = fresh();
  assert.equal(out(sh, 'bash -c \'echo "$0 $1"\' name arg'), 'name arg\n');
  const r = sh.run('exit 5');
  assert.equal(r.code, 5);
  assert.ok(r.events.some((e) => e.type === 'exit'));
  assert.equal(out(sh, 'echo still here'), 'still here\n');
  assert.match(err(sh, 'exit abc', 2), /numeric argument required/);
});

/* ================================================================== aliases, history, misc */
test('alias, unalias, history, type', () => {
  const sh = fresh();
  out(sh, "alias ll='ls -l'");
  assert.match(out(sh, 'll notes'), /^total 8\n-rw-r--r--/);
  assert.equal(out(sh, 'alias'), "alias ll='ls -l'\n");
  assert.equal(out(sh, 'type ll'), "ll is aliased to `ls -l'\n");
  out(sh, "alias ls='ls -F'");
  assert.equal(out(sh, 'ls'), 'a.txt  b.log  notes/\n', 'an alias may call the command it shadows');
  out(sh, 'unalias ls');
  assert.equal(out(sh, 'ls'), 'a.txt  b.log  notes\n');
  sh.run('echo one');
  const n = sh.history.length;
  assert.equal(out(sh, 'history 2'), `${String(n).padStart(5)}  echo one\n${String(n + 1).padStart(5)}  history 2\n`);
  const sh2 = fresh({ 'a.sh': "alias hi='echo hi'\nhi\n" });
  assert.equal(sh2.run('bash a.sh').code, 127, 'aliases are off in scripts');
});
test('date with the fake clock, injectable clock, sleep', () => {
  const sh = fresh();
  assert.match(out(sh, 'date'), /^Mon Jan  5 09:\d\d:\d\d UTC 2026\n$/);
  assert.equal(out(sh, 'date +%Y-%m-%d'), '2026-01-05\n');
  const t = sh.s.time;
  out(sh, 'sleep 120');
  assert.ok(sh.s.time >= t + 120 + 60);
  const fixed = new Shell(null, { clock: () => Date.UTC(2030, 5, 1, 12, 30, 0) / 1000 });
  assert.equal(fixed.run('date "+%A %H:%M"').lines[0].t, 'Saturday 12:30');
  assert.equal(fixed.run('date "+%F %T"').lines[0].t, '2030-06-01 12:30:00');
  assert.equal(START_TIME, Date.UTC(2026, 0, 5, 9) / 1000);
});
test('whoami, hostname, uname, basename, dirname, realpath, man, --help', () => {
  const sh = fresh();
  assert.equal(out(sh, 'whoami; hostname; uname'), 'you\nlearn\nLinux\n');
  assert.equal(out(sh, 'basename /a/b/report.txt; basename /a/b/report.txt .txt; dirname /a/b/report.txt; dirname file'), 'report.txt\nreport\n/a/b\n.\n');
  assert.equal(out(sh, 'cd notes; realpath ../a.txt'), '/home/you/a.txt\n');
  assert.match(out(sh, 'man grep'), /grep - print lines that match a pattern/);
  assert.match(out(sh, 'grep --help'), /SYNOPSIS/);
  assert.equal(sh.run('man nosuch').code, 16);
  assert.match(out(sh, 'help'), /moving around/);
});
test('nano / vim emit an edit event; writeFile saves from the editor', () => {
  const sh = fresh();
  const r = sh.run('nano notes/new.md');
  assert.deepEqual(r.events, [{ type: 'edit', path: '/home/you/notes/new.md', name: 'notes/new.md', editor: 'nano' }]);
  sh.writeFile('notes/new.md', '# Title\n');
  assert.equal(file(sh, 'notes/new.md'), '# Title\n');
  assert.ok(sh.run('vim a.txt').lines.some((l) => /not simulated/.test(l.t)));
  assert.match(err(sh, 'nano nodir/x', 1), /No such file or directory/);
  assert.deepEqual(sh.run('clear').events, [{ type: 'clear' }]);
});

/* ================================================================== processes and jobs */
test('ps, background jobs, jobs, fg, kill', () => {
  const sh = fresh();
  assert.equal(out(sh, 'ps').split('\n')[0], '    PID TTY          TIME CMD');
  const r = sh.run('sleep 100 &');
  assert.match(r.lines[0].t, /^\[1\] \d+$/);
  out(sh, 'sleep 200 &');
  assert.equal(out(sh, 'jobs'), '[1]-  Running                 sleep 100 &\n[2]+  Running                 sleep 200 &\n');
  assert.match(out(sh, 'ps'), /sleep\n.*ps/);
  assert.equal(out(sh, 'fg %1'), 'sleep 100\n');
  const k = sh.run('kill %2');
  assert.ok(k.lines.some((l) => /\[2\]\+\s+Terminated\s+sleep 200/.test(l.t)));
  assert.equal(out(sh, 'jobs'), '');
  const done = sh.run('echo bg-output > bg.txt &');
  assert.ok(done.lines.some((l) => /Done/.test(l.t)));
  assert.equal(file(sh, 'bg.txt'), 'bg-output\n');
  assert.match(err(sh, 'kill 99999', 1), /\(99999\) - No such process/);
  assert.match(err(sh, 'fg', 1), /no such job/);
});
test('ps aux, kill PID, a stubborn process needs kill -9, pgrep and pkill', () => {
  const sh = fresh();
  const hog = sh.setupProcess('python3 crunch.py', { cpu: 98.5, mem: 12.1, stubborn: true });
  const web = sh.setupProcess('node server.js', { cpu: 1.2 });
  sh.setupDone();
  const aux = out(sh, 'ps aux');
  assert.match(aux, /^USER\s+PID %CPU %MEM/);
  assert.match(aux, new RegExp(`${hog}\\s+98\\.5\\s+12\\.1.*python3 crunch\\.py`));
  out(sh, `kill ${hog}`);
  assert.ok(sh.s.procs.some((p) => p.pid === hog), 'TERM is ignored by this one');
  out(sh, `kill -9 ${hog}`);
  assert.ok(!sh.s.procs.some((p) => p.pid === hog));
  assert.equal(out(sh, 'pgrep node'), `${web}\n`);
  out(sh, 'pkill node');
  assert.equal(sh.run('pgrep node').code, 1);
});

/* ================================================================== state, setup, views */
test('serialisation round-trip keeps files, cwd, variables, functions, aliases', () => {
  const sh = fresh();
  out(sh, 'mkdir proj; cd proj; echo data > f.txt; chmod 600 f.txt; v=1; export E=2; hi() { echo "hi $1"; }; alias l1="ls -1"');
  const json = JSON.stringify(sh.toJSON());
  const back = Shell.fromJSON(JSON.parse(json));
  assert.equal(back.s.cwd, '/home/you/proj');
  assert.equal(back.readFile('f.txt'), 'data\n');
  assert.match(back.run('ls -l f.txt').lines[0].t, /^-rw------- /);
  assert.equal(back.run('echo $v $E').lines[0].t, '1 2');
  assert.equal(back.run('hi there').lines[0].t, 'hi there');
  assert.equal(back.run('touch g; l1').lines.map((l) => l.t).join(','), 'f.txt,g');
  assert.equal(back.fingerprint() !== sh.fingerprint(), true);
  const c = sh.clone();
  c.run('rm f.txt');
  assert.equal(sh.readFile('f.txt'), 'data\n', 'clone is independent');
});
test('fingerprint ignores the clock: read-only commands change nothing', () => {
  const sh = fresh();
  const before = sh.fingerprint();
  sh.run('ls -la; cat a.txt; pwd; grep x a.txt; echo hi');
  assert.equal(sh.fingerprint(), before);
  sh.run('touch z');
  assert.notEqual(sh.fingerprint(), before);
});
test('buildShell / setupFiles: folders, modes, cwd, env, setupDone', () => {
  const sh = buildShell({
    files: { 'proj/src/': null, 'proj/run.sh': { content: '#!/bin/bash\necho ok', mode: 0o755 }, '/tmp/scratch.txt': 'x' },
    cwd: 'proj', env: { EDITOR: 'nano' },
  });
  assert.equal(sh.s.cwd, '/home/you/proj');
  assert.ok(sh.fs.isDir('/home/you/proj/src'));
  assert.equal(sh.run('./run.sh').lines[0].t, 'ok');
  assert.equal(sh.run('cat /tmp/scratch.txt').lines[0].t, 'x');
  assert.equal(sh.run('printenv EDITOR').lines[0].t, 'nano');
  assert.deepEqual(new Shell().sh('mkdir x').ok, true);
  assert.throws(() => new Shell().sh('cat nope'), /setup command failed/);
  const s2 = new Shell();
  s2.sh('echo hi');
  s2.setupDone();
  assert.deepEqual(s2.history, []);
  assert.equal(s2.lastOut, '');
});
test('treeView for the files panel and completions', () => {
  const sh = fresh();
  out(sh, 'cd notes');
  const t = sh.treeView();
  assert.equal(t.name, '~');
  assert.deepEqual(t.children.map((c) => c.name), ['a.txt', 'b.log', 'notes']);
  const notes = t.children.find((c) => c.name === 'notes');
  assert.equal(notes.cwd, true);
  assert.equal(notes.open, true);
  assert.deepEqual(notes.children.map((c) => c.name), ['done.txt', 'todo.txt']);
  assert.ok(sh.treeView({ hidden: true }).children.some((c) => c.name === '.secret'));
  const comp = sh.completions();
  assert.ok(comp.shell.includes('grep') && comp.shell.includes('cd'));
  assert.deepEqual(comp.files, ['done.txt', 'todo.txt']);
  out(sh, 'cd');
  assert.deepEqual(sh.completePath('no'), ['notes/']);
  assert.deepEqual(sh.completePath('notes/t'), ['notes/todo.txt']);
  assert.deepEqual(sh.completePath('/et'), ['/etc/']);
});
test('run() result shape mirrors git.js: lines with classes, ok, code, events', () => {
  const sh = fresh();
  const r = sh.run('echo out; echo err >&2; nope');
  assert.deepEqual(r.lines.map((l) => l.c), ['', 'err', 'err', 'hint'].slice(0, r.lines.length));
  assert.equal(r.ok, false);
  assert.equal(r.code, 127);
  assert.deepEqual(r.events, []);
  assert.equal(sh.lastOut, 'out\n');
  assert.equal(sh.lastErr, 'err\nbash: nope: command not found\n');
  assert.deepEqual(sh.history.slice(-1), ['echo out; echo err >&2; nope']);
});
test('the step cap stops runaway work', () => {
  const sh = fresh();
  const r = sh.run('for i in $(seq 1 30000); do :; done');
  assert.equal(r.code, 1);
  assert.match(sh.lastErr, /sandbox limit/);
});
