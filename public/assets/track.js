/* Реклама й аналітика: банер згоди на cookies, піксель Meta, GA4, Google Ads. Скрипти постачальників вантажаться лише після «Прийняти всі»
   й лише якщо ID задано в адмінці. UTM-мітки зберігаються в сесії й додаються до замовлення. */
(() => {
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  const lang = () => { if (window.LANG && window.LANG.get) { const g = window.LANG.get(); if (g === 'en' || g === 'uk') return g; } const s = ls.get('lang'); return s === 'en' || s === 'uk' ? s : (/^uk/i.test(navigator.language || '') ? 'uk' : 'en'); };
  // --- UTM: з адреси (або за fbclid/gclid), остання мітка перемагає; у замовлення йде window.raUtm()
  const q = new URLSearchParams(location.search), u = {};
  for (const k of ['source', 'medium', 'campaign', 'content', 'term']) { const v = q.get('utm_' + k); if (v) u[k] = v.slice(0, 80); }
  if (!u.source && q.get('fbclid')) { u.source = 'meta'; u.medium = 'click'; } else if (!u.source && q.get('gclid')) { u.source = 'google'; u.medium = 'click'; }
  // Без UTM, але прийшли з соцмережі чи пошуку: джерело з адреси, звідки перейшли (лише домен), щоб і воронка, і замовлення знали джерело
  if (!u.source && document.referrer) { try { const h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h && h !== location.hostname) { const m = [['instagram', 'instagram'], ['facebook', 'facebook'], ['fb.', 'facebook'], ['threads', 'threads'], ['google', 'google'], ['bing', 'bing'], ['tiktok', 'tiktok'], ['t.me', 'telegram'], ['telegram', 'telegram'], ['youtube', 'youtube'], ['pinterest', 'pinterest']].find(([k]) => h.includes(k)); u.source = m ? m[1] : h.slice(0, 40); u.medium = 'referral'; } } catch {} }
  if (Object.keys(u).length) ss.set('ra_utm', JSON.stringify(u));
  window.raUtm = () => { try { return JSON.parse(ss.get('ra_utm') || 'null') || undefined; } catch { return undefined; } };
  // --- Анонімна воронка (без cookies): перегляд сторінки, початок заповнення форми, перехід до оплати; по разу за сесію
  const beacon = e => { try { const cur = window.raUtm() || {}, body = JSON.stringify({ e, p: location.pathname, s: cur.source, c: cur.campaign }); if (!(navigator.sendBeacon && navigator.sendBeacon('/api/v', new Blob([body], { type: 'text/plain' })))) fetch('/api/v', { method: 'POST', body, keepalive: true }).catch(() => {}); } catch {} };
  const once = (k, e) => { if (ss.get(k)) return; ss.set(k, '1'); beacon(e); };
  if (!/^\/thanks/.test(location.pathname)) once('ra_v' + location.pathname, 'view');
  document.addEventListener('focusin', e => { if (e.target && e.target.closest && e.target.closest('form')) once('ra_f', 'form'); });
  // --- завантаження постачальників
  let cfg = null, loaded = false; const queue = [];
  const T = { uk: { t: 'Cookies і реклама', p: 'Ми використовуємо технічні cookies, а за вашої згоди ще й рекламні та аналітичні (Meta, Google), щоб вимірювати ефективність реклами.', a: 'Прийняти всі', n: 'Лише необхідні', m: 'Докладніше', open: 'Налаштування cookies' }, en: { t: 'Cookies and advertising', p: 'We use essential cookies and, with your consent, advertising and analytics cookies (Meta, Google) to measure how our ads perform.', a: 'Accept all', n: 'Essential only', m: 'Learn more', open: 'Cookie settings' } };
  function load() {
    if (loaded || !cfg) return; loaded = true;
    if (cfg.meta) { !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js'); fbq('init', cfg.meta); fbq('track', 'PageView'); }
    const gid = cfg.ga4 || cfg.gads;
    if (gid) { const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gid); document.head.appendChild(s); window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); }; gtag('js', new Date()); if (cfg.ga4) gtag('config', cfg.ga4); if (cfg.gads) gtag('config', cfg.gads); }
    while (queue.length) send(...queue.shift());
  }
  function send(ev, d = {}) {
    const cur = d.currency || 'UAH';
    if (ev === 'view') { window.fbq && fbq('track', 'ViewContent', { content_name: 'ReeAdvent', content_type: 'product' }); }
    else if (ev === 'checkout') { window.fbq && fbq('track', 'InitiateCheckout', d.value ? { value: d.value, currency: cur } : {}); window.gtag && cfg.ga4 && gtag('event', 'begin_checkout', d.value ? { value: d.value, currency: cur } : {}); }
    else if (ev === 'purchase') {
      window.fbq && fbq('track', 'Purchase', { value: d.value, currency: cur }, { eventID: d.id });
      window.gtag && cfg.ga4 && gtag('event', 'purchase', { transaction_id: d.id, value: d.value, currency: cur });
      window.gtag && cfg.gads && cfg.gadsLabel && gtag('event', 'conversion', { send_to: cfg.gads + '/' + cfg.gadsLabel, value: d.value, currency: cur, transaction_id: d.id });
    }
  }
  window.raTrack = (ev, d) => { if (ev === 'checkout') once('ra_c', 'checkout'); if (ls.get('ra_consent') !== 'all') return; if (loaded) send(ev, d); else queue.push([ev, d]); };
  // --- банер
  function banner() {
    const L = T[lang()]; document.getElementById('ra-ck')?.remove();
    const el = document.createElement('div'); el.id = 'ra-ck'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', L.t);
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:560px;margin:0 auto;background:#12131a;color:#f3efe6;border:1px solid #d6b46a;border-radius:14px;padding:14px 16px;font:14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 10px 40px #000a';
    const priv = lang() === 'en' ? '/legal/privacy.en.html#cookies' : '/legal/privacy.html#cookies', btn = 'border-radius:10px;padding:8px 14px;font:600 13px Inter,sans-serif;cursor:pointer;border:1px solid #d6b46a;';
    el.innerHTML = `<b>${L.t}</b><div style="color:#b8bac6;margin:4px 0 10px">${L.p} <a href="${priv}" style="color:#d6b46a">${L.m}</a></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-v="all" style="${btn}background:#d6b46a;color:#17130a">${L.a}</button><button type="button" data-v="necessary" style="${btn}background:transparent;color:#f3efe6">${L.n}</button></div>`;
    el.querySelectorAll('button').forEach(b => b.onclick = () => { ls.set('ra_consent', b.dataset.v); el.remove(); if (b.dataset.v === 'all') { const u2 = ss.get('ra_utm'); if (u2) ls.set('ra_utm', u2); load(); if (/^\/(index\.html)?$/.test(location.pathname)) window.raTrack('view'); } });
    document.body.appendChild(el);
  }
  function init() {
    if (!cfg || !(cfg.meta || cfg.ga4 || cfg.gads)) return;   // нічого не підключено: банер не потрібен
    const c = ls.get('ra_consent'); if (c === 'all') { load(); if (/^\/(index\.html)?$/.test(location.pathname)) window.raTrack('view'); } else if (!c) banner();
    const open = document.getElementById('ck-open'); if (open) { open.hidden = false; open.textContent = T[lang()].open; open.onclick = e => { e.preventDefault(); banner(); }; }
  }
  // мова сайту перемкнулась: банер і посилання «Налаштування cookies» оновлюють текст
  window.addEventListener('langchange', () => { if (document.getElementById('ra-ck')) banner(); const o = document.getElementById('ck-open'); if (o && !o.hidden) o.textContent = T[lang()].open; });
  fetch('/api/track-config').then(r => r.json()).then(j => { if (j && j.ok) { cfg = j; init(); } }).catch(() => {});
})();
