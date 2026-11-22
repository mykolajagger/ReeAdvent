import assert from 'node:assert/strict';
import { statesFor, childExtracts, planStates, US_BOX } from '../src/usstates.js';
assert.deepEqual(statesFor(34.05, -118.24), ['CA']);                                   // Лос-Анджелес
assert(statesFor(39.10, -94.58).includes('MO') && statesFor(39.10, -94.58).includes('KS'));   // Канзас-Сіті: обидва штати
assert(statesFor(40.71, -74.0).includes('NY') && statesFor(40.71, -74.0).includes('NJ'));     // Нью-Йорк
assert(statesFor(21.3, -157.86).includes('HI')); assert(statesFor(61.2, -149.9).includes('AK'));
assert(statesFor(36.0, -119.0).includes('CA'));   // прямокутні рамки: сусід може додатися, це лише зайва вигрузка
assert.equal(statesFor(10, -140).length, 1);                                           // поза рамками: найближчий
assert.equal(Object.keys(US_BOX).length, 52);
const idx = { features: [{ properties: { id: 'us', parent: 'north-america', 'iso3166-1:alpha2': ['US'], urls: { pbf: 'u' } } }, { properties: { id: 'california', parent: 'us', 'iso3166-2': ['US-CA'], urls: { pbf: 'https://download.geofabrik.de/north-america/us/california-latest.osm.pbf' } } }, { properties: { id: 'norcal', parent: 'california', 'iso3166-2': ['US-CA'], urls: { pbf: 'x' } } }, { properties: { id: 'kansas', parent: 'us', 'iso3166-2': ['US-KS'], urls: { pbf: 'k' } } }] };
const ex = childExtracts(idx, 'us', 'US'); assert.deepEqual(Object.keys(ex).sort(), ['CA', 'KS']); assert.equal(ex.CA.id, 'california');
const cities = [{ id: 1, lat: 34.05, lon: -118.24 }, { id: 2, lat: 39.1, lon: -94.58 }, { id: 3, lat: 37.77, lon: -122.4 }];
const p = planStates(cities, ex); assert.equal(p.order[0], 'CA'); assert.deepEqual([...p.waiting.get(2)], ['KS']); assert.equal(p.byState.get('CA').length, 2);
console.log('OK usstates');
