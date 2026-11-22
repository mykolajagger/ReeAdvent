/* ---------- Комунікації: усі листи, надіслані клієнтам до, під час і після замовлення ---------- */
(() => {
'use strict';
const { $, esc, api, toast, errText, dt, openOrder } = window.ADM;
const PH = { before: 'До замовлення', during: 'Під час замовлення', after: 'Після замовлення' };
const PC = { before: '#7aa7ff', during: '#d6b46a', after: '#58c58f' };
const PHINT = { before: 'клієнт почав оформлення, але не оплатив', during: 'від оплати до завершення календаря (24 дні)', after: 'календар завершено або кошти повернено' };
const phasePill = p => `<span class="pill" style="color:${PC[p] || '#8e90a0'};border-color:${PC[p] || '#8e90a0'}66">${esc(PH[p] || p)}</span>`;
const sentPill = r => r.status === 'failed' ? `<span class="pill" style="color:#eb5757;border-color:#eb575766" title="${esc(r.error || '')}">не надіслано</span>` : '<span class="pill on">надіслано</span>';
const F = { phase: '', kind: '', status: '', q: '' };   // фільтри зберігаються, поки відкрита сторінка
let ONE_ORDER = '', LABELS = {};
const shortId = id => String(id || '').slice(0, 8);
const overlay = () => {
  const ov = document.createElement('div'); ov.className = 'ov';
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); }, onKey = e => { if (e.key === 'Escape' && ov === [...document.querySelectorAll('.ov')].pop()) close(); };
  document.addEventListener('keydown', onKey); ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.body.appendChild(ov); return { ov, close };
};
const goOrder = id => { ONE_ORDER = id; document.querySelectorAll('.ov').forEach(o => o.remove()); if (location.hash === '#/comms') comms(); else location.hash = '#/comms'; };

/* ----- один лист ----- */
async function openMail(id) {
  let m; try { m = (await api('GET', '/api/admin/comms/' + id)).mail; } catch (e) { return toast(errText(e)); }
  const { ov, close } = overlay();
  ov.innerHTML = `<div class="panel"><header><div><h2>${esc(m.label)}</h2><h1 style="font-size:24px">${esc(m.subject)}</h1><div class="muted">${esc(dt(m.at))}</div></div><div class="row">${phasePill(m.phase)}<button class="btn ghost sm" id="x" type="button">Закрити</button></div></header>
  <div class="card sec"><dl class="kv"><dt>Кому</dt><dd>${esc(m.to)}</dd><dt>Статус</dt><dd>${m.status === 'failed' ? `<b style="color:#eb5757">Не надіслано</b>${m.error ? ': ' + esc(m.error) : ''}` : 'Надіслано'}</dd>
   <dt>Замовлення</dt><dd>${m.orderId ? `${m.names ? esc(m.names) + ' · ' : ''}<span class="mono muted">${esc(m.orderId)}</span>` : '—'}</dd>${m.extId ? `<dt>ID у Resend</dt><dd class="mono">${esc(m.extId)}</dd>` : ''}</dl>
   ${m.status === 'failed' && m.orderId ? '<div class="muted">Доступ можна надіслати повторно в картці замовлення: кнопка «Надіслати доступ ще раз».</div>' : ''}
   ${m.orderId ? '<div class="row"><button class="btn ghost" id="mo" type="button">Відкрити замовлення</button><button class="btn ghost" id="mt" type="button">Усі листи замовлення</button></div>' : ''}</div>
  <div class="card sec"><h2>Текст листа</h2><pre class="mailbody">${esc(m.body || '(текст не збережено)')}</pre><div class="muted">Посилання для входу й одноразові коди в журналі приховано (замінено на «…» і «••••••»).</div></div></div>`;
  $('#x', ov).onclick = close;
  if (m.orderId) { $('#mo', ov).onclick = () => { close(); openOrder(m.orderId); }; $('#mt', ov).onclick = () => { close(); openTimeline(m.orderId); }; }
}

