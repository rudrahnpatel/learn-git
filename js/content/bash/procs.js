// Bash unit 11: Processes and jobs. A light unit (the sandbox has no real programs): ps and ps aux, PIDs, kill,
// kill -9 for a process that ignores the polite signal, pgrep/pkill by name, and background jobs (&, jobs, fg,
// kill %1). Ctrl+C and Ctrl+Z are learn cards only: nothing runs long enough here to press them.
import { listOf, lastOut, lastOutIs, fileIs } from './helpers.js';

// A busy machine: a render job hogging the processor, a web server, a stuck sync script (ignores a plain kill),
// mail workers, and a root-owned service. `v` starts one more service first, so every PID is different.
const machine = (v = 0) => (sh) => {
  sh.setupFiles({ 'notes.txt': 'hi\n' });
  if (v) sh.setupProcess('nginx', { user: 'root', tty: '?', mem: 1.1 });
  sh.setupProcess('/usr/sbin/sshd', { user: 'root', tty: '?', mem: 0.6 });
  sh.setupProcess('python3 render.py', { cpu: 97.3, mem: 8.4 });
  sh.setupProcess('node server.js', { cpu: 1.2, mem: 2.1 });
  sh.setupProcess('sync.sh', { stubborn: true, mem: 0.3 });
  for (const q of v ? ['mail', 'mail', 'sms'] : ['mail', 'push']) sh.setupProcess(`worker --queue ${q}`, { mem: 0.9 });
};
// A shell with background jobs already running (`v`: one more).
const jobsRunning = (cmds) => (sh) => { sh.setupFiles({ 'notes.txt': 'hi\n' }); for (const c of cmds) sh.sh(`${c} &`); };

const name = (p) => p.cmd.split(' ')[0].split('/').pop();
const procs = (sh, re) => sh.s.procs.filter((p) => re.test(p.cmd));
const alive = (sh, re) => procs(sh, re).length > 0;
// the jobs table the way `jobs` prints it
const jobsText = (sh) => sh.s.jobs.map((j) => `[${j.id}]${sh._jobMark(j)}  ${j.state.padEnd(24)}${j.cmd}${j.state === 'Running' ? ' &' : ''}`);
const outLines = (sh) => lastOut(sh).split('\n').map((l) => l.trim()).filter(Boolean);

