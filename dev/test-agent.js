// Агент росту: нагадування про оплату (2 листи, підпис, відновлення інвойсу), вебхук для кількох інвойсів, автозаповнення черги, звіт (правила й Claude), автодії, синхронізація Meta
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { runRecovery, resumeSig, recoveredCount } from '../src/recovery.js';
import { fillQueue, effective, getPlan, SLOTS } from '../src/igpublish.js';
import { runAgent, rulesBrief, snapshot, mergeBrief, agentAction, saveAgentFlags, agentFlags, getHist, syncMetaSpend } from '../src/agent.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root);
const env = { DB: db, DEV: '1', PRICE_UAH: '400', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', CRON_SECRET: 'c'.repeat(24), ADMIN_EMAILS: 'boss@test.com' };
const set = (k, v) => db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
const outbox = () => db._raw.prepare('SELECT * FROM outbox ORDER BY id').all();
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0), H = 36e5, DAY = 864e5;
let seq = 0;
const addOrder = (o = {}) => { const id = o.id || 'ord' + ++seq; db._raw.prepare(`INSERT INTO orders (id, created_at, status, amount_kop, list_kop, discount_kop, name_a, email_a, name_b, email_b, city, region, start_date, payer_email, invoice_id, consent_at, lang, country, tz, utm_source, utm_campaign, paid_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, o.created_at ?? NOW - 3 * H, o.status || 'pending', o.amount ?? 39900, 39900, 0, o.name || 'Він', o.email || `a${seq}@test.com`, 'Вона', `b${seq}@test.com`, 'Львів', 'Львівська', '2026-12-01', o.email || `a${seq}@test.com`, 'stub_' + id, 1, o.lang || 'uk', o.country || 'UA', 'Europe/Kyiv', o.src || null, o.camp || null, o.paid_at || null); return id; };

// ---------- нагадування про незавершену оплату ----------
assert.equal((await runRecovery(env, { now: NOW })).skipped, 'off');
await set('agent_recovery', '1');
const o1 = addOrder({ created_at: NOW - 3 * H, email: 'one@test.com' }), o2 = addOrder({ created_at: NOW - 30 * 60e3, email: 'two@test.com' }), o3 = addOrder({ created_at: NOW - 3 * H, email: 'free@test.com', amount: 0 }), o4 = addOrder({ created_at: NOW - 3 * H, email: 'paid@test.com' });
addOrder({ status: 'paid', email: 'paid@test.com', created_at: NOW - 5 * DAY, paid_at: NOW - 5 * DAY });
let rr = await runRecovery(env, { now: NOW }); assert.equal(rr.sent, 1, JSON.stringify(rr));
let mails = outbox(); assert.equal(mails.length, 1); assert.equal(mails[0].to_email, 'one@test.com'); assert(/resume\?s=/.test(mails[0].body) && mails[0].subject.includes('майже'));
rr = await runRecovery(env, { now: NOW + 60e3 }); assert.equal(rr.sent, 0, 'другий лист не раніше ніж через добу');
rr = await runRecovery(env, { now: NOW + 24 * H }); assert.equal(rr.sent, 2, 'через добу: другий лист першому й перший лист тому, хто чекав менше: ' + JSON.stringify(rr)); assert.equal(outbox().length, 3); assert(outbox().some(m => m.to_email === 'one@test.com' && m.subject.includes('чекає')));
rr = await runRecovery(env, { now: NOW + 48 * H }); assert.equal(outbox().length, 3, 'більше двох листів не буває, а старі замовлення (понад 40 год) не турбуємо');
// посилання відновлення: підпис, перенаправлення, статус
const res = async (id, sig) => handle(new Request(`http://x/api/orders/${id}/resume?s=${sig}`), env);
let rs = await res(o1, 'bad'); assert.equal(rs.status, 302); assert.equal(rs.headers.get('location'), 'http://x/');
rs = await res(o1, await resumeSig(env, o1)); assert.equal(rs.status, 302); assert.equal(rs.headers.get('location'), `http://x/api/dev/pay/${o1}`);
db._raw.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").run(NOW + 25 * H, o1);
rs = await res(o1, await resumeSig(env, o1)); assert.equal(rs.headers.get('location'), `http://x/thanks.html?order=${o1}`);
const rec = await recoveredCount(env); assert(rec.sent >= 1 && rec.recovered === 1, JSON.stringify(rec));
// вебхук Monobank: старий інвойс замовлення, яке відновили новим, шукається за reference
{
  const oid = addOrder({ created_at: NOW - 3 * H, email: 'hook@test.com' }); db._raw.prepare("UPDATE orders SET invoice_id = 'inv_new' WHERE id = ?").run(oid);
  const real = globalThis.fetch; globalThis.fetch = async u => String(u).includes('invoice/status') ? new Response(JSON.stringify({ status: 'success', amount: 39900, reference: oid })) : real(u);
  const e2 = { ...env, PAYMENT_MODE: 'monobank', MONOBANK_TOKEN: 'x' };
  try { const w = await handle(new Request('http://x/api/payments/monobank/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invoiceId: 'inv_old' }) }), e2); assert.equal(w.status, 200); } finally { globalThis.fetch = real; }
  const row = db._raw.prepare('SELECT status, invoice_id FROM orders WHERE id = ?').get(oid); assert.equal(row.status, 'paid'); assert.equal(row.invoice_id, 'inv_old');
}

// ---------- автозаповнення черги ----------
const man = [{ id: 'p1', type: 'IMAGE', files: ['p1.jpg'], caption: 'Пост 1', scene: 'tree' }, { id: 'p2', type: 'REELS', files: ['p2.mp4'], caption: 'Пост 2' }, { id: 'p3', type: 'IMAGE', files: ['p3.jpg'], caption: 'Пост 3' }, { id: 's1', type: 'STORY', files: ['s1.jpg'], caption: '' }, { id: 's2', type: 'STORY', files: ['s2.jpg'], caption: '' }, { id: 's3', type: 'STORY', files: ['s3.jpg'], caption: '' }];
await set('ig_plan', JSON.stringify({ order: [], posts: { p3: { at: NOW + 5 * DAY } } }));
let q = await fillQueue(env, { now: NOW, man }); assert.deepEqual([q.post, q.story], [2, 3]);
let eff = effective(man, await getPlan(env)), at = id => eff.find(x => x.id === id).at;
assert.equal(new Date(at('p1')).getUTCHours(), 16); assert.equal(at('p2') - at('p1'), DAY); assert.equal(at('p3'), NOW + 5 * DAY, 'призначений раніше час не змінюється');
assert.deepEqual([at('s1'), at('s2'), at('s3')].map(t => new Date(t).getUTCHours()), [18, 8, 18]);   // сторіс двічі на день: 18:00 сьогодні, 08:00 і 18:00 завтра
q = await fillQueue(env, { now: NOW, man }); assert.deepEqual([q.post, q.story], [0, 0], 'повторний виклик нічого не змінює');
assert(at('p1') >= NOW + 2 * H, 'не раніше ніж за 2 години');

// ---------- звіт: правила ----------
await set('agent_recovery', '0'); await set('ig_plan', ''); await set('agent_hist', ''); await set('ads_budget_usd', '500'); await set('usd_rate', '40');
addOrder({ status: 'paid', email: 'x1@test.com', created_at: NOW - 2 * DAY, paid_at: NOW - 2 * DAY, src: 'meta', camp: 'ua_cold' }); addOrder({ status: 'paid', email: 'x2@test.com', created_at: NOW - 1 * DAY, paid_at: NOW - 1 * DAY, src: 'google', camp: 'search' }); addOrder({ email: 'x3@test.com', created_at: NOW - 6 * H, src: 'meta', camp: 'ua_cold' });
const spend = (d, ch, c, usd) => db._raw.prepare("INSERT INTO ad_spend (day, channel, campaign, amount_cents, note, created_at) VALUES (?,?,?,?,NULL,1)").run(d, ch, c, Math.round(usd * 100));
spend('2026-11-24', 'meta', 'ua_cold', 4); spend('2026-11-24', 'google', 'search', 60); spend('2026-11-23', 'influencer', null, 3);
const snap = await snapshot(env, { now: NOW, man, fetchImpl: async () => { throw new Error('no'); } });
assert.equal(snap.kpis.paid7, 5); assert(snap.money.targetCpaUsd > 0); assert.equal(snap.content.unscheduled, 6); assert.equal(snap.daysToLaunch, 6);
assert(!JSON.stringify(snap).includes('@test.com') && !JSON.stringify(snap).includes('Львів'), 'у знімку немає персональних даних');
const rb = rulesBrief(snap, []); const types = rb.actions.map(a => a.type);
assert(types.includes('setup') && types.includes('schedule_queue') && types.includes('enable_recovery') && types.includes('budget'), types.join());
assert(rb.actions.find(a => a.type === 'schedule_queue').auto && rb.headline.includes('7 днів') && rb.ideas.length > 0 && rb.experiment.title);
assert(types.includes('optimize') || types.includes('pause') || types.includes('scale') || rb.actions.some(a => a.type === 'budget'));

// ---------- повний запуск: правила, без автодій ----------
const noNet = async () => { throw new Error('offline'); };
await set('ig_token', 'T'.repeat(40));
let ra = await runAgent(env, { now: NOW, force: true, man, fetchImpl: noNet }); assert.equal(ra.ok, true); assert.equal(ra.mode, 'rules');
let hist = await getHist(env); assert.equal(hist.length, 1); assert.equal(hist[0].day, '2026-11-25'); assert.equal(hist[0].actions.find(a => a.type === 'schedule_queue').status, 'new');
assert.equal((await getPlan(env)).posts.p1, undefined, 'без автопілота чергу не чіпаємо');
// планувальник: не раніше 06:00 UTC і раз на день
assert.equal((await runAgent(env, { now: Date.UTC(2026, 10, 26, 4), man, fetchImpl: noNet })).skipped, 'early');
assert.equal((await runAgent(env, { now: NOW, man, fetchImpl: noNet })).skipped, 'done_today');
// дія з адмінки: виконати пораду «заповнити чергу»
const act = hist[0].actions.find(a => a.type === 'schedule_queue'); let aa = await agentAction(env, { at: hist[0].at, id: act.id, op: 'apply' }, { fetchImpl: async u => String(u).endsWith('posts.json') ? new Response(JSON.stringify(man)) : noNet(), now: NOW });
assert.equal(aa.ok, true, JSON.stringify(aa)); assert((await getPlan(env)).posts.p1.at > NOW); assert.equal((await getHist(env))[0].actions.find(a => a.id === act.id).status, 'done');
assert.equal((await agentAction(env, { at: hist[0].at, id: 'nope', op: 'done' })).ok, false);
const manual = hist[0].actions.find(a => a.type === 'setup'); assert.equal((await agentAction(env, { at: hist[0].at, id: manual.id, op: 'apply' })).ok, false);
assert.equal((await agentAction(env, { at: hist[0].at, id: manual.id, op: 'dismiss' })).ok, true);

// ---------- Claude: структурований звіт, без персональних даних, автодії лишаються ----------
await set('ig_plan', ''); await saveAgentFlags(env, { autoq: true, email: true });
let sentBody = null, sentProps = null; const aiFetch = async (url, o) => { if (String(url).includes('anthropic.com')) { const body = JSON.parse(o.body); if (body.tools[0].name === 'submit_proposals') { sentProps = body; return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'submit_proposals', input: { proposals: [{ format: 'post', title: 'Пропозиція від Claude', why: 'Тест', slides: [{ template: 'quote', scene: 'spa', text: 'Текст', en: 'Text' }], caption_ua: 'Підпис', caption_en: 'Caption', cta: 'посилання в шапці профілю · link in bio', hashtags: '#a #b' }] } }] })); } sentBody = body; return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'submit_brief', input: { headline: 'Тестовий звіт', actions: [{ type: 'scale', title: 'Збільште бюджет Meta', why: 'CPA нижче межі' }, { type: 'hack', title: 'Невідомий тип', why: 'x' }], ideas: [{ format: 'Reel', hook: 'Новий гачок', caption_ua: 'Текст', caption_en: 'Text' }], experiment: { title: 'Тест', hypothesis: 'Г', how: 'Як' } } }] })); } return noNet(); };
const keyEnv = { ...env, ANTHROPIC_API_KEY: 'sk-test' }; await set('agent_hist', '');
ra = await runAgent(keyEnv, { now: NOW + DAY, force: false, man, fetchImpl: async (u, o) => String(u).endsWith('posts.json') ? new Response(JSON.stringify(man)) : aiFetch(u, o) }); assert.equal(ra.mode, 'claude', JSON.stringify(ra));
assert.equal(sentBody.model, 'claude-sonnet-5-5'); assert.equal(sentBody.tool_choice.name, 'submit_brief'); assert(!JSON.stringify(sentBody).includes('@test.com') && !JSON.stringify(sentBody).includes('Львів') && JSON.parse(sentBody.messages[0].content).snapshot.sources.every(x => !('email' in x)), 'у запиті до моделі немає персональних даних');
hist = await getHist(env); assert.equal(hist[0].headline, 'Тестовий звіт'); const ty = hist[0].actions.map(a => a.type); assert(ty.includes('scale') && !ty.includes('hack') && ty.includes('schedule_queue'), ty.join());
assert.equal(hist[0].actions.find(a => a.type === 'schedule_queue').status, 'done', 'автопілот виконав заповнення черги'); assert(hist[0].applied[0].includes('призначено час'));
assert(outbox().some(m => m.to_email === 'boss@test.com' && m.subject.includes('Агент росту')), 'дайджест надіслано адміну');
assert(sentProps && sentProps.tool_choice.name === 'submit_proposals'); assert(hist[0].applied.some(x => x.includes('пропозицій публікацій')), 'агент підготував пропозиції');
// збій моделі: звіт із правил і примітка
await set('agent_hist', ''); const bad = await runAgent(keyEnv, { now: NOW + 2 * DAY, man, fetchImpl: async (u, o) => String(u).endsWith('posts.json') ? new Response(JSON.stringify(man)) : new Response('{"error":{"message":"overloaded"}}', { status: 529 }) });
assert.equal(bad.mode, 'rules'); assert(/Claude недоступний/.test((await getHist(env))[0].note));
assert.equal(mergeBrief({ actions: [{ type: 'schedule_queue', auto: true, title: 'q', why: 'w' }], ideas: [], experiment: { title: 't', hypothesis: 'h', how: 'x' }, headline: 'h' }, { headline: 'AI', actions: [], ideas: [], experiment: null }).actions[0].type, 'schedule_queue');

