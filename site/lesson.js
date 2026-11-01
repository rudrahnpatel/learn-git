// The hero: a three-step mini-lesson on the app's real git engine (../js/git.js) and graph renderer (../js/graph.js).
// Guided and impossible to get stuck in: only the step's command (plus harmless read-only ones) runs, anything else
// gets a friendly hint, the next command waits in the input's placeholder (Enter on an empty line, Tab or → fills it
// in), and there's "Play it for me" and "Start over".
// Quiet by design: one voice at a time (Twig's line is the only guidance; the terminal never repeats it), the terminal
// shows only the latest command and its output (earlier ones fold behind a small "earlier" button), and the progress
// is three dots in the footer row.
// The engine is imported lazily: when the lesson nears the viewport, or on the first interaction with it.
const cfg = window.LEARN_GIT_SITE || {};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const root = $('lesson');
const out = $('term-out'), form = $('term-form'), input = $('term-in'), oldBtn = $('term-old');
const coach = $('coach'), twig = root.querySelector('.coach-twig'), prompt = $('term-prompt');
const playBtn = $('play'), resetBtn = $('reset'), doneNote = $('done-note'), sugBtn = $('term-sug');
// the one suggestion shows as the input's placeholder; on phones, where a long placeholder gets cut off, as one chip
const narrow = matchMedia('(max-width: 599px)');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COMMIT = /^git\s+commit\b.*\s(-m|-am|--message)\b/;
const STEPS = [
  {
    name: 'commit', cmd: 'git commit -m "hello"', ok: COMMIT,
    // Twig's lines stay short (12 words at most): the command itself waits in the placeholder
    intro: 'hello.txt is staged. Commit it.',
    hint: 'A commit needs a message: git commit -m "hello"',
    win: 'Your first commit! Now make a branch called idea.',
  },
  {
    name: 'branch', cmd: 'git switch -c idea', ok: /^git\s+(switch\s+(-c|--create)|checkout\s+-b)\s+\S+$/,
    hint: 'Make a branch and hop on: git switch -c idea',
    win: 'A branch is just a label. Commit on it.',
  },
  {
    name: 'commit again', cmd: 'git commit -m "try an idea"', ok: COMMIT,
    stage: ['echo "what if the button was yellow?" > idea.txt', 'git add idea.txt'],
    hint: 'Commit on your branch: git commit -m "try an idea"',
    win: "idea moved on, main stayed put. That's branching.",
  },
];
const AFTER = 'git log --oneline --graph --all'; // the suggestion once the lesson is done
// harmless commands that run at any point and never advance the lesson
const READ_ONLY = /^(git\s+(status|log(\s+--(oneline|graph|all))*|branch|diff(\s+--staged)?|show|reflog|--version|version)|ls|pwd|cat\s+\S+)$/;

let repo = null, graph = null, step = 0, busy = false, ready = null;

function load() {
  return ready ||= Promise.all([import('../js/git.js'), import('../js/graph.js')]).then(([git, g]) => {
    root.dataset.engine = 'ready';
    start(git, g);
  }).catch((e) => { coach.textContent = 'The engine did not load. Reload the page to try again.'; console.error(e); ready = null; });
}
let mods = null;
function start(git, g) {
  mods ||= { git, g };
  repo = new mods.git.Repo();
  for (const c of ['echo "# my project" > README.md', 'git add README.md', 'git commit -m "init"', 'echo "hello, world" > hello.txt', 'git add hello.txt']) repo.run(c);
  repo.setupDone();
  const box = $('lesson-graph');
  box.replaceChildren();
  graph = new mods.g.GraphView(box, { size: 'full' });
  graph.svg.setAttribute('aria-label', 'Commit graph of the lesson repo');
  graph.render(repo.graphData(), { animate: false });
  step = 0;
  clearOut();
  setStep();
}

// The terminal keeps one entry per command (its echo plus output). Only the latest shows; earlier ones fold away.
let showOld = false;
function clearOut() { out.replaceChildren(); syncOld(); }
function print(lines) {
  let box = out.lastElementChild;
  for (const [t, c] of lines) {
    if (c === 'cmd' || !box) {
      for (const e of out.children) e.classList.add('old');
      box = document.createElement('div'); box.className = 'entry'; out.append(box);
    }
    const d = document.createElement('div');
    d.className = 'ln' + (c ? ' ' + c : '');
    if (c === 'cmd') { const p = document.createElement('span'); p.className = 'p'; p.textContent = '$ '; d.append(p, t); } else d.textContent = t;
    box.append(d);
  }
  while (out.childElementCount > 30) out.firstElementChild.remove();
  syncOld();
  scrollOut();
}
// folded, the latest entry shows from its command line down; unfolded, follow the end
const scrollOut = () => { out.scrollTop = showOld ? out.scrollHeight : 0; };
function syncOld() {
  const n = out.querySelectorAll('.entry.old').length;
  oldBtn.hidden = !n;
  out.classList.toggle('show-old', showOld);
  oldBtn.setAttribute('aria-expanded', String(showOld));
  oldBtn.textContent = showOld ? 'hide earlier' : `${n} earlier command${n > 1 ? 's' : ''}`;
}
oldBtn.addEventListener('click', () => { showOld = !showOld; syncOld(); scrollOut(); });

