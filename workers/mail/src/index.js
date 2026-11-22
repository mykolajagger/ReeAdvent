// Worker: щогодинний cron (нагадування, курси, очищення) і вхідна пошта. Наповнення бази закладів іде з GitHub Actions (.github/workflows/venues.yml).
import PostalMime from 'postal-mime';
import { saveInbound } from './ingest.js';

const MAX_BYTES = 5 * 1024 * 1024;

export default {
  // Щогодини (Cron Trigger): нагадування о 09:01 за часом календаря та очищення застарілих даних виконує основний сайт
  async scheduled(event, env, ctx) {
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
// rebuild: instagram publish 1795355883
// rebuild: instagram plan 1795356188
// rebuild: facebook 1795356554
// rebuild: ig id 1795357888
