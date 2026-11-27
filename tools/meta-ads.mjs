// Створення рекламних кампаній Meta (Facebook/Instagram) через Marketing API за специфікацією marketing/ads/meta-campaigns.json.
// Режими: check — лише знайти ресурси (рекламний акаунт, сторінку, Instagram, аудиторії) і перевірити, що кампанію можна створити (validate_only);
//         create — створити кампанії, групи оголошень, креативи й оголошення. УСЕ СТВОРЮЄТЬСЯ НА ПАУЗІ: вмикає людина в Ads Manager.
// Кампанія з такою самою назвою, що вже існує, пропускається (повторний запуск нічого не дублює).
// Токен (META_ADS_TOKEN) лише з секретів GitHub; у лог не потрапляє.
import fs from 'node:fs';

const env = process.env;
export const API = (ver = 'v23.0') => `https://graph.facebook.com/${ver}`;
const enc = v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));

export function graph({ token, ver, fetchImpl = fetch, log = () => {} }) {
  const base = API(ver);
  const call = async (method, path, params = {}) => {
    const url = new URL(base + path); let body;
    const p = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, enc(v));
    p.set('access_token', token);
    if (method === 'GET') url.search = p.toString(); else body = p;
    const r = await fetchImpl(url.toString(), { method, body, headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = j.error || {}; const err = new Error(`${method} ${path}: ${e.error_user_title ? e.error_user_title + ' — ' : ''}${e.error_user_msg || e.message || r.status}${e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : ''}`); err.graph = e; throw err; }
    return j;
  };
  return { get: (p, q) => call('GET', p, q), post: (p, q) => call('POST', p, q) };
}

/** Знаходить рекламний акаунт, сторінку, Instagram, аудиторії й локалі. Явні ID з env мають пріоритет. */
export async function discover(g, spec, { adAccount, pageId, igId } = {}) {
  const me = await g.get('/me', { fields: 'id,name' });
  const accounts = (await g.get('/me/adaccounts', { fields: 'id,name,currency,account_status,timezone_name', limit: 50 })).data || [];
  const acc = adAccount ? accounts.find(a => a.id === 'act_' + String(adAccount).replace(/^act_/, '')) || { id: 'act_' + String(adAccount).replace(/^act_/, '') } : accounts.length === 1 ? accounts[0] : null;
  if (!acc) throw new Error(`Рекламних акаунтів доступно: ${accounts.length}. Вкажіть потрібний у полі ad_account: ${accounts.map(a => `${a.id} (${a.name})`).join(', ') || 'немає — видайте системному користувачу доступ до акаунта'}`);
  const pages = (await g.get('/me/accounts', { fields: 'id,name,instagram_business_account{id,username}', limit: 50 })).data || [];
  const page = pageId ? pages.find(p => p.id === String(pageId)) || { id: String(pageId) } : pages.length === 1 ? pages[0] : null;
  if (!page) throw new Error(`Сторінок доступно: ${pages.length}. Вкажіть page_id: ${pages.map(p => `${p.id} (${p.name})`).join(', ') || 'немає — видайте доступ до сторінки ReeAdvent'}`);
  let ig = igId ? { id: String(igId) } : page.instagram_business_account || null;
  if (!ig) { try { const a = (await g.get(`/${acc.id}/instagram_accounts`, { fields: 'id,username' })).data || []; ig = a[0] || null; } catch {} }
  const audiences = (await g.get(`/${acc.id}/customaudiences`, { fields: 'id,name', limit: 200 })).data || [];
  const exclude = (spec.exclude_audiences || []).map(n => ({ name: n, a: audiences.find(x => x.name === n) }));
  const include = {}; for (const n of [...new Set(spec.campaigns.flatMap(c => c.include_audiences || []))]) include[n] = audiences.find(x => x.name === n) || null;
  const locales = {};
  for (const name of [...new Set(spec.campaigns.flatMap(c => c.locales || []))]) {
    const r = (await g.get('/search', { type: 'adlocale', q: name })).data || [];
    const hit = r.find(x => String(x.name).toLowerCase() === name.toLowerCase()) || r[0]; if (hit) locales[name] = hit.key;
  }
  const existing = (await g.get(`/${acc.id}/campaigns`, { fields: 'id,name,status', limit: 200 })).data || [];
  return { me, acc, page, ig, exclude, include, audiences, locales, existing };
}

