// Масове наповнення бази закладів із вигрузок OpenStreetMap (Geofabrik) у GitHub Actions.
// Для країни: завантажити .osm.pbf → osmium tags-filter → osmium export (geojsonseq) → розкласти заклади по містах країни → записати в D1 (REST).
// Запуск: node tools/bulk-venues.mjs [UA PL …]   (без аргументів країни обираються автоматично за чергою міст)
// Змінні: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID; необов'язково BUDGET_MIN (типово 300), MAX_PBF_GB (типово 8), WORK_DIR.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { makeRestDb } from './d1-rest.mjs';
import { pickVenues, storeCityVenues, resolveCoords } from '../src/venues.js';
import { osmiumExpressions, findPbf, describeIndex, urlVariants, parseFeature, CityIndex, queueCountries, queueCities } from '../src/bulk.js';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId, D1_DATABASE_ID: databaseId } = process.env;
if (!token || !accountId || !databaseId) { console.error('Потрібні CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID'); process.exit(1); }
const env = { DB: makeRestDb({ accountId, databaseId, token }) };
const BUDGET = (Number(process.env.BUDGET_MIN) || 300) * 60e3, MAX_GB = Number(process.env.MAX_PBF_GB) || 8, T0 = Date.now();
const WORK = process.env.WORK_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 864e5;

// ---------- налаштування: країни, що тимчасово пропускаємо (помилка, завеликий файл) ----------
async function getSkip() { const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'bulk_skip2'").first(); try { return r ? JSON.parse(r.value) : {}; } catch { return {}; } }
async function skipCountry(cc, why, days = 1) { const s = await getSkip(); s[cc] = { until: Date.now() + days * DAY, why }; await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('bulk_skip2', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(s), Date.now()).run(); log('пропускаємо', cc, 'на', days, 'дн.:', why); }

// Мережеві запити до Geofabrik із повторами: «fetch failed» трапляється випадково
async function fetchRetry(url, opts = {}, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) }); if (r.ok) return r; last = new Error('HTTP ' + r.status + ' ' + url); }
    catch (e) { last = new Error(`${e.message}${e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : ''} ${url}`); }
    log('повтор', i + 1, 'з', tries, ':', last.message); await sleep(3000 * (i + 1));
  }
  throw last;
}
let _idx = null; const getIndex = async () => _idx || (_idx = await (await fetchRetry('https://download.geofabrik.de/index-v1-nogeom.json')).json());
async function unskipCountry(cc) { const s = await getSkip(); if (!s[cc]) return; delete s[cc]; await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('bulk_skip2', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(s), Date.now()).run(); }
async function pickCountry(done) {
  const skip = await getSkip();
  return ((await queueCountries(env)).find(r => !done.has(r.country) && !(skip[r.country] && skip[r.country].until > Date.now())) || {}).country || null;
}
const loadCities = cc => queueCities(env, cc);

