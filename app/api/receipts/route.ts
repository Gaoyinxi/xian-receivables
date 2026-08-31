import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanCreateOperational } from '@/lib/server/authz';
import { getAttachmentScope, getReceivableScope } from '@/lib/server/data';
import {
  auditStatement,
  mutationMarker,
  refreshFinancialStatements,
} from '@/lib/server/mutations';
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
        throw new BusinessError(
          'INVALID_ATTACHMENT',
          '回款凭证与当前应收不匹配',
        );
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
    if (result.meta.changes !== 1) {
      throw new BusinessError(
        'OVERPAYMENT',
        '余额已变化，本次回款未保存。请刷新后确认剩余应收',
        409,
      );
    }
    return ok({ id }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
