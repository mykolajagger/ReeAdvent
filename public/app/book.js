/* Книга «Адвент [рік] [ім'я1] & [ім'я2]»: 24 сторінки PDF з пройденими днями (питання, обидві відповіді, фото, подарунок,
   пригода, активність, що виконано). Сторінки малюються на canvas прямо на пристрої (кирилиця й шрифти як на сайті),
   далі збираються в PDF (кожна сторінка — JPEG). На сервер нічого не відправляється. Також фінальна анімація. */
(() => {
'use strict';
const W = 1240, H = 1754, M = 96;                                // A4 при 150 dpi
const C = { bg: '#08090d', bg2: '#12131c', ink: '#f3efe6', soft: '#9a9cab', gold: '#d6b46a', gold2: '#f0d79a', line: '#d6b46a40', card: '#12131cd9', ok: '#58c58f' };   // палітра сайту
const SERIF = '"Cormorant Garamond", Georgia, serif', SANS = 'Inter, system-ui, sans-serif';
const R = () => window.RA;
const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return `${n} ${a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2]}`; };
const ANS = ['відповідь', 'відповіді', 'відповідей'], TASKS = ['виконане завдання', 'виконані завдання', 'виконаних завдань'];

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split(/\n+/)) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW) line = t;
      else { if (line) out.push(line); line = w; while (ctx.measureText(line).width > maxW && line.length > 1) { let k = line.length; while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--; out.push(line.slice(0, k)); line = line.slice(k); } }
    }
    if (line) out.push(line);
  }
  return out;
}
/** Текст абзацом; повертає нову y. maxLines обрізає з «…». */
function para(ctx, text, x, y, maxW, font, color, lh, maxLines = 99) {
  ctx.font = font; ctx.fillStyle = color; let lines = wrap(ctx, text, maxW);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); let l = lines[maxLines - 1]; while (l.length && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + '…'; }
  for (const l of lines) { ctx.fillText(l, x, y); y += lh; }
  return y;
}
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
async function loadImg(id) {
  try { const r = await fetch('/api/answer-media/' + encodeURIComponent(id), { credentials: 'same-origin' }); if (!r.ok) return null; const b = await r.blob(); return await createImageBitmap(b); } catch { return null; }
}
function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  ctx.save(); rr(ctx, x, y, w, h, 18); ctx.clip(); ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h); ctx.restore();
}

