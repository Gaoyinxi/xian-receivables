// Isolated legacy-business regression entry. Never included in the production API build.
import { basename, dirname } from 'node:path';
import { dispatchBusiness } from '../../lib/server/router';
import { createFetchServer } from '../../apps/api/src/http';
import { getRawDb } from '../../db/adapters/node';

const url = new URL(process.env.TEST_BASE_URL!);
if (
  url.hostname !== '127.0.0.1' ||
  !process.env.RECEIVABLES_DATA_DIR ||
  !basename(dirname(process.env.RECEIVABLES_DATA_DIR)).startsWith(
    'receivables-integration-',
  )
) {
  throw new Error('仅允许测试运行器创建的 loopback 临时环境');
}
const server = createFetchServer(dispatchBusiness, () => url.origin);
server.listen(Number(url.port), '127.0.0.1', () =>
  console.log(`SQLite regression server: ${url.origin}`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () =>
    server.close(() => {
      getRawDb().close();
      process.exit(0);
    }),
  );
