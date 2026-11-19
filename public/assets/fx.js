(() => {
'use strict';
const $ = s => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* ---------- FX: сніг, гірлянда, конфеті ---------- */
const cv = $('#fx'), cx = cv.getContext('2d');
let W, H, flakes = [], parts = [], dpr = Math.min(devicePixelRatio || 1, 2);
function resize() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); const n = reduceMotion ? 0 : Math.min(70, Math.floor(W / 16)); while (flakes.length < n) flakes.push(flake(true)); flakes.length = n; }
function flake(rand) { return { x: Math.random() * W, y: rand ? Math.random() * H : -10, r: Math.random() * 1.6 + .5, v: Math.random() * .6 + .2, s: Math.random() * Math.PI * 2, d: Math.random() * .02 + .005 }; }
window.confetti = function (x = innerWidth / 2, y = innerHeight / 3, n = 60) {
  if (reduceMotion) return;
  const cols = ['#d6b46a', '#f0d79a', '#f3efe6', '#b8924a'];
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = Math.random() * 8 + 3; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, w: Math.random() * 5 + 3, h: Math.random() * 2 + 2, c: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 1 }); }
}
function frame() {
  cx.clearRect(0, 0, W, H);
  cx.fillStyle = 'rgba(255,255,255,.55)';
  for (const f of flakes) { f.y += f.v; f.s += f.d; f.x += Math.sin(f.s) * .5; if (f.y > H + 5) Object.assign(f, flake(false), { x: Math.random() * W }); cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 6.3); cx.fill(); }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.vy += .28; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= .008; if (p.life <= 0 || p.y > H + 20) { parts.splice(i, 1); continue; } cx.save(); cx.globalAlpha = Math.min(1, p.life * 2); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore(); }
  requestAnimationFrame(frame);
}
addEventListener('resize', resize); resize(); if (!reduceMotion) requestAnimationFrame(frame);


})();