/* ---------- Фірмовий стиль: темне тло з сяйвом, сніжинки, золота рамка-арка, ✦ ---------- */
const BRAND = {};
async function brand(src) { if (src in BRAND) return BRAND[src]; try { const r = await fetch(src); BRAND[src] = r.ok ? await createImageBitmap(await r.blob()) : null; } catch { BRAND[src] = null; } return BRAND[src]; }
function star(ctx, x, y, r, color = C.gold) { ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * .12, y - r * .12, x + r, y); ctx.quadraticCurveTo(x + r * .12, y + r * .12, x, y + r); ctx.quadraticCurveTo(x - r * .12, y + r * .12, x - r, y); ctx.quadraticCurveTo(x - r * .12, y - r * .12, x, y - r); ctx.fill(); ctx.restore(); }
function eyebrow(ctx, text, x, y, color = C.gold) { ctx.save(); ctx.font = `600 20px ${SANS}`; ctx.fillStyle = color; if ('letterSpacing' in ctx) ctx.letterSpacing = '5px'; ctx.fillText(String(text).toUpperCase(), x, y); ctx.restore(); }
function backdrop(ctx, seed = 1) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[W * 0.85, -60, 900, '#1c1a2e'], [0, H, 800, '#2a1a1a'], [W / 2, H * 0.42, 700, '#1a1726']]) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c + 'cc'); g.addColorStop(1, c + '00'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;   // сніжинки, однакові для тієї самої сторінки
  for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.15 + rnd() * 0.45; ctx.fillStyle = rnd() < 0.2 ? C.gold2 : '#ffffff'; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2.2, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  // рамка-арка, як вікна календаря
  const x0 = 44, y0 = 44, w = W - 88, h = H - 88, top = 150;
  ctx.strokeStyle = '#d6b46a66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 + h); ctx.lineTo(x0, y0 + top); ctx.bezierCurveTo(x0, y0 + 10, x0 + w * 0.3, y0, x0 + w / 2, y0); ctx.bezierCurveTo(x0 + w * 0.7, y0, x0 + w, y0 + 10, x0 + w, y0 + top); ctx.lineTo(x0 + w, y0 + h); ctx.closePath(); ctx.stroke();
  star(ctx, W / 2, y0, 12, C.gold2);
  ctx.textBaseline = 'alphabetic';
}
function footer(ctx, logo) {
  if (logo) { const w = 210, h = w * logo.height / logo.width; ctx.globalAlpha = 0.9; ctx.drawImage(logo, (W - w) / 2, H - 96 - h, w, h); ctx.globalAlpha = 1; }
  ctx.save(); ctx.font = `italic 500 26px ${SERIF}`; ctx.fillStyle = C.soft; ctx.textAlign = 'center'; ctx.fillText('Unwrap Love. Every Day.', W / 2, H - 72); ctx.restore();
}
/** Обкладинка: арка з фірмовою сценою, назва книги, імена, підсумки. */
async function cover(info, stats) {
  const { L } = R(), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  backdrop(ctx, 99);
  ctx.textAlign = 'center'; eyebrowC(ctx, L('ReeAdvent · 24 дні', 'ReeAdvent · 24 days'), W / 2, 230);
  const ax = W / 2 - 300, ay = 290, aw = 600, ah = 720, scene = await brand('/social/scenes/s-tree.jpg');
  ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay + ah); ctx.lineTo(ax, ay + 300); ctx.arc(ax + aw / 2, ay + 300, aw / 2, Math.PI, 0); ctx.lineTo(ax + aw, ay + ah); ctx.closePath(); ctx.clip();
  if (scene) { const sc = Math.max(aw / scene.width, ah / scene.height), sw = aw / sc, sh = ah / sc; ctx.drawImage(scene, (scene.width - sw) / 2, (scene.height - sh) / 2, sw, sh, ax, ay, aw, ah); } else { ctx.fillStyle = C.bg2; ctx.fillRect(ax, ay, aw, ah); }
  ctx.restore();
  ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay + ah); ctx.lineTo(ax, ay + 300); ctx.arc(ax + aw / 2, ay + 300, aw / 2, Math.PI, 0); ctx.lineTo(ax + aw, ay + ah); ctx.closePath(); ctx.stroke(); star(ctx, W / 2, ay - 2, 16, C.gold2);
  ctx.font = `500 120px ${SERIF}`; ctx.fillStyle = C.ink; const a = L('Адвент', 'Advent') + ' ', yr = String(info.year), wa = ctx.measureText(a).width; ctx.font = `italic 500 120px ${SERIF}`; const wy = ctx.measureText(yr).width;
  ctx.textAlign = 'left'; ctx.font = `500 120px ${SERIF}`; ctx.fillText(a, (W - wa - wy) / 2, 1160); ctx.font = `italic 500 120px ${SERIF}`; ctx.fillStyle = C.gold; ctx.fillText(yr, (W - wa - wy) / 2 + wa, 1160);
  ctx.textAlign = 'center'; ctx.font = `italic 500 64px ${SERIF}`; ctx.fillStyle = C.gold2; ctx.fillText(`${info.me} & ${info.partner}`, W / 2, 1250);
  ctx.font = `400 30px ${SANS}`; ctx.fillStyle = C.soft; ctx.fillText(L(`24 вікна · ${plural(stats.answers, ANS)} · ${plural(stats.tasks, TASKS)}`, `24 windows · ${stats.answers} answers · ${stats.tasks} completed tasks`), W / 2, 1330);
  ctx.fillText(info.range, W / 2, 1378);
  footer(ctx, await brand('/assets/logo.png'));
  return new Promise(res => cv.toBlob(b => b.arrayBuffer().then(buf => res(new Uint8Array(buf))), 'image/jpeg', 0.88));
}
function eyebrowC(ctx, text, x, y) { ctx.save(); ctx.font = `600 22px ${SANS}`; ctx.fillStyle = C.gold; ctx.textAlign = 'center'; if ('letterSpacing' in ctx) ctx.letterSpacing = '7px'; ctx.fillText(String(text).toUpperCase(), x, y); ctx.restore(); }

