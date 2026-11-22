// Серія «Вечори вдвох»: 6 нових постів (2 каруселі, опитування, 3 картки), 6 сторіс, 2 Reels і сторіс-відео зі 5 сцен пари (ялинка, вечеря, подушки, книга, зорі).
// Той самий стиль, що й build.mjs: розмите тепле тло зі сцени, золота рамка, логотип, арки; українська велика, англійська підписом; герої «Він і Вона».
// Запуск: NODE_PATH=$(npm root -g) node marketing/instagram/build2.mjs   (потрібні playwright, ffmpeg, python3+numpy; спершу python3 marketing/instagram/prep-assets.py)
// Вибір: ONLY=posts | stories | reels | префікс імені (08, story-3, reel-one-day …). Результат: marketing/instagram/out/
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { QUESTIONS } from '../../src/logic.js'; import { QUESTIONS_EN } from '../../src/content_en.js';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(root, 'marketing/instagram/out'), AS = path.join(root, 'marketing/instagram/assets'); fs.mkdirSync(OUT, { recursive: true });
const png64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/assets', f)).toString('base64');
const jpg64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(AS, f)).toString('base64');
const LOGO = png64('logo.png'), LOGO_FULL = png64('logo-full.png');
const NAMES = ['tree', 'pasta', 'pillow', 'book', 'stars'];
const SC = Object.fromEntries(NAMES.map(n => [n, jpg64(`s-${n}.jpg`)])), BL = Object.fromEntries(NAMES.map(n => [n, jpg64(`b-${n}.jpg`)]));
const qUA = i => QUESTIONS[i].text, qEN = i => Array.isArray(QUESTIONS_EN[i]) ? QUESTIONS_EN[i][0] : QUESTIONS_EN[i];
const ONLY = (process.env.ONLY || '').toLowerCase(), sel = (name, group) => !ONLY || ONLY === group || name.toLowerCase().startsWith(ONLY);

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&display=swap');
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
const starsJS = (w, h, n, seed) => `(()=>{const s=document.querySelector('.stars');let x=${seed};const r=()=>(x=(x*9301+49297)%233280)/233280;let h='';for(let i=0;i<${n};i++){const o=(.1+r()*.45).toFixed(2),z=(.8+r()*2.2).toFixed(1);h+='<circle cx="'+(r()*${w}).toFixed(0)+'" cy="'+(r()*${h}).toFixed(0)+'" r="'+z+'" fill="#f3efe6" opacity="'+o+'"/>';}s.innerHTML='<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">'+h+'</svg>';})();`;
const page = ({ w = 1080, h = 1350, bg, inner, seed = 7, top = true, topY = 74, extra = '' }) => `<!doctype html><meta charset="utf-8"><style>${CSS}body{width:${w}px;height:${h}px}.toplogo{top:${topY}px}${extra}</style><body class="still"><div class="bg"></div><div class="sbg" style="background-image:url(${BL[bg]})"></div><div class="veil"></div><div class="stars"></div><div class="frame"></div>${top ? `<img class="toplogo" src="${LOGO}">` : ''}${inner}<script>${starsJS(w, h, Math.round(w * h / 15500), seed)}</script></body>`;
const arch = (name, w, h, pos = '50% 40%', extra = '') => `<div class="arch" style="width:${w}px;height:${h}px;${extra}"><img src="${SC[name]}" style="object-position:${pos}"></div>`;
const rcard = (name, w, h, pos = '50% 40%', extra = '', inner = '') => `<div class="rcard" style="width:${w}px;height:${h}px;${extra}"><img src="${SC[name]}" style="object-position:${pos}">${inner}</div>`;
const abs = (top, html, extra = '') => `<div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;padding:0 90px;${extra}">${html}</div>`;
// на яких місцях кадру обличчя пари (для кадрування у вертикальних картках)
const FOCUS = { tree: '59% 40%', pasta: '52% 38%', pillow: '50% 38%', book: '50% 38%', stars: '33% 42%' };

