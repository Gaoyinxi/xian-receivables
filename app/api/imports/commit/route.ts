import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import {
  appendAudit,
  generateProjectCode,
  generateReceivableCode,
  refreshReceivableAndProject,
} from '@/lib/server/data';
import { validateImportRows } from '@/lib/server/imports';
import { requireSession } from '@/lib/server/session';
import { importCommitSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = importCommitSchema.parse(await request.json());
    const batch = await getRawDb()
      .prepare(
        'SELECT id, kind, file_name AS fileName, status FROM import_batches WHERE id = ?',
      )
      .bind(input.batchId)
      .first<{ id: string; kind: string; fileName: string; status: string }>();
    if (!batch) {
      throw new BusinessError('IMPORT_BATCH_NOT_FOUND', '导入预览已失效', 404);
    }
    if (batch.status !== 'PREVIEWED') {
      throw new BusinessError('IMPORT_ALREADY_COMMITTED', '该批次已提交', 409);
    }
    if (batch.kind !== input.kind || batch.fileName !== input.fileName) {
      throw new BusinessError('IMPORT_BATCH_MISMATCH', '导入批次与文件不匹配');
    }

    const validation = await validateImportRows(
      input.kind,
      input.rows,
      session,
    );
    const db = getRawDb();
    const now = new Date().toISOString();
    let committedRows = 0;

    for (const row of validation.validRows) {
      if (input.kind === 'PROJECT') {
        const id = crypto.randomUUID();
        const projectCode = await generateProjectCode();
        await db
          .prepare(
            `INSERT INTO projects (
              id, project_code, name, contract_code, tags, district_id,
              org_level4, customer_name, customer_type, customer_contact,
              delivery_owner, account_manager, delivery_manager, status,
              contract_date, contract_amount_cents, amount_composition,
              billing_code, archived_at, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              NULL, ?, ?, ?)`,
          )
          .bind(
            id,
            projectCode,
            row.name,
            row.contractCode,
            JSON.stringify(row.tags),
            row.districtId,
            row.orgLevel4,
            row.customerName,
            row.customerType,
            row.customerContact,
            row.deliveryOwner,
            row.accountManager,
            row.deliveryManager,
            row.status,
            row.contractDate,
            row.contractAmountCents,
            row.amountComposition,
            row.billingCode,
            session.id,
            now,
            now,
          )
          .run();
        await appendAudit({
          districtId: String(row.districtId),
          entityType: 'PROJECT',
          entityId: id,
          action: 'CREATE',
          newValue: {
            projectCode,
            contractCode: row.contractCode,
            sourceRow: row.sourceRow,
          },
          source: 'EXCEL_IMPORT',
          actorRole: session.role,
          actorName: session.displayName,
        });
      } else if (input.kind === 'RECEIVABLE') {
        const id = crypto.randomUUID();
        const receivableCode = await generateReceivableCode();
        await db
          .prepare(
            `INSERT INTO receivables (
              id, receivable_code, project_id, sequence_no, payment_type,
              amount_cents, payment_condition, baseline_event, baseline_date,
              term_days, due_date, confirmation_status, writeoff_status,
              created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'UNPAID',
              ?, ?, ?)`,
          )
          .bind(
            id,
            receivableCode,
            row.projectId,
            row.sequenceNo,
            row.paymentType,
            row.amountCents,
            row.paymentCondition,
            row.baselineEvent,
            row.baselineDate,
            row.termDays,
            row.dueDate,
            session.id,
            now,
            now,
          )
          .run();
        await appendAudit({
          districtId: String(row.districtId),
          entityType: 'RECEIVABLE',
          entityId: id,
          action: 'CREATE',
          newValue: {
            receivableCode,
            projectCode: row.projectCode,
            sourceRow: row.sourceRow,
          },
          source: 'EXCEL_IMPORT',
          actorRole: session.role,
          actorName: session.displayName,
        });
      } else {
        const id = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO receipts (
              id, receivable_id, amount_cents, received_date, note, status,
              created_by, created_by_name, created_at
            ) VALUES (?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
          )
          .bind(
            id,
            row.receivableId,
            row.amountCents,
            row.receivedDate,
            row.note,
            session.id,
            session.displayName,
            now,
          )
          .run();
        await refreshReceivableAndProject(String(row.receivableId));
        await appendAudit({
          districtId: String(row.districtId),
          entityType: 'RECEIPT',
          entityId: id,
          action: 'CREATE',
          newValue: {
            receivableCode: row.receivableCode,
            amountCents: row.amountCents,
            sourceRow: row.sourceRow,
          },
          source: 'EXCEL_IMPORT',
          actorRole: session.role,
          actorName: session.displayName,
        });
      }
      committedRows += 1;
    }

    await db
      .prepare(
        `UPDATE import_batches SET valid_rows = ?, invalid_rows = ?,
          committed_rows = ?, status = 'COMMITTED', committed_at = ?
        WHERE id = ?`,
      )
      .bind(
        validation.validRows.length,
        validation.rowErrors.length,
        committedRows,
        now,
        batch.id,
      )
      .run();
    await appendAudit({
      districtId: session.districtId,
      entityType: 'IMPORT_BATCH',
      entityId: batch.id,
      action: 'COMMIT',
      newValue: {
        kind: input.kind,
        committedRows,
        invalidRows: validation.rowErrors.length,
      },
      source: 'EXCEL_IMPORT',
      actorRole: session.role,
      actorName: session.displayName,
    });
    return ok({
      batchId: batch.id,
      committedRows,
      rowErrors: validation.rowErrors,
    });
  } catch (error) {
    return routeError(error);
  }
}
