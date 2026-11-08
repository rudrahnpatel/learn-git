// Bash unit 3: Reading files. cat (and -n), less, head/tail, wc, and finding help (man, --help, type, which).
import { fileText, lastOut, lastOutIs, ran, printed, printedLines, printedNumber, lineCount, wordCount, numberedLines, logLines } from './helpers.js';

// A kitchen folder: short files worth reading. `v` gives other contents (the anti-cheat replay).
const kitchen = (v = 0) => (sh) => sh.setupFiles(v ? {
  'recipe.txt': 'Tomato soup\n4 tomatoes\n1 onion\nSalt\nBlend and heat\n',
  'shopping.txt': 'rice\nlemons\n',
  'essay.txt': 'The sea is loud at night and the boats knock together.\n',
} : {
  'recipe.txt': 'Pancakes\n2 eggs\n1 cup flour\n1 cup milk\n',
  'shopping.txt': 'eggs\nflour\nmilk\nbutter\n',
  'essay.txt': 'Cats sleep for most of the day.\nThey save energy for the night.\n',
});
// A server folder with a log long enough to need head, tail and wc.
const server = (v = 0) => (sh) => sh.setupFiles(v ? {
  'server.log': logLines(17, 3), 'access.log': logLines(31, 2),
  'people.csv': 'name,city\nIrene,Lima\nOmar,Oslo\nPia,Rome\nJon,Kyiv\n',
} : {
  'server.log': logLines(12, 1), 'access.log': logLines(42, 1),
  'people.csv': 'name,city\nAda,Paris\nBo,Tokyo\nCy,Cairo\n',
});
const lines = (sh, p) => lineCount(sh, p);

