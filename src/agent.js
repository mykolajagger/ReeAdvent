// Агент росту: щодня збирає узагальнену статистику (продажі, воронка, реклама, черга публікацій), готує короткий звіт із порадами
// (за правилами або, якщо задано секрет ANTHROPIC_API_KEY, текстом від Claude) і виконує лише безпечні дії:
// заповнює чергу публікацій, вмикає нагадування про незавершену оплату, синхронізує витрати Meta (лише читання).
// Гроші агент не витрачає й кампаній сам не змінює: поради щодо бюджету лишаються людині. До моделі йдуть лише агреговані числа, без імен і пошт.
import { getSettings } from './settings.js';
import { adsReport, trackConfig } from './ads.js';
import { loadManifest, effective, getPlan, pubState, getFbPage, isComplete, fillQueue, SITE } from './igpublish.js';
import { getToken } from './instagram.js';
import { sendEmail } from './email.js';
import { recoveredCount } from './recovery.js';

const DAY = 864e5, FB = 'https://graph.facebook.com/v23.0';
const getSetting = async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first(); return r ? r.value : null; };
const setSetting = (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, Date.now()).run();
const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const round = (x, d = 2) => x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;
export const LAUNCH_DEFAULT = '2026-12-01';

// ---------- налаштування ----------
const FLAGS = { daily: ['agent_daily', true], email: ['agent_email', true], autoq: ['agent_autoq', false], recovery: ['agent_recovery', false] };
export async function agentFlags(env) {
  const out = {}; for (const [k, [key, d]] of Object.entries(FLAGS)) { const v = await getSetting(env, key); out[k] = v == null ? d : v === '1'; }
  out.metaAcc = (await getSetting(env, 'agent_meta_acc')) || ''; out.launch = (await getSetting(env, 'launch_date')) || LAUNCH_DEFAULT; out.hasKey = !!env.ANTHROPIC_API_KEY;
  return out;
}
export async function saveAgentFlags(env, b = {}) {
  for (const [k, [key]] of Object.entries(FLAGS)) if (typeof b[k] === 'boolean') await setSetting(env, key, b[k] ? '1' : '0');
  if (b.metaAcc !== undefined) { const v = String(b.metaAcc).trim().replace(/^act_/i, ''); if (v && !/^\d{5,25}$/.test(v)) return { ok: false, error: 'ID рекламного акаунта: лише цифри' }; await setSetting(env, 'agent_meta_acc', v); }
  if (b.launch !== undefined) { const v = String(b.launch).trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) return { ok: false, error: 'Дата старту: РРРР-ММ-ДД' }; await setSetting(env, 'launch_date', v); }
  return { ok: true };
}

