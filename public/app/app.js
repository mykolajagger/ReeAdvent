(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let st = null;

/* ---------- API ---------- */
async function api(method, path, body) {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || j.ok === false) { const e = new Error(j.error || 'server_error'); e.code = j.error || 'server_error'; throw e; }
  return j;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200); }
async function logout() { try { await api('POST', '/api/auth/logout'); } catch {} try { window.google?.accounts?.id?.disableAutoSelect(); } catch {} showLogin(); }

/* ---------- Вхід (посилання на пошту) ---------- */
function showLogin(msg) {
  app.innerHTML = `<section class="hero">
    <svg class="ico" viewBox="0 0 48 48"><path d="M24 4v40M4 24h40M10 10l28 28M38 10L10 38"/></svg>
    <div class="eyebrow">ReeAdvent</div><h1>Ваш <em>Адвент</em></h1>
    <p class="muted">Увійдіть через Google або отримайте посилання на пошту, на яку надійшло запрошення.</p>
    <div id="gbtn" class="gwrap"></div>
    <div class="or" id="gor" hidden>або</div>
    <form id="lf" style="display:grid;gap:12px;width:100%;max-width:360px">
      <input id="em" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required style="padding:14px 16px;border-radius:12px;border:1px solid var(--line);background:#ffffff08;color:var(--ink);font:500 17px var(--body)">
      <button class="btn" id="sb">Надіслати посилання</button>
    </form>
    <p class="err" id="lm">${esc(msg || '')}</p>
  </section>`;
  initGoogle();
  $('#lf').onsubmit = async e => {
    e.preventDefault(); $('#sb').disabled = true;
    try { await api('POST', '/api/auth/request', { email: $('#em').value }); $('#lf').outerHTML = '<p class="muted">Якщо ця пошта має доступ, лист уже в дорозі. Перевірте «Вхідні» і «Спам». Посилання діє 30 хвилин.</p>'; $('#lm').textContent = ''; }
    catch (er) { $('#lm').textContent = errText(er); $('#sb').disabled = false; }
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
      catch (e) { $('#lm') && ($('#lm').textContent = e.code === 'no_access' ? 'Ця Google-пошта не є учасником календаря. Увійдіть за посиланням на пошту, на яку надійшло запрошення.' : errText(e)); }
    } });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: Math.min(320, Math.max(220, innerWidth - 64)), locale: 'uk' });
    $('#gbtn').classList.add('on');
    $('#gor').hidden = false;
  };
  if (window.google?.accounts?.id) return render();
  if (gisLoaded) return;
  gisLoaded = true; const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = render; document.head.appendChild(s);
}
async function consumeLoginHash() {
  const m = location.hash.match(/login=([\w-]+)/); if (!m) return;
  history.replaceState(null, '', location.pathname);
  try { await api('POST', '/api/auth/verify', { token: m[1] }); }
  catch { showLogin('Посилання вже недійсне. Запросіть нове.'); return 'fail'; }
}

