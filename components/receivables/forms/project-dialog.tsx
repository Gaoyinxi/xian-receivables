'use client';
import { projectService } from '@/services/operations';

import * as React from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { ErrorText, FormField } from '@/components/receivables/design-system';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
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
import type { BootstrapData } from '@/lib/types';
import { describeError } from '@/lib/presentation';

export function ProjectDialog({
  open,
  data,
  onOpenChange,
  onDone,
  onCreated,
}: {
  open: boolean;
  data: BootstrapData;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
  onCreated?: (id: string) => void;
}) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await projectService.create({
        ...Object.fromEntries(form.entries()),
        tags,
      });
      onOpenChange(false);
      await onDone(`项目 ${result.projectCode} 已创建`);
      onCreated?.(result.id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const tagOptions = ['数智签约', '信产签约', '权责项目', '确认欠费'];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-project-dialog max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>
            项目编码由系统自动生成，合同编码必须保持唯一。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="项目名称" required>
              <Input name="name" required placeholder="请输入项目全称" />
            </FormField>
            <FormField label="合同编码" required>
              <Input
                name="contractCode"
                required
                placeholder="例如 HT-2026-001"
              />
            </FormField>
            <FormField label="归属单位（三级）" required>
              <NativeSelect name="districtCode" className="w-full" required>
                {data.districts.map((district) => (
                  <NativeSelectOption key={district.id} value={district.code}>
                    {district.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="归属单位（四级）" required>
              <Input
                name="orgLevel4"
                required
                placeholder="例如 碑林政企客户团队"
              />
            </FormField>
            <FormField label="客户名称" required>
              <Input name="customerName" required />
            </FormField>
            <FormField label="客户类型" required>
              <NativeSelect name="customerType" className="w-full" required>
                {['政府', '企业', '中小微'].map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="客户对接人" required>
              <Input name="customerContact" required />
            </FormField>
            <FormField label="项目交付负责人" required>
              <Input name="deliveryOwner" required />
            </FormField>
            <FormField label="客户经理" required>
              <Input name="accountManager" required />
            </FormField>
            <FormField label="交付经理" required>
              <Input name="deliveryManager" required />
            </FormField>
            <FormField label="项目状态" required>
              <NativeSelect name="status" className="w-full" required>
                {['执行中', '验收中', '维保期', '已关闭'].map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="合同签订日期" required>
              <Input name="contractDate" type="date" required />
            </FormField>
            <FormField label="合同总金额（元）" required>
              <Input
                name="contractAmountYuan"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
              />
            </FormField>
            <FormField label="合同金额构成" required>
              <NativeSelect
                name="amountComposition"
                className="w-full"
                required
              >
                {['标品', 'ICT（税率6%）', 'ICT（税率13%）'].map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="付费编码">
              <Input name="billingCode" placeholder="可选" />
            </FormField>
            <FormField label="项目属性打标" className="md:col-span-2">
              <div className="app-selection-box">
                {tagOptions.map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={tags.includes(tag)}
                      onCheckedChange={(checked) =>
                        setTags((current) =>
                          checked
                            ? Array.from(new Set([...current, tag]))
                            : current.filter((item) => item !== tag),
                        )
                      }
                    />
                    {tag}
                  </label>
                ))}
              </div>
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
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
              创建项目
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
