import type { ReceivableRecord } from './types';

export const RECEIVABLE_FILTERS = {
  ALL: '全部应收',
  DRAFT: '待确认',
  OUTSTANDING: '待回款',
  UNPAID: '未回款',
  PARTIAL: '部分回款',
  OVERDUE: '已逾期',
  UNCOLLECTED: '逾期未留痕',
  PAID: '已结清',
  RED: '红色风险',
  YELLOW: '黄色风险',
  BLUE: '蓝色风险',
} as const;

export type ReceivableFilter = keyof typeof RECEIVABLE_FILTERS;

export function filterReceivables(
  rows: ReceivableRecord[],
  {
    query = '',
    status = 'ALL',
    districtId = '',
  }: {
    query?: string;
    status?: ReceivableFilter;
    districtId?: string;
  } = {},
): ReceivableRecord[] {
  const search = query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (districtId && row.districtId !== districtId) return false;
    if (
      ![row.receivableCode, row.projectCode, row.projectName, row.contractCode]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search)
    )
      return false;
    if (status === 'ALL') return true;
    if (status === 'DRAFT') return row.confirmationStatus === 'DRAFT';
    if (row.confirmationStatus !== 'CONFIRMED') return false;
    if (status === 'OUTSTANDING') return row.remainingAmountCents > 0;
    if (status === 'OVERDUE') return row.overdueDays > 0;
    if (status === 'UNCOLLECTED') return row.collectionMissing;
    return row.writeoffStatus === status || row.riskLevel === status;
  });
}

// Quote every cell and neutralize spreadsheet formulas, including leading whitespace.
export function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function receivablesCsv(rows: ReceivableRecord[]): string {
  const headers = [
    '应收编号',
    '项目编码',
    '项目名称',
    '合同编码',
    '区县',
    '款项',
    '应收金额（元）',
    '已收金额（元）',
    '剩余金额（元）',
    '约定付款日',
    '确认状态',
    '核销状态',
    '逾期天数',
    '最近催缴日期',
  ];
  const states = { UNPAID: '未回款', PARTIAL: '部分回款', PAID: '已结清' };
  const lines: Array<Array<string | number>> = [
    headers,
    ...rows.map((row) => [
      row.receivableCode,
      row.projectCode,
      row.projectName,
      row.contractCode,
      row.districtName,
      row.paymentType,
      (row.amountCents / 100).toFixed(2),
      (row.receivedAmountCents / 100).toFixed(2),
      (row.remainingAmountCents / 100).toFixed(2),
      row.dueDate,
      row.confirmationStatus === 'DRAFT' ? '待确认' : '已确认',
      states[row.writeoffStatus],
      row.confirmationStatus === 'DRAFT' ? '' : row.overdueDays,
      row.latestCollectionDate ?? '',
    ]),
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