async function page(day, info) {
  const { L } = R(), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  backdrop(ctx, day.day);
  // шапка
  eyebrow(ctx, info.title, M, 150); ctx.textAlign = 'right'; ctx.font = `600 22px ${SANS}`; ctx.fillStyle = C.soft; ctx.fillText(`${day.day} / 24`, W - M, 150); ctx.textAlign = 'left';
  ctx.font = `500 100px ${SERIF}`; ctx.fillStyle = C.ink; const wl = L('Вікно', 'Window') + ' '; ctx.fillText(wl, M, 266);
  ctx.font = `italic 500 100px ${SERIF}`; ctx.fillStyle = C.gold; ctx.fillText('№' + day.day, M + (ctx.font = `500 100px ${SERIF}`, ctx.measureText(wl).width), 266);
  ctx.font = `500 30px ${SANS}`; ctx.fillStyle = C.soft; ctx.fillText(info.date(day.day), M, 316);
  let y = 384;
  // питання
  eyebrow(ctx, L('Питання дня', 'Question of the day'), M, y); y += 56;
  y = para(ctx, day.question, M, y, W - 2 * M, `500 46px ${SERIF}`, C.ink, 54, 4) + 12;
  // відповіді
  const imgs = [];
  for (const [who, text, media] of [[info.me, day.mine, day.mineMedia], [info.partner, day.partner, day.partnerMedia]]) {
    if (!day.answered && who === info.me) continue;
    const top = y; ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
    const lines = text ? Math.min(7, wrap((ctx.font = `400 30px ${SANS}`, ctx), text, W - 2 * M - 60).length) : 1, hasM = (media || []).length;
    const h = 70 + lines * 40 + (hasM ? 220 : 0) + 20; rr(ctx, M, top, W - 2 * M, h, 22); ctx.fill(); ctx.stroke();
    eyebrow(ctx, who || '', M + 30, top + 48);
    let yy = top + 92;
    if (text) yy = para(ctx, text, M + 30, yy, W - 2 * M - 60, `400 30px ${SANS}`, C.ink, 40, 7);
    else if (text == null && who === info.partner) yy = para(ctx, L('Відповіді немає', 'No answer'), M + 30, yy, W - 2 * M - 60, `italic 400 30px ${SANS}`, C.soft, 40);
    if (hasM) { let x = M + 30; for (const m of media.slice(0, 4)) { const box = [x, yy - 10, 200, 200]; if (m.kind === 'video') { ctx.fillStyle = '#1c1d28'; rr(ctx, ...box, 18); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `600 26px ${SANS}`; ctx.fillText('▶ ' + L('відео', 'video'), x + 40, yy + 100); } else imgs.push([m.id, box]); x += 220; } }
    y = top + h + 22;
  }
  for (const [id, box] of imgs) { const im = await loadImg(id); if (im) drawCover(ctx, im, ...box); else { ctx.fillStyle = C.bg2; rr(ctx, ...box, 18); ctx.fill(); } }
  // день: подарунок, пригода, активність
  y = Math.max(y + 10, 1120);
  star(ctx, W / 2, y - 34, 10); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(M, y - 34); ctx.lineTo(W / 2 - 24, y - 34); ctx.moveTo(W / 2 + 24, y - 34); ctx.lineTo(W - M, y - 34); ctx.stroke();
  const gifts = [[L(`${info.me} дарує`, `Gift from ${info.me}`), day.gift, day.done && day.done.gift], [L(`${info.partner} дарує`, `Gift from ${info.partner}`), day.partnerGift, day.partnerGiftDone]].filter(g => g[1]);
  const rows = [...gifts, [L('Пригода для двох', 'Adventure for two'), day.intim, day.done && day.done.intim], [L('Спільна активність', 'Shared activity'), day.act, day.done && day.done.act]];
  if (!gifts.length) { eyebrow(ctx, L('Подарунки', 'Gifts'), M, y); y = para(ctx, L('Цього дня без подарунків', 'No gifts this day'), M, y + 40, W - 2 * M - 160, `italic 400 30px ${SANS}`, C.soft, 38) + 22; }
  const lh = gifts.length > 1 ? 34 : 40;
  for (const [label, title, done] of rows) {
    if (!title) continue;
    eyebrow(ctx, label, M, y);
    ctx.textAlign = 'right'; ctx.font = `600 22px ${SANS}`; ctx.fillStyle = done ? C.ok : C.soft; ctx.fillText(done ? '✓ ' + L('виконано', 'done') : L('не позначено', 'not marked'), W - M, y); ctx.textAlign = 'left';
    y = para(ctx, title, M, y + 40, W - 2 * M - 40, `500 ${gifts.length > 1 ? 32 : 34}px ${SERIF}`, C.ink, lh, 2) + 22;
  }
  // підвал
  footer(ctx, await brand('/assets/logo.png'));
  return new Promise(res => cv.toBlob(b => b.arrayBuffer().then(buf => res(new Uint8Array(buf))), 'image/jpeg', 0.86));
}

