// Серія №2 «Вечори вдвох»: ще 5 сцен пари (настільна гра, пакування подарунків, спа-вечір, різдвяний ярмарок, кіновечір) у нових форматах:
// 6 постів (каруселі-«поради з наближенням», дуель A/B, скляна панель, чекліст, картка ідеї з чіпами, тижневий планер),
// 5 сторіс (квиток, кубик, рецепт, «закінчіть речення», прогноз) і 2 Reels (дуель A чи B, вікна, що перегортаються).
// Кожен формат у цій серії не повторює формати серії №1 (build2.mjs). Запуск: NODE_PATH=$(npm root -g) node marketing/instagram/build3.mjs   ONLY=posts | stories | reels | префікс імені
import fs from 'node:fs'; import path from 'node:path';
import { chromium, OUT, LOGO, LOGO_FULL, CSS, starsJS, FOCUS, kit, REEL_CSS, renderVideo, sel } from './lib.mjs';
const NAMES = Object.keys(FOCUS), K = kit(NAMES), { SC, BL, page, arch, rcard, abs, zoomBg } = K;
const slides = {};
const GOLD = 'var(--gold)';

// =====================================================================================================================
// 16 · Карусель «Настільна гра для двох: 5 правил вечора»: обкладинка-полароїди й слайди-«наближення» (щоразу інша деталь однієї сцени)
const pol = (w, imgH, bgStyle, rot, cap, pos) => `<div style="position:absolute;${pos};width:${w}px;padding:20px 20px 88px;background:#f3efe6;border-radius:8px;transform:rotate(${rot}deg);box-shadow:0 26px 70px rgba(0,0,0,.6)"><div style="width:100%;height:${imgH}px;border-radius:3px;${bgStyle}"></div><div style="position:absolute;left:0;right:0;bottom:24px;text-align:center;font:italic 500 40px 'Cormorant Garamond',serif;color:#2a2418">${cap}</div></div>`;
const gameStep = ({ n, ua, en, pUa, pEn, crop, seed }) => page({ bg: 'game', seed, inner: `
  <div style="position:absolute;left:84px;top:176px;width:912px;height:520px;border:3px solid var(--gold);border-radius:44px;overflow:hidden;box-shadow:0 0 90px rgba(255,190,100,.28);${zoomBg('game', ...crop, 912, 520)}"></div>
  <div style="position:absolute;left:84px;top:742px;width:912px;display:flex;gap:26px;align-items:flex-start">
    <div style="font:italic 500 250px/0.82 'Cormorant Garamond',serif;color:var(--gold);width:170px;flex:none;text-align:center">${n}</div>
    <div style="flex:1;text-align:left"><div class="eyebrow" style="font-size:21px">Правило ${n} із 5 · Rule ${n} of 5</div><div class="big" style="font-size:56px;margin-top:10px;line-height:1.08">${ua}</div><div class="en" style="font-size:28px;margin:6px 0 0;color:var(--gold)">${en}</div><div class="p" style="font-size:34px;margin-top:14px;max-width:none;line-height:1.28">${pUa}</div><div class="en" style="font-size:24px;margin-top:6px">${pEn}</div></div>
  </div><div class="swipe">→</div>` });
