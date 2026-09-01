import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  access,
  appendFile,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
process.umask(0o077);
if (Number(process.versions.node.split('.')[0]) < 24)
  throw new Error('自托管服务需要 Node.js 24 或更新版本');
const runtimeDirectory = resolve('.selfhost');
const runtimeFile = join(runtimeDirectory, 'runtime.json');
const marker = `receivables-selfhost-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`;
const exec = promisify(execFile);
await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });

async function runningProcess() {
  try {
    const saved = JSON.parse(await readFile(runtimeFile, 'utf8'));
    if (
      saved.root !== root ||
      !Number.isSafeInteger(saved.pid) ||
      saved.pid < 1
    )
      return null;
    const result = await exec('ps', [
      '-p',
      String(saved.pid),
      '-o',
      'command=',
    ]);
    return result.stdout.includes(marker) ? saved : null;
  } catch {
    return null;
  }
}
if (process.argv.includes('--stop')) {
  const saved = await runningProcess();
  if (!saved) console.log('没有找到本项目正在运行的自托管服务。');
  else {
    process.kill(saved.pid, 'SIGTERM');
    console.log('已请求停止本项目服务和隧道。数据库、附件和备份不会删除。');
  }
  process.exit(0);
}
const running = await runningProcess();
if (running)
  throw new Error(
    `服务已在运行：${running.publicOrigin || running.localUrl}；请先 npm run selfhost:stop`,
  );
process.title = marker;
await access('.selfhost-build/web/index.html');
await access('.selfhost-build/api/server.mjs');
const webPort = Number(process.env.WEB_PORT || 4173),
  apiPort = Number(process.env.API_PORT || 4174);
if (
  ![webPort, apiPort].every(
    (port) => Number.isInteger(port) && port > 1024 && port < 65536,
  ) ||
  webPort === apiPort
)
  throw new Error('WEB_PORT/API_PORT 必须是不同的有效高位端口');
const localUrl = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env,
  WEB_PORT: String(webPort),
  API_PORT: String(apiPort),
  GATEWAY_TOKEN: randomBytes(32).toString('hex'),
};
const children = [];
let maintenance;
let shuttingDown = false;
let publicOrigin = process.env.PUBLIC_ORIGIN || null;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  maintenance?.close();
  await Promise.all(
    children.map(
      (child) =>
        new Promise((done) => {
          if (child.exitCode !== null || child.signalCode !== null)
            return done();
          child.once('exit', done);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null)
              child.kill('SIGKILL');
          }, 12_000).unref();
        }),
    ),
  );
  await writeFile(
    runtimeFile,
    JSON.stringify(
      {
        root,
        pid: process.pid,
        stoppedAt: new Date().toISOString(),
        localUrl,
        publicOrigin,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  process.exit(code);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
const recordChild = (child) => {
  children.push(child);
  child.once('error', (error) => {
    console.error(error.message);
    void shutdown(1);
  });
  child.once('exit', (code) => {
    if (!shuttingDown) {
      console.error(`服务进程退出（${code}），正在关闭其余进程。`);
      void shutdown(1);
    }
  });
  return child;
};

try {
  if (process.argv.includes('--public')) {
    const binary = resolve(process.env.CLOUDFLARED_BIN || '.tools/cloudflared');
    await access(binary);
    // A new temporary hostname is unknown until tunnel creation. Expose only a locked maintenance response first.
    maintenance = createServer((_request, response) => {
      response.writeHead(503, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('工作台正在启动，请稍后访问。');
    });
    await new Promise((ready, reject) => {
      maintenance.once('error', reject);
      maintenance.listen(webPort, '127.0.0.1', ready);
    });
    console.log('正在建立 HTTPS 隧道，入口暂时锁定。');
    const tunnel = recordChild(
      spawn(
        binary,
        [
          'tunnel',
          '--no-autoupdate',
          '--protocol',
          'http2',
          '--edge-ip-version',
          '4',
          '--url',
          localUrl,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
    publicOrigin = await new Promise((ready, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('隧道建立超时，请检查网络或使用本机地址')),
        45_000,
      );
      const inspect = (chunk) => {
        const line = String(chunk);
        void appendFile(join(runtimeDirectory, 'tunnel.log'), line, {
          mode: 0o600,
        });
        const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(line);
        if (match) {
          clearTimeout(timeout);
          ready(match[0]);
        }
      };
      tunnel.stdout.on('data', inspect);
      tunnel.stderr.on('data', inspect);
      tunnel.once('error', reject);
      tunnel.once('exit', () => reject(new Error('隧道进程提前退出')));
    });
    env.PUBLIC_ORIGIN = publicOrigin;
    await new Promise((ready) => maintenance.close(ready));
    maintenance = undefined;
  }
  await writeFile(
    runtimeFile,
    JSON.stringify(
      { root, pid: process.pid, localUrl, publicOrigin, phase: 'starting' },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  recordChild(
    spawn(process.execPath, ['.selfhost-build/api/server.mjs'], {
      env,
      stdio: 'inherit',
    }),
  );
  recordChild(
    spawn(process.execPath, ['.selfhost-build/gateway/server.mjs'], {
      env,
      stdio: 'inherit',
    }),
  );
  let ready = false;
  for (let attempt = 0; attempt < 100 && !shuttingDown; attempt++) {
    try {
      if (
        (
          await fetch(`${localUrl}/api/v1/health/ready`, {
            signal: AbortSignal.timeout(2000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {
      /* API still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('本机服务未就绪');
  const authCheck = await fetch(`${localUrl}/api/bootstrap`);
  if (authCheck.status !== 401)
    throw new Error('安全检查失败：未登录访问未被拒绝');
  await writeFile(
    runtimeFile,
    JSON.stringify(
      {
        root,
        pid: process.pid,
        localUrl,
        publicOrigin,
        phase: 'ready',
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    `\n本机访问：${localUrl}\n${publicOrigin ? `公网访问：${publicOrigin}\n临时隧道不保证在线，重新启动可能更换地址。` : '当前未建立公网隧道。'}\n账号由本机管理员开通；首次登录须修改初始密码。\n停止服务：npm run selfhost:stop（数据保留）`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
}
