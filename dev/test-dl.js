// Завантаження архівів з R2: лише dl/<ім'я>.zip, інші шляхи — 404
import assert from 'node:assert/strict';
import { serveDownload, handle } from '../src/api.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { makeDb } from './d1.js';
const store = new Map([['dl/reeadvent-content-abc123.zip', new Uint8Array([80, 75, 3, 4, 1, 2])], ['ans/secret', new Uint8Array([1])]]);
const MEDIA = { get: async k => store.has(k) ? { body: store.get(k), size: store.get(k).length } : null, head: async k => store.has(k) ? { size: store.get(k).length } : null };
const env = { DB: makeDb(path.join(path.dirname(fileURLToPath(import.meta.url)), '..')), MEDIA };
let r = await handle(new Request('https://x/api/dl/reeadvent-content-abc123.zip'), env);
assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/zip'); assert.match(r.headers.get('content-disposition'), /attachment/); assert.equal((await r.arrayBuffer()).byteLength, 6);
r = await handle(new Request('https://x/api/dl/missing-file-000.zip'), env); assert.equal(r.status, 404);
r = await handle(new Request('https://x/api/dl/..%2Fans%2Fsecret.zip'), env); assert.notEqual(r.status, 200);
r = await handle(new Request('https://x/api/dl/secret'), env); assert.notEqual(r.status, 200);
assert.equal((await serveDownload({}, 'reeadvent-content-abc123.zip')).status, 404, 'без R2 — 404');
console.log('OK dl');
