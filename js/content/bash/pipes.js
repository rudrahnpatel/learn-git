// Bash unit 4: Pipes and redirection. > and >>, pipes and sort, < and <<<, stdout vs stderr, /dev/null and tee.
import { home, isFile, isDir, fileText, fileIs, fileHas, fileLines, listOf, lastOut, lastErr, lastOutIs, listed, printedNumber, lineCount, logLines } from './helpers.js';

const names = (v = 0) => (v ? 'Zoe\nliam\nAmir\nnoor\nBea\nkai\n' : 'bob\nAnna\ncarl\nalice\nBen\n');
// photos to count, a log, a list of names to sort; `v` gives other counts and contents (the anti-cheat replay).
const desk = (v = 0) => (sh) => sh.setupFiles(v ? {
  'photos/lake.jpg': '', 'photos/hill.jpg': '', 'photos/dog.jpg': '', 'photos/tree.jpg': '', 'photos/moon.jpg': '',
  'access.log': logLines(27, 4), 'names.txt': names(1), 'todo.txt': 'rice\nsoap\n',
} : {
  'photos/beach.jpg': '', 'photos/city.jpg': '', 'photos/cat.jpg': '',
  'access.log': logLines(42, 1), 'names.txt': names(0), 'todo.txt': 'milk\nbread\n',
});
// A little ready-made program that prints a result on stdout and a warning on stderr, like many real tools.
const BACKUP = '#!/bin/bash\necho "Copied $(ls photos | wc -l) files"\necho "warning: photos/raw is empty" >&2\n';
const backup = (v = 0) => (sh) => { desk(v)(sh); sh.setupFiles({ 'backup.sh': { content: BACKUP, mode: 0o755 } }); };
const sortedNames = (sh) => [...fileLines(sh, 'names.txt')].sort();
const copied = (sh) => `Copied ${listOf(sh, 'photos').length} files`;

