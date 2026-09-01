// HTTP controller shared by Sites and the native API.
import { ok, routeError } from '@/lib/server/api';
import { requireSession } from '@/lib/server/session';
import { receiptCorrectSchema } from '@/lib/validation';
import { correctReceipt } from '@/lib/server/services/receipts-correct';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = receiptCorrectSchema.parse(await request.json());
    return ok(await correctReceipt(session, input));
  } catch (error) {
    return routeError(error);
  }
}
