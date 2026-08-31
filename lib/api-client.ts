import type { ApiResponse } from './types';

let csrfToken: string | null = null;
export function setCsrfToken(value: string | null) {
  csrfToken = value;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (
    csrfToken &&
    !['GET', 'HEAD'].includes(init?.method?.toUpperCase() || 'GET')
  )
    headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    if (response.status === 413)
      throw new ApiClientError('单个附件不能超过 10MB', 'FILE_TOO_LARGE');
    throw new ApiClientError(
      response.ok ? '服务返回格式异常' : '服务暂时不可用，请稍后重试',
      'INVALID_RESPONSE',
    );
  }
  if (!payload.ok) {
    if (
      typeof window !== 'undefined' &&
      ['SESSION_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'].includes(payload.code)
    ) {
      window.dispatchEvent(new Event('receivables:authentication-required'));
    }
    throw new ApiClientError(
      payload.message,
      payload.code,
      payload.fieldErrors,
    );
  }
  return payload.data;
}