const slides = {};
// ---------- 08: карусель «Одне вікно: чотири сюрпризи»
const winSlide = ({ num, label, labelEn, ua, en, pUa, pEn, img, seed, arrow = true, h = 630 }) => page({ bg: img, seed, inner: `<div class="wrap" style="justify-content:flex-start;padding-top:176px">${arch(img, 780, h, FOCUS[img])}<div class="eyebrow" style="font-size:25px;margin-top:28px">${num} · ${label}</div><div class="en" style="font-size:22px;margin:2px 0 0;color:#8f91a0">${labelEn}</div><div class="big" style="font-size:60px;margin-top:8px">${ua}</div><div class="en" style="font-size:30px;margin-top:4px;color:var(--gold)">${en}</div><div class="p">${pUa}</div><div class="en" style="font-size:25px;margin-top:6px;max-width:840px">${pEn}</div></div>${arrow ? '<div class="swipe">→</div>' : ''}` });
slides['08-window-four'] = [
  page({ bg: 'tree', seed: 41, inner: `<div class="wrap" style="justify-content:flex-start;padding-top:176px">${arch('tree', 540, 600, FOCUS.tree)}<h1 style="font-size:92px;margin-top:34px">Що ховається за <em>одним вікном?</em></h1><div class="en" style="font-size:38px;color:var(--gold);margin:0">What hides behind one window?</div><div class="line"></div><div class="names">Він і Вона</div></div><div class="swipe">→</div>` }),
  winSlide({ num: '01', label: 'Питання дня', labelEn: 'Question of the day', ua: 'Питання, що зближує', en: 'A question that brings you closer', pUa: `Щодня одне питання для обох: «${qUA(17)}»`, pEn: `One question a day for both: “${qEN(17)}”`, img: 'book', seed: 42 }),
  winSlide({ num: '02', label: 'Подарунок', labelEn: 'Gift', ua: 'Подарунок із турботою', en: 'A gift with thought', pUa: 'Ідея за вашим бюджетом і смаками, а ще підказка, де її купити.', pEn: 'An idea matched to your budget and tastes, plus a hint on where to buy it.', img: 'tree', seed: 43 }),
  winSlide({ num: '03', label: 'Пригода', labelEn: 'Adventure', ua: 'Пригода для двох', en: 'An adventure for two', pUa: 'Місце чи затія у вашому місті: від тихого кафе до зоряної ночі.', pEn: 'A place or plan in your city, from a quiet café to a starry night.', img: 'stars', seed: 44 }),
  winSlide({ num: '04', label: 'Спільна активність', labelEn: 'Shared activity', ua: 'Те, що зробите разом', en: 'Something to do together', pUa: 'Від вечері вдвох до гри вдома: підібрано під ваші вподобання.', pEn: 'From dinner for two to a game at home, matched to your tastes.', img: 'pasta', seed: 45 }),
  page({ bg: 'pillow', seed: 46, inner: `<div class="wrap" style="justify-content:flex-start;padding-top:176px">${arch('pillow', 540, 600, FOCUS.pillow)}<h1 style="font-size:88px;margin-top:34px">Для неї. Для нього.<br><em>Для вас двох.</em></h1><div class="en" style="font-size:36px;color:var(--gold);margin:0">For her. For him. For both of you.</div><div class="en" style="margin-top:30px;font-size:30px">Посилання в шапці профілю · Link in bio</div></div><div class="foot">REEADVENT.FUN · ДЛЯ ПАР ВІД 18 РОКІВ · 18+</div>` })];
