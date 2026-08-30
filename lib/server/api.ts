import { ZodError } from 'zod';

import type { ApiFailure, ApiSuccess, FieldErrors, RowError } from '../types';

export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly fieldErrors?: FieldErrors,
    public readonly rowErrors?: RowError[],
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  const payload: ApiSuccess<T> = { ok: true, data };
  return Response.json(payload, init);
}

export function fail(
  code: string,
  message: string,
  status = 400,
  fieldErrors?: FieldErrors,
  rowErrors?: RowError[],
): Response {
  const payload: ApiFailure = {
    ok: false,
    code,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(rowErrors ? { rowErrors } : {}),
  };
  return Response.json(payload, { status });
}

export function routeError(error: unknown): Response {
  if (error instanceof BusinessError) {
    return fail(
      error.code,
      error.message,
      error.status,
      error.fieldErrors,
      error.rowErrors,
    );
  }
  if (error instanceof ZodError) {
    const fieldErrors: FieldErrors = {};
    for (const issue of error.issues) {
      const field = issue.path.join('.') || '_form';
      fieldErrors[field] ??= [];
      fieldErrors[field].push(issue.message);
    }
    return fail('VALIDATION_ERROR', '请检查填写内容', 400, fieldErrors);
  }
  console.error(error);
  return fail('INTERNAL_ERROR', '系统处理失败，请稍后重试', 500);
}
