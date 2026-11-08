// The shell's commands. BUILTINS run inside the shell (they can change its state: cd, export, read…);
// UTILS are "programs" in /usr/bin, found through $PATH. Each is (c: Ctx, args) -> exit status
// (or undefined: c.status, which c.err() sets). Text tools live in text.js.
import { joinPath, dirname, basename, isUnder, modeString, cmp, FsError } from './fs.js';
import { ShellError, getopt, linesOf, escapes, printf, shQuote, strftime } from './util.js';
import { TEXT_UTILS } from './text.js';
import { MAN } from './man.js';

export const KEYWORDS = ['if', 'then', 'elif', 'else', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', '{', '}', '!', 'function'];

// Commands that a real machine has but the sandbox does not simulate: a hint instead of a silent "not found".
export const NOT_HERE = {
  sudo: 'sudo is not simulated here: you already own everything in your home folder.',
  su: 'Switching users is not simulated here.',
  curl: 'Networking is not simulated in this sandbox.', wget: 'Networking is not simulated in this sandbox.',
  ssh: 'Networking is not simulated in this sandbox.', scp: 'Networking is not simulated in this sandbox.',
  ping: 'Networking is not simulated in this sandbox.', apt: 'Installing packages is not simulated in this sandbox.',
  'apt-get': 'Installing packages is not simulated in this sandbox.', brew: 'Installing packages is not simulated in this sandbox.',
  top: 'top is interactive and not simulated; try ps aux to see processes.', htop: 'htop is interactive and not simulated; try ps aux.',
  python: 'Only bash runs in this sandbox.', python3: 'Only bash runs in this sandbox.', node: 'Only bash runs in this sandbox.',
  ln: 'Links are not simulated in this sandbox yet.', tar: 'Archives are not simulated in this sandbox.', zip: 'Archives are not simulated in this sandbox.',
  yes: 'yes prints forever; it is not simulated here.', git: 'This is the bash sandbox: git lives in the git course.',
  emacs: 'Try nano: it opens the sandbox editor.',
  '[[': '[[ ]] is not supported in this sandbox; use [ ] (test) instead, with quotes around variables.', code: 'Try nano: it opens the sandbox editor.',
};
// names in /usr/bin that are builtins too (so `which echo` finds /usr/bin/echo, as on a real system)
export const BIN_DIR_EXTRA = ['echo', 'printf', 'test', '[', 'true', 'false', 'pwd', 'kill'];

const fmsg = (e) => (e instanceof FsError ? e.message : String(e.message || e));

/* ================================================================== builtins */
function signals(c) { return c.sh.constructor.signals(); }

const cd = (c, args) => {
  const sh = c.sh;
  if (args[0] === '--') args = args.slice(1);
  if (args.length > 1) return c.err('too many arguments');
  let target = args[0];
  if (target === undefined || target === '~') target = sh.getVar('HOME') ?? sh.s.home;
  let print = false;
  if (target === '-') {
    target = sh.getVar('OLDPWD');
    if (!target) return c.err('OLDPWD not set');
    print = true;
  }
  if (target === '') return 0;
  const abs = sh.abs(target);
  let n;
  try { n = c.fs.stat(abs); } catch (e) { return c.err(`${args[0] ?? target}: ${fmsg(e)}`); }
  if (n.type !== 'dir') return c.err(`${args[0]}: Not a directory`);
  if (!c.fs.can(n, 'x')) return c.err(`${args[0]}: Permission denied`);
  sh.setVar('OLDPWD', sh.s.cwd);
  sh.s.cwd = abs;
  sh.setVar('PWD', abs);
  if (print) c.line(abs);
  return 0;
};

const echo = (c, args) => {
  let i = 0, nl = true, esc = false;
  while (i < args.length && /^-[neE]+$/.test(args[i])) {
    for (const f of args[i].slice(1)) { if (f === 'n') nl = false; if (f === 'e') esc = true; if (f === 'E') esc = false; }
    i++;
  }
  let text = args.slice(i).join(' ');
  if (esc) { const e = escapes(text); text = e.text; if (e.stop) nl = false; }
  c.out(text + (nl ? '\n' : ''));
  return 0;
};

const printfCmd = (c, args) => {
  if (!args.length) { c.err('usage: printf format [arguments]', 2); return 2; }
  let bad = false;
  const out = printf(args[0], args.slice(1), (v) => { c.err(`${v}: invalid number`, 0); bad = true; });
  c.out(out);
  return bad ? 1 : 0;
};

const pwd = (c) => { c.line(c.sh.s.cwd); return 0; };

function readCmd(c, args) {
  const { o, rest, last } = getopt('read', args, { flags: 'rs', vals: 'pnt', code: 2 });
  const names = rest.length ? rest : ['REPLY'];
  for (const n of names) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return c.err(`\`${n}': not a valid identifier`);
  const input = c.io.stdin;
  if (o.p && input?.tty) c.io.err.write(last('p'));
  if (!input) {
    c.hint('read: nothing to read here (in a real terminal, read waits for you to type a line)');
    for (const n of names) c.sh.setVar(n, '');
    return 1;
  }
  let got = input.readLine();
  if (!got) { for (const n of names) c.sh.setVar(n, ''); return 1; }
  let text = got.line;
  if (!o.r) {
    while (text.endsWith('\\') && got && got.nl) { const more = input.readLine(); if (!more) break; text = text.slice(0, -1) + more.line; got = more; }
    text = text.replace(/\\(.)/g, '$1');
  }
  // field splitting on $IFS (default space, tab, newline): IFS whitespace is trimmed and runs of it count as one
  // separator; any other IFS character (IFS=: for /etc/passwd) separates exactly one field. IFS= keeps the line as is.
  const ifs = c.sh.getVar('IFS') ?? ' \t\n';
  const isWs = (ch) => ' \t\n'.includes(ch) && ifs.includes(ch), isSep = (ch) => ifs.includes(ch) && !' \t\n'.includes(ch);
  const fields = [];
  let restText = text, a = 0;
  while (a < restText.length && isWs(restText[a])) a++;
  restText = restText.slice(a);
  for (let i = 0; i < names.length; i++) {
    if (i === names.length - 1) { let e = restText.length; while (e > 0 && isWs(restText[e - 1])) e--; fields.push(restText.slice(0, e)); break; }
    let j = 0;
    while (j < restText.length && !isWs(restText[j]) && !isSep(restText[j])) j++;
    fields.push(restText.slice(0, j));
    while (j < restText.length && isWs(restText[j])) j++;
    if (j < restText.length && isSep(restText[j])) { j++; while (j < restText.length && isWs(restText[j])) j++; }
    restText = restText.slice(j);
  }
  names.forEach((n, i) => c.sh.setVar(n, fields[i] ?? ''));
  return got.nl ? 0 : 1;
}

// test / [ : returns 0 (true), 1 (false) or 2 (error)
function testCmd(c, args, bracket) {
  if (bracket) {
    if (args[args.length - 1] !== ']') return c.err("missing `]'", 2), 2;
    args = args.slice(0, -1);
  }
  const fs = c.fs;
  const node = (p) => fs.tryStat(c.abs(p));
  const int = (v) => {
    if (!/^\s*[-+]?\d+\s*$/.test(v)) throw new ShellError(`${v}: integer expression expected`, 2);
    return parseInt(v, 10);
  };
  const UNARY = {
    '-e': (a) => !!node(a), '-f': (a) => node(a)?.type === 'file', '-d': (a) => node(a)?.type === 'dir',
    '-r': (a) => { const n = node(a); return !!n && fs.can(n, 'r'); }, '-w': (a) => { const n = node(a); return !!n && fs.can(n, 'w'); },
    '-x': (a) => { const n = node(a); return !!n && fs.can(n, 'x'); }, '-s': (a) => { const n = node(a); return !!n && (n.type === 'dir' || (n.content || '').length > 0); },
    '-z': (a) => a.length === 0, '-n': (a) => a.length > 0, '-L': () => false, '-h': () => false, '-c': (a) => node(a)?.type === 'dev',
  };
  const BINARY = {
    '=': (a, b) => a === b, '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '>': (a, b) => a > b,
    '-eq': (a, b) => int(a) === int(b), '-ne': (a, b) => int(a) !== int(b), '-lt': (a, b) => int(a) < int(b),
    '-le': (a, b) => int(a) <= int(b), '-gt': (a, b) => int(a) > int(b), '-ge': (a, b) => int(a) >= int(b),
    '-nt': (a, b) => (node(a)?.mtime ?? -1) > (node(b)?.mtime ?? -1), '-ot': (a, b) => (node(a)?.mtime ?? Infinity) < (node(b)?.mtime ?? Infinity),
  };
  let i = 0;
  const t = args;
  function or() { let v = and(); while (t[i] === '-o') { i++; const r = and(); v = v || r; } return v; }
  function and() { let v = not(); while (t[i] === '-a') { i++; const r = not(); v = v && r; } return v; }
  function not() {
    if (t[i] === '!' && i + 1 < t.length) { i++; return !not(); }
    return primary();
  }
  function primary() {
    if (i >= t.length) throw new ShellError('argument expected', 2);
    if (t[i] === '(' && t.length - i > 2) { i++; const v = or(); if (t[i] !== ')') throw new ShellError("`)' expected", 2); i++; return v; }
    if (i + 2 < t.length + 0 && BINARY[t[i + 1]] && i + 2 <= t.length - 1) { const a = t[i], op = t[i + 1], b = t[i + 2]; i += 3; return BINARY[op](a, b); }
    if (UNARY[t[i]] && i + 1 < t.length) { const op = t[i]; const a = t[i + 1]; i += 2; return UNARY[op](a); }
    if (t[i].startsWith('-') && t[i].length === 2 && i + 1 < t.length && !BINARY[t[i + 1]] && !['-a', '-o'].includes(t[i + 1])) throw new ShellError(`${t[i]}: unary operator expected`, 2);
    return t[i++].length > 0;
  }
  try {
    if (!t.length) return 1;
    const v = or();
    if (i < t.length) throw new ShellError('too many arguments', 2);
    return v ? 0 : 1;
  } catch (e) {
    if (e instanceof ShellError) { c.err(e.message, 2); return 2; }
    throw e;
  }
}

const exitCmd = (c, args) => {
  const { ExitSignal } = signals(c);
  if (args.length && !/^-?\d+$/.test(args[0])) { c.err(`${args[0]}: numeric argument required`, 2); throw new ExitSignal(2); }
  if (args.length > 1) return c.err('too many arguments');
  throw new ExitSignal(args.length ? ((+args[0] % 256) + 256) % 256 : c.sh.s.status);
};
const returnCmd = (c, args) => {
  const { ReturnSignal } = signals(c);
  if (!c.sh.frame.func && !c.sh.frame.sourced) return c.err("can only `return' from a function or sourced script");
  if (args.length && !/^-?\d+$/.test(args[0])) { c.err(`${args[0]}: numeric argument required`, 2); throw new ReturnSignal(2); }
  throw new ReturnSignal(args.length ? ((+args[0] % 256) + 256) % 256 : c.sh.s.status);
};
const loopCtl = (kind) => (c, args) => {
  const { LoopSignal } = signals(c);
  if (!c.sh.loopDepth) { c.err("only meaningful in a `for', `while', or `until' loop", 0); return 0; }
  const n = args.length ? parseInt(args[0], 10) : 1;
  if (!(n >= 1)) return c.err(`${args[0]}: loop count out of range`);
  throw new LoopSignal(kind, Math.min(n, c.sh.loopDepth));
};
const shift = (c, args) => {
  const n = args.length ? parseInt(args[0], 10) : 1;
  if (Number.isNaN(n) || n < 0) return c.err(`${args[0]}: numeric argument required`);
  const a = c.sh.frame.args;
  if (n > a.length) return 1;
  c.sh.frame.args = a.slice(n);
  return 0;
};
const validName = (n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);
const declareLine = (k, v) => `declare -x ${k}${v === undefined ? '' : '="' + v.replace(/(["\\$`])/g, '\\$1') + '"'}`;
const exportCmd = (c, args) => {
  const sh = c.sh;
  const list = args.filter((a) => a !== '-p');
  if (!list.length) { c.lines(Object.keys(sh.s.exported).sort(cmp).map((k) => declareLine(k, sh.s.vars[k]))); return 0; }
  for (const a of list) {
    if (a === '-n') continue;
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(0, eq) : a;
    if (!validName(name)) { c.err(`\`${a}': not a valid identifier`); continue; }
    if (args.includes('-n')) { delete sh.s.exported[name]; continue; }
    if (eq >= 0) sh.s.vars[name] = a.slice(eq + 1);
    sh.s.exported[name] = true;
  }
};
const local = (c, args) => {
  if (!c.sh.frame.func) return c.err('can only be used in a function');
  for (const a of args) {
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(0, eq) : a;
    if (!validName(name)) { c.err(`\`${a}': not a valid identifier`); continue; }
    c.sh.makeLocal(name);
    if (eq >= 0) c.sh.s.vars[name] = a.slice(eq + 1);
    else if (!(name in c.sh.s.vars)) c.sh.s.vars[name] = '';
  }
};
const unset = (c, args) => {
  let mode = 'v';
  for (const a of args) {
    if (a === '-f' || a === '-v') { mode = a[1]; continue; }
    if (mode === 'f') delete c.sh.s.funcs[a];
    else if (!validName(a)) c.err(`\`${a}': not a valid identifier`);
    else { c.sh.unsetVar(a); if (!(a in c.sh.s.vars)) delete c.sh.s.funcs[a]; }
  }
};
const OPT_LETTERS = { e: 'errexit', x: 'xtrace', u: 'nounset', f: 'noglob' };
const setCmd = (c, args) => {
  const sh = c.sh;
  if (!args.length) { c.lines(Object.keys(sh.s.vars).sort(cmp).map((k) => `${k}=${shQuote(sh.s.vars[k])}`)); return 0; }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { sh.frame.args = args.slice(i + 1); return 0; }
    if (a === '-o' || a === '+o') {
      const name = args[++i];
      if (!name) { c.lines(Object.entries(sh.opts).map(([k, v]) => `${k.padEnd(15)}${v ? 'on' : 'off'}`)); continue; }
      if (!Object.values(OPT_LETTERS).includes(name)) return c.err(`${name}: invalid option name`);
      sh.opts[name] = a[0] === '-';
      continue;
    }
    if (/^[-+][a-zA-Z]+$/.test(a)) {
      for (const l of a.slice(1)) { if (!OPT_LETTERS[l]) return c.err(`${a[0]}${l}: invalid option`, 2); sh.opts[OPT_LETTERS[l]] = a[0] === '-'; }
      continue;
    }
    sh.frame.args = args.slice(i);
    return 0;
  }
  return 0;
};
const aliasCmd = (c, args) => {
  const A = c.sh.s.aliases;
  const show = (k) => `alias ${k}=${shQuote(A[k]).startsWith("'") ? shQuote(A[k]) : "'" + A[k] + "'"}`;
  if (!args.length || (args.length === 1 && args[0] === '-p')) { c.lines(Object.keys(A).sort(cmp).map(show)); return 0; }
  for (const a of args) {
    const eq = a.indexOf('=');
    if (eq > 0) { A[a.slice(0, eq)] = a.slice(eq + 1); continue; }
    if (a in A) c.line(show(a)); else c.err(`${a}: not found`);
  }
};
const unalias = (c, args) => {
  if (args[0] === '-a') { c.sh.s.aliases = {}; return 0; }
  if (!args.length) return c.err('usage: unalias [-a] name [name ...]', 2);
  for (const a of args) { if (a in c.sh.s.aliases) delete c.sh.s.aliases[a]; else c.err(`${a}: not found`); }
};
// what kind of command a name is: alias, keyword, function, builtin or file
function kind(sh, name) {
  if (sh.s.aliases[name] !== undefined) return ['alias', `${name} is aliased to \`${sh.s.aliases[name]}'`];
  if (KEYWORDS.includes(name)) return ['keyword', `${name} is a shell keyword`];
  if (sh.s.funcs[name]) return ['function', `${name} is a function`];
  if (BUILTINS[name]) return ['builtin', `${name} is a shell builtin`];
  const p = name.includes('/') ? (sh.fs.isFile(sh.abs(name)) ? name : null) : sh.which(name);
  if (p) return ['file', `${name} is ${p}`, p];
  return null;
}
const typeCmd = (c, args) => {
  const terse = args[0] === '-t';
  for (const n of terse ? args.slice(1) : args) {
    const k = kind(c.sh, n);
    if (!k) { if (!terse) c.err(`${n}: not found`); else c.status = 1; continue; }
    c.line(terse ? k[0] : k[1]);
  }
};
const commandCmd = (c, args) => {
  if (args[0] === '-v' || args[0] === '-V') {
    let st = 0;
    for (const n of args.slice(1)) {
      const k = kind(c.sh, n);
      if (!k) { st = 1; continue; }
      if (args[0] === '-V') c.line(k[1]);
      else c.line(k[0] === 'file' ? k[2] : k[0] === 'alias' ? `alias ${n}='${c.sh.s.aliases[n]}'` : n);
    }
    return st;
  }
  if (!args.length) return 0;
  return c.sh.invoke(args, c.io, [], { skipFuncs: true });
};
const sourceCmd = (c, args) => {
  if (!args.length) return c.err('filename argument required', 2), 2;
  const [f, ...rest] = args;
  const p = c.abs(f);
  if (!c.fs.isFile(p)) { c.sh.shErr(c.io, `${f}: No such file or directory`); return 1; }
  return c.sh.runScript(p, f, rest, c.io, { source: true });
};
const evalCmd = (c, args) => (args.length ? c.sh.evalString(args.join(' '), c.io) : 0);
const historyCmd = (c, args) => {
  const h = c.sh.history;
  if (args[0] === '-c') { h.length = 0; return 0; }
  const all = [...h, c.sh._currentLine ?? 'history'];
  const n = args[0] && /^\d+$/.test(args[0]) ? +args[0] : all.length;
  const start = all.length - Math.min(n, all.length);
  c.lines(all.slice(start).map((l, i) => `${String(start + i + 1).padStart(5)}  ${l}`));
  return 0;
};
const clear = (c) => { c.sh.events.push({ type: 'clear' }); return 0; };
const helpCmd = (c, args) => {
  if (args[0]) return UTILS.man(c, args);
  c.lines([
    'Commands in this sandbox (man <command> or <command> --help for details):',
    '  moving around   pwd  ls  cd  tree',
    '  files           touch  mkdir  cp  mv  rm  rmdir  chmod  nano',
    '  reading         cat  less  head  tail  wc  diff',
    '  searching       grep  find  which  type',
    '  text            sort  uniq  cut  tr  sed  awk  tee  xargs  rev  seq',
    '  shell           echo  printf  read  export  unset  env  alias  history  source  test [ ]',
    '  scripts         bash  if/then/fi  for/while  exit  return  break  continue  shift  local',
    '  processes       ps  kill  jobs  fg  wait  sleep  pgrep  pkill',
    '  other           date  whoami  hostname  uname  basename  dirname  realpath  clear',
    'Chain with ; && ||, pipe with |, redirect with > >> < 2> 2>&1 &>',
  ]);
  return 0;
};

