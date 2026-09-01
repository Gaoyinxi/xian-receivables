'use client';

import * as React from 'react';
import {
  DataPanel,
  PageHeading,
  SearchField,
} from '@/components/receivables/design-system';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BootstrapData } from '@/lib/types';
import {
  formatDateTime,
  roleLabels,
  entityLabels,
  operationLabels,
} from '@/lib/presentation';

export function AuditView({ data }: { data: BootstrapData }) {
  const [query, setQuery] = React.useState('');
  const rows = data.auditLogs.filter((log) =>
    [
      log.entityId,
      log.actorName,
      log.reason,
      entityLabels[log.entityType],
      operationLabels[log.action],
      log.oldValue,
      log.newValue,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="审计日志"
        title="不可变更的操作记录"
        description={
          data.session.role === 'CITY_ADMIN'
            ? '当前可查看全市操作。'
            : `当前仅展示${data.session.districtName}操作。`
        }
      />
      <DataPanel
        title="操作流水"
        description={`匹配 ${rows.length} 条 · 展示权限范围内最近 300 条，完整日志持续保留`}
        actions={
          <SearchField
            value={query}
            onChange={setQuery}
            label="搜索操作人、记录编号或变更内容"
            placeholder="操作人 / 原因 / 变更内容"
            className="w-[280px]"
          />
        }
      >
        <Table aria-label="审计操作日志">
          <TableHeader>
            <TableRow className="app-table-head-row">
              <TableHead className="pl-5">时间</TableHead>
              <TableHead>区县</TableHead>
              <TableHead>实体</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>字段</TableHead>
              <TableHead>原值 → 新值</TableHead>
              <TableHead>原因 / 来源</TableHead>
              <TableHead className="pr-5">操作人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="lc-empty">
                  没有匹配的操作记录。请调整关键词；新增业务操作将自动留痕。
                </TableCell>
              </TableRow>
            )}
            {rows.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="pl-5 text-xs">
                  {formatDateTime(log.createdAt)}
                </TableCell>
                <TableCell className="text-xs">
                  {log.districtName || '市级'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {entityLabels[log.entityType] || log.entityType}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-medium">
                  {operationLabels[log.action] || log.action}
                </TableCell>
                <TableCell className="text-xs">
                  {log.fieldName || '—'}
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-primary">
                      查看完整变更
                    </summary>
                    <dl className="mt-2 space-y-2 whitespace-pre-wrap break-all">
                      <dt className="text-muted-foreground">记录 ID</dt>
                      <dd>{log.entityId}</dd>
                      <dt className="text-muted-foreground">原值</dt>
                      <dd>{log.oldValue || '—'}</dd>
                      <dt className="text-muted-foreground">新值</dt>
                      <dd>{log.newValue || '—'}</dd>
                    </dl>
                  </details>
                </TableCell>
                <TableCell>
                  <p className="max-w-[180px] whitespace-normal break-words text-xs">
                    {log.reason || '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {log.source}
                  </p>
                </TableCell>
                <TableCell className="pr-5">
                  <p className="text-xs">{log.actorName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {roleLabels[log.actorRole]}
                  </p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataPanel>
    </>
  );
}