slides['16-game-rules'] = [
  page({ bg: 'game', seed: 161, inner: `${pol(640, 600, zoomBg('game', 0.55, 0.45, 1.0, 600, 600), -4, 'Гра на двох', 'left:90px;top:190px')}${pol(520, 480, zoomBg('game', 0.62, 0.80, 1.8, 480, 480), 6, 'Кубики й карти', 'left:500px;top:240px')}${abs(960, `<div class="eyebrow" style="font-size:24px">Вечір із грою · Game night</div><h1 style="font-size:86px;margin:10px 0 4px">5 правил <em>настільного вечора</em></h1><div class="en" style="font-size:34px;margin:0;color:var(--gold)">5 rules for a board-game night</div>`)}<div class="swipe">→</div>` }),
  gameStep({ n: 1, ua: 'Оберіть гру, де цікаво вигравати обом', en: 'Pick a game you both enjoy winning', pUa: 'Без довгих правил і образ: головне, щоб ви сміялись.', pEn: 'No long rules and no hard feelings, just laughter.', crop: [0.52, 0.78, 1.5], seed: 162 }),
  gameStep({ n: 2, ua: 'Домовтесь про приз', en: 'Agree on a prize', pUa: 'Десерт, масаж плечей чи вибір фільму: переможець обирає.', pEn: 'Dessert, a shoulder rub or picking the movie: the winner decides.', crop: [0.76, 0.5, 2.3], seed: 163 }),
  gameStep({ n: 3, ua: 'Какао й імбирне печиво', en: 'Cocoa and gingerbread', pUa: 'Тепле питво й солодке роблять навіть програш приємним.', pEn: 'Something warm and sweet makes even losing pleasant.', crop: [0.14, 0.75, 2.3], seed: 164 }),
  gameStep({ n: 4, ua: 'Телефони в іншу кімнату', en: 'Phones go to another room', pUa: 'Кубики, карти й ви двоє: екранам тут немає місця.', pEn: 'Dice, cards and the two of you: no room for screens.', crop: [0.45, 0.88, 2.6], seed: 165 }),
  gameStep({ n: 5, ua: 'Після гри: одне питання', en: 'After the game: one question', pUa: '«Який момент вечора тобі сподобався найбільше?»', pEn: '“Which moment of the evening did you like most?”', crop: [0.55, 0.28, 1.4], seed: 166 }),
  page({ bg: 'game', seed: 167, inner: `<div style="position:absolute;left:260px;top:190px;width:560px;height:560px;border-radius:50%;border:3px solid var(--gold);box-shadow:0 0 90px rgba(255,190,100,.32);${zoomBg('game', 0.55, 0.30, 1.7, 560, 560)}"></div>${abs(800, `<div class="eyebrow" style="font-size:24px">Ваш хід · Your move</div><div class="big" style="font-size:72px;margin-top:14px">Який приз у вашого <em class="gold">переможця?</em></div><div class="en" style="font-size:32px;margin-top:10px">What is your winner’s prize?</div><div class="en" style="margin-top:26px;color:var(--gold);font-size:28px">Напишіть у коментарях · Tell us below</div>`)}<div class="foot">ВІКНО ЗА ВІКНОМ · REEADVENT.FUN</div>` })];

// 17 · Дуель «Гра чи кіно?»: діагональний поділ кадру (нічого схожого на арки серії №1)
slides['17-duel-game-or-movie'] = [`<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}.half{position:absolute;inset:0}.half img{width:100%;height:100%;object-fit:cover;display:block}.lab{position:absolute;bottom:128px;max-width:430px}.lab .l{display:inline-block;width:78px;height:78px;border-radius:50%;background:var(--gold);color:#17130a;font:700 44px/78px Inter,sans-serif;text-align:center;box-shadow:0 4px 18px #0008}.lab .t{font:500 56px/1.05 'Cormorant Garamond',serif;margin-top:12px;text-shadow:0 2px 18px #000}.lab .e{font:400 26px Inter,sans-serif;color:#d9d6cc;margin-top:6px;text-shadow:0 2px 12px #000}</style><body>
  <div class="half" style="clip-path:polygon(0 0,62% 0,46% 100%,0 100%)"><img src="${SC.game}" style="object-position:20% 40%"></div>
  <div class="half" style="clip-path:polygon(62% 0,100% 0,100% 100%,46% 100%)"><img src="${SC.movie}" style="object-position:30% 40%"></div>
  <svg style="position:absolute;inset:0" width="1080" height="1350"><line x1="670" y1="0" x2="497" y2="1350" stroke="#d6b46a" stroke-width="5"/></svg>
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,9,13,.82) 0,rgba(8,9,13,.4) 24%,transparent 40%,transparent 60%,rgba(8,9,13,.88) 100%)"></div>
  <div class="frame"></div><img class="toplogo" src="${LOGO}">
  ${abs(172, `<h1 style="font-size:88px;margin:0">Гра чи <em>кіно?</em></h1>`)}
  <div style="position:absolute;left:513px;top:605px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f3d995,#c9a24f);color:#17130a;font:700 46px/140px Inter,sans-serif;text-align:center;box-shadow:0 8px 40px #000b;letter-spacing:.04em">VS</div>
  <div class="lab" style="left:84px"><div class="l">A</div><div class="t">Настільна гра</div><div class="e">Board game</div></div>
  <div class="lab" style="right:84px;text-align:right"><div class="l">B</div><div class="t">Кіновечір</div><div class="e">Movie night</div></div>
  ${abs(1262, `<div style="font:500 26px Inter,sans-serif;color:var(--gold)">Game or movie? Напишіть A або B ✦ Comment A or B</div>`)}</body>`];

