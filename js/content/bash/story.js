// Bash unit 12, the story: the log detective. A small web shop's server lives in ~/shop: find your way around,
// find out why checkout broke last night, work out the busiest hour, turn it all into report.sh, and clean up
// (old logs, a stuck process). The capstone puzzle writes report.sh from scratch.
import { fileText, fileLines, listOf, lastOut, lastOutIs, fileIs, printedHits, printedSet, printedNumber, isDir, exists, runOutIs } from './helpers.js';

const S = (body) => `#!/bin/bash\n${body}`;
const PAGES = ['/', '/shop', '/cart', '/checkout', '/about'];
const two = (n) => String(n).padStart(2, '0');
// One day's log: `n` ordinary requests spread over 08:00-21:59, `extra` more at the `peak` hour (always on the
// favourite page), and `errors` failed checkouts late in the evening. Lines: date time level method page status.
function day(date, { n = 16, peak, extra = 4, fav, errors = 0, errPages = ['/checkout'], seed = 0 }) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const h = 8 + ((i * 5 + seed) % 14), m = (i * 13 + seed * 7) % 60, s = (i * 17 + seed) % 60;
    const page = PAGES[(i * 3 + seed) % PAGES.length];
    rows.push(i % 7 === 3 ? [h, m, s, 'WARN', 'GET', '/old-page', 404] : [h, m, s, 'INFO', 'GET', page === '/checkout' ? '/cart' : page, 200]);
  }
  for (let i = 0; i < extra; i++) rows.push([peak, 5 + i * 11, (i * 23 + seed) % 60, 'INFO', 'GET', fav, 200]);
  for (let i = 0; i < errors; i++) rows.push([22 + (i > errors / 2 ? 1 : 0), (7 + i * 9) % 60, (i * 31) % 60, 'ERROR', 'POST', errPages[i % errPages.length], 500]);
  rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return rows.map(([h, m, s, ...rest]) => `${date} ${two(h)}:${two(m)}:${two(s)} ${rest.join(' ')}`).join('\n') + '\n';
}
// The shop's server. v0: checkout broke on 01-05, busiest hour 21; v1: logs for 01-04 to 01-06, checkout and cart
// broke on 01-05, busiest hour 13.
const shopFiles = (v = 0) => (v ? {
  'shop/README.txt': 'Notes from the last admin:\n- The shop runs app/server.py\n- Logs go to logs/, one file a day\n- Old logs end in .log.1: delete them now and then\n- Backups go to backups/\n',
  'shop/logs/web-01-04.log': day('2026-01-04', { n: 15, peak: 13, fav: '/cart', errors: 1, seed: 2 }),
  'shop/logs/web-01-05.log': day('2026-01-05', { n: 18, peak: 13, fav: '/cart', errors: 9, errPages: ['/checkout', '/checkout', '/cart'], seed: 5 }),
  'shop/logs/web-01-06.log': day('2026-01-06', { n: 12, peak: 13, fav: '/cart', errors: 0, seed: 1 }),
  'shop/logs/web-12-29.log.1': day('2025-12-29', { n: 6, peak: 10, fav: '/', seed: 3 }),
  'shop/logs/web-12-30.log.1': day('2025-12-30', { n: 6, peak: 10, fav: '/', seed: 4 }),
  'shop/logs/web-12-31.log.1': day('2025-12-31', { n: 6, peak: 10, fav: '/', seed: 6 }),
  'archive/web-12-20.log': day('2025-12-20', { n: 10, peak: 11, fav: '/', errors: 3, seed: 3 }),
  'archive/web-12-21.log': day('2025-12-21', { n: 8, peak: 11, fav: '/', errors: 0, seed: 8 }),
  'archive/web-12-22.log': day('2025-12-22', { n: 9, peak: 11, fav: '/', errors: 2, seed: 9 }),
} : {
  'shop/README.txt': 'Notes from the last admin:\n- The site runs from app/server.py\n- Logs are in logs/, one file per day\n- Old logs get .1 on the end; delete them once in a while\n- report.sh was meant to sum up the logs. Never finished it.\n',
  'shop/logs/web-01-03.log': day('2026-01-03', { n: 16, peak: 21, fav: '/shop', errors: 0, seed: 1 }),
  'shop/logs/web-01-04.log': day('2026-01-04', { n: 14, peak: 21, fav: '/shop', errors: 1, seed: 4 }),
  'shop/logs/web-01-05.log': day('2026-01-05', { n: 17, peak: 21, fav: '/shop', errors: 6, seed: 7 }),
  'shop/logs/web-12-30.log.1': day('2025-12-30', { n: 6, peak: 9, fav: '/', seed: 2 }),
  'shop/logs/web-12-31.log.1': day('2025-12-31', { n: 6, peak: 9, fav: '/', seed: 5 }),
  'archive/web-12-27.log': day('2025-12-27', { n: 9, peak: 15, fav: '/about', errors: 2, seed: 6 }),
  'archive/web-12-28.log': day('2025-12-28', { n: 11, peak: 15, fav: '/about', errors: 0, seed: 2 }),
});
const shop = (v = 0) => (sh) => {
  sh.setupFiles({
    ...shopFiles(v),
    'shop/app/server.py': 'print("shop running")\n', 'shop/app/config.ini': `port = ${v ? 9000 : 8080}\ndebug = false\n`, 'shop/backups/': null,
  });
  sh.setupProcess('/usr/sbin/sshd', { user: 'root', tty: '?', mem: 0.6 });
  sh.setupProcess('python3 app/server.py', { cpu: v ? 96.4 : 99.2, mem: 6.3, stubborn: true });
  if (v) sh.setupProcess('node metrics.js', { cpu: 0.7 });
};
// report.sh's finished text (the capstone and lesson 4 build up to it)
const REPORT = S('# Usage: report.sh DIR\nif [ ! -d "$1" ]; then\n  echo "Usage: report.sh DIR"\n  exit 1\nfi\necho "Logs: $(ls "$1"/*.log | wc -l)"\necho "Errors: $(cat "$1"/*.log | grep -c ERROR)"\nhour=$(cat "$1"/*.log | cut -d\' \' -f2 | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 1 | awk \'{print $2}\')\necho "Busiest hour: $hour"\n');
const withReport = (v = 0) => (sh) => { shop(v)(sh); sh.setupFiles({ 'report.sh': REPORT }); };

