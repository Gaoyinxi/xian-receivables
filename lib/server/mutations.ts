import { getRawDb } from '@/db/index';
import type { Role } from '@/lib/types';

type Binding = string | number | null;
export interface SqlGuard {
  sql: string;
  bindings: Binding[];
}

// Only server-owned table names and freshly generated UUIDs may form mutation markers.
export function mutationMarker(
  table:
    | 'receipts'
    | 'collection_events'
    | 'receivables'
    | 'projects'
    | 'audit_logs',
  id: string,
): SqlGuard {
  return {
    sql: `EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`,
    bindings: [id],
  };
}

export interface AuditInput {
  districtId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  fieldName?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  source: string;
  actorRole: Role;
  actorName: string;
}

export function auditStatement(
  input: AuditInput,
  guard: SqlGuard = { sql: '1', bindings: [] },
) {
  const serialize = (value: unknown) =>
    value == null
      ? null
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return getRawDb()
    .prepare(`INSERT INTO audit_logs (
    id, district_id, entity_type, entity_id, action, field_name,
    old_value, new_value, reason, source, actor_role, actor_name, created_at
  ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
    .bind(
      crypto.randomUUID(),
      input.districtId,
      input.entityType,
      input.entityId,
      input.action,
      input.fieldName ?? null,
      serialize(input.oldValue),
      serialize(input.newValue),
      input.reason ?? null,
      input.source,
      input.actorRole,
      input.actorName,
      new Date().toISOString(),
      ...guard.bindings,
    );
}

export function refreshProjectStatement(projectIds: string[], guard: SqlGuard) {
  const now = new Date().toISOString();
  return getRawDb()
    .prepare(`UPDATE projects SET archived_at = CASE
    WHEN EXISTS (SELECT 1 FROM receivables WHERE project_id = projects.id)
      AND NOT EXISTS (SELECT 1 FROM receivables WHERE project_id = projects.id
        AND (writeoff_status != 'PAID' OR confirmation_status != 'CONFIRMED'))
    THEN COALESCE(archived_at, ?) ELSE NULL END, updated_at = ?
    WHERE id IN (SELECT value FROM json_each(?)) AND ${guard.sql}`)
    .bind(now, now, JSON.stringify(projectIds), ...guard.bindings);
}

// These statements must be in the SAME D1 batch as the successful mutation.
export function refreshFinancialStatements(
  receivableIds: string[],
  projectIds: string[],
  guard: SqlGuard,
) {
  return [
    getRawDb()
      .prepare(`UPDATE receivables SET writeoff_status = CASE
    WHEN (SELECT COALESCE(SUM(amount_cents), 0) FROM receipts
      WHERE receivable_id = receivables.id AND status = 'VALID') >= amount_cents THEN 'PAID'
    WHEN EXISTS (SELECT 1 FROM receipts WHERE receivable_id = receivables.id AND status = 'VALID') THEN 'PARTIAL'
    ELSE 'UNPAID' END, updated_at = ?
    WHERE id IN (SELECT value FROM json_each(?)) AND ${guard.sql}`)
      .bind(
        new Date().toISOString(),
        JSON.stringify(receivableIds),
        ...guard.bindings,
      ),
    refreshProjectStatement(projectIds, guard),
  ];
}

export function codeAllocation(
  table: 'projects' | 'receivables',
  prefix: string,
) {
  const column = table === 'projects' ? 'project_code' : 'receivable_code';
  return {
    sql: `(SELECT ? || printf('%04d', COALESCE(MAX(CAST(SUBSTR(${column}, ?) AS INTEGER)), 0) + 1)
      FROM ${table} WHERE ${column} LIKE ?)`,
    bindings: [prefix, prefix.length + 1, `${prefix}%`] as Binding[],
  };
}