// 18 · «Дві коробки, один секрет»: скляна панель поверх повноекранної сцени
slides['18-two-boxes'] = [`<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}</style><body>
  <img src="${SC.wrap}" style="position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;object-position:45% 50%">
  <div style="position:absolute;left:0;right:0;bottom:0;height:640px;background:linear-gradient(180deg,transparent,rgba(8,9,13,.55) 55%,rgba(8,9,13,.8))"></div>
  <div class="frame"></div><img class="toplogo" src="${LOGO}">
  <div style="position:absolute;left:70px;right:70px;bottom:92px;padding:28px 44px 32px;border-radius:38px;background:rgba(14,11,8,.5);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1.5px solid rgba(214,180,106,.6);text-align:center">
    <div class="eyebrow" style="font-size:24px">Подарунок · Gift</div>
    <div class="big" style="font-size:74px;margin-top:8px">Дві коробки, <em class="gold">один секрет</em></div>
    <div class="en" style="font-size:32px;margin-top:8px;color:#e0dccf">Two boxes, one secret</div>
    <div class="p" style="font-size:34px;margin:14px auto 0;max-width:800px">Він пакує для неї, вона для нього. Таємниця до ранку.</div>
  </div></body>`];

// 19 · Чекліст «Спа-вечір вдома: що потрібно»
const checks = [['Халати й теплий плед', 'Robes and a warm blanket'], ['Огірки й маски для обличчя', 'Cucumbers and face masks'], ['Мед і морська сіль', 'Honey and sea salt'], ['Трав’яний чай на двох', 'Herbal tea for two'], ['Свічки й тиша', 'Candles and silence']];
slides['19-spa-checklist'] = [page({ bg: 'spa', seed: 191, inner: `${abs(170, `<div class="eyebrow" style="font-size:24px">Чекліст · Checklist</div><h1 style="font-size:86px;margin:8px 0 0">Спа-вечір <em>вдома</em></h1><div class="en" style="font-size:32px;margin-top:0">A spa night at home: what you need</div>`)}
  <div style="position:absolute;left:100px;top:392px;width:880px;height:340px">${rcard('spa', 880, 340, '54% 22%')}</div>
  <div style="position:absolute;left:130px;top:776px;width:820px">${checks.map(([u, e]) => `<div style="display:flex;gap:26px;align-items:center;height:92px;border-bottom:1px solid rgba(214,180,106,.22)"><div style="width:48px;height:48px;border-radius:50%;border:2.5px solid var(--gold);flex:none;position:relative"><div style="position:absolute;left:14px;top:5px;width:12px;height:22px;border-right:4px solid var(--gold);border-bottom:4px solid var(--gold);transform:rotate(40deg)"></div></div><div style="text-align:left"><div style="font:500 40px/1.05 'Cormorant Garamond',serif">${u}</div><div style="font:400 22px Inter,sans-serif;color:var(--muted);margin-top:2px">${e}</div></div></div>`).join('')}</div>
  ${abs(1262, `<div style="font:500 26px Inter,sans-serif;color:var(--gold)">Збережіть чекліст ✦ Save the list</div>`)}` })];

// 20 · Картка ідеї з чіпами (час, одяг, настрій): «Глінтвейн на ярмарку»
const chip = (k, v) => `<div style="flex:1;padding:12px 10px 14px;border:1.5px solid rgba(214,180,106,.7);border-radius:22px;background:rgba(10,8,6,.55);text-align:center"><div style="font:600 17px Inter,sans-serif;letter-spacing:.2em;color:var(--gold)">${k}</div><div style="font:500 32px/1.1 'Cormorant Garamond',serif;margin-top:4px">${v}</div></div>`;
slides['20-market-idea'] = [`<!doctype html><meta charset="utf-8"><style>${CSS}body{width:1080px;height:1350px}</style><body>
  <img src="${SC.market}" style="position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;object-position:20% 50%">
  <div style="position:absolute;left:0;right:0;bottom:0;height:640px;background:linear-gradient(180deg,transparent,rgba(8,9,13,.78) 42%,#08090d)"></div>
  <div class="frame"></div><img class="toplogo" src="${LOGO}">
  <div style="position:absolute;left:84px;right:84px;top:880px;text-align:center"><div style="display:inline-block;padding:7px 22px;border-radius:30px;background:var(--gold);color:#17130a;font:700 20px Inter,sans-serif;letter-spacing:.2em">ІДЕЯ ДЛЯ ПРИГОДИ · ADVENTURE IDEA</div></div>
  ${abs(930, `<div class="big" style="font-size:80px;line-height:1.02">Глінтвейн <em class="gold">на ярмарку</em></div><div class="en" style="font-size:32px;margin-top:6px;color:#e0dccf">Mulled wine at the Christmas market</div>`)}
  <div style="position:absolute;left:84px;right:84px;top:1130px;display:flex;gap:16px">${chip('ЧАС · TIME', '2 години')}${chip('ОДЯГ · WEAR', 'шарф і рукавиці')}${chip('НАСТРІЙ · MOOD', 'святковий')}</div></body>`];

