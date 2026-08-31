import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectWorkspace } from '../components/receivables/project-workspace';
import { BusinessCockpit } from '../components/receivables/business-cockpit';
import { DEFAULT_RISK_RULES } from '../lib/domain';
import {
  buildPortfolio,
  buildTaskQueue,
  nextForNode,
  needsFollowup,
  projectMatchesStage,
  shanghaiDate,
} from '../lib/project-lifecycle';
import {
  contextualCandidates,
  parseWorkspaceHash,
  projectHash,
  PROJECT_SECTIONS,
  type ProjectSection,
} from '../lib/project-navigation';
import { lifecycleSteps, projectEvents } from '../lib/project-activity';
import type {
  BootstrapData,
  ProjectRecord,
  ReceivableRecord,
  ReceiptRecord,
} from '../lib/types';

const today = '2026-08-31';
const project: ProjectRecord = {
  id: 'p',
  projectCode: 'XM-1',
  name: '测试项目',
  contractCode: 'HT-1',
  tags: [],
  districtId: 'd',
  districtCode: 'D',
  districtName: '测试区',
  orgLevel4: '团队',
  customerName: '匿名客户',
  customerType: '企业',
  customerContact: '联系人',
  deliveryOwner: '交付负责人',
  accountManager: '客户经理',
  deliveryManager: '交付经理',
  status: '执行中',
  contractDate: '2026-01-01',
  contractAmountCents: 100000,
  amountComposition: '标品',
  billingCode: null,
  archivedAt: null,
  receivableCount: 0,
  receivableAmountCents: 0,
  receivedAmountCents: 0,
  createdAt: '2026-01-01T00:00:00Z',
};
const node = (overrides: Partial<ReceivableRecord> = {}): ReceivableRecord => ({
  id: 'r',
  receivableCode: 'YS-1',
  projectId: 'p',
  projectCode: 'XM-1',
  projectName: '测试项目',
  contractCode: 'HT-1',
  districtId: 'd',
  districtCode: 'D',
  districtName: '测试区',
  sequenceNo: 1,
  paymentType: '进度款',
  amountCents: 80000,
  receivedAmountCents: 0,
  remainingAmountCents: 80000,
  paymentCondition: '按期支付',
  baselineEvent: 'SIGNING',
  baselineDate: '2026-01-01',
  termDays: 30,
  dueDate: '2026-08-01',
  acceptanceType: null,
  acceptanceDate: null,
  invoiceStatus: null,
  invoiceDeliveredDate: null,
  overdueReason: null,
  confirmationStatus: 'CONFIRMED',
  writeoffStatus: 'UNPAID',
  overdueDays: 30,
  riskLevel: 'YELLOW',
  legalRiskLevel: 6,
  latestCollectionDate: null,
  latestCollectionAction: null,
  collectionMissing: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});
const receipt = (overrides: Partial<ReceiptRecord> = {}): ReceiptRecord => ({
  id: 'rr',
  receivableId: 'r',
  receivableCode: 'YS-1',
  projectName: '测试项目',
  districtId: 'd',
  districtName: '测试区',
  amountCents: 30000,
  receivedDate: today,
  note: null,
  attachmentId: null,
  attachmentName: null,
  status: 'VALID',
  voidReason: null,
  correctionOfId: null,
  createdByName: '测试操作人',
  createdAt: `${today}T01:00:00Z`,
  voidedAt: null,
  ...overrides,
});
const fixture = (
  nodes: ReceivableRecord[],
  receipts: ReceiptRecord[] = [],
): BootstrapData => ({
  businessDate: today,
  session: {
    id: 'u',
    role: 'CITY_ADMIN',
    districtId: null,
    districtCode: null,
    districtName: null,
    displayName: '测试管理员',
  },
  districts: [],
  projects: [project],
  receivables: nodes,
  receipts,
  collections: [],
  attachments: [],
  auditLogs: [],
  importBatches: [],
  riskRules: {
    ...DEFAULT_RISK_RULES,
    id: 'default',
    updatedAt: '',
    updatedBy: '',
  },
  summary: {
    pendingConfirmationCount: 0,
    remainingAmountCents: 0,
    partialCount: 0,
    overdueWithoutCollectionCount: 0,
    totalReceivableCount: nodes.length,
    receivedAmountCents: 0,
  },
});

