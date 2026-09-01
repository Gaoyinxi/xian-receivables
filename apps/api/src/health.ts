import { fail, ok } from '../../../lib/server/api';

const readinessPaths = new Set(['/api/health', '/api/health/ready']);

export function createHealthHandler(
  checkReady: () => Promise<void>,
  reportFailure: () => void = () => undefined,
) {
  return async (request: Request): Promise<Response | null> => {
    if (request.method !== 'GET') return null;
    const path = new URL(request.url).pathname;
    if (path === '/api/health/live') {
      return ok({ status: 'live', mode: 'selfhost' });
    }
    if (!readinessPaths.has(path)) return null;
    try {
      await checkReady();
      return ok({ status: 'ready', mode: 'selfhost' });
    } catch {
      reportFailure();
      return fail('SERVICE_NOT_READY', '服务尚未就绪', 503);
    }
  };
}
