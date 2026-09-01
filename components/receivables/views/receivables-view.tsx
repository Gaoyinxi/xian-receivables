'use client';

import * as React from 'react';
import {
  filterReceivables,
  receivablesCsv,
  RECEIVABLE_FILTERS,
  type ReceivableFilter,
} from '@/lib/workbench';
import { Check, Download, LoaderCircle, Plus } from 'lucide-react';
import {
  DataPanel,
  EmptyState,
  PageHeading,
  RiskBadge,
  SearchField,
  WriteoffBadge,
} from '@/components/receivables/design-system';
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
import type { BootstrapData, ReceivableRecord } from '@/lib/types';
import { formatYuan, currentDate, actionLabels } from '@/lib/presentation';

export function ReceivableTable({
  rows,
  compact,
  onConfirm,
  confirmingId,
  onSelect,
}: {
  rows: ReceivableRecord[];
  compact?: boolean;
  onConfirm?: (id: string) => void;
  confirmingId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <Table aria-label={compact ? '高风险应收事项' : '应收明细'}>
      <TableHeader>
        <TableRow className="app-table-head-row">
          <TableHead className="pl-5">应收编号 / 项目</TableHead>
          <TableHead>区县</TableHead>
          <TableHead>款项</TableHead>
          <TableHead className="text-right">应收 / 已收</TableHead>
          <TableHead>付款日</TableHead>
          <TableHead>风险</TableHead>
          {!compact ? <TableHead>法律风险</TableHead> : null}
          <TableHead>核销</TableHead>
          {!compact ? <TableHead className="pr-5">操作</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="py-3 pl-5">
              {onSelect ? (
                <button
                  type="button"
                  className="app-data-title app-table-link"
                  onClick={() => onSelect(item.id)}
                  aria-label={`查看${item.projectName} ${item.receivableCode}详情`}
                >
                  {item.projectName}
                </button>
              ) : (
                <p className="app-data-title">{item.projectName}</p>
              )}
              <p className="app-data-code">{item.receivableCode}</p>
            </TableCell>
            <TableCell className="text-xs">{item.districtName}</TableCell>
            <TableCell className="text-xs">{item.paymentType}</TableCell>
            <TableCell className="text-right">
              <p className="text-xs font-semibold">
                {formatYuan(item.amountCents)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                已收 {formatYuan(item.receivedAmountCents)}
              </p>
            </TableCell>
            <TableCell className="text-xs">{item.dueDate}</TableCell>
            <TableCell>
              <RiskBadge item={item} />
            </TableCell>
            {!compact ? (
              <TableCell>
                {item.legalRiskLevel ? (
                  <Badge variant="outline">{item.legalRiskLevel}级</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            ) : null}
            <TableCell>
              <WriteoffBadge status={item.writeoffStatus} />
            </TableCell>
            {!compact ? (
              <TableCell className="pr-5">
                {item.confirmationStatus === 'DRAFT' && onConfirm ? (
                  <Button
                    size="sm"
                    disabled={Boolean(confirmingId)}
                    aria-busy={confirmingId === item.id}
                    onClick={() => onConfirm(item.id)}
                  >
                    {confirmingId === item.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Check />
                    )}{' '}
                    确认
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {item.latestCollectionDate
                      ? `${item.latestCollectionDate.slice(5)} ${
                          actionLabels[item.latestCollectionAction!]
                        }`
                      : '—'}
                  </span>
                )}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ReceivablesView({
  data,
  onConfirm,
  onNewNode,
  status,
  onStatusChange,
  onSelect,
  confirmingId,
}: {
  data: BootstrapData;
  onConfirm: (id: string) => void;
  onNewNode: () => void;
  status: ReceivableFilter;
  onStatusChange: (status: ReceivableFilter) => void;
  onSelect: (id: string) => void;
  confirmingId: string | null;
}) {
  const [query, setQuery] = React.useState('');
  const [districtId, setDistrictId] = React.useState('');
  const rows = filterReceivables(data.receivables, {
    query,
    status,
    districtId,
  });
  const balance = rows.reduce((sum, row) => sum + row.remainingAmountCents, 0);

  function downloadRows() {
    const url = URL.createObjectURL(
      new Blob([receivablesCsv(rows)], { type: 'text/csv;charset=utf-8;' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `应收台账-${RECEIVABLE_FILTERS[status]}-${currentDate()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <PageHeading
        eyebrow="应收管理"
        title="应收节点与风险"
        description="待确认应收不能登记回款；风险和核销状态由系统自动计算。"
        actions={
          data.session.role !== 'DISTRICT_OPERATOR' ? (
            <Button onClick={onNewNode}>
              <Plus /> 新增付款节点
            </Button>
          ) : null
        }
      />
      <DataPanel
        title="应收明细"
        description={`共 ${rows.length} 笔 · 筛选余额 ${formatYuan(balance)}（含待确认）`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="应收编号 / 项目 / 合同"
              label="搜索应收编号、项目或合同"
              className="w-[240px]"
            />
            <NativeSelect
              aria-label="按应收状态筛选"
              value={status}
              onChange={(e) =>
                onStatusChange(e.target.value as ReceivableFilter)
              }
            >
              {Object.entries(RECEIVABLE_FILTERS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {data.session.role === 'CITY_ADMIN' ? (
              <NativeSelect
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
                aria-label="按归属区县筛选"
              >
                <NativeSelectOption value="">全部区县</NativeSelectOption>
                {data.districts.map((district) => (
                  <NativeSelectOption key={district.id} value={district.id}>
                    {district.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length}
              onClick={downloadRows}
            >
              <Download />
              导出台账
            </Button>
          </>
        }
      >
        {rows.length ? (
          <ReceivableTable
            rows={rows}
            onSelect={onSelect}
            confirmingId={confirmingId}
            onConfirm={
              data.session.role === 'CITY_ADMIN' ? onConfirm : undefined
            }
          />
        ) : (
          <EmptyState
            title="没有匹配的应收"
            description="请调整搜索词或筛选状态。"
          />
        )}
      </DataPanel>
    </>
  );
}
