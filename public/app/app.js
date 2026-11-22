(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Мова ---------- */
let LANG = (() => { try { const s = localStorage.getItem('lang'); if (s === 'uk' || s === 'en') return s; } catch {} return /^uk/i.test(navigator.language || '') ? 'uk' : 'en'; })();
const L = (uk, en) => (LANG === 'en' ? en : uk);
const setLang = l => { LANG = l; try { localStorage.setItem('lang', l); } catch {} document.documentElement.lang = l; };
document.documentElement.lang = LANG;
const LOCALE = () => (LANG === 'en' ? 'en-GB' : 'uk-UA');

let st = null, tab = 'cal';
const cur = () => (st && st.currency) || { code: 'UAH', rate: 1 };
const niceRound = v => v < 100 ? Math.max(1, Math.round(v)) : v < 1000 ? Math.round(v / 5) * 5 : v < 10000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100;
const niceNum = v => { const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
/** Сума в гривнях -> рядок у валюті країни календаря (для UAH: «≈ 200 ₴»). */
const fmtCur = (uah, approx = true) => {
  if (cur().code === 'UAH') return `${approx ? '≈ ' : ''}${uah} ₴`;
  const v = niceRound(uah * cur().rate);
  try { return (approx ? '≈ ' : '') + new Intl.NumberFormat(LANG === 'en' ? 'en' : 'uk', { style: 'currency', currency: cur().code, maximumFractionDigits: 0 }).format(v); } catch { return `${approx ? '≈ ' : ''}${v} ${cur().code}`; }
};
const money = uah => fmtCur(uah, true);
/** Слайдер бюджету подарунка у валюті країни: { min, max, step, def, toUah(v), show(v) }. */
const budgetCfg = () => {
  if (cur().code === 'UAH') return { min: 100, max: 500, step: 50, def: 300, toUah: v => v, show: v => `${v} ₴` };
  const r = cur().rate, step = niceNum((500 - 100) * r / 8), min = Math.max(step, Math.round(100 * r / step) * step), max = Math.max(min + step, Math.round(500 * r / step) * step);
  return { min, max, step, def: Math.min(max, Math.max(min, Math.round(300 * r / step) * step)), toUah: v => Math.min(1000, Math.max(100, Math.round(v / r))), show: v => fmtCur(v / r, false) };
};
const dayDate = day => { const [y, m, d] = st.startDate.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + day - 1)).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'long', timeZone: 'UTC' }); };
const dtime = ms => new Date(ms).toLocaleString(LOCALE(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const hh = () => String(st?.unlockHour ?? 7).padStart(2, '0') + ':00';

/* ---------- API ---------- */
async function api(method, path, body) {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || j.ok === false) { const e = new Error(j.error || 'server_error'); e.code = j.error || 'server_error'; throw e; }
  return j;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200); }
function errText(e) {
  const m = {
    auth: ['Сесія закінчилась. Увійдіть знову', 'Your session has expired. Please sign in again'], not_yet: ['Ще зарано', 'It is too early'], locked: ['Анкету вже не можна змінити', 'The questionnaire can no longer be changed'],
    bad_name: ['Вкажіть ім’я', 'Please enter a name'], bad_email: ['Перевірте адресу пошти', 'Please check the email address'], bad_token: ['Посилання недійсне. Запросіть нове', 'The link is not valid. Please request a new one'],
    too_many: ['Забагато спроб. Спробуйте пізніше', 'Too many attempts. Please try again later'], answer_short: ['Напишіть хоча б кілька слів', 'Please write at least a few words'], bad_day: ['Це вікно ще не відкрите', 'This window is not open yet'],
    no_access: ['Цієї пошти немає серед учасників календаря', 'This email is not a participant of the calendar'], bad_code: ['Невірний або прострочений код', 'The code is wrong or has expired'], already_answered: ['Ви вже відповіли на це питання', 'You have already answered this question']
  }[e.code];
  return m ? L(m[0], m[1]) : L('Щось пішло не так. Спробуйте ще раз.', 'Something went wrong. Please try again.');
}
async function logout(all) { try { await api('POST', all ? '/api/auth/logout-all' : '/api/auth/logout'); } catch {} try { window.google?.accounts?.id?.disableAutoSelect(); } catch {} showLogin(); }

/* ---------- Вхід ---------- */
const langSwitch = () => `<div class="langsw" role="group" aria-label="Language"><button data-lang="uk" class="${LANG === 'uk' ? 'on' : ''}">UA</button><button data-lang="en" class="${LANG === 'en' ? 'on' : ''}">EN</button></div>`;
app.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b && b.dataset.lang !== LANG) { setLang(b.dataset.lang); st ? route() : showLogin(); } });