// 21 · Тижневий планер «Тиждень вечорів удвох»
const week = [['Пн', 'movie', 'Кіновечір', 'Movie night'], ['Вт', 'game', 'Настільна гра', 'Board game'], ['Ср', 'spa', 'Спа-вечір вдома', 'Spa night at home'], ['Чт', 'pasta', 'Вечеря вдвох', 'Dinner for two'], ['Пт', 'market', 'Ярмарок і глінтвейн', 'Market and mulled wine'], ['Сб', 'stars', 'Зоряна ніч', 'Stargazing'], ['Нд', 'book', 'Книга під пледом', 'A book under a blanket']];
slides['21-week-planner'] = [page({ bg: 'movie', seed: 211, inner: `${abs(170, `<div class="eyebrow" style="font-size:24px">Планер · Planner</div><h1 style="font-size:90px;margin:8px 0 0">Тиждень вечорів <em>удвох</em></h1><div class="en" style="font-size:32px;margin-top:0">A week of evenings for two</div>`)}
  <div style="position:absolute;left:96px;top:420px;width:888px">${week.map(([d, n, u, e]) => `<div style="display:flex;gap:26px;align-items:center;height:116px;border-bottom:1px solid rgba(214,180,106,.22)"><div style="width:84px;font:600 36px Inter,sans-serif;color:var(--gold);text-align:left">${d}</div><div style="width:92px;height:92px;border-radius:50%;border:3px solid var(--gold);overflow:hidden;flex:none;box-shadow:0 0 30px rgba(255,190,100,.25)"><img src="${SC[n]}" style="width:100%;height:100%;object-fit:cover;object-position:${FOCUS[n]};display:block"></div><div style="text-align:left"><div style="font:500 44px/1.05 'Cormorant Garamond',serif">${u}</div><div style="font:400 23px Inter,sans-serif;color:var(--muted);margin-top:2px">${e}</div></div></div>`).join('')}</div>
  ${abs(1262, `<div style="font:500 26px Inter,sans-serif;color:var(--gold)">Збережіть і плануйте ✦ Save and plan</div>`)}` })];

// =====================================================================================================================
// Сторіс 1080×1920 (важливе між 250 і 1670 по висоті)
const st = (bg, inner, seed) => page({ w: 1080, h: 1920, bg, inner, seed, topY: 262 });
const ticketMask = y => `-webkit-mask-image:radial-gradient(circle 42px at 0 ${y}px,transparent 41px,#000 42px),radial-gradient(circle 42px at 100% ${y}px,transparent 41px,#000 42px);-webkit-mask-composite:source-in;mask-image:radial-gradient(circle 42px at 0 ${y}px,transparent 41px,#000 42px),radial-gradient(circle 42px at 100% ${y}px,transparent 41px,#000 42px);mask-composite:intersect;`;
slides['story-7-ticket'] = [st('movie', `<div style="position:absolute;left:110px;top:400px;width:860px;height:1050px;border:3px solid var(--gold);border-radius:40px;background:linear-gradient(180deg,rgba(26,19,12,.86),rgba(12,10,8,.92));box-shadow:0 0 90px rgba(255,190,100,.25);${ticketMask(725)}">
    <div style="position:absolute;left:40px;right:40px;top:40px;height:440px;border-radius:26px;overflow:hidden"><img src="${SC.movie}" style="width:100%;height:100%;object-fit:cover;object-position:48% 36%;display:block"></div>
    <div style="position:absolute;left:0;right:0;top:506px;text-align:center"><div class="eyebrow" style="font-size:24px">Кіновечір · Movie night</div><div class="big" style="font-size:84px;margin-top:8px">Квиток <em class="gold">для двох</em></div><div class="en" style="font-size:30px;margin-top:2px">A ticket for two</div></div>
    <div style="position:absolute;left:48px;right:48px;top:724px;border-top:3px dashed rgba(214,180,106,.65)"></div>
    <div style="position:absolute;left:70px;right:70px;top:772px;display:flex;justify-content:space-between;text-align:left"><div><div style="font:600 18px Inter,sans-serif;letter-spacing:.2em;color:var(--gold)">РЯД · ROW</div><div style="font:600 46px Inter,sans-serif;margin-top:4px">1</div></div><div><div style="font:600 18px Inter,sans-serif;letter-spacing:.2em;color:var(--gold)">МІСЦЯ · SEATS</div><div style="font:600 46px Inter,sans-serif;margin-top:4px">1 і 2</div></div><div><div style="font:600 18px Inter,sans-serif;letter-spacing:.2em;color:var(--gold)">ПОРУЧ · TOGETHER</div><div style="font:600 46px Inter,sans-serif;margin-top:4px">так</div></div></div>
    <div style="position:absolute;left:70px;right:70px;top:884px;text-align:left"><div style="font:400 30px/1.3 'Cormorant Garamond',serif;color:#e4dfd2">Вхід: з пледом і попкорном.</div><div style="font:400 22px Inter,sans-serif;color:var(--muted);margin-top:2px">Entry: with a blanket and popcorn.</div></div>
    <div style="position:absolute;left:70px;right:70px;bottom:30px;height:50px;border-radius:6px;background:repeating-linear-gradient(90deg,#f3efe6 0 4px,transparent 4px 9px,#f3efe6 9px 11px,transparent 11px 18px,#f3efe6 18px 24px,transparent 24px 28px);opacity:.78"></div></div>
  ${abs(1520, `<div style="font:500 28px Inter,sans-serif;color:var(--gold)">Сьогодні ввечері? Світло лише від свічок ✦</div><div class="en" style="font-size:22px;margin-top:6px">Tonight? Candlelight only</div>`)}`, 701)];
