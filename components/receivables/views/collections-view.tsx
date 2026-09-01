'use client';

import { BellRing, Paperclip, Plus } from 'lucide-react';
import { DataPanel, PageHeading } from '@/components/receivables/design-system';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { BootstrapData, CollectionRecord } from '@/lib/types';
import { actionLabels } from '@/lib/presentation';

export function CollectionsView({
  data,
  onNew,
  onCorrect,
}: {
  data: BootstrapData;
  onNew: () => void;
  onCorrect: (record: CollectionRecord) => void;
}) {
  const canCorrect = data.session.role !== 'DISTRICT_OPERATOR';
  return (
    <>
      <PageHeading
        eyebrow="催缴中心"
        title="催缴时间线"
        description="所有动作只追加、不覆盖；正式函件必须上传留痕附件。"
        actions={
          <Button onClick={onNew}>
            <Plus /> 新增催缴
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <DataPanel
          title="全部催缴记录"
          description={`共 ${data.collections.length} 条`}
          contentClassName="px-5"
        >
          <ol className="app-timeline" aria-label="催缴记录时间线">
            {!data.collections.length && (
              <li className="lc-empty">
                尚无催缴记录。请进入项目，选择需要跟进的应收。
              </li>
            )}
            {data.collections.map((record) => (
              <li key={record.id} className="app-timeline-item">
                <div
                  aria-hidden="true"
                  className={cn(
                    'app-timeline-icon',
                    record.status === 'VOIDED' && 'is-voided',
                  )}
                >
                  <BellRing className="size-4" />
                </div>
                <div
                  className={cn(
                    'min-w-0 flex-1',
                    record.status === 'VOIDED' && 'opacity-55',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--app-text-strong)]">
                      {actionLabels[record.actionType]}
                    </span>
                    <Badge variant="outline">{record.districtName}</Badge>
                    {record.status === 'VOIDED' ? (
                      <Badge variant="destructive">已作废</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--app-text)]">
                    {record.projectName} · {record.receivableCode}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {record.note || '未填写补充说明'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{record.actionDate}</span>
                    <span>{record.createdByName}</span>
                    {record.attachmentId ? (
                      <a
                        href={`/api/attachments/${record.attachmentId}`}
                        className="app-inline-link"
                      >
                        <Paperclip className="size-3" />
                        {record.attachmentName}
                      </a>
                    ) : null}
                    {record.voidReason ? (
                      <span className="text-[var(--app-negative)]">
                        作废原因：{record.voidReason}
                      </span>
                    ) : null}
                  </div>
                </div>
                {canCorrect && record.status === 'VALID' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCorrect(record)}
                  >
                    更正
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </DataPanel>
        <Card className="app-panel h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">合规提示</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 text-xs leading-5 text-muted-foreground">
            <div className="app-callout" data-tone="warning">
              催收函、律师函、诉讼函提交时必须上传 PDF、JPG 或 PNG。
            </div>
            <div className="app-callout" data-tone="info">
              法律风险以最近有效催缴日期计算；作废记录不会影响风险，但仍保留审计证据。
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
