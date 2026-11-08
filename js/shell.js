// learn-git: a small, pure, simulated bash shell for the Linux CLI + bash course.
// No DOM access, so it runs the same in the browser and in node tests (mirrors js/git.js).
// State lives in `sh.s` (plain JSON); commands go through `sh.run(line)` -> { lines, ok, code, events }.
// Design and limits: .notes/shell-engine.md. Pieces: shell/parse.js (lexer + parser), shell/expand.js (expansion),
// shell/fs.js (in-memory filesystem), shell/commands.js + shell/text.js (the commands).
import { FS, FsError, normalize, joinPath, dirname, basename } from './shell/fs.js';
import { parse, SyntaxErr } from './shell/parse.js';
import { expandWords, expandWord, expandString, expandHeredoc, ExpandError } from './shell/expand.js';
import { ShellError, Input, BufSink, NullSink, Ctx, shQuote, levenshtein } from './shell/util.js';
import { BUILTINS, UTILS, KEYWORDS, NOT_HERE, BIN_DIR_EXTRA } from './shell/commands.js';

export { ShellError } from './shell/util.js';
export { modeString } from './shell/fs.js';

// Monday 5 January 2026, 09:00 UTC: the sandbox clock starts here and moves 60 s per command line.
export const START_TIME = Date.UTC(2026, 0, 5, 9, 0, 0) / 1000;
export const LIMITS = { loop: 1000, steps: 20000, depth: 50 };

class ExitSignal { constructor(code) { this.code = code; } }
class LoopSignal { constructor(kind, n) { this.kind = kind; this.n = n; } }
class ReturnSignal { constructor(code) { this.code = code; } }
class LimitSignal { constructor(msg) { this.msg = msg; } }

const clone = (x) => JSON.parse(JSON.stringify(x));
const SHELL_PID = 1000;

// A terminal-backed sink: text goes to the run's output lines (class '' for stdout, 'err' for stderr).
class TermSink {
  constructor(sh, cls) { this.sh = sh; this.cls = cls; this.tty = true; }
  write(t) { this.sh._emit(t, this.cls); }
}
// Writes go straight into a file node (opened, and truncated if asked, by redirect()).
class FileSink {
  constructor(sh, abs) { this.sh = sh; this.abs = abs; }
  write(t) { try { this.sh.fs.write(this.abs, t, { append: true }); } catch { /* the file vanished or lost w: drop the text */ } }
}

export class Shell {
  // opts: { clock: () => epochSeconds } to drive `date` / mtimes from outside; { user, host }
  constructor(state, opts = {}) {
    this.s = state ? clone(state) : Shell.emptyState(opts);
    this.clock = opts.clock || null;
    this.fs = new FS(this);
    this.history = [];
    this.out = [];
    this.events = [];
    this.lastOut = '';
    this.lastErr = '';
    this.lastCode = 0;
    this.frame = { args: [], arg0: 'bash', script: null, interactive: true, locals: null, func: null };
    this.depth = 0;
    this.loopDepth = 0;
    this.condDepth = 0;
    this.curLine = 0;
    this._partial = null;
  }

