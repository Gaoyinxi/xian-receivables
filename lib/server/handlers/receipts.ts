// HTTP controller shared by Sites and the native API.
import { ok, routeError } from '@/lib/server/api';
import { requireSession } from '@/lib/server/session';
import { receiptCreateSchema } from '@/lib/validation';
import { createReceipt } from '@/lib/server/services/receipts';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = receiptCreateSchema.parse(await request.json());
    return ok(await createReceipt(session, input), { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
