import { spawn } from 'node:child_process';
import { join } from 'node:path';

const vite = join(process.cwd(), 'node_modules/vite/bin/vite.js');
for (const config of [
  'apps/web/vite.config.ts',
  'apps/api/vite.config.ts',
  'apps/web-server/vite.config.ts',
]) {
  const child = spawn(process.execPath, [vite, 'build', '--config', config], {
    stdio: 'inherit',
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
