// Масове наповнення бази закладів із вигрузок OpenStreetMap (Geofabrik) у GitHub Actions.
// Для країни: завантажити .osm.pbf → osmium tags-filter → osmium export (geojsonseq) → розкласти заклади по містах країни → записати в D1 (REST).
// Запуск: node tools/bulk-venues.mjs [UA PL …]   (без аргументів країни обираються автоматично за чергою міст)
// Змінні: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID; необов'язково BUDGET_MIN (типово 300), MAX_PBF_GB (типово 8), WORK_DIR.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { makeRestDb } from './d1-rest.mjs';
import { pickVenues, storeCityVenues, resolveCoords } from '../src/venues.js';
import { statesFor, childExtracts, planStates } from '../src/usstates.js';
import { applyCityFixes } from '../src/city_fixes.js';
import { osmiumExpressions, findPbf, describeIndex, urlVariants, GF_BASES, parseFeature, CityIndex, queueCountries, queueCities } from '../src/bulk.js';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId, D1_DATABASE_ID: databaseId } = process.env;
if (!token || !accountId || !databaseId) { console.error('Потрібні CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID'); process.exit(1); }
const env = { DB: makeRestDb({ accountId, databaseId, token }) };
const BUDGET = (Number(process.env.BUDGET_MIN) || 300) * 60e3, MAX_GB = Number(process.env.MAX_PBF_GB) || 8, T0 = Date.now();
const WORK = process.env.WORK_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 864e5, MAX_DL_GB = Number(process.env.MAX_DOWNLOAD_GB) || 12; let downloaded = 0;   // за один запуск скачуємо не більше MAX_DOWNLOAD_GB, щоб не перевантажувати Geofabrik

// ---------- налаштування: країни, що тимчасово пропускаємо (помилка, завеликий файл) ----------
async function getSkip() { const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'bulk_skip2'").first(); try { return r ? JSON.parse(r.value) : {}; } catch { return {}; } }
async function skipCountry(cc, why, days = 1) { const s = await getSkip(); s[cc] = { until: Date.now() + days * DAY, why }; await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('bulk_skip2', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(s), Date.now()).run(); log('пропускаємо', cc, 'на', days, 'дн.:', why); }

// Мережеві запити до Geofabrik із повторами: «fetch failed» трапляється випадково
const hostFails = new Map(); const hostOf = u => { try { return new URL(u).host; } catch { return u; } };
async function fetchRetry(url, opts = {}, tries = 5, timeoutMs = 60000) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) }); if (r.ok) return r; last = new Error('HTTP ' + r.status + ' ' + url); hostFails.set(hostOf(url), (hostFails.get(hostOf(url)) || 0) + 1); }
    catch (e) { hostFails.set(hostOf(url), (hostFails.get(hostOf(url)) || 0) + 1); last = new Error(`${e.message}${e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : ''} ${url}`); }
    log('повтор', i + 1, 'з', tries, ':', last.message); await sleep(3000 * (i + 1));
  }
  throw last;
}
const UA = 'ReeAdvent-bulk/1.0 (+https://reeadvent.fun; support@reeadvent.fun)';
class Unavailable extends Error {}
let _idx = null;
async function getIndex() {
  if (_idx) return _idx;
  for (const base of GF_BASES) { try { return (_idx = await (await fetchRetry(base + 'index-v1-nogeom.json', { headers: { 'User-Agent': UA } }, 2)).json()); } catch (e) { log('каталог недоступний:', base, e.message.slice(0, 80)); } }
  throw new Unavailable('Geofabrik і дзеркало недоступні (можливе тимчасове блокування за навантаження)');
}
async function unskipCountry(cc) { const s = await getSkip(); if (!s[cc]) return; delete s[cc]; await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('bulk_skip2', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(s), Date.now()).run(); }
async function pickCountry(done) {
  const skip = await getSkip();
  const skipped = r => { const k = skip[r.country]; return k && k.until > Date.now() && !(r.country === 'US' && /більший за ліміт/.test(k.why || '')); };   // США тепер обробляються по штатах: старе «завеликий файл» ігноруємо
  return ((await queueCountries(env)).find(r => !done.has(r.country) && !skipped(r)) || {}).country || null;
}
const loadCities = cc => queueCities(env, cc);

