// The path as an ordered list of nodes (lessons, release tags, challenges, unit review), built from
// the content's UNITS. Pure: no game state, so /admin (admin/admin.js) lists exactly the same node
// ids and titles as the game (js/ui/path.js).
import { levelById } from '../levels.js';

export function buildNodes(UNITS) {
  const out = [];
  UNITS.forEach((unit, ui) => {
    const challenges = (unit.challenges || []).filter((id) => levelById(id));
    let ci = 0, chest = 0;
    const lessons = unit.lessons;
    lessons.forEach((lesson, li) => {
      out.push({ id: `${unit.id}:lesson:${lesson.id}`, kind: 'lesson', unit, ui, lesson, title: lesson.title });
      if ((li + 1) % 2 === 0) {
        // Release tags keep the old `:chest:` ids so saved progress still matches.
        out.push({ id: `${unit.id}:chest:${chest++}`, kind: 'release', unit, ui, title: 'Release' });
        if (ci < challenges.length - 1) { const id = challenges[ci++]; out.push({ id: `${unit.id}:challenge:${id}`, kind: 'challenge', unit, ui, levelId: id, title: levelById(id).title }); }
      }
    });
    while (ci < challenges.length) { const id = challenges[ci++]; out.push({ id: `${unit.id}:challenge:${id}`, kind: 'challenge', unit, ui, levelId: id, title: levelById(id).title }); }
    if (lessons.some((l) => l.exercises.some((e) => e.type !== 'learn'))) out.push({ id: `${unit.id}:review`, kind: 'review', unit, ui, title: `${unit.title} review` });
  });
  // Number the release tags like patch releases: v0.<unit>.<crate within the unit> (v0.4.2 = unit 4's second crate),
  // and the very last one ships v1.0.0. Each also knows the tag before it (v0.0.0 for the first) so the crate can
  // show the bump, v0.4.1 -> v0.4.2.
  const rel = out.filter((n) => n.kind === 'release');
  const inUnit = new Map();
  rel.forEach((n, i) => {
    const k = (inUnit.get(n.ui) || 0) + 1; inUnit.set(n.ui, k);
    n.version = i === rel.length - 1 && rel.length > 1 ? 'v1.0.0' : `v0.${n.ui + 1}.${k}`;
    n.prevVersion = i ? rel[i - 1].version : 'v0.0.0';
    n.title = `Release ${n.version}`;
  });
  return out;
}
