import assert from 'node:assert/strict';
import test from 'node:test';

import type { BootstrapData, RowError } from '../lib/types';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
  rowErrors?: Array<{ row: number; code: string; message: string }>;
}

interface ImportPreviewData {
  batchId: string;
  fileName: string;
  validRows: Array<Record<string, unknown>>;
  rowErrors: RowError[];
}

interface ImportCommitData {
  committedRows: number;
  rowErrors: RowError[];
}

class TestClient {
  cookie = '';

  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set('cookie', this.cookie);
    if (
      init.body &&
      !(init.body instanceof FormData) &&
      !headers.has('content-type')
    ) {
      headers.set('content-type', 'application/json');
    }
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';', 1)[0];
    return response;
  }

  async json<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ response: Response; body: ApiEnvelope<T> }> {
    const response = await this.raw(path, init);
    const text = await response.text();
    let body: ApiEnvelope<T>;
    try {
      body = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      body = {
        ok: false,
        code: response.status === 413 ? 'FILE_TOO_LARGE' : 'INVALID_RESPONSE',
        message: text,
      };
    }
    return { response, body };
  }
}

async function expectOk<T>(
  client: TestClient,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { response, body } = await client.json<T>(path, init);
  assert.equal(
    body.ok,
    true,
    `${init.method ?? 'GET'} ${path} 应成功，实际 ${response.status} ${body.code ?? ''} ${body.message ?? ''}`,
  );
  assert.ok(response.ok, `${path} HTTP 状态应成功`);
  return body.data as T;
}

async function expectError(
  client: TestClient,
  path: string,
  code: string,
  status: number,
  init: RequestInit = {},
): Promise<ApiEnvelope> {
  const { response, body } = await client.json(path, init);
  assert.equal(body.ok, false);
  assert.equal(response.status, status);
  assert.equal(body.code, code);
  return body;
}

async function switchIdentity(
  client: TestClient,
  role: 'CITY_ADMIN' | 'DISTRICT_ADMIN' | 'DISTRICT_OPERATOR',
  districtCode?: string,
) {
  await expectOk(client, '/api/bootstrap');
  return expectOk<{ role: string; districtCode: string | null }>(
    client,
    '/api/session',
    {
      method: 'POST',
      body: JSON.stringify({ role, districtCode: districtCode ?? null }),
    },
  );
}

async function upload(
  client: TestClient,
  entityType: 'PROJECT' | 'RECEIPT' | 'COLLECTION',
  entityId: string,
  file: File,
) {
  const form = new FormData();
  form.set('entityType', entityType);
  form.set('entityId', entityId);
  form.set('file', file);
  return expectOk<{
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }>(client, '/api/attachments', { method: 'POST', body: form });
}

