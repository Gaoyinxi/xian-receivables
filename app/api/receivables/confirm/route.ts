import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanConfirm } from '@/lib/server/authz';
import { appendAudit, getReceivableScope } from '@/lib/server/data';
import { requireSession } from '@/lib/server/session';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertCanConfirm(session);
    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      throw new BusinessError('VALIDATION_ERROR', '请选择待确认应收');
    }
    const scope = await getReceivableScope(body.id);
    if (scope.confirmationStatus === 'CONFIRMED') {
      throw new BusinessError('ALREADY_CONFIRMED', '该应收已确认', 409);
    }
    const now = new Date().toISOString();
    await getRawDb()
      .prepare(
        `UPDATE receivables SET confirmation_status = 'CONFIRMED',
          confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(session.id, now, now, scope.id)
      .run();
    await appendAudit({
      districtId: scope.districtId,
      entityType: 'RECEIVABLE',
      entityId: scope.id,
      action: 'CONFIRM',
      fieldName: 'confirmationStatus',
      oldValue: 'DRAFT',
      newValue: 'CONFIRMED',
      source: 'MANUAL',
      actorRole: session.role,
      actorName: session.displayName,
    });
    return ok({ id: scope.id, confirmationStatus: 'CONFIRMED' });
  } catch (error) {
    return routeError(error);
  }
}
