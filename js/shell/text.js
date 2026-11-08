// Text tools: grep, sort, uniq, cut, tr, sed, awk, tee, diff, rev. Each is (c: Ctx, args) -> exit status.
import { cmp } from './fs.js';
import { ShellError, getopt, linesOf, joinLines, printf, qname } from './util.js';
import { diffOps } from '../git.js';

/* ------------------------------------------------------------------ POSIX regex -> JS */
const CLASSES = { alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: '\\s', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f' };
// Translate a BRE (default for grep/sed) or ERE (-E) pattern into a JS RegExp source.
export function posixRe(pat, ere = false) {
  let out = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\' && i + 1 < pat.length) {
      const n = pat[++i];
      if (!ere && '(){}+?|'.includes(n)) { out += n; continue; }
      if (/[1-9]/.test(n)) { out += '\\' + n; continue; }
      if ('wWsSbB'.includes(n)) { out += '\\' + n; continue; }
      if (n === '<' || n === '>') { out += '\\b'; continue; }
      if (n === 'n') { out += '\\n'; continue; }
      if (n === 't') { out += '\\t'; continue; }
      out += n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      continue;
    }
    if (c === '[') {
      let j = i + 1, body = '';
      if (pat[j] === '^') { body += '^'; j++; }
      if (pat[j] === ']') { body += '\\]'; j++; }
      let closed = false;
      for (; j < pat.length; j++) {
        if (pat[j] === ']') { closed = true; break; }
        if (pat[j] === '[' && pat[j + 1] === ':') {
          const e = pat.indexOf(':]', j);
          const cls = e > 0 && CLASSES[pat.slice(j + 2, e)];
          if (cls) { body += cls; j = e + 1; continue; }
        }
        body += pat[j] === '\\' || pat[j] === '[' ? '\\' + pat[j] : pat[j];
      }
      if (!closed) throw new ShellError('Unmatched [, [^, [:, [., or [=', 2);
      out += '[' + body + ']';
      i = j;
      continue;
    }
    if (!ere && '(){}+?|'.includes(c)) { out += '\\' + c; continue; }
    if (c === '*' && (!ere && (out === '' || out.endsWith('(') || out === '^'))) { out += '\\*'; continue; }
    if (c === '/') { out += '\\/'; continue; }
    out += c;
  }
  return out;
}
export function makeRe(pat, { ere = false, fixed = false, icase = false, word = false, line = false, global = false } = {}) {
  let src = fixed ? pat.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') : posixRe(pat, ere);
  if (word) src = `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])`;
  if (line) src = `^(?:${src})$`;
  try { return new RegExp(src, (icase ? 'i' : '') + (global ? 'g' : '')); }
  catch { throw new ShellError(`Invalid regular expression: ${pat}`, 2); }
}

/* ------------------------------------------------------------------ grep */
function grep(c, args) {
  const { o, rest, last } = getopt('grep', args, {
    flags: 'ivncrRlLwxohHqsEFG', vals: 'em', code: 2,
    long: { 'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', recursive: 'r', 'files-with-matches': 'l', 'files-without-match': 'L', 'word-regexp': 'w', 'line-regexp': 'x', 'only-matching': 'o', quiet: 'q', silent: 'q', 'extended-regexp': 'E', 'fixed-strings': 'F', regexp: 'e', 'no-filename': 'h', 'with-filename': 'H', 'max-count': 'm' },
  });
  let pats = o.e ? o.e : null;
  const ops = [...rest];
  if (!pats) {
    if (!ops.length) throw new ShellError('Usage: grep [OPTION]... PATTERNS [FILE]...\nTry \'grep --help\' for more information.', 2, { raw: true });
    pats = [ops.shift()];
  }
  pats = pats.flatMap((p) => p.split('\n'));
  const res = pats.map((p) => makeRe(p, { ere: o.E, fixed: o.F, icase: o.i, word: o.w, line: o.x, global: true }));
  const recursive = o.r || o.R;
  const fs = c.fs;
  // collect inputs as {name, text}
  const inputs = [];
  if (!ops.length) {
    if (recursive) ops.push('.');
    else inputs.push({ name: '(standard input)', text: c.stdin() });
  }
  let errors = false;
  for (const f of ops) {
    if (f === '-') { inputs.push({ name: '(standard input)', text: c.stdin() }); continue; }
    const abs = c.abs(f);
    let n;
    try { n = fs.stat(abs); } catch (e) { if (!o.s) c.err(`${f}: ${e.message}`, 2); errors = true; continue; }
    if (n.type === 'dir') {
      if (!recursive) { if (!o.s) c.err(`${f}: Is a directory`, 0); continue; }
      for (const p of fs.descendants(abs)) {
        const node = fs.nodes[p];
        if (node.type !== 'file') continue;
        const shown = (f === '.' && ops.length === 1 && !args.includes('.') ? '' : f.replace(/\/+$/, '') + '/') + p.slice(abs.length + 1);
        try { inputs.push({ name: shown, text: fs.read(p), binary: !!node.bin }); } catch (e) { c.err(`${shown}: ${e.message}`, 0); errors = true; }
      }
      continue;
    }
    try { inputs.push({ name: f, text: fs.read(abs), binary: !!n.bin }); } catch (e) { c.err(`${f}: ${e.message}`, 0); errors = true; }
  }
  const showName = o.H || (!o.h && (inputs.length > 1 || recursive));
  const max = o.m ? +last('m') : Infinity;
  let any = false;
  for (const inp of inputs) {
    let count = 0;
    const out = [];
    if (inp.binary) { if (res.some((r) => r.test(''))) { any = true; if (!o.q) c.line(`grep: ${inp.name}: binary file matches`); } continue; }
    linesOf(inp.text).forEach((line, idx) => {
      if (count >= max) return;
      const hit = res.some((r) => { r.lastIndex = 0; return r.test(line); });
      if (hit === !!o.v) return;
      count++;
      if (o.c || o.l || o.L || o.q) return;
      const pre = (showName ? inp.name + ':' : '') + (o.n ? idx + 1 + ':' : '');
      if (o.o && !o.v) {
        for (const r of res) { r.lastIndex = 0; for (const m of line.matchAll(r)) if (m[0]) out.push(pre + m[0]); }
      } else out.push(pre + line);
    });
    if (count) any = true;
    if (o.q) { if (any) return 0; continue; }
    if (o.l) { if (count) c.line(inp.name); continue; }
    if (o.L) { if (!count) c.line(inp.name); continue; }
    if (o.c) { c.line((showName ? inp.name + ':' : '') + count); continue; }
    c.lines(out);
  }
  if (errors && !(o.q && any)) return 2;
  return any ? 0 : 1;
}

