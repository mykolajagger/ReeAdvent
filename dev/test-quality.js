// Якість календаря: подарунки за статтю отримувача, без повторів схожих пунктів, застосунки в активностях, тип місць під активність.
import assert from 'node:assert/strict';
import { generateSchedule, GIFTS, ACTIVITIES, INTIMATE, GIFT_FOR, actView, sanitizeSurvey } from '../src/logic.js';
import { windowDates } from '../src/util.js';
import { placeRule, byRule } from '../src/places.js';
const dates = windowDates('2026-12-01');
const base = { name: 'A', budget: 1000, giftLikes: ['beauty', 'jewel', 'plant', 'tech'], avoid: [], level: 3, intimLikes: [], actLikes: ['home', 'food', 'relax'], actBudget: 3, car: true, gifts: 24, outDays: 2 };
assert.equal(sanitizeSurvey({ name: 'A', sex: 'f' }).sex, 'f'); assert.equal(sanitizeSurvey({ name: 'A', sex: 'zz' }).sex, null);
let wrong = 0, picnics = 0, dupTitle = 0;
for (let i = 0; i < 400; i++) {
  const he = { ...sanitizeSurvey({ ...base, sex: 'm' }) }, she = { ...sanitizeSurvey({ ...base, name: 'B', sex: 'f' }) };
  const s = generateSchedule([he, she], 1 + i * 31, dates, 'Львівська', 'UA');
  for (const d of Object.values(s.days)) { if (d.gift[0] != null && GIFT_FOR.m.includes(d.gift[0])) wrong++; if (d.gift[1] != null && GIFT_FOR.f.includes(d.gift[1])) wrong++; }
  const acts = Object.values(s.days).map(d => ACTIVITIES[d.act]); if (acts.filter(a => /пікнік/i.test(a.title)).length > 1) picnics++;
  const t = acts.map(a => a.title); if (new Set(t).size !== t.length) dupTitle++;
  const ints = Object.values(s.days).map(d => INTIMATE[d.intim].title); if (new Set(ints).size !== ints.length) dupTitle++;
}
assert.equal(wrong, 0, 'подарунки не тієї статі'); assert.equal(picnics, 0, 'два пікніки'); assert.equal(dupTitle, 0, 'однакові назви');
// без статі (старі анкети) — фільтра немає, усе працює
const old = generateSchedule([sanitizeSurvey(base), sanitizeSurvey({ ...base, name: 'B' })], 5, dates, 'Львівська', 'UA'); assert.ok(Object.values(old.days).every(d => d.act != null));
// застосунки
assert.deepEqual(actView(ACTIVITIES.find(a => a.title === 'Зоряне небо в застосунку'), 'Львів').apps.map(a => a.name), ['Stellarium', 'Star Walk 2', 'SkyView']);
assert.ok(actView(ACTIVITIES.find(a => a.title === 'Вивчаємо 20 слів нової мови'), 'Львів').apps.some(a => a.name === 'Duolingo'));
assert.deepEqual(actView(ACTIVITIES.find(a => a.title === 'Боулінг'), 'Львів').apps, []);
// місця під тип активності
const G = [{ displayName: { text: 'Площа Ринок' }, types: ['tourist_attraction', 'plaza'] }, { displayName: { text: 'Шевченківський гай' }, types: ['park'] }, { displayName: { text: 'Кава Хаус' }, types: ['cafe'] }, { displayName: { text: 'Національний музей' }, primaryType: 'museum', types: [] }, { displayName: { text: 'Сквер' }, types: ['park'] }];
assert.deepEqual(byRule(G, placeRule('озеро ліс поблизу Львів Озеро чи ліс за містом')).map(x => x.displayName.text), ['Шевченківський гай']);
assert.deepEqual(byRule(G, placeRule('музей Львів')).map(x => x.displayName.text), ['Національний музей']);
assert.equal(placeRule('скеледром Львів Скеледром').inc, null); assert.equal(placeRule('ресторан у лісі поблизу Львів').inc, 'restaurant');
assert.equal(byRule(G, null).length, G.length);
console.log('OK quality');
