// Bash unit 9: Scripts. A script is a file of commands: the shebang, comments, nano (learn only), chmod +x and ./;
// arguments ($1, $#, "$@", $0); exit status, && / || and exit N; debugging with the error's line number, bash -x and
// set -e. Lessons end with `script` exercises (js/ui/script.js) next to a `type`.
import { isExecutable, isDir, fileText, fileLines, lineCount, listOf, filesUnder, lastOutIs, lastErr, runOut, runOutIs, runCode } from './helpers.js';

const S = (body) => `#!/bin/bash\n${body}`;
// A desk: a to-do list, some notes and a backup script that has never run. `v` gives other data (the variant).
const desk = (v = 0) => (sh) => sh.setupFiles(v ? {
  'todo.txt': 'Pay the rent\nFix the bike\nCall the dentist\nBuy stamps\nReturn the book\n',
  'notes/trip.txt': 'Train at 9\n', 'notes/books.txt': 'Dune\nEmma\n', 'notes/gift.txt': 'Socks\n', 'notes/menu.txt': 'Soup\nBread\n', 'notes/photo.jpg': '',
  'hello.sh': S('# Say hello, then show where we are\necho "Hello from a script"\npwd\n'),
  'backup.sh': S('# Copy the notes into backup/\nmkdir -p backup\ncp notes/*.txt backup/\necho "Backed up $(ls backup | wc -l) files"\n'),
} : {
  'todo.txt': 'Buy milk\nWater the plants\nCall mum\n',
  'notes/ideas.txt': 'A tiny game\n', 'notes/plan.txt': 'Learn bash\nWrite a script\n', 'notes/cat.jpg': '',
  'hello.sh': S('# Say hello, then show where we are\necho "Hello from a script"\npwd\n'),
  'backup.sh': S('# Copy the notes into backup/\nmkdir -p backup\ncp notes/*.txt backup/\necho "Backed up $(ls backup | wc -l) files"\n'),
});
// Scripts that show their arguments, and two short text files. `v` greets with another word.
const argv = (v = 0) => (sh) => sh.setupFiles({
  'greet.sh': S(`echo "${v ? 'Hello' : 'Hi'} $1"\n`),
  'info.sh': S('echo "$0 got $# arguments"\n'),
  'count.sh': S('wc -l "$@"\n'),
  'notes.txt': v ? 'one\ntwo\nthree\nfour\n' : 'Learn bash\nWater the plants\n',
  'todo.txt': v ? 'a\nb\n' : 'fix the sink\nbuy bread\ncall the bank\n',
});
// An app log with or without errors, plus a cache folder of .tmp files for clean.sh.
const logs = (v = 0) => (sh) => sh.setupFiles({
  'app.log': v ? '09:00 INFO start\n09:05 WARN disk 80%\n09:30 INFO saved\n' : '09:00 INFO start\n09:12 ERROR no disk space\n09:13 INFO retry\n',
  'notes.txt': 'hi\n',
});
const cleanable = (sh) => sh.setupFiles({ 'cache/a.tmp': 'x\n', 'cache/b.tmp': 'y\n', 'cache/keep.txt': 'keep me\n', 'draft.tmp': 'my draft\n', 'notes.txt': 'hi\n' });
// Debugging: a script with a typo, a deploy script, a site with no public/ folder yet.
const workbench = (v = 0) => (sh) => sh.setupFiles({
  'notes.txt': v ? 'a\nb\nc\nd\ne\n' : 'Learn bash\nWater the plants\n',
  'todo.txt': v ? 'x\n' : 'fix the sink\nbuy bread\ncall the bank\n',
  'tidy.sh': S('echo "Tidying up"\nehco "Moving files"\nmkdir -p old\n'),
  'lines.sh': S('file=$1\nn=$(wc -l < "$file")\necho "$file has $n lines"\n'),
  'count.sh': S(`file=$1\nn=$(grep -c "" "$file")\necho "${v ? 'Lines in' : 'Count for'} $file: $n"\n`),
  'deploy.sh': S('set -e\necho "Copying"\ncp -r site/* public/\necho "Deployed"\n'),
  'site/index.html': '<h1>Shop</h1>\n', 'site/style.css': 'h1 { color: teal; }\n',
});
// A toolbox for the puzzle: a line-counting script that is not executable yet, and notes to count.
const toolbox = (v = 0) => (sh) => sh.setupFiles({
  'tools/total.sh': S('# Usage: total.sh FILE...   prints the total number of lines\ncat "$@" | wc -l\n'),
  ...(v ? { 'notes/a.txt': 'one\ntwo\n', 'notes/b.txt': 'three\n', 'notes/c.txt': 'four\nfive\nsix\nseven\n', 'notes/d.md': 'skip\n' }
    : { 'notes/x.txt': 'Learn bash\nWrite a script\n', 'notes/y.txt': 'Buy milk\n', 'notes/z.jpg': '' }),
});

