// Змінює ID відстеження на сайті (те саме, що адмінка → Реклама → Відстеження), через D1 REST з GitHub Actions.
// Лише ці ключі й лише у правильному форматі; порожнє значення вимикає інструмент. Нічого іншого в базі не чіпає.
import { makeRestDb } from './d1-rest.mjs';
const RULES = { meta: /^\d{8,20}$/, ga4: /^G-[A-Z0-9]{6,14}$/, gads: /^AW-\d{6,14}$/, gads_label: /^[A-Za-z0-9_-]{6,40}$/ };
const [key, value = ''] = process.argv.slice(2);
if (!RULES[key]) { console.error('Ключ має бути одним із: ' + Object.keys(RULES).join(', ')); process.exit(1); }
if (value && !RULES[key].test(value)) { console.error('Неправильний формат значення для ' + key); process.exit(1); }
const db = makeRestDb({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: process.env.D1_DATABASE_ID, token: process.env.CLOUDFLARE_API_TOKEN });
const before = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('track_' + key).first();
await db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('track_' + key, value, Date.now()).run();
const after = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('track_' + key).first();
console.log(`track_${key}: ${before ? JSON.stringify(before.value) : '(не було)'} → ${JSON.stringify(after && after.value)}`);
