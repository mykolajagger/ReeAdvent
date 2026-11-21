import { GIFTS_RAW, INTIMATE_RAW, ACTIVITIES_RAW, QUESTIONS_RAW } from './content.js';
import { DAYS } from './util.js';
import { GIFTS_EN, INTIMATE_EN, ACTIVITIES_EN, QUESTIONS_EN } from './content_en.js';

export const REGIONS = ['Вінницька', 'Волинська', 'Дніпропетровська', 'Донецька', 'Житомирська', 'Закарпатська', 'Запорізька', 'Івано-Франківська', 'Київська', 'Кіровоградська', 'Луганська', 'Львівська', 'Миколаївська', 'Одеська', 'Полтавська', 'Рівненська', 'Сумська', 'Тернопільська', 'Харківська', 'Херсонська', 'Хмельницька', 'Черкаська', 'Чернівецька', 'Чернігівська', 'м. Київ', 'Автономна Республіка Крим'];

const AVOID_MAP = { alcohol: 'alcohol', sweet: 'sweet', scent: 'scent' };
const splitTags = s => (s ? String(s).split(',').filter(Boolean) : []);

export const GIFTS = GIFTS_RAW.map((r, i) => ({ id: i, title: r[0], desc: r[1], price: r[2], tags: splitTags(r[3]), store: r[4], q: r[5], day: r[6] || 0 }));
export const INTIMATE = INTIMATE_RAW.map((r, i) => ({ id: i, title: r[0], desc: r[1], level: r[2], tags: splitTags(r[3]), day: r[4] || 0 }));
export const ACTIVITIES = ACTIVITIES_RAW.map((r, i) => ({ id: i, title: r[0], desc: r[1], cost: r[2], tags: splitTags(r[3]), q: r[4], day: r[5] || 0 }));

export const QUESTIONS = QUESTIONS_RAW.map((r, i) => ({ id: i, text: r[0], level: r[1], day: r[2] || 0 }));

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const overlap = (tags, likes) => tags.reduce((n, t) => n + (likes.includes(t) ? 1 : 0), 0);
const hasAvoided = (tags, avoid) => avoid.some(a => AVOID_MAP[a] && tags.includes(AVOID_MAP[a]));

function takeWeighted(cands, rnd) {
  let total = 0; for (const c of cands) total += c.w;
  let r = rnd() * total, i = 0;
  for (; i < cands.length; i++) { r -= cands[i].w; if (r <= 0) break; }
  if (i >= cands.length) i = cands.length - 1;
  return cands.splice(i, 1)[0].item;
}

/**
 * answers: [surveyA, surveyB]; dates: windowDates(); region: область пари.
 * Повертає { seed, days: {1: {gift:[idA,idB], intim, act}}, stretched }
 * gift[k] — те, що дарує k-й учасник іншому.
 */