/* ---------- Анкета ---------- */
const GIFT_OPTS = { sweet: 'Солодощі', tea: 'Чай і кава', beauty: 'Догляд і б’юті', cozy: 'Затишок', book: 'Книги', tech: 'Гаджети', game: 'Ігри', craft: 'Творчість', plant: 'Рослини', jewel: 'Прикраси', sport: 'Спорт', music: 'Музика', art: 'Арт і декор', gourmet: 'Гурме', fun: 'Кумедні дрібнички', photo: 'Фото та спогади', alcohol: 'Вино й крафт', scent: 'Аромати' };
const AVOID_OPTS = { alcohol: 'Не п’ю алкоголь', sweet: 'Без солодкого', scent: 'Без парфумів і ароматів' };
const INTIM_OPTS = { mas: 'Масаж', bath: 'Ванна / SPA', dance: 'Танці', game: 'Ігри', role: 'Рольові ігри', blind: 'Сенсорні (пов’язка)', photo: 'Фото лише для нас', words: 'Слова й листи', food: 'Смаколики', tease: 'Флірт і дражнилки', cozy: 'Затишок', music: 'Музика', dress: 'Образи й білизна' };
const ACT_OPTS = { home: 'Затишок удома', out: 'Прогулянки', food: 'Їжа й заклади', cult: 'Культура й музеї', act: 'Актив і спорт', craft: 'Творчість', relax: 'SPA й релакс', night: 'Вечірній відпочинок', cine: 'Кіно', play: 'Ігри', trip: 'Поїздки околицями', music: 'Музика' };
const LEVELS = [
  ['Романтика', 'I', 'Ніжність, свічки, обійми, масаж і слова'],
  ['Гра', 'II', 'Флірт, пікантні ігри, дотики із зав’язаними очима'],
  ['Смілива ніч', 'III', 'Відверто, але завжди з повагою до комфорту обох']
];
const ICONS = {
  gift: '<svg class="ico" viewBox="0 0 48 48"><rect x="7" y="18" width="34" height="23" rx="2"/><rect x="5" y="12" width="38" height="6" rx="1"/><path d="M24 12v29M24 12c-3-7-11-7-11-3s6 3 11 3zm0 0c3-7 11-7 11-3s-6 3-11 3z"/></svg>',
  intim: '<svg class="ico" viewBox="0 0 48 48"><path d="M24 40S7 29 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 11-17 22-17 22z"/></svg>',
  act: '<svg class="ico" viewBox="0 0 48 48"><path d="M24 5l3.5 10.5H38l-8.5 6.2 3.3 10.3L24 25.8l-8.8 6.2 3.3-10.3L10 15.5h10.5z"/><path d="M24 33v10"/></svg>',
  q: '<svg class="ico" viewBox="0 0 48 48"><path d="M8 10h32a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H22l-9 8v-8H8a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z"/><path d="M17 19h14M17 25h8"/></svg>',
  star: '<svg class="ico" viewBox="0 0 48 48"><path d="M24 4v40M4 24h40M10 10l28 28M38 10L10 38"/></svg>'
};
const ACT_BUDGETS = [['Безкоштовно', 'Лише те, що не коштує грошей'], ['До ~300 ₴ на двох', 'Кава, кіно, невеличкі розваги'], ['До ~800 ₴', 'Ресторан, майстер-клас, концерт'], ['Без обмежень', 'Термальні води, подорожі, свята']];

let ans = { name: '', budget: 300, giftLikes: [], avoid: [], level: 1, intimLikes: [], actLikes: [], actBudget: 1, car: false };
let step = 0;
const chips = (key, opts) => `<div class="chips">${Object.entries(opts).map(([k, v]) => `<button type="button" class="chip ${ans[key].includes(k) ? 'on' : ''}" data-chip="${key}" data-v="${k}">${v}</button>`).join('')}</div>`;

const STEPS = [
  () => `<h2>Привіт</h2><p>Кілька швидких питань, щоб календар був саме для вас. Свої відповіді бачиш тільки ти — партнер їх не побачить, як і ти його.</p>
    <div><label class="lbl" for="nm">Як тебе називати?</label><input id="nm" type="text" maxlength="30" value="${esc(ans.name)}" placeholder="Ім’я"></div>`,
  () => `<h2>Подарунки</h2>
    <div><label class="lbl">Мій бюджет на один подарунок</label><div class="big" id="bv">${ans.budget} ₴</div>
    <input class="range" id="bg" type="range" min="100" max="500" step="50" value="${ans.budget}"></div>
    <div><label class="lbl">Що люблю отримувати</label>${chips('giftLikes', GIFT_OPTS)}</div>
    <div><label class="lbl">Мені краще без…</label>${chips('avoid', AVOID_OPTS)}</div>`,
  () => `<h2>Пригоди для двох</h2><p class="muted">Береться менший рівень із двох — ніхто нікого не змушує.</p>
    <div class="opts">${LEVELS.map((l, i) => `<button type="button" class="opt ${ans.level === i + 1 ? 'on' : ''}" data-level="${i + 1}"><b>${l[1]} · ${l[0]}</b><small>${l[2]}</small></button>`).join('')}</div>
    <div><label class="lbl">Що мені до вподоби</label>${chips('intimLikes', INTIM_OPTS)}</div>`,
  () => `<h2>Спільні активності</h2>
    <div><label class="lbl">Що ми любимо робити</label>${chips('actLikes', ACT_OPTS)}</div>
    <div><label class="lbl">Бюджет на день для двох</label><div class="opts">${ACT_BUDGETS.map((b, i) => `<button type="button" class="opt ${ans.actBudget === i ? 'on' : ''}" data-ab="${i}"><b>${b[0]}</b><small>${b[1]}</small></button>`).join('')}</div></div>
    <div><label class="lbl">Є машина для поїздок околицями?</label><div class="opts two">
      <button type="button" class="opt ${ans.car ? 'on' : ''}" data-car="1"><b>Є</b></button><button type="button" class="opt ${!ans.car ? 'on' : ''}" data-car="0"><b>Ні</b></button></div></div>`,
  () => `<div class="center" style="min-height:0">${ICONS.gift}<h2>Усе готово</h2><p>Після відправки анкету змінити не можна. Календар складеться, коли відповість і другий з вас — і все ж ви не знатимете, що чекає. Це секрет.</p></div>`
];

