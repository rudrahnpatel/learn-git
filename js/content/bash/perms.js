// Bash unit 7: Permissions and running things. Reading ls -l, chmod (symbolic and octal), running programs
// (./x, Permission denied, bash x, the shebang), $PATH (which, type, ~/bin); root and sudo as a learn card only.
import { isExecutable, modeHas, listOf, isDir, lastOut, lastOutIs, ran } from './helpers.js';
import { modeString } from '../../shell/fs.js';

const script = (msg) => `#!/bin/bash\necho "${msg}"\n`;
// What a one-line `echo "…"` script prints.
const says = (sh, p) => (/echo "([^"]*)"/.exec(sh.s.nodes[sh.abs(p)]?.content || '') || [])[1];
// A workshop: two scripts that are not executable yet, a diary, a shared file, some folders.
// `v` gives other messages, folders and modes (the anti-cheat replay).
const workshop = (v = 0) => (sh) => sh.setupFiles(v ? {
  'hello.sh': script('Hi there'), 'greet.sh': script('Good evening'), 'run.sh': script('Running'),
  'diary.txt': 'Day two\n', 'shared.txt': { content: 'Team notes\n', mode: 0o666 },
  'photos/': null, 'work/': null, 'work/old/': null,
  'scripts/sync.sh': { content: script('sync'), mode: 0o700 }, 'scripts/notes.txt': 'n\n',
} : {
  'hello.sh': script('Hello, world'), 'greet.sh': script('Good morning'), 'run.sh': script('Running'),
  'diary.txt': 'Dear diary\n', 'shared.txt': { content: 'Shopping list\n', mode: 0o666 },
  'docs/': null, 'music/': null,
  'scripts/backup.sh': { content: script('backup'), mode: 0o755 }, 'scripts/clean.sh': script('clean'),
});
// A home with a ~/bin that is not in PATH yet; the variant also has its own `sort` early in PATH.
const tools = (v = 0) => (sh) => {
  sh.setupFiles({ 'bin/hello': { content: script(v ? 'Hello from your bin' : 'Hello from ~/bin'), mode: 0o755 }, 'notes.txt': 'hi\n' });
  if (v) { sh.setupFiles({ 'mybin/sort': { content: script('my own sort'), mode: 0o755 } }); sh.setupEnv({ PATH: `${sh.s.home}/mybin:/usr/local/bin:/usr/bin:/bin` }); }
};
const deploy = (v = 0) => (sh) => sh.setupFiles({ 'tools/deploy.sh': script(v ? 'Deployed v2 to staging' : 'Deployed v1'), 'notes.txt': 'hi\n' });
const vault = (sh) => sh.setupFiles({ 'secrets/keys.txt': 'wifi: hunter2\n', 'secrets/pins.txt': '1234\n', 'secrets/old/': null, 'notes.txt': 'hi\n' });

const pathDirs = (sh) => String(sh.s.vars.PATH || '').split(':');
// the file a command name runs: the first folder in PATH that has it (what `which` prints)
const lookup = (sh, name) => pathDirs(sh).map((d) => `${d}/${name}`).find((p) => sh.s.nodes[p]?.type === 'file');
const lsLine = (sh, p) => `${modeString(sh.s.nodes[sh.abs(p)])} `;

