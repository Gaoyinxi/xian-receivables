import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const vite = join(process.cwd(), 'node_modules/vite/bin/vite.js');
const buildId = `R${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex').toUpperCase()}`;
const env = { ...process.env, RECEIVABLES_BUILD_ID: buildId };
for (const config of [
  'apps/web/vite.config.ts',
  'apps/api/vite.config.ts',
  'apps/web-server/vite.config.ts',
]) {
  const child = spawn(process.execPath, [vite, 'build', '--config', config], {
    stdio: 'inherit',
    env,
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) {
    process.exitCode = code || 1;
    break;
  }
}
