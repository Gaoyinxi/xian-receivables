import { dispatchBusiness } from '@/lib/server/router';
import { versionedHandler } from '@/lib/server/versioned-api';

export const dynamic = 'force-dynamic';
const dispatch = (request: Request) => versionedHandler(request, dispatchBusiness);
export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as PATCH, dispatch as DELETE, dispatch as HEAD, dispatch as OPTIONS };