function showSurvey() {
  app.innerHTML = `<div class="card"><div class="dots">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="step">${STEPS[step]()}</div>
    <div class="nav"><button class="btn ghost" id="back" ${step === 0 ? 'style="visibility:hidden"' : ''}>Назад</button>
    <button class="btn" id="next">${step === STEPS.length - 1 ? 'Відправити' : 'Далі'}</button></div></div>`;
  const nm = $('#nm'); if (nm) { nm.oninput = () => ans.name = nm.value; }
  const bg = $('#bg'); if (bg) bg.oninput = () => { ans.budget = +bg.value; $('#bv').textContent = ans.budget + ' ₴'; };
  $('#back').onclick = () => { step--; showSurvey(); };
  $('#next').onclick = async () => {
    if (step === 0 && !ans.name.trim()) return toast('Напиши, як тебе називати');
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
  app.innerHTML = `<div class="center">${ICONS.gift}<h2>Дякуємо, ${esc(st.me.name)}</h2>
    <p class="muted">Твоя анкета збережена. Чекаємо, поки ${st.partner.name ? esc(st.partner.name) : 'твоя половинка'} теж відповість —<br>тоді я складу календар. Підглядати не можна.</p>
    <button class="btn ghost sm" id="chk">Перевірити</button><button class="btn ghost sm" id="out">Вийти</button></div>`;
  $('#chk').onclick = refresh; $('#out').onclick = logout;
  clearTimeout(pollT); pollT = setTimeout(refresh, 30000);
}
async function refresh() { try { st = await api('GET', '/api/state'); route(); } catch (e) { handleErr(e); } }

/* ---------- Календар ---------- */
function order() { // однаковий «перемішаний» порядок для обох
  const a = Array.from({ length: 24 }, (_, i) => i + 1); let s = 7;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1);[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function unlockDate(day) { const [y, m, d] = st.startDate.split('-').map(Number); return new Date(y, m - 1, d + day - 1, st.unlockHour, 0, 0); }
const fmtDate = dt => dt.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
const fmtT = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; const d = Math.floor(h / 24); return (d ? d + ' д ' : '') + [h % 24, m, x].map(n => String(n).padStart(2, '0')).join(':'); };

let timerI;
let tab = 'cal';
const tabsHtml = () => `<div class="tabs"><button data-tab="cal" class="${tab === 'cal' ? 'on' : ''}">Календар</button><button data-tab="hist" class="${tab === 'hist' ? 'on' : ''}">Історія</button></div>`;
app.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b && b.dataset.tab !== tab) { tab = b.dataset.tab; route(); } });
const dtime = ms => new Date(ms).toLocaleString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

