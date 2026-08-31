import { BusinessError, routeError } from './api';
import * as handler0 from './handlers/attachments-download';
import * as handler1 from './handlers/attachments';
import * as handler2 from './handlers/bootstrap';
import * as handler3 from './handlers/collections-correct';
import * as handler4 from './handlers/collections';
import * as handler5 from './handlers/imports-commit';
import * as handler6 from './handlers/imports-preview';
import * as handler7 from './handlers/projects';
import * as handler8 from './handlers/receipts-correct';
import * as handler9 from './handlers/receipts';
import * as handler10 from './handlers/receivables-confirm';
import * as handler11 from './handlers/receivables';
import * as handler12 from './handlers/risk-rules';
import * as handler13 from './handlers/session';

const handlers = new Map<string, (request: Request) => Promise<Response>>([
  ['POST /api/attachments', handler1.POST],
  ['GET /api/bootstrap', handler2.GET],
  ['POST /api/collections/correct', handler3.POST],
  ['POST /api/collections', handler4.POST],
  ['POST /api/imports/commit', handler5.POST],
  ['POST /api/imports/preview', handler6.POST],
  ['POST /api/projects', handler7.POST],
  ['POST /api/receipts/correct', handler8.POST],
  ['POST /api/receipts', handler9.POST],
  ['POST /api/receivables/confirm', handler10.POST],
  ['POST /api/receivables', handler11.POST],
  ['PUT /api/risk-rules', handler12.PUT],
  ['POST /api/session', handler13.POST],
]);
export async function dispatchBusiness(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname;
    const attachment = /^\/api\/attachments\/([^/]+)$/.exec(path);
    if (attachment && request.method === 'GET') {
      return handler0.GET(request, {
        params: Promise.resolve({ id: decodeURIComponent(attachment[1]) }),
      });
    }
    const handler = handlers.get(`${request.method} ${path}`);
    if (handler) return handler(request);
    const known = [...handlers.keys()].some((key) => key.endsWith(` ${path}`));
    throw new BusinessError(
      known ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND',
      known ? '不支持该请求方法' : '接口不存在',
      known ? 405 : 404,
    );
  } catch (error) {
    return routeError(error);
  }
}