  static emptyState({ user = 'you', host = 'learn' } = {}) {
    const home = `/home/${user}`;
    const t = START_TIME - 86400;
    const dir = (owner = 'root', mode = 0o755) => ({ type: 'dir', mode, owner, mtime: t });
    const nodes = {
      '/': dir(), '/bin': dir(), '/usr': dir(), '/usr/bin': dir(), '/usr/local': dir(), '/usr/local/bin': dir(),
      '/etc': dir(), '/tmp': dir('root', 0o1777), '/dev': dir(), '/home': dir(), [home]: dir(user),
      '/dev/null': { type: 'dev', mode: 0o666, owner: 'root', mtime: t },
      '/etc/hostname': { type: 'file', mode: 0o644, owner: 'root', mtime: t, content: host + '\n' },
      '/etc/passwd': {
        type: 'file', mode: 0o644, owner: 'root', mtime: t,
        content: ['root:x:0:0:root:/root:/bin/bash', 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
          'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin', `${user}:x:1000:1000:${user}:${home}:/bin/bash`].join('\n') + '\n',
      },
    };
    for (const name of [...Object.keys(UTILS), ...BIN_DIR_EXTRA]) nodes['/usr/bin/' + name] = { type: 'file', mode: 0o755, owner: 'root', mtime: t, bin: name };
    for (const name of ['bash', 'sh']) nodes['/bin/' + name] = { type: 'file', mode: 0o755, owner: 'root', mtime: t, bin: name };
    return {
      v: 1, user, host, home, cwd: home, nodes,
      vars: { HOME: home, USER: user, LOGNAME: user, SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin', PWD: home, HOSTNAME: host, TERM: 'xterm-256color', LANG: 'C.UTF-8' },
      exported: { HOME: true, USER: true, LOGNAME: true, SHELL: true, PATH: true, PWD: true, TERM: true, LANG: true },
      funcs: {}, aliases: {}, opts: { errexit: false, xtrace: false, nounset: false, noglob: false },
      status: 0, time: START_TIME, jobs: [], procs: [], nextPid: 4200, lastBg: null,
    };
  }
  clone() { const c = new Shell(this.s, { clock: this.clock }); c.history = [...this.history]; return c; }
  fingerprint() { const { time, ...rest } = this.s; return JSON.stringify(rest); }
  toJSON() { return clone(this.s); }
  static fromJSON(state, opts) { return new Shell(state, opts); }

  get opts() { return this.s.opts; }
  now() { return this.clock ? Math.floor(this.clock()) : this.s.time; }
  tick(sec) { if (!this.clock) this.s.time += sec; }

  /* ------------------------------------------------------------ paths and variables */
  abs(p) {
    let s = String(p);
    if (s === '~' || s.startsWith('~/')) s = this.s.home + s.slice(1);
    return normalize(joinPath(this.s.cwd, s));
  }
  // A path as the prompt shows it: home becomes ~
  pretty(p) { const h = this.s.home; return p === h ? '~' : p.startsWith(h + '/') ? '~' + p.slice(h.length) : p; }
  prompt() { return `${this.s.user}@${this.s.host}:${this.pretty(this.s.cwd)}$`; }

  getVar(name) {
    const f = this.frame;
    if (/^[1-9]\d*$/.test(name)) return f.args[+name - 1];
    switch (name) {
      case '?': return String(this.s.status);
      case '#': return String(f.args.length);
      case '@': case '*': return f.args.join(' ');
      case '0': return f.arg0;
      case '$': return String(SHELL_PID);
      case '!': return this.s.lastBg == null ? undefined : String(this.s.lastBg);
      case '-': return (this.opts.errexit ? 'e' : '') + (this.opts.nounset ? 'u' : '') + (this.opts.xtrace ? 'x' : '') + (this.opts.noglob ? 'f' : '') + (f.interactive ? 'i' : '');
    }
    return Object.prototype.hasOwnProperty.call(this.s.vars, name) ? this.s.vars[name] : undefined;
  }
  setVar(name, value, { exported } = {}) {
    this.s.vars[name] = String(value);
    if (exported) this.s.exported[name] = true;
  }
  unsetVar(name) { delete this.s.vars[name]; delete this.s.exported[name]; }
  positional() { return this.frame.args; }
  // The environment a child process sees: exported variables (+ NAME=value prefixes).
  environ(extra = []) {
    const env = {};
    for (const k of Object.keys(this.s.exported).sort()) if (k in this.s.vars) env[k] = this.s.vars[k];
    for (const a of extra) env[a.name] = a.value;
    return env;
  }

  /* ------------------------------------------------------------ output */
  _emit(text, cls) {
    if (cls === '') this._stdout += text; else if (cls === 'err') this._stderr += text;
    const parts = String(text).split('\n');
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      if (last) { if (parts[i]) this._partial = { t: (this._partial?.t || '') + parts[i], c: this._partial?.c ?? cls }; break; }
      const t = (this._partial?.t || '') + parts[i];
      this.out.push({ t, c: this._partial?.c ?? cls });
      this._partial = null;
    }
  }
  _flush() { if (this._partial) { this.out.push(this._partial); this._partial = null; } }
  // A sandbox note (not part of stdout/stderr): shown in the terminal, ignored by checks.
  hint(text) { this._flush(); for (const t of String(text).split('\n')) this.out.push({ t, c: 'hint' }); }
  errPrefix() { return this.frame.script ? `${this.frame.script}: line ${this.curLine}` : 'bash'; }
  shErr(io, msg) { io.err.write(`${this.errPrefix()}: ${msg}\n`); }
  // set -x's prefix: one + per level of $(…) nesting, like bash's PS4
  ps4() { return '+'.repeat(1 + (this.substDepth || 0)) + ' '; }

  /* ------------------------------------------------------------ running */
  // Run one command line. opts.stdin: text a learner "types" for commands that read input (read, cat).
  // opts.tty: false makes that text behave like piped input (`printf … | cmd`): `read -p` shows no prompt.
  run(input, { stdin = null, tty = true } = {}) {
    this.out = []; this.events = []; this._partial = null; this._stdout = ''; this._stderr = '';
    this.steps = 0;
    this.tick(60);
    const line = String(input);
    this._currentLine = line.trim();
    const termOut = new TermSink(this, ''), termErr = new TermSink(this, 'err');
    const io = { stdin: stdin != null ? new Input(stdin, { tty }) : null, out: termOut, err: termErr };
    let code = 0;
    try {
      const ast = parse(line);
      code = this.execList(ast, io);
    } catch (e) {
      if (e instanceof SyntaxErr) { this.shErr(io, e.message); code = 2; }
      else if (e instanceof ExitSignal) { code = e.code; this._emit('exit\n', ''); this.hint('(exit would close a real terminal; the sandbox stays open)'); this.events.push({ type: 'exit', code }); this.s.opts.errexit = false; }
      else if (e instanceof LimitSignal) { this.shErr(io, e.msg); code = 1; }
      else if (e instanceof ReturnSignal || e instanceof LoopSignal) code = e.code ?? 0;
      else { this.shErr(io, 'internal error: ' + e.message); code = 1; if (typeof console !== 'undefined') console.error(e); }
    }
    this.s.status = code;
    this._flush();
    this._announceJobs();
    this.depth = 0; this.loopDepth = 0; this.condDepth = 0; this.substDepth = 0;
    if (line.trim()) this.history.push(line.trim());
    this.lastOut = this._stdout; this.lastErr = this._stderr; this.lastCode = code;
    return { lines: this.out, ok: code === 0, code, events: this.events };
  }

