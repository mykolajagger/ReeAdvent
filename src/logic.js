import { GIFTS_RAW as G0, INTIMATE_RAW as I0, ACTIVITIES_RAW as A0, QUESTIONS_RAW as Q0 } from './content.js';
import { DAYS } from './util.js';
import { GIFTS_EN as GE0, INTIMATE_EN as IE0, ACTIVITIES_EN as AE0, QUESTIONS_EN as QE0 } from './content_en.js';
import { MORE_GIFTS } from './more_gifts.js';
import { MORE_INTIM } from './more_intim.js';
import { MORE_ACTS } from './more_acts.js';
import { MORE_QUESTIONS } from './more_questions.js';

// База = початкові пункти + додаткові (лише в кінець: номери в уже складених календарях не змінюються). По ~300 у кожній категорії.
export const GIFTS_RAW = [...G0, ...MORE_GIFTS.map(r => [r[0], r[1], r[2], r[3], r[4], r[5]])];
export const GIFTS_EN = [...GE0, ...MORE_GIFTS.map(r => [r[6], r[7], r[8]])];
export const INTIMATE_RAW = [...I0, ...MORE_INTIM.map(r => [r[0], r[1], r[2], r[3]])];
export const INTIMATE_EN = [...IE0, ...MORE_INTIM.map(r => [r[4], r[5]])];
export const ACTIVITIES_RAW = [...A0, ...MORE_ACTS.map(r => [r[0], r[1], r[2], r[3], r[4]])];
export const ACTIVITIES_EN = [...AE0, ...MORE_ACTS.map(r => [r[5], r[6], r[7]])];
export const QUESTIONS_RAW = [...Q0, ...MORE_QUESTIONS.map(r => [r[0], r[1], 0, r[2]])];
export const QUESTIONS_EN = [...QE0, ...MORE_QUESTIONS.map(r => r[3])];

export const REGIONS = ['Вінницька', 'Волинська', 'Дніпропетровська', 'Донецька', 'Житомирська', 'Закарпатська', 'Запорізька', 'Івано-Франківська', 'Київська', 'Кіровоградська', 'Луганська', 'Львівська', 'Миколаївська', 'Одеська', 'Полтавська', 'Рівненська', 'Сумська', 'Тернопільська', 'Харківська', 'Херсонська', 'Хмельницька', 'Черкаська', 'Чернівецька', 'Чернігівська', 'м. Київ', 'Автономна Республіка Крим'];

const AVOID_MAP = { alcohol: 'alcohol', sweet: 'sweet', scent: 'scent' };
const splitTags = s => (s ? String(s).split(',').filter(Boolean) : []);

export const GIFTS = GIFTS_RAW.map((r, i) => ({ id: i, title: r[0], desc: r[1], price: r[2], tags: splitTags(r[3]), store: r[4], q: r[5], day: r[6] || 0 }));
export const INTIMATE = INTIMATE_RAW.map((r, i) => ({ id: i, title: r[0], desc: r[1], level: r[2], tags: splitTags(r[3]), day: r[4] || 0 }));
export const ACTIVITIES = ACTIVITIES_RAW.map((r, i) => ({ id: i, title: r[0], desc: r[1], cost: r[2], tags: splitTags(r[3]), q: r[4], day: r[5] || 0 }));

export const QUESTIONS = QUESTIONS_RAW.map((r, i) => ({ id: i, text: r[0], level: r[1], day: r[2] || 0, media: r[3] || null }));   // media: 'photo' | 'video' — питання, на яке природно відповісти фото чи відео

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