export function generateSchedule(answers, seed, dates, region, country = 'UA') {
  const rnd = mulberry32(seed);
  const days = {}; for (let d = 1; d <= DAYS; d++) days[d] = { gift: [0, 0] };
  const specialFor = (item, d) => item.day && dates[d - 1].month === 12 && dates[d - 1].day === item.day;
  let stretched = false;

  // Подарунки
  for (const gi of [0, 1]) {
    const giver = answers[gi], recv = answers[1 - gi];
    const regular = GIFTS.filter(g => !g.day && !hasAvoided(g.tags, recv.avoid));
    let pool = regular.filter(g => g.price <= giver.budget);
    if (pool.length < DAYS) { stretched = true; pool = regular.slice().sort((x, y) => x.price - y.price).slice(0, DAYS + 6); }
    const cands = pool.map(g => ({ item: g, w: 1 + 3 * overlap(g.tags, recv.giftLikes) }));
    for (let d = 1; d <= DAYS; d++) {
      const sp = GIFTS.find(g => specialFor(g, d));
      days[d].gift[gi] = sp ? sp.id : takeWeighted(cands, rnd).id;
    }
  }

  // Пригоди: спільні, рівень = мінімум, поступове наростання
  const maxLevel = Math.min(answers[0].level, answers[1].level);
  let iCands = INTIMATE.filter(x => !x.day && x.level <= maxLevel)
    .map(x => ({ item: x, w: 1 + 2 * overlap(x.tags, answers[0].intimLikes) + 2 * overlap(x.tags, answers[1].intimLikes) }));
  for (let d = 1; d <= DAYS; d++) {
    const sp = INTIMATE.find(x => specialFor(x, d));
    if (sp) { days[d].intim = sp.id; continue; }
    const target = 1 + ((d - 1) / (DAYS - 1)) * (maxLevel - 1);
    const local = iCands.map(c => ({ item: c.item, w: c.w * (0.25 + 1 / (1 + 1.5 * Math.abs(c.item.level - target))) }));
    const pick = takeWeighted(local, rnd);
    days[d].intim = pick.id;
    iCands = iCands.filter(c => c.item.id !== pick.id);
  }

  // Активності: спільні
  const maxCost = Math.min(answers[0].actBudget, answers[1].actBudget);
  const hasCar = answers[0].car || answers[1].car;
  const avoid = [...answers[0].avoid, ...answers[1].avoid];
  const intl = country && country !== 'UA', zk = !intl && region === 'Закарпатська';
  let aCands = ACTIVITIES.filter(x => !x.day && x.cost <= maxCost && (hasCar || !x.tags.includes('car')) && (zk || !x.tags.includes('zk')) && !(intl && x.tags.includes('ua')) && !hasAvoided(x.tags, avoid))
    .map(x => {
      const oa = overlap(x.tags, answers[0].actLikes), ob = overlap(x.tags, answers[1].actLikes);
      return { item: x, w: 1 + 2 * oa + 2 * ob + (oa && ob ? 2 : 0) };
    });
  for (let d = 1; d <= DAYS; d++) {
    const sp = ACTIVITIES.find(x => specialFor(x, d));
    if (sp) { days[d].act = sp.id; continue; }
    const wd = dates[d - 1].weekday, weekend = wd === 0 || wd === 6;
    const local = aCands.map(c => {
      let m = 1; const t = c.item.tags;
      if (t.includes('trip')) m *= weekend ? 3 : 0.15;
      if (t.includes('home') && !weekend) m *= 1.4;
      if (c.item.cost >= 3 && !weekend) m *= 0.3;
      return { item: c.item, w: c.w * m };
    });
    const pick = takeWeighted(local, rnd);
    days[d].act = pick.id;
    aCands = aCands.filter(c => c.item.id !== pick.id);
  }
  // Питання дня: спільне для обох, рівень = мінімум з двох, без повторів
  let qCands = QUESTIONS.filter(x => !x.day && x.level <= maxLevel).map(x => ({ item: x, w: 1 }));
  for (let d = 1; d <= DAYS; d++) {
    const sp = QUESTIONS.find(x => specialFor(x, d));
    days[d].q = sp ? sp.id : takeWeighted(qCands, rnd).id;
  }
  return { seed, days, stretched };
}