function showLogin(msg) {
  app.innerHTML = `<section class="hero">
    <svg class="ico" viewBox="0 0 48 48"><path d="M24 4v40M4 24h40M10 10l28 28M38 10L10 38"/></svg>
    <div class="eyebrow">ReeAdvent</div><h1>${L('Ваш <em>Адвент</em>', 'Your <em>Advent</em>')}</h1>
    <p class="muted">${L('Увійдіть через Google або отримайте код і посилання на пошту, на яку надійшло запрошення.', 'Sign in with Google, or get a code and a link by email, at the address that received the invitation.')}</p>
    <div id="gbtn" class="gwrap"></div>
    <div class="or" id="gor" hidden>${L('або', 'or')}</div>
    <form id="lf" style="display:grid;gap:12px;width:100%;max-width:360px">
      <input id="em" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required class="inp">
      <button class="btn" id="sb">${L('Надіслати код і посилання', 'Send a code and a link')}</button>
    </form>
    <p class="err" id="lm">${esc(msg || '')}</p>
    ${langSwitch()}
  </section>`;
  initGoogle();
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const email = $('#em').value.trim(); $('#sb').disabled = true;
    try { await api('POST', '/api/auth/request', { email }); showCodeForm(email); }
    catch (er) { $('#lm').textContent = errText(er); $('#sb').disabled = false; }
  };
}
function showCodeForm(email) {
  $('#lf').outerHTML = `<div class="muted" style="max-width:360px">${L('Якщо ця пошта має доступ, лист із кодом і посиланням уже в дорозі (перевірте «Спам»). Введіть код або перейдіть за посиланням.', 'If this address has access, an email with a code and a link is on its way (check Spam). Enter the code or follow the link.')}</div>
    <form id="cf" style="display:grid;gap:12px;width:100%;max-width:360px"><input id="cd" class="inp" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123 456" style="text-align:center;letter-spacing:.3em;font-size:22px" required><button class="btn" id="cb">${L('Увійти', 'Sign in')}</button></form>`;
  $('#cd').focus();
  $('#cf').onsubmit = async e => {
    e.preventDefault(); $('#cb').disabled = true;
    try { await api('POST', '/api/auth/code', { email, code: $('#cd').value }); boot(); }
    catch (er) { $('#lm').textContent = errText(er); $('#cb').disabled = false; }
  };
}
let gisLoaded = false;
async function initGoogle() {
  let cfg; try { cfg = await (await fetch('/api/config')).json(); } catch { return; }
  if (!cfg.googleClientId || !$('#gbtn')) return;
  const render = () => {
    if (!window.google?.accounts?.id || !$('#gbtn')) return;
    google.accounts.id.initialize({ client_id: cfg.googleClientId, auto_select: false, callback: async r => {
      try { await api('POST', '/api/auth/google', { credential: r.credential }); boot(); }
      catch (e) { $('#lm') && ($('#lm').textContent = e.code === 'no_access' ? L('Ця Google-пошта не є учасником календаря. Увійдіть за кодом чи посиланням на пошту, на яку надійшло запрошення.', 'This Google email is not a participant of the calendar. Sign in with a code or link sent to the email that received the invitation.') : errText(e)); }
    } });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: Math.min(320, Math.max(220, innerWidth - 64)), locale: LANG });
    $('#gbtn').classList.add('on'); $('#gor').hidden = false;
  };
  if (window.google?.accounts?.id) return render();
  if (gisLoaded) return;
  gisLoaded = true; const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = render; document.head.appendChild(s);
}
async function consumeLoginHash() {
  const m = location.hash.match(/login=([\w-]+)/); if (!m) return;
  history.replaceState(null, '', location.pathname);
  try { await api('POST', '/api/auth/verify', { token: m[1] }); }
  catch { showLogin(L('Посилання вже недійсне. Запросіть нове або введіть код.', 'This link is no longer valid. Request a new one or enter a code.')); return 'fail'; }
}

/* ---------- Анкета ---------- */
const GIFT_OPTS = { sweet: ['Солодощі', 'Sweets'], tea: ['Чай і кава', 'Tea & coffee'], beauty: ['Догляд і б’юті', 'Beauty & care'], cozy: ['Затишок', 'Cosiness'], book: ['Книги', 'Books'], tech: ['Гаджети', 'Gadgets'], game: ['Ігри', 'Games'], craft: ['Творчість', 'Crafts'], plant: ['Рослини', 'Plants'], jewel: ['Прикраси', 'Jewellery'], sport: ['Спорт', 'Sport'], music: ['Музика', 'Music'], art: ['Арт і декор', 'Art & decor'], gourmet: ['Гурме', 'Gourmet'], fun: ['Кумедні дрібнички', 'Funny little things'], photo: ['Фото та спогади', 'Photos & memories'], alcohol: ['Вино й крафт', 'Wine & craft drinks'], scent: ['Аромати', 'Scents'] };
const AVOID_OPTS = { alcohol: ['Не п’ю алкоголь', 'I do not drink alcohol'], sweet: ['Без солодкого', 'No sweets'], scent: ['Без парфумів і ароматів', 'No perfumes or scents'] };
const INTIM_OPTS = { mas: ['Масаж', 'Massage'], bath: ['Ванна / SPA', 'Bath / spa'], dance: ['Танці', 'Dancing'], game: ['Ігри', 'Games'], role: ['Рольові ігри', 'Role-play'], blind: ['Сенсорні (пов’язка)', 'Sensory play (blindfold)'], photo: ['Фото лише для нас', 'Photos just for us'], words: ['Слова й листи', 'Words & letters'], food: ['Смаколики', 'Treats'], tease: ['Флірт і дражнилки', 'Flirting & teasing'], cozy: ['Затишок', 'Cosiness'], music: ['Музика', 'Music'], dress: ['Образи й білизна', 'Outfits & lingerie'] };
const ACT_OPTS = { home: ['Затишок удома', 'Cosy at home'], out: ['Прогулянки', 'Walks'], food: ['Їжа й заклади', 'Food & places'], cult: ['Культура й музеї', 'Culture & museums'], act: ['Актив і спорт', 'Active & sport'], craft: ['Творчість', 'Creativity'], relax: ['SPA й релакс', 'Spa & relaxation'], night: ['Вечірній відпочинок', 'Evenings out'], cine: ['Кіно', 'Cinema'], play: ['Ігри', 'Games'], trip: ['Поїздки околицями', 'Day trips'], music: ['Музика', 'Music'] };
const LEVELS = [['Романтика', 'Romance', 'I', 'Ніжність, свічки, обійми, масаж і слова', 'Tenderness, candles, hugs, massage and words'], ['Гра', 'Play', 'II', 'Флірт, пікантні ігри, дотики із зав’язаними очима', 'Flirting, spicy games, blindfolded touch'], ['Смілива ніч', 'Bold night', 'III', 'Відверто, але завжди з повагою до комфорту обох', 'Explicit, but always respecting the comfort of both']];
const ACT_BUDGETS = () => [['Безкоштовно', 'Free', 'Лише те, що не коштує грошей', 'Only things that cost nothing'], [`До ${fmtCur(300).replace('≈ ', '~')} на двох`, `Up to ${fmtCur(300).replace('≈ ', '~')} for two`, 'Кава, кіно, невеличкі розваги', 'Coffee, cinema, small fun'], [`До ${fmtCur(800).replace('≈ ', '~')}`, `Up to ${fmtCur(800).replace('≈ ', '~')}`, 'Ресторан, майстер-клас, концерт', 'Restaurant, workshop, concert'], ['Без обмежень', 'No limit', 'Термальні води, подорожі, свята', 'Thermal baths, trips, celebrations']];