export default {
  id: 'bash-reading', title: 'Reading files', color: 'sky',
  blurb: 'Look inside files: all of them, the top, the bottom, and counts.',
  challenges: [
    {
      id: 'bash-notes-audit', title: 'Notes audit', blurb: 'Count and read a folder of notes without opening an editor.',
      exercises: [
        {
          id: 'rdc-count-all', type: 'type', max: 6,
          prompt: 'Count the lines of every <code>.txt</code> file in <code>notes</code> with one command, so you also get a total.',
          setup: (sh) => sh.setupFiles({ 'notes/a.txt': 'one\ntwo\n', 'notes/b.txt': 'x\ny\nz\n', 'notes/c.txt': 'solo\n' }),
          variant: (sh) => sh.setupFiles({ 'notes/a.txt': 'one\n', 'notes/b.txt': 'p\nq\nr\ns\nt\n', 'notes/c.txt': 'm\nn\n' }),
          check: (sh) => {
            const want = ['a', 'b', 'c'].map((n) => `${lines(sh, `notes/${n}.txt`)} notes/${n}.txt`);
            const total = ['a', 'b', 'c'].reduce((s, n) => s + lines(sh, `notes/${n}.txt`), 0);
            const got = lastOut(sh).split('\n').map((l) => l.trim().replace(/\s+/g, ' '));
            return want.every((w) => got.includes(w)) && got.includes(`${total} total`);
          },
          solution: 'wc -l notes/*.txt',
          explain: 'Give <code>wc -l</code> several files (a wildcard does it) and it adds a <code>total</code> line at the end.',
        },
        {
          id: 'rdc-all-numbered', type: 'type', max: 6,
          prompt: 'Print all three notes in <code>notes</code> (a, b, then c) as one numbered listing.',
          setup: (sh) => sh.setupFiles({ 'notes/a.txt': 'one\ntwo\n', 'notes/b.txt': 'x\ny\nz\n', 'notes/c.txt': 'solo\n' }),
          variant: (sh) => sh.setupFiles({ 'notes/a.txt': 'one\n', 'notes/b.txt': 'p\nq\nr\ns\nt\n', 'notes/c.txt': 'm\nn\n' }),
          check: (sh) => lastOutIs(sh, numberedLines(['a', 'b', 'c'].map((n) => fileText(sh, `notes/${n}.txt`)).join(''))),
          solution: 'cat -n notes/*.txt',
          explain: '<code>cat</code> chains the files in name order and <code>-n</code> numbers the lines straight through.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-reading-1', title: 'Look inside',
      exercises: [
        {
          id: 'rd1-cat', type: 'learn', new: true, title: '<code>cat</code>: print a file',
          body: '<code>cat recipe.txt</code> prints the whole file into the terminal. It is the quickest way to read a short file. Nothing changes: reading never edits.',
          demo: { setup: kitchen(), run: ['cat recipe.txt'] },
        },
        {
          id: 'rd1-what', type: 'choice',
          prompt: 'What does <code>cat shopping.txt</code> do to the file?',
          options: ['Nothing: it only prints it', 'Empties it', 'Opens it in an editor', 'Moves it to the screen folder'],
          answer: 0,
          explain: '<code>cat</code> reads and prints. The file stays exactly as it was.',
        },
        {
          id: 'rd1-type-cat', type: 'type',
          prompt: 'Print the contents of <code>recipe.txt</code>.',
          setup: kitchen(), variant: kitchen(1),
          check: (sh) => printed(sh, 'recipe.txt'),
          solution: 'cat recipe.txt',
          explain: '<code>cat recipe.txt</code> prints every line of it.',
        },
        {
          id: 'rd1-two', type: 'learn', new: true, title: 'Several files in a row',
          body: '<code>cat a.txt b.txt</code> prints a.txt, then b.txt, straight after each other, in the order you name them. That is where the name comes from: con<b>cat</b>enate, to chain together.',
          demo: { setup: kitchen(), run: ['cat shopping.txt recipe.txt'] },
        },
        {
          id: 'rd1-outcome', type: 'outcome', new: true,
          prompt: '<code>a.txt</code> holds the line <code>one</code>, and <code>b.txt</code> holds <code>two</code>. What does this print?',
          setup: (sh) => sh.setupFiles({ 'a.txt': 'one\n', 'b.txt': 'two\n' }),
          command: 'cat b.txt a.txt',
          show: 'output',
          distractors: [['cat a.txt b.txt'], ['cat b.txt']],
          explain: 'The files come out in the order you list them: b.txt first.',
        },
        {
          id: 'rd1-n', type: 'learn', new: true, title: 'Line numbers: <code>cat -n</code>',
          body: '<code>cat -n recipe.txt</code> puts a number in front of every line. Handy when an error message says "line 3" and you want to find it.',
          demo: { setup: kitchen(), run: ['cat -n recipe.txt'] },
        },
        {
          id: 'rd1-fill', type: 'fill',
          prompt: 'Print <code>shopping.txt</code> with line numbers.',
          before: 'cat ', after: ' shopping.txt',
          options: ['-n', '-l', '-a', '-r'],
          answer: 0,
          explain: '<code>-n</code> numbers the lines.',
        },
        {
          id: 'rd1-less', type: 'learn', new: true, title: 'Long files: <code>less</code>',
          body: '<code>less big.log</code> shows one screen at a time. Keys: <b>Space</b> next page, <b>b</b> back a page, <b>/word</b> search, <b>q</b> quit. In this sandbox, less prints everything at once.',
          teaches: ['less keys'],
        },
        {
          id: 'rd1-match-less', type: 'match',
          prompt: 'You are reading a long file in <code>less</code>. Match each key to what it does.',
          pairs: [['Space', 'Next page'], ['b', 'Back one page'], ['/error', 'Search for "error"'], ['q', 'Quit, back to the prompt']],
          needs: ['less keys'],
          explain: 'If you ever get "stuck" in a long output, <b>q</b> is the way out.',
        },
        {
          id: 'rd1-type-numbered', type: 'type',
          prompt: 'Print <code>recipe.txt</code> with a number in front of each line.',
          setup: kitchen(), variant: kitchen(1),
          check: (sh) => lastOutIs(sh, numberedLines(fileText(sh, 'recipe.txt'))),
          solution: 'cat -n recipe.txt',
          explain: '<code>cat -n recipe.txt</code> numbers every line from 1.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-reading-2', title: 'Top and bottom',
      exercises: [
        {
          id: 'rd2-head', type: 'learn', new: true, title: '<code>head</code>: the first lines',
          body: '<code>head server.log</code> prints the first 10 lines. Pick how many with <code>-n</code>: <code>head -n 3 server.log</code> prints the first 3. Great for a peek at a file too long to <code>cat</code>.',
          demo: { setup: server(), run: ['head -n 3 server.log'] },
        },
        {
          id: 'rd2-tail', type: 'learn', new: true, title: '<code>tail</code>: the last lines',
          body: '<code>tail</code> is head\'s twin at the other end: <code>tail -n 2 server.log</code> prints the last 2 lines, where the newest log entries are. Both have a short form: <code>head -3 server.log</code>.',
          demo: { setup: server(), run: ['tail -n 2 server.log', 'head -3 server.log'] },
        },
        {
          id: 'rd2-first', type: 'choice',
          prompt: 'What does <code>head -n 1 shopping.txt</code> print?',
          code: '$ cat shopping.txt\neggs\nflour\nmilk\nbutter',
          options: ['eggs', 'butter', 'eggs flour milk butter', '1'],
          answer: 0,
          explain: '<code>head -n 1</code> prints only the first line.',
        },
        {
          id: 'rd2-outcome', type: 'outcome',
          prompt: '<code>todo.txt</code> holds four lines: wash, cook, shop, nap. What does this print?',
          setup: (sh) => sh.setupFiles({ 'todo.txt': 'wash\ncook\nshop\nnap\n' }),
          command: 'tail -n 2 todo.txt',
          show: 'output',
          distractors: [['head -n 2 todo.txt'], ['tail -n 1 todo.txt']],
          explain: 'The last two lines, in their original order: shop, then nap.',
        },
        {
          id: 'rd2-type-head', type: 'type',
          prompt: 'Print the first 3 lines of <code>server.log</code>.',
          setup: server(), variant: server(1),
          check: (sh) => printedLines(sh, 'server.log', 1, 3),
          solution: 'head -n 3 server.log',
          explain: '<code>head -n 3 server.log</code> (or <code>head -3 server.log</code>).',
        },
        {
          id: 'rd2-plus', type: 'learn', new: true, title: 'From line N to the end',
          body: 'With a plus, tail counts from the top instead: <code>tail -n +2 people.csv</code> prints from line 2 to the end. That skips a header line, like the <code>name,city</code> row of a spreadsheet file.',
          demo: { setup: server(), run: ['tail -n +2 people.csv'] },
        },
        {
          id: 'rd2-skip', type: 'choice',
          prompt: '<code>people.csv</code> starts with a header row, <code>name,city</code>. Which command prints every row except the header?',
          options: ['tail -n +2 people.csv', 'tail -n 2 people.csv', 'head -n 2 people.csv', 'head -n +2 people.csv'],
          answer: 0,
          explain: '<code>+2</code> means "start at line 2". Without the plus you would get only the last two rows.',
        },
        {
          id: 'rd2-f', type: 'learn', new: true, title: 'Watching a log: <code>tail -f</code>',
          body: '<code>tail -f app.log</code> prints the end of the file and then keeps watching, printing new lines as the program writes them. Press Ctrl+C to stop. Here it prints the file once and stops.',
          teaches: ['tail -f follows'],
        },
        {
          id: 'rd2-match', type: 'match',
          prompt: 'Match each command to what it prints.',
          pairs: [['head -n 5 f.txt', 'The first 5 lines'], ['tail -n 5 f.txt', 'The last 5 lines'], ['tail -n +5 f.txt', 'Line 5 to the end'], ['tail -f f.txt', 'The end, then new lines as they arrive']],
          explain: 'head is the top, tail the bottom; <code>+</code> counts from the top, <code>-f</code> follows.',
        },
        {
          id: 'rd2-type-tail', type: 'type',
          prompt: 'Print the last 2 lines of <code>server.log</code>: the newest entries.',
          setup: server(), variant: server(1),
          check: (sh) => printedLines(sh, 'server.log', lines(sh, 'server.log') - 1, lines(sh, 'server.log')),
          solution: 'tail -n 2 server.log',
          explain: '<code>tail -n 2 server.log</code>. Logs grow at the bottom, so the end is the news.',
        },
        {
          id: 'rd2-type-skip', type: 'type',
          prompt: 'Print every row of <code>people.csv</code> except its header line.',
          setup: server(), variant: server(1),
          check: (sh) => printedLines(sh, 'people.csv', 2, lines(sh, 'people.csv')),
          solution: 'tail -n +2 people.csv',
          explain: '<code>tail -n +2 people.csv</code> starts at line 2, however many rows there are.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-reading-3', title: 'Counting',
      exercises: [
        {
          id: 'rd3-wc', type: 'learn', new: true, title: '<code>wc</code>: word count',
          body: '<code>wc essay.txt</code> prints three numbers and the name: lines, words and bytes (about one per character). Counting beats scrolling: a log with 40 000 lines is one command away from a number.',
          demo: { setup: kitchen(), run: ['wc essay.txt'] },
        },
        {
          id: 'rd3-read', type: 'choice',
          prompt: 'In this output, what is <b>4</b>?',
          code: '$ wc shopping.txt\n 4  4 24 shopping.txt',
          options: ['The number of lines', 'The number of files', 'The size in kilobytes', 'The longest line'],
          answer: 0,
          explain: 'Lines, then words, then bytes. shopping.txt has 4 lines of one word each.',
        },
        {
          id: 'rd3-flags', type: 'learn', new: true, title: 'Just one number',
          body: 'Flags pick the count: <code>wc -l</code> lines, <code>wc -w</code> words, <code>wc -c</code> bytes. <code>wc -l access.log</code> answers "how many requests did the server log?" in one go.',
          demo: { setup: server(), run: ['wc -l access.log', 'wc -w people.csv'] },
        },
        {
          id: 'rd3-match', type: 'match',
          prompt: 'Match each command to what it counts.',
          pairs: [['wc -l f.txt', 'Lines'], ['wc -w f.txt', 'Words'], ['wc -c f.txt', 'Bytes'], ['wc f.txt', 'Lines, words and bytes']],
          explain: '<b>l</b> for lines, <b>w</b> for words, <b>c</b> for characters (bytes, really).',
        },
        {
          id: 'rd3-build', type: 'build',
          prompt: 'Count the lines in <code>access.log</code>.',
          tiles: ['wc', '-l', 'access.log', '-w', 'cat', 'head'],
          answers: [['wc', '-l', 'access.log']],
          explain: '<code>wc -l access.log</code> prints the line count and the name.',
        },
        {
          id: 'rd3-type-lines', type: 'type',
          prompt: 'How many lines does <code>access.log</code> have? Make the terminal tell you.',
          setup: server(), variant: server(1),
          check: (sh) => printedNumber(sh, lineCount(sh, 'access.log')),
          solution: 'wc -l access.log',
          explain: '<code>wc -l access.log</code> counts them. Typing the number you saw with <code>echo</code> would not count: the check runs your commands again on a log of a different length.',
        },
        {
          id: 'rd3-outcome', type: 'outcome',
          prompt: '<code>poem.txt</code> holds two lines: <code>roses are red</code> and <code>violets are blue</code>. What does this print?',
          setup: (sh) => sh.setupFiles({ 'poem.txt': 'roses are red\nviolets are blue\n' }),
          command: 'wc -w poem.txt',
          show: 'output',
          distractors: [['wc -l poem.txt'], ['wc -c poem.txt']],
          explain: 'Six words over two lines. <code>-w</code> counts words, <code>-l</code> would say 2.',
        },
        {
          id: 'rd3-many', type: 'learn', new: true, title: 'Count many files',
          body: 'Give wc several files and it counts each one, then adds a <b>total</b> line: <code>wc -l *.txt</code>. A wildcard plus wc is a quick size-up of a whole folder.',
          demo: { setup: kitchen(), run: ['wc -l *.txt'] },
        },
        {
          id: 'rd3-fill', type: 'fill',
          prompt: 'Count the words in <code>essay.txt</code>.',
          before: 'wc ', after: ' essay.txt',
          options: ['-w', '-l', '-c', '-n'],
          answer: 0,
          explain: '<code>-w</code> counts words.',
        },
        {
          id: 'rd3-type-words', type: 'type',
          prompt: 'How many words are in <code>essay.txt</code>?',
          setup: kitchen(), variant: kitchen(1),
          check: (sh) => printedNumber(sh, wordCount(sh, 'essay.txt')),
          solution: 'wc -w essay.txt',
          explain: '<code>wc -w essay.txt</code> prints the word count first.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-reading-4', title: 'Getting help',
      exercises: [
        {
          id: 'rd4-man', type: 'learn', new: true, title: 'The manual: <code>man</code>',
          body: 'Every command has a manual page. <code>man wc</code> shows what wc does and every flag it takes. A real one opens in a pager like <code>less</code>, so <b>q</b> quits.',
          demo: { setup: kitchen(), run: ['man wc'] },
        },
        {
          id: 'rd4-help', type: 'learn', new: true, title: 'The quick version: <code>--help</code>',
          body: 'Most commands print a short summary of their flags with <code>--help</code>: <code>head --help</code>. Faster than the manual when you only forgot a letter.',
          teaches: ['wc --help', 'ls --help', 'tail --help'],
          demo: { setup: kitchen(), run: ['head --help'] },
        },
        {
          id: 'rd4-which-way', type: 'choice',
          prompt: 'You forgot what <code>-c</code> means for wc. What is the quickest way to check?',
          options: ['wc --help', 'wc -c --what', 'help me wc', 'cat wc'],
          answer: 0,
          explain: '<code>--help</code> prints the flags right in the terminal. <code>man wc</code> works too.',
        },
        {
          id: 'rd4-order', type: 'order',
          prompt: 'Put the steps of looking up a flag in the manual in order.',
          steps: ['Run man tail', 'Find the flag under OPTIONS', 'Press q to get back to the prompt'],
          explain: 'Open, read, quit. The manual never changes anything.',
        },
        {
          id: 'rd4-type-man', type: 'type',
          prompt: 'Open the manual page for <code>tail</code>.',
          setup: kitchen(),
          check: (sh) => ran(sh, /^man\s+tail\b/) || ran(sh, /^tail\s+--help\b/),
          solution: 'man tail',
          explain: '<code>man tail</code> (or <code>tail --help</code>).',
        },
        {
          id: 'rd4-type', type: 'learn', new: true, title: 'What is this command? <code>type</code>',
          body: 'Some commands are built into bash itself; most are program files. <code>type cd</code> says "cd is a shell builtin", <code>type ls</code> says "ls is /usr/bin/ls".',
          demo: { setup: kitchen(), run: ['type cd', 'type ls'] },
        },
        {
          id: 'rd4-builtin', type: 'choice',
          prompt: 'What does this tell you?',
          code: '$ type pwd\npwd is a shell builtin',
          options: ['pwd is part of bash itself, not a separate program', 'pwd is broken', 'pwd is a file in your home folder', 'pwd needs to be installed'],
          answer: 0,
          explain: 'Builtins run inside the shell. Everything else is a program file somewhere on the disk.',
        },
        {
          id: 'rd4-which', type: 'learn', new: true, title: 'Where does it live? <code>which</code>',
          body: '<code>which head</code> prints the path of the program that runs when you type head: <code>/usr/bin/head</code>. Programs live in a few standard folders like <code>/usr/bin</code>.',
          demo: { setup: kitchen(), run: ['which head'] },
        },
        {
          id: 'rd4-match', type: 'match',
          prompt: 'Match each command to the answer it gives.',
          pairs: [['man ls', 'The full manual page'], ['ls --help', 'A quick list of flags'], ['type ls', 'Whether ls is a builtin or a program'], ['which ls', 'Where the ls program file is']],
          explain: 'Four ways to ask the shell about a command, from the most detail to the least.',
        },
        {
          id: 'rd4-type-which', type: 'type',
          prompt: 'Find out where the <code>head</code> program file lives.',
          setup: kitchen(),
          check: (sh) => ran(sh, /^(which|type)\s+head\b/),
          solution: 'which head',
          explain: '<code>which head</code> prints <code>/usr/bin/head</code>. <code>type head</code> says the same in a sentence.',
        },
      ],
    },
  ],
};