/* ----- хронологія замовлення: віхи й листи за часом ----- */
async function openTimeline(orderId) {
  let r; try { r = await api('GET', '/api/admin/comms/order/' + orderId); } catch (e) { return toast(errText(e)); }
  const { ov, close } = overlay(), o = r.order, now = Date.now();
  const items = [...r.milestones.map(ms => ({ at: ms.at, ms })), ...r.mails.map(mail => ({ at: mail.at, mail }))].sort((a, b) => a.at - b.at || (a.ms ? -1 : 1));
  const msHtml = ms => { const date = ms.day ? new Date(ms.at).toLocaleDateString('uk-UA', { timeZone: 'UTC' }) : dt(ms.at), future = ms.at > now; return `<div class="ms k-${ms.key}${future ? ' fut' : ''}"><b>${esc(ms.label)}</b> <span class="muted">${esc(date)}${future ? ' · попереду' : ''}</span></div>`; };
  const mailHtml = m => `<div class="ml" data-id="${m.id}" style="--c:${PC[m.phase] || '#8e90a0'}"><div class="row" style="justify-content:space-between;gap:8px"><b>${esc(m.label)}</b>${sentPill(m)}</div><div class="muted">${esc(m.subject)}</div><div class="muted" style="font-size:12px">${esc(dt(m.at))} · ${esc(m.to)} · ${esc(PH[m.phase] || m.phase)}</div></div>`;
  ov.innerHTML = `<div class="panel"><header><div><h2>Хронологія листів</h2><h1 style="font-size:24px">${esc(o.name_a)} і ${esc(o.name_b)}</h1><div class="muted mono">${esc(o.id)}</div></div><div class="row"><button class="btn ghost sm" id="x" type="button">Закрити</button></div></header>
  <div class="row" style="gap:8px">${Object.keys(PH).map(p => `<span title="${esc(PHINT[p])}">${phasePill(p)}</span>`).join('')}</div>
  <div class="tl">${items.map(i => i.ms ? msHtml(i.ms) : mailHtml(i.mail)).join('')}</div>
  ${r.mails.length ? '' : '<div class="muted">Листів за цим замовленням у журналі поки немає.</div>'}
  <div class="row"><button class="btn ghost" id="mo" type="button">Відкрити замовлення</button></div></div>`;
  $('#x', ov).onclick = close; $('#mo', ov).onclick = () => { close(); openOrder(orderId); };
  ov.querySelectorAll('.ml').forEach(el => el.onclick = () => openMail(+el.dataset.id));
}

