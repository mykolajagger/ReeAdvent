// Повернення незавершених замовлень: до двох нагадувань на замовлення (через ~2 год і через добу) з посиланням, що відновлює оплату.
// Вмикається в адмінці (агент росту → «Нагадувати про незавершену оплату»). Стан листів у settings (recovery_state), без міграцій.
import { sendEmail, recoveryEmail } from './email.js';
import { hmac, sha256 } from './util.js';
const H = 36e5, DAY = 864e5;
const getSetting = async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first(); return r ? r.value : null; };
const setSetting = (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, Date.now()).run();

export const resumeSig = (env, id) => hmac(String(env.CRON_SECRET || 'dev-secret'), 'resume:' + id);
export async function resumeUrl(env, id) { return `${env.BASE_URL}/api/orders/${encodeURIComponent(id)}/resume?s=${await resumeSig(env, id)}`; }
export async function resumeValid(env, id, sig) { return !!sig && (await resumeSig(env, id)) === sig; }

export async function recoveryState(env) { try { return JSON.parse((await getSetting(env, 'recovery_state')) || '{}') || {}; } catch { return {}; } }

/** Відправляє нагадування. Умови: замовлення в статусі pending, сума більше нуля, вік 2–40 год; одному адресату не частіше разу на 20 год і не тим, хто вже купив. */
export async function runRecovery(env, { now = Date.now(), max = 25 } = {}) {
  if ((await getSetting(env, 'agent_recovery')) !== '1') return { skipped: 'off' };
  const state = await recoveryState(env);
  for (const k of Object.keys(state)) if ((state[k].t || 0) < now - 4 * DAY) delete state[k];
  const { results } = await env.DB.prepare("SELECT id, created_at, name_a, email_a, payer_email, lang FROM orders WHERE status = 'pending' AND archived_at IS NULL AND amount_kop > 0 AND created_at BETWEEN ? AND ? ORDER BY created_at LIMIT 200").bind(now - 40 * H, now - 2 * H).all();
  let sent = 0, skipped = 0;
  for (const o of results) {
    if (sent >= max) break;
    const s = state[o.id] || (state[o.id] = { t: o.created_at }), age = now - o.created_at;
    if (s.x) continue;                                                                                                                  // уже купили або пропущено назавжди
    const stage = !s.a && age <= 30 * H ? 1 : (s.a && !s.b && age >= 26 * H ? 2 : 0);
    if (!stage) continue;
    const to = String(o.payer_email || o.email_a || '').trim().toLowerCase(); if (!to) continue;
    const ek = '@' + (await sha256(to)).slice(0, 16);
    if (state[ek] && now - state[ek].t < 20 * H) { skipped++; continue; }                                                                       // не частіше разу на 20 год на адресу
    const bought = await env.DB.prepare("SELECT 1 AS x FROM orders WHERE status = 'paid' AND (lower(email_a) = ? OR lower(payer_email) = ?) AND created_at > ? LIMIT 1").bind(to, to, now - 60 * DAY).first();
    if (bought) { s.x = now; skipped++; continue; }                                                                   // уже купили: більше не турбуємо
    try {
      const mail = recoveryEmail(env, { name: o.name_a, link: await resumeUrl(env, o.id), lang: o.lang, stage });
      await sendEmail(env, to, mail.subject, mail.html, mail.text, { meta: { kind: 'recovery_' + stage, orderId: o.id } });
      s[stage === 1 ? 'a' : 'b'] = now; state[ek] = { t: now }; sent++;
    } catch (e) { console.error('recovery email', e && e.message); }
  }
  await setSetting(env, 'recovery_state', JSON.stringify(state));
  return { sent, skipped, candidates: results.length };
}

/** Скільки замовлень оплатили після нагадування (за збереженим станом). */
export async function recoveredCount(env) {
  const state = await recoveryState(env), ids = Object.entries(state).filter(([k, v]) => !k.startsWith('@') && (v.a || v.b)).map(([k]) => k);
  if (!ids.length) return { sent: 0, recovered: 0 };
  const { results } = await env.DB.prepare(`SELECT id, paid_at FROM orders WHERE status = 'paid' AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const recovered = results.filter(r => { const v = state[r.id]; return r.paid_at && v && ((v.a && r.paid_at > v.a) || (v.b && r.paid_at > v.b)); }).length;
  return { sent: ids.length, recovered };
}