export default {
  id: 'bash-procs', title: 'Processes and jobs', color: 'sunbeam',
  blurb: 'See what is running, stop what is stuck, and run things in the background.',
  challenges: [
    {
      id: 'bash-runaway', title: 'Runaway', blurb: 'A machine that crawls, and a crowd of workers to send home.',
      exercises: [
        {
          id: 'prc-hog', type: 'type', max: 6,
          prompt: 'The machine crawls. Something is eating the processor, and it won\'t go quietly. Stop it, and nothing else.',
          setup: (sh) => {
            sh.setupFiles({ 'notes.txt': 'hi\n' });
            sh.setupProcess('node server.js', { cpu: 0.8 });
            sh.setupProcess('python3 crunch.py', { cpu: 99.1, mem: 14.2, stubborn: true });
            sh.setupProcess('worker --queue mail');
          },
          check: (sh) => !alive(sh, /crunch\.py/) && alive(sh, /server\.js/) && alive(sh, /worker/),
          solution: 'ps aux\nkill -9 4201',
          explain: '<code>ps aux</code> shows crunch.py at 99% CPU. A plain <code>kill 4201</code> is ignored, so <code>kill -9 4201</code>.',
        },
        {
          id: 'prc-workers', type: 'type', max: 6,
          prompt: 'Stop all the <code>worker</code> processes with one command, then save the PID of the <code>node</code> process in <code>server.pid</code>.',
          setup: machine(), variant: machine(1),
          check: (sh) => !alive(sh, /^worker/) && alive(sh, /server\.js/) && alive(sh, /render\.py/) && fileIs(sh, 'server.pid', String(procs(sh, /^node /)[0]?.pid)),
          solution: 'pkill worker\npgrep node > server.pid',
          explain: '<code>pkill worker</code> stops every process called worker; <code>pgrep node > server.pid</code> writes the PID into the file.',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-procs-1', title: 'What\'s running',
      exercises: [
        {
          id: 'pr1-proc', type: 'learn', new: true, title: 'Processes and PIDs',
          body: 'A running program is a process, and each one has a number, its PID. <code>ps</code> lists the processes started from this terminal: right now just bash and ps itself.',
          teaches: ['PID'],
          demo: { setup: machine(), run: ['ps'] },
        },
        {
          id: 'pr1-aux', type: 'learn', new: true, title: '<code>ps aux</code>: everything',
          body: '<code>ps aux</code> lists every process on the machine: who started it (USER), its PID, how much of the processor (%CPU) and memory (%MEM) it uses, and the command it is running.',
          teaches: ['ps aux columns'],
          demo: { setup: machine(), run: ['ps aux'] },
        },
        {
          id: 'pr1-pid', type: 'choice',
          prompt: 'What is a PID?',
          options: ['The number that identifies one running process', 'The path of a program', 'How much memory a program uses', 'The user who runs a program'],
          answer: 0,
          needs: ['PID'],
          explain: 'Commands like kill take the PID to know which process you mean.',
        },
        {
          id: 'pr1-match', type: 'match',
          prompt: 'Match each <code>ps aux</code> column to what it shows.',
          pairs: [['USER', 'Who started it'], ['PID', 'Its number'], ['%CPU', 'How busy it keeps the processor'], ['COMMAND', 'What it is running']],
          needs: ['ps aux columns'],
          explain: 'Sort by eye: a process at 90% CPU is the one slowing everything down.',
        },
        {
          id: 'pr1-hog', type: 'choice',
          prompt: 'The machine is slow. Which process is the likely cause?',
          code: '$ ps aux\nUSER         PID %CPU %MEM COMMAND\nyou         4200  0.4  2.1 node server.js\nyou         4201 98.7  8.4 python3 render.py\nyou         4202  0.0  0.3 sync.sh',
          options: ['4201, python3 render.py', '4200, node server.js', '4202, sync.sh', 'None: ps aux slows it down'],
          answer: 0,
          needs: ['ps aux columns'],
          explain: 'It uses almost all of the processor (98.7% CPU).',
        },
        {
          id: 'pr1-fill', type: 'fill',
          prompt: 'List every process on the machine, not just this terminal\'s.',
          before: 'ps ', after: '',
          options: ['aux', '-l', 'all', '-t'],
          answer: 0,
          explain: '<code>ps aux</code> (no dash) is the classic way to see them all. <code>ps -ef</code> is another.',
        },
        {
          id: 'pr1-build', type: 'build',
          prompt: 'List every process on the machine, with owners and CPU use.',
          tiles: ['ps', 'aux', 'jobs', '-l', 'kill'],
          answers: [['ps', 'aux']],
          explain: '<code>ps aux</code>. Plain <code>ps</code> only shows this terminal.',
        },
        {
          id: 'pr1-type-aux', type: 'type',
          prompt: 'List every process on the machine, with its owner and CPU use.',
          setup: machine(), variant: machine(1),
          check: (sh) => /^USER\s+PID\s+%CPU/.test(lastOut(sh)) && sh.s.procs.every((p) => outLines(sh).some((l) => l.split(/\s+/)[1] === String(p.pid) && l.endsWith(p.cmd))),
          solution: 'ps aux',
          explain: '<code>ps aux</code>. The second machine runs one more service, so every PID is different.',
        },
        {
          id: 'pr1-type-ps', type: 'type',
          prompt: 'List only the processes started from this terminal.',
          setup: machine(), variant: machine(1),
          check: (sh) => {
            const l = outLines(sh);
            return l[0]?.startsWith('PID') && l.some((x) => /^1000 .* bash$/.test(x)) && l.some((x) => x.startsWith(`${sh.s.nextPid - 1} `) && x.endsWith(' ps')) && l.length === 3;
          },
          solution: 'ps',
          explain: 'Plain <code>ps</code>: bash and ps itself. Everything else was started elsewhere.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-procs-2', title: 'Stopping things',
      exercises: [
        {
          id: 'pr2-kill', type: 'learn', new: true, title: '<code>kill PID</code>',
          body: '<code>kill 4201</code> asks process 4201 to stop (it sends the TERM signal); a well-behaved program tidies up and exits. kill prints nothing when it works, so check with <code>ps aux</code>. You can only stop your own processes.',
          teaches: ['kill asks politely', 'only your own processes'],
          demo: { setup: machine(), run: ['kill 4201', 'ps aux'] },
        },
        {
          id: 'pr2-nine', type: 'learn', new: true, title: '<code>kill -9</code>: no arguing',
          body: 'Some programs ignore a polite kill. <code>kill -9 4203</code> sends KILL, which no process can ignore: it stops at once, without a chance to save its work. Try plain kill first.',
          teaches: ['kill -9 forces'],
          demo: { setup: machine(), run: ['kill 4203', 'ps aux', 'kill -9 4203', 'ps aux'] },
        },
        {
          id: 'pr2-ctrlc', type: 'learn', new: true, title: 'Ctrl+C',
          body: 'A program running in front, in your terminal, stops with <b>Ctrl+C</b> (it sends INT). Use it when a command hangs or floods the screen. This sandbox runs nothing long enough to need it.',
          teaches: ['Ctrl+C'],
        },
        {
          id: 'pr2-still', type: 'choice',
          prompt: 'You ran <code>kill 4321</code>, but <code>ps aux</code> still lists 4321. What next?',
          options: ['kill -9 4321', 'kill 4321 again, louder', 'Restart the machine', 'rm 4321'],
          answer: 0,
          needs: ['kill -9 forces'],
          explain: 'It ignored TERM. KILL cannot be ignored.',
        },
        {
          id: 'pr2-match', type: 'match',
          prompt: 'Match each one to what happens.',
          pairs: [['kill 4321', 'Asks 4321 to stop'], ['kill -9 4321', 'Forces 4321 to stop now'], ['Ctrl+C', 'Stops the program running in this terminal'], ['kill 1', 'Operation not permitted: it is root\'s']],
          needs: ['kill asks politely', 'kill -9 forces', 'Ctrl+C', 'only your own processes'],
          explain: 'Polite first, forced if needed, and only for your own processes.',
        },
        {
          id: 'pr2-order', type: 'order',
          prompt: 'A program is stuck. Put the steps in order.',
          steps: ['ps aux', 'kill 4321', 'kill -9 4321'],
          needs: ['kill -9 forces'],
          explain: 'Find its PID, ask it to stop, force it only if it is still there.',
        },
        {
          id: 'pr2-fill', type: 'fill',
          prompt: 'Force process 4321 to stop.',
          before: 'kill ', after: ' 4321',
          options: ['-9', '-1', '9', '--force'],
          answer: 0,
          needs: ['kill -9 forces'],
          explain: '<code>-9</code> is the KILL signal.',
        },
        {
          id: 'pr2-type-render', type: 'type',
          prompt: '<code>render.py</code> is hogging the processor. Find its PID and stop it, leaving everything else running.',
          setup: machine(),
          check: (sh) => !alive(sh, /render\.py/) && alive(sh, /server\.js/) && alive(sh, /^sync\.sh/) && alive(sh, /^worker/),
          solution: 'ps aux\nkill 4201',
          explain: '<code>ps aux</code> shows render.py\'s PID, then <code>kill</code> it.',
        },
        {
          id: 'pr2-type-stuck', type: 'type',
          prompt: '<code>sync.sh</code> is stuck and ignores a plain kill. Stop it, and nothing else.',
          setup: machine(),
          check: (sh) => !alive(sh, /^sync\.sh/) && alive(sh, /render\.py/) && alive(sh, /server\.js/),
          solution: 'ps aux\nkill -9 4203',
          explain: 'Find its PID with <code>ps aux</code>, then <code>kill -9</code> it.',
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-procs-3', title: 'Find them by name',
      exercises: [
        {
          id: 'pr3-pgrep', type: 'learn', new: true, title: '<code>pgrep</code>: PIDs by name',
          body: '<code>pgrep worker</code> prints the PID of every process whose name matches; <code>pgrep -l worker</code> adds the names. It works with <code>$( )</code>: <code>kill $(pgrep render)</code>.',
          demo: { setup: machine(), run: ['pgrep worker', 'pgrep -l worker'] },
        },
        {
          id: 'pr3-pkill', type: 'learn', new: true, title: '<code>pkill</code>: stop by name',
          body: '<code>pkill worker</code> sends TERM to every process whose name matches, <code>pkill -9 worker</code> sends KILL. Careful: it matches part of a name too, so <code>pkill w</code> would hit a lot more.',
          teaches: ['pkill matches part of a name'],
          demo: { setup: machine(), run: ['pkill worker', 'pgrep worker; echo $?'] },
        },
        {
          id: 'pr3-part', type: 'choice',
          prompt: 'Processes called <code>python3</code>, <code>pytest</code> and <code>happy</code> are running. Which ones does <code>pkill py</code> stop?',
          options: ['All three', 'python3 and pytest', 'None: no process is called exactly py', 'Only the newest one'],
          answer: 0,
          needs: ['pkill matches part of a name'],
          explain: 'Every name containing "py" matches, happy too. Check first with <code>pgrep -l py</code>.',
        },
        {
          id: 'pr3-outcome', type: 'outcome', new: true,
          prompt: 'What does this print on this machine?',
          setup: machine(),
          command: 'pgrep -l sync',
          show: 'output',
          distractors: [['pgrep sync'], ['pgrep -l node']],
          explain: '<code>-l</code> adds the name after the PID.',
        },
        {
          id: 'pr3-match', type: 'match',
          prompt: 'Match each command to what it does.',
          pairs: [['pgrep node', 'Prints node\'s PIDs'], ['pgrep -l node', 'Prints PIDs and names'], ['pkill node', 'Asks every node to stop'], ['pkill -9 node', 'Forces every node to stop']],
          explain: 'pgrep looks, pkill acts.',
        },
        {
          id: 'pr3-fill', type: 'fill',
          prompt: 'Stop every <code>render</code> process, using kill with the PIDs a command finds.',
          before: 'kill $(', after: ' render)',
          options: ['pgrep', 'pkill', 'ps', 'jobs'],
          answer: 0,
          explain: '<code>pgrep render</code> prints the PIDs, and <code>$( )</code> hands them to kill. (<code>pkill render</code> does both in one.)',
        },
        {
          id: 'pr3-build', type: 'build',
          prompt: 'Force every process called <code>render</code> to stop, by name.',
          tiles: ['pkill', '-9', 'render', 'pgrep', 'kill', '-l'],
          answers: [['pkill', '-9', 'render']],
          explain: '<code>pkill -9 render</code>.',
        },
        {
          id: 'pr3-type-pgrep', type: 'type',
          prompt: 'Print the PID of every <code>worker</code> process.',
          setup: machine(), variant: machine(1),
          check: (sh) => { const want = sh.s.procs.filter((p) => name(p) === 'worker').map((p) => String(p.pid)); return outLines(sh).join() === want.join(); },
          solution: 'pgrep worker',
          explain: '<code>pgrep worker</code>. The second machine has three workers with other PIDs.',
        },
        {
          id: 'pr3-type-pkill', type: 'type',
          prompt: 'Stop every <code>worker</code> process with one command, and leave the rest running.',
          setup: machine(), variant: machine(1),
          check: (sh) => !alive(sh, /^worker/) && alive(sh, /server\.js/) && alive(sh, /render\.py/),
          solution: 'pkill worker',
          explain: '<code>pkill worker</code>: one command, every match.',
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-procs-4', title: 'Background jobs',
      exercises: [
        {
          id: 'pr4-bg', type: 'learn', new: true, title: '<code>&</code>: run it in the background',
          body: 'A long command keeps the terminal busy until it ends. With <code>&</code> at the end, <code>sleep 100 &</code>, it runs in the background: bash prints its job number and PID, like <code>[1] 4205</code>, and gives you the prompt back.',
          teaches: ['job number and PID'],
          demo: { setup: jobsRunning([]), run: ['sleep 100 &', 'ps'] },
        },
        {
          id: 'pr4-jobs', type: 'learn', new: true, title: '<code>jobs</code>, <code>fg</code>, <code>kill %1</code>',
          body: '<code>jobs</code> lists this terminal\'s background jobs. <code>fg</code> brings the newest back to the front (<code>fg %2</code> picks job 2), and you wait for it there. <code>kill %1</code> stops job 1.',
          demo: { setup: jobsRunning([]), run: ['sleep 100 &', 'sleep 200 &', 'jobs', 'kill %1', 'jobs'] },
        },
        {
          id: 'pr4-ctrlz', type: 'learn', new: true, title: 'Ctrl+Z and <code>bg</code>',
          body: 'Started something in front that takes ages? <b>Ctrl+Z</b> pauses it and gives you the prompt (<code>jobs</code> shows it Stopped). Then <code>bg</code> lets it carry on in the background, or <code>fg</code> brings it back.',
          teaches: ['Ctrl+Z'],
        },
        {
          id: 'pr4-meaning', type: 'choice',
          prompt: 'You typed <code>sleep 300 &</code> and bash printed <code>[2] 4210</code>. What do the numbers mean?',
          options: ['Job 2 in this terminal, process 4210', '2 seconds, then process 4210', '2 processes started', 'Exit status 2'],
          answer: 0,
          needs: ['job number and PID'],
          explain: 'The job number is for <code>fg %2</code> and <code>kill %2</code>; the PID works with kill anywhere.',
        },
        {
          id: 'pr4-outcome', type: 'outcome', new: true,
          prompt: 'What does this print?',
          setup: jobsRunning([]),
          command: 'sleep 50 & sleep 90 & jobs',
          show: 'output',
          distractors: [['sleep 50 & sleep 90 & kill %1; jobs'], ['sleep 50 & jobs']],
          explain: 'Both sleeps run in the background; <code>+</code> marks the newest job, <code>-</code> the one before.',
        },
        {
          id: 'pr4-match', type: 'match',
          prompt: 'Match each one to what it does.',
          pairs: [['sleep 100 &', 'Runs it in the background'], ['jobs', 'Lists the background jobs'], ['fg %2', 'Brings job 2 to the front'], ['Ctrl+Z', 'Pauses the program in front']],
          needs: ['Ctrl+Z'],
          explain: 'Background with <code>&</code>, look with jobs, come back with fg.',
        },
        {
          id: 'pr4-fill', type: 'fill',
          prompt: 'Stop background job number 2.',
          before: 'kill ', after: '',
          options: ['%2', '2', '-2', '#2'],
          answer: 0,
          explain: '<code>%2</code> is job 2. A bare 2 would mean the process with PID 2.',
        },
        {
          id: 'pr4-type-bg', type: 'type',
          prompt: 'Start <code>sleep 300</code> in the background, then list your jobs.',
          setup: jobsRunning([]), variant: jobsRunning(['sleep 50']),
          check: (sh) => sh.s.jobs.some((j) => j.cmd === 'sleep 300' && j.state === 'Running') && lastOutIs(sh, jobsText(sh)),
          solution: 'sleep 300 &\njobs',
          explain: '<code>sleep 300 &</code>, then <code>jobs</code>. On the second try a sleep 50 was already running, so the list is longer.',
        },
        {
          id: 'pr4-type-kill', type: 'type',
          prompt: 'Two sleeps are running in the background. Stop job 1 and keep job 2.',
          setup: jobsRunning(['sleep 50', 'sleep 90']),
          check: (sh) => !sh.s.jobs.some((j) => j.cmd === 'sleep 50') && sh.s.jobs.some((j) => j.cmd === 'sleep 90' && j.state === 'Running'),
          solution: 'kill %1',
          explain: '<code>kill %1</code>. <code>jobs</code> first shows which is which.',
        },
      ],
    },
  ],
};