// ---------- 09: карусель «5 зимових вечорів удвох»
const ideas = [
  ['tree', 'Прикрасьте ялинку разом', 'Decorate the tree together', 'Один вмикає гірлянду, інша вішає кульки. Увімкніть музику й нікуди не поспішайте.', 'One handles the lights, the other the baubles. Put on music and take your time.'],
  ['pasta', 'Приготуйте вечерю вдвох', 'Cook dinner for two', 'Оберіть простий рецепт і розподіліть ролі. Свічка на столі обов’язкова.', 'Pick a simple recipe and split the roles. A candle on the table is a must.'],
  ['pillow', 'Влаштуйте подушковий бій', 'Have a pillow fight', 'Десять хвилин сміху кращі за будь-який серіал. Переможець обирає десерт.', 'Ten minutes of laughter beat any series. The winner picks dessert.'],
  ['book', 'Почитайте під пледом', 'Read under a blanket', 'Читайте вголос по черзі. Після розділу спитайте одне одного: «Що тобі відгукнулось?»', 'Take turns reading aloud. After a chapter ask: “What spoke to you?”'],
  ['stars', 'Подивіться на зорі', 'Watch the stars', 'Плед, термос і ясне небо. Якщо погода не дозволяє, влаштуйте зорі на балконі.', 'A blanket, a flask and a clear sky. If the weather says no, do it on the balcony.']];
slides['09-evenings-five'] = [
  page({ bg: 'tree', seed: 51, inner: `<div class="wrap" style="justify-content:flex-start;padding-top:176px">${arch('stars', 520, 540, FOCUS.stars)}<div style="display:flex;gap:16px;margin-top:28px">${NAMES.map(n => `<div style="width:150px;height:150px;border-radius:50%;overflow:hidden;border:3px solid var(--gold);box-shadow:0 0 30px rgba(255,190,100,.25)"><img src="${SC[n]}" style="width:100%;height:100%;object-fit:cover;object-position:${FOCUS[n]};display:block"></div>`).join('')}</div><h1 style="font-size:90px;margin-top:34px">5 зимових вечорів <em>удвох</em></h1><div class="en" style="font-size:36px;color:var(--gold);margin:0">5 winter evenings for two</div><div class="names" style="font-size:26px;margin-top:22px">Збережіть, щоб не загубити · Save it</div></div><div class="swipe">→</div>` }),
  ...ideas.map(([img, ua, en, pUa, pEn], i) => winSlide({ num: `0${i + 1}`, label: `Вечір ${i + 1} із 5`, labelEn: `Evening ${i + 1} of 5`, ua, en, pUa, pEn, img, seed: 52 + i, h: 610 })),
  page({ bg: 'book', seed: 58, inner: `<div class="wrap" style="justify-content:flex-start;padding-top:176px">${arch('book', 540, 600, FOCUS.book)}<div class="big" style="font-size:66px;margin-top:34px">Схожі ідеї щодня, 24 дні</div><div class="en" style="font-size:36px">Ideas like these every day, for 24 days</div><div class="en" style="margin-top:30px;color:var(--gold)">Посилання в шапці · Link in bio</div></div><div class="foot">REEADVENT.FUN</div>` })];
