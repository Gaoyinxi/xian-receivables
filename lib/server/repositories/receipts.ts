import { getRawDb } from '@/db/index';
import {
  auditStatement,
  mutationMarker,
  refreshFinancialStatements,
} from '@/lib/server/mutations';
import type { z } from 'zod';
import type { DemoSession } from '@/lib/types';
import { receiptCreateSchema } from '@/lib/validation';
type Input = z.output<typeof receiptCreateSchema>;
import type { ReceivableScope } from '@/lib/server/data';

export async function insertReceipt(
  session: DemoSession,
  input: Input,
  scope: ReceivableScope,
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const marker = mutationMarker('receipts', id);
  const db = getRawDb();
  const [result] = await db.batch([
    db
      .prepare(
        `INSERT INTO receipts (
          id, receivable_id, amount_cents, received_date, note, attachment_id,
          status, created_by, created_by_name, created_at
        ) SELECT ?, r.id, ?, ?, ?, ?, 'VALID', ?, ?, ?
        FROM receivables r JOIN projects p ON p.id = r.project_id
        WHERE r.id = ? AND r.confirmation_status = 'CONFIRMED'
          AND (? = 'CITY_ADMIN' OR p.district_id = ?)
          AND ? <= r.amount_cents - (SELECT COALESCE(SUM(amount_cents), 0)
            FROM receipts WHERE receivable_id = r.id AND status = 'VALID')`,
      )
      .bind(
        id,
        input.amountYuan,
        input.receivedDate,
        input.note || null,
        input.attachmentId || null,
        session.id,
        session.displayName,
        now,
        scope.id,
        session.role,
        session.districtId,
        input.amountYuan,
      ),
    ...refreshFinancialStatements([scope.id], [scope.projectId], marker),
    auditStatement(
      {
        districtId: scope.districtId,
        entityType: 'RECEIPT',
        entityId: id,
        action: 'CREATE',
        newValue: {
          receivableCode: scope.receivableCode,
          amountCents: input.amountYuan,
          receivedDate: input.receivedDate,
        },
        source: 'MANUAL',
        actorRole: session.role,
        actorName: session.displayName,
      },
      marker,
    ),
  ]);
  return { id, result };
}

export async function receiptTotals(receivableId: string) {
  return await getRawDb()
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS received
        FROM receipts WHERE receivable_id = ? AND status = 'VALID'`,
    )
    .bind(receivableId)
    .first<{ received: number }>();
}
