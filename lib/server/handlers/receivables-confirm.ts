// Shared business handler: used by both Sites and the independent Node API.
import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanConfirm } from '@/lib/server/authz';
import { getReceivableScope } from '@/lib/server/data';
import { auditStatement } from '@/lib/server/mutations';
import { requireSession } from '@/lib/server/session';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertCanConfirm(session);
    const body = (await request.json()) as { id?: string };
    if (!body || typeof body.id !== 'string' || !body.id.trim()) {
      throw new BusinessError('VALIDATION_ERROR', '请选择待确认应收');
    }
    const scope = await getReceivableScope(body.id);
    if (scope.confirmationStatus === 'CONFIRMED') {
      throw new BusinessError('ALREADY_CONFIRMED', '该应收已确认', 409);
    }
    const now = new Date().toISOString();
    const db = getRawDb();
    // changes() immediately follows the guarded UPDATE in this transaction.
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE receivables SET confirmation_status = 'CONFIRMED',
          confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ? AND confirmation_status = 'DRAFT'`,
        )
        .bind(session.id, now, now, scope.id),
      auditStatement(
        {
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
        },
        { sql: 'changes() = 1', bindings: [] },
      ),
    ]);
    if (result.meta.changes !== 1)
      throw new BusinessError('ALREADY_CONFIRMED', '该应收已确认', 409);
    return ok({ id: scope.id, confirmationStatus: 'CONFIRMED' });
  } catch (error) {
    return routeError(error);
  }
}
