// Shared business handler: used by both Sites and the independent Node API.
import { getRawDb } from '@/db/index';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { validateImportRows } from '@/lib/server/imports';
import { parseImportFile } from '@/lib/server/import-file';
import { requireSession } from '@/lib/server/session';
import { importPayloadSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const contentType = request.headers.get('content-type') ?? '';
    const input = contentType.includes('multipart/form-data')
      ? await (async () => {
          const form = await request.formData();
          const file = form.get('file');
          if (!(file instanceof File))
            throw new BusinessError('IMPORT_FILE_REQUIRED', '请选择要导入的 Excel 文件');
          return parseImportFile(file);
        })()
      : importPayloadSchema.parse(await request.json());
    const validation = await validateImportRows(
      input.kind,
      input.rows,
      session,
    );
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await getRawDb()
      .prepare(
        `INSERT INTO import_batches (
          id, kind, file_name, total_rows, valid_rows, invalid_rows,
          committed_rows, district_id, status, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PREVIEWED', ?, ?)`,
      )
      .bind(
        id,
        input.kind,
        input.fileName,
        input.rows.length,
        validation.validRows.length,
        validation.rowErrors.length,
        session.districtId,
        session.id,
        now,
      )
      .run();
    return ok({
      batchId: id,
      kind: input.kind,
      fileName: input.fileName,
      totalRows: input.rows.length,
      validRows: validation.validRows,
      rowErrors: validation.rowErrors,
    });
  } catch (error) {
    return routeError(error);
  }
}