function run(cmd, args, opts = {}) {
  log('$', cmd, args.map(a => (a.length > 70 ? a.slice(0, 67) + '…' : a)).join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} завершилась з кодом ${r.status}`);
}
const fileGB = f => fs.statSync(f).size / 1e9;

// Завантажити вигрузку → відфільтрувати → розкласти заклади по містах (CityIndex). tag — префікс тимчасових файлів, gb — розмір для обліку ліміту завантажень.
async function indexFromPbf(tag, url, gb, cities, cap) {
  const t1 = Date.now(), f = n => path.join(WORK, `${tag}-${n}`), inPbf = f('in.osm.pbf'), outPbf = f('f.osm.pbf'), seq = f('out.geojsonseq');
  try {
    run('curl', ['-L', '--fail', '--retry', '4', '--retry-delay', '20', '--retry-all-errors', '--connect-timeout', '30', '--speed-limit', '40000', '--speed-time', '120', '-A', UA, '-sS', '-o', inPbf, url]);
    downloaded += gb;
    log(`завантажено ${fileGB(inPbf).toFixed(2)} ГБ за ${Math.round((Date.now() - t1) / 1000)} с`);
    run('osmium', ['tags-filter', inPbf, ...osmiumExpressions(), '-o', outPbf, '--overwrite']); fs.rmSync(inPbf);
    try { run('osmium', ['export', outPbf, '-f', 'geojsonseq', '--add-unique-id=type_id', '--attributes=timestamp', '-o', seq, '--overwrite']); }   // з часом останньої правки (свіжість даних)
    catch { log('експорт з атрибутами не вдався, пробуємо без них'); run('osmium', ['export', outPbf, '-f', 'geojsonseq', '--add-unique-id=type_id', '-o', seq, '--overwrite']); }
    fs.rmSync(outPbf);
    log(`експорт ${fileGB(seq).toFixed(2)} ГБ`);
    const index = new CityIndex(cities, undefined, cap); let lines = 0, kept = 0;
    for await (const line of readline.createInterface({ input: fs.createReadStream(seq), crlfDelay: Infinity })) {
      lines++; const e = parseFeature(line); if (e && index.add(e)) kept++;
      if (lines % 500000 === 0) log(`  прочитано ${lines} об'єктів, потрапило в міста ${kept}`);
    }
    log(`прочитано ${lines} об'єктів, потрапило в міста ${kept}`);
    return index;
  } finally { for (const x of [inPbf, outPbf, seq]) fs.rmSync(x, { force: true }); }
}
async function finishCity(c, entries) {
  const rows = pickVenues(entries, c.lat, c.lon);
  await storeCityVenues(env, c, rows, rows.length ? null : 'no_venues');
  return rows.length > 0;
}
// Країна з файлом понад ліміт (США ~12 ГБ): беремо вигрузки штатів. Місто завершується, коли отримано всі штати, що його покривають (біля кордонів їх кілька).
async function processByStates(cc, pbf, cities, idx) {
  const extracts = childExtracts(idx, pbf.id, cc), n = Object.keys(extracts).length;
  if (!n) { await skipCountry(cc, `файл завеликий і немає вигрузок по регіонах`, 30); return; }
  const plan = planStates(cities, extracts), got = new Map(), cityOf = new Map(cities.map(c => [c.id, c]));
  log(`== ${cc}: по штатах, вигрузок ${n}, штатів у черзі ${plan.order.length}, міст ${plan.waiting.size}`);
  let ok = 0, empty = 0, failed = 0;
  for (const st of plan.order) {
    if (Date.now() - T0 > BUDGET) { log('час вичерпано, решту штатів доробить наступний запуск'); break; }
    if (downloaded >= MAX_DL_GB) { log(`ліміт завантажень (${MAX_DL_GB} ГБ) вичерпано`); break; }
    const ex = extracts[st], list = plan.byState.get(st); let gb = 0, url = null;
    for (const u of urlVariants(ex.url).sort((a, b) => (hostFails.get(hostOf(a)) || 0) - (hostFails.get(hostOf(b)) || 0))) { try { const head = await fetchRetry(u, { method: 'HEAD', headers: { 'User-Agent': UA } }, 1, 20000); url = u; gb = Number(head.headers.get('content-length') || 0) / 1e9; break; } catch {} }
    if (!url) { log('штат', st, 'недоступний'); failed++; continue; }
    log(`-- ${cc}-${st}: ${gb.toFixed(2)} ГБ, міст ${list.length}`);
    if (gb > MAX_GB) { log('штат більший за ліміт, пропуск', st); failed++; continue; }
    await sleep(15000);
    let index; try { index = await indexFromPbf(`${cc}-${st}`, url, gb, list, 30000); } catch (e) { log('ПОМИЛКА штату', st, String(e).slice(0, 300)); failed++; continue; }
    for (const c of list) {
      const acc = got.get(c.id) || got.set(c.id, new Map()).get(c.id);
      for (const e of index.byCity.get(c.id) || []) acc.set(e.type + e.id, e);                  // дублі між штатами за ідентифікатором OSM
      const w = plan.waiting.get(c.id); w.delete(st);
      if (!w.size) { const good = await finishCity(c, [...acc.values()]); good ? ok++ : empty++; got.delete(c.id); plan.waiting.delete(c.id); }
    }
    log(`   штат ${st} оброблено; завершено міст ${ok + empty}, у пам'яті чекає ${got.size}`);
  }
  log(`== ${cc}: міст із закладами ${ok}, без закладів ${empty}, незавершених ${plan.waiting.size}${failed ? `, штатів із помилкою ${failed}` : ''}`);
}

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
  const variants = urlVariants(pbf.url).sort((a, b) => (hostFails.get(hostOf(a)) || 0) - (hostFails.get(hostOf(b)) || 0));   // хост без збоїв у цьому запуску — першим
  for (const u of variants) { try { const head = await fetchRetry(u, { method: 'HEAD', headers: { 'User-Agent': UA } }, 1, 20000); url = u; log('джерело:', u); gb = Number(head.headers.get('content-length') || 0) / 1e9; break; } catch (e) { herr = e; log('адреса не відповідає:', u); } }
  if (!url) throw herr || new Error('вигрузка недоступна');
  pbf.url = url;
  log(`вигрузка ${pbf.id}: ${gb.toFixed(2)} ГБ`, pbf.shared ? '(спільна для кількох країн)' : '');
  if (gb > MAX_GB) { if (cc === 'US') return processByStates(cc, pbf, cities, idx); await skipCountry(cc, `файл ${gb.toFixed(1)} ГБ більший за ліміт ${MAX_GB} ГБ`, 30); return; }

  const index = await indexFromPbf(cc, pbf.url, gb, cities);
  let ok = 0, empty = 0;
  for (const c of cities) {
    (await finishCity(c, index.byCity.get(c.id))) ? ok++ : empty++;
    if ((ok + empty) % 25 === 0) log(`  записано міст ${ok + empty}/${cities.length}`);
  }
  log(`== ${cc}: готово за ${Math.round((Date.now() - t1) / 60000)} хв, міст із закладами ${ok}, без закладів ${empty}`);
}

