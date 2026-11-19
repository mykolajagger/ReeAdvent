(() => {
'use strict';
const $ = s => document.querySelector(s);

// Демо-вікна з прикладами (статичні)
const DEMO = [
  { t: 'Подарунок', tag: 'Подарунок для: Рита', h: 'Набір для чаювання з медом', p: 'Ситечко, баночка меду, пара пакетиків чаю — і готовий затишний вечір.', m: '≈ 200 ₴', i: '<rect x="7" y="18" width="34" height="23" rx="2"/><rect x="5" y="12" width="38" height="6" rx="1"/><path d="M24 12v29M24 12c-3-7-11-7-11-3s6 3 11 3zm0 0c3-7 11-7 11-3s-6 3-11 3z"/>' },
  { t: 'Пригода для двох', tag: 'Пригода для двох', h: 'Вечір при свічках', p: 'Тільки світло свічок і ніяких телефонів — на три години.', m: 'Романтика', i: '<path d="M24 40S7 29 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 11-17 22-17 22z"/>' },
  { t: 'Спільна активність', tag: 'Спільна активність', h: 'Нова кав’ярня', p: 'Оберіть ту, де ще не були, і замовте щось незвичне.', m: 'до ~300 ₴', i: '<path d="M24 5l3.5 10.5H38l-8.5 6.2 3.3 10.3L24 25.8l-8.8 6.2 3.3-10.3L10 15.5h10.5z"/><path d="M24 33v10"/>' }
];
const demo = $('#demo');
demo.innerHTML = DEMO.map((d, i) => `<div class="tile" data-i="${i}"><button class="wrap" type="button"><svg class="ico sm" viewBox="0 0 48 48">${d.i}</svg><b>${d.t}</b><small>торкнись, щоб відкрити</small></button></div>`).join('');
demo.addEventListener('click', e => {
  const w = e.target.closest('.wrap'); if (!w) return;
  const tile = w.parentElement, d = DEMO[+tile.dataset.i];
  tile.innerHTML = `<div class="reveal"><div class="tag">${d.tag}</div><h3>${d.h}</h3><p>${d.p}</p><div class="meta"><span>${d.m}</span></div></div>`;
  window.confetti && window.confetti(e.clientX, e.clientY, 40);
});

// Конфіг: ціна, області
fetch('/api/config').then(r => r.json()).then(c => {
  $('#price').textContent = c.price + ' ₴';
  $('#region').innerHTML += c.regions.map(r => `<option>${r}</option>`).join('');
}).catch(() => { $('#price').textContent = '—'; });

// Дата старту: від завтра до +90 днів, за замовчуванням завтра
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const t0 = new Date(); t0.setDate(t0.getDate() + 1);
const t1 = new Date(t0); t1.setDate(t1.getDate() + 90);
$('#startDate').min = iso(t0); $('#startDate').max = iso(t1); $('#startDate').value = iso(t0);

const ERR = { bad_date: 'Оберіть дату старту: від завтра і не пізніше ніж за 90 днів.', bad_names: 'Вкажіть обидва імені.', bad_email: 'Перевірте адреси пошти.', same_email: 'Пошти мають бути різні: у кожного своя.', bad_city: 'Вкажіть місто.', bad_region: 'Оберіть область.', consent_required: 'Підтвердіть вік і погодьтеся з умовами.', too_many: 'Забагато спроб. Спробуйте за годину.' };
$('#of').addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => $('#' + id).value.trim();
  const body = { nameA: v('nameA'), nameB: v('nameB'), emailA: v('emailA'), emailB: v('emailB'), city: v('city'), region: $('#region').value, startDate: $('#startDate').value, age18: $('#age18').checked, terms: $('#terms').checked };
  const btn = $('#ob'); btn.disabled = true; $('#oerr').textContent = '';
  try {
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    location.href = j.payUrl;
  } catch (er) { $('#oerr').textContent = ERR[er.message] || 'Не вдалося створити замовлення. Спробуйте ще раз.'; btn.disabled = false; }
});
})();