void test('生命周期：逾期优先，待确认与催收信号不被主状态覆盖', () => {
  const data = fixture([
    node({ latestCollectionDate: '2026-08-30' }),
    node({
      id: 'draft',
      confirmationStatus: 'DRAFT',
      overdueDays: 0,
      riskLevel: 'NONE',
    }),
  ]);
  const model = buildPortfolio(data)[0];
  assert.equal(model.stage, 'OVERDUE');
  assert.equal(model.confirmed, 80000);
  assert.equal(model.draft, 80000);
  assert.equal(model.remaining, 80000);
  assert.equal(projectMatchesStage(model, 'PENDING'), true);
  assert.equal(projectMatchesStage(model, 'COLLECTING'), true);
  assert.equal(model.next.kind, 'collection');
});
void test('生命周期：空项目、全部结清、已收部分加待确认和更正后重新逾期', () => {
  assert.equal(buildPortfolio(fixture([]))[0].stage, 'SETUP');
  const paid = node({
    writeoffStatus: 'PAID',
    remainingAmountCents: 0,
    receivedAmountCents: 80000,
    overdueDays: 0,
    riskLevel: 'NONE',
  });
  const paidData = fixture([paid], [receipt({ amountCents: 80000 })]);
  paidData.projects = [{ ...project, archivedAt: `${today}T01:00:00Z` }];
  assert.equal(buildPortfolio(paidData)[0].stage, 'SETTLED');
  assert.equal(
    lifecycleSteps(buildPortfolio(paidData)[0]).at(-1)?.status,
    'done',
  );
  assert.equal(
    buildPortfolio(
      fixture([
        paid,
        node({ id: 'draft', confirmationStatus: 'DRAFT', overdueDays: 0 }),
      ]),
    )[0].stage,
    'PENDING',
  );
  const corrected = buildPortfolio(
    fixture(
      [
        node({
          writeoffStatus: 'PARTIAL',
          receivedAmountCents: 30000,
          remainingAmountCents: 50000,
        }),
      ],
      [
        receipt({
          id: 'old',
          amountCents: 80000,
          status: 'VOIDED',
          voidedAt: `${today}T02:00:00Z`,
        }),
        receipt({ correctionOfId: 'old' }),
      ],
    ),
  )[0];
  assert.equal(corrected.stage, 'OVERDUE');
  assert.equal(corrected.received, 30000);
  assert.equal(corrected.remaining, 50000);
  assert.equal(projectEvents(corrected).filter((e) => e.voided).length, 1);
});
void test('经营口径：本月包含本月已逾期但排除前月欠款，不截断超合同金额', () => {
  const data = fixture([
    node(),
    node({ id: 'prior', dueDate: '2026-07-01' }),
    node({ id: 'next', dueDate: '2026-09-01', overdueDays: 0 }),
    node({ id: 'draft', confirmationStatus: 'DRAFT', amountCents: 10000 }),
  ]);
  const model = buildPortfolio(data)[0];
  assert.equal(model.monthly, 80000);
  assert.equal(model.formed, 250000);
  assert.equal(model.confirmed, 240000);
  assert.equal(shanghaiDate(new Date('2026-08-31T16:00:00Z')), '2026-09-01');
});
void test('任务：同项目多节点合并，稳定选择最紧急节点，不创造待核销任务', () => {
  const data = fixture([
    node(),
    node({ id: 'worse', overdueDays: 90 }),
    node({ id: 'draft', confirmationStatus: 'DRAFT', overdueDays: 0 }),
  ]);
  const queue = buildTaskQueue(buildPortfolio(data), data.session, today);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].node?.id, 'worse');
  assert.equal(queue[0].relatedCount, 2);
  assert.equal(queue[0].reasons.length, 2);
  assert.equal(
    buildTaskQueue(buildPortfolio(fixture([])), data.session, today)[0].next
      .kind,
    'node',
  );
});
void test('提醒：仅已确认到期未结清节点超过30天无有效跟进', () => {
  assert.equal(
    needsFollowup(node({ latestCollectionDate: '2026-08-02' }), today),
    false,
  );
  assert.equal(
    needsFollowup(node({ latestCollectionDate: '2026-08-01' }), today),
    true,
  );
  assert.equal(
    needsFollowup(node({ confirmationStatus: 'DRAFT' }), today),
    false,
  );
  assert.equal(needsFollowup(node({ remainingAmountCents: 0 }), today), false);
});
void test('下一步遵守市级确认、区县节点维护和跨区操作权限', () => {
  const data = fixture([node({ confirmationStatus: 'DRAFT' })]);
  assert.equal(nextForNode(data.receivables[0], data.session).kind, 'confirm');
  const operator = {
    ...data.session,
    role: 'DISTRICT_OPERATOR' as const,
    districtId: 'd',
  };
  assert.equal(nextForNode(data.receivables[0], operator).kind, 'view');
  const partial = node({ overdueDays: 0, receivedAmountCents: 100 });
  assert.equal(nextForNode(partial, operator).kind, 'receipt');
  assert.equal(nextForNode(partial, operator).label, '登记下一笔回款');
  assert.equal(
    nextForNode(partial, { ...operator, districtId: 'other' }).kind,
    'view',
  );
  assert.equal(
    nextForNode(node(), { ...operator, districtId: 'other' }).kind,
    'view',
  );
  data.session = operator;
  data.receivables = [];
  assert.equal(buildPortfolio(data)[0].next.kind, 'view');
});
void test('项目深链接：保留项目和节点，旧路由兼容，非法链接安全回退', () => {
  assert.deepEqual(parseWorkspaceHash(projectHash('p', 'receipts', 'r')), {
    view: 'projects',
    projectId: 'p',
    section: 'receipts',
    receivableId: 'r',
  });
  assert.deepEqual(parseWorkspaceHash('#receipts'), { view: 'receipts' });
  assert.deepEqual(parseWorkspaceHash('#projects/%bad'), { view: 'dashboard' });
});
void test('上下文操作：缺失节点、跨项目节点或已结清节点绝不回退到其他记录', () => {
  const rows = [node(), node({ id: 'other', projectId: 'otherProject' })];
  assert.equal(contextualCandidates(rows, 'p', 'missing').length, 0);
  assert.equal(contextualCandidates(rows, 'p', 'other').length, 0);
  assert.deepEqual(
    contextualCandidates(rows, 'p').map((r) => r.id),
    ['r'],
  );
  assert.equal(
    contextualCandidates([node({ remainingAmountCents: 0 })], 'p', 'r').filter(
      (r) => r.remainingAmountCents > 0,
    ).length,
    0,
  );
});
void test('时间线：没有审计不能臆造确认时间，已有确认时间不依赖300条日志', () => {
  const model = buildPortfolio(fixture([node()]))[0];
  assert.equal(
    projectEvents(model).some((e) => e.id === 'confirm:r'),
    false,
  );
  const withDate = buildPortfolio(
    fixture([node({ confirmedAt: '2026-08-01T00:00:00Z' })]),
  )[0];
  assert.equal(
    projectEvents(withDate).find((e) => e.id === 'confirm:r')?.date,
    '2026-08-01T00:00:00Z',
  );
});
void test('审计按实体类型关联，不能通过恰巧相同的ID混入其他实体', () => {
  const data = fixture([node()]);
  data.auditLogs = [
    {
      id: 'a',
      districtId: 'd',
      districtName: '测试区',
      entityType: 'RISK_RULE',
      entityId: 'p',
      action: 'UPDATE',
      fieldName: null,
      oldValue: null,
      newValue: null,
      reason: null,
      source: 'MANUAL',
      actorRole: 'CITY_ADMIN',
      actorName: '测试管理员',
      createdAt: `${today}T01:00:00Z`,
    },
  ];
  assert.equal(buildPortfolio(data)[0].audits.length, 0);
});

