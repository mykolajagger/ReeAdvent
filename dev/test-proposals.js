// Пропозиції агента: перевірка вмісту, генерація (банк і Claude), зміна, доопрацювання за промтом, версії, відхилення, погодження з файлами, плани публікацій, медіа-сховище
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { cleanProposal, generateProposals, editProposal, reviseProposal, restoreVersion, rejectProposal, approveProposal, withdrawProposal, listProposals, BANK } from '../src/proposals.js';
import { putMedia, getMedia, serveMedia } from '../src/media.js';
import { loadManifest, publishNext, getPlan, pubState } from '../src/igpublish.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root);
const env = { DB: db, DEV: '1', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', ADMIN_EMAILS: 'boss@x.com' };
const set = (k, v) => db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
const MAN = [{ id: 'brand', type: 'IMAGE', files: ['b.jpg'], caption: 'Бренд', title: 'Знайомство з брендом', scene: 'art' }];
const jpeg = n => { const b = new Uint8Array(n); b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF; b[3] = 0xE0; return b; };
const mp4 = n => { const b = new Uint8Array(n); b.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32], 0); return b; };
let aiCalls = [], aiPlan = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => { u = String(u);
  if (u.endsWith('/social/posts.json')) return new Response(JSON.stringify(MAN));
  if (u.includes('anthropic.com')) { const body = JSON.parse(o.body); aiCalls.push(body); const r = aiPlan && aiPlan(body); return r ? new Response(JSON.stringify({ content: [{ type: 'tool_use', name: body.tools[0].name, input: r }] })) : new Response('{"error":{"message":"overloaded"}}', { status: 529 }); }
  if (u.includes('graph.')) return new Response(JSON.stringify({ id: 'X1', status_code: 'FINISHED' }));
  return new Response('{}', { status: 404 }); };