  step() {
    if (++this.steps > LIMITS.steps) throw new LimitSignal(`stopped after ${LIMITS.steps} commands (sandbox limit)`);
    this.tick(1);
  }

  execList(list, io) {
    let status = 0;
    for (const { node, bg } of list.items) {
      if (bg) { status = this.background(node, io); this.s.status = status; continue; }
      this._exempt = false;
      status = this.execNode(node, io);
      this.s.status = status;
      if (status !== 0 && this.opts.errexit && !this.condDepth && !this._exempt) throw new ExitSignal(status);
    }
    return status;
  }

  execNode(node, io) {
    switch (node.type) {
      case 'list': return this.execList(node, io);
      case 'simple': return this.execSimple(node, io);
      case 'andor': {
        let status = this.execNode(node.first, io);
        let ranLast = node.rest.length === 0;
        for (let i = 0; i < node.rest.length; i++) {
          const { op, node: n } = node.rest[i];
          this.s.status = status;
          if ((op === '&&') === (status === 0)) { status = this.execNode(n, io); ranLast = i === node.rest.length - 1; }
          else ranLast = false;
        }
        if (!ranLast) this._exempt = true;
        return status;
      }
      case 'pipe': return this.execPipe(node, io);
      case 'func': this.s.funcs[node.name] = node.body; return 0;
      default: {
        const io2 = this.redirect(node.redirs || [], io);
        if (!io2) return 1;
        return this.execCompound(node, io2);
      }
    }
  }

  execPipe(node, io) {
    let status;
    if (node.cmds.length === 1) status = this.execNode(node.cmds[0], io);
    else {
      let input = io.stdin;
      node.cmds.forEach((cmd, i) => {
        const last = i === node.cmds.length - 1;
        const sink = last ? io.out : new BufSink();
        const saved = this.saveScope();
        // every part of a pipeline runs in a subshell: `cd` or `read` inside one does not stick
        try { status = this.execNode(cmd, { stdin: input, out: sink, err: io.err }); }
        catch (e) { if (e instanceof ExitSignal) status = e.code; else throw e; }
        finally { this.restoreScope(saved); }
        input = new Input(last ? '' : sink.text);
      });
    }
    if (node.bang) { this._exempt = true; return status === 0 ? 1 : 0; }
    return status;
  }

  execCompound(node, io) {
    switch (node.type) {
      case 'group': return this.execList(node.body, io);
      case 'subshell': {
        const saved = this.saveScope();
        try { return this.execList(node.body, io); }
        catch (e) { if (e instanceof ExitSignal) return e.code; throw e; }
        finally { this.restoreScope(saved); }
      }
      case 'if': {
        for (const c of node.clauses) {
          this.condDepth++;
          let st;
          try { st = this.execList(c.cond, io); } finally { this.condDepth--; }
          if (st === 0) return this.execList(c.body, io);
        }
        return node.else ? this.execList(node.else, io) : 0;
      }
      case 'for': {
        let items;
        try { items = node.items ? expandWords(this, node.items) : [...this.positional()]; }
        catch (e) { if (e instanceof ExpandError) { this.shErr(io, e.message); return e.code; } throw e; }
        let status = 0;
        for (const it of items) {
          if (this.opts.xtrace) io.err.write(`${this.ps4()}for ${node.name} in ${items.map(shQuote).join(' ')}\n`);
          this.setVar(node.name, it);
          const r = this.loopBody(node.body, io);
          status = r.status;
          if (r.brk) break;
        }
        return status;
      }
      case 'while': {
        let status = 0, n = 0;
        for (;;) {
          this.condDepth++;
          let c;
          try { c = this.execList(node.cond, io); } finally { this.condDepth--; }
          if ((c === 0) === node.until) break;
          if (++n > LIMITS.loop) { this.shErr(io, `${node.until ? 'until' : 'while'} loop stopped after ${LIMITS.loop} rounds (sandbox limit)`); return 1; }
          const r = this.loopBody(node.body, io);
          status = r.status;
          if (r.brk) break;
        }
        return status;
      }
    }
    throw new Error('unknown node ' + node.type);
  }
  loopBody(body, io) {
    this.loopDepth++;
    try { return { status: this.execList(body, io), brk: false }; }
    catch (e) {
      if (!(e instanceof LoopSignal)) throw e;
      if (e.n > 1) { e.n--; throw e; }
      return { status: 0, brk: e.kind === 'break' };
    } finally { this.loopDepth--; }
  }

