import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  chmod,
  readdir,
  realpath,
} from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { constants } from 'node:fs';
import { dataDirectory } from './config';
import { assertApiStopped } from './process-lock';
import { LocalFiles } from '../../../db/adapters/node';

process.umask(0o077);
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const [command = 'backup', sourceArg, targetArg] = process.argv.slice(2);
type Manifest = {
  version: 1;
  createdAt: string;
  databaseSha256: string;
  files: { key: string; name: string; sha256: string; size: number }[];
};

try {
  if (command === 'backup') {
    assertApiStopped();
    const directory = dataDirectory();
    const target = join(
      directory,
      'backups',
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(join(target, 'files'), { recursive: true, mode: 0o700 });
    const source = new DatabaseSync(join(directory, 'receivables.sqlite'), {
      readOnly: true,
    });
    try {
      await backup(source, join(target, 'receivables.sqlite'));
    } finally {
      source.close();
    }
    await chmod(join(target, 'receivables.sqlite'), 0o600);
    const snapshot = new DatabaseSync(join(target, 'receivables.sqlite'), {
      readOnly: true,
    });
    const files: Manifest['files'] = [];
    const storage = new LocalFiles(join(directory, 'files'));
    try {
      for (const row of snapshot
        .prepare('SELECT object_key AS key FROM attachments ORDER BY id')
        .all() as { key: string }[]) {
        const object = await storage.get(row.key);
        if (!object) throw new Error('备份中止：数据库引用的附件缺失');
        const name = `${createHash('sha256').update(row.key).digest('hex')}.blob`;
        await writeFile(join(target, 'files', name), object.body, {
          flag: 'wx',
          mode: 0o600,
        });
        files.push({
          key: row.key,
          name,
          sha256: digest(object.body),
          size: object.size,
        });
      }
      const check = snapshot.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      if (check.integrity_check !== 'ok')
        throw new Error('数据库完整性检查未通过');
    } finally {
      snapshot.close();
    }
    const manifest: Manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      databaseSha256: digest(
        await readFile(join(target, 'receivables.sqlite')),
      ),
      files,
    };
    await writeFile(
      join(target, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      `备份完成：${target}\n附件 ${files.length} 个，数据库完整性检查通过。备份含财务记录与密码哈希，请妥善保管。`,
    );
  } else if (command === 'restore') {
    assertApiStopped();
    if (!sourceArg || !targetArg)
      throw new Error('用法：restore <备份目录> <新的空目录>；不会覆盖原库');
    const source = await realpath(resolve(sourceArg));
    const target = resolve(targetArg);
    if (
      target === dataDirectory() ||
      source === target ||
      source.startsWith(target + sep) ||
      target.startsWith(source + sep)
    )
      throw new Error('必须恢复到独立的新目录');
    try {
      if ((await readdir(target)).length) throw new Error('恢复目标不是空目录');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const manifest = JSON.parse(
      await readFile(join(source, 'manifest.json'), 'utf8'),
    ) as Manifest;
    if (manifest.version !== 1 || !Array.isArray(manifest.files))
      throw new Error('备份版本不受支持');
    const database = await readFile(join(source, 'receivables.sqlite'));
    if (digest(database) !== manifest.databaseSha256)
      throw new Error('数据库校验和不匹配');
    // Validate every file before writing a target. Filenames are verified, not trusted from the manifest.
    for (const file of manifest.files) {
      const expected = `${createHash('sha256').update(file.key).digest('hex')}.blob`;
      if (file.name !== expected) throw new Error('备份附件路径异常');
      const content = await readFile(join(source, 'files', expected));
      if (content.length !== file.size || digest(content) !== file.sha256)
        throw new Error('备份附件校验和不匹配');
    }
    await mkdir(join(target, 'files'), { recursive: true, mode: 0o700 });
    await writeFile(join(target, 'receivables.sqlite'), database, {
      flag: 'wx',
      mode: 0o600,
    });
    for (const file of manifest.files) {
      await copyFile(
        join(source, 'files', file.name),
        join(target, 'files', file.name),
        constants.COPYFILE_EXCL,
      );
      await chmod(join(target, 'files', file.name), 0o600);
    }
    const restored = new DatabaseSync(join(target, 'receivables.sqlite'));
    try {
      const check = restored.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      if (check.integrity_check !== 'ok')
        throw new Error('恢复后的数据库完整性检查失败');
      restored.exec(
        'DELETE FROM auth_sessions; DELETE FROM auth_login_limits;',
      );
    } finally {
      restored.close();
    }
    console.log(
      `已恢复到：${target}\n旧数据库未修改，所有旧会话已撤销。启动时设置 RECEIVABLES_DATA_DIR 指向新目录。`,
    );
  } else throw new Error('支持 backup 或 restore');
} catch (error) {
  console.error(error instanceof Error ? error.message : '备份操作失败');
  process.exitCode = 1;
}
