// Shared business handler: used by both Sites and the independent Node API.
import { getRawDb } from '@/db/index';
import { addCalendarDays } from '@/lib/domain';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { assertCanManageReceivable } from '@/lib/server/authz';
import { currentBusinessDate, getProjectScope } from '@/lib/server/data';
import {
  auditStatement,
  codeAllocation,
  mutationMarker,
  refreshProjectStatement,
} from '@/lib/server/mutations';
import { requireSession } from '@/lib/server/session';
import { receivableCreateSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = receivableCreateSchema.parse(await request.json());
    const project = await getProjectScope(input.projectId);
    assertCanManageReceivable(session, project.districtId);
    const dueDate = addCalendarDays(input.baselineDate, input.termDays);
    if (dueDate < project.contractDate) {
      throw new BusinessError(
        'DUE_BEFORE_CONTRACT',
        '约定付款日期不能早于合同签订日期',
        400,
        { baselineDate: ['请检查基准日期和账期天数'] },
      );
    }
    const duplicate = await getRawDb()
      .prepare(
        'SELECT id FROM receivables WHERE project_id = ? AND sequence_no = ?',
      )
      .bind(project.id, input.sequenceNo)
      .first();
    if (duplicate) {
      throw new BusinessError('DUPLICATE_NODE', '该项目的节点序号已存在', 409, {
        sequenceNo: ['节点序号已存在'],
      });
    }

    const id = crypto.randomUUID();
    const code = codeAllocation(
      'receivables',
      `YS-${currentBusinessDate().replaceAll('-', '').slice(0, 6)}-`,
    );
    const now = new Date().toISOString();
    const acceptanceType =
      input.acceptanceType ||
      (input.paymentType === '初验款'
        ? '初验'
        : input.paymentType === '终验款'
          ? '终验'
          : null);
    const db = getRawDb();
    await db.batch([
      db
        .prepare(
          `INSERT INTO receivables (
          id, receivable_code, project_id, sequence_no, payment_type,
          amount_cents, payment_condition, baseline_event, baseline_date,
          term_days, due_date, acceptance_type, acceptance_date, invoice_status,
          invoice_delivered_date, overdue_reason, confirmation_status,
          writeoff_status, created_by, created_at, updated_at
        ) VALUES (?, ${code.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT',
          'UNPAID', ?, ?, ?)`,
        )
        .bind(
          id,
          ...code.bindings,
          project.id,
          input.sequenceNo,
          input.paymentType,
          input.amountYuan,
          input.paymentCondition,
          input.baselineEvent,
          input.baselineDate,
          input.termDays,
          dueDate,
          acceptanceType,
          input.acceptanceDate || null,
          input.invoiceStatus || null,
          input.invoiceDeliveredDate || null,
          input.overdueReason || null,
          session.id,
          now,
          now,
        ),
      refreshProjectStatement([project.id], mutationMarker('receivables', id)),
      auditStatement({
        districtId: project.districtId,
        entityType: 'RECEIVABLE',
        entityId: id,
        action: 'CREATE',
        newValue: {
          projectCode: project.projectCode,
          amountCents: input.amountYuan,
          dueDate,
          status: 'DRAFT',
        },
        source: 'MANUAL',
        actorRole: session.role,
        actorName: session.displayName,
      }),
    ]);
    const created = await db
      .prepare(
        'SELECT receivable_code AS receivableCode FROM receivables WHERE id = ?',
      )
      .bind(id)
      .first<{ receivableCode: string }>();
    return ok(
      { id, receivableCode: created!.receivableCode, dueDate },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}
