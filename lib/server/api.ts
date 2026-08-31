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
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return Response.json(payload, { ...init, headers });
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
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function routeError(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return fail('INVALID_JSON', '请求内容格式不正确，请刷新后重试', 400);
  }
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
  const detail =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`
      : '';
  if (detail.includes('UNIQUE constraint failed: projects.contract_code')) {
    return fail('DUPLICATE_CONTRACT', '合同编码已存在，请检查', 409);
  }
  if (
    detail.includes(
      'UNIQUE constraint failed: receivables.project_id, receivables.sequence_no',
    )
  ) {
    return fail('DUPLICATE_NODE', '该项目的节点序号已存在', 409);
  }
  console.error(error);
  return fail('INTERNAL_ERROR', '系统处理失败，请稍后重试', 500);
}