/* ---------- jobs */
function findJob(c, spec) {
  const jobs = c.sh.s.jobs.filter((j) => j.state === 'Running' || j.state === 'Stopped');
  if (spec === undefined || spec === '%' || spec === '%+' || spec === '%%') return jobs[jobs.length - 1] || null;
  const m = String(spec).match(/^%?(\d+)$/);
  return m ? jobs.find((j) => j.id === +m[1]) || null : null;
}
const jobsCmd = (c, args) => {
  const sh = c.sh;
  const showPid = args.includes('-l');
  c.lines(sh.s.jobs.map((j) => `[${j.id}]${sh._jobMark(j)}  ${showPid ? j.pid + ' ' : ''}${j.state.padEnd(24)}${j.cmd}${j.state === 'Running' ? ' &' : ''}`));
  return 0;
};
const fg = (c, args) => {
  const j = findJob(c, args[0]);
  if (!j) return c.err(`${args[0] ?? 'current'}: no such job`);
  c.line(j.cmd);
  const m = j.cmd.match(/^sleep\s+(\d+)/);
  if (m) c.sh.tick(+m[1]);
  c.sh.endJob(j, 'Done');
  c.sh.s.jobs = c.sh.s.jobs.filter((x) => x !== j);
  return 0;
};
const bg = (c, args) => {
  const j = findJob(c, args[0]);
  if (!j) return c.err(`${args[0] ?? 'current'}: no such job`);
  if (j.state === 'Running') return c.err(`job ${j.id} already in background`, 0), 0;
  j.state = 'Running';
  c.line(`[${j.id}]+ ${j.cmd} &`);
  return 0;
};
const wait = (c) => {
  for (const j of c.sh.s.jobs) if (j.state === 'Running') c.sh.endJob(j, 'Done');
  return 0;
};
const SIGNALS = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, TERM: 15, STOP: 19, CONT: 18 };
function kill(c, args) {
  const sh = c.sh;
  let sig = 15;
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-l') { c.line(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 9) SIGKILL\t15) SIGTERM\t18) SIGCONT\t19) SIGSTOP'); return 0; }
    if (a === '-s' || a === '-n') { const v = args[++i] || ''; sig = SIGNALS[v.replace(/^SIG/, '').toUpperCase()] ?? +v; continue; }
    if (/^-\d+$/.test(a)) { sig = +a.slice(1); continue; }
    if (/^-[A-Z]+$/i.test(a)) { const s = SIGNALS[a.slice(1).replace(/^SIG/i, '').toUpperCase()]; if (!s) return c.err(`${a.slice(1)}: invalid signal specification`); sig = s; continue; }
    targets.push(a);
  }
  if (!targets.length) return c.err('usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...', 2);
  for (const t of targets) {
    if (t.startsWith('%')) {
      const j = findJob(c, t);
      if (!j) { c.err(`${t}: no such job`); continue; }
      sh.endJob(j, sig === 9 ? 'Killed' : 'Terminated');
      continue;
    }
    if (!/^\d+$/.test(t)) { c.err(`${t}: arguments must be process or job IDs`); continue; }
    const pid = +t;
    if (pid === 1000) { c.hint('That is this shell itself; the sandbox keeps it alive.'); continue; }
    const p = sh.s.procs.find((x) => x.pid === pid);
    if (!p) { c.err(`(${pid}) - No such process`); continue; }
    if (p.user !== sh.s.user && sh.s.user !== 'root') { c.err(`(${pid}) - Operation not permitted`); continue; }
    if (sig === 0) continue;
    if (p.stubborn && sig !== 9) continue; // ignores TERM: only kill -9 stops it
    const j = sh.s.jobs.find((x) => x.pid === pid);
    if (j) sh.endJob(j, sig === 9 ? 'Killed' : 'Terminated');
    else sh.s.procs = sh.s.procs.filter((x) => x !== p);
  }
}
const umask = (c) => { c.line('0022'); return 0; };

