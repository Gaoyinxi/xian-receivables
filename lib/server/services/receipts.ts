import { BusinessError } from '@/lib/server/api';
import { assertCanCreateOperational } from '@/lib/server/authz';
import { getAttachmentScope, getReceivableScope } from '@/lib/server/data';
import type { z } from 'zod';
import type { DemoSession } from '@/lib/types';
import { receiptCreateSchema } from '@/lib/validation';
type Input = z.output<typeof receiptCreateSchema>;
import {
  insertReceipt,
  receiptTotals,
} from '@/lib/server/repositories/receipts';
export async function createReceipt(session: DemoSession, input: Input) {
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
  const totals = await receiptTotals(scope.id);
  if (Number(totals?.received ?? 0) + input.amountYuan > scope.amountCents) {
    throw new BusinessError(
      'OVERPAYMENT',
      '已回款金额超过应收金额，请确认',
      409,
      { amountYuan: ['本次回款超过剩余应收'] },
    );
  }
  const { id, result } = await insertReceipt(session, input, scope);
  if (result.meta.changes !== 1) {
    throw new BusinessError(
      'OVERPAYMENT',
      '余额已变化，本次回款未保存。请刷新后确认剩余应收',
      409,
    );
  }
  return { id };
}
