// Shared bits for the shell's commands: the error type, the per-command context, option parsing, formatting.

// Thrown by a command to stop with a message on stderr and an exit status. `raw` messages are printed as is,
// otherwise they get the command's "name: " prefix.
export class ShellError extends Error {
  constructor(msg, code = 1, { raw = false } = {}) { super(msg); this.code = code; this.raw = raw; }
}

// Input stream for stdin: a string with a read cursor, shared by `read` calls in a loop.
export class Input {
  // `file`: the input is a regular file (`< f`), which some tools treat differently from a pipe (wc's column width)
  constructor(data, { tty = false, file = false } = {}) { this.data = String(data ?? ''); this.pos = 0; this.tty = tty; this.file = file; }
  readAll() { const r = this.data.slice(this.pos); this.pos = this.data.length; return r; }
  readLine() {
    if (this.pos >= this.data.length) return null;
    let e = this.data.indexOf('\n', this.pos);
    const nl = e >= 0;
    if (!nl) e = this.data.length;
    const line = this.data.slice(this.pos, e);
    this.pos = nl ? e + 1 : e;
    return { line, nl };
  }
}

// Output sinks. The terminal sinks are created by the Shell; these two are used for pipes and $(…).
export class BufSink {
  constructor() { this.text = ''; }
  write(t) { this.text += t; }
}
export class NullSink { write() {} }

// What a command implementation gets: the shell, its streams, its name (for messages) and its environment.
export class Ctx {
  constructor(sh, name, io, env = null) { this.sh = sh; this.name = name; this.io = io; this.env = env; this.status = 0; }
  get fs() { return this.sh.fs; }
  get tty() { return !!this.io.out.tty; }
  out(t) { this.io.out.write(t); }
  line(t = '') { this.io.out.write(t + '\n'); }
  lines(arr) { if (arr.length) this.io.out.write(arr.join('\n') + '\n'); }
  // "name: msg" on stderr; marks the command as failed with `code` (unless 0)
  err(msg, code = 1) { this.io.err.write(`${this.name}: ${msg}\n`); if (code) this.status = code; }
  hint(msg) { this.sh.hint(msg); }
  abs(p) { return this.sh.abs(p); }
  stdin() { return this.io.stdin ? this.io.stdin.readAll() : ''; }
  // The text of each input: named files, or stdin when there are none ('-' also means stdin).
  // Errors are reported ("name: f: No such file or directory") and the file is skipped.
  inputs(files, { what = (f, e) => `${f}: ${e.message}` } = {}) {
    if (!files.length) return [{ name: '-', text: this.stdin(), stdin: true }];
    const out = [];
    for (const f of files) {
      if (f === '-') { out.push({ name: '-', text: this.stdin(), stdin: true }); continue; }
      try {
        const n = this.fs.stat(this.abs(f));
        if (n.bin) { out.push({ name: f, text: '', binary: true }); continue; }
        out.push({ name: f, text: this.fs.read(this.abs(f)) });
      } catch (e) { this.err(what(f, e)); }
    }
    return out;
  }
}

// GNU-style option parsing with permutation (options may follow operands until `--`).
//   spec.flags: 'laR' (boolean), spec.vals: 'nk' (take a value), spec.long: { all: 'a', lines: 'n' },
//   spec.num: 'n' (a bare -5 means -n 5), spec.code: exit status for a usage error.
export function getopt(name, args, spec = {}) {
  const { flags = '', vals = '', long = {}, num = null, code = 1 } = spec;
  const o = {}, rest = [];
  const usage = (msg) => { throw new ShellError(`${name}: ${msg}\nTry '${name} --help' for more information.`, code, { raw: true }); };
  const set = (k, v) => { if (vals.includes(k)) (o[k] ||= []).push(v); else o[k] = true; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { rest.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      const k = long[key];
      if (!k) usage(`unrecognized option '${a}'`);
      if (vals.includes(k)) {
        const v = eq > 0 ? a.slice(eq + 1) : args[++i];
        if (v === undefined) usage(`option '--${key}' requires an argument`);
        set(k, v);
      } else set(k, true);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      if (num && /^-\d+$/.test(a)) { set(num, a.slice(1)); continue; }
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (vals.includes(c)) {
          const v = a.slice(j + 1) || args[++i];
          if (v === undefined) usage(`option requires an argument -- '${c}'`);
          set(c, v);
          break;
        }
        if (!flags.includes(c)) usage(`invalid option -- '${c}'`);
        set(c, true);
      }
      continue;
    }
    rest.push(a);
  }
  const last = (k) => (o[k] ? o[k][o[k].length - 1] : undefined);
  return { o, rest, last };
}

// Lines of a text, without the empty string after a final newline.
export function linesOf(text) {
  if (!text) return [];
  const t = text.endsWith('\n') ? text.slice(0, -1) : text;
  return t.split('\n');
}
export const joinLines = (arr) => (arr.length ? arr.join('\n') + '\n' : '');