export const BUILTINS = {
  cd, pwd, echo, printf: printfCmd, read: readCmd, test: (c, a) => testCmd(c, a, false), '[': (c, a) => testCmd(c, a, true),
  true: () => 0, false: () => 1, ':': () => 0, exit: exitCmd, return: returnCmd, break: loopCtl('break'), continue: loopCtl('continue'),
  shift, export: exportCmd, local, unset, set: setCmd, alias: aliasCmd, unalias, type: typeCmd, command: commandCmd,
  source: sourceCmd, '.': sourceCmd, eval: evalCmd, history: historyCmd, clear, help: helpCmd,
  jobs: jobsCmd, fg, bg, wait, kill, umask,
};

/* ================================================================== file utilities */
const DAY = 86400;
function lsDate(n, now) {
  const d = new Date(n.mtime * 1000);
  const mon = d.toUTCString().slice(8, 11);
  const day = String(d.getUTCDate()).padStart(2, ' ');
  const recent = Math.abs(now - n.mtime) < 182 * DAY;
  return `${mon} ${day} ${recent ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : ' ' + d.getUTCFullYear()}`;
}
const sizeOf = (n) => (n.type === 'dir' ? 4096 : n.type === 'dev' ? 0 : (n.content || '').length);
function human(b) {
  if (b < 1024) return String(b);
  const units = ['K', 'M', 'G'];
  let v = b, u = -1;
  do { v /= 1024; u++; } while (v >= 1024 && u < 2);
  return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + units[u];
}