export const linkFor = (spec, camp, key) => `${spec.site}/?utm_source=meta&utm_medium=paid&utm_campaign=${encodeURIComponent(camp)}&utm_content=${encodeURIComponent(key)}`;

export const PLATFORMS = ['facebook', 'instagram', 'messenger', 'threads'];
/** Майданчики зі специфікації (spec.placements). Threads Meta дозволяє лише разом з Instagram; позиція в Threads одна — стрічка. */
export function placementsFor(spec) {
  const pp = ((spec && spec.placements) || PLATFORMS).filter(x => PLATFORMS.includes(x));
  if (pp.includes('threads') && !pp.includes('instagram')) throw new Error('Threads у рекламі можливий лише разом з Instagram: додайте "instagram" у placements');
  return { publisher_platforms: pp, ...(pp.includes('threads') ? { threads_positions: ['threads_stream'] } : {}) };
}

/** Оновлює майданчики (publisher_platforms) у вже наявних групах оголошень «<кампанія>_all»: решта таргетингу береться з Meta як є.
 *  check — лише перевірка (validate_only), placements — застосувати. Бюджет і статус не змінюються. */
export async function updatePlacements(g, spec, d, camps, { apply = false, log = () => {} } = {}) {
  const want = placementsFor(spec), out = [];
  for (const c of camps) {
    const ex = d.existing.find(x => x.name === c.name); if (!ex) { log(`• ${c.name}: кампанії ще немає — пропускаю`); out.push({ name: c.name, missing: true }); continue; }
    const st = ((await g.get(`/${ex.id}/adsets`, { fields: 'id,name,targeting,effective_status', limit: 50 })).data || []).find(x => x.name === c.name + '_all');
    if (!st) { log(`• ${c.name}: групи ${c.name}_all немає — пропускаю`); out.push({ name: c.name, missing: true }); continue; }
    const t = { ...(st.targeting || {}) }, before = t.publisher_platforms || [];
    if (want.publisher_platforms.every(x => before.includes(x)) && before.every(x => want.publisher_platforms.includes(x))) { log(`• ${c.name}: майданчики вже ${before.join(', ')} — нічого не змінюю`); out.push({ name: c.name, adset: st.id, unchanged: true }); continue; }
    t.publisher_platforms = want.publisher_platforms; if (want.threads_positions) t.threads_positions = want.threads_positions; else delete t.threads_positions;
    await g.post(`/${st.id}`, { targeting: t, ...(apply ? {} : { execution_options: ['validate_only'] }) });
    log(`• ${c.name}: група ${st.id} (${st.effective_status}) — ${before.join(', ') || 'автоматичні'} → ${want.publisher_platforms.join(', ')} ${apply ? 'оновлено ✓' : 'перевірено ✓ (нічого не змінено)'}`);
    out.push({ name: c.name, adset: st.id, from: before, to: want.publisher_platforms, applied: apply });
  }
  return out;
}

export function adsetTargeting(c, d) {
  const t = { geo_locations: { countries: c.countries }, age_min: c.age_min || 18, age_max: c.age_max || 65,
    ...placementsFor(d.spec),                                              // без Audience Network; Threads — разом з Instagram
    targeting_automation: { advantage_audience: 0 } };                     // вік і країни — жорсткі межі
  const loc = (c.locales || []).map(n => d.locales[n]).filter(Boolean); if (loc.length) t.locales = loc;
  const ex = d.exclude.filter(x => x.a).map(x => ({ id: x.a.id })); if (ex.length) t.excluded_custom_audiences = ex;
  const inc = (c.include_audiences || []).map(n => d.include && d.include[n]).filter(Boolean).map(a => ({ id: a.id })); if ((c.include_audiences || []).length) { if (!inc.length) throw new Error(`Аудиторію «${c.include_audiences.join(', ')}» не знайдено: створіть її в Ads Manager → Аудиторії`); t.custom_audiences = inc; }
  return t;
}