// ---------- головний цикл ----------
// Нова версія правил відбору (закриті, свіжість, 40 на категорію): готові міста ставимо на повторне наповнення
const BULK_VER = '3';
{ const v = await env.DB.prepare("SELECT value FROM settings WHERE key = 'bulk_ver'").first();
  if (!v || v.value !== BULK_VER) { await env.DB.prepare("UPDATE venue_cities SET status = 'pending' WHERE status = 'ready' AND alias_of IS NULL").run(); await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('bulk_ver', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(BULK_VER, Date.now()).run(); log('нова версія правил: усі готові міста поставлено на повторне наповнення'); } }
{ const fx = await applyCityFixes(env); if (!fx.skipped) log(`виправлено координат міст: ${fx.fixed}, додано міст: ${fx.added}`); }
const forced = process.argv.slice(2).map(s => s.toUpperCase()).filter(s => /^[A-Z]{2}$/.test(s)), done = new Set();
async function save(v) { await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_last', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(v).slice(0, 900), Date.now()).run().catch(() => {}); }
while (Date.now() - T0 < BUDGET) {
  if (downloaded >= MAX_DL_GB) { log(`ліміт завантажень за запуск (${MAX_DL_GB} ГБ) вичерпано, решту доробить наступний запуск`); break; }
  const cc = forced.length ? forced.shift() : (process.argv.length > 2 ? null : await pickCountry(done));
  if (!cc) { log('черга порожня'); break; }
  done.add(cc);
  if (done.size > 1) await sleep(20000);   // пауза між країнами: Geofabrik обмежує частоту завантажень
  try { await processCountry(cc); await unskipCountry(cc); await save({ at: Date.now(), out: { bulk: cc, status: 'done' } }); }
  catch (e) { if (e instanceof Unavailable) { log('ЗУПИНКА:', e.message); await save({ at: Date.now(), error: e.message }); break; } log('ПОМИЛКА', cc, String(e && e.stack || e).slice(0, 500)); await skipCountry(cc, String(e && e.message || e).slice(0, 120), 0.25); await save({ at: Date.now(), error: `bulk ${cc}: ${String(e && e.message || e).slice(0, 200)}` }); }
}
log('завершено');
