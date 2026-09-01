'use client';
import { collectionService } from '@/services/operations';

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
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  BootstrapData,
  CollectionAction,
  CollectionRecord,
} from '@/lib/types';
import {
  actionLabels,
  requiresCollectionAttachment,
  describeError,
} from '@/lib/presentation';
import {
  type UploadedAttachment,
  uploadAttachment,
} from '@/services/attachments';
import { AttachmentField } from '@/components/receivables/forms/attachment-field';

export function CollectionCorrectionDialog({
  record,
  data,
  onOpenChange,
  onDone,
}: {
  record: CollectionRecord | null;
  data: BootstrapData;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [action, setAction] = React.useState<CollectionAction>(
    () => record?.actionType ?? 'WECHAT',
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!record) return null;
  const currentRecord = record;
  const formal = requiresCollectionAttachment(action);
  const existingAttachment = data.attachments.find(
    (item) => item.id === currentRecord.attachmentId,
  );

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || currentRecord.status !== 'VALID') {
      setError('原记录已作废或当前不可更正，请刷新后查看。');
      return;
    }
    const form = new FormData(event.currentTarget);
    const inheritedAttachmentId = currentRecord.attachmentId ?? null;
    if (formal && !file && !uploaded && !inheritedAttachmentId) {
      setError('正式函件更正记录必须上传附件');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(
          file,
          'COLLECTION',
          currentRecord.receivableId,
        );
        setUploaded(attachment);
      }
      await collectionService.correct({
        originalId: currentRecord.id,
        receivableId: currentRecord.receivableId,
        actionType: action,
        actionDate: form.get('actionDate'),
        note: form.get('note'),
        reason: form.get('reason'),
        attachmentId: attachment?.id ?? inheritedAttachmentId,
      });
      onOpenChange(false);
      await onDone('原催缴已作废，更正记录已追加并重新计算法律风险');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>作废并更正催缴</DialogTitle>
          <DialogDescription>
            原时间线记录会保留为已作废，并追加新的有效记录。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="app-record-context">
            <p className="font-medium text-[var(--app-text-strong)]">
              {record.projectName}
            </p>
            <p className="mt-1 text-muted-foreground">
              {record.receivableCode} · 原动作 {actionLabels[record.actionType]}{' '}
              · {record.actionDate}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="更正后动作" required>
              <NativeSelect
                className="w-full"
                value={action}
                onChange={(event) => {
                  setAction(event.target.value as CollectionAction);
                  setFile(null);
                  setUploaded(null);
                }}
              >
                {Object.entries(actionLabels).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="更正后日期" required>
              <Input
                name="actionDate"
                type="date"
                defaultValue={record.actionDate}
                required
              />
            </FormField>
          </div>
          <FormField label="更正后纪要">
            <Textarea name="note" defaultValue={record.note ?? ''} />
          </FormField>
          <AttachmentField
            label="替换附件"
            required={formal && !record.attachmentId}
            hint={
              existingAttachment
                ? `不选择新文件将沿用：${existingAttachment.fileName}`
                : formal
                  ? '正式函件附件必传。'
                  : '可选；支持 PDF、JPG、PNG。'
            }
            onChange={(next) => {
              setFile(next);
              setUploaded(null);
            }}
          />
          <FormField label="更正原因" required hint="原因将永久写入审计日志。">
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
