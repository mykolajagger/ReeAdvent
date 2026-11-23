// Розумне місце в календарі публікацій для нової (погодженої) публікації.
// Дивиться: вільні дні (у стрічці не більше одного поста на день, сторіс до двох), повтори формату й сцени поруч,
// актуальність теми (Миколай, Святвечір, старт календарів, «вікно №7»…) і свіжість (раніше краще). Пояснює свій вибір.
import { SLOTS, isStory, getPlan, savePlan, effective, pubState, getFbPage, isComplete } from './igpublish.js';

const DAY = 864e5, TZ = 2 * 36e5;                       // Київ узимку UTC+2: дні рахуємо за київським часом
const kday = t => Math.floor((t + TZ) / DAY);
const kdate = (y, m, d) => Date.UTC(y, m - 1, d) - TZ;  // північ за Києвом
const fmtDay = t => { const d = new Date(t + TZ); return `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const KIND = { IMAGE: 'пост', CAROUSEL: 'карусель', REELS: 'Reel', STORY: 'сторіс', STORY_VIDEO: 'сторіс' };

/** Теми з датами: вікно, коли тема найдоречніша (ideal), і межа, після якої вона вже не актуальна (end). */
export function topicsOf(text, launchMs, year) {
  const s = String(text || '').replace(/#\S+/g, ' ').toLowerCase(), out = [];
  const add = (name, from, to, end) => out.push({ name, from, to, end });
  const L = launchMs;
  if (/чорн\S* п.ятниц|black friday/.test(s)) add('чорна п’ятниця', kdate(year, 11, 25), kdate(year, 11, 28), kdate(year, 12, 1));
  if (/(встигн|останн\S* (день|дні|шанс|тиждень)|last chance|ще можна)/.test(s)) add('останні дні перед стартом', L - 3 * DAY, L, L + 2 * DAY);
  if (/(1 грудня|перше вікно|старт календар|стартує|december 1|first window)/.test(s)) add('старт календарів', L - 4 * DAY, L, L + DAY);
  if (/(микола|nicholas)/.test(s)) add('день святого Миколая', kdate(year, 12, 3), kdate(year, 12, 6), kdate(year, 12, 7));
  if (/(святвеч|різдв|christmas)/.test(s)) add('Різдво', kdate(year, 12, 19), kdate(year, 12, 25), kdate(year, 12, 26));
  if (/(новий рік|новоріч|new year)/.test(s) && !/подарун|gift/.test(s)) add('Новий рік', kdate(year, 12, 27), kdate(year, 12, 31), kdate(year + 1, 1, 2));
  if (/(валентин|valentine|день закоханих)/.test(s)) add('День закоханих', kdate(year + 1, 2, 10), kdate(year + 1, 2, 14), kdate(year + 1, 2, 15));
  const w = s.match(/(?:вікно|вікна|window|день|day)\s*(?:№|#|no\.?)?\s*(\d{1,2})\b/);
  if (w && +w[1] >= 1 && +w[1] <= 24) { const d = L + (+w[1] - 1) * DAY; add(`вікно №${+w[1]}`, d - DAY, d + DAY, d + 4 * DAY); }
  return out;
}

/**
 * entry: { id, type, scene, text }, eff: effective() плану, doneAt: { id: час публікації } (уже вийшли).
 * mode: 'best' (найкорисніше місце) або 'free' (найближчий вільний день). prefHour: бажана година UTC (від агента).
 * Повертає { at, reasons: [..], warn } або null, якщо місця немає.
 */
export function pickSlot({ entry, eff, doneAt = {}, now = Date.now(), launch, mode = 'best', prefHour = null, horizon = 35, lead = 2 * 36e5 }) {
  const story = isStory(entry), year = new Date(now + TZ).getUTCFullYear() - (new Date(now + TZ).getUTCMonth() < 6 ? 1 : 0);
  const others = eff.filter(p => p.id !== entry.id && isStory(p) === story).map(p => ({ ...p, t: p.at || doneAt[p.id] || null })).filter(p => p.t);
  const hours = story ? SLOTS.story : (Number.isInteger(prefHour) && prefHour >= 6 && prefHour <= 20 ? [[prefHour, 0]] : SLOTS.post);
  const topics = topicsOf(entry.text, launch, year), first = kday(now + lead), cands = [];
  for (let d = first; d < first + horizon; d++) {
    const sameDay = others.filter(p => kday(p.t) === d);
    if (!story && sameDay.length) continue;                        // у стрічці один пост на день
    if (story && sameDay.length >= 2) continue;                    // сторіс до двох на день
    for (const [h, m] of hours) {
      const at = d * DAY + (h * 60 + m) * 6e4;                      // година в UTC (як у SLOTS) у київський день d (для годин до 22 UTC)
      if (at < now + lead || others.some(p => Math.abs(p.t - at) < 3 * 36e5)) continue;
      cands.push(at);
    }
  }
  if (!cands.length) return null;
  if (mode === 'free') return { at: cands[0], reasons: [`найближчий вільний день (${fmtDay(cands[0])})`], warn: null };
  const score = at => {
    const why = []; let sc = -(topics.length ? 0.15 : 0.5) * (kday(at) - first);   // тематичний пост може почекати свого тижня
    const before = others.filter(p => p.t < at).sort((a, b) => b.t - a.t)[0], after = others.filter(p => p.t > at).sort((a, b) => a.t - b.t)[0];
    let sameNb = 0, sceneNb = 0, adjSame = false;
    for (const nb of [before, after]) {                              // сусід поруч важить більше, ніж через день
      const gap = nb ? Math.abs(nb.t - at) / DAY : 99, w = gap <= 1.5 ? 1 : gap <= 2.5 ? 0.4 : 0;
      if (!w) continue;
      if (!story && nb.type === entry.type) { sc -= 2 * w; sameNb++; if (w === 1) adjSame = true; } else if (!story && w === 1) sc += 0.4;
      if (entry.scene && nb.scene === entry.scene) { sc -= 1.2 * w; sceneNb++; }
    }
    if (!story) { if (!sameNb) why.push(`поруч немає іншого ${KIND[entry.type] === 'Reel' ? 'Reel' : KIND[entry.type] === 'карусель' ? 'каруселі' : 'поста того ж формату'}`); }
    if (entry.scene && !sceneNb) why.push('без повтору сцени поспіль');
    const wd = new Date(at + TZ).getUTCDay();
    if (entry.type === 'REELS' && (wd === 5 || wd === 6 || wd === 0)) { sc += 0.4; why.push('Reel на вихідних'); }
    if (entry.type === 'CAROUSEL' && wd >= 1 && wd <= 4) sc += 0.2;
    let warn = null;
    for (const tp of topics) {
      if (at >= tp.from && at <= tp.to + DAY - 1) { sc += 5; why.unshift(`якраз до теми «${tp.name}»`); }
      else if (at < tp.from) { sc += Math.max(0, 2 - (tp.from - at) / DAY * 0.4); }
      else if (at > tp.end) { sc -= 30; warn = `тема «${tp.name}» буде вже неактуальна`; }
      else sc += 0.5;
    }
    return { sc, why, warn, adjSame, topical: why.some(x => /якраз до теми/.test(x)) };
  };
  let best = null;
  for (const at of cands) { const s = score(at); if (!best || s.sc > best.sc + 1e-9) best = { at, ...s }; }
  const skipFmt = best.at !== cands[0] && !best.topical && score(cands[0]).adjSame;
  const reasons = [`${fmtDay(best.at)}`, ...best.why.filter(x => !(skipFmt && /^поруч немає/.test(x))).slice(0, 3)];
  if (best.at === cands[0]) reasons.push('найближчий вільний день');
  else { const f = score(cands[0]); reasons.push(best.topical ? `не ${fmtDay(cands[0])}, а ближче до теми` : f.adjSame ? `${fmtDay(cands[0])} пропущено: там поспіль вийшли б два ${entry.type === 'REELS' ? 'Reels' : entry.type === 'CAROUSEL' ? 'каруселі' : 'пости одного формату'}` : `${fmtDay(cands[0])} пропущено: там повторилася б сцена`); }
  return { at: best.at, reasons, warn: best.warn };
}

/** Календар публікацій: переставляє наявний неопублікований пост на найкраще (або найближче вільне) місце. */
export async function bestPlace(env, id, mode, man, now = Date.now()) {
  const plan = await getPlan(env), eff = effective(man, plan), st = await pubState(env), hasFb = !!(await getFbPage(env)), p = eff.find(x => x.id === id);
  if (!p) return { ok: false, error: 'Публікацію не знайдено' };
  if (isComplete(st, p, hasFb)) return { ok: false, error: 'Вже опубліковано' };
  const doneAt = {}; for (const [k, x] of Object.entries(st.done || {})) if (x && x.at) doneAt[k] = x.at;
  const g = await env.DB.prepare("SELECT value FROM settings WHERE key = 'launch_date'").first(), launch = Date.parse(((g && g.value) || '2026-12-01') + 'T00:00:00+02:00');
  const res = pickSlot({ entry: { id, type: p.type, scene: p.scene || null, text: [p.title, p.caption].join(' \n ') }, eff, doneAt, now, launch, mode });
  if (!res) return { ok: false, error: 'Вільних днів на 5 тижнів наперед немає' };
  (plan.posts[id] = plan.posts[id] || {}).at = res.at; await savePlan(env, plan);
  return { ok: true, placed: res };
}