/* ----- розділ меню ----- */
async function comms() {
  const f = { ...F, order: ONE_ORDER }; ONE_ORDER = '';
  $('#main').innerHTML = `<div class="top"><div><h2>Клієнти</h2><h1>Комунікації</h1></div></div>
  <div class="muted" style="max-width:880px;margin-bottom:14px">Усі листи, які система надсилає клієнтам. ${Object.keys(PH).map(p => `<b style="color:${PC[p]}">${PH[p]}</b>: ${PHINT[p]}`).join('; ')}. Лист, на який клієнт відповів, шукайте в «Підтримці». Текст листів зберігається без посилань для входу й кодів, а через 24 місяці записи видаляються.</div>
  <div id="cmst"></div>
  <div class="row" id="cmch" style="margin:14px 0 10px;gap:8px"></div>
  <div class="row" style="margin-bottom:12px"><select id="cmk"><option value="">Усі типи листів</option></select><select id="cms"><option value="">Усі статуси</option><option value="sent">Надіслані</option><option value="failed">Не надіслані</option></select>
   <input id="cmq" type="search" placeholder="Пошук: пошта, тема, ім'я клієнта, номер замовлення" value="${esc(f.q)}" style="flex:1;min-width:220px"></div>
  <div id="cmo"></div><div id="cml"></div><div class="row" id="cmmore" style="justify-content:center;margin-top:12px"></div>`;
  let lastId = 0, firstLoad = true;
  const qs = (extra = {}) => new URLSearchParams(Object.entries({ ...f, limit: 40, ...extra }).filter(([, v]) => v !== '' && v != null)).toString();
  const chips = () => { $('#cmch').innerHTML = [['', 'Усі'], ...Object.entries(PH)].map(([k, t]) => `<button type="button" class="chip${f.phase === k ? ' on' : ''}" data-ph="${k}" ${k ? `style="${f.phase === k ? '' : 'border-color:' + PC[k] + '66'}"` : ''}>${esc(t)}</button>`).join(''); $('#cmch').querySelectorAll('.chip').forEach(b => b.onclick = () => { f.phase = F.phase = b.dataset.ph; chips(); load(true); }); };
  const rowHtml = r => `<tr data-id="${r.id}" style="cursor:pointer"><td class="mono" style="white-space:nowrap">${esc(dt(r.at))}</td><td>${phasePill(r.phase)}</td><td><b>${esc(LABELS[r.kind] || r.kind)}</b><div class="muted">${esc(r.subject)}</div></td><td style="overflow-wrap:anywhere;min-width:150px">${esc(r.to)}</td><td>${r.names ? esc(r.names) : '<span class="muted">—</span>'}${r.orderId ? `<div class="muted mono">${esc(shortId(r.orderId))}</div>` : ''}</td><td>${sentPill(r)}</td></tr>`;
  const stats = s => { $('#cmst').innerHTML = `<div class="grid kpis">
    <div class="kpi"><h2>Усього листів</h2><div class="v">${s.total}</div><div class="s">${s.first ? 'журнал веде облік з ' + esc(dt(s.first)) : 'ще порожньо'}</div></div>
    <div class="kpi"><h2>За 7 днів</h2><div class="v">${s.week}</div><div class="s">надіслано системою</div></div>
    ${Object.keys(PH).map(p => `<div class="kpi" data-ph="${p}" style="cursor:pointer;border-color:${f.phase === p ? PC[p] : ''}"><h2 style="color:${PC[p]}">${PH[p]}</h2><div class="v">${s[p]}</div><div class="s">${esc(PHINT[p])}</div></div>`).join('')}
    <div class="kpi" data-failed="1" style="cursor:pointer"><h2>Не надіслано</h2><div class="v" style="${s.failed ? 'color:#eb5757' : ''}">${s.failed}</div><div class="s">${s.failed ? 'натисніть, щоб побачити' : 'усе дійшло до пошти'}</div></div></div>`;
    $('#cmst').querySelectorAll('[data-ph]').forEach(el => el.onclick = () => { f.phase = F.phase = f.phase === el.dataset.ph ? '' : el.dataset.ph; chips(); load(true); });
    $('#cmst').querySelector('[data-failed]').onclick = () => { f.status = F.status = f.status === 'failed' ? '' : 'failed'; $('#cms').value = f.status; load(true); };
  };
  const load = async reset => {
    if (reset) lastId = 0;
    let r; try { r = await api('GET', '/api/admin/comms?' + qs(lastId ? { before: lastId } : {})); } catch (e) { $('#cml').innerHTML = `<div class="empty">${esc(errText(e))}</div>`; return; }
    LABELS = r.labels || LABELS;
    if (r.migrate) { $('#cmst').innerHTML = ''; $('#cmch').innerHTML = ''; $('#cml').innerHTML = `<div class="card sec"><h2>Журнал листів ще не підключено до бази</h2><div class="muted">Таблицю не вдалося створити автоматично. Виконайте в Cloudflare → D1 → reeadvent-db → Console по одному рядку з файлу <code>docs/d1-console-0011.sql</code> (або <code>npm run db:migrate</code>) і оновіть сторінку.</div></div>`; return; }
    if (r.stats) stats(r.stats);
    if (r.kinds && firstLoad) { $('#cmk').innerHTML = '<option value="">Усі типи листів</option>' + r.kinds.map(k => `<option value="${esc(k.kind)}">${esc(k.label)} (${k.n})</option>`).join(''); $('#cmk').value = f.kind; firstLoad = false; }
    $('#cms').value = f.status;
    $('#cmo').innerHTML = f.order ? `<div class="row" style="margin-bottom:10px"><span class="pill on">Лише замовлення ${esc((r.rows[0] && r.rows[0].names) || shortId(f.order))}</span><button class="btn ghost sm" id="cmx" type="button">Показати всі листи</button><button class="btn ghost sm" id="cmtl" type="button">Хронологія</button></div>` : '';
    if (f.order) { $('#cmx').onclick = () => { f.order = ''; load(true); }; $('#cmtl').onclick = () => openTimeline(f.order); }
    const html = r.rows.map(rowHtml).join('');
    if (reset || !$('#cml table')) $('#cml').innerHTML = r.rows.length ? `<div class="tw"><table><thead><tr><th>Коли</th><th>Етап</th><th>Лист</th><th>Кому</th><th>Замовлення</th><th>Статус</th></tr></thead><tbody>${html}</tbody></table></div>` : `<div class="empty">${f.phase || f.kind || f.status || f.q || f.order ? 'За цими фільтрами листів немає' : 'Листів поки немає. Вони з’являться тут після першого замовлення чи нагадування.'}</div>`;
    else $('#cml tbody').insertAdjacentHTML('beforeend', html);
    lastId = r.rows.length ? r.rows.at(-1).id : lastId;
    $('#cmmore').innerHTML = r.more ? '<button class="btn ghost" id="cmm" type="button">Показати ще</button>' : '';
    if (r.more) $('#cmm').onclick = () => load(false);
  };
  $('#cml').onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) openMail(+tr.dataset.id); };
  $('#cmk').onchange = e => { f.kind = F.kind = e.target.value; load(true); };
  $('#cms').onchange = e => { f.status = F.status = e.target.value; load(true); };
  let tm; $('#cmq').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { f.q = F.q = e.target.value.trim(); load(true); }, 300); };
  chips(); $('#cms').value = f.status; await load(true);
}

