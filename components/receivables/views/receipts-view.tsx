'use client';

import * as React from 'react';
import { Paperclip, PencilLine, Plus } from 'lucide-react';
import { DataPanel, PageHeading } from '@/components/receivables/design-system';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { BootstrapData, ReceiptRecord } from '@/lib/types';
import { formatYuan, formatDateTime } from '@/lib/presentation';

export function ReceiptsView({
  data,
  onNew,
  onCorrect,
}: {
  data: BootstrapData;
  onNew: () => void;
  onCorrect: (record: ReceiptRecord) => void;
}) {
  const [status, setStatus] = React.useState('ALL');
  const rows = data.receipts.filter(
    (item) => status === 'ALL' || item.status === status,
  );
  const canCorrect = data.session.role !== 'DISTRICT_OPERATOR';
  return (
    <>
      <PageHeading
        eyebrow="回款流水"
        title="实际到账记录"
        description="一条应收可对应多笔实收；错误记录通过作废并追加更正保留证据。"
        actions={
          <Button onClick={onNew}>
            <Plus /> 登记回款
          </Button>
        }
      />
      <DataPanel
        title="回款流水"
        description={`共 ${rows.length} 条记录`}
        actions={
          <NativeSelect
            aria-label="按回款记录状态筛选"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <NativeSelectOption value="ALL">全部记录</NativeSelectOption>
            <NativeSelectOption value="VALID">有效</NativeSelectOption>
            <NativeSelectOption value="VOIDED">已作废</NativeSelectOption>
          </NativeSelect>
        }
      >
        <Table aria-label="回款流水记录">
          <TableHeader>
            <TableRow className="app-table-head-row">
              <TableHead className="pl-5">应收 / 项目</TableHead>
              <TableHead>区县</TableHead>
              <TableHead className="text-right">实收金额</TableHead>
              <TableHead>到账日期</TableHead>
              <TableHead>凭证</TableHead>
              <TableHead>录入信息</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="pr-5">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="lc-empty">
                  暂无回款记录。可在项目工作台选择已确认的应收后登记。
                </TableCell>
              </TableRow>
            )}
            {rows.map((record) => (
              <TableRow
                key={record.id}
                className={cn(record.status === 'VOIDED' && 'opacity-55')}
              >
                <TableCell className="pl-5">
                  <p className="text-xs font-medium">{record.projectName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {record.receivableCode}
                  </p>
                </TableCell>
                <TableCell className="text-xs">{record.districtName}</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  {formatYuan(record.amountCents)}
                </TableCell>
                <TableCell className="text-xs">{record.receivedDate}</TableCell>
                <TableCell>
                  {record.attachmentId ? (
                    <a
                      href={`/api/attachments/${record.attachmentId}`}
                      className="app-inline-link"
                    >
                      <Paperclip className="size-3.5" />
                      {record.attachmentName}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <p className="text-xs">{record.createdByName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateTime(record.createdAt)}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      record.status === 'VALID' ? 'secondary' : 'outline'
                    }
                  >
                    {record.status === 'VALID' ? '有效' : '已作废'}
                  </Badge>
                  {record.voidReason ? (
                    <p className="mt-1 max-w-40 truncate text-[10px] text-[var(--app-negative)]">
                      {record.voidReason}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="pr-5">
                  {canCorrect && record.status === 'VALID' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCorrect(record)}
                    >
                      <PencilLine /> 更正
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataPanel>
    </>
  );
}
