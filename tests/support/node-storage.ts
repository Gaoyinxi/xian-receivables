import { basename, dirname } from 'node:path';
export { getRawDb, getFilesBucket } from '../../db/adapters/node';
export function isDemoSeedEnabled() {
  if (
    !process.env.RECEIVABLES_DATA_DIR ||
    !basename(dirname(process.env.RECEIVABLES_DATA_DIR)).startsWith(
      'receivables-integration-',
    )
  ) {
    throw new Error('测试种子只能在测试运行器创建的临时目录中启用');
  }
  return true;
}
