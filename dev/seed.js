// Тестові дані для локального перегляду адмінки (лише в пам'яті dev-сервера).
export function seed(raw) {
  const DAY = 864e5, now = Date.now();
  let seedv = 42; const rnd = () => (seedv = (seedv * 1664525 + 1013904223) >>> 0) / 4294967296;
  const cities = [['Львів', 'Львівська'], ['Київ', 'м. Київ'], ['Ужгород', 'Закарпатська'], ['Одеса', 'Одеська'], ['Харків', 'Харківська'], ['Дніпро', 'Дніпропетровська'], ['Івано-Франківськ', 'Івано-Франківська']];
  const names = [['Олег', 'Марія'], ['Андрій', 'Софія'], ['Тарас', 'Оля'], ['Ігор', 'Катя'], ['Дмитро', 'Аня'], ['Максим', 'Юля'], ['Влад', 'Настя']];
  const promos = [['p1', 'WELCOME', 'percent', 20], ['p2', 'BLOG-ANNA', 'fixed', 15000], ['p3', 'FREE100', 'percent', 100]];
  for (const [id, code, type, value] of promos) raw.prepare('INSERT OR IGNORE INTO promo_codes (id, code, type, value, active, label, created_at) VALUES (?,?,?,?,1,?,?)').run(id, code, type, value, code === 'BLOG-ANNA' ? 'Блогер Анна' : null, now);
  const ins = raw.prepare('INSERT INTO orders (id, created_at, status, amount_kop, list_kop, discount_kop, promo_code, promo_id, name_a, email_a, name_b, email_b, city, region, start_date, payer_email, invoice_id, paid_at, consent_at, refunded_at, refund_kop) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const cal = raw.prepare('INSERT INTO calendars (id, order_id, created_at, city, region, start_date, schedule_json) VALUES (?,?,?,?,?,?,?)');
  const mem = raw.prepare('INSERT INTO members (id, calendar_id, email, slot, suggested_name, survey_json) VALUES (?,?,?,?,?,?)');
  const prog = raw.prepare('INSERT INTO progress (member_id, day, opened, done_gift, done_intim, done_act) VALUES (?,?,?,?,?,?)');
  const list = 89900;
  for (let i = 0; i < 46; i++) {
    const created = now - Math.floor(rnd() * 29 * DAY) - 1000 * 60 * 60 * 2, c = cities[Math.floor(rnd() * cities.length)], n = names[Math.floor(rnd() * names.length)];
    const pr = rnd() < 0.3 ? promos[Math.floor(rnd() * 3)] : null;
    const disc = pr ? (pr[2] === 'percent' ? Math.round(list * pr[3] / 100) : Math.min(list, pr[3])) : 0, final = list - disc;
    const paid = rnd() < 0.72 ? created + 60000 : null, refunded = paid && rnd() < 0.08;
    const id = 'ord' + String(i).padStart(3, '0');
    const start = new Date(created + 2 * DAY).toISOString().slice(0, 10);
    ins.run(id, created, paid ? 'paid' : 'pending', final, list, disc, pr ? pr[1] : null, pr ? pr[0] : null, n[0], `u${i}a@mail.com`, n[1], `u${i}b@mail.com`, c[0], c[1], start, `u${i}a@mail.com`, 'inv' + i, paid, created, refunded ? paid + DAY : null, refunded ? final : null);
    if (paid) {
      const ready = rnd() < 0.8; cal.run('cal' + i, id, paid, c[0], c[1], start, ready ? '{"seed":1,"days":{}}' : null);
      for (const s of [0, 1]) { mem.run(`m${i}_${s}`, 'cal' + i, `u${i}${s ? 'b' : 'a'}@mail.com`, s, n[s], ready ? '{"name":"x"}' : (s ? null : '{"name":"x"}'));
        if (ready) { const opened = Math.floor(rnd() * 20); for (let d = 1; d <= opened; d++) prog.run(`m${i}_${s}`, d, 1, rnd() < .7 ? 1 : 0, rnd() < .6 ? 1 : 0, rnd() < .5 ? 1 : 0); } }
    }
  }
  const th = raw.prepare('INSERT INTO threads (email, name, status, last_at, last_subject, unread) VALUES (?,?,?,?,?,?)');
  const ms = raw.prepare('INSERT INTO messages (id, thread_email, direction, from_email, from_name, to_email, subject, body_text, created_at, msg_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
  th.run('u1a@mail.com', 'Марія', 'open', now - 3600e3, 'Не прийшов лист із доступом', 1);
  ms.run('mm1', 'u1a@mail.com', 'in', 'u1a@mail.com', 'Марія', 'support', 'Не прийшов лист із доступом', 'Добрий день! Оплатила календар, але лист із доступом не прийшов. Перевірила «Спам» теж.', now - 3600e3, '<a@m>');
  th.run('u3b@mail.com', 'Оля', 'open', now - 20 * 3600e3, 'Можна змінити дату старту?', 0);
  ms.run('mm2', 'u3b@mail.com', 'in', 'u3b@mail.com', 'Оля', 'support', 'Можна змінити дату старту?', 'Хочемо почати з 1 грудня, а не з завтра.', now - 22 * 3600e3, '<b@m>');
  ms.run('mm3', 'u3b@mail.com', 'out', 'support@reeadvent.fun', 'admin@test.com', 'u3b@mail.com', 'Re: Можна змінити дату старту?', 'Так, змінили на 1 грудня. Гарного адвенту!', now - 20 * 3600e3, null);
}
