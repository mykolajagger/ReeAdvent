// Листи. EMAIL_MODE=stub — запис в таблицю outbox (розробка); EMAIL_MODE=resend — реальна відправка через Resend.
export async function sendEmail(env, to, subject, html, text) {
  if (env.EMAIL_MODE !== 'resend') {
    await env.DB.prepare('INSERT INTO outbox (created_at, to_email, subject, body) VALUES (?,?,?,?)').bind(Date.now(), to, subject, text).run();
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text })
  });
  if (!res.ok) throw new Error('email_error');
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function layout(title, body, ctaUrl, ctaLabel) {
  return `<div style="font-family:Georgia,serif;background:#08090d;color:#f3efe6;padding:32px;max-width:520px;margin:auto">
  <div style="letter-spacing:.3em;font:600 11px sans-serif;color:#d6b46a">REEADVENT</div>
  <h1 style="font-weight:400;font-size:30px;margin:10px 0 18px">${esc(title)}</h1>
  <div style="font:15px/1.6 sans-serif;color:#d9d6cc">${body}</div>
  <p><a href="${esc(ctaUrl)}" style="display:inline-block;background:#d6b46a;color:#14110a;padding:13px 26px;border-radius:99px;text-decoration:none;font:600 14px sans-serif">${esc(ctaLabel)}</a></p>
  <p style="font:12px sans-serif;color:#9a9cab">Якщо кнопка не працює, скопіюйте посилання: ${esc(ctaUrl)}</p></div>`;
}

export function welcomeEmail(env, name, partnerName, startDate, link) {
  const text = `Привіт, ${name}!\n\n${partnerName} подарував(ла) вам адвент-календар ReeAdvent. Перше вікно відкриється ${startDate} о 07:00.\nСпочатку заповніть коротку анкету — перейдіть за посиланням (діє 7 днів):\n${link}\n\nНе показуйте відповіді одне одному — це сюрприз.`;
  return { subject: 'Ваш адвент-календар ReeAdvent готовий', text, html: layout(`Привіт, ${name}!`, `<p>Ваш адвент-календар для двох готовий. Перше вікно відкриється <b>${esc(startDate)}</b> о 07:00.</p><p>Спочатку заповніть коротку анкету: відповіді бачите тільки ви — це сюрприз для обох.</p>`, link, 'Відкрити календар') };
}
export function loginEmail(env, name, link) {
  const text = `Привіт, ${name}!\nВаше посилання для входу в ReeAdvent (діє 30 хвилин, одноразове):\n${link}`;
  return { subject: 'Вхід у ReeAdvent', text, html: layout('Вхід у календар', '<p>Натисніть кнопку, щоб увійти. Посилання одноразове і діє 30 хвилин.</p>', link, 'Увійти') };
}
