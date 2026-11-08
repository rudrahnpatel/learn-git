// Bash unit 5: Searching. grep and its exit status, grep's options, patterns (BRE and -E), grep -r, find, and acting
// on what find found (-delete, -exec, xargs).
import { isFile, isDir, listOf, filesUnder, lastOut, lastOutIs, printedNumber, printedPaths, printedHits, linesWith, fileLines, logLines } from './helpers.js';

// A small project in the home folder: a log, a to-do list, a word list for patterns, code with TODO notes.
// `v` gives other names, contents and counts (the anti-cheat replay).
const project = (v = 0) => (sh) => sh.setupFiles(v ? {
  'app.log': logLines(23, 4),
  'todo.txt': 'Fix the gate\nwalk the dog\nfix lunch\npay rent\nFIX the tap\n',
  'words.txt': 'cow\ncrow\ncot\nscot\nclock\narc\ncocoa\ntic\nhot\n',
  'src/main.js': '// TODO: menu\nmenu()\n', 'src/api.js': 'fetch(url)\n',
  'src/lib/math.js': '// TODO round\n// todo floor\n', 'src/lib/str.js': '// Todo trim\n',
  'docs/guide.md': '# Guide\nSee main.js\n',
  'report-2023.txt': '', 'photo-2024.jpg': '', 'report-2024.txt': '', 'notes-2024.txt': '',
} : {
  'app.log': logLines(30, 1),
  'todo.txt': 'Buy milk\nfix the bike\nCall Ana\nbuy stamps\nFix the door\n',
  'words.txt': 'cat\ncart\ncar\nscar\ncare\ncoat\nact\nhat\nchat\n',
  'src/app.js': '// TODO: add login\nstart()\n', 'src/cart.js': 'let total = 0\n// todo: tax\n',
  'src/lib/date.js': 'export const now = () => Date.now()\n// TODO time zones\n',
  'docs/readme.md': '# Shop\nTODO: write the docs\n',
  'report-2023.txt': '', 'report-2024.txt': '',
});
// Leftovers to clean up: .tmp files at several depths, photos spread over folders.
const attic = (v = 0) => (sh) => sh.setupFiles(v ? {
  'a.tmp': '', 'notes.txt': 'keep\n', 'work/b.tmp': '', 'work/c.txt': 'keep\n', 'work/old/d.tmp': '', 'work/old/e.tmp': '',
  'photos/2023/lake.jpg': '', 'photos/2024/hill.jpg': '', 'photos/2024/x/dog.jpg': '', 'photos/list.txt': '',
} : {
  'x.tmp': '', 'notes.txt': 'keep\n', 'work/y.tmp': '', 'work/plan.txt': 'keep\n', 'work/old/z.tmp': '',
  'photos/2024/beach.jpg': '', 'photos/2024/city.jpg': '', 'photos/cat.jpg': '', 'photos/info.txt': '',
});
// An archive to dig through, for the puzzle: logs at every depth and one file that mentions a password.
const archive = (v = 0) => (sh) => sh.setupFiles(v ? {
  'archive/2023/jan.log': 'ok\n', 'archive/2023/feb.log': 'ok\n', 'archive/2024/mar.log': 'ok\n',
  'archive/2024/notes/old.txt': 'nothing here\n', 'archive/2024/notes/keys.txt': 'wifi password: hunter2\n',
  'archive/readme.txt': 'Old stuff.\n', 'archive/misc/apr.log': 'ok\n', 'archive/misc/may.log': 'ok\n',
} : {
  'archive/2024/jan.log': 'ok\n', 'archive/2024/feb.log': 'ok\n', 'archive/2024/mar.log': 'ok\n',
  'archive/2025/q1/apr.log': 'ok\n', 'archive/2025/q1/secret.txt': 'the password is swordfish\n',
  'archive/readme.txt': 'Old stuff.\n', 'archive/misc/todo.txt': 'sort this\n',
});

const jsUnder = (sh, dir) => filesUnder(sh, dir).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
const dirsUnder = (sh, dir) => [dir, ...sh.fs.descendants(sh.abs(dir)).filter((p) => sh.s.nodes[p].type === 'dir').map((p) => p.slice(sh.s.home.length + 1))];
const tmpLeft = (sh) => filesUnder(sh, '~').some((f) => f.endsWith('.tmp'));

