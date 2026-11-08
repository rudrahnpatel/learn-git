// Lexer + parser for the simulated shell (a teaching subset of bash).
// Source text -> tokens (words keep their quoting as parts) -> an AST of plain objects (JSON-safe, so functions
// defined by the learner survive serialisation). Expansion happens later, at run time (expand.js).
//
// Word parts:
//   { k: 'lit', v, q }            q: 0 unquoted, 1 single-quoted or backslash-escaped, 2 inside "…"
//   { k: 'tilde' }                a leading unquoted ~ (home)
//   { k: 'var', name, op?, arg?, q }   $NAME ${NAME} ${NAME:-arg} ${#NAME} ${NAME%pat} …
//   { k: 'cmd', src, q }          $(…) or `…`
//   { k: 'arith', src, q }        $((…))
// AST nodes:
//   list { items: [{ node, bg }] }   andor { first, rest: [{ op, node }] }   pipe { cmds, bang }
//   simple { assigns: [{ name, value, append }], words, redirs, line }
//   if { clauses: [{ cond, body }], else }   for { name, items|null, body }   while { cond, body, until }
//   group { body }   subshell { body }   func { name, body }       (compound nodes also carry redirs)
//   redir { op: '>' | '>>' | '<' | '>&' | '&>' | '&>>' | '<<<' | '<<', fd, target?: word, dup?: n, heredoc? }

export class SyntaxErr extends Error {
  constructor(msg, line) { super(msg); this.line = line; }
}

