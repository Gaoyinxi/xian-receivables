import { timingSafeEqual } from 'node:crypto';
import { ensureDatabase } from '../../../db/bootstrap';
import {
  getFilesBucket,
  getRawDb,
  isDemoSeedEnabled,
} from '../../../db/adapters/node';
import { dispatchBusiness } from '../../../lib/server/router';
import { BusinessError, routeError } from '../../../lib/server/api';
import { createFetchServer } from './http';
import { allowedOrigins, portFromEnv, requireGatewayToken } from './config';
import { initializeAuthSchema } from './auth-schema';
import { handleAuth, prepareLogin } from './auth';
import { requireSession, verifyCsrf } from './session';
import { acquireApiLock } from './process-lock';
import { createHealthHandler } from './health';

process.umask(0o077);
if (isDemoSeedEnabled() || process.env.DEMO_MODE || process.env.SEED_DEMO)
  throw new Error('正式 API 拒绝演示配置');
const origins = allowedOrigins();
const gatewayToken = Buffer.from(requireGatewayToken());
acquireApiLock();
await ensureDatabase();
await initializeAuthSchema();
if (
  !(await getRawDb()
    .prepare(
      "SELECT id FROM auth_users WHERE enabled = 1 AND role = 'CITY_ADMIN'",
    )
    .first())
) {
  throw new Error('尚未建立管理员账号，请先运行 npm run selfhost:init');
}
await prepareLogin();
const files = getFilesBucket();
const health = createHealthHandler(
  async () => {
    const schema = await getRawDb()
      .prepare(
        "SELECT 1 AS ready FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'",
      )
      .first<{ ready: number }>();
    if (schema?.ready !== 1) throw new Error('database schema unavailable');
    await files.checkReady();
  },
  () => console.error(JSON.stringify({ event: 'health_readiness_failed' })),
);

const server = createFetchServer(
  async (request) => {
    try {
      const path = new URL(request.url).pathname;
      const healthResponse = await health(request);
      if (healthResponse) return healthResponse;
      const mutation = !['GET', 'HEAD'].includes(request.method);
      if (mutation) {
        if (
          !origins.includes(request.headers.get('origin') || '') ||
          request.headers.get('origin') !== new URL(request.url).origin ||
          request.headers.get('sec-fetch-site') === 'cross-site'
        ) {
          throw new BusinessError('ORIGIN_REJECTED', '请求来源不被允许', 403);
        }
        const type = request.headers.get('content-type')?.split(';')[0].trim();
        const multipart =
          path === '/api/attachments' || path === '/api/imports/preview';
        if (
          type !== 'application/json' &&
          !(multipart && type === 'multipart/form-data')
        )
          throw new BusinessError(
            'UNSUPPORTED_CONTENT_TYPE',
            '请求格式不被支持',
            415,
          );
        if (path !== '/api/auth/login') await verifyCsrf(request);
      }
      if (path.startsWith('/api/auth/')) return handleAuth(request);
      // Default-deny boundary, in addition to each business handler's role and district checks.
      await requireSession(request);
      return dispatchBusiness(request);
    } catch (error) {
      return routeError(error);
    }
  },
  (incoming) => {
    const supplied = Buffer.from(
      String(incoming.headers['x-receivables-gateway'] || ''),
    );
    if (
      supplied.length !== gatewayToken.length ||
      !timingSafeEqual(supplied, gatewayToken)
    )
      throw new BusinessError(
        'GATEWAY_REQUIRED',
        '仅允许从受信网页网关访问',
        403,
      );
    const origin = incoming.headers['x-receivables-origin'];
    if (typeof origin !== 'string' || !origins.includes(origin))
      throw new BusinessError('ORIGIN_REJECTED', '网关来源无效', 403);
    return origin;
  },
);

const port = portFromEnv('API_PORT', 4174);
server.listen(port, '127.0.0.1', () =>
  console.log(`API ready: http://127.0.0.1:${port} (gateway only)`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    server.close(() => {
      getRawDb().close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
