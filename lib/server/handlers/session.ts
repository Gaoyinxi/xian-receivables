// Shared business handler: used by both Sites and the independent Node API.
import { ok, routeError } from '@/lib/server/api';
import { switchDemoSession } from '@/lib/server/session';
import { sessionSwitchSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const input = sessionSwitchSchema.parse(await request.json());
    const { session, cookie } = await switchDemoSession(
      request,
      input.role,
      input.districtCode,
    );
    return ok(session, {
      headers: { 'Set-Cookie': cookie },
    });
  } catch (error) {
    return routeError(error);
  }
}
