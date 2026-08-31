import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ApiResponse, BootstrapData, Role } from '../lib/types';

const base = process.env.TEST_BASE_URL!;
const statePath = process.env.RECEIVABLES_STATE_PATH!;
assert.ok(
  base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname),
  '仅允许本机隔离测试',
);
assert.ok(
  statePath && basename(statePath).startsWith('receivables-integration-'),
  '必须由集成脚本创建临时数据库',
);

class Client {
  cookie = '';
  async request<T>(path: string, body?: unknown) {
    const init: RequestInit = {
      headers: { Cookie: this.cookie, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      init.method = 'POST';
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${path}`, init);
    this.cookie =
      response.headers.get('set-cookie')?.split(';')[0] || this.cookie;
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json()) as ApiResponse<T>,
    };
  }
  async ok<T>(path: string, body?: unknown) {
    const result = await this.request<T>(path, body);
    assert.equal(result.body.ok, true, JSON.stringify(result.body));
    assert.ok(result.body.ok);
    return result.body.data;
  }
  async identity(role: Role, districtCode?: string) {
    await this.ok('/api/bootstrap');
    await this.ok('/api/session', { role, districtCode });
  }
  bootstrap() {
    return this.ok<BootstrapData>('/api/bootstrap');
  }
}

async function isolatedSqlite() {
  // Failure injection touches only the exact scratch directory owned by this test.
  const files = await readdir(statePath, { recursive: true });
  for (const file of files.filter(
    (name) => name.endsWith('.sqlite') && name.includes('d1'),
  )) {
    const db = new DatabaseSync(join(statePath, file));
    if (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'receipts'",
        )
        .get()
    ) {
      db.exec('PRAGMA busy_timeout = 5000');
      return db;
    }
    db.close();
  }
  throw new Error('未找到测试专用 D1 数据库');
}

void test('交付回归：竞争、导入归属、事务回滚与批量上限', async (t) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const city = new Client();
  const operator = new Client();
  const admin = new Client();
  const outsider = new Client();
  await city.identity('CITY_ADMIN');
  await operator.identity('DISTRICT_OPERATOR', 'BEILIN');
  await admin.identity('DISTRICT_ADMIN', 'BEILIN');
  await outsider.identity('DISTRICT_ADMIN', 'YANTA');
  const projectInput = {
    name: `交付回归-${suffix}`,
    contractCode: `HT-DELIVERY-${suffix}`,
    tags: [],
    districtCode: 'BEILIN',
    orgLevel4: '匿名团队',
    customerName: '匿名客户',
    customerType: '企业',
    customerContact: '匿名联系人',
    deliveryOwner: '匿名交付',
    accountManager: '匿名客户经理',
    deliveryManager: '匿名交付经理',
    status: '执行中',
    contractDate: '2026-01-01',
    contractAmountYuan: '1000000.00',
    amountComposition: '标品',
  };
  let projectId = '',
    projectCode = '',
    receivableId = '',
    originalId = '',
    replacementId = '';
  const createNode = (sequenceNo: number, amountYuan = '1000.00') =>
    admin.ok<{ id: string; receivableCode: string }>('/api/receivables', {
      projectId,
      sequenceNo,
      amountYuan,
      paymentType: '进度款',
      paymentCondition: '签约后付款',
      baselineEvent: 'SIGNING',
      baselineDate: '2026-01-01',
      termDays: 30,
    });

  await t.test(
    '无会话写入、损坏Cookie与JSON均返回明确错误，业务响应禁止缓存',
    async () => {
      const unauthenticated = await new Client().request('/api/receipts', {});
      assert.equal(unauthenticated.status, 401);
      const malformedCookie = await fetch(`${base}/api/receipts`, {
        method: 'POST',
        headers: {
          Cookie: 'receivables_demo_session=%E0%A4%A',
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(malformedCookie.status, 401);
      const badJson = await fetch(`${base}/api/projects`, {
        method: 'POST',
        headers: {
          Cookie: city.cookie,
          'Content-Type': 'application/json',
        },
        body: '{oops',
      });
      assert.equal(badJson.status, 400);
      assert.equal(
        ((await badJson.json()) as { code: string }).code,
        'INVALID_JSON',
      );
      const loaded = await city.request<BootstrapData>('/api/bootstrap');
      assert.match(loaded.headers.get('cache-control')!, /no-store/);
      assert.ok(loaded.body.ok);
      assert.ok(
        loaded.body.data.receivables
          .filter((row) => row.confirmationStatus === 'DRAFT')
          .every((row) => !row.collectionMissing && row.riskLevel === 'NONE'),
      );
    },
  );

  await t.test('并发新建项目与节点的系统编码保持唯一', async () => {
    const projects = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        city.ok<{ id: string; projectCode: string }>('/api/projects', {
          ...projectInput,
          contractCode: `${projectInput.contractCode}-${index}`,
        }),
      ),
    );
    assert.equal(new Set(projects.map((row) => row.projectCode)).size, 4);
    ({ id: projectId, projectCode } = projects[0]);
    const nodes = await Promise.all([createNode(1), createNode(2)]);
    assert.notEqual(nodes[0].receivableCode, nodes[1].receivableCode);
    receivableId = nodes[0].id;
    await city.ok('/api/receivables/confirm', { id: receivableId });
  });

  await t.test('并发回款不能突破剩余金额，失败方不产生审计', async () => {
    const results = await Promise.all(
      [0, 1].map((index) =>
        operator.request<{ id: string }>('/api/receipts', {
          receivableId,
          amountYuan: '600.00',
          receivedDate: '2026-08-20',
          note: `并发到账-${index}`,
        }),
      ),
    );
    assert.deepEqual(
      results.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    const winner = results.find((r) => r.body.ok)!;
    assert.ok(winner.body.ok);
    originalId = winner.body.data.id;
    const data = await city.bootstrap();
    assert.equal(
      data.receivables.find((r) => r.id === receivableId)!.receivedAmountCents,
      60000,
    );
    assert.equal(
      data.receipts.filter((r) => r.receivableId === receivableId).length,
      1,
    );
    assert.equal(
      data.auditLogs.filter(
        (r) => r.entityId === originalId && r.action === 'CREATE',
      ).length,
      1,
    );
  });

  await t.test('伪装文件被拒绝，使用项目编码上传的附件归属内部ID', async () => {
    const upload = (file: File) => {
      const form = new FormData();
      form.set('entityType', 'PROJECT');
      form.set('entityId', projectCode);
      form.set('file', file);
      return fetch(`${base}/api/attachments`, {
        method: 'POST',
        headers: { Cookie: city.cookie },
        body: form,
      });
    };
    assert.equal(
      (
        await upload(
          new File(['not-a-pdf'], '伪装.pdf', { type: 'application/pdf' }),
        )
      ).status,
      415,
    );
    const response = await upload(
      new File(['%PDF-1.4\n匿名测试附件'], '合同.pdf', {
        type: 'application/pdf',
      }),
    );
    assert.equal(response.status, 201);
    const payload = (await response.json()) as { data: { id: string } };
    assert.equal(
      (await city.bootstrap()).attachments.find(
        (a) => a.id === payload.data.id,
      )!.entityId,
      projectId,
    );
  });

  await t.test('并发回款更正只产生一条替代记录，填报人不能更正', async () => {
    const input = {
      originalId,
      receivableId,
      amountYuan: '500.00',
      receivedDate: '2026-08-20',
      reason: '交付测试更正金额',
    };
    assert.equal(
      (await operator.request('/api/receipts/correct', input)).status,
      403,
    );
    const results = await Promise.all([
      admin.request<{ replacementId: string }>('/api/receipts/correct', input),
      admin.request<{ replacementId: string }>('/api/receipts/correct', input),
    ]);
    assert.deepEqual(
      results.map((r) => r.status).sort((a, b) => a - b),
      [200, 409],
    );
    const winner = results.find((r) => r.body.ok)!;
    assert.ok(winner.body.ok);
    replacementId = winner.body.data.replacementId;
    const data = await city.bootstrap();
    assert.equal(
      data.receipts.filter((r) => r.correctionOfId === originalId).length,
      1,
    );
    assert.equal(
      data.auditLogs.filter(
        (r) => r.entityId === originalId && r.action === 'VOID_AND_CORRECT',
      ).length,
      1,
    );
    assert.equal(
      data.receivables.find((r) => r.id === receivableId)!.receivedAmountCents,
      50000,
    );
  });

  await t.test('模拟审计写入失败：更正、原记录状态和金额全部回滚', async () => {
    const db = await isolatedSqlite();
    const reason = `rollback-${suffix}`;
    db.exec(`CREATE TRIGGER delivery_test_audit_failure BEFORE INSERT ON audit_logs
      WHEN NEW.reason = '${reason}' BEGIN SELECT RAISE(ABORT, 'DELIVERY_TEST_ROLLBACK'); END`);
    const before = await city.bootstrap();
    try {
      const result = await admin.request('/api/receipts/correct', {
        originalId: replacementId,
        receivableId,
        amountYuan: '700.00',
        receivedDate: '2026-08-20',
        reason,
      });
      assert.equal(result.status, 500);
      const after = await city.bootstrap();
      assert.deepEqual(after.receipts, before.receipts);
      assert.deepEqual(after.receivables, before.receivables);
      assert.deepEqual(after.projects, before.projects);
      assert.deepEqual(after.auditLogs, before.auditLogs);
    } finally {
      db.exec('DROP TRIGGER delivery_test_audit_failure');
      db.close();
    }
  });

  await t.test('并发催缴更正只保留一个有效替代记录', async () => {
    const collection = await operator.ok<{ id: string }>('/api/collections', {
      receivableId,
      actionType: 'WECHAT',
      actionDate: '2026-08-20',
      note: '初次联系',
    });
    const body = {
      originalId: collection.id,
      receivableId,
      actionType: 'MEETING',
      actionDate: '2026-08-21',
      reason: '交付测试更正催缴方式',
    };
    const results = await Promise.all([
      admin.request('/api/collections/correct', body),
      admin.request('/api/collections/correct', body),
    ]);
    assert.deepEqual(
      results.map((r) => r.status).sort((a, b) => a - b),
      [200, 409],
    );
    const data = await city.bootstrap();
    assert.equal(
      data.collections.filter((r) => r.correctionOfId === collection.id).length,
      1,
    );
    assert.equal(
      data.receivables.find((r) => r.id === receivableId)!.latestCollectionDate,
      '2026-08-21',
    );
  });

  await t.test('导入预览绑定创建者与区县，并发提交只落库一次', async () => {
    const rows = [
      {
        项目编码: projectCode,
        节点序号: 3,
        款项类型: '质保金',
        节点金额: '100.00',
        付款条件: '质保到期',
        基准事件: '签约',
        基准日期: '2026-01-01',
        账期天数: 60,
      },
    ];
    const preview = await admin.ok<{ batchId: string }>(
      '/api/imports/preview',
      { kind: 'RECEIVABLE', fileName: '归属测试.xlsx', rows },
    );
    const payload = {
      ...preview,
      kind: 'RECEIVABLE',
      fileName: '归属测试.xlsx',
      rows,
    };
    assert.equal(
      (await outsider.request('/api/imports/commit', payload)).status,
      403,
    );
    assert.equal(
      (await city.request('/api/imports/commit', payload)).status,
      403,
      '市级也不能消费别人的预览',
    );
    const sameDistrict = new Client();
    await sameDistrict.identity('DISTRICT_ADMIN', 'BEILIN');
    assert.equal(
      (await sameDistrict.request('/api/imports/commit', payload)).status,
      403,
    );
    const results = await Promise.all([
      admin.request('/api/imports/commit', payload),
      admin.request('/api/imports/commit', payload),
    ]);
    assert.deepEqual(
      results.map((r) => r.status).sort((a, b) => a - b),
      [200, 409],
    );
    const data = await city.bootstrap();
    assert.equal(
      data.receivables.filter(
        (r) => r.projectId === projectId && r.sequenceNo === 3,
      ).length,
      1,
    );
    assert.equal(
      data.auditLogs.filter(
        (r) => r.entityId === preview.batchId && r.action === 'COMMIT',
      ).length,
      1,
    );
  });

  await t.test('回款导入识别已有数据及同文件重复行', async () => {
    const node = await createNode(4, '10000.00');
    await city.ok('/api/receivables/confirm', { id: node.id });
    const row = {
      应收编号: node.receivableCode,
      实收金额: '10.00',
      实收日期: '2026-08-20',
      备注: '导入防重复',
    };
    const preview = await operator.ok<{
      batchId: string;
      validRows: unknown[];
      rowErrors: { code: string }[];
    }>('/api/imports/preview', {
      kind: 'RECEIPT',
      fileName: '回款重复.xlsx',
      rows: [row, row],
    });
    assert.equal(preview.validRows.length, 1);
    assert.equal(preview.rowErrors[0].code, 'DUPLICATE_RECEIPT');
    await operator.ok('/api/imports/commit', {
      batchId: preview.batchId,
      kind: 'RECEIPT',
      fileName: '回款重复.xlsx',
      rows: [row, row],
    });
    const duplicate = await operator.ok<{
      validRows: unknown[];
      rowErrors: { code: string }[];
    }>('/api/imports/preview', {
      kind: 'RECEIPT',
      fileName: '再次回款.xlsx',
      rows: [row],
    });
    assert.equal(duplicate.validRows.length, 0);
    assert.equal(duplicate.rowErrors[0].code, 'DUPLICATE_RECEIPT');
  });

  await t.test('导入中途失败整批回滚，原预览可安全重试', async () => {
    const rows = [6, 7].map((sequenceNo) => ({
      项目编码: projectCode,
      节点序号: sequenceNo,
      款项类型: '质保金',
      节点金额: '100.00',
      付款条件: '到期付款',
      基准事件: '签约',
      基准日期: '2026-01-01',
      账期天数: 30,
    }));
    const preview = await admin.ok<{ batchId: string }>(
      '/api/imports/preview',
      { kind: 'RECEIVABLE', fileName: '回滚测试.xlsx', rows },
    );
    const body = {
      kind: 'RECEIVABLE',
      fileName: '回滚测试.xlsx',
      rows,
      batchId: preview.batchId,
    };
    const db = await isolatedSqlite();
    db.exec(`CREATE TRIGGER delivery_test_import_failure BEFORE INSERT ON audit_logs
      WHEN NEW.entity_type = 'RECEIVABLE' AND NEW.source = 'EXCEL_IMPORT'
      BEGIN SELECT RAISE(ABORT, 'DELIVERY_TEST_IMPORT_ROLLBACK'); END`);
    try {
      assert.equal(
        (await admin.request('/api/imports/commit', body)).status,
        500,
      );
      const data = await city.bootstrap();
      assert.equal(
        data.receivables.filter(
          (r) => r.projectId === projectId && [6, 7].includes(r.sequenceNo),
        ).length,
        0,
      );
      assert.equal(
        data.importBatches.find((r) => r.id === preview.batchId)!.status,
        'PREVIEWED',
      );
      assert.equal(
        data.auditLogs.filter(
          (r) => r.entityId === preview.batchId && r.action === 'COMMIT',
        ).length,
        0,
      );
    } finally {
      db.exec('DROP TRIGGER delivery_test_import_failure');
      db.close();
    }
    const retry = await admin.ok<{ committedRows: number }>(
      '/api/imports/commit',
      body,
    );
    assert.equal(retry.committedRows, 2);
  });

  await t.test('已归档项目新增付款节点立即恢复进行中', async () => {
    const project = await city.ok<{ id: string; projectCode: string }>(
      '/api/projects',
      { ...projectInput, contractCode: `${projectInput.contractCode}-archive` },
    );
    const node = await admin.ok<{ id: string }>('/api/receivables', {
      projectId: project.id,
      sequenceNo: 1,
      paymentType: '终验款',
      amountYuan: '100.00',
      paymentCondition: '签约',
      baselineEvent: 'SIGNING',
      baselineDate: '2026-01-01',
      termDays: 1,
    });
    await city.ok('/api/receivables/confirm', { id: node.id });
    await operator.ok('/api/receipts', {
      receivableId: node.id,
      amountYuan: '100.00',
      receivedDate: '2026-08-20',
    });
    assert.ok(
      (await city.bootstrap()).projects.find((row) => row.id === project.id)!
        .archivedAt,
    );
    await admin.ok('/api/receivables', {
      projectId: project.id,
      sequenceNo: 2,
      paymentType: '质保金',
      amountYuan: '100.00',
      paymentCondition: '补充质保金',
      baselineEvent: 'SIGNING',
      baselineDate: '2026-01-01',
      termDays: 1,
    });
    assert.equal(
      (await city.bootstrap()).projects.find((row) => row.id === project.id)!
        .archivedAt,
      null,
    );
  });

  await t.test('三类导入分别支持1000行，生成编码无重复，实收精确', async () => {
    const projectRows = Array.from({ length: 1000 }, (_, i) => ({
      项目名称: `匿名批量-${i}`,
      合同编码: `BULK-${suffix}-${i}`,
      '归属单位（三级）': '碑林区',
      '归属单位（四级）': '匿名团队',
      客户名称: '匿名客户',
      客户类型: '企业',
      客户对接人: '匿名联系人',
      项目交付负责人: '匿名负责人',
      客户经理: '匿名经理',
      交付经理: '匿名经理',
      项目状态: '执行中',
      合同签订日期: '2026-01-01',
      '合同总金额（含税）': '1000.00',
      合同金额构成: '标品',
    }));
    const nodeRows = Array.from({ length: 1000 }, (_, i) => ({
      项目编码: projectCode,
      节点序号: i + 100,
      款项类型: '进度款',
      节点金额: '100.00',
      付款条件: '批量验收',
      基准事件: '签约',
      基准日期: '2026-01-01',
      账期天数: 30,
    }));
    const receiptNode = await createNode(5, '2000.00');
    await city.ok('/api/receivables/confirm', { id: receiptNode.id });
    const receiptRows = Array.from({ length: 1000 }, (_, i) => ({
      应收编号: receiptNode.receivableCode,
      实收金额: '1.00',
      实收日期: '2026-08-20',
      备注: `匿名批量流水-${i}`,
    }));
    for (const [kind, client, rows] of [
      ['PROJECT', city, projectRows],
      ['RECEIVABLE', admin, nodeRows],
      ['RECEIPT', operator, receiptRows],
    ] as const) {
      const fileName = `${kind}-1000.xlsx`;
      const preview = await client.ok<{
        batchId: string;
        validRows: unknown[];
      }>('/api/imports/preview', { kind, fileName, rows });
      assert.equal(preview.validRows.length, 1000);
      const committed = await client.ok<{ committedRows: number }>(
        '/api/imports/commit',
        { batchId: preview.batchId, kind, fileName, rows },
      );
      assert.equal(committed.committedRows, 1000);
    }
    const data = await city.bootstrap();
    assert.equal(
      new Set(data.projects.map((r) => r.projectCode)).size,
      data.projects.length,
    );
    assert.equal(
      new Set(data.receivables.map((r) => r.receivableCode)).size,
      data.receivables.length,
    );
    assert.equal(
      data.receivables.find((r) => r.id === receiptNode.id)!
        .receivedAmountCents,
      100000,
    );
  });
});
