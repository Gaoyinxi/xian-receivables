import assert from 'node:assert/strict';
import test from 'node:test';
import { createHealthHandler } from '../apps/api/src/health';

async function payload(response: Response) {
  return (await response.json()) as {
    ok: boolean;
    data?: { status: string; mode: string };
    code?: string;
    message?: string;
  };
}

void test('liveness is dependency-free while readiness checks dependencies', async () => {
  let checks = 0;
  const handler = createHealthHandler(async () => {
    checks += 1;
    throw new Error('private database path must not leak');
  });

  const live = await handler(new Request('http://local/api/health/live'));
  assert.equal(live?.status, 200);
  assert.deepEqual(await payload(live!), {
    ok: true,
    data: { status: 'live', mode: 'selfhost' },
  });
  assert.equal(checks, 0);

  for (const path of ['/api/health/ready', '/api/health']) {
    const response = await handler(new Request(`http://local${path}`));
    assert.equal(response?.status, 503);
    assert.deepEqual(await payload(response!), {
      ok: false,
      code: 'SERVICE_NOT_READY',
      message: '服务尚未就绪',
    });
  }
  assert.equal(checks, 2);
});

void test('readiness preserves the compatibility response and rejects unsupported methods', async () => {
  const handler = createHealthHandler(async () => undefined);
  for (const path of ['/api/health/ready', '/api/health']) {
    const response = await handler(new Request(`http://local${path}`));
    assert.equal(response?.status, 200);
    assert.deepEqual(await payload(response!), {
      ok: true,
      data: { status: 'ready', mode: 'selfhost' },
    });
  }
  assert.equal(
    await handler(
      new Request('http://local/api/health/live', { method: 'POST' }),
    ),
    null,
  );
  assert.equal(
    await handler(new Request('http://local/api/health/unknown')),
    null,
  );
});
