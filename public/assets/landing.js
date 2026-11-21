(() => {
'use strict';
const $ = s => document.querySelector(s);
const LG = () => window.LANG.get(), t = (k, v) => window.LANG.t(k, v);
const REGIONS_UA = ['Вінницька', 'Волинська', 'Дніпропетровська', 'Донецька', 'Житомирська', 'Закарпатська', 'Запорізька', 'Івано-Франківська', 'Київська', 'Кіровоградська', 'Луганська', 'Львівська', 'Миколаївська', 'Одеська', 'Полтавська', 'Рівненська', 'Сумська', 'Тернопільська', 'Харківська', 'Херсонська', 'Хмельницька', 'Черкаська', 'Чернівецька', 'Чернігівська', 'м. Київ', 'Автономна Республіка Крим'];
const REGIONS_EN = { 'Вінницька': 'Vinnytsia', 'Волинська': 'Volyn', 'Дніпропетровська': 'Dnipropetrovsk', 'Донецька': 'Donetsk', 'Житомирська': 'Zhytomyr', 'Закарпатська': 'Zakarpattia', 'Запорізька': 'Zaporizhzhia', 'Івано-Франківська': 'Ivano-Frankivsk', 'Київська': 'Kyiv Oblast', 'Кіровоградська': 'Kirovohrad', 'Луганська': 'Luhansk', 'Львівська': 'Lviv', 'Миколаївська': 'Mykolaiv', 'Одеська': 'Odesa', 'Полтавська': 'Poltava', 'Рівненська': 'Rivne', 'Сумська': 'Sumy', 'Тернопільська': 'Ternopil', 'Харківська': 'Kharkiv', 'Херсонська': 'Kherson', 'Хмельницька': 'Khmelnytskyi', 'Черкаська': 'Cherkasy', 'Чернівецька': 'Chernivtsi', 'Чернігівська': 'Chernihiv', 'м. Київ': 'Kyiv city', 'Автономна Республіка Крим': 'Autonomous Republic of Crimea' };

// ---- Демо-вікна ----
let revealed = {};
function renderDemo() {
  const D = window.LANG.DEMO[LG()], icons = ['<path d="M8 10h32a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H22l-9 8v-8H8a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z"/><path d="M17 19h14M17 25h8"/>', '<rect x="7" y="18" width="34" height="23" rx="2"/><rect x="5" y="12" width="38" height="6" rx="1"/><path d="M24 12v29M24 12c-3-7-11-7-11-3s6 3 11 3zm0 0c3-7 11-7 11-3s-6 3-11 3z"/>', '<path d="M24 40S7 29 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 11-17 22-17 22z"/>', '<path d="M24 5l3.5 10.5H38l-8.5 6.2 3.3 10.3L24 25.8l-8.8 6.2 3.3-10.3L10 15.5h10.5z"/><path d="M24 33v10"/>'];
  $('#demo').innerHTML = D.map((d, i) => `<div class="tile" data-i="${i}">${revealed[i] ? `<div class="reveal"><div class="tag">${d[1]}</div><h3>${d[2]}</h3><p>${d[3]}</p><div class="meta"><span>${d[4]}</span></div></div>` : `<button class="wrap" type="button"><svg class="ico sm" viewBox="0 0 48 48">${icons[i]}</svg><b>${d[0]}</b><small>${t('d_open')}</small></button>`}</div>`).join('');
}
$('#demo').addEventListener('click', e => { const w = e.target.closest('.wrap'); if (!w) return; revealed[w.parentElement.dataset.i] = true; renderDemo(); window.confetti && window.confetti(e.clientX, e.clientY, 40); });

// ---- Країна, область, часовий пояс ----
const cs = $('#country'), rs = $('#region'), rt = $('#regionTxt');
function fillCountries(sel) {
  const dn = new Intl.DisplayNames([LG() === 'en' ? 'en' : 'uk'], { type: 'region' }), cur = sel || cs.value || 'UA';
  const list = window.COUNTRIES.map(c => [c, dn.of(c) || c]).sort((a, b) => (a[0] === 'UA' ? -1 : b[0] === 'UA' ? 1 : a[1].localeCompare(b[1], LG())));
  cs.innerHTML = list.map(([c, n]) => `<option value="${c}">${n}</option>`).join(''); cs.value = list.some(x => x[0] === cur) ? cur : 'UA';
  syncRegion();
}
function syncRegion() {
  const ua = cs.value === 'UA'; rs.hidden = !ua; rt.hidden = ua; rs.required = ua; rt.required = false;
  const keep = rs.value; rs.innerHTML = `<option value="">${t('choose')}</option>` + REGIONS_UA.map(r => `<option value="${r}">${LG() === 'en' ? REGIONS_EN[r] : r}</option>`).join(''); rs.value = keep;
  $('#rlabel').textContent = ua ? (LG() === 'en' ? 'Region' : 'Область') : t('f_region'); rt.placeholder = LG() === 'en' ? 'e.g. Bavaria' : 'напр., Баварія';
  $('#rlabel').htmlFor = ua ? 'region' : 'regionTxt';
}
cs.addEventListener('change', syncRegion);

// ---- Ціна ----
let basePrice = null, usdRate = 41, promoOk = null;
const fmtKop = kop => (kop % 100 ? (kop / 100).toFixed(2) : String(kop / 100)).replace('.', LG() === 'en' ? '.' : ',');
const uahTxt = kop => `${fmtKop(kop)} ₴`;
const money = kop => LG() === 'en' ? (kop === 0 ? '$0' : `≈ $${Math.max(1, Math.round(kop / 100 / usdRate))}`) : uahTxt(kop);
function showPrice(finalKop) {
  if (basePrice === null) return;
  const base = Math.round(basePrice * 100);
  $('#old').textContent = finalKop < base ? money(base) : '';
  $('#price').textContent = money(finalKop);
  $('#pnote').textContent = LG() === 'en' && finalKop > 0 ? t('price_note', { uah: uahTxt(finalKop) }) : '';
  $('#ob').textContent = finalKop === 0 ? t('f_free') : t('f_pay');
}
const curFinal = () => promoOk ? promoOk.finalKop : Math.round(basePrice * 100);
window.addEventListener('langchange', () => { renderDemo(); fillCountries(); if (basePrice !== null) showPrice(curFinal()); initTurnstileLang(); });

async function applyPromo() {
  const code = $('#promo').value.trim(); promoOk = null; $('#pmsg').style.color = '';
  if (!code) { $('#pmsg').textContent = ''; showPrice(curFinal()); return; }
  $('#pbtn').disabled = true;
  try {
    const j = await (await fetch('/api/promo/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })).json();
    const bad = m => { $('#pmsg').textContent = m; $('#pmsg').style.color = 'var(--err)'; showPrice(curFinal()); };
    const UKP = { not_found: 'Такого промокоду немає.', inactive: 'Цей промокод більше не діє.', not_started: 'Цей промокод ще не діє.', expired: 'Термін дії промокоду минув.', exhausted: 'Промокод уже використано максимальну кількість разів.' };
    if (j.error === 'too_many') bad(LG() === 'en' ? t('p_many') : 'Забагато спроб. Спробуйте за кілька хвилин.');
    else if (!j.valid) bad(LG() === 'en' ? t('p_' + j.reason) : (UKP[j.reason] || 'Промокод не підходить.'));
    else { promoOk = { code: j.code, finalKop: j.finalKop, discountKop: j.discountKop }; $('#pmsg').textContent = LG() === 'en' ? t('p_applied', { x: money(j.discountKop) }) : `Промокод застосовано: знижка ${uahTxt(j.discountKop)}.`; $('#pmsg').style.color = 'var(--gold2)'; showPrice(j.finalKop); }
  } catch { $('#pmsg').textContent = t('p_fail'); }
  $('#pbtn').disabled = false;
}
$('#pbtn').addEventListener('click', applyPromo);
$('#promo').addEventListener('input', () => { if (promoOk) { promoOk = null; $('#pmsg').textContent = ''; showPrice(curFinal()); } });
$('#promo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } });

// ---- Turnstile ----
let tsToken = '', tsWidget = null, tsOn = false, tsKey = null;
function initTurnstile(siteKey) {
  tsOn = true; tsKey = siteKey;
  const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.defer = true;
  s.onload = renderTurnstile; document.head.appendChild(s);
}
function renderTurnstile() { if (!window.turnstile || !tsKey) return; if (tsWidget !== null) { try { window.turnstile.remove(tsWidget); } catch {} } tsToken = ''; tsWidget = window.turnstile.render('#ts', { sitekey: tsKey, theme: 'dark', language: LG() === 'en' ? 'en' : 'uk', callback: x => { tsToken = x; }, 'expired-callback': () => { tsToken = ''; }, 'error-callback': () => { tsToken = ''; } }); }
function initTurnstileLang() { if (tsOn && window.turnstile) renderTurnstile(); }

// ---- Старт: конфіг, країна, дата ----
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const t0 = new Date(); t0.setDate(t0.getDate() + 1); const t1 = new Date(t0); t1.setDate(t1.getDate() + 90);
$('#startDate').min = iso(t0); $('#startDate').max = iso(t1); $('#startDate').value = iso(t0);
renderDemo(); fillCountries('UA');
fetch('/api/config').then(r => r.json()).then(c => {
  basePrice = c.price; usdRate = c.usdRate || 41;
  if (c.detected) { if (c.detected.country && window.COUNTRIES.includes(c.detected.country)) { cs.value = c.detected.country; syncRegion(); } window.LANG.suggest(c.detected.lang); }
  if (c.turnstileSiteKey) initTurnstile(c.turnstileSiteKey);
  showPrice(Math.round(basePrice * 100));
}).catch(() => { $('#price').textContent = '—'; });

// ---- Відправка ----
const ERRC = { bad_names: 'e_names', bad_email: 'e_email', same_email: 'e_same', bad_city: 'e_city', bad_region: 'e_region', consent_required: 'e_consent', too_many: 'e_many', bad_date: 'e_date', captcha: 'e_captcha' };
const ERRUK = { bad_names: 'Вкажіть обидва імені.', bad_email: 'Перевірте адреси пошти.', same_email: 'Пошти мають бути різні: у кожного своя.', bad_city: 'Вкажіть місто.', bad_region: 'Оберіть область.', consent_required: 'Підтвердіть вік і погодьтеся з умовами.', too_many: 'Забагато спроб. Спробуйте за годину.', bad_date: 'Оберіть дату старту: від завтра і не пізніше ніж за 90 днів.', captcha: 'Не вдалося підтвердити, що ви не бот. Спробуйте ще раз.', promo_not_found: 'Такого промокоду немає.', promo_inactive: 'Цей промокод більше не діє.', promo_not_started: 'Цей промокод ще не діє.', promo_expired: 'Термін дії промокоду минув.', promo_exhausted: 'Промокод уже використано максимальну кількість разів.' };
const errMsg = code => LG() === 'en' ? (ERRC[code] ? t(ERRC[code]) : code && code.startsWith('promo_') ? t('p_' + code.slice(6)) : t('e_gen')) : (ERRUK[code] || 'Не вдалося створити замовлення. Спробуйте ще раз.') + (ERRUK[code] ? '' : ` (код: ${String(code).slice(0, 60)})`);
$('#of').addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => $('#' + id).value.trim(), ua = cs.value === 'UA';
  if (tsOn && !tsToken) { $('#oerr').textContent = t('e_bot'); if (LG() === 'uk') $('#oerr').textContent = 'Підтвердіть, що ви не бот (віджет вище).'; return; }
  const body = { nameA: v('nameA'), nameB: v('nameB'), emailA: v('emailA'), emailB: v('emailB'), city: v('city'), country: cs.value, region: ua ? rs.value : rt.value.trim(), startDate: $('#startDate').value, lang: LG(), tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'),
    age18: $('#age18').checked, terms: $('#terms').checked, turnstileToken: tsToken, promo: $('#promo').value.trim() };
  const btn = $('#ob'); btn.disabled = true; $('#oerr').textContent = '';
  try {
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    try { localStorage.setItem('lang', LG()); } catch {} location.href = j.payUrl;
  } catch (er) { $('#oerr').textContent = errMsg(er.message); btn.disabled = false; if (tsWidget !== null && window.turnstile) { tsToken = ''; window.turnstile.reset(tsWidget); } }
});
})();
