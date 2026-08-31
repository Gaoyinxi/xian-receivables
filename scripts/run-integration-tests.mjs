import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const projectRoot = process.cwd();
const vinextExecutable = join(projectRoot, 'node_modules', '.bin', 'vinext');

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('无法分配集成测试端口');
  }
  const { port } = address;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`集成测试服务提前退出，退出码 ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${url}/api/bootstrap`);
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待集成测试服务启动超时：${url}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    waitForExit(child).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await waitForExit(child);
  }
}

const port = await getFreePort();
const statePath = await mkdtemp(join(tmpdir(), 'receivables-integration-'));
const baseUrl = `http://127.0.0.1:${port}`;
const testEnvironment = {
  ...process.env,
  RECEIVABLES_STATE_PATH: statePath,
  TEST_BASE_URL: baseUrl,
  // Vinext's lock is project-wide. The test service has its own port AND storage.
  VINEXT_NO_DEV_LOCK: '1',
};

const startServer = () =>
  spawn(
    vinextExecutable,
    ['dev', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: projectRoot,
      env: testEnvironment,
      stdio: 'inherit',
    },
  );
let server = startServer();

async function snapshot(cookie) {
  const response = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  const nextCookie =
    response.headers.get('set-cookie')?.split(';')[0] || cookie;
  const { session, ...data } = payload.data;
  const stored = Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => key !== 'summary')
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.toSorted((a, b) => String(a.id).localeCompare(String(b.id)))
          : value,
      ]),
  );
  const files = [];
  for (const attachment of data.attachments) {
    const file = await fetch(`${baseUrl}/api/attachments/${attachment.id}`, {
      headers: { Cookie: nextCookie },
    });
    assert.equal(file.status, 200, `附件 ${attachment.id} 必须可下载`);
    files.push([
      attachment.id,
      createHash('sha256')
        .update(Buffer.from(await file.arrayBuffer()))
        .digest('hex'),
    ]);
  }
  return {
    cookie: nextCookie,
    session,
    stored,
    files: files.toSorted((a, b) => a[0].localeCompare(b[0])),
  };
}

let exitCode = 1;
try {
  await waitForServer(baseUrl, server);
  const testProcess = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=1',
      'tests/api-flow.test.ts',
      'tests/integrity.test.ts',
    ],
    {
      cwd: projectRoot,
      env: testEnvironment,
      stdio: 'inherit',
    },
  );
  const result = await waitForExit(testProcess);
  exitCode = result.code ?? 1;
  if (exitCode === 0) {
    const before = await snapshot();
    await stopServer(server);
    server = startServer();
    await waitForServer(baseUrl, server);
    const after = await snapshot(before.cookie);
    assert.deepEqual(after.session, before.session, '重启后演示会话应继续有效');
    assert.deepEqual(
      after.stored,
      before.stored,
      '重启不能覆盖项目、回款、催缴、规则或审计',
    );
    assert.deepEqual(
      after.files,
      before.files,
      '重启后全部附件的 SHA-256 必须一致',
    );
    console.log(
      `✔ 重启持久化验证：${after.stored.projects.length} 个项目，${after.stored.receivables.length} 笔应收，${after.files.length} 份附件内容一致`,
    );
  }
} finally {
  await stopServer(server);
  await rm(statePath, { recursive: true, force: true });
}

process.exitCode = exitCode;
