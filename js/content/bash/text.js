// Bash unit 6: Text processing. sort and uniq, cut and tr, sed, awk, and the classic counting pipelines.
import { fileText, fileIs, fileHas, fileLines, lastOut, lastOutIs, printedNumber, logLines } from './helpers.js';

// A web log: "ip page status", every page visited a different number of times (no ties at the top).
const visits = (v = 0) => {
  const pages = v ? [['/help', 6], ['/blog', 4], ['/home', 3], ['/login', 1]] : [['/home', 5], ['/shop', 3], ['/about', 2], ['/cart', 1]];
  const ips = v ? ['192.168.1.9', '192.168.1.4', '10.1.1.1'] : ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'];
  const list = pages.flatMap(([p, n]) => Array(n).fill(p));
  return list.map((_, i) => list[(i * 7) % list.length]).map((p, i) => `${ips[(i * 3) % ips.length]} ${p} ${p === '/cart' || p === '/login' ? 404 : 200}`).join('\n') + '\n';
};
// Small data files to slice and count. `v` gives other contents (the anti-cheat replay).
const data = (v = 0) => (sh) => sh.setupFiles(v ? {
  'fruit.txt': 'plum\nlime\nplum\nplum\nlime\nfig\nplum\n',
  'scores.txt': '3\n25\n1000\n8\n61\n',
  'people.csv': 'name,city,age\nEli,Oslo,52\nFay,Rome,34\nGus,Oslo,27\nHal,Oslo,45\nIvy,Rome,31\n',
  'visits.log': visits(1), 'app.log': logLines(23, 4),
  'poem.txt': 'a rose is a rose\nis a rose\n',
} : {
  'fruit.txt': 'pear\napple\npear\nfig\napple\npear\nkiwi\n',
  'scores.txt': '10\n9\n100\n42\n7\n',
  'people.csv': 'name,city,age\nAda,Paris,36\nBo,Tokyo,29\nCy,Paris,41\nDee,Lima,23\n',
  'visits.log': visits(0), 'app.log': logLines(30, 1),
  'poem.txt': 'the cat saw the dog\nthe dog saw a bird\n',
});
const NOTES = 'My favourite colour is teal.\nThe colour of the sea, the colour of glass.\n';
const pets = (sh) => sh.setupFiles({ 'pets.txt': 'cat and cat\nmy cat\n', 'notes.txt': NOTES });

