// Bash unit 8: Variables and environment. name=value and $name, quoting and word splitting, export and the
// environment, $( ) and $(( )), and making the shell yours with alias, ~/.bashrc and source.
import { isFile, fileText, fileIs, fileHas, listOf, lastOut, lastOutIs, printedNumber, lineCount, varIs, isExported, aliasIs } from './helpers.js';

// A home with a few files and plain (not exported) variables set by the exercise. `v` gives other values.
const shelf = (v = 0) => (sh) => {
  sh.setupFiles(v ? {
    'notes.txt': 'Pack the tent\nCheck the map\nBuy water\nCall home\n', 'todo.txt': 'fix the sink\n',
    'old list.txt': 'socks\nboots\n', 'photos/a.jpg': '', 'photos/b.jpg': '', 'photos/c.jpg': '', 'photos/d.jpg': '', 'photos/e.jpg': '',
    '.bashrc': '# my settings\nalias ll="ls -l"\n',
  } : {
    'notes.txt': 'Learn bash\nWater the plants\n', 'todo.txt': 'call the bank\nbuy bread\n',
    'my notes.txt': 'milk\neggs\nflour\n', 'photos/x.jpg': '', 'photos/y.jpg': '', 'photos/z.jpg': '',
    '.bashrc': '# my settings\n',
  });
  sh.setupEnv(v ? { file: 'todo.txt', f: 'old list.txt', name: 'summer plans.txt', a: '17', b: '25' } : { file: 'notes.txt', f: 'my notes.txt', name: 'trip ideas.txt', a: '4', b: '9' }, { exported: false });
};
// A script that greets whoever is in $NAME, and EDITOR already exported. `v` greets differently.
const greeter = (v = 0) => (sh) => {
  sh.setupFiles({ 'greet.sh': `#!/bin/bash\necho "${v ? 'Hello there' : 'Hi'} $NAME"\n`, 'show.sh': '#!/bin/bash\necho "City: $CITY"\n' });
  sh.setupEnv({ EDITOR: v ? 'vim' : 'nano' });
};
const notesDir = (v = 0) => (sh) => sh.setupFiles(v ? { 'notes/a.txt': 'one\ntwo\n', 'notes/b.txt': 'x\n', 'notes/c.txt': 'p\nq\nr\ns\n', 'notes/d.txt': 'z\n' } : { 'notes/a.txt': 'one\n', 'notes/b.txt': 'x\ny\nz\n' });

const varOf = (sh, n) => sh.s.vars[n];
// what greet.sh prints for a name: its text before $NAME, then the name
const greeting = (sh, who) => `${(/echo "(.*)\$NAME"/.exec(fileText(sh, 'greet.sh') || '') || [])[1] ?? ''}${who}`;
const txtIn = (sh, d) => listOf(sh, d).filter((n) => n.endsWith('.txt'));

