// Shared business handler: used by both Sites and the independent Node API.
import { getFilesBucket } from '@/db/index';
import { BusinessError, routeError } from '@/lib/server/api';
import { assertCanRead } from '@/lib/server/authz';
import { getAttachmentScope } from '@/lib/server/data';
import { requireSession } from '@/lib/server/session';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const attachment = await getAttachmentScope(id);
    assertCanRead(session, attachment.districtId);
    const object = await getFilesBucket().get(attachment.objectKey);
    if (!object) {
      throw new BusinessError(
        'ATTACHMENT_CONTENT_MISSING',
        '附件内容不存在',
        404,
      );
    }
    return new Response(object.body, {
      headers: {
        'Content-Type': attachment.contentType,
        'Content-Length': String(object.size),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
          attachment.fileName,
        )}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
