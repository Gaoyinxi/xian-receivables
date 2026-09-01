import { BusinessError } from '@/lib/server/api';
import { assertCanCorrectOperational } from '@/lib/server/authz';
import {
  getAttachmentScope,
  getReceiptScope,
  getReceivableScope,
} from '@/lib/server/data';
import type { z } from 'zod';
import type { DemoSession } from '@/lib/types';
import { receiptCorrectSchema } from '@/lib/validation';
type Input = z.output<typeof receiptCorrectSchema>;
import {
  replaceReceipt,
  receiptTotals,
} from '@/lib/server/repositories/receipts-correct';
export async function correctReceipt(session: DemoSession, input: Input) {
  const original = await getReceiptScope(input.originalId);
  assertCanCorrectOperational(session, original.districtId);
  if (original.status !== 'VALID') {
    throw new BusinessError('ALREADY_VOIDED', '该回款记录已作废', 409);
  }
  const scope = await getReceivableScope(original.receivableId);
  if (input.receivableId !== scope.id) {
    throw new BusinessError('RECEIVABLE_MISMATCH', '更正记录必须归属于原应收');
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
  const totals = await receiptTotals(scope.id, original.id);
  if (Number(totals?.received ?? 0) + input.amountYuan > scope.amountCents) {
    throw new BusinessError(
      'OVERPAYMENT',
      '更正后已回款金额将超过应收金额',
      409,
    );
  }
  const { id, result } = await replaceReceipt(session, input, scope, original);
  if (result.meta.changes !== 1) {
    const latest = await getReceiptScope(original.id);
    throw new BusinessError(
      latest.status === 'VOIDED' ? 'ALREADY_VOIDED' : 'OVERPAYMENT',
      '原记录或余额已变化，本次更正未保存，请刷新后重试',
      409,
    );
  }
  return { voidedId: original.id, replacementId: id };
}
