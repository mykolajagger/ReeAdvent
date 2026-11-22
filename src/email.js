// Листи. EMAIL_MODE=stub — запис в таблицю outbox (розробка); EMAIL_MODE=resend — реальна відправка через Resend.
// Усі шаблони двомовні (uk/en): мова береться з календаря (lang).
import { UNLOCK_HOUR } from './util.js';
import { logEmail } from './comms.js';

async function deliver(env, to, subject, html, text, opts) {
  if (env.EMAIL_MODE !== 'resend') {
    await env.DB.prepare('INSERT INTO outbox (created_at, to_email, subject, body) VALUES (?,?,?,?)').bind(Date.now(), to, subject, text).run();
    return null;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: opts.from || env.EMAIL_FROM, to: [to], subject, html, text, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}), ...(opts.headers ? { headers: opts.headers } : {}) })
  });
  if (!res.ok) { const err = new Error('email_error'); err.detail = `Resend ${res.status}: ${String(await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`; throw err; }
  const j = await res.json().catch(() => ({})); return j && j.id ? j.id : null;
}

/** Надсилає лист. opts.meta ({ kind, orderId, memberId, startDate }) вмикає запис у журнал «Комунікації»; службові листи адміністраторам без meta не журналяться. */
export async function sendEmail(env, to, subject, html, text, opts = {}) {
  const meta = opts.meta; let extId = null;
  try { extId = await deliver(env, to, subject, html, text, opts); }
  catch (e) { if (meta) await logEmail(env, { ...meta, to, subject, text, status: 'failed', error: e.detail || e.message }); throw e; }
  if (meta) await logEmail(env, { ...meta, to, subject, text, status: 'sent', extId });
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = lang => (lang === 'en' ? 'en' : 'uk');
const hh = String(UNLOCK_HOUR).padStart(2, '0') + ':00';
export function fmtDate(dateStr, lang) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function layout(lang, title, paras, ctaUrl, ctaLabel, foot) {
  const fallback = lang === 'en' ? 'If the button does not work, copy this link' : 'Якщо кнопка не працює, скопіюйте посилання';
  return `<div style="font-family:Georgia,serif;background:#08090d;color:#f3efe6;padding:32px;max-width:520px;margin:auto">
  <div style="letter-spacing:.3em;font:600 11px sans-serif;color:#d6b46a">REEADVENT</div>
  <h1 style="font-weight:400;font-size:30px;margin:10px 0 18px">${esc(title)}</h1>
  <div style="font:15px/1.6 sans-serif;color:#d9d6cc">${paras.map(p => `<p style="margin:0 0 12px">${p}</p>`).join('')}</div>
  <p><a href="${esc(ctaUrl)}" style="display:inline-block;background:#d6b46a;color:#14110a;padding:13px 26px;border-radius:99px;text-decoration:none;font:600 14px sans-serif">${esc(ctaLabel)}</a></p>
  <p style="font:12px sans-serif;color:#9a9cab">${fallback}: ${esc(ctaUrl)}</p><p style="font:12px sans-serif;color:#9a9cab">Instagram: <a href="https://www.instagram.com/reeadvent/" style="color:#d6b46a">@reeadvent</a></p>${foot ? `<p style="font:12px sans-serif;color:#9a9cab">${foot}</p>` : ''}</div>`;
}
const strip = s => s.replace(/<[^>]+>/g, '');

const T = {
  uk: {
    hello: n => `Привіт, ${n}!`,
    buyer: { subject: 'Ваш адвент-календар ReeAdvent готовий', title: n => `Привіт, ${n}!`, cta: 'Заповнити анкету',
      p: (partner, date) => [`Дякуємо за замовлення. Ваш ReeAdvent готовий: 24 дні сюрпризів лише для вас двох.`, `Ми вже надіслали ${esc(partner)} окремий лист із запрошенням. Перше вікно відкриється <b>${esc(date)}</b> о ${hh}.`, `Спочатку заповніть коротку анкету (близько 3 хвилин). Ваші відповіді бачите тільки ви.`] },
    partner: { subject: buyer => `${buyer} створює для вас ваш спільний ReeAdvent`, title: n => `Привіт, ${n}!`, cta: 'Заповнити анкету',
      p: (buyer, date) => [`<b>${esc(buyer)}</b> створює для вас ваш спільний ReeAdvent: 24 дні маленьких сюрпризів лише для вас двох.`, `Щоранку нове вікно: питання одне одному, подарунок, романтична пригода і спільна активність у вашому місті. Підібрано під ваші вподобання, а що саме чекає, ви не знаєте.`, `Перше вікно відкриється <b>${esc(date)}</b> о ${hh}. А поки що заповніть коротку анкету (близько 3 хвилин): вона допоможе підібрати все саме для вас. Ваші відповіді бачите тільки ви, навіть ${esc(buyer)} їх не побачить.`] },
    login: { subject: 'Вхід у ReeAdvent', title: 'Вхід у календар', cta: 'Увійти', p: () => ['Натисніть кнопку, щоб увійти. Посилання одноразове і діє 30 хвилин.'] },
    survey: { subject: 'Заповніть анкету, щоб ваш ReeAdvent склався', title: n => `${n}, чекаємо на вашу анкету`, cta: 'Заповнити анкету',
      p: (before, date) => [before ? `Завтра, ${esc(date)}, стартує ваш ReeAdvent, але ми ще чекаємо на вашу анкету.` : `Ваш ReeAdvent уже стартував, але без вашої анкети календар не складеться.`, `Це займе близько 3 хвилин, а відповіді бачите тільки ви.`] },
    eve: { subject: 'Завтра відкриється перше вікно ReeAdvent', title: n => `${n}, завтра починаємо`, cta: 'Відкрити календар',
      p: () => [`Завтра о ${hh} відкриється перше вікно вашого ReeAdvent. Ми надішлемо нагадування, коли буде час.`] },
    window: { subject: d => `Вікно №${d} вашого ReeAdvent чекає на вас`, title: (n, d) => `${n}, вікно №${d} уже відкрите`, cta: 'Відкрити вікно',
      p: () => [`У сьогоднішньому вікні: питання для вашої половинки, подарунок, пригода й активність. Відкрийте, коли буде зручно.`] },
    unsub: 'Не хочете отримувати нагадування?', unsubLink: 'Відписатися', brand: 'З повагою, підтримка ReeAdvent',
    refund: { subject: 'Повернення коштів за ReeAdvent', title: 'Повернення оформлено',
      p: (amount, days) => [`Ми оформили повернення ${esc(amount)} за ваше замовлення ReeAdvent. Кошти надійдуть на вашу картку протягом ${days} банківських днів (залежно від банку).`, `Доступ до календаря закрито. Якщо це сталося помилково або є питання, просто відповідайте на цей лист.`] },
    reply: 'З повагою, підтримка ReeAdvent', subjFallback: 'Відповідь підтримки', link7: 'Посилання діє 7 днів.'
  },
  en: {
    hello: n => `Hi ${n}!`,
    buyer: { subject: 'Your ReeAdvent advent calendar is ready', title: n => `Hi ${n}!`, cta: 'Fill in the questionnaire',
      p: (partner, date) => [`Thank you for your order. Your ReeAdvent is ready: 24 days of little surprises just for the two of you.`, `We have already sent ${esc(partner)} a separate invitation. The first window opens on <b>${esc(date)}</b> at ${hh}.`, `First, please fill in a short questionnaire (about 3 minutes). Only you can see your answers.`] },
    partner: { subject: buyer => `${buyer} is creating your shared ReeAdvent`, title: n => `Hi ${n}!`, cta: 'Fill in the questionnaire',
      p: (buyer, date) => [`<b>${esc(buyer)}</b> is creating your shared ReeAdvent: 24 days of little surprises just for the two of you.`, `Every morning a new window opens: a question for each other, a gift idea, a romantic adventure and a shared activity in your city. Everything is matched to your tastes, but what exactly is waiting for you stays a surprise.`, `The first window opens on <b>${esc(date)}</b> at ${hh}. Until then, please fill in a short questionnaire (about 3 minutes) so we can tailor everything to you. Only you can see your answers, not even ${esc(buyer)}.`] },
    login: { subject: 'Sign in to ReeAdvent', title: 'Sign in', cta: 'Sign in', p: () => ['Press the button to sign in. The link works once and expires in 30 minutes.'] },
    survey: { subject: 'Fill in your questionnaire to build your ReeAdvent', title: n => `${n}, we are waiting for your answers`, cta: 'Fill in the questionnaire',
      p: (before, date) => [before ? `Your ReeAdvent starts tomorrow, ${esc(date)}, but we are still waiting for your questionnaire.` : `Your ReeAdvent has already started, but it cannot be built without your questionnaire.`, `It takes about 3 minutes, and only you can see your answers.`] },
    eve: { subject: 'The first window of your ReeAdvent opens tomorrow', title: n => `${n}, we start tomorrow`, cta: 'Open the calendar',
      p: () => [`Tomorrow at ${hh} the first window of your ReeAdvent opens. We will send you a reminder when it is time.`] },
    window: { subject: d => `Window ${d} of your ReeAdvent is waiting`, title: (n, d) => `${n}, window ${d} is open`, cta: 'Open the window',
      p: () => [`Today's window has a question for your partner, a gift idea, an adventure and an activity. Open it whenever suits you.`] },
    unsub: 'Do not want reminders?', unsubLink: 'Unsubscribe', brand: 'Best regards, ReeAdvent support',
    refund: { subject: 'Your ReeAdvent refund', title: 'Refund issued',
      p: (amount, days) => [`We have issued a refund of ${esc(amount)} for your ReeAdvent order. The money should reach your card within ${days} banking days (depending on your bank).`, `Access to the calendar has been closed. If this was a mistake or you have questions, just reply to this email.`] },
    reply: 'Best regards, ReeAdvent support', subjFallback: 'Support reply', link7: 'The link is valid for 7 days.'
  }
};

const codeLine = (lang, code, ttl) => lang === 'en'
  ? `Or enter this code on the sign-in page together with your email: <b style="letter-spacing:.15em;font-size:18px">${esc(code)}</b> (valid ${ttl === 'long' ? '7 days' : '30 minutes'}, 5 attempts).`
  : `Або введіть цей код на сторінці входу разом із вашою поштою: <b style="letter-spacing:.15em;font-size:18px">${esc(code)}</b> (діє ${ttl === 'long' ? '7 днів' : '30 хвилин'}, 5 спроб).`;

function build(lang, { subject, title, paras, cta, url, foot, footText }) {
  const html = layout(lang, title, paras, url, cta, foot);
  const text = `${title}\n\n${paras.map(strip).join('\n\n')}\n\n${cta}: ${url}${footText ? '\n\n' + footText : ''}`;
  return { subject, html, text };
}

/** Лист покупцю (slot 0): ваше замовлення готове, партнеру вже надіслано запрошення. */
export function welcomeEmail(env, name, partnerName, startDate, link, lang = 'uk', code = null) {
  lang = L(lang); const t = T[lang].buyer;
  return build(lang, { subject: t.subject, title: t.title(name), paras: [...t.p(partnerName, fmtDate(startDate, lang)), T[lang].link7, ...(code ? [codeLine(lang, code, 'long')] : [])], cta: t.cta, url: link });
}
/** Лист партнеру (slot 1): «[ім'я] створює для вас ваш спільний ReeAdvent». */
export function partnerInviteEmail(env, name, buyerName, startDate, link, lang = 'uk', code = null) {
  lang = L(lang); const t = T[lang].partner;
  return build(lang, { subject: t.subject(buyerName), title: t.title(name), paras: [...t.p(buyerName, fmtDate(startDate, lang)), T[lang].link7, ...(code ? [codeLine(lang, code, 'long')] : [])], cta: t.cta, url: link });
}
export function loginEmail(env, name, link, lang = 'uk', code = null) {
  lang = L(lang); const t = T[lang].login;
  return build(lang, { subject: t.subject, title: t.title, paras: [...t.p(), ...(code ? [codeLine(lang, code, 'short')] : [])], cta: t.cta, url: link });
}
/** Нагадування. kind: survey | eve | window. */
export function reminderEmail(env, kind, { name, day, startDate, link, unsubUrl, lang = 'uk', beforeStart }) {
  lang = L(lang); const t = T[lang][kind];
  const foot = `${T[lang].unsub} <a href="${esc(unsubUrl)}" style="color:#9a9cab">${T[lang].unsubLink}</a>`, footText = `${T[lang].unsub} ${T[lang].unsubLink}: ${unsubUrl}`;
  if (kind === 'window') return build(lang, { subject: t.subject(day), title: t.title(name, day), paras: t.p(), cta: t.cta, url: link, foot, footText });
  if (kind === 'survey') return build(lang, { subject: t.subject, title: t.title(name), paras: t.p(beforeStart, fmtDate(startDate, lang)), cta: t.cta, url: link, foot, footText });
  return build(lang, { subject: t.subject, title: t.title(name), paras: t.p(), cta: t.cta, url: link, foot, footText });
}
/** Нагадування про незавершену оплату: stage 1 (через ~2 год) і stage 2 (через добу). Не більше двох листів на замовлення. */
export function recoveryEmail(env, { name, link, lang = 'uk', stage = 1 }) {
  lang = L(lang);
  const D = {
    uk: { s1: 'Ви майже замовили ReeAdvent', s2: 'Ваш ReeAdvent ще чекає на вас', title: n => `${n}, лишився один крок`, cta: 'Завершити замовлення',
      p: ['Ви почали оформлювати адвент-календар для двох, але оплата не завершилась.', 'Натисніть кнопку: ми відновимо замовлення, усе вже заповнено, лишилося оплатити. Відкриється нова сторінка оплати.', 'Якщо обрана вами дата старту вже мине, календар стартує наступного дня.'],
      foot: 'Ми надішлемо не більше двох нагадувань про це замовлення. Якщо ви передумали, просто проігноруйте лист.' },
    en: { s1: 'You almost ordered ReeAdvent', s2: 'Your ReeAdvent is still waiting', title: n => `${n}, one step left`, cta: 'Complete the order',
      p: ['You started ordering an advent calendar for two, but the payment was not completed.', 'Press the button and we will restore the order: everything is filled in, you only need to pay. A new payment page will open.', 'If the start date you chose has already passed, the calendar starts the next day.'],
      foot: 'We send no more than two reminders about this order. If you changed your mind, simply ignore this email.' } }[lang];
  return build(lang, { subject: stage === 2 ? D.s2 : D.s1, title: D.title(name), paras: D.p, cta: D.cta, url: link, foot: D.foot, footText: D.foot });
}
export function refundEmail(env, amountText, lang = 'uk') {
  lang = L(lang); const t = T[lang].refund;
  return { subject: t.subject, html: `<div style="font:15px/1.6 sans-serif;color:#1d1a14;max-width:560px"><h2 style="font-weight:500">${t.title}</h2>${t.p(amountText, 10).map(p => `<p>${p}</p>`).join('')}<p style="color:#6b6a72;font-size:13px">${T[lang].brand}</p></div>`, text: `${t.title}\n\n${t.p(amountText, 10).map(strip).join('\n\n')}\n\n${T[lang].brand}` };
}
export function supportReplyEmail(env, body, inReplyTo, lang = 'uk') {
  lang = L(lang);
  const html = `<div style="font:15px/1.6 sans-serif;color:#1d1a14;max-width:560px">${esc(body).replace(/\n/g, '<br>')}<p style="color:#6b6a72;font-size:13px;margin-top:24px">${T[lang].reply} · <a href="${esc(env.BASE_URL)}">${esc(env.BASE_URL)}</a></p></div>`;
  const text = `${body}\n\n--\n${T[lang].reply} · ${env.BASE_URL}`;
  return { html, text, headers: inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : undefined };
}