/* ------------------------------------------------------------------ sort, uniq, cut, tr, rev, tee */
function fieldsOf(line, sep) {
  if (sep !== undefined) return line.split(sep);
  // default: fields begin at the blank before them (leading blanks belong to the field)
  return line.match(/\s*\S+/g) || [''];
}
function sortCmd(c, args) {
  const { o, rest, last } = getopt('sort', args, { flags: 'rnufbhV', vals: 'ktoT', long: { reverse: 'r', 'numeric-sort': 'n', unique: 'u', 'ignore-case': 'f', key: 'k', 'field-separator': 't', output: 'o' } });
  const sep = o.t ? last('t') : undefined;
  let lines = c.inputs(rest, { what: (f, e) => `cannot read: ${qname(f)}: ${e.message}` }).flatMap((x) => linesOf(x.text));
  if (c.status) return 2;
  const keys = (o.k || []).map((k) => {
    const m = k.match(/^(\d+)(?:\.\d+)?([a-zA-Z]*)(?:,(\d+)(?:\.\d+)?([a-zA-Z]*))?$/);
    if (!m) throw new ShellError(`invalid number at field start: invalid count at start of '${k}'`, 2);
    const flags = m[2] + (m[4] || '');
    return { from: +m[1], to: m[3] ? +m[3] : null, n: flags.includes('n') || o.n, r: flags.includes('r'), f: flags.includes('f') || o.f };
  });
  const num = (s) => { const m = s.trim().match(/^[-+]?\d*\.?\d+/); return m ? parseFloat(m[0]) : 0; };
  const keyOf = (line, k) => {
    const f = fieldsOf(line, sep);
    const part = f.slice(k.from - 1, k.to ?? f.length).join(sep ?? '');
    return sep === undefined ? part.trim() : part;
  };
  const compareBy = (a, b, n, f) => {
    if (n) return num(a) - num(b);
    if (f) { a = a.toUpperCase(); b = b.toUpperCase(); }
    return cmp(a, b);
  };
  const compare = (a, b) => {
    for (const k of keys) { const d = compareBy(keyOf(a, k), keyOf(b, k), k.n, k.f); if (d) return k.r ? -d : d; }
    if (!keys.length) { const d = compareBy(a, b, o.n, o.f); if (d) return d; if (o.u && (o.n || o.f)) return 0; }
    if (o.u && keys.length) return 0;
    return cmp(a, b);
  };
  lines.sort(compare);
  if (o.r) lines.reverse();
  if (o.u) lines = lines.filter((l, i) => i === 0 || compare(lines[i - 1], l) !== 0);
  if (o.o) { c.fs.write(c.abs(last('o')), joinLines(lines)); return 0; }
  c.lines(lines);
}
function uniq(c, args) {
  const { o, rest } = getopt('uniq', args, { flags: 'cdui', long: { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i' } });
  const text = c.inputs(rest.slice(0, 1)).map((x) => x.text).join('');
  const groups = [];
  for (const l of linesOf(text)) {
    const g = groups[groups.length - 1];
    if (g && (o.i ? g.line.toLowerCase() === l.toLowerCase() : g.line === l)) g.n++;
    else groups.push({ line: l, n: 1 });
  }
  const out = groups.filter((g) => (o.d ? g.n > 1 : o.u ? g.n === 1 : true)).map((g) => (o.c ? `${String(g.n).padStart(7)} ${g.line}` : g.line));
  if (rest[1]) c.fs.write(c.abs(rest[1]), joinLines(out)); else c.lines(out);
}
function parseList(spec) {
  const ranges = [];
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d*)(-?)(\d*)$/);
    if (!m || (!m[1] && !m[3]) || part === '-') throw new ShellError(`invalid field range\nTry 'cut --help' for more information.`);
    const a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : Infinity) : a;
    if (a < 1) throw new ShellError('fields and positions are numbered from 1\nTry \'cut --help\' for more information.');
    ranges.push([a, b]);
  }
  return (i) => ranges.some(([a, b]) => i >= a && i <= b);
}
function cut(c, args) {
  const { o, rest, last } = getopt('cut', args, { flags: 's', vals: 'dfcb', long: { delimiter: 'd', fields: 'f', characters: 'c', bytes: 'b', 'only-delimited': 's' } });
  if (!o.f && !o.c && !o.b) throw new ShellError('you must specify a list of bytes, characters, or fields\nTry \'cut --help\' for more information.');
  const d = o.d ? last('d') : '\t';
  if (d.length !== 1) throw new ShellError('the delimiter must be a single character\nTry \'cut --help\' for more information.');
  const pick = parseList(last('f') ?? last('c') ?? last('b'));
  const out = [];
  for (const l of c.inputs(rest).flatMap((x) => linesOf(x.text))) {
    if (o.f) {
      if (!l.includes(d)) { if (!o.s) out.push(l); continue; }
      out.push(l.split(d).filter((_, i) => pick(i + 1)).join(d));
    } else out.push([...l].filter((_, i) => pick(i + 1)).join(''));
  }
  c.lines(out);
}
const TR_CLASSES = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', space: ' \t\n\r\f\v', blank: ' \t' };
TR_CLASSES.alpha = TR_CLASSES.lower + TR_CLASSES.upper;
TR_CLASSES.alnum = TR_CLASSES.alpha + TR_CLASSES.digit;
TR_CLASSES.punct = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
function trSet(s) {
  const chars = [];
  const esc = { n: '\n', t: '\t', r: '\r', '\\': '\\' };
  const list = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { list.push(esc[s[i + 1]] ?? s[i + 1]); i++; continue; }
    if (s[i] === '[' && s[i + 1] === ':') { const e = s.indexOf(':]', i); const cls = TR_CLASSES[s.slice(i + 2, e)]; if (e > 0 && cls) { list.push({ cls }); i = e + 1; continue; } }
    list.push(s[i]);
  }
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if (typeof x === 'object') { chars.push(...x.cls); continue; }
    if (list[i + 1] === '-' && typeof list[i + 2] === 'string' && i + 2 < list.length) {
      for (let k = x.charCodeAt(0); k <= list[i + 2].charCodeAt(0); k++) chars.push(String.fromCharCode(k));
      i += 2; continue;
    }
    chars.push(x);
  }
  return chars;
}
function tr(c, args) {
  const { o, rest } = getopt('tr', args, { flags: 'dscC', long: { delete: 'd', 'squeeze-repeats': 's', complement: 'c' } });
  const need = o.d && !o.s ? 1 : o.s && !o.d && rest.length === 1 ? 1 : 2;
  if (rest.length < need) throw new ShellError(`missing operand${rest.length ? ` after '${rest[rest.length - 1]}'` : ''}\nTry 'tr --help' for more information.`);
  if (rest.length > need) throw new ShellError(`extra operand '${rest[need]}'\n${need === 2 ? '' : 'Only one string may be given when deleting without squeezing repeats.\n'}Try 'tr --help' for more information.`);
  const s1 = trSet(rest[0]), s2 = rest[1] !== undefined ? trSet(rest[1]) : [];
  const in1 = (ch) => (o.c || o.C ? !s1.includes(ch) : s1.includes(ch));
  let text = c.stdin();
  let out = '';
  for (const ch of text) {
    if (o.d) { if (!in1(ch)) out += ch; continue; }
    if (s2.length && !o.d) {
      const i = o.c || o.C ? (in1(ch) ? s2.length - 1 : -1) : s1.indexOf(ch);
      out += i >= 0 ? s2[Math.min(i, s2.length - 1)] : ch;
    } else out += ch;
  }
  if (o.s) {
    const sq = o.d || s2.length ? s2 : s1;
    let res = '';
    for (const ch of out) { if (res && res[res.length - 1] === ch && (sq.length ? sq.includes(ch) : in1(ch))) continue; res += ch; }
    out = res;
  }
  c.out(out);
}
function rev(c, args) { c.lines(c.inputs(args).flatMap((x) => linesOf(x.text)).map((l) => [...l].reverse().join(''))); }
function tee(c, args) {
  const { o, rest } = getopt('tee', args, { flags: 'a', long: { append: 'a' } });
  const text = c.stdin();
  for (const f of rest) {
    try { c.fs.write(c.abs(f), text, { append: !!o.a }); } catch (e) { c.err(`${f}: ${e.message}`); }
  }
  c.out(text);
}

