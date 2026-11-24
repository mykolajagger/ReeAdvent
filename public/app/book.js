/* Книга «Адвент [рік] [ім'я1] & [ім'я2]»: 24 сторінки PDF з пройденими днями (питання, обидві відповіді, фото, подарунок,
   пригода, активність, що виконано). Сторінки малюються на canvas прямо на пристрої (кирилиця й шрифти як на сайті),
   далі збираються в PDF (кожна сторінка — JPEG). На сервер нічого не відправляється. Також фінальна анімація. */
(() => {
'use strict';
const W = 1240, H = 1754, M = 96;                                // A4 при 150 dpi
const C = { bg: '#f8f3ea', ink: '#1d1b22', soft: '#6d6a74', gold: '#b48a3c', line: '#e4d9c6', card: '#fffdf8' };
const SERIF = '"Cormorant Garamond", Georgia, serif', SANS = 'Inter, system-ui, sans-serif';
const R = () => window.RA;

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

async function page(day, info) {
  const { L } = R(), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.gold; ctx.lineWidth = 2; rr(ctx, 40, 40, W - 80, H - 80, 28); ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  // шапка
  ctx.font = `600 22px ${SANS}`; ctx.fillStyle = C.gold; ctx.fillText(info.title.toUpperCase(), M, 120);
  ctx.textAlign = 'right'; ctx.fillStyle = C.soft; ctx.fillText(`${day.day} / 24`, W - M, 120); ctx.textAlign = 'left';
  ctx.font = `italic 500 96px ${SERIF}`; ctx.fillStyle = C.ink; ctx.fillText(L('Вікно', 'Window') + ' №' + day.day, M, 240);
  ctx.font = `500 30px ${SANS}`; ctx.fillStyle = C.soft; ctx.fillText(info.date(day.day), M, 290);
  let y = 360;
  // питання
  ctx.font = `600 20px ${SANS}`; ctx.fillStyle = C.gold; ctx.fillText(L('ПИТАННЯ ДНЯ', 'QUESTION OF THE DAY'), M, y); y += 52;
  y = para(ctx, day.question, M, y, W - 2 * M, `500 46px ${SERIF}`, C.ink, 54, 4) + 12;
  // відповіді
  const imgs = [];
  for (const [who, text, media] of [[info.me, day.mine, day.mineMedia], [info.partner, day.partner, day.partnerMedia]]) {
    if (!day.answered && who === info.me) continue;
    const top = y; ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    const lines = text ? Math.min(7, wrap((ctx.font = `400 30px ${SANS}`, ctx), text, W - 2 * M - 60).length) : 1, hasM = (media || []).length;
    const h = 70 + lines * 40 + (hasM ? 220 : 0) + 20; rr(ctx, M, top, W - 2 * M, h, 22); ctx.fill(); ctx.stroke();
    ctx.font = `600 22px ${SANS}`; ctx.fillStyle = C.gold; ctx.fillText(String(who || '').toUpperCase(), M + 30, top + 46);
    let yy = top + 92;
    if (text) yy = para(ctx, text, M + 30, yy, W - 2 * M - 60, `400 30px ${SANS}`, C.ink, 40, 7);
    else if (text == null && who === info.partner) yy = para(ctx, L('Відповіді немає', 'No answer'), M + 30, yy, W - 2 * M - 60, `italic 400 30px ${SANS}`, C.soft, 40);
    if (hasM) { let x = M + 30; for (const m of media.slice(0, 4)) { const box = [x, yy - 10, 200, 200]; if (m.kind === 'video') { ctx.fillStyle = '#2b2830'; rr(ctx, ...box, 18); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `600 26px ${SANS}`; ctx.fillText('▶ ' + L('відео', 'video'), x + 40, yy + 100); } else imgs.push([m.id, box]); x += 220; } }
    y = top + h + 22;
  }
  for (const [id, box] of imgs) { const im = await loadImg(id); if (im) drawCover(ctx, im, ...box); else { ctx.fillStyle = C.line; rr(ctx, ...box, 18); ctx.fill(); } }
  // день: подарунок, пригода, активність
  y = Math.max(y + 10, 1180);
  ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(M, y - 30); ctx.lineTo(W - M, y - 30); ctx.stroke();
  const rows = [[L('Подарунок', 'Gift'), day.gift, day.done && day.done.gift], [L('Пригода для двох', 'Adventure for two'), day.intim, day.done && day.done.intim], [L('Спільна активність', 'Shared activity'), day.act, day.done && day.done.act]];
  for (const [label, title, done] of rows) {
    if (!title && label === rows[0][0]) { ctx.font = `600 20px ${SANS}`; ctx.fillStyle = C.gold; ctx.fillText(label.toUpperCase(), M, y); y = para(ctx, L('Цього дня без подарунка', 'No gift this day'), M, y + 40, W - 2 * M - 160, `italic 400 30px ${SANS}`, C.soft, 38) + 26; continue; }
    if (!title) continue;
    ctx.font = `600 20px ${SANS}`; ctx.fillStyle = C.gold; ctx.fillText(label.toUpperCase(), M, y);
    ctx.textAlign = 'right'; ctx.font = `600 22px ${SANS}`; ctx.fillStyle = done ? '#3d8a5f' : C.soft; ctx.fillText(done ? '✓ ' + L('виконано', 'done') : L('не позначено', 'not marked'), W - M, y); ctx.textAlign = 'left';
    y = para(ctx, title, M, y + 42, W - 2 * M - 40, `500 34px ${SERIF}`, C.ink, 40, 2) + 26;
  }
  // підвал
  ctx.font = `italic 500 30px ${SERIF}`; ctx.fillStyle = C.gold; ctx.textAlign = 'center'; ctx.fillText('ReeAdvent · Unwrap Love. Every Day.', W / 2, H - 80); ctx.textAlign = 'left';
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
    const h = await api('GET', '/api/history'), st = R().st(), title = bookTitle();
    const info = { title, me: st.me.name, partner: h.partnerName || st.partner.name, date: dayDate };
    const days = h.days.slice().sort((a, b) => a.day - b.day), jpegs = [];
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
    <p class="muted" style="max-width:440px;margin:0 auto">${L(`${st.me.name} і ${st.partner.name}, 24 вікна позаду: ${p.answered} відповідей і ${p.tasks} виконаних завдань. Дякуємо, що були разом.`, `${st.me.name} and ${st.partner.name}, 24 windows behind you: ${p.answered} answers and ${p.tasks} completed tasks. Thank you for being together.`)}</p>
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