// ---------- Meta: синхронізація витрат (лише читання) ----------
assert.equal((await syncMetaSpend(env, { now: NOW })).skipped, 'no_account');
assert.equal((await saveAgentFlags(env, { metaAcc: 'abc' })).ok, false); await saveAgentFlags(env, { metaAcc: 'act_123456789' }); assert.equal((await agentFlags(env)).metaAcc, '123456789');
const insights = cur => async url => { assert(String(url).includes('/act_123456789/insights') && String(url).includes('access_token=')); return new Response(JSON.stringify({ data: [{ date_start: '2026-11-24', campaign_name: 'UA_Cold', spend: '12.50', impressions: '3000', clicks: '40', account_currency: cur }, { date_start: '2026-11-25', campaign_name: 'UA_Cold', spend: '7.25', impressions: '1000', clicks: '12', account_currency: cur }] })); };
let sy = await syncMetaSpend(env, { now: NOW, fetchImpl: insights('USD') }); assert.equal(sy.ok, true); assert.equal(sy.campaigns, 1);
const auto = () => db._raw.prepare("SELECT day, campaign, amount_cents FROM ad_spend WHERE note = 'auto:meta' ORDER BY day").all(); assert.deepEqual(auto().map(r => [r.day, r.campaign, r.amount_cents]), [['2026-11-24', 'ua_cold', 1250], ['2026-11-25', 'ua_cold', 725]]);
await syncMetaSpend(env, { now: NOW, fetchImpl: insights('USD') }); assert.equal(auto().length, 2, 'повторна синхронізація не дублює');
sy = await syncMetaSpend(env, { now: NOW, fetchImpl: insights('UAH') }); assert.equal(sy.ok, false); assert(/USD/.test(sy.error));
const snap2 = await snapshot(env, { now: NOW, man, fetchImpl: noNet }); assert.equal(snap2.meta[0].ctrPct, 1.3); assert.equal(snap2.meta[0].cpcUsd, 0.38);
console.log('OK agent');
