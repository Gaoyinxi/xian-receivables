'use client';
import { projectService } from '@/services/operations';

import * as React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { LoaderCircle, Plus } from 'lucide-react';
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
import type { BootstrapData } from '@/lib/types';
import { baselineLabels, describeError } from '@/lib/presentation';

export function NodeDialog({
  open,
  data,
  contextProjectId,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  data: BootstrapData;
  contextProjectId?: string | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const projects = React.useMemo(
    () =>
      data.projects.filter((project) =>
        contextProjectId
          ? project.id === contextProjectId
          : !project.archivedAt,
      ),
    [data.projects, contextProjectId],
  );
  const [projectId, setProjectId] = React.useState(() => projects[0]?.id ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !projects.some((p) => p.id === projectId)) {
      setError('当前项目已不可用，请关闭面板并刷新项目。');
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await projectService.addNode(
        Object.fromEntries(form.entries()),
      );
      onOpenChange(false);
      await onDone(
        `付款节点 ${result.receivableCode} 已生成，约定付款日 ${result.dueDate}`,
      );
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
          <DialogTitle>新增付款节点</DialogTitle>
          <DialogDescription>
            保存后生成待确认应收，约定付款日按基准日期加账期天数计算。
          </DialogDescription>
        </DialogHeader>
        {projects.length ? (
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="项目" required className="md:col-span-2">
                <NativeSelect
                  name="projectId"
                  className="w-full"
                  required
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <NativeSelectOption key={project.id} value={project.id}>
                      {project.projectCode} · {project.name} ·{' '}
                      {project.districtName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="节点序号" required>
                <Input
                  name="sequenceNo"
                  type="number"
                  min={1}
                  step={1}
                  required
                />
              </FormField>
              <FormField label="款项类型" required>
                <NativeSelect name="paymentType" className="w-full" required>
                  {['预付款', '进度款', '初验款', '终验款', '质保金'].map(
                    (item) => (
                      <NativeSelectOption key={item} value={item}>
                        {item}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </FormField>
              <FormField label="节点金额（元）" required>
                <Input
                  name="amountYuan"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </FormField>
              <FormField label="付款条件" required>
                <Input
                  name="paymentCondition"
                  required
                  placeholder="例如 初验完成后30日内"
                />
              </FormField>
              <FormField label="基准事件" required>
                <NativeSelect name="baselineEvent" className="w-full" required>
                  {Object.entries(baselineLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="基准日期" required>
                <Input name="baselineDate" type="date" required />
              </FormField>
              <FormField label="账期天数" required>
                <Input
                  name="termDays"
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  required
                />
              </FormField>
              <FormField label="验收类型">
                <Input name="acceptanceType" placeholder="可选，如 初验" />
              </FormField>
              <FormField label="验收日期">
                <Input name="acceptanceDate" type="date" />
              </FormField>
              <FormField label="发票状态">
                <Input name="invoiceStatus" placeholder="可选，如 已开票" />
              </FormField>
              <FormField label="发票递交日期">
                <Input name="invoiceDeliveredDate" type="date" />
              </FormField>
              <FormField label="逾期原因" className="md:col-span-2">
                <Textarea
                  name="overdueReason"
                  placeholder="可选；如已知风险原因可提前记录"
                />
              </FormField>
            </div>
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
                disabled={busy || !projectId}
                aria-busy={busy}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
                生成待确认应收
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <EmptyState
              title="暂无可维护项目"
              description="请先创建进行中的项目。"
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
