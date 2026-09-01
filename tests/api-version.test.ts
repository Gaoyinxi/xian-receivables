import assert from 'node:assert/strict';
import test from 'node:test';
import type { BootstrapData, ApiResponse } from '../lib/types';
import type { VersionedResponse } from '../lib/api-contract';
type Failure = Extract<VersionedResponse<never>, { success: false }>;

const base = process.env.TEST_BASE_URL!;
void test('D1/SQLite 共用 v1 入口：旧响应兼容、错误包装及演示会话隔离', async () => {
  const response = await fetch(`${base}/api/v1/bootstrap`);
  const body = (await response.json()) as VersionedResponse<BootstrapData>;
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.meta.apiVersion, 'v1');
  const cookie = response.headers.get('set-cookie')?.split(';')[0] || '';
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const old = (await (
    await fetch(`${base}/api/bootstrap`, { headers })
  ).json()) as ApiResponse<BootstrapData>;
  assert.equal(old.ok, true);
  assert.deepEqual(body.data.projects, old.data.projects);
  for (const [path, method, status] of [
    ['unknown', 'GET', 404],
    ['projects', 'DELETE', 405],
  ]) {
    const result = await fetch(`${base}/api/v1/${path}`, {
      method: String(method),
      headers,
    });
    assert.equal(result.status, status);
    assert.equal(((await result.json()) as Failure).success, false);
  }
  const invalid = await fetch(`${base}/api/v1/projects`, {
    method: 'POST',
    headers,
    body: '{',
  });
  assert.equal(invalid.status, 400);
  assert.equal(((await invalid.json()) as Failure).error.code, 'INVALID_JSON');
  const validation = await fetch(`${base}/api/v1/projects`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  assert.equal(
    ((await validation.json()) as Failure).error.code,
    'VALIDATION_ERROR',
  );
  const identity = await fetch(`${base}/api/v1/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ role: 'DISTRICT_OPERATOR', districtCode: 'YANTA' }),
  });
  assert.equal(
    ((await identity.json()) as VersionedResponse<unknown>).success,
    true,
  );
  const scopedCookie = identity.headers.get('set-cookie')!.split(';')[0];
  const district = (await (
    await fetch(`${base}/api/v1/bootstrap`, {
      headers: { Cookie: scopedCookie },
    })
  ).json()) as VersionedResponse<BootstrapData>;
  assert.equal(district.success, true);
  assert.ok(
    district.data.projects.every(
      (project: { districtCode: string }) => project.districtCode === 'YANTA',
    ),
  );
});
