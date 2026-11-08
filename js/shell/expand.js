// Word expansion for the simulated shell, in bash's order:
//   tilde -> parameters ($X ${X:-y} $? $# $1 "$@") / command substitution $(…) / arithmetic $((…))
//   -> field splitting (unquoted results only, on spaces, tabs and newlines) -> pathname expansion (globs)
//   -> quote removal.
// Quoted text never splits or globs; an unquoted $VAR does both (the classic reason to write "$VAR").
import { escapeGlob, hasGlob, unescapeGlob, globRegExp } from './fs.js';
import { wordParts, heredocParts } from './parse.js';

export class ExpandError extends Error {
  constructor(msg, code = 1) { super(msg); this.code = code; }
}

// Expand a list of words into argv.
export function expandWords(sh, words) {
  const out = [];
  for (const w of words) for (const b of braceExpand(w)) out.push(...expandWord(sh, b));
  return out;
}

// Brace expansion, before everything else: a{b,c}d -> abd acd, {1..5}, {a..e}, {5..1}. Only braces inside one
// unquoted piece of text count (`{$a,$b}` stays as typed); nested and repeated groups work.
export function braceExpand(word) {
  for (let pi = 0; pi < word.parts.length; pi++) {
    const part = word.parts[pi];
    if (part.k !== 'lit' || part.q !== 0 || !part.v.includes('{')) continue;
    const g = findBrace(part.v);
    if (!g) continue;
    const pre = part.v.slice(0, g.start), post = part.v.slice(g.end + 1);
    const res = [];
    for (const alt of g.alts) {
      const parts = [...word.parts];
      parts[pi] = { k: 'lit', v: pre + alt + post, q: 0 };
      res.push(...braceExpand({ ...word, parts }));
    }
    return res;
  }
  return [word];
}
function findBrace(s) {
  for (let start = s.indexOf('{'); start >= 0; start = s.indexOf('{', start + 1)) {
    let depth = 0, end = -1;
    const commas = [];
    for (let i = start; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') { if (--depth === 0) { end = i; break; } }
      else if (s[i] === ',' && depth === 1) commas.push(i);
    }
    if (end < 0) return null;
    const body = s.slice(start + 1, end);
    if (commas.length) {
      const alts = [];
      let from = start + 1;
      for (const c of [...commas, end]) { alts.push(s.slice(from, c)); from = c + 1; }
      return { start, end, alts };
    }
    let m = body.match(/^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/);
    if (m) {
      const a = +m[1], b = +m[2], step = Math.abs(+(m[3] || 1)) || 1;
      const width = /^-?0\d/.test(m[1]) || /^-?0\d/.test(m[2]) ? Math.max(m[1].length, m[2].length) : 0;
      const alts = [];
      for (let x = a; a <= b ? x <= b : x >= b; x += a <= b ? step : -step) { alts.push(width ? String(x).padStart(width, '0') : String(x)); if (alts.length > 10000) break; }
      return { start, end, alts };
    }
    m = body.match(/^([a-zA-Z])\.\.([a-zA-Z])$/);
    if (m) {
      const a = m[1].charCodeAt(0), b = m[2].charCodeAt(0);
      const alts = [];
      for (let x = a; a <= b ? x <= b : x >= b; x += a <= b ? 1 : -1) alts.push(String.fromCharCode(x));
      return { start, end, alts };
    }
  }
  return null;
}

