// Ставить публікацію в календар на найкраще місце (те саме, що кнопка «✦ Найкраще місце» в адмінці) і показує розклад на 10 днів.
// Запуск з GitHub Actions: node tools/place-post.mjs <id> [best|free]
import { makeRestDb } from './d1-rest.mjs';
import { bestPlace } from '../src/placement.js';
import { loadManifest, effective, getPlan, pubState, isComplete } from '../src/igpublish.js';
const [id, mode = 'best'] = process.argv.slice(2);
const env = { DB: makeRestDb({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: process.env.D1_DATABASE_ID, token: process.env.CLOUDFLARE_API_TOKEN }) };
const man = await loadManifest(fetch, 'https://reeadvent.fun', env);
if (!man.find(p => p.id === id)) { console.error('У списку публікацій на сайті немає ' + id + ' (дочекайтеся деплою)'); process.exit(1); }
const fmt = t => new Date(t).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const r = await bestPlace(env, id, mode === 'free' ? 'free' : 'best', man);
if (!r.ok) { console.error('Помилка: ' + r.error); process.exit(1); }
console.log(`✓ ${id} → ${fmt(r.placed.at)}`); if (r.placed.reasons) console.log('  чому: ' + r.placed.reasons.join('; ')); if (r.placed.warn) console.log('  увага: ' + r.placed.warn);
const st = await pubState(env), eff = effective(man, await getPlan(env)), now = Date.now();
console.log('Розклад на 10 днів:');
for (const p of eff.filter(p => p.at && p.at > now - 36e5 && p.at < now + 10 * 864e5 && !isComplete(st, p, true)).sort((a, b) => a.at - b.at)) console.log(`  ${fmt(p.at)} · ${p.type} · ${p.title || p.id}${p.id === id ? '  ← новий' : ''}`);
