// Shared business handler: used by both Sites and the independent Node API.
import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { commitValidatedImport } from '@/lib/server/import-commit';
import { parseImportFile } from '@/lib/server/import-file';
import { validateImportRows } from '@/lib/server/imports';
import { requireSession } from '@/lib/server/session';
import { importCommitSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const contentType = request.headers.get('content-type') ?? '';
    const input = contentType.includes('multipart/form-data')
      ? await (async () => {
          const form = await request.formData();
          const file = form.get('file');
          const batchId = form.get('batchId');
          if (!(file instanceof File) || typeof batchId !== 'string')
            throw new BusinessError('IMPORT_FILE_REQUIRED', '缺少导入文件或批次');
          const parsed = await parseImportFile(file);
          return { ...parsed, batchId };
        })()
      : importCommitSchema.parse(await request.json());
    const batch = await getRawDb()
      .prepare(`SELECT kind, file_name AS fileName, status,
      created_by AS createdBy, district_id AS districtId FROM import_batches WHERE id = ?`)
      .bind(input.batchId)
      .first<{
        kind: string;
        fileName: string;
        status: string;
        createdBy: string;
        districtId: string | null;
      }>();
    if (!batch)
      throw new BusinessError('IMPORT_BATCH_NOT_FOUND', '导入预览已失效', 404);
    if (
      batch.createdBy !== session.id ||
      batch.districtId !== session.districtId
    ) {
      throw new BusinessError(
        'FORBIDDEN',
        '只能提交当前身份、当前区县创建的导入预览，请重新预览',
        403,
      );
    }
    if (batch.status !== 'PREVIEWED')
      throw new BusinessError(
        'IMPORT_ALREADY_COMMITTED',
        '该批次已提交，请刷新台账确认结果，不要重复导入',
        409,
      );
    if (batch.kind !== input.kind || batch.fileName !== input.fileName) {
      throw new BusinessError('IMPORT_BATCH_MISMATCH', '导入批次与文件不匹配');
    }
    const validation = await validateImportRows(
      input.kind,
      input.rows,
      session,
    );
    return ok(await commitValidatedImport(input, validation, session));
  } catch (error) {
    return routeError(error);
  }
}