export default {
  id: 'bash-search', title: 'Searching', color: 'sunbeam',
  blurb: 'Find lines with grep and files with find, then act on them.',
  challenges: [
    {
      id: 'bash-needle', title: 'Needle in a haystack', blurb: 'Dig through an archive without opening a single folder by hand.',
      exercises: [
        {
          id: 'src-password', type: 'type', max: 6,
          prompt: 'One file somewhere under <code>archive</code> mentions a <code>password</code>. Print just its path.',
          setup: archive(), variant: archive(1),
          check: (sh) => printedPaths(sh, filesUnder(sh, 'archive').filter((f) => linesWith(sh, `archive/${f}`, /password/).length).map((f) => `archive/${f}`)),
          solution: 'grep -rl password archive',
          explain: '<code>grep -rl password archive</code> searches every file below archive and prints only the names of those that match.',
        },
        {
          id: 'src-count-logs', type: 'type', max: 6,
          prompt: 'How many <code>.log</code> files are there anywhere under <code>archive</code>? Make the terminal count them.',
          setup: archive(), variant: archive(1),
          check: (sh) => printedNumber(sh, filesUnder(sh, 'archive').filter((f) => f.endsWith('.log')).length),
          solution: 'find archive -name "*.log" | wc -l',
          explain: 'find prints one path per line, so <code>wc -l</code> counts them: <code>find archive -name "*.log" | wc -l</code>.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-search-1', title: 'grep',
      exercises: [
        {
          id: 'se1-grep', type: 'learn', new: true, title: '<code>grep</code>: find lines',
          body: '<code>grep ERROR app.log</code> prints every line of app.log that contains <code>ERROR</code>, and nothing else. Capitals matter: <code>error</code> would not match <code>ERROR</code>.',
          demo: { setup: project(), run: ['grep ERROR app.log'] },
        },
        {
          id: 'se1-what', type: 'choice',
          prompt: 'What does <code>grep milk todo.txt</code> print?',
          options: ['Every line of todo.txt that contains milk', 'The word milk', 'How many times milk appears', 'The whole of todo.txt'],
          answer: 0,
          explain: 'grep is a filter: the matching lines go through, the rest are dropped.',
        },
        {
          id: 'se1-outcome', type: 'outcome', new: true,
          prompt: '<code>words.txt</code> holds cat, cart, car, scar and care, one per line. What does this print?',
          setup: (sh) => sh.setupFiles({ 'words.txt': 'cat\ncart\ncar\nscar\ncare\n' }),
          command: 'grep car words.txt',
          show: 'output',
          distractors: [['grep cat words.txt'], ['cat words.txt']],
          explain: 'Every line that contains the letters c-a-r anywhere: cart, car, scar and care.',
        },
        {
          id: 'se1-status', type: 'learn', new: true, title: 'Found or not: the exit status',
          body: 'Every command ends with a number, its exit status. <code>echo $?</code> prints the last one. grep gives 0 when it found a line and 1 when it found nothing.',
          teaches: ['the exit status'],
          demo: { setup: project(), run: ['grep ERROR app.log > /dev/null', 'echo $?'] },
        },
        {
          id: 'se1-status-choice', type: 'choice',
          prompt: 'app.log has no line with PANIC in it. What does the last command print?',
          code: '$ grep PANIC app.log\n$ echo $?',
          options: ['1', '0', 'PANIC', 'Nothing'],
          answer: 0,
          needs: ['the exit status'],
          explain: 'No match, so grep prints nothing and exits with 1. Scripts use that to decide what to do next.',
        },
        {
          id: 'se1-pipe', type: 'learn', new: true, title: 'grep in a pipe',
          body: 'With no file name, grep filters whatever comes in through a pipe. <code>ls | grep 2024</code> shows only the names that contain 2024.',
          demo: { setup: project(), run: ['ls | grep 2024'] },
        },
        {
          id: 'se1-fill', type: 'fill',
          prompt: 'Show only the ERROR lines of <code>app.log</code>, filtering cat\'s output.',
          before: 'cat app.log ', after: ' grep ERROR',
          options: ['|', '>', '<', '>>'],
          answer: 0,
          explain: 'The pipe hands cat\'s output to grep. With <code>></code> you would make a file called grep.',
        },
        {
          id: 'se1-match', type: 'match',
          prompt: 'Match each command to what it prints.',
          pairs: [['grep ERROR app.log', 'The ERROR lines of app.log'], ['ls | grep 2024', 'Names here that contain 2024'], ['grep ERROR app.log | wc -l', 'How many ERROR lines there are'], ['echo $?', 'The last command\'s exit status']],
          explain: 'grep on its own filters lines; piped into <code>wc -l</code> it becomes a counter.',
        },
        {
          id: 'se1-build', type: 'build',
          prompt: 'Count the lines of <code>app.log</code> that contain WARN.',
          tiles: ['grep', 'WARN', 'app.log', '|', 'wc', '-l', '>', 'cat'],
          answers: [['grep', 'WARN', 'app.log', '|', 'wc', '-l']],
          explain: '<code>grep WARN app.log | wc -l</code>: filter, then count.',
        },
        {
          id: 'se1-type-errors', type: 'type',
          prompt: 'Print every line of <code>app.log</code> that contains <code>ERROR</code>.',
          setup: project(), variant: project(1),
          check: (sh) => lastOutIs(sh, linesWith(sh, 'app.log', /ERROR/)),
          solution: 'grep ERROR app.log',
          explain: '<code>grep ERROR app.log</code>: the pattern first, then the file.',
        },
        {
          id: 'se1-type-ls', type: 'type',
          prompt: 'List only the names in your home folder that contain <code>2024</code>.',
          setup: project(), variant: project(1),
          check: (sh) => lastOutIs(sh, listOf(sh, '~').filter((n) => n.includes('2024'))),
          solution: 'ls | grep 2024',
          explain: '<code>ls | grep 2024</code>: ls lists, grep keeps the names with 2024.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-search-2', title: 'grep\'s options',
      exercises: [
        {
          id: 'se2-in', type: 'learn', new: true, title: '<code>-i</code> and <code>-n</code>',
          body: '<code>grep -i fix todo.txt</code> ignores case, so Fix and FIX match too. <code>grep -n</code> puts the line number in front of each match, like <code>3:fix the bike</code>.',
          demo: { setup: project(), run: ['grep -i fix todo.txt', 'grep -n fix todo.txt'] },
        },
        {
          id: 'se2-case', type: 'choice',
          prompt: '<code>todo.txt</code> has the lines <code>fix the bike</code> and <code>Fix the door</code>. What does <code>grep fix todo.txt</code> print?',
          options: ['Only fix the bike', 'Both lines', 'Only Fix the door', 'Nothing'],
          answer: 0,
          explain: 'Without <code>-i</code>, grep matches capitals exactly, so Fix is not fix.',
        },
        {
          id: 'se2-vc', type: 'learn', new: true, title: '<code>-v</code> and <code>-c</code>',
          body: '<code>grep -v INFO app.log</code> turns the search around: every line <b>without</b> INFO. <code>grep -c ERROR app.log</code> prints only how many lines match.',
          demo: { setup: project(), run: ['grep -c ERROR app.log', 'grep -v INFO app.log'] },
        },
        {
          id: 'se2-match', type: 'match',
          prompt: 'Match each option to what it does to grep.',
          pairs: [['-i', 'Ignore upper and lower case'], ['-n', 'Show line numbers'], ['-v', 'Keep the lines that do not match'], ['-c', 'Print only how many lines match']],
          needs: ['grep -i', 'grep -n', 'grep -v', 'grep -c'],
          explain: 'They combine, too: <code>grep -vc INFO</code> counts the lines without INFO.',
        },
        {
          id: 'se2-wl', type: 'learn', new: true, title: '<code>-w</code> and <code>-l</code>',
          body: '<code>grep -w car</code> matches car only as a whole word, not inside cart or scar. <code>grep -l</code> prints just the names of the files that have a match.',
          demo: { setup: project(), run: ['grep -w car words.txt', 'grep -l TODO src/*.js'] },
        },
        {
          id: 'se2-outcome', type: 'outcome',
          prompt: '<code>words.txt</code> holds cat, cart, car, scar and care. What does this print?',
          setup: (sh) => sh.setupFiles({ 'words.txt': 'cat\ncart\ncar\nscar\ncare\n' }),
          command: 'grep -w car words.txt',
          show: 'output',
          distractors: [['grep car words.txt'], ['grep -c car words.txt']],
          explain: 'With <code>-w</code> only the line that is exactly the word car matches.',
        },
        {
          id: 'se2-fill', type: 'fill',
          prompt: 'Print how many lines of <code>app.log</code> contain ERROR.',
          before: 'grep ', after: ' ERROR app.log',
          options: ['-c', '-n', '-v', '-l'],
          answer: 0,
          explain: '<code>-c</code> counts. <code>-n</code> would number the lines, <code>-l</code> print the file name.',
        },
        {
          id: 'se2-same', type: 'choice',
          prompt: 'Which command prints the same number as <code>grep -c ERROR app.log</code>?',
          options: ['grep ERROR app.log | wc -l', 'wc -l app.log', 'grep -v ERROR app.log | wc -l', 'grep -n ERROR app.log'],
          answer: 0,
          explain: 'One matching line per output line, so counting the lines gives the same number.',
        },
        {
          id: 'se2-build', type: 'build',
          prompt: 'Count the lines of <code>app.log</code> that do <b>not</b> contain INFO.',
          tiles: ['grep', '-v', '-c', 'INFO', 'app.log', '-n', '-i'],
          answers: [['grep', '-v', '-c', 'INFO', 'app.log'], ['grep', '-c', '-v', 'INFO', 'app.log']],
          explain: '<code>-v</code> flips the match and <code>-c</code> counts what is left.',
        },
        {
          id: 'se2-type-count', type: 'type',
          prompt: 'How many lines of <code>app.log</code> contain <code>ERROR</code>? Let grep count them.',
          setup: project(), variant: project(1),
          check: (sh) => printedNumber(sh, linesWith(sh, 'app.log', /ERROR/).length),
          solution: 'grep -c ERROR app.log',
          explain: '<code>grep -c ERROR app.log</code>. The check replays it on a log with a different count, so a typed-in number fails.',
        },
        {
          id: 'se2-type-in', type: 'type',
          prompt: 'Print the lines of <code>todo.txt</code> that mention <code>fix</code> in any case, each with its line number.',
          setup: project(), variant: project(1),
          check: (sh) => lastOutIs(sh, fileLines(sh, 'todo.txt').map((l, i) => `${i + 1}:${l}`).filter((l) => /fix/i.test(l.replace(/^\d+:/, '')))),
          solution: 'grep -in fix todo.txt',
          explain: '<code>grep -in fix todo.txt</code>: <code>-i</code> for any case, <code>-n</code> for the numbers.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-search-3', title: 'Patterns',
      exercises: [
        {
          id: 'se3-anchors', type: 'learn', new: true, title: 'Patterns: <code>^</code> and <code>$</code>',
          body: 'grep\'s search is a pattern (a regular expression). <code>^</code> means the start of the line, <code>$</code> its end. Quote patterns so the shell leaves them alone: <code>grep \'^c\' words.txt</code>.',
          demo: { setup: project(), run: ["grep '^c' words.txt", "grep 'r$' words.txt"] },
        },
        {
          id: 'se3-start', type: 'choice',
          prompt: 'Which lines does <code>grep \'t$\' words.txt</code> print?',
          options: ['Lines that end with t', 'Lines that start with t', 'Lines with a t anywhere', 'Lines with a dollar sign'],
          answer: 0,
          explain: '<code>$</code> pins the pattern to the end of the line: cat, cart, coat, act, hat, chat.',
        },
        {
          id: 'se3-dot', type: 'learn', new: true, title: '<code>.</code> <code>*</code> and <code>[ ]</code>',
          body: '<code>.</code> matches any one character, <code>*</code> repeats the thing before it any number of times (even zero), and <code>[ch]</code> matches one character from the list.',
          demo: { setup: project(), run: ["grep 'c.r' words.txt", "grep 'ca*t' words.txt", "grep '^[ch]at' words.txt"] },
        },
        {
          id: 'se3-match', type: 'match',
          prompt: 'Match each pattern to the lines it finds.',
          pairs: [['^ca', 'Lines starting with ca'], ['ca$', 'Lines ending with ca'], ['c.t', 'c, any one character, then t'], ['[bc]at', 'bat or cat inside the line'], ['co*l', 'c, any number of o, then l']],
          needs: ['regex ^', 'regex $', 'regex .', 'regex []', 'regex *'],
          explain: 'Anchors pin, the dot stands in for one character, brackets offer a choice, the star repeats.',
        },
        {
          id: 'se3-outcome', type: 'outcome',
          prompt: '<code>words.txt</code> holds cat, cart, coat, act and chat. What does this print?',
          setup: (sh) => sh.setupFiles({ 'words.txt': 'cat\ncart\ncoat\nact\nchat\n' }),
          command: "grep '^c..t$' words.txt",
          show: 'output',
          distractors: [["grep '^c.t$' words.txt"], ["grep 'c.*t' words.txt"]],
          explain: 'A c, exactly two characters, a t, and nothing around it: cart, coat and chat.',
        },
        {
          id: 'se3-ere', type: 'learn', new: true, title: '<code>grep -E</code>: or, one or more, maybe',
          body: 'With <code>-E</code>, <code>|</code> means or, <code>+</code> one or more, <code>?</code> optional, and <code>( )</code> groups: <code>grep -E \'ERROR|WARN\' app.log</code>, <code>grep -E \'colou?r\'</code>.',
          demo: { setup: project(), run: ["grep -E 'cat|car' words.txt", "grep -E '^(c|h)at$' words.txt"] },
        },
        {
          id: 'se3-optional', type: 'choice',
          prompt: 'Which word does <code>grep -E \'^colou?r$\'</code> <b>not</b> match?',
          options: ['colouur', 'color', 'colour', 'It matches all three'],
          answer: 0,
          explain: '<code>u?</code> allows zero or one u, never two.',
        },
        {
          id: 'se3-fill', type: 'fill',
          prompt: 'Show every line of <code>app.log</code> that has ERROR or WARN in it.',
          before: "grep -E '", after: "' app.log",
          options: ['ERROR|WARN', 'ERROR WARN', 'ERROR&WARN', 'ERROR+WARN'],
          answer: 0,
          explain: 'In <code>-E</code> patterns <code>|</code> is or. A space would be searched for literally.',
        },
        {
          id: 'se3-build', type: 'build',
          prompt: 'Print the lines of <code>words.txt</code> that end with t.',
          tiles: ['grep', "'t$'", 'words.txt', "'^t'", '-v', '-c'],
          answers: [['grep', "'t$'", 'words.txt']],
          explain: '<code>$</code> after the t pins it to the end of the line.',
        },
        {
          id: 'se3-type-start', type: 'type',
          prompt: 'Print the lines of <code>words.txt</code> that start with <code>c</code>.',
          setup: project(), variant: project(1),
          check: (sh) => lastOutIs(sh, linesWith(sh, 'words.txt', /^c/)),
          solution: "grep '^c' words.txt",
          explain: '<code>grep \'^c\' words.txt</code>. Without the <code>^</code> you would also get scar and act.',
        },
        {
          id: 'se3-type-or', type: 'type',
          prompt: 'Print every line of <code>app.log</code> that contains WARN or ERROR, in one command.',
          setup: project(), variant: project(1),
          check: (sh) => lastOutIs(sh, linesWith(sh, 'app.log', /WARN|ERROR/)),
          solution: "grep -E 'WARN|ERROR' app.log",
          explain: '<code>grep -E \'WARN|ERROR\' app.log</code> keeps the lines in their order. Two greps would split them up.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-search-4', title: 'grep -r',
      exercises: [
        {
          id: 'se4-r', type: 'learn', new: true, title: '<code>grep -r</code>: search a whole folder',
          body: '<code>grep -r TODO src</code> searches every file in src and in all the folders inside it. Each match comes with its file: <code>src/app.js:// TODO: add login</code>.',
          demo: { setup: project(), run: ['grep -r TODO src'] },
        },
        {
          id: 'se4-read', type: 'choice',
          prompt: 'grep -r printed this line. What does it tell you?',
          code: 'src/lib/date.js:// TODO time zones',
          options: ['The file src/lib/date.js has the line "// TODO time zones"', 'A folder called src/lib/date.js was made', 'Line 1 of a file called TODO', 'grep could not read date.js'],
          answer: 0,
          explain: 'File name, a colon, then the matching line.',
        },
        {
          id: 'se4-mix', type: 'learn', new: true, title: 'Mix in the options',
          body: 'The options from before still work: <code>grep -rn</code> adds line numbers, <code>grep -rl</code> lists just the files, <code>grep -ri</code> ignores case. <code>.</code> searches from where you are.',
          demo: { setup: project(), run: ['grep -rn TODO src', 'grep -rli todo .'] },
        },
        {
          id: 'se4-match', type: 'match',
          prompt: 'Match each command to what it prints.',
          pairs: [['grep -r TODO src', 'file:line for every match'], ['grep -rn TODO src', 'file:number:line for every match'], ['grep -rl TODO src', 'Only the names of matching files'], ['grep -rc TODO src', 'Every file with its number of matches']],
          explain: '<code>-c</code> with <code>-r</code> counts per file, including the files with 0.',
          needs: ['grep -c'],
        },
        {
          id: 'se4-outcome', type: 'outcome',
          prompt: 'Two files under src mention TODO, one of them twice. What does this print?',
          setup: (sh) => sh.setupFiles({ 'src/a.js': '// TODO one\n// TODO two\n', 'src/b.js': 'ok\n', 'src/lib/c.js': '// TODO three\n' }),
          command: 'grep -rl TODO src',
          show: 'output',
          distractors: [['grep -r TODO src'], ['grep -rn TODO src']],
          explain: 'One name per file that matches, however many times it matches.',
        },
        {
          id: 'se4-glob', type: 'learn', new: true, title: 'A wildcard is not <code>-r</code>',
          body: '<code>grep TODO src/*.js</code> searches only the .js files directly in src: the shell picks them before grep runs. Files in src/lib are missed. To go all the way down, use <code>-r</code>.',
          teaches: ['glob vs grep -r'],
        },
        {
          id: 'se4-glob-choice', type: 'choice',
          prompt: 'There is a TODO in <code>src/lib/date.js</code>. Which command finds it?',
          options: ['grep -r TODO src', 'grep TODO src/*.js', 'grep TODO src', 'grep -c TODO src/*.js'],
          answer: 0,
          needs: ['glob vs grep -r'],
          explain: '<code>src/*.js</code> stops at src itself, and <code>grep TODO src</code> without <code>-r</code> refuses a folder.',
        },
        {
          id: 'se4-fill', type: 'fill',
          prompt: 'List only the names of the files under the current folder that mention TODO.',
          before: 'grep ', after: ' TODO .',
          options: ['-rl', '-r', '-c', '-v'],
          answer: 0,
          explain: '<code>-r</code> to go into every folder, <code>-l</code> to print only names.',
        },
        {
          id: 'se4-type-files', type: 'type',
          prompt: 'Print the names of all files anywhere under <code>src</code> that contain <code>TODO</code> (capitals, as written). Only the names.',
          setup: project(), variant: project(1),
          check: (sh) => printedPaths(sh, filesUnder(sh, 'src').filter((f) => linesWith(sh, `src/${f}`, /TODO/).length).map((f) => `src/${f}`)),
          solution: 'grep -rl TODO src',
          explain: '<code>grep -rl TODO src</code>. On a real disk the order of the files may differ; that is fine.',
        },
        {
          id: 'se4-type-lines', type: 'type',
          prompt: 'Find every line under <code>src</code> that mentions <code>todo</code> in any case, with its file name and line number.',
          setup: project(), variant: project(1),
          check: (sh) => printedHits(sh, filesUnder(sh, 'src').flatMap((f) => fileLines(sh, `src/${f}`).map((l, i) => [i + 1, l]).filter(([, l]) => /todo/i.test(l)).map(([n, l]) => `src/${f}:${n}:${l}`))),
          solution: 'grep -rin todo src',
          explain: '<code>grep -rin todo src</code>: recursive, any case, numbered. The letters can come in any order.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'bash-search-5', title: 'find',
      exercises: [
        {
          id: 'se5-find', type: 'learn', new: true, title: '<code>find</code>: look for files',
          body: 'grep looks inside files; find looks for the files themselves. <code>find src</code> prints every path under src. <code>find . -name "*.js"</code> keeps only the names that fit the pattern.',
          demo: { setup: project(), run: ['find src', 'find . -name "*.js"'] },
        },
        {
          id: 'se5-quote', type: 'learn', new: true, title: 'Quote find\'s pattern',
          body: 'Without quotes, the shell would expand <code>*.js</code> itself, using the files in the current folder, before find even starts. With quotes, find gets the pattern and applies it in every folder.',
          teaches: ['quote find patterns'],
        },
        {
          id: 'se5-why', type: 'choice',
          prompt: 'Why write <code>find . -name "*.txt"</code> with quotes?',
          options: ['So the shell passes *.txt to find instead of expanding it', 'Because find needs quotes around every word', 'To search inside the files', 'To make it ignore case'],
          answer: 0,
          needs: ['quote find patterns'],
          explain: 'The star is for find to use in every folder, not for the shell to use in this one.',
        },
        {
          id: 'se5-opts', type: 'learn', new: true, title: '<code>-iname</code> <code>-type</code> <code>-maxdepth</code>',
          body: '<code>-iname</code> ignores case. <code>-type f</code> keeps files, <code>-type d</code> folders. <code>-maxdepth 1</code> stays in the starting folder. Combine them: <code>find . -maxdepth 1 -type f</code>.',
          demo: { setup: project(), run: ['find . -type d', 'find . -maxdepth 1 -type f -name "*.txt"', 'find . -iname "README*"'] },
        },
        {
          id: 'se5-match', type: 'match',
          prompt: 'Match each find option to what it keeps.',
          pairs: [['-name "*.md"', 'Names ending in .md'], ['-iname "a*"', 'Names starting with a or A'], ['-type d', 'Folders only'], ['-type f', 'Files only'], ['-maxdepth 1', 'Only what is directly in the start folder']],
          needs: ['find -name', 'find -iname', 'find -type', 'find -maxdepth'],
          explain: 'Each option is a test; find prints the paths that pass all of them.',
        },
        {
          id: 'se5-outcome', type: 'outcome',
          prompt: 'What does this print?',
          setup: (sh) => sh.setupFiles({ 'notes.txt': '', 'src/a.js': '', 'src/lib/b.js': '' }),
          command: 'find . -type d',
          show: 'output',
          distractors: [['find . -type f'], ['find src']],
          explain: 'Folders only: <code>.</code> itself, src and src/lib.',
        },
        {
          id: 'se5-fill', type: 'fill',
          prompt: 'List every folder under the current one.',
          before: 'find . -type ', after: '',
          options: ['d', 'f', 'dir', 'folder'],
          answer: 0,
          explain: '<code>d</code> for directory, <code>f</code> for regular file.',
        },
        {
          id: 'se5-build', type: 'build',
          prompt: 'Find every <code>.md</code> file below the current folder.',
          tiles: ['find', '.', '-name', '"*.md"', '-type', 'd', 'grep'],
          answers: [['find', '.', '-name', '"*.md"']],
          explain: '<code>find . -name "*.md"</code>: where to start, then the test.',
        },
        {
          id: 'se5-type-js', type: 'type',
          prompt: 'List every <code>.js</code> file under <code>src</code>, however deep.',
          setup: project(), variant: project(1),
          check: (sh) => printedPaths(sh, jsUnder(sh, 'src')),
          solution: 'find src -name "*.js"',
          explain: '<code>find src -name "*.js"</code>. <code>ls src</code> would miss what is in src/lib.',
        },
        {
          id: 'se5-type-dirs', type: 'type',
          prompt: 'List <code>src</code> and every folder inside it, and no files.',
          setup: project(), variant: (sh) => { project(1)(sh); sh.setupFiles({ 'src/ui/': null }); },
          check: (sh) => printedPaths(sh, dirsUnder(sh, 'src')),
          solution: 'find src -type d',
          explain: '<code>find src -type d</code> prints src itself and each folder below it.',
        },
      ],
    },
    /* ------------------------------------------------------------ 6 */
    {
      id: 'bash-search-6', title: 'Act on what you found',
      exercises: [
        {
          id: 'se6-delete', type: 'learn', new: true, title: '<code>find -delete</code>',
          body: 'Add <code>-delete</code> and find removes everything it matched, in every folder. Run it without <code>-delete</code> first and read the list: there is no undo.',
          demo: { setup: attic(), run: ['find . -name "*.tmp"', 'find . -name "*.tmp" -delete'] },
        },
        {
          id: 'se6-outcome', type: 'outcome',
          prompt: 'Which tree do you get after this command?',
          setup: (sh) => sh.setupFiles({ 'a.tmp': '', 'notes.txt': '', 'work/b.tmp': '' }),
          command: 'find . -name "*.tmp" -delete',
          show: 'tree',
          distractors: [['rm *.tmp'], ['find . -name "*.tmp"']],
          explain: 'find goes into work too. <code>rm *.tmp</code> only sees the current folder.',
        },
        {
          id: 'se6-exec', type: 'learn', new: true, title: '<code>-exec … {} \\;</code>',
          body: '<code>-exec</code> runs a command on each path find finds. <code>{}</code> is replaced by the path and <code>\\;</code> ends the command: <code>find . -name "*.txt" -exec wc -l {} \\;</code>.',
          demo: { setup: attic(), run: ['find . -name "*.txt" -exec wc -l {} \\;'] },
        },
        {
          id: 'se6-braces', type: 'choice',
          prompt: 'In <code>find . -name "*.jpg" -exec cp {} all \\;</code>, what does <code>{}</code> stand for?',
          options: ['The path of each file find found', 'Every file at once', 'The folder all', 'An empty file'],
          answer: 0,
          explain: 'find runs cp once per match, putting that match\'s path where <code>{}</code> is.',
        },
        {
          id: 'se6-xargs', type: 'learn', new: true, title: '<code>xargs</code>: lines into arguments',
          body: '<code>xargs</code> reads lines from a pipe and adds them to a command as arguments. <code>find . -name "*.js" | xargs grep -l TODO</code> greps exactly the files find listed.',
          demo: { setup: project(), run: ['find . -name "*.js" | xargs grep -l TODO'] },
        },
        {
          id: 'se6-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [['find . -name "*.tmp"', 'Lists the .tmp files'], ['find . -name "*.tmp" -delete', 'Deletes the .tmp files'], ['find . -name "*.tmp" -exec rm {} \\;', 'Runs rm once per .tmp file'], ['find . -name "*.tmp" | xargs rm', 'Runs rm with every .tmp file as arguments']],
          explain: 'Three ways to act on the same list; look at the list on its own first.',
        },
        {
          id: 'se6-order', type: 'order',
          prompt: 'Count the lines of every .js file under src. Put the pieces in order.',
          steps: ['find src', '-name "*.js"', '| xargs', 'wc -l'],
          explain: 'find makes the list, xargs hands it to <code>wc -l</code> as file names.',
        },
        {
          id: 'se6-fill', type: 'fill',
          prompt: 'Finish the command: delete each .bak file with rm.',
          before: 'find . -name "*.bak" -exec rm {} ', after: '',
          options: ['\\;', '{}', '|', '.'],
          answer: 0,
          explain: '<code>\\;</code> ends the command that <code>-exec</code> runs. The backslash stops the shell from eating the <code>;</code>.',
        },
        {
          id: 'se6-type-delete', type: 'type',
          prompt: 'Delete every <code>.tmp</code> file under your home folder, however deep. Keep everything else.',
          setup: attic(), variant: attic(1),
          check: (sh) => !tmpLeft(sh) && isFile(sh, 'notes.txt') && isDir(sh, 'work/old'),
          solution: 'find . -name "*.tmp" -delete',
          explain: '<code>find . -name "*.tmp" -delete</code>. <code>-exec rm {} \\;</code> or <code>| xargs rm</code> work too.',
        },
        {
          id: 'se6-type-copy', type: 'type',
          prompt: 'Make a folder <code>all</code> and copy every <code>.jpg</code> from anywhere under <code>photos</code> into it.',
          setup: attic(), variant: attic(1),
          check: (sh) => { const want = filesUnder(sh, 'photos').filter((f) => f.endsWith('.jpg')).map((f) => f.split('/').pop()); return want.length > 0 && want.every((n) => isFile(sh, `all/${n}`)) && listOf(sh, 'all').length === want.length; },
          solution: 'mkdir all\nfind photos -name "*.jpg" -exec cp {} all \\;',
          explain: '<code>find photos -name "*.jpg" -exec cp {} all \\;</code> copies them one by one into all.',
        },
      ],
    },
  ],
};