const diceRows = [['movie', 'Кіновечір', 'Movie night'], ['game', 'Настільна гра', 'Board game'], ['spa', 'Спа-вечір вдома', 'Spa at home'], ['market', 'Ярмарок і глінтвейн', 'Market and mulled wine'], ['wrap', 'Упакувати подарунки', 'Wrap gifts together'], ['stars', 'Ваш вибір', 'Your choice']];
const pip = (x, y) => `<div style="position:absolute;left:${x}px;top:${y}px;width:30px;height:30px;border-radius:50%;background:#2a2010"></div>`;
slides['story-8-dice'] = [st('wrap', `${abs(372, `<h1 style="font-size:74px;margin:0;line-height:1.05">Не можете <em>обрати вечір?</em></h1><div class="en" style="font-size:28px;margin-top:6px">Can’t pick an evening?</div>`)}
  <div style="position:absolute;left:50%;top:590px;margin-left:-95px;width:190px;height:190px;border-radius:40px;background:linear-gradient(145deg,#f3d995,#c9a24f);box-shadow:0 18px 50px rgba(0,0,0,.55);transform:rotate(-9deg)">${[[44, 34], [44, 80], [44, 126], [116, 34], [116, 80], [116, 126]].map(([x, y]) => pip(x, y)).join('')}</div>
  <div style="position:absolute;left:140px;top:830px;width:800px">${diceRows.map(([n, u, e], i) => `<div style="display:flex;gap:24px;align-items:center;height:118px;border-bottom:1px solid rgba(214,180,106,.22)"><div style="width:64px;height:64px;border-radius:50%;background:var(--gold);color:#17130a;font:700 34px/64px Inter,sans-serif;text-align:center;flex:none">${i + 1}</div><div style="width:86px;height:86px;border-radius:50%;border:3px solid var(--gold);overflow:hidden;flex:none"><img src="${SC[n]}" style="width:100%;height:100%;object-fit:cover;object-position:${FOCUS[n]};display:block"></div><div style="text-align:left"><div style="font:500 44px/1.05 'Cormorant Garamond',serif">${u}</div><div style="font:400 22px Inter,sans-serif;color:var(--muted);margin-top:2px">${e}</div></div></div>`).join('')}</div>
  ${abs(1596, `<div style="font:500 28px Inter,sans-serif;color:var(--gold)">Киньте кубик і не сперечайтесь ✦</div><div class="en" style="font-size:22px;margin-top:4px">Roll the dice. No arguments.</div>`)}`, 801)];
