// Conflict-marker logic shared by the v1 conflict surgeon (js/panels.js) and the `resolve` exercise's conflict
// editor (js/ui/exercises.js). Pure and DOM-free, like the engine, so the content tests can grade with it.
// See .notes/conflict-editor.md.
import { splitLines, joinLines, norm } from './git.js';

// A file with conflict markers -> segments: { text: [lines] } for the parts both sides agree on and
// { hunk: { ours, theirs, oursLabel, theirsLabel } } for each <<<<<<< / ======= / >>>>>>> region.
// An unterminated region is kept as plain text.
export function parseConflicts(text) {
  const lines = splitLines(text);
  const segs = [];
  let buf = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('<<<<<<< ') || lines[i] === '<<<<<<<') {
      const hunk = { ours: [], theirs: [], oursLabel: lines[i].slice(8), theirsLabel: '' };
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('=======')) hunk.ours.push(lines[j++]);
      j++;
      while (j < lines.length && !lines[j].startsWith('>>>>>>>')) hunk.theirs.push(lines[j++]);
      if (j >= lines.length) { buf.push(...lines.slice(i)); break; }
      hunk.theirsLabel = lines[j].slice(8);
      if (buf.length) segs.push({ text: buf }); buf = [];
      segs.push({ hunk });
      i = j;
    } else buf.push(lines[i]);
  }
  if (buf.length) segs.push({ text: buf });
  return segs;
}

// The lines one hunk turns into for a choice: 'ours' | 'theirs' | 'both' (ours first) | 'both-rev' |
// 'edit' (the hand-written text in `edit`). Anything else keeps the hunk with its markers.
export function hunkLines(hk, choice, edit = '') {
  if (choice === 'ours') return [...hk.ours];
  if (choice === 'theirs') return [...hk.theirs];
  if (choice === 'both') return [...hk.ours, ...hk.theirs];
  if (choice === 'both-rev') return [...hk.theirs, ...hk.ours];
  if (choice === 'edit') return splitLines(String(edit ?? ''));
  return ['<<<<<<< ' + hk.oursLabel, ...hk.ours, '=======', ...hk.theirs, '>>>>>>> ' + hk.theirsLabel];
}

// segments + one choice per hunk (+ the hand edits, by hunk index) -> the file text
export function resolveConflicts(segs, choices, edits = []) {
  const out = [];
  let k = 0;
  for (const s of segs) {
    if (s.text) { out.push(...s.text); continue; }
    out.push(...hunkLines(s.hunk, choices[k], edits[k]));
    k++;
  }
  return joinLines(out);
}

export const hasMarkers = (t) => typeof t === 'string' && /^(<{7}|>{7})( |$)/m.test(t);
export const conflictedFiles = (r) => Object.keys(r.s.work).filter((p) => hasMarkers(r.s.work[p])).sort();

// The file a `resolve` exercise edits: ex.file, else the first one with markers.
export const resolveTarget = (ex, r) => ex.file || conflictedFiles(r)[0] || null;

// Write the player's resolved text into the working tree (what saving the file in an editor does) and grade the
// repo with the exercise's own state-based check, the same way `type` exercises are graded.
export function gradeResolve(ex, r, text, file = resolveTarget(ex, r)) {
  if (!file) return false;
  r.s.work[file] = norm(text);
  try { return !!ex.check(r); } catch { return false; }
}