async function showHistory() {
  app.innerHTML = `${tabsHtml()}<div class="head"><div class="eyebrow">ReeAdvent</div><h1>Історія</h1><p class="muted">Усі ваші вікна, питання й відповіді${st.finished ? '. Календар завершено, але все збережено тут' : ''}</p></div><div class="center" style="min-height:30vh"><div class="spinner"></div></div>`;
  let h; try { h = await api('GET', '/api/history'); } catch (e) { return handleErr(e); }
  const items = h.days.map(d => `<article class="hist ${d.opened ? '' : 'new'}" data-d="${d.day}" tabindex="0" role="button" aria-label="Вікно ${d.day}">
    <header><b>Вікно №${d.day}</b><span class="muted">${fmtDate(unlockDate(d.day))}${d.opened_at ? ' · відкрито ' + dtime(d.opened_at) : ''}</span></header>
    <div class="q">${esc(d.question)}</div>
    ${d.answered ? `<div class="ans"><span class="who">Ви</span><p>${esc(d.mine)}</p></div>${d.partner ? `<div class="ans them"><span class="who">${esc(h.partnerName)}</span><p>${esc(d.partner)}</p></div>` : `<div class="hint">${esc(h.partnerName)} ще не відповів(ла)</div>`}` : '<div class="muted" style="font-size:13px">Ще не відкрито. Торкніться, щоб відповісти й відкрити вікно.</div>'}
    ${d.opened ? `<ul class="tasks"><li class="${d.done.gift ? 'done' : ''}">Подарунок: ${esc(d.gift)}</li><li class="${d.done.intim ? 'done' : ''}">Пригода: ${esc(d.intim)}</li><li class="${d.done.act ? 'done' : ''}">Активність: ${esc(d.act)}</li></ul>` : ''}</article>`).join('');
  app.innerHTML = `${tabsHtml()}<div class="head"><div class="eyebrow">ReeAdvent</div><h1>Історія</h1><p class="muted">Усі ваші вікна, питання й відповіді${h.finished ? '. Календар завершено, але все збережено тут' : ''}</p></div>
    <div class="histlist">${items || '<div class="muted" style="text-align:center">Тут з’являться відкриті вікна, щойно календар стартує.</div>'}</div><div class="tools"><button class="btn ghost sm" id="out">Вийти</button></div>`;
  $('#out').onclick = logout;
  const open = el => { const a = el.closest('.hist'); if (a) openDay(+a.dataset.d); };
  $('.histlist') && ($('.histlist').onclick = e => open(e.target), $('.histlist').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target); } });
}

function showCalendar() {
  const opened = new Set(st.opened), today = st.today;
  const nextDay = today + 1, hasNext = nextDay <= st.totalDays;
  app.innerHTML = `${tabsHtml()}<div class="head">
      <div class="eyebrow">ReeAdvent · 24 дні</div><h1>Ваш <em>Адвент</em></h1>
      <p class="muted">${today === 0 ? 'Календар відкриється ' + fmtDate(unlockDate(1)) + ' о ' + String(st.unlockHour).padStart(2, '0') + ':00' : 'Привіт, ' + esc(st.me.name) + '. Сьогодні — вікно №' + today}</p>
      ${hasNext ? `<div class="timer" id="tm"></div><div class="eyebrow" style="color:var(--muted)">до вікна №${nextDay}</div>` : st.finished ? '<div class="timer" style="font-size:24px">Календар завершено</div><div class="muted" style="max-width:420px;margin:0 auto">Дякуємо, що були з нами. Усі вікна, питання й відповіді залишаються доступними в розділі «Історія».</div>' : '<div class="timer">Усі вікна відкриті</div>'}
      <div class="progress"><i style="width:${(opened.size / 24) * 100}%"></i></div>
      <div class="muted" style="font-size:12px;letter-spacing:.1em">відкрито ${opened.size} з 24</div>
    </div>
    <div class="grid">${order().map(d => {
      const lock = d > today;
      return `<button class="door ${lock ? 'locked' : ''} ${d === today && !opened.has(d) ? 'today' : ''} ${opened.has(d) ? 'opened' : ''}" data-d="${d}" aria-label="Вікно ${d}">
        <div class="face front">${d}</div><div class="face back"><div>${d}<small>ВІДКРИТО</small></div></div></button>`;
    }).join('')}</div>
    <div class="tools"><button class="btn ghost sm" id="out">Вийти</button></div>`;
  $('#out').onclick = logout;
  clearInterval(timerI);
  if (hasNext) {
    const tick = () => { const el = $('#tm'); if (!el) return clearInterval(timerI); const ms = unlockDate(nextDay) - new Date(); el.textContent = fmtT(ms); if (ms <= 0) { clearInterval(timerI); refresh(); } };
    tick(); timerI = setInterval(tick, 1000);
  }
}
app.addEventListener('click', e => {
  const d = e.target.closest('.door'); if (!d) return;
  const day = +d.dataset.d;
  if (day > st.today) {
    d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
    const u = unlockDate(day); toast(`Це вікно відкриється ${fmtDate(u)} о ${String(st.unlockHour).padStart(2, '0')}:00`); return;
  }
  openDay(day);
});

