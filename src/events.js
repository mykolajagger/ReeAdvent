// Реальні події дня для спільної активності «виходимо»: концерти, театр, шоу, вистави, фестивалі, клуби з Ticketsbox
// (сторінки категорій міста + розмітка schema.org Event на сторінці події). Concert.ua, Kontramarka, Karabas і Афіша
// закриті для серверних запитів (захист від ботів), тож на них лише посилання, які людина відкриває сама.
// Кеш у D1: список міста — 12 год (спільний для всіх), деталі події — 7 днів. Жодних даних користувачів сайтам не передаємо.

const UA = 'Mozilla/5.0 (compatible; ReeAdventBot/1.0; +https://reeadvent.fun)';
const LIST_TTL = 12 * 36e5, EV_TTL = 7 * 864e5;
export const PATHS = ['concert', 'theater', 'show', 'spektakl', 'festivals', 'club', 'vistavka', 'new-year'];
const SLUGS = {
  'київ': 'kyiv', 'kyiv': 'kyiv', 'kiev': 'kyiv', 'львів': 'lviv', 'lviv': 'lviv', 'одеса': 'odesa', 'odesa': 'odesa', 'odessa': 'odesa', 'дніпро': 'dnepr', 'dnipro': 'dnepr',
  'вінниця': 'vinnitsa', 'vinnytsia': 'vinnitsa', 'житомир': 'zhytomyr', 'zhytomyr': 'zhytomyr', 'полтава': 'poltava', 'poltava': 'poltava', 'тернопіль': 'ternopil', 'ternopil': 'ternopil',
  'ужгород': 'uzhhorod', 'uzhhorod': 'uzhhorod', 'хмельницький': 'khmelnitsky', 'khmelnytskyi': 'khmelnitsky', 'черкаси': 'cherkasy', 'cherkasy': 'cherkasy', 'чернігів': 'chernigiv', 'chernihiv': 'chernigiv',
  'миколаїв': 'mykolaiv', 'mykolaiv': 'mykolaiv', 'кременчук': 'kremenchug', 'kremenchuk': 'kremenchug', 'біла церква': 'bila-tserkva', 'bila tserkva': 'bila-tserkva',
  "кам'янець-подільський": 'kamyanets-podilsky', 'кам’янець-подільський': 'kamyanets-podilsky', 'kamianets-podilskyi': 'kamyanets-podilsky', 'дубно': 'dubno', 'яремче': 'yaremche'
};
export const citySlug = city => SLUGS[String(city || '').toLowerCase().replace(/\s+/g, ' ').trim()] || null;

// Які категорії пасують до активності (за тегами активності); решта йде нижче в списку
const PREF = { music: ['concert', 'club', 'festivals'], night: ['club', 'concert'], cult: ['theater', 'spektakl', 'vistavka', 'show'], cine: ['show', 'theater'], play: ['show', 'festivals'], food: ['festivals'], act: ['show', 'festivals'], relax: ['concert', 'theater'] };
const CAT_UA = { concert: 'Концерт', theater: 'Театр', show: 'Шоу', spektakl: 'Вистава', festivals: 'Фестиваль', club: 'Клуб', vistavka: 'Виставка', 'new-year': 'Новорічне' };
const CAT_EN = { concert: 'Concert', theater: 'Theatre', show: 'Show', spektakl: 'Play', festivals: 'Festival', club: 'Club', vistavka: 'Exhibition', 'new-year': 'New Year' };

