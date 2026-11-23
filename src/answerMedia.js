// Фото й відео у відповідях на питання дня. Бачать лише учасники календаря: автор і партнер (партнер — коли сам відповів на питання цього дня, як і з текстом).
// Сховище: R2 (біндинг MEDIA, ключ ans/<id>), без нього фото зберігаються в базі (D1). Відео потребують R2: у базі вони займали б забагато місця.
import { HttpError, randomToken, DAYS, todayIndex, nowOf } from './util.js';

export const MAX_FILES = 4, MAX_VIDEOS = 2, MAX_PHOTO = 1.5 * 1024 * 1024, MAX_VIDEO = 60 * 1024 * 1024;
const r2 = env => (env.MEDIA && typeof env.MEDIA.put === 'function' ? env.MEDIA : null);
export const videoAllowed = env => !!r2(env);
const q1 = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const qa = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;

/** Тип файлу за вмістом (а не за заголовком): JPEG, PNG, WebP, MP4/MOV, WebM. */
export function sniffAnswer(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { kind: 'photo', mime: 'image/jpeg' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return { kind: 'photo', mime: 'image/png' };
  if (b.length > 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP') return { kind: 'photo', mime: 'image/webp' };
  if (b.length > 12 && String.fromCharCode(b[4], b[5], b[6], b[7]) === 'ftyp') { const brand = String.fromCharCode(b[8], b[9], b[10], b[11]); return { kind: 'video', mime: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4' }; }
  if (b.length > 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return { kind: 'video', mime: 'video/webm' };
  return null;
}
const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

async function checkDay(env, mem, d) {
  if (!(d >= 1 && d <= DAYS) || d > todayIndex(mem.start_date, nowOf(env), mem.tz)) throw new HttpError(400, 'bad_day');
  if (!mem.schedule_json) throw new HttpError(409, 'not_ready');
}

/** Завантаження файлу до відповіді (до її відправлення). */
export async function uploadAnswerMedia(env, mem, d, bytes) {
  await checkDay(env, mem, d);
  if (await q1(env, 'SELECT 1 AS x FROM answers WHERE member_id = ? AND day = ?', mem.id, d)) throw new HttpError(409, 'already_answered');
  const t = sniffAnswer(bytes); if (!t) throw new HttpError(400, 'bad_media');
  if (t.kind === 'video' && !r2(env)) throw new HttpError(400, 'video_unavailable');
  if (bytes.length > (t.kind === 'video' ? MAX_VIDEO : MAX_PHOTO)) throw new HttpError(413, t.kind === 'video' ? 'video_too_big' : 'photo_too_big');
  const have = await qa(env, 'SELECT kind FROM answer_media WHERE member_id = ? AND day = ?', mem.id, d);
  if (have.length >= MAX_FILES) throw new HttpError(400, 'too_many_files');
  if (t.kind === 'video' && have.filter(x => x.kind === 'video').length >= MAX_VIDEOS) throw new HttpError(400, 'too_many_videos');
  const id = randomToken(16), store = r2(env) ? 'r2' : 'd1';
  if (store === 'r2') await env.MEDIA.put('ans/' + id, bytes, { httpMetadata: { contentType: t.mime } });
  await env.DB.prepare('INSERT INTO answer_media (id, member_id, day, kind, mime, size, store, data, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, mem.id, d, t.kind, t.mime, bytes.length, store, store === 'd1' ? toB64(bytes) : null, Date.now()).run();
  return { ok: true, id, kind: t.kind, mime: t.mime, size: bytes.length };
}

/** Видалення ще не відправленого файлу (поки відповідь не надіслано). */
export async function deleteAnswerMedia(env, mem, id) {
  const m = await q1(env, 'SELECT * FROM answer_media WHERE id = ? AND member_id = ?', id, mem.id);
  if (!m) throw new HttpError(404, 'not_found');
  if (await q1(env, 'SELECT 1 AS x FROM answers WHERE member_id = ? AND day = ?', mem.id, m.day)) throw new HttpError(409, 'already_answered');
  await removeMedia(env, [m]);
  return { ok: true };
}

/** Перелік файлів учасника за день: [{ id, kind, mime }]. */
export async function listAnswerMedia(env, memberId, d) {
  return (await qa(env, 'SELECT id, kind, mime FROM answer_media WHERE member_id = ? AND day = ? ORDER BY created_at', memberId, d)).map(m => ({ id: m.id, kind: m.kind, mime: m.mime }));
}
/** Файли за всі дні: Map(day -> [..]). */
export async function mediaByDay(env, memberId) {
  const map = new Map();
  for (const m of await qa(env, 'SELECT id, day, kind, mime FROM answer_media WHERE member_id = ? ORDER BY created_at', memberId)) { if (!map.has(m.day)) map.set(m.day, []); map.get(m.day).push({ id: m.id, kind: m.kind, mime: m.mime }); }
  return map;
}

/** Віддача файлу: лише учасникам цього календаря; чужий файл — лише коли обоє відповіли на питання дня. Підтримує Range (потрібно Safari для відео). */
export async function serveAnswerMedia(env, mem, id, request) {
  const m = await q1(env, 'SELECT a.*, mb.calendar_id FROM answer_media a JOIN members mb ON mb.id = a.member_id WHERE a.id = ?', id);
  if (!m || m.calendar_id !== mem.calendar_id) throw new HttpError(404, 'not_found');
  if (m.member_id !== mem.id) {
    const both = await q1(env, 'SELECT COUNT(*) AS n FROM answers WHERE day = ? AND member_id IN (?, ?)', m.day, m.member_id, mem.id);
    if (!both || both.n < 2) throw new HttpError(403, 'answer_first');
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || ''), size = m.size;
  let start = 0, end = size - 1;
  if (range) { if (range[1] === '' && range[2] !== '') { start = Math.max(0, size - Number(range[2])); } else { start = Number(range[1]) || 0; if (range[2] !== '') end = Math.min(size - 1, Number(range[2])); } if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } }); }
  let body;
  if (m.store === 'r2') { const o = await env.MEDIA.get('ans/' + id, range ? { range: { offset: start, length: end - start + 1 } } : undefined); if (!o) throw new HttpError(404, 'not_found'); body = o.body || new Uint8Array(await o.arrayBuffer()); }
  else { const all = fromB64(m.data || ''); body = range ? all.subarray(start, end + 1) : all; }
  const h = { 'content-type': m.mime, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-length': String(end - start + 1) };
  if (range) h['content-range'] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers: h });
}

async function removeMedia(env, rows) {
  for (const m of rows) { if (m.store === 'r2' && r2(env)) { try { await env.MEDIA.delete('ans/' + m.id); } catch {} } await env.DB.prepare('DELETE FROM answer_media WHERE id = ?').bind(m.id).run(); }
}
/** Видалення всіх файлів учасників (разом із даними календаря). */
export async function purgeAnswerMedia(env, memberIds) {
  for (const id of memberIds) { try { await removeMedia(env, await qa(env, 'SELECT id, store FROM answer_media WHERE member_id = ?', id)); } catch {} }
}
/** Прибирання файлів, до яких так і не надіслали відповідь (старші за 3 дні). */
export async function purgeOrphanMedia(env, now = Date.now()) {
  try { await removeMedia(env, await qa(env, 'SELECT a.id, a.store FROM answer_media a LEFT JOIN answers x ON x.member_id = a.member_id AND x.day = a.day WHERE x.member_id IS NULL AND a.created_at < ? LIMIT 200', now - 3 * 864e5)); } catch {}
}
