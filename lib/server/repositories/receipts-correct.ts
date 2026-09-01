import { getRawDb } from '@/db/index';
import { getReceiptScope } from '@/lib/server/data';
import {
  auditStatement,
  mutationMarker,
  refreshFinancialStatements,
} from '@/lib/server/mutations';
import type { z } from 'zod';
import type { DemoSession } from '@/lib/types';
import { receiptCorrectSchema } from '@/lib/validation';
type Input = z.output<typeof receiptCorrectSchema>;
import type { ReceivableScope } from '@/lib/server/data';

export async function replaceReceipt(
  session: DemoSession,
  input: Input,
  scope: ReceivableScope,
  original: Awaited<ReturnType<typeof getReceiptScope>>,
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = getRawDb();
  const marker = mutationMarker('receipts', id);
  // Insert first: a concurrent correction cannot insert once the original is voided.
  // No other transaction observes the temporary original + replacement pair.
  const [result] = await db.batch([
    db
      .prepare(
        `INSERT INTO receipts (
            id, receivable_id, amount_cents, received_date, note, attachment_id,
            status, correction_of_id, created_by, created_by_name, created_at
          ) SELECT ?, r.id, ?, ?, ?, ?, 'VALID', original.id, ?, ?, ?
          FROM receipts original JOIN receivables r ON r.id = original.receivable_id
          JOIN projects p ON p.id = r.project_id
          WHERE original.id = ? AND original.status = 'VALID' AND r.id = ?
            AND r.confirmation_status = 'CONFIRMED'
            AND (? = 'CITY_ADMIN' OR p.district_id = ?)
            AND ? <= r.amount_cents - (SELECT COALESCE(SUM(amount_cents), 0)
              FROM receipts WHERE receivable_id = r.id AND status = 'VALID' AND id != original.id)`,
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
        original.id,
        scope.id,
        session.role,
        session.districtId,
        input.amountYuan,
      ),
    db
      .prepare(`UPDATE receipts SET status = 'VOIDED', void_reason = ?,
        voided_by = ?, voided_at = ? WHERE id = ? AND status = 'VALID' AND ${marker.sql}`)
      .bind(input.reason, session.id, now, original.id, ...marker.bindings),
    ...refreshFinancialStatements([scope.id], [scope.projectId], marker),
    auditStatement(
      {
        districtId: scope.districtId,
        entityType: 'RECEIPT',
        entityId: original.id,
        action: 'VOID_AND_CORRECT',
        oldValue: original,
        newValue: {
          status: 'VOIDED',
          replacementId: id,
          amountCents: input.amountYuan,
          receivedDate: input.receivedDate,
          note: input.note || null,
          attachmentId: input.attachmentId || null,
        },
        reason: input.reason,
        source: 'CORRECTION',
        actorRole: session.role,
        actorName: session.displayName,
      },
      marker,
    ),
  ]);
  return { id, result };
}

export async function receiptTotals(receivableId: string, originalId: string) {
  return await getRawDb()
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS received
        FROM receipts
        WHERE receivable_id = ? AND status = 'VALID' AND id != ?`,
    )
    .bind(receivableId, originalId)
    .first<{ received: number }>();
}
