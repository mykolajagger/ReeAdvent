// Створює одноразовий промокод на 100% для подарункового сертифіката. Код генерується тут і в журнал НЕ потрапляє:
// друкується лише зашифрованим відкритим ключем (PUBKEY, base64 PEM), розшифрувати може тільки власник закритого ключа.
import crypto from 'node:crypto';
import { makeRestDb } from './d1-rest.mjs';
const { PUBKEY, LABEL = 'Подарунковий сертифікат', UNTIL = '2027-11-30' } = process.env;
if (!PUBKEY) { console.error('Немає PUBKEY'); process.exit(1); }
if (!/^\d{4}-\d\d-\d\d$/.test(UNTIL)) { console.error('UNTIL має бути YYYY-MM-DD'); process.exit(1); }
const db = makeRestDb({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: process.env.D1_DATABASE_ID, token: process.env.CLOUDFLARE_API_TOKEN });
const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', pick = n => Array.from(crypto.randomBytes(n), b => A[b % A.length]).join('');
let code; for (let i = 0; i < 5; i++) { code = `GIFT-${pick(4)}-${pick(4)}`; if (!(await db.prepare('SELECT 1 AS x FROM promo_codes WHERE code = ?').bind(code).first())) break; }
const id = crypto.randomUUID(), now = Date.now(), exp = Date.parse(UNTIL + 'T23:59:59+02:00');
await db.prepare('INSERT INTO promo_codes (id, code, type, value, max_uses, used_count, starts_at, expires_at, active, label, created_at) VALUES (?,?,?,?,?,0,NULL,?,1,?,?)')
  .bind(id, code, 'percent', 100, 1, exp, String(LABEL).slice(0, 80), now).run();
const row = await db.prepare('SELECT type, value, max_uses, used_count, active, expires_at, label FROM promo_codes WHERE id = ?').bind(id).first();
console.log('Створено промокод (id ' + id + '):', JSON.stringify({ ...row, expires: new Date(row.expires_at).toISOString() }));
const enc = crypto.publicEncrypt({ key: Buffer.from(PUBKEY, 'base64').toString(), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(code));
console.log('ENC:' + enc.toString('base64'));
