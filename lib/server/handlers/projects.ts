// HTTP controller shared by Sites and the native API.
import { ok, routeError } from '@/lib/server/api';
import { requireSession } from '@/lib/server/session';
import { projectCreateSchema } from '@/lib/validation';
import { createProject } from '@/lib/server/services/projects';
import { assertCanManageProject } from '@/lib/server/authz';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertCanManageProject(session);
    const input = projectCreateSchema.parse(await request.json());
    return ok(await createProject(session, input), { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
