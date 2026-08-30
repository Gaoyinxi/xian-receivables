import { getRawDb } from '@/db/index';
import { isFormalCollectionAction } from '@/lib/domain';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanCorrectOperational } from '@/lib/server/authz';
import {
  appendAudit,
  getAttachmentScope,
  getCollectionScope,
  getReceivableScope,
} from '@/lib/server/data';
import { requireSession } from '@/lib/server/session';
import { collectionCorrectSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = collectionCorrectSchema.parse(await request.json());
    const original = await getCollectionScope(input.originalId);
    assertCanCorrectOperational(session, original.districtId);
    if (original.status !== 'VALID') {
      throw new BusinessError('ALREADY_VOIDED', '该催缴记录已作废', 409);
    }
    const scope = await getReceivableScope(original.receivableId);
    if (input.receivableId !== scope.id) {
      throw new BusinessError(
        'RECEIVABLE_MISMATCH',
        '更正记录必须归属于原应收',
      );
    }
    if (isFormalCollectionAction(input.actionType) && !input.attachmentId) {
      throw new BusinessError(
        'ATTACHMENT_REQUIRED',
        '正式函件更正记录必须上传附件',
      );
    }
    if (input.attachmentId) {
      const attachment = await getAttachmentScope(input.attachmentId);
      if (
        attachment.entityType !== 'COLLECTION' ||
        attachment.entityId !== scope.id
      ) {
        throw new BusinessError('INVALID_ATTACHMENT', '催缴附件与当前应收不匹配');
      }
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = getRawDb();
    await db.batch([
      db
        .prepare(
          `UPDATE collection_events SET status = 'VOIDED', void_reason = ?,
            voided_by = ?, voided_at = ? WHERE id = ? AND status = 'VALID'`,
        )
        .bind(input.reason, session.id, now, original.id),
      db
        .prepare(
          `INSERT INTO collection_events (
            id, receivable_id, action_type, action_date, note, attachment_id,
            status, correction_of_id, created_by, created_by_name, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'VALID', ?, ?, ?, ?)`,
        )
        .bind(
          id,
          scope.id,
          input.actionType,
          input.actionDate,
          input.note || null,
          input.attachmentId || null,
          original.id,
          session.id,
          session.displayName,
          now,
        ),
    ]);
    await appendAudit({
      districtId: scope.districtId,
      entityType: 'COLLECTION',
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
