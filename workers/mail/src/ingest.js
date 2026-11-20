// Зберігає вхідний лист у D1 (скринька підтримки). Без зовнішніх залежностей: використовується і в Worker, і в тестах.
const clip = (s, n) => String(s || '').slice(0, n);
const htmlToText = h => String(h || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();

/** parsed — результат postal-mime ({from:{name,address}, subject, text, html, messageId}); fallbackFrom — адреса з конверта. */
export async function saveInbound(DB, parsed, fallbackFrom, now = Date.now()) {
  const from = clip((parsed.from?.address || fallbackFrom || '').toLowerCase().trim(), 200);
  if (!from || !from.includes('@')) return { saved: false, reason: 'no_sender' };
  if (/^(mailer-daemon|postmaster|no-?reply)@/i.test(from)) return { saved: false, reason: 'automated' };
  const msgId = parsed.messageId ? clip(parsed.messageId, 300) : null;
  if (msgId && await DB.prepare('SELECT 1 AS x FROM messages WHERE msg_id = ? AND thread_email = ?').bind(msgId, from).first()) return { saved: false, reason: 'duplicate' };
  const subject = clip(parsed.subject || '(без теми)', 300);
  const body = clip((parsed.text && parsed.text.trim()) || htmlToText(parsed.html) || '(порожній лист)', 20000);
  const name = parsed.from?.name ? clip(parsed.from.name, 100) : null;
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await DB.batch([
    DB.prepare('INSERT INTO messages (id, thread_email, direction, from_email, from_name, to_email, subject, body_text, created_at, msg_id) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, from, 'in', from, name, 'support', subject, body, now, msgId),
    DB.prepare(`INSERT INTO threads (email, name, status, last_at, last_subject, unread) VALUES (?,?,'open',?,?,1)
      ON CONFLICT(email) DO UPDATE SET last_at = excluded.last_at, last_subject = excluded.last_subject, unread = unread + 1, status = 'open', name = COALESCE(excluded.name, name)`).bind(from, name, now, subject)
  ]);
  return { saved: true, id, from };
}
