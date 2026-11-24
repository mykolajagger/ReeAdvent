// Meta Ads через API: пошук ресурсів, режим перевірки (validate_only), створення на паузі, пропуск наявних. Імітація Graph API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { run, adsetTargeting, linkFor } from '../tools/meta-ads.mjs';
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
  if (seg.length === 3 && seg[2] === 'adsets' && seg[1].startsWith('c')) return J({ data: adsets.filter(a => a.campaign === seg[1]).map(a => ({ id: a.id, name: a.name })) });
  if (seg.length === 3 && seg[2] === 'ads' && seg[1].startsWith('x')) return J({ data: adsList.filter(a => a.adset === seg[1]).map(a => ({ id: a.id, name: a.name })) });
  if (p === '/act_42/adsets') { const id = 'x' + n++; adsets.push({ id, name: body.name, campaign: body.campaign_id }); return J({ id }); }
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
assert.deepEqual(t0.geo_locations.countries, ['UA']); assert.equal(t0.age_min, 22); assert.equal(t0.age_max, 45); assert.ok(!t0.publisher_platforms.includes('audience_network'));
assert.deepEqual(t0.excluded_custom_audiences, [{ id: 'aud9' }]); assert.equal(t0.locales, undefined); assert.deepEqual(t1.locales, [52]); assert.equal(t1.geo_locations.countries.length, 9);
const crs = posts.filter(c => c.p === '/act_42/adcreatives'); assert.equal(crs.length, 6);
const reel = JSON.parse(crs[0].body.object_story_spec); assert.equal(reel.video_data.video_id, 'v1'); assert.equal(reel.instagram_user_id, 'ig1'); assert.equal(reel.video_data.call_to_action.value.link, 'https://reeadvent.fun/?utm_source=meta&utm_medium=paid&utm_campaign=ua_cold&utm_content=reel1');
const car = JSON.parse(crs[1].body.object_story_spec); assert.equal(car.link_data.child_attachments.length, 5); assert.ok(car.link_data.child_attachments.every(a => a.image_hash));
const eu = JSON.parse(crs[3].body.object_story_spec); assert.match(eu.video_data.call_to_action.value.link, /utm_campaign=eu_ua&utm_content=reel1/);
assert.equal(posts.filter(c => c.p === '/act_42/advideos').length, 1, 'відео завантажується один раз на запуск'); assert.equal(posts.filter(c => c.p === '/act_42/adimages').length, 6, '5 слайдів + картка пари, один раз');
const ads = posts.filter(c => c.p === '/act_42/ads'); assert.equal(ads.length, 6); assert.ok(ads.every(a => a.body.status === 'PAUSED')); assert.match(ads[0].body.tracking_specs, /2111183512849298/);
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
assert.equal(existing.length, 2, 'ua_cold не дублюється, eu_ua створено'); assert.equal(adsets.length, 2, 'група ua_cold не дублюється'); assert.equal(adsList.length, 6);
assert.equal(r.report[0].ads.length, 3); assert.equal(calls.filter(c => c.m === 'POST' && c.p === '/act_42/campaigns').length, 1);
console.log('OK meta-ads');
