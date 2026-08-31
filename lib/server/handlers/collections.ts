// Shared business handler: used by both Sites and the independent Node API.
import { getRawDb } from '@/db/index';
import { isFormalCollectionAction } from '@/lib/domain';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanCreateOperational } from '@/lib/server/authz';
import { getAttachmentScope, getReceivableScope } from '@/lib/server/data';
import { auditStatement } from '@/lib/server/mutations';
import { requireSession } from '@/lib/server/session';
import { collectionCreateSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = collectionCreateSchema.parse(await request.json());
    const scope = await getReceivableScope(input.receivableId);
    assertCanCreateOperational(session, scope.districtId);
    if (isFormalCollectionAction(input.actionType) && !input.attachmentId) {
      throw new BusinessError(
        'ATTACHMENT_REQUIRED',
        '请上传催收函、律师函或诉讼函附件',
        400,
        { attachmentId: ['正式函件必须上传附件'] },
      );
    }
    if (input.attachmentId) {
      const attachment = await getAttachmentScope(input.attachmentId);
      if (
        attachment.entityType !== 'COLLECTION' ||
        attachment.entityId !== scope.id
      ) {
        throw new BusinessError(
          'INVALID_ATTACHMENT',
          '催缴附件与当前应收不匹配',
        );
      }
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = getRawDb();
    await db.batch([
      db
        .prepare(
          `INSERT INTO collection_events (
          id, receivable_id, action_type, action_date, note, attachment_id,
          status, created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
        )
        .bind(
          id,
          scope.id,
          input.actionType,
          input.actionDate,
          input.note || null,
          input.attachmentId || null,
          session.id,
          session.displayName,
          now,
        ),
      auditStatement({
        districtId: scope.districtId,
        entityType: 'COLLECTION',
        entityId: id,
        action: 'CREATE',
        newValue: {
          receivableCode: scope.receivableCode,
          actionType: input.actionType,
          actionDate: input.actionDate,
        },
        source: 'MANUAL',
        actorRole: session.role,
        actorName: session.displayName,
      }),
    ]);
    return ok({ id }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
