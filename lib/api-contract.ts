import type { FieldErrors, RowError } from './types';

export interface ApiErrorDetail {
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
  rowErrors?: RowError[];
}
export type VersionedResponse<T> =
  | { success: true; data: T; error: null; meta: { apiVersion: 'v1' } }
  | {
      success: false;
      data: null;
      error: ApiErrorDetail;
      meta: { apiVersion: 'v1' };
    };

// Match path segments exactly. Never decode identifiers or change the trusted origin.
export function classifyApiPath(pathname: string) {
  const version =
    pathname === '/api/v1' || pathname.startsWith('/api/v1/') ? 'v1' : null;
  return {
    version,
    canonicalPath: version ? `/api${pathname.slice(7)}` : pathname,
  } as const;
}
