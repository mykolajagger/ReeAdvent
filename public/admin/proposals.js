/* ---------- Пропозиції агента: погодити, відхилити, змінити вручну або доопрацювати за промтом (Claude) ---------- */
(() => {
'use strict';
const { $, esc, api, toast, errText, social } = window.ADM;
const PR = { tab: 'new', data: null, ed: {}, cur: {}, files: {}, tok: {}, timer: {} };
const SCENE_UA = { tree: 'Ялинка', pasta: 'Вечеря', pillow: 'Подушки', book: 'Книга', stars: 'Зорі', game: 'Настільна гра', wrap: 'Подарунки', spa: 'Спа', market: 'Ярмарок', movie: 'Кіно' };
const TPL_UA = { quote: 'Цитата', tip: 'Чекліст', question: 'Питання', announce: 'Заголовок на фото', cta: 'Заклик' };
const FMT_UA = { post: 'Пост', carousel: 'Карусель', story: 'Сторіс', reel: 'Reel (концепт)' };
const EDIT_KEYS = ['title', 'caption', 'slides', 'storyboard', 'music', 'whenAt', 'targets'];
const prFields = p => JSON.parse(JSON.stringify({ title: p.title, caption: p.caption, slides: p.slides || [], storyboard: p.storyboard || [], music: p.music || 'b', whenAt: p.whenAt || null, targets: p.targets || { ig: true, fb: true } }));
const prEd = p => PR.ed[p.id] || (PR.ed[p.id] = prFields(p));
const prDirty = p => PR.ed[p.id] && JSON.stringify(PR.ed[p.id]) !== JSON.stringify(prFields(p));
const prFind = id => PR.data.list.find(x => x.id === id);
const prDt = t => t ? new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
const sceneOpts = (p, sel) => Object.entries(SCENE_UA).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('') + (p.refs || []).map(r => `<option value="ref:${esc(r.id)}" ${('ref:' + r.id) === sel ? 'selected' : ''}>Фото: ${esc(r.name)}</option>`).join('');
const tplOpts = sel => Object.entries(TPL_UA).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
const sceneThumb = (sc, w = 44, h = 56) => `<img src="${/^ref:/.test(sc) ? '/api/media/' + esc(sc.slice(4)) : '/social/scenes/s-' + esc(sc) + '.jpg'}" alt="" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:6px;flex:none">`;
const readB64 = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = rej; f.readAsDataURL(blob); });
/** Готує файл-референс: фото стискається в JPEG, PDF і текст беруться як є (до 3 МБ). */
async function prRefFile(file) {
  const name = file.name.slice(0, 80);
  if (/^image\//.test(file.type)) { const bmp = await createImageBitmap(file), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return { name, mime: 'image/jpeg', data: await readB64(await RN.toJpeg(c, 600 * 1024)) }; }
  if (file.size > 3e6) throw new Error('Файл завеликий (до 3 МБ)');
  if (file.type === 'application/pdf') return { name, mime: 'application/pdf', data: await readB64(file) };
  if (/^text\/(plain|markdown)$/.test(file.type) || /\.(txt|md)$/i.test(file.name)) return { name, mime: /\.md$/i.test(name) ? 'text/markdown' : 'text/plain', data: await readB64(file) };
  throw new Error('Підтримуються фото, PDF, .txt і .md');
}
async function prUpload(blob) {
  const r = await fetch('/api/admin/media', { method: 'POST', credentials: 'same-origin', headers: { 'X-Admin': '1', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }), j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) { const e = new Error(j.error || 'server_error'); e.code = j.error || 'server_error'; throw e; } return j;
}
const refBox = (key, hasKey) => `<div class="prref" data-key="${key}" style="display:grid;grid-template-columns:minmax(0,1fr);gap:4px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><label class="btn ghost sm" style="cursor:pointer">Додати референси<input type="file" data-file="${key}" multiple accept="image/*,.pdf,.txt,.md,application/pdf,text/plain,text/markdown" style="display:none"></label><span class="muted" style="font-size:12px">фото (стиль чи тло), PDF, .txt або .md; до 4 файлів</span></div><div class="muted prlist" data-list="${key}">${(PR.files[key] || []).map((f, i) => `${esc(f.name)} <a href="#" data-act="rmref" data-key="${key}" data-i="${i}">видалити</a>`).join(' · ')}</div></div>`;

function prSlideEditor(p, ed) {
  if (p.format === 'reel') return `<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:6px">${ed.storyboard.map((r, i) => `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${sceneThumb(r.scene, 36, 44)}<select data-f="r.${i}.scene">${sceneOpts(p, r.scene)}</select><input data-f="r.${i}.text" value="${esc(r.text)}" style="flex:1;min-width:180px" placeholder="Текст на екрані"><input data-f="r.${i}.sec" type="number" min="1" max="6" value="${r.sec}" style="width:60px" title="секунд"><a href="#" data-act="delrow" data-i="${i}">видалити</a></div>`).join('')}<div class="row" style="gap:8px"><button class="btn ghost sm" data-act="addrow" type="button">Додати сцену</button><label class="muted">Музика <select data-f="music">${['a', 'b', 'c', 'd'].map(m => `<option ${m === ed.music ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div></div>`;
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:8px">${ed.slides.map((s, i) => `<div style="border:1px solid var(--line);border-radius:10px;padding:8px;display:grid;grid-template-columns:minmax(0,1fr);gap:6px"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b>Слайд ${i + 1}</b><select data-f="s.${i}.template">${tplOpts(s.template)}</select><select data-f="s.${i}.scene">${sceneOpts(p, s.scene)}</select>${p.format === 'carousel' && ed.slides.length > 2 ? `<a href="#" data-act="delslide" data-i="${i}">видалити</a>` : ''}</div><input data-f="s.${i}.title" value="${esc(s.title)}" placeholder="Мала золота стрічка над текстом"><textarea data-f="s.${i}.text" rows="2" placeholder="Основний текст">${esc(s.text)}</textarea><input data-f="s.${i}.en" value="${esc(s.en)}" placeholder="Англійською"><textarea data-f="s.${i}.items" rows="3" placeholder="Рядки списку (по одному в рядок) або адреса сайту">${esc((s.items || []).join('\n'))}</textarea></div>`).join('')}${p.format === 'carousel' && ed.slides.length < 8 ? '<button class="btn ghost sm" data-act="addslide" type="button">Додати слайд</button>' : ''}</div>`;
}
function prNewCard(p, d) {
  const ed = prEd(p), story = p.format === 'story', reel = p.format === 'reel', dirty = prDirty(p), n = (p.slides || []).length;
  const vers = (p.versions || []).map((v, i) => `<option value="${i}">${esc(new Date(v.at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }))} · ${v.by === 'claude' ? 'Claude' : 'адмін'} · ${esc(String(v.note || '').slice(0, 40))}</option>`).join('');
  return `<div class="card pc" id="pc-${esc(p.id)}" data-id="${esc(p.id)}" style="padding:14px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-bottom:12px">
   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">${FMT_UA[p.format]}${n > 1 ? ' · ' + n : ''}</span><input data-f="title" value="${esc(ed.title)}" style="flex:1;min-width:220px;font-weight:600"><span class="muted" style="font-size:12px">${p.by === 'agent' ? 'агент' : 'адмін'} · ${esc(new Date(p.at).toLocaleDateString('uk-UA'))}</span></div>
   ${p.why ? `<div class="muted">Чому: ${esc(p.why)}</div>` : ''}
   <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:0 0 ${story ? 230 : 290}px;max-width:100%"><div class="pvc" data-pv="${esc(p.id)}" style="border-radius:12px;overflow:hidden;background:#0e0f14;min-height:120px"></div>${n > 1 ? `<div class="row" style="justify-content:center;gap:10px;margin-top:6px"><button class="btn ghost sm" data-act="prev" type="button">‹</button><span class="muted" data-pn="${esc(p.id)}"></span><button class="btn ghost sm" data-act="next" type="button">›</button></div>` : ''}</div>
    <div style="flex:1 1 380px;min-width:260px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px">
     ${story ? '<div class="muted">Сторіс без підпису: текст уже на картинці.</div>' : `<label class="f">Підпис<textarea data-f="caption" rows="${reel ? 7 : 8}">${esc(ed.caption)}</textarea></label><div class="muted" data-cc="${esc(p.id)}"></div>`}
     <details><summary class="muted" style="cursor:pointer">${reel ? 'Сцени відео' : 'Слайди: шаблон, сцена й тексти'}</summary>${prSlideEditor(p, ed)}</details>
     <div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end"><label class="f" style="margin:0">Час публікації<input type="datetime-local" data-f="whenAt" value="${prDt(ed.whenAt)}"></label><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-f="ig" ${ed.targets.ig ? 'checked' : ''}> Instagram</label><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-f="fb" ${ed.targets.fb ? 'checked' : ''}> Facebook</label></div>
     ${reel ? `<div class="muted">Reel: погодьте концепт, а відео виготовляється окремо. ${d.mediaMode === 'r2' ? 'Готовий MP4 можна завантажити після погодження.' : 'Щоб завантажувати готові відео сюди, підключіть сховище R2 (інструкція в docs/agent.md).'}</div>` : ''}
     <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="approve" type="button">${ed.whenAt ? 'Погодити й запланувати' : 'Погодити'}</button><button class="btn ghost" data-act="save" type="button" ${dirty ? '' : 'disabled'}>Зберегти зміни${dirty ? ' •' : ''}</button><button class="btn ghost" data-act="reject" type="button">Відхилити</button></div>
    </div></div>
   <div style="border-top:1px dashed var(--line2);padding-top:10px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px"><label class="f">Доопрацювання з Claude: напишіть, що змінити<textarea data-f="prompt" rows="2" ${d.hasKey ? '' : 'disabled'} placeholder="${d.hasKey ? 'Напр.: зроби тон грайливішим, скороти підпис до двох речень, заміни сцену на ярмарок, візьми стиль із доданого фото' : 'Потрібен секрет ANTHROPIC_API_KEY у Cloudflare (див. картку «Агент росту»)'}"></textarea></label>
    ${d.hasKey ? refBox(p.id, true) : ''}
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><button class="btn" data-act="revise" type="button" ${d.hasKey ? '' : 'disabled'}>Доопрацювати</button>${vers ? `<select data-f="ver"><option value="">Версії (${p.versions.length})</option>${vers}</select><button class="btn ghost sm" data-act="restore" type="button">Повернути версію</button>` : ''}${(p.rework || []).length ? `<span class="muted" style="font-size:12px">Промтів: ${p.rework.length}</span>` : ''}</div></div>
  </div>`;
}
function prApprovedCard(p) {
  const thumbs = (p.mediaIds || []).filter(m => m !== (p.cover || '')).map(m => `<img src="/api/media/${esc(m)}" alt="" style="height:96px;border-radius:8px;object-fit:cover">`).join('');
  return `<div class="card pc" id="pc-${esc(p.id)}" data-id="${esc(p.id)}" style="padding:12px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-bottom:10px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">${FMT_UA[p.format]}</span><b style="flex:1;min-width:200px">${esc(p.title)}</b><span style="color:#27ae60">✅ погоджено</span></div>
   ${p.needsVideo ? `<div class="muted">Концепт погоджено. Потрібне відео: ${PR.data.mediaMode === 'r2' ? 'завантажте готовий MP4 (до 90 МБ):' : 'виготовте його окремо або підключіть сховище R2, щоб завантажувати сюди.'}</div><div class="row" style="gap:8px;flex-wrap:wrap">${(p.storyboard || []).map(r => `<span style="display:flex;gap:4px;align-items:center">${sceneThumb(r.scene, 28, 34)}<span class="muted" style="font-size:12px">${esc(r.text)}</span></span>`).join('')}</div>${PR.data.mediaMode === 'r2' ? `<div class="row" style="gap:8px"><label class="btn ghost sm" style="cursor:pointer">Завантажити MP4<input type="file" data-vid="${esc(p.id)}" accept="video/mp4" style="display:none"></label><span class="muted" data-vl="${esc(p.id)}"></span></div>` : ''}` : `<div class="row" style="gap:8px;flex-wrap:wrap">${thumbs}</div><div class="muted">У плані публікацій як «${esc(p.entryId || '')}»: там налаштовується час і майданчики.</div><div class="row" style="gap:8px"><button class="btn ghost sm" data-act="goplan" type="button">До плану публікацій</button><button class="btn ghost sm" data-act="withdraw" type="button">Відкликати з плану</button></div>`}</div>`;
}
const prRejectedCard = p => `<div class="card pc" style="padding:10px 12px;margin-bottom:8px;opacity:.75"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="muted" style="font-size:11px;text-transform:uppercase">${FMT_UA[p.format]}</span><b style="flex:1;min-width:200px">${esc(p.title)}</b><span class="muted">${esc(new Date(p.rejectedAt || p.at).toLocaleDateString('uk-UA'))}</span></div>${p.note ? `<div class="muted">Причина: ${esc(p.note)}</div>` : ''}</div>`;

async function prPreview(id) {
  const p = prFind(id), host = document.querySelector(`[data-pv="${id}"]`); if (!p || !host) return; const ed = prEd(p), tok = PR.tok[id] = (PR.tok[id] || 0) + 1;
  if (p.format === 'reel') { host.innerHTML = `<div style="padding:10px;display:grid;grid-template-columns:minmax(0,1fr);gap:6px">${ed.storyboard.map((r, i) => `<div style="display:flex;gap:8px;align-items:center">${sceneThumb(r.scene, 52, 64)}<div style="flex:1;font-size:13px"><b>${i + 1}.</b> ${esc(r.text)}</div><span class="muted">${r.sec} с</span></div>`).join('')}<div class="muted" style="font-size:12px">Музика: тема ${esc(ed.music)}</div></div>`; return; }
  const i = Math.min(PR.cur[id] || 0, ed.slides.length - 1); PR.cur[id] = i;
  const c = await RN.render(ed.slides[i], p.format === 'story' ? 'story' : 'post'); if (tok !== PR.tok[id]) return; c.style.cssText = 'width:100%;height:auto;display:block'; host.replaceChildren(c);
  const pn = document.querySelector(`[data-pn="${id}"]`); if (pn) pn.textContent = `${i + 1} / ${ed.slides.length}`;
}
const prCaptionInfo = id => { const p = prFind(id), el = document.querySelector(`[data-cc="${id}"]`); if (!p || !el) return; const c = prEd(p).caption || '', t = (c.match(/#[^\s#]+/g) || []).length; el.innerHTML = `${c.length}/2200 символів · ${t}/30 хештегів` + (c.length > 2200 || t > 30 ? ' <b style="color:#eb5757">перевищено</b>' : ''); };

async function renderProps(data) {
  const host = $('#propcard'); if (!host) return;
  let d = data; if (!d) { try { d = await api('GET', '/api/admin/proposals'); } catch (e) { host.innerHTML = '<h2>Пропозиції агента</h2><div class="muted">Не вдалося завантажити: ' + esc(errText(e)) + '</div>'; return; } }
  PR.data = d; for (const id of Object.keys(PR.ed)) if (!d.list.some(p => p.id === id && p.status === 'new')) delete PR.ed[id];
  const c = d.counts, list = d.list.filter(p => p.status === PR.tab), tab = (k, t, n) => `<button type="button" class="btn ${PR.tab === k ? '' : 'ghost'} sm" data-act="tab" data-k="${k}">${t} (${n})</button>`;
  host.innerHTML = `<h2>Пропозиції агента</h2>
  <div class="muted">Агент пропонує публікації, сторіс і Reels. Ви погоджуєте, відхиляєте, змінюєте текст і вигляд вручну або просите Claude доопрацювати за промтом (можна додати файли-референси). Погоджене потрапляє в план публікацій.</div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:8px;border:1px solid var(--line);border-radius:12px;padding:10px 12px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="f" style="margin:0;flex:1;min-width:240px">Нова пропозиція: тема або побажання (необов’язково)<input data-f="gfocus" placeholder="напр.: подарунки для нього, кіновечір, відповідь на «чи не дорого?»"></label><button class="btn" data-act="gen" type="button">Запропонувати ще</button></div>${d.hasKey ? refBox('_gen', true) : '<div class="muted">Без ключа Claude агент бере пропозиції з готового банку.</div>'}</div>
  <div class="row" style="gap:8px;flex-wrap:wrap">${tab('new', 'На розгляді', c.new)}${tab('approved', 'Погоджені', c.approved)}${tab('rejected', 'Відхилені', c.rejected)}</div>
  <div id="prlist">${list.length ? list.map(p => PR.tab === 'new' ? prNewCard(p, d) : PR.tab === 'approved' ? prApprovedCard(p) : prRejectedCard(p)).join('') : `<div class="muted">${PR.tab === 'new' ? 'Нових пропозицій немає. Натисніть «Запропонувати ще».' : 'Тут поки порожньо.'}</div>`}</div>`;
  if (PR.tab === 'new') list.forEach(p => { prPreview(p.id); prCaptionInfo(p.id); });
}

const prBusy = (btn, text) => { const old = btn.textContent; btn.disabled = true; btn.textContent = text; return () => { btn.disabled = false; btn.textContent = old; }; };
async function prCall(path, body, okMsg) { try { const x = await api('POST', '/api/admin/proposals/' + path, body); if (okMsg) toast(okMsg); return x; } catch (e) { toast(errText(e)); return null; } }
const prPatch = ed => { const o = {}; for (const k of EDIT_KEYS) o[k] = ed[k]; return o; };
async function prSave(id) { const p = prFind(id), ed = prEd(p), x = await prCall('edit', { id, patch: prPatch(ed) }, 'Збережено'); if (x) { delete PR.ed[id]; await renderProps(x); } return x; }
async function prApprove(id, btn) {
  let p = prFind(id), done = prBusy(btn, 'Готую файли…');
  try {
    if (prDirty(p)) { const x = await prCall('edit', { id, patch: prPatch(prEd(p)) }); if (!x) return; PR.data = x; delete PR.ed[id]; p = prFind(id); }
    const ed = prFields(p), media = [], limit = PR.data.mediaMode === 'r2' ? 0 : 680 * 1024;
    if (p.format !== 'reel') for (let i = 0; i < p.slides.length; i++) { btn.textContent = `Файли ${i + 1} із ${p.slides.length}…`; const canvas = await RN.render(p.slides[i], p.format === 'story' ? 'story' : 'post'), blob = await RN.toJpeg(canvas, limit); media.push((await prUpload(blob)).id); }
    const x = await prCall('approve', { id, at: ed.whenAt, targets: ed.targets, media }, p.format === 'reel' ? 'Концепт погоджено' : 'Погоджено: додано до плану публікацій');
    if (x) { delete PR.ed[id]; PR.tab = 'approved'; await social(); }
  } catch (e) { toast(e.message === 'image_too_big' ? 'Зображення завелике для вбудованого сховища: спростіть слайд' : errText(e)); } finally { done(); }
}
async function prVideo(id, file) {
  const lab = document.querySelector(`[data-vl="${id}"]`); if (lab) lab.textContent = 'Завантаження…';
  try {
    const v = await prUpload(file); let cover = null;
    try { const url = URL.createObjectURL(file), el = document.createElement('video'); el.muted = true; el.src = url; await new Promise((r, j) => { el.onloadeddata = r; el.onerror = j; }); el.currentTime = Math.min(1, (el.duration || 2) / 2); await new Promise(r => { el.onseeked = r; }); const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight; c.getContext('2d').drawImage(el, 0, 0); cover = (await prUpload(await RN.toJpeg(c, 0))).id; URL.revokeObjectURL(url); } catch {}
    const x = await prCall('approve', { id, media: [v.id], cover }, 'Відео додано до плану публікацій'); if (x) await social();
  } catch (e) { toast(errText(e)); if (lab) lab.textContent = ''; }
}
function prInput(el) {
  const card = el.closest('.pc'); if (!card) return; const id = card.dataset.id, p = prFind(id); if (!p) return; const ed = prEd(p), f = el.dataset.f; if (!f) return;
  const m = f.match(/^([sr])\.(\d+)\.(\w+)$/);
  if (f === 'title') ed.title = el.value; else if (f === 'caption') { ed.caption = el.value; prCaptionInfo(id); } else if (f === 'whenAt') ed.whenAt = el.value ? new Date(el.value).getTime() : null; else if (f === 'ig' || f === 'fb') ed.targets[f] = el.checked; else if (f === 'music') ed.music = el.value;
  else if (m) { const [, k, i, name] = m, row = (k === 's' ? ed.slides : ed.storyboard)[+i]; if (!row) return; row[name] = name === 'items' ? el.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 5) : name === 'sec' ? Math.max(1, Math.min(6, +el.value || 3)) : el.value; if (name === 'scene' && k === 'r') prPreview(id); }
  if (m || f === 'music') { clearTimeout(PR.timer[id]); PR.timer[id] = setTimeout(() => prPreview(id), 250); }
  const save = card.querySelector('[data-act=save]'); if (save) { const dirty = prDirty(p); save.disabled = !dirty; save.textContent = 'Зберегти зміни' + (dirty ? ' •' : ''); }
  const ap = card.querySelector('[data-act=approve]'); if (ap && !ap.disabled) ap.textContent = ed.whenAt ? 'Погодити й запланувати' : 'Погодити';
}
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#propcard') && e.target.dataset.f && !/^(prompt|gfocus|ver)$/.test(e.target.dataset.f)) prInput(e.target); });
document.addEventListener('change', async e => {
  const t = e.target; if (!t.closest || !t.closest('#propcard')) return;
  if (t.dataset.f === 'ig' || t.dataset.f === 'fb' || t.dataset.f === 'whenAt' || /^[sr]\./.test(t.dataset.f || '')) prInput(t);
  if (t.dataset.file) { const key = t.dataset.file, files = [...t.files]; t.value = ''; for (const f of files) { if ((PR.files[key] || []).length >= 4) break; try { (PR.files[key] = PR.files[key] || []).push(await prRefFile(f)); } catch (er) { toast(er.message || 'Файл не підійшов'); } } const l = document.querySelector(`[data-list="${key}"]`); if (l) l.innerHTML = (PR.files[key] || []).map((x, i) => `${esc(x.name)} <a href="#" data-act="rmref" data-key="${key}" data-i="${i}">видалити</a>`).join(' · '); }
  if (t.dataset.vid && t.files[0]) prVideo(t.dataset.vid, t.files[0]);
});
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('#propcard [data-act]'); if (!b) return; const act = b.dataset.act, card = b.closest('.pc'), id = card && card.dataset.id, p = id && prFind(id);
  e.preventDefault();
  if (act === 'goplan') { const el = document.getElementById('igplan'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (act === 'tab') { PR.tab = b.dataset.k; return renderProps(PR.data); }
  if (act === 'rmref') { (PR.files[b.dataset.key] || []).splice(+b.dataset.i, 1); const l = document.querySelector(`[data-list="${b.dataset.key}"]`); if (l) l.innerHTML = (PR.files[b.dataset.key] || []).map((x, i) => `${esc(x.name)} <a href="#" data-act="rmref" data-key="${b.dataset.key}" data-i="${i}">видалити</a>`).join(' · '); return; }
  if (act === 'gen') { const done = prBusy(b, 'Агент думає…'), focus = $('#propcard [data-f=gfocus]').value, x = await prCall('generate', { count: 2, focus, refs: PR.files._gen || [] }); done(); if (x) { PR.files._gen = []; PR.tab = 'new'; toast(x.generated.added ? `Додано пропозицій: ${x.generated.added}${x.generated.note ? ' (' + x.generated.note + ')' : ''}` : 'Нових ідей не знайшлося: уточніть тему'); renderProps(x); } return; }
  if (!p) return;
  if (act === 'prev' || act === 'next') { const n = prEd(p).slides.length; PR.cur[id] = ((PR.cur[id] || 0) + (act === 'next' ? 1 : n - 1)) % n; return prPreview(id); }
  if (act === 'addslide') { const ed = prEd(p), last = ed.slides[ed.slides.length - 1] || {}; if (ed.slides.length < 8) ed.slides.push({ template: 'quote', scene: last.scene || 'tree', title: '', text: 'Новий слайд', en: '', items: [] }); return renderProps(PR.data); }
  if (act === 'delslide') { const ed = prEd(p); if (ed.slides.length > 2) ed.slides.splice(+b.dataset.i, 1); PR.cur[id] = 0; return renderProps(PR.data); }
  if (act === 'addrow') { const ed = prEd(p); if (ed.storyboard.length < 10) ed.storyboard.push({ scene: 'tree', text: 'Нова сцена', sec: 3 }); return renderProps(PR.data); }
  if (act === 'delrow') { const ed = prEd(p); if (ed.storyboard.length > 3) ed.storyboard.splice(+b.dataset.i, 1); return renderProps(PR.data); }
  if (act === 'save') return prSave(id);
  if (act === 'approve') return prApprove(id, b);
  if (act === 'reject') { const reason = prompt('Чому відхиляєте? Агент це врахує й не запропонує схожого (необов’язково).'); if (reason === null) return; const x = await prCall('reject', { id, reason }, 'Відхилено'); if (x) renderProps(x); return; }
  if (act === 'restore') { const v = card.querySelector('[data-f=ver]').value; if (v === '') return toast('Оберіть версію'); const x = await prCall('restore', { id, version: +v }, 'Версію повернуто'); if (x) { delete PR.ed[id]; renderProps(x); } return; }
  if (act === 'revise') {
    const instr = card.querySelector('[data-f=prompt]').value.trim(); if (instr.length < 3) return toast('Напишіть, що змінити');
    const done = prBusy(b, 'Claude працює…'); try { if (prDirty(p)) { const sx = await prCall('edit', { id, patch: prPatch(prEd(p)) }); if (!sx) return; PR.data = sx; delete PR.ed[id]; }
      const x = await prCall('revise', { id, instruction: instr, refs: PR.files[id] || [] }, 'Claude доопрацював пропозицію'); if (x) { PR.files[id] = []; delete PR.ed[id]; PR.cur[id] = 0; renderProps(x); } } finally { done(); } return;
  }
  if (act === 'withdraw') { if (!confirm('Прибрати з плану публікацій? Файли буде видалено, а пропозиція повернеться на розгляд.')) return; const x = await prCall('withdraw', { id }, 'Відкликано'); if (x) { PR.tab = 'new'; await social(); } return; }
});
window.renderProps = renderProps;
if (document.getElementById('propcard')) renderProps(null);
})();