function ls(c, args) {
  const { o, rest } = getopt('ls', args, { flags: 'laAhR1dtrSFi', long: { all: 'a', 'almost-all': 'A', recursive: 'R', directory: 'd', 'human-readable': 'h', reverse: 'r', classify: 'F' }, code: 2 });
  const fs = c.fs, sh = c.sh;
  const now = sh.now();
  const ops = rest.length ? rest : ['.'];
  const files = [], dirs = [];
  for (const p of ops) {
    const abs = c.abs(p);
    let n;
    try { n = fs.stat(abs); } catch (e) { c.err(`cannot access '${p}': ${fmsg(e)}`, 2); continue; }
    (n.type === 'dir' && !o.d ? dirs : files).push({ name: p, abs, n });
  }
  const order = (entries) => {
    const by = o.t ? (a, b) => b.n.mtime - a.n.mtime || cmp(a.name, b.name) : o.S ? (a, b) => sizeOf(b.n) - sizeOf(a.n) || cmp(a.name, b.name) : (a, b) => cmp(a.name, b.name);
    const s = [...entries].sort(by);
    return o.r ? s.reverse() : s;
  };
  const tag = (e) => (o.F ? (e.n.type === 'dir' ? '/' : e.n.mode & 0o111 ? '*' : '') : '');
  const kids = (abs) => fs.names(abs).filter((nm) => fs.nodes[joinPath(abs, nm)].type === 'dir').length;
  const render = (entries, withTotal) => {
    const out = [];
    if (o.l) {
      const rows = entries.map((e) => [modeString(e.n), String(e.n.type === 'dir' ? 2 + kids(e.abs) : 1), e.n.owner, e.n.owner, o.h ? human(sizeOf(e.n)) : String(sizeOf(e.n)), lsDate(e.n, now), e.name + tag(e)]);
      const w = [1, 2, 3, 4].map((i) => Math.max(0, ...rows.map((r) => r[i].length)));
      if (withTotal) out.push(`total ${entries.reduce((t, e) => t + (sizeOf(e.n) ? Math.ceil(sizeOf(e.n) / 4096) * 4 : 0), 0)}`);
      for (const r of rows) out.push(`${r[0]} ${r[1].padStart(w[0])} ${r[2].padEnd(w[1])} ${r[3].padEnd(w[2])} ${r[4].padStart(w[3])} ${r[5]} ${r[6]}`);
      return out;
    }
    const names = entries.map((e) => e.name + tag(e));
    if (!names.length) return out;
    if (c.tty && !o['1']) out.push(names.join('  '));
    else out.push(...names);
    return out;
  };
  const listDir = (d) => {
    let names;
    try { names = fs.list(d.abs); } catch (e) { c.err(`cannot open directory '${d.name}': ${fmsg(e)}`, 2); return null; }
    if (!o.a && !o.A) names = names.filter((x) => !x.startsWith('.'));
    else if (o.A) names = names.filter((x) => x !== '.' && x !== '..');
    let entries = names.map((nm) => ({ name: nm, abs: joinPath(d.abs, nm), n: fs.nodes[joinPath(d.abs, nm)] }));
    if (o.a) entries = [{ name: '.', abs: d.abs, n: d.n }, { name: '..', abs: dirname(d.abs), n: fs.nodes[dirname(d.abs)] }, ...entries];
    return order(entries);
  };
  const blocks = [];
  if (files.length) blocks.push(render(order(files), false));
  const header = dirs.length + files.length > 1 || o.R;
  const queue = order(dirs);
  while (queue.length) {
    const d = queue.shift();
    const entries = listDir(d);
    if (!entries) continue;
    blocks.push([...(header ? [`${d.name}:`] : []), ...render(entries, true)]);
    if (o.R) {
      const subs = entries.filter((e) => e.n.type === 'dir' && e.name !== '.' && e.name !== '..')
        .map((e) => ({ name: d.name === '/' ? '/' + e.name : `${d.name.replace(/\/$/, '')}/${e.name}`, abs: e.abs, n: e.n }));
      queue.unshift(...subs);
    }
  }
  const text = blocks.filter((b) => b.length).map((b) => b.join('\n')).join(header ? '\n\n' : '\n');
  if (text) c.line(text);
}

function catLike(name, { pager = false } = {}) {
  return (c, args) => {
    const { o, rest } = getopt(name, args, { flags: 'nEbsA', long: { number: 'n', 'show-ends': 'E' } });
    const chunks = c.inputs(rest);
    let text = chunks.map((x) => (x.binary ? '' : x.text)).join('');
    if (o.n || o.b || o.E || o.A) {
      let k = 0;
      text = linesOf(text).map((l) => {
        const num = o.b && !l ? '' : `${String(++k).padStart(6)}\t`;
        return (o.n || o.b ? (o.b && !l ? '' : num) : '') + l + (o.E || o.A ? '$' : '');
      }).join('\n') + (text ? '\n' : '');
    }
    c.out(text);
    if (pager && c.tty && text) c.hint(`(${name} shows one screen at a time in a real terminal: space for the next page, q to quit. Here you see it all.)`);
  };
}

function headTail(name) {
  return (c, args) => {
    const { o, rest, last } = getopt(name, args, { flags: 'qvf', vals: 'nc', num: 'n', long: { lines: 'n', bytes: 'c', quiet: 'q', follow: 'f' } });
    const nRaw = last('n') ?? '10';
    const cRaw = last('c');
    const raw = cRaw ?? nRaw;
    if (!/^[-+]?\d+$/.test(raw)) throw new ShellError(`invalid number of ${cRaw ? 'bytes' : 'lines'}: '${raw}'`);
    const fromStart = raw.startsWith('+');
    const n = Math.abs(parseInt(raw, 10));
    const chunks = c.inputs(rest, { what: (f, e) => `cannot open '${f}' for reading: ${fmsg(e)}` });
    const many = (rest.length > 1 || o.v) && !o.q;
    chunks.forEach((ch, idx) => {
      if (many) c.line(`${idx ? '\n' : ''}==> ${ch.name === '-' ? 'standard input' : ch.name} <==`);
      if (cRaw) { c.out(name === 'head' ? ch.text.slice(0, n) : fromStart ? ch.text.slice(n - 1) : ch.text.slice(-n || ch.text.length)); return; }
      const ls = linesOf(ch.text);
      let pick;
      if (name === 'head') pick = raw.startsWith('-') && args.some((a) => /^-n-|^--lines=-/.test(a)) ? ls.slice(0, Math.max(0, ls.length - n)) : ls.slice(0, n);
      else pick = fromStart ? ls.slice(Math.max(0, n - 1)) : n === 0 ? [] : ls.slice(-n);
      c.lines(pick);
    });
    if (name === 'tail' && o.f) c.hint('(tail -f keeps watching the file for new lines in a real terminal; Ctrl+C stops it. The sandbox stops here.)');
  };
}

function wc(c, args) {
  const { o, rest } = getopt('wc', args, { flags: 'lwcm', long: { lines: 'l', words: 'w', bytes: 'c', chars: 'm' } });
  const which = o.l || o.w || o.c || o.m ? ['l', 'w', 'c', 'm'].filter((k) => o[k]) : ['l', 'w', 'c'];
  const chunks = c.inputs(rest);
  const count = (t) => ({ l: (t.match(/\n/g) || []).length, w: (t.match(/\S+/g) || []).length, c: new TextEncoder().encode(t).length, m: [...t].length });
  const rows = chunks.map((ch) => ({ name: ch.name === '-' ? '' : ch.name, n: count(ch.text) }));
  if (rows.length > 1) rows.push({ name: 'total', n: ['l', 'w', 'c', 'm'].reduce((acc, k) => ({ ...acc, [k]: rows.reduce((s, r) => s + r.n[k], 0) }), {}) });
  const fromStdin = !rest.length;
  const width = fromStdin && which.length > 1 ? 7 : Math.max(1, ...rows.flatMap((r) => which.map((k) => String(r.n[k]).length)));
  for (const r of rows) c.line(which.map((k) => String(r.n[k]).padStart(fromStdin && which.length === 1 ? 0 : width)).join(' ') + (r.name ? ' ' + r.name : ''));
}