// ---------- 10: опитування «Який вечір ваш?»
const cell = (n, i, ua, en) => `<div style="position:relative;width:292px">${arch(n, 292, 300, FOCUS[n])}<div class="badge" style="left:50%;top:268px;margin-left:-32px;z-index:2">${i}</div><div style="font:500 30px 'Cormorant Garamond',serif;margin-top:46px">${ua}</div><div class="en" style="font-size:20px;margin:0">${en}</div></div>`;
slides['10-poll-evening'] = [page({ bg: 'tree', seed: 61, inner: `<div class="wrap" style="justify-content:flex-start;padding-top:178px"><div class="eyebrow" style="font-size:24px">Оберіть вечір · Pick an evening</div><h1 style="font-size:76px;margin:12px 0 0">Який вечір <em>ваш?</em></h1><div class="en" style="font-size:30px;margin:4px 0 20px">Which evening is yours?</div><div style="display:flex;gap:22px">${cell('tree', 1, 'Ялинка', 'Tree')}${cell('pasta', 2, 'Вечеря', 'Dinner')}${cell('pillow', 3, 'Подушки', 'Pillows')}</div><div style="display:flex;gap:22px;margin-top:18px">${cell('book', 4, 'Книга', 'Book')}${cell('stars', 5, 'Зорі', 'Stars')}</div></div>${abs(1262, `<div style="font:500 26px Inter,sans-serif;color:var(--gold)">Напишіть цифру в коментарях ✦ Comment the number</div>`)}` })];
// ---------- 11: «Вечеря вдвох» (на весь кадр)
const cap = (names, ua, en, uaSize = 62) => `<div style="position:absolute;left:0;right:0;bottom:84px;text-align:center;padding:0 80px"><div class="names" style="margin-bottom:14px">${names}</div><div class="big" style="font-size:${uaSize}px">${ua}</div><div class="en" style="margin-top:12px;font-size:32px">${en}</div></div>`;
slides['11-dinner-for-two'] = [`<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}</style><body><img src="${SC.pasta}" style="position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;object-position:50% 38%"><div style="position:absolute;left:0;right:0;bottom:0;height:520px;background:linear-gradient(180deg,transparent,#08090dcc 45%,#08090d)"></div><div class="frame"></div><img class="toplogo" src="${LOGO}">${cap('Він і Вона', 'Вечеря вдвох — теж <span class="gold" style="font-style:italic">подарунок</span>', 'Dinner for two is a gift too')}</body>`];
// ---------- 12: «Дозвольте собі побешкетувати»
slides['12-play'] = [page({ bg: 'pillow', seed: 71, inner: `<div class="wrap" style="justify-content:flex-start;padding-top:176px">${arch('pillow', 900, 760, FOCUS.pillow)}<div class="eyebrow" style="font-size:25px;margin-top:30px">Гра · Play</div><div class="big" style="font-size:62px;margin-top:10px">Дозвольте собі <em class="gold">побешкетувати</em></div><div class="en" style="font-size:30px;margin-top:8px">Let yourselves be playful</div><div class="p" style="font-size:32px">Гра, сміх і м’які завдання, завжди за взаємною згодою.</div></div>` })];
// ---------- 13: «Зоряна ніч»
slides['13-starry-night'] = [`<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}</style><body class="still"><div class="bg"></div><div class="sbg" style="background-image:url(${BL.stars})"></div><div class="veil"></div><div class="stars"></div><div style="position:absolute;left:60px;top:176px;width:960px;height:960px;border:3px solid var(--gold);border-radius:44px;overflow:hidden;box-shadow:0 0 90px rgba(255,190,100,.28);-webkit-mask-image:linear-gradient(180deg,#000 62%,transparent 98%);mask-image:linear-gradient(180deg,#000 62%,transparent 98%)"><img src="${SC.stars}" style="width:100%;height:100%;object-fit:cover;object-position:30% 40%;display:block"></div><div class="frame"></div><img class="toplogo" src="${LOGO}">${abs(1000, `<div class="eyebrow" style="font-size:25px">Пригода · Adventure</div><div class="big" style="font-size:92px;margin-top:6px">Зоряна ніч</div><div class="en" style="font-size:34px;margin-top:4px;color:var(--gold)">A night under the stars</div><div class="p" style="font-size:32px;margin-top:12px">Плед, термос і ясне небо. Більше нічого не треба.</div>`)}<script>${starsJS(1080, 1350, 40, 81)}</script></body>`];