/* ------------------------------------------------------------ what the logs say, computed from the shell */
const logsIn = (sh, dir = 'shop/logs') => listOf(sh, dir).filter((n) => n.endsWith('.log'));
const rowsIn = (sh, dir = 'shop/logs') => logsIn(sh, dir).flatMap((n) => fileLines(sh, `${dir}/${n}`)).map((l) => l.split(' '));
// the most common value and how often it occurs (the data has no ties at the top)
const top = (vals) => {
  const c = new Map();
  for (const v of vals) c.set(v, (c.get(v) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0] || ['', 0];
};
const busiest = (sh, dir) => top(rowsIn(sh, dir).map((r) => r[1].slice(0, 2)));
const errorsIn = (sh, dir) => rowsIn(sh, dir).filter((r) => r[2] === 'ERROR').length;
// `uniq -c` style "count value" as the only line printed
const printedTop = (sh, [value, count]) => count > 0 && lastOut(sh).trim().split(/\s+/).join(' ') === `${count} ${value}`;
const reportLines = (sh, dir) => [`Logs: ${logsIn(sh, dir).length}`, `Errors: ${errorsIn(sh, dir)}`, `Busiest hour: ${busiest(sh, dir)[0]}`];
const alive = (sh, re) => sh.s.procs.some((p) => re.test(p.cmd));

export default {
  id: 'bash-story', title: 'Story: the log detective', color: 'red',
  blurb: 'A web shop\'s server, a broken checkout, and a report the owner can read every morning.',
  challenges: [
    {
      id: 'bash-detective', title: 'The log detective', blurb: 'Write report.sh from scratch, then leave the server tidy.',
      exercises: [
        {
          id: 'stc-report', type: 'script',
          prompt: 'Write <code>report.sh DIR</code>. For the .log files in DIR it prints three lines: <code>Logs: N</code>, <code>Errors: E</code> (ERROR lines) and <code>Busiest hour: HH</code>. Without a folder, it prints <code>Usage: report.sh DIR</code> and exits with status 1.',
          file: 'report.sh',
          setup: shop(), variant: shop(1),
          runs: [{ args: [], code: 1 }, { args: ['archive'] }, { args: ['shop/logs'] }],
          starter: S('# Usage: report.sh DIR\n'),
          solution: REPORT,
          check: (sh) => sh.runs?.length === 3 && sh.runs[0].code === 1 && /Usage: report\.sh DIR/.test(sh.runs[0].out + sh.runs[0].err)
            && runOutIs(sh, 1, reportLines(sh, 'archive')) && runOutIs(sh, 2, reportLines(sh, 'shop/logs')),
          explain: 'A usage check with <code>[ ! -d "$1" ]</code> and <code>exit 1</code>, then one <code>echo</code> per line, each with a <code>$( )</code>: <code>ls … | wc -l</code>, <code>grep -c ERROR</code>, and the cut / sort / uniq -c / sort -rn / head pipeline ending in <code>awk \'{print $2}\'</code>.',
        },
        {
          id: 'stc-tidy', type: 'type', max: 6,
          prompt: 'Leave the server tidy: delete the old <code>.log.1</code> files under <code>shop/logs</code>, and stop the stuck <code>python3</code> server process (it ignores a polite kill).',
          setup: shop(), variant: shop(1),
          check: (sh) => !listOf(sh, 'shop/logs').some((n) => n.endsWith('.log.1')) && logsIn(sh).length > 0 && !alive(sh, /server\.py/) && alive(sh, /sshd/),
          solution: 'find shop/logs -name "*.log.1" -delete\npkill -9 python3',
          explain: '<code>find shop/logs -name "*.log.1" -delete</code>, then <code>pkill -9 python3</code> (or <code>kill -9</code> with its PID from <code>ps aux</code>).',
        },
      ],
    },
  ],
  lessons: [
    /* ------------------------------------------------------------ 1 */
    {
      id: 'bash-story-1', title: 'Day one on the server',
      exercises: [
        {
          id: 'st1-message', type: 'learn', new: true, title: 'Day one',
          body: 'A message from the shop\'s owner: "Welcome aboard! Our web shop runs on this server, in <code>~/shop</code>. Customers say checkout broke last night. Have a look around, find out what happened, and keep the place tidy."',
          demo: { setup: shop(), run: ['ls shop'] },
        },
        {
          id: 'st1-look', type: 'learn', new: true, title: 'Look before you touch',
          body: 'On a machine you don\'t know, look first: <code>ls -R shop</code> lists every folder inside, and <code>cat shop/README.txt</code> reads the notes the last admin left. Nothing changes while you only look.',
          demo: { setup: shop(), run: ['ls -R shop', 'cat shop/README.txt'] },
        },
        {
          id: 'st1-where', type: 'choice',
          prompt: 'Where would you look first for clues about what broke last night?',
          options: ['The log files in shop/logs', 'shop/app/config.ini', 'Your ~/.bashrc', 'The output of whoami'],
          answer: 0,
          explain: 'Programs write what happened, and when, into their logs.',
        },
        {
          id: 'st1-match', type: 'match',
          prompt: 'Match each part of the shop to what it holds.',
          pairs: [['shop/app', 'The shop\'s program'], ['shop/logs', 'One log file per day'], ['shop/backups', 'Copies, empty so far'], ['shop/README.txt', 'Notes from the last admin']],
          explain: 'A quick <code>ls -R</code> and the README tell you most of this.',
        },
        {
          id: 'st1-outcome', type: 'outcome', new: true,
          prompt: 'What does this print?',
          setup: shop(),
          command: 'ls shop/logs | wc -l',
          show: 'output',
          distractors: [['ls shop | wc -l'], ['ls shop/app | wc -l']],
          explain: 'shop/logs holds three day logs and two old ones.',
        },
        {
          id: 'st1-old', type: 'choice',
          prompt: 'The README says old logs end in <code>.1</code>. Which pattern matches exactly those?',
          options: ['*.log.1', '*.log', '*.1.log', 'log.1'],
          answer: 0,
          explain: '<code>*.log.1</code>: anything, then .log.1 at the end. <code>*.log</code> only matches names ending in .log.',
        },
        {
          id: 'st1-fill', type: 'fill',
          prompt: 'List every .log file anywhere under <code>shop</code>.',
          before: 'find shop -name ', after: '',
          options: ['"*.log"', '"log"', '.log', '"*.log.1"'],
          answer: 0,
          needs: ['quote find patterns'],
          explain: 'Quote the pattern so find gets the star, not the shell.',
        },
        {
          id: 'st1-type-readme', type: 'type',
          prompt: 'Read the notes the last admin left in the shop folder.',
          setup: shop(), variant: shop(1),
          check: (sh) => lastOutIs(sh, fileText(sh, 'shop/README.txt')),
          solution: 'cat shop/README.txt',
          explain: '<code>cat shop/README.txt</code>.',
        },
        {
          id: 'st1-type-logs', type: 'type',
          prompt: 'List the files in <code>shop/logs</code> whose names end in <code>.log</code>, and no others.',
          setup: shop(), variant: shop(1),
          check: (sh) => {
            const got = lastOut(sh).split(/\s+/).filter(Boolean).map((w) => w.split('/').pop()).sort();
            return got.join() === logsIn(sh).join();
          },
          solution: 'ls shop/logs/*.log',
          explain: '<code>ls shop/logs/*.log</code>: the glob leaves out the old .log.1 files.',
        },
      ],
    },
    /* ------------------------------------------------------------ 2 */
    {
      id: 'bash-story-2', title: 'What broke?',
      exercises: [
        {
          id: 'st2-trail', type: 'learn', new: true, title: 'Errors leave a trail',
          body: 'Each log line reads: date, time, level, request, status, like <code>2026-01-05 22:07:00 ERROR POST /checkout 500</code>. <code>grep -c ERROR shop/logs/*.log</code> counts the errors in each day\'s file, so the bad day stands out.',
          teaches: ['log line fields'],
          demo: { setup: shop(), run: ['head -n 3 shop/logs/web-01-05.log', 'grep -c ERROR shop/logs/*.log'] },
        },
        {
          id: 'st2-day', type: 'choice',
          prompt: 'Which day did checkout break?',
          code: '$ grep -c ERROR shop/logs/*.log\nshop/logs/web-01-03.log:0\nshop/logs/web-01-04.log:1\nshop/logs/web-01-05.log:6',
          options: ['5 January', '3 January', '4 January', 'Every day'],
          answer: 0,
          explain: 'One error can be bad luck; six in an evening is a breakage.',
        },
        {
          id: 'st2-zoom', type: 'learn', new: true, title: 'Zoom in',
          body: '<code>grep -n ERROR file | head -n 3</code> shows the first errors with their line numbers. The first one is where it started; the rest are often the same problem repeating.',
          demo: { setup: shop(), run: ['grep -n ERROR shop/logs/web-01-05.log | head -n 3'] },
        },
        {
          id: 'st2-outcome', type: 'outcome', new: true,
          prompt: 'What does this print?',
          setup: shop(),
          command: 'grep ERROR shop/logs/web-01-05.log | head -n 1',
          show: 'output',
          distractors: [['grep -v ERROR shop/logs/web-01-05.log | head -n 1'], ['grep ERROR shop/logs/web-01-05.log | tail -n 1']],
          explain: 'grep keeps the ERROR lines, head the first of them.',
        },
        {
          id: 'st2-match', type: 'match',
          prompt: 'Match each command to what it shows.',
          pairs: [['grep -c ERROR *.log', 'How many errors each file has'], ['grep -n ERROR web.log', 'Each error with its line number'], ['grep -v INFO web.log', 'Every line that is not INFO'], ['grep -l ERROR *.log', 'Only the names of files with errors']],
          explain: 'One grep, four questions.',
        },
        {
          id: 'st2-build', type: 'build',
          prompt: 'Count the ERROR lines in each .log file in <code>shop/logs</code>.',
          tiles: ['grep', '-c', 'ERROR', 'shop/logs/*.log', '-n', 'wc'],
          answers: [['grep', '-c', 'ERROR', 'shop/logs/*.log']],
          explain: '<code>grep -c ERROR shop/logs/*.log</code>: one count per file.',
        },
        {
          id: 'st2-type-count', type: 'type',
          prompt: 'Show how many ERROR lines each .log file in <code>shop/logs</code> has.',
          setup: shop(), variant: shop(1),
          check: (sh) => printedHits(sh, logsIn(sh).map((n) => `shop/logs/${n}:${fileLines(sh, `shop/logs/${n}`).filter((l) => l.split(' ')[2] === 'ERROR').length}`)),
          solution: 'grep -c ERROR shop/logs/*.log',
          explain: '<code>grep -c ERROR shop/logs/*.log</code>. On the second server another day broke.',
        },
        {
          id: 'st2-type-first', type: 'type',
          prompt: 'Print the first ERROR line in the logs, with its file name and line number.',
          setup: shop(), variant: shop(1),
          check: (sh) => {
            for (const n of logsIn(sh)) {
              const ls = fileLines(sh, `shop/logs/${n}`);
              const i = ls.findIndex((l) => l.split(' ')[2] === 'ERROR');
              if (i >= 0) return printedHits(sh, [`shop/logs/${n}:${i + 1}:${ls[i]}`]);
            }
            return false;
          },
          solution: 'grep -n ERROR shop/logs/*.log | head -n 1',
          explain: '<code>grep -n ERROR shop/logs/*.log | head -n 1</code>: with several files, grep puts the name in front, then the line number.',
        },
        {
          id: 'st2-type-pages', type: 'type',
          prompt: 'Which pages had errors? Print each page (field 5) that appears on an ERROR line, once.',
          setup: shop(), variant: shop(1),
          check: (sh) => printedSet(sh, [...new Set(rowsIn(sh).filter((r) => r[2] === 'ERROR').map((r) => r[4]))]),
          solution: "cat shop/logs/*.log | grep ERROR | awk '{print $5}' | sort -u",
          needs: ['log line fields'],
          explain: "<code>cat shop/logs/*.log | grep ERROR | awk '{print $5}' | sort -u</code>: only /checkout. That's the broken page.",
        },
      ],
    },
    /* ------------------------------------------------------------ 3 */
    {
      id: 'bash-story-3', title: 'Busiest hour',
      exercises: [
        {
          id: 'st3-hours', type: 'learn', new: true, title: 'Hours from timestamps',
          body: 'The time is field 2, so <code>cut -d\' \' -f2</code> gives 22:07:00. Cut again at the colon to keep only the hour: <code>cut -d\' \' -f2 web.log | cut -d: -f1</code> prints one hour per request.',
          demo: { setup: shop(), run: ["cut -d' ' -f2 shop/logs/web-01-05.log | cut -d: -f1 | head -n 4"] },
        },
        {
          id: 'st3-rank', type: 'learn', new: true, title: 'Count, then rank',
          body: 'You know the recipe: <code>sort | uniq -c | sort -rn | head -n 1</code>. Fed one hour per request, it prints the busiest hour with its count, like <code>9 21</code>: nine requests between 21:00 and 21:59.',
          demo: { setup: shop(), run: ["cut -d' ' -f2 shop/logs/web-01-05.log | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 3"] },
        },
        {
          id: 'st3-why', type: 'choice',
          prompt: 'Why does the recipe sort before <code>uniq -c</code>?',
          options: ['uniq only merges lines that sit next to each other', 'uniq -c needs numbers in order', 'To make it faster', 'It doesn\'t need to'],
          answer: 0,
          needs: ['sorted before uniq'],
          explain: 'Unsorted, the same hour shows up in several runs and gets counted in pieces.',
        },
        {
          id: 'st3-order', type: 'order',
          prompt: 'Put the busiest-hour pipeline in order.',
          steps: ["cut -d' ' -f2 web.log", 'cut -d: -f1', 'sort', 'uniq -c', 'sort -rn'],
          explain: 'Times, hours, group, count, rank.',
        },
        {
          id: 'st3-outcome', type: 'outcome', new: true,
          prompt: 'What does this print?',
          setup: (sh) => sh.setupFiles({ 'mini.log': '2026-01-05 09:10:00 INFO GET / 200\n2026-01-05 10:20:00 INFO GET /shop 200\n2026-01-05 09:30:00 INFO GET /cart 200\n2026-01-05 10:40:00 INFO GET / 200\n2026-01-05 10:50:00 INFO GET /shop 200\n' }),
          command: "cut -d' ' -f2 mini.log | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 1",
          show: 'output',
          distractors: [["cut -d' ' -f2 mini.log | cut -d: -f1 | uniq -c | sort -rn | head -n 1"], ["cut -d' ' -f2 mini.log | cut -d: -f1 | sort | uniq -c | sort -n | head -n 1"]],
          explain: 'Hour 10 has three requests, hour 09 two. Without the first sort, the 10s are split into runs of one and two.',
        },
        {
          id: 'st3-fill', type: 'fill',
          prompt: 'Rank the counts, biggest first.',
          before: '… | sort | uniq -c | sort ', after: ' | head -n 1',
          options: ['-rn', '-n', '-r', '-u'],
          answer: 0,
          explain: '<code>-n</code> sorts as numbers, <code>-r</code> puts the biggest first.',
        },
        {
          id: 'st3-type-hour', type: 'type',
          prompt: 'Which hour of all the .log files in <code>shop/logs</code> together had the most requests? Print the count and the hour.',
          setup: shop(), variant: shop(1),
          check: (sh) => printedTop(sh, busiest(sh)),
          solution: "cat shop/logs/*.log | cut -d' ' -f2 | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 1",
          explain: "<code>cat shop/logs/*.log | cut -d' ' -f2 | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 1</code>.",
        },
        {
          id: 'st3-type-page', type: 'type',
          prompt: 'Which page was asked for most often in the .log files of <code>shop/logs</code>? Print the count and the page.',
          setup: shop(), variant: shop(1),
          check: (sh) => printedTop(sh, top(rowsIn(sh).map((r) => r[4]))),
          solution: "cat shop/logs/*.log | awk '{print $5}' | sort | uniq -c | sort -rn | head -n 1",
          needs: ['log line fields'],
          explain: "The page is field 5: <code>cat shop/logs/*.log | awk '{print $5}' | sort | uniq -c | sort -rn | head -n 1</code>.",
        },
        {
          id: 'st3-type-500', type: 'type',
          prompt: 'How many requests in the .log files of <code>shop/logs</code> ended with status 500?',
          setup: shop(), variant: shop(1),
          check: (sh) => printedNumber(sh, rowsIn(sh).filter((r) => r[5] === '500').length),
          solution: "cat shop/logs/*.log | awk '$6 == 500' | wc -l",
          needs: ['log line fields'],
          explain: "<code>cat shop/logs/*.log | awk '$6 == 500' | wc -l</code> (the status is field 6). <code>grep -c ' 500$'</code> on the joined logs works too.",
        },
      ],
    },
    /* ------------------------------------------------------------ 4 */
    {
      id: 'bash-story-4', title: 'Automate it',
      exercises: [
        {
          id: 'st4-ask', type: 'learn', new: true, title: 'Every morning, please',
          body: 'The owner liked your findings: "Can I get that every morning?" Commands you keep retyping belong in a script. <code>report.sh shop/logs</code> should print how many logs there are, how many errors, and the busiest hour.',
        },
        {
          id: 'st4-plan', type: 'learn', new: true, title: 'One line per fact',
          body: 'Each line is an <code>echo</code> with a <code>$( )</code> inside: <code>echo "Errors: $(cat "$1"/*.log | grep -c ERROR)"</code>. <code>"$1"/*.log</code> is every log in the folder given first. Keep the <code>*</code> outside the quotes, or it isn\'t expanded.',
          teaches: ['glob outside the quotes'],
          demo: { setup: withReport(), run: ['bash report.sh shop/logs'] },
        },
        {
          id: 'st4-glob', type: 'choice',
          prompt: 'In report.sh, which one is every .log file in the folder given as the first argument?',
          options: ['"$1"/*.log', '"$1/*.log"', '$1*.log', '"$@".log'],
          answer: 0,
          needs: ['glob outside the quotes'],
          explain: 'Quote the variable (it may hold a space), leave the star bare so the shell expands it.',
        },
        {
          id: 'st4-match', type: 'match',
          prompt: 'Inside report.sh, match each piece to what it is.',
          pairs: [['"$1"', 'The folder given to the script'], ['"$1"/*.log', 'Every .log file in it'], ['$( … )', 'A command\'s output, in place'], ['exit 1', 'Stop and report failure']],
          needs: ['glob outside the quotes', 'exit stops the script'],
          explain: 'The whole report is built from pieces you already know.',
        },
        {
          id: 'st4-order', type: 'order',
          prompt: 'Put the start of report.sh in order.',
          steps: ['#!/bin/bash', 'if [ ! -d "$1" ]; then', 'echo "Usage: report.sh DIR"', 'exit 1', 'fi'],
          explain: 'Shebang first, then refuse to go on without a folder.',
        },
        {
          id: 'st4-fill', type: 'fill',
          prompt: 'In report.sh: print how many .log files the folder given as the first argument has.',
          before: 'echo "Logs: $(ls ', after: '/*.log | wc -l)"',
          options: ['"$1"', '"$0"', '"$#"', '$2'],
          answer: 0,
          explain: '<code>"$1"</code> is the folder; <code>$0</code> would be report.sh itself.',
        },
        {
          id: 'st4-script-errors', type: 'script',
          prompt: 'Replace the <code>?</code> in <code>report.sh</code> so the second line counts the ERROR lines in all the folder\'s .log files.',
          file: 'report.sh',
          setup: shop(), variant: shop(1),
          runs: [{ args: ['shop/logs'] }],
          starter: S('# Usage: report.sh DIR\necho "Logs: $(ls "$1"/*.log | wc -l)"\necho "Errors: ?"\n'),
          solution: S('# Usage: report.sh DIR\necho "Logs: $(ls "$1"/*.log | wc -l)"\necho "Errors: $(cat "$1"/*.log | grep -c ERROR)"\n'),
          check: (sh) => runOutIs(sh, 0, reportLines(sh, 'shop/logs').slice(0, 2)),
          explain: '<code>$(cat "$1"/*.log | grep -c ERROR)</code>: join the logs, count the matching lines.',
        },
        {
          id: 'st4-script-hour', type: 'script',
          prompt: 'Finish <code>report.sh</code>: the <code>hour=</code> line should end up with just the busiest hour (no count) in <code>$hour</code>.',
          file: 'report.sh',
          setup: shop(), variant: shop(1),
          runs: [{ args: ['shop/logs'] }],
          starter: S('# Usage: report.sh DIR\necho "Logs: $(ls "$1"/*.log | wc -l)"\necho "Errors: $(cat "$1"/*.log | grep -c ERROR)"\nhour=$(cat "$1"/*.log | cut -d\' \' -f2 | cut -d: -f1)\necho "Busiest hour: $hour"\n'),
          solution: S('# Usage: report.sh DIR\necho "Logs: $(ls "$1"/*.log | wc -l)"\necho "Errors: $(cat "$1"/*.log | grep -c ERROR)"\nhour=$(cat "$1"/*.log | cut -d\' \' -f2 | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 1 | awk \'{print $2}\')\necho "Busiest hour: $hour"\n'),
          check: (sh) => runOutIs(sh, 0, reportLines(sh, 'shop/logs')),
          explain: "Add <code>| sort | uniq -c | sort -rn | head -n 1 | awk '{print $2}'</code>: rank the hours, keep the top line, keep its second field.",
        },
        {
          id: 'st4-type-save', type: 'type',
          prompt: 'Run <code>report.sh</code> on <code>shop/logs</code> and save what it prints in <code>shop/report.txt</code> for the owner.',
          setup: withReport(), variant: withReport(1),
          check: (sh) => fileIs(sh, 'shop/report.txt', reportLines(sh, 'shop/logs')),
          solution: 'bash report.sh shop/logs > shop/report.txt',
          explain: '<code>bash report.sh shop/logs > shop/report.txt</code>.',
        },
      ],
    },
    /* ------------------------------------------------------------ 5 */
    {
      id: 'bash-story-5', title: 'Clean-up',
      exercises: [
        {
          id: 'st5-old', type: 'learn', new: true, title: 'Old logs',
          body: 'The README says old logs end in <code>.1</code>. Before deleting, see what a pattern matches: <code>find shop/logs -name "*.log.1"</code> lists them. Add <code>-delete</code> only once the list looks right.',
          demo: { setup: shop(), run: ['find shop/logs -name "*.log.1"'] },
        },
        {
          id: 'st5-why', type: 'choice',
          prompt: 'Why run the find without <code>-delete</code> first?',
          options: ['There is no undo: check the list before anything is deleted', 'find cannot delete on the first run', 'To make the files smaller first', '-delete needs the list in a file'],
          answer: 0,
          needs: ['no trash can'],
          explain: 'A wrong pattern with -delete takes the wrong files with it, for good.',
        },
        {
          id: 'st5-outcome', type: 'outcome', new: true,
          prompt: 'What does this print?',
          setup: shop(),
          command: 'find shop/logs -name "*.log.1" | wc -l',
          show: 'output',
          distractors: [['find shop/logs -name "*.log*" | wc -l'], ['find shop -name "*.log" | wc -l']],
          explain: 'Two old logs end in .log.1.',
        },
        {
          id: 'st5-stuck', type: 'learn', new: true, title: 'A stuck process',
          body: 'The owner again: "The server has felt slow since last night." <code>ps aux</code> shows <code>python3 app/server.py</code> using almost all the processor. It ignores a polite kill, so it needs <code>kill -9</code> with its PID.',
          demo: { setup: shop(), run: ['ps aux'] },
        },
        {
          id: 'st5-match', type: 'match',
          prompt: 'Match each command to its job in the clean-up.',
          pairs: [['find shop/logs -name "*.log.1"', 'Lists the old logs'], ['find shop/logs -name "*.log.1" -delete', 'Deletes them'], ['ps aux', 'Shows every process and its CPU'], ['kill -9 4201', 'Stops a stuck process']],
          needs: ['kill -9 forces'],
          explain: 'Look, then act: for files and for processes.',
        },
        {
          id: 'st5-fill', type: 'fill',
          prompt: 'Delete the old logs.',
          before: 'find shop/logs -name "*.log.1" ', after: '',
          options: ['-delete', '-rm', '| rm', '-exec'],
          answer: 0,
          explain: '<code>-delete</code> removes each file find matched.',
        },
        {
          id: 'st5-type-old', type: 'type',
          prompt: 'Delete every old log (names ending in <code>.log.1</code>) under <code>shop/logs</code>, and nothing else.',
          setup: shop(), variant: shop(1),
          check: (sh) => !listOf(sh, 'shop/logs').some((n) => n.endsWith('.log.1')) && logsIn(sh).length === 3,
          solution: 'find shop/logs -name "*.log.1" -delete',
          explain: '<code>find shop/logs -name "*.log.1" -delete</code> (or <code>rm shop/logs/*.log.1</code>).',
        },
        {
          id: 'st5-type-kill', type: 'type',
          prompt: 'The server process is stuck and slowing everything down. Stop it.',
          setup: shop(),
          check: (sh) => !alive(sh, /server\.py/) && alive(sh, /sshd/),
          solution: 'ps aux\nkill -9 4201',
          explain: '<code>ps aux</code> for its PID, then <code>kill -9 4201</code>: a plain kill is ignored.',
        },
        {
          id: 'st5-type-backup', type: 'type',
          prompt: 'Before you go: copy every .log file in <code>shop/logs</code> into <code>shop/backups</code>.',
          setup: shop(), variant: shop(1),
          check: (sh) => isDir(sh, 'shop/backups') && logsIn(sh).every((n) => fileText(sh, `shop/backups/${n}`) === fileText(sh, `shop/logs/${n}`)) && !listOf(sh, 'shop/backups').some((n) => n.endsWith('.log.1')),
          solution: 'cp shop/logs/*.log shop/backups/',
          explain: '<code>cp shop/logs/*.log shop/backups/</code>. Well done, detective.',
        },
      ],
    },
  ],
};

// guard: no ties at the top of the busiest-hour and busiest-page rankings (sort -rn would order ties by the line)
export const _rankings = { shopFiles, top, PAGES, exists };