  execSimple(node, io) {
    this.step();
    this.curLine = node.line;
    this._errSink = io.err; // where $(…) inside this command sends its stderr
    let argv, assigns;
    try {
      argv = expandWords(this, node.words);
      assigns = node.assigns.map((a) => ({ name: a.name, value: (a.append ? this.getVar(a.name) ?? '' : '') + expandString(this, a.value) }));
    } catch (e) {
      if (e instanceof ExpandError) {
        this.shErr(io, e.message);
        // set -u: a non-interactive shell (a script) stops at an unset variable, as bash does
        if (e.unbound && !this.frame.interactive) throw new ExitSignal(1);
        return e.code;
      }
      throw e;
    }
    const subStatus = this._subStatus;
    this._subStatus = undefined;
    if (!argv.length) {
      if (this.opts.xtrace) for (const a of assigns) io.err.write(`${this.ps4()}${a.name}=${shQuote(a.value)}\n`);
      for (const a of assigns) this.setVar(a.name, a.value);
      const io2 = this.redirect(node.redirs, io);
      if (!io2) return 1;
      return subStatus ?? 0;
    }
    // aliases: interactive only, first word typed literally, not inside its own expansion
    const w0 = node.words[0].parts;
    if (this.frame.interactive && w0.length === 1 && w0[0].k === 'lit' && w0[0].q === 0 && this.s.aliases[argv[0]] !== undefined && !(this._aliasing ||= new Set()).has(argv[0])) {
      const name = argv[0];
      const io2 = this.redirect(node.redirs, io);
      if (!io2) return 1;
      this._aliasing.add(name);
      try { return this.evalString(this.s.aliases[name] + ' ' + argv.slice(1).map(shQuote).join(' '), io2); }
      finally { this._aliasing.delete(name); }
    }
    if (this.opts.xtrace) io.err.write(this.ps4() + [...assigns.map((a) => `${a.name}=${shQuote(a.value)}`), ...argv.map(shQuote)].join(' ') + '\n');
    const io2 = this.redirect(node.redirs, io);
    if (!io2) return 1;
    return this.invoke(argv, io2, assigns);
  }

  // Run a command line's text inside the current shell (alias bodies, eval).
  evalString(text, io) {
    let ast;
    try { ast = parse(text); } catch (e) { if (e instanceof SyntaxErr) { this.shErr(io, e.message); return 2; } throw e; }
    return this.execList(ast, io);
  }

  // $(…): run in a subshell, capture stdout, strip trailing newlines.
  commandSubst(src) {
    const sink = new BufSink();
    const saved = this.saveScope();
    let status = 0;
    this.substDepth = (this.substDepth || 0) + 1;
    try {
      const ast = parse(src);
      status = this.execList(ast, { stdin: null, out: sink, err: this._errSink || new TermSink(this, 'err') });
    } catch (e) {
      if (e instanceof SyntaxErr) throw new ExpandError(e.message, 2);
      if (e instanceof ExitSignal) status = e.code; else throw e;
    } finally { this.restoreScope(saved); this.substDepth--; }
    this._subStatus = status;
    this.s.status = status;
    return sink.text.replace(/\n+$/, '');
  }

  // Find and run a command: functions, builtins, then a path or $PATH lookup.
  invoke(argv, io, assigns = [], { skipFuncs = false } = {}) {
    const [name, ...args] = argv;
    if (!skipFuncs && this.s.funcs[name]) return this.withTemp(assigns, () => this.callFunction(name, args, io));
    if (BUILTINS[name]) return this.withTemp(assigns, () => this.runBuiltin(name, args, io));
    let path;
    if (name.includes('/')) path = this.abs(name);
    else {
      path = this.which(name);
      if (!path) {
        this.shErr(io, `${name}: command not found`);
        this.notFoundHint(name);
        return 127;
      }
    }
    return this.execFile(path, name, args, io, assigns);
  }
  withTemp(assigns, fn) {
    if (!assigns.length) return fn();
    const old = assigns.map((a) => [a.name, this.s.vars[a.name]]);
    for (const a of assigns) this.s.vars[a.name] = a.value;
    try { return fn(); } finally { for (const [k, v] of old) { if (v === undefined) delete this.s.vars[k]; else this.s.vars[k] = v; } }
  }
  notFoundHint(name) {
    if (NOT_HERE[name]) { this.hint(NOT_HERE[name]); return; }
    if (UTILS[name] && this.fs.isFile('/usr/bin/' + name)) { this.hint(`${name} lives in /usr/bin, which is not in your $PATH right now.`); return; }
    const known = [...Object.keys(BUILTINS), ...Object.keys(UTILS)];
    const best = known.map((c) => [c, levenshtein(name, c)]).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    if (best && best[1] <= (name.length > 4 ? 2 : 1)) this.hint(`Did you mean '${best[0]}'?`);
  }
  // $PATH lookup: the first executable file named `name`.
  which(name, { all = false } = {}) {
    const hits = [];
    for (const dir of (this.getVar('PATH') ?? '').split(':')) {
      const p = normalize(joinPath(dir ? normalize(joinPath(this.s.cwd, dir)) : this.s.cwd, name));
      const n = this.fs.tryStat(p);
      if (n && n.type === 'file' && this.fs.can(n, 'x')) { if (!all) return p; hits.push(p); }
    }
    return all ? hits : null;
  }