/* ---------- День ---------- */
const TILES = [
  { k: 'gift', t: 'Подарунок' },
  { k: 'intim', t: 'Пригода для двох' },
  { k: 'act', t: 'Спільна активність' }
];
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
  const head = `<header><h2>Вікно <span>№${day}</span></h2><button class="x" aria-label="Закрити">✕</button></header>`;
  const renderQuestion = () => {
    ov.firstElementChild.innerHTML = `${head}
      <div class="reveal qcard"><div class="tag">Питання дня · для ${esc(d.forName)}</div><h3>${esc(d.question.text)}</h3>
        <p class="muted" style="font-size:14px">Напишіть відповідь для ${esc(d.forName)}: вона її прочитає. Після відповіді відкриються завдання на день. Змінити відповідь потім не можна.</p>
        <textarea id="ans" maxlength="600" rows="5" placeholder="Ваша відповідь…"></textarea>
        <div class="meta"><span id="cnt">0 / 600</span></div>
        <button class="btn" id="send" disabled>Надіслати й відкрити день</button></div>`;
    ov.querySelector('.x').onclick = close;
    const ta = ov.querySelector('#ans'), btn = ov.querySelector('#send');
    ta.oninput = () => { ov.querySelector('#cnt').textContent = ta.value.length + ' / 600'; btn.disabled = ta.value.trim().length < 2; };
    ta.focus({ preventScroll: true });
    btn.onclick = async () => {
      btn.disabled = true;
      try { await api('POST', '/api/answer', { day, text: ta.value }); d = await api('GET', '/api/day/' + day); confetti(innerWidth / 2, 200, 50); render(); }
      catch (er) { toast(er.code === 'already_answered' ? 'Ви вже відповіли на це питання' : errText(er)); btn.disabled = false; if (er.code === 'already_answered') { try { d = await api('GET', '/api/day/' + day); render(); } catch {} } }
    };
  };
  const qTile = () => `<div class="reveal"><div class="tag">Питання дня</div><h3>${esc(d.question.text)}</h3>
      <div class="ans"><span class="who">Ви</span><p>${esc(d.question.mine)}</p></div>
      ${d.question.partner ? `<div class="ans them"><span class="who">${esc(d.forName)}</span><p>${esc(d.question.partner)}</p></div>` : `<div class="hint">${esc(d.forName)} ще не відповів(ла). Зазирніть сюди пізніше: відповідь з’явиться тут.</div>`}</div>`;
  const render = () => {
    if (d.needAnswer) return renderQuestion();
    ov.firstElementChild.innerHTML = `${head}${qTile()}
      ${TILES.map(t => `<div class="tile" data-k="${t.k}">${revealed[t.k] ? tileBody(t, d) : `<button class="wrap" data-rev="${t.k}">${ICONS[t.k].replace('class="ico"','class="ico sm"')}<b>${t.t}</b><small>торкнись, щоб відкрити</small></button>`}</div>`).join('')}
      <div class="row"><button class="btn ghost sm" id="all">Відкрити все</button></div>`;
    ov.querySelector('.x').onclick = close;
    ov.querySelector('#all').onclick = () => { TILES.forEach(t => revealed[t.k] = true); render(); confetti(); };
  };
  render();
  ov.addEventListener('click', async e => {
    const r = e.target.closest('[data-rev]');
    if (r) { revealed[r.dataset.rev] = true; render(); confetti(e.clientX, e.clientY, 60); return; }
    const c = e.target.closest('[data-mark]');
    if (c) { try { await api('POST', '/api/mark', { day, key: c.dataset.mark, done: c.checked }); d.done[c.dataset.mark] = c.checked; if (c.checked) { confetti(e.clientX, e.clientY, 30); toast('Чудово'); } } catch (er) { c.checked = !c.checked; toast(errText(er)); } }
  });
  if (day === st.today && !d.needAnswer) confetti(innerWidth / 2, 160, 80);
}
function tileBody(t, d) {
  const x = d[t.k]; let meta = '', hint = '', tag = t.t;
  if (t.k === 'gift') { tag = `Подарунок для: ${d.forName}`; meta = `<span>${x.price ? '≈ ' + x.price + ' ₴' : 'у межах твого бюджету'}</span>`; hint = '<div class="hint">Це сюрприз — не показуй і не розповідай.</div>'; }
  if (t.k === 'intim') { meta = `<span>${['Романтика', 'Гра', 'Смілива ніч'][x.level - 1]}</span>`; hint = '<div class="hint">Лише для вас двох. Зупиняйтесь, якщо комусь некомфортно.</div>'; }
  if (t.k === 'act') { meta = `<span>${['безкоштовно', 'до ~300 ₴', 'до ~800 ₴', 'дорожче / далі'][x.cost]}</span>${x.car ? '<span>потрібна машина</span>' : ''}`; }
  return `<div class="reveal"><div class="tag">${esc(tag)}</div><h3>${esc(x.title)}</h3><p>${esc(x.desc)}</p>
    <div class="meta">${meta}</div>${x.link ? `<a class="link" href="${esc(x.link.url)}" target="_blank" rel="noopener noreferrer">${esc(x.link.label)} ↗</a>` : ''}${hint}
    <label class="tick"><input type="checkbox" data-mark="${t.k}" ${d.done[t.k] ? 'checked' : ''}> Виконано</label></div>`;
}

