import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RISK_RULES,
  addCalendarDays,
  calculateLegalRiskLevel,
  calculateRiskLevel,
  calculateWriteoffStatus,
  canConfirmReceivable,
  canCorrectOperationalRecord,
  canCreateOperationalRecord,
  canManageProject,
  canManageReceivable,
  canManageRiskRules,
  canReadDistrict,
  elapsedWholeMonths,
  isFormalCollectionAction,
  isIsoDate,
  shouldArchiveProject,
  yuanToCents,
} from '../lib/domain';
import {
  collectionCreateSchema,
  projectCreateSchema,
  receiptCorrectSchema,
  riskRulesSchema,
} from '../lib/validation';

void test('日期校验与付款日期按日历天准确计算', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(addCalendarDays('2026-01-31', 30), '2026-03-02');
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.throws(() => addCalendarDays('2026-02-30', 10));
});

void test('金额统一换算为分且拒绝无效精度', () => {
  assert.equal(yuanToCents('1,234.56'), 123456);
  assert.equal(yuanToCents(10.1), 1010);
  assert.equal(yuanToCents('0.01'), 1);
  assert.equal(yuanToCents('12.345'), null);
  assert.equal(yuanToCents('-1'), null);
  assert.equal(yuanToCents('0'), null);
});

void test('核销状态按有效回款合计计算', () => {
  assert.equal(calculateWriteoffStatus(10000, []), 'UNPAID');
  assert.equal(calculateWriteoffStatus(10000, [3000, 2000]), 'PARTIAL');
  assert.equal(calculateWriteoffStatus(10000, [3000, 7000]), 'PAID');
  assert.equal(calculateWriteoffStatus(10000, [12000]), 'PAID');
});

void test('逾期风险边界覆盖无风险、蓝、黄、红及已结清', () => {
  const rules = DEFAULT_RISK_RULES;
  assert.equal(
    calculateRiskLevel('2026-08-30', '2026-08-30', 'UNPAID', rules),
    'NONE',
  );
  assert.equal(
    calculateRiskLevel('2026-08-29', '2026-08-30', 'UNPAID', rules),
    'BLUE',
  );
  assert.equal(
    calculateRiskLevel('2026-08-01', '2026-08-30', 'UNPAID', rules),
    'BLUE',
  );
  assert.equal(
    calculateRiskLevel('2026-07-31', '2026-08-30', 'UNPAID', rules),
    'YELLOW',
  );
  assert.equal(
    calculateRiskLevel('2026-06-01', '2026-08-30', 'UNPAID', rules),
    'RED',
  );
  assert.equal(
    calculateRiskLevel('2025-01-01', '2026-08-30', 'PAID', rules),
    'NONE',
  );
});

void test('法律风险以完整月数映射六级至一级', () => {
  const rules = DEFAULT_RISK_RULES;
  assert.equal(elapsedWholeMonths('2026-08-01', '2026-08-31'), 0);
  assert.equal(elapsedWholeMonths('2026-08-01', '2026-09-01'), 1);
  assert.equal(
    calculateLegalRiskLevel('2026-08-01', '2026-08-31', 'UNPAID', rules),
    6,
  );
  assert.equal(
    calculateLegalRiskLevel('2026-08-01', '2026-09-01', 'UNPAID', rules),
    5,
  );
  assert.equal(
    calculateLegalRiskLevel('2026-01-01', '2026-08-01', 'UNPAID', rules),
    4,
  );
  assert.equal(
    calculateLegalRiskLevel('2025-07-01', '2026-08-01', 'UNPAID', rules),
    3,
  );
  assert.equal(
    calculateLegalRiskLevel('2025-01-01', '2026-08-01', 'UNPAID', rules),
    2,
  );
  assert.equal(
    calculateLegalRiskLevel('2024-08-01', '2026-08-01', 'UNPAID', rules),
    1,
  );
  assert.equal(
    calculateLegalRiskLevel('2024-08-01', '2026-08-01', 'PAID', rules),
    null,
  );
});

