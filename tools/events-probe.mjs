// Діагностика сайтів афіш: чи віддають сторінки події в машиночитному вигляді (JSON-LD Event, __NEXT_DATA__, API). Лише читання.
const URLS = (process.argv[2] || '').split(',').filter(Boolean).length ? process.argv[2].split(',') : [
  'https://afisha.ua/kyiv', 'https://afisha.ua/kyiv/concerts', 'https://afisha.ua/lviv',
  'https://concert.ua/uk/catalog/kyiv/all-categories', 'https://concert.ua/uk/kyiv', 'https://concert.ua/uk',
  'https://kontramarka.ua/uk/kyiv', 'https://kontramarka.ua/uk', 'https://kyiv.karabas.com/', 'https://karabas.com/uk/', 'https://lviv.karabas.com/',
  'https://internet-bilet.ua/ua/', 'https://www.ticketsbox.com/uk/kyiv/', 'https://kyiv.ticketsbox.com/'
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
for (const u of URLS) {
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'uk-UA,uk;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const h = await r.text();
    const ld = [...h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    let events = [];
    for (const raw of ld) { try { const j = JSON.parse(raw.trim()); const walk = x => { if (!x) return; if (Array.isArray(x)) return x.forEach(walk); if (typeof x === 'object') { const t = [].concat(x['@type'] || []); if (t.some(v => /Event$/.test(v))) events.push(x); if (x['@graph']) walk(x['@graph']); if (x.itemListElement) walk(x.itemListElement.map(e => e.item || e)); } }; walk(j); } catch {} }
    const next = /__NEXT_DATA__/.test(h), nuxt = /__NUXT__/.test(h), cf = /cf-chl|challenge-platform|Just a moment/i.test(h);
    console.log(`\n=== ${u}\nstatus ${r.status} final ${r.url} len ${h.length} ld ${ld.length} events ${events.length} next ${next} nuxt ${nuxt} cfChallenge ${cf}`);
    for (const e of events.slice(0, 3)) console.log('  EVENT', JSON.stringify({ name: e.name, startDate: e.startDate, url: e.url, place: e.location && (e.location.name || e.location.address), offers: e.offers && (e.offers.lowPrice || e.offers.price) }).slice(0, 400));
    const apis = [...new Set([...h.matchAll(/["'](\/api\/[a-z0-9_\-\/]+)["']/gi)].map(m => m[1]))].slice(0, 15); if (apis.length) console.log('  api paths:', apis.join(' '));
    const links = [...new Set([...h.matchAll(/href="([^"]*(?:event|afisha|koncert|concert|show|vystava)[^"]*)"/gi)].map(m => m[1]))].slice(0, 8); console.log('  links:', links.join(' '));
    if (!events.length) console.log('  snippet:', h.replace(/\s+/g, ' ').slice(0, 300));
  } catch (e) { console.log(`\n=== ${u}\nERROR ${e.message}`); }
}
