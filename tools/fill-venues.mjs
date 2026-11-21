// Наповнення бази закладів із GitHub Actions: Overpass відповідає з серверів GitHub, а запис іде в D1 через REST API Cloudflare.
// Змінні: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID; необов'язково BUDGET_MIN (скільки хвилин працювати, типово 12).
import { makeRestDb } from './d1-rest.mjs';
import { runVenuesLogged } from '../src/venues.js';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId, D1_DATABASE_ID: databaseId } = process.env;
if (!token || !accountId || !databaseId) { console.error('Потрібні CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID'); process.exit(1); }
const env = { DB: makeRestDb({ accountId, databaseId, token }), VENUES_PER_RUN: '10' };
const end = Date.now() + (Number(process.env.BUDGET_MIN) || 12) * 60e3;
let cities = 0, rounds = 0;
while (Date.now() < end) {
  const left = end - Date.now();
  const out = await runVenuesLogged(env, { budgetMs: Math.max(30000, Math.min(240000, left)) });
  rounds++; console.log(new Date().toISOString(), JSON.stringify(out).slice(0, 400));
  if (out.paused || out.idle) break;
  cities += out.cities ? out.cities.length : 1;
}
console.log(`done: rounds=${rounds}, cities=${cities}`);
