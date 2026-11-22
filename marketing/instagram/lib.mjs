// Спільні заготовки генераторів публікацій (build3.mjs і далі): стиль бренду, фони зі сцен, рендер відео з музикою.
// Фони (b-*.jpg) і сцени (s-*.jpg) лежать у assets/ (див. prep-assets.py); вихід: marketing/instagram/out/
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(root, 'marketing/instagram/out'), AS = path.join(root, 'marketing/instagram/assets'); fs.mkdirSync(OUT, { recursive: true });
export const png64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/assets', f)).toString('base64');
export const jpg64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(AS, f)).toString('base64');
export const LOGO = png64('logo.png'), LOGO_FULL = png64('logo-full.png');
export const ONLY = (process.env.ONLY || '').toLowerCase(), sel = (name, group) => !ONLY || ONLY === group || name.toLowerCase().startsWith(ONLY);
// де на кадрі обличчя пари (для кадрування у вертикальних і вузьких рамках)
export const FOCUS = { tree: '59% 40%', pasta: '52% 38%', pillow: '50% 38%', book: '50% 38%', stars: '33% 42%', game: '56% 30%', wrap: '46% 30%', spa: '54% 28%', market: '50% 30%', movie: '48% 32%' };
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap');
:root{--gold:#d6b46a;--cream:#f3efe6;--muted:#a4a6b4}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:#08090d;color:var(--cream);font-family:'Cormorant Garamond',Georgia,serif;font-feature-settings:'lnum' 1;font-variant-numeric:lining-nums;overflow:hidden;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,#1a1608 0%,#0b0c12 55%,#08090d 100%)}
.sbg{position:absolute;inset:-3%;background-size:cover;background-position:center}
.still .sbg{filter:blur(16px)}
.veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,rgba(8,9,13,.05),rgba(8,9,13,.55) 65%,rgba(8,9,13,.85) 100%)}
.stars{position:absolute;inset:0}
.frame{position:absolute;inset:34px;border:2px solid rgba(214,180,106,.5);border-radius:46px;pointer-events:none}
.toplogo{position:absolute;top:74px;left:50%;transform:translateX(-50%);width:230px;filter:drop-shadow(0 2px 14px rgba(0,0,0,.6))}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:90px}
.eyebrow{font:600 28px Inter,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
h1{font-weight:500;font-size:104px;line-height:1.03;margin:22px 0 18px;letter-spacing:-.01em}
h1 em{color:var(--gold);font-style:italic}
.big{font-weight:500;font-size:84px;line-height:1.1;margin:0}
.en{font:400 34px/1.35 Inter,Arial,sans-serif;color:var(--muted);margin-top:20px}
.gold{color:var(--gold)}
.foot{position:absolute;left:0;right:0;bottom:78px;text-align:center;font:500 28px Inter,Arial,sans-serif;letter-spacing:.14em;color:var(--muted)}
.swipe{position:absolute;right:84px;bottom:76px;font:500 30px Inter,Arial,sans-serif;color:var(--gold);letter-spacing:.1em}
.line{width:120px;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);margin:26px auto}
.arch{overflow:hidden;border:3px solid var(--gold);border-radius:999px 999px 30px 30px;box-shadow:0 0 90px rgba(255,190,100,.32);flex:none}
.arch img,.rcard img{width:100%;height:100%;object-fit:cover;display:block}
.rcard{overflow:hidden;border:3px solid var(--gold);border-radius:44px;box-shadow:0 0 90px rgba(255,190,100,.28);flex:none;position:relative}
.names{font:500 30px Inter,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.p{font:400 36px/1.32 'Cormorant Garamond',serif;color:#e4dfd2;max-width:840px;margin-top:18px}
.badge{position:absolute;left:18px;top:16px;width:64px;height:64px;border-radius:50%;background:var(--gold);color:#17130a;font:600 34px/64px Inter,sans-serif;text-align:center;box-shadow:0 4px 18px #0008}
`;
export const starsJS = (w, h, n, seed) => `(()=>{const s=document.querySelector('.stars');let x=${seed};const r=()=>(x=(x*9301+49297)%233280)/233280;let h='';for(let i=0;i<${n};i++){const o=(.1+r()*.45).toFixed(2),z=(.8+r()*2.2).toFixed(1);h+='<circle cx="'+(r()*${w}).toFixed(0)+'" cy="'+(r()*${h}).toFixed(0)+'" r="'+z+'" fill="#f3efe6" opacity="'+o+'"/>';}s.innerHTML='<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">'+h+'</svg>';})();`;

/** Набір функцій для заданих сцен: сторінки, арки, картки, абсолютні блоки, кадрування (zoomBg). */
export function kit(names) {
  const SC = Object.fromEntries(names.map(n => [n, jpg64(`s-${n}.jpg`)])), BL = Object.fromEntries(names.map(n => [n, jpg64(`b-${n}.jpg`)]));
  const page = ({ w = 1080, h = 1350, bg, inner, seed = 7, top = true, topY = 74, extra = '' }) => `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:${w}px;height:${h}px}.toplogo{top:${topY}px}${extra}</style><body class="still"><div class="bg"></div><div class="sbg" style="background-image:url(${BL[bg]})"></div><div class="veil"></div><div class="stars"></div><div class="frame"></div>${top ? `<img class="toplogo" src="${LOGO}">` : ''}${inner}<script>${starsJS(w, h, Math.round(w * h / 15500), seed)}</script></body>`;
  const arch = (name, w, h, pos = '50% 40%', extra = '') => `<div class="arch" style="width:${w}px;height:${h}px;${extra}"><img src="${SC[name]}" style="object-position:${pos}"></div>`;
  const rcard = (name, w, h, pos = '50% 40%', extra = '', inner = '') => `<div class="rcard" style="width:${w}px;height:${h}px;${extra}"><img src="${SC[name]}" style="object-position:${pos}">${inner}</div>`;
  const abs = (top, html, extra = '') => `<div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;padding:0 90px;${extra}">${html}</div>`;
  /** CSS-фон із кадруванням сцени: центр (cx, cy) у частках зображення, збільшення z відносно «cover» у рамці W×H. */
  const zoomBg = (name, cx, cy, z, W, H) => { const s = Math.max(W, H) * z, ox = Math.min(0, Math.max(W - s, W / 2 - cx * s)), oy = Math.min(0, Math.max(H - s, H / 2 - cy * s)); return `background-image:url(${SC[name]});background-size:${s}px ${s}px;background-position:${ox}px ${oy}px;background-repeat:no-repeat;`; };
  return { SC, BL, page, arch, rcard, abs, zoomBg };
}

// ---------- відео 9:16 (540×960 у CSS-пікселях, DSF 2 → 1080×1920): сцени з перетіканням, наближення, музика ----------
export const REEL_CSS = `
body{width:540px;height:960px}.frame{inset:18px;border-radius:28px;border-width:1.5px;z-index:6}.toplogo{top:34px;width:118px;z-index:6}.stars{z-index:5}
.sc{position:absolute;inset:0;opacity:0}.sc .sbg{inset:-2%}
.chip{position:absolute;top:104px;left:0;right:0;text-align:center;font:600 15px Inter,sans-serif;letter-spacing:.3em;color:var(--gold);text-transform:uppercase}
.kc{position:absolute;left:36px;top:142px;width:468px;height:468px;border:2px solid var(--gold);border-radius:30px;overflow:hidden;box-shadow:0 0 50px rgba(255,190,100,.28)}
.kc img{width:100%;height:100%;object-fit:cover;display:block}
.cap{position:absolute;left:30px;right:30px;top:640px;text-align:center}
.cap .ua{font:500 40px/1.08 'Cormorant Garamond',serif;color:var(--cream)}.cap .ua em{color:var(--gold)}
.cap .en{font:400 17px/1.3 Inter,sans-serif;color:var(--muted);margin-top:8px}
.mid{position:absolute;left:0;right:0;text-align:center;padding:0 40px}
.mid .h2{font:500 56px/1.04 'Cormorant Garamond',serif}.mid .h2 em{color:var(--gold)}
.mid .en{font:400 19px/1.3 Inter,sans-serif;color:var(--muted);margin-top:12px}
.nm{font:500 16px Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-top:16px}
.dc{position:absolute;left:36px;width:468px;height:300px;border:2px solid var(--gold);border-radius:26px;overflow:hidden;box-shadow:0 0 40px rgba(255,190,100,.25)}
.dc img{width:100%;height:100%;object-fit:cover;display:block}
.dc .tag{position:absolute;left:12px;bottom:12px;padding:6px 14px 7px;border-radius:16px;background:rgba(8,9,13,.68);font:600 17px Inter,sans-serif;color:var(--cream)}.dc .tag b{color:var(--gold);margin-right:8px;font-size:19px}.dc .tag small{display:block;font:400 12px Inter,sans-serif;color:var(--muted);margin-top:1px}
.vs{position:absolute;left:50%;margin-left:-27px;width:54px;height:54px;border-radius:50%;background:var(--gold);color:#17130a;font:700 17px/54px Inter,sans-serif;text-align:center;z-index:3;box-shadow:0 4px 20px #000a}
.timer{position:absolute;left:120px;right:120px;height:6px;border-radius:3px;background:rgba(214,180,106,.25);overflow:hidden}.timer i{display:block;height:100%;width:100%;background:var(--gold);border-radius:3px}
`;
export const FPS = 24;
export async function renderVideo(browser, name, html, theme, coverAt = 4.4) {
  const dur = Number(html.match(/TOTAL=([\d.]+)/)[1]), FR = Math.round(dur * FPS), fdir = path.join(OUT, '_frames_' + name);
  const p = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
  for (let f = 0; f < FR; f++) { await p.evaluate(t => window.setT(t), f / FPS); await p.screenshot({ path: path.join(fdir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 }); if (f % 80 === 0) console.log(name, 'кадр', f, '/', FR); }
  await p.close();
  const wav = path.join(OUT, `_m_${name}.wav`); if (spawnSync('python3', [path.join(root, 'marketing/instagram/music.py'), wav, String(dur), theme], { stdio: 'inherit' }).status !== 0) throw new Error('music failed');
  const mp4 = path.join(OUT, name + '.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(fdir, 'f%04d.jpg'), '-i', wav, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  fs.copyFileSync(path.join(fdir, `f${String(Math.min(FR - 1, Math.round(FPS * coverAt))).padStart(4, '0')}.jpg`), path.join(OUT, name + '-cover.jpg')); fs.rmSync(fdir, { recursive: true, force: true }); fs.copyFileSync(wav, path.join(OUT, name + '-music.wav')); fs.rmSync(wav);
  console.log('mp4', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + ' МБ', dur + ' с');
}
