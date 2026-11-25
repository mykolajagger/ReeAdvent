// Рекламний ролик 9:16 (лише для реклами, не публікується в профілі): динамічний монтаж у ритм, гачок → що всередині → книга → заклик із дедлайном.
// Запуск: NODE_PATH=$(npm root -g) node marketing/instagram/build-ad.mjs   Результат: marketing/instagram/out/ad-dec1.mp4 (+ -cover.jpg)
// Текст — у середній зоні кадру (y 110–640 з 960), бо низ і верх у Reels закривають підпис, кнопка реклами та іконки.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { chromium, LOGO, LOGO_FULL, CSS, starsJS, FOCUS, kit, renderVideo, OUT, root } from './lib.mjs';
const { SC, BL } = kit(Object.keys(FOCUS));
const img = (n, extra = '') => `<img src="${SC[n]}" style="width:100%;height:100%;object-fit:cover;object-position:${FOCUS[n]};display:block;${extra}">`;
const full = (n, cls = 'zoom') => `<div class="fb ${cls}">${img(n)}</div><div class="shade"></div>`;
const blur = n => `<div class="sbg" style="background-image:url(${BL[n]});filter:blur(14px)"></div><div class="veil"></div>`;
const card = (n, eb, h, sub, k) => ({ d: 3.0, kind: 'card', html: `${full(n)}<div class="ct"><div class="eb">${eb}<span>${k}/3</span></div><div class="h">${h}</div><div class="sub">${sub}</div></div>` });
const flash = (n, word) => ({ d: 1.2, kind: 'flash', html: `${full(n, 'zoom2')}<div class="word">${word}</div>` });
const SCENES = [
  { d: 2.4, kind: 'hook', html: `${blur('wrap')}<div class="mid" style="top:250px"><div class="h1 slam">Ще одна річ<br>у подарунок?</div><div class="strike"><i></i></div></div>` },
  { d: 3.0, kind: 'doors', html: `${blur('tree')}<div class="arch">${img('tree')}<div class="door l"><b>1</b></div><div class="door r"></div><div class="glow"></div></div><div class="mid up" style="top:548px"><div class="h2">Подаруй <em>24 дні</em> уваги</div><div class="nm">для неї · для нього</div></div>` },
  { d: 4.2, kind: 'phone', html: `${blur('book')}<div class="mid" style="top:96px"><div class="clock up">щоранку о 07:00 — нове вікно</div></div>
    <div class="phone"><i class="sb l1"></i><i class="sb l2"></i><i class="sb l3"></i><i class="sb r1"></i><div class="scr">
      <div class="isl"></div><div class="stat"><span>07:00</span><span class="ics"><b class="sig"><i></i><i></i><i></i><i></i></b><svg class="wf" viewBox="0 0 16 12" width="16" height="12"><path d="M8 11.2l2.2-2.6a3.2 3.2 0 0 0-4.4 0z" fill="#f3efe6"/><path d="M3.6 6.4a6.4 6.4 0 0 1 8.8 0" stroke="#f3efe6" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M1.2 3.6a10 10 0 0 1 13.6 0" stroke="#f3efe6" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg><b class="bat"><i></i></b></span></div>
      <div class="app"><div class="ah"><img src="${LOGO}"><span>Вікно 7 з 24</span></div><div class="pp"><i></i></div>
      <div class="pc it"><small>Питання дня</small><p>Який наш день варто прожити ще раз?</p><div class="pa"><b>Він:</b> Той вечір, коли раптом пішов сніг ❄</div></div>
      <div class="pc it"><small>Подарунок для неї</small><p>Плед із рукавами та какао</p><span class="tg">до 800 ₴ · 3 магазини</span></div>
      <div class="pc it"><small>Пригода для двох</small><p>Кіновечір у наметі з ковдр</p></div>
      <div class="pc it"><small>Активність у місті</small><p>Ковзанка під відкритим небом</p><span class="tg">★ 4.8 · нове місце</span></div>
      <div class="done it">Завершити день ✓</div></div>
      <div class="home"></div><div class="glass"></div></div></div>` },
  card('wrap', 'Подарунок', 'Ідея під<br><em>ваш бюджет</em>', '2–3 магазини онлайн і де купити у вашому місті', 1),
  card('market', 'Активність у місті', 'Найкращі <em>місця</em><br>і події дня', 'ярмарки, кав’ярні, концерти — з рейтингом і мапою', 2),
  card('stars', 'Пригода для двох', 'Вечори, що<br><em>запам’ятаються</em>', 'від затишного до сміливого — рівень обираєте ви', 3),
  { d: 2.4, kind: 'book', html: `${blur('stars')}<div class="book"><div class="bc"><span class="bs">✦</span><span class="by">Адвент 2026</span><span class="bn">Він &amp; Вона</span><span class="bl">ReeAdvent</span></div></div><div class="mid up" style="top:520px"><div class="h2">А в кінці — <em>книга</em><br>вашої історії</div></div>` },
  { d: 4.2, kind: 'cta', html: `${blur('tree')}<div class="mid" style="top:118px"><img class="up" src="${LOGO_FULL}" style="width:250px"><div class="h1 up" style="margin-top:14px">Старт<br><em>1 грудня</em></div><div class="dl up">встигніть замовити до 30 листопада</div><div class="btn up">Замовити на reeadvent.fun</div><div class="chips up"><span>24 вікна</span><span>для двох</span><span>будь-яке місто</span></div></div>` },
];
let t0 = 0; for (const s of SCENES) { s.at = t0; t0 += s.d; }
const TOTAL = Math.round(t0 * 100) / 100;
const AD_CSS = `
body{width:540px;height:960px}.toplogo{top:30px;width:104px;z-index:8}.stars{z-index:6}
.sc{position:absolute;inset:0;opacity:0;overflow:hidden}.sbg{position:absolute;inset:-4%;background-size:cover;background-position:center}
.fb{position:absolute;inset:0}.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,9,13,.35) 0%,rgba(8,9,13,.02) 20%,rgba(8,9,13,.1) 38%,rgba(8,9,13,.82) 52%,rgba(8,9,13,.94) 72%,rgba(8,9,13,.97) 100%)}
.mid{position:absolute;left:0;right:0;text-align:center;padding:0 34px}
.h1{font:500 66px/1.02 'Cormorant Garamond',serif;color:var(--cream)}.h1 em,.h2 em,.h em,.word em{color:var(--gold);font-style:italic}
.h2{font:500 46px/1.06 'Cormorant Garamond',serif;color:var(--cream)}
.nm{font:600 15px Inter,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin-top:12px}
.strike{position:relative;height:0;margin:-92px auto 0;width:400px}.strike i{position:absolute;left:0;top:0;height:5px;width:0;background:#e8777f;border-radius:3px;box-shadow:0 0 18px #e8777f99;transform:rotate(-6deg);transform-origin:left}
.arch{position:absolute;left:105px;top:128px;width:330px;height:400px;border:3px solid var(--gold);border-radius:999px 999px 26px 26px;overflow:hidden;box-shadow:0 0 70px rgba(255,190,100,.35);perspective:900px}
.door{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(160deg,#1e1a12,#0d0c09);border:2px solid rgba(214,180,106,.7);display:grid;place-items:center;backface-visibility:hidden}
.door.l{left:0;transform-origin:left center;border-radius:999px 0 0 0}.door.r{right:0;transform-origin:right center;border-radius:0 999px 0 0}
.door b{position:absolute;right:-26px;top:44%;font:500 64px 'Cormorant Garamond',serif;color:var(--gold);z-index:2}
.glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,rgba(255,220,150,.9),rgba(255,200,120,0) 60%);opacity:0;mix-blend-mode:screen}
.clock{display:inline-block;padding:7px 18px;border:1.5px solid rgba(214,180,106,.75);border-radius:22px;background:rgba(8,9,13,.55);font:600 16px Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.win{width:230px;height:230px;margin:30px auto 26px;border:3px solid var(--gold);border-radius:30px;display:grid;place-items:center;background:rgba(8,9,13,.55);box-shadow:0 0 70px rgba(255,190,100,.3)}
.win span{font:500 150px/1 'Cormorant Garamond',serif;color:var(--gold)}
.ct{position:absolute;left:34px;right:34px;top:470px}
.eb{display:flex;justify-content:space-between;font:600 15px Inter,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:var(--gold)}.eb span{color:var(--muted);letter-spacing:.1em}
.h{font:500 60px/1.02 'Cormorant Garamond',serif;color:var(--cream);margin-top:12px}
.sub{font:400 19px/1.35 Inter,sans-serif;color:#e4dfd2;margin-top:12px}
.word{position:absolute;left:50%;top:470px;width:max-content;padding:14px 30px 18px;border-radius:999px;background:rgba(8,9,13,.72);border:1.5px solid rgba(214,180,106,.55);backdrop-filter:blur(6px);text-align:center;font:500 58px/1 'Cormorant Garamond',serif;color:var(--cream);box-shadow:0 10px 40px #000a}
.book{position:absolute;left:0;right:0;top:118px;display:grid;place-items:center;perspective:1000px}
.bc{width:250px;height:340px;border-radius:6px 16px 16px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:radial-gradient(220px 200px at 70% 10%,#3a2f4a,transparent),linear-gradient(160deg,#17151f,#0b0b10);border:2px solid #d6b46a88;box-shadow:inset 12px 0 18px -8px #000,0 40px 80px -20px #000,0 0 70px rgba(214,180,106,.35)}
.bs{color:var(--gold);font-size:24px}.by{font:600 11px Inter,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}.bn{font:italic 500 40px/1.1 'Cormorant Garamond',serif;color:var(--cream)}.bl{margin-top:18px;font:500 15px 'Cormorant Garamond',serif;color:var(--muted);letter-spacing:.1em}
.dl{font:500 19px Inter,sans-serif;color:#f3c9a0;margin-top:16px}
.btn{display:inline-block;margin-top:26px;padding:17px 30px;border-radius:999px;background:linear-gradient(180deg,#f0d79a,#d6b46a);color:#14110a;font:700 19px Inter,sans-serif;letter-spacing:.03em;box-shadow:0 10px 40px rgba(214,180,106,.45)}
.chips{display:flex;gap:8px;justify-content:center;margin-top:24px}.chips span{border:1px solid rgba(214,180,106,.5);border-radius:999px;padding:6px 12px;font:500 14px Inter,sans-serif;color:#e9dfc6;background:rgba(8,9,13,.45)}
.flashw{position:absolute;inset:0;background:#fff;opacity:0;z-index:7;pointer-events:none}
.phone{position:absolute;left:100px;top:142px;width:340px;height:700px;border-radius:56px;padding:12px;background:linear-gradient(150deg,#5b5c67 0%,#24252d 18%,#121318 50%,#2a2b33 82%,#64656f 100%);box-shadow:0 0 0 1.5px #8a8b96 inset,0 0 0 3px #0b0c10 inset,0 40px 80px -20px #000,0 0 90px -10px rgba(214,180,106,.4)}
.sb{position:absolute;width:4px;border-radius:3px;background:linear-gradient(90deg,#6d6e79,#2b2c33)}.sb.l1{left:-3px;top:118px;height:30px}.sb.l2{left:-3px;top:168px;height:56px}.sb.l3{left:-3px;top:236px;height:56px}.sb.r1{right:-3px;top:190px;height:86px}
.scr{position:relative;height:100%;border-radius:45px;overflow:hidden;background:radial-gradient(320px 220px at 80% 0,#2c2442,transparent),#0a0b11}
.isl{position:absolute;top:12px;left:50%;width:104px;height:30px;margin-left:-52px;border-radius:20px;background:#000;z-index:3;box-shadow:inset 0 0 0 1px #1a1a1f}
.stat{position:absolute;top:16px;left:30px;right:24px;display:flex;justify-content:space-between;align-items:center;font:600 15px Inter,sans-serif;color:#f3efe6;z-index:2}
.ics{display:flex;gap:6px;align-items:center}.sig{display:flex;gap:2px;align-items:flex-end;height:11px}.sig i{width:3px;background:#f3efe6;border-radius:1px}.sig i:nth-child(1){height:4px}.sig i:nth-child(2){height:6px}.sig i:nth-child(3){height:8px}.sig i:nth-child(4){height:11px}
.wf{display:block}
.bat{width:24px;height:12px;border:1.5px solid rgba(243,239,230,.7);border-radius:4px;padding:1.5px;position:relative}.bat i{display:block;height:100%;width:80%;background:#f3efe6;border-radius:2px}.bat::after{content:'';position:absolute;right:-4px;top:3px;width:2px;height:4px;background:rgba(243,239,230,.7);border-radius:0 2px 2px 0}
.app{position:absolute;top:54px;left:12px;right:12px;bottom:20px;display:flex;flex-direction:column;gap:8px}
.ah{display:flex;justify-content:space-between;align-items:center}.ah img{height:26px}.ah span{font:500 21px 'Cormorant Garamond',serif;color:var(--cream)}
.pp{height:3px;border-radius:3px;background:rgba(255,255,255,.12)}.pp i{display:block;height:100%;width:29%;background:var(--gold)}
.pc{border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:9px 11px;background:rgba(255,255,255,.045)}
.pc small{display:block;font:600 10.5px Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.pc p{margin:3px 0 0;font:500 21px/1.15 'Cormorant Garamond',serif;color:var(--cream)}
.pa{margin-top:6px;padding:6px 8px;border-radius:9px;background:rgba(214,180,106,.12);font:400 13px/1.35 Inter,sans-serif;color:#e4dfd2}.pa b{color:#f0d79a}
.tg{display:inline-block;margin-top:5px;font:400 12px Inter,sans-serif;color:var(--muted);border:1px solid rgba(255,255,255,.14);border-radius:99px;padding:2px 8px}
.done{margin-top:auto;text-align:center;padding:12px;border-radius:999px;background:linear-gradient(180deg,#f0d79a,#d6b46a);color:#14110a;font:700 15px Inter,sans-serif}
.home{position:absolute;bottom:8px;left:50%;width:124px;height:5px;margin-left:-62px;border-radius:3px;background:rgba(255,255,255,.6)}
.glass{position:absolute;inset:0;pointer-events:none;background:linear-gradient(118deg,rgba(255,255,255,.13) 0%,rgba(255,255,255,0) 32%,rgba(255,255,255,0) 68%,rgba(255,255,255,.05) 100%)}
.chips2{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:26px auto 0;max-width:440px}
.chips2 span{border:1.5px solid rgba(214,180,106,.6);background:rgba(8,9,13,.55);border-radius:999px;padding:10px 18px;font:500 19px Inter,sans-serif;color:#efe3c4}

`;
const html = `<!doctype html><meta charset="utf-8"><style>${CSS}${AD_CSS}</style><body><div class="bg"></div>${SCENES.map((s, i) => `<div class="sc k-${s.kind}" id="s${i}">${s.html}</div>`).join('')}<div class="flashw" id="fw"></div><div class="stars"></div><img class="toplogo" src="${LOGO}"><script>${starsJS(540, 960, 45, 11)}
const S=${JSON.stringify(SCENES.map(s => ({ at: s.at, d: s.d, k: s.kind })))},TOTAL=${TOTAL};
const R=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),E=x=>1-Math.pow(1-x,3),B=x=>{const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)},q=(el,s)=>el.querySelector(s);
window.setT=t=>{
  const phS=S.find(x=>x.k==='phone'),inPh=phS&&t>phS.at-.1&&t<phS.at+phS.d+.1;document.querySelector('.stars').style.opacity=inPh?0:.55+.3*Math.sin(t*2.4);
  let fl=0;
  S.forEach((s,i)=>{const el=document.getElementById('s'+i),lt=t-s.at,on=t>=s.at&&t<s.at+s.d+.12;el.style.display=on?'block':'none';if(!on)return;
    const kin=s.k==='card'||s.k==='flash';
    el.style.opacity=i===0?1:(kin?1:E(R(lt,0,.14)));
    if(kin){const x=E(R(lt,0,.16));el.style.transform='translateX('+(100*(1-x))+'%)';el.style.zIndex=i+1;}
    if(i>0&&lt<.08)fl=Math.max(fl,(s.k==='flash'?.14:.1)*(1-lt/.08));
    const z=q(el,'.zoom img');if(z)z.style.transform='scale('+(1.04+.1*R(lt,0,s.d))+')';
    const z2=q(el,'.zoom2 img');if(z2)z2.style.transform='scale('+(1.18-.12*E(R(lt,0,s.d)))+')';
    const sl=q(el,'.slam');if(sl){const k=E(R(lt,0,.22));sl.style.transform='scale('+(1.35-.35*k)+')';sl.style.opacity=k;}
    const st=q(el,'.strike i');if(st)st.style.width=(100*E(R(lt,1.1,1.5)))+'%';
    if(s.k==='doors'){const o=E(R(lt,.3,.95));q(el,'.door.l').style.transform='rotateY('+(-105*o)+'deg)';q(el,'.door.r').style.transform='rotateY('+(105*o)+'deg)';q(el,'.glow').style.opacity=Math.sin(Math.PI*R(lt,.25,1.25))*.9;q(el,'.arch img').style.transform='scale('+(1.15-.15*E(R(lt,.1,1.6)))+')';}
    if(s.k==='count'){const c=Math.max(1,Math.min(24,Math.floor(1+23*E(R(lt,.25,1.4)))));document.getElementById('cnt').textContent=c;const w=q(el,'.win');w.style.transform='scale('+(.9+.1*B(R(lt,0,.3)))+')';}
    if(s.k==='card'){const c=q(el,'.ct');const k=E(R(lt,.1,.4));c.style.opacity=k;c.style.transform='translateY('+(30*(1-k))+'px)';}
    if(s.k==='flash'){const w=q(el,'.word');const k=B(R(lt,.1,.42));w.style.transform='translateX(-50%) scale('+(.7+.3*k)+')';w.style.opacity=R(lt,.1,.26);}
    if(s.k==='book'){const b=q(el,'.bc');const k=E(R(lt,0,.8));b.style.transform='rotateY('+(70-82*k)+'deg) rotate('+(-2*k)+'deg) scale('+(.8+.2*k)+')';}
    el.querySelectorAll('.up').forEach((u,j)=>{const k=E(R(lt,.08+j*.12,.45+j*.12));u.style.opacity=k;u.style.transform='translateY('+(24*(1-k))+'px)';});
    el.querySelectorAll('.it').forEach((u,j)=>{const g=s.k==='phone'?.5:.35,o=s.k==='phone'?.4:.3,k=E(R(lt,o+j*g,o+.35+j*g));u.style.opacity=k;u.style.transform='translateY('+(18*(1-k))+'px) scale('+(.96+.04*k)+')';});
    if(s.k==='phone'){const ph=q(el,'.phone');const k=E(R(lt,0,.45));ph.style.transform='perspective(1200px) translateY('+(60*(1-k)+4*Math.sin(lt*2))+'px) rotateX('+(8*(1-k))+'deg) rotate('+(-1.5+1.5*k)+'deg)';ph.style.opacity=k;}
    if(s.k==='cta'){const b=q(el,'.btn');const p=lt>1.2?1+.045*Math.sin((lt-1.2)*6.5):1;b.style.transform='scale('+p+')';}
  });
  document.getElementById('fw').style.opacity=fl;
};setT(0);</script></body>`;
const browser = await chromium.launch();
await renderVideo(browser, 'ad-dec1', html, 'c', 16.4);
await browser.close();
// Музика: три варіанти з music2.py (синтез), удари на відкритті дверцят і на заклику; склейки стоять на долях 100 BPM.
const doorHit = SCENES[1].at + .3, ctaHit = SCENES[SCENES.length - 1].at;
for (const style of (process.env.MUSIC || 'pop,lofi,cine').split(',')) {
  const wav = path.join(OUT, `_m2_${style}.wav`), mp4 = path.join(OUT, `ad-dec1-${style}.mp4`);
  if (spawnSync('python3', [path.join(root, 'marketing/instagram/music2.py'), wav, String(TOTAL), style, `${doorHit},${ctaHit}`], { stdio: 'inherit' }).status) throw new Error('music2 failed');
  if (spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'ad-dec1.mp4'), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' }).status) throw new Error('mux failed');
  fs.rmSync(wav); console.log('mp4', mp4);
}