/* ------------------------------------------------------------------ diff */
function diff(c, args) {
  const { o, rest } = getopt('diff', args, { flags: 'uqsiwB', long: { unified: 'u', brief: 'q' }, code: 2 });
  if (rest.length !== 2) throw new ShellError(rest.length < 2 ? `missing operand after '${rest[0] ?? 'diff'}'\ndiff: Try 'diff --help' for more information.` : `extra operand '${rest[2]}'\ndiff: Try 'diff --help' for more information.`, 2);
  const [a, b] = rest;
  const read = (f) => { try { return f === '-' ? c.stdin() : c.fs.read(c.abs(f)); } catch (e) { c.err(`${f}: ${e.message}`, 2); return null; } };
  let A = read(a), B = read(b);
  if (A === null || B === null) return 2;
  const normalize = (t) => (o.i ? t.toLowerCase() : t);
  if (normalize(A) === normalize(B)) { if (o.s) c.line(`Files ${a} and ${b} are identical`); return 0; }
  if (o.q) { c.line(`Files ${a} and ${b} differ`); return 1; }
  const la = linesOf(A), lb = linesOf(B);
  const ops = diffOps(o.i ? A.toLowerCase() : A, o.i ? B.toLowerCase() : B);
  // walk ops into hunks with positions in a and b
  const hunks = [];
  let ia = 0, ib = 0, cur = null;
  for (const op of ops) {
    if (op.t === ' ') { if (cur) { hunks.push(cur); cur = null; } ia++; ib++; continue; }
    cur ||= { a: ia, b: ib, del: [], add: [] };
    if (op.t === '-') { cur.del.push(la[ia]); ia++; } else { cur.add.push(lb[ib]); ib++; }
  }
  if (cur) hunks.push(cur);
  if (o.u) {
    c.line(`--- ${a}`); c.line(`+++ ${b}`);
    // one unified hunk per change group with 3 lines of context, merged when close
    const ctx = 3;
    const groups = [];
    for (const h of hunks) {
      const g = groups[groups.length - 1];
      if (g && h.a - (g.last.a + g.last.del.length) <= ctx * 2) { g.hs.push(h); g.last = h; } else groups.push({ hs: [h], last: h });
    }
    for (const g of groups) {
      const first = g.hs[0], lastH = g.last;
      const sa = Math.max(0, first.a - ctx), ea = Math.min(la.length, lastH.a + lastH.del.length + ctx);
      const sb = first.b - (first.a - sa), eb = lastH.b + lastH.add.length + (ea - (lastH.a + lastH.del.length));
      const range = (s, e) => `${e - s === 0 ? s : s + 1}${e - s === 1 ? '' : ',' + (e - s)}`;
      c.line(`@@ -${range(sa, ea)} +${range(sb, eb)} @@`);
      let pa = sa;
      for (const h of g.hs) {
        for (; pa < h.a; pa++) c.line(' ' + la[pa]);
        for (const l of h.del) c.line('-' + l);
        for (const l of h.add) c.line('+' + l);
        pa = h.a + h.del.length;
      }
      for (; pa < ea; pa++) c.line(' ' + la[pa]);
    }
    return 1;
  }
  const r = (s, n) => (n <= 1 ? String(s + 1) : `${s + 1},${s + n}`);
  for (const h of hunks) {
    if (h.del.length && h.add.length) c.line(`${r(h.a, h.del.length)}c${r(h.b, h.add.length)}`);
    else if (h.del.length) c.line(`${r(h.a, h.del.length)}d${h.b}`);
    else c.line(`${h.a}a${r(h.b, h.add.length)}`);
    for (const l of h.del) c.line('< ' + l);
    if (h.del.length && h.add.length) c.line('---');
    for (const l of h.add) c.line('> ' + l);
  }
  return 1;
}

