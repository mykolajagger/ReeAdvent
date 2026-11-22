// Генератор перших 6 публікацій Instagram (@reeadvent): єдиний стиль, двомовні (UA великим, EN підписом), герої: Він і Вона.
// Єдина система: розмите тепле тло з ілюстрації пари, золота рамка, логотип угорі, арка-вікно з парою як фірмовий елемент.
// Запуск: node marketing/instagram/build.mjs   (потрібні playwright і ffmpeg). ONLY=04 — лише одна публікація. Результат: marketing/instagram/out/
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { QUESTIONS } from '../../src/logic.js'; import { QUESTIONS_EN } from '../../src/content_en.js';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(root, 'marketing/instagram/out'); fs.mkdirSync(OUT, { recursive: true });
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/assets', f)).toString('base64');
const LOGO = b64('logo.png'), LOGO_FULL = b64('logo-full.png');
const ARTFILE = path.join(root, 'marketing/instagram/assets/couple-art.png');
const ART = fs.existsSync(ARTFILE) ? 'data:image/png;base64,' + fs.readFileSync(ARTFILE).toString('base64') : null;   // ілюстрація пари (Firefly)
const P = [1, 2, 3, 4].map(k => 'data:image/png;base64,' + fs.readFileSync(path.join(root, `marketing/instagram/assets/p${k}.png`)).toString('base64'));
const qUA = i => QUESTIONS[i].text, qEN = i => Array.isArray(QUESTIONS_EN[i]) ? QUESTIONS_EN[i][0] : QUESTIONS_EN[i];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&display=swap');
:root{--gold:#d6b46a;--cream:#f3efe6;--muted:#a4a6b4}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:#08090d;color:var(--cream);font-family:'Cormorant Garamond',Georgia,serif;overflow:hidden;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,#1a1608 0%,#0b0c12 55%,#08090d 100%)}
.bgart{position:absolute;inset:-80px;background-size:cover;background-position:50% 55%;filter:blur(38px) brightness(.62) saturate(1.2)}
.veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 38%,rgba(8,9,13,.1),rgba(8,9,13,.62) 62%,rgba(8,9,13,.9) 100%)}
.stars{position:absolute;inset:0}
.frame{position:absolute;inset:34px;border:2px solid rgba(214,180,106,.5);border-radius:46px;pointer-events:none}
.toplogo{position:absolute;top:74px;left:50%;transform:translateX(-50%);width:230px;filter:drop-shadow(0 2px 14px rgba(0,0,0,.6))}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:90px}
.eyebrow{font:600 28px Inter,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
h1{font-weight:500;font-size:112px;line-height:1.02;margin:24px 0 20px;letter-spacing:-.01em}
h1 em{color:var(--gold);font-style:italic}
.big{font-weight:500;font-size:84px;line-height:1.1;margin:0}
.en{font:400 36px/1.35 Inter,Arial,sans-serif;color:var(--muted);margin-top:22px}
.gold{color:var(--gold)}
.num{font-weight:500;font-size:230px;line-height:1;color:var(--gold);margin:0 0 4px;font-style:italic}
.logo{width:480px;height:auto}.logo-full{width:640px;height:auto}
.foot{position:absolute;left:0;right:0;bottom:78px;text-align:center;font:500 28px Inter,Arial,sans-serif;letter-spacing:.14em;color:var(--muted)}
.swipe{position:absolute;right:84px;bottom:76px;font:500 30px Inter,Arial,sans-serif;color:var(--gold);letter-spacing:.1em}
.line{width:120px;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);margin:30px auto}
.arch{overflow:hidden;border:3px solid var(--gold);border-radius:999px 999px 30px 30px;box-shadow:0 0 90px rgba(255,190,100,.32);flex:none}
.arch img{width:100%;height:100%;object-fit:cover;object-position:50% 68%;display:block}
.names{font:500 30px Inter,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.ex{margin-top:42px;padding:26px 34px;border:1.5px solid rgba(214,180,106,.5);border-radius:26px;background:rgba(8,9,13,.45);max-width:860px}
.ex small{display:block;font:600 22px Inter,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
.ex .u{font:italic 500 46px/1.2 'Cormorant Garamond',serif;color:var(--cream)}.ex .e{font:400 28px/1.35 Inter,Arial,sans-serif;color:var(--muted);margin-top:8px}
`;
const starsJS = (w, h, n, seed) => `(()=>{const s=document.querySelector('.stars');let x=${seed};const r=()=>(x=(x*9301+49297)%233280)/233280;let h='';for(let i=0;i<${n};i++){const o=(.1+r()*.45).toFixed(2),z=(.8+r()*2.2).toFixed(1);h+='<circle cx="'+(r()*${w}).toFixed(0)+'" cy="'+(r()*${h}).toFixed(0)+'" r="'+z+'" fill="#f3efe6" opacity="'+o+'"/>';}s.innerHTML='<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">'+h+'</svg>';})();`;
const BG = `<div class="bg"></div>${ART ? `<div class="bgart" style="background-image:url(${ART})"></div><div class="veil"></div>` : ''}<div class="stars"></div><div class="frame"></div>`;
const archOf = (w, h, img = ART) => img ? `<div class="arch" style="width:${w}px;height:${h}px"><img src="${img}"></div>` : '';
const page4x5 = (inner, seed = 7, extra = '', opts = {}) => `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}${extra}</style><body>${BG}${opts.top === false ? '' : `<img class="toplogo" src="${LOGO}">`}${inner}<script>${starsJS(1080, 1350, 90, seed)}</script></body>`;

const slides = {};
// ---- 01: брендовий пост
slides['01-brand-post'] = [page4x5(`<div class="wrap" style="padding-top:70px">${archOf(500, 590)}<img class="logo-full" src="${LOGO_FULL}" style="width:560px;margin-top:34px"><div class="names" style="margin-top:6px">Він і Вона</div><div class="en" style="margin-top:12px;font-size:32px">Meet Him and Her: their advent starts here</div></div>`, 3, '', { top: false })];
// ---- 03: карусель «Як це працює»
const step = (n, ua, en, uaP, enP, seed) => page4x5(`<div class="wrap"><div class="num">${n}</div><h1 style="font-size:98px;margin-top:0">${ua}</h1><div class="en" style="margin-top:0;font-size:40px;color:var(--gold)">${en}</div><div class="line"></div><div class="big" style="font-size:52px;font-weight:400;max-width:860px">${uaP}</div><div class="en" style="max-width:820px;font-size:32px">${enP}</div></div><div class="swipe">→</div>`, seed);
slides['03-carousel-how'] = [
  page4x5(`<div class="wrap" style="padding-top:150px">${archOf(420, 480)}<h1 style="font-size:104px;margin-top:34px">Як це <em>працює</em></h1><div class="en" style="font-size:40px;color:var(--gold);margin:0">How it works</div><div class="line"></div><div class="names">Він і Вона</div><div class="en" style="margin-top:12px;font-size:30px">Три кроки на прикладі двох · Three steps, with Him and Her</div></div><div class="swipe">→</div>`, 11),
  step('01', 'Він замовляє', 'He orders', 'Імена обох, пошти, місто й дата старту. Через кілька хвилин лист приходить і йому, і їй.', 'Both names, emails, city and start date. Within minutes both of them get an email.', 12),
  step('02', 'Кожен заповнює анкету', 'Each fills in a questionnaire', 'Він і Вона відповідають окремо: бюджет, смаки, наскільки гра. Навіть партнер не бачить відповідей.', 'He and She answer separately: budget, tastes, how spicy. Not even the partner sees the answers.', 13),
  step('03', 'Щоранку нове вікно', 'A new window every morning', 'Він відповідає на питання для неї, потім відкриває подарунок, пригоду й активність.', 'He answers a question for her, then opens a gift, an adventure and an activity.', 14),
  page4x5(`<div class="wrap" style="padding-top:110px">${archOf(380, 430, P[3])}<h1 style="font-size:92px;margin-top:34px">24 дні лише <em>для вас</em></h1><div class="en" style="font-size:40px;color:var(--gold);margin-top:0">24 days just for the two of you</div><div class="en" style="margin-top:34px">Посилання в шапці профілю · Link in bio</div></div><div class="foot">REEADVENT.FUN · ДЛЯ ПАР ВІД 18 РОКІВ · 18+</div>`, 15)];
// ---- 06: карусель «питання» (приклади відповідей Миколи й Маргарити)
const QA = [
  [2, 'Він', 'Їй', 'he', 'her', 'Вона', 'Коли ми вперше разом дивилися, як падає сніг.', 'When we first watched the snow fall together.'],
  [11, 'Вона', 'Йому', 'she', 'him', 'Він', 'Той, де ми нікуди не поспішали.', 'The one where we were in no hurry.'],
  [22, 'Він', 'Їй', 'he', 'her', 'Вона', 'Кава в ліжку й ти поруч.', 'Coffee in bed with you beside me.'],
  [31, 'Вона', 'Йому', 'she', 'him', 'Він', 'Дім.', 'Home.'],
  [40, 'Він', 'Їй', 'he', 'her', 'Вона', 'Десь, де є камін, сніг і ти.', 'Somewhere with a fireplace, snow and you.']];
const qSlide = ([i, fromUA, toUA, fromEN, toEN, ansUA, aUA, aEN], n, seed) => page4x5(`<div class="wrap" style="padding-top:150px"><div class="eyebrow" style="font-size:26px">Питання ${n} з 5 · ${fromUA} → ${toUA}</div><div class="en" style="margin:10px 0 0;font-size:26px">Question ${n} of 5 · from ${fromEN} to ${toEN}</div><div class="line"></div><div class="big" style="font-size:80px;max-width:900px">${qUA(i)}</div><div class="en" style="font-size:38px;max-width:860px;margin-top:30px">${qEN(i)}</div><div class="ex"><small>Приклад відповіді: ${ansUA} · Example answer</small><div class="u">«${aUA}»</div><div class="e">${aEN}</div></div></div><div class="swipe">→</div>`, seed);
slides['06-carousel-questions'] = [
  page4x5(`<div class="wrap" style="padding-top:150px">${archOf(420, 480)}<h1 style="font-size:92px;margin-top:34px">5 питань для <em>теплої вечері</em></h1><div class="en" style="font-size:38px;color:var(--gold);margin:0">5 questions for a warm evening</div><div class="line"></div><div class="names" style="font-size:26px">Він і Вона питають одне одного</div><div class="en" style="margin-top:10px;font-size:30px">He and She ask each other</div></div><div class="swipe">→</div>`, 21),
  ...QA.map((q, k) => qSlide(q, k + 1, 22 + k)),
  page4x5(`<div class="wrap" style="padding-top:110px">${archOf(380, 430, P[0])}<div class="big" style="font-size:62px;margin-top:34px">Такі питання щодня, 24 дні</div><div class="en" style="font-size:36px">Questions like these every day, for 24 days</div><div class="en" style="margin-top:34px;color:var(--gold)">Посилання в шапці · Link in bio</div></div><div class="foot">REEADVENT.FUN</div>`, 27)];
// ---- 04: картка з парою
const cap4 = `<div style="position:absolute;left:0;right:0;bottom:84px;text-align:center"><div class="names" style="margin-bottom:14px">Він і Вона</div><div class="big" style="font-size:56px">Ваша історія. Ваш <span class="gold" style="font-style:italic">адвент</span>.</div><div class="en" style="margin-top:12px;font-size:32px">Your story. Your advent.</div></div>`;
let coupleHtml;
if (ART) coupleHtml = `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}</style><body><img src="${ART}" style="position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;object-position:50% 22%"><div style="position:absolute;left:0;right:0;bottom:0;height:380px;background:linear-gradient(180deg,transparent,#08090dcc 52%,#08090d)"></div><div class="frame"></div>${cap4}</body>`;
else { const { coupleScene } = await import('./couple.mjs'); coupleHtml = `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}</style><body>${coupleScene(null)}<div class="frame"></div>${cap4}</body>`; }
slides['04-couple-illustration'] = [coupleHtml];
// ---- 05: «24 вікна»
const wins = Array.from({ length: 24 }, (_, i) => { const n = i + 1, open = n <= 5, hot = n === 7; return `<div class="w ${open ? 'o' : ''} ${hot ? 'h' : ''}"><span>${n}</span></div>`; }).join('');
slides['05-calendar-24'] = [page4x5(`<div class="wrap" style="justify-content:flex-start;padding-top:170px"><div class="eyebrow" style="font-size:26px">24 вікна · 24 windows</div><h1 style="font-size:82px;margin:20px 0 6px">Який день відкриєте <em>першим?</em></h1><div class="en" style="margin:0 0 30px;font-size:34px">Which window would you open first?</div><div class="grid">${wins}</div><div class="en" style="margin-top:30px;color:var(--gold);font-size:30px;line-height:1.35">Він обрав №7. А Вона? А ви?<br><span style="color:var(--muted);font-size:26px">He picked No. 7. And she? And you? Tell us below</span></div></div><div class="foot" style="bottom:70px">REEADVENT.FUN</div>`, 31,
  `.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;width:880px}.w{aspect-ratio:1/1.1;border:2px solid #3a3320;border-radius:18px;background:linear-gradient(180deg,rgba(20,19,15,.85),rgba(13,13,16,.85));display:flex;align-items:center;justify-content:center;font:500 52px 'Cormorant Garamond',serif;color:var(--muted)}.w.o{border-color:var(--gold);background:radial-gradient(circle at 50% 40%,#5a4720,#1a150a);color:#ffe6a8;box-shadow:0 0 30px #d6b46a44}.w.h{border-color:#ffe6a8;box-shadow:0 0 46px #ffd36a99;color:#fff}`)];

slides['07-bonus-evenings'] = [page4x5(`<div class="wrap" style="padding-top:200px;padding-bottom:130px"><div class="eyebrow" style="font-size:26px">Він і Вона · He &amp; She</div><div class="grid2">${P.map(x => `<div class="arch" style="width:380px;height:450px"><img src="${x}"></div>`).join('')}</div><div class="big" style="font-size:52px;margin-top:24px">Вечори, які хочеться повторити</div><div class="en" style="font-size:30px;margin-top:8px">Evenings you will want to repeat</div></div>`, 41, '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:24px}')];
const browser = await chromium.launch();
const shoot = async (name, htmls, w, h) => {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  for (const [i, html] of htmls.entries()) { await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250); const file = htmls.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`; await p.screenshot({ path: path.join(OUT, file) }); console.log('png', file); }
  await p.close();
};
const ONLY = process.env.ONLY || '';
for (const [name, htmls] of Object.entries(slides)) if (!ONLY || name.startsWith(ONLY)) await shoot(name, htmls, 1080, 1350);

// ---- 02: Reel 1080×1920, 12,5 с, 24 к/с; Він і Вона, єдиний стиль
const SLOW = 1.6, FPS = 24, DUR = 13 * SLOW, FR = Math.round(FPS * DUR);
const reel = `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:540px;height:960px}
.bgart{inset:-40px;filter:blur(24px) brightness(.62) saturate(1.2)}.frame{inset:18px;border-radius:26px;border-width:1.5px}
.sc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.sc h2{font:500 58px/1.05 'Cormorant Garamond',serif;margin:0;color:var(--cream)}.sc h2 em{color:var(--gold)}.sc .en{font-size:18px;margin-top:12px}
.sc .names{font-size:15px}
.arch{box-shadow:0 0 50px rgba(255,190,100,.3);border-width:2px}
.mini{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;width:420px;margin-top:34px}.mini i{display:block;aspect-ratio:1/1.15;border:1.5px solid #3a3320;border-radius:9px;background:rgba(13,13,16,.8);opacity:0}
.door{position:relative;width:340px;height:380px;border:3px solid var(--gold);border-radius:170px 170px 14px 14px;overflow:hidden;background:radial-gradient(circle at 50% 55%,#ffe6a8,#c98a3c 60%,#3a2410)}
.door img.in{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 68%;opacity:0}
.door .l,.door .r{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(180deg,#1a150a,#0d0b07);border:1px solid #6b5420;z-index:3}.door .l{left:0;transform-origin:left center}.door .r{right:0;transform-origin:right center}
.door .d{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:4;font:italic 500 110px 'Cormorant Garamond',serif;color:var(--gold)}
.cards{width:430px;margin-top:20px}.card{display:flex;align-items:center;gap:16px;border:1.5px solid rgba(214,180,106,.55);border-radius:16px;background:rgba(10,9,7,.72);padding:11px 18px;margin-top:10px;opacity:0;text-align:left}
.card svg{width:40px;height:40px;flex:none}.card b{display:block;font:500 25px 'Cormorant Garamond',serif;color:var(--cream)}.card small{font:400 14px Inter,sans-serif;color:var(--muted)}
.pg{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:440px}.pn{border:2px solid var(--gold);border-radius:150px 150px 16px 16px;overflow:hidden;opacity:0;aspect-ratio:1/1.3}.pn img{width:100%;height:100%;object-fit:cover;display:block}
.end img.lf{width:360px}.end p{font:500 19px Inter,sans-serif;letter-spacing:.2em;color:var(--gold);margin:20px 0 0}
</style><body>${BG}
<div class="sc" id="a">${ART ? `<div class="arch" style="width:330px;height:400px"><img src="${ART}" id="ai"></div>` : ''}<img src="${LOGO_FULL}" style="width:360px;margin-top:22px"><div class="names" style="margin-top:4px">Він і Вона</div><div class="en" style="margin-top:8px">Адвент-календар для двох · An advent calendar for two</div></div>
<div class="sc" id="b"><h2>24 дні.<br><em>Одне вікно</em> щодня.</h2><div class="en">24 days. One window a day.</div><div class="mini">${'<i></i>'.repeat(24)}</div></div>
<div class="sc" id="c"><div class="eyebrow" style="font-size:15px;margin-bottom:16px">Вікно №7 · Він і Вона</div><div class="door">${ART ? `<img class="in" src="${ART}" id="di">` : ''}<div class="l"></div><div class="r"></div><div class="d" id="dn">7</div></div>
<div class="cards">
<div class="card"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="#d6b46a" stroke-width="2.4"/><path d="M18 19a6 6 0 1 1 9 5c-2 1.4-3 2.4-3 5M24 34v2" stroke="#d6b46a" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg><div><b>Питання від нього для неї</b><small>A question from him to her</small></div></div>
<div class="card"><svg viewBox="0 0 48 48"><rect x="8" y="20" width="32" height="20" rx="3" fill="none" stroke="#d6b46a" stroke-width="2.4"/><path d="M6 14h36v6H6zM24 14v26" stroke="#d6b46a" stroke-width="2.4" fill="none"/><path d="M24 14c-6-9-14-4-9 0M24 14c6-9 14-4 9 0" stroke="#d6b46a" stroke-width="2.4" fill="none"/></svg><div><b>Подарунок для неї</b><small>A gift for her</small></div></div>
<div class="card"><svg viewBox="0 0 48 48"><path d="M24 40S7 29 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 11-17 22-17 22z" fill="none" stroke="#d6b46a" stroke-width="2.4"/></svg><div><b>Пригода для нього і для неї</b><small>An adventure for him and her</small></div></div>
<div class="card"><svg viewBox="0 0 48 48"><path d="M24 5l3.5 10.5H38l-8.5 6.2 3.3 10.3L24 25.8l-8.8 6.2 3.3-10.3L10 15.5h10.5z" fill="none" stroke="#d6b46a" stroke-width="2.4"/></svg><div><b>Спільна активність</b><small>A shared activity</small></div></div></div></div>
<div class="sc" id="e"><div class="eyebrow" style="font-size:15px;margin-bottom:6px">Він і Вона · He &amp; She</div><div class="en" style="margin:0 0 18px;font-size:17px">Ваші вечори, ваші вікна · Your evenings, your windows</div><div class="pg">${[1,2,3,4].map(k=>`<div class="pn"><img src="${P[k-1]}"></div>`).join('')}</div></div>
<div class="sc end" id="d">${ART ? `<div class="arch" style="width:290px;height:340px"><img src="${ART}"></div>` : ''}<img class="lf" src="${LOGO_FULL}" style="margin-top:20px"><p>REEADVENT.FUN</p><div class="en" style="margin-top:14px">Посилання в шапці · Link in bio</div></div>
<script>${starsJS(540, 960, 70, 5)}
const E={out:x=>1-Math.pow(1-x,3),io:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2},C=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),ramp=(t,a,b)=>C((t-a)/(b-a));
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
window.setT=t=>{t=t/${SLOW};
 q('.stars').style.opacity=.75+.25*Math.sin(t*2.2);
 const sc=(id,a,b,fi=.5,fo=.45)=>{const e=q(id);e.style.opacity=Math.min(ramp(t,a,a+fi),1-ramp(t,b-fo,b));return e;};
 let e=sc('#a',0,2.9);e.style.transform='scale('+(0.94+0.06*E.out(ramp(t,0,1.6)))+')';const ai=q('#ai');if(ai)ai.style.transform='scale('+(1+0.1*ramp(t,0,2.9))+')';
 e=sc('#b',2.5,5.4);q('#b h2').style.transform='translateY('+(30*(1-E.out(ramp(t,2.6,3.4))))+'px)';
 all('.mini i').forEach((i,k)=>{const p=E.out(ramp(t,3.2+k*.045,3.5+k*.045));i.style.opacity=p;i.style.transform='scale('+(0.6+.4*p)+')';if(k===6){i.style.borderColor='#ffe6a8';i.style.boxShadow='0 0 16px #ffd36a99';}else if(k<5){i.style.borderColor='#d6b46a';i.style.background='radial-gradient(circle,#5a4720,#1a150a)';}});
 sc('#c',5.1,9.9);
 const open=E.io(ramp(t,6.0,7.0));q('.door .l').style.transform='perspective(600px) rotateY('+(-100*open)+'deg)';q('.door .r').style.transform='perspective(600px) rotateY('+(100*open)+'deg)';q('#dn').style.opacity=1-ramp(t,5.9,6.6);const di=q('#di');if(di){di.style.opacity=ramp(t,6.2,7.0);di.style.transform='scale('+(1.15-.15*ramp(t,6.2,8))+')';}
 all('.card').forEach((c,k)=>{const p=E.out(ramp(t,7.0+k*1.0,7.55+k*1.0));c.style.opacity=p;c.style.transform='translateX('+(40*(1-p))+'px)';});
 sc('#e',9.5,11.9);const pn=all('.pn');pn.forEach((x,k)=>{const p=E.out(ramp(t,9.7+k*.3,10.2+k*.3));x.style.opacity=p;x.style.transform='translateY('+(30*(1-p))+'px)';});
 sc('#d',11.5,13,.5,0.01);
};setT(0);</script></body>`;
if (!ONLY || ONLY === "02") {
  const p = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.setContent(reel, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  const fdir = path.join(OUT, '_frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
  for (let f = 0; f < FR; f++) { await p.evaluate(t => window.setT(t), f / FPS); await p.screenshot({ path: path.join(fdir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 }); if (f % 60 === 0) console.log('кадр', f, '/', FR); }
  await p.close();
  const mp4 = path.join(OUT, '02-reel.mp4');
  const wav = path.join(OUT, '_music.wav'); if (spawnSync('python3', [path.join(root, 'marketing/instagram/music.py'), wav, String(DUR)], { stdio: 'inherit' }).status !== 0) throw new Error('music failed');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(fdir, 'f%04d.jpg'), '-i', wav, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  fs.copyFileSync(path.join(fdir, 'f0060.jpg'), path.join(OUT, '02-reel-cover.jpg')); fs.rmSync(fdir, { recursive: true, force: true }); fs.copyFileSync(wav, path.join(OUT, '02-reel-music.wav')); fs.rmSync(wav);
  console.log('mp4', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + ' МБ');
}
await browser.close();
