(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UAH = kop => (kop / 100).toLocaleString('uk-UA', { minimumFractionDigits: kop % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' ₴';
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
const ERR = { refund_failed: 'Monobank не виконав повернення. Замовлення не змінено', bad_percent: 'Відсоток: число від 0 до 100', bad_rate: 'Курс: від 1 до 1000', bad_price: 'Ціна: від 1 до 100000 грн', admin_auth: 'Сесія закінчилась', code_exists: 'Такий код уже є', bad_code: 'Код: 3–32 символи (літери, цифри, - _)', bad_value: 'Невірне значення знижки', bad_max: 'Ліміт: ціле число від 1', bad_date: 'Невірна дата', already_started: 'Календар уже стартував: дату змінити не можна', same_email: 'Пошти мають бути різні', bad_email: 'Невірна пошта', bad_names: 'Вкажіть імена', not_paid: 'Замовлення не оплачене', already_refunded: 'Повернення вже оформлено', bad_amount: 'Сума більша за оплачену', empty: 'Напишіть текст відповіді', too_many: 'Забагато спроб', csrf: 'Помилка захисту, оновіть сторінку' };
const errText = e => (ERR[e.code] || 'Щось пішло не так: ' + (e.code || e.message)) + (e.detail ? ` (${e.detail})` : '');
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800); }

/* ---------- Вхід ---------- */
function showLogin(msg) {
  root.innerHTML = `<div class="login"><div class="card"><div class="logo">Ree<em>Advent</em></div><div class="muted">Адмінка</div>
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

/* ---------- Каркас ---------- */
const NAV = [['dashboard', 'Дашборд'], ['orders', 'Замовлення'], ['customers', 'Клієнти'], ['promos', 'Промокоди'], ['inbox', 'Підтримка'], ['settings', 'Налаштування'], ['audit', 'Журнал дій']];
async function shell() {
  root.innerHTML = `<div class="shell"><aside class="side"><div class="logo">Ree<em>Advent</em></div>
    <nav class="nav">${NAV.map(([k, t]) => `<a data-v="${k}" class="${view === k ? 'on' : ''}" href="#/${k}">${t}${k === 'inbox' ? '<span class="badge" id="ib" hidden></span>' : ''}</a>`).join('')}</nav>
    <div class="who">${esc(me.email)}<br><a href="#" id="lo">Вийти</a></div></aside><main id="main"></main></div>`;
  $('#lo').onclick = async e => { e.preventDefault(); try { await api('POST', '/api/admin/auth/logout', {}); } catch {} me = null; showLogin(); };
}
async function route() {
  if (!me) return;
  view = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'dashboard'; if (!NAV.some(n => n[0] === view)) view = 'dashboard';
  await shell();
  const views = { dashboard, orders, customers, promos, inbox, settings, audit };
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
    <div class="kpi hero"><h2>Чистий прибуток ≈</h2><div class="v">${UAH(k.profit_kop)}</div><div class="s">після комісії ${k.fee_pct}% і податків ${k.tax_pct}%</div></div>
    <div class="kpi"><h2>Виручка (нетто)</h2><div class="v">${UAH(k.net_revenue_kop)}</div><div class="s">після знижок і повернень</div></div>
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
  <p class="muted" style="margin-top:16px;font-size:12px">Прибуток орієнтовний: комісія ${k.fee_pct}% і податки ${k.tax_pct}% (${k.tax_single_pct}% єдиний податок + ${k.tax_military_pct}% військовий збір) задаються в розділі <a href="#/settings">Налаштування</a>; ЄСВ та інші витрати не враховано. Звіряйте з бухгалтером.</p>`;
  $('#seg').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { period = b.dataset.p; dashboard(); } };
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
  const { status, q, page } = ordersState;
  $('#main').innerHTML = `<div class="top"><div><h2>Продажі</h2><h1>Замовлення</h1></div></div>
  <div class="row" style="margin-bottom:14px"><select id="fs">${[['all', 'Усі'], ['paid', 'Оплачені'], ['pending', 'Очікують оплати'], ['abandoned', 'Не оплачені'], ['refunded', 'Повернені']].map(([v, t]) => `<option value="${v}" ${status === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <input id="fq" type="search" placeholder="Пошук: пошта, ім'я, місто, номер" value="${esc(q)}" style="flex:1;min-width:220px"></div><div id="ol"></div>`;
  const load = async () => {
    const r = await api('GET', `/api/admin/orders?status=${ordersState.status}&q=${encodeURIComponent(ordersState.q)}&page=${ordersState.page}`);
    $('#ol').innerHTML = `<div class="tw"><table><thead><tr><th>Дата</th><th>Клієнти</th><th>Місто</th><th class="num">Сума</th><th>Статус</th><th>Старт</th></tr></thead><tbody>${r.orders.map(o => `<tr class="click" data-id="${o.id}"><td class="mono">${dt(o.created_at)}</td>
      <td><b>${esc(o.name_a)}</b> · ${esc(o.email_a)}<br><b>${esc(o.name_b)}</b> · ${esc(o.email_b)}</td><td>${esc(o.city)}<div class="muted">${esc(o.region)}</div></td>
      <td class="num">${UAH(o.amount_kop)}${o.discount_kop ? `<div class="muted"><s>${UAH(o.list_kop)}</s> ${o.promo_code ? esc(o.promo_code) : ''}</div>` : ''}</td><td>${pill(o.status)}</td><td class="mono">${dd(o.start_date)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Нічого не знайдено</td></tr>'}</tbody></table></div>
      <div class="row" style="justify-content:space-between;margin-top:12px"><span class="muted">Усього: ${r.total}</span><span class="row"><button class="btn ghost sm" id="pp" ${r.page <= 1 ? 'disabled' : ''}>←</button><span class="muted">${r.page} / ${r.pages}</span><button class="btn ghost sm" id="pn" ${r.page >= r.pages ? 'disabled' : ''}>→</button></span></div>`;
    $('#ol').onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) openOrder(tr.dataset.id); };
    $('#pp').onclick = () => { ordersState.page--; load(); }; $('#pn').onclick = () => { ordersState.page++; load(); };
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
  ov.innerHTML = `<div class="panel"><header><div><h2>Замовлення</h2><h1 style="font-size:26px">${esc(o.name_a)} і ${esc(o.name_b)}</h1><div class="muted mono">${esc(o.id)}</div></div><div class="row">${pill(o.status)}<button class="btn ghost sm" id="x">Закрити</button></div></header>
  <div class="card sec"><h2>Оплата</h2><dl class="kv"><dt>Створено</dt><dd>${dt(o.created_at)}</dd><dt>Оплачено</dt><dd>${dt(o.paid_at)}</dd><dt>Сума</dt><dd><b>${UAH(o.amount_kop)}</b>${o.discount_kop ? ` · за прайсом ${UAH(o.list_kop)}, знижка ${UAH(o.discount_kop)}${o.promo_code ? ` (<b>${esc(o.promo_code)}</b>)` : ''}` : ''}</dd>
    ${o.refunded_at ? `<dt>Повернення</dt><dd>${UAH(o.refund_kop)} · ${dt(o.refunded_at)} · ${({ manual: 'вручну', processing: 'Monobank: обробляється', success: 'Monobank: виконано' })[o.refund_status] || ''}</dd>` : ''}<dt>Інвойс</dt><dd class="mono">${esc(o.invoice_id || '—')}</dd><dt>Мова · країна</dt><dd>${esc(o.lang || 'uk')} · ${esc(o.country || 'UA')} · ${esc(o.tz || 'Europe/Kyiv')}</dd></dl></div>
  <div class="card sec"><h2>Контакти й дата старту</h2><div class="form2">
    <label class="f">Ім'я 1<input id="nA" value="${esc(o.name_a)}" maxlength="30"></label><label class="f">Пошта 1<input id="eA" type="email" value="${esc(o.email_a)}"></label>
    <label class="f">Ім'я 2<input id="nB" value="${esc(o.name_b)}" maxlength="30"></label><label class="f">Пошта 2<input id="eB" type="email" value="${esc(o.email_b)}"></label>
    <label class="f">Дата старту<input id="sd" type="date" value="${esc(cal ? cal.start_date : o.start_date)}" ${started ? 'disabled' : ''}></label><label class="f">Місто<input value="${esc(o.city)} · ${esc(o.region)}" disabled></label></div>
    <div class="muted">${started ? 'Календар уже стартував: дату змінити не можна, пошти можна.' : 'Після зміни пошти новому адресату автоматично надсилається лист із доступом, старий доступ закривається.'}</div>
    <div><button class="btn" id="sv">Зберегти зміни</button></div></div>
  ${cal ? `<div class="card sec"><h2>Календар</h2><dl class="kv"><dt>Старт</dt><dd>${dd(cal.start_date)} · ${cal.today ? `відкрито вікно ${cal.today} з 24` : 'ще не стартував'}</dd><dt>Розклад</dt><dd>${cal.ready ? 'складено' : 'чекаємо анкети'}</dd></dl>
    <div class="tw"><table style="min-width:0"><thead><tr><th>Учасник</th><th>Анкета</th><th class="num">Відкрито</th><th class="num">Виконано</th><th class="num">Відповідей</th></tr></thead><tbody>${r.members.map(m => `<tr><td>${esc(m.suggested_name)}<div class="muted">${esc(m.email)}</div></td><td>${m.survey_done ? '<span class="pill on">заповнена</span>' : '<span class="pill off">ні</span>'}</td><td class="num">${m.opened_days}</td><td class="num">${m.tasks_done}</td><td class="num">${m.answers_count}</td></tr>`).join('')}</tbody></table></div>
    <div class="muted">Зміст анкет і відповідей клієнтів адмінці недоступний (обіцяно в політиці конфіденційності).</div></div>` : '<div class="card muted">Календар ще не створено (немає оплати).</div>'}
  <div class="card sec"><h2>Дії</h2><div class="row">
    ${cal ? '<button class="btn ghost" id="rs">Надіслати доступ ще раз (обом)</button>' : ''}
    ${o.paid_at && !o.refunded_at ? '<button class="btn danger" id="rf">Оформити повернення…</button>' : ''}
    ${r.threads.length ? `<a class="btn ghost" href="#/inbox" id="gi" style="text-decoration:none">Листування (${r.threads.length})</a>` : ''}</div>
    ${o.paid_at && !o.refunded_at ? `<div id="rfbox" hidden class="sec"><div class="form2"><label class="f">Сума повернення, грн<input id="ra" type="number" step="0.01" min="0" max="${o.amount_kop / 100}" value="${o.amount_kop / 100}"></label><label class="f">Коментар<input id="rn" maxlength="300"></label></div>
      <label class="f">Спосіб<select id="rm"><option value="auto">Автоматично через Monobank</option><option value="manual">Я вже повернув(ла) кошти вручну (лише відмітка)</option></select></label>
      <label class="row muted"><input type="checkbox" id="rv" checked> закрити клієнтам доступ до календаря</label>
      <label class="row muted"><input type="checkbox" id="rnf" checked> надіслати покупцю лист про повернення</label>
      <div class="muted">«Автоматично»: гроші повертає Monobank на картку покупця (зазвичай до 10 банківських днів). Для безкоштовних замовлень API не викликається.</div><div><button class="btn danger" id="rfok">Підтвердити повернення</button></div></div>` : ''}</div>
  <div class="card sec"><h2>Нотатка менеджера</h2><textarea id="nt" rows="3" maxlength="1000">${esc(o.note || '')}</textarea><div><button class="btn ghost sm" id="ns">Зберегти нотатку</button></div></div>
  <div class="card sec"><h2>Історія дій</h2><div class="log">${r.log.map(l => `<div>${dt(l.at)} · ${esc(l.admin_email)} · <b>${esc(l.action)}</b> ${l.detail ? esc(l.detail) : ''}</div>`).join('') || 'Дій ще не було'}</div></div></div>`;
  document.body.appendChild(ov);
  $('#x', ov).onclick = close;
  const act = async (action, body, ok) => { try { const res = await api('POST', `/api/admin/orders/${id}/${action}`, body); toast(ok(res)); close(); route().then(() => openOrder(id)); } catch (e) { toast(errText(e)); } };
  $('#sv', ov).onclick = () => act('update', { nameA: $('#nA', ov).value, nameB: $('#nB', ov).value, emailA: $('#eA', ov).value, emailB: $('#eB', ov).value, ...(started ? {} : { startDate: $('#sd', ov).value }) }, res => res.changed.length ? 'Збережено' : 'Змін немає');
  const rs = $('#rs', ov); if (rs) rs.onclick = () => confirm('Надіслати обом новий лист із доступом?') && act('resend', {}, () => 'Листи надіслано');
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
async function settings() {
  const r = await api('GET', '/api/admin/settings'), v = r.settings;
  $('#main').innerHTML = `<div class="top"><div><h2>Фінанси</h2><h1>Налаштування</h1></div></div>
  <div class="card sec" style="max-width:620px"><h2>Ціна календаря</h2>
    <label class="f">Ціна для клієнтів, грн<input id="s0" type="number" step="0.01" min="1" max="100000" value="${v.price_uah}" required></label>
    <div class="muted">Діє одразу на сайті й для нових замовлень. Уже створені замовлення, які ще не оплачено, лишаються за ціною на момент оформлення. Промокоди рахуються від цієї ціни.</div>
    <label class="f">Курс для показу ціни іноземним клієнтам, грн за 1 USD<input id="s00" type="number" step="0.01" min="1" max="1000" value="${v.usd_rate}" required></label>
    <div class="muted">Лише для орієнтовного показу «≈ $N» в англомовній версії й для перерахунку бюджету подарунка. Списання завжди у гривнях; конвертує банк клієнта.</div>
    <div><button class="btn" id="sp">Зберегти</button></div></div>
  <div class="card sec" style="max-width:620px;margin-top:14px"><h2>Відсотки для розрахунку прибутку</h2>
    <div class="muted">Ці відсотки використовує лише дашборд для орієнтовного чистого прибутку. На ціну для клієнтів і на самі платежі вони не впливають.</div>
    <form id="sf" class="grid" style="gap:12px">
      <label class="f">Комісія еквайрингу Monobank, %<input id="s1" type="number" step="0.01" min="0" max="100" value="${v.fee_percent}" required></label>
      <label class="f">Єдиний податок, % від доходу<input id="s2" type="number" step="0.01" min="0" max="100" value="${v.tax_percent}" required></label>
      <label class="f">Військовий збір, % від доходу<input id="s3" type="number" step="0.01" min="0" max="100" value="${v.military_percent}" required></label>
    </form>
    <div class="muted">Орієнтовні значення: ЄП 3 група 5% і військовий збір 1%, комісію візьміть із договору з банком. ЄСВ (фіксована сума) не враховується. Уточніть у бухгалтера.</div>
    <div><button class="btn" id="ss">Зберегти</button></div></div>
`;
  $('#sp').onclick = async () => { const el = $('#s0'); if (!el.reportValidity()) return; try { if (!$('#s00').reportValidity()) return; await api('POST', '/api/admin/settings', { price_uah: el.value, usd_rate: $('#s00').value }); toast('Збережено: ' + UAH(Math.round(Number(el.value) * 100))); } catch (e) { toast(errText(e)); } };
  $('#ss').onclick = async () => { if (!$('#sf').reportValidity()) return; try { await api('POST', '/api/admin/settings', { fee_percent: $('#s1').value, tax_percent: $('#s2').value, military_percent: $('#s3').value }); toast('Збережено'); } catch (e) { toast(errText(e)); } };
}

/* ---------- Журнал ---------- */
async function audit() {
  const r = await api('GET', '/api/admin/audit');
  $('#main').innerHTML = `<div class="top"><div><h2>Безпека</h2><h1>Журнал дій</h1></div></div><div class="tw"><table><thead><tr><th>Коли</th><th>Хто</th><th>Дія</th><th>Об'єкт</th><th>Деталі</th></tr></thead><tbody>${r.rows.map(l => `<tr><td class="mono">${dt(l.at)}</td><td>${esc(l.admin_email)}</td><td><b>${esc(l.action)}</b></td><td class="mono">${esc(l.target || '')}</td><td class="muted" style="word-break:break-word">${esc(l.detail || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Порожньо</td></tr>'}</tbody></table></div>`;
}

/* ---------- Старт ---------- */
(async () => {
  if (!(await consumeLogin())) return;
  try { me = await api('GET', '/api/admin/me'); } catch { return; }
  if (!location.hash.startsWith('#/')) location.hash = '#/dashboard';
  route();
})();
})();