function touch(c, args) {
  const { o, rest } = getopt('touch', args, { flags: 'cam', long: { 'no-create': 'c' } });
  if (!rest.length) throw new ShellError('missing file operand\nTry \'touch --help\' for more information.');
  for (const f of rest) {
    try { c.fs.touch(c.abs(f), { create: !o.c }); }
    catch (e) { c.err(`cannot touch '${f}': ${fmsg(e)}`); }
  }
}

function mkdir(c, args) {
  const { o, rest } = getopt('mkdir', args, { flags: 'pv', vals: 'm', long: { parents: 'p', verbose: 'v' } });
  if (!rest.length) throw new ShellError('missing operand\nTry \'mkdir --help\' for more information.');
  for (const d of rest) {
    const abs = c.abs(d);
    if (o.p) {
      const segs = abs.split('/').filter(Boolean);
      let cur = '';
      try {
        for (const s of segs) {
          cur += '/' + s;
          const n = c.fs.tryStat(cur);
          if (n) { if (n.type !== 'dir') throw new FsError(cur === abs ? 'EEXIST' : 'ENOTDIR'); continue; }
          c.fs.mkdir(cur);
          if (o.v) c.line(`mkdir: created directory '${cur === abs ? d : cur}'`);
        }
      } catch (e) { c.err(`cannot create directory ‘${d}’: ${fmsg(e)}`); }
      continue;
    }
    try { c.fs.mkdir(abs); if (o.v) c.line(`mkdir: created directory '${d}'`); }
    catch (e) { c.err(`cannot create directory ‘${d}’: ${fmsg(e)}`); }
  }
}

function rmdir(c, args) {
  const { o, rest } = getopt('rmdir', args, { flags: 'pv', long: { parents: 'p', verbose: 'v' } });
  if (!rest.length) throw new ShellError('missing operand\nTry \'rmdir --help\' for more information.');
  for (const d of rest) {
    const chain = [d];
    if (o.p) { let x = d.replace(/\/+$/, ''); while (x.includes('/')) { x = x.slice(0, x.lastIndexOf('/')); if (x) chain.push(x); } }
    for (const x of chain) {
      const abs = c.abs(x);
      try {
        const n = c.fs.stat(abs);
        if (n.type !== 'dir') throw new FsError('ENOTDIR');
        c.fs.remove(abs);
        if (o.v) c.line(`rmdir: removing directory, '${x}'`);
      } catch (e) { c.err(`failed to remove '${x}': ${fmsg(e)}`); break; }
    }
  }
}

// display path for "dest/name"
const into = (dest, name) => (dest.endsWith('/') ? dest + name : dest + '/' + name);

function cpMv(name) {
  const mv = name === 'mv';
  return (c, args) => {
    const { o, rest } = getopt(name, args, { flags: mv ? 'fivnu' : 'rRaivnfpu', long: { recursive: 'r', verbose: 'v', force: 'f', 'no-clobber': 'n', interactive: 'i' } });
    const fs = c.fs;
    if (!rest.length) throw new ShellError(`missing file operand\nTry '${name} --help' for more information.`);
    if (rest.length === 1) throw new ShellError(`missing destination file operand after '${rest[0]}'\nTry '${name} --help' for more information.`);
    const dest = rest[rest.length - 1], srcs = rest.slice(0, -1);
    const dAbs = c.abs(dest);
    const dNode = fs.tryStat(dAbs);
    const dIsDir = dNode?.type === 'dir';
    if (srcs.length > 1 && !dIsDir) throw new ShellError(`target '${dest}' is not a directory`);
    const recursive = o.r || o.R || o.a;
    for (const s of srcs) {
      const sAbs = c.abs(s);
      let sn;
      try { sn = fs.stat(sAbs); } catch (e) { c.err(`cannot stat '${s}': ${fmsg(e)}`); continue; }
      const tAbs = dIsDir ? joinPath(dAbs, basename(sAbs)) : dAbs;
      const tShown = dIsDir ? into(dest, basename(sAbs)) : dest;
      const tn = fs.tryStat(tAbs);
      if (tAbs === sAbs) { c.err(`'${s}' and '${tShown}' are the same file`); continue; }
      if (sn.type === 'dir' && !mv && !recursive) { c.err(`-r not specified; omitting directory '${s}'`); continue; }
      if (sn.type === 'dir' && isUnder(tAbs, sAbs)) {
        c.err(mv ? `cannot move '${s}' to a subdirectory of itself, '${tShown}'` : `cannot copy a directory, '${s}', into itself, '${tShown}'`);
        continue;
      }
      if (tn && o.n) continue;
      if (tn && tn.type === 'dir' && sn.type !== 'dir') { c.err(`cannot overwrite directory '${tShown}' with non-directory`); continue; }
      if (tn && tn.type !== 'dir' && sn.type === 'dir') { c.err(`cannot overwrite non-directory '${tShown}' with directory '${s}'`); continue; }
      try {
        if (mv) {
          if (tn && tn.type === 'dir') {
            if (fs.names(tAbs).length) { c.err(`cannot move '${s}' to '${tShown}': Directory not empty`); continue; }
            fs.remove(tAbs);
          } else if (tn) fs.remove(tAbs);
          fs.rename(sAbs, tAbs);
          if (o.v) c.line(`renamed '${s}' -> '${tShown}'`);
        } else {
          copyTree(c, sAbs, tAbs, o);
          if (o.v) c.line(`'${s}' -> '${tShown}'`);
        }
      } catch (e) {
        if (e instanceof FsError) c.err(e.code === 'EACCES' ? `cannot ${mv ? 'move' : 'create regular file'} '${mv ? s : tShown}'${mv ? ` to '${tShown}'` : ''}: Permission denied` : `cannot ${mv ? 'move' : 'copy'} '${s}': ${e.message}`);
        else throw e;
      }
    }
  };
}
function copyTree(c, from, to, o) {
  const fs = c.fs;
  const n = fs.stat(from);
  if (n.type === 'dir') {
    if (!fs.tryStat(to)) { fs.mkdir(to); if (o.a || o.p) fs.nodes[to].mode = n.mode; }
    for (const nm of fs.list(from)) copyTree(c, joinPath(from, nm), joinPath(to, nm), o);
    return;
  }
  const text = fs.read(from);
  const existed = !!fs.tryStat(to);
  fs.write(to, text);
  const t = fs.nodes[to];
  if (!existed) t.mode = o.a || o.p ? n.mode : n.mode & ~0o022;
  if (o.a || o.p) t.mtime = n.mtime;
}

function rm(c, args) {
  const { o, rest } = getopt('rm', args, { flags: 'rRfivdI', long: { recursive: 'r', force: 'f', verbose: 'v', dir: 'd', 'no-preserve-root': 'P' } });
  const fs = c.fs;
  if (!rest.length) { if (o.f) return 0; throw new ShellError('missing operand\nTry \'rm --help\' for more information.'); }
  const recursive = o.r || o.R;
  for (const f of rest) {
    const abs = c.abs(f);
    const base = f.replace(/\/+$/, '').split('/').pop();
    if (base === '.' || base === '..') { c.err(`refusing to remove '.' or '..' directory: skipping '${f}'`); continue; }
    if (abs === '/' && recursive) { c.err("it is dangerous to operate recursively on '/'"); c.err('use --no-preserve-root to override this failsafe'); continue; }
    let n;
    try { n = fs.stat(abs); } catch (e) { if (!o.f || e.code !== 'ENOENT') c.err(`cannot remove '${f}': ${fmsg(e)}`); continue; }
    if (n.type === 'dir' && !recursive) {
      if (o.d) { try { fs.remove(abs); if (o.v) c.line(`removed directory '${f}'`); } catch (e) { c.err(`cannot remove '${f}': ${fmsg(e)}`); } continue; }
      c.err(`cannot remove '${f}': Is a directory`);
      continue;
    }
    try {
      // -v lists children before their directory, the order rm deletes them in
      const gone = o.v ? [abs, ...(n.type === 'dir' ? fs.descendants(abs) : [])].reverse().map((g) => [g, fs.nodes[g].type === 'dir']) : [];
      fs.remove(abs, { recursive: true });
      for (const [g, isDir] of gone) c.line(`removed ${isDir ? 'directory ' : ''}'${g === abs ? f : f.replace(/\/+$/, '') + g.slice(abs.length)}'`);
    } catch (e) { c.err(`cannot remove '${f}': ${fmsg(e)}`); }
  }
}

