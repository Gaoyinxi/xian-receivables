/** The deliberately small D1-compatible contract consumed by business SQL. */
export interface SqlResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number };
}

export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
  run<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch<T = Record<string, unknown>>(
    statements: SqlStatement[],
  ): Promise<SqlResult<T>[]>;
}
