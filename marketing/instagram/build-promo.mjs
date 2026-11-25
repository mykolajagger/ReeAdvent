// Промо-відео (ваш ролик з героями) + анімовані тексти й картки інтерфейсу в стилі мультику + кінцевий кадр із закликом.
// Запуск: PROMO=/шлях/до/відео.mp4 NODE_PATH=$(npm root -g) node marketing/instagram/build-promo.mjs   → out/promo-ui.mp4
// Накладка рендериться прозорими кадрами (Playwright) і накладається ffmpeg-ом на відео, збільшене до 1080×1920.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { chromium, LOGO, LOGO_FULL, OUT, root } from './lib.mjs';
const SRC = process.env.PROMO; if (!SRC || !fs.existsSync(SRC)) throw new Error('PROMO=шлях до відео');
const FPS = 24, END = 3, dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SRC]).stdout.toString()), TOTAL = dur + END;
const ICON = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/assets/icon-192.png')).toString('base64');
const lastJpg = path.join(OUT, '_promo_last.jpg'); spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.1', '-i', SRC, '-frames:v', '1', '-q:v', '3', lastJpg]);
const LAST = 'data:image/jpeg;base64,' + fs.readFileSync(lastJpg).toString('base64');
// Часові вікна карток (сцени визначені за склейками ролика)
const T = { noti: [0.35, 1.6], q: [1.85, 3.5], win: [3.75, 5.75], city: [6.75, 9.05], gift: [9.3, 11.25], eve: [11.55, 13.8], cta: [dur, TOTAL] };
const html = `<!doctype html><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Inter:wght@400;600;700&display=swap');
:root{--gold:#d6b46a;--cream:#f3efe6}*{box-sizing:border-box}html,body{margin:0;background:transparent;width:540px;height:960px;overflow:hidden;font-family:Inter,sans-serif}
.el{position:absolute;opacity:0;will-change:transform,opacity}
.card{left:28px;right:28px;top:620px;padding:14px 16px 16px;border-radius:20px;background:rgba(12,12,18,.82);border:1px solid rgba(214,180,106,.6);box-shadow:0 18px 50px rgba(0,0,0,.55);backdrop-filter:blur(8px)}
.eb{font:600 12px Inter;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
.tt{font:500 30px/1.1 'Cormorant Garamond',serif;color:var(--cream);margin-top:4px}.tt em{color:var(--gold);font-style:italic}
.q{margin-top:10px;font:500 22px/1.2 'Cormorant Garamond',serif;color:#f3efe6}
.ans{margin-top:8px;padding:8px 11px;border-radius:12px;background:rgba(214,180,106,.15);font:400 16px/1.35 Inter;color:#efe7d6;min-height:22px}.ans b{color:#f0d79a}
.tg{display:inline-block;margin:10px 6px 0 0;font:500 14px Inter;color:#e4dfd2;border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:4px 11px}
.row4{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.row4 span{text-align:center;padding:10px 6px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(214,180,106,.4);font:600 16px Inter;color:#f3efe6;opacity:0}
.prog{display:flex;align-items:center;gap:12px;margin-top:8px;font:500 20px 'Cormorant Garamond',serif;color:var(--cream)}.prog i{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden}.prog i b{display:block;height:100%;width:29%;background:var(--gold)}
.done{margin-top:12px;text-align:center;padding:13px;border-radius:999px;background:linear-gradient(180deg,#f0d79a,#d6b46a);color:#14110a;font:700 18px Inter}
.noti{left:20px;right:20px;top:70px;display:flex;gap:12px;align-items:flex-start;padding:13px 14px;border-radius:22px;background:rgba(30,30,38,.85);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.14);box-shadow:0 18px 50px rgba(0,0,0,.5)}
.noti img{width:44px;height:44px;border-radius:11px}.nt{display:flex;justify-content:space-between;font:600 12px Inter;letter-spacing:.08em;color:#a4a6b4}.nt b{color:#d9d6cc}.nb{font:600 18px Inter;color:#fff;margin-top:3px}.ns{font:400 15px/1.3 Inter;color:#d9d6cc;margin-top:2px}
.bub{left:236px;top:212px;padding:7px 13px;border-radius:16px 16px 4px 16px;background:rgba(12,12,18,.86);border:1px solid rgba(214,180,106,.65);font:600 14px Inter;color:#f0d79a}
.logo{left:0;right:0;top:26px;text-align:center}.logo img{width:96px;filter:drop-shadow(0 2px 10px rgba(0,0,0,.6))}
#fx{position:absolute;inset:0}
.cta{inset:0}.cta .bg{position:absolute;inset:-4%;background:url(${LAST}) center/cover;filter:blur(16px) brightness(.42)}
.cta .mid{position:absolute;left:0;right:0;top:150px;text-align:center;padding:0 30px}
.cta .h1{font:500 64px/1.02 'Cormorant Garamond',serif;color:var(--cream);margin-top:14px}.cta .h1 em{color:var(--gold);font-style:italic}
.cta .dl{font:500 19px Inter;color:#f3c9a0;margin-top:16px}.cta .btn{display:inline-block;margin-top:24px;padding:16px 28px;border-radius:999px;background:linear-gradient(180deg,#f0d79a,#d6b46a);color:#14110a;font:700 19px Inter;box-shadow:0 10px 40px rgba(214,180,106,.45)}
.cta .chips{display:flex;gap:8px;justify-content:center;margin-top:22px}.cta .chips span{border:1px solid rgba(214,180,106,.5);border-radius:999px;padding:6px 12px;font:500 14px Inter;color:#e9dfc6;background:rgba(8,9,13,.45)}
</style><body>
<div class="el logo" id="logo"><img src="${LOGO}"></div>
<div class="el noti" id="noti"><img src="${ICON}"><div style="flex:1"><div class="nt"><b>REEADVENT</b><span>07:00</span></div><div class="nb">Вікно 8 відкрито ✦</div><div class="ns">Доброго ранку! Ваше вікно-сюрприз уже чекає</div></div></div>
<div class="el card" id="q"><div class="eb">Питання дня</div><div class="q">Що в мені досі тебе дивує?</div><div class="ans"><b>Вона:</b> <span id="type"></span></div></div>
<div class="el bub" id="bub">❤ Він прочитав</div>
<div class="el card" id="win"><div class="eb">Вікно 8</div><div class="tt">Відкриваєте <em>разом</em></div><div class="row4"><span>💬 Питання</span><span>🎁 Подарунок</span><span>❤ Пригода</span><span>★ Активність</span></div></div>
<div class="el card" id="city"><div class="eb">Активність у місті</div><div class="tt">Різдвяний <em>ярмарок</em></div><span class="tg">★ 4.8</span><span class="tg">рейтинг Google</span><span class="tg">на мапі</span></div>
<div class="el card" id="gift"><div class="eb">Подарунок для неї</div><div class="tt">Ідея під <em>ваш бюджет</em></div><span class="tg">2–3 магазини онлайн</span><span class="tg">і у вашому місті</span></div>
<div class="el card" id="eve"><div class="eb">І так — 24 дні поспіль</div><div class="prog"><span>Вікно 8 з 24</span><i><b id="pb"></b></i></div><div class="done" id="done">Завершити день ✓</div></div>
<canvas id="fx" width="1080" height="1920"></canvas>
<div class="el cta" id="cta"><div class="bg"></div><div class="mid"><img class="up" src="${LOGO_FULL}" style="width:240px"><div class="h1 up">Старт<br><em>1 грудня</em></div><div class="dl up">встигніть замовити до 30 листопада</div><div class="btn up" id="cbtn">Замовити на reeadvent.fun</div><div class="chips up"><span>24 вікна</span><span>для двох</span><span>будь-яке місто</span></div></div></div>
<script>
const T=${JSON.stringify(T)},R=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),E=x=>1-Math.pow(1-x,3),B=x=>{const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const vis=(t,[a,b],fi=.35,fo=.3)=>Math.min(R(t,a,a+fi),1-R(t,b-fo,b));
const ANS='Як ти щоранку робиш мені каву ☕',cx=document.getElementById('fx').getContext('2d');
let sd=3;const rnd=()=>(sd=(sd*16807)%2147483647)/2147483647;const SP=Array.from({length:60},()=>({a:rnd()*6.28,v:60+rnd()*120,r:1+rnd()*2.4}));
window.setT=t=>{
  const set=(id,k,dy=26)=>{const el=document.getElementById(id);el.style.opacity=k;el.style.transform='translateY('+(dy*(1-E(Math.max(0,k))))+'px)';};
  const n=vis(t,T.noti);set('noti',n,-60);
  const q=vis(t,T.q);set('q',q);document.getElementById('type').textContent=ANS.slice(0,Math.round(ANS.length*R(t,T.q[0]+.3,T.q[0]+1.2)))+(t>T.q[0]+.25&&t<T.q[0]+1.25&&Math.floor(t*4)%2?'|':'');
  const bb=Math.min(R(t,2.7,2.9),1-R(t,T.q[1]-.3,T.q[1]));const be=document.getElementById('bub');be.style.opacity=bb;be.style.transform='scale('+(.6+.4*B(R(t,2.7,3.0)))+')';
  const w=vis(t,T.win);set('win',w);document.querySelectorAll('#win .row4 span').forEach((s,j)=>{const k=R(t,T.win[0]+.35+j*.22,T.win[0]+.6+j*.22);s.style.opacity=k;s.style.transform='scale('+(.7+.3*B(k))+')';});
  set('city',vis(t,T.city));set('gift',vis(t,T.gift));set('eve',vis(t,T.eve));
  const pr=T.eve[0]+1.0,dn=document.getElementById('done');dn.style.transform='scale('+(t>pr&&t<pr+.22?.94:1)+')';document.getElementById('pb').style.width=(29+4.2*E(R(t,pr+.1,pr+.6)))+'%';
  cx.clearRect(0,0,1080,1920);if(t>pr&&t<pr+1.4){const q2=R(t,pr,pr+1.4);for(const s of SP){const d=s.v*E(q2);cx.fillStyle='rgba(255,220,150,'+((1-q2)*.95)+')';cx.beginPath();cx.arc((270+Math.cos(s.a)*d)*2,(752+Math.sin(s.a)*d*.8-30*q2)*2,s.r*2,0,6.28);cx.fill();}}
  document.getElementById('logo').style.opacity=t<T.cta[0]?Math.min(R(t,0,.4),1):0;
  const c=document.getElementById('cta'),lt=t-T.cta[0];c.style.opacity=E(R(lt,0,.5));c.style.transform='none';
  c.querySelectorAll('.up').forEach((u,j)=>{const k=E(R(lt,.15+j*.13,.55+j*.13));u.style.opacity=k;u.style.transform='translateY('+(22*(1-k))+'px)';});
  if(lt>1.2)document.getElementById('cbtn').style.transform='scale('+(1+.045*Math.sin((lt-1.2)*6.5))+')';
};setT(0);</script></body>`;
const fdir = path.join(OUT, '_promo_frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
const browser = await chromium.launch(), p = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
const FR = Math.round(TOTAL * FPS);
for (let f = 0; f < FR; f++) { await p.evaluate(t => window.setT(t), f / FPS); await p.screenshot({ path: path.join(fdir, `o${String(f).padStart(4, '0')}.png`), omitBackground: true }); if (f % 96 === 0) console.log('кадр', f, '/', FR); }
await browser.close();
const outMp4 = path.join(OUT, 'promo-ui.mp4');
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', SRC, '-framerate', String(FPS), '-i', path.join(fdir, 'o%04d.png'),
  '-filter_complex', `[0:v]scale=1080:1920:flags=lanczos,fps=${FPS},tpad=stop_mode=clone:stop_duration=${END}[bg];[bg][1:v]overlay=0:0:shortest=1[v];[0:a]apad=pad_dur=${END},afade=t=out:st=${(dur - 0.8).toFixed(2)}:d=0.8[a]`,
  '-map', '[v]', '-map', '[a]', '-t', TOTAL.toFixed(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outMp4], { stdio: 'inherit' });
if (r.status) throw new Error('ffmpeg failed');
fs.rmSync(fdir, { recursive: true, force: true }); console.log('mp4', outMp4, (fs.statSync(outMp4).size / 1e6).toFixed(1) + ' МБ', TOTAL.toFixed(1) + ' с');
