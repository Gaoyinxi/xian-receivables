// Shared business handler: used by both Sites and the independent Node API.
import { getRawDb } from '@/db/index';
import { ok, routeError } from '@/lib/server/api';
import { validateImportRows } from '@/lib/server/imports';
import { requireSession } from '@/lib/server/session';
import { importPayloadSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const input = importPayloadSchema.parse(await request.json());
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
