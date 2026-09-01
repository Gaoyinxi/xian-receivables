import { spawn } from 'node:child_process';
import { join } from 'node:path';

const binary = (name) => join(process.cwd(), 'node_modules', '.bin', name);
const checks = [
  ['类型检查', binary('tsc'), ['--noEmit']],
  ['代码检查', binary('oxlint'), []],
  [
    '单元与模板测试',
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      'tests/domain.test.ts',
      'tests/workbench.test.ts',
      'tests/templates.test.ts',
      'tests/project-lifecycle.test.ts',
      'tests/api-contract.test.ts',
      'tests/health.test.ts',
    ],
  ],
  [
    '完整流程、竞争和持久化测试',
    process.execPath,
    ['scripts/run-integration-tests.mjs'],
  ],
  ['生产构建', binary('vinext'), ['build']],
];
for (const [label, command, args] of checks) {
  console.log(`\n正在验证：${label}`);
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) {
    process.exitCode = code ?? 1;
    break;
  }
}
if (!process.exitCode)
  console.log('\n✓ 全部交付检查通过（不包含浏览器视觉或正式生产安全验收）');