function jsonPost(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

void test('本地 MVP API 完整流程、权限、导入、附件与归档', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const city = new TestClient();
  const districtAdmin = new TestClient();
  const operator = new TestClient();

  const initial = await expectOk<BootstrapData>(city, '/api/bootstrap');
  assert.equal(initial.session.role, 'CITY_ADMIN');
  assert.equal(initial.districts.length, 3);
  assert.ok(initial.projects.length >= 3);
  assert.ok(initial.receivables.length >= 5);
  assert.match(city.cookie, /^receivables_demo_session=[0-9a-f-]{30,}$/i);
  assert.equal(city.cookie.includes('CITY_ADMIN'), false);

  await switchIdentity(districtAdmin, 'DISTRICT_ADMIN', 'BEILIN');
  await switchIdentity(operator, 'DISTRICT_OPERATOR', 'BEILIN');

  await t.test('服务端区县隔离与角色权限', async () => {
    const scoped = await expectOk<BootstrapData>(
      districtAdmin,
      '/api/bootstrap',
    );
    assert.equal(scoped.session.districtName, '碑林区');
    assert.equal(
      scoped.projects.every((item) => item.districtName === '碑林区'),
      true,
    );
    assert.equal(
      scoped.receivables.every((item) => item.districtName === '碑林区'),
      true,
    );

    const yanta = initial.receivables.find(
      (item) => item.districtName === '雁塔区',
    );
    assert.ok(yanta, '种子数据应包含雁塔区应收');
    await expectError(
      districtAdmin,
      '/api/collections',
      'FORBIDDEN',
      403,
      jsonPost({
        receivableId: yanta.id,
        actionType: 'WECHAT',
        actionDate: '2026-08-30',
        note: '跨区权限测试',
      }),
    );

    const currentRules = initial.riskRules;
    await expectError(operator, '/api/risk-rules', 'FORBIDDEN', 403, {
      method: 'PUT',
      body: JSON.stringify({ ...currentRules, reason: '填报人越权测试' }),
    });

    await expectOk(city, '/api/risk-rules', {
      method: 'PUT',
      body: JSON.stringify({
        blueMinDays: currentRules.blueMinDays,
        yellowMinDays: currentRules.yellowMinDays,
        redMinDays: currentRules.redMinDays,
        legalLevel5MinMonths: currentRules.legalLevel5MinMonths,
        legalLevel4MinMonths: currentRules.legalLevel4MinMonths,
        legalLevel3MinMonths: currentRules.legalLevel3MinMonths,
        legalLevel2MinMonths: currentRules.legalLevel2MinMonths,
        legalLevel1MinMonths: currentRules.legalLevel1MinMonths,
        reason: '自动化验收：验证市级规则权限',
      }),
    });
  });

  let projectId = '';
  let projectCode = '';
  let receivableId = '';
  let receivableCode = '';
  let firstReceiptId = '';
  let finalReceiptId = '';
  let collectionId = '';
  let receiptAttachmentId = '';

  await t.test('项目到应收确认的服务端流程', async () => {
    const project = await expectOk<{ id: string; projectCode: string }>(
      city,
      '/api/projects',
      jsonPost({
        name: `自动化验收项目-${suffix}`,
        contractCode: `HT-AUTO-${suffix}`,
        tags: ['数智签约', '权责项目'],
        districtCode: 'BEILIN',
        orgLevel4: '碑林自动化验收团队',
        customerName: '匿名验收客户',
        customerType: '政府',
        customerContact: '匿名联系人',
        deliveryOwner: '匿名交付负责人',
        accountManager: '匿名客户经理',
        deliveryManager: '匿名交付经理',
        status: '执行中',
        contractDate: '2026-08-01',
        contractAmountYuan: '2000.00',
        amountComposition: 'ICT（税率6%）',
        billingCode: `FF-${suffix}`,
      }),
    );
    projectId = project.id;
    projectCode = project.projectCode;

    await expectError(
      districtAdmin,
      '/api/projects',
      'FORBIDDEN',
      403,
      jsonPost({
        name: '区县越权项目',
        contractCode: `HT-FORBIDDEN-${suffix}`,
        tags: [],
        districtCode: 'BEILIN',
        orgLevel4: '测试团队',
        customerName: '匿名客户',
        customerType: '政府',
        customerContact: '匿名联系人',
        deliveryOwner: '匿名交付',
        accountManager: '匿名客户经理',
        deliveryManager: '匿名交付经理',
        status: '执行中',
        contractDate: '2026-08-01',
        contractAmountYuan: '100.00',
        amountComposition: '标品',
      }),
    );

    const node = await expectOk<{
      id: string;
      receivableCode: string;
      dueDate: string;
    }>(
      districtAdmin,
      '/api/receivables',
      jsonPost({
        projectId,
        sequenceNo: 1,
        paymentType: '进度款',
        amountYuan: '1000.00',
        paymentCondition: '签约后30日内付款',
        baselineEvent: 'SIGNING',
        baselineDate: '2026-08-01',
        termDays: 30,
      }),
    );
    receivableId = node.id;
    receivableCode = node.receivableCode;
    assert.equal(node.dueDate, '2026-08-31');

    await expectError(
      operator,
      '/api/receipts',
      'RECEIVABLE_DRAFT',
      409,
      jsonPost({
        receivableId,
        amountYuan: '10.00',
        receivedDate: '2026-08-30',
      }),
    );
    await expectError(
      operator,
      '/api/receivables/confirm',
      'FORBIDDEN',
      403,
      jsonPost({ id: receivableId }),
    );
    await expectOk(
      city,
      '/api/receivables/confirm',
      jsonPost({ id: receivableId }),
    );
  });

  await t.test('多笔回款、超额阻止、作废更正与项目归档恢复', async () => {
    const first = await expectOk<{ id: string }>(
      operator,
      '/api/receipts',
      jsonPost({
        receivableId,
        amountYuan: '600.00',
        receivedDate: '2026-08-20',
        note: '第一笔到账',
      }),
    );
    firstReceiptId = first.id;

    await expectError(
      operator,
      '/api/receipts',
      'OVERPAYMENT',
      409,
      jsonPost({
        receivableId,
        amountYuan: '500.00',
        receivedDate: '2026-08-21',
      }),
    );

    await expectOk(
      districtAdmin,
      '/api/receipts/correct',
      jsonPost({
        originalId: firstReceiptId,
        receivableId,
        amountYuan: '500.00',
        receivedDate: '2026-08-20',
        note: '更正第一笔到账金额',
        reason: '自动化验收：原金额录入错误',
      }),
    );

    const png = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      `receipt-${suffix}.png`,
      { type: 'image/png' },
    );
    const receiptAttachment = await upload(
      operator,
      'RECEIPT',
      receivableId,
      png,
    );
    receiptAttachmentId = receiptAttachment.id;

    const finalReceipt = await expectOk<{ id: string }>(
      operator,
      '/api/receipts',
      jsonPost({
        receivableId,
        amountYuan: '500.00',
        receivedDate: '2026-08-25',
        note: '第二笔到账并结清',
        attachmentId: receiptAttachmentId,
      }),
    );
    finalReceiptId = finalReceipt.id;

    let refreshed = await expectOk<BootstrapData>(city, '/api/bootstrap');
    const paidReceivable = refreshed.receivables.find(
      (item) => item.id === receivableId,
    );
    assert.ok(paidReceivable);
    assert.equal(paidReceivable.writeoffStatus, 'PAID');
    assert.ok(
      refreshed.projects.find((item) => item.id === projectId)?.archivedAt,
      '全部应收结清后项目应归档',
    );

    await expectOk(
      districtAdmin,
      '/api/receipts/correct',
      jsonPost({
        originalId: finalReceiptId,
        receivableId,
        amountYuan: '400.00',
        receivedDate: '2026-08-25',
        note: '第二笔到账金额更正',
        reason: '自动化验收：验证更正后恢复进行中',
        attachmentId: receiptAttachmentId,
      }),
    );
    refreshed = await expectOk<BootstrapData>(city, '/api/bootstrap');
    assert.equal(
      refreshed.projects.find((item) => item.id === projectId)?.archivedAt,
      null,
      '更正产生余额后项目应恢复进行中',
    );

    await expectOk(
      operator,
      '/api/receipts',
      jsonPost({
        receivableId,
        amountYuan: '100.00',
        receivedDate: '2026-08-26',
        note: '补足余额再次结清',
      }),
    );
    refreshed = await expectOk<BootstrapData>(city, '/api/bootstrap');
    assert.ok(
      refreshed.projects.find((item) => item.id === projectId)?.archivedAt,
    );
    assert.ok(
      refreshed.receipts.some(
        (item) => item.id === firstReceiptId && item.status === 'VOIDED',
      ),
      '原回款必须保留并标记作废',
    );
  });

  await t.test('催缴时间线、正式函件附件与作废更正', async () => {
    const collection = await expectOk<{ id: string }>(
      operator,
      '/api/collections',
      jsonPost({
        receivableId,
        actionType: 'WECHAT',
        actionDate: '2026-08-18',
        note: '自动化验收微信催缴',
      }),
    );
    collectionId = collection.id;

    await expectError(
      operator,
      '/api/collections',
      'ATTACHMENT_REQUIRED',
      400,
      jsonPost({
        receivableId,
        actionType: 'COLLECTION_LETTER',
        actionDate: '2026-08-19',
        note: '无附件正式函件测试',
      }),
    );

    const form = new FormData();
    form.set('entityType', 'COLLECTION');
    form.set('entityId', receivableId);
    form.set(
      'file',
      new File(['not-an-image'], 'bad.txt', { type: 'text/plain' }),
    );
    await expectError(
      operator,
      '/api/attachments',
      'UNSUPPORTED_FILE_TYPE',
      415,
      {
        method: 'POST',
        body: form,
      },
    );

    const oversized = new FormData();
    oversized.set('entityType', 'COLLECTION');
    oversized.set('entityId', receivableId);
    oversized.set(
      'file',
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'too-large.png', {
        type: 'image/png',
      }),
    );
    await expectError(operator, '/api/attachments', 'FILE_TOO_LARGE', 413, {
      method: 'POST',
      body: oversized,
    });

    const letterAttachment = await upload(
      operator,
      'COLLECTION',
      receivableId,
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        `letter-${suffix}.png`,
        { type: 'image/png' },
      ),
    );
    await expectOk(
      operator,
      '/api/collections',
      jsonPost({
        receivableId,
        actionType: 'COLLECTION_LETTER',
        actionDate: '2026-08-19',
        note: '带附件正式催收函',
        attachmentId: letterAttachment.id,
      }),
    );

    await expectOk(
      districtAdmin,
      '/api/collections/correct',
      jsonPost({
        originalId: collectionId,
        receivableId,
        actionType: 'MEETING',
        actionDate: '2026-08-18',
        note: '更正为现场面谈',
        reason: '自动化验收：原催缴方式录入错误',
      }),
    );
    const refreshed = await expectOk<BootstrapData>(city, '/api/bootstrap');
    assert.ok(
      refreshed.collections.some(
        (item) => item.id === collectionId && item.status === 'VOIDED',
      ),
    );
    assert.ok(
      refreshed.collections.some(
        (item) =>
          item.correctionOfId === collectionId && item.actionType === 'MEETING',
      ),
    );
  });

  await t.test('附件授权下载与跨区读取拒绝', async () => {
    const receiptDownload = await operator.raw(
      `/api/attachments/${receiptAttachmentId}`,
    );
    assert.equal(receiptDownload.status, 200);
    assert.equal(receiptDownload.headers.get('content-type'), 'image/png');
    assert.ok((await receiptDownload.arrayBuffer()).byteLength > 0);

    const yantaProject = initial.projects.find(
      (item) => item.districtName === '雁塔区',
    );
    assert.ok(yantaProject);
    const yantaAttachment = await upload(
      city,
      'PROJECT',
      yantaProject.id,
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        `yanta-contract-${suffix}.png`,
        { type: 'image/png' },
      ),
    );
    const forbiddenDownload = await districtAdmin.json(
      `/api/attachments/${yantaAttachment.id}`,
    );
    assert.equal(forbiddenDownload.response.status, 403);
    assert.equal(forbiddenDownload.body.code, 'FORBIDDEN');

    const projectAttachment = await upload(
      city,
      'PROJECT',
      projectId,
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        `contract-${suffix}.png`,
        { type: 'image/png' },
      ),
    );
    const projectDownload = await city.raw(
      `/api/attachments/${projectAttachment.id}`,
    );
    assert.equal(projectDownload.status, 200);
  });

  let importedReceivableId = '';
  await t.test('三个模板逐行校验、部分成功和重复保护', async () => {
    const importContract = `HT-IMPORT-${suffix}`;
    const validProjectRow = {
      项目名称: `导入验收项目-${suffix}`,
      合同编码: importContract,
      项目属性打标: '数智签约、权责项目',
      '归属单位（三级）': '碑林',
      '归属单位（四级）': '碑林导入验收团队',
      客户名称: '匿名导入客户',
      客户类型: '政府',
      客户对接人: '匿名联系人',
      项目交付负责人: '匿名交付负责人',
      客户经理: '匿名客户经理',
      交付经理: '匿名交付经理',
      项目状态: '执行中',
      合同签订日期: '2026-08-01',
      '合同总金额（含税）': '500.00',
      合同金额构成: 'ICT（税率6%）',
      付费编码: `FF-IMPORT-${suffix}`,
    };
    const projectRows = [
      validProjectRow,
      { ...validProjectRow, 合同编码: `HT-MISSING-${suffix}`, 客户名称: '' },
      {
        ...validProjectRow,
        合同编码: `HT-DATE-${suffix}`,
        合同签订日期: '2026-02-30',
      },
      { ...validProjectRow, 合同编码: 'HT-BL-2026-018' },
    ];
    const projectPreview = await expectOk<ImportPreviewData>(
      city,
      '/api/imports/preview',
      jsonPost({
        kind: 'PROJECT',
        fileName: `project-${suffix}.xlsx`,
        rows: projectRows,
      }),
    );
    assert.equal(projectPreview.validRows.length, 1);
    assert.equal(projectPreview.rowErrors.length, 3);
    const projectCommit = await expectOk<ImportCommitData>(
      city,
      '/api/imports/commit',
      jsonPost({
        batchId: projectPreview.batchId,
        kind: 'PROJECT',
        fileName: projectPreview.fileName,
        rows: projectRows,
      }),
    );
    assert.equal(projectCommit.committedRows, 1);
    assert.equal(projectCommit.rowErrors.length, 3);

    const afterProjectImport = await expectOk<BootstrapData>(
      city,
      '/api/bootstrap',
    );
    const importedProject = afterProjectImport.projects.find(
      (item) => item.contractCode === importContract,
    );
    assert.ok(importedProject);

    const nodeRows = [
      {
        项目编码: importedProject.projectCode,
        节点序号: 1,
        款项类型: '进度款',
        节点金额: '100.00',
        付款条件: '签约后30日内',
        基准事件: '签约',
        基准日期: '2026-08-01',
        账期天数: 30,
      },
      {
        项目编码: 'XM-UNKNOWN',
        节点序号: 1,
        款项类型: '进度款',
        节点金额: '100.00',
        付款条件: '签约后30日内',
        基准事件: '签约',
        基准日期: '2026-08-01',
        账期天数: 30,
      },
      {
        项目编码: importedProject.projectCode,
        节点序号: 2,
        款项类型: '进度款',
        节点金额: '100.00',
        付款条件: '签约后30日内',
        基准事件: '签约',
        基准日期: '2026-02-30',
        账期天数: 30,
      },
    ];
    const nodePreview = await expectOk<ImportPreviewData>(
      districtAdmin,
      '/api/imports/preview',
      jsonPost({
        kind: 'RECEIVABLE',
        fileName: `node-${suffix}.xlsx`,
        rows: nodeRows,
      }),
    );
    assert.equal(nodePreview.validRows.length, 1);
    assert.equal(nodePreview.rowErrors.length, 2);
    const nodeCommit = await expectOk<ImportCommitData>(
      districtAdmin,
      '/api/imports/commit',
      jsonPost({
        batchId: nodePreview.batchId,
        kind: 'RECEIVABLE',
        fileName: nodePreview.fileName,
        rows: nodeRows,
      }),
    );
    assert.equal(nodeCommit.committedRows, 1);

    const afterNodeImport = await expectOk<BootstrapData>(
      city,
      '/api/bootstrap',
    );
    const importedReceivable = afterNodeImport.receivables.find(
      (item) => item.projectId === importedProject.id,
    );
    assert.ok(importedReceivable);
    importedReceivableId = importedReceivable.id;
    await expectOk(
      city,
      '/api/receivables/confirm',
      jsonPost({ id: importedReceivable.id }),
    );

    const receiptRows = [
      {
        应收编号: importedReceivable.receivableCode,
        实收金额: '10.00',
        实收日期: '2026-08-28',
        备注: '模板正常回款',
      },
      {
        应收编号: 'YS-UNKNOWN',
        实收金额: '10.00',
        实收日期: '2026-08-28',
        备注: '未知应收测试',
      },
      {
        应收编号: importedReceivable.receivableCode,
        实收金额: '10.00',
        实收日期: '2026-02-30',
        备注: '无效日期测试',
      },
    ];
    const receiptPreview = await expectOk<ImportPreviewData>(
      operator,
      '/api/imports/preview',
      jsonPost({
        kind: 'RECEIPT',
        fileName: `receipt-${suffix}.xlsx`,
        rows: receiptRows,
      }),
    );
    assert.equal(receiptPreview.validRows.length, 1);
    assert.equal(receiptPreview.rowErrors.length, 2);
    const receiptCommit = await expectOk<ImportCommitData>(
      operator,
      '/api/imports/commit',
      jsonPost({
        batchId: receiptPreview.batchId,
        kind: 'RECEIPT',
        fileName: receiptPreview.fileName,
        rows: receiptRows,
      }),
    );
    assert.equal(receiptCommit.committedRows, 1);
    assert.equal(receiptCommit.rowErrors.length, 2);

    const forbiddenPreview = await expectOk<ImportPreviewData>(
      operator,
      '/api/imports/preview',
      jsonPost({
        kind: 'PROJECT',
        fileName: `forbidden-${suffix}.xlsx`,
        rows: [{ ...validProjectRow, 合同编码: `HT-OPERATOR-${suffix}` }],
      }),
    );
    assert.equal(forbiddenPreview.validRows.length, 0);
    assert.equal(forbiddenPreview.rowErrors[0].code, 'FORBIDDEN');
  });

  await t.test('审计证据完整且作废记录不参与汇总', async () => {
    const refreshed = await expectOk<BootstrapData>(city, '/api/bootstrap');
    const flowReceivable = refreshed.receivables.find(
      (item) => item.id === receivableId,
    );
    assert.ok(flowReceivable);
    assert.equal(flowReceivable.receivedAmountCents, 100000);
    assert.equal(flowReceivable.writeoffStatus, 'PAID');

    const importedReceivable = refreshed.receivables.find(
      (item) => item.id === importedReceivableId,
    );
    assert.ok(importedReceivable);
    assert.equal(importedReceivable.receivedAmountCents, 1000);
    assert.equal(importedReceivable.writeoffStatus, 'PARTIAL');

    assert.ok(
      refreshed.auditLogs.some(
        (item) =>
          item.entityType === 'RECEIPT' &&
          item.action === 'VOID_AND_CORRECT' &&
          item.reason,
      ),
    );
    assert.ok(
      refreshed.auditLogs.some(
        (item) =>
          item.entityType === 'COLLECTION' &&
          item.action === 'VOID_AND_CORRECT' &&
          item.reason,
      ),
    );
    assert.ok(
      refreshed.auditLogs.some(
        (item) => item.entityType === 'RISK_RULE' && item.action === 'UPDATE',
      ),
    );
  });

  console.log(
    `PERSISTENCE_CHECK project=${projectCode} receivable=${receivableCode} attachment=${receiptAttachmentId}`,
  );
});
