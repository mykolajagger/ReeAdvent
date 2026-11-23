/* Пропозиція додати календар на головний екран телефону (щоб не вводити адресу щоразу).
   Android/Chrome: системне вікно встановлення; iPhone: коротка інструкція («Поділитися» → «На початковий екран»).
   Показується лише на телефоні, не у вже встановленому застосунку; «Закрити» ховає на 14 днів. */
(() => {
  'use strict';
  const KEY = 'ra_install_hide', standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const hidden = () => { try { return Date.now() < Number(localStorage.getItem(KEY) || 0); } catch { return false; } };
  const L = (uk, en) => ((document.documentElement.lang || 'uk').startsWith('en') ? en : uk);
  let deferred = null, shown = false;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (window.RA_INSTALL_AUTO) show(); });
  function show() {
    if (shown || standalone || !mobile || hidden() || document.getElementById('rainst')) return; shown = true;
    const box = document.createElement('div'); box.id = 'rainst';
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:60;max-width:520px;margin:0 auto;background:#14151d;border:1px solid #d6b46a66;border-radius:16px;padding:14px 16px;display:flex;gap:12px;align-items:center;box-shadow:0 10px 40px #000a;color:#f3efe6;font:14px/1.45 Inter,system-ui,sans-serif';
    const how = deferred ? '' : ios ? L('Натисніть <b>«Поділитися»</b> <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="#d6b46a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><path d="M7 10V1.5M4 4.3 7 1.5l3 2.8M4.5 6.5H2.2v8h9.6v-8H9.5"/></svg> унизу Safari, потім <b>«На початковий екран»</b>.', 'Tap <b>Share</b> <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="#d6b46a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><path d="M7 10V1.5M4 4.3 7 1.5l3 2.8M4.5 6.5H2.2v8h9.6v-8H9.5"/></svg> at the bottom of Safari, then <b>Add to Home Screen</b>.') : L('У меню браузера <b>⋮</b> оберіть <b>«Додати на головний екран»</b>.', 'In the browser menu <b>⋮</b> choose <b>Add to Home screen</b>.');
    box.innerHTML = `<img src="/assets/icon-192.png" alt="" style="width:46px;height:46px;border-radius:12px;flex:none"><div style="flex:1;min-width:0"><b>${L('Додайте календар на головний екран', 'Add the calendar to your home screen')}</b><div style="color:#a4a6b4;font-size:13px">${how || L('Відкриватиметься одним дотиком, як застосунок.', 'It will open with one tap, like an app.')}</div></div>${deferred ? `<button type="button" id="rainstgo" style="flex:none;border:0;border-radius:99px;padding:9px 14px;background:#d6b46a;color:#14110a;font:600 13px Inter,sans-serif;cursor:pointer">${L('Додати', 'Add')}</button>` : ''}<button type="button" id="rainstx" aria-label="${L('Закрити', 'Close')}" style="flex:none;border:0;background:none;color:#a4a6b4;font-size:18px;cursor:pointer;padding:4px">✕</button>`;
    document.body.appendChild(box);
    const close = () => { box.remove(); try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)); } catch {} };
    box.querySelector('#rainstx').onclick = close;
    const go = box.querySelector('#rainstgo'); if (go) go.onclick = async () => { try { deferred.prompt(); await deferred.userChoice; } catch {} box.remove(); deferred = null; };
  }
  addEventListener('appinstalled', () => { const b = document.getElementById('rainst'); if (b) b.remove(); });
  window.raInstall = (delay = 2500) => setTimeout(show, delay);   // сторінка сама вирішує, коли запропонувати
})();