// ---------- перевірка вмісту ----------
assert.equal(cleanProposal({ title: '' }), null);
let c = cleanProposal({ format: 'nope', title: 'T', slides: [{ template: 'zzz', scene: 'moon', text: 'Привіт', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }] }); assert.equal(c.format, 'post'); assert.equal(c.slides[0].template, 'quote'); assert.equal(c.slides[0].scene, 'tree'); assert.equal(c.slides[0].items.length, 5);
assert.equal(cleanProposal({ format: 'carousel', title: 'T', slides: [{ text: 'x' }] }).format, 'post', 'карусель з одним слайдом стає постом');
assert.equal(cleanProposal({ format: 'carousel', title: 'T', slides: Array.from({ length: 12 }, () => ({ text: 'x' })) }).slides.length, 8);
assert.equal(cleanProposal({ format: 'story', title: 'T', caption: 'не потрібно', slides: [{ text: 'x' }, { text: 'y' }] }).caption, ''); assert.equal(cleanProposal({ format: 'story', title: 'T', slides: [{ text: 'x' }, { text: 'y' }] }).slides.length, 1);
assert.equal(cleanProposal({ format: 'reel', title: 'T', storyboard: [{ scene: 'tree', text: 'a', sec: 3 }] }), null, 'у Reel щонайменше три сцени');
c = cleanProposal({ format: 'reel', title: 'T', music: 'z', storyboard: [{ scene: 'tree', text: 'a', sec: 99 }, { scene: 'spa', text: 'b' }, { scene: 'moon', text: 'c', sec: -5 }] }); assert.equal(c.music, 'b'); assert.deepEqual(c.storyboard.map(x => x.sec), [6, 3, 1]); assert.equal(c.storyboard[2].scene, 'tree');
c = cleanProposal({ title: 'T', slides: [{ text: 'x' }], caption: Array.from({ length: 40 }, (_, i) => '#t' + i).join(' ') }); assert.equal((c.caption.match(/#t\d+/g) || []).length, 30);
const NOW = Date.UTC(2026, 10, 25, 12); c = cleanProposal({ title: 'T', slides: [{ text: 'x' }], best_time_utc_hour: 16 }, NOW); assert.equal(c.whenAt, Date.UTC(2026, 10, 25, 16)); c = cleanProposal({ title: 'T', slides: [{ text: 'x' }], best_time_utc_hour: 13 }, NOW); assert.equal(c.whenAt, Date.UTC(2026, 10, 26, 13), 'час не раніше ніж за 3 години');
for (const b of BANK) assert(cleanProposal(b), 'банк: ' + b.title);

// ---------- створення без ключа: готовий банк, без дублів ----------
let g = await generateProposals(env, { count: 3, now: NOW }); assert.equal(g.mode, 'rules'); assert.equal(g.added, 3);
let list = await listProposals(env); assert.equal(list.length, 3); assert(list.every(p => p.status === 'new' && p.by === 'agent' && p.id && p.why));
g = await generateProposals(env, { count: 4, now: NOW + 1 }); list = await listProposals(env); assert.equal(new Set(list.map(p => p.title)).size, list.length, 'назви не повторюються');
await set('agent_props', ''); await generateProposals(env, { count: 1, now: NOW }); const p0 = (await listProposals(env))[0];

// ---------- зміна вручну й версії ----------
let e = await editProposal(env, p0.id, { title: 'Моя назва', caption: 'Новий підпис #a', slides: [{ template: 'tip', scene: 'spa', title: 'Чекліст', text: 'Заголовок', items: ['один', 'два'] }] }, { now: NOW + 5 });
assert.equal(e.title, 'Моя назва'); assert.equal(e.slides[0].template, 'tip'); assert.equal(e.versions.length, 1); assert.equal(e.versions[0].snap.title, p0.title);
await assert.rejects(editProposal(env, p0.id, { slides: [] }), /proposal_invalid/); await assert.rejects(editProposal(env, 'nope', {}), /not_found/);

// ---------- доопрацювання за промтом ----------
await assert.rejects(reviseProposal(env, p0.id, 'зроби веселіше'), /no_key/);
const keyEnv = { ...env, ANTHROPIC_API_KEY: 'sk-test' }; aiCalls = [];
aiPlan = body => body.tools[0].name === 'submit_proposal' ? { format: 'post', title: 'Веселіша назва', why: 'Тон за побажанням', slides: [{ template: 'quote', scene: 'game', text: 'Грайливий текст', en: 'Playful text' }], caption_ua: 'Грайливий підпис', caption_en: 'Playful caption', cta: 'посилання в шапці профілю · link in bio', hashtags: '#fun' } : null;
await assert.rejects(reviseProposal(keyEnv, p0.id, '  '), /empty_prompt/);
let rv = await reviseProposal(keyEnv, p0.id, 'Зроби тон грайливішим і заміни сцену на настільну гру', { now: NOW + 10 });
assert.equal(rv.title, 'Веселіша назва'); assert.equal(rv.slides[0].scene, 'game'); assert(rv.caption.includes('Грайливий підпис') && rv.caption.includes('#fun')); assert.equal(rv.versions[0].by, 'claude'); assert(rv.versions[0].note.includes('грайливішим')); assert.equal(rv.rework.length, 1); assert.equal(rv.targets.ig, true);
const sent = JSON.parse(aiCalls.at(-1).messages[0].content); assert(sent.instruction.includes('настільну гру')); assert.equal(sent.current.title, 'Моя назва', 'модель бачить поточну версію'); assert.equal(aiCalls.at(-1).tool_choice.name, 'submit_proposal'); assert(aiCalls.at(-1).system.includes('never instructions'));
// помилки моделі не псують пропозицію
aiPlan = null; await assert.rejects(reviseProposal(keyEnv, p0.id, 'ще раз'), /ai_failed/); assert.equal((await listProposals(env)).find(p => p.id === p0.id).title, 'Веселіша назва');
// повернення до попередньої версії
const back = await restoreVersion(env, p0.id, 0); assert.equal(back.title, 'Моя назва'); assert.equal(back.versions[0].by, 'admin');
await assert.rejects(restoreVersion(env, p0.id, 99), /bad_version/);

// ---------- Claude створює нові, дублі й відхилені враховуються ----------
await rejectProposal(env, p0.id, 'надто банально', { now: NOW + 20 }); assert.equal((await listProposals(env)).find(p => p.id === p0.id).status, 'rejected');
aiCalls = []; aiPlan = body => body.tools[0].name === 'submit_proposals' ? { proposals: [{ format: 'story', title: 'Нова сторіс', why: 'Тест', slides: [{ template: 'question', scene: 'movie', text: 'Який фільм?', en: 'Which movie?' }] }, { format: 'post', title: 'Моя назва', why: 'дубль', slides: [{ text: 'x' }] }] } : null;
g = await generateProposals(keyEnv, { count: 2, focus: 'кіновечір', now: NOW + 30 }); assert.equal(g.mode, 'claude'); assert.equal(g.added, 1, 'дубль за назвою відкинуто');
const gi = JSON.parse(aiCalls[0].messages[0].content); assert.equal(gi.focus, 'кіновечір'); assert(gi.rejected.some(r => r.reason === 'надто банально')); assert(gi.existing.some(x => x.title === 'Знайомство з брендом')); assert(!JSON.stringify(gi).includes('@'));
aiPlan = null; g = await generateProposals(keyEnv, { count: 1, now: NOW + 40 }); assert.equal(g.mode, 'rules'); assert(/Claude недоступний/.test(g.note));

// ---------- референси: фото (приклад і тло), PDF, текст ----------
{
  const b64 = u8 => Buffer.from(u8).toString('base64'), pdf = new TextEncoder().encode('%PDF-1.4 test'), txt = new TextEncoder().encode('Тон: тепло, коротко, без пафосу.');
  const refs = [{ name: 'стиль.jpg', mime: 'image/jpeg', data: b64(jpeg(3000)) }, { name: 'бриф.pdf', mime: 'application/pdf', data: b64(pdf) }, { name: 'тон.txt', mime: 'text/plain', data: b64(txt) }];
  await set('agent_props', ''); await generateProposals(env, { count: 1, now: NOW }); const q0 = (await listProposals(env))[0]; aiCalls = [];
  aiPlan = body => { if (body.tools[0].name !== 'submit_proposal') return null; const inp = JSON.parse(body.messages[0].content[0].text), id = inp.references.find(r => r.kind === 'image').id; return { format: 'post', title: 'З референсом', why: 'за фото', slides: [{ template: 'announce', scene: 'ref:' + id, text: 'Фото як тло', en: 'Photo as background' }, { template: 'quote', scene: 'ref:zzzzzzzzzz', text: 'x' }], caption_ua: 'П', caption_en: 'C', cta: 'посилання в шапці профілю · link in bio', hashtags: '#a' }; };
  const q1 = await reviseProposal(keyEnv, q0.id, 'Візьми стиль із фото й використай його як тло', { refs, now: NOW + 5 });
  const content = aiCalls.at(-1).messages[0].content; assert(Array.isArray(content)); const types = content.map(c => c.type); assert(types.includes('image') && types.includes('document') && types.filter(t => t === 'text').length >= 3, types.join());
  assert.equal(content.find(c => c.type === 'image').source.media_type, 'image/jpeg'); assert.equal(content.find(c => c.type === 'document').source.media_type, 'application/pdf'); assert(content.some(c => c.type === 'text' && c.text.includes('Тон: тепло')));
  assert.equal(q1.refs.length, 1); assert.equal(q1.refs[0].name, 'стиль.jpg'); assert.equal(q1.slides[0].scene, 'ref:' + q1.refs[0].id); assert.equal(q1.format, 'post'); assert.equal(q1.slides.length, 1, 'у пості один слайд');
  assert((await getMedia(env, q1.refs[0].id)).bytes.length === 3000, 'зображення-референс збережено як медіа');
  // ручна зміна: ref-сцена зі списку дозволена, чужа ні
  const q2 = await editProposal(env, q0.id, { slides: [{ template: 'quote', scene: 'ref:' + q1.refs[0].id, text: 'ok' }] }); assert.equal(q2.slides[0].scene, 'ref:' + q1.refs[0].id);
  const q3 = await editProposal(env, q0.id, { slides: [{ template: 'quote', scene: 'ref:abcdefghij', text: 'ok' }] }); assert.equal(q3.slides[0].scene, 'tree');
  // пошкоджені й заборонені файли
  await assert.rejects(reviseProposal(keyEnv, q0.id, 'тест', { refs: [{ name: 'a.zip', mime: 'application/zip', data: 'AAAA' }] }), /bad_ref/);
  await assert.rejects(reviseProposal(keyEnv, q0.id, 'тест', { refs: [{ name: 'a.jpg', mime: 'image/jpeg', data: b64(new Uint8Array(100)) }] }), /bad_ref/);
  await assert.rejects(reviseProposal(keyEnv, q0.id, 'тест', { refs: [{ name: 'a.pdf', mime: 'application/pdf', data: b64(new Uint8Array(100)) }] }), /bad_ref/);
  await assert.rejects(reviseProposal(keyEnv, q0.id, 'тест', { refs: [{ name: 'big.jpg', mime: 'image/jpeg', data: 'A'.repeat(4.5e6) }] }), /ref_too_big/);
  // генерація з референсами
  aiCalls = []; aiPlan = body => body.tools[0].name === 'submit_proposals' ? { proposals: [{ format: 'story', title: 'За прикладом', why: 'x', slides: [{ template: 'quote', scene: 'wrap', text: 'Текст' }] }] } : null;
  const gg = await generateProposals(keyEnv, { count: 1, refs: [refs[0]], now: NOW + 50 }); assert.equal(gg.added, 1); assert(Array.isArray(aiCalls[0].messages[0].content) && aiCalls[0].messages[0].content.some(c => c.type === 'image'));
  // прибирання: непотрібні старі файли видаляються, використані лишаються
  const { cleanupMedia } = await import('../src/proposals.js'); const orphan = await putMedia(env, jpeg(500)); db._raw.prepare("UPDATE settings SET updated_at = ? WHERE key = ?").run(NOW - 5 * 864e5, 'media:' + orphan.id); db._raw.prepare("UPDATE settings SET updated_at = ? WHERE key = ?").run(NOW - 5 * 864e5, 'media:' + q1.refs[0].id);
  assert((await cleanupMedia(env, NOW)) >= 1); assert.equal(await getMedia(env, orphan.id), null); assert(await getMedia(env, q1.refs[0].id), 'референс прив’язаний до пропозиції лишається');
}

// ---------- медіа ----------
assert.equal((await putMedia(env, jpeg(1000))).mime, 'image/jpeg'); await assert.rejects(putMedia(env, new Uint8Array(50)), /bad_media/); await assert.rejects(putMedia(env, mp4(2000)), /media_need_r2/); await assert.rejects(putMedia(env, jpeg(800 * 1024)), /media_too_big/);
const m1 = await putMedia(env, jpeg(5000)); assert.equal((await getMedia(env, m1.id)).bytes.length, 5000); const sv = await serveMedia(env, m1.id + '.jpg'); assert.equal(sv.headers.get('content-type'), 'image/jpeg'); assert.equal((await serveMedia(env, 'zzzzzzzzzz')).status, 404);
const pub = await handle(new Request('http://x/api/media/' + m1.id), env); assert.equal(pub.status, 200); assert.notEqual((await handle(new Request('http://x/api/media/..%2f..%2fx'), env)).status, 200);

// ---------- погодження: файли, запис у плані, публікація ----------
await set('agent_props', ''); await generateProposals(env, { count: 2, now: NOW }); list = await listProposals(env);
const post = list.find(p => p.format === 'post') || list[0], story = list.find(p => p.format === 'story'), reel = list.find(p => p.format === 'reel'), car = list.find(p => p.format === 'carousel');
const pid = post.id; await assert.rejects(approveProposal(env, pid, { media: [] }), /media_count/); await assert.rejects(approveProposal(env, pid, { media: ['nonexist1234'] }), /media_missing/);
const im = await putMedia(env, jpeg(4000)), at = NOW + 2 * 864e5;
const ap = await approveProposal(env, pid, { at, targets: { ig: true, fb: false }, media: [im.id] }, { now: NOW }); assert.equal(ap.proposal.status, 'approved'); assert.equal(ap.entry.id, 'p-' + pid); assert.deepEqual(ap.entry.files, ['/api/media/' + im.id]);
const man = await loadManifest(globalThis.fetch, 'http://x', env); assert(man.some(x => x.id === 'p-' + pid && x.title === post.title) && man.some(x => x.id === 'brand'), 'пропозицію додано до загального маніфесту');
const plan = await getPlan(env); assert.equal(plan.posts['p-' + pid].at, at); assert.equal(plan.posts['p-' + pid].fb, false);
await assert.rejects(editProposal(env, pid, { title: 'x' }), /proposal_locked/); await assert.rejects(rejectProposal(env, pid, 'x'), /proposal_locked/);
// публікація бере файл за абсолютною адресою /api/media
await set('ig_token', 'T'.repeat(40)); await set('ig_mode', 'fb'); await set('ig_id', '17841400000000001'); const sentUrls = [];
const pf = async (url, o = {}) => { url = String(url); if (o.body) sentUrls.push(Object.fromEntries(new URLSearchParams(o.body))); if (url.endsWith('/social/posts.json')) return new Response(JSON.stringify(MAN)); if (url.includes('status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' })); if (url.endsWith('/media_publish')) return new Response(JSON.stringify({ id: 'M1' })); return new Response(JSON.stringify({ id: 'C1' })); };
const pr = await publishNext(env, { fetchImpl: async (u, o) => String(u).endsWith('/social/posts.json') ? new Response(JSON.stringify([...MAN, ap.entry])) : pf(u, o), only: 'p-' + pid, delay: 0, now: NOW }); assert.equal(pr.ok, true, JSON.stringify(pr));
assert(sentUrls.some(x => x.image_url === 'https://reeadvent.fun/api/media/' + im.id), 'Instagram забирає зображення з /api/media');
// не можна відкликати опубліковане
await assert.rejects(withdrawProposal(env, pid, async eid => !!(await pubState(env)).done[eid]), /already_published/);
// сторіс: без підпису; карусель потребує всіх слайдів; Reel без відео лишається концептом, а з відео (R2) стає записом
if (story) { const sm = await putMedia(env, jpeg(3000)); const a2 = await approveProposal(env, story.id, { media: [sm.id] }); assert.equal(a2.entry.type, 'STORY'); assert.equal(a2.entry.caption, ''); }
if (car) { await assert.rejects(approveProposal(env, car.id, { media: [(await putMedia(env, jpeg(100))).id] }), /media_count/); }
if (reel) {
  const ar = await approveProposal(env, reel.id, {}); assert.equal(ar.entry, null); assert.equal(ar.proposal.needsVideo, true);
  const store = new Map(); const r2 = { put: async (k, b, o) => store.set(k, { b, ct: o.httpMetadata.contentType }), get: async k => store.has(k) ? { arrayBuffer: async () => store.get(k).b.buffer, httpMetadata: { contentType: store.get(k).ct } } : null, head: async k => store.has(k) ? { httpMetadata: { contentType: store.get(k).ct } } : null, delete: async k => store.delete(k) };
  const e2 = { ...env, MEDIA: r2 }; const vid = await putMedia(e2, mp4(3000)); assert.equal(vid.mime, 'video/mp4'); const cov = await putMedia(e2, jpeg(500));
  const done = await approveProposal(e2, reel.id, { media: [vid.id], cover: cov.id }); assert.equal(done.entry.type, 'REELS'); assert.deepEqual(done.entry.files, ['/api/media/' + vid.id]); assert.equal(done.entry.cover, '/api/media/' + cov.id); assert.equal(done.proposal.needsVideo, false);
  assert.equal((await serveMedia(e2, vid.id)).headers.get('content-type'), 'video/mp4');
}
// відкликання неопублікованого
{ const [x] = (await generateProposals(env, { count: 1, now: NOW + 99 }), (await listProposals(env)).filter(p => p.status === 'new' && p.format === 'post')); if (x) { const mm = await putMedia(env, jpeg(2000)); await approveProposal(env, x.id, { media: [mm.id] }); const w = await withdrawProposal(env, x.id, async () => false); assert.equal(w.status, 'new'); assert.equal(await getMedia(env, mm.id), null, 'файли видалено'); assert(!(await loadManifest(globalThis.fetch, 'http://x', env)).some(e => e.id === 'p-' + x.id)); } }

// ---------- через адмін-API (вхід, CSRF, завантаження файлу, погодження) ----------
const jar = {}; const call = async (who, method, url, body, hdr = {}) => { const headers = { ...(jar[who] ? { cookie: jar[who] } : {}), ...hdr }; const init = { method, headers }; if (body !== undefined) { if (body instanceof Uint8Array) init.body = body; else { headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); } } const res = await handle(new Request('http://x' + url, init), env); const sc = res.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const ct = res.headers.get('content-type') || ''; return { status: res.status, j: ct.includes('json') ? await res.json() : null }; };
const A = (m, u, b, h) => call('a', m, u, b, { 'x-admin': '1', ...(h || {}) });
assert.equal((await call('a', 'GET', '/api/admin/proposals')).status, 401);
await call('a', 'POST', '/api/admin/auth/request', { email: 'boss@x.com' }, { 'x-admin': '1' }); const tok = db._raw.prepare('SELECT body FROM outbox ORDER BY id DESC LIMIT 1').get().body.match(/#login=([\w-]+)/)[1]; await call('a', 'POST', '/api/admin/auth/verify', { token: tok });
await set('agent_props', ''); const gen = await A('POST', '/api/admin/proposals/generate', { count: 2 }); assert.equal(gen.status, 200); assert.equal(gen.j.generated.added, 2); assert.equal(gen.j.counts.new, 2); assert(gen.j.templates.includes('tip') && gen.j.scenes.includes('spa') && gen.j.mediaMode === 'inline' && gen.j.hasKey === false);
const first = gen.j.list.find(p => p.format === 'post' || p.format === 'story'); assert.equal((await call('a', 'POST', '/api/admin/media', jpeg(10))).j.error, 'csrf');
const up = await A('POST', '/api/admin/media', jpeg(6000), { 'content-type': 'image/jpeg' }); assert.equal(up.status, 200); assert(up.j.url.startsWith('/api/media/'));
const ed = await A('POST', '/api/admin/proposals/edit', { id: first.id, patch: { title: 'Із адмінки' } }); assert.equal(ed.j.list.find(p => p.id === first.id).title, 'Із адмінки');
assert.equal((await A('POST', '/api/admin/proposals/revise', { id: first.id, instruction: 'x' })).j.error, 'no_key');
const apr = await A('POST', '/api/admin/proposals/approve', { id: first.id, at: Date.now() + 864e5, media: [up.j.id] }); assert.equal(apr.status, 200); assert.equal(apr.j.list.find(p => p.id === first.id).status, 'approved');
const rj = await A('POST', '/api/admin/proposals/reject', { id: gen.j.list.find(p => p.id !== first.id).id, reason: 'не підходить' }); assert.equal(rj.j.counts.rejected, 1);
const pst = await A('GET', '/api/admin/instagram/publish'); assert(pst.j.posts.some(p => p.id === 'p-' + first.id), 'затверджена пропозиція з’явилась у редакторі публікацій');
globalThis.fetch = realFetch;
console.log('OK proposals');
