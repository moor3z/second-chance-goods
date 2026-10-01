/**
 * Minimal Cloudflare D1 stand-in backed by Node's built-in SQLite, for tests only.
 * Implements the subset of the D1 API used by this project.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

class Stmt {
  args: unknown[] = [];
  constructor(private db: FakeD1, readonly sql: string) {}
  bind(...args: unknown[]) {
    const s = new Stmt(this.db, this.sql);
    s.args = args.map((a) => (typeof a === 'boolean' ? (a ? 1 : 0) : a === undefined ? null : a));
    return s;
  }
  private exec() {
    if (this.db.failOn && this.db.failOn(this.sql)) throw new Error('Injected D1 failure');
    return this.db.raw.prepare(this.sql);
  }
  async first<T>() {
    return (this.exec().get(...(this.args as never[])) as T) ?? null;
  }
  async all<T>() {
    return { results: this.exec().all(...(this.args as never[])) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.exec().run(...(this.args as never[]));
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
  _sync() {
    const st = this.exec();
    return /^\s*(select|with)/i.test(this.sql)
      ? { results: st.all(...(this.args as never[])), success: true, meta: {} }
      : { results: [], success: true, meta: { changes: Number(st.run(...(this.args as never[])).changes) } };
  }
}

export class FakeD1 {
  raw = new DatabaseSync(':memory:');
  failOn: ((sql: string) => boolean) | null = null;
  constructor(schemaFile = 'migrations/0001_init.sql') {
    this.raw.exec(readFileSync(schemaFile, 'utf8'));
  }
  prepare(sql: string) {
    return new Stmt(this, sql);
  }
  async batch(stmts: Stmt[]) {
    this.raw.exec('BEGIN');
    try {
      const out = stmts.map((s) => s._sync());
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }
}
