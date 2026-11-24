/* ---------- Запуск: воронка лендингу за 7 днів і готовність сервісів до реклами ---------- */
(() => {
'use strict';
const { $, esc, api, toast, errText } = window.ADM;
const ICON = { true: ['✓', 'var(--ok)'], false: ['✕', 'var(--bad)'], warn: ['!', 'var(--warn)'], opt: ['○', 'var(--muted)'] };
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 + '%' : '—';
const SRC = { direct: 'Прямі (без джерела)', meta: 'Meta (реклама)', instagram: 'Instagram', facebook: 'Facebook', google: 'Google', telegram: 'Telegram', tiktok: 'TikTok', influencer: 'Блогери', youtube: 'YouTube', threads: 'Threads', pinterest: 'Pinterest' };
function funnelHtml(f) {
  if (!f) return '<div class="card muted">Воронка недоступна.</div>';
  const t = f.total, rows = f.rows.slice(0, 14);
  const row = (x, b) => `<tr${b ? ' style="font-weight:600"' : ''}><td>${esc(SRC[x.source] || x.source)}${x.campaign && x.campaign !== '-' ? ` <span class="muted">· ${esc(x.campaign)}</span>` : ''}</td><td class="num">${x.view}</td><td class="num">${x.form} <span class="muted">${pct(x.form, x.view)}</span></td><td class="num">${x.checkout} <span class="muted">${pct(x.checkout, x.view)}</span></td><td class="num">${x.paid} <span class="muted">${pct(x.paid, x.view)}</span></td><td class="num">${x.revenue ? x.revenue.toLocaleString('uk-UA') + ' ₴' : '—'}</td></tr>`;
  const max = Math.max(1, ...f.daily.map(d => d.view));
  const bars = f.daily.length ? `<div style="display:flex;gap:6px;align-items:flex-end;height:70px;margin:6px 0 2px">${f.daily.map(d => `<div title="${esc(d.day)}: ${d.view} переглядів, ${d.checkout} до оплати" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%"><div style="width:100%;max-width:46px;height:${Math.max(3, d.view / max * 56)}px;background:var(--gold, #d6b46a);border-radius:4px 4px 0 0;opacity:.85"></div><span class="muted" style="font-size:11px">${esc(d.day.slice(8))}.${esc(d.day.slice(5, 7))}</span></div>`).join('')}</div>` : '';
  return `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px"><h3 style="margin:0">Воронка лендингу за 7 днів</h3><span class="muted" style="font-size:13px">без cookies, видно всіх відвідувачів · одна сесія = один перегляд</span></div>
    <div class="row" style="gap:18px;flex-wrap:wrap;margin:12px 0"><div><div class="muted" style="font-size:12px">Перегляди лендингу</div><b style="font-size:26px">${t.view}</b></div><div><div class="muted" style="font-size:12px">Почали форму</div><b style="font-size:26px">${t.form}</b> <span class="muted">${pct(t.form, t.view)}</span></div><div><div class="muted" style="font-size:12px">Перейшли до оплати</div><b style="font-size:26px">${t.checkout}</b> <span class="muted">${pct(t.checkout, t.view)}</span></div><div><div class="muted" style="font-size:12px">Оплатили</div><b style="font-size:26px">${t.paid}</b> <span class="muted">${pct(t.paid, t.view)}</span></div></div>
    ${bars}
    ${rows.length ? `<div class="tw" style="margin-top:10px"><table><thead><tr><th>Джерело · кампанія</th><th class="num">Перегляди</th><th class="num">Форма</th><th class="num">До оплати</th><th class="num">Оплати</th><th class="num">Виручка</th></tr></thead><tbody>${rows.map(x => row(x)).join('')}${row(t, 1)}</tbody></table></div>` : '<div class="empty" style="margin-top:8px">Даних ще немає: лічильник почав працювати з цього оновлення.</div>'}
    <div class="muted" style="font-size:12px;margin-top:8px">Джерело береться з UTM-мітки посилання, а без неї з сайту, звідки людина прийшла (Instagram, Google…). Посилання з мітками: Соцмережі й реклама → Реклама.</div></div>`;
}
async function launch() {
  const r = await api('GET', '/api/admin/launch'), sc = r.score;
  const groups = [...new Set(r.checks.map(c => c.group))], mg = [...new Set(r.manual.map(m => m.group))];
  $('#main').innerHTML = `<div class="top"><div><h2>Реклама</h2><h1>Запуск</h1></div><div class="muted">${r.daysToLaunch > 0 ? `До старту календарів ${r.daysToLaunch} дн. (${esc(r.launch)})` : `Старт ${esc(r.launch)}`}</div></div>
  ${funnelHtml(r.funnel)}
  <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h3 style="margin:0">Підключення</h3><span class="muted">Готово ${sc.auto} з ${sc.autoTotal}${sc.blockers ? ` · <b style="color:var(--bad)">критичних: ${sc.blockers}</b>` : ''} · ○ необов’язкове</span></div>
  ${groups.map(g => `<h4 style="margin:16px 0 6px">${esc(g)}</h4>${r.checks.filter(c => c.group === g).map(c => { const [i, col] = ICON[String(c.ok)]; return `<div class="row" style="gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--line)"><b style="color:${col};width:18px;text-align:center;flex:none">${i}</b><div style="flex:1;min-width:0"><div>${esc(c.label)}</div><div class="muted" style="font-size:13px">${esc(c.hint || '')}${c.where && c.ok !== true ? ` · <i>${esc(c.where)}</i>` : ''}</div></div>${c.action === 'auto_on' ? '<button type="button" class="btn sm" data-auto="1" style="flex:none">Увімкнути</button>' : ''}</div>`; }).join('')}`).join('')}</div>
  <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h3 style="margin:0">Кроки в рекламних кабінетах</h3><span class="muted">Відмічено ${sc.manual} з ${sc.manualTotal} · сайт їх не бачить, відмічайте самі</span></div>
  ${mg.map(g => `<h4 style="margin:16px 0 6px">${esc(g)}</h4>${r.manual.filter(m => m.group === g).map(m => `<label class="row" style="gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--line);cursor:pointer"><input type="checkbox" data-m="${esc(m.id)}" ${m.done ? 'checked' : ''} style="margin-top:3px;flex:none"><div style="flex:1;min-width:0"><div${m.done ? ' style="color:var(--muted);text-decoration:line-through"' : ''}>${esc(m.label)}</div><div class="muted" style="font-size:13px">${esc(m.hint)}</div></div></label>`).join('')}`).join('')}
  <div class="muted" style="font-size:13px;margin-top:10px">Покрокові інструкції: marketing/ads/setup.md у репозиторії.</div></div>`;
  $('#main').onclick = async e => { const b = e.target.closest('[data-auto]'); if (!b) return; b.disabled = true; try { await api('POST', '/api/admin/instagram/auto', { on: true }); toast('Автопублікацію ввімкнено'); launch(); } catch (er) { b.disabled = false; toast(errText(er)); } };
  $('#main').onchange = async e => { const cb = e.target.closest('input[data-m]'); if (!cb) return; try { await api('POST', '/api/admin/launch', { id: cb.dataset.m, done: cb.checked }); toast(cb.checked ? 'Відмічено' : 'Знято'); launch(); } catch (er) { cb.checked = !cb.checked; toast(errText(er)); } };
}
window.ADM.views.launch = launch;
})();