  execFile(path, shown, args, io, assigns = []) {
    let n;
    try { n = this.fs.stat(path); }
    catch (e) { this.shErr(io, `${shown}: ${e.message}`); return e.code === 'EACCES' ? 126 : 127; }
    if (n.type === 'dir') { this.shErr(io, `${shown}: Is a directory`); return 126; }
    if (!this.fs.can(n, 'x')) { this.shErr(io, `${shown}: Permission denied`); return 126; }
    if (n.bin) return this.runUtil(n.bin, shown, args, io, this.environ(assigns));
    return this.runScript(path, shown, args, io, { assigns });
  }

  runBuiltin(name, args, io) {
    const c = new Ctx(this, name, io);
    c.err = (msg, code = 1) => { io.err.write(`${this.errPrefix()}: ${name}: ${msg}\n`); if (code) c.status = code; };
    return this._call(c, BUILTINS[name], args);
  }
  runUtil(bin, shown, args, io, env) {
    const c = new Ctx(this, basename(shown), io, env);
    if (args[0] === '--help' && UTILS.man) return this._call(c, UTILS.man, [bin]);
    return this._call(c, UTILS[bin], args);
  }
  _call(c, fn, args) {
    try {
      const r = fn(c, args);
      return r === undefined ? c.status : r;
    } catch (e) {
      if (e instanceof ShellError) { c.io.err.write((e.raw ? e.message : `${c.name}: ${e.message}`) + '\n'); return e.code; }
      if (e instanceof FsError) { c.io.err.write(`${c.name}: ${e.message}\n`); return 1; }
      throw e;
    }
  }

  // Run a script file. A child shell: only exported variables come in, nothing leaks back out.
  // source: run it in this shell instead (`source file` / `. file`).
  runScript(path, shown, args, io, { assigns = [], env = null, source = false, text = null, xtrace = false } = {}) {
    if (text === null) {
      try { text = this.fs.read(path); }
      catch (e) { this.shErr(io, `${shown}: ${e.message}`); return 126; }
    }
    const first = text.split('\n')[0];
    if (!source && first.startsWith('#!')) {
      if (first.endsWith('\r')) { this.shErr(io, `${shown}: ${first.slice(2).trim()}^M: bad interpreter: No such file or directory`); this.hint('The script has Windows line endings (CRLF). Fix them with: sed -i \'s/\\r$//\' ' + shown); return 126; }
      const [interp, ...iargs] = first.slice(2).trim().split(/\s+/);
      let prog = interp;
      if (basename(interp) === 'env' && this.fs.isFile(interp)) {
        prog = iargs[0] || '';
        const found = prog.includes('/') ? (this.fs.isFile(this.abs(prog)) ? prog : null) : this.which(prog);
        if (!found) { io.err.write(`${interp}: '${prog}': No such file or directory\n`); return 127; }
        prog = found;
      } else if (!this.fs.isFile(interp)) {
        this.shErr(io, `${shown}: ${interp}: bad interpreter: No such file or directory`); return 126;
      }
      if (!['bash', 'sh'].includes(basename(prog))) { this.shErr(io, `${shown}: ${basename(prog)} scripts can't run in this sandbox (only bash)`); return 126; }
    }
    if (this.depth >= LIMITS.depth) { this.shErr(io, `${shown}: maximum nesting level exceeded (sandbox limit)`); return 1; }
    // bash reads a script one command at a time, so the lines before a syntax error still run; the error is
    // reported when the reader gets to it (if nothing before it exited)
    let ast, syn = null;
    try { ast = parse(text); }
    catch (e) { if (!(e instanceof SyntaxErr)) throw e; syn = e; ast = parsePrefix(text, e.line); }
    const finish = (status) => {
      if (!syn) return status;
      io.err.write(`${shown}: line ${syn.line}: ${syn.message}\n`);
      const src = text.split('\n')[syn.line - 1];
      if (/^syntax error near/.test(syn.message) && src !== undefined) io.err.write(`${shown}: line ${syn.line}: \`${src}'\n`);
      return 2;
    };
    const savedFrame = this.frame, savedLine = this.curLine, savedLoop = this.loopDepth;
    if (source) {
      this.frame = { ...savedFrame, args: args.length ? args : savedFrame.args, sourced: true };
      this.depth++;
      try { return finish(this.execList(ast, io)); }
      catch (e) { if (e instanceof ReturnSignal) return e.code; throw e; }
      finally { this.depth--; this.frame = savedFrame; this.curLine = savedLine; }
    }
    const saved = this.saveScope();
    env = env ? { ...env } : this.environ(assigns);
    this.s.vars = env;
    this.s.exported = Object.fromEntries(Object.keys(env).map((k) => [k, true]));
    this.s.funcs = {};
    this.s.opts = { errexit: false, xtrace, nounset: false, noglob: false };
    this.frame = { args, arg0: shown, script: shown, interactive: false, locals: null, func: null };
    this.depth++; this.loopDepth = 0;
    try { return finish(this.execList(ast, io)); }
    catch (e) {
      if (e instanceof ExitSignal) return e.code;
      if (e instanceof ReturnSignal) return e.code;
      throw e;
    } finally {
      this.depth--; this.loopDepth = savedLoop;
      this.frame = savedFrame; this.curLine = savedLine;
      this.restoreScope(saved);
    }
  }