let ans = { name: '', budget: 300, giftLikes: [], avoid: [], level: 1, intimLikes: [], actLikes: [], actBudget: 1, car: false };
let step = 0, budgetVal = null;
const chips = (key, opts) => `<div class="chips">${Object.entries(opts).map(([k, v]) => `<button type="button" class="chip ${ans[key].includes(k) ? 'on' : ''}" data-chip="${key}" data-v="${k}">${esc(L(v[0], v[1]))}</button>`).join('')}</div>`;
const budgetShown = () => { const c = budgetCfg(); return c.show(budgetVal ?? c.def); };

const STEPS = [
  () => `<h2>${L('Привіт', 'Hello')}</h2><p>${L('Кілька швидких питань, щоб календар був саме для вас. Свої відповіді бачиш тільки ти: партнер їх не побачить, як і ти його.', 'A few quick questions so the calendar fits the two of you. Only you can see your answers, just as you will not see your partner’s.')}</p>
    <div><label class="lbl" for="nm">${L('Як тебе називати?', 'What should we call you?')}</label><input id="nm" type="text" maxlength="30" value="${esc(ans.name)}" placeholder="${L('Ім’я', 'Name')}"></div>`,
  () => `<h2>${L('Подарунки', 'Gifts')}</h2>
    <div><label class="lbl">${L('Мій бюджет на один подарунок', 'My budget for one gift')}</label><div class="big" id="bv">${budgetShown()}</div>
    ${(() => { const c = budgetCfg(); return `<input class="range" id="bg" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${budgetVal ?? c.def}">`; })()}</div>
    <div><label class="lbl">${L('Що люблю отримувати', 'What I love to receive')}</label>${chips('giftLikes', GIFT_OPTS)}</div>
    <div><label class="lbl">${L('Мені краще без…', 'I would rather avoid…')}</label>${chips('avoid', AVOID_OPTS)}</div>`,
  () => `<h2>${L('Пригоди для двох', 'Adventures for two')}</h2><p class="muted">${L('Береться менший рівень із двох: ніхто нікого не змушує.', 'The lower of your two levels is used, so nobody is pushed.')}</p>
    <div class="opts">${LEVELS.map((l, i) => `<button type="button" class="opt ${ans.level === i + 1 ? 'on' : ''}" data-level="${i + 1}"><b>${l[2]} · ${L(l[0], l[1])}</b><small>${L(l[3], l[4])}</small></button>`).join('')}</div>
    <div><label class="lbl">${L('Що мені до вподоби', 'What I enjoy')}</label>${chips('intimLikes', INTIM_OPTS)}</div>`,
  () => `<h2>${L('Спільні активності', 'Shared activities')}</h2>
    <div><label class="lbl">${L('Що ми любимо робити', 'What we love to do')}</label>${chips('actLikes', ACT_OPTS)}</div>
    <div><label class="lbl">${L('Бюджет на день для двох', 'Daily budget for two')}</label><div class="opts">${ACT_BUDGETS().map((b, i) => `<button type="button" class="opt ${ans.actBudget === i ? 'on' : ''}" data-ab="${i}"><b>${L(b[0], b[1])}</b><small>${L(b[2], b[3])}</small></button>`).join('')}</div></div>
    <div><label class="lbl">${L('Є машина для поїздок околицями?', 'Do you have a car for day trips?')}</label><div class="opts two">
      <button type="button" class="opt ${ans.car ? 'on' : ''}" data-car="1"><b>${L('Є', 'Yes')}</b></button><button type="button" class="opt ${!ans.car ? 'on' : ''}" data-car="0"><b>${L('Ні', 'No')}</b></button></div></div>`,
  () => `<div class="center" style="min-height:0">${ICONS.gift}<h2>${L('Усе готово', 'All set')}</h2><p>${L('Після відправки анкету змінити не можна. Календар складеться, коли відповість і другий з вас, і все ж ви не знатимете, що чекає. Це секрет.', 'Once sent, the questionnaire cannot be changed. The calendar will be built when your partner answers too, and you will still not know what is waiting. It is a secret.')}</p></div>`
];

function showSurvey() {
  app.innerHTML = `<div class="card"><div class="dots">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="step">${STEPS[step]()}</div>
    <div class="nav"><button class="btn ghost" id="back" ${step === 0 ? 'style="visibility:hidden"' : ''}>${L('Назад', 'Back')}</button>
    <button class="btn" id="next">${step === STEPS.length - 1 ? L('Відправити', 'Send') : L('Далі', 'Next')}</button></div></div>`;
  const nm = $('#nm'); if (nm) nm.oninput = () => ans.name = nm.value;
  const bg = $('#bg'); if (bg) bg.oninput = () => { budgetVal = +bg.value; ans.budget = budgetCfg().toUah(budgetVal); $('#bv').textContent = budgetShown(); };
  $('#back').onclick = () => { step--; showSurvey(); };
  $('#next').onclick = async () => {
    if (step === 0 && !ans.name.trim()) return toast(L('Напиши, як тебе називати', 'Tell us what to call you'));
    if (step < STEPS.length - 1) { step++; showSurvey(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    $('#next').disabled = true;
    try { st = await api('POST', '/api/survey', { answers: ans }); confetti(); route(); }
    catch (e) { toast(errText(e)); $('#next').disabled = false; }
  };
}
app.addEventListener('click', e => {
  const c = e.target.closest('[data-chip]'); if (c) { const arr = ans[c.dataset.chip], v = c.dataset.v, i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); c.classList.toggle('on'); return; }
  const l = e.target.closest('[data-level]'); if (l) { ans.level = +l.dataset.level; document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === l)); return; }
  const a = e.target.closest('[data-ab]'); if (a) { ans.actBudget = +a.dataset.ab; document.querySelectorAll('[data-ab]').forEach(x => x.classList.toggle('on', x === a)); return; }
  const k = e.target.closest('[data-car]'); if (k) { ans.car = k.dataset.car === '1'; document.querySelectorAll('[data-car]').forEach(x => x.classList.toggle('on', x === k)); }
});

/* ---------- Очікування партнера ---------- */
let pollT;
function showWaiting() {
  app.innerHTML = `<div class="center">${ICONS.gift}<h2>${L('Дякуємо', 'Thank you')}, ${esc(st.me.name)}</h2>
    <p class="muted">${L(`Твоя анкета збережена. Чекаємо, поки ${st.partner.name ? esc(st.partner.name) : 'твоя половинка'} теж відповість, тоді ми складемо календар.<br>Підглядати не можна.`, `Your answers are saved. We are waiting for ${st.partner.name ? esc(st.partner.name) : 'your partner'} to answer too, then we will build the calendar.<br>No peeking.`)}</p>
    <button class="btn ghost sm" id="chk">${L('Перевірити', 'Check')}</button><button class="btn ghost sm" id="out">${L('Вийти', 'Sign out')}</button></div>`;
  $('#chk').onclick = refresh; $('#out').onclick = () => logout();
  clearTimeout(pollT); pollT = setTimeout(refresh, 30000);
}
async function refresh() { try { st = await api('GET', '/api/state'); route(); } catch (e) { handleErr(e); } }

/* ---------- Календар ---------- */
const EASE = 'cubic-bezier(.3,.9,.3,1)';
function order() { const a = Array.from({ length: 24 }, (_, i) => i + 1); let s = 7; for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; }
const fmtT = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; const d = Math.floor(h / 24); return (d ? d + L(' д ', 'd ') : '') + [h % 24, m, x].map(n => String(n).padStart(2, '0')).join(':'); };
const tabsHtml = () => `<div class="tabs"><button data-tab="cal" class="${tab === 'cal' ? 'on' : ''}">${L('Календар', 'Calendar')}</button><button data-tab="hist" class="${tab === 'hist' ? 'on' : ''}">${L('Історія', 'History')}</button></div>`;
app.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b && b.dataset.tab !== tab) { tab = b.dataset.tab; route(); } });
const footTools = () => `<div class="tools"><button class="btn ghost sm" id="out">${L('Вийти', 'Sign out')}</button><button class="btn ghost sm" id="outall">${L('Вийти на всіх пристроях', 'Sign out everywhere')}</button></div>`;
const bindTools = () => { $('#out').onclick = () => logout(); $('#outall').onclick = () => confirm(L('Вийти з усіх пристроїв?', 'Sign out on all devices?')) && logout(true); };

let timerI;
function showCalendar() {
  const opened = new Set(st.opened), today = st.today, nextDay = today + 1, hasNext = nextDay <= st.totalDays;
  app.innerHTML = `${tabsHtml()}<div class="head">
      <div class="eyebrow">${L('ReeAdvent · 24 дні', 'ReeAdvent · 24 days')}</div><h1>${L('Ваш <em>Адвент</em>', 'Your <em>Advent</em>')}</h1>
      <p class="muted">${today === 0 ? L(`Календар відкриється ${dayDate(1)} о ${hh()}`, `The calendar opens on ${dayDate(1)} at ${hh()}`) : L(`Привіт, ${esc(st.me.name)}. Сьогодні вікно №${today}`, `Hi ${esc(st.me.name)}. Today is window ${today}`)}</p>
      ${hasNext ? `<div class="timer" id="tm"></div><div class="eyebrow" style="color:var(--muted)">${L(`до вікна №${nextDay}`, `until window ${nextDay}`)}</div>` : st.finished ? `<div class="timer" style="font-size:24px">${L('Календар завершено', 'The calendar is complete')}</div><div class="muted" style="max-width:420px;margin:0 auto">${L('Дякуємо, що були з нами. Усі вікна, питання й відповіді залишаються доступними в розділі «Історія».', 'Thank you for being with us. All windows, questions and answers stay available in the History tab.')}</div>` : `<div class="timer">${L('Усі вікна відкриті', 'All windows are open')}</div>`}
      <div class="progress"><i style="width:${(opened.size / 24) * 100}%"></i></div>
      <div class="muted" style="font-size:12px;letter-spacing:.1em">${L(`відкрито ${opened.size} з 24`, `${opened.size} of 24 opened`)}</div>
    </div>
    <div class="grid">${order().map(d => {
      const lock = d > today;
      return `<button class="door ${lock ? 'locked' : ''} ${d === today && !opened.has(d) ? 'today' : ''} ${opened.has(d) ? 'opened' : ''}" data-d="${d}" aria-label="${L('Вікно', 'Window')} ${d}">
        <div class="face front">${d}</div><div class="face back"><div>${d}<small>${L('ВІДКРИТО', 'OPENED')}</small></div></div></button>`;
    }).join('')}</div>${footTools()}`;
  bindTools(); clearInterval(timerI);
  if (hasNext) {
    const tick = () => { const el = $('#tm'); if (!el) return clearInterval(timerI); const ms = st.unlockTimes[nextDay - 1] - Date.now(); el.textContent = fmtT(ms); if (ms <= 0) { clearInterval(timerI); refresh(); } };
    tick(); timerI = setInterval(tick, 1000);
  }
}
app.addEventListener('click', e => {
  const d = e.target.closest('.door'); if (!d) return;
  const day = +d.dataset.d;
  if (day > st.today) { d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); toast(L(`Це вікно відкриється ${dayDate(day)} о ${hh()}`, `This window opens on ${dayDate(day)} at ${hh()}`)); return; }
  openDay(day);
});

/* ---------- Історія ---------- */
async function showHistory() {
  const head = (extra = '') => `${tabsHtml()}<div class="head"><div class="eyebrow">ReeAdvent</div><h1>${L('Історія', 'History')}</h1><p class="muted">${L('Усі ваші вікна, питання й відповіді', 'All your windows, questions and answers')}${extra}</p></div>`;
  app.innerHTML = head() + '<div class="center" style="min-height:30vh"><div class="spinner"></div></div>';
  let h; try { h = await api('GET', '/api/history'); } catch (e) { return handleErr(e); }
  const items = h.days.map(d => `<article class="hist ${d.opened ? '' : 'new'}" data-d="${d.day}" tabindex="0" role="button" aria-label="${L('Вікно', 'Window')} ${d.day}">
    <header><b>${L('Вікно', 'Window')} №${d.day}</b><span class="muted">${dayDate(d.day)}${d.opened_at ? L(' · відкрито ', ' · opened ') + dtime(d.opened_at) : ''}</span></header>
    <div class="q">${esc(d.question)}</div>
    ${d.answered ? `<div class="ans"><span class="who">${L('Ви', 'You')}</span><p>${esc(d.mine)}</p></div>${d.partner ? `<div class="ans them"><span class="who">${esc(h.partnerName)}</span><p>${esc(d.partner)}</p></div>` : `<div class="hint">${L(`${esc(h.partnerName)} ще не відповів(ла)`, `${esc(h.partnerName)} has not answered yet`)}</div>`}` : `<div class="muted" style="font-size:13px">${L('Ще не відкрито. Торкніться, щоб відповісти й відкрити вікно.', 'Not opened yet. Tap to answer and open the window.')}</div>`}
    ${d.opened ? `<ul class="tasks"><li class="${d.done.gift ? 'done' : ''}">${L('Подарунок', 'Gift')}: ${esc(d.gift)}</li><li class="${d.done.intim ? 'done' : ''}">${L('Пригода', 'Adventure')}: ${esc(d.intim)}</li><li class="${d.done.act ? 'done' : ''}">${L('Активність', 'Activity')}: ${esc(d.act)}</li></ul>` : ''}</article>`).join('');
  app.innerHTML = head(h.finished ? L('. Календар завершено, але все збережено тут', '. The calendar is complete, but everything is kept here') : '') + `<div class="histlist">${items || `<div class="muted" style="text-align:center">${L('Тут з’являться відкриті вікна, щойно календар стартує.', 'Opened windows will appear here once the calendar starts.')}</div>`}</div>${footTools()}`;
  bindTools();
  const open = el => { const a = el.closest('.hist'); if (a) openDay(+a.dataset.d); };
  const hl = $('.histlist'); if (hl) { hl.onclick = e => open(e.target); hl.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target); } }; }
}

/* ---------- День ---------- */
const ICONS = {
  gift: '<svg class="ico" viewBox="0 0 48 48"><rect x="7" y="18" width="34" height="23" rx="2"/><rect x="5" y="12" width="38" height="6" rx="1"/><path d="M24 12v29M24 12c-3-7-11-7-11-3s6 3 11 3zm0 0c3-7 11-7 11-3s-6 3-11 3z"/></svg>',
  intim: '<svg class="ico" viewBox="0 0 48 48"><path d="M24 40S7 29 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 11-17 22-17 22z"/></svg>',
  act: '<svg class="ico" viewBox="0 0 48 48"><path d="M24 5l3.5 10.5H38l-8.5 6.2 3.3 10.3L24 25.8l-8.8 6.2 3.3-10.3L10 15.5h10.5z"/><path d="M24 33v10"/></svg>'
};
/* Рекомендації закладів: Google Maps (якщо ввімкнено) або наша база OpenStreetMap + оцінки користувачів. Сервер їх для Google не зберігає */
const placesCache = {};
const fmtKm = km => km < 1 ? `${Math.max(50, Math.round(km * 20) * 50)} ${L('м', 'm')}` : `${km.toFixed(1)} ${L('км', 'km')}`;
function placesHtml(day, k = 'act') {
  const p = placesCache[day + k]; if (!p || !p.length) return '';
  const osm = p.some(x => x.id), head = k === 'gift' ? L('Де купити поблизу', 'Where to buy nearby') : osm ? L('Куди піти поблизу', 'Where to go nearby') : L('Рекомендуємо за рейтингом', 'Top rated nearby');
  const OSM = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
  return `<div class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-top:4px">${head}</div><ul class="plist">${p.map(x => {
    const meta = [x.address, x.km != null ? L(`${fmtKm(x.km)} від центру`, `${fmtKm(x.km)} from the centre`) : '', x.hours ? L('Години: ', 'Hours: ') + x.hours : ''].filter(Boolean).map(esc).join(' · ');
    return `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(x.name)}</b></a>${x.rating ? `<span class="stars">★ ${x.rating} <small>(${x.count})</small></span>` : ''}${meta ? `<small class="muted">${meta}</small>` : ''}${x.id ? `<button type="button" class="rep" data-v="${x.id}">${L('Закрито або не існує?', 'Closed or gone?')}</button><span class="rate" data-v="${x.id}"><small class="muted">${L('Ваша оцінка:', 'Your rating:')}</small>${[1, 2, 3, 4, 5].map(n => `<button type="button" data-s="${n}" aria-label="${n}">★</button>`).join('')}</span>` : ''}</li>`; }).join('')}</ul>
    <div class="muted" style="font-size:11px">${osm ? L(`Добірка за даними OpenStreetMap, Overture Maps і оцінками користувачів ReeAdvent. Години роботи можуть бути неточними, перевіряйте на мапі. © ${OSM}, © Overture Maps Foundation. Не знайшли заклад або бачите помилку? <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Додайте чи виправте його на openstreetmap.org</a>.`, `Picked from OpenStreetMap, Overture Maps data and ReeAdvent users’ ratings. Opening hours may be inaccurate, check the map. © ${OSM}, © Overture Maps Foundation. Can’t find a place or see a mistake? <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Add or fix it on openstreetmap.org</a>.`) : L('Рейтинги: Google Maps. Години роботи перевіряйте на мапі.', 'Ratings: Google Maps. Check opening hours on the map.')}</div>`;
}
function bindRate(box) {
  box.querySelectorAll('.rep').forEach(b => b.addEventListener('click', async () => {
    try { await api('POST', `/api/venues/${b.dataset.v}/report`, {}); const li = b.closest('li'); if (li) li.remove(); toast(L('Дякуємо! Заклад більше не показуватимемо вам, ми перевіримо', 'Thanks! We will check it and stop showing it')); } catch { toast(L('Не вдалося надіслати', 'Could not send')); }
  }));
  box.querySelectorAll('.rate').forEach(r => r.addEventListener('click', async e => {
    const b = e.target.closest('button[data-s]'); if (!b) return; const s = +b.dataset.s;
    try { await api('POST', `/api/venues/${r.dataset.v}/rate`, { stars: s }); r.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.s <= s)); toast(L('Дякуємо за оцінку!', 'Thanks for rating!')); } catch { toast(L('Не вдалося зберегти оцінку', 'Could not save the rating')); }
  }));
}
async function loadPlaces(day, k = 'act') {
  const ck = day + k; if (ck in placesCache) return;
  placesCache[ck] = [];
  try { const key = `pl_${day}_${k}_${st.me.name}`; let v = null; try { v = JSON.parse(sessionStorage.getItem(key)); } catch {}
    if (!v) { v = (await api('GET', `/api/places/${day}?k=${k}`)).places; try { sessionStorage.setItem(key, JSON.stringify(v)); } catch {} }
    placesCache[ck] = v; const box = $('#places-box-' + k); if (box) { box.innerHTML = placesHtml(day, k); bindRate(box); }
    if (k === 'act' && v.length) { const ml = document.querySelector('.maplink .ml'); if (ml) ml.textContent = L('Шукати самим на мапі', 'Search the map yourself'); } // з рекомендаціями пошук стає альтернативою
  } catch { /* рекомендації необов'язкові */ }
}
/* Поділитися в Stories: картинка 1080×1920 малюється на пристрої (лише номер дня й слоган, жодного змісту вікон), далі системне меню «Поділитися» (Instagram) або збереження файлу */
async function storyImage(day) {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a0b12'); bg.addColorStop(1, '#17120a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let seed = day * 9301 + 49297; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;   // зірки детерміновані за днем
  for (let i = 0; i < 90; i++) { g.globalAlpha = 0.15 + rnd() * 0.5; g.fillStyle = '#f3efe6'; g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2.2, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '/assets/logo-full.png'; });
  if (img) { const w = 860, h = img.height * w / img.width; g.drawImage(img, (W - w) / 2, 560, w, h); }
  g.textAlign = 'center'; g.fillStyle = '#d6b46a';
  g.font = '600 150px "Cormorant Garamond", Georgia, serif'; g.fillText(L('День ' + day, 'Day ' + day), W / 2, 1180);
  g.fillStyle = '#f3efe6'; g.font = '400 54px "Cormorant Garamond", Georgia, serif'; g.fillText(L('із 24 днів лише для нас двох', 'of 24 days just for the two of us'), W / 2, 1270);
  g.fillStyle = '#9a9cab'; g.font = '500 40px Inter, Arial, sans-serif'; g.fillText('@reeadvent · reeadvent.fun', W / 2, 1700);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
async function shareStory(day) {
  try {
    const blob = await storyImage(day), file = new File([blob], `reeadvent-day-${day}.png`, { type: 'image/png' });
    const text = L('Наш ReeAdvent: 24 дні лише для двох ✦ @reeadvent', 'Our ReeAdvent: 24 days just for two ✦ @reeadvent');
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(L('Картинку збережено: додайте її в Stories й позначте @reeadvent', 'Image saved: add it to your Story and tag @reeadvent'));
  } catch (e) { if (e && e.name !== 'AbortError') toast(L('Не вдалося підготувати картинку', 'Could not prepare the image')); }
}
const TILES = () => [{ k: 'gift', t: L('Подарунок', 'Gift') }, { k: 'intim', t: L('Пригода для двох', 'Adventure for two') }, { k: 'act', t: L('Спільна активність', 'Shared activity') }];
async function openDay(day) {
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet"><div class="center"><div class="spinner"></div></div></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); refresh(); };
  const onKey = e => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  let d;
  const fail = e => { ov.remove(); document.removeEventListener('keydown', onKey); handleErr(e); };
  try { d = await api('GET', '/api/day/' + day); } catch (e) { return fail(e); }
  const revealed = {};
  const head = `<header><h2>${L('Вікно', 'Window')} <span>№${day}</span></h2><button class="x" aria-label="${L('Закрити', 'Close')}">✕</button></header>`;
  const renderQuestion = () => {
    ov.firstElementChild.innerHTML = `${head}
      <div class="reveal qcard"><div class="tag">${L('Питання дня · для', 'Question of the day · for')} ${esc(d.forName)}</div><h3>${esc(d.question.text)}</h3>
        <p class="muted" style="font-size:14px">${L(`Напишіть відповідь для ${esc(d.forName)}: вона її прочитає. Після відповіді відкриються завдання на день. Змінити відповідь потім не можна.`, `Write an answer for ${esc(d.forName)}: they will read it. After you answer, the tasks of the day open. You cannot change the answer later.`)}</p>
        <textarea id="ans" maxlength="600" rows="5" placeholder="${L('Ваша відповідь…', 'Your answer…')}"></textarea>
        <div class="meta"><span id="cnt">0 / 600</span></div>
        <button class="btn" id="send" disabled>${L('Надіслати й відкрити день', 'Send and open the day')}</button></div>`;
    ov.querySelector('.x').onclick = close;
    const ta = ov.querySelector('#ans'), btn = ov.querySelector('#send');
    ta.oninput = () => { ov.querySelector('#cnt').textContent = ta.value.length + ' / 600'; btn.disabled = ta.value.trim().length < 2; };
    ta.focus({ preventScroll: true });
    btn.onclick = async () => {
      btn.disabled = true;
      try { await api('POST', '/api/answer', { day, text: ta.value }); d = await api('GET', '/api/day/' + day); confetti(innerWidth / 2, 200, 50); render(); }
      catch (er) { toast(errText(er)); btn.disabled = false; if (er.code === 'already_answered') { try { d = await api('GET', '/api/day/' + day); render(); } catch {} } }
    };
  };
  const qTile = () => `<div class="reveal"><div class="tag">${L('Питання дня', 'Question of the day')}</div><h3>${esc(d.question.text)}</h3>
      <div class="ans"><span class="who">${L('Ви', 'You')}</span><p>${esc(d.question.mine)}</p></div>
      ${d.question.partner ? `<div class="ans them"><span class="who">${esc(d.forName)}</span><p>${esc(d.question.partner)}</p></div>` : `<div class="hint">${L(`${esc(d.forName)} ще не відповів(ла). Зазирніть сюди пізніше: відповідь з’явиться тут.`, `${esc(d.forName)} has not answered yet. Check back later: the answer will appear here.`)}</div>`}</div>`;
  const tileBody = (t) => {
    const x = d[t.k]; let meta = '', hint = '', tag = t.t;
    if (t.k === 'gift') { tag = L(`Подарунок для: ${d.forName}`, `Gift for: ${d.forName}`); meta = `<span>${x.price ? money(x.price) : L('у межах твого бюджету', 'within your budget')}</span>`; hint = `<div class="hint">${L('Це сюрприз: не показуй і не розповідай.', 'It is a surprise: do not show or tell.')}</div>`; }
    if (t.k === 'intim') { meta = `<span>${L(LEVELS[x.level - 1][0], LEVELS[x.level - 1][1])}</span>`; hint = `<div class="hint">${L('Лише для вас двох. Зупиняйтесь, якщо комусь некомфортно.', 'Just for the two of you. Stop if anyone feels uncomfortable.')}</div>`; }
    if (t.k === 'act') { meta = `<span>${[L('безкоштовно', 'free'), L(`до ${fmtCur(300).replace('≈ ', '~')}`, `up to ${fmtCur(300).replace('≈ ', '~')}`), L(`до ${fmtCur(800).replace('≈ ', '~')}`, `up to ${fmtCur(800).replace('≈ ', '~')}`), L('дорожче / далі', 'pricier / farther')][x.cost]}</span>${x.car ? `<span>${L('потрібна машина', 'car needed')}</span>` : ''}`; }
    return `<div class="reveal"><div class="tag">${esc(tag)}</div><h3>${esc(x.title)}</h3><p>${esc(x.desc)}</p>
      <div class="meta">${meta}</div>${t.k === 'act' || t.k === 'gift' ? `<div class="places" id="places-box-${t.k}">${placesHtml(day, t.k)}</div>` : ''}${x.link ? `<a class="link ${t.k === 'act' ? 'maplink' : ''}" href="${esc(x.link.url)}" target="_blank" rel="noopener noreferrer"><span class="ml">${esc(x.link.label)}</span> ↗</a>` : ''}${hint}
      <label class="tick"><input type="checkbox" data-mark="${t.k}" ${d.done[t.k] ? 'checked' : ''}> ${L('Виконано', 'Done')}</label></div>`;
  };
  const render = () => {
    if (d.needAnswer) return renderQuestion();
    ov.firstElementChild.innerHTML = `${head}${qTile()}
      ${TILES().map(t => `<div class="tile" data-k="${t.k}">${revealed[t.k] ? tileBody(t) : `<button class="wrap" data-rev="${t.k}">${ICONS[t.k].replace('class="ico"', 'class="ico sm"')}<b>${t.t}</b><small>${L('торкнись, щоб відкрити', 'tap to open')}</small></button>`}</div>`).join('')}
      <div class="row"><button class="btn ghost sm" id="all">${L('Відкрити все', 'Open all')}</button><button class="btn ghost sm" id="story">${L('Поділитися в Stories', 'Share to Stories')}</button></div>`;
    ov.querySelector('.x').onclick = close;
    ov.querySelector('#story').onclick = () => shareStory(day);
    ov.querySelector('#all').onclick = () => { TILES().forEach(t => revealed[t.k] = true); render(); confetti(); };
    if (revealed.act) loadPlaces(day, 'act');
    if (revealed.gift) loadPlaces(day, 'gift');
  };
  render();
  ov.addEventListener('click', async e => {
    const r = e.target.closest('[data-rev]');
    if (r) { revealed[r.dataset.rev] = true; render(); confetti(e.clientX, e.clientY, 60); return; }
    const c = e.target.closest('[data-mark]');
    if (c) { try { await api('POST', '/api/mark', { day, key: c.dataset.mark, done: c.checked }); d.done[c.dataset.mark] = c.checked; if (c.checked) { confetti(e.clientX, e.clientY, 30); toast(L('Чудово', 'Lovely')); } } catch (er) { c.checked = !c.checked; toast(errText(er)); } }
  });
  if (day === st.today && !d.needAnswer) confetti(innerWidth / 2, 160, 80);
}

/* ---------- Маршрутизація ---------- */
function handleErr(e) {
  if (e.code === 'auth') return showLogin(L('Сесія закінчилась. Увійдіть знову.', 'Your session has expired. Please sign in again.'));
  toast(errText(e));
}
function route() {
  clearTimeout(pollT); clearInterval(timerI);
  if (st.lang && st.lang !== LANG) setLang(st.lang); // мова календаря
  if (!st.myDone) { if (!ans.name) ans.name = st.me.suggestedName || ''; const bc = budgetCfg(); if (budgetVal === null) { budgetVal = bc.def; ans.budget = bc.toUah(bc.def); } return showSurvey(); }
  if (!st.ready) return showWaiting();
  if (tab === 'hist') return showHistory();
  showCalendar();
}
async function boot() {
  app.innerHTML = '<div class="center"><div class="spinner"></div></div>';
  try { st = await api('GET', '/api/state'); route(); }
  catch (e) { if (e.code === 'auth') showLogin(); else app.innerHTML = `<div class="center"><p class="err">${L('Не вдалося зв’язатися із сервером.', 'Could not reach the server.')}</p><button class="btn" onclick="location.reload()">${L('Спробувати ще', 'Try again')}</button></div>`; }
}

/* ---------- Старт ---------- */
addEventListener('hashchange', () => { if (/login=/.test(location.hash)) location.reload(); });
(async () => { if ((await consumeLoginHash()) !== 'fail') boot(); })();
})();