// chmod modes: octal (755) or symbolic (u+x, go-w, a=r, +x, u=rwx,go=rx)
export function applyMode(mode, spec, isDir = false, umask = 0o022) {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let m = mode;
  for (const clause of spec.split(',')) {
    const r = clause.match(/^([ugoa]*)([-+=])([rwxXst]*)$/);
    if (!r) return null;
    const [, who, op, perms] = r;
    let bits = 0;
    for (const p of perms) bits |= p === 'r' ? 0o444 : p === 'w' ? 0o222 : p === 'x' ? 0o111 : p === 'X' ? (isDir || mode & 0o111 ? 0o111 : 0) : p === 't' ? 0o1000 : 0;
    let mask = 0;
    if (!who) mask = 0o7777 & ~umask;
    else for (const w of who) mask |= w === 'u' ? 0o4700 : w === 'g' ? 0o2070 : w === 'o' ? 0o1007 : 0o7777;
    const sticky = bits & 0o1000;
    bits = (bits & 0o777 & mask) | sticky;
    if (op === '+') m |= bits;
    else if (op === '-') m &= ~bits;
    else m = (m & ~(mask & 0o777)) | bits;
  }
  return m;
}
function chmod(c, args) {
  const flags = new Set();
  const rest = [];
  for (const a of args) { if (/^-[Rvcf]+$/.test(a) && !rest.length) for (const f of a.slice(1)) flags.add(f); else rest.push(a); }
  if (rest.length < 1) throw new ShellError('missing operand\nTry \'chmod --help\' for more information.');
  if (rest.length < 2) throw new ShellError(`missing operand after ‘${rest[0]}’\nTry 'chmod --help' for more information.`);
  const [spec, ...files] = rest;
  if (applyMode(0o644, spec) === null) throw new ShellError(`invalid mode: ‘${spec}’\nTry 'chmod --help' for more information.`);
  const fs = c.fs;
  const one = (abs, shown) => {
    const n = fs.stat(abs);
    const next = applyMode(n.mode, spec, n.type === 'dir');
    try { fs.chmod(abs, next); } catch (e) { c.err(`changing permissions of '${shown}': ${fmsg(e)}`); return; }
    if (flags.has('v') || (flags.has('c') && next !== n.mode)) c.line(`mode of '${shown}' changed to ${next.toString(8).padStart(4, '0')} (${modeString({ ...n, mode: next }).slice(1)})`);
    if (flags.has('R') && n.type === 'dir') for (const nm of fs.names(abs)) one(joinPath(abs, nm), into(shown, nm));
  };
  for (const f of files) {
    try { fs.stat(c.abs(f)); } catch (e) { c.err(`cannot access '${f}': ${fmsg(e)}`); continue; }
    one(c.abs(f), f);
  }
}

function find(c, args) {
  const fs = c.fs;
  let i = 0;
  const starts = [];
  while (i < args.length && !/^[-(!]/.test(args[i]) && args[i] !== ')') starts.push(args[i++]);
  if (!starts.length) starts.push('.');
  const toks = args.slice(i);
  let maxdepth = Infinity, mindepth = 0, hasAction = false, depthFirst = false;
  // parse the expression into a tree of predicates
  let p = 0;
  const need = (t) => { if (p >= toks.length) throw new ShellError(`missing argument to \`${t}'`); return toks[p++]; };
  function orE() { let a = andE(); while (toks[p] === '-o' || toks[p] === '-or') { p++; const b = andE(); const l = a; a = (x) => l(x) || b(x); } return a; }
  function andE() {
    let a = notE();
    for (;;) {
      if (toks[p] === '-a' || toks[p] === '-and') { p++; }
      else if (p >= toks.length || toks[p] === '-o' || toks[p] === '-or' || toks[p] === ')') break;
      const b = notE(); const l = a; a = (x) => l(x) && b(x);
    }
    return a;
  }
  function notE() { if (toks[p] === '!' || toks[p] === '-not') { p++; const a = notE(); return (x) => !a(x); } return prim(); }
  function prim() {
    const t = toks[p++];
    switch (t) {
      case '(': { const e = orE(); if (toks[p++] !== ')') throw new ShellError("invalid expression; I was expecting to find a ')' somewhere but did not see one."); return e; }
      case '-name': case '-iname': { const pat = need(t); const re = globToRe(pat, t === '-iname'); return (x) => re.test(x.base); }
      case '-path': case '-ipath': case '-wholename': { const pat = need(t); const re = globToRe(pat, t === '-ipath', true); return (x) => re.test(x.shown); }
      case '-type': { const ty = need(t); if (!['f', 'd', 'c', 'l'].includes(ty)) throw new ShellError(`Unknown argument to -type: ${ty}`); return (x) => (ty === 'f' ? x.n.type === 'file' : ty === 'd' ? x.n.type === 'dir' : ty === 'c' ? x.n.type === 'dev' : false); }
      case '-maxdepth': maxdepth = +need(t); return () => true;
      case '-mindepth': mindepth = +need(t); return () => true;
      case '-empty': return (x) => (x.n.type === 'dir' ? fs.names(x.abs).length === 0 : !(x.n.content || '').length);
      case '-executable': return (x) => fs.can(x.n, 'x');
      case '-newer': { const ref = fs.tryStat(c.abs(need(t))); if (!ref) throw new ShellError(`‘${toks[p - 1]}’: No such file or directory`); return (x) => x.n.mtime > ref.mtime; }
      case '-size': {
        const v = need(t);
        const m = v.match(/^([-+]?)(\d+)([ckMG]?)$/);
        if (!m) throw new ShellError(`invalid argument \`${v}' to \`-size'`);
        const unit = { c: 1, k: 1024, M: 1048576, G: 1073741824, '': 512 }[m[3]];
        const n = +m[2];
        return (x) => { const s = Math.ceil(sizeOf(x.n) / unit); return m[1] === '+' ? s > n : m[1] === '-' ? s < n : s === n; };
      }
      case '-user': { const u = need(t); return (x) => x.n.owner === u; }
      case '-perm': { const v = need(t); const want = parseInt(v.replace(/^[-/]/, ''), 8); return (x) => (v.startsWith('-') ? (x.n.mode & want) === want : v.startsWith('/') ? (x.n.mode & want) !== 0 : (x.n.mode & 0o7777) === want); }
      case '-print': hasAction = true; return (x) => { c.line(x.shown); return true; };
      case '-delete': hasAction = true; depthFirst = true; return (x) => {
        try { fs.remove(x.abs, { recursive: false }); } catch (e) { c.err(`cannot delete ‘${x.shown}’: ${fmsg(e)}`); }
        return true;
      };
      case '-exec': case '-ok': {
        hasAction = true;
        const cmd = [];
        while (p < toks.length && toks[p] !== ';' && toks[p] !== '+') cmd.push(toks[p++]);
        if (p >= toks.length) throw new ShellError(`missing argument to \`${t}'`);
        const batch = toks[p++] === '+';
        if (!cmd.length) throw new ShellError(`missing argument to \`${t}'`);
        if (batch) { const acc = []; batches.push({ cmd, acc }); return (x) => { acc.push(x.shown); return true; }; }
        return (x) => c.sh.invoke(cmd.map((a) => a.split('{}').join(x.shown)), c.io) === 0;
      }
      default:
        if (t === undefined) throw new ShellError('expected an expression');
        throw new ShellError(t.startsWith('-') ? `unknown predicate \`${t}'` : `paths must precede expression: \`${t}'`);
    }
  }
  const batches = [];
  const expr = toks.length ? orE() : () => true;
  if (p < toks.length) throw new ShellError(`unexpected extra predicate '${toks[p]}'`);
  const test = hasAction ? expr : (x) => { if (expr(x)) c.line(x.shown); return true; };
  for (const s of starts) {
    const abs = c.abs(s);
    let n;
    try { n = fs.stat(abs); } catch (e) { c.err(`‘${s}’: ${fmsg(e)}`); continue; }
    const visit = (x, depth) => {
      if (!depthFirst && depth >= mindepth && depth <= maxdepth) test(x);
      if (x.n.type === 'dir' && depth < maxdepth) {
        let names = [];
        try { names = fs.list(x.abs); } catch (e) { c.err(`‘${x.shown}’: ${fmsg(e)}`); }
        for (const nm of names) {
          const ab = joinPath(x.abs, nm);
          if (!fs.nodes[ab]) continue;
          visit({ abs: ab, n: fs.nodes[ab], base: nm, shown: x.shown.endsWith('/') ? x.shown + nm : `${x.shown}/${nm}` }, depth + 1);
        }
      }
      if (depthFirst && depth >= mindepth && depth <= maxdepth && fs.nodes[x.abs]) test({ ...x, n: fs.nodes[x.abs] });
    };
    visit({ abs, n, base: basename(abs), shown: s }, 0);
  }
  for (const b of batches) if (b.acc.length) c.sh.invoke(b.cmd.flatMap((a) => (a === '{}' ? b.acc : [a])), c.io);
}
function globToRe(pat, icase, slash = false) {
  // find's patterns: same glob syntax; * matches '/' in -path
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === '\\' && i + 1 < pat.length) { re += pat[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); continue; }
    if (ch === '*') { re += slash ? '.*' : '[^/]*'; continue; }
    if (ch === '?') { re += '.'; continue; }
    if (ch === '[') { const e = pat.indexOf(']', i + 2); if (e > 0) { re += '[' + pat.slice(i + 1, e).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']'; i = e; continue; } }
    re += ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', icase ? 'i' : '');
}

