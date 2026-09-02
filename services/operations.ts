import { apiRequest } from '@/lib/api-client';
import type { ImportKind, RiskRuleRecord, RowError } from '@/lib/types';

// Form values are transport input (including strings). Existing Zod schemas own
// validation and yuan -> cents conversion on the server, exactly once.
type FormInput = Record<string, unknown>;
const post = <T>(path: string, input: FormInput) =>
  apiRequest<T>(`/api/v1/${path}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const projectService = {
  create: (input: FormInput) =>
    post<{ id: string; projectCode: string }>('projects', input),
  addNode: (input: FormInput) =>
    post<{ id: string; receivableCode: string; dueDate: string }>(
      'receivables',
      input,
    ),
};
export const receiptService = {
  create: (input: FormInput) => post<{ id: string }>('receipts', input),
  correct: (input: FormInput) =>
    post<{ voidedId: string; replacementId: string }>(
      'receipts/correct',
      input,
    ),
};
export const collectionService = {
  create: (input: FormInput) => post<{ id: string }>('collections', input),
  correct: (input: FormInput) =>
    post<{ voidedId: string; replacementId: string }>(
      'collections/correct',
      input,
    ),
};
export const riskService = {
  update: (input: FormInput) =>
    apiRequest<RiskRuleRecord>('/api/v1/risk-rules', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
export interface ImportPreview {
  batchId: string;
  kind: ImportKind;
  fileName: string;
  totalRows: number;
  validRows: Array<Record<string, unknown>>;
  rowErrors: RowError[];
}
export const importService = {
  preview: (input: FormInput) => post<ImportPreview>('imports/preview', input),
  previewFile: (file: File) => {
    const body = new FormData();
    body.set('file', file);
    return apiRequest<ImportPreview>('/api/v1/imports/preview', {
      method: 'POST',
      body,
    });
  },
  commit: (input: FormInput) =>
    post<{ committedRows: number; rowErrors: RowError[] }>(
      'imports/commit',
      input,
    ),
  commitFile: (input: { batchId: string; file: File }) => {
    const body = new FormData();
    body.set('batchId', input.batchId);
    body.set('file', input.file);
    return apiRequest<{ committedRows: number; rowErrors: RowError[] }>(
      '/api/v1/imports/commit',
      { method: 'POST', body },
    );
  },
};