const txtIn = (sh, d) => listOf(sh, d).filter((n) => n.endsWith('.txt'));
// the word greet.sh puts before the name
const greetWord = (sh) => (/echo "(\w+) \$1"/.exec(fileText(sh, 'greet.sh') || '') || [])[1];
// what count.sh prints for a file: its text before $file, the name, the count
const countLine = (sh, f) => `${(/echo "(.*) \$file: \$n"/.exec(fileText(sh, 'count.sh') || '') || [])[1]} ${f}: ${lineCount(sh, f)}`;
const hasError = (sh) => /ERROR/.test(fileText(sh, 'app.log') || '');

export default {
  id: 'bash-scripts', title: 'Scripts', color: 'sky',
  blurb: 'Put commands in a file, give it arguments, and find out why it broke.',
  challenges: [
    {
      id: 'bash-toolbox', title: 'Toolbox', blurb: 'A script that sets up a project, and a tool you can run from anywhere.',
      exercises: [
        {
          id: 'scc-newproj', type: 'script',
          prompt: 'Write <code>newproj.sh NAME</code>: it makes a folder NAME with <code>src</code> and <code>docs</code> folders inside, a <code>NAME/README.md</code> whose first line is <code># NAME</code>, then prints <code>Created NAME</code>.',
          file: 'newproj.sh',
          setup: (sh) => sh.setupFiles({ 'notes.txt': 'hi\n' }),
          runs: [{ args: ['shop'] }, { args: ['blog'] }],
          starter: S('# Usage: newproj.sh NAME\n'),
          solution: S('# Usage: newproj.sh NAME\nmkdir -p "$1/src" "$1/docs"\necho "# $1" > "$1/README.md"\necho "Created $1"\n'),
          check: (sh) => sh.runs?.length === 2 && sh.runs.every((r) => {
            const n = r.args[0];
            return isDir(sh, `${n}/src`) && isDir(sh, `${n}/docs`) && fileLines(sh, `${n}/README.md`)[0] === `# ${n}` && r.out.trim() === `Created ${n}`;
          }),
          explain: '<code>mkdir -p "$1/src" "$1/docs"</code> makes both (and NAME itself), <code>echo "# $1" > "$1/README.md"</code> writes the title, then <code>echo "Created $1"</code>.',
        },
        {
          id: 'scc-total', type: 'type', max: 6,
          prompt: '<code>~/tools/total.sh</code> prints the total number of lines in the files you give it. Make it executable, then use it to count the lines of every .txt file in <code>notes</code>.',
          setup: toolbox(), variant: toolbox(1),
          check: (sh) => isExecutable(sh, 'tools/total.sh') && lastOutIs(sh, String(txtIn(sh, 'notes').reduce((s, n) => s + lineCount(sh, `notes/${n}`), 0))),
          solution: 'chmod +x ~/tools/total.sh\n~/tools/total.sh notes/*.txt',
          explain: '<code>chmod +x ~/tools/total.sh</code>, then run it by its path with a glob: <code>~/tools/total.sh notes/*.txt</code>. The shell hands every matching name to the script as <code>"$@"</code>.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-scripts-1', title: 'Your first script',
      exercises: [
        {
          id: 'sc1-file', type: 'learn', new: true, title: 'A script is a file of commands',
          body: 'A script is a plain text file of commands. bash runs them top to bottom, as if you typed them one by one. Line one, <code>#!/bin/bash</code>, is the shebang; any other line starting with <code>#</code> is a comment, which bash skips.',
          teaches: ['comments'],
          demo: { setup: desk(), run: ['cat hello.sh', 'bash hello.sh'] },
        },
        {
          id: 'sc1-comment', type: 'choice',
          prompt: 'A script has the line <code># copy the photos</code>. What does bash do with it?',
          options: ['Skips it: it is a comment', 'Copies the photos', 'Prints it', 'Stops with an error'],
          answer: 0,
          needs: ['comments'],
          explain: 'A line starting with <code>#</code> is a note for people. bash ignores it.',
        },
        {
          id: 'sc1-nano', type: 'learn', new: true, title: '<code>nano</code>: a small editor',
          body: '<code>nano hello.sh</code> opens the file (or a new one) in a simple editor inside the terminal. Type your lines, press <b>Ctrl+O</b> and Enter to save, <b>Ctrl+X</b> to quit. In these lessons you get an editor with a Run button instead.',
          teaches: ['nano keys'],
        },
        {
          id: 'sc1-match', type: 'match',
          prompt: 'Match each one to what it does.',
          pairs: [['nano hello.sh', 'Opens hello.sh in an editor'], ['Ctrl+O', 'Saves the file in nano'], ['Ctrl+X', 'Quits nano'], ['#!/bin/bash', 'Says which program runs the script']],
          needs: ['nano keys', 'shebang'],
          explain: 'nano is the editor you will find on almost every Linux machine; its keys are listed along its bottom edge.',
        },
        {
          id: 'sc1-run', type: 'learn', new: true, title: 'Write, <code>chmod +x</code>, run',
          body: 'Write the file, give it the x permission once with <code>chmod +x hello.sh</code>, then run it by its path: <code>./hello.sh</code>. bash reads the file again on every run, so after an edit just run it again.',
          demo: { setup: desk(), run: ['chmod +x hello.sh', './hello.sh'] },
        },
        {
          id: 'sc1-order', type: 'order',
          prompt: 'Make a new script <code>tidy.sh</code> and run it. Put the steps in order.',
          steps: ['nano tidy.sh', 'chmod +x tidy.sh', './tidy.sh'],
          needs: ['nano keys'],
          explain: 'Write it, make it executable (once), run it by its path.',
        },
        {
          id: 'sc1-outcome', type: 'outcome', new: true,
          prompt: 'What does <code>bash plan.sh</code> print?',
          setup: (sh) => sh.setupFiles({ 'plan.sh': S('# The plan for today\necho "Wake up"\n# echo "Go back to sleep"\necho "Write a script"\n') }),
          command: 'bash plan.sh',
          show: 'output',
          distractors: [['cat plan.sh'], ['grep echo plan.sh']],
          explain: 'Lines starting with <code>#</code> are skipped, even when they look like commands.',
        },
        {
          id: 'sc1-fill', type: 'fill',
          prompt: 'A bash script\'s first line. Fill in how it starts.',
          before: '', after: '/bin/bash',
          options: ['#!', '#', '//', '$'],
          answer: 0,
          needs: ['shebang'],
          explain: '<code>#!</code> (hash, bang) then the program that should run the file.',
        },
        {
          id: 'sc1-script-today', type: 'script', run: 'exec',
          prompt: 'Finish <code>today.sh</code>: after the list, it should print one more line, <code>N things to do</code>, with N counted from <code>todo.txt</code>.',
          file: 'today.sh',
          setup: desk(), variant: desk(1),
          runs: [{}],
          starter: S('# Show my to-do list, then how many things are on it\ncat todo.txt\n'),
          solution: S('# Show my to-do list, then how many things are on it\ncat todo.txt\necho "$(wc -l < todo.txt) things to do"\n'),
          check: (sh) => runOutIs(sh, 0, [...fileLines(sh, 'todo.txt'), `${lineCount(sh, 'todo.txt')} things to do`]),
          explain: '<code>echo "$(wc -l < todo.txt) things to do"</code>: the <code>$( )</code> puts the count into the sentence. The <code><</code> keeps the file name out of it.',
        },
        {
          id: 'sc1-type-run', type: 'type',
          prompt: '<code>backup.sh</code> is written but has never run. Make it executable, then run it with <code>./</code>.',
          setup: desk(), variant: desk(1),
          check: (sh) => {
            const want = txtIn(sh, 'notes');
            return isExecutable(sh, 'backup.sh') && filesUnder(sh, 'backup').sort().join() === want.join() && lastOutIs(sh, `Backed up ${want.length} files`);
          },
          solution: 'chmod +x backup.sh\n./backup.sh',
          explain: '<code>chmod +x backup.sh</code> once, then <code>./backup.sh</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-scripts-2', title: 'Arguments',
      exercises: [
        {
          id: 'sc2-args', type: 'learn', new: true, title: '<code>$1</code>, <code>$2</code>: the arguments',
          body: 'Words after a script\'s name are its arguments. In <code>./greet.sh Ada Bo</code> the script sees Ada as <code>$1</code> and Bo as <code>$2</code>. Quotes keep words together: <code>./greet.sh "Ada Lovelace"</code> is one argument.',
          teaches: ['script arguments'],
          demo: { setup: argv(), run: ['cat greet.sh', 'bash greet.sh Ada', 'bash greet.sh "Ada Lovelace"'] },
        },
        {
          id: 'sc2-which', type: 'choice',
          prompt: 'You run <code>./copy.sh a.txt b.txt</code>. What is <code>$2</code> inside the script?',
          options: ['b.txt', 'a.txt', './copy.sh', '2'],
          answer: 0,
          needs: ['script arguments'],
          explain: 'Arguments are numbered from 1, in the order you typed them.',
        },
        {
          id: 'sc2-count', type: 'learn', new: true, title: '<code>$#</code> and <code>$0</code>',
          body: '<code>$#</code> is how many arguments the script got. <code>$0</code> is the script\'s own name, as it was run: handy in messages like <code>echo "Usage: $0 FILE"</code>.',
          demo: { setup: argv(), run: ['cat info.sh', 'bash info.sh a b c', 'bash info.sh'] },
        },
        {
          id: 'sc2-outcome', type: 'outcome', new: true,
          prompt: '<code>info.sh</code> prints <code>$0 got $# arguments</code>. What does this print?',
          setup: argv(),
          command: 'bash info.sh "one two" three',
          show: 'output',
          distractors: [['bash info.sh one two three'], ['bash info.sh']],
          explain: '"one two" is a single argument because of the quotes, so <code>$#</code> is 2.',
        },
        {
          id: 'sc2-all', type: 'learn', new: true, title: '<code>"$@"</code>: all of them',
          body: '<code>"$@"</code> stands for every argument, each kept whole, spaces and all. Hand them on to a command: <code>wc -l "$@"</code> counts the lines of every file you name. Always write it in double quotes.',
          demo: { setup: argv(), run: ['cat count.sh', 'bash count.sh notes.txt todo.txt'] },
        },
        {
          id: 'sc2-match', type: 'match',
          prompt: 'Inside a script, match each one to what it holds.',
          pairs: [['$1', 'The first argument'], ['$#', 'How many arguments there are'], ['"$@"', 'Every argument, each kept whole'], ['$0', 'The name the script was run as']],
          needs: ['script arguments'],
          explain: 'Numbers are positions, <code>#</code> is a count, <code>@</code> is all of them.',
        },
        {
          id: 'sc2-fill', type: 'fill',
          prompt: 'Inside a script, print the second argument.',
          before: 'echo "Second: ', after: '"',
          options: ['$2', '$1', '2', '$#'],
          answer: 0,
          needs: ['script arguments'],
          explain: '<code>$2</code>. Without the <code>$</code> it would just print the digit 2.',
        },
        {
          id: 'sc2-build', type: 'build',
          prompt: 'Inside a script, print how many arguments it was given.',
          tiles: ['echo', '$#', '$@', '$1', '#'],
          answers: [['echo', '$#']],
          explain: '<code>echo $#</code>. A bare <code>#</code> would start a comment.',
        },
        {
          id: 'sc2-type-quote', type: 'type',
          prompt: 'Run <code>greet.sh</code> so that it greets <code>Ada Lovelace</code>, first and last name together.',
          setup: argv(), variant: argv(1),
          check: (sh) => lastOutIs(sh, `${greetWord(sh)} Ada Lovelace`),
          solution: 'bash greet.sh "Ada Lovelace"',
          explain: '<code>bash greet.sh "Ada Lovelace"</code>. Without the quotes, Lovelace is <code>$2</code> and the script never prints it.',
        },
        {
          id: 'sc2-script-fix', type: 'script',
          prompt: '<code>backup.sh FILE</code> should save a copy of FILE as <code>FILE.bak</code>, but it never saves anything. Fix it.',
          file: 'backup.sh',
          setup: argv(),
          runs: [{ args: ['notes.txt'] }, { args: ['todo.txt'] }],
          starter: S('# Usage: backup.sh FILE   (saves a copy as FILE.bak)\ncp "$2" "$2.bak"\necho "Saved $2.bak"\n'),
          solution: S('# Usage: backup.sh FILE   (saves a copy as FILE.bak)\ncp "$1" "$1.bak"\necho "Saved $1.bak"\n'),
          check: (sh) => sh.runs?.length === 2 && sh.runs.every((r) => fileText(sh, `${r.args[0]}.bak`) === fileText(sh, r.args[0]) && r.out.trim() === `Saved ${r.args[0]}.bak`),
          explain: 'The script is run with one argument, so it is <code>$1</code>. <code>$2</code> is empty.',
        },
        {
          id: 'sc2-script-total', type: 'script',
          prompt: 'Write <code>total.sh</code>: it prints the total number of lines in all the files it is given, as one number.',
          file: 'total.sh',
          setup: argv(),
          runs: [{ args: ['notes.txt'] }, { args: ['notes.txt', 'todo.txt'] }],
          starter: S('# Usage: total.sh FILE...\n# Print how many lines all the files have together\n'),
          solution: S('# Usage: total.sh FILE...\n# Print how many lines all the files have together\ncat "$@" | wc -l\n'),
          check: (sh) => sh.runs?.length === 2 && sh.runs.every((r) => r.out.trim() === String(r.args.reduce((s, f) => s + lineCount(sh, f), 0))),
          explain: '<code>cat "$@" | wc -l</code>: cat joins every file into one stream, wc counts its lines. (<code>wc -l "$@"</code> prints a line per file plus a total.)',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-scripts-3', title: 'Exit codes',
      exercises: [
        {
          id: 'sc3-status', type: 'learn', new: true, title: 'Did it work? The exit status',
          body: 'Every command ends with an exit status: 0 means it worked, anything else means trouble (127: command not found). <code>echo $?</code> prints the status of the command just before it.',
          teaches: ['exit status 127'],
          demo: { setup: logs(), run: ['ls notes.txt', 'echo $?', 'ls nope.txt; echo $?'] },
        },
        {
          id: 'sc3-match', type: 'match',
          prompt: 'Match each exit status to what it tells you.',
          pairs: [['0', 'It worked'], ['1 from grep', 'No line matched'], ['127', 'Command not found'], ['$?', 'The last command\'s status']],
          needs: ['exit status 127', 'the exit status'],
          explain: 'Only 0 means success. Each program picks its own numbers for the kinds of failure.',
        },
        {
          id: 'sc3-or', type: 'learn', new: true, title: '<code>&&</code> and <code>||</code>',
          body: '<code>a && b</code> runs b only if a worked; <code>a || b</code> runs b only if a failed. <code>grep -q</code> prints nothing and just sets the status, which fits here: <code>grep -q ERROR app.log && echo "Errors!"</code>.',
          demo: { setup: logs(), run: ['grep -q ERROR app.log && echo "Errors!"', 'grep -q PANIC app.log || echo "No panic"'] },
        },
        {
          id: 'sc3-outcome', type: 'outcome', new: true,
          prompt: 'There is no <code>plan.txt</code> here. What does this print?',
          setup: logs(),
          command: 'cat plan.txt 2> /dev/null || echo "No plan yet"',
          show: 'output',
          distractors: [['cat notes.txt 2> /dev/null || echo "No plan yet"'], ['cat notes.txt && echo "No plan yet"']],
          explain: 'cat fails (its error goes to /dev/null), so the part after <code>||</code> runs.',
        },
        {
          id: 'sc3-exit', type: 'learn', new: true, title: '<code>exit N</code>',
          body: 'A script\'s exit status is that of its last command. <code>exit 1</code> stops the script right there and reports failure; <code>exit 0</code> stops it with success. So <code>cd "$1" || exit 1</code> means: go there, or give up.',
          teaches: ['exit stops the script'],
          demo: { setup: (sh) => sh.setupFiles({ 'stop.sh': S('echo "start"\nexit 3\necho "end"\n') }), run: ['cat stop.sh', 'bash stop.sh || echo "stop.sh said $?"'] },
        },
        {
          id: 'sc3-choice', type: 'choice',
          prompt: 'What does this script print, and what is <code>$?</code> afterwards?',
          code: '#!/bin/bash\necho one\nexit 4\necho two',
          options: ['one, and $? is 4', 'one and two, and $? is 0', 'one and two, and $? is 4', 'one, and $? is 0'],
          answer: 0,
          needs: ['exit stops the script'],
          explain: '<code>exit 4</code> ends the script on the spot, with status 4. <code>echo two</code> never runs.',
        },
        {
          id: 'sc3-fill', type: 'fill',
          prompt: 'In a script: go into the folder given as <code>$1</code>, or stop the script if that fails.',
          before: 'cd "$1" ', after: ' exit 1',
          options: ['||', '&&', '|', ';'],
          answer: 0,
          needs: ['exit stops the script'],
          explain: '<code>||</code> runs <code>exit 1</code> only when cd failed. With <code>;</code> the script would always stop.',
        },
        {
          id: 'sc3-build', type: 'build',
          prompt: 'Print <code>Found errors</code> only if app.log contains ERROR. grep itself should print nothing.',
          tiles: ['grep', '-q', 'ERROR', 'app.log', '&&', 'echo', '"Found errors"', '||', '-v'],
          answers: [['grep', '-q', 'ERROR', 'app.log', '&&', 'echo', '"Found errors"']],
          explain: '<code>-q</code> keeps grep quiet; <code>&&</code> runs echo only when it found a match.',
        },
        {
          id: 'sc3-type-clear', type: 'type',
          prompt: 'Print <code>Found errors</code> if app.log contains ERROR, and <code>All clear</code> if it doesn\'t.',
          setup: logs(), variant: logs(1),
          check: (sh) => lastOutIs(sh, hasError(sh) ? 'Found errors' : 'All clear'),
          solution: 'grep -q ERROR app.log && echo "Found errors" || echo "All clear"',
          explain: '<code>grep -q ERROR app.log && echo "Found errors" || echo "All clear"</code>. The second set of files has no errors, so it must say All clear there.',
        },
        {
          id: 'sc3-script-cd', type: 'script',
          prompt: '<code>clean.sh DIR</code> deletes the .tmp files in DIR. Given a folder that doesn\'t exist, it deletes the .tmp files <b>here</b> instead. Make it stop with exit status 1 when the cd fails.',
          file: 'clean.sh',
          setup: cleanable,
          runs: [{ args: ['cache'] }, { args: ['nope'], code: 1 }],
          starter: S('# Usage: clean.sh DIR   (deletes the .tmp files in DIR)\ncd "$1"\nrm *.tmp\necho "Cleaned $1"\n'),
          solution: S('# Usage: clean.sh DIR   (deletes the .tmp files in DIR)\ncd "$1" || exit 1\nrm *.tmp\necho "Cleaned $1"\n'),
          check: (sh) => runCode(sh, 1) === 1 && runOutIs(sh, 0, 'Cleaned cache') && listOf(sh, 'cache').join() === 'keep.txt' && fileText(sh, 'draft.tmp') === 'my draft\n',
          explain: '<code>cd "$1" || exit 1</code>: when there is no such folder, the script stops before rm can touch the wrong files.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-scripts-4', title: 'Debugging',
      exercises: [
        {
          id: 'sc4-read', type: 'learn', new: true, title: 'Reading a script\'s error',
          body: 'When a script hits a problem, bash names the script and the line: <code>tidy.sh: line 3: ehco: command not found</code>. Go to that line first. The lines before it ran, and by default so do the lines after it.',
          teaches: ['line N in errors', 'scripts carry on after errors'],
          demo: { setup: workbench(), run: ['bash tidy.sh', 'ls'] },
        },
        {
          id: 'sc4-where', type: 'choice',
          prompt: 'What does this error tell you?',
          code: '$ ./report.sh\n./report.sh: line 4: cd: logs: No such file or directory',
          options: ['Line 4 of report.sh tried to cd into logs, and there is no logs folder', 'report.sh has no line 4', 'report.sh is not executable', 'The cd command is missing'],
          answer: 0,
          needs: ['line N in errors'],
          explain: 'Script name, line number, then the command\'s own error. Look at line 4 and the folder it expects.',
        },
        {
          id: 'sc4-x', type: 'learn', new: true, title: '<code>bash -x</code>: watch it run',
          body: '<code>bash -x lines.sh notes.txt</code> runs the script and prints every command just before running it, after the variables were filled in, with a <code>+</code> in front. You see what bash really ran, not what you meant.',
          teaches: ['bash -x trace'],
          demo: { setup: workbench(), run: ['bash -x lines.sh notes.txt'] },
        },
        {
          id: 'sc4-trace', type: 'choice',
          prompt: 'Line 2 of backup.sh is <code>cp "$1" backup/</code>. What went wrong here?',
          code: '$ bash -x backup.sh\n+ cp \'\' backup/\ncp: cannot stat \'\': No such file or directory',
          options: ['$1 was empty: the script was run without a file name', 'backup/ does not exist', 'cp needs -r', 'backup.sh is not executable'],
          answer: 0,
          needs: ['bash -x trace', 'script arguments'],
          explain: 'The trace shows <code>\'\'</code> where the file name should be: nothing was passed as <code>$1</code>.',
        },
        {
          id: 'sc4-e', type: 'learn', new: true, title: '<code>set -e</code>: stop at the first failure',
          body: 'A script normally carries on after a failed command, and the lines after it can make a mess. With <code>set -e</code> near the top, bash stops the script at the first command that fails, with that command\'s status.',
          teaches: ['set -e stops at a failure'],
          demo: { setup: workbench(), run: ['cat deploy.sh', 'bash deploy.sh || echo "stopped with status $?"'] },
        },
        {
          id: 'sc4-match', type: 'match',
          prompt: 'Match each one to what it is for.',
          pairs: [['bash -x s.sh', 'Shows each command before it runs'], ['set -e', 'Stops the script at the first failure'], ['s.sh: line 3:', 'Where to look'], ['ehco: command not found', 'A typo in a command name']],
          needs: ['set -e stops at a failure', 'line N in errors', 'exit status 127'],
          explain: 'The error says where, <code>bash -x</code> shows what ran, <code>set -e</code> keeps one failure from causing more.',
        },
        {
          id: 'sc4-fill', type: 'fill',
          prompt: 'The line that makes a script stop at the first command that fails.',
          before: '', after: ' -e',
          options: ['set', 'bash', 'exit', 'export'],
          answer: 0,
          needs: ['set -e stops at a failure'],
          explain: '<code>set -e</code>, usually right under the shebang.',
        },
        {
          id: 'sc4-type-x', type: 'type',
          prompt: 'Run <code>count.sh</code> on <code>notes.txt</code> with tracing on, so you see every command it runs.',
          setup: workbench(), variant: workbench(1),
          check: (sh) => /^\+ file=notes\.txt$/m.test(lastErr(sh)) && lastOutIs(sh, countLine(sh, 'notes.txt')),
          solution: 'bash -x count.sh notes.txt',
          explain: '<code>bash -x count.sh notes.txt</code>: the <code>+</code> lines are the trace, the last line is what the script prints.',
        },
        {
          id: 'sc4-script-typo', type: 'script',
          prompt: '<code>lines.sh FILE</code> should print <code>FILE: N lines</code>, but the name comes out empty. Find the typo and fix it.',
          file: 'lines.sh',
          setup: workbench(),
          runs: [{ args: ['notes.txt'] }, { args: ['todo.txt'] }],
          starter: S('# Usage: lines.sh FILE\nfile=$1\ncount=$(wc -l < "$file")\necho "$fiel: $count lines"\n'),
          solution: S('# Usage: lines.sh FILE\nfile=$1\ncount=$(wc -l < "$file")\necho "$fiel: $count lines"\n'.replace('$fiel', '$file')),
          check: (sh) => sh.runs?.length === 2 && sh.runs.every((r) => r.out.trim() === `${r.args[0]}: ${lineCount(sh, r.args[0])} lines`),
          explain: '<code>$fiel</code> is a variable nobody set, so it is empty. <code>bash -x</code> would show <code>echo \': 2 lines\'</code>.',
        },
        {
          id: 'sc4-script-e', type: 'script',
          prompt: '<code>deploy.sh</code> says Deployed even when the copy fails. Add one line so it stops at the first command that fails.',
          file: 'deploy.sh',
          setup: workbench(),
          runs: [{ code: 1 }],
          starter: S('# Copy the site into public/, then report\ncp -r site/* public/\necho "Deployed"\n'),
          solution: S('# Copy the site into public/, then report\nset -e\ncp -r site/* public/\necho "Deployed"\n'),
          check: (sh) => runCode(sh, 0) === 1 && runOut(sh, 0) === '',
          explain: '<code>set -e</code> under the shebang: cp fails (there is no public/ folder), so the script stops with cp\'s status 1 and never claims success.',
        },
      ],
    },
  ],
};