/* ------------------------------------------------------------------ sed */
// Supported: s/re/rep/[gip N], d, p, q, =, a/i/c text, y/abc/xyz/; addresses N, $, /re/, ranges a,b; ! negation;
// -n, -i[SUFFIX], -E/-r, -e (repeatable). Commands are separated by ; or newlines.
function parseSed(script, ere) {
  const cmds = [];
  let i = 0;
  const s = script;
  const ws = () => { while (i < s.length && /[ \t]/.test(s[i])) i++; };
  const readDelim = (d) => {
    let out = '';
    while (i < s.length && s[i] !== d) {
      if (s[i] === '\\' && i + 1 < s.length) { out += s[i + 1] === d ? d : '\\' + s[i + 1]; i += 2; continue; }
      if (s[i] === '\n') break;
      out += s[i++];
    }
    if (s[i] !== d) throw new ShellError(`-e expression #1, char ${i + 1}: unterminated \`s' command`);
    i++;
    return out;
  };
  const addr = () => {
    if (/\d/.test(s[i])) { let n = ''; while (/\d/.test(s[i])) n += s[i++]; return { line: +n }; }
    if (s[i] === '$') { i++; return { last: true }; }
    if (s[i] === '/' || s[i] === '\\') { const d = s[i] === '\\' ? s[++i] : '/'; i++; const re = readDelim(d); return { re: makeRe(re, { ere }) }; }
    return null;
  };
  while (i < s.length) {
    ws();
    if (s[i] === ';' || s[i] === '\n') { i++; continue; }
    if (i >= s.length) break;
    const cmd = { a1: addr(), a2: null, neg: false };
    if (cmd.a1 && s[i] === ',') { i++; cmd.a2 = addr(); if (!cmd.a2) throw new ShellError(`-e expression #1, char ${i}: unexpected \`,'`); }
    ws();
    if (s[i] === '!') { cmd.neg = true; i++; ws(); }
    const op = s[i++];
    cmd.op = op;
    if (op === 's') {
      const d = s[i++];
      const re = readDelim(d), rep = readDelim(d);
      let flags = '';
      while (i < s.length && /[gipI0-9]/.test(s[i])) flags += s[i++];
      cmd.re = makeRe(re, { ere, icase: /[iI]/.test(flags), global: true });
      cmd.rep = rep; cmd.g = flags.includes('g'); cmd.p = flags.includes('p');
      const nth = flags.match(/\d+/); cmd.nth = nth ? +nth[0] : 1;
    } else if (op === 'y') {
      const d = s[i++];
      const a = readDelim(d), b = readDelim(d);
      if ([...a].length !== [...b].length) throw new ShellError('strings for `y\' command are different lengths');
      cmd.from = [...a]; cmd.to = [...b];
    } else if (op === 'a' || op === 'i' || op === 'c') {
      if (s[i] === '\\') i++;
      if (s[i] === '\n') i++;
      ws();
      let t = '';
      while (i < s.length && s[i] !== '\n') t += s[i++];
      cmd.text = t;
    } else if (op === 'q' || op === 'Q') {
      ws(); let n = ''; while (/\d/.test(s[i] || '')) n += s[i++]; cmd.code = n ? +n : 0;
    } else if (!['d', 'p', '=', 'D', 'P'].includes(op)) {
      throw new ShellError(`-e expression #1, char ${i}: unknown command: \`${op ?? ''}'`);
    }
    cmds.push(cmd);
  }
  return cmds;
}
function sedReplace(line, cmd) {
  let n = 0;
  return line.replace(cmd.re, (...m) => {
    const groups = m.slice(0, -2).filter((x) => typeof x === 'string' || x === undefined);
    n++;
    if (!cmd.g && n !== cmd.nth) return m[0];
    if (cmd.g && n < cmd.nth) return m[0];
    let out = '';
    for (let i = 0; i < cmd.rep.length; i++) {
      const ch = cmd.rep[i];
      if (ch === '\\' && i + 1 < cmd.rep.length) {
        const nx = cmd.rep[++i];
        if (/\d/.test(nx)) out += groups[+nx] ?? '';
        else if (nx === 'n') out += '\n';
        else if (nx === 't') out += '\t';
        else out += nx;
        continue;
      }
      out += ch === '&' ? m[0] : ch;
    }
    return out;
  });
}
function runSed(cmds, text, quiet) {
  const lines = linesOf(text);
  const out = [];
  const active = cmds.map(() => false);
  let code = null;
  const matches = (a, line, idx) => (a.line !== undefined ? idx + 1 === a.line : a.last ? idx === lines.length - 1 : a.re.test(line));
  for (let idx = 0; idx < lines.length && code === null; idx++) {
    let ps = lines[idx];
    let deleted = false;
    const before = [], after = [];
    for (let k = 0; k < cmds.length; k++) {
      const cmd = cmds[k];
      let sel = true;
      if (cmd.a1) {
        if (!cmd.a2) sel = matches(cmd.a1, ps, idx);
        else if (active[k]) {
          sel = true;
          if (cmd.a2.line !== undefined ? idx + 1 >= cmd.a2.line : matches(cmd.a2, ps, idx)) active[k] = false;
        } else if (matches(cmd.a1, ps, idx)) {
          sel = true;
          active[k] = !(cmd.a2.line !== undefined && cmd.a2.line <= idx + 1);
        } else sel = false;
      }
      if (cmd.neg) sel = !sel;
      if (!sel) continue;
      switch (cmd.op) {
        case 's': { const r = sedReplace(ps, cmd); cmd.re.lastIndex = 0; const changed = r !== ps || cmd.re.test(ps); cmd.re.lastIndex = 0; ps = r; if (cmd.p && changed) out.push(ps); break; }
        case 'y': ps = [...ps].map((ch) => { const i = cmd.from.indexOf(ch); return i >= 0 ? cmd.to[i] : ch; }).join(''); break;
        case 'd': case 'D': deleted = true; break;
        case 'p': case 'P': out.push(ps); break;
        case '=': out.push(String(idx + 1)); break;
        case 'a': after.push(cmd.text); break;
        case 'i': before.push(cmd.text); break;
        case 'c': if (!cmd.a2 || !active[k]) out.push(...before.splice(0), cmd.text); deleted = true; break;
        case 'q': code = cmd.code; break;
        case 'Q': code = cmd.code; deleted = true; quiet = true; break;
      }
      if (deleted) break;
    }
    out.push(...before);
    if (!deleted && !quiet) out.push(ps);
    out.push(...after);
  }
  return { text: joinLines(out), code: code ?? 0 };
}
function sed(c, args) {
  const { o, rest, last } = getopt('sed', args.map((a) => (a.startsWith('-i') && a.length > 2 ? '-I' + a.slice(2) : a)), { flags: 'nErsi', vals: 'eI', long: { quiet: 'n', silent: 'n', 'in-place': 'i', expression: 'e', 'regexp-extended': 'E' } });
  const ops = [...rest];
  let script;
  if (o.e) script = o.e.join('\n');
  else {
    if (!ops.length) throw new ShellError('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...', 1, { raw: true });
    script = ops.shift();
  }
  const cmds = parseSed(script, o.E || o.r);
  const inPlace = o.i || o.I;
  if (inPlace) {
    if (!ops.length) throw new ShellError('no input files');
    let code = 0;
    for (const f of ops) {
      const abs = c.abs(f);
      let text;
      try { text = c.fs.read(abs); } catch (e) { c.err(`can't read ${f}: ${e.message}`, 2); code = 2; continue; }
      const r = runSed(cmds, text, o.n);
      if (o.I) c.fs.write(abs + last('I'), text);
      c.fs.write(abs, r.text);
    }
    return code;
  }
  const chunks = c.inputs(ops, { what: (f, e) => `can't read ${f}: ${e.message}` });
  const r = runSed(cmds, chunks.map((x) => x.text).join(''), o.n);
  c.out(r.text);
  return c.status ? 2 : r.code;
}