  callFunction(name, args, io) {
    if (this.depth >= LIMITS.depth) { this.shErr(io, `${name}: maximum function nesting level exceeded (sandbox limit)`); return 1; }
    const savedFrame = this.frame, savedLoop = this.loopDepth;
    this.frame = { ...savedFrame, args, locals: {}, func: name };
    this.depth++; this.loopDepth = 0;
    try { return this.execNode(this.s.funcs[name], io); }
    catch (e) { if (e instanceof ReturnSignal) return e.code; throw e; }
    finally {
      for (const [k, v] of Object.entries(this.frame.locals)) { if (v === null) delete this.s.vars[k]; else this.s.vars[k] = v; }
      this.depth--; this.loopDepth = savedLoop;
      this.frame = savedFrame;
    }
  }
  // `local x`: remember the outer value so the function's return puts it back
  makeLocal(name) {
    const L = this.frame.locals;
    if (!(name in L)) L[name] = this.s.vars[name] ?? null;
  }

  saveScope() {
    const s = this.s;
    return { vars: { ...s.vars }, exported: { ...s.exported }, cwd: s.cwd, funcs: { ...s.funcs }, aliases: { ...s.aliases }, opts: { ...s.opts }, args: this.frame.args };
  }
  restoreScope(x) {
    const s = this.s;
    s.vars = x.vars; s.exported = x.exported; s.cwd = x.cwd; s.funcs = x.funcs; s.aliases = x.aliases; s.opts = x.opts;
    this.frame.args = x.args;
  }

  // Apply redirections left to right. Returns the new io, or null (after printing the error) when one fails.
  redirect(redirs, io) {
    if (!redirs.length) return io;
    const fds = { 0: io.stdin, 1: io.out, 2: io.err };
    for (const r of redirs) {
      if (r.dup !== undefined) {
        if (r.dup === '-') { fds[r.fd] = r.fd === 0 ? null : new NullSink(); continue; }
        if (!(r.dup in fds)) { this.shErr(io, `${r.dup}: Bad file descriptor`); return null; }
        fds[r.fd] = fds[r.dup];
        continue;
      }
      if (r.heredoc) { fds[r.fd] = new Input(r.heredoc.quoted ? r.heredoc.body : this._safe(io, () => expandHeredoc(this, r.heredoc.body))); if (fds[r.fd].data === undefined) return null; continue; }
      let target;
      try {
        if (r.op === '<<<') { fds[r.fd] = new Input(expandString(this, r.target) + '\n'); continue; }
        const words = expandWord(this, r.target);
        if (words.length !== 1) { this.shErr(io, `${r.target.parts.map((p) => p.v ?? '$' + (p.name || '')).join('')}: ambiguous redirect`); return null; }
        target = words[0];
      } catch (e) { if (e instanceof ExpandError) { this.shErr(io, e.message); return null; } throw e; }
      const abs = this.abs(target);
      try {
        if (r.op === '<') { fds[r.fd] = new Input(this.fs.read(abs), { file: true }); continue; }
        if (r.op === '>' || r.op === '&>') this.fs.write(abs, '');
        else this.fs.write(abs, '', { append: true });
      } catch (e) {
        if (e instanceof FsError) { this.shErr(io, `${target}: ${e.message}`); return null; }
        throw e;
      }
      const sink = new FileSink(this, abs);
      if (r.op === '&>' || r.op === '&>>') { fds[1] = sink; fds[2] = sink; } else fds[r.fd] = sink;
    }
    return { stdin: fds[0], out: fds[1] || new NullSink(), err: fds[2] || new NullSink() };
  }
  _safe(io, fn) {
    try { return fn(); } catch (e) { if (e instanceof ExpandError) { this.shErr(io, e.message); return undefined; } throw e; }
  }

  /* ------------------------------------------------------------ jobs (simulated lightly) */
  // `cmd &`: `sleep N &` becomes a running job until it is killed, waited for or brought back with fg;
  // anything else runs to completion straight away (in a subshell) and is reported as Done.
  background(node, io) {
    const id = Math.max(0, ...this.s.jobs.map((j) => j.id)) + 1;
    const pid = this.s.nextPid++;
    const cmd = describe(node);
    this._emit(`[${id}] ${pid}\n`, 'job');
    this.s.lastBg = pid;
    if (node.type === 'simple' && node.words[0] && describe(node).split(' ')[0] === 'sleep') {
      this.s.jobs.push({ id, pid, cmd, state: 'Running' });
      this.s.procs.push({ pid, cmd, user: this.s.user, cpu: 0, mem: 0.1, job: id });
      return 0;
    }
    const saved = this.saveScope();
    let status = 0;
    try { status = this.execNode(node, { stdin: null, out: io.out, err: io.err }); }
    catch (e) { if (e instanceof ExitSignal) status = e.code; else throw e; }
    finally { this.restoreScope(saved); }
    this.s.jobs.push({ id, pid, cmd, state: status === 0 ? 'Done' : `Exit ${status}` });
    return 0;
  }
  _announceJobs() {
    const done = this.s.jobs.filter((j) => j.state !== 'Running' && j.state !== 'Stopped');
    if (!done.length) return;
    for (const j of done) this.out.push({ t: `[${j.id}]${this._jobMark(j)}  ${j.state.padEnd(24)}${j.cmd}`, c: 'job' });
    this.s.jobs = this.s.jobs.filter((j) => !done.includes(j));
  }
  _jobMark(j) {
    const ids = this.s.jobs.map((x) => x.id);
    return j.id === ids[ids.length - 1] ? '+' : j.id === ids[ids.length - 2] ? '-' : ' ';
  }
  endJob(job, state) {
    job.state = state;
    this.s.procs = this.s.procs.filter((p) => p.pid !== job.pid);
  }

