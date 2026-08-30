import { getRawDb } from '@/db/index';

import {
  addCalendarDays,
  canCreateOperationalRecord,
  canManageProject,
  canManageReceivable,
  isIsoDate,
  yuanToCents,
} from '../domain';
import type {
  BaselineEvent,
  DemoSession,
  ImportKind,
  PaymentType,
  RowError,
} from '../types';

export interface ValidatedImport {
  validRows: Array<Record<string, unknown>>;
  rowErrors: RowError[];
}

const PAYMENT_TYPES = new Set<PaymentType>([
  '预付款',
  '进度款',
  '初验款',
  '终验款',
  '质保金',
]);
const CUSTOMER_TYPES = new Set(['政府', '企业', '中小微']);
const PROJECT_STATUSES = new Set(['执行中', '验收中', '维保期', '已关闭']);
const AMOUNT_COMPOSITIONS = new Set([
  '标品',
  'ICT（税率6%）',
  'ICT（税率13%）',
]);
const TAGS = new Set(['数智签约', '信产签约', '权责项目', '确认欠费']);
const BASELINE_EVENTS: Record<string, BaselineEvent> = {
  签约: 'SIGNING',
  开票: 'INVOICE',
  初验: 'PRE_ACCEPTANCE',
  终验: 'FINAL_ACCEPTANCE',
  其他: 'OTHER',
  SIGNING: 'SIGNING',
  INVOICE: 'INVOICE',
  PRE_ACCEPTANCE: 'PRE_ACCEPTANCE',
  FINAL_ACCEPTANCE: 'FINAL_ACCEPTANCE',
  OTHER: 'OTHER',
};

function value(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

function textValue(row: Record<string, unknown>, key: string): string {
  const raw = value(row, key);
  if (typeof raw === 'string') return raw.trim();
  if (
    typeof raw === 'number' ||
    typeof raw === 'bigint' ||
    typeof raw === 'boolean'
  ) {
    return String(raw).trim();
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }
  return '';
}

function normalizedDate(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const milliseconds = Math.round((raw - 25569) * 86_400_000);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replaceAll('/', '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return isIsoDate(date) ? date : null;
}

function rowError(
  row: number,
  code: string,
  message: string,
  fields?: string[],
): RowError {
  return { row, code, message, ...(fields ? { fields } : {}) };
}

async function districtMaps() {
  const rows = await getRawDb()
    .prepare('SELECT id, code, name FROM districts')
    .all<{ id: string; code: string; name: string }>();
  return new Map(
    rows.results.flatMap((district) => [
      [district.code, district],
      [district.name, district],
      [district.name.replace(/区$/, ''), district],
    ]),
  );
}

async function validateProjectRows(
  rows: Array<Record<string, unknown>>,
  session: DemoSession,
): Promise<ValidatedImport> {
  if (!canManageProject(session.role)) {
    return {
      validRows: [],
      rowErrors: rows.map((_, index) =>
        rowError(index + 2, 'FORBIDDEN', '仅市级管理员可导入项目主表'),
      ),
    };
  }

  const districts = await districtMaps();
  const existing = await getRawDb()
    .prepare('SELECT contract_code AS contractCode FROM projects')
    .all<{ contractCode: string }>();
  const knownContracts = new Set(existing.results.map((item) => item.contractCode));
  const seenContracts = new Set<string>();
  const validRows: Array<Record<string, unknown>> = [];
  const rowErrors: RowError[] = [];

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const required = [
      '项目名称',
      '合同编码',
      '归属单位（三级）',
      '归属单位（四级）',
      '客户名称',
      '客户类型',
      '客户对接人',
      '项目交付负责人',
      '客户经理',
      '交付经理',
      '项目状态',
      '合同签订日期',
      '合同总金额（含税）',
      '合同金额构成',
    ];
    const missing = required.filter((field) => !textValue(row, field));
    if (missing.length) {
      rowErrors.push(
        rowError(
          excelRow,
          'MISSING_FIELDS',
          `缺少必填字段：${missing.join('、')}`,
          missing,
        ),
      );
      return;
    }

    const contractCode = textValue(row, '合同编码');
    if (knownContracts.has(contractCode) || seenContracts.has(contractCode)) {
      rowErrors.push(
        rowError(excelRow, 'DUPLICATE_CONTRACT', '合同编码已存在，请检查', [
          '合同编码',
        ]),
      );
      return;
    }
    const district = districts.get(textValue(row, '归属单位（三级）'));
    if (!district) {
      rowErrors.push(
        rowError(excelRow, 'UNKNOWN_DISTRICT', '归属单位必须为碑林、雁塔或莲湖', [
          '归属单位（三级）',
        ]),
      );
      return;
    }
    const customerType = textValue(row, '客户类型');
    if (!CUSTOMER_TYPES.has(customerType)) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_CUSTOMER_TYPE', '客户类型无效', ['客户类型']),
      );
      return;
    }
    const status = textValue(row, '项目状态');
    if (!PROJECT_STATUSES.has(status)) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_PROJECT_STATUS', '项目状态无效', ['项目状态']),
      );
      return;
    }
    const contractDate = normalizedDate(value(row, '合同签订日期'));
    if (!contractDate) {
      rowErrors.push(
        rowError(
          excelRow,
          'INVALID_DATE',
          '合同签订日期格式应为 YYYY-MM-DD',
          ['合同签订日期'],
        ),
      );
      return;
    }
    const contractAmountCents = yuanToCents(value(row, '合同总金额（含税）'));
    if (!contractAmountCents) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_AMOUNT', '合同总金额必须大于0且最多两位小数', [
          '合同总金额（含税）',
        ]),
      );
      return;
    }
    const amountComposition = textValue(row, '合同金额构成')
      .replace(/^\d+[.、]\s*/, '')
      .replace('ICT（税率 6%）', 'ICT（税率6%）')
      .replace('ICT（税率 13%）', 'ICT（税率13%）');
    if (!AMOUNT_COMPOSITIONS.has(amountComposition)) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_AMOUNT_COMPOSITION', '合同金额构成无效', [
          '合同金额构成',
        ]),
      );
      return;
    }
    const tags = textValue(row, '项目属性打标')
      .split(/[、,，/]/)
      .map((item) => item.trim())
      .filter((item) => TAGS.has(item));

    seenContracts.add(contractCode);
    validRows.push({
      sourceRow: excelRow,
      name: textValue(row, '项目名称'),
      contractCode,
      tags,
      districtId: district.id,
      districtCode: district.code,
      orgLevel4: textValue(row, '归属单位（四级）'),
      customerName: textValue(row, '客户名称'),
      customerType,
      customerContact: textValue(row, '客户对接人'),
      deliveryOwner: textValue(row, '项目交付负责人'),
      accountManager: textValue(row, '客户经理'),
      deliveryManager: textValue(row, '交付经理'),
      status,
      contractDate,
      contractAmountCents,
      amountComposition,
      billingCode: textValue(row, '付费编码') || null,
    });
  });

  return { validRows, rowErrors };
}