const unesc = s => String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(name + '="([^"]*)"')); return m ? unesc(m[1]) : ''; };
/** Картки зі сторінки категорії: { url, name, cat, price, dates: [YYYY-MM-DD кандидати] }. data-date буває з місяцем від 0, тож даємо обидва варіанти. */
export function parseList(html, path) {
  const out = [], re = /<div class="card card--long"[^>]*>/g; let m;
  while ((m = re.exec(html))) {
    const tag = m[0], rest = html.slice(m.index, m.index + 4000), href = rest.match(/href="(https:\/\/[a-z\-]+\.ticketsbox\.com\/event\/[^"]+\.html)"/);
    if (!href) continue;
    const d = attr(tag, 'data-date').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/), dates = [];
    if (d) { const [, mo, dd, yy] = d.map(Number); for (const mm of [mo + 1, mo]) if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) dates.push(`${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`); }
    const img = rest.match(/src="(https:\/\/img\.ticketsbox\.com\/cache\/[^"]+)"/);
    out.push({ url: href[1], name: attr(tag, 'data-catalog-event-name').slice(0, 120), cat: path, price: attr(tag, 'data-catalog-event-price').replace(/\s*uah/i, ' ₴').slice(0, 40), dates: [...new Set(dates)], img: img ? img[1] : null });
  }
  return out;
}
/** Деталі зі сторінки події (schema.org *Event): дата й час початку, місце, адреса, ціна від. */
export function parseEvent(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    for (const x of [].concat(j['@graph'] || j)) {
      const t = [].concat(x && x['@type'] || []);
      if (!t.some(v => /Event$/.test(v)) || !x.startDate) continue;
      const loc = x.location || {}, addr = loc.address || {}, off = [].concat(x.offers || [])[0] || {};
      return { start: String(x.startDate), name: unesc(x.name || ''), venue: unesc(loc.name || ''), address: unesc([addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ')), price: off.price || off.lowPrice || null, status: String(x.eventStatus || '') };
    }
  }
  return null;
}

const kvGet = async (env, k) => { try { const r = await env.DB.prepare('SELECT v, at FROM ev_cache WHERE k = ?').bind(k).first(); return r ? { v: JSON.parse(r.v), at: r.at } : null; } catch { return null; } };
const kvSet = (env, k, v) => env.DB.prepare('INSERT INTO ev_cache (k, v, at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, JSON.stringify(v), Date.now()).run().catch(() => {});
const getHtml = async (url, fetchImpl) => { const r = await fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'uk-UA,uk;q=0.9' }, signal: AbortSignal.timeout(7000) }); if (!r.ok) throw new Error('http ' + r.status); return r.text(); };

async function cityList(env, slug, fetchImpl, now) {
  const c = await kvGet(env, 'list:' + slug); if (c && now - c.at < LIST_TTL) return c.v;
  const pages = await Promise.allSettled(PATHS.map(p => getHtml(`https://${slug}.ticketsbox.com/${p}/`, fetchImpl).then(h => parseList(h, p))));
  const seen = new Set(), list = [];
  for (const p of pages) if (p.status === 'fulfilled') for (const e of p.value) if (!seen.has(e.url)) { seen.add(e.url); list.push(e); }
  if (list.length || !c) await kvSet(env, 'list:' + slug, list);
  return list.length ? list : (c ? c.v : []);
}
async function details(env, url, fetchImpl, now) {
  const c = await kvGet(env, 'ev:' + url); if (c && now - c.at < EV_TTL) return c.v;
  try { const d = parseEvent(await getHtml(url, fetchImpl)); await kvSet(env, 'ev:' + url, d); return d; } catch { return c ? c.v : null; }
}

/** Події на дату (YYYY-MM-DD) у місті: до n штук, спершу категорії, що пасують до активності. */
export async function eventsOn(env, { city, date, tags = [], lang = 'uk', n = 4, fetchImpl = fetch, now = Date.now() }) {
  const slug = citySlug(city); if (!slug || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slug: null, events: [] };
  const list = await cityList(env, slug, fetchImpl, now);
  const pref = [...new Set(tags.flatMap(t => PREF[t] || []))], rank = e => { const i = pref.indexOf(e.cat); return i < 0 ? 50 + PATHS.indexOf(e.cat) : i; };
  const cand = list.filter(e => e.dates.includes(date)).sort((a, b) => rank(a) - rank(b)).slice(0, 8), out = [];
  for (const e of cand) {
    if (out.length >= n) break;
    const d = await details(env, e.url, fetchImpl, now);
    if (!d || !d.start.startsWith(date) || /Cancel|Postpon/i.test(d.status)) continue;     // дата з картки підтверджується сторінкою події
    const tm = d.start.match(/T(\d{2}:\d{2})/);
    out.push({ name: d.name || e.name, cat: (lang === 'en' ? CAT_EN : CAT_UA)[e.cat] || e.cat, time: tm && tm[1] !== '00:00' ? tm[1] : null, venue: d.venue, address: d.address, price: d.price ? (lang === 'en' ? `from ${d.price} ₴` : `від ${d.price} ₴`) : e.price, url: e.url, img: e.img });
  }
  return { slug, events: out };
}

/** Посилання «ще події»: сайти квитків (людина відкриває сама; серверам вони недоступні). */
export const moreLinks = slug => [
  slug && { label: 'Ticketsbox', url: `https://${slug}.ticketsbox.com/` },
  { label: 'Concert.ua', url: 'https://concert.ua/uk' }, { label: 'Kontramarka', url: 'https://kontramarka.ua/uk' },
  { label: 'Karabas', url: 'https://karabas.com/uk/' }, { label: 'Афіша', url: 'https://afisha.ua/' }
].filter(Boolean);