const RESERVED = new Set(['if', 'then', 'elif', 'else', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', '{', '}', '!', 'function', 'case', 'esac']);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const META = new Set([' ', '\t', '\n', '|', '&', ';', '<', '>', '(', ')']);

// Find the index of the ')' closing a '(' that was just passed (depth starts at 1), skipping quotes.
function matchParen(src, i, depth = 1) {
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === "'") { const e = src.indexOf("'", i + 1); if (e < 0) return -1; i = e; continue; }
    if (c === '"') {
      for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

// Parse a `$…` at src[i]. Returns [part, nextIndex] or null when the $ is literal.
function dollar(src, i, q) {
  const c = src[i + 1];
  if (c === '(' && src[i + 2] === '(') {
    const end = matchParen(src, i + 3, 2);
    if (end < 0 || src[end - 1] !== ')') throw new SyntaxErr('unexpected EOF while looking for matching `)\'');
    return [{ k: 'arith', src: src.slice(i + 3, end - 1), q }, end + 1];
  }
  if (c === '(') {
    const end = matchParen(src, i + 2);
    if (end < 0) throw new SyntaxErr('unexpected EOF while looking for matching `)\'');
    return [{ k: 'cmd', src: src.slice(i + 2, end), q }, end + 1];
  }
  if (c === '{') {
    let depth = 1, j = i + 2;
    for (; j < src.length; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    if (j >= src.length) throw new SyntaxErr('unexpected EOF while looking for matching `}\'');
    return [braceVar(src.slice(i + 2, j), q), j + 1];
  }
  if (c !== undefined && /[A-Za-z_]/.test(c)) {
    let j = i + 1;
    while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
    return [{ k: 'var', name: src.slice(i + 1, j), q }, j];
  }
  if (c !== undefined && /[0-9?#@*$!\-]/.test(c)) return [{ k: 'var', name: c, q }, i + 2];
  return null;
}
function braceVar(body, q) {
  if (body.startsWith('#') && body.length > 1) return { k: 'var', name: body.slice(1), op: 'len', q };
  const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?#@*$!])(.*)$/s);
  if (!m) throw new SyntaxErr(`\${${body}}: bad substitution`);
  const [, name, rest] = m;
  if (!rest) return { k: 'var', name, q };
  const op = rest.match(/^(:-|:=|:\+|:\?|-|=|\+|\?|%%|%|##|#|\/\/|\/|\^\^|\^|,,|,)/);
  if (!op) throw new SyntaxErr(`\${${body}}: bad substitution`);
  return { k: 'var', name, op: op[1], arg: rest.slice(op[1].length), q };
}

// Contents of "…" starting after the opening quote. heredoc: no closing quote, `"` is literal.
function doubleQuoted(src, i, parts, heredoc = false) {
  let lit = '';
  const flush = () => { if (lit) { parts.push({ k: 'lit', v: lit, q: 2 }); lit = ''; } };
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' && !heredoc) { flush(); return i + 1; }
    if (c === '\\' && i + 1 < src.length) {
      const n = src[i + 1];
      if (n === '\n') { i++; continue; }
      if (n === '$' || n === '`' || n === '\\' || (n === '"' && !heredoc)) { lit += n; i++; continue; }
      lit += c; continue;
    }
    if (c === '$') {
      const d = dollar(src, i, 2);
      if (d) { flush(); parts.push(d[0]); i = d[1] - 1; continue; }
    }
    if (c === '`') {
      const e = src.indexOf('`', i + 1);
      if (e < 0) throw new SyntaxErr('unexpected EOF while looking for matching ``\'');
      flush(); parts.push({ k: 'cmd', src: src.slice(i + 1, e), q: 2 }); i = e; continue;
    }
    lit += c;
  }
  if (heredoc) { flush(); return i; }
  throw new SyntaxErr('unexpected EOF while looking for matching `"\'');
}
// Parts for the body of an unquoted here-document (expansions on, quotes literal).
export function heredocParts(body) { const parts = []; doubleQuoted(body, 0, parts, true); return parts; }

// Parse a whole string as the parts of one word (used for ${x:-arg} arguments).
export function wordParts(text) {
  const t = lex(text, { oneWord: true });
  return t.length ? t[0].parts : [];
}

export function lex(src, opts = {}) {
  const at = { line: 1 };
  try { return lexer(src, opts, at); }
  catch (e) { if (e instanceof SyntaxErr && e.line == null) e.line = at.line; throw e; }
}
function lexer(src, { oneWord = false } = {}, at) {
  const toks = [];
  let i = 0, line = 1;
  const pending = []; // here-docs waiting for the next newline
  while (i < src.length) {
    const c = src[i];
    if (!oneWord) {
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
      if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '\n') {
        toks.push({ t: 'op', v: '\n', line }); i++; line++;
        for (const h of pending.splice(0)) {
          const lines = [];
          for (;;) {
            if (i >= src.length) throw new SyntaxErr(`here-document delimited by end-of-file (wanted \`${h.delim}')`, line);
            let e = src.indexOf('\n', i); if (e < 0) e = src.length;
            let l = src.slice(i, e);
            i = Math.min(e + 1, src.length); line++;
            if (h.strip) l = l.replace(/^\t+/, '');
            if (l === h.delim) break;
            lines.push(l);
          }
          h.tok.heredoc.body = lines.length ? lines.join('\n') + '\n' : '';
        }
        continue;
      }
      // redirections, with an optional fd number glued on the front (2>, 2>>, 2>&1)
      const r = src.slice(i).match(/^(\d*)(&>>|&>|>>|>&|>\||<<<|<<-|<<|<&|<|>)/);
      if (r && !(r[1] && (r[2] === '&>' || r[2] === '&>>'))) {
        let [all, fd, op] = r;
        i += all.length;
        if (op === '>|') op = '>';
        if (op === '>&' || op === '<&') {
          const m = src.slice(i).match(/^(\d+|-)/);
          if (m) { toks.push({ t: 'redir', op: '>&', fd: fd ? +fd : op === '<&' ? 0 : 1, dup: m[1], line }); i += m[1].length; continue; }
          if (op === '>&' && !fd) { toks.push({ t: 'redir', op: '&>', fd: 1, line }); continue; }
          throw new SyntaxErr(`syntax error near unexpected token \`${op}'`, line);
        }
        const tok = { t: 'redir', op, fd: fd ? +fd : op[0] === '<' ? 0 : 1, line };
        if (op === '<<' || op === '<<-') {
          while (src[i] === ' ' || src[i] === '\t') i++;
          let raw = '';
          while (i < src.length && !META.has(src[i])) raw += src[i++];
          if (!raw) throw new SyntaxErr('syntax error near unexpected token `newline\'', line);
          const quoted = /['"\\]/.test(raw);
          tok.op = '<<';
          tok.heredoc = { delim: raw.replace(/['"\\]/g, ''), quoted, body: '' };
          pending.push({ delim: tok.heredoc.delim, strip: op === '<<-', tok });
        }
        toks.push(tok);
        continue;
      }
      const two = src.slice(i, i + 2);
      if (two === '((') throw new SyntaxErr('(( )) is not supported in this sandbox; use $(( )) as in: i=$((i + 1))', line);
      if (two === '&&' || two === '||' || two === ';;') { toks.push({ t: 'op', v: two, line }); i += 2; continue; }
      if (c === '|' || c === '&' || c === ';' || c === '(' || c === ')') { toks.push({ t: 'op', v: c, line }); i++; continue; }
    }
    // a word
    at.line = line;
    const parts = [];
    let lit = '', litQ = 0;
    const add = (v, q) => { if (q !== litQ && lit) { parts.push({ k: 'lit', v: lit, q: litQ }); lit = ''; } litQ = q; lit += v; };
    const flush = () => { if (lit) { parts.push({ k: 'lit', v: lit, q: litQ }); lit = ''; } };
    const start = i;
    if (src[i] === '~' && (i + 1 >= src.length || src[i + 1] === '/' || META.has(src[i + 1]))) { parts.push({ k: 'tilde' }); i++; }
    while (i < src.length) {
      const ch = src[i];
      if (!oneWord && META.has(ch)) break;
      if (ch === '\\') {
        if (src[i + 1] === '\n') { i += 2; line++; continue; }
        if (i + 1 < src.length) { add(src[i + 1], 1); i += 2; continue; }
        add('\\', 0); i++; continue;
      }
      if (ch === "'") {
        const e = src.indexOf("'", i + 1);
        if (e < 0) throw new SyntaxErr('unexpected EOF while looking for matching `\'\'', line);
        flush(); litQ = 1;
        parts.push({ k: 'lit', v: src.slice(i + 1, e), q: 1 });
        line += (src.slice(i, e).match(/\n/g) || []).length;
        i = e + 1; continue;
      }
      if (ch === '"') {
        flush();
        const before = parts.length;
        const e = doubleQuoted(src, i + 1, parts);
        if (parts.length === before) parts.push({ k: 'lit', v: '', q: 2 });
        line += (src.slice(i, e).match(/\n/g) || []).length;
        i = e; continue;
      }
      if (ch === '$') {
        const d = dollar(src, i, 0);
        if (d) { flush(); parts.push(d[0]); i = d[1]; continue; }
      }
      if (ch === '`') {
        const e = src.indexOf('`', i + 1);
        if (e < 0) throw new SyntaxErr('unexpected EOF while looking for matching ``\'', line);
        flush(); parts.push({ k: 'cmd', src: src.slice(i + 1, e), q: 0 }); i = e + 1; continue;
      }
      add(ch, 0); i++;
    }
    flush();
    toks.push({ t: 'word', parts, raw: src.slice(start, i), line });
    if (oneWord) break;
  }
  if (pending.length) {
    // a here-doc on the last line with no newline after it: its body is empty, like bash warns
    for (const h of pending) h.tok.heredoc.body = '';
  }
  toks.push({ t: 'eof', line });
  return toks;
}

/* ------------------------------------------------------------------ parser */
const isWord = (t, v) => t.t === 'word' && t.parts.length === 1 && t.parts[0].k === 'lit' && t.parts[0].q === 0 && (v === undefined ? true : t.parts[0].v === v);
const reserved = (t) => isWord(t) && RESERVED.has(t.parts[0].v) ? t.parts[0].v : null;
const show = (t) => (t.t === 'eof' ? 'newline' : t.t === 'op' ? (t.v === '\n' ? 'newline' : t.v) : t.t === 'redir' ? t.op : t.raw);

export function parse(src) {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const open = []; // compound commands being parsed: [{ kw, line }]
  const fail = (t = peek()) => {
    const o = open[open.length - 1];
    if (t.t === 'eof') throw new SyntaxErr('syntax error: unexpected end of file' + (o ? ` from \`${o.kw}' command on line ${o.line}` : ''), t.line);
    throw new SyntaxErr(`syntax error near unexpected token \`${show(t)}'`, t.line);
  };
  const skipNl = () => { while (peek().t === 'op' && peek().v === '\n') p++; };
  const skipSep = () => { while (peek().t === 'op' && (peek().v === '\n' || peek().v === ';')) p++; };
  const expectWord = (v) => { const t = peek(); if (!isWord(t, v)) fail(t); p++; };

  function list(stops, { allowEmpty = false } = {}) {
    const items = [];
    skipNl();
    for (;;) {
      const t = peek();
      if (t.t === 'eof') break;
      if (t.t === 'op' && (t.v === ')' || t.v === ';;')) break;
      if (stops && reserved(t) && stops.has(reserved(t))) break;
      if (t.t === 'op' && t.v === ';') fail(t);
      const node = andor();
      const s = peek();
      let bg = false;
      if (s.t === 'op' && (s.v === ';' || s.v === '&' || s.v === '\n')) { bg = s.v === '&'; p++; skipNl(); items.push({ node, bg }); continue; }
      items.push({ node, bg });
      break;
    }
    if (!items.length && !allowEmpty) fail();
    return { type: 'list', items };
  }
  function andor() {
    const first = pipeline();
    const rest = [];
    while (peek().t === 'op' && (peek().v === '&&' || peek().v === '||')) {
      const op = next().v; skipNl();
      rest.push({ op, node: pipeline() });
    }
    return rest.length ? { type: 'andor', first, rest } : first;
  }
  function pipeline() {
    let bang = false;
    if (isWord(peek(), '!')) { p++; bang = true; }
    const cmds = [command()];
    while (peek().t === 'op' && peek().v === '|') { p++; skipNl(); cmds.push(command()); }
    return cmds.length === 1 && !bang ? cmds[0] : { type: 'pipe', cmds, bang };
  }
  function redirs() {
    const out = [];
    while (peek().t === 'redir') out.push(redir());
    return out;
  }
  function redir() {
    const t = next();
    const r = { op: t.op, fd: t.fd };
    if (t.dup !== undefined) r.dup = t.dup;
    else if (t.heredoc) r.heredoc = t.heredoc;
    else { const w = peek(); if (w.t !== 'word') fail(w); r.target = { parts: next().parts }; }
    return r;
  }
  function command() {
    const t = peek();
    const rw = reserved(t);
    let node;
    if (rw === 'if' || rw === 'for' || rw === 'while' || rw === 'until' || rw === '{') {
      open.push({ kw: rw, line: t.line });
      if (rw === 'if') node = ifCmd();
      else if (rw === 'for') node = forCmd();
      else if (rw === '{') { p++; node = { type: 'group', body: list(new Set(['}'])) }; expectWord('}'); }
      else node = whileCmd(rw === 'until');
      open.pop();
    }
    else if (rw === 'function') { p++; const n = next(); if (!isWord(n)) fail(n); if (peek().t === 'op' && peek().v === '(') { p++; if (!(peek().t === 'op' && peek().v === ')')) fail(); p++; } return funcBody(n.parts[0].v); }
    else if (rw === 'case') throw new SyntaxErr('case … esac is not supported in this sandbox; use if / elif instead', t.line);
    else if (rw) fail(t);
    else if (t.t === 'op' && t.v === '(') { p++; node = { type: 'subshell', body: list(null) }; if (!(peek().t === 'op' && peek().v === ')')) fail(); p++; }
    else if (isWord(t) && NAME.test(t.parts[0].v) && toks[p + 1].t === 'op' && toks[p + 1].v === '(' && toks[p + 2].t === 'op' && toks[p + 2].v === ')') {
      p += 3; return funcBody(t.parts[0].v);
    } else return simple();
    node.redirs = redirs();
    return node;
  }
  function funcBody(name) {
    skipNl();
    const t = peek();
    if (!(reserved(t) === '{' || (t.t === 'op' && t.v === '('))) fail(t);
    const body = command();
    return { type: 'func', name, body };
  }
  function ifCmd() {
    p++;
    const clauses = [];
    let els = null;
    const cond = list(new Set(['then'])); expectWord('then');
    clauses.push({ cond, body: list(new Set(['elif', 'else', 'fi'])) });
    for (;;) {
      const rw = reserved(peek());
      if (rw === 'elif') { p++; const c = list(new Set(['then'])); expectWord('then'); clauses.push({ cond: c, body: list(new Set(['elif', 'else', 'fi'])) }); continue; }
      if (rw === 'else') { p++; els = list(new Set(['fi'])); }
      expectWord('fi');
      return { type: 'if', clauses, else: els };
    }
  }
  function forCmd() {
    p++;
    const n = next();
    if (!isWord(n) || !NAME.test(n.parts[0].v)) fail(n);
    let items = null;
    skipNl();
    if (isWord(peek(), 'in')) {
      p++; items = [];
      while (peek().t === 'word') items.push({ parts: next().parts });
      if (!(peek().t === 'op' && (peek().v === ';' || peek().v === '\n'))) fail();
    }
    skipSep();
    expectWord('do');
    const body = list(new Set(['done']));
    expectWord('done');
    return { type: 'for', name: n.parts[0].v, items, body };
  }
  function whileCmd(until) {
    p++;
    const cond = list(new Set(['do'])); expectWord('do');
    const body = list(new Set(['done'])); expectWord('done');
    return { type: 'while', cond, body, until };
  }
  function simple() {
    const node = { type: 'simple', assigns: [], words: [], redirs: [], line: peek().line };
    for (;;) {
      const t = peek();
      if (t.t === 'redir') { node.redirs.push(redir()); continue; }
      if (t.t !== 'word') break;
      if (!node.words.length) {
        const a = assignment(t);
        if (a) { p++; node.assigns.push(a); continue; }
      }
      node.words.push({ parts: next().parts });
    }
    if (!node.words.length && !node.assigns.length && !node.redirs.length) fail();
    return node;
  }
  // NAME=value / NAME+=value: the name must be an unquoted literal at the start of the word.
  function assignment(t) {
    const f = t.parts[0];
    if (!f || f.k !== 'lit' || f.q !== 0) return null;
    const m = f.v.match(/^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/);
    if (!m) return null;
    const rest = f.v.slice(m[0].length);
    const parts = [...(rest ? [{ k: 'lit', v: rest, q: 0 }] : []), ...t.parts.slice(1)];
    // `~` right after = expands too (bash does this for assignments)
    if (parts[0]?.k === 'lit' && parts[0].q === 0 && /^~(\/|$)/.test(parts[0].v)) parts.splice(0, 1, { k: 'tilde' }, ...(parts[0].v.length > 1 ? [{ k: 'lit', v: parts[0].v.slice(1), q: 0 }] : []));
    return { name: m[1], append: m[2] === '+', value: { parts } };
  }

  const prog = list(null, { allowEmpty: true });
  if (peek().t !== 'eof') fail();
  return prog;
}