export default {
  id: 'bash-pipes', title: 'Pipes and redirection', color: 'pink',
  blurb: 'Send output into files and into other commands.',
  challenges: [
    {
      id: 'bash-reports', title: 'Little reports', blurb: 'Build one-line reports and save them to files.',
      exercises: [
        {
          id: 'ppc-count-file', type: 'type', max: 6,
          prompt: 'Save the number of files in <code>photos</code> into <code>count.txt</code>. Just the number.',
          setup: desk(), variant: desk(1),
          check: (sh) => String(fileText(sh, 'count.txt') ?? '').trim() === String(listOf(sh, 'photos').length),
          solution: 'ls photos | wc -l > count.txt',
          explain: 'A pipe counts, and <code>></code> at the end saves what the last command printed.',
        },
        {
          id: 'ppc-top-names', type: 'type', max: 6,
          prompt: 'Save the first 2 names of <code>names.txt</code>, in sorted order, into <code>top.txt</code>.',
          setup: desk(), variant: desk(1),
          check: (sh) => isFile(sh, 'top.txt') && fileIs(sh, 'top.txt', sortedNames(sh).slice(0, 2)),
          solution: 'sort names.txt | head -n 2 > top.txt',
          explain: 'Sort first, then take the head, then save: <code>sort names.txt | head -n 2 > top.txt</code>.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-pipes-1', title: 'Output into files',
      exercises: [
        {
          id: 'pp1-gt', type: 'learn', new: true, title: '<code>></code>: output into a file',
          body: 'Normally output goes to the screen. <code>></code> sends it into a file instead: <code>ls > files.txt</code>. The file is created, or <b>overwritten</b> if it exists. Nothing shows on screen.',
          demo: { setup: desk(), run: ['ls > files.txt', 'cat files.txt'] },
        },
        {
          id: 'pp1-overwrite', type: 'choice',
          prompt: 'You run these two commands. What is in <code>note.txt</code> now?',
          code: '$ echo hi > note.txt\n$ echo bye > note.txt',
          options: ['Only bye', 'hi, then bye', 'Only hi', 'Nothing'],
          answer: 0,
          explain: '<code>></code> starts the file from scratch every time, so <code>hi</code> is gone.',
        },
        {
          id: 'pp1-outcome', type: 'outcome', new: true,
          prompt: 'Which tree do you get after this command?',
          setup: (sh) => sh.setupFiles({ 'notes.txt': 'hi\n' }),
          command: 'ls > list.txt',
          show: 'tree',
          distractors: [['ls'], ['mkdir list.txt']],
          explain: '<code>></code> creates a <b>file</b> called list.txt holding the listing. Plain <code>ls</code> creates nothing.',
        },
        {
          id: 'pp1-append', type: 'learn', new: true, title: '<code>>></code>: add to the end',
          body: '<code>>></code> appends: it adds the output to the end of the file and keeps what was there. <code>echo "eggs" >> todo.txt</code> adds a line to your list.',
          demo: { setup: desk(), run: ['echo "eggs" >> todo.txt', 'cat todo.txt'] },
        },
        {
          id: 'pp1-match', type: 'match',
          prompt: 'Match each command to what happens.',
          pairs: [['echo hi > f.txt', 'f.txt holds only hi'], ['echo hi >> f.txt', 'hi is added to the end of f.txt'], ['echo hi', 'hi is printed on screen'], ['cat a.txt > b.txt', 'b.txt becomes a copy of a.txt']],
          explain: 'One arrow replaces, two arrows add.',
        },
        {
          id: 'pp1-trap', type: 'learn', new: true, title: 'The trap: same file in and out',
          body: '<code>cat todo.txt > todo.txt</code> leaves todo.txt <b>empty</b>. The shell empties the file for <code>></code> before cat even starts reading. Write to a new name instead, then rename it.',
          teaches: ['redirect trap'],
        },
        {
          id: 'pp1-trap-choice', type: 'choice',
          prompt: 'You run <code>cat todo.txt > todo.txt</code>. What is in todo.txt now?',
          options: ['Nothing: it is empty', 'The same as before', 'Two copies of the list', 'An error message'],
          answer: 0,
          needs: ['redirect trap'],
          explain: 'The <code>></code> emptied the file before cat read it, so cat found nothing to copy.',
        },
        {
          id: 'pp1-fill', type: 'fill',
          prompt: 'Add <code>Call Ana</code> as a new last line of <code>todo.txt</code>, keeping the rest.',
          before: 'echo "Call Ana" ', after: ' todo.txt',
          options: ['>>', '>', '<', '|'],
          answer: 0,
          explain: '<code>>></code> appends. A single <code>></code> would wipe the list first.',
        },
        {
          id: 'pp1-type-save', type: 'type',
          prompt: 'Save the listing of your home folder into a file called <code>files.txt</code>.',
          setup: home(), variant: home(1),
          check: (sh) => { const t = String(fileText(sh, 'files.txt') ?? '').split(/\s+/); return listOf(sh, '~').filter((n) => !n.startsWith('.') && n !== 'files.txt').every((n) => t.includes(n)); },
          solution: 'ls > files.txt',
          explain: '<code>ls > files.txt</code>. Run <code>cat files.txt</code> to see it.',
        },
        {
          id: 'pp1-type-append', type: 'type',
          prompt: 'Add the line <code>Water the plants</code> to the end of <code>todo.txt</code>, keeping the lines already there.',
          setup: desk(),
          check: (sh) => fileIs(sh, 'todo.txt', ['milk', 'bread', 'Water the plants']),
          solution: 'echo "Water the plants" >> todo.txt',
          explain: '<code>echo "Water the plants" >> todo.txt</code>. The quotes keep the three words together.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-pipes-2', title: 'Pipes',
      exercises: [
        {
          id: 'pp2-pipe', type: 'learn', new: true, title: '<code>|</code>: the pipe',
          body: 'A pipe sends one command\'s output into the next command as its input. <code>ls photos | wc -l</code>: ls lists the photos, wc counts the lines it gets. One name per line, so you get the number of photos.',
          demo: { setup: desk(), run: ['ls photos | wc -l'] },
        },
        {
          id: 'pp2-what', type: 'choice',
          prompt: 'What does <code>ls | wc -l</code> print?',
          options: ['How many names are in this folder', 'The list of names, numbered', 'The number of lines in every file', 'An error: ls is not a file'],
          answer: 0,
          explain: 'ls hands its list to wc, and <code>wc -l</code> counts the lines it was given.',
        },
        {
          id: 'pp2-sort', type: 'learn', new: true, title: '<code>sort</code>: put lines in order',
          body: '<code>sort names.txt</code> prints the lines in order; <code>sort -r</code> reverses it. This sandbox sorts the C way, capitals first (like <code>LC_ALL=C</code>), while a real Ubuntu may mix a A b B.',
          demo: { setup: desk(), run: ['sort names.txt', 'sort -r names.txt'] },
        },
        {
          id: 'pp2-outcome', type: 'outcome',
          prompt: '<code>pets.txt</code> holds three lines: rex, Bo, ada. What does this print?',
          setup: (sh) => sh.setupFiles({ 'pets.txt': 'rex\nBo\nada\n' }),
          command: 'sort pets.txt',
          show: 'output',
          distractors: [['sort -r pets.txt'], ['cat pets.txt']],
          explain: 'Capitals sort before lower case here, so <code>Bo</code> comes first, then ada, then rex.',
        },
        {
          id: 'pp2-build', type: 'build',
          prompt: 'Count the files in <code>photos</code> with a pipe.',
          tiles: ['ls', 'photos', '|', 'wc', '-l', '>', 'sort'],
          answers: [['ls', 'photos', '|', 'wc', '-l']],
          explain: '<code>ls photos | wc -l</code>: list, then count.',
        },
        {
          id: 'pp2-chain', type: 'learn', new: true, title: 'Longer pipelines',
          body: 'Chain as many as you like: each command\'s output feeds the next. <code>sort names.txt | head -n 2</code> prints the first two names in order. Read a pipeline left to right, like a recipe.',
          demo: { setup: desk(), run: ['sort names.txt | head -n 2'] },
        },
        {
          id: 'pp2-order', type: 'order',
          prompt: 'Build the pipeline that prints the first two names of <code>names.txt</code> in sorted order. Put the pieces in order.',
          steps: ['cat names.txt', '| sort', '| head -n 2'],
          explain: 'Sort before you cut: <code>head</code> first would pick two names before they are in order.',
        },
        {
          id: 'pp2-match', type: 'match',
          prompt: 'Match each pipeline to what it prints.',
          pairs: [['ls | wc -l', 'How many names are here'], ['sort names.txt | head -n 1', 'The first name in order'], ['sort -r names.txt | head -n 1', 'The last name in order'], ['cat names.txt | wc -l', 'How many names are in the file']],
          explain: 'Same few commands, different jobs, just by chaining them.',
        },
        {
          id: 'pp2-type-count', type: 'type',
          prompt: 'How many files are in <code>photos</code>? Use a pipe to make the terminal count them.',
          setup: desk(), variant: desk(1),
          check: (sh) => printedNumber(sh, listOf(sh, 'photos').length),
          solution: 'ls photos | wc -l',
          explain: '<code>ls photos | wc -l</code> works for any number of photos. A typed-in number would not: the check replays your commands on a folder with a different count.',
        },
        {
          id: 'pp2-type-top', type: 'type',
          prompt: 'Print the first 3 names of <code>names.txt</code> in sorted order.',
          setup: desk(), variant: desk(1),
          check: (sh) => lastOutIs(sh, sortedNames(sh).slice(0, 3)),
          solution: 'sort names.txt | head -n 3',
          explain: '<code>sort names.txt | head -n 3</code>: sort everything, keep the top three.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-pipes-3', title: 'Input from files',
      exercises: [
        {
          id: 'pp3-lt', type: 'learn', new: true, title: '<code><</code>: input from a file',
          body: '<code><</code> feeds a file into a command\'s input, the way a pipe would. <code>wc -l < access.log</code> prints just the number: wc reads its input and never learns the file\'s name.',
          demo: { setup: desk(), run: ['wc -l access.log', 'wc -l < access.log'] },
        },
        {
          id: 'pp3-diff', type: 'choice',
          prompt: 'What is the difference between these two?',
          code: '$ wc -l access.log\n42 access.log\n$ wc -l < access.log\n42',
          options: ['With < wc only sees the text, so it prints no name', 'With < it counts words instead', 'There is none', 'The second one changes the file'],
          answer: 0,
          explain: 'Given a name, wc opens the file itself and repeats the name. Through <code><</code> it just gets text.',
        },
        {
          id: 'pp3-outcome', type: 'outcome',
          prompt: '<code>notes.txt</code> holds three lines. What does this print?',
          setup: (sh) => sh.setupFiles({ 'notes.txt': 'milk\nbread\neggs\n' }),
          command: 'wc -l < notes.txt',
          show: 'output',
          distractors: [['wc -l notes.txt'], ['wc -c < notes.txt']],
          explain: 'Just <code>3</code>: the count with no file name after it.',
        },
        {
          id: 'pp3-here', type: 'learn', new: true, title: '<code><<<</code>: input from a string',
          body: '<code><<<</code> feeds a piece of text as input, no file needed: <code>wc -w <<< "one two three"</code> prints 3. Handy for trying a command on a quick example.',
          demo: { setup: desk(), run: ['wc -w <<< "one two three"'] },
        },
        {
          id: 'pp3-here-choice', type: 'choice',
          prompt: 'What does <code>wc -w <<< "red green blue yellow"</code> print?',
          options: ['4', '1', 'red green blue yellow', '27'],
          answer: 0,
          explain: 'Four words of input. <code>-l</code> would print 1: it is all one line.',
        },
        {
          id: 'pp3-match', type: 'match',
          prompt: 'Match each symbol to what it does.',
          pairs: [['<code>></code>', 'Output into a file'], ['<code>>></code>', 'Output added to a file'], ['<code><</code>', 'Input from a file'], ['<code><<<</code>', 'Input from a string'], ['<code>|</code>', 'Output into the next command']],
          explain: 'Arrows point the way the text flows: into the file, or out of it.',
        },
        {
          id: 'pp3-fill', type: 'fill',
          prompt: 'Sort <code>names.txt</code>, reading it as input, into <code>sorted.txt</code>.',
          before: 'sort ', after: ' names.txt > sorted.txt',
          options: ['<', '>', '>>', '|'],
          answer: 0,
          explain: '<code><</code> brings the file in, <code>></code> sends the result out. Both on one line is fine.',
        },
        {
          id: 'pp3-build', type: 'build',
          prompt: 'Save <code>names.txt</code>, sorted, as <code>sorted.txt</code>.',
          tiles: ['sort', '<', 'names.txt', '>', 'sorted.txt', '|', '>>'],
          answers: [['sort', '<', 'names.txt', '>', 'sorted.txt'], ['sort', 'names.txt', '>', 'sorted.txt']],
          explain: '<code>sort names.txt > sorted.txt</code> works too: sort can open the file itself.',
        },
        {
          id: 'pp3-type-number', type: 'type',
          prompt: 'Print just the number of lines in <code>access.log</code>, with no file name after it.',
          setup: desk(), variant: desk(1),
          check: (sh) => lastOut(sh).trim() === String(lineCount(sh, 'access.log')),
          solution: 'wc -l < access.log',
          explain: '<code>wc -l < access.log</code> (or <code>cat access.log | wc -l</code>) prints the bare number.',
        },
        {
          id: 'pp3-type-sorted', type: 'type',
          prompt: 'Save the names in <code>names.txt</code>, sorted, into a new file <code>sorted.txt</code>.',
          setup: desk(), variant: desk(1),
          check: (sh) => fileIs(sh, 'sorted.txt', sortedNames(sh)),
          solution: 'sort < names.txt > sorted.txt',
          explain: 'Input from one file, output into another. Never the same file: remember the trap.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-pipes-4', title: 'Two output streams',
      exercises: [
        {
          id: 'pp4-program', type: 'learn', new: true, title: 'A program that talks twice',
          body: 'We left a little program here, backup.sh. Run a program in this folder with <code>./backup.sh</code> (<code>./</code> means "the one right here"). It prints a result and a warning.',
          demo: { setup: backup(), run: ['./backup.sh'] },
        },
        {
          id: 'pp4-streams', type: 'learn', new: true, title: 'stdout and stderr',
          body: 'Commands have two outputs: <b>stdout</b> for results and <b>stderr</b> for errors and warnings. Both show on screen, but <code>></code> only catches stdout: <code>./backup.sh > out.txt</code> still shows the warning.',
          teaches: ['stdout and stderr'],
          demo: { setup: backup(), run: ['./backup.sh > out.txt'] },
        },
        {
          id: 'pp4-screen', type: 'choice',
          prompt: 'You run <code>ls notes.txt nope > out.txt</code>, and nope does not exist. What appears on the screen?',
          options: ['The error about nope', 'notes.txt', 'Both lines', 'Nothing at all'],
          answer: 0,
          needs: ['stdout and stderr'],
          explain: 'notes.txt is a result (stdout), so it goes into out.txt. The error is stderr, which <code>></code> does not touch.',
        },
        {
          id: 'pp4-2gt', type: 'learn', new: true, title: '<code>2></code>: catch the errors',
          body: 'stdout is stream 1, stderr is stream 2. <code>./backup.sh 2> warnings.txt</code> sends stderr into a file and leaves the results on screen. <code>2>></code> appends, like <code>>></code>.',
          demo: { setup: backup(), run: ['./backup.sh 2> warnings.txt', 'cat warnings.txt'] },
        },
        {
          id: 'pp4-type-warnings', type: 'type',
          prompt: 'Run <code>./backup.sh</code> and save its warning into <code>warnings.txt</code>, while the result still shows on screen.',
          setup: backup(),
          check: (sh) => fileHas(sh, 'warnings.txt', 'warning:') && !fileHas(sh, 'warnings.txt', 'Copied'),
          solution: './backup.sh 2> warnings.txt',
          explain: '<code>2></code> redirects only stream 2, the warnings.',
        },
        {
          id: 'pp4-both', type: 'learn', new: true, title: 'Both into one file',
          body: '<code>./backup.sh > all.txt 2>&1</code> saves both: <code>2>&1</code> means "send stderr where stdout goes now". The short form is <code>&></code>: <code>./backup.sh &> all.txt</code>.',
          demo: { setup: backup(), run: ['./backup.sh &> all.txt', 'cat all.txt'] },
        },
        {
          id: 'pp4-order', type: 'learn', new: true, title: 'Order matters',
          body: 'Redirections run left to right. In <code>./backup.sh 2>&1 > out.txt</code>, stderr copies stdout\'s target while that is still the screen, and only then stdout moves to the file. The warning stays on screen.',
          teaches: ['redirect order'],
          demo: { setup: backup(), run: ['./backup.sh 2>&1 > out.txt'] },
        },
        {
          id: 'pp4-where', type: 'choice',
          prompt: 'Where does the warning end up?',
          code: '$ ./backup.sh 2>&1 > out.txt',
          options: ['On the screen', 'In out.txt', 'Nowhere: it is lost', 'In a file called 1'],
          answer: 0,
          needs: ['redirect order'],
          explain: 'When <code>2>&1</code> ran, stdout still pointed at the screen. Write <code>> out.txt 2>&1</code> to get both in the file.',
        },
        {
          id: 'pp4-match', type: 'match',
          prompt: 'Match each redirection to where things go.',
          pairs: [['./backup.sh > f.txt', 'Results into f.txt, warning on screen'], ['./backup.sh 2> f.txt', 'Warning into f.txt, results on screen'], ['./backup.sh &> f.txt', 'Both into f.txt'], ['./backup.sh 2>&1 > f.txt', 'Results into f.txt, warning still on screen']],
          explain: 'Plain <code>></code> is stdout only; <code>2></code> is stderr only; <code>&></code> or <code>> f 2>&1</code> is both.',
        },
        {
          id: 'pp4-type-both', type: 'type',
          prompt: 'Run <code>./backup.sh</code> and save both its result and its warning into <code>all.txt</code>.',
          setup: backup(),
          check: (sh) => fileHas(sh, 'all.txt', 'Copied') && fileHas(sh, 'all.txt', 'warning:'),
          solution: './backup.sh &> all.txt',
          explain: '<code>&> all.txt</code>, or the long form <code>> all.txt 2>&1</code> (in that order).',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'bash-pipes-5', title: 'Throw it away',
      exercises: [
        {
          id: 'pp5-null', type: 'learn', new: true, title: '<code>/dev/null</code>: the black hole',
          body: '<code>/dev/null</code> is a special file that swallows anything written to it. <code>./backup.sh 2> /dev/null</code> throws the warnings away and keeps the results.',
          demo: { setup: backup(), run: ['./backup.sh 2> /dev/null'] },
        },
        {
          id: 'pp5-null-choice', type: 'choice',
          prompt: 'You run <code>echo hello > /dev/null</code>, then <code>cat /dev/null</code>. What does cat print?',
          options: ['Nothing', 'hello', 'An error: the file is full', 'null'],
          answer: 0,
          explain: 'Whatever goes into <code>/dev/null</code> is gone. Reading it always gives nothing.',
        },
        {
          id: 'pp5-fill', type: 'fill',
          prompt: 'Run the backup, hiding its warnings.',
          before: './backup.sh 2> ', after: '',
          options: ['/dev/null', 'null', '/dev', 'trash'],
          answer: 0,
          explain: 'The full path is <code>/dev/null</code>. Plain <code>null</code> would make a file called null.',
        },
        {
          id: 'pp5-tee', type: 'learn', new: true, title: '<code>tee</code>: see it and save it',
          body: '<code>tee</code> is a T-junction in a pipe: <code>ls | tee list.txt</code> shows the list on screen <b>and</b> saves it. <code>tee -a</code> appends instead of overwriting.',
          demo: { setup: desk(), run: ['ls photos | tee list.txt'] },
        },
        {
          id: 'pp5-outcome', type: 'outcome',
          prompt: 'Which tree do you get after this command?',
          setup: (sh) => sh.setupFiles({ 'notes.txt': 'hi\n', 'photos/cat.jpg': '' }),
          command: 'ls photos | tee list.txt',
          show: 'tree',
          distractors: [['ls photos > /dev/null'], ['ls photos | tee photos/list.txt']],
          explain: 'tee writes list.txt in the folder you are in, and passes the list on to the screen.',
        },
        {
          id: 'pp5-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [['ls > /dev/null', 'Shows nothing, saves nothing'], ['ls | tee f.txt', 'Shows the list and saves it'], ['ls | tee -a f.txt', 'Shows the list and adds it to f.txt'], ['./backup.sh 2> /dev/null', 'Shows results, hides warnings']],
          explain: '<code>/dev/null</code> to throw away, <code>tee</code> to keep a copy on the way.',
        },
        {
          id: 'pp5-keep-errors', type: 'choice',
          prompt: 'Which command shows only the warnings, throwing the normal results away?',
          options: ['./backup.sh > /dev/null', './backup.sh 2> /dev/null', './backup.sh &> /dev/null', './backup.sh | tee /dev/null'],
          answer: 0,
          explain: 'Plain <code>></code> throws away stdout, the results. The warning, on stderr, still reaches the screen.',
        },
        {
          id: 'pp5-build', type: 'build',
          prompt: 'Show the list of photos and save it into <code>photos.txt</code> at the same time.',
          tiles: ['ls', 'photos', '|', 'tee', 'photos.txt', '>', '/dev/null'],
          answers: [['ls', 'photos', '|', 'tee', 'photos.txt']],
          explain: '<code>ls photos | tee photos.txt</code>: one copy to the file, one to the screen.',
        },
        {
          id: 'pp5-type-quiet', type: 'type',
          prompt: 'Run <code>./backup.sh</code> so that its result shows but its warning is thrown away.',
          setup: backup(), variant: backup(1),
          check: (sh) => lastOutIs(sh, copied(sh)) && lastErr(sh) === '' && !listOf(sh, '~').some((n) => n !== 'backup.sh' && !['photos', 'access.log', 'names.txt', 'todo.txt'].includes(n)),
          solution: './backup.sh 2> /dev/null',
          explain: '<code>2> /dev/null</code> sends stream 2 into the black hole, and no stray file is left behind.',
        },
        {
          id: 'pp5-type-tee', type: 'type',
          prompt: 'List the files in <code>photos</code> on screen and save the same list into <code>photos.txt</code>, in one go.',
          setup: desk(), variant: desk(1),
          check: (sh) => listed(sh, 'photos') && listOf(sh, 'photos').every((n) => String(fileText(sh, 'photos.txt') ?? '').split('\n').includes(n)),
          solution: 'ls photos | tee photos.txt',
          explain: '<code>ls photos | tee photos.txt</code> shows it and keeps it.',
        },
      ],
    },
  ],
};
