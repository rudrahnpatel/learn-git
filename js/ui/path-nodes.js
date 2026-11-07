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
  // Number the release tags in path order: v0.1, v0.2, ... and the very last one ships v1.0.
  const rel = out.filter((n) => n.kind === 'release');
  rel.forEach((n, i) => { n.version = i === rel.length - 1 && rel.length > 1 ? 'v1.0' : `v0.${i + 1}`; n.title = `Release ${n.version}`; });
  return out;
}
