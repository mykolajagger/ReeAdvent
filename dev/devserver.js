// Локальний сервер: статика public/ + /api (через той самий handle() і SQLite у пам'яті).
// PORT=8788 node dev/devserver.js ; NOW_OVERRIDE=2026-12-12T08:00:00Z — «підмінити» поточний час.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js'; import { seed } from './seed.js'; import { handle } from '../src/api.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), pub = path.join(root, 'public');
const db = makeDb(root), port = +process.env.PORT || 8788;
const env = { DB: db, DEV: '1', PRICE_UAH: '399', BASE_URL: `http://localhost:${port}`, PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: process.env.NOW_OVERRIDE, ADMIN_EMAILS: 'admin@test.com', ACQUIRING_FEE_PERCENT: '1.3', TAX_PERCENT: '6' };
if (process.env.SEED === '1') seed(db._raw);
// тестові промокоди (лише в пам'яті dev-сервера)
db._raw.prepare('INSERT OR IGNORE INTO promo_codes (id, code, type, value, max_uses, active, label, created_at) VALUES (?,?,?,?,?,?,?,?)').run('d1', 'WELCOME', 'percent', 20, null, 1, 'dev', Date.now());
db._raw.prepare('INSERT OR IGNORE INTO promo_codes (id, code, type, value, max_uses, active, label, created_at) VALUES (?,?,?,?,?,?,?,?)').run('d2', 'FREE', 'percent', 100, null, 1, 'dev', Date.now());
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, env.BASE_URL);
  if (url.pathname === '/dev/now') { env.NOW_OVERRIDE = url.searchParams.get('set'); res.writeHead(200); return res.end('ok'); }
  if (url.pathname === '/dev/outbox') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(db._raw.prepare('SELECT * FROM outbox ORDER BY id').all())); }
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
    const h = Object.fromEntries(r.headers); res.writeHead(r.status, h); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let p = url.pathname; if (p.endsWith('/')) p += 'index.html';
  const fp = path.join(pub, path.normalize(p));
  if (!fp.startsWith(pub) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream' }); res.end(fs.readFileSync(fp));
}).listen(port, () => console.log('dev: http://localhost:' + port));
