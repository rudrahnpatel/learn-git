// Command cards (js/content/cards.js): every card is well formed, every unlockedBy lesson exists,
// and every lesson unlocks at least one card. Run: node tests/cards.test.mjs
import { UNITS as GIT_UNITS } from '../js/content/index.js';
import { UNITS as BASH_UNITS } from '../js/content/bash/index.js';
import { CARDS, RARITIES, COURSE_META } from '../js/content/cards.js';

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL ' + msg); };

// every course with a deck: its units, and the lessons that may unlock its cards
const COURSE_UNITS = { git: GIT_UNITS, bash: BASH_UNITS };
const lessons = new Map();   // "course/lesson" -> { unit }
for (const [course, units] of Object.entries(COURSE_UNITS)) for (const u of units) for (const l of u.lessons) lessons.set(`${course}/${l.id}`, { unit: u.id, lesson: l, course });

const ids = new Set();
for (const card of CARDS) {
  const where = `card ${card.id || '(no id)'}`;
  for (const f of ['id', 'course', 'cmd', 'title', 'what', 'example', 'mistake', 'rarity']) {
    if (typeof card[f] !== 'string' || !card[f].trim()) fail(`${where}: missing ${f}`);
  }
  if (ids.has(card.id)) fail(`${where}: duplicate id`);
  ids.add(card.id);
  if (!COURSE_META[card.course] || COURSE_META[card.course].id !== card.course) fail(`${where}: course "${card.course}" has no COURSE_META entry`);
  if (!RARITIES.includes(card.rarity)) fail(`${where}: rarity "${card.rarity}" not in ${RARITIES.join('|')}`);
  if (!Array.isArray(card.unlockedBy) || !card.unlockedBy.length) fail(`${where}: unlockedBy must list at least one lesson`);
  for (const id of card.unlockedBy || []) if (!lessons.has(`${card.course}/${id}`)) fail(`${where}: unlockedBy "${id}" is not a lesson of the ${card.course} course`);
  if (/<[a-z]/i.test(card.what + card.mistake)) fail(`${where}: what/mistake are plain text (no HTML)`);
}

for (const [key, { unit, course, lesson }] of lessons) {
  if (!CARDS.some((c) => c.course === course && c.unlockedBy.includes(lesson.id))) fail(`lesson ${key} (unit ${unit}) unlocks no card`);
}
for (const [course, units] of Object.entries(COURSE_UNITS)) for (const u of units) if (!COURSE_META[course].ready[u.id]) fail(`${course} unit ${u.id} has no ready label (share card)`);

const byRarity = RARITIES.map((r) => `${r} ${CARDS.filter((c) => c.rarity === r).length}`).join(', ');
if (failures) { console.error(`\n${failures} card check(s) failed`); process.exit(1); }
console.log(`cards: ${CARDS.length} cards (${byRarity}) over ${lessons.size} lessons in ${Object.keys(COURSE_UNITS).length} courses: ok`);