/* ------------------------------------------------------------------ awk (a teaching subset) */
// Programs: pattern { action } items; patterns BEGIN, END, /re/, expressions (NR==2, $3 > 10, $1 ~ /x/), ranges no.
// Actions: print [expr, …] [> file], printf fmt, args; assignment (= += -= *= /= ++ --); if/else; next; { … } blocks.
// Expressions: numbers, "strings", $N $NF $(expr), variables (NR NF FS OFS + your own), + - * / %, string
// concatenation, comparisons, ~ !~, && || !, ( ), length() toupper() tolower() substr() int(). No arrays or loops.
function awkLex(src) {
  const toks = [];
  let i = 0;
  let prevValue = false; // a '/' after a value is division, otherwise a regex
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '\n' || ch === ';') { toks.push({ t: ';' }); i++; prevValue = false; continue; }
    if (ch === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '"') {
      let s = ''; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { const n = src[++i]; s += { n: '\n', t: '\t', '"': '"', '\\': '\\', '/': '/' }[n] ?? '\\' + n; i++; continue; }
        s += src[i++];
      }
      if (src[i] !== '"') throw new ShellError('awk: non-terminated string', 2, { raw: true });
      i++; toks.push({ t: 'str', v: s }); prevValue = true; continue;
    }
    if (ch === '/' && !prevValue) {
      let s = ''; i++;
      while (i < src.length && src[i] !== '/') { if (src[i] === '\\' && src[i + 1] === '/') { s += '/'; i += 2; continue; } s += src[i++]; }
      i++; toks.push({ t: 're', v: s }); prevValue = true; continue;
    }
    const num = src.slice(i).match(/^\d+(\.\d+)?/);
    if (num) { toks.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; prevValue = true; continue; }
    const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) { toks.push({ t: 'id', v: id[0] }); i += id[0].length; prevValue = !['print', 'printf', 'if', 'else', 'next', 'BEGIN', 'END'].includes(id[0]); continue; }
    const op = src.slice(i).match(/^(\+\+|--|\+=|-=|\*=|\/=|%=|==|!=|<=|>=|&&|\|\||!~|>>|[-+*/%<>=!~(){},$?:])/);
    if (op) { toks.push({ t: 'op', v: op[0] }); i += op[0].length; prevValue = op[0] === ')' || op[0] === '++' || op[0] === '--' ? true : false; if (op[0] === '$') prevValue = false; continue; }
    throw new ShellError(`awk: syntax error at source line 1: unexpected character '${ch}'`, 2, { raw: true });
  }
  toks.push({ t: 'eof' });
  return toks;
}
function awkParse(src) {
  const toks = awkLex(src);
  let p = 0;
  const peek = () => toks[p];
  const is = (t, v) => toks[p].t === t && (v === undefined || toks[p].v === v);
  const eat = (t, v) => { if (!is(t, v)) throw new ShellError(`awk: syntax error at source line 1 near ${toks[p].v ?? toks[p].t}`, 2, { raw: true }); return toks[p++]; };
  const skipSemi = () => { while (is(';')) p++; };
  const items = [];
  // expressions (precedence climbing)
  function expr() { return ternary(); }
  function ternary() { const c = or(); if (is('op', '?')) { p++; const a = ternary(); eat('op', ':'); const b = ternary(); return { k: '?:', c, a, b }; } return c; }
  function or() { let a = and(); while (is('op', '||')) { p++; a = { k: '||', a, b: and() }; } return a; }
  function and() { let a = match(); while (is('op', '&&')) { p++; a = { k: '&&', a, b: match() }; } return a; }
  function match() { let a = rel(); while (is('op', '~') || is('op', '!~')) { const op = toks[p++].v; a = { k: op, a, b: rel() }; } return a; }
  function rel() { let a = concat(); while (['<', '<=', '>', '>=', '==', '!='].some((o) => is('op', o))) { const op = toks[p++].v; a = { k: 'cmp', op, a, b: concat() }; } return a; }
  function concat() {
    let a = add();
    while (is('num') || is('str') || is('id') || is('op', '$') || is('op', '(') || is('op', '!') || (is('op', '-') && false)) {
      if (is('id') && ['in'].includes(peek().v)) break;
      a = { k: 'cat', a, b: add() };
    }
    return a;
  }
  function add() { let a = mul(); while (is('op', '+') || is('op', '-')) { const op = toks[p++].v; a = { k: 'bin', op, a, b: mul() }; } return a; }
  function mul() { let a = unary(); while (is('op', '*') || is('op', '/') || is('op', '%')) { const op = toks[p++].v; a = { k: 'bin', op, a, b: unary() }; } return a; }
  function unary() {
    if (is('op', '!')) { p++; return { k: '!', a: unary() }; }
    if (is('op', '-')) { p++; return { k: 'neg', a: unary() }; }
    if (is('op', '+')) { p++; return unary(); }
    if (is('op', '++') || is('op', '--')) { const op = toks[p++].v; return { k: 'pre', op, ref: lvalue() }; }
    return postfix();
  }
  function lvalue() {
    if (is('op', '$')) { p++; return { k: 'field', i: primaryNoPost() }; }
    return { k: 'var', name: eat('id').v };
  }
  function postfix() {
    const a = primary();
    if ((a.k === 'var' || a.k === 'field') && (is('op', '++') || is('op', '--'))) { const op = toks[p++].v; return { k: 'post', op, ref: a }; }
    if ((a.k === 'var' || a.k === 'field') && ['=', '+=', '-=', '*=', '/=', '%='].some((o) => is('op', o))) { const op = toks[p++].v; return { k: 'assign', op, ref: a, v: ternary() }; }
    return a;
  }
  function primaryNoPost() {
    if (is('num')) return { k: 'num', v: toks[p++].v };
    if (is('op', '(')) { p++; const e = expr(); eat('op', ')'); return e; }
    if (is('id')) return { k: 'var', name: toks[p++].v };
    if (is('op', '$')) { p++; return { k: 'field', i: primaryNoPost() }; }
    throw new ShellError(`awk: syntax error at source line 1 near ${peek().v ?? peek().t}`, 2, { raw: true });
  }
  function primary() {
    const t = peek();
    if (t.t === 'num') { p++; return { k: 'num', v: t.v }; }
    if (t.t === 'str') { p++; return { k: 'str', v: t.v }; }
    if (t.t === 're') { p++; return { k: 're', v: t.v }; }
    if (is('op', '$')) { p++; return { k: 'field', i: primaryNoPost() }; }
    if (is('op', '(')) { p++; const e = expr(); eat('op', ')'); return e; }
    if (t.t === 'id') {
      p++;
      if (['length', 'toupper', 'tolower', 'substr', 'int', 'index', 'sprintf'].includes(t.v)) {
        const args = [];
        if (is('op', '(')) { p++; if (!is('op', ')')) { args.push(expr()); while (is('op', ',')) { p++; args.push(expr()); } } eat('op', ')'); }
        return { k: 'call', name: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    throw new ShellError(`awk: syntax error at source line 1 near ${t.v ?? t.t}`, 2, { raw: true });
  }
  function exprList() {
    const out = [];
    if (is(';') || is('op', '}') || is('eof') || is('op', '>') || is('op', '>>')) return out;
    // print (a, b) form
    out.push(noGt());
    while (is('op', ',')) { p++; out.push(noGt()); }
    return out;
  }
  // in print arguments a bare '>' is output redirection, not a comparison
  function noGt() {
    let a = concat();
    while (['<', '<=', '>=', '==', '!='].some((o) => is('op', o))) { const op = toks[p++].v; a = { k: 'cmp', op, a, b: concat() }; }
    while (is('op', '~') || is('op', '!~')) { const op = toks[p++].v; a = { k: op, a, b: concat() }; }
    while (is('op', '&&')) { p++; a = { k: '&&', a, b: concat() }; }
    while (is('op', '||')) { p++; a = { k: '||', a, b: concat() }; }
    return a;
  }
  function stmt() {
    skipSemi();
    if (is('op', '{')) return block();
    if (is('id', 'print') || is('id', 'printf')) {
      const kind = toks[p++].v;
      let args;
      if (is('op', '(')) { const save = p; p++; try { args = exprList(); eat('op', ')'); if (!(is(';') || is('op', '}') || is('eof') || is('op', '>') || is('op', '>>'))) throw new Error('not a list'); } catch { p = save; args = exprList(); } }
      else args = exprList();
      let redir = null;
      if (is('op', '>') || is('op', '>>')) { const op = toks[p++].v; redir = { op, file: primary() }; }
      return { k: kind, args, redir };
    }
    if (is('id', 'next')) { p++; return { k: 'next' }; }
    if (is('id', 'exit')) { p++; const v = is(';') || is('op', '}') || is('eof') ? null : expr(); return { k: 'exit', v }; }
    if (is('id', 'if')) {
      p++; eat('op', '('); const c = expr(); eat('op', ')');
      const a = stmt(); skipSemi();
      let b = null;
      if (is('id', 'else')) { p++; b = stmt(); }
      return { k: 'if', c, a, b };
    }
    return { k: 'expr', e: expr() };
  }
  function block() {
    eat('op', '{');
    const body = [];
    skipSemi();
    while (!is('op', '}')) { if (is('eof')) eat('op', '}'); body.push(stmt()); skipSemi(); }
    p++;
    return { k: 'block', body };
  }
  skipSemi();
  while (!is('eof')) {
    let pattern = null;
    if (is('id', 'BEGIN') || is('id', 'END')) pattern = toks[p++].v;
    else if (!is('op', '{')) pattern = expr();
    const action = is('op', '{') ? block() : null;
    items.push({ pattern, action });
    skipSemi();
  }
  return items;
}
function awk(c, args) {
  let i = 0, fs = ' ';
  const vars = { OFS: ' ', ORS: '\n', NR: 0, NF: 0, FS: ' ' };
  let prog = null;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { i++; break; }
    if (a.startsWith('-F')) { fs = a.length > 2 ? a.slice(2) : args[++i]; if (fs === 't' || fs === '\\t') fs = '\t'; continue; }
    if (a === '-v') { const [k, ...v] = (args[++i] || '').split('='); vars[k] = v.join('='); continue; }
    if (a.startsWith('-') && a.length > 1) throw new ShellError(`awk: not an option: ${a}`, 2, { raw: true });
    break;
  }
  if (i >= args.length) throw new ShellError('usage: awk [-F fs][-v var=value][prog | -f progfile][file ...]', 2, { raw: true });
  prog = args[i++];
  vars.FS = fs;
  const items = awkParse(prog);
  const files = args.slice(i).filter((a) => !/^[A-Za-z_]\w*=/.test(a));
  let fields = [''];
  let exitCode = null;
  const outputs = {};
  const toNum = (v) => (typeof v === 'number' ? v : (() => { const m = String(v).trim().match(/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/); return m ? parseFloat(m[0]) : 0; })());
  const toStr = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)))) : String(v ?? ''));
  const looksNum = (v) => typeof v === 'number' || /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(String(v));
  const split = (line) => {
    const f = vars.FS === ' ' ? line.trim().split(/[ \t\n]+/).filter(Boolean) : vars.FS.length === 1 ? line.split(vars.FS) : line.split(new RegExp(vars.FS));
    return f.length === 1 && f[0] === '' ? [] : f;
  };
  const setRecord = (line) => { const f = split(line); fields = [line, ...f]; vars.NF = f.length; };
  const getField = (n) => { n = Math.trunc(toNum(n)); return n < 0 ? '' : fields[n] ?? ''; };
  const setField = (n, v) => {
    n = Math.trunc(toNum(n));
    if (n === 0) { setRecord(toStr(v)); return; }
    while (fields.length <= n) fields.push('');
    fields[n] = toStr(v);
    vars.NF = fields.length - 1;
    fields[0] = fields.slice(1).join(toStr(vars.OFS));
  };
  const get = (ref) => (ref.k === 'field' ? getField(ev(ref.i)) : ref.name === 'NF' ? vars.NF : vars[ref.name] ?? '');
  const set = (ref, v) => { if (ref.k === 'field') setField(ev(ref.i), v); else if (ref.name === 'NF') { vars.NF = toNum(v); fields = fields.slice(0, vars.NF + 1); fields[0] = fields.slice(1).join(toStr(vars.OFS)); } else vars[ref.name] = v; return v; };
  const reOf = (x) => makeRe(x.k === 're' ? x.v : toStr(ev(x)), { ere: true });
  function ev(e) {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 're': return makeRe(e.v, { ere: true }).test(fields[0]) ? 1 : 0;
      case 'field': return getField(ev(e.i));
      case 'var': return get(e);
      case 'cat': return toStr(ev(e.a)) + toStr(ev(e.b));
      case 'bin': {
        const a = toNum(ev(e.a)), b = toNum(ev(e.b));
        if ((e.op === '/' || e.op === '%') && b === 0) throw new ShellError('awk: division by zero', 2, { raw: true });
        return e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : e.op === '/' ? a / b : a % b;
      }
      case 'neg': return -toNum(ev(e.a));
      case '!': return truthy(ev(e.a)) ? 0 : 1;
      case '&&': return truthy(ev(e.a)) && truthy(ev(e.b)) ? 1 : 0;
      case '||': return truthy(ev(e.a)) || truthy(ev(e.b)) ? 1 : 0;
      case '~': return reOf(e.b).test(toStr(ev(e.a))) ? 1 : 0;
      case '!~': return reOf(e.b).test(toStr(ev(e.a))) ? 0 : 1;
      case '?:': return truthy(ev(e.c)) ? ev(e.a) : ev(e.b);
      case 'cmp': {
        const a = ev(e.a), b = ev(e.b);
        const numeric = looksNum(a) && looksNum(b);
        const x = numeric ? toNum(a) : toStr(a), y = numeric ? toNum(b) : toStr(b);
        const r = { '<': x < y, '<=': x <= y, '>': x > y, '>=': x >= y, '==': x === y, '!=': x !== y }[e.op];
        return r ? 1 : 0;
      }
      case 'assign': {
        if (e.op === '=') return set(e.ref, ev(e.v));
        const a = toNum(get(e.ref)), b = toNum(ev(e.v));
        return set(e.ref, { '+=': a + b, '-=': a - b, '*=': a * b, '/=': a / b, '%=': a % b }[e.op]);
      }
      case 'pre': return set(e.ref, toNum(get(e.ref)) + (e.op === '++' ? 1 : -1));
      case 'post': { const v = toNum(get(e.ref)); set(e.ref, v + (e.op === '++' ? 1 : -1)); return v; }
      case 'call': {
        const a = e.args.map(ev);
        switch (e.name) {
          case 'length': return (e.args.length ? toStr(a[0]) : fields[0]).length;
          case 'toupper': return toStr(a[0]).toUpperCase();
          case 'tolower': return toStr(a[0]).toLowerCase();
          case 'int': return Math.trunc(toNum(a[0]));
          case 'index': return toStr(a[0]).indexOf(toStr(a[1])) + 1;
          case 'substr': { const s = toStr(a[0]); const st = Math.max(1, Math.round(toNum(a[1]))); return a.length > 2 ? s.substr(st - 1, Math.max(0, Math.round(toNum(a[2])) - Math.max(0, 1 - Math.round(toNum(a[1]))))) : s.slice(st - 1); }
          case 'sprintf': return printf(toStr(a[0]), a.slice(1).map(toStr));
        }
      }
    }
    return '';
  }
  const truthy = (v) => (typeof v === 'number' ? v !== 0 : looksNum(v) && String(v).trim() !== '' ? toNum(v) !== 0 : String(v) !== '');
  class Next {}
  class Exit {}
  const write = (text, redir) => {
    if (!redir) { c.out(text); return; }
    const f = toStr(ev(redir.file));
    const abs = c.abs(f);
    if (!(abs in outputs)) { outputs[abs] = true; c.fs.write(abs, '', { append: redir.op === '>>' }); }
    c.fs.write(abs, text, { append: true });
  };
  function exec(s) {
    switch (s.k) {
      case 'block': for (const x of s.body) exec(x); return;
      case 'print': write((s.args.length ? s.args.map((a) => toStr(ev(a))).join(toStr(vars.OFS)) : fields[0]) + toStr(vars.ORS), s.redir); return;
      case 'printf': { if (!s.args.length) return; const [f, ...rest] = s.args.map((a) => toStr(ev(a))); write(printf(f, rest), s.redir); return; }
      case 'next': throw new Next();
      case 'exit': exitCode = s.v ? Math.trunc(toNum(ev(s.v))) : 0; throw new Exit();
      case 'if': if (truthy(ev(s.c))) exec(s.a); else if (s.b) exec(s.b); return;
      case 'expr': ev(s.e); return;
    }
  }
  const runItems = (which) => {
    for (const it of items) {
      if (which === 'BEGIN' || which === 'END') { if (it.pattern === which) exec(it.action); continue; }
      if (it.pattern === 'BEGIN' || it.pattern === 'END') continue;
      const ok = it.pattern === null || (it.pattern.k === 're' ? makeRe(it.pattern.v, { ere: true }).test(fields[0]) : truthy(ev(it.pattern)));
      if (!ok) continue;
      if (it.action) exec(it.action); else c.out(fields[0] + toStr(vars.ORS));
    }
  };
  try {
    runItems('BEGIN');
    const hasMain = items.some((it) => it.pattern !== 'BEGIN');
    if (hasMain) {
      for (const a of args.slice(i)) if (/^[A-Za-z_]\w*=/.test(a)) { const [k, ...v] = a.split('='); vars[k] = v.join('='); }
      for (const inp of c.inputs(files, { what: (f, e) => `can't open file ${f}` })) {
        for (const line of linesOf(inp.text)) {
          vars.NR++;
          setRecord(line);
          try { runItems('main'); } catch (e) { if (!(e instanceof Next)) throw e; }
        }
      }
    }
  } catch (e) { if (!(e instanceof Exit)) throw e; }
  try { runItems('END'); } catch (e) { if (!(e instanceof Exit)) throw e; }
  return exitCode ?? (c.status ? 2 : 0);
}

export const TEXT_UTILS = { grep, egrep: (c, a) => grep(c, ['-E', ...a]), fgrep: (c, a) => grep(c, ['-F', ...a]), sort: sortCmd, uniq, cut, tr, rev, tee, diff, sed, awk };