const ingr = [['Червоне вино або виноградний сік', 'Red wine or grape juice, 1 litre'], ['Апельсин, яблуко, кориця, гвоздика', 'Orange, apple, cinnamon, cloves'], ['Мед або цукор за смаком', 'Honey or sugar to taste'], ['Гріти 10 хвилин, не кип’ятити', 'Warm for 10 minutes, do not boil']];
slides['story-9-recipe'] = [st('market', `${rcard('market', 860, 560, '50% 30%', 'position:absolute;left:110px;top:380px')}
  ${abs(990, `<div class="eyebrow" style="font-size:23px">Рецепт на вечір · Recipe</div><h1 style="font-size:82px;margin:6px 0 0">Глінтвейн <em>за 10 хвилин</em></h1><div class="en" style="font-size:28px;margin-top:0">Mulled wine in 10 minutes</div>`)}
  <div style="position:absolute;left:120px;top:1262px;width:840px">${ingr.map(([u, e], i) => `<div style="display:flex;gap:22px;align-items:center;height:82px"><div style="width:42px;height:42px;border-radius:50%;border:2.5px solid var(--gold);flex:none;font:600 22px/37px Inter,sans-serif;color:var(--gold);text-align:center">${i + 1}</div><div style="text-align:left"><div style="font:500 36px/1.05 'Cormorant Garamond',serif">${u}</div><div style="font:400 20px Inter,sans-serif;color:var(--muted)">${e}</div></div></div>`).join('')}</div>`, 901)];
slides['story-10-prompt'] = [st('game', `${rcard('game', 860, 560, FOCUS.game, 'position:absolute;left:110px;top:380px')}
  <div style="position:absolute;left:110px;top:1000px;width:860px;border-radius:36px;overflow:hidden;background:#f3efe6;box-shadow:0 20px 60px rgba(0,0,0,.5)"><div style="background:linear-gradient(90deg,#c9a24f,#e8c97b);padding:22px 0;text-align:center;font:700 26px Inter,sans-serif;letter-spacing:.22em;color:#17130a">ЗАКІНЧІТЬ РЕЧЕННЯ · FINISH THE SENTENCE</div><div style="padding:46px 50px 52px;text-align:center"><div style="font:italic 500 84px/1.05 'Cormorant Garamond',serif;color:#2a2418">Ідеальний вечір для нас — це…</div><div style="font:400 32px Inter,sans-serif;color:#6a6454;margin-top:16px">Our perfect evening is…</div></div></div>
  ${abs(1560, `<div style="font:500 28px Inter,sans-serif;color:var(--gold)">Відповідайте у повідомленні ✦ Reply to this story</div>`)}`, 1001)];
const fc = [['Температура вдома', 'Temperature at home', '+22 °C'], ['Ймовірність обіймів', 'Chance of hugs', '100%'], ['Опади', 'Precipitation', 'какао й плед'], ['Вітер', 'Wind', 'тихий, без телефонів']];
slides['story-11-forecast'] = [st('spa', `${rcard('spa', 860, 540, '54% 24%', 'position:absolute;left:110px;top:380px')}
  <div style="position:absolute;left:110px;top:960px;width:860px;padding:34px 44px 18px;border-radius:36px;background:rgba(14,11,8,.58);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1.5px solid rgba(214,180,106,.6)">
    <div style="display:flex;justify-content:space-between;align-items:center"><div style="text-align:left"><div class="eyebrow" style="font-size:22px">Прогноз · Forecast</div><div style="font:500 66px/1.05 'Cormorant Garamond',serif;margin-top:6px">Вечір вдвох</div></div><div style="font:500 110px/1 'Cormorant Garamond',serif;color:var(--gold)">+22°</div></div>
    ${fc.map(([u, e, v]) => `<div style="display:flex;justify-content:space-between;align-items:center;height:92px;border-top:1px solid rgba(214,180,106,.3);margin-top:6px"><div style="text-align:left"><div style="font:500 36px/1.05 'Cormorant Garamond',serif">${u}</div><div style="font:400 20px Inter,sans-serif;color:var(--muted)">${e}</div></div><div style="font:500 36px 'Cormorant Garamond',serif;color:var(--gold);text-align:right">${v}</div></div>`).join('')}</div>`, 1101)];