// ---------- синхронізація витрат Meta (лише читання; потрібні дозвіл ads_read і доступ системного користувача до рекламного акаунта) ----------
export async function syncMetaSpend(env, { now = Date.now(), fetchImpl = fetch } = {}) {
  const acc = await getSetting(env, 'agent_meta_acc'); if (!acc) return { skipped: 'no_account' };
  const token = await getToken(env); if (!token) return { skipped: 'no_token' };
  const day = t => new Date(t).toISOString().slice(0, 10), range = JSON.stringify({ since: day(now - 7 * DAY), until: day(now) });
  const url = `${FB}/act_${acc}/insights?level=campaign&time_increment=1&limit=500&fields=${encodeURIComponent('campaign_name,spend,impressions,clicks,account_currency')}&time_range=${encodeURIComponent(range)}&access_token=${encodeURIComponent(token)}`;
  let j; try { const r = await fetchImpl(url, { signal: AbortSignal.timeout(20000) }); j = await r.json().catch(() => ({})); if (!r.ok) return { ok: false, error: String((j.error && j.error.message) || 'HTTP ' + r.status).slice(0, 200) }; } catch (e) { return { ok: false, error: 'Meta недоступна: ' + String(e && e.message || e).slice(0, 80) }; }
  const rows = Array.isArray(j.data) ? j.data : []; const cur = rows.find(x => x.account_currency)?.account_currency;
  if (cur && cur !== 'USD') return { ok: false, error: `Валюта рекламного акаунта ${cur}: потрібен USD (так рахується бюджет)` };
  const stats = {};
  for (const x of rows) {
    const camp = String(x.campaign_name || '').trim().toLowerCase().slice(0, 80) || null, cents = Math.round(Number(x.spend || 0) * 100), d = String(x.date_start || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    await env.DB.prepare("DELETE FROM ad_spend WHERE day = ? AND channel = 'meta' AND note = 'auto:meta' AND COALESCE(campaign, '') = ?").bind(d, camp || '').run();
    if (cents > 0) await env.DB.prepare("INSERT INTO ad_spend (day, channel, campaign, amount_cents, note, created_at) VALUES (?, 'meta', ?, ?, 'auto:meta', ?)").bind(d, camp, cents, Date.now()).run();
    const s = stats[camp || '—'] = stats[camp || '—'] || { campaign: camp || '—', impressions: 0, clicks: 0, spendCents: 0 }; s.impressions += Number(x.impressions || 0); s.clicks += Number(x.clicks || 0); s.spendCents += cents;
  }
  await setSetting(env, 'agent_meta_stats', JSON.stringify({ at: now, rows: Object.values(stats) }));
  return { ok: true, days: rows.length, campaigns: Object.keys(stats).length };
}

// ---------- знімок даних ----------
export async function snapshot(env, { now = Date.now(), fetchImpl = fetch, site = SITE, man = null } = {}) {
  const st = await getSettings(env), tc = await trackConfig(env), rate = Number(st.usd_rate) || 40, price = Number(st.price_uah) || 0, flags = await agentFlags(env);
  const r7 = await adsReport(env, now - 7 * DAY, now + DAY), r14 = await adsReport(env, now - 14 * DAY, now - 7 * DAY), t = r7.totals, p = r14.totals;
  const avgOrderUah = t.paid ? t.revenue_kop / 100 / t.paid : price, targetCpaUsd = round(0.38 * avgOrderUah / rate);
  const geoRows = (await env.DB.prepare("SELECT country, lang, COUNT(*) AS n FROM orders WHERE status = 'paid' AND created_at > ? GROUP BY country, lang ORDER BY n DESC LIMIT 8").bind(now - 14 * DAY).all()).results;
  const stale = (await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending' AND amount_kop > 0 AND created_at < ? AND created_at > ?").bind(now - 2 * 36e5, now - 48 * 36e5).first()).n;
  const promos = (await env.DB.prepare("SELECT promo_code AS code, COUNT(*) AS n FROM orders WHERE status = 'paid' AND promo_code IS NOT NULL AND created_at > ? GROUP BY promo_code ORDER BY n DESC LIMIT 6").bind(now - 14 * DAY).all()).results;
  let recovery = { sent: 0, recovered: 0 }; try { recovery = await recoveredCount(env); } catch {}
  // черга публікацій
  const pst = await pubState(env), plan = await getPlan(env), hasFb = !!(await getFbPage(env)); let mf = man;
  if (!mf) { try { mf = await loadManifest(fetchImpl, site); } catch { mf = []; } }
  const eff = effective(mf, plan), todo = eff.filter(x => !isComplete(pst, x, hasFb));
  const content = { total: eff.length, done: eff.length - todo.length, unscheduled: todo.filter(x => !x.at).length, scheduled48h: todo.filter(x => x.at && x.at >= now && x.at <= now + 2 * DAY).length, scheduledDays: new Set(todo.filter(x => x.at && x.at >= now).map(x => new Date(x.at).toISOString().slice(0, 10))).size, overdue: todo.filter(x => x.at && x.at < now - 3 * 36e5).length, lastError: pst.err ? pst.err.error : null, autopublish: pst.auto };
  const meta = parse(await getSetting(env, 'agent_meta_stats')), metaRows = meta && meta.at > now - 3 * DAY ? meta.rows.map(x => ({ campaign: x.campaign, impressions: x.impressions, clicks: x.clicks, spendUsd: round(x.spendCents / 100), ctrPct: x.impressions ? round(100 * x.clicks / x.impressions) : null, cpcUsd: x.clicks ? round(x.spendCents / 100 / x.clicks) : null })) : [];
  const launch = flags.launch, daysToLaunch = Math.ceil((Date.parse(launch + 'T00:00:00Z') - now) / DAY);
  const prev = parse(await getSetting(env, 'agent_hist')) || [];
  return {
    day: new Date(now).toISOString().slice(0, 10), launch, daysToLaunch,
    kpis: { paid7: t.paid, started7: t.started, revenueUah7: round(t.revenue_kop / 100, 0), spendUsd7: round(t.spend_cents / 100), cpaUsd7: t.cpa_usd, roas7: t.roas, convPct7: t.started ? round(100 * t.paid / t.started, 0) : null, prevPaid: p.paid, prevRevenueUah: round(p.revenue_kop / 100, 0), prevSpendUsd: round(p.spend_cents / 100) },
    money: { priceUah: price, usdRate: rate, avgOrderUah: round(avgOrderUah, 0), targetCpaUsd, budgetUsd: tc.budget, spentUsd: round(r7.spentAllCents / 100) },
    sources: r7.rows.map(x => ({ source: x.source, started: x.started, paid: x.paid, revenueUah: round(x.revenue_kop / 100, 0), spendUsd: round(x.spend_cents / 100), cpaUsd: x.cpa_usd, roas: x.roas })),
    campaigns: r7.campaigns.slice(0, 8).map(x => ({ source: x.source, campaign: x.campaign, creative: x.content, started: x.started, paid: x.paid })),
    meta: metaRows, geo: geoRows, promos, pendingStale: stale, recovery, content,
    setup: { pixel: !!tc.meta, ga4: !!tc.ga4, gads: !!tc.gads, instagram: !!(await getToken(env)), facebook: hasFb, metaAccount: !!flags.metaAcc, recoveryOn: flags.recovery, autoQueueOn: flags.autoq },
    previousIdeaHooks: prev.flatMap(h => (h.ideas || []).map(i => i.hook)).slice(0, 20)
  };
}

// ---------- правила (працюють без моделі) ----------
const IDEAS = [
  { format: 'Reel', hook: 'Три відповіді на питання «За що ти мене любиш?»', caption_ua: 'Три відповіді на одне питання ✦ Яка з них про вас? У ReeAdvent таке питання відкривається щодня.', caption_en: 'Three answers to one question ✦ Which one sounds like you? A question like this opens in ReeAdvent every day.' },
  { format: 'Карусель', hook: 'Що подарувати йому, якщо він «нічого не хоче»: 5 ідей', caption_ua: 'Він «нічого не хоче», а ви хочете здивувати ✦ П’ять ідей, які працюють. Збережіть, щоб не загубити.', caption_en: 'He “wants nothing”, but you want to surprise him ✦ Five ideas that work. Save it for later.' },
  { format: 'Сторіс-опитування', hook: 'Хто частіше планує вечір: він чи вона?', caption_ua: 'Хто з вас частіше планує вечір? Голосуйте й позначайте свою половинку.', caption_en: 'Who plans the evenings more often? Vote and tag your other half.' },
  { format: 'Відео-розпакування', hook: 'Відкриваємо вікно №7 разом (запис екрана)', caption_ua: 'Вікно №7: питання, подарунок, пригода й активність за дві хвилини ✦ Що б ви відкрили першим?', caption_en: 'Window 7: a question, a gift, an adventure and an activity in two minutes ✦ What would you open first?' },
  { format: 'Пост-відповідь', hook: 'Скільки коштує вечір, який ви запам’ятаєте?', caption_ua: 'Один вечір у ресторані зникає з пам’яті за тиждень. 24 вікна, які ви відкриваєте разом, лишаються надовго ✦ Для неї. Для нього.', caption_en: 'One restaurant evening fades in a week. 24 windows you open together stay with you ✦ For her. For him.' },
  { format: 'Reel із закулісся', hook: 'Як ми підбираємо подарунок за вашим бюджетом і смаками', caption_ua: 'Показуємо, як анкета перетворюється на ідеї подарунків і пригод у вашому місті ✦ Без спойлерів.', caption_en: 'We show how the questionnaire turns into gift ideas and adventures in your city ✦ No spoilers.' }];
const EXPERIMENTS = [
  { title: 'Тест гачка в рекламі', hypothesis: 'Заголовок «Подаруй їй 24 дні уваги» дасть вищий CTR, ніж «Адвент-календар для двох».', how: 'Два однакових оголошення з різним заголовком, по $5 на добу, оцінка через 48 годин за CTR і ціною кліку.' },
  { title: 'Формат: Reel проти каруселі', hypothesis: 'Reel приводить дешевші кліки, а карусель дає більше збережень.', how: 'Однакова пропозиція в обох форматах на одну й ту саму аудиторію, по $5 на добу, порівняти CPC і кількість оформлень.' },
  { title: 'Час публікації', hypothesis: 'Вечір (18:00–20:00) дає більше реакцій, ніж ранок.', how: 'Тиждень публікувати о 10:00, наступний о 19:00 і порівняти охоплення й збереження.' }];
export function rulesBrief(snap, hist = []) {
  const A = [], add = (type, title, why, extra = {}) => A.push({ id: `${type}-${A.length + 1}`, type, title, why, status: 'new', ...extra });
  const k = snap.kpis, m = snap.money, c = snap.content, su = snap.setup, tgt = m.targetCpaUsd || null;
  if (!su.pixel) add('setup', 'Підключіть піксел Meta', 'Без нього реклама не вчиться на покупках, а ретаргетинг неможливий. Соцмережі й реклама → Реклама → Відстеження.');
  if (!su.ga4 && !su.gads) add('setup', 'Підключіть GA4 або Google Ads', 'Потрібні, щоб бачити, звідки приходять покупці, й оптимізувати Google-кампанію на покупки.');
  if (!su.instagram) add('setup', 'Підключіть Instagram', 'Без токена автопублікація й стрічка на сайті не працюють.');
  if (c.lastError) add('fix', 'Виправте помилку публікації', c.lastError);
  if (c.overdue > 0) add('fix', `Є прострочені публікації: ${c.overdue}`, 'Час публікації минув, а вона не вийшла. Увімкніть автопублікацію або натисніть «Опублікувати зараз».');
  if (c.unscheduled > 0 && c.scheduled48h === 0) add('schedule_queue', 'Заповніть чергу публікацій', `Найближчі 48 годин у плані порожні, а ${c.unscheduled} публікацій без дати. Агент призначить час: стрічка щодня о 18:00 за Києвом, сторіс двічі на день.`, { auto: true });
  if (c.unscheduled === 0 && c.scheduledDays > 0 && c.scheduledDays < 4) add('content', 'Черга скоро закінчиться', `Запланованого контенту лишилось на ${c.scheduledDays} дн. Надішліть нові сцени, щоб зробити наступну серію.`);
  if (!c.autopublish && c.scheduled48h > 0) add('setup', 'Увімкніть автопублікацію', 'Публікації мають дату, але автопублікація вимкнена: вони не вийдуть самі.');
  if (snap.pendingStale > 0 && !su.recoveryOn) add('enable_recovery', 'Увімкніть нагадування про незавершену оплату', `${snap.pendingStale} замовлень зависли без оплати. Два листи (через 2 і 26 годин) повертають частину покупців без витрат на рекламу.`, { auto: true });
  if (k.started7 >= 5 && k.convPct7 != null && k.convPct7 < 30) add('conv', `Низька оплата після оформлення: ${k.convPct7}%`, 'Норма 35% і вище. Перевірте форму й оплату з телефона, а також що Monobank не відхиляє іноземні картки.');
  for (const s of snap.sources) {
    if (!s.spendUsd || s.source === '(пряме)') continue;
    if (tgt && !s.paid && s.spendUsd >= 2 * tgt) add('pause', `Зупиніть або замініть: ${s.source}`, `Витрачено $${s.spendUsd} без жодної покупки (межа: двічі допустимий CPA, тобто $${round(2 * tgt)}). Змініть креатив чи аудиторію.`);
    else if (tgt && s.paid && s.cpaUsd != null && s.cpaUsd <= 0.6 * tgt && s.spendUsd >= tgt) add('scale', `Збільшіть бюджет: ${s.source}`, `CPA $${s.cpaUsd} при допустимому $${tgt}. Додайте 20–30% і дивіться ще 48 годин.`);
    else if (tgt && s.paid && s.cpaUsd != null && s.cpaUsd > 1.5 * tgt) add('optimize', `Здорожчання: ${s.source}`, `CPA $${s.cpaUsd} проти допустимого $${tgt}. Залиште найкращий креатив і вимкніть решту.`);
  }
  for (const x of snap.meta || []) {
    if (x.impressions >= 1000 && x.ctrPct != null && x.ctrPct < 0.8) add('optimize', `Слабкий креатив у кампанії «${x.campaign}»: CTR ${x.ctrPct}%`, 'Норма для холодного трафіку від 1,2%. Змініть хук і перші 2 секунди відео або аудиторію.');
    else if (x.clicks >= 30 && x.cpcUsd != null && x.cpcUsd > 0.6) add('optimize', `Дорогий клік у «${x.campaign}»: $${x.cpcUsd}`, 'Орієнтир $0,35 для України й $0,70 для ЄС. Звузьте розміщення до Reels і Stories й перевірте частоту показів.');
  }
  const kTot = snap.meta.reduce((a, x) => a + x.clicks, 0);
  if (kTot >= 50 && k.paid7 === 0) add('conv', `Є ${kTot} кліків, але жодної оплати`, 'Проблема на сайті або в оплаті, а не в рекламі. Зробіть тестове замовлення з телефона й перевірте події піксела (Test Events).');
  const geoForeign = snap.geo.filter(g => g.country !== 'UA').reduce((a, g) => a + g.n, 0), geoAll = snap.geo.reduce((a, g) => a + g.n, 0);
  if (geoAll >= 5 && geoForeign / geoAll >= 0.3) add('geo', `Частка замовлень не з України: ${Math.round(100 * geoForeign / geoAll)}%`, 'Додайте англомовні креативи й окрему кампанію для цих країн.');
  const remaining = m.budgetUsd - (m.spentUsd || 0);
  if (m.budgetUsd > 0) add('budget', `Бюджет: лишилось $${round(remaining)} із $${m.budgetUsd}`, snap.daysToLaunch >= 0 ? `До старту ${snap.daysToLaunch} дн. Щоб вистачило й на перші дні після старту, витрачайте до $${round(remaining / (snap.daysToLaunch + 7))} на день.` : 'Старт уже минув: розподіляйте залишок на найкращі зв’язки.', { info: true });
  if (snap.daysToLaunch >= 0 && snap.daysToLaunch <= 9 && !k.spendUsd7 && !(snap.meta || []).length) add('info', 'Реклама ще не набирає витрат', 'Запустіть тестові кампанії зараз: перші 48 годин потрібні, щоб алгоритм навчився.');
  const idx = hist.length % IDEAS.length, ideas = [0, 1, 2].map(i => IDEAS[(idx + i) % IDEAS.length]).filter(i => !(snap.previousIdeaHooks || []).includes(i.hook));
  const headline = `За 7 днів: ${k.paid7} оплат (${k.prevPaid} тижнем раніше), виручка ${k.revenueUah7} ₴, витрати $${k.spendUsd7}${k.cpaUsd7 != null ? `, CPA $${k.cpaUsd7}` : ''}. ${snap.daysToLaunch >= 0 ? `До старту ${snap.daysToLaunch} дн.` : 'Календарі вже стартували.'}`;
  return { headline, actions: A.slice(0, 10), ideas, experiment: EXPERIMENTS[hist.length % EXPERIMENTS.length] };
}

// ---------- Claude ----------
const SYSTEM = `You are the growth analyst of ReeAdvent (reeadvent.fun), a private bilingual (Ukrainian/English) advent calendar for couples: 24 daily windows, each with a question for each other, a gift idea, an adventure and a shared activity in the couple's city. Brand voice: warm, elegant, concise; Ukrainian first, English second; the two characters are «Він і Вона» («для неї, для нього»). The product is 18+ (soft romantic content, always by mutual consent).
The owner has a very small ad budget and wants the most PAID orders for the least spend. Channels: Instagram and Facebook (organic, scheduled from the admin panel), paid Meta/Google ads, micro-influencers with promo codes, plus email recovery of abandoned checkouts.
You receive a JSON snapshot of aggregated numbers (no personal data) and a list of rule-based recommendations. Return ONE daily brief by calling submit_brief.
Rules: be concrete and numeric; at most 6 actions ordered by expected impact on paid orders per dollar; never invent data that is not in the snapshot; never suggest fake reviews, fake scarcity, bots, bought followers, mass unsolicited DMs/comments or anything against Meta or Google policies; no guaranteed results; keep every action inside the allowed types. Ideas must not repeat previousIdeaHooks and should use formats that differ from each other. Write all text in Ukrainian except caption_en.`;
const TOOL = { name: 'submit_brief', description: 'Daily growth brief for the owner', input_schema: { type: 'object', required: ['headline', 'actions', 'ideas', 'experiment'], properties: {
  headline: { type: 'string', description: '1–2 sentences in Ukrainian with the main numbers and the main priority' },
  actions: { type: 'array', maxItems: 6, items: { type: 'object', required: ['type', 'title', 'why'], properties: { type: { type: 'string', enum: ['setup', 'fix', 'schedule_queue', 'enable_recovery', 'pause', 'scale', 'optimize', 'budget', 'conv', 'content', 'geo', 'info'] }, title: { type: 'string' }, why: { type: 'string' } } } },
  ideas: { type: 'array', maxItems: 3, items: { type: 'object', required: ['format', 'hook', 'caption_ua', 'caption_en'], properties: { format: { type: 'string' }, hook: { type: 'string' }, caption_ua: { type: 'string' }, caption_en: { type: 'string' } } } },
  experiment: { type: 'object', required: ['title', 'hypothesis', 'how'], properties: { title: { type: 'string' }, hypothesis: { type: 'string' }, how: { type: 'string' } } } } } };
export async function claudeBrief(env, snap, rules, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: env.AGENT_MODEL || 'claude-sonnet-5-5', max_tokens: 2500, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'tool', name: 'submit_brief' }, messages: [{ role: 'user', content: JSON.stringify({ snapshot: snap, ruleBasedRecommendations: rules.actions.map(a => ({ type: a.type, title: a.title, why: a.why })) }) }] }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(String((j.error && j.error.message) || 'HTTP ' + r.status).slice(0, 160));
  const tu = (j.content || []).find(c => c.type === 'tool_use' && c.name === 'submit_brief'); if (!tu || !tu.input) throw new Error('модель не повернула звіт');
  return tu.input;
}
const TYPES = new Set(TOOL.input_schema.properties.actions.items.properties.type.enum);
const str = (s, n) => String(s == null ? '' : s).slice(0, n);
/** Бере текст від моделі, але безпечні автодії з правил (черга, нагадування) лишаються, навіть якщо модель їх пропустила. */
export function mergeBrief(rules, ai) {
  const actions = (ai.actions || []).filter(a => a && TYPES.has(a.type)).slice(0, 6).map((a, i) => ({ id: `${a.type}-${i + 1}`, type: a.type, title: str(a.title, 160), why: str(a.why, 500), status: 'new', auto: a.type === 'schedule_queue' || a.type === 'enable_recovery' }));
  for (const need of rules.actions.filter(a => a.auto)) if (!actions.some(a => a.type === need.type)) actions.push({ ...need, id: `${need.type}-${actions.length + 1}` });
  const ideas = (ai.ideas || []).slice(0, 3).map(i => ({ format: str(i.format, 40), hook: str(i.hook, 160), caption_ua: str(i.caption_ua, 900), caption_en: str(i.caption_en, 900) })), e = ai.experiment || rules.experiment;
  return { headline: str(ai.headline, 400) || rules.headline, actions: actions.length ? actions : rules.actions, ideas: ideas.length ? ideas : rules.ideas, experiment: { title: str(e.title, 120), hypothesis: str(e.hypothesis, 300), how: str(e.how, 400) } };
}

