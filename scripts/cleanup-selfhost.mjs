import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const projectRoot = process.cwd();
const dataDirectory = resolve(
  process.env.RECEIVABLES_DATA_DIR ?? join(projectRoot, '.data', 'selfhost'),
);
const backupDirectory = join(dataDirectory, 'backups');
const runtimeFile = join(projectRoot, '.selfhost', 'runtime.json');
const apply = process.argv.includes('--apply');
const keepArg = process.argv.find((value) => value.startsWith('--keep='));
const keep = Math.max(
  1,
  Number.parseInt(keepArg?.slice('--keep='.length) ?? '3', 10),
);

if (!Number.isFinite(keep)) throw new Error('--keep 必须是正整数');

async function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function assertSelfhostStopped() {
  try {
    const runtime = JSON.parse(await readFile(runtimeFile, 'utf8'));
    if (Number.isInteger(runtime.pid) && (await isRunning(runtime.pid))) {
      throw new Error(
        `自托管服务仍在运行（PID ${runtime.pid}），请先执行 pnpm run selfhost:stop`,
      );
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function listBackups() {
  try {
    const entries = await readdir(backupDirectory, { withFileTypes: true });
    const backups = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const path = join(backupDirectory, entry.name);
      const metadata = await stat(path);
      backups.push({ name: entry.name, path, mtime: metadata.mtimeMs });
    }
    return backups.sort((a, b) => b.mtime - a.mtime);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

await assertSelfhostStopped();
const backups = await listBackups();
const stale = backups.slice(keep);
console.log(`备份目录：${backupDirectory}`);
console.log(
  `当前备份：${backups.length} 份；保留：${Math.min(keep, backups.length)} 份；待清理：${stale.length} 份`,
);
for (const backup of stale) console.log(`- ${apply ? '删除' : '可清理'} ${backup.path}`);

if (!apply) {
  console.log(
    '预览模式：确认无误后执行 pnpm run selfhost:cleanup -- --apply --keep=3',
  );
  process.exit(0);
}

for (const backup of stale) await rm(backup.path, { recursive: true, force: true });
console.log(stale.length ? '清理完成。' : '没有需要清理的备份。');
