// Генератор перших 6 публікацій Instagram (@reeadvent): двомовні (UA великим, EN підписом), у стилі сайту.
// Запуск: node marketing/instagram/build.mjs   (потрібні playwright і ffmpeg). Результат: marketing/instagram/out/
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { QUESTIONS } from '../../src/logic.js'; import { QUESTIONS_EN } from '../../src/content_en.js';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(root, 'marketing/instagram/out'); fs.mkdirSync(OUT, { recursive: true });
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/assets', f)).toString('base64');
const LOGO = b64('logo.png'), LOGO_FULL = b64('logo-full.png');
const qUA = i => QUESTIONS[i].text, qEN = i => Array.isArray(QUESTIONS_EN[i]) ? QUESTIONS_EN[i][0] : QUESTIONS_EN[i];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&display=swap');
:root{--gold:#d6b46a;--cream:#f3efe6;--muted:#9a9cab}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:#08090d;color:var(--cream);font-family:'Cormorant Garamond',Georgia,serif;overflow:hidden;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,#1a1608 0%,#0b0c12 55%,#08090d 100%)}
.stars{position:absolute;inset:0}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:90px}
.eyebrow{font:600 28px Inter,Arial,sans-serif;letter-spacing:.34em;text-transform:uppercase;color:var(--gold)}
h1{font-weight:500;font-size:118px;line-height:1.02;margin:26px 0 22px;letter-spacing:-.01em}
h1 em{color:var(--gold);font-style:italic}
.big{font-weight:500;font-size:96px;line-height:1.08;margin:0}
.en{font:400 38px/1.35 Inter,Arial,sans-serif;color:var(--muted);margin-top:26px}
.gold{color:var(--gold)}
.num{font-weight:500;font-size:260px;line-height:1;color:var(--gold);margin:0 0 6px;font-style:italic}
.logo{width:520px;height:auto}
.logo-full{width:820px;height:auto}
.foot{position:absolute;left:0;right:0;bottom:70px;text-align:center;font:500 30px Inter,Arial,sans-serif;letter-spacing:.14em;color:var(--muted)}
.swipe{position:absolute;right:70px;bottom:66px;font:500 30px Inter,Arial,sans-serif;color:var(--gold);letter-spacing:.1em}
.line{width:120px;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);margin:34px auto}
`;
const starsJS = (w, h, n, seed) => `(()=>{const s=document.querySelector('.stars');let x=${seed};const r=()=>(x=(x*9301+49297)%233280)/233280;let h='';for(let i=0;i<${n};i++){const o=(.12+r()*.55).toFixed(2),z=(.8+r()*2.6).toFixed(1);h+='<circle cx="'+(r()*${w}).toFixed(0)+'" cy="'+(r()*${h}).toFixed(0)+'" r="'+z+'" fill="#f3efe6" opacity="'+o+'"/>';}s.innerHTML='<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">'+h+'</svg>';})();`;
const page4x5 = (inner, seed = 7, extra = '') => `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}${extra}</style><body><div class="bg"></div><div class="stars"></div>${inner}<script>${starsJS(1080, 1350, 110, seed)}</script></body>`;

const slides = {};
// ---- 01: брендовий пост
slides['01-brand-post'] = [page4x5(`<div class="wrap"><img class="logo-full" src="${LOGO_FULL}"><div class="line"></div><div class="big" style="font-size:64px">Адвент-календар для двох</div><div class="en">An advent calendar for two</div></div><div class="foot">REEADVENT.FUN</div>`, 3)];
// ---- 03: карусель «Як це працює»
const step = (n, ua, en, uaP, enP, seed) => page4x5(`<div class="wrap"><div class="num">${n}</div><h1 style="font-size:104px;margin-top:0">${ua}</h1><div class="en" style="margin-top:0;font-size:42px;color:var(--gold)">${en}</div><div class="line"></div><div class="big" style="font-size:56px;font-weight:400;max-width:860px">${uaP}</div><div class="en" style="max-width:820px">${enP}</div></div><div class="swipe">→</div>`, seed);
slides['03-carousel-how'] = [
  page4x5(`<div class="wrap"><div class="eyebrow">ReeAdvent</div><h1>Як це <em>працює</em></h1><div class="en" style="font-size:44px;color:var(--gold);margin-top:0">How it works</div><div class="line"></div><div class="big" style="font-size:54px;font-weight:400">Три кроки до 24 днів сюрпризів</div><div class="en">Three steps to 24 days of surprises</div></div><div class="swipe">→</div>`, 11),
  step('01', 'Ви замовляєте', 'You order', 'Імена, пошти, місто й дата старту. Через кілька хвилин вам обом приходить лист.', 'Names, emails, city and start date. Within minutes both of you get an email.', 12),
  step('02', 'Заповнюєте анкети', 'You fill in questionnaires', 'Кожен окремо: бюджет подарунка, смаки, наскільки гра. Навіть партнер не бачить ваших відповідей.', 'Each of you separately: gift budget, tastes, how spicy. Not even your partner sees your answers.', 13),
  step('03', 'Щоранку нове вікно', 'A new window every morning', 'Питання одне одному, подарунок, пригода й спільна активність у вашому місті.', 'A question for each other, a gift, an adventure and a shared activity in your city.', 14),
  page4x5(`<div class="wrap"><img class="logo" src="${LOGO}"><div class="line"></div><h1 style="font-size:96px">24 дні лише <em>для вас</em></h1><div class="en" style="font-size:42px;color:var(--gold);margin-top:0">24 days just for the two of you</div><div class="en" style="margin-top:44px">Посилання в шапці профілю · Link in bio</div></div><div class="foot">REEADVENT.FUN · ДЛЯ ПАР ВІД 18 РОКІВ · 18+</div>`, 15)];
// ---- 06: карусель «питання»
const qSlide = (i, n, seed) => page4x5(`<div class="wrap"><div class="eyebrow">Питання ${n} з 5 · Question ${n} of 5</div><div class="line"></div><div class="big" style="font-size:88px;max-width:900px">${qUA(i)}</div><div class="en" style="font-size:42px;max-width:860px;margin-top:40px">${qEN(i)}</div></div><div class="swipe">→</div>`, seed);
slides['06-carousel-questions'] = [
  page4x5(`<div class="wrap"><div class="eyebrow">ReeAdvent</div><h1 style="font-size:104px">5 питань для <em>теплої вечері</em></h1><div class="en" style="font-size:44px;color:var(--gold);margin-top:0">5 questions for a warm evening</div><div class="line"></div><div class="big" style="font-size:50px;font-weight:400">Задайте їх одне одному сьогодні</div><div class="en">Ask each other tonight</div></div><div class="swipe">→</div>`, 21),
  qSlide(2, 1, 22), qSlide(11, 2, 23), qSlide(22, 3, 24), qSlide(31, 4, 25), qSlide(40, 5, 26),
  page4x5(`<div class="wrap"><img class="logo" src="${LOGO}"><div class="line"></div><div class="big" style="font-size:64px">Такі питання щодня, 24 дні</div><div class="en" style="font-size:40px">Questions like these every day, for 24 days</div><div class="en" style="margin-top:44px;color:var(--gold)">Посилання в шапці · Link in bio</div></div><div class="foot">REEADVENT.FUN</div>`, 27)];
// ---- 04: ілюстрація пари (вигадана ілюстрація, не фото реальних людей)
const COUPLE = path.join(root, 'marketing/instagram/assets/couple.png');
const cutoutUri = fs.existsSync(COUPLE) ? 'data:image/png;base64,' + fs.readFileSync(COUPLE).toString('base64') : null;
const coupleSVG = `<svg width="1080" height="1350" viewBox="0 0 1080 1350" style="position:absolute;inset:0">
<defs><radialGradient id="g" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="#ffd993"/><stop offset=".45" stop-color="#c98a3c"/><stop offset="1" stop-color="#3a2410"/></radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe3a6" stop-opacity=".9"/><stop offset="1" stop-color="#ffe3a6" stop-opacity="0"/></radialGradient>
<linearGradient id="room" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14100a"/><stop offset="1" stop-color="#08090d"/></linearGradient></defs>
<rect width="1080" height="1350" fill="url(#room)"/>
<ellipse cx="540" cy="560" rx="520" ry="520" fill="url(#glow)" opacity=".5"/>
<path d="M300 940 V470 Q300 250 540 250 Q780 250 780 470 V940 Z" fill="url(#g)"/>
<path d="M300 940 V470 Q300 250 540 250 Q780 250 780 470 V940 Z" fill="none" stroke="#2a1a0a" stroke-width="16"/>
<path d="M540 250 V940 M300 600 H780" stroke="#2a1a0a" stroke-width="10"/>
<g fill="#ffe9bd" opacity=".9">${Array.from({ length: 46 }, (_, i) => { const x = 320 + (i * 97) % 440, y = 300 + (i * 61) % 600, r = 2 + (i % 4); return `<circle cx="${x}" cy="${y}" r="${r}"/>`; }).join('')}</g>
<g transform="translate(540 760)"><path d="M0 -150 L-70 -40 H-35 L-95 60 H-45 L-120 160 H120 L45 60 H95 L35 -40 H70 Z" fill="#0f2a1c"/><rect x="-14" y="160" width="28" height="40" fill="#2a1a0a"/>
${[[-20, -90], [30, -40], [-50, 20], [55, 70], [-10, 100], [75, 130], [-85, 130]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#ffd36a"/><circle cx="${x}" cy="${y}" r="16" fill="#ffd36a" opacity=".25"/>`).join('')}<path d="M0 -168 l8 18 l20 2 l-15 13 l5 20 l-18 -11 l-18 11 l5 -20 l-15 -13 l20 -2 Z" fill="#ffe08a"/></g>
<path d="M-20 110 Q270 230 540 150 T1100 130" fill="none" stroke="#3a2a14" stroke-width="3"/>
${Array.from({ length: 15 }, (_, i) => { const x = i * 76 - 10; const y = 110 + Math.sin(i * 0.9) * 24 + (i < 7 ? i * 6 : (14 - i) * 6) + 50; return `<circle cx="${x}" cy="${y}" r="9" fill="#ffd36a"/><circle cx="${x}" cy="${y}" r="26" fill="#ffd36a" opacity=".22"/>`; }).join('')}
${cutoutUri ? `<ellipse cx="540" cy="900" rx="470" ry="380" fill="url(#glow)" opacity=".55"/><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="mk"><rect width="1080" height="1350" fill="#000"/><rect x="0" y="330" width="1080" height="900" fill="url(#fade)"/></mask><filter id="rim" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#ffc878" flood-opacity=".55"/></filter></defs><g mask="url(#mk)"><image href="${cutoutUri}" x="90" y="330" width="900" height="900" preserveAspectRatio="xMidYMax meet" filter="url(#rim)"/></g>` : `<rect x="0" y="940" width="1080" height="410" fill="#0b0a08"/>
<path d="M120 1350 V1010 Q120 940 190 940 H890 Q960 940 960 1010 V1350 Z" fill="#17120c"/>
<g stroke="#a8782f" stroke-width="3" stroke-opacity=".75"><g fill="#07080b"><path d="M468 880 C380 890 340 960 330 1130 H640 C630 960 580 890 500 880 Z"/><circle cx="470" cy="820" r="60"/><circle cx="470" cy="760" r="22"/></g>
<g fill="#0d0e14"><path d="M590 866 C490 880 460 960 440 1140 H780 C760 960 720 880 614 866 Z"/><circle cx="594" cy="798" r="62"/></g></g>
<path d="M300 1140 C420 1105 560 1120 700 1150 L720 1350 H280 Z" fill="#2a1d10"/><path d="M330 1150 C450 1120 570 1135 690 1165" stroke="#d6b46a" stroke-width="3" fill="none" opacity=".5"/>
`}${cutoutUri ? '' : `<g><rect x="820" y="1010" width="40" height="60" rx="6" fill="#3a2a14"/><path d="M840 1000 q-12 -22 0 -40 q12 18 0 40" fill="#ffd36a"/><circle cx="840" cy="990" r="46" fill="#ffd36a" opacity=".2"/></g>`}</svg>`;
slides['04-couple-illustration'] = [`<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}</style><body>${coupleSVG}<div style="position:absolute;left:0;right:0;bottom:0;height:230px;background:linear-gradient(180deg,transparent,#08090dee 40%);"></div><div style="position:absolute;left:0;right:0;bottom:62px;text-align:center"><div class="big" style="font-size:58px">Ваша історія. Ваш <span class="gold" style="font-style:italic">адвент</span>.</div><div class="en" style="margin-top:14px;font-size:34px">Your story. Your advent.</div></div></body>`];
// ---- 05: «24 вікна»
const wins = Array.from({ length: 24 }, (_, i) => { const n = i + 1, open = n <= 5, hot = n === 7; return `<div class="w ${open ? 'o' : ''} ${hot ? 'h' : ''}"><span>${n}</span></div>`; }).join('');
slides['05-calendar-24'] = [page4x5(`<div class="wrap" style="justify-content:flex-start;padding-top:96px"><div class="eyebrow">24 вікна · 24 windows</div><h1 style="font-size:84px;margin:22px 0 8px">Який день відкриєте <em>першим?</em></h1><div class="en" style="margin:0 0 34px;font-size:36px">Which window would you open first?</div><div class="grid">${wins}</div><div class="en" style="margin-top:34px;color:var(--gold);font-size:30px;white-space:nowrap">Напишіть цифру в коментарях · Tell us the number below</div></div><div class="foot">REEADVENT.FUN</div>`, 31,
  `.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:16px;width:900px}.w{aspect-ratio:1/1.15;border:2px solid #3a3320;border-radius:18px;background:linear-gradient(180deg,#14130f,#0d0d10);display:flex;align-items:center;justify-content:center;font:500 54px 'Cormorant Garamond',serif;color:var(--muted)}.w.o{border-color:var(--gold);background:radial-gradient(circle at 50% 40%,#5a4720,#1a150a);color:#ffe6a8;box-shadow:0 0 30px #d6b46a44}.w.h{border-color:#ffe6a8;box-shadow:0 0 46px #ffd36a99;color:#fff}`)];

const browser = await chromium.launch();
const shoot = async (name, htmls, w, h) => {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  for (const [i, html] of htmls.entries()) { await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250); const file = htmls.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`; await p.screenshot({ path: path.join(OUT, file) }); console.log('png', file); }
  await p.close();
};
const ONLY = process.env.ONLY || '';   // напр. ONLY=04 — перегенерувати лише одну публікацію
for (const [name, htmls] of Object.entries(slides)) if (!ONLY || name.startsWith(ONLY)) await shoot(name, htmls, 1080, 1350);

// ---- 02: Reel 1080×1920, 12,5 с, 24 к/с (кадри за часом → mp4)
const FPS = 24, DUR = 12.5, FR = Math.round(FPS * DUR);
const reel = `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:540px;height:960px}
.bg{position:absolute;inset:0}.sc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.sc h2{font:500 62px/1.05 'Cormorant Garamond',serif;margin:0;color:var(--cream)}.sc h2 em{color:var(--gold)}.sc .en{font-size:19px;margin-top:12px}
.mini{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;width:420px;margin-top:36px}.mini i{display:block;aspect-ratio:1/1.15;border:1.5px solid #3a3320;border-radius:9px;background:#0d0d10;opacity:0}
.door{position:relative;width:360px;height:440px;border:3px solid var(--gold);border-radius:180px 180px 14px 14px;overflow:hidden;background:radial-gradient(circle at 50% 55%,#ffe6a8,#c98a3c 60%,#3a2410)}
.door .l,.door .r{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(180deg,#1a150a,#0d0b07);border:1px solid #6b5420;z-index:3}.door .l{left:0;transform-origin:left center}.door .r{right:0;transform-origin:right center}
.door .d{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:4;font:italic 500 120px 'Cormorant Garamond',serif;color:var(--gold);opacity:1}
.cards{width:420px;margin-top:26px}.card{display:flex;align-items:center;gap:18px;border:1.5px solid #6b5420;border-radius:18px;background:linear-gradient(180deg,#14110a,#0c0b08);padding:14px 20px;margin-top:12px;opacity:0;text-align:left}
.card svg{width:44px;height:44px;flex:none}.card b{display:block;font:500 29px 'Cormorant Garamond',serif;color:var(--cream)}.card small{font:400 15px Inter,sans-serif;color:var(--muted)}
.end img{width:380px}.end p{font:500 20px Inter,sans-serif;letter-spacing:.2em;color:var(--gold);margin:26px 0 0}
</style><body><div class="bg"></div><div class="stars"></div>
<div class="sc" id="a"><img src="${LOGO_FULL}" style="width:420px"><div class="en" style="margin-top:26px">Адвент-календар для двох · An advent calendar for two</div></div>
<div class="sc" id="b"><h2>24 дні.<br><em>Одне вікно</em> щодня.</h2><div class="en">24 days. One window a day.</div><div class="mini">${'<i></i>'.repeat(24)}</div></div>
<div class="sc" id="c"><div class="eyebrow" style="font-size:16px;margin-bottom:22px">Вікно №7 · Window 7</div><div class="door"><div class="l"></div><div class="r"></div><div class="d" id="dn">7</div></div>
<div class="cards">
<div class="card"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="#d6b46a" stroke-width="2.4"/><path d="M18 19a6 6 0 1 1 9 5c-2 1.4-3 2.4-3 5M24 34v2" stroke="#d6b46a" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg><div><b>Питання дня</b><small>Question of the day</small></div></div>
<div class="card"><svg viewBox="0 0 48 48"><rect x="8" y="20" width="32" height="20" rx="3" fill="none" stroke="#d6b46a" stroke-width="2.4"/><path d="M6 14h36v6H6zM24 14v26" stroke="#d6b46a" stroke-width="2.4" fill="none"/><path d="M24 14c-6-9-14-4-9 0M24 14c6-9 14-4 9 0" stroke="#d6b46a" stroke-width="2.4" fill="none"/></svg><div><b>Подарунок</b><small>A gift</small></div></div>
<div class="card"><svg viewBox="0 0 48 48"><path d="M24 40S7 29 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 11-17 22-17 22z" fill="none" stroke="#d6b46a" stroke-width="2.4"/></svg><div><b>Пригода для двох</b><small>An adventure for two</small></div></div>
<div class="card"><svg viewBox="0 0 48 48"><path d="M24 5l3.5 10.5H38l-8.5 6.2 3.3 10.3L24 25.8l-8.8 6.2 3.3-10.3L10 15.5h10.5z" fill="none" stroke="#d6b46a" stroke-width="2.4"/></svg><div><b>Спільна активність</b><small>A shared activity</small></div></div></div></div>
<div class="sc end" id="d"><img src="${LOGO_FULL}"><p>REEADVENT.FUN</p><div class="en" style="margin-top:18px">Посилання в шапці · Link in bio</div></div>
<script>${starsJS(540, 960, 90, 5)}
const E={out:x=>1-Math.pow(1-x,3),io:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2},C=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),ramp=(t,a,b)=>C((t-a)/(b-a));
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
window.setT=t=>{
 // зірки мерехтять
 q('.stars').style.opacity=.75+.25*Math.sin(t*2.2);
 const sc=(id,a,b,fi=.5,fo=.45)=>{const e=q(id);e.style.opacity=Math.min(ramp(t,a,a+fi),1-ramp(t,b-fo,b));return e;};
 let e=sc('#a',0,2.9);e.style.transform='scale('+(0.92+0.08*E.out(ramp(t,0,1.6)))+')';
 e=sc('#b',2.5,5.4);q('#b h2').style.transform='translateY('+(30*(1-E.out(ramp(t,2.6,3.4))))+'px)';
 all('.mini i').forEach((i,k)=>{const p=E.out(ramp(t,3.2+k*.045,3.5+k*.045));i.style.opacity=p;i.style.transform='scale('+(0.6+.4*p)+')';if(k===6){i.style.borderColor='#ffe6a8';i.style.boxShadow='0 0 16px #ffd36a99';}else if(k<5){i.style.borderColor='#d6b46a';i.style.background='radial-gradient(circle,#5a4720,#1a150a)';}});
 sc('#c',5.1,10.5);
 const open=E.io(ramp(t,6.0,7.0));q('.door .l').style.transform='perspective(600px) rotateY('+(-100*open)+'deg)';q('.door .r').style.transform='perspective(600px) rotateY('+(100*open)+'deg)';q('#dn').style.opacity=1-ramp(t,5.9,6.6);
 all('.card').forEach((c,k)=>{const p=E.out(ramp(t,7.0+k*1.0,7.55+k*1.0));c.style.opacity=p;c.style.transform='translateX('+(40*(1-p))+'px)';});
 sc('#d',10.1,12.5,.5,0.01);
};setT(0);</script></body>`;
if (!ONLY || ONLY === '02') {
  const p = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.setContent(reel, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  const fdir = path.join(OUT, '_frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
  for (let f = 0; f < FR; f++) { await p.evaluate(t => window.setT(t), f / FPS); await p.screenshot({ path: path.join(fdir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 }); if (f % 60 === 0) console.log('кадр', f, '/', FR); }
  await p.close();
  const mp4 = path.join(OUT, '02-reel.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(fdir, 'f%04d.jpg'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  fs.copyFileSync(path.join(fdir, 'f0030.jpg'), path.join(OUT, '02-reel-cover.jpg')); fs.rmSync(fdir, { recursive: true, force: true });
  console.log('mp4', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + ' МБ');
}
await browser.close();
