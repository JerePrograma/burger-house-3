import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path) {
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  const wrap = (sql, parameters = []) => ({
    bind(...values) { return wrap(sql, values); },
    async first(column) {
      const row = database.prepare(sql).get(...parameters);
      return row ? (column ? row[column] : row) : null;
    },
    async all() { return { results: database.prepare(sql).all(...parameters), success: true }; },
    async run() {
      const result = database.prepare(sql).run(...parameters);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    },
  });
  return { prepare: wrap, exec(sql) { database.exec(sql); }, raw: database };
}