// One word -> 0..n fields.
export function expandWord(sh, word, { split = true, glob = true } = {}) {
  const fields = [];
  let cur = null;
  const open = () => (cur ||= { s: '', g: '', glob: false, quoted: false });
  const lit = (text, quoted) => {
    open();
    cur.s += text;
    cur.g += quoted ? escapeGlob(text) : text;
    if (quoted) cur.quoted = true;
  };
  const end = () => { if (cur) fields.push(cur); cur = null; };
  // an unquoted expansion result: split on whitespace (IFS default), pieces stay glob-active
  const splittable = (text) => {
    if (!split) { lit(text, false); return; }
    const pieces = text.split(/[ \t\n]+/);
    pieces.forEach((piece, i) => {
      if (i > 0) end();
      if (piece) lit(piece, false);
    });
  };
  for (const part of word.parts) {
    switch (part.k) {
      case 'lit': lit(part.v, part.q !== 0); break;
      case 'tilde': lit(sh.getVar('HOME') ?? sh.s.home, true); break;
      case 'var': {
        if ((part.name === '@' || part.name === '*') && !part.op) {
          const args = sh.positional();
          if (part.q === 2 && part.name === '@') {
            // "$@": one field per argument, glued to the text around it
            if (!args.length) { open(); break; }
            args.forEach((a, i) => { if (i > 0) end(); lit(a, true); });
          } else if (part.q === 2) lit(args.join(' '), true);
          else args.forEach((a, i) => { if (i > 0) end(); splittable(a); });
          break;
        }
        const v = paramValue(sh, part);
        if (part.q === 2) lit(v, true); else splittable(v);
        break;
      }
      case 'cmd': {
        const v = sh.commandSubst(part.src);
        if (part.q === 2) lit(v, true); else splittable(v);
        break;
      }
      case 'arith': {
        const v = String(arith(sh, part.src));
        if (part.q === 2) lit(v, true); else splittable(v);
        break;
      }
    }
  }
  end();
  const res = [];
  for (const f of fields) {
    if (!f.s && !f.quoted) continue; // an empty unquoted expansion disappears
    if (glob && !sh.opts.noglob && hasGlob(f.g)) {
      const hits = sh.fs.glob(f.g, sh.s.cwd);
      if (hits.length) { res.push(...hits); continue; }
      res.push(unescapeGlob(f.g)); // no match: the pattern stays as typed
      continue;
    }
    res.push(f.s);
  }
  return res;
}

// A word expanded to exactly one string: assignments, redirection targets, here-strings. No splitting, no globs.
export function expandString(sh, word) {
  return expandWord(sh, word, { split: false, glob: false }).join(' ');
}
// Expand the text of an unquoted here-document.
export function expandHeredoc(sh, body) { return expandString(sh, { parts: heredocParts(body) }); }