function say(text, win = false) {
  coach.textContent = text;
  coach.classList.toggle('win', win);
  if (!reduced && win) { twig.classList.remove('hop'); void twig.getBoundingClientRect(); twig.classList.add('hop'); }
}

function setStep() {
  // progress: three dots (done, current, to do), named for screen readers
  const dots = $('steps');
  dots.querySelectorAll('i').forEach((d, i) => { d.classList.toggle('done', i < step); d.classList.toggle('now', i === step); });
  dots.setAttribute('aria-label', STEPS[step] ? `Step ${step + 1} of ${STEPS.length}: ${STEPS[step].name}` : 'Lesson done: all 3 steps');
  prompt.textContent = `(${repo.branchName() || 'HEAD'}) $`;
  const s = STEPS[step];
  showSuggestion();
  if (s && step === 0) say(s.intro);
  root.classList.toggle('done', !s);
  playBtn.hidden = !s; doneNote.hidden = !!s;
  playBtn.disabled = busy;
  if (!busy) playBtn.textContent = 'Play it for me';
}
const suggestion = () => STEPS[step]?.cmd || AFTER;
function showSuggestion() {
  input.placeholder = narrow.matches ? 'type a command…' : suggestion();
  sugBtn.textContent = suggestion();
  sugBtn.setAttribute('aria-label', `Insert command: ${suggestion()}`);
}
narrow.addEventListener?.('change', showSuggestion);
sugBtn.addEventListener('click', () => { accept(); if (matchMedia('(pointer: fine)').matches) input.focus(); });
// fill the input with the suggestion (Enter on an empty line, Tab or → at the end of a matching prefix)
function accept() { input.value = suggestion(); input.setSelectionRange(input.value.length, input.value.length); }
input.addEventListener('keydown', (e) => {
  const v = input.value, sug = suggestion();
  const atEnd = input.selectionStart === v.length;
  if ((e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) && v && v !== sug && sug.startsWith(v)) { e.preventDefault(); accept(); }
});

function run(line) {
  const r = repo.run(line);
  if (r.events?.some((e) => e.type === 'clear')) out.replaceChildren();
  print(r.lines.map((l) => [l.t, l.c]));
  graph.render(repo.graphData());
  prompt.textContent = `(${repo.branchName() || 'HEAD'}) $`;
  return r.ok;
}

function handle(raw) {
  const line = raw.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!line) return;
  print([[line, 'cmd']]);
  if (line === 'clear') { clearOut(); return; }
  const s = STEPS[step];
  if (s && s.ok.test(line)) {
    if (!run(line)) { say(s.hint); return; }
    if (s.name === 'branch' && repo.branchName() === 'main') { say(s.hint); return; }
    say(s.win, true);
    step++;
    const next = STEPS[step];
    if (next?.stage) for (const c of next.stage) repo.run(c); // staged quietly, so the commit never fails
    setStep();
    return;
  }
  if (READ_ONLY.test(line)) { run(line); return; }
  skipped();
  if (!s) { say('This mini-repo takes status, log and branch. More in the app.'); return; }
  if (s.name === 'branch' && /^git\s+branch\s+\S+$/.test(line)) { say('That stays on main. Use git switch -c idea'); return; }
  say(s.hint);
}
// a command the lesson didn't run: the echo is marked, and Twig says why (the terminal doesn't repeat it)
function skipped() {
  const ln = out.lastElementChild?.querySelector('.cmd');
  if (!ln) return;
  ln.classList.add('skipped');
  const t = document.createElement('span'); t.className = 'skip-tag'; t.textContent = '  (not run)'; ln.append(t);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  if (!input.value.trim()) { accept(); if (matchMedia('(pointer: fine)').matches) input.focus(); return; } // an empty Run takes the suggestion first
  const v = input.value; input.value = '';
  await load();
  if (repo) handle(v);
});

async function typeOut(text) {
  input.value = '';
  if (reduced) { input.value = text; await sleep(150); return; }
  for (const ch of text) { input.value += ch; await sleep(32); }
  await sleep(220);
}
playBtn.addEventListener('click', async () => {
  if (busy) return;
  busy = true; playBtn.disabled = true; playBtn.textContent = 'Playing…'; input.disabled = true;
  await load();
  while (repo && STEPS[step]) {
    await typeOut(STEPS[step].cmd);
    const v = input.value; input.value = '';
    handle(v);
    await sleep(reduced ? 400 : 1300);
  }
  busy = false; input.disabled = false; setStep();
});
resetBtn.addEventListener('click', async () => { if (busy) return; await load(); if (mods) start(mods.git, mods.g); });

// lazy init: near the viewport, or on first touch/focus of the lesson
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); (window.requestIdleCallback || setTimeout)(() => load(), { timeout: 800 }); } }, { rootMargin: '200px' });
  io.observe(root);
} else load();
root.addEventListener('focusin', () => load(), { once: true });
root.addEventListener('pointerdown', () => load(), { once: true });
