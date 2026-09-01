'use client';
import { receiptService } from '@/services/operations';

import * as React from 'react';
import { contextualCandidates } from '@/lib/project-navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Check, LoaderCircle } from 'lucide-react';
import {
  EmptyState,
  ErrorText,
  FormField,
  SummaryTile,
} from '@/components/receivables/design-system';
import { Button } from '@/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { BootstrapData } from '@/lib/types';
import {
  formatYuan,
  currentDate,
  centsForInput,
  describeError,
} from '@/lib/presentation';
import {
  type UploadedAttachment,
  uploadAttachment,
} from '@/services/attachments';
import { AttachmentField } from '@/components/receivables/forms/attachment-field';

export function ReceiptDialog({
  open,
  data,
  contextProjectId,
  initialReceivableId,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  data: BootstrapData;
  contextProjectId?: string | null;
  initialReceivableId?: string | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const candidates = React.useMemo(
    () =>
      contextualCandidates(
        data.receivables,
        contextProjectId,
        initialReceivableId,
      ).filter(
        (item) =>
          item.confirmationStatus === 'CONFIRMED' &&
          item.remainingAmountCents > 0,
      ),
    [data.receivables, contextProjectId, initialReceivableId],
  );
  const [receivableId, setReceivableId] = React.useState(
    () =>
      candidates.find((item) => item.id === initialReceivableId)?.id ??
      candidates[0]?.id ??
      '',
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selected = candidates.find((item) => item.id === receivableId);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !candidates.some((r) => r.id === receivableId)) {
      setError(
        '当前应收已结清或不再可用；不会改选其他节点，请关闭面板后刷新。',
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(file, 'RECEIPT', receivableId);
        setUploaded(attachment);
      }
      await receiptService.create({
        receivableId,
        amountYuan: form.get('amountYuan'),
        receivedDate: form.get('receivedDate'),
        note: form.get('note'),
        attachmentId: attachment?.id ?? null,
      });
      onOpenChange(false);
      await onDone('回款已登记，核销状态和项目归档状态已重新计算');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>登记回款</DialogTitle>
          <DialogDescription>
            仅可选择已确认且仍有余额的应收，系统会阻止超额回款。
          </DialogDescription>
        </DialogHeader>
        {candidates.length ? (
          <form onSubmit={submit} className="space-y-4">
            <FormField label="应收记录" required>
              <NativeSelect
                className="w-full"
                value={receivableId}
                onChange={(event) => {
                  setReceivableId(event.target.value);
                  setFile(null);
                  setUploaded(null);
                }}
              >
                {candidates.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.receivableCode} · {item.projectName} · 余额{' '}
                    {formatYuan(item.remainingAmountCents)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            {selected ? (
              <div className="grid grid-cols-3 gap-2">
                <SummaryTile
                  label="应收"
                  value={formatYuan(selected.amountCents)}
                />
                <SummaryTile
                  label="已收"
                  value={formatYuan(selected.receivedAmountCents)}
                />
                <SummaryTile
                  label="剩余"
                  value={formatYuan(selected.remainingAmountCents)}
                  tone="brand"
                />
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="实收金额（元）" required>
                <Input
                  name="amountYuan"
                  type="number"
                  min="0.01"
                  max={
                    selected
                      ? centsForInput(selected.remainingAmountCents)
                      : undefined
                  }
                  step="0.01"
                  required
                />
              </FormField>
              <FormField label="实收日期" required>
                <Input
                  name="receivedDate"
                  type="date"
                  defaultValue={currentDate()}
                  required
                />
              </FormField>
            </div>
            <FormField label="备注">
              <Textarea name="note" placeholder="可填写银行流水、到账说明等" />
            </FormField>
            <AttachmentField
              label="回款凭证"
              hint="可选；支持 PDF、JPG、PNG，单文件不超过 10MB。"
              onChange={(next) => {
                setFile(next);
                setUploaded(null);
              }}
            />
            {uploaded ? (
              <output className="text-xs text-[var(--app-positive)]">
                已上传：{uploaded.fileName}
              </output>
            ) : null}
            <ErrorText error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy || !receivableId}
                aria-busy={busy}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                保存回款
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <EmptyState
              title="暂无可登记应收"
              description="待确认应收需由市级管理员确认后才能登记回款。"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </DialogFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
