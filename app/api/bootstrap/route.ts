import { ok, routeError } from '@/lib/server/api';
import { getBootstrapData } from '@/lib/server/data';
import { getOrCreateSession } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { session, cookie } = await getOrCreateSession(request);
    const data = await getBootstrapData(session);
    return ok(data, cookie ? { headers: { 'Set-Cookie': cookie } } : undefined);
  } catch (error) {
    return routeError(error);
  }
}
