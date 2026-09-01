'use client';
import { receiptService } from '@/services/operations';

import * as React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { LoaderCircle, PencilLine } from 'lucide-react';
import { ErrorText, FormField } from '@/components/receivables/design-system';
import { Button } from '@/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BootstrapData, ReceiptRecord } from '@/lib/types';
import { formatYuan, centsForInput, describeError } from '@/lib/presentation';
import {
  type UploadedAttachment,
  uploadAttachment,
} from '@/services/attachments';
import { AttachmentField } from '@/components/receivables/forms/attachment-field';

export function ReceiptCorrectionDialog({
  record,
  data,
  onOpenChange,
  onDone,
}: {
  record: ReceiptRecord | null;
  data: BootstrapData;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!record) return null;
  const currentRecord = record;
  const receivable = data.receivables.find(
    (item) => item.id === currentRecord.receivableId,
  );

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || currentRecord.status !== 'VALID') {
      setError('原记录已作废或当前不可更正，请刷新后查看。');
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(
          file,
          'RECEIPT',
          currentRecord.receivableId,
        );
        setUploaded(attachment);
      }
      await receiptService.correct({
        originalId: currentRecord.id,
        receivableId: currentRecord.receivableId,
        amountYuan: form.get('amountYuan'),
        receivedDate: form.get('receivedDate'),
        note: form.get('note'),
        reason: form.get('reason'),
        attachmentId: attachment?.id ?? currentRecord.attachmentId ?? null,
      });
      onOpenChange(false);
      await onDone('原回款已作废，更正记录已追加并重新计算核销状态');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const maxCents = (receivable?.remainingAmountCents ?? 0) + record.amountCents;
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>作废并更正回款</DialogTitle>
          <DialogDescription>
            原记录不会删除，将标记作废并追加一条新的有效记录。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="app-record-context">
            <p className="font-medium text-[var(--app-text-strong)]">
              {record.projectName}
            </p>
            <p className="mt-1 text-muted-foreground">
              {record.receivableCode} · 原金额 {formatYuan(record.amountCents)}{' '}
              · {record.receivedDate}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="更正后金额（元）" required>
              <Input
                name="amountYuan"
                type="number"
                min="0.01"
                max={centsForInput(maxCents)}
                step="0.01"
                defaultValue={centsForInput(record.amountCents)}
                required
              />
            </FormField>
            <FormField label="更正后实收日期" required>
              <Input
                name="receivedDate"
                type="date"
                defaultValue={record.receivedDate}
                required
              />
            </FormField>
          </div>
          <FormField label="更正后备注">
            <Textarea name="note" defaultValue={record.note ?? ''} />
          </FormField>
          <AttachmentField
            label="替换凭证"
            hint={
              record.attachmentName
                ? `不选择新文件将沿用：${record.attachmentName}`
                : '可选；支持 PDF、JPG、PNG。'
            }
            onChange={(next) => {
              setFile(next);
              setUploaded(null);
            }}
          />
          <FormField
            label="更正原因"
            required
            hint="原因会进入审计日志，且不可删除。"
          >
            <Textarea
              name="reason"
              required
              placeholder="请说明原记录错误及更正依据"
            />
          </FormField>
          <ErrorText error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PencilLine />
              )}
              作废并保存更正
            </Button>
          </DialogFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
