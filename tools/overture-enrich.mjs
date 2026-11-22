// Збагачення бази закладів даними Overture Maps у GitHub Actions: DuckDB читає Parquet з S3 (Python), Node зіставляє із закладами OSM і пише в D1.
// Змінні: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID; необов'язково BUDGET_MIN (типово 240), BATCH (міст за запит, типово 25), WORK_DIR.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { makeRestDb } from './d1-rest.mjs';
import { enrichCity, cityBox } from '../src/overture.js';
import { CityIndex } from '../src/bulk.js';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId, D1_DATABASE_ID: databaseId } = process.env;
if (!token || !accountId || !databaseId) { console.error('Потрібні CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID'); process.exit(1); }
const env = { DB: makeRestDb({ accountId, databaseId, token }) };
const BUDGET = (Number(process.env.BUDGET_MIN) || 240) * 60e3, BATCH = Number(process.env.BATCH) || 25, T0 = Date.now();
const WORK = process.env.WORK_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ov-'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const DAY = 864e5, FRESH = 25 * DAY;
let total = 0, failedBatches = 0;

while (Date.now() - T0 < BUDGET && failedBatches < 3) {
  const { results: cities } = await env.DB.prepare("SELECT id, country, name, lat, lon FROM venue_cities WHERE status = 'ready' AND alias_of IS NULL AND lat IS NOT NULL AND (ov_at IS NULL OR ov_at < ?) ORDER BY country, id LIMIT ?").bind(Date.now() - FRESH, BATCH).all();
  if (!cities.length) { log('усі міста збагачено'); break; }
  const inFile = path.join(WORK, 'cities.json'), outFile = path.join(WORK, 'places.ndjson');
  fs.writeFileSync(inFile, JSON.stringify(cities.map(c => ({ id: c.id, lat: c.lat, lon: c.lon, box: cityBox(c.lat, c.lon) }))));
  log(`партія: ${cities.length} міст (${[...new Set(cities.map(c => c.country))].join(',')})`);
  const r = spawnSync('python3', ['tools/overture-extract.py', inFile, outFile], { stdio: 'inherit' });
  if (r.status !== 0) { failedBatches++; log('ПОМИЛКА вибірки Overture, код', r.status); continue; }
  const index = new CityIndex(cities, undefined, 60000);
  for await (const line of readline.createInterface({ input: fs.createReadStream(outFile), crlfDelay: Infinity })) { if (!line) continue; try { index.add(JSON.parse(line)); } catch {} }
  for (const c of cities) {
    try { const res = await enrichCity(env, c, index.byCity.get(c.id)); total++; log(`  ${c.country} ${c.name}: ${JSON.stringify(res)}`); }
    catch (e) { log('  ПОМИЛКА', c.name, String(e.message || e).slice(0, 150)); await env.DB.prepare('UPDATE venue_cities SET ov_at = ? WHERE id = ?').bind(Date.now() - FRESH + DAY, c.id).run(); }  // повторимо завтра
  }
}
log(`завершено: збагачено ${total} міст`);
await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_last', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify({ at: Date.now(), out: { overture: total } }), Date.now()).run().catch(() => {});
