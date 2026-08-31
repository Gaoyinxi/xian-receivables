// Shared business handler: used by both Sites and the independent Node API.
import { getFilesBucket, getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import {
  assertCanCreateOperational,
  assertCanManageProject,
} from '@/lib/server/authz';
import { getProjectScope, getReceivableScope } from '@/lib/server/data';
import { auditStatement } from '@/lib/server/mutations';
import { requireSession } from '@/lib/server/session';

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const ALLOWED_ENTITY_TYPES = new Set(['PROJECT', 'RECEIPT', 'COLLECTION']);

function safeFileName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-120);
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const form = await request.formData();
    const file = form.get('file');
    const rawEntityType = form.get('entityType');
    const rawEntityId = form.get('entityId');
    const entityType = typeof rawEntityType === 'string' ? rawEntityType : '';
    let entityId = typeof rawEntityId === 'string' ? rawEntityId : '';
    if (!(file instanceof File)) {
      throw new BusinessError('FILE_REQUIRED', '请选择要上传的附件');
    }
    if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
      throw new BusinessError('INVALID_ENTITY', '附件归属类型无效');
    }
    if (!entityId) {
      throw new BusinessError('ENTITY_REQUIRED', '缺少附件归属记录');
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new BusinessError(
        'UNSUPPORTED_FILE_TYPE',
        '仅支持 PDF、JPG、PNG 格式',
        415,
      );
    }
    if (file.size <= 0 || file.size > MAX_SIZE) {
      throw new BusinessError('FILE_TOO_LARGE', '单个附件不能超过 10MB', 413);
    }

    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const expected =
      file.type === 'application/pdf'
        ? [37, 80, 68, 70, 45]
        : file.type === 'image/png'
          ? [137, 80, 78, 71, 13, 10, 26, 10]
          : [255, 216, 255];
    if (!expected.every((byte, index) => signature[index] === byte)) {
      throw new BusinessError(
        'UNSUPPORTED_FILE_TYPE',
        '文件内容与 PDF、JPG、PNG 格式不符，请重新选择',
        415,
      );
    }
    let districtId: string;
    if (entityType === 'PROJECT') {
      assertCanManageProject(session);
      const scope = await getProjectScope(entityId);
      districtId = scope.districtId;
      entityId = scope.id;
    } else {
      const scope = await getReceivableScope(entityId);
      assertCanCreateOperational(session, scope.districtId);
      districtId = scope.districtId;
      entityId = scope.id;
    }

    const id = crypto.randomUUID();
    const cleanedName = safeFileName(file.name) || 'attachment';
    const objectKey = `attachments/${entityType.toLowerCase()}/${entityId}/${id}-${cleanedName}`;
    const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    const bucket = getFilesBucket();
    await bucket.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType },
      customMetadata: {
        originalName: file.name,
        uploadedBy: session.displayName,
      },
    });
    const now = new Date().toISOString();
    try {
      const db = getRawDb();
      await db.batch([
        db
          .prepare(
            `INSERT INTO attachments (
            id, entity_type, entity_id, object_key, file_name, content_type,
            size_bytes, uploaded_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            entityType,
            entityId,
            objectKey,
            file.name,
            contentType,
            file.size,
            session.id,
            now,
          ),
        auditStatement({
          districtId,
          entityType: 'ATTACHMENT',
          entityId: id,
          action: 'UPLOAD',
          newValue: {
            entityType,
            entityId,
            fileName: file.name,
            sizeBytes: file.size,
          },
          source: 'UPLOAD',
          actorRole: session.role,
          actorName: session.displayName,
        }),
      ]);
    } catch (error) {
      await bucket.delete(objectKey);
      throw error;
    }
    return ok(
      {
        id,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}
