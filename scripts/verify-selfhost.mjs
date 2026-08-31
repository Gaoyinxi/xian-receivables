import { spawn } from 'node:child_process';
import { join } from 'node:path';

const run = async (label, command, args) => {
  console.log(`\n检查：${label}`);
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) process.exit(code || 1);
};
const binary = (name) => join(process.cwd(), 'node_modules', '.bin', name);
await run('类型检查', binary('tsc'), ['--noEmit']);
await run('代码检查', binary('oxlint'), ['--deny-warnings']);
if (process.argv.includes('--reuse-build')) {
  console.log('复用已完成的构建，不改动正在提供服务的产物；后续测试均使用隔离临时数据库。');
} else {
  await run('前端 / API / 网关构建', process.execPath, ['scripts/build-selfhost.mjs']);
}
await run('单元、真实 Excel 与存储适配器', process.execPath, [
  '--import',
  'tsx',
  '--test',
  'tests/domain.test.ts',
  'tests/workbench.test.ts',
  'tests/templates.test.ts',
  'tests/node-adapter.test.ts',
]);
await run('隔离原生 SQLite 测试构建', binary('vite'), [
  'build',
  '--config',
  'apps/api/vite.config.ts',
  '--mode',
  'integrity-test',
]);
await run('原业务、并发与重启回归', process.execPath, [
  'scripts/run-integration-tests.mjs',
  '--node',
]);
await run('正式认证、权限、网关和恢复', process.execPath, [
  '--import',
  'tsx',
  '--test',
  '--test-concurrency=1',
  'tests/selfhost.test.ts',
]);
console.log('\n✓ 自托管交付检查全部通过（不含外部安全审计或可用性承诺）');
