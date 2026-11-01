// Command cards (js/content/cards.js): every card is well formed, every unlockedBy lesson exists,
// and every lesson unlocks at least one card. Run: node tests/cards.test.mjs
import { UNITS } from '../js/content/index.js';
import { CARDS, RARITIES, COURSE } from '../js/content/cards.js';

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL ' + msg); };

const lessons = new Map();
for (const u of UNITS) for (const l of u.lessons) lessons.set(l.id, { unit: u.id, lesson: l });

const ids = new Set();
for (const card of CARDS) {
  const where = `card ${card.id || '(no id)'}`;
  for (const f of ['id', 'course', 'cmd', 'title', 'what', 'example', 'mistake', 'rarity']) {
    if (typeof card[f] !== 'string' || !card[f].trim()) fail(`${where}: missing ${f}`);
  }
  if (ids.has(card.id)) fail(`${where}: duplicate id`);
  ids.add(card.id);
  if (card.course !== COURSE.id) fail(`${where}: course "${card.course}" is not "${COURSE.id}"`);
  if (!RARITIES.includes(card.rarity)) fail(`${where}: rarity "${card.rarity}" not in ${RARITIES.join('|')}`);
  if (!Array.isArray(card.unlockedBy) || !card.unlockedBy.length) fail(`${where}: unlockedBy must list at least one lesson`);
  for (const id of card.unlockedBy || []) if (!lessons.has(id)) fail(`${where}: unlockedBy "${id}" is not a lesson in js/content/index.js`);
  if (/<[a-z]/i.test(card.what + card.mistake)) fail(`${where}: what/mistake are plain text (no HTML)`);
}

for (const [id, { unit }] of lessons) {
  if (!CARDS.some((c) => c.unlockedBy.includes(id))) fail(`lesson ${id} (unit ${unit}) unlocks no card`);
}
for (const u of UNITS) if (!COURSE.ready[u.id]) fail(`unit ${u.id} has no COURSE.ready label (share card)`);

const byRarity = RARITIES.map((r) => `${r} ${CARDS.filter((c) => c.rarity === r).length}`).join(', ');
if (failures) { console.error(`\n${failures} card check(s) failed`); process.exit(1); }
console.log(`cards: ${CARDS.length} cards (${byRarity}) over ${lessons.size} lessons in ${UNITS.length} units: ok`);