/* ----- картка «Листи клієнту» в замовленні ----- */
async function orderMails(host, orderId) {
  try {
    const r = await api('GET', '/api/admin/comms?limit=8&order=' + encodeURIComponent(orderId)); LABELS = r.labels || LABELS;
    if (r.migrate) { host.innerHTML = '<h2>Листи клієнту</h2><div class="muted">Журнал листів ще не підключено до бази.</div>'; return; }
    host.innerHTML = `<h2>Листи клієнту${r.rows.length ? ` (${r.rows.length}${r.more ? '+' : ''})` : ''}</h2>` + (r.rows.length
      ? `<div style="display:grid;gap:6px">${r.rows.map(m => `<div class="row mailrow" data-id="${m.id}" style="cursor:pointer;gap:8px;justify-content:space-between;border:1px solid var(--line);border-radius:10px;padding:7px 10px"><span><b>${esc(LABELS[m.kind] || m.kind)}</b><div class="muted" style="font-size:12px">${esc(dt(m.at))} · ${esc(m.to)}</div></span><span class="row" style="gap:6px">${phasePill(m.phase)}${sentPill(m)}</span></div>`).join('')}</div><div class="row"><button class="btn ghost sm" id="omt" type="button">Хронологія замовлення</button><button class="btn ghost sm" id="oma" type="button">Усі листи в розділі «Комунікації»</button></div>`
      : '<div class="muted">Листів за цим замовленням у журналі поки немає. Журнал веде облік із моменту ввімкнення розділу «Комунікації».</div>');
    host.querySelectorAll('.mailrow').forEach(el => el.onclick = () => openMail(+el.dataset.id));
    const t = host.querySelector('#omt'); if (t) t.onclick = () => openTimeline(orderId);
    const a = host.querySelector('#oma'); if (a) a.onclick = () => goOrder(orderId);
  } catch (e) { host.innerHTML = `<h2>Листи клієнту</h2><div class="muted">Не вдалося завантажити: ${esc(errText(e))}</div>`; }
}

window.ADM.views.comms = comms;
window.ADM.orderMails = orderMails;
})();