function tree(c, args) {
  const { o, rest, last } = getopt('tree', args, { flags: 'adF', vals: 'L' });
  const fs = c.fs;
  const max = o.L ? +last('L') : Infinity;
  let nd = 0, nf = 0;
  const out = [];
  for (const start of rest.length ? rest : ['.']) {
    const abs = c.abs(start);
    const n = fs.tryStat(abs);
    if (!n || n.type !== 'dir') { out.push(`${start}  [error opening dir]`); continue; }
    out.push(start);
    const walk = (dir, prefix, depth) => {
      if (depth > max) return;
      let names;
      try { names = fs.list(dir); } catch { return; }
      names = names.filter((x) => o.a || !x.startsWith('.')).filter((x) => !o.d || fs.nodes[joinPath(dir, x)].type === 'dir');
      names.forEach((nm, i) => {
        const ab = joinPath(dir, nm), node = fs.nodes[ab];
        const lastOne = i === names.length - 1;
        const isDir = node.type === 'dir';
        out.push(`${prefix}${lastOne ? '└── ' : '├── '}${nm}${o.F ? (isDir ? '/' : node.mode & 0o111 ? '*' : '') : ''}`);
        if (isDir) { nd++; walk(ab, prefix + (lastOne ? '    ' : '│   '), depth + 1); } else nf++;
      });
    };
    walk(abs, '', 1);
  }
  out.push('', `${nd} director${nd === 1 ? 'y' : 'ies'}${o.d ? '' : `, ${nf} file${nf === 1 ? '' : 's'}`}`);
  c.lines(out);
}

