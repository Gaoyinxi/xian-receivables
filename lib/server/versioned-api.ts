import { classifyApiPath, type VersionedResponse } from '../api-contract';
import type { ApiResponse } from '../types';
import { routeError } from './api';

export function canonicalRequest(request: Request): Request {
  const url = new URL(request.url);
  const { version, canonicalPath } = classifyApiPath(url.pathname);
  if (!version) return request;
  url.pathname = canonicalPath;
  return new Request(url, request);
}

export async function finalizeApiResponse(
  pathname: string,
  response: Response,
  method = 'GET',
): Promise<Response> {
  const { version, canonicalPath } = classifyApiPath(pathname);
  if (!version) return response;
  if (method === 'HEAD' || [204, 304].includes(response.status))
    return response;
  // Successful downloads are opaque bytes, even if their content type is JSON.
  if (response.ok && /^\/api\/attachments\/[^/]+$/.test(canonicalPath))
    return response;
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    /* gateway/transport error */
  }
  if (body && typeof body === 'object' && 'success' in body && 'meta' in body)
    return response;
  const legacy = body as ApiResponse<unknown> | undefined;
  let payload: VersionedResponse<unknown>;
  if (legacy && legacy.ok === true && response.ok) {
    payload = {
      success: true,
      data: legacy.data,
      error: null,
      meta: { apiVersion: 'v1' },
    };
  } else {
    const failure = legacy && legacy.ok === false ? legacy : null;
    payload = {
      success: false,
      data: null,
      error: failure
        ? {
            code: failure.code,
            message: failure.message,
            ...(failure.fieldErrors
              ? { fieldErrors: failure.fieldErrors }
              : {}),
            ...(failure.rowErrors ? { rowErrors: failure.rowErrors } : {}),
          }
        : {
            code:
              response.status === 503
                ? 'SERVICE_UNAVAILABLE'
                : 'INVALID_RESPONSE',
            message: '服务暂时不可用，请稍后重试',
          },
      meta: { apiVersion: 'v1' },
    };
  }
  const headers = new Headers(response.headers);
  for (const name of ['content-length', 'etag', 'content-encoding'])
    headers.delete(name);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return Response.json(payload, {
    status: response.ok && !payload.success ? 502 : response.status,
    headers,
  });
}

// Framework boundary. Native HTTP applies the same finalizer around early transport errors too.
export async function versionedHandler(
  request: Request,
  handler: (request: Request) => Promise<Response>,
) {
  let response: Response;
  try {
    response = await handler(canonicalRequest(request));
  } catch (error) {
    response = routeError(error);
  }
  return finalizeApiResponse(
    new URL(request.url).pathname,
    response,
    request.method,
  );
}