// Реклама на аудиторію в ЄС (Закон про цифрові послуги): обов'язково вказати, хто рекламується і хто платить (видно в бібліотеці реклами).
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);
export const dsaFor = (spec, c) => (c.countries || []).some(x => EU.has(x)) ? { dsa_beneficiary: spec.dsa_beneficiary || 'ReeAdvent', dsa_payor: spec.dsa_payor || spec.dsa_beneficiary || 'ReeAdvent' } : {};

export function storySpec(spec, cr, d, link, media) {
  const cta = { type: cr.cta || 'LEARN_MORE', value: { link } }, base = { page_id: d.page.id, ...(d.ig ? { instagram_user_id: d.ig.id } : {}) };
  if (cr.type === 'video') return { ...base, video_data: { video_id: media.video[cr.video], image_url: spec.site + cr.thumb, message: cr.message, title: cr.headline, link_description: cr.description, call_to_action: cta } };
  if (cr.type === 'carousel') return { ...base, link_data: { link, message: cr.message, multi_share_end_card: false, multi_share_optimized: false, call_to_action: cta,
    child_attachments: cr.images.map(i => ({ link, image_hash: media.image[i], name: cr.headline, description: cr.description, call_to_action: cta })) } };
  return { ...base, link_data: { link, message: cr.message, name: cr.headline, description: cr.description, image_hash: media.image[cr.image], call_to_action: cta } };
}

async function uploadMedia(g, spec, d, keys, { fetchImpl = fetch, log, sleep = ms => new Promise(r => setTimeout(r, ms)), media = { video: {}, image: {} } }) {
  const need = keys.map(k => spec.creatives[k]);
  for (const cr of need) {
    if (cr.type === 'video' && !media.video[cr.video]) {
      const v = await g.post(`/${d.acc.id}/advideos`, { file_url: spec.site + cr.video, name: cr.video.split('/').pop() }); media.video[cr.video] = v.id; log(`відео ${cr.video} → ${v.id}`);
      for (let i = 0; i < 40; i++) { const s = await g.get(`/${v.id}`, { fields: 'status' }); const st = s.status && s.status.video_status; if (st === 'ready') break; if (st === 'error') throw new Error('Meta не змогла обробити відео ' + cr.video); await sleep(5000); }
    }
    for (const img of cr.type === 'carousel' ? cr.images : cr.type === 'image' ? [cr.image] : []) {
      if (media.image[img]) continue;
      const r = await fetchImpl(spec.site + img); if (!r.ok) throw new Error('Не вдалося завантажити ' + spec.site + img + ': ' + r.status);
      const bytes = Buffer.from(await r.arrayBuffer()).toString('base64');
      const up = await g.post(`/${d.acc.id}/adimages`, { bytes }); const first = Object.values(up.images || {})[0]; if (!first) throw new Error('Meta не повернула hash для ' + img);
      media.image[img] = first.hash; log(`зображення ${img} → ${first.hash}`);
    }
  }
  return media;
}

/** Лише читання: усі кампанії в доступних рекламних акаунтах зі статусом, бюджетом, результатами й посиланнями оголошень. */
/** Ставить на паузу старі кампанії (створені до дати before), напр. попереднього бізнесу в тому самому рекламному акаунті.
 *  Кампанії зі специфікації (ReeAdvent) і новіші не чіпає. apply=false — лише показати список. */