// The value of a ${…} / $NAME part (a string).
function paramValue(sh, part) {
  const { name, op } = part;
  const raw = sh.getVar(name);
  const set = raw !== undefined;
  const val = raw ?? '';
  if (!op) {
    if (!set && sh.opts.nounset && !/^[?#@*$!0-]$/.test(name)) throw Object.assign(new ExpandError(`${/^\d/.test(name) ? '$' : ''}${name}: unbound variable`), { unbound: true });
    return val;
  }
  const arg = () => expandString(sh, { parts: wordParts(part.arg ?? '') });
  switch (op) {
    case 'len': return String(val.length);
    case ':-': return val ? val : arg();
    case '-': return set ? val : arg();
    case ':=': case '=': {
      if (op === ':=' ? val : set) return val;
      if (!/^[A-Za-z_]/.test(name)) throw new ExpandError(`$${name}: cannot assign in this way`);
      const v = arg(); sh.setVar(name, v); return v;
    }
    case ':+': return val ? arg() : '';
    case '+': return set ? arg() : '';
    case ':?': case '?': {
      if (op === ':?' ? val : set) return val;
      throw new ExpandError(`${name}: ${part.arg ? arg() : 'parameter null or not set'}`);
    }
    case '#': case '##': case '%': case '%%': {
      const pat = expandWord(sh, { parts: wordParts(part.arg ?? '') }, { split: false, glob: false }).join('');
      const re = (s) => globRegExp(s, { slash: true });
      const longest = op.length === 2;
      if (op[0] === '#') {
        const lens = [...Array(val.length + 1).keys()];
        if (longest) lens.reverse();
        for (const n of lens) if (re(pat).test(val.slice(0, n))) return val.slice(n);
      } else {
        const starts = [...Array(val.length + 1).keys()];
        if (!longest) starts.reverse();
        for (const n of starts) if (re(pat).test(val.slice(n))) return val.slice(0, n);
      }
      return val;
    }
    case '^^': return val.toUpperCase();
    case '^': return val.charAt(0).toUpperCase() + val.slice(1);
    case ',,': return val.toLowerCase();
    case ',': return val.charAt(0).toLowerCase() + val.slice(1);
    case '/': case '//': {
      const a = part.arg ?? '';
      const slash = a.indexOf('/');
      const pat = expandString(sh, { parts: wordParts(slash < 0 ? a : a.slice(0, slash)) });
      const rep = slash < 0 ? '' : expandString(sh, { parts: wordParts(a.slice(slash + 1)) });
      if (!pat) return val;
      const re = new RegExp(globRegExp(pat, { slash: true }).source.slice(1, -1), op === '//' ? 'g' : '');
      return val.replace(re, () => rep);
    }
  }
  return val;
}

/* ------------------------------------------------------------------ arithmetic $(( )) */
// Integers only: + - * / % ** , comparisons, == != , && || !, unary -, parentheses, variables by name or $name,
// and assignment forms (=, +=, -=, ++, --) on variables.
export function arith(sh, src) {
  const text = expandString(sh, { parts: heredocParts(src) });
  const toks = text.match(/\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*|\+\+|--|[<>=!]=|&&|\|\||[-+*/%]=|[-+*/%()<>!=?:]|\S/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const bad = (t) => { throw new ExpandError(`${text.trim()}: syntax error: operand expected (error token is "${t ?? text.trim()}")`); };
  const num = (name) => {
    const v = sh.getVar(name);
    if (v === undefined || v === '') return 0;
    if (/^-?\d+$/.test(v.trim())) return parseInt(v, 10);
    return arith(sh, v);
  };
  const assign = (name, v) => { sh.setVar(name, String(v)); return v; };
  function primary() {
    const t = toks[i++];
    if (t === undefined) bad();
    if (t === '(') { const v = ternary(); if (toks[i++] !== ')') bad(toks[i - 1]); return v; }
    if (t === '-') return -primary();
    if (t === '+') return +primary();
    if (t === '!') return primary() ? 0 : 1;
    if (t === '++' || t === '--') { const n = toks[i++]; if (!/^[A-Za-z_]/.test(n || '')) bad(n); return assign(n, num(n) + (t === '++' ? 1 : -1)); }
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (/^[A-Za-z_]/.test(t)) {
      const p = peek();
      if (p === '++' || p === '--') { i++; const v = num(t); assign(t, v + (p === '++' ? 1 : -1)); return v; }
      if (p === '=' ) { i++; return assign(t, ternary()); }
      if (/^[-+*/%]=$/.test(p || '')) { i++; const r = ternary(); return assign(t, binop(p[0], num(t), r)); }
      return num(t);
    }
    return bad(t);
  }
  function binop(op, a, b) {
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': case '%': if (b === 0) throw new ExpandError(`${text.trim()}: division by 0 (error token is "${toks[i - 1]}")`); return op === '/' ? Math.trunc(a / b) : a % b;
    }
  }
  function power() { const a = primary(); if (peek() === '**') { i++; return a ** power(); } return a; }
  function mul() { let a = power(); while (['*', '/', '%'].includes(peek())) { const op = toks[i++]; a = binop(op, a, power()); } return a; }
  function add() { let a = mul(); while (peek() === '+' || peek() === '-') { const op = toks[i++]; a = binop(op, a, mul()); } return a; }
  function rel() { let a = add(); while (['<', '>', '<=', '>='].includes(peek())) { const op = toks[i++]; const b = add(); a = op === '<' ? +(a < b) : op === '>' ? +(a > b) : op === '<=' ? +(a <= b) : +(a >= b); } return a; }
  function eq() { let a = rel(); while (peek() === '==' || peek() === '!=') { const op = toks[i++]; const b = rel(); a = op === '==' ? +(a === b) : +(a !== b); } return a; }
  function and() { let a = eq(); while (peek() === '&&') { i++; const b = eq(); a = +(!!a && !!b); } return a; }
  function or() { let a = and(); while (peek() === '||') { i++; const b = and(); a = +(!!a || !!b); } return a; }
  function ternary() { const c = or(); if (peek() === '?') { i++; const a = ternary(); if (toks[i++] !== ':') bad(toks[i - 1]); const b = ternary(); return c ? a : b; } return c; }
  if (!toks.length) return 0;
  const v = ternary();
  if (i < toks.length) bad(toks[i]);
  return v;
}
