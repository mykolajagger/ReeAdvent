// Розумне місце в календарі публікацій: вільні дні, повтори формату/сцени, актуальність теми.
import assert from 'node:assert/strict';
import { pickSlot, topicsOf } from '../src/placement.js';
const K = (m, d, h = 0) => Date.UTC(2026, m - 1, d, h) - 2 * 36e5;           // київський час
const launch = K(12, 1), now = K(11, 23, 10), kd = t => new Date(t + 2 * 36e5).toISOString().slice(0, 10);
const feed = [{ id: 'a', type: 'REELS', at: K(11, 24, 18), scene: 'tree' }, { id: 'b', type: 'IMAGE', at: K(11, 25, 18), scene: 'pasta' }, { id: 'c', type: 'CAROUSEL', at: K(11, 27, 18), scene: 'book' }];
const reel = { id: 'n', type: 'REELS', scene: 'stars', text: 'Як минає вечір удвох' };
const free = pickSlot({ entry: reel, eff: feed, now, launch, mode: 'free' });
assert.equal(kd(free.at), '2026-11-23', 'найближчий вільний: сьогодні');
const best = pickSlot({ entry: reel, eff: feed, now, launch, mode: 'best' });
assert.equal(kd(best.at), '2026-11-26', 'найкраще: не поруч з іншим Reel');
assert.ok(!feed.some(p => kd(p.at) === kd(best.at)), 'не на зайнятий день');
console.log('• Reel:', kd(best.at), best.reasons.join('; '));
const nik = pickSlot({ entry: { id: 'm', type: 'IMAGE', scene: 'wrap', text: 'Що подарувати на Миколая #подарунокнаНовийрік' }, eff: feed, now, launch });
assert.ok(['2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'].includes(kd(nik.at)), 'Миколай: 3–6 грудня, а не ' + kd(nik.at));
assert.match(nik.reasons.join(' '), /Миколая/); console.log('• Миколай:', kd(nik.at), nik.reasons.join('; '));
const w7 = pickSlot({ entry: { id: 'w', type: 'REELS', scene: 'tree', text: 'Відкриваємо вікно №7 разом' }, eff: feed, now, launch });
assert.ok(['2026-12-06', '2026-12-07', '2026-12-08'].includes(kd(w7.at)), 'вікно №7 біля 7 грудня, а не ' + kd(w7.at));
const late = pickSlot({ entry: { id: 'l', type: 'IMAGE', text: 'Подарунок на Миколая' }, eff: [], now: K(12, 10, 9), launch });
assert.ok(late.warn && /неактуальн/.test(late.warn), 'попередження про неактуальність');
const st = [{ id: 's1', type: 'STORY', at: K(11, 24, 10) }, { id: 's2', type: 'STORY', at: K(11, 24, 20) }];
const story = pickSlot({ entry: { id: 's', type: 'STORY', text: 'Хто частіше планує вечір?' }, eff: st, now: K(11, 23, 21), launch, mode: 'free' });
assert.notEqual(kd(story.at), '2026-11-24', 'не більше двох сторіс на день');
assert.equal(topicsOf('#подарунокнаНовийрік Новий рік', launch, 2026).length, 1, 'хештеги не рахуються темою');
assert.equal(pickSlot({ entry: reel, eff: Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i, type: 'IMAGE', at: K(11, 23, 18) + i * 864e5 })), now, launch, horizon: 30 }), null, 'немає місця → null');
console.log('OK placement');
