// Друга проба: RSS Інтернет-Білета і сторінки подій Ticketsbox (лише читання).
const UA = 'Mozilla/5.0 (compatible; ReeAdventBot/1.0; +https://reeadvent.fun)';
const get = async u => { const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) }); return { s: r.status, t: await r.text(), u: r.url }; };
const ib = await get('https://internet-bilet.ua/rss/events.rss');
console.log('IB rss', ib.s, ib.t.length); const items = [...ib.t.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]); console.log('items', items.length);
for (const it of items.slice(0, 4)) console.log('ITEM', it.replace(/\s+/g, ' ').slice(0, 700));
const tags = new Set(); for (const it of items) for (const m of it.matchAll(/<([a-zA-Z:]+)[ >]/g)) tags.add(m[1]); console.log('tags', [...tags].join(' '));
const tb = await get('https://kyiv.ticketsbox.com/concert/'); console.log('\nTB concert', tb.s, tb.t.length);
const evLinks = [...new Set([...tb.t.matchAll(/href="(https:\/\/kyiv\.ticketsbox\.com\/event\/[^"]+)"/g)].map(m => m[1]))]; console.log('event links', evLinks.length, evLinks.slice(0, 5).join(' '));
const card = tb.t.indexOf('/event/'); console.log('CARD HTML', tb.t.slice(Math.max(0, card - 1500), card + 1500).replace(/\s+/g, ' '));
if (evLinks[0]) { const ev = await get(evLinks[0]); const ld = [...ev.t.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim().slice(0, 900)); console.log('\nEVENT PAGE', ev.s, 'ld', ld.length); ld.forEach(x => console.log('LD', x)); }
for (const u of ['https://ticketsbox.com/sitemap.xml', 'https://kyiv.ticketsbox.com/rss/', 'https://lviv.ticketsbox.com/concert/', 'https://afisha.ua/', 'https://www.afisha.ua/kyiv']) { try { const x = await get(u); console.log('\n', u, x.s, x.t.length, x.t.replace(/\s+/g, ' ').slice(0, 200)); } catch (e) { console.log('\n', u, 'ERR', e.message, e.cause && e.cause.code); } }
