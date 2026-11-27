// Анімована сторіс «Твій адвент на сьогодні»: вікно з датою відчиняється, всередині — порада дня й заклик. 9:16, ~10 с.
// Запуск: DAY=27 MONTH="листопада" NODE_PATH=$(npm root -g) node marketing/instagram/build-today.mjs   → out/today-<DAY>.mp4 (+ -pop.mp4 з музикою)
// Безпечні зони сторіс: верхні ~130 і нижні ~170 CSS-пікселів (з 960) не зайняті важливим текстом.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { chromium, LOGO, LOGO_FULL, CSS, renderVideo, OUT, root, AS } from './lib.mjs';
const DAY = process.env.DAY || '27', MONTH = process.env.MONTH || 'листопада';
const T1 = process.env.T1 || 'Час придбати подарунок', T2 = process.env.T2 || 'для вас двох!';
const img = n => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(AS, 'story', n)).toString('base64');
const GIFT = img('v5-gift.jpg'), EVE = img('v6-evening.jpg');
const TOTAL = 10;
const html = `<!doctype html><meta charset="utf-8"><style>${CSS}
body{width:540px;height:960px}
.bgi{position:absolute;inset:-6%;background:url(${EVE}) center/cover;filter:blur(18px) brightness(.38)}
.top{position:absolute;left:0;right:0;top:120px;text-align:center}
.top .eb{font:600 15px Inter,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:var(--gold)}
.top .dt{font:500 34px 'Cormorant Garamond',serif;color:var(--cream);margin-top:6px}
.win{position:absolute;left:90px;top:225px;width:360px;height:430px;border-radius:180px 180px 26px 26px;border:3px solid var(--gold);overflow:hidden;box-shadow:0 0 90px rgba(255,190,100,.35);perspective:1100px;background:#0d0c09}
.win .in{position:absolute;inset:0;background:url(${GIFT}) 60% 32%/cover}
.door{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(160deg,#2a2213,#120f09);border:2px solid rgba(214,180,106,.75);backface-visibility:hidden;display:grid;place-items:center}
.door.l{left:0;transform-origin:left center;border-radius:180px 0 0 0}.door.r{right:0;transform-origin:right center;border-radius:0 180px 0 0}
.num{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);font:500 150px/1 'Cormorant Garamond',serif;color:var(--gold);text-shadow:0 0 40px rgba(214,180,106,.5);z-index:3}
.bow{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:46px;z-index:3}
.glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,rgba(255,225,160,.95),rgba(255,200,120,0) 62%);mix-blend-mode:screen;opacity:0;z-index:4}
.msg{position:absolute;left:24px;right:24px;top:672px;text-align:center}
.msg .h{font:500 44px/1.05 'Cormorant Garamond',serif;color:var(--cream)}.msg .h em{color:var(--gold);font-style:italic}
.cta{position:absolute;left:30px;right:30px;top:600px;padding:18px 18px 20px;border-radius:22px;background:rgba(12,12,18,.86);border:1px solid rgba(214,180,106,.65);box-shadow:0 18px 50px rgba(0,0,0,.6);text-align:center}
.cta .l{font:600 12px Inter,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
.cta .t{font:500 26px/1.15 'Cormorant Garamond',serif;color:var(--cream);margin-top:6px}
.cta .pr{margin-top:10px;font:500 15px Inter,sans-serif;color:#f3c9a0}.cta .pr b{font:500 30px 'Cormorant Garamond',serif;color:var(--gold);margin-right:6px}.cta .pr s{color:#9a9cab;margin-right:8px}
.cta .btn{display:inline-block;margin-top:14px;padding:14px 24px;border-radius:999px;background:linear-gradient(180deg,#f0d79a,#d6b46a);color:#14110a;font:700 17px Inter,sans-serif;box-shadow:0 10px 36px rgba(214,180,106,.45)}
.logo{position:absolute;left:0;right:0;top:64px;text-align:center}.logo img{width:110px}
#fx{position:absolute;inset:0;z-index:5;pointer-events:none}
</style><body><div class="bg"></div><div class="bgi"></div>
<div class="logo"><img src="${LOGO}"></div>
<div class="top" id="top"><div class="eb">Твій адвент на сьогодні</div><div class="dt">${DAY} ${MONTH}</div></div>
<div class="win" id="win"><div class="in" id="in"></div><div class="door l" id="dl"></div><div class="door r" id="dr"></div><div class="bow" id="bow">🎁</div><div class="num" id="num">${DAY}</div><div class="glow" id="glow"></div></div>
<div class="msg" id="msg"><div class="h">${T1}<br><em>${T2}</em></div></div>
<div class="cta" id="cta"><div class="l">24 вікна для пари · старт 1 грудня</div><div class="t">Подаруйте собі не річ,<br>а 24 дні уваги</div><div class="pr"><b>899 ₴</b><s>1399 ₴</s>до 30 листопада</div><div class="btn" id="btn">Замовити на reeadvent.fun</div></div>
<canvas id="fx" width="1080" height="1920"></canvas><div class="stars"></div>
<script>
const TOTAL=${TOTAL};const R=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),E=x=>1-Math.pow(1-x,3),B=x=>{const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const $=id=>document.getElementById(id),cx=$('fx').getContext('2d');let sd=7;const rnd=()=>(sd=(sd*16807)%2147483647)/2147483647;
const SP=Array.from({length:90},()=>({a:rnd()*6.28,v:80+rnd()*260,r:1+rnd()*2.6,d:rnd()*.4}));const SN=Array.from({length:70},()=>({x:rnd()*540,y:rnd()*960,v:14+rnd()*26,r:.6+rnd()*1.6,w:rnd()*6.28}));
window.setT=t=>{
  const tp=E(R(t,.1,.7));$('top').style.opacity=tp;$('top').style.transform='translateY('+(-16*(1-tp))+'px)';
  const w=B(R(t,0,.6));$('win').style.transform='scale('+(.85+.15*w)+') translateY('+(3*Math.sin(t*2))+'px)';$('win').style.opacity=R(t,0,.3);
  const o=E(R(t,1.4,2.4));$('dl').style.transform='rotateY('+(-108*o)+'deg)';$('dr').style.transform='rotateY('+(108*o)+'deg)';
  const nk=1-R(t,1.3,1.8);$('num').style.opacity=nk;$('bow').style.opacity=nk;$('num').style.transform='translate(-50%,-50%) scale('+(1+.08*Math.sin(t*5)*(t<1.3?1:0))+')';
  $('glow').style.opacity=Math.sin(Math.PI*R(t,1.35,2.9))*.95;
  $('in').style.transform='scale('+(1.18-.13*E(R(t,1.4,6)))+')';
  const m=E(R(t,2.5,3.1))*(1-R(t,5.4,5.8));$('msg').style.opacity=m;$('msg').style.transform='translateY('+(22*(1-E(R(t,2.5,3.1))))+'px)';
  const c=E(R(t,5.7,6.3));$('cta').style.opacity=c;$('cta').style.transform='translateY('+(40*(1-c))+'px)';
  $('btn').style.transform='scale('+(t>6.6?1+.05*Math.sin((t-6.6)*6.5):1)+')';
  cx.clearRect(0,0,1080,1920);
  if(t>1.5&&t<4.2){const q=R(t,1.5,4.2);for(const s of SP){const qq=Math.max(0,q-s.d);const d=s.v*E(qq);cx.fillStyle='rgba(255,220,150,'+((1-qq)*.95)+')';cx.beginPath();cx.arc((270+Math.cos(s.a)*d)*2,(440+Math.sin(s.a)*d*.9-40*qq)*2,s.r*2,0,6.28);cx.fill();}}
  for(const f of SN){const y=(f.y+f.v*t)%960,x=f.x+Math.sin(t*1.3+f.w)*8;cx.fillStyle='rgba(255,255,255,.5)';cx.beginPath();cx.arc(x*2,y*2,f.r*2,0,6.28);cx.fill();}
};setT(0);</script></body>`;
const browser = await chromium.launch();
await renderVideo(browser, 'today-' + DAY, html, 'b', 7.5);
await browser.close();
const wav = path.join(OUT, '_m_today.wav'), mp4 = path.join(OUT, `today-${DAY}-pop.mp4`);
if (spawnSync('python3', [path.join(root, 'marketing/instagram/music2.py'), wav, String(TOTAL), 'pop', '1.4,5.7'], { stdio: 'inherit' }).status) throw new Error('music');
if (spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, `today-${DAY}.mp4`), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' }).status) throw new Error('mux');
fs.rmSync(wav); console.log('mp4', mp4);
