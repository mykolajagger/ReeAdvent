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
  const locales = {};
  for (const name of [...new Set(spec.campaigns.flatMap(c => c.locales || []))]) {
    const r = (await g.get('/search', { type: 'adlocale', q: name })).data || [];
    const hit = r.find(x => String(x.name).toLowerCase() === name.toLowerCase()) || r[0]; if (hit) locales[name] = hit.key;
  }
  const existing = (await g.get(`/${acc.id}/campaigns`, { fields: 'id,name,status', limit: 200 })).data || [];
  return { me, acc, page, ig, exclude, locales, existing };
}

export const linkFor = (spec, camp, key) => `${spec.site}/?utm_source=meta&utm_medium=paid&utm_campaign=${encodeURIComponent(camp)}&utm_content=${encodeURIComponent(key)}`;

export function adsetTargeting(c, d) {
  const t = { geo_locations: { countries: c.countries }, age_min: c.age_min || 18, age_max: c.age_max || 65,
    publisher_platforms: ['facebook', 'instagram', 'messenger'],           // без Audience Network
    targeting_automation: { advantage_audience: 0 } };                     // вік і країни — жорсткі межі
  const loc = (c.locales || []).map(n => d.locales[n]).filter(Boolean); if (loc.length) t.locales = loc;
  const ex = d.exclude.filter(x => x.a).map(x => ({ id: x.a.id })); if (ex.length) t.excluded_custom_audiences = ex;
  return t;
}

// Реклама на аудиторію в ЄС (Закон про цифрові послуги): обов'язково вказати, хто рекламується і хто платить (видно в бібліотеці реклами).
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);
export const dsaFor = (spec, c) => (c.countries || []).some(x => EU.has(x)) ? { dsa_beneficiary: spec.dsa_beneficiary || 'ReeAdvent', dsa_payor: spec.dsa_payor || spec.dsa_beneficiary || 'ReeAdvent' } : {};

export function storySpec(spec, cr, d, link, media) {
  const cta = { type: 'LEARN_MORE', value: { link } }, base = { page_id: d.page.id, ...(d.ig ? { instagram_user_id: d.ig.id } : {}) };
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

export async function run({ mode = 'check', only = [], spec, token, ver, adAccount, pageId, igId, fetchImpl = fetch, log = console.log, sleep } = {}) {
  const g = graph({ token, ver, fetchImpl, log });
  const d = await discover(g, spec, { adAccount, pageId, igId });
  log(`Токен: ${d.me.name || d.me.id}`);
  log(`Рекламний акаунт: ${d.acc.id}${d.acc.name ? ` (${d.acc.name}, ${d.acc.currency}, ${d.acc.timezone_name})` : ''}`);
  if (d.acc.currency && d.acc.currency !== 'USD') log(`⚠ Валюта акаунта ${d.acc.currency}: бюджети в специфікації в доларах, перевірте суми.`);
  log(`Сторінка: ${d.page.id}${d.page.name ? ` (${d.page.name})` : ''}; Instagram: ${d.ig ? d.ig.id + (d.ig.username ? ' @' + d.ig.username : '') : 'НЕ ЗНАЙДЕНО — оголошення підуть лише від сторінки Facebook'}`);
  for (const x of d.exclude) log(`Виключити аудиторію «${x.name}»: ${x.a ? x.a.id : 'не знайдено (створіть її в Ads Manager → Аудиторії), поки без виключення'}`);
  for (const [n, k] of Object.entries(d.locales)) log(`Мова «${n}»: key ${k}`);
  const camps = spec.campaigns.filter(c => !only.length || only.includes(c.name)), report = [], media = { video: {}, image: {} };   // медіа вантажимо один раз на запуск
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
  run({ mode: env.MODE || 'check', only: String(env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean), spec, token: env.META_ADS_TOKEN, ver: env.API_VERSION || 'v23.0',
    adAccount: env.AD_ACCOUNT || undefined, pageId: env.PAGE_ID || undefined, igId: env.IG_ID || undefined, log })
    .then(() => { if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, '### Meta Ads (' + (env.MODE || 'check') + ')\n\n' + out.map(s => '- ' + s).join('\n') + '\n'); })
    .catch(e => { console.error('Помилка: ' + e.message); if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, '### Meta Ads: помилка\n\n' + e.message + '\n'); process.exit(1); });
}
