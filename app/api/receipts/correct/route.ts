import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanCorrectOperational } from '@/lib/server/authz';
import {
  appendAudit,
  getAttachmentScope,
  getReceiptScope,
  getReceivableScope,
  refreshReceivableAndProject,
} from '@/lib/server/data';
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
        throw new BusinessError('INVALID_ATTACHMENT', '回款凭证与当前应收不匹配');
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
    await db.batch([
      db
        .prepare(
          `UPDATE receipts SET status = 'VOIDED', void_reason = ?,
            voided_by = ?, voided_at = ? WHERE id = ? AND status = 'VALID'`,
        )
        .bind(input.reason, session.id, now, original.id),
      db
        .prepare(
          `INSERT INTO receipts (
            id, receivable_id, amount_cents, received_date, note, attachment_id,
            status, correction_of_id, created_by, created_by_name, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'VALID', ?, ?, ?, ?)`,
        )
        .bind(
          id,
          scope.id,
          input.amountYuan,
          input.receivedDate,
          input.note || null,
          input.attachmentId || null,
          original.id,
          session.id,
          session.displayName,
          now,
        ),
    ]);
    await refreshReceivableAndProject(scope.id);
    await appendAudit({
      districtId: scope.districtId,
      entityType: 'RECEIPT',
      entityId: original.id,
      action: 'VOID_AND_CORRECT',
      oldValue: { status: 'VALID' },
      newValue: { status: 'VOIDED', replacementId: id },
      reason: input.reason,
      source: 'CORRECTION',
      actorRole: session.role,
      actorName: session.displayName,
    });
    return ok({ voidedId: original.id, replacementId: id });
  } catch (error) {
    return routeError(error);
  }
}
