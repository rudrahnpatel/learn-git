// Bash unit 10: Conditions and loops. if and [ ] (file tests, numbers, text, why the spaces matter), else and
// elif, for loops (words, globs, {1..5}, $(seq), renaming with ${f%.txt}), while loops and reading a file line by
// line, functions (arguments, local, return). `[[ ]]` and `case` are out of the engine's scope, so they are not taught.
import { isDir, cwdIs, fileText, fileLines, lineCount, listOf, hasFunction, lastOutIs, runOutIs } from './helpers.js';

const S = (body) => `#!/bin/bash\n${body}`;
// A yard: notes, a log, a list of names, photos, and in the first set a build/ folder. `v` gives other data.
const yard = (v = 0) => (sh) => sh.setupFiles(v ? {
  'notes.txt': 'one\ntwo\n', 'todo.txt': 'a\nb\nc\nd\ne\nf\ng\n',
  'app.log': '10:00 INFO up\n10:01 ERROR disk\n10:02 ERROR disk\n10:03 ERROR net\n10:04 INFO ok\n',
  'names.txt': 'Grace\nLinus\nMargaret\nKen\n', 'photos/a.jpg': '', 'docs/': null,
} : {
  'notes.txt': 'Learn bash\nWater the plants\nCall mum\n', 'todo.txt': 'fix the sink\n',
  'app.log': '09:00 INFO start\n09:12 ERROR no disk space\n09:13 INFO retry\n',
  'names.txt': 'Ada\nBo\n', 'photos/cat.jpg': '', 'build/app.js': 'start()\n', 'docs/': null,
});
// Drafts to rename: each file says what it was called, and a hidden .count says how many there are.
const drafts = (v = 0) => (sh) => {
  const names = v ? ['intro', 'ch1', 'ch2', 'outro'] : ['plan', 'shopping list', 'ideas'];
  sh.setupFiles(Object.fromEntries([...names.map((n) => [`drafts/${n}.txt`, `was ${n}.txt\n`]), ['drafts/.count', `${names.length}\n`]]));
};
// Text files of different lengths, and config files for the puzzle.
const sized = (v = 0) => (sh) => sh.setupFiles(v ? {
  'a.txt': 'x\n', 'b.txt': 'x\nx\nx\nx\nx\n', 'c.txt': 'x\nx\nx\nx\n',
  'notes/one.txt': 'a\nb\n', 'notes/two.txt': 'c\n', 'notes/three.txt': 'd\ne\nf\ng\n', 'notes/pic.jpg': '',
  'config/app.conf': 'port=80\n', 'config/db.conf': 'host=db\n', 'config/cache.conf': 'size=9\n', 'config/readme.txt': 'hi\n',
} : {
  'a.txt': 'x\nx\nx\nx\nx\nx\n', 'b.txt': 'x\nx\n', 'c.txt': 'x\nx\nx\nx\nx\nx\nx\nx\n',
  'notes/plan.txt': 'Learn bash\nWrite a script\nRest\n', 'notes/todo.txt': 'Buy milk\n',
  'config/web.conf': 'port=8080\n', 'config/mail.conf': 'host=mail\n', 'config/notes.txt': 'hi\n',
});

const errorCount = (sh) => fileLines(sh, 'app.log').filter((l) => /ERROR/.test(l)).length;