/* ================================================================== system and misc */
function which(c, args) {
  const all = args.includes('-a');
  let st = 0;
  for (const n of args.filter((a) => a !== '-a')) {
    const hits = n.includes('/') ? (c.fs.isFile(c.abs(n)) && c.fs.can(c.fs.stat(c.abs(n)), 'x') ? [n] : []) : all ? c.sh.which(n, { all: true }) : [c.sh.which(n)].filter(Boolean);
    if (!hits.length) st = 1;
    c.lines(hits);
  }
  return st;
}
function envCmd(c, args) {
  const env = { ...(c.env || c.sh.environ()) };
  let i = 0;
  if (args[0] === '-i') { for (const k of Object.keys(env)) delete env[k]; i++; }
  for (; i < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[i]); i++) { const eq = args[i].indexOf('='); env[args[i].slice(0, eq)] = args[i].slice(eq + 1); }
  if (i >= args.length) { c.lines(Object.keys(env).sort(cmp).map((k) => `${k}=${env[k]}`)); return 0; }
  const assigns = Object.entries(env).map(([name, value]) => ({ name, value }));
  const [name, ...rest] = args.slice(i);
  const path = name.includes('/') ? c.abs(name) : c.sh.which(name);
  if (!path) { c.err(`‘${name}’: No such file or directory`); return 127; }
  return c.sh.execFile(path, name, rest, c.io, assigns);
}
function printenv(c, args) {
  const env = c.env || c.sh.environ();
  if (!args.length) { c.lines(Object.keys(env).sort(cmp).map((k) => `${k}=${env[k]}`)); return 0; }
  let st = 0;
  for (const a of args) { if (a in env) c.line(env[a]); else st = 1; }
  return st;
}
function date(c, args) {
  const fmt = args.find((a) => a.startsWith('+'));
  const now = c.sh.now();
  if (args.some((a) => !a.startsWith('+') && a !== '-u' && a !== '--utc')) throw new ShellError(`invalid date '${args.find((a) => !a.startsWith('+') && a !== '-u')}'`);
  c.line(strftime(fmt ? fmt.slice(1) : '%a %b %e %H:%M:%S %Z %Y', now));
}
function sleep(c, args) {
  if (!args.length) throw new ShellError('missing operand\nTry \'sleep --help\' for more information.', 1, { raw: false });
  let total = 0;
  for (const a of args) {
    const m = a.match(/^(\d+(?:\.\d+)?)([smhd]?)$/);
    if (!m) throw new ShellError(`invalid time interval ‘${a}’`);
    total += +m[1] * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
  }
  c.sh.tick(Math.ceil(total));
}
function seq(c, args) {
  const { o, rest, last } = getopt('seq', args.map((a) => (/^-\d/.test(a) ? '\u0000' + a : a)), { vals: 'sw', flags: 'w' });
  const nums = rest.map((a) => a.replace(/^\u0000/, ''));
  if (!nums.length) throw new ShellError('missing operand\nTry \'seq --help\' for more information.');
  for (const n of nums) if (!/^-?\d+(\.\d+)?$/.test(n)) throw new ShellError(`invalid floating point argument: ‘${n}’\nTry 'seq --help' for more information.`);
  let [a, step, b] = nums.length === 1 ? [1, 1, +nums[0]] : nums.length === 2 ? [+nums[0], 1, +nums[1]] : [+nums[0], +nums[1], +nums[2]];
  if (step === 0) throw new ShellError('invalid Zero increment value: ‘0’');
  const out = [];
  for (let x = a; step > 0 ? x <= b : x >= b; x += step) { out.push(String(x)); if (out.length > 100000) break; }
  const sep = o.s ? last('s') : '\n';
  if (out.length) c.out(out.join(sep) + '\n');
}
function ps(c, args) {
  const sh = c.sh;
  const full = args.some((a) => /^-?(aux|ef|e|A|ax)$/.test(a));
  const me = sh.s.nextPid++;
  const procs = [{ pid: 1000, cmd: '-bash', user: sh.s.user, cpu: 0, mem: 0.2 }, ...sh.s.procs, { pid: me, cmd: 'ps ' + args.join(' '), user: sh.s.user, cpu: 0, mem: 0.1 }]
    .map((p) => ({ ...p, cmd: p.cmd.trim() }))
    .sort((a, b) => a.pid - b.pid);
  if (args.some((a) => /aux/.test(a))) {
    c.line('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
    for (const p of procs) c.line(`${p.user.padEnd(8)} ${String(p.pid).padStart(7)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(Math.round(8000 + p.mem * 9000)).padStart(6)} ${String(Math.round(1000 + p.mem * 4000)).padStart(5)} pts/0    ${p.cpu > 50 ? 'R' : 'S'}    09:00   ${p.cpu > 50 ? '12:34' : '0:00'} ${p.cmd}`);
    return 0;
  }
  if (full && args.some((a) => /ef/.test(a))) {
    c.line('UID          PID    PPID  C STIME TTY          TIME CMD');
    for (const p of procs) c.line(`${p.user.padEnd(8)} ${String(p.pid).padStart(7)} ${String(p.pid === 1000 ? 1 : 1000).padStart(7)}  0 09:00 pts/0    00:00:00 ${p.cmd}`);
    return 0;
  }
  c.line('    PID TTY          TIME CMD');
  for (const p of procs) {
    if (!full && p.user !== sh.s.user) continue;
    c.line(`${String(p.pid).padStart(7)} pts/0    00:00:00 ${p.pid === 1000 ? 'bash' : basename(p.cmd.split(' ')[0])}`);
  }
  return 0;
}
function pgrep(c, args) {
  const { o, rest } = getopt('pgrep', args, { flags: 'lfa' });
  if (!rest.length) throw new ShellError('no matching criteria specified\nTry `pgrep --help\' for more information.', 2, { raw: false });
  const re = new RegExp(rest[0]);
  const hits = c.sh.s.procs.filter((p) => re.test(o.f ? p.cmd : basename(p.cmd.split(' ')[0])));
  c.lines(hits.map((p) => (o.l || o.a ? `${p.pid} ${o.a ? p.cmd : basename(p.cmd.split(' ')[0])}` : String(p.pid))));
  return hits.length ? 0 : 1;
}
function pkill(c, args) {
  const sig = args.find((a) => /^-(\d+|[A-Z]+)$/.test(a));
  const rest = args.filter((a) => a !== sig && a !== '-f');
  if (!rest.length) throw new ShellError('no matching criteria specified', 2);
  const re = new RegExp(rest[0]);
  const hits = c.sh.s.procs.filter((p) => re.test(args.includes('-f') ? p.cmd : basename(p.cmd.split(' ')[0])));
  for (const p of hits) BUILTINS.kill(c, [...(sig ? [sig] : []), String(p.pid)]);
  return hits.length ? 0 : 1;
}
function editor(c, args) {
  const f = args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
  if (!f) { c.hint(`${c.name} needs a file name here, e.g. ${c.name} notes.txt`); return 1; }
  const abs = c.abs(f);
  const n = c.fs.tryStat(abs);
  if (n && n.type === 'dir') throw new ShellError(`${f} is a directory`);
  try { c.fs.walk(abs); if (!c.fs.nodes[dirname(abs)]) throw new FsError('ENOENT'); } catch (e) { throw new ShellError(`${f}: ${fmsg(e)}`); }
  c.sh.events.push({ type: 'edit', path: abs, name: f, editor: c.name });
  c.hint(`Opening ${f} in the sandbox editor…${c.name === 'nano' || c.name === 'edit' ? '' : ` (${c.name}'s own keys are not simulated)`}`);
  return 0;
}
function bashCmd(c, args) {
  let xtrace = false, i = 0;
  for (; i < args.length && args[i].startsWith('-'); i++) {
    if (args[i] === '-c') {
      const src = args[i + 1];
      if (src === undefined) throw new ShellError('-c: option requires an argument', 2);
      return c.sh.runScript(c.sh.s.cwd, args[i + 2] ?? c.name, args.slice(i + 3), c.io, { text: src, xtrace, env: c.env });
    }
    if (args[i] === '-x') xtrace = true;
    else if (args[i] !== '-e') throw new ShellError(`${args[i]}: invalid option`, 2);
  }
  if (i >= args.length) { c.hint('A nested interactive shell is not simulated; this terminal is already bash.'); return 0; }
  const f = args[i];
  const abs = c.abs(f);
  const n = c.fs.tryStat(abs);
  if (!n) { c.io.err.write(`${c.name}: ${f}: No such file or directory\n`); return 127; }
  if (n.type === 'dir') { c.io.err.write(`${c.name}: ${f}: Is a directory\n`); return 126; }
  return c.sh.runScript(abs, f, args.slice(i + 1), c.io, { xtrace, env: c.env });
}
function man(c, args) {
  const name = args.find((a) => !a.startsWith('-'));
  if (!name) { c.io.err.write('What manual page do you want?\nFor example, try \'man man\'.\n'); return 1; }
  const m = MAN[name];
  if (!m) { c.io.err.write(`No manual entry for ${name}\n`); return 16; }
  c.lines([`${name.toUpperCase()}`, '', 'NAME', `       ${name} - ${m[0]}`, '', 'SYNOPSIS', `       ${m[1]}`, ...(m[2]?.length ? ['', 'OPTIONS', ...m[2].map((l) => '       ' + l)] : [])]);
  return 0;
}
function basenameCmd(c, args) {
  const { o, rest, last } = getopt('basename', args, { flags: 'a', vals: 's' });
  if (!rest.length) throw new ShellError('missing operand\nTry \'basename --help\' for more information.');
  const list = o.a || o.s ? rest : [rest[0]];
  const suffix = o.s ? last('s') : !o.a ? rest[1] : undefined;
  for (const p of list) {
    let b = p.replace(/\/+$/, '').split('/').pop() || (p.startsWith('/') ? '/' : '');
    if (suffix && b.endsWith(suffix) && b !== suffix) b = b.slice(0, -suffix.length);
    c.line(b);
  }
}
function dirnameCmd(c, args) {
  if (!args.length) throw new ShellError('missing operand\nTry \'dirname --help\' for more information.');
  for (const p of args) {
    const t = p.replace(/\/+$/, '');
    if (!t) { c.line('/'); continue; }
    const i = t.lastIndexOf('/');
    c.line(i < 0 ? '.' : i === 0 ? '/' : t.slice(0, i).replace(/\/+$/, '') || '/');
  }
}
function realpath(c, args) {
  for (const p of args.filter((a) => !a.startsWith('-'))) {
    const abs = c.abs(p);
    if (!c.fs.exists(abs) && !c.fs.exists(dirname(abs))) { c.err(`${p}: No such file or directory`); continue; }
    c.line(abs);
  }
}
function uname(c, args) {
  const s = c.sh.s;
  const all = args.includes('-a');
  const parts = [];
  if (all || !args.length || args.includes('-s')) parts.push('Linux');
  if (all || args.includes('-n')) parts.push(s.host);
  if (all || args.includes('-r')) parts.push('6.8.0-learn');
  if (all || args.includes('-m')) parts.push('x86_64');
  if (all) parts.push('GNU/Linux');
  c.line(parts.join(' '));
}
function xargs(c, args) {
  const { o, rest, last } = getopt('xargs', args.slice(0, firstNonOpt(args)), { flags: 't0r', vals: 'nI', code: 1 });
  const cmd = [...rest, ...args.slice(firstNonOpt(args))];
  if (!cmd.length) cmd.push('echo');
  const input = c.stdin();
  const items = o['0'] ? input.split('\0').filter(Boolean) : (input.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((x) => x.replace(/^["']|["']$/g, ''));
  if (!items.length && o.r) return 0;
  let st = 0;
  const run = (argv) => { if (o.t) c.io.err.write(argv.join(' ') + '\n'); const r = c.sh.invoke(argv, { stdin: null, out: c.io.out, err: c.io.err }); if (r !== 0) st = r === 127 ? 127 : 123; };
  if (o.I) {
    const rep = last('I');
    for (const it of (input.split('\n').filter((l) => l.trim()))) run(cmd.map((a) => a.split(rep).join(it.trim())));
    return st;
  }
  const n = o.n ? Math.max(1, +last('n')) : Infinity;
  if (!items.length) { run(cmd); return st; }
  for (let i = 0; i < items.length; i += n === Infinity ? items.length : n) run([...cmd, ...items.slice(i, i + (n === Infinity ? items.length : n))]);
  return st;
}
function firstNonOpt(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) { if (/^-[nI]$/.test(args[i])) i++; i++; }
  return Math.min(i, args.length);
}

export const UTILS = {
  ls, cat: catLike('cat'), less: catLike('less', { pager: true }), more: catLike('more', { pager: true }),
  head: headTail('head'), tail: headTail('tail'), wc, touch, mkdir, rmdir, cp: cpMv('cp'), mv: cpMv('mv'), rm, chmod, find, tree,
  which, env: envCmd, printenv, date, sleep, seq, ps, pgrep, pkill, man,
  whoami: (c) => c.line(c.sh.s.user), hostname: (c) => c.line(c.sh.s.host), uname,
  basename: basenameCmd, dirname: dirnameCmd, realpath, xargs,
  nano: editor, vim: editor, vi: editor, edit: editor,
  bash: bashCmd, sh: bashCmd, clear,
  ...TEXT_UTILS,
};
// builtins that also exist as programs (run when called by path, e.g. /usr/bin/echo, or from find -exec / xargs)
for (const n of BIN_DIR_EXTRA) UTILS[n] = BUILTINS[n];
