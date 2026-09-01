import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyApiPath, type VersionedResponse } from '../lib/api-contract';
import {
  canonicalRequest,
  finalizeApiResponse,
  versionedHandler,
} from '../lib/server/versioned-api';
import { ok, fail, BusinessError } from '../lib/server/api';
import { apiRequest, ApiClientError, setCsrfToken } from '../lib/api-client';
import { LatestRequest } from '../lib/latest-request';
type Failure = Extract<VersionedResponse<never>, { success: false }>;

void test('v1 精确匹配路径段，保留源地址、查询、请求体与 CSRF', async () => {
  assert.equal(classifyApiPath('/api/v10/bootstrap').version, null);
  assert.equal(classifyApiPath('/api/v1x/bootstrap').version, null);
  assert.equal(classifyApiPath('/api/v1').canonicalPath, '/api');
  const request = canonicalRequest(
    new Request('https://test.example/api/v1/receipts?note=a%2Fb', {
      method: 'POST',
      headers: { Origin: 'https://test.example', 'X-CSRF-Token': 'test-only' },
      body: '{"amountYuan":"1.25"}',
    }),
  );
  assert.equal(request.url, 'https://test.example/api/receipts?note=a%2Fb');
  assert.equal(request.headers.get('x-csrf-token'), 'test-only');
  assert.equal(await request.text(), '{"amountYuan":"1.25"}');
});

void test('旧协议保持原样，v1 保留状态、Cookie、字段及逐行错误', async () => {
  const legacy = ok(
    { id: 'a' },
    {
      status: 201,
      headers: {
        'Set-Cookie': 'test-only=x; Path=/; HttpOnly',
        ETag: 'old',
        'Content-Length': '1',
      },
    },
  );
  assert.equal(await finalizeApiResponse('/api/projects', legacy), legacy);
  const versioned = await finalizeApiResponse('/api/v1/projects', legacy);
  assert.equal(versioned.status, 201);
  assert.match(versioned.headers.get('set-cookie')!, /HttpOnly/);
  assert.equal(versioned.headers.has('etag'), false);
  assert.equal(versioned.headers.has('content-length'), false);
  assert.deepEqual(await versioned.clone().json(), {
    success: true,
    data: { id: 'a' },
    error: null,
    meta: { apiVersion: 'v1' },
  });
  assert.equal(
    await finalizeApiResponse('/api/v1/projects', versioned),
    versioned,
  );
  const response = await finalizeApiResponse(
    '/api/v1/imports/commit',
    fail('VALIDATION_ERROR', '错误', 409, { amountYuan: ['超额'] }, [
      { row: 2, code: 'BAD_DATE', message: '日期无效' },
    ]),
  );
  const body = (await response.json()) as Failure;
  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error.rowErrors![0].row, 2);
  assert.deepEqual(body.error.fieldErrors, { amountYuan: ['超额'] });
});

void test('下载按路径识别，错误仍包装，HEAD/204 不增加正文', async () => {
  const file = new Response('{"ok":false,"code":"file-content"}', {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename=test.json',
    },
  });
  assert.equal(
    await finalizeApiResponse('/api/v1/attachments/file', file),
    file,
  );
  const denied = await finalizeApiResponse(
    '/api/v1/attachments/file',
    fail('FORBIDDEN', '无权访问', 403),
  );
  assert.equal(((await denied.json()) as Failure).error.code, 'FORBIDDEN');
  const empty = new Response(null, { status: 204 });
  assert.equal(await finalizeApiResponse('/api/v1/projects', empty), empty);
  const head = new Response(null);
  assert.equal(
    await finalizeApiResponse('/api/v1/projects', head, 'HEAD'),
    head,
  );
  const overload = await finalizeApiResponse(
    '/api/v1/projects',
    new Response('繁忙', { status: 503, headers: { 'Retry-After': '5' } }),
  );
  assert.equal(overload.headers.get('retry-after'), '5');
  assert.equal(
    ((await overload.json()) as Failure).error.code,
    'SERVICE_UNAVAILABLE',
  );
  const thrown = await versionedHandler(
    new Request('https://test.example/api/v1/projects'),
    async () => {
      throw new BusinessError('NOT_FOUND', '未找到', 404);
    },
  );
  assert.equal(thrown.status, 404);
});

void test('请求版本门闩取消旧读取，旧响应与旧错误不能覆盖新身份', () => {
  const requests = new LatestRequest();
  const old = requests.start();
  const next = requests.start();
  assert.equal(old.signal.aborted, true);
  assert.equal(old.current(), false);
  assert.equal(next.current(), true);
  requests.cancel();
  assert.equal(next.current(), false);
});

void test('API Client 兼容新旧协议，保留 FormData、错误元数据，写请求不重试', async (t) => {
  const seen: RequestInit[] = [];
  const replies = [
    ok({ value: 1 }),
    await finalizeApiResponse('/api/v1/projects', ok({ value: 2 })),
    await finalizeApiResponse(
      '/api/v1/projects',
      fail('FORBIDDEN', '无权限', 403),
    ),
  ];
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, init: RequestInit) => {
      seen.push(init);
      return replies.shift()!;
    },
  );
  setCsrfToken('test-csrf');
  assert.deepEqual(await apiRequest('/api/bootstrap'), { value: 1 });
  const form = new FormData();
  form.set('file', 'test');
  assert.deepEqual(
    await apiRequest('/api/v1/attachments', { method: 'POST', body: form }),
    { value: 2 },
  );
  assert.equal(new Headers(seen[1].headers).has('content-type'), false);
  assert.equal(new Headers(seen[1].headers).get('x-csrf-token'), 'test-csrf');
  assert.ok(seen[0].signal instanceof AbortSignal);
  assert.equal(seen[1].signal, undefined); // Never force a write timeout.
  await assert.rejects(
    apiRequest('/api/v1/projects', { method: 'POST', body: '{}' }),
    (error: unknown) =>
      error instanceof ApiClientError &&
      error.status === 403 &&
      error.code === 'FORBIDDEN',
  );
  assert.equal(seen.length, 3);
  setCsrfToken(null);
});

void test('旧身份的迟到 401 不会触发新身份退出', async (t) => {
  const events = new EventTarget();
  let eventCount = 0;
  events.addEventListener('receivables:authentication-required', () => {
    eventCount++;
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    value: events,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  let resolve!: (response: Response) => void;
  t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const obsolete = apiRequest('/api/v1/bootstrap');
  setCsrfToken('new-identity');
  resolve(fail('SESSION_REQUIRED', '请登录', 401));
  await assert.rejects(obsolete);
  assert.equal(eventCount, 0);
  setCsrfToken(null);
});