/** Мінімальний PDF: кожна сторінка A4 — одне JPEG-зображення на всю сторінку. */
function pdf(jpegs, title) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const utf16 = s => { let h = 'FEFF'; for (const ch of s) { const c = ch.codePointAt(0); if (c > 0xffff) { const v = c - 0x10000; h += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); } else h += c.toString(16).padStart(4, '0'); } return '<' + h.toUpperCase() + '>'; };
  push('%PDF-1.4\n'); push(new Uint8Array([37, 226, 227, 207, 211, 10]));
  const n = jpegs.length, kids = []; for (let i = 0; i < n; i++) kids.push(`${4 + i * 3} 0 R`);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`);
  obj(3, `<< /Title ${utf16(title)} /Producer (ReeAdvent) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z) >>`);
  jpegs.forEach((j, i) => {
    const p = 4 + i * 3, c = p + 1, im = p + 2, content = `q 595.28 0 0 841.89 0 0 cm /Im0 Do Q`;
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${c} 0 R >>`);
    obj(c, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`, j, '\nendstream']);
  });
  const total = 4 + n * 3, xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`; for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x); push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

function bookTitle() {
  const { L } = R(), st = R().st(), year = new Date(st.unlockTimes && st.unlockTimes[0] ? st.unlockTimes[0] : Date.now()).getFullYear();
  return `${L('Адвент', 'Advent')} ${year} ${st.me.name} & ${st.partner.name}`;
}
let busy = false;
async function makeBook(btn) {
  if (busy) return; busy = true; const { api, L, toast, dayDate } = R(); const label = btn ? btn.textContent : '';
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const h = await api('GET', '/api/history?book=1'), st = R().st(), title = bookTitle();
    const info = { title, me: st.me.name, partner: h.partnerName || st.partner.name, date: dayDate };
    const days = h.days.slice().sort((a, b) => a.day - b.day), jpegs = [], p = st.prog || {};
    info.year = new Date(st.unlockTimes && st.unlockTimes[0] ? st.unlockTimes[0] : Date.now()).getFullYear(); info.range = `${dayDate(1)} – ${dayDate(24)} ${info.year}`;
    if (btn) btn.textContent = L('Обкладинка…', 'Cover…'); jpegs.push(await cover(info, { answers: p.answered != null ? p.answered : days.filter(d => d.answered).length, tasks: p.tasks || 0 }));
    for (const d of days) { if (btn) btn.textContent = L(`Сторінка ${d.day} з ${days.length}…`, `Page ${d.day} of ${days.length}…`); jpegs.push(await page(d, info)); }
    const blob = pdf(jpegs, title), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = title.replace(/[\\/:*?"<>|]/g, '') + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); toast(L('Книгу збережено', 'The book is saved'));
    return blob;
  } catch (e) { toast(L('Не вдалося створити PDF', 'Could not create the PDF')); console.error(e); }
  finally { busy = false; if (btn) btn.textContent = label; }
}

/** Фінал: привітання на весь екран, салют і кнопка книги. */
function finale() {
  const { L, confetti } = R(), st = R().st(), p = st.prog || { answered: 24, tasks: 0 };
  if (document.getElementById('rafin')) return;
  const ov = document.createElement('div'); ov.id = 'rafin'; ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" style="text-align:center;gap:18px;padding-top:8vh">
    <div class="eyebrow">ReeAdvent · ${L('24 дні', '24 days')}</div>
    <h1 style="font-size:clamp(40px,10vw,64px);line-height:1.05">${L('Ваш <em>Адвент</em><br>завершено', 'Your <em>Advent</em><br>is complete')}</h1>
    <p class="muted" style="max-width:440px;margin:0 auto">${L(`${st.me.name} і ${st.partner.name}, 24 вікна позаду: ${plural(p.answered, ANS)} і ${plural(p.tasks, TASKS)}. Дякуємо, що були разом.`, `${st.me.name} and ${st.partner.name}, 24 windows behind you: ${p.answered} answers and ${p.tasks} completed tasks. Thank you for being together.`)}</p>
    <button class="btn" data-book="1" style="margin:0 auto">${L('Завантажити книгу', 'Download the book')} «${bookTitle()}» (PDF)</button>
    <button class="btn ghost sm" id="rafinx" style="margin:0 auto">${L('Закрити', 'Close')}</button></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#rafinx').onclick = () => ov.remove();
  let n = 0; const burst = () => { if (!document.body.contains(ov) || n++ > 6) return; confetti(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.2 + Math.random() * 0.3), 90); setTimeout(burst, 650); }; burst();
  try { localStorage.setItem('ra_finale_' + st.startDate, '1'); } catch {}
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-book]'); if (b) { e.preventDefault(); makeBook(b); } });
window.raBook = makeBook; window.raFinale = finale; window.raBookTitle = () => bookTitle(); window.raPdf = pdf;
})();
