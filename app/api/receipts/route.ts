import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanCreateOperational } from '@/lib/server/authz';
import {
  appendAudit,
  getAttachmentScope,
  getReceivableScope,
  refreshReceivableAndProject,
} from '@/lib/server/data';
import { requireSession } from '@/lib/server/session';
import { receiptCreateSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = receiptCreateSchema.parse(await request.json());
    const scope = await getReceivableScope(input.receivableId);
    assertCanCreateOperational(session, scope.districtId);
    if (scope.confirmationStatus !== 'CONFIRMED') {
      throw new BusinessError(
        'RECEIVABLE_DRAFT',
        '应收金额待确认，暂不可填报回款',
        409,
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
        FROM receipts WHERE receivable_id = ? AND status = 'VALID'`,
      )
      .bind(scope.id)
      .first<{ received: number }>();
    if (Number(totals?.received ?? 0) + input.amountYuan > scope.amountCents) {
      throw new BusinessError(
        'OVERPAYMENT',
        '已回款金额超过应收金额，请确认',
        409,
        { amountYuan: ['本次回款超过剩余应收'] },
      );
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await getRawDb()
      .prepare(
        `INSERT INTO receipts (
          id, receivable_id, amount_cents, received_date, note, attachment_id,
          status, created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
      )
      .bind(
        id,
        scope.id,
        input.amountYuan,
        input.receivedDate,
        input.note || null,
        input.attachmentId || null,
        session.id,
        session.displayName,
        now,
      )
      .run();
    await refreshReceivableAndProject(scope.id);
    await appendAudit({
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
    });
    return ok({ id }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
