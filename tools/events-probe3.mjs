// Третя проба Ticketsbox: повна картка події (дата, час, місце), меню категорій, список міст (лише читання).
const UA = 'Mozilla/5.0 (compatible; ReeAdventBot/1.0; +https://reeadvent.fun)';
const get = async u => { const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) }); return { s: r.status, t: await r.text() }; };
const home = await get('https://kyiv.ticketsbox.com/');
const cards = home.t.split('<div class="card ').slice(1, 4); console.log('cards on home', home.t.split('<div class="card ').length - 1);
for (const c of cards) console.log('\nCARD', c.slice(0, 2600).replace(/\s+/g, ' '));
const nav = [...new Set([...home.t.matchAll(/href="https:\/\/kyiv\.ticketsbox\.com\/([a-z\-]+)\/"/g)].map(m => m[1]))]; console.log('\nNAV', nav.join(' '));
const sm = await get('https://ticketsbox.com/sitemap.xml'); const subs = [...new Set([...sm.t.matchAll(/https:\/\/([a-z\-]+)\.ticketsbox\.com/g)].map(m => m[1]))]; console.log('\nSUBDOMAINS', subs.length, subs.join(' '));
const ev = await get('https://kyiv.ticketsbox.com/event/symphony-rock-resonance.html'); const m = ev.t.match(/"@type":\s*"MusicEvent"[\s\S]*?<\/script>/); console.log('\nEVENT LD', m && m[0].replace(/\s+/g, ' ').slice(0, 1800));
const th = await get('https://kyiv.ticketsbox.com/theatre/'); console.log('\ntheatre', th.s, th.t.split('<div class="card ').length - 1);
const dated = [...home.t.matchAll(/data-date="([^"]+)"/g)].map(x => x[1]); console.log('data-date sample', dated.slice(0, 30).join(' '));
