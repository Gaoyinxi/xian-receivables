'use client';
import { riskService } from '@/services/operations';

import * as React from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import {
  ErrorText,
  FormField,
  PageHeading,
} from '@/components/receivables/design-system';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BootstrapData } from '@/lib/types';
import { formatDateTime } from '@/lib/presentation';

export function RiskView({
  data,
  onDone,
  embedded = false,
}: {
  data: BootstrapData;
  onDone: (message: string) => Promise<void>;
  embedded?: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const rules = data.riskRules;
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await riskService.update(Object.fromEntries(form.entries()));
      await onDone('风险阈值已更新，并写入审计日志');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!embedded && (
        <PageHeading
          eyebrow="风险设置"
          title="逾期与法律风险阈值"
          description="修改规则会立即影响所有未结清应收，并永久记录修改原因。"
        />
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,720px)_1fr]">
        <Card className="app-panel">
          <CardHeader>
            <CardTitle>规则参数</CardTitle>
            <CardDescription>
              {data.session.role === 'CITY_ADMIN'
                ? '市级管理员可调整'
                : '当前身份仅可查看'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <fieldset className="app-form-section">
                <legend className="mb-3 text-sm font-medium">
                  逾期风险（天）
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label="蓝色起始">
                    <Input
                      name="blueMinDays"
                      type="number"
                      min={1}
                      defaultValue={rules.blueMinDays}
                      disabled={data.session.role !== 'CITY_ADMIN'}
                    />
                  </FormField>
                  <FormField label="黄色起始">
                    <Input
                      name="yellowMinDays"
                      type="number"
                      min={2}
                      defaultValue={rules.yellowMinDays}
                      disabled={data.session.role !== 'CITY_ADMIN'}
                    />
                  </FormField>
                  <FormField label="红色起始">
                    <Input
                      name="redMinDays"
                      type="number"
                      min={3}
                      defaultValue={rules.redMinDays}
                      disabled={data.session.role !== 'CITY_ADMIN'}
                    />
                  </FormField>
                </div>
              </fieldset>
              <fieldset className="app-form-section">
                <legend className="mb-3 text-sm font-medium">
                  法律风险起始（月）
                </legend>
                <div className="grid gap-3 sm:grid-cols-5">
                  {[
                    [
                      '五级',
                      'legalLevel5MinMonths',
                      rules.legalLevel5MinMonths,
                    ],
                    [
                      '四级',
                      'legalLevel4MinMonths',
                      rules.legalLevel4MinMonths,
                    ],
                    [
                      '三级',
                      'legalLevel3MinMonths',
                      rules.legalLevel3MinMonths,
                    ],
                    [
                      '二级',
                      'legalLevel2MinMonths',
                      rules.legalLevel2MinMonths,
                    ],
                    [
                      '一级',
                      'legalLevel1MinMonths',
                      rules.legalLevel1MinMonths,
                    ],
                  ].map(([label, name, value]) => (
                    <FormField key={String(name)} label={String(label)}>
                      <Input
                        name={String(name)}
                        type="number"
                        min={1}
                        defaultValue={Number(value)}
                        disabled={data.session.role !== 'CITY_ADMIN'}
                      />
                    </FormField>
                  ))}
                </div>
              </fieldset>
              {data.session.role === 'CITY_ADMIN' ? (
                <FormField label="修改原因" required>
                  <Textarea
                    name="reason"
                    required
                    placeholder="例如：根据最新省公司应收管理规则调整"
                  />
                </FormField>
              ) : null}
              <ErrorText error={error} />
              {data.session.role === 'CITY_ADMIN' ? (
                <Button type="submit" disabled={busy} aria-busy={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                  保存规则
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>
        <Card className="app-panel h-fit">
          <CardHeader>
            <CardTitle>当前映射</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="app-callout" data-tone="info">
              蓝色：{rules.blueMinDays}–{rules.yellowMinDays - 1} 天
            </div>
            <div className="app-callout" data-tone="warning">
              黄色：{rules.yellowMinDays}–{rules.redMinDays - 1} 天
            </div>
            <div className="app-callout" data-tone="danger">
              红色：{rules.redMinDays} 天及以上
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              最近更新：{rules.updatedBy} · {formatDateTime(rules.updatedAt)}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