async function validateReceivableRows(
  rows: Array<Record<string, unknown>>,
  session: DemoSession,
): Promise<ValidatedImport> {
  const projects = await getRawDb()
    .prepare(
      `SELECT id, project_code AS projectCode, district_id AS districtId,
        contract_date AS contractDate FROM projects`,
    )
    .all<{
      id: string;
      projectCode: string;
      districtId: string;
      contractDate: string;
    }>();
  const projectMap = new Map(projects.results.map((item) => [item.projectCode, item]));
  const existing = await getRawDb()
    .prepare('SELECT project_id AS projectId, sequence_no AS sequenceNo FROM receivables')
    .all<{ projectId: string; sequenceNo: number }>();
  const existingKeys = new Set(
    existing.results.map((item) => `${item.projectId}:${item.sequenceNo}`),
  );
  const seenKeys = new Set<string>();
  const validRows: Array<Record<string, unknown>> = [];
  const rowErrors: RowError[] = [];

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const projectCode = textValue(row, '项目编码');
    const project = projectMap.get(projectCode);
    if (!project) {
      rowErrors.push(
        rowError(excelRow, 'UNKNOWN_PROJECT', '未找到项目编码', ['项目编码']),
      );
      return;
    }
    if (
      !canManageReceivable(session.role, session.districtId, project.districtId)
    ) {
      rowErrors.push(
        rowError(excelRow, 'FORBIDDEN', '无权导入该区县的付款节点'),
      );
      return;
    }
    const sequenceNo = Number(value(row, '节点序号'));
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_SEQUENCE', '节点序号必须为大于0的整数', [
          '节点序号',
        ]),
      );
      return;
    }
    const key = `${project.id}:${sequenceNo}`;
    if (existingKeys.has(key) || seenKeys.has(key)) {
      rowErrors.push(
        rowError(excelRow, 'DUPLICATE_NODE', '该项目的节点序号已存在', ['节点序号']),
      );
      return;
    }
    const paymentType = textValue(row, '款项类型') as PaymentType;
    if (!PAYMENT_TYPES.has(paymentType)) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_PAYMENT_TYPE', '款项类型无效', ['款项类型']),
      );
      return;
    }
    const amountCents = yuanToCents(value(row, '节点金额'));
    if (!amountCents) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_AMOUNT', '节点金额必须大于0且最多两位小数', [
          '节点金额',
        ]),
      );
      return;
    }
    const paymentCondition = textValue(row, '付款条件');
    if (!paymentCondition) {
      rowErrors.push(
        rowError(excelRow, 'MISSING_CONDITION', '请填写付款条件', ['付款条件']),
      );
      return;
    }
    const baselineEvent = BASELINE_EVENTS[textValue(row, '基准事件')];
    if (!baselineEvent) {
      rowErrors.push(
        rowError(
          excelRow,
          'INVALID_BASELINE_EVENT',
          '基准事件必须为签约、开票、初验、终验或其他',
          ['基准事件'],
        ),
      );
      return;
    }
    const baselineDate = normalizedDate(value(row, '基准日期'));
    if (!baselineDate) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_DATE', '基准日期格式应为 YYYY-MM-DD', [
          '基准日期',
        ]),
      );
      return;
    }
    const termDays = Number(value(row, '账期天数'));
    if (!Number.isInteger(termDays) || termDays < 0 || termDays > 3650) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_TERM', '账期天数必须为0至3650的整数', [
          '账期天数',
        ]),
      );
      return;
    }
    const dueDate = addCalendarDays(baselineDate, termDays);
    if (dueDate < project.contractDate) {
      rowErrors.push(
        rowError(
          excelRow,
          'DUE_BEFORE_CONTRACT',
          '约定付款日期不能早于合同签订日期',
          ['基准日期', '账期天数'],
        ),
      );
      return;
    }
    seenKeys.add(key);
    validRows.push({
      sourceRow: excelRow,
      projectId: project.id,
      projectCode,
      districtId: project.districtId,
      sequenceNo,
      paymentType,
      amountCents,
      paymentCondition,
      baselineEvent,
      baselineDate,
      termDays,
      dueDate,
    });
  });
  return { validRows, rowErrors };
}