// ---------- сторіс 1080×1920 (важливе між 250 і 1670 по висоті: зверху й знизу інтерфейс Instagram)
const SP = { w: 1080, h: 1920, topY: 262, top: true };
const story = (bg, inner, seed) => page({ ...SP, bg, seed, inner });
const pic = (name, h, top, pos) => `<div style="position:absolute;left:110px;top:${top}px">${rcard(name, 860, h, pos || FOCUS[name])}</div>`;
slides['story-1-start'] = [story('tree', `${abs(388, `<div class="eyebrow" style="font-size:26px">Адвент-календар для двох</div><div class="en" style="font-size:22px;margin:4px 0 0">An advent calendar for two</div>`)}${pic('tree', 800, 500)}${abs(1340, `<h1 style="font-size:100px;margin:0">Старт <em>1 грудня</em></h1><div class="en" style="font-size:38px;margin-top:6px;color:var(--gold)">Starts December 1</div><div style="font:500 28px Inter,sans-serif;color:var(--muted);margin-top:30px;letter-spacing:.06em">Для неї. Для нього. Для вас двох.</div>`)}`, 91)];
const ab = (name, letter, top) => `<div style="position:absolute;left:110px;top:${top}px">${rcard(name, 860, 430, FOCUS[name], '', `<div class="badge" style="left:24px;top:22px;width:76px;height:76px;font-size:40px;line-height:76px">${letter}</div>`)}</div>`;
slides['story-2-choose'] = [story('pasta', `${abs(380, `<div class="eyebrow" style="font-size:24px">Вечір на двох · An evening for two</div><h1 style="font-size:78px;margin:14px 0 4px">Що обираєте <em>на вечір?</em></h1><div class="en" style="font-size:32px;margin:0">What do you pick tonight?</div>`)}${ab('tree', 'A', 640)}${ab('pasta', 'B', 1100)}${abs(1560, `<div style="font:500 28px Inter,sans-serif;color:var(--gold)">Відповідайте A або B ✦ Reply A or B</div>`)}`, 92)];
slides['story-3-question'] = [story('book', `${pic('book', 760, 380)}${abs(1180, `<div class="eyebrow" style="font-size:25px">Питання дня · Question of the day</div><div class="big" style="font-size:58px;margin-top:14px">${qUA(5)}</div><div class="en" style="font-size:28px;margin-top:12px">${qEN(5)}</div><div style="font:500 26px Inter,sans-serif;color:var(--gold);margin-top:28px">Відповідайте одне одному вголос ✦</div>`)}`, 93)];
slides['story-4-stars'] = [story('stars', `${pic('stars', 940, 380)}${abs(1360, `<div class="eyebrow" style="font-size:25px">Пригода на вечір · Tonight’s adventure</div><h1 style="font-size:104px;margin:6px 0 0">Зоряна <em>ніч</em></h1><div class="en" style="font-size:34px;margin-top:2px;color:var(--gold)">A night under the stars</div>`)}`, 94)];
slides['story-5-play'] = [story('pillow', `${pic('pillow', 800, 380)}${abs(1240, `<div class="eyebrow" style="font-size:25px">Гра на вечір · Play</div><h1 style="font-size:96px;margin:6px 0 0">10 хвилин <em>сміху</em></h1><div class="p" style="font-size:36px;margin-top:8px">Подушковий бій: переможець обирає десерт.</div><div class="en" style="font-size:26px;margin-top:6px">A pillow fight: the winner picks dessert.</div>`)}`, 95)];
slides['story-6-order'] = [story('tree', `<div style="position:absolute;left:0;right:0;top:390px;display:flex;justify-content:center">${arch('tree', 560, 620, FOCUS.tree)}</div>${abs(1060, `<img src="${LOGO_FULL}" style="width:600px"><div class="eyebrow" style="font-size:28px;margin-top:6px">24 дні · 24 вікна</div><div style="font:500 52px 'Cormorant Garamond',serif;color:var(--cream);margin-top:22px">reeadvent.fun</div><div class="en" style="font-size:26px;margin-top:12px">Посилання в шапці профілю · Link in bio</div>`)}`, 96)];

