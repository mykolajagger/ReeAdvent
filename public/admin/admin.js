(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UAH = kop => (kop / 100).toLocaleString('uk-UA', { minimumFractionDigits: kop % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' ₴';
const EUR = kop => (kop / 100).toLocaleString('uk-UA', { minimumFractionDigits: kop % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
const money = (kop, cur) => (cur === 'EUR' ? EUR(kop) : UAH(kop));   // сума у валюті замовлення: гривня (Україна) або євро (інші країни)
const dt = ms => ms ? new Date(ms).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const dd = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y.slice(2)}`; };
const pct = x => x == null ? '—' : (x * 100).toFixed(0) + '%';
const root = $('#root');
let me = null, view = 'dashboard', period = '30', inboxFilter = 'open', inboxSel = null, ordersState = { status: 'all', q: '', page: 1 };

/* ---------- API ---------- */
async function api(method, path, body) {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-Admin': '1' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || j.ok === false) { const e = new Error(j.error || 'server_error'); e.code = j.error || 'server_error'; e.detail = j.detail; if (e.code === 'admin_auth') { me = null; showLogin(); } throw e; }
  return j;
}
const ERR = { fx_failed: 'Не вдалося отримати курси (сервіс недоступний)', refund_failed: 'Monobank не виконав повернення. Замовлення не змінено', bad_percent: 'Відсоток: число від 0 до 100', bad_rate: 'Курс: від 1 до 1000', bad_cap: 'Ліміт: ціле число від 0', bad_token: 'Токен має неправильний вигляд', token_rejected: 'Instagram не прийняв токен (перевірте токен і ID акаунта)', bad_id: 'ID акаунта: лише цифри', ig_unreachable: 'Instagram недоступний, спробуйте пізніше', bad_price: 'Ціна: від 1 до 100000 грн', bad_price_eur: 'Ціна в євро: від 1 до 10000 €', not_archived: 'Видалити можна лише замовлення з архіву', bad_ids: 'Не вибрано замовлень (або забагато за раз)', bad_action: 'Невідома дія', admin_auth: 'Сесія закінчилась', code_exists: 'Такий код уже є', bad_code: 'Код: 3–32 символи (літери, цифри, - _)', bad_value: 'Невірне значення знижки', bad_max: 'Ліміт: ціле число від 1', bad_date: 'Невірна дата', already_started: 'Календар уже стартував: дату змінити не можна', same_email: 'Пошти мають бути різні', bad_email: 'Невірна пошта', bad_names: 'Вкажіть імена', not_paid: 'Замовлення не оплачене', already_refunded: 'Повернення вже оформлено', bad_amount: 'Сума більша за оплачену', empty: 'Напишіть текст відповіді', too_many: 'Забагато спроб', csrf: 'Помилка захисту, оновіть сторінку', no_key: 'Потрібен секрет ANTHROPIC_API_KEY у Cloudflare', ai_failed: 'Claude зараз недоступний, спробуйте за хвилину', ai_invalid: 'Claude повернув незрозумілу відповідь, спробуйте переформулювати', empty_prompt: 'Напишіть, що змінити', bad_ref: 'Файл-референс не підійшов (фото JPEG/PNG, PDF, .txt або .md)', ref_too_big: 'Референси завеликі: до 4 файлів загалом до 4 МБ', proposal_locked: 'Погоджену пропозицію спершу відкличте з плану', proposal_invalid: 'Не вистачає даних у пропозиції', media_missing: 'Файл зображення не знайдено, спробуйте ще раз', media_count: 'Кількість файлів не збігається зі слайдами', media_too_big: 'Файл завеликий', media_need_r2: 'Відео потребує сховища R2 (див. docs/agent.md)', bad_media: 'Це не зображення JPEG/PNG і не відео MP4', already_published: 'Уже опубліковано: змінити не можна', bad_version: 'Такої версії немає', media_not_video: 'Для Reel потрібен файл MP4' };
const errText = e => (ERR[e.code] || 'Щось пішло не так: ' + (e.code || e.message)) + (e.detail ? ` (${e.detail})` : '');
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800); }

/* ---------- Вхід ---------- */
function showLogin(msg) {
  root.innerHTML = `<div class="login"><div class="card"><div class="logo"><img class="logo-img" src="/assets/logo-full.png" alt="ReeAdvent: Unwrap Love. Every Day." width="200" height="92"></div><div class="muted">Адмінка</div>
    <form id="lf" style="display:grid;gap:10px"><input id="em" type="email" placeholder="пошта адміністратора" autocomplete="email" required><button class="btn" id="sb">Надіслати посилання для входу</button></form>
    <div class="muted" id="lm">${esc(msg || '')}</div></div></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); $('#sb').disabled = true;
    try { await api('POST', '/api/admin/auth/request', { email: $('#em').value }); $('#lf').outerHTML = '<p>Якщо ця пошта має доступ, лист із посиланням уже надіслано. Воно діє 30 хвилин.</p>'; }
    catch (er) { $('#lm').textContent = errText(er); $('#sb').disabled = false; }
  };
}
async function consumeLogin() {
  const m = location.hash.match(/login=([\w-]+)/); if (!m) return true;
  history.replaceState(null, '', location.pathname + '#/dashboard');
  try { await api('POST', '/api/admin/auth/verify', { token: m[1] }); return true; } catch { showLogin('Посилання недійсне або застаріле. Запросіть нове.'); return false; }
}

/* ---------- Каталог закладів: країни → міста → заклади ---------- */
const CATL = { cafe: 'Кав’ярні', restaurant: 'Ресторани', bar: 'Бари й паби', pastry: 'Кондитерські', cinema: 'Кінотеатри', theatre: 'Театри й арт-центри', museum: 'Музеї', park: 'Парки', viewpoint: 'Оглядові майданчики',
  bowling: 'Боулінг', billiards: 'Більярд', pool: 'Басейни', spa: 'SPA, сауни, масаж', rink: 'Ковзанки', climbing: 'Скеледроми', yoga: 'Йога й пілатес', church: 'Храми', garden: 'Сади', castle: 'Замки й фортеці',
  books: 'Книгарні', florist: 'Квіти', market: 'Ринки', shelter: 'Притулки для тварин', gift: 'Сувеніри', coffee: 'Кава (магазини)', tea: 'Чай', wine: 'Вино', beer: 'Пиво й напої', cheese: 'Сир', photo: 'Фото',
  jewelry: 'Прикраси', toys: 'Ігри та іграшки', beauty: 'Косметика й парфуми' };
const STL = { ready: 'готове', pending: 'у черзі', working: 'в обробці', failed: 'помилка' };
const flag = cc => /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1f1a5 + c.charCodeAt(0))) : '';
const cname = cc => { try { return new Intl.DisplayNames(['uk'], { type: 'region' }).of(cc) || cc; } catch { return cc; } };
const fdate = t => t ? new Date(t).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }) : '—';
async function catalog() {
  const parts = location.hash.split('/'), cc = (parts[2] || '').toUpperCase(), cid = parts[3];
  const main = $('#main');
  if (cid) return catalogCityView(main, cc, +cid);
  if (cc) return catalogCountry(main, cc);
  const r = await api('GET', '/api/admin/venues/countries');
  main.innerHTML = `<div class="head"><h1>Каталог закладів</h1><div class="muted">Країни та міста, для яких зібрано заклади (дані © OpenStreetMap contributors). Оберіть країну.</div></div>
    <input id="cq" class="catq" placeholder="Пошук країни або коду…" autocomplete="off">
    <div class="cat-list" id="cl">${r.countries.map(c => `<a class="cat-row" data-t="${esc((cname(c.country) + ' ' + c.country).toLowerCase())}" href="#/catalog/${esc(c.country)}"><span class="cat-main"><b>${flag(c.country)} ${esc(cname(c.country))}</b> <span class="muted">${esc(c.country)}</span></span><span class="cat-sub">міст ${c.ready}/${c.cities}${c.pending ? `, у черзі ${c.pending}` : ''}${c.failed ? `, помилок ${c.failed}` : ''}</span><span class="cat-num">${c.venues || 0}</span></a>`).join('') || '<div class="empty">Каталог порожній: міст ще немає</div>'}</div>`;
  $('#cq').oninput = e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('#cl .cat-row').forEach(a => a.hidden = !!q && !a.dataset.t.includes(q)); };
}
async function catalogCountry(main, cc) {
  const r = await api('GET', '/api/admin/venues/cities?country=' + encodeURIComponent(cc));
  main.innerHTML = `<div class="head"><a href="#/catalog" class="back">← Усі країни</a><h1>${flag(cc)} ${esc(cname(cc))}</h1><div class="muted">${r.cities.length} міст у черзі та каталозі. Оберіть місто, щоб побачити його заклади.</div></div>
    <input id="cq" class="catq" placeholder="Пошук міста…" autocomplete="off">
    <div class="cat-list" id="cl">${r.cities.map(c => `<a class="cat-row" data-t="${esc(c.name.toLowerCase())}" href="#/catalog/${esc(cc)}/${c.id}"><span class="cat-main"><b>${esc(c.name)}</b>${c.alias_of ? ' <span class="muted">(та сама агломерація, що й іншого міста)</span>' : ''}</span><span class="cat-sub"><span class="chip st-${esc(c.status)}">${STL[c.status] || esc(c.status)}</span> ${c.fetched_at ? esc(fdate(c.fetched_at)) : ''}${c.error ? ` · <span class="muted">${esc(c.error)}</span>` : ''}</span><span class="cat-num">${c.venues_count || 0}</span></a>`).join('') || '<div class="empty">Міст немає</div>'}</div>`;
  $('#cq').oninput = e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('#cl .cat-row').forEach(a => a.hidden = !!q && !a.dataset.t.includes(q)); };
}
async function catalogCityView(main, cc, id) {
  const r = await api('GET', '/api/admin/venues/city/' + id), c = r.city, byCat = {};
  for (const v of r.venues) (byCat[v.cat] ||= []).push(v);
  const cats = Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length);
  const gm = v => v.lat != null ? `https://www.google.com/maps/search/${encodeURIComponent((v.name + ' ' + (v.address || '')).trim())}/@${Number(v.lat).toFixed(6)},${Number(v.lon).toFixed(6)},18z` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + ' ' + c.name)}`;
  const draw = sel => `<div class="cat-list">${(sel ? [sel] : cats).map(k => `<div class="cat-group"><h3>${esc(CATL[k] || k)} <span class="muted">${byCat[k].length}</span></h3>${byCat[k].map(v => `<div class="cat-v"><a href="${esc(gm(v))}" target="_blank" rel="noopener noreferrer"><b>${esc(v.name)}</b></a>${v.r_cnt ? ` <span class="stars">★ ${(v.r_sum / v.r_cnt).toFixed(1)} <small>(${v.r_cnt})</small></span>` : ''}<div class="muted">${[v.address, v.hours, v.edited ? 'правка OSM ' + new Date(v.edited).getFullYear() : ''].filter(Boolean).map(esc).join(' · ') || '—'}${v.closed_reports ? ` · <span class="st-failed">скарг «закрито»: ${v.closed_reports}</span>` : ''}${v.ov_state === 'match' ? ` · <span class="st-ready">Overture ✓ ${(+v.ov_conf).toFixed(2)}</span>` : v.ov_state === 'ov' ? ` · <span class="st-ready">лише в Overture ${(+v.ov_conf).toFixed(2)}</span>` : v.ov_state === 'miss' ? ' · <span class="st-pending">немає в Overture</span>' : v.ov_state === 'closed' ? ' · <b class="st-failed">закрито за Overture</b>' : ''}${v.hidden ? ' · <b class="st-failed">прихований</b>' : ''} <button class="chip vh" data-id="${v.id}" data-h="${v.hidden ? 0 : 1}" type="button">${v.hidden ? 'Показати' : 'Приховати'}</button></div></div>`).join('')}</div>`).join('') || '<div class="empty">Закладів поки немає</div>'}</div>`;
  main.innerHTML = `<div class="head"><a href="#/catalog/${esc(cc)}" class="back">← ${esc(cname(cc))}</a><h1>${esc(c.name)}</h1>
    <div class="muted"><span class="chip st-${esc(c.status)}">${STL[c.status] || esc(c.status)}</span> закладів ${r.venues.length}${c.fetched_at ? ' · оновлено ' + esc(fdate(c.fetched_at)) : ''}${c.error ? ' · ' + esc(c.error) : ''}${r.alias ? ` · показано дані міста «${esc(r.alias.name)}»` : ''}${c.lat != null ? ` · <a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=12/${c.lat}/${c.lon}" target="_blank" rel="noopener noreferrer">на мапі</a>` : ''}</div></div>
    <div class="cat-chips" id="cc"><button class="chip on" data-k="">Усі</button>${cats.map(k => `<button class="chip" data-k="${esc(k)}">${esc(CATL[k] || k)} · ${byCat[k].length}</button>`).join('')}</div>
    <div id="cv">${draw(null)}</div>`;
  const bindHide = () => document.querySelectorAll('.vh').forEach(b => b.onclick = async () => { try { await api('POST', '/api/admin/venues/hide', { id: +b.dataset.id, hidden: b.dataset.h === '1' }); toast(b.dataset.h === '1' ? 'Заклад приховано' : 'Заклад показано'); catalog(); } catch (e) { toast(errText(e)); } });
  bindHide();
  document.querySelectorAll('#cc .chip').forEach(b => b.onclick = () => { document.querySelectorAll('#cc .chip').forEach(x => x.classList.toggle('on', x === b)); $('#cv').innerHTML = draw(b.dataset.k || null); bindHide(); });
}

/* ---------- Каркас ---------- */
const NAV = [['dashboard', 'Дашборд'], ['orders', 'Замовлення'], ['customers', 'Клієнти'], ['promos', 'Промокоди'], ['social', 'Соцмережі й реклама'], ['inbox', 'Підтримка'], ['comms', 'Комунікації'], ['catalog', 'Каталог закладів'], ['settings', 'Налаштування'], ['audit', 'Журнал дій']];
async function shell() {
  root.innerHTML = `<div class="shell"><aside class="side"><div class="logo"><img class="logo-img" src="/assets/logo.png" alt="ReeAdvent" width="120" height="44"></div>
    <nav class="nav">${NAV.map(([k, t]) => `<a data-v="${k}" class="${view === k ? 'on' : ''}" href="#/${k}">${t}${k === 'inbox' ? '<span class="badge" id="ib" hidden></span>' : ''}</a>`).join('')}</nav>
    <div class="who">${esc(me.email)}<br><a href="#" id="lo">Вийти</a></div></aside><main id="main"></main></div>`;
  $('#lo').onclick = async e => { e.preventDefault(); try { await api('POST', '/api/admin/auth/logout', {}); } catch {} me = null; showLogin(); };
}
async function route() {
  if (!me) return;
  view = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'dashboard'; if (!NAV.some(n => n[0] === view)) view = 'dashboard';
  await shell();
  const views = { dashboard, orders, customers, promos, social, inbox, catalog, settings, audit, ...window.ADM.views };
  try { await views[view](); } catch (e) { if (e.code !== 'admin_auth') $('#main').innerHTML = `<div class="empty">Помилка: ${esc(errText(e))}</div>`; }
  refreshBadge();
}
async function refreshBadge() { try { const r = await api('GET', '/api/admin/inbox?status=open'); const n = r.threads.reduce((s, t) => s + t.unread, 0); const b = $('#ib'); if (b) { b.textContent = n; b.hidden = !n; } } catch {} }
addEventListener('hashchange', () => { if (!/login=/.test(location.hash)) route(); });

/* ---------- Дашборд ---------- */
function niceMax(v) { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
function barChart(series) {
  const W = 760, H = 230, L = 52, B = 26, T = 8, R = 6, iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(...series.map(s => s.revenue_kop), 1)), n = series.length, slot = iw / n, bw = Math.max(2, Math.min(18, slot - 3));
  const ticks = [0, 1, 2, 3, 4].map(i => max * i / 4);
  const every = Math.ceil(n / 6);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Виручка по днях">
    <g class="grid">${ticks.map(v => { const y = T + ih - (v / max) * ih; return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${v === 0 ? '0' : UAH(v).replace(' ₴', '')}</text>`; }).join('')}</g>
    ${series.map((s, i) => { const h = s.revenue_kop > 0 ? Math.max(2, (s.revenue_kop / max) * ih) : 0, x = L + i * slot + (slot - bw) / 2, y = T + ih - h;
      return `<g data-tip="${esc(`<b>${dd(s.date)}</b>${UAH(s.revenue_kop)} · ${s.orders} зам.`)}"><rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}"/>${h ? `<path class="bar" d="M${x} ${T + ih}V${y + 4}Q${x} ${y} ${x + 4} ${y}H${x + bw - 4}Q${x + bw} ${y} ${x + bw} ${y + 4}V${T + ih}Z"/>` : ''}</g>`; }).join('')}
    ${series.map((s, i) => i % every === 0 ? `<text x="${L + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${dd(s.date).slice(0, 5)}</text>` : '').join('')}</svg>`;
}
const hbars = (rows, valFn, labFn) => { const max = Math.max(...rows.map(valFn), 1); return rows.length ? `<div class="hbar">${rows.map(r => `<div class="r"><div>${esc(r.label ?? r.name)}</div><div class="t"><i style="width:${Math.max(2, valFn(r) / max * 100)}%"></i></div><div class="mono muted">${labFn(r)}</div></div>`).join('')}</div>` : '<div class="muted">Поки немає даних</div>'; };

async function dashboard() {
  const d = await api('GET', '/api/admin/dashboard?days=' + period), k = d.kpi;
  const seg = [['7', '7 днів'], ['30', '30 днів'], ['90', '90 днів'], ['365', 'Рік'], ['all', 'Весь час']];
  const funnelBase = d.funnel[0].n || 1;
  $('#main').innerHTML = `<div class="top"><div><h2>Огляд</h2><h1>Дашборд</h1></div><div class="seg" id="seg">${seg.map(([v, t]) => `<button data-p="${v}" class="${period === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
  <div class="row" style="margin-bottom:14px">
    ${k.inbox_unread ? `<a class="pill open" href="#/inbox">Нових листів: ${k.inbox_unread}</a>` : ''}
    ${k.pending ? `<span class="pill pending">Очікують оплати: ${k.pending}</span>` : ''}
    ${k.abandoned ? `<a class="pill abandoned" href="#/orders" id="ab">Неоплачених (>1 год): ${k.abandoned}</a>` : ''}
  </div>
  <div class="grid kpis">
    <div class="kpi hero"><h2>Чистий прибуток ≈</h2><div class="v">${UAH(k.profit_kop)}</div><div class="s">після комісії банку (${k.fee_pct}% / ${k.fee_foreign_pct}%) і податків ${k.tax_pct}%</div></div>
    <div class="kpi"><h2>Виручка (нетто)</h2><div class="v">${UAH(k.net_revenue_kop)}</div><div class="s">після знижок і повернень${k.eur && k.eur.paid ? `; з них оплат у євро: ${k.eur.paid} на ${EUR(k.eur.cents)} (≈ ${UAH(k.eur.uah_kop)})` : ''}</div></div>
    <div class="kpi"><h2>Оплачено</h2><div class="v">${k.paid}</div><div class="s">з них безкоштовних: ${k.free}</div></div>
    <div class="kpi"><h2>Конверсія</h2><div class="v">${pct(k.conversion)}</div><div class="s">${k.created} створено → оплачено</div></div>
    <div class="kpi"><h2>Середній чек</h2><div class="v">${UAH(k.avg_check_kop)}</div><div class="s">лише платні замовлення</div></div>
  </div>
  <div class="grid kpis" style="margin-top:14px">
    <div class="kpi"><h2>За прайсом</h2><div class="v">${UAH(k.list_kop)}</div></div>
    <div class="kpi"><h2>Знижки</h2><div class="v">−${UAH(k.discount_kop)}</div></div>
    <div class="kpi"><h2>Повернення</h2><div class="v">−${UAH(k.refunds_kop)}</div></div>
    <div class="kpi"><h2>Комісія еквайрингу</h2><div class="v">−${UAH(k.fee_kop)}</div></div>
    <div class="kpi"><h2>Податки</h2><div class="v">−${UAH(k.tax_kop)}</div></div>
    <div class="kpi"><h2>Клієнтів (пошт)</h2><div class="v">${k.customers}</div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h2>Виручка по днях</h2><button class="btn ghost sm" id="tg">Таблиця</button></div>
    <div id="chartbox">${d.series.length ? barChart(d.series) : '<div class="muted">Немає даних</div>'}</div></div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h2>Воронка</h2><div style="margin-top:12px">${hbars(d.funnel, f => f.n, f => `${f.n} · ${Math.round(f.n / funnelBase * 100)}%`)}</div></div>
    <div class="card"><h2>Найближчі старти календарів</h2><div style="margin-top:12px">${hbars(d.upcoming_starts.map(s => ({ label: dd(s.date), n: s.n })), r => r.n, r => r.n)}</div></div>
    <div class="card"><h2>Топ областей</h2><div style="margin-top:12px">${hbars(d.regions, r => r.orders, r => `${r.orders} · ${UAH(r.revenue_kop)}`)}</div></div>
    <div class="card"><h2>Топ міст</h2><div style="margin-top:12px">${hbars(d.cities, r => r.orders, r => `${r.orders} · ${UAH(r.revenue_kop)}`)}</div></div>
  </div>
  <div class="card" style="margin-top:14px"><h2>Промокоди за період</h2><div class="tw" style="margin-top:12px"><table><thead><tr><th>Код</th><th class="num">Замовлень</th><th class="num">Знижок</th><th class="num">Виручка</th></tr></thead><tbody>${d.promos.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="num">${p.orders}</td><td class="num">−${UAH(p.discount_kop)}</td><td class="num">${UAH(p.revenue_kop)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Промокодами ще не користувались</td></tr>'}</tbody></table></div></div>
  <div class="card sec" id="rtcard" style="margin-top:14px"><h2>Оцінки клієнтів</h2><div class="muted">Завантаження…</div></div>
  <p class="muted" style="margin-top:16px;font-size:12px">Прибуток орієнтовний: комісія Monobank ${k.fee_pct}% (українські картки) і ${k.fee_foreign_pct}% (іноземні), податки ${k.tax_pct}% (${k.tax_single_pct}% єдиний податок + ${k.tax_military_pct}% військовий збір) задаються в розділі <a href="#/settings">Налаштування</a>; ЄСВ та інші витрати не враховано. Звіряйте з бухгалтером.</p>`;
  $('#seg').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { period = b.dataset.p; dashboard(); } };
  // оцінки пунктів календаря (1–5 зірок): найкращі частіше потрапляють у нові календарі, слабкі рідше
  api('GET', '/api/admin/ratings').then(rt => {
    const K = [['gift', 'Подарунки'], ['intim', 'Пригоди'], ['act', 'Активності'], ['q', 'Питання дня']], row = x => `<tr><td>${esc(x.title)}</td><td class="num">★ ${String(x.avg).replace('.', ',')}</td><td class="num muted">${x.n}</td></tr>`;
    const tbl = (list, empty) => list.length ? `<div class="tw"><table style="min-width:0"><tbody>${list.map(row).join('')}</tbody></table></div>` : `<div class="muted">${empty}</div>`;
    const total = K.reduce((t, [k]) => t + rt[k].total, 0);
    $('#rtcard').innerHTML = `<h2>Оцінки клієнтів</h2><div class="muted">Клієнти оцінюють кожен пункт дня від 1 до 5 зірок. Високо оцінене частіше потрапляє в нові календарі, слабке рідше, а пара, що замовляє знову, не отримує вже отриманого. Усього оцінок: ${total}.</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">${K.map(([k, t]) => `<div class="sec"><b>${t}</b><span class="muted" style="font-size:12px">оцінок: ${rt[k].total}, пунктів: ${rt[k].items}</span><div class="muted" style="font-size:12px">Найкращі</div>${tbl(rt[k].best, 'Поки замало оцінок (потрібно від двох на пункт)')}${rt[k].worst.length ? `<div class="muted" style="font-size:12px">Найслабші</div>${tbl(rt[k].worst, '')}` : ''}</div>`).join('')}</div>`;
  }).catch(() => { const c = $('#rtcard'); if (c) c.innerHTML = '<h2>Оцінки клієнтів</h2><div class="muted">Не вдалося завантажити.</div>'; });
  const ab = $('#ab'); if (ab) ab.onclick = () => { ordersState = { status: 'abandoned', q: '', page: 1 }; };
  let table = false; $('#tg').onclick = () => { table = !table; $('#tg').textContent = table ? 'Графік' : 'Таблиця';
    $('#chartbox').innerHTML = table ? `<div class="tw"><table><thead><tr><th>Дата</th><th class="num">Замовлень</th><th class="num">Виручка</th></tr></thead><tbody>${[...d.series].reverse().map(s => `<tr><td>${dd(s.date)}</td><td class="num">${s.orders}</td><td class="num">${UAH(s.revenue_kop)}</td></tr>`).join('')}</tbody></table></div>` : barChart(d.series); };
}
// підказки на графіках
const tip = $('#tip');
document.addEventListener('mousemove', e => { const g = e.target.closest && e.target.closest('[data-tip]'); if (!g) { tip.classList.remove('on'); return; } tip.innerHTML = g.dataset.tip; tip.classList.add('on'); tip.style.left = Math.min(innerWidth - 250, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; });

/* ---------- Замовлення ---------- */
const STATUS = { paid: 'Оплачено', pending: 'Очікує оплати', abandoned: 'Не оплачено', refunded: 'Повернено' };
const pill = s => `<span class="pill ${s}">${STATUS[s] || s}</span>`;
async function orders() {
  const { status, q } = ordersState, sel = new Set(), arch = () => ordersState.status === 'archived';
  $('#main').innerHTML = `<div class="top"><div><h2>Продажі</h2><h1>Замовлення</h1></div></div>
  <div class="row" style="margin-bottom:14px"><select id="fs">${[['all', 'Усі'], ['paid', 'Оплачені'], ['pending', 'Очікують оплати'], ['abandoned', 'Не оплачені'], ['refunded', 'Повернені'], ['archived', 'Архів (тестові й непотрібні)']].map(([v, t]) => `<option value="${v}" ${status === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <input id="fq" type="search" placeholder="Пошук: пошта, ім'я, місто, номер" value="${esc(q)}" style="flex:1;min-width:220px"></div>
  <div id="obar" class="row" style="margin-bottom:10px;gap:8px" hidden></div><div id="ol"></div>`;
  const bar = () => { const n = sel.size, el = $('#obar'); el.hidden = !n; el.innerHTML = n ? `<b>Вибрано: ${n}</b>${arch() ? '<button class="btn ghost sm" type="button" data-bulk="unarchive">Повернути з архіву</button><button class="btn danger sm" type="button" data-bulk="delete">Видалити назавжди</button>' : '<button class="btn ghost sm" type="button" data-bulk="archive">В архів</button>'}<button class="btn ghost sm" type="button" data-bulk="clear">Скасувати вибір</button>` : ''; };
  const load = async () => {
    const r = await api('GET', `/api/admin/orders?status=${ordersState.status}&q=${encodeURIComponent(ordersState.q)}&page=${ordersState.page}`);
    sel.clear(); bar();
    $('#ol').innerHTML = `${arch() ? '<div class="muted" style="margin-bottom:10px">Архівні замовлення не рахуються в дашборді, клієнтах, промокодах і рекламі, і нагадування їм не надсилаються. Календарі при цьому працюють. Звідси замовлення можна повернути або видалити назавжди разом із календарем.</div>' : ''}<div class="tw"><table><thead><tr><th style="width:30px"><input type="checkbox" id="oall" title="Вибрати всі на сторінці" aria-label="Вибрати всі на сторінці"></th><th>Дата</th><th>Клієнти</th><th>Місто</th><th class="num">Сума</th><th>Статус</th><th>Старт</th></tr></thead><tbody>${r.orders.map(o => `<tr class="click" data-id="${o.id}"><td><input type="checkbox" class="osel" data-id="${o.id}" aria-label="Вибрати замовлення"></td><td class="mono">${dt(o.created_at)}</td>
      <td><b>${esc(o.name_a)}</b> · ${esc(o.email_a)}<br><b>${esc(o.name_b)}</b> · ${esc(o.email_b)}</td><td>${esc(o.city)}<div class="muted">${esc(o.region)}</div></td>
      <td class="num">${money(o.amount_kop, o.currency)}${o.discount_kop ? `<div class="muted"><s>${money(o.list_kop, o.currency)}</s> ${o.promo_code ? esc(o.promo_code) : ''}</div>` : ''}</td><td>${pill(o.status)}</td><td class="mono">${dd(o.start_date)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Нічого не знайдено</td></tr>'}</tbody></table></div>
      <div class="row" style="justify-content:space-between;margin-top:12px"><span class="muted">Усього: ${r.total}</span><span class="row"><button class="btn ghost sm" id="pp" ${r.page <= 1 ? 'disabled' : ''}>←</button><span class="muted">${r.page} / ${r.pages}</span><button class="btn ghost sm" id="pn" ${r.page >= r.pages ? 'disabled' : ''}>→</button></span></div>`;
    $('#pp').onclick = () => { ordersState.page--; load(); }; $('#pn').onclick = () => { ordersState.page++; load(); };
  };
  $('#ol').onclick = e => { if (e.target.closest('input[type=checkbox]')) return; const tr = e.target.closest('tr[data-id]'); if (tr) openOrder(tr.dataset.id); };
  $('#ol').onchange = e => {
    if (e.target.id === 'oall') document.querySelectorAll('#ol .osel').forEach(c => { c.checked = e.target.checked; if (c.checked) sel.add(c.dataset.id); else sel.delete(c.dataset.id); });
    else if (e.target.classList.contains('osel')) { if (e.target.checked) sel.add(e.target.dataset.id); else sel.delete(e.target.dataset.id); }
    bar();
  };
  $('#obar').onclick = async e => {
    const b = e.target.closest('[data-bulk]'); if (!b) return; const act = b.dataset.bulk, ids = [...sel];
    if (act === 'clear') { sel.clear(); document.querySelectorAll('#ol input[type=checkbox]').forEach(c => { c.checked = false; }); return bar(); }
    if (act === 'delete' && !confirm(`Видалити назавжди ${ids.length} замовл.? Разом із ними зникнуть календарі, відповіді учасників і листи в журналі. Відновити не вийде.`)) return;
    b.disabled = true; let n = 0;
    try { const step = act === 'delete' ? 10 : 100; for (let i = 0; i < ids.length; i += step) n += (await api('POST', '/api/admin/orders/bulk', { action: act, ids: ids.slice(i, i + step) })).n; toast(({ archive: 'Перенесено в архів: ', unarchive: 'Повернено з архіву: ', delete: 'Видалено: ' })[act] + n); }
    catch (er) { toast(errText(er)); }
    load();
  };
  $('#fs').onchange = e => { ordersState.status = e.target.value; ordersState.page = 1; load(); };
  let tm; $('#fq').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { ordersState.q = e.target.value; ordersState.page = 1; load(); }, 300); };
  await load();
}

async function openOrder(id) {
  const r = await api('GET', '/api/admin/orders/' + id), o = r.order, cal = r.calendar;
  const ov = document.createElement('div'); ov.className = 'ov';
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => e.key === 'Escape' && close(); document.addEventListener('keydown', onKey);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  const started = cal && cal.today > 0;
  ov.innerHTML = `<div class="panel"><header><div><h2>Замовлення</h2><h1 style="font-size:26px">${esc(o.name_a)} і ${esc(o.name_b)}</h1><div class="muted mono">${esc(o.id)}</div></div><div class="row">${o.archived_at ? '<span class="pill off">архів</span>' : ''}${pill(o.status)}<button class="btn ghost sm" id="x">Закрити</button></div></header>
  <div class="card sec"><h2>Оплата</h2><dl class="kv"><dt>Створено</dt><dd>${dt(o.created_at)}</dd><dt>Оплачено</dt><dd>${dt(o.paid_at)}</dd><dt>Сума</dt><dd><b>${money(o.amount_kop, o.currency)}</b>${o.discount_kop ? ` · за прайсом ${money(o.list_kop, o.currency)}, знижка ${money(o.discount_kop, o.currency)}${o.promo_code ? ` (<b>${esc(o.promo_code)}</b>)` : ''}` : ''}${o.currency === 'EUR' && o.inv_amount ? `<div class="muted">Рахунок у гривнях: ${UAH(o.inv_amount)} за курсом ${o.uah_rate ? Number(o.uah_rate).toFixed(2).replace('.', ',') : '—'} ₴/€</div>` : o.currency === 'EUR' && o.uah_rate ? `<div class="muted">≈ ${UAH(Math.round(o.amount_kop * o.uah_rate))} за курсом на момент замовлення</div>` : ''}</dd>
    ${o.refunded_at ? `<dt>Повернення</dt><dd>${money(o.refund_kop, o.currency)} · ${dt(o.refunded_at)} · ${({ manual: 'вручну', processing: 'Monobank: обробляється', success: 'Monobank: виконано' })[o.refund_status] || ''}</dd>` : ''}<dt>Інвойс</dt><dd class="mono">${esc(o.invoice_id || '—')}</dd><dt>Мова · країна</dt><dd>${esc(o.lang || 'uk')} · ${esc(o.country || 'UA')} · ${esc(o.tz || 'Europe/Kyiv')}</dd></dl></div>
  <div class="card sec"><h2>Контакти й дата старту</h2><div class="form2">
    <label class="f">Ім'я 1<input id="nA" value="${esc(o.name_a)}" maxlength="30"></label><label class="f">Пошта 1<input id="eA" type="email" value="${esc(o.email_a)}"></label>
    <label class="f">Ім'я 2<input id="nB" value="${esc(o.name_b)}" maxlength="30"></label><label class="f">Пошта 2<input id="eB" type="email" value="${esc(o.email_b)}"></label>
    <label class="f">Дата старту<input id="sd" type="date" value="${esc(cal ? cal.start_date : o.start_date)}" ${started ? 'disabled' : ''}></label><label class="f">Місто<input value="${esc(o.city)} · ${esc(o.region)}" disabled></label></div>
    <div class="muted">${started ? 'Календар уже стартував: дату змінити не можна, пошти можна.' : 'Після зміни пошти новому адресату автоматично надсилається лист із доступом, старий доступ закривається.'}</div>
    <div><button class="btn" id="sv">Зберегти зміни</button></div></div>
  ${cal ? `<div class="card sec"><h2>Календар</h2><dl class="kv"><dt>Старт</dt><dd>${dd(cal.start_date)} · ${cal.today ? `відкрито вікно ${cal.today} з 24` : 'ще не стартував'}</dd><dt>Розклад</dt><dd>${cal.ready ? 'складено' : 'чекаємо анкети'}</dd></dl>
    <div class="tw"><table style="min-width:0"><thead><tr><th>Учасник</th><th>Анкета</th><th class="num">Відкрито</th><th class="num">Виконано</th><th class="num">Відповідей</th></tr></thead><tbody>${r.members.map(m => `<tr><td>${esc(m.suggested_name)}<div class="muted">${esc(m.email)}</div></td><td>${m.survey_done ? '<span class="pill on">заповнена</span>' : '<span class="pill off">ні</span>'}</td><td class="num">${m.opened_days}</td><td class="num">${m.tasks_done}</td><td class="num">${m.answers_count}</td></tr>`).join('')}</tbody></table></div>
    <div class="muted">Зміст анкет і відповідей клієнтів адмінці недоступний (обіцяно в політиці конфіденційності).</div></div>` : '<div class="card muted">Календар ще не створено (немає оплати).</div>'}
  <div class="card sec" id="oc"><h2>Листи клієнту</h2><div class="muted">Завантаження…</div></div>
  <div class="card sec"><h2>Дії</h2><div class="row">
    ${cal ? '<button class="btn ghost" id="rs">Надіслати доступ ще раз (обом)</button>' : ''}
    ${o.paid_at && !o.refunded_at ? '<button class="btn danger" id="rf">Оформити повернення…</button>' : ''}
    ${r.threads.length ? `<a class="btn ghost" href="#/inbox" id="gi" style="text-decoration:none">Листування (${r.threads.length})</a>` : ''}
    ${o.archived_at ? '<button class="btn ghost" id="oarc" type="button">Повернути з архіву</button><button class="btn danger" id="odel" type="button">Видалити назавжди…</button>' : '<button class="btn ghost" id="oarc" type="button">В архів (тестове чи непотрібне)</button>'}</div>
    ${o.archived_at ? `<div class="muted">В архіві з ${dt(o.archived_at)}: замовлення не рахується у звітах і не отримує нагадувань.</div>` : ''}
    ${o.paid_at && !o.refunded_at ? `<div id="rfbox" hidden class="sec"><div class="form2"><label class="f">Сума повернення, ${o.currency === 'EUR' ? '€' : 'грн'}<input id="ra" type="number" step="0.01" min="0" max="${o.amount_kop / 100}" value="${o.amount_kop / 100}"></label><label class="f">Коментар<input id="rn" maxlength="300"></label></div>
      <label class="f">Спосіб<select id="rm"><option value="auto">Автоматично через Monobank</option><option value="manual">Я вже повернув(ла) кошти вручну (лише відмітка)</option></select></label>
      <label class="row muted"><input type="checkbox" id="rv" checked> закрити клієнтам доступ до календаря</label>
      <label class="row muted"><input type="checkbox" id="rnf" checked> надіслати покупцю лист про повернення</label>
      <div class="muted">«Автоматично»: гроші повертає Monobank на картку покупця (до 3 робочих днів, залежить також від банку клієнта). Повернення в день оплати комісію банку не стягує, в інший день комісію банк не повертає. Для безкоштовних замовлень API не викликається.</div><div><button class="btn danger" id="rfok">Підтвердити повернення</button></div></div>` : ''}</div>
  <div class="card sec"><h2>Нотатка менеджера</h2><textarea id="nt" rows="3" maxlength="1000">${esc(o.note || '')}</textarea><div><button class="btn ghost sm" id="ns">Зберегти нотатку</button></div></div>
  <div class="card sec"><h2>Історія дій</h2><div class="log">${r.log.map(l => `<div>${dt(l.at)} · ${esc(l.admin_email)} · <b>${esc(l.action)}</b> ${l.detail ? esc(l.detail) : ''}</div>`).join('') || 'Дій ще не було'}</div></div></div>`;
  document.body.appendChild(ov);
  $('#x', ov).onclick = close;
  if (window.ADM.orderMails) window.ADM.orderMails($('#oc', ov), id);
  const act = async (action, body, ok) => { try { const res = await api('POST', `/api/admin/orders/${id}/${action}`, body); toast(ok(res)); close(); route().then(() => openOrder(id)); } catch (e) { toast(errText(e)); } };
  $('#sv', ov).onclick = () => act('update', { nameA: $('#nA', ov).value, nameB: $('#nB', ov).value, emailA: $('#eA', ov).value, emailB: $('#eB', ov).value, ...(started ? {} : { startDate: $('#sd', ov).value }) }, res => res.changed.length ? 'Збережено' : 'Змін немає');
  const rs = $('#rs', ov); if (rs) rs.onclick = () => confirm('Надіслати обом новий лист із доступом?') && act('resend', {}, () => 'Листи надіслано');
  $('#oarc', ov).onclick = () => act('archive', { archived: !o.archived_at }, res => res.archived ? 'Замовлення в архіві' : 'Повернено з архіву');
  const od = $('#odel', ov); if (od) od.onclick = async () => {
    if (!confirm(`Видалити замовлення назавжди? Разом із ним зникнуть календар, відповіді учасників і листи в журналі.${o.paid_at && !o.refunded_at && o.amount_kop > 0 ? ' Замовлення оплачене: якщо це справжня оплата, краще залишити його в архіві, щоб не втратити дані для обліку.' : ''}`)) return;
    try { await api('POST', `/api/admin/orders/${id}/delete`, {}); toast('Замовлення видалено'); close(); route(); } catch (e) { toast(errText(e)); }
  };
  const rf = $('#rf', ov); if (rf) { rf.onclick = () => { $('#rfbox', ov).hidden = false; };
    $('#rfok', ov).onclick = () => confirm('Позначити замовлення як повернене?') && act('refund', { amountKop: Math.round(Number($('#ra', ov).value) * 100), note: $('#rn', ov).value, revoke: $('#rv', ov).checked, notify: $('#rnf', ov).checked, method: $('#rm', ov).value }, res => res.method === 'api' ? 'Повернення відправлено в Monobank' : 'Повернення відмічено'); }
  $('#ns', ov).onclick = () => act('note', { note: $('#nt', ov).value }, () => 'Нотатку збережено');
  const gi = $('#gi', ov); if (gi) gi.onclick = () => { inboxSel = r.threads[0].email; close(); };
}

/* ---------- Клієнти ---------- */
async function customers() {
  $('#main').innerHTML = `<div class="top"><div><h2>Контакти</h2><h1>Клієнти</h1></div><a class="btn ghost" href="/api/admin/customers.csv">Експорт CSV</a></div>
  <input id="cq" type="search" placeholder="Пошук за поштою або іменем" style="width:100%;max-width:420px;margin-bottom:14px"><div id="cl"></div>`;
  const load = async q => { const r = await api('GET', '/api/admin/customers?q=' + encodeURIComponent(q));
    $('#cl').innerHTML = `<div class="tw"><table><thead><tr><th>Пошта</th><th>Імена</th><th>Міста</th><th class="num">Замовлень</th><th class="num">Сплачено</th><th>Останнє</th></tr></thead><tbody>${r.customers.map(c => `<tr class="click" data-q="${esc(c.email)}"><td>${esc(c.email)}</td><td>${esc(c.names)}</td><td>${esc(c.cities)}</td><td class="num">${c.orders}</td><td class="num">${UAH(c.paid_kop)}</td><td class="mono">${dt(c.last_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Нічого не знайдено</td></tr>'}</tbody></table></div>`;
    $('#cl').onclick = e => { const tr = e.target.closest('tr[data-q]'); if (tr) { ordersState = { status: 'all', q: tr.dataset.q, page: 1 }; location.hash = '#/orders'; } }; };
  let tm; $('#cq').oninput = e => { clearTimeout(tm); tm = setTimeout(() => load(e.target.value), 300); };
  await load('');
}

/* ---------- Промокоди ---------- */
async function promos() {
  const r = await api('GET', '/api/admin/promos');
  $('#main').innerHTML = `<div class="top"><div><h2>Маркетинг</h2><h1>Промокоди</h1></div></div>
  <div class="card sec" style="margin-bottom:16px"><h2>Новий промокод</h2><form id="pf" class="form2">
    <label class="f">Код<input id="pc" required maxlength="32" placeholder="WELCOME" style="text-transform:uppercase"></label>
    <label class="f">Тип<select id="pt"><option value="percent">Відсоток, %</option><option value="fixed">Сума, грн</option></select></label>
    <label class="f">Значення<input id="pv" type="number" step="0.01" min="1" required placeholder="20"></label>
    <label class="f">Ліміт використань<input id="pm" type="number" min="1" placeholder="без ліміту"></label>
    <label class="f">Діє до<input id="pe" type="date"></label>
    <label class="f">Примітка (джерело)<input id="pl" maxlength="80" placeholder="Блогер Анна"></label></form>
    <div class="muted">100% знижка створює безкоштовний календар (без оплати). Поточна ціна: ${r.price} ₴.</div><div><button class="btn" id="pk">Створити</button></div></div>
  <div class="tw"><table><thead><tr><th>Код</th><th>Знижка</th><th class="num">Використано</th><th class="num">Оплачено</th><th class="num">Знижок на</th><th class="num">Виручка</th><th>Діє до</th><th>Статус</th><th></th></tr></thead><tbody>${r.promos.map(p => `<tr><td><b>${esc(p.code)}</b>${p.label ? `<div class="muted">${esc(p.label)}</div>` : ''}</td><td>${p.type === 'percent' ? p.value + '%' : UAH(p.value)}</td>
    <td class="num">${p.used_count}${p.max_uses ? ' / ' + p.max_uses : ''}</td><td class="num">${p.paid_orders}</td><td class="num">${UAH(p.discount_kop)}</td><td class="num">${UAH(p.revenue_kop)}</td><td class="mono">${p.expires_at ? dt(p.expires_at).slice(0, 8) : '—'}</td>
    <td><span class="pill ${p.active ? 'on' : 'off'}">${p.active ? 'активний' : 'вимкнений'}</span></td><td><div class="row"><button class="btn ghost sm" data-a="toggle" data-id="${p.id}" data-on="${p.active}">${p.active ? 'Вимкнути' : 'Увімкнути'}</button><button class="btn ghost sm" data-a="max" data-id="${p.id}">Ліміт</button><button class="btn ghost sm" data-a="exp" data-id="${p.id}">Термін</button></div></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Промокодів ще немає</td></tr>'}</tbody></table></div>`;
  $('#pk').onclick = async () => {
    const f = $('#pf'); if (!f.reportValidity()) return;
    try { await api('POST', '/api/admin/promos', { code: $('#pc').value, type: $('#pt').value, value: Number($('#pv').value), maxUses: $('#pm').value || null, expiresAt: $('#pe').value ? $('#pe').value + 'T23:59:59' : null, label: $('#pl').value }); toast('Промокод створено'); promos(); } catch (e) { toast(errText(e)); }
  };
  $('#main').onclick = async e => { const b = e.target.closest('[data-a]'); if (!b) return; const id = b.dataset.id; let body;
    if (b.dataset.a === 'toggle') body = { active: b.dataset.on !== '1' };
    else if (b.dataset.a === 'max') { const v = prompt('Новий ліміт використань (порожньо = без ліміту):'); if (v === null) return; body = { maxUses: v.trim() === '' ? null : Number(v) }; }
    else { const v = prompt('Діє до (РРРР-ММ-ДД, порожньо = безстроково):'); if (v === null) return; body = { expiresAt: v.trim() ? v.trim() + 'T23:59:59' : null }; }
    try { await api('POST', '/api/admin/promos/' + id, body); toast('Збережено'); promos(); } catch (er) { toast(errText(er)); } };
}

/* ---------- Підтримка ---------- */
async function inbox() {
  const r = await api('GET', '/api/admin/inbox?status=' + inboxFilter);
  $('#main').innerHTML = `<div class="top"><div><h2>support@reeadvent.fun</h2><h1>Підтримка</h1></div><div class="seg" id="isg">${[['open', 'Відкриті'], ['closed', 'Закриті'], ['all', 'Усі']].map(([v, t]) => `<button data-f="${v}" class="${inboxFilter === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
  <div class="inbox"><div class="threads">${r.threads.map(t => `<div class="thread ${t.unread ? 'unread' : ''} ${inboxSel === t.email ? 'on' : ''}" data-e="${esc(t.email)}"><div class="n"><span>${esc(t.name || t.email)}</span></div><div class="muted">${esc(t.last_subject || '')}</div><div class="muted" style="font-size:12px">${dt(t.last_at)}${t.orders ? ` · замовлень: ${t.orders}` : ''}</div></div>`).join('') || '<div class="empty">Листів немає</div>'}</div><div id="conv"><div class="empty card">Оберіть листування зліва</div></div></div>`;
  $('#isg').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { inboxFilter = b.dataset.f; inboxSel = null; inbox(); } };
  const open = async email => {
    inboxSel = email; document.querySelectorAll('.thread').forEach(x => x.classList.toggle('on', x.dataset.e === email));
    const v = await api('GET', '/api/admin/inbox/thread/' + encodeURIComponent(email)); const th = $(`.thread[data-e="${CSS.escape(email)}"]`); if (th) th.classList.remove('unread'); refreshBadge();
    $('#conv').innerHTML = `<div class="card sec"><div class="row" style="justify-content:space-between"><div><b>${esc(v.thread.name || '')}</b> <span class="muted">${esc(email)}</span> <span class="pill ${v.thread.status}">${v.thread.status === 'open' ? 'відкрите' : 'закрите'}</span></div><button class="btn ghost sm" id="ts">${v.thread.status === 'open' ? 'Закрити' : 'Відкрити знову'}</button></div>
      ${v.orders.length ? `<div class="row">${v.orders.map(o => `<a href="#/orders" class="pill ${o.status}" data-oid="${o.id}" style="text-decoration:none">${esc(o.name_a)}/${esc(o.name_b)} · ${UAH(o.amount_kop)} · ${STATUS[o.status]}</a>`).join('')}</div>` : '<div class="muted">Замовлень із цією поштою немає</div>'}
      <div class="msgs">${v.messages.map(m => `<div class="msg ${m.direction}"><small>${m.direction === 'out' ? 'Ви (' + esc(m.from_name || '') + ')' : esc(m.from_name || m.from_email)} · ${dt(m.created_at)}<br><b>${esc(m.subject)}</b></small>${esc(m.body_text)}</div>`).join('')}</div>
      <textarea id="rb" rows="5" placeholder="Ваша відповідь…" maxlength="5000"></textarea><div class="row"><button class="btn" id="rsd">Надіслати</button><label class="row muted"><input type="checkbox" id="rcl"> закрити після відповіді</label></div></div>`;
    $('#conv').querySelectorAll('[data-oid]').forEach(a => a.onclick = ev => { ev.preventDefault(); openOrder(a.dataset.oid); });
    $('#ts').onclick = async () => { try { await api('POST', `/api/admin/inbox/thread/${encodeURIComponent(email)}/status`, { status: v.thread.status === 'open' ? 'closed' : 'open' }); inbox(); } catch (e) { toast(errText(e)); } };
    $('#rsd').onclick = async () => { $('#rsd').disabled = true; try { await api('POST', `/api/admin/inbox/thread/${encodeURIComponent(email)}/reply`, { body: $('#rb').value, close: $('#rcl').checked }); toast('Відповідь надіслано'); if ($('#rcl').checked) inbox(); else open(email); } catch (e) { toast(errText(e)); $('#rsd').disabled = false; } };
  };
  $('.threads').onclick = e => { const t = e.target.closest('.thread'); if (t) open(t.dataset.e); };
  if (inboxSel) open(inboxSel).catch(() => {});
}

/* ---------- Налаштування (відсотки для дашборда) ---------- */

/* ---------- Instagram: редактор публікацій (перегляд, підпис, розклад, порядок) ---------- */
let igSel = null, igSlide = 0, igTab = 'post', igMove = null;
const igMedia = f => f.startsWith('/') ? f : '/social/' + encodeURIComponent(f);
const dtLocal = t => t ? new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
const igTitle = p => p.title || String(p.caption || '').split('\n')[0].slice(0, 48);
const igKind = p => p.type === 'REELS' ? 'Reel' : p.type === 'CAROUSEL' ? 'Карусель · ' + p.files.length : p.type === 'STORY' ? 'Сторіс · фото' : p.type === 'STORY_VIDEO' ? 'Сторіс · відео' : 'Фото';
const isVid = p => p.type === 'REELS' || p.type === 'STORY_VIDEO';
const igCaptionHtml = c => String(c).split(/(#[^\s#]+)/).map(t => t.length > 1 && t[0] === '#' ? `<span style="color:#7aa7ff">${esc(t)}</span>` : esc(t)).join('').replace(/\n/g, '<br>');
/** Підказки проти повторів: та сама головна сцена в сусідніх публікаціях або три однакові формати поспіль. */
const igRepeats = (list, i) => { const x = list[i], a = list[i - 1], b = list[i - 2], w = []; if (a && x.scene && a.scene === x.scene) w.push('та сама сцена, що в попередній'); if (a && b && x.type === a.type && x.type === b.type) w.push('третій однаковий формат поспіль'); return w; };
function igMediaHtml(p) {
  if (p.format === 'story') return `<div style="position:relative;background:#000;width:100%;aspect-ratio:9/16;max-height:500px;margin:0 auto">${p.type === 'STORY_VIDEO' ? `<video src="${igMedia(p.files[0])}" poster="${p.cover ? igMedia(p.cover) : ''}" controls playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain;display:block"></video>` : `<img src="${igMedia(p.files[0])}" alt="" style="width:100%;height:100%;object-fit:contain;display:block">`}<div style="position:absolute;left:10px;right:10px;top:8px;height:3px;border-radius:2px;background:#ffffff55;pointer-events:none"><i style="display:block;width:35%;height:100%;background:#fff;border-radius:2px"></i></div></div>`;
  if (p.type === 'REELS') return `<video src="${igMedia(p.files[0])}" poster="${p.cover ? igMedia(p.cover) : ''}" controls playsinline preload="metadata" style="width:100%;display:block;background:#000;aspect-ratio:9/16;max-height:420px;object-fit:contain"></video>`;
  const n = p.files.length, i = Math.min(igSlide, n - 1);
  return `<div style="position:relative;background:#000"><img src="${igMedia(p.files[i])}" alt="" style="width:100%;display:block;aspect-ratio:4/5;object-fit:cover">${n > 1 ? `<button type="button" class="btn sm" id="igprev" style="position:absolute;left:6px;top:45%">‹</button><button type="button" class="btn sm" id="ignext" style="position:absolute;right:6px;top:45%">›</button><div style="position:absolute;right:8px;top:8px;background:#000a;color:#fff;border-radius:10px;padding:2px 8px;font-size:12px">${i + 1}/${n}</div><div style="text-align:center;position:absolute;left:0;right:0;bottom:6px;color:#fff;font-size:18px;letter-spacing:3px">${p.files.map((_, k) => k === i ? '●' : '○').join('')}</div>` : ''}</div>`;
}
function renderIgPlan(pb, ig) {
  const host = $('#igplan'); if (!host) return;
  if (!pb || !pb.posts || !pb.posts.length) { host.innerHTML = '<h2>Публікації Instagram</h2><div class="muted">Список постів поки недоступний (файл /social/posts.json). Спробуйте оновити сторінку після розгортання сайту.</div>'; return; }
  const P = pb.posts, now = Date.now(), V = P.filter(x => (x.format || 'post') === igTab), nPost = P.filter(x => (x.format || 'post') === 'post').length, nStory = P.length - nPost;
  if (!V.length) igTab = 'post';
  const list = P.filter(x => (x.format || 'post') === igTab);
  if (!list.find(x => x.id === igSel)) { igSel = (list.find(x => !x.complete) || list[0]).id; igSlide = 0; }
  const p = list.find(x => x.id === igSel), story = p.format === 'story';
  const hasFb = !!pb.fbPage, plat = (on, d, name) => on ? (d ? `<span style="color:#27ae60" title="${esc(fdate(d.at))}">${name} ✅</span>` : `<span class="muted">${name} ⏳</span>`) : `<span class="muted" style="text-decoration:line-through">${name}</span>`;
  const status = x => `${plat(x.ig, x.done, 'IG')}${hasFb ? ' ' + plat(x.fb, x.fbDone, 'FB') : ''} · ${x.complete ? '<span style="color:#27ae60">готово</span>' : x.at ? `<span style="color:${x.at < now ? '#eb5757' : '#2f80ed'}">🕒 ${esc(fdate(x.at))}</span>` : '<span class="muted">без дати</span>'}`;
  const tabBtn = (k, label, n) => `<button type="button" class="btn ${igTab === k ? '' : 'ghost'} sm igtab" data-t="${k}">${label} (${n})</button>`;
  // ---- календар публікацій: тижні з понеділка, перетягування міняє пости місцями разом із часом ----
  const DAY = 864e5, sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }, mon = t => { const d = new Date(sod(t)); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
  const hm = t => new Date(t).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  const pend = list.filter(x => !x.complete), dated = list.filter(x => x.at), undated = pend.filter(x => !x.at);
  const chrono = pend.filter(x => x.at).sort((a, b) => a.at - b.at), warn = new Map(chrono.map((x, i) => [x.id, igRepeats(chrono, i)]));
  const from = mon(Math.min(now, ...dated.map(x => x.at))), to = mon(Math.max(now, ...dated.map(x => x.at))) + 14 * DAY, weeks = Math.min(16, Math.round((to - from) / (7 * DAY)));
  const chip = x => { const over = !x.complete && !!x.at && x.at < now, w = warn.get(x.id) || []; return `<div class="pchip ${x.complete ? 'done' : over ? 'over' : ''} ${x.id === igSel ? 'sel' : ''} ${igMove === x.id ? 'moving' : ''}" data-pid="${esc(x.id)}" ${x.complete ? '' : 'draggable="true"'} title="${esc(igTitle(x) + ' · ' + igKind(x) + (w.length ? ' · ⚠ ' + w.join(', ') : ''))}"><img src="${igMedia(isVid(x) ? x.cover : x.files[0])}" alt=""><span><b>${x.at ? hm(x.at) : '—'}</b>${x.complete ? ' ✓' : ''}${w.length ? ' <i class="pw">⚠</i>' : ''}<small>${esc(igTitle(x))}</small></span></div>`; };
  let cal = ''; const today = sod(now);
  for (let wk = 0; wk < weeks; wk++) for (let k = 0; k < 7; k++) {
    const d0 = from + (wk * 7 + k) * DAY, d1 = d0 + DAY, dd = new Date(d0), items = dated.filter(x => x.at >= d0 && x.at < d1).sort((a, b) => a.at - b.at);
    cal += `<div class="pday ${d0 === today ? 'today' : ''} ${d0 < today ? 'past' : ''}" data-day="${d0}"><div class="pdh">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'][k]} <b>${dd.getDate()}</b>${dd.getDate() === 1 || (wk === 0 && k === 0) ? ' ' + dd.toLocaleDateString('uk-UA', { month: 'short' }) : ''}</div>${items.map(chip).join('')}</div>`;
  }
  host.innerHTML = `<h2>Публікації Instagram і Facebook</h2>
  <div class="muted">Календар публікацій (ваш місцевий час). <b>Перетягніть</b> пост на інший пост, щоб поміняти їх місцями разом із часом, або на порожній день, щоб перенести на цей день (час доби зберігається). На телефоні: оберіть пост і натисніть «Перемістити». Червоні ще не вийшли, хоча час минув; «⚠» означає повтор сцени чи формату поспіль.</div>
  <div class="row" style="gap:8px;flex-wrap:wrap">${tabBtn('post', 'Пости й Reels', nPost)}${nStory ? tabBtn('story', 'Сторіс', nStory) : ''}
   <label class="muted" style="display:flex;gap:6px;align-items:center;margin-left:auto"><input type="checkbox" id="igauto" ${pb.auto ? 'checked' : ''}> Автопублікація ${ig && ig.connected ? '' : '(спершу підключіть Instagram)'}</label></div>
  ${igMove ? `<div class="pmove">Переміщення «${esc(igTitle(list.find(x => x.id === igMove) || {}))}»: торкніться поста, з яким поміняти, або дня, куди перенести. <button type="button" class="btn ghost sm" id="igmovex">Скасувати</button></div>` : ''}
  ${pb.err ? `<div class="muted" style="color:#eb5757">Остання помилка (${esc(fdate(pb.err.at))}, ${esc(pb.err.id)}): ${esc(pb.err.error)}</div>` : ''}
  <div class="pcal"><div class="pwk">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map(x => `<div>${x}</div>`).join('')}</div><div class="pgrid">${cal}</div></div>
  <div class="pqueue" data-day="none"><b>Без дати (${undated.length})</b> <span class="muted" style="font-size:12px">перетягніть сюди, щоб зняти дату; автопілот черги розставить їх сам</span><div class="pql">${undated.map(chip).join('') || '<span class="muted" style="font-size:12px">усі пости заплановано</span>'}</div></div>
  <details class="pspread"><summary class="muted">Розставити всі неопубліковані за розкладом…</summary><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><label class="f" style="margin:0">Перша публікація<input type="datetime-local" id="igsp0"></label><label class="f" style="margin:0">Інтервал<select id="igspn">${[[0.25, 'кожні 6 годин'], [0.5, 'кожні 12 годин'], [1, 'щодня'], [2, 'через день'], [3, 'кожні 3 дні'], [7, 'раз на тиждень']].map(([v, t]) => `<option value="${v}" ${v === 1 ? 'selected' : ''}>${t}</option>`).join('')}</select></label><button type="button" class="btn ghost sm" id="igspread">Призначити час за порядком</button></div></details>
  <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;margin-top:6px">
    <div style="flex:1 1 100%;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="muted" style="font-size:12px;letter-spacing:.08em;text-transform:uppercase">Обрано: ${esc(igKind(p))} · ${status(p)}</div>${p.complete ? '' : `<button type="button" class="btn ghost sm" id="igmove">Перемістити…</button>`}</div>
   <div style="flex:1 1 330px;min-width:280px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px">
    <div class="card" style="padding:0;overflow:hidden;max-width:${story ? 260 : 380}px;background:#0e0f14;color:#f3efe6">
     <div style="display:flex;gap:8px;align-items:center;padding:10px 12px"><div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#d6b46a,#8a6a2a)"></div><b style="font-size:13px">reeadvent</b><span style="margin-left:auto;opacity:.6">${story ? '24 год' : '···'}</span></div>
     ${igMediaHtml(p)}
     ${story ? '' : `<div style="padding:10px 12px;font-size:13px;line-height:1.45;max-height:230px;overflow:auto"><b>reeadvent</b> <span id="igprevcap">${igCaptionHtml(p.caption)}</span></div>`}</div>
    ${story ? `<div class="muted">Сторіс не має підпису: текст уже на картинці. Вона живе 24 години. Посилання, опитування й інші стікери API не підтримує: додайте їх вручну в застосунку Instagram, якщо потрібно.</div>` : `<label class="f">Підпис (${p.complete ? 'опубліковано, лише перегляд' : 'можна редагувати'}${hasFb ? '; у Facebook рядок «Посилання в шапці профілю» замінюється на reeadvent.fun' : ''})<textarea id="igcap" rows="9" ${p.complete ? 'disabled' : ''}>${esc(p.caption)}</textarea></label>
    <div class="muted" id="igcnt"></div>`}
    ${p.complete ? `<div class="muted">Опубліковано${p.done ? ` в Instagram ${esc(fdate(p.done.at))}${p.done.link ? ` · <a href="${esc(p.done.link)}" target="_blank" rel="noopener">відкрити</a>` : ''}` : ''}${p.fbDone ? ` · у Facebook ${esc(fdate(p.fbDone.at))}${p.fbDone.link ? ` · <a href="${esc(p.fbDone.link)}" target="_blank" rel="noopener">відкрити</a>` : ''}` : ''}</div>` : `
    <div class="row" style="gap:16px"><span class="muted">Куди публікувати:</span><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="igt-ig" ${p.ig ? 'checked' : ''} ${p.done ? 'disabled' : ''}> Instagram${p.done ? ' ✅' : ''}</label>${hasFb ? `<label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="igt-fb" ${p.fb ? 'checked' : ''} ${p.fbDone ? 'disabled' : ''}> Facebook${p.fbDone ? ' ✅' : ''}</label>` : ''}</div>
    <label class="f">Дата й час публікації<input type="datetime-local" id="igat" value="${dtLocal(p.at)}"></label>
    <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn" id="igsave" type="button">Зберегти</button>${story ? '' : `<button class="btn ghost" id="igreset" type="button" ${p.edited ? '' : 'disabled'}>Стандартний підпис</button>`}<button class="btn ghost" id="igclear" type="button" ${p.at ? '' : 'disabled'}>Зняти дату</button><button class="btn ghost" id="igpub" type="button" ${ig && ig.connected ? '' : 'disabled'}>Опублікувати зараз</button></div>
    <div class="muted">${isVid(p) ? 'Відео обробляється до 3 хвилин, під час публікації не закривайте сторінку.' : 'Публікація займає до хвилини.'}</div>`}
   </div></div>`;
  const apply = x => { Object.assign(pb, x); renderIgPlan(pb, ig); };
  const post = async (path, body, okMsg) => { try { const x = await api('POST', '/api/admin/instagram/' + path, body); if (x.ok === false) { toast(x.error || 'Не вийшло'); return null; } if (okMsg) toast(okMsg); apply(x); return x; } catch (e) { toast(errText(e)); return null; } };
  if (!story) { const count = () => { const c = $('#igcap').value, tags = (c.match(/#[^\s#]+/g) || []).length; $('#igcnt').innerHTML = `${c.length}/2200 символів · ${tags}/30 хештегів` + (c.length > 2200 || tags > 30 ? ' <b style="color:#eb5757">перевищено</b>' : ''); $('#igprevcap').innerHTML = igCaptionHtml(c); }; count(); $('#igcap').oninput = count; }
  host.querySelectorAll('.igtab').forEach(b => b.onclick = () => { igTab = b.dataset.t; igSel = null; igSlide = 0; renderIgPlan(pb, ig); });
  // календар: вибір, перетягування, переміщення на телефоні
  const pick = id => { igSel = id; igSlide = 0; renderIgPlan(pb, ig); };
  const dropOn = async (id, el) => {
    igMove = null; const src = list.find(x => x.id === id); if (!src || src.complete || !el) return renderIgPlan(pb, ig);
    const tgt = el.closest('.pqueue') ? null : el.closest('.pchip');   // у «Без дати» пост просто втрачає дату
    if (tgt && tgt.dataset.pid !== id) { const t = list.find(x => x.id === tgt.dataset.pid); if (t && t.complete) return toast('Опублікований пост переносити не можна'); return post('plan', { swap: [id, tgt.dataset.pid] }, 'Поміняли місцями'); }
    const cell = el.closest('[data-day]'); if (!cell) return renderIgPlan(pb, ig);
    if (cell.dataset.day === 'none') return post('plan', { id, at: null }, 'Дату знято');
    const d = new Date(+cell.dataset.day), base = src.at ? new Date(src.at) : null; d.setHours(base ? base.getHours() : (story ? 10 : 19), base ? base.getMinutes() : 0, 0, 0);
    if (d.getTime() < now - 6e4) return toast('Цей час уже минув: оберіть сьогодні пізніше або майбутній день');
    return post('plan', { id, at: d.getTime() }, 'Перенесено на ' + d.toLocaleString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }));
  };
  host.querySelectorAll('.pchip').forEach(el => {
    el.onclick = e => { e.stopPropagation(); if (igMove && igMove !== el.dataset.pid) return dropOn(igMove, el); pick(el.dataset.pid); };
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', el.dataset.pid); e.dataTransfer.effectAllowed = 'move'; el.classList.add('moving'); };
    el.ondragend = () => el.classList.remove('moving');
  });
  host.querySelectorAll('.pday, .pqueue').forEach(el => {
    el.ondragover = e => { e.preventDefault(); el.classList.add('drop'); }; el.ondragleave = () => el.classList.remove('drop');
    el.ondrop = e => { e.preventDefault(); el.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (id) dropOn(id, e.target); };
    el.onclick = e => { if (igMove && !e.target.closest('.pchip')) dropOn(igMove, el); };
  });
  if ($('#igmove')) $('#igmove').onclick = () => { igMove = p.id; renderIgPlan(pb, ig); host.querySelector('.pcal').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  if ($('#igmovex')) $('#igmovex').onclick = () => { igMove = null; renderIgPlan(pb, ig); };
  if ($('#igprev')) { $('#igprev').onclick = () => { igSlide = (igSlide + p.files.length - 1) % p.files.length; renderIgPlan(pb, ig); }; $('#ignext').onclick = () => { igSlide = (igSlide + 1) % p.files.length; renderIgPlan(pb, ig); }; }
  const at = () => { const v = $('#igat').value; return v ? new Date(v).getTime() : null; };
  const tg = () => ({ ig: $('#igt-ig').checked, ...($('#igt-fb') ? { fb: $('#igt-fb').checked } : {}) });
  const cap = () => story ? {} : { caption: $('#igcap').value };
  if ($('#igsave')) $('#igsave').onclick = () => post('plan', { id: p.id, ...cap(), at: at(), ...tg() }, 'Збережено');
  if ($('#igreset')) $('#igreset').onclick = () => { if (confirm('Повернути стандартний підпис?')) post('plan', { id: p.id, caption: null }, 'Підпис скинуто'); };
  if ($('#igclear')) $('#igclear').onclick = () => post('plan', { id: p.id, at: null }, 'Дату знято');
  if ($('#igpub')) $('#igpub').onclick = async () => { if (!confirm(story ? 'Опублікувати цю сторіс зараз?' : 'Опублікувати цей пост зараз?')) return; const b = $('#igpub'); b.disabled = true; b.textContent = isVid(p) ? 'Публікуємо… (до 3 хв)' : 'Публікуємо…'; try { const s0 = await api('POST', '/api/admin/instagram/plan', { id: p.id, ...cap(), ...tg() }); Object.assign(pb, s0); const x = await api('POST', '/api/admin/instagram/publish', { id: p.id }); toast(x.ok ? 'Опубліковано ✅' : 'Не вийшло: ' + x.error); Object.assign(pb, x); } catch (e) { toast(errText(e)); } renderIgPlan(pb, ig); };
  $('#igspread').onclick = () => { const v = $('#igsp0').value; if (!v) return toast('Оберіть дату й час першої публікації'); post('plan', { spread: true, format: igTab, start: new Date(v).getTime(), everyDays: +$('#igspn').value || 1 }, 'Час призначено'); };
  $('#igauto').onchange = async () => { try { const x = await api('POST', '/api/admin/instagram/auto', { on: $('#igauto').checked }); Object.assign(pb, x); toast($('#igauto').checked ? 'Автопублікацію ввімкнено' : 'Автопублікацію вимкнено'); } catch (e) { toast(errText(e)); } };
}
/* ---------- Реклама: ID трекінгу, UTM-посилання, витрати, результати за джерелами ---------- */
const uah = kop => (kop / 100).toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴', usd = c => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
async function renderAds(days) {
  const host = $('#adscard'); if (!host) return;
  let d; try { d = await api('GET', '/api/admin/ads?days=' + days); } catch (e) { host.innerHTML = '<h2>Реклама</h2><div class="muted">Не вдалося завантажити: ' + esc(errText(e)) + '</div>'; return; }
  const c = d.config, rp = d.report, t = rp.totals, today = new Date().toISOString().slice(0, 10), pct = c.budget ? Math.min(100, Math.round(rp.spentAllCents / 100 / c.budget * 100)) : 0;
  const status = (c.meta ? 'піксель Meta ✅' : 'піксель Meta ⏳') + ' · ' + (c.ga4 ? 'GA4 ✅' : 'GA4 ⏳') + ' · ' + (c.gads ? 'Google Ads ✅' : 'Google Ads ⏳');
  host.innerHTML = `<h2>Реклама</h2>
  ${d.migrate ? '<div class="muted" style="color:#eb5757">Потрібне оновлення бази: виконайте SQL із файлу docs/d1-console-0010.sql у Cloudflare D1 Console (по одному рядку). До цього звіти й витрати не працюють, але ID відстеження можна вже зберегти.</div>' : ''}
  <div class="muted">Витрачено за весь час: <b>${usd(rp.spentAllCents)}</b> із бюджету <b>$${c.budget}</b> (${pct}%). Відстеження: ${status}.</div>
  <div style="height:8px;border-radius:6px;background:#23252f;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--accent)"></div></div>
  <h3 style="margin:14px 0 4px;font-size:15px">Відстеження (ID із кабінетів, не токени)</h3>
  <div class="row" style="flex-wrap:wrap;gap:10px">
   <label class="f" style="margin:0">ID піксела Meta<input id="tkm" inputmode="numeric" value="${esc(c.meta)}" placeholder="15–16 цифр"></label>
   <label class="f" style="margin:0">GA4 (Measurement ID)<input id="tkg" value="${esc(c.ga4)}" placeholder="G-XXXXXXXXXX"></label>
   <label class="f" style="margin:0">Google Ads ID<input id="tka" value="${esc(c.gads)}" placeholder="AW-1234567890"></label>
   <label class="f" style="margin:0">Мітка конверсії Google Ads<input id="tkl" value="${esc(c.gads_label)}" placeholder="AbC-dEfGhIj"></label>
   <label class="f" style="margin:0">Бюджет, $<input id="tkb" type="number" min="0" value="${c.budget}" style="width:100px"></label></div>
  <div class="row"><button class="btn" id="tks" type="button">Зберегти відстеження</button><span class="muted">Порожнє поле вимикає інструмент. Банер згоди з'являється лише коли задано хоча б один ID.</span></div>
  <h3 style="margin:14px 0 4px;font-size:15px">Посилання з мітками (UTM)</h3>
  <div class="row" style="flex-wrap:wrap;gap:10px"><label class="f" style="margin:0">Джерело<select id="utms">${d.channels.map(x => `<option>${x}</option>`).join('')}</select></label><label class="f" style="margin:0">Кампанія<input id="utmc" value="start_ua" placeholder="start_ua"></label><label class="f" style="margin:0">Креатив / блогер<input id="utmk" placeholder="reel1"></label></div>
  <div class="row"><input id="utmo" readonly style="flex:1;min-width:260px"><button class="btn ghost" id="utmcp" type="button">Скопіювати</button></div>
  <h3 style="margin:14px 0 4px;font-size:15px">Витрати</h3>
  <div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-end"><label class="f" style="margin:0">Дата<input id="spd" type="date" value="${today}"></label><label class="f" style="margin:0">Канал<select id="spch">${d.channels.map(x => `<option>${x}</option>`).join('')}</select></label><label class="f" style="margin:0">Кампанія<input id="spc" placeholder="start_ua"></label><label class="f" style="margin:0">Сума, $<input id="spa" type="number" step="0.01" min="0" style="width:100px"></label><button class="btn" id="spadd" type="button">Додати</button></div>
  ${d.spend.length ? `<div class="muted">${d.spend.slice(0, 12).map(x => `${esc(x.day)} · ${esc(x.channel)}${x.campaign ? ' / ' + esc(x.campaign) : ''} · <b>${usd(x.amount_cents)}</b> <a href="#" class="spdel" data-id="${x.id}">видалити</a>`).join('<br>')}${d.spend.length > 12 ? `<br>… ще ${d.spend.length - 12}` : ''}</div>` : '<div class="muted">Витрат ще не додано. Вносьте суми з рекламних кабінетів щодня.</div>'}
  <h3 style="margin:14px 0 4px;font-size:15px">Результати <select id="adsdays" style="margin-left:8px">${[7, 14, 30, 90].map(n => `<option value="${n}" ${n === days ? 'selected' : ''}>за ${n} днів</option>`).join('')}</select></h3>
  <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:var(--muted)"><th>Джерело</th><th>Оформлень</th><th>Оплат</th><th>Виручка</th><th>Витрати</th><th>CPA</th><th>ROAS</th></tr></thead><tbody>
  ${rp.rows.map(x => `<tr style="border-top:1px solid var(--line)"><td>${esc(x.source)}</td><td>${x.started}</td><td>${x.paid}</td><td>${uah(x.revenue_kop)}</td><td>${x.spend_cents ? usd(x.spend_cents) : '—'}</td><td>${x.cpa_usd != null ? '$' + x.cpa_usd : '—'}</td><td>${x.roas != null ? x.roas + '×' : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Даних поки немає</td></tr>'}
  <tr style="border-top:2px solid var(--line2);font-weight:600"><td>Разом</td><td>${t.started}</td><td>${t.paid}</td><td>${uah(t.revenue_kop)}</td><td>${usd(t.spend_cents)}</td><td>${t.cpa_usd != null ? '$' + t.cpa_usd : '—'}</td><td>${t.roas != null ? t.roas + '×' : '—'}</td></tr></tbody></table></div>
  <div class="muted">ROAS = виручка / витрати за курсом ${rp.rate} ₴ за $1. Оформлення = створені замовлення, оплата = оплачені без повернення.</div>
  ${rp.campaigns.length ? `<details><summary class="muted" style="cursor:pointer">Кампанії та креативи (${rp.campaigns.length})</summary><div class="muted">${rp.campaigns.map(x => `${esc(x.source)} / ${esc(x.campaign || '—')} / ${esc(x.content || '—')}: оформлень ${x.started}, оплат ${x.paid}, ${uah(x.revenue_kop)}`).join('<br>')}</div></details>` : ''}`;
  const base = location.origin + '/', utm = () => { const q = new URLSearchParams({ utm_source: $('#utms').value, utm_medium: $('#utms').value === 'influencer' ? 'social' : 'paid', utm_campaign: $('#utmc').value.trim().toLowerCase() }); if ($('#utmk').value.trim()) q.set('utm_content', $('#utmk').value.trim().toLowerCase()); $('#utmo').value = base + '?' + q; };
  ['utms', 'utmc', 'utmk'].forEach(i => $('#' + i).oninput = utm); utm();
  $('#utmcp').onclick = async () => { try { await navigator.clipboard.writeText($('#utmo').value); toast('Скопійовано'); } catch { $('#utmo').select(); toast('Виділено, скопіюйте вручну'); } };
  $('#tks').onclick = async () => { try { await api('POST', '/api/admin/ads/config', { meta: $('#tkm').value, ga4: $('#tkg').value, gads: $('#tka').value, gads_label: $('#tkl').value, budget: $('#tkb').value }); toast('Збережено'); renderAds(days); } catch (e) { toast(errText(e)); } };
  $('#spadd').onclick = async () => { try { await api('POST', '/api/admin/ads/spend', { day: $('#spd').value, channel: $('#spch').value, campaign: $('#spc').value, amount: $('#spa').value }); toast('Додано'); renderAds(days); } catch (e) { toast(errText(e)); } };
  host.querySelectorAll('.spdel').forEach(a => a.onclick = async e => { e.preventDefault(); if (!confirm('Видалити запис про витрату?')) return; try { await api('POST', '/api/admin/ads/spend', { delete: a.dataset.id }); renderAds(days); } catch (er) { toast(errText(er)); } });
  $('#adsdays').onchange = () => renderAds(+$('#adsdays').value);
}

/* ---------- Агент росту: щоденний звіт, поради, безпечні автодії ---------- */
const AG_TYPE = { setup: 'Налаштування', fix: 'Виправити', schedule_queue: 'Черга публікацій', enable_recovery: 'Повернення оплат', pause: 'Пауза', scale: 'Масштаб', optimize: 'Оптимізація', budget: 'Бюджет', conv: 'Конверсія', content: 'Контент', geo: 'Географія', info: 'Інфо' };
async function renderAgent(data) {
  const host = $('#agentcard'); if (!host) return;
  let d = data; if (!d) { try { d = await api('GET', '/api/admin/agent'); } catch (e) { host.innerHTML = '<h2>Агент росту</h2><div class="muted">Не вдалося завантажити: ' + esc(errText(e)) + '</div>'; return; } }
  const f = d.flags, r = d.last, k = r && r.snapshot ? r.snapshot.kpis : null, m = r && r.snapshot ? r.snapshot.money : null, dl = r && r.snapshot ? r.snapshot.daysToLaunch : null;
  const chip = (t, v) => `<div style="padding:8px 12px;border:1px solid var(--line2);border-radius:12px;min-width:92px"><div class="muted" style="font-size:11px">${t}</div><div style="font-weight:600;font-size:17px">${v}</div></div>`;
  const tog = (id, on, label) => `<label class="muted" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="margin-top:3px"><span>${label}</span></label>`;
  host.innerHTML = `<h2>Агент росту</h2>
  <div class="muted">${f.hasKey ? 'Режим: <b>Claude</b>: аналіз, ідеї й експерименти пише модель (до неї йдуть лише агреговані числа, без імен і пошт).' : 'Режим: <b>правила</b>. Додайте секрет <code>ANTHROPIC_API_KEY</code> у Cloudflare Pages, і аналіз, ідеї та експерименти писатиме Claude.'} Агент не витрачає гроші й не змінює рекламних кампаній: він радить, а безпечне робить сам.</div>
  <div style="display:grid;gap:8px;margin:6px 0">
   ${tog('ag-daily', f.daily, 'Щоденний звіт із порадами (приблизно о 9:00 за Києвом)')}
   ${tog('ag-email', f.email, 'Надсилати дайджест на пошту адміністратора')}
   ${tog('ag-autoq', f.autoq, 'Автопілот черги: самому призначати час новим публікаціям (стрічка щодня о 18:00, сторіс двічі на день)')}
   ${tog('ag-rec', f.recovery, 'Нагадувати про незавершену оплату (до двох листів на замовлення: через 2 і 26 годин)')}
   ${tog('ag-prop', f.propose !== false, 'Готувати пропозиції публікацій, сторіс і Reels на ваше погодження (до чотирьох на розгляді одночасно)')}</div>
  <div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
   <label class="f" style="margin:0">ID рекламного акаунта Meta (для автообліку витрат, лише читання)<input id="ag-acc" inputmode="numeric" value="${esc(f.metaAcc)}" placeholder="цифри з Ads Manager" style="width:230px"></label>
   <label class="f" style="margin:0">Дата старту календарів<input id="ag-launch" type="date" value="${esc(f.launch)}"></label>
   <button class="btn ghost" id="ag-save" type="button">Зберегти</button>
   <button class="btn" id="ag-run" type="button">Запустити агента зараз</button>${f.metaAcc ? '<button class="btn ghost" id="ag-sync" type="button">Синхронізувати витрати Meta</button>' : ''}</div>
  ${r ? `<div style="border-top:1px solid var(--line);padding-top:12px;display:grid;gap:12px">
   <div><div class="muted" style="font-size:12px">Звіт за ${esc(r.day)} · ${r.mode === 'claude' ? 'Claude' : 'правила'}${r.note ? ' · ' + esc(r.note) : ''}</div><div style="font-size:16px;line-height:1.45;margin-top:4px">${esc(r.headline)}</div></div>
   ${k ? `<div class="row" style="flex-wrap:wrap;gap:8px">${chip('Оплат за 7 дн.', k.paid7)}${chip('Оформлень', k.started7)}${chip('Виручка', (k.revenueUah7 || 0).toLocaleString('uk-UA') + ' ₴')}${chip('Витрати', '$' + k.spendUsd7)}${chip('CPA', k.cpaUsd7 != null ? '$' + k.cpaUsd7 : '—')}${chip('ROAS', k.roas7 != null ? k.roas7 + '×' : '—')}${m && m.targetCpaUsd ? chip('Межа CPA', '$' + m.targetCpaUsd) : ''}${dl != null ? chip(dl >= 0 ? 'До старту' : 'Після старту', Math.abs(dl) + ' дн.') : ''}${r.snapshot.recovery && r.snapshot.recovery.sent ? chip('Повернено оплат', r.snapshot.recovery.recovered + ' із ' + r.snapshot.recovery.sent) : ''}</div>` : ''}
   ${r.applied && r.applied.length ? `<div class="muted">Агент уже зробив: ${r.applied.map(esc).join('; ')}</div>` : ''}
   <div><b style="font-size:14px">Що зробити</b><div style="display:grid;gap:8px;margin-top:6px">${r.actions.map(a => `<div style="border:1px solid var(--line);border-radius:12px;padding:10px 12px;${a.status !== 'new' ? 'opacity:.55' : ''}"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">${esc(AG_TYPE[a.type] || a.type)}</span><b style="flex:1;min-width:200px">${esc(a.title)}</b>${a.status === 'done' ? '<span style="color:#27ae60">✅ виконано</span>' : a.status === 'dismissed' ? '<span class="muted">відхилено</span>' : `${a.auto ? `<button class="btn sm agact" data-id="${esc(a.id)}" data-op="apply" type="button">Застосувати</button>` : a.info ? '' : `<button class="btn ghost sm agact" data-id="${esc(a.id)}" data-op="done" type="button">Виконано</button>`}<button class="btn ghost sm agact" data-id="${esc(a.id)}" data-op="dismiss" type="button">Відхилити</button>`}</div><div class="muted" style="margin-top:4px">${esc(a.why)}${a.note ? ' · ' + esc(a.note) : ''}</div></div>`).join('') || '<div class="muted">Порад немає</div>'}</div></div>
   ${r.ideas && r.ideas.length ? `<div><b style="font-size:14px">Ідеї для контенту (нові формати)</b><div style="display:grid;gap:8px;margin-top:6px">${r.ideas.map((i, n) => `<div style="border:1px solid var(--line);border-radius:12px;padding:10px 12px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">${esc(i.format)}</div><b>${esc(i.hook)}</b><div class="muted" style="margin-top:4px;white-space:pre-wrap">${esc(i.caption_ua)}\n${esc(i.caption_en)}</div><button class="btn ghost sm agcopy" data-n="${n}" type="button" style="margin-top:6px">Скопіювати підпис</button></div>`).join('')}</div></div>` : ''}
   ${r.experiment ? `<div style="border:1px dashed var(--line2);border-radius:12px;padding:10px 12px"><b>Експеримент: ${esc(r.experiment.title)}</b><div class="muted" style="margin-top:4px">Гіпотеза: ${esc(r.experiment.hypothesis)}<br>Як перевірити: ${esc(r.experiment.how)}</div></div>` : ''}
   ${d.history && d.history.length ? `<details><summary class="muted" style="cursor:pointer">Попередні звіти (${d.history.length})</summary><div class="muted">${d.history.map(h => `${esc(h.day)} · ${esc(h.headline)}`).join('<br>')}</div></details>` : ''}</div>` : '<div class="muted">Звітів ще немає. Натисніть «Запустити агента зараз», і за кілька секунд з\'являться перші поради.</div>'}`;
  const post = async (path, body, ok) => { try { const x = await api('POST', '/api/admin/agent/' + path, body); if (ok) toast(typeof ok === 'function' ? ok(x) : ok); return x; } catch (e) { toast(errText(e)); return null; } };
  const flagsBody = () => ({ daily: $('#ag-daily').checked, email: $('#ag-email').checked, autoq: $('#ag-autoq').checked, recovery: $('#ag-rec').checked, propose: $('#ag-prop').checked });
  ['ag-daily', 'ag-email', 'ag-autoq', 'ag-rec', 'ag-prop'].forEach(id => $('#' + id).onchange = async () => { const x = await post('settings', flagsBody(), 'Збережено'); if (x) d.flags = x.flags; });
  $('#ag-save').onclick = async () => { const x = await post('settings', { ...flagsBody(), metaAcc: $('#ag-acc').value, launch: $('#ag-launch').value }, 'Збережено'); if (x) renderAgent(null); };
  $('#ag-run').onclick = async () => { const b = $('#ag-run'); b.disabled = true; b.textContent = 'Аналізую…'; const x = await post('run', {}, 'Звіт готовий'); if (x) renderAgent(x); else renderAgent(null); };
  if ($('#ag-sync')) $('#ag-sync').onclick = async () => { const b = $('#ag-sync'); b.disabled = true; const x = await post('sync', {}, x2 => x2.skipped ? 'Нічого синхронізувати' : `Синхронізовано кампаній: ${x2.campaigns}`); renderAds && renderAds(30); b.disabled = false; };
  host.querySelectorAll('.agact').forEach(b => b.onclick = async () => { const x = await post('action', { at: r.at, id: b.dataset.id, op: b.dataset.op }, y => y.message || 'Готово'); if (x) { d.last = x.last; renderAgent(d); if (b.dataset.op === 'apply') { try { renderIgPlan(await api('GET', '/api/admin/instagram/publish'), await api('GET', '/api/admin/instagram')); } catch {} } } });
  host.querySelectorAll('.agcopy').forEach(b => b.onclick = async () => { const i = r.ideas[+b.dataset.n]; try { await navigator.clipboard.writeText(i.caption_ua + '\n\n' + i.caption_en); toast('Скопійовано'); } catch { toast('Не вдалося скопіювати'); } });
}

/* ---------- Соцмережі й реклама: Instagram, Facebook, публікації; сюди ж додаватимемо рекламу ---------- */
async function social() {
  const ig = await api('GET', '/api/admin/instagram').catch(() => ({ connected: false })), pb = await api('GET', '/api/admin/instagram/publish').catch(() => null);
  $('#main').innerHTML = `<div class="top"><div><h2>Маркетинг</h2><h1>Соцмережі й реклама</h1></div></div>
  <div class="card sec" id="agentcard" style="max-width:1000px"><h2>Агент росту</h2><div class="muted">Завантаження…</div></div>
  <div class="card sec" id="propcard" style="max-width:1000px;margin-top:14px"><h2>Пропозиції агента</h2><div class="muted">Завантаження…</div></div>
  <div class="card sec" style="max-width:620px;margin-top:14px"><h2>Підключення: Instagram і Facebook</h2>
    ${ig.lastError ? `<div class="muted" style="color:#eb5757">Остання помилка Instagram (${esc(fdate(ig.lastError.at))}): ${esc(ig.lastError.error)}</div>` : ''}
    <div class="muted">${ig.connected ? `Підключено${ig.username ? ': <b>@' + esc(ig.username) + '</b>' : ''}${ig.viaSecret ? ' (через секрет середовища)' : ''}. ${ig.neverExpires ? 'Токен системного користувача: без терміну дії.' : ig.daysLeft != null ? `Токен діє ще ${ig.daysLeft} дн. і продовжується автоматично раз на тиждень.` : ''} Останні пости показуються на головній.` : 'Не підключено: на головній показується лише іконка й посилання на @reeadvent. Щоб показувати стрічку постів, додайте токен: або токен системного користувача (разом із числовим ID акаунта Instagram), або токен Instagram Login (ID не потрібен).'}</div>
    <label class="f">Токен доступу Instagram<input id="igt" type="password" autocomplete="off" placeholder="Вставте токен і натисніть «Підключити»"></label>
    <label class="f">ID акаунта Instagram (зберігається; токен можна лишити порожнім, щоб змінити лише ID)<input id="igid" inputmode="numeric" autocomplete="off" placeholder="Наприклад 17841400000000000" value="${esc(ig.igId || '')}"></label>
    <label class="f">Пости для головної (вбудовування, без токена): посилання на пости, по одному в рядок, до 6<textarea id="ige" rows="4" placeholder="https://www.instagram.com/p/XXXXXXXXXXX/&#10;https://www.instagram.com/reel/YYYYYYYYYYY/">${esc(ig.embedsText || '')}</textarea></label>
    <div class="row"><button class="btn" id="igse" type="button">Зберегти пости</button><span class="muted">Посилання беріть у Instagram: пост → «···» → «Копіювати посилання». Акаунт має бути публічним.</span></div>
    <label class="f">ID сторінки Facebook (для публікації постів і на сторінку; токен має мати дозволи pages_manage_posts і pages_read_engagement)<input id="fbid" inputmode="numeric" autocomplete="off" placeholder="Наприклад 61580000000000" value="${esc(pb && pb.fbPage ? pb.fbPage.id : '')}"></label>
    <div class="row"><button class="btn ghost" id="fbs" type="button">Зберегти сторінку Facebook</button><span class="muted">${pb && pb.fbPage ? 'Підключено: <b>' + esc(pb.fbPage.name) + '</b>' : 'Не підключено. Залиште поле порожнім і збережіть, щоб відключити.'}</span></div>
    <div class="row"><button class="btn" id="igs" type="button">Підключити</button>${ig.connected ? '<button class="btn ghost" id="igtest" type="button">Перевірити зараз</button>' : ''}${ig.connected && !ig.viaSecret ? '<button class="btn ghost" id="igd" type="button">Відключити</button>' : ''}</div></div>
  <div class="card sec" id="igplan" style="max-width:1000px;margin-top:14px"></div>
  <div class="card sec" id="adscard" style="max-width:1000px;margin-top:14px"><h2>Реклама</h2><div class="muted">Завантаження…</div></div>`;
  renderAds(30); renderAgent(null); if (window.renderProps) window.renderProps(null);
  $('#igse').onclick = async () => { try { const x = await api('POST', '/api/admin/instagram/embeds', { text: $('#ige').value }); toast(x.embeds ? `Збережено постів: ${x.embeds}` : 'Збережено: список порожній'); social(); } catch (e) { toast(errText(e)); } };
  renderIgPlan(pb, ig);
  $('#fbs').onclick = async () => { try { const x = await api('POST', '/api/admin/instagram/fbpage', { id: $('#fbid').value.trim() }); toast(x.fbPage ? 'Сторінку Facebook підключено: ' + x.fbPage.name : 'Facebook відключено'); social(); } catch (e) { toast(errText(e)); } };
  if ($('#igtest')) $('#igtest').onclick = async () => { const b = $('#igtest'); b.disabled = true; try { const x = await api('POST', '/api/admin/instagram/test', {}); toast(x.ok ? (x.count ? `Instagram віддав постів: ${x.count}. Вони з'являться на головній` : `Підключення працює, але Instagram повернув 0 публікацій (${x.raw || 0} у відповіді). Перевірте, чи є в акаунті пости й чи має токен доступ до медіа`) : 'Помилка: ' + x.error); social(); } catch (e) { toast(errText(e)); b.disabled = false; } };
  $('#igs').onclick = async () => { const t = $('#igt').value.trim(); if (!t && !ig.connected) return toast('Вставте токен'); try { const x = await api('POST', '/api/admin/instagram/token', { token: t, igId: $('#igid').value.trim() }); toast('Підключено: @' + x.username); social(); } catch (e) { toast(e.code === 'token_rejected' ? 'Instagram не прийняв токен' : e.code === 'bad_token' ? 'Токен має неправильний вигляд' : errText(e)); } };
  if ($('#igd')) $('#igd').onclick = async () => { if (!confirm('Відключити Instagram? Стрічку з головної буде прибрано.')) return; try { await api('POST', '/api/admin/instagram/disconnect', {}); toast('Відключено'); social(); } catch (e) { toast(errText(e)); } };
}

async function settings() {
  const r = await api('GET', '/api/admin/settings'), v = r.settings;
  $('#main').innerHTML = `<div class="top"><div><h2>Фінанси</h2><h1>Налаштування</h1></div></div>
  <div class="card sec" style="max-width:620px"><h2>Ціна календаря</h2>
    <div class="form2"><label class="f">Для України, грн<input id="s0" type="number" step="0.01" min="1" max="100000" value="${v.price_uah}" required></label>
    <label class="f">Для інших країн, €<input id="s0e" type="number" step="0.01" min="1" max="10000" value="${r.prices && r.prices.eurSet ? r.prices.eur : ''}" placeholder="${r.prices ? r.prices.eur : ''}" required></label></div>
    <div class="muted">Клієнт бачить одну ціну у валюті своєї країни: в Україні у гривнях, у решті країн у євро. Діє одразу для нових замовлень; уже створені, але не оплачені лишаються за ціною на момент оформлення. Відсоткові промокоди діють в обох валютах, фіксовані (задані в гривнях) для оплати в євро перераховуються за курсом.${r.prices ? ` Зараз 1 € ≈ ${r.prices.uahPerEur.toFixed(2).replace('.', ',')} ₴: ${r.prices.eur} € ≈ ${UAH(Math.round(r.prices.eur * r.prices.uahPerEur) * 100)}.${r.prices.eurSet ? '' : ' Ціну в євро ще не задано: поки діє розрахована з гривневої (округлена вгору).'}` : ''}</div>
    <div class="muted">Рахунок Monobank завжди в гривнях: для інших країн сума = ціна в євро × курс євро Monobank на момент оформлення (округлено до гривні). Клієнт бачить ціну в євро, а внизу форми дрібним шрифтом пояснено, скільки гривень спишеться.</div>
    <label class="f">Запасний курс, грн за 1 USD<input id="s00" type="number" step="0.01" min="1" max="1000" value="${v.usd_rate}" required></label>
    <div class="muted">Потрібен лише тоді, коли автокурси недоступні: для бюджетів подарунків у календарі та для розрахунку ціни в євро, поки її не задано.</div>
    <div class="muted" id="fxinfo">${r.fx ? `Автокурси оновлено ${dt(r.fx.updated)}: 1 USD ≈ ${r.fx.usd} ₴, 1 EUR ≈ ${r.fx.eur} ₴ (${r.fx.count} валют${r.fx.mono != null ? `, з них ${r.fx.mono} від Monobank` : ''}). Оновлюються щодня самі: пріоритет у курсів Monobank, решта з ExchangeRate-API.` : 'Автокурси ще не завантажено (оновляться за добу після запуску крону). До того для інших валют показується долар за курсом вище.'} Дані: <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">ExchangeRate-API</a>.</div>
    <div class="row"><button class="btn" id="sp">Зберегти</button><button class="btn ghost" id="fxr" type="button">Оновити курси зараз</button></div></div>
  <div class="card sec" style="max-width:620px;margin-top:14px"><h2>База закладів (OpenStreetMap)</h2>
    <div class="muted">Безкоштовна власна база: ${r.venues.withData} із ${r.venues.cities} міст мають заклади (оновлені за новими правилами: ${r.venues.ready}), у черзі ${r.venues.pending}, в обробці ${r.venues.working}, з помилкою ${r.venues.failed}. Закладів: <b>${r.venues.venues}</b>, оцінок користувачів: <b>${r.venues.ratings}</b>. Нові міста наповнюються за 20–40 хв, оновлення щотижня вночі. Дані © OpenStreetMap contributors.</div>
    <div class="muted" style="margin-top:8px;font-size:13px">${r.venues.paused ? '<b>⏸ Наповнення призупинено.</b> ' : ''}Останній запуск наповнення: ${r.venues.last ? `<b>${new Date(r.venues.last.at).toLocaleString('uk-UA')}</b> — ${r.venues.last.error ? 'помилка: ' + esc(r.venues.last.error) : esc(JSON.stringify(r.venues.last.out))}` : 'ще не було (запуск за розкладом Worker не відбувся)'}</div>
    ${r.venues.problems.length ? `<div class="vwrap"><table class="tbl vtbl"><thead><tr><th>Місто</th><th>Стан</th><th>Причина</th><th></th></tr></thead><tbody>${r.venues.problems.map(p => `<tr><td>${esc(p.country)} · ${esc(p.name)}</td><td>${p.status === 'failed' ? 'помилка' : p.status === 'ready' ? 'частково' : 'у черзі'}</td><td class="muted">${esc(p.error || '')}</td><td>${p.status === 'failed' ? `<button class="btn ghost vr" data-id="${p.id}" type="button">Повторити</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="row" style="margin-top:10px"><a class="btn" href="#/catalog">Відкрити каталог закладів</a></div>
    <div class="row vadd"><input id="vc" placeholder="Країна (UA)" maxlength="2" title="Код країни з 2 літер, наприклад UA, PL, DE"><input id="vn" placeholder="Назва міста"><button class="btn ghost" id="va" type="button">Додати в чергу</button><button class="btn ghost" id="vt" type="button">Перевірити Overpass</button><button class="btn ghost" id="vp" type="button">${r.venues.paused ? 'Продовжити наповнення' : 'Призупинити наповнення'}</button>${r.venues.failed ? '<button class="btn ghost" id="vra" type="button">Повторити всі невдалі</button>' : ''}</div></div>
  <div class="card sec" style="max-width:620px;margin-top:14px"><h2>Рекомендації закладів (Google Places)</h2>
    <div class="muted">${r.places.enabled ? 'Ключ <code>GOOGLE_PLACES_KEY</code> додано: у картці активності показуються 2–3 заклади з найкращим рейтингом Google Maps.' : 'Вимкнено: ключ <code>GOOGLE_PLACES_KEY</code> не додано. Картки показують лише кнопку пошуку на мапі.'} Платний сервіс Google, тому є жорсткий ліміт.</div>
    <label class="f">Ліміт запитів на місяць (0 = вимкнути)<input id="pc" type="number" step="1" min="0" max="1000000" value="${v.places_monthly_cap}" required></label>
    <div class="muted">Цього місяця використано: <b>${r.places.used}</b> із ${v.places_monthly_cap}. Після ліміту рекомендації зникають до наступного місяця, пошук на мапі лишається. Дані Google ми не зберігаємо.</div>
    <div><button class="btn" id="pcs">Зберегти ліміт</button></div></div>
  <div class="card sec" style="max-width:620px;margin-top:14px"><h2>Відсотки для розрахунку прибутку</h2>
    <div class="muted">Ці відсотки використовує лише дашборд для орієнтовного чистого прибутку. На ціну для клієнтів і на самі платежі вони не впливають.</div>
    <form id="sf" class="grid" style="gap:12px">
      <label class="f">Комісія Monobank з українських карток, %<input id="s1" type="number" step="0.01" min="0" max="100" value="${v.fee_percent}" required></label>
      <label class="f">Комісія Monobank з іноземних карток, %<input id="s1f" type="number" step="0.01" min="0" max="100" value="${v.fee_foreign_percent}" required></label>
      <label class="f">Єдиний податок, % від доходу<input id="s2" type="number" step="0.01" min="0" max="100" value="${v.tax_percent}" required></label>
      <label class="f">Військовий збір, % від доходу<input id="s3" type="number" step="0.01" min="0" max="100" value="${v.military_percent}" required></label>
    </form>
    <div class="muted">За даними Monobank: 1,3% з українських карток і 2% з іноземних (країну беремо із замовлення). Повернення в день оплати комісію не стягує, в інший день комісія не повертається. ЄП 3 група 5% і військовий збір 1%: уточніть у бухгалтера. ЄСВ (фіксована сума) не враховується.</div>
    <div><button class="btn" id="ss">Зберегти</button></div></div>
`;
  $('#pcs').onclick = async () => { if (!$('#pc').reportValidity()) return; try { await api('POST', '/api/admin/settings', { places_monthly_cap: $('#pc').value }); toast('Ліміт збережено'); } catch (e) { toast(errText(e)); } };
  document.querySelectorAll('.vr').forEach(b => b.onclick = async () => { try { await api('POST', '/api/admin/venues/retry', { id: b.dataset.id }); toast('Місто повернуто в чергу'); settings(); } catch (e) { toast(errText(e)); } });
  if ($('#vra')) $('#vra').onclick = async () => { try { const x = await api('POST', '/api/admin/venues/retry', {}); toast('Повернуто в чергу: ' + x.n); settings(); } catch (e) { toast(errText(e)); } };
  $('#va').onclick = async () => { try { await api('POST', '/api/admin/venues/add', { country: $('#vc').value, name: $('#vn').value }); toast('Додано в чергу'); settings(); } catch (e) { toast(errText(e)); } };
  $('#vp').onclick = async () => { try { await api('POST', '/api/admin/venues/pause', { paused: !($('#vp').textContent.startsWith('Продовжити')) }); toast('Збережено'); settings(); } catch (e) { toast(errText(e)); } };
  $('#vt').onclick = async () => { const b = $('#vt'); b.disabled = true; b.textContent = 'Перевіряємо (до 40 с)…'; try { const x = await api('POST', '/api/admin/venues/test', {}); const f = o => o.error ? 'помилка: ' + o.error + ' (' + o.ms + ' мс)' : `HTTP ${o.status}, ${o.ms} мс, ${o.bytes} Б, об’єктів: ${o.n ?? '—'}${o.note ? ', ' + o.note : ''}`; let box = $('#vtres'); if (!box) { box = document.createElement('pre'); box.id = 'vtres'; box.className = 'muted'; box.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:8px 0 0'; $('#vt').closest('.row').after(box); } box.textContent = x.probe.map(p => `${p.mirror}\n  статус сервера: ${f(p.status)}\n  малий запит: ${f(p.small)}\n  справжній (група 1): ${f(p.group1)}`).join('\n\n'); } catch (e) { toast(errText(e)); } b.disabled = false; b.textContent = 'Перевірити Overpass'; };
  $('#fxr').onclick = async () => { $('#fxr').disabled = true; try { const x = await api('POST', '/api/admin/fx/refresh', {}); toast('Курси оновлено: ' + x.count + ' валют'); settings(); } catch (e) { toast(errText(e)); $('#fxr').disabled = false; } };
  $('#sp').onclick = async () => { const el = $('#s0'), ee = $('#s0e'); if (!ee.value && ee.placeholder) ee.value = ee.placeholder; if (!el.reportValidity() || !ee.reportValidity() || !$('#s00').reportValidity()) return; try { await api('POST', '/api/admin/settings', { price_uah: el.value, price_eur: ee.value, usd_rate: $('#s00').value }); toast(`Збережено: ${UAH(Math.round(Number(el.value) * 100))} для України, ${EUR(Math.round(Number(ee.value) * 100))} для інших країн`); settings(); } catch (e) { toast(errText(e)); } };
  $('#ss').onclick = async () => { if (!$('#sf').reportValidity()) return; try { await api('POST', '/api/admin/settings', { fee_percent: $('#s1').value, fee_foreign_percent: $('#s1f').value, tax_percent: $('#s2').value, military_percent: $('#s3').value }); toast('Збережено'); } catch (e) { toast(errText(e)); } };
}

/* ---------- Журнал ---------- */
async function audit() {
  const r = await api('GET', '/api/admin/audit');
  $('#main').innerHTML = `<div class="top"><div><h2>Безпека</h2><h1>Журнал дій</h1></div></div><div class="tw"><table><thead><tr><th>Коли</th><th>Хто</th><th>Дія</th><th>Об'єкт</th><th>Деталі</th></tr></thead><tbody>${r.rows.map(l => `<tr><td class="mono">${dt(l.at)}</td><td>${esc(l.admin_email)}</td><td><b>${esc(l.action)}</b></td><td class="mono">${esc(l.target || '')}</td><td class="muted" style="word-break:break-word">${esc(l.detail || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Порожньо</td></tr>'}</tbody></table></div>`;
}

/* Спільні функції для окремих скриптів (пропозиції агента) */
window.ADM = { $, esc, api, toast, errText, fdate, dt, pill, openOrder: id => openOrder(id), social: () => social(), views: {} };

/* ---------- Старт: після виконання всіх скриптів сторінки (render.js, proposals.js, comms.js додають свої розділи) ---------- */
const boot = async () => {
  if (!(await consumeLogin())) return;
  try { me = await api('GET', '/api/admin/me'); } catch { return; }
  if (!location.hash.startsWith('#/')) location.hash = '#/dashboard';
  route();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