// what the pipelines should print, worked out from the files
const rows = (sh) => fileLines(sh, 'people.csv').map((l) => l.split(','));
const counts = (items) => { const m = new Map(); for (const x of items) m.set(x, (m.get(x) || 0) + 1); return m; };
// `uniq -c` lines with the padding squeezed out: "3 pear"
const squeezed = (sh) => lastOut(sh).split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);
const sameLines = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const uniqC = (items) => [...counts([...items].sort()).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => `${n} ${k}`);
const topN = (items, n) => [...counts(items).entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${c} ${k}`);
const field = (sh, p, i) => fileLines(sh, p).map((l) => l.split(' ')[i]);

export default {
  id: 'bash-text', title: 'Text processing', color: 'red',
  blurb: 'Sort, count, cut and rewrite text with small tools in a pipe.',
  challenges: [
    {
      id: 'bash-digest', title: 'Data digest', blurb: 'Answer questions about a CSV file with one pipeline each.',
      exercises: [
        {
          id: 'txc-top-city', type: 'type', max: 6,
          prompt: 'Which city appears most often in <code>people.csv</code>? Print just its name.',
          setup: data(), variant: data(1),
          check: (sh) => lastOut(sh).trim() === topN(rows(sh).slice(1).map((r) => r[1]), 1)[0].split(' ')[1],
          solution: "cut -d, -f2 people.csv | sort | uniq -c | sort -rn | head -n 1 | awk '{print $2}'",
          explain: 'The counting recipe, then awk keeps the second field (the name) of the top line.',
        },
        {
          id: 'txc-names', type: 'type', max: 6,
          prompt: 'Save the names from <code>people.csv</code> into <code>names.txt</code>: no header, in capitals, sorted.',
          setup: data(), variant: data(1),
          check: (sh) => fileIs(sh, 'names.txt', rows(sh).slice(1).map((r) => r[0].toUpperCase()).sort()),
          solution: "sed '1d' people.csv | cut -d, -f1 | tr a-z A-Z | sort > names.txt",
          explain: 'Drop the header, keep column 1, upper-case it, sort, save. <code>tail -n +2</code> or <code>awk</code> work for the first steps too.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-text-1', title: 'sort and uniq',
      exercises: [
        {
          id: 'tx1-sortn', type: 'learn', new: true, title: '<code>sort -n</code>: numbers by value',
          body: 'Plain <code>sort</code> compares characters, so 100 comes before 9 (1 is before 9). <code>sort -n</code> compares numbers by value. <code>-r</code> still reverses: <code>sort -rn</code> puts the biggest first.',
          demo: { setup: data(), run: ['sort scores.txt', 'sort -n scores.txt'] },
        },
        {
          id: 'tx1-outcome', type: 'outcome', new: true,
          prompt: '<code>scores.txt</code> holds 10, 9, 100, 42 and 7. What does this print?',
          setup: (sh) => sh.setupFiles({ 'scores.txt': '10\n9\n100\n42\n7\n' }),
          command: 'sort -n scores.txt',
          show: 'output',
          distractors: [['sort scores.txt'], ['sort -rn scores.txt']],
          explain: 'By value, smallest first: 7, 9, 10, 42, 100.',
        },
        {
          id: 'tx1-uniq', type: 'learn', new: true, title: '<code>uniq</code>: drop repeats',
          body: '<code>uniq</code> removes a line that is the same as the one just above it. Only neighbours count, so sort first: <code>sort fruit.txt | uniq</code>. <code>sort -u</code> does both in one go.',
          teaches: ['sorted before uniq'],
          demo: { setup: data(), run: ['uniq fruit.txt', 'sort fruit.txt | uniq'] },
        },
        {
          id: 'tx1-why', type: 'choice',
          prompt: '<code>fruit.txt</code> is pear, apple, pear. Why does <code>uniq fruit.txt</code> still print pear twice?',
          options: ['uniq only removes repeats that are next to each other', 'uniq ignores the first line', 'uniq needs -c to remove anything', 'pear and pear are different lines'],
          answer: 0,
          needs: ['sorted before uniq'],
          explain: 'apple sits between the two pears. Sort first and they end up side by side.',
        },
        {
          id: 'tx1-count', type: 'learn', new: true, title: '<code>uniq -c</code>: count each one',
          body: '<code>uniq -c</code> puts a count in front of each line: how many times it repeated. <code>sort fruit.txt | uniq -c</code> tells you how many of each fruit there are.',
          demo: { setup: data(), run: ['sort fruit.txt | uniq -c'] },
        },
        {
          id: 'tx1-match', type: 'match',
          prompt: 'Match each command to what it prints.',
          pairs: [['sort -n scores.txt', 'Numbers, smallest first'], ['sort -rn scores.txt', 'Numbers, biggest first'], ['sort -u fruit.txt', 'Each fruit once, in order'], ['sort fruit.txt | uniq -c', 'Each fruit with how many times it appears']],
          explain: '<code>-n</code> for numbers, <code>-r</code> to reverse, <code>-u</code> for unique, <code>uniq -c</code> to count.',
        },
        {
          id: 'tx1-fill', type: 'fill',
          prompt: 'Count how many times each fruit appears.',
          before: 'sort fruit.txt | uniq ', after: '',
          options: ['-c', '-n', '-r', '-u'],
          answer: 0,
          explain: '<code>-c</code> for count. <code>-n</code> and <code>-r</code> belong to sort.',
        },
        {
          id: 'tx1-order', type: 'order',
          prompt: 'Count each fruit and show the most common first. Put the pieces in order.',
          steps: ['sort fruit.txt', '| uniq -c', '| sort -rn'],
          explain: 'Sort so repeats sit together, count them, then sort the counts as numbers, biggest first.',
        },
        {
          id: 'tx1-type-n', type: 'type',
          prompt: 'Print the numbers in <code>scores.txt</code> from smallest to largest.',
          setup: data(), variant: data(1),
          check: (sh) => lastOutIs(sh, fileLines(sh, 'scores.txt').map(Number).sort((a, b) => a - b).map(String)),
          solution: 'sort -n scores.txt',
          explain: '<code>sort -n scores.txt</code>. Without <code>-n</code>, 100 would come before 9.',
        },
        {
          id: 'tx1-type-u', type: 'type',
          prompt: 'Print each fruit in <code>fruit.txt</code> once, in alphabetical order.',
          setup: data(), variant: data(1),
          check: (sh) => lastOutIs(sh, [...new Set(fileLines(sh, 'fruit.txt'))].sort()),
          solution: 'sort -u fruit.txt',
          explain: '<code>sort -u fruit.txt</code>, or <code>sort fruit.txt | uniq</code>.',
        },
        {
          id: 'tx1-type-c', type: 'type',
          prompt: 'Print how many times each fruit appears in <code>fruit.txt</code>, in alphabetical order of fruit.',
          setup: data(), variant: data(1),
          check: (sh) => sameLines(squeezed(sh), uniqC(fileLines(sh, 'fruit.txt'))),
          solution: 'sort fruit.txt | uniq -c',
          explain: '<code>sort fruit.txt | uniq -c</code>: sorting brings the repeats together so uniq can count them.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-text-2', title: 'cut and tr',
      exercises: [
        {
          id: 'tx2-cut', type: 'learn', new: true, title: '<code>cut</code>: pick columns',
          body: '<code>cut -d, -f2 people.csv</code> splits each line at the commas (<code>-d</code>, the delimiter) and keeps field 2 (<code>-f</code>). <code>-f1,3</code> keeps fields 1 and 3.',
          demo: { setup: data(), run: ['cut -d, -f2 people.csv', 'cut -d, -f1,3 people.csv'] },
        },
        {
          id: 'tx2-what', type: 'choice',
          prompt: '<code>people.csv</code> starts with <code>name,city,age</code>. What does <code>cut -d, -f1 people.csv</code> print first?',
          options: ['name', 'name,city,age', 'city', 'An error: there is no -f1 file'],
          answer: 0,
          explain: 'Field 1 of every line, the header line included.',
        },
        {
          id: 'tx2-passwd', type: 'learn', new: true, title: 'A real example: <code>/etc/passwd</code>',
          body: '<code>/etc/passwd</code> has one line per user account, with fields split by colons. The first field is the user name, so <code>cut -d: -f1 /etc/passwd</code> lists every account.',
          demo: { setup: data(), run: ['head -n 2 /etc/passwd', 'cut -d: -f1 /etc/passwd'] },
        },
        {
          id: 'tx2-outcome', type: 'outcome',
          prompt: '<code>people.csv</code> has a header and two people. What does this print?',
          setup: (sh) => sh.setupFiles({ 'people.csv': 'name,city,age\nAda,Paris,36\nBo,Tokyo,29\n' }),
          command: 'cut -d, -f2 people.csv',
          show: 'output',
          distractors: [['cut -d, -f1 people.csv'], ['cut -d, -f2,3 people.csv']],
          explain: 'The second column, header included: city, Paris, Tokyo.',
        },
        {
          id: 'tx2-fill', type: 'fill',
          prompt: 'Print the cities: the second comma-separated field of <code>people.csv</code>.',
          before: 'cut ', after: ' -f2 people.csv',
          options: ['-d,', '-d:', '-f,', '-c,'],
          answer: 0,
          explain: '<code>-d,</code> says the fields are split by commas; <code>-d:</code> is for files like /etc/passwd.',
        },
        {
          id: 'tx2-tr', type: 'learn', new: true, title: '<code>tr</code>: swap characters',
          body: '<code>tr a-z A-Z</code> turns every lower-case letter into a capital. tr reads only its input, never a file name, so feed it with a pipe or <code>&lt;</code>: <code>tr a-z A-Z &lt; fruit.txt</code>.',
          demo: { setup: data(), run: ['echo hello | tr a-z A-Z', 'tr a-z A-Z < fruit.txt'] },
        },
        {
          id: 'tx2-tr-ds', type: 'learn', new: true, title: '<code>tr -d</code> and <code>tr -s</code>',
          body: '<code>tr -d 0-9</code> deletes every digit. <code>tr -s " "</code> squeezes runs of spaces into one space. <code>tr , " "</code> swaps each comma for a space.',
          demo: { setup: data(), run: ['echo "r2d2" | tr -d 0-9', 'echo "too    many   spaces" | tr -s " "', 'echo "a,b,c" | tr , " "'] },
        },
        {
          id: 'tx2-match', type: 'match',
          prompt: 'Match each command to its output.',
          pairs: [['echo hello | tr a-z A-Z', 'HELLO'], ['echo "r2d2" | tr -d 0-9', 'rd'], ['echo "a  b" | tr -s " "', 'a b'], ['echo "a,b,c" | tr , " "', 'a b c']],
          explain: 'tr works on single characters: swap them, delete them, or squeeze repeats.',
        },
        {
          id: 'tx2-build', type: 'build',
          prompt: 'Print the names in the first column of <code>people.csv</code> in capitals.',
          tiles: ['cut', '-d,', '-f1', 'people.csv', '|', 'tr', 'a-z', 'A-Z', '-f2', '-d:'],
          answers: [['cut', '-d,', '-f1', 'people.csv', '|', 'tr', 'a-z', 'A-Z']],
          explain: 'cut picks the column, tr upper-cases what comes through the pipe.',
        },
        {
          id: 'tx2-type-cut', type: 'type',
          prompt: 'Print the <code>city</code> column of <code>people.csv</code> (the second field), header included.',
          setup: data(), variant: data(1),
          check: (sh) => lastOutIs(sh, rows(sh).map((r) => r[1])),
          solution: 'cut -d, -f2 people.csv',
          explain: '<code>cut -d, -f2 people.csv</code>: split at commas, keep field 2.',
        },
        {
          id: 'tx2-type-tr', type: 'type',
          prompt: 'Print <code>fruit.txt</code> in capital letters.',
          setup: data(), variant: data(1),
          check: (sh) => lastOutIs(sh, fileLines(sh, 'fruit.txt').map((l) => l.toUpperCase())),
          solution: 'tr a-z A-Z < fruit.txt',
          explain: '<code>tr a-z A-Z < fruit.txt</code>, or <code>cat fruit.txt | tr a-z A-Z</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-text-3', title: 'sed',
      exercises: [
        {
          id: 'tx3-s', type: 'learn', new: true, title: '<code>sed</code>: find and replace',
          body: '<code>sed \'s/cat/dog/\' pets.txt</code> prints pets.txt with the first cat on each line turned into dog. Add <code>g</code> for every one: <code>\'s/cat/dog/g\'</code>. The file itself stays unchanged.',
          teaches: ['sed leaves the file alone'],
          demo: { setup: pets, run: ["sed 's/cat/dog/' pets.txt", "sed 's/cat/dog/g' pets.txt"] },
        },
        {
          id: 'tx3-outcome', type: 'outcome', new: true,
          prompt: '<code>pets.txt</code> holds <code>cat and cat</code> and <code>my cat</code>. What does this print?',
          setup: pets,
          command: "sed 's/cat/dog/g' pets.txt",
          show: 'output',
          distractors: [["sed 's/cat/dog/' pets.txt"], ['cat pets.txt']],
          explain: 'With <code>g</code>, every cat on every line becomes dog.',
        },
        {
          id: 'tx3-file', type: 'choice',
          prompt: 'You run <code>sed \'s/cat/dog/g\' pets.txt</code>. What is in pets.txt afterwards?',
          options: ['The same as before: sed only printed a changed copy', 'Every cat is now dog', 'Nothing: sed emptied it', 'Only the changed lines'],
          answer: 0,
          needs: ['sed leaves the file alone'],
          explain: 'sed writes its result to the screen. Save it with <code>></code> into a new file, or use <code>-i</code> (coming up).',
        },
        {
          id: 'tx3-np', type: 'learn', new: true, title: '<code>sed -n</code> and <code>p</code>',
          body: 'sed normally prints every line. <code>-n</code> silences that, and <code>p</code> prints the lines you pick: <code>sed -n \'2p\'</code> prints line 2, <code>sed -n \'/ERROR/p\'</code> the lines matching ERROR, like grep.',
          demo: { setup: data(), run: ["sed -n '2p' fruit.txt", "sed -n '/ERROR/p' app.log"] },
        },
        {
          id: 'tx3-d', type: 'learn', new: true, title: '<code>d</code>: delete lines',
          body: '<code>d</code> drops lines from the output. <code>sed \'1d\' people.csv</code> prints the file without its header line; <code>sed \'/INFO/d\' app.log</code> leaves out every INFO line.',
          demo: { setup: data(), run: ["sed '1d' people.csv"] },
        },
        {
          id: 'tx3-match', type: 'match',
          prompt: 'Match each sed command to what it prints.',
          pairs: [["sed 's/a/b/' f", 'f with the first a on each line made b'], ["sed 's/a/b/g' f", 'f with every a made b'], ["sed -n '3p' f", 'Only line 3'], ["sed '1d' f", 'Everything but line 1'], ["sed '/x/d' f", 'Every line without an x']],
          explain: '<code>s</code> substitutes, <code>p</code> prints, <code>d</code> deletes; a number or a <code>/pattern/</code> in front picks the lines.',
        },
        {
          id: 'tx3-i', type: 'learn', new: true, title: '<code>sed -i</code>: change the file',
          body: '<code>sed -i \'s/colour/color/g\' notes.txt</code> edits notes.txt itself and prints nothing. It is quick and there is no undo, so try it without <code>-i</code> first. (On a Mac, it is <code>sed -i \'\'</code>.)',
          demo: { setup: pets, run: ["sed -i 's/colour/color/g' notes.txt", 'cat notes.txt'] },
        },
        {
          id: 'tx3-fill', type: 'fill',
          prompt: 'Change every <code>http:</code> to <code>https:</code> inside <code>links.txt</code> itself.',
          before: 'sed ', after: " 's/http:/https:/g' links.txt",
          options: ['-i', '-n', '-d', '-p'],
          answer: 0,
          explain: '<code>-i</code> writes the result back into the file. <code>-n</code> would print nothing at all here.',
        },
        {
          id: 'tx3-type-header', type: 'type',
          prompt: 'Print <code>people.csv</code> without its first line, the header.',
          setup: data(), variant: data(1),
          check: (sh) => lastOutIs(sh, fileLines(sh, 'people.csv').slice(1)),
          solution: "sed '1d' people.csv",
          explain: "<code>sed '1d' people.csv</code>. <code>tail -n +2 people.csv</code> does the same.",
        },
        {
          id: 'tx3-type-i', type: 'type',
          prompt: 'In <code>notes.txt</code>, change every <code>colour</code> to <code>color</code>, in the file itself.',
          setup: pets,
          check: (sh) => fileIs(sh, 'notes.txt', NOTES.replaceAll('colour', 'color')),
          solution: "sed -i 's/colour/color/g' notes.txt",
          explain: "<code>sed -i 's/colour/color/g' notes.txt</code>. Without <code>g</code>, the second colour on line 2 would stay.",
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-text-4', title: 'awk',
      exercises: [
        {
          id: 'tx4-fields', type: 'learn', new: true, title: '<code>awk</code>: fields',
          body: 'awk splits each line into fields at spaces: <code>$1</code> is the first, <code>$2</code> the second, <code>$0</code> the whole line. <code>awk \'{print $2}\' visits.log</code> prints the second field of every line.',
          demo: { setup: data(), run: ["awk '{print $2}' visits.log"] },
        },
        {
          id: 'tx4-which', type: 'choice',
          prompt: 'A line reads <code>Ada Paris 36</code>. What does <code>awk \'{print $2}\'</code> print for it?',
          options: ['Paris', 'Ada', '36', 'Ada Paris'],
          answer: 0,
          explain: 'Fields count from 1: Ada is $1, Paris is $2, 36 is $3.',
        },
        {
          id: 'tx4-F', type: 'learn', new: true, title: '<code>-F</code>, <code>$NF</code> and <code>NR</code>',
          body: '<code>-F,</code> splits at commas instead of spaces. <code>$NF</code> is the last field, however many there are. <code>NR</code> is the line number: <code>awk \'{print NR, $0}\'</code> numbers the lines.',
          demo: { setup: data(), run: ["awk -F, '{print $1, $NF}' people.csv", "awk '{print NR, $0}' fruit.txt"] },
        },
        {
          id: 'tx4-outcome', type: 'outcome', new: true,
          prompt: '<code>people.csv</code> has a header and two people. What does this print?',
          setup: (sh) => sh.setupFiles({ 'people.csv': 'name,city,age\nAda,Paris,36\nBo,Tokyo,29\n' }),
          command: "awk -F, '{print $NF}' people.csv",
          show: 'output',
          distractors: [["awk -F, '{print $1}' people.csv"], ["awk '{print $1}' people.csv"]],
          explain: 'The last comma-separated field of each line: age, 36, 29. Without <code>-F,</code> there are no spaces, so $1 would be the whole line.',
        },
        {
          id: 'tx4-cond', type: 'learn', new: true, title: 'Pick lines with a condition',
          body: 'A condition before the braces picks lines: <code>awk \'$3 == 404\' visits.log</code> keeps the 404s. <code>NR > 1</code> skips a header and <code>&&</code> joins conditions: <code>awk -F, \'NR > 1 && $3 > 30 {print $1}\' people.csv</code>.',
          teaches: ['awk and-conditions'],
          demo: { setup: data(), run: ["awk '$3 == 404' visits.log", "awk -F, 'NR > 1 && $3 > 30 {print $1}' people.csv"] },
        },
        {
          id: 'tx4-match', type: 'match',
          prompt: 'Match each awk program to what it prints.',
          pairs: [["'{print $1}'", 'The first field of every line'], ["'{print $NF}'", 'The last field of every line'], ["'{print NR, $0}'", 'Every line with its number'], ["'NR > 1'", 'Every line except the first'], ["'$3 > 30 {print $1}'", 'Field 1 where field 3 is over 30']],
          needs: ["awk '{print $1}'", "awk '{print $NF}'", "awk '{print NR, $0}'", "awk 'NR > 1'"],
          explain: 'A condition picks lines, the braces say what to print; leave the braces out and the whole line is printed.',
        },
        {
          id: 'tx4-end', type: 'learn', new: true, title: '<code>END</code>: after the last line',
          body: '<code>END { }</code> runs once, after the last line. Add up a column and print the total: <code>awk -F, \'NR > 1 {s += $3} END {print s}\' people.csv</code> sums the ages.',
          demo: { setup: data(), run: ["awk -F, 'NR > 1 {s += $3} END {print s}' people.csv"] },
        },
        {
          id: 'tx4-fill', type: 'fill',
          prompt: 'Print the last column of each line of <code>people.csv</code>.',
          before: "awk -F, '{print ", after: "}' people.csv",
          options: ['$NF', 'NF', '$0', '$1'],
          answer: 0,
          explain: '<code>NF</code> is how many fields there are, so <code>$NF</code> is the last one. Plain <code>NF</code> prints the number 3.',
        },
        {
          id: 'tx4-build', type: 'build',
          prompt: 'Print the names of the people older than 30 in <code>people.csv</code>.',
          tiles: ['awk', '-F,', "'NR > 1 && $3 > 30 {print $1}'", 'people.csv', "'NR > 1 && $1 > 30 {print $3}'", '-F:'],
          answers: [['awk', '-F,', "'NR > 1 && $3 > 30 {print $1}'", 'people.csv']],
          needs: ['awk and-conditions'],
          explain: 'Skip the header, test field 3 (the age), print field 1 (the name).',
        },
        {
          id: 'tx4-type-last', type: 'type',
          prompt: 'Print the last word of every line of <code>app.log</code>.',
          setup: data(), variant: data(1),
          check: (sh) => lastOutIs(sh, fileLines(sh, 'app.log').map((l) => l.split(' ').pop())),
          solution: "awk '{print $NF}' app.log",
          explain: "<code>awk '{print $NF}' app.log</code>: the last field, whatever the line's length.",
        },
        {
          id: 'tx4-type-sum', type: 'type',
          prompt: 'Add up the <code>age</code> column of <code>people.csv</code> and print the total.',
          setup: data(), variant: data(1),
          check: (sh) => printedNumber(sh, rows(sh).slice(1).reduce((s, r) => s + Number(r[2]), 0)),
          solution: "awk -F, 'NR > 1 {s += $3} END {print s}' people.csv",
          explain: "<code>awk -F, 'NR > 1 {s += $3} END {print s}' people.csv</code>: add on every line, print at the END.",
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'bash-text-5', title: 'Pipeline recipes',
      exercises: [
        {
          id: 'tx5-top', type: 'learn', new: true, title: 'The top-N recipe',
          body: '<code>sort | uniq -c | sort -rn | head -n 3</code> is the most useful pipeline there is: sort to group, count each group, sort the counts biggest first, keep three. Put any list in front of it.',
          demo: { setup: data(), run: ["awk '{print $2}' visits.log | sort | uniq -c | sort -rn | head -n 3"] },
        },
        {
          id: 'tx5-order', type: 'order',
          prompt: 'Print the 3 most visited pages in <code>visits.log</code>. Put the pieces in order.',
          steps: ["awk '{print $2}' visits.log", '| sort', '| uniq -c', '| sort -rn', '| head -n 3'],
          explain: 'Pick the column, group, count, rank, cut off.',
        },
        {
          id: 'tx5-twice', type: 'choice',
          prompt: 'Why does the recipe sort twice?',
          options: ['First so uniq sees repeats together, then to rank the counts', 'The second sort undoes the first', 'sort can only handle half the lines at a time', 'It does not need to: once is enough'],
          answer: 0,
          needs: ['sorted before uniq'],
          explain: 'The first sort is by name (for uniq), the second <code>sort -rn</code> by count.',
        },
        {
          id: 'tx5-words', type: 'learn', new: true, title: 'Words, not lines',
          body: 'The recipe counts lines, so put one word per line first: <code>tr -s " " "\\n"</code> turns each run of spaces into a single line break. Then count as usual.',
          demo: { setup: data(), run: ['tr -s " " "\\n" < poem.txt | sort | uniq -c | sort -rn | head -n 3'] },
        },
        {
          id: 'tx5-hour', type: 'learn', new: true, title: 'Errors per hour',
          body: '<code>cut -c12-13</code> keeps characters 12 to 13 of each line: the hour in <code>2026-01-05 09:12</code>. So <code>grep ERROR app.log | cut -c12-13 | sort | uniq -c</code> counts errors per hour.',
          demo: { setup: data(), run: ['grep ERROR app.log | cut -c12-13 | sort | uniq -c'] },
        },
        {
          id: 'tx5-match', type: 'match',
          prompt: 'Match each pipeline to the question it answers.',
          pairs: [["awk '{print $2}' visits.log | sort | uniq -c | sort -rn | head -n 1", 'Which page is visited most?'], ["awk '{print $1}' visits.log | sort -u | wc -l", 'How many different visitors?'], ['grep ERROR app.log | cut -c12-13 | sort | uniq -c', 'How many errors each hour?'], ['tr -s " " "\\n" < poem.txt | sort | uniq -c | sort -rn | head -n 3', 'Which 3 words come up most?']],
          explain: 'Same few tools, different questions: choose what goes in front of the counting.',
        },
        {
          id: 'tx5-fill', type: 'fill',
          prompt: 'Print the most common fruit with its count.',
          before: 'sort fruit.txt | uniq -c | sort ', after: ' | head -n 1',
          options: ['-rn', '-n', '-u', '-r'],
          answer: 0,
          explain: 'Biggest count first needs both: <code>-n</code> for numbers and <code>-r</code> for reverse.',
        },
        {
          id: 'tx5-outcome', type: 'outcome',
          prompt: '<code>fruit.txt</code> has pear three times, apple twice, fig and kiwi once. What does this print?',
          setup: (sh) => sh.setupFiles({ 'fruit.txt': 'pear\napple\npear\nfig\napple\npear\nkiwi\n' }),
          command: 'sort fruit.txt | uniq -c | sort -rn | head -n 1',
          show: 'output',
          distractors: [['sort fruit.txt | uniq -c | sort -n | head -n 1'], ['sort fruit.txt | uniq -c | head -n 1']],
          explain: 'The top count after <code>sort -rn</code>: pear, 3 times.',
        },
        {
          id: 'tx5-type-top', type: 'type',
          prompt: 'Print the 3 most visited pages in <code>visits.log</code> (the second field), with their counts, most visited first.',
          setup: data(), variant: data(1),
          check: (sh) => sameLines(squeezed(sh), topN(field(sh, 'visits.log', 1), 3)),
          solution: "awk '{print $2}' visits.log | sort | uniq -c | sort -rn | head -n 3",
          explain: 'The recipe after <code>awk \'{print $2}\'</code> (or <code>cut -d" " -f2</code>).',
        },
        {
          id: 'tx5-type-ips', type: 'type',
          prompt: 'How many different IP addresses (the first field) are in <code>visits.log</code>? Print the number.',
          setup: data(), variant: data(1),
          check: (sh) => printedNumber(sh, new Set(field(sh, 'visits.log', 0)).size),
          solution: "awk '{print $1}' visits.log | sort -u | wc -l",
          explain: 'Keep the IPs, keep each once, count the lines: <code>awk \'{print $1}\' visits.log | sort -u | wc -l</code>.',
        },
        {
          id: 'tx5-type-hours', type: 'type',
          prompt: 'Count the ERROR lines in <code>app.log</code> per hour: one line per hour, the count first, in hour order.',
          setup: data(), variant: data(1),
          check: (sh) => sameLines(squeezed(sh), uniqC(fileLines(sh, 'app.log').filter((l) => l.includes('ERROR')).map((l) => l.slice(11, 13)))),
          solution: 'grep ERROR app.log | cut -c12-13 | sort | uniq -c',
          explain: 'Errors only, the hour only, then group and count: <code>grep ERROR app.log | cut -c12-13 | sort | uniq -c</code>.',
        },
      ],
    },
  ],
};