export async function pauseOld(g, log, { adAccount, before = '2026-01-01', keep = [], apply = false } = {}) {
  const accounts = (await g.get('/me/adaccounts', { fields: 'id,name', limit: 50 })).data || [];
  const list = adAccount ? accounts.filter(a => a.id === 'act_' + String(adAccount).replace(/^act_/, '')) : accounts, cut = Date.parse(before + 'T00:00:00Z'), out = [];
  for (const a of list) {
    const camps = (await g.get(`/${a.id}/campaigns`, { fields: 'id,name,status,effective_status,created_time', limit: 200 })).data || [];
    for (const c of camps) {
      if (c.status !== 'ACTIVE' || keep.includes(c.name) || !(Date.parse(c.created_time) < cut)) continue;
      if (apply) await g.post(`/${c.id}`, { status: 'PAUSED' });
      log(`• ${c.name} (${c.id}, створено ${String(c.created_time).slice(0, 10)}, ${c.effective_status}) — ${apply ? 'на паузі ✓' : 'буде поставлено на паузу'}`);
      out.push({ id: c.id, name: c.name, paused: apply });
    }
  }
  if (!out.length) log('Активних кампаній, створених до ' + before + ', немає');
  return out;
}

/** Детальний звіт по кампаніях зі специфікації: разом, по днях, майданчиках, оголошеннях, віку/статі, країнах. Лише читання. */
export async function detailReport(g, spec, log, { adAccount } = {}) {
  const accounts = (await g.get('/me/adaccounts', { fields: 'id,name,currency,timezone_name', limit: 50 })).data || [];
  const acc = adAccount ? { id: 'act_' + String(adAccount).replace(/^act_/, '') } : accounts[0];
  const F = 'spend,impressions,reach,frequency,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,cpm,actions,video_thruplay_watched_actions,video_p100_watched_actions';
  const act = (a, t) => { const x = (a || []).find(y => y.action_type === t); return x ? Number(x.value) : 0; };
  const money = v => '$' + Number(v || 0).toFixed(2);
  const fmt = i => [money(i.spend), 'покази ' + (i.impressions || 0), 'охоплення ' + (i.reach || 0), 'частота ' + Number(i.frequency || 0).toFixed(2),
    'кліки ' + (i.inline_link_clicks || 0), 'CTR ' + Number(i.inline_link_click_ctr || 0).toFixed(2) + '%', 'CPC $' + Number(i.cost_per_inline_link_click || 0).toFixed(3),
    'CPM ' + money(i.cpm), 'перегляди сторінки ' + act(i.actions, 'landing_page_view'),
    'оформлення ' + (act(i.actions, 'offsite_conversion.fb_pixel_initiate_checkout') || act(i.actions, 'initiate_checkout')),
    'покупки ' + (act(i.actions, 'offsite_conversion.fb_pixel_purchase') || act(i.actions, 'purchase'))].join(' · ');
  const names = spec.campaigns.map(c => c.name);
  const camps = ((await g.get(`/${acc.id}/campaigns`, { fields: 'id,name,effective_status,daily_budget', limit: 200 })).data || []).filter(c => names.includes(c.name));
  const out = [];
  for (const c of camps) {
    const tot = ((await g.get(`/${c.id}/insights`, { fields: F, date_preset: 'maximum' })).data || [])[0] || {};
    log(`## ${c.name} — ${c.effective_status}, ${money((c.daily_budget || 0) / 100)}/день`);
    log('РАЗОМ: ' + fmt(tot));
    for (const d of (await g.get(`/${c.id}/insights`, { fields: F, date_preset: 'maximum', time_increment: 1 })).data || []) log(`  день ${d.date_start}: ${fmt(d)}`);
    for (const d of (await g.get(`/${c.id}/insights`, { fields: 'spend,impressions,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click', date_preset: 'maximum', breakdowns: 'publisher_platform' })).data || [])
      log(`  майданчик ${d.publisher_platform}: ${money(d.spend)} · покази ${d.impressions} · кліки ${d.inline_link_clicks || 0} · CTR ${Number(d.inline_link_click_ctr || 0).toFixed(2)}% · CPC $${Number(d.cost_per_inline_link_click || 0).toFixed(3)}`);
    for (const a of (await g.get(`/${c.id}/ads`, { fields: 'id,name,effective_status,ad_review_feedback', limit: 50 })).data || []) {
      const ai = ((await g.get(`/${a.id}/insights`, { fields: F, date_preset: 'maximum' })).data || [])[0] || {};
      const fb = a.ad_review_feedback && a.ad_review_feedback.global ? ' ⚠ ' + Object.values(a.ad_review_feedback.global).join('; ') : '';
      const vid = ai.video_thruplay_watched_actions ? ` · ThruPlay ${act(ai.video_thruplay_watched_actions, 'video_view')} · до кінця ${act(ai.video_p100_watched_actions, 'video_view')}` : '';
      log(`  оголошення ${a.name} (${a.effective_status})${fb}: ${fmt(ai)}${vid}`);
    }
    for (const d of ((await g.get(`/${c.id}/insights`, { fields: 'spend,inline_link_clicks,inline_link_click_ctr', date_preset: 'maximum', breakdowns: 'age,gender' })).data || []).filter(x => Number(x.spend) > 0.3))
      log(`  ${d.gender} ${d.age}: ${money(d.spend)} · кліки ${d.inline_link_clicks || 0} · CTR ${Number(d.inline_link_click_ctr || 0).toFixed(2)}%`);
    if (c.name === 'eu_ua') for (const d of (await g.get(`/${c.id}/insights`, { fields: 'spend,inline_link_clicks', date_preset: 'maximum', breakdowns: 'country' })).data || []) log(`  країна ${d.country}: ${money(d.spend)} · кліки ${d.inline_link_clicks || 0}`);
    out.push({ campaign: c.name, total: tot });
  }
  return out;
}

