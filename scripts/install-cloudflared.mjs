import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  copyFile,
  chmod,
  rm,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { constants } from 'node:fs';

if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error(
    '本脚本适用于当前 Apple Silicon Mac；其他平台请使用 Cloudflare 官方安装说明。',
  );
const exec = promisify(execFile);
const scratch = await mkdtemp(join(tmpdir(), 'receivables-cloudflared-'));
try {
  const { stdout } = await exec('gh', [
    'api',
    'repos/cloudflare/cloudflared/releases/latest',
  ]);
  const release = JSON.parse(stdout);
  const asset = release.assets.find(
    (item) => item.name === 'cloudflared-darwin-arm64.tgz',
  );
  if (!asset?.digest?.startsWith('sha256:'))
    throw new Error('官方发布未提供 SHA-256 摘要，已停止安装');
  const archive = join(scratch, asset.name);
  await exec('gh', [
    'release',
    'download',
    release.tag_name,
    '--repo',
    'cloudflare/cloudflared',
    '--pattern',
    asset.name,
    '--dir',
    scratch,
  ]);
  const actual = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  if (`sha256:${actual}` !== asset.digest)
    throw new Error('官方发布包校验和不匹配，已停止安装');
  const { stdout: names } = await exec('tar', ['-tzf', archive]);
  if (
    !names
      .trim()
      .split('\n')
      .every((name) => name === 'cloudflared')
  )
    throw new Error('发布包文件列表不符合预期');
  await exec('tar', ['-xzf', archive, '-C', scratch, 'cloudflared']);
  const directory = resolve('.tools');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = join(directory, 'cloudflared');
  await copyFile(
    join(scratch, 'cloudflared'),
    destination,
    constants.COPYFILE_EXCL,
  );
  await chmod(destination, 0o700);
  await writeFile(
    join(directory, 'cloudflared-version.json'),
    JSON.stringify(
      {
        version: release.tag_name,
        digest: asset.digest,
        source: asset.browser_download_url,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `已安装官方 cloudflared ${release.tag_name}，SHA-256 校验通过。仅安装到本项目 .tools，不改动系统目录。`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
