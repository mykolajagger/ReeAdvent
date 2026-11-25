// Meta Ads через API: пошук ресурсів, режим перевірки (validate_only), створення на паузі, пропуск наявних. Імітація Graph API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { run, adsetTargeting, linkFor, placementsFor } from '../tools/meta-ads.mjs';
const spec = JSON.parse(fs.readFileSync(new URL('../marketing/ads/meta-campaigns.json', import.meta.url), 'utf8'));
const calls = []; let n = 100, videoPolls = 0, failCreatives = false; const existing = [], adsets = [], adsList = [];
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const fake = async (url, init = {}) => {
  url = String(url); const u = new URL(url); const body = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : Object.fromEntries(u.searchParams);
  if (u.hostname === 'reeadvent.fun') { assert.ok(!url.includes('TKN'), 'токен не йде на наш сайт'); return new Response(Buffer.from('JPEGDATA')); }
  assert.ok(body.access_token === 'TKN', 'токен у кожному запиті до Meta'); delete body.access_token;
  calls.push({ m: init.method || 'GET', p: u.pathname.replace('/v23.0', ''), body });
  const p = u.pathname.replace('/v23.0', '');
  if (p === '/me') return J({ id: 'su1', name: 'reeadvent-web' });
  if (p === '/me/adaccounts') return J({ data: [{ id: 'act_42', name: 'ReeAdvent', currency: 'USD', account_status: 1, timezone_name: 'Europe/Kyiv' }] });
  if (p === '/me/accounts') return J({ data: [{ id: 'pg1', name: 'ReeAdvent', instagram_business_account: { id: 'ig1', username: 'reeadvent' } }] });
  if (p === '/act_42/customaudiences') return J({ data: [{ id: 'aud9', name: 'Купили' }, { id: 'aud8', name: 'Відвідувачі сайту 14 днів' }] });
  if (p === '/search') return J({ data: [{ key: 52, name: 'Ukrainian' }] });
  if (p === '/act_42/campaigns' && (init.method || 'GET') === 'GET') return J({ data: existing });
  if (p === '/act_42/campaigns') { if (JSON.parse(body.execution_options || '[]').includes('validate_only')) return J({ success: true }); const id = 'c' + n++; existing.push({ id, name: body.name, status: 'PAUSED' }); return J({ id }); }
  if (p === '/act_42/advideos') return J({ id: 'v1' });
  if (p === '/v1') return J({ status: { video_status: ++videoPolls >= 2 ? 'ready' : 'processing' } });
  if (p === '/act_42/adimages') return J({ images: { bytes: { hash: 'h' + n++ } } });
  const seg = p.split('/');
  if (seg.length === 3 && seg[2] === 'adsets' && seg[1].startsWith('c')) return J({ data: adsets.filter(a => a.campaign === seg[1]).map(a => ({ id: a.id, name: a.name, targeting: a.targeting, effective_status: 'ACTIVE' })) });
  if (seg.length === 2 && seg[1].startsWith('x') && (init.method || 'GET') === 'POST') { const a = adsets.find(x => x.id === seg[1]); if (!JSON.parse(body.execution_options || '[]').includes('validate_only')) a.targeting = JSON.parse(body.targeting); return J({ success: true }); }
  if (seg.length === 3 && seg[2] === 'ads' && seg[1].startsWith('x')) return J({ data: adsList.filter(a => a.adset === seg[1]).map(a => ({ id: a.id, name: a.name })) });
  if (p === '/act_42/adsets') { const id = 'x' + n++; adsets.push({ id, name: body.name, campaign: body.campaign_id, targeting: JSON.parse(body.targeting) }); return J({ id }); }
  if (p === '/act_42/adcreatives') { if (failCreatives) return J({ error: { message: 'dev mode', code: 100, error_subcode: 1885183 } }, 400); return J({ id: 'x' + n++ }); }
  if (p === '/act_42/ads') { const id = 'x' + n++; adsList.push({ id, name: body.name, adset: body.adset_id }); return J({ id }); }
  return J({ error: { message: 'unexpected ' + p } }, 400);
};
const log = () => {};
// перевірка: нічого не створює
let r = await run({ mode: 'check', spec, token: 'TKN', fetchImpl: fake, log });
assert.equal(r.discovered.acc.id, 'act_42'); assert.equal(r.discovered.ig.id, 'ig1'); assert.equal(r.discovered.locales.Ukrainian, 52);
assert.ok(calls.filter(c => c.m === 'POST').every(c => c.p === '/act_42/campaigns' && JSON.parse(c.body.execution_options).includes('validate_only')), 'check лише validate_only');
assert.equal(existing.length, 0);
// створення
calls.length = 0; r = await run({ mode: 'create', spec, token: 'TKN', fetchImpl: fake, log, sleep: async () => {} });
const posts = calls.filter(c => c.m === 'POST'), camps = posts.filter(c => c.p === '/act_42/campaigns');
assert.equal(camps.length, 2); for (const c of camps) { assert.equal(c.body.status, 'PAUSED'); assert.equal(c.body.objective, 'OUTCOME_TRAFFIC'); assert.equal(c.body.special_ad_categories, '[]'); }
assert.deepEqual(camps.map(c => [c.body.name, c.body.daily_budget]), [['ua_cold', '1200'], ['eu_ua', '1000']]);
const sets = posts.filter(c => c.p === '/act_42/adsets'); assert.equal(sets.length, 2);
const t0 = JSON.parse(sets[0].body.targeting), t1 = JSON.parse(sets[1].body.targeting);
assert.equal(sets[0].body.optimization_goal, 'LANDING_PAGE_VIEWS'); assert.equal(sets[0].body.status, 'PAUSED');
assert.equal(sets[0].body.dsa_beneficiary, undefined, 'Україна: без полів DSA'); assert.equal(sets[1].body.dsa_beneficiary, 'ReeAdvent'); assert.equal(sets[1].body.dsa_payor, 'ReeAdvent');
assert.deepEqual(t0.geo_locations.countries, ['UA']); assert.equal(t0.age_min, 22); assert.equal(t0.age_max, 45); assert.ok(!t0.publisher_platforms.includes('audience_network'));
assert.deepEqual(t0.excluded_custom_audiences, [{ id: 'aud9' }]); assert.equal(t0.locales, undefined); assert.deepEqual(t1.locales, [52]); assert.equal(t1.geo_locations.countries.length, 9);
const crs = posts.filter(c => c.p === '/act_42/adcreatives'); assert.equal(crs.length, 8);
const reel = JSON.parse(crs[0].body.object_story_spec); assert.equal(reel.video_data.video_id, 'v1'); assert.equal(reel.instagram_user_id, 'ig1'); assert.equal(reel.video_data.call_to_action.value.link, 'https://reeadvent.fun/?utm_source=meta&utm_medium=paid&utm_campaign=ua_cold&utm_content=reel1');
const car = JSON.parse(crs[1].body.object_story_spec); assert.equal(car.link_data.child_attachments.length, 5); assert.ok(car.link_data.child_attachments.every(a => a.image_hash));
const eu = JSON.parse(crs[4].body.object_story_spec); assert.match(eu.video_data.call_to_action.value.link, /utm_campaign=eu_ua&utm_content=reel1/);
assert.equal(posts.filter(c => c.p === '/act_42/advideos').length, 2, 'кожне відео завантажується один раз на запуск'); assert.equal(posts.filter(c => c.p === '/act_42/adimages').length, 6, '5 слайдів + картка пари, один раз');
const ads = posts.filter(c => c.p === '/act_42/ads'); assert.equal(ads.length, 8);
const r2 = JSON.parse(crs[3].body.object_story_spec); assert.equal(r2.video_data.call_to_action.type, 'LEARN_MORE'); assert.match(r2.video_data.call_to_action.value.link, /utm_content=reel2/); assert.equal(r2.video_data.title, 'Старт 1 грудня'); assert.ok(ads.every(a => a.body.status === 'PAUSED')); assert.match(ads[0].body.tracking_specs, /2111183512849298/);
// повторний запуск нічого не дублює
calls.length = 0; r = await run({ mode: 'create', spec, token: 'TKN', fetchImpl: fake, log, sleep: async () => {} });
assert.ok(r.report.every(x => x.skipped)); assert.equal(calls.filter(c => c.m === 'POST').length, 0);
assert.equal(linkFor(spec, 'eu_ua', 'couple1'), 'https://reeadvent.fun/?utm_source=meta&utm_medium=paid&utm_campaign=eu_ua&utm_content=couple1');
// часткове створення (помилка на креативах) → повторний запуск дотворює оголошення в наявних кампанії й групі
existing.length = 0; adsets.length = 0; adsList.length = 0; failCreatives = true;
await assert.rejects(run({ mode: 'create', spec, token: 'TKN', fetchImpl: fake, log, sleep: async () => {} }), /dev mode/);
assert.equal(existing.length, 1); assert.equal(adsets.length, 1); assert.equal(adsList.length, 0);
failCreatives = false; calls.length = 0;
r = await run({ mode: 'create', spec, token: 'TKN', fetchImpl: fake, log, sleep: async () => {} });
assert.equal(existing.length, 2, 'ua_cold не дублюється, eu_ua створено'); assert.equal(adsets.length, 2, 'група ua_cold не дублюється'); assert.equal(adsList.length, 8);
assert.equal(r.report[0].ads.length, 4); assert.equal(calls.filter(c => c.m === 'POST' && c.p === '/act_42/campaigns').length, 1);
// Threads: нові групи одразу з Threads; наявні — оновлення майданчиків, решта таргетингу не чіпається
assert.deepEqual(t0.publisher_platforms, ['facebook', 'instagram', 'messenger', 'threads']); assert.deepEqual(t0.threads_positions, ['threads_stream']);
for (const a of adsets) { a.targeting.publisher_platforms = ['facebook', 'instagram', 'messenger']; delete a.targeting.threads_positions; a.targeting.age_min = 25; }
calls.length = 0; r = await run({ mode: 'placements-check', spec, token: 'TKN', fetchImpl: fake, log });
assert.ok(calls.filter(c => c.m === 'POST').every(c => JSON.parse(c.body.execution_options).includes('validate_only'))); assert.ok(adsets.every(a => !a.targeting.publisher_platforms.includes('threads')), 'check нічого не змінює');
r = await run({ mode: 'placements', spec, token: 'TKN', fetchImpl: fake, log });
assert.equal(r.report.length, 2); assert.ok(adsets.every(a => a.targeting.publisher_platforms.includes('threads') && a.targeting.age_min === 25 && a.targeting.threads_positions[0] === 'threads_stream'));
calls.length = 0; r = await run({ mode: 'placements', spec, token: 'TKN', fetchImpl: fake, log }); assert.ok(r.report.every(x => x.unchanged)); assert.equal(calls.filter(c => c.m === 'POST').length, 0);
assert.throws(() => placementsFor({ placements: ['facebook', 'threads'] }), /Instagram/);
assert.deepEqual(placementsFor({ placements: ['facebook', 'instagram'] }), { publisher_platforms: ['facebook', 'instagram'] });
// зупинка старих кампаній: лише активні, створені до 2026, ReeAdvent не чіпаємо
{ const camps = [{ id: 'o1', name: 'Jagger old', status: 'ACTIVE', effective_status: 'ACTIVE', created_time: '2023-06-01T09:08:00+0000' }, { id: 'o2', name: 'Jagger paused', status: 'PAUSED', effective_status: 'PAUSED', created_time: '2021-09-13T08:18:00+0000' }, { id: 'n1', name: 'ua_cold', status: 'ACTIVE', effective_status: 'ACTIVE', created_time: '2026-11-24T03:43:00+0000' }, { id: 'n2', name: 'boost', status: 'ACTIVE', effective_status: 'ACTIVE', created_time: '2026-11-24T10:00:00+0000' }], posted = [];
  const pf = async (url, init = {}) => { const u = new URL(String(url)), p = u.pathname.replace('/v23.0', ''); if (p === '/me/adaccounts') return J({ data: [{ id: 'act_42', name: 'A' }] }); if (p === '/act_42/campaigns') return J({ data: camps }); if ((init.method || 'GET') === 'POST') { posted.push([p, Object.fromEntries(new URLSearchParams(String(init.body))).status]); return J({ success: true }); } return J({}); };
  let x = await run({ mode: 'pause-old-check', spec, token: 'TKN', fetchImpl: pf, log }); assert.deepEqual(x.report.map(c => c.id), ['o1']); assert.equal(posted.length, 0, 'check нічого не змінює');
  x = await run({ mode: 'pause-old', spec, token: 'TKN', fetchImpl: pf, log }); assert.deepEqual(posted, [['/o1', 'PAUSED']]); }
console.log('OK meta-ads');
