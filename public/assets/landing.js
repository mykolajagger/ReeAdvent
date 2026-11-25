(() => {
'use strict';
const $ = s => document.querySelector(s);
const LG = () => window.LANG.get(), t = (k, v) => window.LANG.t(k, v);
// українські тексти для підписів, які змінюються з коду (у словнику lang.js лише англійська, а t() в українській версії повертає ключ)
const UK_TXT = { f_pay: 'Перейти до оплати', f_free: 'Отримати безкоштовно', f_region: 'Регіон або штат' }, tl = k => (LG() === 'en' ? t(k) : UK_TXT[k] || t(k));

/* ---------- Демо-вікна ---------- */
let revealed = {};
function renderDemo() {
  const D = window.LANG.DEMO[LG()], icons = ['<path d="M8 10h32a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H22l-9 8v-8H8a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z"/><path d="M17 19h14M17 25h8"/>', '<rect x="7" y="18" width="34" height="23" rx="2"/><rect x="5" y="12" width="38" height="6" rx="1"/><path d="M24 12v29M24 12c-3-7-11-7-11-3s6 3 11 3zm0 0c3-7 11-7 11-3s-6 3-11 3z"/>', '<path d="M24 40S7 29 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 11-17 22-17 22z"/>', '<path d="M24 5l3.5 10.5H38l-8.5 6.2 3.3 10.3L24 25.8l-8.8 6.2 3.3-10.3L10 15.5h10.5z"/><path d="M24 33v10"/>'];
  $('#demo').innerHTML = D.map((d, i) => `<div class="tile" data-i="${i}">${revealed[i] ? `<div class="reveal"><div class="tag">${d[1]}</div><h3>${d[2]}</h3><p>${d[3]}</p><div class="meta"><span>${d[4]}</span></div></div>` : `<button class="wrap" type="button"><svg class="ico sm" viewBox="0 0 48 48">${icons[i]}</svg><b>${d[0]}</b><small>${t('d_open')}</small></button>`}</div>`).join('');
}
$('#demo').addEventListener('click', e => { const w = e.target.closest('.wrap'); if (!w) return; revealed[w.parentElement.dataset.i] = true; renderDemo(); window.confetti && window.confetti(e.clientX, e.clientY, 40); });

/* ---------- Випадні списки з пошуком ---------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'‘`ʼ]/g, '').trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function hilite(label, q) { const i = norm(label).indexOf(q); return q && i >= 0 ? esc(label.slice(0, i)) + '<mark>' + esc(label.slice(i, i + q.length)) + '</mark>' + esc(label.slice(i + q.length)) : esc(label); }

/** Поле з підказками. getItems() -> [{label, keys:[], hint?, ...}]; onPick(item|null) викликається при виборі або при введенні власного тексту. */
function combo(input, list, getItems, { minChars = 0, max = 60, onPick, onFree } = {}) {
  let shown = [], active = -1, picked = null;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  function open() {
    const q = norm(input.value), items = getItems() || [];
    if (q.length < minChars) { close(); return; }
    const starts = [], contains = [];
    for (const it of items) { const ks = it.keys || [it.label]; let best = -1; for (const k of ks) { const i = norm(k).indexOf(q); if (i >= 0 && (best < 0 || i < best)) best = i; } if (best === 0 || !q) starts.push(it); else if (best > 0) contains.push(it); }
    const byLen = (x, y) => norm(x.label).length - norm(y.label).length || x.label.localeCompare(y.label); // коротші збіги першими: «Munich» перед «Münchberg»
    if (q) { starts.sort(byLen); contains.sort(byLen); }
    shown = [...starts, ...contains].slice(0, max); active = shown.length && q ? 0 : -1;
    list.innerHTML = shown.length ? shown.map((it, i) => `<li role="option" data-i="${i}" class="${i === active ? 'on' : ''}"><span>${hilite(it.label, q)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</li>`).join('') : (q && items.length ? `<li class="none">${t('f_none')}</li>` : '');
    list.hidden = !list.innerHTML; input.setAttribute('aria-expanded', String(!list.hidden));
  }
  function pick(i) { const it = shown[i]; if (!it) return; picked = it; input.value = it.label; close(); onPick && onPick(it); }
  input.addEventListener('input', () => { picked = null; open(); onFree && onFree(input.value); });
  input.addEventListener('focus', open);
  input.addEventListener('blur', () => setTimeout(() => {
    close(); const q = norm(input.value);
    if (!picked && q) { const exact = (getItems() || []).find(it => (it.keys || [it.label]).some(k => norm(k) === q)); if (exact) { picked = exact; input.value = exact.label; onPick && onPick(exact); } }
  }, 150));
  input.addEventListener('keydown', e => {
    if (list.hidden && (e.key === 'ArrowDown')) { open(); return; }
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; [...list.children].forEach((li, i) => li.classList.toggle('on', i === active)); list.children[active]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
  return { reset(v = '') { input.value = v; picked = null; }, getPicked: () => picked, set(it) { picked = it; input.value = it ? it.label : ''; } };
}

/* ---------- Країна → область → місто ---------- */
const cIn = $('#country'), rIn = $('#region'), yIn = $('#city');
let countryCode = null, geo = null /* {r,c} */, regionItem = null, geoReq = 0;
const dn = () => new Intl.DisplayNames([LG() === 'en' ? 'en' : 'uk'], { type: 'region' });
const dnEn = new Intl.DisplayNames(['en'], { type: 'region' }), dnUk = new Intl.DisplayNames(['uk'], { type: 'region' });
const countryItems = () => window.COUNTRIES.map(c => ({ code: c, label: dn().of(c) || c, keys: [dnUk.of(c), dnEn.of(c), c] })).sort((a, b) => (a.code === 'UA' ? -1 : b.code === 'UA' ? 1 : a.label.localeCompare(b.label, LG())));
const isUA = () => countryCode === 'UA';
const regionLabel = r => (isUA() && LG() === 'uk' && r[2]) ? r[2] : r[1];
const OCC = ['43', '14', '09']; // Крим, Донеччина, Луганщина: не обслуговуємо
const regionItems = () => geo ? geo.r.filter(r => !(isUA() && OCC.includes(r[0]))).map(r => ({ code: r[0], label: regionLabel(r), value: isUA() ? (r[2] || r[1]) : r[1], keys: [r[1], r[2]].filter(Boolean) })) : [];
const cityItems = () => {
  if (!geo) return [];
  const rows = (regionItem ? geo.c.filter(c => c[1] === regionItem.code) : geo.c).filter(c => !(isUA() && OCC.includes(c[1])));
  return rows.map(c => ({ label: (isUA() && LG() === 'uk' && c[4]) ? c[4] : c[0], name: c[0], region: c[1], keys: [c[0], c[4]].filter(Boolean), hint: regionItem ? '' : (geo.r.find(r => r[0] === c[1]) ? regionLabel(geo.r.find(r => r[0] === c[1])) : '') }));
};
const cCombo = combo(cIn, $('#country-list'), countryItems, { onPick: it => selectCountry(it.code) });
const rCombo = combo(rIn, $('#region-list'), regionItems, { onPick: it => { regionItem = it; if (yIn.value && !cityItems().some(c => norm(c.label) === norm(yIn.value))) { yIn.value = ''; yCombo.reset(); } }, onFree: v => { if (!v) regionItem = null; } });
const yCombo = combo(yIn, $('#city-list'), cityItems, { minChars: 1, onPick: it => { if (!regionItem && it.region && geo) { const r = geo.r.find(x => x[0] === it.region); if (r) { regionItem = { code: r[0], label: regionLabel(r), value: isUA() ? (r[2] || r[1]) : r[1] }; rCombo.set(regionItem); } } } });

async function selectCountry(code) {
  countryCode = code; regionItem = null; geo = null; rCombo.reset(); yCombo.reset();
  const my = ++geoReq;
  $('#rlabel').textContent = code === 'UA' ? (LG() === 'en' ? 'Region' : 'Область') : tl('f_region');
  try { const r = await fetch(`/geo/${code}.json`); if (r.ok && my === geoReq) geo = await r.json(); } catch {}
  loadCurrency(code);
}
function refreshLabels() {
  const keepCountry = countryCode; if (keepCountry) cCombo.set({ code: keepCountry, label: dn().of(keepCountry) || keepCountry });
  if (regionItem && geo) { const r = geo.r.find(x => x[0] === regionItem.code); if (r) { regionItem.label = regionLabel(r); rCombo.set(regionItem); } }
  $('#rlabel').textContent = countryCode === 'UA' ? (LG() === 'en' ? 'Region' : 'Область') : tl('f_region');
}

/* ---------- Ціна: для України в гривнях, для інших країн єдина ціна в євро (задається в адмінці) ---------- */
let basePrice = null, cur = { code: 'UAH', rate: 1 }, promoOk = null, curReq = 0, uahPerEur = null, wasPrice = null, saleUntil = null;
const fmtKop = kop => (kop % 100 ? (kop / 100).toFixed(2) : String(kop / 100)).replace('.', LG() === 'en' ? '.' : ',');
const uahTxt = kop => new Intl.NumberFormat(LG() === 'en' ? 'en' : 'uk', { minimumFractionDigits: kop % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(kop / 100) + ' ₴';   // «1 499 ₴»
function money(kop) {
  if (cur.code === 'UAH') return uahTxt(kop);
  try { return new Intl.NumberFormat(LG() === 'en' ? 'en' : 'uk', { style: 'currency', currency: cur.code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: kop % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(kop / 100); } catch { return `${fmtKop(kop)} ${cur.code}`; }
}
// дуже дрібний текст унизу форми: ціна для інших країн у євро, а рахунок Monobank у гривнях за курсом євро
const FX_UK = 'Ціну вказано в євро. Оплата в гривнях за курсом Monobank: {uah}. Якщо валюта вашої картки інша, банк конвертує суму за власним курсом.';
function fxNote(finalKop) {
  const el = $('#fxcur'); if (!el) return;
  if (cur.code === 'UAH' || !(finalKop > 0) || !uahPerEur) { el.textContent = ''; return; }
  const uah = uahTxt(Math.max(100, Math.round(finalKop / 100 * uahPerEur) * 100));
  el.textContent = LG() === 'en' ? t('fx_uah', { uah }) : FX_UK.replace('{uah}', uah);
}
function showPrice(finalKop) {
  if (basePrice === null) return;
  const base = Math.round(basePrice * 100), was = wasPrice ? Math.round(wasPrice * 100) : 0;
  const ref = was > finalKop ? was : finalKop < base ? base : 0;   // перекреслена: стандартна ціна акції, інакше ціна до промокоду
  $('#old').textContent = ref ? money(ref) : '';
  const pct = ref ? Math.round((1 - finalKop / ref) * 100) : 0, disc = $('#disc'); disc.hidden = !(pct > 0); disc.textContent = pct > 0 ? '−' + pct + '%' : '';
  $('.price').classList.toggle('sale', !!ref);
  const u = $('#until'); u.hidden = !(saleUntil && was); if (saleUntil && was) { const [y, m, d] = saleUntil.split('-').map(Number), ds = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(LG() === 'en' ? 'en-GB' : 'uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }); u.textContent = LG() === 'en' ? `Offer valid until ${ds}` : `Ціна діє до ${ds}`; }
  $('#price').textContent = money(finalKop);
  fxNote(finalKop);
  $('#ob').textContent = finalKop === 0 ? tl('f_free') : tl('f_pay');
}
const useConfig = c => { cur = c.currency || cur; basePrice = c.price; uahPerEur = Number(c.uahPerEur) || null; wasPrice = Number(c.was) > Number(c.price) ? Number(c.was) : null; saleUntil = c.saleUntil || null; };
const curFinal = () => promoOk ? promoOk.finalKop : Math.round(basePrice * 100);
async function loadCurrency(code) {
  const my = ++curReq;
  try { const c = await (await fetch('/api/config?country=' + encodeURIComponent(code))).json(); if (my !== curReq) return; useConfig(c); if (promoOk) { applyPromo(); return; } showPrice(curFinal()); } catch {}
}
window.addEventListener('langchange', () => { renderDemo(); refreshLabels(); if (basePrice !== null) showPrice(curFinal()); initTurnstileLang(); });

async function applyPromo() {
  const code = $('#promo').value.trim(); promoOk = null; $('#pmsg').style.color = '';
  if (!code) { $('#pmsg').textContent = ''; showPrice(curFinal()); return; }
  $('#pbtn').disabled = true;
  try {
    const j = await (await fetch('/api/promo/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, country: countryCode || 'UA' }) })).json();   // знижка у валюті обраної країни
    const bad = m => { $('#pmsg').textContent = m; $('#pmsg').style.color = 'var(--err)'; showPrice(curFinal()); };
    const UKP = { not_found: 'Такого промокоду немає.', inactive: 'Цей промокод більше не діє.', not_started: 'Цей промокод ще не діє.', expired: 'Термін дії промокоду минув.', exhausted: 'Промокод уже використано максимальну кількість разів.' };
    if (j.error === 'too_many') bad(LG() === 'en' ? t('p_many') : 'Забагато спроб. Спробуйте за кілька хвилин.');
    else if (!j.valid) bad(LG() === 'en' ? t('p_' + j.reason) : (UKP[j.reason] || 'Промокод не підходить.'));
    else { promoOk = { code: j.code, finalKop: j.finalKop, discountKop: j.discountKop }; $('#pmsg').textContent = LG() === 'en' ? t('p_applied', { x: money(j.discountKop) }) : `Промокод застосовано: знижка ${money(j.discountKop)}.`; $('#pmsg').style.color = 'var(--gold2)'; showPrice(j.finalKop); }
  } catch { $('#pmsg').textContent = t('p_fail'); }
  $('#pbtn').disabled = false;
}
$('#pbtn').addEventListener('click', applyPromo);
$('#promo').addEventListener('input', () => { if (promoOk) { promoOk = null; $('#pmsg').textContent = ''; showPrice(curFinal()); } });
$('#promo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } });

/* ---------- Turnstile ---------- */
let tsToken = '', tsWidget = null, tsOn = false, tsKey = null;
function initTurnstile(siteKey) { tsOn = true; tsKey = siteKey; const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.defer = true; s.onload = renderTurnstile; document.head.appendChild(s); }
function renderTurnstile() { if (!window.turnstile || !tsKey) return; if (tsWidget !== null) { try { window.turnstile.remove(tsWidget); } catch {} } tsToken = ''; tsWidget = window.turnstile.render('#ts', { sitekey: tsKey, theme: 'dark', language: LG() === 'en' ? 'en' : 'uk', callback: x => { tsToken = x; }, 'expired-callback': () => { tsToken = ''; }, 'error-callback': () => { tsToken = ''; } }); }
function initTurnstileLang() { if (tsOn && window.turnstile) renderTurnstile(); }

/* ---------- Старт ---------- */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const t0 = new Date(); t0.setDate(t0.getDate() + 1); const t1 = new Date(t0); t1.setDate(t1.getDate() + 90);
const DEFAULT_START = '2026-12-01'; // дата старту за замовчуванням: початок адвенту. Коли вона вже минула або поза межами дозволеного, ставимо завтра
$('#startDate').min = iso(t0); $('#startDate').max = iso(t1); $('#startDate').value = iso(t0) <= DEFAULT_START && DEFAULT_START <= iso(t1) ? DEFAULT_START : iso(t0);
renderDemo();
fetch('/api/config').then(r => r.json()).then(async c => {
  useConfig(c);
  window.LANG.suggest(c.detected && c.detected.lang);
  const cc = c.country && window.COUNTRIES.includes(c.country) ? c.country : 'UA';
  cCombo.set({ code: cc, label: dn().of(cc) || cc }); await selectCountry(cc);
  if (c.turnstileSiteKey) initTurnstile(c.turnstileSiteKey);
  showPrice(Math.round(basePrice * 100));
}).catch(() => { $('#price').textContent = '—'; });

/* ---------- Відправка ---------- */
const ERRC = { region_occupied: 'e_occupied', country_blocked: 'e_blocked', bad_names: 'e_names', bad_email: 'e_email', same_email: 'e_same', bad_city: 'e_city', bad_region: 'e_region', consent_required: 'e_consent', too_many: 'e_many', bad_date: 'e_date', captcha: 'e_captcha' };
const ERRUK = { region_occupied: 'На жаль, ми не обслуговуємо тимчасово окуповані території України.', country_blocked: 'На жаль, ми не можемо прийняти замовлення з цієї країни.', bad_names: 'Вкажіть обидва імені.', bad_email: 'Перевірте адреси пошти.', same_email: 'Пошти мають бути різні: у кожного своя.', bad_city: 'Вкажіть місто.', bad_region: 'Оберіть область.', consent_required: 'Підтвердіть вік і погодьтеся з умовами.', too_many: 'Забагато спроб. Спробуйте за годину.', bad_date: 'Оберіть дату старту: від завтра і не пізніше ніж за 90 днів.', captcha: 'Не вдалося підтвердити, що ви не бот. Спробуйте ще раз.', e_country: 'Оберіть країну зі списку.', promo_not_found: 'Такого промокоду немає.', promo_inactive: 'Цей промокод більше не діє.', promo_not_started: 'Цей промокод ще не діє.', promo_expired: 'Термін дії промокоду минув.', promo_exhausted: 'Промокод уже використано максимальну кількість разів.' };
const errMsg = code => LG() === 'en' ? (code === 'e_country' ? t('e_country') : ERRC[code] ? t(ERRC[code]) : code && code.startsWith('promo_') ? t('p_' + code.slice(6)) : t('e_gen')) : (ERRUK[code] || 'Не вдалося створити замовлення. Спробуйте ще раз.') + (ERRUK[code] ? '' : ` (код: ${String(code).slice(0, 60)})`);
$('#of').addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => $('#' + id).value.trim();
  if (!countryCode) return void ($('#oerr').textContent = errMsg('e_country'));
  // область: для України — лише зі списку (значення — українська назва), для інших країн можна ввести власний текст
  let region = regionItem && norm(regionItem.label) === norm(rIn.value) ? regionItem.value : v('region');
  if (isUA()) { const m = regionItems().find(x => norm(x.label) === norm(rIn.value) || x.keys.some(k => norm(k) === norm(rIn.value))); if (!m) return void ($('#oerr').textContent = errMsg('bad_region')); region = m.value; }
  if (tsOn && !tsToken) { $('#oerr').textContent = LG() === 'en' ? t('e_bot') : 'Підтвердіть, що ви не бот (віджет вище).'; return; }
  const cityPicked = yCombo.getPicked(), city = cityPicked && norm(cityPicked.label) === norm(yIn.value) ? cityPicked.label : v('city'); // назва мовою інтерфейсу: запити на мапі збігаються з мовою календаря
  const body = { nameA: v('nameA'), nameB: v('nameB'), emailA: v('emailA'), emailB: v('emailB'), city, country: countryCode, region, startDate: $('#startDate').value, lang: LG(), tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'),
    age18: $('#age18').checked, terms: $('#terms').checked, turnstileToken: tsToken, promo: $('#promo').value.trim(), utm: window.raUtm ? window.raUtm() : undefined };
  const btn = $('#ob'); btn.disabled = true; $('#oerr').textContent = '';
  try {
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    try { localStorage.setItem('lang', LG()); } catch {} if (window.raTrack) { window.raTrack('checkout', j.amountKop ? { value: j.amountKop / 100, currency: j.currency || 'UAH' } : {}); await new Promise(r => setTimeout(r, 300)); } location.href = j.payUrl;
  } catch (er) { $('#oerr').textContent = errMsg(er.message); btn.disabled = false; if (tsWidget !== null && window.turnstile) { tsToken = ''; window.turnstile.reset(tsWidget); } }
});
})();

/* ---------- Стрічка Instagram: або картинки з API, або вбудовані пости (embed); без обох секція прихована ---------- */
(async () => {
  try {
    const r = await fetch('/api/instagram'), j = await r.json(); if (!j.ok) return;
    const grid = document.getElementById('ig-grid'), sec = document.getElementById('ig'); if (!grid || !sec) return;
    if (j.posts && j.posts.length) {
      grid.innerHTML = j.posts.map(p => `<a class="ig-post" href="${encodeURI(p.link)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><img src="${encodeURI(p.img)}" alt="${String(p.alt || 'Instagram').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`).join('');
    } else if (j.embeds && j.embeds.length) {
      grid.classList.add('ig-embeds');
      grid.innerHTML = j.embeds.filter(e => /^(p|reel|tv)$/.test(e.t) && /^[A-Za-z0-9_-]{5,20}$/.test(e.c)).map(e => `<iframe class="ig-embed" src="https://www.instagram.com/${e.t}/${e.c}/embed/" title="Instagram" loading="lazy" scrolling="no" allowtransparency="true" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`).join('');
    } else return;
    sec.hidden = false;
  } catch { /* стрічка необов'язкова */ }
})();

// Плаваюча кнопка «Замовити» на телефоні: з'являється після першого екрана, ховається біля форми замовлення
(() => {
  const bar = document.getElementById('scta'), price = document.getElementById('price'), out = document.getElementById('sctap'), order = document.getElementById('order');
  if (!bar || !price || !order) return;
  const sync = () => { out.textContent = price.textContent && price.textContent !== '—' ? price.textContent : ''; };
  sync(); new MutationObserver(sync).observe(price, { childList: true, characterData: true, subtree: true });
  let nearOrder = false;
  const upd = () => { const show = scrollY > innerHeight * 0.9 && !nearOrder; bar.hidden = false; bar.classList.toggle('off', !show); };
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { nearOrder = es.some(e => e.isIntersecting); upd(); }, { rootMargin: '0px 0px -10% 0px' }).observe(order);
  addEventListener('scroll', upd, { passive: true }); bar.classList.add('off'); bar.hidden = false; upd();
})();

// Лічильник: щоб календар стартував 1 грудня, замовити треба до 30 листопада включно (старт — найраніше наступного дня). Після 30.11 ховається.
(() => {
  const els = document.querySelectorAll('[data-cd]'), short = document.querySelector('[data-cdshort]'); if (!els.length) return;
  const kyiv = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; };
  const plural = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'дні' : 'днів'; };
  const render = () => {
    const { y, m, d } = kyiv(); const today = Date.UTC(y, m - 1, d), last = Date.UTC(y, 10, 30), left = Math.round((last - today) / 864e5) + 1;   // днів, включно з сьогодні
    const on = m === 11 && left >= 1 && left <= 30, en = !!(window.LANG && window.LANG.get() === 'en');
    els.forEach(el => { el.hidden = !on; if (!on) return;
      el.innerHTML = left === 1
        ? `<span class="cd-dot"></span>${en ? 'Last day to order for a <strong>December 1</strong> start' : 'Сьогодні останній день, щоб почати <strong>1 грудня</strong>'}`
        : `<b>${left}</b><span>${en ? `days left to order for a December 1 start` : `${plural(left)}, щоб замовити зі стартом 1 грудня`}</span>`; });
    if (short) { short.hidden = !on; if (on) short.textContent = left === 1 ? (en ? '⏳ last day for Dec 1 start' : '⏳ останній день до старту 1.12') : (en ? `⏳ ${left} days to Dec 1 start` : `⏳ ${left} ${plural(left)} до старту 1 грудня`); }
  };
  render(); addEventListener('langchange', render);
})();
