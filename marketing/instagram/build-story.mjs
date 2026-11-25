// Мультик «Він і Вона користуються ReeAdvent»: 6 кадрів-ілюстрацій (assets/story/v*.jpg) + рух камери, світло, сніг, іскри з телефона,
// інтерфейс календаря поверх кадру (сповіщення, вікно дня, питання й відповідь, місце в місті, подарунок, «Завершити день»), заклик.
// Запуск: NODE_PATH=$(npm root -g) node marketing/instagram/build-story.mjs   Результат: marketing/instagram/out/story-calendar-{pop,cine,lofi}.mp4
// Кадр 540×960 CSS (×2 = 1080×1920). Ілюстрації 9:16, тож координати = пікселі картинки × 540/ширина.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { chromium, LOGO, LOGO_FULL, CSS, starsJS, renderVideo, OUT, root, AS } from './lib.mjs';
const img = n => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(AS, 'story', n)).toString('base64');
const ICON = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/assets/icon-192.png')).toString('base64');

// Кадри: зображення, рух камери (масштаб від→до, точка), «телефон» (звідки іскри), підпис і картка інтерфейсу
const SHOTS = [
  { src: 'v1-morning.jpg', d: 3.6, z: [1.0, 1.12], o: '40% 70%', ph: [330, 715], snow: true,
    ui: `<div class="noti"><img src="${ICON}"><div><div class="nt"><b>REEADVENT</b><span>07:00</span></div><div class="nb">Вікно 8 відкрито ✦</div><div class="ns">Доброго ранку! Ваше вікно-сюрприз уже чекає</div></div></div>` },
  { src: 'v2-together.jpg', d: 3.6, z: [1.1, 1.0], o: '50% 50%', ph: [318, 535],
    cap: ['Вікно 8', 'Відкриваєте <em>разом</em>'],
    ui: `<div class="card" style="top:668px"><div class="row4"><span class="it">💬 Питання</span><span class="it">🎁 Подарунок</span><span class="it">❤ Пригода</span><span class="it">★ Активність</span></div></div>` },
  { src: 'v3-answer.jpg', d: 4.8, z: [1.04, 1.1], o: '45% 45%', ph: [268, 515], ph2: [487, 290],
    cap: ['Питання дня', 'Одне <em>одному</em>'],
    ui: `<div class="card" style="top:640px"><small>Питання дня</small><p>Що в мені досі тебе дивує?</p><div class="ans"><b>Вона:</b> <span class="type" data-t="Як ти щоранку робиш мені каву ☕"></span></div></div><div class="bub it2" style="left:318px;top:330px">❤ Він прочитав</div>` },
  { src: 'v4-market.jpg', d: 3.6, z: [1.02, 1.1], o: '62% 40%', ph: [358, 452], snow: true,
    cap: ['Активність', 'У вашому <em>місті</em>'],
    ui: `<div class="card" style="top:648px"><small>Активність у місті</small><p>Різдвяний ярмарок</p><span class="tg">★ 4.8</span><span class="tg">рейтинг Google</span><span class="tg">на мапі</span></div>` },
  { src: 'v5-gift.jpg', d: 3.6, z: [1.0, 1.1], o: '62% 30%', ph: [250, 430],
    cap: ['Подарунок', 'Який <em>влучить</em>'],
    ui: `<div class="card" style="top:648px"><small>Подарунок для неї</small><p>Ідея під ваш бюджет</p><span class="tg">2–3 магазини онлайн</span><span class="tg">і у вашому місті</span></div>` },
  { src: 'v6-evening.jpg', d: 3.6, z: [1.1, 1.0], o: '50% 45%', ph: [335, 520], burst: 1.6,
    cap: ['І так', '<em>24 дні</em> поспіль'],
    ui: `<div class="card" style="top:648px"><div class="prog"><span>Вікно 8 з 24</span><i><b></b></i></div><div class="done">Завершити день ✓</div></div>` },
];
let t0 = 0; for (const s of SHOTS) { s.at = t0; t0 += s.d; }
const CTA = { at: t0, d: 4.2 }; const TOTAL = Math.round((t0 + CTA.d) * 100) / 100;