export default {
  id: 'bash-flow', title: 'Conditions and loops', color: 'pink',
  blurb: 'Let scripts decide, repeat, and reuse their own commands.',
  challenges: [
    {
      id: 'bash-nightshift', title: 'Night shift', blurb: 'A line count for a whole folder, and backups of every config file.',
      exercises: [
        {
          id: 'flc-sizes', type: 'script',
          prompt: 'Write <code>sizes.sh DIR</code>: for each .txt file in DIR it prints <code>PATH: N lines</code> (the path as the loop gives it, like <code>notes/plan.txt</code>), then a last line <code>Total: T</code>.',
          file: 'sizes.sh',
          setup: sized(), variant: sized(1),
          runs: [{ args: ['notes'] }],
          starter: S('# Usage: sizes.sh DIR\n'),
          solution: S('# Usage: sizes.sh DIR\ntotal=0\nfor f in "$1"/*.txt; do\n  n=$(wc -l < "$f")\n  echo "$f: $n lines"\n  total=$((total + n))\ndone\necho "Total: $total"\n'),
          check: (sh) => {
            const fs = listOf(sh, 'notes').filter((n) => n.endsWith('.txt'));
            return runOutIs(sh, 0, [...fs.map((n) => `notes/${n}: ${lineCount(sh, `notes/${n}`)} lines`), `Total: ${fs.reduce((s, n) => s + lineCount(sh, `notes/${n}`), 0)}`]);
          },
          explain: 'A <code>for</code> over <code>"$1"/*.txt</code>, <code>n=$(wc -l < "$f")</code> per file, <code>total=$((total + n))</code> to add up, and the total after <code>done</code>.',
        },
        {
          id: 'flc-conf', type: 'type', max: 6,
          prompt: 'Make a backup copy of every <code>.conf</code> file in <code>config</code>, next to it, named with <code>.bak</code> added (<code>config/web.conf.bak</code>).',
          setup: sized(), variant: sized(1),
          check: (sh) => {
            const confs = listOf(sh, 'config').filter((n) => n.endsWith('.conf'));
            return confs.length > 0 && confs.every((n) => fileText(sh, `config/${n}.bak`) === fileText(sh, `config/${n}`)) && !listOf(sh, 'config').some((n) => n.endsWith('.txt.bak'));
          },
          solution: 'for f in config/*.conf; do cp "$f" "$f.bak"; done',
          explain: '<code>for f in config/*.conf; do cp "$f" "$f.bak"; done</code>. The glob picks only the .conf files; the second set of files has other names.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-flow-1', title: 'if and test',
      exercises: [
        {
          id: 'fl1-if', type: 'learn', new: true, title: '<code>if</code>: only when it worked',
          body: '<code>if CMD; then … fi</code> runs the lines between <code>then</code> and <code>fi</code> only when CMD succeeds (exit status 0): <code>if grep -q ERROR app.log; then echo "Errors!"; fi</code>. <code>fi</code> is if backwards.',
          demo: { setup: yard(), run: ['if grep -q ERROR app.log; then echo "Errors!"; fi'] },
        },
        {
          id: 'fl1-test', type: 'learn', new: true, title: '<code>[ ]</code>: the test command',
          body: '<code>[ -f notes.txt ]</code> succeeds when notes.txt is a file, <code>[ -d photos ]</code> when photos is a folder, <code>[ -e x ]</code> when x exists at all. <code>[ ! -d x ]</code> flips it. <code>[</code> is a command: it needs spaces.',
          teaches: ['[ ] needs spaces'],
          demo: { setup: yard(), run: ['[ -f notes.txt ] && echo "a file"', 'if [ -d photos ]; then echo "a folder"; fi', '[ ! -d backup ] && echo "no backup yet"'] },
        },
        {
          id: 'fl1-match', type: 'match',
          prompt: 'Match each test to when it succeeds.',
          pairs: [['[ -f x ]', 'x is a file'], ['[ -d x ]', 'x is a folder'], ['[ -e x ]', 'x exists, file or folder'], ['[ ! -e x ]', 'There is no x']],
          explain: 'f for file, d for directory, e for exists; <code>!</code> flips the answer.',
        },
        {
          id: 'fl1-num', type: 'learn', new: true, title: 'Numbers and text',
          body: 'Numbers compare with <code>-eq</code> <code>-ne</code> <code>-lt</code> <code>-le</code> <code>-gt</code> <code>-ge</code>: <code>[ "$n" -gt 10 ]</code>. Text compares with <code>=</code> and <code>!=</code>: <code>[ "$answer" = yes ]</code>. <code>-z "$s"</code> is true when s is empty. Quote the variables.',
          teaches: ['number vs text tests'],
          demo: { setup: yard(), run: ['n=42', '[ "$n" -gt 10 ] && echo "more than 10"', 'answer=yes', '[ "$answer" = yes ] && echo "said yes"'] },
        },
        {
          id: 'fl1-spaces', type: 'choice',
          prompt: 'Why does this fail?',
          code: '$ n=3\n$ if [$n -gt 1]; then echo big; fi\nbash: [3: command not found',
          options: ['Without spaces, [ and $n make one word, [3, which is no command', '-gt only works on text', 'n must be quoted as "n"', 'if needs an else'],
          answer: 0,
          needs: ['[ ] needs spaces'],
          explain: 'Write <code>[ $n -gt 1 ]</code>: spaces after <code>[</code> and before <code>]</code>.',
        },
        {
          id: 'fl1-outcome', type: 'outcome', new: true,
          prompt: '<code>notes.txt</code> is a file. What does this print?',
          setup: yard(),
          command: 'if [ -d notes.txt ]; then echo folder; fi; echo done',
          show: 'output',
          distractors: [['if [ -f notes.txt ]; then echo folder; fi; echo done'], ['if [ -e notes.txt ]; then echo folder; fi']],
          explain: 'notes.txt is not a folder, so the test fails and only <code>echo done</code> (after <code>fi</code>) runs.',
        },
        {
          id: 'fl1-fill', type: 'fill',
          prompt: 'Run the next lines only when <code>$count</code> is more than 100.',
          before: 'if [ "$count" ', after: ' 100 ]; then',
          options: ['-gt', '>', '-lt', '='],
          answer: 0,
          needs: ['number vs text tests'],
          explain: '<code>-gt</code> is "greater than" for numbers. Inside <code>[ ]</code>, <code>></code> would be read as a redirect into a file called 100.',
        },
        {
          id: 'fl1-build', type: 'build',
          prompt: 'Build the test that succeeds when <code>backup</code> is a folder.',
          tiles: ['[', '-d', 'backup', ']', '-f', '[backup]'],
          answers: [['[', '-d', 'backup', ']']],
          needs: ['[ ] needs spaces'],
          explain: 'Four separate words: <code>[ -d backup ]</code>.',
        },
        {
          id: 'fl1-type-errors', type: 'type',
          prompt: 'If <code>app.log</code> contains ERROR, print <code>Errors: N</code> with the number of ERROR lines. Use <code>if</code>.',
          setup: yard(), variant: yard(1),
          check: (sh) => lastOutIs(sh, `Errors: ${errorCount(sh)}`),
          solution: 'if grep -q ERROR app.log; then echo "Errors: $(grep -c ERROR app.log)"; fi',
          explain: '<code>if grep -q ERROR app.log; then echo "Errors: $(grep -c ERROR app.log)"; fi</code>.',
        },
        {
          id: 'fl1-script-spaces', type: 'script',
          prompt: '<code>warn.sh FILE</code> should print <code>FILE is long</code> when the file has more than 5 lines, but it never does. Fix it.',
          file: 'warn.sh',
          setup: sized(),
          runs: [{ args: ['b.txt'] }, { args: ['c.txt'] }],
          starter: S('# Usage: warn.sh FILE\nif [$(wc -l < "$1") -gt 5]; then\n  echo "$1 is long"\nfi\n'),
          solution: S('# Usage: warn.sh FILE\nif [ $(wc -l < "$1") -gt 5 ]; then\n  echo "$1 is long"\nfi\n'),
          check: (sh) => sh.runs?.length === 2 && sh.runs.every((r) => r.out.trim() === (lineCount(sh, r.args[0]) > 5 ? `${r.args[0]} is long` : '')),
          explain: '<code>[$(wc …)</code> glues the bracket to the number (bash looks for a command called <code>[8</code>). Put spaces after <code>[</code> and before <code>]</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-flow-2', title: 'elif and else',
      exercises: [
        {
          id: 'fl2-else', type: 'learn', new: true, title: '<code>else</code>: otherwise',
          body: '<code>if TEST; then A; else B; fi</code> runs A when the test passes and B when it doesn\'t. Exactly one of the two runs.',
          demo: { setup: yard(), run: ['if [ -f notes.txt ]; then echo "found"; else echo "missing"; fi', 'if [ -f plan.txt ]; then echo "found"; else echo "missing"; fi'] },
        },
        {
          id: 'fl2-elif', type: 'learn', new: true, title: '<code>elif</code>: more cases',
          body: '<code>elif</code> adds another test, tried only when the ones above it failed. The first test that passes wins; <code>else</code> catches the rest: <code>if [ $n -gt 100 ]; then echo big; elif [ $n -gt 10 ]; then echo medium; else echo small; fi</code>.',
          teaches: ['first match wins'],
          demo: { setup: yard(), run: ['n=42', 'if [ $n -gt 100 ]; then echo big; elif [ $n -gt 10 ]; then echo medium; else echo small; fi'] },
        },
        {
          id: 'fl2-outcome', type: 'outcome', new: true,
          prompt: '<code>n</code> holds 7. What does this print?',
          setup: (sh) => sh.setupEnv({ n: '7' }, { exported: false }),
          command: 'if [ "$n" -gt 10 ]; then echo big; elif [ "$n" -gt 5 ]; then echo medium; else echo small; fi',
          show: 'output',
          distractors: [['n=50', 'if [ "$n" -gt 10 ]; then echo big; elif [ "$n" -gt 5 ]; then echo medium; else echo small; fi'], ['n=1', 'if [ "$n" -gt 10 ]; then echo big; elif [ "$n" -gt 5 ]; then echo medium; else echo small; fi']],
          explain: '7 is not more than 10, so elif is tried: 7 is more than 5.',
        },
        {
          id: 'fl2-first', type: 'choice',
          prompt: '<code>n</code> is 500. What does this print?',
          code: 'if [ $n -gt 10 ]; then\n  echo "over 10"\nelif [ $n -gt 100 ]; then\n  echo "over 100"\nfi',
          options: ['over 10', 'over 100', 'over 10 and over 100', 'Nothing'],
          answer: 0,
          needs: ['first match wins'],
          explain: 'The first test that passes wins, so the elif is never tried. Put the stricter test first.',
        },
        {
          id: 'fl2-match', type: 'match',
          prompt: 'Match each word to its job.',
          pairs: [['if', 'Starts the first test'], ['then', 'What to run when the test passed'], ['else', 'What to run when every test failed'], ['fi', 'Ends the whole if']],
          explain: 'Every <code>if</code> needs its <code>then</code> and its <code>fi</code>; <code>elif</code> and <code>else</code> are optional.',
        },
        {
          id: 'fl2-order', type: 'order',
          prompt: 'Put the lines of this grading script in order.',
          steps: ['if [ "$1" -ge 50 ]; then', 'echo pass', 'else', 'echo fail', 'fi'],
          explain: 'if, then its lines, else, its lines, fi.',
        },
        {
          id: 'fl2-fill', type: 'fill',
          prompt: 'Say whether <code>$1</code> is a folder or not.',
          before: 'if [ -d "$1" ]; then echo folder; ', after: ' echo "not a folder"; fi',
          options: ['else', 'elif', 'then', 'fi'],
          answer: 0,
          explain: '<code>else</code> needs no test of its own.',
        },
        {
          id: 'fl2-type-ready', type: 'type',
          prompt: 'Print <code>ready</code> if there is a <code>build</code> folder here, otherwise <code>not built</code>.',
          setup: yard(), variant: yard(1),
          check: (sh) => lastOutIs(sh, isDir(sh, 'build') ? 'ready' : 'not built'),
          solution: 'if [ -d build ]; then echo ready; else echo "not built"; fi',
          explain: '<code>if [ -d build ]; then echo ready; else echo "not built"; fi</code>. The second set of files has no build folder.',
        },
        {
          id: 'fl2-script-kind', type: 'script',
          prompt: 'Finish <code>kind.sh PATH</code>: it should print <code>PATH: folder</code>, <code>PATH: file</code>, or <code>PATH: missing</code>.',
          file: 'kind.sh',
          setup: yard(),
          runs: [{ args: ['docs'] }, { args: ['notes.txt'] }, { args: ['nope'] }],
          starter: S('# Usage: kind.sh PATH\nif [ -d "$1" ]; then\n  echo "$1: folder"\nfi\n'),
          solution: S('# Usage: kind.sh PATH\nif [ -d "$1" ]; then\n  echo "$1: folder"\nelif [ -f "$1" ]; then\n  echo "$1: file"\nelse\n  echo "$1: missing"\nfi\n'),
          check: (sh) => runOutIs(sh, 0, 'docs: folder') && runOutIs(sh, 1, 'notes.txt: file') && runOutIs(sh, 2, 'nope: missing'),
          explain: 'An <code>elif [ -f "$1" ]</code> for files, and an <code>else</code> for everything left.',
        },
        {
          id: 'fl2-script-usage', type: 'script',
          prompt: 'Make <code>greet.sh</code> print <code>Usage: greet.sh NAME</code> and exit with status 1 when it gets no argument.',
          file: 'greet.sh',
          setup: yard(),
          runs: [{ args: ['Ada'] }, { args: [], code: 1 }],
          starter: S('# Usage: greet.sh NAME\necho "Hello, $1!"\n'),
          solution: S('# Usage: greet.sh NAME\nif [ $# -eq 0 ]; then\n  echo "Usage: greet.sh NAME"\n  exit 1\nfi\necho "Hello, $1!"\n'),
          check: (sh) => runOutIs(sh, 0, 'Hello, Ada!') && sh.runs[1].code === 1 && /Usage: greet\.sh NAME/.test(sh.runs[1].out + sh.runs[1].err) && !/Hello/.test(sh.runs[1].out),
          explain: '<code>if [ $# -eq 0 ]; then</code> print the usage line and <code>exit 1</code>, before the greeting. (<code>[ -z "$1" ]</code> works too.)',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-flow-3', title: 'for loops',
      exercises: [
        {
          id: 'fl3-for', type: 'learn', new: true, title: '<code>for</code>: once per item',
          body: '<code>for f in notes.txt todo.txt; do wc -l "$f"; done</code> runs the body once per word, with <code>$f</code> set to it each time. <code>do</code> and <code>done</code> wrap the body.',
          demo: { setup: yard(), run: ['for f in notes.txt todo.txt; do wc -l "$f"; done'] },
        },
        {
          id: 'fl3-lists', type: 'learn', new: true, title: 'Files, numbers, output',
          body: 'The list can be a glob, <code>for f in *.txt</code> (every matching name), a range, <code>for i in {1..5}</code>, or a command\'s output: <code>for n in $(seq 2 2 10)</code> counts 2, 4, 6, 8, 10.',
          demo: { setup: yard(), run: ['for i in {1..3}; do echo "Round $i"; done', 'for f in *.txt; do echo "found $f"; done', 'for n in $(seq 2 2 6); do echo $n; done'] },
        },
        {
          id: 'fl3-outcome', type: 'outcome', new: true,
          prompt: 'This folder has <code>a.txt</code>, <code>b.txt</code> and <code>c.md</code>. What does this print?',
          setup: (sh) => sh.setupFiles({ 'a.txt': '', 'b.txt': '', 'c.md': '' }),
          command: 'for f in *.txt; do echo "file: $f"; done',
          show: 'output',
          distractors: [['for f in *; do echo "file: $f"; done'], ['for f in "*.txt"; do echo "file: $f"; done']],
          explain: 'The glob becomes the two .txt names, so the body runs twice. Quoted, <code>"*.txt"</code> would stay one literal word.',
        },
        {
          id: 'fl3-times', type: 'choice',
          prompt: 'How many times does the body of <code>for x in "a b" c; do echo $x; done</code> run?',
          options: ['2', '3', '1', '4'],
          answer: 0,
          needs: ['quote your variables'],
          explain: 'The quotes make "a b" one word, so the list is "a b" and c.',
        },
        {
          id: 'fl3-trim', type: 'learn', new: true, title: '<code>${f%.txt}</code>: cut off the end',
          body: '<code>${f%.txt}</code> is <code>$f</code> without a <code>.txt</code> at its end. So <code>for f in *.txt; do mv "$f" "${f%.txt}.md"; done</code> renames every .txt file to .md.',
          demo: { setup: yard(), run: ['f=notes.txt', 'echo "${f%.txt}.md"', 'for f in *.txt; do mv "$f" "${f%.txt}.md"; done', 'ls'] },
        },
        {
          id: 'fl3-match', type: 'match',
          prompt: 'With <code>f=report.txt</code>, match each one to what it gives.',
          pairs: [['${f%.txt}', 'report'], ['${f%.txt}.md', 'report.md'], ['$f.bak', 'report.txt.bak'], ['$(seq 2 2 6)', '2 4 6']],
          explain: '<code>%</code> trims from the end; anything after the braces is just added on.',
        },
        {
          id: 'fl3-fill', type: 'fill',
          prompt: 'Copy every .jpg file into <code>backup/</code>.',
          before: 'for f in *.jpg; ', after: ' cp "$f" backup/; done',
          options: ['do', 'then', 'in', '{'],
          answer: 0,
          explain: '<code>for … in …; do … done</code>. <code>then</code> belongs to if.',
        },
        {
          id: 'fl3-type-rename', type: 'type',
          prompt: 'Rename every <code>.txt</code> file in <code>drafts</code> to end in <code>.md</code> instead.',
          setup: drafts(), variant: drafts(1),
          check: (sh) => {
            const names = listOf(sh, 'drafts').filter((n) => !n.startsWith('.'));
            return names.length === Number(fileLines(sh, 'drafts/.count')[0]) && names.every((n) => n.endsWith('.md') && fileText(sh, `drafts/${n}`) === `was ${n.slice(0, -3)}.txt\n`);
          },
          solution: 'for f in drafts/*.txt; do mv "$f" "${f%.txt}.md"; done',
          explain: '<code>for f in drafts/*.txt; do mv "$f" "${f%.txt}.md"; done</code>. The quotes matter: one of the names has a space.',
        },
        {
          id: 'fl3-script-all', type: 'script',
          prompt: '<code>backup.sh</code> should save a <code>.bak</code> copy of <b>every</b> file it is given, but it only handles the first. Make it loop over all its arguments.',
          file: 'backup.sh',
          setup: (sh) => sh.setupFiles({ 'a.txt': 'A\n', 'b.txt': 'B\n', 'my notes.txt': 'N\n' }),
          runs: [{ args: ['a.txt', 'my notes.txt'] }, { args: ['b.txt'] }],
          starter: S('# Usage: backup.sh FILE...\ncp "$1" "$1.bak"\necho "Saved $1.bak"\n'),
          solution: S('# Usage: backup.sh FILE...\nfor f in "$@"; do\n  cp "$f" "$f.bak"\n  echo "Saved $f.bak"\ndone\n'),
          check: (sh) => sh.runs?.length === 2 && sh.runs.every((r) => r.args.every((a) => fileText(sh, `${a}.bak`) === fileText(sh, a)) && runOutIs(sh, sh.runs.indexOf(r), r.args.map((a) => `Saved ${a}.bak`))),
          explain: '<code>for f in "$@"; do … done</code>, with <code>$f</code> in place of <code>$1</code>, quoted for the name with a space.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-flow-4', title: 'while and read',
      exercises: [
        {
          id: 'fl4-while', type: 'learn', new: true, title: '<code>while</code>: as long as it\'s true',
          body: '<code>while TEST; do … done</code> repeats the body as long as the test passes. Something inside must change, or it never stops: <code>n=1; while [ $n -le 3 ]; do echo $n; n=$((n + 1)); done</code>.',
          teaches: ['a loop must change something'],
          demo: { setup: yard(), run: ['n=1; while [ $n -le 3 ]; do echo $n; n=$((n + 1)); done'] },
        },
        {
          id: 'fl4-forever', type: 'choice',
          prompt: 'Why does this loop never end?',
          code: 'n=1\nwhile [ $n -le 3 ]; do\n  echo $n\ndone',
          options: ['n never changes, so the test always passes', 'while needs a then', '-le only works on text', 'echo stops the loop'],
          answer: 0,
          needs: ['a loop must change something'],
          explain: 'Add <code>n=$((n + 1))</code> inside the body.',
        },
        {
          id: 'fl4-read', type: 'learn', new: true, title: 'Read a file line by line',
          body: '<code>read -r line</code> reads one line into <code>$line</code>. In <code>while read -r line; do … done < names.txt</code>, the <code><</code> after done feeds the file in: one line per round, and the loop stops at the end of the file.',
          demo: { setup: yard(), run: ['while read -r line; do echo "Hi $line"; done < names.txt'] },
        },
        {
          id: 'fl4-outcome', type: 'outcome', new: true,
          prompt: '<code>names.txt</code> has two lines. What does this print?',
          setup: yard(),
          command: 'n=0; while read -r line; do n=$((n + 1)); done < names.txt; echo $n',
          show: 'output',
          distractors: [['wc -l names.txt'], ['cat names.txt']],
          explain: 'One round per line, so n ends at 2.',
        },
        {
          id: 'fl4-stop', type: 'choice',
          prompt: 'What ends a <code>while read -r line; do … done < list.txt</code> loop?',
          options: ['read fails at the end of the file', 'You have to add a counter', 'It stops after 10 lines', 'Ctrl+C, every time'],
          answer: 0,
          explain: 'With no line left, <code>read</code> fails, so the while test fails and the loop ends.',
        },
        {
          id: 'fl4-match', type: 'match',
          prompt: 'Match each piece to what it does.',
          pairs: [['while [ $n -lt 5 ]', 'Repeat while n is below 5'], ['read -r line', 'Read one line into $line'], ['done < list.txt', 'Feed list.txt into the loop'], ['n=$((n + 1))', 'Add one to n']],
          explain: 'A counting loop changes n; a reading loop ends when the file runs out.',
        },
        {
          id: 'fl4-fill', type: 'fill',
          prompt: 'Greet every name in <code>names.txt</code>.',
          before: 'while read -r name; do echo "Hi $name"; done ', after: ' names.txt',
          options: ['<', '>', '|', '<<'],
          answer: 0,
          explain: '<code><</code> reads from the file. <code>></code> would empty it.',
        },
        {
          id: 'fl4-type-hello', type: 'type',
          prompt: 'Print each name in <code>names.txt</code> as <code>Hello, NAME!</code>, one per line.',
          setup: yard(), variant: yard(1),
          check: (sh) => lastOutIs(sh, fileLines(sh, 'names.txt').map((n) => `Hello, ${n}!`)),
          solution: 'while read -r n; do echo "Hello, $n!"; done < names.txt',
          explain: '<code>while read -r n; do echo "Hello, $n!"; done < names.txt</code>.',
        },
        {
          id: 'fl4-script-countdown', type: 'script',
          prompt: '<code>countdown.sh N</code> should count down from N to 1, then print <code>Liftoff</code>. It never ends. Fix it.',
          file: 'countdown.sh',
          setup: () => {},
          runs: [{ args: ['3'] }, { args: ['5'] }],
          starter: S('# Usage: countdown.sh N\nn=$1\nwhile [ $n -gt 0 ]; do\n  echo $n\ndone\necho "Liftoff"\n'),
          solution: S('# Usage: countdown.sh N\nn=$1\nwhile [ $n -gt 0 ]; do\n  echo $n\n  n=$((n - 1))\ndone\necho "Liftoff"\n'),
          check: (sh) => sh.runs?.length === 2 && sh.runs.every((r, i) => runOutIs(sh, i, [...Array.from({ length: +r.args[0] }, (_, k) => String(+r.args[0] - k)), 'Liftoff'])),
          explain: 'Nothing changed n, so <code>[ $n -gt 0 ]</code> stayed true. <code>n=$((n - 1))</code> in the body counts it down. (The sandbox stops a loop after 1000 rounds; a real terminal would need Ctrl+C.)',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'bash-flow-5', title: 'Functions',
      exercises: [
        {
          id: 'fl5-func', type: 'learn', new: true, title: 'Functions: name some lines',
          body: '<code>greet() { echo "Hi $1"; }</code> defines a new command, greet. Call it like any other: <code>greet Ada</code>. Inside it, <code>$1</code> is the function\'s own first argument, not the script\'s.',
          teaches: ['function arguments'],
          demo: { setup: yard(), run: ['greet() { echo "Hi $1"; }', 'greet Ada', 'greet Bo'] },
        },
        {
          id: 'fl5-local', type: 'learn', new: true, title: '<code>local</code> and <code>return</code>',
          body: 'A variable set in a function is shared with the whole script, unless you write <code>local x=…</code>. <code>return 1</code> ends the function with status 1, as <code>exit</code> does for a script, so <code>if myfunc; then</code> works.',
          teaches: ['local stays inside'],
          demo: { setup: yard(), run: ['x=outside', 'show() { local x=inside; echo $x; }', 'show', 'echo $x'] },
        },
        {
          id: 'fl5-shared', type: 'choice',
          prompt: 'What does the last line print?',
          code: 'x=1\nset_x() { x=2; }\nset_x\necho $x',
          options: ['2', '1', 'Nothing', 'set_x'],
          answer: 0,
          needs: ['local stays inside'],
          explain: 'Without <code>local</code>, the function changed the script\'s own x.',
        },
        {
          id: 'fl5-own', type: 'choice',
          prompt: 'A script run as <code>./s.sh Ada</code> calls <code>greet Bo</code>. Inside greet, what is <code>$1</code>?',
          options: ['Bo', 'Ada', 'greet', 'Empty'],
          answer: 0,
          needs: ['function arguments'],
          explain: 'A function gets its own arguments. The script\'s Ada is out of sight until greet returns.',
        },
        {
          id: 'fl5-outcome', type: 'outcome', new: true,
          prompt: 'What does this print?',
          setup: () => {},
          command: 'shout() { echo "$1!"; }; shout hi; shout bye',
          show: 'output',
          distractors: [['shout() { echo "$@!"; }; shout hi bye'], ['shout() { echo "$1!"; }; shout hi bye']],
          explain: 'Each call gets its own <code>$1</code>: hi, then bye.',
        },
        {
          id: 'fl5-match', type: 'match',
          prompt: 'Match each line to what it does.',
          pairs: [['name() { … }', 'Defines a function'], ['name Ada', 'Calls it with one argument'], ['local x=1', 'x exists only inside the function'], ['return 1', 'Ends the function with status 1']],
          needs: ['local stays inside', 'function arguments'],
          explain: 'A function is a small script inside your script.',
        },
        {
          id: 'fl5-fill', type: 'fill',
          prompt: 'Define a function called backup.',
          before: 'backup', after: ' { cp "$1" "$1.bak"; }',
          options: ['()', '[]', '{}', '$()'],
          answer: 0,
          explain: 'A name, <code>()</code>, then the body in braces.',
        },
        {
          id: 'fl5-type-mkcd', type: 'type',
          prompt: 'Define a function <code>mkcd</code> that makes a folder (parents too) and moves into it. Then use it to make and enter <code>projects/new</code>.',
          setup: yard(),
          check: (sh) => hasFunction(sh, 'mkcd') && isDir(sh, 'projects/new') && cwdIs(sh, 'projects/new'),
          solution: 'mkcd() { mkdir -p "$1" && cd "$1"; }\nmkcd projects/new',
          explain: '<code>mkcd() { mkdir -p "$1" && cd "$1"; }</code>, then <code>mkcd projects/new</code>. A function runs in your shell, so its cd sticks (a script\'s would not).',
        },
        {
          id: 'fl5-script-big', type: 'script',
          prompt: 'In <code>sizes.sh</code>, the function <code>is_big</code> always fails. Make it succeed when the file <code>$1</code> has more than 5 lines.',
          file: 'sizes.sh',
          setup: sized(), variant: sized(1),
          runs: [{ args: ['a.txt', 'b.txt', 'c.txt'] }],
          starter: S('# Usage: sizes.sh FILE...\nis_big() {\n  return 1\n}\nfor f in "$@"; do\n  if is_big "$f"; then echo "$f: big"; else echo "$f: small"; fi\ndone\n'),
          solution: S('# Usage: sizes.sh FILE...\nis_big() {\n  [ $(wc -l < "$1") -gt 5 ]\n}\nfor f in "$@"; do\n  if is_big "$f"; then echo "$f: big"; else echo "$f: small"; fi\ndone\n'),
          check: (sh) => runOutIs(sh, 0, ['a.txt', 'b.txt', 'c.txt'].map((f) => `${f}: ${lineCount(sh, f) > 5 ? 'big' : 'small'}`)),
          explain: 'A function\'s status is its last command\'s, so a bare test works: <code>[ $(wc -l < "$1") -gt 5 ]</code>. (<code>return 0</code> / <code>return 1</code> in an if/else says the same.)',
        },
      ],
    },
  ],
};
