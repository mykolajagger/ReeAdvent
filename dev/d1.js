// Мінімальний адаптер node:sqlite під інтерфейс Cloudflare D1 (лише для тестів/розробки).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
export function makeDb(root) {
  const db = new DatabaseSync(':memory:');
  const dir = path.join(root, 'migrations');
  for (const f of fs.readdirSync(dir).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _run: () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return { prepare: sql => stmt(sql), batch: async list => list.map(s => s._run()), _raw: db };
}