export default {
  id: 'bash-vars', title: 'Variables and environment', color: 'green',
  blurb: 'Store values, quote them right, pass them on, and set up your shell.',
  challenges: [
    {
      id: 'bash-dotfiles', title: 'Shell setup', blurb: 'A report in one line, and a shell set up to your taste.',
      exercises: [
        {
          id: 'vac-report', type: 'type', max: 6,
          prompt: 'Save one line into <code>report.txt</code>: <code>Report: N files, M lines</code>, where N is the number of .txt files in <code>notes</code> and M is how many lines they have together.',
          setup: notesDir(), variant: notesDir(1),
          check: (sh) => fileIs(sh, 'report.txt', `Report: ${txtIn(sh, 'notes').length} files, ${txtIn(sh, 'notes').reduce((s, n) => s + lineCount(sh, `notes/${n}`), 0)} lines`),
          solution: 'echo "Report: $(ls notes/*.txt | wc -l) files, $(cat notes/*.txt | wc -l) lines" > report.txt',
          explain: 'Two <code>$( )</code> inside one double-quoted echo, saved with <code>></code>.',
        },
        {
          id: 'vac-alias', type: 'type', max: 6,
          prompt: 'Add an alias <code>today</code> for <code>date +%F</code> to your <code>~/.bashrc</code>, so it is there in every new terminal, and make it work in this one too.',
          setup: shelf(),
          check: (sh) => fileHas(sh, '.bashrc', /alias today=["']date \+%F["']/) && aliasIs(sh, 'today', 'date +%F'),
          solution: 'echo "alias today=\'date +%F\'" >> ~/.bashrc\nsource ~/.bashrc',
          explain: 'Append the line with <code>>></code> (never <code>></code>: that would wipe the file), then <code>source ~/.bashrc</code>.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-vars-1', title: 'Variables',
      exercises: [
        {
          id: 'va1-var', type: 'learn', new: true, title: 'Variables: <code>name=Ada</code>',
          body: '<code>name=Ada</code> stores the text Ada in a variable called name. <code>$name</code> gives it back: <code>echo "Hi $name"</code> prints Hi Ada. A variable nobody set is just empty.',
          teaches: ['variables'],
          demo: { setup: shelf(), run: ['name=Ada', 'echo "Hi $name"'] },
        },
        {
          id: 'va1-spaces', type: 'learn', new: true, title: 'No spaces around <code>=</code>',
          body: 'Write <code>name=Ada</code> as one word. With spaces, <code>name = Ada</code> means "run the command name with the arguments = and Ada", and bash says <code>name: command not found</code>.',
          teaches: ['no spaces around ='],
        },
        {
          id: 'va1-spaces-choice', type: 'choice',
          prompt: 'What happens when you type <code>city = Paris</code>?',
          options: ['bash looks for a command called city and fails', 'city now holds Paris', 'city now holds " Paris"', 'It prints Paris'],
          answer: 0,
          needs: ['no spaces around ='],
          explain: 'Spaces split words, and the first word is the command. Write <code>city=Paris</code>.',
        },
        {
          id: 'va1-outcome', type: 'outcome', new: true,
          prompt: 'The variable <code>name</code> holds <code>Bo</code>. What does this print?',
          setup: (sh) => sh.setupEnv({ name: 'Bo' }, { exported: false }),
          command: 'echo "Hi $name"',
          show: 'output',
          distractors: [['echo "Hi name"'], ['echo "Hi $nam"']],
          explain: '<code>$name</code> is swapped for its value before echo runs.',
        },
        {
          id: 'va1-braces', type: 'learn', new: true, title: '<code>${name}</code>: where the name ends',
          body: 'In <code>"$fruits"</code> bash looks for a variable called fruits. Braces mark where the name stops: <code>"two ${fruit}s"</code> prints two apples.',
          demo: { setup: shelf(), run: ['fruit=apple', 'echo "two ${fruit}s"', 'echo "two $fruits"'] },
        },
        {
          id: 'va1-braces-choice', type: 'choice',
          prompt: 'After <code>fruit=pear</code>, what does <code>echo "I like $fruits"</code> print?',
          options: ['I like', 'I like pears', 'I like pear', 'I like $fruits'],
          answer: 0,
          explain: 'There is no variable fruits, so it is empty. <code>${fruit}s</code> would give pears.',
        },
        {
          id: 'va1-match', type: 'match',
          prompt: 'After <code>x=5</code>, match each command to what it prints.',
          pairs: [['echo $x', '5'], ['echo ${x}0', '50'], ['echo $x0', 'An empty line: there is no x0'], ['echo x', 'x']],
          explain: 'Without a <code>$</code> it is just a letter; with one, the longest name that fits is used.',
        },
        {
          id: 'va1-fill', type: 'fill',
          prompt: 'Store the word Hello in a variable called greeting.',
          before: 'greeting', after: 'Hello',
          options: ['=', ' = ', '==', ':='],
          answer: 0,
          needs: ['no spaces around ='],
          explain: 'One <code>=</code>, no spaces on either side.',
        },
        {
          id: 'va1-type-set', type: 'type',
          prompt: 'Store <code>Lisbon</code> in a variable called <code>city</code>.',
          setup: shelf(),
          check: (sh) => varIs(sh, 'city', 'Lisbon'),
          solution: 'city=Lisbon',
          explain: '<code>city=Lisbon</code>. Check it with <code>echo $city</code>.',
        },
        {
          id: 'va1-type-use', type: 'type',
          prompt: 'The variable <code>file</code> holds the name of a file here. Print that file, using the variable.',
          setup: shelf(), variant: shelf(1),
          check: (sh) => lastOutIs(sh, fileText(sh, varOf(sh, 'file')) ?? '\0'),
          solution: 'cat "$file"',
          explain: '<code>cat "$file"</code>. Typing the name yourself fails the check: on the second set of files the variable holds another name.',
        },
        {
          id: 'va1-type-bak', type: 'type',
          prompt: 'Copy the file named in <code>$file</code> to the same name with <code>.bak</code> added at the end.',
          setup: shelf(), variant: shelf(1),
          check: (sh) => isFile(sh, `${varOf(sh, 'file')}.bak`) && fileText(sh, `${varOf(sh, 'file')}.bak`) === fileText(sh, varOf(sh, 'file')),
          solution: 'cp "$file" "${file}.bak"',
          explain: '<code>cp "$file" "${file}.bak"</code>. A dot can\'t be part of a name, so <code>"$file.bak"</code> works too.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-vars-2', title: 'Quotes',
      exercises: [
        {
          id: 'va2-kinds', type: 'learn', new: true, title: '<code>"double"</code> and <code>\'single\'</code>',
          body: 'Double quotes keep spaces together but still swap in <code>$variables</code>. Single quotes keep everything exactly as typed: <code>echo \'Hi $name\'</code> prints Hi $name.',
          teaches: ['double vs single quotes'],
          demo: { setup: shelf(), run: ['name=Ada', 'echo "Hi $name"', "echo 'Hi $name'"] },
        },
        {
          id: 'va2-match', type: 'match',
          prompt: 'After <code>name=Ada</code>, match each command to what it prints.',
          pairs: [['echo "Hi $name"', 'Hi Ada'], ["echo 'Hi $name'", 'Hi $name'], ['echo "a   b"', 'a   b'], ['echo a   b', 'a b']],
          needs: ['double vs single quotes'],
          explain: 'Double quotes expand, single quotes don\'t, and without quotes the spaces only separate words.',
        },
        {
          id: 'va2-outcome', type: 'outcome',
          prompt: 'What does this print?',
          setup: () => {},
          command: "echo 'Home: $HOME'",
          show: 'output',
          distractors: [['echo "Home: $HOME"'], ['echo Home: HOME']],
          explain: 'Inside single quotes <code>$HOME</code> is just five characters.',
        },
        {
          id: 'va2-cost', type: 'choice',
          prompt: 'Which command prints exactly <code>Cost: $5</code>?',
          options: ["echo 'Cost: $5'", 'echo "Cost: $5"', 'echo Cost: $5', 'echo Cost: 5'],
          answer: 0,
          needs: ['double vs single quotes'],
          explain: '<code>$5</code> looks like a variable, and outside single quotes it is swapped for an empty value.',
        },
        {
          id: 'va2-split', type: 'learn', new: true, title: 'Always <code>"$f"</code>',
          body: 'Without quotes, a variable\'s value is split at spaces. If <code>f="my notes.txt"</code>, then <code>cat $f</code> looks for two files, my and notes.txt. <code>cat "$f"</code> passes one name. Quote your variables.',
          teaches: ['quote your variables'],
          demo: { setup: shelf(), run: ['cat "$f"'] },
        },
        {
          id: 'va2-rm', type: 'choice',
          prompt: '<code>f</code> holds <code>my notes.txt</code>. What does <code>rm $f</code> try to delete?',
          options: ['Two files: my and notes.txt', 'The file my notes.txt', 'A file called $f', 'Nothing: rm refuses'],
          answer: 0,
          needs: ['quote your variables'],
          explain: 'The unquoted value is split into two words. <code>rm "$f"</code> would delete the right file.',
        },
        {
          id: 'va2-squeeze', type: 'choice',
          prompt: 'After <code>msg="a    b"</code> (four spaces), what does <code>echo $msg</code> print?',
          options: ['a b', 'a    b', '$msg', 'a'],
          answer: 0,
          needs: ['quote your variables'],
          explain: 'Unquoted, the value is split into the words a and b, and echo joins them with one space. <code>echo "$msg"</code> keeps all four.',
        },
        {
          id: 'va2-fill', type: 'fill',
          prompt: '<code>name</code> holds a file name with a space in it. Create that file.',
          before: 'touch ', after: '',
          options: ['"$name"', "'$name'", '$name', 'name'],
          answer: 0,
          needs: ['quote your variables', 'double vs single quotes'],
          explain: 'Double quotes: the value, as one word. Single quotes would make a file literally called $name.',
        },
        {
          id: 'va2-type-cat', type: 'type',
          prompt: 'The variable <code>f</code> holds a file name with a space. Print that file.',
          setup: shelf(), variant: shelf(1),
          check: (sh) => lastOutIs(sh, fileText(sh, varOf(sh, 'f')) ?? '\0'),
          solution: 'cat "$f"',
          explain: '<code>cat "$f"</code>: the quotes keep the name in one piece.',
        },
        {
          id: 'va2-type-touch', type: 'type',
          prompt: 'Create an empty file whose name is the value of <code>$name</code>. It has a space in it, so take care.',
          setup: shelf(), variant: shelf(1),
          check: (sh) => isFile(sh, varOf(sh, 'name')) && varOf(sh, 'name').split(' ').every((w) => !isFile(sh, w)),
          solution: 'touch "$name"',
          explain: '<code>touch "$name"</code>. Without quotes you would get two files named after the two words.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-vars-3', title: 'Environment',
      exercises: [
        {
          id: 'va3-env', type: 'learn', new: true, title: 'The environment',
          body: 'Some variables are passed on to every program you start: <code>HOME</code>, <code>USER</code>, <code>PATH</code>. Together they are the environment. <code>env</code> lists them all, <code>printenv HOME</code> prints one.',
          demo: { setup: greeter(), run: ['printenv HOME', 'env'] },
        },
        {
          id: 'va3-export', type: 'learn', new: true, title: '<code>export</code>',
          body: 'A plain <code>NAME=Ada</code> stays in this shell: a script you run can\'t see it. <code>export NAME</code> (or <code>export NAME=Ada</code>) adds it to the environment, so programs started from here get it.',
          teaches: ['exported vars reach children'],
          demo: { setup: greeter(), run: ['NAME=Ada', 'bash greet.sh', 'export NAME', 'bash greet.sh'] },
        },
        {
          id: 'va3-child', type: 'choice',
          prompt: '<code>show.sh</code> prints <code>City: $CITY</code>. What does the last line print?',
          code: '$ CITY=Rome\n$ bash show.sh',
          options: ['City:', 'City: Rome', 'City: $CITY', 'An error: CITY is not set'],
          answer: 0,
          needs: ['exported vars reach children'],
          explain: 'CITY was never exported, so the script starts without it and sees an empty value.',
        },
        {
          id: 'va3-prefix', type: 'learn', new: true, title: 'For one command only',
          body: 'Put the variable in front of a command to set it just for that command: <code>NAME=Bo bash greet.sh</code>. Afterwards NAME in your shell is as it was.',
          teaches: ['one-command variable'],
          demo: { setup: greeter(), run: ['NAME=Bo bash greet.sh'] },
        },
        {
          id: 'va3-outcome', type: 'outcome', new: true,
          prompt: '<code>greet.sh</code> prints <code>Hi $NAME</code>. What does this print?',
          setup: greeter(),
          command: 'NAME=Bo bash greet.sh',
          show: 'output',
          distractors: [['NAME=Bo', 'bash greet.sh'], ['export NAME=Al', 'bash greet.sh']],
          explain: 'The prefix puts NAME=Bo in the script\'s environment for this one run.',
        },
        {
          id: 'va3-match', type: 'match',
          prompt: 'Match each line to who sees the variable.',
          pairs: [['NAME=Ada', 'Only this shell'], ['export NAME=Ada', 'This shell and the programs it starts'], ['NAME=Ada bash greet.sh', 'Only greet.sh, this one time'], ['printenv NAME', 'Prints it if it is in the environment']],
          needs: ['exported vars reach children', 'one-command variable'],
          explain: 'Exporting is what lets a variable travel to child processes.',
        },
        {
          id: 'va3-fill', type: 'fill',
          prompt: 'Set EDITOR to nano so that programs you start can see it.',
          before: '', after: ' EDITOR=nano',
          options: ['export', 'env', 'echo', 'printenv'],
          answer: 0,
          needs: ['exported vars reach children'],
          explain: '<code>export</code> sets it and puts it in the environment in one go.',
        },
        {
          id: 'va3-build', type: 'build',
          prompt: 'Print the value of the environment variable EDITOR.',
          tiles: ['printenv', 'EDITOR', '$EDITOR', 'export', 'env'],
          answers: [['printenv', 'EDITOR']],
          explain: '<code>printenv</code> takes the name without a <code>$</code>. (<code>echo $EDITOR</code> works too.)',
        },
        {
          id: 'va3-type-export', type: 'type',
          prompt: 'Set <code>NAME</code> to <code>Sam</code> so that <code>greet.sh</code> can see it, then run <code>bash greet.sh</code>.',
          setup: greeter(), variant: greeter(1),
          check: (sh) => varIs(sh, 'NAME', 'Sam') && isExported(sh, 'NAME') && lastOutIs(sh, greeting(sh, 'Sam')),
          solution: 'export NAME=Sam\nbash greet.sh',
          explain: '<code>export NAME=Sam</code>, then <code>bash greet.sh</code>.',
        },
        {
          id: 'va3-type-printenv', type: 'type',
          prompt: 'Print the value of the environment variable <code>EDITOR</code>.',
          setup: greeter(), variant: greeter(1),
          check: (sh) => lastOutIs(sh, varOf(sh, 'EDITOR')),
          solution: 'printenv EDITOR',
          explain: '<code>printenv EDITOR</code>, or <code>echo $EDITOR</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-vars-4', title: 'Command substitution and maths',
      exercises: [
        {
          id: 'va4-subst', type: 'learn', new: true, title: '<code>$( )</code>: a command\'s output, in place',
          body: '<code>$(command)</code> runs the command and puts what it printed right there: <code>echo "There are $(ls | wc -l) files"</code>. It works in variables too: <code>count=$(ls photos | wc -l)</code>.',
          demo: { setup: shelf(), run: ['echo "There are $(ls | wc -l) files"', 'count=$(ls photos | wc -l)', 'echo $count'] },
        },
        {
          id: 'va4-what', type: 'choice',
          prompt: 'What does <code>n=$(wc -l < notes.txt)</code> store in n?',
          options: ['How many lines notes.txt has', 'The text wc -l < notes.txt', 'The contents of notes.txt', 'Nothing: it prints the number'],
          answer: 0,
          explain: 'The command runs, and its output (the number) becomes the value of n.',
        },
        {
          id: 'va4-outcome', type: 'outcome',
          prompt: 'There are three files here. What does this print?',
          setup: (sh) => sh.setupFiles({ 'a.txt': '', 'b.txt': '', 'c.txt': '' }),
          command: 'echo "Files: $(ls | wc -l)"',
          show: 'output',
          distractors: [["echo 'Files: $(ls | wc -l)'"], ['echo "Files: ls"']],
          explain: 'Inside double quotes <code>$( )</code> still runs. Single quotes would print it as typed.',
        },
        {
          id: 'va4-math', type: 'learn', new: true, title: '<code>$(( ))</code>: maths',
          body: '<code>$((2 + 3))</code> gives 5. Inside, variables need no <code>$</code>: <code>n=$((n + 1))</code>. Only whole numbers: <code>$((7 / 2))</code> is 3, and <code>%</code> gives the remainder.',
          teaches: ['whole-number maths'],
          demo: { setup: shelf(), run: ['n=4', 'n=$((n + 1))', 'echo $n', 'echo $((7 / 2)) $((7 % 2))'] },
        },
        {
          id: 'va4-match', type: 'match',
          prompt: 'Match each command to what it prints.',
          pairs: [['echo $((3 * 4))', '12'], ['echo $((7 / 2))', '3'], ['echo $((10 % 3))', '1'], ['echo $((2 + 3 * 4))', '14']],
          needs: ['whole-number maths'],
          explain: 'Whole numbers only, and <code>*</code> goes before <code>+</code> as in school maths.',
        },
        {
          id: 'va4-fill', type: 'fill',
          prompt: 'Store the number of files in this folder in <code>count</code>.',
          before: 'count=', after: 'ls | wc -l)',
          options: ['$(', '$((', '(', '${'],
          answer: 0,
          explain: '<code>$( )</code> for a command\'s output. <code>$(( ))</code> is for maths.',
        },
        {
          id: 'va4-type-count', type: 'type',
          prompt: 'Store the number of files in <code>photos</code> in a variable called <code>count</code>.',
          setup: shelf(), variant: shelf(1),
          check: (sh) => varIs(sh, 'count', listOf(sh, 'photos').length),
          solution: 'count=$(ls photos | wc -l)',
          explain: '<code>count=$(ls photos | wc -l)</code>. The second set of files has a different number of photos.',
        },
        {
          id: 'va4-type-sum', type: 'type',
          prompt: 'The variables <code>a</code> and <code>b</code> hold two numbers. Print their sum.',
          setup: shelf(), variant: shelf(1),
          check: (sh) => printedNumber(sh, Number(varOf(sh, 'a')) + Number(varOf(sh, 'b'))),
          solution: 'echo $((a + b))',
          explain: '<code>echo $((a + b))</code>: no <code>$</code> needed inside the double brackets.',
        },
        {
          id: 'va4-type-line', type: 'type',
          prompt: 'Print one line: <code>notes.txt has N lines</code>, with N worked out by a command.',
          setup: shelf(), variant: shelf(1),
          check: (sh) => lastOutIs(sh, `notes.txt has ${lineCount(sh, 'notes.txt')} lines`),
          solution: 'echo "notes.txt has $(wc -l < notes.txt) lines"',
          explain: '<code>echo "notes.txt has $(wc -l < notes.txt) lines"</code>. The <code><</code> keeps the file name out of wc\'s output.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'bash-vars-5', title: 'Make it yours',
      exercises: [
        {
          id: 'va5-alias', type: 'learn', new: true, title: '<code>alias</code>: your own shortcuts',
          body: '<code>alias ll=\'ls -l\'</code> makes <code>ll</code> mean <code>ls -l</code>. <code>alias</code> on its own lists your shortcuts; <code>unalias ll</code> removes one.',
          demo: { setup: shelf(), run: ["alias ll='ls -l'", 'll photos', 'alias'] },
        },
        {
          id: 'va5-la', type: 'choice',
          prompt: 'After <code>alias la=\'ls -a\'</code>, what does <code>la photos</code> run?',
          options: ['ls -a photos', 'la photos', 'ls -a', 'alias la photos'],
          answer: 0,
          explain: 'The alias replaces the first word; the rest of the line stays.',
        },
        {
          id: 'va5-bashrc', type: 'learn', new: true, title: '<code>~/.bashrc</code>',
          body: 'Variables and aliases vanish when you close the terminal. To keep them, put them in <code>~/.bashrc</code>, a hidden file in your home that bash reads every time it starts.',
          teaches: ['bashrc runs at start'],
          demo: { setup: shelf(), run: ['cat ~/.bashrc'] },
        },
        {
          id: 'va5-source', type: 'learn', new: true, title: '<code>source</code>: load it now',
          body: 'Editing ~/.bashrc changes nothing in the terminal you have open. <code>source ~/.bashrc</code> (or <code>. ~/.bashrc</code>) runs it in this shell, so the new settings work right away.',
          teaches: ['reloading bashrc'],
          demo: { setup: shelf(), run: ['echo "alias c=clear" >> ~/.bashrc', 'source ~/.bashrc', 'alias'] },
        },
        {
          id: 'va5-why', type: 'choice',
          prompt: 'You added <code>alias ll=\'ls -l\'</code> to ~/.bashrc, but <code>ll</code> still says "command not found". Why?',
          options: ['This shell has not read ~/.bashrc since you changed it', 'Aliases only work in scripts', 'The file must be called bashrc without the dot', 'You need sudo for aliases'],
          answer: 0,
          needs: ['reloading bashrc', 'bashrc runs at start'],
          explain: 'Run <code>source ~/.bashrc</code>, or open a new terminal.',
        },
        {
          id: 'va5-match', type: 'match',
          prompt: 'Match each one to what it does.',
          pairs: [["alias ll='ls -l'", 'A shortcut for this session'], ['~/.bashrc', 'Read by bash every time it starts'], ['source ~/.bashrc', 'Runs it again in this shell, now'], ['unalias ll', 'Removes the shortcut']],
          needs: ['bashrc runs at start', 'cmd unalias'],
          explain: 'An alias lasts for the session; ~/.bashrc makes it come back every time.',
        },
        {
          id: 'va5-order', type: 'order',
          prompt: 'Make the alias <code>ll</code> permanent and use it straight away. Put the steps in order.',
          steps: ['echo "alias ll=\'ls -l\'" >> ~/.bashrc', 'source ~/.bashrc', 'll'],
          explain: 'Save it, load it, use it.',
        },
        {
          id: 'va5-fill', type: 'fill',
          prompt: 'Load the changes you just made to ~/.bashrc into this terminal.',
          before: '', after: ' ~/.bashrc',
          options: ['source', 'bash', 'cat', 'export'],
          answer: 0,
          needs: ['reloading bashrc'],
          explain: '<code>bash ~/.bashrc</code> would run it in a new shell that exits straight away, leaving yours unchanged.',
        },
        {
          id: 'va5-type-alias', type: 'type',
          prompt: 'Make an alias <code>la</code> that runs <code>ls -a</code>.',
          setup: shelf(),
          check: (sh) => aliasIs(sh, 'la', 'ls -a'),
          solution: "alias la='ls -a'",
          explain: "<code>alias la='ls -a'</code>. The quotes keep ls -a together as one value.",
        },
        {
          id: 'va5-type-bashrc', type: 'type',
          prompt: 'Add the line <code>export EDITOR=nano</code> to the end of your <code>~/.bashrc</code>, then load it into this shell.',
          setup: shelf(),
          check: (sh) => fileHas(sh, '.bashrc', /^export EDITOR=nano$/m) && fileHas(sh, '.bashrc', '# my settings') && varIs(sh, 'EDITOR', 'nano') && isExported(sh, 'EDITOR'),
          solution: 'echo "export EDITOR=nano" >> ~/.bashrc\nsource ~/.bashrc',
          explain: '<code>>></code> adds the line, <code>source</code> runs the file in this shell.',
        },
      ],
    },
  ],
};