/** Дні з подарунками: n штук рівномірно, останній — у день 24 (Святвечір при старті 1 грудня). */
export function giftDaysFor(n) {
  n = Math.max(1, Math.min(DAYS, Math.round(Number(n) || DAYS)));
  const set = new Set(); for (let i = 0; i < n; i++) set.add(DAYS - Math.round(i * DAYS / n));
  return set;
}
/** Дні з активністю поза домом: perWeek днів на кожен тиждень (з пріоритетом на вихідні), у неповному тижні пропорційно. dates[d-1].weekday: 0 — неділя. */
export function outDaysFor(perWeek, dates) {
  perWeek = Math.max(0, Math.min(7, Math.round(Number(perWeek) || 0)));
  const PREF = { 6: 0, 0: 1, 5: 2, 3: 3, 1: 4, 4: 5, 2: 6 }, set = new Set();
  for (let start = 1; start <= DAYS; start += 7) {
    const block = []; for (let d = start; d < start + 7 && d <= DAYS; d++) block.push(d);
    const k = block.length === 7 ? perWeek : Math.round(perWeek * block.length / 7);
    block.sort((x, y) => PREF[dates[x - 1].weekday] - PREF[dates[y - 1].weekday] || x - y).slice(0, k).forEach(d => set.add(d));
  }
  return set;
}
const avgOf = (answers, k, def) => { const v = answers.map(a => Number(a[k])).filter(x => isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : def; };
/** Множник ваги за оцінками користувачів: байєсове середнє (новий пункт без оцінок — нейтральний 1). */
export function ratingMult(r) {
  if (!r || !r.n) return 1;
  const avg = (r.avg * r.n + 3.6 * 4) / (r.n + 4);
  return Math.max(0.35, Math.min(2.2, (avg / 3.6) ** 2));
}

/**
 * answers: [surveyA, surveyB]; dates: windowDates(); region: область пари.
 * opts.ratings: { 'gift:12': {avg, n}, ... } — зведені оцінки всіх користувачів; opts.seen: Set('gift:12', ...) — що ця пара вже отримувала в попередніх календарях.
 * Повертає { seed, days: {1: {gift:[idA,idB] | [null,null], intim, act, out, q}}, giftDays, outDays, stretched }
 * gift[k] — те, що дарує k-й учасник іншому (null — у цей день без подарунка).
 */
export function generateSchedule(answers, seed, dates, region, country = 'UA', opts = {}) {
  const rnd = mulberry32(seed), ratings = opts.ratings || {}, seen = opts.seen || new Set();
  const rw = (kind, id) => ratingMult(ratings[kind + ':' + id]);
  // уже отримане раніше не повторюємо, якщо після цього лишається з чого обирати
  const fresh = (kind, arr, need) => { const f = arr.filter(x => !seen.has(kind + ':' + x.id)); return f.length >= need + 4 ? f : arr; };
  const days = {}; for (let d = 1; d <= DAYS; d++) days[d] = { gift: [null, null] };
  const specialFor = (item, d) => item.day && dates[d - 1].month === 12 && dates[d - 1].day === item.day;
  let stretched = false;

  // Подарунки: кількість — середнє з двох анкет, у рівномірно розподілені дні
  const giftN = Math.max(1, Math.min(DAYS, Math.round(avgOf(answers, 'gifts', DAYS)))), giftDays = giftDaysFor(giftN);
  for (const gi of [0, 1]) {
    const giver = answers[gi], recv = answers[1 - gi];
    const regular = fresh('gift', GIFTS.filter(g => !g.day && !hasAvoided(g.tags, recv.avoid)), giftN);
    let pool = regular.filter(g => g.price <= giver.budget);
    if (pool.length < giftN) { stretched = true; pool = regular.slice().sort((x, y) => x.price - y.price).slice(0, giftN + 6); }
    const cands = pool.map(g => ({ item: g, w: (1 + 3 * overlap(g.tags, recv.giftLikes)) * rw('gift', g.id) }));
    for (let d = 1; d <= DAYS; d++) {
      if (!giftDays.has(d)) continue;
      const sp = GIFTS.find(g => specialFor(g, d));
      days[d].gift[gi] = sp ? sp.id : takeWeighted(cands, rnd).id;
    }
  }

  // Пригоди: спільні, рівень = мінімум, поступове наростання
  const maxLevel = Math.min(answers[0].level, answers[1].level);
  let iCands = fresh('intim', INTIMATE.filter(x => !x.day && x.level <= maxLevel), DAYS)
    .map(x => ({ item: x, w: (1 + 2 * overlap(x.tags, answers[0].intimLikes) + 2 * overlap(x.tags, answers[1].intimLikes)) * rw('intim', x.id) }));
  for (let d = 1; d <= DAYS; d++) {
    const sp = INTIMATE.find(x => specialFor(x, d));
    if (sp) { days[d].intim = sp.id; continue; }
    const target = 1 + ((d - 1) / (DAYS - 1)) * (maxLevel - 1);
    const local = iCands.map(c => ({ item: c.item, w: c.w * (0.25 + 1 / (1 + 1.5 * Math.abs(c.item.level - target))) }));
    const pick = takeWeighted(local, rnd);
    days[d].intim = pick.id;
    iCands = iCands.filter(c => c.item.id !== pick.id);
  }

  // Активності: спільні; у дні «поза домом» — вихід у місто, в інші — щось цікаве вдома
  const maxCost = Math.min(answers[0].actBudget, answers[1].actBudget);
  const hasCar = answers[0].car || answers[1].car;
  const avoid = [...answers[0].avoid, ...answers[1].avoid];
  const intl = country && country !== 'UA', zk = !intl && region === 'Закарпатська';
  const outPerWeek = answers.every(a => a.outDays == null) ? null : Math.round(avgOf(answers, 'outDays', 3));
  const outDays = outPerWeek == null ? null : outDaysFor(outPerWeek, dates);
  let aCands = fresh('act', ACTIVITIES.filter(x => !x.day && x.cost <= maxCost && (hasCar || !x.tags.includes('car')) && (zk || !x.tags.includes('zk')) && !(intl && x.tags.includes('ua')) && !hasAvoided(x.tags, avoid)), DAYS)
    .map(x => {
      const oa = overlap(x.tags, answers[0].actLikes), ob = overlap(x.tags, answers[1].actLikes);
      return { item: x, w: (1 + 2 * oa + 2 * ob + (oa && ob ? 2 : 0)) * rw('act', x.id) };
    });
  const isHome = x => x.tags.includes('home');
  for (let d = 1; d <= DAYS; d++) {
    const sp = ACTIVITIES.find(x => specialFor(x, d));
    if (outDays) days[d].out = outDays.has(d);
    if (sp) { days[d].act = sp.id; if (outDays) days[d].out = !isHome(sp); continue; }   // святкові (Миколай, Святвечір) мають свою активність
    const wd = dates[d - 1].weekday, weekend = wd === 0 || wd === 6;
    let pool = aCands;
    if (outDays) { const want = outDays.has(d) ? aCands.filter(c => !isHome(c.item)) : aCands.filter(c => isHome(c.item)); if (want.length) pool = want; }
    const local = pool.map(c => {
      let m = 1; const t = c.item.tags;
      if (t.includes('trip')) m *= weekend ? 3 : 0.15;
      if (!outDays && t.includes('home') && !weekend) m *= 1.4;
      if (c.item.cost >= 3 && !weekend) m *= 0.3;
      return { item: c.item, w: c.w * m };
    });
    const pick = takeWeighted(local, rnd);
    days[d].act = pick.id;
    aCands = aCands.filter(c => c.item.id !== pick.id);
  }
  // Питання дня: спільне для обох, рівень = мінімум з двох, без повторів; кілька днів — питання з фото чи відео
  let qCands = fresh('q', QUESTIONS.filter(x => !x.day && x.level <= maxLevel), DAYS).map(x => ({ item: x, w: (x.media ? 1.3 : 1) * rw('q', x.id) }));
  for (let d = 1; d <= DAYS; d++) {
    const sp = QUESTIONS.find(x => specialFor(x, d));
    if (sp) { days[d].q = sp.id; continue; }
    const pick = takeWeighted(qCands, rnd); days[d].q = pick.id;
  }
  return { seed, days, stretched, giftDays: [...giftDays].sort((a, b) => a - b), outPerWeek };
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
// Де купити подарунок: 2–3 інтернет-магазини за категорією (в Україні українські, за кордоном Google Shopping, Amazon, Etsy)
// і одне місце в місті (пошук на мапі). Саморобні подарунки (store 'd') посилань не мають.
const UA_SHOPS = {
  r: ['https://rozetka.com.ua/ua/search/?text=', 'Rozetka'], p: ['https://prom.ua/ua/search?search_term=', 'Prom.ua'], e: ['https://epicentrk.ua/ua/search/?q=', 'Епіцентр'],
  y: ['https://www.yakaboo.ua/ua/search/?q=', 'Yakaboo'], m: ['https://makeup.com.ua/ua/search/?q=', 'Makeup']
};
const SHOPS_BY_TAG = { book: 'yrp', beauty: 'mrp', scent: 'mrp', tech: 'rep', game: 'rpe', sport: 'rep', music: 'rpe', photo: 'rpe', plant: 'per', craft: 'per', art: 'pry', jewel: 'prm', cozy: 'pre', sweet: 'pre', tea: 'pre', gourmet: 'pre', alcohol: 'rpe', fun: 'rpe' };
const LOCAL_BY_TAG = { book: ['книгарня', 'bookshop'], beauty: ['магазин косметики', 'cosmetics store'], scent: ['парфумерія', 'perfumery'], tech: ['магазин електроніки', 'electronics store'], game: ['магазин настільних ігор', 'board game shop'], sport: ['спортивний магазин', 'sports shop'], music: ['музичний магазин', 'music store'], photo: ['фотосалон', 'photo studio'], plant: ['квітковий магазин', 'flower shop'], craft: ['магазин для творчості', 'craft store'], art: ['магазин для художників', 'art supply store'], jewel: ['ювелірний магазин', 'jewellery store'], sweet: ['кондитерська', 'confectionery'], tea: ['чайна крамниця', 'tea shop'], gourmet: ['гастрономія', 'delicatessen'], alcohol: ['винна крамниця', 'wine shop'], cozy: ['магазин подарунків', 'gift shop'], fun: ['магазин подарунків', 'gift shop'] };
export function giftLinks(g, city, lang = 'uk', country = 'UA') {
  const en = GIFTS_EN[g.id], abroad = country && country !== 'UA', Lb = (uk, e) => (lang === 'en' ? e : uk);
  if (g.store === 'd' || !g.q) return { online: [], local: null };
  if (g.store === 'g') {   // місцевий подарунок (обсмажка кави, гравіювання…): місце в місті першим, плюс пошук в інтернеті
    const q = (lang === 'en' && en && en[2]) ? en[2] : g.q, bare = String(g.q).replace('{city}', '').trim(), m = mapsLink(q, city, lang);
    const online = abroad ? [{ url: 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(String(q).replace('{city}', '').trim()), label: 'Google Shopping' }, { url: 'https://www.etsy.com/search?q=' + encodeURIComponent(String(q).replace('{city}', '').trim()), label: 'Etsy' }]
      : [{ url: UA_SHOPS.p[0] + encodeURIComponent(bare), label: UA_SHOPS.p[1] }, { url: UA_SHOPS.r[0] + encodeURIComponent(bare), label: UA_SHOPS.r[1] }];
    return { online, local: m && { url: m.url, label: Lb('Де купити в місті', 'Where to buy in town') } };
  }
  const tag = (g.tags || []).find(t => SHOPS_BY_TAG[t]) || 'fun', loc = LOCAL_BY_TAG[tag] || LOCAL_BY_TAG.fun;
  const local = { url: 'https://www.google.com/maps/search/' + encodeURIComponent(`${lang === 'en' || abroad ? loc[1] : loc[0]} ${city}`), label: Lb(`Де купити в місті: ${loc[0]}`, `Where to buy in town: ${loc[1]}`) };
  if (abroad) {
    const q = en && en[2] ? en[2] : g.q, e = encodeURIComponent(q);
    return { online: [{ url: 'https://www.google.com/search?tbm=shop&q=' + e, label: 'Google Shopping' }, { url: 'https://www.amazon.com/s?k=' + e, label: 'Amazon' }, { url: 'https://www.etsy.com/search?q=' + e, label: 'Etsy' }], local };
  }
  const order = [g.store, ...SHOPS_BY_TAG[tag]].filter((x, i, a) => UA_SHOPS[x] && a.indexOf(x) === i).slice(0, 3);
  return { online: order.map(k => ({ url: UA_SHOPS[k][0] + encodeURIComponent(g.q), label: UA_SHOPS[k][1] })), local };
}
export const giftView = (g, city, lang = 'uk', country = 'UA') => {
  const en = lang === 'en' ? GIFTS_EN[g.id] : null, abroad = country && country !== 'UA';
  let link;
  if (abroad) link = shopLink(en ? en[2] : g.q, lang);
  else if (en) link = g.store === 'g' ? mapsLink(en[2], city, lang) : (en[2] && g.store ? shopLink(en[2], lang) : null);
  else link = storeLink(g.store, g.q, city);
  return { title: en ? en[0] : g.title, desc: en ? en[1] : g.desc, price: g.price, link, shops: giftLinks(g, city, lang, country) };
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
    car: !!a.car,
    gifts: Math.max(1, Math.min(24, Math.round(a.gifts === undefined ? 24 : Number(a.gifts) || 24))),        // скільки подарунків за календар (24 — щодня)
    outDays: Math.max(0, Math.min(7, Math.round(a.outDays === undefined ? 3 : Number(a.outDays) || 0)))       // скільки днів на тиждень активність поза домом
  };
}