// =====================================================================================================================
// Відео. Reel 4 «A чи B?»: дуелі сцен із таймером; Reel 5 «Вікна, що перегортаються»: 12 плиток відкриваються по черзі
const pairs = [['market', 'Ярмарок', 'Market', 'spa', 'Спа-вечір', 'Spa night'], ['movie', 'Кіновечір', 'Movie night', 'game', 'Настільна гра', 'Board game'], ['wrap', 'Подарунки', 'Gifts', 'pasta', 'Вечеря вдвох', 'Dinner for two'], ['stars', 'Зорі', 'Stars', 'book', 'Книга під пледом', 'A book under a blanket']];
const abHtml = () => {
  const sc = []; let t0 = 0; const add = (o, d) => { sc.push({ ...o, at: t0, dur: d }); t0 += d; };
  add({ k: 'intro' }, 2.6); pairs.forEach((p, i) => add({ k: 'duel', p, i }, 3.6)); add({ k: 'cta' }, 3.4);
  const body = sc.map((s, i) => {
    if (s.k === 'intro') return `<div class="sc" id="s${i}"><div class="sbg" style="background-image:url(${BL.game})"></div><div class="veil"></div><div class="mid" style="top:300px"><div class="nm" style="margin:0 0 6px">Він і Вона · He &amp; She</div><div class="h2" style="font-size:92px">A чи <em>B?</em></div><div class="en" style="font-size:22px">Оберіть вечір швидко · Pick your evening, fast</div></div></div>`;
    if (s.k === 'cta') return `<div class="sc" id="s${i}"><div class="sbg" style="background-image:url(${BL.movie})"></div><div class="veil"></div><div class="mid" style="top:250px"><img src="${LOGO_FULL}" style="width:300px"><div class="h2" style="font-size:50px;margin-top:26px">Пишіть <em>A або B</em><br>у коментарях</div><div class="en">Comment A or B and tell us why</div><div class="nm" style="margin-top:26px">Старт 1 грудня · reeadvent.fun</div></div></div>`;
    const [a, al, ae, b, bl, be] = s.p;
    return `<div class="sc" id="s${i}"><div class="sbg" style="background-image:url(${BL[a]})"></div><div class="veil"></div>
      <div class="dc da" style="top:112px"><img src="${SC[a]}" style="object-position:${FOCUS[a]}"><div class="tag"><b>A</b>${al}<small>${ae}</small></div></div>
      <div class="vs" style="top:413px">VS</div>
      <div class="dc db" style="top:454px"><img src="${SC[b]}" style="object-position:${FOCUS[b]}"><div class="tag"><b>B</b>${bl}<small>${be}</small></div></div>
      <div class="mid qq" style="top:786px"><div class="h2" style="font-size:46px"><em>A</em> чи <em>B?</em></div></div><div class="timer" style="top:858px"><i></i></div></div>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><style>${CSS}${REEL_CSS}</style><body><div class="bg"></div>${body}<div class="stars"></div><div class="frame"></div><img class="toplogo" src="${LOGO}"><script>${starsJS(540, 960, 55, 14)}
const S=${JSON.stringify(sc.map(s => ({ at: s.at, dur: s.dur })))},TOTAL=${t0};
const R=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),E=x=>1-Math.pow(1-x,3),q=(el,s)=>el.querySelector(s);
window.setT=t=>{document.querySelector('.stars').style.opacity=.7+.3*Math.sin(t*2.1);
  S.forEach((s,i)=>{const el=document.getElementById('s'+i),nx=S[i+1];el.style.opacity=i===0?1:R(t,s.at,s.at+.45);el.style.display=(nx&&t>nx.at+.5)?'none':'block';
    const p=R(t,s.at,s.at+s.dur),da=q(el,'.da'),db=q(el,'.db');
    if(da){const k=E(R(t,s.at+.05,s.at+.6)),k2=E(R(t,s.at+.2,s.at+.75));da.style.transform='translateX('+(-80*(1-k))+'px)';da.style.opacity=k;db.style.transform='translateX('+(80*(1-k2))+'px)';db.style.opacity=k2;
      da.querySelector('img').style.transform='scale('+(1+.06*p)+')';db.querySelector('img').style.transform='scale('+(1+.06*p)+')';
      const tm=q(el,'.timer i');tm.style.width=(100*(1-R(t,s.at+.7,s.at+s.dur-.15)))+'%';const vs=q(el,'.vs');vs.style.transform='scale('+(1+.12*Math.sin(R(t,s.at+.1,s.at+.7)*Math.PI))+')';}
    const mid=el.querySelector('.mid');if(mid&&!da){const k=E(R(t,s.at+.1,s.at+.7));mid.style.opacity=i===0?1:k;mid.style.transform='translateY('+(18*(1-k))+'px)';}
  });};setT(0);</script></body>`;
};
const gridTiles = [['movie'], ['game'], ['spa'], ['market'], ['wrap'], ['tree'], ['pasta'], ['pillow'], ['book'], ['stars'], ['game', 0.45, 0.88, 2.8], ['wrap', 0.35, 0.72, 2.4]];
const gridHtml = () => {
  const TW = 148, TH = 150, tiles = gridTiles.map(([n, cx, cy, z], i) => `<div class="tile" id="t${i}"><div class="tin"><div class="tf"><span>${i + 1}</span></div><div class="tb" style="${cx === undefined ? `background-image:url(${SC[n]});background-size:cover;background-position:${FOCUS[n]};` : zoomBg(n, cx, cy, z, TW, TH)}"></div></div></div>`).join('');
  const CTA = 11.6, TOTAL = 15.6;
  return `<!doctype html><meta charset="utf-8"><style>${CSS}${REEL_CSS}
  .grid{position:absolute;left:36px;top:150px;width:468px;display:grid;grid-template-columns:repeat(3,${TW}px);gap:8px}
  .tile{width:${TW}px;height:${TH}px;perspective:700px}.tin{position:relative;width:100%;height:100%;transform-style:preserve-3d}
  .tf,.tb{position:absolute;inset:0;border-radius:18px;border:2px solid var(--gold);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
  .tf{background:linear-gradient(180deg,#1d160a,#0d0b07);display:flex;align-items:center;justify-content:center}.tf span{font:italic 500 62px 'Cormorant Garamond',serif;color:var(--gold)}
  .tb{transform:rotateY(180deg);box-shadow:0 0 26px rgba(255,190,100,.35)}
  </style><body><div class="bg"></div>
  <div class="sc" id="s0"><div class="sbg" style="background-image:url(${BL.wrap})"></div><div class="veil"></div>
    <div class="mid" style="top:96px;padding:0"><div class="h2" style="font-size:40px">Відкриваємо <em>вікна</em></div><div class="en" style="font-size:15px;margin-top:6px">Window by window</div></div>
    <div class="grid">${tiles}</div>
    <div class="mid" style="top:786px"><div class="nm" id="cnt" style="margin:0;font-size:17px">Відкрито 0 з 24</div><div class="en" id="aft" style="opacity:0;font-size:16px;margin-top:10px">Питання, подарунок, пригода й активність у кожному вікні<br>A question, a gift, an adventure and an activity in every window</div></div></div>
  <div class="sc" id="s1"><div class="sbg" style="background-image:url(${BL.tree})"></div><div class="veil"></div><div class="mid" style="top:250px"><img src="${LOGO_FULL}" style="width:310px"><div class="h2" style="font-size:48px;margin-top:24px">12 вікон —<br><em>це лише початок</em></div><div class="en">12 windows are just the beginning. There are 24.</div><div class="nm" style="margin-top:26px">Старт 1 грудня · reeadvent.fun</div></div></div>
  <div class="stars"></div><div class="frame"></div><img class="toplogo" src="${LOGO}"><script>${starsJS(540, 960, 55, 21)}
const TOTAL=${TOTAL},CTA=${CTA},N=${gridTiles.length};
const R=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),E=x=>1-Math.pow(1-x,3),EI=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
window.setT=t=>{document.querySelector('.stars').style.opacity=.7+.3*Math.sin(t*2.1);
  const s0=document.getElementById('s0'),s1=document.getElementById('s1');s0.style.opacity=1;s1.style.opacity=R(t,CTA,CTA+.5);s0.style.display=t>CTA+.55?'none':'block';
  let open=0;for(let i=0;i<N;i++){const t0=1.0+i*.5,f=R(t,t0,t0+.55),el=document.querySelector('#t'+i+' .tin'),pop=Math.sin(R(t,t0+.45,t0+.9)*Math.PI);
    el.style.transform='rotateY('+(180*EI(f))+'deg) scale('+(1+.07*pop)+')';if(f>=.5)open++;}
  document.getElementById('cnt').textContent=open>=N?'Відкрито '+N+' із 24 · '+N+' of 24 opened':'Відкрито '+open+' з 24';
  document.getElementById('aft').style.opacity=E(R(t,1.0+N*.5+.6,1.0+N*.5+1.3));
  const gm=document.querySelector('#s0 .mid');gm.style.opacity=E(R(t,0,.6));};setT(0);</script></body>`;
};

// =====================================================================================================================
const browser = await chromium.launch();
for (const [name, htmls] of Object.entries(slides)) {
  if (!sel(name, name.startsWith('story') ? 'stories' : 'posts')) continue;
  const story = name.startsWith('story'), p = await browser.newPage({ viewport: { width: 1080, height: story ? 1920 : 1350 }, deviceScaleFactor: 1 });
  for (const [i, html] of htmls.entries()) { await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300); const file = htmls.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`; await p.screenshot({ path: path.join(OUT, file) }); console.log('png', file); }
  await p.close();
}
if (sel('reel-ab', 'reels')) await renderVideo(browser, 'reel-ab', abHtml(), 'c', 4.3);
if (sel('reel-windows', 'reels')) await renderVideo(browser, 'reel-windows', gridHtml(), 'd', 9.0);
await browser.close();