void test('项目仅在至少有一个节点且全部结清时归档', () => {
  assert.equal(shouldArchiveProject(0, 0), false);
  assert.equal(shouldArchiveProject(2, 1), false);
  assert.equal(shouldArchiveProject(2, 0), true);
  assert.equal(shouldArchiveProject(1, 1), false);
});

void test('三类角色权限矩阵严格区分市级、区县管理员和填报人', () => {
  assert.equal(canReadDistrict('CITY_ADMIN', null, 'dist-yanta'), true);
  assert.equal(
    canReadDistrict('DISTRICT_ADMIN', 'dist-beilin', 'dist-yanta'),
    false,
  );
  assert.equal(
    canReadDistrict('DISTRICT_OPERATOR', 'dist-beilin', 'dist-beilin'),
    true,
  );

  assert.equal(canManageProject('CITY_ADMIN'), true);
  assert.equal(canManageProject('DISTRICT_ADMIN'), false);
  assert.equal(
    canManageReceivable('DISTRICT_ADMIN', 'dist-beilin', 'dist-beilin'),
    true,
  );
  assert.equal(
    canManageReceivable('DISTRICT_OPERATOR', 'dist-beilin', 'dist-beilin'),
    false,
  );
  assert.equal(
    canCreateOperationalRecord(
      'DISTRICT_OPERATOR',
      'dist-beilin',
      'dist-beilin',
    ),
    true,
  );
  assert.equal(
    canCreateOperationalRecord(
      'DISTRICT_OPERATOR',
      'dist-beilin',
      'dist-yanta',
    ),
    false,
  );
  assert.equal(
    canCorrectOperationalRecord('DISTRICT_ADMIN', 'dist-beilin', 'dist-beilin'),
    true,
  );
  assert.equal(
    canCorrectOperationalRecord(
      'DISTRICT_OPERATOR',
      'dist-beilin',
      'dist-beilin',
    ),
    false,
  );
  assert.equal(canConfirmReceivable('CITY_ADMIN'), true);
  assert.equal(canConfirmReceivable('DISTRICT_ADMIN'), false);
  assert.equal(canManageRiskRules('CITY_ADMIN'), true);
  assert.equal(canManageRiskRules('DISTRICT_OPERATOR'), false);
});

void test('正式函件识别与服务端表单规则生效', () => {
  assert.equal(isFormalCollectionAction('WECHAT'), false);
  assert.equal(isFormalCollectionAction('COLLECTION_LETTER'), true);
  assert.equal(isFormalCollectionAction('LAWYER_LETTER'), true);
  assert.equal(isFormalCollectionAction('LITIGATION_LETTER'), true);

  assert.equal(
    collectionCreateSchema.safeParse({
      receivableId: 'r-1',
      actionType: 'WECHAT',
      actionDate: '2026-08-30',
      note: '',
    }).success,
    true,
  );
  assert.equal(
    receiptCorrectSchema.safeParse({
      originalId: 'receipt-1',
      receivableId: 'r-1',
      amountYuan: '100.00',
      receivedDate: '2026-08-30',
      reason: '',
    }).success,
    false,
  );
});

void test('项目和风险规则校验拒绝错误日期、金额及逆序阈值', () => {
  const project = {
    name: '验收测试项目',
    contractCode: 'HT-TEST-001',
    tags: [],
    districtCode: 'BEILIN',
    orgLevel4: '测试团队',
    customerName: '匿名测试客户',
    customerType: '政府',
    customerContact: '测试联系人',
    deliveryOwner: '测试交付',
    accountManager: '测试客户经理',
    deliveryManager: '测试交付经理',
    status: '执行中',
    contractDate: '2026-02-30',
    contractAmountYuan: '100.001',
    amountComposition: '标品',
  };
  assert.equal(projectCreateSchema.safeParse(project).success, false);
  assert.equal(
    riskRulesSchema.safeParse({
      blueMinDays: 30,
      yellowMinDays: 10,
      redMinDays: 90,
      legalLevel5MinMonths: 1,
      legalLevel4MinMonths: 7,
      legalLevel3MinMonths: 13,
      legalLevel2MinMonths: 19,
      legalLevel1MinMonths: 24,
      reason: '测试逆序阈值',
    }).success,
    false,
  );
});