  /* ------------------------------------------------------------ setup API (exercises and tests) */
  // Paths are relative to home unless absolute. A value is the file's text, null for a directory,
  // or { content, mode, mtime } (e.g. { content: '#!/bin/bash\necho hi', mode: 0o755 }). Parents are created.
  setupFiles(files) {
    for (const [p, v] of Object.entries(files)) {
      const abs = normalize(p.startsWith('/') ? p : joinPath(this.s.home, p));
      this._mkdirs(dirname(abs));
      if (v === null || (p.endsWith('/') && v === null)) { if (!this.s.nodes[abs]) this.s.nodes[abs] = { type: 'dir', mode: 0o755, owner: this.s.user, mtime: this.now() }; continue; }
      const spec = typeof v === 'object' ? v : { content: v };
      if (spec.dir) { this.s.nodes[abs] = { type: 'dir', mode: spec.mode ?? 0o755, owner: spec.owner ?? this.s.user, mtime: spec.mtime ?? this.now() }; continue; }
      let content = String(spec.content ?? '');
      if (content && !content.endsWith('\n') && spec.newline !== false) content += '\n';
      this.s.nodes[abs] = { type: 'file', mode: spec.mode ?? 0o644, owner: spec.owner ?? this.s.user, mtime: spec.mtime ?? this.now(), content };
    }
    return this;
  }
  _mkdirs(abs) {
    if (this.s.nodes[abs]) return;
    this._mkdirs(dirname(abs));
    this.s.nodes[abs] = { type: 'dir', mode: 0o755, owner: this.s.user, mtime: this.now() };
  }
  setupCwd(p) { const abs = this.abs(p.startsWith('/') || p.startsWith('~') ? p : '~/' + p); this._mkdirs(abs); this.s.cwd = abs; this.s.vars.PWD = abs; return this; }
  setupEnv(vars, { exported = true } = {}) { for (const [k, v] of Object.entries(vars)) this.setVar(k, v, { exported }); return this; }
  // A process that is "already running" for ps/kill exercises. stubborn: ignores a plain kill (needs -9).
  setupProcess(cmd, { cpu = 0.0, mem = 0.5, user = this.s.user, stubborn = false } = {}) {
    const pid = this.s.nextPid++;
    this.s.procs.push({ pid, cmd, user, cpu, mem, ...(stubborn ? { stubborn: true } : {}) });
    return pid;
  }
  // Run a command during setup; it must succeed.
  sh(line, opts) {
    const r = this.run(line, opts);
    this.history.pop();
    if (!r.ok) throw new Error(`setup command failed: ${line}\n${r.lines.map((l) => l.t).join('\n')}`);
    return r;
  }
  setupDone() { this.history = []; this.out = []; this.events = []; this.lastOut = ''; this.lastErr = ''; this.lastCode = 0; this.s.status = 0; return this; }
  // Write a file from outside (the UI's editor, after a `nano file` event).
  writeFile(p, text) { const abs = this.abs(p); this.fs.write(abs, String(text)); }
  readFile(p) { const n = this.s.nodes[this.abs(p)]; return n && n.type === 'file' ? n.content : undefined; }

