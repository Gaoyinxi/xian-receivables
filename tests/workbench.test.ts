import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell, filterReceivables, receivablesCsv } from '../lib/workbench';
import type { ReceivableRecord } from '../lib/types';

const sample: ReceivableRecord = {
  id: 'one',
  receivableCode: 'YS-TEST-0001',
  projectId: 'project',
  projectCode: 'XM-TEST-0001',
  projectName: '匿名项目',
  contractCode: 'HT-001',
  districtId: 'a',
  districtCode: 'A',
  districtName: '甲区',
  sequenceNo: 1,
  paymentType: '进度款',
  amountCents: 12345,
  receivedAmountCents: 10000,
  remainingAmountCents: 2345,
  paymentCondition: '验收后付款',
  baselineEvent: 'SIGNING',
  baselineDate: '2026-01-01',
  termDays: 30,
  dueDate: '2026-01-31',
  acceptanceType: null,
  acceptanceDate: null,
  invoiceStatus: null,
  invoiceDeliveredDate: null,
  overdueReason: null,
  confirmationStatus: 'CONFIRMED',
  writeoffStatus: 'PARTIAL',
  overdueDays: 31,
  riskLevel: 'YELLOW',
  legalRiskLevel: 5,
  latestCollectionDate: null,
  latestCollectionAction: null,
  collectionMissing: true,
  createdAt: '2026-01-01T00:00:00Z',
};

void test('工作台指标筛选不把待确认应收计入待回款或催缴', () => {
  const draft: ReceivableRecord = {
    ...sample,
    id: 'draft',
    confirmationStatus: 'DRAFT',
    writeoffStatus: 'UNPAID',
  };
  const paid: ReceivableRecord = {
    ...sample,
    id: 'paid',
    writeoffStatus: 'PAID',
    remainingAmountCents: 0,
    overdueDays: 0,
    collectionMissing: false,
  };
  const rows = [sample, draft, paid];
  assert.deepEqual(
    filterReceivables(rows, { status: 'DRAFT' }).map((row) => row.id),
    ['draft'],
  );
  for (const status of [
    'OUTSTANDING',
    'UNCOLLECTED',
    'OVERDUE',
    'PARTIAL',
  ] as const) {
    assert.deepEqual(
      filterReceivables(rows, { status }).map((row) => row.id),
      ['one'],
    );
  }
  assert.deepEqual(
    filterReceivables(rows, { status: 'PAID' }).map((row) => row.id),
    ['paid'],
  );
});

void test('明细筛选支持区县、项目编码与忽略首尾空格', () => {
  assert.equal(
    filterReceivables([sample], { query: ' xm-test-0001 ', districtId: 'a' })
      .length,
    1,
  );
  assert.equal(filterReceivables([sample], { districtId: 'other' }).length, 0);
  assert.equal(filterReceivables([sample], { query: '不存在' }).length, 0);
});

void test('导出台账保留分精度、中文BOM，并防止电子表格公式注入', () => {
  const csv = receivablesCsv([
    { ...sample, projectName: '=HYPERLINK("https://example.test")' },
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"123.45","100.00","23.45"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.equal(csvCell('  +1'), '"\'  +1"');
  assert.equal(csvCell('包含,逗号\n和换行'), '"包含,逗号\n和换行"');
});