void test('项目工作台真实组件渲染：所有工作区保留项目名称与下一步，填报人无确认按钮', () => {
  const data = fixture([
    node({ confirmationStatus: 'DRAFT', overdueDays: 0, riskLevel: 'NONE' }),
  ]);
  data.session.role = 'DISTRICT_OPERATOR';
  data.session.districtId = 'd';
  const model = buildPortfolio(data)[0];
  const noop = () => {};
  for (const section of Object.keys(PROJECT_SECTIONS) as ProjectSection[]) {
    const html = renderToStaticMarkup(
      createElement(ProjectWorkspace, {
        model,
        data,
        section,
        today,
        confirmingId: null,
        onBack: noop,
        onSection: noop,
        onDone: async () => {},
        operations: {
          onNode: noop,
          onConfirm: noop,
          onReceipt: noop,
          onCollection: noop,
          onCorrectReceipt: noop,
          onCorrectCollection: noop,
        },
      }),
    );
    assert.match(html, /测试项目/);
    assert.match(html, /查看待确认节点/);
    assert.doesNotMatch(html, />确认应收<\/button>/);
  }
  const cockpit = renderToStaticMarkup(
    createElement(BusinessCockpit, {
      data,
      models: [model],
      today,
      onOpen: noop,
      onNew: noop,
      onProjects: noop,
    }),
  );
  assert.match(cockpit, /现在最需要处理/);
  assert.match(cockpit, /回款登记后自动核销/);
  assert.match(cockpit, /项目状态总览/);
});
