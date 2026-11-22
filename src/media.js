// Медіа, створені в адмінці (зображення пропозицій агента, за наявності R2 ще й відео): віддаються за адресою /api/media/<id>, щоб Instagram і Facebook могли їх забрати.
// Сховище: R2 (біндинг MEDIA у Cloudflare Pages), а без нього малі зображення (до 700 КБ) у таблиці settings. Ідентифікатори неугадувані, а тип файлу перевіряється за вмістом.
import { randomToken, HttpError } from './util.js';
export const MAX_INLINE = 700 * 1024, MAX_R2 = 90 * 1024 * 1024;
const getSetting = async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first(); return r ? r.value : null; };
const setSetting = (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, Date.now()).run();
export const mediaMode = env => (env.MEDIA && typeof env.MEDIA.put === 'function' ? 'r2' : 'inline');
export const MEDIA_ID = /^[A-Za-z0-9_-]{8,40}$/;
export function sniff(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCode(b[4], b[5], b[6], b[7]) === 'ftyp') return 'video/mp4';
  return null;
}
const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
export async function putMedia(env, bytes) {
  const mime = sniff(bytes); if (!mime) throw new HttpError(400, 'bad_media');
  const id = randomToken(12);
  if (mediaMode(env) === 'r2') { if (bytes.length > MAX_R2) throw new HttpError(413, 'media_too_big'); await env.MEDIA.put(id, bytes, { httpMetadata: { contentType: mime } }); }
  else { if (mime === 'video/mp4' || bytes.length > MAX_INLINE) throw new HttpError(413, mime === 'video/mp4' ? 'media_need_r2' : 'media_too_big'); await setSetting(env, 'media:' + id, JSON.stringify({ m: mime, d: toB64(bytes) })); }
  return { id, mime, size: bytes.length };
}
export async function getMedia(env, id) {
  if (!MEDIA_ID.test(id)) return null;
  if (mediaMode(env) === 'r2') { const o = await env.MEDIA.get(id); if (o) return { bytes: new Uint8Array(await o.arrayBuffer()), mime: (o.httpMetadata && o.httpMetadata.contentType) || 'application/octet-stream' }; }
  const raw = await getSetting(env, 'media:' + id); if (!raw) return null;
  try { const j = JSON.parse(raw); return { bytes: fromB64(j.d), mime: j.m }; } catch { return null; }
}
export async function hasMedia(env, id) {
  if (!MEDIA_ID.test(id)) return false;
  if (mediaMode(env) === 'r2' && (await env.MEDIA.head(id))) return true;
  return !!(await env.DB.prepare('SELECT 1 AS x FROM settings WHERE key = ?').bind('media:' + id).first());
}
export async function mediaMime(env, id) {
  if (!MEDIA_ID.test(id)) return null;
  if (mediaMode(env) === 'r2') { const o = await env.MEDIA.head(id); if (o) return (o.httpMetadata && o.httpMetadata.contentType) || null; }
  const raw = await getSetting(env, 'media:' + id); try { return raw ? JSON.parse(raw).m : null; } catch { return null; }
}
export async function deleteMedia(env, id) {
  if (!MEDIA_ID.test(id)) return;
  if (mediaMode(env) === 'r2') { try { await env.MEDIA.delete(id); } catch {} }
  await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind('media:' + id).run();
}
/** Публічна віддача файлу за id. */
export async function serveMedia(env, id) {
  const m = await getMedia(env, id.replace(/\.(jpe?g|png|mp4)$/i, ''));
  if (!m) return new Response('not found', { status: 404 });
  return new Response(m.bytes, { headers: { 'content-type': m.mime, 'content-length': String(m.bytes.length), 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
}
