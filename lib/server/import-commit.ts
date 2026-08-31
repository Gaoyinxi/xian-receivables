import { getRawDb } from '@/db/index';
import type { DemoSession, ImportKind } from '@/lib/types';
import { BusinessError } from './api';
import { currentBusinessDate } from './data';
import type { ValidatedImport } from './imports';
import {
  mutationMarker,
  refreshFinancialStatements,
  refreshProjectStatement,
} from './mutations';

// Bind normalized JSON instead of one parameter per field: D1 allows 100 variables.
// The valid-row set commits atomically, independently of excluded preview errors.
export async function commitValidatedImport(
  input: {
    batchId: string;
    kind: ImportKind;
    fileName: string;
  },
  validation: ValidatedImport,
  session: DemoSession,
) {
  if (!validation.validRows.length)
    throw new BusinessError(
      'IMPORT_NO_VALID_ROWS',
      '没有可提交的有效行，请修正错误后重新预览',
    );
  const rows = validation.validRows.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    auditId: crypto.randomUUID(),
  }));
  const json = JSON.stringify(rows);
  if (new TextEncoder().encode(json).length > 1_500_000) {
    throw new BusinessError(
      'IMPORT_TOO_LARGE',
      '导入内容过大，请拆分文件后重试',
      413,
    );
  }
  const db = getRawDb();
  const token = crypto.randomUUID();
  const marker = mutationMarker('audit_logs', token);
  const now = new Date().toISOString();
  const summary = JSON.stringify({
    kind: input.kind,
    committedRows: rows.length,
    invalidRows: validation.rowErrors.length,
  });

  const eligible =
    input.kind === 'PROJECT'
      ? `?9 = 'CITY_ADMIN'
    AND NOT EXISTS (SELECT 1 FROM json_each(?1) j WHERE
      NOT EXISTS (SELECT 1 FROM districts d WHERE d.id = json_extract(j.value, '$.districtId'))
      OR EXISTS (SELECT 1 FROM projects p WHERE p.contract_code = json_extract(j.value, '$.contractCode')))`
      : input.kind === 'RECEIVABLE'
        ? `?9 IN ('CITY_ADMIN', 'DISTRICT_ADMIN')
    AND NOT EXISTS (SELECT 1 FROM json_each(?1) j WHERE
      NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = json_extract(j.value, '$.projectId')
        AND (?9 = 'CITY_ADMIN' OR p.district_id = ?4)
        AND json_extract(j.value, '$.dueDate') >= p.contract_date)
      OR EXISTS (SELECT 1 FROM receivables r WHERE r.project_id = json_extract(j.value, '$.projectId')
        AND r.sequence_no = json_extract(j.value, '$.sequenceNo')))`
        : `?9 IN ('CITY_ADMIN', 'DISTRICT_ADMIN', 'DISTRICT_OPERATOR')
    AND NOT EXISTS (SELECT 1 FROM json_each(?1) j WHERE NOT EXISTS (
      SELECT 1 FROM receivables r JOIN projects p ON p.id = r.project_id
      WHERE r.id = json_extract(j.value, '$.receivableId') AND r.confirmation_status = 'CONFIRMED'
        AND (?9 = 'CITY_ADMIN' OR p.district_id = ?4)))
    AND NOT EXISTS (SELECT 1 FROM json_each(?1) j JOIN receipts rr
      ON rr.receivable_id = json_extract(j.value, '$.receivableId') AND rr.status = 'VALID'
      AND rr.amount_cents = json_extract(j.value, '$.amountCents')
      AND rr.received_date = json_extract(j.value, '$.receivedDate')
      AND COALESCE(rr.note, '') = COALESCE(json_extract(j.value, '$.note'), ''))
    AND NOT EXISTS (SELECT 1 FROM json_each(?1) j
      GROUP BY json_extract(j.value, '$.receivableId')
      HAVING SUM(json_extract(j.value, '$.amountCents')) > (
        SELECT r.amount_cents - COALESCE((SELECT SUM(rr.amount_cents) FROM receipts rr
          WHERE rr.receivable_id = r.id AND rr.status = 'VALID'), 0)
        FROM receivables r WHERE r.id = json_extract(j.value, '$.receivableId')))`;

  // The claim is also the final audit. A failed statement rolls it back with all
  // business writes; no durable PROCESSING state or retry loop is necessary.
  const claim = db
    .prepare(`INSERT INTO audit_logs (
      id, district_id, entity_type, entity_id, action, old_value, new_value,
      source, actor_role, actor_name, created_at
    ) SELECT ?7, ?4, 'IMPORT_BATCH', b.id, 'COMMIT', 'PREVIEWED', ?11,
      'EXCEL_IMPORT', ?9, ?10, ?8 FROM import_batches b
    WHERE b.id = ?2 AND b.created_by = ?3 AND b.district_id IS ?4
      AND b.kind = ?5 AND b.file_name = ?6 AND b.status = 'PREVIEWED' AND (${eligible})`)
    .bind(
      json,
      input.batchId,
      session.id,
      session.districtId,
      input.kind,
      input.fileName,
      token,
      now,
      session.role,
      session.displayName,
      summary,
    );

  const table =
    input.kind === 'PROJECT'
      ? 'projects'
      : input.kind === 'RECEIVABLE'
        ? 'receivables'
        : 'receipts';
  const prefix =
    input.kind === 'PROJECT'
      ? `XM-${currentBusinessDate().slice(0, 4)}-`
      : `YS-${currentBusinessDate().replaceAll('-', '').slice(0, 6)}-`;
  const val = (key: string) => `json_extract(j.value, '$.${key}')`;
  const codeColumn =
    input.kind === 'PROJECT' ? 'project_code' : 'receivable_code';
  const coded = input.kind !== 'RECEIPT';
  const fields =
    input.kind === 'PROJECT'
      ? [
          ['id', 'id'],
          ['name', 'name'],
          ['contract_code', 'contractCode'],
          ['tags', 'tags'],
          ['district_id', 'districtId'],
          ['org_level4', 'orgLevel4'],
          ['customer_name', 'customerName'],
          ['customer_type', 'customerType'],
          ['customer_contact', 'customerContact'],
          ['delivery_owner', 'deliveryOwner'],
          ['account_manager', 'accountManager'],
          ['delivery_manager', 'deliveryManager'],
          ['status', 'status'],
          ['contract_date', 'contractDate'],
          ['contract_amount_cents', 'contractAmountCents'],
          ['amount_composition', 'amountComposition'],
          ['billing_code', 'billingCode'],
        ]
      : input.kind === 'RECEIVABLE'
        ? [
            ['id', 'id'],
            ['project_id', 'projectId'],
            ['sequence_no', 'sequenceNo'],
            ['payment_type', 'paymentType'],
            ['amount_cents', 'amountCents'],
            ['payment_condition', 'paymentCondition'],
            ['baseline_event', 'baselineEvent'],
            ['baseline_date', 'baselineDate'],
            ['term_days', 'termDays'],
            ['due_date', 'dueDate'],
          ]
        : [
            ['id', 'id'],
            ['receivable_id', 'receivableId'],
            ['amount_cents', 'amountCents'],
            ['received_date', 'receivedDate'],
            ['note', 'note'],
          ];
  const columns = [
    ...fields.map(([column]) => column),
    'created_by',
    'created_at',
  ];
  const values = [...fields.map(([, key]) => val(key)), '?2', '?3'];
  if (coded) {
    columns.push(codeColumn, 'updated_at');
    values.push(
      `?4 || printf('%04d', base.last + ROW_NUMBER() OVER (ORDER BY CAST(j.key AS INTEGER)))`,
      '?3',
    );
  } else {
    columns.push('created_by_name');
    values.push('?6');
  }
  const insert = db
    .prepare(`${
      coded
        ? `WITH base AS MATERIALIZED (
    SELECT COALESCE(MAX(CAST(SUBSTR(${codeColumn}, LENGTH(?4) + 1) AS INTEGER)), 0) AS last
    FROM ${table} WHERE ${codeColumn} LIKE ?4 || '%')`
        : ''
    }
    INSERT INTO ${table} (${columns.join(', ')})
    SELECT ${values.join(', ')} FROM json_each(?1) j ${coded ? 'CROSS JOIN base' : ''}
    WHERE EXISTS (SELECT 1 FROM audit_logs WHERE id = ?5)`)
    .bind(
      ...(coded
        ? [json, session.id, now, prefix, token]
        : [json, session.id, now, prefix, token, session.displayName]),
    );
  const audits = db
    .prepare(`INSERT INTO audit_logs (
    id, district_id, entity_type, entity_id, action, new_value, source, actor_role, actor_name, created_at
  ) SELECT json_extract(j.value, '$.auditId'), json_extract(j.value, '$.districtId'), ?,
    json_extract(j.value, '$.id'), 'CREATE', json_remove(j.value, '$.auditId'), 'EXCEL_IMPORT', ?, ?, ?
    FROM json_each(?) j WHERE ${marker.sql}`)
    .bind(
      input.kind,
      session.role,
      session.displayName,
      now,
      json,
      ...marker.bindings,
    );
  const projectIds = [
    ...new Set(validation.validRows.map((row) => String(row.projectId))),
  ];
  const refresh =
    input.kind === 'RECEIPT'
      ? refreshFinancialStatements(
          [
            ...new Set(
              validation.validRows.map((row) => String(row.receivableId)),
            ),
          ],
          projectIds,
          marker,
        )
      : input.kind === 'RECEIVABLE'
        ? [refreshProjectStatement(projectIds, marker)]
        : [];
  const finalize = db
    .prepare(`UPDATE import_batches SET valid_rows = ?, invalid_rows = ?,
    committed_rows = ?, status = 'COMMITTED', committed_at = ? WHERE id = ? AND ${marker.sql}`)
    .bind(
      rows.length,
      validation.rowErrors.length,
      rows.length,
      now,
      input.batchId,
      ...marker.bindings,
    );
  const [result] = await db.batch([
    claim,
    insert,
    audits,
    ...refresh,
    finalize,
  ]);
  if (result.meta.changes !== 1)
    throw new BusinessError(
      'IMPORT_CONFLICT',
      '批次已提交或台账已变化，本次未写入数据。请刷新并重新预览',
      409,
    );
  return {
    batchId: input.batchId,
    committedRows: rows.length,
    rowErrors: validation.rowErrors,
  };
}
