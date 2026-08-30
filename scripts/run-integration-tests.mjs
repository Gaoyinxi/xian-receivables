import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const statePath = await mkdtemp(join(tmpdir(), 'receivables-integration-'));
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const testEnvironment = {
  ...process.env,
  RECEIVABLES_STATE_PATH: statePath,
  TEST_BASE_URL: baseUrl,
};

const server = spawn(
  vinextExecutable,
  ['dev', '--host', '127.0.0.1', '--port', String(port)],
  {
    cwd: projectRoot,
    env: testEnvironment,
    stdio: 'inherit',
  },
);

let exitCode = 1;
try {
  await waitForServer(baseUrl, server);
  const testProcess = spawn(
    process.execPath,
    ['--import', 'tsx', '--test', 'tests/api-flow.test.ts'],
    {
      cwd: projectRoot,
      env: testEnvironment,
      stdio: 'inherit',
    },
  );
  const result = await waitForExit(testProcess);
  exitCode = result.code ?? 1;
} finally {
  await stopServer(server);
  await rm(statePath, { recursive: true, force: true });
}

process.exitCode = exitCode;
