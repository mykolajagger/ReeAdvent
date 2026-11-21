// Версія наповнення бази закладів: 4 (повтори з паузою, ліміт 2 міста одночасно). Зміна цього рядка перезбирає Worker після правок у ../../src.
import PostalMime from 'postal-mime';
import { saveInbound } from './ingest.js';
import { runVenuesLogged } from '../../../src/venues.js';

const MAX_BYTES = 5 * 1024 * 1024;

export default {
  // Щогодини (Cron Trigger): нагадування о 09:01 за часом календаря та очищення застарілих даних виконує основний сайт
  async scheduled(event, env, ctx) {
    // "*/2 * * * *" — наповнення бази закладів (VENUES_PER_RUN міст за запуск); "1 * * * *" — нагадування, курси, очищення
    if (event.cron !== '1 * * * *') {
      // Наповнення бази закладів іде тут, у Worker: запити до Overpass тривають довше за ліміт HTTP-запиту (100 с), а запуск за розкладом може працювати до 15 хв
      try { const out = await runVenuesLogged(env, { budgetMs: 100000 }); console.log('venues', JSON.stringify(out).slice(0, 600)); }
      catch (e) { console.error('venues failed', String(e && e.stack || e).slice(0, 600)); }
      return;
    }
    if (!env.CRON_SECRET || !env.BASE_URL) { console.error('CRON_SECRET/BASE_URL are not set'); return; }
    const job = 'daily';
    const res = await fetch(`${env.BASE_URL}/api/cron/${job}`, { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET, 'content-type': 'application/json' }, body: '{}' });
    console.log('cron/' + job, res.status, await res.text());
  },

  // Cloudflare Email Routing -> цей Worker. Лист зберігається в D1 і (за потреби) пересилається на резервну пошту.
  async email(message, env) {
    if (message.rawSize > MAX_BYTES) { message.setReject('Лист завеликий'); return; }
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);
    await saveInbound(env.DB, parsed, message.from);
    if (env.FORWARD_TO) { try { await message.forward(env.FORWARD_TO); } catch (e) { console.error('forward failed', e); } }
  }
};
