// Лише читання: стан публікацій (Instagram/Facebook/Threads) у продакшн-базі. Токени не виводяться.
import { makeRestDb } from './d1-rest.mjs';
const db = makeRestDb({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: process.env.D1_DATABASE_ID, token: process.env.CLOUDFLARE_API_TOKEN });
const get = async k => { const r = await db.prepare('SELECT value, updated_at FROM settings WHERE key = ?').bind(k).first(); return r || {}; };
const j = s => { try { return JSON.parse(s || 'null'); } catch { return null; } };
const t = x => x ? new Date(x).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
const pub = j((await get('ig_pub')).value) || {}, meta = j((await get('th_meta')).value) || {}, auto = (await get('ig_auto')).value, tok = (await get('th_token')).value;
console.log(`Threads: ${tok ? 'токен є' : 'токена немає'}, @${meta.username || '?'}, підключено ${t(meta.connected_at || meta.saved_at)}, діє до ${t(meta.expires_at)}`);
console.log(`Автопублікація: ${auto || '(ключ ig_auto не знайдено)'}`);
const done = Object.entries(pub.done || {}), fb = Object.entries(pub.fb || {}), th = Object.entries(pub.th || {});
console.log(`Instagram: ${done.length} опубліковано, останній ${t(Math.max(0, ...done.map(([, v]) => v.at || 0)))}; Facebook: ${fb.length}`);
console.log(`Threads: ${th.length} опубліковано`); for (const [id, v] of th) console.log(`  • ${id} — ${t(v.at)} ${v.link || ''}`);
if (pub.err) console.log(`Остання помилка: ${t(pub.err.at)} ${pub.err.id}: ${pub.err.error}`);