// ---------- звіт, автодії, лист ----------
export const getHist = async env => parse(await getSetting(env, 'agent_hist')) || [];
const saveHist = (env, h) => setSetting(env, 'agent_hist', JSON.stringify(h.slice(0, 14)));
const adminList = env => String(env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function digestEmail(env, rep) {
  const k = rep.snapshot ? rep.snapshot.kpis : null, top = rep.actions.filter(a => a.status === 'new').slice(0, 4);
  const html = `<div style="font-family:Georgia,serif;background:#08090d;color:#f3efe6;padding:28px;max-width:560px;margin:auto"><div style="letter-spacing:.3em;font:600 11px sans-serif;color:#d6b46a">REEADVENT · АГЕНТ РОСТУ</div><h1 style="font-weight:400;font-size:24px;margin:10px 0 14px">Звіт за ${esc(rep.day)}</h1><p style="font:15px/1.6 sans-serif;color:#d9d6cc">${esc(rep.headline)}</p>${top.length ? `<p style="font:600 13px sans-serif;color:#d6b46a;margin:16px 0 6px">ЩО ЗРОБИТИ</p><ol style="font:14px/1.55 sans-serif;color:#d9d6cc;padding-left:18px">${top.map(a => `<li><b>${esc(a.title)}</b><br><span style="color:#a4a6b4">${esc(a.why)}</span></li>`).join('')}</ol>` : ''}${rep.applied && rep.applied.length ? `<p style="font:13px sans-serif;color:#a4a6b4">Агент уже зробив: ${rep.applied.map(esc).join('; ')}</p>` : ''}<p><a href="${esc(env.BASE_URL)}/admin/#/social" style="display:inline-block;background:#d6b46a;color:#14110a;padding:12px 24px;border-radius:99px;text-decoration:none;font:600 14px sans-serif">Відкрити адмінку</a></p></div>`;
  const text = `Агент росту · ${rep.day}\n\n${rep.headline}\n\n${top.map((a, i) => `${i + 1}. ${a.title}: ${a.why}`).join('\n')}\n\n${env.BASE_URL}/admin/#/social`;
  return { subject: `Агент росту: ${rep.day}`, html, text };
}
/** Один запуск: синхронізація Meta → знімок → поради (правила або Claude) → безпечні автодії → збереження й лист. */
export async function runAgent(env, { now = Date.now(), force = false, fetchImpl = fetch, site = SITE, man = null } = {}) {
  const flags = await agentFlags(env), hist = await getHist(env), day = new Date(now).toISOString().slice(0, 10);
  if (!force) { if (!flags.daily) return { skipped: 'off' }; if (new Date(now).getUTCHours() < 6) return { skipped: 'early' }; if (hist[0] && hist[0].day === day) return { skipped: 'done_today' }; }
  let sync = null; try { sync = await syncMetaSpend(env, { now, fetchImpl }); } catch (e) { sync = { ok: false, error: String(e && e.message || e).slice(0, 120) }; }
  const snap = await snapshot(env, { now, fetchImpl, site, man });
  let brief = rulesBrief(snap, hist), mode = 'rules', note = null;
  if (env.ANTHROPIC_API_KEY) { try { brief = mergeBrief(brief, await claudeBrief(env, snap, brief, { fetchImpl })); mode = 'claude'; } catch (e) { note = 'Claude недоступний, використано правила: ' + String(e && e.message || e).slice(0, 120); } }
  const applied = [];
  for (const a of brief.actions) {
    if (a.type === 'enable_recovery' && flags.recovery) a.status = 'done';
    if (a.type === 'schedule_queue' && flags.autoq) { try { const q = await fillQueue(env, { now, fetchImpl, site, man }); a.status = 'done'; applied.push(`призначено час: ${q.post} постів і ${q.story} сторіс`); } catch (e) { a.note = String(e.message || e).slice(0, 100); } }
  }
  const rep = { at: now, day, mode, note, headline: brief.headline, actions: brief.actions, ideas: brief.ideas, experiment: brief.experiment, applied, sync, snapshot: { kpis: snap.kpis, money: snap.money, daysToLaunch: snap.daysToLaunch, content: snap.content, recovery: snap.recovery, sources: snap.sources } };
  const h = force && hist[0] && hist[0].day === day ? [rep, ...hist.slice(1)] : [rep, ...hist];
  await saveHist(env, h);
  let mailed = 0;
  if (flags.email && !force) for (const to of adminList(env)) { try { const m = digestEmail(env, rep); await sendEmail(env, to, m.subject, m.html, m.text); mailed++; } catch (e) { console.error('agent digest', e && e.message); } }
  return { ok: true, mode, day, actions: rep.actions.length, applied, mailed };
}
/** Дія з адмінки над порадою: apply (виконати безпечну), done (позначити виконаною), dismiss (відхилити). */
export async function agentAction(env, { at, id, op }, { fetchImpl = fetch, site = SITE, now = Date.now() } = {}) {
  const hist = await getHist(env), rep = hist.find(r => r.at === Number(at)); if (!rep) return { ok: false, error: 'Звіт не знайдено' };
  const a = rep.actions.find(x => x.id === id); if (!a) return { ok: false, error: 'Пораду не знайдено' };
  let msg = null;
  if (op === 'apply') {
    if (a.type === 'schedule_queue') { const q = await fillQueue(env, { now, fetchImpl, site }); msg = `Призначено час: ${q.post} постів і ${q.story} сторіс`; }
    else if (a.type === 'enable_recovery') { await saveAgentFlags(env, { recovery: true }); msg = 'Нагадування про незавершену оплату ввімкнено'; }
    else return { ok: false, error: 'Цю пораду виконує людина: натисніть «Виконано»' };
    a.status = 'done';
  } else if (op === 'done') a.status = 'done'; else if (op === 'dismiss') a.status = 'dismissed'; else return { ok: false, error: 'Невідома дія' };
  await saveHist(env, hist); return { ok: true, message: msg };
}