// Quote a word for display the way bash's `set -x` / `alias` / `declare` do.
export function shQuote(s) {
  if (s === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
    {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // a swapped pair of letters (sl -> ls) counts as one edit
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  return dp[a.length][b.length];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n) => String(n).padStart(2, '0');
// strftime subset (UTC): %Y %m %d %e %H %M %S %A %a %B %b %j %s %F %T %D %Z %n %t %%
export function strftime(fmt, epoch) {
  const d = new Date(epoch * 1000);
  const map = {
    Y: d.getUTCFullYear(), m: p2(d.getUTCMonth() + 1), d: p2(d.getUTCDate()), e: String(d.getUTCDate()).padStart(2, ' '),
    H: p2(d.getUTCHours()), M: p2(d.getUTCMinutes()), S: p2(d.getUTCSeconds()), A: DAYS[d.getUTCDay()], a: DAYS[d.getUTCDay()].slice(0, 3),
    B: MONTHS[d.getUTCMonth()], b: MONTHS[d.getUTCMonth()].slice(0, 3), h: MONTHS[d.getUTCMonth()].slice(0, 3),
    j: String(Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1).padStart(3, '0'),
    s: epoch, Z: 'UTC', n: '\n', t: '\t', '%': '%', y: p2(d.getUTCFullYear() % 100), u: d.getUTCDay() || 7,
  };
  map.F = `${map.Y}-${map.m}-${map.d}`; map.T = `${map.H}:${map.M}:${map.S}`; map.D = `${map.m}/${map.d}/${map.y}`; map.R = `${map.H}:${map.M}`;
  return fmt.replace(/%(.)/g, (all, c) => (c in map ? String(map[c]) : all));
}

// Backslash escapes for echo -e / printf %b. Returns { text, stop } (\c stops all output).
export function escapes(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i + 1 >= s.length) { out += c; continue; }
    const n = s[++i];
    const simple = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', e: '\x1b', '\\': '\\' };
    if (n in simple) { out += simple[n]; continue; }
    if (n === 'c') return { text: out, stop: true };
    if (n === '0') { const m = s.slice(i + 1).match(/^[0-7]{0,3}/)[0]; out += String.fromCharCode(parseInt(m || '0', 8)); i += m.length; continue; }
    if (n === 'x') { const m = s.slice(i + 1).match(/^[0-9a-fA-F]{1,2}/); if (m) { out += String.fromCharCode(parseInt(m[0], 16)); i += m[0].length; continue; } }
    out += '\\' + n;
  }
  return { text: out, stop: false };
}

// printf-style formatting (bash's printf builtin): the format is reused while arguments remain.
export function printf(fmt, args, onBadNumber = () => {}) {
  let out = '', ai = 0;
  const next = () => (ai < args.length ? args[ai++] : undefined);
  const toNum = (v, int) => {
    if (v === undefined || v === '') return 0;
    if (/^'./.test(v) || /^"./.test(v)) return v.charCodeAt(1);
    const n = int ? (/^[-+]?0x[0-9a-f]+$/i.test(v.trim()) ? parseInt(v, 16) : /^[-+]?\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN) : Number(v);
    if (Number.isNaN(n)) { onBadNumber(v); return int ? parseInt(v, 10) || 0 : parseFloat(v) || 0; }
    return n;
  };
  const pad = (s, flags, width) => {
    if (!width || s.length >= width) return s;
    if (flags.includes('-')) return s.padEnd(width);
    if (flags.includes('0') && /^[-+]?[\d.]/.test(s)) { const sign = /^[-+]/.test(s) ? s[0] : ''; return sign + s.slice(sign.length).padStart(width - sign.length, '0'); }
    return s.padStart(width);
  };
  do {
    const startAi = ai;
    let stop = false;
    for (let i = 0; i < fmt.length && !stop; i++) {
      const c = fmt[i];
      if (c === '\\') {
        const tok = fmt.slice(i).match(/^\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|.)/)?.[0] || '\\';
        out += escapes(tok).text;
        i += tok.length - 1;
        continue;
      }
      if (c !== '%') { out += c; continue; }
      const m = fmt.slice(i).match(/^%([-+ 0#]*)(\d+|\*)?(?:\.(\d+|\*))?([sbcdiouxXfeEgG%])/);
      if (!m) { out += c; continue; }
      i += m[0].length - 1;
      let [, flags, width, prec, conv] = m;
      if (width === '*') width = String(toNum(next(), true));
      if (prec === '*') prec = String(toNum(next(), true));
      const w = width ? +width : 0;
      if (conv === '%') { out += '%'; continue; }
      const v = next();
      let s;
      switch (conv) {
        case 's': s = v ?? ''; if (prec !== undefined) s = s.slice(0, +prec); break;
        case 'b': { const e = escapes(v ?? ''); s = e.text; if (e.stop) stop = true; break; }
        case 'c': s = (v ?? '').slice(0, 1); break;
        case 'd': case 'i': case 'u': { const n = Math.trunc(toNum(v, true)); s = (n >= 0 && flags.includes('+') ? '+' : '') + String(n); break; }
        case 'o': s = Math.trunc(toNum(v, true)).toString(8); break;
        case 'x': s = Math.trunc(toNum(v, true)).toString(16); break;
        case 'X': s = Math.trunc(toNum(v, true)).toString(16).toUpperCase(); break;
        case 'f': s = toNum(v, false).toFixed(prec !== undefined ? +prec : 6); break;
        case 'e': case 'E': s = toNum(v, false).toExponential(prec !== undefined ? +prec : 6).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') s = s.toUpperCase(); break;
        default: s = String(Number(toNum(v, false).toPrecision(prec !== undefined ? +prec || 1 : 6)));
      }
      out += pad(s, flags, w);
    }
    if (stop) break;
    if (ai === startAi) break; // the format used no arguments: print once
  } while (ai < args.length);
  return out;
}