export async function listReport(g, log, { adAccount } = {}) {
  const accounts = (await g.get('/me/adaccounts', { fields: 'id,name,currency,timezone_name,account_status,amount_spent', limit: 50 })).data || [];
  const list = adAccount ? accounts.filter(a => a.id === 'act_' + String(adAccount).replace(/^act_/, '')) : accounts;
  const act = (arr, t) => { const x = (arr || []).find(a => a.action_type === t); return x ? Number(x.value) : 0; };
  const out = [];
  for (const a of list) {
    log(`Рекламний акаунт ${a.id} (${a.name || ''}, ${a.currency}, ${a.timezone_name})`);
    const camps = (await g.get(`/${a.id}/campaigns`, { fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time', limit: 100 })).data || [];
    if (!camps.length) log('  кампаній немає');
    for (const c of camps) {
      let ins = {}; try { ins = ((await g.get(`/${c.id}/insights`, { fields: 'spend,impressions,reach,inline_link_clicks,ctr,cpc,actions', date_preset: 'maximum' })).data || [])[0] || {}; } catch {}
      const budget = c.daily_budget ? `$${(c.daily_budget / 100).toFixed(2)}/день` : c.lifetime_budget ? `$${(c.lifetime_budget / 100).toFixed(2)} загалом` : 'бюджет на рівні груп';
      log(`• ${c.name} — ${c.effective_status} (${c.objective}), ${budget}, створено ${String(c.created_time || '').slice(0, 16).replace('T', ' ')}`);
      log(`    витрачено $${Number(ins.spend || 0).toFixed(2)}, покази ${ins.impressions || 0}, охоплення ${ins.reach || 0}, кліки за посиланням ${ins.inline_link_clicks || 0}, перегляди сторінки ${act(ins.actions, 'landing_page_view')}, CTR ${ins.ctr ? Number(ins.ctr).toFixed(2) + '%' : '—'}, CPC ${ins.cpc ? '$' + Number(ins.cpc).toFixed(2) : '—'}`);
      const ads = (await g.get(`/${c.id}/ads`, { fields: 'id,name,effective_status,creative{id,object_story_spec,effective_instagram_media_id,link_url,url_tags,call_to_action_type},ad_review_feedback', limit: 50 })).data || [];
      for (const ad of ads) {
        const s = (ad.creative && ad.creative.object_story_spec) || {}, ld = s.link_data || {}, vd = s.video_data || {};
        const link = (ad.creative && ad.creative.link_url) || ld.link || (vd.call_to_action && vd.call_to_action.value && vd.call_to_action.value.link) || (ld.call_to_action && ld.call_to_action.value && ld.call_to_action.value.link) || '';
        const fb = ad.ad_review_feedback && ad.ad_review_feedback.global ? ' ⚠ ' + Object.values(ad.ad_review_feedback.global).join('; ') : '';
        log(`    – ${ad.name}: ${ad.effective_status}${link ? ' → ' + link : ''}${ad.creative && ad.creative.url_tags ? ' + ' + ad.creative.url_tags : ''}${ad.creative && ad.creative.effective_instagram_media_id ? ' (пост Instagram)' : ''}${fb}`);
      }
      out.push({ account: a.id, ...c, insights: ins, ads });
    }
  }
  return out;
}

export async function run({ mode = 'check', only = [], ads = [], spec, token, ver, adAccount, pageId, igId, fetchImpl = fetch, log = console.log, sleep } = {}) {
  const g = graph({ token, ver, fetchImpl, log });
  if (mode === 'report') return { report: await listReport(g, log, { adAccount }) };
  if (mode === 'report-detail') return { report: await detailReport(g, spec, log, { adAccount }) };
  if (mode === 'pause-old-check' || mode === 'pause-old') return { report: await pauseOld(g, log, { adAccount, keep: spec.campaigns.map(c => c.name), apply: mode === 'pause-old' }) };
  const d = await discover(g, spec, { adAccount, pageId, igId }); d.spec = spec;
  log(`Токен: ${d.me.name || d.me.id}`);
  log(`Рекламний акаунт: ${d.acc.id}${d.acc.name ? ` (${d.acc.name}, ${d.acc.currency}, ${d.acc.timezone_name})` : ''}`);
  if (d.acc.currency && d.acc.currency !== 'USD') log(`⚠ Валюта акаунта ${d.acc.currency}: бюджети в специфікації в доларах, перевірте суми.`);
  log(`Сторінка: ${d.page.id}${d.page.name ? ` (${d.page.name})` : ''}; Instagram: ${d.ig ? d.ig.id + (d.ig.username ? ' @' + d.ig.username : '') : 'НЕ ЗНАЙДЕНО — оголошення підуть лише від сторінки Facebook'}`);
  for (const x of d.exclude) log(`Виключити аудиторію «${x.name}»: ${x.a ? x.a.id : 'не знайдено (створіть її в Ads Manager → Аудиторії), поки без виключення'}`);
  for (const [n, k] of Object.entries(d.locales)) log(`Мова «${n}»: key ${k}`);
  log('Аудиторії в акаунті: ' + ((d.audiences || []).map(x => `«${x.name}»`).join(', ') || 'немає'));
  for (const [n, a] of Object.entries(d.include || {})) log(`Показувати аудиторії «${n}»: ${a ? a.id : 'НЕ ЗНАЙДЕНО'}`);
  const camps = spec.campaigns.filter(c => !only.length || only.includes(c.name)), report = [], media = { video: {}, image: {} };   // медіа вантажимо один раз на запуск
  if (mode === 'activate' || mode === 'pause-ads') {   // activate — увімкнути, pause-ads — поставити на паузу вказані оголошення
    const want = mode === 'activate' ? 'ACTIVE' : 'PAUSED';   // увімкнути вказані оголошення (за назвою) у групах <кампанія>_all; лише за проханням власника, бюджети не змінюються
    if (!ads.length) throw new Error('Вкажіть назви оголошень у полі ads (через кому)');
    const out = [];
    for (const c of camps) {
      const ex = d.existing.find(x => x.name === c.name); if (!ex) { log(`• ${c.name}: кампанії немає`); continue; }
      const st = ((await g.get(`/${ex.id}/adsets`, { fields: 'id,name', limit: 50 })).data || []).find(x => x.name === c.name + '_all'); if (!st) { log(`• ${c.name}: групи немає`); continue; }
      for (const ad of ((await g.get(`/${st.id}/ads`, { fields: 'id,name,status,effective_status', limit: 100 })).data || []).filter(a => ads.includes(a.name))) {
        if (ad.status === want) { log(`• ${c.name} / ${ad.name}: уже ${want === 'ACTIVE' ? 'увімкнене' : 'на паузі'} (${ad.effective_status})`); continue; }
        await g.post(`/${ad.id}`, { status: want }); const now = await g.get(`/${ad.id}`, { fields: 'status,effective_status' });
        log(`• ${c.name} / ${ad.name} (${ad.id}): ${want === 'ACTIVE' ? 'увімкнено' : 'на паузі'} ✓ — ${now.effective_status}`); out.push({ campaign: c.name, ad: ad.name, id: ad.id, status: now.effective_status });
      }
    }
    return { discovered: d, report: out };
  }
  if (mode === 'diag') {   // діагностика доступів: що саме Meta не дозволяє (креативи без оголошень нічого не коштують і не показуються)
    const tryIt = async (label, fn) => { try { const r = await fn(); log(`✓ ${label}${r && r.id ? ' (' + r.id + ')' : ''}`); return r; } catch (e) { log(`✗ ${label}: ${e.message}`); return null; } };
    await tryIt('дозволи токена', async () => { const p = (await g.get('/me/permissions')).data || []; log('   ' + p.map(x => x.permission + ':' + x.status).join(', ')); });
    await tryIt('сторінка ' + d.page.id, async () => { const x = await g.get('/' + d.page.id, { fields: 'name,is_published' }); log('   ' + JSON.stringify(x)); });
    if (d.ig) await tryIt('Instagram ' + d.ig.id, async () => { const x = await g.get('/' + d.ig.id, { fields: 'username' }); log('   ' + JSON.stringify(x)); });
    await tryIt('Instagram-акаунти рекламного акаунта', async () => { const x = (await g.get(`/${d.acc.id}/instagram_accounts`, { fields: 'id,username' })).data || []; log('   ' + JSON.stringify(x)); });
    const link = linkFor(spec, 'diag', 'diag'), img = spec.creatives.couple1.image;
    const up = await g.post(`/${d.acc.id}/adimages`, { bytes: Buffer.from(await (await fetchImpl(spec.site + img)).arrayBuffer()).toString('base64') }); const hash = Object.values(up.images || {})[0].hash;
    const ld = { link, message: 'diag', name: 'diag', image_hash: hash, call_to_action: { type: 'LEARN_MORE', value: { link } } };
    await tryIt('креатив-картинка лише Facebook', () => g.post(`/${d.acc.id}/adcreatives`, { name: 'diag_fb', object_story_spec: { page_id: d.page.id, link_data: ld } }));
    if (d.ig) await tryIt('креатив-картинка з instagram_user_id', () => g.post(`/${d.acc.id}/adcreatives`, { name: 'diag_ig', object_story_spec: { page_id: d.page.id, instagram_user_id: d.ig.id, link_data: ld } }));
    if (d.ig) await tryIt('креатив-картинка з instagram_actor_id', () => g.post(`/${d.acc.id}/adcreatives`, { name: 'diag_ig2', object_story_spec: { page_id: d.page.id, instagram_actor_id: d.ig.id, link_data: ld } }));
    return { discovered: d, report: [] };
  }
  if (mode === 'placements' || mode === 'placements-check') return { discovered: d, report: await updatePlacements(g, spec, d, camps, { apply: mode === 'placements', log }) };
  for (const c of camps) {
    const ex = d.existing.find(x => x.name === c.name);
    const campParams = { name: c.name, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION', daily_budget: Math.round(c.daily_budget_usd * 100), bid_strategy: 'LOWEST_COST_WITHOUT_CAP' };
    // Наявна кампанія: дотворюємо те, чого бракує (група оголошень, оголошення), нічого не дублюючи
    let campId = ex ? ex.id : null, adsetId = null, haveAds = [];
    if (ex) {
      const sets = (await g.get(`/${ex.id}/adsets`, { fields: 'id,name', limit: 50 })).data || [], st = sets.find(x => x.name === c.name + '_all');
      if (st) { adsetId = st.id; haveAds = ((await g.get(`/${st.id}/ads`, { fields: 'id,name', limit: 100 })).data || []).map(a => a.name); }
      const missing = c.ads.filter(k => !haveAds.includes(k));
      if (adsetId && !missing.length) { log(`• ${c.name}: уже існує повністю (${ex.id}, ${ex.status}) — пропускаю`); report.push({ name: c.name, skipped: ex.id }); continue; }
      log(`• ${c.name}: уже існує (${ex.id}), бракує: ${adsetId ? '' : 'групи оголошень, '}оголошень ${missing.join(', ')}`);
    }
    if (mode !== 'create') {
      if (!ex) await g.post(`/${d.acc.id}/campaigns`, { ...campParams, execution_options: ['validate_only'] });
      log(`• ${c.name}: перевірено ✓ — $${c.daily_budget_usd}/день, ${c.countries.join(', ')}, вік ${c.age_min}–${c.age_max}${(c.locales || []).length ? ', мова ' + c.locales.join(', ') : ''}; оголошення: ${c.ads.join(', ')}`);
      for (const k of c.ads) log(`    ${k}: ${linkFor(spec, c.name, k)}`);
      report.push({ name: c.name, validated: true }); continue;
    }
    const todo = c.ads.filter(k => !haveAds.includes(k));
    await uploadMedia(g, spec, d, todo, { fetchImpl, log, sleep, media });
    if (!campId) campId = (await g.post(`/${d.acc.id}/campaigns`, campParams)).id;
    if (!adsetId) adsetId = (await g.post(`/${d.acc.id}/adsets`, { name: c.name + '_all', campaign_id: campId, optimization_goal: 'LANDING_PAGE_VIEWS', billing_event: 'IMPRESSIONS', destination_type: 'WEBSITE', status: 'PAUSED', targeting: adsetTargeting(c, d), ...dsaFor(spec, c) })).id;
    const ads = [];
    for (const k of todo) {
      const cr = spec.creatives[k], link = linkFor(spec, c.name, k);
      const creative = await g.post(`/${d.acc.id}/adcreatives`, { name: `${c.name}_${k}`, object_story_spec: storySpec(spec, cr, d, link, media) });
      const ad = await g.post(`/${d.acc.id}/ads`, { name: k, adset_id: adsetId, creative: { creative_id: creative.id }, status: 'PAUSED', tracking_specs: [{ 'action.type': ['offsite_conversion'], fb_pixel: [spec.pixel_id] }] });
      ads.push({ key: k, id: ad.id });
    }
    log(`• ${c.name}: ${ex ? 'дотворено' : 'створено'} на паузі ✓ кампанія ${campId}, група ${adsetId}, оголошення ${ads.map(a => a.key + ' ' + a.id).join(', ')}`);
    report.push({ name: c.name, campaign: campId, adset: adsetId, ads });
  }
  return { discovered: d, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const spec = JSON.parse(fs.readFileSync(new URL('../marketing/ads/meta-campaigns.json', import.meta.url), 'utf8'));
  const out = []; const log = s => { console.log(s); out.push(s); };
  if (!env.META_ADS_TOKEN) { console.error('Немає секрету META_ADS_TOKEN (GitHub → Settings → Secrets and variables → Actions).'); process.exit(1); }
  run({ mode: env.MODE || 'check', only: String(env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean), ads: String(env.ADS || '').split(',').map(s => s.trim()).filter(Boolean), spec, token: env.META_ADS_TOKEN, ver: env.API_VERSION || 'v23.0',
    adAccount: env.AD_ACCOUNT || undefined, pageId: env.PAGE_ID || undefined, igId: env.IG_ID || undefined, log })
    .then(() => { if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, '### Meta Ads (' + (env.MODE || 'check') + ')\n\n' + out.map(s => '- ' + s).join('\n') + '\n'); })
    .catch(e => { console.error('Помилка: ' + e.message); if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, '### Meta Ads: помилка\n\n' + e.message + '\n'); process.exit(1); });
}
