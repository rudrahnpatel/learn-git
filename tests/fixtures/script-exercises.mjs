// Test-only `script` exercises (not in any lesson): they exercise the script grader (js/shellex.js gradeScript),
// the content rules for the type (tests/content.test.mjs), the teach-before-test parser for scripts
// (tests/teach-order.test.mjs) and the renderer in the browser checks. Real script lessons arrive with units 9-10.
import { runOut, filesUnder, listOf } from '../../js/content/shell-helpers.js';

const txtIn = (sh, dir) => listOf(sh, dir).filter((n) => n.endsWith('.txt'));

export const SCRIPT_FIXTURES = [
  {
    id: 'fx-script-backup', type: 'script',
    prompt: 'Finish <code>backup.sh</code>: it copies the <code>.txt</code> files in the folder given as <code>$1</code> into <code>backup/</code>, but always says it copied 0. Make it count.',
    file: 'backup.sh',
    setup: (sh) => sh.setupFiles({ 'docs/plan.txt': 'Plan\n', 'docs/todo.txt': 'Todo\n', 'docs/ideas.txt': 'Ideas\n', 'docs/photo.jpg': '' }),
    variant: (sh) => sh.setupFiles({ 'docs/a.txt': 'A\n', 'docs/b.txt': 'B\n', 'docs/c.md': 'C\n', 'docs/d.md': 'D\n' }),
    runs: [{ args: ['docs'] }],
    starter: '#!/bin/bash\n# Copy every .txt file in the folder $1 into backup/\nmkdir -p backup\ncount=0\nfor f in "$1"/*.txt; do\n  cp "$f" backup/\ndone\necho "Backed up $count files"\n',
    solution: '#!/bin/bash\n# Copy every .txt file in the folder $1 into backup/\nmkdir -p backup\ncount=0\nfor f in "$1"/*.txt; do\n  cp "$f" backup/\n  count=$((count + 1))\ndone\necho "Backed up $count files"\n',
    check: (sh) => {
      const want = txtIn(sh, 'docs');
      return filesUnder(sh, 'backup').sort().join() === want.join() && runOut(sh) === `Backed up ${want.length} files`;
    },
    explain: '<code>count</code> starts at 0 and nothing adds to it. Inside the loop, <code>count=$((count + 1))</code> adds one per file copied.',
  },
  {
    id: 'fx-script-greet', type: 'script', run: 'exec',
    prompt: '<code>hello.sh</code> reads a name and should greet it, but it prints <code>Hello, name!</code> every time. Fix it.',
    file: 'hello.sh',
    setup: () => {},
    runs: [{ stdin: 'Ada\n' }, { stdin: 'Linus\n' }],
    starter: '#!/bin/bash\nread -r name\necho "Hello, name!"\n',
    solution: '#!/bin/bash\nread -r name\necho "Hello, $name!"\n',
    check: (sh) => sh.runs?.length === 2 && sh.runs.every((r) => r.out.trim() === `Hello, ${r.stdin.trim()}!`),
    explain: 'Without the <code>$</code>, <code>name</code> is just the word "name". <code>$name</code> is the variable that <code>read</code> filled.',
  },
];