function run(cmd, args, opts = {}) {
  log('$', cmd, args.map(a => (a.length > 70 ? a.slice(0, 67) + '…' : a)).join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} завершилась з кодом ${r.status}`);
}
const fileGB = f => fs.statSync(f).size / 1e9;

async function processCountry(cc) {
  const t1 = Date.now();
  let cities = await loadCities(cc);
  log(`== ${cc}: міст до наповнення ${cities.length}`);
  // координати: міста без них геокодуємо (Nominatim, не частіше 1 запиту/с); дублікати стають аліасами
  const ready = [];
  for (const c of cities) {
    if (c.lat == null || c.lon == null) { const co = await resolveCoords(env, c); await sleep(1100); if (co.result) { log('  ', c.name, co.result.status); continue; } c.lat = co.lat; c.lon = co.lon; }
    ready.push(c);
  }
  cities = ready; if (!cities.length) return;

  const idx = await getIndex();
  let cname = null; try { cname = new Intl.DisplayNames(['en'], { type: 'region' }).of(cc); } catch {}
  const pbf = findPbf(idx, cc, cname);
  if (!pbf) { log('УВАГА: у каталозі Geofabrik немає країни', cc, cname, '|', describeIndex(idx)); await skipCountry(cc, 'немає вигрузки Geofabrik', 1); return; }
  let url = null, gb = 0, herr;
  for (const u of urlVariants(pbf.url)) { try { const head = await fetchRetry(u, { method: 'HEAD' }, 3); url = u; gb = Number(head.headers.get('content-length') || 0) / 1e9; break; } catch (e) { herr = e; log('адреса не відповідає:', u); } }
  if (!url) throw herr || new Error('вигрузка недоступна');
  pbf.url = url;
  log(`вигрузка ${pbf.id}: ${gb.toFixed(2)} ГБ`, pbf.shared ? '(спільна для кількох країн)' : '');
  if (gb > MAX_GB) { await skipCountry(cc, `файл ${gb.toFixed(1)} ГБ більший за ліміт ${MAX_GB} ГБ`, 30); return; }

  const f = n => path.join(WORK, `${cc}-${n}`), inPbf = f('in.osm.pbf'), outPbf = f('f.osm.pbf'), seq = f('out.geojsonseq');
  try {
    run('curl', ['-L', '--fail', '--retry', '5', '--retry-delay', '20', '--retry-all-errors', '--connect-timeout', '60', '-sS', '-o', inPbf, pbf.url]);
    log(`завантажено ${fileGB(inPbf).toFixed(2)} ГБ за ${Math.round((Date.now() - t1) / 1000)} с`);
    run('osmium', ['tags-filter', inPbf, ...osmiumExpressions(), '-o', outPbf, '--overwrite']); fs.rmSync(inPbf);
    run('osmium', ['export', outPbf, '-f', 'geojsonseq', '--add-unique-id=type_id', '-o', seq, '--overwrite']); fs.rmSync(outPbf);
    log(`експорт ${fileGB(seq).toFixed(2)} ГБ`);

    const index = new CityIndex(cities); let lines = 0, kept = 0;
    for await (const line of readline.createInterface({ input: fs.createReadStream(seq), crlfDelay: Infinity })) {
      lines++; const e = parseFeature(line); if (e && index.add(e)) kept++;
      if (lines % 500000 === 0) log(`  прочитано ${lines} об'єктів, потрапило в міста ${kept}`);
    }
    log(`прочитано ${lines} об'єктів, потрапило в міста ${kept}`);

    let ok = 0, empty = 0;
    for (const c of cities) {
      const rows = pickVenues(index.byCity.get(c.id), c.lat, c.lon);
      await storeCityVenues(env, c, rows, rows.length ? null : 'no_venues');
      rows.length ? ok++ : empty++;
      if ((ok + empty) % 25 === 0) log(`  записано міст ${ok + empty}/${cities.length}`);
    }
    log(`== ${cc}: готово за ${Math.round((Date.now() - t1) / 60000)} хв, міст із закладами ${ok}, без закладів ${empty}`);
  } finally { for (const x of [inPbf, outPbf, seq]) fs.rmSync(x, { force: true }); }
}

// ---------- головний цикл ----------
const forced = process.argv.slice(2).map(s => s.toUpperCase()).filter(s => /^[A-Z]{2}$/.test(s)), done = new Set();
async function save(v) { await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_last', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(v).slice(0, 900), Date.now()).run().catch(() => {}); }
while (Date.now() - T0 < BUDGET) {
  const cc = forced.length ? forced.shift() : (process.argv.length > 2 ? null : await pickCountry(done));
  if (!cc) { log('черга порожня'); break; }
  done.add(cc);
  if (done.size > 1) await sleep(20000);   // пауза між країнами: Geofabrik обмежує частоту завантажень
  try { await processCountry(cc); await unskipCountry(cc); await save({ at: Date.now(), out: { bulk: cc, status: 'done' } }); }
  catch (e) { log('ПОМИЛКА', cc, String(e && e.stack || e).slice(0, 500)); await skipCountry(cc, String(e && e.message || e).slice(0, 120), 0.25); await save({ at: Date.now(), error: `bulk ${cc}: ${String(e && e.message || e).slice(0, 200)}` }); }
}
log('завершено');