const STORES = {
  r: ['https://rozetka.com.ua/ua/search/?text=', 'Rozetka'], p: ['https://prom.ua/ua/search?search_term=', 'Prom.ua'],
  y: ['https://www.yakaboo.ua/ua/search/?q=', 'Yakaboo'], m: ['https://makeup.com.ua/ua/search/?q=', 'Makeup'],
  e: ['https://epicentrk.ua/ua/search/?q=', 'Епіцентр'], g: ['https://www.google.com/maps/search/', 'На мапі']
};
export function storeLink(store, q, city) {
  const s = STORES[store]; if (!s || !q) return null;
  const query = q.replace('{city}', city);
  return { url: s[0] + encodeURIComponent(query), label: store === 'g' ? 'На мапі' : 'Шукати на ' + s[1] };
}
/** Посилання на подарунок: у країнах, окрім України, магазини Rozetka/Prom тощо неактуальні, тож ведемо в Google Shopping (англійський запит для англійського інтерфейсу). */
const shopLink = (q, lang) => q ? { url: 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(q), label: lang === 'en' ? 'Search online' : 'Шукати в інтернеті' } : null;
function mapsLink(q, city, lang) { return q ? { url: 'https://www.google.com/maps/search/' + encodeURIComponent(String(q).replace('{city}', city)), label: lang === 'en' ? 'On the map' : 'На мапі' } : null; }
export const giftView = (g, city, lang = 'uk', country = 'UA') => {
  const en = lang === 'en' ? GIFTS_EN[g.id] : null, abroad = country && country !== 'UA';
  let link;
  if (abroad) link = shopLink(en ? en[2] : g.q, lang);
  else if (en) link = g.store === 'g' ? mapsLink(en[2], city, lang) : (en[2] && g.store ? shopLink(en[2], lang) : null);
  else link = storeLink(g.store, g.q, city);
  return { title: en ? en[0] : g.title, desc: en ? en[1] : g.desc, price: g.price, link };
};
export const intimView = (x, lang = 'uk') => { const en = lang === 'en' ? INTIMATE_EN[x.id] : null; return { title: en ? en[0] : x.title, desc: en ? en[1] : x.desc, level: x.level }; };
export const actView = (x, city, lang = 'uk') => {
  const en = lang === 'en' ? ACTIVITIES_EN[x.id] : null, q = en ? en[2] : x.q;
  return { title: en ? en[0] : x.title, desc: en ? en[1] : x.desc, cost: x.cost, car: x.tags.includes('car'), link: q ? mapsLink(q, city, lang) : null };
};
/** Пошуковий запит із містом для рекомендацій закладів (лише шаблонні запити з {city}; конкретні пам'ятки пропускаємо). */
export const placesQuery = (x, city, lang = 'uk') => { const en = lang === 'en' ? ACTIVITIES_EN[x.id] : null, q = en ? en[2] : x.q; return q && q.includes('{city}') ? q.replace('{city}', city) : null; };
export const questionText = (q, lang = 'uk') => lang === 'en' ? QUESTIONS_EN[q.id] : q.text;

export const GIFT_TAGS = ['sweet', 'tea', 'beauty', 'cozy', 'book', 'tech', 'game', 'craft', 'plant', 'jewel', 'sport', 'music', 'art', 'gourmet', 'fun', 'photo', 'alcohol', 'scent'];
export const INTIM_TAGS = ['mas', 'bath', 'dance', 'game', 'role', 'blind', 'photo', 'words', 'food', 'tease', 'cozy', 'music', 'dress'];
export const ACT_TAGS = ['home', 'out', 'food', 'cult', 'act', 'craft', 'relax', 'night', 'cine', 'play', 'trip', 'music'];
const pickAllowed = (arr, allowed) => (Array.isArray(arr) ? arr.filter((x, i, a) => allowed.includes(x) && a.indexOf(x) === i) : []);

export function sanitizeSurvey(a) {
  a = a || {};
  const name = String(a.name || '').replace(/[<>]/g, '').trim().slice(0, 30);
  if (!name) throw Object.assign(new Error('bad_name'), { status: 400, code: 'bad_name' });
  return {
    name,
    budget: Math.max(100, Math.min(1000, Math.round(Number(a.budget) || 300))),
    giftLikes: pickAllowed(a.giftLikes, GIFT_TAGS),
    avoid: pickAllowed(a.avoid, ['alcohol', 'sweet', 'scent']),
    level: Math.max(1, Math.min(3, Math.round(Number(a.level) || 1))),
    intimLikes: pickAllowed(a.intimLikes, INTIM_TAGS),
    actLikes: pickAllowed(a.actLikes, ACT_TAGS),
    actBudget: Math.max(0, Math.min(3, Math.round(a.actBudget === undefined ? 1 : Number(a.actBudget)))),
    car: !!a.car
  };
}
