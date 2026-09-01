import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { constants, mkdirSync, lstatSync, chmodSync } from 'node:fs';
import { access, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { dataDirectory } from '../../apps/api/src/config';
import type { SqlDatabase, SqlStatement, SqlResult } from '../ports';

class BoundStatement implements SqlStatement {
  constructor(
    readonly owner: NativeDatabase,
    readonly sql: string,
    readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): BoundStatement {
    if (
      !values.every(
        (value) =>
          value === null ||
          ['string', 'number', 'bigint'].includes(typeof value) ||
          value instanceof Uint8Array,
      )
    ) {
      throw new TypeError('不支持的 SQL 参数类型');
    }
    return new BoundStatement(this.owner, this.sql, values as SQLInputValue[]);
  }

  execute<T>(): SqlResult<T> {
    const statement = this.owner.connection.prepare(this.sql);
    if (statement.columns().length) {
      return {
        results: statement.all(...this.values) as T[],
        success: true,
        meta: { changes: 0, last_row_id: 0 },
      };
    }
    const result = statement.run(...this.values);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (
      (this.owner.connection.prepare(this.sql).get(...this.values) as
        | T
        | undefined) ?? null
    );
  }
  async all<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    return this.execute<T>();
  }
  async run<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    return this.execute<T>();
  }
}

export class NativeDatabase implements SqlDatabase {
  readonly connection: DatabaseSync;
  constructor(path: string) {
    this.connection = new DatabaseSync(path);
    this.connection.exec(
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;',
    );
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  prepare(sql: string) {
    return new BoundStatement(this, sql);
  }
  async batch<T = Record<string, unknown>>(
    statements: SqlStatement[],
  ): Promise<SqlResult<T>[]> {
    // No await/bookkeeping between statements: changes() and atomic financial guards are connection-local.
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof BoundStatement) || statement.owner !== this)
          throw new Error('跨数据库事务被拒绝');
        return statement.execute<T>();
      });
      this.connection.exec('COMMIT');
      return results;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.connection.close();
  }
}

export class LocalFiles {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (lstatSync(directory).isSymbolicLink())
      throw new Error('附件目录不支持符号链接');
  }
  pathForKey(key: string) {
    if (
      !key.startsWith('attachments/') ||
      key.length > 1000 ||
      key.includes('\\') ||
      key.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      throw new Error('无效附件存储键');
    }
    // Filenames never come from an HTTP path. Hashes make traversal and collisions impractical.
    return join(
      this.directory,
      `${createHash('sha256').update(key).digest('hex')}.blob`,
    );
  }
  async checkReady() {
    const info = lstatSync(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('附件目录不可用');
    }
    await access(this.directory, constants.R_OK | constants.W_OK);
  }
  async put(key: string, value: ArrayBuffer, _metadata?: unknown) {
    const path = this.pathForKey(key);
    const file = await open(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(new Uint8Array(value));
      await file.sync();
    } catch (error) {
      await file.close();
      await unlink(path);
      throw error;
    }
    await file.close();
  }
  async get(key: string) {
    let file;
    try {
      file = await open(
        this.pathForKey(key),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 10 * 1024 * 1024)
        throw new Error('附件存储异常');
      const bytes = await file.readFile();
      return { body: new Uint8Array(bytes), size: info.size };
    } finally {
      await file.close();
    }
  }
  async delete(key: string) {
    await unlink(this.pathForKey(key));
  }
}

let database: NativeDatabase | undefined;
let files: LocalFiles | undefined;
export const getRawDb = () =>
  (database ??= new NativeDatabase(
    join(dataDirectory(), 'receivables.sqlite'),
  ));
export const getFilesBucket = () =>
  (files ??= new LocalFiles(join(dataDirectory(), 'files')));
// Compile-time invariant. There is intentionally no environment switch enabling public demo data/auth.
export const isDemoSeedEnabled = () => false;