async function validateReceiptRows(
  rows: Array<Record<string, unknown>>,
  session: DemoSession,
): Promise<ValidatedImport> {
  const receivables = await getRawDb()
    .prepare(
      `SELECT r.id, r.receivable_code AS receivableCode,
        r.amount_cents AS amountCents,
        r.confirmation_status AS confirmationStatus,
        p.district_id AS districtId,
        COALESCE(SUM(CASE WHEN rr.status = 'VALID' THEN rr.amount_cents ELSE 0 END), 0)
          AS receivedAmountCents
      FROM receivables r
      JOIN projects p ON p.id = r.project_id
      LEFT JOIN receipts rr ON rr.receivable_id = r.id
      GROUP BY r.id`,
    )
    .all<{
      id: string;
      receivableCode: string;
      amountCents: number;
      confirmationStatus: string;
      districtId: string;
      receivedAmountCents: number;
    }>();
  const receivableMap = new Map(
    receivables.results.map((item) => [item.receivableCode, item]),
  );
  const pendingAmounts = new Map<string, number>();
  const validRows: Array<Record<string, unknown>> = [];
  const rowErrors: RowError[] = [];

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const receivableCode = textValue(row, '应收编号');
    const receivable = receivableMap.get(receivableCode);
    if (!receivable) {
      rowErrors.push(
        rowError(excelRow, 'UNKNOWN_RECEIVABLE', '未找到应收编号', ['应收编号']),
      );
      return;
    }
    if (
      !canCreateOperationalRecord(
        session.role,
        session.districtId,
        receivable.districtId,
      )
    ) {
      rowErrors.push(
        rowError(excelRow, 'FORBIDDEN', '无权导入该区县的回款'),
      );
      return;
    }
    if (receivable.confirmationStatus !== 'CONFIRMED') {
      rowErrors.push(
        rowError(excelRow, 'RECEIVABLE_DRAFT', '应收金额待确认，暂不可填报回款'),
      );
      return;
    }
    const amountCents = yuanToCents(value(row, '实收金额'));
    if (!amountCents) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_AMOUNT', '实收金额必须大于0且最多两位小数', [
          '实收金额',
        ]),
      );
      return;
    }
    const receivedDate = normalizedDate(value(row, '实收日期'));
    if (!receivedDate) {
      rowErrors.push(
        rowError(excelRow, 'INVALID_DATE', '实收日期格式应为 YYYY-MM-DD', [
          '实收日期',
        ]),
      );
      return;
    }
    const pending = pendingAmounts.get(receivable.id) ?? 0;
    const total =
      Number(receivable.receivedAmountCents) + pending + amountCents;
    if (total > Number(receivable.amountCents)) {
      rowErrors.push(
        rowError(excelRow, 'OVERPAYMENT', '已回款金额超过应收金额，请确认', [
          '实收金额',
        ]),
      );
      return;
    }
    pendingAmounts.set(receivable.id, pending + amountCents);
    validRows.push({
      sourceRow: excelRow,
      receivableId: receivable.id,
      receivableCode,
      districtId: receivable.districtId,
      amountCents,
      receivedDate,
      note: textValue(row, '备注') || null,
    });
  });
  return { validRows, rowErrors };
}

export async function validateImportRows(
  kind: ImportKind,
  rows: Array<Record<string, unknown>>,
  session: DemoSession,
): Promise<ValidatedImport> {
  if (kind === 'PROJECT') return validateProjectRows(rows, session);
  if (kind === 'RECEIVABLE') return validateReceivableRows(rows, session);
  return validateReceiptRows(rows, session);
}