  /* ------------------------------------------------------------ views for the UI */
  // The file tree under `root` (default: home), for the live files panel. Hidden entries only with hidden: true.
  treeView({ root = this.s.home, hidden = false } = {}) {
    const build = (abs) => {
      const n = this.s.nodes[abs];
      const item = { name: abs === root ? this.pretty(abs) : basename(abs), path: abs, type: n.type, mode: n.mode, cwd: abs === this.s.cwd };
      if (n.type === 'dir') {
        item.children = this.fs.names(abs).filter((nm) => hidden || !nm.startsWith('.')).map((nm) => build(joinPath(abs, nm)));
        item.open = this.s.cwd === abs || this.s.cwd.startsWith(abs === '/' ? '/' : abs + '/');
      } else {
        item.size = (n.content || '').length;
        item.exec = (n.mode & 0o111) !== 0;
      }
      return item;
    };
    return this.s.nodes[root] ? build(root) : null;
  }
  completions() {
    const names = new Set([...Object.keys(BUILTINS), ...Object.keys(this.s.funcs), ...Object.keys(this.s.aliases)]);
    for (const dir of (this.getVar('PATH') ?? '').split(':')) {
      const abs = normalize(joinPath(this.s.cwd, dir || '.'));
      if (this.fs.isDir(abs)) for (const nm of this.fs.names(abs)) names.add(nm);
    }
    let files = [];
    try { files = this.fs.list(this.s.cwd).map((nm) => nm + (this.s.nodes[joinPath(this.s.cwd, nm)].type === 'dir' ? '/' : '')); } catch { /* cwd gone */ }
    return {
      shell: [...names].sort(), files, vars: Object.keys(this.s.vars).sort(),
      commands: [], branches: [], tags: [], remotes: [], remoteNames: [],
    };
  }
  // Tab completion for a path prefix as typed ('docs/re' -> ['docs/readme.md', 'docs/reports/']).
  completePath(prefix) {
    const slash = prefix.lastIndexOf('/');
    const dirPart = slash >= 0 ? prefix.slice(0, slash + 1) : '';
    const stem = slash >= 0 ? prefix.slice(slash + 1) : prefix;
    const abs = this.abs(dirPart || '.');
    let names;
    try { names = this.fs.list(abs); } catch { return []; }
    return names.filter((n) => n.startsWith(stem) && (stem.startsWith('.') || !n.startsWith('.')))
      .map((n) => dirPart + n + (this.s.nodes[joinPath(abs, n)].type === 'dir' ? '/' : ''));
  }
  // Tab completion for a whole input line, the way bash does it: the first word of a command (at the start or after
  // | ; && || or a `(`) completes command names, `$X` completes variable names, `~`/`~/x` and anything else a path.
  // Returns { line, options }: the completed line (unchanged when nothing or several things match) and the matches
  // (shown as a listing when there is more than one). A single directory match ends in `/`, a single file in a space.
  complete(line) {
    const v = String(line);
    const m = /((?:\\.|\S)*)$/.exec(v);
    const word = m[1], before = v.slice(0, v.length - word.length);
    const head = word.replace(/^.*[|;&<>(]/, '');   // `ls|wc` or `cat>out` glue: complete the part after the operator
    const pre = word.slice(0, word.length - head.length);
    const cmdPos = pre ? /[|;&(]$/.test(pre) : !before.trim() || /[|;&(]\s*$/.test(before);
    let cands, stem = head, prefixOut = '', esc = false;
    if (head.startsWith('$')) { stem = head.slice(1); prefixOut = '$'; cands = Object.keys(this.s.vars).sort(); }
    else if (cmdPos && !head.includes('/')) cands = this.completions().shell;
    else {
      const tilde = (head === '~' ? '~/' : head).replace(/\\(.)/g, '$1');   // `my\ fi` matches `my file.txt`
      cands = this.completePath(tilde.startsWith('~/') ? this.s.home + tilde.slice(1) : tilde)
        .map((c) => (tilde.startsWith('~/') ? '~' + c.slice(this.s.home.length) : c));
      stem = tilde;
      esc = true;
    }
    const hits = [...new Set(cands)].filter((c) => c.startsWith(stem));
    if (!hits.length) return { line: v, options: [] };
    const out = (s) => before + pre + prefixOut + (esc ? s.replace(/([ '"\\])/g, '\\$1') : s);
    if (hits.length === 1) {
      const one = hits[0];
      return { line: out(one) + (one.endsWith('/') ? '' : ' '), options: hits };
    }
    let common = hits[0];
    for (const x of hits) while (!x.startsWith(common)) common = common.slice(0, -1);
    return { line: common.length > stem.length ? out(common) : v, options: hits };
  }
  // signals for builtins
  static signals() { return { ExitSignal, LoopSignal, ReturnSignal }; }
}

// A command's text for job listings (`sleep 100`).
function describe(node) {
  if (node.type === 'simple') return node.words.map((w) => w.parts.map((p) => (p.k === 'lit' ? p.v : p.k === 'tilde' ? '~' : p.k === 'var' ? '$' + p.name : '$(…)')).join('')).join(' ');
  if (node.type === 'pipe') return node.cmds.map(describe).join(' | ');
  return node.type;
}

// Build a ready shell for an exercise: buildShell({ files, cwd, env, procs, clock }).
// The complete commands before a script's syntax error at line `line`: the longest run of whole lines before it
// that parses (a line ending in a backslash continues into the next one, so it can't end the run).
function parsePrefix(text, line) {
  const lines = text.split('\n');
  for (let k = Math.min((line || 1) - 1, lines.length); k > 0; k--) {
    if (/\\$/.test(lines[k - 1])) continue;
    try { return parse(lines.slice(0, k).join('\n')); } catch (e) { if (!(e instanceof SyntaxErr)) throw e; }
  }
  return { type: 'list', items: [] };
}

export function buildShell({ files = {}, cwd = null, env = {}, procs = [], clock = null, setup = null } = {}) {
  const sh = new Shell(null, { clock });
  sh.setupFiles(files);
  if (cwd) sh.setupCwd(cwd);
  sh.setupEnv(env);
  for (const p of procs) typeof p === 'string' ? sh.setupProcess(p) : sh.setupProcess(p.cmd, p);
  if (setup) setup(sh);
  return sh.setupDone();
}

export const SHELL_KEYWORDS = KEYWORDS;
