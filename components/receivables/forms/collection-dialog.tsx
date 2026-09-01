'use client';
import { collectionService } from '@/services/operations';

import * as React from 'react';
import { contextualCandidates } from '@/lib/project-navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { BellRing, LoaderCircle } from 'lucide-react';
import {
  EmptyState,
  ErrorText,
  FormField,
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
import type { BootstrapData, CollectionAction } from '@/lib/types';
import {
  formatYuan,
  currentDate,
  actionLabels,
  requiresCollectionAttachment,
  describeError,
} from '@/lib/presentation';
import {
  type UploadedAttachment,
  uploadAttachment,
} from '@/services/attachments';
import { AttachmentField } from '@/components/receivables/forms/attachment-field';

export function CollectionDialog({
  open,
  data,
  contextProjectId,
  initialReceivableId,
  initialAction = 'WECHAT',
  onOpenChange,
  onDone,
}: {
  open: boolean;
  data: BootstrapData;
  contextProjectId?: string | null;
  initialReceivableId?: string | null;
  initialAction?: CollectionAction;
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
          item.writeoffStatus !== 'PAID',
      ),
    [data.receivables, contextProjectId, initialReceivableId],
  );
  const [receivableId, setReceivableId] = React.useState(
    () =>
      candidates.find((item) => item.id === initialReceivableId)?.id ??
      candidates[0]?.id ??
      '',
  );
  const [action, setAction] = React.useState<CollectionAction>(initialAction);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const formal = requiresCollectionAttachment(action);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !candidates.some((r) => r.id === receivableId)) {
      setError(
        '当前应收已结清或不再可用；不会改选其他节点，请关闭面板后刷新。',
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    if (formal && !file && !uploaded) {
      setError('正式函件必须上传 PDF、JPG 或 PNG 附件');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(file, 'COLLECTION', receivableId);
        setUploaded(attachment);
      }
      await collectionService.create({
        receivableId,
        actionType: action,
        actionDate: form.get('actionDate'),
        note: form.get('note'),
        attachmentId: attachment?.id ?? null,
      });
      onOpenChange(false);
      await onDone('催缴动作已追加，法律风险基准已重新计算');
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
          <DialogTitle>新增催缴动作</DialogTitle>
          <DialogDescription>
            催缴时间线只追加、不覆盖；正式函件必须上传附件。
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
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="催缴动作" required>
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
              <FormField label="催缴日期" required>
                <Input
                  name="actionDate"
                  type="date"
                  defaultValue={currentDate()}
                  required
                />
              </FormField>
            </div>
            <FormField label="沟通纪要">
              <Textarea
                name="note"
                placeholder="记录沟通对象、反馈、承诺日期和下一步安排"
              />
            </FormField>
            <AttachmentField
              label="催缴附件"
              required={formal}
              hint={
                formal
                  ? '当前动作属于正式函件，附件必传。'
                  : '微信、面谈等动作可选传附件。'
              }
              onChange={(next) => {
                setFile(next);
                setUploaded(null);
              }}
            />
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
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <BellRing />
                )}
                保存催缴
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <EmptyState
              title="暂无可催缴应收"
              description="只有已确认且未结清的应收可新增催缴动作。"
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