export default {
  id: 'bash-perms', title: 'Permissions and running things', color: 'yellow',
  blurb: 'Who may read, write and run a file, and how the shell finds programs.',
  challenges: [
    {
      id: 'bash-runnable', title: 'Ship it', blurb: 'Make a script runnable from anywhere, and lock a folder down.',
      exercises: [
        {
          id: 'pmc-deploy', type: 'type', max: 6,
          prompt: '<code>tools/deploy.sh</code> should run from anywhere by typing just <code>deploy.sh</code>. Set that up, then run it by name.',
          setup: deploy(), variant: deploy(1),
          check: (sh) => isExecutable(sh, 'tools/deploy.sh') && pathDirs(sh).includes(`${sh.s.home}/tools`) && lastOutIs(sh, says(sh, 'tools/deploy.sh')) && ran(sh, /(^|[;&|]\s*)deploy\.sh\b/),
          solution: 'chmod +x tools/deploy.sh\nPATH="$HOME/tools:$PATH"\ndeploy.sh',
          explain: 'It needs the x permission, and its folder in PATH. Then the shell finds it by name like any other command.',
        },
        {
          id: 'pmc-vault', type: 'type', max: 6,
          prompt: 'Lock down <code>secrets</code>: only you may open the folder (<code>rwx------</code>), and the two files in it are readable and writable by you alone.',
          setup: vault,
          check: (sh) => modeHas(sh, 'secrets', 0o700) && ['keys.txt', 'pins.txt'].every((f) => modeHas(sh, `secrets/${f}`, 0o600)),
          solution: 'chmod 700 secrets\nchmod 600 secrets/*.txt',
          explain: '<code>chmod 700 secrets</code> for the folder, <code>chmod 600 secrets/*.txt</code> for the files (<code>go-rwx</code> works too).',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-perms-1', title: 'Reading ls -l',
      exercises: [
        {
          id: 'pm1-long', type: 'learn', new: true, title: '<code>ls -l</code>: the long listing',
          body: '<code>ls -l</code> prints one line per name: permissions, a link count, owner, group, size in bytes, last change, name. <code>ls -ld docs</code> shows the folder itself instead of what is inside.',
          teaches: ['reading ls -l'],
          demo: { setup: workshop(), run: ['ls -l', 'ls -ld docs'] },
        },
        {
          id: 'pm1-rwx', type: 'learn', new: true, title: 'Ten characters',
          body: 'In <code>-rwxr-xr--</code> the first character is the type (<code>-</code> file, <code>d</code> folder). Then three groups of three: owner, group, others. r read, w write, x execute; <code>-</code> means not allowed.',
          teaches: ['rwx groups'],
        },
        {
          id: 'pm1-who-writes', type: 'choice',
          prompt: 'A file shows <code>-rw-r--r--</code>. Who may change it?',
          options: ['Only its owner', 'Everyone', 'Nobody', 'Its group and others'],
          answer: 0,
          needs: ['rwx groups'],
          explain: 'Owner rw-, group r--, others r--: the w is in the owner\'s group only.',
        },
        {
          id: 'pm1-match', type: 'match',
          prompt: 'Match each permission string to what it means.',
          pairs: [['drwxr-xr-x', 'A folder anyone can open; only the owner adds files'], ['-rwxr-xr-x', 'A program anyone can run'], ['-rw-------', 'A private file: only the owner reads or writes'], ['-rw-r--r--', 'A file everyone reads, only the owner changes']],
          needs: ['rwx groups'],
          explain: 'Read the first character, then owner, group and others, three characters each.',
        },
        {
          id: 'pm1-owner', type: 'learn', new: true, title: 'Who owns it',
          body: 'Your files belong to you (<code>you you</code>: owner, then group). System files in <code>/etc</code> and <code>/usr</code> belong to <code>root</code>, the administrator account, so you can read many of them but not change them.',
          teaches: ['root owns system files'],
          demo: { setup: workshop(), run: ['ls -l /etc'] },
        },
        {
          id: 'pm1-root', type: 'choice',
          prompt: 'Who owns <code>/etc/passwd</code>, and can you read it?',
          code: '$ ls -l /etc/passwd\n-rw-r--r-- 1 root root 173 Jan  4 09:00 /etc/passwd',
          options: ['root owns it; you can read it but not change it', 'You own it and can change it', 'root owns it and nobody else can read it', 'It is a folder'],
          answer: 0,
          needs: ['root owns system files', 'rwx groups'],
          explain: 'The others group has r--: read yes, write no.',
        },
        {
          id: 'pm1-outcome', type: 'outcome', new: true,
          prompt: 'There is a file <code>notes.txt</code> and a folder <code>docs</code>. What does this print?',
          setup: (sh) => sh.setupFiles({ 'notes.txt': 'hi\n', 'docs/a.txt': 'x\n' }),
          command: 'ls -ld docs',
          show: 'output',
          distractors: [['ls -l docs'], ['ls -l']],
          explain: '<code>-d</code> lists the folder itself: one line starting with <code>d</code>.',
        },
        {
          id: 'pm1-fill', type: 'fill',
          prompt: '<code>ls -l</code> printed this line for a folder. What is its first character?',
          before: '', after: 'rwxr-xr-x 2 you you 4096 Jan  5 09:00 docs',
          options: ['d', '-', 'x', 'f'],
          answer: 0,
          needs: ['rwx groups'],
          explain: '<code>d</code> for directory. A plain file has <code>-</code>.',
        },
        {
          id: 'pm1-type-dirs', type: 'type',
          prompt: 'Show the <code>ls -l</code> lines of your home folder\'s <b>folders</b> only. Hint: those lines start with <code>d</code>.',
          setup: workshop(), variant: workshop(1),
          check: (sh) => { const ls = lastOut(sh).split('\n').filter(Boolean); const dirs = listOf(sh, '~').filter((n) => !n.startsWith('.') && isDir(sh, n)); return ls.length === dirs.length && ls.every((l) => l.startsWith('d')) && dirs.every((d, i) => ls[i].endsWith(` ${d}`)); },
          solution: "ls -l | grep '^d'",
          explain: "<code>ls -l | grep '^d'</code>: grep keeps the lines that start with d.",
        },
        {
          id: 'pm1-type-ld', type: 'type',
          prompt: 'Show the long listing line of the <code>scripts</code> folder itself, not of the files inside it.',
          setup: workshop(), variant: (sh) => { workshop(1)(sh); sh.sh('chmod 700 scripts'); },
          check: (sh) => { const l = lastOut(sh).trim(); return !l.includes('\n') && l.startsWith(lsLine(sh, 'scripts')) && l.endsWith(' scripts'); },
          solution: 'ls -ld scripts',
          explain: '<code>ls -ld scripts</code>: <code>-l</code> for the long form, <code>-d</code> for the folder itself.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-perms-2', title: 'chmod',
      exercises: [
        {
          id: 'pm2-x', type: 'learn', new: true, title: '<code>chmod +x</code>',
          body: '<code>chmod</code> changes permissions. <code>chmod +x run.sh</code> lets it be run (executed); <code>chmod -x</code> takes that away. Check with <code>ls -l</code>: the x appears.',
          teaches: ['chmod +x'],
          demo: { setup: workshop(), run: ['ls -l run.sh', 'chmod +x run.sh', 'ls -l run.sh'] },
        },
        {
          id: 'pm2-outcome', type: 'outcome',
          prompt: 'Which tree do you get? (A star marks a file you can run.)',
          setup: (sh) => sh.setupFiles({ 'run.sh': script('hi'), 'notes.txt': 'hi\n' }),
          command: 'chmod +x run.sh',
          show: 'tree',
          distractors: [['chmod +x notes.txt'], ['chmod +x run.sh notes.txt']],
          explain: 'Only run.sh gets the x, so only run.sh is marked.',
        },
        {
          id: 'pm2-who', type: 'learn', new: true, title: 'Who: <code>u g o a</code>',
          body: 'Put who before the change: <code>u</code> owner (user), <code>g</code> group, <code>o</code> others, <code>a</code> all. <code>chmod u+x run.sh</code> is for you only; <code>chmod go-w shared.txt</code> takes write away from group and others.',
          teaches: ['u g o a'],
          demo: { setup: workshop(), run: ['chmod go-w shared.txt', 'ls -l shared.txt'] },
        },
        {
          id: 'pm2-who-choice', type: 'choice',
          prompt: 'diary.txt is <code>-rw-r--r--</code>. You run <code>chmod go-r diary.txt</code>. What is it now?',
          options: ['-rw-------', '-rw-r--r--', '-r--r--r--', '-rw-r-----'],
          answer: 0,
          needs: ['u g o a', 'rwx groups'],
          explain: 'Group and others lose their r; the owner keeps rw.',
        },
        {
          id: 'pm2-octal', type: 'learn', new: true, title: 'Numbers: <code>755</code> and <code>644</code>',
          body: 'Each group is also a digit: r=4, w=2, x=1, added up. 7 is rwx, 6 rw-, 5 r-x, 4 r--, 0 ---. <code>chmod 755 run.sh</code> means rwxr-xr-x; <code>chmod 644 notes.txt</code> means rw-r--r--.',
          teaches: ['octal modes'],
          demo: { setup: workshop(), run: ['chmod 755 run.sh', 'ls -l run.sh'] },
        },
        {
          id: 'pm2-match', type: 'match',
          prompt: 'Match each digit to the permissions it stands for.',
          pairs: [['7', 'rwx'], ['6', 'rw-'], ['5', 'r-x'], ['4', 'r--'], ['0', '---']],
          needs: ['octal modes'],
          explain: 'Add r=4, w=2, x=1: 4+2+1=7, 4+2=6, 4+1=5.',
        },
        {
          id: 'pm2-600', type: 'choice',
          prompt: 'After <code>chmod 600 diary.txt</code>, who can read diary.txt?',
          options: ['Only you, its owner', 'Everyone', 'You and your group', 'Nobody, not even you'],
          answer: 0,
          needs: ['octal modes'],
          explain: '6 for the owner (rw-), 0 for group and others (---).',
        },
        {
          id: 'pm2-fill', type: 'fill',
          prompt: 'Make <code>run.sh</code> <code>rwxr-xr-x</code>: everyone may read and run it, only you may change it.',
          before: 'chmod ', after: ' run.sh',
          options: ['755', '644', '777', '700'],
          answer: 0,
          needs: ['octal modes'],
          explain: 'rwx = 7, r-x = 5, r-x = 5. 777 would let anyone change it.',
        },
        {
          id: 'pm2-sudo', type: 'learn', new: true, title: 'root and <code>sudo</code>',
          body: 'On a real machine, <code>sudo command</code> runs one command as root, after asking your password. You need it to install software or edit <code>/etc</code>, rarely for your own files. Never fix an error with <code>chmod 777</code>.',
          teaches: ['sudo and root'],
        },
        {
          id: 'pm2-not-permitted', type: 'choice',
          prompt: 'Why does this fail?',
          code: '$ chmod 644 /etc/hostname\nchmod: changing permissions of \'/etc/hostname\': Operation not permitted',
          options: ['root owns it, and only the owner (or root) can change permissions', '644 is not a valid mode', 'The file is empty', 'chmod needs -R for files in /etc'],
          answer: 0,
          needs: ['sudo and root', 'root owns system files'],
          explain: 'Changing permissions belongs to the owner. On a real machine an admin would use sudo.',
        },
        {
          id: 'pm2-type-x', type: 'type',
          prompt: 'Make <code>run.sh</code> executable.',
          setup: workshop(),
          check: (sh) => isExecutable(sh, 'run.sh'),
          solution: 'chmod +x run.sh',
          explain: '<code>chmod +x run.sh</code> (or <code>chmod 755 run.sh</code>).',
        },
        {
          id: 'pm2-type-private', type: 'type',
          prompt: 'Make <code>diary.txt</code> private: you may read and write it, nobody else may do anything.',
          setup: workshop(),
          check: (sh) => modeHas(sh, 'diary.txt', 0o600),
          solution: 'chmod 600 diary.txt',
          explain: '<code>chmod 600 diary.txt</code>, or <code>chmod go-r diary.txt</code> from rw-r--r--.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-perms-3', title: 'Running programs',
      exercises: [
        {
          id: 'pm3-dot', type: 'learn', new: true, title: 'Run it with <code>./</code>',
          body: 'To run a program in the current folder, give its path: <code>./hello.sh</code>. Without the x permission, bash refuses with <code>Permission denied</code>; after <code>chmod +x</code> it runs.',
          teaches: ['Permission denied'],
          demo: { setup: workshop(), run: ['chmod +x hello.sh', './hello.sh'] },
        },
        {
          id: 'pm3-denied', type: 'choice',
          prompt: 'Why does this happen?',
          code: '$ ./greet.sh\nbash: ./greet.sh: Permission denied',
          options: ['greet.sh has no x permission', 'greet.sh does not exist', 'You must be root to run scripts', 'The ./ is wrong: it should be /greet.sh'],
          answer: 0,
          needs: ['Permission denied'],
          explain: 'Running needs x. A missing file would say "No such file or directory".',
        },
        {
          id: 'pm3-bash', type: 'learn', new: true, title: '<code>bash hello.sh</code>',
          body: '<code>bash greet.sh</code> runs a script without the x permission: here bash is the program, and it only needs to read the file. Handy for a quick try; <code>chmod +x</code> is for scripts you keep.',
          demo: { setup: workshop(), run: ['bash greet.sh'] },
        },
        {
          id: 'pm3-shebang', type: 'learn', new: true, title: 'The shebang: <code>#!/bin/bash</code>',
          body: 'A script\'s first line, <code>#!/bin/bash</code>, says which program should run the rest of the file. That is how <code>./hello.sh</code> knows it is a bash script.',
          teaches: ['shebang'],
          demo: { setup: workshop(), run: ['cat hello.sh'] },
        },
        {
          id: 'pm3-shebang-choice', type: 'choice',
          prompt: 'What does the first line <code>#!/bin/bash</code> of a script do?',
          options: ['It tells the system to run the file with /bin/bash', 'It is a comment that is always ignored', 'It makes the file executable', 'It prints the path of bash'],
          answer: 0,
          needs: ['shebang'],
          explain: 'It is read when you run <code>./script</code>. It does not give the x permission: that is chmod\'s job.',
        },
        {
          id: 'pm3-match', type: 'match',
          prompt: 'greet.sh is <code>-rw-r--r--</code>. Match each command to what happens.',
          pairs: [['./greet.sh', 'Permission denied'], ['bash greet.sh', 'It runs: bash only reads the file'], ['chmod +x greet.sh', 'Nothing printed; it becomes runnable'], ['cat greet.sh', 'It prints the script\'s text']],
          needs: ['Permission denied'],
          explain: 'Reading needs r, running directly needs x, and <code>bash file</code> only reads.',
        },
        {
          id: 'pm3-fill', type: 'fill',
          prompt: 'Run the program <code>hello.sh</code> that is in the current folder.',
          before: '', after: 'hello.sh',
          options: ['./', '/', '../', '~'],
          answer: 0,
          explain: '<code>./</code> is "this folder". <code>/hello.sh</code> would look at the very top of the disk.',
        },
        {
          id: 'pm3-order', type: 'order',
          prompt: 'A new script <code>tidy.sh</code> is not runnable yet. Put the steps in order: look, fix, run.',
          steps: ['ls -l tidy.sh', 'chmod +x tidy.sh', './tidy.sh'],
          needs: ['chmod +x'],
          explain: 'See the missing x, add it, then run it by path.',
        },
        {
          id: 'pm3-type-run', type: 'type',
          prompt: '<code>hello.sh</code> is not executable yet. Make it executable, then run it with <code>./</code>.',
          setup: workshop(), variant: workshop(1),
          check: (sh) => isExecutable(sh, 'hello.sh') && lastOutIs(sh, says(sh, 'hello.sh')),
          solution: 'chmod +x hello.sh\n./hello.sh',
          explain: '<code>chmod +x hello.sh</code>, then <code>./hello.sh</code>.',
        },
        {
          id: 'pm3-type-bash', type: 'type',
          prompt: 'Run <code>greet.sh</code> <b>without</b> changing its permissions.',
          setup: workshop(), variant: workshop(1),
          check: (sh) => modeHas(sh, 'greet.sh', 0o644) && lastOutIs(sh, says(sh, 'greet.sh')),
          solution: 'bash greet.sh',
          explain: '<code>bash greet.sh</code>: bash reads the file and runs it, no x needed.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-perms-4', title: '$PATH',
      exercises: [
        {
          id: 'pm4-path', type: 'learn', new: true, title: '<code>$PATH</code>: where commands live',
          body: 'Why does <code>ls</code> work without <code>./</code>? The shell looks for a command name in each folder of <code>$PATH</code>, left to right (colons separate them). <code>echo $PATH</code> shows the list.',
          teaches: ['PATH lookup'],
          demo: { setup: tools(), run: ['echo $PATH', 'which ls'] },
        },
        {
          id: 'pm4-why', type: 'choice',
          prompt: '<code>./hello.sh</code> works, but plain <code>hello.sh</code> fails with "command not found". Why?',
          options: ['The current folder is not in $PATH', 'hello.sh is not executable', 'Scripts can only run with bash', 'hello.sh is a folder'],
          answer: 0,
          needs: ['PATH lookup'],
          explain: 'A bare name is only looked up in the $PATH folders. <code>./</code> gives the path directly.',
        },
        {
          id: 'pm4-which', type: 'learn', new: true, title: '<code>which</code> and <code>type</code> again',
          body: '<code>which sort</code> prints the file that runs when you type sort: the first match along <code>$PATH</code>. <code>type cd</code> also knows commands with no file, like the shell\'s own builtins.',
          demo: { setup: tools(), run: ['which sort', 'type cd'] },
        },
        {
          id: 'pm4-outcome', type: 'outcome', new: true,
          prompt: 'Your <code>$PATH</code> starts with <code>~/bin</code>, which holds a script called <code>hi</code>. What does this print?',
          setup: (sh) => { sh.setupFiles({ 'bin/hi': { content: script('hi'), mode: 0o755 } }); sh.setupEnv({ PATH: `${sh.s.home}/bin:/usr/local/bin:/usr/bin:/bin` }); },
          command: 'which hi',
          show: 'output',
          distractors: [['which ls'], ['type cd']],
          explain: 'which follows PATH and finds hi in your bin folder.',
        },
        {
          id: 'pm4-bin', type: 'learn', new: true, title: 'Your own <code>~/bin</code>',
          body: 'Keep your scripts in <code>~/bin</code> and put that folder at the front of PATH: <code>PATH="$HOME/bin:$PATH"</code> (the old list, with yours added). Then they run by name, from anywhere. More on variables next unit.',
          teaches: ['add to PATH'],
          demo: { setup: tools(), run: ['PATH="$HOME/bin:$PATH"', 'hello'] },
        },
        {
          id: 'pm4-match', type: 'match',
          prompt: 'Match each command to what it tells you or does.',
          pairs: [['echo $PATH', 'The folders searched for commands'], ['which ls', 'The file that runs for ls'], ['type cd', 'cd is a shell builtin'], ['PATH="$HOME/bin:$PATH"', 'Adds your bin folder to the front']],
          needs: ['add to PATH'],
          explain: 'PATH is just a list of folders; which and type tell you what it finds.',
        },
        {
          id: 'pm4-fill', type: 'fill',
          prompt: 'Add <code>~/bin</code> to the front of PATH, keeping all the folders already in it.',
          before: 'PATH="$HOME/bin:', after: '"',
          options: ['$PATH', 'PATH', '/bin', '$HOME'],
          answer: 0,
          needs: ['add to PATH'],
          explain: 'Without the <code>$</code>, PATH would hold the word PATH, and ls would stop working.',
        },
        {
          id: 'pm4-type-hello', type: 'type',
          prompt: 'There is a <code>hello</code> program in <code>~/bin</code>. Add that folder to your PATH, then run it by typing just <code>hello</code>.',
          setup: tools(), variant: tools(1),
          check: (sh) => pathDirs(sh).includes(`${sh.s.home}/bin`) && lastOutIs(sh, says(sh, 'bin/hello')) && ran(sh, /(^|[;&|]\s*)hello\b/),
          solution: 'PATH="$HOME/bin:$PATH"\nhello',
          explain: '<code>PATH="$HOME/bin:$PATH"</code>, then <code>hello</code>. Keep the <code>:$PATH</code>, or every other command disappears.',
        },
        {
          id: 'pm4-type-which', type: 'type',
          prompt: 'Print the full path of the file that runs when you type <code>sort</code>.',
          setup: tools(), variant: tools(1),
          check: (sh) => lastOut(sh).trim().split(/[\s()]+/).filter(Boolean).pop() === lookup(sh, 'sort'),
          solution: 'which sort',
          explain: '<code>which sort</code> (or <code>type sort</code>). On the second set of files a different sort comes first in PATH.',
        },
      ],
    },
  ],
};