/* ---------- Маршрутизація ---------- */
function errText(e) {
  return ({ auth: 'Сесія закінчилась — увійдіть знову', not_yet: 'Ще зарано', locked: 'Анкету вже не можна змінити', bad_name: 'Вкажіть ім’я', bad_email: 'Перевірте адресу пошти', bad_token: 'Посилання недійсне — запросіть нове', too_many: 'Забагато спроб. Спробуйте пізніше.', no_access: 'Цієї пошти немає серед учасників календаря', answer_short: 'Напишіть хоча б кілька слів', bad_day: 'Це вікно ще не відкрите' })[e.code] || 'Щось пішло не так. Спробуйте ще раз.';
}
function handleErr(e) {
  if (e.code === 'auth') return showLogin('Сесія закінчилась — увійдіть знову.');
  toast(errText(e));
}
function route() {
  clearTimeout(pollT); clearInterval(timerI);
  if (!st.myDone) { if (!ans.name) ans.name = st.me.suggestedName || ''; return showSurvey(); }
  if (!st.ready) return showWaiting();
  if (tab === 'hist') return showHistory();
  showCalendar();
}
async function boot() {
  app.innerHTML = '<div class="center"><div class="spinner"></div></div>';
  try { st = await api('GET', '/api/state'); route(); }
  catch (e) { if (e.code === 'auth') showLogin(); else app.innerHTML = '<div class="center"><p class="err">Не вдалося зв’язатися із сервером.</p><button class="btn" onclick="location.reload()">Спробувати ще</button></div>'; }
}

/* ---------- Старт ---------- */
addEventListener('hashchange', () => { if (/login=/.test(location.hash)) location.reload(); });
(async () => { if ((await consumeLoginHash()) !== 'fail') boot(); })();
})();