const ST_CSS = `
body{width:540px;height:960px;background:#08090d}.toplogo{top:28px;width:100px;z-index:9}
.sh{position:absolute;inset:0;overflow:hidden;opacity:0}.sh .im{position:absolute;inset:0;background-size:cover;background-position:center;will-change:transform}
.sh .tg2{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,9,13,.78) 0%,rgba(8,9,13,.25) 22%,rgba(8,9,13,0) 34%,rgba(8,9,13,0) 58%,rgba(8,9,13,.55) 72%,rgba(8,9,13,.8) 100%)}
.glow{position:absolute;width:260px;height:260px;margin:-130px 0 0 -130px;border-radius:50%;background:radial-gradient(circle,rgba(255,220,150,.55),rgba(255,200,120,0) 65%);mix-blend-mode:screen;pointer-events:none}
.cap{position:absolute;left:0;right:0;top:78px;text-align:center;z-index:5}
.cap small{display:block;font:600 14px Inter,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
.cap div{font:500 46px/1.05 'Cormorant Garamond',serif;color:var(--cream);text-shadow:0 4px 24px rgba(0,0,0,.7);margin-top:4px}.cap em{color:var(--gold);font-style:italic}
.card{position:absolute;left:40px;right:40px;padding:14px 16px;border-radius:20px;background:rgba(12,12,18,.8);border:1px solid rgba(214,180,106,.55);box-shadow:0 18px 50px rgba(0,0,0,.6);backdrop-filter:blur(8px);z-index:5}
.card small{display:block;font:600 12px Inter,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.card p{margin:4px 0 0;font:500 28px/1.12 'Cormorant Garamond',serif;color:var(--cream)}
.ans{margin-top:10px;padding:9px 12px;border-radius:12px;background:rgba(214,180,106,.14);font:400 17px/1.35 Inter,sans-serif;color:#efe7d6;min-height:23px}.ans b{color:#f0d79a}
.tg{display:inline-block;margin:10px 6px 0 0;font:500 14px Inter,sans-serif;color:#e4dfd2;border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:4px 11px}
.row4{display:grid;grid-template-columns:1fr 1fr;gap:8px}.row4 span{text-align:center;padding:10px 6px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(214,180,106,.35);font:600 16px Inter,sans-serif;color:#f3efe6}
.bub{position:absolute;z-index:5;padding:7px 13px;border-radius:16px 16px 16px 4px;background:rgba(12,12,18,.85);border:1px solid rgba(214,180,106,.6);font:600 14px Inter,sans-serif;color:#f0d79a}
.noti{position:absolute;left:22px;right:22px;top:92px;display:flex;gap:12px;align-items:flex-start;padding:13px 14px;border-radius:22px;background:rgba(30,30,38,.82);backdrop-filter:blur(14px);box-shadow:0 18px 50px rgba(0,0,0,.55);z-index:5;border:1px solid rgba(255,255,255,.12)}
.noti img{width:44px;height:44px;border-radius:11px;flex:none}.nt{display:flex;justify-content:space-between;font:600 12px Inter,sans-serif;letter-spacing:.08em;color:#a4a6b4}.nt b{color:#d9d6cc}
.nb{font:600 18px Inter,sans-serif;color:#fff;margin-top:3px}.ns{font:400 15px/1.3 Inter,sans-serif;color:#d9d6cc;margin-top:2px}
.prog{display:flex;align-items:center;gap:12px;font:500 22px 'Cormorant Garamond',serif;color:var(--cream)}.prog i{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}.prog i b{display:block;height:100%;width:29%;background:var(--gold)}
.done{margin-top:12px;text-align:center;padding:13px;border-radius:999px;background:linear-gradient(180deg,#f0d79a,#d6b46a);color:#14110a;font:700 18px Inter,sans-serif}
#fx{position:absolute;inset:0;z-index:4;pointer-events:none}
.cta{position:absolute;inset:0;opacity:0;z-index:7}.cta .bgb{position:absolute;inset:-4%;background-size:cover;background-position:center;filter:blur(16px) brightness(.45)}
.cta .mid{position:absolute;left:0;right:0;top:120px;text-align:center;padding:0 34px}
.cta .h1{font:500 66px/1.02 'Cormorant Garamond',serif;color:var(--cream);margin-top:14px}.cta .h1 em{color:var(--gold);font-style:italic}
.cta .dl{font:500 19px Inter,sans-serif;color:#f3c9a0;margin-top:16px}
.cta .btn{display:inline-block;margin-top:26px;padding:17px 30px;border-radius:999px;background:linear-gradient(180deg,#f0d79a,#d6b46a);color:#14110a;font:700 19px Inter,sans-serif;box-shadow:0 10px 40px rgba(214,180,106,.45)}
.cta .chips{display:flex;gap:8px;justify-content:center;margin-top:24px}.cta .chips span{border:1px solid rgba(214,180,106,.5);border-radius:999px;padding:6px 12px;font:500 14px Inter,sans-serif;color:#e9dfc6;background:rgba(8,9,13,.45)}
`;
const html = `<!doctype html><meta charset="utf-8"><style>${CSS}${ST_CSS}</style><body>
${SHOTS.map((s, i) => `<div class="sh" id="h${i}"><div class="im" style="background-image:url(${img(s.src)});transform-origin:${s.o}"></div><div class="tg2"></div>${s.ph ? `<div class="glow" style="left:${s.ph[0]}px;top:${s.ph[1]}px"></div>` : ''}${s.cap ? `<div class="cap"><small>${s.cap[0]}</small><div>${s.cap[1]}</div></div>` : ''}${s.ui}</div>`).join('')}
<div class="cta" id="cta"><div class="bgb" style="background-image:url(${img('v6-evening.jpg')})"></div><div class="mid"><img class="up" src="${LOGO_FULL}" style="width:250px"><div class="h1 up">Старт<br><em>1 грудня</em></div><div class="dl up">встигніть замовити до 30 листопада</div><div class="btn up">Замовити на reeadvent.fun</div><div class="chips up"><span>24 вікна</span><span>для двох</span><span>будь-яке місто</span></div></div></div>
<canvas id="fx" width="1080" height="1920"></canvas><div class="stars"></div><img class="toplogo" src="${LOGO}">
<script>${starsJS(540, 960, 30, 5)}
const S=${JSON.stringify(SHOTS.map(s => ({ at: s.at, d: s.d, z: s.z, ph: s.ph || null, ph2: s.ph2 || null, snow: !!s.snow, burst: s.burst || null })))},CTA=${JSON.stringify(CTA)},TOTAL=${TOTAL};
const R=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),E=x=>1-Math.pow(1-x,3),B=x=>{const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const cv=document.getElementById('fx'),cx=cv.getContext('2d');
let seed=1;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const SN=Array.from({length:110},()=>({x:rnd()*540,y:rnd()*960,v:18+rnd()*30,r:.6+rnd()*1.8,w:rnd()*6.28}));
const SP=Array.from({length:70},()=>({a:rnd()*6.28,v:30+rnd()*70,life:.9+rnd()*1.4,off:rnd()*2.2,r:.8+rnd()*2.2,drift:(rnd()-.5)*40}));
function sparks(p,lt,k,mult){ if(!p)return; for(const s of SP){const tt=((lt+s.off)%s.life),q=tt/s.life;const x=p[0]+Math.cos(s.a)*12+s.drift*q,y=p[1]-s.v*tt*1.2;const al=Math.sin(Math.PI*q)*k;
  cx.fillStyle='rgba(255,215,140,'+(al*.9)+')';cx.beginPath();cx.arc(x*2,y*2,s.r*2*mult,0,6.28);cx.fill();}}
window.setT=t=>{
  cx.clearRect(0,0,1080,1920); document.querySelector('.stars').style.opacity=0;
  S.forEach((s,i)=>{const el=document.getElementById('h'+i),lt=t-s.at,on=t>=s.at-.01&&t<s.at+s.d+.5;el.style.display=on?'block':'none';if(!on)return;
    el.style.opacity=i===0?1:E(R(lt,0,.45)); el.style.zIndex=i+1;
    const p=R(lt,0,s.d+.5),zz=s.z[0]+(s.z[1]-s.z[0])*p; el.querySelector('.im').style.transform='scale('+zz+')';
    const g=el.querySelector('.glow');if(g){g.style.opacity=(.55+.35*Math.sin(lt*3.2))*E(R(lt,.1,.6));g.style.transform='scale('+(.9+.15*Math.sin(lt*2.4))+')';}
    const cap=el.querySelector('.cap');if(cap){const k=E(R(lt,.25,.75));cap.style.opacity=k;cap.style.transform='translateY('+(16*(1-k))+'px)';}
    const n=el.querySelector('.noti');if(n){const k=B(R(lt,.45,.95));n.style.transform='translateY('+(-160*(1-k))+'px)';n.style.opacity=R(lt,.45,.6);}
    const c=el.querySelector('.card');if(c){const k=E(R(lt,.7,1.15));c.style.opacity=k;c.style.transform='translateY('+(30*(1-k))+'px)';}
    el.querySelectorAll('.it').forEach((u,j)=>{const k=B(R(lt,1.0+j*.28,1.3+j*.28));u.style.opacity=R(lt,1.0+j*.28,1.15+j*.28);u.style.transform='scale('+(.7+.3*k)+')';});
    const ty=el.querySelector('.type');if(ty){const txt=ty.dataset.t,nn=Math.round(txt.length*R(lt,1.3,2.9));ty.textContent=txt.slice(0,nn)+(lt>1.2&&lt<3.1&&Math.floor(lt*3)%2?'|':'');}
    el.querySelectorAll('.it2').forEach(u=>{const k=B(R(lt,3.2,3.55));u.style.opacity=R(lt,3.2,3.35);u.style.transform='scale('+(.6+.4*k)+')';});
    const dn=el.querySelector('.done');if(dn&&s.burst){const pr=lt>s.burst&&lt<s.burst+.25;dn.style.transform='scale('+(pr?.94:1)+')';const b=el.querySelector('.prog b');if(b)b.style.width=(29+4.2*E(R(lt,s.burst+.1,s.burst+.6)))+'%';}
    const vis=el.style.opacity*1;
    if(s.ph&&lt<s.d+.3)sparks(s.ph,lt,vis*E(R(lt,.2,.8)),1);
    if(s.ph2&&lt>3.1&&lt<s.d+.3)sparks(s.ph2,lt,vis*.8*R(lt,3.1,3.5),.8);
    if(s.burst&&lt>s.burst){const q=R(lt,s.burst,s.burst+1.6);for(const z of SP){const ang=z.a,dist=(40+z.v*2.2)*E(q);const x=270+Math.cos(ang)*dist,y=718+Math.sin(ang)*dist*.8-40*q;cx.fillStyle='rgba(255,220,150,'+((1-q)*.95)+')';cx.beginPath();cx.arc(x*2,y*2,z.r*2.4,0,6.28);cx.fill();}}
    if(s.snow&&on)for(const f of SN){const y=(f.y+f.v*t)%960,x=f.x+Math.sin(t*1.3+f.w)*8;cx.fillStyle='rgba(255,255,255,'+(.55*vis)+')';cx.beginPath();cx.arc(x*2,y*2,f.r*2,0,6.28);cx.fill();}
  });
  const c=document.getElementById('cta'),lt=t-CTA.at;c.style.opacity=E(R(lt,0,.5));c.style.display=lt>-.05?'block':'none';
  c.querySelectorAll('.up').forEach((u,j)=>{const k=E(R(lt,.15+j*.14,.55+j*.14));u.style.opacity=k;u.style.transform='translateY('+(24*(1-k))+'px)';});
  const b=c.querySelector('.btn');if(lt>1.3)b.style.transform='scale('+(1+.045*Math.sin((lt-1.3)*6.5))+')';
  if(lt>0)document.querySelector('.stars').style.opacity=.6;
};setT(0);</script></body>`;

const browser = await chromium.launch();
await renderVideo(browser, 'story-calendar', html, 'c', CTA.at + 2.4);
await browser.close();
// музика (music2.py): удари на відкритті вікна (кадр 2) і на заклику; кадри стоять на долях 100 BPM
const hits = [SHOTS[1].at, CTA.at];
for (const style of (process.env.MUSIC || 'pop,cine,lofi').split(',')) {
  const wav = path.join(OUT, `_m3_${style}.wav`), mp4 = path.join(OUT, `story-calendar-${style}.mp4`);
  if (spawnSync('python3', [path.join(root, 'marketing/instagram/music2.py'), wav, String(TOTAL), style, hits.join(',')], { stdio: 'inherit' }).status) throw new Error('music2 failed');
  if (spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'story-calendar.mp4'), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' }).status) throw new Error('mux failed');
  fs.rmSync(wav); console.log('mp4', mp4);
}
