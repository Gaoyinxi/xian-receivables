import type { ApiResponse, RowError } from './types';
import type { VersionedResponse } from './api-contract';

let csrfToken: string | null = null;
let identityEpoch = 0;
export function setCsrfToken(value: string | null) {
  identityEpoch++;
  csrfToken = value;
}
export function invalidateIdentityRequests() {
  identityEpoch++;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string[]>,
    public readonly status = 0,
    public readonly rowErrors?: RowError[],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const epoch = identityEpoch;
  const mutation = !['GET', 'HEAD'].includes(
    init?.method?.toUpperCase() || 'GET',
  );
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (
    csrfToken &&
    !['GET', 'HEAD'].includes(init?.method?.toUpperCase() || 'GET')
  )
    headers.set('X-CSRF-Token', csrfToken);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      // Aborting a write does not cancel the server transaction. Preserve the
      // original write lifetime until durable idempotency is available.
      signal: mutation
        ? init?.signal
        : init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiClientError(
      mutation
        ? '连接中断，提交结果尚未确认。请刷新台账核对，勿重复提交。'
        : '无法连接服务器，请检查网络后重新加载',
      'NETWORK_ERROR',
    );
  }
  let payload: ApiResponse<T>;
  try {
    const body = (await response.json()) as
      | ApiResponse<T>
      | VersionedResponse<T>;
    if (!body || typeof body !== 'object') throw new Error('Invalid envelope');
    if ('success' in body && typeof body.success === 'boolean') {
      payload = body.success
        ? { ok: true, data: body.data }
        : { ok: false, ...body.error };
    } else if ('ok' in body && typeof body.ok === 'boolean') payload = body;
    else throw new Error('Invalid envelope');
    if (
      !payload.ok &&
      (typeof payload.code !== 'string' || typeof payload.message !== 'string')
    )
      throw new Error('Invalid error');
  } catch {
    if (response.status === 413)
      throw new ApiClientError(
        '单个附件不能超过 10MB',
        'FILE_TOO_LARGE',
        undefined,
        413,
      );
    throw new ApiClientError(
      response.ok ? '服务返回格式异常' : '服务暂时不可用，请稍后重试',
      'INVALID_RESPONSE',
      undefined,
      response.status,
    );
  }
  if (!payload.ok) {
    if (
      typeof window !== 'undefined' &&
      epoch === identityEpoch &&
      !init?.signal?.aborted &&
      ['SESSION_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'].includes(payload.code)
    ) {
      window.dispatchEvent(new Event('receivables:authentication-required'));
    }
    throw new ApiClientError(
      payload.message,
      payload.code,
      payload.fieldErrors,
      response.status,
      payload.rowErrors,
    );
  }
  if (!response.ok)
    throw new ApiClientError(
      '服务返回状态异常，请刷新后重试',
      'INVALID_RESPONSE',
      undefined,
      response.status,
    );
  return payload.data;
}
