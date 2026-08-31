import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { dataDirectory } from './config';

export function assertApiStopped() {
  const path = join(dataDirectory(), 'api.lock');
  if (!existsSync(path)) return;
  const pid = Number(readFileSync(path, 'utf8'));
  if (!Number.isSafeInteger(pid) || pid < 1)
    throw new Error('API 锁文件异常，请先检查运行进程');
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw error;
  }
  throw new Error(
    'API 正在运行，请先停止服务再备份/恢复，防止备份期间发生写入',
  );
}

export function acquireApiLock() {
  const path = join(dataDirectory(), 'api.lock');
  assertApiStopped();
  if (existsSync(path)) unlinkSync(path); // Only a validated stale process marker, never business data.
  writeFileSync(path, String(process.pid), { flag: 'wx', mode: 0o600 });
  process.once('exit', () => {
    if (existsSync(path) && readFileSync(path, 'utf8') === String(process.pid))
      unlinkSync(path);
  });
}
