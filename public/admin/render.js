/* Шаблони зображень для пропозицій агента: малюються в браузері на canvas (1080×1350 для постів і каруселей, 1080×1920 для сторіс).
   Той самий вигляд бачить адміністратор у перегляді й отримує Instagram/Facebook після погодження. Сцени лежать у /social/scenes/. */
const RN = (() => {
  const GOLD = '#d6b46a', CREAM = '#f3efe6', MUTED = '#a4a6b4', SER = '"Cormorant Garamond", Georgia, serif', SANS = 'Inter, Arial, sans-serif';
  const cache = {}, load = src => cache[src] || (cache[src] = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  let fontsP = null; const fonts = () => fontsP || (fontsP = Promise.all(['500 60px "Cormorant Garamond"', 'italic 500 60px "Cormorant Garamond"', '400 30px Inter', '600 30px Inter'].map(f => document.fonts.load(f, 'Аaіi1').catch(() => {}))));
  const cover = (ctx, im, x, y, w, h, fx = .5, fy = .4) => { const s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s; ctx.drawImage(im, x - (dw - w) * fx, y - (dh - h) * fy, dw, dh); };
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const arch = (ctx, x, y, w, h, rb = 30) => { const r = w / 2; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h - rb); ctx.arcTo(x + w, y + h, x + w - rb, y + h, rb); ctx.lineTo(x + rb, y + h); ctx.arcTo(x, y + h, x, y + h - rb, rb); ctx.closePath(); };
  const wrap = (ctx, text, maxW) => { const words = String(text || '').split(/\s+/).filter(Boolean), out = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (!cur || ctx.measureText(t).width <= maxW) cur = t; else { out.push(cur); cur = w; } } if (cur) out.push(cur); return out; };
  /** Підбирає найбільший розмір шрифту, за якого текст вміщається в maxLines рядків. */
  const fit = (ctx, text, font, maxW, maxLines, hi, lo) => { for (let s = hi; s >= lo; s -= 2) { ctx.font = font(s); const l = wrap(ctx, text, maxW); if (l.length <= maxLines && l.every(x => ctx.measureText(x).width <= maxW + 1)) return { size: s, lines: l }; } ctx.font = font(lo); return { size: lo, lines: wrap(ctx, text, maxW).slice(0, maxLines) }; };
  const draw = (ctx, lines, x, y, lh, align = 'center') => { ctx.textAlign = align; lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); return y + lines.length * lh; };
  const spaced = (ctx, text, x, y, px) => { ctx.textAlign = 'center'; if ('letterSpacing' in ctx) { ctx.letterSpacing = px + 'px'; ctx.fillText(text, x + px / 2, y); ctx.letterSpacing = '0px'; } else ctx.fillText(text, x, y); };
  const stars = (ctx, W, H) => { let x = 7; const r = () => (x = (x * 9301 + 49297) % 233280) / 233280; ctx.fillStyle = '#f3efe6'; for (let i = 0; i < Math.round(W * H / 15500); i++) { ctx.globalAlpha = .1 + r() * .4; ctx.beginPath(); ctx.arc(r() * W, r() * H, .8 + r() * 2.2, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; };
  function bg(ctx, W, H, im) {
    ctx.fillStyle = '#08090d'; ctx.fillRect(0, 0, W, H);
    if (im) { const a = document.createElement('canvas'); a.width = 36; a.height = Math.round(36 * H / W); cover(a.getContext('2d'), im, 0, 0, a.width, a.height); const b = document.createElement('canvas'); b.width = 180; b.height = Math.round(180 * H / W); const g = b.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(a, 0, 0, b.width, b.height); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(b, 0, 0, W, H); }
    ctx.fillStyle = 'rgba(8,9,13,.52)'; ctx.fillRect(0, 0, W, H);
    const gr = ctx.createRadialGradient(W / 2, H * .4, H * .1, W / 2, H * .4, H * .85); gr.addColorStop(0, 'rgba(8,9,13,0)'); gr.addColorStop(1, 'rgba(8,9,13,.72)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); stars(ctx, W, H);
  }
  const frame = (ctx, W, H) => { rr(ctx, 34, 34, W - 68, H - 68, 46); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(214,180,106,.5)'; ctx.stroke(); };
  const logoAt = (ctx, logo, W, y, w = 230) => { if (!logo) return; ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14; ctx.drawImage(logo, (W - w) / 2, y, w, w * logo.height / logo.width); ctx.restore(); };
  const glow = (ctx, path, blur = 60) => { ctx.save(); path(); ctx.shadowColor = 'rgba(255,190,100,.35)'; ctx.shadowBlur = blur; ctx.fillStyle = '#000'; ctx.fill(); ctx.restore(); };
  const picture = (ctx, im, path, x, y, w, h, fy = .35) => { glow(ctx, path); ctx.save(); path(); ctx.clip(); if (im) cover(ctx, im, x, y, w, h, .5, fy); ctx.restore(); path(); ctx.lineWidth = 3; ctx.strokeStyle = GOLD; ctx.stroke(); };
  const eyebrow = (ctx, text, W, y, size = 25) => { if (!text) return y; ctx.fillStyle = GOLD; ctx.font = `600 ${size}px ${SANS}`; spaced(ctx, String(text).toUpperCase(), W / 2, y, 5); return y + size + 22; };
  const sub = (ctx, text, W, y, size = 30, maxLines = 2, maxW = 880, color = MUTED) => { if (!text) return y; ctx.fillStyle = color; ctx.font = `400 ${size}px ${SANS}`; return draw(ctx, wrap(ctx, text, maxW).slice(0, maxLines), W / 2, y + size, size * 1.35); };
  const check = (ctx, x, y) => { ctx.beginPath(); ctx.arc(x, y, 25, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = GOLD; ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 10, y + 1); ctx.lineTo(x - 3, y + 9); ctx.lineTo(x + 11, y - 8); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); };

  const T = {
    /** Велика цитата під аркою з ілюстрацією. */
    quote(ctx, W, H, S, s, a) {
      bg(ctx, W, H, a.im); frame(ctx, W, H); logoAt(ctx, a.logo, W, S ? 262 : 74);
      const aw = 780, ah = S ? 760 : 540, ax = (W - aw) / 2, ay = S ? 400 : 176; picture(ctx, a.im, () => arch(ctx, ax, ay, aw, ah), ax, ay, aw, ah);
      let y = eyebrow(ctx, s.title, W, ay + ah + 62, S ? 26 : 24);
      const f = fit(ctx, s.text, z => `italic 500 ${z}px ${SER}`, 880, S ? 5 : 4, S ? 82 : 76, 42); ctx.fillStyle = CREAM; ctx.font = `italic 500 ${f.size}px ${SER}`; y = draw(ctx, f.lines, W / 2, y + f.size * .85, f.size * 1.12);
      sub(ctx, s.en, W, y + 6, 30, 3);
    },
    /** Заголовок і список із позначками. */
    tip(ctx, W, H, S, s, a) {
      bg(ctx, W, H, a.im); frame(ctx, W, H); logoAt(ctx, a.logo, W, S ? 262 : 74);
      const d = S ? 380 : 230, cy0 = S ? 380 : 170; picture(ctx, a.im, () => { ctx.beginPath(); ctx.arc(W / 2, cy0 + d / 2, d / 2, 0, 7); }, W / 2 - d / 2, cy0, d, d, .35);
      let y = eyebrow(ctx, s.title, W, cy0 + d + 62, 24);
      const f = fit(ctx, s.text, z => `500 ${z}px ${SER}`, 900, 2, S ? 80 : 66, 44); ctx.fillStyle = CREAM; ctx.font = `500 ${f.size}px ${SER}`; y = draw(ctx, f.lines, W / 2, y + f.size * .8, f.size * 1.08);
      y = sub(ctx, s.en, W, y + 2, 28, 2, 880); y += S ? 44 : 30;
      const rh = S ? 118 : 90; (s.items || []).slice(0, 5).forEach((it, i) => {
        const cy = y + i * rh + rh / 2; check(ctx, 150, cy); const g = fit(ctx, it, z => `500 ${z}px ${SER}`, 740, 1, 42, 28); ctx.fillStyle = CREAM; ctx.font = `500 ${g.size}px ${SER}`; ctx.textAlign = 'left'; ctx.fillText(g.lines[0] || '', 205, cy + g.size * .3);
        ctx.strokeStyle = 'rgba(214,180,106,.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(120, y + (i + 1) * rh); ctx.lineTo(W - 120, y + (i + 1) * rh); ctx.stroke(); });
    },
    /** Питання, яке пара ставить одне одному. */
    question(ctx, W, H, S, s, a) {
      bg(ctx, W, H, a.im); frame(ctx, W, H); logoAt(ctx, a.logo, W, S ? 262 : 74);
      const cw = 860, ch = S ? 760 : 500, x = (W - cw) / 2, y0 = S ? 380 : 176; picture(ctx, a.im, () => rr(ctx, x, y0, cw, ch, 44), x, y0, cw, ch);
      let y = eyebrow(ctx, s.title, W, y0 + ch + 66, S ? 25 : 23);
      const f = fit(ctx, s.text, z => `500 ${z}px ${SER}`, 900, 4, S ? 80 : 74, 44); ctx.fillStyle = CREAM; ctx.font = `500 ${f.size}px ${SER}`; y = draw(ctx, f.lines, W / 2, y + f.size * .8, f.size * 1.1);
      y = sub(ctx, s.en, W, y + 4, 30, 2);
      if (s.items && s.items[0]) { ctx.fillStyle = GOLD; ctx.font = `500 ${S ? 28 : 26}px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(s.items[0], W / 2, Math.max(y + 56, S ? 1580 : 1262)); }
    },
    /** Повноекранна ілюстрація із заголовком унизу. */
    announce(ctx, W, H, S, s, a) {
      ctx.fillStyle = '#08090d'; ctx.fillRect(0, 0, W, H); if (a.im) cover(ctx, a.im, 0, 0, W, H, .5, .35);
      const g1 = ctx.createLinearGradient(0, H * .42, 0, H); g1.addColorStop(0, 'rgba(8,9,13,0)'); g1.addColorStop(.55, 'rgba(8,9,13,.78)'); g1.addColorStop(1, 'rgba(8,9,13,.96)'); ctx.fillStyle = g1; ctx.fillRect(0, H * .42, W, H * .58);
      const g2 = ctx.createLinearGradient(0, 0, 0, 260); g2.addColorStop(0, 'rgba(8,9,13,.6)'); g2.addColorStop(1, 'rgba(8,9,13,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, 260);
      frame(ctx, W, H); logoAt(ctx, a.logo, W, S ? 262 : 74);
      const f = fit(ctx, s.text, z => `500 ${z}px ${SER}`, 900, 3, S ? 100 : 92, 50); ctx.font = `400 30px ${SANS}`; const en = wrap(ctx, s.en || '', 880).slice(0, 2);
      const total = (s.title ? 52 : 0) + f.lines.length * f.size * 1.08 + (en.length ? en.length * 40 + 14 : 0); let y = H - (S ? 330 : 118) - total;
      y = eyebrow(ctx, s.title, W, y + 26, 24) - 22 + (s.title ? 0 : 26);
      ctx.fillStyle = CREAM; ctx.font = `500 ${f.size}px ${SER}`; y = draw(ctx, f.lines, W / 2, y + f.size * .85, f.size * 1.08);
      sub(ctx, s.en, W, y + 4, 30, 2, 880, '#d9d6cc');
    },
    /** Логотип, велика фраза й адреса сайту. */
    cta(ctx, W, H, S, s, a) {
      bg(ctx, W, H, a.im); frame(ctx, W, H);
      const lw = 640, lh = a.logoFull ? lw * a.logoFull.height / a.logoFull.width : 290, ly = S ? 520 : 250; if (a.logoFull) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 20; ctx.drawImage(a.logoFull, (W - lw) / 2, ly, lw, lh); ctx.restore(); }
      let y = eyebrow(ctx, s.title, W, ly + lh + 60, 24);
      const f = fit(ctx, s.text, z => `italic 500 ${z}px ${SER}`, 880, 3, 92, 48); ctx.fillStyle = CREAM; ctx.font = `italic 500 ${f.size}px ${SER}`; y = draw(ctx, f.lines, W / 2, y + f.size * .85, f.size * 1.1);
      y = sub(ctx, s.en, W, y + 6, 32, 2);
      ctx.fillStyle = GOLD; ctx.font = `500 58px ${SER}`; ctx.textAlign = 'center'; ctx.fillText((s.items && s.items[0]) || 'reeadvent.fun', W / 2, y + 100);
      ctx.fillStyle = MUTED; ctx.font = `400 26px ${SANS}`; ctx.fillText('Посилання в шапці профілю · Link in bio', W / 2, y + 156);
    }
  };
  /** Малює один слайд; kind: 'post' (1080×1350) або 'story' (1080×1920). */
  async function render(slide, kind = 'post') {
    await fonts(); const S = kind === 'story', W = 1080, H = S ? 1920 : 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const [im, logo, logoFull] = await Promise.all([load(/^ref:/.test(slide.scene || '') ? '/api/media/' + slide.scene.slice(4) : `/social/scenes/s-${slide.scene}.jpg`), load('/assets/logo.png'), load('/assets/logo-full.png')]);
    (T[slide.template] || T.quote)(c.getContext('2d'), W, H, S, slide || {}, { im, logo, logoFull }); return c;
  }
  /** Стискає полотно в JPEG так, щоб влізти в ліміт (байти); null без ліміту. */
  async function toJpeg(canvas, maxBytes) {
    for (const q of [.92, .86, .8, .74, .68, .6, .5]) { const b = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q)); if (!maxBytes || b.size <= maxBytes) return b; }
    throw new Error('image_too_big');
  }
  return { render, toJpeg, load };
})();