// ---------- відео (Reels 9:16 і сторіс-відео): сцени з перетіканням, ефект наближення, музика
const REEL_CSS = `
body{width:540px;height:960px}.frame{inset:18px;border-radius:28px;border-width:1.5px;z-index:6}.toplogo{top:34px;width:118px;z-index:6}.stars{z-index:5}
.sc{position:absolute;inset:0;opacity:0}.sc .sbg{inset:-2%}
.chip{position:absolute;top:104px;left:0;right:0;text-align:center;font:600 15px Inter,sans-serif;letter-spacing:.3em;color:var(--gold);text-transform:uppercase}
.kc{position:absolute;left:36px;top:142px;width:468px;height:468px;border:2px solid var(--gold);border-radius:30px;overflow:hidden;box-shadow:0 0 50px rgba(255,190,100,.28)}
.kc img{width:100%;height:100%;object-fit:cover;display:block}
.cap{position:absolute;left:30px;right:30px;top:640px;text-align:center}
.cap .ua{font:500 40px/1.08 'Cormorant Garamond',serif;color:var(--cream)}.cap .ua em{color:var(--gold)}
.cap .en{font:400 17px/1.3 Inter,sans-serif;color:var(--muted);margin-top:8px}
.cap .q{font:italic 500 23px/1.25 'Cormorant Garamond',serif;color:#e8dcc0;margin-top:12px}
.mid{position:absolute;left:0;right:0;text-align:center;padding:0 40px}
.mid .h2{font:500 56px/1.04 'Cormorant Garamond',serif}.mid .h2 em{color:var(--gold)}
.mid .en{font:400 19px/1.3 Inter,sans-serif;color:var(--muted);margin-top:12px}
.row5{display:flex;justify-content:center;gap:8px}.ma{width:86px;height:128px;border:2px solid var(--gold);border-radius:999px 999px 10px 10px;overflow:hidden;box-shadow:0 0 24px rgba(255,190,100,.25);opacity:0}.ma img{width:100%;height:100%;object-fit:cover;display:block}
.nm{font:500 16px Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-top:16px}
.clock{display:inline-block;padding:6px 16px;border:1.5px solid rgba(214,180,106,.7);border-radius:20px;background:rgba(8,9,13,.55);font:600 17px Inter,sans-serif;letter-spacing:.18em;color:var(--gold)}
.day{position:absolute;top:84px;left:60px;right:60px;height:3px;background:rgba(214,180,106,.25);border-radius:2px}.day i{position:absolute;left:0;top:0;height:3px;width:0;background:var(--gold);border-radius:2px}
`;
const sceneCard = (s, i) => `<div class="sc" id="s${i}"><div class="sbg" style="background-image:url(${BL[s.img]})"></div><div class="veil"></div>${s.clock ? `<div class="chip"><span class="clock">${s.clock}</span></div>` : `<div class="chip">${s.chip || ''}</div>`}<div class="kc"><img src="${SC[s.img]}" style="object-position:${s.pos || FOCUS[s.img]}"></div><div class="cap"><div class="ua">${s.ua}</div><div class="en">${s.en}</div>${s.q ? `<div class="q">${s.q}</div>` : ''}</div></div>`;
const sceneTitle = (s, i) => `<div class="sc" id="s${i}"><div class="sbg" style="background-image:url(${BL[s.img]})"></div><div class="veil"></div><div class="mid" style="top:${s.strip ? 270 : s.arch ? 215 : 300}px">${s.strip ? `<div class="row5">${NAMES.map(n => `<div class="ma pop"><img src="${SC[n]}" style="object-position:${FOCUS[n]}"></div>`).join('')}</div>` : s.arch ? `<div class="ma pop" style="width:230px;height:300px;margin:0 auto;border-width:2.5px"><img src="${SC[s.arch]}" style="object-position:${FOCUS[s.arch]}"></div>` : ''}<div class="h2" style="margin-top:${s.strip || s.arch ? 36 : 0}px">${s.ua}</div><div class="en">${s.en}</div><div class="nm">${s.names || 'Він і Вона'}</div></div></div>`;
const sceneCta = (s, i) => `<div class="sc" id="s${i}"><div class="sbg" style="background-image:url(${BL[s.img || 'tree']})"></div><div class="veil"></div><div class="mid" style="top:250px"><img src="${LOGO_FULL}" style="width:330px"><div class="nm" style="margin-top:6px">24 дні · 24 вікна</div><div class="h2" style="font-size:44px;margin-top:22px">${s.ua}</div><div class="en">${s.en}</div><div class="nm" style="margin-top:26px;font-size:20px">REEADVENT.FUN</div><div class="en" style="margin-top:10px">Посилання в шапці · Link in bio</div></div></div>`;
const reelHtml = (scenes, { progress = false } = {}) => {
  let t0 = 0; scenes.forEach(s => { s.at = t0; t0 += s.dur; });
  const body = scenes.map((s, i) => (s.kind === 'title' ? sceneTitle : s.kind === 'cta' ? sceneCta : sceneCard)(s, i)).join('');
  return `<!doctype html><meta charset="utf-8"><style>${CSS}${REEL_CSS}</style><body><div class="bg"></div>${body}${progress ? '<div class="day"><i id="dayp"></i></div>' : ''}<div class="stars"></div><div class="frame"></div><img class="toplogo" src="${LOGO}"><script>${starsJS(540, 960, 55, 9)}
const S=${JSON.stringify(scenes.map(s => ({ at: s.at, dur: s.dur })))},TOTAL=${scenes.reduce((a, s) => a + s.dur, 0)},CL=${JSON.stringify(scenes.map(s => s.clock || null))};
const R=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),E=x=>1-Math.pow(1-x,3),q=(el,s)=>el.querySelector(s);
window.setT=t=>{
  document.querySelector('.stars').style.opacity=.7+.3*Math.sin(t*2.1);
  S.forEach((s,i)=>{const el=document.getElementById('s'+i),nx=S[i+1];
    el.style.opacity=i===0?1:R(t,s.at,s.at+.45); el.style.display=(nx&&t>nx.at+.5)?'none':'block';
    const p=R(t,s.at,s.at+s.dur),im=q(el,'.kc img');if(im)im.style.transform='scale('+(1+.09*p)+')';
    const cap=q(el,'.cap');if(cap){const k=E(R(t,s.at+.12,s.at+.6));cap.style.opacity=k;cap.style.transform='translateY('+(22*(1-k))+'px)';}
    const ch=q(el,'.chip');if(ch)ch.style.opacity=E(R(t,s.at,s.at+.4));
    el.querySelectorAll('.pop').forEach((m,k)=>{const z=E(R(t,s.at+.1+k*.16,s.at+.55+k*.16));m.style.opacity=z;m.style.transform='translateY('+(28*(1-z))+'px) scale('+(.85+.15*z)+')';});
    const mid=q(el,'.mid');if(mid&&!el.querySelector('.pop')){const k=E(R(t,s.at+.1,s.at+.7));mid.style.opacity=i===0?1:k;mid.style.transform='translateY('+(18*(1-k))+'px)';}
  });
  const dp=document.getElementById('dayp');if(dp)dp.style.width=(100*R(t,0,TOTAL-2.5))+'%';
};setT(0);</script></body>`;
};
const FPS = 24;
async function renderVideo(browser, name, html, theme) {
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
  fs.copyFileSync(path.join(fdir, `f${String(Math.min(FR - 1, Math.round(FPS * 3.4))).padStart(4, '0')}.jpg`), path.join(OUT, name + '-cover.jpg')); fs.rmSync(fdir, { recursive: true, force: true }); fs.copyFileSync(wav, path.join(OUT, name + '-music.wav')); fs.rmSync(wav);
  console.log('mp4', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + ' МБ', dur + ' с');
}
const reels = {
  'reel-5-evenings': { theme: 'b', html: () => reelHtml([
    { kind: 'title', img: 'tree', strip: true, ua: '5 вечорів<br><em>для двох</em>', en: '5 evenings for two', dur: 3 },
    { img: 'tree', chip: '01', ua: 'Прикрасьте ялинку', en: 'Decorate the tree together', dur: 2.6 },
    { img: 'pasta', chip: '02', ua: 'Приготуйте вечерю', en: 'Cook dinner together', dur: 2.6 },
    { img: 'pillow', chip: '03', ua: 'Влаштуйте <em>подушковий бій</em>', en: 'Have a pillow fight', dur: 2.6 },
    { img: 'book', chip: '04', ua: 'Почитайте під пледом', en: 'Read under a blanket', dur: 2.6 },
    { img: 'stars', chip: '05', ua: 'Подивіться на зорі', en: 'Watch the stars', dur: 2.6 },
    { kind: 'cta', img: 'tree', ua: 'Такі вечори<br>щодня', en: 'Evenings like these, every day', dur: 3.2 }]) },
  'reel-one-day': { theme: 'a', progress: true, html: () => reelHtml([
    { kind: 'title', img: 'book', arch: 'book', ua: 'Один день<br><em>у ReeAdvent</em>', en: 'One day in ReeAdvent', dur: 2.8 },
    { img: 'book', clock: '08:00', ua: 'Ранок: <em>питання дня</em>', en: 'Morning: the question of the day', q: `«${qUA(5)}»`, dur: 3.2 },
    { img: 'tree', clock: '13:00', ua: 'День: <em>подарунок</em>', en: 'Afternoon: a gift', dur: 3 },
    { img: 'pasta', clock: '19:00', ua: 'Вечір: <em>активність</em> вдвох', en: 'Evening: a shared activity', dur: 3 },
    { img: 'stars', clock: '22:00', ua: 'Ніч: <em>пригода</em> для двох', en: 'Night: an adventure for two', dur: 3 },
    { img: 'pillow', clock: '23:00', ua: 'А ще — трохи <em>гри</em>', en: 'And a little play', dur: 2.8 },
    { kind: 'cta', img: 'book', ua: '24 дні лише<br>для вас', en: '24 days just for the two of you', dur: 3.2 }], { progress: true }) },
  'story-video': { theme: 'b', html: () => reelHtml([
    { kind: 'title', img: 'tree', strip: true, ua: '24 вікна<br><em>для двох</em>', en: '24 windows for two', dur: 1.8 },
    { img: 'tree', chip: '', ua: 'Ялинка', en: 'Tree', dur: 1.3 }, { img: 'pasta', chip: '', ua: 'Вечеря', en: 'Dinner', dur: 1.3 }, { img: 'pillow', chip: '', ua: 'Гра', en: 'Play', dur: 1.3 },
    { img: 'book', chip: '', ua: 'Книга', en: 'Book', dur: 1.3 }, { img: 'stars', chip: '', ua: 'Зорі', en: 'Stars', dur: 1.3 },
    { kind: 'cta', img: 'tree', ua: 'Старт<br>1 грудня', en: 'Starts December 1', dur: 2.2 }]) }
};

const browser = await chromium.launch();
for (const [name, htmls] of Object.entries(slides)) {
  if (!sel(name, name.startsWith('story') ? 'stories' : 'posts')) continue;
  const story = name.startsWith('story'), p = await browser.newPage({ viewport: { width: 1080, height: story ? 1920 : 1350 }, deviceScaleFactor: 1 });
  for (const [i, html] of htmls.entries()) { await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300); const file = htmls.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`; await p.screenshot({ path: path.join(OUT, file) }); console.log('png', file); }
  await p.close();
}
for (const [name, r] of Object.entries(reels)) if (sel(name, 'reels') || (name === 'story-video' && ONLY === 'stories')) await renderVideo(browser, name, r.html(), r.theme);
await browser.close();
