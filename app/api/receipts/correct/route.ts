import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanCorrectOperational } from '@/lib/server/authz';
import {
  getAttachmentScope,
  getReceiptScope,
  getReceivableScope,
} from '@/lib/server/data';
import {
  auditStatement,
  mutationMarker,
  refreshFinancialStatements,
} from '@/lib/server/mutations';
import { requireSession } from '@/lib/server/session';
import { receiptCorrectSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = receiptCorrectSchema.parse(await request.json());
    const original = await getReceiptScope(input.originalId);
    assertCanCorrectOperational(session, original.districtId);
    if (original.status !== 'VALID') {
      throw new BusinessError('ALREADY_VOIDED', '该回款记录已作废', 409);
    }
    const scope = await getReceivableScope(original.receivableId);
    if (input.receivableId !== scope.id) {
      throw new BusinessError(
        'RECEIVABLE_MISMATCH',
        '更正记录必须归属于原应收',
      );
    }
    if (input.attachmentId) {
      const attachment = await getAttachmentScope(input.attachmentId);
      if (
        attachment.entityType !== 'RECEIPT' ||
        attachment.entityId !== scope.id
      ) {
        throw new BusinessError(
          'INVALID_ATTACHMENT',
          '回款凭证与当前应收不匹配',
        );
      }
    }
    const totals = await getRawDb()
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS received
        FROM receipts
        WHERE receivable_id = ? AND status = 'VALID' AND id != ?`,
      )
      .bind(scope.id, original.id)
      .first<{ received: number }>();
    if (Number(totals?.received ?? 0) + input.amountYuan > scope.amountCents) {
      throw new BusinessError(
        'OVERPAYMENT',
        '更正后已回款金额将超过应收金额',
        409,
      );
    }
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
    if (result.meta.changes !== 1) {
      const latest = await getReceiptScope(original.id);
      throw new BusinessError(
        latest.status === 'VOIDED' ? 'ALREADY_VOIDED' : 'OVERPAYMENT',
        '原记录或余额已变化，本次更正未保存，请刷新后重试',
        409,
      );
    }
    return ok({ voidedId: original.id, replacementId: id });
  } catch (error) {
    return routeError(error);
  }
}
